/**
 * Алия — 6 амали китоб (v159)
 * Модули умумӣ барои «Reader → Алия» (aliya/reader-aliya.html) ва саҳифаи асосии Алия (aliya/index.html).
 *
 *  • Хулосаи мавзӯъ · Калимаҳо ва истилоҳот · Тарҷума · Санҷиш ва тест · Нақшаи дарс · Сабт дар ёддошт
 *  • Хондани саҳифа: қабати матни PDF → OCR дар браузер (Tesseract, tgk+rus) → модели визуалӣ (/v1/vision)
 *  • Статуси кӯтоҳи аниматсионӣ, чопи ҷавоб ҳарф ба ҳарф, [[Ном]] бо ҳуруфи ҷудо, **истилоҳ** ғафс
 *  • Зери ҳар ҷавоб: Нусха · Word · PDF · 🔖 (ёддошт дар ҳамин дастгоҳ, localStorage «kk_aliya_notes»)
 *  • Диалогҳои дохилӣ (ба ҷои window.alert/confirm/prompt), варақаи поёнӣ ва toast
 */
(function (window, document) {
  'use strict';

  var GATEWAY = 'https://sharipovip-aliya-gateway.hf.space';
  var NOTES_KEY = 'kk_aliya_notes';
  var NOTES_MAX = 200;
  var OCR_CACHE_KEY = 'kk_aliya_ocr_v1';
  var OCR_CACHE_MAX = 80;
  var MAX_PAGES = 10;
  var MAX_CONTEXT = 28000;
  var TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  /* ------------------------------------------------------------------ */
  /*  Тавсифи амалҳо                                                     */
  /* ------------------------------------------------------------------ */
  var TASKS = {
    summary:   { ic: '📝', label: 'Хулосаи мавзӯъ',        short: 'Хулоса',     fields: ['range'],
                 steps: ['Ба хондан шурӯъ кардам', 'Мехонам', 'Омода менамоям'], read: 2 },
    words:     { ic: '📖', label: 'Калимаҳо ва истилоҳот', short: 'Калимаҳо',   fields: ['page'],
                 steps: ['Калимаҳоро меҷӯям', 'Маънои калимаҳоро омода месозам', 'Омода шуда истодаанд'], read: 1, fin: 'Омода шуд' },
    translate: { ic: '🌐', label: 'Тарҷума',               short: 'Тарҷума',    fields: ['lang', 'range'],
                 steps: ['Мехонам', 'Тарҷума мекунам'], read: 1 },
    test:      { ic: '✅', label: 'Санҷиш ва тест',        short: 'Тест',       fields: ['range', 'material', 'auto'],
                 steps: ['Мехонам', 'Тест омода мекунам'], read: 1, fin: 'Тест омода шуд' },
    lesson:    { ic: '🎓', label: 'Нақшаи дарс',           short: 'Нақшаи дарс', fields: ['range', 'auto'],
                 steps: ['Мавзӯъро мехонам', 'Конспект омода мекунам', 'Конспект омода мешавад'], read: 1 },
    notes:     { ic: '📌', label: 'Сабт дар ёддошт',       short: 'Ёддошт',     fields: ['range'],
                 steps: ['Мехонам', 'Фикрҳои асосиро омода мекунам'], read: 1 }
  };
  var ORDER = ['summary', 'words', 'translate', 'test', 'lesson', 'notes'];
  var LANGS = ['Русский', 'English', 'Тоҷикӣ', 'Oʻzbekcha', 'Türkçe', 'Deutsch', 'Français', 'العربية', 'فارسی', '中文'];
  var LANG_PROMPT = {
    'Русский': 'русский', 'English': 'англисӣ (English)', 'Тоҷикӣ': 'тоҷикӣ (бо алифбои кириллӣ)', 'Oʻzbekcha': 'ӯзбекӣ (алифбои лотинӣ)',
    'Türkçe': 'туркӣ (Türkçe)', 'Deutsch': 'олмонӣ (Deutsch)', 'Français': 'фаронсавӣ (Français)', 'العربية': 'арабӣ',
    'فارسی': 'форсӣ (алифбои арабӣ-форсӣ)', '中文': 'чинӣ (хитоии соддашуда)'
  };
  var MATERIALS = [['test', 'Тест'], ['essay', 'Иншо'], ['eesse', 'Эссе'], ['essay_short', 'Иншои хурд']];

  /* ------------------------------------------------------------------ */
  /*  Ёрирасонҳо                                                          */
  /* ------------------------------------------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clampInt(v, min, max, dflt) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
  }
  function rangeLabel(f, t) { return f === t ? String(f) : f + '–' + t; }

  /** Калиди ягонаи китоб (ҳамон мантиқи canonicalBookUrl дар config.js) */
  function bookKey(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    try {
      var u = new URL(raw, window.location.href), owner = '', repo = '', branch = '', parts = [], p;
      if (u.hostname === 'raw.githubusercontent.com') {
        p = u.pathname.split('/').filter(Boolean); owner = p.shift() || ''; repo = p.shift() || ''; branch = p.shift() || 'main'; parts = p;
      } else if (u.hostname === 'cdn.jsdelivr.net') {
        p = u.pathname.replace(/^\/gh\//, '').split('/').filter(Boolean);
        owner = p.shift() || ''; var second = p.shift() || ''; var at = second.lastIndexOf('@');
        repo = at >= 0 ? second.slice(0, at) : second; branch = at >= 0 ? second.slice(at + 1) : 'main'; parts = p;
      } else return raw;
      var clean = parts.map(function (part) {
        var x = part;
        for (var i = 0; i < 3; i++) { try { var y = decodeURIComponent(x); if (y === x) break; x = y; } catch (e) { break; } }
        return encodeURIComponent(x);
      }).join('/');
      return 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' + clean;
    } catch (e) { return raw; }
  }

  /** Синф аз папкаи «Kitobhoi darsi/sinfi_N» ё аз номи китоб */
  function detectGrade() {
    for (var i = 0; i < arguments.length; i++) {
      var s = String(arguments[i] || '');
      try { s = decodeURIComponent(s); } catch (e) {}
      var m = s.match(/sinfi[\s_%-]*?(\d{1,2})(?!\d)/i) || s.match(/синф(?:и)?[\s_-]*(\d{1,2})(?!\d)/i) || s.match(/(\d{1,2})[\s-]*(?:синф|класс)/i);
      if (m) { var n = parseInt(m[1], 10); if (n >= 1 && n <= 11) return n; }
    }
    return null;
  }

  /** Забони матн: 'tg' | 'ru' | 'other' */
  function detectLang(text) {
    var s = String(text || '').slice(0, 6000);
    var tj = (s.match(/[ӣӯҳҷқғӢӮҲҶҚҒ]/g) || []).length;
    var cyr = (s.match(/[А-Яа-яЁё]/g) || []).length;
    var ruOnly = (s.match(/[ыщъэЫЩЪЭ]/g) || []).length;
    if (cyr < 20) return 'other';
    if (tj >= 5 && tj * 3 >= ruOnly) return 'tg';
    return 'ru';
  }

  /** Матн барои нусхабардорӣ ва Word: аломатҳои форматро тоза мекунад */
  function plain(src) {
    return String(src || '').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/\[\[|\]\]/g, '');
  }
  /** Markdown барои PDF-и шлюз: [[Ном]] → ***Ном*** */
  function pdfMarkdown(src) {
    return String(src || '').replace(/\[\[([^\]]+)\]\]/g, '***$1***');
  }

  /* ------------------------------------------------------------------ */
  /*  Рендери Markdown (ҳангоми чоп маркерҳои нопурра пинҳон мешаванд)   */
  /* ------------------------------------------------------------------ */
  function inline(t) {
    t = t.replace(/\[\[([^\]\n]+?)\]\]/g, '<span class="at-nm">$1</span>')
         .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
         .replace(/__([^_\n]+?)__/g, '<b>$1</b>')
         .replace(/`([^`\n]+)`/g, '$1');
    // маркерҳои кушода/нопурра (ҳангоми чоп)
    t = t.replace(/\[\[([^\]]*)$/, '$1').replace(/\[\[|\]\]/g, '').replace(/\*\*/g, '');
    t = t.replace(/(^|\s)\*(?=\S)([^*\n]+?)\*(?=\s|$|[.,;:!?])/g, '$1<i>$2</i>').replace(/\*/g, '');
    return t;
  }
  var RX_Q = /^\s*(?:Савол|Вопрос|Question)\s*(\d+)\s*[.):]\s*(.*)$/i;
  var RX_OPT = /^\s*([АБВГДабвгдABCDabcd])\s*[).]\s+(.*)$/;
  var RX_KEY = /^\s*(?:🔑\s*)?(?:Калид|Калиди ҷавобҳо|Ключ|Ключ ответов|Answer key|Key)\s*[:：]\s*(.*)$/i;
  function md(src) {
    var lines = esc(String(src || '').replace(/\r/g, '')).split('\n');
    var html = [], list = '', table = null;
    function closeList() { if (list) { html.push('</' + list + '>'); list = ''; } }
    function closeTable() {
      if (table) {
        html.push('<div class="at-tbl"><table>' + table.map(function (row, ri) {
          return '<tr>' + row.map(function (c) { return ri === 0 ? '<th>' + inline(c) + '</th>' : '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</table></div>');
        table = null;
      }
    }
    lines.forEach(function (raw) {
      var s = raw.replace(/\s+$/, ''), m;
      if (/^\s*\|.*\|\s*$/.test(s)) {
        closeList();
        if (/^\s*\|[\s:|-]+\|\s*$/.test(s)) return;
        var cells = s.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        (table = table || []).push(cells);
        return;
      }
      closeTable();
      if (!s.trim()) { closeList(); return; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(s)) { closeList(); html.push('<hr>'); return; }
      if ((m = s.match(/^\s*#{1,6}\s+(.*)$/))) { closeList(); html.push('<h4>' + inline(m[1]) + '</h4>'); return; }
      if (RX_KEY.test(s)) { closeList(); html.push('<div class="at-key">🔑 ' + inline(s.trim().replace(/^🔑\s*/, '')) + '</div>'); return; }
      if ((m = s.match(RX_Q))) { closeList(); html.push('<div class="at-q">' + m[1] + '. ' + inline(m[2]) + '</div>'); return; }
      if ((m = s.match(RX_OPT))) {
        closeList();
        var ok = /[✔✓]\s*$/.test(m[2]);
        html.push('<div class="at-opt' + (ok ? ' ok' : '') + '">' + m[1] + ') ' + inline(m[2].replace(/\s*[✔✓]\s*$/, '')) + '</div>');
        return;
      }
      if ((m = s.match(/^\s*[-•*]\s+(.*)$/))) { if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; } html.push('<li>' + inline(m[1]) + '</li>'); return; }
      if ((m = s.match(/^\s*(\d+)[.)]\s+(.*)$/))) { if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; } html.push('<li value="' + m[1] + '">' + inline(m[2]) + '</li>'); return; }
      if ((m = s.match(/^\s*&gt;\s?(.*)$/))) { closeList(); html.push('<blockquote>' + inline(m[1]) + '</blockquote>'); return; }
      closeList();
      html.push('<p>' + inline(s) + '</p>');
    });
    closeList(); closeTable();
    return html.join('');
  }

  /* ------------------------------------------------------------------ */
  /*  Услубҳо (як маротиба ворид мешаванд)                                */
  /* ------------------------------------------------------------------ */
  var CSS = [
    '.at-navy{--at-bg:#06101d;--at-bg2:#0b1729;--at-card:#0D1B2A;--at-card2:#122338;--at-line:rgba(201,168,76,.24);--at-gold:#E8C96D;--at-txt:#F0EAD6;--at-mut:#9fb0c6;--at-acc:#E8C96D;--at-accTxt:#0D1B2A;--at-nm:#F2C55C;--at-glow:rgba(232,201,109,.35)}',
    '.at-aliya{--at-bg:#0E0F12;--at-bg2:#141519;--at-card:#1A1B20;--at-card2:#222329;--at-line:rgba(242,242,240,.10);--at-gold:#FF8B68;--at-txt:#F2F2F0;--at-mut:#9a9ca4;--at-acc:#FF6A3D;--at-accTxt:#fff;--at-nm:#FFB27A;--at-glow:rgba(255,106,61,.35)}',
    '.at-tasks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
    '.at-task{min-height:64px;border-radius:14px;border:1px solid var(--at-line);background:var(--at-card);color:var(--at-txt);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:7px 4px;font:inherit;cursor:pointer;transition:border-color .15s,transform .1s,background .15s;-webkit-tap-highlight-color:transparent}',
    '.at-task .at-ti{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;font-size:15px;background:rgba(232,201,109,.13)}',
    '.at-aliya .at-task .at-ti{background:rgba(255,106,61,.14)}',
    '.at-task .at-tl{font-size:12px;font-weight:650;line-height:1.2;text-align:center}',
    '.at-task:hover{border-color:var(--at-gold)}.at-task:active{transform:scale(.97)}.at-task.on{border-color:var(--at-gold);background:var(--at-card2)}.at-task:disabled{opacity:.45;cursor:default}',
    '@media(min-width:760px){.at-tasks.at-wide{grid-template-columns:repeat(6,minmax(0,1fr))}}',
    '.at-ans{border-radius:16px;background:var(--at-card);border:1px solid var(--at-line);padding:12px 14px;color:var(--at-txt);min-width:0}',
    '.at-empty{color:var(--at-mut);font-size:13.5px;line-height:1.55;display:flex;gap:10px;align-items:flex-start}',
    '.at-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;min-width:0}',
    '.at-head b{font-size:14px;color:var(--at-gold);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.at-head small{margin-left:auto;color:var(--at-mut);font-size:12px;white-space:nowrap}',
    '.at-body{font-size:15px;line-height:1.72;overflow-wrap:anywhere;word-wrap:break-word}',
    '.at-body h4{margin:14px 0 4px;font-size:15px;color:var(--at-gold)}.at-body h4:first-child{margin-top:2px}',
    '.at-body p{margin:6px 0}.at-body ul,.at-body ol{margin:4px 0 8px;padding-left:22px}.at-body li{margin:3px 0}',
    '.at-body b{font-weight:750;color:var(--at-txt)}.at-body hr{border:0;border-top:1px solid var(--at-line);margin:10px 0}',
    '.at-nm{font-family:Georgia,"Times New Roman","Noto Serif",serif;font-weight:700;font-style:italic;color:var(--at-nm);letter-spacing:.1px}',
    '.at-q{font-weight:750;margin:14px 0 4px}.at-q:first-child{margin-top:2px}',
    '.at-opt{padding:5px 10px;border-radius:9px;margin:3px 0;border:1px solid transparent}',
    '.at-opt.ok{background:rgba(74,222,128,.10);border-color:rgba(74,222,128,.38);color:#c6f6d5}.at-opt.ok::after{content:" ✔";color:#4ade80;font-weight:900}',
    '.at-key{margin-top:14px;padding:10px 12px;border-radius:10px;background:var(--at-card2);border:1px dashed var(--at-line);font-weight:700}',
    '.at-body blockquote{margin:8px 0;padding:6px 12px;border-left:3px solid var(--at-gold);color:var(--at-mut);font-style:italic}',
    '.at-tbl{overflow-x:auto;margin:8px 0}.at-tbl table{border-collapse:collapse;width:100%;font-size:13.5px}.at-tbl th,.at-tbl td{border:1px solid var(--at-line);padding:5px 7px;text-align:left;vertical-align:top}.at-tbl th{color:var(--at-gold)}',
    '.at-caret{display:inline-block;width:2px;height:1.05em;background:var(--at-gold);vertical-align:-2px;margin-left:1px;animation:atBlink .8s steps(1) infinite}',
    '@keyframes atBlink{50%{opacity:0}}',
    '.at-think{display:flex;align-items:center;gap:9px;min-height:26px}',
    '.at-think-txt{font-size:14px;font-weight:650;background:linear-gradient(90deg,var(--at-mut) 0%,var(--at-gold) 45%,#fff 50%,var(--at-gold) 55%,var(--at-mut) 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:atShim 1.6s linear infinite}',
    '.at-think-txt.swap{animation:atShim 1.6s linear infinite,atIn .35s ease}',
    '@keyframes atShim{from{background-position:120% 0}to{background-position:-120% 0}}',
    '@keyframes atIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
    '.at-dots{display:inline-flex;gap:3px;margin-left:2px}.at-dots i{width:4px;height:4px;border-radius:50%;background:var(--at-gold);animation:atDot 1.1s infinite ease-in-out}',
    '.at-dots i:nth-child(2){animation-delay:.15s}.at-dots i:nth-child(3){animation-delay:.3s}',
    '@keyframes atDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}',
    '.at-done{display:flex;align-items:center;gap:8px;font-size:14px;color:#7fe0a5;font-weight:700;animation:atIn .3s}',
    '.at-emb{width:18px;height:18px;flex:0 0 18px;position:relative;display:inline-block}.at-emb svg{width:100%;height:100%;display:block}',
    '.at-emb.spin svg{animation:atSpin 2.4s linear infinite}',
    '.at-emb.spin::after{content:"";position:absolute;inset:-4px;border-radius:50%;background:radial-gradient(circle,var(--at-glow),transparent 65%);animation:atPulse 1.4s ease-in-out infinite}',
    '@keyframes atSpin{to{transform:rotate(360deg)}}@keyframes atPulse{50%{transform:scale(1.35);opacity:.4}}',
    '.at-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) 46px;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid var(--at-line);animation:atIn .3s}',
    '.at-tools.no-save{grid-template-columns:repeat(3,minmax(0,1fr))}',
    '.at-tool{height:40px;border-radius:11px;border:1px solid var(--at-line);background:var(--at-card2);color:var(--at-gold);font:inherit;font-size:12.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;white-space:nowrap;min-width:0;padding:0 4px}',
    '.at-tool:active{transform:scale(.97)}.at-tool:disabled{opacity:.55}',
    '.at-tool.save{font-size:17px;padding:0}.at-tool.save.done{background:var(--at-acc);color:var(--at-accTxt);border-color:var(--at-acc)}',
    '.at-errbox{display:flex;flex-direction:column;gap:10px;color:#ffb4a6;font-size:14px;line-height:1.5}',
    '.at-errbox button{align-self:flex-start;height:36px;border-radius:10px;border:1px solid var(--at-line);background:var(--at-card2);color:var(--at-gold);font:inherit;font-weight:700;padding:0 14px;cursor:pointer}',
    /* формаҳо */
    '.at-fld{margin-bottom:13px;min-width:0}.at-fld>label,.at-lbl{display:block;font-size:12px;font-weight:700;color:var(--at-mut);margin-bottom:6px;letter-spacing:.2px}',
    '.at-row2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}',
    '.at-inp{width:100%;min-width:0;height:44px;border-radius:11px;border:1px solid var(--at-line);background:var(--at-card);color:var(--at-txt);padding:0 12px;font:inherit;font-size:16px;outline:none;-webkit-appearance:none;appearance:none}',
    '.at-inp:focus{border-color:var(--at-gold)}',
    '.at-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.at-chip{height:34px;border-radius:999px;border:1px solid var(--at-line);background:var(--at-card);color:var(--at-txt);padding:0 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
    '.at-chip.on{background:var(--at-acc);color:var(--at-accTxt);border-color:var(--at-acc)}',
    '.at-seg{display:grid;gap:4px;padding:4px;border-radius:12px;background:var(--at-card);border:1px solid var(--at-line)}',
    '.at-seg button{min-height:36px;border:0;border-radius:9px;background:transparent;color:var(--at-txt);font:inherit;font-size:13px;font-weight:650;cursor:pointer;padding:2px 4px;line-height:1.15}',
    '.at-seg button.on{background:var(--at-acc);color:var(--at-accTxt)}',
    '.at-stepper{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:6px}',
    '.at-stepper button{height:44px;border-radius:11px;border:1px solid var(--at-line);background:var(--at-card);color:var(--at-gold);font-size:20px;cursor:pointer}',
    '.at-stepper .at-inp{text-align:center;font-weight:800}',
    '.at-auto{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--at-mut);background:var(--at-card);border:1px dashed var(--at-line);border-radius:10px;padding:8px 10px;margin-bottom:13px}',
    '.at-auto b{color:var(--at-gold)}',
    '.at-hint{font-size:11.5px;color:var(--at-mut);margin-top:5px;line-height:1.4}',
    '.at-go{width:100%;height:48px;border-radius:13px;border:0;background:var(--at-acc);color:var(--at-accTxt);font:inherit;font-size:15px;font-weight:800;cursor:pointer;margin-top:2px}',
    '.at-go:disabled{opacity:.5}',
    '.at-cancel{width:100%;height:40px;border:0;background:transparent;color:var(--at-mut);font:inherit;font-size:14px;cursor:pointer;margin-top:4px}',
    '.at-ferr{color:#ff9a8a;font-size:12.5px;min-height:16px;margin:-4px 0 6px}',
    /* варақаи поёнӣ */
    '.at-sheet-bg{position:fixed;inset:0;background:rgba(2,6,14,.62);z-index:9000;opacity:0;pointer-events:none;transition:opacity .2s}',
    '.at-sheet-bg.on{opacity:1;pointer-events:auto}',
    '.at-sheet{position:fixed;left:0;right:0;bottom:0;margin:0 auto;width:min(520px,100%);z-index:9001;background:var(--at-bg2);color:var(--at-txt);border:1px solid var(--at-line);border-bottom:0;border-radius:20px 20px 0 0;padding:8px 16px calc(18px + env(safe-area-inset-bottom,0px));transform:translateY(105%);transition:transform .25s cubic-bezier(.2,.8,.2,1);max-height:88dvh;overflow-y:auto;overflow-x:hidden;font-family:inherit}',
    '.at-sheet.on{transform:none}',
    '.at-sheet .at-grab{width:38px;height:4px;border-radius:2px;background:var(--at-line);margin:2px auto 10px}',
    '.at-sheet h3{margin:0 0 12px;font-size:16px;color:var(--at-gold);display:flex;align-items:center;gap:8px}',
    '@media(min-width:700px){.at-sheet{bottom:50%;border-radius:20px;border-bottom:1px solid var(--at-line);transform:translateY(60%);opacity:0;transition:transform .25s,opacity .2s}.at-sheet.on{transform:translateY(50%);opacity:1}}',
    /* диалог */
    '.at-dlg-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9100;display:none;align-items:center;justify-content:center;padding:24px}',
    '.at-dlg-bg.on{display:flex}',
    '.at-dlg{width:min(380px,100%);background:var(--at-bg2);color:var(--at-txt);border:1px solid var(--at-line);border-radius:18px;padding:18px;animation:atIn .2s;font-family:inherit}',
    '.at-dlg h4{margin:0 0 6px;font-size:16px;line-height:1.4}.at-dlg p{margin:0 0 6px;color:var(--at-mut);font-size:13.5px;line-height:1.5}',
    '.at-dlg .at-inp{margin-top:8px}',
    '.at-dlg-bt{display:flex;gap:8px;margin-top:14px}',
    '.at-dlg-bt button{flex:1;height:42px;border-radius:11px;font:inherit;font-weight:700;cursor:pointer;border:1px solid var(--at-line);background:transparent;color:var(--at-txt)}',
    '.at-dlg-bt button.ok{background:var(--at-acc);border-color:var(--at-acc);color:var(--at-accTxt)}',
    '.at-dlg-bt button.danger{background:#c2412d;border-color:#c2412d;color:#fff}',
    /* toast */
    '.at-toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%) translateY(16px);background:rgba(20,28,40,.97);color:#fff;border:1px solid rgba(232,201,109,.35);padding:10px 16px;border-radius:12px;font-size:13.5px;font-family:inherit;z-index:9200;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;max-width:calc(100% - 32px);text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.4)}',
    '.at-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}',
    /* ёддоштҳо */
    '.at-nt-filter{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}.at-nt-filter::-webkit-scrollbar{display:none}',
    '.at-nt-filter .at-chip{flex:0 0 auto}',
    '.at-nt-card{margin:0 0 10px;border-radius:14px;background:var(--at-card);border:1px solid var(--at-line);padding:11px 13px;color:var(--at-txt);animation:atIn .25s}',
    '.at-nt-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--at-mut);margin-bottom:5px;flex-wrap:wrap}',
    '.at-nt-type{font-weight:800;color:var(--at-gold);font-size:12.5px}.at-nt-meta .d{margin-left:auto}',
    '.at-nt-book{font-size:12px;color:var(--at-mut);margin:-2px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.at-nt-text{font-size:14px;line-height:1.6;max-height:5.2em;overflow:hidden;position:relative}',
    '.at-nt-text.open{max-height:none}',
    '.at-nt-text:not(.open)::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.8em;background:linear-gradient(transparent,var(--at-card))}',
    '.at-nt-act{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}',
    '.at-nt-act button{height:32px;border-radius:9px;border:1px solid var(--at-line);background:var(--at-card2);color:var(--at-gold);font:inherit;font-size:12.5px;font-weight:700;padding:0 10px;cursor:pointer}',
    '.at-nt-act button.del{margin-left:auto;color:#ff9b8a}',
    '.at-nt-empty{text-align:center;color:var(--at-mut);padding:46px 20px;font-size:14px;line-height:1.6}',
    '.at-nt-local{font-size:11.5px;color:var(--at-mut);text-align:center;padding:4px 10px 16px}'
  ].join('\n');
  function injectStyles() {
    if (document.getElementById('aliyaTasksCss')) return;
    var st = document.createElement('style');
    st.id = 'aliyaTasksCss';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ------------------------------------------------------------------ */
  /*  Эмблема, toast, варақа, диалогҳо                                    */
  /* ------------------------------------------------------------------ */
  var embSeq = 0;
  function emblem(spin, theme) {
    var id = 'atg' + (++embSeq);
    var c1 = theme === 'aliya' ? '#FF8B68' : '#E8C96D', c2 = theme === 'aliya' ? '#FF6A3D' : '#C9A84C';
    return '<span class="at-emb' + (spin ? ' spin' : '') + '" aria-hidden="true"><svg viewBox="0 0 24 24"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE29A"/><stop offset=".5" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs><path d="M12 1.5l2.5 7.9 7.9 2.6-7.9 2.5-2.5 7.9-2.6-7.9L1.5 12l7.9-2.6z" fill="url(#' + id + ')"/></svg></span>';
  }
  function themeClass() {
    return document.body && document.body.classList.contains('at-aliya') ? 'at-aliya' : 'at-navy';
  }
  function themeName() { return themeClass() === 'at-aliya' ? 'aliya' : 'navy'; }

  var toastEl = null, toastTimer = null;
  function toast(msg, ms) {
    injectStyles();
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'at-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.classList.remove('at-navy', 'at-aliya'); toastEl.classList.add(themeClass());
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2200);
  }

  var sheetBg = null, sheetEl = null, sheetOnClose = null;
  function ensureSheet() {
    injectStyles();
    if (sheetEl) return;
    sheetBg = document.createElement('div'); sheetBg.className = 'at-sheet-bg';
    sheetEl = document.createElement('div'); sheetEl.className = 'at-sheet'; sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheetBg); document.body.appendChild(sheetEl);
    sheetBg.addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheetEl.classList.contains('on')) closeSheet(); });
  }
  function openSheet(html, onClose) {
    ensureSheet();
    sheetEl.className = 'at-sheet ' + themeClass();
    sheetEl.innerHTML = '<div class="at-grab"></div>' + html;
    sheetOnClose = onClose || null;
    sheetBg.classList.add('on');
    requestAnimationFrame(function () { sheetEl.classList.add('on'); });
    return sheetEl;
  }
  function closeSheet() {
    if (!sheetEl) return;
    sheetEl.classList.remove('on'); sheetBg.classList.remove('on');
    var cb = sheetOnClose; sheetOnClose = null;
    if (cb) cb();
  }

  var dlgBg = null;
  function openDialog(html) {
    injectStyles();
    if (!dlgBg) { dlgBg = document.createElement('div'); dlgBg.className = 'at-dlg-bg'; document.body.appendChild(dlgBg); }
    dlgBg.innerHTML = '<div class="at-dlg ' + themeClass() + '" role="dialog" aria-modal="true">' + html + '</div>';
    dlgBg.classList.add('on');
    return dlgBg.firstChild;
  }
  function closeDialog() { if (dlgBg) { dlgBg.classList.remove('on'); dlgBg.innerHTML = ''; } }
  /** confirmDialog(матн, {ok, cancel, danger, text}) → Promise<boolean> */
  function confirmDialog(title, opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var d = openDialog('<h4>' + esc(title) + '</h4>' + (opt.text ? '<p>' + esc(opt.text) + '</p>' : '') +
        '<div class="at-dlg-bt"><button type="button" data-r="0">' + esc(opt.cancel || 'Бекор') + '</button><button type="button" class="' + (opt.danger ? 'danger' : 'ok') + '" data-r="1">' + esc(opt.ok || 'Хуб') + '</button></div>');
      function done(v) { document.removeEventListener('keydown', onKey); closeDialog(); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); }
      document.addEventListener('keydown', onKey);
      d.querySelectorAll('[data-r]').forEach(function (b) { b.onclick = function () { done(b.getAttribute('data-r') === '1'); }; });
      dlgBg.onclick = function (e) { if (e.target === dlgBg) done(false); };
      setTimeout(function () { var ok = d.querySelector('[data-r="1"]'); if (ok) ok.focus(); }, 30);
    });
  }
  /** promptDialog(сарлавҳа, {value, placeholder, ok}) → Promise<string|null> */
  function promptDialog(title, opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var d = openDialog('<h4>' + esc(title) + '</h4>' + (opt.text ? '<p>' + esc(opt.text) + '</p>' : '') +
        '<input class="at-inp" type="text" maxlength="' + (opt.maxLength || 80) + '" placeholder="' + esc(opt.placeholder || '') + '" value="' + esc(opt.value || '') + '">' +
        '<div class="at-dlg-bt"><button type="button" data-r="0">Бекор</button><button type="button" class="ok" data-r="1">' + esc(opt.ok || 'Сабт') + '</button></div>');
      var inp = d.querySelector('input');
      function done(v) { document.removeEventListener('keydown', onKey); closeDialog(); resolve(v); }
      function submit() { var v = inp.value.trim(); if (!v) { inp.focus(); return; } done(v); }
      function onKey(e) { if (e.key === 'Escape') done(null); if (e.key === 'Enter') submit(); }
      document.addEventListener('keydown', onKey);
      d.querySelector('[data-r="0"]').onclick = function () { done(null); };
      d.querySelector('[data-r="1"]').onclick = submit;
      dlgBg.onclick = function (e) { if (e.target === dlgBg) done(null); };
      setTimeout(function () { inp.focus(); inp.select(); }, 40);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Ёддоштҳо (танҳо дар ҳамин дастгоҳ)                                  */
  /* ------------------------------------------------------------------ */
  function readAll() {
    try { var o = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
  }
  function writeAll(o) {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(o)); return true; } catch (e) { return false; }
  }
  /** Ҳамаи сабтҳои ҳамон китоб (калидҳои кӯҳнаи гуногун ба як калид муттаҳид мешаванд) */
  function normalizeStore() {
    var all = readAll(), changed = false, out = {};
    Object.keys(all).forEach(function (k) {
      var nk = bookKey(k) || k, arr = Array.isArray(all[k]) ? all[k] : [];
      if (nk !== k) changed = true;
      arr.forEach(function (n) {
        if (!n || typeof n.text !== 'string') { changed = true; return; }
        if (!n.ts) { n.ts = Date.now() - Math.floor(Math.random() * 1000); changed = true; }
        if (n.task && !TASKS[n.task]) { n.title = n.title || n.task; n.task = 'notes'; changed = true; }
        (out[nk] = out[nk] || []).push(n);
      });
    });
    if (changed) writeAll(out);
    return out;
  }
  var Notes = {
    key: bookKey,
    all: function () { return normalizeStore(); },
    list: function (book) {
      var k = bookKey(book), all = normalizeStore();
      return (all[k] || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    },
    count: function (book) { return Notes.list(book).length; },
    add: function (book, item) {
      var k = bookKey(book) || 'aliya:general', all = normalizeStore();
      var arr = all[k] || [];
      var n = {
        ts: Date.now(), page: item.page || null, pages: item.pages || (item.page ? String(item.page) : ''),
        task: TASKS[item.task] ? item.task : 'notes', title: String(item.title || '').slice(0, 120),
        book: String(item.book || '').slice(0, 200), text: String(item.text || '')
      };
      arr.push(n);
      if (arr.length > NOTES_MAX) arr = arr.slice(arr.length - NOTES_MAX);
      all[k] = arr;
      if (!writeAll(all)) throw new Error('Хотираи дастгоҳ пур аст. Якчанд ёддошти кӯҳнаро нест кунед.');
      return n;
    },
    remove: function (book, ts) {
      var k = bookKey(book), all = normalizeStore();
      all[k] = (all[k] || []).filter(function (n) { return n.ts !== ts; });
      if (!all[k].length) delete all[k];
      writeAll(all);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Шлюз                                                               */
  /* ------------------------------------------------------------------ */
  function abortError() { var e = new Error('Қатъ шуд.'); e.name = 'AbortError'; return e; }
  function sleep(ms, signal) {
    return new Promise(function (res, rej) {
      var t = setTimeout(res, ms);
      if (signal) signal.addEventListener('abort', function () { clearTimeout(t); rej(abortError()); }, { once: true });
    });
  }
  async function postJson(path, payload, timeoutMs, signal) {
    var ctrl = new AbortController();
    var onAbort = function () { ctrl.abort(); };
    if (signal) { if (signal.aborted) throw abortError(); signal.addEventListener('abort', onAbort, { once: true }); }
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 120000);
    try {
      var r = await fetch(GATEWAY + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload || {}), signal: ctrl.signal, cache: 'no-store'
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || (d.error && !d.reply && !d.file_base64)) {
        var e = new Error(String(d.detail || d.error || ('HTTP ' + r.status)));
        e.status = r.status; e.code = String(d.error || '');
        throw e;
      }
      return d;
    } catch (err) {
      if (signal && signal.aborted) throw abortError();
      if (err && err.name === 'AbortError') { var te = new Error('Сервер дер ҷавоб дод.'); te.timeout = true; throw te; }
      if (err instanceof TypeError) { var ne = new Error('Бо сервери Алия пайваст нашуд. Интернетро санҷед.'); ne.network = true; throw ne; }
      throw err;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  /** Чат бо такрори худкор ҳангоми хатои муваққатӣ */
  async function chat(system, user, opt) {
    opt = opt || {};
    var payload = {
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      reasoning_mode: opt.reasoning || 'medium', temperature: opt.temperature == null ? 0.4 : opt.temperature, max_tokens: opt.maxTokens || 2200
    };
    var last;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var d = await postJson('/v1/chat', payload, opt.timeoutMs || 150000, opt.signal);
        var reply = String(d.reply || (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
        if (reply) return reply;
        last = new Error('Сервер ҷавоби холӣ баргардонд.');
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        last = e;
        var transient = e.network || e.timeout || (e.status >= 500) || /chat_providers_unavailable|no_chat_provider_configured|rate|429/i.test(String(e.code || e.message || ''));
        if (!transient) break;
      }
      await sleep(800 * (attempt + 1), opt.signal);
    }
    throw last || new Error('Дархост иҷро нашуд.');
  }
  function friendlyError(err) {
    var m = String(err && err.message || err || '');
    if (/chat_providers_unavailable|no_chat_provider_configured/.test(m)) return 'Алия ҳоло банд аст. Як дақиқа баъд «Дубора»-ро пахш кунед.';
    if (/HTTP 4\d\d/.test(m)) return 'Дархост қабул нашуд (' + m + '). Дубора кӯшиш кунед.';
    return m || 'Хатои номаълум.';
  }

  /* ------------------------------------------------------------------ */
  /*  PDF ва хондани саҳифаҳо (матн → OCR → vision)                      */
  /* ------------------------------------------------------------------ */
  function scriptBase() {
    var s = document.querySelector('script[src*="aliya-tasks.js"]');
    return s ? s.src.replace(/aliya-tasks\.js.*$/, '') : '';
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
  async function ensurePdfJs() {
    var libs = scriptBase() + '../assets/libs/';
    if (!window.pdfjsLib) await loadScript(libs + 'pdf.min.js');
    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) window.pdfjsLib.GlobalWorkerOptions.workerSrc = libs + 'pdf.worker.min.js';
    return window.pdfjsLib;
  }
  function jsdelivrUrl(key) {
    try {
      var u = new URL(key);
      if (u.hostname !== 'raw.githubusercontent.com') return '';
      var p = u.pathname.split('/').filter(Boolean);
      if (p.length < 4) return '';
      return 'https://cdn.jsdelivr.net/gh/' + p[0] + '/' + p[1] + '@' + p[2] + '/' + p.slice(3).join('/');
    } catch (e) { return ''; }
  }
  /** Китобро бор мекунад: аввал аз кэши Reader ('kitobkhona-pdf-cache-v1'), баъд шабака */
  async function loadPdf(url, onProgress) {
    var lib = await ensurePdfJs();
    var key = bookKey(url), buf = null;
    if ('caches' in window) {
      try {
        var cache = await caches.open('kitobkhona-pdf-cache-v1');
        var hit = await cache.match(key) || (url !== key ? await cache.match(url) : null);
        if (hit) buf = await hit.arrayBuffer();
      } catch (e) {}
    }
    if (!buf) {
      var urls = [key, jsdelivrUrl(key), url].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
      var lastErr = null;
      for (var i = 0; i < urls.length && !buf; i++) {
        try {
          var r = await fetch(urls[i], { cache: 'force-cache' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          var total = Number(r.headers.get('content-length') || 0);
          if (r.body && r.body.getReader && onProgress) {
            var reader = r.body.getReader(), chunks = [], loaded = 0;
            for (;;) { var c = await reader.read(); if (c.done) break; chunks.push(c.value); loaded += c.value.byteLength; onProgress(loaded, total); }
            var all = new Uint8Array(loaded), off = 0;
            chunks.forEach(function (ch) { all.set(ch, off); off += ch.byteLength; });
            buf = all.buffer;
          } else {
            buf = await r.arrayBuffer();
          }
        } catch (e) { lastErr = e; }
      }
      if (!buf) throw lastErr || new Error('Китоб бор нашуд.');
    }
    return lib.getDocument({ data: buf }).promise;
  }

  function goodText(t) {
    if (!t || t.length < 40) return false;
    var dense = t.replace(/\s+/g, '');
    if (!dense.length) return false;
    var letters = (dense.match(/[A-Za-zА-Яа-яЁёӢӣӮӯҲҳҶҷҚқҒғ\u0600-\u06FF]/g) || []).length;
    return letters / dense.length >= 0.55;
  }
  function ocrCacheGet(k) {
    try { var o = JSON.parse(localStorage.getItem(OCR_CACHE_KEY) || '{}'); return o[k] ? o[k].t : ''; } catch (e) { return ''; }
  }
  function ocrCacheSet(k, t) {
    try {
      var o = JSON.parse(localStorage.getItem(OCR_CACHE_KEY) || '{}');
      o[k] = { t: String(t).slice(0, 5000), ts: Date.now() };
      var keys = Object.keys(o);
      if (keys.length > OCR_CACHE_MAX) {
        keys.sort(function (a, b) { return o[a].ts - o[b].ts; }).slice(0, keys.length - OCR_CACHE_MAX).forEach(function (x) { delete o[x]; });
      }
      localStorage.setItem(OCR_CACHE_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  var ocrWorker = null, ocrLoading = null;
  function getOcr() {
    if (ocrWorker) return Promise.resolve(ocrWorker);
    if (!ocrLoading) {
      ocrLoading = (async function () {
        if (!window.Tesseract) await loadScript(TESSERACT_SRC);
        var w = await Promise.race([
          window.Tesseract.createWorker('tgk+rus', 1),
          new Promise(function (_, rej) { setTimeout(function () { rej(new Error('OCR бор нашуд')); }, 60000); })
        ]);
        ocrWorker = w;
        return w;
      })().catch(function (e) { ocrLoading = null; throw e; });
    }
    return ocrLoading;
  }

  function createPageReader(pdfDoc, opt) {
    opt = opt || {};
    var mem = {};
    var keyBase = bookKey(opt.bookUrl || '') || (opt.bookName || 'book');
    async function renderCanvas(n, scale) {
      var p = await pdfDoc.getPage(n);
      var vp0 = p.getViewport({ scale: 1 });
      var s = Math.min(scale, 2200 / Math.max(vp0.width, 1));
      var vp = p.getViewport({ scale: s });
      var c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      return c;
    }
    async function vision(n, signal) {
      var c = await renderCanvas(n, 1.6);
      var img = c.toDataURL('image/jpeg', 0.82).replace(/^data:image\/[^;]+;base64,/i, '');
      var d = await postJson('/v1/vision', {
        image_base64: img,
        prompt: 'Матни ҳамаи саҳифаро айнан ва пурра нусхабардорӣ кунед. Ҳеҷ шарҳ ё ҷавоб илова накунед.',
        system: 'Шумо OCR ҳастед: танҳо матни намоёни саҳифаро бо ҳамон забон ва алифбо баргардонед.'
      }, 90000, signal);
      return String(d.reply || d.analysis || '').trim();
    }
    async function pageText(n, signal) {
      if (mem[n]) return mem[n];
      var ck = keyBase + '#' + n;
      var p = await pdfDoc.getPage(n);
      var tc = await p.getTextContent();
      var t = tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ''); }).join(' ').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
      if (goodText(t)) return (mem[n] = { text: t, method: 'text' });
      var cached = ocrCacheGet(ck);
      if (cached) return (mem[n] = { text: cached, method: 'cache' });
      if (signal && signal.aborted) throw abortError();
      // Скан → OCR дар браузер
      var ocrText = '', conf = 0;
      try {
        var w = await getOcr();
        var canvas = await renderCanvas(n, 2);
        var r = await w.recognize(canvas);
        ocrText = String(r.data.text || '').replace(/[ \t]+/g, ' ').trim();
        conf = Number(r.data.confidence) || 0;
      } catch (e) { ocrText = ''; conf = 0; }
      if (signal && signal.aborted) throw abortError();
      if (goodText(ocrText) && conf >= 55) { ocrCacheSet(ck, ocrText); return (mem[n] = { text: ocrText, method: 'ocr' }); }
      // OCR суст → модели визуалӣ
      try {
        var v = await vision(n, signal);
        if (v && v.length >= 20) { ocrCacheSet(ck, v); return (mem[n] = { text: v, method: 'vision' }); }
      } catch (e) { if (e && e.name === 'AbortError') throw e; }
      var fallback = ocrText || t;
      return { text: fallback, method: fallback ? 'weak' : 'none' };
    }
    async function rangeText(f, t, o) {
      o = o || {};
      var parts = [], total = Math.min(t - f + 1, MAX_PAGES);
      for (var n = f, i = 0; n <= t && i < total; n++, i++) {
        if (o.signal && o.signal.aborted) throw abortError();
        if (o.onPage) o.onPage(i + 1, total, n);
        var r = await pageText(n, o.signal);
        if (r.text) parts.push('[САҲИФАИ ' + n + ']\n' + r.text);
      }
      var text = parts.join('\n\n');
      if (text.length > MAX_CONTEXT) text = text.slice(0, MAX_CONTEXT);
      return text;
    }
    return { pageText: pageText, rangeText: rangeText, get total() { return pdfDoc.numPages; } };
  }

  /* ------------------------------------------------------------------ */
  /*  Дастурҳо барои модел                                                */
  /* ------------------------------------------------------------------ */
  var FORMAT_RULES =
    'ҚОИДАҲОИ ФОРМАТ (ҳатмӣ):\n' +
    '• Номи одамон, қаҳрамонҳо, муаллифон ва персонажҳоро ҳамеша дар қавсҳои дукаратаи мураббаъ нависед: [[Рустам]], [[Абулқосим Фирдавсӣ]].\n' +
    '• Истилоҳ ва калимаҳои калидиро **ғафс** нависед.\n' +
    '• Сарлавҳаҳо бо «## », рӯйхат бо «- », рақамгузорӣ бо «1. ».\n' +
    '• ҲЕҶ ҷумлаи иловагӣ нанавис: на муқаддима («Албатта», «Инак», «Дар зер…», «Ин матн аз китоб омода шуд»), на хотима («Агар хоҳед…», «Умедворам…»). Фавран натиҷаро нависед.\n' +
    '• Матн метавонад аз OCR бошад: хатогиҳои хурди ҳарфиро худатон ислоҳ кунед, вале чизе аз худ наофаред.';

  function gradeText(g) { return g ? 'синфи ' + g : 'сатҳи мувофиқ ба мураккабии матн (синфро худатон аз рӯи матн муайян кунед)'; }

  var LESSON_TG =
    'Қолаби нақшаи дарс (ТОҶИКӢ, ҳамин сарлавҳаҳоро нигоҳ доред):\n' +
    '## Нақшаи дарс\n**Мавзӯъ:** …\n**Синф:** … · **Вақт:** 45 дақиқа · **Намуди дарс:** …\n' +
    '## Мақсадҳо\n- **Таълимӣ:** …\n- **Инкишофдиҳӣ:** …\n- **Тарбиявӣ:** …\n' +
    '## Натиҷаҳои интизорӣ\n- …\n## Усул ва шаклҳои кор\n- …\n## Таҷҳизот\n- …\n' +
    '## Рафти дарс\n1. **Лаҳзаи ташкилӣ (2 дақ.)** — …\n2. **Санҷиши вазифаи хонагӣ / Даъват (5–7 дақ.)** — саволҳо: …\n' +
    '3. **Дарки маъно — мавзӯи нав (15–20 дақ.)** — нуктаҳои асосӣ: …\n4. **Мустаҳкамкунӣ (8–10 дақ.)** — саволу супоришҳо: …\n' +
    '5. **Мулоҳиза / Инъикос (3–5 дақ.)** — …\n6. **Вазифаи хонагӣ (2 дақ.)** — …\n## Баҳодиҳӣ\n- …';
  var LESSON_RU =
    'Шаблон конспекта урока (РУССКИЙ, сохраните эти заголовки):\n' +
    '## Конспект урока\n**Тема:** …\n**Класс:** … · **Время:** 45 минут · **Тип урока:** …\n' +
    '## Цели\n- **Образовательная:** …\n- **Развивающая:** …\n- **Воспитательная:** …\n' +
    '## Планируемые результаты\n- …\n## Методы и формы работы\n- …\n## Оборудование\n- …\n' +
    '## Ход урока\n1. **Организационный момент (2 мин)** — …\n2. **Актуализация знаний (5–7 мин)** — вопросы: …\n' +
    '3. **Изучение нового материала (15–20 мин)** — ключевые положения: …\n4. **Закрепление (8–10 мин)** — вопросы и задания: …\n' +
    '5. **Рефлексия (3–5 мин)** — …\n6. **Домашнее задание (2 мин)** — …\n## Оценивание\n- …';

  /** o: {from,to,page,lang,material,fmt,count,grade,docLang} */
  function buildPrompt(task, o, bookName) {
    var f = o.from, t = o.to, rng = f === t ? 'саҳифаи ' + f : 'саҳифаҳои ' + f + '–' + t;
    var sameLang = 'Ҷавобро бо ҳамон забоне нависед, ки матни саҳифаҳо бо он навишта шудааст (забонро худатон муайян кунед).';
    var sys = 'Шумо Алия — ёвари таълимии «Китобхона» ҳастед. Китоб: «' + (bookName || 'Китоб') + '», ' + rng + '.\n' +
      'Танҳо бо такя ба МАТНИ САҲИФАҲО, ки корбар медиҳад, кор кунед.\n' + FORMAT_RULES;
    var u = '';
    switch (task) {
      case 'summary':
        u = 'Хулосаи мавзӯи ' + rng + '-ро тартиб диҳед. Сохтор: «## Мавзӯи асосӣ» (1–2 ҷумла), «## Фикрҳои калидӣ» (3–7 банд), «## Хулоса» (1–2 ҷумла). Сарлавҳаҳоро бо забони матн нависед. ' + sameLang;
        break;
      case 'words':
        u = 'Аз матни саҳифаи ' + f + ' 8–15 калима ва истилоҳи душворфаҳм, кӯҳна, китобӣ ё илмиро интихоб кунед. Ҳар сатр қатъан чунин бошад:\n- **калима** — маънои кӯтоҳу фаҳмо (агар лозим бошад, мисоли кӯтоҳ аз матн)\n' +
          'Танҳо ҳамин рӯйхат: бе сарлавҳа, бе ҷумлаи аввал ва охир. ' + sameLang;
        break;
      case 'translate':
        u = 'Матни ' + rng + '-ро пурра ва дақиқ ба забони ' + (LANG_PROMPT[o.lang] || o.lang || 'русский') + ' тарҷума кунед. Сархатҳо ва сохторро нигоҳ доред; номҳоро дар [[ ]] бо транслитератсия нависед. ' +
          'Танҳо тарҷума — бе шарҳ, бе сарлавҳаи иловагӣ, бе матни асл. Тамоми ҷавоб бо забони ' + (LANG_PROMPT[o.lang] || o.lang) + ' бошад.';
        break;
      case 'test':
        if (o.material === 'test') {
          u = 'Аз рӯи матни ' + rng + ' барои ' + gradeText(o.grade) + ' ' + o.count + ' саволи тестӣ тартиб диҳед. ' + sameLang + '\n' +
            'Формати қатъӣ (ҳар чиз дар сатри алоҳида, байни саволҳо як сатри холӣ):\nСавол 1. Матни савол\nА) …\nБ) …\nВ) …\n' +
            '(Агар матн русӣ бошад, «Вопрос 1.» ва «Ключ:» нависед; вариантҳо ҳамеша А) Б) В).)\n' +
            (o.fmt === 'key'
              ? 'Дар вариантҳо ҳеҷ аломат нагузоред. Баъд аз ҳамаи саволҳо як сатр нависед: «Калид: 1-Б, 2-А, 3-В, …».'
              : 'Дар охири ҳамон сатри варианти дуруст аломати ✔ гузоред (дар ҳар савол танҳо як ✔). Калиди алоҳида нанависед.') +
            ' Саволҳо гуногун бошанд ва ҷавобашон аниқ дар матн бошад.';
        } else if (o.material === 'essay') {
          u = 'Аз рӯи мазмуни ' + rng + ' барои ' + gradeText(o.grade) + ' иншои мукаммал нависед (300–450 калима): «## Сарлавҳа», муқаддима, қисми асосӣ (2–3 сархат бо далел аз матн), хулоса. ' + sameLang;
        } else if (o.material === 'eesse') {
          u = 'Аз рӯи мазмуни ' + rng + ' барои ' + gradeText(o.grade) + ' эссе нависед (250–400 калима): «## Сарлавҳа», фикри асосии муаллиф, мулоҳизаи шахсӣ бо далелҳо аз матн, хулоса. ' + sameLang;
        } else {
          u = 'Аз рӯи мазмуни ' + rng + ' барои ' + gradeText(o.grade) + ' иншои хурд нависед (120–180 калима, 1–2 сархат): «## Сарлавҳа» ва матн. ' + sameLang;
        }
        break;
      case 'lesson':
        u = 'Аз рӯи мазмуни ' + rng + ' барои ' + gradeText(o.grade) + ' нақшаи дарси 45-дақиқаина тартиб диҳед. Ҳамаи қисмҳоро бо мазмуни воқеии ҳамин саҳифаҳо пур кунед.\n' +
          (o.docLang === 'ru' ? LESSON_RU + '\nПишите на русском языке.' : LESSON_TG + '\nБо забони тоҷикӣ нависед.');
        break;
      case 'notes':
        u = 'Аз ' + rng + ' ёддошти кӯтоҳ барои хотиррасонӣ тартиб диҳед: «## Фикрҳои асосӣ» (5–8 банд, ҳар банд як ҷумла); агар бошад «## Иқтибосҳо» (1–3 иқтибоси айнан аз матн, ҳар кадом бо «> »); «## Мафҳумҳо» (то 5 банд: «- **мафҳум** — шарҳ»). Сарлавҳаҳоро бо забони матн нависед. ' + sameLang;
        break;
    }
    return { system: sys, user: u };
  }
  function taskTitle(task, o) {
    var d = TASKS[task];
    if (task === 'translate') return d.label + ' · ' + o.lang;
    if (task === 'test') {
      if (o.material === 'test') return 'Тест · ' + (o.fmt === 'key' ? 'бо калид' : 'бо ҷавоб');
      var m = MATERIALS.filter(function (x) { return x[0] === o.material; })[0];
      return m ? m[1] : d.label;
    }
    return d.label;
  }
  function maxTokens(task, o) {
    if (task === 'translate') return 4000;
    if (task === 'lesson') return 3500;
    if (task === 'test') return o.material === 'test' ? Math.min(4000, 400 + o.count * 140) : 2200;
    return 2200;
  }

  /* ------------------------------------------------------------------ */
  /*  Форма барои амал (варақа дар Reader, дар саҳифаи Алия — дар дохил) */
  /* ------------------------------------------------------------------ */
  function newState(cur) {
    return { from: cur || 1, to: cur || 1, page: cur || 1, lang: 'Русский', material: 'test', fmt: 'ans', count: 10 };
  }
  /** ctx: {curPage,totalPages,grade,gradeAuto,needBook} */
  function fieldsHTML(task, st, ctx) {
    var d = TASKS[task], h = '', total = ctx.totalPages || '';
    d.fields.forEach(function (f) {
      if (f === 'range') {
        h += '<div class="at-fld"><label>Саҳифаҳо</label><div class="at-row2">' +
          '<input class="at-inp" type="number" inputmode="numeric" data-f="from" min="1"' + (total ? ' max="' + total + '"' : '') + ' value="' + esc(st.from) + '" placeholder="Аз" aria-label="Аз саҳифа">' +
          '<input class="at-inp" type="number" inputmode="numeric" data-f="to" min="1"' + (total ? ' max="' + total + '"' : '') + ' value="' + esc(st.to) + '" placeholder="То" aria-label="То саҳифа"></div>' +
          '<div class="at-chips" style="margin-top:8px">' +
          [[0, 'Ҳамин саҳифа'], [2, '3 саҳифа'], [4, '5 саҳифа']].map(function (r) {
            return '<button type="button" class="at-chip' + (Number(st.to) - Number(st.from) === r[0] ? ' on' : '') + '" data-r="' + r[0] + '">' + r[1] + '</button>';
          }).join('') + '</div><div class="at-hint">Дар як бор то ' + MAX_PAGES + ' саҳифа' + (total ? ' · дар китоб ' + total + ' саҳифа' : '') + '. Китобҳои сканшуда ҳам хонда мешаванд.</div></div>';
      }
      if (f === 'page') {
        if (ctx.fixedPage) {
          h += '<div class="at-auto">📄 <span>Саҳифаи ҷорӣ: <b>' + esc(ctx.curPage) + '</b> · забон худкор муайян мешавад</span></div>';
        } else {
          h += '<div class="at-fld"><label>Саҳифа</label><input class="at-inp" type="number" inputmode="numeric" data-f="page" min="1"' + (total ? ' max="' + total + '"' : '') + ' value="' + esc(st.page) + '"><div class="at-hint">Забон худкор муайян мешавад.</div></div>';
        }
      }
      if (f === 'lang') {
        h += '<div class="at-fld"><label>Забони тарҷума</label><div class="at-chips">' + LANGS.map(function (l) {
          return '<button type="button" class="at-chip' + (st.lang === l ? ' on' : '') + '" data-l="' + esc(l) + '">' + esc(l) + '</button>';
        }).join('') + '</div></div>';
      }
      if (f === 'material') {
        h += '<div class="at-fld"><label>Намуди кор</label><div class="at-seg" style="grid-template-columns:repeat(4,minmax(0,1fr))">' + MATERIALS.map(function (m) {
          return '<button type="button" data-m="' + m[0] + '" class="' + (st.material === m[0] ? 'on' : '') + '">' + m[1] + '</button>';
        }).join('') + '</div></div>';
        if (st.material === 'test') {
          h += '<div class="at-fld"><label>Шакли тест</label><div class="at-seg" style="grid-template-columns:1fr 1fr">' +
            '<button type="button" data-fmt="ans" class="' + (st.fmt === 'ans' ? 'on' : '') + '">✔ Бо ҷавоб</button>' +
            '<button type="button" data-fmt="key" class="' + (st.fmt === 'key' ? 'on' : '') + '">🔑 Бо калид</button></div>' +
            '<div class="at-hint">' + (st.fmt === 'ans' ? 'Варианти дуруст (А, Б, В) бо ✔ қайд мешавад.' : 'Ҷавобҳо дар охир ҳамчун калид меоянд.') + '</div></div>';
          h += '<div class="at-fld"><label>Шумораи саволҳо</label><div class="at-stepper"><button type="button" data-s="-1" aria-label="Кам">−</button>' +
            '<input class="at-inp" data-f="count" type="number" inputmode="numeric" min="1" max="50" value="' + esc(st.count) + '" aria-label="Шумораи саволҳо">' +
            '<button type="button" data-s="1" aria-label="Зиёд">＋</button></div><div class="at-hint">Рақамро худатон нависед (1–50).</div></div>';
        }
      }
      if (f === 'auto') {
        var g = ctx.grade ? 'синфи ' + ctx.grade : 'аз рӯи матн';
        h += '<div class="at-auto">⚙️ <span>' + (ctx.gradeAuto === false ? 'Синф: ' : 'Худкор: ') + '<b>' + esc(g) + '</b>' +
          (task === 'lesson' ? ' · забон ва қолаб (тоҷикӣ / русӣ) аз рӯи матн' : '') + '</span></div>';
      }
    });
    return h;
  }
  function bindFields(root, task, st, ctx, rerender) {
    root.querySelectorAll('[data-r]').forEach(function (b) {
      b.onclick = function () {
        var base = clampInt(st.from, 1, ctx.totalPages || 99999, ctx.curPage || 1);
        st.from = base; st.to = Math.min(ctx.totalPages || 99999, base + Number(b.getAttribute('data-r')));
        rerender();
      };
    });
    root.querySelectorAll('input[data-f]').forEach(function (inp) {
      inp.oninput = function () { st[inp.getAttribute('data-f')] = inp.value; };
    });
    root.querySelectorAll('[data-l]').forEach(function (b) { b.onclick = function () { st.lang = b.getAttribute('data-l'); rerender(); }; });
    root.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { st.material = b.getAttribute('data-m'); rerender(); }; });
    root.querySelectorAll('[data-fmt]').forEach(function (b) { b.onclick = function () { st.fmt = b.getAttribute('data-fmt'); rerender(); }; });
    root.querySelectorAll('[data-s]').forEach(function (b) {
      b.onclick = function () {
        var v = clampInt((parseInt(st.count, 10) || 10) + Number(b.getAttribute('data-s')), 1, 50, 10);
        st.count = v; var c = root.querySelector('input[data-f="count"]'); if (c) c.value = v;
      };
    });
  }
  /** → {error} ё {opts} */
  function validate(task, st, ctx) {
    var d = TASKS[task], total = ctx.totalPages || 0, o = { lang: st.lang, material: st.material, fmt: st.fmt, grade: ctx.grade || null };
    if (d.fields.indexOf('range') >= 0) {
      var f = parseInt(st.from, 10), t = parseInt(st.to, 10);
      if (!f || !t || f < 1 || t < 1) return { error: 'Рақами саҳифаҳоро нависед.' };
      if (t < f) { var x = f; f = t; t = x; st.from = f; st.to = t; }
      if (total && t > total) return { error: 'Китоб ҳамагӣ ' + total + ' саҳифа дорад.' };
      if (t - f + 1 > MAX_PAGES) return { error: 'Дар як бор то ' + MAX_PAGES + ' саҳифа интихоб кунед.' };
      o.from = f; o.to = t;
    }
    if (d.fields.indexOf('page') >= 0) {
      var p = ctx.fixedPage ? ctx.curPage : parseInt(st.page, 10);
      if (!p || p < 1) return { error: 'Рақами саҳифаро нависед.' };
      if (total && p > total) return { error: 'Китоб ҳамагӣ ' + total + ' саҳифа дорад.' };
      o.from = o.to = p;
    }
    if (task === 'test' && st.material === 'test') {
      var c = parseInt(st.count, 10);
      if (!(c >= 1 && c <= 50)) return { error: 'Шумораи саволҳоро нависед (1–50).' };
      o.count = c;
    }
    return { opts: o };
  }

  /* ------------------------------------------------------------------ */
  /*  Сабти файл (ҳамон нақшаи Reader: AndroidBridge.saveFile → <a download>) */
  /* ------------------------------------------------------------------ */
  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }
  async function saveBlob(blob, fileName, mime) {
    if (window.AliyaBridge && typeof window.AliyaBridge.saveFile === 'function') return window.AliyaBridge.saveFile(blob, fileName, mime);
    if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') {
      window.AndroidBridge.saveFile(await blobToBase64(blob), fileName, mime);
      return { success: true, method: 'android_bridge' };
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = fileName; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
    return { success: true, method: 'browser_blob' };
  }
  function safeName(s) { return String(s || 'Алия').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_').slice(0, 60); }
  var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  function b64ToBlob(b64, mime) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  async function exportDoc(format, title, text, baseName) {
    var fileName = 'Алия_' + safeName(baseName || title) + (format === 'pdf' ? '.pdf' : '.docx');
    var blob;
    if (format === 'docx' && window.AliyaTemplates) {
      blob = typeof window.AliyaTemplates.generateMarkdownDocx === 'function'
        ? window.AliyaTemplates.generateMarkdownDocx({ title: title, markdown: text })
        : window.AliyaTemplates.generateResponseDocx({ title: title, content: plain(text) });
    } else {
      var d = await postJson('/v1/document/generate', {
        title: String(title).slice(0, 180),
        content_markdown: pdfMarkdown(text) + '\n\n---\n📚 Омодашуда бо ёрии «Алия» — Зеҳни сунъии Тоҷикӣ\n📖 Китобхонаи электронии Тоҷикӣ\n📲 https://play.google.com/store/apps/details?id=com.kitobkhona.app',
        target_format: format
      }, 90000);
      if (!d.file_base64) throw new Error('Ҳуҷҷат аз сервер қабул нашуд.');
      blob = b64ToBlob(d.file_base64, format === 'pdf' ? 'application/pdf' : DOCX_MIME);
    }
    await saveBlob(blob, fileName, format === 'pdf' ? 'application/pdf' : DOCX_MIME);
    return fileName;
  }
  function copyText(text) {
    var t = plain(text);
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
      return ok ? Promise.resolve() : Promise.reject(new Error('copy'));
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).catch(fallback);
    return fallback();
  }

  /* ------------------------------------------------------------------ */
  /*  Иҷрои амал: статус → чоп → асбобҳо                                  */
  /* ------------------------------------------------------------------ */
  /**
   * run({box, task, opts, bookName, bookUrl, getText(o, ui) → Promise<string>, scroller, onBusy, onSaved, extraContext})
   * Бармегардонад {abort()}
   */
  function run(cfg) {
    injectStyles();
    var task = cfg.task, d = TASKS[task], o = cfg.opts, box = cfg.box, theme = themeName();
    var ctrl = new AbortController(), timers = [], finished = false;
    var title = taskTitle(task, o), meta = 'саҳ. ' + rangeLabel(o.from, o.to);
    var steps = d.steps.slice(), readN = d.read || 1, fin = d.fin;
    if (task === 'test' && o.material !== 'test') { steps = ['Мехонам', 'Менависам']; readN = 1; fin = 'Омода шуд'; }
    box.innerHTML = '<div class="at-ans"><div class="at-head"><b>' + d.ic + ' ' + esc(title) + '</b><small>' + esc(meta) + '</small></div>' +
      '<div class="at-think"></div><div class="at-body"></div></div>';
    var card = box.firstChild, think = card.querySelector('.at-think'), body = card.querySelector('.at-body'), small = card.querySelector('.at-head small');
    var step = -1;
    function showStep(i) {
      if (i === step || !think.isConnected) return;
      step = i;
      think.innerHTML = emblem(true, theme) + '<span class="at-think-txt swap">' + esc(steps[i]) + '</span><span class="at-dots"><i></i><i></i><i></i></span>';
    }
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    // Марҳилаи хондан: steps[0..readN-1]
    showStep(0);
    (function rotateRead(i) { if (i < readN - 1) later(function () { if (step < readN) { showStep(i + 1); rotateRead(i + 1); } }, 1800); })(0);
    function genPhase() {
      clearTimers();
      if (readN < steps.length) showStep(readN);
      (function rotate(i) { if (i < steps.length - 1) later(function () { showStep(i + 1); rotate(i + 1); }, 2600); })(readN);
    }
    if (cfg.onBusy) cfg.onBusy(true);
    scrollIntoView();

    (async function () {
      var output = '';
      try {
        var text = await cfg.getText(o, { signal: ctrl.signal, onPage: function (i, n) { if (n > 1) small.textContent = meta + ' · ' + i + '/' + n; } });
        small.textContent = meta;
        if (!text || text.replace(/\[САҲИФАИ \d+\]/g, '').trim().length < 15) throw new Error('Матни ин саҳифаҳо хонда нашуд. Саҳифаи дигарро интихоб кунед ё баъдтар кӯшиш кунед.');
        if (task === 'lesson') o.docLang = detectLang(text) === 'ru' ? 'ru' : 'tg';
        genPhase();
        var pr = buildPrompt(task, o, cfg.bookName);
        var user = pr.user + (cfg.extraContext ? '\n\n' + cfg.extraContext : '') + '\n\nМАТНИ САҲИФАҲО:\n' + text;
        output = await chat(pr.system, user, { signal: ctrl.signal, maxTokens: maxTokens(task, o), temperature: task === 'translate' ? 0.2 : 0.45, reasoning: task === 'lesson' || task === 'test' ? 'high' : 'medium' });
        output = cleanOutput(output);
      } catch (err) {
        clearTimers();
        if (cfg.onBusy) cfg.onBusy(false);
        if (err && err.name === 'AbortError') return;
        think.remove();
        body.innerHTML = '<div class="at-errbox"><span>⚠️ ' + esc(friendlyError(err)) + '</span><button type="button">↻ Дубора</button></div>';
        body.querySelector('button').onclick = function () { run(cfg); };
        return;
      }
      clearTimers();
      if (ctrl.signal.aborted) return;
      if (fin) {
        think.outerHTML = '<div class="at-done">✓ ' + esc(fin) + '</div>';
        later(type, 650);
      } else { think.remove(); type(); }
      function type() {
        var done = card.querySelector('.at-done'); if (done) done.remove();
        typewriter(body, output, cfg.scroller, ctrl.signal, function () {
          finished = true;
          if (cfg.onBusy) cfg.onBusy(false);
          addTools(card, output, title, o, cfg);
        });
      }
    })();

    function scrollIntoView() {
      var sc = cfg.scroller;
      if (!sc) return;
      setTimeout(function () {
        var top = box.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 8;
        if (top > sc.scrollTop + sc.clientHeight * 0.55 || top < sc.scrollTop) sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }, 60);
    }
    return {
      abort: function () { if (!finished) { ctrl.abort(); clearTimers(); if (cfg.onBusy) cfg.onBusy(false); } },
      get finished() { return finished; }
    };
  }
  /** Ҷумлаҳои «пур кардан»-ро аз аввал/охир тоза мекунад */
  function cleanOutput(s) {
    s = String(s || '').replace(/\r/g, '').trim();
    s = s.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
    var lines = s.split('\n');
    var filler = /^(албатта|инак|хуб|бале|мана|дар зер|дар поён|конечно|вот|ниже|sure|here is|here are)\b[^\n]{0,120}[:.!]?\s*$/i;
    var fillerBook = /(аз (рӯи )?(матни )?китоб омода шуд|prepared from the book|подготовлено на основе)/i;
    while (lines.length && (filler.test(lines[0].trim()) || fillerBook.test(lines[0]))) lines.shift();
    var tail = /^(агар (боз )?(хоҳед|савол)|умедворам|если (хотите|нужно)|надеюсь|hope this|let me know|омодаам кӯмак)/i;
    while (lines.length && (tail.test(lines[lines.length - 1].trim()) || fillerBook.test(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) lines.pop();
    return lines.join('\n').trim();
  }
  function typewriter(el, text, scroller, signal, done) {
    var n = 0, total = text.length, stepN = Math.max(2, Math.ceil(total / 320)), stopped = false;
    function follow() {
      if (!scroller) return;
      var gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (gap < 140) scroller.scrollTop = scroller.scrollHeight;
    }
    function finish() {
      if (stopped) return;
      stopped = true; clearInterval(iv);
      el.innerHTML = md(text);
      el.removeEventListener('click', skip);
      done();
    }
    function skip() { if (!stopped) finish(); }
    el.addEventListener('click', skip);
    var iv = setInterval(function () {
      if (signal && signal.aborted) { stopped = true; clearInterval(iv); return; }
      n = Math.min(total, n + stepN);
      if (n >= total) { finish(); follow(); return; }
      el.innerHTML = md(text.slice(0, n));
      var last = el.lastElementChild;
      while (last && last.lastElementChild && /^(UL|OL|DIV|TABLE|TBODY|TR)$/.test(last.tagName)) last = last.lastElementChild;
      var caret = document.createElement('span'); caret.className = 'at-caret';
      (last || el).appendChild(caret);
      follow();
    }, 24);
  }
  function addTools(card, text, title, o, cfg) {
    var bar = document.createElement('div');
    var canSave = cfg.saveNotes !== false;
    bar.className = 'at-tools' + (canSave ? '' : ' no-save');
    bar.innerHTML = '<button type="button" class="at-tool" data-a="copy">📋 Нусха</button>' +
      '<button type="button" class="at-tool" data-a="docx">📄 Word</button>' +
      '<button type="button" class="at-tool" data-a="pdf">⬇ PDF</button>' +
      (canSave ? '<button type="button" class="at-tool save" data-a="save" title="Ба ёддоштҳо" aria-label="Ба ёддоштҳо">🔖</button>' : '');
    card.appendChild(bar);
    var docTitle = title + ' — ' + (cfg.bookName || 'Китоб') + ' (саҳ. ' + rangeLabel(o.from, o.to) + ')';
    var base = TASKS[cfg.task].short + '_' + (cfg.bookName || '') + '_с' + rangeLabel(o.from, o.to);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      var a = b.getAttribute('data-a');
      if (a === 'copy') {
        copyText(text).then(function () { toast('✓ Матн нусхабардорӣ шуд'); }, function () { toast('Нусхабардорӣ нашуд. Матнро дастӣ интихоб кунед.'); });
      } else if (a === 'docx' || a === 'pdf') {
        var idle = b.innerHTML; b.disabled = true; b.textContent = '⏳';
        exportDoc(a, docTitle, text, base).then(function () {
          toast(a === 'pdf' ? '✓ PDF сабт шуд' : '✓ Word сабт шуд');
        }, function (err) {
          toast('Ҳуҷҷат сабт нашуд: ' + friendlyError(err), 3200);
        }).then(function () { b.disabled = false; b.innerHTML = idle; });
      } else if (a === 'save') {
        if (b.classList.contains('done')) { toast('Аллакай дар ёддоштҳо ҳаст'); return; }
        try {
          Notes.add(cfg.bookUrl || '', { page: o.from, pages: rangeLabel(o.from, o.to), task: cfg.task, title: title, book: cfg.bookName, text: text });
          b.classList.add('done'); b.textContent = '✓';
          toast('🔖 Ба ёддоштҳо илова шуд');
          if (cfg.onSaved) cfg.onSaved();
        } catch (err) { toast(friendlyError(err), 3200); }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Рӯйхати ёддоштҳо (Reader ва саҳифаи Алия)                          */
  /* ------------------------------------------------------------------ */
  function fmtDate(ts) {
    try {
      var d = new Date(ts);
      var p = function (x) { return (x < 10 ? '0' : '') + x; };
      return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return ''; }
  }
  /**
   * renderNotesList(container, {book, allBooks, onGo(page, bookUrl, note), onChange})
   */
  function renderNotesList(container, cfg) {
    injectStyles();
    cfg = cfg || {};
    var filter = cfg._filter || 'all';
    var items = [];
    if (cfg.allBooks) {
      var all = Notes.all();
      Object.keys(all).forEach(function (k) { all[k].forEach(function (n) { items.push({ n: n, key: k }); }); });
      items.sort(function (a, b) { return (b.n.ts || 0) - (a.n.ts || 0); });
    } else {
      items = Notes.list(cfg.book).map(function (n) { return { n: n, key: bookKey(cfg.book) }; });
    }
    var counts = {}; items.forEach(function (it) { counts[it.n.task] = (counts[it.n.task] || 0) + 1; });
    var chips = '<button type="button" class="at-chip' + (filter === 'all' ? ' on' : '') + '" data-flt="all">Ҳама (' + items.length + ')</button>' +
      ORDER.filter(function (k) { return counts[k]; }).map(function (k) {
        return '<button type="button" class="at-chip' + (filter === k ? ' on' : '') + '" data-flt="' + k + '">' + TASKS[k].ic + ' ' + TASKS[k].short + ' (' + counts[k] + ')</button>';
      }).join('');
    var shown = items.filter(function (it) { return filter === 'all' || it.n.task === filter; });
    var html = items.length ? '<div class="at-nt-filter">' + chips + '</div>' : '';
    if (!shown.length) {
      html += '<div class="at-nt-empty">🔖<br>Ҳоло ёддошт нест.<br>Дар Алия зери ҷавоб тугмаи 🔖-ро пахш кунед.</div>';
    } else {
      html += shown.map(function (it, i) {
        var n = it.n, d = TASKS[n.task] || TASKS.notes;
        return '<div class="at-nt-card" data-i="' + i + '"><div class="at-nt-meta"><span class="at-nt-type">' + d.ic + ' ' + esc(n.title || d.short) + '</span>' +
          (n.pages ? '<span>саҳ. ' + esc(n.pages) + '</span>' : '') + '<span class="d">' + fmtDate(n.ts) + '</span></div>' +
          (cfg.allBooks && n.book ? '<div class="at-nt-book">📘 ' + esc(n.book) + '</div>' : '') +
          '<div class="at-nt-text at-body">' + md(n.text) + '</div>' +
          '<div class="at-nt-act"><button type="button" data-a="open">Пурра</button><button type="button" data-a="copy">📋 Нусха</button>' +
          (cfg.onGo && n.page ? '<button type="button" data-a="go">📖 Ба саҳифа</button>' : '') +
          '<button type="button" class="del" data-a="del" aria-label="Нест кардан">🗑</button></div></div>';
      }).join('');
    }
    html += '<div class="at-nt-local">Ёддоштҳо танҳо дар ҳамин дастгоҳ нигоҳ дошта мешаванд.</div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-flt]').forEach(function (b) {
      b.onclick = function () { cfg._filter = b.getAttribute('data-flt'); renderNotesList(container, cfg); };
    });
    container.querySelectorAll('.at-nt-card').forEach(function (c) {
      var it = shown[Number(c.getAttribute('data-i'))];
      var txt = c.querySelector('.at-nt-text');
      // кнопкаи «Пурра» танҳо вақте лозим аст, ки матн дароз бошад
      requestAnimationFrame(function () { if (txt.scrollHeight <= txt.clientHeight + 4) { txt.classList.add('open'); var ob = c.querySelector('[data-a="open"]'); if (ob) ob.remove(); } });
      c.onclick = function (e) {
        var b = e.target.closest('button[data-a]'); if (!b) return;
        var a = b.getAttribute('data-a');
        if (a === 'open') { txt.classList.toggle('open'); b.textContent = txt.classList.contains('open') ? 'Пӯшидан' : 'Пурра'; }
        if (a === 'copy') copyText(it.n.text).then(function () { toast('✓ Нусхабардорӣ шуд'); }, function () { toast('Нусхабардорӣ нашуд'); });
        if (a === 'go' && cfg.onGo) cfg.onGo(it.n.page, it.key, it.n);
        if (a === 'del') {
          confirmDialog('Ёддошт нест карда шавад?', { ok: 'Нест кардан', danger: true, text: 'Ин амалро бекор кардан мумкин нест.' }).then(function (yes) {
            if (!yes) return;
            Notes.remove(it.key, it.n.ts);
            renderNotesList(container, cfg);
            if (cfg.onChange) cfg.onChange();
            toast('Ёддошт нест карда шуд');
          });
        }
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Тугмаҳои 6 амал                                                     */
  /* ------------------------------------------------------------------ */
  function renderTaskGrid(container, onPick, opt) {
    injectStyles();
    opt = opt || {};
    container.classList.add('at-tasks');
    if (opt.wide) container.classList.add('at-wide');
    container.innerHTML = ORDER.map(function (k) {
      var d = TASKS[k];
      return '<button type="button" class="at-task" data-task="' + k + '"><span class="at-ti">' + d.ic + '</span><span class="at-tl">' + esc(d.label) + '</span></button>';
    }).join('');
    container.querySelectorAll('.at-task').forEach(function (b) { b.onclick = function () { onPick(b.getAttribute('data-task'), b); }; });
  }

  window.AliyaTasks = {
    version: '159',
    GATEWAY: GATEWAY, TASKS: TASKS, ORDER: ORDER, LANGS: LANGS, MATERIALS: MATERIALS, MAX_PAGES: MAX_PAGES,
    esc: esc, md: md, plain: plain, emblem: emblem, injectStyles: injectStyles,
    toast: toast, openSheet: openSheet, closeSheet: closeSheet, confirm: confirmDialog, prompt: promptDialog,
    bookKey: bookKey, detectGrade: detectGrade, detectLang: detectLang,
    notes: Notes, renderNotesList: renderNotesList, renderTaskGrid: renderTaskGrid,
    loadPdf: loadPdf, ensurePdfJs: ensurePdfJs, createPageReader: createPageReader,
    chat: chat, buildPrompt: buildPrompt, cleanOutput: cleanOutput,
    newState: newState, fieldsHTML: fieldsHTML, bindFields: bindFields, validate: validate,
    run: run, exportDoc: exportDoc, saveBlob: saveBlob, copyText: copyText, friendlyError: friendlyError
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectStyles); else injectStyles();
})(window, document);
