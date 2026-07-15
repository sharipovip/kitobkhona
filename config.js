// ═══════════════════════════════════════════════════════════════
// kitobkhona/config.js — ФИНАЛЬНАЯ КОНФИГУРАЦИЯ
// Все URL реальные, все сервисы подключены
// ═══════════════════════════════════════════════════════════════

const KITOB_CONFIG = {
  // ═══ СЕРВЕР #1: Auth + Profiles (Cloudflare Worker) ═══
  API_AUTH: 'https://kitobkhona-auth-worker.sinamostudio.workers.dev',

  // ══ СЕРВЕР #2: Chats + Posts (Render) ═══
  API_SOCIAL: 'https://kitobkhona-social.onrender.com',

  // ═══ СЕРВЕР #3: WebSocket (Render) ═══
  API_WS: 'wss://kitobkhona-chat.onrender.com',
  API_JOBS: 'https://kitobkhona-chat.onrender.com',

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

// ══ МАРШРУТИЗАЦИЯ API ═══
const API_ROUTES = {
  // Auth + Profiles → API_AUTH (Cloudflare)
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

  // Chats + Posts → API_SOCIAL (Render)
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

// ═══ ЭКСПОРТ ═══
window.KITOB_CONFIG = KITOB_CONFIG;
window.API_ROUTES = API_ROUTES;
window.getApiUrl = getApiUrl;

// ═══ ОБНОВЛЕНИЕ СТАРЫХ API ФУНКЦИЙ ═══
// Заменяем NEON_API_BASE на getApiUrl
// Это нужно чтобы старый код продолжал работать
Object.defineProperty(KITOB_CONFIG, 'NEON_API_BASE', {
  get() { return KITOB_CONFIG.API_AUTH; }
});
