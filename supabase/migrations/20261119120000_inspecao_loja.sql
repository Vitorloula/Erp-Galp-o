-- =====================================================================
--  T-039 F4 — Inspeção de loja (somente leitura auditável)
-- =====================================================================

create table public.admin_inspecoes (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  loja_id uuid,
  motivo text not null check (length(trim(motivo)) >= 10),
  aberto_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '60 minutes'),
  encerrada_em timestamptz,
  encerrado_por uuid
);

alter table public.admin_inspecoes enable row level security;
revoke all on public.admin_inspecoes from public, anon, authenticated;

-- Helper: valida sessão de inspeção e retorna empresa/loja alvo.
create or replace function app.validar_inspecao(p_inspecao uuid, p_empresa uuid default null, p_loja uuid default null)
returns public.admin_inspecoes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sess public.admin_inspecoes;
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  select * into v_sess from public.admin_inspecoes
   where id = p_inspecao and admin_id = (select auth.uid())
     and encerrada_em is null and now() < expira_em;
  if v_sess.id is null then raise exception 'Inspeção inválida ou expirada.' using errcode = '42501'; end if;
  if p_empresa is not null and v_sess.empresa_id <> p_empresa then raise exception 'Inspeção não cobre esta empresa.' using errcode = '42501'; end if;
  if v_sess.loja_id is not null and p_loja is not null and v_sess.loja_id <> p_loja then raise exception 'Inspeção não cobre esta loja.' using errcode = '42501'; end if;
  return v_sess;
end $$;

revoke execute on function app.validar_inspecao(uuid, uuid, uuid) from public, anon;
grant execute on function app.validar_inspecao(uuid, uuid, uuid) to authenticated;

create or replace function public.admin_inspecao_abrir(
  p_empresa uuid,
  p_loja uuid default null,
  p_motivo text default null,
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
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  if p_motivo is null or length(trim(p_motivo)) < 10 then
    raise exception 'Descreva o motivo (mínimo de 10 caracteres).' using errcode = 'P0001';
  end if;
  insert into public.admin_inspecoes (admin_id, empresa_id, loja_id, motivo)
  values (v_admin, p_empresa, p_loja, p_motivo)
  returning id into v_id;
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, loja_id, detalhes, correlacao)
  values (v_admin, 'acao', 'inspecao_abrir', p_empresa, p_loja, jsonb_build_object('inspecao', v_id, 'motivo', p_motivo), p_correlacao);
  return v_id;
end $$;

create or replace function public.admin_inspecao_encerrar(p_id uuid, p_correlacao uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_sess public.admin_inspecoes;
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  select * into v_sess from public.admin_inspecoes where id = p_id and admin_id = v_admin;
  if v_sess.id is null then raise exception 'Inspeção não encontrada.' using errcode = '42501'; end if;
  update public.admin_inspecoes set encerrada_em = now(), encerrado_por = v_admin where id = p_id;
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, loja_id, detalhes, correlacao)
  values (v_admin, 'acao', 'inspecao_encerrar', v_sess.empresa_id, v_sess.loja_id, jsonb_build_object('inspecao', p_id), p_correlacao);
end $$;

-- Leituras (cada uma valida a sessão e audita).
create or replace function public.admin_ver_estoque(p_inspecao uuid, p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_sess public.admin_inspecoes;
  v_res jsonb;
begin
  v_sess := app.validar_inspecao(p_inspecao);
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, loja_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'inspecao_estoque', v_sess.empresa_id, v_sess.loja_id, jsonb_build_object('inspecao', p_inspecao), p_correlacao);
  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_res
  from public.vw_estoque e
  where e.empresa_id = v_sess.empresa_id
    and (v_sess.loja_id is null or e.loja_id = v_sess.loja_id);
  return v_res;
end $$;

create or replace function public.admin_ver_vendas(p_inspecao uuid, p_de timestamptz default (now() - interval '30 days'), p_ate timestamptz default now(), p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_sess public.admin_inspecoes;
  v_res jsonb;
begin
  v_sess := app.validar_inspecao(p_inspecao);
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, loja_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'inspecao_vendas', v_sess.empresa_id, v_sess.loja_id, jsonb_build_object('inspecao', p_inspecao, 'de', p_de, 'ate', p_ate), p_correlacao);
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) into v_res
  from public.vendas v
  where v.empresa_id = v_sess.empresa_id
    and (v_sess.loja_id is null or v.loja_id = v_sess.loja_id)
    and v.ocorrido_em between p_de and p_ate;
  return v_res;
end $$;

create or replace function public.admin_ver_produtos(p_inspecao uuid, p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_sess public.admin_inspecoes;
  v_res jsonb;
begin
  v_sess := app.validar_inspecao(p_inspecao);
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, loja_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'inspecao_produtos', v_sess.empresa_id, v_sess.loja_id, jsonb_build_object('inspecao', p_inspecao), p_correlacao);
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_res
  from public.produtos p
  where p.empresa_id = v_sess.empresa_id;
  return v_res;
end $$;

create or replace function public.admin_ver_movimentacoes(p_inspecao uuid, p_de timestamptz default (now() - interval '30 days'), p_ate timestamptz default now(), p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_sess public.admin_inspecoes;
  v_res jsonb;
begin
  v_sess := app.validar_inspecao(p_inspecao);
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, loja_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'inspecao_movimentacoes', v_sess.empresa_id, v_sess.loja_id, jsonb_build_object('inspecao', p_inspecao), p_correlacao);
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) into v_res
  from public.movimentacoes m
  where m.empresa_id = v_sess.empresa_id
    and (v_sess.loja_id is null or m.loja_id = v_sess.loja_id)
    and m.registrado_em between p_de and p_ate;
  return v_res;
end $$;

create or replace function public.admin_ver_equipe(p_inspecao uuid, p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_sess public.admin_inspecoes;
  v_res jsonb;
begin
  v_sess := app.validar_inspecao(p_inspecao);
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, loja_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'inspecao_equipe', v_sess.empresa_id, v_sess.loja_id, jsonb_build_object('inspecao', p_inspecao), p_correlacao);
  select coalesce(jsonb_agg(jsonb_build_object('usuario_id', m.usuario_id, 'papel', m.papel, 'ativo', m.ativo, 'nome', p.nome, 'email', p.email)), '[]'::jsonb) into v_res
  from public.membros m left join public.perfis p on p.id = m.usuario_id
  where m.empresa_id = v_sess.empresa_id;
  return v_res;
end $$;

create or replace function public.admin_ver_divergencias(p_inspecao uuid, p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_sess public.admin_inspecoes;
  v_res jsonb;
begin
  v_sess := app.validar_inspecao(p_inspecao);
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, loja_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'inspecao_divergencias', v_sess.empresa_id, v_sess.loja_id, jsonb_build_object('inspecao', p_inspecao), p_correlacao);
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_res
  from public.divergencias d
  where d.empresa_id = v_sess.empresa_id
    and (v_sess.loja_id is null or d.loja_id = v_sess.loja_id);
  return v_res;
end $$;

create or replace function public.admin_ver_assinatura(p_inspecao uuid, p_correlacao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_sess public.admin_inspecoes;
  v_res jsonb;
begin
  v_sess := app.validar_inspecao(p_inspecao);
  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, loja_id, detalhes, correlacao)
  values (v_admin, 'consulta', 'inspecao_assinatura', v_sess.empresa_id, v_sess.loja_id, jsonb_build_object('inspecao', p_inspecao), p_correlacao);
  select to_jsonb(a) into v_res from public.assinaturas a where a.empresa_id = v_sess.empresa_id;
  return v_res;
end $$;

-- Primeira escrita administrativa: ajuste de assinatura (espelha piloto.mjs).
create or replace function public.admin_ajustar_assinatura(
  p_empresa uuid,
  p_status text,
  p_dias int default null,
  p_motivo text default null,
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
  v_prazo timestamptz;
begin
  if not app.sou_super_admin() then raise exception 'Sem acesso à plataforma.' using errcode = '42501'; end if;
  if p_motivo is null or length(trim(p_motivo)) < 10 then
    raise exception 'Descreva o motivo (mínimo de 10 caracteres).' using errcode = 'P0001';
  end if;
  if p_status not in ('trial','ativa','cancelada','cortesia') then raise exception 'Status inválido.' using errcode = 'P0001'; end if;

  select to_jsonb(a) into v_antes from public.assinaturas a where a.empresa_id = p_empresa;
  if p_dias is not null and p_dias > 0 then v_prazo := now() + (p_dias || ' days')::interval; end if;

  update public.assinaturas set
    status = p_status,
    trial_ate = case when p_status = 'trial' then coalesce(v_prazo, trial_ate) else null end,
    pago_ate = case when p_status = 'ativa' then coalesce(v_prazo, pago_ate) else null end,
    atualizado_em = now()
  where empresa_id = p_empresa;

  insert into public.admin_auditoria (admin_id, acao, alvo, empresa_id, detalhes, correlacao)
  values (v_admin, 'acao', 'ajustar_assinatura', p_empresa,
    jsonb_build_object('antes', v_antes, 'depois', jsonb_build_object('status', p_status, 'dias', p_dias), 'motivo', p_motivo), p_correlacao);
end $$;

-- Grants
revoke execute on function public.admin_inspecao_abrir(uuid, uuid, text, uuid) from public, anon;
revoke execute on function public.admin_inspecao_encerrar(uuid, uuid) from public, anon;
revoke execute on function public.admin_ver_estoque(uuid, uuid) from public, anon;
revoke execute on function public.admin_ver_vendas(uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function public.admin_ver_produtos(uuid, uuid) from public, anon;
revoke execute on function public.admin_ver_movimentacoes(uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function public.admin_ver_equipe(uuid, uuid) from public, anon;
revoke execute on function public.admin_ver_divergencias(uuid, uuid) from public, anon;
revoke execute on function public.admin_ver_assinatura(uuid, uuid) from public, anon;
revoke execute on function public.admin_ajustar_assinatura(uuid, text, int, text, uuid) from public, anon;

grant execute on function public.admin_inspecao_abrir(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.admin_inspecao_encerrar(uuid, uuid) to authenticated;
grant execute on function public.admin_ver_estoque(uuid, uuid) to authenticated;
grant execute on function public.admin_ver_vendas(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_ver_produtos(uuid, uuid) to authenticated;
grant execute on function public.admin_ver_movimentacoes(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_ver_equipe(uuid, uuid) to authenticated;
grant execute on function public.admin_ver_divergencias(uuid, uuid) to authenticated;
grant execute on function public.admin_ver_assinatura(uuid, uuid) to authenticated;
grant execute on function public.admin_ajustar_assinatura(uuid, text, int, text, uuid) to authenticated;
