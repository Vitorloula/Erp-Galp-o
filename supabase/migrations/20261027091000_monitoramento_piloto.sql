-- =====================================================================
--  Monitoramento de erros do piloto.
--
--  O app grava erros de JavaScript/React aqui para o suporte enxergar o
--  que aconteceu no aparelho da loja. Dono/gerente podem consultar os
--  erros da propria empresa; o suporte usa a service role.
-- =====================================================================

create table public.erros_cliente (
  id          bigint generated always as identity primary key,
  empresa_id  uuid references public.empresas (id) on delete cascade,
  loja_id     uuid,
  usuario_id  uuid,
  mensagem    text not null,
  stack       text,
  url         text,
  user_agent  text,
  criado_em   timestamptz not null default now()
);
create index erros_cliente_data_idx on public.erros_cliente (criado_em desc);
create index erros_cliente_empresa_idx on public.erros_cliente (empresa_id, criado_em desc);

alter table public.erros_cliente enable row level security;

revoke all on public.erros_cliente from anon;
revoke all on public.erros_cliente from authenticated;
grant insert, select on public.erros_cliente to authenticated;

create policy erros_cliente_inclusao on public.erros_cliente
  for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and (empresa_id is null or empresa_id in (select app.minhas_empresas()))
  );

-- Leitura restrita a dono/gerente da propria empresa (o suporte usa a service role).
create policy erros_cliente_leitura on public.erros_cliente
  for select to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente'])));
