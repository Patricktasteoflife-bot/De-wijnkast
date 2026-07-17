-- Voer deze migratie één keer uit op het bestaande De Wijnkast-project.
-- De huidige RPC-naam en argumenten blijven gelijk. De index kan op deze kleine
-- tabel heel kort nieuwe orders blokkeren; voer de migratie daarom vóór de app uit.

begin;

alter table public.orders
add column if not exists client_request_id text;

alter table public.orders
add column if not exists request_fingerprint text;

create unique index if not exists orders_client_request_id_key
on public.orders (client_request_id);

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

revoke all on function public.place_order(jsonb, jsonb) from public;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated, service_role;

commit;
