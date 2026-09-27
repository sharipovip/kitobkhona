#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
news_fetch.py — сборщик официальных новостей для «Китобхона».

Источники (только государственные сайты, которые открываются
во встроенном браузере приложения; mmk.tj и подобные исключены):

  1. АМИТ «Ховар»      — https://khovar.tj/feed/          (RSS, главный источник)
  2. Маркази миллии тестӣ — https://ntc.tj/tj/?format=feed&type=rss (RSS)
  3. Ҳокимияти Хатлон  — http://khatlon.tj/?feed=rss2     (RSS; ссылки http:// → открываются снаружи)
  4. Ҳокимияти Душанбе — https://dushanbe.tj              (HTML, блоки «Хабарҳои охирин»)

Берутся только новости за последние NEWS_HOURS часов (по умолчанию 24).
Результат: news.json в корне репозитория. Пропущенные/недоступные источники
не ломают сборку — берётся то, что доступно.

Запуск: python3 tools/news_fetch.py  (или автоматически .github/workflows/news.yml)
"""

import html as htmllib
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

NEWS_HOURS = int(os.environ.get('NEWS_HOURS', '24'))
MAX_ITEMS = int(os.environ.get('NEWS_MAX_ITEMS', '60'))
OUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'news.json')
UA = 'Kitobkhona-News/1.0 (+official news aggregator for educational app)'


def log(msg):
    print('[%s] %s' % (datetime.now().strftime('%H:%M:%S'), msg), flush=True)


def fetch(url, retries=2, timeout=30):
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode('utf-8', 'ignore')
        except Exception as e:
            if attempt == retries:
                log('  ! недоступно: %s (%s)' % (url, e))
                return None
            time.sleep(2)


def clean(text):
    text = htmllib.unescape(text or '')
    text = re.sub(r'<[^>]+>', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def first_image(raw_html, base):
    if not raw_html:
        return ''
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', raw_html, re.I)
    if not m:
        return ''
    src = m.group(1).strip()
    if src.startswith('//'):
        src = 'https:' + src
    elif src.startswith('/'):
        src = base.rstrip('/') + src
    # http-картинки на https-странице будут заблокированы — пропускаем
    if src.startswith('http://'):
        return ''
    return src


def in_window(dt):
    if dt is None:
        return False
    try:
        return datetime.now(timezone.utc) - dt <= timedelta(hours=NEWS_HOURS)
    except Exception:
        return False


def parse_rss(xml, source, base):
    items = []
    for m in re.finditer(r'<item>(.*?)</item>', xml, re.S):
        raw = m.group(1)
        t = re.search(r'<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>', raw, re.S)
        l = re.search(r'<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</link>', raw, re.S)
        d = re.search(r'<pubDate>(.*?)</pubDate>', raw)
        desc = re.search(r'<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</description>', raw, re.S)
        cdata = re.search(r'<content:encoded>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</content:encoded>', raw, re.S)
        title = clean(t.group(1) if t else '')
        url = clean(l.group(1) if l else '')
        if not title or not url:
            continue
        dt = None
        if d:
            try:
                dt = parsedate_to_datetime(d.group(1).strip())
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                dt = None
        if not in_window(dt):
            continue
        items.append({
            'title': title,
            'url': url,
            'source': source,
            'published': dt.astimezone(timezone.utc).isoformat(),
            'image': first_image((cdata.group(1) if cdata else '') or (desc.group(1) if desc else ''), base),
            'external': url.startswith('http://'),
        })
    return items


def parse_dushanbe(html):
    """Главная dushanbe.tj: блоки <div class="item"> с датой и заголовком"""
    items = []
    for m in re.finditer(
            r'<div class="item">\s*<div class="thumb">\s*<a href="([^"]+)">(?:<img[^>]*src="([^"]+)"[^>]*>)?</a>\s*</div>\s*'
            r'<div class="info">\s*<div class="date">([\d\-]+)</div>\s*<div class="title"><a href="[^"]+">(.*?)</a></div>',
            html, re.S):
        url, img, date_s, title_raw = m.groups()
        title = clean(title_raw)
        if not title or not url:
            continue
        try:
            d = datetime.strptime(date_s.strip(), '%Y-%m-%d').replace(tzinfo=timezone(timedelta(hours=5)))
        except Exception:
            continue
        if not in_window(d.astimezone(timezone.utc)):
            continue
        image = ''
        if img:
            image = img if img.startswith('http') else 'https://dushanbe.tj' + img
            if image.startswith('http://'):
                image = ''
        items.append({
            'title': title,
            'url': url,
            'source': 'Ҳокимияти Душанбе',
            'published': d.astimezone(timezone.utc).isoformat(),
            'image': image,
            'external': False,
        })
    return items


def main():
    all_items = []

    # 1. Ховар (главный источник)
    xml = fetch('https://khovar.tj/feed/')
    if xml:
        got = parse_rss(xml, 'АМИТ «Ховар»', 'https://khovar.tj')
        log('Ховар: %d свежих новостей' % len(got))
        all_items += got

    # 2. Маркази миллии тестӣ
    xml = fetch('https://ntc.tj/tj/?format=feed&type=rss')
    if xml:
        got = parse_rss(xml, 'Маркази миллии тестӣ', 'https://ntc.tj')
        log('НТЦ: %d свежих новостей' % len(got))
        all_items += got

    # 3. Ҳокимияти вилояти Хатлон (ссылки http:// → в приложении открываются снаружи)
    xml = fetch('http://khatlon.tj/?feed=rss2')
    if xml:
        got = parse_rss(xml, 'Ҳокимияти Хатлон', 'http://khatlon.tj')
        log('Хатлон: %d свежих новостей' % len(got))
        all_items += got

    # 4. Ҳокимияти Душанбе (HTML)
    html = fetch('https://dushanbe.tj')
    if html:
        got = parse_dushanbe(html)
        log('Душанбе: %d свежих новостей' % len(got))
        all_items += got

    # сортировка: сначала самые свежие
    all_items.sort(key=lambda x: x['published'], reverse=True)
    all_items = all_items[:MAX_ITEMS]

    # дедупликация по URL
    seen = set()
    dedup = []
    for it in all_items:
        if it['url'] in seen:
            continue
        seen.add(it['url'])
        dedup.append(it)

    out = {
        'version': 1,
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'hours': NEWS_HOURS,
        'count': len(dedup),
        'items': dedup,
    }
    tmp = OUT_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT_FILE)
    log('ГОТОВО: %d новостей за последние %d ч → %s' % (len(dedup), NEWS_HOURS, os.path.abspath(OUT_FILE)))
    if not dedup:
        log('Свежих новостей нет — файл всё равно записан (приложение скроет раздел).')


if __name__ == '__main__':
    main()
