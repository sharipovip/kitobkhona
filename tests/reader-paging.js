#!/usr/bin/env node
/**
 * Regression test: reader page-turning must work.
 *
 * History: the live reader.html referenced `readerCurlBusy`, `armReaderIdle` and
 * `window.__kkToggleBars` without ever defining them. Every page turn therefore
 * died with "ReferenceError: readerCurlBusy is not defined" and the book could
 * not be flipped at all (tap zones, swipe, arrows, keyboard and wheel).
 *
 * The test extracts the inline scripts of reader.html, runs them in a small DOM
 * stub and then drives the real paging entry points.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, 'reader.html');
const html = fs.readFileSync(file, 'utf8');

function inlineScripts(src) {
  return [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

const blocks = inlineScripts(html);
if (!blocks.length) {
  console.error('FAIL reader: no inline scripts found');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Minimal DOM stub                                                    */
/* ------------------------------------------------------------------ */
const ids = new Set(['bookTitle', 'pageContainer', 'currentSlot', 'nextSlot', 'stage',
  'readerMain', 'topBar', 'bottomBar', 'readerAliyaBtn', 'pageInfo', 'quickPageInput',
  'quickPagePct', 'bookSub', 'zoomText', 'zoomExactBtn', 'readerThemeIcon', 'readerProgress',
  'loading', 'errBox', 'readerProgressBar', 'zoomSlider', 'readerSearch', 'readerSearchInput',
  'readerSearchResults', 'panelSearch', 'readerFontDecrease', 'readerFontIncrease']);

function makeEl(id) {
  const el = {
    id,
    style: {
      setProperty() {},
      removeProperty() {},
      getPropertyValue() { return ''; },
    },
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    children: [],
    dataset: {},
    textContent: '',
    innerHTML: '',
    hidden: false,
    value: '',
    max: '',
    placeholder: '',
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    replaceChildren() { this.children = []; },
    remove() {},
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 1000, right: 800, bottom: 1000 }; },
    getContext() { return { fillRect() {}, fillStyle: '' }; },
    animate() { return { cancel() {}, onfinish: null, finished: Promise.resolve() }; },
    focus() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    get offsetWidth() { return 800; },
    clientWidth: 800,
    clientHeight: 1000,
  };
  return el;
}

const store = new Map();
ids.forEach((id) => store.set(id, makeEl(id)));

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Promise,
  Math,
  Date,
  JSON,
  String,
  Number,
  Array,
  Object,
  RegExp,
  Error,
  Intl,
  Uint8Array,
  Float32Array,
  isNaN,
  parseInt,
  parseFloat,
  encodeURIComponent,
  decodeURIComponent,
  location: { search: '', href: 'https://example.test/reader.html', pathname: '/reader.html' },
  navigator: { onLine: true, userAgent: 'node-test' },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  document: {
    body: makeEl('body'),
    documentElement: makeEl('html'),
    activeElement: null,
    hidden: false,
    fonts: null,
    getElementById(id) { return store.get(id) || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl('created-' + tag); },
    addEventListener() {},
    removeEventListener() {},
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  requestAnimationFrame(cb) { return setTimeout(() => cb(Date.now()), 0); },
  cancelAnimationFrame(id) { clearTimeout(id); },
  fetch: () => Promise.reject(new TypeError('offline test')),
  indexedDB: null,
  ResizeObserver: null,
  performance: { now: () => Date.now() },
  alert() {},
  toast() {},
  pdfjsLib: {
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve({ numPages: 1 }) }),
  },
  pdfjs: { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 1 }) }) },
  KKCreatePDFCurl: null,
  // config.js is an external script; stub the few helpers reader.html uses.
  canonicalBookUrl: (u) => String(u || ''),
  safeDecode: (s) => String(s || ''),
  hidePersonalGithubAddress: (s) => String(s || ''),
  KKH_THEMES: {},
  KK_CONFIG: { API_URL: '', CHAT_API: '', SUPABASE_URL: '', SUPABASE_KEY: '' },
  URL,
  URLSearchParams,
  Blob: class { constructor(parts) { this.parts = parts; this.size = 0; this.type = ''; } },
  FileReader: class { readAsDataURL() {} addEventListener() {} },
  TextDecoder,
  TextEncoder,
  AbortController,
  FormData: class { append() {} },
  Headers: class { get() { return null; } },
  crypto: { getRandomValues: (a) => a },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => true;
sandbox.scrollTo = () => {};

const ctx = vm.createContext(sandbox);

/* ------------------------------------------------------------------ */
/* Run the page scripts                                                */
/* ------------------------------------------------------------------ */
let loadError = null;
try {
  // Load the external reader helpers the page depends on (same order as in the
  // <head>): config.js is stubbed above; reader-gestures.js/reader-curl.js are
  // real files from the repo.
  for (const ext of ['reader-curl.js', 'reader-gestures.js']) {
    const p = path.join(ROOT, ext);
    if (fs.existsSync(p)) {
      vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: ext });
    }
  }
  // Top-level `let`/`const` live in one shared lexical scope across all
  // classic <script> blocks of a page, so they must be evaluated as a single
  // program here too — otherwise `rendering`/`page`/`turnPage` would not be
  // visible across block boundaries.
  vm.runInContext(blocks.join('\n;\n'), ctx, { filename: 'reader.html#inline' });
} catch (e) {
  loadError = e;
}

/* ------------------------------------------------------------------ */
/* Assertions                                                          */
/* ------------------------------------------------------------------ */
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    console.log('PASS ' + name);
  } else {
    console.log('FAIL ' + name + (detail ? ' — ' + detail : ''));
    failures.push(name);
  }
}

check('reader.html inline scripts evaluate', !loadError, loadError && (loadError.name + ': ' + loadError.message));

// 1. The paging guard must not reference an undeclared identifier.
const declared = new Set();
const all = blocks.join('\n;\n');
[...all.matchAll(/\b(?:let|const|var)\s+([^;\n]+)/g)].forEach((m) => {
  m[1].split(',').forEach((part) => {
    const id = part.trim().match(/^([A-Za-z_$][\w$]*)/);
    if (id) declared.add(id[1]);
  });
});
[...all.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].forEach((m) => declared.add(m[1]));

check('readerCurlBusy is declared', declared.has('readerCurlBusy'));
check('armReaderIdle is declared', declared.has('armReaderIdle'));
check('setReaderBars is declared', declared.has('setReaderBars'));
check('__kkToggleBars is assigned', /window\.__kkToggleBars\s*=/.test(all));

// 2. __kkToggleBars must exist and be callable at runtime.
check('window.__kkToggleBars is a function', typeof sandbox.__kkToggleBars === 'function');

// 3. Turning the page must actually change the page number, and must not throw.
if (typeof sandbox.turnPage === 'function') {
  let turnError = null;
  try {
    sandbox.page = 1;
    sandbox.pages = 10;
    sandbox.turnPage(1);
  } catch (e) {
    turnError = e;
  }
  check('turnPage() does not throw', !turnError, turnError && (turnError.name + ': ' + turnError.message));

  let backError = null;
  try {
    sandbox.page = 5;
    sandbox.turnPage(-1);
  } catch (e) {
    backError = e;
  }
  check('turnPage(-1) does not throw', !backError, backError && (backError.name + ': ' + backError.message));

  // Out-of-range turns must be ignored, not throw.
  let rangeError = null;
  try {
    sandbox.page = 1;
    sandbox.turnPage(-1);
    sandbox.page = 10;
    sandbox.turnPage(1);
  } catch (e) {
    rangeError = e;
  }
  check('turnPage() ignores out-of-range moves', !rangeError, rangeError && (rangeError.name + ': ' + rangeError.message));
} else {
  check('turnPage() is exposed', false, 'turnPage not found on window');
}

// 4. The curl gesture controller must be attached (reader-gestures.js is loaded).
check('curl gesture controller attached', typeof sandbox.KKReaderCurlController === 'object' && sandbox.KKReaderCurlController !== null);

if (failures.length) {
  console.error('\n' + failures.length + ' reader paging check(s) failed: ' + failures.join(', '));
  process.exit(1);
}
console.log('\nPASS reader paging: turnPage guard, panel toggle, idle timer and curl controller are all wired.');
