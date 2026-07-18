# Install v40

## 1. Render backend

Replace:

```text
kitobkhona-chat/server.js
```

Deploy Render. Account deletion now skips absent legacy tables and handles TEXT/INTEGER ID schemas. Chat summary uses a simpler compatible query. Chat deletion returns the real SQL deleted row count.

## 2. GitHub Pages

Replace:

```text
kitobkhona/profile.html
kitobkhona/chats.html
kitobkhona/config.js
kitobkhona/sw.js
```

## 3. After deployment

Hard-refresh once or reopen the installed PWA. Cache version is `kitobkhona-v40`.

If account deletion still fails, the response now includes a short `technical` database message. Send only that message; it contains no password/token.
