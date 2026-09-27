#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
news_fetch.py — сборщик официальных новостей для «Китобхона».

Источники — ВСЕ сайты из раздела «Сомонаҳои давлатӣ», которые открываются
во встроенном браузере приложения (mmk.tj и подобные исключены):

  1. Президент          — API  https://controlpanel.president.tj/api/home-event?event_type=news&lang_id=1
  2. АМИТ «Ховар»       — RSS  https://khovar.tj/feed/
  3. Вазорати корҳои хориҷӣ (МЗС) — HTML https://mfa.tj/tg/main/ittiloot/khabarho-va-ruidodho
                              (у сайта неполная цепочка сертификата — SSL не проверяем)
  4. Вазорати маориф    — HTML https://maorif.tj/news/other (новости встроены в Alpine JSON)
  5. Маркази миллии тестӣ — RSS https://ntc.tj/tj/?format=feed&type=rss
  6. Китобхонаи миллии Тоҷикистон — RSS https://kmt.tj/feed/
  7. Ҳокимияти Душанбе  — HTML https://dushanbe.tj
  8. Ҳокимияти Хатлон   — RSS  http://khatlon.tj/?feed=rss2 (ссылки http:// → открываются снаружи)

Берутся только новости за последние NEWS_HOURS часов (по умолчанию 24).
Источники ЧЕРЕДУЮТСЯ по кругу (round-robin) — в ленте всегда представлен
каждый сайт, а не один главный источник.
Результат: news.json в корне репозитория. Недоступный источник не ломает сборку.

Запуск: python3 tools/news_fetch.py  (или автоматически .github/workflows/news.yml)
"""

import html as htmllib
import json
import os
import re
import ssl
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

NEWS_HOURS = int(os.environ.get('NEWS_HOURS', '24'))
MAX_ITEMS = int(os.environ.get('NEWS_MAX_ITEMS', '60'))
OUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'news.json')
UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 KitobkhonaNews/2.0'
TZ_TJ = timezone(timedelta(hours=5))  # Душанбе UTC+5


def log(msg):
    print('[%s] %s' % (datetime.now().strftime('%H:%M:%S'), msg), flush=True)


def fetch(url, retries=2, timeout=45, insecure=False):
    """GET с повторами; insecure=True — не проверять SSL (mfa.tj, неполная цепочка)."""
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml,application/json,*/*',
                'Accept-Language': 'tg,ru,en',
            })
            ctx = None
            if insecure:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return r.read().decode('utf-8', 'ignore')
        except Exception as e:
            if attempt == retries:
                log('  ! недоступно: %s (%s)' % (url, str(e)[:80]))
                return None
            time.sleep(2)


def clean(text):
    text = htmllib.unescape(text or '')
    text = re.sub(r'<[^>]+>', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def cut(text, n=280):
    text = (text or '').strip()
    if len(text) <= n:
        return text
    return text[:n].rsplit(' ', 1)[0] + '…'


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
    if not src.startswith(('http://', 'https://')) or src.endswith('.svg'):
        return ''
    return src


def in_window(dt, hours=None):
    if dt is None:
        return False
    try:
        return datetime.now(timezone.utc) - dt <= timedelta(hours=hours or NEWS_HOURS)
    except Exception:
        return False


SITE_SHOTS = {
    'Президенти Тоҷикистон': 'assets/sites/president.jpg',
    'АМИТ «Ховар»': 'assets/sites/khovar.jpg',
    'Вазорати корҳои хориҷӣ': 'assets/sites/mfa.jpg',
    'Вазорати маориф ва илм': 'assets/sites/maorif.jpg',
    'Маркази миллии тестӣ': 'assets/sites/ntc.jpg',
    'Китобхонаи миллии Тоҷикистон': 'assets/sites/kmt.jpg',
    'Ҳокимияти Душанбе': 'assets/sites/dushanbe.jpg',
    'Ҳокимияти Хатлон': 'assets/sites/khatlon.jpg',
}


def mk_item(title, url, source, dt, image='', desc='', external=None, fallback=False):
    if external is None:
        external = url.startswith('http://')
    return {
        'title': cut(title, 130),
        'url': url,
        'source': source,
        'published': dt.astimezone(timezone.utc).isoformat(),
        'image': image or '',
        'desc': cut(desc, 280),
        'external': bool(external),
        'site': SITE_SHOTS.get(source, ''),
        'fallback': bool(fallback),
    }


# ---------------------------------------------------------------- RSS ---
def parse_rss(xml, source, base, hours=None):
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
                    dt = dt.replace(tzinfo=TZ_TJ)
            except Exception:
                dt = None
        if not in_window(dt, hours):
            continue
        body = (cdata.group(1) if cdata else '') or (desc.group(1) if desc else '')
        items.append(mk_item(title, url, source, dt,
                             image=first_image(body, base),
                             desc=clean(body)))
    return items


# ----------------------------------------------------------- PRESIDENT ---
def parse_president(json_text, hours=None, with_details=True):
    """API controlpanel.president.tj: data[] → title, id, publish_date."""
    try:
        d = json.loads(json_text)
        rows = d.get('data') or []
    except Exception:
        return []
    items = []
    for it in rows:
        title = clean(it.get('title') or '')
        nid = it.get('id')
        if not title or not nid:
            continue
        when = it.get('publish_date') or it.get('news_date') or it.get('created_at') or ''
        try:
            dt = datetime.strptime(when[:19], '%Y-%m-%d %H:%M:%S').replace(tzinfo=TZ_TJ)
        except Exception:
            continue
        if not in_window(dt, hours):
            continue
        items.append(mk_item(title, 'https://president.tj/event/news/%s' % nid,
                             'Президенти Тоҷикистон', dt,
                             desc=clean(it.get('description') or '')))
    # матни пурраи хабар аз саҳифаи тафсилотӣ (API ба рӯйхат расм намедиҳад)
    if with_details:
        for it in items[:12]:
            det = fetch('https://controlpanel.president.tj/api/event/show?id=%s' % it['url'].rsplit('/', 1)[-1], timeout=20)
            if not det:
                continue
            try:
                d = json.loads(det).get('data') or {}
            except Exception:
                continue
            text = d.get('text') or ''
            if text and not it['desc']:
                it['desc'] = cut(clean(text), 280)
            m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', text)
            if m and not it['image']:
                u = m.group(1).strip()
                if u.startswith('//'):
                    u = 'https:' + u
                elif u.startswith('/'):
                    u = 'https://president.tj' + u
                if u.startswith('https://'):
                    it['image'] = u
            time.sleep(0.3)
    return items


# -------------------------------------------------------------- MFA ---
def parse_mfa(html, hours=None):
    """Список: <li> <a href=…/view/ID/slug>Заголовок</a> <div class="text">…</div> <span class="date">DD.MM.YYYY HH:MM</span>"""
    items = []
    for m in re.finditer(
            r'<a href="(https://mfa\.tj/tg/main/view/[^"]+)"[^>]*>\s*(.*?)\s*</a>\s*'
            r'<div class="text">(.*?)</div>\s*<span class="date">([\d\.]+)(?:\s+(\d{2}:\d{2}))?</span>',
            html, re.S):
        url, title_raw, desc_raw, date_s, time_s = m.groups()
        title = clean(title_raw)
        if not title:
            continue
        try:
            dt = datetime.strptime(date_s.strip() + ' ' + (time_s or '12:00'), '%d.%m.%Y %H:%M').replace(tzinfo=TZ_TJ)
        except Exception:
            continue
        if not in_window(dt, hours):
            continue
        items.append(mk_item(title, url, 'Вазорати корҳои хориҷӣ', dt, desc=clean(desc_raw)))
    return items


# ------------------------------------------------------------ MAORIF ---
def js_unescape(s):
    """JS-строка в одинарных кавычках → Python: \\\\ → \\, \\' → ', \\/ → / …"""
    out = []
    i = 0
    simple = {'\\': '\\', "'": "'", '"': '"', 'n': '\n', 't': '\t', 'r': '\r', '/': '/', 'b': '\b', 'f': '\f'}
    while i < len(s):
        c = s[i]
        if c == '\\' and i + 1 < len(s):
            nxt = s[i + 1]
            if nxt in simple:
                out.append(simple[nxt]); i += 2; continue
            if nxt == 'u' and i + 5 < len(s):
                try:
                    out.append(chr(int(s[i + 2:i + 6], 16))); i += 6; continue
                except ValueError:
                    pass
        out.append(c)
        i += 1
    return ''.join(out)


def parse_maorif(html, hours=None):
    """Новости встроены в страницу как Alpine.data('news', … JSON.parse('…'))."""
    m = re.search(r"JSON\.parse\('(.*?)'\)", html, re.S)
    if not m:
        return []
    try:
        # JS-строка → обычный текст (\\u0022 → \u0022), затем JSON
        data = json.loads(js_unescape(m.group(1)))
    except Exception:
        return []
    items = []
    for it in data:
        title = clean(it.get('title') or '')
        slug = (it.get('slug') or '').strip()
        if not title or not slug:
            continue
        try:
            dt = datetime.strptime(it.get('createdAt', ''), '%d.%m.%Y').replace(tzinfo=TZ_TJ,
                hour=12)  # время не указано — берём полдень, чтобы не выпасть из окна
        except Exception:
            continue
        if not in_window(dt, hours):
            continue
        image = ''
        try:
            im = (it.get('image') or [{}])[0]
            image = (im.get('mobileUrl') or im.get('tabletUrl') or im.get('orgUrl') or '')
            image = image.replace('\\/', '/').replace('\\u002f', '/')
        except Exception:
            image = ''
        if image and not image.startswith('http'):
            image = 'https://maorif.tj' + image if image.startswith('/') else ''
        items.append(mk_item(title, 'https://maorif.tj/news/other/' + slug,
                             'Вазорати маориф ва илм', dt, image=image,
                             desc=clean(it.get('shortDescription') or '')))
    return items


# ----------------------------------------------------------- DUSHANBE ---
def parse_dushanbe(html, hours=None):
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
            d = datetime.strptime(date_s.strip(), '%Y-%m-%d').replace(tzinfo=TZ_TJ, hour=12)
        except Exception:
            continue
        if not in_window(d, hours):
            continue
        image = ''
        if img:
            image = img if img.startswith('http') else 'https://dushanbe.tj' + img
        items.append(mk_item(title, url, 'Ҳокимияти Душанбе', d, image=image))
    return items


# ---------------------------------------------------------------- MAIN ---
def main():
    # каждый источник: (имя, функция(hours) → список) — вызывается дважды:
    # сначала с окном 24ч; если пусто — с окном 7 дней (запасные, fallback:true)
    def src_president(h):
        x = fetch('https://controlpanel.president.tj/api/home-event?event_type=news&lang_id=1', timeout=30)
        return parse_president(x, hours=h) if x else []

    def src_khovar(h):
        x = fetch('https://khovar.tj/feed/', timeout=30)
        return parse_rss(x, 'АМИТ «Ховар»', 'https://khovar.tj', hours=h) if x else []

    def src_mfa(h):
        x = fetch('https://mfa.tj/tg/main/ittiloot/khabarho-va-ruidodho', timeout=45, insecure=True)
        return parse_mfa(x, hours=h) if x else []

    def src_maorif(h):
        x = fetch('https://maorif.tj/news/other', timeout=45)
        return parse_maorif(x, hours=h) if x else []

    def src_ntc(h):
        x = fetch('https://ntc.tj/tj/?format=feed&type=rss', timeout=30)
        return parse_rss(x, 'Маркази миллии тестӣ', 'https://ntc.tj', hours=h) if x else []

    def src_kmt(h):
        x = fetch('https://kmt.tj/feed/', timeout=75)
        return parse_rss(x, 'Китобхонаи миллии Тоҷикистон', 'https://kmt.tj', hours=h) if x else []

    def src_dushanbe(h):
        x = fetch('https://dushanbe.tj', timeout=30)
        return parse_dushanbe(x, hours=h) if x else []

    def src_khatlon(h):
        x = fetch('http://khatlon.tj/?feed=rss2', timeout=60)
        return parse_rss(x, 'Ҳокимияти Хатлон', 'http://khatlon.tj', hours=h) if x else []

    sources = [
        ('Президент', src_president),
        ('Ховар', src_khovar),
        ('МЗС', src_mfa),
        ('Маориф', src_maorif),
        ('НТЦ', src_ntc),
        ('КМТ', src_kmt),
        ('Душанбе', src_dushanbe),
        ('Хатлон', src_khatlon),
    ]

    jobs = []
    for name, fn in sources:
        got = fn(NEWS_HOURS)
        if not got:
            # свежих нет — берём до 2 новейших за неделю, помечаем fallback
            older = fn(24 * 7)
            take = 2
            if not older:
                # совсем тихо — берём самую новую (до 90 дней), чтобы сайт был представлен
                older = fn(24 * 90)
                take = 1
            older.sort(key=lambda x: x['published'], reverse=True)
            for it in older[:take]:
                it['fallback'] = True
            got = older[:take]
            log('%s: свежих нет → %d запасных' % (name, len(got)))
        else:
            log('%s: %d свежих новостей' % (name, len(got)))
        got.sort(key=lambda x: x['published'], reverse=True)
        jobs.append((name, got))

    # чередование round-robin: по одной новости от каждого источника по кругу
    mixed = []
    i = 0
    while len(mixed) < MAX_ITEMS:
        took = False
        for _, lst in jobs:
            if i < len(lst):
                mixed.append(lst[i])
                took = True
                if len(mixed) >= MAX_ITEMS:
                    break
        if not took:
            break
        i += 1

    # дедупликация по URL
    seen = set()
    dedup = []
    for it in mixed:
        if it['url'] in seen:
            continue
        seen.add(it['url'])
        dedup.append(it)

    out = {
        'version': 3,
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'hours': NEWS_HOURS,
        'count': len(dedup),
        'items': dedup,
    }
    tmp = OUT_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT_FILE)
    log('ГОТОВО: %d новостей → %s' % (len(dedup), os.path.abspath(OUT_FILE)))
    if not dedup:
        log('Новостей нет — файл всё равно записан (приложение скроет раздел).')


if __name__ == '__main__':
    main()
