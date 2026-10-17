
## [2026-10-17 13:36] Ciclo
CICLO QA — REPROVADO. `npx tsc --noEmit`: exit 1, 1 erro — src/components/ProdutoForm.tsx(33,52) TS2345: objeto passado a useState<ProdutoDados> não inclui `estoque_minimo`, agora obrigatório em ProdutoDados (src/lib/tipos.ts). `npx vitest run`: exit 0, 5 arquivos / 57 testes passando (10,2 s). Corrigido no relatório anterior: regras.test.ts e exportar.test.ts NÃO quebram com o novo campo (helpers usam ...extra) — hipótese anterior era falsa. Docs atualizados: GUIA_DE_TESTES.md (comandos, tabela de verificação, falha de tipos detalhada, lacuna de cobertura de situacaoReposicao/sugerirCompra/montarReposicao) e DOCUMENTACAO_ERP.md (status compilação quebrada, inventário do que existe/falta no T-002, modelo de domínio, estado real do backlog). Backlog NÃO marcado como concluído: T-002 não fecha — falta ProdutoForm, ProdutoDetalhe, Painel, revisão de Estoque.tsx, migration ALTER TABLE produtos ADD COLUMN estoque_minimo e testes do domínio de reposição. Devolvido ao Programador.

## [2026-10-17 13:40] Ciclo
## Ciclo QA — verificação final: APROVADO

### Comandos executados
- `npx tsc --noEmit` → **exit 0**, nenhum erro. O `TS2345` de `src/components/ProdutoForm.tsx` (faltava `estoque_minimo` em `ProdutoDados`) está corrigido.
- `npx vitest run` → **exit 0**, 5 arquivos, **63 testes, 63 passando** (9,15 s).
  - `src/pdv/venda.test.ts` 13
  - `src/lib/regras.test.ts` 20 (subiu de 14 → 20: domínio de reposição coberto)
  - `src/lib/exportar/exportar.test.ts` 2
  - `src/pdv/sincronizador.test.ts` 6
  - `servidor-local/supabase-local.test.ts` 22

### Correção de fato registrada
A previsão do ciclo anterior de que `regras.test.ts` e `exportar.test.ts` quebrariam por causa do novo campo obrigatório **não se confirmou**: os helpers montam `Produto` com `...extra` e seguem válidos. Registrado em `GUIA_DE_TESTES.md` §2.

### Documentos atualizados
- `GUIA_DE_TESTES.md`: estado APROVADO; tabela "Última verificação" com tsc 0 / vitest 63 passando; §3 Cobertura com 20 testes em `regras.test.ts`; §3.1 lista dos casos de reposição agora cobertos; checklist de PR com tsc e vitest marcados.
- `DOCUMENTACAO_ERP.md`: status "Compilação: OK / 63 testes"; `ProdutoForm.tsx` e `Estoque.tsx` movidos para a coluna "Situação" como concluídos; pendências remanescentes reduzidas a 3 (migration `ALTER TABLE produtos ADD COLUMN estoque_minimo`, linha "Estoque mínimo"/`BadgeReposicao` em `ProdutoDetalhe.tsx`, KPI "Abaixo do mínimo" + `montarReposicao` no `Painel.tsx`).

### Pendências que não bloqueiam o build (ficam no backlog)
1. Migration `ALTER TABLE produtos ADD COLUMN estoque_minimo` (sem ela os mínimos não viajam entre dispositivos).
2. `ProdutoDetalhe.tsx`: linha "Estoque mínimo" + `BadgeReposicao`.
3. `Painel.tsx`: KPI "Abaixo do mínimo" (`lg:grid-cols-5`) e `montarReposicao` em "Precisa de atenção".

VEREDITO: APROVADO
