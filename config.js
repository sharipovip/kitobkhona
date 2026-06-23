// ===== KITOB CONFIG =====
const KITOB_CONFIG = {
  NEON_API_BASE: 'https://kitobkhona-chat-production.up.railway.app',
  SUPABASE_REST: 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2R6ZnFvb3ByeHl0bGVwYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDI2MjIwMDAsImV4cCI6MTk4NzAyMDAwMH0.4SGNBUBjpgD8xLDG6x0jrJNKV-0Z5QQQaZkQhF5qzDA'
};

// ===== AUTO-LOGIN =====
const AutoLogin = {
  currentUser: null,

  autoLogin: async function() {
    console.log('[AutoLogin] Starting...');
    
    // Проверяем есть ли уже токен в localStorage
    const savedToken = localStorage.getItem('kk_token');
    const savedUserId = localStorage.getItem('kk_user_id');
    const savedUsername = localStorage.getItem('kk_username');

    if (savedToken && savedUserId) {
      console.log('[AutoLogin] Found saved token');
      this.currentUser = {
        token: savedToken,
        userId: savedUserId,
        username: savedUsername || 'user'
      };
      return this.currentUser;
    }

    // Создаём новый пользователь
    try {
      console.log('[AutoLogin] Creating new user...');
      const counter = parseInt(localStorage.getItem('kk_counter') || '0') + 1;
      const username = `kitobkhon_${counter}`;
      const email = `${username}@kitobkhona.local`;
      const password = `pass_${Date.now()}`;

      const regResponse = await fetch(`${KITOB_CONFIG.NEON_API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          username: username,
          password: password,
          display_name: username
        })
      });

      if (!regResponse.ok) {
        throw new Error(`Registration failed: ${regResponse.status}`);
      }

      const regData = await regResponse.json();
      console.log('[AutoLogin] User created:', regData);

      // Сохраняем данные
      localStorage.setItem('kk_token', regData.token);
      localStorage.setItem('kk_user_id', regData.userId);
      localStorage.setItem('kk_username', username);
      localStorage.setItem('kk_counter', counter.toString());

      this.currentUser = {
        token: regData.token,
        userId: regData.userId,
        username: username
      };

      console.log('[AutoLogin] Auto-login successful');
      return this.currentUser;

    } catch (e) {
      console.error('[AutoLogin] Error:', e);
      return null;
    }
  }
};

// ===== NEON API (PostgreSQL backend) =====
const NEON_API = {
  
  getProfile: async function(userId, token) {
    console.log('[NEON_API] Getting profile for:', userId);
    const response = await fetch(`${KITOB_CONFIG.NEON_API_BASE}/api/profiles/${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`GET /api/profiles/${userId}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[NEON_API] Profile loaded:', data);
    return data;
  },

  updateProfile: async function(userId, updates, token) {
    console.log('[NEON_API] Updating profile:', updates);
    const response = await fetch(`${KITOB_CONFIG.NEON_API_BASE}/api/profiles`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      throw new Error(`PUT /api/profiles: ${response.status}`);
    }

    return await response.json();
  },

  getReadingSessions: async function(token) {
    const response = await fetch(`${KITOB_CONFIG.NEON_API_BASE}/api/reading-sessions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Reading sessions: ${response.status}`);
    return await response.json();
  },

  getFavorites: async function(token) {
    const response = await fetch(`${KITOB_CONFIG.NEON_API_BASE}/api/favorites`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Favorites: ${response.status}`);
    return await response.json();
  },

  getUserAchievements: async function(token) {
    const response = await fetch(`${KITOB_CONFIG.NEON_API_BASE}/api/user-achievements`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Achievements: ${response.status}`);
    return await response.json();
  }
};

// ===== CHAT API =====
const ChatAPI = {
  
  sendFriendRequest: async function(fromUserId, toUserId) {
    const token = localStorage.getItem('kk_token');
    const response = await fetch(`${KITOB_CONFIG.NEON_API_BASE}/api/friends/requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from_user: fromUserId,
        to_user: toUserId
      })
    });

    if (!response.ok) {
      throw new Error(`Friend request failed: ${response.status}`);
    }

    return await response.json();
  },

  getMessages: async function(senderId, receiverId) {
    const token = localStorage.getItem('kk_token');
    const response = await fetch(
      `${KITOB_CONFIG.NEON_API_BASE}/api/messages?sender=${senderId}&receiver=${receiverId}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    if (!response.ok) throw new Error(`Messages: ${response.status}`);
    return await response.json();
  },

  sendMessage: async function(senderId, receiverId, text) {
    const token = localStorage.getItem('kk_token');
    const response = await fetch(`${KITOB_CONFIG.NEON_API_BASE}/api/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender_id: senderId,
        receiver_id: receiverId,
        text: text
      })
    });

    if (!response.ok) {
      throw new Error(`Send message failed: ${response.status}`);
    }

    return await response.json();
  }
};

// ===== HELPER FUNCTIONS =====

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function $(id) {
  return document.getElementById(id);
}

// ===== QUERY HELPERS FOR SUPABASE (если нужно) =====
async function apiGet(table, { eq = null, order = null, limit = null } = {}) {
  let url = `${KITOB_CONFIG.SUPABASE_REST}/${table}`;
  const params = new URLSearchParams();

  if (eq) {
    params.append(`${eq.column}=eq.${eq.value}`);
  }
  if (order) {
    params.append('order', order);
  }
  if (limit) {
    params.append('limit', limit);
  }

  const token = localStorage.getItem('kk_token');
  const response = await fetch(`${url}${params.toString() ? '?' + params.toString() : ''}`, {
    headers: {
      'apikey': KITOB_CONFIG.SUPABASE_KEY,
      'Authorization': `Bearer ${token || 'anon'}`
    }
  });

  if (!response.ok) {
    throw new Error(`apiGet(${table}): ${response.status}`);
  }

  return await response.json();
}
