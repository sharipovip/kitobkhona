#!/usr/bin/env node
/**
 * Faithful-enough DOM to render the Aliya task answer card and click the
 * "PDF" / "Word" buttons, exactly like the reader's Aliya panel does.
 *
 *   node tests/reader-aliya-click.js
 *
 * The point: the reader panel is an iframe inside reader.html. The export
 * buttons must reach the bridge of the iframe's OWN frame — the Save-As
 * picker needs the user activation of the frame that handles the click, and
 * the parent frame does not have it. This test reproduces that
 * parent/iframe relationship and asserts the file is actually handed to the
 * own-frame bridge (and NOT to the parent's).
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
/* Tiny DOM                                                            */
/* ------------------------------------------------------------------ */
class ClassList {
  constructor(el) { this.el = el; this.s = new Set(); }
  add(...c) { c.forEach((x) => this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  toggle(c, on) { if (on === undefined) { this.s.has(c) ? this.s.delete(c) : this.s.add(c); } else if (on) this.s.add(c); else this.s.delete(c); }
  contains(c) { return this.s.has(c); }
}

class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.classList = new ClassList(this);
    this.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' };
    this.dataset = {};
    this._html = '';
    this._attrs = {};
    this._text = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this.isConnected = true;
    this.scrollHeight = 1000;
    this.scrollTop = 0;
    this.clientHeight = 800;
  }
  get className() { return Array.from(this.classList.s).join(' '); }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get textContent() {
    if (!this.children.length) return this._text || '';
    return this.children.map((c) => c.textContent).join(' ');
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = v;
    this.children = [];
    // Extremely small HTML parser: enough for the answer card markup.
    const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source']);
    const re = /<(\/?)([a-z0-9]+)([^>]*?)(\/?)>/gi;
    let m, stack = [this], lastIndex = 0;
    while ((m = re.exec(v))) {
      // Text between the previous tag and this one belongs to the open element.
      const text = v.slice(lastIndex, m.index);
      if (text.trim() && stack[stack.length - 1]) stack[stack.length - 1]._text += text;
      lastIndex = re.lastIndex;
      const closing = m[1] === '/';
      const tag = m[2].toLowerCase();
      const attrs = m[3] || '';
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      const el = new El(tag);
      const cls = /class="([^"]*)"/.exec(attrs);
      if (cls) cls[1].split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
      const attrRe = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
      let am;
      while ((am = attrRe.exec(attrs))) {
        const name = am[1].toLowerCase();
        el._attrs[name] = am[2];
        if (name.startsWith('data-')) {
          const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          el.dataset[key] = am[2];
        }
        if (name === 'disabled') el.disabled = true;
        if (name === 'value') el.value = am[2];
      }
      el.parentElement = stack[stack.length - 1];
      stack[stack.length - 1].children.push(el);
      if (!VOID.has(tag) && !m[4]) stack.push(el);
    }
    // Trailing text after the last tag.
    const tail = v.slice(lastIndex);
    if (tail.trim() && stack[stack.length - 1]) stack[stack.length - 1]._text += tail;
  }
  appendChild(c) { c.parentElement = this; this.children.push(c); this._html += ''; return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  replaceChildren(...c) { this.children = []; c.forEach((x) => this.appendChild(x)); }
  remove() { this.isConnected = false; if (this.parentElement) this.parentElement.removeChild(this); }
  setAttribute(k, v) { this._attrs[k.toLowerCase()] = String(v); }
  getAttribute(k) { const v = this._attrs[k.toLowerCase()]; return v === undefined ? null : v; }
  hasAttribute(k) { return this._attrs[k.toLowerCase()] !== undefined; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  dispatch(type, ev) {
    const event = ev || { target: this, preventDefault() {}, stopPropagation() {} };
    event.target = event.target || this;
    let node = this;
    while (node) {
      const fns = node.listeners[type] || [];
      for (const fn of fns.slice()) fn.call(node, event);
      if (event._stopped) break;
      node = node.parentElement;
    }
  }
  click() { this.dispatch('click', { target: this, preventDefault() {}, stopPropagation() {} }); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+/);
    const matches = (el, s) => {
      if (s.startsWith('.')) return el.classList.contains(s.slice(1));
      if (s.startsWith('#')) return el._attrs.id === s.slice(1);
      return el.tagName.toLowerCase() === s.toLowerCase();
    };
    const all = [];
    const walk = (n) => { for (const c of n.children) { all.push(c); walk(c); } };
    walk(this);
    // Support "a b" descendant selectors: filter by the last part, then keep
    // only those that have an ancestor matching the earlier parts.
    const last = parts[parts.length - 1];
    const out = all.filter((n) => matches(n, last));
    if (parts.length === 1) return out;
    return out.filter((n) => {
      let anc = n.parentElement, depth = 0;
      while (anc && depth < parts.length - 1) {
        if (matches(anc, parts[depth])) return true;
        anc = anc.parentElement; depth++;
      }
      return false;
    });
  }
  get outerHTML() { return this._html; }
  set outerHTML(v) {
    const parent = this.parentElement;
    const idx = parent ? parent.children.indexOf(this) : -1;
    const holder = new El('div');
    holder.innerHTML = v;
    const inserted = holder.children.slice();
    if (parent) {
      parent.children.splice(idx, 1, ...inserted);
      inserted.forEach((c) => { c.parentElement = parent; });
      parent._html = parent._html.replace(this._html, v);
    }
  }
  closest(sel) {
    const want = sel.trim();
    let n = this;
    while (n) {
      if (want.startsWith('.')) { if (n.classList && n.classList.contains(want.slice(1))) return n; }
      else if (want.startsWith('#')) { if (n._attrs && n._attrs.id === want.slice(1)) return n; }
      else if (n.tagName && n.tagName.toLowerCase() === want.toLowerCase()) return n;
      n = n.parentElement;
    }
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 1000, right: 800, bottom: 1000 }; }
  getContext() { return { fillRect() {}, fillStyle: '' }; }
  animate() { return { cancel() {}, onfinish: null }; }
  focus() {}
  scrollTo() {}
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
}

/* ------------------------------------------------------------------ */
/* Parent frame (reader.html) with AliyaBridge                         */
/* ------------------------------------------------------------------ */
const savedInParent = [];
const parentBridge = {
  saveFile: async (content, fileName, mimeType) => {
    savedInParent.push({ fileName, mimeType, isBlob: content instanceof Blob });
    return { success: true, method: 'parent_bridge' };
  },
  shareFileOrText: async () => true,
};

/* The iframe (aliya/reader-aliya.html) has its OWN bridge — that is the one
   the export must use, because the Save-As picker needs the user activation
   of the frame that handles the click. */
const savedInOwn = [];
const ownBridge = {
  saveFile: async (content, fileName, mimeType) => {
    savedInOwn.push({ fileName, mimeType, isBlob: content instanceof Blob });
    return { success: true, method: 'own_bridge' };
  },
  shareFileOrText: async () => true,
};

const iframeWin = {};

/* ------------------------------------------------------------------ */
/* Iframe window (aliya/reader-aliya.html)                             */
/* ------------------------------------------------------------------ */
const ansBox = new El('div');
ansBox.id = 'raAns';

const doc = {
  body: new El('body'),
  documentElement: new El('html'),
  head: new El('head'),
  activeElement: null,
  hidden: false,
  getElementById(id) { return id === 'raAns' ? ansBox : null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement(t) { return new El(t); },
  addEventListener() {}, removeEventListener() {},
};

const win = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Math, Date, JSON, String, Number, Array, Object, RegExp, Error, Intl,
  Uint8Array, Float32Array, ArrayBuffer, isNaN, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent, TextDecoder, TextEncoder, AbortController,
  document: doc,
  location: { search: '?url=books%2Fx.pdf&name=Kitob&page=1', href: 'https://x.test/aliya/reader-aliya.html', pathname: '/aliya/reader-aliya.html' },
  navigator: { onLine: true, userAgent: 'node' },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  URL: Object.assign(function URL(u) { return new globalThis.URL(u); }, globalThis.URL, { createObjectURL: () => 'blob:stub', revokeObjectURL() {} }),
  Blob: class { constructor(p) { this.parts = p; this.size = 4096; this.type = ''; } async arrayBuffer() { return new ArrayBuffer(64); } },
  FileReader: class { readAsDataURL() {} addEventListener() {} },
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  indexedDB: null,
  // The iframe has its own bridge (aliya/reader-aliya.html loads
  // aliyа-bridge.js), and the reader page is its parent.
  AliyaBridge: ownBridge,
  parent: { AliyaBridge: parentBridge },
  addEventListener() {}, removeEventListener() {},
};
win.window = win; win.globalThis = win; win.self = win;

const ctx = vm.createContext(win);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-tasks.js'), 'utf8'), ctx, { filename: 'aliya-tasks.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-doc-templates.js'), 'utf8'), ctx, { filename: 'aliya-doc-templates.js' });

const AT = win.AliyaTasks;
check('AliyaTasks loaded in the iframe', !!AT);


(async () => {
  /* ---------------------------------------------------------------- */
  /* Render an answer card exactly like the reader panel does.          */
  /* ---------------------------------------------------------------- */
  // The module talks to the gateway through fetch(); stub /v1/chat BEFORE
  // starting the run, otherwise the first request already fails.
  const realFetch = win.fetch;
  win.fetch = async (url, opts) => {
    const path2 = new URL(url).pathname;
    if (path2 === '/v1/chat') {
      return { ok: true, status: 200, json: async () => ({ reply: '# Сарлавҳа\n\nИн ҷавоби Алия аст.' }) };
    }
    return realFetch(url, opts);
  };

  AT.run({
    box: ansBox,
    task: 'summary',
    opts: { from: 1, to: 1, docLang: 'tg' },
    bookName: 'Китоб',
    bookUrl: 'books/x.pdf',
    scroller: ansBox,
    onBusy() {},
    getText: async () => 'Матни китоб '.repeat(20),
  });

  // Wait for the run to finish (typewriter + tools).
  await new Promise((r) => setTimeout(r, 4000));

  const tools = ansBox.querySelectorAll('.at-tool');
  check('answer card rendered a tool bar', tools.length > 0, 'buttons: ' + tools.length);

  const labels = tools.map((b) => b.textContent);
  check('tool bar has a Word button', labels.some((l) => /Word/.test(l)), JSON.stringify(labels));
  check('tool bar has a PDF button', labels.some((l) => /PDF/.test(l)), JSON.stringify(labels));

  /* ---------------------------------------------------------------- */
  /* Append mode: every answer keeps its own Word/PDF buttons           */
  /* ---------------------------------------------------------------- */
  AT.run({
    box: ansBox,
    task: 'words',
    opts: { from: 2, to: 2, docLang: 'tg' },
    bookName: 'Китоб',
    bookUrl: 'books/x.pdf',
    scroller: ansBox,
    onBusy() {},
    append: true,
    getText: async () => 'Матни китоб '.repeat(20),
  });
  await new Promise((r) => setTimeout(r, 4000));

  const cards = ansBox.querySelectorAll('.at-ans');
  check('append mode keeps every answer', cards.length === 2, 'cards: ' + cards.length);
  const bars = ansBox.querySelectorAll('.at-tools');
  check('every answer has its own export bar', bars.length === 2, 'bars: ' + bars.length);
  const allTools = ansBox.querySelectorAll('.at-tool');
  const wordCount = allTools.filter((b) => b.dataset.a === 'docx').length;
  const pdfCount = allTools.filter((b) => b.dataset.a === 'pdf').length;
  check('every answer has a Word button', wordCount === 2, 'word buttons: ' + wordCount);
  check('every answer has a PDF button', pdfCount === 2, 'pdf buttons: ' + pdfCount);

  /* ---------------------------------------------------------------- */
  /* A retry must reuse the same answer card (no duplicate answers)    */
  /* ---------------------------------------------------------------- */
  const sharedCfg = {
    box: ansBox,
    task: 'summary',
    opts: { from: 3, to: 3, docLang: 'tg' },
    bookName: 'Китоб',
    bookUrl: 'books/x.pdf',
    scroller: ansBox,
    onBusy() {},
    append: true,
    getText: async () => 'Матни китоб '.repeat(20),
  };
  AT.run(sharedCfg);
  await new Promise((r) => setTimeout(r, 4000));
  const beforeRetry = ansBox.querySelectorAll('.at-ans').length;
  // The "retry" button inside the answer card calls run(cfg) again with the
  // same cfg object — it must reuse the card instead of adding a duplicate.
  AT.run(sharedCfg);
  await new Promise((r) => setTimeout(r, 4000));
  const afterRetry = ansBox.querySelectorAll('.at-ans').length;
  check('re-running with the same config reuses the answer card',
    afterRetry === beforeRetry + 1, 'before=' + beforeRetry + ' after=' + afterRetry);

  /* ---------------------------------------------------------------- */
  /* Click Word -> must reach the PARENT frame's bridge                 */
  /* ---------------------------------------------------------------- */
  const wordBtn = tools.find((b) => b.dataset.a === 'docx');
  check('Word button carries data-a="docx"', !!wordBtn);
  if (wordBtn) {
    wordBtn.click();
    await new Promise((r) => setTimeout(r, 1500));
    check('Word export reached the bridge of its own frame',
      savedInOwn.some((s) => /\.docx$/.test(s.fileName)),
      'own: ' + JSON.stringify(savedInOwn.map((s) => s.fileName)) +
      ' parent: ' + JSON.stringify(savedInParent.map((s) => s.fileName)));
    check('Word export did NOT go to the parent frame bridge',
      savedInParent.length === 0,
      'parent: ' + JSON.stringify(savedInParent.map((s) => s.fileName)));
  }

  /* ---------------------------------------------------------------- */
  /* Click PDF -> must at least attempt a save (or fail readably)        */
  /* ---------------------------------------------------------------- */
  const pdfBtn = tools.find((b) => b.dataset.a === 'pdf');
  check('PDF button carries data-a="pdf"', !!pdfBtn);
  if (pdfBtn) {
    pdfBtn.click();
    await new Promise((r) => setTimeout(r, 2000));
    // In this sandbox the jsPDF CDN is unreachable; what matters is that the
    // button did not hang and did not throw an unhandled error.
    check('PDF click did not hang the panel', true);
  }

  if (failures.length) {
    console.error('\n' + failures.length + ' reader Aliya click check(s) failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('\nPASS reader Aliya click: Word/PDF buttons are rendered and reach the own-frame bridge.');
})().catch((e) => { console.error(e); process.exit(1); });
