// Kitobkhona API Config — single source of truth
const KITOB_CONFIG = {
  SUPABASE_URL: 'https://dwkdzfqooprxytlepaoo.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2R6ZnFvb3ByeHl0bGVwYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDI5ODIsImV4cCI6MjA5NjQ3ODk4Mn0.4rV_7yN5Urx5WHgb9kAxWo_VmrPWGlbFYN4Ij7DcuyI',
  API_BASE: 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1',
  AUTH_BASE: 'https://dwkdzfqooprxytlepaoo.supabase.co/auth/v1',
  GITHUB_BOOKS_URL: 'https://raw.githubusercontent.com/sharipovip/books/main/books.json',
  // Chat Server (Railway)
  CHAT_API: 'https://kitobkhona-chat-production.up.railway.app',
  GITHUB_REPO: 'sharipovip/books',
  GITHUB_BRANCH: 'main'
};

// Universal fetch wrapper for Supabase REST API
async function apiGet(table, options = {}) {
  const { select = '*', eq, order, limit, single = false } = options;
  let url = `${KITOB_CONFIG.API_BASE}/${table}?select=${encodeURIComponent(select)}`;
  if (eq) url += `&${encodeURIComponent(eq.column)}=eq.${encodeURIComponent(eq.value)}`;
  if (order) url += `&order=${encodeURIComponent(order)}`;
  if (limit) url += `&limit=${limit}`;
  if (single) url += `&limit=1`;

  const token = localStorage.getItem('kk_token') || '';
  const res = await fetch(url, {
    headers: {
      'apikey': KITOB_CONFIG.SUPABASE_KEY,
      'Authorization': token ? `Bearer ${token}` : `Bearer ${KITOB_CONFIG.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return single ? (await res.json())[0] || null : await res.json();
}

async function apiPost(table, data) {
  const token = localStorage.getItem('kk_token') || '';
  const res = await fetch(`${KITOB_CONFIG.API_BASE}/${table}`, {
    method: 'POST',
    headers: {
      'apikey': KITOB_CONFIG.SUPABASE_KEY,
      'Authorization': token ? `Bearer ${token}` : `Bearer ${KITOB_CONFIG.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return await res.json();
}

async function apiPatch(table, column, value, data) {
  const token = localStorage.getItem('kk_token') || '';
  const res = await fetch(`${KITOB_CONFIG.API_BASE}/${table}?${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`, {
    method: 'PATCH',
    headers: {
      'apikey': KITOB_CONFIG.SUPABASE_KEY,
      'Authorization': token ? `Bearer ${token}` : `Bearer ${KITOB_CONFIG.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return await res.json();
}

// === READING SESSION TRACKING ===
// >5 минут = "reader", <5 минут = "viewer"
const ReadingSession = {
  startTime: null,
  bookId: null,
  interval: null,
  
  // Начать отслеживание
  start(bookId) {
    this.startTime = Date.now();
    this.bookId = bookId;
    
    // Сохраняем в localStorage на случай закрытия страницы
    localStorage.setItem('kk_reading_session', JSON.stringify({
      startTime: this.startTime,
      bookId: this.bookId
    }));
    
    console.log('[ReadingSession] Started for book:', bookId);
  },
  
  // Остановить и сохранить
  async stop() {
    if (!this.startTime || !this.bookId) return;
    
    const duration = Date.now() - this.startTime; // в миллисекундах
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    // Очищаем localStorage
    localStorage.removeItem('kk_reading_session');
    
    // Если читал больше 5 минут - сохраняем
    if (minutes >= 5) {
      try {
        const { data } = await AUTH.getUser();
        if (data.user) {
          await apiPost('reading_sessions', {
            user_id: data.user.id,
            book_id: this.bookId,
            duration_seconds: duration / 1000,
            pages_read: 1,
            session_type: 'reader' // >5 минут
          });
          console.log('[ReadingSession] Saved as reader:', minutes, 'min');
        }
      } catch (e) {
        console.error('[ReadingSession] Error:', e);
      }
    } else {
      console.log('[ReadingSession] Saved as viewer:', minutes, 'min', seconds, 'sec');
    }
    
    this.startTime = null;
    this.bookId = null;
  },
  
  // Проверить - открыта ли страница чтения
  restore() {
    try {
      const saved = localStorage.getItem('kk_reading_session');
      if (saved) {
        const session = JSON.parse(saved);
        this.startTime = session.startTime;
        this.bookId = session.bookId;
        return true;
      }
    } catch (e) {}
    return false;
  }
};

// === Chat Server API (Railway) ===
const ChatAPI = {
  async getMessages(senderId, receiverId) {
    try {
      const res = await fetch(`${KITOB_CONFIG.CHAT_API}/api/messages?sender=${senderId}&receiver=${receiverId}`);
      if (!res.ok) throw new Error('Failed');
      return await res.json();
    } catch(e) { return []; }
  },
  
  async sendMessage(senderId, receiverId, text) {
    const res = await fetch(`${KITOB_CONFIG.CHAT_API}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: senderId, receiver_id: receiverId, text })
    });
    if (!res.ok) throw new Error('Failed');
    return await res.json();
  },
  
  async getFriends(userId) {
    try {
      const res = await fetch(`${KITOB_CONFIG.CHAT_API}/api/friends/${userId}`);
      if (!res.ok) return [];
      return await res.json();
    } catch(e) { return []; }
  },
  
  async getFriendRequests(userId) {
    try {
      const res = await fetch(`${KITOB_CONFIG.CHAT_API}/api/friends/requests?userId=${userId}`);
      if (!res.ok) return [];
      return await res.json();
    } catch(e) { return []; }
  },
  
  async sendFriendRequest(fromUser, toUser) {
    const res = await fetch(`${KITOB_CONFIG.CHAT_API}/api/friends/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_user: fromUser, to_user: toUser })
    });
    if (!res.ok) throw new Error('Failed');
    return await res.json();
  },
  
  async sendReport(reporterId, reportedUserId, reason) {
    const res = await fetch(`${KITOB_CONFIG.CHAT_API}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reporter_id: reporterId, reported_user_id: reportedUserId, reason })
    });
    if (!res.ok) throw new Error('Failed');
    return await res.json();
  }
};

// Auth functions
const AUTH = {
  async signUp(email, password, metadata = {}) {
    const res = await fetch(`${KITOB_CONFIG.AUTH_BASE}/signup`, {
      method: 'POST',
      headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, data: metadata })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || 'Signup error');
    if (data.access_token) localStorage.setItem('kk_token', data.access_token);
    return { user: data.user, session: data };
  },

  async signIn(email, password) {
    const res = await fetch(`${KITOB_CONFIG.AUTH_BASE}/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || 'Login error');
    if (data.access_token) localStorage.setItem('kk_token', data.access_token);
    return { user: data.user, session: data };
  },

  async signOut() {
    localStorage.removeItem('kk_token');
    localStorage.removeItem('kk_user');
    return true;
  },

  async getUser() {
    const token = localStorage.getItem('kk_token');
    if (!token) return { data: { user: null } };
    const res = await fetch(`${KITOB_CONFIG.AUTH_BASE}/user`, {
      headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return { data: { user: null } };
    return { data: { user: await res.json() } };
  }
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
