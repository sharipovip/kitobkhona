
const KITOB_CONFIG = {
  EDGE_API_BASE: 'https://kitobkhona-edge.tojik.workers.dev',
  NEON_API_BASE: 'https://kitobkhona-chat.onrender.com',
  SUPABASE_REST: 'https://dwkdzfqooprxytlepaoo.supabase.co/rest/v1',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2R6ZnFvb3ByeHl0bGVwYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDI5ODIsImV4cCI6MjA5NjQ3ODk4Mn0.4rV_7yN5Urx5WHgb9kAxWo_VmrPWGlbFYN4Ij7DcuyI'
};



const APP_VERSION = '1.0.0';

const KKH_THEMES = {
  dark: { label: 'Шаб', icon: '🌙', bg: '#0D1B2A', bg2: '#142236', card: '#1A2D44', card2: '#1E3350', text: '#F0EAD6', cream: '#F0EAD6', muted: '#A8B8CC', gold: '#C9A84C', gold2: '#E8C96D', line: 'rgba(201,168,76,.22)', red: '#D96B63', green: '#63C58A' },
  light: { label: 'Рӯз', icon: '☀️', bg: '#F5F0E8', bg2: '#EDE5D6', card: '#FFFDF7', card2: '#F4EBDD', text: '#243247', cream: '#243247', muted: '#667085', gold: '#A47718', gold2: '#C99D32', line: 'rgba(122,88,18,.2)', red: '#B94A43', green: '#2F8F5B' },
  gold: { label: 'Тиллоӣ', icon: '✨', bg: '#21170D', bg2: '#302112', card: '#422B13', card2: '#573A17', text: '#FFF1C7', cream: '#FFF1C7', muted: '#D5B77A', gold: '#E2A93B', gold2: '#FFD979', line: 'rgba(226,169,59,.3)', red: '#E4775F', green: '#7ECF8B' },
  flag: { label: 'Парчам', icon: '🇹🇯', bg: '#160F18', bg2: '#241725', card: '#30202A', card2: '#3A2630', text: '#FFF6EE', cream: '#FFF6EE', muted: '#D8B7B2', gold: '#E3B341', gold2: '#F4D27B', line: 'rgba(217,72,70,.3)', red: '#D94846', green: '#4DAA74' },
  book: { label: 'Китоб', icon: '📖', bg: '#1B120D', bg2: '#2A1B13', card: '#3A2418', card2: '#4B3020', text: '#F7E6C5', cream: '#F7E6C5', muted: '#C9AD8C', gold: '#D8A64B', gold2: '#F0C878', line: 'rgba(216,166,75,.27)', red: '#C86A55', green: '#6CA878' }
};
const KKH_THEME_ORDER = ['dark', 'light', 'gold', 'flag', 'book'];
window.KKH_THEMES = KKH_THEMES;
const KKH_LANGUAGES = { tg: 'Тоҷикӣ', ru: 'Русский', en: 'English' };
const KKH_TRANSLATIONS = {
  tg: {
    'Настройка':'Танзимот','Настройкаҳо':'Танзимот','О программе':'Дар бораи барнома','Открыть чат':'Чатро кушоед','Отправить':'Фиристодан','Отмена':'Бекор кардан','Назад':'Бозгашт','Удалить':'Нест кардан','Удалить чат':'Нест кардани чат','Очистить чат':'Тоза кардани чат','Показать':'Нишон додан','Скрыть':'Пинҳон кардан','Профиль':'Профил','Книги':'Китобҳо','Закладки':'Дӯстдошта','Посты':'Постҳо','Главная':'Асосӣ','Лента':'Лента','Чаты':'Чатҳо','Друзья':'Дӯстон','Гости':'Меҳмон','Новый пост':'Пости нав','Поиск':'Ҷустуҷӯ','Выбрать':'Интихоб кардан','Сохранить':'Нигоҳ доштан','Закладка':'Дӯстдошта','Книга':'Китоб','Автор':'Муаллиф','Комментарий':'Шарҳ','Комментарии':'Шарҳҳо','Готово':'Тайёр','Ошибка':'Хато','Загрузка':'Боргирӣ','Доступно':'Дастрас','Недоступно':'Дастрас нест','День':'Рӯз','Ночь':'Шаб','Тёмная тема':'Мавзӯи шаб','Светлая тема':'Мавзӯи рӯз','Помощь':'Ёрӣ','Связаться с нами':'Бо мо тамос гирифтан','Показать пароль':'Нишон додани парол','Скрыть пароль':'Пинҳон кардани парол'
  },
  ru: {
    'Асосӣ':'Главная','Китобҳо':'Книги','Китобхо':'Книги','Профил':'Профиль','Лента':'Лента','Ғолибон':'Победители','Чатҳо':'Чаты','Чат':'Чат','Дӯстон':'Друзья','Дӯст':'Друг','Дӯстдошта':'Избранное','Пост':'Пост','Постҳо нестанд':'Постов нет','Китобҳо нестанд':'Книг нет','Китобхон':'Читатель','Танзимот':'Настройки','Настройка':'Настройки','Тарзи шаб':'Ночной режим','Рӯзи рӯшноӣ':'Дневной режим','Тамос бо мо':'Связаться с нами','Пешниҳод ва пешниҳодҳо':'Предложения и отзывы','Дар бораи барнома':'О программе','Ёрӣ ва истифода':'Помощь и использование','Чӣ тавр аз барнома истифода бурдан':'Как пользоваться приложением','Баромадан':'Выйти','Нест кардани ҳисоб':'Удалить аккаунт','Таҳрири профил':'Редактировать профиль','Ном':'Имя','Насаб':'Фамилия','Соли таваллуд':'Год рождения','Пол':'Пол','Вилоят':'Регион','Шаҳр/ноҳия':'Город/район','Ҷамоат':'Джамоат','Деҳа/Село':'Село','Нишон додан':'Показать','Пинҳон кардан':'Скрыть','Нигоҳ доштан':'Сохранить','Бекор кардан':'Отмена','Дӯст кардан':'Добавить в друзья','Дӯстон':'Друзья','Интизор шавед':'Ожидайте','Қабул кардан':'Принять','Китобхона':'Китобхона','Ҷустуҷӯ...':'Поиск...','Интихоб кунед':'Выберите','Хондан':'Читать','Мубодила':'Поделиться','Хабар':'Сообщение','Тасдиқ':'Подтвердить','Хато':'Ошибка','Боргирӣ...':'Загрузка...','Пайвастшавӣ нест':'Нет подключения','Шумо интернет надоред':'Нет подключения к интернету'
  },
  en: {
    'Асосӣ':'Home','Китобҳо':'Books','Китобхо':'Books','Профил':'Profile','Лента':'Feed','Ғолибон':'Winners','Чатҳо':'Chats','Чат':'Chat','Дӯстон':'Friends','Дӯст':'Friend','Дӯстдошта':'Favorites','Пост':'Post','Постҳо нестанд':'No posts','Китобҳо нестанд':'No books','Китобхон':'Reader','Танзимот':'Settings','Настройка':'Settings','Тарзи шаб':'Night mode','Рӯзи рӯшноӣ':'Day mode','Тамос бо мо':'Contact us','Пешниҳод ва пешниҳодҳо':'Suggestions and feedback','Дар бораи барнома':'About the app','Ёрӣ ва истифода':'Help and usage','Чӣ тавр аз барнома истифода бурдан':'How to use the app','Баромадан':'Log out','Нест кардани ҳисоб':'Delete account','Таҳрири профил':'Edit profile','Ном':'First name','Насаб':'Last name','Соли таваллуд':'Birth year','Пол':'Gender','Вилоят':'Region','Шаҳр/ноҳия':'City/district','Ҷамоат':'Jamoat','Деҳа/Село':'Village','Нишон додан':'Show','Пинҳон кардан':'Hide','Нигоҳ доштан':'Save','Бекор кардан':'Cancel','Дӯст кардан':'Add friend','Интизор шавед':'Please wait','Қабул кардан':'Accept','Китобхона':'Kitobkhona','Ҷустуҷӯ...':'Search...','Интихоб кунед':'Choose','Хондан':'Read','Мубодила':'Share','Хабар':'Message','Тасдиқ':'Confirm','Хато':'Error','Боргирӣ...':'Loading...','Пайвастшавӣ нест':'No connection','Шумо интернет надоред':'No internet connection'
  }
};
Object.assign(KKH_TRANSLATIONS.ru,{
  'Ворид шудан':'Войти','Сохтани ҳисоби худ / Ворид шудан':'Создать аккаунт / Войти','Нест кардан':'Удалить','Тоза кардани чат':'Очистить чат','Бастани корбар':'Заблокировать пользователя','Шикоят кардан':'Пожаловаться','Паёмак':'Сообщение','Паёмаки нав':'Новое сообщение','Дархости нави дӯстӣ':'Новая заявка в друзья','Тағйири акс':'Изменить фото','Нест кардани акс':'Удалить фото','Саҳифа':'Страница','Мавзӯъ':'Тема','Дурахшонӣ':'Яркость','Мубодила':'Поделиться','Зеркашӣ':'Скачать'
});
Object.assign(KKH_TRANSLATIONS.en,{
  'Ворид шудан':'Sign in','Сохтани ҳисоби худ / Ворид шудан':'Create account / Sign in','Нест кардан':'Delete','Тоза кардани чат':'Clear chat','Бастани корбар':'Block user','Шикоят кардан':'Report','Паёмак':'Message','Паёмаки нав':'New message','Дархости нави дӯстӣ':'New friend request','Тағйири акс':'Change photo','Нест кардани акс':'Delete photo','Саҳифа':'Page','Мавзӯъ':'Theme','Дурахшонӣ':'Brightness','Мубодила':'Share','Зеркашӣ':'Download'
});
Object.assign(KKH_TRANSLATIONS.ru,{
  'Ҳамаи дӯстон':'Все друзья','Чатҳо':'Чаты','Дархостҳо':'Запросы','Қабул':'Принять','Рад':'Отклонить','НАВ':'НОВЫЙ','Чати фаъол нест. Аз рӯйхати боло дӯстро интихоб кунед.':'Активных чатов нет. Выберите друга выше.','Ҷустуҷӯи чатҳо...':'Поиск чатов...','Асосӣ':'Главная','Ғолибон':'Победители','Профил':'Профиль','Китобҳо':'Книги','Таҳрири профил':'Редактировать профиль','Китобхон':'Читатель','китобҳо':'книги','дӯстон':'друзья','дӯстдошта':'избранное','Пост':'Публикации','Танзимот':'Настройки','Тарзи шаб':'Ночная тема','Интихоби мавзӯъ':'Выбор темы','Ёрӣ ва истифода':'Помощь','Тамос бо мо':'Связаться с нами','Дар бораи барнома':'О приложении','Сиёсати махфият':'Политика конфиденциальности','Шартҳои истифода':'Условия использования','Баромадан':'Выйти','Нест кардани ҳисоб':'Удалить аккаунт','Нигоҳ доштан':'Сохранить','Бекор кардан':'Отмена','Сохтани ҳисоби худ':'Создать аккаунт','Бақайдгирӣ':'Регистрация','Логин ё почтаи электронӣ':'Логин или электронная почта','Парол':'Пароль','Рамзро фаромӯш кардед?':'Забыли пароль?','Меҳмон (бе сабти ном)':'Гость (без регистрации)','Соли таваллуд':'Год рождения','Вилоят':'Регион','Шаҳр / Ноҳия':'Город / район','Ҷамоат':'Джамоат','Деҳа / Маҳалла':'Село / махалля','Мард':'Мужчина','Зан':'Женщина','Паём нависед...':'Напишите сообщение...','Вокунишҳо':'Реакции','Баҳо диҳед':'Оцените'
});
Object.assign(KKH_TRANSLATIONS.en,{
  'Ҳамаи дӯстон':'All friends','Чатҳо':'Chats','Дархостҳо':'Requests','Қабул':'Accept','Рад':'Decline','НАВ':'NEW','Чати фаъол нест. Аз рӯйхати боло дӯстро интихоб кунед.':'No active chats. Choose a friend above.','Ҷустуҷӯи чатҳо...':'Search chats...','Асосӣ':'Home','Ғолибон':'Winners','Профил':'Profile','Китобҳо':'Books','Таҳрири профил':'Edit profile','Китобхон':'Reader','китобҳо':'books','дӯстон':'friends','дӯстдошта':'favorites','Пост':'Posts','Танзимот':'Settings','Тарзи шаб':'Night theme','Интихоби мавзӯъ':'Theme selection','Ёрӣ ва истифода':'Help','Тамос бо мо':'Contact us','Дар бораи барнома':'About','Сиёсати махфият':'Privacy Policy','Шартҳои истифода':'Terms of Use','Баромадан':'Sign out','Нест кардани ҳисоб':'Delete account','Нигоҳ доштан':'Save','Бекор кардан':'Cancel','Сохтани ҳисоби худ':'Create account','Бақайдгирӣ':'Registration','Логин ё почтаи электронӣ':'Username or email','Парол':'Password','Рамзро фаромӯш кардед?':'Forgot password?','Меҳмон (бе сабти ном)':'Guest (no registration)','Соли таваллуд':'Birth year','Вилоят':'Region','Шаҳр / Ноҳия':'City / district','Ҷамоат':'Jamoat','Деҳа / Маҳалла':'Village / neighborhood','Мард':'Male','Зан':'Female','Паём нависед...':'Write a message...','Вокунишҳо':'Reactions','Баҳо диҳед':'Rate this book'
});
let kkhLanguageObserver = null;
const kkhOriginalText = new WeakMap();
function translateTextNode(node, lang) {
  const original = kkhOriginalText.has(node) ? kkhOriginalText.get(node) : node.nodeValue;
  if (!kkhOriginalText.has(node)) kkhOriginalText.set(node, original);
  const trimmed = original.trim();
  if (!trimmed) return;
  const translated = (KKH_TRANSLATIONS[lang] || {})[trimmed];
  if (translated) node.nodeValue = original.replace(trimmed, translated);
}
function translatePage(lang) {
  const root = document.body;
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (parent && !['SCRIPT','STYLE','TEXTAREA'].includes(parent.tagName)) translateTextNode(node, lang);
  }
  root.querySelectorAll('input[placeholder],textarea[placeholder],button[title],[title]').forEach(el => {
    ['placeholder','title','aria-label'].forEach(attr => {
      const value = el.getAttribute(attr);
      const translated = value && (KKH_TRANSLATIONS[lang] || {})[value];
      if (translated) el.setAttribute(attr, translated);
    });
  });
}
function setAppLanguage(lang, persist = true) {
  const name = KKH_LANGUAGES[lang] ? lang : 'tg';
  document.documentElement.lang = name;
  if (persist) localStorage.setItem('kk_lang', name);
  translatePage(name);
  if (!kkhLanguageObserver && document.body) {
    kkhLanguageObserver = new MutationObserver(() => {
      if (kkhLanguageObserver._busy) return;
      kkhLanguageObserver._busy = true;
      translatePage(name);
      kkhLanguageObserver._busy = false;
    });
    kkhLanguageObserver.observe(document.body, { childList: true, subtree: true });
  }
  document.dispatchEvent(new CustomEvent('kitobkhona-language-change', { detail: name }));
  return name;
}
function getAppLanguage() { return localStorage.getItem('kk_lang') || 'tg'; }
window.KKH_LANGUAGES = KKH_LANGUAGES;
window.setAppLanguage = setAppLanguage;
window.getAppLanguage = getAppLanguage;

function verifiedBadgeSvg(extraClass = '') {
  return `<span class="kk-verified-badge ${extraClass}" title="Корбари тасдиқшуда" aria-label="Тасдиқшуда"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#2140F3"/><path d="M8.5 16.2l4.7 4.8L23.8 10.7" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
}
window.verifiedBadgeSvg = verifiedBadgeSvg;
function installVerificationBadgeStyles() {
  if (document.getElementById('kk-verified-styles')) return;
  const style = document.createElement('style');
  style.id = 'kk-verified-styles';
  style.textContent = `.kk-verified-badge{display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;width:17px;height:17px;margin-left:5px;flex:0 0 17px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.24))}.kk-verified-badge svg{display:block;width:100%;height:100%}`;
  document.head.appendChild(style);
}

function installThemeStyles() {
  if (document.getElementById('kitobkhona-theme-styles')) return;
  const style = document.createElement('style');
  style.id = 'kitobkhona-theme-styles';
  style.textContent = Object.entries(KKH_THEMES).map(([name, t]) => `
    html[data-app-theme="${name}"], body[data-app-theme="${name}"] {
      --bg:${t.bg}; --bg2:${t.bg2}; --card:${t.card}; --card-2:${t.card2}; --card2:${t.card2};
      --text:${t.text}; --cream:${t.cream}; --muted:${t.muted}; --gold:${t.gold}; --gold2:${t.gold2};
      --line:${t.line}; --border:${t.line}; --red:${t.red}; --green:${t.green};
      --gold-soft:${t.line}; --card-soft:${t.bg2};
    }
  `).join('');
  document.head.appendChild(style);
}

function setAppTheme(themeName, persist = true) {
  const name = KKH_THEMES[themeName] ? themeName : 'dark';
  installThemeStyles();
  document.documentElement.dataset.appTheme = name;
  if (document.body) document.body.dataset.appTheme = name;
  document.body?.classList.toggle('light-theme', name === 'light');
  if (persist) localStorage.setItem('kk_theme', name);
  const t = KKH_THEMES[name];
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.textContent = t.icon;
  if (typeof updateThemeUI === 'function') updateThemeUI(name);
  document.dispatchEvent(new CustomEvent('kitobkhona-theme-change', { detail: name }));
  return name;
}

function getAppTheme() { return localStorage.getItem('kk_theme') || 'dark'; }


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


function getBookUrl(folder, file) {
  const repo = 'sharipovip/books';
  const branch = 'main';
  let cleanFolder = String(folder).replace(/^books\//, '');
  if (!cleanFolder) cleanFolder = '';
  const encodedFolder = cleanFolder ? cleanFolder.split('/').map(encodeURIComponent).join('/') : '';
  const encodedFile = encodeURIComponent(file);
  return `https://raw.githubusercontent.com/${repo}/${branch}/books/${encodedFolder ? encodedFolder + '/' : ''}${encodedFile}`;
}


function canonicalBookUrl(value) {
  const raw=String(value||'').trim();if(!raw)return raw;
  try{const u=new URL(raw);let owner='',repo='',branch='',parts=[];
    if(u.hostname==='raw.githubusercontent.com'){const p=u.pathname.split('/').filter(Boolean);owner=p.shift()||'';repo=p.shift()||'';branch=p.shift()||'main';parts=p}
    else if(u.hostname==='cdn.jsdelivr.net'){const p=u.pathname.replace(/^\/gh\//,'').split('/').filter(Boolean);const first=p.shift()||'';owner=first;const second=p.shift()||'';const at=second.lastIndexOf('@');repo=at>=0?second.slice(0,at):second;branch=at>=0?second.slice(at+1):'main';parts=p}
    else return raw;
    const clean=parts.map(part=>{let x=part;for(let i=0;i<3;i++){try{const y=decodeURIComponent(x);if(y===x)break;x=y}catch(e){break}}return encodeURIComponent(x)}).join('/');
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${clean}`;
  }catch(e){return raw}
}
window.canonicalBookUrl=canonicalBookUrl;
const KITOB_PDF_CACHE = 'kitobkhona-pdf-cache-v1';
const kitobPdfInflight = new Map();
async function getCachedBookResponse(value){
  if(!('caches' in window))return null;
  const key=canonicalBookUrl(value),cache=await caches.open(KITOB_PDF_CACHE);let hit=await cache.match(key);
  if(hit)return hit;
  for(const req of await cache.keys()){
    if(canonicalBookUrl(req.url)===key){hit=await cache.match(req);if(hit){try{await cache.put(key,hit.clone())}catch(e){}return hit}}
  }
  return null;
}
window.getCachedBookResponse=getCachedBookResponse;
async function getOrFetchBookResponse(value,{onProgress}={}){
  const key=canonicalBookUrl(value);if(!key)throw new Error('PDF URL required');
  const cached=await getCachedBookResponse(key);if(cached)return cached.clone();
  if(kitobPdfInflight.has(key))return (await kitobPdfInflight.get(key)).clone();
  const task=(async()=>{
    const response=await fetch(key,{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);
    const total=Number(response.headers.get('content-length')||0);let loaded=0,blob;
    if(response.body&&response.body.getReader){const reader=response.body.getReader(),chunks=[];while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;if(onProgress)onProgress(loaded,total)}blob=new Blob(chunks,{type:response.headers.get('content-type')||'application/pdf'});}
    else{blob=await response.blob();loaded=blob.size;if(onProgress)onProgress(loaded,total||loaded)}
    const stored=new Response(blob,{status:200,headers:{'Content-Type':'application/pdf','Content-Length':String(blob.size),'X-Kitob-Canonical':key}});
    if('caches' in window){const cache=await caches.open(KITOB_PDF_CACHE);await cache.put(key,stored.clone())}
    return stored;
  })();
  kitobPdfInflight.set(key,task);try{return (await task).clone()}finally{kitobPdfInflight.delete(key)}
}
window.getOrFetchBookResponse=getOrFetchBookResponse;

function beginActionProgress(label='Амалиёт иҷро шуда истодааст...'){
  let overlay=document.getElementById('kkActionProgress');if(overlay)overlay.remove();overlay=document.createElement('div');overlay.id='kkActionProgress';overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(2,8,18,.68);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(7px)';overlay.innerHTML=`<div style="width:min(340px,100%);background:var(--bg2,#142236);border:1px solid var(--border,rgba(201,168,76,.2));border-radius:18px;padding:22px;color:var(--text,#F0EAD6);text-align:center;box-shadow:0 22px 60px rgba(0,0,0,.45)"><div class="loader" style="margin:0 auto 14px"></div><div id="kkActionLabel" style="font-weight:700">${String(label).replace(/</g,'&lt;')}</div><div style="height:7px;background:rgba(255,255,255,.09);border-radius:99px;overflow:hidden;margin-top:16px"><div id="kkActionBar" style="height:100%;width:4%;background:linear-gradient(90deg,#C9A84C,#E8C96D);transition:width .3s"></div></div><div id="kkActionPct" style="font-size:11px;color:var(--gold2,#E8C96D);margin-top:6px">4%</div></div>`;document.body.appendChild(overlay);let pct=4;const timer=setInterval(()=>{pct=Math.min(92,pct+(pct<55?4:1));overlay.querySelector('#kkActionBar').style.width=pct+'%';overlay.querySelector('#kkActionPct').textContent=pct+'%'},360);return{done(message){clearInterval(timer);const l=overlay.querySelector('#kkActionLabel');if(l)l.textContent=message||'Омода шуд';overlay.querySelector('#kkActionBar').style.width='100%';overlay.querySelector('#kkActionPct').textContent='100%';setTimeout(()=>overlay.remove(),450)},fail(message){clearInterval(timer);overlay.querySelector('#kkActionLabel').textContent=message||'Хатогӣ';overlay.querySelector('#kkActionPct').textContent='!';setTimeout(()=>overlay.remove(),1400)},close(){clearInterval(timer);overlay.remove()}}
}
window.beginActionProgress=beginActionProgress;

async function clearBookCache() {
  try {
    if ('caches' in window) {
      const cache = await caches.open('kitobkhona-pdf-cache-v1');
      const keys = await cache.keys();
      await Promise.all(keys.map(request => cache.delete(request)));
    }
    localStorage.removeItem('kk_cached_books');
    toast('✅ Кэш книг очищен!');
  } catch(e) {
    toast('❌ Ошибка при очистке кэша', true);
  }
}


function showAbout() {
  return showAlertDialog(`Китобхона · Манбаи дониш\nНашри аввал · версия ${APP_VERSION}\n\nКитобхонаи рақамии тоҷикӣ барои мутолиа, нигоҳдории китобҳо ва рушди дониш.\nСохта шудааст бо ❤️ барои хонандагон.\n\n© 2026 Sharipov. Ҳуқуқи барнома ва дизайни он ҳифз шудааст. Ҳуқуқи китобҳо ба муаллифон ва соҳибони онҳо тааллуқ дорад.`, 'Дар бораи барнома');
}


function contactUs() {
  const feedbackOverlay = document.getElementById('feedbackOverlay');
  if (feedbackOverlay) {
    feedbackOverlay.classList.add('open');
  } else {
    window.location.href = 'mailto:info@kitobkhona.tj?subject=Связь с Китобхона';
  }
}


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

  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeSettingsModal();
  });

  modal.querySelector('#closeSettingsBtn').addEventListener('click', closeSettingsModal);

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


function toggleTheme() {
  const current = getAppTheme();
  const index = KKH_THEME_ORDER.indexOf(current);
  return setAppTheme(KKH_THEME_ORDER[(index + 1) % KKH_THEME_ORDER.length]);
}

function initTheme() {
  setAppTheme(getAppTheme(), false);
}


function initSettings() {
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

function initNetworkStatus() {
  const banner = document.createElement('div');
  banner.id = 'kitobkhona-network-status';
  banner.textContent = 'Шумо интернет надоред · баъзе имкониятҳо дастрас нестанд';
  banner.style.cssText = 'position:fixed;left:12px;right:12px;bottom:70px;z-index:99999;display:none;padding:10px 14px;border-radius:14px;background:#42202a;color:#ffe9e9;border:1px solid rgba(255,120,120,.45);font:600 13px/1.35 Arial,sans-serif;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.25)';
  document.body.appendChild(banner);
  const update = () => { banner.style.display = navigator.onLine ? 'none' : 'block'; };
  window.addEventListener('offline', update);
  window.addEventListener('online', update);
  update();
}

document.addEventListener('DOMContentLoaded', function() {
  installVerificationBadgeStyles();
  initNetworkStatus();
  initTheme();
  setAppLanguage(getAppLanguage(), false);
  initSettings();
});


function fetchWithTimeout(url, options, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Сервер не ответил (' + (timeoutMs/1000) + 'с)')), timeoutMs))
  ]);
}

async function edgeApiFetch(path, options, timeoutMs) {
  const cleanPath = String(path || '').startsWith('/') ? String(path) : '/' + String(path || '');
  const opts = options || {};
  try {
    const edgeResponse = await fetchWithTimeout(KITOB_CONFIG.EDGE_API_BASE + cleanPath, opts, timeoutMs || 7000);
    if (edgeResponse.ok || edgeResponse.status < 500) return edgeResponse;
  } catch (e) {}
  return fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + cleanPath, opts, timeoutMs || 8000);
}
window.edgeApiFetch = edgeApiFetch;

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

function getToastEl() {
  return document.getElementById('toast') || document.querySelector('.toast');
}

async function cachedBookBlob(url,onProgress){
  const response=await getOrFetchBookResponse(url,{onProgress});return await response.blob();
}
function rememberCachedBook(url,name,blob){try{const m=JSON.parse(localStorage.getItem('kk_cached_books')||'{}'),key=canonicalBookUrl(url);m[key]={url:key,name:name||'Китоб',cover:'',ts:Date.now(),size:blob.size};localStorage.setItem('kk_cached_books',JSON.stringify(m))}catch(e){}}
async function shareFile(url, name) {
  url=canonicalBookUrl(url);const toastEl=getToastEl();
  try {
    if(toastEl){toastEl.textContent='Омодасозии китоб...';toastEl.classList.add('show')}
    const blob=await cachedBookBlob(url);rememberCachedBook(url,name,blob);const fileName=(name||'kitob')+'.pdf';
    if(isAndroid()&&typeof AndroidBridge.shareFile==='function'){AndroidBridge.shareFile(await blobToBase64(blob),fileName,'application/pdf');if(toastEl)toastEl.classList.remove('show');return}
    if(navigator.canShare&&navigator.share){const file=new File([blob],fileName,{type:'application/pdf'});if(navigator.canShare({files:[file]})){await navigator.share({title:name,files:[file]});if(toastEl)toastEl.classList.remove('show');return}}
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fileName;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},5000);
    if(toastEl){toastEl.textContent='Файл боргирӣ шуд';setTimeout(()=>toastEl.classList.remove('show'),2500)}
  }catch(e){if(e.name!=='AbortError'&&toastEl){toastEl.textContent='Мубодила нашуд: '+e.message;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),3000)}}
}
async function downloadFile(url,name,showProgress=true){
  url=canonicalBookUrl(url);const toastEl=getToastEl();
  try{
    const already=await getCachedBookResponse(url);if(toastEl&&showProgress){toastEl.textContent=already?'✓ Аз ҳифзшуда гирифта шуд':'Ҳифз шуда истодааст... 0%';toastEl.classList.add('show')}
    const blob=await cachedBookBlob(url,(loaded,total)=>{if(toastEl&&showProgress&&total)toastEl.textContent=`Ҳифз шуда истодааст... ${Math.min(100,Math.round(loaded*100/total))}%`});rememberCachedBook(url,name,blob);
    const fileName=(name||'kitob')+'.pdf';if(isAndroid()&&typeof AndroidBridge.saveFile==='function'){AndroidBridge.saveFile(await blobToBase64(blob),fileName,'application/pdf');if(toastEl){toastEl.textContent='✓ Файл барои захира кардан омода';setTimeout(()=>toastEl.classList.remove('show'),2000)}return}
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fileName;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},5000);if(toastEl){toastEl.textContent='✓ Китоб боргирӣ шуд';setTimeout(()=>toastEl.classList.remove('show'),2000)}
  }catch(e){if(toastEl){toastEl.textContent='Хатогӣ: '+e.message;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),3000)}console.error('Download error:',e)}
}

const AutoLogin = {
  currentUser: null,
  autoLogin: async function(showChoice) {
    if (localStorage.getItem('kk_device_blocked') === 'true') throw new Error('Устройство заблокировано. Создание гостя невозможно.');
    const savedToken = localStorage.getItem('kk_token');
    const savedUserId = localStorage.getItem('kk_user_id');
    const savedUsername = localStorage.getItem('kk_username');
    if (savedToken && savedUserId) {
      this.currentUser = { token: savedToken, userId: savedUserId, username: savedUsername || 'user' };
      (async () => {
        try {
          const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + savedUserId, { headers: { 'Authorization': 'Bearer ' + savedToken }, cache: 'no-store' }, 10000);
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
          // Background validation must never block cached app startup.
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
      }, 20000);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        if (response.status === 409) {
          const loginResp = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, device_fp: getDeviceFingerprint() })
          }, 20000);
          const loginData = await loginResp.json().catch(() => ({}));
          if (loginResp.ok && loginData.token) {
            const profileResp = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/profiles/' + loginData.userId, {
              headers: { 'Authorization': 'Bearer ' + loginData.token }
            }, 10000);
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
        body: JSON.stringify({ username, password, device_fp: getDeviceFingerprint() })
      }, 12000);
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

const AUTH = {
  getUser: async function() {
    const token = localStorage.getItem('kk_token');
    const userId = localStorage.getItem('kk_user_id');
    const username = localStorage.getItem('kk_username');
    if (!token || !userId) return { data: { user: null } };
    const cached = localStorage.getItem('kk_profile_cache');
    let profile = null;
    if (cached) {
      try {
        const p = JSON.parse(cached);
        if (p && p.id && (Date.now() - p._ts < 15 * 60 * 1000)) profile = p;
      } catch(e) {}
    }
    if (profile) {
      NEON_API.getProfile(userId).then(p => {
        localStorage.setItem('kk_profile_cache', JSON.stringify({ ...p, _ts: Date.now() }));
      }).catch(() => {});
      return { data: { user: { id: userId, username: username || profile.username || 'user', display_name: profile.display_name || username || 'Китобхон', ...profile } } };
    }
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

const ChatAPI = {
  getFriends: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends', { headers: { 'Authorization': 'Bearer ' + token }, cache: 'no-store' }, 8000);
    if (!r.ok) throw new Error('Ошибка получения друзей: ' + r.status);
    const data = await r.json();
    return data.map(f => f.id);
  },
  getFriendDetails: async function() {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Токен нест');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends', { headers: { 'Authorization': 'Bearer ' + token }, cache: 'no-store' }, 8000);
    if (!r.ok) throw new Error('Хатои рӯйхати дӯстон: ' + r.status);
    return await r.json();
  },
  getFriendRequests: async function(userId) {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/friends/requests', { headers: { 'Authorization': 'Bearer ' + token }, cache: 'no-store' }, 8000);
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
    const r = await fetchWithTimeout(url, { headers: { 'Authorization': 'Bearer ' + token }, cache: 'no-store' }, 8000);
    if (!r.ok) throw new Error('Ошибка получения сообщений: ' + r.status);
    return await r.json();
  },
  getChatSummary: async function() {
    const token = localStorage.getItem('kk_token');
    if (!token) throw new Error('Нет токена');
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/chat-summary', {
      headers: { 'Authorization': 'Bearer ' + token },
      cache: 'no-store'
    }, 8000);
    if (!r.ok) throw new Error('Ошибка сводки чатов: ' + r.status);
    return await r.json();
  },
  markMessagesRead: async function(peerId) {
    const token = localStorage.getItem('kk_token');
    if (!token || !peerId) return null;
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/messages/read', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ peer_id: peerId })
    }, 8000);
    if (!r.ok) throw new Error('Ошибка отметки сообщений: ' + r.status);
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
      body: JSON.stringify({ identifier, device_fp: getDeviceFingerprint() })
    }, 8000);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Ошибка восстановления: ' + r.status));
    return data;
  },
  resetPassword: async function(identifier, code, newPassword) {
    const r = await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE + '/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword, device_fp: getDeviceFingerprint() })
    }, 8000);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Ошибка сброса: ' + r.status));
    return data;
  }
};

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

let firebaseSdkPromise = null;

function loadFirebaseMessagingSdk() {
  if (firebaseSdkPromise) return firebaseSdkPromise;
  if (window.firebase && typeof window.firebase.messaging === 'function') {
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(KKH_FCM.firebaseConfig);
    return Promise.resolve();
  }
  const urls = [
    'https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js'
  ];
  const loadScript = (url) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      if (window.firebase && url.includes('firebase-messaging') && typeof window.firebase.messaging !== 'function') {
        existing.addEventListener('load', resolve, { once: true });
      } else {
        resolve();
      }
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Firebase script: ' + url));
    document.head.appendChild(script);
  });
  firebaseSdkPromise = loadScript(urls[0])
    .then(() => loadScript(urls[1]))
    .then(() => {
      if (!window.firebase || typeof window.firebase.messaging !== 'function') {
        throw new Error('Firebase Messaging SDK is unavailable');
      }
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(KKH_FCM.firebaseConfig);
    })
    .catch(error => {
      firebaseSdkPromise = null;
      throw error;
    });
  return firebaseSdkPromise;
}

function deleteIndexedDatabaseSafe(name) {
  return new Promise(resolve => {
    if (!('indexedDB' in window)) return resolve(false);
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
      request.onblocked = () => setTimeout(() => finish(false), 900);
      setTimeout(() => finish(false), 1800);
    } catch (e) { finish(false); }
  });
}

function inspectFirebaseMessagingDatabase() {
  return new Promise(resolve => {
    if (!('indexedDB' in window)) return resolve(true);
    let request;
    try { request = indexedDB.open('firebase-messaging-database'); }
    catch (e) { return resolve(false); }
    request.onerror = () => resolve(false);
    request.onsuccess = async () => {
      const db = request.result;
      const valid = db.objectStoreNames.contains('firebase-messaging-store');
      db.close();
      if (valid) return resolve(true);
      const deleted = await deleteIndexedDatabaseSafe('firebase-messaging-database');
      localStorage.removeItem('kk_fcm_token');
      resolve(deleted);
    };
  });
}

function isFirebaseIndexedDbSchemaError(error) {
  const message = String(error?.message || error || '');
  return /firebase-messaging-store|not a known object store|IDBDatabase\.transaction/i.test(message);
}

async function registerFcmToken(recoveryAttempt = false) {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;
  const token = localStorage.getItem('kk_token');
  if (!token) return null;
  if (Notification.permission === 'denied') {
    return null;
  }

  try {
    const messagingDbReady = await inspectFirebaseMessagingDatabase();
    if (!messagingDbReady) return null;
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
    if (isFirebaseIndexedDbSchemaError(e)) {
      const deleted = await deleteIndexedDatabaseSafe('firebase-messaging-database');
      localStorage.removeItem('kk_fcm_token');
      if (!recoveryAttempt && deleted) return registerFcmToken(true);
      // Known Firefox IndexedDB schema problem: push will retry on the next page load.
      return null;
    }
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
  if (token && Notification.permission === 'default') {
    setTimeout(async () => {
      try {
        const ok = await showConfirmDialog('🔔 Огоҳиҳои китобҳои навро фаъол созем?\n\nШумо аз китобҳои нав, паёмҳо ва ғолибон огоҳ мешавед.');
        if (ok) {
          await requestPushPermission();
        }
      } catch(e){}
    }, 2500);
  }
}

async function initFcmForeground() {
  try {
    await loadFirebaseMessagingSdk();
    if (window.firebase && firebase.messaging) {
      const messaging = firebase.messaging();
      messaging.onMessage((payload) => {
        const title = payload.notification?.title || 'Китобхона';
        const body = payload.notification?.body || '';
        if (typeof toast === 'function') toast('🔔 ' + title + (body ? ': ' + body : ''));
        if (typeof updateNotifBadge === 'function') updateNotifBadge();
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icon-192.png' });
        }
      });
    }
  } catch(e) { console.warn('FCM foreground init failed', e); }
}

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

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function el(id) { return document.getElementById(id); }

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


function getCoverUrlCandidates(url) {
  const original = String(url || '').trim();
  if (!original) return [];
  const result = [];
  try {
    const parsed = new URL(original);
    if (parsed.hostname === 'raw.githubusercontent.com') {
      const decodedPath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      const parts = decodedPath.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const owner = parts.shift();
        const repo = parts.shift();
        const branch = parts.shift();
        const filePath = parts.map(part => encodeURIComponent(part)).join('/');
        result.push(`https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${filePath}`);
        result.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`);
      }
    }
  } catch (e) {}
  result.push(original);
  return [...new Set(result)];
}
function getCoverUrl(url) { return getCoverUrlCandidates(url)[0] || String(url || ''); }


(function initReadingQueue() {
  const queueKey='kk_pending_reading_sessions'; let running=false; let timer=null;
  function readQueue(){try{const v=JSON.parse(localStorage.getItem(queueKey)||'[]');return Array.isArray(v)?v:[]}catch(e){return[]}}
  function writeQueue(v){try{localStorage.setItem(queueKey,JSON.stringify(v.slice(-50)))}catch(e){} }
  function schedule(){if(timer)clearTimeout(timer);const n=readQueue().sort((a,b)=>Number(a.readyAt||0)-Number(b.readyAt||0))[0];if(n)timer=setTimeout(flush,Math.max(1000,Math.min(86400000,Number(n.readyAt||Date.now())-Date.now())))}
  async function flush(){if(running||!localStorage.getItem('kk_token'))return;running=true;try{const now=Date.now(),wait=[];for(const x of readQueue()){if(Number(x.readyAt||0)>now){wait.push(x);continue}try{const r=await fetchWithTimeout(KITOB_CONFIG.NEON_API_BASE+'/api/reading-sessions',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('kk_token'),'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({book_id:x.book_id,book_title:x.book_title||'Китоб',duration:Math.max(0,Math.round(Number(x.duration)||0)),status:x.status||'completed',pages_read:Math.max(0,Number(x.pages_read)||0)})},8000);if(!r.ok)throw Error('HTTP '+r.status)}catch(e){wait.push({...x,readyAt:Date.now()+60000})}}writeQueue(wait)}finally{running=false;schedule()}}
  window.KKReadingQueue={flush};window.addEventListener('online',flush);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(flush,1000),{once:true});else setTimeout(flush,1000)
})();

// ===== Interface protection and administrator-controlled cache refresh =====
function installContentProtection(){
  if(document.getElementById('kk-content-protection'))return;
  const style=document.createElement('style');style.id='kk-content-protection';
  style.textContent=`body,button,a,.card,.book-card,.nav-item,.bottom-nav{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}input,textarea,select,[contenteditable="true"],.allow-select{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}img{-webkit-user-drag:none;user-drag:none}`;
  document.head.appendChild(style);
  document.addEventListener('dragstart',e=>{if(e.target&&e.target.tagName==='IMG')e.preventDefault()},{passive:false});
}
async function clearApplicationCaches({clearApp=true,clearPdfs=false}={}){
  if('caches' in window){
    const names=await caches.keys(),targets=names.filter(n=>(clearApp&&n!==KITOB_PDF_CACHE)||(clearPdfs&&n===KITOB_PDF_CACHE));
    await Promise.all(targets.map(n=>caches.delete(n)));
  }
  if(clearApp){
    const stalePatterns=[/^kk_(profile_cache|directory|chat_|cm_|friends|winners|avatar_eligibility|book_stats|booksjson_cache|cache_covers|cover_cache|catalog_rating_cache|home_search_index|manifest_cache)/i,/^kitob_.*cache/i,/books_json/i];
    for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i)||'';if(stalePatterns.some(r=>r.test(key)))localStorage.removeItem(key)}
  }
  if(clearPdfs)localStorage.removeItem('kk_cached_books');
}
window.clearApplicationCaches=clearApplicationCaches;
let cacheControlBusy=false;
async function acknowledgeCacheControl(cfg){
  const token=localStorage.getItem('kk_token');if(!token)return;
  fetch(KITOB_CONFIG.NEON_API_BASE+'/api/cache-control/ack',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({app_version:Number(cfg.app_version)||0,pdf_version:Number(cfg.pdf_version)||0})}).catch(()=>{});
}
async function checkRemoteCacheControl(){
  if(cacheControlBusy)return;const last=Number(sessionStorage.getItem('kk_cache_control_checked_at')||0);if(Date.now()-last<30*60*1000)return;sessionStorage.setItem('kk_cache_control_checked_at',String(Date.now()));cacheControlBusy=true;
  try{
    const r=await fetch(KITOB_CONFIG.NEON_API_BASE+'/api/cache-control?t='+Date.now(),{cache:'no-store'});if(!r.ok)return;const cfg=await r.json();
    const app=Number(cfg.app_version)||1,pdf=Number(cfg.pdf_version)||1,oldApp=Number(localStorage.getItem('kk_remote_app_cache_version')||1),oldPdf=Number(localStorage.getItem('kk_remote_pdf_cache_version')||1);
    const refreshApp=app>oldApp,clearPdf=pdf>oldPdf;if(!refreshApp&&!clearPdf)return
    const progress=typeof beginActionProgress==='function'?beginActionProgress(cfg.message||'Навсозии барнома...'):null;
    localStorage.setItem('kk_remote_app_cache_version',String(app));localStorage.setItem('kk_remote_pdf_cache_version',String(pdf));
    await clearApplicationCaches({clearApp:refreshApp,clearPdfs:clearPdf});
    if(navigator.serviceWorker?.getRegistration){const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update().catch(()=>{})}
    await acknowledgeCacheControl(cfg);progress?.done(clearPdf?'Кэш ва китобҳои захирашуда нав шуданд':'Барнома нав шуд');
    if(refreshApp)setTimeout(()=>location.reload(),650);
  }catch(e){console.warn('[CacheControl]',e.message)}finally{cacheControlBusy=false}
}
window.checkRemoteCacheControl=checkRemoteCacheControl;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installContentProtection();setTimeout(checkRemoteCacheControl,1200)});else{installContentProtection();setTimeout(checkRemoteCacheControl,1200)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkRemoteCacheControl()});
