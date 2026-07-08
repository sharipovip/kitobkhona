// ====================================================================
//  cache.js – Управление кэшем и WebSocket-уведомлениями (v3)
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
    NOTIFICATIONS: 'kk_cache_notifications'
  },

  // Подписчики: { key: [callback, ...] }
  _subscribers: {},

  // WebSocket-соединение
  _ws: null,
  _wsConnected: false,
  _reconnectTimer: null,
  _wsAttempts: 0,
  _maxReconnectAttempts: 5,
  _initialized: false,

  // Инициализация (вызывается при загрузке страницы)
  init() {
    // Если уже инициализирован, не повторяем
    if (this._initialized) return;
    this._initialized = true;

    // Восстанавливаем данные из localStorage при старте
    this._restoreAll();
    // Подключаемся к WebSocket (неблокирующе)
    setTimeout(() => this._connectWebSocket(), 100);
    // Каждые 15 минут проверяем устаревание кэша.
    // На медленных смартфонах частые инвалидации могут мешать (особенно в паре с WebSocket).
    // Поэтому делаем это реже: раз в 2 часа.
    setInterval(() => this._refreshStale(), 2 * 60 * 60 * 1000);
  },

  // ---------- Чтение / запись ----------
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      // Если есть timestamp и данные старше 15 минут – считаем устаревшими
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

  // Инвалидировать ключ (удалить из localStorage и уведомить подписчиков)
  invalidateKey(key) {
    localStorage.removeItem(key);
    this._notify(key, null);
  },

  // ---------- Подписка ----------
  subscribe(key, callback) {
    if (!this._subscribers[key]) this._subscribers[key] = [];
    this._subscribers[key].push(callback);
    // Сразу вызываем с текущим значением
    const current = this.get(key);
    if (current !== null && current !== undefined) {
      callback(current);
    }
    // Возвращаем функцию отписки
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

  // ---------- WebSocket (Синхронизирован с KITOB_CONFIG) ----------
  _connectWebSocket() {
    // Если уже есть активное соединение, не создаём новое
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = localStorage.getItem('kk_token');
    if (!token) {
      console.log('[Cache] No token, WebSocket not started');
      return;
    }

    // Автоматически строим WebSocket URL на основе KITOB_CONFIG.NEON_API_BASE
    let wsUrl;
    try {
      const baseApi = KITOB_CONFIG.NEON_API_BASE;
      // Заменяем http/https протокол на ws/wss
      const wsTarget = baseApi.replace(/^http/, 'ws');
      wsUrl = `${wsTarget}?token=${encodeURIComponent(token)}`;
    } catch (err) {
      console.error('[Cache] Error parsing KITOB_CONFIG.NEON_API_BASE, using fallback.');
      wsUrl = `wss://kitobkhona-chat.onrender.com?token=${encodeURIComponent(token)}`;
    }

    try {
      console.log('[Cache] Connecting to WebSocket via config:', wsUrl);
      this._ws = new WebSocket(wsUrl);
      
      this._ws.onopen = () => {
        console.log('[Cache] WebSocket connected');
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
        } catch (e) {
          console.warn('[Cache] Invalid WebSocket message', e);
        }
      };

      this._ws.onclose = (event) => {
        console.log('[Cache] WebSocket disconnected', event.code, event.reason);
        this._wsConnected = false;
        // Попытка переподключения через 5 секунд, но не более _maxReconnectAttempts раз
        if (this._wsAttempts < this._maxReconnectAttempts) {
          this._wsAttempts++;
          this._reconnectTimer = setTimeout(() => this._connectWebSocket(), 5000);
        } else {
          console.log('[Cache] WebSocket reconnect attempts exhausted');
        }
      };

      this._ws.onerror = (err) => {
        console.warn('[Cache] WebSocket error', err);
        if (this._ws) this._ws.close();
      };
    } catch (e) {
      console.warn('[Cache] Failed to create WebSocket', e);
      if (this._wsAttempts < this._maxReconnectAttempts) {
        this._wsAttempts++;
        this._reconnectTimer = setTimeout(() => this._connectWebSocket(), 5000);
      }
    }
  },

  // Обработка уведомления от сервера
  _handleUpdate(payload) {
    const { table, operation, data } = payload;
    console.log('[Cache] Update:', table, operation, data);

    // В зависимости от таблицы обновляем соответствующий кэш
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
        // Если обновился текущий пользователь – инвалидируем профиль
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
      default:
        break;
    }
  },

  // Получить ID текущего пользователя из localStorage
  _getCurrentUserId() {
    return localStorage.getItem('kk_user_id');
  },

  // Восстановить все данные из localStorage (заглушка)
  _restoreAll() {
    // Подписчики получат текущие значения при вызове subscribe()
  },

  // Периодическая проверка устаревших данных
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
  }
};

// ====================================================================
//  Экспортируем для использования в других скриптах
// ====================================================================
window.CacheManager = CacheManager;
