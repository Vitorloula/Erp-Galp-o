# Guia de Testes — ERP Galpão

## 1. Estado atual (27/10/2026)

| Comando | Exit | Resultado |
|---|---|---|
| `npm run lint` (`tsc -p . --noEmit`) | 0 | sem erros de tipo |
| `npm test` (Vitest) | 0 | **117/117** em 12 arquivos |
| `npm run test:sql` (PGlite) | 0 | **238/238** verificações |
| `npm run build` | 0 | `tsc` + Vite + PWA |
| `npx tsc -p e2e --noEmit` | 0 | specs e helpers E2E |
| Playwright direcionado | 0 | importação/inventário/LGPD 12/12 e produtos/estoque-repor 18/18 (dois projetos) |

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
- assinatura, expurgo e visitante sem login.

### Telas (Playwright)

- `e2e/app/produtos.spec.ts`: catálogo, detalhe de lotes, mínimo persistido.
- `e2e/app/importar.spec.ts`: CSV com saldo inicial e erro por linha.
- `e2e/app/inventario.spec.ts`: contagem por lote, ajuste no lote correto e rascunho.
- `e2e/app/lgpd.spec.ts`: exportação JSON e páginas públicas.
- `e2e/app/estoque-repor.spec.ts`: chip, tabela e lista de compras iguais.
- Demais projetos: PDV offline, câmera, PWA, acesso/convites e servidor local.

## 4. Como rodar um teste isolado

```powershell
npx vitest run src/lib/importacao.test.ts
npx vitest run -t "importação"
npm run test:sql
npx playwright test e2e/app/inventario.spec.ts --project=app-computador --workers=1
npx playwright test e2e/app/importar.spec.ts --project=app-celular --workers=1
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
- [ ] Textos e estados de erro em português; sem `console.log` esquecido.
- [ ] Documentação (`README.md`, `DOCUMENTACAO_ERP.md`, `PILOTO.md`) e
      `memoria/estado.json` atualizados quando o comportamento mudar.

## 6. Dívidas conhecidas

- Suíte E2E completa instável com workers padrão; usar retries no CI e `--workers=1`
  ao depurar.
- Sem `@testing-library`: componentes são validados por Playwright, não por teste
  unitário de render.
- Restauração do Supabase de produção ainda não ensaiada.
