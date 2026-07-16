const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

export async function onRequestPost({ request, env }) {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "NOTIFICATION_EMAIL"
  ];

  if (required.some((key) => !env[key])) {
    return reply({ error: "De reserveringsmail is nog niet ingesteld." }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return reply({ error: "Ongeldige reservering." }, 400);
  }

  const customer = payload?.customer || {};
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!String(customer.name || "").trim() || !String(customer.phone || "").trim() || !items.length) {
    return reply({ error: "Vul naam, mobiel nummer en minstens één fles in." }, 400);
  }

  const baseUrl = String(env.SUPABASE_URL).replace(/\/$/, "");
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };

  const orderResponse = await fetch(`${baseUrl}/rest/v1/rpc/place_order`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      customer,
      items: items.map((item) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity)
      }))
    })
  });

  const orderBody = await orderResponse.json().catch(() => ({}));

  if (!orderResponse.ok) {
    return reply({
      error: orderBody.message || orderBody.error || "Reserveren is niet gelukt."
    }, 400);
  }

  const result = Array.isArray(orderBody) ? orderBody[0] : orderBody;
  const ids = items.map((item) => item.product_id).filter(Boolean);

  const productsResponse = await fetch(
    `${baseUrl}/rest/v1/products?select=id,name&id=${encodeURIComponent(`in.(${ids.join(",")})`)}`,
    { headers }
  );

  const products = await productsResponse.json().catch(() => []);
  const names = new Map(
    (Array.isArray(products) ? products : []).map((product) => [product.id, product.name])
  );

  const lines = items
    .map((item) => `${Number(item.quantity)} × ${names.get(item.product_id) || "Wijn"}`)
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
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || "De Wijnkast <onboarding@resend.dev>",
      to: [env.NOTIFICATION_EMAIL],
      subject: `Nieuwe reservering ${result?.order_number || ""}`,
      text
    })
  });

  if (!emailResponse.ok) {
    console.error("Reserveringsmail niet verzonden", await emailResponse.text());
  }

  return reply(result);
}
