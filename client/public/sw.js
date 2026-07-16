// Minimal app-shell service worker. It deliberately never touches /api/* —
// the live quake feed and the shared world/ledger state must always hit the
// network, never a stale cache.
//
// Navigation requests (the HTML document itself) are network-first with a
// cache fallback, not stale-while-revalidate. Vite content-hashes the JS/CSS
// bundle filenames on every build, so the HTML is the only thing that
// actually needs to change between deployments; if the HTML were served
// stale-while-revalidate, a rebuilt app could sit invisible behind a cached
// index.html pointing at old asset hashes indefinitely; whoever's looking at
// it never even sees a fetch error, just an old version, for as long as the
// cache keeps winning the race against the background revalidation. Network
// -first for navigations means a real rebuild is visible on the very next
// load, and the cache only matters as a genuine offline fallback. The hashed
// static assets themselves stay cache-first, since a given hash is immutable
// content and safe to serve from cache without ever re-checking the network.
const CACHE_NAME = 'fault-line-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
