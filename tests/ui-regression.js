const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const homeCss = read('assets/css/home-desktop.css');
const navCss = read('assets/css/desktop-sidebar.css');
const aliyaDesktop = read('aliya/aliya-desktop.css');
const aliyaHtml = read('aliya/index.html');
const reader = read('reader.html');
const client = read('aliya/aliya-core.js');
const sw = read('sw.js');
// v171: The home grid was redesigned to a 5-column equal layout; the old
// 1.2fr/.8fr two-column ratio no longer exists. Assert the current design.
assert.match(homeCss, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
assert.match(homeCss, /object-fit:contain !important/);
assert.match(homeCss, /-webkit-line-clamp:unset !important/);
assert.match(homeCss, /body\.kkh-dnav-open \.main-content\s*\{\s*left:292px/);
// The reader is a full-screen fixed overlay, so the sidebar only needs to
// shift its toggle button — the old full-width offset rule no longer applies.
assert.match(navCss, /body\.kkh-dnav-open:has\(\.reader-wrapper\)\s*\.kkh-dnav-toggle\{left:274px/);
// v171: The Aliya desktop "tools" drawer was replaced by a fixed 250 px sidebar
// (the tab strip itself), so there is no tools-open state any more.
assert.match(aliyaDesktop, /\.aliya-header\s*\{[^}]*left:284px/s);
assert.match(aliyaDesktop, /\.aliya-tabs-bar\s*\{[^}]*width:250px/s);
assert.match(aliyaHtml, /class="aliya-tabs-bar"/);
// Reader→Aliya is now an iframe overlay (aliya/reader-aliya.html), not a modal.
assert.match(reader, /openAliyaOverlay/);
assert.match(reader, /aliya\/reader-aliya\.html/);
assert.match(reader, /__kkCloseAliya/);
// v171: The client timeout must cover the gateway's worst case, and the retry
// loop must stay bounded (the "Aliya thinks forever" bug).
assert.match(client, /REQUEST_TIMEOUT_MS = 150000/);
assert.match(client, /var MAX_ATTEMPTS = 2/);
assert.match(client, /chat_deadline_exceeded/);
assert.match(client, /for \(var attempt = 0; attempt < MAX_ATTEMPTS; attempt\+\+\)/);
assert.match(read('aliya/aliya-ui.css'), /aliya-wait-emblem[^}]*width:76px/);
// v171: the waiting indicator shows elapsed seconds so the user can see Aliya is working.
assert.match(read('aliya/aliya-ui.css'), /\.at-think-secs\{/);
// v171: assert the cache-name pattern, not one hardcoded version.
assert.match(sw, /kitobkhona-v\d+[-\w]*/);
console.log('PASS UI regression: responsive quote/photo, layout-aware desktop navigation, iframe Reader→Aliya, contextual tools, safe bounded retries.');
