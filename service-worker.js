const CACHE_NAME = 'sdi-accounting-v2-20260930';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/login.html',
  '/manifest.json',
  '/icon.svg'
];

// Install Event - Pre-cache static UI shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline UI shell...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Some static assets failed to pre-cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting legacy cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network-First for HTML/assets; Direct Network for live API calls
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // CRITICAL: Bypass cache completely for API endpoints, health checks, or non-GET requests (Rule 22)
  if (
    req.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_health') ||
    url.pathname.startsWith('/_api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('run.app')
  ) {
    return; // Direct network fetch for live data
  }

  // Network-First strategy with Cache Fallback for navigation and static assets
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(req);
        if (cachedResponse) {
          return cachedResponse;
        }
        if (req.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/login.html');
        }
      })
  );
});
