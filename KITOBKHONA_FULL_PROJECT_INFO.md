# 📘 KITOBKHONA — ПОЛНАЯ ИНФОРМАЦИЯ О ПРОЕКТЕ

> **Дата:** 2026-07-15  
> **Версия архивов:** worker.js v2.3.0, social/server.js v2.0.0-patched  
> **Архив:** `/home/user/kitobkhona-final.zip` (6.3 MB)  
> **Распакован в:** `/home/user/extracted/`

---

## 🧭 ОГЛАВЛЕНИЕ

1. [Что такое Kitobkhona](#1-что-такое-kitobkhona)
2. [Архитектура (3 сервера + фронтенд + Android)](#2-архитектура)
3. [Структура workspace](#3-структура-workspace)
4. [Сервер #1: Auth Worker (Cloudflare)](#4-auth-worker-cloudflare)
5. [Сервер #2: Social API + WebSocket (Render)](#5-social-api--websocket-render)
6. [Сервер #3: API Gateway (опциональный)](#6-api-gateway-опциональный)
7. [Фронтенд (Cloudflare Pages)](#7-фронтенд-cloudflare-pages)
8. [Android-приложение](#8-android-приложение)
9. [Базы данных](#9-базы-данных)
10. [Маршрутизация API](#10-маршрутизация-api)
11. [Переменные окружения](#11-переменные-окружения)
12. [Что уже исправлено](#12-что-уже-исправлено)
13. [Текущие ошибки и их статус](#13-текущие-ошибки-и-их-статус)
14. [Порядок деплоя](#14-порядок-деплоя)
15. [Контакты / URL](#15-контакты--url)

---

## 1. ЧТО ТАКОЕ KITOBKHONA

**Kitobkhona** (Китобхона = «Библиотека» на таджикском) — платформа для чтения и обсуждения книг на таджикском языке. Включает:

- 📚 Каталог книг (~200+ книг, PDF + обложки)
- 👥 Социальные функции (чаты, друзья, посты, реакции)
- 🏆 Рейтинг читателей (победители по часам чтения)
- 📱 PWA (можно установить как приложение) + Android APK
- 🔔 Push-уведомления через Firebase Cloud Messaging
- 🌐 Три языка интерфейса: тоҷикӣ, русский, English
- 🎨 5 тем оформления

---

## 2. АРХИТЕКТУРА

```
┌──────────────────────────────────────────────────────────────┐
│                  ФРОНТЕНД (Cloudflare Pages)                  │
│         https://kitobkhona.tojik.workers.dev                  │
│  Статика: HTML, CSS, JS, картинки, PDF-файлы через GitHub    │
│  config.js маршрутизирует API-запросы на нужный бэкенд       │
└──────┬───────────────────────────────────┬───────────────────┘
       │                                   │
       ▼                                   ▼
┌──────────────────────┐     ┌──────────────────────────────────┐
│    AUTH WORKER        │     │     SOCIAL API (Render)          │
│  Cloudflare Workers   │     │    Node.js + Express + ws       │
│  worker.js (v2.3.0)  │     │  server.js (v2.0.0-patched)     │
│  kitobkhona-auth-     │     │  kitobkhona-social.onrender.com │
│  worker.tojik.        │     │  Порт: 8080                     │
│  workers.dev          │     │  HTTP + WebSocket на одном порту│
│                       │     │                                 │
│  Регистрация/вход     │     │  Чаты (REST + WS)              │
│  Профили              │     │  Друзья                         │
│  Избранное (чтение)   │     │  Посты (лента)                  │
│  Push-токены          │     │  Реакции на книги               │
│  Админка              │     │  Популярные книги               │
│  Уведомления          │     │  Победители                     │
│                       │     │  Объявления                     │
│  БД: Supabase         │     │  БД: Turso (2 базы)             │
│  (users, profiles)    │     │  (chats + posts)                │
└──────────────────────┘     └──────────────────────────────────┘
```

**API Gateway** (gateway-worker.js) — опциональный слой. Можно задеплоить как отдельный Worker для единой точки входа, кэширования и CORS. Сейчас НЕ используется.

**WebSocket** подключается НАПРЯМУЮ к Social API: `wss://kitobkhona-social.onrender.com`

---

## 3. СТРУКТУРА WORKSPACE

```
/home/user/extracted/
├── kitobkhona/                          ← ФРОНТЕНД
│   ├── index.html                       # Главная страница
│   ├── kitobho.html                     # Каталог книг
│   ├── reader.html                      # Читалка PDF
│   ├── profile.html                     # Профиль пользователя
│   ├── login.html                       # Вход/регистрация
│   ├── admin.html                       # Админ-панель
│   ├── chat.html                        # Окно чата (1 на 1)
│   ├── chats.html                       # Список чатов
│   ├── Lenta.html                       # Лента постов
│   ├── winners.html                     # Победители
│   ├── offline.html                     # Офлайн-заглушка
│   ├── config.js          ✅ ФИНАЛ      # Конфигурация (URL API)
│   ├── cache.js                         # Клиентский кэш (CacheManager)
│   ├── sw.js              ✅ ФИНАЛ      # Service Worker + Firebase
│   ├── manifest.json                    # PWA-манифест
│   ├── books.json                       # Метаданные книг (категории)
│   ├── search-index.json                # Индекс для поиска
│   ├── quotes-data.js                   # Цитаты для главной
│   ├── assets/                          # CSS, шрифты, картинки
│   ├── data/
│   │   ├── age_groups.json              # Возрастные группы
│   │   └── tajikistan_locations.json    # Регионы Таджикистана
│   ├── hero/                            # Картинки для слайдера
│   ├── icons/                           # PWA-иконки
│   └── servers/
│       ├── cloudflare-worker/
│       │   ├── worker.js      ✅ v2.3.0 # Auth Worker (ОСНОВНОЙ)
│       │   ├── gateway-worker.js       # API Gateway (опциональный)
│       │   ├── wrangler.toml           # Конфиг Auth Worker
│       │   ├── wrangler-gateway.toml   # Конфиг Gateway
│       │   └── README.md               # Документация Workers
│       └── kitobkhona-social/
│           ├── server.js     ✅ patched # Social API + WebSocket
│           └── package.json  ✅         # Зависимости
│
└── kitobkhonaapp/                      ← ANDROID
    └── app/src/main/java/com/kitobkhona/app/
        ├── MainActivity.kt   ✅         # Основная активность
        └── MyFirebaseMessagingService.kt ✅  # Push-уведомления
```

### Удалённые файлы (мусор)
- `kitobkhona-chat/` — старый отдельный WebSocket-сервер
- `kitobkhona-auth/` — неиспользуемый GCP Cloud Run сервер
- `cloudflare-worker/server.js` — дубликат
- `cloudflare-worker/Dockerfile` — не нужен для Workers
- `firebase-messaging-sw.js` — 1 строка
- `html_studio_full.html` — тестовый
- `data/chat_rules.json` — не используется
- `data/bad_words.json` — не используется

---

## 4. AUTH WORKER (CLOUDFLARE)

### Назначение
Обрабатывает ВСЕ запросы авторизации и профилей.

### URL
```
https://kitobkhona-auth-worker.tojik.workers.dev
```

### Файл
`servers/cloudflare-worker/worker.js` (v2.3.0, ~840 строк)

### Эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/register` | Регистрация (username, password, email, display_name, is_temporary, gender) |
| POST | `/api/auth/login` | Вход (username, password) → возвращает JWT |
| POST | `/api/auth/check-reset-eligibility` | Проверка сброса пароля |
| POST | `/api/auth/reset-password` | Сброс пароля |
| DELETE | `/api/auth/delete-account` | Удаление аккаунта |
| GET | `/api/profiles/:userId` | Получить профиль (авто-создаёт если нет) |
| PUT | `/api/profiles` | Обновить профиль |
| GET | `/api/reading-sessions` | Сессии чтения |
| POST | `/api/reading-sessions` | Создать сессию чтения |
| GET | `/api/favorites` | Избранное |
| POST | `/api/favorites` | Добавить в избранное |
| GET | `/api/notifications` | Уведомления |
| POST | `/api/push/register` | Регистрация FCM-токена |
| DELETE | `/api/push/register` | Удаление FCM-токена |
| GET | `/api/admin/users` | Список пользователей (только admin) |
| GET | `/api/winners` | Победители (заглушка → []) |
| GET | `/api/popular-books` | Популярные книги (заглушка → []) |
| GET | `/api/announcements` | Объявления (заглушка → []) |
| GET | `/api/announcements/active` | Активное объявление (заглушка → null) |
| POST | `/api/feedbacks` | Обратная связь |
| POST | `/api/support/send` | Запрос в поддержку |
| GET | `/health` | Health-check |

### Как работает JWT
- Алгоритм: **HMAC-SHA256** (через Web Crypto API, не jsonwebtoken)
- Пароли хешируются: `SHA-256(password + JWT_SECRET)` → hex-строка
- Токен содержит: `{id, username, role, iat, exp}`
- Срок действия: 30 дней

### База данных: Supabase
- URL: `https://dwkdzfqooprxytlepaoo.supabase.co`
- Таблицы: `users`, `profiles`, `device_tokens`, `feedbacks`
- **Не забудьте:** `users` таблицу нужно создать вручную через SQL Editor (см. ниже)

### Переменные окружения Cloudflare

| Имя | Назначение |
|-----|------------|
| `SUPABASE_URL` | `https://dwkdzfqooprxytlepaoo.supabase.co` |
| `SUPABASE_SERVICE_KEY` | **service_role** ключ Supabase (не anon!) |
| `JWT_SECRET` | Секрет ≥32 символов (одинаковый с Render) |

### Критические особенности
- `getSupabaseClient()` находится **ВНУТРИ** try-catch каждого хендлера
- `verifyJWT()` НЕ делает throw — возвращает null при ошибке
- Профиль **авто-создаётся** если не найден (display_name = "Меҳмон")
- Хендлеры favorites/notifications/reading-sessions возвращают `[]` если таблиц нет

---

## 5. SOCIAL API + WEBSOCKET (RENDER)

### Назначение
Все социальные функции: чаты, друзья, посты, реакции, победители, объявления, популярные книги, WebSocket для real-time.

### URL
```
https://kitobkhona-social.onrender.com   (HTTP)
wss://kitobkhona-social.onrender.com     (WebSocket)
```

### Файлы
- `servers/kitobkhona-social/server.js` (~879 строк)
- `servers/kitobkhona-social/package.json`

### Зависимости
```json
{
  "express": "^4.21.0",
  "cors": "^2.8.5",
  "compression": "^1.8.1",
  "express-rate-limit": "^7.5.1",
  "jsonwebtoken": "^9.0.2",
  "@libsql/client": "^0.14.0",
  "mysql2": "^3.11.0",
  "ws": "^8.17.1",
  "firebase-admin": "^12.3.0"
}
```

### Эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/messages?user1=X&user2=Y` | История чата |
| POST | `/api/messages` | Отправить сообщение |
| POST | `/api/messages/read` | Пометить прочитанным |
| GET | `/api/chat-summary` | Сводка чатов (unread count) |
| GET | `/api/friends` | Список друзей |
| POST | `/api/friends/request` | Отправить заявку |
| POST | `/api/friends/accept` | Принять заявку |
| DELETE | `/api/friends/requests/:id` | Отклонить заявку |
| GET | `/api/friends/requests` | Входящие заявки |
| GET | `/api/friends/status/:userId` | Статус дружбы |
| GET | `/api/posts` | Лента постов |
| POST | `/api/posts` | Создать пост |
| DELETE | `/api/posts/:id` | Удалить пост |
| POST | `/api/posts/:id/like` | Лайк/дизлайк |
| GET | `/api/posts/:id/comments` | Комментарии |
| POST | `/api/posts/:id/comment` | Оставить комментарий |
| DELETE | `/api/posts/:postId/comments/:commentId` | Удалить комментарий |
| GET | `/api/book-reactions/:bookId` | Реакция пользователя на книгу |
| GET | `/api/book-stats/:bookId` | Статистика книги |
| POST | `/api/book-stats-batch` | Пакетная статистика |
| POST | `/api/book-reactions` | Поставить реакцию |
| POST | `/api/book-reactions/batch` | Пакетная загрузка реакций |
| POST | `/api/typing` | Индикатор печати |
| GET | `/api/typing/:userId` | Статус печати |
| POST | `/api/users/block` | Заблокировать |
| DELETE | `/api/users/block/:userId` | Разблокировать |
| POST | `/api/reports` | Пожаловаться |
| GET | `/api/popular-books?period=all\|week\|month` | Популярные книги |
| GET | `/api/winners?period=all\|week\|month` | Победители |
| GET | `/api/announcements` | Все объявления |
| GET | `/api/announcements/active` | Активное объявление |
| POST | `/api/announcements` | Создать объявление |
| GET | `/health` | Health-check |

### WebSocket
- Тот же порт (8080), протокол `ws`
- Аутентификация: `?token=JWT_TOKEN` в URL
- События: `new_message`, `typing`, `profile_updated`, `connected`
- Heartbeat: пинг каждые 30 секунд
- Клиенты хранятся в Map<userId, WebSocket>

### Базы данных: Turso (libSQL/SQLite)

**База 1: `kitobkhona-chats`** — таблицы:
- `chat_messages` — сообщения чата
- `friendships` — дружеские связи
- `friend_requests` — заявки в друзья
- `user_blocks` — блокировки
- `hidden_chats` — скрытые чаты
- `chat_admin_status` — статус чата с админом
- `users` — копия пользователей (для JOIN)
- `profiles` — копия профилей
- `reading_sessions` — сессии чтения (для популярных книг/победителей)
- `notifications` — уведомления
- `announcements` — объявления
- `achievement_notifications` — уведомления о достижениях
- `device_tokens` — FCM-токены

**База 2: `kitobkhona-posts`** — таблицы:
- `posts` — посты
- `post_likes` — лайки
- `post_comments` — комментарии
- `book_reactions` — реакции на книги
- `reports` — жалобы
- `device_tokens` — FCM-токены (дубликат)

### 🔴 ВАЖНО про SQL
Turso — это **SQLite**, НЕ PostgreSQL. Нельзя использовать:
- ❌ `::text` касты → удалены
- ❌ `regexp_replace()` → заменён на `LTRIM()`
- ❌ `= ANY($1)` → заменён на `IN (?,?,?)` с динамическими плейсхолдерами
- ❌ `NOW() - INTERVAL 'X days'` → заменён на `datetime('now', '-X days')`
- ✅ `FILTER (WHERE ...)` — работает в libSQL
- ✅ `COUNT(*)`, `AVG()`, `COALESCE()` — работают

### Переменные окружения Render

| Имя | Назначение |
|-----|------------|
| `TURSO_CHATS_URL` | URL базы чатов (libsql://...) |
| `TURSO_CHATS_TOKEN` | Токен Turso Chats |
| `TURSO_POSTS_URL` | URL базы постов (libsql://...) |
| `TURSO_POSTS_TOKEN` | Токен Turso Posts |
| `JWT_SECRET` | **Тот же, что в Cloudflare** |
| `FIREBASE_SERVICE_ACCOUNT` | JSON в одну строку (для push) |
| `PORT` | 8080 (авто) |

---

## 6. API GATEWAY (ОПЦИОНАЛЬНЫЙ)

### Назначение
Прокси-слой для единой точки входа и кэширования.

### Файл
`servers/cloudflare-worker/gateway-worker.js` (112 строк)

### Как работает
- Запросы к `/api/messages`, `/api/friends`, `/api/posts`, `/api/book-*`, `/api/winners`, `/api/popular-books`, `/api/announcements` → прокси на `SOCIAL_API_URL`
- Всё остальное → прокси на `AUTH_API_URL`
- WebSocket идёт МИМО Gateway

### Сейчас НЕ используется
Фронтенд обращается напрямую к Auth Worker и Social API.

---

## 7. ФРОНТЕНД (CLOUDFLARE PAGES)

### URL
```
https://kitobkhona.tojik.workers.dev
```

### config.js (ключевой файл)
```javascript
const KITOB_CONFIG = {
  API_AUTH:   'https://kitobkhona-auth-worker.tojik.workers.dev',
  API_SOCIAL: 'https://kitobkhona-social.onrender.com',
  API_WS:     'wss://kitobkhona-social.onrender.com',
  SUPABASE_REST: 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1',
  SUPABASE_KEY: 'eyJhbGci...'  // anon key
};
```

### Маршрутизация (функция `getApiUrl()`)

| Префикс пути | Куда идёт |
|---|---|
| `/api/auth`, `/api/profiles`, `/api/reading-sessions`, `/api/favorites`, `/api/notifications`, `/api/push`, `/api/admin`, `/api/feedbacks`, `/api/support` | ➡️ **API_AUTH** (Auth Worker) |
| `/api/messages`, `/api/friends`, `/api/posts`, `/api/book-*`, `/api/reports`, `/api/typing`, `/api/users/block`, `/api/chat-summary`, `/api/winners`, `/api/popular-books`, `/api/announcements` | ➡️ **API_SOCIAL** (Render) |

### Service Worker (sw.js)
- Кэширует статические файлы
- Встроен Firebase Messaging для push-уведомлений
- notificationclick открывает правильные страницы

---

## 8. ANDROID-ПРИЛОЖЕНИЕ

### Файлы
- `MainActivity.kt` — WebView с JavaScript-мостом
- `MyFirebaseMessagingService.kt` — Push-уведомления

### SITE_URL
```kotlin
const val SITE_URL = "https://kitobkhona.tojik.workers.dev/"
const val PUSH_API_URL = "https://kitobkhona-social.onrender.com/api/push/register"
```

### Исправлено
- Все жёсткие URL на `sharipovip.github.io` заменены на `SITE_URL`
- Push-токены отправляются на Social API (не на удалённый chat)
- `shouldOverrideUrlLoading` проверяет `https://kitobkhona` вместо `sharipovip.github.io`

---

## 9. БАЗЫ ДАННЫХ

| База | Тип | Где используется | Таблицы |
|------|-----|-----------------|---------|
| **Supabase** | PostgreSQL | Auth Worker | `users`, `profiles`, `device_tokens`, `feedbacks` |
| **Turso Chats** | libSQL/SQLite | Social API | `chat_messages`, `friendships`, `friend_requests`, `user_blocks`, `hidden_chats`, `reading_sessions`, `notifications`, `announcements`, `achievement_notifications`, `users`, `profiles`, `device_tokens` |
| **Turso Posts** | libSQL/SQLite | Social API | `posts`, `post_likes`, `post_comments`, `book_reactions`, `reports`, `device_tokens` |

### ⚠️ Нужно создать вручную

**Таблица `users` в Supabase** (SQL Editor → Run):
```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_temporary BOOLEAN DEFAULT FALSE,
  reset_code TEXT,
  reset_code_expires TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username));
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON users FOR ALL USING (true) WITH CHECK (true);
```

---

## 10. МАРШРУТИЗАЦИЯ API

```
/user (браузер)
    │
    ▼
https://kitobkhona.tojik.workers.dev (Cloudflare Pages — статика)
    │
    │ config.js: getApiUrl()
    │
    ├── /api/auth/* ──────────────► https://kitobkhona-auth-worker.tojik.workers.dev
    ├── /api/profiles ────────────► (Auth Worker — Cloudflare)
    ├── /api/reading-sessions ────►
    ├── /api/favorites ───────────►
    ├── /api/notifications ───────►
    ├── /api/push ────────────────►
    ├── /api/admin ───────────────►
    ├── /api/feedbacks ───────────►
    ├── /api/support ─────────────►
    │
    ├── /api/messages ────────────► https://kitobkhona-social.onrender.com
    ├── /api/friends ─────────────► (Social API — Render — Node.js)
    ├── /api/posts ───────────────►
    ├── /api/book-* ──────────────►
    ├── /api/reports ─────────────►
    ├── /api/typing ──────────────►
    ├── /api/users/block ─────────►
    ├── /api/chat-summary ────────►
    ├── /api/winners ─────────────►
    ├── /api/popular-books ───────►
    ├── /api/announcements ───────►
    │
    └── WebSocket ────────────────► wss://kitobkhona-social.onrender.com
                                    (напрямую, не через Worker)
```

---

## 11. ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

### Cloudflare Worker (Auth)

| Переменная | Значение |
|-----------|----------|
| `SUPABASE_URL` | `https://dwkdzfqooprxytlepaoo.supabase.co` |
| `SUPABASE_SERVICE_KEY` | **service_role** ключ (из Supabase Dashboard → Project Settings → API) |
| `JWT_SECRET` | Строка ≥32 символов |

### Render (Social API)

| Переменная | Значение |
|-----------|----------|
| `TURSO_CHATS_URL` | `libsql://kitobkhona-chats-...` |
| `TURSO_CHATS_TOKEN` | Токен Turso |
| `TURSO_POSTS_URL` | `libsql://kitobkhona-posts-...` |
| `TURSO_POSTS_TOKEN` | Токен Turso |
| `JWT_SECRET` | **Точно такой же как в Cloudflare!** |
| `FIREBASE_SERVICE_ACCOUNT` | JSON одной строкой |

---

## 12. ЧТО УЖЕ ИСПРАВЛЕНО

| # | Что | Файл |
|---|-----|------|
| 1 | Удалён старый WebSocket-сервер | `kitobkhona-chat/` → удалён |
| 2 | Удалён GCP Auth Server | `kitobkhona-auth/` → удалён |
| 3 | Удалены дубликаты и мусор | 7 файлов |
| 4 | Жёсткие URL в Android заменены на SITE_URL | `MainActivity.kt` |
| 5 | Push-URL в Android → Social API | `MyFirebaseMessagingService.kt` |
| 6 | Пути `/kitobkhona/` убраны из sw.js | `sw.js` |
| 7 | Жёсткие URL в HTML заменены | `admin.html`, `chat.html`, `index.html` |
| 8 | Маршрутизация winners/popular-books/announcements → Social API | `config.js` |
| 9 | `API_WS` → `wss://kitobkhona-social.onrender.com` | `config.js` |
| 10 | `API_AUTH` → `tojik.workers.dev` (не sinamostudio) | `config.js` |
| 11 | `sinamostudio` удалено из всех файлов | 3 файла |
| 12 | SQLite-совместимый синтаксис (::text, regexp_replace, NOW()) | `server.js` |
| 13 | Защита `(result.rows\|\|[])` от null | `server.js` |
| 14 | Firebase Admin инициализация | `server.js` |
| 15 | Зависимости `ws` и `firebase-admin` | `package.json` |
| 16 | Глобальный try-catch в Worker | `worker.js` |
| 17 | `getSupabaseClient` внутри try каждого хендлера | `worker.js` |
| 18 | `verifyJWT` не делает throw | `worker.js` |
| 19 | Профиль авто-создаётся если нет | `worker.js` |
| 20 | Favorites/notifications/sessions → [] если таблиц нет | `worker.js` |
| 21 | Удаление аккаунта через `/api/auth/delete-account` | `worker.js` |
| 22 | PUT профиля (upsert: PATCH → fallback POST) | `worker.js` |
| 23 | `Китобхон` → `Меҳмон` (имя гостя) | `worker.js` |
| 24 | Закрывающая `});` для winners handler | `server.js` |
| 25 | Удалён дубликат `book-stats-batch` | `server.js` |
| 26 | Удалён дубликат `normalizeBookId` | `server.js` |
| 27 | Удалён дубликат `sendAchievementNotifications` | `server.js` |
| 28 | Удалён дубликат `sendWsToUser` | `server.js` |

---

## 13. ТЕКУЩИЕ ОШИБКИ И ИХ СТАТУС

| Ошибка | Статус | Причина | Что делать |
|--------|--------|---------|------------|
| CORS error при регистрации | ✅ ИСПРАВЛЕНО | `sinamostudio.workers.dev` не существует → заменён на `tojik.workers.dev` | Фронтенд передеплоить |
| profiles/1 → 500 | ✅ ИСПРАВЛЕНО | Профиль не создавался при регистрации → авто-создание | Обновить Auth Worker |
| favorites → 500 | ✅ ИСПРАВЛЕНО | Таблицы нет в Supabase → возвращает [] | Обновить Auth Worker |
| notifications → 500 | ✅ ИСПРАВЛЕНО | Таблицы нет → возвращает [] | Обновить Auth Worker |
| announcements → 500 | ✅ ИСПРАВЛЕНО | Таблицы нет → возвращает null | Обновить Auth Worker |
| popular-books → 500 | ⚠️ ЧАСТИЧНО | SQL синтаксис исправлен, но Render не передеплоен | Передеплоить Social API |
| friends → 500 | ⚠️ ЧАСТИЧНО | SQL с `::text` исправлен, Render не передеплоен | Передеплоить Social API |
| chat-summary → 500 | ⚠️ ЧАСТИЧНО | `::text` исправлен, Render не передеплоен | Передеплоить Social API |
| posts/books → 404/NetworkError | ⚠️ ЧАСТИЧНО | Запрос идёт на Auth Worker вместо Social API (только если фронтенд не обновлён) | Передеплоить фронтенд |
| Удаление аккаунта → Not found | ✅ ИСПРАВЛЕНО | Не было хендлера → добавлен | Обновить Auth Worker |
| Сохранение профиля → ошибка | ✅ ИСПРАВЛЕНО | PUT без upsert → добавлен PATCH+POST | Обновить Auth Worker |

---

## 14. ПОРЯДОК ДЕПЛОЯ

### ⚡ Срочно (уже можно)

1. **Обновить Auth Worker**
   - Cloudflare Dashboard → Workers → kitobkhona-auth-worker → Edit Code
   - Вставить содержимое `servers/cloudflare-worker/worker.js`
   - Save and Deploy
   - Проверить: Variables → `SUPABASE_SERVICE_KEY` должен быть service_role ключом

2. **Передеплоить Social API**
   - Render Dashboard → kitobkhona-social → Manual Deploy → Clear build cache & deploy
   - Дождаться лога: `✅ Kitobkhona Social Server running on port 8080`

3. **Передеплоить фронтенд**
   - Cloudflare Pages → загрузить папку `kitobkhona/`
   - Или через GitHub

### После деплоя всех трёх
- Регистрация/вход: ✅
- Профиль: ✅
- Чат (если есть друзья и таблицы): ✅
- Лента постов: ✅
- Популярные книги: ✅
- Победители: ✅

---

## 15. КОНТАКТЫ / URL

| Ресурс | URL |
|--------|-----|
| Сайт | `https://kitobkhona.tojik.workers.dev` |
| Auth Worker | `https://kitobkhona-auth-worker.tojik.workers.dev` |
| Social API | `https://kitobkhona-social.onrender.com` |
| WebSocket | `wss://kitobkhona-social.onrender.com` |
| Supabase | `https://dwkdzfqooprxytlepaoo.supabase.co` |
| GitHub Books | `https://github.com/sharipovip/books` (raw: `raw.githubusercontent.com/sharipovip/books/main/books/...`) |
| GitHub Repo | `https://github.com/sharipovip/kitobkhona` |

---

## 📌 КЛЮЧЕВЫЕ МОМЕНТЫ ДЛЯ СЛЕДУЮЩЕГО АГЕНТА

1. **НЕ трогать config.js** — он правильный, маршрутизация настроена
2. **SQLite синтаксис** — все запросы в server.js должны использовать SQLite (LTRIM, datetime(), IN с плейсхолдерами), НЕ PostgreSQL
3. **Auth Worker использует Supabase REST API** (fetch), не прямой SQL
4. **JWT секрет должен быть одинаковым** на Cloudflare и Render
5. **service_role ключ** для Supabase (не anon!)
6. **WebSocket** не идёт через Worker — напрямую wss://
7. Все изменения server.js требуют **Clear build cache** на Render
8. Все изменения worker.js требуют **ручного Save and Deploy** в Cloudflare Dashboard

---

**Архив со всеми правками:** `/home/user/kitobkhona-final.zip` (6.3 MB)
