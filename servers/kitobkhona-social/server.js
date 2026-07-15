// ═══════════════════════════════════════════════════════════════
// Kitobkhona Social Server — Render
// HTTP API (Chats, Posts, Friends, Reactions, Stats, Winners, Announcements)
// + WebSocket (Real-time чаты, уведомления, статус онлайн, typing)
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { createClient } = require('@libsql/client');
const WebSocket = require('ws');
const admin = require('firebase-admin');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;

// ════════════════════════════════════════════════════
// TURSO (SQLite) — Chats + Posts
// ════════════════════════════════════════════════════

const tursoChats = createClient({
  url: process.env.TURSO_CHATS_URL,
  authToken: process.env.TURSO_CHATS_TOKEN
});

const tursoPosts = createClient({
  url: process.env.TURSO_POSTS_URL,
  authToken: process.env.TURSO_POSTS_TOKEN
});

// JWT
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters!');
  process.exit(1);
}

// ════════════════════════════════════════════════════
// FIREBASE ADMIN (Push-уведомления)
// ════════════════════════════════════════════════════

let firebaseMessaging = null;

async function initializeFirebaseAdmin() {
  try {
    const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (firebaseServiceAccount) {
      const serviceAccount = JSON.parse(firebaseServiceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || 'kitobkhona-push'
      });
      firebaseMessaging = admin.messaging();
      console.log('[FCM] Firebase Admin SDK initialized');
    } else {
      console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT not set. Push notifications disabled.');
    }
  } catch (e) {
    console.error('[FCM] Firebase Admin init failed:', e.message);
  }
}

initializeFirebaseAdmin();

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
  legacyHeaders: false
});

app.use('/api', apiLimiter);

// ════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════

app.get('/health', async (req, res) => {
  try {
    await tursoChats.execute('SELECT 1');
    res.json({
      ok: true,
      service: 'kitobkhona-social',
      time: new Date().toISOString(),
      version: '2.0.0',
      ws_clients: wss ? wss.clients.size : 0
    });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ════════════════════════════════════════════════════

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ════════════════════════════════════════════════════

async function isUserBlockedBetween(userA, userB) {
  const result = await tursoChats.execute({
    sql: `SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1`,
    args: [userA, userB, userB, userA]
  });
  return result.rows.length > 0;
}

async function getAdminAccountId() {
  try {
    const official = await tursoChats.execute({
      sql: `SELECT id FROM users WHERE LOWER(username) = 'kitobkhona' LIMIT 1`
    });
    if (official.rows.length > 0) return official.rows[0].id;
    const result = await tursoChats.execute({
      sql: `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`
    });
    if (result.rows.length > 0) return result.rows[0].id;
  } catch (e) {
    console.error('getAdminAccountId error:', e.message);
  }
  return null;
}

function normalizeBookId(bookId) {
  return String(bookId || '').replace(/^\/+/, '').replace(/^books\//i, '');
}

// ════════════════════════════════════════════════════
// MESSAGES (Chats) — REST
// ════════════════════════════════════════════════════

app.get('/api/messages', authenticateToken, async (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 required' });
  if (String(req.user.id) !== String(user1) && String(req.user.id) !== String(user2)) {
    return res.status(403).json({ error: 'Нельзя читать чужой чат' });
  }
  try {
    await tursoChats.execute({
      sql: `UPDATE chat_messages SET status = 'read' WHERE receiver_id = ? AND sender_id = ? AND status != 'read'`,
      args: [req.user.id, String(req.user.id) === String(user1) ? user2 : user1]
    });

    const result = await tursoChats.execute({
      sql: `SELECT * FROM chat_messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY created_at ASC LIMIT 200`,
      args: [user1, user2, user2, user1]
    });
    res.json(result.rows);
  } catch (e) {
    console.error('Messages error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/messages', authenticateToken, async (req, res) => {
  const { receiver_id, text } = req.body;
  if (!receiver_id || !text) return res.status(400).json({ error: 'receiver_id and text required' });

  try {
    if (await isUserBlockedBetween(req.user.id, receiver_id)) {
      return res.status(403).json({ error: 'Нельзя отправить сообщение: пользователь заблокирован.' });
    }

    const friendCheck = await tursoChats.execute({
      sql: `SELECT id FROM friendships WHERE status = 'accepted' AND ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)) LIMIT 1`,
      args: [req.user.id, receiver_id, receiver_id, req.user.id]
    });

    if (friendCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Барои чат аввал дӯст шудан лозим аст.' });
    }

    const result = await tursoChats.execute({
      sql: `INSERT INTO chat_messages (sender_id, receiver_id, text, status) VALUES (?, ?, ?, 'sent')`,
      args: [req.user.id, receiver_id, text]
    });

    const senderUser = await tursoChats.execute({
      sql: `SELECT username, display_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`,
      args: [req.user.id]
    });
    const senderName = senderUser.rows[0]?.display_name || senderUser.rows[0]?.username || 'Китобхона';
    const senderUsername = senderUser.rows[0]?.username || '';
    const shortText = String(text).replace(/\s+/g, ' ').trim().slice(0, 60);
    const realtimeMessage = {
      ...result.rows[0],
      sender_name: senderName,
      sender_username: senderUsername
    };

    // Отправляем через WebSocket получателю
    sendWsToUser(receiver_id, {
      type: 'new_message',
      message: realtimeMessage
    });

    // Уведомление + Push
    queuePushToUsers([receiver_id], {
      title: 'Новое сообщение',
      body: `${senderName}: ${shortText || 'Новое сообщение'}`,
      link: '/chats.html',
      data: { type: 'chat_message', sender_id: String(req.user.id), receiver_id: String(receiver_id) }
    });

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    console.error('Send message error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/messages/read', authenticateToken, async (req, res) => {
  const peerId = req.body && req.body.peer_id;
  if (!peerId) return res.status(400).json({ error: 'peer_id required' });
  try {
    const result = await tursoChats.execute({
      sql: `UPDATE chat_messages SET status = 'read' WHERE receiver_id = ? AND sender_id = ? AND status IS DISTINCT FROM 'read'`,
      args: [req.user.id, peerId]
    });
    res.json({ success: true, count: result.rowsAffected || 0 });
  } catch (e) {
    console.error('Mark messages read error:', e.message);
    res.status(500).json({ error: 'Не удалось отметить сообщения прочитанными' });
  }
});

app.get('/api/chat-summary', authenticateToken, async (req, res) => {
  try {
    const result = await tursoChats.execute({
      sql: `WITH ranked AS (
         SELECT
           CASE WHEN cm.sender_id = ? THEN cm.receiver_id ELSE cm.sender_id END::text AS peer_id,
           cm.id,
           cm.sender_id::text AS sender_id,
           cm.receiver_id::text AS receiver_id,
           cm.text,
           cm.status,
           cm.created_at,
           COALESCE(sp.display_name, su.username, 'Китобхон') AS sender_name,
           COUNT(*) FILTER (WHERE cm.receiver_id = ? AND cm.status IS DISTINCT FROM 'read') OVER (
             PARTITION BY CASE WHEN cm.sender_id = ? THEN cm.receiver_id ELSE cm.sender_id END
           ) AS unread_count,
           ROW_NUMBER() OVER (
             PARTITION BY CASE WHEN cm.sender_id = ? THEN cm.receiver_id ELSE cm.sender_id END
             ORDER BY cm.created_at DESC, cm.id DESC
           ) AS row_number
         FROM chat_messages cm
         LEFT JOIN users su ON su.id = cm.sender_id
         LEFT JOIN profiles sp ON sp.user_id = cm.sender_id
         WHERE (cm.sender_id = ? OR cm.receiver_id = ?)
       )
       SELECT peer_id, id, sender_id, receiver_id, text, status, created_at, sender_name, unread_count
       FROM ranked WHERE row_number = 1 ORDER BY created_at DESC`,
      args: [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    });
    const byPeer = {};
    let totalUnread = 0;
    result.rows.forEach(row => {
      const unreadCount = parseInt(row.unread_count || 0, 10);
      totalUnread += unreadCount;
      byPeer[String(row.peer_id)] = {
        id: row.id, peer_id: String(row.peer_id), sender_id: String(row.sender_id),
        receiver_id: String(row.receiver_id), text: row.text || '', status: row.status,
        created_at: row.created_at, sender_name: row.sender_name || 'Китобхон', unread_count: unreadCount
      };
    });
    res.json({ total_unread: totalUnread, by_peer: byPeer });
  } catch (e) {
    console.error('Chat summary error:', e.message);
    res.status(500).json({ error: 'Не удалось загрузить сводку чатов' });
  }
});

// ════════════════════════════════════════════════════
// FRIENDS
// ════════════════════════════════════════════════════

app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const result = await tursoChats.execute({
      sql: `SELECT u.id, u.username, p.display_name, p.avatar_url
            FROM friendships f
            JOIN users u ON (u.id = f.user1_id OR u.id = f.user2_id) AND u.id != ?
            LEFT JOIN profiles p ON u.id = p.user_id
            WHERE (f.user1_id = ? OR f.user2_id = ?) AND f.status = 'accepted'
            AND NOT EXISTS (SELECT 1 FROM hidden_chats hc WHERE hc.user_id = ?::text AND hc.peer_id = u.id::text)`,
      args: [req.user.id, req.user.id, req.user.id, req.user.id]
    });
    res.json(result.rows);
  } catch (e) {
    console.error('Friends list error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/friends/request', authenticateToken, async (req, res) => {
  const { to_user } = req.body;
  if (!to_user) return res.status(400).json({ error: 'to_user required' });
  if (String(to_user) === String(req.user.id)) return res.status(400).json({ error: 'Нельзя добавить самого себя' });

  try {
    if (await isUserBlockedBetween(req.user.id, to_user)) {
      return res.status(403).json({ error: 'Нельзя отправить заявку: пользователь заблокирован.' });
    }
    const profileResult = await tursoChats.execute({
      sql: `SELECT first_name, last_name, gender, birth_year FROM profiles WHERE user_id = ?`,
      args: [req.user.id]
    });
    const p = profileResult.rows[0] || {};
    const complete = String(p.first_name || '').trim() && String(p.last_name || '').trim() && String(p.gender || '').trim() && p.birth_year;
    if (!complete) {
      return res.status(403).json({ code: 'PROFILE_INCOMPLETE', error: 'Барои фиристодани дархости дӯстӣ аввал профилро пур кунед.' });
    }

    const existing = await tursoChats.execute({
      sql: `SELECT id FROM friend_requests WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)`,
      args: [req.user.id, to_user, to_user, req.user.id]
    });
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Заявка уже существует' });

    const friends = await tursoChats.execute({
      sql: `SELECT id FROM friendships WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
      args: [req.user.id, to_user, to_user, req.user.id]
    });
    if (friends.rows.length > 0) return res.status(409).json({ error: 'Вы уже друзья' });

    await tursoChats.execute({
      sql: `INSERT INTO friend_requests (from_user, to_user, status) VALUES (?, ?, 'pending')`,
      args: [req.user.id, to_user]
    });

    queuePushToUsers([to_user], { title: 'Новая заявка в друзья', body: 'Кто-то отправил вам заявку в друзья', link: '/profile.html', data: { type: 'friend_request', from_user: String(req.user.id) } });
    res.json({ success: true });
  } catch (e) { console.error('Friend request error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/friends/status/:userId', authenticateToken, async (req, res) => {
  const me = req.user.id, other = req.params.userId;
  if (String(me) === String(other)) return res.json({ status: 'self' });
  try {
    const friendship = await tursoChats.execute({ sql: `SELECT id FROM friendships WHERE status = 'accepted' AND ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)) LIMIT 1`, args: [me, other, other, me] });
    if (friendship.rows.length) return res.json({ status: 'friends' });
    const outgoing = await tursoChats.execute({ sql: `SELECT id FROM friend_requests WHERE from_user = ? AND to_user = ? AND status = 'pending' LIMIT 1`, args: [me, other] });
    if (outgoing.rows.length) return res.json({ status: 'pending' });
    const incoming = await tursoChats.execute({ sql: `SELECT id FROM friend_requests WHERE from_user = ? AND to_user = ? AND status = 'pending' LIMIT 1`, args: [other, me] });
    if (incoming.rows.length) return res.json({ status: 'requested' });
    res.json({ status: null });
  } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  const { from_user } = req.body;
  if (!from_user) return res.status(400).json({ error: 'from_user required' });
  try {
    await tursoChats.execute({ sql: `UPDATE friend_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE from_user = ? AND to_user = ? AND status = 'pending'`, args: [from_user, req.user.id] });
    await tursoChats.execute({ sql: `INSERT INTO friendships (user1_id, user2_id, status) VALUES (?, ?, 'accepted') ON CONFLICT DO NOTHING`, args: [from_user, req.user.id] });
    await tursoChats.execute({ sql: `DELETE FROM hidden_chats WHERE (user_id = ? AND peer_id = ?) OR (user_id = ? AND peer_id = ?)`, args: [String(from_user), String(req.user.id), String(req.user.id), String(from_user)] });
    res.json({ success: true });
  } catch (e) { console.error('Friend accept error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/api/friends/requests/:id', authenticateToken, async (req, res) => {
  const requestId = req.params.id, userId = req.user.id;
  try {
    const check = await tursoChats.execute({ sql: 'SELECT id FROM friend_requests WHERE id = ? AND to_user = ?', args: [requestId, userId] });
    if (check.rows.length === 0) return res.status(403).json({ error: 'Заявка не найдена или не ваша' });
    await tursoChats.execute({ sql: 'DELETE FROM friend_requests WHERE id = ?', args: [requestId] });
    res.json({ success: true });
  } catch (e) { console.error('Delete friend request error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await tursoChats.execute({ sql: `SELECT fr.id, fr.from_user, fr.status, fr.created_at, u.username, p.display_name FROM friend_requests fr JOIN users u ON u.id = fr.from_user LEFT JOIN profiles p ON u.id = p.user_id WHERE fr.to_user = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`, args: [userId] });
    res.json(result.rows);
  } catch (e) { console.error('Friend requests error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ════════════════════════════════════════════════════
// POSTS
// ════════════════════════════════════════════════════

app.get('/api/posts', async (req, res) => {
  const userId = req.query.user_id;
  let currentUserId = null;
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    try { const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET); currentUserId = decoded.id; } catch (e) {}
  }
  try {
    let query = `SELECT p.id, p.user_id, p.content, p.book_id, p.book_title, p.book_author, p.likes_count, p.comments_count, p.created_at, u.username, pr.display_name, pr.avatar_url, EXISTS (SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) AS liked FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN profiles pr ON pr.user_id = p.user_id WHERE p.visibility = 'public'`;
    const params = [currentUserId || null];
    if (userId) { query += ` AND p.user_id = $2`; params.push(userId); }
    query += ` ORDER BY p.created_at DESC LIMIT 50`;
    const result = await tursoPosts.execute({ sql: query, args: params });
    const rows = result.rows.map(p => {
      const urls = getBookUrls(p.book_id);
      return { ...p, cover_url: urls.cover_url, pdf_url: urls.pdf_url };
    });
    res.json(rows);
  } catch (e) { console.error('Posts error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/posts', authenticateToken, async (req, res) => {
  const { content, book_id, book_title, book_author } = req.body;
  if (!content && !book_id) return res.status(400).json({ error: 'content or book_id required' });
  try {
    const profileResult = await tursoPosts.execute({ sql: `SELECT first_name, last_name, gender, birth_year FROM profiles WHERE user_id = ?`, args: [req.user.id] });
    const profile = profileResult.rows[0] || {};
    const missing = [];
    if (!String(profile.first_name || '').trim()) missing.push('first_name');
    if (!String(profile.last_name || '').trim()) missing.push('last_name');
    if (!String(profile.gender || '').trim()) missing.push('gender');
    if (!profile.birth_year) missing.push('birth_year');
    if (missing.length) return res.status(403).json({ code: 'PROFILE_INCOMPLETE', missing, error: 'Барои нашри пост профилро пур кунед: ном, насаб, соли таваллуд ва ҷинс.' });

    const result = await tursoPosts.execute({ sql: `INSERT INTO posts (user_id, content, book_id, book_title, book_author, visibility) VALUES (?, ?, ?, ?, ?, 'public') RETURNING id, created_at`, args: [req.user.id, content || '', book_id || null, book_title || null, book_author || null] });
    res.json({ success: true, id: result.rows[0].id, created_at: result.rows[0].created_at });
  } catch (e) { console.error('Post error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
  const postId = req.params.id, userId = req.user.id;
  try {
    const check = await tursoPosts.execute({ sql: 'SELECT user_id FROM posts WHERE id = ?', args: [postId] });
    if (check.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (check.rows[0].user_id !== userId) return res.status(403).json({ error: 'Not your post' });
    await tursoPosts.execute({ sql: 'DELETE FROM posts WHERE id = ?', args: [postId] });
    res.json({ success: true });
  } catch (e) { console.error('Delete post error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ════════════════════════════════════════════════════
// LIKES
// ════════════════════════════════════════════════════

app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id), userId = req.user.id;
  try {
    const existing = await tursoPosts.execute({ sql: 'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?', args: [postId, userId] });
    if (existing.rows.length > 0) {
      await tursoPosts.execute({ sql: 'DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', args: [postId, userId] });
      await tursoPosts.execute({ sql: 'UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?', args: [postId] });
      const newCount = await tursoPosts.execute({ sql: 'SELECT likes_count FROM posts WHERE id = ?', args: [postId] });
      res.json({ liked: false, likes_count: parseInt(newCount.rows[0].likes_count) });
    } else {
      await tursoPosts.execute({ sql: 'INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', args: [postId, userId] });
      await tursoPosts.execute({ sql: 'UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?', args: [postId] });
      const newCount = await tursoPosts.execute({ sql: 'SELECT likes_count FROM posts WHERE id = ?', args: [postId] });
      res.json({ liked: true, likes_count: parseInt(newCount.rows[0].likes_count) });
    }
  } catch (e) { console.error('Like error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ════════════════════════════════════════════════════
// COMMENTS
// ════════════════════════════════════════════════════

app.get('/api/posts/:id/comments', authenticateToken, async (req, res) => {
  try {
    const result = await tursoPosts.execute({ sql: 'SELECT c.id, c.text, c.created_at, u.id as user_id, u.username, pr.display_name FROM post_comments c JOIN users u ON c.user_id = u.id LEFT JOIN profiles pr ON u.id = pr.user_id WHERE c.post_id = ? ORDER BY c.created_at ASC LIMIT 50', args: [req.params.id] });
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/posts/:id/comment', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id), userId = req.user.id, { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const result = await tursoPosts.execute({ sql: 'INSERT INTO post_comments (post_id, user_id, text) VALUES (?, ?, ?) RETURNING id, text, created_at', args: [postId, userId, text] });
    await tursoPosts.execute({ sql: 'UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?', args: [postId] });
    const comment = result.rows[0];
    const userData = await tursoPosts.execute({ sql: `SELECT u.username, pr.display_name FROM users u LEFT JOIN profiles pr ON u.id = pr.user_id WHERE u.id = ?`, args: [userId] });
    res.json({ ...comment, user_id: userId, username: userData.rows[0].username, display_name: userData.rows[0].display_name });
  } catch (e) { console.error('Add comment error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/api/posts/:postId/comments/:commentId', authenticateToken, async (req, res) => {
  const { postId, commentId } = req.params, userId = req.user.id;
  try {
    const check = await tursoPosts.execute({ sql: 'SELECT id FROM post_comments WHERE id = ? AND user_id = ? AND post_id = ?', args: [commentId, userId, postId] });
    if (check.rows.length === 0) return res.status(403).json({ error: 'Not allowed' });
    await tursoPosts.execute({ sql: 'DELETE FROM post_comments WHERE id = ?', args: [commentId] });
    await tursoPosts.execute({ sql: 'UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = ?', args: [postId] });
    res.json({ success: true });
  } catch (e) { console.error('Delete comment error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ════════════════════════════════════════════════════
// BOOK REACTIONS
// ════════════════════════════════════════════════════
app.get('/api/book-reactions/:bookId', authenticateToken, async (req, res) => {
  const bookId = normalizeBookId(req.params.bookId), userId = req.user.id;
  try {
    const result = await tursoPosts.execute({ sql: `SELECT reaction, rating FROM book_reactions WHERE user_id = ? AND regexp_replace(book_id, '^books/', '') = $2`, args: [userId, bookId] });
    if (result.rows.length === 0) return res.json({ reaction: null, rating: null });
    res.json(result.rows[0]);
  } catch (e) { console.error('Get book reaction error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/book-stats/:bookId', async (req, res) => {
  const bookId = normalizeBookId(req.params.bookId);
  try {
    const stats = await tursoPosts.execute({ sql: `SELECT COUNT(*) FILTER (WHERE reaction = 'like') AS likes, COUNT(*) FILTER (WHERE reaction = 'love') AS loves, COUNT(*) FILTER (WHERE reaction = 'dislike') AS dislikes, AVG(rating) FILTER (WHERE rating > 0) AS avg_rating, COUNT(rating) FILTER (WHERE rating > 0) AS ratings_count FROM book_reactions WHERE regexp_replace(book_id, '^books/', '') = $1`, args: [bookId] });
    const row = stats.rows[0];
    res.json({ likes: parseInt(row.likes || 0), loves: parseInt(row.loves || 0), dislikes: parseInt(row.dislikes || 0), avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null, ratings_count: parseInt(row.ratings_count || 0) });
  } catch (e) { console.error('Get book stats error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/book-stats-batch', async (req, res) => {
  const { book_ids } = req.body;
  if (!Array.isArray(book_ids) || book_ids.length === 0) return res.json({});
  const ids = book_ids.slice(0, 200).map(normalizeBookId);
  try {
    const result = await tursoPosts.execute({ sql: `SELECT regexp_replace(book_id, '^books/', '') AS book_id, COUNT(*) FILTER (WHERE reaction = 'like') AS likes, COUNT(*) FILTER (WHERE reaction = 'love') AS loves, COUNT(*) FILTER (WHERE reaction = 'dislike') AS dislikes, AVG(rating) FILTER (WHERE rating > 0) AS avg_rating, COUNT(rating) FILTER (WHERE rating > 0) AS ratings_count FROM book_reactions WHERE regexp_replace(book_id, '^books/', '') = ANY($1) GROUP BY regexp_replace(book_id, '^books/', '')`, args: [ids] });
    const stats = {};
    result.rows.forEach(row => { stats[row.book_id] = { likes: parseInt(row.likes || 0), loves: parseInt(row.loves || 0), dislikes: parseInt(row.dislikes || 0), avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null, ratings_count: parseInt(row.ratings_count || 0) }; });
    res.json(stats);
  } catch (e) { console.error('Batch book stats error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/book-reactions', authenticateToken, async (req, res) => {
  const userId = req.user.id, { book_id, reaction, rating } = req.body;
  if (!book_id) return res.status(400).json({ error: 'book_id required' });
  if (reaction && !['like', 'love', 'dislike'].includes(reaction)) return res.status(400).json({ error: 'Invalid reaction' });
  if (rating !== undefined && (rating < 0 || rating > 10 || !Number.isInteger(rating))) return res.status(400).json({ error: 'Rating must be integer 0-10' });

  try {
    const existing = await tursoPosts.execute({ sql: `SELECT id FROM book_reactions WHERE user_id = ? AND book_id = ?`, args: [userId, book_id] });
    if (existing.rows.length > 0) {
      const updates = [], params = [], pi = 1;
      if (reaction !== undefined) { updates.push(`reaction = $${pi++}`); params.push(reaction); }
      if (rating !== undefined) { updates.push(`rating = $${pi++}`); params.push(rating); }
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(userId, book_id);
      await tursoPosts.execute({ sql: `UPDATE book_reactions SET ${updates.join(', ')} WHERE user_id = $${pi} AND book_id = $${pi + 1}`, args: params });
    } else {
      await tursoPosts.execute({ sql: `INSERT INTO book_reactions (user_id, book_id, reaction, rating) VALUES (?, ?, ?, ?)`, args: [userId, book_id, reaction || null, rating || null] });
    }
    const stats = await tursoPosts.execute({ sql: `SELECT COUNT(*) FILTER (WHERE reaction = 'like') AS likes, COUNT(*) FILTER (WHERE reaction = 'love') AS loves, COUNT(*) FILTER (WHERE reaction = 'dislike') AS dislikes, AVG(rating) FILTER (WHERE rating > 0) AS avg_rating, COUNT(rating) FILTER (WHERE rating > 0) AS ratings_count FROM book_reactions WHERE book_id = $1`, args: [book_id] });
    const row = stats.rows[0];
    res.json({ likes: parseInt(row.likes || 0), loves: parseInt(row.loves || 0), dislikes: parseInt(row.dislikes || 0), avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null, ratings_count: parseInt(row.ratings_count || 0) });
  } catch (e) { console.error('Save book reaction error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/book-reactions/batch', authenticateToken, async (req, res) => {
  const { book_ids } = req.body, userId = req.user.id;
  if (!book_ids || !Array.isArray(book_ids) || book_ids.length === 0) return res.json({ stats: {}, user_reactions: {} });
  try {
    const statsResult = await tursoPosts.execute({ sql: `SELECT book_id, COUNT(*) FILTER (WHERE reaction = 'like') AS likes, COUNT(*) FILTER (WHERE reaction = 'love') AS loves, COUNT(*) FILTER (WHERE reaction = 'dislike') AS dislikes, AVG(rating) FILTER (WHERE rating > 0) AS avg_rating, COUNT(rating) FILTER (WHERE rating > 0) AS ratings_count FROM book_reactions WHERE book_id = ANY($1) GROUP BY book_id`, args: [book_ids] });
    const stats = {}; statsResult.rows.forEach(row => { stats[row.book_id] = { likes: parseInt(row.likes || 0), loves: parseInt(row.loves || 0), dislikes: parseInt(row.dislikes || 0), avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null, ratings_count: parseInt(row.ratings_count || 0) }; });
    const userResult = await tursoPosts.execute({ sql: `SELECT book_id, reaction, rating FROM book_reactions WHERE user_id = $1 AND book_id = ANY($2)`, args: [userId, book_ids] });
    const userReactions = {}; userResult.rows.forEach(row => { userReactions[row.book_id] = { reaction: row.reaction, rating: row.rating }; });
    res.json({ stats, user_reactions: userReactions });
  } catch (e) { console.error('Batch reactions error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ═════════════════════════════════════════════════════
// REPORTS
// ═════════════════════════════════════════════════════

app.post('/api/reports', authenticateToken, async (req, res) => {
  const { reported_user_id, reason } = req.body;
  if (!reported_user_id || !reason) return res.status(400).json({ error: 'reported_user_id and reason required' });
  try {
    await tursoPosts.execute({ sql: 'INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES (?, ?, ?)', args: [req.user.id, reported_user_id, reason] });
    const countResult = await tursoPosts.execute({ sql: `SELECT COUNT(*) FROM reports WHERE reported_user_id = $1 AND resolved = false`, args: [reported_user_id] });
    const count = parseInt(countResult.rows[0].count);
    queuePushToUsers([reported_user_id], { title: 'Шикоят', body: 'Ба шумо шикоят расид. Лутфан қоидаҳоро риоя кунед.', link: '/profile.html', data: { type: 'report' } });
    if (count >= 3) {
      await tursoPosts.execute({ sql: `UPDATE profiles SET blocked = true, block_reason = 'Автоматическая блокировка: 3 жалобы', updated_at = NOW() WHERE user_id = $1`, args: [reported_user_id] });
      console.log(`[AUTO-BLOCK] User ${reported_user_id} blocked due to 3 reports.`);
    }
    res.json({ success: true });
  } catch (e) { console.error('Report error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ═════════════════════════════════════════════════════
// BLOCKS
// ══════════════════════════════════════════════════════

app.post('/api/users/block', authenticateToken, async (req, res) => {
  const blockedId = req.body && req.body.user_id;
  if (!blockedId) return res.status(400).json({ error: 'user_id required' });
  if (String(blockedId) === String(req.user.id)) return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
  try {
    await tursoChats.execute({ sql: `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, args: [req.user.id, blockedId] });
    await tursoChats.execute({ sql: `DELETE FROM friend_requests WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)`, args: [req.user.id, blockedId, blockedId, req.user.id] });
    await tursoChats.execute({ sql: `DELETE FROM friendships WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`, args: [req.user.id, blockedId, blockedId, req.user.id] });
    res.json({ success: true, blocked: true });
  } catch (e) { console.error('Block user error:', e.message); res.status(500).json({ error: 'Не удалось заблокировать пользователя' }); }
});

app.delete('/api/users/block/:userId', authenticateToken, async (req, res) => {
  try { await tursoChats.execute('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, req.params.userId]); res.json({ success: true, blocked: false }); } catch (e) { console.error('Unblock user error:', e.message); res.status(500).json({ error: 'Не удалось разблокировать пользователя' }); }
});

app.get('/api/users/block-status/:userId', authenticateToken, async (req, res) => {
  try { const blocked = await isUserBlockedBetween(req.user.id, req.params.userId); res.json({ blocked }); } catch (e) { res.status(500).json({ error: 'Не удалось проверить блокировку' }); }
});

// ═════════════════════════════════════════════════════
// TYPING
// ══════════════════════════════════════════════════════════════════════════════════════

const typingState = new Map();

app.post('/api/typing', authenticateToken, async (req, res) => {
  const { receiver_id, typing } = req.body || {};
  if (!receiver_id) return res.status(400).json({ error: 'receiver_id required' });
  if (await isUserBlockedBetween(req.user.id, receiver_id)) return res.status(403).json({ error: 'Пользователь заблокирован' });
  const key = String(req.user.id) + ':' + String(receiver_id);
  if (typing) typingState.set(key, Date.now()); else typingState.delete(key);
  sendWsToUser(receiver_id, { type: 'typing', user_id: String(req.user.id), typing: !!typing });
  res.json({ success: true });
});

app.get('/api/typing/:userId', authenticateToken, async (req, res) => {
  const key = String(req.params.userId) + ':' + String(req.user.id);
  const timestamp = typingState.get(key) || 0;
  const active = Date.now() - timestamp < 3000;
  if (!active) typingState.delete(key);
  res.json({ typing: active });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// POPULAR BOOKS (нужен для фронтенда)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

app.get('/api/popular-books', async (req, res) => {
  const period = req.query.period || 'all';
  try {
    let dateFilter = '';
    if (period === 'day') dateFilter = "AND created_at > NOW() - INTERVAL '1 day'";
    else if (period === 'week') dateFilter = "AND created_at > NOW() - INTERVAL '7 days'";
    else if (period === 'month') dateFilter = "AND created_at > NOW() - INTERVAL '30 days'";

    const result = await tursoChats.execute({
      sql: `SELECT book_id, book_title, book_author, SUM(duration) / 60 AS total_minutes, COUNT(*) AS sessions_count FROM reading_sessions WHERE 1=1 ${dateFilter} GROUP BY book_id, book_title, book_author ORDER BY total_minutes DESC LIMIT 20`
    });
    const rows = result.rows.map(row => {
      let folder = 'books';
      if (row.book_id && row.book_id.includes('/')) { const parts = row.book_id.split('/'); parts.pop(); if (parts.length > 0) folder = parts.join('/'); }
      const urls = getBookUrls(row.book_id);
      return { ...row, folder, cover_url: urls.cover_url, pdf_url: urls.pdf_url };
    });
    res.json(rows);
  } catch (e) { console.error('Popular books error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// WINNERS (нужен для фронтенда)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

app.get('/api/winners', async (req, res) => {
  const period = req.query.period || 'all';
  let dateFilter = '';
  if (period === 'week') dateFilter = "AND rs.created_at > NOW() - INTERVAL '7 days'";
  else if (period === 'month') dateFilter = "AND rs.created_at > NOW() - INTERVAL '30 days'";

  try {
    const topQuery = `WITH user_stats AS (
        SELECT u.id, u.username, p.display_name, p.first_name, p.last_name, p.avatar_url, p.city, p.region, p.gender, p.birth_year,
          COALESCE(SUM(rs.duration) / 60, 0) AS total_hours, COUNT(DISTINCT rs.book_id) AS total_books
        FROM users u LEFT JOIN profiles p ON u.id = p.user_id LEFT JOIN reading_sessions rs ON u.id = rs.user_id
        WHERE 1=1 ${dateFilter}
        GROUP BY u.id, u.username, p.display_name, p.first_name, p.last_name, p.avatar_url, p.city, p.region, p.gender, p.birth_year
      ) SELECT * FROM user_stats ORDER BY total_hours DESC, total_books DESC LIMIT 103`;
    const result = await tursoChats.execute({ sql: topQuery });
    const allUsers = result.rows;
    const top3 = allUsers.slice(0, 3);
    const top100 = allUsers.slice(3, 103);
    await sendAchievementNotifications(top3, period);
    res.json({ top3, top100 });
  } catch (e) { console.error('Winners error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
    } catch (e) { console.error('[ACHIEVEMENT] Notification error:', e.message); }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS (нужен для фронтенда)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

app.get('/api/announcements/active', async (req, res) => {
  try {
    const result = await tursoChats.execute({ sql: `SELECT id, text, is_active, created_at, expires_at FROM announcements WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 1` });
    res.json(result.rows[0] || null);
  } catch (e) { console.error('Get active announcement error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/announcements', async (req, res) => {
  try { const result = await tursoChats.execute({ sql: `SELECT id, text, is_active, created_at, expires_at FROM announcements ORDER BY created_at DESC` }); res.json(result.rows); } catch (e) { console.error('Get announcements error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/announcements', authenticateToken, async (req, res) => {
  const { text, duration } = req.body;
  if (!text) return res.status(400).json({ error: 'Текст обязателен' });
  let expiresAt = null;
  if (duration && duration !== 'always') {
    const now = new Date(), unit = duration.slice(-1), value = parseInt(duration.slice(0, -1));
    if (unit === 'h') expiresAt = new Date(now.getTime() + value * 60 * 60 * 1000);
    else if (unit === 'd') expiresAt = new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    else return res.status(400).json({ error: 'Неверный формат длительности' });
    expiresAt = expiresAt.toISOString();
  }
  try {
    await tursoChats.execute(`UPDATE announcements SET is_active = FALSE`);
    const result = await tursoChats.execute({ sql: `INSERT INTO announcements (text, is_active, expires_at) VALUES (?, TRUE, ?) RETURNING id, text, is_active, created_at, expires_at`, args: [text, expiresAt] });
    const usersResult = await tursoChats.execute(`SELECT id FROM users WHERE id != $1`, [req.user?.id || 0]);
    const userIds = usersResult.rows.map(row => row.id);
    if (userIds.length > 0) { await queuePushToUsers(userIds, { title: 'Эълон', body: text, link: '/index.html', data: { type: 'announcement' } }); }
    res.json(result.rows[0]);
  } catch (e) { console.error('Create announcement error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// BOOK STATS BATCH (нужен для ленты)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

app.post('/api/book-stats-batch', async (req, res) => {
  const { book_ids } = req.body;
  if (!Array.isArray(book_ids) || book_ids.length === 0) return res.json({});
  const ids = book_ids.slice(0, 200).map(normalizeBookId);
  try {
    const result = await tursoPosts.execute({
      sql: `SELECT regexp_replace(book_id, '^books/', '') AS book_id, COUNT(*) FILTER (WHERE reaction = 'like') AS likes, COUNT(*) FILTER (WHERE reaction = 'love') AS loves, COUNT(*) FILTER (WHERE reaction = 'dislike') AS dislikes, AVG(rating) FILTER (WHERE rating > 0) AS avg_rating, COUNT(rating) FILTER (WHERE rating > 0) AS ratings_count FROM book_reactions WHERE regexp_replace(book_id, '^books/', '') = ANY($1) GROUP BY regexp_replace(book_id, '^books/', '')`,
      args: [ids]
    });
    const stats = {};
    result.rows.forEach(row => { stats[row.book_id] = { likes: parseInt(row.likes || 0), loves: parseInt(row.loves || 0), dislikes: parseInt(row.dislikes || 0), avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null, ratings_count: parseInt(row.ratings_count || 0) }; });
    res.json(stats);
  } catch (e) { console.error('Batch book stats error:', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

async function getBookUrls(bookId) {
  if (!bookId) return { pdf_url: null, cover_url: null };
  let clean = normalizeBookId(bookId).replace(/\.pdf$/i, '');
  const base = 'https://raw.githubusercontent.com/sharipovip/books/main';
  return { pdf_url: `${base}/books/${clean}.pdf`, cover_url: `${base}/covers/${clean}.jpg` };
}

async function sendAchievementNotifications(topUsers, period) {
  if (!topUsers || topUsers.length === 0) return;
  const positionNames = ['аввал', 'дуюм', 'сеюм'];
  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i], position = i + 1, positionName = positionNames[i];
    try {
      const existing = await tursoChats.execute({ sql: `SELECT id FROM achievement_notifications WHERE user_id = ? AND period = ? AND position = ?`, args: [user.id, period, position] });
      if (existing.rows.length === 0) {
        await tursoChats.execute({ sql: `INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'achievement', 'Табрик мекунам!', 'Шумо сазовари ҷои ' || ? || ' гаштед!', '/winners.html')`, args: [user.id, positionName] });
        queuePushToUsers([user.id], { title: 'Табрик мекунам!', body: `Шумо сазовари ҷои ${positionName} гаштед!`, link: '/winners.html', data: { type: 'achievement', position: String(position) } });
        await tursoChats.execute({ sql: `INSERT INTO achievement_notifications (user_id, period, position, notified_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`, args: [user.id, period, position] });
      }
    } catch (e) { console.error('[ACHIEVEMENT] Notification error:', e.message); }
  }
}

async function sendWsToUser(userId, payload) {
  const ws = clients.get(String(userId));
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try { ws.send(JSON.stringify(payload)); return true; } catch (e) { console.warn('[WS] Failed to send event:', e.message); return false; }
}

function queuePushToUsers(userIds, payload) { setImmediate(() => { sendPushToUsers(userIds, payload).catch(e => { console.warn('[PUSH] Background push failed:', e.message); }); }); }

async function sendPushMessagesToTokens(tokens, { title, body, link, data } = {}) {
  if (!firebaseMessaging) return { success: false, error: 'FCM not initialized' };
  if (!Array.isArray(tokens) || tokens.length === 0) return { success: true, sent: 0 };
  const message = { tokens, notification: { title: title || 'Китобхона', body: body || '' }, android: { notification: { sound: 'default', clickAction: 'FLUTTER_NOTIFICATION_CLICK' } }, webpush: { fcmOptions: { link: link || '/' }, notification: { icon: '/icon-192.png' } }, data: { title: title || 'Китобхона', body: body || '', link: link || '/', ...(data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), String(v)])) : {}) } };
  try { const response = await firebaseMessaging.sendEachForMulticast(message); await cleanupStaleTokens(response, tokens); return { success: true, sent: response.successCount, failed: response.failureCount }; } catch (e) { console.warn('[FCM] Send failed:', e.message); return { success: false, sent: 0, failed: tokens.length }; }
}

async function sendPushToUsers(userIds, payload) {
  if (!Array.isArray(userIds) || userIds.length === 0) return { success: true, sent: 0 };
  const offlineUserIds = userIds.filter(userId => !isWsUserOnline(userId));
  if (offlineUserIds.length === 0) return { success: true, sent: 0, skipped_online: userIds.length };
  try { const result = await tursoPosts.execute({ sql: `SELECT token FROM device_tokens WHERE user_id = ANY(?)`, args: [offlineUserIds] }); const tokens = result.rows.map(row => row.token).filter(Boolean); const pushResult = await sendPushMessagesToTokens(tokens, payload); return { ...pushResult, skipped_online: userIds.length - offlineUserIds.length }; } catch (e) { console.warn('[PUSH] Failed to resolve push tokens:', e.message); return { success: false, sent: 0, failed: offlineUserIds.length }; }
}

function isWsUserOnline(userId) { const ws = clients.get(String(userId)); return !!ws && ws.readyState === WebSocket.OPEN; }

async function cleanupStaleTokens(results, tokens) { if (!results || !Array.isArray(results.responses)) return; const staleTokens = results.responses.map((resp, index) => ({ resp, token: tokens[index] })).filter(({ resp }) => !resp.success && resp.error && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered', 'messaging/invalid-argument'].includes(resp.error.code)).map(({ token }) => token); if (staleTokens.length > 0) { await tursoPosts.execute('DELETE FROM device_tokens WHERE token = ANY(?)', [staleTokens]); console.log('[FCM] Removed stale tokens:', staleTokens.length); } }

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// WEBSOCKET SETUP
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  let userId = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = String(decoded.id);
      const previous = clients.get(userId);
      if (previous && previous !== ws) { try { previous.close(4001, 'Replaced by a newer connection'); } catch (e) {} }
      clients.set(userId, ws);
      ws.isAlive = true;
      ws.send(JSON.stringify({ type: 'connected', user_id: userId }));
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

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (message) => { try { const data = JSON.parse(message.toString()); if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' })); } catch (e) {} });
  ws.on('error', () => {});
  ws.on('close', () => { if (clients.get(userId) === ws) { clients.delete(userId); console.log(`[WS] User ${userId} disconnected`); } });
});

const wsHeartbeat = setInterval(() => {
  for (const [userId, ws] of clients) {
    if (ws.isAlive === false) { clients.delete(userId); try { ws.terminate(); } catch (e) {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 30000);
wsHeartbeat.unref?.();

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log(`✅ Kitobkhona Social Server running on port ${PORT}`);
  console.log(`  Turso Chats: ${process.env.TURSO_CHATS_URL ? 'connected' : 'MISSING'}`);
  console.log(`  Turso Posts: ${process.env.TURSO_POSTS_URL ? 'connected' : 'MISSING'}`);
  console.log(`  WebSocket: enabled`);
});
