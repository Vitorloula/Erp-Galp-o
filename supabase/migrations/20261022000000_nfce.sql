-- =====================================================================
--  Fase fiscal — NFC-e (Nota Fiscal de Consumidor Eletrônica, modelo 65).
--
--  A partir de 01/01/2027 (LC 214/2025, regulamentada pela Resolução CGSN
--  190/2026), o MEI passa a emitir documento fiscal em toda venda. A venda
--  registra aqui o estado da NFC-e:
--    pendente  → aguardando emissão (ex.: caixa offline);
--    emitida   → autorizada na SEFAZ (chave preenchida);
--    cancelada → venda cancelada / NFC-e cancelada;
--    erro      → falhou na emissão (reprocessar).
-- =====================================================================

alter table public.vendas
  add column nfce_status text not null default 'pendente'
    check (nfce_status in ('pendente', 'emitida', 'cancelada', 'erro'));

alter table public.vendas
  add column nfce_chave text;   -- chave de acesso de 44 dígitos

alter table public.vendas
  add column nfce_qrcode text;  -- URL do QR Code do DANFE NFC-e
