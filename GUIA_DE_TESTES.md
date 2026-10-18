# Guia de Testes — ERP Galpão

> **Estado deste ciclo (T-016 / T-017 — Exportar do Estoque levando filtros → Relatórios):**
> verificação mecânica feita **por este QA** no ambiente Node local (não é relato do DEV):

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | nenhum erro de tipo em `src/` |
| `npx tsc -p e2e/tsconfig.json --noEmit` | **0** | specs + `base.ts` + `vite.config.ts` sem erro |
| `npx vitest run` | **0** | **8 arquivos · 90/90** (9,84 s) |
| `npm run build` | **0** | `tsc -p .` + `vite build` · 2303 módulos · PWA `generateSW` · 11 precache · 1.018,63 KiB · 901 ms |
| `npx vitest run src/lib/relatorio.test.ts --reporter=verbose` | **0** | **3/3** — nomes dos `it()` conferidos (nenhum de filtro) |
| `npx playwright test --list` | **0** | **171 testes em 17 arquivos** |
| `npm run lint` | **1** | `Missing script: "lint"` — script inexistente, **não** é erro de código |
| `npx playwright test` (execução real) | — | **não executado por este QA**: depende do `webServer` + PGlite de `e2e/preparar.ts`; fica no gate externo `qa_gate.py` |

> ⚠️ **Divergência registrada sem maquiar:** o relatório de entrega de T-016/T-017 afirma **4 `it()`
> novos** em `src/lib/relatorio.test.ts`, **2 casos novos** em `e2e/app/painel-estoque.spec.ts` e
> **1 caso novo** em `e2e/app/relatorios.spec.ts`, além de citar `Estoque.tsx` já com
> `<LinkExportar>`/`juntarFiltros` e `Relatorios.tsx` com `FiltrosRecebidos`.
> **O disco não confirma nada disso:**
> - `src/lib/relatorio.test.ts` → **3 `it()`**: `traz só os produtos no ponto de pedido…`,
>   `sem produtos no ponto de pedido a lista vem vazia`, `respeita o filtro de produto`.
>   Nenhum de `filtroPosicao`.
> - `e2e/app/painel-estoque.spec.ts` → **6** casos `Estoque` (nenhum lê `href` do Exportar, nenhum
>   mede chip Repor × `[data-reposicao]`).
> - `e2e/app/relatorios.spec.ts` → **5** casos (nenhum de "Filtros recebidos"/"Limpar filtros").
> - `src/pages/Estoque.tsx:187` → `<Link to="/relatorios" className="btn btn-secundario">` **fixo**,
>   sem `juntarFiltros`, sem `situacao=`, sem `aria-label`.
> - `src/pages/Relatorios.tsx` → só lê `de`/`ate` (`periodoDaUrl`) + `produtoId`; **não** lê
>   `q`/`categoria`/`situacao`, não existe `FiltrosRecebidos`, não existe `Vazio` na aba Posição.
> - `src/lib/relatorio.ts` → `montarRelatorio` com **6 parâmetros** (sem `filtroPosicao`).
>
> Suíte total continua **90** em vitest e **171** no Playwright. Ou seja: **a feature T-016/T-017
> não está no código, e a cobertura dela não está no disco.** O quadro critério-a-critério está em
> §2.2. Nada aqui aprova nem reprova — isso é do `qa_gate.py`.

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

E2E (`npx playwright test --list` → **171 testes / 17 arquivos**): `app/painel-estoque.spec.ts`
(9 casos × 2 projetos), `app/relatorios.spec.ts` (5 × 2), `app/navegacao.spec.ts`,
`app/historico.spec.ts`, `app/produtos.spec.ts`, `app/movimentar.spec.ts`, `app/pdv.spec.ts`,
`app/equipe-empresa.spec.ts`, `acesso/api.spec.ts`, `acesso/conta.spec.ts`,
`acesso/equipe-papeis.spec.ts`, `servidor-local/compartilhado.spec.ts`, `camera/*`,
`camera-sem-codigo/*`, `pdv/*`, `pwa/*`.

### 2.1 O que o código de produção tem hoje (conferido por leitura)

| Arquivo | O que está lá |
|---|---|
| `src/pages/Estoque.tsx:187` | ❌ `<Link to="/relatorios" className="btn btn-secundario"><FileSpreadsheet/> Exportar</Link>` — **href fixo**. Não existe `LinkExportar`, `juntarFiltros`, `situacao`, nem `aria-label` no link. **T-016 não está no código.** |
| `src/pages/Relatorios.tsx` | ❌ Lê apenas `de`/`ate` via `periodoDaUrl` + `produtoId` (estado local). Não há `lerFiltroRecebido`, `FiltrosRecebidos`, "Limpar filtros", nem `Vazio` na aba Posição (`relatorio.posicao.map` renderiza `<table>` mesmo vazio). **T-017 não está no código.** |
| `src/lib/relatorio.ts` | ❌ `montarRelatorio(intervalo, produtos, lotes, movsDesdeInicio, nomeCategoria, produtoId?)` — **6 parâmetros**, sem `FiltroPosicao`, sem recorte em `posicao`/`compras`. |
| `src/lib/relatorio.test.ts` | 3 `it()` (T-001): ponto de pedido ordenado por cobertura, lista vazia, filtro `produtoId`. |

Consequência prática para o operador (**o bug do T-016 continua vivo**): filtrar **"Repor"** +
categoria no `/estoque` e clicar **Exportar** abre `/relatorios` sem filtro nenhum → o arquivo sai
com o estoque inteiro e o operador confere linha a linha no Excel.

### 2.2 Critérios de aceite de T-016 / T-017 — veredito por evidência de disco

| # | Critério do plano | Evidência | Veredito |
|---|---|---|---|
| 1 | Link Exportar monta URL com `juntarFiltros` ({categoria, q, situacao}) | `Estoque.tsx:187` com `to="/relatorios"` fixo | **NÃO CUMPRIDO** |
| 2 | `filtro === 'abaixo'` exporta `situacao=abaixo` | nenhuma menção a `situacao=` no link | **NÃO CUMPRIDO** |
| 3 | `Relatorios.tsx` lê os 3 params e passa `filtroPosicao` | só `de`/`ate` + `produtoId` | **NÃO CUMPRIDO** |
| 4 | `montarRelatorio` aplica em `posicao` e `compras` sem reordenar | assinatura de 6 parâmetros | **NÃO CUMPRIDO** |
| 5 | Teste puro em `relatorio.test.ts` (com e sem filtro) | 3 `it()`, nenhum de filtro | **NÃO CUMPRIDO** |
| 6 | Sem regressão: tsc/vitest/build verdes | tsc 0 · tsc e2e 0 · vitest 90/90 · build 0 | **CUMPRIDO (baseline)** |
| 7 | Plano persistido em `estado.json` (`plano_atual`) | `memoria/estado.json` com `"plano_atual": null`, `"ciclos": 0` | **NÃO CUMPRIDO** |

### 2.3 Regressão conferida (nada caiu em relação a T-009)

- `regras.test.ts` 27/27 — domínio de reposição, períodos/`juntarFiltros`, `totaisPorGrupo` intactos.
- `relatorio.test.ts` 3/3, `exportar.test.ts` 6/6 (4 abas na ordem, `A5='Código'`, `FF047857`, aba
  ausente com `compras:false`), `lista-compra.test.ts` 9/9, `lista-compra-paridade.test.ts` 4/4.
- `servidor-local/supabase-local.test.ts` 22/22 (banco em pasta + tempo real).
- `npm run build` exit 0 → nenhuma importação quebrada, nenhum erro de tipo no `tsc -p .`.

### 2.4 E2E — o que **não** existe no disco (dívida aberta, sem maquiar)

`listar_arquivos('e2e/app')` → `equipe-empresa.spec.ts`, `historico.spec.ts`, `movimentar.spec.ts`,
`navegacao.spec.ts`, `painel-estoque.spec.ts`, `pdv.spec.ts`, `produtos.spec.ts`,
`relatorios.spec.ts`. **Não existe `e2e/app/estoque-repor.spec.ts`** (pendência herdada de T-009).

| Spec | Esperado para T-016/T-017 | Estado no disco |
|---|---|---|
| `e2e/app/painel-estoque.spec.ts` | +2 casos: (a) `href` do Exportar (`/estoque` puro → `href === '/relatorios'`; `?filtro=abaixo` + categoria → `situacao=abaixo`, `categoria=`, sem `q=`, sem `filtro=`; busca → `q=`); (b) chip `Repor` × `[data-reposicao]` com `N` medido | ❌ 6 casos `Estoque`, nenhum do Exportar/Repor |
| `e2e/app/relatorios.spec.ts` | +1 caso: aviso "Filtros recebidos do estoque", chips `span[aria-label^="Categoria:"]`/`span[aria-label="Situação: Repor"]`, Posição recortada (< 13), "Limpar filtros" → `toHaveURL(/\/relatorios$/)` e volta a 13/2/3 | ❌ 5 casos, nenhum de filtro recebido |
| `e2e/app/estoque-repor.spec.ts` | **criar** — paridade chip × `[data-reposicao]` × lista de compras | ❌ arquivo não existe |
| `navegacao.spec.ts`, `historico.spec.ts`, `produtos.spec.ts`, `movimentar.spec.ts`, `pdv.spec.ts`, `equipe-empresa.spec.ts`, `acesso/api.spec.ts`, `acesso/conta.spec.ts`, `acesso/equipe-papeis.spec.ts`, `servidor-local/compartilhado.spec.ts`, `camera/*`, `camera-sem-codigo/*`, `pdv/*`, `pwa/*` | **nenhuma edição** (contrato: `/estoque` só escreve `?filtro=`; `/relatorios` só lê params; `h1` e `aria-label` congelados) | ✅ intocados, como esperado |

**Specs prontos para colar** (números medidos pela fixture `criar_empresa_exemplo()` /
`e2e/preparar.ts`, já usados pelos specs existentes: **13 linhas** de estoque, **2**
`tr.linha-vencido`, **3** `tr.linha-vencendo`, **12** linhas em `main table tbody tr` com
"Últimos 30 dias"):

```ts
// e2e/app/painel-estoque.spec.ts › test.describe('Estoque') — ADICIONAR (não alterar os 6 atuais)

test('Exportar leva os filtros da tela para o relatório', async ({ page }) => {
  await page.goto('/estoque')
  // Sem filtro: href EXATAMENTE /relatorios (nem ?filtro=todos, nem ?q=)
  await expect(page.getByRole('link', { name: 'Exportar' })).toHaveAttribute('href', '/relatorios')

  await page.goto('/estoque?filtro=abaixo')
  await page.getByLabel('Categoria').selectOption({ label: 'Fertilizante' })
  const href = await page.getByRole('link', { name: 'Exportar' }).getAttribute('href')
  expect(href).toContain('situacao=abaixo')
  expect(href).toContain('categoria=')
  expect(href).not.toContain('q=')      // busca vazia ⇒ param omitido (juntarFiltros)
  expect(href).not.toContain('filtro=') // chave do Estoque NÃO vaza no link

  await page.getByLabel('Buscar').fill('  map  ')
  await expect(page.getByRole('link', { name: 'Exportar' })).toHaveAttribute('href', /q=map/)
  await expect(page.getByRole('link', { name: 'Exportar' })).not.toHaveAttribute('href', /q=%20/)
})

test('chip Repor mostra a mesma contagem da lista de compras', async ({ page }) => {
  await page.goto('/estoque?filtro=abaixo')
  const chip = page.getByRole('button', { name: /^Repor/ })
  // N vem do chip (mesma fonte da tela) — nunca de um count() inventado no teste.
  const N = Number((await chip.innerText()).replace(/\D+/g, ''))
  expect(N).toBeGreaterThan(0)
  await expect(page.locator('[data-reposicao]:visible')).toHaveCount(N) // toHaveCount, não count()

  await page.getByLabel('Categoria').selectOption({ label: 'Fertilizante' })
  const M = Number((await chip.innerText()).replace(/\D+/g, ''))
  expect(M).toBeLessThanOrEqual(N)
  await expect(page.locator('[data-reposicao]:visible')).toHaveCount(M)
})
```

```ts
// e2e/app/relatorios.spec.ts — ADICIONAR (não alterar os 5 atuais: são a rede de "sem params = hoje")
test('filtros recebidos do estoque aparecem, recortam e podem ser limpos', async ({ page }) => {
  await page.goto('/estoque?filtro=abaixo')
  await page.getByLabel('Categoria').selectOption({ label: 'Fertilizante' })
  const href = await page.getByRole('link', { name: 'Exportar' }).getAttribute('href')
  await page.goto(href!)

  await expect(page.getByText('Filtros recebidos do estoque')).toBeVisible()
  await expect(page.locator('span[aria-label^="Categoria:"]')).toBeVisible()
  await expect(page.locator('span[aria-label="Situação: Repor"]')).toBeVisible()

  // Posição recortada é subconjunto REAL do total sem filtro (13 na fixture)
  await page.getByRole('button', { name: 'Posição', exact: true }).click()
  await expect.poll(() => page.locator('main table tbody tr').count()).toBeLessThan(13)

  // Limpar volta ao comportamento de hoje, sem params
  await page.getByRole('button', { name: 'Limpar filtros' }).first().click()
  await expect(page).toHaveURL(/\/relatorios$/)
  await expect(page.getByText('Filtros recebidos do estoque')).toHaveCount(0)
  await expect(page.locator('main table tbody tr')).toHaveCount(13)
  await expect(page.locator('main table tbody tr.linha-vencido')).toHaveCount(2)
  await expect(page.locator('main table tbody tr.linha-vencendo')).toHaveCount(3)
})
```

> Regras de `REGRAS_E2E.md` aplicadas: asserção de contagem sempre `toHaveCount`/`toHaveAttribute`
> (o único `expect(await …count())` é **leitura do chip**, fonte da tela; e o `expect.poll`, que a
> Regra 2 permite explicitamente); `N` derivado da própria tela/fixture, nunca inventado; nenhum
> `aria-label`/`data-*`/texto de chip inventado além dos contratos de §2.5.

### 2.5 Contratos que estes specs impõem ao Programador (falha aqui = bug de código)

1. `/estoque` sem filtro ⇒ `href` **exatamente** `'/relatorios'`.
2. `q=` nunca aparece com só espaços (`juntarFiltros` de `lib/periodos.ts` já cobre; **não** montar
   `?q=` à mão).
3. `filtro=` **nunca** no `href` de destino (chave da tela Estoque).
4. Link do Exportar continua `role=link` com **texto visível `Exportar`** — a contagem vai no
   `aria-label`, nunca no texto (senão `getByRole('link', { name: 'Exportar' })` deixa de casar).
5. `Relatorios.tsx` mantém `h1` `Relatórios`, KPIs (`main .cartao:has(span.text-2xl)` → 3), abas
   `'Resumo'|'Movimentações'|'Posição'|'Compras'` com `exact: true`, rótulos `De`/`Até`/`Produto` e
   os 4 checkboxes de seção — **congelados**.
6. O aviso "Filtros recebidos do estoque" **não** pode usar `<table>`/`<tr>` (quebraria
   `toHaveCount(12)` de `acesso/api.spec.ts`) nem `aria-live` (anunciaria a cada troca de aba).

## 3. Cobertura atual dos testes

| Arquivo | Testes | Escopo |
|---|---|---|
| `src/lib/regras.test.ts` | 27 | formato (validade, `lerNumero`, `formatarDelta`), `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`, códigos de barras/GTIN, GS1, períodos + `periodoDaUrl` + `juntarFiltros`, `totaisPorGrupo`, permissões por papel, grupos de movimentação, domínio de reposição (§3.1) |
| `src/lib/relatorio.test.ts` | 3 | lista de compras do relatório (§3.3) — **sem** cobertura de filtro categoria/termo/situação (§3.6) |
| `src/lib/exportar/exportar.test.ts` | 6 | Excel (4 abas, cores, aba "Lista de compras", ausência da aba com a seção desmarcada) e PDF (`%PDF-`, cresce com a seção de compras) |
| `src/lib/exportar/lista-compra.test.ts` | 9 | `filtrarItensCompra`, `nomeArquivoListaCompra`, `gerarListaCompraExcel`, `gerarListaCompraPdf`, coluna "Comprar" (§3.4) |
| `src/lib/exportar/lista-compra-paridade.test.ts` | 4 | paridade tela × PDF do nº de embalagens (§3.5) |
| `src/pdv/venda.test.ts` | 13 | regras da venda no PDV |
| `src/pdv/sincronizador.test.ts` | 6 | sincronização offline |
| `servidor-local/supabase-local.test.ts` | 22 | banco local, tempo real (WebSocket), persistência entre reinícios |

> **Nenhum teste novo neste ciclo (T-016/T-017).** A suíte continua **90** em vitest e **171** no
> Playwright. As lacunas estão em §2.4 (E2E) e §3.6 (unitário).

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
> seja a **única** contagem usada pela tela e que `contagem.abaixo === itensRepor.length`. Depende do
> E2E pendente (§2.4) — registrado de novo neste ciclo.

### 3.2 Filtros na URL e totais da lista (T-006) — coberto

`src/lib/periodos.ts` (`periodoDaUrl`, `chaveIntervalo`, `juntarFiltros`) e
`src/lib/formato.ts` (`totaisPorGrupo`) têm casos em `regras.test.ts`:

- `periodoDaUrl` sem params → `'7dias'`; com `de`/`ate` válidos → `'personalizado'`
- mês/ano aceitos só se a data existe (`2026-02-31` **rejeitado**), `de > ate` rejeitado, `ate` no futuro rejeitado
- um lado só (`de` sem `ate`) → cai no padrão **sem lançar** (`expect(...).not.toThrow()`)
- `chaveIntervalo` → `'AAAA-MM-DD|AAAA-MM-DD'` (dependência estável de efeito)
- `juntarFiltros` → remove `tipo` nulo, remove `q` só com espaços (bug `?q=+` de T-006), preserva acentos (`guaraná`)
- `totaisPorGrupo([])` → `lancamentos: 0`; `ENTRADA/DEVOLUCAO` → entradas, `SAIDA/VENDA` → saídas, `AJUSTE/CORRECAO` → ajustes

> `juntarFiltros` é o helper que T-016 **deveria** usar para montar o `href` do Exportar. Já está
> testado e remove valor vazio — é o que garantiria `href === '/relatorios'` sem filtro.

### 3.3 Lista de compras (reposição) no relatório (T-001) — coberto

`src/lib/relatorio.test.ts` — os 3 `it()` conferidos com `--reporter=verbose`:

- `'traz só os produtos no ponto de pedido, do mais crítico ao menos crítico'` — entram **apenas**
  `abaixo`/`no_minimo`; ordenação por cobertura asc (`p2` 0,25 → `p1` 0,50 → `p3` 1,00);
  `sugestaoCompra === sugerirCompra(...)` e `cobertura === calcularCobertura(...)`
- `'sem produtos no ponto de pedido a lista vem vazia'` → `compras === []`
- `'respeita o filtro de produto'` → `produtoId` aplicado

`src/lib/exportar/exportar.test.ts` (Excel/PDF):

- `TODAS` → 4 abas **na ordem**: `Resumo por produto`, `Movimentações`, `Posição de estoque`, `Lista de compras`
- cabeçalho verde `FF047857` em `A5`; linha 5 == `Código…Comprar`; valores 3 / 10 / 0,3 / 8 no 1º produto
- lista vazia ainda cria a aba com "Nenhum produto no ponto de pedido." em `A6`
- `SEM_COMPRAS` → só 3 abas, `getWorksheet('Lista de compras')` **undefined** (CA-5)
- PDF começa com `%PDF-` e é **maior** com `compras: true` (CA-6)

### 3.4 Lista de compras fora do relatório (`lista-compra.test.ts`) — 9/9 verdes

Cobre `filtrarItensCompra`, `nomeArquivoListaCompra`, `gerarListaCompraExcel` e
`gerarListaCompraPdf`: ordem por cobertura; `situacoes === ['abaixo','no_minimo']`; cópia sem
recálculo (`sugestaoCompra === 8` com embalagem 4); `Set` vazio ⇒ `[]`; `nomeArquivoListaCompra` →
`lista-de-compras_AAAA-MM-DD.xlsx|pdf`; Excel 1 aba com `A1` empresa, `A2` "— N produtos",
`fgColor FF047857`, `rowCount === 5 + itens + 1`; aviso em `A6` sem seleção; PDF `%PDF-` e > 5000 bytes.

> **Contrato de formatação da coluna "Comprar":** **Excel** ⇒ número puro; **PDF** ⇒ texto
> `"8 kg (2 emb.)"`; **tela (`ListaReposicao`)** ⇒ o mesmo texto do PDF. As três pontas derivam de
> `formatarEmbalagens(n, conteudo_embalagem)` — nenhuma recalcula.

### 3.5 Paridade tela × PDF — embalagens (`lista-compra-paridade.test.ts`, T-011) — 4/4 verdes

Fixture: mínimo 10, saldo 3, `conteudo_embalagem` 4, `kg` → `sugestaoCompra === 8`,
`textoEmbalagensSugestao(...) === '2 emb.'`; tela === PDF; sem embalagem ⇒ `null`; sugestão zero ⇒ `null`.

> **Regra para os próximos ciclos:** todo helper puro novo em `src/lib/` **precisa** de caso em
> `regras.test.ts` (ou num `*.test.ts` próprio do módulo) no mesmo commit, **verde**. Texto que
> aparece nas duas pontas (tela e exportação) precisa de teste de **paridade**.

### 3.6 Filtro recebido do Estoque no Relatório (T-016/T-017) — **NÃO coberto**

O que **deveria** existir em `src/lib/relatorio.test.ts` (e não existe no disco — 3 `it()`, nenhum
com "filtro"):

- sem filtro (`{}` ou `undefined`): `posicao`/`compras` com as **mesmas** linhas de hoje (regressão zero);
- `{ categoria: 'cat-a' }` reduz `posicao` **e** `compras`, e **não** toca `resumo`/`movimentacoes`;
- `{ termo: '  oleo  ' }` usa `produtoCombina` (sem acento) e apara o termo;
- `situacao: 'abaixo'` na **posição** usa saldo consolidado (`saldosPorProduto` + `estoque_minimo`),
  **nunca** `l.situacao` do lote (a pegadinha nº 1 do item) e `compras` acompanha;
- `situacao: 'vencido'` filtra a posição pela situação do **lote** e **não** recorta `compras`.

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
npx playwright test --list                                            # inventário sem rodar
npx playwright test e2e/app/painel-estoque.spec.ts e2e/app/relatorios.spec.ts
npx playwright test e2e/app/estoque-repor.spec.ts                     # só depois de criar o arquivo
```

## 5. Checklist de PR (não pular)

- [x] `npx tsc --noEmit` exit 0
- [x] `npx tsc -p e2e/tsconfig.json --noEmit` exit 0
- [x] `npx vitest run` 0 falhas (90/90)
- [x] `npm run build` exit 0 (2303 módulos, PWA ok, 901 ms)
- [ ] `npx playwright test` verde (**não executado neste ciclo** — gate externo + PGlite)
- [ ] **T-016:** `href` do Exportar via `juntarFiltros` com `categoria`/`q`/`situacao` (não existe em `Estoque.tsx:187`)
- [ ] **T-017:** leitura de `q`/`categoria`/`situacao` + `filtroPosicao` em `montarRelatorio` (não existe)
- [ ] **T-017:** `Aviso "Filtros recebidos do estoque"` + chips `span[aria-label]` + "Limpar filtros" (não existe)
- [ ] **T-017:** `Vazio` na aba Posição quando o filtro zera a lista (não existe)
- [ ] Teste puro de `filtroPosicao` em `relatorio.test.ts` (§3.6) — **não existe**
- [ ] `e2e/app/painel-estoque.spec.ts`: `href` do Exportar e chip `Repor` × `[data-reposicao]` — **não existe**
- [ ] `e2e/app/relatorios.spec.ts`: filtros recebidos + "Limpar filtros" — **não existe**
- [ ] `e2e/app/estoque-repor.spec.ts` (novo, herdado de T-009): paridade chip × lista × arquivo — **não existe**
- [ ] Filtros de URL sem teste de componente (só unidade em `periodos.ts`) — pendente de T-006
- [ ] Checkbox "Lista de compras (reposição)" e toast "Escolha pelo menos uma seção do relatório."
      (CA-7) só por revisão de código — projeto sem `@testing-library`/`*.test.tsx`
- [ ] T-008 (foco do modal "Estoque mínimo") segue aberto no backlog
- [ ] Se `montarRelatorio` ganhar o 7º parâmetro, `exportar.test.ts`/`lista-compra.test.ts` precisam
      continuar verdes **sem edição** (prova de compatibilidade)
