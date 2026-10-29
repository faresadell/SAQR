/* SAQR service worker.
 * Deliberately minimal and safe: it only serves an offline fallback page when a
 * navigation fails. It never caches API responses, HTML pages, or anything tied
 * to a signed-in user, so private data can never be served from a shared cache. */
const CACHE = "saqr-offline-v1";
const OFFLINE_ASSETS = ["/offline.html", "/offline.css", "/brand/saqr-mark.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
});
