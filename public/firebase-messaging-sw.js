// public/firebase-messaging-sw.js
// ✅ VERSIÓN OPTIMIZADA - Basada en la tuya, con mejoras

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

// ─── Maneja notificaciones en BACKGROUND ────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', {
    title: payload.data?.title,
    hasData: !!payload.data,
  });

  const data = payload.data || {};
  const title = data.title || 'Nueva notificación';
  const message = data.message || '';
  const type = data.type || 'info';
  const url = data.url || '/';
  const icon = data.icon || '/favicon.ico';
  const badge = data.badge || '/favicon.ico';

  // ✅ MEJORADO: Tag único para cada notificación (no deduplicar)
  const notificationTag = 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

  const options = {
    body: message,
    icon: icon,
    badge: badge,
    tag: notificationTag, // ✅ Cada notificación tiene tag único
    renotify: true, // ✅ Vibra/suena cada vez
    requireInteraction: type === 'error' || type === 'warning',
    data: {
      url: url,
      title: title,
      message: message,
      type: type,
      timestamp: Date.now(),
    },
  };

  console.log('[SW] Mostrando notificación:', { title, tag: notificationTag });
  return self.registration.showNotification(title, options);
});

// ─── Maneja clics en las notificaciones ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const { url } = event.notification.data || { url: '/' };
  
  console.log('[SW] Notificación clickeada, navegando a:', url);
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ 
        type: 'window',
        includeUncontrolled: true 
      })
      .then((clientList) => {
        // ✅ MEJORADO: Mejor búsqueda de client existente
        const sameOriginClients = clientList.filter((c) => {
          try {
            return new URL(c.url).origin === new URL(self.location.href).origin;
          } catch {
            return false;
          }
        });

        // Si hay una ventana del mismo origin, úsala
        for (const client of sameOriginClients) {
          if ('focus' in client) {
            client.focus();
            // ✅ MEJORADO: Usar postMessage en lugar de navigate
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              url: url,
            });
            return;
          }
        }

        // Si no hay ventana, abre una nueva
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
      .catch((err) => {
        console.error('[SW] Error en notificationclick:', err);
      })
  );
});

// ─── Maneja el cierre de notificaciones ────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notificación cerrada:', event.notification.tag);
});

// ─── Keep service worker alive ────────────────────────────────────────────
self.addEventListener('message', (event) => {
  console.log('[SW] Mensaje recibido:', event.data?.type);
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});