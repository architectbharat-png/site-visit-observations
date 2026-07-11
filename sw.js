// Service worker for the ABS Site Visit & Observation Report PWA.
//
// Strategy:
//  - App shell (this HTML file, manifest, icons) + the two PDF libraries are
//    cached on install so the form still opens and can still generate PDFs
//    with no signal.
//  - Requests to the shared Firebase project list always go straight to the
//    network and are never cached, since that data needs to stay current.
//  - Everything else falls back to cache only if the network is unavailable.

const CACHE_NAME = 'abs-site-visit-v2';

const APP_SHELL = [
  './ABS_Site_Visit_Form.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        APP_SHELL.map(url =>
          cache.add(url).catch(err => {
            // Don't let one failed asset (e.g. offline during first install)
            // block the rest of the shell from being cached.
            console.warn('Service worker: could not cache', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never cache the shared project database — always go live so a project
  // added on another device shows up here too.
  if (url.includes('firebasedatabase.app')) {
    event.respondWith(fetch(event.request).catch(() => {
      // No network + no cache for this — let the app's own offline fallback
      // (cached project list in localStorage) handle it.
      return new Response(JSON.stringify(null), { headers: { 'Content-Type': 'application/json' } });
    }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);

      // Serve cached immediately if we have it (fast + works offline),
      // while still refreshing the cache in the background when online.
      return cached || networkFetch;
    })
  );
});
