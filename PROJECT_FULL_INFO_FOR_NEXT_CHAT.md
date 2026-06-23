# ПОЛНАЯ ИНФОРМАЦИЯ О ПРОЕКТЕ «КИТОБХОНА» ДЛЯ НОВОГО ЧАТА

Дата: 2026-06-20  
Проект: **Китобхона**  
Автор/владелец проекта: **Парвиз Шарипов**

Этот документ нужен, чтобы новый чат/ИИ понял весь проект, структуру, серверы, ссылки, роли файлов, что уже делали, что должно происходить при нажатиях, какие проблемы были и куда двигаться дальше.

---

# 1. Что такое проект «Китобхона»

**Китобхона** — это мобильная электронная библиотека на таджикском языке.

Проект должен работать как:

```text
1. PWA / сайт на GitHub Pages
2. Android APK через WebView
3. Каталог PDF-книг из отдельного GitHub repo
4. Профили пользователей
5. Реальная статистика чтения
6. Ғолибон / рейтинг читателей
7. Лента пользователей как Instagram, но с книгами
8. Чат между пользователями
9. Админка
10. Offline/cache для книг и страниц
```

Главная цель: сделать **профессиональную mobile-first программу**, а не обычный сайт.

---

# 2. Основные репозитории и ссылки

## 2.1. Сайт / PWA

```text
Repo:
https://github.com/sharipovip/kitobkhona

GitHub Pages:
https://sharipovip.github.io/kitobkhona/
```

Назначение:

```text
HTML/CSS/JS приложение
PWA
главные страницы
админка
assets
service worker
```

---

## 2.2. Репозиторий книг

```text
Repo:
https://github.com/sharipovip/books

Raw books.json:
https://raw.githubusercontent.com/sharipovip/books/main/books.json
```

Назначение:

```text
PDF книги
books.json
manifest.json в папках книг
covers/...
build.py
GitHub Actions для генерации manifest/books.json/covers
```

Очень важно: книги не должны храниться в Supabase. Книги/PDF/обложки идут из GitHub repo `sharipovip/books`.

---

## 2.3. Android APK / WebView

```text
Repo:
https://github.com/sharipovip/kitobkhonaapp
```

Назначение:

```text
Kotlin Android WebView приложение
открывает GitHub Pages сайт
поддерживает download/share/notification через Android bridge
```

Главный Android файл:

```text
app/src/main/java/com/kitobkhona/app/MainActivity.kt
```

Android app открывает:

```kotlin
const val SITE_URL = "https://sharipovip.github.io/kitobkhona/"
```

---

## 2.4. Chat server на Render

В другом чате уже был поднят отдельный Node.js chat-server:

```text
Repo:
https://github.com/sharipovip/kitobkhona-chat

Render URL:
https://kitobkhona-chat.onrender.com
```

Лог Render показывал:

```text
Cloning from https://github.com/sharipovip/kitobkhona-chat
Running 'node server.js'
Chat server running on port 10000
Your service is live
Available at: https://kitobkhona-chat.onrender.com
```

Это сервер для чата / Socket.IO / WebSocket. Его нужно изучить отдельно:

```text
server.js
package.json
```

Нужно понять:

```text
какие socket events используются
хранятся ли сообщения в памяти или базе
есть ли Supabase-интеграция
есть ли auth
есть ли CORS
```

---

# 3. Supabase

## 3.1. Supabase project

```text
Project URL:
https://dwkdzfqooprxytlepaoo.supabase.co
```

REST API base:

```text
https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1
```

Auth API base:

```text
https://dwkdzfqooprxytlepaoo.supabase.co/auth/v1
```

Anon key, который использовался в коде:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2R6ZnFvb3ByeHl0bGVwYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDI5ODIsImV4cCI6MjA5NjQ3ODk4Mn0.4rV_7yN5Urx5WHgb9kAxWo_VmrPWGlbFYN4Ij7DcuyI
```

Важно: это anon key, его можно использовать в frontend при правильных RLS policies. **Service role key нельзя хранить в HTML/JS.**

---

## 3.2. Что должно храниться в Supabase

Supabase нужен для:

```text
Auth
profiles
reading_sessions
v_winners
book_ratings
book_comments
comment_reports
friend_requests
chat_messages
chat_violations
message_reports
admin_users
hero_slides
app_settings
user_verifications
pesvo_words
display_names
book_collections
achievements
events
```

---

## 3.3. SQL-файлы, которые уже были в проекте

Из `sql.txt`:

```text
00_initial_social_reading.sql
01_profiles.sql
02_reading_sessions.sql
03_winners.sql
04_ratings_comments.sql
05_social_friendship.sql
06_chat.sql
07_moderation.sql
08_policies_notes.sql
ALL_IN_ONE.sql
```

Позже были добавлены/созданы:

```text
09_admin_core.sql
09_admin_core_REPAIR.sql
11_app_control_and_admin.sql
12_temporary_admin_testing_policies.sql
```

---

## 3.4. Важные SQL проблемы

### Ошибка `09_admin_core.sql`

При запуске была ошибка:

```text
ERROR: 42703: column "user_id" does not exist
```

Для этого был создан repair SQL:

```text
09_admin_core_REPAIR.sql
```

Он чинит:

```text
admin_users.user_id
events.user_id
недостающие admin tables
policies
```

---

## 3.5. Временный SQL для теста

```text
12_temporary_admin_testing_policies.sql
```

Он временно разрешает authenticated users управлять:

```text
user_verifications
hero_slides
app_settings
display_names
achievements
book_collections
```

ВНИМАНИЕ: это **только для теста**. Для production нужно убрать временные policies и использовать `admin_users` + `is_admin()`.

---

# 4. UptimeRobot / мониторинг

В другом чате обсуждалось подключение UptimeRobot.

## 4.1. Для Supabase

URL для мониторинга:

```text
https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1/
```

Интервал:

```text
5 минут
```

Цель:

```text
проверка доступности
уведомление, если сервис недоступен
```

Важно: UptimeRobot не увеличивает лимиты Supabase.

---

## 4.2. Для Render chat server

URL:

```text
https://kitobkhona-chat.onrender.com
```

Render free может “засыпать”. UptimeRobot каждые 5 минут может держать сервер активным или хотя бы быстрее будить.

---

# 5. Текущая выбранная архитектура сайта

Пользователь выбрал **вариант A**:

Главные страницы должны быть в корне:

```text
index.html
kitobho.html
reader.html
profile.html
honandagon.html
admin.html
login.html
```

Папка `pages/` используется только для дополнительных страниц:

```text
pages/chat.html
pages/chats.html
pages/book_reviews.html
pages/winners.html
pages/users.html
pages/profile_edit.html
pages/login.html   // можно оставить как fallback/legacy
```

Важно: нельзя снова смешивать `pages/pages/...`.

---

# 6. Новые дизайн-файлы

Пользователь загрузил новые дизайны:

```text
kitobkhona-profile-app.html
kitobkhona-feed.html
winners.html
chat.html
chats.html
login.html
admin.html
```

Они лежали в:

```text
/home/user/uploads/
```

Из них была создана папка:

```text
/home/user/01/
```

Внутри:

```text
01/honandagon.html   ← из kitobkhona-feed.html
01/profile.html      ← из kitobkhona-profile-app.html
01/winners.html
01/chat.html
01/chats.html
01/login.html
01/admin.html
01/config.js
01/README_01.txt
```

## Важное правило пользователя

Новый дизайн нельзя смешивать со старым.

Разрешено:

```text
убрать внешнюю телефонную рамку
исправить пути
подключить логику
подключить данные
```

Запрещено без команды:

```text
менять цвета
менять размеры
менять стиль
подмешивать старый дизайн
```

---

# 7. Что было сделано в папке `01`

В дизайн-файлах была внешняя phone/mockup рамка. Был сделан app-mode override:

```css
.preview-bar,
.island,
.status-bar,
.statusbar,
.notch {
  display:none !important;
}

.phone,
.device {
  width:100% !important;
  max-width:430px !important;
  height:100dvh !important;
  max-height:none !important;
  border-radius:0 !important;
  box-shadow:none !important;
}
```

То есть рамка телефона скрыта, но сам дизайн внутри сохранён.

Проверка JS для файлов в `/home/user/01/` прошла без syntax errors.

---

# 8. Что должно происходить при нажатиях

## 8.1. Нижнее меню соц-части

Для `honandagon.html`, `profile.html`, `winners.html`:

```text
🏠 Лента      → honandagon.html
🏆 Ғолибон    → winners.html или pages/winners.html
👤 Профил     → profile.html
```

Нижнее меню должно быть 3 пункта, не 5.

Убрать из соц-меню:

```text
Хонандагон
Китобҳо
```

---

## 8.2. `honandagon.html` — Лента

Назначение:

```text
Instagram-style лента, но с книгами
```

Должно быть:

```text
stories
посты с книгами
лайк
комментарий
сохранить
поделиться
```

Если данных нет:

```text
красивое пустое состояние
без фейковых пользователей
```

Stories:

```text
Шумо +
```

При нажатии:

```text
открыть список книг
сверху поиск
выбрать книгу
создать story/post
```

Нельзя просить вручную писать название книги, если можно показать список.

---

## 8.3. `profile.html` — профиль

Свой профиль:

```text
аватар
статистика: китобҳо / дӯстон / хатбаракҳо
имя
статус Китобхон
город/регион
кнопка Чатҳо
кнопка Таҳрири профил
вкладки: 📚 китобҳо / 🔖 избран / 🏆 дастовардҳо
сетка книг 3 в ряд
```

Чужой профиль:

Если не друг:

```text
➕ Додани ба дӯстон
```

Если запрос отправлен:

```text
⏳ Интизорӣ
```

Если друг принят:

```text
💬 Чат
Дӯстон
```

Кнопка `Нависидан` появляется только после принятия дружбы.

---

## 8.4. `chats.html`

Назначение:

```text
список чатов / друзья
```

Показывать:

```text
аватар
имя
последнее сообщение
время
бейдж новых сообщений
раздел Дархостҳо
```

---

## 8.5. `chat.html`

Должен быть как WhatsApp.

Требования:

```text
без кнопки звонка
без скрепки файла
Enter = отправка
Shift+Enter = новая строка
мои сообщения зелёные
чужие белые
время сообщения
галочки
```

---

## 8.6. `login.html`

Должен поддерживать:

```text
вход
регистрация
логин + пароль
email опционально
```

По логике username/password:

Пользователь вводит:

```text
login: parviz
password: 123456
```

Внутри можно использовать технический email:

```text
parviz@kitobkhona.local
```

Так Supabase Auth сможет работать как email/password, но пользователь видит только login/password.

---

# 9. Важная логика профиля

Пользователь хочет:

```text
каждый пользователь может создать только один профиль
```

Если профиль уже есть:

```text
показывать профиль
не показывать второй раз создание
```

Если хочет изменить:

```text
редактировать текущий профиль
```

## Создание профиля

Поля:

```text
имя
фамилия
аватар
год рождения
регион
город/район
ҷамоат
деҳа/село
логин
пароль
email опционально
```

## Год рождения

Пользователь сказал, что регистрация должна быть 18+.

В 2026 году последний допустимый год:

```text
2008
```

---

# 10. География Таджикистана

Пользователь прислал полный файл:

```text
tajikistan_locations.json
```

Он содержит:

```text
regions
cities
districts
jamoats
```

Файл должен использоваться в `profile.html` / `login.html`.

Нужно реализовать выбор:

```text
регион → город/район → ҷамоат → деҳа вручную
```

В текущих попытках jamoat не был полностью реализован. Это надо доделать.

---

# 11. Каталог книг / `kitobho.html`

Назначение:

```text
категории слева
подкатегории сверху
книги справа
```

Книги берутся из:

```text
books.json
https://raw.githubusercontent.com/sharipovip/books/main/books.json
```

Для папок:

```text
manifest.json
```

Если manifest нет:

```text
fallback GitHub API contents
```

Обложки:

```text
covers/...
covers/books/...
```

Offline:

```text
раздел Ҳифзшуда
замок на недоступной книге
удаление скачанных книг
кнопка скачать меняется на удалить
```

Пользователь отказался от сложной полки/preview. Нужно оставить обычные карточки, но украсить как книга:

```text
корешок слева
маленькая толщина справа
обложка занимает всю форму книги
```

---

# 12. Reader / `reader.html`

Назначение:

```text
PDF чтение
```

Должно быть:

```text
быстрое открытие PDF
range loading
swipe как галерея
поиск по книге
закладки
оценка 10 звёзд
скачивание
поделиться PDF-файлом
offline cache
```

PDF.js параметры:

```js
pdfjsLib.getDocument({
  url,
  rangeChunkSize: 65536,
  disableStream: false,
  disableRange: false
})
```

---

# 13. Android APK

В Android уже делали:

```text
KitobAndroid.saveFile
KitobAndroid.shareFile
KitobAndroid.showNotification
```

## Share PDF

Пользователь хочет делиться не ссылкой, а самим файлом PDF.

В Android должен быть:

```kotlin
KitobAndroid.shareFile(base64Data, fileName, mimeType)
```

Используется:

```text
FileProvider
Intent.ACTION_SEND
```

## Notifications

Добавлено/планируется:

```text
POST_NOTIFICATIONS
local notification bridge
```

Полноценный push как WhatsApp требует:

```text
Firebase Cloud Messaging
FCM token
Edge Function/server
```

---

# 14. Chat server

Render chat server:

```text
https://kitobkhona-chat.onrender.com
```

Repo:

```text
https://github.com/sharipovip/kitobkhona-chat
```

Render logs:

```text
node server.js
Chat server running on port 10000
service live
```

Нужно изучить:

```text
server.js
package.json
socket events
storage
CORS
auth
```

---

# 15. UptimeRobot

Используется/обсуждался для:

```text
Supabase ping
Render chat server ping
```

Supabase monitor URL:

```text
https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1/
```

Render URL:

```text
https://kitobkhona-chat.onrender.com
```

Интервал:

```text
5 минут
```

---

# 16. Supabase / config.js

В новом архиве есть `config.js`.

Идея другого чата:

```text
удалить @supabase/supabase-js SDK
использовать REST fetch через config.js
```

`config.js` содержит:

```js
apiGet
apiPost
apiPatch
apiDelete
AUTH.signUp
AUTH.signIn
AUTH.signOut
AUTH.getSession
AUTH.getUser
AUTH.resetPassword
```

Но нужно проверить, чтобы:

```text
Supabase anon key был правильный
apiUpsert был добавлен
Auth работал
пути config.js были правильные
```

---

# 17. Что уже было собрано до этого

Был создан:

```text
/home/user/kitobkhona_clean_final.zip
```

Но после проверки стало видно, что некоторые новые pages были placeholder-like, например:

```html
<style>/* ... тот же стиль ... */</style>
```

Поэтому в финальной сборке нужно использовать новые дизайн-файлы из `/home/user/uploads/`, а не placeholder-файлы.

---

# 18. Текущая папка `01`

Создана:

```text
/home/user/01/
```

В ней сейчас новые дизайны без телефонной рамки:

```text
01/honandagon.html
01/profile.html
01/winners.html
01/chat.html
01/chats.html
01/login.html
01/admin.html
01/config.js
01/README_01.txt
```

Что было сделано:

- hidden preview toolbar;
- hidden phone frame;
- hidden statusbar/notch;
- design preserved;
- minimal nav wiring added.

Но это ещё не полностью интегрировано с проектом.

---

# 19. Что нужно делать дальше

## Следующий правильный шаг

Собрать новую clean final папку, используя:

```text
новые дизайны из /home/user/01
старую/рабочую логику из kitobho/reader/config/sw
assets/data/books из текущего архива
```

## Нужно не менять дизайн, только подключить логику

Принцип:

```text
визуально — новый дизайн
логика — рабочая из проекта
```

---

# 20. Рекомендованная финальная структура после интеграции новых дизайнов

```text
kitobkhona_final/
├── index.html                 // главная, текущая рабочая
├── kitobho.html               // каталог, текущий рабочий
├── reader.html                // reader, текущий рабочий
├── honandagon.html            // новый design feed
├── profile.html               // новый design profile
├── login.html                 // новый design login
├── admin.html                 // новый design admin
├── config.js
├── sw.js
├── books.json
├── manifest.json
├── assets/
│   ├── css/
│   ├── fonts/
│   └── hero/
├── data/
├── pages/
│   ├── chat.html              // новый design chat
│   ├── chats.html             // новый design chats
│   ├── winners.html           // новый design winners
│   ├── book_reviews.html
│   └── users.html             // можно оставить legacy/fallback
├── icons/
├── озмунҳо html
└── banners
```

---

# 21. Что нельзя делать

1. Не смешивать старый дизайн с новым.
2. Не использовать placeholder HTML с `/* ... тот же стиль ... */`.
3. Не переносить всё в `pages/`.
4. Не ломать root structure.
5. Не хранить service role key в frontend.
6. Не показывать пользователю технические ошибки.
7. Не удалять working reader logic.
8. Не удалять offline/cache logic.

---

# 22. Короткий вывод

Пользователь хочет, чтобы проект был завершён с новыми дизайнами.

Нужно:

```text
1. Взять новые дизайны из /home/user/01.
2. Сохранить их внешний вид.
3. Подключить рабочую логику.
4. Исправить пути.
5. Собрать полный архив.
```

Самая важная задача сейчас: **заменить сломанные placeholder страницы соц-части на полноценные новые дизайны и правильно привязать их к структуре проекта.**

---

# 23. Файл создан

Этот документ должен быть передан следующему чату как контекст.

Путь:

```text
/home/user/01/PROJECT_01_FULL_CONTEXT.md
```

---

# 24. Что делать в следующем шаге

Команда для следующего ИИ:

```text
Используй /home/user/01 как источник новых дизайнов.
Используй /home/user/kitobkhona_clean_final как источник структуры/assets/config/sw.
Собери новую папку kitobkhona_final_integrated.
Главные страницы — в корне.
Не смешивай старый дизайн.
Не меняй внешний вид новых дизайнов, только подключай логику и исправляй пути.
```
