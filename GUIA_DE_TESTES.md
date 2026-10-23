# Guia de Testes — ERP Galpão

> **Estado deste ciclo (reenvio de T-021 — `?produto=` do Relatórios na URL, ciclo de DOCUMENTAÇÃO):**
> o **gate mecânico** (`qa_gate.py`) é quem roda tsc/vitest/build/playwright e emite o veredito final.
> Este QA **documenta** e roda o verificável no Node local. Fatos deste ciclo (executados por mim,
> não relato do DEV):

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | nenhum erro de tipo em `src/` |
| `npx tsc -p e2e/tsconfig.json --noEmit` | **0** | specs + `base.ts` + `vite.config.ts` sem erro |
| `npx vitest run` | **0** | **8 arquivos · 90/90** (10,63 s de parede; tests 86%) |
| `npm run build` | **0** | `tsc -p .` + `vite build` · 2303 módulos · PWA `generateSW` · 11 precache · 1.018,59 KiB · 1,06 s |
| `npx playwright test --list` | **0** | **171 testes / 17 arquivos** |
| `npx playwright test` (execução real) | — | **NÃO executado por mim**: depende do `webServer` + PGlite de `e2e/preparar.ts`; fica no gate externo |
| `npm run lint` | — | **não existe** neste projeto (`Missing script: "lint"`) — não é erro de código |

> ⚠️ **Achado factual (reconfirmado neste ciclo, sem maquiar):** T-021 **não está no código** e a
> cobertura prometida no relatório de entrega **não está no disco**:
>
> - `src/pages/Relatorios.tsx` → `const [produtoId, setProdutoId] = useState('')`;
>   `refletirNaUrl(p, i)` só grava `de`/`ate` com `new URLSearchParams`; o `<select id="r-produto">`
>   tem apenas `onChange={e => setProdutoId(e.target.value)}`. **Não há** leitura de `?produto=`,
>   `produtoDaUrl`, `escolherProduto`, `limparProduto`, `Aviso` de recorte nem `data-filtro="produto"`.
> - `src/lib/periodos.ts` → termina em `juntarFiltros()`; **não existe** `produtoDaUrl`/`paramsDoPeriodo`.
> - `src/lib/estoque.ts` → **não existe** `filtrarRecorte` (T-019 também não entrou).
> - `src/lib/relatorio.test.ts` → **3 `it()`** (os de T-001); nenhum de id inexistente.
> - `src/lib/regras.test.ts` → 27 `it()`; nenhuma asserção de `produto: ''` em `juntarFiltros`.
> - `e2e/app/relatorios.spec.ts` → **5 casos**; nenhum de `?produto=`/reload/limpar.
>
> Suíte total segue **90** (vitest) e **171** (Playwright) — **idêntica** a T-009/T-016/T-021 anterior.
> Quadro critério-a-critério em §2.2. **Nada aqui aprova nem reprova** — isso é do `qa_gate.py`.

---

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

## 2. Última verificação (QA) — reenvio de T-021

Distribuição da suíte (**inalterada** — nenhum teste novo entrou no disco neste ciclo):

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
| **Total** | **90** |

E2E (`npx playwright test --list` → **171 testes / 17 arquivos**): `app/painel-estoque.spec.ts`
(9 casos × 2 projetos), `app/relatorios.spec.ts` (**5** × 2), `app/navegacao.spec.ts`,
`app/historico.spec.ts`, `app/produtos.spec.ts`, `app/movimentar.spec.ts`, `app/pdv.spec.ts`,
`app/equipe-empresa.spec.ts`, `acesso/api.spec.ts`, `acesso/conta.spec.ts`,
`acesso/equipe-papeis.spec.ts`, `servidor-local/compartilhado.spec.ts`, `camera/*`,
`camera-sem-codigo/*`, `pdv/*`, `pwa/*`.

### 2.1 O que o código de produção tem hoje (conferido por leitura nesta rodada)

| Arquivo | O que está lá |
|---|---|
| `src/pages/Relatorios.tsx` | ❌ `useState('')` para `produtoId`; `refletirNaUrl(p, i)` só grava `de`/`ate` via `new URLSearchParams` + `setParams(…, { replace: true })`; `<select id="r-produto" … onChange={e => setProdutoId(e.target.value)}>`. Sem `produtoDaUrl`, sem `escolherProduto`, sem botão Limpar, sem `Aviso` de recorte, sem `data-filtro="produto"`. **T-021 não está no código.** |
| `src/lib/periodos.ts` | ❌ `periodoDaUrl` + `chaveIntervalo` + `juntarFiltros` apenas. **Sem** `produtoDaUrl`/`paramsDoPeriodo`. O helper para reaproveitar (`juntarFiltros`) já existe e é testado. |
| `src/lib/estoque.ts` | ❌ Sem `filtrarRecorte` (T-019 não entrou). `Estoque.tsx` continua filtrando à mão. |
| `src/lib/relatorio.ts` | `montarRelatorio(intervalo, produtos, lotes, movsDesdeInicio, nomeCategoria, produtoId?)` — `doFiltro` já ignora id inexistente (base para o critério 3 de T-021). |
| `src/lib/relatorio.test.ts` | 3 `it()`; o de filtro por produto existe e passa. **Nenhum** caso de id inexistente. |
| `src/lib/regras.test.ts` | 27 `it()`; `juntarFiltros` coberto (remove `tipo` nulo, remove `q` só de espaços, preserva acento) — **sem** asserção de `produto`. |

Consequência prática para o operador (**o bug de T-021 continua vivo**): escolher **"Glifosato 480 SL"**
no Relatório, copiar o link (ou apertar F5 no galpão) abre **"Todos os produtos"** — o recorte por
produto não sobrevive ao link nem ao reload, e o arquivo exportado sai com o estoque inteiro.

### 2.2 Critérios de aceite de T-021 — veredito por evidência de disco

| # | Critério do plano | Evidência | Veredito |
|---|---|---|---|
| 1 | `?produto=<id>` no mount seleciona o produto e o relatório já sai filtrado | `useState('')` fixo; nenhuma leitura de `params.get('produto')` | **NÃO CUMPRIDO** |
| 2 | Trocar o select escreve a URL com `juntarFiltros` (`replace`), sem params vazios | `onChange` só faz `setProdutoId`; `refletirNaUrl` não conhece produto | **NÃO CUMPRIDO** |
| 3 | `produto=` inexistente é ignorado (select em "Todos os produtos"), sem lançar | não há código que leia o param — só existe por omissão | **NÃO CUMPRIDO** |
| 4 | `refletirNaUrl` usa `juntarFiltros` em vez de `new URLSearchParams`/`delete` à mão | `Relatorios.tsx` ainda monta `URLSearchParams` manualmente | **NÃO CUMPRIDO** |
| 5 | Teste de filtro por produto mantido + novo caso de id inexistente | `relatorio.test.ts` 3/3; nenhum de id inexistente | **PARCIAL** |
| 6 | Sem regressão: `npx tsc --noEmit` e `npm run test` verdes | tsc 0 · tsc e2e 0 · vitest **90/90** · build 0 | **CUMPRIDO (baseline)** |

### 2.3 Regressão conferida (nada caiu em relação a T-016/T-009)

- `regras.test.ts` 27/27 — domínio de reposição, períodos/`juntarFiltros`, `totaisPorGrupo` intactos.
- `relatorio.test.ts` 3/3, `exportar.test.ts` 6/6 (4 abas na ordem, `A5='Código'`, `FF047857`, aba
  ausente com `compras:false`), `lista-compra.test.ts` 9/9, `lista-compra-paridade.test.ts` 4/4.
- `servidor-local/supabase-local.test.ts` 22/22 (banco em pasta + tempo real).
- `npm run build` exit 0 → nenhuma importação quebrada, nenhum erro de tipo no `tsc -p .`.

### 2.4 E2E — o que **não** existe no disco (dívida aberta, sem maquiar)

`listar_arquivos('e2e/app')` → `equipe-empresa.spec.ts`, `historico.spec.ts`, `movimentar.spec.ts`,
`navegacao.spec.ts`, `painel-estoque.spec.ts`, `pdv.spec.ts`, `produtos.spec.ts`,
`relatorios.spec.ts`. **Não existe `e2e/app/estoque-repor.spec.ts`** (pendência herdada de T-009).

| Spec | Esperado para T-021 | Estado no disco |
|---|---|---|
| `e2e/app/relatorios.spec.ts` | **+3 casos**: (a) `goto('/relatorios?produto=<id do Glifosato>')` → `combobox` com `toHaveValue(id)` + `main table tbody tr` = 1, e **repetir após `reload()`**; (b) `goto('/relatorios?produto=00000000-0000-0000-0000-000000000000')` → `combobox` `toHaveValue('')` e período padrão; (c) escolher no select → `toHaveURL(/[?&]produto=/)`; botão `Limpar filtro de produto` → `toHaveURL(/\/relatorios$/)` | ❌ 5 casos (os de T-001); nenhum de `?produto=`/reload/limpar |
| `e2e/app/navegacao.spec.ts` | revisar, **sem mudança esperada** (`/relatorios$` no menu + `semRolagemHorizontal`) | ✅ intocado |
| `e2e/acesso/api.spec.ts` | revisar, **sem mudança esperada** (fluxo `de`/`ate` e `ocorrido_em gte.` inalterado) | ✅ intocado |
| `e2e/app/painel-estoque.spec.ts` | fora de escopo (T-016/T-020) | ✅ intocado |

**Specs prontos para colar** (fixture `criar_empresa_exemplo()` / `e2e/preparar.ts`; números já
usados pelos specs existentes: **1** linha em `?produto=<Glifosato>` com período personalizado de
-60 dias, **12** linhas em "Últimos 30 dias", **13** linhas na Posição):

```ts
// e2e/app/relatorios.spec.ts › test.describe('Relatórios') — ADICIONAR (não alterar os 5 atuais)

test('abrir o relatório por link com ?produto= mantém o recorte', async ({ page, conta }) => {
  const [p] = await conta.servidor.sql(
    'select id from public.produtos where empresa_id = $1 and nome = $2',
    [conta.empresaId, 'Glifosato 480 SL'],
  )
  await page.goto(`/relatorios?produto=${p.id}`)
  const combo = page.getByRole('combobox', { name: 'Produto' })
  await expect(combo).toHaveValue(p.id)
  await expect(page.locator('main table tbody tr')).toHaveCount(1)
  await page.reload()                       // ← é o ponto do item: o recorte sobrevive ao F5
  await expect(combo).toHaveValue(p.id)
  await expect(page.locator('main table tbody tr')).toHaveCount(1)
})

test('produto inexistente na URL não quebra e cai em Todos os produtos', async ({ page }) => {
  await page.goto('/relatorios?produto=00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('combobox', { name: 'Produto' })).toHaveValue('')
  await expect(page.locator('main table tbody tr')).toHaveCount(12)   // período padrão = últimos 7 dias
})

test('trocar o produto escreve ?produto= na URL e Limpar remove', async ({ page }) => {
  await page.goto('/relatorios')
  await page.getByRole('combobox', { name: 'Produto' }).selectOption({ label: 'Glifosato 480 SL' })
  await expect(page).toHaveURL(/[?&]produto=/)
  await page.getByRole('button', { name: 'Limpar filtro de produto' }).click()
  await expect(page).toHaveURL(/\/relatorios$/)
  await expect(page.getByRole('combobox', { name: 'Produto' })).toHaveValue('')
})
```

```ts
// src/lib/relatorio.test.ts — ADICIONAR ao describe atual
it('id de produto inexistente é ignorado (relatório completo)', () => {
  const produtos = [produto('p1', { estoque_minimo: 20 }), produto('p2', { estoque_minimo: 20 })]
  const lotes = [lote('p1', 1), lote('p2', 2)]
  const semFiltro = montarRelatorio(intervalo, produtos, lotes, [mov], () => 'Cat')
  const comIdFantasma = montarRelatorio(intervalo, produtos, lotes, [mov], () => 'Cat', 'nao-existe')
  expect(comIdFantasma.compras).toEqual(semFiltro.compras)   // não recorta nada
  expect(comIdFantasma.resumo).toEqual(semFiltro.resumo)
})
```

> Regras de `REGRAS_E2E.md` aplicadas: contagem sempre com `toHaveCount`; `toHaveURL` com regex
> ancorada (`/\/relatorios$/`); **nenhum** seletor existente renomeado (`getByLabel('De', { exact: true })`
> e `getByRole('combobox', { name: 'Produto' })` são contrato).

### 2.5 Contratos que estes specs impõem ao Programador (falha aqui = bug de código)

1. `<label className="rotulo" htmlFor="r-produto">Produto</label>` **não muda** ⇒ nome acessível do
   combobox continua `Produto` (`relatorios.spec.ts:52` depende disso).
2. `<option value="">Todos os produtos</option>` e `<option value={p.id}>{p.nome}</option>` **congelados**.
3. `?produto=` inválido **não** gera toast nem erro de console (`base.ts` escaneia `errosConsole`) —
   a tela cai em "Todos os produtos".
4. Aviso de recorte **não** pode usar `<table>`/`<tr>` (quebraria `toHaveCount(12)` de
   `acesso/api.spec.ts`) nem `aria-live` (o `toast()` do E2E usa `[aria-live="polite"]`; um segundo
   `aria-live` na página cria ambiguidade).
5. `Limpar filtro de produto` é `aria-label` **novo e único** — não colidir com `Limpar filtros` do
   Histórico nem com `Baixar PDF`/`Baixar Excel (.xlsx)`.
6. `refletirNaUrl` continua sendo o **único** escritor de URL; `''` ⇒ `null` ⇒ parâmetro **removido**
   (contrato de `juntarFiltros`). Não montar `?produto=` à mão.

## 3. Cobertura atual dos testes

| Arquivo | Testes | Escopo |
|---|---|---|
| `src/lib/regras.test.ts` | 27 | formato (validade, `lerNumero`, `formatarDelta`), `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`, códigos de barras/GTIN, GS1, períodos + `periodoDaUrl` + `juntarFiltros`, `totaisPorGrupo`, permissões por papel, grupos de movimentação, domínio de reposição (§3.1) |
| `src/lib/relatorio.test.ts` | 3 | lista de compras do relatório (§3.3) — **sem** cobertura de id de produto inexistente (§3.6) |
| `src/lib/exportar/exportar.test.ts` | 6 | Excel (4 abas, cores, aba "Lista de compras", ausência da aba com a seção desmarcada) e PDF (`%PDF-`, cresce com a seção de compras) |
| `src/lib/exportar/lista-compra.test.ts` | 9 | `filtrarItensCompra`, `nomeArquivoListaCompra`, `gerarListaCompraExcel`, `gerarListaCompraPdf`, coluna "Comprar" (§3.4) |
| `src/lib/exportar/lista-compra-paridade.test.ts` | 4 | paridade tela × PDF do nº de embalagens (§3.5) |
| `src/pdv/venda.test.ts` | 13 | regras da venda no PDV |
| `src/pdv/sincronizador.test.ts` | 6 | sincronização offline |
| `servidor-local/supabase-local.test.ts` | 22 | banco local, tempo real (WebSocket), persistência entre reinícios |

> **Nenhum teste novo neste ciclo.** A suíte continua **90** em vitest e **171** no Playwright.
> Lacunas em §2.4 (E2E) e §3.6 (unitário).

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

> **Contratos que nenhum teste unitário ainda trava:** (a) `contagem.abaixo === itensRepor.length`
> na tela (T-020); (b) `filtrarRecorte()` como porta única do recorte (T-019) — a função **não existe**.
> Dependem do E2E pendente (§2.4).

### 3.2 Filtros na URL e totais da lista (T-006) — coberto

`src/lib/periodos.ts` (`periodoDaUrl`, `chaveIntervalo`, `juntarFiltros`) e
`src/lib/formato.ts` (`totaisPorGrupo`) têm casos em `regras.test.ts`:

- `periodoDaUrl` sem params → `'7dias'`; com `de`/`ate` válidos → `'personalizado'`
- mês/ano aceitos só se a data existe (`2026-02-31` **rejeitado**), `de > ate` rejeitado, `ate` no futuro rejeitado
- um lado só (`de` sem `ate`) → cai no padrão **sem lançar** (`expect(...).not.toThrow()`)
- `chaveIntervalo` → `'AAAA-MM-DD|AAAA-MM-DD'` (dependência estável de efeito)
- `juntarFiltros` → remove `tipo` nulo, remove `q` só com espaços (bug `?q=+` de T-006), preserva acentos (`guaraná`)
- `totaisPorGrupo([])` → `lancamentos: 0`; `ENTRADA/DEVOLUCAO` → entradas, `SAIDA/VENDA` → saídas, `AJUSTE/CORRECAO` → ajustes

> `juntarFiltros` é o helper que **T-021 precisa** para escrever `?produto=`. Já testado e remove
> valor vazio — o contrato `'' ⇒ parâmetro removido` é exatamente o do botão "Limpar filtro de produto".
> Falta só a asserção explícita de `produto` (§3.6).

### 3.3 Lista de compras (reposição) no relatório (T-001) — coberto

`src/lib/relatorio.test.ts` — os 3 `it()` conferidos:

- `'traz só os produtos no ponto de pedido, do mais crítico ao menos crítico'` — entram **apenas**
  `abaixo`/`no_minimo`; ordenação por cobertura asc (`p2` 0,25 → `p1` 0,50 → `p3` 1,00);
  `sugestaoCompra === sugerirCompra(...)` e `cobertura === calcularCobertura(...)`
- `'sem produtos no ponto de pedido a lista vem vazia'` → `compras === []`
- `'respeita o filtro de produto'` → `produtoId` aplicado **e** `compras` recortada

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

### 3.6 Filtro de produto na URL do Relatório (T-021) — **NÃO coberto**

O que **deveria** existir e não existe no disco:

- `src/lib/relatorio.test.ts`: **+1 `it()`** — id de produto inexistente é ignorado (`compras`/`resumo`
  iguais ao relatório sem filtro). O `doFiltro` já ignora, mas sem teste a garantia é acidental.
- `src/lib/regras.test.ts`: **+1 asserção** em `juntarFiltros` —
  `expect(juntarFiltros(base, { produto: '' }).has('produto')).toBe(false)`.
- Se `produtoDaUrl()` for criado em `periodos.ts`: **exige caso próprio** (id válido ⇒ devolve o id;
  id fora do catálogo ⇒ `''`; catálogo vazio ⇒ `''`; param ausente ⇒ `''`) — mesma regra de
  `periodoDaUrl`: "link quebrado não derruba a tela".
- `e2e/app/relatorios.spec.ts`: os **3 casos de §2.4**.

## 4. Como rodar um teste isolado

```bash
npx vitest run src/lib/regras.test.ts
npx vitest run src/lib/relatorio.test.ts
npx vitest run src/lib/exportar/lista-compra.test.ts
npx vitest run src/lib/exportar/lista-compra-paridade.test.ts
npx vitest run -t "paridade tela × PDF"
npx vitest run -t "id de produto inexistente"
npx tsc -p e2e/tsconfig.json --noEmit        # tipagem dos specs, sem rodar Playwright
```

Playwright:

```bash
npx playwright test --list                                            # inventário sem rodar
npx playwright test e2e/app/relatorios.spec.ts e2e/app/navegacao.spec.ts
npx playwright test -g "produto=" e2e/app/relatorios.spec.ts          # só os casos de T-021
npx playwright test e2e/app/estoque-repor.spec.ts                     # só depois de criar o arquivo
```

## 5. Checklist de PR (não pular)

- [x] `npx tsc --noEmit` exit 0
- [x] `npx tsc -p e2e/tsconfig.json --noEmit` exit 0
- [x] `npx vitest run` 0 falhas (90/90)
- [x] `npm run build` exit 0 (2303 módulos, PWA ok, 1,06 s)
- [ ] `npx playwright test` verde (**não executado neste ciclo** — gate externo + PGlite)
- [ ] **T-021:** `?produto=` lido no mount + reconciliação pós-catálogo (não existe em `Relatorios.tsx`)
- [ ] **T-021:** `escolherProduto` escrevendo a URL via `juntarFiltros` (não existe)
- [ ] **T-021:** botão `Limpar filtro de produto` + `Aviso` de recorte ativo (não existe)
- [ ] **T-021:** `refletirNaUrl` sem `new URLSearchParams` manual (não existe)
- [ ] **T-021:** `relatorio.test.ts` com caso de id inexistente (não existe)
- [ ] **T-021:** `regras.test.ts` com asserção `produto: '' ⇒ remove` (não existe)
- [ ] **T-021:** 3 casos E2E de `?produto=` em `relatorios.spec.ts` (não existem)
- [ ] **T-016:** `href` do Exportar via `juntarFiltros` com `categoria`/`q`/`situacao` (não existe em `Estoque.tsx`)
- [ ] **T-017:** leitura de `q`/`categoria`/`situacao` + `filtroPosicao` em `montarRelatorio` (não existe)
- [ ] **T-019:** `filtrarRecorte()` em `lib/estoque.ts` (não existe)
- [ ] **T-020:** teste de contagem chip `Repor` × tabela × compras (não existe)
- [ ] `e2e/app/estoque-repor.spec.ts` (novo, herdado de T-009): paridade chip × lista × arquivo — **não existe**
- [ ] Filtros de URL sem teste de componente (só unidade em `periodos.ts`) — pendente de T-006
- [ ] Checkbox "Lista de compras (reposição)" e toast "Escolha pelo menos uma seção do relatório."
      (CA-7) só por revisão de código — projeto sem `@testing-library`/`*.test.tsx`
- [ ] T-008 (foco do modal "Estoque mínimo") segue aberto no backlog
- [ ] Se `montarRelatorio` ganhar o 7º parâmetro, `exportar.test.ts`/`lista-compra.test.ts` precisam
      continuar verdes **sem edição** (prova de compatibilidade)
