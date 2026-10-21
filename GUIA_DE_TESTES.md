# Guia de Testes — ERP Galpão

> **Ciclo atual — T-023 (recorte do Estoque/Relatórios na URL). Papel deste ciclo: DOCUMENTAÇÃO.**
> O gate mecânico (`qa_gate.py`) roda tsc/vitest/build/playwright e emite o veredito. Este QA leu o
> plano (`memoria/estado.json` → `plano_atual` estava `null`; plano lido do contexto da tarefa:
> `item=T-023`, `arquivos=4`) e rodou o que é verificável no Node local. **Nada abaixo é relato de DEV.**
> `npx playwright test` (execução real) **NÃO foi executado por mim** — depende do `webServer` + PGlite
> de `e2e/preparar.ts` e fica no gate externo.

## 0. Verificação executada neste ciclo (fatos)

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | nenhum erro de tipo em `src/` |
| `npx tsc -p e2e/tsconfig.json --noEmit` | **0** | specs + `base.ts` + `preparar.ts` + `vite.config.ts` sem erro |
| `npx vitest run` | **0** | **8 arquivos · 90/90** (11,54 s; tests 85%) |
| `npx vitest run src/lib/regras.test.ts --reporter=verbose` | **0** | **27/27** — nomes listados em §3.2 |
| `npx vitest run src/lib/relatorio.test.ts --reporter=verbose` | **0** | **3/3** |
| `npm run build` | **0** | `tsc -p .` + `vite build` · 2303 módulos · PWA `generateSW` · 11 precache · 1.018,62 KiB · 1,56 s |
| `npx playwright test --list` | **0** | **171 testes / 17 arquivos** |
| `npx playwright test` (execução real) | — | **NÃO executado** (gate externo + PGlite) |
| `npm run lint` | — | **não existe** (`Missing script: "lint"`) — não é erro de código |

> ⚠️ **Achado factual (sem maquiar): nenhum teste novo entrou no disco neste ciclo.**
> A suíte continua **90** (vitest) e **171** (Playwright) — idêntica aos ciclos T-009/T-011/T-016/T-021.
> Os casos que o plano de T-023 prometeu (critério 5 em `periodos.test.ts`/`regras.test.ts` e os
> casos de `?q=`/`?categoria=`/`?ordem=`/`?produto=` em `painel-estoque.spec.ts`/`relatorios.spec.ts`)
> **não estão no disco**. Detalhe critério-a-critério em §2.2 e a lista exata de testes que **faltam**
> em §2.4 / §3.6.

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

## 2. Última verificação (QA) — T-023

### 2.1 O que existe no código hoje (conferido por leitura nesta rodada)

| Arquivo | Estado real no disco |
|---|---|
| `src/pages/Estoque.tsx` | ❌ **T-023 NÃO implementado.** `const [termo, setTermo] = useState('')`, `const [categoria, setCategoria] = useState('')`, `const [ordem, setOrdem] = useState<Ordem>('nome')`. Só `filtro` é lido da URL (`FILTROS.find(f => f.valor === params.get('filtro'))`). `mudarFiltro` monta `new URLSearchParams(params)` **à mão** (não usa `juntarFiltros`). O `<input aria-label="Buscar">` chama `setTermo`, o `<select aria-label="Categoria">` chama `setCategoria`, o `<select aria-label="Ordenar por">` chama `setOrdem` — nenhum escreve na URL. Não há debounce, não há `escrever()`, não há validação de `categoria`/`ordem` vinda da URL. |
| `src/pages/Relatorios.tsx` | ❌ **T-023 NÃO implementado.** `const [produtoId, setProdutoId] = useState('')`; `refletirNaUrl(p, i)` só grava `de`/`ate` via `new URLSearchParams` + `setParams(…, { replace: true })`; `<select id="r-produto" … onChange={e => setProdutoId(e.target.value)}>`. Sem leitura de `?produto=`, sem validação contra `produtos`. |
| `src/lib/periodos.ts` | ✅ `juntarFiltros` **já atende** aos critérios 4 e 5: `const valor = typeof bruto === 'string' ? bruto.trim() : bruto; if (valor) proximo.set(...) else proximo.delete(...)`. `periodoDaUrl` + `chaveIntervalo` intactos. Nenhum helper novo foi adicionado (e nenhum era necessário). |
| `src/lib/regras.test.ts` | 27 `it()` — **igual** ao ciclo anterior. O caso `chaveIntervalo e juntarFiltros alimentam o link compartilhável` cobre `tipo: null` removido, `q: ' '` (só espaços) removido e `q: 'guaraná'` preservado. **Faltam** as asserções explícitas de §3.6. |
| `src/lib/periodos.test.ts` | **NÃO EXISTE** — o plano de T-023 listou esse arquivo; o arquivo real é `src/lib/regras.test.ts`. Criar um `periodos.test.ts` novo duplicaria casos sem aviso ao owner de testes. |
| `e2e/app/painel-estoque.spec.ts` | 6 casos `Estoque` + 4 `Painel`. Nenhum de `?q=`/`?categoria=`/`?ordem=`/reload. |
| `e2e/app/relatorios.spec.ts` | 5 casos. Nenhum de `?produto=`/reload. |
| `e2e/app/navegacao.spec.ts` | intacto — é o guarda de `semRolagemHorizontal` em `/estoque` e `/relatorios`. |
| `e2e/app/estoque-repor.spec.ts` | **não existe** (dívida herdada de T-009). |
| `memoria/estado.json` | `"plano_atual": null`, `"ciclos": 0`, backlog com **1** item (T-034) — divergente do `historico.md`, que tem 13 ciclos. Divergência de ferramenta, não de código. |

### 2.2 Critérios de aceite de T-023 — veredito por evidência de disco

| # | Critério do plano | Evidência no disco | Veredito |
|---|---|---|---|
| 1 | `?q=&categoria=&ordem=` no mount de `Estoque.tsx` repovoam busca/select/ordenação; digitar/escolher reescreve a URL com `replace` preservando `filtro=` | `useState('')`/`useState('nome')` fixos; nenhuma leitura de `params.get('q'\|'categoria'\|'ordem')`; handlers só chamam `setTermo`/`setCategoria`/`setOrdem` | **NÃO CUMPRIDO** |
| 2 | `categoria` inexistente e `ordem` fora de `nome\|validade\|situacao` são ignoradas sem quebrar e sem apagar o parâmetro | não há código que leia esses params — não há o que validar | **NÃO CUMPRIDO** |
| 3 | `?produto=<id>` no mount de `Relatorios.tsx` seleciona o produto; trocar o select atualiza a URL; id desconhecido → "Todos os produtos" | `useState('')` + `onChange={e => setProdutoId(e.target.value)}` | **NÃO CUMPRIDO** |
| 4 | Espaços nas pontas não vão para a URL e filtro em branco remove o parâmetro (via `juntarFiltros`) | helper **correto** (`trim()` + `delete`), mas **nenhum consumidor** de T-023 o usa | **PARCIAL** (helper OK, integração ausente) |
| 5 | Teste puro: `juntarFiltros` remove chave vazia/só-espaços e preserva as demais; `periodoDaUrl` → 7 dias para sem params, `de>ate`, `2026-02-31` e data futura | `regras.test.ts` já cobre `de>ate`, `2026-02-31` e futuro em `periodoDaUrl: um lado só, data inexistente, invertida ou no futuro cai no padrão sem lançar`; cobre `q: ' '` removido em `chaveIntervalo e juntarFiltros alimentam o link compartilhável`. **Nenhum `it()` novo**; falta a asserção "só-espaços preserva as demais" isolada e explícita | **PARCIAL** |
| 6 | Comportamento visível inalterado sem filtros na URL; `npm test` e `npm run build` verdes | tsc 0 · tsc e2e 0 · vitest **90/90** · build **exit 0** (2303 módulos, PWA ok). Layout não foi tocado (nenhuma classe/`aria-label`/`role` alterado) | **CUMPRIDO** (baseline mecânico) |

### 2.3 Regressão conferida (nada caiu)

- `regras.test.ts` **27/27** — formato, `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`,
  códigos/GTIN, GS1, períodos + `periodoDaUrl` + `juntarFiltros`, `totaisPorGrupo`, permissões,
  grupos de movimentação, domínio de reposição.
- `relatorio.test.ts` **3/3** (`traz só os produtos no ponto de pedido…`, `sem produtos no ponto de
  pedido a lista vem vazia`, `respeita o filtro de produto`).
- `npm run build` exit 0 → nenhuma importação quebrada, nenhum erro de tipo em `tsc -p .`, PWA
  `generateSW` com 11 entradas de precache (1.018,62 KiB).

### 2.4 Testes que **faltam** (dívida aberta, pronta para colar)

**`e2e/app/painel-estoque.spec.ts` › `describe('Estoque')` — ADICIONAR (não alterar os 6 atuais):**

```ts
test('recorte da lista sobrevive a recarregar (T-023)', async ({ page }) => {
  await page.goto('/estoque?filtro=vencido&q=atrazina&ordem=validade')
  await expect(linhasEstoque(page)).toHaveCount(1)
  await expect(page.getByLabel('Buscar')).toHaveValue('atrazina')
  await expect(page.getByLabel('Ordenar por')).toHaveValue('validade')
  await page.reload()
  await expect(page.getByLabel('Buscar')).toHaveValue('atrazina')
  await expect(linhasEstoque(page)).toHaveCount(1)
})

test('categoria/ordem inválidas na URL são ignoradas sem quebrar (T-023)', async ({ page }) => {
  await page.goto('/estoque?categoria=nao-existe&ordem=xxx')
  await expect(linhasEstoque(page)).toHaveCount(13)          // lista completa da fixture
  await expect(page.getByLabel('Categoria')).toHaveValue('')
  await expect(page.getByLabel('Ordenar por')).toHaveValue('nome')
})

test('digitar na busca grava ?q= com replace, sem empilhar histórico (T-023)', async ({ page }) => {
  await page.goto('/estoque')
  await page.getByLabel('Buscar').fill('atrazina')
  await expect(linhasEstoque(page)).toHaveCount(1)            // debounce já resolveu
  await expect(page).toHaveURL(/[?&]q=atrazina/)
  await page.goBack()
  await expect(page).toHaveURL(/\/painel/)                    // replace: volta UMA vez, não letra a letra
})
```

**`e2e/app/relatorios.spec.ts` — ADICIONAR (não alterar os 5 atuais):**

```ts
test('produto escolhido sobrevive a recarregar (T-023)', async ({ page }) => {
  await page.goto('/relatorios')
  await page.getByRole('combobox', { name: 'Produto' }).selectOption({ label: 'Glifosato 480 SL' })
  await expect(page).toHaveURL(/[?&]produto=/)
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Produto' })).not.toHaveValue('')
  await expect(page.locator('main table tbody tr')).toHaveCount(1)
})

test('?produto= desconhecido cai em Todos os produtos (T-023)', async ({ page }) => {
  await page.goto('/relatorios?produto=nao-existe')
  await expect(page.getByRole('combobox', { name: 'Produto' })).toHaveValue('')
})
```

**Contratos que estes specs impõem ao Programador (falha aqui = bug de código):**

1. `aria-label` `Buscar`, `Categoria`, `Ordenar por`, `Produto` e `role` (`group` `aria-label='Filtrar estoque'`,
   `combobox`) **não mudam** — `painel-estoque.spec.ts` e `relatorios.spec.ts` dependem disso.
2. `[data-linha-estoque]`, `[data-situacao]` e as classes `linha-<situacao>` **congelados** (`base.ts › linhasEstoque`).
3. `toHaveURL(/filtro=ok/)` (L70) é regex **não ancorada**: tolera `?q=&filtro=ok` — trocar de chip não pode
   apagar `q`/`categoria`/`ordem` (é o que `juntarFiltros` garante).
4. URL inválida (`categoria`/`ordem`/`produto` desconhecidos) **não** pode gerar toast, `Aviso` de erro nem
   erro de console — `base.ts` escaneia `[aria-live="polite"]` e `errosConsole`.
5. Toda escrita de URL com `replace: true` (nunca `push`): voltar do navegador sai da tela.
6. Textos `'Todas as categorias'`, `'Todos os produtos'`, `'Movimentações'`, `'Posição'` **congelados**.

### 2.5 Responsividade / não-regressão visual

`e2e/app/navegacao.spec.ts › semRolagemHorizontal` roda em `/estoque` e `/relatorios` em todos os
projetos Playwright (320/360/390/768/1280 px) e é o guarda de T-023 — a única rolagem lateral
permitida é a faixa de chips (`.rolagem-x`) e o `overflow-x-auto` interno dos cartões de tabela do
Relatórios (dívida T-032). Nenhum componente novo foi criado em T-023, então **não há pixel novo a
revisar**; se a URL passar a preencher campos, só os valores dentro de `.campo` mudam.

---

## 3. Cobertura atual dos testes

| Arquivo | Testes | Escopo |
|---|---|---|
| `src/lib/regras.test.ts` | 27 | formato, `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`, códigos/GTIN, GS1, períodos + `periodoDaUrl` + `juntarFiltros`, `totaisPorGrupo`, permissões por papel, grupos de movimentação, domínio de reposição (§3.1) |
| `src/lib/relatorio.test.ts` | 3 | lista de compras do relatório (§3.3) |
| `src/lib/exportar/exportar.test.ts` | 6 | Excel (4 abas, cores, aba "Lista de compras", ausência da aba com a seção desmarcada) e PDF (`%PDF-`, cresce com a seção de compras) |
| `src/lib/exportar/lista-compra.test.ts` | 9 | `filtrarItensCompra`, `nomeArquivoListaCompra`, `gerarListaCompraExcel`, `gerarListaCompraPdf`, coluna "Comprar" (§3.4) |
| `src/lib/exportar/lista-compra-paridade.test.ts` | 4 | paridade tela × PDF do nº de embalagens (§3.5) |
| `src/pdv/venda.test.ts` | 13 | regras da venda no PDV |
| `src/pdv/sincronizador.test.ts` | 6 | sincronização offline |
| `servidor-local/supabase-local.test.ts` | 22 | banco local, tempo real (WebSocket), persistência entre reinícios |
| **Total** | **90** | 8 arquivos |

E2E (`npx playwright test --list` → **171 testes / 17 arquivos**): `app/painel-estoque.spec.ts`
(10 casos: 4 Painel + 6 Estoque × 2 projetos), `app/relatorios.spec.ts` (**5** × 2),
`app/navegacao.spec.ts`, `app/historico.spec.ts`, `app/produtos.spec.ts`, `app/movimentar.spec.ts`,
`app/pdv.spec.ts`, `app/equipe-empresa.spec.ts`, `acesso/api.spec.ts`, `acesso/conta.spec.ts`,
`acesso/equipe-papeis.spec.ts`, `servidor-local/compartilhado.spec.ts`, `camera/leitor.spec.ts`,
`camera/sem-codigo.spec.ts`, `pdv/mercadinho.spec.ts`, `pdv/offline.spec.ts`, `pwa/instalado.spec.ts`.

> **Nenhum teste novo neste ciclo.** A suíte segue **90** em vitest e **171** no Playwright.

### 3.1 Domínio de reposição — coberto

`src/lib/estoque.ts` (`situacaoReposicao`, `sugerirCompra`, `calcularCobertura`, `montarReposicao`,
`precisaRepor`, `saldosPorProduto`) tem casos em `regras.test.ts`: `minimo === null` → `'sem_minimo'`;
`minimo <= 0` → `'sem_minimo'`; `saldo <= 0`/`saldo < minimo` → `'abaixo'`; `saldo === minimo` →
`'no_minimo'`; `saldo > minimo` → `'acima'`; `sugerirCompra` arredondando pela embalagem (5→12 com
embalagem 20 = 20); `montarReposicao` ignorando `ativo=false` e `controla_estoque=false`.

### 3.2 Filtros na URL e totais da lista — coberto (o que T-023 reaproveita)

Nomes reais dos `it()` de `regras.test.ts` conferidos com `--reporter=verbose` neste ciclo:

```
✓ períodos > calcula últimos 7 dias, mês atual e mês anterior
✓ períodos > periodoDaUrl: sem params cai nos últimos 7 dias
✓ períodos > periodoDaUrl: de/ate válidos viram período personalizado
✓ períodos > periodoDaUrl: um lado só, data inexistente, invertida ou no futuro cai no padrão sem lançar
✓ períodos > chaveIntervalo e juntarFiltros alimentam o link compartilhável
✓ totais das movimentações na tela > lista vazia zera tudo
✓ totais das movimentações na tela > soma o delta por grupo: VENDA conta em saídas, CORRECAO em ajustes
✓ totais das movimentações na tela > só ajustes: entradas e saídas ficam zeradas
✓ tipos de movimentação nos relatórios > agrupa em entradas, saídas e ajustes
```

A asserção do link compartilhável, na íntegra (é o contrato que T-023 deve usar sem alterar):

```ts
const base = new URLSearchParams('de=2026-10-01&ate=2026-10-03&tipo=SAIDA&q=coca')
expect(juntarFiltros(base, { tipo: null, q: ' ' }).toString()).toBe('de=2026-10-01&ate=2026-10-03') // remove vazios
expect(juntarFiltros(base, { de: null, ate: null, tipo: 'ENTRADA' }).toString()).toBe('tipo=ENTRADA&q=coca') // preserva demais
expect(juntarFiltros(base, { q: 'guaraná' }).get('q')).toBe('guaraná')                                     // acento intacto
```

### 3.3 Lista de compras (reposição) no relatório — coberto

`src/lib/relatorio.test.ts` (3/3 verdes neste ciclo): `traz só os produtos no ponto de pedido, do mais
crítico ao menos crítico` (só `abaixo`/`no_minimo`, ordenados por cobertura asc, `sugestaoCompra ===
sugerirCompra(...)`), `sem produtos no ponto de pedido a lista vem vazia`, `respeita o filtro de produto`.

### 3.4 Lista de compras fora do relatório — 9/9 verdes

`filtrarItensCompra`, `nomeArquivoListaCompra` (`lista-de-compras_AAAA-MM-DD.xlsx|pdf`),
`gerarListaCompraExcel` (1 aba, `A1` empresa, `A2` "— N produtos", `fgColor FF047857`,
`rowCount === 5 + itens + 1`, aviso em `A6` sem seleção), `gerarListaCompraPdf` (`%PDF-`, > 5000 bytes).
Contrato de formatação: **Excel = número puro**; **PDF = texto** `"8 kg (2 emb.)"`; **tela = o mesmo
texto do PDF** — as três pontas derivam de `formatarEmbalagens`.

### 3.5 Paridade tela × PDF — embalagens — 4/4 verdes

Mínimo 10 / saldo 3 / embalagem 4 / `kg` → `sugerirCompra === 8`, `textoEmbalagensSugestao(...) ===
'2 emb.'`; tela === PDF; sem embalagem ⇒ `null`; sugestão zero ⇒ `null`.

### 3.6 Recorte na URL (T-023) — **NÃO coberto**

Testes que **deveriam existir** e não existem no disco (os playbooks estão em §2.4):

- `src/lib/regras.test.ts`: **+2 asserções explícitas** em `juntarFiltros` —
  `expect(juntarFiltros(new URLSearchParams('q=%20%20'), { q: '  ' }).get('q')).toBeNull()` e
  `expect(juntarFiltros(new URLSearchParams('filtro=ok'), { q: null }).get('filtro')).toBe('ok')`
  (o comportamento já é o esperado pelos outros casos, mas não há asserção nomeada para ele).
- `e2e/app/painel-estoque.spec.ts`: os **3 casos** de `?q=`/`?categoria=`/`?ordem=` (§2.4).
- `e2e/app/relatorios.spec.ts`: os **2 casos** de `?produto=` (§2.4).
- **Nunca** criar `src/lib/periodos.test.ts`: o arquivo real é `regras.test.ts`. Se o time decidir
  dividir, fazer no mesmo commit com aviso ao owner de testes (evita casos duplicados em dois arquivos).

> **Regra para os próximos ciclos:** todo helper puro novo em `src/lib/` **precisa** de caso em
> `regras.test.ts` (ou num `*.test.ts` próprio do módulo) no mesmo commit, **verde**. Texto que
> aparece em duas pontas (tela e exportação) precisa de teste de **paridade**.

## 4. Como rodar um teste isolado

```bash
npx vitest run src/lib/regras.test.ts
npx vitest run src/lib/relatorio.test.ts
npx vitest run src/lib/exportar/lista-compra.test.ts
npx vitest run src/lib/exportar/lista-compra-paridade.test.ts
npx vitest run -t "periodoDaUrl"
npx vitest run -t "juntarFiltros"
npx tsc -p e2e/tsconfig.json --noEmit        # tipagem dos specs, sem rodar Playwright
```

Playwright:

```bash
npx playwright test --list                                            # inventário sem rodar
npx playwright test e2e/app/painel-estoque.spec.ts e2e/app/relatorios.spec.ts
npx playwright test -g "recorte da lista" e2e/app/painel-estoque.spec.ts   # só o caso de T-023
npx playwright test -g "produto" e2e/app/relatorios.spec.ts               # ?produto= (T-023)
```

## 5. Checklist de PR (não pular)

- [x] `npx tsc --noEmit` exit 0
- [x] `npx tsc -p e2e/tsconfig.json --noEmit` exit 0
- [x] `npx vitest run` 0 falhas (90/90)
- [x] `npm run build` exit 0 (2303 módulos, PWA ok, 1,56 s)
- [ ] `npx playwright test` verde (**não executado neste ciclo** — gate externo + PGlite)
- [ ] **T-023:** `q`/`categoria`/`ordem` lidos da URL no mount de `Estoque.tsx` (não existe: `useState` puro)
- [ ] **T-023:** escrita na URL via `juntarFiltros(..., { replace: true })` em `Estoque.tsx` (não existe: `mudarFiltro` monta `URLSearchParams` à mão)
- [ ] **T-023:** debounce da busca (300 ms) cancelado no unmount (não existe; ver T-030)
- [ ] **T-023:** `categoria`/`ordem` inválidas ignoradas em silêncio (não existe)
- [ ] **T-023:** `?produto=` lido/escrito em `Relatorios.tsx` (não existe: `useState('')`)
- [ ] **T-023:** 2 asserções novas em `regras.test.ts` para "só-espaços remove e preserva as demais" (não existem)
- [ ] **T-023:** 3 casos E2E em `painel-estoque.spec.ts` + 2 em `relatorios.spec.ts` (não existem — §2.4)
- [ ] **T-030:** debounce + replace na busca (pré-requisito de fato do critério 1)
- [ ] **T-034:** `?categoria=<id>` sem `<option>` renderizado (select em branco) — efeito colateral de T-023
- [ ] **T-016:** `href` do Exportar via `juntarFiltros` com `categoria`/`q`/`situacao` (não existe em `Estoque.tsx`)
- [ ] **T-017:** leitura de `q`/`categoria`/`situacao` + `filtroPosicao` em `montarRelatorio` (não existe)
- [ ] **T-019:** `filtrarRecorte()` em `lib/estoque.ts` (não existe)
- [ ] **T-020:** teste de contagem chip `Repor` × tabela × compras (não existe)
- [ ] `e2e/app/estoque-repor.spec.ts` (novo, herdado de T-009): paridade chip × lista × arquivo — **não existe**
- [ ] Checkbox "Lista de compras (reposição)" e toast "Escolha pelo menos uma seção do relatório."
      (CA-7) só por revisão de código — projeto sem `@testing-library`/`*.test.tsx`
- [ ] T-008 (foco do modal "Estoque mínimo") segue aberto no backlog
- [ ] Se `montarRelatorio` ganhar o 7º/8º parâmetro, `exportar.test.ts`/`lista-compra.test.ts` precisam
      continuar verdes **sem edição** (prova de compatibilidade)
