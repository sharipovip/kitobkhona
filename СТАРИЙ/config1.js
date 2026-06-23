// Kitobkhona API Config — single source of truth
const KITOB_CONFIG = {
  SUPABASE_URL: 'https://dwkdzfqooprxytlepaoo.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2R6ZnFvb3ByeHl0bGVwYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDI5ODIsImV4cCI6MjA5NjQ3ODk4Mn0.4rV_7yN5Urx5WHgb9kAxWo_VmrPWGlbFYN4Ij7DcuyI',
  API_BASE: 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1',
  AUTH_BASE: 'https://dwkdzfqooprxytlepaoo.supabase.co/auth/v1',
  GITHUB_BOOKS_URL: 'https://raw.githubusercontent.com/sharipovip/books/main/books.json',
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
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
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
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
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
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function apiDelete(table, column, value) {
  const token = localStorage.getItem('kk_token') || '';
  const res = await fetch(`${KITOB_CONFIG.API_BASE}/${table}?${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`, {
    method: 'DELETE',
    headers: {
      'apikey': KITOB_CONFIG.SUPABASE_KEY,
      'Authorization': token ? `Bearer ${token}` : `Bearer ${KITOB_CONFIG.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return true;
}


async function apiUpsert(table, data, onConflict = '') {
  const token = localStorage.getItem('kk_token') || '';
  let url = `${KITOB_CONFIG.API_BASE}/${table}`;
  if (onConflict) url += `?on_conflict=${encodeURIComponent(onConflict)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': KITOB_CONFIG.SUPABASE_KEY,
      'Authorization': token ? `Bearer ${token}` : `Bearer ${KITOB_CONFIG.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return await res.json();
}

// Auth functions (replacement for supabase.auth)
const AUTH = {
  async signUp(email, password, metadata = {}) {
    const res = await fetch(`${KITOB_CONFIG.AUTH_BASE}/signup`, {
      method: 'POST',
      headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, data: metadata })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.message || 'Signup error');
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
    if (!res.ok) throw new Error(data.error_description || data.message || 'Login error');
    if (data.access_token) localStorage.setItem('kk_token', data.access_token);
    return { user: data.user, session: data };
  },

  async signOut() {
    const token = localStorage.getItem('kk_token');
    if (token) {
      await fetch(`${KITOB_CONFIG.AUTH_BASE}/logout`, {
        method: 'POST',
        headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
    }
    localStorage.removeItem('kk_token');
    localStorage.removeItem('kk_user');
    return true;
  },

  async getSession() {
    const token = localStorage.getItem('kk_token');
    if (!token) return { data: { session: null } };
    // Verify token by getting user
    const res = await fetch(`${KITOB_CONFIG.AUTH_BASE}/user`, {
      headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      localStorage.removeItem('kk_token');
      return { data: { session: null } };
    }
    const user = await res.json();
    return { data: { session: { user, access_token: token } } };
  },

  async getUser() {
    const token = localStorage.getItem('kk_token');
    if (!token) return { data: { user: null } };
    const res = await fetch(`${KITOB_CONFIG.AUTH_BASE}/user`, {
      headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return { data: { user: null } };
    return { data: { user: await res.json() } };
  },

  async resetPassword(email) {
    const res = await fetch(`${KITOB_CONFIG.AUTH_BASE}/recover`, {
      method: 'POST',
      headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) throw new Error('Reset error');
    return true;
  }
};

// Helper: get current user id
async function getCurrentUserId() {
  const { data } = await AUTH.getUser();
  return data.user?.id || null;
}

// Helper: escape HTML
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
