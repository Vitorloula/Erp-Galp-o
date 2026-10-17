# Documentação do ERP Galpão

## Status do repositório

**Compilação: OK** (`npx tsc --noEmit` → exit 0).
Testes: **77/77 passando** em 6 arquivos (`npx vitest run` → exit 0).
Build: **OK** (`npm run build` → exit 0, 2299 módulos, PWA emitido).
Backlog verificado no código; pendências remanescentes listadas abaixo.

## Item: T-001 — Lista de compras (reposição) no Excel/PDF e na tela

### Situação: concluído e aprovado no QA (ciclo atual)

| Arquivo | Situação |
|---|---|
| `src/lib/relatorio.ts` | `LinhaCompraRel` + `Relatorio.compras: LinhaCompraRel[]`; montada por `montarReposicao(..., { incluirSemMinimo: false })` ✔ |
| `src/lib/exportar/excel.ts` | `Secoes.compras` (obrigatório) + aba **"Lista de compras"** (4ª), cabeçalho verde em `A5`, `numFmt '0.00"×"'` na cobertura, coluna `Comprar` em negrito verde, legenda final ✔ |
| `src/lib/exportar/pdf.ts` | tabela **"Compras (reposição)"** após "Posição de estoque atual"; subtítulo só inclui "Lista de compras: N produto(s)" quando `secoes.compras`; `×` trocado por `x` (WinAnsi) ✔ |
| `src/pages/Relatorios.tsx` | `Aba` com `'compras'` (rótulo curto "Compras"), 4º checkbox "Lista de compras (reposição)" **marcado por padrão**, `role="group" aria-labelledby="r-secoes"`, `TabelaCompras` local com `<th scope="col">`, `BadgeReposicao`/`Cobertura`, `Vazio` + `ShoppingCart` ✔ |
| `src/lib/relatorio.test.ts` | **novo** — 3 testes da lista de compras ✔ |
| `src/lib/exportar/exportar.test.ts` | **+4 testes** (4 abas, ausência da aba, aba vazia, PDF maior) ✔ |

### Contratos introduzidos

```ts
// src/lib/relatorio.ts
export interface LinhaCompraRel {
  codigo: string
  produto: string
  categoria: string
  unidade: Unidade
  saldo: number
  minimo: number | null
  cobertura: number | null                       // calcularCobertura(saldo, minimo)
  sugestaoCompra: number                         // sugerirCompra(saldo, minimo, conteudo_embalagem)
  situacao: 'abaixo' | 'no_minimo'               // situacaoReposicao via montarReposicao
}
// Relatorio ganhou: compras: LinhaCompraRel[]

// src/lib/exportar/excel.ts
export interface Secoes { resumo: boolean; movimentacoes: boolean; posicao: boolean; compras: boolean }
```

### Decisões registradas

- **Nenhuma regra de negócio nova.** `relatorio.ts` apenas projeta `montarReposicao`; o teste
  `relatorio.test.ts` compara os valores com `sugerirCompra`/`calcularCobertura` diretamente,
  então qualquer reimplementação de saldo/mínimo quebra o teste.
- Lista traz **só** `abaixo`/`no_minimo` (`incluirSemMinimo: false`), ordenada por cobertura asc
  (do mais crítico ao menos crítico) — mesma ordenação do `montarReposicao`.
- Reposição **não** colore linha no Excel/PDF (diferente de Posição, que segue a situação do lote);
  a urgência é dada por ordem + negrito na coluna `Comprar`.
- `Secoes.compras` é **obrigatório** de propósito: o `tsc` quebra até todos os pontos que montam
  `Secoes` serem atualizados (`Relatorios.tsx` e os 3 helpers de `exportar.test.ts`).
- Validação "Escolha pelo menos uma seção do relatório." roda **antes** de `setGerando`, então o
  spinner não aparece num clique inválido.
- Excel: `compras: true` com lista vazia **ainda cria a aba** com "Nenhum produto no ponto de pedido."
  (mesmo padrão da legenda de cores de Posição) em vez de aba vazia.

### Pendências remanescentes (não bloqueiam)

1. **Teste de componente** — o checkbox padrão-marcado e o toast de validação (CA-7) foram
   verificados por leitura do código; o projeto não tem `*.test.tsx` nem `@testing-library`.
2. **Migration** — `ALTER TABLE produtos ADD COLUMN estoque_minimo` continua ausente em
   `supabase/migrations`; sem ela os mínimos (e portanto a lista de compras) só existem no aparelho.
3. `src/pages/Painel.tsx` — ainda remonta `ReposicaoProduto` à mão; é o item T-002.

## Item: T-006 — Filtros na URL + rodapé de totais

### Situação: concluído e aprovado no QA (ciclo anterior)

| Arquivo | Situação |
|---|---|
| `src/lib/periodos.ts` | `PeriodoDaUrl`, `periodoDaUrl(query, hoje?)`, `chaveIntervalo()`, `juntarFiltros()` ✔ |
| `src/lib/formato.ts` | `TotalGrupo`, `TotaisMov`, `totaisPorGrupo(movs)` ✔ |
| `src/lib/regras.test.ts` | +7 testes de `periodoDaUrl`, `chaveIntervalo`, `juntarFiltros` e `totaisPorGrupo` ✔ |
| `src/components/ListaMovimentacoes.tsx` | prop `resumo?: boolean` + rodapé de totais ✔ |
| `src/pages/Historico.tsx` | `useSearchParams` como fonte de verdade, `replace: true`, debounce 300 ms ✔ |
| `src/pages/Relatorios.tsx` | inicializa por `periodoDaUrl(params, hojeISO())` e espelha `de/ate` na URL ✔ |

Contratos:

```ts
periodoDaUrl(query: URLSearchParams | Record<string,string|null>, hoje?: string): PeriodoDaUrl
chaveIntervalo(i: Intervalo): string                  // "AAAA-MM-DD|AAAA-MM-DD"
juntarFiltros(params, mudancas): URLSearchParams      // valor vazio (ou só espaços) remove o parâmetro
totaisPorGrupo(movs: readonly Movimentacao[]): TotaisMov
```

Defeito corrigido naquele ciclo: `juntarFiltros` gravava `?q=+` com busca só de espaços —
`trim()` antes do teste de presença em `periodos.ts`.

## Item: T-002 — Estoque mínimo / ponto de pedido

### Situação: concluído no código

| Arquivo | Situação |
|---|---|
| `src/lib/tipos.ts` | `Produto.estoque_minimo: number \| null` e campo em `ProdutoDados` ✔ |
| `src/lib/estoque.ts` | `SituacaoReposicao`, `ReposicaoProduto`, `situacaoReposicao()`, `sugerirCompra()`, `calcularCobertura()`, `montarReposicao()`, `precisaRepor()`, `abaixoDoMinimo()`, `saldosPorProduto()` ✔ |
| `src/lib/dados/catalogo.ts` | `estoque_minimo` em `COLUNAS_PRODUTO`, fallback local (`42703`/`PGRST204`), `salvarEstoqueMinimo()` ✔ |
| `src/components/ui.tsx` | `BadgeReposicao` e `Cobertura` ✔ |
| `src/components/ReposicaoForm.tsx` / `ListaReposicao.tsx` | modal e lista por produto ✔ |
| `src/pages/Estoque.tsx` | filtro "Repor" (`abaixo`), `aria-pressed` nos chips, `mín.` na coluna Saldo ✔ |
| `src/lib/regras.test.ts` | cobertura do domínio de reposição ✔ |

### Pendências remanescentes (não bloqueiam a compilação)

1. **Migration** — `ALTER TABLE produtos ADD COLUMN estoque_minimo` ainda precisa ser
   adicionada em `supabase/migrations`. Sem ela os mínimos ficam apenas no aparelho
   (chave `galpao-minimos-<empresaId>`) e não viajam entre dispositivos.
2. **`src/pages/Painel.tsx`** — KPI "Abaixo do mínimo" e uso de `montarReposicao` em
   "Precisa de atenção" (item T-002 do backlog).

## Modelo de domínio de reposição

```
SituacaoReposicao = 'abaixo' | 'no_minimo' | 'acima' | 'sem_minimo'
cobertura = saldo / minimo            (null quando sem mínimo)
sugestaoCompra = ceil((minimo - saldo) / conteudo_embalagem) * conteudo_embalagem
                 (ou minimo - saldo arredondado, quando não há embalagem)
```

Regras: `minimo` nulo ou `<= 0` → `sem_minimo`; `saldo <= 0` ou `saldo < minimo` → `abaixo`;
`saldo === minimo` → `no_minimo`; `saldo > minimo` → `acima`.

Entram na lista de compras: **abaixo + no_minimo**, ordenados por cobertura ascendente.
Reposição **não** colore a linha (o fundo segue a pior situação de lote); o badge sempre
traz ícone + texto, nunca só cor.

## Estado do backlog (persistido)

Aberto após este ciclo:

- **T-002** (prio 2, refactor) — enxugar duplicação Painel/Estoque: usar `montarReposicao()`
  em vez de remontar `ReposicaoProduto` à mão (hoje `sugestaoCompra: 0`, `situacaoLote: 'ok'`).
- **T-003** (prio 2, feature) — exportar direto da tela Estoque; hoje o botão "Exportar" é só
  um `<Link to="/relatorios">` e ignora filtro/busca/ordem da tela.
- **T-004** (prio 3, feature) — `config.dias_alerta` existe em `tipos.ts` e não é usado: tornar
  o alerta de validade configurável.
- **T-005** (prio 3, melhoria) — lista "Precisa de atenção" do Painel corta em `slice(0,8)` sem
  ordenar por urgência real de compra.
- **T-006** (prio 4, feature) — etiqueta/impressão de reposição para o comprador (PDF A4 com
  campos de preço do fornecedor e quantidade pedida), depois de validar T-001.

Concluído: T-002 (estoque mínimo), T-006 (filtros na URL), **T-001** (lista de compras).

Pendências verificadas no código e ainda não abertas como item:

- Migration de `estoque_minimo` (item 1 de T-002).
- Sem tela de conferência/inventário cego.
- Filtros de URL sem teste de componente (só teste de unidade em `periodos.ts`).
- CA-7 de T-001 (toast de validação das seções) sem teste de componente.
