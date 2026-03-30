// public/sw.js
// ✅ VERSIÓN LIMPIA - Solo FCM, sin PWA cache mezclado

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCqQ_RcL_OZN6xGTeJbyDtCC3MYuQl4MK4",
  authDomain: "gastos-c0221.firebaseapp.com",
  projectId: "gastos-c0221",
  storageBucket: "gastos-c0221.firebasestorage.app",
  messagingSenderId: "189538372541",
  appId: "1:189538372541:web:2e424568e080901722e0d4",
});

const messaging = firebase.messaging();

// ─── BACKGROUND MESSAGES (App cerrada o minimizada) ─────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] 📩 Background message received');

  const data = payload.data || {};
  const title = data.title || 'Nueva notificación';
  const body = data.message || '';
  const url = data.url || '/';
  const type = data.type || 'info';

  const options = {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `notif-${Date.now()}`, // ✅ Tag único = no duplica
    renotify: true,
    requireInteraction: type === 'error' || type === 'warning',
    data: {
      url,
      title,
      message: body,
      type,
    },
  };

  console.log('[SW] ✅ Mostrada:', title);
  self.registration.showNotification(title, options);
});

// ─── CLIC EN NOTIFICACIÓN ────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const { url } = event.notification.data || { url: '/' };

  console.log('[SW] 🖱️  Notificación clickeada → ' + url);
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // Buscar ventana del mismo origin
        for (const client of clientList) {
          try {
            const clientOrigin = new URL(client.url).origin;
            const swOrigin = new URL(self.location.href).origin;

            if (clientOrigin === swOrigin && 'focus' in client) {
              client.focus();
              // Enviar mensaje para navegar
              client.postMessage({
                type: 'NAVIGATE',
                url,
              });
              return;
            }
          } catch (e) {
            console.error('[SW] Error validando URL:', e);
          }
        }

        // Si no hay ventana, abrir nueva
        return clients.openWindow(url);
      })
      .catch((err) => {
        console.error('[SW] Error en notificationclick:', err);
      })
  );
});

// ─── CIERRE DE NOTIFICACIÓN ─────────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] 🗑️  Notificación cerrada');
});

// ─── MENSAJES DESDE LA APP ──────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] ⏭️  Saltando waiting...');
    self.skipWaiting();
  }
});