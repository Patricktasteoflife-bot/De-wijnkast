# De Wijnkast van Taste of Life

Een aparte, mobiele klantenapp voor losse en schaars beschikbare flessen. De app deelt alleen openbare wijngegevens en kan bestellingen plaatsen. Klanten krijgen geen toegang tot het Taste of Life-beheer, klantgegevens, facturen of andere orders.

Deze officiële versie bevat bewust geen voorbeeldvoorraad. Zolang de live voorraadbron nog niet is ingesteld, toont de app een nette lege wijnkast zonder demonstratiemelding.

## Wat werkt al

- Mobiele wijnkast in zwart, bordeauxrood, goud en crème
- Voorraadbadges zoals `Laatste fles` en `Nog 3 flessen`
- Filters, sorteren en een winkelmand
- Klantgegevens onthouden op de eigen telefoon
- Ophalen, verzenden en een opmerking bij de bestelling
- PWA: als app op telefoon te installeren
- Veilige, atomaire voorraadvermindering: twee klanten kunnen niet dezelfde laatste fles bestellen
- Eén aanvraag-ID per reservering: een herhaalde aanvraag boekt dezelfde voorraad niet opnieuw af
- De app bevestigt direct na de order; Resend draait daarna begrensd op de achtergrond
- Klanten kunnen hun volledige bevestiging bewaren/delen en krijgen bij een geverifieerde afzender ook een eigen e-mail
- Vanuit Beheer kun je iedere klant ook direct een ingevulde WhatsApp-bevestiging sturen
- Afgeschermde order- en klantgegevens via Supabase Row Level Security
- Koppellaag voor de bestaande beheerapp in `integration/admin-connector.js`
- Eigen beveiligde beheerpagina voor wijnen, voorraad, prijzen, omschrijvingen en websiteteksten
- Reserveringenoverzicht met veilige statussen en eenmalig voorraadherstel bij annuleren
- Duidelijke 18+-controle bij reserveren en overdracht

## Nu bekijken

Open `index.html` via een lokale webserver. Bijvoorbeeld vanuit deze map:

```bash
python3 -m http.server 4173
```

Open daarna `http://localhost:4173`. Zonder gekoppelde voorraad toont de officiële app een lege wijnkast.

## Live koppelen

1. Maak een nieuw Supabase-project voor De Wijnkast.
2. Voer `supabase/schema.sql` uit in de Supabase SQL Editor.
3. Voer `supabase/migrations/20260717_beheeromgeving.sql` uit.
4. Voer `supabase/migrations/20260718_reserveringenbeheer.sql` uit.
5. Vul in `config.js` de Project URL en de publieke anon key in.
6. Zet `demoMode` op `false`.
7. Plaats de inhoud van deze map op Cloudflare Pages; de reserveringsroute staat in `functions/api/reserve.js`.
8. Open `/beheer` en gebruik de e-maillink; het bevestigde eigenaarsaccount krijgt automatisch beheerrechten.

### Bestaand live project bijwerken

Voer één keer `supabase/migrations/20260717_idempotent_reservations.sql` uit in de Supabase SQL Editor. Deze migratie houdt dezelfde RPC-naam aan en voegt alleen de unieke aanvraag-ID toe, zodat een retry dezelfde order teruggeeft zonder nogmaals voorraad te verminderen.

Heeft het bestaande project oudere ordertabellen, voer dan eerst `supabase/migrations/20260717_order_schema_compatibility.sql` uit. Deze idempotente migratie vult alleen de ontbrekende orderkolommen aan en maakt geen reservering of voorraadwijziging.

Voer daarna één keer `supabase/migrations/20260717_beheeromgeving.sql` uit. Deze migratie wijzigt geen voorraad of orders. Ze voegt alleen de beveiligde beheerrechten, openbare websiteteksten en bescherming tegen gelijktijdige voorraadwijzigingen toe. Voer bij een bestaand project vervolgens ook `supabase/migrations/20260717_beheer_productrechten.sql` uit om de minimaal benodigde lees-, toevoeg- en wijzigrechten voor producten opnieuw vast te leggen; dit script verandert zelf geen productgegevens.

Voer tot slot één keer `supabase/migrations/20260718_reserveringenbeheer.sql` uit. Tijdens installatie wijzigt dit script geen bestaande order of voorraad. Daarna kan alleen de beveiligde beheerfunctie een status aanpassen. Annuleren boekt de gereserveerde flessen precies één keer terug en maakt de annulering definitief.

De Cloudflare Pages productieomgeving gebruikt:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `RESEND_API_KEY` (secret)
- `NOTIFICATION_EMAIL`
- `RESEND_FROM` met een geverifieerd afzenderdomein voor automatische klantbevestigingen

Een fout of timeout bij Resend maakt een reeds geslaagde reservering nooit ongedaan en houdt het klantenscherm niet meer vast.

De anon key mag in de klantenapp staan. De beveiliging zit in de database-regels: klanten kunnen alleen actieve producten met voorraad lezen en de beveiligde `place_order`-functie uitvoeren. Ze kunnen geen orders, klantgegevens of beheerfuncties uitlezen.

## Zelf beheren

Open na publicatie `/beheer`. De pagina stuurt een eenmalige inloglink naar `patrick.tasteoflife@hotmail.com`. Alleen dit door Supabase bevestigde e-mailadres krijgt beheerrechten; er staat geen service-role-key of gedeeld wachtwoord in de browser.

Stel in Supabase bij **Authentication → URL Configuration** de exacte redirect-URL `https://de-wijnkast-v2.pages.dev/beheer` in. Gebruik hiervoor geen brede `*.pages.dev`-wildcard: zo kan een preview of kopie van de openbare repository nooit de beheerlink ontvangen.

Laat bij **Authentication → Providers → Email** de optie **Confirm Email** aanstaan. Na de eerste geslaagde beheerlogin kun je **Allow new users to sign up** uitzetten; bestaande magic-linklogins blijven dan werken. Beheerrechten blijven bovendien aan de concrete magic-linksessie gebonden, zodat een wachtwoordsessie nooit beheer krijgt.

Daar kun je zonder GitHub:

- nieuwe, bevestigde, klaargezette, afgeronde en geannuleerde reserveringen beheren;
- wijnen toevoegen en alle catalogusvelden aanpassen;
- voorraad, prijs, omschrijving en zichtbaarheid wijzigen;
- alle zichtbare marketingteksten en de Psalmtekst aanpassen.

De beheerpagina verwijdert geen wijnen: zet `Tonen in de app` uit om een wijn veilig te verbergen. Iedere wijziging heeft een expliciete opslaanknop. Als ondertussen een reservering de voorraad heeft veranderd, blokkeert het beheer de verouderde wijziging en vraagt het eerst opnieuw te laden.

## Belangrijk voor livegang

- Vervang de demonstratievoorraad door echte voorraad.
- Voeg echte wijnfoto-URL's toe via `image_url`.
- Controleer contact-, verzend-, privacy- en leeftijdsinformatie.
- Volg en onderhoud de werkwijze op `leeftijdscontrole.html`, inclusief de jaarlijkse controle.
- Controleer de reserveringsflow eerst met de geautomatiseerde mocktests; gebruik geen live voorraad als technische test.
- Voeg eventueel later Mollie/iDEAL toe; de huidige versie registreert een bestelling en reserveert de voorraad meteen.
