// ═══════════════════════════════════════════════════════════════
// Kitobkhona AUTH Server — GCP Cloud Run
// Auth + Profiles + Admin + Notifications + Push
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;

// ════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ════════════════════════════════════════════════════

// Supabase (users, profiles)
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dwkdzfqooprxytlepaoo.supabase.co',
  process.env.SUPABASE_KEY || ''
);

// Neon (reading, favorites, notifications)
const neonPool = new Pool({
  connectionString: process.env.NEON_DB_URL,
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  ssl: { rejectUnauthorized: false }
});

// Upstash Redis (кэш)
const redis = process.env.UPSTASH_REDIS_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    })
  : null;

// Resend (email)
const resend = new Resend(process.env.RESEND_API_KEY);

// Firebase Admin (push)
let firebaseMessaging = null;
async function initFirebase() {
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (sa) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(sa)),
        projectId: 'kitobkhona-push'
      });
      firebaseMessaging = admin.messaging();
      console.log('[FCM] Initialized');
    }
  } catch (e) {
    console.warn('[FCM] Init failed:', e.message);
  }
}
initFirebase();

// JWT
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters!');
  process.exit(1);
}

// ════════════════════════════════════════════════════
// MIDDLEWARE
// ════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://kitobkhona.tojik.workers.dev',
  'https://kitobkhona.pages.dev',
  'https://kitobkhona.tj',
  'https://www.kitobkhona.tj',
  'https://sharipovip.github.io',
  'http://localhost:3000',
  'http://localhost:8080',
  'capacitor://localhost',
  'http://localhost'
];

app.use(compression({ threshold: 1024 }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '512kb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: req => req.path === '/health'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// ════════════════════════════════════════════════════
// КЭШ (Redis)
// ════════════════════════════════════════════════════

async function getCached(key) {
  if (!redis) return null;
  try { return await redis.get(key); }
  catch { return null; }
}

async function setCached(key, value, ttlSec = 300) {
  if (!redis) return;
  try { await redis.set(key, JSON.stringify(value), { ex: ttlSec }); }
  catch (e) { console.warn('[Redis] setCached error:', e.message); }
}

async function invalidateCache(pattern) {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch (e) { console.warn('[Redis] invalidate error:', e.message); }
}

// ════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════

app.get('/health', async (req, res) => {
  try {
    await neonPool.query('SELECT 1');
    res.json({
      ok: true,
      service: 'kitobkhona-auth',
      time: new Date().toISOString(),
      fcm: !!firebaseMessaging,
      redis: !!redis,
      version: '2.0.0'
    });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ════════════════════════════════════════════════════

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  // Проверяем кэш сессии
  const cached = await getCached(`session:${token}`);
  if (cached) {
    req.user = cached;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Проверяем blocked через Supabase
    const { data: profile } = await supabase
      .from('profiles')
      .select('blocked')
      .eq('user_id', decoded.id)
      .single();

    if (profile?.blocked === true) {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    }

    // Кэшируем сессию на 5 минут
    await setCached(`session:${token}`, decoded, 300);

    req.user = decoded;
    req.token = token;
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

const requireAdmin = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', decoded.id)
      .single();
    if (!user) return res.status(403).json({ error: 'Пользователь не найден' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
};

// ════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ════════════════════════════════════════════════════

function authHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

app.post('/api/auth/register', async (req, res) => {
  const { email, username, password, display_name, is_temporary, gender } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const client = await neonPool.connect();
  try {
    await client.query('BEGIN');

    // Проверяем существование пользователя в Supabase
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .ilike('username', username)
      .single();

    if (existing) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Создаём в Supabase (users)
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email: email || null,
        username,
        password_hash: passwordHash,
        role: 'user',
        is_temporary: is_temporary || false
      })
      .select()
      .single();

    if (error) throw error;

    // Создаём профиль
    const displayName = display_name || username;
    await supabase.from('profiles').upsert({
      user_id: newUser.id,
      display_name: displayName,
      gender: gender || null
    });

    await client.query('COMMIT');

    const token = jwt.sign(
      { id: newUser.id, username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, userId: newUser.id, username });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Register error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password, device_fp } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, username, email, password_hash, role')
      .or(`username.ilike.${username},email.ilike.${username}`)
      .single();

    if (!user) return res.status(401).json({ error: 'Логин ё парол нодуруст аст' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('blocked')
      .eq('user_id', user.id)
      .single();

    if (profile?.blocked === true) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Логин ё парол нодуруст аст' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, userId: user.id, username: user.username });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// PROFILES
// ════════════════════════════════════════════════════

app.get('/api/profiles/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;

  // Кэш профиля
  const cacheKey = `profile:${userId}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !profile) return res.status(404).json({ error: 'Profile not found' });

    const { data: user } = await supabase
      .from('users')
      .select('id, username, email, role, created_at, is_temporary')
      .eq('id', userId)
      .single();

    // Количество друзей (из Turso через API)
    const friendsCount = 0; // TODO: запрос к social API

    // Количество прочитанных книг (Neon)
    const { rows: books } = await neonPool.query(
      'SELECT COUNT(DISTINCT book_id) FROM reading_sessions WHERE user_id = $1',
      [userId]
    );

    const result = { ...user, ...profile, friends_count: friendsCount, books_count_real: books[0]?.count || 0 };

    // Кэш на 10 минут
    await setCached(cacheKey, result, 600);

    res.json(result);
  } catch (e) {
    console.error('Get profile error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/profiles', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { display_name, first_name, last_name, bio, gender, region, city, birth_year, avatar_url, username, password } = req.body;

  try {
    // Проверяем полноту профиля
    const missing = [];
    if (!first_name?.trim()) missing.push('first_name');
    if (!last_name?.trim()) missing.push('last_name');
    if (!gender) missing.push('gender');
    if (!birth_year) missing.push('birth_year');

    if (missing.length) {
      return res.status(400).json({
        code: 'PROFILE_INCOMPLETE',
        missing,
        error: 'Профиль не заполнен полностью'
      });
    }

    // Обновляем профиль в Supabase
    await supabase.from('profiles').update({
      display_name, first_name, last_name, bio, gender,
      region, city, birth_year, avatar_url,
      profile_edit_locked_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }).eq('user_id', userId);

    if (username) {
      await supabase.from('users').update({ username, updated_at: new Date().toISOString() }).eq('id', userId);
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await supabase.from('users').update({ password_hash: hash, is_temporary: false }).eq('id', userId);
    }

    // Очищаем кэш профиля
    await invalidateCache(`profile:${userId}`);

    res.json({ success: true });
  } catch (e) {
    console.error('Update profile error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// READING SESSIONS (Neon)
// ════════════════════════════════════════════════════

app.get('/api/reading-sessions', authenticateToken, async (req, res) => {
  const userId = req.query.user_id || req.user.id;
  try {
    const result = await neonPool.query(
      'SELECT * FROM reading_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/reading-sessions', authenticateToken, async (req, res) => {
  const { book_id, book_title, duration, pages_read, status } = req.body;
  try {
    await neonPool.query(
      `INSERT INTO reading_sessions (user_id, book_id, book_title, duration, pages_read, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, book_id, book_title || null, duration || 0, pages_read || 0, status || 'active']
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// FAVORITES (Neon)
// ════════════════════════════════════════════════════

app.get('/api/favorites', authenticateToken, async (req, res) => {
  const userId = req.query.user_id || req.user.id;
  try {
    const result = await neonPool.query(
      'SELECT * FROM user_favorites WHERE user_id = $1 ORDER BY added_at DESC LIMIT 50',
      [userId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// NOTIFICATIONS (Neon)
// ════════════════════════════════════════════════════

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const result = await neonPool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await neonPool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// PUSH TOKENS
// ════════════════════════════════════════════════════

app.post('/api/push/register', authenticateToken, async (req, res) => {
  const { token, platform } = req.body;
  try {
    // Сохраняем в Supabase
    await supabase.from('device_tokens').upsert({
      user_id: req.user.id,
      token,
      platform,
      updated_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отправка push
async function sendPushToUsers(userIds, payload) {
  if (!firebaseMessaging || !userIds.length) return;
  try {
    const { data: tokens } = await supabase
      .from('device_tokens')
      .select('token')
      .in('user_id', userIds);

    const tokenList = tokens.map(t => t.token).filter(Boolean);
    if (!tokenList.length) return;

    await firebaseMessaging.sendEachForMulticast({
      tokens: tokenList,
      notification: { title: payload.title, body: payload.body },
      data: { link: payload.link || '/' }
    });
  } catch (e) {
    console.warn('[Push] Failed:', e.message);
  }
}

// ════════════════════════════════════════════════════
// WINNERS (кэш в Redis)
// ════════════════════════════════════════════════════

app.get('/api/winners', async (req, res) => {
  const period = req.query.period || 'all';
  const cacheKey = `winners:${period}`;

  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Запрос к Neon за reading sessions
    const result = await neonPool.query(`
      SELECT u.id, u.username, p.display_name, p.avatar_url,
             COALESCE(SUM(rs.duration) / 60, 0) AS total_hours,
             COUNT(DISTINCT rs.book_id) AS total_books
      FROM reading_sessions rs
      GROUP BY u.id, u.username, p.display_name, p.avatar_url
      ORDER BY total_hours DESC
      LIMIT 103
    `);

    const payload = { top3: result.rows.slice(0, 3), top100: result.rows.slice(3) };
    await setCached(cacheKey, payload, 600); // 10 мин
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ════════════════════════════════════════════════════

app.get('/api/announcements/active', async (req, res) => {
  const cached = await getCached('announcements:active');
  if (cached) return res.json(cached);

  try {
    const result = await neonPool.query(
      `SELECT * FROM announcements WHERE is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 1`
    );
    const payload = result.rows[0] || null;
    await setCached('announcements:active', payload, 120);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ════════════════════════════════════════════════════

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false }).limit(500);
    res.json(users || []);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users/:userId/block', requireAdmin, async (req, res) => {
  try {
    await supabase.from('profiles').update({ blocked: true }).eq('user_id', req.params.userId);
    await invalidateCache(`profile:${req.params.userId}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`✅ Kitobkhona Auth Server running on port ${PORT}`);
  console.log(`  Supabase: ${process.env.SUPABASE_URL ? 'connected' : 'MISSING'}`);
  console.log(`  Neon: ${process.env.NEON_DB_URL ? 'connected' : 'MISSING'}`);
  console.log(`  Redis: ${redis ? 'connected' : 'disabled'}`);
  console.log(`  FCM: ${firebaseMessaging ? 'enabled' : 'disabled'}`);
});
