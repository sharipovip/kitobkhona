"""
Загрузка книг с nlt.tj в sharipovip/books.
- Батчами по 30 шт, каждый батч коммитит и пушит.
- До 5 часов за один запуск, потом триггерит следующий.
- Продолжает с места остановки через _downloader_state.json.
"""

import asyncio
import os
import json
import re
import subprocess
import time
import urllib.parse
from pathlib import Path
from urllib.parse import urljoin, urlparse
from playwright.async_api import async_playwright

BASE_URL = "http://nlt.tj"
LOGIN_URL = f"{BASE_URL}/signin"
JANR_URL = f"{BASE_URL}/janr"

USERNAME = os.environ.get("NLT_USERNAME", "")
PASSWORD = os.environ.get("NLT_PASSWORD", "")

BOOKS_ROOT = Path("books")
STATE_FILE = BOOKS_ROOT / "_downloader_state.json"

MAX_SIZE_MB = 95
BATCH_SIZE = 30
MAX_RUNTIME_SECONDS = 5 * 3600

MANUAL_MAP = {
    "китобҳои дарсӣ": "Kitobhoi darsi",
    "китобхои дарси": "Kitobhoi darsi",
    "kitobhoi darsi": "Kitobhoi darsi",
    "китобҳо барои пешвои миллат": "КИТОБҲО БАРОИ ПЕШВОИ МИЛЛАТ",
    "пешвои миллат": "Пешвои Миллат",
}


def normalize(s):
    if not s:
        return ""
    s = str(s).strip().lower()
    trans = str.maketrans({
        "ӣ": "и", "ҳ": "х", "ҷ": "ч", "қ": "к",
        "ӯ": "у", "ғ": "г", "ё": "е",
        "’": "", "'": "", "`": "",
    })
    s = s.translate(trans)
    return re.sub(r"[^a-zа-яё0-9]+", "", s)


def build_existing_index():
    index = {}
    for item in BOOKS_ROOT.rglob("*"):
        if item.is_dir() and item.name != "_inbox":
            rel = item.relative_to(BOOKS_ROOT).as_posix()
            norm_key = "/".join(normalize(p) for p in rel.split("/"))
            index[norm_key] = rel
    return index


def resolve_folder(category_name, existing_index):
    key = category_name.strip().lower()
    if key in MANUAL_MAP:
        return MANUAL_MAP[key]
    norm_cat = normalize(category_name)
    if norm_cat in existing_index:
        return existing_index[norm_cat]
    return re.sub(r'[<>:"/\\|?*]', "_", category_name).strip() or "Без названия"


def safe_filename(name):
    name = urllib.parse.unquote(name)
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", " ", name).strip().rstrip(". ")
    return name or "book.pdf"


def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"completed_categories": []}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def git_commit_and_push(batch_num):
    print(f"\n[*] git commit + push (batch {batch_num})...")
    subprocess.run(["git", "add", "books/"], check=False)
    result = subprocess.run(["git", "diff", "--staged", "--quiet"])
    if result.returncode == 0:
        print("[i] Нет изменений — коммит не нужен")
        return True
    subprocess.run(["git", "commit", "-m", f"batch {batch_num}"], check=True)
    try:
        subprocess.run(["git", "push"], check=True)
        print(f"[+] Batch {batch_num} запушен")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[!] Ошибка push: {e}")
        return False


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
    print(f"[+] Найдено категорий: {len(result)}")
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
        await page.wait_for_timeout(800)
        found = await page.eval_on_selector_all(
            'a[href^="/book/"]',
            """els => els.map(e => ({
                url: e.href,
                title: (e.innerText || e.textContent || '').trim()
            }))"""
        )
        local_seen = set()
        unique = []
        for b in found:
            if b["url"] and b["url"] not in local_seen:
                local_seen.add(b["url"])
                unique.append(b)
        if not unique:
            break
        books.extend(unique)
        has_next = await page.query_selector('a[rel="next"]')
        if not has_next:
            break
        page_num += 1
        if page_num > 200:
            break
    return books


async def download_book(page, book_url, target_dir):
    try:
        await page.goto(book_url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(800)

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
            print(f"      [!] {filename} - {size_mb:.1f} MB, skip")
            return None

        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / filename
        if target.exists():
            print(f"      [=] already exists: {filename}")
            return None

        target.write_bytes(body)
        print(f"      [+] {filename} ({size_mb:.1f} MB)")
        return filename

    except Exception as e:
        print(f"      [-] error: {e}")
        return None


async def main():
    start_time = time.time()

    state = load_state()
    completed = set(state.get("completed_categories", []))
    print(f"[+] Already completed categories: {len(completed)}")

    existing_index = build_existing_index()
    print(f"[+] Existing folders: {len(existing_index)}")

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

        batch = 0
        batch_count = 0
        total_new = 0
        stopped_by_time = False
        stopped_by_push_error = False

        for i, cat in enumerate(categories, 1):
            if cat["url"] in completed:
                print(f"\n[{i}/{len(categories)}] [=] {cat['name']} - already done")
                continue

            print(f"\n{'='*60}")
            print(f"[{i}/{len(categories)}] {cat['name']}")
            print('='*60)

            target_rel = resolve_folder(cat["name"], existing_index)
            target_dir = BOOKS_ROOT / target_rel
            print(f"    -> folder: books/{target_rel}")

            books = await collect_books_in_category(page, cat["url"])
            print(f"    found books: {len(books)}")

            category_ok = True
            for b in books:
                elapsed = time.time() - start_time
                if elapsed > MAX_RUNTIME_SECONDS:
                    print(f"\n[!] Time limit reached ({elapsed/3600:.2f} h) - graceful exit")
                    stopped_by_time = True
                    category_ok = False
                    break

                filename = await download_book(page, b["url"], target_dir)
                if filename:
                    batch_count += 1
                    total_new += 1

                await asyncio.sleep(0.6)

                if batch_count >= BATCH_SIZE:
                    batch += 1
                    if not git_commit_and_push(batch):
                        stopped_by_push_error = True
                        category_ok = False
                        break
                    batch_count = 0
                    print(f"[+] Total new this run: {total_new}")

            if stopped_by_time or stopped_by_push_error:
                break

            if category_ok:
                completed.add(cat["url"])
                state["completed_categories"] = sorted(completed)
                save_state(state)
                print(f"    [OK] Category marked as completed")

        if batch_count > 0:
            batch += 1
            git_commit_and_push(batch)

        await browser.close()

    all_done = (len(completed) == len(categories))
    more_to_do = (not all_done) or stopped_by_time

    print(f"\n{'='*60}")
    print(f"[+] New this run: {total_new}")
    print(f"[+] Completed categories: {len(completed)} / {len(categories)}")
    print(f"[+] More runs needed: {'YES' if more_to_do else 'NO'}")

    Path("_more_to_do").write_text("yes" if more_to_do else "no", encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
