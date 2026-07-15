-- ═══════════════════════════════════════════════════════════════
-- NEON PostgreSQL: reading, favorites, notifications, announcements
-- Размер: ~169 MB из 500 MB
-- ═══════════════════════════════════════════════════════════════

-- Сессии чтения (кто что читал)
CREATE TABLE IF NOT EXISTS reading_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  book_id TEXT NOT NULL,
  book_title TEXT,
  book_author TEXT,
  duration INTEGER DEFAULT 0,
  pages_read INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
  rating INTEGER CHECK (rating BETWEEN 0 AND 10),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Избранное (закладки)
CREATE TABLE IF NOT EXISTS user_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  book_id TEXT NOT NULL,
  book_title TEXT,
  book_author TEXT,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, book_id)
);

-- Достижения пользователей
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  achievement_type TEXT NOT NULL,
  achievement_data JSONB DEFAULT '{}',
  unlocked_at TIMESTAMP DEFAULT NOW()
);

-- Уведомления
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'general',
  title TEXT,
  body TEXT,
  link TEXT DEFAULT '/',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Объявления (admin)
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

-- Расписание уведомлений (admin)
CREATE TABLE IF NOT EXISTS notification_schedule (
  id INTEGER PRIMARY KEY DEFAULT 1,
  type TEXT DEFAULT 'daily' CHECK (type IN ('daily', 'every_n_days', 'weekly')),
  n_days INTEGER,
  weekdays JSONB,
  time TEXT DEFAULT '12:00',
  title TEXT DEFAULT 'Китобхона',
  body TEXT,
  link TEXT DEFAULT '/',
  enabled BOOLEAN DEFAULT FALSE,
  last_sent_date DATE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Уведомления о достижениях (чтобы не спамить)
CREATE TABLE IF NOT EXISTS achievement_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  position INTEGER NOT NULL,
  notified_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, period, position)
);

-- ═══ ИНДЕКСЫ (критично для производительности) ═══
CREATE INDEX IF NOT EXISTS idx_reading_sessions_user_created 
  ON reading_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_book_created 
  ON reading_sessions(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created 
  ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_active 
  ON announcements(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_daily_words 
  ON user_daily_words(user_id, date);

-- ═══ CONNNECTION POOL ═══
-- Neon автоматически подключает PgBouncer
-- В коде используйте: pool.max = 3 для экономии connections
