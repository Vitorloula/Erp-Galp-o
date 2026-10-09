-- =====================================================================
--  Fase 2 — PDV (frente de caixa) offline-first
--
--  Princípios:
--    * O caixa vende sem internet. Tudo o que acontece nele (abrir/fechar
--      sessão, sangria, suprimento, venda, cancelamento) vira um EVENTO com
--      id gerado no aparelho, enviado depois por pdv_sincronizar().
--    * Reenviar o mesmo evento não duplica nada (idempotência pelo id).
--    * Venda feita offline já aconteceu: o servidor só recusa evento
--      malformado ou sem permissão. Saldo negativo, número repetido e
--      relógio adiantado viram DIVERGÊNCIAS para conferência, não recusas.
--    * Vendas, itens, pagamentos e fechamentos são imutáveis; cancelamento
--      gera estorno no razão, com motivo e quem autorizou.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Ajustes no catálogo
-- ---------------------------------------------------------------------
-- Serviços e "Diversos" (venda de item sem cadastro) não movimentam estoque.
alter table public.produtos add column controla_estoque boolean not null default true;
grant update (controla_estoque) on public.produtos to authenticated;

-- Mudança nos códigos de barras marca o produto como alterado (sincronização incremental do PDV).
create or replace function app.codigos_marcar_produto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.produtos set atualizado_em = now()
  where id = coalesce(new.produto_id, old.produto_id) and atualizado_em < now();
  return null;
end $$;
create trigger codigos_marcar_produto after insert or update or delete on public.produtos_codigos
  for each row execute function app.codigos_marcar_produto();
create index produtos_empresa_atualizado_idx on public.produtos (empresa_id, atualizado_em);
create index estoque_saldos_loja_atualizado_idx on public.estoque_saldos (loja_id, atualizado_em);

-- Mercadinho já nasce com o produto "Diversos" (item sem cadastro, preço digitado no caixa).
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
  if p_segmento in ('mercadinho', 'outro') then
    insert into public.produtos (empresa_id, codigo_interno, nome, unidade, controla_estoque, rastreio)
    values (p_empresa, 'DIVERSOS', 'Diversos', 'un', false, 'nenhum');
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. Caixas e sessões
-- ---------------------------------------------------------------------
create table public.caixas (
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  id              uuid not null default gen_random_uuid() primary key,
  loja_id         uuid not null,
  numero          smallint not null check (numero between 1 and 999),   -- vira a série da NFC-e
  nome            text not null check (length(trim(nome)) > 0),
  ativo           boolean not null default true,
  dispositivo_id  text,                    -- aparelho que está usando o caixa
  dispositivo_em  timestamptz,
  ultimo_numero   bigint not null default 0,   -- maior número de venda recebido
  criado_em       timestamptz not null default now(),
  unique (empresa_id, id),
  unique (loja_id, numero),
  foreign key (empresa_id, loja_id) references public.lojas (empresa_id, id)
);

create or replace function app.caixas_validar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome := trim(new.nome);
  if tg_op = 'INSERT' then
    perform app.verificar_limite(new.empresa_id, 'caixas', (select count(*) from public.caixas where empresa_id = new.empresa_id and ativo));
    if new.numero is null then
      new.numero := coalesce((select max(numero) from public.caixas where loja_id = new.loja_id), 0) + 1;
    end if;
    if new.nome is null or new.nome = '' then new.nome := 'Caixa ' || lpad(new.numero::text, 2, '0'); end if;
  else
    new.empresa_id := old.empresa_id;
    new.loja_id    := old.loja_id;
    new.numero     := old.numero;
    new.criado_em  := old.criado_em;
  end if;
  return new;
end $$;
create trigger caixas_validar before insert or update on public.caixas
  for each row execute function app.caixas_validar();

create table public.sessoes_caixa (
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  id              uuid not null primary key,       -- gerado no aparelho
  caixa_id        uuid not null,
  loja_id         uuid not null,
  operador_id     uuid,
  operador_nome   text,
  dispositivo_id  text,
  aberta_em       timestamptz not null,
  valor_abertura  numeric(14, 2) not null default 0 check (valor_abertura >= 0),
  fechada_em      timestamptz,
  registrado_em   timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, caixa_id) references public.caixas (empresa_id, id),
  foreign key (empresa_id, loja_id) references public.lojas (empresa_id, id)
);
create index sessoes_caixa_caixa_idx on public.sessoes_caixa (caixa_id, aberta_em desc);

create table public.sessoes_caixa_movimentos (
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  id             uuid not null primary key,
  sessao_id      uuid not null,
  loja_id        uuid not null,
  tipo           text not null check (tipo in ('sangria', 'suprimento')),
  valor          numeric(14, 2) not null check (valor > 0),
  motivo         text,
  ocorrido_em    timestamptz not null,
  usuario_id     uuid,
  usuario_nome   text,
  registrado_em  timestamptz not null default now(),
  foreign key (empresa_id, sessao_id) references public.sessoes_caixa (empresa_id, id)
);
create index sessoes_movimentos_sessao_idx on public.sessoes_caixa_movimentos (sessao_id);

-- Fechamento às cegas: o operador informa o que contou antes de ver o esperado.
create table public.sessoes_caixa_fechamentos (
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  sessao_id           uuid not null primary key,
  loja_id             uuid not null,
  fechada_em          timestamptz not null,
  contado             jsonb not null,          -- {"01": 523.50, "03": 1200.00, ...} por forma de pagamento
  esperado            jsonb not null,          -- calculado pelo servidor
  diferenca_dinheiro  numeric(14, 2) not null,
  observacao          text,
  usuario_id          uuid,
  usuario_nome        text,
  registrado_em       timestamptz not null default now(),
  foreign key (empresa_id, sessao_id) references public.sessoes_caixa (empresa_id, id)
);


-- ---------------------------------------------------------------------
-- 3. Vendas
-- ---------------------------------------------------------------------
create table public.vendas (
  empresa_id           uuid not null references public.empresas (id) on delete cascade,
  id                   uuid not null primary key,     -- UUIDv7 gerado no aparelho
  loja_id              uuid not null,
  caixa_id             uuid not null,
  sessao_id            uuid not null,
  numero               bigint not null check (numero > 0),   -- por caixa (ex.: 02-000123)
  ocorrido_em          timestamptz not null,
  registrado_em        timestamptz not null default now(),
  operador_id          uuid,
  operador_nome        text,
  dispositivo_id       text,
  subtotal             numeric(14, 2) not null check (subtotal >= 0),
  desconto             numeric(14, 2) not null default 0 check (desconto >= 0),
  total                numeric(14, 2) not null check (total >= 0),
  troco                numeric(14, 2) not null default 0 check (troco >= 0),
  status               text not null default 'concluida' check (status in ('concluida', 'cancelada')),
  cancelada_em         timestamptz,
  cancelada_por        uuid,
  cancelada_por_nome   text,
  motivo_cancelamento  text,
  relogio_suspeito     boolean not null default false,
  unique (empresa_id, id),
  foreign key (empresa_id, loja_id) references public.lojas (empresa_id, id),
  foreign key (empresa_id, caixa_id) references public.caixas (empresa_id, id),
  foreign key (empresa_id, sessao_id) references public.sessoes_caixa (empresa_id, id),
  constraint vendas_cancelamento_com_motivo check (status <> 'cancelada' or length(trim(coalesce(motivo_cancelamento, ''))) >= 3)
);
create index vendas_empresa_data_idx on public.vendas (empresa_id, ocorrido_em desc);
create index vendas_loja_data_idx on public.vendas (loja_id, ocorrido_em desc);
create index vendas_caixa_numero_idx on public.vendas (caixa_id, numero);   -- não é único: duplicado offline vira divergência
create index vendas_sessao_idx on public.vendas (sessao_id);

create table public.vendas_itens (
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  id              uuid not null primary key,
  venda_id        uuid not null,
  loja_id         uuid not null,
  ordem           smallint not null,
  produto_id      uuid not null,
  descricao       text not null,
  codigo_lido     text,
  quantidade      numeric(14, 3) not null check (quantidade > 0),
  unidade         text not null,
  preco_tabela    numeric(14, 2) not null check (preco_tabela >= 0),     -- preço do cadastro na hora da venda
  preco_unitario  numeric(14, 4) not null check (preco_unitario >= 0),   -- preço cobrado
  desconto        numeric(14, 2) not null default 0 check (desconto >= 0), -- inclui o rateio do desconto da venda
  total           numeric(14, 2) not null check (total >= 0),
  lote_id         uuid,                                                    -- lote lido na embalagem (GS1), se houver
  unique (empresa_id, id),
  foreign key (empresa_id, venda_id) references public.vendas (empresa_id, id),
  foreign key (empresa_id, produto_id) references public.produtos (empresa_id, id)
);
create index vendas_itens_venda_idx on public.vendas_itens (venda_id);
create index vendas_itens_produto_idx on public.vendas_itens (empresa_id, produto_id);

create table public.vendas_pagamentos (
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  id          uuid not null primary key,
  venda_id    uuid not null,
  loja_id     uuid not null,
  -- Códigos da NFC-e: 01 dinheiro, 03 crédito, 04 débito, 17 Pix, 99 outros
  forma       text not null check (forma in ('01', '03', '04', '17', '99')),
  valor       numeric(14, 2) not null check (valor > 0),
  foreign key (empresa_id, venda_id) references public.vendas (empresa_id, id)
);
create index vendas_pagamentos_venda_idx on public.vendas_pagamentos (venda_id);

alter table public.movimentacoes
  add constraint movimentacoes_venda_item_fk foreign key (empresa_id, venda_item_id) references public.vendas_itens (empresa_id, id);
create index movimentacoes_venda_item_idx on public.movimentacoes (venda_item_id) where venda_item_id is not null;


-- ---------------------------------------------------------------------
-- 4. Eventos recebidos e divergências
-- ---------------------------------------------------------------------
create table public.pdv_eventos (
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  id              uuid not null primary key,
  loja_id         uuid not null,
  caixa_id        uuid not null,
  dispositivo_id  text,
  tipo            text not null,
  protocolo       smallint not null,
  hash            text not null,          -- conteúdo: mesmo id com conteúdo diferente vai para quarentena
  payload         jsonb not null,
  usuario_id      uuid,
  recebido_em     timestamptz not null default now()
);
create index pdv_eventos_caixa_idx on public.pdv_eventos (caixa_id, recebido_em desc);

create table public.divergencias (
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  id                  uuid not null default gen_random_uuid() primary key,
  loja_id             uuid not null,
  tipo                text not null check (tipo in (
                        'saldo_negativo', 'numero_repetido', 'relogio_suspeito', 'evento_conflitante',
                        'caixa_suspenso', 'sessao_simultanea')),
  venda_id            uuid,
  evento_id           uuid,
  produto_id          uuid,
  descricao           text not null,
  detalhes            jsonb not null default '{}'::jsonb,
  criado_em           timestamptz not null default now(),
  resolvida_em        timestamptz,
  resolvida_por       uuid,
  resolvida_por_nome  text,
  resolucao           text
);
create index divergencias_empresa_idx on public.divergencias (empresa_id, criado_em desc);
create index divergencias_abertas_idx on public.divergencias (empresa_id) where resolvida_em is null;


-- ---------------------------------------------------------------------
-- 5. Imutabilidade
-- ---------------------------------------------------------------------
create trigger vendas_itens_imutaveis before update or delete on public.vendas_itens
  for each row execute function app.bloquear_alteracao();
create trigger vendas_pagamentos_imutaveis before update or delete on public.vendas_pagamentos
  for each row execute function app.bloquear_alteracao();
create trigger sessoes_movimentos_imutaveis before update or delete on public.sessoes_caixa_movimentos
  for each row execute function app.bloquear_alteracao();
create trigger sessoes_fechamentos_imutaveis before update or delete on public.sessoes_caixa_fechamentos
  for each row execute function app.bloquear_alteracao();
create trigger pdv_eventos_imutaveis before update or delete on public.pdv_eventos
  for each row execute function app.bloquear_alteracao();
create trigger vendas_sem_truncate before truncate on public.vendas
  for each statement execute function app.bloquear_truncate();

-- Venda: a única mudança permitida é concluída → cancelada (com motivo e autor).
create or replace function app.vendas_proteger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.expurgo', true), '') = old.empresa_id::text and current_user = 'postgres' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and old.status = 'concluida' and new.status = 'cancelada'
     and (to_jsonb(new) - array['status', 'cancelada_em', 'cancelada_por', 'cancelada_por_nome', 'motivo_cancelamento'])
       = (to_jsonb(old) - array['status', 'cancelada_em', 'cancelada_por', 'cancelada_por_nome', 'motivo_cancelamento']) then
    return new;
  end if;
  raise exception 'Venda registrada não pode ser alterada nem excluída. Cancele a venda.'
    using errcode = 'P0001', hint = 'HISTORICO_IMUTAVEL';
end $$;
create trigger vendas_proteger before update or delete on public.vendas
  for each row execute function app.vendas_proteger();

-- Sessão: só pode ser fechada (uma vez) e ter o aparelho trocado.
create or replace function app.sessoes_proteger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.expurgo', true), '') = old.empresa_id::text and current_user = 'postgres' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and old.fechada_em is null
     and (to_jsonb(new) - 'fechada_em') = (to_jsonb(old) - 'fechada_em') then
    return new;
  end if;
  raise exception 'A sessão de caixa não pode ser alterada.' using errcode = 'P0001', hint = 'HISTORICO_IMUTAVEL';
end $$;
create trigger sessoes_proteger before update or delete on public.sessoes_caixa
  for each row execute function app.sessoes_proteger();

-- Divergência: só recebe a resolução (uma vez); nunca é apagada.
create or replace function app.divergencias_proteger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.expurgo', true), '') = old.empresa_id::text and current_user = 'postgres' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and old.resolvida_em is null
     and (to_jsonb(new) - array['resolvida_em', 'resolvida_por', 'resolvida_por_nome', 'resolucao'])
       = (to_jsonb(old) - array['resolvida_em', 'resolvida_por', 'resolvida_por_nome', 'resolucao']) then
    return new;
  end if;
  raise exception 'Divergência não pode ser alterada nem excluída.' using errcode = 'P0001', hint = 'HISTORICO_IMUTAVEL';
end $$;
create trigger divergencias_proteger before update or delete on public.divergencias
  for each row execute function app.divergencias_proteger();


-- ---------------------------------------------------------------------
-- 6. Regras do PDV (schema app)
-- ---------------------------------------------------------------------
-- Pode vender neste caixa? (membro ativo com papel de venda e acesso à loja)
create or replace function app.pdv_verificar_acesso(p_caixa uuid, p_papeis text[] default array['dono', 'gerente', 'caixa'])
returns public.caixas language plpgsql stable security definer set search_path = '' as $$
declare
  c public.caixas;
begin
  select * into c from public.caixas where id = p_caixa;
  if not found then
    raise exception 'Caixa não encontrado.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.membros m
    where m.empresa_id = c.empresa_id and m.usuario_id = (select auth.uid()) and m.ativo
      and m.papel = any (p_papeis) and (m.lojas is null or c.loja_id = any (m.lojas))
  ) then
    raise exception 'Sem permissão para usar este caixa.' using errcode = '42501';
  end if;
  return c;
end $$;

create or replace function app.pdv_divergencia(p_empresa uuid, p_loja uuid, p_tipo text, p_descricao text,
  p_venda uuid default null, p_evento uuid default null, p_produto uuid default null, p_detalhes jsonb default '{}'::jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.divergencias (empresa_id, loja_id, tipo, descricao, venda_id, evento_id, produto_id, detalhes)
  values (p_empresa, p_loja, p_tipo, p_descricao, p_venda, p_evento, p_produto, coalesce(p_detalhes, '{}'::jsonb));
$$;

-- Hora informada pelo aparelho: no futuro (mais de 5 min) usa a do servidor e avisa.
create or replace function app.pdv_hora(p_texto text, out quando timestamptz, out suspeita boolean)
language plpgsql stable set search_path = '' as $$
begin
  quando := coalesce(p_texto::timestamptz, now());
  suspeita := quando > now() + interval '5 minutes';
  if suspeita then quando := now(); end if;
end $$;

-- Baixa de estoque de um item vendido: lote lido na embalagem, senão o que vence primeiro
-- (FEFO), dividindo entre lotes. O que faltar fica negativo e vira divergência.
create or replace function app.pdv_baixar_item(c public.caixas, p_venda uuid, p_item uuid, p_produto uuid, p_lote uuid,
  p_quantidade numeric, p_quando timestamptz, p_usuario uuid, p_nome text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_controla boolean;
  v_restante numeric := p_quantidade;
  v_lote     record;
  v_ultimo   uuid;
  v_tirar    numeric;
  v_saldo    numeric;
  v_hoje     date := (now() at time zone (select fuso from public.empresas where id = c.empresa_id))::date;
begin
  select controla_estoque into v_controla from public.produtos where id = p_produto and empresa_id = c.empresa_id;
  if v_controla is null then raise exception 'Produto não encontrado.' using errcode = 'P0001'; end if;
  if not v_controla then return; end if;

  if p_lote is not null and exists (select 1 from public.lotes where id = p_lote and produto_id = p_produto and empresa_id = c.empresa_id) then
    v_ultimo := p_lote;
  else
    for v_lote in
      select s.lote_id, s.saldo
      from public.estoque_saldos s join public.lotes l on l.id = s.lote_id
      where s.loja_id = c.loja_id and s.produto_id = p_produto and s.saldo > 0
      order by coalesce(l.validade < v_hoje, false), l.validade nulls last, l.lote, l.id   -- vencidos por último
    loop
      exit when v_restante <= 0;
      v_tirar := least(v_restante, v_lote.saldo);
      insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, origem, origem_id, ocorrido_em,
                                        usuario_id, usuario_nome, venda_item_id, documento)
      values (c.empresa_id, c.loja_id, v_lote.lote_id, 'VENDA', v_tirar, 'pdv', md5(p_item::text || v_lote.lote_id::text)::uuid, p_quando,
              p_usuario, p_nome, p_item, 'Venda');
      v_restante := v_restante - v_tirar;
      v_ultimo := v_lote.lote_id;
    end loop;
    if v_restante > 0 and v_ultimo is null then
      -- Sem nenhum saldo: usa o último lote do produto (ou cria o lote padrão).
      select l.id into v_ultimo from public.lotes l
      where l.empresa_id = c.empresa_id and l.produto_id = p_produto order by l.validade desc nulls first, l.criado_em desc limit 1;
      if v_ultimo is null then
        insert into public.lotes (empresa_id, produto_id, lote, validade) values (c.empresa_id, p_produto, '', null)
        returning id into v_ultimo;
      end if;
    end if;
  end if;

  if v_restante > 0 then
    insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, origem, origem_id, ocorrido_em,
                                      usuario_id, usuario_nome, venda_item_id, documento)
    values (c.empresa_id, c.loja_id, v_ultimo, 'VENDA', v_restante, 'pdv', md5(p_item::text || v_ultimo::text || 'resto')::uuid, p_quando,
            p_usuario, p_nome, p_item, 'Venda');
    select saldo into v_saldo from public.estoque_saldos where loja_id = c.loja_id and lote_id = v_ultimo;
    if v_saldo < 0 then
      perform app.pdv_divergencia(c.empresa_id, c.loja_id, 'saldo_negativo',
        format('Venda deixou o estoque negativo (%s %s).', replace(trim_scale(v_saldo)::text, '.', ','),
               (select unidade from public.produtos where id = p_produto)),
        p_venda, null, p_produto, jsonb_build_object('lote_id', v_ultimo, 'saldo', v_saldo));
    end if;
  end if;
end $$;

create or replace function app.pdv_esperado(p_sessao uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (select * from public.sessoes_caixa where id = p_sessao),
  pag as (
    select p.forma, sum(p.valor) as valor
    from public.vendas v join public.vendas_pagamentos p on p.venda_id = v.id
    where v.sessao_id = p_sessao and v.status = 'concluida'
    group by p.forma
  ),
  troco as (select coalesce(sum(troco), 0) as v from public.vendas where sessao_id = p_sessao and status = 'concluida'),
  mov as (
    select coalesce(sum(case when tipo = 'suprimento' then valor else -valor end), 0) as v
    from public.sessoes_caixa_movimentos where sessao_id = p_sessao
  )
  select coalesce((select jsonb_object_agg(forma, valor) from pag where forma <> '01'), '{}'::jsonb)
         || jsonb_build_object('01',
              (select valor_abertura from s) + coalesce((select valor from pag where forma = '01'), 0)
              - (select v from troco) + (select v from mov));
$$;

-- Aplica um evento do caixa. Erros de validação sobem como exceção (o evento volta como inválido).
create or replace function app.pdv_aplicar(e jsonb, p_dispositivo text, p_usuario uuid, p_nome text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id      uuid := (e ->> 'id')::uuid;
  v_tipo    text := e ->> 'tipo';
  d         jsonb := e -> 'dados';
  v_hash    text := md5(e::text);
  v_existe  public.pdv_eventos;
  c         public.caixas;
  v_hora    record;
  v_sessao  public.sessoes_caixa;
  v_venda   public.vendas;
  v_item    jsonb;
  v_pag     jsonb;
  v_soma    numeric;
  v_mov     record;
  v_pagos   numeric;
  v_esperado jsonb;
begin
  if v_id is null or v_tipo is null or d is null then
    raise exception 'Evento malformado (id, tipo e dados são obrigatórios).' using errcode = 'P0001';
  end if;

  select * into v_existe from public.pdv_eventos where id = v_id;
  if found then
    if v_existe.hash = v_hash then return jsonb_build_object('id', v_id, 'status', 'duplicado'); end if;
    -- Mesmo id com conteúdo diferente: guarda para conferência, não aplica.
    if not exists (select 1 from public.divergencias where evento_id = v_id and tipo = 'evento_conflitante') then
      perform app.pdv_divergencia(v_existe.empresa_id, v_existe.loja_id, 'evento_conflitante',
        'O caixa reenviou um evento já recebido, mas com conteúdo diferente.', null, v_id, null, jsonb_build_object('payload', e));
    end if;
    return jsonb_build_object('id', v_id, 'status', 'quarentena');
  end if;

  c := app.pdv_verificar_acesso((d ->> 'caixa_id')::uuid,
         case when v_tipo = 'cancelar_venda' then array['dono', 'gerente'] else array['dono', 'gerente', 'caixa'] end);

  if v_tipo = 'abrir_sessao' then
    v_hora := app.pdv_hora(d ->> 'aberta_em');
    if exists (select 1 from public.sessoes_caixa where caixa_id = c.id and fechada_em is null) then
      perform app.pdv_divergencia(c.empresa_id, c.loja_id, 'sessao_simultanea',
        format('%s foi aberto com outra sessão ainda aberta.', c.nome), null, v_id);
    end if;
    if app.estado_empresa(c.empresa_id) in ('suspensa', 'cancelada') then
      perform app.pdv_divergencia(c.empresa_id, c.loja_id, 'caixa_suspenso',
        format('%s foi aberto com a assinatura suspensa (licença guardada no aparelho).', c.nome), null, v_id);
    end if;
    insert into public.sessoes_caixa (empresa_id, id, caixa_id, loja_id, operador_id, operador_nome, dispositivo_id, aberta_em, valor_abertura)
    values (c.empresa_id, (d ->> 'sessao_id')::uuid, c.id, c.loja_id, p_usuario, p_nome, p_dispositivo, v_hora.quando,
            coalesce((d ->> 'valor_abertura')::numeric, 0));
    update public.caixas set dispositivo_id = p_dispositivo, dispositivo_em = now() where id = c.id;

  elsif v_tipo = 'movimento_caixa' then
    select * into v_sessao from public.sessoes_caixa where id = (d ->> 'sessao_id')::uuid and caixa_id = c.id;
    if not found then raise exception 'Sessão de caixa não encontrada.' using errcode = 'P0001'; end if;
    v_hora := app.pdv_hora(d ->> 'ocorrido_em');
    insert into public.sessoes_caixa_movimentos (empresa_id, id, sessao_id, loja_id, tipo, valor, motivo, ocorrido_em, usuario_id, usuario_nome)
    values (c.empresa_id, (d ->> 'movimento_id')::uuid, v_sessao.id, c.loja_id, d ->> 'tipo', (d ->> 'valor')::numeric,
            nullif(trim(coalesce(d ->> 'motivo', '')), ''), v_hora.quando, p_usuario, p_nome);

  elsif v_tipo = 'venda' then
    select * into v_sessao from public.sessoes_caixa where id = (d ->> 'sessao_id')::uuid and caixa_id = c.id;
    if not found then raise exception 'Sessão de caixa não encontrada.' using errcode = 'P0001'; end if;
    if jsonb_array_length(coalesce(d -> 'itens', '[]'::jsonb)) = 0 then raise exception 'Venda sem itens.' using errcode = 'P0001'; end if;
    v_hora := app.pdv_hora(d ->> 'ocorrido_em');

    -- Conferência das contas (payload malformado é recusado; o resto vira divergência).
    select coalesce(sum((i ->> 'total')::numeric), 0) into v_soma from jsonb_array_elements(d -> 'itens') i;
    if abs(v_soma - (d ->> 'total')::numeric) > 0.01 then
      raise exception 'Total da venda não confere com os itens (% x %).', v_soma, d ->> 'total' using errcode = 'P0001';
    end if;
    select coalesce(sum((p ->> 'valor')::numeric), 0) into v_pagos from jsonb_array_elements(coalesce(d -> 'pagamentos', '[]'::jsonb)) p;
    if abs(v_pagos - coalesce((d ->> 'troco')::numeric, 0) - (d ->> 'total')::numeric) > 0.01 then
      raise exception 'Pagamentos não conferem com o total da venda.' using errcode = 'P0001';
    end if;

    insert into public.vendas (empresa_id, id, loja_id, caixa_id, sessao_id, numero, ocorrido_em, operador_id, operador_nome, dispositivo_id,
                               subtotal, desconto, total, troco, relogio_suspeito)
    values (c.empresa_id, (d ->> 'venda_id')::uuid, c.loja_id, c.id, v_sessao.id, (d ->> 'numero')::bigint, v_hora.quando, p_usuario, p_nome,
            p_dispositivo, (d ->> 'subtotal')::numeric, coalesce((d ->> 'desconto')::numeric, 0), (d ->> 'total')::numeric,
            coalesce((d ->> 'troco')::numeric, 0), v_hora.suspeita)
    returning * into v_venda;

    if v_hora.suspeita then
      perform app.pdv_divergencia(c.empresa_id, c.loja_id, 'relogio_suspeito',
        format('Venda %s-%s veio com horário no futuro (%s); usada a hora do servidor.', lpad(c.numero::text, 2, '0'),
               lpad(v_venda.numero::text, 6, '0'), d ->> 'ocorrido_em'), v_venda.id, v_id);
    end if;
    if exists (select 1 from public.vendas where caixa_id = c.id and numero = v_venda.numero and id <> v_venda.id) then
      perform app.pdv_divergencia(c.empresa_id, c.loja_id, 'numero_repetido',
        format('O número %s-%s foi usado em mais de uma venda.', lpad(c.numero::text, 2, '0'), lpad(v_venda.numero::text, 6, '0')),
        v_venda.id, v_id);
    end if;
    update public.caixas set ultimo_numero = greatest(ultimo_numero, v_venda.numero) where id = c.id;

    -- Trava os saldos dos produtos da venda em ordem fixa (dois caixas sincronizando juntos não travam um ao outro).
    perform 1 from public.estoque_saldos s
    where s.loja_id = c.loja_id and s.produto_id in (select (i ->> 'produto_id')::uuid from jsonb_array_elements(d -> 'itens') i)
    order by s.lote_id for update;

    for v_item in select * from jsonb_array_elements(d -> 'itens') loop
      insert into public.vendas_itens (empresa_id, id, venda_id, loja_id, ordem, produto_id, descricao, codigo_lido, quantidade, unidade,
                                       preco_tabela, preco_unitario, desconto, total, lote_id)
      values (c.empresa_id, (v_item ->> 'id')::uuid, v_venda.id, c.loja_id, coalesce((v_item ->> 'ordem')::smallint, 0), (v_item ->> 'produto_id')::uuid,
              v_item ->> 'descricao', v_item ->> 'codigo_lido', (v_item ->> 'quantidade')::numeric, v_item ->> 'unidade',
              coalesce((v_item ->> 'preco_tabela')::numeric, 0), (v_item ->> 'preco_unitario')::numeric,
              coalesce((v_item ->> 'desconto')::numeric, 0), (v_item ->> 'total')::numeric, (v_item ->> 'lote_id')::uuid);
      perform app.pdv_baixar_item(c, v_venda.id, (v_item ->> 'id')::uuid, (v_item ->> 'produto_id')::uuid, (v_item ->> 'lote_id')::uuid,
                                  (v_item ->> 'quantidade')::numeric, v_hora.quando, p_usuario, p_nome);
    end loop;
    for v_pag in select * from jsonb_array_elements(coalesce(d -> 'pagamentos', '[]'::jsonb)) loop
      insert into public.vendas_pagamentos (empresa_id, id, venda_id, loja_id, forma, valor)
      values (c.empresa_id, (v_pag ->> 'id')::uuid, v_venda.id, c.loja_id, v_pag ->> 'forma', (v_pag ->> 'valor')::numeric);
    end loop;

  elsif v_tipo = 'cancelar_venda' then
    perform app.pdv_cancelar(c, (d ->> 'venda_id')::uuid, d ->> 'motivo', p_usuario, p_nome);

  elsif v_tipo = 'fechar_sessao' then
    select * into v_sessao from public.sessoes_caixa where id = (d ->> 'sessao_id')::uuid and caixa_id = c.id;
    if not found then raise exception 'Sessão de caixa não encontrada.' using errcode = 'P0001'; end if;
    if v_sessao.fechada_em is null then
      v_hora := app.pdv_hora(d ->> 'fechada_em');
      v_esperado := app.pdv_esperado(v_sessao.id);
      insert into public.sessoes_caixa_fechamentos (empresa_id, sessao_id, loja_id, fechada_em, contado, esperado, diferenca_dinheiro,
                                                    observacao, usuario_id, usuario_nome)
      values (c.empresa_id, v_sessao.id, c.loja_id, v_hora.quando, coalesce(d -> 'contado', '{}'::jsonb), v_esperado,
              coalesce((d -> 'contado' ->> '01')::numeric, 0) - (v_esperado ->> '01')::numeric,
              nullif(trim(coalesce(d ->> 'observacao', '')), ''), p_usuario, p_nome);
      update public.sessoes_caixa set fechada_em = v_hora.quando where id = v_sessao.id;
    end if;

  else
    raise exception 'Tipo de evento desconhecido: %', v_tipo using errcode = 'P0001';
  end if;

  insert into public.pdv_eventos (empresa_id, id, loja_id, caixa_id, dispositivo_id, tipo, protocolo, hash, payload, usuario_id)
  values (c.empresa_id, v_id, c.loja_id, c.id, p_dispositivo, v_tipo, 1, v_hash, e, p_usuario);
  return jsonb_build_object('id', v_id, 'status', 'aplicado');
end $$;

-- Cancelamento: estorna cada baixa de estoque da venda (nada é apagado).
create or replace function app.pdv_cancelar(c public.caixas, p_venda uuid, p_motivo text, p_usuario uuid, p_nome text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.vendas;
  m record;
begin
  select * into v from public.vendas where id = p_venda and caixa_id = c.id for update;
  if not found then raise exception 'Venda não encontrada.' using errcode = 'P0001'; end if;
  if v.status = 'cancelada' then return; end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  update public.vendas set status = 'cancelada', cancelada_em = now(), cancelada_por = p_usuario,
                           cancelada_por_nome = p_nome, motivo_cancelamento = trim(p_motivo)
  where id = v.id;
  for m in select mv.* from public.movimentacoes mv join public.vendas_itens i on i.id = mv.venda_item_id
           where i.venda_id = v.id and mv.tipo = 'VENDA' loop
    insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, origem, origem_id, ocorrido_em,
                                      usuario_id, usuario_nome, venda_item_id, documento, observacao)
    values (m.empresa_id, m.loja_id, m.lote_id, 'CANCELAMENTO_VENDA', m.quantidade, 'pdv', md5('cancela' || m.id::text)::uuid, now(),
            p_usuario, p_nome, m.venda_item_id, 'Venda cancelada', trim(p_motivo));
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 7. Funções chamadas pelo app
-- ---------------------------------------------------------------------
-- Recebe os eventos do caixa, em ordem. Cada evento é aplicado (ou recusado) sozinho.
create or replace function public.pdv_sincronizar(p_protocolo int, p_dispositivo text, p_eventos jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_nome    text;
  e         jsonb;
  v_res     jsonb := '[]'::jsonb;
begin
  if v_usuario is null then raise exception 'Entre no sistema para sincronizar.' using errcode = '42501'; end if;
  if p_protocolo is distinct from 1 then
    raise exception 'Versão do aplicativo não suportada: recarregue a página.' using errcode = 'P0001', hint = 'PROTOCOLO';
  end if;
  if jsonb_typeof(p_eventos) is distinct from 'array' then raise exception 'Lista de eventos inválida.' using errcode = 'P0001'; end if;
  select nome into v_nome from public.perfis where id = v_usuario;
  for e in select * from jsonb_array_elements(p_eventos) loop
    begin
      v_res := v_res || jsonb_build_array(app.pdv_aplicar(e, p_dispositivo, v_usuario, v_nome));
    exception when others then
      v_res := v_res || jsonb_build_array(jsonb_build_object('id', e ->> 'id', 'status', 'invalido', 'mensagem', sqlerrm, 'codigo', sqlstate));
    end;
  end loop;
  return jsonb_build_object('agora', now(), 'resultados', v_res);
end $$;

-- Catálogo para o caixa: só o que mudou desde a última vez (p_desde = "agora" devolvido antes, com margem).
create or replace function public.pdv_catalogo(p_loja uuid, p_desde timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.lojas where id = p_loja;
  if v_empresa is null or p_loja not in (select app.minhas_lojas()) then
    raise exception 'Loja não encontrada ou sem acesso.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'agora', now(),
    'completo', p_desde is null,
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'codigo_interno', p.codigo_interno, 'nome', p.nome, 'unidade', p.unidade, 'preco_venda', p.preco_venda,
        'pesavel', p.pesavel, 'codigo_balanca', p.codigo_balanca, 'rastreio', p.rastreio, 'controla_estoque', p.controla_estoque,
        'conteudo_embalagem', p.conteudo_embalagem, 'categoria_id', p.categoria_id, 'ativo', p.ativo,
        'codigos', coalesce((select jsonb_agg(jsonb_build_object('codigo', pc.codigo, 'fator', pc.fator))
                             from public.produtos_codigos pc where pc.produto_id = p.id), '[]'::jsonb)))
      from public.produtos p
      where p.empresa_id = v_empresa and (p_desde is null or p.atualizado_em > p_desde)), '[]'::jsonb),
    'saldos', coalesce((
      select jsonb_agg(jsonb_build_object('produto_id', s.produto_id, 'saldo', s.saldo))
      from (select produto_id, sum(saldo) as saldo from public.estoque_saldos
            where loja_id = p_loja
              and (p_desde is null or produto_id in (select produto_id from public.estoque_saldos where loja_id = p_loja and atualizado_em > p_desde))
            group by produto_id) s), '[]'::jsonb)
  );
end $$;

-- Liga este aparelho ao caixa (uma vez, com internet) e devolve o último número de venda.
create or replace function public.pdv_assumir_caixa(p_caixa uuid, p_dispositivo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.caixas;
  s public.sessoes_caixa;
begin
  c := app.pdv_verificar_acesso(p_caixa);
  if not c.ativo then raise exception '% está desativado.', c.nome using errcode = 'P0001'; end if;
  select * into s from public.sessoes_caixa where caixa_id = c.id and fechada_em is null and dispositivo_id is distinct from p_dispositivo
  order by aberta_em desc limit 1;
  if found then
    raise exception '% está aberto em outro aparelho (por %, desde %). Feche o caixa lá ou escolha outro.',
      c.nome, coalesce(s.operador_nome, 'outra pessoa'),
      to_char(s.aberta_em at time zone (select fuso from public.empresas where id = c.empresa_id), 'DD/MM HH24:MI')
      using errcode = 'P0001', hint = 'CAIXA_EM_USO';
  end if;
  update public.caixas set dispositivo_id = p_dispositivo, dispositivo_em = now() where id = c.id;
  return jsonb_build_object(
    'caixa_id', c.id, 'numero', c.numero, 'nome', c.nome, 'loja_id', c.loja_id,
    'ultimo_numero', greatest(c.ultimo_numero, coalesce((select max(numero) from public.vendas where caixa_id = c.id), 0)),
    'sessao_aberta', (select to_jsonb(x) from (select id, aberta_em, valor_abertura from public.sessoes_caixa
                      where caixa_id = c.id and fechada_em is null and dispositivo_id = p_dispositivo order by aberta_em desc limit 1) x),
    'agora', now());
end $$;

-- Cancelamento pela retaguarda (com internet), por gerente ou dono.
create or replace function public.cancelar_venda(p_venda uuid, p_motivo text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.caixas;
begin
  select cx.* into c from public.vendas v join public.caixas cx on cx.id = v.caixa_id where v.id = p_venda;
  if not found then raise exception 'Venda não encontrada.' using errcode = 'P0001'; end if;
  c := app.pdv_verificar_acesso(c.id, array['dono', 'gerente']);
  if c.empresa_id not in (select app.empresas_gravaveis()) then
    raise exception 'Assinatura em atraso: o sistema está somente para consulta.' using errcode = '42501';
  end if;
  perform app.pdv_cancelar(c, p_venda, p_motivo, auth.uid(), (select nome from public.perfis where id = auth.uid()));
end $$;

create or replace function public.resolver_divergencia(p_divergencia uuid, p_resolucao text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if length(trim(coalesce(p_resolucao, ''))) < 3 then
    raise exception 'Descreva como a divergência foi resolvida.' using errcode = 'P0001';
  end if;
  update public.divergencias set resolvida_em = now(), resolvida_por = auth.uid(),
         resolvida_por_nome = (select nome from public.perfis where id = auth.uid()), resolucao = trim(p_resolucao)
  where id = p_divergencia and resolvida_em is null
    and empresa_id in (select app.empresas_com_papel(array['dono', 'gerente']));
  if not found then raise exception 'Divergência não encontrada, já resolvida ou sem permissão.' using errcode = 'P0001'; end if;
end $$;

-- Empresa nova já vem com o "Caixa 01" na loja principal.
create or replace function public.criar_empresa(p_nome text, p_segmento text, p_nome_loja text default 'Loja principal')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_empresa uuid;
  v_loja    uuid;
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

  insert into public.lojas (empresa_id, nome) values (v_empresa, coalesce(nullif(trim(p_nome_loja), ''), 'Loja principal'))
  returning id into v_loja;
  insert into public.caixas (empresa_id, loja_id, numero, nome) values (v_empresa, v_loja, 1, 'Caixa 01');

  insert into public.membros (empresa_id, usuario_id, papel, nome)
  values (v_empresa, v_usuario, 'dono', (select nome from public.perfis where id = v_usuario));

  perform app.seed_segmento(v_empresa, p_segmento);
  return v_empresa;
end $$;

-- Expurgo (plataforma): inclui as tabelas do PDV.
create or replace function app.expurgar_empresa(p_empresa uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.expurgo', p_empresa::text, true);
  delete from public.movimentacoes where empresa_id = p_empresa;
  delete from public.estoque_saldos where empresa_id = p_empresa;
  delete from public.vendas_pagamentos where empresa_id = p_empresa;
  delete from public.vendas_itens where empresa_id = p_empresa;
  delete from public.vendas where empresa_id = p_empresa;
  delete from public.sessoes_caixa_fechamentos where empresa_id = p_empresa;
  delete from public.sessoes_caixa_movimentos where empresa_id = p_empresa;
  delete from public.sessoes_caixa where empresa_id = p_empresa;
  delete from public.pdv_eventos where empresa_id = p_empresa;
  delete from public.divergencias where empresa_id = p_empresa;
  delete from public.empresas where id = p_empresa;
  perform set_config('app.expurgo', '', true);
end $$;


-- ---------------------------------------------------------------------
-- 8. Segurança: RLS e privilégios
-- ---------------------------------------------------------------------
alter table public.caixas                     enable row level security;
alter table public.sessoes_caixa              enable row level security;
alter table public.sessoes_caixa_movimentos   enable row level security;
alter table public.sessoes_caixa_fechamentos  enable row level security;
alter table public.vendas                     enable row level security;
alter table public.vendas_itens               enable row level security;
alter table public.vendas_pagamentos          enable row level security;
alter table public.pdv_eventos                enable row level security;
alter table public.divergencias               enable row level security;

revoke all on public.caixas, public.sessoes_caixa, public.sessoes_caixa_movimentos, public.sessoes_caixa_fechamentos,
              public.vendas, public.vendas_itens, public.vendas_pagamentos, public.pdv_eventos, public.divergencias
  from anon;
revoke insert, update, delete, truncate on public.caixas, public.sessoes_caixa, public.sessoes_caixa_movimentos,
              public.sessoes_caixa_fechamentos, public.vendas, public.vendas_itens, public.vendas_pagamentos,
              public.pdv_eventos, public.divergencias
  from authenticated;

-- Caixas: equipe consulta; dono e gerente cadastram e editam (respeitando o plano).
grant insert (empresa_id, loja_id, numero, nome) on public.caixas to authenticated;
grant update (nome, ativo) on public.caixas to authenticated;
create policy caixas_leitura on public.caixas for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
create policy caixas_cadastro on public.caixas for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente'])) and empresa_id in (select app.empresas_gravaveis()));
create policy caixas_edicao on public.caixas for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente'])))
  with check (empresa_id in (select app.empresas_gravaveis()));

-- Vendas e caixa: consulta por quem tem acesso à loja. Gravação só pela sincronização.
create policy sessoes_leitura on public.sessoes_caixa for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
create policy sessoes_movimentos_leitura on public.sessoes_caixa_movimentos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
create policy sessoes_fechamentos_leitura on public.sessoes_caixa_fechamentos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
create policy vendas_leitura on public.vendas for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
create policy vendas_itens_leitura on public.vendas_itens for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
create policy vendas_pagamentos_leitura on public.vendas_pagamentos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));

-- Diagnóstico e conferência: dono e gerente.
create policy pdv_eventos_leitura on public.pdv_eventos for select to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente'])));
create policy divergencias_leitura on public.divergencias for select to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente'])) and loja_id in (select app.minhas_lojas()));

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on function public.ver_convite(text) to anon, authenticated;
grant execute on function public.pdv_sincronizar(int, text, jsonb), public.pdv_catalogo(uuid, timestamptz),
                          public.pdv_assumir_caixa(uuid, text), public.cancelar_venda(uuid, text),
                          public.resolver_divergencia(uuid, text), public.criar_empresa(text, text, text)
  to authenticated;
-- As regras do PDV (app.pdv_*) só rodam dentro das funções acima, nunca chamadas direto.
revoke execute on function app.pdv_aplicar(jsonb, text, uuid, text), app.pdv_cancelar(public.caixas, uuid, text, uuid, text),
                           app.pdv_baixar_item(public.caixas, uuid, uuid, uuid, uuid, numeric, timestamptz, uuid, text),
                           app.pdv_divergencia(uuid, uuid, text, text, uuid, uuid, uuid, jsonb), app.pdv_esperado(uuid)
  from authenticated;

-- Tempo real: a retaguarda vê vendas e divergências chegando.
alter publication supabase_realtime add table public.vendas, public.divergencias, public.caixas;
