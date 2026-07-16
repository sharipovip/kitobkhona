// ═══════════════════════════════════════════════════════════════
// Cloudflare Worker – Kitobkhona Auth Server
// Исправленная версия с правильными маршрутами
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ...rest) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': request.headers.get('Origin') || 'https://kitobkhona.tojik.workers.dev',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
      'Access-Control-Allow-Credentials': 'true'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
    // ═══ HEALTH CHECK ══
    if (path === '/health' || path === '/') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'kitobkhona-auth-worker',
        time: new Date().toISOString(),
        version: '2.3.0'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ═══ API ROUTES ══
    
    // Auth endpoints
    if (path.startsWith('/api/auth/')) {
      return handleAuth(path, method, request, env, corsHeaders);
    }

    // Profiles
    if (path.startsWith('/api/profiles')) {
      return handleProfiles(path, method, request, env, corsHeaders);
    }

    // Reading sessions
    if (path.startsWith('/api/reading-sessions')) {
      return handleReadingSessions(path, method, request, env, corsHeaders);
    }

    // Favorites
    if (path.startsWith('/api/favorites')) {
      return handleFavorites(path, method, request, env, corsHeaders);
    }

    // Notifications
    if (path.startsWith('/api/notifications')) {
      return handleNotifications(path, method, request, env, corsHeaders);
    }

    // Announcements
    if (path.startsWith('/api/announcements')) {
      return handleAnnouncements(path, method, request, env, corsHeaders);
    }

    // Push
    if (path.startsWith('/api/push')) {
      return handlePush(path, method, request, env, corsHeaders);
    }

    // Admin
    if (path.startsWith('/api/admin/')) {
      return handleAdmin(path, method, request, env, corsHeaders);
    }

    // Winners
    if (path.startsWith('/api/winners')) {
      return handleWinners(path, method, request, env, corsHeaders);
    }

    // Popular books
    if (path.startsWith('/api/popular-books')) {
      return handlePopularBooks(path, method, request, env, corsHeaders);
    }

    // Feedbacks
    if (path.startsWith('/api/feedbacks')) {
      return handleFeedbacks(path, method, request, env, corsHeaders);
    }

    // Support
    if (path.startsWith('/api/support')) {
      return handleSupport(path, method, request, env, corsHeaders);
    }

    // Debug
    if (path.startsWith('/api/auth/check')) {
      return new Response(JSON.stringify({ ok: true, path }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ═══ NOT FOUND ═══
    return new Response(JSON.stringify({
      error: 'Not found',
      path: path,
      available_routes: [
        '/health',
        '/api/auth/register',
        '/api/auth/login',
        '/api/profiles/:userId',
        '/api/reading-sessions',
        '/api/favorites',
        '/api/notifications',
        '/api/announcements',
        '/api/push/register',
        '/api/winners',
        '/api/popular-books',
        '/api/admin/users',
        '/api/feedbacks'
      ]
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    } catch (e) {
      console.error('[WORKER] Unhandled error:', e.message, e.stack);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        details: e.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// ═══ HELPER FUNCTIONS ══

async function getSupabaseClient(env) {
  // Серверные операции (register/login) требуют service_role ключ
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
  if (!env.SUPABASE_URL || !key) {
    throw new Error('Supabase not configured (need SUPABASE_URL + SUPABASE_SERVICE_KEY)');
  }
  return {
    url: env.SUPABASE_URL,
    key: key,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
}

async function supabaseQuery(client, table, options = {}) {
  const { select = '*', eq, order, limit, body, method = 'GET' } = options;
  let url = `${client.url}/rest/v1/${table}?select=${select}`;
  
  if (eq) {
    url += `&${eq.column}=eq.${eq.value}`;
  }
  if (order) {
    url += `&order=${order}`;
  }
  if (limit) {
    url += `&limit=${limit}`;
  }

  const fetchOptions = {
    method,
    headers: client.headers
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase error: ${response.status} - ${error}`);
  }

  return await response.json();
}

function getAuthHeader(request) {
  return request.headers.get('Authorization') || '';
}

function getToken(request) {
  const auth = getAuthHeader(request);
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Base64URL encoding (JWT standard)
function base64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4;
  if (pad) str += '='.repeat(4 - pad);
  return atob(str);
}

// Create JWT with HMAC-SHA256 (compatible with jsonwebtoken library)
async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = encodedHeader + '.' + encodedPayload;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const encodedSignature = base64urlEncode(String.fromCharCode(...new Uint8Array(signature)));
  
  return signingInput + '.' + encodedSignature;
}

// Verify JWT with HMAC-SHA256
async function verifyJWT(token, env) {
  if (!token) return null;
  if (!env.JWT_SECRET) {
    console.error('JWT_SECRET not configured');
    return null;
  }
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const signingInput = parts[0] + '.' + parts[1];
    const signature = parts[2];
    
    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBytes = new Uint8Array(
      atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((signature.length % 4) || 4))
      .split('').map(c => c.charCodeAt(0))
    );
    // Proper base64url decode for signature
    let sigStr = signature.replace(/-/g, '+').replace(/_/g, '/');
    const pad = sigStr.length % 4;
    if (pad) sigStr += '='.repeat(4 - pad);
    const sigBytes = new Uint8Array(atob(sigStr).split('').map(c => c.charCodeAt(0)));
    
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(signingInput));
    if (!valid) return null;
    
    const payload = JSON.parse(base64urlDecode(parts[1]));
    
    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }
    
    return payload;
  } catch (e) {
    console.error('JWT verify error:', e);
    return null;
  }
}

function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

// ═══ ROUTE HANDLERS ═══

async function handleAuth(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    // POST /api/auth/register
    if (path === '/api/auth/register' && method === 'POST') {
      const body = await request.json();
      const { email, username, password, display_name, is_temporary, gender } = body;
      
      if (!username || !password) {
        return jsonResponse({ error: 'Username and password required' }, 400, corsHeaders);
      }

      // Check if user exists
      const existing = await supabaseQuery(client, 'users', {
        select: 'id',
        eq: { column: 'username', value: username },
        limit: 1
      });

      if (existing && existing.length > 0) {
        return jsonResponse({ error: 'User already exists' }, 409, corsHeaders);
      }

      // Hash password (simplified - in production use bcrypt)
      const encoder = new TextEncoder();
      const data = encoder.encode(password + env.JWT_SECRET);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Insert user
      const newUser = await supabaseQuery(client, 'users', {
        method: 'POST',
        body: {
          email: email || null,
          username,
          password_hash: passwordHash,
          role: 'user',
          is_temporary: is_temporary || false
        }
      });

      // Insert profile
      await supabaseQuery(client, 'profiles', {
        method: 'POST',
        body: {
          user_id: newUser[0]?.id || newUser.id,
          display_name: display_name || username,
          gender: gender || null
        }
      });

      // Create JWT token
      const userId = newUser[0]?.id || newUser.id;
      const tokenPayload = {
        id: userId,
        username,
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
      };
      
      // Simple token creation (in production use proper JWT library)
      const token = await createJWT(tokenPayload, env.JWT_SECRET);

      return jsonResponse({
        token,
        userId,
        username
      }, 200, corsHeaders);
    }

    // POST /api/auth/login
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await request.json();
      const { username, password } = body;
      
      if (!username || !password) {
        return jsonResponse({ error: 'Username and password required' }, 400, corsHeaders);
      }

      // Find user
      const users = await supabaseQuery(client, 'users', {
        select: 'id,username,password_hash,role',
        eq: { column: 'username', value: username }
      });

      if (!users || users.length === 0) {
        return jsonResponse({ error: 'Логин ё парол нодуруст аст' }, 401, corsHeaders);
      }

      const user = users[0];

      // Verify password
      const encoder = new TextEncoder();
      const data = encoder.encode(password + env.JWT_SECRET);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      if (user.password_hash !== passwordHash) {
        return jsonResponse({ error: 'Логин ё парол нодуруст аст' }, 401, corsHeaders);
      }

      // Create token
      const tokenPayload = {
        id: user.id,
        username: user.username,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
      };
      
      const token = await createJWT(tokenPayload, env.JWT_SECRET);

      return jsonResponse({
        token,
        userId: user.id,
        username: user.username
      }, 200, corsHeaders);
    }

    // POST /api/auth/check-reset-eligibility
    if (path === '/api/auth/check-reset-eligibility' && method === 'POST') {
      return jsonResponse({ ok: true, message: 'Агар почта дуруст бошад, рамз фиристода мешавад' }, 200, corsHeaders);
    }

    // POST /api/auth/reset-password
    if (path === '/api/auth/reset-password' && method === 'POST') {
      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    // DELETE /api/auth/delete-account
    if (path === '/api/auth/delete-account' && method === 'DELETE') {
      const token = getToken(request);
      const decoded = await verifyJWT(token, env);
      if (!decoded) return jsonResponse({ error: 'No token' }, 401, corsHeaders);
      try { await supabaseQuery(client, 'users', { method: 'DELETE', eq: { column: 'id', value: String(decoded.id) } }); } catch (e) {}
      try { await supabaseQuery(client, 'profiles', { method: 'DELETE', eq: { column: 'user_id', value: String(decoded.id) } }); } catch (e) {}
      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Auth error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handleProfiles(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    const token = getToken(request);
    const decoded = await verifyJWT(token, env);
    
    if (!decoded) {
      return jsonResponse({ error: 'No token' }, 401, corsHeaders);
    }

    // GET /api/profiles/:userId
    if (path.match(/^\/api\/profiles\/\d+$/) && method === 'GET') {
      const userId = path.split('/').pop();
      
      let profiles;
      try { profiles = await supabaseQuery(client, 'profiles', { select: '*', eq: { column: 'user_id', value: userId }, limit: 1 }); }
      catch (e) { profiles = null; }

      if (!profiles || profiles.length === 0) {
        // Авто-создаём профиль
        try {
          await supabaseQuery(client, 'profiles', { method: 'POST', body: { user_id: parseInt(userId), display_name: 'Меҳмон' } });
        } catch (e) { /* ok, maybe already exists */ }
        return jsonResponse({ id: parseInt(userId), user_id: parseInt(userId), username: decoded.username, display_name: 'Меҳмон' }, 200, corsHeaders);
      }

      let users = [];
      try { users = await supabaseQuery(client, 'users', { select: 'username,email,role,created_at,is_temporary', eq: { column: 'id', value: userId }, limit: 1 }); }
      catch (e) { users = []; }

      const profile = profiles[0];
      const user = users[0] || {};
      return jsonResponse({ ...profile, ...user }, 200, corsHeaders);
    }

    // PUT /api/profiles (upsert через POST с ON CONFLICT)
    if (path === '/api/profiles' && method === 'PUT') {
      const body = await request.json();
      const userId = decoded.id;
      const profileFields = ['first_name','last_name','birth_year','gender','region','city','jamoat','village','display_name','bio','avatar_url'];
      const userFields = ['username','email'];
      const profileUpdate = {};
      for (const key of profileFields) {
        if (body[key] !== undefined) profileUpdate[key] = body[key];
      }
      if (Object.keys(profileUpdate).length > 0) {
        try { await supabaseQuery(client, 'profiles', { method: 'PATCH', eq: { column: 'user_id', value: String(userId) }, body: profileUpdate }); }
        catch (e) { await supabaseQuery(client, 'profiles', { method: 'POST', body: { ...profileUpdate, user_id: userId } }); }
      }
      const userUpdate = {};
      for (const key of userFields) {
        if (body[key] !== undefined) userUpdate[key] = body[key];
      }
      if (body.password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(body.password + env.JWT_SECRET);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        userUpdate.password_hash = passwordHash;
        userUpdate.is_temporary = false;
      }
      if (Object.keys(userUpdate).length > 0) {
        await supabaseQuery(client, 'users', { method: 'PATCH', eq: { column: 'id', value: String(userId) }, body: userUpdate });
      }
      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Profiles error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handleReadingSessions(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    const token = getToken(request);
    const decoded = await verifyJWT(token, env);
    
    if (!decoded) {
      return jsonResponse({ error: 'No token' }, 401, corsHeaders);
    }

    // GET /api/reading-sessions
    if (path === '/api/reading-sessions' && method === 'GET') {
      const userId = new URL(request.url).searchParams.get('user_id') || decoded.id;
      try {
        const sessions = await supabaseQuery(client, 'reading_sessions', {
          select: '*', eq: { column: 'user_id', value: userId },
          order: 'created_at.desc', limit: 50
        });
        return jsonResponse(sessions || [], 200, corsHeaders);
      } catch (e) { return jsonResponse([], 200, corsHeaders); }
    }

    // POST /api/reading-sessions
    if (path === '/api/reading-sessions' && method === 'POST') {
      const body = await request.json();
      
      await supabaseQuery(client, 'reading_sessions', {
        method: 'POST',
        body: {
          user_id: decoded.id,
          ...body
        }
      });

      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Reading sessions error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handleFavorites(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    const token = getToken(request);
    const decoded = await verifyJWT(token, env);
    
    if (!decoded) {
      return jsonResponse({ error: 'No token' }, 401, corsHeaders);
    }

    // GET /api/favorites (из Neon/Turso — временно пустой)
    if (path === '/api/favorites' && method === 'GET') {
      try {
        const userId = new URL(request.url).searchParams.get('user_id') || decoded.id;
        const favorites = await supabaseQuery(client, 'user_favorites', {
          select: '*', eq: { column: 'user_id', value: userId },
          order: 'added_at.desc', limit: 50
        });
        return jsonResponse(favorites || [], 200, corsHeaders);
      } catch (e) { return jsonResponse([], 200, corsHeaders); }
    }

    // POST /api/favorites
    if (path === '/api/favorites' && method === 'POST') {
      const body = await request.json();
      
      await supabaseQuery(client, 'user_favorites', {
        method: 'POST',
        body: {
          user_id: decoded.id,
          ...body
        }
      });

      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Favorites error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handleNotifications(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    const token = getToken(request);
    const decoded = await verifyJWT(token, env);
    
    if (!decoded) {
      return jsonResponse({ error: 'No token' }, 401, corsHeaders);
    }

    // GET /api/notifications (из Neon — временно пустой)
    if (path === '/api/notifications' && method === 'GET') {
      try {
        const notifications = await supabaseQuery(client, 'notifications', {
          select: '*', eq: { column: 'user_id', value: decoded.id },
          order: 'created_at.desc', limit: 100
        });
        return jsonResponse(notifications || [], 200, corsHeaders);
      } catch (e) { return jsonResponse([], 200, corsHeaders); }
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Notifications error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handleAnnouncements(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    // GET /api/announcements/active (основной источник — Social API)
    if (path === '/api/announcements/active' && method === 'GET') {
      try {
        const announcements = await supabaseQuery(client, 'announcements', {
          select: '*', eq: { column: 'is_active', value: 'true' },
          order: 'created_at.desc', limit: 1
        });
        return jsonResponse(announcements?.[0] || null, 200, corsHeaders);
      } catch (e) { return jsonResponse(null, 200, corsHeaders); }
    }

    // GET /api/announcements
    if (path === '/api/announcements' && method === 'GET') {
      try {
        const announcements = await supabaseQuery(client, 'announcements', {
          select: '*', order: 'created_at.desc'
        });
        return jsonResponse(announcements || [], 200, corsHeaders);
      } catch (e) { return jsonResponse([], 200, corsHeaders); }
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Announcements error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handlePush(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    const token = getToken(request);
    const decoded = await verifyJWT(token, env);
    
    if (!decoded) {
      return jsonResponse({ error: 'No token' }, 401, corsHeaders);
    }

    // POST /api/push/register
    if (path === '/api/push/register' && method === 'POST') {
      const body = await request.json();
      
      await supabaseQuery(client, 'device_tokens', {
        method: 'POST',
        body: {
          user_id: decoded.id,
          token: body.token,
          platform: body.platform || 'web'
        }
      });

      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    // DELETE /api/push/register
    if (path === '/api/push/register' && method === 'DELETE') {
      const body = await request.json();
      
      await supabaseQuery(client, 'device_tokens', {
        method: 'DELETE',
        eq: { column: 'token', value: body.token }
      });

      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Push error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handleAdmin(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    const token = getToken(request);
    const decoded = await verifyJWT(token, env);
    
    if (!decoded) {
      return jsonResponse({ error: 'No token' }, 401, corsHeaders);
    }

    // Check if admin
    const users = await supabaseQuery(client, 'users', {
      select: 'role',
      eq: { column: 'id', value: decoded.id },
      limit: 1
    });

    if (!users || users.length === 0 || users[0].role !== 'admin') {
      return jsonResponse({ error: 'Нет доступа' }, 403, corsHeaders);
    }

    // GET /api/admin/users
    if (path === '/api/admin/users' && method === 'GET') {
      const users = await supabaseQuery(client, 'users', {
        select: '*',
        order: 'created_at.desc',
        limit: 500
      });

      return jsonResponse(users || [], 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Admin error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handleWinners(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    // GET /api/winners
    if (path === '/api/winners' && method === 'GET') {
      // Simplified - return empty for now
      return jsonResponse({ top3: [], top100: [] }, 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Winners error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handlePopularBooks(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    // GET /api/popular-books
    if (path === '/api/popular-books' && method === 'GET') {
      // Simplified - return empty for now
      return jsonResponse([], 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Popular books error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handleFeedbacks(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    const token = getToken(request);
    const decoded = await verifyJWT(token, env);
    
    if (!decoded) {
      return jsonResponse({ error: 'No token' }, 401, corsHeaders);
    }

    // POST /api/feedbacks
    if (path === '/api/feedbacks' && method === 'POST') {
      const body = await request.json();
      
      const result = await supabaseQuery(client, 'feedbacks', {
        method: 'POST',
        body: {
          user_id: decoded.id,
          ...body
        }
      });

      return jsonResponse({ success: true, id: result[0]?.id }, 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Feedbacks error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}

async function handleSupport(path, method, request, env, corsHeaders) {
  try {
    const client = await getSupabaseClient(env);
    const token = getToken(request);
    const decoded = await verifyJWT(token, env);
    
    if (!decoded) {
      return jsonResponse({ error: 'No token' }, 401, corsHeaders);
    }

    // POST /api/support/send
    if (path === '/api/support/send' && method === 'POST') {
      const body = await request.json();
      
      await supabaseQuery(client, 'feedbacks', {
        method: 'POST',
        body: {
          user_id: decoded.id,
          category: body.category || 'support',
          message: body.message,
          user_email: body.email
        }
      });

      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  } catch (e) {
    console.error('Support error:', e);
    return jsonResponse({ error: 'Internal server error', details: e.message }, 500, corsHeaders);
  }
}
