# Guia de Testes — ERP Galpão

> **Estado deste ciclo (T-009):** verificação mecânica executada **por este QA**, direto no
> ambiente Node local (não é relato do DEV):
> `npx tsc --noEmit` → **exit 0** · `npx vitest run` → **exit 0** (8 arquivos, **90/90** testes) ·
> `npm run build` → **exit 0** (2303 módulos, PWA `generateSW`, 11 entradas precache 1.018,59 KiB,
> 968 ms).
> Item **T-009** (fonte única da lista "Repor") concluído no código. **Nenhum teste novo foi
> escrito neste ciclo** — o `e2e/app/estoque-repor.spec.ts` planejado **não existe no disco**
> (ver §2.4) e a contagem de testes unitários ficou **igual** (90) porque a mudança é de *fonte de
> dados* numa página, sem helper puro novo. Nenhuma regressão em T-011/T-001/T-006/T-002.

## 1. Comandos obrigatórios (ordem)

```bash
npx tsc --noEmit     # tipagem: PRECISA sair com exit=0
npx vitest run       # testes: PRECISA sair com 0 falhas
npm run build        # tsc -p . + vite build: recomendado antes de release
```

Regra de aceite: **os três comandos verdes**. Um vermelho = ciclo reprovado.

## 2. Última verificação (QA) — ciclo T-009

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | nenhum erro de tipo |
| `npx vitest run` | **0** | 8 arquivos, **90 testes, 90 passando** (9,79 s) |
| `npm run build` | **0** | 2303 módulos, PWA `generateSW`, 11 entradas precache (1.018,59 KiB), 968 ms |

Distribuição da suíte (inalterada em relação a T-011 — nenhum teste novo):

| Arquivo | Testes |
|---|---|
| `src/lib/regras.test.ts` | 27 |
| `src/lib/relatorio.test.ts` | 3 |
| `src/lib/exportar/exportar.test.ts` | 6 |
| `src/lib/exportar/lista-compra.test.ts` | 9 |
| `src/lib/exportar/lista-compra-paridade.test.ts` | 4 |
| `src/pdv/venda.test.ts` | 13 |
| `src/pdv/sincronizador.test.ts` | 6 |
| `servidor-local/supabase-local.test.ts` | 22 |

### 2.1 O que mudou neste ciclo (T-009)

| Arquivo | Mudança | Teste |
|---|---|---|
| `src/pages/Estoque.tsx` | **fonte única**: `reposicao = useMemo(() => montarReposicao(produtos, lotes), [produtos, lotes])`; `visiveisReposicao = precisaRepor(reposicao).filter(categoria + produtoCombina)`; `contagem.abaixo = visiveisReposicao.length`; `itensRepor = ordenarReposicao(visiveisReposicao, ordem)`. **Removidos**: `reposicaoPorProduto`, `precisaReporPorLinha`, `useCallbackMap` e a chamada a `situacaoReposicao`/`saldosPorProduto` **na página** | Regressão via `regras.test.ts` (27) — `montarReposicao`/`precisaRepor` com assinatura intacta |
| `src/pages/Estoque.tsx` | `ordenarReposicao(itens, ordem)` novo (local, no próprio arquivo): `ordem !== 'nome'` ⇒ cobertura crescente; `ordem === 'nome'` ⇒ `localeCompare('pt-BR')`. `ordem === 'validade'` é **ignorada** no filtro Repor (decisão do plano, menor risco) | — (função local de página; sem teste de componente no projeto) |
| `src/lib/estoque.ts` | **só documentação** no JSDoc de `precisaRepor` (contrato: única porta de entrada da lista de compras, sempre sobre `montarReposicao`) + `saldosPorProduto` **restaurada** (é consumida por `src/pages/Painel.tsx` — mantê-la é pré-requisito de `tsc` verde) | `regras.test.ts` §3.1 cobre `saldosPorProduto` |

### 2.2 Critérios de aceite de T-009 — veredito (informativo; o gate mecânico decide)

| CA | Veredito | Evidência |
|---|---|---|
| 1 — `contagem.abaixo === itensRepor.length` **por construção** | **OK** | `c.abaixo = visiveisReposicao.length` e `itensRepor` derivam de `visiveisReposicao`; não existe mais caminho paralelo (`precisaReporPorLinha` removido) |
| 2 — tabela/listas do filtro Repor não usam `montarLinhasEstoque` | **OK** | `linhas` recebe `[]` quando `filtro === 'abaixo'`; a lista é `ListaReposicao` com `itensRepor` |
| 3 — `aria-*`/`data-*`/literais preservados | **OK** | `aria-label="Filtrar estoque"`, `aria-pressed`, `data-reposicao`, `data-linha-estoque`, `data-selecao`, `Estoque atual`, `Nada encontrado`, `Nada para repor`, `Baixar Excel/PDF`, toasts |
| 4 — nenhum recálculo de regra de lote na página | **OK** | imports de `situacaoReposicao`/`saldosPorProduto` saíram de `Estoque.tsx` |
| 5 — `tsc`/`vitest`/`build` verdes | **OK** | 0 / 90-90 / 0 |
| 6 — E2E travando a paridade chip × lista | **NÃO CUMPRIDO** | `e2e/app/estoque-repor.spec.ts` **não existe** no disco (ver §2.4); `e2e/app/painel-estoque.spec.ts` continua sem clicar no chip Repor |

### 2.3 Regressão conferida (nada caiu)

- `regras.test.ts` 27/27 — inclui o domínio de reposição (`situacaoReposicao`, `sugerirCompra`,
  `calcularCobertura`, `montarReposicao`, `precisaRepor`, `saldosPorProduto`), §3.1.
- `relatorio.test.ts` 3/3 e `lista-compra.test.ts` 9/9 — a lista de compras exportada continua
  saindo de `montarReposicao`, não do filtro da tela.
- `lista-compra-paridade.test.ts` 4/4 — paridade tela × PDF (`(2 emb.)`) de T-011 intacta.
- `exportar.test.ts` 6/6 — 4 abas na ordem, `A5 = 'Código'`, `fgColor FF047857`, aba ausente com
  `compras:false`.

### 2.4 E2E — o que **não** foi feito (dívida aberta, sem maquiar)

- **Nenhum `.spec.ts` foi criado ou alterado neste ciclo.** Estado real da pasta `e2e/app/`:
  `equipe-empresa`, `historico`, `movimentar`, `navegacao`, `painel-estoque`, `pdv`, `produtos`,
  `relatorios`. **Não existe `estoque-repor.spec.ts`.**
- `e2e/app/painel-estoque.spec.ts` › `Estoque › 'filtros por situação com contadores'` **precisa**
  ganhar o chip Repor (o objeto `contagens` hoje só tem `Todos/Vencidos/Zerados/Vencem em 30 dias/Em dia`).
  O `N` do chip tem de ser **medido** em runtime contra a fixture `criar_empresa_exemplo()`
  (PGlite) — não pode ser inventado. Asserção do filtro Repor usa `[data-reposicao]` com
  `toHaveCount(N)` (o filtro Repor **não** emite `[data-linha-estoque]`). Se o bloco Repor for
  colocado antes do chip `Em dia`, o `toHaveURL(/filtro=ok/)` final do teste continua válido.
- Especificação pronta do spec novo (colar assim que `N` for medido): 1) paridade chip ×
  `[data-reposicao]`; 2) paridade com busca (`getByLabel('Buscar')`); 3) paridade com categoria
  (`selectOption({ label: 'Fertilizante' })`); 4) zerado sem lote aparece 1× e produto com
  `estoque_minimo = null` não aparece; 5) "Marcar todos" + `page.waitForEvent('download')` com
  `lista-compra` no nome; 6) mobile com `semRolagemHorizontal(page)`.
- Playwright **não foi executado** neste ciclo (depende do `webServer` + PGlite de
  `e2e/preparar.ts`). O gate mecânico externo é quem roda.

## 3. Cobertura atual dos testes

| Arquivo | Testes | Escopo |
|---|---|---|
| `src/lib/regras.test.ts` | 27 | formato (validade, `lerNumero`, `formatarDelta`), `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`, códigos de barras/GTIN, GS1, períodos + `periodoDaUrl`, `totaisPorGrupo`, permissões por papel, grupos de movimentação, domínio de reposição (§3.1) |
| `src/lib/relatorio.test.ts` | 3 | lista de compras do relatório (§3.3) |
| `src/lib/exportar/exportar.test.ts` | 6 | Excel (4 abas, cores, aba "Lista de compras", ausência da aba quando a seção está desmarcada) e PDF (`%PDF-`, cresce com a seção de compras) |
| `src/lib/exportar/lista-compra.test.ts` | 9 | `filtrarItensCompra`, `nomeArquivoListaCompra`, `gerarListaCompraExcel`, `gerarListaCompraPdf`, texto da coluna "Comprar" (§3.4) |
| `src/lib/exportar/lista-compra-paridade.test.ts` | 4 | paridade tela × PDF do nº de embalagens (§3.5) |
| `src/pdv/venda.test.ts` | 13 | regras da venda no PDV |
| `src/pdv/sincronizador.test.ts` | 6 | sincronização offline |
| `servidor-local/supabase-local.test.ts` | 22 | banco local, tempo real (WebSocket), persistência entre reinícios |

> **Nenhum teste novo neste ciclo (T-009).** A suíte total continua **90**. A lacuna é de
> *cobertura de página* (a unificação vive em `Estoque.tsx`), e o projeto não tem
> `@testing-library` nem `*.test.tsx`; a cobertura pretendida para T-009 é **Playwright** (§2.4).

### 3.1 Domínio de reposição — coberto

`src/lib/estoque.ts` (`situacaoReposicao`, `sugerirCompra`, `calcularCobertura`,
`montarReposicao`, `precisaRepor`, `saldosPorProduto`) tem casos em `regras.test.ts`:

- `minimo === null` → `'sem_minimo'`, `cobertura === null`, `sugestaoCompra === 0`
- `minimo <= 0` → `'sem_minimo'` (zero = desligado)
- `saldo <= 0` com mínimo → `'abaixo'`
- `saldo < minimo` → `'abaixo'` · `saldo === minimo` → `'no_minimo'` · `saldo > minimo` → `'acima'`
- `sugerirCompra` arredondando por `conteudo_embalagem` (saldo 5, mínimo 12, embalagem 20 → 20)
- `sugerirCompra` sem embalagem (saldo 5, mínimo 12 → 7)
- `montarReposicao` ignora `ativo=false` e `controla_estoque=false`

> **Contrato de T-009 que o teste unitário ainda NÃO trava:** que `precisaRepor(montarReposicao(...))`
> seja a **única** contagem usada pela tela. Hoje isso é garantido só por ausência de código
> alternativo em `Estoque.tsx` (revisão) + o E2E pendente de §2.4. Se alguém reintroduzir
> `situacaoReposicao(saldos.get(id)…)` na página, a suíte unitária **não** acusa.

### 3.2 Filtros na URL e totais da lista (T-006) — coberto

`src/lib/periodos.ts` (`periodoDaUrl`, `chaveIntervalo`, `juntarFiltros`) e
`src/lib/formato.ts` (`totaisPorGrupo`) têm casos em `regras.test.ts`:

- `periodoDaUrl` sem params → `'7dias'` com `intervaloRapido('7dias')`, `personalizado: false`
- `periodoDaUrl` com `de`/`ate` válidos (`2026-10-01` … `2026-10-03`) → `'personalizado'`, `personalizado: true`
- mês/ano aceitos só se a data existe (`2026-02-31` **rejeitado**), `de > ate` rejeitado, `ate` no futuro rejeitado
- um lado só (`de` sem `ate`) → cai no padrão **sem lançar** (`expect(...).not.toThrow()`)
- `chaveIntervalo` → `'AAAA-MM-DD|AAAA-MM-DD'` (dependência estável de efeito)
- `juntarFiltros` → remove `tipo` nulo, remove `q` só com espaços, preserva acentos (`guaraná`)
- `totaisPorGrupo([])` → `lancamentos: 0` e somas 0
- `totaisPorGrupo` com `ENTRADA/DEVOLUCAO` → entradas, `SAIDA/VENDA` → saídas (soma negativa), `AJUSTE/CORRECAO` → ajustes

### 3.3 Lista de compras (reposição) no relatório (T-001) — coberto

`src/lib/relatorio.test.ts` valida `montarRelatorio(...).compras` (só produtos no ponto de pedido):

- entram **apenas** `abaixo` e `no_minimo`; `acima` e `sem_minimo` ficam fora
- ordenação do mais crítico ao menos crítico (cobertura asc): `p2` (0,25) → `p1` (0,50) → `p3` (1,00)
- `sugestaoCompra === sugerirCompra(...)` e `cobertura === calcularCobertura(...)` — prova que
  `relatorio.ts` **não** reimplementa regra
- sem produto no ponto de pedido → `compras === []`
- filtro `produtoId` respeitado na lista de compras

`src/lib/exportar/exportar.test.ts` (Excel/PDF):

- `TODAS` → 4 abas **na ordem**: `Resumo por produto`, `Movimentações`, `Posição de estoque`, `Lista de compras`
- cabeçalho verde `FF047857` em `A5`; linha 5 == `Código…Comprar`; valores 3 / 10 / 0,3 / 8 no 1º produto
- lista vazia ainda cria a aba com "Nenhum produto no ponto de pedido." em `A6`
- `SEM_COMPRAS` → só 3 abas, `getWorksheet('Lista de compras')` **undefined** (CA-5)
- PDF começa com `%PDF-` e é **maior** com `compras: true` (CA-6)

### 3.4 Lista de compras fora do relatório (`lista-compra.test.ts`) — 9/9 verdes

Cobre `filtrarItensCompra` (função pura em `lib/estoque.ts`), `nomeArquivoListaCompra`,
`gerarListaCompraExcel` e `gerarListaCompraPdf` (`lib/exportar/lista-compra.ts`).

- **ordem por cobertura**: `p` (0,3) antes de `q` (1,0), independente da ordem do `Set`
- `situacoes === ['abaixo', 'no_minimo']` e `sugestaoCompra === 0` preservado no `no_minimo`
- **cópia sem recálculo**: `codigo='P0001'`, `categoria`, `unidade='kg'`, `saldo/minimo/cobertura/sugestao`
  iguais à origem, `sugestaoCompra === 8` (7 → 2 embalagens de 4)
- `Set` vazio ⇒ `[]`; id inexistente ignorado; acima do mínimo fora mesmo selecionado
- `nomeArquivoListaCompra` → `lista-de-compras_2026-10-03.xlsx|pdf` e default `\d{4}-\d{2}-\d{2}`
- Excel: 1 aba `Lista de compras`, `A1` = empresa, `A2` contém `— 2 produtos`, `A3` = `Gerado em …`,
  linha 5 com as 10 colunas, `fgColor FF047857`, linha 6 = 3 / 10 / 0,3 / **8 (número)**,
  colunas 9 e 10 `null`, `rowCount === 5 + itens + 1` (legenda)
- Excel sem seleção: aviso "Nenhum produto selecionado para compra." em `A6`
- PDF: `%PDF-` e > 5000 bytes, com e sem itens
- **T-011**: a frase da coluna Comprar do PDF é `"8 kg (2 emb.)"` —
  `${formatarNumero(sugestaoCompra)} ${unidade}${emb ? ` (${emb})` : ''}`, a mesma expressão de `lista-compra.ts`

> **Contrato de formatação da coluna "Comprar" (decidido no ciclo T-001):**
> **Excel** ⇒ número puro (reaproveitável pelo fornecedor, negrito verde);
> **PDF** ⇒ texto `"8 kg (2 emb.)"`.
> **Tela (`ListaReposicao`)** ⇒ texto idêntico ao do PDF: `Comprar 8 kg (2 emb.) para voltar ao mínimo`.
> As três pontas derivam de `formatarEmbalagens(n, conteudo_embalagem)` — nenhuma recalcula.

### 3.5 Paridade tela × PDF — embalagens (`lista-compra-paridade.test.ts`, T-011) — 4/4 verdes

Fixture único (o mesmo de `lista-compra.test.ts`): mínimo 10, saldo 3, `conteudo_embalagem` 4, `kg`.

- `montarReposicao(...)` ⇒ `sugestaoCompra === 8` e `textoEmbalagensSugestao(produto, 8) === '2 emb.'`
- **mesmo item** da tela (`filtrarItensCompra`) e do PDF ⇒ `daTela === doPdf === '2 emb.'`
- produto **sem** `conteudo_embalagem` (sugestão 7) ⇒ `textoEmbalagensSugestao(...) === null` (sem parênteses)
- sugestão **zero** (`no_minimo`, embalagem 5) ⇒ `null`: o `<p>` nem é renderizado (`sugestaoCompra > 0`)

> **Regra para os próximos ciclos:** todo helper puro novo em `src/lib/` (`periodos.ts`,
> `formato.ts`, `estoque.ts`, `relatorio.ts`, `exportar/lista-compra.ts`) **precisa** de caso em
> `regras.test.ts` (ou num `*.test.ts` próprio do módulo) no mesmo commit, **verde**.
> Texto que aparece nas duas pontas (tela e exportação) precisa de teste de **paridade**.

## 4. Como rodar um teste isolado

```bash
npx vitest run src/lib/regras.test.ts
npx vitest run src/lib/relatorio.test.ts
npx vitest run src/lib/exportar/lista-compra.test.ts
npx vitest run src/lib/exportar/lista-compra-paridade.test.ts
npx vitest run -t "paridade tela × PDF"
npx vitest run -t "Excel: 1 aba"
```

Playwright (quando o `N` do chip Repor existir — §2.4):

```bash
npx playwright test e2e/app/painel-estoque.spec.ts e2e/app/produtos.spec.ts e2e/app/relatorios.spec.ts
npx playwright test e2e/app/estoque-repor.spec.ts   # só depois de criar o arquivo
```

## 5. Checklist de PR (não pular)

- [x] `npx tsc --noEmit` exit 0
- [x] `npx vitest run` 0 falhas (90/90)
- [x] `npm run build` exit 0
- [x] Nenhuma regra de negócio recalculada na página em T-009 (`situacaoReposicao`/`saldosPorProduto` fora de `Estoque.tsx`)
- [x] `lib/estoque.ts` preservado para o `Painel.tsx` (`saldosPorProduto` restaurada — remoção é escopo de T-010/T-002)
- [x] Sem `TODO`/`FIXME`/placeholder nos arquivos tocados
- [ ] **`e2e/app/painel-estoque.spec.ts`: acrescentar `Repor: N` (medido) em `contagens` e a asserção
      `expect(page.locator('[data-reposicao]')).toHaveCount(N)`** — falta
- [ ] **`e2e/app/estoque-repor.spec.ts` (novo): paridade chip × lista × lista de compras** — arquivo não existe
- [ ] Playwright não executado neste ciclo (gate externo roda)
- [ ] Sem teste unitário que trave `contagem.abaixo === precisaRepor(...).length` (depende do E2E acima)
- [ ] Filtros da URL (`?de=&ate=&tipo=&q=`) ainda **sem teste de componente** — coberto só
      no nível de `periodos.ts`; smoke manual de Histórico/Relatórios pendente
- [ ] Checkbox "Lista de compras (reposição)" e o toast "Escolha pelo menos uma seção do
      relatório." (CA-7) só têm verificação **por revisão de código** — não há teste de
      componente (nenhum `*.test.tsx` no projeto, `@testing-library` não instalado)
- [ ] T-011 CA-1/CA-3/CA-5: render de `ListaReposicao` (`(2 emb.)` em `<strong class="tabular-nums">`,
      `data-embalagens`, estado `Vazio`) verificável só por revisão de código + Playwright
      (`[data-reposicao="p"][data-embalagens="2 emb."]`), sem `@testing-library`
- [ ] T-008 (foco do modal "Estoque mínimo") segue aberto no backlog
