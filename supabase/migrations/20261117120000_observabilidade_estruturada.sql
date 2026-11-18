-- =====================================================================
--  T-039 F2 — Observabilidade estruturada (reuso de erros_cliente)
-- =====================================================================

alter table public.erros_cliente
  add column if not exists modulo text,
  add column if not exists gravidade text not null default 'erro'
    check (gravidade in ('info','aviso','erro','critico')),
  add column if not exists contexto jsonb not null default '{}'::jsonb,
  add column if not exists fingerprint text,
  add column if not exists causa_provavel text,
  add column if not exists sugestao text,
  add column if not exists status text not null default 'novo'
    check (status in ('novo','em_analise','resolvido','recorrente')),
  add column if not exists status_em timestamptz,
  add column if not exists status_por uuid;

create index if not exists erros_cliente_fingerprint_idx on public.erros_cliente (fingerprint, criado_em desc);

-- ---------------------------------------------------------------------
--  app.erro_fingerprint: normalização server-side

-- ---------------------------------------------------------------------
create or replace function app.erro_fingerprint(p_mensagem text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substring(md5(
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(p_mensagem, '')), '[0-9a-f]{8,}', '', 'g'),
        '\d+', '', 'g'),
      '\s+', ' ', 'g'))
), 1, 16);
$$;

revoke execute on function app.erro_fingerprint(text) from public, anon;
grant execute on function app.erro_fingerprint(text) to authenticated;

-- Trigger que preenche o fingerprint no insert.
create or replace function app.erro_fingerprint_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fingerprint is null then
    new.fingerprint := app.erro_fingerprint(new.mensagem);
  end if;
  return new;
end $$;

revoke execute on function app.erro_fingerprint_trigger() from public, anon;
grant execute on function app.erro_fingerprint_trigger() to authenticated;

drop trigger if exists erros_cliente_fingerprint on public.erros_cliente;
create trigger erros_cliente_fingerprint
  before insert on public.erros_cliente
  for each row execute function app.erro_fingerprint_trigger();

-- Backfill único para linhas antigas.
update public.erros_cliente
  set fingerprint = app.erro_fingerprint(mensagem)
  where fingerprint is null;

-- ---------------------------------------------------------------------
--  Funções admin (guard + auditoria)
-- ---------------------------------------------------------------------
create or replace function public.admin_log_listar(
  p_empresa uuid default null,
  p_usuario uuid default null,
  p_modulo text default null,
  p_fingerprint text default null,
  p_gravidade text default null,
  p_status text default null,
  p_de timestamptz default (now() - interval '30 days'),
  p_ate timestamptz default now(),
  p_limite int default 200,
  p_correlacao uuid default null
)
returns setof public.erros_cliente
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
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'log', p_empresa, jsonb_build_object('usuario', p_usuario, 'modulo', p_modulo, 'fingerprint', p_fingerprint, 'gravidade', p_gravidade, 'status', p_status), p_correlacao);

  return query
  select e.* from public.erros_cliente e
  where (p_empresa is null or e.empresa_id = p_empresa)
    and (p_usuario is null or e.usuario_id = p_usuario)
    and (p_modulo is null or e.modulo = p_modulo)
    and (p_fingerprint is null or e.fingerprint = p_fingerprint)
    and (p_gravidade is null or e.gravidade = p_gravidade)
    and (p_status is null or e.status = p_status)
    and e.criado_em between p_de and p_ate
  order by e.criado_em desc
  limit greatest(1, least(p_limite, 1000));
end $$;

create or replace function public.admin_log_grupos(
  p_empresa uuid default null,
  p_de timestamptz default (now() - interval '30 days'),
  p_ate timestamptz default now(),
  p_correlacao uuid default null
)
returns table (
  fingerprint text,
  contagem bigint,
  primeira timestamptz,
  ultima timestamptz,
  mensagem text,
  lojas bigint,
  usuarios bigint
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
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'log_grupos', p_empresa, jsonb_build_object('de', p_de, 'ate', p_ate), p_correlacao);

  return query
  select e.fingerprint,
    count(*)::bigint as contagem,
    min(e.criado_em) as primeira,
    max(e.criado_em) as ultima,
    (array_agg(e.mensagem order by e.criado_em desc))[1] as mensagem,
    count(distinct e.loja_id)::bigint as lojas,
    count(distinct e.usuario_id)::bigint as usuarios
  from public.erros_cliente e
  where (p_empresa is null or e.empresa_id = p_empresa)
    and e.criado_em between p_de and p_ate
  group by e.fingerprint
  order by contagem desc;
end $$;

create or replace function public.admin_log_status(
  p_erro bigint,
  p_status text,
  p_causa text default null,
  p_sugestao text default null,
  p_correlacao uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_antes jsonb;
begin
  if not app.sou_super_admin() then
    raise exception 'Sem acesso à plataforma.' using errcode = '42501';
  end if;
  if p_status not in ('novo','em_analise','resolvido','recorrente') then
    raise exception 'Status inválido.' using errcode = 'P0001';
  end if;

  select to_jsonb(e) into v_antes from public.erros_cliente e where e.id = p_erro;
  update public.erros_cliente
    set status = p_status,
        causa_provavel = coalesce(p_causa, causa_provavel),
        sugestao = coalesce(p_sugestao, sugestao),
        status_em = now(),
        status_por = v_admin
    where id = p_erro;

  insert into public.admin_auditoria (admin_id, acao, alvo, detalhes, correlacao)
  values (v_admin, 'acao', 'log_status', jsonb_build_object('erro', p_erro, 'antes', v_antes, 'depois', p_status, 'causa', p_causa, 'sugestao', p_sugestao), p_correlacao);
end $$;

-- Grants
revoke execute on function public.admin_log_listar(uuid, uuid, text, text, text, text, timestamptz, timestamptz, int, uuid) from public, anon;
revoke execute on function public.admin_log_grupos(uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function public.admin_log_status(bigint, text, text, text, uuid) from public, anon;

grant execute on function public.admin_log_listar(uuid, uuid, text, text, text, text, timestamptz, timestamptz, int, uuid) to authenticated;
grant execute on function public.admin_log_grupos(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_log_status(bigint, text, text, text, uuid) to authenticated;
