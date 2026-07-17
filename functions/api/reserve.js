const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

const trimSlash = (value) => String(value || "").replace(/\/$/, "");
const ORDER_TIMEOUT_MS = 10000;
const EMAIL_TIMEOUT_MS = 5000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const timeoutFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 50 && parsed <= 30000
    ? parsed
    : fallback;
};

async function fetchJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function sendReservationEmail({ env, customer, items, result, requestId }) {
  if (!env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL) {
    console.warn("Reserveringsmail overgeslagen: Resend is niet volledig ingesteld", requestId);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutFromEnv(env.RESERVATION_EMAIL_TIMEOUT_MS, EMAIL_TIMEOUT_MS)
  );
  try {
    const lines = items
      .map((item) => `${Number(item.quantity)} × ${item.product_name || "Wijn"}`)
      .join("\n");
    const delivery = customer.delivery === "shipping"
      ? "Verzenden"
      : "Ophalen bij Taste of Life";
    const total = `€ ${(Number(result?.total_cents || 0) / 100).toFixed(2).replace(".", ",")}`;
    const text = [
      "Nieuwe wijnreservering",
      String(result?.order_number || ""),
      "",
      String(customer.name),
      String(customer.phone),
      customer.email ? String(customer.email) : "",
      "Ontvangst: " + delivery,
      "",
      lines,
      "",
      "Totaal: " + total,
      customer.notes ? "\nGegevens / opmerking:\n" + customer.notes : ""
    ].filter(Boolean).join("\n");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "De-Wijnkast/2.0",
        "Idempotency-Key": `reservation/${result.order_number}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: env.RESEND_FROM || "De Wijnkast <onboarding@resend.dev>",
        to: [env.NOTIFICATION_EMAIL],
        subject: `Nieuwe reservering ${result?.order_number || ""}`,
        text
      })
    });
    const emailBody = await emailResponse.text();
    if (!emailResponse.ok) {
      console.error("Reserveringsmail niet verzonden", emailResponse.status, emailBody, requestId);
      return;
    }
    console.log("Reserveringsmail aangeboden aan Resend", result?.order_number, requestId);
  } catch (error) {
    console.error("Reserveringsmail mislukt op de achtergrond", error?.message || error, requestId);
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return reply({
      error: "De voorraadkoppeling is nog niet ingesteld.",
      code: "NOT_CONFIGURED"
    }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return reply({ error: "Ongeldige reservering." }, 400);
  }

  const customer = payload?.customer || {};
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const requestId = String(payload?.request_id || "").trim().slice(0, 100);
  if (!String(customer.name || "").trim() || !String(customer.phone || "").trim() || !items.length) {
    return reply({ error: "Vul naam, mobiel nummer en minstens één fles in." }, 400);
  }
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return reply({
      error: "Ververs De Wijnkast voordat je reserveert; de veilige aanvraag-ID ontbreekt.",
      code: "REQUEST_ID_REQUIRED"
    }, 400);
  }
  if (items.length > 25) {
    return reply({ error: "Een reservering kan maximaal 25 verschillende wijnen bevatten." }, 400);
  }

  const baseUrl = trimSlash(env.SUPABASE_URL);
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
  const customerForOrder = {
    name: String(customer.name || "").trim().slice(0, 120),
    phone: String(customer.phone || "").trim().slice(0, 60),
    email: String(customer.email || "").trim().slice(0, 254),
    delivery: customer.delivery === "shipping" ? "shipping" : "pickup",
    request_id: requestId,
    notes: [
      String(customer.notes || "").trim(),
      `Aanvraag-ID: ${requestId}`
    ].filter(Boolean).join("\n").slice(0, 4000)
  };
  const normalizedItems = items.map((item) => ({
    product_id: String(item.product_id || "").trim(),
    quantity: Number(item.quantity),
    product_name: String(item.product_name || "").trim().slice(0, 200)
  }));
  if (normalizedItems.some((item) => (
    !UUID_PATTERN.test(item.product_id)
    || !Number.isInteger(item.quantity)
    || item.quantity < 1
    || item.quantity > 99
  ))) {
    return reply({ error: "De wijnmand bevat een ongeldig aantal of product." }, 400);
  }
  if (normalizedItems.reduce((sum, item) => sum + item.quantity, 0) > 99) {
    return reply({ error: "Een reservering kan maximaal 99 flessen bevatten." }, 400);
  }

  let orderResponse;
  let orderBody;
  try {
    const orderResult = await fetchJsonWithTimeout(`${baseUrl}/rest/v1/rpc/place_order`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer: customerForOrder,
        items: normalizedItems.map(({ product_id, quantity }) => ({ product_id, quantity }))
      })
    }, timeoutFromEnv(env.RESERVATION_ORDER_TIMEOUT_MS, ORDER_TIMEOUT_MS));
    orderResponse = orderResult.response;
    orderBody = orderResult.body;
  } catch (error) {
    console.error("Voorraadkoppeling niet bereikbaar", error?.message || error, requestId);
    const status = error?.name === "AbortError" ? 504 : 502;
    return reply({ error: "De reservering kon niet worden gecontroleerd. Probeer niet opnieuw en neem contact op." }, status);
  }

  if (!orderResponse.ok) {
    return reply({
      error: orderBody.message || orderBody.error || "Reserveren is niet gelukt."
    }, orderResponse.status >= 500 ? 502 : 400);
  }

  const result = Array.isArray(orderBody) ? orderBody[0] : orderBody;
  if (!result?.order_number) {
    return reply({ error: "De reservering is verwerkt, maar de bevestiging ontbreekt. Probeer niet opnieuw en neem contact op." }, 502);
  }
  if (typeof context.waitUntil === "function") {
    context.waitUntil(sendReservationEmail({
      env,
      customer: customerForOrder,
      items: normalizedItems,
      result,
      requestId
    }));
  } else {
    console.warn("Geen achtergrondtaak beschikbaar voor reserveringsmail", requestId);
  }

  return reply(result);
}
