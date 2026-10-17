# Documentação do ERP Galpão

## Status do repositório

**Compilação: OK** (`npx tsc --noEmit` → exit 0).
Testes: **70/70 passando** em 5 arquivos (`npx vitest run` → exit 0).
Build: **OK** (`npm run build` → exit 0, 2299 módulos, PWA emitido).
Backlog verificado no código; pendências remanescentes listadas abaixo.

## Item: T-006 — Filtros na URL + rodapé de totais

### Situação: concluído e aprovado no QA (ciclo atual)

| Arquivo | Situação |
|---|---|
| `src/lib/periodos.ts` | `PeriodoDaUrl`, `periodoDaUrl(query, hoje?)`, `chaveIntervalo()`, `juntarFiltros()` ✔ (`intervaloRapido`/`intervaloParaInstantes` intactos) |
| `src/lib/formato.ts` | `TotalGrupo`, `TotaisMov`, `totaisPorGrupo(movs)` (puro, sem `Dados`/`Produto`) ✔ |
| `src/lib/regras.test.ts` | **+7 testes** de `periodoDaUrl`, `chaveIntervalo`, `juntarFiltros` e `totaisPorGrupo` ✔ |
| `src/components/ListaMovimentacoes.tsx` | prop `resumo?: boolean` (default `false`) + prop opcional `unidadeDoProduto`; rodapé só quando `resumo && movs.length > 0` ✔ |
| `src/pages/Historico.tsx` | `useSearchParams` como fonte de verdade (`?de=&ate=&tipo=&q=`), escrita com `replace: true`, debounce 300 ms na busca, `<Vazio>` com CTA "Limpar filtros" e foco devolvido ao 1º chip, `resumo` na lista ✔ |
| `src/pages/Relatorios.tsx` | inicializa por `periodoDaUrl(params, hojeISO())` e espelha `de/ate` na URL ao trocar período; chamada `listarMovimentacoes({ desde })` **inalterada** ✔ |
| `Painel.tsx` / `ProdutoDetalhe.tsx` | **não** passam `resumo` → DOM idêntico ao anterior ✔ |

### Contratos introduzidos

```ts
// src/lib/periodos.ts
periodoDaUrl(query: URLSearchParams | Record<string,string|null>, hoje?: string): PeriodoDaUrl
//   sem params → { periodo:'7dias', intervalo: intervaloRapido('7dias', hoje), personalizado:false }
//   de/ate válidos + de <= ate + ate <= hoje → { periodo:'personalizado', personalizado:true }
//   inválido/invertido/no futuro/um lado só → padrão; NUNCA lança
chaveIntervalo(i: Intervalo): string          // "AAAA-MM-DD|AAAA-MM-DD"
juntarFiltros(params, mudancas): URLSearchParams // valor vazio (ou só espaços) remove o parâmetro

// src/lib/formato.ts
interface TotalGrupo { qtd: number; soma: number }
interface TotaisMov { lancamentos: number; entradas: TotalGrupo; saidas: TotalGrupo; ajustes: TotalGrupo }
totaisPorGrupo(movs: readonly Movimentacao[]): TotaisMov
```

Regra de agrupamento: `grupoDoTipo` (`AJUSTE`/`CORRECAO` → ajustes, `SAIDA`/`VENDA`/`TRANSF_SAIDA`
→ saídas, resto → entradas). `soma` é Σ `delta`, então saídas já somam negativo.

### Decisões de UI registradas

- Rodapé da lista: `N lançamento(s) · Entradas +X · Saídas −Y · Ajustes ±Z`, cores
  `emerald-700`/`red-700`/`violet-700` (mesmo padrão da tabela Resumo dos Relatórios),
  `tabular-nums`, `aria-live="polite" aria-atomic="true"`, `data-resumo-movimentacoes`.
- Nunca renderiza "0 lançamentos" abaixo do `<Vazio>`: o rodapé exige `movimentacoes.length > 0`.
- Unidade no rodapé só aparece quando a lista inteira é de um produto só (evita somar L com kg).
- Link compartilhável: trocar filtro usa `setParams(..., { replace: true })` — sem 20 entradas
  no histórico do navegador.

### Defeito encontrado e corrigido neste ciclo

`juntarFiltros` gravava `?q=+` quando a busca tinha só espaço (o teste de
`chaveIntervalo/juntarFiltros` falhou com
`expected 'de=…&ate=…&q=+' to be 'de=…&ate=…'`). Correção: `trim()` antes do teste de
presença em `periodos.ts`. Resultado após a correção: 70/70 testes verdes.

## Item: T-002 — Estoque mínimo / ponto de pedido

### Situação: concluído no código

| Arquivo | Situação |
|---|---|
| `src/lib/tipos.ts` | `Produto.estoque_minimo: number \| null` e campo em `ProdutoDados` ✔ |
| `src/lib/estoque.ts` | `SituacaoReposicao`, `ReposicaoProduto`, `situacaoReposicao()`, `sugerirCompra()`, `calcularCobertura()`, `montarReposicao()`, `precisaRepor()`, `saldosPorProduto()` ✔ |
| `src/lib/dados/catalogo.ts` | `estoque_minimo` em `COLUNAS_PRODUTO`, fallback local quando a coluna não existe (`42703`/`PGRST204`), `salvarEstoqueMinimo()` ✔ |
| `src/components/ui.tsx` | `BadgeReposicao` e `Cobertura` ✔ |
| `src/components/ReposicaoForm.tsx` | modal de um campo sobre `CampoQuantidade` ✔ |
| `src/components/ListaReposicao.tsx` | lista por produto, `data-reposicao`/`data-situacao` ✔ |
| `src/components/ProdutoForm.tsx` | campo "Estoque mínimo (ponto de pedido)" ✔ (falha `TS2345` corrigida) |
| `src/pages/Estoque.tsx` | filtro "Repor" (`abaixo`), `aria-pressed` nos chips, `mín.` na coluna Saldo ✔ |
| `src/lib/regras.test.ts` | cobertura do domínio de reposição ✔ |

### Pendências remanescentes (não bloqueiam a compilação)

1. **Migration** — `ALTER TABLE produtos ADD COLUMN estoque_minimo` ainda precisa ser
   adicionada em `supabase/migrations`. Sem ela os mínimos ficam apenas no aparelho
   (chave `galpao-minimos-<empresaId>`) e não viajam entre dispositivos.
2. **`src/pages/Painel.tsx`** — KPI "Abaixo do mínimo" (`lg:grid-cols-5`) e uso de
   `montarReposicao` em "Precisa de atenção".

## Modelo de domínio de reposição

```
SituacaoReposicao = 'abaixo' | 'no_minimo' | 'acima' | 'sem_minimo'
cobertura = saldo / minimo            (null quando sem mínimo)
sugestaoCompra = ceil((minimo - saldo) / conteudo_embalagem) * conteudo_embalagem
                 (ou minimo - saldo arredondado, quando não há embalagem)
```

Regras: `minimo` nulo ou `<= 0` → `sem_minimo`; `saldo <= 0` ou `saldo < minimo` → `abaixo`;
`saldo === minimo` → `no_minimo`; `saldo > minimo` → `acima`.

Reposição **não** colore a linha (o fundo segue a pior situação de lote); o badge sempre
traz ícone + texto, nunca só cor.

## Estado do backlog (persistido)

Aberto após este ciclo:

- **T-003** (prio 2, melhoria) — Histórico: filtro por usuário (derivado das movs, sem
  consulta extra) + chips por grupo (entrada/saída/ajuste), reaproveitando a infra de URL de T-006.
- **T-005** (prio 3, melhoria) — saldo em embalagens fechadas ("2 emb. + 6 un") no
  `ProdutoDetalhe` + criar `formato.test.ts` (`formatarEmbalagens` hoje só é exercitada
  indiretamente; `formatarDelta`/`formatarNumero` merecem casos próprios).
- **T-007** (prio 3, feature) — exportar CSV da lista "Repor" (`sugerirCompra` já calcula a
  quantidade; falta decidir se a lista vive em `ListaReposicao`).

Concluído: T-002, **T-006**.

Pendências verificadas no código e ainda não abertas como item:

- Migration de `estoque_minimo` (item 1 de T-002).
- `montarRelatorio` sem visão "o que comprar".
- Sem tela de conferência/inventário cego.
- Filtros de URL sem teste de componente (só teste de unidade em `periodos.ts`).
