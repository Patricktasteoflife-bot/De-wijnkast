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
  "integration/admin-connector.js",
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

console.log(JSON.stringify({
  htmlIds: [...new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((match) => match[1]))].length,
  appSelectors: [...app.matchAll(/querySelector\("#[A-Za-z0-9_-]+"\)/g)].length,
  requiredFiles: requiredFiles.length,
  securityBoundary: "ok"
}));
