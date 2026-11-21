// Keeps the map usable with no signal: the page and data come from the network when it answers and
// from the cache when it doesn't. Built files in assets/ have content-hashed names, so the cache is
// final for them. Tiles, pins and screenshots can be replaced under the same name, so they show from
// the cache at once and are refreshed in the background for next time. Only what you have already opened is cached, so a
// tile you never zoomed to stays blank offline.
// ponytail: the cache only grows (old built files, every tile viewed, at most ~75 MB for the whole
// site); add an expiry pass if that ever matters.

const CACHE = `map:${self.registration.scope}`; // PR previews live under the same origin; keep them apart
const FRESH_FIRST = /\/(data\/[^/]+\.json)?$|\.html$/; // the page itself and the data it loads

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add("./")));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("/sw.js")) return;
  const p = url.pathname;
  e.respondWith(
    FRESH_FIRST.test(p) ? networkFirst(e.request) : p.includes("/assets/") ? cacheFirst(e.request) : staleWhileRevalidate(e),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    // Any ?view=, ?id= or ?district= link opens the cached page.
    const hit = (await cache.match(req, { ignoreSearch: true })) ?? (req.mode === "navigate" && (await cache.match("./")));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

function staleWhileRevalidate(e) {
  const refresh = caches.open(CACHE).then(async (cache) => {
    const res = await fetch(e.request);
    if (res.ok) await cache.put(e.request, res.clone());
    return res;
  });
  e.waitUntil(refresh.catch(() => {})); // offline: keep the cached copy
  return caches.match(e.request, { cacheName: CACHE }).then((hit) => hit ?? refresh);
}
