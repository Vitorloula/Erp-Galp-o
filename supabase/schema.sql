-- =====================================================================
--  Sistema Web de Controle de Estoque e Fluxo de Galpão
--  Banco de dados (Supabase / PostgreSQL 15+)
--
--  Como usar: abra o SQL Editor do seu projeto Supabase, cole este
--  arquivo inteiro e clique em "Run". O script pode ser executado
--  em um projeto novo (vazio).
--
--  Regras de negócio garantidas pelo próprio banco:
--    * Estoque = soma das movimentações (nunca fica negativo).
--    * Histórico de movimentações é somente-inclusão: ninguém altera
--      nem exclui movimentações (nem pelo app, nem pela API).
--      Erros são corrigidos com uma movimentação do tipo CORRECAO.
--    * Data/hora e usuário de cada movimentação são carimbados pelo
--      servidor (não é possível "voltar no tempo").
--    * Usuários comuns (operador) consultam, cadastram produtos e
--      lançam movimentações; somente administradores editam cadastros.
--    * Toda conta nova nasce "pendente" (sem acesso a nada) até um
--      administrador liberar. O primeiro usuário vira administrador.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Perfis de usuário (pendente / operador / admin)
-- ---------------------------------------------------------------------
create table public.perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  email      text,
  papel      text not null default 'pendente' check (papel in ('pendente', 'operador', 'admin')),
  criado_em  timestamptz not null default now()
);

comment on table public.perfis is 'Perfil de cada usuário. Papel: pendente (sem acesso), operador ou admin.';

create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serializa para que só um "primeiro usuário" vire administrador.
  perform pg_advisory_xact_lock(hashtext('galpao_perfis'));
  insert into public.perfis (id, nome, email, papel)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.perfis where papel = 'admin') then 'pendente' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Usuários que já existiam antes deste script também ganham perfil (pendente).
insert into public.perfis (id, nome, email)
select id,
       coalesce(nullif(trim(raw_user_meta_data ->> 'nome'), ''), split_part(email, '@', 1)),
       email
from auth.users
on conflict (id) do nothing;

create or replace function public.tem_acesso()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid()) and papel in ('operador', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid()) and papel = 'admin'
  );
$$;


-- ---------------------------------------------------------------------
-- 2. Produtos
-- ---------------------------------------------------------------------
create sequence public.produtos_codigo_seq;

create table public.produtos (
  id                  uuid primary key default gen_random_uuid(),
  codigo_interno      text not null,
  codigo_barras       text,
  nome                text not null check (length(trim(nome)) > 0),
  categoria           text not null default 'defensivo'
                      check (categoria in ('defensivo', 'fertilizante', 'adjuvante', 'semente', 'outro')),
  unidade             text not null
                      check (unidade in ('L', 'ml', 'kg', 'g', 't', 'sc', 'un', 'cx', 'gl')),
  conteudo_embalagem  numeric(14, 3) check (conteudo_embalagem is null or conteudo_embalagem > 0),
  fabricante          text,
  observacao          text,
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  criado_por          uuid default auth.uid() references auth.users (id) on delete set null,
  constraint produtos_codigo_interno_unico unique (codigo_interno)
);

create unique index produtos_codigo_barras_unico
  on public.produtos (codigo_barras) where codigo_barras is not null;

comment on column public.produtos.unidade is 'Unidade técnica do saldo: L, ml, kg, g, t, sc (saco), un, cx, gl (galão).';
comment on column public.produtos.conteudo_embalagem is 'Quantidade (na unidade do produto) contida em uma embalagem. Ex.: galão de 20 L = 20.';

-- Padroniza textos e gera código interno automático (P0001, P0002...)
create or replace function public.produtos_normalizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nome           := trim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.codigo_interno := upper(trim(coalesce(new.codigo_interno, '')));
  new.codigo_barras  := nullif(regexp_replace(coalesce(new.codigo_barras, ''), '\s', '', 'g'), '');
  new.fabricante     := nullif(trim(coalesce(new.fabricante, '')), '');
  new.observacao     := nullif(trim(coalesce(new.observacao, '')), '');

  if new.codigo_interno = '' then
    loop
      new.codigo_interno := 'P' || lpad(nextval('public.produtos_codigo_seq')::text, 4, '0');
      exit when not exists (
        select 1 from public.produtos where codigo_interno = new.codigo_interno and id <> new.id
      );
    end loop;
  end if;

  if tg_op = 'INSERT' then
    new.criado_em  := now();
    new.criado_por := auth.uid();
  else
    new.criado_em  := old.criado_em;
    new.criado_por := old.criado_por;
  end if;
  return new;
end;
$$;

create trigger produtos_normalizar
  before insert or update on public.produtos
  for each row execute function public.produtos_normalizar();


-- ---------------------------------------------------------------------
-- 3. Lotes (produto + lote + validade real em data)
-- ---------------------------------------------------------------------
create table public.lotes (
  id          uuid primary key default gen_random_uuid(),
  produto_id  uuid not null references public.produtos (id),
  lote        text not null default '',
  validade    date,
  criado_em   timestamptz not null default now(),
  constraint lotes_unicos unique nulls not distinct (produto_id, lote, validade)
);

create index lotes_produto_idx on public.lotes (produto_id);
create index lotes_validade_idx on public.lotes (validade);

create or replace function public.lotes_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.lote := upper(trim(coalesce(new.lote, '')));
  if tg_op = 'UPDATE' then
    new.produto_id := old.produto_id;   -- um lote nunca muda de produto
    new.criado_em  := old.criado_em;
  end if;
  return new;
end;
$$;

create trigger lotes_normalizar
  before insert or update on public.lotes
  for each row execute function public.lotes_normalizar();


-- ---------------------------------------------------------------------
-- 4. Movimentações (histórico imutável)
-- ---------------------------------------------------------------------
create table public.movimentacoes (
  id             bigint generated always as identity primary key,
  criado_em      timestamptz not null default now(),
  tipo           text not null check (tipo in ('ENTRADA', 'SAIDA', 'CORRECAO')),
  lote_id        uuid not null references public.lotes (id),
  produto_id     uuid not null references public.produtos (id),
  quantidade     numeric(14, 3) not null,
  delta          numeric(14, 3) generated always as (
                   case when tipo = 'SAIDA' then -quantidade else quantidade end
                 ) stored,
  documento      text,
  observacao     text,
  referencia_id  bigint references public.movimentacoes (id),
  usuario_id     uuid references auth.users (id) on delete set null,
  usuario_nome   text,
  constraint movimentacoes_quantidade_valida check (
    (tipo in ('ENTRADA', 'SAIDA') and quantidade > 0)
    or (tipo = 'CORRECAO' and quantidade <> 0)
  ),
  constraint movimentacoes_correcao_com_motivo check (
    tipo <> 'CORRECAO' or length(trim(coalesce(observacao, ''))) >= 3
  ),
  constraint movimentacoes_referencia_so_em_correcao check (
    referencia_id is null or tipo = 'CORRECAO'
  )
);

comment on table public.movimentacoes is
  'Histórico somente-inclusão. ENTRADA/SAIDA usam quantidade positiva; CORRECAO usa quantidade com sinal (+ soma, - subtrai).';

create index movimentacoes_lote_idx on public.movimentacoes (lote_id);
create index movimentacoes_produto_idx on public.movimentacoes (produto_id);
create index movimentacoes_data_idx on public.movimentacoes (criado_em desc);
create index movimentacoes_referencia_idx on public.movimentacoes (referencia_id) where referencia_id is not null;

-- Carimba servidor/usuário, valida correções e impede saldo negativo.
create or replace function public.movimentacoes_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produto  uuid;
  v_unidade  text;
  v_saldo    numeric;
  v_novo     numeric;
begin
  select l.produto_id, p.unidade
    into v_produto, v_unidade
  from public.lotes l
  join public.produtos p on p.id = l.produto_id
  where l.id = new.lote_id;

  if v_produto is null then
    raise exception 'Lote não encontrado.';
  end if;

  new.produto_id   := v_produto;
  new.criado_em    := now();
  new.usuario_id   := auth.uid();
  new.usuario_nome := (select nome from public.perfis where id = auth.uid());
  new.documento    := nullif(trim(coalesce(new.documento, '')), '');
  new.observacao   := nullif(trim(coalesce(new.observacao, '')), '');

  if new.referencia_id is not null and not exists (
    select 1 from public.movimentacoes
    where id = new.referencia_id and lote_id = new.lote_id
  ) then
    raise exception 'A correção deve se referir a uma movimentação do mesmo produto/lote.';
  end if;

  -- Serializa lançamentos simultâneos no mesmo lote.
  perform pg_advisory_xact_lock(hashtextextended(new.lote_id::text, 0));

  select coalesce(sum(delta), 0) into v_saldo
  from public.movimentacoes
  where lote_id = new.lote_id;

  v_novo := v_saldo + case when new.tipo = 'SAIDA' then -new.quantidade else new.quantidade end;

  if v_novo < 0 then
    raise exception 'Saldo insuficiente. Disponível neste lote: % %',
      replace(trim_scale(v_saldo)::text, '.', ','), v_unidade
      using errcode = 'P0001', hint = 'SALDO_INSUFICIENTE';
  end if;

  return new;
end;
$$;

create trigger movimentacoes_validar
  before insert on public.movimentacoes
  for each row execute function public.movimentacoes_validar();

-- Bloqueio definitivo: nada altera ou apaga o passado.
create or replace function public.movimentacoes_bloquear_alteracao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'O histórico de movimentações não pode ser alterado nem excluído. Registre uma movimentação de correção.'
    using errcode = 'P0001', hint = 'HISTORICO_IMUTAVEL';
end;
$$;

create trigger movimentacoes_imutaveis
  before update or delete on public.movimentacoes
  for each row execute function public.movimentacoes_bloquear_alteracao();

create trigger movimentacoes_sem_truncate
  before truncate on public.movimentacoes
  for each statement execute function public.movimentacoes_bloquear_alteracao();


-- ---------------------------------------------------------------------
-- 5. Saldo consolidado por lote (recalculado a cada consulta)
-- ---------------------------------------------------------------------
create view public.vw_estoque_lotes
with (security_invoker = true)
as
select
  l.id                                  as lote_id,
  l.produto_id,
  l.lote,
  l.validade,
  l.criado_em,
  coalesce(sum(m.delta), 0)::numeric(14, 3) as saldo,
  max(m.criado_em)                      as ultima_movimentacao
from public.lotes l
left join public.movimentacoes m on m.lote_id = l.id
group by l.id;


-- ---------------------------------------------------------------------
-- 6. Função de entrada (cria o lote se necessário, de forma atômica)
-- ---------------------------------------------------------------------
create or replace function public.registrar_entrada(
  p_produto_id  uuid,
  p_lote        text,
  p_validade    date,
  p_quantidade  numeric,
  p_documento   text default null,
  p_observacao  text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lote_txt text := upper(trim(coalesce(p_lote, '')));
  v_lote_id  uuid;
  v_mov_id   bigint;
begin
  insert into public.lotes (produto_id, lote, validade)
  values (p_produto_id, v_lote_txt, p_validade)
  on conflict on constraint lotes_unicos do nothing;

  select id into v_lote_id
  from public.lotes
  where produto_id = p_produto_id
    and lote = v_lote_txt
    and validade is not distinct from p_validade;

  insert into public.movimentacoes (tipo, lote_id, quantidade, documento, observacao)
  values ('ENTRADA', v_lote_id, p_quantidade, p_documento, p_observacao)
  returning id into v_mov_id;

  return v_mov_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Segurança: Row Level Security + privilégios
-- ---------------------------------------------------------------------
alter table public.perfis        enable row level security;
alter table public.produtos      enable row level security;
alter table public.lotes         enable row level security;
alter table public.movimentacoes enable row level security;

-- Visitantes não autenticados não acessam nada.
revoke all on public.perfis, public.produtos, public.lotes, public.movimentacoes from anon;
revoke all on public.vw_estoque_lotes from anon;
revoke all on sequence public.produtos_codigo_seq from anon;
revoke execute on function public.registrar_entrada(uuid, text, date, numeric, text, text) from public, anon;
grant  execute on function public.registrar_entrada(uuid, text, date, numeric, text, text) to authenticated;

-- Perfis: cada um vê o próprio; admin vê todos e libera/bloqueia os OUTROS
-- (ninguém altera o próprio papel, então não há como se autopromover).
revoke insert, update, delete, truncate on public.perfis from authenticated;
grant update (papel) on public.perfis to authenticated;
create policy "perfis_leitura" on public.perfis
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "perfis_liberacao_admin" on public.perfis
  for update to authenticated
  using ((select public.is_admin()) and id <> (select auth.uid()))
  with check ((select public.is_admin()) and id <> (select auth.uid()));

-- Daqui para baixo, "liberado" = operador ou admin. Contas pendentes não veem nada.

-- Produtos: liberados consultam e cadastram; só admin edita; ninguém exclui (use "ativo").
revoke update, delete, truncate on public.produtos from authenticated;
grant update (codigo_interno, codigo_barras, nome, categoria, unidade,
              conteudo_embalagem, fabricante, observacao, ativo)
  on public.produtos to authenticated;
create policy "produtos_leitura" on public.produtos
  for select to authenticated using ((select public.tem_acesso()));
create policy "produtos_cadastro" on public.produtos
  for insert to authenticated with check ((select public.tem_acesso()));
create policy "produtos_edicao_admin" on public.produtos
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Lotes: liberados consultam e criam; só admin corrige número/validade; ninguém exclui.
revoke update, delete, truncate on public.lotes from authenticated;
grant update (lote, validade) on public.lotes to authenticated;
create policy "lotes_leitura" on public.lotes
  for select to authenticated using ((select public.tem_acesso()));
create policy "lotes_cadastro" on public.lotes
  for insert to authenticated with check ((select public.tem_acesso()));
create policy "lotes_edicao_admin" on public.lotes
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Movimentações: liberados consultam e incluem. NÃO existe política de UPDATE/DELETE.
revoke update, delete, truncate on public.movimentacoes from authenticated;
create policy "movimentacoes_leitura" on public.movimentacoes
  for select to authenticated using ((select public.tem_acesso()));
create policy "movimentacoes_inclusao" on public.movimentacoes
  for insert to authenticated with check ((select public.tem_acesso()));

grant select on public.vw_estoque_lotes to authenticated;
grant usage on sequence public.produtos_codigo_seq to authenticated;


-- ---------------------------------------------------------------------
-- 8. Tempo real (atualiza as telas de todos os aparelhos conectados)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.produtos, public.lotes, public.movimentacoes;


-- ---------------------------------------------------------------------
-- Pronto! O primeiro usuário criado vira administrador automaticamente.
-- Os demais entram como "pendente" e são liberados na tela Usuários.
-- Se precisar promover alguém manualmente:
--   update public.perfis set papel = 'admin' where email = 'pessoa@email.com';
-- ---------------------------------------------------------------------
