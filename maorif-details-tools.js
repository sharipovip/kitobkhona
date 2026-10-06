(function () {
  'use strict';
  if (window.__MAORIF_DETAILS_TOOLS_READY__) return;

  const config = window.MAORIF_QUIZ_CONFIG;
  const main = document.querySelector('main');
  if (!config || !main) return;
  window.__MAORIF_DETAILS_TOOLS_READY__ = true;
  const articles = Array.from(main.querySelectorAll('article.guide-page, article.detail-page'));
  const safeTitle = document.querySelector('h1')?.textContent?.trim() || config.title || 'Маълумоти муфассал';
  const quizKeyPrefix = 'maorif-quiz-v1:';
  const attemptsKey = quizKeyPrefix + config.id;
  let localStore = null;
  try { localStore = window.localStorage; } catch (e) { localStore = null; }
  let storagePersistent = Boolean(localStore);
  // Use the Android app's native system chooser when its bridge is available.
  try {
    if (window.KitobkhonaNative && typeof window.KitobkhonaNative.postMessage === 'function') {
      const bridge = window.AndroidBridge || {};
      if (typeof bridge.shareText !== 'function') {
        bridge.shareText = (text, title) => window.KitobkhonaNative.postMessage(JSON.stringify({ method: 'shareText', args: [text, title] }));
      }
      if (typeof bridge.openExternalUrl !== 'function') {
        bridge.openExternalUrl = url => window.KitobkhonaNative.postMessage(JSON.stringify({ method: 'openExternalUrl', args: [url] }));
      }
      window.AndroidBridge = bridge;
    }
  } catch (e) {}
  const memoryStore = new Map();
  const readStored = key => {
    try { if (localStore) { const value = localStore.getItem(key); if (value !== null) return value; } } catch (e) { storagePersistent = false; }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  };
  const writeStored = (key, value) => {
    const text = String(value);
    memoryStore.set(key, text);
    try { if (localStore) localStore.setItem(key, text); } catch (e) { storagePersistent = false; }
  };
  const storedKeys = () => {
    const keys = new Set(memoryStore.keys());
    try { if (localStore) for (let i = 0; i < localStore.length; i++) { const key = localStore.key(i); if (key) keys.add(key); } } catch (e) { storagePersistent = false; }
    return Array.from(keys);
  };
  const statusText = (node, text) => { if (node) node.textContent = text; };

  const css = `
    .maorif-tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:10px;margin:14px 0 20px;padding:12px;border:1px solid rgba(232,201,109,.3);border-radius:16px;background:rgba(20,34,51,.9)}
    .maorif-font-tools,.maorif-share-tools{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
    .maorif-tool-label{width:100%;color:var(--muted,#aeb9c7);font-size:10px;font-weight:800}
    .maorif-tools button,.section-tools button,.quiz-card button,.internal-browser button,.copy-modal button{min-height:34px;padding:7px 10px;border:1px solid rgba(232,201,109,.32);border-radius:10px;background:rgba(232,201,109,.1);color:var(--gold,#e8c96d);font:800 11px system-ui;cursor:pointer}
    .maorif-tools button:focus-visible,.section-tools button:focus-visible,.quiz-card button:focus-visible,.internal-browser button:focus-visible,.copy-modal button:focus-visible{outline:2px solid #4c9dff;outline-offset:2px}
    .maorif-font-tools button{min-width:38px;font-size:13px}.maorif-font-tools output{min-width:42px;color:#fff;text-align:center;font-size:11px;font-weight:850}
    .maorif-share-tools{justify-content:flex-start}.maorif-share-tools .share-main{background:linear-gradient(135deg,#e8c96d,#b88b34);color:#141b22;border-color:transparent}
    .maorif-selection-status{flex-basis:100%;min-height:16px;color:var(--muted,#aeb9c7);font-size:10px}
    .section-tools{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:7px;margin:0 0 11px;padding:8px 9px;border:1px solid rgba(232,201,109,.16);border-radius:11px;background:rgba(7,16,27,.25)}
    .section-tools label{display:flex;align-items:center;gap:7px;color:var(--muted,#aeb9c7);font-size:10px;font-weight:750;cursor:pointer}.section-tools input{width:17px;height:17px;accent-color:#2e83ff}
    .section-tools button{min-height:30px;padding:5px 8px;font-size:10px}
    main article.guide-page p,main article.detail-page p{font-size:calc(13px * var(--maorif-text-scale,1))!important}
    main article.guide-page li,main article.detail-page li{font-size:calc(12px * var(--maorif-text-scale,1))!important}
    main article.guide-page h2,main article.detail-page h2{font-size:calc(20px * var(--maorif-text-scale,1))!important}
    main article .keyline{font-size:calc(13px * var(--maorif-text-scale,1))!important}
    .quiz-jump-card{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0 18px;padding:12px 14px;border:1px solid rgba(57,139,255,.32);border-radius:14px;background:linear-gradient(120deg,rgba(24,73,128,.24),rgba(20,34,51,.9))}.quiz-jump-copy{display:grid;gap:3px}.quiz-jump-card strong{color:#d7e9ff;font-size:12px}.quiz-jump-card span{color:var(--muted,#aeb9c7);font-size:10px;line-height:1.45}.quiz-jump-card a{flex:0 0 auto;padding:8px 10px;border-radius:9px;background:#1768cb;color:#fff;font-size:10px;font-weight:850;text-decoration:none}.quiz-jump-card a:focus-visible{outline:2px solid #9bc7ff;outline-offset:2px}
    .quiz-card{margin:24px 0 14px;padding:18px;border:1px solid rgba(232,201,109,.32);scroll-margin-top:72px;border-radius:18px;background:linear-gradient(150deg,rgba(26,44,64,.98),rgba(15,27,41,.98));box-shadow:0 12px 34px rgba(0,0,0,.18)}
    .quiz-card h2{margin:0 0 7px;color:var(--gold,#e8c96d);font:700 22px/1.2 Georgia,'Times New Roman',serif}.quiz-intro,.quiz-note{color:var(--muted,#aeb9c7);font-size:12px;line-height:1.55}
    .quiz-topline{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:14px 0 8px}.quiz-progress-label{color:#fff;font-size:11px;font-weight:850}.quiz-progress{height:7px;overflow:hidden;border-radius:10px;background:rgba(255,255,255,.11)}.quiz-progress>span{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#398bff,#75b7ff);transition:width .2s}
    .quiz-topic{display:inline-block;margin:12px 0 6px;padding:5px 8px;border:1px solid rgba(232,201,109,.24);border-radius:99px;color:#ecd991;font-size:10px;font-weight:800}.quiz-question{margin:5px 0 12px;color:#fff;font-size:16px;line-height:1.45;font-weight:800}
    .quiz-options{display:grid;gap:8px}.quiz-option{width:100%;text-align:left;line-height:1.45;background:rgba(255,255,255,.045)!important;color:#f4f0e8!important;border-color:rgba(255,255,255,.16)!important}.quiz-option:hover:not(:disabled){background:rgba(255,255,255,.09)!important}.quiz-option:disabled{cursor:default;opacity:1}.quiz-option.is-correct{background:#1261c9!important;border-color:#57a2ff!important;color:#fff!important}.quiz-option.is-wrong{background:#b42330!important;border-color:#ff727d!important;color:#fff!important}
    .quiz-feedback{min-height:26px;margin:11px 0;color:#fff;font-size:12px;font-weight:750;line-height:1.5}.quiz-feedback.good{color:#9bc7ff}.quiz-feedback.bad{color:#ff9aa1}.quiz-explanation{margin:0 0 10px;color:var(--muted,#aeb9c7);font-size:11px;line-height:1.5}.quiz-next{margin-top:5px}.quiz-results{margin-top:13px;padding:14px;border:1px solid rgba(46,131,255,.42);border-radius:13px;background:rgba(46,131,255,.09)}.quiz-results h3{margin:0 0 7px;color:#d6e8ff;font-size:16px}.quiz-score{font-size:25px;font-weight:900;color:#fff}.quiz-results p{margin:6px 0;color:#e7e8e8;font-size:12px;line-height:1.5}.quiz-results ul{margin:6px 0;padding-left:20px;color:#e7e8e8;font-size:11px;line-height:1.5}.quiz-results a{color:#95c5ff}
    .compare-table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px}.compare-table th,.compare-table td{padding:6px 5px;border-bottom:1px solid rgba(255,255,255,.12);text-align:left}.compare-table th{color:#eddb9e}
    .internal-browser,.copy-modal{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:10px;background:rgba(2,8,15,.82);backdrop-filter:blur(5px)}.internal-browser[hidden],.copy-modal[hidden]{display:none!important}
    .internal-browser-panel,.copy-modal-panel{width:min(900px,100%);height:min(92vh,900px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(232,201,109,.38);border-radius:18px;background:#101f30;box-shadow:0 20px 70px rgba(0,0,0,.5)}
    .internal-browser-head{display:flex;align-items:center;gap:8px;padding:10px;border-bottom:1px solid rgba(232,201,109,.2)}.internal-browser-head strong{flex:1;color:#f6e6b4;font-size:12px}.internal-browser-head button{min-width:36px}.internal-browser-url{overflow:hidden;padding:6px 11px;color:#aeb9c7;font-size:10px;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,.08)}.internal-browser iframe{width:100%;flex:1;border:0;background:#fff}.internal-browser-help{padding:8px 11px;color:#aeb9c7;font-size:10px;line-height:1.4}.internal-browser-help a{color:#e8c96d;font-weight:800}
    .copy-modal-panel{height:auto;max-height:90vh;padding:14px}.copy-modal h2{margin:0 0 8px;color:#e8c96d;font-size:16px}.copy-modal p{color:#aeb9c7;font-size:11px}.copy-modal textarea{width:100%;min-height:190px;resize:vertical;padding:10px;border:1px solid rgba(232,201,109,.28);border-radius:10px;background:#0c1825;color:#f4f0e8;font:12px/1.5 system-ui}.copy-modal-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
    @media(max-width:620px){.maorif-tools{grid-template-columns:1fr;gap:10px;padding:10px}.maorif-share-tools{gap:5px}.section-tools{align-items:flex-start}.section-tools label{flex:1;min-width:180px}.quiz-jump-card{align-items:flex-start;flex-direction:column}.quiz-jump-card a{width:100%;text-align:center}.quiz-card{padding:14px}.quiz-question{font-size:15px}.internal-browser{padding:0}.internal-browser-panel{width:100%;height:100dvh;max-height:100dvh;border-radius:0}.internal-browser-head{padding-top:calc(10px + env(safe-area-inset-top))}.copy-modal{padding:10px}.copy-modal-panel{width:100%}}
    @media print{.maorif-tools,.section-tools,.quiz-card,.quiz-jump-card,.internal-browser,.copy-modal{display:none!important}main article.guide-page p,main article.detail-page p{font-size:10.4pt!important}main article.guide-page li,main article.detail-page li{font-size:10pt!important}main article.guide-page h2,main article.detail-page h2{font-size:17pt!important}}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const toolbar = document.createElement('section');
  toolbar.className = 'maorif-tools';
  toolbar.setAttribute('aria-label', 'Танзими хондан ва мубодила');
  toolbar.innerHTML = `
    <div class="maorif-font-tools">
      <span class="maorif-tool-label">Андозаи матн — танҳо матни бахшҳо</span>
      <button type="button" data-font="down" aria-label="Хурд кардани матн">A−</button>
      <output data-font-label>100%</output>
      <button type="button" data-font="up" aria-label="Калон кардани матн">A+</button>
      <button type="button" data-font="reset">Аз нав</button>
    </div>
    <div class="maorif-share-tools">
      <span class="maorif-tool-label">Мубодилаи тамоми маълумот ё қисмҳои интихобшуда</span>
      <button type="button" data-select-all>Ҳамаи қисмҳо</button>
      <button type="button" data-clear-all>Тоза кардан</button>
      <button type="button" class="share-main" data-share-selected>Мубодила</button>
      <span class="maorif-selection-status" data-selection-status aria-live="polite">Қисмҳои интихобшуда: 0</span>
    </div>`;
  const notice = main.querySelector('.notice');
  const contents = main.querySelector('.contents');
  main.insertBefore(toolbar, notice ? notice.nextSibling : (contents || articles[0]));

  const quizCount = Array.isArray(config.questions) ? config.questions.length : 0;
  const quizJump = document.createElement('section');
  quizJump.className = 'quiz-jump-card';
  quizJump.setAttribute('aria-label', 'Гузариш ба санҷиши дониш');
  quizJump.innerHTML = `<div class="quiz-jump-copy"><strong>Санҷиши дониш — дастрас аз аввали саҳифа</strong><span>${quizCount} савол. Викторинаи пурра дар поёни мавод низ ҷойгир аст; ин тугма шуморо рост ба он мебарад.</span></div><a href="#self-check-quiz">Ба санҷиш гузаштан ↓</a>`;
  main.insertBefore(quizJump, contents || articles[0]);

  // Text-only enlargement: the page layout and controls do not scale.
  const fontLabel = toolbar.querySelector('[data-font-label]');
  const fontStorageKey = 'maorif-detail-font-scale-v1';
  let fontScale = 1;
  try { fontScale = Number(readStored(fontStorageKey) || 1) || 1; } catch (e) { fontScale = 1; }
  const setFontScale = value => {
    fontScale = Math.max(.9, Math.min(1.5, Math.round(value * 20) / 20));
    document.documentElement.style.setProperty('--maorif-text-scale', String(fontScale));
    statusText(fontLabel, Math.round(fontScale * 100) + '%');
    writeStored(fontStorageKey, fontScale);
  };
  setFontScale(fontScale);
  toolbar.querySelector('[data-font="up"]').addEventListener('click', () => setFontScale(fontScale + .05));
  toolbar.querySelector('[data-font="down"]').addEventListener('click', () => setFontScale(fontScale - .05));
  toolbar.querySelector('[data-font="reset"]').addEventListener('click', () => setFontScale(1));

  const selectedStatus = toolbar.querySelector('[data-selection-status]');
  const selectedArticles = () => articles.filter(article => article.querySelector('.section-select')?.checked);
  const updateSelection = () => statusText(selectedStatus, 'Қисмҳои интихобшуда: ' + selectedArticles().length);
  articles.forEach((article, index) => {
    const tools = document.createElement('div');
    tools.className = 'section-tools';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'section-select';
    checkbox.setAttribute('aria-label', 'Интихоби ' + (article.querySelector('h2')?.textContent || ('бахши ' + (index + 1))));
    checkbox.addEventListener('change', updateSelection);
    label.append(checkbox, document.createTextNode(' Ин қисмро барои мубодила интихоб кунед'));
    const oneButton = document.createElement('button');
    oneButton.type = 'button';
    oneButton.textContent = 'Мубодилаи ҳамин қисм';
    oneButton.addEventListener('click', () => shareArticles([article]));
    tools.append(label, oneButton);
    const heading = article.querySelector('h2');
    if (heading) heading.insertAdjacentElement('afterend', tools);
  });
  toolbar.querySelector('[data-select-all]').addEventListener('click', () => {
    articles.forEach(article => { const check = article.querySelector('.section-select'); if (check) check.checked = true; });
    updateSelection();
  });
  toolbar.querySelector('[data-clear-all]').addEventListener('click', () => {
    articles.forEach(article => { const check = article.querySelector('.section-select'); if (check) check.checked = false; });
    updateSelection();
  });

  const copyModal = document.createElement('div');
  copyModal.className = 'copy-modal';
  copyModal.hidden = true;
  copyModal.innerHTML = `<section class="copy-modal-panel" role="dialog" aria-modal="true" aria-labelledby="copyTitle"><h2 id="copyTitle">Матн барои мубодила</h2><p>Агар мубодилаи мустақим дастрас набошад, матнро нусха бардоред.</p><textarea aria-label="Матни интихобшуда барои мубодила"></textarea><div class="copy-modal-actions"><button type="button" data-copy>Нусха бардоштан</button><button type="button" data-select-text>Интихоби матн</button><button type="button" data-close-copy>Пӯшидан</button></div></section>`;
  document.body.appendChild(copyModal);
  const copyArea = copyModal.querySelector('textarea');
  const showCopyModal = text => { copyArea.value = text; copyModal.hidden = false; copyArea.focus(); };
  const closeCopyModal = () => { copyModal.hidden = true; };
  copyModal.querySelector('[data-close-copy]').addEventListener('click', closeCopyModal);
  copyModal.querySelector('[data-select-text]').addEventListener('click', () => { copyArea.focus(); copyArea.select(); });
  copyModal.querySelector('[data-copy]').addEventListener('click', async () => {
    copyArea.focus(); copyArea.select();
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copyArea.value);
        copied = true;
      }
    } catch (e) {}
    if (!copied) { try { copied = Boolean(document.execCommand && document.execCommand('copy')); } catch (e) {} }
    if (copied) {
      statusText(selectedStatus, 'Матн нусха бардошта шуд; онро ба барномаи дилхоҳ гузоред.');
      closeCopyModal();
    } else {
      statusText(selectedStatus, 'Нусхабардории автоматӣ дастрас нест — матни интихобшударо дастӣ нусха бардоред.');
    }
  });
  copyModal.addEventListener('click', e => { if (e.target === copyModal) closeCopyModal(); });

  const internalBrowser = document.createElement('div');
  internalBrowser.className = 'internal-browser';
  internalBrowser.hidden = true;
  internalBrowser.innerHTML = `<section class="internal-browser-panel" role="dialog" aria-modal="true" aria-label="Браузери дохилии манбаъ"><header class="internal-browser-head"><strong data-browser-title>Манбаъ</strong><button type="button" data-browser-external aria-label="Кушодан дар браузери беруна">↗</button><button type="button" data-browser-close aria-label="Пӯшидан">×</button></header><div class="internal-browser-url" data-browser-url></div><iframe title="Саҳифаи манбаъ" referrerpolicy="no-referrer"></iframe><div class="internal-browser-help">Кӯшиши кушодан дар дохили барнома. Агар сомона намоишро иҷозат надиҳад, нишонаи ↗-ро пахш карда, манбаъро дар браузери телефон кушоед.</div></section>`;
  document.body.appendChild(internalBrowser);
  const browserFrame = internalBrowser.querySelector('iframe');
  const browserTitle = internalBrowser.querySelector('[data-browser-title]');
  const browserUrl = internalBrowser.querySelector('[data-browser-url]');
  const browserExternal = internalBrowser.querySelector('[data-browser-external]');
  const closeBrowser = () => { internalBrowser.hidden = true; browserFrame.src = 'about:blank'; };
  internalBrowser.querySelector('[data-browser-close]').addEventListener('click', closeBrowser);
  internalBrowser.addEventListener('click', e => { if (e.target === internalBrowser) closeBrowser(); });
  browserExternal.addEventListener('click', () => {
    const url = browserExternal.dataset.url;
    if (!url) return;
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.openExternalUrl === 'function') {
        window.AndroidBridge.openExternalUrl(url);
        return;
      }
    } catch (e) {}
    window.open(url, '_blank', 'noopener');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeBrowser(); closeCopyModal(); } });
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href^="https://"],a[href^="http://"]');
    if (!link || link.hasAttribute('data-allow-external')) return;
    if (!main.contains(link)) return;
    e.preventDefault();
    const url = link.href;
    browserTitle.textContent = (link.textContent || 'Манбаъ').replace(/\s+/g, ' ').trim();
    browserUrl.textContent = url;
    browserExternal.dataset.url = url;
    browserFrame.src = url;
    internalBrowser.hidden = false;
  });

  function articleText(article) {
    const clone = article.cloneNode(true);
    clone.querySelectorAll('.section-tools,.page-no').forEach(node => node.remove());
    const heading = clone.querySelector('h2')?.textContent?.trim() || '';
    const text = clone.innerText || clone.textContent || '';
    const sourceLinks = Array.from(article.querySelectorAll('a[href^="http"]'))
      .map(a => `${a.textContent.trim()} — ${a.href}`).filter(Boolean);
    return `${heading}\n${text.replace(heading, '').trim()}${sourceLinks.length ? '\n\nМанбаъҳо:\n' + sourceLinks.join('\n') : ''}`;
  }
  async function shareArticles(chosen) {
    if (!chosen || !chosen.length) {
      statusText(selectedStatus, 'Аввал як ё чанд қисмро интихоб кунед.');
      return;
    }
    const text = `${safeTitle}\n\n${chosen.map(articleText).join('\n\n——————————\n\n')}\n\n${window.location.href.split('#')[0]}`;
    const title = chosen.length === 1 ? (chosen[0].querySelector('h2')?.textContent || safeTitle) : safeTitle;
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.shareText === 'function') {
        window.AndroidBridge.shareText(text, title);
        statusText(selectedStatus, 'Менюи системавии мубодила кушода шуд.');
        return;
      }
    } catch (err) {}
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, text });
        statusText(selectedStatus, 'Мубодила омода шуд.');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') { statusText(selectedStatus, 'Мубодила бекор карда шуд.'); return; }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        statusText(selectedStatus, 'Матн нусха бардошта шуд; онро ба барномаи дилхоҳ гузоред.');
        return;
      }
    } catch (err) {}
    showCopyModal(text);
  }
  toolbar.querySelector('[data-share-selected]').addEventListener('click', () => shareArticles(selectedArticles()));

  // Quiz UI and score storage.
  const questions = Array.isArray(config.questions) ? config.questions : [];
  const quiz = document.createElement('section');
  quiz.className = 'quiz-card';
  quiz.id = 'self-check-quiz';
  quiz.innerHTML = `<div class="quiz-intro-label">Санҷиши дониш</div><h2>Санҷед ва мустаҳкам кунед</h2><p class="quiz-intro">Барои ҳар савол яке аз се ҷавобро интихоб кунед. Ҷавоби дуруст кабуд, ҷавоби нодуруст сурх нишон дода мешавад. Саволҳо танҳо аз ҳамин маълумоти муфассал таҳия шудаанд.</p><div data-quiz-start-area><p class="quiz-note" data-quiz-history></p><button type="button" data-quiz-start>Оғози санҷиш</button></div><div data-quiz-play hidden><div class="quiz-topline"><span class="quiz-progress-label" data-quiz-progress></span><span class="quiz-progress-label" data-quiz-percent></span></div><div class="quiz-progress"><span data-quiz-progressbar></span></div><span class="quiz-topic" data-quiz-topic></span><div class="quiz-question" data-quiz-question></div><div class="quiz-options" data-quiz-options></div><div class="quiz-feedback" data-quiz-feedback aria-live="polite"></div><p class="quiz-explanation" data-quiz-explanation></p><button type="button" class="quiz-next" data-quiz-next hidden>Саволи навбатӣ</button></div><div class="quiz-results" data-quiz-results hidden></div>`;
  const footer = main.querySelector('.footer-note');
  if (footer) main.insertBefore(quiz, footer); else main.appendChild(quiz);

  const startArea = quiz.querySelector('[data-quiz-start-area]');
  const playArea = quiz.querySelector('[data-quiz-play]');
  const resultArea = quiz.querySelector('[data-quiz-results]');
  const optionArea = quiz.querySelector('[data-quiz-options]');
  const feedback = quiz.querySelector('[data-quiz-feedback]');
  const explanation = quiz.querySelector('[data-quiz-explanation]');
  const nextButton = quiz.querySelector('[data-quiz-next]');
  const historyArea = quiz.querySelector('[data-quiz-history]');
  const loadAttempts = () => {
    try {
      const parsed = JSON.parse(readStored(attemptsKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter(item => item && Number.isFinite(Number(item.percent)) && Number.isFinite(Number(item.score)) && Number.isFinite(Number(item.total))) : [];
    } catch (e) { return []; }
  };
  const showHistory = () => {
    const attempts = loadAttempts();
    if (!attempts.length) {
      const storageNote = storagePersistent ? 'Натиҷаҳо дар ҳамин телефон/браузер нигоҳ дошта мешаванд.' : 'Нигоҳдории доимӣ дар ин муҳит дастрас нест; натиҷаҳо танҳо то пӯшидани саҳифа мемонанд.';
      statusText(historyArea, `Саволҳо: ${questions.length}. ${storageNote}`);
      return;
    }
    const best = Math.max(...attempts.map(a => a.percent));
    const latest = attempts[attempts.length - 1];
    const storageNote = storagePersistent ? '' : ' · танҳо дар ҳамин саҳифа нигоҳ дошта мешавад';
    statusText(historyArea, `Кӯшишҳо: ${attempts.length} · беҳтарин натиҷа: ${best}% · охирин: ${latest.percent}% (${latest.score}/${latest.total})${storageNote}.`);
  };
  showHistory();
  if (questions.length < 30) {
    statusText(historyArea, 'Саволҳо ҳоло пурра омода нестанд. Барои ҳар мавод ҳадди ақал 30 савол пешбинӣ шудааст.');
    quiz.querySelector('[data-quiz-start]').disabled = true;
  }
  let order = [], index = 0, chosenAnswers = [], selectedAnswer = null;
  const renderQuestion = () => {
    selectedAnswer = null;
    const q = questions[order[index]];
    statusText(quiz.querySelector('[data-quiz-progress]'), `Саволи ${index + 1} аз ${order.length}`);
    statusText(quiz.querySelector('[data-quiz-percent]'), `${Math.round(index / order.length * 100)}%`);
    quiz.querySelector('[data-quiz-progressbar]').style.width = `${Math.round(index / order.length * 100)}%`;
    statusText(quiz.querySelector('[data-quiz-topic]'), q.topic || 'Мавзӯъ');
    statusText(quiz.querySelector('[data-quiz-question]'), q.q);
    statusText(feedback, 'Ҷавоби худро интихоб кунед.');
    feedback.className = 'quiz-feedback';
    statusText(explanation, '');
    nextButton.hidden = true;
    optionArea.replaceChildren();
    q.options.forEach((option, i) => {
      const button = document.createElement('button');
      const optionLabels = ['А', 'Б', 'В'];
      button.type = 'button'; button.className = 'quiz-option'; button.textContent = `${optionLabels[i] || (i + 1)}. ${option}`;
      button.addEventListener('click', () => {
        if (selectedAnswer !== null) return;
        selectedAnswer = i; chosenAnswers[index] = i;
        Array.from(optionArea.children).forEach((el, j) => {
          el.disabled = true;
          if (j === q.answer) el.classList.add('is-correct');
          if (j === i && i !== q.answer) el.classList.add('is-wrong');
        });
        if (i === q.answer) { feedback.className = 'quiz-feedback good'; statusText(feedback, 'Дуруст — ҷавоб кабуд нишон дода шуд.'); }
        else { feedback.className = 'quiz-feedback bad'; statusText(feedback, `Нодуруст. Ҷавоби дуруст: ${q.options[q.answer]}`); }
        statusText(explanation, q.explanation || '');
        nextButton.hidden = false;
        nextButton.textContent = index === order.length - 1 ? 'Натиҷаро бинед' : 'Саволи навбатӣ';
      });
      optionArea.appendChild(button);
    });
  };
  quiz.querySelector('[data-quiz-start]').addEventListener('click', () => {
    order = questions.map((_, i) => i);
    // Rotate deterministically by previous attempt count so repeated runs vary without losing coverage.
    const offset = loadAttempts().length % order.length;
    order = order.slice(offset).concat(order.slice(0, offset));
    index = 0; chosenAnswers = [];
    startArea.hidden = true; resultArea.hidden = true; playArea.hidden = false;
    renderQuestion();
    quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  nextButton.addEventListener('click', () => {
    if (selectedAnswer === null) return;
    if (index < order.length - 1) { index += 1; renderQuestion(); }
    else finishQuiz();
  });
  function finishQuiz() {
    playArea.hidden = true;
    const orderedQuestions = order.map(questionIndex => questions[questionIndex]);
    const score = orderedQuestions.reduce((sum, q, i) => sum + (chosenAnswers[i] === q.answer ? 1 : 0), 0);
    const percent = Math.round(score / orderedQuestions.length * 100);
    const grouped = {};
    orderedQuestions.forEach((q, i) => {
      const topic = q.topic || 'Мавзӯъҳои умумӣ';
      const section = q.section || 'p1';
      const key = section + '::' + topic;
      if (!grouped[key]) grouped[key] = { topic, total: 0, right: 0, section };
      grouped[key].total += 1;
      if (chosenAnswers[i] === q.answer) grouped[key].right += 1;
    });
    const at = new Date().toISOString();
    const attempts = loadAttempts();
    attempts.push({ title: safeTitle, score, total: questions.length, percent, at, topics: grouped });
    writeStored(attemptsKey, JSON.stringify(attempts.slice(-30)));
    const weak = Object.entries(grouped).filter(([, v]) => v.right / v.total < .7).sort((a,b) => a[1].right/a[1].total - b[1].right/b[1].total);
    resultArea.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = 'Натиҷаи шумо'; resultArea.appendChild(heading);
    const scoreLine = document.createElement('div'); scoreLine.className = 'quiz-score'; scoreLine.textContent = `${score} аз ${questions.length} · ${percent}%`; resultArea.appendChild(scoreLine);
    const summary = document.createElement('p');
    summary.textContent = percent >= 85 ? 'Дониши шумо дар ин мавод қавӣ аст. Барои устувор нигоҳ доштан, бахшҳои заифро такрор кунед.' : percent >= 60 ? 'Фаҳмиши асосӣ хуб аст; чанд мавзӯъро такрор кардан фоида меорад.' : 'Барои мустаҳкам кардани дониш, аввал бахшҳои тавсияшударо дубора хонед ва баъд санҷишро такрор кунед.';
    resultArea.appendChild(summary);
    if (weak.length) {
      const p = document.createElement('p'); p.textContent = 'Мавзӯъҳое, ки беҳтар аст боз хонед:'; resultArea.appendChild(p);
      const ul = document.createElement('ul');
      weak.forEach(([, v]) => {
        const li = document.createElement('li');
        const a = document.createElement('a'); a.href = '#' + v.section;
        const article = document.getElementById(v.section); const title = article?.querySelector('h2')?.textContent || 'бахши интихобшуда';
        a.textContent = `${v.topic} — ${Math.round(v.right / v.total * 100)}% · ${title}`; li.appendChild(a); ul.appendChild(li);
      });
      resultArea.appendChild(ul);
    } else {
      const p = document.createElement('p'); p.textContent = 'Дар ин кӯшиш мавзӯи махсуси заиф муайян нашуд.'; resultArea.appendChild(p);
    }
    const compareTitle = document.createElement('p'); compareTitle.textContent = 'Натиҷаҳои беҳтарини шумо дар маводҳои дигар:'; resultArea.appendChild(compareTitle);
    const comparisons = [];
    try {
      for (const key of storedKeys()) {
        if (!key || !key.startsWith(quizKeyPrefix)) continue;
        const parsed = JSON.parse(readStored(key) || '[]');
        const list = Array.isArray(parsed) ? parsed.filter(item => item && Number.isFinite(Number(item.percent))) : [];
        if (!list.length) continue;
        const best = Math.max(...list.map(x => Number(x.percent) || 0));
        comparisons.push({ title: list[list.length - 1].title || key.slice(quizKeyPrefix.length), best, current: key === attemptsKey });
      }
    } catch (e) {}
    comparisons.sort((a,b) => b.best - a.best);
    if (comparisons.length) {
      const table = document.createElement('table'); table.className = 'compare-table';
      table.innerHTML = '<thead><tr><th>Мавод</th><th>Беҳтарин натиҷаи шумо</th></tr></thead>';
      const tbody = document.createElement('tbody');
      comparisons.forEach(row => { const tr = document.createElement('tr'); const td1 = document.createElement('td'); const td2 = document.createElement('td'); td1.textContent = row.title + (row.current ? ' · ҳамин мавод' : ''); td2.textContent = row.best + '%'; tr.append(td1, td2); tbody.appendChild(tr); });
      table.appendChild(tbody); resultArea.appendChild(table);
      const note = document.createElement('p'); note.className = 'quiz-note'; note.textContent = 'Муқоиса танҳо натиҷаҳои шахсии шуморо нишон медиҳад; сатҳи душвории китобҳо метавонад фарқ кунад. Дар ин ҳисоб ҷавобҳои дурусту нодуруст ҳамчун нишондиҳандаи омӯзиш истифода мешаванд, на баҳодиҳии шахсият.'; resultArea.appendChild(note);
    } else {
      const p = document.createElement('p'); p.textContent = 'Пас аз гузаштани санҷишҳои маводҳои дигар, натиҷаҳои шумо дар ин ҷо муқоиса мешаванд.'; resultArea.appendChild(p);
    }
    const restart = document.createElement('button'); restart.type = 'button'; restart.textContent = 'Санҷишро аз нав гузаштан'; restart.addEventListener('click', () => { resultArea.hidden = true; startArea.hidden = false; showHistory(); }); resultArea.appendChild(restart);
    resultArea.hidden = false;
    showHistory();
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showHistory();
})();
