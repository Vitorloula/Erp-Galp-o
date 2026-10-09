-- =====================================================================
--  Fase 2 — cadastro de produto com os campos do caixa:
--  vendido por peso (balança), código na balança (PLU) e controle de estoque.
-- =====================================================================
create or replace function public.salvar_produto(p_empresa uuid, p_id uuid, p_dados jsonb, p_codigos jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id        uuid := p_id;
  v_codigo    text;
  v_canonicos text[] := '{}';
  v_outro     text;
  c           jsonb;
begin
  if v_id is null then
    insert into public.produtos (empresa_id, codigo_interno, nome, categoria_id, unidade, conteudo_embalagem,
                                 preco_venda, custo_ultimo, rastreio, fabricante, observacao, ativo,
                                 pesavel, codigo_balanca, controla_estoque)
    values (p_empresa, coalesce(p_dados ->> 'codigo_interno', ''), p_dados ->> 'nome', (p_dados ->> 'categoria_id')::uuid,
            p_dados ->> 'unidade', (p_dados ->> 'conteudo_embalagem')::numeric, (p_dados ->> 'preco_venda')::numeric,
            (p_dados ->> 'custo_ultimo')::numeric, coalesce(p_dados ->> 'rastreio', 'nenhum'), p_dados ->> 'fabricante',
            p_dados ->> 'observacao', coalesce((p_dados ->> 'ativo')::boolean, true),
            coalesce((p_dados ->> 'pesavel')::boolean, false), p_dados ->> 'codigo_balanca',
            coalesce((p_dados ->> 'controla_estoque')::boolean, true))
    returning id into v_id;
  else
    update public.produtos set
      codigo_interno     = coalesce(p_dados ->> 'codigo_interno', ''),
      nome               = p_dados ->> 'nome',
      categoria_id       = (p_dados ->> 'categoria_id')::uuid,
      unidade            = p_dados ->> 'unidade',
      conteudo_embalagem = (p_dados ->> 'conteudo_embalagem')::numeric,
      preco_venda        = (p_dados ->> 'preco_venda')::numeric,
      custo_ultimo       = (p_dados ->> 'custo_ultimo')::numeric,
      rastreio           = coalesce(p_dados ->> 'rastreio', 'nenhum'),
      fabricante         = p_dados ->> 'fabricante',
      observacao         = p_dados ->> 'observacao',
      ativo              = coalesce((p_dados ->> 'ativo')::boolean, true),
      pesavel            = coalesce((p_dados ->> 'pesavel')::boolean, false),
      codigo_balanca     = p_dados ->> 'codigo_balanca',
      controla_estoque   = coalesce((p_dados ->> 'controla_estoque')::boolean, true)
    where id = v_id and empresa_id = p_empresa;
    if not found then
      raise exception 'Produto não encontrado ou sem permissão para editá-lo.' using errcode = '42501';
    end if;
  end if;

  for c in select * from jsonb_array_elements(coalesce(p_codigos, '[]'::jsonb)) loop
    v_codigo := app.canonizar_codigo(coalesce(c ->> 'codigo', ''));
    continue when v_codigo = '' or v_codigo = any (v_canonicos);
    select p.nome into v_outro
    from public.produtos_codigos pc join public.produtos p on p.id = pc.produto_id
    where pc.empresa_id = p_empresa and pc.codigo = v_codigo and pc.produto_id <> v_id;
    if found then
      raise exception 'O código % já está cadastrado no produto "%".', c ->> 'codigo', v_outro
        using errcode = 'P0001', hint = 'CODIGO_DUPLICADO';
    end if;
    v_canonicos := v_canonicos || v_codigo;
    insert into public.produtos_codigos (empresa_id, produto_id, codigo, fator)
    values (p_empresa, v_id, v_codigo, coalesce((c ->> 'fator')::numeric, 1))
    on conflict (empresa_id, codigo) do update set fator = excluded.fator;
  end loop;

  delete from public.produtos_codigos
  where empresa_id = p_empresa and produto_id = v_id and not (codigo = any (v_canonicos));
  return v_id;
end $$;

-- Código de balança repetido na empresa: mensagem clara (o índice único já impede).
comment on index public.produtos_balanca_unico is 'Código de balança (PLU) único por empresa';
