/* ============================================================
   president.js v101 — Хабарҳои сомонаи Президенти ҶТ (prezident.tj)
   Данные берутся НАПРЯМУЮ с открытого API controlpanel.president.tj
   (CORS разрешён: Access-Control-Allow-Origin: *). Полный текст и фото
   (flickr) показываются ВНУТРИ приложения — на сайт заходить не нужно.
   Если API недоступен — резервная копия из архива робота (books-репо).
   Используется: index.html (компактный раздел) + president.html.
   ============================================================ */
(function () {
  'use strict';

  var API = 'https://controlpanel.president.tj';
  var LANG_ID = 1; // тоҷикӣ
  var CACHE_KEY = 'kk_president_cache_v1';
  var CACHE_TTL = 30 * 60 * 1000; // 30 дақиқа
  var ARCHIVE_URLS = [
    'https://cdn.jsdelivr.net/gh/sharipovip/books@main/president/index.json',
    'https://raw.githubusercontent.com/sharipovip/books/main/president/index.json'
  ];

  // Категории — как в меню сайта prezident.tj
  var CATS = [
    { key: 'news',      label: 'Хабарҳо',              emoji: '📰' },
    { key: 'meetings',  label: 'Вохӯриҳо',             emoji: '🤝' },
    { key: 'speeches',  label: 'Суханрониҳо',          emoji: '🎤' },
    { key: 'trips',     label: 'Сафарҳо',              emoji: '✈️' },
    { key: 'documents', label: 'Санадҳо',              emoji: '📜' },
    { key: 'missives',  label: 'Паём',                 emoji: '✉️' },
    { key: 'telegrams', label: 'Барқияҳо',             emoji: '📨' },
    { key: 'calls',     label: 'Суҳбатҳои телефонӣ',   emoji: '☎️' }
  ];
  var CAT_BY_KEY = {};
  CATS.forEach(function (c) { CAT_BY_KEY[c.key] = c; });

  function apiGet(path, params, ms) {
    var qs = Object.keys(params || {}).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var url = API + path + (qs ? '?' + qs : '');
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms || 9000) : null;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  // ---------- список новостей категории (12 последних) ----------
  function fetchCat(catKey) {
    return apiGet('/api/home-event', { event_type: catKey, lang_id: LANG_ID })
      .then(function (d) {
        if (!d || !d.success || !Array.isArray(d.data)) throw new Error('bad data');
        return d.data.map(function (it) {
          return {
            id: it.id,
            title: it.title || '',
            publish: it.publish_date || it.news_date || it.created_at || '',
            has_photos: (it.news_flickr_image_relation || []).length > 0,
            photos_count: (it.news_flickr_image_relation || []).length,
            site_path: it.remote_url || ''
          };
        }).filter(function (it) { return it.id && it.title; });
      });
  }

  // ---------- фото новости (flickr): small — превью, original — крупные ----------
  var flickrCache = {};
  function fetchPhotos(id) {
    if (flickrCache[id]) return flickrCache[id];
    flickrCache[id] = apiGet('/api/event-flickr-images', { id: id, lang_id: LANG_ID }, 10000)
      .then(function (d) {
        var list = (d && d.success && Array.isArray(d.data)) ? d.data : [];
        var small = [], orig = [];
        list.forEach(function (p) {
          if (!p || !p.src) return;
          if (p.type === 'small') small.push(p.src);
          else if (p.type === 'original') orig.push(p.src);
        });
        var thumbs = small.length ? small : orig;
        return { thumbs: thumbs, big: orig };
      })
      .catch(function () { return { thumbs: [], big: [] }; });
    return flickrCache[id];
  }

  // ---------- полный текст новости ----------
  function fetchArticle(id) {
    return apiGet('/api/event/show', { id: id, lang_id: LANG_ID }, 12000)
      .then(function (d) {
        if (!d || !d.success || !d.data) throw new Error('Хабар ёфт нашуд');
        var a = d.data;
        return {
          id: a.id,
          title: a.title || '',
          publish: a.publish_date || a.news_date || '',
          teaser: a.teaser || '',
          text: a.text || a.teaser || '',
          site_path: a.remote_url || ''
        };
      });
  }

  // ---------- кэш прочитанной новости (localStorage, без TTL) ----------
  // Новость, открытая один раз, сохраняется на устройстве: в следующий раз
  // её можно посмотреть и ПОДЕЛИТЬСЯ ею даже без интернета.
  var ART_PREFIX = 'kk_prez_art_v1_';
  function artCacheGet(id) {
    try {
      var raw = localStorage.getItem(ART_PREFIX + id);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (c && c.a && c.a.title) return c;
    } catch (e) {}
    return null;
  }
  function artCachePrune() {
    try {
      var list = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(ART_PREFIX) !== 0) continue;
        var ts = 0;
        try { ts = (JSON.parse(localStorage.getItem(k)) || {}).ts || 0; } catch (e) {}
        list.push({ k: k, ts: ts });
      }
      list.sort(function (a, b) { return a.ts - b.ts; }); // старые первыми
      while (list.length > 30) { localStorage.removeItem(list.shift().k); }
    } catch (e) {}
  }
  function artCachePut(id, a, ph) {
    try {
      localStorage.setItem(ART_PREFIX + id, JSON.stringify({ ts: Date.now(), a: a, ph: ph || { thumbs: [], big: [] } }));
    } catch (e) {}
    artCachePrune(); // квота localStorage — держим максимум 30 новостей
  }

  // ---------- безопасный HTML (убираем скрипты/обработчики) ----------
  function sanitizeHtml(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach(function (n) { n.remove(); });
    tpl.content.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        if (name.indexOf('on') === 0) n.removeAttribute(attr.name);
        if (name === 'href' || name === 'src') {
          var v = attr.value.replace(/^\s+/, '');
          if (/^javascript:/i.test(v)) n.removeAttribute(attr.name);
        }
      });
    });
    return tpl.innerHTML;
  }

  // ---------- резервный архив (робот books-репо) ----------
  function fetchArchive() {
    var i = 0;
    function next() {
      if (i >= ARCHIVE_URLS.length) return Promise.reject(new Error('архив дастрас нест'));
      var u = ARCHIVE_URLS[i++];
      return fetch(u, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(next);
    }
    return next().then(function (d) {
      var byCat = {};
      (d.cats || []).forEach ? null : null;
      Object.keys(d.cats || {}).forEach(function (k) {
        byCat[k] = (d.cats[k] || []).map(function (it) {
          return {
            id: it.id, title: it.title, publish: it.publish || it.date || '',
            has_photos: !!it.thumb, photos_count: it.photos_count || (it.thumb ? 1 : 0),
            thumb: it.thumb || '', site_path: it.site_path || ''
          };
        });
      });
      if (!Object.keys(byCat).length) throw new Error('архив холӣ аст');
      return byCat;
    });
  }

  // ---------- загрузка всех категорий: кэш → API → архив ----------
  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.byCat || Date.now() - c.ts > CACHE_TTL) return null;
      return c.byCat;
    } catch (e) { return null; }
  }
  function writeCache(byCat) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), byCat: byCat })); } catch (e) {}
  }

  // live=true → всегда попробовать свежие данные (кэш вернём мгновенно через onCache)
  function loadAll(onCache) {
    var cached = readCache();
    if (cached && typeof onCache === 'function') { try { onCache(cached); } catch (e) {} }
    var jobs = CATS.map(function (c) {
      return fetchCat(c.key).then(
        function (items) { return [c.key, items]; },
        function () { return null; }
      );
    });
    return Promise.all(jobs).then(function (results) {
      var byCat = {}, ok = 0;
      results.forEach(function (r) { if (r) { byCat[r[0]] = r[1]; ok++; } });
      if (ok > 0) {
        // категориям, что не загрузились, берём из кэша (если есть)
        if (cached) CATS.forEach(function (c) { if (!byCat[c.key] && cached[c.key]) byCat[c.key] = cached[c.key]; });
        writeCache(byCat);
        return { byCat: byCat, from: 'live' };
      }
      if (cached) return { byCat: cached, from: 'cache' };
      return fetchArchive().then(function (byCat) { return { byCat: byCat, from: 'archive' }; });
    });
  }

  // «12 сентябр, 14:30» из "2026-09-12 14:30:00"
  var MONTHS_TJ = ['январ','феврал','март','апрел','май','июн','июл','август','сентябр','октябр','ноябр','декабр'];
  function formatDate(s) {
    var m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:(\d{2})?/);
    if (!m) return String(s || '');
    var mo = parseInt(m[2], 10) - 1;
    var out = parseInt(m[3], 10) + ' ' + (MONTHS_TJ[mo] || m[2]);
    if (m[4]) out += ', ' + m[4] + ':' + (m[5] || '00');
    return out;
  }
  function timeAgo(s) {
    var t = new Date(String(s || '').replace(' ', 'T')).getTime();
    if (!t || isNaN(t)) return formatDate(s);
    var min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return 'ҳозир';
    if (min < 60) return min + ' дақ. пеш';
    var h = Math.round(min / 60);
    if (h < 24) return h + ' соат пеш';
    var d = Math.round(h / 24);
    if (d < 30) return d + ' рӯз пеш';
    return formatDate(s);
  }

  window.PresidentNews = {
    CATS: CATS,
    loadArchive: fetchArchive,
    catByKey: function (k) { return CAT_BY_KEY[k] || null; },
    loadAll: loadAll,
    fetchCat: fetchCat,
    fetchPhotos: fetchPhotos,
    fetchArticle: fetchArticle,
    articleCacheGet: artCacheGet,
    articleCachePut: artCachePut,
    sanitizeHtml: sanitizeHtml,
    formatDate: formatDate,
    timeAgo: timeAgo,
    SITE_URL: 'https://prezident.tj'
  };
})();
