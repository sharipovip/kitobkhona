// ═══════════════════════════════════════════════════════════════
// kitobkhona/config.js — ОБНОВЛЁННАЯ КОНФИГУРАЦИЯ ДЛЯ 500K
// 12 сервисов, 5 БД, глобальный кэш через Cloudflare
// ═══════════════════════════════════════════════════════════════

const KITOB_CONFIG = {
  // ═══ СЕРВЕР #1: Auth + Profiles (GCP Cloud Run) ═══
  API_AUTH: 'https://kitobkhona-auth-abc123.a.run.app',
  // Также можно использовать кастомный домен:
  // API_AUTH: 'https://api.kitobkhona.tj',

  // ═══ СЕРВЕР #2: Chats + Posts (GCP Cloud Run) ═══
  API_SOCIAL: 'https://kitobkhona-social-abc123.a.run.app',
  // Также можно использовать:
  // API_SOCIAL: 'https://chat.kitobkhona.tj',

  // ═══ СЕРВЕР #3: Social backup (Vercel) ═══
  API_SOCIAL_BACKUP: 'https://kitobkhona-social.vercel.app/api',
  // Также можно использовать:
  // API_SOCIAL_BACKUP: 'https://social.kitobkhona.tj',

  // ═══ СЕРВЕР #4: WebSocket + Jobs (Render) ═══
  API_WS: 'wss://kitobkhona-chat.onrender.com',
  API_JOBS: 'https://kitobkhona-chat.onrender.com',

  // ═══ Cloudflare Edge (кэш-слой) ═══
  API_EDGE: 'https://cache.kitobkhona.workers.dev',

  // ═══ Supabase (статика: книги, поиск) ═══
  SUPABASE_REST: 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2R6ZnFvb3ByeHl0bGVwYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDI5ODIsImV4cCI6MjA5NjQ3ODk4Mn0.4rV_7yN5Urx5WHgb9kAxWo_VmrPWGlbFYN4Ij7DcuyI',

  // ═══ Firebase (push-уведомления) ═══
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyDWmg_6KS_v82IK7P-QrLj8GP2dh5tk29Y",
    authDomain: "kitobkhona-push.firebaseapp.com",
    projectId: "kitobkhona-push",
    storageBucket: "kitobkhona-push.firebasestorage.app",
    messagingSenderId: "507779702083",
    appId: "1:507779702083:web:3dbd554961b290e854e3f6",
    measurementId: "G-2G9G2SXCTQ"
  },
  FIREBASE_VAPID: 'BNhCnlt0kKCnYpeBGqYGRHikPqXCkpkt3Fj5G7X2XDM8EV7qj3xLtDQa8PYh_Sp3g21CLCdz7GoBILxMjnBFUJM'
};

// ═══ МАРШРУТИЗАЦИЯ API ═══
// Какие эндпоинты на каком сервере
const API_ROUTES = {
  // Auth + Profiles → API_AUTH (GCP)
  auth: '/api/auth',
  profiles: '/api/profiles',
  avatar: '/api/avatar',
  reading_sessions: '/api/reading-sessions',
  favorites: '/api/favorites',
  notifications: '/api/notifications',
  announcements: '/api/announcements',
  push: '/api/push',
  admin: '/api/admin',
  winners: '/api/winners',
  popular_books: '/api/popular-books',
  dashboard_stats: '/api/admin/dashboard-stats',
  age_stats: '/api/admin/age-stats',
  feedbacks: '/api/feedbacks',
  support: '/api/support',

  // Chats + Posts → API_SOCIAL (GCP)
  messages: '/api/messages',
  friends: '/api/friends',
  posts: '/api/posts',
  book_reactions: '/api/book-reactions',
  book_stats: '/api/book-stats',
  reports: '/api/reports',
  typing: '/api/typing',
  block: '/api/users/block',
  chats: '/api/chats',
  daily_words: '/api/daily-words',
  chat_summary: '/api/chat-summary'
};

// ═══ ФУНКЦИЯ МАРШРУТИЗАЦИИ ═══
function getApiUrl(endpoint) {
  const path = '/' + endpoint.replace(/^\//, '');

  // Auth endpoints → API_AUTH
  const authPrefixes = ['/api/auth', '/api/profiles', '/api/avatar',
    '/api/reading-sessions', '/api/favorites', '/api/notifications',
    '/api/announcements', '/api/push', '/api/admin', '/api/winners',
    '/api/popular-books', '/api/feedbacks', '/api/support'];

  for (const prefix of authPrefixes) {
    if (path.startsWith(prefix)) return KITOB_CONFIG.API_AUTH + path;
  }

  // Social endpoints → API_SOCIAL
  const socialPrefixes = ['/api/messages', '/api/friends', '/api/posts',
    '/api/book-reactions', '/api/book-stats', '/api/reports',
    '/api/typing', '/api/users/block', '/api/chats', '/api/daily-words',
    '/api/chat-summary'];

  for (const prefix of socialPrefixes) {
    if (path.startsWith(prefix)) return KITOB_CONFIG.API_SOCIAL + path;
  }

  // Default → Auth
  return KITOB_CONFIG.API_AUTH + path;
}

// ═══ ФАЙЛОВОЕ КЭШИРОВАНИЕ (Client-Side Cache) ═══
const CLIENT_CACHE = {
  _store: new Map(),
  _maxSize: 200,

  get(key) {
    const item = this._store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return item.value;
  },

  set(key, value, ttlMs = 300000) { // 5 мин по умолчанию
    if (this._store.size >= this._maxSize) {
      // Удаляем самую старую запись
      const oldest = this._store.keys().next().value;
      this._store.delete(oldest);
    }
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now()
    });
  },

  invalidate(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  },

  clear() {
    this._store.clear();
  }
};

// ═══ SMART FETCH с кэшированием и retry ═══
async function smartFetch(endpoint, options = {}) {
  const url = getApiUrl(endpoint);
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${url}:${JSON.stringify(options.body || '')}`;

  // Кэш только для GET запросов
  if (method === 'GET') {
    const cached = CLIENT_CACHE.get(cacheKey);
    if (cached) return cached;
  }

  // Добавляем токен
  const token = localStorage.getItem('kk_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
    ...(options.headers || {})
  };

  // Retry логика
  const maxRetries = 2;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Кэшируем GET ответы
      if (method === 'GET') {
        // Разный TTL для разных типов данных
        let ttl = 300000; // 5 мин — по умолчанию
        if (endpoint.includes('/profiles/')) ttl = 600000; // 10 мин
        if (endpoint.includes('/announcements')) ttl = 120000; // 2 мин
        if (endpoint.includes('/winners')) ttl = 600000; // 10 мин
        if (endpoint.includes('/popular-books')) ttl = 600000; // 10 мин
        CLIENT_CACHE.set(cacheKey, { response, data, ok: true }, ttl);
      }

      return { response, data, ok: true };
    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError') {
        console.warn(`[smartFetch] Timeout: ${endpoint}, attempt ${attempt + 1}`);
      }
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Request failed');
}

// ═══ ЭКСПОРТ ═══
window.KITOB_CONFIG = KITOB_CONFIG;
window.API_ROUTES = API_ROUTES;
window.getApiUrl = getApiUrl;
window.CLIENT_CACHE = CLIENT_CACHE;
window.smartFetch = smartFetch;

// ═══ ОБНОВЛЕНИЕ СТАРЫХ API ФУНКЦИЙ ═══
// Заменяем NEON_API_BASE на getApiUrl
// Это нужно чтобы старый код продолжал работать
Object.defineProperty(KITOB_CONFIG, 'NEON_API_BASE', {
  get() { return KITOB_CONFIG.API_AUTH; }
});
