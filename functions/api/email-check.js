const CHECK_TOKEN = "6ad07f71580fa1a4808aec1800c76873d1ce23c78de082a0";
const EXPIRES_AT = Date.parse("2026-07-17T09:54:00Z");

const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

export async function onRequestPost({ request, env }) {
  if (Date.now() > EXPIRES_AT || request.headers.get("X-Wijnkast-Check") !== CHECK_TOKEN) {
    return reply({ error: "Niet gevonden." }, 404);
  }
  if (!env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL) {
    return reply({ error: "Resend is niet volledig ingesteld." }, 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "De-Wijnkast/2.0",
        "Idempotency-Key": "deployment-email-check/71303ca-lowercase"
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: env.RESEND_FROM || "De Wijnkast <onboarding@resend.dev>",
        to: [String(env.NOTIFICATION_EMAIL).trim().toLowerCase()],
        subject: "De Wijnkast e-mailcontrole — geen reservering",
        text: "Dit is uitsluitend een technische e-mailcontrole. Er is geen bestelling geplaatst en er is geen voorraad aangepast."
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return reply({ error: body.message || body.name || "Resend weigerde de e-mail.", resend_status: response.status }, 502);
    }
    return reply({ ok: true, email_id: body.id || null });
  } catch (error) {
    return reply({ error: error?.name === "AbortError" ? "Resend-time-out." : "Resend niet bereikbaar." }, 504);
  } finally {
    clearTimeout(timer);
  }
}
