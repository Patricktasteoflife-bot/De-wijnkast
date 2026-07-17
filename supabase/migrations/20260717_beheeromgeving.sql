-- Taste of Life · De Wijnkast
-- Beveiligde beheeromgeving voor producten en openbare redactieteksten.
--
-- Deze migratie:
--   * verandert de reserveringsfunctie niet;
--   * geeft alleen een via magic-link/OTP bevestigde eigenaarsessie beheerrechten;
--   * maakt uitsluitend openbare redactieteksten publiek leesbaar;
--   * laat clients alleen de waarde van bestaande tekstsleutels wijzigen;
--   * houdt updated_at server-side bij voor settings en producten.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins
add column if not exists session_id uuid;

alter table public.admins
add column if not exists claimed_at timestamptz;

-- Gebruik de actuele, bevestigde auth.users-rij als autoriteit. Vertrouw nooit
-- op door een gebruiker wijzigbare raw_user_meta_data of op een e-mailadres
-- dat alleen vanuit de browser wordt meegestuurd.
create or replace function public.is_wijnkast_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins as a
    join auth.users as u on u.id = a.user_id
    where a.user_id = (select auth.uid())
      and lower(btrim(coalesce(u.email, ''))) = 'patrick.tasteoflife@hotmail.com'
      and u.email_confirmed_at is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and a.session_id::text = (select auth.jwt()->>'session_id')
  );
$$;

revoke all on function public.is_wijnkast_admin() from public, anon, authenticated;
grant execute on function public.is_wijnkast_admin() to authenticated;

-- Ruim een eventueel eerder aangelegde automatische e-mailtrigger op. Alleen
-- de echte magic-link/OTP-sessie hieronder mag een beheersessie vastleggen.
drop trigger if exists wijnkast_owner_admin_after_insert on auth.users;
drop trigger if exists wijnkast_owner_admin_after_identity_change on auth.users;
drop function if exists private.sync_wijnkast_owner_admin();

create or replace function public.claim_wijnkast_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id_text text := auth.jwt()->>'session_id';
  v_session_id uuid;
begin
  if v_user_id is null
     or v_session_id_text is null
     or v_session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr'
        else '[]'::jsonb
      end
    ) as method
    where method->>'method' in ('magiclink', 'otp')
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from auth.users as u
    where u.id = v_user_id
      and lower(btrim(coalesce(u.email, ''))) = 'patrick.tasteoflife@hotmail.com'
      and u.email_confirmed_at is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    return false;
  end if;

  v_session_id := v_session_id_text::uuid;

  insert into public.admins (user_id, session_id, claimed_at)
  values (v_user_id, v_session_id, now())
  on conflict (user_id) do update
  set session_id = excluded.session_id,
      claimed_at = excluded.claimed_at;

  return true;
end;
$$;

revoke all on function public.claim_wijnkast_admin() from public, anon, authenticated;
grant execute on function public.claim_wijnkast_admin() to authenticated;

create table if not exists public.site_settings (
  key text primary key,
  section text not null,
  label text not null,
  value text not null,
  input_kind text not null default 'text',
  max_length integer not null default 200,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint site_settings_key_format check (
    char_length(key) between 3 and 80
    and key ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$'
  ),
  constraint site_settings_section_length check (
    char_length(section) between 1 and 50
  ),
  constraint site_settings_label_length check (
    char_length(label) between 1 and 100
  ),
  constraint site_settings_input_kind check (
    input_kind in ('text', 'textarea')
  ),
  constraint site_settings_max_length check (
    max_length between 1 and 4000
  ),
  constraint site_settings_value_length check (
    char_length(value) between 1 and max_length
    and char_length(btrim(value)) >= 1
  )
);

comment on table public.site_settings is
  'Openbare redactieteksten voor De Wijnkast; bevat nooit secrets of persoonsgegevens.';
comment on column public.site_settings.key is
  'Vaste code-sleutel; alleen via een migratie toevoegen of wijzigen.';
comment on column public.site_settings.value is
  'Publieke tekst die een bevestigde Wijnkast-beheerder mag wijzigen.';

create index if not exists site_settings_sort_order_idx
on public.site_settings (sort_order, key);

create or replace function private.wijnkast_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function private.wijnkast_set_updated_at()
from public, anon, authenticated;

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
before update on public.site_settings
for each row
execute function private.wijnkast_set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row
execute function private.wijnkast_set_updated_at();

-- Bestaande redactiewaarden blijven bij herhaald uitvoeren intact. Alleen vaste
-- metadata mag door een volgende versie van deze migratie worden bijgewerkt.
insert into public.site_settings as current_setting
  (key, section, label, value, input_kind, max_length, sort_order)
values
  (
    'site.browser_title', 'Algemeen', 'Browsertitel',
    'De Wijnkast van Taste of Life', 'text', 100, 10
  ),
  (
    'site.meta_description', 'Algemeen', 'Zoekmachineomschrijving',
    'De Wijnkast van Taste of Life: persoonlijk geselecteerde wijnen uit mijn eigen kast.',
    'textarea', 240, 20
  ),
  (
    'brand.name', 'Algemeen', 'Merknaam',
    'De Wijnkast', 'text', 40, 30
  ),
  (
    'brand.subtitle', 'Algemeen', 'Merkondertitel',
    'van Taste of Life', 'text', 60, 40
  ),
  (
    'nav.home', 'Navigatie', 'Home',
    'Home', 'text', 30, 100
  ),
  (
    'nav.wines', 'Navigatie', 'Wijnen',
    'Wijnen', 'text', 30, 110
  ),
  (
    'nav.selection', 'Navigatie', 'Selectie',
    'Patrick''s Selectie', 'text', 40, 120
  ),
  (
    'nav.about', 'Navigatie', 'Over',
    'Over Taste of Life', 'text', 40, 130
  ),
  (
    'nav.contact', 'Navigatie', 'Contact',
    'Contact', 'text', 30, 140
  ),
  (
    'hero.title', 'Hero', 'Titel',
    'De Wijnkast', 'text', 40, 200
  ),
  (
    'hero.tagline', 'Hero', 'Slogan',
    'Liefde in het glas.', 'text', 80, 210
  ),
  (
    'hero.body', 'Hero', 'Introductietekst',
    E'Persoonlijk geselecteerde wijnen uit mijn eigen kast.\nSoms één fles, soms een klein rijtje.\nWat je hier ziet is direct beschikbaar.',
    'textarea', 360, 220
  ),
  (
    'hero.cta', 'Hero', 'Knoptekst',
    'Bekijk de wijnen', 'text', 40, 230
  ),
  (
    'collection.eyebrow', 'Collectie', 'Bovenkop',
    'Persoonlijk geselecteerd', 'text', 60, 300
  ),
  (
    'collection.title', 'Collectie', 'Titel',
    'De laatste flessen uit mijn kast', 'text', 100, 310
  ),
  (
    'collection.body', 'Collectie', 'Introductietekst',
    E'Iedere fles in deze selectie heb ik zelf uitgekozen.\nVaak zijn het de laatste flessen uit een import of privécollectie.',
    'textarea', 300, 320
  ),
  (
    'collection.options', 'Collectie', 'Optiesknop',
    'Bekijk alles', 'text', 40, 330
  ),
  (
    'empty.title', 'Collectie', 'Lege kast titel',
    'De wijnkast wordt gevuld.', 'text', 100, 340
  ),
  (
    'empty.body', 'Collectie', 'Lege kast tekst',
    'Binnenkort vind je hier de eerste persoonlijk geselecteerde flessen.',
    'textarea', 240, 350
  ),
  (
    'benefit.exclusive.title', 'Voordelen', 'Exclusief titel',
    'Exclusief', 'text', 50, 400
  ),
  (
    'benefit.exclusive.body', 'Voordelen', 'Exclusief tekst',
    E'Kleine oplages en\nunieke wijnen.', 'textarea', 140, 410
  ),
  (
    'benefit.available.title', 'Voordelen', 'Beschikbaar titel',
    'Direct beschikbaar', 'text', 50, 420
  ),
  (
    'benefit.available.body', 'Voordelen', 'Beschikbaar tekst',
    E'Geen wachttijd.\nWat je ziet is leverbaar.', 'textarea', 140, 430
  ),
  (
    'benefit.care.title', 'Voordelen', 'Zorg titel',
    'Met zorg gekozen', 'text', 50, 440
  ),
  (
    'benefit.care.body', 'Voordelen', 'Zorg tekst',
    E'Voor echte\nliefhebbers.', 'textarea', 140, 450
  ),
  (
    'benefit.personal.title', 'Voordelen', 'Persoonlijk titel',
    'Persoonlijk & eerlijk', 'text', 50, 460
  ),
  (
    'benefit.personal.body', 'Voordelen', 'Persoonlijk tekst',
    E'Uit mijn eigen kast,\nrecht uit het hart.', 'textarea', 140, 470
  ),
  (
    'about.eyebrow', 'Over', 'Bovenkop',
    'Taste of Life', 'text', 60, 500
  ),
  (
    'about.title', 'Over', 'Titel',
    'Wijn met een verhaal.', 'text', 100, 510
  ),
  (
    'about.body', 'Over', 'Tekst',
    'Geen anonieme voorraad, maar een kleine selectie die met aandacht is gekozen en persoonlijk wordt aangeboden.',
    'textarea', 300, 520
  ),
  (
    'footer.name', 'Footer', 'Naam',
    'De Wijnkast van Taste of Life', 'text', 60, 600
  ),
  (
    'footer.tagline', 'Footer', 'Tagline',
    'Persoonlijk geselecteerd. Met liefde voor de fles.',
    'textarea', 180, 610
  ),
  (
    'footer.verse', 'Footer', 'Psalmtekst',
    E'“Your word is a lamp for my feet,\na light on my path.”',
    'textarea', 300, 620
  ),
  (
    'footer.verse_reference', 'Footer', 'Bronvermelding',
    'Psalm 119:105', 'text', 80, 630
  )
on conflict (key) do update
set
  section = excluded.section,
  label = excluded.label,
  input_kind = excluded.input_kind,
  max_length = excluded.max_length,
  sort_order = excluded.sort_order
where (
  current_setting.section,
  current_setting.label,
  current_setting.input_kind,
  current_setting.max_length,
  current_setting.sort_order
) is distinct from (
  excluded.section,
  excluded.label,
  excluded.input_kind,
  excluded.max_length,
  excluded.sort_order
);

alter table public.site_settings enable row level security;

drop policy if exists "Iedereen leest openbare appteksten" on public.site_settings;
create policy "Iedereen leest openbare appteksten"
on public.site_settings for select
to anon, authenticated
using (true);

drop policy if exists "Beheerder wijzigt openbare appteksten" on public.site_settings;
create policy "Beheerder wijzigt openbare appteksten"
on public.site_settings for update
to authenticated
using (public.is_wijnkast_admin())
with check (public.is_wijnkast_admin());

-- Geen client mag keys/metadata toevoegen, verwijderen of wijzigen. Een admin
-- mag via PostgREST alleen de bestaande publieke value-kolom aanpassen.
revoke all on public.site_settings from public, anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant update (value) on public.site_settings to authenticated;

-- Houd de bestaande admins-tabel uitsluitend leesbaar voor de echte eigenaar.
alter table public.admins enable row level security;
drop policy if exists "Beheerder ziet admins" on public.admins;
create policy "Beheerder ziet admins"
on public.admins for select
to authenticated
using (public.is_wijnkast_admin());

revoke all on public.admins from public, anon, authenticated;
grant select on public.admins to authenticated;

-- Leg op bestaande projecten ook de minimaal benodigde productrechten vast.
-- Dit voert zelf geen productupdate uit; RLS blijft iedere wijziging toetsen
-- aan de hierboven bewezen en sessiegebonden beheerder.
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
