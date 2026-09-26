"""
ЭТАП 2. Читает books/_inbox/index.json и раскладывает PDF по категориям.
Использует существующие папки, дубликаты не создаёт.
"""

import json
import re
import shutil
from pathlib import Path

BOOKS_ROOT = Path("books")
INBOX = BOOKS_ROOT / "_inbox"
INDEX_FILE = INBOX / "index.json"

# Ручная карта для нестандартных случаев (где имя на сайте ≠ имя папки в репо)
MANUAL_MAP = {
    "китобҳои дарсӣ":               "Kitobhoi darsi",
    "китобхои дарси":               "Kitobhoi darsi",
    "kitobhoi darsi":               "Kitobhoi darsi",
    "китобҳо барои пешвои миллат":  "КИТОБҲО БАРОИ ПЕШВОИ МИЛЛАТ",
    "пешвои миллат":                "Пешвои Миллат",
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
    """Строит {нормализованный_путь: реальный_путь} для всех папок в books/."""
    index = {}
    for item in BOOKS_ROOT.rglob("*"):
        if item.is_dir() and "_inbox" not in item.parts:
            rel = item.relative_to(BOOKS_ROOT).as_posix()
            norm_key = "/".join(normalize(p) for p in rel.split("/"))
            index[norm_key] = rel
    return index


def find_target_folder(category_name, existing_index):
    """Определяет папку для категории. Возвращает реальный путь или None."""
    # 1. Ручная карта
    key = category_name.strip().lower()
    if key in MANUAL_MAP:
        real = MANUAL_MAP[key]
        # Проверяем, что такая папка действительно существует
        if (BOOKS_ROOT / real).exists():
            return real
        return real  # будет создана

    # 2. Автопоиск по нормализации
    norm_cat = normalize(category_name)
    if norm_cat in existing_index:
        return existing_index[norm_cat]

    # 3. Не нашли — создаём по имени с сайта
    safe = re.sub(r'[<>:"/\\|?*]', "_", category_name).strip()
    return safe


def main():
    if not INDEX_FILE.exists():
        print(f"[-] Нет {INDEX_FILE} — сначала запустите download_books.py")
        return

    index = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
    print(f"[+] Записей в index.json: {len(index)}")

    existing_index = build_existing_index()
    print(f"[+] Существующих папок: {len(existing_index)}")

    moved = 0
    skipped = 0
    not_found = 0

    for item in index:
        src = INBOX / item["file"]
        if not src.exists():
            not_found += 1
            continue

        category = item.get("category", "").strip()
        if not category:
            print(f"    [!] нет категории у {item['file']}")
            skipped += 1
            continue

        target_rel = find_target_folder(category, existing_index)
        target_dir = BOOKS_ROOT / target_rel
        target_dir.mkdir(parents=True, exist_ok=True)

        dst = target_dir / item["file"]
        if dst.exists():
            print(f"    [=] {item['file']} уже в {target_rel}")
            # Удаляем из inbox, т.к. файл уже на месте
            src.unlink()
            skipped += 1
            continue

        shutil.move(str(src), str(dst))
        print(f"    [+] {item['file']} → books/{target_rel}/")
        moved += 1

    print(f"\n[+] Перемещено: {moved}")
    print(f"[+] Уже было: {skipped}")
    print(f"[+] Не найдено в _inbox: {not_found}")

    # Если в _inbox больше нет PDF — удаляем служебные файлы
    remaining_pdfs = list(INBOX.glob("*.pdf"))
    if not remaining_pdfs:
        INDEX_FILE.unlink(missing_ok=True)
        try:
            INBOX.rmdir()
            print("[+] Папка _inbox удалена (пустая)")
        except OSError:
            pass
    else:
        print(f"[!] В _inbox осталось {len(remaining_pdfs)} PDF — не удаляю")


if __name__ == "__main__":
    main()
