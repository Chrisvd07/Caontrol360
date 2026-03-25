// public/firebase-messaging-sw.js

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

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background:', payload);

  const title = payload.data?.title || 'Nueva notificación';
  const body = payload.data?.message || '';
  const type = payload.data?.type || 'info';
  const url = payload.data?.url || '/';

  self.registration.showNotification(title, {
    body,
    icon: payload.data?.icon || '/favicon.ico',
    badge: payload.data?.badge || '/favicon.ico',
    tag: payload.data?.requestId || 'gasto-notification',
    renotify: true,
    requireInteraction: type === 'error' || type === 'warning',
    data: { url, ...payload.data },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});