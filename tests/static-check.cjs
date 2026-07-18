const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const catalogus = fs.readFileSync(path.join(root, "catalogus.js"), "utf8");
const configScript = fs.readFileSync(path.join(root, "config.js"), "utf8");

const missingIds = [...app.matchAll(/querySelector\("#([A-Za-z0-9_-]+)"\)/g)]
  .map((match) => match[1])
  .filter((id) => !html.includes(`id="${id}"`));

if (missingIds.length) throw new Error(`Ontbrekende HTML-id's: ${missingIds.join(", ")}`);

const requiredFiles = [
  "styles.css",
  "config.js",
  "app.js",
  "manifest.webmanifest",
  "privacy.html",
  ".well-known/assetlinks.json",
  "sw.js",
  "functions/api/reserve.js",
  "assets/taste-of-life-logo.jpg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
  "assets/wijnkast-hero.png",
  "assets/share-wijnkast.jpg",
  "caroline-morey-chambrees-2023.webp",
  "caroline-morey-santenay-2024.webp",
  "dagueneau-pur-sang-2023.webp",
  "dagueneau-blanc-etc-2023.webp",
  "chateau-de-la-cree-meursault-les-tillets-2020.webp",
  "henri-prudhon-saint-aubin-le-ban-2024.webp",
  "knoll-ried-schuett-2024.webp",
  "les-forts-de-latour-2015.webp",
  "tortochot-charmes-chambertin-2013.webp",
  "les-horees-rose-bonheur-2023.webp",
  "supabase/schema.sql",
  "supabase/migrations/20260717_idempotent_reservations.sql",
  "supabase/migrations/20260717_order_schema_compatibility.sql",
  "supabase/migrations/20260717_beheeromgeving.sql",
  "supabase/migrations/20260717_beheer_productrechten.sql",
  "integration/admin-connector.js",
  "beheer.html",
  "beheer.css",
  "beheer.js",
  "vendor/supabase.min.js",
  "vendor/supabase.LICENSE",
  "_headers",
  "voorraad-template.csv"
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missingFiles.length) throw new Error(`Ontbrekende bestanden: ${missingFiles.join(", ")}`);

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
if (manifest.id !== "/" || manifest.scope !== "/" || manifest.start_url !== "/") {
  throw new Error("Het Play/PWA-bereik is niet vastgelegd.");
}
if (!manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable")) {
  throw new Error("Maskable Play/PWA-icoon ontbreekt.");
}

if (html.includes("admin-connector.js")) throw new Error("De beheerconnector mag niet door de klantenapp worden geladen.");
if (!app.includes("/api/reserve")) throw new Error("Beveiligde reserveringsroute ontbreekt.");
const reserve = fs.readFileSync(path.join(root, "functions/api/reserve.js"), "utf8");
if (!reserve.includes("/rpc/place_order")) throw new Error("Beveiligde bestelfunctie ontbreekt.");
if (!reserve.includes("context.waitUntil")) throw new Error("Achtergrondmail ontbreekt.");
if (!reserve.includes("fetchJsonWithTimeout")) throw new Error("Begrensde orderaanroep ontbreekt.");
if (!reserve.includes('"Idempotency-Key"')) throw new Error("Dubbele Resend-mails zijn niet afgevangen.");
if (!app.includes("PENDING_ORDER_KEY")) throw new Error("Bescherming tegen dubbel reserveren ontbreekt.");
if (!app.includes("request_id: requestId")) throw new Error("Aanvraag-ID wordt niet meegestuurd.");
const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const orderCompatibilityMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260717_order_schema_compatibility.sql"), "utf8");
if (!schema.includes("enable row level security")) {
  throw new Error("Row Level Security ontbreekt.");
}
if (!schema.includes("client_request_id") || !schema.includes("request_fingerprint") || !schema.includes("on conflict (client_request_id) do nothing")) {
  throw new Error("Database-idempotentie ontbreekt.");
}
if (!schema.includes("Aanvraag-ID ontbreekt.") || !schema.includes("sha256(convert_to")) {
  throw new Error("Verplichte aanvraag-ID of draagbare fingerprint ontbreekt.");
}
if (!schema.includes("order by product_id")) throw new Error("Vaste voorraad-lockvolgorde ontbreekt.");
for (const column of ["orders\nadd column if not exists updated_at", "order_items\nadd column if not exists producer", "order_items\nadd column if not exists vintage"]) {
  if (!orderCompatibilityMigration.includes(column)) throw new Error(`Compatibiliteitskolom ontbreekt: ${column}`);
}
if (/^\s*(?:insert\s+into|update|delete\s+from)\s+public[.](?:products|orders|order_items)\b/im.test(orderCompatibilityMigration)) {
  throw new Error("De ordercompatibiliteitsmigratie mag geen product- of ordergegevens wijzigen.");
}
if (!reserve.includes("ORDER_BACKEND_ERROR") || !reserve.includes("EXPECTED_ORDER_ERRORS")) {
  throw new Error("Technische databasefouten worden aan klanten getoond.");
}

const adminHtml = fs.readFileSync(path.join(root, "beheer.html"), "utf8");
const adminApp = fs.readFileSync(path.join(root, "beheer.js"), "utf8");
const adminMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260717_beheeromgeving.sql"), "utf8");
const productRightsMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260717_beheer_productrechten.sql"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
const androidManifest = JSON.parse(fs.readFileSync(path.join(root, "android/twa-manifest.json"), "utf8"));
const androidBuild = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
const assetLinks = JSON.parse(fs.readFileSync(path.join(root, ".well-known/assetlinks.json"), "utf8"));
const missingAdminIds = [...adminApp.matchAll(/querySelector\("#([A-Za-z0-9_-]+)"\)/g)]
  .map((match) => match[1])
  .filter((id) => !adminHtml.includes(`id="${id}"`));
if (missingAdminIds.length) throw new Error(`Ontbrekende beheer-HTML-id's: ${missingAdminIds.join(", ")}`);

if (!html.includes("De Wijnkast van Taste of Life") || !adminHtml.includes("De Wijnkast van Taste of Life")) {
  throw new Error("De nieuwe appnaam ontbreekt.");
}
if (!html.includes('href="/privacy.html"') || !fs.readFileSync(path.join(root, "privacy.html"), "utf8").includes("Privacyverklaring")) {
  throw new Error("De openbare privacyverklaring ontbreekt.");
}
if (androidManifest.packageId !== "nl.tasteoflife.dewijnkast" || androidManifest.host !== "de-wijnkast-v2.pages.dev") {
  throw new Error("De Android-identiteit wijkt af.");
}
if (assetLinks[0]?.target?.package_name !== androidManifest.packageId || !assetLinks[0]?.target?.sha256_cert_fingerprints?.length) {
  throw new Error("Android App Links zijn niet aan de package-ID gekoppeld.");
}
if (!androidBuild.includes("compileSdkVersion 36") || !androidBuild.includes("targetSdkVersion 36") || !androidBuild.includes('buildToolsVersion "36.0.0"')) {
  throw new Error("De Android-bouwdoelen staan niet op API 36.");
}
if (!app.includes("SITE_SETTING_RULES") || !app.includes("rows.forEach(applySiteSetting)")) {
  throw new Error("Veilige live appteksten ontbreken.");
}
if (!app.includes("element.textContent = value") || app.includes("element.innerHTML = value")) {
  throw new Error("Appteksten worden niet veilig als tekst toegepast.");
}
if (!adminApp.includes("signInWithOtp") || !adminApp.includes("patrick.tasteoflife@hotmail.com")) {
  throw new Error("Beveiligde eigenaarlogin ontbreekt.");
}
if (!adminApp.includes("config.adminRedirectUrl") || !fs.readFileSync(path.join(root, "config.js"), "utf8").includes("https://de-wijnkast-v2.pages.dev/beheer")) {
  throw new Error("De magic-link gebruikt geen vaste productiecallback.");
}
if (!adminApp.includes('rpc("is_wijnkast_admin")') || !adminApp.includes('rpc("claim_wijnkast_admin")') || adminApp.includes("service_role")) {
  throw new Error("Beheerautorisatie is onveilig of ontbreekt.");
}
if (!adminApp.includes('.eq("updated_at", state.editingProduct.updated_at)') || !adminApp.includes('.eq("updated_at", setting.updated_at)')) {
  throw new Error("Bescherming tegen gelijktijdige beheerwijzigingen ontbreekt.");
}
if (adminApp.includes(".innerHTML")) throw new Error("Beheerdata mag niet via innerHTML worden opgebouwd.");
if (!adminMigration.includes("create table if not exists public.site_settings") || !adminMigration.includes("enable row level security")) {
  throw new Error("RLS voor appteksten ontbreekt.");
}
if (!adminMigration.includes("email_confirmed_at is not null") || !adminMigration.includes("grant update (value)")) {
  throw new Error("Beheeraccount of kolombeperking is onvoldoende beveiligd.");
}
if (!adminMigration.includes("method->>'method' in ('magiclink', 'otp')") || !adminMigration.includes("a.session_id::text") || !adminMigration.includes("claim_wijnkast_admin")) {
  throw new Error("Beheerrechten zijn niet aan een bewezen magic-linksessie gebonden.");
}
if (!adminMigration.includes("products_set_updated_at") || !adminMigration.includes("site_settings_set_updated_at")) {
  throw new Error("Optimistische locks missen server-timestamps.");
}
for (const [name, sql] of [
  ["beheeromgeving", adminMigration],
  ["productrechten", productRightsMigration]
]) {
  if (!sql.includes('create policy "Beheerder leest alle producten"') ||
      !sql.includes('create policy "Beheerder voegt producten toe"') ||
      !sql.includes('create policy "Beheerder wijzigt producten"') ||
      !sql.includes("using (public.is_wijnkast_admin())") ||
      !sql.includes("grant insert (\n  sku, name, producer") ||
      !sql.includes("grant update (\n  sku, name, producer") ||
      !sql.includes("revoke all privileges on table public.products from public, anon, authenticated") ||
      !sql.includes("grant select on public.products to anon, authenticated")) {
    throw new Error(`Veilige productrechten ontbreken in ${name}.`);
  }
}
if (/^\s*(?:insert\s+into|update|delete\s+from)\s+public[.](?:products|orders|order_items)\b/im.test(productRightsMigration)) {
  throw new Error("De rechtenreparatie mag geen product- of ordergegevens wijzigen.");
}
if (/for\s+(?:all|delete)\b/i.test(productRightsMigration)) {
  throw new Error("De rechtenreparatie mag geen verwijderpolicy voor producten maken.");
}
if (!serviceWorker.includes("url.origin !== self.location.origin") || !serviceWorker.includes('url.pathname === "/beheer"') || !serviceWorker.includes('url.pathname === "/beheer.html"')) {
  throw new Error("Service worker schermt beheer- en externe data niet af.");
}
if (serviceWorker.includes("cache.put(event.request")) throw new Error("Service worker cachet nog willekeurige responses.");
if (!serviceWorker.includes("WIJNKAST_SW_VERSION") || !adminApp.includes("ensureSafeServiceWorker")) {
  throw new Error("Een oude brede cache wordt niet vóór beheer bijgewerkt.");
}
if (!serviceWorker.includes('const VERSION = "wijnkast-v6-2-snel"') || !adminApp.includes("wijnkast-v6-2-snel")) {
  throw new Error("De snelle klantenapp en beheeromgeving gebruiken niet dezelfde cacheversie.");
}
if (!headers.includes("/beheer\n") || !headers.includes("/beheer.html\n") || !headers.includes("Cache-Control: no-store")) {
  throw new Error("Beheerheaders missen de canonieke Cloudflare-route.");
}

if (!html.includes('property="og:image"') || !html.includes("/assets/share-wijnkast.jpg") || !html.includes('rel="canonical"')) {
  throw new Error("De nette linkweergave voor WhatsApp en social media ontbreekt.");
}
if (!html.includes('id="shippingFields"') || !html.includes("data-shipping-required") || !html.includes('id="businessFields"')) {
  throw new Error("De verkorte, slimme checkout ontbreekt.");
}
if (!app.includes("syncCheckoutFields") || !app.includes("input.required = shipping") || !app.includes("input.disabled = !shipping")) {
  throw new Error("Bezorgvelden worden niet veilig alleen bij verzenden verplicht.");
}
const configuredWhatsApp = configScript.match(/whatsappNumber:\s*"([^"]+)"/)?.[1] || "";
if (!html.includes('id="footerWhatsApp"') || !html.includes('id="successWhatsApp"') || !app.includes("https://wa.me/") || !/^\d{10,15}$/.test(configuredWhatsApp)) {
  throw new Error("De WhatsApp-koppeling ontbreekt of heeft geen geldig nummer.");
}
if (!html.includes('id="successSummary"') || !html.includes('id="copyOrderNumberButton"') || !app.includes("renderSuccessSummary")) {
  throw new Error("De nette reserveringsbevestiging ontbreekt.");
}

const optimizedImages = [
  "caroline-morey-chambrees-2023.webp",
  "caroline-morey-santenay-2024.webp",
  "dagueneau-pur-sang-2023.webp",
  "dagueneau-blanc-etc-2023.webp",
  "chateau-de-la-cree-meursault-les-tillets-2020.webp",
  "henri-prudhon-saint-aubin-le-ban-2024.webp",
  "knoll-ried-schuett-2024.webp",
  "les-forts-de-latour-2015.webp",
  "tortochot-charmes-chambertin-2013.webp",
  "les-horees-rose-bonheur-2023.webp"
];
for (const file of optimizedImages) {
  const image = fs.readFileSync(path.join(root, file));
  if (image.subarray(0, 4).toString("ascii") !== "RIFF" || image.subarray(8, 12).toString("ascii") !== "WEBP") {
    throw new Error(`Geen geldig WebP-bestand: ${file}`);
  }
  if (image.length > 300_000) throw new Error(`Geoptimaliseerde wijnfoto is nog te groot: ${file}`);
  if (!catalogus.includes(`image_url: "${file}"`)) throw new Error(`Catalogus gebruikt de snelle wijnfoto niet: ${file}`);
  if (!serviceWorker.includes(`/${file}`)) throw new Error(`Snelle wijnfoto ontbreekt in de offline cache: ${file}`);
}
if (/image_url:\s*"[^"]+\.png"/.test(catalogus)) throw new Error("Catalogus verwijst nog naar zware PNG-wijnfoto's.");
const shareImage = fs.readFileSync(path.join(root, "assets/share-wijnkast.jpg"));
if (shareImage[0] !== 0xff || shareImage[1] !== 0xd8 || shareImage.length > 500_000) {
  throw new Error("De linkvoorbeeldafbeelding is ongeldig of te zwaar.");
}

console.log(JSON.stringify({
  htmlIds: [...new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((match) => match[1]))].length,
  appSelectors: [...app.matchAll(/querySelector\("#[A-Za-z0-9_-]+"\)/g)].length,
  requiredFiles: requiredFiles.length,
  securityBoundary: "ok",
  adminBoundary: "ok"
}));
