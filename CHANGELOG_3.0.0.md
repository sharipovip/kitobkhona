# Китобхона — исходный комплект 3.0.0

## Интерфейс и поведение

- Используется оригинальный интерфейс Kitobkhona; редизайн `Kitobkhona_ENHANCED` в релиз не включён.
- Сохранены предыдущие исправления отправки новости Президента с текстом и фотографией и мобильной ширины на узких экранах.
- Обновлены только версия/кэш PWA; функциональные страницы и их визуальный дизайн не редизайнились.

## Android / Google Play

- `versionName=3.0.0`, `versionCode=16` (перед загрузкой проверить, что код больше максимального в Play Console).
- AGP 9.3.3, Gradle 9.5.0, JDK 17, Android SDK 36 / Build Tools 36.0.0.
- R8 minification, optimization, obfuscation и resource shrinking включены; CI запускает `:app:analyzeReleaseR8Config`.
- Glide декодирует изображения уведомлений с `override(512, 512)`, downsampling и дисковым кэшем.
- Firebase BoM обновлён до 34.19.0; Android-клиент использует Firebase Messaging main module. Неиспользуемые Android Firestore/Analytics, Room и KSP удалены.

## Пакет

Содержит четыре проектные папки: `kitobkhona/`, `kitobkhona-chat/`, `kitobkhona-edge/`, `kitobkhonaapp/`. Настройки Render, production secrets и backend не перенастраивались. APK/AAB не включены; сборку следует выполнить новым GitHub Actions workflow и подтвердить подпись прежним upload keystore.

## Проверка

В рабочей среде успешно собраны debug APK и release APK/AAB на JDK 17 + SDK 36; `:app:analyzeReleaseR8Config` и `scripts/check_release.py` прошли. APK/AAB unsigned без прежнего upload keystore; для загрузки в Play выполните workflow с действующими signing secrets.
