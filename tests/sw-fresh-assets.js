#!/usr/bin/env node
/**
 * The Service Worker must deliver the NEW JavaScript, not the stale one.
 *
 *   node tests/sw-fresh-assets.js
 *
 * The bug
 * -------
 * The Aliya in the Reader kept saying "интихоби папкаро гиред" even after
 * the fix (v180) had been merged and deployed. The reason was NOT in the
 * save logic — it was in the delivery:
 *
 *   • on `install` the worker precached './aliya/aliya-bridge.js' (NO ?v=);
 *   • the runtime handler for .js/.css looked the request up with
 *     `{ignoreSearch: true}`, so 'aliya-bridge.js?v=180' matched that
 *     precached entry;
 *   • the network response was only cached UNDER the ?v= key, so the
 *     no-query entry was never refreshed;
 *
 * Result: the user always got the file from the moment the worker was
 * installed. The "?v=180" cache-busting query did nothing at all.
 *
 * The fix
 * -------
 *   • .js/.css are served NETWORK-FIRST: the network answer wins and the
 *     cache entry is refreshed under BOTH the query and the bare URL;
 *   • the `install` step precaches each asset under both key forms;
 *   • the client asks the browser for a worker update on every page load
 *     (browsers otherwise only check sw.js once every 24 hours).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
function check(name, cond, detail) {
  if (cond) console.log('PASS ' + name);
  else { console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name); }
}

const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');

/* ------------------------------------------------------------------ */
/* 1. The JS/CSS handler must be network-first                        */
/* ------------------------------------------------------------------ */
{
  const i = swSrc.indexOf("url.pathname.endsWith('.js')");
  const j = swSrc.indexOf('return;\n  }', i);
  const block = swSrc.slice(i, j > i ? j : i + 2000);

  check('the JS/CSS handler exists', i >= 0);
  check('the JS/CSS handler fetches from the network first',
    /fetch\(event\.request/.test(block), block.slice(0, 200));
  check('the JS/CSS handler does NOT serve the cache before the network',
    !/return cached\|\|await network/.test(block),
    'the cache still wins over the network');
  check('the JS/CSS handler returns the fresh network response',
    /return fresh/.test(block), block.slice(0, 300));
  check('the JS/CSS handler falls back to the cache when offline',
    /cache\.match/.test(block), 'no offline fallback');
  check('the JS/CSS handler refreshes the cache under the bare URL too',
    /url\.pathname/.test(block) && /cache\.put\(bare/.test(block),
    'the no-query cache entry is never refreshed');
  check('the JS/CSS handler falls back to cached assets if network stalls',
    /Promise\.race/.test(block) && /setTimeout/.test(block) && /if\(cached\)return cached/.test(block),
    'slow network on JS/CSS could hang page startup forever');
  check('the JS/CSS handler clones the response before awaiting cache.put',
    /copy1=response\.clone\(\),copy2=response\.clone\(\)/.test(block));
}

/* ------------------------------------------------------------------ */
/* 2. The install step must precache both key forms                   */
/* ------------------------------------------------------------------ */
{
  const i = swSrc.indexOf("self.addEventListener('install'");
  const j = swSrc.indexOf("self.addEventListener('activate'", i);
  const block = swSrc.slice(i, j > i ? j : i + 3000);

  check('the install step stores each asset twice (with and without ?v=)',
    /bare\+'\?v=/.test(block),
    'the ?v= variant is never stored');
  check('the install step stores the bare URL as well',
    /cache\.put\(bare/.test(block), 'the bare URL is never stored');
}

/* ------------------------------------------------------------------ */
/* 3. The client must ask for a worker update on every page load      */
/* ------------------------------------------------------------------ */
{
  check('the client triggers reg.update() on page load',
    /reg\.update\(\)/.test(configSrc),
    'the browser only checks sw.js once every 24 hours');
  const i = configSrc.indexOf('SW update toast');
  const block = configSrc.slice(i, i + 1200);
  check('the update check sits next to the update toast',
    /reg\.update/.test(block), 'the update check is somewhere else');
}

/* ------------------------------------------------------------------ */
/* 4. The cache name must change so the old cache is dropped          */
/* ------------------------------------------------------------------ */
{
  const m = swSrc.match(/const CACHE_NAME\s*=\s*'([^']+)'/);
  check('the worker has a versioned cache name', !!m);
  check('the cache name is newer than the broken v180 one',
    m && m[1] !== 'kitobkhona-v180-aliya-picker-top-window',
    m ? m[1] : 'not found');
  const n = m && m[1].match(/v(\d+)/);
  check('the cache version was bumped', n && Number(n[1]) >= 181,
    m ? m[1] : 'not found');
}

/* ------------------------------------------------------------------ */
/* 5. The Aliya save wording must no longer promise a folder prompt   */
/* ------------------------------------------------------------------ */
{
  const tasksSrc = fs.readFileSync(path.join(ROOT, 'aliya', 'aliya-tasks.js'), 'utf8');
  check('the old wording is gone from the product code',
    !/интихоби папкаро гиред/.test(tasksSrc),
    'the toast still tells the user to choose a folder');
  const bridgeSrc = fs.readFileSync(path.join(ROOT, 'aliya', 'aliya-bridge.js'), 'utf8');
  check('the bridge opens the picker in the top window',
    /pickerWindows/.test(bridgeSrc) && /window\.top/.test(bridgeSrc));
}

/* ------------------------------------------------------------------ */
/* 6. The delivery must actually deliver (simulation)                 */
/* ------------------------------------------------------------------ */
{
  // Simulate the worker cache the way the browser would, then check which
  // body a device asking for '?v=181' receives.
  const i = swSrc.indexOf("url.pathname.endsWith('.js')");
  const j = swSrc.indexOf('return;\n  }', i);
  const block = swSrc.slice(i, j > i ? j : i + 2000);
  const networkFirst = /return fresh/.test(block) && !/return cached\|\|await network/.test(block);

  const store = new Map();
  store.set('/aliya/aliya-bridge.js', 'STALE');       // precached at install
  const request = '/aliya/aliya-bridge.js?v=181';
  const networkBody = 'FRESH';

  let served;
  if (networkFirst) {
    served = networkBody;
    store.set(request, networkBody);
    store.set('/aliya/aliya-bridge.js', networkBody);
  } else {
    const hit = [...store.keys()].find((k) =>
      new URL(k, 'https://x').pathname === new URL(request, 'https://x').pathname);
    served = hit ? store.get(hit) : networkBody;
  }
  check('a device asking for the new version receives the NEW file',
    served === networkBody,
    'the device received: ' + served);
}

/* ------------------------------------------------------------------ */
/* 7. Subpath precaching, HTTP cache bypass, and SW updateViaCache     */
/* ------------------------------------------------------------------ */
{
  const installStart = swSrc.indexOf("self.addEventListener('install'");
  const installEnd = swSrc.indexOf("self.addEventListener('activate'", installStart);
  const installBlock = swSrc.slice(installStart, installEnd);
  check('install resolves precache URLs relative to registration.scope (GitHub Pages subpath safe)',
    /registration\.scope/.test(installBlock) && !/\.replace\(\/\^\\\.\\\/\/,/.test(installBlock),
    'install must not rewrite ./ to / and break /kitobkhona/ subpath');

  const navStart = swSrc.indexOf("event.request.mode === 'navigate'");
  const navEnd = swSrc.indexOf('return;\n  }', navStart);
  const navBlock = swSrc.slice(navStart, navEnd);
  check('navigate fetch bypasses stale HTTP disk cache',
    /fetch\(event\.request,\s*\{\s*cache:\s*'no-cache'\s*\}\)/.test(navBlock));
  check('navigate gives reader.html and aliya/ pages enough time for fresh HTML',
    /reader\\\.html/.test(navBlock) && /aliya/.test(navBlock));

  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const readerHtml = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
  const readerAliyaHtml = fs.readFileSync(path.join(ROOT, 'aliya', 'reader-aliya.html'), 'utf8');
  const aliyaIndexHtml = fs.readFileSync(path.join(ROOT, 'aliya', 'index.html'), 'utf8');
  check('config.js registers sw.js with updateViaCache: none',
    /updateViaCache:\s*'none'/.test(configSrc));
  check('index.html registers sw.js with updateViaCache: none',
    /updateViaCache:\s*'none'/.test(indexHtml));
  check('reader.html cache-busts the reader-aliya.html iframe URL',
    /reader-aliya\.html\?embed=1&v=\d+/.test(readerHtml));
  check('aliya/reader-aliya.html checks for Service Worker updates',
    /serviceWorker\.getRegistration/.test(readerAliyaHtml));
  check('aliya/index.html checks for Service Worker updates',
    /serviceWorker\.getRegistration/.test(aliyaIndexHtml));
}

if (failures.length) {
  console.error('\n' + failures.length + ' service-worker check(s) failed: ' + failures.join(', '));
  process.exit(1);
}
console.log('\nPASS service worker: new JavaScript reaches the device.');
