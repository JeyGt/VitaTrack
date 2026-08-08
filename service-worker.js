const CACHE_NAME = 'vitatrack-cache-v3';
const ASSETS = [
  './index.html',
  './data.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e=>{
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fetchPromise = fetch(e.request).then(networkRes=>{
        if(networkRes && networkRes.status===200){
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(c=>c.put(e.request, clone));
        }
        return networkRes;
      }).catch(()=>cached);
      return cached || fetchPromise;
    })
  );
});
