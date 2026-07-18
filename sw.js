const VERSION = "wijnkast-v6-3-afgerond";
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
  "/leeftijdscontrole.html",
  "/assets/taste-of-life-logo.jpg",
  "/assets/share-wijnkast.jpg",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-maskable-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/wijnkelder-hero-v2.jpg",
  "/caroline-morey-chambrees-2023.webp",
  "/caroline-morey-santenay-2024.webp",
  "/dagueneau-pur-sang-2023.webp",
  "/dagueneau-blanc-etc-2023.webp",
  "/chateau-de-la-cree-meursault-les-tillets-2020.webp",
  "/henri-prudhon-saint-aubin-le-ban-2024.webp",
  "/knoll-ried-schuett-2024.webp",
  "/les-forts-de-latour-2015.webp",
  "/tortochot-charmes-chambertin-2013.webp",
  "/les-horees-rose-bonheur-2023.webp"
];
const STATIC_PATHS = new Set(ASSETS.map((path) => path === "/" ? "/index.html" : path));
const PUBLIC_NAV_PATHS = new Set(["/", "/index.html", "/privacy.html", "/leeftijdscontrole.html"]);

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
    if (!PUBLIC_NAV_PATHS.has(url.pathname)) return;
    event.respondWith(networkFirst(request, url.pathname === "/" ? "/index.html" : url.pathname));
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
