"""
ЭТАП 1. Скачивает ВСЕ книги с nlt.tj в books/_inbox/ + index.json
Раскладка по категориям — отдельным скриптом distribute_books.py
"""

import asyncio
import os
import json
import re
import urllib.parse
from pathlib import Path
from urllib.parse import urljoin, urlparse
from playwright.async_api import async_playwright

BASE_URL = "http://nlt.tj"
LOGIN_URL = f"{BASE_URL}/signin"
JANR_URL = f"{BASE_URL}/janr"

USERNAME = os.environ.get("NLT_USERNAME", "")
PASSWORD = os.environ.get("NLT_PASSWORD", "")

INBOX = Path("books/_inbox")
INBOX.mkdir(parents=True, exist_ok=True)
INDEX_FILE = INBOX / "index.json"

MAX_SIZE_MB = 95
seen_books = set()


def safe_filename(name):
    name = urllib.parse.unquote(name)
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", " ", name).strip().rstrip(". ")
    return name or "book.pdf"


def load_index():
    if INDEX_FILE.exists():
        try:
            return json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def save_index(items):
    INDEX_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


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
    print(f"[*] Категории: {JANR_URL}")
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
        if c["url"] and c["name"] and c["url"] not in seen:
            seen[c["url"]] = c["name"]
    result = [{"url": u, "name": n} for u, n in seen.items()]
    print(f"[+] Категорий: {len(result)}")
    for c in result:
        print(f"    • {c['name']}")
    return result


async def collect_books_in_category(page, cat_url):
    books = []
    page_num = 1
    while True:
        if page_num == 1:
            url = cat_url
        else:
            m = re.search(r'/category/(\d+)', cat_url)
            url = f"{cat_url}?cat_id={m.group(1)}&page={page_num}" if m else f"{cat_url}?page={page_num}"
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
        has_next = await page.query_selector('a[rel="next"]')
        if not has_next:
            break
        page_num += 1
        if page_num > 100:
            break
    return books


async def download_book(page, book_url):
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

        target = INBOX / filename
        if target.exists():
            return filename  # уже скачано — вернём имя для индекса

        target.write_bytes(body)
        print(f"    [+] {filename} ({size_mb:.1f} МБ)")
        return filename

    except Exception as e:
        print(f"    [-] ошибка: {e}")
        return None


async def main():
    index = load_index()
    indexed_files = {item["file"] for item in index}

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
            print(f"\n[{i}/{len(categories)}] {cat['name']}")
            books = await collect_books_in_category(page, cat["url"])
            for b in books:
                filename = await download_book(page, b["url"])
                if filename and filename not in indexed_files:
                    index.append({
                        "file": filename,
                        "category": cat["name"],
                        "book_url": b["url"],
                        "book_title": b["title"],
                    })
                    indexed_files.add(filename)
                    total_new += 1
                    save_index(index)  # сохраняем после каждой книги
                await asyncio.sleep(1.2)

        await browser.close()

    save_index(index)
    print(f"\n[+] Скачано новых: {total_new}")
    print(f"[+] Всего в index.json: {len(index)}")
    print(f"[+] Все PDF лежат в books/_inbox/")


if __name__ == "__main__":
    asyncio.run(main())
