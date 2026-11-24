-- =====================================================================
--  Atendimento WhatsApp — pedidos (F2)
--  RPC criar_pedido recalcula o total no servidor a partir de produto_id + qtd.
-- =====================================================================

create or replace function public.criar_pedido(
  p_empresa uuid,
  p_loja uuid,
  p_contato uuid default null,
  p_conversa uuid default null,
  p_retirada_ou_entrega text default 'retirada',
  p_endereco_entrega text default null,
  p_observacao text default null,
  p_itens jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido uuid;
  v_item jsonb;
  v_produto public.produtos;
  v_qtd numeric;
  v_preco bigint;
  v_subtotal bigint;
  v_total bigint := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens.' using errcode = 'P0001';
  end if;
  if p_retirada_ou_entrega not in ('retirada', 'entrega') then
    raise exception 'Tipo de retirada inválido.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (empresa_id, loja_id, contato_id, conversa_id, retirada_ou_entrega, endereco_entrega, observacao, status)
  values (p_empresa, p_loja, p_contato, p_conversa, p_retirada_ou_entrega, p_endereco_entrega, p_observacao, 'aguardando_confirmacao')
  returning id into v_pedido;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item ->> 'qtd')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end if;
    select * into v_produto from public.produtos
      where id = (v_item ->> 'produto_id')::uuid and empresa_id = p_empresa and ativo = true;
    if v_produto.id is null then
      raise exception 'Produto não encontrado: %', (v_item ->> 'produto_id') using errcode = 'P0001';
    end if;
    -- preço vigente do produto (centavos)
    v_preco := round(v_produto.preco_venda * 100)::bigint;
    v_subtotal := (v_preco * v_qtd)::bigint;
    v_total := v_total + v_subtotal;
    insert into public.pedidos_itens (pedido_id, empresa_id, produto_id, nome_snapshot, qtd, preco_unit_centavos, subtotal_centavos)
    values (v_pedido, p_empresa, v_produto.id, v_produto.nome, v_qtd, v_preco, v_subtotal);
  end loop;

  update public.pedidos set total_centavos = v_total, atualizado_em = now() where id = v_pedido;
  return v_pedido;
end $$;

create or replace function public.consultar_pedido(
  p_empresa uuid,
  p_numero bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
  v_itens jsonb;
begin
  select * into v_pedido from public.pedidos where empresa_id = p_empresa and numero = p_numero;
  if v_pedido.id is null then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'nome', pi.nome_snapshot,
    'qtd', pi.qtd,
    'preco_unit_centavos', pi.preco_unit_centavos,
    'subtotal_centavos', pi.subtotal_centavos
  )), '[]'::jsonb) into v_itens
  from public.pedidos_itens pi where pi.pedido_id = v_pedido.id;

  return jsonb_build_object(
    'numero', v_pedido.numero,
    'status', v_pedido.status,
    'retirada_ou_entrega', v_pedido.retirada_ou_entrega,
    'total_centavos', v_pedido.total_centavos,
    'criado_em', v_pedido.criado_em,
    'itens', v_itens
  );
end $$;

create or replace function public.confirmar_pedido(
  p_empresa uuid,
  p_pedido uuid,
  p_usuario uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pedidos
    set status = 'confirmado', confirmado_por = p_usuario, confirmado_em = now(), atualizado_em = now()
    where id = p_pedido and empresa_id = p_empresa and status = 'aguardando_confirmacao';
  if not found then
    raise exception 'Pedido não encontrado ou já confirmado.' using errcode = 'P0001';
  end if;
end $$;

-- Grants: authenticated (frontend) e service_role (worker)
revoke execute on function public.criar_pedido(uuid, uuid, uuid, uuid, text, text, text, jsonb) from public, anon;
revoke execute on function public.consultar_pedido(uuid, bigint) from public, anon;
revoke execute on function public.confirmar_pedido(uuid, uuid, uuid) from public, anon;

grant execute on function public.criar_pedido(uuid, uuid, uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.consultar_pedido(uuid, bigint) to authenticated;
grant execute on function public.confirmar_pedido(uuid, uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.criar_pedido(uuid, uuid, uuid, uuid, text, text, text, jsonb) to service_role;
    grant execute on function public.consultar_pedido(uuid, bigint) to service_role;
    grant execute on function public.confirmar_pedido(uuid, uuid, uuid) to service_role;
  end if;
end $$;
