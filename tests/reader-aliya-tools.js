#!/usr/bin/env node
/**
 * Regression test for the Aliya panel that lives inside the reader
 * (aliya/reader-aliya.html).
 *
 * Issues this test locks down
 * ---------------------------
 * 1. The answer must expose working "Word" and "PDF" buttons that actually
 *    produce a file. The main chat (aliya/index.html) does this through
 *    addMessageActions -> AT.exportDoc(...); the reader panel must behave the
 *    same way, not render dead buttons.
 * 2. The reader theme toggle must switch day <-> night in ONE press.
 * 3. The reader zoom must be free (both axes follow the pinch), not locked so
 *    that the page only grows vertically while the text stays unreadable.
 *
 *   node tests/reader-aliya-tools.js
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
/* 1. Reader Aliya panel: the answer must carry working export tools    */
/* ------------------------------------------------------------------ */
const panelHtml = fs.readFileSync(path.join(ROOT, 'aliya/reader-aliya.html'), 'utf8');
const tasksSrc = fs.readFileSync(path.join(ROOT, 'aliya/aliya-tasks.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(ROOT, 'aliya/aliya-core.js'), 'utf8');

// The reader panel must load the modules the export path needs.
check('reader panel loads aliya-bridge.js', /aliya-bridge\.js/.test(panelHtml));
check('reader panel loads aliya-doc-templates.js', /aliya-doc-templates\.js/.test(panelHtml));
check('reader panel loads aliya-tasks.js', /aliya-tasks\.js/.test(panelHtml));

// The tools bar must offer Word and PDF, wired to the shared exportDoc.
check('export bar offers Word', /data-a="docx"/.test(tasksSrc));
check('export bar offers PDF', /data-a="pdf"/.test(tasksSrc));
check('export buttons call the shared exportDoc', /exportDoc\(a, docTitle, text, meta\)/.test(tasksSrc));

// The main chat and the reader panel must use the SAME export helper,
// otherwise the saved file differs between the two entry points.
check('main chat uses AT.exportDoc', /AT\.exportDoc\('docx'/.test(fs.readFileSync(path.join(ROOT, 'aliya/index.html'), 'utf8')));
check('reader panel uses the same exportDoc', /exportDoc\(a, docTitle, text, meta\)/.test(tasksSrc));

// exportDoc must be exported from AliyaTasks so both callers can reach it.
check('AliyaTasks exports exportDoc', /exportDoc:\s*exportDoc/.test(tasksSrc));

/* ------------------------------------------------------------------ */
/* 2. Reader theme toggle: day <-> night in one press                  */
/* ------------------------------------------------------------------ */
const readerSrc = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');

check('reader stores the theme choice', /kk_reader_theme/.test(readerSrc));
check('reader defines a theme setter', /function setTheme\(t\)/.test(readerSrc));

// setTheme must apply the theme directly — no "apply twice" state machine.
const setThemeBody = readerSrc.slice(readerSrc.indexOf('function setTheme(t)'));
const setThemeFn = setThemeBody.slice(0, setThemeBody.indexOf('\n  }'));
check('setTheme applies the theme directly', /syncReaderTheme\(t\)/.test(setThemeFn));
check('setTheme does not need a second press', !/setTheme\([^)]*\)\s*;?\s*setTheme\(/.test(setThemeFn));
// The reader has exactly two themes: day and night. "minimal" is a distraction
// setting, not a theme state — it must not appear in the theme list anymore.
check('setTheme clamps to the allowed themes', /READER_THEMES\.includes\(t\)/.test(setThemeFn));
check('reader themes are only light/dark', /const READER_THEMES = \['light', 'dark'\]/.test(readerSrc));
check('minimal theme is not offered in the settings panel', !/setTheme\('minimal'\)/.test(readerSrc));

// The toggle must switch light <-> dark in ONE press.
const toggleBody = readerSrc.slice(readerSrc.indexOf('function toggleReaderTheme()'));
const toggleFn = toggleBody.slice(0, toggleBody.indexOf('\n  }'));
check('theme toggle flips light/dark directly',
  /current === 'dark'\s*\?\s*'light'\s*:\s*'dark'/.test(toggleFn),
  toggleFn.replace(/\s+/g, ' ').slice(0, 160));
check('theme toggle does not cycle through a third theme',
  !/themes\[/.test(toggleFn) && !/'minimal'/.test(toggleFn));

// The toggle button must call setTheme with the opposite theme, once.
const themeToggle = readerSrc.match(/setTheme\(([^)]*)\)/g) || [];
check('theme is toggled from the UI', themeToggle.length >= 2, 'setTheme calls: ' + themeToggle.length);

/* ------------------------------------------------------------------ */
/* 3. Reader zoom must be free (both axes)                              */
/* ------------------------------------------------------------------ */
const applyView = readerSrc.slice(readerSrc.indexOf('function applyViewTo(cv, smooth)'));
const applyViewFn = applyView.slice(0, applyView.indexOf('\n  }'));
// The page must scale uniformly: the same factor on X and Y.
check('zoom scales both axes uniformly', /scale\(/.test(applyViewFn) && !/scaleX\(|scaleY\(/.test(applyViewFn));

// The pinch handler must zoom around the midpoint of the two fingers and must
// not lock one axis.
check('pinch zooms around the finger midpoint', /gesture\.mid0/.test(readerSrc) && /touchMid/.test(readerSrc));
check('pinch scales both axes around the fingers',
  /panX = m\.x - k1/.test(readerSrc) && /panY = m\.y - k1/.test(readerSrc));
check('pinch does not lock a single axis', !/zoomPanMode\s*=\s*true/.test(readerSrc));

// The upper zoom bound must be generous enough to read small print.
const zMax = readerSrc.match(/^\s*const Z_MIN = [\d.]+, Z_MAX = ([\d.]+)/m);
check('Z_MAX is declared', !!zMax);
if (zMax) {
  check('Z_MAX allows real magnification (>= 3)', Number(zMax[1]) >= 3, 'Z_MAX=' + zMax[1]);
}

// The zoom slider / exact-zoom prompt must offer the same generous range.
const zoomRange = readerSrc.match(/type="range" min="(\d+)" max="(\d+)"[^>]*oninput="setZoom/);
check('zoom slider covers the free range', !!zoomRange && Number(zoomRange[2]) >= 300,
  zoomRange ? zoomRange[0] : 'not found');
check('exact zoom prompt accepts the free range', /Фоизи андозаро ворид кунед \(50–400\)/.test(readerSrc));

// The canvas must be re-rendered at the new scale instead of only being
// CSS-scaled (a CSS scale of a small canvas keeps the text blurry/unreadable).
check('zoom triggers a real re-render', /renderPage\(page/.test(readerSrc));
check('render uses device pixel ratio for crisp text', /devicePixelRatio/.test(readerSrc));
// After a pinch the page must be re-rendered so the text stays sharp.
check('pinch commit re-renders the page', /pinchCommitted[\s\S]{0,200}renderPage\(page, 0\)/.test(readerSrc));

/* ------------------------------------------------------------------ */
/* 4. The reader Aliya panel must not be able to hang                   */
/* ------------------------------------------------------------------ */
check('reader panel aborts the task when leaving', /pagehide[\s\S]{0,120}abort/.test(panelHtml));

if (failures.length) {
  console.error('\n' + failures.length + ' reader/aliya check(s) failed: ' + failures.join(', '));
  process.exit(1);
}
console.log('\nPASS reader Aliya tools: export buttons wired, one-press theme toggle, free uniform zoom.');
