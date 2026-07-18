const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.resolve(__dirname, "..", "beheer.js");
let source = fs.readFileSync(sourcePath, "utf8");
source = source.replace("  init();", "  // init uitgeschakeld voor zuivere helpertests");
source = source.replace(
  /\}\)\(\);\s*$/,
  "  window.__beheerHelpers = { parsePrice, parseInteger, normalizeImageUrl, normalizeSettingValue, cleanText, normalizeWhatsAppPhone };\n})();"
);

const sandbox = {
  URL,
  Intl,
  console,
  document: { querySelector: () => ({}) },
  navigator: { onLine: true },
  fetch: () => { throw new Error("fetch hoort niet in helpertests"); },
  AbortController,
  Event
};
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox, { filename: "beheer.js" });
const helpers = sandbox.__beheerHelpers;

test("Nederlandse prijzen worden exact naar centen omgezet", () => {
  assert.equal(helpers.parsePrice("62,50"), 6250);
  assert.equal(helpers.parsePrice("€ 1.234,56"), 123456);
  assert.equal(helpers.parsePrice("19"), 1900);
  assert.throws(() => helpers.parsePrice("12,345"));
  assert.throws(() => helpers.parsePrice("-1"));
});

test("voorraad accepteert alleen veilige gehele aantallen", () => {
  assert.equal(helpers.parseInteger("3", 0, 9999), 3);
  assert.equal(helpers.parseInteger("", 0, 9999, 0), 0);
  assert.throws(() => helpers.parseInteger("1.5", 0, 9999));
  assert.throws(() => helpers.parseInteger("10000", 0, 9999));
});

test("afbeeldingen accepteren alleen lokale paden of https", () => {
  assert.equal(helpers.normalizeImageUrl("assets/fles.png"), "assets/fles.png");
  assert.equal(helpers.normalizeImageUrl("/fles.png"), "/fles.png");
  assert.equal(helpers.normalizeImageUrl("https://example.com/fles.png"), "https://example.com/fles.png");
  assert.throws(() => helpers.normalizeImageUrl("http://example.com/fles.png"));
  assert.throws(() => helpers.normalizeImageUrl("javascript:alert(1)"));
  assert.throws(() => helpers.normalizeImageUrl("../geheim.png"));
});

test("tekstnormalisatie bewaart regels maar verwijdert randspaties", () => {
  assert.equal(helpers.normalizeSettingValue("  Regel 1  \r\nRegel 2  "), "Regel 1\nRegel 2");
  assert.equal(helpers.cleanText("  Een   titel  ", 40), "Een titel");
});

test("Nederlandse mobiele nummers worden veilig geschikt gemaakt voor WhatsApp", () => {
  assert.equal(helpers.normalizeWhatsAppPhone("06 12 34 56 78"), "31612345678");
  assert.equal(helpers.normalizeWhatsAppPhone("0031 6 12 34 56 78"), "31612345678");
  assert.equal(helpers.normalizeWhatsAppPhone("+31 6 12 34 56 78"), "31612345678");
  assert.equal(helpers.normalizeWhatsAppPhone("123"), "");
});
