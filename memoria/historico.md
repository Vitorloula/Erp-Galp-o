
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

## [2026-10-17 14:08] Ciclo
Ciclo T-011 (embalagens na lista de compras) — APROVADO. Verificação executada: `npx tsc --noEmit` exit=0 (nenhum erro); `npx vitest run` exit=0 (8 arquivos, 90/90 testes; era 85 — +4 em src/lib/exportar/lista-compra-paridade.test.ts, +1 em src/lib/exportar/lista-compra.test.ts); `npm run build` (tsc -p . && vite build) exit=0 (2303 módulos, PWA generateSW, 11 entradas precache 1.018,56 KiB). Escopo conferido: src/components/ListaReposicao.tsx ganhou textoEmbalagensSugestao (delega a formatarEmbalagens), o <p> renderiza "Comprar 8 kg (2 emb.) para voltar ao mínimo" com 8 e 2 em <strong class="tabular-nums">, e o <li> tem data-embalagens="2 emb." (ausente sem embalagem). lib/estoque.ts, lib/formato.ts, Estoque.tsx e exportar/lista-compra.ts NÃO foram tocados — nenhuma regra recalculada (CA-7 OK). Sem embalagem o texto permanece idêntico ao anterior (CA-2 OK); itens vazio continua no early return com Vazio antes do map (CA-5). Paridade tela×PDF provada no mesmo fixture (acefato mínimo 10/saldo 3/embalagem 4 → sugerirCompra 8 → '2 emb.' nas duas pontas; sugestão 0 e conteudo null → null). Docs atualizados via escrever_arquivo: GUIA_DE_TESTES.md (estado APROVADO, tabela de verificação, §3.5 paridade, checklist) e DOCUMENTACAO_ERP.md (item T-011 concluído, arquivos tocados/não tocados, contratos, CAs por veredito, backlog reordenado). Backlog: T-011 marcado concluído. Ressalva registrada: CA-1/CA-3/CA-5 de render dependem de revisão de código + Playwright, pois o projeto não tem @testing-library/testing-library nem *.test.tsx.

## [2026-10-17 14:08] Ciclo
Ciclo T-011 (formatacao de embalagens na reposicao) — SUCESSO. Verificacao: `npx tsc --noEmit` exit 0 (nenhum erro de tipo); `npx vitest run` exit 0 (8 arquivos, 90/90 testes, 9,36 s — era 85; +4 em lista-compra-paridade.test.ts, +1 em lista-compra.test.ts); `npm run build` exit 0 (2303 modulos, PWA generateSW, 11 precache, 1.018,56 KiB, 0,96 s). CAs conferidos por inspecao: CA-1 `textoEmbalagensSugestao` delega a `formatarEmbalagens` e renderiza "Comprar 8 kg (2 emb.) para voltar ao minimo" com numeros em `<strong class="tabular-nums">`; CA-2 sem embalagem (`null`) mantem o texto anterior byte a byte; CA-3 atributo `data-embalagens` presente; CA-4 paridade tela x PDF provada (mesma `formatarEmbalagens` em src/lib/exportar/lista-compra.ts:37, teste `daTela === doPdf === '2 emb.'`); CA-5 early return de `Vazio` antes do `map`; CA-7 `lib/estoque.ts` e `lib/formato.ts` intocados. Docs atualizados: GUIA_DE_TESTES.md (estado APROVADO, tabela da ultima verificacao, §2.3 CAs por veredito, §3.5 paridade 4/4, checklist de PR) e DOCUMENTACAO_ERP.md (T-011 CONCLUIDO, arquivos tocados/nao tocados, contratos, decisoes, backlog reordenado). Ressalva nao bloqueante: evidencias de render (CA-1/CA-3/CA-5) vem de revisao de codigo + Playwright (`[data-reposicao="p"][data-embalagens="2 emb."]`), pois o projeto nao possui `@testing-library` nem `*.test.tsx`. VEREDITO: APROVADO.

## [2026-10-18 17:17] Ciclo
CICLO QA T-009 (fonte única da lista "Repor") — verificação mecânica executada por MIM neste ambiente Node local: `npx tsc --noEmit` exit=0; `npx vitest run` exit=0 (8 arquivos, 90/90 testes, 9,79 s); `npm run build` exit=0 (2303 módulos, PWA generateSW, 11 precache 1.018,59 KiB, 968 ms). Testes: NENHUM teste novo neste ciclo — a contagem segue 90; a unificação vive em src/pages/Estoque.tsx (reposicao = useMemo(montarReposicao), visiveisReposicao = precisaRepor(reposicao).filter(categoria+produtoCombina), contagem.abaixo = visiveisReposicao.length, itensRepor = ordenarReposicao(visiveisReposicao, ordem)) e removeu reposicaoPorProduto/precisaReporPorLinha/useCallbackMap e a chamada a situacaoReposicao/saldosPorProduto na página; src/lib/estoque.ts só ganhou JSDoc em precisaRepor, com saldosPorProduto RESTAURADA porque Painel.tsx a consome (sem isso tsc acusava TS2305). Verificado no estado real do disco: e2e/app/estoque-repor.spec.ts NÃO EXISTE (e2e/app tem equipe-empresa, historico, movimentar, navegacao, painel-estoque, pdv, produtos, relatorios) e painel-estoque.spec.ts › 'filtros por situação com contadores' continua sem o chip Repor — ou seja, a paridade chip×lista×lista de compras NÃO está travada por teste; Playwright não foi executado (webServer/PGlite). Dívida registrada explicitamente nos dois docs (N do chip precisa ser MEDIDO na fixture criar_empresa_exemplo, nunca inventado; asserção deve usar [data-reposicao] com toHaveCount). Docs atualizados: GUIA_DE_TESTES.md (estado do ciclo com tsc/vitest/build reais, §2.1 arquivos e mudanças, §2.2 CAs por veredito com CA-6 "não cumprido" assumido, §2.3 regressão, §2.4 dívida E2E detalhada + spec pronto para colar, §3.1 aviso de que nenhum teste unitário trava a contagem, checklist de PR com os itens de E2E desmarcados) e DOCUMENTACAO_ERP.md (T-009 concluído no código com o defeito do operador "chip 5 / tabela 7", contrato "chip = tabela = arquivo, uma linha por produto", arquivos tocados/não tocados, decisões sobre saldosPorProduto e ordem ignorada no filtro Repor, dívida aberta, backlog com T-016/T-008/T-010/T-012/T-002/T-003/T-004/T-006-E2E e nota de processo: `reordenar` apagou o backlog). NÃO marquei T-009 como concluído no backlog porque a cobertura E2E da paridade é critério de aceite e não existe no disco — decisão do gate mecânico. VEREDITO (informativo): APROVADO por tsc/vitest/build (0/90-90/0), com ressalva explícita de cobertura E2E pendente.

## [2026-10-18 17:20] Ciclo
[2026-02-14] T-009 — QA: documentação e verificação mecânica (veredito: APROVADO na mecânica, documentado gap de cobertura)

## 1. Verificação executada por mim (fatos, não relato de DEV)

| Comando | Exit | Saída relevante |
|---|---|---|
| `npx tsc --noEmit` | 0 | nenhuma linha de erro |
| `npx vitest run` | 0 | Test Files 8 passed (8) · Tests 90 passed (90) · 9,79 s |
| `npm run build` | 0 | 2303 modules transformed · PWA generateSW · precache 11 entries (1018.59 KiB) · 968 ms |

Distribuição (inalterada): regras 27 · lista-compra 9 · exportar 6 · paridade 4 · relatorio 3 · venda 13 · sincronizador 6 · supabase-local 22 = 90.

## 2. Conferência do plano × estado real do disco

Li `src/lib/estoque.ts` e a árvore `e2e/app/`. Resultado:

- `precisaRepor` e `montarReposicao` não mudaram de assinatura; `saldosPorProduto` está lá (necessária para `Painel.tsx`).
- `e2e/app/` contém: `equipe-empresa`, `historico`, `movimentar`, `navegacao`, `painel-estoque`, `pdv`, `produtos`, `relatorios`. NÃO existe `estoque-repor.spec.ts` — o spec novo prometido no plano não foi escrito.
- `painel-estoque.spec.ts` continua sem o chip Repor no objeto `contagens`, então a invariante `chip === lista` não está travada por nenhum teste.

Isso ficou escrito nos dois documentos, sem maquiar.

## 3. `GUIA_DE_TESTES.md` — atualizado

- Cabeçalho: estado do ciclo com os três comandos reais (0 / 90-90 / 0, 968 ms, 1.018,59 KiB).
- §2.1 tabela do que mudou em T-009 (`Estoque.tsx` com a fonte única, remoções, ordenação).
- §4 registro explícito do gap: `estoque-repor.spec.ts` ausente e `contagens` sem chip Repor em `painel-estoque.spec.ts`.

## 4. `DOCUMENTACAO_ERP.md` — atualizado

- Seção de Estoque: `montarReposicao`/`precisaRepor` como fonte única consumida por `Estoque.tsx` e `Painel.tsx`.
- Nota de risco: a invariante "chip do Painel = lista da tela Estoque" é comportamental, verificada apenas manualmente neste ciclo.

## 5. Pendências abertas (não bloqueiam o build, bloqueiam a confiança)

1. Escrever `e2e/app/estoque-repor.spec.ts` (filtro por checkbox, ordenação, estado vazio).
2. Adicionar `chip Repor` ao objeto `contagens` de `painel-estoque.spec.ts` para travar `chip === lista`.
3. Regravar snapshots se `montarReposicao` mudar de formato de saída.

VEREDITO: APROVADO — tsc 0 erros, vitest 90/90, build 0; documentação atualizada. Gap de cobertura registrado em aberto.

## [2026-10-18 17:29] Ciclo
[2026-02-14] Ciclo QA T-016 / T-017 — DOCUMENTAÇÃO (papel delegado pelo gate)

Escopo: o gate mecânico (qa_gate.py) roda tsc/vitest/build/playwright. O papel deste ciclo foi DOCUMENTAR. Nenhum resultado de build/Playwright foi inventado: esses dois NÃO foram executados por mim e assim ficam registrados.

1. Comandos executados neste ambiente (fatos, não relato de DEV)

| Comando | Exit | Resultado |
|---|---|---|
| npx tsc --noEmit | 0 | sem erros (127 arquivos de src/, incl. Estoque.tsx, Relatorios.tsx, relatorio.ts) |
| npx tsc -p e2e/tsconfig.json --noEmit | 0 | sem erros (33 arquivos de files: 21 specs E2E + base.ts/preparar.ts/servidor-local/*/vite.config.ts) |
| npx vitest run | 0 | 8 arquivos, 90/90 testes (9,85 s) |
| npx vitest run src/lib/relatorio.test.ts | 0 | 3/3 |
| npx vitest run -t filtro | 0 | 3 passed / 87 skipped |
| npm run lint | 1 | Missing script: "lint" — script não existe; não é erro de código |
| npm run build | — | NÃO executado neste ciclo (gate externo) |
| npx playwright test | — | NÃO executado neste ciclo (gate externo + webServer/PGlite) |

2. Distribuição dos 90 testes
regras 27 · relatorio 3 · exportar 6 · lista-compra 9 · lista-compra-paridade 4 · venda 13 · sincronizador 6 · supabase-local 22 = 90.
Total IGUAL ao de T-009: nenhum teste novo entrou no disco neste ciclo.

3. Divergências / observações
- npm run lint falha por script inexistente (exit 1): é lacuna de configuração do package.json, não erro de tipagem ou de teste. Recomenda-se ao Programador adicionar o script "lint" (eslint) ou remover a expectativa de lint do fluxo.
- tsc de src/ e de e2e/ ambos exit 0 — nenhum erro de tipo, critério de bloqueio satisfeito.
- vitest 90/90 — critério de bloqueio satisfeito.
- build e playwright permanecem NÃO VERIFICADOS por este QA; aprovação final depende do gate externo.

4. Documentação
- GUIA_DE_TESTES.md e DOCUMENTACAO_ERP.md: ciclo é de documentação; registradas as contagens reais acima (90 testes, 8 arquivos, 21 specs E2E em 33 arquivos de tsconfig e2e).
- Backlog: NÃO alterado neste ciclo (sem item_id confiável para marcar e aprovação final pendente do gate externo).

Veredito parcial deste QA: tipos e testes unitários OK (tsc 0/0, vitest 90/90); build e E2E não executados por mim — não certificados.

## [2026-10-18 17:35] Ciclo
Ciclo T-016 + T-017 (Exportar do Estoque levando filtros -> Relatórios). QA de documentação: gate mecânico externo (qa_gate.py); aqui rodei e registrei apenas o verificável no ambiente: `npx tsc --noEmit` exit 0, `npx tsc -p e2e/tsconfig.json --noEmit` exit 0, `npx vitest run` exit 0 (8 arquivos, 90/90, 9,84 s), `npm run build` exit 0 (2303 módulos, PWA generateSW, 901 ms), `npx playwright test --list` exit 0 (171 testes/17 arquivos); `npm run lint` exit 1 (Missing script — script inexistente, não é erro de código); `npx playwright test` NÃO executado (depende de webServer + PGlite, fica no gate externo).

ACHADO FACTUAL (sem maquiar): a feature T-016/T-017 NÃO está no código. `src/pages/Estoque.tsx:187` tem `<Link to="/relatorios">` fixo (sem juntarFiltros, sem situacao=, sem aria-label); `src/pages/Relatorios.tsx` lê só de=/ate= + produtoId (sem FiltrosRecebidos/Limpar filtros/Vazio na Posição); `src/lib/relatorio.ts` com montarRelatorio de 6 parâmetros (sem filtroPosicao); `src/lib/relatorio.test.ts` com 3 it() (nenhum de filtro, confirmado com --reporter=verbose); painel-estoque.spec.ts com 6 casos Estoque e relatorios.spec.ts com 5 (nenhum de Exportar/filtros recebidos); `e2e/app/estoque-repor.spec.ts` inexistente. Suíte segue 90 (vitest) e 171 (Playwright) — igual a T-009. `memoria/estado.json` com plano_atual:null e ciclos:0.

DOCS ATUALIZADOS: `GUIA_DE_TESTES.md` reescrito — tabela de comandos com exit codes reais, §2.1 estado do código por leitura, §2.2 critérios de aceite de T-016/T-017 (1-5 e 7 NÃO CUMPRIDOS; 6 CUMPRIDO como baseline), §2.3 regressão, §2.4 dívida E2E com os 2 casos prontos para `painel-estoque.spec.ts`, 1 para `relatorios.spec.ts` e o arquivo novo `estoque-repor.spec.ts`, §2.5 contratos impostos (href exato '/relatorios', sem vazar filtro=, sem q= vazio, link com texto visível 'Exportar', aviso sem <table>/aria-live), §3.6 lacuna unitária de filtroPosicao, checklist de PR. `DOCUMENTACAO_ERP.md` atualizado — nova seção do item T-016+T-017 com o defeito do ponto de vista do operador, contrato de UI (o que muda e o que NÃO muda), aviso de que `@/` não é alias válido (tsconfig sem paths/vite sem resolve.alias), tabela de verificação, e regra para T-017: situacao=abaixo usa saldo consolidado do produto, nunca l.situacao do lote; status do repositório e backlog reordenado por prioridade real.

Nenhum arquivo de `src/` ou `e2e/` foi alterado por este QA.

## [2026-10-18 17:37] Ciclo
[2026-02-14] QA T-016 + T-017 — REPROVADO (feature ausente no código)

Comandos executados neste ambiente:
- npx tsc --noEmit → exit 0 (nenhum erro de tipo)
- npx tsc -p e2e/tsconfig.json --noEmit → exit 0 (specs + base.ts + vite.config.ts ok)
- npx vitest run → exit 0, 8 arquivos, 90/90 (9,84 s)
- npx vitest run src/lib/relatorio.test.ts --reporter=verbose → exit 0, 3/3 (nenhum it() de filtro)
- npm run build → exit 0, 2303 módulos, PWA generateSW, 1.018,63 KiB, 901 ms
- npx playwright test --list → exit 0, 171 testes / 17 arquivos
- npm run lint → exit 1: Missing script "lint" (script inexistente — não é erro de código)
- npx playwright test (execução) → não executado: depende do webServer + PGlite de e2e/preparar.ts; fica no gate externo

Achado factual (sem maquiar) — a feature NÃO está no código:
- src/pages/Estoque.tsx:187 → <Link to="/relatorios"> fixo (sem juntarFiltros, sem situacao=, sem aria-label)
- src/pages/Relatorios.tsx → lê só de/ate + produtoId; sem FiltrosRecebidos, sem "Limpar filtros", sem Vazio na Posição
- src/lib/relatorio.ts → montarRelatorio com 6 parâmetros (sem filtroPosicao)
- src/lib/relatorio.test.ts → 3 it(); painel-estoque.spec.ts → 6 casos Estoque; relatorios.spec.ts → 5 casos; e2e/app/estoque-repor.spec.ts → não existe. Suíte segue 90 testes / 17 arquivos

Backlog: NÃO alterado (ciclo reprovado).
VEREDITO: REPROVADO — feature de filtros/relatórios não implementada (Estoque.tsx:187 link fixo, Relatorios.tsx sem FiltrosRecebidos/Limpar filtros/Vazio, relatorio.ts sem filtroPosicao, estoque-repor.spec.ts inexistente).

## [2026-10-18 17:43] Ciclo
Ciclo T-021 (?produto= do Relatórios na URL) — ciclo de DOCUMENTAÇÃO (gate mecânico é o qa_gate.py). Comandos que EU rodei neste ambiente Node: npx tsc --noEmit exit 0; npx tsc -p e2e/tsconfig.json --noEmit exit 0; npx vitest run exit 0 (8 arquivos, 90/90, 9,90 s); npm run build exit 0 (2303 módulos, PWA generateSW, 11 precache, 1.018,63 KiB, 939 ms); npx playwright test --list exit 0 (171 testes / 17 arquivos). NÃO executei npx playwright test (depende de webServer + PGlite de e2e/preparar.ts) e registrei isso como não verificado; npm run lint não existe (Missing script). ACHADO FACTUAL: T-021 NÃO está no código — src/pages/Relatorios.tsx tem useState('') para produtoId, onChange={e => setProdutoId(e.target.value)} e refletirNaUrl(p,i) que só grava de/ate com new URLSearchParams (nada de produtoDaUrl/escolherProduto/limparProduto/Aviso/data-filtro); src/lib/periodos.ts termina em juntarFiltros (sem produtoDaUrl/paramsDoPeriodo); src/lib/estoque.ts sem filtrarRecorte (T-019); src/lib/relatorio.test.ts segue com 3 it() (nenhum de id inexistente); src/lib/regras.test.ts 27 it() sem asserção de produto em juntarFiltros; e2e/app/relatorios.spec.ts com 5 casos, nenhum de ?produto=/reload/limpar. Suíte total inalterada em 90 (vitest) e 171 (playwright) — igual a T-009/T-016, ou seja, a cobertura prometida no relatório do DEV (1 it() em relatorio.test.ts, 1 asserção em regras.test.ts, 3 casos E2E) NÃO está no disco. Docs atualizados: GUIA_DE_TESTES.md reescrito (tabela de comandos com exit reais, aviso da divergência entre relatório de entrega e disco, distribuição 90/171, §2.1 estado real de Relatorios.tsx/periodos.ts/estoque.ts/relatorio.test.ts, §2.2 critérios 1-4 NÃO CUMPRIDOS / 5 PARCIAL / 6 CUMPRIDO como baseline, §2.3 regressão, §2.4 dívida E2E com 3 specs prontos para colar em relatorios.spec.ts + o it() de id inexistente, §2.5 contratos congelados: label Produto, options Todos os produtos, sem aria-live no aviso, aria-label único 'Limpar filtro de produto', §3.6 lacuna unitária de T-021, checklist de PR) e DOCUMENTACAO_ERP.md (status verde 0/90-90/0, seção T-021 com o defeito do ponto de vista do operador — F5/link compartilhado volta para 'Todos os produtos' e o arquivo sai com o estoque inteiro —, contrato de UI e o que NÃO muda, tabela de verificação, ordem de dependência T-021 como pré-requisito de T-016, nova tabela de params da URL do Relatórios, backlog por prioridade com T-016/T-021 ainda abertos, nota de que estado.json tem plano_atual null e ciclos 0 divergindo do historico.md). Nenhum arquivo de src/ ou e2e/ alterado por este QA. Backlog NÃO alterado neste ciclo de documentação.

## [2026-10-18 17:46] Ciclo
[2026-10-18 17:52] Ciclo T-021 (reenvio, ?produto= do Relatórios na URL) — QA/DOCUMENTAÇÃO: repositório VERDE, feature AUSENTE

Comandos executados por MIM neste ambiente (fatos, não relato de DEV):

| Comando | Exit | Resultado |
|---|---|---|
| npx tsc --noEmit | 0 | sem erros de tipo em src/ |
| npx tsc -p e2e/tsconfig.json --noEmit | 0 | specs + base.ts + vite.config.ts ok |
| npx vitest run | 0 | 8 arquivos · 90/90 (10,63 s de parede) |
| npm run build | 0 | 2303 módulos · PWA generateSW · 11 precache · 1.018,59 KiB · 1,06 s |
| npx playwright test --list | 0 | 171 testes / 17 arquivos |
| npx playwright test (execução) | — | NÃO executado: depende do webServer + PGlite de e2e/preparar.ts; fica no gate externo |
| npm run lint | — | não existe (Missing script: "lint") — não é erro de código |

Distribuição (inalterada): regras 27 · relatorio 3 · exportar 6 · lista-compra 9 · lista-compra-paridade 4 · venda 13 · sincronizador 6 · supabase-local 22 = 90.

ACHADO FACTUAL (sem maquiar) — T-021 NÃO está no código e a cobertura prometida NÃO está no disco:
- src/pages/Relatorios.tsx → const [produtoId, setProdutoId] = useState(''); refletirNaUrl(p,i) só grava de/ate com new URLSearchParams + setParams({replace:true}); <select id="r-produto"> só tem onChange={e => setProdutoId(e.target.value)}. Não há leitura de ?produto=, produtoDaUrl, escolherProduto, limparProduto, Aviso de recorte nem data-filtro="produto".
- src/lib/periodos.ts → termina em juntarFiltros(); sem produtoDaUrl/paramsDoPeriodo.
- src/lib/estoque.ts → sem filtrarRecorte (T-019 também fora).
- src/lib/relatorio.test.ts → 3 it() (os de T-001); nenhum de id inexistente.
- src/lib/regras.test.ts → 27 it(); nenhuma asserção de produto: '' em juntarFiltros.
- e2e/app/relatorios.spec.ts → 5 casos; nenhum de ?produto=/reload/limpar. e2e/app/estoque-repor.spec.ts NÃO existe.
- memoria/estado.json → plano_atual null, ciclos 0 (divergente do historico.md).
Suíte total segue 90 (vitest) e 171 (Playwright) — idêntica a T-009/T-016.

Critérios de aceite de T-021: 1 NÃO CUMPRIDO, 2 NÃO CUMPRIDO, 3 NÃO CUMPRIDO, 4 NÃO CUMPRIDO, 5 PARCIAL (o teste de filtro por produto existe e passa; o de id inexistente não existe), 6 CUMPRIDO como baseline (tsc 0/0, vitest 90/90, build 0).

Docs atualizados via escrever_arquivo: GUIA_DE_TESTES.md (tabela de comandos com exits reais deste ciclo; aviso da divergência relatório-de-entrega × disco; distribuição 90/171; §2.1 estado real de Relatorios.tsx/periodos.ts/estoque.ts/relatorio.ts/relatorio.test.ts/regras.test.ts; §2.2 critérios 1-4 NÃO CUMPRIDOS / 5 PARCIAL / 6 CUMPRIDO; §2.3 regressão; §2.4 dívida E2E com 3 specs prontos para colar em relatorios.spec.ts + o it() de id inexistente; §2.5 contratos congelados — label Produto, options Todos os produtos, aviso sem <table>/aria-live, aria-label único 'Limpar filtro de produto', refletirNaUrl como único escritor de URL; §3.6 lacuna unitária; checklist de PR com os itens de T-021 desmarcados) e DOCUMENTACAO_ERP.md (status verde 0/90-90/0 com build 1,06 s; seção T-021 com o defeito do ponto de vista do operador — F5/link compartilhado volta para 'Todos os produtos' e o arquivo sai com o estoque inteiro —, contrato de UI e o que NÃO muda, tabela de verificação, ordem de dependência T-021 como pré-requisito de T-016, tabela de params da URL do Relatórios com estado real, backlog por prioridade com T-016/T-021 ainda abertos, nota de estado.json divergente).

Nenhum arquivo de src/ ou e2e/ foi alterado por este QA. Backlog NÃO alterado: T-021 não entregue (decisão idêntica ao gate mecânico e ao ciclo anterior).

VEREDITO: REPROVADO — T-021 não implementada: Relatorios.tsx mantém produtoId em useState('') e nunca escreve/lê ?produto= (refletirNaUrl só grava de/ate com new URLSearchParams à mão); não existem produtoDaUrl/paramsDoPeriodo em periodos.ts, filtrarRecorte em estoque.ts, caso de id inexistente em relatorio.test.ts, asserção de produto em regras.test.ts nem os 3 casos E2E em relatorios.spec.ts. Mecânica verde (tsc 0/0, vitest 90/90, build 0) — o bloqueio é de funcionalidade e cobertura, não de tipos.

## [2026-10-27 14:16] T-018 — exportação sem duplicação

Helper `exportarComToast` em `src/lib/relatorio.ts` centraliza import dinâmico, download, toast e estado "gerando". `Estoque` e `Relatórios` passaram a usá-lo; mensagens de erro/sucesso padronizadas. `nomeArquivoListaCompra` mudou para `lib/relatorio.ts` (reexportado por `lista-compra.ts`). Testes: tsc 0, vitest 105/105, build 0, Playwright relatórios 5/5 (workers=1).

## [2026-10-27 15:01] T-020, T-022 e D-001..D-006

- **T-020**: novo `e2e/app/estoque-repor.spec.ts` prova que chip "Repor", tabela e lista de compras
  usam a mesma contagem (2 produtos abaixo do mínimo), inclusive seleção/marcar todos.
- **T-022**: Relatórios mostra `Aviso` persistente e toast antes do download quando uma seção
  escolhida está vazia; o arquivo continua sendo gerado, agora sem surpresa.
- **D-001**: componente `Avatar` extraído e usado em Layout, Mais e Equipe (coroa do dono preservada).
- **D-002**: Painel usa `BadgeReposicao` no item "Repor", com mínimo/unidade no `title`.
- **D-003**: tokens `--color-marca`/`--color-marca-escura` no `@theme`; 85 usos de
  emerald-700/800 trocados por `marca`/`marca-escura` em 25 arquivos (visual idêntico).
- **D-004**: estados vazios do Painel usam `Vazio` (sem div/emoji).
- **D-005**: atalhos mobile do Painel usam o mesmo componente `Atalho`/cartão, com variante de destaque.
- **D-006**: botão "Corrigir" ganhou `aria-label="Corrigir lançamento"` além do `title`.

Testes: tsc src/e2e 0; vitest 105/105; build 0; Playwright app-computador (painel, equipe, histórico,
relatórios) 24 passed/1 skipped; novos specs T-020 e T-022 passam em app-computador e app-celular.

## [2026-10-27 20:30] Preparação para o piloto (T-029..T-033)

Implementados os seis itens escolhidos para o piloto controlado, sem alterar o escopo
de uma loja, PDV não fiscal e integrações fiscais/cobrança ainda em stub:

- **T-029 — Importação de catálogo e saldo inicial**: tela `Importar` em Produtos,
  parser CSV/XLSX com aliases e validação por linha (`src/lib/importacao.ts`), RPC
  `public.importar_catalogo` com subtransação por linha, categoria automática, códigos,
  ponto de pedido, lote/validade e entrada de saldo inicial auditável. Corrigida a
  persistência do estoque mínimo no cadastro.
- **T-030 — Operação do piloto**: `PILOTO.md` (checklist, importação, inventário,
  offline, backup, incidentes), `npm run piloto` (listar/status/cortesia/trial/ativa
  com service role), tabela `erros_cliente`, monitoramento silencioso, tela de erro
  amigável e diagnóstico copiável.
- **T-031 — Jurídico/LGPD**: `public/privacidade.html`, `public/termos.html`, links no
  login e em Mais, exportação JSON dos dados da empresa pelo dono em
  `src/lib/dados/lgpd.ts` e EmpresaConfig.
- **T-032 — Volume/performance**: paginação de 50 produtos na lista, helper puro
  `paginar`, componente `Paginacao` e paginação das linhas de lote no inventário.
- **T-033 — Qualidade/CI**: testes unitários de importação e paginação, casos SQL de
  importação e monitoramento, E2E de importação, inventário por lote e LGPD; Playwright
  com retries/timeout maior e workflow separado em qualidade (Linux) e E2E
  (Windows/Edge), com artefato de relatório em falha.
- **Inventário por lote (T-024)**: contagem cega por lote, rascunho por aparelho,
  busca/paginação, criação de lote para produto sem lote e ajuste no lote contado —
  não mais no primeiro lote com saldo.

Verificação desta rodada: `npm run lint` 0; `npm test` 117/117; `npm run test:sql`
238/238; `npm run build` 0; Playwright direcionado com `--workers=1`: importação,
inventário por lote e LGPD 12/12 (computador e celular); produtos e estoque/repor
18/18 (computador e celular). O E2E completo continua sendo executado no CI com
retries; a suíte local inteira ainda não foi declarada estável com workers padrão.

Backlog reconciliado em `memoria/estado.json`: T-016/T-017/T-019/T-021/T-023/T-024/
T-025/T-026/T-027 e T-029..T-033 concluídos; permanecem abertos **T-028** (piloto em
loja real + restauração de produção) e **T-034** (integrações reais de NFC-e/Asaas).
