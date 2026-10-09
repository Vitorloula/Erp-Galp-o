-- =====================================================================
--  Correção 2026-10-08 — exclusão de usuário
--
--  Problema: excluir um usuário que já lançou movimentações (ou cadastrou
--  produtos) falhava. A chave estrangeira "on delete set null" tentava
--  alterar o histórico, que é imutável, e a exclusão era recusada.
--
--  Quem precisa rodar: apenas projetos criados com o schema.sql ANTERIOR a
--  esta data. Projetos novos já usam o schema.sql corrigido.
--
--  Como usar: Supabase → SQL Editor → cole este arquivo → Run.
--  O histórico continua com o id e o nome de quem lançou.
-- =====================================================================

alter table public.movimentacoes drop constraint if exists movimentacoes_usuario_id_fkey;
alter table public.produtos      drop constraint if exists produtos_criado_por_fkey;
