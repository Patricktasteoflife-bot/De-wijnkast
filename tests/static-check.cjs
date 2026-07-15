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
  "assets/taste-of-life-logo.jpg",
  "assets/wijnkast-hero.png",
  "supabase/schema.sql",
  "integration/admin-connector.js",
  "voorraad-template.csv"
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missingFiles.length) throw new Error(`Ontbrekende bestanden: ${missingFiles.join(", ")}`);

JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));

if (html.includes("admin-connector.js")) throw new Error("De beheerconnector mag niet door de klantenapp worden geladen.");
if (!app.includes("/rpc/place_order")) throw new Error("Beveiligde bestelfunctie ontbreekt.");
if (!fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8").includes("enable row level security")) {
  throw new Error("Row Level Security ontbreekt.");
}

console.log(JSON.stringify({
  htmlIds: [...new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((match) => match[1]))].length,
  appSelectors: [...app.matchAll(/querySelector\("#[A-Za-z0-9_-]+"\)/g)].length,
  requiredFiles: requiredFiles.length,
  securityBoundary: "ok"
}));
