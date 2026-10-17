# Documentação do ERP Galpão

## Status do repositório

**Compilação: OK** (`npx tsc --noEmit` → **exit 0**).
Testes: **85/85 passando** em 7 arquivos (`npx vitest run` → **exit 0**, 9,55 s).
Build: **OK** (`npm run build` → exit 0, 2303 módulos, PWA `generateSW`, 11 entradas precache,
1.018,56 KiB, 1,02 s).
Backlog: **T-001 concluído** neste ciclo.

### Correções aplicadas desde o ciclo reprovado

| Defeito | Arquivo | Correção |
|---|---|---|
| `TS2322` — `situacao: item.situacao` (`SituacaoReposicao`) num campo `'abaixo' \| 'no_minimo'` | `src/lib/estoque.ts` | `noPontoDePedido(situacao): situacao is SituacaoPedido` (type guard) + helper `comoSituacaoPedido()` no `push` de `filtrarItensCompra` |
| `TS6133` — `formatarNumero` importado e não usado (`noUnusedLocals`) | `src/lib/exportar/pdf.ts` | import reduzido a `formatarData`, `formatarDataHora`, `formatarValidade` + helpers de `comum.ts` |
| teste esperava `codigo: 'P0005'` | `src/lib/exportar/lista-compra.test.ts` | produtos de teste com `codigo_interno` explícito (`P0001`/`P0002`/`P0003`); helper `produto()` continua com default `'P000' + id.length` |
| teste esperava número × exportador devolvia texto | `lista-compra.ts` / teste | **Excel = número** (`formatoNumero` + negrito verde), **PDF = texto** `"8 kg (2 emb.)"`; teste do Excel espera `8` |

---

## Item: T-001 — Lista de compras (reposição) exportável com seleção de itens

### Situação: **CONCLUÍDO (QA aprovado)**

### Arquivos criados

| Arquivo | Situação |
|---|---|
| `src/lib/exportar/comum.ts` | cores ARGB/RGB, `textoNumero`, `textoCobertura`, `textoGeradoEm`, `linhaGeradoEm`, `formatoNumero`, `ESTILO_TABELA_PDF`; saída do relatório inalterada ✔ |
| `src/lib/exportar/lista-compra.ts` | `nomeArquivoListaCompra(ext, dia?)`, `gerarListaCompraExcel(itens, empresa, { geradoEm? })`, `gerarListaCompraPdf(...)`; 1 aba "Lista de compras", colunas `Código · Produto · Categoria · Unid. · Saldo · Mínimo · Cobertura · Comprar · Fornecedor · Observação` (2 últimas em branco), cabeçalho verde `FF047857`, legenda itálica, PDF paisagem com paginação ✔ |
| `src/lib/exportar/lista-compra.test.ts` | 8 testes, **8 verdes** ✔ |

### Arquivos modificados

| Arquivo | Situação |
|---|---|
| `src/lib/estoque.ts` | `ItemCompra` + `filtrarItensCompra(itens, selecionados, nomeCategoria?)`; type guard `noPontoDePedido`; `comoSituacaoPedido`; ordem de `montarReposicao` preservada, `no_minimo` preservado, `Set` vazio ⇒ `[]`, id desconhecido ignorado ✔ |
| `src/lib/exportar/excel.ts` | `montarCabecalho(...)` exportado; `bordas` exportado; cores/`formatoNumero` de `comum.ts`; título da aba com `— N produtos` ✔ |
| `src/lib/exportar/pdf.ts` | usa `ESTILO_TABELA_PDF`/`VERDE`/`CINZA`/`textoNumero`/`textoCobertura`/`textoGeradoEm` de `comum.ts`, reexporta `ESTILO`/`VERDE`/`CINZA`; import morto removido ✔ |
| `src/components/ListaReposicao.tsx` | props retrocompatíveis `selecionados?`, `aoAlternar?`, `aoMarcarTodosToggle?`; checkbox por linha com `aria-label="Incluir <nome> na lista de compras"`, `<label htmlFor>`, cabeçalho tri-state, grade `md:grid-cols-[auto_1fr_7rem_7rem_9rem]`, linha marcada `bg-emerald-50/60` + `data-selecionado`; sem props = modo leitura intacto ✔ (revisão) |
| `src/pages/Estoque.tsx` | `ReposicaoSelecionavel` inline no filtro `abaixo`; `BarraAcoesCompra` sticky; contagem `aria-live="polite"`; "Marcar todos/Desmarcar todos"/"Limpar"; "Baixar Excel"/"Baixar PDF" com spinner/`sr-only`/`disabled`; estado `selecionados: Set<string>`; `useEffect` limpa seleção ao sair do filtro; dica de 1ª visita em `localStorage`; `exportarCompra` com import dinâmico + `baixarArquivo` + 3 toasts; **T-005**: chip "Repor" por produto; legenda do rodapé corrigida ✔ (revisão; sem teste de componente) |
| `src/pages/Relatorios.tsx` | sem mudança funcional; regressão coberta por `exportar.test.ts` ✔ |

### Contratos

```ts
// src/lib/estoque.ts
type SituacaoPedido = Extract<SituacaoReposicao, 'abaixo' | 'no_minimo'>
function noPontoDePedido(s: SituacaoReposicao): s is SituacaoPedido
function comoSituacaoPedido(s: SituacaoReposicao): SituacaoPedido   // 'no_minimo' | senão 'abaixo'

export interface ItemCompra {
  produto: Produto; codigo: string; categoria: string; unidade: Unidade
  saldo: number; minimo: number | null; cobertura: number | null
  sugestaoCompra: number
  situacao: SituacaoPedido               // 'abaixo' | 'no_minimo'
}
export function filtrarItensCompra(
  itens: readonly ReposicaoProduto[],
  selecionados: ReadonlySet<string>,
  nomeCategoria?: (id: string | null) => string,
): ItemCompra[]

// src/lib/exportar/lista-compra.ts
export function nomeArquivoListaCompra(ext: 'xlsx' | 'pdf', dia?: string): string  // lista-de-compras_2026-10-03.xlsx
export function gerarListaCompraExcel(itens: readonly ItemCompra[], empresa: string, opcoes?: { geradoEm?: Date }): Promise<Blob>
export function gerarListaCompraPdf  (itens: readonly ItemCompra[], empresa: string, opcoes?: { geradoEm?: Date }): Promise<Blob>

// src/components/ListaReposicao.tsx (todas opcionais — sem elas o componente é o de antes)
selecionados?: ReadonlySet<string>
aoAlternar?: (id: string) => void
aoMarcarTodosToggle?: () => void
```

### Critérios de aceite — veredito por CA

| CA | Veredito | Evidência |
|---|---|---|
| 1 — `filtrarItensCompra` pura e testada (ordem, `no_minimo`, `Set` vazio, id inexistente) | **OK** | 4 testes verdes; tipagem corrigida pelo type guard |
| 2 — checkbox por produto com `aria-label` exato, "Marcar todos"/"Limpar", contagem `aria-live` | **por revisão de código** | `ListaReposicao.tsx` + `Estoque.tsx`; sem `*.test.tsx` no projeto |
| 3 — Excel 1 aba com as 10 colunas, cabeçalho empresa/data/N produtos, `disabled` com dica | **OK** | `lista-compra.test.ts` (aba, linha 5, `fgColor`, valores, colunas em branco, `rowCount`) |
| 4 — PDF `%PDF-` > 5000, mesmo cabeçalho, nomes `lista-de-compras_AAAA-MM-DD.*` | **OK** | nome do arquivo + PDF com e sem itens |
| 5 — toasts ("Selecione ao menos um produto" / "Lista com N produtos gerada." / falha) | **por revisão de código** | `exportarCompra` em `Estoque.tsx` |
| 6 — nenhuma regra recalculada; suíte verde | **OK** | 85/85; `relatorio.test.ts` compara com `sugerirCompra`/`calcularCobertura` |
| 7 — `tsc`/build sem erro; modo somente leitura exporta | **OK** | tsc exit 0, build exit 0; leitura-exporta por revisão |

### Decisões registradas

- Exportador da lista de compras **não** recebe `Relatorio`: só o recorte (`ItemCompra[]`), a
  empresa e `geradoEm` — aqui não existe período.
- **Coluna "Comprar": Excel = número puro** (negrito verde, reaproveitável pelo fornecedor);
  **PDF = texto com unidade e embalagem** (`"8 kg (2 emb.)"`). A legenda da planilha ("Quantidade
  já arredondada pelo conteúdo da embalagem · do mais crítico ao menos crítico") documenta o arredondamento.
- `lib/exportar/comum.ts` centraliza cores e formatadores sem alterar a saída do relatório
  (`exportar.test.ts` verde garante a regressão).
- `ListaReposicao` fora do filtro `abaixo` de `Estoque.tsx` segue sem uso pleno — **T-007** aberto.
- T-005 aplicado de passagem: contagem do chip "Repor" é por **produto**, não por lote.

### Pendências remanescentes (não bloqueiam build)

1. **Migration** — `ALTER TABLE produtos ADD COLUMN estoque_minimo` continua ausente em
   `supabase/migrations`; sem ela os mínimos (e a lista de compras) só existem no aparelho.
2. **`src/pages/Painel.tsx`** — ainda remonta `ReposicaoProduto` à mão (item T-002).
3. **Testes de componente** — seleção, checkboxes, `BarraAcoesCompra` e toasts de T-001 sem teste
   automatizado (projeto sem `@testing-library`); verificação só por revisão.
4. **T-007** — `ListaReposicao` sem cobertura de uso em `/estoque?filtro=abaixo`.

---

## Itens anteriores aprovados

### T-001 (parte relatório) — lista de compras no Excel/PDF e na tela

`LinhaCompraRel`/`Relatorio.compras` em `lib/relatorio.ts`, aba "Lista de compras" em
`lib/exportar/excel.ts`, tabela "Compras (reposição)" em `lib/exportar/pdf.ts`, 4º checkbox em
`Relatorios.tsx`, `relatorio.test.ts` (3) e `exportar.test.ts` (6). Regressão verde neste ciclo.

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

## Modelo de domínio de reposição

```
SituacaoReposicao = 'abaixo' | 'no_minimo' | 'acima' | 'sem_minimo'
SituacaoPedido    = Extract<SituacaoReposicao, 'abaixo' | 'no_minimo'>   // entra na lista de compras

cobertura = saldo / minimo            (null quando sem mínimo)
sugestaoCompra = ceil((minimo - saldo) / conteudo_embalagem) * conteudo_embalagem
                 (ou minimo - saldo arredondado, quando não há embalagem)
```

Regras: `minimo` nulo ou `<= 0` → `sem_minimo`; `saldo <= 0` ou `saldo < minimo` → `abaixo`;
`saldo === minimo` → `no_minimo`; `saldo > minimo` → `acima`.

Entram na lista de compras: **abaixo + no_minimo**, ordenados por cobertura ascendente.
Reposição **não** colore a linha (o fundo segue a pior situação de lote); o badge sempre traz
ícone + texto, nunca só cor.

## Estado do backlog (persistido)

Aberto após este ciclo:

- **T-007** (prio 1, bug) — `ListaReposicao` só é usada no filtro `abaixo` de `Estoque.tsx`;
  falta cobertura do uso (teste de componente).
- **T-002** (prio 2, refactor) — enxugar duplicação Painel/Estoque: usar `montarReposicao()`
  em vez de remontar `ReposicaoProduto` à mão.
- **T-003** (prio 2, feature) — levar item de reposição direto para a Entrada com a quantidade
  sugerida; hoje não há ação que leve a `/movimentar`.
- **T-004** (prio 3, feature) — `config.dias_alerta` existe em `tipos.ts` e não é lido por
  nenhum código: tornar o alerta de validade configurável por loja.
- **T-005** (prio 3, bug) — filtro "Repor" por **produto**, não por lote. *Corrigido de passagem
  em T-001 (contagem do chip); falta fechar no backlog.*
- **T-006** (prio 3, feature) — exportar a posição de estoque com os filtros aplicados da tela
  (o botão "Exportar" do `Cabecalho` ainda é só `<Link to="/relatorios">`).

Concluído: T-002 (estoque mínimo), T-006 (filtros na URL), T-001 (lista de compras no relatório
e exportável com seleção).

Pendências verificadas no código e ainda não abertas como item:

- Migration de `estoque_minimo` (item 1 de T-002).
- Sem tela de conferência/inventário cego.
- Filtros de URL sem teste de componente (só teste de unidade em `periodos.ts`).
- CA-2/CA-5/CA-7 de T-001 e toasts de exportação sem teste de componente.
