-- ═══════════════════════════════════════════════════════════════
-- SUPABASE: users, profiles, auth, device_tokens, feedbacks
-- Размер: ~195 MB из 500 MB
-- ═══════════════════════════════════════════════════════════════

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_temporary BOOLEAN DEFAULT FALSE,
  reset_code TEXT,
  reset_code_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Профили
CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT 'Китобхон',
  first_name TEXT,
  last_name TEXT,
  bio TEXT DEFAULT '',
  age INTEGER,
  gender TEXT CHECK (gender IN ('male', 'female', 'other') OR gender IS NULL),
  region TEXT DEFAULT '',
  city TEXT DEFAULT '',
  jamoat TEXT DEFAULT '',
  village TEXT DEFAULT '',
  birth_year INTEGER,
  avatar_url TEXT,
  books_count INTEGER DEFAULT 0,
  reading_time INTEGER DEFAULT 0,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  block_until TIMESTAMP,
  profile_edit_locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Rate limiting для auth
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  identifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  window_started TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Токены устройств для push
CREATE TABLE IF NOT EXISTS device_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Обратная связь
CREATE TABLE IF NOT EXISTS feedbacks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  user_email TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'replied', 'closed')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Лимит слов в день для чатов
CREATE TABLE IF NOT EXISTS user_daily_words (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  word_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

-- ═══ ИНДЕКСЫ ═══
CREATE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_rate_locked ON auth_rate_limits(locked_until);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status);

-- ═══ RLS ПОЛИТИКИ (для Supabase) ═══
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Чтение профилей — все могут
CREATE POLICY "profiles_select_all" ON profiles
  FOR SELECT USING (true);

-- Обновление своего профиля
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (user_id = auth.uid());
