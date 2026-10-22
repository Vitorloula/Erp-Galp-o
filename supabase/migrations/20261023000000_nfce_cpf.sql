-- =====================================================================
--  Fase 3 — "CPF na nota": o cliente que pedir a NFC-e na hora tem o
--  CPF guardado na venda para a emissão.
-- =====================================================================

alter table public.vendas add column cliente_cpf text;
