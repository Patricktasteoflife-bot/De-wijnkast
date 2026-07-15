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
on public.orders for all
to authenticated
using (public.is_wijnkast_admin())
with check (public.is_wijnkast_admin());

drop policy if exists "Beheerder ziet orderregels" on public.order_items;
create policy "Beheerder ziet orderregels"
on public.order_items for all
to authenticated
using (public.is_wijnkast_admin())
with check (public.is_wijnkast_admin());

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
  v_total integer := 0;
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

  insert into public.orders (
    customer_name, phone, email, delivery_method, notes
  ) values (
    trim(customer->>'name'),
    trim(customer->>'phone'),
    nullif(trim(customer->>'email'), ''),
    case when customer->>'delivery' = 'shipping' then 'shipping' else 'pickup' end,
    nullif(trim(customer->>'notes'), '')
  ) returning id into v_order_id;

  for v_item in
    select * from jsonb_to_recordset(items) as x(product_id uuid, quantity integer)
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

  v_order_number := 'WK-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 6));

  update public.orders
  set order_number = v_order_number,
      total_cents = v_total,
      updated_at = now()
  where id = v_order_id;

  return query select v_order_number, v_total;
end;
$$;

revoke all on public.admins from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.products from anon, authenticated;

grant select on public.products to anon, authenticated;
grant select on public.public_products to anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.is_wijnkast_admin() to authenticated;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated;

-- Maak na het aanmaken van jouw Supabase-account één beheerder aan:
-- insert into public.admins (user_id) values ('JOUW-AUTH-USER-UUID');

