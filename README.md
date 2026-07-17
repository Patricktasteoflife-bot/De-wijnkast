# De Wijnkast | Taste of Life

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
- Afgeschermde order- en klantgegevens via Supabase Row Level Security
- Koppellaag voor de bestaande beheerapp in `integration/admin-connector.js`

## Nu bekijken

Open `index.html` via een lokale webserver. Bijvoorbeeld vanuit deze map:

```bash
python3 -m http.server 4173
```

Open daarna `http://localhost:4173`. Zonder gekoppelde voorraad toont de officiële app een lege wijnkast.

## Live koppelen

1. Maak een nieuw Supabase-project voor De Wijnkast.
2. Voer `supabase/schema.sql` uit in de Supabase SQL Editor.
3. Maak in Supabase Authentication jouw eigen beheeraccount aan.
4. Voeg jouw `auth.users.id` toe aan `public.admins` met de instructie onderaan `schema.sql`.
5. Vul in `config.js` de Project URL en de publieke anon key in.
6. Zet `demoMode` op `false`.
7. Plaats de inhoud van deze map op Cloudflare Pages; de reserveringsroute staat in `functions/api/reserve.js`.

### Bestaand live project bijwerken

Voer één keer `supabase/migrations/20260717_idempotent_reservations.sql` uit in de Supabase SQL Editor. Deze migratie houdt dezelfde RPC-naam aan en voegt alleen de unieke aanvraag-ID toe, zodat een retry dezelfde order teruggeeft zonder nogmaals voorraad te verminderen.

De Cloudflare Pages productieomgeving gebruikt:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `RESEND_API_KEY` (secret)
- `NOTIFICATION_EMAIL`
- optioneel `RESEND_FROM` voor een geverifieerd afzenderdomein

Een fout of timeout bij Resend maakt een reeds geslaagde reservering nooit ongedaan en houdt het klantenscherm niet meer vast.

De anon key mag in de klantenapp staan. De beveiliging zit in de database-regels: klanten kunnen alleen actieve producten met voorraad lezen en de beveiligde `place_order`-functie uitvoeren. Ze kunnen geen orders, klantgegevens of beheerfuncties uitlezen.

## Koppeling met jouw beheerapp

De beheerapp gebruikt `integration/admin-connector.js` met het tijdelijke toegangstoken van jouw ingelogde Supabase-account. Alleen een gebruiker die ook in `public.admins` staat, mag:

- wijnen toevoegen of aanpassen;
- voorraad handmatig wijzigen;
- alle Wijnkast-bestellingen bekijken;
- de status van een bestelling aanpassen.

De precieze knoppen kunnen aan jouw bestaande app worden toegevoegd zodra de actuele bronbestanden beschikbaar zijn. De klantapp blijft een losse website en bevat geen route of menu naar de beheerapp.

## Belangrijk voor livegang

- Vervang de demonstratievoorraad door echte voorraad.
- Voeg echte wijnfoto-URL's toe via `image_url`.
- Controleer contact-, verzend-, privacy- en leeftijdsinformatie.
- Controleer de reserveringsflow eerst met de geautomatiseerde mocktests; gebruik geen live voorraad als technische test.
- Voeg eventueel later Mollie/iDEAL toe; de huidige versie registreert een bestelling en reserveert de voorraad meteen.
