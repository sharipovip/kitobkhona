// ═══════════════════════════════════════════════════════════════
// Kitobkhona SOCIAL Server — Vercel / GCP Cloud Run
// Chats + Posts + Friends + Reactions
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { createClient } = require('@libsql/client');

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
// MIDDLEWARE
// ════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
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
      version: '2.0.0'
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
// MESSAGES (Chats)
// ════════════════════════════════════════════════════

app.get('/api/messages', authenticateToken, async (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 required' });
  if (String(req.user.id) !== String(user1) && String(req.user.id) !== String(user2)) {
    return res.status(403).json({ error: 'Нельзя читать чужой чат' });
  }
  try {
    // Отмечаем сообщения как прочитанные
    await tursoChats.execute({
      sql: `UPDATE chat_messages SET status = 'read'
            WHERE receiver_id = ? AND sender_id = ? AND status != 'read'`,
      args: [req.user.id, String(req.user.id) === String(user1) ? user2 : user1]
    });

    const result = await tursoChats.execute({
      sql: `SELECT * FROM chat_messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at ASC LIMIT 200`,
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
    // Проверяем дружбу
    const friendCheck = await tursoChats.execute({
      sql: `SELECT id FROM friendships
            WHERE status = 'accepted'
              AND ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
            LIMIT 1`,
      args: [req.user.id, receiver_id, receiver_id, req.user.id]
    });

    if (friendCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Барои чат аввал дӯст шудан лозим аст.' });
    }

    const result = await tursoChats.execute({
      sql: `INSERT INTO chat_messages (sender_id, receiver_id, text, status)
            VALUES (?, ?, ?, 'sent')`,
      args: [req.user.id, receiver_id, text]
    });

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    console.error('Send message error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// FRIENDS
// ════════════════════════════════════════════════════

app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const result = await tursoChats.execute({
      sql: `SELECT CASE WHEN user1_id = ? THEN user2_id ELSE user1_id END AS friend_id
            FROM friendships WHERE status = 'accepted' AND (user1_id = ? OR user2_id = ?)`,
      args: [req.user.id, req.user.id, req.user.id]
    });
    res.json(result.rows.map(r => r.friend_id));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/friends/request', authenticateToken, async (req, res) => {
  const { to_user } = req.body;
  if (!to_user) return res.status(400).json({ error: 'to_user required' });
  if (String(to_user) === String(req.user.id)) return res.status(400).json({ error: 'Нельзя добавить самого себя' });

  try {
    await tursoChats.execute({
      sql: `INSERT INTO friend_requests (from_user, to_user, status) VALUES (?, ?, 'pending')
            ON CONFLICT(from_user, to_user) DO NOTHING`,
      args: [req.user.id, to_user]
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  const { from_user } = req.body;
  if (!from_user) return res.status(400).json({ error: 'from_user required' });

  try {
    await tursoChats.execute({
      sql: `UPDATE friend_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
            WHERE from_user = ? AND to_user = ? AND status = 'pending'`,
      args: [from_user, req.user.id]
    });

    await tursoChats.execute({
      sql: `INSERT INTO friendships (user1_id, user2_id, status) VALUES (?, ?, 'accepted')
            ON CONFLICT(user1_id, user2_id) DO NOTHING`,
      args: [from_user, req.user.id]
    });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// POSTS
// ════════════════════════════════════════════════════

app.get('/api/posts', async (req, res) => {
  try {
    const result = await tursoPosts.execute({
      sql: `SELECT * FROM posts WHERE visibility = 'public'
            ORDER BY created_at DESC LIMIT 50`,
      args: []
    });
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/posts', authenticateToken, async (req, res) => {
  const { content, book_id, book_title, book_author } = req.body;
  if (!content && !book_id) return res.status(400).json({ error: 'content or book_id required' });

  try {
    const result = await tursoPosts.execute({
      sql: `INSERT INTO posts (user_id, content, book_id, book_title, book_author, visibility)
            VALUES (?, ?, ?, ?, ?, 'public')`,
      args: [req.user.id, content || '', book_id || null, book_title || null, book_author || null]
    });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// LIKES
// ════════════════════════════════════════════════════

app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.user.id;

  try {
    const existing = await tursoPosts.execute({
      sql: 'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
      args: [postId, userId]
    });

    if (existing.rows.length > 0) {
      await tursoPosts.execute({
        sql: 'DELETE FROM post_likes WHERE post_id = ? AND user_id = ?',
        args: [postId, userId]
      });
      await tursoPosts.execute({
        sql: 'UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?',
        args: [postId]
      });
      res.json({ liked: false });
    } else {
      await tursoPosts.execute({
        sql: 'INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)',
        args: [postId, userId]
      });
      await tursoPosts.execute({
        sql: 'UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?',
        args: [postId]
      });
      res.json({ liked: true });
    }
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// COMMENTS
// ════════════════════════════════════════════════════

app.get('/api/posts/:id/comments', authenticateToken, async (req, res) => {
  try {
    const result = await tursoPosts.execute({
      sql: 'SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 50',
      args: [req.params.id]
    });
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/posts/:id/comment', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id);
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const result = await tursoPosts.execute({
      sql: 'INSERT INTO post_comments (post_id, user_id, text) VALUES (?, ?, ?)',
      args: [postId, req.user.id, text]
    });
    await tursoPosts.execute({
      sql: 'UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?',
      args: [postId]
    });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// BOOK REACTIONS
// ════════════════════════════════════════════════════

app.get('/api/book-stats/:bookId', async (req, res) => {
  try {
    const result = await tursoPosts.execute({
      sql: `SELECT
              COUNT(CASE WHEN reaction = 'like' THEN 1 END) AS likes,
              COUNT(CASE WHEN reaction = 'love' THEN 1 END) AS loves,
              COUNT(CASE WHEN reaction = 'dislike' THEN 1 END) AS dislikes,
              AVG(CASE WHEN rating > 0 THEN rating END) AS avg_rating,
              COUNT(CASE WHEN rating > 0 THEN 1 END) AS ratings_count
            FROM book_reactions WHERE book_id = ?`,
      args: [req.params.bookId]
    });
    const row = result.rows[0] || {};
    res.json({
      likes: row.likes || 0,
      loves: row.loves || 0,
      dislikes: row.dislikes || 0,
      avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null,
      ratings_count: row.ratings_count || 0
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/book-reactions', authenticateToken, async (req, res) => {
  const { book_id, reaction, rating } = req.body;
  if (!book_id) return res.status(400).json({ error: 'book_id required' });

  try {
    await tursoPosts.execute({
      sql: `INSERT INTO book_reactions (user_id, book_id, reaction, rating)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, book_id) DO UPDATE SET
              reaction = COALESCE(excluded.reaction, book_reactions.reaction),
              rating = COALESCE(excluded.rating, book_reactions.rating),
              updated_at = CURRENT_TIMESTAMP`,
      args: [req.user.id, book_id, reaction || null, rating || null]
    });

    const stats = await tursoPosts.execute({
      sql: `SELECT
              COUNT(CASE WHEN reaction = 'like' THEN 1 END) AS likes,
              COUNT(CASE WHEN reaction = 'love' THEN 1 END) AS loves,
              COUNT(CASE WHEN reaction = 'dislike' THEN 1 END) AS dislikes
            FROM book_reactions WHERE book_id = ?`,
      args: [book_id]
    });

    res.json(stats.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════

app.post('/api/reports', authenticateToken, async (req, res) => {
  const { reported_user_id, reason } = req.body;
  if (!reported_user_id || !reason) return res.status(400).json({ error: 'reported_user_id and reason required' });

  try {
    await tursoPosts.execute({
      sql: 'INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES (?, ?, ?)',
      args: [req.user.id, reported_user_id, reason]
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// BLOCKS
// ════════════════════════════════════════════════════

app.post('/api/users/block', authenticateToken, async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  if (String(user_id) === String(req.user.id)) return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });

  try {
    await tursoChats.execute({
      sql: 'INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
      args: [req.user.id, user_id]
    });
    // Удаляем дружбу и заявки
    await tursoChats.execute({
      sql: 'DELETE FROM friendships WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
      args: [req.user.id, user_id, user_id, req.user.id]
    });
    res.json({ success: true, blocked: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/block-status/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await tursoChats.execute({
      sql: 'SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1',
      args: [req.user.id, req.params.userId, req.params.userId, req.user.id]
    });
    res.json({ blocked: result.rows.length > 0 });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`✅ Kitobkhona Social Server running on port ${PORT}`);
  console.log(`  Turso Chats: ${process.env.TURSO_CHATS_URL ? 'connected' : 'MISSING'}`);
  console.log(`  Turso Posts: ${process.env.TURSO_POSTS_URL ? 'connected' : 'MISSING'}`);
});
