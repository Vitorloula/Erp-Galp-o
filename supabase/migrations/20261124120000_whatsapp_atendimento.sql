-- =====================================================================
--  Atendimento WhatsApp (cliente final) — esqueleto
--  Fase F0: tabelas, RLS, catálogo público e pedidos.
--  Canal = WhatsApp Business da loja (coexistence ou API dedicada).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Canais WhatsApp por loja
-- ---------------------------------------------------------------------
create table public.canais_whatsapp (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  provider text not null default 'meta',
  waba_id text,
  phone_number_id text,
  modo text not null default 'coexistence' check (modo in ('coexistence', 'api')),
  status text not null default 'pendente' check (status in ('pendente', 'conectado', 'desconectado', 'erro')),
  politica jsonb not null default '{}'::jsonb,
  escopo_piloto jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (loja_id)
);

-- ---------------------------------------------------------------------
-- 2. Contatos (clientes finais)
-- ---------------------------------------------------------------------
create table public.whatsapp_contatos (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null references public.canais_whatsapp (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  telefone_e164 text not null,
  nome_perfil text,
  consentimento_marketing boolean not null default false,
  bloqueado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (canal_id, telefone_e164)
);

-- ---------------------------------------------------------------------
-- 3. Conversas
-- ---------------------------------------------------------------------
create table public.whatsapp_conversas (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null references public.canais_whatsapp (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  contato_id uuid not null references public.whatsapp_contatos (id) on delete cascade,
  estado text not null default 'bot' check (estado in ('bot', 'humano', 'encerrada')),
  janela_expira_em timestamptz,
  resumo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Mensagens
-- ---------------------------------------------------------------------
create table public.whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  direcao text not null check (direcao in ('in', 'out')),
  tipo text not null default 'text',
  texto text,
  midia_ref text,
  provider_id text,
  tokens_entrada int,
  tokens_saida int,
  custo_usd numeric(12, 6),
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Ações (tool calls do agente)
-- ---------------------------------------------------------------------
create table public.whatsapp_acoes (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  mensagem_id uuid references public.whatsapp_mensagens (id) on delete set null,
  tool text not null,
  argumentos jsonb not null default '{}'::jsonb,
  resultado jsonb,
  status text not null default 'proposta' check (status in ('proposta', 'executada', 'falhou')),
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Uso diário (limites e custo por canal)
-- ---------------------------------------------------------------------
create table public.whatsapp_uso_diario (
  canal_id uuid not null references public.canais_whatsapp (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  dia date not null,
  mensagens_in int not null default 0,
  mensagens_out int not null default 0,
  tokens int not null default 0,
  custo_usd numeric(12, 6) not null default 0,
  pedidos_criados int not null default 0,
  primary key (canal_id, dia)
);

-- ---------------------------------------------------------------------
-- 7. Pedidos gerados pelo WhatsApp
-- ---------------------------------------------------------------------
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  numero bigint generated always as identity,
  origem text not null default 'whatsapp',
  conversa_id uuid references public.whatsapp_conversas (id) on delete set null,
  contato_id uuid references public.whatsapp_contatos (id) on delete set null,
  status text not null default 'aguardando_confirmacao'
    check (status in ('aguardando_confirmacao', 'confirmado', 'separado', 'retirado', 'cancelado')),
  retirada_ou_entrega text not null default 'retirada' check (retirada_ou_entrega in ('retirada', 'entrega')),
  endereco_entrega text,
  total_centavos bigint not null default 0,
  observacao text,
  confirmado_por uuid,
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.pedidos_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  produto_id uuid not null references public.produtos (id),
  nome_snapshot text not null,
  qtd numeric(12, 3) not null check (qtd > 0),
  preco_unit_centavos bigint not null check (preco_unit_centavos >= 0),
  subtotal_centavos bigint not null check (subtotal_centavos >= 0)
);

-- ---------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------
alter table public.canais_whatsapp enable row level security;
alter table public.whatsapp_contatos enable row level security;
alter table public.whatsapp_conversas enable row level security;
alter table public.whatsapp_mensagens enable row level security;
alter table public.whatsapp_acoes enable row level security;
alter table public.whatsapp_uso_diario enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedidos_itens enable row level security;

revoke all on public.canais_whatsapp, public.whatsapp_contatos, public.whatsapp_conversas,
  public.whatsapp_mensagens, public.whatsapp_acoes, public.whatsapp_uso_diario,
  public.pedidos, public.pedidos_itens from public, anon;

-- canais: membros da empresa leem; dono cria/edita
create policy canais_leitura on public.canais_whatsapp for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy canais_cadastro on public.canais_whatsapp for insert to authenticated
  with check (empresa_id in (select app.empresas_com_papel(array['dono'])) and empresa_id in (select app.empresas_gravaveis()));
create policy canais_edicao on public.canais_whatsapp for update to authenticated
  using (empresa_id in (select app.empresas_com_papel(array['dono'])))
  with check (empresa_id in (select app.empresas_com_papel(array['dono'])) and empresa_id in (select app.empresas_gravaveis()));

-- contatos/conversas/mensagens/ações/uso: leitura por membros da empresa (via canal)
create policy contatos_leitura on public.whatsapp_contatos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy conversas_leitura on public.whatsapp_conversas for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy mensagens_leitura on public.whatsapp_mensagens for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy acoes_leitura on public.whatsapp_acoes for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy uso_leitura on public.whatsapp_uso_diario for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));

-- pedidos: membros leem; dono/gerente/estoquista
create policy pedidos_leitura on public.pedidos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy pedidos_itens_leitura on public.pedidos_itens for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));

-- ---------------------------------------------------------------------
-- 9. Grants de leitura para o frontend
-- ---------------------------------------------------------------------
grant select on public.canais_whatsapp to authenticated;
grant select on public.whatsapp_contatos to authenticated;
grant select on public.whatsapp_conversas to authenticated;
grant select on public.whatsapp_mensagens to authenticated;
grant select on public.whatsapp_acoes to authenticated;
grant select on public.whatsapp_uso_diario to authenticated;
grant select on public.pedidos to authenticated;
grant select on public.pedidos_itens to authenticated;
grant usage, select on sequence public.pedidos_numero_seq to authenticated;

-- ---------------------------------------------------------------------
-- 10. Catálogo público (whitelisted) para o agente
-- ---------------------------------------------------------------------
create or replace function public.catalogo_publico(
  p_empresa uuid,
  p_loja uuid,
  p_busca text default null,
  p_limite int default 8
)
returns table (
  produto_id uuid,
  codigo_interno text,
  nome text,
  preco_venda_centavos bigint,
  disponibilidade text
)
language sql
security definer
set search_path = ''
as $$
  select
    p.id as produto_id,
    p.codigo_interno,
    p.nome,
    round(p.preco_venda * 100)::bigint as preco_venda_centavos,
    case
      when coalesce(s.total, 0) <= 0 then 'sem_estoque'
      when coalesce(s.total, 0) <= greatest(coalesce(p.estoque_minimo, 0), 3) then 'ultimas_unidades'
      else 'disponivel'
    end as disponibilidade
  from public.produtos p
  left join (
    select produto_id, sum(saldo)::numeric as total
    from public.estoque_saldos
    where loja_id = p_loja
    group by produto_id
  ) s on s.produto_id = p.id
  where p.empresa_id = p_empresa
    and p.ativo = true
    and (
      p_busca is null or p_busca = ''
      or p.nome ilike '%' || p_busca || '%'
      or p.codigo_interno ilike '%' || p_busca || '%'
    )
  order by p.nome
  limit greatest(1, least(coalesce(p_limite, 8), 20));
$$;

revoke execute on function public.catalogo_publico(uuid, uuid, text, int) from public, anon;
grant execute on function public.catalogo_publico(uuid, uuid, text, int) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.catalogo_publico(uuid, uuid, text, int) to service_role;
  end if;
end $$;
