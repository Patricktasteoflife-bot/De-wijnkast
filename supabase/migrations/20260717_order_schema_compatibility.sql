-- De Wijnkast van Taste of Life
-- Herstelt uitsluitend ontbrekende kolommen in oudere ordertabellen.
-- Dit script maakt geen reservering en wijzigt geen product of voorraad.

begin;

alter table public.orders
add column if not exists updated_at timestamptz not null default now();

alter table public.order_items
add column if not exists producer text;

alter table public.order_items
add column if not exists vintage text;

notify pgrst, 'reload schema';

commit;
