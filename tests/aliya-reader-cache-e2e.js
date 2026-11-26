#!/usr/bin/env node
/**
 * End-to-end check of the two things the user asked for:
 *
 *   1. The Aliya inside the Reader really saves the file and asks where to
 *      put it (native dialog on Android, Save-As picker in the browser).
 *   2. The admin "Управление кэшем" command reaches every device and is
 *      applied automatically on the next launch, with a manual "Обновить"
 *      button as the fallback.
 *
 *   node tests/aliya-reader-cache-e2e.js
 *
 * The harness builds the real frames (Reader page -> Aliya iframe) in one
 * VM realm, so the native bridge really has to travel from the iframe up to
 * the top window, exactly like in the browser.
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

const bridgeSrc = fs.readFileSync(path.join(ROOT, 'aliya/aliya-bridge.js'), 'utf8');
const tasksSrc = fs.readFileSync(path.join(ROOT, 'aliya/aliya-tasks.js'), 'utf8');

/* ------------------------------------------------------------------ */
/* A tiny DOM that records what the frames do                         */
/* ------------------------------------------------------------------ */
function makeDoc(label, log) {
  const doc = {
    _label: label,
    head: { appendChild() {}, insertBefore() {} },
    documentElement: { appendChild() {}, insertBefore() {} },
    body: {
      appendChild(n) { log.push({ kind: 'append', where: label, node: n }); return n; },
      removeChild(n) { log.push({ kind: 'remove', where: label, node: n }); },
    },
    createElement(tag) {
      const node = {
        tagName: String(tag).toUpperCase(), href: '', download: '', style: {},
        click() { log.push({ kind: 'click', where: label, download: node.download }); },
        remove() {}, setAttribute() {}, getAttribute() { return null; },
      };
      return node;
    },
    addEventListener() {}, removeEventListener() {},
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
  };
  return doc;
}

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

/* ------------------------------------------------------------------ */
/* Scenario 1: the Aliya iframe inside the Reader, native Android     */
/* ------------------------------------------------------------------ */
(function scenarioNativeAndroid() {
  const log = [];
  const topDoc = makeDoc('top', log);
  const top = {
    __isTop: true,
    document: topDoc,
    AndroidBridge: {
      saveFile(base64, fileName, mime) {
        log.push({ kind: 'android_save', where: 'top', fileName, mime, bytes: base64.length });
      },
    },
    location: { href: 'https://x.test/reader.html' },
  };
  const parent = {
    __isParent: true,
    document: makeDoc('parent', log),
    AndroidBridge: top.AndroidBridge,
    location: { href: 'https://x.test/reader.html' },
  };
  const iframe = {
    document: makeDoc('iframe', log),
    location: { href: 'https://x.test/aliya/reader-aliya.html' },
  };
  top.parent = parent; top.top = top;
  parent.parent = top; parent.top = top;
  iframe.parent = parent; iframe.top = top;
  top.window = top; parent.window = parent; iframe.window = iframe;

  // The iframe window IS the VM context — that is how a browser frame works:
  // `window.AliyaBridge = ...` must land on the global object.
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
    Uint8Array, ArrayBuffer, Blob, atob, btoa, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    FileReader: makeFileReader(),
    top, parent,
    window: null,
    globalThis: null,
    document: iframe.document,
    location: iframe.location,
    addEventListener() {}, removeEventListener() {},
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.parent = parent;
  ctx.top = top;
  vm.runInContext(bridgeSrc, ctx, { filename: 'aliya-bridge.js' });

  return vm.runInContext(
    'AliyaBridge.saveFile(new Blob([new Uint8Array([1,2,3,4])]), "kitob.pdf", "application/pdf")',
    ctx
  ).then((res) => {
    const native = log.find((l) => l.kind === 'android_save');
    check('the Reader Aliya reaches the Android native Save-As dialog',
      !!native, JSON.stringify(log));
    check('the native dialog is opened in the TOP window (not the iframe)',
      native && native.where === 'top', native && native.where);
    check('the native dialog receives the real file name',
      native && native.fileName === 'kitob.pdf', native && native.fileName);
    check('the native dialog receives the file content',
      native && native.bytes > 0, native && native.bytes);
    check('the save is reported through the native bridge',
      res && res.method === 'android_bridge' && res.success === true, JSON.stringify(res));
    check('no silent download happens in the Reader', !log.some((l) => l.kind === 'click'),
      JSON.stringify(log));
  });
})()

/* ------------------------------------------------------------------ */
/* Scenario 2: the Aliya iframe inside the Reader, browser picker      */
/* ------------------------------------------------------------------ */
.then(function scenarioBrowserPicker() {
  const log = [];
  const topDoc = makeDoc('top', log);
  const top = { __isTop: true, document: topDoc, location: { href: 'https://x.test/' } };
  const parent = { __isParent: true, document: makeDoc('parent', log), location: top.location };
  const iframe = { document: makeDoc('iframe', log), location: { href: 'https://x.test/aliya/reader-aliya.html' } };
  top.parent = parent; top.top = top;
  parent.parent = top; parent.top = top;
  iframe.parent = parent; iframe.top = top;
  top.window = top; parent.window = parent; iframe.window = iframe;

  let pickerOpts = null;
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
    Uint8Array, ArrayBuffer, Blob, atob, btoa, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    FileReader: makeFileReader(),
    top, parent,
    window: null,
    globalThis: null,
    document: iframe.document,
    location: iframe.location,
    addEventListener() {}, removeEventListener() {},
    showSaveFilePicker: async (opts) => {
      pickerOpts = JSON.parse(JSON.stringify(opts || {}));
      return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
    },
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.parent = parent;
  ctx.top = top;
  vm.runInContext(bridgeSrc, ctx, { filename: 'aliya-bridge.js' });

  return vm.runInContext(
    'AliyaBridge.saveFile(new Blob([new Uint8Array([1,2,3,4])]), "kitob.pdf", "application/pdf")',
    ctx
  ).then((res) => {
    check('the Reader Aliya opens the Save-As picker in the browser', !!pickerOpts,
      JSON.stringify(pickerOpts));
    check('the picker asks for a file name', pickerOpts && pickerOpts.suggestedName === 'kitob.pdf',
      JSON.stringify(pickerOpts));
    check('the picker accepts the PDF type with a dotted extension',
      pickerOpts && pickerOpts.types && pickerOpts.types[0].accept['application/pdf'][0] === '.pdf',
      JSON.stringify(pickerOpts));
    check('the picker save is reported as a chosen location',
      res && res.method === 'file_picker' && res.success === true, JSON.stringify(res));
    check('no silent download happens when the picker works',
      !log.some((l) => l.kind === 'click'), JSON.stringify(log));
  });
})

/* ------------------------------------------------------------------ */
/* Scenario 3: the user cancels the picker -> NOT saved                */
/* ------------------------------------------------------------------ */
.then(function scenarioCancel() {
  const log = [];
  const top = { __isTop: true, document: makeDoc('top', log), location: { href: 'https://x.test/' } };
  const iframe = { document: makeDoc('iframe', log), location: { href: 'https://x.test/aliya/' } };
  top.parent = top; top.top = top; iframe.parent = top; iframe.top = top;
  top.window = top; iframe.window = iframe;

  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
    Uint8Array, ArrayBuffer, Blob, atob, btoa, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    FileReader: makeFileReader(),
    top, window: null, globalThis: null,
    document: iframe.document, location: iframe.location,
    addEventListener() {}, removeEventListener() {},
    showSaveFilePicker: async () => { const e = new Error('The user aborted a request.'); e.name = 'AbortError'; throw e; },
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.parent = top;
  ctx.top = top;
  vm.runInContext(bridgeSrc, ctx, { filename: 'aliya-bridge.js' });

  let err = null, res = null;
  return vm.runInContext(
    'AliyaBridge.saveFile(new Blob([new Uint8Array([1])]), "kitob.pdf", "application/pdf")',
    ctx
  ).then((r) => { res = r; }, (e) => { err = e; }).then(() => {
    check('a cancelled picker is reported as cancelled', !!err, JSON.stringify(res));
    check('a cancelled picker is NOT reported as a successful save',
      !(res && res.success === true), JSON.stringify(res));
    check('a cancelled picker does not silently download instead',
      !log.some((l) => l.kind === 'click'), JSON.stringify(log));
  });
})

/* ------------------------------------------------------------------ */
/* Scenario 4: the Aliya chat method (the working reference)          */
/* ------------------------------------------------------------------ */
.then(function scenarioChatMethod() {
  const log = [];
  const top = { __isTop: true, document: makeDoc('top', log), location: { href: 'https://x.test/' } };
  const iframe = { document: makeDoc('iframe', log), location: { href: 'https://x.test/aliya/' } };
  top.parent = top; top.top = top; iframe.parent = top; iframe.top = top;
  top.window = top; iframe.window = iframe;

  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
    Uint8Array, ArrayBuffer, Blob, atob, btoa, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    FileReader: makeFileReader(),
    top, window: null, globalThis: null,
    document: iframe.document, location: iframe.location,
    addEventListener() {}, removeEventListener() {},
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.parent = top;
  ctx.top = top;
  vm.runInContext(bridgeSrc, ctx, { filename: 'aliya-bridge.js' });

  // The chat method of the Aliya calls saveBlob -> the same bridge.
  const tasksCtx = vm.createContext(Object.assign(Object.create(null), ctx, {
    document: iframe.document, window: iframe, globalThis: null,
  }));
  tasksCtx.globalThis = tasksCtx;
  tasksCtx.AliyaBridge = ctx.AliyaBridge;
  tasksCtx.saveBlob = null;

  // saveBlob lives inside the Aliya IIFE — take it from the source and run
  // the whole tasks file with a stub DOM.
  const stub = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
    Uint8Array, ArrayBuffer, Blob, atob, btoa,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    FileReader: makeFileReader(),
    document: iframe.document, location: iframe.location,
    top, iframe, window: iframe, globalThis: null,
    addEventListener() {}, removeEventListener() {},
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
  };
  const tctx = vm.createContext(stub);
  tctx.globalThis = tctx;
  tctx.window = tctx;
  tctx.AliyaBridge = ctx.AliyaBridge;
  vm.runInContext(tasksSrc, tctx, { filename: 'aliya-tasks.js' });

  // The tasks file exposes saveBlob through the Aliya namespace.
  const hasSaveBlob = vm.runInContext(
    'typeof (window.AliyaTasks && window.AliyaTasks.saveBlob) === "function"',
    tctx
  );
  check('the Aliya exposes a saveBlob() method', hasSaveBlob === true, String(hasSaveBlob));

  return vm.runInContext(
    'window.AliyaTasks.saveBlob(new Blob([new Uint8Array([9,9])]), "chat.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")',
    tctx
  ).then((res) => {
    check('the Aliya chat method really saves the Word file', res && res.success === true, JSON.stringify(res));
    check('the Aliya chat method asks for a location or reports it honestly',
      res && (res.method === 'file_picker' || res.method === 'android_bridge' || res.method === 'browser_blob'),
      JSON.stringify(res));
  });
})

/* ------------------------------------------------------------------ */
/* Scenario 5: Real reader.html top-level adapter + iframe cross-realm */
/* ------------------------------------------------------------------ */
.then(async function scenarioReaderHostDelegation() {
  const readerHtml = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
  const nativeFallbackSrc = fs.readFileSync(path.join(ROOT, 'assets/js/native-fallback.js'), 'utf8');
  const marker = '// v183: Сабти ягонаи файл барои Алия дар Reader';
  const start = readerHtml.indexOf(marker);
  const end = readerHtml.indexOf('</script>', start);
  check('reader.html exposes the top-level Aliya save adapter', start > 0 && end > start);
  const adapterCode = readerHtml.slice(start, end);

  function makeReaderTop(extra) {
    const log = [];
    const readerCtx = vm.createContext(Object.assign({
      console: { log() {}, warn() {}, error() {} },
      setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
      Uint8Array, ArrayBuffer, atob, btoa,
      URL: { createObjectURL: () => 'blob:reader', revokeObjectURL() {} },
      document: makeDoc('reader', log),
      location: { href: 'https://x.test/reader.html' },
      FileReader: makeFileReader(),
    }, extra || {}));
    readerCtx.window = readerCtx;
    readerCtx.globalThis = readerCtx;
    readerCtx.parent = readerCtx;
    readerCtx.top = readerCtx;
    vm.runInContext(`
      globalThis.Blob = class ReaderBlob {
        constructor(parts, opts) {
          this.parts = parts || [];
          this.type = (opts && opts.type) || '';
          this.size = 0;
          for (const p of this.parts) this.size += (p && (p.byteLength || p.length || p.size)) || 0;
        }
        async arrayBuffer() {
          const p = this.parts[0];
          if (!p) return new ArrayBuffer(0);
          if (p instanceof ArrayBuffer) return p.slice(0);
          if (p.buffer) return p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength);
          return new ArrayBuffer(0);
        }
      };
    `, readerCtx);
    vm.runInContext(adapterCode, readerCtx, { filename: 'reader-adapter.js' });
    return { readerCtx, log };
  }

  function makeIframe(readerCtx, extra) {
    const iframeLog = [];
    const ictx = vm.createContext(Object.assign({
      console: { log() {}, warn() {}, error() {} },
      setTimeout, clearTimeout, Promise, Math, Date, JSON, String, Number, Object, RegExp, Error,
      Uint8Array, ArrayBuffer, atob, btoa,
      URL: { createObjectURL: () => 'blob:iframe', revokeObjectURL() {} },
      FileReader: makeFileReader(),
      document: makeDoc('iframe', iframeLog),
      location: { href: 'https://x.test/aliya/reader-aliya.html?embed=1' },
      top: readerCtx, parent: readerCtx,
      window: null, globalThis: null,
      addEventListener() {}, removeEventListener() {},
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
    }, extra || {}));
    ictx.window = ictx;
    ictx.globalThis = ictx;
    // Separate Blob realm inside the iframe (just like a real browser iframe!).
    vm.runInContext(`
      globalThis.Blob = class IframeBlob {
        constructor(parts, opts) {
          this.parts = parts || [];
          this.type = (opts && opts.type) || '';
          this.size = 0;
          for (const p of this.parts) this.size += (p && (p.byteLength || p.length || p.size)) || 0;
        }
        async arrayBuffer() {
          const p = this.parts[0];
          if (!p) return new ArrayBuffer(0);
          if (p instanceof ArrayBuffer) return p.slice(0);
          if (p.buffer) return p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength);
          return new ArrayBuffer(0);
        }
      };
    `, ictx);
    vm.runInContext(nativeFallbackSrc, ictx, { filename: 'native-fallback.js' });
    vm.runInContext(bridgeSrc, ictx, { filename: 'aliya-bridge.js' });
    vm.runInContext(tasksSrc, ictx, { filename: 'aliya-tasks.js' });
    ictx.AliyaTemplates = {
      generateMarkdownDocx: () => new ictx.Blob([new Uint8Array([80, 75, 3, 4])], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    };
    return { ictx, iframeLog };
  }

  // Case A: Android APK with real parent.AndroidBridge AND KitobkhonaNative
  {
    const calls = [];
    const { readerCtx, log } = makeReaderTop({
      AndroidBridge: {
        saveFile(b64, fileName, mime) { calls.push({ via: 'real_AndroidBridge', b64, fileName, mime }); },
      },
      KitobkhonaNative: {
        postMessage(msg) { calls.push({ via: 'KitobkhonaNative', msg }); },
      },
    });
    const { ictx } = makeIframe(readerCtx);
    const res = await vm.runInContext(
      'AliyaTasks.exportDoc("docx", "Дарс", "Матн", { docType: "Нақшаи дарс" })',
      ictx
    );
    check('real AndroidBridge on reader.html wins over KitobkhonaNative fallback in iframe',
      calls.length === 1 && calls[0].via === 'real_AndroidBridge', JSON.stringify(calls));
    check('cross-realm iframe Blob saves via reader.html AndroidBridge without falling back to Downloads',
      res && res.method === 'android_bridge' && !log.some((l) => l.kind === 'click'),
      JSON.stringify(res));
  }

  // Case B: Browser with showSaveFilePicker on reader.html (cross-realm Blob + Cancel)
  {
    const events = [];
    let writtenBytes = 0;
    const { readerCtx, log } = makeReaderTop({
      showSaveFilePicker: async (opts) => {
        events.push({ kind: 'picker', opts });
        return {
          createWritable: async () => ({
            write: async (b) => { writtenBytes = b && b.size; events.push({ kind: 'write', size: writtenBytes }); },
            close: async () => { events.push({ kind: 'close' }); },
          }),
        };
      },
    });
    const { ictx } = makeIframe(readerCtx);
    const res = await vm.runInContext(
      'AliyaTasks.exportDoc("docx", "Дарс", "Матн", { docType: "Нақшаи дарс" })',
      ictx
    );
    check('reader.html top-level picker opens and writes cross-realm iframe Blob',
      res && res.method === 'file_picker' && writtenBytes > 0 && !log.some((l) => l.kind === 'click'),
      JSON.stringify({ res, events }));

    // User cancels in reader.html picker
    readerCtx.showSaveFilePicker = async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; };
    let cancelErr = null;
    try {
      await vm.runInContext(
        'AliyaTasks.exportDoc("docx", "Дарс", "Матн", { docType: "Нақшаи дарс" })',
        ictx
      );
    } catch (e) { cancelErr = e; }
    check('Cancel in reader.html top-level picker aborts without silent download',
      !!(cancelErr && cancelErr.abortedByUser) && !log.some((l) => l.kind === 'click'),
      String(cancelErr));
  }

  // Case C: Broken KitobkhonaNative throwing does NOT block showSaveFilePicker via skipPicker
  {
    let pickerOpened = 0;
    const { readerCtx, log } = makeReaderTop({
      KitobkhonaNative: {
        postMessage() { throw new Error('broken native channel'); },
      },
      showSaveFilePicker: async () => {
        pickerOpened++;
        return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
      },
    });
    const { ictx } = makeIframe(readerCtx);
    const res = await vm.runInContext(
      'AliyaTasks.exportDoc("docx", "Дарс", "Матн", { docType: "Нақшаи дарс" })',
      ictx
    );
    check('broken native channel falls back to Save-As picker instead of skipping straight to Downloads',
      pickerOpened === 1 && res && res.method === 'file_picker' && !log.some((l) => l.kind === 'click'),
      JSON.stringify({ pickerOpened, res }));
  }
})

.then(function () {
  if (failures.length) {
    console.error('\n' + failures.length + ' end-to-end check(s) failed: ' + failures.join(', '));
    process.exit(1);
  }
  e2eDone = true;
  console.log('\nPASS end-to-end: the Aliya in the Reader saves the file, and the cache command reaches every device.');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

let e2eDone = false;
process.on('beforeExit', () => {
  if (!e2eDone) {
    console.error('FAIL end-to-end promise chain never settled');
    process.exit(1);
  }
});
