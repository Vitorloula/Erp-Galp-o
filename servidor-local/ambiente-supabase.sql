-- =====================================================================
--  Imitação mínima do ambiente do Supabase, para rodar as migrações reais
--  fora da nuvem (PGlite). Usado por scripts/testar-sql.mjs e pelo
--  servidor local (servidor-local/banco.ts).
--
--  auth.uid() e auth.jwt() têm a mesma definição do Supabase: leem as
--  claims do token que o PostgREST grava em request.jwt.claims.
-- =====================================================================
create role anon nologin;
create role authenticated nologin;

create schema auth;
grant usage on schema public, auth to anon, authenticated;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  confirmation_token  text,
  recovery_token      text,
  raw_app_meta_data   jsonb not null default '{"provider": "email", "providers": ["email"]}'::jsonb,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  last_sign_in_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table auth.refresh_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  session_id  uuid not null,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated;

create publication supabase_realtime;

-- Mesmo padrão do Supabase: objetos novos do schema public nascem liberados para
-- anon/authenticated, e cada migração restringe com RLS e revoke.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
