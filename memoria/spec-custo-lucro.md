# Spec de UI — T-036: Custo no cadastro do produto + faturamento bruto e lucro automáticos

**Item:** T-036 (`plano_atual` em `memoria/estado.json`) · **Branch:** `saas`, HEAD `26ed1fc` · **Fonte de conteúdo:** `memoria/plano-custo-lucro.md` (o plano define o conteúdo; esta spec define a forma).  
**Entregável:** especificação de UI, estados, a11y e `.spec.ts` afetados. **Não implementar em `src/` e não tocar no Doop.**  
**Regras:** `agents/regras_projeto.md` + `agents/openbot/02-designer.md` (Designer do ERP Galpão).

---

## Padrão visual (reutilizar componentes existentes, não criar novos)

Componentes de `src/components/ui.tsx`: `.btn`, `.campo`, `.cartao`, `Kpi`, `Segmentado`, `Aviso`, `Vazio`, `Carregando`, `Modal`, `Cabecalho`, `Badge*`. Ícones: `lucide-react`.  
Mobile-first (`sm`/`md`/`lg`), **sem rolagem horizontal em 390 px**, alvo de toque ≥ 44 px, safe-area `pb-seguro`, foco visível (`focus-visible` do design system), contraste WCAG AA, ícones nunca sozinhos (sempre com rótulo/`aria-label`). Textos exatos em **pt-BR**. Textos e rótulos existentes (4 abas atuais, seções de exportação existentes) **não são alterados**.

---

## 1. ProdutoForm — campo "Custo (R$)" (`src/components/ProdutoForm.tsx`)

**Posição:** mesma linha do "Preço de venda (R$)" — `grid grid-cols-2 gap-3` com Preço à esquerda e Custo à direita. "Conteúdo por embalagem" segue em linha própria abaixo (largura total). Em 390 px os dois inputs ficam lado a lado, sem rolagem horizontal.

**Campo:**
- `<label className="rotulo" htmlFor="p-custo">Custo (R$)</label>`
- `<input id="p-custo" className="campo" inputMode="decimal" value={custoTxt} onChange={…} placeholder="Opcional" aria-describedby="p-custo-dica" />`
- Dica: `<p id="p-custo-dica" className="text-xs text-slate-500">Atualizado sozinho quando você lança uma entrada com custo.</p>`

**Estados e validação:**
- **Vazio:** input vazio, placeholder "Opcional", sem aviso.
- **Preenchido:** exibe com vírgula (helper `texto()`, ex.: `10,00`); mapeado para `dados.custo_ultimo` e enviado ao `salvar_produto` (gate dono/gerente já existe — só falta incluir o campo em `ProdutoDados`).
- **Erro:** ao salvar, se `custoTxt` preenchido e `lerNumero(...)` for `null` ou `< 0` → `setErro("Custo inválido.")` no `Aviso tom="erro"` existente no topo do formulário; bloqueia o salvamento; o foco volta ao `p-custo`.
- **Edição:** carrega `produto.custo_ultimo` no estado inicial do formulário.

**Tipos afetados:** `ProdutoDados` ganha `'custo_ultimo'`. `ItemVenda` (`src/lib/dados/vendas.ts`) ganha `custo_unitario: number | null`; `detalheDaVenda` seleciona a coluna.

---

## 2. Painel — card "Resultado de hoje" (`src/pages/Painel.tsx`)

**Posição:** nova seção logo abaixo da faixa "Vendas hoje", visível em mobile e desktop.

**Estrutura:** `.cartao` com `aria-label="Resultado de hoje"`; `<h2 className="text-sm font-semibold text-ponto">Resultado de hoje</h2>` + 3 `Kpi` em `grid grid-cols-1 gap-3 sm:grid-cols-3`:
- **Faturamento bruto** — `icone={Banknote}`, tom `neutro`
- **Lucro bruto** — `icone={TrendingUp}`, tom `verde`
- **Margem** — `icone={Percent}` (`lucide-react`), tom `verde`

**Dados:** vendas concluídas de hoje (filtro existente `vendasSemana` + `hojeISO`) → `itensDasVendas(ids)` → `montarResultado()`.

**Estados e mensagens (pt-BR):**
- Carregando (vendas ainda não vieram): valores `—`, detalhe "Atualizando…" — herda o `Carregando` da página.
- Sem venda hoje concluída: `R$ 0,00` / `R$ 0,00` / `0%`, detalhe "Sem vendas concluídas hoje".
- Falha silenciosa (rede/servidor): valores `—`, detalhe "Não foi possível atualizar" — padrão `setFalhaVendas` já usado pelas KPIs de venda; não exibe banner adicional.
- Preenchido: valores formatados (`formatarReais`) + detalhe "{n} vendas finalizadas hoje".

Margem = lucro / faturamento; com faturamento 0 → 0%.

---

## 3. Relatorios — aba "Resultado" (`src/pages/Relatorios.tsx`)

**Segmentado:** 5ª opção. Rótulo no Segmentado: **"Lucro"** (decisão de design: 5 rótulos não cabem nas células de ~59 px a 320 px — "Movimentações" já quebra; o curto garante que não quebre). Título interno da aba/seção: **"Resultado"** (`<h2>` dentro do cartão de conteúdo). Se a QA medir e couber a 320 px, o rótulo pode ser "Resultado" também.

**Dados:** vendas concluídas do período + itens (snapshot `custo_unitario` via trigger) no mesmo `useEffect` das movimentações; filtro de produto (`produtoId`) aplicado quando selecionado. Resultado via `montarResultado(vendas, itens)`.

**Conteúdo da aba (`aba === 'resultado'`):**
1. **Carregando:** `Carregando texto="Calculando resultado…"`.
2. **Erro de rede:** `Aviso tom="erro"`: "Não foi possível carregar o resultado. Tente novamente." (não duplica o aviso global de internet do app).
3. **Vazio do período** (sem vendas concluídas): `Vazio icone={ShoppingCart}` — título "Sem resultado no período", texto "Não há vendas concluídas neste período."
4. **Preenchido:**
   - 4 `Kpi` (`grid grid-cols-2 gap-3 sm:grid-cols-4`): "Faturamento bruto" (Banknote, neutro), "CMV" (PackageX, vermelho), "Lucro" (TrendingUp, verde), "Margem" (Percent, verde). Valores: `formatarReais` e "{margem}%".
   - `Aviso tom="alerta"` apenas quando houver itens sem custo: **"Itens sem custo cadastrado neste período — R$ {valorSemCusto} não entram no lucro e o lucro pode ficar superestimado. Cadastre o custo em Produtos."** (frase exata "sem custo cadastrado"; só aparece se `valorSemCusto > 0`).
   - Tabela por produto dentro de `<div className="cartao overflow-x-auto">`, `<table className="w-full min-w-[720px] text-sm">` (o `overflow-x-auto` evita rolagem horizontal a 390 px):
     - Colunas: **Produto | Faturamento | CMV | Lucro | Margem**
     - Linha: nome do produto + código interno (mono, `text-slate-500`); valores alinhados à direita; lucro negativo em `text-red-700`.
     - Dois itens do mesmo produto agregam em uma linha.
   - `Paginacao` (`rotulo="produtos"`, `POR_PAGINA`) abaixo da tabela, mesmo padrão das outras abas.
   - Filtro de produto ativo mostra o Aviso existente ("Relatório e arquivos exportados mostram só …").

**Export (`SECOES`):** adicionar `resultado` a `SECOES` (rótulo "Resultado"), ao estado padrão `secoes` (`resultado: true`) e a `contagensSecoes` (`resultado: relatorio?.resultado?.porProduto.length ?? 0`). O checkbox segue o padrão "(qtd)" e `secoesVazias` avisa se ficar sem linhas (Regra 3 do E2E — ver item 7).

---

## 4. Export Excel/PDF — seção "Resultado"

**Arquivos:** `src/lib/exportar/excel.ts` e `src/lib/exportar/pdf.ts` (tipo `Secoes` ganha `resultado: boolean`).

**Excel:** nova planilha "Resultado" quando `secoes.resultado`: `cabecalhoRelatorio(ws, 'Resultado', …)`, bloco de KPIs (Faturamento bruto / CMV / Lucro / Margem com valores), depois tabela por produto (Código, Produto, Faturamento, CMV, Lucro, Margem) usando `montarCabecalho`/`cabecalhoRelatorio` + `bordas()`; legenda com o aviso de itens sem custo quando houver.

**PDF:** nova seção "Resultado" (`titulo('Resultado')`), KPIs em linhas de texto, depois `autoTable` com head `['Produto', 'Faturamento', 'CMV', 'Lucro', 'Margem']`.

**Nome do arquivo:** mantém `relatorio-estoque_<de>_a_<ate>.<ext>` (o arquivo abrange todas as seções marcadas).

---

## 5. Helper puro `src/lib/resultado.ts` (define o que a UI mostra)

`montarResultado(vendas, itens)` → `{ faturamentoBruto, cmv, lucro, margem, canceladas, valorSemCusto, porProduto[] }`, aritmética em centavos (padrão `centavos()` do Painel):
- Faturamento bruto = Σ `vendas.total` das **concluídas** (canceladas excluídas; contagem em `canceladas`).
- CMV = Σ `quantidade × custo_unitario` (snapshot); itens com custo `null` ficam de fora.
- Lucro bruto = faturamento − CMV; margem = lucro / faturamento (0 se faturamento 0).
- `valorSemCusto` = total de itens com custo `null` (alimenta o aviso).
- `porProduto[]`: agregado por produto (dois itens do mesmo produto somam), ordenado por faturamento decrescente; `produto_id null` → "Item avulso".

**Teste puro obrigatório** (Regra 6 do projeto, mesmo commit): `src/lib/resultado.test.ts` — concluída soma / cancelada excluída; CMV = qtd × custo snapshot; item sem custo fora do CMV e contabilizado no aviso; margem com faturamento 0; dois itens do mesmo produto agregam na tabela por produto.

---

## 6. Camada de dados (contexto para a UI)

`src/lib/dados/vendas.ts`: `itensDasVendas(vendaIds)` — blocos de 150, `in('venda_id')`, select `venda_id, produto_id, descricao, quantidade, unidade, preco_unitario, total, custo_unitario` (padrão de `pagamentosDasVendas`).

---

## 7. A11y

- Labels vinculados (`htmlFor`) em todos os inputs; `aria-describedby` na dica do custo.
- Botões de ícone com `aria-label`; tabela navegável por teclado (nativa).
- Foco visível mantido (classes `.btn`/`.campo` já trazem `focus-visible:ring-letreiro`); no erro do custo, o foco volta ao `p-custo`.
- Alvo de toque ≥ 44 px em botões e linhas interativas; inputs herdam `.campo` (altura do design system — observar a 390 px em QA).
- Contraste WCAG AA com as cores do tema (slate-900/600, badges com ring); sem emoji, nunca cor como único sinalizador.
- Sem rolagem horizontal em 390 px (`overflow-x-auto` na tabela; `semRolagemHorizontal` nos testes E2E).
- `pb-seguro` onde houver rodapé fixo/modal (o `Modal` já aplica).
- Offline: estado de erro com mensagem exata; não duplica o aviso global de internet do app.

---

## 8. `.spec.ts` afetados (`e2e/app/`)

**Novo:** `e2e/app/resultado.spec.ts` — 5 cenários (plano, passo 8):
1. Produto Custo R$ 10,00 + Preço R$ 20,00 → venda 2 un no PDV → Painel "Resultado de hoje": Faturamento R$ 40,00, Lucro R$ 20,00, margem 50%.
2. Relatórios no período: aba Resultado mostra os mesmos KPIs + linha do produto.
3. Produto sem custo: venda aparece com aviso de itens sem custo (CMV fora do lucro).
4. Venda cancelada não entra no faturamento.
5. Download Excel contém a seção Resultado (`page.on('download')`).

**Regressão (Regra 1 do E2E):**
- `e2e/app/produtos.spec.ts`: novo campo Custo no cadastro/edição, inclusive erro "Custo inválido.".
- `e2e/app/relatorios.spec.ts`: 5ª aba no Segmentado + seção Resultado na exportação Excel/PDF; atualizar `SECOES_DO_RELATORIO` para os 5 itens (o teste "nenhuma seção" deve desmarcar todas as 5).
- `e2e/app/painel-estoque.spec.ts`: novo card "Resultado de hoje".
- `e2e/app/pdv.spec.ts`: payload de venda não muda — apenas conferir que a venda continua saindo igual.

**Novo teste de unidade:** `src/lib/resultado.test.ts` (helper puro, item 5).

---

## 9. Critérios de aceitação (verificáveis pelo QA)

1. Custo R$ 10,00 + Preço R$ 20,00, venda de 2 un → Painel "Resultado de hoje" mostra Faturamento R$ 40,00, Lucro R$ 20,00, margem 50% (`resultado.spec.ts` c1).
2. Relatórios no período: aba Resultado com os mesmos KPIs + linha do produto; Excel e PDF incluem a seção Resultado (`resultado.spec.ts` c2 e c5).
3. Produto sem custo: aviso de itens sem custo exibido; CMV desse item fica fora do lucro (`resultado.spec.ts` c3).
4. Venda cancelada fora do faturamento (`resultado.spec.ts` c4).
5. `npm run lint`, `npm test` e `npm run test:sql` verdes; `resultado.spec.ts` verde; `produtos.spec.ts`, `relatorios.spec.ts`, `painel-estoque.spec.ts` e `pdv.spec.ts` sem regressão.

**Fora do escopo desta spec:** custo na importação de catálogo, CMV por lote/FEFO, impostos (IBS/CBS), lucro líquido (fase fiscal T-034) e edição rápida de custo na lista de produtos.
