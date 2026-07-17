# Kitobkhona v36 — final deployment and Google Play

## A. Production deployment

### 1. Neon SQL (in order)

```text
kitobkhona-chat/READING_COMPLETION_MIGRATION.sql
kitobkhona-chat/BOOK_READING_AGGREGATE_MIGRATION.sql
kitobkhona-chat/WINNERS_MINIMUM_READING_MIGRATION.sql
kitobkhona-chat/DELETION_REQUESTS_MIGRATION.sql
kitobkhona-chat/ADMIN_AND_VERIFICATION_MIGRATION.sql
```

### 2. Render

Upload `kitobkhona-chat/`, deploy and verify:

```text
https://kitobkhona-chat.onrender.com/health
https://kitobkhona-chat.onrender.com/api/ping
```

### 3. Cloudflare Worker

```bash
cd kitobkhona-edge
npm ci
npm run typecheck
npx wrangler deploy
```

Verify `/`, `/api/edge/health`, `/api/winners`.

### 4. GitHub Pages

Upload contents of `kitobkhona/` to repository root. Verify:

```text
/privacy-policy.html
/terms.html
/delete-account.html
```

## B. Android API 36

Upload `kitobkhonaapp/` to its repository. GitHub Actions now installs Android platform/build-tools 36.

```text
compileSdk 36
targetSdk 36
AGP 8.9.1
Gradle 8.11.1
versionCode 2
versionName 2.0.0
```

Run Actions → Build Kitobkhona Android APK and AAB. Existing signing secrets produce a signed release AAB. Never upload the JKS or secrets into the repository.

## C. Google Play

Use:

```text
PLAY_STORE_LISTING.md
PLAY_DATA_SAFETY_GUIDE.md
GOOGLE_PLAY_RELEASE_CHECKLIST.md
play-store-assets/
```

Policy URLs:

```text
https://sharipovip.github.io/kitobkhona/privacy-policy.html
https://sharipovip.github.io/kitobkhona/terms.html
https://sharipovip.github.io/kitobkhona/delete-account.html
```

## D. Chat deletion meaning

Deleting a chat now runs a PostgreSQL transaction and returns `deleted_messages`. Frontend clears conversation and summary caches only after server success. The friend relation is not deleted; the deleted thread remains hidden until a new message starts it again.

## E. Final versions

```text
PWA cache: kitobkhona-v36
Worker: 1.5.0
Android: 2.0.0 (versionCode 2)
Target API: 36
```
