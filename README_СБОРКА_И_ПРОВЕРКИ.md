# Китобхона — оригинальный комплект 3.0.0

Один вариант выпуска **3.0.0 с оригинальным интерфейсом**. Редизайн `Kitobkhona_ENHANCED` не используется. Прежние исправления отправки новостей Президента (текст и фото) и адаптации узкого экрана сохранены.

## Четыре проекта

- `kitobkhona/` — сайт и PWA.
- `kitobkhona-chat/` — Node.js API чата и пользовательских функций.
- `kitobkhona-edge/` — Cloudflare Worker API.
- `kitobkhonaapp/` — Android WebView-приложение.

## Что изменено в 3.0.0

- Android: versionName `3.0.0`, versionCode `16`. Перед публикацией сверьте номер с максимальным versionCode в Play Console.
- Google Play image loading: Glide с кэшированием и downsampling до 512×512 для bitmap уведомлений.
- Обновлены зависимости Android Firebase до BoM `34.19.0`; оставлен используемый `firebase-messaging`, удалены неиспользуемые Android Analytics/Firestore, Room/KSP.
- Android toolchain обновлён до AGP `9.3.3`, Gradle `9.5.0`, JDK `17`, SDK Platform `36` / Build Tools `36.0.0`. Включён встроенный Kotlin AGP 9.
- R8 shrinking/optimization/obfuscation и удаление ресурсов включены; CI добавляет `:app:analyzeReleaseR8Config`.
- Render/backend, production variables/secrets и Firebase Admin на сервере не изменялись.

## Сборка

Android-команды и требования: [`kitobkhonaapp/BUILD_ANDROID.md`](kitobkhonaapp/BUILD_ANDROID.md). Workflow: [`kitobkhonaapp/.github/workflows/build.yml`](kitobkhonaapp/.github/workflows/build.yml). Используйте прежний keystore/signing secrets для обновления приложения; они не включены в комплект.

PWA публикуется на прежний HTTPS-хостинг; backend и Worker разворачиваются только при необходимости — в этом комплекте их рабочая конфигурация сохранена. Повторно настраивать Render или секреты не требуется.

## Результат проверки

В рабочей среде установлены временные JDK 17 и Android SDK 36 / Build Tools 36.0.0. Успешно выполнены `:app:assembleDebug`, `:app:analyzeReleaseR8Config`, `:app:bundleRelease`, `:app:assembleRelease` и `scripts/check_release.py`; AAB содержит R8 mapping, а проверки shrink/optimize/obfuscate прошли.

Созданные release APK/AAB — **unsigned**, поскольку upload keystore не был доступен в локальной среде; signing secrets не запрашивались. Для загрузки обновления в Google Play используйте прежние защищённые GitHub secrets/keystore через workflow. Перед публикацией проверьте versionCode 16 в Play Console и протестируйте приложение на устройствах.
