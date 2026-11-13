# Plano T-036 — Custo no cadastro do produto + faturamento bruto e lucro automáticos

Pedido do usuário (verbatim): "quando cadastrar um produto também colocar o valor de custo dele e de maneira automática, aparecer a informações de faturamento bruto e o lucro que estar having" ("...o lucro que está tendo").
Registrado por: Arquiteto, a pedido do agente Teste (2026-11-12). Branch `saas`, HEAD `26ed1fc`.

## O que já existe (verificado no código — premissa do Teste corrigida)

- `produtos.custo_ultimo` **já existe** (`supabase/migrations/20261008120000_base_multiempresa.sql:279`, grant de update na linha 843). A tabela de produtos TEM coluna de custo.
- O RPC `salvar_produto` já persiste `custo_ultimo` no insert e no update (`20261010130000_cadastro_para_pdv.sql:16-37`) — o campo só não chega lá porque `ProdutoDados` não o inclui (`src/lib/tipos.ts:144-168`).
- `registrar_entrada` com `p_custo` atualiza `custo_ultimo` na mesma transação (`20261106120000_transferencias_custo_entrada.sql:67-70`).
- `Produto.custo_ultimo` já está no tipo TS (`tipos.ts:119`), no select do `catalogo.ts` e é exibido em `ProdutoDetalhe.tsx:101` ("Último custo de entrada").
- `vendas.total` e `vendas_itens` (produto_id, quantidade, preco_unitario, total, lote_id) existem (`20261010120000_pdv.sql:151-205`), mas o item **não guarda o custo no momento da venda** — sem isso, lucro histórico mudaria toda vez que o custo mudasse.

## Decisões de escopo (justificadas)

1. **Custo do produto: usar `produtos.custo_ultimo` existente — sem migration para o cadastro.** A alternativa "custo derivado do último lote" foi descartada: custo por lote não é bem definido (um lote pode ter várias ENTRADAs com custos diferentes; `transferir_estoque` não copia custo). A semântica atual ("último custo de entrada") é simples e já auditável.
2. **Snapshot do custo no item da venda: nova migration** adiciona `vendas_itens.custo_unitario`, preenchido por trigger `BEFORE INSERT` a partir de `produtos.custo_ultimo`. Justificativas: lucro histórico imutável e auditável; evita recriar a função gigante de eventos do PDV (`20261010120000_pdv.sql` ~460-593); o payload offline do PDV não muda (preenchimento 100% server-side). Item avulso (`produto_id` null) e produto sem custo ficam `null`.
3. **Onde aparece o resultado (o "de maneira automática" do pedido):**
   - **Painel** — card "Resultado de hoje": faturamento bruto, lucro bruto e margem do dia (superfície automática, sempre visível).
   - **Relatórios** — nova aba "Resultado": KPIs do período + tabela por produto (faturamento, CMV, lucro, margem), com export Excel/PDF.
4. **Definições de cálculo:**
   - Faturamento bruto = Σ `vendas.total` das vendas **concluídas** no período (canceladas excluídas; contagem de canceladas informativa).
   - CMV = Σ `vendas_itens.quantidade × custo_unitario` (snapshot).
   - Lucro bruto = faturamento − CMV; margem = lucro / faturamento.
   - Itens com custo `null` não entram no CMV e geram aviso "itens sem custo cadastrado" (o lucro fica superestimado nesses casos — o aviso deixa claro).
5. **Sem backfill**: vendas antigas continuam com custo `null` (cobertas pelo aviso). Preencher com o custo atual distorceria o histórico.

## Suposições de produto (só o usuário confirmaria; não bloqueiam)

- **Lucro global ou por produto?** → Ambos: KPI global no Painel/Relatórios + tabela por produto na aba Resultado.
- **Custo editável depois?** → Sim, campo editável no formulário (o RPC já grava); uma entrada com custo sobrescreve (semântica "último custo" mantida).
- **"Lucro" = bruto** (antes de impostos e despesas). IBS/CBS, taxas de cartão e lucro líquido ficam para a fase fiscal (T-034).
- Alternativa se o usuário quiser exatamente custo por lote/FEFO: guardá-lo na movimentação de ENTRADA e ratear na baixa — esforço M/L, só se pedido.

## Passos (ordem, pequenos)

### Passo 1 — Migration + prova SQL
- Novo `supabase/migrations/20261112120000_custo_lucro.sql`:
  - `alter table public.vendas_itens add column custo_unitario numeric(14,4) check (custo_unitario is null or custo_unitario >= 0);`
  - `create function public.preencher_custo_venda_item()` … trigger `BEFORE INSERT ON public.vendas_itens`: se `new.produto_id is null` retorna; senão `select custo_ultimo` do produto e `new.custo_unitario := coalesce(new.custo_unitario, v_custo)`. `security definer`, `set search_path = ''` (padrão do repo). Sem backfill (comentário explicando).
  - Sem grant novo: SELECT em `vendas_itens` é policy tabela-inteira (`vendas_itens_leitura`, pdv.sql:832-833).
- Prova em PGlite via `scripts/testar-sql.mjs` (mesmo padrão do caso `custo_ultimo`, linha 202): (a) venda de produto com custo grava item com custo; (b) produto sem custo grava `null`; (c) item avulso sem `produto_id` não quebra.
- Aplicação na nuvem: pelo Teste (MCP Supabase de produção) após o push.

### Passo 2 — Tipos
- `src/lib/tipos.ts`: `ProdutoDados` ganha `'custo_ultimo'`.
- `src/lib/dados/vendas.ts`: `ItemVenda` ganha `custo_unitario: number | null`; `detalheDaVenda` passa a selecionar a coluna.

### Passo 3 — Campo Custo no formulário
- `src/components/ProdutoForm.tsx`: estado `custoTxt` (helper `texto()` com vírgula), campo "Custo (R$)" ao lado do "Preço de venda (R$)", `inputMode="decimal"`, validação `lerNumero(...) >= 0` (erro "Custo inválido."), dica: "Atualizado sozinho quando você lança uma entrada com custo."
- Persistência já coberta pelo RPC `salvar_produto` (gate dono/gerente existente).

### Passo 4 — Helper puro de resultado + testes unitários
- Novo `src/lib/resultado.ts`: `montarResultado(vendas, itens)` → `{ faturamentoBruto, cmv, lucro, margem, canceladas, valorSemCusto, porProduto[] }`, aritmética em centavos (padrão `centavos()` do Painel).
- Novo `src/lib/resultado.test.ts`: concluída soma / cancelada excluída; CMV = qtd × custo snapshot; item sem custo fora do CMV e contabilizado no aviso; margem com faturamento 0; dois itens do mesmo produto agregam na tabela por produto.

### Passo 5 — Camada de dados
- `src/lib/dados/vendas.ts`: `itensDasVendas(vendaIds)` no padrão de `pagamentosDasVendas` (blocos de 150, `in('venda_id')`), selecionando `venda_id, produto_id, descricao, quantidade, unidade, preco_unitario, total, custo_unitario`.

### Passo 6 — Painel: card "Resultado de hoje"
- `src/pages/Painel.tsx`: já busca as vendas da semana (`listarVendas`); buscar `itensDasVendas` das concluídas de hoje e montar o card com Faturamento bruto, Lucro bruto e Margem. Falha silenciosa no mesmo padrão de `setFalhaVendas`.

### Passo 7 — Relatórios: aba "Resultado" + export
- `src/pages/Relatorios.tsx`: nova aba `'resultado'` (rotulada "Resultado"; se 5 abas estourarem os 320 px do `Segmentado`, rótulo "Lucro" — Designer confere), KPIs (Faturamento bruto, CMV, Lucro, Margem), aviso quando houver itens sem custo, tabela por produto com paginação `POR_PAGINA`. Buscar vendas + itens do período no mesmo `useEffect` das movimentações.
- `src/lib/exportar/excel.ts` e `pdf.ts`: nova seção `'resultado'` em `Secoes` + planilha/página "Resultado" (KPIs + tabela por produto, usando `montarCabecalho`/`cabecalhoRelatorio`).
- Atualizar `OPCOES_ABA`, `SECOES` e `contagensSecoes` (Regra 3 do E2E).

### Passo 8 — E2E novo + regressão
- Novo `e2e/app/resultado.spec.ts` (seeding padrão do apoio, `servidor.comoUsuario`):
  1. Cadastrar produto com Custo R$ 10,00 e Preço R$ 20,00 → vender 2 un no PDV → Painel mostra Faturamento R$ 40,00 e Lucro R$ 20,00.
  2. Relatórios no período com a venda: aba Resultado mostra os KPIs e a linha do produto.
  3. Produto sem custo: venda aparece com o aviso de itens sem custo.
  4. Venda cancelada não entra no faturamento.
  5. Download do Excel contém a seção Resultado (`page.on('download')`).
- Regressão (Regra 1 do E2E): `e2e/app/produtos.spec.ts` (novo campo), `e2e/app/relatorios.spec.ts` (5ª aba + seção), `e2e/app/painel-estoque.spec.ts` (novo card), `e2e/app/pdv.spec.ts` (payload não muda — só conferir).

### Passo 9 — Checks finais
`npm run lint` · `npm test` · `npm run test:sql` · `npx playwright test e2e/app/resultado.spec.ts` + os quatro de regressão.

## Arquivos

- **Mudam**: `src/components/ProdutoForm.tsx`, `src/lib/tipos.ts`, `src/lib/dados/vendas.ts`, `src/pages/Painel.tsx`, `src/pages/Relatorios.tsx`, `src/lib/exportar/excel.ts`, `src/lib/exportar/pdf.ts`, `scripts/testar-sql.mjs`
- **Novos**: `supabase/migrations/20261112120000_custo_lucro.sql`, `src/lib/resultado.ts`, `src/lib/resultado.test.ts`, `e2e/app/resultado.spec.ts`

## Fora do escopo (follow-ups naturais)

- Custo na importação de catálogo (`LinhaImportacao` / RPC `importar_catalogo`).
- CMV por lote/FEFO real, impostos (IBS/CBS), lucro líquido, relatório fiscal — fase fiscal (T-034).
- Edição rápida de custo na lista de produtos (além do formulário).

## Critérios de aceite (verificáveis pelo QA)

1. Produto com Custo R$ 10,00 e Preço R$ 20,00; venda de 2 un no PDV; **Painel** "Resultado de hoje" mostra Faturamento R$ 40,00, Lucro R$ 20,00, margem 50% (`e2e/app/resultado.spec.ts` cenário 1).
2. **Relatórios** no período da venda: aba Resultado com os mesmos KPIs + linha do produto; Excel e PDF exportados incluem a seção Resultado (cenários 2 e 5).
3. Produto sem custo: venda aparece com aviso de itens sem custo e o CMV dele não entra no lucro (cenário 3).
4. Venda cancelada fora do faturamento (cenário 4).
5. `npm run lint`, `npm test`, `npm run test:sql` e o E2E novo verdes; `produtos.spec.ts`, `relatorios.spec.ts`, `painel-estoque.spec.ts` e `pdv.spec.ts` sem regressão.
