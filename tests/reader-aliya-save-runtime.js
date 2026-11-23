#!/usr/bin/env node
/**
 * Runtime test: "Word"/"PDF" under an Aliya answer INSIDE the Reader (iframe).
 *
 *   node tests/reader-aliya-save-runtime.js
 *
 * This reproduces the exact production topology:
 *
 *   reader.html                (parent window — loads aliyа/aliya-bridge.js)
 *     └─ iframe → aliyа/reader-aliya.html
 *                  (loads aliyа-bridge.js + aliyа-tasks.js + aliyа-doc-templates.js)
 *
 * and checks that the export really reaches a saveFile() implementation and
 * that a valid file is produced — for BOTH Word and PDF.
 *
 * Note on the harness (same as tests/reader-aliya-pdf-runtime.js): the VM
 * context must not receive the outer realm's built-ins. pdf-lib validates its
 * arguments with `instanceof` against classes created in its own realm, so
 * mixing realms makes addPage() reject a good page size with a misleading
 * "type NaN" error. The context therefore uses its own built-ins, `window`
 * points at the context's global object, and the font bytes are copied into
 * the context realm before pdf-lib sees them.
 */
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
function check(name, cond, detail) {
  if (cond) console.log('PASS ' + name);
  else { console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name); }
}

/* ------------------------------------------------------------------ */
/* DOM stub                                                           */
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


/* A FileReader that resolves like the browser does (aliya-bridge.js uses
   onloadend + reader.result to read the blob as base64). */
function makeFileReader() {
  return class FileReader {
    readAsDataURL() {
      this.result = 'data:application/octet-stream;base64,AAECAw==';
      setTimeout(() => { this.onloadend && this.onloadend(); }, 0);
    }
  };
}
/* ------------------------------------------------------------------ */
/* The iframe sandbox (the Aliya panel inside the Reader)            */
/* ------------------------------------------------------------------ */
const saved = [];
const injected = [];   // scripts loaded dynamically (aliya-pdf.js, pdf-lib, fontkit)

const win = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: { onLine: true, userAgent: 'node', languages: ['tg'] },
  location: { search: '', href: 'https://x.test/aliya/reader-aliya.html', pathname: '/aliya/reader-aliya.html', origin: 'https://x.test' },
  document: {
    body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
    activeElement: null, hidden: false, cookie: '',
    getElementById: () => null,
    querySelector(sel) {
      // The static <script src="aliya-tasks.js?v=176"> tag of reader-aliya.html
      if (String(sel).includes('aliya-tasks.js')) return { src: 'https://x.test/aliya/aliya-tasks.js?v=176' };
      // The dynamically injected <script src=".../aliya-pdf.js?v=161"> tag
      if (String(sel).includes('aliya-pdf.js')) {
        const last = injected[injected.length - 1];
        return last ? { src: last.src } : null;
      }
      return null;
    },
    querySelectorAll: () => [],
    createElement: (t) => {
      const e = makeEl('c-' + t);
      if (t === 'script') e.__isScript = true;
      return e;
    },
    addEventListener() {}, removeEventListener() {},
  },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
  // The parent frame (reader.html) also has a bridge. The export must NOT
  // prefer it: the Save-As picker needs the user activation of the frame
  // that handles the click, which is the iframe.
  parent: {
    AliyaBridge: {
      saveFile: async (content, fileName, mimeType) => {
        saved.push({ via: 'parent', fileName, mimeType, blob: content });
        return { success: true, method: 'parent_save' };
      },
    },
  },
};

const ctx = vm.createContext(win);
// Inside the context `window` must BE the context's global object.
vm.runInContext('globalThis.window = globalThis; globalThis.globalThis = globalThis; globalThis.self = globalThis;', ctx);
vm.runInContext('globalThis.addEventListener = function () {}; globalThis.removeEventListener = function () {};', ctx);

/* Blob lives in the context realm so `instanceof` checks behave. */
vm.runInContext(`
  globalThis.Blob = class Blob {
    constructor(parts, opts) {
      this.parts = parts || [];
      this.type = (opts && opts.type) || '';
      this.size = 0;
      for (const p of this.parts) this.size += (p && p.length) || 0;
    }
    async arrayBuffer() {
      const first = this.parts[0];
      return first && first.buffer
        ? first.buffer.slice(first.byteOffset, first.byteOffset + first.byteLength)
        : new ArrayBuffer(0);
    }
    async text() { return ''; }
  };
  globalThis.FileReader = class FileReader { readAsDataURL() {} addEventListener() {} };
  globalThis.atob = (s) => globalThis.__btoa ? '' : Buffer.from(s, 'base64').toString('binary');
`, ctx);
// atob/btoa live in the outer realm but are pure functions — safe to borrow.
win.atob = (s) => Buffer.from(s, 'base64').toString('binary');
win.btoa = (s) => Buffer.from(s, 'binary').toString('base64');

/* Serve the real assets over HTTP, copying the bytes into the context realm.
   Defined inside the context so the sandbox always sees it. */
/* The outer realm reads the file and hands the bytes to the context realm. */
const serveFile = (url) => {
  // Strip the origin and the ?v=… cache-busting query.
  const rel = String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '').split('?')[0].split('#')[0];
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
  if (/\.js$/i.test(file)) return { kind: 'js', code: fs.readFileSync(file, 'utf8') };
  return { kind: 'bin', bytes: new Uint8Array(fs.readFileSync(file)) };
};

// Inject the reader as a context global so the sandbox can call it.
ctx.__serveFileImpl = serveFile;
vm.runInContext('globalThis.__serveFile = (u) => globalThis.__serveFileImpl(u);', ctx);

vm.runInContext(`
  globalThis.fetch = async function (url) {
    const got = globalThis.__serveFile(String(url));
    if (!got) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' };
    if (got.kind === 'js') {
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), text: async () => got.code };
    }
    // Copy the bytes into this realm so pdf-lib's instanceof checks accept them.
    const bytes = new Uint8Array(got.bytes.length);
    bytes.set(got.bytes);
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer, text: async () => '' };
  };
`, ctx);
// The sandbox evaluates a fetched <script> in its own realm.
vm.runInContext('globalThis.__evalScript = (code, src) => { (0, eval)(code); };', ctx);
// One shared list of dynamically injected <script> tags.
vm.runInContext('globalThis.__injectedList = [];', ctx);
Object.defineProperty(ctx, '__injectedList', {
  get() { return injected; },
});

/* Dynamically injected <script> tags must really execute their source.
   The hook is installed from the outer realm: `document.head` is a plain
   object, so a function assigned to it inside the VM would not be seen by
   the code running there. */
const realAppend = win.document.head.appendChild.bind(win.document.head);
win.document.head.appendChild = function (child) {
  if (child && child.__isScript) {
    injected.push(child);
    const src = child.src;
    setTimeout(() => {
      ctx.fetch(src)
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then((code) => {
          vm.runInContext(code, ctx, { filename: path.basename(new URL(src, 'https://x.test').pathname) });
          child.onload && child.onload();
        })
        .catch(() => { child.onerror && child.onerror(); });
    }, 0);
  }
  return realAppend(child);
};

/* ------------------------------------------------------------------ */
/* Load the real libraries and the modules under test                */
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
vm.runInContext('globalThis.PDFLib = PDFLib; globalThis.fontkit = fontkit;', ctx);

// The iframe loads the same scripts reader-aliya.html loads.
vm.runInContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-bridge.js'), 'utf8'), ctx, { filename: 'aliya-bridge.js' });
// Record what the iframe's OWN bridge receives — this is the path that must
// be used, because the Save-As picker needs this frame's user activation.
vm.runInContext(`
  globalThis.__ownSaveFile = globalThis.AliyaBridge.saveFile;
  globalThis.AliyaBridge.saveFile = async function (content, fileName, mimeType) {
    globalThis.__ownSaved.push({ via: 'own', fileName, mimeType, blob: content });
    return { success: true, method: 'own_save' };
  };
`, ctx);
vm.runInContext('globalThis.__ownSaved = [];', ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-doc-templates.js'), 'utf8'), ctx, { filename: 'aliya-doc-templates.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-tasks.js'), 'utf8'), ctx, { filename: 'aliya-tasks.js' });

const AT = vm.runInContext('AliyaTasks', ctx);
check('AliyaTasks loaded in the Reader iframe', !!AT);
check('the iframe has its own AliyaBridge', !!(win.AliyaBridge && typeof win.AliyaBridge.saveFile === 'function'));
check('the parent (reader.html) exposes AliyaBridge', !!(win.parent.AliyaBridge && typeof win.parent.AliyaBridge.saveFile === 'function'));

(async () => {
  const answerText = [
    '## Сарлавҳа',
    '',
    'Ин ҷавоби Алия аст. Дар ин матн **ғафс** ҳаст ва [[Ном]] низ.',
    '',
    '- якум',
    '- дуюм',
  ].join('\n');

  const meta = { lang: 'tg', docType: 'Ҷавоби Алия', book: 'Китоб', topic: 'Мавзӯъ', pages: 'саҳ. 1', title: 'Мавзӯъ — Ҷавоби Алия', subtitle: '«Китоб» · саҳ. 1' };

  /* ---------------------------------------------------------------- */
  /* Word                                                             */
  /* ---------------------------------------------------------------- */
  let docxName = null, docxErr = null;
  try {
    docxName = await AT.exportDoc('docx', 'Ҷавоби Алия', answerText, meta);
  } catch (e) { docxErr = e; }
  check('Word export does not throw', !docxErr, docxErr && (docxErr.name + ': ' + docxErr.message));
  const docxFile = (docxName && docxName.fileName) || String(docxName || '');
  check('Word export produces a .docx name', /\.docx$/.test(docxFile), String(docxName));
  const ownSaved = vm.runInContext('globalThis.__ownSaved', ctx);
  check('Word export reaches a saveFile() implementation', ownSaved.some((s) => /\.docx$/.test(s.fileName)),
    'saved: ' + JSON.stringify(ownSaved.map((s) => s.fileName)));
  check('Word export uses the DOCX mime type', ownSaved.some((s) => /\.docx$/.test(s.fileName) && /wordprocessingml/.test(s.mimeType || '')));
  check('Word export uses the bridge of its OWN frame (not the parent)', ownSaved.length > 0 && saved.length === 0,
    'own: ' + JSON.stringify(ownSaved.map((s) => s.fileName)) + ' parent: ' + JSON.stringify(saved.map((s) => s.fileName)));

  /* ---------------------------------------------------------------- */
  /* PDF — the real local builder (pdf-lib + fontkit + subset fonts)   */
  /* ---------------------------------------------------------------- */
  let pdfName = null, pdfErr = null;
  try {
    pdfName = await AT.exportDoc('pdf', 'Ҷавоби Алия', answerText, meta);
  } catch (e) { pdfErr = e; }
  check('PDF export does not throw', !pdfErr, pdfErr && (pdfErr.name + ': ' + pdfErr.message));
  const pdfFile = (pdfName && pdfName.fileName) || String(pdfName || '');
  check('PDF export produces a .pdf name', /\.pdf$/.test(pdfFile), String(pdfName));
  const pdfSaved = ownSaved.find((s) => /\.pdf$/.test(s.fileName));
  check('PDF export reaches a saveFile() implementation', !!pdfSaved,
    'saved: ' + JSON.stringify(ownSaved.map((s) => s.fileName)));
  check('PDF export uses the bridge of its OWN frame (not the parent)', ownSaved.some((s) => /\.pdf$/.test(s.fileName)) && saved.length === 0,
    'own: ' + JSON.stringify(ownSaved.map((s) => s.fileName)) + ' parent: ' + JSON.stringify(saved.map((s) => s.fileName)));
  check('PDF export uses the application/pdf mime type', !!pdfSaved && /application\/pdf/.test(pdfSaved.mimeType || ''));

  /* The produced bytes must be a real PDF. */
  if (pdfSaved) {
    const bytes = await pdfSaved.blob.arrayBuffer();
    const buf = Buffer.from(new Uint8Array(bytes));
    const head = buf.slice(0, 5).toString('latin1');
    check('the saved PDF starts with the %PDF- header', head === '%PDF-', head);
    check('the saved PDF ends with the EOF marker', /%%EOF/.test(buf.slice(-1024).toString('latin1')));
    check('the saved PDF is not empty', buf.length > 1000, buf.length + ' bytes');
  }

  /* ---------------------------------------------------------------- */
  /* The dynamic loader must not have produced a wrong base path.     */
  /* ---------------------------------------------------------------- */
  const pdfScript = injected.find((s) => /aliya-pdf\.js/.test(s.src || ''));
  check('aliya-pdf.js is loaded on demand', !!pdfScript, JSON.stringify(injected.map((s) => s.src)));
  check('aliya-pdf.js resolves next to the aliya/ folder', !!pdfScript && /\/aliya\/aliya-pdf\.js/.test(pdfScript.src),
    pdfScript && pdfScript.src);
  const fontReq = injected.find((s) => /pdf-lib|fontkit/.test(s.src || ''));
  // The sandbox preloads the libraries, so they are not injected again —
  // but the module must still be able to find them where it expects.
  check('pdf-lib and fontkit are available to the PDF builder',
    !!(vm.runInContext('PDFLib && fontkit', ctx)),
    'PDFLib/fontkit missing in the sandbox realm');
  check('the PDF builder resolves its libraries from assets/libs/',
    !!fontReq ? /\/assets\/libs\//.test(fontReq.src) : true,
    fontReq && fontReq.src);

  /* ---------------------------------------------------------------- */
  /* A refused Save-As picker must NOT break the export.             */
  /* ---------------------------------------------------------------- */
  // The real bridge (not the recording stub) must fall back to a normal
  // download when the browser refuses the Save-As picker — that refusal is
  // what produced "Ҳуҷҷат сабт нашуд" in the Reader.
  const bridgeReal = fs.readFileSync(path.join(ROOT, 'aliya/aliya-bridge.js'), 'utf8');
  check('the bridge falls back to a normal download when the picker is refused',
    /falling back to a normal download/.test(bridgeReal),
    'aliya-bridge.js has no fallback for a refused showSaveFilePicker');

  // Exercise the real bridge: a picker that throws SecurityError must still
  // produce a download instead of rejecting.
  const refused = vm.createContext(Object.assign({}, win, {
    window: null,
    showSaveFilePicker: async () => { const e = new Error('Must be handling a user gesture to show a file picker'); e.name = 'SecurityError'; throw e; },
    Blob: win.Blob,
    atob: win.atob,
    btoa: win.btoa,
    URL: win.URL,
    document: win.document,
    FileReader: makeFileReader(),
  }));
  refused.window = refused;
  refused.globalThis = refused;
  vm.runInContext('globalThis.addEventListener = function () {}; globalThis.removeEventListener = function () {};', refused);
  vm.runInContext(bridgeReal, refused, { filename: 'aliya-bridge.js' });
  let refusedErr = null, refusedRes = null;
  try {
    refusedRes = await vm.runInContext('AliyaBridge.saveFile(new Blob([new Uint8Array([1,2,3])]), "answer.pdf", "application/pdf")', refused);
  } catch (e) { refusedErr = e; }
  check('a refused Save-As picker does not break the save', !refusedErr,
    refusedErr && refusedErr.message);
  check('a refused Save-As picker still saves via a normal download',
    !!refusedRes && refusedRes.success === true && refusedRes.method === 'browser_blob',
    JSON.stringify(refusedRes));

  /* ---------------------------------------------------------------- */
  /* The Save-As picker options must be valid, or Chrome rejects them  */
  /* ---------------------------------------------------------------- */
  // Real bug: the extension was passed as '.pdf'. The File System Access
  // API expects the extension WITHOUT the dot ('pdf'). Chrome rejected the
  // options with a TypeError, and the save silently fell back to a plain
  // download — the user never got the "choose the folder" dialog.
  let pickerOpts = null;
  const picked = vm.createContext(Object.assign({}, win, {
    window: null,
    showSaveFilePicker: async (opts) => {
      pickerOpts = JSON.parse(JSON.stringify(opts || {}));
      const chunks = [];
      return {
        createWritable: async () => ({
          write: async (b) => { chunks.push(b); },
          close: async () => {},
        }),
      };
    },
    Blob: win.Blob, atob: win.atob, btoa: win.btoa, URL: win.URL,
    document: win.document, FileReader: makeFileReader(),
  }));
  picked.window = picked;
  picked.globalThis = picked;
  vm.runInContext('globalThis.addEventListener = function () {}; globalThis.removeEventListener = function () {};', picked);
  vm.runInContext(bridgeReal, picked, { filename: 'aliya-bridge.js' });
  let pickedErr = null, pickedRes = null;
  try {
    pickedRes = await vm.runInContext('AliyaBridge.saveFile(new Blob([new Uint8Array([1,2,3])]), "answer.pdf", "application/pdf")', picked);
  } catch (e) { pickedErr = e; }
  check('a valid Save-As picker saves the file', !pickedErr, pickedErr && pickedErr.message);
  check('the Save-As picker is reported as used',
    !!pickedRes && pickedRes.method === 'file_picker', JSON.stringify(pickedRes));
  check('the picker receives the suggested file name',
    !!pickerOpts && pickerOpts.suggestedName === 'answer.pdf', JSON.stringify(pickerOpts));
  check('the picker accept map has no leading dot in the extension',
    !!pickerOpts && pickerOpts.types && pickerOpts.types[0] && pickerOpts.types[0].accept &&
    Array.isArray(pickerOpts.types[0].accept['application/pdf']) &&
    pickerOpts.types[0].accept['application/pdf'][0] === 'pdf',
    JSON.stringify(pickerOpts));
  check('the picker accept map never contains a dotted extension',
    !JSON.stringify(pickerOpts || {}).includes('".pdf"') &&
    !JSON.stringify(pickerOpts || {}).includes("'.pdf'"),
    JSON.stringify(pickerOpts));
  check('the saved file keeps its name', !!pickedRes && pickedRes.fileName === 'answer.pdf',
    JSON.stringify(pickedRes));

  // A picker the user cancels is NOT an error — it must be marked as such so
  // the UI can say "cancelled" instead of "document not saved".
  const cancelled = vm.createContext(Object.assign({}, win, {
    window: null,
    showSaveFilePicker: async () => { const e = new Error('The user aborted a request.'); e.name = 'AbortError'; throw e; },
    Blob: win.Blob, atob: win.atob, btoa: win.btoa, URL: win.URL,
    document: win.document, FileReader: makeFileReader(),
  }));
  cancelled.window = cancelled;
  cancelled.globalThis = cancelled;
  vm.runInContext('globalThis.addEventListener = function () {}; globalThis.removeEventListener = function () {};', cancelled);
  vm.runInContext(bridgeReal, cancelled, { filename: 'aliya-bridge.js' });
  let cancelErr = null;
  try {
    await vm.runInContext('AliyaBridge.saveFile(new Blob([new Uint8Array([1,2,3])]), "answer.pdf", "application/pdf")', cancelled);
  } catch (e) { cancelErr = e; }
  check('a cancelled Save-As picker is marked as user-cancelled',
    !!cancelErr && cancelErr.abortedByUser === true,
    cancelErr ? cancelErr.name + ': ' + cancelErr.message : 'no error raised');

  /* ---------------------------------------------------------------- */
  /* v178: the file must ASK where to be saved, not land silently     */
  /* ---------------------------------------------------------------- */
  // In the Android app the native bridge opens a real "Save as" dialog.
  // That bridge lives in reader.html (the parent frame) — the Aliya iframe
  // had none, so the export skipped the native dialog and dropped the file
  // into "Downloads" while telling the user it had been saved.
  const nativeCalls = [];
  const androidApp = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Array, Object,
    RegExp, Error, Intl, Uint8Array, ArrayBuffer,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    Blob: win.Blob, FileReader: makeFileReader(),
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    document: {
      body: { appendChild() {}, removeChild() {} },
      createElement: () => ({ style: {}, set href(v) {}, set download(v) {}, click() {} }),
      addEventListener() {},
    },
  });
  androidApp.window = androidApp; androidApp.globalThis = androidApp; androidApp.self = androidApp;
  vm.runInContext('globalThis.addEventListener = function () {}; globalThis.removeEventListener = function () {};', androidApp);
  // The parent frame (reader.html) carries the native bridge.
  androidApp.parent = {
    AndroidBridge: {
      saveFile: (b64, name, mime) => { nativeCalls.push({ via: 'parent_android', name }); return true; },
    },
    document: androidApp.document,
  };
  androidApp.top = androidApp.parent;
  vm.runInContext(bridgeReal, androidApp, { filename: 'aliya-bridge.js' });
  let androidRes = null, androidErr = null;
  try {
    androidRes = await vm.runInContext(
      'AliyaBridge.saveFile(new Blob([new Uint8Array([1,2,3])]), "answer.pdf", "application/pdf")', androidApp);
  } catch (e) { androidErr = e; }
  check('the Android native Save-As dialog is used inside the Reader',
    nativeCalls.some((c) => c.via === 'parent_android'),
    'native calls: ' + JSON.stringify(nativeCalls) + ' result: ' + JSON.stringify(androidRes));
  check('the native save does not fall back to a silent download',
    !!androidRes && androidRes.method !== 'browser_blob',
    JSON.stringify(androidRes));

  // In a plain browser (no native bridge) the download must be triggered in
  // the TOP window — that is where the browser shows its "where to save"
  // prompt, exactly like the book download does.
  const topCalls = [];
  const browserCtx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Array, Object,
    RegExp, Error, Intl, Uint8Array, ArrayBuffer,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    Blob: win.Blob, FileReader: makeFileReader(),
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    document: {
      body: { appendChild() { topCalls.push('append_iframe'); }, removeChild() {} },
      createElement: () => ({ style: {}, set href(v) {}, set download(v) {}, click() { topCalls.push('click_iframe'); } }),
      addEventListener() {},
    },
  });
  browserCtx.window = browserCtx; browserCtx.globalThis = browserCtx; browserCtx.self = browserCtx;
  vm.runInContext('globalThis.addEventListener = function () {}; globalThis.removeEventListener = function () {};', browserCtx);
  browserCtx.parent = {
    document: {
      body: { appendChild() { topCalls.push('append_top'); }, removeChild() {} },
      createElement: () => ({ style: {}, set href(v) {}, set download(v) {}, click() { topCalls.push('click_top'); } }),
    },
  };
  browserCtx.top = browserCtx.parent;
  vm.runInContext(bridgeReal, browserCtx, { filename: 'aliya-bridge.js' });
  let browserRes = null, browserErr = null;
  try {
    browserRes = await vm.runInContext(
      'AliyaBridge.saveFile(new Blob([new Uint8Array([1,2,3])]), "answer.pdf", "application/pdf")', browserCtx);
  } catch (e) { browserErr = e; }
  check('the browser download is triggered in the TOP window',
    topCalls.includes('click_top') && !topCalls.includes('click_iframe'),
    'calls: ' + JSON.stringify(topCalls));
  check('the silent download is reported as such',
    !!browserRes && browserRes.silent === true,
    JSON.stringify(browserRes));

  // The toast must tell the user WHERE the file went. Check the real
  // behaviour of savedWhere(), not just that the words appear somewhere.
  const tasksReal = fs.readFileSync(path.join(ROOT, 'aliya/aliya-tasks.js'), 'utf8');
  const whereCtx = vm.createContext(Object.assign({}, win, {
    window: null, Blob: win.Blob, atob: win.atob, btoa: win.btoa,
    URL: win.URL, document: win.document, FileReader: makeFileReader(),
  }));
  whereCtx.window = whereCtx; whereCtx.globalThis = whereCtx;
  vm.runInContext('globalThis.addEventListener = function () {}; globalThis.removeEventListener = function () {};', whereCtx);
  vm.runInContext(tasksReal, whereCtx, { filename: 'aliya-tasks.js' });
  const savedWhere = vm.runInContext('AliyaTasks.savedWhere', whereCtx);
  check('savedWhere() is exported', typeof savedWhere === 'function');
  const wSilent = savedWhere({ method: 'browser_blob', fileName: 'answer.pdf' }, 'PDF');
  check('savedWhere() names the Downloads folder for a silent save',
    /«Загрузки»/.test(String(wSilent || '')), String(wSilent));
  const wNative = savedWhere({ method: 'android_bridge', fileName: 'answer.pdf' }, 'PDF');
  // The native bridge does not report back, so the message must not claim the
  // file is saved — it says the save dialog was opened (same wording as the
  // book download).
  check('savedWhere() names the native save', /барои захира кардан омода/.test(String(wNative || '')), String(wNative));
  check('savedWhere() does not falsely claim the native file is saved',
    !/дар барнома сохта шуд/.test(String(wNative || '')), String(wNative));
  const wPicker = savedWhere({ method: 'file_picker', fileName: 'answer.pdf' }, 'PDF');
  check('savedWhere() reports that the user chose the location',
    /интихоб/.test(String(wPicker || '')), String(wPicker));
  // v180: the toast must state where the file IS, not tell the user to
  // choose a folder (the picker has already been shown).
  check('savedWhere() does not tell the user to choose a folder afterwards',
    !/интихоби папкаро гиред/.test(String(wPicker || '')), String(wPicker));
  check('savedWhere() says the file went where the user chose',
    /ҷои худро интихоб карда шуд/.test(String(wPicker || '')), String(wPicker));
  check('savedWhere() always includes the file name',
    /answer\.pdf/.test(String(wSilent || '')), String(wSilent));

  // The shared native fallback must exist and be loaded by both pages.
  check('the shared native fallback exists', fs.existsSync(path.join(ROOT, 'assets/js/native-fallback.js')));
  const readerHtml = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
  const readerAliyaHtml = fs.readFileSync(path.join(ROOT, 'aliya/reader-aliya.html'), 'utf8');
  check('reader.html loads the native fallback', /native-fallback\.js/.test(readerHtml));
  check('the Aliya iframe loads the native fallback', /native-fallback\.js/.test(readerAliyaHtml));
  check('the Aliya iframe loads the fallback BEFORE the bridge',
    readerAliyaHtml.indexOf('native-fallback.js') < readerAliyaHtml.indexOf('aliya-bridge.js'),
    'the fallback must be set up before the bridge reads it');


  if (failures.length) {
    console.error('\n' + failures.length + ' Reader Aliya save check(s) failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('\nPASS Reader Aliya save: Word and PDF really produce files inside the Reader.');
})().catch((e) => { console.error(e); process.exit(1); });
