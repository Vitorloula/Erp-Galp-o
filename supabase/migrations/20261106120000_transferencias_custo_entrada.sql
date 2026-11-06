-- Custo da última compra, registrado junto com a entrada, e transferência
-- atômica de saldo entre lojas da mesma empresa.

alter table public.movimentacoes
  add column custo_unitario numeric(14, 4)
    check (custo_unitario is null or custo_unitario >= 0);

create unique index movimentacoes_transferencia_unica_idx
  on public.movimentacoes (empresa_id, transferencia_id, tipo)
  where transferencia_id is not null;

-- Substitui a assinatura anterior para manter a alteração de custo e o
-- lançamento de entrada na mesma transação. Chamadas antigas seguem válidas
-- porque p_custo tem valor padrão.
drop function public.registrar_entrada(uuid, uuid, text, date, numeric, text, text, uuid);

create function public.registrar_entrada(
  p_loja_id uuid,
  p_produto_id uuid,
  p_lote text,
  p_validade date,
  p_quantidade numeric,
  p_documento text default null,
  p_observacao text default null,
  p_origem_id uuid default null,
  p_custo numeric default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_lote text := upper(trim(coalesce(p_lote, '')));
  v_lote_id uuid;
  v_mov bigint;
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
  where empresa_id = v_empresa and produto_id = p_produto_id
    and lote = v_lote and validade is not distinct from p_validade;

  insert into public.movimentacoes (
    empresa_id, loja_id, lote_id, tipo, quantidade, documento,
    observacao, origem_id, custo_unitario
  )
  values (
    v_empresa, p_loja_id, v_lote_id, 'ENTRADA', p_quantidade, p_documento,
    p_observacao, p_origem_id, p_custo
  )
  returning id into v_mov;

  if p_custo is not null then
    update public.produtos set custo_ultimo = p_custo
    where id = p_produto_id and empresa_id = v_empresa;
  end if;

  return v_mov;
end $$;

revoke execute on function public.registrar_entrada(uuid, uuid, text, date, numeric, text, text, uuid, numeric)
  from public, anon;
grant execute on function public.registrar_entrada(uuid, uuid, text, date, numeric, text, text, uuid, numeric)
  to authenticated;

create or replace function public.transferir_estoque(
  p_empresa uuid,
  p_origem uuid,
  p_destino uuid,
  p_lote uuid,
  p_quantidade numeric,
  p_motivo text,
  p_transferencia uuid
)
returns table (saida_id bigint, entrada_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produto uuid;
  v_saldo numeric;
  v_existente record;
begin
  if auth.uid() is null
     or p_empresa not in (select app.empresas_com_papel(array['dono', 'gerente', 'estoquista']))
     or p_empresa not in (select app.empresas_gravaveis()) then
    raise exception 'Sem permissão para transferir estoque.' using errcode = '42501';
  end if;
  if p_origem = p_destino then
    raise exception 'Escolha lojas diferentes para a transferência.' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Informe uma quantidade maior que zero.' using errcode = '23514';
  end if;
  if p_transferencia is null then
    raise exception 'Identificador de transferência inválido.' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da transferência.' using errcode = '23514';
  end if;
  if p_origem not in (select app.minhas_lojas()) or p_destino not in (select app.minhas_lojas()) then
    raise exception 'Você não tem acesso às duas lojas desta transferência.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lojas where id = p_origem and empresa_id = p_empresa and ativo)
     or not exists (select 1 from public.lojas where id = p_destino and empresa_id = p_empresa and ativo) then
    raise exception 'Uma das lojas não está ativa nesta empresa.' using errcode = 'P0001';
  end if;

  select produto_id into v_produto from public.lotes
  where id = p_lote and empresa_id = p_empresa;
  if v_produto is null then
    raise exception 'Lote não encontrado nesta empresa.' using errcode = 'P0001';
  end if;

  -- Serializa reenvios simultâneos da mesma operação e garante idempotência.
  perform pg_advisory_xact_lock(hashtextextended(p_empresa::text || ':' || p_transferencia::text, 0));
  select s.id as saida_id, e.id as entrada_id, s.loja_id as origem,
         e.loja_id as destino, s.lote_id, s.quantidade, s.observacao
  into v_existente
  from public.movimentacoes s
  join public.movimentacoes e on e.empresa_id = s.empresa_id
    and e.transferencia_id = s.transferencia_id and e.tipo = 'TRANSF_ENTRADA'
  where s.empresa_id = p_empresa and s.transferencia_id = p_transferencia and s.tipo = 'TRANSF_SAIDA';
  if found then
    if v_existente.origem is distinct from p_origem
       or v_existente.destino is distinct from p_destino
       or v_existente.lote_id is distinct from p_lote
       or v_existente.quantidade is distinct from p_quantidade
       or v_existente.observacao is distinct from trim(p_motivo) then
      raise exception 'Identificador de transferência reutilizado com dados diferentes.' using errcode = '23505';
    end if;
    saida_id := v_existente.saida_id;
    entrada_id := v_existente.entrada_id;
    return next;
    return;
  end if;

  perform 1 from public.estoque_saldos
  where loja_id in (p_origem, p_destino) and lote_id = p_lote
  order by loja_id for update;
  select saldo into v_saldo from public.estoque_saldos
  where loja_id = p_origem and lote_id = p_lote;
  if coalesce(v_saldo, 0) < p_quantidade then
    raise exception 'Saldo insuficiente na loja de origem. Disponível: %', coalesce(v_saldo, 0)
      using errcode = 'P0001', hint = 'SALDO_INSUFICIENTE';
  end if;

  insert into public.movimentacoes (
    empresa_id, loja_id, lote_id, produto_id, tipo, quantidade,
    observacao, origem, transferencia_id
  ) values (
    p_empresa, p_origem, p_lote, v_produto, 'TRANSF_SAIDA', p_quantidade,
    trim(p_motivo), 'manual', p_transferencia
  ) returning id into saida_id;

  insert into public.movimentacoes (
    empresa_id, loja_id, lote_id, produto_id, tipo, quantidade,
    observacao, origem, transferencia_id
  ) values (
    p_empresa, p_destino, p_lote, v_produto, 'TRANSF_ENTRADA', p_quantidade,
    trim(p_motivo), 'manual', p_transferencia
  ) returning id into entrada_id;

  return next;
end $$;

revoke execute on function public.transferir_estoque(uuid, uuid, uuid, uuid, numeric, text, uuid)
  from public, anon;
grant execute on function public.transferir_estoque(uuid, uuid, uuid, uuid, numeric, text, uuid)
  to authenticated;
