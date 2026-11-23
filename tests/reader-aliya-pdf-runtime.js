#!/usr/bin/env node
/**
 * Runtime test: the "PDF" button under an Aliya answer must produce a real
 * PDF file — not just "not hang".
 *
 *   node tests/reader-aliya-pdf-runtime.js
 *
 * Unlike the other runtime tests this one does not stub the PDF libraries:
 * it loads the REAL assets/libs/pdf-lib.min.js and assets/libs/fontkit.umd.min.js
 * and the REAL fonts from assets/fonts/, then runs the real aliya-pdf.js and
 * checks that a valid PDF comes out the other end.
 *
 * Note on the harness: the VM context must NOT receive the outer realm's
 * built-ins (Promise/Array/Object/...). pdf-lib validates its arguments with
 * `instanceof` against classes created in its own realm, so mixing realms
 * makes addPage() reject a perfectly good page size with a misleading
 * "type NaN" error. The context therefore uses its own built-ins, and
 * `window` points at the context's global object.
 */
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
function check(name, cond, detail) {
  if (cond) console.log('PASS ' + name);
  else { console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name); }
}

/* ------------------------------------------------------------------ */
/* The window stub                                                     */
/* ------------------------------------------------------------------ */
function makeWindow() {
  // Only host objects the module genuinely needs; no outer built-ins.
  const win = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { userAgent: 'node' },
    location: { href: 'https://x.test/aliya/reader-aliya.html', pathname: '/aliya/reader-aliya.html' },
    document: {
      head: { appendChild() {} },
      body: { appendChild() {} },
      createElement: () => ({ style: {}, set src(v) {}, set async(v) {}, set onload(v) {}, set onerror(v) {} }),
      querySelector(sel) {
        // The module derives its asset base from its own <script> tag.
        if (String(sel).includes('aliya-pdf.js')) return { src: 'https://x.test/aliya/aliya-pdf.js?v=176' };
        if (String(sel).includes('aliya-tasks.js')) return { src: 'https://x.test/aliya/aliya-tasks.js?v=176' };
        return null;
      },
      addEventListener() {}, removeEventListener() {},
    },
    // The PDF module loads its fonts with fetch(); serve them from disk.
    // The bytes are copied into a buffer that belongs to the VM context, so
    // pdf-lib's `instanceof Uint8Array` checks accept them.
    async fetch(url) {
      const rel = String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '');
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) {
        return { ok: false, status: 404, async arrayBuffer() { return vm.runInContext('new ArrayBuffer(0)', ctx); } };
      }
      const buf = fs.readFileSync(file);
      const bytes = new Uint8Array(buf);
      // Copy into the context realm.
      const contextBytes = vm.runInContext('new Uint8Array(' + bytes.length + ')', ctx);
      contextBytes.set(bytes);
      return {
        ok: true,
        status: 200,
        async arrayBuffer() { return contextBytes.buffer; },
      };
    },
  };
  win.window = win;
  win.globalThis = win;
  win.self = win;
  return win;
}

const win = makeWindow();
const ctx = vm.createContext(win);
// Inside the context `window` must BE the context's global object.
vm.runInContext('globalThis.window = globalThis;', ctx);
// Blob is used to hand the finished PDF back; it must be the context's own
// class so that `instanceof` checks inside the module behave.
vm.runInContext(`
  globalThis.Blob = class Blob {
    constructor(parts, opts) {
      this.parts = parts;
      this.type = (opts && opts.type) || '';
      this.size = 0;
      for (const p of parts) this.size += (p && p.length) || 0;
    }
    async arrayBuffer() {
      const first = this.parts[0];
      return first && first.buffer ? first.buffer.slice(first.byteOffset, first.byteOffset + first.byteLength) : new ArrayBuffer(0);
    }
  };
`, ctx);

/* ------------------------------------------------------------------ */
/* Load the real libraries and the module under test                    */
/* ------------------------------------------------------------------ */
function loadUmd(file, globalName) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInContext(code + '\nglobalThis.__' + globalName + ' = ' + globalName + ';', ctx, { filename: file });
  const lib = vm.runInContext('__' + globalName, ctx);
  if (!lib) throw new Error(globalName + ' was not exported by ' + file);
  return lib;
}

const PDFLib = loadUmd('assets/libs/pdf-lib.min.js', 'PDFLib');
const fontkit = loadUmd('assets/libs/fontkit.umd.min.js', 'fontkit');
check('pdf-lib is available', !!PDFLib && typeof PDFLib.PDFDocument === 'function');
check('fontkit is available', !!fontkit && typeof fontkit.create === 'function');

// The module under test must see the libraries through the shared global.
vm.runInContext('globalThis.PDFLib = PDFLib; globalThis.fontkit = fontkit;', ctx);

vm.runInContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-pdf.js'), 'utf8'), ctx, { filename: 'aliya-pdf.js' });
const AliyaPdf = vm.runInContext('AliyaPdf', ctx);
check('aliya-pdf.js exposes its API', !!AliyaPdf && typeof AliyaPdf.build === 'function');

(async () => {
  /* ---------------------------------------------------------------- */
  /* 1. The fonts the PDF needs must be reachable over HTTP-like fetch */
  /* ---------------------------------------------------------------- */
  try {
    const libs = await AliyaPdf.ensureLibs();
    check('the PDF fonts and libraries load from the local assets',
      !!(libs && libs.reg && libs.bold && libs.ital && libs.sym),
      libs ? 'missing font buffers' : 'ensureLibs() returned nothing');
  } catch (e) {
    check('the PDF fonts and libraries load from the local assets', false, e && e.message);
    throw e;
  }

  /* ---------------------------------------------------------------- */
  /* 2. A real answer must turn into a real PDF                       */
  /* ---------------------------------------------------------------- */
  const markdown = [
    '# Хулосаи мавзӯъ',
    '',
    'Ин як ҷумлаи муқовама аст. Дар он калимаҳои тоҷикӣ ҳастанд: китоб, хондан, саҳифа.',
    '',
    '## Фикрҳои калидӣ',
    '',
    '- Нуқтаи якум',
    '- Нуқтаи дуюм',
    '',
    '| Матн | Саҳифа |',
    '| --- | --- |',
    '| Сарчашма | 12 |',
  ].join('\n');

  const blob = await AliyaPdf.build({
    title: 'Хулосаи мавзӯъ',
    subtitle: '«Китоб» · саҳ. 1',
    markdown,
    lang: 'tg',
    docType: 'Хулоса',
    book: 'Китоб',
    fileTitle: 'Хулосаи мавзӯъ — Китоб',
  });

  check('the PDF export returns a blob', !!blob, 'got ' + typeof blob);
  check('the blob is a PDF by its mime type', blob && blob.type === 'application/pdf', 'type=' + (blob && blob.type));

  // Read the raw bytes back out of the blob.
  const buffer = await blob.arrayBuffer();
  const bytes = Buffer.from(buffer);
  check('the PDF export returns a buffer', bytes.length > 0, 'length=' + bytes.length);

  const head = bytes.slice(0, 5).toString('latin1');
  check('the produced file is a real PDF (%%PDF header)', head === '%PDF-', 'header=' + JSON.stringify(head));

  const tail = bytes.slice(-1024).toString('latin1');
  check('the produced PDF is properly terminated (%%EOF)', tail.includes('%%EOF'), 'missing %%EOF');

  // Parse it back with pdf-lib to prove it is structurally valid. The bytes
  // are copied into the context realm first (pdf-lib checks `instanceof`).
  const contextBytes = vm.runInContext('new Uint8Array(' + bytes.length + ')', ctx);
  contextBytes.set(bytes);
  const parsed = await PDFLib.PDFDocument.load(contextBytes);
  const pageCount = parsed.getPageCount();
  check('the produced PDF parses back and has pages', pageCount >= 1, 'pages=' + pageCount);
  check('the PDF carries the expected page size (A4)', Math.abs(parsed.getPage(0).getWidth() - 595.28) < 2,
    'width=' + parsed.getPage(0).getWidth());
  check('the PDF carries the Aliya title', /Хулоса/.test(parsed.getTitle() || ''), 'title=' + parsed.getTitle());

  /* ---------------------------------------------------------------- */
  /* 3. The Play Store link for the Android build                     */
  /* ---------------------------------------------------------------- */
  check('the PDF module reports the store link for the Android build',
    typeof AliyaPdf.PLAY_URL === 'string' && AliyaPdf.PLAY_URL.indexOf('play.google.com') > -1,
    AliyaPdf.PLAY_URL);

  if (failures.length) {
    console.error('\n' + failures.length + ' reader Aliya PDF runtime check(s) failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('\nPASS reader Aliya PDF runtime: a real, valid PDF is produced from an Aliya answer.');
})().catch((e) => { console.error(e); process.exit(1); });
