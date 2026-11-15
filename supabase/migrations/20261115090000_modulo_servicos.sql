-- =====================================================================
--  T-038 — Módulo Serviços (Ordem de Serviço — assistência técnica)
--
--  Princípios (padrão do PDV e da base multiempresa):
--    * A OS nasce no recebimento do aparelho e caminha numa cadeia única:
--      aberta → em diagnóstico → aguardando aprovação → aprovada →
--      em execução → pronta → entregue (ou cancelada, com motivo).
--    * O status só muda pela função os_mudar_status: papel, transição,
--      pagamento e estoque são validados no próprio banco. Avançar é
--      livre; voltar não; entregue e cancelada são terminais.
--    * A entrega é terminal e atômica: confere o pagamento, baixa as
--      peças do estoque em FEFO (o lote que vence primeiro sai antes) e
--      carimba os marcos. Pagamento faltante e estoque insuficiente
--      recusam a entrega com mensagem clara.
--    * Itens só podem ser definidos até a aprovação do orçamento (RPC
--      os_definir_itens, substituição atômica); depois disso a única
--      mudança permitida é o carimbo de baixa feito pelo servidor.
--    * Numeração por empresa (contador 'os'); cliente e aparelho são
--      campos de texto na própria OS (sem cadastro de cliente na v1).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
create table public.ordens_servico (
  empresa_id            uuid not null references public.empresas (id) on delete cascade,
  id                    uuid not null default gen_random_uuid() primary key,
  loja_id               uuid not null,
  numero                bigint not null,                     -- por empresa (exibição: OS 000123)
  status                text not null default 'aberta' check (status in (
                          'aberta', 'em_diagnostico', 'aguardando_aprovacao', 'aprovada',
                          'em_execucao', 'pronta', 'entregue', 'cancelada')),
  -- Cliente: campos de texto na própria OS (sem cadastro de cliente na v1)
  cliente_nome          text not null check (length(trim(cliente_nome)) > 0),
  cliente_telefone      text,
  cliente_documento     text,
  -- Aparelho recebido
  aparelho_tipo         text,
  aparelho_marca_modelo text,
  aparelho_serie_imei   text,
  aparelho_cor          text,
  aparelho_senha        text,                                -- opcional: dado sensível de acesso
  aparelho_acessorios   text,
  aparelho_estado       text,
  defeito_relatado      text,
  diagnostico           text,
  prazo_prometido       date,
  valor_mao_de_obra     numeric(14, 2) not null default 0 check (valor_mao_de_obra >= 0),
  desconto              numeric(14, 2) not null default 0 check (desconto >= 0),
  garantia_dias         integer check (garantia_dias is null or garantia_dias >= 0),
  tecnico_id            uuid,                                -- sem FK: sobrevive à exclusão do usuário
  tecnico_nome          text,
  venda_id              uuid,                                -- reservada: follow-up "receber no PDV"
  -- Marcos, carimbados pelo servidor na mudança de status
  criado_em             timestamptz not null default now(),
  criado_por            uuid,
  criado_por_nome       text,
  orcado_em             timestamptz,
  aprovada_em           timestamptz,
  aprovada_por          uuid,
  aprovada_por_nome     text,
  pronta_em             timestamptz,
  entregue_em           timestamptz,
  entregue_por          uuid,
  entregue_por_nome     text,
  cancelada_em          timestamptz,
  cancelada_por         uuid,
  cancelada_por_nome    text,
  motivo_cancelamento   text,
  unique (empresa_id, id),
  unique (empresa_id, numero),
  foreign key (empresa_id, loja_id) references public.lojas (empresa_id, id),
  constraint os_cancelamento_com_motivo check (
    status <> 'cancelada' or length(trim(coalesce(motivo_cancelamento, ''))) >= 3)
);
create index ordens_servico_empresa_status_idx on public.ordens_servico (empresa_id, status);
create index ordens_servico_empresa_serie_idx on public.ordens_servico (empresa_id, aparelho_serie_imei);
create index ordens_servico_empresa_telefone_idx on public.ordens_servico (empresa_id, cliente_telefone);
create index ordens_servico_loja_numero_idx on public.ordens_servico (loja_id, numero);
create index ordens_servico_empresa_prazo_idx on public.ordens_servico (empresa_id, prazo_prometido);

create table public.os_itens (
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  id              uuid not null default gen_random_uuid() primary key,
  os_id           uuid not null,
  loja_id         uuid not null,
  ordem           smallint not null default 0,
  origem          text not null default 'estoque' check (origem in ('estoque', 'avulsa')),
  produto_id      uuid,                                    -- null no item avulso
  descricao       text not null check (length(trim(descricao)) > 0),
  quantidade      numeric(14, 3) not null check (quantidade > 0),
  preco_unitario  numeric(14, 2) not null check (preco_unitario >= 0),
  total           numeric(14, 2) generated always as ((quantidade * preco_unitario)::numeric(14, 2)) stored,
  baixado_em      timestamptz,                             -- carimbado pela entrega (baixa do estoque)
  unique (empresa_id, id),
  foreign key (empresa_id, os_id) references public.ordens_servico (empresa_id, id),
  foreign key (empresa_id, loja_id) references public.lojas (empresa_id, id),
  foreign key (empresa_id, produto_id) references public.produtos (empresa_id, id)
);
create index os_itens_os_idx on public.os_itens (os_id);
create index os_itens_produto_idx on public.os_itens (empresa_id, produto_id);

create table public.os_pagamentos (
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  id                  uuid not null default gen_random_uuid() primary key,
  os_id               uuid not null,
  loja_id             uuid not null,
  -- Códigos da NFC-e (mesmos do caixa): 01 dinheiro, 03 crédito, 04 débito, 17 Pix, 99 outros
  forma               text not null check (forma in ('01', '03', '04', '17', '99')),
  valor               numeric(14, 2) not null check (valor > 0),
  registrado_em       timestamptz not null default now(),
  registrado_por      uuid,
  registrado_por_nome text,
  unique (empresa_id, id),
  foreign key (empresa_id, os_id) references public.ordens_servico (empresa_id, id),
  foreign key (empresa_id, loja_id) references public.lojas (empresa_id, id)
);
create index os_pagamentos_os_idx on public.os_pagamentos (os_id);


-- ---------------------------------------------------------------------
-- 2. Gatilhos: numeração, carimbos e proteção
-- ---------------------------------------------------------------------
-- Numeração por empresa (contador 'os') e carimbo de quem recebeu o aparelho.
create or replace function app.os_carimbar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.cliente_nome := trim(new.cliente_nome);
  if tg_op = 'INSERT' then
    if new.numero is null then
      new.numero := app.proximo_numero(new.empresa_id, 'os');
    end if;
    new.criado_em       := now();
    new.criado_por      := auth.uid();
    new.criado_por_nome := (select nome from public.perfis where id = auth.uid());
  else
    new.empresa_id      := old.empresa_id;
    new.loja_id         := old.loja_id;
    new.numero          := old.numero;
    new.criado_em       := old.criado_em;
    new.criado_por      := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
  end if;
  return new;
end $$;
create trigger os_carimbar before insert or update on public.ordens_servico
  for each row execute function app.os_carimbar();

-- OS entregue ou cancelada fecha a ordem: nada muda, nada é apagado.
create or replace function app.os_proteger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.expurgo', true), '') = old.empresa_id::text and current_user = 'postgres' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.status in ('entregue', 'cancelada') then
    raise exception 'OS % não pode ser alterada nem excluída.', lpad(old.numero::text, 6, '0')
      using errcode = 'P0001', hint = 'OS_FECHADA';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger os_proteger before update or delete on public.ordens_servico
  for each row execute function app.os_proteger();

-- Itens só mudam até a aprovação do orçamento; depois, a única alteração
-- permitida é o carimbo de baixa (baixado_em) gravado pela entrega.
create or replace function app.os_itens_proteger()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_status text;
  v_numero bigint;
begin
  if tg_op = 'INSERT' then
    select o.status, o.numero into v_status, v_numero
    from public.ordens_servico o where o.id = new.os_id;
  else
    select o.status, o.numero into v_status, v_numero
    from public.ordens_servico o where o.id = old.os_id;
    if coalesce(current_setting('app.expurgo', true), '') = old.empresa_id::text and current_user = 'postgres' then
      return old;
    end if;
  end if;
  if v_status in ('aprovada', 'em_execucao', 'pronta', 'entregue', 'cancelada') then
    -- 'total' fica de fora porque é gerado: no gatilho BEFORE o valor de NEW
    -- ainda não foi recalculado (vem null), mesmo sem nenhuma mudança real.
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'baixado_em' - 'total') = (to_jsonb(old) - 'baixado_em' - 'total') then
      return new;                    -- carimbo de baixa gravado pela entrega (os_mudar_status)
    end if;
    raise exception 'Itens da OS % não podem ser alterados depois da aprovação do orçamento.',
      lpad(v_numero::text, 6, '0') using errcode = 'P0001', hint = 'ITENS_TRAVADOS';
  end if;
  if tg_op = 'UPDATE' then
    new.empresa_id := old.empresa_id;
    new.os_id      := old.os_id;
    new.loja_id    := old.loja_id;
    return new;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger os_itens_proteger before insert or update or delete on public.os_itens
  for each row execute function app.os_itens_proteger();

-- Quem registrou o pagamento é carimbado pelo servidor (não pelo caixa).
create or replace function app.os_pagamentos_carimbar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.registrado_em       := now();
  new.registrado_por      := auth.uid();
  new.registrado_por_nome := (select nome from public.perfis where id = auth.uid());
  return new;
end $$;
create trigger os_pagamentos_carimbar before insert on public.os_pagamentos
  for each row execute function app.os_pagamentos_carimbar();

-- OS entregue ou cancelada fecha a conta: pagamentos não mudam nem saem.
create or replace function app.os_pagamentos_proteger()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_status text;
  v_numero bigint;
begin
  if tg_op = 'INSERT' then
    select o.status, o.numero into v_status, v_numero
    from public.ordens_servico o where o.id = new.os_id;
  else
    select o.status, o.numero into v_status, v_numero
    from public.ordens_servico o where o.id = old.os_id;
    if coalesce(current_setting('app.expurgo', true), '') = old.empresa_id::text and current_user = 'postgres' then
      return old;
    end if;
  end if;
  if v_status in ('entregue', 'cancelada') then
    raise exception 'Pagamentos da OS % não podem ser alterados nem excluídos.', lpad(v_numero::text, 6, '0')
      using errcode = 'P0001', hint = 'OS_FECHADA';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger os_pagamentos_proteger before insert or update or delete on public.os_pagamentos
  for each row execute function app.os_pagamentos_proteger();


-- ---------------------------------------------------------------------
-- 3. Funções chamadas pelo app (RPC)
-- ---------------------------------------------------------------------
-- Mudança de status: papel, transição e (na entrega) pagamento e estoque
-- são validados no banco. security definer: a gravação é do servidor; o
-- papel vem da tabela membros e os carimbos são gravados por ela.
create or replace function public.os_mudar_status(p_os uuid, p_status text, p_motivo text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_os         public.ordens_servico;
  v_papel      text;
  v_nome       text;
  v_de         smallint;
  v_para       smallint;
  v_total      numeric;
  v_pago       numeric;
  v_item       record;
  v_lote       record;
  v_restante   numeric;
  v_disponivel numeric;
begin
  if p_status not in ('aberta', 'em_diagnostico', 'aguardando_aprovacao', 'aprovada',
                      'em_execucao', 'pronta', 'entregue', 'cancelada') then
    raise exception 'Status de ordem de serviço inválido.' using errcode = 'P0001';
  end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0001';
  end if;
  v_nome := (select nome from public.perfis where id = auth.uid());
  select m.papel into v_papel
  from public.membros m
  where m.empresa_id = v_os.empresa_id and m.usuario_id = auth.uid() and m.ativo
    and (m.lojas is null or v_os.loja_id = any (m.lojas));
  if v_papel is null then
    raise exception 'Você não tem permissão para mover a ordem de serviço.' using errcode = '42501';
  end if;
  if p_status = 'entregue' then
    if v_papel not in ('dono', 'gerente', 'caixa') then
      raise exception 'Somente dono, gerente ou caixa podem entregar a ordem de serviço.' using errcode = '42501';
    end if;
  elsif p_status = 'cancelada' then
    if v_papel not in ('dono', 'gerente') then
      raise exception 'Você não tem permissão para mover a ordem de serviço.' using errcode = '42501';
    end if;
  elsif v_papel not in ('dono', 'gerente', 'estoquista') then
    raise exception 'Você não tem permissão para mover a ordem de serviço.' using errcode = '42501';
  end if;
  if v_os.empresa_id not in (select app.empresas_gravaveis()) then
    raise exception 'Assinatura em atraso: o sistema está somente para consulta.' using errcode = '42501';
  end if;
  -- OS fechada é terminal: nem pelo app, nem direto na tabela.
  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'OS % não pode ser alterada nem excluída.', lpad(v_os.numero::text, 6, '0')
      using errcode = 'P0001', hint = 'OS_FECHADA';
  end if;
  if p_status = v_os.status then
    raise exception 'A OS já está nesse status.' using errcode = 'P0001';
  end if;
  v_de := case v_os.status when 'aberta' then 1 when 'em_diagnostico' then 2 when 'aguardando_aprovacao' then 3
            when 'aprovada' then 4 when 'em_execucao' then 5 when 'pronta' then 6 when 'entregue' then 7 else 0 end;
  v_para := case p_status when 'aberta' then 1 when 'em_diagnostico' then 2 when 'aguardando_aprovacao' then 3
            when 'aprovada' then 4 when 'em_execucao' then 5 when 'pronta' then 6 when 'entregue' then 7 else 0 end;
  if p_status <> 'cancelada' and v_de > v_para then
    raise exception 'A ordem de serviço não pode voltar de % para %.',
      case v_os.status
        when 'aberta' then 'Aberta' when 'em_diagnostico' then 'Em diagnóstico'
        when 'aguardando_aprovacao' then 'Aguardando aprovação' when 'aprovada' then 'Aprovada'
        when 'em_execucao' then 'Em execução' when 'pronta' then 'Pronta'
        when 'entregue' then 'Entregue' when 'cancelada' then 'Cancelada' end,
      case p_status
        when 'aberta' then 'Aberta' when 'em_diagnostico' then 'Em diagnóstico'
        when 'aguardando_aprovacao' then 'Aguardando aprovação' when 'aprovada' then 'Aprovada'
        when 'em_execucao' then 'Em execução' when 'pronta' then 'Pronta'
        when 'entregue' then 'Entregue' when 'cancelada' then 'Cancelada' end
      using errcode = 'P0001';
  end if;
  if p_status = 'cancelada' and length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
  end if;

  if p_status = 'entregue' then
    -- (a) pagamento precisa cobrir o total (itens + mão de obra − desconto)
    select coalesce(sum(total), 0) into v_total from public.os_itens where os_id = v_os.id;
    v_total := v_total + v_os.valor_mao_de_obra - v_os.desconto;
    if v_total < 0 then v_total := 0; end if;
    select coalesce(sum(valor), 0) into v_pago from public.os_pagamentos where os_id = v_os.id;
    if v_pago < v_total then
      raise exception 'Registre o pagamento de R$ % antes de entregar.',
        replace(to_char(v_total - v_pago, 'FM9999999990.00'), '.', ',')
        using errcode = 'P0001', hint = 'PAGAMENTO_FALTANTE';
    end if;
    -- (b) pré-checa o saldo por produto (agrupando itens do mesmo produto) e
    --     depois baixa peça por peça em FEFO: o lote que vence primeiro sai
    --     antes. O bloqueio de saldo do razão continua valendo por baixo.
    for v_item in
      select i.produto_id, sum(i.quantidade) as quantidade,
             (array_agg(p.nome order by i.ordem))[1] as produto_nome,
             coalesce(bool_or(p.controla_estoque), false) as controla
      from public.os_itens i
      left join public.produtos p on p.id = i.produto_id and p.empresa_id = i.empresa_id
      where i.os_id = v_os.id and i.origem = 'estoque' and i.produto_id is not null
      group by i.produto_id
    loop
      if not v_item.controla then continue; end if;
      select coalesce(sum(s.saldo), 0) into v_disponivel
      from public.estoque_saldos s
      where s.loja_id = v_os.loja_id and s.produto_id = v_item.produto_id and s.saldo > 0;
      if v_disponivel < v_item.quantidade then
        raise exception 'Estoque insuficiente: % — necessário %, disponível %.',
          v_item.produto_nome,
          replace(trim_scale(v_item.quantidade)::text, '.', ','),
          replace(trim_scale(v_disponivel)::text, '.', ',')
          using errcode = 'P0001', hint = 'ESTOQUE_INSUFICIENTE';
      end if;
    end loop;
    for v_item in
      select i.id, i.produto_id, i.quantidade
      from public.os_itens i
      join public.produtos p on p.id = i.produto_id and p.empresa_id = i.empresa_id and p.controla_estoque
      where i.os_id = v_os.id and i.origem = 'estoque' and i.produto_id is not null
      order by i.ordem
    loop
      v_restante := v_item.quantidade;
      for v_lote in
        select s.lote_id, s.saldo
        from public.estoque_saldos s join public.lotes l on l.id = s.lote_id
        where s.loja_id = v_os.loja_id and s.produto_id = v_item.produto_id and s.saldo > 0
        order by l.validade asc nulls last, l.lote, l.id
      loop
        exit when v_restante <= 0;
        insert into public.movimentacoes (empresa_id, loja_id, lote_id, produto_id, tipo, quantidade, origem, origem_id, documento)
        values (v_os.empresa_id, v_os.loja_id, v_lote.lote_id, v_item.produto_id, 'SAIDA',
                least(v_restante, v_lote.saldo), 'manual',
                md5('os:' || v_os.id::text || ':' || v_item.id::text || ':' || v_lote.lote_id::text)::uuid,
                'OS ' || lpad(v_os.numero::text, 6, '0'));
        v_restante := v_restante - least(v_restante, v_lote.saldo);
      end loop;
      if v_restante > 0 then
        -- Defensiva (corrida entre duas entregas): cita o produto com o saldo do momento.
        raise exception 'Estoque insuficiente: % — necessário %, disponível %.',
          (select nome from public.produtos where id = v_item.produto_id),
          replace(trim_scale(v_item.quantidade)::text, '.', ','),
          replace(trim_scale((select coalesce(sum(saldo), 0) from public.estoque_saldos
            where loja_id = v_os.loja_id and produto_id = v_item.produto_id and saldo > 0))::text, '.', ',')
          using errcode = 'P0001', hint = 'ESTOQUE_INSUFICIENTE';
      end if;
    end loop;
    -- (c) itens de estoque ficam marcados como baixados
    update public.os_itens set baixado_em = now()
    where os_id = v_os.id and origem = 'estoque' and produto_id is not null;
  end if;

  update public.ordens_servico set
    status              = p_status,
    orcado_em           = case when p_status = 'aguardando_aprovacao' then now() else orcado_em end,
    aprovada_em         = case when p_status = 'aprovada' then now() else aprovada_em end,
    aprovada_por        = case when p_status = 'aprovada' then auth.uid() else aprovada_por end,
    aprovada_por_nome   = case when p_status = 'aprovada' then v_nome else aprovada_por_nome end,
    pronta_em           = case when p_status = 'pronta' then now() else pronta_em end,
    entregue_em         = case when p_status = 'entregue' then now() else entregue_em end,
    entregue_por        = case when p_status = 'entregue' then auth.uid() else entregue_por end,
    entregue_por_nome   = case when p_status = 'entregue' then v_nome else entregue_por_nome end,
    cancelada_em        = case when p_status = 'cancelada' then now() else cancelada_em end,
    cancelada_por       = case when p_status = 'cancelada' then auth.uid() else cancelada_por end,
    cancelada_por_nome  = case when p_status = 'cancelada' then v_nome else cancelada_por_nome end,
    motivo_cancelamento = case when p_status = 'cancelada' then trim(p_motivo) else motivo_cancelamento end
  where id = v_os.id;
end $$;

-- Define (substitui) os itens da OS numa tacada — só até a aprovação do
-- orçamento. Tudo ou nada: qualquer item inválido recusa a chamada inteira.
create or replace function public.os_definir_itens(p_os uuid, p_itens jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_os         public.ordens_servico;
  v_item       jsonb;
  v_ordem      smallint := 0;
  v_origem     text;
  v_produto    uuid;
  v_descricao  text;
  v_quantidade numeric;
  v_preco      numeric;
begin
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Lista de itens inválida.' using errcode = 'P0001';
  end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.membros m
    where m.empresa_id = v_os.empresa_id and m.usuario_id = auth.uid() and m.ativo
      and m.papel in ('dono', 'gerente', 'estoquista')
      and (m.lojas is null or v_os.loja_id = any (m.lojas))
  ) then
    raise exception 'Você não tem permissão para editar os itens da ordem de serviço.' using errcode = '42501';
  end if;
  if v_os.empresa_id not in (select app.empresas_gravaveis()) then
    raise exception 'Assinatura em atraso: o sistema está somente para consulta.' using errcode = '42501';
  end if;
  if v_os.status not in ('aberta', 'em_diagnostico', 'aguardando_aprovacao') then
    raise exception 'Itens da OS % não podem ser alterados depois da aprovação do orçamento.',
      lpad(v_os.numero::text, 6, '0') using errcode = 'P0001', hint = 'ITENS_TRAVADOS';
  end if;
  delete from public.os_itens where os_id = v_os.id;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_ordem  := v_ordem + 1;
    v_origem := coalesce(v_item ->> 'origem', 'estoque');
    if v_origem not in ('estoque', 'avulsa') then
      raise exception 'Origem do item inválida: use "estoque" ou "avulsa".' using errcode = 'P0001';
    end if;
    v_descricao := nullif(trim(coalesce(v_item ->> 'descricao', '')), '');
    if v_descricao is null then
      raise exception 'Informe a descrição do item.' using errcode = 'P0001';
    end if;
    v_quantidade := (v_item ->> 'quantidade')::numeric;
    if v_quantidade is null or v_quantidade <= 0 then
      raise exception 'Informe a quantidade do item "%".', v_descricao using errcode = 'P0001';
    end if;
    v_preco := (v_item ->> 'preco_unitario')::numeric;
    if v_preco is null or v_preco < 0 then
      raise exception 'O preço do item "%" não pode ser negativo.', v_descricao using errcode = 'P0001';
    end if;
    v_produto := case when v_origem = 'estoque' then (v_item ->> 'produto_id')::uuid else null end;
    if v_produto is not null and not exists (
      select 1 from public.produtos where id = v_produto and empresa_id = v_os.empresa_id
    ) then
      raise exception 'Produto "%" não encontrado no catálogo desta empresa.', v_descricao using errcode = 'P0001';
    end if;
    insert into public.os_itens (empresa_id, os_id, loja_id, ordem, origem, produto_id, descricao, quantidade, preco_unitario)
    values (v_os.empresa_id, v_os.id, v_os.loja_id, v_ordem, v_origem, v_produto, v_descricao, v_quantidade, v_preco);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 4. Segurança: RLS e privilégios
-- ---------------------------------------------------------------------
alter table public.ordens_servico enable row level security;
alter table public.os_itens       enable row level security;
alter table public.os_pagamentos  enable row level security;

revoke all on public.ordens_servico, public.os_itens, public.os_pagamentos from anon;
revoke insert, update, delete, truncate
  on public.ordens_servico, public.os_itens, public.os_pagamentos from authenticated;

-- Ordem: a equipe consulta por loja; dono, gerente e estoquista gravam os
-- dados de recebimento/orçamento. Status, marcos, número e loja NÃO recebem
-- grant: o andamento só muda pela função os_mudar_status.
grant insert (empresa_id, loja_id, cliente_nome, cliente_telefone, cliente_documento,
              aparelho_tipo, aparelho_marca_modelo, aparelho_serie_imei, aparelho_cor, aparelho_senha,
              aparelho_acessorios, aparelho_estado, defeito_relatado, prazo_prometido,
              valor_mao_de_obra, desconto, garantia_dias, tecnico_id, tecnico_nome)
  on public.ordens_servico to authenticated;
grant update (cliente_nome, cliente_telefone, cliente_documento,
              aparelho_tipo, aparelho_marca_modelo, aparelho_serie_imei, aparelho_cor, aparelho_senha,
              aparelho_acessorios, aparelho_estado, defeito_relatado, diagnostico, prazo_prometido,
              valor_mao_de_obra, desconto, garantia_dias, tecnico_id, tecnico_nome)
  on public.ordens_servico to authenticated;
grant insert (empresa_id, os_id, loja_id, ordem, origem, produto_id, descricao, quantidade, preco_unitario)
  on public.os_itens to authenticated;
grant update (ordem, origem, produto_id, descricao, quantidade, preco_unitario)
  on public.os_itens to authenticated;
grant insert (empresa_id, os_id, loja_id, forma, valor)
  on public.os_pagamentos to authenticated;

create policy ordens_leitura on public.ordens_servico for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
create policy ordens_cadastro on public.ordens_servico for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista']))
    and empresa_id in (select app.empresas_gravaveis())
    and loja_id in (select app.minhas_lojas()));
create policy ordens_edicao on public.ordens_servico for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista'])))
  with check (empresa_id in (select app.empresas_gravaveis()));

create policy itens_leitura on public.os_itens for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
create policy itens_cadastro on public.os_itens for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista']))
    and empresa_id in (select app.empresas_gravaveis())
    and exists (select 1 from public.ordens_servico o
                where o.id = os_id
                  and o.empresa_id = os_itens.empresa_id
                  and o.loja_id = os_itens.loja_id));
create policy itens_edicao on public.os_itens for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista'])))
  with check (empresa_id in (select app.empresas_gravaveis()));

create policy pagamentos_leitura on public.os_pagamentos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and loja_id in (select app.minhas_lojas()));
-- O caixa recebe quando a OS está pronta (a entrega confere o total no banco).
create policy pagamentos_cadastro on public.os_pagamentos for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono', 'gerente', 'caixa']))
    and empresa_id in (select app.empresas_gravaveis())
    and loja_id in (select app.minhas_lojas())
    and exists (select 1 from public.ordens_servico o
                where o.id = os_id
                  and o.empresa_id = os_pagamentos.empresa_id
                  and o.loja_id = os_pagamentos.loja_id
                  and o.status = 'pronta'));

-- As regras do módulo (app.os_*) só rodam pelos gatilhos, nunca chamadas direto.
revoke execute on function public.os_mudar_status(uuid, text, text), public.os_definir_itens(uuid, jsonb)
  from public, anon;
grant execute on function public.os_mudar_status(uuid, text, text), public.os_definir_itens(uuid, jsonb)
  to authenticated;
revoke execute on function app.os_carimbar(), app.os_proteger(), app.os_itens_proteger(),
                           app.os_pagamentos_carimbar(), app.os_pagamentos_proteger()
  from public, anon, authenticated;

-- Tempo real: a retaguarda vê a ordem mudar de status.
alter publication supabase_realtime add table public.ordens_servico;


-- ---------------------------------------------------------------------
-- 5. Expurgo (plataforma): inclui as tabelas do módulo de serviços
-- ---------------------------------------------------------------------
create or replace function app.expurgar_empresa(p_empresa uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.expurgo', p_empresa::text, true);
  delete from public.movimentacoes where empresa_id = p_empresa;
  delete from public.estoque_saldos where empresa_id = p_empresa;
  delete from public.os_pagamentos where empresa_id = p_empresa;
  delete from public.os_itens where empresa_id = p_empresa;
  delete from public.ordens_servico where empresa_id = p_empresa;
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
