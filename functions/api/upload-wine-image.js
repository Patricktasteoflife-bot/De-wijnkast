const BUCKET = "wine-images";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
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

function serviceHeaders(serviceRoleKey, contentType = "application/json") {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": contentType
  };
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

  const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: authorization
    }
  });
  if (!userResponse.ok) return { status: 401 };
  const user = await userResponse.json().catch(() => null);
  if (!user?.id) return { status: 401 };

  const adminResponse = await fetch(
    `${baseUrl}/rest/v1/admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!adminResponse.ok) return { status: 502 };
  const admins = await adminResponse.json().catch(() => []);
  return Array.isArray(admins) && admins.some((admin) => admin.user_id === user.id)
    ? { status: 200, user }
    : { status: 403 };
}

async function ensurePublicBucket(baseUrl, serviceRoleKey) {
  const response = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: serviceHeaders(serviceRoleKey),
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
  const message = String(body.message || body.error || "").toLowerCase();
  if (response.status === 400 && /already exists|duplicate/.test(message)) return;
  throw new Error("BUCKET_SETUP_FAILED");
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
  } catch {
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
    const uploadResponse = await fetch(`${baseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`, {
      method: "POST",
      headers: {
        ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY, type),
        "x-upsert": "false",
        "Cache-Control": "max-age=31536000"
      },
      body: bytes
    });
    if (!uploadResponse.ok) throw new Error("UPLOAD_FAILED");
    return reply({
      image_url: `${baseUrl}/storage/v1/object/public/${BUCKET}/${encodedPath}`
    }, 201);
  } catch {
    return reply({ error: "De foto kon niet veilig worden opgeslagen. Probeer het opnieuw." }, 502);
  }
}

