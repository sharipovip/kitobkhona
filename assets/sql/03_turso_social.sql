-- ═══════════════════════════════════════════════════════════════
-- TURSO (libSQL/SQLite): chats, posts, friends, reactions
-- Размер: ~373 MB из 5 GB
-- Базы: kitobkhona-chats и kitobkhona-posts
-- ═══════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════
-- БАЗА: kitobkhona-chats
-- ════════════════════════════════════════════════════════

-- Сообщения чата
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Дружеские связи
CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user1_id INTEGER NOT NULL,
  user2_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user1_id, user2_id)
);

-- Заявки в друзья
CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user INTEGER NOT NULL,
  to_user INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_user, to_user)
);

-- Блокировки пользователей
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id INTEGER NOT NULL,
  blocked_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Скрытые чаты
CREATE TABLE IF NOT EXISTS hidden_chats (
  user_id INTEGER NOT NULL,
  peer_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, peer_id)
);

-- Статус чата с админом
CREATE TABLE IF NOT EXISTS chat_admin_status (
  user_id INTEGER PRIMARY KEY,
  is_open BOOLEAN DEFAULT TRUE,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══ ИНДЕКСЫ Turso Chats ═══
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver ON chat_messages(receiver_id, sender_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(receiver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships(user1_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships(user2_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user, status);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

-- ════════════════════════════════════════════════════════
-- БАЗА: kitobkhona-posts
-- ════════════════════════════════════════════════════════

-- Посты (лента)
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT DEFAULT '',
  book_id TEXT,
  book_title TEXT,
  book_author TEXT,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'friends', 'private')),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Лайки на посты
CREATE TABLE IF NOT EXISTS post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id)
);

-- Комментарии к постам
CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Реакции на книги
CREATE TABLE IF NOT EXISTS book_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  book_id TEXT NOT NULL,
  reaction TEXT CHECK (reaction IN ('like', 'love', 'dislike')),
  rating INTEGER CHECK (rating BETWEEN 0 AND 10),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, book_id)
);

-- Жалобы
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  reported_user_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══ ИНДЕКСЫ Turso Posts ═══
CREATE INDEX IF NOT EXISTS idx_posts_visibility_created ON posts(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_user ON post_likes(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_book_reactions_user ON book_reactions(user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_book_reactions_book ON book_reactions(book_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_user_id, resolved);

-- ════════════════════════════════════════════════════════
-- МИГРАЦИЯ ИЗ POSTGRESQL
-- ════════════════════════════════════════════════════════
-- SQLite не поддерживает: TIMESTAMPTZ, JSONB, ON CONFLICT
-- Замены:
--   TIMESTAMPTZ → DATETIME
--   JSONB → TEXT (JSON строка)
--   ON CONFLICT → INSERT OR REPLACE / ON CONFLICT DO NOTHING
--   SERIAL → INTEGER PRIMARY KEY AUTOINCREMENT
--   BOOLEAN → INTEGER (0/1)
--   NOW() → CURRENT_TIMESTAMP
