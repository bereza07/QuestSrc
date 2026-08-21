// QuestForge service worker — offline app shell for the installed PWA.
// Runtime caching (no hardcoded hashed filenames): navigations are network-first
// with a cached index.html fallback; other same-origin GETs are
// stale-while-revalidate. Sync/API and cross-origin requests are never cached.

const CACHE = "qf-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const BYPASS = /^\/(data|auth|health|deepseek-proxy)\b/;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return; // don't touch the AI API etc.
  if (BYPASS.test(url.pathname)) return; // live sync endpoints

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone());
          return net;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(req)) || (await cache.match("/index.html")) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const fetching = fetch(req)
        .then((net) => {
          if (net && net.ok) cache.put(req, net.clone());
          return net;
        })
        .catch(() => cached);
      return cached || fetching;
    })(),
  );
});
