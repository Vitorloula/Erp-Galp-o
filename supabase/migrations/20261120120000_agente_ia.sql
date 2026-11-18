-- =====================================================================
--  T-039 F5 — Agente de IA (histórico de análises)
-- =====================================================================

create table public.admin_incidente_analises (
  id uuid primary key default gen_random_uuid(),
  incidente_id uuid references public.admin_incidentes (id) on delete cascade,
  pacote jsonb not null default '{}'::jsonb,
  resultado text,
  modelo text,
  tokens_entrada int,
  tokens_saida int,
  criado_em timestamptz not null default now(),
  criado_por uuid
);

alter table public.admin_incidente_analises enable row level security;
revoke all on public.admin_incidente_analises from public, anon, authenticated;

-- Gera pacote sanitizado a partir do incidente + grupo de erros.
create or replace function public.admin_incidente_gerar_pacote(p_incidente uuid, p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_inc public.admin_incidentes;
  v_pacote jsonb;
  v_amostra jsonb;
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  select * into v_inc from public.admin_incidentes where id = p_incidente;
  if v_inc.id is null then raise exception 'Incidente não encontrado.' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'mensagem', e.mensagem,
    'stack', substring(e.stack from 1 for 500),
    'modulo', e.modulo,
    'gravidade', e.gravidade,
    'criado_em', e.criado_em
  )), '[]'::jsonb) into v_amostra
  from (select * from public.erros_cliente where fingerprint = v_inc.fingerprint order by criado_em desc limit 10) e;

  v_pacote := jsonb_build_object(
    'incidente', jsonb_build_object('id', v_inc.id, 'titulo', v_inc.titulo, 'prioridade', v_inc.prioridade, 'situacao', v_inc.situacao, 'usuarios_impactados', v_inc.usuarios_impactados, 'primeira_em', v_inc.primeira_em, 'ultima_em', v_inc.ultima_em),
    'fingerprint', v_inc.fingerprint,
    'ocorrencias', v_amostra
  );

  insert into public.admin_auditoria (admin_id, acao, alvo, detalhes, correlacao)
  values (v_admin, 'agente_pacote', 'incidente', jsonb_build_object('incidente', p_incidente), p_correlacao);

  return v_pacote;
end $$;

create or replace function public.admin_incidente_salvar_analise(
  p_incidente uuid,
  p_pacote jsonb,
  p_resultado text,
  p_modelo text default null,
  p_tokens_entrada int default null,
  p_tokens_saida int default null,
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
  v_hoje int;
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  select count(*)::int into v_hoje from public.admin_incidente_analises where criado_por = v_admin and criado_em::date = current_date;
  if v_hoje >= 50 then
    raise exception 'Limite diário de análises atingido (%/50). Tente amanhã.', v_hoje using errcode = 'P0001';
  end if;

  insert into public.admin_incidente_analises (incidente_id, pacote, resultado, modelo, tokens_entrada, tokens_saida, criado_por)
  values (p_incidente, coalesce(p_pacote, '{}'::jsonb), p_resultado, p_modelo, p_tokens_entrada, p_tokens_saida, v_admin)
  returning id into v_id;

  update public.admin_incidentes
    set diagnostico = coalesce(diagnostico, p_resultado),
        solucao_recomendada = coalesce(solucao_recomendada, p_resultado),
        atualizado_em = now()
    where id = p_incidente;

  insert into public.admin_auditoria (admin_id, acao, alvo, detalhes, correlacao)
  values (v_admin, 'agente_analise', 'incidente', jsonb_build_object('incidente', p_incidente, 'analise', v_id), p_correlacao);

  return v_id;
end $$;

create or replace function public.admin_incidente_analises_hoje(p_correlacao uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  return (select count(*)::int from public.admin_incidente_analises where criado_por = (select auth.uid()) and criado_em::date = current_date);
end $$;

create or replace function public.admin_incidente_analises_listar(p_incidente uuid, p_correlacao uuid default null)
returns setof public.admin_incidente_analises
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  return query select a.* from public.admin_incidente_analises a where a.incidente_id = p_incidente order by a.criado_em desc;
end $$;

-- Grants
revoke execute on function public.admin_incidente_gerar_pacote(uuid, uuid) from public, anon;
revoke execute on function public.admin_incidente_salvar_analise(uuid, jsonb, text, text, int, int, uuid) from public, anon;
revoke execute on function public.admin_incidente_analises_hoje(uuid) from public, anon;
revoke execute on function public.admin_incidente_analises_listar(uuid, uuid) from public, anon;

grant execute on function public.admin_incidente_gerar_pacote(uuid, uuid) to authenticated;
grant execute on function public.admin_incidente_salvar_analise(uuid, jsonb, text, text, int, int, uuid) to authenticated;
grant execute on function public.admin_incidente_analises_hoje(uuid) to authenticated;
grant execute on function public.admin_incidente_analises_listar(uuid, uuid) to authenticated;
