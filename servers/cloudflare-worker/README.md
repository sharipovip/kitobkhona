# 📘 Cloudflare Workers — архитектура Kitobkhona

В этой папке три Worker-файла:

| Файл | Назначение | Платформа | Статус |
|------|-----------|-----------|--------|
| `worker.js` | **Auth Worker** — регистрация/вход/профили/избранное/уведомления | Cloudflare Workers | ✅ Готов |
| `gateway-worker.js` | **API Gateway** — проксирует запросы между Auth и Social | Cloudflare Workers | ✅ Готов |
| `server.js` | **Auth Server** — старая версия для GCP Cloud Run | Node.js (GCP) | 🗑 Архив |

---

## 🚀 Как деплоить Gateway (`gateway-worker.js`)

### Вариант А: Отдельный Worker (рекомендуется)

```bash
npx wrangler deploy --config wrangler-gateway.toml
```

Фронтенд (`config.js`) должен указывать `API_AUTH` и `API_SOCIAL` на URL этого Gateway.

### Вариант Б: Встроить в основной фронтенд-Worker

Скопировать содержимое `gateway-worker.js` в основной Worker сайта (`kitobkhona.tojik.workers.dev`) и добавить его маршруты **перед** отдачей статики.

---

## 🔐 Переменные окружения

### Auth Worker (`worker.js`)
```
SUPABASE_URL, SUPABASE_KEY, NEON_DB_URL, JWT_SECRET, RESEND_API_KEY,
TURSO_CHATS_URL, TURSO_CHATS_TOKEN, TURSO_POSTS_URL, TURSO_POSTS_TOKEN,
UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
```

### API Gateway (`gateway-worker.js`)
```
AUTH_API_URL     → https://kitobkhona-auth-worker.sinamostudio.workers.dev
SOCIAL_API_URL   → https://kitobkhona-social.onrender.com
```

---

## 🔀 Маршрутизация

Все запросы проходят через Gateway:

| Путь | Куда идёт |
|------|-----------|
| `/api/auth/*`, `/api/profiles`, `/api/reading-sessions`, `/api/favorites`, `/api/notifications`, `/api/push`, `/api/admin`, `/api/feedbacks`, `/api/support` | ➡️ **Auth Worker** |
| `/api/messages`, `/api/friends`, `/api/posts`, `/api/book-*`, `/api/reports`, `/api/typing`, `/api/users/block`, `/api/chat-summary`, `/api/daily-words`, `/api/winners`, `/api/popular-books`, `/api/announcements` | ➡️ **Social API** (Render) |

⚠️ **WebSocket** (`wss://`) идёт **мимо** Gateway — напрямую к Social API на Render.
