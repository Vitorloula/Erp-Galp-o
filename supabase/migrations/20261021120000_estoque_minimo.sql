-- =====================================================================
--  Fase 2 — estoque mínimo / ponto de pedido sincronizado entre aparelhos.
--
--  O app já lê e grava `produtos.estoque_minimo` (src/lib/dados/catalogo.ts):
--    • listarProdutos() faz SELECT com a coluna e cai num fallback local quando
--      ela não existe (erro 42703);
--    • salvarEstoqueMinimo() faz UPDATE direto da coluna.
--  Sem esta migration, o mínimo ficava guardado só no aparelho (localStorage)
--  e não viajava para o computador/celular da mesma loja.
-- =====================================================================

alter table public.produtos
  add column estoque_minimo numeric(14, 3)
  check (estoque_minimo is null or estoque_minimo > 0);
