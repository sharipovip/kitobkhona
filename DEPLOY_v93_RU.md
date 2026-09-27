# КИТОБХОНА — версия 93 (гимн .mp3 + отдельный путь скачивания символов)

## Что изменено в v93

### 1. Гимн снова в .mp3 ✅
Возвращён формат MP3 (лучше совместимость): плеер играет `surudi_milli.mp3` (1:55, 128 кбит/с), скачивается как **Суруди_Миллии_Тоҷикистон.mp3**. Файл .ogg удалён.

### 2. Скачивание символов ОТДЕЛЕНО от книжного пути ✅ (решение проблемы «.pdf»)
Вы правильно угадали причину: web использовал ту же функцию моста, что и книги, а **книжный Kotlin-код дописывает «.pdf»** ко всему, что не книга. Из HTML переименовать уже сохранённый файл невозможно — поэтому сделан отдельный путь:

- web теперь вызывает **новую функцию `AndroidBridge.saveSymbolFile`** — она сохраняет файл ровно с тем именем и расширением, что передал сайт (`.png`, `.jpg`, `.mp3`) — без всякого «.pdf»;
- если этой функции в приложении ещё нет — автоматически используется старая `saveFile` (как сейчас);
- книги скачиваются как раньше, их код не тронут.

### 3. Что нужно добавить в Kotlin (одна новая функция — старый код не меняем!) ⚠️
Откройте класс, где находится `saveFile` (AndroidBridge / WebAppInterface), и **добавьте рядом** с существующей функцией вот эту (ничего в старой не меняя):

```kotlin
// Боркунии рамзҳои давлатӣ: парчам/нишон/суруд.
// Ном аз сайт ГОТАВ меояд (.png / .jpg / .mp3) — ҳеҷ гуна «.pdf» илова намешавад.
@JavascriptInterface
fun saveSymbolFile(base64: String, fileName: String, mime: String) {
    try {
        val name = fileName.trim()
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        dir.mkdirs()
        val file = File(dir, name)
        FileOutputStream(file).use { it.write(bytes) }
        MediaScannerConnection.scanFile(
            this@WebAppInterface,                     // ← замените на свою переменную context, если она называется иначе
            arrayOf(file.absolutePath), arrayOf(mime), null
        )
    } catch (e: Exception) {
        Log.e("AndroidBridge", "saveSymbolFile error", e)
    }
}
```

Импорты (если ещё нет): `android.util.Base64`, `android.os.Environment`, `java.io.File`, `java.io.FileOutputStream`, `android.media.MediaScannerConnection`, `android.util.Log`, `android.webkit.JavascriptInterface`.

После пересборки приложения скачивание символов пойдёт через новую функцию автоматически — сайт сам её находит. До пересборки работает старый путь (файлы сохраняются, но со старой проблемой «.pdf»).

## Изменённые файлы (патч поверх v92)

| Файл | Статус |
|---|---|
| `index.html` | изменён (гимн .mp3, скачивание через saveSymbolFile с фолбэком) |
| `sw.js` | изменён (кэш `kitobkhona-v93-mp3-symbolbridge`) |
| `DEPLOY_v93_RU.md` | этот файл |

`assets/symbols/surudi_milli.ogg` удалён (ссылок нет); `surudi_milli.mp3` уже есть в полной сборке (с v77).

## Установка
1. Распаковать zip поверх v92.
2. Добавить функцию `saveSymbolFile` в Kotlin (блок выше) и пересобрать приложение.
3. Перезагрузить приложение.

## Тестирование (проведено, с имитацией моста)
- Гимн: играет `surudi_milli.mp3` (115 с).
- Новый мост: `saveSymbolFile` получает «Суруди_Миллии_Тоҷикистон.mp3», `audio/mpeg`, 1793 КБ; старый `saveFile` при этом НЕ вызывается.
- Фолбэк: если `saveSymbolFile` нет — работает старый `saveFile` (флаг 64 КБ, `image/png`).
- Регрессия: новости 20, Пешво 12, лента сайтов 18, ошибок JS нет.

## Откат
Вернуть файлы v92 из `kitobkhona_v92_patch.zip`.
