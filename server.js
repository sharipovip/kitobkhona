const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Resend } = require('resend');
const admin = require('firebase-admin');
const http = require('http'); // НОВОЕ
const WebSocket = require('ws'); // НОВОЕ

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const PORT = process.env.PORT || 8080;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
const firebaseServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
let firebaseMessaging = null;

async function initializeFirebaseAdmin() {
  try {
    let serviceAccount = null;
    if (firebaseServiceAccount) {
      serviceAccount = JSON.parse(firebaseServiceAccount);
    } else if (firebaseServiceAccountPath) {
      serviceAccount = require(firebaseServiceAccountPath);
    }
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
      });
      firebaseMessaging = admin.messaging();
      console.log('[FCM] Firebase Admin SDK initialized');
    } else {
      console.warn('[FCM] Firebase service account not configured. Push notifications disabled.');
    }
  } catch (e) {
    console.error('[FCM] Firebase Admin init failed:', e.message);
  }
}

async function ensureDeviceTokensTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        platform TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id)
    `);
  } catch (e) {
    console.error('[FCM] Failed to ensure device_tokens table:', e.message);
  }
}

initializeFirebaseAdmin();
ensureDeviceTokensTable();

// ============ CORS ============
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '5mb' }));

console.log('[DB] Tables are already created manually');

// ============ AUTH MIDDLEWARE ============
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    req.user = decoded;
    req.token = token;

    const userCheck = await pool.query(
      `SELECT p.blocked FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE u.id = $1`,
      [decoded.id]
    );
    if (userCheck.rows.length > 0 && userCheck.rows[0].blocked === true) {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    }

    const result = await pool.query('SELECT id FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) return res.status(403).json({ error: 'User not found' });
    next();
  } catch (e) {
    console.error('Token error:', e.message);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ============ ADMIN MIDDLEWARE ============
const requireAdmin = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) return res.status(403).json({ error: 'Пользователь не найден' });
    if (result.rows[0].role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
};

// ============ HELPER - официальный аккаунт "Китобхона" ============
async function getAdminAccountId() {
  try {
    const official = await pool.query(
      `SELECT id FROM users WHERE LOWER(username) = 'kitobkhona' LIMIT 1`
    );
    if (official.rows.length > 0) {
      return official.rows[0].id;
    }
    const result = await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`);
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
  } catch (e) {
    console.error('getAdminAccountId error:', e.message);
  }
  return null;
}

// ============ AUTH ============
app.post('/api/auth/register', async (req, res) => {
  const { email, username, password, display_name, is_temporary, gender } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkUser = await client.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (checkUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const isTemp = is_temporary === true ? true : false;
    const newUser = await client.query(
      `INSERT INTO users (email, username, password_hash, role, is_temporary)
       VALUES ($1, $2, $3, 'user', $4)
       RETURNING id, username, email`,
      [email || null, username, passwordHash, isTemp]
    );

    const userId = newUser.rows[0].id;
    const displayName = display_name || username;

    await client.query(
      `INSERT INTO profiles (user_id, display_name, gender)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         gender = EXCLUDED.gender,
         updated_at = NOW()`,
      [userId, displayName, gender || null]
    );

    await client.query('COMMIT');

    const token = jwt.sign({ id: userId, username: newUser.rows[0].username }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '30d' });
    res.json({ token, userId: userId, username: newUser.rows[0].username });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Register error:', e.message);
    res.status(500).json({ error: 'Internal server error', details: e.message });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.password_hash, u.role, p.blocked
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1)`,
      [username]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    const user = result.rows[0];
    if (user.blocked === true) {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '30d' }
    );
    res.json({ token, userId: user.id, username: user.username });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ PROFILES ============
app.get('/api/profiles/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      `SELECT
        u.id, u.username, u.email, u.role, u.created_at, u.is_temporary,
        p.display_name, p.first_name, p.last_name, p.bio, p.age, p.gender,
        p.region, p.city, p.jamoat, p.village, p.birth_year, p.avatar_url,
        p.books_count, p.reading_time, p.followers_count, p.following_count,
        p.verified, p.blocked
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE u.id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Get profile error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/profiles', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const {
    display_name, bio, age, gender, region, city, jamoat, village, birth_year,
    first_name, last_name, avatar_url,
    username, password, email
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE profiles SET
        display_name = COALESCE($1, display_name),
        first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name),
        bio = COALESCE($4, bio),
        age = COALESCE($5, age),
        gender = COALESCE($6, gender),
        region = COALESCE($7, region),
        city = COALESCE($8, city),
        jamoat = COALESCE($9, jamoat),
        village = COALESCE($10, village),
        birth_year = COALESCE($11, birth_year),
        avatar_url = COALESCE($12, avatar_url),
        updated_at = NOW()
       WHERE user_id = $13`,
      [display_name, first_name, last_name, bio, age, gender, region, city, jamoat, village, birth_year, avatar_url, userId]
    );

    if (username) {
      const dup = await client.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [username, userId]);
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Этот логин уже занят' });
      }
      await client.query('UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2', [username, userId]);
    }

    if (email) {
      const dupEmail = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2', [email, userId]);
      if (dupEmail.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Ин почта аллакай истифода шудааст' });
      }
      await client.query('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [email, userId]);
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await client.query('UPDATE users SET password_hash = $1, updated_at = NOW(), is_temporary = FALSE WHERE id = $2', [passwordHash, userId]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Update profile error:', e.message);
    res.status(500).json({ error: 'Internal server error', details: e.message });
  } finally {
    client.release();
  }
});

// ============ READING SESSIONS ============
app.get('/api/reading-sessions', authenticateToken, async (req, res) => {
  const userId = req.query.user_id || req.user.id;
  try {
    const result = await pool.query(
      `SELECT id, book_id, book_title, book_author, duration, pages_read, status, rating, created_at
       FROM reading_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    const rows = result.rows.map(row => {
      let folder = 'books';
      if (row.book_id && row.book_id.includes('/')) {
        const parts = row.book_id.split('/');
        parts.pop();
        if (parts.length > 0) folder = parts.join('/');
      }
      const file = row.book_id ? row.book_id.split('/').pop() : null;
      return { ...row, folder, file };
    });
    res.json(rows);
  } catch (e) {
    console.error('Reading sessions error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/reading-sessions', authenticateToken, async (req, res) => {
  const { book_id, book_title, book_author, duration, pages_read, status, rating } = req.body;
  if (!book_id) return res.status(400).json({ error: 'book_id required' });
  try {
    let validStatus = status || 'active';
    const allowedStatuses = ['active', 'paused', 'completed', 'abandoned'];
    if (!allowedStatuses.includes(validStatus)) {
      validStatus = 'active';
    }
    await pool.query(
      `INSERT INTO reading_sessions (user_id, book_id, book_title, book_author, duration, pages_read, status, rating)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.user.id, book_id, book_title || null, book_author || null, duration || 0, pages_read || 0, validStatus, rating || null]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Insert reading session error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ FAVORITES ============
app.get('/api/favorites', authenticateToken, async (req, res) => {
  const userId = req.query.user_id || req.user.id;
  try {
    const result = await pool.query(
      `SELECT id, book_id, book_title, book_author, added_at
       FROM user_favorites
       WHERE user_id = $1
       ORDER BY added_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Favorites error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/favorites', authenticateToken, async (req, res) => {
  const { book_id, book_title, book_author } = req.body;
  if (!book_id) return res.status(400).json({ error: 'book_id required' });
  try {
    await pool.query(
      `INSERT INTO user_favorites (user_id, book_id, book_title, book_author)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, book_id) DO NOTHING`,
      [req.user.id, book_id, book_title || null, book_author || null]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Add favorite error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/favorites/*', authenticateToken, async (req, res) => {
  const bookId = req.params[0];
  try {
    await pool.query(
      `DELETE FROM user_favorites WHERE user_id = $1 AND book_id = $2`,
      [req.user.id, bookId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Remove favorite error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ ACHIEVEMENTS ============
app.get('/api/user-achievements', authenticateToken, async (req, res) => {
  res.json([]);
});

// ============ MESSAGES ============
app.get('/api/messages', authenticateToken, async (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 required' });
  try {
    const result = await pool.query(
      `SELECT id, sender_id, receiver_id, text, status, created_at
       FROM chat_messages
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY created_at ASC
       LIMIT 200`,
      [user1, user2]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Messages error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/messages', authenticateToken, async (req, res) => {
  const { receiver_id, text } = req.body;
  if (!receiver_id || !text) return res.status(400).json({ error: 'receiver_id and text required' });

  const userId = req.user.id;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const userRoleResult = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userRoleResult.rows.length > 0 && userRoleResult.rows[0].role === 'admin';
    
    let senderId = userId;
    if (isAdmin) {
      const adminId = await getAdminAccountId();
      if (adminId) {
        senderId = adminId;
        console.log(`[MESSAGE] Отправка от официального аккаунта (${adminId})`);
      } else {
        console.error('[MESSAGE] Официальный аккаунт не найден');
        return res.status(500).json({ error: 'Официальный аккаунт не найден' });
      }
    }

    if (isAdmin && senderId) {
      const friendCheck = await pool.query(
        `SELECT id FROM friendships WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
        [senderId, receiver_id]
      );
      if (friendCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO friendships (user1_id, user2_id, status) VALUES ($1, $2, 'accepted')`,
          [senderId, receiver_id]
        );
        console.log(`[MESSAGE] Добавлены в друзья: ${senderId} <-> ${receiver_id}`);
      }
    }

    const adminId = await getAdminAccountId();
    if (adminId && String(receiver_id) === String(adminId)) {
      const statusCheck = await pool.query(
        'SELECT is_open FROM chat_admin_status WHERE user_id = $1',
        [userId]
      );
      const isOpen = statusCheck.rows.length === 0 ? true : statusCheck.rows[0].is_open;
      if (!isOpen) {
        return res.status(403).json({
          error: 'Чат с поддержкой закрыт. Если нужна новая консультация, напишите через «Связаться с нами».'
        });
      }
    }

    let wordCount = 0;
    if (!isAdmin) {
      const wordCountResult = await pool.query(
        `SELECT word_count FROM user_daily_words WHERE user_id = $1 AND date = $2`,
        [userId, today]
      );
      let currentWords = 0;
      if (wordCountResult.rows.length > 0) {
        currentWords = parseInt(wordCountResult.rows[0].word_count);
      }
      const words = text.trim().split(/\s+/).length;
      if (currentWords + words > 100) {
        return res.status(403).json({
          error: 'Лимити 100 калима дар рӯз. Шумо ' + (100 - currentWords) + ' калима боқӣ доред.'
        });
      }
      wordCount = words;
    }

    const result = await pool.query(
      `INSERT INTO chat_messages (sender_id, receiver_id, text)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, receiver_id, text, status, created_at`,
      [senderId, receiver_id, text]
    );
    console.log('[MESSAGE] Сообщение сохранено:', result.rows[0]);

    const senderUser = await pool.query(
      `SELECT username, display_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [userId]
    );
    const senderName = senderUser.rows[0]?.display_name || senderUser.rows[0]?.username || 'Китобхона';
    const shortText = String(text).replace(/\s+/g, ' ').trim().slice(0, 60);

    if (receiver_id && String(receiver_id) !== String(userId)) {
      await sendPushToUsers([receiver_id], {
        title: 'Новое сообщение',
        body: `${senderName}: ${shortText || 'Новое сообщение'}`,
        link: '/chats.html',
        data: { type: 'chat_message', sender_id: String(userId), receiver_id: String(receiver_id) }
      });
    }

    if (!isAdmin && wordCount > 0) {
      const wordCountResult = await pool.query(
        `SELECT word_count FROM user_daily_words WHERE user_id = $1 AND date = $2`,
        [userId, today]
      );
      if (wordCountResult.rows.length > 0) {
        await pool.query(
          `UPDATE user_daily_words SET word_count = word_count + $1 WHERE user_id = $2 AND date = $3`,
          [wordCount, userId, today]
        );
      } else {
        await pool.query(
          `INSERT INTO user_daily_words (user_id, date, word_count) VALUES ($1, $2, $3)`,
          [userId, today, wordCount]
        );
      }
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error('Send message error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/daily-words', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const result = await pool.query(
      `SELECT word_count FROM user_daily_words WHERE user_id = $1 AND date = $2`,
      [userId, today]
    );
    const used = result.rows.length > 0 ? parseInt(result.rows[0].word_count) : 0;
    res.json({ used, limit: 100, remaining: 100 - used });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ FRIENDS ============
app.post('/api/friends/request', authenticateToken, async (req, res) => {
  const { to_user } = req.body;
  if (!to_user) return res.status(400).json({ error: 'to_user required' });
  try {
    const existing = await pool.query(
      `SELECT id FROM friend_requests WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)`,
      [req.user.id, to_user]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Заявка уже существует' });
    }
    const friends = await pool.query(
      `SELECT id FROM friendships WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
      [req.user.id, to_user]
    );
    if (friends.rows.length > 0) {
      return res.status(409).json({ error: 'Вы уже друзья' });
    }

    await pool.query(
      `INSERT INTO friend_requests (from_user, to_user, status)
       VALUES ($1, $2, 'pending')`,
      [req.user.id, to_user]
    );

    await sendPushToUsers([to_user], {
      title: 'Новая заявка в друзья',
      body: 'Кто-то отправил вам заявку в друзья',
      link: '/profile.html',
      data: { type: 'friend_request', from_user: String(req.user.id) }
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Friend request error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  const { from_user } = req.body;
  if (!from_user) return res.status(400).json({ error: 'from_user required' });
  const userId = req.user.id;
  try {
    await pool.query('BEGIN');
    const reqCheck = await pool.query(
      `SELECT id FROM friend_requests WHERE from_user = $1 AND to_user = $2 AND status = 'pending'`,
      [from_user, userId]
    );
    if (reqCheck.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    await pool.query(
      `UPDATE friend_requests SET status = 'accepted', updated_at = NOW() WHERE from_user = $1 AND to_user = $2`,
      [from_user, userId]
    );
    await pool.query(
      `INSERT INTO friendships (user1_id, user2_id, status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT DO NOTHING`,
      [from_user, userId]
    );
    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('Friend accept error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/friends/requests/:id', authenticateToken, async (req, res) => {
  const requestId = req.params.id;
  const userId = req.user.id;
  try {
    const check = await pool.query(
      'SELECT id FROM friend_requests WHERE id = $1 AND to_user = $2',
      [requestId, userId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Заявка не найдена или не ваша' });
    }
    await pool.query('DELETE FROM friend_requests WHERE id = $1', [requestId]);
    res.json({ success: true });
  } catch (e) {
    console.error('Delete friend request error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/friends', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, p.display_name, p.avatar_url
       FROM friendships f
       JOIN users u ON (u.id = f.user1_id OR u.id = f.user2_id) AND u.id != $1
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE f.user1_id = $1 OR f.user2_id = $1`,
      [userId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Friends list error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT fr.id, fr.from_user, fr.status, fr.created_at,
        u.username, p.display_name
       FROM friend_requests fr
       JOIN users u ON u.id = fr.from_user
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE fr.to_user = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Friend requests error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ REPORTS ============
app.post('/api/reports', authenticateToken, async (req, res) => {
  const { reported_user_id, reason } = req.body;
  if (!reported_user_id || !reason) return res.status(400).json({ error: 'reported_user_id and reason required' });
  try {
    await pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, reason)
       VALUES ($1, $2, $3)`,
      [req.user.id, reported_user_id, reason]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM reports WHERE reported_user_id = $1 AND resolved = false`,
      [reported_user_id]
    );
    const count = parseInt(countResult.rows[0].count);

    if (count >= 3) {
      await pool.query(
        `UPDATE profiles SET blocked = true, block_reason = 'Автоматическая блокировка: 3 жалобы', updated_at = NOW()
         WHERE user_id = $1`,
        [reported_user_id]
      );
      console.log(`[AUTO-BLOCK] User ${reported_user_id} blocked due to 3 reports.`);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Report error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ PASSWORD RESET ============
app.post('/api/auth/check-reset-eligibility', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ error: 'Логин ё email лозим аст' });

  try {
    const result = await pool.query('SELECT id, email FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)', [identifier]);

    if (result.rows.length === 0 || !result.rows[0].email || result.rows[0].email.endsWith('@kitobkhona.tj')) {
      return res.json({ ok: true, message: 'Агар почта дуруст бошад, рамз фиристода мешавад' });
    }

    const user = result.rows[0];
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_code = $1, reset_code_expires = $2 WHERE id = $3',
      [code, expires, user.id]
    );

    await resend.emails.send({
      from: 'Kitobkhona <noreply@booktj.dedyn.io>',
      to: user.email,
      subject: 'Рамзи барқарорсозии парол',
      html: `<p>Рамзи шумо барои барқарорсозии парол: <b>${code}</b></p><p>Эътибор дорад то 10 дақиқа.</p>`
    });

    res.json({ ok: true, message: 'Рамз ба почта фиристода шуд' });
  } catch (e) {
    console.error('check-reset-eligibility error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { identifier, code, newPassword } = req.body;
  if (!identifier || !code || !newPassword) return res.status(400).json({ error: 'Ҳамаи майдонҳо лозиманд' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      'SELECT id, reset_code, reset_code_expires FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [identifier]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const user = userResult.rows[0];

    if (!user.reset_code || user.reset_code !== code || new Date() > new Date(user.reset_code_expires)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Рамз нодуруст ё мӯҳлаташ гузаштааст' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW(), is_temporary = FALSE,
       reset_code = NULL, reset_code_expires = NULL WHERE id = $2`,
      [passwordHash, user.id]
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Reset error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ==============================================================
// ============ ADMIN, POSTS, LIKES, COMMENTS ============
// ==============================================================

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id, u.username, u.email, u.role, u.is_temporary, u.created_at, u.updated_at,
        p.display_name, p.first_name, p.last_name, p.birth_year, p.gender,
        p.region, p.city, p.jamoat, p.village, p.avatar_url,
        p.books_count, p.reading_time, p.followers_count, p.verified, p.blocked
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
      LIMIT 500
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Admin list error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users/:userId/verify', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const result = await pool.query(
      `UPDATE profiles SET verified = NOT verified, updated_at = NOW()
       WHERE user_id = $1
       RETURNING verified`,
      [userId]
    );
    if (result.rows.length === 0) {
      await pool.query(
        `INSERT INTO profiles (user_id, verified) VALUES ($1, true)
         ON CONFLICT (user_id) DO UPDATE SET verified = true, updated_at = NOW()`,
        [userId]
      );
      return res.json({ success: true, verified: true });
    }
    res.json({ success: true, verified: result.rows[0].verified });
  } catch (e) {
    console.error('Verify error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users/:userId/reset-password', requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW(), is_temporary = FALSE WHERE id = $2`,
      [passwordHash, req.params.userId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Admin reset password error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users/:userId/block', requireAdmin, async (req, res) => {
  try {
    const user = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.userId]);
    if (user.rows.length > 0 && user.rows[0].role === 'admin') {
      return res.status(403).json({ error: 'Нельзя заблокировать администратора' });
    }
    await pool.query('UPDATE profiles SET blocked = TRUE, updated_at = NOW() WHERE user_id = $1', [req.params.userId]);
    res.json({ success: true });
  } catch (e) {
    console.error('Block error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users/:userId/unblock', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE profiles SET blocked = FALSE, updated_at = NOW() WHERE user_id = $1', [req.params.userId]);
    res.json({ success: true });
  } catch (e) {
    console.error('Unblock error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users/:userId/block-temporary', requireAdmin, async (req, res) => {
  const { days } = req.body;
  if (!days || days < 1 || days > 365) return res.status(400).json({ error: 'days 1-365' });
  try {
    const user = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.userId]);
    if (user.rows.length > 0 && user.rows[0].role === 'admin') {
      return res.status(403).json({ error: 'Нельзя заблокировать администратора' });
    }
    const until = new Date();
    until.setDate(until.getDate() + parseInt(days));
    await pool.query(
      `UPDATE profiles SET blocked = TRUE, block_until = $1, block_reason = $2, updated_at = NOW() WHERE user_id = $3`,
      [until.toISOString(), req.body.reason || 'Блокировка админом', req.params.userId]
    );
    res.json({ success: true, block_until: until.toISOString(), days: days });
  } catch (e) {
    console.error('Temp block error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/users/:userId', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM profiles WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM reading_sessions WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM user_favorites WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM user_achievements WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM friend_requests WHERE from_user = $1 OR to_user = $1', [req.params.userId]);
    await client.query('DELETE FROM friendships WHERE user1_id = $1 OR user2_id = $1', [req.params.userId]);
    await client.query('DELETE FROM chat_messages WHERE sender_id = $1 OR receiver_id = $1', [req.params.userId]);
    await client.query('DELETE FROM reports WHERE reporter_id = $1 OR reported_user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM posts WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM player_progress WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM users WHERE id = $1', [req.params.userId]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Delete user error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.get('/api/admin/blocked', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.created_at,
        p.display_name, p.blocked, p.city
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE p.blocked = TRUE
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Blocked list error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/reports', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.id, r.reporter_id, r.reported_user_id, r.reason, r.status, r.created_at, r.resolved_at,
        ur.username as reporter_username,
        ud.username as reported_username,
        pr.display_name as reporter_name,
        pd.display_name as reported_name
      FROM reports r
      LEFT JOIN users ur ON r.reporter_id = ur.id
      LEFT JOIN users ud ON r.reported_user_id = ud.id
      LEFT JOIN profiles pr ON ur.id = pr.user_id
      LEFT JOIN profiles pd ON ud.id = pd.user_id
      ORDER BY r.created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Reports error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/reports/:id/resolve', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE reports SET status = $1, resolved_at = NOW() WHERE id = $2', ['resolved', req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Resolve report error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ POSTS ============
// ==============================================================
app.get('/api/posts', async (req, res) => {
  const userId = req.query.user_id;
  let currentUserId = null;
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
      currentUserId = decoded.id;
    } catch (e) {}
  }
  try {
    let query = `
      SELECT p.id, p.user_id, p.content, p.book_id, p.book_title, p.book_author, p.likes_count, p.comments_count, p.created_at,
        u.username, pr.display_name, pr.avatar_url,
        EXISTS (SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) AS liked
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN profiles pr ON pr.user_id = p.user_id
      WHERE p.visibility = 'public'
    `;
    const params = [currentUserId || null];
    if (userId) {
      query += ` AND p.user_id = $2`;
      params.push(userId);
    }
    query += ` ORDER BY p.created_at DESC LIMIT 50`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error('Posts error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/posts', authenticateToken, async (req, res) => {
  const { content, book_id, book_title, book_author, visibility } = req.body;
  if (!content && !book_id) return res.status(400).json({ error: 'content or book_id required' });
  try {
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, book_id, book_title, book_author, visibility)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [req.user.id, content || '', book_id || null, book_title || null, book_author || null, visibility || 'public']
    );
    res.json({ success: true, id: result.rows[0].id, created_at: result.rows[0].created_at });
  } catch (e) {
    console.error('Post error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  try {
    const check = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (check.rows[0].user_id !== userId) return res.status(403).json({ error: 'Not your post' });
    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
    res.json({ success: true });
  } catch (e) {
    console.error('Delete post error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ POSTS LIKES ============
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
      await pool.query('UPDATE posts SET likes_count = likes_count - 1 WHERE id = $1', [postId]);
      const newCount = await pool.query('SELECT likes_count FROM posts WHERE id = $1', [postId]);
      res.json({ liked: false, likes_count: parseInt(newCount.rows[0].likes_count) });
    } else {
      await pool.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [postId, userId]);
      await pool.query('UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1', [postId]);
      const newCount = await pool.query('SELECT likes_count FROM posts WHERE id = $1', [postId]);
      res.json({ liked: true, likes_count: parseInt(newCount.rows[0].likes_count) });
    }
  } catch (e) {
    console.error('Like error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ POSTS COMMENTS ============
app.get('/api/posts/:id/comments', authenticateToken, async (req, res) => {
  const postId = req.params.id;
  try {
    const result = await pool.query(
      `SELECT c.id, c.text, c.created_at, u.id as user_id, u.username, pr.display_name
       FROM post_comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN profiles pr ON u.id = pr.user_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC
       LIMIT 50`,
      [postId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Get comments error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/posts/:id/comment', authenticateToken, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const result = await pool.query(
      `INSERT INTO post_comments (post_id, user_id, text) VALUES ($1, $2, $3) RETURNING id, text, created_at`,
      [postId, userId, text]
    );
    await pool.query('UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1', [postId]);
    const comment = result.rows[0];
    const userData = await pool.query(
      `SELECT u.username, pr.display_name FROM users u LEFT JOIN profiles pr ON u.id = pr.user_id WHERE u.id = $1`,
      [userId]
    );
    res.json({
      ...comment,
      user_id: userId,
      username: userData.rows[0].username,
      display_name: userData.rows[0].display_name
    });
  } catch (e) {
    console.error('Add comment error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ CHECK PUBLISHED ============
// ==============================================================
app.get('/api/posts/check-published', authenticateToken, async (req, res) => {
  const { book_id } = req.query;
  if (!book_id) return res.status(400).json({ error: 'book_id required' });
  try {
    const result = await pool.query(
      `SELECT id FROM posts WHERE user_id = $1 AND book_id = $2`,
      [req.user.id, book_id]
    );
    res.json({ published: result.rows.length > 0 });
  } catch (e) {
    console.error('Check published error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ BOOK REACTIONS ============
// ==============================================================

app.get('/api/book-reactions/:bookId', authenticateToken, async (req, res) => {
  const { bookId } = req.params;
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT reaction, rating FROM book_reactions WHERE user_id = $1 AND book_id = $2`,
      [userId, bookId]
    );
    if (result.rows.length === 0) {
      return res.json({ reaction: null, rating: null });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Get book reaction error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/book-stats/:bookId', async (req, res) => {
  const { bookId } = req.params;
  try {
    const stats = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE reaction = 'like') AS likes,
        COUNT(*) FILTER (WHERE reaction = 'love') AS loves,
        COUNT(*) FILTER (WHERE reaction = 'dislike') AS dislikes,
        AVG(rating) FILTER (WHERE rating > 0) AS avg_rating,
        COUNT(rating) FILTER (WHERE rating > 0) AS ratings_count
       FROM book_reactions
       WHERE book_id = $1`,
      [bookId]
    );
    const row = stats.rows[0];
    res.json({
      likes: parseInt(row.likes || 0),
      loves: parseInt(row.loves || 0),
      dislikes: parseInt(row.dislikes || 0),
      avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null,
      ratings_count: parseInt(row.ratings_count || 0)
    });
  } catch (e) {
    console.error('Get book stats error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/book-reactions', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { book_id, reaction, rating } = req.body;
  if (!book_id) return res.status(400).json({ error: 'book_id required' });

  if (reaction && !['like', 'love', 'dislike'].includes(reaction)) {
    return res.status(400).json({ error: 'Invalid reaction' });
  }
  if (rating !== undefined && (rating < 0 || rating > 10 || !Number.isInteger(rating))) {
    return res.status(400).json({ error: 'Rating must be integer 0-10' });
  }

  try {
    const existing = await pool.query(
      `SELECT id FROM book_reactions WHERE user_id = $1 AND book_id = $2`,
      [userId, book_id]
    );

    if (existing.rows.length > 0) {
      const updates = [];
      const params = [];
      let paramIndex = 1;
      if (reaction !== undefined) {
        updates.push(`reaction = $${paramIndex++}`);
        params.push(reaction);
      }
      if (rating !== undefined) {
        updates.push(`rating = $${paramIndex++}`);
        params.push(rating);
      }
      updates.push(`updated_at = NOW()`);
      params.push(userId, book_id);

      await pool.query(
        `UPDATE book_reactions SET ${updates.join(', ')} WHERE user_id = $${paramIndex} AND book_id = $${paramIndex + 1}`,
        params
      );
    } else {
      await pool.query(
        `INSERT INTO book_reactions (user_id, book_id, reaction, rating)
         VALUES ($1, $2, $3, $4)`,
        [userId, book_id, reaction || null, rating || null]
      );
    }

    const stats = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE reaction = 'like') AS likes,
        COUNT(*) FILTER (WHERE reaction = 'love') AS loves,
        COUNT(*) FILTER (WHERE reaction = 'dislike') AS dislikes,
        AVG(rating) FILTER (WHERE rating > 0) AS avg_rating,
        COUNT(rating) FILTER (WHERE rating > 0) AS ratings_count
       FROM book_reactions
       WHERE book_id = $1`,
      [book_id]
    );
    const row = stats.rows[0];
    res.json({
      likes: parseInt(row.likes || 0),
      loves: parseInt(row.loves || 0),
      dislikes: parseInt(row.dislikes || 0),
      avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null,
      ratings_count: parseInt(row.ratings_count || 0)
    });
  } catch (e) {
    console.error('Save book reaction error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/book-reactions/batch', authenticateToken, async (req, res) => {
  const { book_ids } = req.body;
  if (!book_ids || !Array.isArray(book_ids) || book_ids.length === 0) {
    return res.json({ stats: {}, user_reactions: {} });
  }
  const userId = req.user.id;
  try {
    const statsResult = await pool.query(
      `SELECT 
        book_id,
        COUNT(*) FILTER (WHERE reaction = 'like') AS likes,
        COUNT(*) FILTER (WHERE reaction = 'love') AS loves,
        COUNT(*) FILTER (WHERE reaction = 'dislike') AS dislikes,
        AVG(rating) FILTER (WHERE rating > 0) AS avg_rating,
        COUNT(rating) FILTER (WHERE rating > 0) AS ratings_count
       FROM book_reactions
       WHERE book_id = ANY($1)
       GROUP BY book_id`,
      [book_ids]
    );
    const stats = {};
    statsResult.rows.forEach(row => {
      stats[row.book_id] = {
        likes: parseInt(row.likes || 0),
        loves: parseInt(row.loves || 0),
        dislikes: parseInt(row.dislikes || 0),
        avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null,
        ratings_count: parseInt(row.ratings_count || 0)
      };
    });
    const userResult = await pool.query(
      `SELECT book_id, reaction, rating FROM book_reactions
       WHERE user_id = $1 AND book_id = ANY($2)`,
      [userId, book_ids]
    );
    const userReactions = {};
    userResult.rows.forEach(row => {
      userReactions[row.book_id] = { reaction: row.reaction, rating: row.rating };
    });
    res.json({ stats, user_reactions: userReactions });
  } catch (e) {
    console.error('Batch reactions error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ WINNERS ============
// ==============================================================
app.get('/api/winners', async (req, res) => {
  const period = req.query.period || 'all';
  let dateFilter = '';
  if (period === 'week') {
    dateFilter = `AND rs.created_at > NOW() - INTERVAL '7 days'`;
  } else if (period === 'month') {
    dateFilter = `AND rs.created_at > NOW() - INTERVAL '30 days'`;
  } else {
    dateFilter = '';
  }

  try {
    const topQuery = `
      WITH user_stats AS (
        SELECT 
          u.id,
          u.username,
          p.display_name,
          p.first_name,
          p.last_name,
          p.avatar_url,
          p.city,
          p.region,
          p.gender,
          p.birth_year,
          COALESCE(SUM(rs.duration) / 60, 0) AS total_hours,
          COUNT(DISTINCT rs.book_id) AS total_books
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        LEFT JOIN reading_sessions rs ON u.id = rs.user_id
        WHERE 1=1 ${dateFilter}
        GROUP BY u.id, u.username, p.display_name, p.first_name, p.last_name, p.avatar_url, p.city, p.region, p.gender, p.birth_year
      )
      SELECT * FROM user_stats
      ORDER BY total_hours DESC, total_books DESC
    `;
    const result = await pool.query(topQuery);
    const allUsers = result.rows;

    const top3 = allUsers.slice(0, 3);
    const top100 = allUsers.slice(3, 103);

    res.json({ top3, top100 });
  } catch (e) {
    console.error('Winners error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ HIDDEN BOOKS (Supabase) ============
// ==============================================================
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_URL = 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1';

async function supabaseFetch(path, opts = {}) {
  const url = SUPABASE_URL + path;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  try {
    const res = await fetch(url, { ...opts, headers });
    if (!res.ok) {
      const text = await res.text();
      console.error('[Supabase] Error response:', res.status, text);
      throw new Error(`Supabase error: ${res.status} ${text}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    } else {
      console.warn('[Supabase] Response is not JSON, returning empty');
      return [];
    }
  } catch (e) {
    console.error('[Supabase] Fetch error:', e.message);
    throw e;
  }
}

app.post('/api/hidden-books', authenticateToken, async (req, res) => {
  const { book_id } = req.body;
  if (!book_id) return res.status(400).json({ error: 'book_id required' });
  try {
    await supabaseFetch('/hidden_books', {
      method: 'POST',
      body: JSON.stringify({ user_id: req.user.id, book_id })
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Add hidden book error:', e.message);
    res.status(500).json({ error: 'Failed to hide book: ' + e.message });
  }
});

app.delete('/api/hidden-books/:bookId', authenticateToken, async (req, res) => {
  try {
    await supabaseFetch('/hidden_books?user_id=eq.' + req.user.id + '&book_id=eq.' + req.params.bookId, {
      method: 'DELETE'
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Remove hidden book error:', e.message);
    res.status(500).json({ error: 'Failed to unhide book: ' + e.message });
  }
});

app.get('/api/hidden-books', authenticateToken, async (req, res) => {
  try {
    const data = await supabaseFetch('/hidden_books?user_id=eq.' + req.user.id);
    const list = Array.isArray(data) ? data.map(row => row.book_id) : [];
    res.json(list);
  } catch (e) {
    console.error('Get hidden books error:', e.message);
    res.json([]);
  }
});

// ==============================================================
// ============ POPULAR BOOKS ============
// ==============================================================
app.get('/api/popular-books', async (req, res) => {
  const period = req.query.period || 'all';
  try {
    let dateFilter = '';
    if (period === 'day') dateFilter = "AND created_at > NOW() - INTERVAL '1 day'";
    else if (period === 'week') dateFilter = "AND created_at > NOW() - INTERVAL '7 days'";
    else if (period === 'month') dateFilter = "AND created_at > NOW() - INTERVAL '30 days'";

    const result = await pool.query(
      `SELECT book_id, book_title, book_author,
              SUM(duration) / 60 AS total_minutes,
              COUNT(*) AS sessions_count
       FROM reading_sessions
       WHERE 1=1 ${dateFilter}
       GROUP BY book_id, book_title, book_author
       ORDER BY total_minutes DESC
       LIMIT 20`
    );
    const rows = result.rows.map(row => {
      let folder = 'books';
      if (row.book_id && row.book_id.includes('/')) {
        const parts = row.book_id.split('/');
        parts.pop();
        if (parts.length > 0) folder = parts.join('/');
      }
      return { ...row, folder };
    });
    res.json(rows);
  } catch (e) {
    console.error('Popular books error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ AVATAR ============
app.post('/api/avatar', authenticateToken, async (req, res) => {
  const { avatar_data, mime_type } = req.body;
  if (!avatar_data) return res.status(400).json({ error: 'avatar_data required' });
  const sizeKB = Math.round(avatar_data.length * 0.75 / 1024);
  if (sizeKB > 250) return res.status(400).json({ error: 'Аватар слишком большой (' + sizeKB + 'KB). Макс 250KB.' });
  try {
    const url = `data:${mime_type || 'image/jpeg'};base64,${avatar_data}`;
    await pool.query(
      `UPDATE profiles SET avatar_url = $1, updated_at = NOW() WHERE user_id = $2`,
      [url, req.user.id]
    );
    res.json({ success: true, avatar_url: url });
  } catch (e) {
    console.error('Avatar error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/stats/track', async (req, res) => {
  const { book_id, action } = req.body;
  if (!book_id || !action) return res.status(400).json({ error: 'book_id and action required' });
  res.json({ success: true });
});

// ==============================================================
// ============ FEEDBACKS ============
// ==============================================================

app.post('/api/feedbacks', authenticateToken, async (req, res) => {
  const { category, message } = req.body;
  if (!category || !message) {
    return res.status(400).json({ error: 'category and message required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO feedbacks (user_id, category, message)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [req.user.id, category, message]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (e) {
    console.error('Create feedback error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/feedbacks', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.id, f.user_id, f.category, f.message, f.status, f.created_at, f.user_email,
             u.username, p.display_name
      FROM feedbacks f
      JOIN users u ON f.user_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
      ORDER BY f.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Get feedbacks error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/feedbacks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM feedbacks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Delete feedback error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/feedbacks/:id/reply', async (req, res) => {
  const { id } = req.params;
  const { reply } = req.body;
  if (!reply) return res.status(400).json({ error: 'reply required' });

  try {
    const fbResult = await pool.query('SELECT user_id FROM feedbacks WHERE id = $1', [id]);
    if (fbResult.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    const userId = fbResult.rows[0].user_id;

    let adminId = await getAdminAccountId();
    if (!adminId) {
      const sysUser = await pool.query(
        `INSERT INTO users (username, password_hash, role) VALUES ('kitobkhona_admin', 'system', 'admin') RETURNING id`
      );
      adminId = sysUser.rows[0].id;
    }

    const friendCheck = await pool.query(
      `SELECT id FROM friendships WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
      [adminId, userId]
    );
    if (friendCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO friendships (user1_id, user2_id, status) VALUES ($1, $2, 'accepted')`,
        [adminId, userId]
      );
    }

    await pool.query(
      `INSERT INTO chat_messages (sender_id, receiver_id, text, status)
       VALUES ($1, $2, $3, 'sent')`,
      [adminId, userId, '[Китобхона] ' + reply]
    );

    await pool.query(`UPDATE feedbacks SET status = 'replied' WHERE id = $1`, [id]);

    await pool.query(
      `INSERT INTO chat_admin_status (user_id, is_open, updated_at)
       VALUES ($1, true, NOW())
       ON CONFLICT (user_id) DO UPDATE SET is_open = true, updated_at = NOW()`,
      [userId]
    );

    res.json({ success: true });
  } catch (e) {
    console.error('Reply feedback error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/support/send', authenticateToken, async (req, res) => {
  const { email, category, message, username } = req.body;
  if (!email || !message) {
    return res.status(400).json({ error: 'Email и сообщение обязательны' });
  }

  try {
    const fbResult = await pool.query(
      `INSERT INTO feedbacks (user_id, category, message, user_email)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.user.id, category, message, email]
    );

    const html = `
      <h2>Новое обращение от пользователя</h2>
      <p><strong>От:</strong> ${username || 'Пользователь'} (${email})</p>
      <p><strong>Категория:</strong> ${category}</p>
      <p><strong>Сообщение:</strong><br>${message.replace(/\n/g, '<br>')}</p>
      <p><a href="${process.env.ADMIN_URL || 'https://kitobkhona.tj/admin.html'}">Перейти в админ-панель</a></p>
    `;

    await resend.emails.send({
      from: 'Китобхона <onboarding@resend.dev>',
      to: 'kitobkhona.support@gmail.com',
      subject: `Обращение #${fbResult.rows[0].id}: ${category}`,
      html
    });

    res.json({ success: true, id: fbResult.rows[0].id });
  } catch (e) {
    console.error('Support email error:', e.message);
    res.status(500).json({ error: 'Не удалось отправить письмо: ' + e.message });
  }
});

// ==============================================================
// ============ CHAT ADMIN STATUS ============
// ==============================================================

app.get('/api/admin/chat-status/:userId', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT is_open FROM chat_admin_status WHERE user_id = $1',
      [req.params.userId]
    );
    res.json({ is_open: result.rows.length > 0 ? result.rows[0].is_open : true });
  } catch (e) {
    console.error('Get chat status error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/chat-status/:userId', requireAdmin, async (req, res) => {
  const { is_open } = req.body;
  try {
    await pool.query(
      `INSERT INTO chat_admin_status (user_id, is_open, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET is_open = EXCLUDED.is_open, updated_at = NOW()`,
      [req.params.userId, is_open]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Set chat status error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ NOTIFICATION SCHEDULE ============
// ==============================================================

app.get('/api/admin/notification-schedule', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notification_schedule WHERE id = 1');
    if (result.rows.length === 0) {
      return res.json({
        id: 1, type: 'daily', n_days: null, weekdays: null,
        time: '12:00', title: 'Китобхона', body: '', link: '/', enabled: false
      });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Get notification schedule error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/notification-schedule', requireAdmin, async (req, res) => {
  const { type, n_days, weekdays, time, title, body, link, enabled } = req.body;
  if (!['daily', 'every_n_days', 'weekly'].includes(type)) {
    return res.status(400).json({ error: 'type must be daily, every_n_days or weekly' });
  }
  try {
    await pool.query(
      `INSERT INTO notification_schedule (id, type, n_days, weekdays, time, title, body, link, enabled, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id) DO UPDATE SET
         type = EXCLUDED.type, n_days = EXCLUDED.n_days, weekdays = EXCLUDED.weekdays,
         time = EXCLUDED.time, title = EXCLUDED.title, body = EXCLUDED.body,
         link = EXCLUDED.link, enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [
        type,
        n_days || null,
        weekdays ? JSON.stringify(weekdays) : null,
        time || '12:00',
        title || 'Китобхона',
        body || '',
        link || '/',
        enabled !== undefined ? enabled : false
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Update notification schedule error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ DASHBOARD STATS ============
// ==============================================================

app.get('/api/admin/dashboard-stats', requireAdmin, async (req, res) => {
  try {
    const growth = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS new_today,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 month') AS new_month_1,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '3 months') AS new_month_3,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '6 months') AS new_month_6,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '9 months') AS new_month_9,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 year') AS new_year,
        COUNT(*) FILTER (WHERE is_temporary = true) AS guests,
        COUNT(*) AS total
      FROM users
    `);

    const activity = await pool.query(`
      WITH last_activity AS (
        SELECT user_id, MAX(created_at) AS last_seen
        FROM reading_sessions
        GROUP BY user_id
      )
      SELECT
        COUNT(*) FILTER (WHERE la.last_seen > NOW() - INTERVAL '7 days') AS active_users,
        COUNT(*) FILTER (WHERE la.last_seen IS NULL OR la.last_seen <= NOW() - INTERVAL '7 days') AS churned_users
      FROM users u
      LEFT JOIN last_activity la ON la.user_id = u.id
    `);

    const genderStats = await pool.query(`SELECT gender, COUNT(*) FROM profiles GROUP BY gender`);
    const genderMap = {};
    genderStats.rows.forEach(row => { genderMap[row.gender || 'unknown'] = parseInt(row.count); });

    const topLiked = await pool.query(`
      SELECT br.book_id,
        COUNT(*) FILTER (WHERE br.reaction IN ('like','love')) AS total_likes,
        (SELECT book_title FROM reading_sessions WHERE book_id = br.book_id ORDER BY created_at DESC LIMIT 1) AS book_title
      FROM book_reactions br
      GROUP BY br.book_id
      ORDER BY total_likes DESC
      LIMIT 5
    `);

    const g = growth.rows[0];
    const a = activity.rows[0];

    res.json({
      total_users: parseInt(g.total),
      guests: parseInt(g.guests),
      new_today: parseInt(g.new_today),
      new_week: parseInt(g.new_week),
      new_month_1: parseInt(g.new_month_1),
      new_month_3: parseInt(g.new_month_3),
      new_month_6: parseInt(g.new_month_6),
      new_month_9: parseInt(g.new_month_9),
      new_year: parseInt(g.new_year),
      active_users_7d: parseInt(a.active_users),
      churned_users: parseInt(a.churned_users),
      gender: {
        male: genderMap.male || 0,
        female: genderMap.female || 0,
        unknown: genderMap.unknown || 0
      },
      top_liked_books: topLiked.rows.map(r => ({
        book_id: r.book_id,
        book_title: r.book_title,
        total_likes: parseInt(r.total_likes)
      }))
    });
  } catch (e) {
    console.error('Dashboard stats error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ AGE STATS ============
// ==============================================================

app.get('/api/admin/age-stats', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        CASE
          WHEN p.birth_year IS NULL THEN 'Не указан'
          WHEN EXTRACT(YEAR FROM NOW()) - p.birth_year < 18 THEN '0-17'
          WHEN EXTRACT(YEAR FROM NOW()) - p.birth_year BETWEEN 18 AND 25 THEN '18-25'
          WHEN EXTRACT(YEAR FROM NOW()) - p.birth_year BETWEEN 26 AND 40 THEN '26-40'
          ELSE '40+'
        END AS age_group,
        COUNT(DISTINCT u.id) AS users,
        COUNT(rs.id) AS sessions,
        COALESCE(SUM(rs.duration), 0) / 60 AS total_hours
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN reading_sessions rs ON u.id = rs.user_id
      GROUP BY age_group
      ORDER BY age_group
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Age stats error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ SCHEDULER ============
// ==============================================================

async function checkNotificationSchedule() {
  try {
    const result = await pool.query('SELECT * FROM notification_schedule WHERE id = 1');
    if (result.rows.length === 0) return;
    const cfg = result.rows[0];
    if (!cfg.enabled) return;

    const now = new Date();
    const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    if (currentTime !== cfg.time) return;

    const todayStr = now.toISOString().slice(0, 10);
    const lastSent = cfg.last_sent_date ? new Date(cfg.last_sent_date).toISOString().slice(0, 10) : null;
    if (lastSent === todayStr) return;

    let shouldSend = false;
    if (cfg.type === 'daily') {
      shouldSend = true;
    } else if (cfg.type === 'weekly') {
      const weekdays = cfg.weekdays || [];
      shouldSend = weekdays.includes(now.getDay());
    } else if (cfg.type === 'every_n_days') {
      if (!lastSent) {
        shouldSend = true;
      } else {
        const diffDays = Math.floor((now - new Date(lastSent)) / (1000 * 60 * 60 * 24));
        shouldSend = diffDays >= (cfg.n_days || 1);
      }
    }
    if (!shouldSend) return;

    const users = await pool.query('SELECT id FROM users');
    const userIds = users.rows.map(r => r.id);
    if (userIds.length > 0) {
      const esc = (s) => String(s || '').replace(/'/g, "''");
      const values = userIds.map(id =>
        `('${id}', 'reminder', '${esc(cfg.title)}', '${esc(cfg.body)}', '${esc(cfg.link || '/')}')`
      ).join(',');
      await pool.query(`INSERT INTO notifications (user_id, type, title, body, link) VALUES ${values}`);
      if (firebaseMessaging) {
        await sendPushToUsers(userIds, {
          title: cfg.title || 'Китобхона',
          body: cfg.body || '',
          link: cfg.link || '/',
          data: { link: cfg.link || '/', type: 'scheduled' }
        });
      }
    }
    await pool.query('UPDATE notification_schedule SET last_sent_date = $1 WHERE id = 1', [todayStr]);
    console.log('[SCHEDULER] Уведомления отправлены всем пользователям в', currentTime);
  } catch (e) {
    console.error('[SCHEDULER] Ошибка:', e.message);
  }
}
setInterval(checkNotificationSchedule, 60 * 1000);

// ==============================================================
// ============ USER STATS (admin) ============
// ==============================================================

app.get('/api/admin/user-stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const activeWeek = await pool.query(
      `SELECT COUNT(DISTINCT user_id) FROM reading_sessions WHERE created_at > NOW() - INTERVAL '7 days'`
    );
    const newToday = await pool.query(
      `SELECT COUNT(*) FROM users WHERE created_at::date = CURRENT_DATE`
    );
    const newWeek = await pool.query(
      `SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days'`
    );
    const genderStats = await pool.query(
      `SELECT gender, COUNT(*) FROM profiles GROUP BY gender`
    );
    const genderMap = {};
    genderStats.rows.forEach(row => {
      genderMap[row.gender || 'unknown'] = parseInt(row.count);
    });

    const topBook = await pool.query(
      `SELECT book_id, book_title, COUNT(*) AS sessions, SUM(duration) AS total_time
       FROM reading_sessions
       GROUP BY book_id, book_title
       ORDER BY sessions DESC
       LIMIT 1`
    );

    res.json({
      total_users: parseInt(totalUsers.rows[0].count),
      active_week: parseInt(activeWeek.rows[0].count),
      new_today: parseInt(newToday.rows[0].count),
      new_week: parseInt(newWeek.rows[0].count),
      gender: {
        male: genderMap.male || 0,
        female: genderMap.female || 0,
        unknown: genderMap.unknown || 0
      },
      most_popular_book: topBook.rows[0] || null
    });
  } catch (e) {
    console.error('User stats error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ ANNOUNCEMENTS ============
// ==============================================================

app.get('/api/announcements/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, text, is_active, created_at, expires_at
       FROM announcements
       WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`
    );
    res.json(result.rows[0] || null);
  } catch (e) {
    console.error('Get active announcement error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/announcements', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, text, is_active, created_at, expires_at
       FROM announcements
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Get announcements error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/announcements', async (req, res) => {
  const { text, duration } = req.body;
  if (!text) return res.status(400).json({ error: 'Текст обязателен' });

  let expiresAt = null;
  if (duration && duration !== 'always') {
    const now = new Date();
    const unit = duration.slice(-1);
    const value = parseInt(duration.slice(0, -1));
    if (unit === 'h') {
      expiresAt = new Date(now.getTime() + value * 60 * 60 * 1000);
    } else if (unit === 'd') {
      expiresAt = new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    } else {
      return res.status(400).json({ error: 'Неверный формат длительности' });
    }
    expiresAt = expiresAt.toISOString();
  }

  try {
    await pool.query(`UPDATE announcements SET is_active = FALSE`);
    const result = await pool.query(
      `INSERT INTO announcements (text, is_active, expires_at)
       VALUES ($1, TRUE, $2)
       RETURNING id, text, is_active, created_at, expires_at`,
      [text, expiresAt]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Create announcement error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/announcements/:id', async (req, res) => {
  const { is_active } = req.body;
  if (is_active === undefined) return res.status(400).json({ error: 'is_active обязателен' });
  try {
    if (is_active === true) {
      await pool.query(`UPDATE announcements SET is_active = FALSE`);
      const result = await pool.query(
        `UPDATE announcements SET is_active = TRUE, expires_at = NULL WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Объявление не найдено' });
      res.json(result.rows[0]);
    } else {
      const result = await pool.query(
        `UPDATE announcements SET is_active = FALSE WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Объявление не найдено' });
      res.json(result.rows[0]);
    }
  } catch (e) {
    console.error('Update announcement error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/announcements/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Объявление не найдено' });
    res.json({ success: true });
  } catch (e) {
    console.error('Delete announcement error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ NOTIFICATIONS (для пользователей) ============
// ==============================================================

app.get('/api/notifications', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT id, type, title, body, link, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Get notifications error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Mark read error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function cleanupStaleTokens(results, tokens) {
  if (!results || !Array.isArray(results.responses)) return;
  const staleTokens = results.responses
    .map((resp, index) => ({ resp, token: tokens[index] }))
    .filter(({ resp }) => !resp.success && resp.error && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered', 'messaging/invalid-argument'].includes(resp.error.code))
    .map(({ token }) => token);
  if (staleTokens.length > 0) {
    await pool.query('DELETE FROM device_tokens WHERE token = ANY($1)', [staleTokens]);
    console.log('[FCM] Removed stale tokens:', staleTokens.length);
  }
}

async function sendPushMessagesToTokens(tokens, { title, body, link, data } = {}) {
  if (!firebaseMessaging) {
    return { success: false, error: 'FCM not initialized' };
  }
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { success: true, sent: 0 };
  }
  const message = {
    tokens,
    notification: {
      title: title || 'Китобхона',
      body: body || ''
    },
    webpush: {
      fcmOptions: { link: link || '/' },
      notification: {
        icon: '/assets/icons/icon-192.png'
      }
    },
    data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), String(v)])) : {}
  };
  const response = await firebaseMessaging.sendMulticast(message);
  await cleanupStaleTokens(response, tokens);
  return { success: true, sent: response.successCount, failed: response.failureCount };
}

async function sendPushToUsers(userIds, payload) {
  if (!Array.isArray(userIds) || userIds.length === 0) return { success: true, sent: 0 };
  const result = await pool.query(
    `SELECT token FROM device_tokens WHERE user_id = ANY($1)`,
    [userIds]
  );
  const tokens = result.rows.map(row => row.token).filter(Boolean);
  return sendPushMessagesToTokens(tokens, payload);
}

app.post('/api/push/register', authenticateToken, async (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  try {
    await pool.query(
      `INSERT INTO device_tokens (user_id, token, platform, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = NOW()`,
      [req.user.id, token, platform || null]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Register push token error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/push/register', authenticateToken, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  try {
    await pool.query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [token, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Unregister push token error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/push/send', requireAdmin, async (req, res) => {
  const { title, body, link, user_ids, data } = req.body;
  if (!title && !body) return res.status(400).json({ error: 'title or body required' });
  try {
    const users = Array.isArray(user_ids) && user_ids.length
      ? await pool.query('SELECT id FROM users WHERE id = ANY($1)', [user_ids])
      : await pool.query('SELECT id FROM users');
    const targetIds = users.rows.map(r => r.id);
    if (targetIds.length === 0) {
      return res.json({ success: true, count: 0, pushed: 0 });
    }

    const pushResult = firebaseMessaging
      ? await sendPushToUsers(targetIds, { title, body, link, data: { ...(data || {}), link: link || '/' } })
      : { success: false, sent: 0, failed: 0 };

    res.json({ success: true, count: targetIds.length, pushed: pushResult.sent || 0, failed: pushResult.failed || 0, fcm_enabled: !!firebaseMessaging });
  } catch (e) {
    console.error('Admin push send error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/notifications/send-all', authenticateToken, async (req, res) => {
  const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
  if (userCheck.rows[0].role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  const { type, title, body, link } = req.body;
  if (!body) return res.status(400).json({ error: 'Текст уведомления обязателен' });
  try {
    const users = await pool.query('SELECT id FROM users');
    const userIds = users.rows.map(r => r.id);
    if (userIds.length > 0) {
      const esc = (s) => String(s || '').replace(/'/g, "''");
      const values = userIds.map(id =>
        `('${id}', '${esc(type || 'system')}', '${esc(title || 'Китобхона')}', '${esc(body)}', '${esc(link || '/')}')`
      ).join(',');
      await pool.query(`INSERT INTO notifications (user_id, type, title, body, link) VALUES ${values}`);
    }

    const pushResult = firebaseMessaging
      ? await sendPushToUsers(userIds, { title: title || 'Китобхона', body, link, data: { link: link || '/', type: 'broadcast' } })
      : { success: false, sent: 0, failed: 0 };

    res.json({ success: true, count: userIds.length, push_sent: pushResult.sent || 0, push_failed: pushResult.failed || 0, fcm_enabled: !!firebaseMessaging });
  } catch (e) {
    console.error('Send all error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ УДАЛЕНИЕ ЧАТА (админ) ============
// ==============================================================

app.delete('/api/admin/chat/:userId', requireAdmin, async (req, res) => {
  try {
    const adminId = await getAdminAccountId();
    if (!adminId) {
      return res.status(404).json({ error: 'Официальный аккаунт не найден' });
    }
    const userId = req.params.userId;
    await pool.query(
      `DELETE FROM chat_messages
       WHERE (sender_id = $1 AND receiver_id = $2)
          OR (sender_id = $2 AND receiver_id = $1)`,
      [adminId, userId]
    );
    await pool.query(
      `DELETE FROM chat_admin_status WHERE user_id = $1`,
      [userId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Delete chat error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================================
// ============ НОВОЕ: WebSocket-сервер и LISTEN/NOTIFY ============
// ==============================================================

// Создаём HTTP-сервер из Express приложения
const server = http.createServer(app);

// WebSocket-сервер на том же порту
const wss = new WebSocket.Server({ server });

// Хранилище активных клиентов (с их user_id)
const clients = new Map(); // key: userId, value: WebSocket

// Подключение к БД для LISTEN
const listenPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setupDbNotifications() {
  try {
    const client = await listenPool.connect();
    await client.query('LISTEN cache_update_channel');
    console.log('[WS] Listening on cache_update_channel');

    client.on('notification', (msg) => {
      console.log('[WS] Received notification:', msg.payload);
      try {
        const payload = JSON.parse(msg.payload);
        // Отправляем всем подключённым клиентам
        for (const [userId, ws] of clients) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'cache_update', data: payload }));
          }
        }
      } catch (e) {
        console.error('[WS] Error processing notification:', e.message);
      }
    });

    // Поддерживаем соединение живым
    setInterval(() => {
      client.query('SELECT 1');
    }, 30000);
  } catch (e) {
    console.error('[WS] Failed to setup LISTEN:', e.message);
  }
}
setupDbNotifications();

// WebSocket-соединение
wss.on('connection', (ws, req) => {
  // Парсим токен из URL (например, ws://...?token=xxx)
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  let userId = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
      userId = decoded.id;
      clients.set(userId, ws);
      console.log(`[WS] User ${userId} connected`);
    } catch (e) {
      console.warn('[WS] Invalid token, connection closed');
      ws.close(1008, 'Invalid token');
      return;
    }
  } else {
    ws.close(1008, 'Token required');
    return;
  }

  ws.on('message', (message) => {
    // Можно обрабатывать сообщения от клиента, если нужно
    console.log('[WS] Received message from client:', message.toString());
  });

  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`[WS] User ${userId} disconnected`);
    }
  });
});

// ==============================================================
// ============ START ============
// ==============================================================

server.listen(PORT, () => {
  console.log(`✅ Kitobkhona Server running on port ${PORT}`);
});
