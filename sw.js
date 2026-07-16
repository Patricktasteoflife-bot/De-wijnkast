const CACHE = "taste-of-life-wijnkast-v5-7-volledige-selectie";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/config.js",
  "/catalogus.js",
  "/app.js",
  "/manifest.webmanifest",
  "/assets/taste-of-life-logo.jpg",
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

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
