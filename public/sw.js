const CACHE_NAME = 'gastoflow-v1';
const urlsToCache = [
  '/',
  '/login',
  '/tecnico',
  '/pagos',
  '/contabilidad',
  '/admin'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorar peticiones cross-origin (APIs externas, CDNs, etc.)
  if (url.origin !== location.origin) return;

  // Ignorar métodos que no sean GET
  if (event.request.method !== 'GET') return;

  // Ignorar rutas de API (ajusta el prefijo a tu proyecto)
  if (url.pathname.startsWith('/api/')) return;

  // Ignorar WebSockets y extensiones del navegador
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        // Opcional: retornar página offline si falla
        // return caches.match('/offline.html');
      });
    })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'GastoFlow';
  const options = {
    body: data.body || 'Nueva notificacion',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.primaryKey
    }
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
