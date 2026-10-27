-- =====================================================================
--  Importacao de catalogo + saldo inicial (onboarding de loja real).
--
--  Cada linha e importada em uma subtransacao: uma linha invalida nao
--  derruba o arquivo inteiro. O retorno informa quantos produtos/entradas
--  foram criados e quais linhas falharam.
--
--  A funcao roda com as permissoes de quem chama (RLS): somente dono,
--  gerente ou estoquista de uma empresa gravavel consegue importar.
--  A criacao de categoria tambem respeita a politica de categorias.
-- =====================================================================

create or replace function public.importar_catalogo(
  p_empresa uuid,
  p_loja uuid,
  p_linhas jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_linha      jsonb;
  v_produto    uuid;
  v_categoria  uuid;
  v_nome_cat   text;
  v_criados    int := 0;
  v_estoques   int := 0;
  v_erros      jsonb := '[]'::jsonb;
  v_linha_n    int;
  v_mensagem   text;
  v_quantidade numeric;
begin
  if jsonb_typeof(coalesce(p_linhas, 'null'::jsonb)) <> 'array' then
    raise exception 'Arquivo de importacao invalido.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from app.empresas_com_papel(array['dono', 'gerente', 'estoquista']) x
    where x = p_empresa
  ) then
    raise exception 'Sem permissao para importar o catalogo.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from app.empresas_gravaveis() x where x = p_empresa
  ) then
    raise exception 'A assinatura esta somente para consulta.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.lojas
    where id = p_loja and empresa_id = p_empresa
  ) then
    raise exception 'Loja nao encontrada ou sem permissao.' using errcode = '42501';
  end if;

  for v_linha in select value from jsonb_array_elements(p_linhas) loop
    v_linha_n := coalesce((v_linha ->> 'linha')::int, 0);
    begin
      v_nome_cat := nullif(trim(coalesce(v_linha ->> 'categoria', '')), '');
      v_categoria := null;
      if v_nome_cat is not null then
        select id into v_categoria
        from public.categorias
        where empresa_id = p_empresa and lower(nome) = lower(v_nome_cat)
        limit 1;

        if v_categoria is null then
          insert into public.categorias (empresa_id, nome)
          values (p_empresa, v_nome_cat)
          returning id into v_categoria;
        end if;
      end if;

      v_produto := public.salvar_produto(
        p_empresa,
        null,
        jsonb_build_object(
          'nome', trim(coalesce(v_linha ->> 'nome', '')),
          'codigo_interno', coalesce(v_linha ->> 'codigo_interno', ''),
          'categoria_id', v_categoria,
          'unidade', coalesce(nullif(v_linha ->> 'unidade', ''), 'un'),
          'conteudo_embalagem', nullif(v_linha ->> 'conteudo_embalagem', '')::numeric,
          'preco_venda', nullif(v_linha ->> 'preco_venda', '')::numeric,
          'fabricante', nullif(v_linha ->> 'fabricante', ''),
          'observacao', nullif(v_linha ->> 'observacao', ''),
          'ativo', true,
          'controla_estoque', coalesce((v_linha ->> 'controla_estoque')::boolean, true),
          'rastreio', coalesce(nullif(v_linha ->> 'rastreio', ''), 'nenhum'),
          'pesavel', false
        ),
        coalesce(v_linha -> 'codigos', '[]'::jsonb)
      );

      -- O RPC salvar_produto nao recebe o ponto de pedido em versoes antigas;
      -- grava aqui para o minimo viajar entre os aparelhos desde a importacao.
      update public.produtos
      set estoque_minimo = case
        when nullif(v_linha ->> 'estoque_minimo', '') is null then null
        when (v_linha ->> 'estoque_minimo')::numeric > 0 then (v_linha ->> 'estoque_minimo')::numeric
        else null
      end
      where id = v_produto and empresa_id = p_empresa;

      v_quantidade := coalesce(nullif(v_linha ->> 'quantidade', '')::numeric, 0);
      if v_quantidade < 0 then
        raise exception 'Quantidade inicial nao pode ser negativa.' using errcode = 'P0001';
      end if;

      if v_quantidade > 0 then
        perform public.registrar_entrada(
          p_loja,
          v_produto,
          coalesce(v_linha ->> 'lote', ''),
          nullif(v_linha ->> 'validade', '')::date,
          v_quantidade,
          nullif(v_linha ->> 'documento', ''),
          'Saldo inicial importado',
          gen_random_uuid()
        );
        v_estoques := v_estoques + 1;
      end if;

      -- Só conta depois de produto e saldo concluídos: a exceção desfaz as
      -- linhas gravadas, mas não desfaz variáveis PL/pgSQL.
      v_criados := v_criados + 1;
    exception when others then
      v_mensagem := sqlerrm;
      if jsonb_array_length(v_erros) < 200 then
        v_erros := v_erros || jsonb_build_array(jsonb_build_object(
          'linha', v_linha_n,
          'mensagem', v_mensagem
        ));
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'criados', v_criados,
    'estoques', v_estoques,
    'erros', v_erros
  );
end $$;

grant execute on function public.importar_catalogo(uuid, uuid, jsonb) to authenticated;
revoke execute on function public.importar_catalogo(uuid, uuid, jsonb) from public, anon;
