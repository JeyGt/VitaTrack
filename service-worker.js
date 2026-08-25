const CACHE_PREFIX = 'vitatrack-';
const CACHE_VERSION = 'v39';
const CORE_CACHE = `${CACHE_PREFIX}core-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;

// App shell required for a complete offline launch.
const CORE_ASSETS = [
  './',
  './index.html',
  './data.js',
  './sport-data.js',
  './sport-engine.js',
  './sport-ui.js',
  './app.js',
  './nutrition.js',
  './cloud-sync.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && ![CORE_CACHE, RUNTIME_CACHE].includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put('./index.html', response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    return (await caches.match(request)) ||
      (await caches.match('./index.html')) ||
      (await caches.match('./'));
  }
}

async function networkFirstAsset(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type !== 'opaque') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    return (await caches.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept external APIs/resources (OpenFoodFacts, Google Fonts,
  // Unsplash, Withings endpoints, etc.). Their own failures are handled by
  // the application and must not pollute the VitaTrack application cache.
  if (url.origin !== self.location.origin) return;

  // Account/Withings APIs contain private, user-specific responses and must
  // never be cached by the service worker.
  if (url.pathname.startsWith('/api/')) return;

  // HTML/navigation: prefer the newest version online, but keep a complete
  // offline fallback to the cached app shell.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Same-origin static files use the newest network version when online.
  // If the network is unavailable, fall back to the pre-cached/runtime copy.
  event.respondWith(networkFirstAsset(request));
});


self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || './index.html';
  event.waitUntil((async()=>{
    const all = await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of all){
      if('focus' in client){await client.focus();return;}
    }
    if(clients.openWindow)return clients.openWindow(target);
  })());
});
