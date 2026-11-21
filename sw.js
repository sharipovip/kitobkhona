const CACHE_NAME = 'kitobkhona-v163-atomic-shell-r2';
const SHELL_BUILD='20261121-r2';
const CRITICAL_SHELL={
  "./index.html": "3eb7c061de8f84d0b6168dc71d8813e67ae9ecb6b883afe33fd4bc9fd9b16735",
  "./config.js": "26849e87f0bcee125ac78e8e100a5c28fdda145c14c8d0e4f9439e6a4bdef266",
  "./approved-ui.js": "c624572f761cdd5d9e519141cab6f7ab489200074996b7130f763a3286640ef8",
  "./approved-offline-theme.js": "764cea0b18cad95d31c4a6fb91784b08b89cc29917d6d3018423431009239f11",
  "./reader-curl.js": "51beb0be1372711b25807c9ca7a091e7df391549c35eca48762b270ea82f5609",
  "./assets/css/approved-ui.css": "547e0c2327a144a1710e16deaf45210676878808c1624f88fd2b1f25032d4f18",
  "./kitobho.html": "9e0ec1bff1ad6f61b3969d06640b43a6da665d7fad5bce49f24adb5f2cfe7c8d",
  "./reader.html": "b35e49021165da97842be9aeba775cc4d9c5676af55829bbf1e1e87b5b90cf25",
  "./profile.html": "2e335335edcaca34e231b227b4e36f2ab1cf3bf7e25dba095b90588d84a0bf6d",
  "./offline-books.html": "a38d27772ee1bfa4be904c56115c77a37306509be9431d50b6d01ed785e61fb4",
  "./Lenta.html": "03136c313b5980d49bf3168c86b359fce75c5484ec2067fa20ff4de5e306bbab",
  "./chats.html": "09e3a9e84478c561e84719e88f383928c6e9d826498654481bab4ae2db293fdd",
  "./chat.html": "fab1b68ac92cae7d9fd3038d8638a0731d34643743aafea019ab395cdc875792",
  "./winners.html": "74c3dd64935c28d5e37292e8a616ed49754948301184c75f1235ef1c0df13286",
  "./login.html": "c2fba766cd6db3906c9559a29b0d53814c911fec452d81add00af1b14c24fac7",
  "./ozmunho.html": "794a6b8c973f7e464f91e24c83c2344108cc278af014a676a25e36a14af52001",
  "./aliya/index.html": "cafc8aa422c9b15583e3c86d084f16d40b8a9f5cc0fcf5dbc6247bf070f094ec",
  "./aliya/reader-aliya.html": "f568dfd92df24aef5c2c5b074223d3f4d7dea5ab8459290b564b3ff3708cd0a1",
  "./aliya/reader-approved.css": "87bbbd7c089b5e140f19c71ff4ba6eae1ed703121c31e127ce1d04b873464821",
  "./aliya/approved-aliya.css": "b15eefd70af04a8b384baa32c999eb8439db777c63a3a1c29b94258cb7cbb213",
  "./aliya/approved-aliya.js": "67342bbbc044eee8f6edeebbbee93c183cbc8ea1b0c2e78fd3c52b0bce29b391"
};
const RUNTIME_CACHE = 'kitobkhona-runtime-v1';   // JSON/API/суратҳои берунӣ (stale-while-revalidate, маҳдуд)
const RUNTIME_LIMIT = 400;
const LOCAL_FILES = [
  './approved-ui.js',
  './approved-offline-theme.js',
  './reader-curl.js',
  './assets/css/approved-ui.css',
  './aliya/approved-aliya.css',
  './aliya/approved-aliya.js',
  './aliya/reader-approved.css',
  './ozmunho.html',
  './',
  './aliya/index.html',
  './aliya/aliya-ui.css',
  './aliya/aliya-desktop.css',
  './aliya/aliya-core.js',
  './aliya/aliya-bridge.js',
  './aliya/aliya-doc-templates.js',
  './aliya/aliya-tasks.js',
  './aliya/aliya-pdf.js',
  './aliya/reader-aliya.html',
  './assets/css/desktop-layout.css',
  './assets/css/desktop-sidebar.css',
  './aliya/aliya-brand-animation.js',
  './assets/css/home-desktop.css',
  './Download-Kitobkhona.html',

  './index.html',
  './maorif-books.html',
  './maorif-authors.js',
  './maorif-reading-guides.html',
  './maorif-details-zaboni-millat-1.html',
  './maorif-details-zaboni-millat-2.html',
  './maorif-details-chehrahoi-mondagor.html',
  './maorif-details-nasihatnoma.html',
  './maorif-details-bahoriston.html',
  './maorif-details-hasani-arobakash.html',
  './maorif-details-tojikon-1.html',
  './maorif-details-tojikon-2.html',
  './maorif-details-shohnoma-1.html',
  './maorif-details-shohnoma-2.html',
  './maorif-details-shohnoma-3.html',
  './maorif-details-shohnoma-4.html',
  './maorif-details-shohnoma-5.html',
  './maorif-details-shohnoma-6.html',
  './maorif-details-shohnoma-7.html',
  './maorif-details-shohnoma-8.html',
  './maorif-details-shohnoma-9.html',
  './maorif-details-shohnoma-10.html',
  './maorif-details-quiz-data.js',
  './maorif-details-tools.js',
  './assets/documents/maorif-order-27/page-1.jpg',
  './assets/documents/maorif-order-27/page-2.jpg',
  './kitobho.html',
  './offline-books.html',
  './adabiyoti-tavsiyashuda.html',
  './data/tavsiya.json',
  './data/contests.json',
  './tavsiya/matn/skazka_o_tsare_saltane.json',
  './tavsiya/matn/kot_v_sapogah.json',
  './tavsiya/matn/kot_i_lisa.json',
  './tavsiya/matn/teremok.json',
  './tavsiya/matn/bremenskie_muzykanty.json',
  './book_reviews.html',
  './delete-account.html',
  './donandai_asarho.html',
  './furugi_subhi_donoi.html',
  './html_studio_full.html',
  './ilm_furugi_marifat.html',
  './shohnomahoni.html',
  './vatani_azizi_man.html',
  './ideai_man.html',
  './ideai_man_banner.jpg',
  './serkhonandatarin.html',
  './reader.html',
  './profile.html',
  './login.html',
  './admin.html',
  './winners.html',
  './chats.html',
  './chat.html',
  './Lenta.html',
  './config.js',
  './cache.js',
  './president.js',
  './president.html',
  './quotes-data.js',
  './books.json',
  './news.json',
  './splash_logo.png',
  './assets/hero/01-president-official.jpg',
  './assets/hero/01-president-official-200.jpg',
  './assets/hero/02-istiqlol-flag.jpg',
  './assets/hero/03-vahdat-diplomacy.jpg',
  './assets/hero/04-kishovarzi.jpg',
  './assets/hero/05-president-young.jpg',
  './assets/hero/06-zaboni-millat.jpg',
  './assets/hero/07-chehrahoyi-mondagor.jpg',
  './assets/hero/08-davlatdori.jpg',
  './assets/hero/09-suhanroni.jpg',
  './assets/hero/10-nishon-tojikiston.jpg',
  './assets/libs/pdf.min.js',
  './assets/libs/pdf.worker.min.js',
  './assets/libs/epub.min.js',
  './assets/libs/jszip.min.js',
  './assets/libs/mammoth.browser.min.js',
  './assets/libs/LICENSE-pdfjs.txt',
  './manifest.json',
  './search-index.json',
  './locations.js',
  './data/tajikistan_locations_full.json',
  './offline.html',
  './privacy-policy.html',
  './terms.html',
  './favicon.ico',
  './icon-192.png',
  './icon-512.png',
  './assets/sites/president.jpg',
  './assets/sites/kmt.jpg',
  './assets/sites/maorif.jpg',
  './assets/sites/mmk.jpg',
  './assets/sites/khovar.jpg',
  './assets/sites/mfa.jpg',
  './assets/sites/dushanbe.jpg',
  './assets/sites/ntc.jpg',
  './assets/sites/khatlon.jpg',
  './assets/symbols/parcham.png',
  './assets/symbols/nishon.jpg',
  './shohnoma_banner.jpg',
  './ilm_banner.jpg',
  './furugi_banner.jpg',
  './vatan_banner.jpg',
  './donandai_banner.jpg',
  // v133: барномаи «Довталаб» — пешкэш ҳамчун дигар бахшҳои Китобхона
  './dovtalab/',
  './dovtalab/index.html',
  './dovtalab/manifest.webmanifest',
  './dovtalab/pages/study.html',
  './dovtalab/pages/choose-grade.html',
  './dovtalab/pages/choose-cluster.html',
  './dovtalab/pages/choose-subjects.html',
  './dovtalab/pages/exam.html',
  './dovtalab/pages/materials.html',
  './dovtalab/pages/admission.html',
  './dovtalab/pages/institutions.html',
  './dovtalab/pages/progress.html',
  './dovtalab/pages/question-set-tj-2026.html',
  './dovtalab/pages/test-view.html',
  './dovtalab/assets/css/style.css',
  './dovtalab/assets/css/home.css',
  './dovtalab/assets/css/sample.css',
  './dovtalab/assets/css/wizard.css',
  './dovtalab/assets/css/tokens.css',
  './dovtalab/assets/css/polish.css',
  './dovtalab/assets/css/exam-full.css',
  './dovtalab/assets/css/pages.css',
  './dovtalab/assets/splash.jpg',
  './dovtalab/Download-Довталаб.html',
  './dovtalab/assets/js/export.js',
  './dovtalab/assets/js/export-fonts.js',
  './dovtalab/assets/vendor/jspdf.umd.min.js',
  './dovtalab/assets/vendor/docx.umd.js',
  './dovtalab/assets/icon-192.png',
  './dovtalab/assets/icon-512.png',
  './dovtalab/assets/js/shell.js',
  './dovtalab/assets/js/dl.js',
  './dovtalab/assets/js/dashboard.js',
  './dovtalab/assets/js/splash.js',
  './dovtalab/assets/js/cap-downloads.js',
  './dovtalab/assets/css/mobile-redesign.css',
  './dovtalab/assets/js/wizard.js',
  './dovtalab/assets/js/study.js',
  './dovtalab/assets/js/bank.js',
  './dovtalab/assets/js/test-view.js',
  './dovtalab/assets/js/exam-full.js',
  './dovtalab/assets/js/materials.js',
  './dovtalab/assets/js/admission.js',
  './dovtalab/assets/js/institutions.js',
  './dovtalab/assets/js/progress.js',
  './dovtalab/data/catalog.js',
  './dovtalab/data/app-data.js',
  './dovtalab/data/book-map.js',
  './dovtalab/data/question-bank.js',
  './dovtalab/data/admission-plan-2026-27.js',
  ...Array.from({ length: 100 }, (_, index) => `./assets/hero/${index + 1}.jpeg`)
];
// МУҲИМ: surudi_milli.mp3 (1.8МБ) ва 50 сурати newsimg (2МБ) ба пешкэш НАМЕРОХАНД —
// онҳо ҳангоми аввалин дархост аз тарафи fetch-обработчик кэш мешаванд.
// Ин насби навсозии аппро барои босуръат месозад (пешина "боркунии абадӣ" буд).;

const NAV_FRESH_MS = 600;   // v129: то чанд мс шабакаро барои саҳифаи «тоза» интизор мешавем, агар нусхаи кэшшуда бошад
const API_FRESH_MS = 1800;  // v129: ҳамин барои JSON/API-и ҷамъиятӣ (пештар 2500)
const BOOKS_JSON_URL = 'books.json';
const SYNC_INTERVAL = 60 * 60 * 1000; // 1 час

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    try{
      // Verify all mandatory updated files before activating. Old worker stays if deployment is incomplete.
      for(const [path,expected] of Object.entries(CRITICAL_SHELL)){
        const request=new Request(new URL(path,self.registration.scope).href,{cache:'reload'});
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
        let response;try{response=await fetch(new Request(request,{signal:controller.signal}))}finally{clearTimeout(timeout)}
        if(!response.ok)throw new Error('Incomplete shell: '+path+' HTTP '+response.status);
        const data=await response.clone().arrayBuffer();
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
        if(digest!==expected)throw new Error('Wrong release file: '+path);
        await cache.put(request,response);
      }
      // Optional old artwork/pages must not delay activation or overwrite verified critical files.
      const optional=LOCAL_FILES.filter(p=>!Object.prototype.hasOwnProperty.call(CRITICAL_SHELL,p));
      await Promise.allSettled(optional.map(async path=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),8000);try{await cache.add(new Request(path,{cache:'reload',signal:c.signal}))}finally{clearTimeout(t)}}));
      await self.skipWaiting();
    }catch(error){await caches.delete(CACHE_NAME);throw error}
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => /^kitobkhona-v\d/.test(key) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
    // No Service Worker polling. Static catalog updates on normal page access.
    const tabs=await self.clients.matchAll({type:'window'});tabs.forEach(c=>c.postMessage({type:'KK_SHELL_READY',build:SHELL_BUILD}));
  })());
});

async function updateBooksJson() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(BOOKS_JSON_URL, { cache: 'no-store' });
    if (response.ok) {
      await cache.put(BOOKS_JSON_URL, response.clone());
      console.log('[SW] books.json updated in cache');
      const clients = await self.clients.matchAll();
      clients.forEach(client => client.postMessage({ type: 'books_json_updated' }));
    }
  } catch (e) {
    console.warn('[SW] Failed to update books.json:', e);
  }
}

function scheduleBooksJsonUpdate() {
  setTimeout(updateBooksJson, 5 * 60 * 1000);
  setInterval(updateBooksJson, SYNC_INTERVAL);
}

async function cacheNewsFallbackImages(cache, response) {
  try {
    const data = await response.json();
    const paths = Array.from(new Set((Array.isArray(data.items) ? data.items : [])
      .map(item => String(item && item.site || ''))
      .filter(path => /^assets\/newsimg\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:jpg|jpeg|png|webp)$/i.test(path) && !path.includes('..'))));
    await Promise.allSettled(paths.map(path => cache.add('./' + path.replace(/^\.\//, ''))));
  } catch (e) {}
}

function safeCachePut(request, response) {
  // response.clone() иногда падает с "Response body is already used" — судя по всему,
  // редкая гонка на уровне WebView/браузера, а не ошибка в этом коде. Раньше это была
  // необработанная ошибка (спамила консоль), теперь просто тихо пропускаем кэширование
  // именно этого ответа — страница при этом всё равно показывается нормально.
  try {
    const toCache = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, toCache)).catch(() => {});
  } catch (e) {}
}

// v126: кэши иҷроӣ барои манбаъҳои берунӣ, ки саҳифаи асосӣ ба онҳо вобаста аст (пештар SW онҳоро тамоман
// коркард намекард ва ҳангоми интернети суст/қатъ бахшҳо холӣ мемонданд):
//  - books.json / manifest / search-index аз raw.githubusercontent.com ва cdn.jsdelivr.net (JSON)
//  - GET-ҳои ҷамъиятии Edge API (popular-books, winners, announcements, book-stats) — бе Authorization
//  - суратҳои муқоваю ахбор (flickr, weserv, raw.githubusercontent)
// Стратегия: stale-while-revalidate (аввал кэш, дар замина навсозӣ); ҳаҷм то RUNTIME_LIMIT сабт.
const RUNTIME_JSON_HOSTS = ['raw.githubusercontent.com', 'cdn.jsdelivr.net'];
const RUNTIME_IMG_HOSTS = ['live.staticflickr.com', 'images.weserv.nl', 'raw.githubusercontent.com', 'cdn.jsdelivr.net'];
const RUNTIME_API_PATHS = ['/api/popular-books', '/api/winners', '/api/announcements/active', '/api/book-stats/', '/api/users/directory-public'];
function runtimeKind(request, url) {
  if (request.method !== 'GET') return '';
  if (request.headers.has('Authorization')) return '';
  const path = url.pathname;
  if (/\.(pdf|epub|fb2|docx?|zip|mp4|m4v|webm|mp3)$/i.test(path)) return ''; // китобҳоро KITOB_PDF_CACHE идора мекунад
  if (url.hostname.endsWith('.workers.dev') && RUNTIME_API_PATHS.some(p => path.startsWith(p))) return 'api';
  if (RUNTIME_JSON_HOSTS.includes(url.hostname) && /\.json$/i.test(path)) return 'json';
  if (RUNTIME_IMG_HOSTS.includes(url.hostname) && /\.(jpe?g|png|webp|gif|avif)$/i.test(path)) return 'img';
  if (url.hostname === 'images.weserv.nl') return 'img';
  return '';
}
async function trimRuntimeCache() {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const keys = await cache.keys();
    if (keys.length <= RUNTIME_LIMIT) return;
    const extra = keys.slice(0, keys.length - RUNTIME_LIMIT);
    await Promise.all(extra.map(k => cache.delete(k)));
  } catch (e) {}
}
async function runtimeStaleWhileRevalidate(request, kind) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  const network = fetch(request).then(async (response) => {
    // танҳо ҷавобҳои ошкор (CORS/basic) бо статуси 200 сабт мешаванд; opaque — не (ҳаҷми квотаро хӯрда метавонанд)
    if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
      try { await cache.put(request, response.clone()); } catch (e) {}
      if (Math.random() < 0.05) trimRuntimeCache();
    }
    return response;
  }).catch(() => null);
  if (cached) {
    if (kind === 'img') return cached;                 // суратҳо: кэш-аввал
    // JSON/API: агар шабака то API_FRESH_MS ҷавоб диҳад — маълумоти нав, вагарна кэш (шабака дар замина навсозӣ мекунад)
    const fast = await Promise.race([network, new Promise(r => setTimeout(() => r(null), API_FRESH_MS))]);
    return fast || cached;
  }
  const net = await network;
  return net || Response.error();
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    const kind = runtimeKind(event.request, url);
    if (kind) event.respondWith(runtimeStaleWhileRevalidate(event.request, kind));
    return;
  }
  if(url.pathname.endsWith('/repair-cache.html')){event.respondWith(fetch(new Request(event.request,{cache:'reload'})));return;}
  const rel='./'+(url.pathname.slice(new URL(self.registration.scope).pathname.length)||'index.html');
  if(event.request.method==='GET'&&Object.prototype.hasOwnProperty.call(CRITICAL_SHELL,rel)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME),snapshot=await cache.match(new URL(rel,self.registration.scope).href,{ignoreSearch:true});
      if(snapshot)return snapshot;
      // Never substitute a different build into a verified critical shell.
      return new Response('Update incomplete. Open repair-cache.html online.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    })());return;
  }
  if (event.request.mode === 'navigate') {
    // v129: гузариши фаврӣ байни саҳифаҳо. Агар шабака то NAV_FRESH_MS (600 мс) ҷавоб диҳад — саҳифаи нав аз
    // шабака (баъди нашр корбар бо интернети хуб фавран версияи навро мебинад); вагарна — нусхаи кэшшуда ФАВРАН,
    // шабака дар замина кэшро нав мекунад (дафъаи оянда — нав). Пештар ҳар гузариш то 3.5 с интизор мешуд.
    // Агар кэш набошад — шабака пурра интизор мешавад; офлайн ва бе кэш — offline.html.
    const network = fetch(event.request).then(response => {
      if (response && response.status === 200) {
        safeCachePut(event.request, response);
      }
      return response;
    }).catch(() => null);
    event.waitUntil(network.then(() => undefined)); // SW то анҷоми навсозии кэш дар замина зинда мемонад
    event.respondWith((async () => {
      const cached = await (await caches.open(CACHE_NAME)).match(event.request, { ignoreSearch: true });
      if (!cached) {
        const net = await network;
        return net || await (await caches.open(CACHE_NAME)).match('./offline.html');
      }
      const timer = new Promise(resolve => setTimeout(() => resolve('timeout'), NAV_FRESH_MS));
      const first = await Promise.race([network, timer]);
      if (first && first !== 'timeout' && first.status === 200) return first;
      return cached;
    })());
    return;
  }
  // Ахборот: шабака аввал, аммо кэши охирин ҳангоми офлайн ё хатои сервер.
  if (url.pathname.endsWith('/news.json') || url.pathname === '/news.json') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          safeCachePut(event.request, response);
          cacheNewsFallbackImages(cache, response.clone()).catch(() => {});
          return response;
        }
        return null;
      }).catch(() => null);
      if (!cached) return await network || Response.error();
      // v129: агар шабака то 3 с ҷавоб надиҳад — ахбори кэшшуда (шабака дар замина кэшро нав мекунад)
      const fast = await Promise.race([network, new Promise(r => setTimeout(() => r(null), 3000))]);
      return fast || cached;
    })());
    return;
  }
  // Китобхона ва ҷустуҷӯ: stale-while-revalidate, то файлҳои асосӣ офлайн фавран дастрас шаванд.
  if (url.pathname.endsWith('/books.json') || url.pathname === '/books.json' ||
      url.pathname.endsWith('/search-index.json') || url.pathname === '/search-index.json') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request).then(response => {
        if (response && response.status === 200) safeCachePut(event.request, response);
        return response && response.status === 200 ? response : null;
      }).catch(() => null);
      if (cached) { network.catch(() => {}); return cached; }
      return await network || Response.error();
    })());
    return;
  }
  // v126: файлҳои китоб (tavsiya/pdf/*.pdf ва ғ.) дар кэши умумӣ дубора сабт намешаванд — онҳоро хонанда
  // дар 'kitobkhona-pdf-cache-v1' нигоҳ медорад (бо танзими муҳлати нигоҳдорӣ).
  if (/\.(pdf|epub|fb2|docx?|zip|mp4|m4v|webm)$/i.test(url.pathname)) {
    return;
  }
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith((async () => {
      const cached = await (await caches.open(CACHE_NAME)).match(event.request, { ignoreSearch: true });
      const network = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          safeCachePut(event.request, response);
        }
        return response;
      }).catch(() => null);
      return cached || await network;
    })());
    return;
  }
  event.respondWith(
    caches.open(CACHE_NAME).then(cache=>cache.match(event.request,{ignoreSearch:true})).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

try {
  importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');
  const firebaseConfig = {
    apiKey: "AIzaSyDWmg_6KS_v82IK7P-QrLj8GP2dh5tk29Y",
    authDomain: "kitobkhona-push.firebaseapp.com",
    projectId: "kitobkhona-push",
    storageBucket: "kitobkhona-push.firebasestorage.app",
    messagingSenderId: "507779702083",
    appId: "1:507779702083:web:3dbd554961b290e854e3f6",
    measurementId: "G-2G9G2SXCTQ"
  };
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(function(payload) {
    try {
      const notif = payload.notification || {};
      const title = notif.title || 'Китобхона';
      const options = {
        body: notif.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: payload.data || {},
        vibrate: [200, 100, 200]
      };
      self.registration.showNotification(title, options);
    } catch (e) {
      console.error('FCM background message error', e);
    }
  });
} catch (e) {
  console.warn('[SW] Firebase init skipped:', e.message);
}


self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const data = event.notification.data || {};
  let url = '/kitobkhona/';
  if (data.type === 'chat' || data.chat_id || data.sender_id) {
    url = '/kitobkhona/chats.html';
  } else if (data.type === 'feed' || data.post_id) {
    url = '/kitobkhona/Lenta.html';
  } else if (data.link) {
    url = data.link;
  } else if (data.url) {
    url = data.url;
  }
  // v126: барнома дар зерпапка (/kitobkhona/) ҷойгир аст — истинодҳои '/winners.html' ё 'winners.html'
  // ба доираи (scope) SW оварда мешаванд, то ки саҳифаи дуруст кушода шавад.
  let fullUrl = url;
  try {
    const scope = self.registration.scope; // https://host/kitobkhona/
    const scopePath = new URL(scope).pathname;
    if (/^https?:\/\//i.test(url)) fullUrl = url;
    else if (url.startsWith('/')) fullUrl = url.startsWith(scopePath) ? self.location.origin + url : new URL(url.replace(/^\/+/, ''), scope).href;
    else fullUrl = new URL(url, scope).href;
  } catch (e) { fullUrl = url.startsWith('/') ? self.location.origin + url : url; }
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if ((client.url === fullUrl || client.url.split('?')[0] === fullUrl.split('?')[0]) && 'focus' in client) { try { if ('navigate' in client && client.url !== fullUrl) return client.navigate(fullUrl).then(c => c && c.focus()); } catch (e) {} return client.focus(); }
    }
    if (clients.openWindow) return clients.openWindow(fullUrl);
  }));
});

self.addEventListener('message',event=>{if(event.data?.type==='KK_GET_BUILD'){event.ports[0]?.postMessage({build:SHELL_BUILD,cache:CACHE_NAME});}});
