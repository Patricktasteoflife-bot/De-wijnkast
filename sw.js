const CACHE = "taste-of-life-wijnkast-v5-6-eerste-wijn";
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
  "/caroline-morey-chassagne-montrachet-chambrees-2023.svg"
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
