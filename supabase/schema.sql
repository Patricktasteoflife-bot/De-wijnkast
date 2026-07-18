-- Taste of Life · De Wijnkast
-- Voer dit bestand één keer uit in de SQL Editor van een nieuw Supabase-project.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_wijnkast_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  producer text,
  vintage text,
  region text,
  country text,
  color text not null default 'Overig',
  description text,
  image_url text,
  price_cents integer not null check (price_cents >= 0),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  client_request_id text,
  request_fingerprint text,
  customer_name text not null,
  phone text not null,
  email text,
  delivery_method text not null default 'pickup' check (delivery_method in ('pickup', 'shipping')),
  notes text,
  status text not null default 'new' check (status in ('new', 'confirmed', 'paid', 'ready', 'completed', 'cancelled')),
  total_cents integer not null default 0 check (total_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
add column if not exists client_request_id text;

alter table public.orders
add column if not exists request_fingerprint text;

create unique index if not exists orders_client_request_id_key
on public.orders (client_request_id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  producer text,
  vintage text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_total_cents integer generated always as (unit_price_cents * quantity) stored,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Klanten zien alleen beschikbare wijnen" on public.products;
create policy "Klanten zien alleen beschikbare wijnen"
on public.products for select
to anon, authenticated
using (active = true and stock > 0);

drop policy if exists "Beheerder beheert producten" on public.products;
create policy "Beheerder beheert producten"
on public.products for all
to authenticated
using (public.is_wijnkast_admin())
with check (public.is_wijnkast_admin());

drop policy if exists "Beheerder ziet orders" on public.orders;
create policy "Beheerder ziet orders"
on public.orders for select
to authenticated
using (public.is_wijnkast_admin());

drop policy if exists "Beheerder ziet orderregels" on public.order_items;
create policy "Beheerder ziet orderregels"
on public.order_items for select
to authenticated
using (public.is_wijnkast_admin());

drop policy if exists "Beheerder ziet admins" on public.admins;
create policy "Beheerder ziet admins"
on public.admins for select
to authenticated
using (public.is_wijnkast_admin());

drop view if exists public.public_products;
create view public.public_products
with (security_invoker = true)
as
select
  id, name, producer, vintage, region, country, color,
  description, image_url, price_cents, stock, sort_order, created_at
from public.products
where active = true and stock > 0;

create or replace function public.place_order(customer jsonb, items jsonb)
returns table(order_number text, total_cents integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_request_id text := nullif(trim(customer->>'request_id'), '');
  v_request_fingerprint text;
  v_existing_fingerprint text;
  v_normalized_items jsonb;
  v_total integer := 0;
  v_total_quantity integer := 0;
  v_count integer := 0;
  v_item record;
  v_product public.products%rowtype;
begin
  if coalesce(trim(customer->>'name'), '') = '' then
    raise exception 'Naam ontbreekt.';
  end if;
  if coalesce(trim(customer->>'phone'), '') = '' then
    raise exception 'Mobiel nummer ontbreekt.';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'De wijnmand is leeg.';
  end if;
  if jsonb_array_length(items) > 25 then
    raise exception 'Een reservering kan maximaal 25 verschillende wijnen bevatten.';
  end if;
  if v_request_id is null then
    raise exception 'Aanvraag-ID ontbreekt.';
  end if;
  if v_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$' then
    raise exception 'Ongeldige aanvraag-ID.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(items) as raw(product_id uuid, quantity integer)
    where raw.product_id is null
       or raw.quantity is null
       or raw.quantity < 1
       or raw.quantity > 99
  ) then
    raise exception 'Ongeldig product of aantal.';
  end if;

  select
    jsonb_agg(
      jsonb_build_object('product_id', normalized.product_id, 'quantity', normalized.quantity)
      order by normalized.product_id
    ),
    coalesce(sum(normalized.quantity), 0)::integer
  into v_normalized_items, v_total_quantity
  from (
    select raw.product_id, sum(raw.quantity)::integer as quantity
    from jsonb_to_recordset(items) as raw(product_id uuid, quantity integer)
    group by raw.product_id
  ) as normalized;

  if v_total_quantity > 99 or exists (
    select 1
    from jsonb_to_recordset(v_normalized_items) as normalized(product_id uuid, quantity integer)
    where normalized.quantity > 99
  ) then
    raise exception 'Een reservering kan maximaal 99 flessen bevatten.';
  end if;

  v_request_fingerprint := encode(sha256(convert_to(
      jsonb_build_object(
        'name', trim(customer->>'name'),
        'phone', trim(customer->>'phone'),
        'email', nullif(trim(customer->>'email'), ''),
        'delivery', case when customer->>'delivery' = 'shipping' then 'shipping' else 'pickup' end,
        'notes', nullif(trim(customer->>'notes'), '')
      )::text || '|' || v_normalized_items::text,
      'UTF8'
    )), 'hex');

  insert into public.orders (
    customer_name, phone, email, delivery_method, notes,
    client_request_id, request_fingerprint
  ) values (
    trim(customer->>'name'),
    trim(customer->>'phone'),
    nullif(trim(customer->>'email'), ''),
    case when customer->>'delivery' = 'shipping' then 'shipping' else 'pickup' end,
    nullif(trim(customer->>'notes'), ''),
    v_request_id,
    v_request_fingerprint
  )
  on conflict (client_request_id) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select existing.order_number, existing.total_cents, existing.request_fingerprint
    into v_order_number, v_total, v_existing_fingerprint
    from public.orders as existing
    where existing.client_request_id = v_request_id;

    if v_order_number is null then
      raise exception 'Bestaande reservering kon niet worden gecontroleerd.';
    end if;
    if v_existing_fingerprint is distinct from v_request_fingerprint then
      raise exception 'Deze aanvraag-ID hoort bij een andere reservering.';
    end if;

    return query select v_order_number, v_total;
    return;
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(v_normalized_items) as x(product_id uuid, quantity integer)
    order by product_id
  loop
    if v_item.quantity is null or v_item.quantity < 1 or v_item.quantity > 99 then
      raise exception 'Ongeldig aantal.';
    end if;

    update public.products
    set stock = stock - v_item.quantity,
        updated_at = now()
    where id = v_item.product_id
      and active = true
      and stock >= v_item.quantity
    returning * into v_product;

    if not found then
      raise exception 'Onvoldoende voorraad voor één van de gekozen flessen.';
    end if;

    insert into public.order_items (
      order_id, product_id, product_name, producer, vintage,
      unit_price_cents, quantity
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.producer, v_product.vintage,
      v_product.price_cents, v_item.quantity
    );

    v_total := v_total + (v_product.price_cents * v_item.quantity);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'De wijnmand is leeg.';
  end if;

  v_order_number := 'WK-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 12));

  update public.orders
  set order_number = v_order_number,
      total_cents = v_total,
      updated_at = now()
  where id = v_order_id;

  return query select v_order_number, v_total;
end;
$$;

create or replace function public.update_wijnkast_order_status(
  target_order_id uuid,
  expected_updated_at timestamptz,
  next_status text
)
returns table (id uuid, status text, updated_at timestamptz, stock_restored boolean)
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

  select order_row.* into current_order
  from public.orders as order_row
  where order_row.id = target_order_id
  for update;
  if not found then
    raise exception 'Reservering niet gevonden.' using errcode = 'P0002';
  end if;
  if expected_updated_at is null or current_order.updated_at is distinct from expected_updated_at then
    raise exception 'ORDER_CONFLICT' using errcode = '40001';
  end if;
  if current_order.status = 'cancelled' and next_status <> 'cancelled' then
    raise exception 'CANCELLED_ORDER_FINAL' using errcode = '22023';
  end if;
  if current_order.status = 'completed' and next_status <> 'completed' then
    raise exception 'COMPLETED_ORDER_FINAL' using errcode = '22023';
  end if;
  if current_order.status = next_status then
    return query select current_order.id, current_order.status, current_order.updated_at, false;
    return;
  end if;

  if next_status = 'cancelled' then
    if exists (
      select 1 from public.order_items as missing_item
      where missing_item.order_id = current_order.id and missing_item.product_id is null
    ) then
      raise exception 'RESTORE_PRODUCT_MISSING' using errcode = 'P0002';
    end if;
    for item_to_restore in
      select order_item.product_id, sum(order_item.quantity)::integer as quantity
      from public.order_items as order_item
      where order_item.order_id = current_order.id and order_item.product_id is not null
      group by order_item.product_id
      order by order_item.product_id
    loop
      update public.products
      set stock = stock + item_to_restore.quantity, updated_at = statement_timestamp()
      where products.id = item_to_restore.product_id;
      if not found then
        raise exception 'RESTORE_PRODUCT_MISSING' using errcode = 'P0002';
      end if;
    end loop;
    restored := true;
  end if;

  update public.orders
  set status = next_status, updated_at = statement_timestamp()
  where orders.id = current_order.id
  returning orders.* into current_order;

  return query select current_order.id, current_order.status, current_order.updated_at, restored;
end;
$$;

revoke all on public.admins from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.products from anon, authenticated;

grant select on public.products to anon, authenticated;
grant select on public.public_products to anon, authenticated;
grant select on public.products to authenticated;
grant insert (
  sku, name, producer, vintage, region, country, color, description,
  image_url, price_cents, stock, active, sort_order
) on public.products to authenticated;
grant update (
  sku, name, producer, vintage, region, country, color, description,
  image_url, price_cents, stock, active, sort_order
) on public.products to authenticated;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select on public.admins to authenticated;
revoke all on function public.is_wijnkast_admin() from public;
revoke all on function public.place_order(jsonb, jsonb) from public;
revoke all on function public.update_wijnkast_order_status(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.is_wijnkast_admin() to authenticated;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.update_wijnkast_order_status(uuid, timestamptz, text) to authenticated;

-- Voer daarna supabase/migrations/20260717_beheeromgeving.sql uit.
-- Die migratie koppelt uitsluitend het bevestigde eigenaarsadres automatisch
-- en voegt de beveiligde beheerpagina-instellingen toe.
-- Voer op een bestaand project tot slot ook
-- supabase/migrations/20260717_beheer_productrechten.sql uit. Deze idempotente
-- reparatie legt alleen productrechten vast en wijzigt geen productgegevens.
-- Voer daarna ook supabase/migrations/20260718_reserveringenbeheer.sql uit voor
-- het beveiligde reserveringenoverzicht en eenmalig voorraadherstel bij annuleren.
