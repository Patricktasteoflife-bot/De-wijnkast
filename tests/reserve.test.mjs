import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../functions/api/reserve.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { onRequestPost } = await import(moduleUrl);

const payload = {
  request_id: "6d607c6a-b68e-4c73-93f8-f30f2d06df42",
  customer: {
    name: "Testklant",
    phone: "0612345678",
    email: "test@example.com",
    delivery: "pickup",
    notes: "Alleen een test"
  },
  items: [{
    product_id: "40ea3bfc-4936-4c4d-a169-dbae92eadac1",
    product_name: "Santenay",
    quantity: 1
  }]
};

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-key",
  RESEND_API_KEY: "resend-key",
  NOTIFICATION_EMAIL: "Owner@Example.com"
};

function requestFor(body = payload) {
  return new Request("https://wijnkast.example/api/reserve", {
    method: "POST",
    headers: {
      apikey: "browser-key",
      Authorization: "Bearer browser-key",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

test("antwoordt direct terwijl de e-mailtaak nog loopt", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let resolveEmail;
  const pendingEmail = new Promise((resolve) => { resolveEmail = resolve; });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/rpc/place_order")) {
      return new Response(JSON.stringify([{ order_number: "WK-TEST-1", total_cents: 6250 }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (String(url) === "https://api.resend.com/emails") return pendingEmail;
    throw new Error(`Onverwachte URL: ${url}`);
  };

  let backgroundTask;
  const response = await onRequestPost({
    request: requestFor(),
    env,
    waitUntil(task) { backgroundTask = task; }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { order_number: "WK-TEST-1", total_cents: 6250 });
  assert.ok(backgroundTask instanceof Promise);
  assert.equal(calls.length, 2, "de Resend-aanroep mag het antwoord niet blokkeren");

  const rpcCall = calls[0];
  assert.equal(rpcCall.options.headers.apikey, "server-key");
  assert.equal(rpcCall.options.headers.Authorization, "Bearer server-key");
  const rpcBody = JSON.parse(rpcCall.options.body);
  assert.equal(rpcBody.customer.request_id, payload.request_id);
  assert.match(rpcBody.customer.notes, new RegExp(payload.request_id));

  const resendCall = calls[1];
  assert.equal(resendCall.options.headers["Idempotency-Key"], "reservation/WK-TEST-1");
  const resendBody = JSON.parse(resendCall.options.body);
  assert.deepEqual(resendBody.to, ["owner@example.com"]);
  assert.match(resendBody.text, /1 × Santenay/);

  resolveEmail(new Response(JSON.stringify({ id: "mail-1" }), { status: 200 }));
  await backgroundTask;
  assert.equal(calls.length, 2);
});

test("ontbrekende Resend-config blokkeert de reservering niet", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });
  console.warn = () => {};

  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify([{ order_number: "WK-TEST-2", total_cents: 1000 }]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  let backgroundTask;
  const response = await onRequestPost({
    request: requestFor(),
    env: {
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
    },
    waitUntil(task) { backgroundTask = task; }
  });

  assert.equal(response.status, 200);
  await backgroundTask;
  assert.equal(calls.length, 1, "zonder mailconfiguratie mag alleen de order-RPC lopen");
});

test("een voorraadfout start geen e-mailtaak", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => new Response(JSON.stringify({
    message: "Onvoldoende voorraad voor één van de gekozen flessen."
  }), {
    status: 400,
    headers: { "Content-Type": "application/json" }
  });

  let backgroundStarted = false;
  const response = await onRequestPost({
    request: requestFor(),
    env,
    waitUntil() { backgroundStarted = true; }
  });

  assert.equal(response.status, 400);
  assert.equal(backgroundStarted, false);
  assert.match((await response.json()).error, /Onvoldoende voorraad/);
});

test("een ontbrekende aanvraag-ID bereikt de database niet", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let fetchStarted = false;
  globalThis.fetch = async () => {
    fetchStarted = true;
    throw new Error("fetch hoort niet te starten");
  };

  const response = await onRequestPost({
    request: requestFor({ ...payload, request_id: "" }),
    env,
    waitUntil() {}
  });

  assert.equal(response.status, 400);
  assert.equal(fetchStarted, false);
  assert.equal((await response.json()).code, "REQUEST_ID_REQUIRED");
});

test("een upstream 5xx blijft onzeker en start geen e-mailtaak", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Database tijdelijk niet bereikbaar" }), {
    status: 503,
    headers: { "Content-Type": "application/json" }
  });

  let backgroundStarted = false;
  const response = await onRequestPost({
    request: requestFor(),
    env,
    waitUntil() { backgroundStarted = true; }
  });

  assert.equal(response.status, 502);
  assert.equal(backgroundStarted, false);
});

test("een hangende e-mailtaak stopt begrensd en verandert het orderantwoord niet", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  });
  console.error = () => {};

  let emailSignal;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/rpc/place_order")) {
      return new Response(JSON.stringify([{ order_number: "WK-TEST-3", total_cents: 6250 }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    emailSignal = options.signal;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(new DOMException("Afgebroken", "AbortError"));
      }, { once: true });
    });
  };

  let backgroundTask;
  const response = await onRequestPost({
    request: requestFor(),
    env: { ...env, RESERVATION_EMAIL_TIMEOUT_MS: "50" },
    waitUntil(task) { backgroundTask = task; }
  });

  assert.equal(response.status, 200);
  await backgroundTask;
  assert.equal(emailSignal.aborted, true);
});

test("een hangende ordercontrole geeft een begrensde onzekere status zonder mail", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  });
  console.error = () => {};

  globalThis.fetch = async (url, options = {}) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      reject(new DOMException("Afgebroken", "AbortError"));
    }, { once: true });
  });

  let backgroundStarted = false;
  const response = await onRequestPost({
    request: requestFor(),
    env: { ...env, RESERVATION_ORDER_TIMEOUT_MS: "50" },
    waitUntil() { backgroundStarted = true; }
  });

  assert.equal(response.status, 504);
  assert.equal(backgroundStarted, false);
  assert.match((await response.json()).error, /Probeer niet opnieuw/);
});
