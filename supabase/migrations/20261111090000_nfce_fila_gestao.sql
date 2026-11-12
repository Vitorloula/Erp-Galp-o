-- =====================================================================
--  Fila de gestão da NFC-e (BF-N4).
--
--  Vendas concluídas com nota pendente ou com erro passam a ter uma tela
--  de gestão. Para isso a venda guarda:
--    nfce_erro      → mensagem devolvida pelo emissor quando a emissão falha;
--    nfce_resolucao → motivo informado pelo operador ao marcar como resolvida;
--    nfce_status    → ganha 'resolvida' (estado terminal, sai da fila).
--
--  A venda continua imutável: o gatilho libera apenas as colunas fiscais;
--  a retaguarda NÃO recebe UPDATE direto. Toda escrita passa pelas funções
--  abaixo, que checam papel/empresa/loja (como public.cancelar_venda).
-- =====================================================================

alter table public.vendas add column nfce_erro text;
alter table public.vendas add column nfce_resolucao text;

alter table public.vendas drop constraint if exists vendas_nfce_status_check;
alter table public.vendas
  add constraint vendas_nfce_status_check
  check (nfce_status in ('pendente', 'emitida', 'cancelada', 'erro', 'resolvida'));

-- Mesmo padrão do cancelamento: resolver a fila exige um motivo (>= 3 letras).
alter table public.vendas
  add constraint vendas_nfce_resolucao_com_motivo
  check (nfce_status <> 'resolvida' or length(trim(coalesce(nfce_resolucao, ''))) >= 3);

-- Emissão: grava o resultado devolvido pelo emissor. Quem opera o caixa
-- (dono/gerente/caixa) pode gravar; venda cancelada só aceita o cancelamento
-- da nota e nota resolvida não muda mais.
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
  -- Cancelar a nota de uma venda já cancelada é o único resultado aceito nela.
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
         nfce_erro = case when p_status = 'erro' then nullif(trim(coalesce(p_mensagem, '')), '') else null end
   where id = v.id;
end $$;

-- Resolução manual da fila: mesmo gate do cancelamento (dono/gerente + assinatura gravável).
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
     set nfce_status = 'resolvida', nfce_resolucao = trim(p_motivo), nfce_erro = null
   where id = v.id;
end $$;

revoke execute on function public.salvar_nfce(uuid, text, text, text, text) from public, anon;
grant execute on function public.salvar_nfce(uuid, text, text, text, text) to authenticated;
revoke execute on function public.marcar_nfce_resolvida(uuid, text) from public, anon;
grant execute on function public.marcar_nfce_resolvida(uuid, text) to authenticated;

-- Imutabilidade da venda: libera só a atualização dos campos da NFC-e feita
-- pelas funções SECURITY DEFINER acima (a tabela não tem UPDATE para o app).
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
     and (to_jsonb(new) - array['nfce_status', 'nfce_chave', 'nfce_qrcode', 'nfce_erro', 'nfce_resolucao'])
       = (to_jsonb(old) - array['nfce_status', 'nfce_chave', 'nfce_qrcode', 'nfce_erro', 'nfce_resolucao']) then
    return new;
  end if;
  raise exception 'Venda registrada não pode ser alterada nem excluída. Cancele a venda.'
    using errcode = 'P0001', hint = 'HISTORICO_IMUTAVEL';
end $$;
