const BUCKET = "wine-images";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 8000;
const STORAGE_UPLOAD_TIMEOUT_MS = 15000;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff"
  }
});

const trimSlash = (value) => String(value || "").replace(/\/$/, "");

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("UPSTREAM_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function serviceHeaders(serverKey, contentType = "application/json") {
  const headers = {
    apikey: serverKey,
    "Content-Type": contentType
  };

  // Nieuwe Supabase secret keys (sb_secret_...) zijn geen JWT en mogen niet
  // als Bearer-token worden verstuurd. De gateway herkent ze via `apikey` en
  // geeft de aanvraag serverrechten. De oude service_role-JWT blijft zo ook
  // ondersteund.
  if (!String(serverKey).startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${serverKey}`;
  }
  return headers;
}

function validImageSignature(bytes, type) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (type === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

async function requireAdmin(request, baseUrl, serviceRoleKey) {
  const authorization = String(request.headers.get("Authorization") || "");
  if (!/^Bearer\s+[^\s]+$/i.test(authorization)) return { status: 401 };

  const adminResponse = await fetchWithTimeout(`${baseUrl}/rest/v1/rpc/is_wijnkast_admin`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: authorization,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  if (adminResponse.status === 401) return { status: 401 };
  if (!adminResponse.ok) return { status: 502 };
  const isAdmin = await adminResponse.json().catch(() => false);
  return { status: isAdmin === true ? 200 : 403 };
}

async function storageError(response, fallbackCode) {
  const body = await response.json().catch(() => ({}));
  const code = String(body.code || body.error || fallbackCode || "STORAGE_ERROR").slice(0, 80);
  const error = new Error(code);
  error.storageCode = code;
  error.storageStatus = response.status;
  return error;
}

async function ensurePublicBucket(baseUrl, serverKey) {
  const existing = await fetchWithTimeout(`${baseUrl}/storage/v1/bucket/${BUCKET}`, {
    method: "GET",
    headers: serviceHeaders(serverKey)
  });
  if (existing.ok) return;
  if (existing.status !== 404) throw await storageError(existing, "BUCKET_CHECK_FAILED");

  const response = await fetchWithTimeout(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: serviceHeaders(serverKey),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: MAX_IMAGE_BYTES,
      allowed_mime_types: [...ALLOWED_TYPES.keys()]
    })
  });
  if (response.ok || response.status === 409) return;
  const body = await response.json().catch(() => ({}));
  const message = String(body.message || body.error || body.code || "").toLowerCase();
  if (response.status === 400 && /already exists|already_exist|duplicate/.test(message)) return;
  const error = new Error(String(body.code || body.error || "BUCKET_SETUP_FAILED").slice(0, 80));
  error.storageCode = String(body.code || body.error || "BUCKET_SETUP_FAILED").slice(0, 80);
  error.storageStatus = response.status;
  throw error;
}

export async function onRequestPost({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return reply({ error: "De foto-opslag is nog niet ingesteld." }, 503);
  }
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_IMAGE_BYTES + 512_000) {
    return reply({ error: "De foto is te groot. Kies een andere foto." }, 413);
  }

  const baseUrl = trimSlash(env.SUPABASE_URL);
  let admin;
  try {
    admin = await requireAdmin(request, baseUrl, env.SUPABASE_SERVICE_ROLE_KEY);
  } catch (error) {
    if (error?.message === "UPSTREAM_TIMEOUT") {
      return reply({ error: "De foto-opslag reageert te langzaam. Probeer het opnieuw." }, 504);
    }
    return reply({ error: "De beheersessie kon niet worden gecontroleerd." }, 502);
  }
  if (admin.status === 401) return reply({ error: "Log opnieuw in om een foto toe te voegen." }, 401);
  if (admin.status === 403) return reply({ error: "Alleen de beheerder kan wijnfoto's toevoegen." }, 403);
  if (admin.status !== 200) return reply({ error: "De beheerrechten konden niet worden gecontroleerd." }, 502);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return reply({ error: "De foto kon niet worden gelezen." }, 400);
  }
  const image = formData.get("image");
  if (!image || typeof image.arrayBuffer !== "function") {
    return reply({ error: "Kies eerst een foto." }, 400);
  }
  const type = String(image.type || "").toLowerCase();
  const extension = ALLOWED_TYPES.get(type);
  if (!extension) return reply({ error: "Gebruik een JPG-, PNG- of WebP-foto." }, 415);
  if (!Number.isFinite(image.size) || image.size < 12 || image.size > MAX_IMAGE_BYTES) {
    return reply({ error: "De foto is leeg of te groot." }, 413);
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!validImageSignature(bytes.subarray(0, 16), type)) {
    return reply({ error: "Dit bestand is geen geldige foto." }, 415);
  }

  const date = new Date().toISOString().slice(0, 10);
  const objectPath = `products/${date}/${crypto.randomUUID()}.${extension}`;
  try {
    await ensurePublicBucket(baseUrl, env.SUPABASE_SERVICE_ROLE_KEY);
    const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
    const uploadResponse = await fetchWithTimeout(`${baseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`, {
      method: "POST",
      headers: {
        ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY, type),
        "x-upsert": "false",
        "Cache-Control": "max-age=31536000"
      },
      body: bytes
    }, STORAGE_UPLOAD_TIMEOUT_MS);
    if (!uploadResponse.ok) throw await storageError(uploadResponse, "UPLOAD_FAILED");
    return reply({
      image_url: `${baseUrl}/storage/v1/object/public/${BUCKET}/${encodedPath}`
    }, 201);
  } catch (error) {
    if (error?.message === "UPSTREAM_TIMEOUT") {
      return reply({ error: "De foto-opslag reageert te langzaam. Probeer het opnieuw." }, 504);
    }
    console.error("Wijnfoto-opslag mislukt", {
      status: Number(error?.storageStatus || 0),
      code: String(error?.storageCode || error?.message || "STORAGE_ERROR").slice(0, 80)
    });
    if ([401, 403].includes(Number(error?.storageStatus))) {
      return reply({
        error: "De beveiligde foto-opslag heeft geen toegang. Ververs Beheer en probeer het nog één keer.",
        code: "STORAGE_AUTH_FAILED"
      }, 502);
    }
    return reply({
      error: "De foto kon niet veilig worden opgeslagen. Probeer het opnieuw.",
      code: "STORAGE_UPLOAD_FAILED"
    }, 502);
  }
}
