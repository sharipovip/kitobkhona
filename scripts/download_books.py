"""
Скачивание ВСЕХ книг с nlt.tj → в sharipovip/books/
Существующие папки используются по нормализованному имени.
Большие файлы (>95 МБ) пропускаются.
"""

import asyncio
import os
import re
import urllib.parse
from pathlib import Path
from urllib.parse import urljoin, urlparse
from playwright.async_api import async_playwright

# ============ НАСТРОЙКИ ============
BASE_URL = "http://nlt.tj"
LOGIN_URL = f"{BASE_URL}/signin"
JANR_URL = f"{BASE_URL}/janr"

USERNAME = os.environ.get("NLT_USERNAME", "")
PASSWORD = os.environ.get("NLT_PASSWORD", "")

BOOKS_ROOT = Path("books")
BOOKS_ROOT.mkdir(parents=True, exist_ok=True)

MAX_SIZE_MB = 95
seen_books = set()


# ============ РУЧНАЯ КАРТА ДЛЯ СЛОЖНЫХ СЛУЧАЕВ ============
# Ключ — как называется категория на сайте (в нижнем регистре, как есть)
# Значение — точный путь в репо (относительно books/)
MANUAL_MAP = {
    "китобҳои дарсӣ":        "Kitobhoi darsi",
    "китобхои дарси":        "Kitobhoi darsi",
    "kitobhoi darsi":        "Kitobhoi darsi",
    "адабиёти бачагона":     "Адабиёти бачагона",
    "китобҳо барои пешвои миллат": "КИТОБҲО БАРОИ ПЕШВОИ МИЛЛАТ",
    "пешвои миллат":         "Пешвои Миллат",
    "исломӣ":                "Исломӣ",
    "исломи":                "Исломӣ",
}


def normalize(s):
    """Приводит строку к каноническому виду для сравнения."""
    if not s:
        return ""
    s = str(s).strip().lower()
    # Таджикские буквы → русские аналоги
    trans = str.maketrans({
        "ӣ": "и", "ҳ": "х", "ҷ": "ч", "қ": "к",
        "ӯ": "у", "ғ": "г", "ё": "е",
        "’": "", "'": "", "`": "",
    })
    s = s.translate(trans)
    # Убираем всё, кроме букв и цифр
    s = re.sub(r"[^a-zа-яё0-9]+", "", s)
    return s


def build_existing_index():
    """Обходит books/ и строит {нормализованный_путь: реальный_путь}."""
    index = {}
    for item in BOOKS_ROOT.rglob("*"):
        if item.is_dir():
            rel = item.relative_to(BOOKS_ROOT).as_posix()
            # Нормализуем полный путь (с учётом вложенности)
            parts = rel.split("/")
            norm_parts = [normalize(p) for p in parts]
            norm_key = "/".join(norm_parts)
            index[norm_key] = rel
    print(f"[+] Существующих папок в репо: {len(index)}")
    return index


def resolve_folder(site_category_path, existing_index):
    """
    site_category_path: список частей пути с сайта, например ['Адабиёти классикӣ', 'Шеър']
    Возвращает реальный путь в репо (str) относительно books/.
    Логика:
    1) Проверяем MANUAL_MAP для первого уровня.
    2) Нормализуем каждый уровень и ищем совпадение в existing_index.
    3) Если нашли — берём реальное имя папки.
    4) Иначе — создаём по имени с сайта (safe_folder).
    """
    # Проверка ручной карты для верхнего уровня
    top = site_category_path[0]
    top_lower = top.strip().lower()
    if top_lower in MANUAL_MAP:
        real_top = MANUAL_MAP[top_lower]
        # Проверяем, есть ли вложенность (подкатегория)
        if len(site_category_path) > 1:
            # Ищем подкатегорию внутри реального верхнего уровня
            sub = site_category_path[1]
            norm_sub = normalize(sub)
            # Ищем в existing_index запись вида normalize(real_top)/norm_sub
            norm_key = normalize(real_top) + "/" + norm_sub
            if norm_key in existing_index:
                return existing_index[norm_key]
            # Иначе создаём подпапку
            return f"{real_top}/{safe_folder(sub)}"
        return real_top

    # Автоматический поиск по нормализации
    norm_parts = [normalize(p) for p in site_category_path]
    norm_key = "/".join(norm_parts)
    if norm_key in existing_index:
        return existing_index[norm_key]

    # Пробуем только первый уровень (на случай, если подкатегория на сайте,
    # а в репо книги лежат прямо в категории)
    if len(norm_parts) > 1 and norm_parts[0] in existing_index:
        real_top = existing_index[norm_parts[0]]
        # Создаём подпапку
        return f"{real_top}/{safe_folder(site_category_path[1])}"

    # Совсем не нашли — создаём всё с нуля
    return "/".join(safe_folder(p) for p in site_category_path)


def safe_folder(name):
    """Чистит имя папки от запрещённых символов."""
    name = re.sub(r'[<>:"/\\|?*]', "_", str(name))
    name = re.sub(r"\s+", " ", name).strip().rstrip(". ")
    return name or "Без названия"


def safe_filename(name):
    """Чистит имя файла."""
    name = urllib.parse.unquote(name)
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", " ", name).strip().rstrip(". ")
    return name or "book.pdf"


# ============ PLAYWRIGHT ============
async def login(page):
    print("[*] Логин...")
    await page.goto(LOGIN_URL, wait_until="networkidle")
    await page.fill('input[type="email"], input[name="email"], input[name="username"]', USERNAME)
    await page.fill('input[type="password"], input[name="password"]', PASSWORD)
    await page.click('button[type="submit"], input[type="submit"], .login-button')
    try:
        await page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        pass
    print("[+] Логин выполнен")


async def collect_categories(page):
    """Собирает ВСЕ категории со страницы /janr."""
    print(f"[*] Сбор категорий: {JANR_URL}")
    await page.goto(JANR_URL, wait_until="networkidle")
    await page.wait_for_timeout(1500)

    cats = await page.eval_on_selector_all(
        'a[href^="/category/"]',
        """els => els.map(e => ({
            url: e.href,
            name: (e.innerText || e.textContent || '').trim()
        }))"""
    )

    seen = {}
    for c in cats:
        if c["url"] and c["url"] not in seen and c["name"]:
            seen[c["url"]] = c["name"]
    result = [{"url": u, "name": n} for u, n in seen.items()]
    print(f"[+] Найдено категорий: {len(result)}")
    for c in result[:20]:
        print(f"    • {c['name']} → {c['url']}")
    if len(result) > 20:
        print(f"    ... и ещё {len(result) - 20}")
    return result


async def collect_books_in_category(page, cat_url):
    """Собирает все книги в категории с учётом пагинации."""
    books = []
    page_num = 1
    while True:
        if page_num == 1:
            url = cat_url
        else:
            m = re.search(r'/category/(\d+)', cat_url)
            if m:
                url = f"{cat_url}?cat_id={m.group(1)}&page={page_num}"
            else:
                url = f"{cat_url}?page={page_num}"

        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
        except Exception:
            break
        await page.wait_for_timeout(1000)

        found = await page.eval_on_selector_all(
            'a[href^="/book/"]',
            """els => els.map(e => ({
                url: e.href,
                title: (e.innerText || e.textContent || '').trim()
            }))"""
        )

        new_books = [b for b in found if b["url"] and b["url"] not in seen_books]
        for b in new_books:
            seen_books.add(b["url"])

        if not new_books:
            break

        books.extend(new_books)
        print(f"    стр. {page_num}: +{len(new_books)} (всего {len(books)})")

        has_next = await page.query_selector('a[rel="next"]')
        if not has_next:
            break
        page_num += 1
        if page_num > 100:
            break

    return books


async def download_book(page, book_url, save_folder):
    """Скачивает одну книгу."""
    try:
        await page.goto(book_url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)

        dl = await page.query_selector(
            'a[href$=".pdf"], a[href$=".djvu"], a[href$=".epub"], '
            'a.download-link, a[download], button.download, a.btn-download'
        )
        if not dl:
            return None

        href = await dl.get_attribute("href")
        if not href:
            return None

        file_url = urljoin(BASE_URL, href)
        resp = await page.context.request.get(file_url)
        if not resp.ok:
            return None

        cd = resp.headers.get("content-disposition", "")
        filename = None
        m = re.search(r"filename\*=utf-8''([^;]+)", cd, re.IGNORECASE)
        if m:
            filename = urllib.parse.unquote(m.group(1).strip())
        if not filename:
            m = re.search(r'filename="?([^";]+)"?', cd, re.IGNORECASE)
            if m:
                filename = m.group(1).strip()
        if not filename:
            filename = os.path.basename(urlparse(file_url).path) or "book.pdf"

        filename = safe_filename(filename)

        body = await resp.body()
        size_mb = len(body) / (1024 * 1024)
        if size_mb > MAX_SIZE_MB:
            print(f"    [!] {filename} — {size_mb:.1f} МБ, пропуск")
            return None

        target = save_folder / filename
        if target.exists():
            print(f"    [=] уже есть: {filename}")
            return None

        save_folder.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
        print(f"    [+] {filename} ({size_mb:.1f} МБ)")
        return filename

    except Exception as e:
        print(f"    [-] ошибка: {e}")
        return None


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1366, "height": 900},
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"),
            accept_downloads=True,
        )
        page = await ctx.new_page()

        await login(page)

        # Строим индекс существующих папок
        existing_index = build_existing_index()

        # Собираем категории
        categories = await collect_categories(page)

        total_new = 0
        for i, cat in enumerate(categories, 1):
            print(f"\n{'='*60}")
            print(f"[{i}/{len(categories)}] {cat['name']}")
            print('='*60)

            # Определяем целевую папку
            rel_folder = resolve_folder([cat["name"]], existing_index)
            folder = BOOKS_ROOT / rel_folder
            print(f"    → папка: books/{rel_folder}")

            books = await collect_books_in_category(page, cat["url"])

            for b in books:
                result = await download_book(page, b["url"], folder)
                if result:
                    total_new += 1
                await asyncio.sleep(1.2)

        await browser.close()

    print(f"\n[+] Всего новых книг: {total_new}")


if __name__ == "__main__":
    asyncio.run(main())
