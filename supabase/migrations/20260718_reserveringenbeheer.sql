-- Taste of Life · De Wijnkast
-- Veilige reserveringsstatussen voor de privé-beheeromgeving.
--
-- Deze migratie:
--   * wijzigt geen bestaande reservering of voorraad tijdens installatie;
--   * geeft de browser alleen leesrechten op orders en orderregels;
--   * laat statuswijzigingen uitsluitend via één beveiligde RPC lopen;
--   * herstelt voorraad bij annuleren exact één keer;
--   * maakt een geannuleerde of afgeronde reservering definitief.

begin;

alter table public.orders
add column if not exists updated_at timestamptz not null default now();

drop policy if exists "Beheerder ziet orders" on public.orders;
drop policy if exists "Beheerder leest orders" on public.orders;
create policy "Beheerder leest orders"
on public.orders for select
to authenticated
using (public.is_wijnkast_admin());

drop policy if exists "Beheerder ziet orderregels" on public.order_items;
drop policy if exists "Beheerder leest orderregels" on public.order_items;
create policy "Beheerder leest orderregels"
on public.order_items for select
to authenticated
using (public.is_wijnkast_admin());

revoke insert, update, delete on public.orders from authenticated;
revoke insert, update, delete on public.order_items from authenticated;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;

create or replace function public.update_wijnkast_order_status(
  target_order_id uuid,
  expected_updated_at timestamptz,
  next_status text
)
returns table (
  id uuid,
  status text,
  updated_at timestamptz,
  stock_restored boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders%rowtype;
  restored boolean := false;
  item_to_restore record;
begin
  if not public.is_wijnkast_admin() then
    raise exception 'Geen beheerrechten.' using errcode = '42501';
  end if;

  if next_status not in ('new', 'confirmed', 'paid', 'ready', 'completed', 'cancelled') then
    raise exception 'Ongeldige reserveringsstatus.' using errcode = '22023';
  end if;

  select order_row.*
  into current_order
  from public.orders as order_row
  where order_row.id = target_order_id
  for update;

  if not found then
    raise exception 'Reservering niet gevonden.' using errcode = 'P0002';
  end if;

  if expected_updated_at is null
     or current_order.updated_at is distinct from expected_updated_at then
    raise exception 'ORDER_CONFLICT' using errcode = '40001';
  end if;

  if current_order.status = 'cancelled' and next_status <> 'cancelled' then
    raise exception 'CANCELLED_ORDER_FINAL' using errcode = '22023';
  end if;

  if current_order.status = 'completed' and next_status <> 'completed' then
    raise exception 'COMPLETED_ORDER_FINAL' using errcode = '22023';
  end if;

  if current_order.status = next_status then
    return query
    select current_order.id, current_order.status, current_order.updated_at, false;
    return;
  end if;

  if next_status = 'cancelled' then
    if exists (
      select 1 from public.order_items as missing_item
      where missing_item.order_id = current_order.id
        and missing_item.product_id is null
    ) then
      raise exception 'RESTORE_PRODUCT_MISSING' using errcode = 'P0002';
    end if;

    -- De orderrij is hierboven vergrendeld. Daardoor kan slechts één gelijktijdige
    -- annulering deze lus bereiken. De vaste productvolgorde voorkomt lock-inversie.
    for item_to_restore in
      select order_item.product_id, sum(order_item.quantity)::integer as quantity
      from public.order_items as order_item
      where order_item.order_id = current_order.id
        and order_item.product_id is not null
      group by order_item.product_id
      order by order_item.product_id
    loop
      update public.products
      set stock = stock + item_to_restore.quantity,
          updated_at = statement_timestamp()
      where products.id = item_to_restore.product_id;
      if not found then
        raise exception 'RESTORE_PRODUCT_MISSING' using errcode = 'P0002';
      end if;
    end loop;
    restored := true;
  end if;

  update public.orders
  set status = next_status,
      updated_at = statement_timestamp()
  where orders.id = current_order.id
  returning orders.* into current_order;

  return query
  select current_order.id, current_order.status, current_order.updated_at, restored;
end;
$$;

revoke all on function public.update_wijnkast_order_status(uuid, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.update_wijnkast_order_status(uuid, timestamptz, text)
to authenticated;

notify pgrst, 'reload schema';

commit;
