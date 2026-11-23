#!/usr/bin/env node
/**
 * Runtime test for the reader's theme toggle and free zoom.
 *
 *   node tests/reader-zoom-theme-runtime.js
 *
 * The functions are extracted from the real reader.html and executed against a
 * small DOM stub, so this checks behaviour (one press flips the theme, the
 * page scales on both axes, pinch keeps the point under the fingers) instead
 * of just matching source text.
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

const readerSrc = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');

/* ------------------------------------------------------------------ */
/* Minimal DOM                                                        */
/* ------------------------------------------------------------------ */
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
    dataset: {},
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    disabled: false,
    clientWidth: 800,
    clientHeight: 1200,
    scrollWidth: 800,
    scrollHeight: 1200,
    scrollTop: 0,
    listeners: {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    replaceChildren() { this.children = []; },
    remove() {},
    setAttribute() {},
    getAttribute: () => null,
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 1200 }),
    getContext: () => ({ fillRect() {}, fillStyle: '' }),
    animate: () => ({ cancel() {}, onfinish: null }),
    focus() {},
    click() {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, o) { if (o === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (o) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
  };
  return el;
}

const els = {};
function $(id) {
  if (!els[id]) els[id] = makeEl('div');
  return els[id];
}
$('readerThemeIcon').textContent = '';
$('pageContainer').clientWidth = 800;
$('pageContainer').clientHeight = 1200;
$('stage').classList.add('stage');

const store = {};
const doc = {
  body: makeEl('body'),
  documentElement: makeEl('html'),
  head: makeEl('head'),
  getElementById: (id) => (id in els ? els[id] : null),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (t) => makeEl(t),
  addEventListener() {}, removeEventListener() {},
};
doc.body.classList.add('reader-body');

/* ------------------------------------------------------------------ */
/* Extract the real functions from reader.html                          */
/* ------------------------------------------------------------------ */
function extract(block) {
  const start = readerSrc.indexOf(block);
  if (start < 0) throw new Error('not found: ' + block);
  let i = readerSrc.indexOf('{', start), depth = 0;
  for (let j = i; j < readerSrc.length; j++) {
    if (readerSrc[j] === '{') depth++;
    else if (readerSrc[j] === '}') { depth--; if (depth === 0) return readerSrc.slice(start, j + 1); }
  }
  throw new Error('unbalanced: ' + block);
}

const pieces = [
  'function syncReaderTheme(t)',
  'function setTheme(t)',
  'function toggleReaderTheme()',
  'function clampZoom(z)',
  'function syncZoomUI()',
  'function setZoom(v)',
  'function applyViewTo(cv, smooth)',
  'function pageBox()',
  'function stageIsPdf()',
].map(extract).join('\n');

const gestureSrc = readerSrc.slice(
  readerSrc.indexOf('const gesture = {'),
  readerSrc.indexOf('// v172: зум бо чархаи муш')
);

const stageListeners = {};
const stageStub = {
  addEventListener(t, fn) { (stageListeners[t] = stageListeners[t] || []).push(fn); },
  removeEventListener() {},
  setPointerCapture() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 1200 }),
};

const win = {
  console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Math, Date, JSON,
  String, Number, Array, Object, RegExp, Error, isNaN, parseInt, parseFloat,
  document: doc,
  location: { search: '', href: 'https://x.test/reader.html' },
  navigator: { userAgent: 'node' },
  localStorage: {
    _d: store,
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  devicePixelRatio: 2,
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  addEventListener() {}, removeEventListener() {},
  KKH_THEMES: { light: { bg: '#FFFFFF' }, dark: { bg: '#0C0C0C' } },
};

// The shared objects must be available *before* the script runs, so the
// context is built with them already in place.
function makeReaderCtx(extraSrc) {
  const ctx = vm.createContext(Object.assign({}, win, {
    __els: els, __doc: doc, __store: store, __stageStub: stageStub,
  }));
  const script = `
    const READER_THEMES = ['light', 'dark'];
    const Z_MIN = 0.5, Z_MAX = 4.0;
    let zoom = 1, renderedZoom = 1, panX = 0, panY = 0;
    let pdf = null, page = 1, rendering = false, zoomCommitTimer = null;
    const els = globalThis.__els, doc = globalThis.__doc, store = globalThis.__store;
    const window = globalThis;
    const $ = (id) => (id in els ? els[id] : null);
    let stageEl = globalThis.__stageStub;
    function cvEl() { return els.canvas || null; }
    function renderPage() { renderedZoom = zoom; }
    function toast() {}
    globalThis.__state = () => ({ zoom, renderedZoom, panX, panY, Z_MAX, Z_MIN });
    globalThis.__set = (k, v) => {
      if (k === 'zoom') zoom = v;
      else if (k === 'renderedZoom') renderedZoom = v;
      else if (k === 'panX') panX = v;
      else if (k === 'panY') panY = v;
      else if (k === 'pdf') pdf = v;
    };
  ` + pieces + '\n' + (extraSrc || '');
  vm.runInContext(script, ctx, { filename: 'reader-slice.js' });
  return ctx;
}

const state = (ctx) => vm.runInContext('__state()', ctx);
const set = (ctx, k, v) => vm.runInContext('__set(' + JSON.stringify(k) + ',' + JSON.stringify(v) + ')', ctx);
const call = (ctx, expr) => vm.runInContext(expr, ctx);

/* ------------------------------------------------------------------ */
/* 1. Theme: one press flips day <-> night                             */
/* ------------------------------------------------------------------ */
const ctx = makeReaderCtx();

call(ctx, "setTheme('light')");
check('reader starts in the light theme', store.kk_reader_theme === 'light', store.kk_reader_theme);
check('light theme sets the light-reading class', doc.body.classList.contains('light-reading'));

call(ctx, 'toggleReaderTheme()');
check('one press switches light -> dark', store.kk_reader_theme === 'dark', store.kk_reader_theme);
check('dark theme removes the light-reading class', !doc.body.classList.contains('light-reading'));
check('theme icon shows the night glyph', $('readerThemeIcon').textContent === '🌙', $('readerThemeIcon').textContent);

call(ctx, 'toggleReaderTheme()');
check('one press switches dark -> light', store.kk_reader_theme === 'light', store.kk_reader_theme);
check('light theme restores the light-reading class', doc.body.classList.contains('light-reading'));
check('theme icon shows the day glyph', $('readerThemeIcon').textContent === '☀', $('readerThemeIcon').textContent);

call(ctx, "setTheme('minimal')");
check('unknown theme falls back to light', store.kk_reader_theme === 'light', store.kk_reader_theme);

/* ------------------------------------------------------------------ */
/* 2. Zoom: free, uniform, on both axes                                */
/* ------------------------------------------------------------------ */
call(ctx, 'setZoom(400)');
check('zoom can reach 400%', Math.round(state(ctx).zoom * 100) === 400, 'zoom=' + state(ctx).zoom);
check('zoom is clamped to Z_MAX', state(ctx).zoom <= 4.0 && state(ctx).zoom >= 0.5);

call(ctx, 'setZoom(10)');
check('zoom can go down to 50%', Math.round(state(ctx).zoom * 100) === 50, 'zoom=' + state(ctx).zoom);
call(ctx, 'setZoom(100)');

/* The canvas is rendered at the fit scale; applyViewTo scales it further. */
const canvas = makeEl('canvas');
canvas.style.width = '800px';
canvas.style.height = '1132px';
els.canvas = canvas;

set(ctx, 'renderedZoom', 1);
set(ctx, 'zoom', 2);
set(ctx, 'panX', 0); set(ctx, 'panY', 0);
call(ctx, 'applyViewTo(els.canvas, false)');
const t2 = canvas.style.transform;
check('zoom applies a uniform scale factor', /scale\(2\)/.test(t2), t2);
check('zoom transform has no axis-specific scale', !/scaleX|scaleY/.test(t2));

// At 200% the page is wider than the 800px container -> horizontal panning
// must become possible (this is what the user asked for).
set(ctx, 'panX', 99999);
call(ctx, 'applyViewTo(els.canvas, false)');
check('pan is clamped to the reachable horizontal range', Math.abs(state(ctx).panX) <= 800, 'panX=' + state(ctx).panX);
check('horizontal panning is possible at 200%', state(ctx).panX > 0, 'panX=' + state(ctx).panX);

// At 400% the page is far wider and taller than the container.
set(ctx, 'zoom', 4); set(ctx, 'renderedZoom', 1); set(ctx, 'panX', 0); set(ctx, 'panY', 0);
call(ctx, 'applyViewTo(els.canvas, false)');
set(ctx, 'panX', 99999); set(ctx, 'panY', 99999);
call(ctx, 'applyViewTo(els.canvas, false)');
check('horizontal panning is possible at 400%', state(ctx).panX > 0, 'panX=' + state(ctx).panX);
check('vertical panning is possible at 400%', state(ctx).panY > 0, 'panY=' + state(ctx).panY);
check('panning reaches the whole enlarged page', state(ctx).panX >= 1200 - 1, 'panX=' + state(ctx).panX);

/* ------------------------------------------------------------------ */
/* 3. Pinch: the point under the fingers stays under the fingers       */
/* ------------------------------------------------------------------ */
const ctx2 = makeReaderCtx(gestureSrc);

check('reader registers touch handlers for pinch',
  !!stageListeners.touchstart && !!stageListeners.touchmove, Object.keys(stageListeners).join(', '));

function touchEvent(type, a, b) {
  const touches = [a, b].filter(Boolean);
  return { type, touches, changedTouches: touches, preventDefault() {}, stopPropagation() {} };
}
const fingerA = { clientX: 300, clientY: 500 };
const fingerB = { clientX: 500, clientY: 500 };

set(ctx2, 'renderedZoom', 1);
set(ctx2, 'zoom', 1);
set(ctx2, 'panX', 0); set(ctx2, 'panY', 0);
set(ctx2, 'pdf', { getPage: async () => ({}) });

for (const fn of stageListeners.touchstart || []) fn(touchEvent('touchstart', fingerA, fingerB));

// Spread the fingers to 500px -> zoom factor 2.
const spreadA = { clientX: 150, clientY: 500 };
const spreadB = { clientX: 650, clientY: 500 };
for (const fn of stageListeners.touchmove || []) fn(touchEvent('touchmove', spreadA, spreadB));

const st = state(ctx2);
check('pinch out increases the zoom', st.zoom > 1.5, 'zoom=' + st.zoom);
check('pinch zooms around the fingers (page pans with the midpoint)',
  Math.abs(st.panX) > 1 || Math.abs(st.panY) > 1, 'panX=' + st.panX + ' panY=' + st.panY);

// Pinch in again -> the zoom must come back down.
for (const fn of stageListeners.touchend || []) fn({ type: 'touchend', touches: [], changedTouches: [], preventDefault() {} });
for (const fn of stageListeners.touchstart || []) fn(touchEvent('touchstart', fingerA, fingerB));
// Bring the fingers from 200px apart to 100px apart -> half the zoom.
for (const fn of stageListeners.touchmove || []) fn(touchEvent('touchmove', { clientX: 350, clientY: 500 }, { clientX: 450, clientY: 500 }));
check('pinch in decreases the zoom', state(ctx2).zoom < st.zoom, 'zoom=' + state(ctx2).zoom);

// Pinching must not be blocked by the single-axis pan mode of the old code.
check('no single-axis zoom mode exists', !/zoomPanMode\s*=\s*true/.test(readerSrc));

if (failures.length) {
  console.error('\n' + failures.length + ' reader zoom/theme runtime check(s) failed: ' + failures.join(', '));
  process.exit(1);
}
console.log('\nPASS reader zoom/theme runtime: one-press theme flip, free uniform zoom on both axes.');
