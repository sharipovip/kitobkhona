
(function () {
  'use strict';

  const PREFIX = 'kk_cm_';
  const TTL = 10 * 60 * 1000;
  const memory = new Map();
  const listeners = new Map();
  let initialized = false;

  const KEYS = {
    POSTS: 'kk_cache_posts',
    PROFILE: 'kk_cache_profile',
    FRIENDS: 'kk_cache_friends',
    REQUESTS: 'kk_cache_requests',
    CATEGORIES: 'kk_cache_categories',
    ANNOUNCEMENT: 'kk_cache_announcement'
  };

  function notify(key, value) {
    const set = listeners.get(key);
    if (!set) return;
    set.forEach(function (fn) {
      try { fn(value); } catch (e) { console.warn('[CacheManager] listener error', e); }
    });
  }

  function readStored(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'value')) {
        if (parsed.ts && Date.now() - parsed.ts > TTL) {
          localStorage.removeItem(PREFIX + key);
          return null;
        }
        return parsed.value;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeStored(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ value: value, ts: Date.now() }));
    } catch (e) {
      console.warn('[CacheManager] localStorage write skipped:', e.message);
    }
  }

  function get(key) {
    if (!key) return null;
    if (memory.has(key)) {
      const item = memory.get(key);
      if (!item || !item.ts || Date.now() - item.ts <= TTL) return item ? item.value : null;
      memory.delete(key);
    }
    const value = readStored(key);
    if (value !== null && value !== undefined) memory.set(key, { value: value, ts: Date.now() });
    return value;
  }

  function set(key, value) {
    if (!key) return value;
    memory.set(key, { value: value, ts: Date.now() });
    writeStored(key, value);
    notify(key, value);
    return value;
  }

  function invalidateKey(key) {
    if (!key) return;
    memory.delete(key);
    try { localStorage.removeItem(PREFIX + key); } catch (e) {}
    try { localStorage.removeItem(key); } catch (e) {}
    notify(key, null);
  }

  function subscribe(key, fn) {
    if (!key || typeof fn !== 'function') return function () {};
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return function () {
      const set = listeners.get(key);
      if (!set) return;
      set.delete(fn);
      if (!set.size) listeners.delete(key);
    };
  }

  function getCoverMap() {
    try { return JSON.parse(localStorage.getItem('kk_cover_cache') || '{}'); }
    catch (e) { return {}; }
  }

  function getCachedCover(url) {
    if (!url) return '';
    const map = getCoverMap();
    const item = map[url];
    if (!item) return '';
    if (item.ts && Date.now() - item.ts > 7 * 24 * 60 * 60 * 1000) return '';
    return item.dataUrl || '';
  }

  function setCachedCover(url, dataUrl) {
    if (!url || !dataUrl) return;
    const map = getCoverMap();
    map[url] = { dataUrl: dataUrl, ts: Date.now() };
    try { localStorage.setItem('kk_cover_cache', JSON.stringify(map)); } catch (e) {}
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function preloadCover(url) {
    if (!url || getCachedCover(url)) return getCachedCover(url);
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) return '';
      const dataUrl = await blobToDataUrl(await response.blob());
      setCachedCover(url, dataUrl);
      return dataUrl;
    } catch (e) {
      return '';
    }
  }

  function hydrateBookCardCovers(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-cover-url]').forEach(function (img) {
      const url = img.getAttribute('data-cover-url');
      const cached = getCachedCover(url);
      if (cached) img.setAttribute('src', cached);
      else if (url) preloadCover(url).then(function (dataUrl) {
        if (dataUrl) img.setAttribute('src', dataUrl);
      });
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    window.CacheManager._ws = null;
    window.CacheManager._wsConnected = false;
  }

  window.CacheManager = {
    KEYS: KEYS,
    _ws: null,
    _wsConnected: false,
    init: init,
    get: get,
    set: set,
    invalidateKey: invalidateKey,
    subscribe: subscribe,
    getCachedCover: getCachedCover,
    setCachedCover: setCachedCover,
    blobToDataUrl: blobToDataUrl,
    preloadCover: preloadCover,
    hydrateBookCardCovers: hydrateBookCardCovers
  };
})();