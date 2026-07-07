// Китобхона Service Worker – v4 unified (cache + FCM)
const CACHE_NAME = 'kitobkhona-v4';
const LOCAL_FILES = [
  './',
  './index.html',
  './kitobho.html',
  './reader.html',
  './profile.html',
  './login.html',
  './admin.html',
  './winners.html',
  './chats.html',
  './chat.html',
  './honandagon.html',
  './config.js',
  './cache.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(LOCAL_FILES).catch((err) => {
        console.warn('[SW] Failed to cache some files:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Пропускаем API-запросы (Railway / Supabase / GitHub) — кэшируются отдельно
  if (url.origin !== self.location.origin) {
    return;
  }

  // JS и CSS — сначала сеть, потом кэш
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // HTML — сначала кэш, потом сеть
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// ==================== Firebase Cloud Messaging ====================
try {
  importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

  const firebaseConfig = {
    apiKey: "AIzaSyDWmg_6KS_v82IK7P-QrLj8GP2dh5tk29Y",
    authDomain: "kitobkhona-push.firebaseapp.com",
    projectId: "kitobkhona-push",
    storageBucket: "kitobkhona-push.firebasestorage.app",
    messagingSenderId: "507779702083",
    appId: "1:507779702083:web:3dbd554961b290e854e3f6",
    measurementId: "G-2G9G2SXCTQ"
  };

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // FCM background messages
  messaging.onBackgroundMessage(function(payload) {
    try {
      const notif = payload.notification || {};
      const title = notif.title || 'Китобхона';
      const options = {
        body: notif.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: payload.data || {},
        vibrate: [200, 100, 200]
      };
      self.registration.showNotification(title, options);
    } catch (e) {
      console.error('FCM background message error', e);
    }
  });
} catch (e) {
  console.warn('[SW] Firebase init skipped:', e.message);
}

// Generic push fallback (Web Push)
self.addEventListener('push', function(event) {
  try {
    let data = {};
    if (event.data) {
      try { data = event.data.json(); } catch (err) { data = { body: event.data.text() }; }
    }
    const title = (data.notification && data.notification.title) || data.title || 'Китобхона';
    const body = (data.notification && data.notification.body) || data.body || '';
    // уже обработано FCM?
    event.waitUntil(
      self.registration.getNotifications().then(existing => {
        // просто показываем, дедупликацию делает браузер
        return self.registration.showNotification(title, {
          body,
          icon: data.icon || '/icon-192.png',
          badge: '/icon-192.png',
          data: data.data || data,
          vibrate: [200, 100, 200]
        });
      })
    );
  } catch (e) {
    console.error('Push event error', e);
  }
});

// Notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || data.link || data.click_action || '/kitobkhona/';
  const fullUrl = url.startsWith('/') ? self.location.origin + url : url;
  
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url.includes(url) && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(fullUrl);
  }));
});
