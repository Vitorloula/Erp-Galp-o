-- =====================================================================
--  Conferência fiscal da venda (T-034 / fase F1).
--
--  A loja decide o que emitir; o sistema prepara e CONFERE a nota de toda
--  venda sem enviar nada à SEFAZ. Para isso:
--
--    lojas.crt              → regime tributário (1 Simples, 2 Simples c/
--                             excesso de sublimite, 3 Regime Normal, 4 MEI);
--    lojas.politica_emissao → 'assistida' (loja decide) ou 'automatica' (2027);
--    lojas.politica_vigencia→ data em que o modo automático passa a valer;
--    lojas.modo_conferencia → prepara/valida a nota de toda venda;
--    lojas.ambiente_fiscal  → homologacao (teste) ou producao;
--
--    vendas.nfce_decisao    → 'emitir' | 'sem_nota' (null = a decidir);
--    vendas.nfce_motivo     → por que a venda ficou sem nota.
--
--  A venda continua imutável: as decisões passam pela função decidir_nfce
--  (SECURITY DEFINER), que repete os gates de papel, loja e dia. Nada aqui
--  altera o caminho de sincronização offline do PDV (a venda chega igual).
-- =====================================================================

-- ---------------------------------------------------------------- lojas
alter table public.lojas
  add column crt               smallint check (crt in (1, 2, 3, 4)),
  add column politica_emissao  text not null default 'assistida'
                               check (politica_emissao in ('assistida', 'automatica')),
  add column politica_vigencia date not null default '2027-01-01',
  add column modo_conferencia  boolean not null default true,
  add column ambiente_fiscal   text not null default 'homologacao'
                               check (ambiente_fiscal in ('homologacao', 'producao')),
  add column regime_confirmado_em timestamptz;

-- O dono edita os campos fiscais da loja (mesma política lojas_edicao).
grant update (crt, politica_emissao, politica_vigencia, modo_conferencia, ambiente_fiscal, regime_confirmado_em)
  on public.lojas to authenticated;

comment on column public.lojas.crt is
  'Regime tributário do CNPJ da loja: 1 Simples Nacional, 2 Simples c/ excesso de sublimite, 3 Regime Normal, 4 MEI.';
comment on column public.lojas.politica_emissao is
  'assistida = a loja decide o que emitir; automatica = emite toda venda (obrigatório a partir de 01/01/2027).';

-- --------------------------------------------------------------- vendas
alter table public.vendas
  add column nfce_decisao         text check (nfce_decisao in ('emitir', 'sem_nota')),
  add column nfce_motivo          text,
  add column nfce_decidido_em     timestamptz,
  add column nfce_decidido_por    uuid,
  add column nfce_decidido_por_nome text;

-- Imutabilidade da venda: libera só a atualização dos campos fiscais feita
-- pelas funções SECURITY DEFINER abaixo. Precisa vir ANTES do backfill.
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
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array[
       'nfce_status', 'nfce_chave', 'nfce_qrcode', 'nfce_erro', 'nfce_resolucao',
       'nfce_decisao', 'nfce_motivo', 'nfce_decidido_em', 'nfce_decidido_por', 'nfce_decidido_por_nome'
     ]) = (to_jsonb(old) - array[
       'nfce_status', 'nfce_chave', 'nfce_qrcode', 'nfce_erro', 'nfce_resolucao',
       'nfce_decisao', 'nfce_motivo', 'nfce_decidido_em', 'nfce_decidido_por', 'nfce_decidido_por_nome'
     ]) then
    return new;
  end if;
  raise exception 'Venda registrada não pode ser alterada nem excluída. Cancele a venda.'
    using errcode = 'P0001', hint = 'HISTORICO_IMUTAVEL';
end $$;

-- Vendas antigas mantêm o comportamento atual: o que estava na fila segue
-- como "emitir"; o que já tinha sido resolvido vira "sem nota".
update public.vendas
   set nfce_decisao = 'emitir'
 where nfce_decisao is null
   and nfce_status in ('pendente', 'emitida', 'erro');

update public.vendas
   set nfce_decisao = 'sem_nota',
       nfce_motivo = coalesce(nullif(trim(coalesce(nfce_resolucao, '')), ''), 'Resolvida antes da conferência fiscal')
 where nfce_decisao is null
   and nfce_status = 'resolvida';

alter table public.vendas
  add constraint vendas_nfce_sem_nota_com_motivo
  check (nfce_decisao <> 'sem_nota' or length(trim(coalesce(nfce_motivo, ''))) >= 3);

comment on column public.vendas.nfce_decisao is
  'Decisão da loja sobre a nota: emitir, sem_nota ou null (ainda não decidida).';

-- ------------------------------------------------- decisão da nota (RPC)
create or replace function public.decidir_nfce(
  p_venda uuid,
  p_decisao text,
  p_motivo text default null
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.vendas;
  v_fuso text;
begin
  if p_decisao not in ('emitir', 'sem_nota') then
    raise exception 'Decisão inválida: use emitir ou sem_nota.' using errcode = 'P0001';
  end if;

  select * into v from public.vendas where id = p_venda;
  if not found then
    raise exception 'Venda não encontrada.' using errcode = 'P0001';
  end if;

  if v.empresa_id not in (select app.empresas_com_papel(array['dono', 'gerente']))
     or v.loja_id not in (select app.minhas_lojas()) then
    raise exception 'Somente dono ou gerente decide a nota fiscal da venda.' using errcode = '42501';
  end if;
  if v.empresa_id not in (select app.empresas_gravaveis()) then
    raise exception 'Assinatura em atraso: o sistema está somente para consulta.' using errcode = '42501';
  end if;
  if v.status = 'cancelada' then
    raise exception 'Esta venda está cancelada.' using errcode = 'P0001';
  end if;
  if v.nfce_status in ('emitida', 'cancelada') then
    raise exception 'Esta venda já tem nota emitida ou cancelada.' using errcode = 'P0001';
  end if;
  if v.nfce_status = 'resolvida' then
    raise exception 'Esta venda já foi registrada sem nota. Fale com o contador.' using errcode = 'P0001';
  end if;

  -- Janela de decisão: até o fim do dia da venda (fuso da empresa).
  select coalesce(fuso, 'America/Sao_Paulo') into v_fuso
    from public.empresas where id = v.empresa_id;
  if (v.ocorrido_em at time zone v_fuso)::date
     <> (now() at time zone v_fuso)::date then
    raise exception 'Vendas de outros dias não podem ser decididas aqui. Fale com o contador.'
      using errcode = 'P0001';
  end if;

  if p_decisao = 'sem_nota' then
    if length(trim(coalesce(p_motivo, ''))) < 3 then
      raise exception 'Informe o motivo para deixar a venda sem nota.' using errcode = 'P0001';
    end if;
    update public.vendas
       set nfce_decisao = 'sem_nota',
           nfce_motivo = trim(p_motivo),
           nfce_decidido_em = now(),
           nfce_decidido_por = (select auth.uid()),
           nfce_decidido_por_nome = (select nome from public.perfis where id = (select auth.uid())),
           nfce_status = 'resolvida',
           nfce_resolucao = trim(p_motivo),
           nfce_erro = null
     where id = v.id;
  else
    update public.vendas
       set nfce_decisao = 'emitir',
           nfce_motivo = null,
           nfce_decidido_em = now(),
           nfce_decidido_por = (select auth.uid()),
           nfce_decidido_por_nome = (select nome from public.perfis where id = (select auth.uid())),
           -- Uma nota que já falhou continua na fila como erro até ser reemitida.
           nfce_status = case when v.nfce_status = 'erro' then 'erro' else 'pendente' end,
           nfce_resolucao = null
     where id = v.id;
  end if;
end $$;

-- ------------------------------------------ conferência do dia (leitura)
/**
 * Vendas concluídas de um dia com o resultado da conferência fiscal:
 * itens, produtos sem NCM, regime da loja e a decisão já tomada.
 * A situação final (pronta/pendente/bloqueada) é montada no app
 * (src/lib/fiscal.ts), que também explica cada pendência ao cliente.
 */
create or replace function public.conferencia_fiscal(
  p_empresa uuid,
  p_loja uuid,
  p_dia date
)
returns table (
  venda_id            uuid,
  numero              bigint,
  caixa_numero        smallint,
  caixa_nome          text,
  ocorrido_em         timestamptz,
  operador_nome       text,
  total               numeric,
  cliente_cpf         text,
  nfce_status         text,
  nfce_decisao        text,
  nfce_motivo         text,
  nfce_decidido_em    timestamptz,
  crt                 smallint,
  itens               integer,
  itens_sem_produto   integer,
  itens_sem_ncm       integer,
  produtos_sem_ncm    text[]
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text;
begin
  if not exists (
    select 1 from public.membros m
     where m.empresa_id = p_empresa
       and m.usuario_id = (select auth.uid())
       and m.ativo
       and (m.lojas is null or p_loja = any (m.lojas))
  ) then
    raise exception 'Sem permissão para ver a conferência fiscal desta loja.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.lojas l where l.id = p_loja and l.empresa_id = p_empresa) then
    raise exception 'Loja não encontrada.' using errcode = 'P0001';
  end if;

  select coalesce(fuso, 'America/Sao_Paulo') into v_fuso
    from public.empresas where id = p_empresa;

  return query
  select v.id,
         v.numero,
         c.numero,
         c.nome,
         v.ocorrido_em,
         v.operador_nome,
         v.total,
         v.cliente_cpf,
         v.nfce_status,
         v.nfce_decisao,
         v.nfce_motivo,
         v.nfce_decidido_em,
         l.crt,
         coalesce(x.itens, 0)::integer,
         coalesce(x.sem_produto, 0)::integer,
         coalesce(x.sem_ncm, 0)::integer,
         coalesce(x.nomes, array[]::text[])
    from public.vendas v
    join public.lojas l on l.id = v.loja_id and l.empresa_id = v.empresa_id
    join public.caixas c on c.id = v.caixa_id
    left join lateral (
      select count(*) as itens,
             count(*) filter (where p.id is null) as sem_produto,
             count(*) filter (where p.id is not null and coalesce(trim(p.ncm), '') = '') as sem_ncm,
             coalesce(
               array_agg(distinct p.nome) filter (where p.id is not null and coalesce(trim(p.ncm), '') = ''),
               array[]::text[]
             ) as nomes
        from public.vendas_itens i
        left join public.produtos p on p.id = i.produto_id and p.empresa_id = v.empresa_id
       where i.venda_id = v.id
    ) x on true
   where v.empresa_id = p_empresa
     and v.loja_id = p_loja
     and v.status = 'concluida'
     and (v.ocorrido_em at time zone v_fuso)::date = p_dia
   order by v.ocorrido_em;
end $$;

-- Vendas de dias anteriores que ficaram sem decisão (o aviso do topo da tela).
create or replace function public.fiscal_pendentes_anteriores(
  p_empresa uuid,
  p_loja uuid
)
returns table (quantidade integer, primeira date)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text;
begin
  if not exists (
    select 1 from public.membros m
     where m.empresa_id = p_empresa
       and m.usuario_id = (select auth.uid())
       and m.ativo
       and (m.lojas is null or p_loja = any (m.lojas))
  ) then
    raise exception 'Sem permissão para ver a conferência fiscal desta loja.' using errcode = '42501';
  end if;

  select coalesce(fuso, 'America/Sao_Paulo') into v_fuso
    from public.empresas where id = p_empresa;

  return query
  select count(*)::integer,
         min((v.ocorrido_em at time zone v_fuso)::date)
    from public.vendas v
   where v.empresa_id = p_empresa
     and v.loja_id = p_loja
     and v.status = 'concluida'
     and v.nfce_decisao is null
     and v.nfce_status in ('pendente', 'erro')
     and (v.ocorrido_em at time zone v_fuso)::date < (now() at time zone v_fuso)::date;
end $$;

-- ------------------------------------------------------- fim do dia (RPC)
/**
 * Fecha a conferência de um dia: tudo o que a loja não decidiu até aqui passa
 * a valer como "sem nota" (com motivo e responsável). Sem p_dia, fecha todos
 * os dias anteriores a hoje. Não emite nada — só registra a decisão.
 */
create or replace function public.fechar_dia_fiscal(
  p_empresa uuid,
  p_loja uuid,
  p_dia date default null
)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_fuso text;
  v_hoje date;
  v_qtd integer;
begin
  if p_empresa not in (select app.empresas_com_papel(array['dono', 'gerente'])) then
    raise exception 'Somente dono ou gerente fecha o dia fiscal.' using errcode = '42501';
  end if;
  if p_loja not in (select app.minhas_lojas()) then
    raise exception 'Sem permissão para fechar o dia desta loja.' using errcode = '42501';
  end if;
  if p_empresa not in (select app.empresas_gravaveis()) then
    raise exception 'Assinatura em atraso: o sistema está somente para consulta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lojas l where l.id = p_loja and l.empresa_id = p_empresa) then
    raise exception 'Loja não encontrada.' using errcode = 'P0001';
  end if;

  select coalesce(fuso, 'America/Sao_Paulo') into v_fuso
    from public.empresas where id = p_empresa;
  v_hoje := (now() at time zone v_fuso)::date;

  if p_dia is not null and p_dia > v_hoje then
    raise exception 'Não é possível fechar um dia que ainda não chegou.' using errcode = 'P0001';
  end if;

  update public.vendas v
     set nfce_decisao = 'sem_nota',
         nfce_motivo = 'Dia encerrado sem decisão da loja',
         nfce_decidido_em = now(),
         nfce_decidido_por = (select auth.uid()),
         nfce_decidido_por_nome = (select nome from public.perfis where id = (select auth.uid())),
         nfce_status = 'resolvida',
         nfce_resolucao = 'Dia encerrado sem decisão da loja',
         nfce_erro = null
   where v.empresa_id = p_empresa
     and v.loja_id = p_loja
     and v.status = 'concluida'
     and v.nfce_decisao is null
     and v.nfce_status in ('pendente', 'erro')
     and (case when p_dia is null
               then (v.ocorrido_em at time zone v_fuso)::date < v_hoje
               else (v.ocorrido_em at time zone v_fuso)::date = p_dia
          end);
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- ------------------------------------------------ funções que já existiam
-- Resolver a fila também registra a decisão "sem nota" (e o motivo).
create or replace function public.marcar_nfce_resolvida(p_venda uuid, p_motivo text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.vendas;
begin
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da resolução.' using errcode = 'P0001';
  end if;
  select * into v from public.vendas where id = p_venda;
  if not found then raise exception 'Venda não encontrada.' using errcode = 'P0001'; end if;
  if v.empresa_id not in (select app.empresas_com_papel(array['dono', 'gerente']))
     or v.loja_id not in (select app.minhas_lojas()) then
    raise exception 'Somente dono ou gerente resolve a fila da NFC-e.' using errcode = '42501';
  end if;
  if v.empresa_id not in (select app.empresas_gravaveis()) then
    raise exception 'Assinatura em atraso: o sistema está somente para consulta.' using errcode = '42501';
  end if;
  if v.status = 'cancelada' or v.nfce_status not in ('pendente', 'erro') then
    raise exception 'Esta venda não está mais na fila da NFC-e.' using errcode = 'P0001';
  end if;
  update public.vendas
     set nfce_status = 'resolvida',
         nfce_resolucao = trim(p_motivo),
         nfce_decisao = 'sem_nota',
         nfce_motivo = trim(p_motivo),
         nfce_decidido_em = now(),
         nfce_decidido_por = (select auth.uid()),
         nfce_decidido_por_nome = (select nome from public.perfis where id = (select auth.uid())),
         nfce_erro = null
   where id = v.id;
end $$;

-- Emitir confirma a decisão "emitir" (inclusive em vendas antigas da fila).
create or replace function public.salvar_nfce(
  p_venda uuid,
  p_status text,
  p_chave text,
  p_qrcode text,
  p_mensagem text
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.vendas;
begin
  if p_status not in ('emitida', 'cancelada', 'erro') then
    raise exception 'Status da NFC-e inválido.' using errcode = 'P0001';
  end if;
  select * into v from public.vendas where id = p_venda;
  if not found then raise exception 'Venda não encontrada.' using errcode = 'P0001'; end if;
  if v.empresa_id not in (select app.empresas_com_papel(array['dono', 'gerente', 'caixa']))
     or v.loja_id not in (select app.minhas_lojas()) then
    raise exception 'Sem permissão para gravar a NFC-e desta venda.' using errcode = '42501';
  end if;
  if v.empresa_id not in (select app.empresas_gravaveis()) then
    raise exception 'Assinatura em atraso: o sistema está somente para consulta.' using errcode = '42501';
  end if;
  if v.status = 'cancelada' and p_status <> 'cancelada' then
    raise exception 'Esta venda está cancelada.' using errcode = 'P0001';
  end if;
  if v.nfce_status = 'resolvida' then
    raise exception 'Esta nota já foi resolvida.' using errcode = 'P0001';
  end if;
  update public.vendas
     set nfce_status = p_status,
         nfce_chave = p_chave,
         nfce_qrcode = p_qrcode,
         nfce_erro = case when p_status = 'erro' then nullif(trim(coalesce(p_mensagem, '')), '') else null end,
         nfce_decisao = case when p_status = 'emitida' then 'emitir' else nfce_decisao end
   where id = v.id;
end $$;

revoke execute on function public.decidir_nfce(uuid, text, text) from public, anon;
grant execute on function public.decidir_nfce(uuid, text, text) to authenticated;
revoke execute on function public.conferencia_fiscal(uuid, uuid, date) from public, anon;
grant execute on function public.conferencia_fiscal(uuid, uuid, date) to authenticated;
revoke execute on function public.fiscal_pendentes_anteriores(uuid, uuid) from public, anon;
grant execute on function public.fiscal_pendentes_anteriores(uuid, uuid) to authenticated;
revoke execute on function public.fechar_dia_fiscal(uuid, uuid, date) from public, anon;
grant execute on function public.fechar_dia_fiscal(uuid, uuid, date) to authenticated;
revoke execute on function public.salvar_nfce(uuid, text, text, text, text) from public, anon;
grant execute on function public.salvar_nfce(uuid, text, text, text, text) to authenticated;
revoke execute on function public.marcar_nfce_resolvida(uuid, text) from public, anon;
grant execute on function public.marcar_nfce_resolvida(uuid, text) to authenticated;
