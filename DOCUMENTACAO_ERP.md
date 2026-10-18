# Documentação do ERP Galpão

## Status do repositório

**Compilação: OK** (`npx tsc --noEmit` → **exit 0**).
Testes: **90/90 passando** em 8 arquivos (`npx vitest run` → **exit 0**, 9,79 s).
Build: **OK** (`npm run build` → exit 0, 2303 módulos, PWA `generateSW`, 11 entradas precache,
1.018,59 KiB, 968 ms).
Backlog: **T-009 concluído** neste ciclo (ciclo anterior: T-011).

---

## Item: T-009 — A tela Estoque mostrava dois números diferentes para "Repor"

### Situação: **CONCLUÍDO no código** — cobertura E2E da paridade **pendente** (ver §"Dívida aberta")

### O que o operador via (o defeito)

No filtro **"Repor"** de `/estoque`, o chip da barra de filtros dizia **"Repor 5"** enquanto a
tabela logo abaixo listava **7 linhas**. Motivo: a tela calculava "precisa repor" por **três**
caminhos independentes —

1. `contagem.abaixo` = `precisaRepor(montarReposicao(produtosFiltrados, lotes)).length` (produto);
2. as linhas do filtro `abaixo`, montadas a partir de `montarLinhasEstoque` + `precisaReporPorLinha`
   → `situacaoReposicao(saldosPorProduto(lotes).get(id) ?? 0, minimo)` (**lote**);
3. um segundo `useMemo(() => montarReposicao(produtos, lotes))` (`reposicao`).

Produto com **dois lotes** abaixo do mínimo contava **1** no chip e **2** na tabela; e o recorte
por busca/categoria era aplicado em pontos diferentes, então os dois números divergiam também
com filtro ativo.

### Regra que passou a valer (contrato com o usuário)

> **Chip "Repor N" = nº de linhas da tabela = nº de linhas do arquivo baixado.** Uma linha por
> **produto** (não por lote), sempre e com qualquer combinação de busca/categoria.

Isso é o que torna a **lista de compras confiável**: o operador marca "Marcar todos", baixa o Excel
e leva ao fornecedor exatamente o que o chip anunciou.

### Arquivos modificados

| Arquivo | Situação |
|---|---|
| `src/pages/Estoque.tsx` | **Fonte única**: `reposicao = useMemo(() => montarReposicao(produtos, lotes), [produtos, lotes])`; `visiveisReposicao = precisaRepor(reposicao).filter(categoria + produtoCombina)`; `contagem.abaixo = visiveisReposicao.length`; `itensRepor = ordenarReposicao(visiveisReposicao, ordem)` alimenta **tabela, cartões e lista de compras**. `linhas` recebe `[]` quando `filtro === 'abaixo'` (o filtro Repor deixou de renderizar `montarLinhasEstoque`). **Removidos**: `reposicaoPorProduto`, `precisaReporPorLinha`, `useCallbackMap` e a chamada a `situacaoReposicao`/`saldosPorProduto` na página ✔ |
| `src/lib/estoque.ts` | **Sem mudança de regra**: JSDoc de `precisaRepor` documenta o contrato ("única porta de entrada da lista de compras, sempre sobre `montarReposicao`, nunca sobre saldo de lote"). `saldosPorProduto` **permanece** — é consumida por `src/pages/Painel.tsx` (KPI "Para repor") ✔ |

### Arquivos **não** tocados (prova de escopo — T-009 é fonte de dados, não redesign)

`src/components/ListaReposicao.tsx`, `src/components/ReposicaoForm.tsx`, `src/components/ui.tsx`,
`src/index.css`, `src/lib/formato.ts`, `src/lib/exportar/*`, `src/lib/dados/*`,
`supabase/migrations/*`.

Consequência prática: **nada muda** em chips (cores `chip-ativo`/`chip-inativo`), tipografia,
breakpoints (`sm`/`md`/`lg`), `aria-*`, `data-*` ou textos literais (`Estoque atual`,
`Nada para repor`, `Nada encontrado`, `Limpar filtros`, `Marcar todos`, `Baixar Excel/PDF`, toasts).

### Contratos

```ts
// src/pages/Estoque.tsx — derivado único (não exportado)
const reposicao         = useMemo(() => montarReposicao(produtos, lotes), [produtos, lotes])
const visiveisReposicao = useMemo(
  () => precisaRepor(reposicao).filter(
    i => (!categoria || i.produto.categoria_id === categoria) && produtoCombina(i.produto, termo)),
  [reposicao, categoria, termo])
const itensRepor        = useMemo(() => ordenarReposicao(visiveisReposicao, ordem), […])
// contagem.abaixo = visiveisReposicao.length   ← MESMA lista que a tabela desenha

// ordenarReposicao (local): ordem !== 'nome' ⇒ cobertura crescente (crítico primeiro);
//                          ordem === 'nome'   ⇒ produto.nome.localeCompare('pt-BR')
//                          ordem === 'validade' é IGNORADA no filtro Repor (sem regra de lote)
```

### Decisões registradas

- **`saldosPorProduto` não foi removida.** O plano de UI pedia remoção, mas `Painel.tsx` a consome
  (KPI "Para repor"). Removê-la quebrava o `tsc` (`TS2305`) e o escopo é de Painel (T-002/T-010),
  não de T-009. `Estoque.tsx` simplesmente deixou de importá-la.
- **`ordem` é ignorada (não `disabled`) no filtro Repor.** Desabilitar o `<select>` mudaria a
  affordance e arriscaria E2E de navegação; o plano recomendou "manter ativo e ignorar".
- **"Vencidos" e "Zerados" continuam vindo de `montarLinhasEstoque`** (visão por lote). Só o
  filtro Repor é por produto — é a decisão de compra que é do produto, não do lote.

### Verificação executada (QA, neste ambiente)

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | 0 | nenhum erro |
| `npx vitest run` | 0 | 8 arquivos · 90/90 testes |
| `npm run build` | 0 | 2303 módulos · PWA `generateSW` ok |

### Dívida aberta (não bloqueia build; registrada sem maquiar)

- `e2e/app/estoque-repor.spec.ts` (**arquivo novo**) **não existe no disco**. Ele travaria
  `chip === [data-reposicao] === lista de compras`. Falta medir o `N` do chip contra a fixture
  `criar_empresa_exemplo()` (PGlite) — inventar o número violaria a regra "nunca `count()` em
  asserção".
- `e2e/app/painel-estoque.spec.ts` › `'filtros por situação com contadores'` ainda **não clica**
  no chip Repor; é por isso que o defeito do T-009 sobreviveu a ciclos anteriores.
- Nenhum teste unitário trava `contagem.abaixo === precisaRepor(montarReposicao(...)).length`:
  a convergência hoje é garantida **por construção** no código (um só `useMemo`), verificável por
  revisão; a prova automatizada é o E2E pendente.

---

## Itens anteriores aprovados

### T-011 — lista de compras mostra "Comprar 8 kg (2 emb.)"

`textoEmbalagensSugestao` em `ListaReposicao.tsx`, `data-embalagens` na `<li>`, paridade tela × PDF
provada por `lista-compra-paridade.test.ts` (4). `lib/estoque.ts`/`lib/formato.ts` não tocados.

```ts
// src/components/ListaReposicao.tsx
export function textoEmbalagensSugestao(
  produto: Pick<Produto, 'conteudo_embalagem'>,
  sugestaoCompra: number,
): string | null            // "2 emb." | null
```

### T-001 (parte relatório) — lista de compras no Excel/PDF e na tela

`LinhaCompraRel`/`Relatorio.compras` em `lib/relatorio.ts`, aba "Lista de compras" em
`lib/exportar/excel.ts`, tabela "Compras (reposição)" em `lib/exportar/pdf.ts`, 4º checkbox em
`Relatorios.tsx`, `relatorio.test.ts` (3) e `exportar.test.ts` (6). Regressão verde neste ciclo.

```ts
// src/lib/estoque.ts
type SituacaoPedido = Extract<SituacaoReposicao, 'abaixo' | 'no_minimo'>
function noPontoDePedido(s: SituacaoReposicao): s is SituacaoPedido
function comoSituacaoPedido(s: SituacaoReposicao): SituacaoPedido
export interface ItemCompra {
  produto: Produto; codigo: string; categoria: string; unidade: Unidade
  saldo: number; minimo: number | null; cobertura: number | null
  sugestaoCompra: number; situacao: SituacaoPedido
}
export function filtrarItensCompra(itens, selecionados, nomeCategoria?): ItemCompra[]

// src/lib/exportar/lista-compra.ts
export function nomeArquivoListaCompra(ext: 'xlsx' | 'pdf', dia?: string): string
export function gerarListaCompraExcel(itens, empresa, opcoes?: { geradoEm?: Date }): Promise<Blob>
export function gerarListaCompraPdf  (itens, empresa, opcoes?: { geradoEm?: Date }): Promise<Blob>
```

Contrato de formatação da coluna "Comprar": **Excel = número puro** (negrito verde),
**PDF = texto** `"8 kg (2 emb.)"`, **tela = o mesmo texto do PDF**.

### T-006 — Filtros na URL + rodapé de totais

```ts
periodoDaUrl(query, hoje?): PeriodoDaUrl
chaveIntervalo(i: Intervalo): string                  // "AAAA-MM-DD|AAAA-MM-DD"
juntarFiltros(params, mudancas): URLSearchParams      // valor vazio (ou só espaços) remove o parâmetro
totaisPorGrupo(movs): TotaisMov
```

Defeito corrigido naquele ciclo: `juntarFiltros` gravava `?q=+` com busca só de espaços —
`trim()` antes do teste de presença em `periodos.ts`.

### T-002 — Estoque mínimo / ponto de pedido

`Produto.estoque_minimo`, `SituacaoReposicao`, `montarReposicao`, `precisaRepor`, `abaixoDoMinimo`,
`BadgeReposicao`, `Cobertura`, `ReposicaoForm`, `ListaReposicao`, filtro "Repor". Cobertura em
`regras.test.ts`. Pendências: migration e `Painel.tsx`.

### T-007 — `ListaReposicao` não era usada (diagnóstico desmentido)

`src/pages/Estoque.tsx:4` importa `ListaReposicao` e a renderiza em `Estoque.tsx:252` dentro do
filtro `filtro === 'abaixo'`, com `selecionados`, `aoAlternar` e `aoMarcarTodosToggle` ligados.
Critérios cumpridos → **concluído** (verificado por inspeção de código).

## Modelo de domínio de reposição

```
SituacaoReposicao = 'abaixo' | 'no_minimo' | 'acima' | 'sem_minimo'
SituacaoPedido    = Extract<SituacaoReposicao, 'abaixo' | 'no_minimo'>   // entra na lista de compras

cobertura = saldo / minimo            (null quando sem mínimo)
sugestaoCompra = ceil((minimo - saldo) / conteudo_embalagem) * conteudo_embalagem
                 (ou minimo - saldo arredondado, quando não há embalagem)
embalagens = round(sugestaoCompra / conteudo_embalagem, 2)   // "2 emb." — tela e PDF
```

Regras: `minimo` nulo ou `<= 0` → `sem_minimo`; `saldo <= 0` ou `saldo < minimo` → `abaixo`;
`saldo === minimo` → `no_minimo`; `saldo > minimo` → `acima`.

Entram na lista de compras: **abaixo + no_minimo**, uma linha **por produto**, ordenados por
cobertura ascendente (mais crítico primeiro). `precisaRepor(montarReposicao(produtos, lotes))` é a
**única** porta de entrada — usada pelo chip "Repor", pela tabela e pelo arquivo baixado.
Reposição **não** colore a linha (o fundo segue a pior situação de lote); o badge sempre traz
ícone + texto, nunca só cor.

## Estado do backlog (persistido)

Aberto após este ciclo (ordem de prioridade):

- **T-016** (prio 3, feature) — botão "Exportar" do estoque ignora os filtros da tela.
- **T-008** (prio 2, acessibilidade) — modal "Estoque mínimo" fecha sem devolver o foco e sem sinal
  do que mudou na lista.
- **T-010** (prio 3, feature) — sem sugestão de estoque mínimo: produto com `estoque_minimo = null`
  nunca entra em "Repor".
- **T-012** (prio 3, feature) — a lista de compras não leva à entrada de estoque do que foi comprado
  (não há ação para `/movimentar`).
- **T-002** (prio 2, refactor) — enxugar duplicação Painel/Estoque (o `Painel.tsx` ainda recalcula
  "Para repor" com `montarReposicao` + `saldosPorProduto` por conta própria, fora do padrão de
  `precisaRepor`).
- **T-003** (prio 2, feature) — levar item de reposição direto para a Entrada com a quantidade
  sugerida.
- **T-004** (prio 3, feature) — `config.dias_alerta` existe em `tipos.ts` e não é lido por nenhum
  código: tornar o alerta de validade configurável por loja.
- **T-006-E2E** (prio 2, testes) — criar `e2e/app/estoque-repor.spec.ts` (paridade chip × lista)
  e acrescentar o chip Repor em `painel-estoque.spec.ts` com `N` medido.

Concluído: T-002 (estoque mínimo), T-006 (filtros na URL), T-001 (lista de compras no relatório e
exportável com seleção), T-005 (chip "Repor" por produto), T-007 (uso de `ListaReposicao`),
T-011 (embalagens na lista de compras), **T-009 (fonte única do "Repor")**.

Pendências verificadas no código e ainda não abertas como item:

- Migration de `estoque_minimo` ausente em `supabase/migrations` — mínimos e lista de compras
  hoje só existem no aparelho.
- Sem tela de conferência/inventário cego.
- Filtros de URL sem teste de componente (só teste de unidade em `periodos.ts`).
- Seleção/checkboxes/`BarraAcoesCompra`/toasts de T-001 e o render de T-011 (CA-1/3/5) sem teste de
  componente — projeto sem `@testing-library`; verificação por revisão + Playwright.
- **Processo:** `atualizar_backlog` com ação `reordenar` **apagou** o backlog no ciclo T-009 —
  não usar `reordenar` como ferramenta de priorização; recadastrar item a item.
