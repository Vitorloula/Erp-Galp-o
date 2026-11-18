-- =====================================================================
--  T-039 F1 — Base do Painel Super Admin (plataforma)
--  Reativa public.plataforma_admins + guard server-side app.sou_super_admin().
--  Tabelas de plataforma: RLS on, sem policy para authenticated (leitura só
--  via funções SECURITY DEFINER com guard). Grants restritos a authenticated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Guard central do super admin
-- ---------------------------------------------------------------------
create or replace function app.sou_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plataforma_admins
    where usuario_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Auditoria única da plataforma (D4)
-- ---------------------------------------------------------------------
create table public.admin_auditoria (
  id         bigint generated always as identity primary key,
  admin_id   uuid not null,
  acao       text not null,
  alvo       text,
  empresa_id uuid,
  loja_id    uuid,
  detalhes   jsonb not null default '{}'::jsonb,
  correlacao uuid,
  criado_em  timestamptz not null default now()
);
create index admin_auditoria_admin_idx on public.admin_auditoria (admin_id, criado_em desc);
create index admin_auditoria_data_idx on public.admin_auditoria (criado_em desc);

alter table public.admin_auditoria enable row level security;
revoke all on public.admin_auditoria from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Funções públicas (SECURITY DEFINER, guard + auditoria)
-- ---------------------------------------------------------------------
-- Barato: apenas diz se o usuário logado é super admin (sem auditoria).
create or replace function public.admin_sou_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return app.sou_super_admin();
end $$;

-- Visão geral de todas as empresas.
create or replace function public.admin_visao_geral(p_correlacao uuid default null)
returns table (
  empresa_id uuid,
  nome text,
  segmento text,
  criado_em timestamptz,
  estado text,
  plano_id text,
  status_assinatura text,
  trial_ate timestamptz,
  pago_ate timestamptz,
  lojas_ativas bigint,
  usuarios_ativos bigint,
  vendas_7d bigint,
  faturamento_7d numeric,
  ultima_venda_em timestamptz,
  erros_7d bigint,
  divergencias_abertas bigint,
  ultima_movimentacao_em timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
begin
  if not app.sou_super_admin() then
    raise exception 'Sem acesso à plataforma.' using errcode = '42501';
  end if;

  insert into public.admin_auditoria (admin_id, acao, alvo, detalhes, correlacao)
  values (v_admin, 'consulta', 'visao_geral', '{}'::jsonb, p_correlacao);

  return query
  select
    e.id as empresa_id,
    e.nome,
    e.segmento,
    e.criado_em,
    app.estado_empresa(e.id) as estado,
    a.plano_id,
    a.status as status_assinatura,
    a.trial_ate,
    a.pago_ate,
    (select count(*) from public.lojas l where l.empresa_id = e.id and l.ativo) as lojas_ativas,
    (select count(*) from public.membros m where m.empresa_id = e.id and m.ativo) as usuarios_ativos,
    (select count(*) from public.vendas v where v.empresa_id = e.id and v.ocorrido_em >= now() - interval '7 days') as vendas_7d,
    (select coalesce(sum(v.total), 0) from public.vendas v where v.empresa_id = e.id and v.ocorrido_em >= now() - interval '7 days' and v.status = 'concluida') as faturamento_7d,
    (select max(v.ocorrido_em) from public.vendas v where v.empresa_id = e.id) as ultima_venda_em,
    (select count(*) from public.erros_cliente ec where ec.empresa_id = e.id and ec.criado_em >= now() - interval '7 days') as erros_7d,
    (select count(*) from public.divergencias d where d.empresa_id = e.id and d.resolvida_em is null) as divergencias_abertas,
    (select max(mv.registrado_em) from public.movimentacoes mv where mv.empresa_id = e.id) as ultima_movimentacao_em
  from public.empresas e
  left join public.assinaturas a on a.empresa_id = e.id
  order by erros_7d desc, e.nome;
end $$;

-- Detalhe de uma empresa (JSON).
create or replace function public.admin_ver_empresa(p_empresa uuid, p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_result jsonb;
begin
  if not app.sou_super_admin() then
    raise exception 'Sem acesso à plataforma.' using errcode = '42501';
  end if;

  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'empresa', p_empresa, jsonb_build_object('empresa_id', p_empresa), p_correlacao);

  select jsonb_build_object(
    'empresa', (select to_jsonb(e) from public.empresas e where e.id = p_empresa),
    'assinatura', (select to_jsonb(a) from public.assinaturas a where a.empresa_id = p_empresa),
    'lojas', coalesce((select jsonb_agg(to_jsonb(l)) from public.lojas l where l.empresa_id = p_empresa), '[]'::jsonb),
    'membros', coalesce((select jsonb_agg(jsonb_build_object('usuario_id', m.usuario_id, 'papel', m.papel, 'ativo', m.ativo, 'lojas', m.lojas, 'nome', p.nome, 'email', p.email)) from public.membros m left join public.perfis p on p.id = m.usuario_id where m.empresa_id = p_empresa), '[]'::jsonb),
    'convites', coalesce((select jsonb_agg(to_jsonb(c)) from public.convites c where c.empresa_id = p_empresa), '[]'::jsonb),
    'erros', coalesce((select jsonb_agg(to_jsonb(ec)) from (select * from public.erros_cliente where empresa_id = p_empresa order by criado_em desc limit 20) ec), '[]'::jsonb),
    'movimentacoes', coalesce((select jsonb_agg(to_jsonb(mv)) from (select * from public.movimentacoes where empresa_id = p_empresa order by registrado_em desc limit 20) mv), '[]'::jsonb),
    'vendas', coalesce((select jsonb_agg(to_jsonb(v)) from (select * from public.vendas where empresa_id = p_empresa order by ocorrido_em desc limit 20) v), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

-- Listagem de auditoria.
create or replace function public.admin_auditoria_listar(
  p_admin_id uuid default null,
  p_de date default (current_date - 30),
  p_ate date default current_date,
  p_limite int default 200,
  p_correlacao uuid default null
)
returns setof public.admin_auditoria
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.sou_super_admin() then
    raise exception 'Sem acesso à plataforma.' using errcode = '42501';
  end if;

  insert into public.admin_auditoria (admin_id, acao, alvo, detalhes, correlacao)
  values ((select auth.uid()), 'consulta', 'auditoria', jsonb_build_object('admin_id', p_admin_id, 'de', p_de, 'ate', p_ate, 'limite', p_limite), p_correlacao);

  return query
  select a.* from public.admin_auditoria a
  where (p_admin_id is null or a.admin_id = p_admin_id)
    and a.criado_em::date between p_de and p_ate
  order by a.criado_em desc
  limit greatest(1, least(p_limite, 1000));
end $$;

-- Guard revoke
revoke execute on function app.sou_super_admin() from public, anon;
grant execute on function app.sou_super_admin() to authenticated;

-- Grants
revoke execute on function public.admin_sou_admin() from public, anon;
revoke execute on function public.admin_visao_geral(uuid) from public, anon;
revoke execute on function public.admin_ver_empresa(uuid, uuid) from public, anon;
revoke execute on function public.admin_auditoria_listar(uuid, date, date, int, uuid) from public, anon;

grant execute on function public.admin_sou_admin() to authenticated;
grant execute on function public.admin_visao_geral(uuid) to authenticated;
grant execute on function public.admin_ver_empresa(uuid, uuid) to authenticated;
grant execute on function public.admin_auditoria_listar(uuid, date, date, int, uuid) to authenticated;
