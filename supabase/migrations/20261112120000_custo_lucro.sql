-- Custo do produto no momento da venda (T-036).
--
-- O item da venda guarda o "último custo" do produto como snapshot: assim o CMV
-- e o lucro de uma venda antiga continuam auditáveis mesmo depois de uma nova
-- entrada mudar produtos.custo_ultimo. Sem backfill: vendas anteriores ficam com
-- custo nulo (e são avisadas na tela), porque preencher com o custo de hoje
-- distorceria o histórico.

alter table public.vendas_itens
  add column custo_unitario numeric(14, 4)
    check (custo_unitario is null or custo_unitario >= 0);

create function public.preencher_custo_venda_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_custo numeric;
begin
  -- Item avulso (sem produto cadastrado) e venda importada com custo próprio
  -- continuam como vieram.
  if new.produto_id is null then
    return new;
  end if;

  select custo_ultimo into v_custo
  from public.produtos
  where id = new.produto_id and empresa_id = new.empresa_id;

  new.custo_unitario := coalesce(new.custo_unitario, v_custo);
  return new;
end $$;

create trigger vendas_itens_custo before insert on public.vendas_itens
  for each row execute function public.preencher_custo_venda_item();

-- Função de trigger: não é chamável pela API (o default do schema concede a anon).
revoke execute on function public.preencher_custo_venda_item() from public, anon;

comment on column public.vendas_itens.custo_unitario is
  'Custo unitário do produto no momento da venda (snapshot de produtos.custo_ultimo; null = sem custo cadastrado).';
