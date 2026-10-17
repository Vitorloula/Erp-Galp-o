# Documentação do ERP Galpão

## Status do repositório

**Compilação: OK** (`npx tsc --noEmit` → **exit 0**).
Testes: **90/90 passando** em 8 arquivos (`npx vitest run` → **exit 0**, 9,36 s).
Build: **OK** (`npm run build` → exit 0, 2303 módulos, PWA `generateSW`, 11 entradas precache,
1.018,56 KiB, 0,96 s).
Backlog: **T-011 concluído** neste ciclo (ciclo anterior: T-001).

---

## Item: T-011 — Lista de compras mostra "Comprar 8 kg" sem dizer quantas embalagens comprar

### Situação: **CONCLUÍDO (QA aprovado em 2026-10-17)**

### Problema

Na lista de compras (filtro "Repor" de `/estoque`) a tela dizia apenas
`Comprar 8 kg para voltar ao mínimo`, enquanto o **PDF levado ao fornecedor** já dizia
`8 kg (2 emb.)`. O operador precisava dividir de cabeça (8 ÷ 4) para saber quantas embalagens
comprar — e não havia pista de que o valor já estava arredondado pela embalagem.

### Arquivos modificados

| Arquivo | Situação |
|---|---|
| `src/components/ListaReposicao.tsx` | helper exportado `textoEmbalagensSugestao(produto, sugestaoCompra)` (delega a `formatarEmbalagens`, devolve `null` sem embalagem); `<p>` de sugestão renderiza `Comprar 8 kg (2 emb.) para voltar ao mínimo` com `8` e `2` em `<strong className="tabular-nums">`; `<li>` ganhou `data-embalagens` (`"2 emb."` quando há embalagem, **ausente** quando não há). Nenhuma prop nova, nenhuma classe CSS nova, nenhum elemento focável novo ✔ |
| `src/lib/exportar/lista-compra.test.ts` | +1 caso: a frase da coluna Comprar do PDF é `"8 kg (2 emb.)"` (8 → **9** testes) ✔ |
| `src/lib/exportar/lista-compra-paridade.test.ts` | **novo**: paridade tela × PDF sobre o mesmo fixture (4 testes) ✔ |

### Arquivos **não** tocados (prova de escopo)

`src/lib/estoque.ts` (`montarReposicao`, `sugerirCompra`, `calcularCobertura`, `precisaRepor`),
`src/lib/formato.ts` (`formatarEmbalagens`, `formatarNumero`), `src/pages/Estoque.tsx`,
`src/lib/exportar/lista-compra.ts`, `src/components/ui.tsx`, `src/index.css`,
`supabase/migrations/*`, `src/lib/dados/*`.

### Contratos

```ts
// src/components/ListaReposicao.tsx — nova função exportada (pura, 1 linha)
export function textoEmbalagensSugestao(
  produto: Pick<Produto, 'conteudo_embalagem'>,
  sugestaoCompra: number,
): string | null            // "2 emb." | null

// ListaReposicaoProps: SEM mudança de API (nenhuma prop nova)
// DOM: <li data-reposicao="p" data-situacao="abaixo" data-selecionado="false" data-embalagens="2 emb.">
```

### Decisões registradas

- **Uma única fonte de formatação.** Tela e PDF chamam `formatarEmbalagens(n, conteudo_embalagem)`
  de `lib/formato.ts`; `embalagens(item)` em `lista-compra.ts` é a mesma chamada. Nada é recalculado
  em `lib/estoque.ts` — `sugestaoCompra` continua vindo de `montarReposicao`/`sugerirCompra`.
- **Sem embalagem = zero mudança visual.** O ramo `{embalagens && …}` é falso e o texto é byte a
  byte o anterior (`Comprar 7 L para voltar ao mínimo`); `data-embalagens` fica `undefined`.
- **Abreviação `emb.`** mantida (já usada em `CampoQuantidade.tsx`, `ReposicaoForm.tsx`,
  `BuscaProduto.tsx` e no PDF) — não inventar "embalagens" por extenso, para preservar a paridade.
- **Acessibilidade:** nenhum `aria-label` no `<p>` (WCAG 2.5.3 "label in name"); parênteses em texto
  puro (não `aria-hidden`); `text-amber-800` sobre `bg-amber-50`/branco ≥ 7:1 (AA/AAA);
  tab order inalterada; `data-embalagens` é gancho de teste (padrão `data-*` do projeto), não semântica.
- **Responsivo:** sem `truncate`/`whitespace-nowrap` — `(2 emb.)` é inline curto, quebra de linha
  natural em 360 px, uma linha em ≥ 768 px com `md:pl-8`.

### Critérios de aceite — veredito por CA

| CA | Veredito | Evidência |
|---|---|---|
| 1 — `Comprar 8 kg (2 emb.) para voltar ao mínimo`, `8` e `2` em `<strong class="tabular-nums">` | **OK** (texto provado por teste; marcação por revisão) | `lista-compra-paridade.test.ts` ⇒ `'2 emb.'`; JSX em `ListaReposicao.tsx` |
| 2 — sem `conteudo_embalagem` o texto é exatamente o atual | **OK** | `textoEmbalagensSugestao(...) === null` no teste; literal `(` só no ramo `embalagens &&` |
| 3 — `data-embalagens` = `"2 emb."` / ausente | **OK** (revisão de código) | `data-embalagens={embalagens ?? undefined}` |
| 4 — contagem da tela idêntica à do PDF no mesmo fixture | **OK** | `daTela === doPdf === '2 emb.'` (acefato 3/10/4) |
| 5 — `itens` vazio → `Vazio`, nenhuma chamada de embalagem | **OK** (revisão de código) | early return antes do `map` |
| 6 — suíte verde e build sem erro de tipo | **OK** | 90/90; `tsc -p . && vite build` exit 0 |
| 7 — nenhum recálculo novo em `lib/estoque.ts` | **OK** | arquivo não tocado; teste parte de `montarReposicao`/`filtrarItensCompra` |

### Verificação executada (QA)

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | 0 | nenhum erro |
| `npx vitest run` | 0 | 8 arquivos · 90/90 testes (era 85; +4 paridade, +1 PDF) |
| `npm run build` | 0 | 2303 módulos · PWA ok |

---

## Itens anteriores aprovados

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
Critérios cumpridos → **concluído** (verificado por inspeção de código neste ciclo).

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

Entram na lista de compras: **abaixo + no_minimo**, ordenados por cobertura ascendente.
Reposição **não** colore a linha (o fundo segue a pior situação de lote); o badge sempre traz
ícone + texto, nunca só cor.

## Estado do backlog (persistido)

Aberto após este ciclo (ordem de prioridade):

- **T-009** (prio 2, refatoração) — `Estoque.tsx` calcula "precisa repor" por três caminhos
  (chip "Repor", `visiveisReposicao`, tabela); unificar em `montarReposicao`/`precisaRepor`.
- **T-008** (prio 2, acessibilidade) — modal "Estoque mínimo" fecha sem devolver o foco e sem sinal
  do que mudou na lista.
- **T-010** (prio 3, feature) — sem sugestão de estoque mínimo: produto com `estoque_minimo = null`
  nunca entra em "Repor".
- **T-012** (prio 3, feature) — a lista de compras não leva à entrada de estoque do que foi comprado
  (não há ação para `/movimentar`).
- **T-002** (prio 2, refactor) — enxugar duplicação Painel/Estoque (usar `montarReposicao()` em vez
  de remontar `ReposicaoProduto` à mão).
- **T-003** (prio 2, feature) — levar item de reposição direto para a Entrada com a quantidade
  sugerida.
- **T-004** (prio 3, feature) — `config.dias_alerta` existe em `tipos.ts` e não é lido por nenhum
  código: tornar o alerta de validade configurável por loja.
- **T-006** (prio 3, feature) — exportar a posição de estoque com os filtros aplicados da tela
  (o botão "Exportar" do `Cabecalho` ainda é só `<Link to="/relatorios">`).

Concluído: T-002 (estoque mínimo), T-006 (filtros na URL), T-001 (lista de compras no relatório e
exportável com seleção), T-005 (chip "Repor" por produto), T-007 (uso de `ListaReposicao`),
**T-011 (embalagens na lista de compras)**.

Pendências verificadas no código e ainda não abertas como item:

- Migration de `estoque_minimo` ausente em `supabase/migrations` — mínimos e lista de compras
  hoje só existem no aparelho.
- Sem tela de conferência/inventário cego.
- Filtros de URL sem teste de componente (só teste de unidade em `periodos.ts`).
- Seleção/checkboxes/`BarraAcoesCompra`/toasts de T-001 e o render de T-011 (CA-1/3/5) sem teste de
  componente — projeto sem `@testing-library`; verificação por revisão + Playwright.
