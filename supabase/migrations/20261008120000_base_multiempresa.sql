-- =====================================================================
--  PDV por assinatura — base multiempresa (fase 1)
--
--  Princípios (herdados da v1 do galpão e reforçados):
--    * Toda tabela de negócio tem empresa_id e chaves estrangeiras COMPOSTAS
--      (empresa_id, id): nenhuma empresa consegue apontar para dado de outra.
--    * Permissões por empresa e por papel (dono, gerente, caixa, estoquista),
--      aplicadas pelo próprio banco (RLS). Funções auxiliares ficam no schema
--      "app", que não é exposto pela API.
--    * Histórico de movimentações é imutável; erros viram correções.
--    * Saldo materializado por loja/lote (O(1) por lançamento).
--    * Assinatura vencida deixa a retaguarda somente leitura, nunca apaga nada.
-- =====================================================================

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- Versão global do catálogo (sincronização incremental do PDV na fase 2).
create sequence app.versao_seq;


-- ---------------------------------------------------------------------
-- 1. Pessoas e plataforma
-- ---------------------------------------------------------------------
create table public.perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  email      text,
  criado_em  timestamptz not null default now()
);

create or replace function app.criar_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger ao_criar_usuario after insert on auth.users
  for each row execute function app.criar_perfil();

-- Administradores da plataforma (operam por Edge Functions com service role, nunca por RLS).
create table public.plataforma_admins (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  criado_em  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. Planos e assinaturas
-- ---------------------------------------------------------------------
create table public.planos (
  id            text primary key,
  nome          text not null,
  preco_mensal  numeric(10, 2) not null,
  -- limites: {"lojas": 1, "usuarios": 3, "produtos": 2000, "caixas": 2}; ausente = ilimitado
  limites       jsonb not null default '{}'::jsonb,
  -- recursos: {"multiloja": true, "serie": true, "balanca": true, "nfce": false}
  recursos      jsonb not null default '{}'::jsonb,
  publico       boolean not null default true,
  ordem         smallint not null default 0
);

-- Valores INICIAIS para teste: ajuste preços e limites antes do lançamento.
insert into public.planos (id, nome, preco_mensal, limites, recursos, publico, ordem) values
  ('teste',        'Teste grátis (14 dias)', 0,      '{"lojas": 3, "usuarios": 10, "produtos": 20000, "caixas": 6}', '{"multiloja": true, "serie": true, "balanca": true}', false, 0),
  ('essencial',    'Essencial',              79.90,  '{"lojas": 1, "usuarios": 3, "produtos": 2000, "caixas": 2}',   '{"multiloja": false, "serie": true, "balanca": true}', true, 1),
  ('profissional', 'Profissional',           149.90, '{"lojas": 3, "usuarios": 10, "produtos": 20000, "caixas": 6}', '{"multiloja": true, "serie": true, "balanca": true}', true, 2),
  ('rede',         'Rede',                   299.90, '{"lojas": 10, "usuarios": 50, "caixas": 30}',                  '{"multiloja": true, "serie": true, "balanca": true}', true, 3),
  ('cortesia',     'Cortesia',               0,      '{}',                                                         '{"multiloja": true, "serie": true, "balanca": true}', false, 9);


-- ---------------------------------------------------------------------
-- 3. Empresas, lojas, membros e convites
-- ---------------------------------------------------------------------
create table public.empresas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) > 0),
  razao_social  text,
  documento     text,                      -- CNPJ ou CPF (só dígitos)
  segmento      text not null check (segmento in ('galpao', 'eletronicos', 'mercadinho', 'outro')),
  config        jsonb not null default '{}'::jsonb,
  fuso          text not null default 'America/Sao_Paulo',
  crt           smallint check (crt in (1, 2, 3, 4)),   -- regime tributário (fase fiscal)
  criado_em     timestamptz not null default now(),
  criado_por    uuid
);

create table public.assinaturas (
  empresa_id             uuid primary key references public.empresas (id) on delete cascade,
  plano_id               text not null references public.planos (id),
  status                 text not null default 'trial' check (status in ('trial', 'ativa', 'cancelada', 'cortesia')),
  trial_ate              timestamptz,
  pago_ate               timestamptz,
  asaas_customer_id      text,
  asaas_subscription_id  text,
  atualizado_em          timestamptz not null default now()
);

create table public.lojas (
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  id                  uuid not null default gen_random_uuid() primary key,
  nome                text not null check (length(trim(nome)) > 0),
  cnpj                text,
  ie                  text,
  endereco            text,
  cod_municipio_ibge  text,
  uf                  char(2),
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  unique (empresa_id, id)
);

create table public.membros (
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  usuario_id  uuid not null references auth.users (id) on delete cascade,
  papel       text not null check (papel in ('dono', 'gerente', 'caixa', 'estoquista')),
  lojas       uuid[],                       -- null = todas as lojas da empresa
  ativo       boolean not null default true,
  nome        text,
  criado_em   timestamptz not null default now(),
  primary key (empresa_id, usuario_id)
);
create index membros_usuario_idx on public.membros (usuario_id) include (empresa_id, papel, ativo, lojas);

create table public.convites (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  email        text,                        -- null = qualquer pessoa com o link (uso único)
  papel        text not null check (papel in ('gerente', 'caixa', 'estoquista')),
  lojas        uuid[],
  token_hash   text not null unique,
  expira_em    timestamptz not null,
  aceito_em    timestamptz,
  aceito_por   uuid,
  cancelado_em timestamptz,
  criado_por   uuid,
  criado_em    timestamptz not null default now()
);
create index convites_empresa_idx on public.convites (empresa_id);

-- Numeradores por empresa (ex.: código interno P0001 de cada empresa começa do 1).
create table public.contadores (
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  chave       text not null,
  valor       bigint not null default 0,
  primary key (empresa_id, chave)
);


-- ---------------------------------------------------------------------
-- 4. Funções de permissão (schema app, fora da API)
-- ---------------------------------------------------------------------
-- Devolvem conjuntos: as políticas usam "coluna in (select app.funcao())", que o
-- PostgreSQL avalia uma única vez por consulta (subplano), não linha a linha.
create or replace function app.minhas_empresas()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select empresa_id
  from public.membros where usuario_id = (select auth.uid()) and ativo;
$$;

create or replace function app.empresas_com_papel(papeis text[])
returns setof uuid language sql stable security definer set search_path = '' as $$
  select empresa_id
  from public.membros where usuario_id = (select auth.uid()) and ativo and papel = any (papeis);
$$;

create or replace function app.minhas_lojas()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select l.id
  from public.membros m
  join public.lojas l on l.empresa_id = m.empresa_id
  where m.usuario_id = (select auth.uid()) and m.ativo and (m.lojas is null or l.id = any (m.lojas));
$$;

-- Situação da empresa derivada das datas (não depende de rotina agendada):
-- ativa → atrasada (até 7 dias, só aviso) → somente_leitura (8 a 20) → suspensa (21+).
create or replace function app.estado_empresa(p_empresa uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when a.status = 'cortesia' then 'ativa'
    when a.status = 'cancelada' then 'cancelada'
    when greatest(a.trial_ate, a.pago_ate) is null then 'suspensa'
    when now() <= greatest(a.trial_ate, a.pago_ate) then 'ativa'
    when now() <= greatest(a.trial_ate, a.pago_ate) + interval '7 days' then 'atrasada'
    when now() <= greatest(a.trial_ate, a.pago_ate) + interval '20 days' then 'somente_leitura'
    else 'suspensa'
  end
  from public.assinaturas a where a.empresa_id = p_empresa;
$$;

-- Empresas em que o usuário pode GRAVAR (membro ativo e assinatura em dia ou em carência).
create or replace function app.empresas_gravaveis()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.empresa_id
  from public.membros m
  where m.usuario_id = (select auth.uid()) and m.ativo
    and app.estado_empresa(m.empresa_id) in ('ativa', 'atrasada');
$$;

create or replace function app.proximo_numero(p_empresa uuid, p_chave text)
returns bigint language sql volatile security definer set search_path = '' as $$
  insert into public.contadores (empresa_id, chave, valor) values (p_empresa, p_chave, 1)
  on conflict (empresa_id, chave) do update set valor = public.contadores.valor + 1
  returning valor;
$$;

-- Limites do plano (lojas, usuários, produtos) verificados no próprio banco.
create or replace function app.verificar_limite(p_empresa uuid, p_recurso text, p_atual bigint)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_limite bigint;
  v_plano  text;
begin
  select (p.limites ->> p_recurso)::bigint, p.nome into v_limite, v_plano
  from public.assinaturas a join public.planos p on p.id = a.plano_id
  where a.empresa_id = p_empresa;
  if v_limite is not null and p_atual >= v_limite then
    raise exception 'Limite do plano % atingido: no máximo % %.', v_plano, v_limite, p_recurso
      using errcode = 'P0001', hint = 'LIMITE_PLANO';
  end if;
end $$;

-- Código de barras canônico: numéricos de 8, 12, 13 ou 14 dígitos viram GTIN-14.
create or replace function app.canonizar_codigo(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when regexp_replace(p, '\s', '', 'g') ~ '^(\d{8}|\d{12,14})$' then lpad(regexp_replace(p, '\s', '', 'g'), 14, '0')
    else upper(regexp_replace(p, '\s', '', 'g'))
  end;
$$;

-- Bloqueio de alteração do histórico; única exceção: expurgo de empresa feito pela plataforma.
create or replace function app.bloquear_alteracao()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'UPDATE') and current_user = 'postgres'
     and coalesce(current_setting('app.expurgo', true), '') = old.empresa_id::text then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'O histórico não pode ser alterado nem excluído. Registre uma correção.'
    using errcode = 'P0001', hint = 'HISTORICO_IMUTAVEL';
end $$;

create or replace function app.bloquear_truncate()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'O histórico não pode ser apagado.' using errcode = 'P0001', hint = 'HISTORICO_IMUTAVEL';
end $$;


-- ---------------------------------------------------------------------
-- 5. Catálogo
-- ---------------------------------------------------------------------
create table public.categorias (
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  id          uuid not null default gen_random_uuid() primary key,
  nome        text not null check (length(trim(nome)) > 0),
  pai_id      uuid,
  versao      bigint not null default nextval('app.versao_seq'),
  criado_em   timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, pai_id) references public.categorias (empresa_id, id)
);
create unique index categorias_nome_unico on public.categorias (empresa_id, lower(nome));

create table public.produtos (
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  id                  uuid not null default gen_random_uuid() primary key,
  codigo_interno      text not null,
  nome                text not null check (length(trim(nome)) > 0),
  categoria_id        uuid,
  unidade             text not null check (unidade in ('un', 'L', 'ml', 'kg', 'g', 't', 'sc', 'cx', 'gl', 'm', 'pc', 'par', 'kit')),
  conteudo_embalagem  numeric(14, 3) check (conteudo_embalagem is null or conteudo_embalagem > 0),
  preco_venda         numeric(14, 2) check (preco_venda is null or preco_venda >= 0),
  custo_ultimo        numeric(14, 4) check (custo_ultimo is null or custo_ultimo >= 0),
  rastreio            text not null default 'nenhum' check (rastreio in ('nenhum', 'lote', 'serie')),
  pesavel             boolean not null default false,
  codigo_balanca      text,                 -- PLU usado na etiqueta da balança
  garantia_meses      smallint check (garantia_meses is null or garantia_meses >= 0),
  fabricante          text,
  observacao          text,
  ativo               boolean not null default true,
  -- Dados fiscais (usados na fase da NFC-e/NF-e; opcionais por enquanto)
  ncm                 text,
  cest                text,
  cfop                text,
  origem              smallint check (origem between 0 and 8),
  cst_csosn           text,
  unidade_tributavel  text,
  cclass_trib         text,
  versao              bigint not null default nextval('app.versao_seq'),
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  atualizado_em       timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, codigo_interno),
  foreign key (empresa_id, categoria_id) references public.categorias (empresa_id, id)
);
create index produtos_empresa_nome_idx on public.produtos (empresa_id, nome);
create index produtos_empresa_versao_idx on public.produtos (empresa_id, versao);
create unique index produtos_balanca_unico on public.produtos (empresa_id, codigo_balanca) where codigo_balanca is not null;

create table public.produtos_codigos (
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  id          uuid not null default gen_random_uuid() primary key,
  produto_id  uuid not null,
  codigo      text not null check (length(codigo) > 0),
  tipo        text not null default 'ean' check (tipo in ('ean', 'dun', 'interno', 'outro')),
  fator       numeric(14, 3) not null default 1 check (fator > 0),   -- ex.: caixa com 12 = 12
  versao      bigint not null default nextval('app.versao_seq'),
  criado_em   timestamptz not null default now(),
  unique (empresa_id, codigo),
  foreign key (empresa_id, produto_id) references public.produtos (empresa_id, id) on delete cascade
);
create index produtos_codigos_produto_idx on public.produtos_codigos (empresa_id, produto_id);

create table public.lotes (
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  id          uuid not null default gen_random_uuid() primary key,
  produto_id  uuid not null,
  lote        text not null default '',
  validade    date,
  versao      bigint not null default nextval('app.versao_seq'),
  criado_em   timestamptz not null default now(),
  unique (empresa_id, id),
  constraint lotes_unicos unique nulls not distinct (empresa_id, produto_id, lote, validade),
  foreign key (empresa_id, produto_id) references public.produtos (empresa_id, id)
);
create index lotes_produto_idx on public.lotes (empresa_id, produto_id);


-- ---------------------------------------------------------------------
-- 6. Estoque: razão imutável + saldo materializado por loja/lote
-- ---------------------------------------------------------------------
create table public.movimentacoes (
  empresa_id        uuid not null references public.empresas (id) on delete cascade,
  id                bigint generated always as identity primary key,
  loja_id           uuid not null,
  lote_id           uuid not null,
  produto_id        uuid not null,
  tipo              text not null check (tipo in (
                      'ENTRADA', 'SAIDA', 'AJUSTE', 'CORRECAO',
                      'VENDA', 'CANCELAMENTO_VENDA', 'DEVOLUCAO', 'TRANSF_SAIDA', 'TRANSF_ENTRADA')),
  quantidade        numeric(14, 3) not null,
  delta             numeric(14, 3) generated always as (
                      case when tipo in ('SAIDA', 'VENDA', 'TRANSF_SAIDA') then -quantidade else quantidade end
                    ) stored,
  documento         text,
  observacao        text,
  referencia_id     bigint references public.movimentacoes (id),
  origem            text not null default 'manual' check (origem in ('manual', 'pdv', 'sistema')),
  origem_id         uuid unique,            -- chave anti-duplicidade (reenvio offline)
  ocorrido_em       timestamptz not null default now(),
  registrado_em     timestamptz not null default now(),
  usuario_id        uuid,                   -- sem FK: o histórico sobrevive à exclusão do usuário
  usuario_nome      text,
  dispositivo_id    text,
  venda_item_id     uuid,                   -- fase 2 (PDV)
  serie_id          uuid,                   -- fase eletrônicos
  transferencia_id  uuid,
  constraint movimentacoes_quantidade_valida check (
    (tipo in ('AJUSTE', 'CORRECAO') and quantidade <> 0) or (tipo not in ('AJUSTE', 'CORRECAO') and quantidade > 0)
  ),
  constraint movimentacoes_ajuste_com_motivo check (
    tipo not in ('AJUSTE', 'CORRECAO') or length(trim(coalesce(observacao, ''))) >= 3
  ),
  constraint movimentacoes_referencia_so_em_correcao check (referencia_id is null or tipo = 'CORRECAO'),
  foreign key (empresa_id, loja_id) references public.lojas (empresa_id, id),
  foreign key (empresa_id, lote_id) references public.lotes (empresa_id, id),
  foreign key (empresa_id, produto_id) references public.produtos (empresa_id, id)
);
create index movimentacoes_empresa_data_idx on public.movimentacoes (empresa_id, registrado_em desc);
create index movimentacoes_loja_lote_idx on public.movimentacoes (loja_id, lote_id);
create index movimentacoes_produto_idx on public.movimentacoes (empresa_id, produto_id, registrado_em desc);
create index movimentacoes_referencia_idx on public.movimentacoes (referencia_id) where referencia_id is not null;

create table public.estoque_saldos (
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  loja_id        uuid not null,
  lote_id        uuid not null,
  produto_id     uuid not null,
  saldo          numeric(14, 3) not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (loja_id, lote_id),
  foreign key (empresa_id, loja_id) references public.lojas (empresa_id, id),
  foreign key (empresa_id, lote_id) references public.lotes (empresa_id, id),
  foreign key (empresa_id, produto_id) references public.produtos (empresa_id, id)
);
create index estoque_saldos_empresa_idx on public.estoque_saldos (empresa_id, produto_id);


-- ---------------------------------------------------------------------
-- 7. Gatilhos de normalização e regras
-- ---------------------------------------------------------------------
create or replace function app.produtos_normalizar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome           := trim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.codigo_interno := upper(trim(coalesce(new.codigo_interno, '')));
  new.fabricante     := nullif(trim(coalesce(new.fabricante, '')), '');
  new.observacao     := nullif(trim(coalesce(new.observacao, '')), '');
  new.codigo_balanca := nullif(trim(coalesce(new.codigo_balanca, '')), '');
  if tg_op = 'INSERT' then
    perform app.verificar_limite(new.empresa_id, 'produtos', (select count(*) from public.produtos where empresa_id = new.empresa_id));
    if new.codigo_interno = '' then
      loop
        new.codigo_interno := 'P' || lpad(app.proximo_numero(new.empresa_id, 'produto')::text, 4, '0');
        exit when not exists (select 1 from public.produtos where empresa_id = new.empresa_id and codigo_interno = new.codigo_interno);
      end loop;
    end if;
    new.criado_em  := now();
    new.criado_por := auth.uid();
  else
    if new.codigo_interno = '' then new.codigo_interno := old.codigo_interno; end if;
    new.empresa_id := old.empresa_id;
    new.criado_em  := old.criado_em;
    new.criado_por := old.criado_por;
  end if;
  new.versao := nextval('app.versao_seq');
  new.atualizado_em := now();
  return new;
end $$;
create trigger produtos_normalizar before insert or update on public.produtos
  for each row execute function app.produtos_normalizar();

create or replace function app.codigos_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.codigo := app.canonizar_codigo(new.codigo);
  if tg_op = 'UPDATE' then new.empresa_id := old.empresa_id; new.produto_id := old.produto_id; end if;
  new.versao := nextval('app.versao_seq');
  return new;
end $$;
create trigger codigos_normalizar before insert or update on public.produtos_codigos
  for each row execute function app.codigos_normalizar();

create or replace function app.categorias_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.nome := trim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' then new.empresa_id := old.empresa_id; end if;
  new.versao := nextval('app.versao_seq');
  return new;
end $$;
create trigger categorias_normalizar before insert or update on public.categorias
  for each row execute function app.categorias_normalizar();

create or replace function app.lotes_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.lote := upper(trim(coalesce(new.lote, '')));
  if tg_op = 'UPDATE' then
    new.empresa_id := old.empresa_id;
    new.produto_id := old.produto_id;
    new.criado_em  := old.criado_em;
  end if;
  new.versao := nextval('app.versao_seq');
  return new;
end $$;
create trigger lotes_normalizar before insert or update on public.lotes
  for each row execute function app.lotes_normalizar();

create or replace function app.lojas_validar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome := trim(new.nome);
  if tg_op = 'INSERT' then
    perform app.verificar_limite(new.empresa_id, 'lojas', (select count(*) from public.lojas where empresa_id = new.empresa_id and ativo));
  else
    new.empresa_id := old.empresa_id;
  end if;
  return new;
end $$;
create trigger lojas_validar before insert or update on public.lojas
  for each row execute function app.lojas_validar();

-- A empresa nunca fica sem dono (exceto no expurgo feito pela plataforma).
create or replace function app.membros_proteger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.expurgo', true), '') = old.empresa_id::text then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.papel = 'dono' and old.ativo
     and (tg_op = 'DELETE' or new.papel <> 'dono' or not new.ativo)
     and not exists (select 1 from public.membros
                     where empresa_id = old.empresa_id and usuario_id <> old.usuario_id and papel = 'dono' and ativo) then
    raise exception 'A empresa precisa de pelo menos um dono. Transfira a propriedade antes.'
      using errcode = 'P0001', hint = 'ULTIMO_DONO';
  end if;
  if tg_op = 'UPDATE' then
    new.empresa_id := old.empresa_id;
    new.usuario_id := old.usuario_id;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger membros_proteger before update or delete on public.membros
  for each row execute function app.membros_proteger();

-- Movimentação: carimbo do servidor, coerência com o lote e regras de correção.
create or replace function app.movimentacoes_antes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select l.produto_id into new.produto_id
  from public.lotes l where l.id = new.lote_id and l.empresa_id = new.empresa_id;
  if new.produto_id is null then
    raise exception 'Lote não encontrado nesta empresa.' using errcode = 'P0001';
  end if;

  new.registrado_em := now();
  new.origem        := coalesce(new.origem, 'manual');
  if new.origem = 'manual' then
    new.ocorrido_em  := now();
    new.usuario_id   := auth.uid();
    new.usuario_nome := (select nome from public.perfis where id = auth.uid());
  elsif new.ocorrido_em is null or new.ocorrido_em > now() + interval '5 minutes' then
    new.ocorrido_em := now();                  -- relógio do aparelho adiantado: usa a hora do servidor
  end if;
  new.documento  := nullif(trim(coalesce(new.documento, '')), '');
  new.observacao := nullif(trim(coalesce(new.observacao, '')), '');

  if new.referencia_id is not null and not exists (
    select 1 from public.movimentacoes
    where id = new.referencia_id and lote_id = new.lote_id and loja_id = new.loja_id
  ) then
    raise exception 'A correção deve se referir a uma movimentação do mesmo produto, lote e loja.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger movimentacoes_antes before insert on public.movimentacoes
  for each row execute function app.movimentacoes_antes();

-- Saldo materializado: o upsert trava só a linha daquela loja/lote (sem somar o histórico).
-- Lançamentos manuais não podem deixar saldo negativo; vendas do PDV (offline) são aceitas
-- e viram divergência para conferência (fase 2).
create or replace function app.movimentacoes_saldo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_saldo   numeric;
  v_unidade text;
begin
  insert into public.estoque_saldos (empresa_id, loja_id, lote_id, produto_id, saldo, atualizado_em)
  values (new.empresa_id, new.loja_id, new.lote_id, new.produto_id, new.delta, new.registrado_em)
  on conflict (loja_id, lote_id) do update
    set saldo = public.estoque_saldos.saldo + excluded.saldo, atualizado_em = excluded.atualizado_em
  returning saldo into v_saldo;

  if v_saldo < 0 and new.origem = 'manual' then
    select unidade into v_unidade from public.produtos where id = new.produto_id;
    raise exception 'Saldo insuficiente. Disponível neste lote: % %',
      replace(trim_scale(v_saldo - new.delta)::text, '.', ','), v_unidade
      using errcode = 'P0001', hint = 'SALDO_INSUFICIENTE';
  end if;
  return null;
end $$;
create trigger movimentacoes_saldo after insert on public.movimentacoes
  for each row execute function app.movimentacoes_saldo();

create trigger movimentacoes_imutaveis before update or delete on public.movimentacoes
  for each row execute function app.bloquear_alteracao();
create trigger movimentacoes_sem_truncate before truncate on public.movimentacoes
  for each statement execute function app.bloquear_truncate();

-- Confere o saldo materializado com a soma do histórico (rotina noturna; só alerta).
create or replace function app.verificar_saldos(p_empresa uuid default null)
returns table (loja_id uuid, lote_id uuid, saldo_tabela numeric, saldo_historico numeric)
language sql stable security definer set search_path = '' as $$
  with historico as (
    select m.loja_id, m.lote_id, sum(m.delta) as total
    from public.movimentacoes m
    where p_empresa is null or m.empresa_id = p_empresa
    group by m.loja_id, m.lote_id
  )
  select coalesce(s.loja_id, h.loja_id), coalesce(s.lote_id, h.lote_id), coalesce(s.saldo, 0), coalesce(h.total, 0)
  from public.estoque_saldos s
  full join historico h on h.loja_id = s.loja_id and h.lote_id = s.lote_id
  where (p_empresa is null or coalesce(s.empresa_id, p_empresa) = p_empresa)
    and coalesce(s.saldo, 0) <> coalesce(h.total, 0);
$$;


-- ---------------------------------------------------------------------
-- 8. Visões
-- ---------------------------------------------------------------------
create view public.vw_estoque
with (security_invoker = true) as
select s.empresa_id, s.loja_id, s.lote_id, s.produto_id, l.lote, l.validade, s.saldo, s.atualizado_em as ultima_movimentacao
from public.estoque_saldos s
join public.lotes l on l.id = s.lote_id;


-- ---------------------------------------------------------------------
-- 9. Funções chamadas pelo app (RPC)
-- ---------------------------------------------------------------------
create or replace function app.seed_segmento(p_empresa uuid, p_segmento text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_nomes text[];
begin
  v_nomes := case p_segmento
    when 'galpao'      then array['Defensivo agrícola', 'Fertilizante', 'Adjuvante', 'Semente', 'Outro']
    when 'eletronicos' then array['Celulares', 'Acessórios', 'Informática', 'Áudio e vídeo', 'Peças e assistência']
    when 'mercadinho'  then array['Mercearia', 'Bebidas', 'Hortifrúti', 'Padaria', 'Açougue', 'Limpeza', 'Higiene']
    else array['Geral']
  end;
  insert into public.categorias (empresa_id, nome) select p_empresa, unnest(v_nomes);
end $$;

-- Cria empresa, loja principal, vínculo de dono e período de teste, numa só transação.
create or replace function public.criar_empresa(p_nome text, p_segmento text, p_nome_loja text default 'Loja principal')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_empresa uuid;
  v_config  jsonb;
begin
  if v_usuario is null then
    raise exception 'Entre no sistema para criar uma empresa.' using errcode = '42501';
  end if;
  v_config := jsonb_build_object(
    'dias_alerta', 30,
    'venda_sem_estoque', case when p_segmento = 'mercadinho' then 'permitir' else 'avisar' end
  ) || case when p_segmento = 'mercadinho'
            then '{"balanca": {"prefixo": "2", "digitos_codigo": 4, "tipo": "preco"}}'::jsonb
            else '{}'::jsonb end;

  insert into public.empresas (nome, segmento, config, criado_por)
  values (trim(p_nome), p_segmento, v_config, v_usuario)
  returning id into v_empresa;

  insert into public.assinaturas (empresa_id, plano_id, status, trial_ate)
  values (v_empresa, 'teste', 'trial', now() + interval '14 days');

  insert into public.lojas (empresa_id, nome) values (v_empresa, coalesce(nullif(trim(p_nome_loja), ''), 'Loja principal'));

  insert into public.membros (empresa_id, usuario_id, papel, nome)
  values (v_empresa, v_usuario, 'dono', (select nome from public.perfis where id = v_usuario));

  perform app.seed_segmento(v_empresa, p_segmento);
  return v_empresa;
end $$;

-- Convite: devolve o token UMA vez (o banco guarda só o hash). Compartilhável por link/WhatsApp.
create or replace function public.criar_convite(p_empresa uuid, p_papel text, p_email text default null, p_lojas uuid[] default null, p_dias int default 7)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if p_empresa not in (select app.empresas_com_papel(array['dono', 'gerente'])) then
    raise exception 'Somente dono ou gerente podem convidar.' using errcode = '42501';
  end if;
  if p_papel = 'gerente' and p_empresa not in (select app.empresas_com_papel(array['dono'])) then
    raise exception 'Somente o dono pode convidar gerentes.' using errcode = '42501';
  end if;
  if p_empresa not in (select app.empresas_gravaveis()) then
    raise exception 'Assinatura em atraso: regularize para convidar pessoas.' using errcode = '42501';
  end if;
  perform app.verificar_limite(p_empresa, 'usuarios', (
    (select count(*) from public.membros where empresa_id = p_empresa and ativo)
    + (select count(*) from public.convites where empresa_id = p_empresa and aceito_em is null and cancelado_em is null and expira_em > now())
  ));
  insert into public.convites (empresa_id, email, papel, lojas, token_hash, expira_em, criado_por)
  values (p_empresa, nullif(lower(trim(p_email)), ''), p_papel, p_lojas,
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + make_interval(days => greatest(1, least(p_dias, 30))), auth.uid());
  return v_token;
end $$;

create or replace function public.aceitar_convite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c public.convites;
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'Entre no sistema para aceitar o convite.' using errcode = '42501';
  end if;
  select * into c from public.convites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or c.cancelado_em is not null or c.aceito_em is not null then
    raise exception 'Convite inválido ou já utilizado.' using errcode = 'P0001';
  end if;
  if c.expira_em < now() then
    raise exception 'Convite expirado. Peça um novo convite.' using errcode = 'P0001';
  end if;
  if c.email is not null and c.email <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = 'P0001';
  end if;
  insert into public.membros (empresa_id, usuario_id, papel, lojas, nome)
  values (c.empresa_id, v_usuario, c.papel, c.lojas, (select nome from public.perfis where id = v_usuario))
  on conflict (empresa_id, usuario_id) do update set papel = excluded.papel, lojas = excluded.lojas, ativo = true;
  update public.convites set aceito_em = now(), aceito_por = v_usuario where id = c.id;
  return c.empresa_id;
end $$;

create or replace function public.cancelar_convite(p_convite uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.convites set cancelado_em = now()
  where id = p_convite and aceito_em is null and cancelado_em is null
    and empresa_id in (select app.empresas_com_papel(array['dono', 'gerente']));
  if not found then
    raise exception 'Convite não encontrado ou sem permissão.' using errcode = 'P0001';
  end if;
end $$;

-- Entrada: cria o lote se preciso. Idempotente quando o app envia p_origem_id (reenvio seguro).
create or replace function public.registrar_entrada(
  p_loja_id uuid, p_produto_id uuid, p_lote text, p_validade date, p_quantidade numeric,
  p_documento text default null, p_observacao text default null, p_origem_id uuid default null)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  v_empresa uuid;
  v_lote    text := upper(trim(coalesce(p_lote, '')));
  v_lote_id uuid;
  v_mov     bigint;
begin
  if p_origem_id is not null then
    select id into v_mov from public.movimentacoes where origem_id = p_origem_id;
    if found then return v_mov; end if;
  end if;
  select empresa_id into v_empresa from public.produtos where id = p_produto_id;
  if v_empresa is null then
    raise exception 'Produto não encontrado.' using errcode = 'P0001';
  end if;
  insert into public.lotes (empresa_id, produto_id, lote, validade)
  values (v_empresa, p_produto_id, v_lote, p_validade)
  on conflict on constraint lotes_unicos do nothing;
  select id into v_lote_id from public.lotes
  where empresa_id = v_empresa and produto_id = p_produto_id and lote = v_lote and validade is not distinct from p_validade;

  insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, documento, observacao, origem_id)
  values (v_empresa, p_loja_id, v_lote_id, 'ENTRADA', p_quantidade, p_documento, p_observacao, p_origem_id)
  returning id into v_mov;
  return v_mov;
end $$;

-- Expurgo de empresa cancelada (somente plataforma, com service role). Irreversível.
create or replace function app.expurgar_empresa(p_empresa uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.expurgo', p_empresa::text, true);
  delete from public.movimentacoes where empresa_id = p_empresa;
  delete from public.estoque_saldos where empresa_id = p_empresa;
  delete from public.empresas where id = p_empresa;
  perform set_config('app.expurgo', '', true);
end $$;


-- ---------------------------------------------------------------------
-- 10. Segurança: RLS e privilégios
-- ---------------------------------------------------------------------
alter table public.perfis            enable row level security;
alter table public.plataforma_admins enable row level security;
alter table public.planos            enable row level security;
alter table public.empresas          enable row level security;
alter table public.assinaturas       enable row level security;
alter table public.lojas             enable row level security;
alter table public.membros           enable row level security;
alter table public.convites          enable row level security;
alter table public.contadores        enable row level security;
alter table public.categorias        enable row level security;
alter table public.produtos          enable row level security;
alter table public.produtos_codigos  enable row level security;
alter table public.lotes             enable row level security;
alter table public.movimentacoes     enable row level security;
alter table public.estoque_saldos    enable row level security;

-- Visitantes sem login não acessam nada; usuários só gravam o que for liberado abaixo.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;
grant execute on function public.criar_empresa(text, text, text),
                          public.criar_convite(uuid, text, text, uuid[], int),
                          public.aceitar_convite(text),
                          public.cancelar_convite(uuid),
                          public.registrar_entrada(uuid, uuid, text, date, numeric, text, text, uuid)
  to authenticated;
grant usage on sequence app.versao_seq to authenticated;
revoke execute on function app.expurgar_empresa(uuid) from authenticated;

-- Perfis: cada um vê o próprio e os colegas das suas empresas; edita só o próprio nome.
grant update (nome) on public.perfis to authenticated;
create policy perfis_leitura on public.perfis for select to authenticated using (
  id = (select auth.uid())
  or id in (select usuario_id from public.membros where empresa_id in (select app.minhas_empresas()))
);
create policy perfis_edicao on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Planos: catálogo público para usuários logados.
create policy planos_leitura on public.planos for select to authenticated using (publico);

-- Empresas e assinaturas: membros leem; só o dono edita os dados da empresa.
grant update (nome, razao_social, documento, config, fuso) on public.empresas to authenticated;
create policy empresas_leitura on public.empresas for select to authenticated
  using (id in (select app.minhas_empresas()));
create policy empresas_edicao on public.empresas for update to authenticated
  using (id in (select app.empresas_com_papel(array['dono'])))
  with check (id in (select app.empresas_com_papel(array['dono'])));
create policy assinaturas_leitura on public.assinaturas for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));

-- Lojas: membros veem as lojas da empresa; dono cria e edita (respeitando o plano).
grant insert on public.lojas to authenticated;
grant update (nome, cnpj, ie, endereco, cod_municipio_ibge, uf, ativo) on public.lojas to authenticated;
create policy lojas_leitura on public.lojas for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy lojas_cadastro on public.lojas for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono'])) and empresa_id in (select app.empresas_gravaveis()));
create policy lojas_edicao on public.lojas for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono'])))
  with check (empresa_id in (select app.empresas_com_papel(array['dono'])) and empresa_id in (select app.empresas_gravaveis()));

-- Membros: todos veem a equipe; só o dono altera ou remove OUTRAS pessoas.
grant update (papel, lojas, ativo) on public.membros to authenticated;
grant delete on public.membros to authenticated;
create policy membros_leitura on public.membros for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy membros_edicao on public.membros for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono'])) and usuario_id <> (select auth.uid()))
  with check (empresa_id in (select app.empresas_com_papel(array['dono'])) and usuario_id <> (select auth.uid()));
create policy membros_remocao on public.membros for delete to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono'])) and usuario_id <> (select auth.uid()));

-- Convites: dono e gerente consultam (sem ver o hash do token); criação/aceite só por RPC.
revoke select on public.convites from authenticated;
grant select (id, empresa_id, email, papel, lojas, expira_em, aceito_em, aceito_por, cancelado_em, criado_por, criado_em)
  on public.convites to authenticated;
create policy convites_leitura on public.convites for select to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente'])));

-- Catálogo: toda a equipe consulta; dono, gerente e estoquista cadastram e editam.
grant insert, delete on public.categorias to authenticated;
grant update (nome, pai_id) on public.categorias to authenticated;
grant insert on public.produtos to authenticated;
grant update (codigo_interno, nome, categoria_id, unidade, conteudo_embalagem, preco_venda, custo_ultimo, rastreio, pesavel,
              codigo_balanca, garantia_meses, fabricante, observacao, ativo, ncm, cest, cfop, origem, cst_csosn,
              unidade_tributavel, cclass_trib)
  on public.produtos to authenticated;
grant insert, delete on public.produtos_codigos to authenticated;
grant update (codigo, tipo, fator) on public.produtos_codigos to authenticated;
grant insert on public.lotes to authenticated;
grant update (lote, validade) on public.lotes to authenticated;

create policy categorias_leitura on public.categorias for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy produtos_leitura on public.produtos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy codigos_leitura on public.produtos_codigos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy lotes_leitura on public.lotes for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));

create policy categorias_gravacao on public.categorias for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista'])) and empresa_id in (select app.empresas_gravaveis()));
create policy categorias_edicao on public.categorias for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente'])))
  with check (empresa_id in (select app.empresas_gravaveis()));
create policy categorias_remocao on public.categorias for delete to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente'])) and empresa_id in (select app.empresas_gravaveis()));

create policy produtos_cadastro on public.produtos for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista'])) and empresa_id in (select app.empresas_gravaveis()));
create policy produtos_edicao on public.produtos for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista'])))
  with check (empresa_id in (select app.empresas_gravaveis()));

create policy codigos_cadastro on public.produtos_codigos for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista'])) and empresa_id in (select app.empresas_gravaveis()));
create policy codigos_edicao on public.produtos_codigos for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista'])))
  with check (empresa_id in (select app.empresas_gravaveis()));
create policy codigos_remocao on public.produtos_codigos for delete to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista'])) and empresa_id in (select app.empresas_gravaveis()));

create policy lotes_cadastro on public.lotes for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista'])) and empresa_id in (select app.empresas_gravaveis()));
create policy lotes_edicao on public.lotes for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente'])))
  with check (empresa_id in (select app.empresas_gravaveis()));

-- Estoque: cada um vê só as lojas a que tem acesso. Saldo é escrito apenas pelo gatilho.
create policy saldos_leitura on public.estoque_saldos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
create policy movimentacoes_leitura on public.movimentacoes for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));

-- Lançamentos manuais (entrada, saída, ajuste, correção): sem UPDATE/DELETE, nunca.
-- Lançamentos do PDV só entram pela função de sincronização (fase 2).
grant insert on public.movimentacoes to authenticated;
create policy movimentacoes_inclusao on public.movimentacoes for insert to authenticated with check (
  empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista']))
  and empresa_id in (select app.empresas_gravaveis())
  and loja_id in (select app.minhas_lojas())
  and origem = 'manual'
  and tipo in ('ENTRADA', 'SAIDA', 'AJUSTE', 'CORRECAO')
);

grant select on public.vw_estoque to authenticated;


-- ---------------------------------------------------------------------
-- 11. Tempo real
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.produtos, public.lotes, public.estoque_saldos;
