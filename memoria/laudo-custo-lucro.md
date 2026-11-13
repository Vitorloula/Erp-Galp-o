# Laudo de QA — T-036 (Custo no cadastro do produto + faturamento bruto / lucro)

**Data:** 12/11/2026 (noite) · **Reexecução focada:** 13/11/2026 (fechamento do D-1)
**Item:** T-036 (`memoria/plano-custo-lucro.md`, `memoria/spec-custo-lucro.md`)
**Branch:** `saas` · **HEAD:** `26ed1fc` + alterações **não commitadas** do ciclo (17 arquivos de código, 1 migration nova, 4 docs de memória; nada em `docs/`)
**Verificado por:** QA (validação independente — **nenhum gate foi aceito como alegação**; tudo foi rodado por mim)

**Veredito final: APROVADO — sem defeito aberto.**
O D-1 (separador decimal da margem) foi **corrigido e confirmado por execução própria**: a margem
com casa decimal agora sai com **vírgula** no Painel, nos Relatórios, no Excel e no PDF. A feature
cumpre os 5 critérios de aceitação do plano e da spec, e as três "diferenças prováveis" contra a
matriz de perfis foram checadas uma a uma: **nenhuma é defeito**.

**Nenhum código de produção foi alterado.** Sem commit. `src/`, `supabase/` e `e2e/` intactos
por mim (verificado com `git status` no fim).

---

## 0. Resumo

| Item | Situação | Como confirmei |
|---|---|---|
| Critérios 1–5 do plano/spec | **OK** | E2E novo `resultado.spec.ts` verde (5 cenários × 2 viewports) + conferência manual do Excel e do PDF baixados |
| Snapshot do custo no item da venda | **OK** | PGlite: venda grava `custo_unitario` = `custo_ultimo` do momento; mudar o custo depois **não** altera o item antigo |
| Discrepância (1) — "estoquista não cadastra produto" | **NÃO é defeito** | `produtos_cadastro`/`produtos_edicao` (RLS) já permitem `estoquista`; na interface o estoquista **salva produto com custo** (R$ 10,00 no detalhe) — a premissa do Programador estava errada |
| Discrepância (2) — "caixa vê lucro/margem" | **Comportamento real registrado** (decisão do dono) | o caixa vê faturamento, CMV, lucro e margem no card do Painel **e** na aba Lucro de Relatórios, e pode exportar a seção |
| Discrepância (3) — "gerente sem os dados da empresa" | **Confirmado e bloqueado como deve** | o gerente **vê** os dados da empresa, mas em modo somente leitura (campos desabilitados, sem "Salvar dados", sem "Editar loja"); no banco o `UPDATE` afeta **0 linhas** |
| **D-1** (baixa) — margem com decimal usa ponto | **FECHADO** (reexecução de 13/11/2026) | os **5 pontos** agora usam `formatarNumero`; caso real (preço 30, custo 10 → 66,7%): Painel, Relatórios, Excel (KPI e linha do produto) e PDF mostram **"66,7%"** e **nenhum** "66.7%" |
| Migration na nuvem | **NÃO APLICADA** | validação só em PGlite (como o Programador registrou); a aplicação no Supabase hospedado segue pendente de aprovação |

---

## 1. Gates — execução própria (12/11/2026)

| Gate | Comando | Exit | Resultado |
|---|---|---|---|
| Tipos | `npm run lint` | 0 | sem erros |
| Unitário | `npm test` (Vitest) | 0 | **124/124** em 13 arquivos (era 117/117) |
| Banco/RLS | `npm run test:sql` (PGlite) | 0 | **265/265** verificações, 0 falhas (era 261/261) |
| Build | `npm run build` | 0 | `tsc` + Vite + PWA |
| Tipos E2E | `npx tsc -p e2e` | 0 | specs e helpers |
| E2E | `npx playwright test e2e/app/resultado.spec.ts e2e/app/produtos.spec.ts e2e/app/relatorios.spec.ts e2e/app/painel-estoque.spec.ts e2e/app/pdv.spec.ts --workers=1` | 0 | **66 passaram, 2 pulados, 0 falharam** (33 por projeto × computador e celular; os 2 pulados são o teste de saída já pulado no celular) |

Os números conferem com as alegações do Programador (124, 265). Rodada **única**, sem rodadas
paralelas na mesma pasta `test-results/`.

### O que os gates **não** cobriam (eu cobri fora da suíte)

O `test:sql` do ciclo tem **3 asserções novas** (`custo: vendas com e sem custo aplicadas`,
`custo: item guarda o último custo do produto (snapshot)`, `custo: produto sem custo fica null no item`).
Faltavam as provas (b)–(f) e a matriz de papéis, que rodei num script temporário próprio (§2 e §3).

---

## 2. Provas no banco (PGlite, script temporário próprio)

Script temporário em `scripts/_qa-provas-custo-lucro.mjs` (**removido no fim**), com todas as
migrations aplicadas, duas empresas e os 4 papéis. **32 verificações, 0 falhas.**

| Prova | Resultado |
|---|---|
| (a) venda de produto com custo grava `vendas_itens.custo_unitario` = `custo_ultimo` **do momento da venda** | **OK** — `12.3456` gravado pelo caixa, via `pdv_sincronizar` (caminho real do PDV) |
| (b) mudar `custo_ultimo` depois **não** altera o item antigo (snapshot auditável) | **OK** — item continua `12.3456` depois de o custo ir a `99`; a venda seguinte pega `99` |
| (c) produto sem custo → item com custo `null`, fora do CMV | **OK** — `custo_unitario` nulo; o aviso "Itens sem custo cadastrado" aparece na tela (§4) |
| (d) item avulso: `vendas_itens.produto_id` é **NOT NULL** no schema (desvio registrado pelo Programador) | **Confirmado** — `is_nullable = NO`. Removendo o NOT NULL no banco de teste, o item avulso **não quebra**: o trigger devolve a linha e o custo fica `null` (ramo defensivo vivo) |
| (e) trigger `SECURITY DEFINER` com `set search_path = ''` | **OK** — `prosecdef = true`, `proconfig = {search_path=''}`; **anon não executa** a função (`revoke` confere); **`authenticated` não tem `INSERT` em `vendas_itens`** → o caixa não forja custo; item com produto de outra empresa é recusado e o trigger **não** lê o custo alheio (filtro por `empresa_id`) |
| (f) RLS multiempresa | **OK** — outra empresa lê **0** itens e **0** vendas; quem não é da empresa, idem |

### Gate de papel do `salvar_produto` (a "discrepância 1" do pedido)

| Papel | Cadastra produto com custo | Edita o custo | Lê custo dos itens |
|---|---|---|---|
| Dono | sim | sim | sim |
| Gerente | sim | sim | sim |
| **Estoquista** | **sim** | **sim** | sim |
| Caixa | **não** (RLS: `new row violates row-level security policy for table "produtos"`) | não | sim |

O `salvar_produto` é `security invoker` (`supabase/migrations/20261010130000_cadastro_para_pdv.sql:6`)
e quem limita é a RLS: `produtos_cadastro`/`produtos_edicao` já incluem `estoquista`
(`supabase/migrations/20261008120000_base_multiempresa.sql:869-873`). A coluna `custo_ultimo`
está no `grant update` de `produtos` (linha 843) e no `insert` de tabela — **não há gate
dono/gerente**. A alegação do Programador (e a premissa do pedido) está **errada**: o
estoquista já cadastra produtos com custo.

---

## 3. Matriz de perfis (interface) — cada perfil sozinho, computador **e** celular

Fonte da verdade: o dono do produto. Testado com E2E temporário (`e2e/app/_qa-perfis-t036.spec.ts`,
**removido no fim**): 4 perfis × 2 viewports + 1 caso de venda do caixa = **10/10 verdes**.

| Tela / ação | Dono | Gerente | Estoquista | Caixa |
|---|---|---|---|---|
| Menu: PDV | ✓ | ✓ | — | ✓ |
| Menu: Movimentar, Inventário | ✓ | ✓ | ✓ | — |
| Menu: Divergências | ✓ | ✓ | — | — |
| Menu: Equipe (convidar) | ✓ | ✓ | — | — |
| Menu: Relatórios, Produtos, Estoque, Histórico, Empresa | ✓ | ✓ | ✓ | ✓ |
| **Painel: card "Resultado de hoje"** | ✓ | ✓ | ✓ | **✓** |
| **Relatórios: aba "Lucro" (título "Resultado")** | ✓ | ✓ | ✓ | **✓** |
| **Relatórios: seção de exportação "Resultado"** (marcada por padrão) | ✓ | ✓ | ✓ | **✓** |
| Produtos: botão "Novo produto" | ✓ | ✓ | ✓ | — |
| **Produtos: campo "Custo (R$)" no formulário** | ✓ | ✓ | ✓ | — (sem formulário) |
| **Produtos: salva produto com custo (R$ 10,00 no detalhe)** | ✓ | ✓ | **✓** | — |
| Produtos: "Editar" no detalhe | ✓ | ✓ | ✓ | — |
| Produtos: "Último custo de entrada" (leitura) | ✓ | ✓ | ✓ | ✓ |
| Empresa: "Salvar dados" | ✓ | — | — | — |
| Empresa: editar loja ("Editar Galpão principal") | ✓ | — | — | — |
| Empresa: editar o caixa ("Editar Caixa 01") | ✓ | ✓ | — | — |
| Empresa: campo "Nome" | editável | desabilitado | desabilitado | desabilitado |

**Comportamento real registrado (para o dono decidir):**

- **Caixa** vende 2 un de um produto com custo 10 (preço 20) e 1 un de um produto **sem** custo
  (preço 20) e, na aba Lucro, **vê**: Faturamento bruto **R$ 60,00**, CMV **R$ 20,00**, Lucro
  **R$ 40,00**, Margem **66,7%**, o aviso "Itens sem custo cadastrado neste período — R$ 20,00 não
  entram no lucro…", a tabela por produto (50% na linha com custo, 100% na sem custo) e a seção
  "Resultado" marcada para exportar. O mesmo card aparece no Painel do caixa.
  → **Nada no código limita o caixa a ver lucro/margem.** A tela de Relatórios é liberada ao caixa
  pela matriz ("consulta … relatórios"), e o Profit não é filtrado por papel.
- **Gerente**: vê os dados da empresa, mas **não edita** (campo desabilitado, sem "Salvar dados",
  sem "Editar loja"). No banco, `UPDATE public.empresas`/`public.lojas` como gerente afeta
  **0 linhas**; criar loja → negado; ele **pode** convidar para a equipe, editar categorias,
  gerenciar caixas e corrigir lotes.
- **Estoquista**: cadastra e edita produtos **com custo** (não é bloqueado em lugar nenhum) e não
  vê Equipe/Divergências.

---

## 4. Defeitos

### D-1 (baixa) — margem com casa decimal sai com ponto em 3 telas — **FECHADO**

**Status: FECHADO em 13/11/2026 (reexecução focada).** Correção do Programador conferida no
código e **reexecutada por mim** (case real na interface e nos exports).

**Onde era** (linhas da 1ª rodada) e **como está agora**:

| Arquivo:linha | Antes | Agora |
|---|---|---|
| `src/pages/Painel.tsx:284` | `` `${resultadoHoje?.margem ?? 0}%` `` | `` `${formatarNumero(resultadoHoje?.margem ?? 0)}%` `` |
| `src/lib/exportar/excel.ts:214` | `` `${res.margem}%` `` | `` `${formatarNumero(res.margem)}%` `` |
| `src/lib/exportar/excel.ts:228` | `` `${p.margem}%` `` | `` `${formatarNumero(p.margem)}%` `` |
| `src/lib/exportar/pdf.ts:170` | `` `Margem: ${res.margem}%` `` | `` `Margem: ${formatarNumero(res.margem)}%` `` |
| `src/lib/exportar/pdf.ts:182` | `` `${p.margem}%` `` | `` `${formatarNumero(p.margem)}%` `` |

Varri `src/` inteiro: **não resta nenhuma interpolação de margem sem `formatarNumero`** (a tela de
Relatórios já usava `formatarNumero` em `src/pages/Relatorios.tsx:536` e na coluna da tabela).

**Evidência da reexecução** (caso real: 1 un, preço 30, custo 10 → margem 66,666…%):

| Onde | Antes | **Agora** |
|---|---|---|
| Painel (card "Resultado de hoje") | `Margem 66.7%` | **`Margem 66,7%`** |
| Relatórios (aba Lucro) | `Margem 66,7%` | **`Margem 66,7%`** |
| Excel — KPI da planilha "Resultado" | `Margem \| 66.7%` | **`Margem \| 66,7%`** |
| Excel — linha do produto (coluna "Margem") | `66.7%` | **`66,7%`** |
| PDF (seção "Resultado") | `Margem: 66.7%` | **`Margem: 66,7%`** |

Busca no PDF baixado: contém `"66,7%"` = **true** e contém `"66.7%"` = **false**.

**Gates da reexecução focada (13/11/2026, execução própria):**

| Gate | Exit | Resultado |
|---|---|---|
| `npm run lint` | 0 | sem erros |
| `npm test` | 0 | **124/124** em 13 arquivos |
| `npm run test:sql` | 0 | **265/265** verificações |
| `npm run build` | 0 | `tsc` + Vite + PWA |
| `npx tsc -p e2e` | 0 | specs e helpers (a 1ª execução acusou 2 erros **do meu próprio spec temporário**, corrigido e reexecutado: 0) |
| `npx playwright test e2e/app/resultado.spec.ts e2e/app/relatorios.spec.ts e2e/app/painel-estoque.spec.ts --workers=1` | 0 | **38 passaram, 2 pulados, 0 falharam** (20 por projeto × computador e celular; os 2 pulados são o teste de saída já pulado no celular) |

Rodada única, sem concorrência na pasta `test-results/`. O caso da margem com decimal **não é
coberto pelo spec do repo** (os cenários usam margem 50%, um inteiro, que não evidencia o problema):
testei por script temporário próprio (`e2e/app/_qa-d1-margem.spec.ts`, **removido no fim**).

**Defeitos abertos: nenhum.**

---

## 5. Observações (não bloqueiam o ciclo)

- **O-1** — **Excel com tipos mistos**: no bloco de KPIs os valores são texto (`R$ 30,00`) e na
  tabela por produto são número com `numFmt 'R$ #,##0.00'`. Quem quiser somar as colunas no Excel
  precisa tratar as duas áreas de formas diferentes. Sugestão: gravar os KPIs também como número.
- **O-2** — o estado de erro **da aba Resultado** ("Não foi possível carregar o resultado. Tente
  novamente.") é praticamente inalcançável: com a rede cortada, a consulta de movimentações falha
  primeiro e a tela inteira mostra o erro global, sem renderizar as abas. O aviso existe no código
  (`src/pages/Relatorios.tsx`) e só apareceria se a consulta de vendas falhasse sozinha.
- **O-3** — o `Painel` busca os itens de **todas as vendas concluídas da semana** só para filtrar
  as de hoje (`src/pages/Painel.tsx:92-104`); em uma loja com muito movimento isso carrega mais do
  que o necessário.
- **O-4** — **rolem horizontal de 7 px a 320 px** na tela de Relatórios: **não vem deste ciclo**.
  Quem estoura é o botão redondo de "Movimentar" da barra inferior (`span.grid.size-7`), não o
  Segmentado de 5 abas (as 5 cabem: 53 px cada) nem a tabela nova (`overflow-x-auto`).
  A 390 px (largura oficial do app) **não há rolagem** em nenhuma tela nova.
- **O-5** — `vendas_itens.produto_id` é **NOT NULL** no schema, então "Item avulso" (que a spec
  prevê em `montarResultado`) **não pode existir** hoje: o desvio já registrado pelo Programador.
  O ramo defensivo do trigger existe e funciona (§2, prova d), mas a linha "Item avulso" da tabela
  só aparecerá se o schema mudar.

---

## 6. Desvios e o que **não** foi verificado

- **Migration `20261112120000_custo_lucro.sql` não aplicada no Supabase hospedado** — tudo aqui é
  PGlite. A aplicar só depois da aprovação (como o Programador propôs).
- **Nenhum commit.** Árvore de trabalho exatamente como recebi ( conferido com `git status`).
- **Arquivos temporários que escrevi e removi** (a tarefa foi somente de leitura/verificação):
  - `scripts/_qa-provas-custo-lucro.mjs` (provas de banco) — **removido**;
  - `e2e/app/_qa-perfis-t036.spec.ts` (matriz de perfis, Excel e PDF, layout) — **removido**;
  - `e2e/app/_qa-erros-t036.spec.ts` (estados de erro) — **removido**;
  - `e2e/app/_qa-d1-margem.spec.ts` (reexecução focada do D-1, margem com decimal) — **removido**;
  - pasta `test-results/` do Playwright — **removida**.
- **Não verificado**: emissão real (fora do escopo), Supabase hospedado, leitor de tela real,
  `DOCUMENTACAO_ERP.md` (ver §7).
- **Fora do escopo do pedido (não mexi)**: `DOCUMENTACAO_ERP.md` não foi atualizada — a feature é
  relevante ao usuário final (campo de custo e tela de lucro), então a entrada de produto continua
  pendente para quem tenha a escrita desse arquivo.

---

## 7. Critérios de aceitação (plano e spec)

| # | Critério | Resultado |
|---|---|---|
| 1 | Custo 10 + preço 20, venda de 2 un → Painel com R$ 40,00 / R$ 20,00 / 50% | **OK** (`resultado.spec.ts` c1) |
| 2 | Relatórios no período: mesmos KPIs + linha do produto; Excel e PDF com a seção Resultado | **OK** (c2 e c5; conferi o conteúdo das planilhas e do PDF baixados) |
| 3 | Produto sem custo: aviso exibido e fora do CMV | **OK** (c3; aviso exato da spec) |
| 4 | Venda cancelada fora do faturamento | **OK** (c4) |
| 5 | Gates verdes + `resultado.spec.ts` verde + regressão sem quebra | **OK** (124/124, 265/265, 66 E2E verdes) |

**Acessibilidade e layout conferidos:** rótulo e `aria-describedby` do campo "Custo (R$)";
erro "Custo inválido." com o foco voltando para o campo (coberto por `produtos.spec.ts`);
tabela nova dentro de `overflow-x-auto`, **sem rolagem horizontal** a 1366 px, 390 px e 320 px;
campo "Custo (R$)" mede 160×46 px a 390 px (alvo ≥ 44 px); rótulo curto "Lucro" no Segmentado
cabe nas 5 abas a 320 px; card do Painel com `aria-label="Resultado de hoje"` (região para leitor
de tela); aviso de erro do Painel sem rede → "Não foi possível atualizar" com os valores em "—".
