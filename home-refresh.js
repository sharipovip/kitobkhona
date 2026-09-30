/* Китобхона 2.1 — small progressive enhancements; the original page and core flows remain intact. */
(() => {
  'use strict';

  const RECENT_SEARCHES_KEY = 'kk_recent_home_searches_v21';
  const MAX_RECENT_SEARCHES = 8;
  const $ = (id) => document.getElementById(id);

  function readRecentSearches() {
    try {
      const value = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
      return Array.isArray(value)
        ? value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, MAX_RECENT_SEARCHES)
        : [];
    } catch (_) { return []; }
  }

  function rememberSearch(value) {
    const query = String(value || '').trim().replace(/\s+/g, ' ');
    if (query.length < 2) return;
    const next = [query, ...readRecentSearches().filter((item) => item.toLocaleLowerCase() !== query.toLocaleLowerCase())]
      .slice(0, MAX_RECENT_SEARCHES);
    try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch (_) { /* private browsing */ }
    renderSearchHistory();
  }

  function renderSearchHistory() {
    const host = $('homeSearchHistory');
    const input = $('homeSearch');
    const section = $('searchSection');
    if (!host || !input || !section) return;

    const searches = readRecentSearches();
    const isOpen = section.style.display !== 'none' && !input.value.trim() && searches.length > 0;
    host.replaceChildren();
    host.hidden = !isOpen;
    if (!isOpen) return;

    const title = document.createElement('span');
    title.className = 'home-search-history-title-v105';
    title.textContent = 'Ҷустуҷӯҳои охирин';
    host.appendChild(title);

    searches.forEach((query) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'home-search-chip-v105';
      chip.textContent = query;
      chip.setAttribute('aria-label', `Ҷустуҷӯи китоб: ${query}`);
      chip.addEventListener('click', () => {
        input.value = query;
        host.hidden = true;
        if (typeof window.searchHome === 'function') window.searchHome(query, true);
      });
      host.appendChild(chip);
    });
  }

  function setupSearch() {
    const searchShortcut = $('homeSearchAction');
    const toggle = $('searchToggleBtn');
    const section = $('searchSection');
    const input = $('homeSearch');
    const form = $('homeSearchForm');

    const openSearch = () => {
      if (section?.style.display === 'none') {
        if (toggle) toggle.click();
        else section.style.display = 'block';
      }
      window.setTimeout(() => input?.focus(), 80);
      section?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      renderSearchHistory();
    };

    searchShortcut?.addEventListener('click', openSearch);
    input?.addEventListener('focus', renderSearchHistory);
    input?.addEventListener('input', renderSearchHistory);
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') rememberSearch(input.value);
      if (event.key === 'Escape' && section) {
        section.style.display = 'none';
        input.blur();
        renderSearchHistory();
      }
    });
    form?.addEventListener('submit', () => rememberSearch(input?.value), true);
    toggle?.addEventListener('click', () => window.setTimeout(renderSearchHistory, 0));

    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.altKey || event.metaKey) return;
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
        target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      );
      if (isTyping) return;
      if ((event.key === '/' && !event.ctrlKey) || (event.key.toLowerCase() === 'k' && event.ctrlKey)) {
        event.preventDefault();
        openSearch();
      }
    });
  }

  function setupCategories() {
    const button = $('catShowMoreV105');
    const grid = $('catGrid');
    if (!button || !grid) return;
    button.addEventListener('click', () => {
      const expanded = grid.classList.toggle('expanded');
      button.setAttribute('aria-expanded', String(expanded));
      const count = grid.querySelectorAll('.cat-card-v3').length;
      button.innerHTML = expanded
        ? 'Камтар нишон диҳед <span aria-hidden="true">↑</span>'
        : `Ҳамаи ${count} категория <span aria-hidden="true">↓</span>`;
    });
  }

  function setupThemeButton() {
    const button = $('themeBtn');
    if (!button) return;
    button.style.display = 'flex';
    button.type = 'button';
    button.title = 'Тағйир додани мавзӯъ';
    button.setAttribute('aria-label', 'Тағйир додани мавзӯъ');
    button.addEventListener('click', () => {
      if (typeof window.toggleTheme === 'function') window.toggleTheme();
    });
    document.addEventListener('kitobkhona-theme-change', (event) => {
      const name = String(event.detail || '');
      const labels = { dark: 'Мавзӯи торик', light: 'Мавзӯи равшан', gold: 'Мавзӯи тиллоӣ', flag: 'Мавзӯи парчам', book: 'Мавзӯи китоб' };
      button.title = `${labels[name] || 'Мавзӯъ'} · барои тағйир пахш кунед`;
      button.setAttribute('aria-label', `Мавзӯи ҷорӣ: ${labels[name] || name}. Тағйир додан`);
    });
  }

  function setupConnectivity() {
    const status = $('homeConnectivity');
    const text = $('homeConnectivityText');
    if (!status || !text) return;
    const update = () => {
      const online = navigator.onLine !== false;
      status.hidden = online;
      status.classList.toggle('offline', !online);
      text.textContent = online
        ? 'Пайвасти интернет мавҷуд аст'
        : 'Офлайн ҳастед — файлҳои кэшшуда дастрасанд';
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  function setupPwaInstall() {
    const button = $('pwaInstallBtn');
    if (!button) return;
    let installPrompt = null;
    const isInstalled = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
    button.hidden = Boolean(isInstalled);

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      button.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      button.hidden = true;
    });
    button.addEventListener('click', async () => {
      if (!installPrompt) return;
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice?.outcome === 'accepted') button.hidden = true;
      } catch (_) { /* the browser may dismiss the prompt */ }
      installPrompt = null;
    });
  }

  function setupWeatherKeyboard() {
    const widget = $('headerWidget');
    if (!widget) return;
    widget.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (typeof window.openWeatherModal === 'function') window.openWeatherModal();
    });
  }

  function init() {
    document.body?.classList.add('home-refresh-v105');
    setupSearch();
    setupCategories();
    setupThemeButton();
    setupConnectivity();
    setupPwaInstall();
    setupWeatherKeyboard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
