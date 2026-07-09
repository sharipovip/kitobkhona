// ============================================================
// КОНФИГУРАЦИЯ КИТОБХОНА – ПОЛНАЯ ВЕРСИЯ (с блокировкой устройства)
// ============================================================

const KITOB_CONFIG = {
  NEON_API_BASE: 'https://kitobkhona-chat.onrender.com',
  SUPABASE_REST: 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2R6ZnFvb3ByeHl0bGVwYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDI5ODIsImV4cCI6MjA5NjQ3ODk4Mn0.4rV_7yN5Urx5WHgb9kAxWo_VmrPWGlbFYN4Ij7DcuyI'
};

// ======================== НОВЫЕ ФУНКЦИИ ДЛЯ НАСТРОЕК =========================

/** Версия приложения */
const APP_VERSION = '2.0.0';

/** Нормализует URL книги (преобразует raw GitHub в CDN) */
function normalizeBookUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'raw.githubusercontent.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const owner = parts[0], repo = parts[1], branch = parts[2];
        const path = parts.slice(3).map(p => encodeURIComponent(decodeURIComponent(p))).join('/');
        return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
      }
    }
  } catch(e) {}
  return url;
}

/** Формирует URL книги по папке и имени файла */
function getBookUrl(folder, file) {
  const repo = 'sharipovip/books';
  const branch = 'main';
  let cleanFolder = String(folder).replace(/^books\//, '');
  if (!cleanFolder) cleanFolder = '';
  const encodedFolder = cleanFolder ? cleanFolder.split('/').map(encodeURIComponent).join('/') : '';
  const encodedFile = encodeURIComponent(file);
  return `https://raw.githubusercontent.com/${repo}/${branch}/books/${encodedFolder ? encodedFolder + '/' : ''}${encodedFile}`;
}

/** Очищает весь кэш PDF-книг */
async function clearBookCache() {
  try {
    // Удаляем все PDF из кэша браузера
    if ('caches' in window) {
      const cache = await caches.open('kitobkhona-pdf-cache-v1');
      const keys = await cache.keys();
      await Promise.all(keys.map(request => cache.delete(request)));
    }
    // Очищаем localStorage записи о кэшированных книгах
    localStorage.removeItem('kk_cached_books');
    // Очищаем прогресс чтения? (оставляем, чтобы не потерять)
    toast('✅ Кэш книг очищен!');
  } catch(e) {
    toast('❌ Ошибка при очистке кэша', true);
  }
}

/** Отображает информацию о программе */
function showAbout() {
  alert(`Китобхона · Манбаи дониш\nВерсия ${APP_VERSION}\n\nЭлектронная библиотека таджикской литературы.\nРазработано с ❤️ для читателей.`);
}

/** Связь с нами - открывает модалку если есть на странице */
function contactUs() {
  // Проверяем, есть ли модалка обратной связи на странице (profile.html)
  const feedbackOverlay = document.getElementById('feedbackOverlay');
  if (feedbackOverlay) {
    feedbackOverlay.classList.add('open');
  } else {
    // Fallback на email если модалки нет
    window.location.href = 'mailto:info@kitobkhona.tj?subject=Связь с Китобхона';
  }
}

// ======================== МОДАЛЬНОЕ ОКНО НАСТРОЕК =========================

let settingsModalInstance = null;

function createSettingsModal() {
  const modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.6);
    display: none; align-items: center; justify-content: center;
    padding: 20px;
    backdrop-filter: blur(4px);
  `;
  modal.innerHTML = `
    <div style="
      background: var(--bg, #0D1B2A);
      border: 1px solid var(--border, rgba(201,168,76,0.18));
      border-radius: 24px;
      padding: 24px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      color: var(--text, #F0EAD6);
      font-family: inherit;
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 20px; color: var(--gold, #C9A84C);">⚙️ Настройка</h2>
        <button id="closeSettingsBtn" style="background: none; border: none; color: var(--muted, #A8B8CC); font-size: 24px; cursor: pointer;">✕</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button class="settings-item" data-action="theme" style="
          background: var(--card, #1A2D44);
          border: 1px solid var(--border, rgba(201,168,76,0.18));
          border-radius: 12px;
          padding: 12px 16px;
          color: var(--text, #F0EAD6);
          font-size: 15px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: background 0.15s;
          width: 100%;
          text-align: left;
        ">
          <span style="font-size: 20px;">🌓</span>
          <span>День / Ночь</span>
        </button>
        <button class="settings-item" data-action="clearcache" style="
          background: var(--card, #1A2D44);
          border: 1px solid var(--border, rgba(201,168,76,0.18));
          border-radius: 12px;
          padding: 12px 16px;
          color: var(--text, #F0EAD6);
          font-size: 15px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: background 0.15s;
          width: 100%;
          text-align: left;
        ">
          <span style="font-size: 20px;">🗑</span>
          <span>Очистка кэша</span>
        </button>
        <button class="settings-item" data-action="contact" style="
          background: var(--card, #1A2D44);
          border: 1px solid var(--border, rgba(201,168,76,0.18));
          border-radius: 12px;
          padding: 12px 16px;
          color: var(--text, #F0EAD6);
          font-size: 15px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: background 0.15s;
          width: 100%;
          text-align: left;
        ">
          <span style="font-size: 20px;">📧</span>
          <span>Тамос бо мо</span>
        </button>
        <button class="settings-item" data-action="about" style="
          background: var(--card, #1A2D44);
          border: 1px solid var(--border, rgba(201,168,76,0.18));
          border-radius: 12px;
          padding: 12px 16px;
          color: var(--text, #F0EAD6);
          font-size: 15px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: background 0.15s;
          width: 100%;
          text-align: left;
        ">
          <span style="font-size: 20px;">ℹ️</span>
          <span>О программе</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Закрытие по клику вне модалки
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeSettingsModal();
  });

  // Закрытие по кнопке
  modal.querySelector('#closeSettingsBtn').addEventListener('click', closeSettingsModal);

  // Обработчики кнопок
  modal.querySelectorAll('.settings-item').forEach(item => {
    item.addEventListener('click', function() {
      const action = this.dataset.action;
      switch(action) {
        case 'theme':
          toggleTheme();
          break;
        case 'clearcache':
          clearBookCache();
          break;
        case 'contact':
          contactUs();
          break;
        case 'about':
          showAbout();
          break;
      }
    });
  });

  return modal;
}

function openSettingsModal() {
  if (!settingsModalInstance) {
    settingsModalInstance = createSettingsModal();
  }
  settingsModalInstance.style.display = 'flex';
}

function closeSettingsModal() {
  if (settingsModalInstance) {
    settingsModalInstance.style.display = 'none';
  }
}

// ======================== ПЕРЕКЛЮЧЕНИЕ ТЕМЫ =========================

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('kk_theme', isLight ? 'light' : 'dark');
  // Обновляем статус в модалке, если она открыта
  const status = document.querySelector('#themeStatus');
  if (status) status.textContent = isLight ? 'День' : 'Ночь';
  // Также обновляем кнопку темы в правом углу (если есть)
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.textContent = isLight ? '☀️' : '🌙';
  }
}

function initTheme() {
  const saved = localStorage.getItem('kk_theme') || 'dark';
  if (saved === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.textContent = saved === 'light' ? '☀️' : '🌙';
  }
}

// ======================== ИНИЦИАЛИЗАЦИЯ НАСТРОЕК =========================

function initSettings() {
  // Только на странице профиля добавляем кнопку настроек
  if (window.location.pathname.includes('profile.html')) {
    document.querySelectorAll('.brand-mini').forEach(el => {
      el.style.cursor = 'pointer';
      const label = el.querySelector('span, .brand-name');
      if (label) {
        label.textContent = 'Настройка';
      }
      el.addEventListener('click', function(e) {
        e.preventDefault();
        openSettingsModal();
      });
    });
  }
}

function ensureDialogContainer() {
  if (window.kitobkhonaDialogContainer) return window.kitobkhonaDialogContainer;
  const overlay = document.createElement('div');
  overlay.id = 'kitobkhona-dialog-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:10000;background:rgba(0,0,0,0.65);backdrop-filter:blur(3px);padding:16px;';
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" style="width:100%;max-width:420px;background:#0D1B2A;border:1px solid rgba(201,168,76,0.2);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,0.35);overflow:hidden;color:#F0EAD6;font-family:inherit;">
      <div id="kitobkhona-dialog-title" style="padding:18px 22px 12px;font-size:18px;font-weight:700;color:#E8C879;border-bottom:1px solid rgba(255,255,255,0.06);">Хабар</div>
      <div id="kitobkhona-dialog-message" style="padding:18px 22px 8px;font-size:15px;line-height:1.6;color:#E8E7DC;min-height:60px;"></div>
      <div style="display:flex;justify-content:flex-end;gap:12px;padding:16px 20px 20px;background:rgba(255,255,255,0.02);">
        <button id="kitobkhona-dialog-cancel" style="border:none;border-radius:999px;padding:10px 16px;background:rgba(255,255,255,0.08);color:#F0EAD6;cursor:pointer;font-size:14px;">Не</button>
        <button id="kitobkhona-dialog-ok" style="border:none;border-radius:999px;padding:10px 16px;background:#C9A84C;color:#0D1B2A;cursor:pointer;font-size:14px;font-weight:700;">Ҳа</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  window.kitobkhonaDialogContainer = overlay;
  return overlay;
}

function showAlertDialog(message, title = 'Хабар') {
  return new Promise(resolve => {
    const overlay = ensureDialogContainer();
    overlay.querySelector('#kitobkhona-dialog-title').textContent = title;
    overlay.querySelector('#kitobkhona-dialog-message').textContent = message;
    const cancelBtn = overlay.querySelector('#kitobkhona-dialog-cancel');
    const okBtn = overlay.querySelector('#kitobkhona-dialog-ok');
    cancelBtn.style.display = 'none';
    okBtn.textContent = 'ОК';
    const close = () => {
      overlay.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      document.removeEventListener('keydown', onKey);
      resolve();
    };
    const onOk = () => close();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    okBtn.addEventListener('click', onOk);
    document.addEventListener('keydown', onKey);
    overlay.style.display = 'flex';
    okBtn.focus();
  });
}

function showConfirmDialog(message, title = 'Тасдиқ', confirmText = 'Ҳа', cancelText = 'Не') {
  return new Promise(resolve => {
    const overlay = ensureDialogContainer();
    overlay.querySelector('#kitobkhona-dialog-title').textContent = title;
    overlay.querySelector('#kitobkhona-dialog-message').textContent = message;
    const cancelBtn = overlay.querySelector('#kitobkhona-dialog-cancel');
    const okBtn = overlay.querySelector('#kitobkhona-dialog-ok');
    cancelBtn.style.display = 'inline-flex';
    cancelBtn.textContent = cancelText;
    okBtn.textContent = confirmText;
    const cleanup = () => {
      overlay.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { cleanup(); resolve(false); }
      if (e.key === 'Enter') { cleanup(); resolve(true); }
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
    overlay.style.display = 'flex';
    okBtn.focus();
  });
}

// Инициализация при загрузке DOM (БЕЗ АВТО-ЗАПРОСА УВЕДОМЛЕНИЙ!)
document.addEventListener('DOMContentLoaded', function() {
  initTheme();
  initSettings();
  // Автоматический запрос уведомлений УБРАН – теперь только по клику на кнопку в модалке
});

// ================================================================
// ============ ФУНКЦИИ ДЛЯ РАБОТЫ С ФАЙЛАМИ (без изменений) ============
// ================================================================

function fetchWithTimeout(url, options, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Сервер не ответил (' + (timeoutMs/1000) + 'с)')), timeoutMs))
  ]);
}

function getDeviceFingerprint() {
  let fp = localStorage.getItem('kk_device_fp');
  if (fp) return fp;
  const seed = [navigator.userAgent || '', navigator.language || '', screen.width + 'x' + screen.height, new Date().getTimezoneOffset(), 'kitobkhona-' + Math.random().toString(36).slice(2, 10)].join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash |= 0; }
  fp = Math.abs(hash).toString(36);
  localStorage.setItem('kk_device_fp', fp);
  return fp;
}

function isAndroid() {
   try { return !!(window.AndroidBridge && typeof AndroidBridge.saveFile === 'function'); }
   catch(e) { return false; }
 }

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function shareFile(url, name) {
  try {
    let blob = null;
    if ('caches' in window) {
      const cache = await caches.open('kitobkhona-pdf-cache-v1');
      const hit = await cache.match(url);
      if (hit) blob = await hit.blob();
    }
    if (!blob) {
      const toastEl = document.getElementById('toast');
      if (toastEl) { toastEl.textContent = 'Омодасозии китоб...'; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 3000); }
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      blob = await r.blob();
      try {
        const cache = await caches.open('kitobkhona-pdf-cache-v1');
        await cache.put(url, new Response(blob.clone(), { headers: { 'Content-Type': 'application/pdf' } }));
      } catch(e) {}
    }
    const fileName = (name || 'kitob') + '.pdf';
    if (isAndroid() && typeof AndroidBridge.shareFile === 'function') {
      const b64 = await blobToBase64(blob);
      AndroidBridge.shareFile(b64, fileName, 'application/pdf');
      return;
    }
    if (navigator.canShare && navigator.share) {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: name, files: [file] });
        return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 5000);
    const toastEl = document.getElementById('toast');
    if (toastEl) { toastEl.textContent = 'Файл боргирӣ шуд'; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 3000); }
  } catch(e) {
    if (e.name !== 'AbortError') {
      const toastEl = document.getElementById('toast');
      if (toastEl) { toastEl.textContent = 'Мубодила нашуд: ' + e.message; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 3000); }
    }
  }
}

async function downloadFile(url, name, showProgress = true) {
  try {
    const toastEl = document.getElementById('toast');
    if (toastEl && showProgress) {
      toastEl.textContent = 'Ҳифз шуда истодааст... 0%';
      toastEl.classList.add('show');
    }
    let blob = null;
    let fromCache = false;
    if ('caches' in window) {
      const cache = await caches.open('kitobkhona-pdf-cache-v1');
      const hit = await cache.match(url);
      if (hit) {
        blob = await hit.blob();
        fromCache = true;
        if (toastEl && showProgress) {
          toastEl.textContent = '✓ Аз ҳифзшуда гирифта шуд';
          setTimeout(() => toastEl.classList.remove('show'), 1500);
        }
      }
    }
    if (!blob) {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const contentLength = r.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength) : 0;
      const reader = r.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total && toastEl && showProgress) {
          const pct = Math.round((loaded / total) * 100);
          toastEl.textContent = `Ҳифз шуда истодааст... ${pct}%`;
        }
      }
      blob = new Blob(chunks, { type: 'application/pdf' });
      try {
        const cache = await caches.open('kitobkhona-pdf-cache-v1');
        await cache.put(url, new Response(blob.clone(), { headers: { 'Content-Type': 'application/pdf' } }));
      } catch(e) {}
      const m = JSON.parse(localStorage.getItem('kk_cached_books') || '{}');
      m[url] = { url, name, cover: '', ts: Date.now(), size: blob.size };
      localStorage.setItem('kk_cached_books', JSON.stringify(m));
    }
    const fileName = (name || 'kitob') + '.pdf';
    if (isAndroid() && typeof AndroidBridge.saveFile === 'function') {
      const b64 = await blobToBase64(blob);
      AndroidBridge.saveFile(b64, fileName, 'application/pdf');
      if (toastEl) {
        toastEl.textContent = '✓ Файл барои захира кардан омода';
        setTimeout(() => toastEl.classList.remove('show'), 2000);
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 5000);
    if (toastEl) {
      toastEl.textContent = '✓ Китоб боргирӣ шуд';
      setTimeout(() => toastEl.classList.remove('show'), 2000);
    }
  } catch(e) {
    const toastEl = document.getElementById('toast');
    if (toastEl) {
      toastEl.textContent = 'Хатогӣ: ' + e.message;
      toastEl.classList.add('show');
      setTimeout(() => toastEl.classList.remove('show'), 3000);
    }
    console.error('Download error:', e);
  }
}

// ================================================================
// ============ АВТОВХОД И УПРАВЛЕНИЕ АККАУНТОМ (ИСПРАВЛЕН) ============
// ================================================================
const AutoLogin = {
  currentUser: null,
  autoLogin: async function(showChoice) {
    if (localStorage.getItem('kk_device_blocked') === 'true') throw new Error('Устройство заблокировано. Создание гостя невозможно.');
    const savedToken = localStorage.getItem('kk_token');
    const savedUserId = localStorage.getItem('kk_user_id');
    const savedUsername = localStorage.getItem('kk_username');
    if (savedToken && savedUserId) {
      this.currentUser = { token: savedToken, userId: savedUserId, username: savedUsername || 'user' };
      // Не блокируем страницу ожиданием сети: сначала используем данные из localStorage,
      // а проверку токена делаем в фоне.
      (async () => {
        try {
          const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + savedUserId, { headers: { 'Authorization': 'Bearer ' + savedToken } }, 5000);
          if (!r.ok) {
            localStorage.removeItem('kk_token'); localStorage.removeItem('kk_user_id'); localStorage.removeItem('kk_username');
            localStorage.removeItem('kk_guest_password');
            this.currentUser = null;
            return;
          }
          const profile = await r.json();
          if (profile.blocked === true) {
            localStorage.setItem('kk_device_blocked', 'true');
            this.currentUser = null;
          }
        } catch (e) {
          console.warn('[AutoLogin] Background validation failed:', e);
        }
      })();
      return this.currentUser;
    }
    if (showChoice === true) return null;
    try {
      const fp = getDeviceFingerprint();
      const username = 'guest_' + fp.slice(0, 8);
      let password = localStorage.getItem('kk_guest_password');
      if (!password) {
        password = 'guest_' + fp + '_fixed_salt';
        localStorage.setItem('kk_guest_password', password);
      }
      const email = username + '@guest.kitobkhona.tj';
      const response = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, display_name: 'Меҳмон', is_temporary: true })
      }, 8000);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        if (response.status === 409) {
          const loginResp = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          }, 8000);
          const loginData = await loginResp.json().catch(() => ({}));
          if (loginResp.ok && loginData.token) {
            const profileResp = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + loginData.userId, {
              headers: { 'Authorization': 'Bearer ' + loginData.token }
            }, 5000);
            if (profileResp.ok) {
              const profile = await profileResp.json();
              if (profile.blocked === true) { localStorage.setItem('kk_device_blocked', 'true'); throw new Error('Ваш аккаунт заблокирован'); }
            }
            localStorage.setItem('kk_token', loginData.token);
            localStorage.setItem('kk_user_id', loginData.userId);
            localStorage.setItem('kk_username', loginData.username);
            this.currentUser = { token: loginData.token, userId: loginData.userId, username: loginData.username };
            return this.currentUser;
          }
          throw new Error(loginData.error || 'Не удалось войти');
        }
        throw new Error(data.error || ('HTTP ' + response.status));
      }
      localStorage.setItem('kk_token', data.token);
      localStorage.setItem('kk_user_id', data.userId);
      localStorage.setItem('kk_username', data.username);
      this.currentUser = { token: data.token, userId: data.userId, username: data.username };
      return this.currentUser;
    } catch (e) {
      console.error('[AutoLogin] Ошибка:', e);
      if (e.message.includes('заблокирован')) throw e;
      return null;
    }
  },
  loginWithCredentials: async function(username, password) {
    try {
      const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }, 8000);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (data.error && data.error.includes('заблокирован')) { localStorage.setItem('kk_device_blocked', 'true'); throw new Error('Ваш аккаунт заблокирован'); }
        throw new Error(data.error || 'Не удалось войти');
      }
      localStorage.removeItem('kk_device_blocked');
      localStorage.setItem('kk_token', data.token);
      localStorage.setItem('kk_user_id', data.userId);
      localStorage.setItem('kk_username', data.username);
      this.currentUser = { token: data.token, userId: data.userId, username: data.username };
      return this.currentUser;
    } catch (e) { console.error('[Login] Ошибка:', e); throw e; }
  },
  logout: function() {
    localStorage.removeItem('kk_token');
    localStorage.removeItem('kk_user_id');
    localStorage.removeItem('kk_username');
    localStorage.removeItem('kk_device_blocked');
    localStorage.removeItem('kk_guest_password');
    this.currentUser = null;
  }
};

// ================================================================
// ============ AUTH (обёртка) ============
// ================================================================
const AUTH = {
  getUser: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    const username = localStorage.getItem('kk_username');
    if (!token || !userId) return { data: { user: null } };
    // Сначала возвращаем из localStorage — без ожидания сети
    const cached = localStorage.getItem('kk_profile_cache');
    let profile = null;
    if (cached) {
      try {
        const p = JSON.parse(cached);
        if (p && p.id && (Date.now() - p._ts < 15 * 60 * 1000)) profile = p;
      } catch(e) {}
    }
    if (profile) {
      // Обновляем в фоне
      NEON_API.getProfile(userId).then(p => {
        localStorage.setItem('kk_profile_cache', JSON.stringify({ ...p, _ts: Date.now() }));
      }).catch(() => {});
      return { data: { user: { id: userId, username: username || profile.username || 'user', display_name: profile.display_name || username || 'Китобхон', ...profile } } };
    }
    // Нет кэша — грузим с сервера
    try {
      profile = await NEON_API.getProfile(userId);
      localStorage.setItem('kk_profile_cache', JSON.stringify({ ...profile, _ts: Date.now() }));
      return { data: { user: { id: userId, username: username || profile.username || 'user', display_name: profile.display_name || username || 'Китобхон', ...profile } } };
    } catch (e) {
      return { data: { user: { id: userId, username: username || 'user', display_name: username || 'Китобхон' } } };
    }
  },
  getProfileFromRailway: async function(userId) {
    try { return await NEON_API.getProfile(userId); } catch(e) { console.warn('getProfileFromRailway error:', e); return null; }
  },
  autoLogin: async function(showChoice) { return await AutoLogin.autoLogin(showChoice); },
  logout: function() { AutoLogin.logout(); }
};

// ================================================================
// ============ CHAT API ============
// ================================================================
const ChatAPI = {
  getFriends: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends', { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) throw new Error('Ошибка получения друзей: ' + r.status);
    const data = await r.json();
    return data.map(f => f.id);
  },
  getFriendRequests: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends/requests', { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) throw new Error('Ошибка получения заявок: ' + r.status);
    return await r.json();
  },
  acceptFriendRequestByUser: async function(fromUserId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends/accept', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_user: fromUserId })
    }, 8000);
    if (!r.ok) throw new Error('Ошибка при приёме заявки: ' + r.status);
    return await r.json();
  },
  declineFriendRequest: async function(requestId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends/requests/' + requestId, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
    }, 8000);
    if (!r.ok) throw new Error('Ошибка при отклонении заявки: ' + r.status);
    return await r.json();
  },
  getMessages: async function(user1, user2) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const url = KITOB_CONFIG.NEON_API_BASE + '/api/messages?user1=' + user1 + '&user2=' + user2;
    const r = await fetchWithTimeout(url, { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) throw new Error('Ошибка получения сообщений: ' + r.status);
    return await r.json();
  },
  sendMessage: async function(senderId, receiverId, text) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/messages', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiver_id: receiverId, text })
    }, 8000);
    if (!r.ok) throw new Error('Ошибка отправки сообщения: ' + r.status);
    return await r.json();
  },
  sendReport: async function(reporterId, reportedUserId, reason) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/reports', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reported_user_id: reportedUserId, reason })
    }, 8000);
    if (!r.ok) throw new Error('Ошибка отправки жалобы: ' + r.status);
    return await r.json();
  }
};

// ================================================================
// ============ NEON API ============
// ================================================================
const NEON_API = {
  getProfile: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + userId, { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } }, 8000);
    if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.error || ('Ошибка профиля: ' + r.status)); }
    return await r.json();
  },
  updateProfile: async function(profileData) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles', {
      method: 'PUT', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    }, 8000);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Ошибка сохранения: ' + r.status));
    return data;
  },
  getReadingSessions: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return [];
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/reading-sessions?user_id=' + userId, { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) return [];
    return await r.json();
  },
  getFavorites: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return [];
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/favorites?user_id=' + userId, { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) return [];
    return await r.json();
  },
  getUserAchievements: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    if (!token || !userId) return [];
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/user-achievements?user_id=' + userId, { headers: { 'Authorization': 'Bearer ' + token } }, 8000);
    if (!r.ok) return [];
    return await r.json();
  },
  checkResetEligibility: async function(identifier) {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/check-reset-eligibility', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier })
    }, 8000);
    return await r.json();
  },
  resetPassword: async function(identifier, code, newPassword) {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword })
    }, 8000);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Ошибка сброса: ' + r.status));
    return data;
  }
};

// ================================================================
// ============ SUPABASE API ============
// ================================================================
async function apiGet(table, opts) {
  opts = opts || {};
  const eq = opts.eq, order = opts.order, limit = opts.limit;
  let url = KITOB_CONFIG.SUPABASE_REST + '/' + table;
  const params = new URLSearchParams();
  if (eq) params.append(eq.column + '=eq.' + eq.value);
  if (order) params.append('order', order);
  if (limit) params.append('limit', limit);
  const fullUrl = params.toString() ? (url + '?' + params) : url;
  const r = await fetchWithTimeout(fullUrl, {
    headers: { 'apikey': KITOB_CONFIG.SUPABASE_KEY, 'Authorization': 'Bearer ' + KITOB_CONFIG.SUPABASE_KEY }
  }, 6000);
  if (!r.ok) throw new Error('Supabase ' + table + ': ' + r.status);
  return await r.json();
}

// ================================================================
// ============ НОВЫЕ ФУНКЦИИ ДЛЯ УВЕДОМЛЕНИЙ И ОБЪЯВЛЕНИЙ ============
// ================================================================

async function getNotifications() {
  const token = localStorage.getItem('kk_token');
  if (!token) return [];
  try {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 5000);
    if (!r.ok) return [];
    return await r.json();
  } catch (e) {
    console.warn('getNotifications error:', e);
    return [];
  }
}

async function markNotificationRead(notificationId) {
  const token = localStorage.getItem('kk_token');
  if (!token) return;
  try {
    await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/notifications/' + notificationId + '/read', {
      method: 'PUT', headers: { 'Authorization': 'Bearer ' + token }
    }, 5000);
  } catch (e) {
    console.warn('markNotificationRead error:', e);
  }
}

const KKH_FCM = {
  firebaseConfig: {
    apiKey: "AIzaSyDWmg_6KS_v82IK7P-QrLj8GP2dh5tk29Y",
    authDomain: "kitobkhona-push.firebaseapp.com",
    projectId: "kitobkhona-push",
    storageBucket: "kitobkhona-push.firebasestorage.app",
    messagingSenderId: "507779702083",
    appId: "1:507779702083:web:3dbd554961b290e854e3f6",
    measurementId: "G-2G9G2SXCTQ"
  },
vapidKey: 'BNhCnlt0kKCnYpeBGqYGRHikPqXCkpkt3Fj5G7X2XDM8EV7qj3xLtDQa8PYh_Sp3g21CLCdz7GoBILxMjnBFUJM'
};

function loadFirebaseMessagingSdk() {
  if (window.firebase && window.firebase.messaging) {
    return Promise.resolve();
  }
  const urls = [
    'https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js'
  ];
  return Promise.all(urls.map(url => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Firebase script: ' + url));
    document.head.appendChild(script);
  }))).then(() => {
    if (window.firebase && !firebase.apps.length) {
      firebase.initializeApp(KKH_FCM.firebaseConfig);
    }
  });
}

async function registerFcmToken() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;
  const token = localStorage.getItem('kk_token');
  if (!token) return null;
  if (Notification.permission === 'denied') {
    return null;
  }

  try {
    await loadFirebaseMessagingSdk();
    const registration = await navigator.serviceWorker.register('./sw.js');
    const messaging = firebase.messaging();
    const currentToken = await messaging.getToken({
      serviceWorkerRegistration: registration,
      vapidKey: KKH_FCM.vapidKey || undefined
    });
    if (!currentToken) return null;

    const storedToken = localStorage.getItem('kk_fcm_token');
    if (storedToken === currentToken) {
      return currentToken;
    }

    const resp = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/push/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ token: currentToken, platform: 'web' })
    }, 7000);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Push token registration failed');
    }

    localStorage.setItem('kk_fcm_token', currentToken);
    return currentToken;
  } catch (e) {
    console.warn('registerFcmToken error:', e);
    return null;
  }
}

async function requestPushPermission() {
  if (!('Notification' in window)) return null;
  if (Notification.permission === 'granted') {
    return registerFcmToken();
  }
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      return registerFcmToken();
    }
  }
  return null;
}

async function initFirebaseMessaging() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  const token = localStorage.getItem('kk_token');
  if (Notification.permission === 'granted') {
    await registerFcmToken();
    return;
  }
  // Автозапрос: если пользователь залогинен и разрешение ещё не спрашивали
  if (token && Notification.permission === 'default') {
    // небольшой delay, чтобы страница успела загрузиться
    setTimeout(async () => {
      try {
        // Красивый pre-prompt
        const ok = confirm(`🔔 Огоҳиҳои китобҳои навро фаъол созем?

Шумо аз китобҳои нав, паёмҳо ва ғолибон огоҳ мешавед.`);
        if (ok) {
          await requestPushPermission();
        }
      } catch(e){}
    }, 2500);
  }
}

// Foreground FCM messages – показываем тост, обновляем badge
async function initFcmForeground() {
  try {
    await loadFirebaseMessagingSdk();
    if (window.firebase && firebase.messaging) {
      const messaging = firebase.messaging();
      messaging.onMessage((payload) => {
        const title = payload.notification?.title || 'Китобхона';
        const body = payload.notification?.body || '';
        if (typeof toast === 'function') toast('🔔 ' + title + (body ? ': ' + body : ''));
        // обновляем badge если функция есть
        if (typeof updateNotifBadge === 'function') updateNotifBadge();
        // системное уведомление тоже покажем, если страница не в фокусе
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icon-192.png' });
        }
      });
    }
  } catch(e) { console.warn('FCM foreground init failed', e); }
}

// вызываем foreground listener после инициализации
const _oldInitFM = initFirebaseMessaging;
initFirebaseMessaging = async function() { await _oldInitFM(); initFcmForeground(); };


async function getActiveAnnouncement() {
  try {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/announcements/active', {}, 4000);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn('getActiveAnnouncement error:', e);
    return null;
  }
}

async function getAdminQuotes() {
  try {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/admin/quotes', {}, 5000);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn('getAdminQuotes error:', e);
    return null;
  }
}

// ================================================================
// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
// ================================================================
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function el(id) { return document.getElementById(id); }

// ======================== ГЛОБАЛЬНЫЙ ТОСТ (если не определён) =========================
if (typeof toast !== 'function') {
  window.toast = function(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    t.style.cssText = `
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      background: var(--bg2, #142236); color: var(--text, #F0EAD6);
      padding: 10px 20px; border-radius: 99px;
      border: 1px solid var(--border, rgba(201,168,76,0.2));
      z-index: 10000;
      font-size: 14px; font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      opacity: 0; transition: opacity 0.25s;
      pointer-events: none;
    `;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '1'; }, 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
  };
}
