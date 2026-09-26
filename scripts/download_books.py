"""
Скачивание ВСЕХ книг с nlt.tj → в sharipovip/books/books/<Категория>/<Подкатегория>/
Существующие файлы пропускаются. Большие файлы (>95 МБ) пропускаются.
"""

import asyncio
import os
import re
import urllib.parse
from pathlib import Path
from urllib.parse import urljoin, urlparse
from playwright.async_api import async_playwright

BASE_URL = "http://nlt.tj"
LOGIN_URL = f"{BASE_URL}/login"
CATEGORIES_URL = f"{BASE_URL}/categories"   # ← проверьте реальный URL
USERNAME = os.environ.get("NLT_USERNAME", "")
PASSWORD = os.environ.get("NLT_PASSWORD", "")

BOOKS_ROOT = Path("books")
BOOKS_ROOT.mkdir(parents=True, exist_ok=True)

MAX_SIZE_MB = 95
seen_books = set()  # чтобы не качать одну книгу дважды


def safe_folder(name):
    """Чистит имя папки от запрещённых символов."""
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", " ", name).strip().rstrip(". ")
    return name or "Без названия"


def safe_filename(name):
    """Чистит имя файла."""
    name = urllib.parse.unquote(name)
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", " ", name).strip().rstrip(". ")
    return name or "book.pdf"


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
    """Собирает все категории с главной / страницы категорий."""
    print(f"[*] Сбор категорий: {CATEGORIES_URL}")
    await page.goto(CATEGORIES_URL, wait_until="networkidle")
    await page.wait_for_timeout(1500)

    # Пробуем разные селекторы — что-то сработает
    cats = await page.eval_on_selector_all(
        'a[href*="/category/"]',
        """els => els.map(e => ({
            url: e.href,
            name: (e.innerText || e.textContent || '').trim()
        }))"""
    )

    # Убираем дубликаты по URL
    seen = {}
    for c in cats:
        if c["url"] and c["url"] not in seen:
            seen[c["url"]] = c["name"] or "Категория"
    result = [{"url": u, "name": n} for u, n in seen.items()]
    print(f"[+] Найдено категорий: {len(result)}")
    for c in result[:10]:
        print(f"    • {c['name']} → {c['url']}")
    return result


async def collect_books_in_category(page, cat_url, cat_name):
    """Собирает все книги в категории (с пагинацией)."""
    print(f"\n[*] Категория: {cat_name}")
    books = []
    page_num = 1
    while True:
        url = cat_url if page_num == 1 else f"{cat_url}?page={page_num}"
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
        except Exception:
            break
        await page.wait_for_timeout(1200)

        # Прокрутка (ленивая загрузка)
        await page.evaluate("""
            async () => {
                await new Promise(r => {
                    let h = 0;
                    const t = setInterval(() => {
                        window.scrollBy(0, 600);
                        h += 600;
                        if (h >= document.body.scrollHeight) { clearInterval(t); r(); }
                    }, 250);
                });
            }
        """)
        await page.wait_for_timeout(1000)

        # Собираем ссылки на книги
        found = await page.eval_on_selector_all(
            'a[href*="/book/"], a[href*="/kitob/"]',
            """els => els.map(e => ({
                url: e.href,
                title: (e.innerText || e.textContent || '').trim()
            }))"""
        )

        new_books = []
        for b in found:
            if b["url"] and b["url"] not in seen_books:
                new_books.append(b)
                seen_books.add(b["url"])

        if not new_books:
            break

        books.extend(new_books)
        print(f"    страница {page_num}: +{len(new_books)} книг (всего {len(books)})")

        # Проверяем, есть ли следующая страница
        has_next = await page.query_selector('a[rel="next"], .pagination .next:not(.disabled), a.next-page')
        if not has_next:
            break

        page_num += 1
        if page_num > 50:  # защита от бесконечного цикла
            break

    return books


async def download_book(page, book_url, save_folder):
    """Скачивает одну книгу в указанную папку."""
    try:
        await page.goto(book_url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)

        # Ссылка на скачивание
        dl = await page.query_selector(
            'a[href$=".pdf"], a[href$=".djvu"], a[href$=".epub"], '
            'a.download-link, a[download], a.btn-download'
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

        # Имя файла
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

        # Проверка размера
        body = await resp.body()
        size_mb = len(body) / (1024 * 1024)
        if size_mb > MAX_SIZE_MB:
            print(f"    [!] {filename} — {size_mb:.1f} МБ, пропуск")
            return None

        # Пропуск существующих
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
        categories = await collect_categories(page)

        total_new = 0
        for i, cat in enumerate(categories, 1):
            print(f"\n{'='*60}")
            print(f"[{i}/{len(categories)}] {cat['name']}")
            print('='*60)

            books = await collect_books_in_category(page, cat["url"], cat["name"])
            folder = BOOKS_ROOT / safe_folder(cat["name"])

            for b in books:
                result = await download_book(page, b["url"], folder)
                if result:
                    total_new += 1
                await asyncio.sleep(1.2)

        await browser.close()

    print(f"\n[+] Всего новых книг: {total_new}")


if __name__ == "__main__":
    asyncio.run(main())
