#!/usr/bin/env node
/**
 * Runtime test: the admin "Управление кэшем" command must actually work.
 *
 *   node tests/cache-control-runtime.js
 *
 * History of the bug
 * ------------------
 * The admin panel could publish a cache-control command, but on the devices
 * it did nothing:
 *   • checkRemoteCacheControl() was defined and never called;
 *   • `const clearPdf = false` was hard-coded, so the "Очистить только PDF"
 *     and "Полная очистка" modes never erased the cached PDF books;
 *   • a network failure returned silently, so the user never learned that a
 *     new version was waiting;
 *   • there was no manual way out — no "Обновить" button on the main page.
 *
 * The test loads the real config.js in a sandbox and drives the command:
 * app / pdf / both, the automatic check on startup, and the manual button.
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
/* Sandbox                                                            */
/* ------------------------------------------------------------------ */
function makeSandbox(opts) {
  const o = opts || {};
  const state = {
    // what the server returns for GET /api/cache-control
    cfg: o.cfg || { app_version: 1, pdf_version: 1, mode: 'app', message: '' },
    fetched: 0,
    acked: [],
    cleared: [],
    deletedCaches: [],
    reloaded: false,
    updated: false,
    bannerShown: false,
    bannerButton: null,
    topButtonShown: false,
    topButtonHandler: null,
    localStorage: {},
    sessionStorage: {},
    caches: {
      'kitobkhona-v1-app': { kind: 'app' },
      'kitobkhona-pdf-cache-v1': { kind: 'pdf' },
    },
  };

  const el = (id) => ({
    id, style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    textContent: '', innerHTML: '', value: '', disabled: false, hidden: false,
    children: [], appendChild(c) { this.children.push(c); return c; }, remove() {},
    setAttribute() {}, getAttribute: () => null, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    onclick: null,
  });

  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Math, Date, JSON, String, Number, Array, Object, RegExp, Error, Intl,
    Uint8Array, ArrayBuffer, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, AbortController,
    location: { href: 'https://x.test/', pathname: '/', search: '', reload() { state.reloaded = true; } },
    navigator: { onLine: o.online !== false, userAgent: 'node' },
    document: {
      body: el('body'), documentElement: el('html'), head: el('head'),
      readyState: 'complete', hidden: false, activeElement: null,
      getElementById: (id) => {
        if (id === 'kkUpdateBtn') {
          const b = el('kkUpdateBtn');
          Object.defineProperty(b, 'style', {
            get() { return { _d: {}, set display(v) { state.topButtonShown = v !== 'none'; this._d.display = v; }, get display() { return this._d.display; } }; },
          });
          return b;
        }
        if (id === 'kk-update-banner') return { remove() {} };
        return null;
      },
      querySelector: () => null, querySelectorAll: () => [],
      createElement: (t) => el('c-' + t),
      addEventListener() {}, removeEventListener() {},
    },
    localStorage: {
      // The acknowledgement to the server needs a signed-in user.
      _init() { state.localStorage.kk_token = state.localStorage.kk_token || 'test.token.value'; },
      get length() { return Object.keys(state.localStorage).length; },
      key(i) { return Object.keys(state.localStorage)[i] ?? null; },
      getItem(k) { this._init(); return state.localStorage[k] ?? null; },
      setItem(k, v) { state.localStorage[k] = String(v); },
      removeItem(k) { delete state.localStorage[k]; },
    },
    sessionStorage: {
      get length() { return Object.keys(state.sessionStorage).length; },
      key(i) { return Object.keys(state.sessionStorage)[i] ?? null; },
      getItem(k) { return state.sessionStorage[k] ?? null; },
      setItem(k, v) { state.sessionStorage[k] = String(v); },
      removeItem(k) { delete state.sessionStorage[k]; },
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    caches: {
      async keys() { return Object.keys(state.caches); },
      async delete(name) { state.deletedCaches.push(name); delete state.caches[name]; return true; },
      async open() { return { put() {}, match() { return null; }, delete() {} }; },
    },
    navigator_serviceWorkerHolder: null,
    fetch: async (url, init) => {
      const u = String(url);
      if (u.includes('/api/cache-control/ack')) {
        state.acked.push(JSON.parse(init.body || '{}'));
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (u.includes('/api/cache-control')) {
        state.fetched++;
        if (o.failFetch) return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(state.cfg)) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.navigator.serviceWorker = {
    getRegistration: async () => ({ update: async () => { state.updated = true; } }),
  };
  // Record the banner / button behaviour.
  sandbox.__state = state;
  return { sandbox, state };
}

/* The real config.js is huge and browser-only; we load only the cache-control
   part of it, which is what this test is about. The slice is taken by
   markers so the test keeps working as the file grows. */
function extractCacheControl(src) {
  const start = src.indexOf('async function clearApplicationCaches(');
  const endMarker = "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installContentProtection();autoCheckCacheControl()},{once:true});else{installContentProtection();autoCheckCacheControl();}";
  const end = src.indexOf(endMarker);
  if (start < 0 || end < 0) return null;
  return src.slice(start, end + endMarker.length);
}

const configSrc = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
const slice = extractCacheControl(configSrc);
check('the cache-control block is present in config.js', !!slice);

(async () => {
  /* ---------------------------------------------------------------- */
  /* 1. The command "app" clears the app cache and reloads             */
  /* ---------------------------------------------------------------- */
  {
    const { sandbox, state } = makeSandbox({
      cfg: { app_version: 5, pdf_version: 1, mode: 'app', message: 'Навсозӣ' },
    });
    const ctx = vm.createContext(sandbox);
    vm.runInContext(`
      globalThis.KITOB_PDF_CACHE='kitobkhona-pdf-cache-v1';
      globalThis.KITOB_CONFIG={NEON_API_BASE:'https://api.test'};
      globalThis.beginActionProgress=function(){return{set(){},done(){}}};
      globalThis.kkWithTimeout=(p)=>Promise.resolve(p).catch(()=>{});
      globalThis.installContentProtection=function(){};
      ${slice}
    `, ctx, { filename: 'cache-control-slice.js' });

    const res = await vm.runInContext('runCacheControlNow(true)', ctx);
    // The reload and the acknowledgement happen right after the command
    // resolves — give them a moment.
    await new Promise((r) => setTimeout(r, 900));
    check('the "app" command runs and reports success', res && res.ok === true, JSON.stringify(res));
    check('the app cache is deleted', state.deletedCaches.includes('kitobkhona-v1-app'),
      JSON.stringify(state.deletedCaches));
    check('the PDF cache is KEPT in the "app" mode', !state.deletedCaches.includes('kitobkhona-pdf-cache-v1'),
      JSON.stringify(state.deletedCaches));
    check('the page reloads after the command', state.reloaded === true);
    check('the Service Worker is asked to update', state.updated === true);
    check('the device acknowledges the command', state.acked.length === 1, JSON.stringify(state.acked));
  }

  /* ---------------------------------------------------------------- */
  /* 2. The command "pdf" clears the PDF cache only                     */
  /* ---------------------------------------------------------------- */
  {
    const { sandbox, state } = makeSandbox({
      cfg: { app_version: 1, pdf_version: 7, mode: 'pdf', message: '' },
    });
    const ctx = vm.createContext(sandbox);
    vm.runInContext(`
      globalThis.KITOB_PDF_CACHE='kitobkhona-pdf-cache-v1';
      globalThis.KITOB_CONFIG={NEON_API_BASE:'https://api.test'};
      globalThis.beginActionProgress=function(){return{set(){},done(){}}};
      globalThis.kkWithTimeout=(p)=>Promise.resolve(p).catch(()=>{});
      globalThis.installContentProtection=function(){};
      ${slice}
    `, ctx, { filename: 'cache-control-slice.js' });

    const res = await vm.runInContext('runCacheControlNow(true)', ctx);
    check('the "pdf" command runs and reports success', res && res.ok === true, JSON.stringify(res));
    check('the PDF cache is deleted', state.deletedCaches.includes('kitobkhona-pdf-cache-v1'),
      JSON.stringify(state.deletedCaches));
    check('the app cache is KEPT in the "pdf" mode', !state.deletedCaches.includes('kitobkhona-v1-app'),
      JSON.stringify(state.deletedCaches));
  }

  /* ---------------------------------------------------------------- */
  /* 3. The command "both" clears everything                            */
  /* ---------------------------------------------------------------- */
  {
    const { sandbox, state } = makeSandbox({
      cfg: { app_version: 9, pdf_version: 4, mode: 'both', message: '' },
    });
    const ctx = vm.createContext(sandbox);
    vm.runInContext(`
      globalThis.KITOB_PDF_CACHE='kitobkhona-pdf-cache-v1';
      globalThis.KITOB_CONFIG={NEON_API_BASE:'https://api.test'};
      globalThis.beginActionProgress=function(){return{set(){},done(){}}};
      globalThis.kkWithTimeout=(p)=>Promise.resolve(p).catch(()=>{});
      globalThis.installContentProtection=function(){};
      ${slice}
    `, ctx, { filename: 'cache-control-slice.js' });

    const res = await vm.runInContext('runCacheControlNow(true)', ctx);
    check('the "both" command runs and reports success', res && res.ok === true, JSON.stringify(res));
    check('the "both" mode clears the app cache', state.deletedCaches.includes('kitobkhona-v1-app'),
      JSON.stringify(state.deletedCaches));
    check('the "both" mode clears the PDF cache', state.deletedCaches.includes('kitobkhona-pdf-cache-v1'),
      JSON.stringify(state.deletedCaches));
  }

  /* ---------------------------------------------------------------- */
  /* 4. Nothing to do -> no reload, no banner                           */
  /* ---------------------------------------------------------------- */
  {
    const { sandbox, state } = makeSandbox({
      cfg: { app_version: 1, pdf_version: 1, mode: 'app', message: '' },
    });
    const ctx = vm.createContext(sandbox);
    vm.runInContext(`
      globalThis.KITOB_PDF_CACHE='kitobkhona-pdf-cache-v1';
      globalThis.KITOB_CONFIG={NEON_API_BASE:'https://api.test'};
      globalThis.beginActionProgress=function(){return{set(){},done(){}}};
      globalThis.kkWithTimeout=(p)=>Promise.resolve(p).catch(()=>{});
      globalThis.installContentProtection=function(){};
      ${slice}
    `, ctx, { filename: 'cache-control-slice.js' });

    const res = await vm.runInContext('runCacheControlNow(true)', ctx);
    check('an up-to-date device does nothing', res && res.reason === 'up-to-date', JSON.stringify(res));
    check('an up-to-date device does not reload', state.reloaded === false);
    check('an up-to-date device deletes no cache', state.deletedCaches.length === 0,
      JSON.stringify(state.deletedCaches));
  }

  /* ---------------------------------------------------------------- */
  /* 5. A network failure must offer the manual "Обновить" button      */
  /* ---------------------------------------------------------------- */
  {
    const { sandbox, state } = makeSandbox({ failFetch: true });
    const ctx = vm.createContext(sandbox);
    vm.runInContext(`
      globalThis.KITOB_PDF_CACHE='kitobkhona-pdf-cache-v1';
      globalThis.KITOB_CONFIG={NEON_API_BASE:'https://api.test'};
      globalThis.beginActionProgress=function(){return{set(){},done(){}}};
      globalThis.kkWithTimeout=(p)=>Promise.resolve(p).catch(()=>{});
      globalThis.installContentProtection=function(){};
      ${slice}
    `, ctx, { filename: 'cache-control-slice.js' });

    const res = await vm.runInContext('runCacheControlNow(true)', ctx);
    check('a network failure is reported, not swallowed', res && res.ok === false, JSON.stringify(res));
    check('a network failure shows the "Обновить" button on the page',
      state.topButtonShown === true, 'top button shown: ' + state.topButtonShown);
    check('a network failure does not reload the page', state.reloaded === false);
  }

  /* ---------------------------------------------------------------- */
  /* 6. The automatic check runs on startup                            */
  /* ---------------------------------------------------------------- */
  {
    const { sandbox, state } = makeSandbox({
      cfg: { app_version: 3, pdf_version: 1, mode: 'app', message: '' },
    });
    const ctx = vm.createContext(sandbox);
    vm.runInContext(`
      globalThis.KITOB_PDF_CACHE='kitobkhona-pdf-cache-v1';
      globalThis.KITOB_CONFIG={NEON_API_BASE:'https://api.test'};
      globalThis.beginActionProgress=function(){return{set(){},done(){}}};
      globalThis.kkWithTimeout=(p)=>Promise.resolve(p).catch(()=>{});
      globalThis.installContentProtection=function(){};
      ${slice}
    `, ctx, { filename: 'cache-control-slice.js' });

    await vm.runInContext('autoCheckCacheControl()', ctx);
    await new Promise((r) => setTimeout(r, 1600));
    check('the cache-control command is checked automatically on startup', state.fetched > 0,
      'fetched: ' + state.fetched);
    check('the automatic check applies the command', state.deletedCaches.includes('kitobkhona-v1-app'),
      JSON.stringify(state.deletedCaches));
  }

  /* ---------------------------------------------------------------- */
  /* 7. The book download must also ask where to save                   */
  /* ---------------------------------------------------------------- */
  {
    // The user compares the Aliya save with the working book download:
    // both must open the "choose where to save" dialog.
    const src = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
    const fnStart = src.indexOf('async function downloadFile(');
    const fnEnd = src.indexOf('\n}', src.indexOf("catch(e){if(toastEl){toastEl.textContent='Хатогӣ: '", fnStart));
    const body = src.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 4000);
    check('the book download opens the Save-As picker', /showSaveFilePicker/.test(body),
      'downloadFile does not ask where to save');
    check('the book download passes the dotted extension required by File System Access API',
      /\[\s*cleanMime\s*\]\s*:\s*\[\s*'\.'\s*\+\s*ext\s*\]/.test(body), body.slice(0, 800));
    check('the book download falls back to a plain download',
      /a\.download=fileName/.test(body), 'downloadFile has no fallback');
    check('the book download names the Downloads folder when it falls back',
      /«Загрузки»/.test(body), 'downloadFile does not say where the file went');
    check('a cancelled book download is not reported as saved',
      /AbortError/.test(body) && /бекор шуд/.test(body),
      'downloadFile does not handle a cancelled picker');
  }

  /* ---------------------------------------------------------------- */
  /* 8. The main page must offer a manual "Обновить" button           */
  /* ---------------------------------------------------------------- */
  {
    const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    check('the main page has the "Обновить" button', /id="kkUpdateBtn"/.test(indexHtml));
    const readerHtml = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
    check('the reader has the "Обновить" button', /id="kkUpdateBtn"/.test(readerHtml));
    check('the "Обновить" button is wired to the cache-control runner',
      /runCacheControlNow|showUpdateBanner/.test(configSrc),
      'config.js does not drive the update button');
    const adminHtml = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    check('the admin panel sends the mode with the command',
      /api\/admin\/cache-control','POST',\{mode,message/.test(adminHtml));
    check('the admin panel shows the active mode',
      /Действующая команда/.test(adminHtml));
  }

  if (failures.length) {
    console.error('\n' + failures.length + ' cache-control check(s) failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('\nPASS cache control: the admin command clears the caches on every device.');
})().catch((e) => { console.error(e); process.exit(1); });
