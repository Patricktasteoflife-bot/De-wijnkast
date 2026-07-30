import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../functions/api/import-website-wines.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { WEBSITE_WINES, winesMissingFrom, onRequestPost } = await import(moduleUrl);

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-key"
};

test("de vaste import bevat exact 21 wijnen en 46 flessen", () => {
  assert.equal(WEBSITE_WINES.length, 21);
  assert.equal(WEBSITE_WINES.reduce((sum, wine) => sum + wine.stock, 0), 46);
  assert.equal(new Set(WEBSITE_WINES.map((wine) => wine.sku)).size, 21);
  assert.equal(WEBSITE_WINES.filter((wine) => wine.sort_order >= 5000).length, 8);
  assert.equal(WEBSITE_WINES.filter((wine) => wine.sort_order >= 1000 && wine.sort_order < 5000).length, 13);
  assert.ok(WEBSITE_WINES.every((wine) => wine.image_url.startsWith("https://")));
  assert.ok(WEBSITE_WINES.every((wine) => wine.price_cents > 0 && wine.stock > 0));
});

test("bestaande SKU's en identieke titels worden niet opnieuw toegevoegd", () => {
  const first = WEBSITE_WINES[0];
  const second = WEBSITE_WINES[1];
  const missing = winesMissingFrom([
    { sku: first.sku },
    {
      sku: "ANDERE-SKU",
      producer: second.producer,
      name: second.name,
      vintage: second.vintage
    }
  ]);
  assert.equal(missing.length, 19);
  assert.ok(!missing.some((wine) => wine.sku === first.sku || wine.sku === second.sku));
});

test("de route voegt alleen ontbrekende vaste wijnen toe", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const existing = WEBSITE_WINES[0];
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === "GET") {
      return new Response(JSON.stringify([{
        sku: existing.sku,
        producer: existing.producer,
        name: existing.name,
        vintage: existing.vintage
      }]), { status: 200 });
    }
    return new Response(options.body, { status: 201 });
  };

  const response = await onRequestPost({
    request: new Request("https://wijnkast.example/api/import-website-wines", {
      method: "POST",
      body: JSON.stringify([{ sku: "ONGEWENST", stock: 9999 }])
    }),
    env
  });
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(result, { added: 20, existing: 1, total: 21, bottles: 46 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.apikey, "server-key");
  assert.equal(calls[1].options.headers.Authorization, "Bearer server-key");
  assert.equal(calls[1].options.headers.Prefer, "resolution=ignore-duplicates,return=representation");
  const inserted = JSON.parse(calls[1].options.body);
  assert.equal(inserted.length, 20);
  assert.ok(!inserted.some((wine) => wine.sku === existing.sku));
  assert.ok(!inserted.some((wine) => wine.sku === "ONGEWENST"));
});

test("een herhaalde import wijzigt of verdubbelt niets", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let calls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    calls += 1;
    assert.equal(options.method, "GET");
    return new Response(JSON.stringify(WEBSITE_WINES), { status: 200 });
  };

  const response = await onRequestPost({ env });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    added: 0,
    existing: 21,
    total: 21,
    bottles: 46
  });
  assert.equal(calls, 1);
});

test("de route stopt veilig zonder serverconfiguratie of bij een backendfout", async (t) => {
  const missingConfig = await onRequestPost({ env: {} });
  assert.equal(missingConfig.status, 503);

  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "fout" }), { status: 500 });
  const backendFailure = await onRequestPost({ env });
  assert.equal(backendFailure.status, 502);
});
