"""
Скачивание книг Эмомалӣ Раҳмонов с nlt.tj → в sharipovip/books/books/Пешвои Миллат
Существующие файлы пропускаются.
"""

import asyncio
import os
import re
import urllib.parse
from pathlib import Path
from urllib.parse import urljoin, urlparse
from playwright.async_api import async_playwright

# ============ НАСТРОЙКИ ============
LOGIN_URL    = "http://nlt.tj/login"
CATEGORY_URL = "http://nlt.tj/category/852"
BASE_URL     = "http://nlt.tj"

USERNAME = os.environ.get("NLT_USERNAME", "")
PASSWORD = os.environ.get("NLT_PASSWORD", "")

# Папка внутри репо sharipovip/books
OUTPUT_DIR = Path("books/Пешвои Миллат")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Существующие файлы — берём из рабочей копии репо
existing_files = {f.name.lower() for f in OUTPUT_DIR.glob("*") if f.is_file()}
print(f"[+] Уже в репо: {len(existing_files)} файлов")


# ============ АВТОРИЗАЦИЯ ============
async def login(page):
    print("[*] Логин...")
    await page.goto(LOGIN_URL, wait_until="networkidle")

    # Если селекторы не подойдут — замените на реальные из F12
    await page.fill('input[type="email"], input[name="email"], input[name="username"]', USERNAME)
    await page.fill('input[type="password"], input[name="password"]', PASSWORD)
    await page.click('button[type="submit"], input[type="submit"], .login-button')

    try:
        await page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        pass
    print("[+] Логин выполнен")


# ============ СБОР ССЫЛОК ============
async def collect_links(page):
    print(f"[*] Открываем категорию: {CATEGORY_URL}")
    await page.goto(CATEGORY_URL, wait_until="networkidle")

    # Прокрутка для ленивой загрузки
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
    await page.wait_for_timeout(2000)

    links = await page.eval_on_selector_all(
        'a[href*="/book/"], a[href*="/kitob/"], .book-item a, .card a',
        "els => els.map(e => e.href).filter(Boolean)"
    )
    links = sorted(set(links))
    print(f"[+] Найдено ссылок: {len(links)}")
    return links


# ============ СКАЧИВАНИЕ ============
async def download_book(page, url):
    print(f"[*] {url}")
    try:
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(1200)

        # Проверка автора
        text = await page.inner_text("body")
        if not re.search(r"Эмомал[ӣи]\s+Раҳмон", text, re.IGNORECASE):
            print("  [-] Не Эмомалӣ Раҳмонов — пропуск")
            return False

        dl = await page.query_selector(
            'a[href$=".pdf"], a[href$=".djvu"], a[href$=".epub"], '
            'a.download-link, a[download], button.download, a.btn-download'
        )
        if not dl:
            print("  [-] Кнопка скачивания не найдена")
            return False

        href = await dl.get_attribute("href")

        # Кнопка без href → JS-скачивание
        if not href:
            async with page.expect_download(timeout=30000) as di:
                await dl.click()
            d = await di.value
            filename = d.suggested_filename
            if filename.lower() in existing_files:
                print(f"  [=] Уже есть: {filename}")
                return False
            await d.save_as(OUTPUT_DIR / filename)
            existing_files.add(filename.lower())
            print(f"  [+] Сохранено: {filename}")
            return True

        # Обычная ссылка
        file_url = urljoin(BASE_URL, href)
        resp = await page.context.request.get(file_url)
        if not resp.ok:
            print(f"  [-] HTTP {resp.status}")
            return False

        cd = resp.headers.get("content-disposition", "")
        if "filename=" in cd:
            filename = cd.split("filename=")[-1].strip('"\'')
        else:
            filename = os.path.basename(urlparse(file_url).path) or "book.pdf"

        filename = urllib.parse.unquote(filename)
        filename = re.sub(r'[<>:"/\\|?*]', "_", filename)

        if filename.lower() in existing_files:
            print(f"  [=] Уже есть: {filename}")
            return False

        (OUTPUT_DIR / filename).write_bytes(await resp.body())
        existing_files.add(filename.lower())
        print(f"  [+] Сохранено: {filename}")
        return True

    except Exception as e:
        print(f"  [-] Ошибка: {e}")
        return False


# ============ MAIN ============
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
        links = await collect_links(page)

        downloaded = 0
        for i, link in enumerate(links, 1):
            print(f"\n[{i}/{len(links)}]")
            if await download_book(page, link):
                downloaded += 1
            await asyncio.sleep(1.5)

        await browser.close()

    print(f"\n[+] Новых книг: {downloaded}")


if __name__ == "__main__":
    asyncio.run(main())
