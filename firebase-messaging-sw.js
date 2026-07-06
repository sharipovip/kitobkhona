importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

// Firebase configuration (web app)
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

// Handle background messages when FCM delivers a message with a notification payload
messaging.onBackgroundMessage(function(payload) {
  try {
    const notif = payload.notification || {};
    const title = notif.title || 'Китобхона';
    const options = {
      body: notif.body || '',
      icon: '/assets/icons/icon-192.png',
      data: payload.data || {}
    };
    self.registration.showNotification(title, options);
  } catch (e) {
    console.error('FCM background message handling error', e);
  }
});

// Generic push event fallback (handles raw Web Push messages)
self.addEventListener('push', function(event) {
  try {
    let data = {};
    if (event.data) {
      try { data = event.data.json(); } catch (err) { data = { body: event.data.text() }; }
    }
    const title = (data.notification && data.notification.title) || data.title || 'Китобхона';
    const options = {
      body: (data.notification && data.notification.body) || data.body || '',
      icon: data.icon || '/assets/icons/icon-192.png',
      data: data
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('Push event error', e);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url === url && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
