/* =====================================================================
   aliya-pdf.js — v161: PDF-и зебо дар худи дастгоҳ (бе сервер)
   • ҳар саҳифа: колонтитули боло «Алия · Китобхона» + навъи ҳуҷҷат/китоб,
     колонтитули поён: «Омода шуд бо Алия дар барномаи Китобхона» +
     истиноди Google Play + рақами саҳифа;
   • Markdown-и Алия: ## сарлавҳа, **ғафс**, [[Ном]], рӯйхат, рақамгузорӣ,
     > иқтибос, ҷадвал, «Савол 1.», А) Б) В) бо ✔, «Калид:»;
   • китобхонаҳо (pdf-lib + fontkit) ва шрифтҳо танҳо ҳангоми сабти
     аввалини PDF бор мешаванд (assets/libs, assets/fonts).
   ===================================================================== */
(function (window) {
  'use strict';

  var PLAY_URL = 'https://play.google.com/store/apps/details?id=com.kitobkhona.app';
  var PLAY_SHORT = 'play.google.com/store/apps/details?id=com.kitobkhona.app';

  var L10N = {
    tg: {
      brand: 'Алия · Китобхона',
      tagline: 'Ёвари зеҳни сунъии китобхон',
      made: 'Ин ҳуҷҷатро «Алия» — ёвари зеҳни сунъии барномаи «Китобхона» омода кардааст.',
      play: 'Китобхона дар Google Play:',
      page: 'саҳ.', of: 'аз',
      date: 'Сана',
      pages: 'саҳ.',
      check: 'Алия метавонад хато кунад — маълумоти муҳимро бо китоб санҷед.'
    },
    ru: {
      brand: 'Алия · Китобхона',
      tagline: 'ИИ-помощник читателя',
      made: 'Документ подготовлен «Алией» — ИИ-помощником приложения «Китобхона».',
      play: 'Китобхона в Google Play:',
      page: 'стр.', of: 'из',
      date: 'Дата',
      pages: 'стр.',
      check: 'Алия может ошибаться — сверяйте важные сведения с книгой.'
    },
    en: {
      brand: 'Aliya · Kitobkhona',
      tagline: 'AI reading assistant',
      made: 'This document was prepared by Aliya, the AI assistant of the Kitobkhona app.',
      play: 'Kitobkhona on Google Play:',
      page: 'p.', of: 'of',
      date: 'Date',
      pages: 'pp.',
      check: 'Aliya can make mistakes — check important facts against the book.'
    }
  };
  function tr(lang) { return L10N[lang] || L10N.tg; }

  // ранги бренд (ҳамон палитраи Алия)
  var C = {
    navy: [0.05, 0.11, 0.19], ink: [0.13, 0.15, 0.19], mut: [0.38, 0.43, 0.50], soft: [0.58, 0.62, 0.68],
    gold: [0.79, 0.62, 0.24], goldSoft: [0.97, 0.93, 0.83], brown: [0.54, 0.35, 0.0], green: [0.12, 0.48, 0.23],
    line: [0.86, 0.88, 0.91], head: [0.10, 0.23, 0.36], quoteBg: [0.97, 0.96, 0.93], tableHead: [0.93, 0.95, 0.97]
  };

  /* ------------------------- боркунии китобхонаҳо ------------------------- */
  function scriptBase() {
    var s = document.querySelector('script[src*="aliya-pdf.js"]') || document.querySelector('script[src*="aliya-tasks.js"]');
    return s ? s.src.replace(/aliya-(pdf|tasks)\.js.*$/, '') : '';
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('Скрипт бор нашуд: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function fetchBytes(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.arrayBuffer(); });
  }
  var libsPromise = null;
  function ensureLibs() {
    if (libsPromise) return libsPromise;
    var base = scriptBase(), libs = base + '../assets/libs/', fonts = base + '../assets/fonts/';
    libsPromise = Promise.all([
      window.PDFLib ? Promise.resolve() : loadScript(libs + 'pdf-lib.min.js'),
      window.fontkit ? Promise.resolve() : loadScript(libs + 'fontkit.umd.min.js'),
      fetchBytes(fonts + 'NotoSans-Regular.sub.ttf'),
      fetchBytes(fonts + 'NotoSans-Bold.sub.ttf'),
      fetchBytes(fonts + 'NotoSans-Italic.sub.ttf'),
      fetchBytes(fonts + 'DejaVuSym.sub.ttf')
    ]).then(function (r) {
      if (!window.PDFLib || !window.fontkit) throw new Error('pdf-lib бор нашуд');
      return { reg: r[2], bold: r[3], ital: r[4], sym: r[5] };
    }).catch(function (e) { libsPromise = null; throw e; });
    return libsPromise;
  }

  /* ------------------------------- Markdown ------------------------------- */
  // Сатрҳоро ба блокҳо табдил медиҳад
  function parseBlocks(md) {
    var lines = String(md || '').replace(/\r/g, '').split('\n'), out = [], i = 0, m;
    while (i < lines.length) {
      var raw = lines[i].replace(/\s+$/, ''), line = raw.trim();
      if (!line) { i++; continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { out.push({ k: 'rule' }); i++; continue; }
      if (/^\|.*\|$/.test(line)) {
        var rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          var l = lines[i].trim();
          if (!/^\|[\s:|-]+\|$/.test(l)) rows.push(l.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }));
          i++;
        }
        if (rows.length) out.push({ k: 'table', rows: rows });
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { out.push({ k: m[1].length <= 2 ? 'h2' : 'h3', t: m[2] }); i++; continue; }
      if ((m = line.match(/^>\s?(.*)$/))) {
        var q = [m[1]]; i++;
        while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
        out.push({ k: 'quote', t: q.join(' ') }); continue;
      }
      if ((m = line.match(/^(?:🔑\s*)?((?:Калид|Ключ|Answer key|Key)\s*[:：].*)$/i))) { out.push({ k: 'key', t: m[1] }); i++; continue; }
      if ((m = line.match(/^((?:Савол|Вопрос|Question)\s*\d+\s*[.):].*)$/i))) { out.push({ k: 'qhead', t: m[1] }); i++; continue; }
      if ((m = line.match(/^([АБВГДабвгдABCDabcd])\s*[).]\s+(.*)$/))) {
        var ok = /[✔✓]\s*$/.test(m[2]);
        out.push({ k: 'opt', mark: m[1] + ')', t: m[2].replace(/\s*[✔✓]\s*$/, ''), ok: ok }); i++; continue;
      }
      if ((m = raw.match(/^(\s*)[-•*]\s+(.*)$/))) { out.push({ k: 'li', lvl: m[1].length >= 2 ? 1 : 0, mark: '•', t: m[2] }); i++; continue; }
      if ((m = raw.match(/^(\s*)(\d+[.)])\s+(.*)$/))) { out.push({ k: 'li', lvl: m[1].length >= 2 ? 1 : 0, mark: m[2], t: m[3] }); i++; continue; }
      out.push({ k: 'p', t: line }); i++;
    }
    return out;
  }
  // Сатр → қисмҳо бо услуб: **ғафс**, [[Ном]], *курсив*
  function parseInline(text, base) {
    base = base || {};
    var segs = [], re = /(\[\[[^\]]+\]\]|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__)/g, last = 0, m;
    text = String(text || '').replace(/`([^`]+)`/g, '$1');
    function push(t, st) { if (t) segs.push({ t: t, b: !!st.b, i: !!st.i, c: st.c || base.c || null }); }
    while ((m = re.exec(text))) {
      push(text.slice(last, m.index), base);
      var tok = m[0];
      if (tok.slice(0, 2) === '[[') push(tok.slice(2, -2), { b: true, i: true, c: C.brown });
      else if (tok.slice(0, 3) === '***') push(tok.slice(3, -3), { b: true, i: true, c: base.c });
      else push(tok.slice(2, -2), { b: true, i: base.i, c: base.c });
      last = m.index + tok.length;
    }
    push(text.slice(last).replace(/\[\[|\]\]|\*\*/g, ''), base);
    return segs;
  }
  // эмодзиҳо дар шрифт нестанд — тоза мекунем, аломатҳои маъмулро иваз мекунем
  function sanitize(s) {
    return String(s || '')
      .replace(/[✅☑]/g, '✓').replace(/[❌✖]/g, '✗').replace(/[➡➜➔]/g, '→')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{2612}\u{2614}-\u{265F}\u{2668}-\u{2711}\u{2719}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F\u200D]/gu, '')
      .replace(/\t/g, '  ');
  }

  /* -------------------------------- Сохтан -------------------------------- */
  /**
   * build({ title, subtitle, markdown, lang:'tg'|'ru'|'en', docType, book })
   * → Promise<Blob>
   */
  async function build(opt) {
    var raw = await ensureLibs();
    var PDFLib = window.PDFLib, rgb = PDFLib.rgb;
    var doc = await PDFLib.PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    // шрифтҳо аллакай кӯтоҳ (subset) шудаанд — пурра ҷойгир мекунем (subset-и pdf-lib баъзан фосилаҳоро вайрон мекунад)
    var F = {
      reg: await doc.embedFont(raw.reg, { subset: false }),
      bold: await doc.embedFont(raw.bold, { subset: false }),
      ital: await doc.embedFont(raw.ital, { subset: false }),
      sym: await doc.embedFont(raw.sym, { subset: false })
    };
    var FK = {
      reg: window.fontkit.create(new Uint8Array(raw.reg)),
      sym: window.fontkit.create(new Uint8Array(raw.sym))
    };
    var T = tr(opt.lang);
    var W = 595.28, H = 841.89, ML = 56, MR = 50, MT = 74, MB = 78, CW = W - ML - MR;

    var glyphCache = {};
    function hasMain(ch) {
      if (glyphCache[ch] !== undefined) return glyphCache[ch];
      var cp = ch.codePointAt(0), v = cp < 0x80 ? 1 : (FK.reg.hasGlyphForCodePoint(cp) ? 1 : (FK.sym.hasGlyphForCodePoint(cp) ? 2 : 0));
      glyphCache[ch] = v; return v;
    }
    function fontFor(st) { return st.b ? F.bold : (st.i ? F.ital : F.reg); }
    // матн → қисмҳо аз рӯи шрифт (асосӣ / аломатҳо); аломатҳои бе шрифт партофта мешаванд
    function pieces(text, st) {
      var out = [], cur = '', curF = null;
      Array.from(text).forEach(function (ch) {
        var h = hasMain(ch); if (!h) return;
        var f = h === 2 ? F.sym : fontFor(st);
        if (f !== curF && cur) { out.push({ t: cur, f: curF }); cur = ''; }
        curF = f; cur += ch;
      });
      if (cur) out.push({ t: cur, f: curF });
      return out;
    }
    function widthOf(text, st, size) {
      return pieces(text, st).reduce(function (a, p) { return a + p.f.widthOfTextAtSize(p.t, size); }, 0);
    }

    var pages = [], page = null, y = 0;
    function newPage() { page = doc.addPage([W, H]); pages.push(page); y = H - MT; }
    function ensure(h) { if (!page || y - h < MB) newPage(); }

    function drawPieces(text, st, x, yy, size) {
      pieces(text, st).forEach(function (p) {
        page.drawText(p.t, { x: x, y: yy, size: size, font: p.f, color: rgb.apply(null, st.c || C.ink) });
        x += p.f.widthOfTextAtSize(p.t, size);
      });
      return x;
    }

    // Абзац бо гузариши сатр (wrap) — калима ба калима
    function paragraph(segs, o) {
      var size = o.size || 10.6, lh = o.lh || size * 1.48, x0 = ML + (o.indent || 0), maxW = CW - (o.indent || 0) - (o.rpad || 0);
      var words = [];
      segs.forEach(function (s) {
        sanitize(s.t).split(/(\s+)/).forEach(function (w) { if (w) words.push({ t: w, st: s, sp: /^\s+$/.test(w) }); });
      });
      // ҷудо кардан ба сатрҳо
      var lines = [], cur = [], curW = 0;
      words.forEach(function (w) {
        if (w.sp) { if (cur.length) { cur.push({ t: ' ', st: w.st, sp: true }); curW += widthOf(' ', w.st, size); } return; }
        var ww = widthOf(w.t, w.st, size);
        if (curW + ww > maxW && cur.length) {
          while (cur.length && cur[cur.length - 1].sp) { curW -= widthOf(' ', cur.pop().st, size); }
          lines.push(cur); cur = []; curW = 0;
        }
        // калимаи хеле дароз — бо ҳарфҳо мебурем
        if (ww > maxW) {
          var part = '';
          Array.from(w.t).forEach(function (ch) {
            if (widthOf(part + ch, w.st, size) > maxW) { lines.push([{ t: part, st: w.st }]); part = ''; }
            part += ch;
          });
          w = { t: part, st: w.st }; ww = widthOf(part, w.st, size);
        }
        cur.push(w); curW += ww;
      });
      while (cur.length && cur[cur.length - 1].sp) cur.pop();
      if (cur.length) lines.push(cur);
      if (!lines.length) return;
      var first = true;
      lines.forEach(function (ln, li) {
        ensure(lh);
        if (first && o.onFirstLine) o.onFirstLine(y - size);
        first = false;
        var x = x0;
        if (o.align === 'center') {
          var lw = ln.reduce(function (a, w) { return a + widthOf(w.t, w.st, size); }, 0);
          x = ML + (CW - lw) / 2;
        }
        var gap = 0;
        if (o.justify && li < lines.length - 1) {
          var spaces = ln.filter(function (w) { return w.sp; }).length;
          var used = ln.reduce(function (a, w) { return a + widthOf(w.t, w.st, size); }, 0);
          if (spaces && maxW - used < maxW * 0.25) gap = (maxW - used) / spaces;
        }
        if (o.bar) page.drawRectangle({ x: ML + (o.indent || 0) - 12, y: y - lh + size * 0.25, width: 2.4, height: lh, color: rgb.apply(null, o.bar) });
        ln.forEach(function (w) {
          if (w.sp) { x += widthOf(' ', w.st, size) + gap; return; }
          x = drawPieces(w.t, w.st, x, y - size, size);
        });
        y -= lh;
      });
    }

    function block(b) {
      var segs;
      switch (b.k) {
        case 'h2':
          y -= 8; ensure(40);
          paragraph(parseInline(b.t, { b: true, c: C.head }), { size: 13.2, lh: 18 });
          page.drawRectangle({ x: ML, y: y + 0.5, width: 34, height: 1.6, color: rgb.apply(null, C.gold) });
          y -= 8; break;
        case 'h3':
          y -= 5; ensure(30);
          paragraph(parseInline(b.t, { b: true, c: C.navy }), { size: 11.4, lh: 16 });
          y -= 2; break;
        case 'qhead':
          y -= 6; ensure(30);
          paragraph(parseInline(b.t, { b: true, c: C.navy }), { size: 10.8 }); break;
        case 'opt':
          segs = [{ t: b.mark + '  ', b: true, c: b.ok ? C.green : C.mut }].concat(parseInline(b.t, b.ok ? { b: true, c: C.green } : {}));
          if (b.ok) segs.push({ t: '  ✓', b: true, c: C.green });
          paragraph(segs, { indent: 18 }); break;
        case 'li':
          var ind = 16 + b.lvl * 16;
          paragraph(parseInline(b.t, {}), {
            indent: ind,
            onFirstLine: function (yy) {
              var st = { b: b.mark !== '•', c: b.mark === '•' ? C.gold : C.head };
              drawPieces(b.mark, st, ML + ind - (b.mark === '•' ? 10 : widthOf(b.mark, st, 10.6) + 5), yy, 10.6);
            }
          });
          y -= 1.5; break;
        case 'quote':
          y -= 3;
          paragraph(parseInline('«' + b.t.replace(/^[«"]|[»"]$/g, '') + '»', { i: true, c: C.mut }), { indent: 22, bar: C.gold });
          y -= 4; break;
        case 'key':
          y -= 8; ensure(30);
          paragraph(parseInline(b.t, { b: true, c: C.navy }), { size: 11 }); break;
        case 'rule':
          y -= 6; ensure(10);
          page.drawLine({ start: { x: ML, y: y }, end: { x: W - MR, y: y }, thickness: 0.6, color: rgb.apply(null, C.line) });
          y -= 8; break;
        case 'table':
          table(b.rows); break;
        default:
          paragraph(parseInline(b.t, {}), { justify: true });
          y -= 4.5;
      }
    }

    function table(rows) {
      var n = Math.max.apply(null, rows.map(function (r) { return r.length; }));
      var size = 9.4, pad = 5, lh = size * 1.4;
      // васеъии сутунҳо аз рӯи дарозии матн
      var weights = [];
      for (var c = 0; c < n; c++) weights[c] = Math.max(4, Math.min(40, Math.max.apply(null, rows.map(function (r) { return String(r[c] || '').length; }))));
      var sum = weights.reduce(function (a, b) { return a + b; }, 0), cw = weights.map(function (w) { return CW * w / sum; });
      function wrap(text, st, maxW) {
        var words = sanitize(text).split(/\s+/), lines = [], cur = '';
        words.forEach(function (w) {
          var t = cur ? cur + ' ' + w : w;
          if (widthOf(t, st, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
        });
        if (cur) lines.push(cur);
        return lines.length ? lines : [''];
      }
      y -= 4;
      rows.forEach(function (r, ri) {
        var st = ri === 0 ? { b: true, c: C.navy } : { c: C.ink };
        var cells = [], hmax = 0;
        for (var c = 0; c < n; c++) {
          var txt = String(r[c] || '').replace(/\*\*|\[\[|\]\]/g, '');
          var ls = wrap(txt, st, cw[c] - pad * 2); cells.push(ls); hmax = Math.max(hmax, ls.length);
        }
        var rh = hmax * lh + pad * 2;
        ensure(rh);
        var x = ML;
        for (c = 0; c < n; c++) {
          page.drawRectangle({ x: x, y: y - rh, width: cw[c], height: rh, borderColor: rgb.apply(null, C.line), borderWidth: 0.6,
            color: ri === 0 ? rgb.apply(null, C.tableHead) : undefined });
          cells[c].forEach(function (ln, li) { drawPieces(ln, st, x + pad, y - pad - size - li * lh + 1, size); });
          x += cw[c];
        }
        y -= rh;
      });
      y -= 8;
    }

    /* ---------- саҳифаи аввал: сарлавҳа ---------- */
    newPage();
    paragraph(parseInline(sanitize(opt.title || 'Алия'), { b: true, c: C.navy }), { size: 17.5, lh: 23 });
    if (opt.subtitle) { y -= 1; paragraph(parseInline(sanitize(opt.subtitle), { c: C.mut }), { size: 10, lh: 14 }); }
    y -= 4;
    page.drawRectangle({ x: ML, y: y, width: 46, height: 2.4, color: rgb.apply(null, C.gold) });
    page.drawRectangle({ x: ML + 50, y: y + 0.7, width: CW - 50, height: 0.6, color: rgb.apply(null, C.line) });
    y -= 16;

    parseBlocks(opt.markdown).forEach(block);

    // огоҳии кӯтоҳ дар охир
    y -= 10; ensure(26);
    paragraph([{ t: T.check, i: true, c: C.soft }], { size: 8.4, lh: 12 });

    /* ---------- колонтитулҳо дар ҳар саҳифа ---------- */
    var total = pages.length, playLink = PDFLib.PDFString.of(PLAY_URL);
    var rightHead = sanitize([opt.docType, opt.book].filter(Boolean).join(' · '));
    pages.forEach(function (pg, idx) {
      page = pg;
      // --- боло ---
      var hy = H - 38;
      // нишони Алия: доираи тиллоӣ бо ситора
      pg.drawCircle({ x: ML + 7, y: hy + 3.4, size: 7, color: rgb.apply(null, C.navy) });
      pg.drawCircle({ x: ML + 7, y: hy + 3.4, size: 7, borderColor: rgb.apply(null, C.gold), borderWidth: 1 });
      var star = 'M 0 -4.6 L 1.2 -1.2 L 4.6 0 L 1.2 1.2 L 0 4.6 L -1.2 1.2 L -4.6 0 L -1.2 -1.2 Z';
      pg.drawSvgPath(star, { x: ML + 7, y: hy + 3.4, color: rgb.apply(null, C.gold) });
      var bx = drawPieces('Алия', { b: true, c: C.navy }, ML + 19, hy, 10.5);
      bx = drawPieces('  ·  ', { c: C.gold }, bx, hy, 10.5);
      bx = drawPieces(T.brand.split('·')[1].trim(), { b: true, c: C.head }, bx, hy, 10.5);
      drawPieces('  ' + T.tagline, { c: C.soft }, bx, hy + 0.4, 7.8);
      if (rightHead) {
        var maxR = CW * 0.44, rt = rightHead;
        while (rt.length > 4 && widthOf(rt, {}, 8) > maxR) rt = rt.slice(0, -2);
        if (rt !== rightHead) rt = rt.replace(/\s*\S?$/, '') + '…';
        drawPieces(rt, { c: C.mut }, W - MR - widthOf(rt, {}, 8), hy + 0.6, 8);
      }
      pg.drawRectangle({ x: ML, y: hy - 9, width: CW, height: 0.7, color: rgb.apply(null, C.gold) });

      // --- поён ---
      var fy = 50;
      pg.drawRectangle({ x: ML, y: fy + 10, width: CW, height: 0.6, color: rgb.apply(null, C.line) });
      pg.drawRectangle({ x: ML, y: fy + 9.6, width: 30, height: 1.4, color: rgb.apply(null, C.gold) });
      drawPieces(T.made, { c: C.mut }, ML, fy - 2, 7.6);
      var px = drawPieces(T.play + ' ', { b: true, c: C.navy }, ML, fy - 13, 7.6);
      var ex = drawPieces(PLAY_SHORT, { c: C.gold }, px, fy - 13, 7.6);
      pg.drawLine({ start: { x: px, y: fy - 14.4 }, end: { x: ex, y: fy - 14.4 }, thickness: 0.4, color: rgb.apply(null, C.gold) });
      // истиноди фаъол
      var annot = doc.context.register(doc.context.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [ML, fy - 17, ex, fy - 5], Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: playLink }
      }));
      pg.node.addAnnot(annot);
      var pn = T.page + ' ' + (idx + 1) + ' ' + T.of + ' ' + total;
      var pw = widthOf(pn, { b: true }, 8.4);
      pg.drawRectangle({ x: W - MR - pw - 12, y: fy - 7, width: pw + 12, height: 15, color: rgb.apply(null, C.goldSoft) });
      drawPieces(pn, { b: true, c: C.navy }, W - MR - pw - 6, fy - 2.6, 8.4);
    });

    doc.setTitle(sanitize(opt.fileTitle || opt.title || 'Алия'));
    doc.setAuthor('Алия · Китобхона');
    doc.setSubject(T.made);
    doc.setCreator('Китобхона — Google Play: ' + PLAY_URL);
    doc.setProducer('Алия · Китобхона');
    doc.setKeywords(['Алия', 'Китобхона', 'Kitobkhona', opt.docType || ''].filter(Boolean));
    var bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  }

  /**
   * Ба PDF-и тайёр (масалан аз сервер) колонтитул илова мекунад — барои матнҳои арабиасос (форсӣ),
   * ки шрифти дохилӣ надорад.
   */
  async function stamp(pdfBytes, opt) {
    var raw = await ensureLibs();
    var PDFLib = window.PDFLib, rgb = PDFLib.rgb;
    var doc = await PDFLib.PDFDocument.load(pdfBytes);
    doc.registerFontkit(window.fontkit);
    var reg = await doc.embedFont(raw.reg, { subset: false }), bold = await doc.embedFont(raw.bold, { subset: false });
    var T = tr(opt.lang), pages = doc.getPages(), total = pages.length;
    pages.forEach(function (pg, idx) {
      var sz = pg.getSize(), W = sz.width, H = sz.height, ML = 45, MR = 45;
      pg.drawText(T.brand, { x: ML, y: H - 26, size: 8.6, font: bold, color: rgb.apply(null, C.navy) });
      pg.drawRectangle({ x: ML, y: H - 31, width: W - ML - MR, height: 0.5, color: rgb.apply(null, C.gold) });
      pg.drawRectangle({ x: ML, y: 30, width: W - ML - MR, height: 0.5, color: rgb.apply(null, C.line) });
      pg.drawText(T.play + ' ' + PLAY_SHORT, { x: ML, y: 20, size: 7, font: reg, color: rgb.apply(null, C.mut) });
      var pn = T.page + ' ' + (idx + 1) + ' ' + T.of + ' ' + total;
      pg.drawText(pn, { x: W - MR - bold.widthOfTextAtSize(pn, 7.6), y: 20, size: 7.6, font: bold, color: rgb.apply(null, C.navy) });
    });
    doc.setAuthor('Алия · Китобхона');
    doc.setCreator('Китобхона — Google Play: ' + PLAY_URL);
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  window.AliyaPdf = { build: build, stamp: stamp, ensureLibs: ensureLibs, parseBlocks: parseBlocks, L10N: L10N, PLAY_URL: PLAY_URL };
})(window);
