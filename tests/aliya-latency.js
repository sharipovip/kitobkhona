/* Dependency-free regression test for the "Aliya thinks forever" problem.
 *
 *   node tests/aliya-latency.js
 *
 * History of the bug
 * ------------------
 * 1. The web client always asked for reasoning_mode:"high". On the gateway that
 *    flag (a) raises eff_max_tokens to 1800, (b) forces a live web search for
 *    every question of >= 14 characters and (c) makes Gemini spend a 768-token
 *    thinking budget. The gateway then walks its whole fallback chain
 *    (search ~4s + Gemini 2x20s + extra providers 12s each + HF Router 9s x 6),
 *    which can exceed two minutes.
 * 2. The client timeout was 60s, i.e. shorter than the server could ever take
 *    -> every request ended in "server took too long".
 * 3. On top of that the client retried up to 3 times, restarting the entire
 *    server-side chain each time -> up to 3+ minutes of spinner.
 * 4. aliya-tasks.js (the "render"/task panels) had the same pattern with a
 *    150s timeout and 3 attempts.
 *
 * The fix bounds the total waiting time, keeps the request cheap enough to
 * succeed, and reports a clear error instead of spinning.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const store = new Map();

global.window = global;
global.document = { addEventListener() {} };
global.indexedDB = null;
global.localStorage = {
  getItem(k) { return store.get(k) || null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
};

/* ------------------------------------------------------------------ */
/* Fake gateway                                                        */
/* ------------------------------------------------------------------ */
const calls = [];
let mode = 'ok';           // 'ok' | 'unavailable' | 'timeout' | 'network'
let sleep = (ms) => new Promise((r) => setTimeout(r, ms));

global.fetch = async (url, options) => {
  const p = new URL(url).pathname;
  const payload = JSON.parse(options.body || '{}');
  calls.push({ path: p, payload, at: Date.now() });

  if (mode === 'timeout') {
    // Never resolve on our own: the client timeout must fire and abort it.
    return new Promise((_resolve, reject) => {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (options.signal) {
        if (options.signal.aborted) onAbort();
        else options.signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
  if (mode === 'network') throw new TypeError('Failed to fetch');

  if (p === '/v1/chat') {
    if (mode === 'unavailable') {
      return { ok: true, status: 200, json: async () => ({ reply: '', error: 'chat_providers_unavailable' }) };
    }
    if (mode === 'deadline') {
      return { ok: true, status: 200, json: async () => ({ reply: '', error: 'chat_deadline_exceeded' }) };
    }
    return { ok: true, status: 200, json: async () => ({ reply: 'Ҷавоби Алия.' }) };
  }
  return { ok: true, status: 200, json: async () => ({ reply: 'ok' }) };
};

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-doc-templates.js'), 'utf8'), { filename: 'aliya-doc-templates.js' });
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'aliya/aliya-core.js'), 'utf8'), { filename: 'aliya-core.js' });

const failures = [];
function check(name, cond, detail) {
  if (cond) console.log('PASS ' + name);
  else { console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name); }
}

(async () => {
  await AliyaCore.init();

  /* ---------------------------------------------------------------- */
  /* 1. The request must be cheap enough to actually come back.         */
  /* ---------------------------------------------------------------- */
  calls.length = 0;
  mode = 'ok';
  await AliyaCore.sendMessage('Расскажи мне о «Шоҳнома» Фирдавсӣ подробно и со всеми деталями');
  const chat = calls.find((c) => c.path === '/v1/chat');
  check('chat request was sent', !!chat);

  check(
    'deep mode does not use reasoning_mode "high"',
    chat.payload.reasoning_mode !== 'high',
    'reasoning_mode=' + chat.payload.reasoning_mode
  );
  check(
    'deep mode uses a bounded max_tokens',
    chat.payload.max_tokens <= 4096,
    'max_tokens=' + chat.payload.max_tokens
  );

  /* ---------------------------------------------------------------- */
  /* 2. Provider outage must not be retried forever.                   */
  /* ---------------------------------------------------------------- */
  calls.length = 0;
  mode = 'unavailable';
  await assert.rejects(
    () => AliyaCore.sendMessage('Саволи санҷишӣ'),
    /провайдерҳои зеҳни сунъӣ ҷавоб намедиҳанд/i
  );
  check(
    'provider outage is retried at most twice',
    calls.length <= 2,
    'attempts=' + calls.length
  );

  /* ---------------------------------------------------------------- */
  /* 3. A hanging server must be cut off and reported clearly.          */
  /* ---------------------------------------------------------------- */
  calls.length = 0;
  mode = 'timeout';
  const started = Date.now();
  let timeoutError = null;
  try {
    // 1.5s test timeout instead of the production 150s.
    await AliyaCore.sendMessage('Саволи овезиш', { timeoutMs: 1500 });
  } catch (e) {
    timeoutError = e;
  }
  const elapsed = Date.now() - started;
  check('hanging request is aborted', !!timeoutError && timeoutError.code === 'timeout',
    timeoutError && (timeoutError.code + ': ' + timeoutError.message));
  check(
    'hanging request is cut off quickly',
    elapsed < 15000,
    'elapsed=' + elapsed + 'ms for ' + calls.length + ' attempt(s)'
  );
  check(
    'hanging request is not retried endlessly',
    calls.length === 1,
    'attempts=' + calls.length
  );

  /* ---------------------------------------------------------------- */
  /* 3b. Gateway chat_deadline_exceeded must not trigger a retry.       */
  /* ---------------------------------------------------------------- */
  calls.length = 0;
  mode = 'deadline';
  let deadlineErr = null;
  try {
    await AliyaCore.sendMessage('Саволи дедлайн');
  } catch (e) {
    deadlineErr = e;
  }
  check('gateway deadline error is reported', !!deadlineErr && deadlineErr.code === 'chat_deadline_exceeded',
    deadlineErr && (deadlineErr.code + ': ' + deadlineErr.message));
  check('gateway deadline error is NOT retried', calls.length === 1, 'attempts=' + calls.length);

  /* ---------------------------------------------------------------- */
  /* 4. Network failure must be reported, not swallowed.                */
  /* ---------------------------------------------------------------- */
  calls.length = 0;
  mode = 'network';
  let netError = null;
  try {
    await AliyaCore.sendMessage('Саволи санҷишӣ');
  } catch (e) {
    netError = e;
  }
  check('network failure is reported', !!netError && /пайваст нашуд/i.test(netError.message),
    netError && netError.message);
  check('network failure is retried at most twice', calls.length <= 2, 'attempts=' + calls.length);

  mode = 'ok';

  /* ---------------------------------------------------------------- */
  /* 5. The production timeout must be long enough for the gateway.     */
  /* ---------------------------------------------------------------- */
  const coreSrc = fs.readFileSync(path.join(ROOT, 'aliya/aliya-core.js'), 'utf8');
  const timeoutMatch = coreSrc.match(/var REQUEST_TIMEOUT_MS\s*=\s*(\d+)/);
  check('REQUEST_TIMEOUT_MS is declared', !!timeoutMatch);
  const requestTimeout = timeoutMatch ? Number(timeoutMatch[1]) : 0;
  // The gateway's worst case is search(4) + Gemini(2x20) + providers(12 each)
  // + HF Router(6x9) => well over 120s. A 60s budget could never succeed.
  check('REQUEST_TIMEOUT_MS covers the gateway worst case', requestTimeout >= 150000,
    'REQUEST_TIMEOUT_MS=' + requestTimeout);
  check('attempt count is bounded to a small number',
    /var MAX_ATTEMPTS\s*=\s*(\d+)/.test(coreSrc) && Number(coreSrc.match(/var MAX_ATTEMPTS\s*=\s*(\d+)/)[1]) <= 2);

  /* ---------------------------------------------------------------- */
  /* 6. aliya-tasks.js (the task/render panels) must be bounded too.    */
  /* ---------------------------------------------------------------- */
  const tasksSrc = fs.readFileSync(path.join(ROOT, 'aliya/aliya-tasks.js'), 'utf8');
  const tasksLoop = tasksSrc.match(/for\s*\(\s*var attempt\s*=\s*0;\s*attempt\s*<\s*(\d+)/);
  check('task panel retry loop is bounded to <= 2', !!tasksLoop && Number(tasksLoop[1]) <= 2,
    tasksLoop ? 'attempts=' + tasksLoop[1] : 'loop not found');
  check('task panel does not force reasoning_mode "high"',
    !/reasoning_mode:\s*['"]high['"]/.test(tasksSrc));

  // The render panels chain up to three chat() calls; without an overall budget
  // that is 3 x 120 s of "thinking" for a single panel.
  const budgetMatch = tasksSrc.match(/var TASK_BUDGET_MS\s*=\s*(\d+)/);
  check('task panel has an overall time budget', !!budgetMatch);
  const budget = budgetMatch ? Number(budgetMatch[1]) : 0;
  check('task budget is sane (<= 5 minutes)', budget > 0 && budget <= 300000, 'TASK_BUDGET_MS=' + budget);
  check('task budget is applied to the chat call', /timeoutMs:\s*Math\.max\([^)]*budgetLeft\(\)/.test(tasksSrc));
  check('continuation loop respects the budget', /budgetLeft\(\)\s*<=\s*0\)\s*break/.test(tasksSrc));

  /* ---------------------------------------------------------------- */
  /* 7. The thinking indicator must show elapsed time & hard watchdogs. */
  /* ---------------------------------------------------------------- */
  const aliyaHtml = fs.readFileSync(path.join(ROOT, 'aliya/index.html'), 'utf8');
  const readerAliyaHtml = fs.readFileSync(path.join(ROOT, 'aliya/reader-aliya.html'), 'utf8');
  check('thinking indicator shows elapsed seconds', /at-think-secs/.test(aliyaHtml));
  check('task runner also shows elapsed seconds', /at-think-secs/.test(tasksSrc));
  check('task runner arms a hard deadline timer and budget race',
    /hardDeadlineTimer/.test(tasksSrc) && /budgetPromise/.test(tasksSrc));
  check('task runner binds card from holder.firstElementChild in append mode',
    /cfg\.append\s*\?\s*holder\.firstElementChild\s*:\s*box\.firstChild/.test(tasksSrc));
  check('loadPdf enforces a fetch stall timeout and getDocument timeout',
    /stallTimer/.test(tasksSrc) && /docTimer/.test(tasksSrc));
  check('reader-aliya resets _appendTarget across new tasks and rejects non-PDF books',
    /delete runCfg\._appendTarget/.test(readerAliyaHtml) && /epub\|fb2\|djvu/.test(readerAliyaHtml));
  check('aliya/index.html arms a chatWatchdog and passes ui.signal to ensureTaskBook',
    /chatWatchdog/.test(aliyaHtml) && /ensureTaskBook\(null,\s*ui\)/.test(aliyaHtml));
  const css = fs.readFileSync(path.join(ROOT, 'aliya/aliya-ui.css'), 'utf8');
  check('elapsed-seconds style exists', /\.at-think-secs/.test(css));

  if (failures.length) {
    console.error('\n' + failures.length + ' Aliya latency check(s) failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('\nPASS Aliya latency: bounded timeout, bounded retries, no forced "high" reasoning, visible elapsed time.');
})().catch((e) => { console.error(e); process.exit(1); });
