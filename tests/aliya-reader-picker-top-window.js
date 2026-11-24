#!/usr/bin/env node
/**
 * The Save-As picker must work in the Aliya INSIDE the Reader.
 *
 *   node tests/aliya-reader-picker-top-window.js
 *
 * The bug
 * -------
 * The user reported: "Алия не просит перед сохранение, папка просто
 * пишет 'интихоби папкаро гиред'". The Aliya in the Reader is an iframe,
 * and `showSaveFilePicker` only works in a TOP-LEVEL browsing context.
 * The bridge called `window.showSaveFilePicker` — i.e. on the iframe's own
 * window — where the API is missing or throws SecurityError. The bridge then
 * fell back to a plain download, so the user never saw the folder picker.
 *
 * The fix has two parts:
 *   1. the picker is opened on the TOP window (like the working "Скачать
 *      книгу" in config.js → downloadFile does);
 *   2. the picker is opened BEFORE the heavy document build, so the browser's
 *      user gesture is still alive when the picker opens.
 *
 * This test drives the real bridge + the real aliyat-tasks.js in a VM that
 * mimics the Reader: the iframe has NO picker, the top window has it.
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

const bridgeSrc = fs.readFileSync(path.join(ROOT, 'aliya', 'aliya-bridge.js'), 'utf8');

function makeFileReader() {
  return class FileReader {
    readAsDataURL(blob) {
      const self = this;
      Promise.resolve(blob.arrayBuffer()).then((buf) => {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        self.result = 'data:application/pdf;base64,' + btoa(bin);
        if (self.onloadend) self.onloadend({ target: self });
      });
    }
  };
}

/**
 * Build the Reader frame: top window (reader.html) + iframe (reader-aliya.html).
 * `topHasPicker` controls whether the top window exposes showSaveFilePicker.
 */
function makeReaderFrame(opts) {
  const o = opts || {};
  const log = [];
  const pickerCalls = [];

  const topDoc = {
    head: { appendChild() {} }, documentElement: { appendChild() {} },
    body: {
      appendChild(n) { log.push({ kind: 'append', where: 'top' }); return n; },
      removeChild() {},
    },
    createElement(tag) {
      const node = {
        tagName: String(tag).toUpperCase(), href: '', download: '', style: {},
        click() { log.push({ kind: 'click', where: 'top', download: node.download }); },
        remove() {}, setAttribute() {}, getAttribute() { return null; },
      };
      return node;
    },
    addEventListener() {}, removeEventListener() {},
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
  };
  const iframeDoc = Object.assign({}, topDoc, {
    body: {
      appendChild(n) { log.push({ kind: 'append', where: 'iframe' }); return n; },
      removeChild() {},
    },
    createElement(tag) {
      const node = {
        tagName: String(tag).toUpperCase(), href: '', download: '', style: {},
        click() { log.push({ kind: 'click', where: 'iframe', download: node.download }); },
        remove() {}, setAttribute() {}, getAttribute() { return null; },
      };
      return node;
    },
  });

  const top = {
    __isTop: true,
    document: topDoc,
    location: { href: 'https://x.test/reader.html' },
  };
  const iframe = {
    document: iframeDoc,
    location: { href: 'https://x.test/aliya/reader-aliya.html' },
  };
  top.parent = top; top.top = top;
  iframe.parent = top; iframe.top = top;

  // The picker lives ONLY on the top window (the Reader page).
  if (o.topHasPicker !== false) {
    top.showSaveFilePicker = async (opts) => {
      pickerCalls.push({ where: 'top', opts: JSON.parse(JSON.stringify(opts || {})) });
      const written = [];
      return {
        createWritable: async () => ({
          write: async (b) => { written.push({ size: b && b.size }); },
          close: async () => { top.__written = written; },
        }),
      };
    };
  }
  // The iframe has NO picker — exactly like a real browser.
  const iframePicker = async (opts) => {
    pickerCalls.push({ where: 'iframe', opts: JSON.parse(JSON.stringify(opts || {})) });
    return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
  };

  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
    Uint8Array, ArrayBuffer, Blob, atob, btoa,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    FileReader: makeFileReader(),
    top, window: null, globalThis: null,
    document: iframeDoc, location: iframe.location,
    addEventListener() {}, removeEventListener() {},
  });
  ctx.window = ctx;      // the iframe's own global object
  ctx.globalThis = ctx;
  if (o.iframeHasPicker) ctx.showSaveFilePicker = iframePicker;
  ctx.parent = top;
  ctx.top = top;
  vm.runInContext(bridgeSrc, ctx, { filename: 'aliya-bridge.js' });
  return { ctx, log, pickerCalls, top };
}

(async () => {
  /* ---------------------------------------------------------------- */
  /* 1. The bridge opens the picker on the TOP window                  */
  /* ---------------------------------------------------------------- */
  {
    const { ctx, pickerCalls, log } = makeReaderFrame({});
    const res = await vm.runInContext(
      'AliyaBridge.saveFile(new Blob([new Uint8Array([1,2,3])]), "kitob.pdf", "application/pdf")',
      ctx
    );
    check('the picker opens in the Reader (top window)', pickerCalls.length === 1 &&
      pickerCalls[0].where === 'top', JSON.stringify(pickerCalls));
    check('the picker gets the suggested name',
      pickerCalls[0] && pickerCalls[0].opts.suggestedName === 'kitob.pdf',
      JSON.stringify(pickerCalls[0]));
    check('the picker gets the extension without a dot',
      pickerCalls[0] && pickerCalls[0].opts.types &&
      pickerCalls[0].opts.types[0].accept['application/pdf'][0] === 'pdf',
      JSON.stringify(pickerCalls[0]));
    check('the save is reported through the picker',
      res && res.method === 'file_picker' && res.success === true, JSON.stringify(res));
    check('no silent download happens when the picker works',
      !log.some((l) => l.kind === 'click'), JSON.stringify(log));
  }

  /* ---------------------------------------------------------------- */
  /* 2. The picker is opened on the iframe only if the top has none    */
  /* ---------------------------------------------------------------- */
  {
    const { ctx, pickerCalls } = makeReaderFrame({ topHasPicker: false, iframeHasPicker: true });
    const res = await vm.runInContext(
      'AliyaBridge.saveFile(new Blob([new Uint8Array([1])]), "kitob.pdf", "application/pdf")',
      ctx
    );
    check('the picker falls back to the own frame when the top has none',
      pickerCalls.length === 1 && pickerCalls[0].where === 'iframe', JSON.stringify(pickerCalls));
    check('the fallback save is still reported as a chosen location',
      res && res.method === 'file_picker', JSON.stringify(res));
  }

  /* ---------------------------------------------------------------- */
  /* 3. No picker anywhere -> a plain download, honestly reported       */
  /* ---------------------------------------------------------------- */
  {
    const { ctx, log } = makeReaderFrame({ topHasPicker: false });
    const res = await vm.runInContext(
      'AliyaBridge.saveFile(new Blob([new Uint8Array([1])]), "kitob.pdf", "application/pdf")',
      ctx
    );
    check('without any picker the file is still saved',
      res && res.success === true && res.method === 'browser_blob', JSON.stringify(res));
    check('the silent download happens in the top window',
      log.some((l) => l.kind === 'click' && l.where === 'top'), JSON.stringify(log));
  }

  /* ---------------------------------------------------------------- */
  /* 4. A cancelled picker is NOT a successful save                     */
  /* ---------------------------------------------------------------- */
  {
    const { ctx, log } = makeReaderFrame({});
    ctx.top.showSaveFilePicker = async () => {
      const e = new Error('The user aborted a request.');
      e.name = 'AbortError';
      throw e;
    };
    let err = null, res = null;
    try {
      res = await vm.runInContext(
        'AliyaBridge.saveFile(new Blob([new Uint8Array([1])]), "kitob.pdf", "application/pdf")', ctx);
    } catch (e) { err = e; }
    check('a cancelled picker is reported as cancelled', !!err, JSON.stringify(res));
    check('a cancelled picker is not a successful save', !(res && res.success === true),
      JSON.stringify(res));
    check('a cancelled picker does not silently download',
      !log.some((l) => l.kind === 'click'), JSON.stringify(log));
  }

  /* ---------------------------------------------------------------- */
  /* 5. The picker opens BEFORE the heavy document build                */
  /* ---------------------------------------------------------------- */
  {
    // The gesture must still be alive: the picker is opened first, then
    // the document is built, then it is written to the chosen target.
    const tasksSrc = fs.readFileSync(path.join(ROOT, 'aliya', 'aliya-tasks.js'), 'utf8');
    const { ctx, pickerCalls } = makeReaderFrame({});
    ctx.AliyaTasks = null;
    // The tasks module needs a DOM; give it the iframe document.
    const stub = {
      console: { log() {}, warn() {}, error() {} },
      setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
      Uint8Array, ArrayBuffer, Blob, atob, btoa,
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      FileReader: makeFileReader(),
      window: null, globalThis: null,
      document: ctx.document, location: ctx.location,
      top: ctx.top, parent: ctx.top,
      addEventListener() {}, removeEventListener() {},
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
      setInterval() {}, clearInterval() {},
    };
    const tctx = vm.createContext(stub);
    tctx.window = tctx; tctx.globalThis = tctx;
    tctx.top = ctx.top; tctx.parent = ctx.top;
    tctx.AliyaBridge = ctx.AliyaBridge;
    vm.runInContext(tasksSrc, tctx, { filename: 'aliya-tasks.js' });

    // pickSaveTarget must open the picker on the TOP window.
    const target = await vm.runInContext(
      'AliyaTasks.pickSaveTarget("kitob.pdf", "application/pdf")', tctx);
    check('pickSaveTarget() returns a target from the top window',
      !!target && target && target.method === 'file_picker',
      target ? ('method=' + target.method) : String(target));
    check('the picker was opened in the top window by pickSaveTarget()',
      pickerCalls.length === 1 && pickerCalls[0].where === 'top', JSON.stringify(pickerCalls));

    // The source order matters: the picker must be opened BEFORE the PDF
    // is built, otherwise the user gesture is gone.
    const pickAt = tasksSrc.indexOf('await pickSaveTarget(');
    const buildAt = tasksSrc.indexOf('await P.build({');
    const docxAt = tasksSrc.indexOf('generateMarkdownDocx({');
    check('the picker is opened before the PDF is built',
      pickAt > 0 && buildAt > 0 && pickAt < buildAt,
      'pick=' + pickAt + ' build=' + buildAt);
    check('the picker is opened before the Word document is generated',
      pickAt > 0 && docxAt > 0 && pickAt < docxAt,
      'pick=' + pickAt + ' docx=' + docxAt);

    // Writing to the target must reach the chosen file.
    tctx.__target = target;
    const written = await vm.runInContext(
      'AliyaTasks.saveBlob(new Blob([new Uint8Array([7,7,7])]), "kitob.pdf", "application/pdf", __target)',
      tctx);
    check('the document is written to the chosen target',
      written && written.method === 'file_picker' && written.success === true,
      JSON.stringify(written));
  }

  /* ---------------------------------------------------------------- */
  /* 6. A cancelled picker in exportDoc aborts the whole save           */
  /* ---------------------------------------------------------------- */
  {
    const tasksSrc = fs.readFileSync(path.join(ROOT, 'aliya', 'aliya-tasks.js'), 'utf8');
    const { ctx } = makeReaderFrame({});
    ctx.top.showSaveFilePicker = async () => {
      const e = new Error('The user aborted a request.');
      e.name = 'AbortError';
      throw e;
    };
    const stub = {
      console: { log() {}, warn() {}, error() {} },
      setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
      Uint8Array, ArrayBuffer, Blob, atob, btoa,
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      FileReader: makeFileReader(),
      window: null, globalThis: null,
      document: ctx.document, location: ctx.location,
      top: ctx.top, parent: ctx.top,
      addEventListener() {}, removeEventListener() {},
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
      setInterval() {}, clearInterval() {},
    };
    const tctx = vm.createContext(stub);
    tctx.window = tctx; tctx.globalThis = tctx;
    tctx.top = ctx.top; tctx.parent = ctx.top;
    tctx.AliyaBridge = ctx.AliyaBridge;
    vm.runInContext(tasksSrc, tctx, { filename: 'aliya-tasks.js' });

    let err = null;
    try {
      await vm.runInContext(
        'AliyaTasks.exportDoc("pdf", "Test", "Матни озмоишӣ", { docType: "Test" })', tctx);
    } catch (e) { err = e; }
    check('a cancelled picker aborts exportDoc()',
      !!err && (err.abortedByUser || err.name === 'AbortError'),
      err ? (err.name + ': ' + err.message) : 'no error thrown');
  }

  /* ---------------------------------------------------------------- */
  /* 7. The Reader page must expose the picker on the top window       */
  /* ---------------------------------------------------------------- */
  {
    const readerHtml = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
    check('the Reader page loads the shared bridge', /aliya-bridge\.js/.test(readerHtml) ||
      /aliya\/reader-aliya\.html/.test(readerHtml));
    const bridge = fs.readFileSync(path.join(ROOT, 'aliya', 'aliya-bridge.js'), 'utf8');
    check('the bridge searches the top window for the picker',
      /pickerWindows/.test(bridge) && /window\.top/.test(bridge),
      'the bridge does not look at window.top for the picker');
  }

  /* ---------------------------------------------------------------- */
  /* 8. Android: the native Save-As dialog is reached from the iframe   */
  /* ---------------------------------------------------------------- */
  {
    const tasksSrc = fs.readFileSync(path.join(ROOT, 'aliya', 'aliya-tasks.js'), 'utf8');
    const nativeCalls = [];
    const topDoc = {
      head: { appendChild() {} }, documentElement: { appendChild() {} },
      body: { appendChild(n) { return n; }, removeChild() {} },
      createElement() { return { style: {}, click() {}, remove() {}, setAttribute() {} }; },
      addEventListener() {}, getElementById() { return null; },
    };
    const top = {
      __isTop: true, document: topDoc, location: { href: 'https://x.test/reader.html' },
      AndroidBridge: {
        saveFile(base64, fileName, mime) { nativeCalls.push({ fileName, mime, bytes: String(base64).length }); },
      },
    };
    const iframe = {
      document: Object.assign({}, topDoc, { body: { appendChild(n) { return n; }, removeChild() {} } }),
      location: { href: 'https://x.test/aliya/reader-aliya.html' },
    };
    top.parent = top; top.top = top; iframe.parent = top; iframe.top = top;

    const stub = {
      console: { log() {}, warn() {}, error() {} },
      setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
      Uint8Array, ArrayBuffer, Blob, atob, btoa,
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      // The real FileReader fires BOTH onload and onloadend.
      FileReader: class {
        readAsDataURL(blob) {
          const self = this;
          Promise.resolve(blob.arrayBuffer()).then((buf) => {
            const bytes = new Uint8Array(buf);
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            self.result = 'data:application/octet-stream;base64,' + btoa(bin);
            if (self.onload) self.onload({ target: self });
            if (self.onloadend) self.onloadend({ target: self });
          });
        }
      },
      window: null, globalThis: null,
      document: iframe.document, location: iframe.location,
      top, parent: top,
      addEventListener() {}, removeEventListener() {},
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
      setInterval() {}, clearInterval() {},
    };
    const tctx = vm.createContext(stub);
    tctx.window = tctx; tctx.globalThis = tctx;
    tctx.top = top; tctx.parent = top;
    vm.runInContext(bridgeSrc, tctx, { filename: 'aliya-bridge.js' });
    vm.runInContext(tasksSrc, tctx, { filename: 'aliya-tasks.js' });
    tctx.AliyaTemplates = {
      generateMarkdownDocx: () => new Blob([new Uint8Array([1, 2, 3])], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    };

    let res = null, err = null;
    try {
      res = await vm.runInContext(
        'AliyaTasks.exportDoc("docx", "Test", "\u041c\u0430\u0442\u043d\u0438 \u043e\u0437\u043c\u043e\u0438\u0448\u0453", { docType: "Test" })',
        tctx);
    } catch (e) { err = e; }
    check('the Android native dialog is reached from the Aliya iframe',
      nativeCalls.length === 1, JSON.stringify(nativeCalls));
    check('the native dialog gets the real file name',
      nativeCalls[0] && /\.docx$/.test(nativeCalls[0].fileName), JSON.stringify(nativeCalls[0]));
    check('the native dialog gets the file content',
      nativeCalls[0] && nativeCalls[0].bytes > 0, JSON.stringify(nativeCalls[0]));
    check('the Android save is reported through the native bridge',
      res && res.method === 'android_bridge' && res.success === true,
      err ? (err.name + ': ' + err.message) : JSON.stringify(res));
    check('no browser picker is opened on Android',
      !('showSaveFilePicker' in tctx), 'the Android path must not ask for a browser folder');
  }

  if (failures.length) {
    console.error('\n' + failures.length + ' picker check(s) failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('\nPASS the Aliya in the Reader opens the folder picker, like the working book download.');
})().catch((e) => { console.error(e); process.exit(1); });
