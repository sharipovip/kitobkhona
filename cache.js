// ====================================================================
//  cache.js – Управление кэшем, WebSocket и обложками (v4)
// ====================================================================

const CacheManager = {
  // Ключи кэша (используются в localStorage)
  KEYS: {
    CATEGORIES: 'kk_cache_categories',
    BOOKS: 'kk_cache_books',
    PROFILE: 'kk_cache_profile',
    SESSIONS: 'kk_cache_sessions',
    FAVORITES: 'kk_cache_favorites',
    POSTS: 'kk_cache_posts',
    FRIENDS: 'kk_cache_friends',
    REQUESTS: 'kk_cache_requests',
    WINNERS: 'kk_cache_winners',
    HIDDEN: 'kk_cache_hidden',
    ANNOUNCEMENT: 'kk_cache_announcement',
    NOTIFICATIONS: 'kk_cache_notifications',
    COVERS: 'kk_cache_covers'
  },

  // Подписчики и WebSocket-соединение
  _subscribers: {},
  _ws: null,
  _wsConnected: false,
  _reconnectTimer: null,
  _wsAttempts: 0,
  _maxReconnectAttempts: 5,
  _initialized: false,

  // ---------- КЕШИРОВАНИЕ ОБЛОЖЕК ----------
  getCachedCover(src) {
    if (!src) return '';
    try {
      const map = JSON.parse(localStorage.getItem(this.KEYS.COVERS) || '{}');
      const item = map[src];
      if (item && item.dataUrl && (Date.now() - (item.ts || 0) < 7 * 24 * 60 * 60 * 1000)) {
        return item.dataUrl;
      }
    } catch (e) {}
    return '';
  },

  setCachedCover(src, dataUrl) {
    if (!src || !dataUrl) return;
    try {
      const map = JSON.parse(localStorage.getItem(this.KEYS.COVERS) || '{}');
      map[src] = { dataUrl, ts: Date.now() };
      localStorage.setItem(this.KEYS.COVERS, JSON.stringify(map));
    } catch (e) {}
  },

  // Предзагрузка обложки в фоне
  preloadCover(src, bookUrl) {
    if (!src || this.getCachedCover(src)) return;
    fetch(src, { cache: 'no-store' })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (!blob) return;
        this.blobToDataUrl(blob).then(dataUrl => {
          this.setCachedCover(src, dataUrl);
        });
      })
      .catch(() => {})
  },

  blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result || '');
      reader.readAsDataURL(blob);
    });
  },

  // Обновление всех обложек на странице
  hydrateCovers(root = document) {
    const nodes = root.querySelectorAll('img[data-cover-url]');
    nodes.forEach(img => {
      const cover = img.getAttribute('data-cover-url') || '';
      const bookUrl = img.getAttribute('data-book-url') || '';
      const cached = this.getCachedCover(cover);
      const src = cached || cover;
      if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
      if (cover && !cached) this.preloadCover(cover, bookUrl);
    });
  },

  // Глобальная функция для проверки доступа к книге
  getBookAccessState(url) {
    try {
      const cached = !!(JSON.parse(localStorage.getItem('kk_cached_books') || '{}') || {})[url];
      const online = navigator.onLine;
      if (!online) {
        return cached
          ? { show: true, icon: '🔓', bg: 'rgba(52,120,246,0.9)', dim: false }
          : { show: true, icon: '🔒', bg: 'rgba(220,80,80,0.9)', dim: true };
      }
    } catch (e) {}
    return { show: false, icon: '', bg: '', dim: false };
  },

  // Инициализация (вызывается при загрузке страницы)
  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._restoreAll();
    setTimeout(() => this._connectWebSocket(), 100);
    setInterval(() => this._refreshStale(), 2 * 60 * 60 * 1000);
  },

  // ---------- Чтение / запись ----------
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      if (data.timestamp && (Date.now() - data.timestamp > 15 * 60 * 1000)) {
        localStorage.removeItem(key);
        return fallback;
      }
      return data.value;
    } catch (e) {
      return fallback;
    }
  },

  set(key, value) {
    try {
      const data = {
        value: value,
        timestamp: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(data));
      this._notify(key, value);
    } catch (e) {
      console.warn('[Cache] Failed to set', key, e);
    }
  },

  // Принудительно обновить данные с сервера
  async refresh(key, fetcher) {
    if (typeof fetcher !== 'function') return;
    try {
      const data = await fetcher();
      this.set(key, data);
      return data;
    } catch (e) {
      console.warn('[Cache] Refresh failed for', key, e);
      throw e;
    }
  },

  // Инвалидировать ключ
  invalidateKey(key) {
    localStorage.removeItem(key);
    this._notify(key, null);
  },

  // ---------- Подписка ----------
  subscribe(key, callback) {
    if (!this._subscribers[key]) this._subscribers[key] = [];
    this._subscribers[key].push(callback);
    const current = this.get(key);
    if (current !== null && current !== undefined) {
      callback(current);
    }
    return () => {
      this._subscribers[key] = this._subscribers[key].filter(cb => cb !== callback);
    };
  },

  _notify(key, value) {
    if (this._subscribers[key]) {
      this._subscribers[key].forEach(cb => {
        try { cb(value); } catch (e) { console.warn('[Cache] Subscriber error:', e); }
      });
    }
  },

  // ---------- WebSocket ----------
  _connectWebSocket() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = localStorage.getItem('kk_token');
    if (!token) return;

    let wsUrl;
    try {
      const baseApi = KITOB_CONFIG.NEON_API_BASE;
      const wsTarget = baseApi.replace(/^http/, 'ws');
      wsUrl = `${wsTarget}?token=${encodeURIComponent(token)}`;
    } catch (err) {
      wsUrl = `wss://kitobkhona-chat.onrender.com?token=${encodeURIComponent(token)}`;
    }

    try {
      this._ws = new WebSocket(wsUrl);

      this._ws.onopen = () => {
        this._wsConnected = true;
        this._wsAttempts = 0;
        if (this._reconnectTimer) {
          clearTimeout(this._reconnectTimer);
          this._reconnectTimer = null;
        }
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'cache_update') {
            this._handleUpdate(msg.data);
          }
        } catch (e) {}
      };

      this._ws.onclose = () => {
        this._wsConnected = false;
        if (this._wsAttempts < this._maxReconnectAttempts) {
          this._wsAttempts++;
          this._reconnectTimer = setTimeout(() => this._connectWebSocket(), 5000);
        }
      };

      this._ws.onerror = () => {
        if (this._ws) this._ws.close();
      };
    } catch (e) {
      if (this._wsAttempts < this._maxReconnectAttempts) {
        this._wsAttempts++;
        this._reconnectTimer = setTimeout(() => this._connectWebSocket(), 5000);
      }
    }
  },

  // Обработка уведомления от сервера
  _handleUpdate(payload) {
    const { table, data } = payload;

    switch (table) {
      case 'reading_sessions':
        this.invalidateKey(this.KEYS.SESSIONS);
        this.invalidateKey(this.KEYS.PROFILE);
        break;
      case 'user_favorites':
        this.invalidateKey(this.KEYS.FAVORITES);
        break;
      case 'posts':
      case 'post_likes':
      case 'post_comments':
        this.invalidateKey(this.KEYS.POSTS);
        break;
      case 'profiles':
        if (data && data.user_id === this._getCurrentUserId()) {
          this.invalidateKey(this.KEYS.PROFILE);
        }
        break;
      case 'friendships':
        this.invalidateKey(this.KEYS.FRIENDS);
        break;
      case 'friend_requests':
        this.invalidateKey(this.KEYS.REQUESTS);
        break;
      case 'announcements':
        this.invalidateKey(this.KEYS.ANNOUNCEMENT);
        break;
      case 'notifications':
        this.invalidateKey(this.KEYS.NOTIFICATIONS);
        break;
    }
  },

  _getCurrentUserId() {
    return localStorage.getItem('kk_user_id');
  },

  _restoreAll() {},

  _refreshStale() {
    Object.keys(this._subscribers).forEach(key => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        if (data.timestamp && (Date.now() - data.timestamp > 15 * 60 * 1000)) {
          localStorage.removeItem(key);
          this._notify(key, null);
        }
      } catch (e) {}
    });
  },

  // Универсальная функция для обновления обложек и бейджей
  hydrateBookCardCovers(root = document) {
    const self = this;
    root.querySelectorAll('img[data-cover-url]').forEach(function(img) {
      const cover = img.getAttribute('data-cover-url') || '';
      const bookUrl = img.getAttribute('data-book-url') || '';
      const cached = self.getCachedCover(cover);
      const src = cached || cover;
      if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
      const state = self.getBookAccessState(bookUrl);
      if (state.show) {
        const badge = img.parentElement ? img.parentElement.querySelector('[data-book-badge]') : null;
        if (badge) {
          badge.style.display = 'flex';
          badge.textContent = state.icon;
          badge.style.background = state.bg;
        }
        if (state.dim) img.style.filter = 'brightness(0.72)';
      } else {
        const badge = img.parentElement ? img.parentElement.querySelector('[data-book-badge]') : null;
        if (badge) badge.style.display = 'none';
        img.style.filter = '';
      }
      if (cover) self.preloadCover(cover, bookUrl);
    });
  }
};

window.CacheManager = CacheManager;