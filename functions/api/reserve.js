const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[character]));

export async function onRequestPost({ request, env }) {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "NOTIFICATION_EMAIL"
  ];

  if (required.some((key) => !env[key])) {
    return json({ error: "De reserveringsmail is nog niet ingesteld." }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Ongeldige reservering." }, 400);
  }

  const customer = payload?.customer || {};
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!String(customer.name || "").trim() || !String(customer.phone || "").trim() || !items.length) {
    return json({ error: "Vul naam, mobiel nummer en minstens één fles in." }, 400);
  }

  const baseUrl = String(env.SUPABASE_URL).replace(/\/$/, "");
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json"
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
    return json({
      error: orderBody.message || orderBody.error || "Reserveren is niet gelukt."
    }, 400);
  }

  const result = Array.isArray(orderBody) ? orderBody[0] : orderBody;
  const orderNumber = result?.order_number;

  const detailResponse = await fetch(
    `${baseUrl}/rest/v1/orders?order_number=eq.${encodeURIComponent(orderNumber)}&select=order_number,customer_name,phone,email,delivery_method,notes,total_cents,order_items(product_name,unit_price_cents,quantity)`,
    { headers }
  );

  const details = await detailResponse.json().catch(() => []);
  const order = Array.isArray(details) ? details[0] : null;

  if (order) {
    const rows = (order.order_items || []).map((item) =>
      `<li>${escapeHtml(item.quantity)} × ${escapeHtml(item.product_name)} — € ${(Number(item.unit_price_cents) / 100).toFixed(2).replace(".", ",")}</li>`
    ).join("");

    const delivery = order.delivery_method === "shipping"
      ? "Verzenden"
      : "Ophalen bij Taste of Life";

    const html = `
      <h2>Nieuwe wijnreservering</h2>
      <p><strong>${escapeHtml(order.order_number)}</strong></p>
      <p><strong>${escapeHtml(order.customer_name)}</strong><br>${escapeHtml(order.phone)}${order.email ? `<br>${escapeHtml(order.email)}` : ""}</p>
      <p><strong>Ontvangst:</strong> ${delivery}</p>
      <ul>${rows}</ul>
      <p><strong>Totaal:</strong> € ${(Number(order.total_cents) / 100).toFixed(2).replace(".", ",")}</p>
      ${order.notes ? `<p><strong>Gegevens / opmerking:</strong><br>${escapeHtml(order.notes).replace(/\n/g, "<br>")}</p>` : ""}
    `;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.RESEND_FROM || "De Wijnkast <onboarding@resend.dev>",
        to: [env.NOTIFICATION_EMAIL],
        subject: `Nieuwe reservering ${order.order_number}`,
        html
      })
    });
  }

  return json(result);
}
