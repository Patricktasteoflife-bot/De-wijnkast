const VERSION = "wijnkast-v6-1-play";
const CACHE = `taste-of-life-${VERSION}`;
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/config.js",
  "/catalogus.js",
  "/app.js",
  "/manifest.webmanifest",
  "/privacy.html",
  "/assets/taste-of-life-logo.jpg",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-maskable-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/wijnkelder-hero-v2.jpg",
  "/caroline-morey-chambrees-2023.png",
  "/caroline-morey-santenay-2024.png",
  "/dagueneau-pur-sang-2023.png",
  "/dagueneau-blanc-etc-2023.png",
  "/chateau-de-la-cree-meursault-les-tillets-2020.png",
  "/henri-prudhon-saint-aubin-le-ban-2024.png",
  "/knoll-ried-schuett-2024.png",
  "/les-forts-de-latour-2015.png",
  "/tortochot-charmes-chambertin-2013.png",
  "/les-horees-rose-bonheur-2023.png"
];
const STATIC_PATHS = new Set(ASSETS.map((path) => path === "/" ? "/index.html" : path));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "WIJNKAST_SW_VERSION") {
    event.source?.postMessage({ type: "WIJNKAST_SW_VERSION", version: VERSION });
  }
  if (event.data?.type === "WIJNKAST_SW_CLAIM") {
    event.waitUntil(self.clients.claim());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/beheer" || url.pathname === "/beheer.html" || url.pathname.startsWith("/beheer/") || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    if (url.pathname !== "/" && url.pathname !== "/index.html") return;
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  if (!STATIC_PATHS.has(url.pathname)) return;
  event.respondWith(networkFirst(request, url.pathname));
});

async function networkFirst(request, fallbackKey) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      try {
        const cache = await caches.open(CACHE);
        await cache.put(fallbackKey, response.clone());
      } catch {
        // Een volle cache mag een geslaagde netwerkresponse nooit vervangen.
      }
    }
    return response;
  } catch {
    return (await caches.match(fallbackKey)) || Response.error();
  }
}
