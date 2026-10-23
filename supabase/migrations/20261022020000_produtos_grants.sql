-- =====================================================================
--  Concede UPDATE nas colunas de produto adicionadas depois do grant
--  original (base_multiempresa.sql): ponto de pedido e alíquotas IBS/CBS.
--
--  O grant original é por coluna e não previa estas colunas. Sem o grant,
--  a atualização caía no fallback local do app (não sincronizava entre
--  aparelhos). Com ele, o ponto de pedido e as alíquotas passam a gravar.
-- =====================================================================

grant update (estoque_minimo, ibs_aliquota, cbs_aliquota) on public.produtos to authenticated;
