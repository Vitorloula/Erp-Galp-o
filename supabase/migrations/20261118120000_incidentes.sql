-- =====================================================================
--  T-039 F3 — Incidentes
-- =====================================================================

create table public.admin_incidentes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas (id) on delete set null,
  loja_id uuid,
  titulo text not null,
  descricao text,
  fingerprint text,
  grupos_relacionados text[] not null default '{}'::text[],
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','critica')),
  situacao text not null default 'aberto' check (situacao in ('aberto','em_analise','resolvido','cancelado')),
  responsavel uuid,
  usuarios_impactados int not null default 0,
  primeira_em timestamptz,
  ultima_em timestamptz,
  diagnostico text,
  solucao_recomendada text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid
);

create table public.admin_incidente_acoes (
  id uuid primary key default gen_random_uuid(),
  incidente_id uuid not null references public.admin_incidentes (id) on delete cascade,
  acao text not null,
  detalhe text,
  autor uuid,
  criado_em timestamptz not null default now()
);

alter table public.admin_incidentes enable row level security;
alter table public.admin_incidente_acoes enable row level security;
revoke all on public.admin_incidentes from public, anon, authenticated;
revoke all on public.admin_incidente_acoes from public, anon, authenticated;

-- RPCs
create or replace function public.admin_incidente_criar_de_grupo(
  p_fingerprint text,
  p_titulo text,
  p_prioridade text default 'media',
  p_empresa uuid default null,
  p_loja uuid default null,
  p_descricao text default null,
  p_correlacao uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_id uuid;
  v_primeira timestamptz;
  v_ultima timestamptz;
  v_usuarios int;
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then raise exception 'Informe o título do incidente.' using errcode = 'P0001'; end if;

  select min(criado_em), max(criado_em), count(distinct usuario_id)::int
    into v_primeira, v_ultima, v_usuarios
  from public.erros_cliente where fingerprint = p_fingerprint
    and (p_empresa is null or empresa_id = p_empresa);

  insert into public.admin_incidentes (empresa_id, loja_id, titulo, descricao, fingerprint, prioridade, usuarios_impactados, primeira_em, ultima_em, criado_por)
  values (p_empresa, p_loja, p_titulo, p_descricao, p_fingerprint, coalesce(p_prioridade,'media'), coalesce(v_usuarios,0), v_primeira, v_ultima, v_admin)
  returning id into v_id;

  insert into public.admin_incidente_acoes (incidente_id, acao, detalhe, autor) values (v_id, 'Criado', p_descricao, v_admin);

  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, detalhes, correlacao)
  values (v_admin, 'acao', 'incidente_criar', p_empresa, jsonb_build_object('incidente', v_id, 'fingerprint', p_fingerprint), p_correlacao);

  return v_id;
end $$;

create or replace function public.admin_incidente_atualizar(
  p_id uuid,
  p_prioridade text default null,
  p_situacao text default null,
  p_responsavel uuid default null,
  p_diagnostico text default null,
  p_solucao_recomendada text default null,
  p_titulo text default null,
  p_descricao text default null,
  p_correlacao uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  update public.admin_incidentes set
    prioridade = coalesce(p_prioridade, prioridade),
    situacao = coalesce(p_situacao, situacao),
    responsavel = coalesce(p_responsavel, responsavel),
    diagnostico = coalesce(p_diagnostico, diagnostico),
    solucao_recomendada = coalesce(p_solucao_recomendada, solucao_recomendada),
    titulo = coalesce(p_titulo, titulo),
    descricao = coalesce(p_descricao, descricao),
    atualizado_em = now()
  where id = p_id;

  insert into public.admin_incidente_acoes (incidente_id, acao, detalhe, autor)
  values (p_id, 'Atualizado', coalesce(p_situacao, p_prioridade, 'campos'), v_admin);

  insert into public.admin_auditoria (admin_id, acao, alvo, detalhes, correlacao)
  values (v_admin, 'acao', 'incidente_atualizar', jsonb_build_object('incidente', p_id), p_correlacao);
end $$;

create or replace function public.admin_incidente_recontar(p_id uuid, p_correlacao uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_fp text;
  v_primeira timestamptz;
  v_ultima timestamptz;
  v_usuarios int;
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  select fingerprint into v_fp from public.admin_incidentes where id = p_id;
  select min(criado_em), max(criado_em), count(distinct usuario_id)::int
    into v_primeira, v_ultima, v_usuarios
  from public.erros_cliente where fingerprint = v_fp;
  update public.admin_incidentes
    set usuarios_impactados = coalesce(v_usuarios, usuarios_impactados),
        primeira_em = coalesce(v_primeira, primeira_em),
        ultima_em = coalesce(v_ultima, ultima_em),
        atualizado_em = now()
    where id = p_id;
  insert into public.admin_incidente_acoes (incidente_id, acao, detalhe, autor) values (p_id, 'Recontado', null, v_admin);
  insert into public.admin_auditoria (admin_id, acao, alvo, detalhes, correlacao) values (v_admin, 'acao', 'incidente_recontar', jsonb_build_object('incidente', p_id), p_correlacao);
end $$;

create or replace function public.admin_incidente_acao(p_id uuid, p_acao text, p_detalhe text default null, p_correlacao uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  insert into public.admin_incidente_acoes (incidente_id, acao, detalhe, autor) values (p_id, p_acao, p_detalhe, v_admin);
  insert into public.admin_auditoria (admin_id, acao, alvo, detalhes, correlacao) values (v_admin, 'acao', 'incidente_acao', jsonb_build_object('incidente', p_id, 'acao', p_acao), p_correlacao);
end $$;

create or replace function public.admin_incidente_listar(
  p_prioridade text default null,
  p_situacao text default null,
  p_empresa uuid default null,
  p_de timestamptz default null,
  p_ate timestamptz default null,
  p_correlacao uuid default null
)
returns setof public.admin_incidentes
language plpgsql
security definer
set search_path = ''
as $$
declare v_admin uuid := (select auth.uid());
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'incidentes', p_empresa, jsonb_build_object('prioridade', p_prioridade, 'situacao', p_situacao), p_correlacao);
  return query
  select i.* from public.admin_incidentes i
  where (p_prioridade is null or i.prioridade = p_prioridade)
    and (p_situacao is null or i.situacao = p_situacao)
    and (p_empresa is null or i.empresa_id = p_empresa)
    and (p_de is null or i.criado_em >= p_de)
    and (p_ate is null or i.criado_em <= p_ate)
  order by i.criado_em desc;
end $$;

create or replace function public.admin_incidente_ver(p_id uuid, p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_admin uuid := (select auth.uid()); v_res jsonb;
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  insert into public.admin_auditoria (admin_id, acao, alvo, detalhes, correlacao) values (v_admin, 'consulta', 'incidente', jsonb_build_object('incidente', p_id), p_correlacao);
  select jsonb_build_object(
    'incidente', (select to_jsonb(i) from public.admin_incidentes i where i.id = p_id),
    'acoes', coalesce((select jsonb_agg(to_jsonb(a) order by a.criado_em) from public.admin_incidente_acoes a where a.incidente_id = p_id), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

-- Grants
revoke execute on function public.admin_incidente_criar_de_grupo(text, text, text, uuid, uuid, text, uuid) from public, anon;
revoke execute on function public.admin_incidente_atualizar(uuid, text, text, uuid, text, text, text, text, uuid) from public, anon;
revoke execute on function public.admin_incidente_recontar(uuid, uuid) from public, anon;
revoke execute on function public.admin_incidente_acao(uuid, text, text, uuid) from public, anon;
revoke execute on function public.admin_incidente_listar(text, text, uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function public.admin_incidente_ver(uuid, uuid) from public, anon;

grant execute on function public.admin_incidente_criar_de_grupo(text, text, text, uuid, uuid, text, uuid) to authenticated;
grant execute on function public.admin_incidente_atualizar(uuid, text, text, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.admin_incidente_recontar(uuid, uuid) to authenticated;
grant execute on function public.admin_incidente_acao(uuid, text, text, uuid) to authenticated;
grant execute on function public.admin_incidente_listar(text, text, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_incidente_ver(uuid, uuid) to authenticated;
