
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

## [2026-10-17 13:53] Ciclo
Ciclo T-001 (lista de compras/reposição em Excel/PDF + aba Relatórios) — APROVADO. Verificação executada pelo QA: `npx tsc --noEmit` exit 0 (sem erros); `npx vitest run` exit 0 com 6 arquivos e 77/77 testes passando (9,07 s) — venda 13, relatorio.test.ts 3 (novo), regras 27, exportar 6 (era 2), sincronizador 6, supabase-local 22; `npm run build` exit 0 (2299 módulos, 894 ms, PWA emitido). Nenhuma falha em nenhuma rodada. Conferido no código, não só no relato do DEV: (a) `relatorio.ts` — `compras` vem de `montarReposicao(..., { incluirSemMinimo: false })` com flatMap filtrando 'abaixo'|'no_minimo'; nenhuma reimplementação de saldo/mínimo; (b) `excel.ts` — `Secoes.compras` obrigatório, aba 'Lista de compras' criada só sob `if (secoes.compras)`, cabeçalho em A5 via montarCabecalho, coluna Comprar bold verde, legenda ao final, `bordas(ws)` aplicado; (c) `pdf.ts` — tabela 'Compras (reposição)' depois de 'Posição de estoque atual', subtítulo condicional, '×' substituído por 'x' (WinAnsi), colSpan 8 no vazio; (d) `Relatorios.tsx` — 4 abas com rótulo curto 'Compras', checkbox 'Lista de compras (reposição)' iniciando true, role=group/aria-labelledby='r-secoes', guarda `if (!algumaSecao) return toast.erro('Escolha pelo menos uma seção do relatório.')` ANTES de setGerando, TabelaCompras local com th scope=col, BadgeReposicao, Cobertura e Vazio+ShoppingCart; reposição não usa classes linha-*; (e) testes: relatorio.test.ts compara sugestaoCompra/cobertura com sugerirCompra/calcularCobertura, exportar.test.ts cobre 4 abas na ordem, ausência da aba com compras:false, aba vazia com aviso, PDF maior com a seção. Risco residual não bloqueante: CA-7 (checkbox padrão-marcado + toast de validação) e a ordem visual das seções no PDF têm verificação apenas por revisão de código — o projeto não possui nenhum *.test.tsx nem @testing-library instalado; registrado no checklist do GUIA_DE_TESTES.md. Docs atualizados via escrever_arquivo: GUIA_DE_TESTES.md (tabela de verificação com 77 testes/6 arquivos/build 894 ms, §3.3 nova cobrindo T-001, regra 'helper puro novo ⇒ teste no mesmo commit', 2 pendências no checklist) e DOCUMENTACAO_ERP.md (status 77/77, seção T-001 com contratos LinhaCompraRel/Secoes.compras e decisões, T-002/T-006 recompactados, modelo de domínio, backlog com T-001 concluído e T-002/T-003/T-004/T-005/T-006 abertos). Backlog: T-001 marcado como concluído. VEREDITO: APROVADO

## [2026-10-17 13:54] Ciclo
## Ciclo T-001 — QA (veredito: APROVADO)

**Verificação executada (fatos)**

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | sem erros de tipo |
| `npx vitest run` | **0** | 6 arquivos, **77/77 testes** (9,07 s) |
| `npm run build` | **0** | 2299 módulos, PWA emitido, 894 ms |

Distribuição: `venda` 13 · `relatorio.test.ts` 3 (novo) · `regras` 27 · `exportar` 6 (era 2) · `sincronizador` 6 · `supabase-local` 22. Nenhuma falha em nenhuma rodada.

**Conferido no código (não só no relato do DEV)**
- `relatorio.ts`: `compras` vem de `montarReposicao(..., { incluirSemMinimo: false })`, filtrando `'abaixo'|'no_minimo'`; nenhuma regra de saldo/mínimo reimplementada.
- `excel.ts`: `Secoes.compras` obrigatório; aba "Lista de compras" só sob `if (secoes.compras)`; cabeçalho verde em A5; `Comprar` em negrito; legenda; `bordas(ws)`.
- `pdf.ts`: tabela "Compras (reposição)" após "Posição de estoque atual"; subtítulo condicional; `×` → `x` (WinAnsi); vazio com `colSpan: 8`.
- `Relatorios.tsx`: 4 abas (rótulo curto "Compras"), checkbox "Lista de compras (reposição)" iniciando `true`, `role="group" aria-labelledby="r-secoes"`, guarda `toast.erro('Escolha pelo menos uma seção do relatório.')` **antes** de `setGerando`; `TabelaCompras` com `<th scope="col">`, `BadgeReposicao`, `Cobertura`, `Vazio`+`ShoppingCart`; reposição não usa classes `linha-*`.
- Testes: `relatorio.test.ts` compara com `sugerirCompra`/`calcularCobertura` (trava anti-reimplementação); `exportar.test.ts` cobre 4 abas na ordem, ausência da aba com `compras:false`, aba vazia e PDF maior com a seção.

**Risco residual (não bloqueante):** CA-7 (checkbox padrão + toast de validação) e a ordem visual do PDF têm verificação apenas por revisão de código — o projeto não tem `*.test.tsx` nem `@testing-library`. Registrado no checklist do guia.

**Docs atualizados:** `GUIA_DE_TESTES.md` (77/77, build, §3.3 nova de T-001, regra "helper puro ⇒ teste no mesmo commit", 2 pendências no checklist) e `DOCUMENTACAO_ERP.md` (seção Lista de compras no Relatórios).

VEREDITO: APROVADO

## [2026-10-17 13:59] Ciclo
Ciclo QA T-001 (lista de compras exportável) — REPROVADO. `npx tsc --noEmit` exit=1: src/lib/estoque.ts(342,7) TS2322 'SituacaoReposicao' não atribuível a '"abaixo" | "no_minimo"' em filtrarItensCompra (noPontoDePedido não é type guard); src/lib/exportar/pdf.ts(1,42) TS6133 'formatarNumero' importado e não usado. `npx vitest run` exit=1: 7 arquivos, 85 testes, 83 passando / 2 falhando, ambos em src/lib/exportar/lista-compra.test.ts — (:62) espera codigo 'P0005' mas o helper produto() gera 'P000' + id.length = 'P0001'; (:136) espera getCell(8).value === 8 mas o exportador grava o texto '8 kg (2 emb.)' na coluna Comprar. Verdes (sem regressão): venda.test.ts 13, relatorio.test.ts 3, regras.test.ts 27, exportar.test.ts 6, sincronizador.test.ts 6, supabase-local.test.ts 22, e 6 dos 8 de lista-compra.test.ts (ordem por cobertura, no_minimo preservado, Set vazio, id inexistente, nomeArquivoListaCompra, Adobe %PDF- > 5000, aviso sem seleção). npm run build não executado (bloqueado pelo tsc). GUIA_DE_TESTES.md e DOCUMENTACAO_ERP.md atualizados com os erros concretos e o veredito por CA; item T-001 NÃO marcado como concluído no backlog (permanece aberto para o Programador).

## [2026-10-17 14:03] Ciclo
Ciclo T-001 (reenvio após correção) — APROVADO. Verificação executada pelo QA: `npx tsc --noEmit` exit 0 (sem erros); `npx vitest run` exit 0 com 7 arquivos e 85/85 testes passando (9,55 s) — venda 13, relatorio 3, regras 27, lista-compra 8 (era 6 verdes + 2 vermelhos), exportar 6, sincronizador 6, supabase-local 22; `npm run build` exit 0 (2303 módulos, PWA generateSW, 11 entradas precache 1018,56 KiB, 1,02 s). Isolado re-rodado: `npx vitest run src/lib/exportar/lista-compra.test.ts` → 8/8 verdes. Correções conferidas no código, não só no relato: (a) src/lib/estoque.ts — `noPontoDePedido(situacao): situacao is SituacaoPedido` virou type guard e `filtrarItensCompra` grava `comoSituacaoPedido(item.situacao)` (tipo `'abaixo' | 'no_minimo'`), eliminando o TS2322 de :342; (b) src/lib/exportar/pdf.ts — import reduzido a `formatarData, formatarDataHora, formatarValidade` + helpers de comum.ts, sem `formatarNumero` (elimina TS6133, `noUnusedLocals` ok); (c) src/lib/exportar/lista-compra.test.ts — produtos de teste agora declaram `codigo_interno` explícito (P0001/P0002/P0003), corrigindo a expectativa de :62; (d) contrato da coluna "Comprar" alinhado numa direção só: Excel = número puro (`formatoNumero(comprar, item.sugestaoCompra)` + negrito VERDE_ARGB, teste de :136 espera 8), PDF = texto `"8 kg (2 emb.)"` — a decisão está registrada nos dois documentos. Regressão conferida isoladamente: regras 27 + relatorio 3 + exportar 6 = 36/36 verdes (4 abas na ordem, A5='Código', fgColor FF047857, aba ausente com compras:false, PDF maior com a seção). Nenhuma alteração em src/lib/dados/* nem supabase/migrations/*. Docs reescritos: GUIA_DE_TESTES.md (estado APROVADO, tabela de verificação tsc 0/vitest 85/build 0, tabela "o que estava quebrado e como foi corrigido", §3.4 com os 8 casos verdes + contrato Excel=número/PDF=texto, regra "helper puro novo ⇒ teste no mesmo commit", checklist de PR com os 3 comandos marcados) e DOCUMENTACAO_ERP.md (status OK, tabela de correções TS2322/TS6133/testes, seção T-001 concluída com contratos SituacaoPedido/ItemCompra, veredito CA a CA, decisões registradas, domínio de reposição com SituacaoPedido, backlog com T-001 concluído e T-002/T-003/T-004/T-005/T-006/T-007 abertos). Riscos residuais não bloqueantes: sem teste de componente (projeto sem *.test.tsx/@testing-library) para checkboxes, BarraAcoesCompra, toasts e CA-7; migration `ALTER TABLE produtos ADD COLUMN estoque_minimo` continua ausente (T-002). Backlog: T-001 marcado como concluído. VEREDITO: APROVADO
