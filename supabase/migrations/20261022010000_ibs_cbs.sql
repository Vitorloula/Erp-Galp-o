-- =====================================================================
--  Onda 2 — Reforma Tributária: alíquotas de IBS e CBS no produto.
--
--  A Reforma Tributária (LC 214/2025) cria o IBS (Imposto sobre Bens e
--  Serviços) e a CBS (Contribuição sobre Bens e Serviços). A partir de
--  01/01/2027 a NFC-e do Simples Nacional passa a ter esses campos.
--  As alíquotas aqui são opcionais e por produto (%), para confirmar com
--  o contador antes de preencher.
-- =====================================================================

alter table public.produtos
  add column ibs_aliquota numeric(6, 2)
    check (ibs_aliquota is null or (ibs_aliquota >= 0 and ibs_aliquota <= 100));

alter table public.produtos
  add column cbs_aliquota numeric(6, 2)
    check (cbs_aliquota is null or (cbs_aliquota >= 0 and cbs_aliquota <= 100));
