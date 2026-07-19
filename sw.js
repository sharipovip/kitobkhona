const CACHE_NAME = 'kitobkhona-v61-admin-photo-unlock';
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
  './Lenta.html',
  './config.js',
  './cache.js',
  './quotes-data.js',
  './splash_logo.jpg',
  './manifest.json',
  './search-index.json',
  './locations.js',
  './data/tajikistan_locations_full.json',
  './offline.html',
  './privacy-policy.html',
  './terms.html',
  './delete-account.html',
  './favicon.ico',
  './icon-192.png',
  './icon-512.png'
];

const BOOKS_JSON_URL = 'books.json';
const SYNC_INTERVAL = 60 * 60 * 1000; // 1 час

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
        keys.filter((k) => k !== CACHE_NAME && k !== 'kitobkhona-pdf-cache-v1').map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
  scheduleBooksJsonUpdate();
});

async function updateBooksJson() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(BOOKS_JSON_URL, { cache: 'no-store' });
    if (response.ok) {
      await cache.put(BOOKS_JSON_URL, response.clone());
      console.log('[SW] books.json updated in cache');
      const clients = await self.clients.matchAll();
      clients.forEach(client => client.postMessage({ type: 'books_json_updated' }));
    }
  } catch (e) {
    console.warn('[SW] Failed to update books.json:', e);
  }
}

function scheduleBooksJsonUpdate() {
  setTimeout(updateBooksJson, 5 * 60 * 1000);
  setInterval(updateBooksJson, SYNC_INTERVAL);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => null);
      return cached || await network || await caches.match('./offline.html');
    })());
    return;
  }
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => null);
      return cached || await network;
    })());
    return;
  }
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


self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const data = event.notification.data || {};
  let url = '/kitobkhona/';
  if (data.type === 'chat' || data.chat_id || data.sender_id) {
    url = '/kitobkhona/chats.html';
  } else if (data.type === 'feed' || data.post_id) {
    url = '/kitobkhona/Lenta.html';
  } else if (data.link) {
    url = data.link;
  } else if (data.url) {
    url = data.url;
  }
  const fullUrl = url.startsWith('/') ? self.location.origin + url : url;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url.includes(url) && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(fullUrl);
  }));
});