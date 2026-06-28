// ============================================================
// КОНФИГУРАЦИЯ КИТОБХОНА – ПОЛНАЯ ВЕРСИЯ (с блокировкой устройства)
// ============================================================

const KITOB_CONFIG = {
  NEON_API_BASE: 'https://kitobkhona-chat-production.up.railway.app',
  SUPABASE_REST: 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2R6ZnFvb3ByeHl0bGVwYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDI2MjIwMDAsImV4cCI6MTk4NzAyMDAwMH0.4SGNBUBjpgD8xLDG6x0jrJNKV-0Z5QQQaZkQhF5qzDA'
};

function fetchWithTimeout(url, options, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Сервер не ответил (' + (timeoutMs/1000) + 'с)')), timeoutMs))
  ]);
}

function getDeviceFingerprint() {
  let fp = localStorage.getItem('kk_device_fp');
  if (fp) return fp;
  const seed = [navigator.userAgent || '', navigator.language || '', screen.width + 'x' + screen.height, new Date().getTimezoneOffset(), 'kitobkhona-' + Math.random().toString(36).slice(2, 10)].join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash |= 0; }
  fp = Math.abs(hash).toString(36);
  localStorage.setItem('kk_device_fp', fp);
  return fp;
}

// ================================================================
// ============ ФУНКЦИИ ДЛЯ РАБОТЫ С ФАЙЛАМИ (без изменений) ============
// ================================================================

function isAndroid() {
  try {
    return !!(window.KitobAndroid && (KitobAndroid.isAndroidApp === true || (typeof KitobAndroid.isAndroidApp === 'function' && KitobAndroid.isAndroidApp())));
  } catch(e) { return false; }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function shareFile(url, name) {
  try {
    let blob = null;
    if ('caches' in window) {
      const cache = await caches.open('kitobkhona-pdf-cache-v1');
      const hit = await cache.match(url);
      if (hit) blob = await hit.blob();
    }
    if (!blob) {
      const toastEl = document.getElementById('toast');
      if (toastEl) { toastEl.textContent = 'Омодасозии китоб...'; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 3000); }
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      blob = await r.blob();
      try {
        const cache = await caches.open('kitobkhona-pdf-cache-v1');
        await cache.put(url, new Response(blob.clone(), { headers: { 'Content-Type': 'application/pdf' } }));
      } catch(e) {}
    }
    const fileName = (name || 'kitob') + '.pdf';
    if (isAndroid() && typeof KitobAndroid.shareFile === 'function') {
      const b64 = await blobToBase64(blob);
      KitobAndroid.shareFile(b64, fileName, 'application/pdf');
      return;
    }
    if (navigator.canShare && navigator.share) {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: name, files: [file] });
        return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 5000);
    const toastEl = document.getElementById('toast');
    if (toastEl) { toastEl.textContent = 'Файл боргирӣ шуд'; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 3000); }
  } catch(e) {
    if (e.name !== 'AbortError') {
      const toastEl = document.getElementById('toast');
      if (toastEl) { toastEl.textContent = 'Мубодила нашуд: ' + e.message; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 3000); }
    }
  }
}

async function downloadFile(url, name, showProgress = true) {
  try {
    const toastEl = document.getElementById('toast');
    if (toastEl && showProgress) {
      toastEl.textContent = 'Ҳифз шуда истодааст... 0%';
      toastEl.classList.add('show');
    }
    let blob = null;
    let fromCache = false;
    if ('caches' in window) {
      const cache = await caches.open('kitobkhona-pdf-cache-v1');
      const hit = await cache.match(url);
      if (hit) {
        blob = await hit.blob();
        fromCache = true;
        if (toastEl && showProgress) {
          toastEl.textContent = '✓ Аз ҳифзшуда гирифта шуд';
          setTimeout(() => toastEl.classList.remove('show'), 1500);
        }
      }
    }
    if (!blob) {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const contentLength = r.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength) : 0;
      const reader = r.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total && toastEl && showProgress) {
          const pct = Math.round((loaded / total) * 100);
          toastEl.textContent = `Ҳифз шуда истодааст... ${pct}%`;
        }
      }
      blob = new Blob(chunks, { type: 'application/pdf' });
      try {
        const cache = await caches.open('kitobkhona-pdf-cache-v1');
        await cache.put(url, new Response(blob.clone(), { headers: { 'Content-Type': 'application/pdf' } }));
      } catch(e) {}
      const m = JSON.parse(localStorage.getItem('kk_cached_books') || '{}');
      m[url] = { url, name, cover: '', ts: Date.now(), size: blob.size };
      localStorage.setItem('kk_cached_books', JSON.stringify(m));
    }
    const fileName = (name || 'kitob') + '.pdf';
    if (isAndroid() && typeof KitobAndroid.saveFile === 'function') {
      const b64 = await blobToBase64(blob);
      KitobAndroid.saveFile(b64, fileName, 'application/pdf');
      if (toastEl) {
        toastEl.textContent = '✓ Файл барои захира кардан омода';
        setTimeout(() => toastEl.classList.remove('show'), 2000);
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 5000);
    if (toastEl) {
      toastEl.textContent = '✓ Китоб боргирӣ шуд';
      setTimeout(() => toastEl.classList.remove('show'), 2000);
    }
  } catch(e) {
    const toastEl = document.getElementById('toast');
    if (toastEl) {
      toastEl.textContent = 'Хатогӣ: ' + e.message;
      toastEl.classList.add('show');
      setTimeout(() => toastEl.classList.remove('show'), 3000);
    }
    console.error('Download error:', e);
  }
}

// ================================================================
// ============ АВТОВХОД И УПРАВЛЕНИЕ АККАУНТОМ (ИСПРАВЛЕН) ============
// ================================================================
const AutoLogin = {
  currentUser: null,
  autoLogin: async function(showChoice) {
    if (localStorage.getItem('kk_device_blocked') === 'true') throw new Error('Устройство заблокировано. Создание гостя невозможно.');
    const savedToken = localStorage.getItem('kk_token');
    const savedUserId = localStorage.getItem('kk_user_id');
    const savedUsername = localStorage.getItem('kk_username');
    // Если есть сохранённый токен – пробуем восстановить
    if (savedToken && savedUserId) {
      try {
        const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + savedUserId, { headers: { 'Authorization': 'Bearer ' + savedToken } }, 5000);
        if (r.ok) {
          const profile = await r.json();
          if (profile.blocked === true) { localStorage.setItem('kk_device_blocked', 'true'); throw new Error('Ваш аккаунт заблокирован'); }
          this.currentUser = { token: savedToken, userId: savedUserId, username: savedUsername || 'user' };
          return this.currentUser;
        }
        // Если токен недействителен – удаляем
        localStorage.removeItem('kk_token'); localStorage.removeItem('kk_user_id'); localStorage.removeItem('kk_username');
        localStorage.removeItem('kk_guest_password');
      } catch (e) {
        // Если ошибка сети, пробуем использовать старый токен
        this.currentUser = { token: savedToken, userId: savedUserId, username: savedUsername || 'user' };
        return this.currentUser;
      }
    }
    // Если нужно показать выбор – возвращаем null
    if (showChoice === true) return null;

    // Гостевой вход
    try {
      const fp = getDeviceFingerprint();
      // Генерируем стабильный username и password на основе fingerprint
      const username = 'guest_' + fp.slice(0, 8);
      let password = localStorage.getItem('kk_guest_password');
      if (!password) {
        password = 'guest_' + fp + '_fixed_salt'; // постоянный пароль
        localStorage.setItem('kk_guest_password', password);
      }
      const email = username + '@guest.kitobkhona.tj';

      // Пытаемся зарегистрироваться
      const response = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, display_name: 'Меҳмон', is_temporary: true })
      }, 8000);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        // Если пользователь уже существует – пробуем войти
        if (response.status === 409) {
          const loginResp = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          }, 8000);
          const loginData = await loginResp.json().catch(() => ({}));
          if (loginResp.ok && loginData.token) {
            // Проверяем блокировку
            const profileResp = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + loginData.userId, {
              headers: { 'Authorization': 'Bearer ' + loginData.token }
            }, 5000);
            if (profileResp.ok) {
              const profile = await profileResp.json();
              if (profile.blocked === true) { localStorage.setItem('kk_device_blocked', 'true'); throw new Error('Ваш аккаунт заблокирован'); }
            }
            localStorage.setItem('kk_token', loginData.token);
            localStorage.setItem('kk_user_id', loginData.userId);
            localStorage.setItem('kk_username', loginData.username);
            this.currentUser = { token: loginData.token, userId: loginData.userId, username: loginData.username };
            return this.currentUser;
          }
          throw new Error(loginData.error || 'Не удалось войти');
        }
        throw new Error(data.error || ('HTTP ' + response.status));
      }
      // Успешная регистрация
      localStorage.setItem('kk_token', data.token);
      localStorage.setItem('kk_user_id', data.userId);
      localStorage.setItem('kk_username', data.username);
      this.currentUser = { token: data.token, userId: data.userId, username: data.username };
      return this.currentUser;
    } catch (e) {
      console.error('[AutoLogin] Ошибка:', e);
      if (e.message.includes('заблокирован')) throw e;
      return null;
    }
  },
  loginWithCredentials: async function(username, password) {
    try {
      const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }, 8000);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (data.error && data.error.includes('заблокирован')) { localStorage.setItem('kk_device_blocked', 'true'); throw new Error('Ваш аккаунт заблокирован'); }
        throw new Error(data.error || 'Не удалось войти');
      }
      localStorage.removeItem('kk_device_blocked');
      localStorage.setItem('kk_token', data.token);
      localStorage.setItem('kk_user_id', data.userId);
      localStorage.setItem('kk_username', data.username);
      this.currentUser = { token: data.token, userId: data.userId, username: data.username };
      return this.currentUser;
    } catch (e) { console.error('[Login] Ошибка:', e); throw e; }
  },
  logout: function() {
    localStorage.removeItem('kk_token');
    localStorage.removeItem('kk_user_id');
    localStorage.removeItem('kk_username');
    localStorage.removeItem('kk_device_blocked');
    localStorage.removeItem('kk_guest_password');
    this.currentUser = null;
  }
};

// ================================================================
// ============ AUTH (обёртка) ============
// ================================================================
const AUTH = {
  getUser: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return { data: { user: null } };
    try {
      const profile = await NEON_API.getProfile(userId);
      return { data: { user: { id: userId, username: localStorage.getItem('kk_username') || profile.username || 'user', display_name: profile.display_name || profile.username || 'Китобхон', ...profile } } };
    } catch (e) {
      return { data: { user: { id: userId, username: localStorage.getItem('kk_username') || 'user', display_name: localStorage.getItem('kk_username') || 'Китобхон' } } };
    }
  },
  getProfileFromRailway: async function(userId) {
    try { return await NEON_API.getProfile(userId); } catch(e) { console.warn('getProfileFromRailway error:', e); return null; }
  },
  autoLogin: async function(showChoice) { return await AutoLogin.autoLogin(showChoice); },
  logout: function() { AutoLogin.logout(); }
};

// ================================================================
// ============ CHAT API (без изменений) ============
// ================================================================
const ChatAPI = {
  getFriends: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends', { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) throw new Error('Ошибка получения друзей: ' + r.status);
    const data = await r.json();
    return data.map(f => f.id);
  },
  getFriendRequests: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends/requests', { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) throw new Error('Ошибка получения заявок: ' + r.status);
    return await r.json();
  },
  acceptFriendRequestByUser: async function(fromUserId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends/accept', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_user: fromUserId })
    }, 8000);
    if (!r.ok) throw new Error('Ошибка при приёме заявки: ' + r.status);
    return await r.json();
  },
  declineFriendRequest: async function(requestId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends/requests/' + requestId, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
    }, 8000);
    if (!r.ok) throw new Error('Ошибка при отклонении заявки: ' + r.status);
    return await r.json();
  },
  getMessages: async function(user1, user2) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const url = KITOB_CONFIG.NEON_API_BASE + '/api/messages?user1=' + user1 + '&user2=' + user2;
    const r = await fetchWithTimeout(url, { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) throw new Error('Ошибка получения сообщений: ' + r.status);
    return await r.json();
  },
  sendMessage: async function(senderId, receiverId, text) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/messages', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiver_id: receiverId, text })
    }, 8000);
    if (!r.ok) throw new Error('Ошибка отправки сообщения: ' + r.status);
    return await r.json();
  },
  sendReport: async function(reporterId, reportedUserId, reason) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/reports', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reported_user_id: reportedUserId, reason })
    }, 8000);
    if (!r.ok) throw new Error('Ошибка отправки жалобы: ' + r.status);
    return await r.json();
  }
};

// ================================================================
// ============ NEON API ============
// ================================================================
const NEON_API = {
  getProfile: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + userId, { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } }, 8000);
    if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.error || ('Ошибка профиля: ' + r.status)); }
    return await r.json();
  },
  updateProfile: async function(profileData) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles', {
      method: 'PUT', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    }, 8000);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Ошибка сохранения: ' + r.status));
    return data;
  },
  getReadingSessions: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return [];
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/reading-sessions?user_id=' + userId, { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) return [];
    return await r.json();
  },
  getFavorites: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return [];
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/favorites?user_id=' + userId, { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) return [];
    return await r.json();
  },
  getUserAchievements: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return [];
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/user-achievements?user_id=' + userId, { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) return [];
    return await r.json();
  },
  checkResetEligibility: async function(identifier) {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/check-reset-eligibility', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier })
    }, 8000);
    return await r.json();
  },
  resetPassword: async function(identifier, newPassword) {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, newPassword })
    }, 8000);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Ошибка сброса: ' + r.status));
    return data;
  }
};

// ================================================================
// ============ SUPABASE API ============
// ================================================================
async function apiGet(table, opts) {
  opts = opts || {};
  const eq = opts.eq, order = opts.order, limit = opts.limit;
  let url = KITOB_CONFIG.SUPABASE_REST + '/' + table;
  const params = new URLSearchParams();
  if (eq) params.append(eq.column + '=eq.' + eq.value);
  if (order) params.append('order', order);
  if (limit) params.append('limit', limit);
  const fullUrl = params.toString() ? (url + '?' + params) : url;
  const r = await fetchWithTimeout(fullUrl, {
    headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Authorization': 'Bearer ' + KITOB_CONFIG.SUPABASE_KEY }
  }, 6000);
  if (!r.ok) throw new Error('Supabase ' + table + ': ' + r.status);
  return await r.json();
}

// ================================================================
// ============ НОВЫЕ ФУНКЦИИ ДЛЯ УВЕДОМЛЕНИЙ И ОБЪЯВЛЕНИЙ ============
// ================================================================

// Получить уведомления пользователя
async function getNotifications() {
  const token = localStorage.getItem('kk_token');
  if (!token) return [];
  try {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 5000);
    if (!r.ok) return [];
    return await r.json();
  } catch (e) {
    console.warn('getNotifications error:', e);
    return [];
  }
}

// Отметить уведомление как прочитанное
async function markNotificationRead(notificationId) {
  const token = localStorage.getItem('kk_token');
  if (!token) return;
  try {
    await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/notifications/' + notificationId + '/read', {
      method: 'PUT', headers: { 'Authorization': 'Bearer ' + token }
    }, 5000);
  } catch (e) {
    console.warn('markNotificationRead error:', e);
  }
}

// Получить активное объявление
async function getActiveAnnouncement() {
  try {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/announcements/active', {}, 4000);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn('getActiveAnnouncement error:', e);
    return null;
  }
}

// Получить цитаты из админки
async function getAdminQuotes() {
  try {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/admin/quotes', {}, 5000);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn('getAdminQuotes error:', e);
    return null;
  }
}

// ================================================================
// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
// ================================================================
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function el(id) { return document.getElementById(id); }
