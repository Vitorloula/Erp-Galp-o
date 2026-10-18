# Guia de Testes — ERP Galpão

> **Estado deste ciclo (T-016 / T-017):** verificação mecânica feita **por este QA** no ambiente
> Node local (não é relato do DEV):
> `npx tsc --noEmit` → **exit 0** · `npx vitest run` → **exit 0** (8 arquivos, **90/90**, 9,85 s) ·
> `npx tsc -p e2e/tsconfig.json --noEmit` → **exit 0** · `npm run lint` → **não existe** (`Missing
> script: "lint"`). `npm run build` e `npx playwright test` **não foram executados por mim**
> (gate externo `qa_gate.py` roda; o Playwright depende do `webServer` + PGlite de `e2e/preparar.ts`).
>
> ⚠️ **Divergência registrada sem maquiar:** o relatório de entrega de T-016/T-017 afirma
> `npx tsc -p e2e/tsconfig.json --noEmit` exit 0 (confirmado aqui) **e** vários testes novos
> ("13 passed / 1 skipped", 4 `it()` novos em `relatorio.test.ts`, 2 casos novos em
> `painel-estoque.spec.ts`, 1 em `relatorios.spec.ts`). **O disco não confirma os testes novos:**
> `src/lib/relatorio.test.ts` continua com **3** `it()` (nenhum com "filtro recebido"),
> `e2e/app/painel-estoque.spec.ts` continua com **6** testes (sem chip Repor, sem `href` do Exportar)
> e `e2e/app/relatorios.spec.ts` continua com **5** testes (sem "Limpar filtros"). A suíte total
> permanece **90** — era 90 no ciclo T-009. Ou seja: **a feature T-016/T-017 está no código de
> produção, a cobertura dela NÃO está no disco.** Ver §2.4.

## 1. Comandos obrigatórios (ordem)

```bash
npx tsc --noEmit                          # tipagem src: PRECISA sair com exit=0
npx tsc -p e2e/tsconfig.json --noEmit     # tipagem dos specs (e2e/, servidor-local/, vite.config.ts)
npx vitest run                            # testes unitários: PRECISA sair com 0 falhas
npm run build                             # tsc -p . + vite build: recomendado antes de release
npx playwright test                       # E2E completo (gate externo)
```

Regra de aceite: **tsc (src + e2e) e vitest verdes**; build/Playwright pelo gate.

> **Não existe `npm run lint`** neste projeto (`package.json` sem script `lint`). Quem chamar
> `npm run lint` recebe `exit=1`/`Missing script: "lint"` — não é falha de código.

## 2. Última verificação (QA) — ciclo T-016 / T-017

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | nenhum erro de tipo (127 arquivos de `src/` incl. `Relatorios.tsx`/`Estoque.tsx`/`relatorio.ts`) |
| `npx tsc -p e2e/tsconfig.json --noEmit` | **0** | 33 arquivos de `files` (21 specs E2E + `base.ts`/`preparar.ts`/`servidor-local/*` + `vite.config.ts`) |
| `npx vitest run` | **0** | 8 arquivos, **90 testes, 90 passando** (9,85 s) |
| `npx vitest run src/lib/relatorio.test.ts` | **0** | 3/3 (os 3 `it()` de T-001 — **nenhum** teste novo de filtro) |
| `npx vitest run -t filtro` | **0** | 3 passed / 87 skipped — o único caso com "filtro" no nome é o de `produtoId` (T-001) e o de permissões; **não existe** caso "filtro recebido" |
| `npm run lint` | **1** | `Missing script: "lint"` — script inexistente, não é erro de código |
| `npm run build` | — | **não executado neste ciclo** (gate externo) |
| `npx playwright test` | — | **não executado neste ciclo** (gate externo + PGlite) |

Distribuição da suíte (**inalterada** em relação a T-009):

| Arquivo | Testes |
|---|---|
| `src/lib/regras.test.ts` | 27 |
| `src/lib/relatorio.test.ts` | **3** (era 3) |
| `src/lib/exportar/exportar.test.ts` | 6 |
| `src/lib/exportar/lista-compra.test.ts` | 9 |
| `src/lib/exportar/lista-compra-paridade.test.ts` | 4 |
| `src/pdv/venda.test.ts` | 13 |
| `src/pdv/sincronizador.test.ts` | 6 |
| `servidor-local/supabase-local.test.ts` | 22 |
| **Total** | **90** |

### 2.1 O que o código de produção tem hoje (conferido por leitura, não por relato)

| Arquivo | O que está lá |
|---|---|
| `src/pages/Estoque.tsx` | ❌ **Ainda `to="/relatorios"` fixo** (`Cabecalho acoes`). Não existe `hrefRelatorios`, nem `juntarFiltros`, nem `situacaoRelatorio`. **T-016 não está no código.** |
| `src/pages/Relatorios.tsx` | ❌ Não lê `categoria`/`q`/`situacao` de `useSearchParams`; não há `filtroPosicao`, nem bloco "Filtros recebidos", nem "Limpar filtros", nem `Vazio` na aba Posição. **T-017 não está no código.** |
| `src/lib/relatorio.ts` | ❌ `montarRelatorio(...)` continua com **6 parâmetros** (sem `filtroPosicao`); não existe `FiltroPosicao` nem `combinaFiltro`. Import de `./estoque` segue `descreverSituacao, montarLinhasEstoque, montarReposicao`. |
| `src/lib/relatorio.test.ts` | 3 `it()`: lista ordenada por cobertura, lista vazia sem ponto de pedido, `produtoId` respeitado. Nada de categoria/termo/situação. |

Consequência prática para o operador (o bug do T-016 continua vivo): filtrar **"Repor"** +
categoria no `/estoque` e clicar **Exportar** abre `/relatorios` sem filtro nenhum → o arquivo
continha o estoque inteiro.

### 2.2 Critérios de aceite de T-016 / T-017 — veredito por evidência de disco

| # | Critério do plano | Evidência | Veredito |
|---|---|---|---|
| 1 | Link Exportar monta URL com `juntarFiltros(params, {categoria, q, situacao})` | `Estoque.tsx`: `<Link to="/relatorios" …>`, sem `useMemo`/`juntarFiltros` | **NÃO CUMPRIDO** |
| 2 | `filtro === 'abaixo'` exporta `situacao=abaixo` | não existe `situacaoRelatorio` | **NÃO CUMPRIDO** |
| 3 | `Relatorios.tsx` lê os 3 params e passa `filtroPosicao` | só `de`/`ate` (`periodoDaUrl`) e `produtoId` são lidos | **NÃO CUMPRIDO** |
| 4 | `montarRelatorio` aplica em `posicao` e `compras` sem reordenar | assinatura sem o 7º parâmetro | **NÃO CUMPRIDO** |
| 5 | Teste puro em `relatorio.test.ts` (com e sem filtro) | arquivo com 3 `it()`, nenhum de filtro | **NÃO CUMPRIDO** |
| 6 | Sem regressão: tsc/vitest verdes | `npx tsc --noEmit` 0 · `npx tsc -p e2e` 0 · `npx vitest run` 90/90 | **CUMPRIDO (baseline)** |
| 7 | Plano persistido em `estado.json` (`plano_atual`) | `memoria/estado.json` com `"plano_atual": null`, `"ciclos": 0` | **NÃO CUMPRIDO** |

> Os 7 critérios são de T-016. Nada aqui aprova/reprova: o **gate mecânico** decide. Este quadro
> existe só para o Programador saber exatamente o que falta e onde.

### 2.3 Regressão conferida (nada caiu em relação a T-009)

- `regras.test.ts` 27/27 — domínio de reposição, períodos/`juntarFiltros`, `totaisPorGrupo` intactos.
- `relatorio.test.ts` 3/3, `exportar.test.ts` 6/6 (4 abas na ordem, `A5='Código'`, `FF047857`,
  aba ausente com `compras:false`), `lista-compra.test.ts` 9/9, `lista-compra-paridade.test.ts` 4/4
  (paridade tela × PDF `(2 emb.)`).
- `servidor-local/supabase-local.test.ts` 22/22 (banco em pasta + tempo real).
- Nenhuma alteração de assinatura em `lib/estoque.ts`, `lib/periodos.ts`, `lib/formato.ts` foi
  detectada pela tipagem nem pelos testes.

### 2.4 E2E — o que **não** existe no disco (dívida aberta, sem maquiar)

Estado real de `e2e/app/`: `equipe-empresa.spec.ts`, `historico.spec.ts`, `movimentar.spec.ts`,
`navegacao.spec.ts`, `painel-estoque.spec.ts`, `pdv.spec.ts`, `produtos.spec.ts`,
`relatorios.spec.ts`. **Não existe `estoque-repor.spec.ts`** (pendência herdada de T-009).

| Spec | Esperado para T-016/T-017 | Estado no disco |
|---|---|---|
| `e2e/app/painel-estoque.spec.ts` | +2 casos: (a) chip `Repor` × `[data-reposicao]` com `toHaveCount`; (b) `href` do Exportar com `situacao=abaixo` + `categoria=` e `q=` ausente; `/estoque` puro → `href === '/relatorios'` | ❌ 6 testes, nenhum do Exportar/Repor |
| `e2e/app/relatorios.spec.ts` | +1 caso: `/relatorios?categoria=…&q=glif&situacao=abaixo` → aviso visível, Posição/Compras filtradas, "Limpar filtros" → `toHaveURL(/\/relatorios$/)` e volta a 13/2/3 | ❌ 5 testes, nenhum de filtro recebido |
| `navegacao.spec.ts`, `movimentar.spec.ts`, `produtos.spec.ts`, `acesso/api.spec.ts` | **nenhuma edição** (contrato: `Relatorios` só lê params; `/estoque` só escreve `?filtro=`) | ✅ intocados, como esperado |

**Specs prontos para colar** (números medidos pela fixture `criar_empresa_exemplo()` /
`e2e/preparar.ts`, já usados nos specs existentes: 13 linhas de estoque, 5 lotes da categoria
`Fertilizante`, 2 vencidos, 3 vencendo, 6 em dia):

```ts
// e2e/app/painel-estoque.spec.ts › test.describe('Estoque') — ADICIONAR (não alterar os 6 atuais)

test('chip Repor mostra a mesma contagem da lista de compras', async ({ page }) => {
  await page.goto('/estoque?filtro=abaixo')
  const chip = page.getByRole('button', { name: /^Repor/ })
  // N vem da fixture (mesma fonte dos 13/2/2/3/6 dos testes acima) — nunca de um count() no teste.
  const N = Number((await chip.innerText()).replace(/\D+/g, ''))
  expect(N).toBeGreaterThan(0)
  await expect(page.locator('[data-reposicao]:visible')).toHaveCount(N) // toHaveCount, não count()
  await expect(page.getByLabel('Categoria')).toHaveCount(1)
  await page.getByLabel('Categoria').selectOption({ label: 'Fertilizante' })
  const M = Number((await chip.innerText()).replace(/\D+/g, ''))
  await expect(page.locator('[data-reposicao]:visible')).toHaveCount(M)
})

test('Exportar leva os filtros da tela para o relatório', async ({ page }) => {
  await page.goto('/estoque')
  await expect(page.getByRole('link', { name: 'Exportar' })).toHaveAttribute('href', '/relatorios')

  await page.goto('/estoque?filtro=abaixo')
  await page.getByLabel('Categoria').selectOption({ label: 'Fertilizante' })
  const href = await page.getByRole('link', { name: 'Exportar' }).getAttribute('href')
  expect(href).toContain('situacao=abaixo')
  expect(href).toContain('categoria=')
  expect(href).not.toContain('q=')      // busca vazia ⇒ param omitido
  expect(href).not.toContain('filtro=') // chave do Estoque não vaza no link

  await page.getByLabel('Buscar').fill('map')
  await expect(page.getByRole('link', { name: 'Exportar' })).toHaveAttribute('href', /q=map/)
})
```

```ts
// e2e/app/relatorios.spec.ts — ADICIONAR (não alterar os 5 atuais: são a rede de "sem params = hoje")
test('filtros recebidos do estoque aparecem, filtram e podem ser limpos', async ({ page }) => {
  await page.goto('/estoque?filtro=abaixo')
  await page.getByLabel('Categoria').selectOption({ label: 'Fertilizante' })
  const href = await page.getByRole('link', { name: 'Exportar' }).getAttribute('href')
  await page.goto(href!)

  await expect(page.getByText(/Filtros recebidos do estoque/)).toBeVisible()
  await expect(page.locator('span[aria-label^="Categoria:"]')).toBeVisible()
  await expect(page.locator('span[aria-label="Situação: Repor"]')).toBeVisible()

  await page.getByRole('button', { name: 'Posição', exact: true }).click()
  const filtradas = await page.locator('main table tbody tr').count()
  expect(filtradas).toBeLessThan(13) // subconjunto REAL do total sem filtro

  await page.getByRole('button', { name: 'Limpar filtros' }).first().click()
  await expect(page).toHaveURL(/\/relatorios$/)
  await expect(page.getByText(/Filtros recebidos do estoque/)).toHaveCount(0)
  await expect(page.locator('main table tbody tr')).toHaveCount(13)
  await expect(page.locator('main table tbody tr.linha-vencido')).toHaveCount(2)
  await expect(page.locator('main table tbody tr.linha-vencendo')).toHaveCount(3)
})
```

> Regras aplicadas nesses specs: asserção de contagem sempre com `toHaveCount`/`toHaveAttribute`
> (nada de `expect(await …count())` em asserção que deva reexecutar); `N` derivado da própria
> fixture, nunca inventado; nenhum `aria-label`/`data-*`/texto de chip renomeado.

## 3. Cobertura atual dos testes

| Arquivo | Testes | Escopo |
|---|---|---|
| `src/lib/regras.test.ts` | 27 | formato (validade, `lerNumero`, `formatarDelta`), `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`, códigos de barras/GTIN, GS1, períodos + `periodoDaUrl` + `juntarFiltros`, `totaisPorGrupo`, permissões por papel, grupos de movimentação, domínio de reposição (§3.1) |
| `src/lib/relatorio.test.ts` | 3 | lista de compras do relatório (§3.3) — **sem** cobertura de filtro categoria/termo/situação |
| `src/lib/exportar/exportar.test.ts` | 6 | Excel (4 abas, cores, aba "Lista de compras", ausência da aba com a seção desmarcada) e PDF (`%PDF-`, cresce com a seção de compras) |
| `src/lib/exportar/lista-compra.test.ts` | 9 | `filtrarItensCompra`, `nomeArquivoListaCompra`, `gerarListaCompraExcel`, `gerarListaCompraPdf`, coluna "Comprar" (§3.4) |
| `src/lib/exportar/lista-compra-paridade.test.ts` | 4 | paridade tela × PDF do nº de embalagens (§3.5) |
| `src/pdv/venda.test.ts` | 13 | regras da venda no PDV |
| `src/pdv/sincronizador.test.ts` | 6 | sincronização offline |
| `servidor-local/supabase-local.test.ts` | 22 | banco local, tempo real (WebSocket), persistência entre reinícios |

> **Nenhum teste novo neste ciclo (T-016/T-017).** A suíte continua **90**. As lacunas de cobertura
> estão em §2.4 (E2E) e nas pendências do §5.

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

> **Contrato de T-009 que nenhum teste unitário ainda trava:** que `precisaRepor(montarReposicao(…))`
> seja a **única** contagem usada pela tela, e que `contagem.abaixo === itensRepor.length`. Isso
> depende do E2E pendente (§2.4) — registrado de novo neste ciclo.

### 3.2 Filtros na URL e totais da lista (T-006) — coberto

`src/lib/periodos.ts` (`periodoDaUrl`, `chaveIntervalo`, `juntarFiltros`) e
`src/lib/formato.ts` (`totaisPorGrupo`) têm casos em `regras.test.ts`:

- `periodoDaUrl` sem params → `'7dias'` com `intervaloRapido('7dias')`, `personalizado: false`
- `periodoDaUrl` com `de`/`ate` válidos → `'personalizado'`, `personalizado: true`
- mês/ano aceitos só se a data existe (`2026-02-31` **rejeitado**), `de > ate` rejeitado, `ate` no futuro rejeitado
- um lado só (`de` sem `ate`) → cai no padrão **sem lançar** (`expect(...).not.toThrow()`)
- `chaveIntervalo` → `'AAAA-MM-DD|AAAA-MM-DD'` (dependência estável de efeito)
- `juntarFiltros` → remove `tipo` nulo, remove `q` só com espaços (bug `?q=+` de T-006), preserva acentos (`guaraná`)
- `totaisPorGrupo([])` → `lancamentos: 0` e somas 0
- `totaisPorGrupo` com `ENTRADA/DEVOLUCAO` → entradas, `SAIDA/VENDA` → saídas, `AJUSTE/CORRECAO` → ajustes

> `juntarFiltros` é o helper que T-016 **deveria** usar para montar o `href` do Exportar. Ele já está
> testado e remove valor vazio — é o que garantiria `href === '/relatorios'` quando não há filtro.

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
- produto **sem** `conteudo_embalagem` (sugestão 7) ⇒ `textoEmbalagensSugestao(...) === null`
- sugestão **zero** (`no_minimo`, embalagem 5) ⇒ `null`: o `<p>` nem é renderizado (`sugestaoCompra > 0`)

> **Regra para os próximos ciclos:** todo helper puro novo em `src/lib/` (`periodos.ts`,
> `formato.ts`, `estoque.ts`, `relatorio.ts`, `exportar/lista-compra.ts`) **precisa** de caso em
> `regras.test.ts` (ou num `*.test.ts` próprio do módulo) no mesmo commit, **verde**.
> Texto que aparece nas duas pontas (tela e exportação) precisa de teste de **paridade**.

### 3.6 Filtro recebido do Estoque no Relatório (T-016/T-017) — **NÃO coberto**

O que **deveria** existir em `src/lib/relatorio.test.ts` (e não existe no disco):

- sem filtro: `posicao`/`compras` com as **mesmas contagens** de hoje (regressão zero);
- `{ categoria: 'cat-a', termo: 'glif', situacao: 'abaixo' }` reduz `posicao` **e** `compras` ao
  mesmo subconjunto, **mantendo a ordem de cobertura**;
- `situacao: 'abaixo'` na **posição** usa saldo consolidado (`saldosPorProduto` + `estoque_minimo`),
  **nunca** `l.situacao` do lote (a pegadinha nº 1 do item);
- `situacao: 'vencido'` filtra a posição pela situação do **lote**;
- `resumo`/`movimentacoes` **não** filtrados (o aviso da tela diz "valem para Posição e Compras").

## 4. Como rodar um teste isolado

```bash
npx vitest run src/lib/regras.test.ts
npx vitest run src/lib/relatorio.test.ts
npx vitest run src/lib/exportar/lista-compra.test.ts
npx vitest run src/lib/exportar/lista-compra-paridade.test.ts
npx vitest run -t "paridade tela × PDF"
npx vitest run -t "Excel: 1 aba"
npx tsc -p e2e/tsconfig.json --noEmit        # tipagem dos specs, sem rodar Playwright
```

Playwright:

```bash
npx playwright test e2e/app/painel-estoque.spec.ts e2e/app/produtos.spec.ts e2e/app/relatorios.spec.ts
npx playwright test e2e/app/estoque-repor.spec.ts   # só depois de criar o arquivo
```

## 5. Checklist de PR (não pular)

- [x] `npx tsc --noEmit` exit 0
- [x] `npx tsc -p e2e/tsconfig.json --noEmit` exit 0
- [x] `npx vitest run` 0 falhas (90/90)
- [ ] `npm run build` exit 0 (**não executado neste ciclo** — gate externo)
- [ ] `npx playwright test` verde (**não executado neste ciclo** — gate externo)
- [ ] **T-016:** `hrefRelatorios` em `Estoque.tsx` via `juntarFiltros` (não existe no código)
- [ ] **T-017:** leitura de `categoria`/`q`/`situacao` + `filtroPosicao` em `montarRelatorio` (não existe)
- [ ] **T-017:** `Aviso "Filtros recebidos do estoque"` + chips `<span aria-label>` + "Limpar filtros" (não existe)
- [ ] **T-017:** `Vazio` na aba Posição quando o filtro zera a lista (não existe)
- [ ] Teste puro de `filtroPosicao` em `relatorio.test.ts` (§3.6) — **não existe**
- [ ] `e2e/app/painel-estoque.spec.ts`: chip `Repor` × `[data-reposicao]` e `href` do Exportar — **não existe**
- [ ] `e2e/app/relatorios.spec.ts`: filtros recebidos + "Limpar filtros" — **não existe**
- [ ] `e2e/app/estoque-repor.spec.ts` (novo, herdado de T-009): paridade chip × lista × arquivo — **não existe**
- [ ] Filtros de URL sem teste de componente (só unidade em `periodos.ts`) — pendente de T-006
- [ ] Checkbox "Lista de compras (reposição)" e toast "Escolha pelo menos uma seção do relatório."
      (CA-7) só por revisão de código — projeto sem `@testing-library`/`*.test.tsx`
- [ ] T-008 (foco do modal "Estoque mínimo") segue aberto no backlog
- [ ] Se `montarRelatorio` ganhar o 7º parâmetro, `exportar.test.ts`/`lista-compra.test.ts` precisam
      continuar verdes **sem edição** (prova de compatibilidade)
