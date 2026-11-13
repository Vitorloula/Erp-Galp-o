# Guia de Testes — ERP Galpão

## 1. Estado atual (12/11/2026)

| Comando | Exit | Resultado |
|---|---|---|
| `npm run lint` (`tsc -p . --noEmit`) | 0 | sem erros de tipo |
| `npm test` (Vitest) | 0 | **124/124** em 13 arquivos |
| `npm run test:sql` (PGlite) | 0 | **265/265** verificações |
| `npm run build` | 0 | `tsc` + Vite + PWA |
| `npx tsc -p e2e --noEmit` | 0 | specs e helpers E2E |
| Playwright direcionado | 0 | **38 passaram, 2 pulados** — resultado 5, relatórios 6 e painel-estoque 9 (20 por projeto × computador e celular; o pulado é um teste de saída já pulado no celular). Rodada completa do ciclo: **66 passaram, 2 pulados** (com produtos e PDV) |

Laudo da última rodada (custo e lucro, T-036): `memoria/laudo-custo-lucro.md` — **aprovado, sem
defeito aberto** (a margem com casa decimal saiu com vírgula no Painel, nos Relatórios, no Excel
e no PDF; ver o mesmo laudo, D-1).

O E2E completo roda no CI com **retries** e **2 workers**. Localmente, para investigar
falhas, use `--workers=1` e um projeto por vez:

```powershell
npx playwright test e2e/app/importar.spec.ts --project=app-computador --workers=1
```

## 2. Comandos obrigatórios (ordem)

```powershell
npm run lint
npm test
npm run test:sql
npm run build
npm run test:e2e:smoke   # fluxos principais
npm run test:e2e:ci      # CI, com retries
```

`npm run test:tudo` encadeia build + testes unitários + SQL + E2E.

## 3. Cobertura por área

### Regras puras (Vitest)

- `src/lib/regras.test.ts`: alertas de validade, FEFO, reposição, filtros e períodos.
- `src/lib/relatorio.test.ts` e `exportar/`: Excel/PDF e filtros do relatório.
- `src/lib/resultado.test.ts` (T-036): faturamento só de venda concluída, CMV por custo do
  snapshot, item sem custo fora do CMV e contabilizado no aviso, margem com faturamento 0 e
  agregação de dois itens do mesmo produto.
- `src/lib/importacao.test.ts`: CSV com `;`, vírgula e tab, aspas/quebra de linha,
  números brasileiros, datas, aliases de cabeçalho, duplicidade e modelo.
- `src/lib/paginacao.test.ts`: fatias, limites e lista vazia.
- `src/pdv/*.test.ts`: venda, sincronização idempotente e conflitos.

### Banco/RLS (PGlite)

`npm run test:sql` cobre, entre outros:

- isolamento entre empresas (matriz automática, inclusive `erros_cliente`);
- papéis dono/gerente/estoquista/caixa e convites;
- catálogo, estoque por lote, FEFO, histórico imutável e correções;
- importação de catálogo: linha inválida não derruba o arquivo, saldo inicial,
  categoria automática, ponto de pedido e bloqueio para caixa;
- monitoramento: insert pelo próprio usuário, leitura por dono/gerente e isolamento;
- **fila NFC-e**: o motivo do erro persiste na venda, o dono marca como resolvida (motivo
  gravado e erro limpo), status desconhecido é recusado pelo CHECK, `resolvida` exige motivo
  (≥ 3 caracteres), o **caixa não resolve** a fila, o **UPDATE direto na venda é negado**
  (`permission denied`) e outra empresa não altera nem vê a fila;
  - a escrita passa por `public.salvar_nfce` e `public.marcar_nfce_resolvida` (SECURITY DEFINER,
    com checagem de papel/empresa/loja/assinatura) — a tabela `vendas` **não** tem UPDATE para
    o app;
  - **venda cancelada**: não recebe emissão ("Esta venda está cancelada."), a tentativa não altera
    nada, não volta para a fila de emissão (`listarVendasPendentes` exige `status = 'concluida'`) e
    o cancelamento da **nota** continua permitido;
- **custo e lucro (T-036)**: o item da venda guarda o **custo do momento** (snapshot de
  `produtos.custo_ultimo`); produto sem custo fica `null`; mudar o custo depois **não** altera o
  item antigo;
- assinatura, expurgo e visitante sem login.

> **Lacuna conhecida (T-036):** o `test:sql` do ciclo cobre só 3 das 6 provas do laudo. As demais
> (snapshot imutável depois de mudar o custo, trigger `SECURITY DEFINER` com `search_path = ''`,
> item avulso, RLS multiempresa e a matriz de papéis no banco) foram verificadas pelo QA em script
> temporário — ver `memoria/laudo-custo-lucro.md` §2. Vale transformer em casos permanentes.

### Telas (Playwright)

- `e2e/app/produtos.spec.ts`: catálogo, detalhe de lotes, mínimo persistido.
- `e2e/app/importar.spec.ts`: CSV com saldo inicial e erro por linha.
- `e2e/app/inventario.spec.ts`: contagem por lote, ajuste no lote correto e rascunho.
- `e2e/app/lgpd.spec.ts`: exportação JSON e páginas públicas.
- `e2e/app/estoque-repor.spec.ts`: chip, tabela e lista de compras iguais.
- `e2e/app/vendas-fila.spec.ts`: **fila NFC-e** (aba "Fila NFC-e" em Vendas) —
  1. venda feita no PDV aparece na fila como pendente (e o resumo "N pendentes · M com erro");
  2. venda com `nfce_status='erro'` mostra o badge "Nota com erro" e o detalhe do erro no modal;
  3. "Reemitir" com o emissor desligado avisa "Integração NFC-e não configurada" e **não** muda o
     status — o aviso aparece **também dentro do modal de detalhe**;
  4. "Marcar resolvida" com motivo tira a venda da fila, mostra a tela de vazio e o estado
     terminal "Nota resolvida" na lista normal de vendas.
  - Semeia pelo banco do teste (`supabase.servidor.sql`), filtrando por `empresa_id` **e** `numero`
    — sem o `empresa_id`, o seed atinge as vendas das outras empresas do worker.
- `e2e/app/resultado.spec.ts` (T-036): **custo e lucro** —
  1. produto com custo R$ 10 e preço R$ 20, vendido 2 un → o card "Resultado de hoje" do Painel
     mostra Faturamento R$ 40,00, Lucro R$ 20,00 e margem 50%;
  2. Relatórios no período: a aba "Lucro" (título "Resultado") mostra os mesmos KPIs e a linha do
     produto;
  3. produto sem custo: o aviso "Itens sem custo cadastrado neste período" aparece e o item fica
     fora do CMV;
  4. venda cancelada não entra no faturamento;
  5. o Excel baixado tem a planilha "Resultado" com os KPIs e a linha do produto.
  - A **matriz de perfis** (dono/gerente/estoquista/caixa), a conferência do PDF e o layout a
    390 px foram verificados pelo QA em spec temporária — ver `memoria/laudo-custo-lucro.md` §3.
- Demais projetos: PDV offline, câmera, PWA, acesso/convites e servidor local.

## 4. Como rodar um teste isolado

```powershell
npx vitest run src/lib/importacao.test.ts
npx vitest run -t "importação"
npm run test:sql
npx playwright test e2e/app/inventario.spec.ts --project=app-computador --workers=1
npx playwright test e2e/app/importar.spec.ts --project=app-celular --workers=1
npx playwright test e2e/app/vendas-fila.spec.ts --workers=1
npx playwright test e2e/app/resultado.spec.ts --workers=1
```

Para ver o relatório: `npm run test:e2e:relatorio`.

## 5. Checklist de PR

- [ ] `npm run lint` verde.
- [ ] `npm test` verde.
- [ ] `npm run test:sql` verde (se tocou migrations/regras).
- [ ] `npm run build` verde.
- [ ] Playwright direcionado do fluxo alterado, com `--workers=1`.
- [ ] Nenhuma migration repetida/renomeada; `grant execute` revogado de `anon` quando
      a função é autenticada.
- [ ] `grant update` novo conferido com o gate de papel: quem escreve direto no banco
      tem o mesmo papel que a tela permite (ver `memoria/laudo-qa-fila-nfce.md`, D-2).
- [ ] Funções `SECURITY DEFINER` novas conferem papel **e** estado do registro (venda cancelada,
      nota já resolvida), não só empresa/loja.
- [ ] Seed de teste filtra por `empresa_id` (o banco é compartilhado por worker).
- [ ] Números em pt-BR **em todo lugar**, inclusive nos exports (vírgula decimal): a margem com
      casa decimal saía com ponto no Painel, no Excel e no PDF — passar **`formatarNumero`** em
      qualquer número exibido (ver `memoria/laudo-custo-lucro.md`, D-1).
- [ ] Caso com **casa decimal** no teste, não só com inteiro: margem de 50% não evidencia erro de
      separador decimal (o spec do repo usa 50%; o QA testou 66,7% por script próprio).
- [ ] Tela que mostra dinheiro (lucro, margem, faturamento): conferir **quem** enxerga, perfil por
      perfil — o caixa enxerga hoje, e a decisão é do dono do produto (ver o mesmo laudo, §3).
- [ ] Textos e estados de erro em português; sem `console.log` esquecido.
- [ ] Documentação (`README.md`, `DOCUMENTACAO_ERP.md`, `PILOTO.md`) e
      `memoria/estado.json` atualizados quando o comportamento mudar.

## 6. Dívidas conhecidas

- Suíte E2E completa instável com workers padrão; usar retries no CI e `--workers=1`
  ao depurar.
- Sem `@testing-library`: componentes são validados por Playwright, não por teste
  unitário de render.
- Restauração do Supabase de produção ainda não ensaiada.
- Emissão real de NFC-e ainda não existe (emissor é stub): os caminhos
  `erro → emitida` e `erro → erro` não são cobertos de ponta a ponta.
