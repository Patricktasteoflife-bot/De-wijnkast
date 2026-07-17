const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

const missingIds = [...app.matchAll(/querySelector\("#([A-Za-z0-9_-]+)"\)/g)]
  .map((match) => match[1])
  .filter((id) => !html.includes(`id="${id}"`));

if (missingIds.length) throw new Error(`Ontbrekende HTML-id's: ${missingIds.join(", ")}`);

const requiredFiles = [
  "styles.css",
  "config.js",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "functions/api/reserve.js",
  "assets/taste-of-life-logo.jpg",
  "assets/wijnkast-hero.png",
  "supabase/schema.sql",
  "supabase/migrations/20260717_idempotent_reservations.sql",
  "supabase/migrations/20260717_beheeromgeving.sql",
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

JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));

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

const adminHtml = fs.readFileSync(path.join(root, "beheer.html"), "utf8");
const adminApp = fs.readFileSync(path.join(root, "beheer.js"), "utf8");
const adminMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260717_beheeromgeving.sql"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
const missingAdminIds = [...adminApp.matchAll(/querySelector\("#([A-Za-z0-9_-]+)"\)/g)]
  .map((match) => match[1])
  .filter((id) => !adminHtml.includes(`id="${id}"`));
if (missingAdminIds.length) throw new Error(`Ontbrekende beheer-HTML-id's: ${missingAdminIds.join(", ")}`);

if (!html.includes("De Wijnkast van Taste of Life") || !adminHtml.includes("De Wijnkast van Taste of Life")) {
  throw new Error("De nieuwe appnaam ontbreekt.");
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
if (!serviceWorker.includes("url.origin !== self.location.origin") || !serviceWorker.includes('url.pathname === "/beheer"') || !serviceWorker.includes('url.pathname === "/beheer.html"')) {
  throw new Error("Service worker schermt beheer- en externe data niet af.");
}
if (serviceWorker.includes("cache.put(event.request")) throw new Error("Service worker cachet nog willekeurige responses.");
if (!serviceWorker.includes("WIJNKAST_SW_VERSION") || !adminApp.includes("ensureSafeServiceWorker")) {
  throw new Error("Een oude brede cache wordt niet vóór beheer bijgewerkt.");
}
if (!headers.includes("/beheer\n") || !headers.includes("/beheer.html\n") || !headers.includes("Cache-Control: no-store")) {
  throw new Error("Beheerheaders missen de canonieke Cloudflare-route.");
}

console.log(JSON.stringify({
  htmlIds: [...new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((match) => match[1]))].length,
  appSelectors: [...app.matchAll(/querySelector\("#[A-Za-z0-9_-]+"\)/g)].length,
  requiredFiles: requiredFiles.length,
  securityBoundary: "ok",
  adminBoundary: "ok"
}));
