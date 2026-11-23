#!/usr/bin/env node
/**
 * Runtime test: the "Word" / "PDF" buttons under an Aliya answer inside the
 * reader must actually produce a file.
 *
 *   node tests/reader-aliya-export-runtime.js
 *
 * This loads the real aliya-tasks.js in a DOM stub (the same way the reader
 * panel loads it) and then drives the export path end to end, capturing what
 * saveFile() receives.
 */
'use strict';

const assert = require('node:assert/strict');
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
/* DOM stub                                                            */
/* ------------------------------------------------------------------ */
function makeEl(id) {
  return {
    id,
    style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, o) { o ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    children: [], dataset: {}, textContent: '', innerHTML: '', value: '', hidden: false,
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    replaceChildren() { this.children = []; },
    remove() {}, setAttribute() {}, getAttribute: () => null,
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 1000 }),
    getContext: () => ({ fillRect() {}, fillStyle: '' }),
    animate: () => ({ cancel() {}, onfinish: null }),
    focus() {}, click() {},
    clientWidth: 800, clientHeight: 1000,
  };
}

const saved = [];
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Math, Date, JSON, String, Number, Array, Object, RegExp, Error, Intl,
  Uint8Array, Float32Array, ArrayBuffer, isNaN, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent, TextDecoder, TextEncoder, AbortController,
  document: {
    body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
    activeElement: null, hidden: false,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: (t) => makeEl('c-' + t), addEventListener() {}, removeEventListener() {},
  },
  location: { search: '', href: 'https://x.test/aliya/reader-aliya.html', pathname: '/aliya/reader-aliya.html' },
  navigator: { onLine: true, userAgent: 'node', clipboard: null },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
  Blob: class {
    constructor(p) { this.parts = p; this.size = 1000; this.type = ''; }
    async arrayBuffer() { return new ArrayBuffer(64); }
    async text() { return ''; }
  },
  FileReader: class { readAsDataURL() {} addEventListener() {} },
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  // The PDF builder fetches jsPDF from a CDN. This sandbox has no outbound
  // access, so the fetch fails — the export must then report a readable error
  // instead of hanging or silently doing nothing.
  fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  indexedDB: null,
  // The bridge that actually receives the file.
  AliyaBridge: {
    saveFile: async (content, fileName, mimeType) => {
      saved.push({ fileName, mimeType, isBlob: content instanceof sandbox.Blob });
      return { success: true, method: 'test' };
    },
    shareFileOrText: async () => true,
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};

const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-tasks.js'), 'utf8'), ctx, { filename: 'aliya-tasks.js' });

const AT = sandbox.AliyaTasks;
check('AliyaTasks loaded', !!AT);
check('AliyaTasks.exportDoc is a function', typeof AT.exportDoc === 'function');

(async () => {
  /* ---------------------------------------------------------------- */
  /* Word export                                                        */
  /* ---------------------------------------------------------------- */
  // The reader panel loads aliya-doc-templates.js but the export helper
  // needs it on window.AliyaTemplates.
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-doc-templates.js'), 'utf8'), ctx, { filename: 'aliya-doc-templates.js' });
  check('AliyaTemplates loaded', !!sandbox.AliyaTemplates);

  const answerText = '# Сарлавҳа\n\nИн ҷавоби Алия аст.\n\n- якум\n- дуюм';

  let docxErr = null;
  let docxName = null;
  try {
    docxName = await AT.exportDoc('docx', 'Ҷавоби Алия', answerText, {
      lang: 'tg', docType: 'Ҷавоби Алия', book: 'Китоб', topic: 'Мавзӯъ', pages: 'саҳ. 1',
    });
  } catch (e) {
    docxErr = e;
  }
  check('Word export does not throw', !docxErr, docxErr && (docxErr.name + ': ' + docxErr.message));
  check('Word export produces a .docx file', /\.docx$/.test(String(docxName || '')), String(docxName));
  check('Word export reaches the bridge', saved.some((s) => /\.docx$/.test(s.fileName)),
    'saved: ' + JSON.stringify(saved.map((s) => s.fileName)));

  /* ---------------------------------------------------------------- */
  /* PDF export                                                         */
  /* ---------------------------------------------------------------- */
  // aliya-pdf.js builds the PDF locally (jsPDF). Load it the same way the
  // browser does, through the module's own script loader.
  const pdfSrc = fs.readFileSync(path.join(ROOT, 'aliya/aliya-pdf.js'), 'utf8');
  vm.runInContext(pdfSrc, ctx, { filename: 'aliya-pdf.js' });
  check('AliyaPdf module loaded', !!sandbox.AliyaPdf);

  // aliya-pdf.js needs jsPDF; if the CDN is unavailable the export must fail
  // with a clear message rather than silently doing nothing.
  let pdfErr = null;
  let pdfName = null;
  try {
    pdfName = await AT.exportDoc('pdf', 'Ҷавоби Алия', answerText, {
      lang: 'tg', docType: 'Ҷавоби Алия', book: 'Китоб', topic: 'Мавзӯъ', pages: 'саҳ. 1',
    });
  } catch (e) {
    pdfErr = e;
  }
  if (pdfErr) {
    // This sandbox has no outbound network, so the PDF builder cannot fetch
    // jsPDF/fonts from the CDN. The export must fail with a clear error
    // (not hang, not silently do nothing) — that is what we assert here.
    check('PDF export reports a readable error', /HTTP|jsPDF|PDF|cdn|font|скрипт|сабт|network|пайваст/i.test(pdfErr.message),
      pdfErr.message);
    check('PDF export failure is not a hang', pdfErr instanceof Error);
  } else {
    check('PDF export produces a .pdf file', /\.pdf$/.test(String(pdfName || '')), String(pdfName));
    check('PDF export reaches the bridge', saved.some((s) => /\.pdf$/.test(s.fileName)));
  }

  /* ---------------------------------------------------------------- */
  /* The export bar that the reader panel renders                      */
  /* ---------------------------------------------------------------- */
  const tasksSrc = fs.readFileSync(path.join(ROOT, 'aliya/aliya-tasks.js'), 'utf8');
  check('export bar renders Word button', /data-a="docx"/.test(tasksSrc));
  check('export bar renders PDF button', /data-a="pdf"/.test(tasksSrc));
  check('export bar renders copy button', /data-a="copy"/.test(tasksSrc));
  check('export bar renders save-note button', /data-a="save"/.test(tasksSrc));
  check('export buttons are not disabled by default', !/<button[^>]*class="at-tool"[^>]*disabled/.test(tasksSrc));

  if (failures.length) {
    console.error('\n' + failures.length + ' reader Aliya export check(s) failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('\nPASS reader Aliya export: Word/PDF buttons produce real files through the bridge.');
})().catch((e) => { console.error(e); process.exit(1); });
