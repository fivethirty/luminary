// Offline support for table play: after the first visit the calculator works
// with no signal. The app shell (a navigation to any URL — battle state lives
// in the query string) is served network-first with a cached fallback; hashed
// build assets are covered by a content-versioned precache, so they're served
// cache-first.
const CACHE_NAME = 'luminary-__PRECACHE_VERSION__';
const PRECACHE_URLS = [/* __PRECACHE_ASSETS__ */ '/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('luminary-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(request);
          if (fresh.ok) await cache.put('/', fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match('/');
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      if (fresh.ok) await cache.put(request, fresh.clone());
      return fresh;
    })()
  );
});
