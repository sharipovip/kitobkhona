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
            async with page.expect_download(timeout=60000) as di:
                await dl.click()
            d = await di.value
            filename = d.suggested_filename

            # Проверка размера невозможна до скачивания — качаем во временный файл
            tmp_path = OUTPUT_DIR / ("__tmp__" + filename)
            await d.save_as(tmp_path)
            size_mb = tmp_path.stat().st_size / (1024 * 1024)

            if size_mb > 95:
                print(f"  [!] Пропуск: {filename} — {size_mb:.1f} МБ (> 95 МБ, GitHub не примет)")
                tmp_path.unlink(missing_ok=True)
                return False

            if filename.lower() in existing_files:
                print(f"  [=] Уже есть: {filename}")
                tmp_path.unlink(missing_ok=True)
                return False

            final_path = OUTPUT_DIR / filename
            tmp_path.rename(final_path)
            existing_files.add(filename.lower())
            print(f"  [+] Сохранено: {filename} ({size_mb:.1f} МБ)")
            return True

        # Обычная ссылка
        file_url = urljoin(BASE_URL, href)
        resp = await page.context.request.get(file_url)
        if not resp.ok:
            print(f"  [-] HTTP {resp.status}")
            return False

        # --- ПАРСИНГ ИМЕНИ ФАЙЛА (правильный, с учётом RFC 5987) ---
        cd = resp.headers.get("content-disposition", "")
        filename = None

        # RFC 5987: filename*=utf-8''имя.pdf
        m = re.search(r"filename\*=utf-8''([^;]+)", cd, re.IGNORECASE)
        if m:
            filename = urllib.parse.unquote(m.group(1).strip())

        # Обычный: filename="имя.pdf"
        if not filename:
            m = re.search(r'filename="?([^";]+)"?', cd, re.IGNORECASE)
            if m:
                filename = m.group(1).strip()

        # Фолбэк — из URL
        if not filename:
            filename = os.path.basename(urlparse(file_url).path) or "book.pdf"

        # Чистим имя
        filename = urllib.parse.unquote(filename)
        filename = re.sub(r'[<>:"/\\|?*]', "_", filename)
        filename = re.sub(r"\s+", " ", filename).strip()
        filename = filename.rstrip(". ")

        # --- ПРОВЕРКА РАЗМЕРА ---
        body = await resp.body()
        size_mb = len(body) / (1024 * 1024)

        if size_mb > 95:
            print(f"  [!] Пропуск: {filename} — {size_mb:.1f} МБ (> 95 МБ, GitHub не примет)")
            return False

        if filename.lower() in existing_files:
            print(f"  [=] Уже есть: {filename}")
            return False

        (OUTPUT_DIR / filename).write_bytes(body)
        existing_files.add(filename.lower())
        print(f"  [+] Сохранено: {filename} ({size_mb:.1f} МБ)")
        return True

    except Exception as e:
        print(f"  [-] Ошибка: {e}")
        return False
