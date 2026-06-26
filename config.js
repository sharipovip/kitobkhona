// ============================================================
// КОНФИГУРАЦИЯ КИТОБХОНА – ПОЛНАЯ ВЕРСИЯ (с блокировкой устройства)
// ============================================================

const KITOB_CONFIG = {
  NEON_API_BASE: 'https://kitobkhona-chat-production.up.railway.app',
  SUPABASE_REST: 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2R6ZnFvb3ByeHl0bGVwYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDI2MjIwMDAsImV4cCI6MTk4NzAyMDAwMH0.4SGNBUBjpgD8xLDG6x0jrJNKV-0Z5QQQaZkQhF5qzDA'
};

// ===== ТАЙМАУТ ДЛЯ ЗАПРОСОВ =====
function fetchWithTimeout(url, options, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Сервер не ответил (' + (timeoutMs/1000) + 'с)')), timeoutMs)
    )
  ]);
}

// ===== УНИКАЛЬНЫЙ ИДЕНТИФИКАТОР УСТРОЙСТВА =====
function getDeviceFingerprint() {
  let fp = localStorage.getItem('kk_device_fp');
  if (fp) return fp;
  const seed = [
    navigator.userAgent || '',
    navigator.language || '',
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    'kitobkhona-' + Math.random().toString(36).slice(2, 10)
  ].join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  fp = Math.abs(hash).toString(36);
  localStorage.setItem('kk_device_fp', fp);
  return fp;
}

// ================================================================
// ============ AUTH (АВТОРИЗАЦИЯ И ПРОФИЛИ) ============
// ================================================================
const AUTH = {
  // Получить данные текущего пользователя (аналог AutoLogin.currentUser, но с профилем)
  getUser: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) {
      return { data: { user: null } };
    }
    try {
      const profile = await NEON_API.getProfile(userId);
      return {
        data: {
          user: {
            id: userId,
            username: localStorage.getItem('kk_username') || profile.username || 'user',
            display_name: profile.display_name || profile.username || 'Китобхон',
            ...profile
          }
        }
      };
    } catch (e) {
      // Если не удалось получить профиль, возвращаем хотя бы базовые данные
      return {
        data: {
          user: {
            id: userId,
            username: localStorage.getItem('kk_username') || 'user',
            display_name: localStorage.getItem('kk_username') || 'Китобхон'
          }
        }
      };
    }
  },

  // Получить профиль другого пользователя по ID
  getProfileFromRailway: async function(userId) {
    try {
      return await NEON_API.getProfile(userId);
    } catch (e) {
      console.warn('getProfileFromRailway error:', e);
      return null;
    }
  },

  // Автовход (обёртка над AutoLogin.autoLogin)
  autoLogin: async function(showChoice) {
    return await AutoLogin.autoLogin(showChoice);
  },

  // Выход
  logout: function() {
    AutoLogin.logout();
  }
};

// ================================================================
// ============ CHAT API ============
// ================================================================
const ChatAPI = {
  // Получить список друзей (возвращает массив ID)
  getFriends: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/friends',
      { headers: { 'Authorization': 'Bearer ' + token } },
      8000
    );
    if (!r.ok) throw new Error('Ошибка получения друзей: ' + r.status);
    const data = await r.json();
    return data.map(f => f.id);
  },

  // Получить входящие заявки в друзья
  getFriendRequests: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/friends/requests',
      { headers: { 'Authorization': 'Bearer ' + token } },
      8000
    );
    if (!r.ok) throw new Error('Ошибка получения заявок: ' + r.status);
    return await r.json();
  },

  // Принять заявку по ID отправителя
  acceptFriendRequestByUser: async function(fromUserId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/friends/accept',
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_user: fromUserId })
      },
      8000
    );
    if (!r.ok) throw new Error('Ошибка при приёме заявки: ' + r.status);
    return await r.json();
  },

  // Отклонить заявку (удалить запись)
  declineFriendRequest: async function(requestId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/friends/requests/' + requestId,
      {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      },
      8000
    );
    if (!r.ok) throw new Error('Ошибка при отклонении заявки: ' + r.status);
    return await r.json();
  },

  // Получить историю сообщений между двумя пользователями
  getMessages: async function(user1, user2) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const url = KITOB_CONFIG.NEON_API_BASE + '/api/messages?user1=' + user1 + '&user2=' + user2;
    const r = await fetchWithTimeout(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 8000);
    if (!r.ok) throw new Error('Ошибка получения сообщений: ' + r.status);
    return await r.json();
  },

  // Отправить сообщение
  sendMessage: async function(senderId, receiverId, text) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/messages',
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: receiverId, text })
      },
      8000
    );
    if (!r.ok) throw new Error('Ошибка отправки сообщения: ' + r.status);
    return await r.json();
  },

  // Отправить жалобу на пользователя
  sendReport: async function(reporterId, reportedUserId, reason) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/reports',
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reported_user_id: reportedUserId, reason })
      },
      8000
    );
    if (!r.ok) throw new Error('Ошибка отправки жалобы: ' + r.status);
    return await r.json();
  }
};

// ================================================================
// ============ NEON API (основные методы) ============
// ================================================================
const NEON_API = {
  getProfile: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + userId,
      { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } },
      8000
    );
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || ('Ошибка профиля: ' + r.status));
    }
    return await r.json();
  },

  updateProfile: async function(profileData) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/profiles',
      {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      },
      8000
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Ошибка сохранения: ' + r.status));
    return data;
  },

  getReadingSessions: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return [];
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/reading-sessions?user_id=' + userId,
      { headers: { 'Authorization': 'Bearer ' + token } },
      8000
    );
    if (!r.ok) return [];
    return await r.json();
  },

  getFavorites: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return [];
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/favorites?user_id=' + userId,
      { headers: { 'Authorization': 'Bearer ' + token } },
      8000
    );
    if (!r.ok) return [];
    return await r.json();
  },

  getUserAchievements: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return [];
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/user-achievements?user_id=' + userId,
      { headers: { 'Authorization': 'Bearer ' + token } },
      8000
    );
    if (!r.ok) return [];
    return await r.json();
  },

  checkResetEligibility: async function(identifier) {
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/auth/check-reset-eligibility',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      },
      8000
    );
    return await r.json();
  },

  resetPassword: async function(identifier, newPassword) {
    const r = await fetchWithTimeout(
      KITOB_CONFIG.NEON_API_BASE + '/api/auth/reset-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, newPassword })
      },
      8000
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Ошибка сброса: ' + r.status));
    return data;
  }
};

// ================================================================
// ============ SUPABASE (для цитат, объявлений и т.п.) ============
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
    headers: {
      'apikey': KITOB_CONFIG.SUPABASE_KEY,
      'Authorization': 'Bearer ' + KITOB_CONFIG.SUPABASE_KEY
    }
  }, 6000);
  if (!r.ok) throw new Error('Supabase ' + table + ': ' + r.status);
  return await r.json();
}

// ================================================================
// ============ AutoLogin (автоматический вход и гостевой режим) ============
// ================================================================
const AutoLogin = {
  currentUser: null,

  autoLogin: async function(showChoice) {
    if (localStorage.getItem('kk_device_blocked') === 'true') {
      throw new Error('Устройство заблокировано. Создание гостя невозможно.');
    }

    const savedToken = localStorage.getItem('kk_token');
    const savedUserId = localStorage.getItem('kk_user_id');
    const savedUsername = localStorage.getItem('kk_username');

    if (savedToken && savedUserId) {
      try {
        const r = await fetchWithTimeout(
          KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + savedUserId,
          { headers: { 'Authorization': 'Bearer ' + savedToken } },
          5000
        );
        if (r.ok) {
          const profile = await r.json();
          if (profile.blocked === true) {
            localStorage.setItem('kk_device_blocked', 'true');
            throw new Error('Ваш аккаунт заблокирован');
          }
          this.currentUser = {
            token: savedToken,
            userId: savedUserId,
            username: savedUsername || 'user'
          };
          return this.currentUser;
        }
        localStorage.removeItem('kk_token');
        localStorage.removeItem('kk_user_id');
        localStorage.removeItem('kk_username');
      } catch (e) {
        this.currentUser = {
          token: savedToken,
          userId: savedUserId,
          username: savedUsername || 'user'
        };
        return this.currentUser;
      }
    }

    if (showChoice === true) return null;

    try {
      const fp = getDeviceFingerprint();
      const username = 'guest_' + fp.slice(0, 8) + '_' + Date.now().toString(36).slice(-4);
      const password = 'guest_' + fp + '_' + Date.now().toString(36);
      const email = username + '@guest.kitobkhona.tj';

      const response = await fetchWithTimeout(
        KITOB_CONFIG.NEON_API_BASE + '/api/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            email,
            password,
            display_name: 'Меҳмон',
            is_temporary: true
          })
        },
        8000
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        if (response.status === 409) {
          const loginResp = await fetchWithTimeout(
            KITOB_CONFIG.NEON_API_BASE + '/api/auth/login',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
            },
            8000
          );
          const loginData = await loginResp.json().catch(() => ({}));
          if (loginResp.ok && loginData.token) {
            const profileResp = await fetchWithTimeout(
              KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + loginData.userId,
              { headers: { 'Authorization': 'Bearer ' + loginData.token } },
              5000
            );
            if (profileResp.ok) {
              const profile = await profileResp.json();
              if (profile.blocked === true) {
                localStorage.setItem('kk_device_blocked', 'true');
                throw new Error('Ваш аккаунт заблокирован');
              }
            }
            localStorage.setItem('kk_token', loginData.token);
            localStorage.setItem('kk_user_id', loginData.userId);
            localStorage.setItem('kk_username', loginData.username);
            this.currentUser = {
              token: loginData.token,
              userId: loginData.userId,
              username: loginData.username
            };
            return this.currentUser;
          }
          throw new Error(loginData.error || 'Не удалось войти');
        }
        throw new Error(data.error || ('HTTP ' + response.status));
      }

      localStorage.setItem('kk_token', data.token);
      localStorage.setItem('kk_user_id', data.userId);
      localStorage.setItem('kk_username', data.username);
      this.currentUser = {
        token: data.token,
        userId: data.userId,
        username: data.username
      };
      return this.currentUser;
    } catch (e) {
      console.error('[AutoLogin] Ошибка:', e);
      if (e.message.includes('заблокирован')) throw e;
      return null;
    }
  },

  loginWithCredentials: async function(username, password) {
    try {
      const r = await fetchWithTimeout(
        KITOB_CONFIG.NEON_API_BASE + '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        },
        8000
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (data.error && data.error.includes('заблокирован')) {
          localStorage.setItem('kk_device_blocked', 'true');
          throw new Error('Ваш аккаунт заблокирован');
        }
        throw new Error(data.error || 'Не удалось войти');
      }
      localStorage.removeItem('kk_device_blocked');
      localStorage.setItem('kk_token', data.token);
      localStorage.setItem('kk_user_id', data.userId);
      localStorage.setItem('kk_username', data.username);
      this.currentUser = {
        token: data.token,
        userId: data.userId,
        username: data.username
      };
      return this.currentUser;
    } catch (e) {
      console.error('[Login] Ошибка:', e);
      throw e;
    }
  },

  logout: function() {
    localStorage.removeItem('kk_token');
    localStorage.removeItem('kk_user_id');
    localStorage.removeItem('kk_username');
    localStorage.removeItem('kk_device_blocked');
    this.currentUser = null;
  }
};

// ================================================================
// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
// ================================================================
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function el(id) { return document.getElementById(id); }
