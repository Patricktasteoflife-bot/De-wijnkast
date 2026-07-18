const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

const trimSlash = (value) => String(value || "").replace(/\/$/, "");
const normalizeLineBreaks = (value) => String(value || "")
  .replace(/\\r\\n|\\n|\\r/g, "\n")
  .replace(/\r\n?/g, "\n");
const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");
const ORDER_TIMEOUT_MS = 10000;
const EMAIL_TIMEOUT_MS = 5000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPECTED_ORDER_ERRORS = new Set([
  "Naam ontbreekt.",
  "Mobiel nummer ontbreekt.",
  "De wijnmand is leeg.",
  "Een reservering kan maximaal 25 verschillende wijnen bevatten.",
  "Een reservering kan maximaal 99 flessen bevatten.",
  "Aanvraag-ID ontbreekt.",
  "Ongeldige aanvraag-ID.",
  "Ongeldig product of aantal.",
  "Ongeldig aantal.",
  "Onvoldoende voorraad voor één van de gekozen flessen.",
  "Deze aanvraag-ID hoort bij een andere reservering."
]);

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
    const orderNumber = String(result?.order_number || "").trim();
    const customerName = String(customer.name || "").trim();
    const customerPhone = String(customer.phone || "").trim();
    const customerEmail = String(customer.email || "").trim();
    const normalizedNotes = normalizeLineBreaks(customer.notes).trim();
    const detailLines = normalizedNotes
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^Aanvraag-ID\s*:/i.test(line));
    const itemLines = items
      .map((item) => `${Number(item.quantity)} × ${item.product_name || "Wijn"}`)
      .join("\n");
    const delivery = customer.delivery === "shipping"
      ? "Verzenden"
      : "Ophalen bij Taste of Life";
    const total = `€ ${(Number(result?.total_cents || 0) / 100).toFixed(2).replace(".", ",")}`;
    const text = [
      "DE WIJNKAST VAN TASTE OF LIFE",
      "Nieuwe reservering",
      `Ordernummer: ${orderNumber}`,
      "",
      "KLANT",
      customerName,
      customerPhone,
      customerEmail,
      "Ontvangst: " + delivery,
      "",
      "WIJNEN",
      itemLines,
      "",
      "Totaal: " + total,
      detailLines.length ? "\nGEGEVENS / OPMERKING\n" + detailLines.join("\n") : "",
      "",
      "Open beheer: https://de-wijnkast-v2.pages.dev/beheer",
      `Technische referentie: ${requestId}`
    ].filter(Boolean).join("\n");

    const itemRows = items.map((item) => `
      <tr>
        <td style="padding:14px 12px 14px 0;border-bottom:1px solid #eee5d8;color:#6f6258;font:700 13px Arial,sans-serif;vertical-align:top;white-space:nowrap;">${escapeHtml(Number(item.quantity))} ×</td>
        <td style="padding:14px 0;border-bottom:1px solid #eee5d8;color:#2b211b;font:600 15px/1.45 Arial,sans-serif;vertical-align:top;">${escapeHtml(item.product_name || "Wijn")}</td>
      </tr>`).join("");
    const detailRows = detailLines.map((line) => {
      const separator = line.indexOf(":");
      const hasLabel = separator > 0 && separator < 40;
      const label = hasLabel ? line.slice(0, separator).trim() : "";
      const value = hasLabel ? line.slice(separator + 1).trim() : line;
      return `
        <tr>
          <td style="padding:7px 0;color:#786b60;font:700 11px/1.4 Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;vertical-align:top;${label ? "width:112px;padding-right:14px;" : ""}">${escapeHtml(label)}</td>
          <td style="padding:7px 0;color:#342820;font:400 14px/1.5 Arial,sans-serif;vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`;
    }).join("");
    const phoneHref = customerPhone.replace(/[^+\d]/g, "");
    const html = `<!doctype html>
<html lang="nl">
  <body style="margin:0;padding:0;background:#f3eee7;color:#2b211b;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Nieuwe reservering van ${escapeHtml(customerName)} – ${escapeHtml(orderNumber)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3eee7;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fffdf9;border:1px solid #e6dbcc;border-radius:14px;overflow:hidden;border-collapse:separate;box-shadow:0 12px 35px rgba(48,31,20,.08);">
            <tr>
              <td style="height:5px;background:#7a102d;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 30px;background:#130d09;border-bottom:1px solid #33231a;">
                <div style="color:#d8ad68;font:700 11px Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;">Taste of Life</div>
                <div style="margin-top:7px;color:#fff8ec;font:400 30px/1.15 Georgia,serif;">De Wijnkast</div>
                <div style="margin-top:17px;color:#cfc2b4;font:400 14px/1.5 Arial,sans-serif;">Nieuwe reservering ontvangen</div>
              </td>
            </tr>
            <tr>
              <td style="padding:25px 30px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:0 12px 0 0;color:#7c6c60;font:700 11px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;">Ordernummer</td>
                    <td align="right"><span style="display:inline-block;padding:7px 10px;background:#f4eadb;border-radius:6px;color:#6b1028;font:700 13px Arial,sans-serif;">${escapeHtml(orderNumber)}</span></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 30px 23px;">
                <div style="padding-bottom:9px;border-bottom:1px solid #e8ddd0;color:#9a7845;font:700 11px Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase;">Klant</div>
                <div style="padding-top:15px;color:#251a14;font:600 21px/1.35 Georgia,serif;">${escapeHtml(customerName)}</div>
                <div style="margin-top:8px;font:400 14px/1.7 Arial,sans-serif;">
                  <a href="tel:${escapeHtml(phoneHref)}" style="color:#7a102d;text-decoration:none;">${escapeHtml(customerPhone)}</a>
                  ${customerEmail ? `<br><a href="mailto:${escapeHtml(customerEmail)}" style="color:#7a102d;text-decoration:none;">${escapeHtml(customerEmail)}</a>` : ""}
                </div>
                <div style="margin-top:13px;padding:10px 12px;background:#f8f3eb;border-left:3px solid #d8ad68;color:#4d4036;font:600 13px/1.45 Arial,sans-serif;">${escapeHtml(delivery)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 30px 24px;">
                <div style="padding-bottom:8px;border-bottom:1px solid #e8ddd0;color:#9a7845;font:700 11px Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase;">Gereserveerde wijnen</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${itemRows}</table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;border-collapse:collapse;">
                  <tr>
                    <td style="color:#5f5147;font:700 13px Arial,sans-serif;">Totaal</td>
                    <td align="right" style="color:#7a102d;font:400 28px Georgia,serif;">${escapeHtml(total)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            ${detailRows ? `<tr><td style="padding:0 30px 24px;"><div style="padding-bottom:8px;border-bottom:1px solid #e8ddd0;color:#9a7845;font:700 11px Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase;">Gegevens en opmerking</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;border-collapse:collapse;">${detailRows}</table></td></tr>` : ""}
            <tr>
              <td style="padding:0 30px 30px;">
                <a href="https://de-wijnkast-v2.pages.dev/beheer" style="display:block;padding:14px 18px;background:#7a102d;border:1px solid #7a102d;border-radius:7px;color:#fff8ec;font:700 12px Arial,sans-serif;letter-spacing:.08em;text-align:center;text-decoration:none;text-transform:uppercase;">Open De Wijnkast Beheer</a>
              </td>
            </tr>
            <tr>
              <td style="padding:17px 30px;background:#f7f1e8;border-top:1px solid #e8ddd0;color:#8a7d72;font:400 10px/1.5 Arial,sans-serif;text-align:center;">Technische referentie: ${escapeHtml(requestId)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

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
        from: env.RESEND_FROM || "De Wijnkast van Taste of Life <onboarding@resend.dev>",
        to: [String(env.NOTIFICATION_EMAIL).trim().toLowerCase()],
        subject: `Nieuwe reservering van ${customerName}`,
        text,
        html
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

function customerConfirmationConfigured(env, customer) {
  const customerEmail = String(customer?.email || "").trim();
  const sender = String(env?.RESEND_FROM || "").trim();
  const senderAddress = (sender.match(/<([^<>]+)>/)?.[1] || sender).trim();
  return Boolean(
    env?.RESEND_API_KEY
    && EMAIL_PATTERN.test(customerEmail)
    && EMAIL_PATTERN.test(senderAddress)
    && !/@(?:[a-z0-9-]+[.])*resend[.]dev$/i.test(senderAddress)
  );
}

async function sendCustomerConfirmationEmail({ env, customer, items, result, requestId }) {
  if (!customerConfirmationConfigured(env, customer)) return;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutFromEnv(env.RESERVATION_EMAIL_TIMEOUT_MS, EMAIL_TIMEOUT_MS)
  );
  try {
    const orderNumber = String(result?.order_number || "").trim();
    const customerName = String(customer.name || "").trim();
    const customerEmail = String(customer.email || "").trim().toLowerCase();
    const delivery = customer.delivery === "shipping"
      ? "Verzenden – we stemmen de bezorging persoonlijk met je af"
      : "Ophalen bij Taste of Life";
    const total = `€ ${(Number(result?.total_cents || 0) / 100).toFixed(2).replace(".", ",")}`;
    const itemLines = items.map((item) => `${Number(item.quantity)} × ${item.product_name || "Wijn"}`);
    const text = [
      "DE WIJNKAST VAN TASTE OF LIFE",
      "Je reservering is bevestigd",
      `Reserveringsnummer: ${orderNumber}`,
      "",
      `Beste ${customerName},`,
      "",
      "De onderstaande flessen zijn voor je gereserveerd.",
      ...itemLines,
      "",
      `Totaal: ${total}`,
      `Ontvangst: ${delivery}`,
      "",
      "Bij ophalen of bezorgen controleren we 18+ met een geldig identiteitsbewijs.",
      "We nemen persoonlijk contact met je op over het vervolg.",
      "",
      "Vragen? WhatsApp Patrick via https://wa.me/31649017365",
      "De Wijnkast: https://de-wijnkast-v2.pages.dev/"
    ].join("\n");
    const itemRows = items.map((item) => `
      <tr>
        <td style="padding:13px 12px 13px 0;border-bottom:1px solid #eee5d8;color:#7c6c60;font:700 13px Arial,sans-serif;white-space:nowrap;vertical-align:top;">${escapeHtml(Number(item.quantity))} ×</td>
        <td style="padding:13px 0;border-bottom:1px solid #eee5d8;color:#2b211b;font:600 15px/1.45 Arial,sans-serif;vertical-align:top;">${escapeHtml(item.product_name || "Wijn")}</td>
      </tr>`).join("");
    const html = `<!doctype html>
<html lang="nl">
  <body style="margin:0;padding:0;background:#f3eee7;color:#2b211b;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Je flessen zijn gereserveerd – ${escapeHtml(orderNumber)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3eee7;border-collapse:collapse;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fffdf9;border:1px solid #e6dbcc;border-radius:14px;overflow:hidden;border-collapse:separate;box-shadow:0 12px 35px rgba(48,31,20,.08);">
          <tr><td style="height:5px;background:#7a102d;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:28px 30px;background:#130d09;border-bottom:1px solid #33231a;">
            <div style="color:#d8ad68;font:700 11px Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;">Taste of Life</div>
            <div style="margin-top:7px;color:#fff8ec;font:400 30px/1.15 Georgia,serif;">De Wijnkast</div>
            <div style="margin-top:17px;color:#cfc2b4;font:400 14px/1.5 Arial,sans-serif;">Je flessen zijn gereserveerd</div>
          </td></tr>
          <tr><td style="padding:26px 30px 18px;">
            <div style="color:#251a14;font:400 23px/1.35 Georgia,serif;">Beste ${escapeHtml(customerName)},</div>
            <p style="margin:11px 0 0;color:#66584d;font:400 14px/1.65 Arial,sans-serif;">Dank je wel. De onderstaande flessen staan voor je gereserveerd.</p>
          </td></tr>
          <tr><td style="padding:0 30px 22px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr><td style="padding:11px 12px;background:#f4eadb;color:#6b1028;font:700 11px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;">Reserveringsnummer</td><td align="right" style="padding:11px 12px;background:#f4eadb;color:#342820;font:700 13px Arial,sans-serif;">${escapeHtml(orderNumber)}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:0 30px 24px;">
            <div style="padding-bottom:8px;border-bottom:1px solid #e8ddd0;color:#9a7845;font:700 11px Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase;">Gereserveerde wijnen</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${itemRows}</table>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;border-collapse:collapse;"><tr><td style="color:#5f5147;font:700 13px Arial,sans-serif;">Totaal</td><td align="right" style="color:#7a102d;font:400 28px Georgia,serif;">${escapeHtml(total)}</td></tr></table>
          </td></tr>
          <tr><td style="padding:0 30px 24px;">
            <div style="padding:12px 14px;background:#f8f3eb;border-left:3px solid #d8ad68;color:#4d4036;font:600 13px/1.55 Arial,sans-serif;">${escapeHtml(delivery)}</div>
            <p style="margin:13px 0 0;color:#786b60;font:400 12px/1.6 Arial,sans-serif;">Bij ophalen of bezorgen controleren we 18+ met een geldig identiteitsbewijs. We nemen persoonlijk contact met je op over het vervolg.</p>
          </td></tr>
          <tr><td style="padding:0 30px 30px;"><a href="https://wa.me/31649017365?text=Hallo%20Patrick%2C%20ik%20heb%20een%20vraag%20over%20reservering%20${encodeURIComponent(orderNumber)}" style="display:block;padding:14px 18px;background:#17382b;border:1px solid #b98543;border-radius:7px;color:#fff8ec;font:700 12px Arial,sans-serif;letter-spacing:.08em;text-align:center;text-decoration:none;text-transform:uppercase;">Vraag iets via WhatsApp</a></td></tr>
          <tr><td style="padding:17px 30px;background:#f7f1e8;border-top:1px solid #e8ddd0;color:#8a7d72;font:400 10px/1.5 Arial,sans-serif;text-align:center;">De Wijnkast van Taste of Life · Alleen voor 18 jaar en ouder</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "De-Wijnkast/2.0",
        "Idempotency-Key": `reservation-confirmation/${orderNumber}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: String(env.RESEND_FROM).trim(),
        to: [customerEmail],
        reply_to: String(env.NOTIFICATION_EMAIL || "patrick.tasteoflife@hotmail.com").trim().toLowerCase(),
        subject: `Je reservering ${orderNumber} is bevestigd`,
        text,
        html
      })
    });
    const responseBody = await response.text();
    if (!response.ok) {
      console.error("Klantbevestiging niet verzonden", response.status, responseBody, requestId);
      return;
    }
    console.log("Klantbevestiging aangeboden aan Resend", orderNumber, requestId);
  } catch (error) {
    console.error("Klantbevestiging mislukt op de achtergrond", error?.message || error, requestId);
  } finally {
    clearTimeout(timer);
  }
}

async function sendReservationEmails(args) {
  await sendReservationEmail(args);
  await sendCustomerConfirmationEmail(args);
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
      normalizeLineBreaks(customer.notes).trim(),
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
    const upstreamMessage = String(orderBody.message || orderBody.error || "").trim();
    const expectedRejection = orderResponse.status === 400 && EXPECTED_ORDER_ERRORS.has(upstreamMessage);
    return reply({
      error: expectedRejection
        ? upstreamMessage
        : "De reservering kon niet veilig worden verwerkt. Probeer niet opnieuw en neem contact op.",
      code: expectedRejection ? "ORDER_REJECTED" : "ORDER_BACKEND_ERROR"
    }, expectedRejection ? 400 : 502);
  }

  const result = Array.isArray(orderBody) ? orderBody[0] : orderBody;
  if (!result?.order_number) {
    return reply({ error: "De reservering is verwerkt, maar de bevestiging ontbreekt. Probeer niet opnieuw en neem contact op." }, 502);
  }
  const backgroundEmailAvailable = typeof context.waitUntil === "function";
  if (backgroundEmailAvailable) {
    context.waitUntil(sendReservationEmails({
      env,
      customer: customerForOrder,
      items: normalizedItems,
      result,
      requestId
    }));
  } else {
    console.warn("Geen achtergrondtaak beschikbaar voor reserveringsmail", requestId);
  }

  return reply(backgroundEmailAvailable && customerConfirmationConfigured(env, customerForOrder)
    ? { ...result, customer_confirmation: "queued" }
    : result);
}
