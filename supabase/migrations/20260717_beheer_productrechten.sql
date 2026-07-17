-- De Wijnkast van Taste of Life
-- Eenmalige, idempotente reparatie voor bestaande projecten waarop de
-- productrechten nog niet aan de beveiligde beheerder waren toegekend.
-- Dit script wijzigt geen producten, prijzen, voorraad, orders of orderregels.

begin;

alter table public.products enable row level security;

drop policy if exists "Beheerder beheert producten" on public.products;
drop policy if exists "Beheerder leest alle producten" on public.products;
drop policy if exists "Beheerder voegt producten toe" on public.products;
drop policy if exists "Beheerder wijzigt producten" on public.products;

create policy "Beheerder leest alle producten"
on public.products for select
to authenticated
using (public.is_wijnkast_admin());

create policy "Beheerder voegt producten toe"
on public.products for insert
to authenticated
with check (public.is_wijnkast_admin());

create policy "Beheerder wijzigt producten"
on public.products for update
to authenticated
using (public.is_wijnkast_admin())
with check (public.is_wijnkast_admin());

-- Bezoekers blijven uitsluitend lezen via de bestaande klantpolicy.
-- De beheerpagina kan producten bekijken, toevoegen en wijzigen, maar niet
-- definitief verwijderen; verbergen gebeurt met het veld active.
revoke all privileges on table public.products from public, anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert (
  sku, name, producer, vintage, region, country, color, description,
  image_url, price_cents, stock, active, sort_order
) on public.products to authenticated;
grant update (
  sku, name, producer, vintage, region, country, color, description,
  image_url, price_cents, stock, active, sort_order
) on public.products to authenticated;

notify pgrst, 'reload schema';

commit;
