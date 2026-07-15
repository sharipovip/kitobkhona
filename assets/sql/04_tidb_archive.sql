-- ═══════════════════════════════════════════════════════════════
-- TIDB CLOUD (MySQL-compatible): archive, analytics
-- Размер: ~170 MB из 5 GB
-- Базы: kitobkhona-archive и kitobkhona-analytics
-- ═══════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════
-- БАЗА: kitobkhona-archive
-- ════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS kitobkhona_archive 
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE kitobkhona_archive;

-- Архив старых сообщений (старше 90 дней)
CREATE TABLE IF NOT EXISTS chat_archive (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sender_id BIGINT NOT NULL,
  receiver_id BIGINT NOT NULL,
  text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'sent',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sender (sender_id, created_at),
  INDEX idx_receiver (receiver_id, created_at),
  INDEX idx_date (created_at)
);

-- Архив удалённых постов
CREATE TABLE IF NOT EXISTS posts_archive (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  content TEXT,
  book_id VARCHAR(500),
  book_title VARCHAR(500),
  book_author VARCHAR(500),
  visibility VARCHAR(20) DEFAULT 'public',
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  original_created_at DATETIME,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id, archived_at),
  INDEX idx_date (archived_at)
);

-- История сессий чтения (подробная)
CREATE TABLE IF NOT EXISTS reading_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  book_id VARCHAR(500) NOT NULL,
  book_title VARCHAR(500),
  book_author VARCHAR(500),
  duration INT DEFAULT 0,
  pages_read INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  rating INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_book (user_id, book_id),
  INDEX idx_date (created_at)
);

-- Логи входа (для безопасности)
CREATE TABLE IF NOT EXISTS login_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT,
  username VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  success BOOLEAN DEFAULT FALSE,
  failure_reason VARCHAR(255),
  device_fp VARCHAR(160),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id, created_at),
  INDEX idx_date (created_at),
  INDEX idx_success (success)
);

-- ════════════════════════════════════════════════════════
-- БАЗА: kitobkhona-analytics
-- ════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS kitobkhona_analytics 
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE kitobkhona_analytics;

-- Ежедневная статистика
CREATE TABLE IF NOT EXISTS daily_stats (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL UNIQUE,
  total_users BIGINT DEFAULT 0,
  new_users INT DEFAULT 0,
  active_users INT DEFAULT 0,
  messages_sent INT DEFAULT 0,
  posts_created INT DEFAULT 0,
  reading_minutes INT DEFAULT 0,
  push_sent INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Статистика книг
CREATE TABLE IF NOT EXISTS book_stats_daily (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  book_id VARCHAR(500) NOT NULL,
  views INT DEFAULT 0,
  reads INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_date_book (date, book_id(255)),
  INDEX idx_book (book_id(255)),
  INDEX idx_date (date)
);

-- Статистика пользователей по регионам
CREATE TABLE IF NOT EXISTS user_geo_stats (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  region VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  user_count INT DEFAULT 0,
  new_users INT DEFAULT 0,
  active_users INT DEFAULT 0,
  reading_minutes INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_date_region (date, region, city(100)),
  INDEX idx_date (date),
  INDEX idx_region (region)
);

-- Статистика устройств
CREATE TABLE IF NOT EXISTS device_stats (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  platform VARCHAR(20) NOT NULL,
  os_version VARCHAR(50),
  app_version VARCHAR(20),
  unique_users INT DEFAULT 0,
  sessions INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_date (date),
  INDEX idx_platform (platform)
);

-- API метрики (производительность)
CREATE TABLE IF NOT EXISTS api_metrics (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  date DATETIME NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  response_time_ms INT DEFAULT 0,
  status_code INT DEFAULT 200,
  request_count INT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_endpoint (endpoint(100), date),
  INDEX idx_date (date),
  INDEX idx_status (status_code)
);

-- Ошибки и исключения
CREATE TABLE IF NOT EXISTS error_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  date DATETIME NOT NULL,
  service VARCHAR(50) NOT NULL,
  level VARCHAR(20) DEFAULT 'error',
  message TEXT NOT NULL,
  stack_trace TEXT,
  user_id BIGINT,
  request_id VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_date (date),
  INDEX idx_service (service),
  INDEX idx_level (level)
);

-- ════════════════════════════════════════════════════════
-- ХРАНИМЫЕ ПРОЦЕДУРЫ (для автоматизации)
-- ════════════════════════════════════════════════════════

-- Процедура: перенос старых сообщений в архив (запускать раз в неделю)
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS archive_old_messages(IN days_to_keep INT)
BEGIN
  DECLARE cutoff_date DATETIME;
  SET cutoff_date = DATE_SUB(NOW(), INTERVAL days_to_keep DAY);
  
  INSERT INTO kitobkhona_archive.chat_archive 
    (sender_id, receiver_id, text, status, created_at)
  SELECT sender_id, receiver_id, text, status, created_at
  FROM chat_messages
  WHERE created_at < cutoff_date;
  
  DELETE FROM chat_messages WHERE created_at < cutoff_date;
END //
DELIMITER ;

-- Процедура: подсчёт ежедневной статистики
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS calculate_daily_stats(IN target_date DATE)
BEGIN
  INSERT INTO kitobkhona_analytics.daily_stats 
    (date, total_users, new_users, active_users, messages_sent, posts_created)
  SELECT 
    target_date,
    (SELECT COUNT(*) FROM users WHERE created_at <= target_date),
    (SELECT COUNT(*) FROM users WHERE DATE(created_at) = target_date),
    (SELECT COUNT(DISTINCT user_id) FROM reading_sessions WHERE DATE(created_at) = target_date),
    (SELECT COUNT(*) FROM chat_messages WHERE DATE(created_at) = target_date),
    (SELECT COUNT(*) FROM posts WHERE DATE(created_at) = target_date)
  ON DUPLICATE KEY UPDATE
    total_users = VALUES(total_users),
    new_users = VALUES(new_users),
    active_users = VALUES(active_users),
    messages_sent = VALUES(messages_sent),
    posts_created = VALUES(posts_created);
END //
DELIMITER ;
