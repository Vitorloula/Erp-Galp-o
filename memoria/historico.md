
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

## [2026-10-17 13:48] Ciclo
Ciclo T-006 (filtros na URL + rodapé de totais) — APROVADO. Verificação: `npx tsc --noEmit` exit 0; `npx vitest run` exit 0 com 5 arquivos e 70/70 testes (regras.test.ts foi de 20 → 27); `npm run build` exit 0 (2299 módulos, PWA emitido). Defeito real capturado na 1ª execução do vitest: `regras.test.ts > períodos > chaveIntervalo e juntarFiltros` falhou com `expected 'de=2026-10-01&ate=2026-10-03&q=+' to be 'de=2026-10-01&ate=2026-10-03'` — `juntarFiltros` aceitava string só com espaços como valor truthy e gravava `?q=+`. Correção em `src/lib/periodos.ts`: `trim()` no valor antes do teste de presença, sem mudar assinaturas (`periodoDaUrl`, `intervaloRapido`, `intervaloParaInstantes` intactos). Reexecução do vitest: 70/70 verdes; tsc e build re-rodados verdes após a correção. Conferido no código (não apenas relatado pelo DEV): Historico.tsx usa `periodoDaUrl` + `useSearchParams` com `replace: true` e passa `resumo`; Relatorios.tsx inicializa por `periodoDaUrl` e mantém `listarMovimentacoes({ desde })`; ListaMovimentacoes só renderiza rodapé quando `resumo && movs.length > 0`; Painel/ProdutoDetalhe não passam `resumo`. Nenhum arquivo de `src/lib/dados/*` ou `supabase/migrations/*` foi tocado neste ciclo. Docs atualizados: GUIA_DE_TESTES.md (tabela de verificação, 70 testes, nova seção 3.2, regra "helper puro novo ⇒ teste no mesmo commit", pendência de teste de componente) e DOCUMENTACAO_ERP.md (seção T-006 com contratos e decisões de UI, defeito e correção registrados, T-002 atualizada, backlog com T-003/T-005/T-007 abertos). Backlog: T-006 marcado como concluído. Risco residual não bloqueante: filtros de URL cobertos só em nível de unidade — falta smoke/teste de componente em Histórico/Relatórios; loop de debounce da busca em Historico.tsx não foi exercitado por teste automatizado (revisão visual do efeito: dependência `[busca]`, comparação `busca.trim() === termo.trim()`, guarda de saída — sem laço aparente).

## [2026-10-17 13:48] Ciclo
## Ciclo T-006 — QA final (SUCESSO)

**Verificação executada**

| Comando | Exit | Resultado |
|---|---|---|
| npx tsc --noEmit (1ª rodada) | 0 | sem erros |
| npx vitest run (1ª rodada) | 1 (failed) | 69/70 |
| npx vitest run (após correção) | 0 | 70/70, 5 arquivos |
| npx tsc --noEmit (re-rodado pós-correção) | 0 | sem erros |
| npm run build | 0 | 2299 módulos, PWA emitido |

**Falha concreta encontrada e corrigida**

```
FAIL src/lib/regras.test.ts > períodos > chaveIntervalo e juntarFiltros alimentam o link compartilhável
AssertionError: expected 'de=2026-10-01&ate=2026-10-03&q=+' to be 'de=2026-10-01&ate=2026-10-03'
```

Causa raiz em src/lib/periodos.ts → juntarFiltros: `if (valor)` tratava `' '` (string só com espaço) como truthy e gravava `?q=+` na URL — lixo no link compartilhado e busca espúria. Correção: `trim()` no valor antes do teste de presença; vazio/espaços passam a remover o parâmetro. Assinaturas preservadas (periodoDaUrl, intervaloRapido, intervaloParaInstantes intactos).

**Conferência no código (não apenas no relato do DEV)**
- Historico.tsx: useSearchParams como fonte de verdade (?de=&ate=&tipo=&q=), escrita com replace: true, debounce 300 ms comparando busca.trim() === termo.trim() (sem laço), <Vazio> com CTA "Limpar filtros" devolvendo foco ao 1º chip, resumo na lista. OK
- Relatorios.tsx: inicializa por periodoDaUrl(params, hojeISO()), espelha de/ate na URL; chamada listarMovimentacoes({ desde }) inalterada. OK
- ListaMovimentacoes.tsx: rodapé só quando resumo && movimentacoes.length > 0 — sem "0 lançamentos" sob o <Vazio>; sem resumo o DOM é o atual. Painel/ProdutoDetalhe não passam a prop. OK
- Nenhuma alteração em src/lib/dados/* nem supabase/migrations/*. OK

**Docs atualizados**
- GUIA_DE_TESTES.md: tabela de verificação (70 testes), seção 3.2 (períodos/totais), registro da falha ?q=+, regra "helpers puros testados sem DOM".
- DOCUMENTACAO_ERP.md: seção de períodos/URL como fonte de verdade e nota sobre juntarFiltros.

**Veredito:** tsc 0, vitest 70/70, build 0 → VEREDITO: APROVADO
