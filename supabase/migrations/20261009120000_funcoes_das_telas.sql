-- =====================================================================
--  Fase 1 — funções usadas pelas telas multiempresa
--    * minhas_empresas(): empresas do usuário, papel e situação da assinatura
--    * ver_convite(): mostra de qual empresa é um convite antes de aceitar
--    * salvar_produto(): produto + códigos de barras numa só transação
--    * criar_empresa_exemplo(): empresa de demonstração com dados de exemplo
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Empresas do usuário (com o estado da assinatura calculado no banco)
-- ---------------------------------------------------------------------
create or replace function public.minhas_empresas()
returns table (
  empresa_id uuid, nome text, segmento text, config jsonb, fuso text,
  papel text, lojas uuid[], estado text,
  plano_id text, plano_nome text, status text, trial_ate timestamptz, pago_ate timestamptz
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.nome, e.segmento, e.config, e.fuso,
         m.papel, m.lojas, app.estado_empresa(e.id),
         a.plano_id, p.nome, a.status, a.trial_ate, a.pago_ate
  from public.membros m
  join public.empresas e on e.id = m.empresa_id
  left join public.assinaturas a on a.empresa_id = e.id
  left join public.planos p on p.id = a.plano_id
  where m.usuario_id = (select auth.uid()) and m.ativo
  order by e.criado_em;
$$;


-- ---------------------------------------------------------------------
-- 2. Convite: quem tem o link vê a empresa e o papel (sem aceitar ainda)
-- ---------------------------------------------------------------------
create or replace function public.ver_convite(p_token text)
returns table (empresa text, papel text, situacao text)
language sql stable security definer set search_path = '' as $$
  select e.nome, c.papel,
         case when c.cancelado_em is not null or c.aceito_em is not null then 'usado'
              when c.expira_em < now() then 'expirado'
              else 'valido' end
  from public.convites c
  join public.empresas e on e.id = c.empresa_id
  where c.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;


-- ---------------------------------------------------------------------
-- 3. Produto e códigos de barras numa só transação
--    Roda com as permissões de quem chama (RLS): caixa não cadastra, ninguém
--    mexe em outra empresa. Código repetido gera mensagem clara.
-- ---------------------------------------------------------------------
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
                                 preco_venda, custo_ultimo, rastreio, fabricante, observacao, ativo)
    values (p_empresa, coalesce(p_dados ->> 'codigo_interno', ''), p_dados ->> 'nome', (p_dados ->> 'categoria_id')::uuid,
            p_dados ->> 'unidade', (p_dados ->> 'conteudo_embalagem')::numeric, (p_dados ->> 'preco_venda')::numeric,
            (p_dados ->> 'custo_ultimo')::numeric, coalesce(p_dados ->> 'rastreio', 'nenhum'), p_dados ->> 'fabricante',
            p_dados ->> 'observacao', coalesce((p_dados ->> 'ativo')::boolean, true))
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
      ativo              = coalesce((p_dados ->> 'ativo')::boolean, true)
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


-- ---------------------------------------------------------------------
-- 4. Empresa de exemplo (galpão de defensivos e fertilizantes)
--    Mesmos dados da antiga demonstração: lotes vencidos, vencendo, zerados,
--    histórico de 60 dias e uma correção. Datas relativas a hoje no fuso da empresa.
--    Lançamentos com origem "sistema" (carga de exemplo), que preserva a data original.
-- ---------------------------------------------------------------------
create or replace function app.semear_exemplo_galpao(p_empresa uuid, p_loja uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_fuso    text := (select fuso from public.empresas where id = p_empresa);
  v_hoje    date := (now() at time zone v_fuso)::date;
  v_equipe  text[] := array['João (pátio)', 'Maria (escritório)', 'Carlos (pátio)'];
  -- [nome, categoria, unidade, embalagem, EAN, fabricante, preço, lotes]
  -- lote: [número, validade em dias (null = sem validade), entradas [[dias atrás, qtd, doc]], saídas [[dias atrás, qtd, doc]]]
  v_modelos jsonb := $json$[
    ["Glifosato 480 SL", "Defensivo agrícola", "L", 20, "7891000000014", "AgroSul Química", 32.9,
      [["GL2508", 240, [[40, 400, "NF 10421"]], [[33, 60, "Ped. 881"], [12, 80, "Ped. 902"], [2, 20, "Ped. 915"]]]]],
    ["Atrazina 500 SC", "Defensivo agrícola", "L", 20, "7891000000021", "AgroSul Química", 28.5,
      [["AT2401", -9, [[58, 100, "NF 10188"]], [[30, 60, "Ped. 870"]]],
       ["AT2507", 310, [[6, 120, "NF 10502"]], []]]],
    ["Mancozebe 800 WP", "Defensivo agrícola", "kg", 25, "7891000000038", "Campo Forte", 41.0,
      [["MZ0325", 18, [[50, 200, "NF 10230"]], [[21, 75, null], [4, 50, "Ped. 911"]]]]],
    ["Lambda-cialotrina 50 EC", "Defensivo agrícola", "L", 1, "7891000000045", "Campo Forte", 96.0,
      [["LC1124", 25, [[44, 30, "NF 10301"]], [[9, 18, "Ped. 897"]]]]],
    ["2,4-D Amina 806 SL", "Defensivo agrícola", "L", 20, "7891000000052", "AgroSul Química", 24.9,
      [["DA0925", 400, [[35, 80, "NF 10377"]], [[20, 40, "Ped. 884"], [3, 40, "Ped. 913"]]]]],
    ["Tiametoxam 350 FS", "Defensivo agrícola", "L", 1, "7891000000069", "Sementec", 310.0,
      [["TM0824", 11, [[47, 24, "NF 10255"]], [[15, 18, null]]]]],
    ["Ureia 45% N (saco 50 kg)", "Fertilizante", "sc", null, null, "Fertimais", 189.0,
      [["", 520, [[55, 300, "NF 88120"]], [[41, 60, null], [26, 40, "Romaneio 51"], [1, 20, "Romaneio 58"]]]]],
    ["MAP 11-52-00 (saco 50 kg)", "Fertilizante", "sc", null, "7891000000083", "Fertimais", 245.0,
      [["MP2509", 610, [[14, 120, "NF 88301"]], [[5, 25, "Romaneio 55"]]]]],
    ["Cloreto de Potássio KCl 60%", "Fertilizante", "sc", null, null, "Fertimais", 178.0,
      [["", null, [[52, 80, "NF 88119"]], [[31, 50, null], [8, 30, "Romaneio 53"]]]]],
    ["NPK 04-14-08 (big bag)", "Fertilizante", "t", 1, null, "Fertimais", 3150.0,
      [["BB-0925", 260, [[22, 18, "NF 88250"]], [[7, 5.5, "Romaneio 54"]]]]],
    ["Óleo mineral adjuvante", "Adjuvante", "L", 5, "7891000000113", "Campo Forte", 18.0,
      [["OM2506", 95, [[29, 60, "NF 10360"]], [[10, 25, null]]]]],
    ["Fertilizante foliar Boro 10%", "Fertilizante", "ml", 1000, "7891000000120", "Nutriplant", 0.06,
      [["BO0724", -3, [[57, 12000, "NF 4410"]], [[27, 3500, null]]]]]
  ]$json$;
  m        jsonb;
  l        jsonb;
  e        jsonb;
  v_prod   uuid;
  v_lote   uuid;
  v_dias   int;
  v_hora   int;
  v_movs   jsonb := '[]'::jsonb;
  v_mov    record;
  v_ids    jsonb := '{}'::jsonb;
  v_id     bigint;
  v_glifo  text;
begin
  for m in select * from jsonb_array_elements(v_modelos) loop
    insert into public.produtos (empresa_id, nome, categoria_id, unidade, conteudo_embalagem, preco_venda, rastreio, fabricante)
    values (p_empresa, m ->> 0, (select id from public.categorias where empresa_id = p_empresa and nome = m ->> 1),
            m ->> 2, (m ->> 3)::numeric, (m ->> 6)::numeric, 'lote', m ->> 5)
    returning id into v_prod;
    if m ->> 4 is not null then
      insert into public.produtos_codigos (empresa_id, produto_id, codigo) values (p_empresa, v_prod, m ->> 4);
    end if;

    for l in select * from jsonb_array_elements(m -> 7) loop
      insert into public.lotes (empresa_id, produto_id, lote, validade)
      values (p_empresa, v_prod, l ->> 0, v_hoje + (l ->> 1)::int)
      returning id into v_lote;
      for e in select * from jsonb_array_elements(l -> 2) loop
        v_dias := (e ->> 0)::int; v_hora := 8;
        v_movs := v_movs || jsonb_build_object('lote', v_lote, 'tipo', 'ENTRADA', 'dias', v_dias, 'hora', v_hora,
                                               'qtd', e -> 1, 'doc', e ->> 2, 'chave', v_lote || ':E:' || v_dias);
      end loop;
      for i in 0 .. jsonb_array_length(l -> 3) - 1 loop
        e := l -> 3 -> i;
        v_dias := (e ->> 0)::int; v_hora := 10 + i;
        v_movs := v_movs || jsonb_build_object('lote', v_lote, 'tipo', 'SAIDA', 'dias', v_dias, 'hora', v_hora,
                                               'qtd', e -> 1, 'doc', e ->> 2, 'chave', v_lote || ':S:' || v_dias);
        if m ->> 0 = 'Glifosato 480 SL' and i = 0 then
          v_glifo := v_lote || ':S:' || v_dias;
          -- Exemplo de correção: saída digitada a mais, corrigida uma hora depois.
          v_movs := v_movs || jsonb_build_object('lote', v_lote, 'tipo', 'CORRECAO', 'dias', v_dias, 'hora', v_hora + 1,
                                                 'qtd', 20, 'obs', 'Saída lançada com 60 L, o correto eram 40 L',
                                                 'usuario', 'Maria (escritório)', 'ref', v_glifo);
        end if;
      end loop;
    end loop;
  end loop;

  -- Lança em ordem cronológica (os números dos lançamentos crescem com o tempo).
  for v_mov in
    select x.*, ((v_hoje - x.dias)::timestamp + make_interval(hours => x.hora, mins => (x.dias * 17) % 60)) at time zone v_fuso as quando
    from jsonb_to_recordset(v_movs) as x(lote uuid, tipo text, dias int, hora int, qtd numeric, doc text, obs text, usuario text, chave text, ref text)
    order by quando, x.tipo
  loop
    insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, documento, observacao, referencia_id,
                                      origem, ocorrido_em, usuario_nome)
    values (p_empresa, p_loja, v_mov.lote, v_mov.tipo, v_mov.qtd, v_mov.doc, v_mov.obs, (v_ids ->> v_mov.ref)::bigint,
            'sistema', v_mov.quando, coalesce(v_mov.usuario, v_equipe[1 + (v_mov.dias + v_mov.hora) % 3]))
    returning id into v_id;
    if v_mov.chave is not null then v_ids := v_ids || jsonb_build_object(v_mov.chave, v_id); end if;
  end loop;
end $$;

create or replace function public.criar_empresa_exemplo()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_loja    uuid;
begin
  v_empresa := public.criar_empresa('Agro Exemplo', 'galpao', 'Galpão principal');
  update public.empresas set config = config || '{"exemplo": true}'::jsonb where id = v_empresa;
  select id into v_loja from public.lojas where empresa_id = v_empresa;
  perform app.semear_exemplo_galpao(v_empresa, v_loja);
  return v_empresa;
end $$;


-- ---------------------------------------------------------------------
-- 5. Permissões e tempo real
-- ---------------------------------------------------------------------
revoke execute on function public.minhas_empresas(), public.ver_convite(text),
                           public.salvar_produto(uuid, uuid, jsonb, jsonb), public.criar_empresa_exemplo()
  from public, anon;
revoke execute on function app.semear_exemplo_galpao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.minhas_empresas(), public.salvar_produto(uuid, uuid, jsonb, jsonb), public.criar_empresa_exemplo()
  to authenticated;
-- O convite pode ser consultado antes do login (a pessoa ainda vai criar a conta).
grant execute on function public.ver_convite(text) to anon, authenticated;

-- Outros aparelhos ficam sabendo de códigos e categorias novos.
alter publication supabase_realtime add table public.produtos_codigos, public.categorias;
