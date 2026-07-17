const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260717_beheeromgeving.sql"), "utf8");

function appContract() {
  return new Map([...app.matchAll(/^\s+"([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)": \{[^\n]*max: (\d+)/gm)]
    .map((match) => [match[1], Number(match[2])]));
}

function databaseContract() {
  const seed = migration.slice(
    migration.indexOf("insert into public.site_settings"),
    migration.indexOf("on conflict (key)")
  );
  const rows = seed.split(/\n  \(\n/).slice(1).map((block) => {
    const key = block.match(/^\s*'([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)'/);
    const metadata = block.match(/'(?:text|textarea)', (\d+), \d+\s*\n\s*\)/);
    return key && metadata ? [key[1], Number(metadata[1])] : null;
  }).filter(Boolean);
  return new Map(rows);
}

test("alle 34 beheerteksten hebben dezelfde limiet in app en database", () => {
  const client = appContract();
  const database = databaseContract();
  assert.equal(client.size, 34);
  assert.equal(database.size, 34);
  assert.deepEqual([...client], [...database]);
});

test("iedere zichtbare tekstsleutel heeft een veilig DOM-doel", () => {
  for (const key of appContract().keys()) {
    if (key.startsWith("site.")) continue;
    assert.match(html, new RegExp(`data-site-setting="${key.replaceAll(".", "\\.")}"`));
  }
});

test("de standaardnaam is overal De Wijnkast van Taste of Life", () => {
  assert.match(html, /<title>De Wijnkast van Taste of Life<\/title>/);
  assert.match(migration, /'site\.browser_title'[\s\S]*?'De Wijnkast van Taste of Life'/);
  assert.match(migration, /'footer\.name'[\s\S]*?'De Wijnkast van Taste of Life'/);
});
