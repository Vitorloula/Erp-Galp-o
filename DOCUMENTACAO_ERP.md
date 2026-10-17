# Documentação do ERP Galpão

## Status do repositório

**Compilação: OK** (`npx tsc --noEmit` → exit 0).
Testes: **63/63 passando** em 5 arquivos (`npx vitest run` → exit 0).
Backlog verificado no código; pendências remanescentes listadas abaixo.

## Item: T-002 — Estoque mínimo / ponto de pedido

### Situação: concluído no código (ciclo atual)

| Arquivo | Situação |
|---|---|
| `src/lib/tipos.ts` | `Produto.estoque_minimo: number \| null` e campo em `ProdutoDados` ✔ |
| `src/lib/estoque.ts` | `SituacaoReposicao`, `ReposicaoProduto`, `situacaoReposicao()`, `sugerirCompra()`, `calcularCobertura()`, `montarReposicao()`, `precisaRepor()`, `saldosPorProduto()` ✔ |
| `src/lib/dados/catalogo.ts` | `estoque_minimo` em `COLUNAS_PRODUTO`, fallback local quando a coluna não existe (`42703`/`PGRST204`), `salvarEstoqueMinimo()` ✔ |
| `src/components/ui.tsx` | `BadgeReposicao` e `Cobertura` ✔ |
| `src/components/ReposicaoForm.tsx` | modal de um campo sobre `CampoQuantidade` ✔ |
| `src/components/ListaReposicao.tsx` | lista por produto, `data-reposicao`/`data-situacao` ✔ |
| `src/components/ProdutoForm.tsx` | estado inicial com `estoque_minimo: produto?.estoque_minimo ?? null` + campo "Estoque mínimo (ponto de pedido)" ✔ (falha `TS2345` corrigida) |
| `src/pages/Estoque.tsx` | filtro "Repor" (`abaixo`), `aria-pressed` nos chips, `mín.` na coluna Saldo, `contagem` via `montarReposicao` ✔ |
| `src/lib/regras.test.ts` | cobertura do domínio de reposição ✔ |

### Pendências remanescentes (não bloqueiam a compilação)

1. **Migration** — `ALTER TABLE produtos ADD COLUMN estoque_minimo` ainda precisa ser
   adicionada em `supabase/migrations`. Sem ela os mínimos ficam apenas no aparelho
   (chave `galpao-minimos-<empresaId>`) e não viajam entre dispositivos.
2. **`src/pages/ProdutoDetalhe.tsx`** — incluir a linha "Estoque mínimo" e o `BadgeReposicao`.
3. **`src/pages/Painel.tsx`** — KPI "Abaixo do mínimo" (`lg:grid-cols-5`) e uso de
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

Decisões de UI já registradas: reposição **não** colore a linha (o fundo segue a pior
situação de lote); o badge sempre traz ícone + texto, nunca só cor.

## Estado do backlog (persistido)

Somente `T-002`, `T-003`, `T-005` estão no backlog do sistema. `T-001`, `T-004` e
`T-006` se perderam em chamadas de `atualizar_backlog` de ciclos anteriores.
Pendências verificadas no código e ainda não abertas como item:

- `FiltroMovimentacoes` sem `tipo` e sem `usuario` — Histórico não responde "quem deu
  baixa neste lote".
- `montarRelatorio` sem visão "o que comprar".
- `formatarEmbalagens` usada só em Estoque, não em ProdutoDetalhe.
- Sem tela de conferência/inventário cego.
- Migration de `estoque_minimo` ainda ausente (item 1 acima).
