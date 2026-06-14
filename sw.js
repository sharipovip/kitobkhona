/* КИТОБХОНА · Service Worker v3.1 */
const VER='v3-1';
const SHELL_CACHE='kk-shell-'+VER;
const ASSET_CACHE='kk-asset-'+VER;
const PDF_CACHE='kk-pdf-'+VER;
const REMOTE_CACHE='kk-remote-'+VER;

const SHELL=[
  './','./index.html','./manifest.json',
  './splash_logo.jpg','./icons/icon-192.png','./icons/icon-512.png',
  './hero/01_istiqlol.jpg','./hero/02_vahdat.jpg','./hero/03_ob.jpg',
  './hero/04_ilm.jpg','./hero/05_35sol.jpg','./hero/06_kishovarzi.jpg',
  './hero/07_tabiat.jpg','./hero/08_rohho.jpg','./hero/09_qasr.jpg',
  './hero/10_javonon.jpg',
  './shohnomahoni.html','./shohnoma_banner.jpg',
  './ilm_furugi_marifat.html','./ilm_banner.jpg',
  './furugi_subhi_donoi.html','./furugi_banner.jpg',
  './vatani_azizi_man.html','./vatan_banner.jpg',
  './donandai_asarho.html','./donandai_banner.jpg',
];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(SHELL_CACHE);
    for(const u of SHELL){try{await c.add(u);}catch(err){}}
    self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>!k.endsWith(VER)).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);

  // PDF — cache-first
  if(url.pathname.toLowerCase().endsWith('.pdf')){
    e.respondWith(cacheFirst(req,PDF_CACHE));return;
  }

  // Внешние домены (raw.githubusercontent + jsdelivr) — stale-while-revalidate
  if(url.hostname.includes('githubusercontent.com')||url.hostname.includes('jsdelivr.net')){
    e.respondWith(staleWhileRevalidate(req,REMOTE_CACHE));return;
  }

  // Картинки локальные — cache-first
  if(/\.(jpe?g|png|webp|svg|gif|ico)$/i.test(url.pathname)){
    e.respondWith(cacheFirst(req,ASSET_CACHE));return;
  }

  // HTML — network-first
  if(req.mode==='navigate'||url.pathname.endsWith('.html')){
    e.respondWith(networkFirst(req,SHELL_CACHE));return;
  }

  // JSON — network-first
  if(url.pathname.endsWith('.json')){
    e.respondWith(networkFirst(req,REMOTE_CACHE));return;
  }

  e.respondWith(cacheFirst(req,ASSET_CACHE));
});

async function cacheFirst(req,name){
  const c=await caches.open(name);
  const cached=await c.match(req);
  if(cached){
    fetch(req).then(r=>{if(r?.ok)c.put(req,r.clone());}).catch(()=>{});
    return cached;
  }
  try{
    const r=await fetch(req);
    if(r?.ok)c.put(req,r.clone()).catch(()=>{});
    return r;
  }catch(e){return new Response('Offline',{status:503});}
}

async function networkFirst(req,name){
  const c=await caches.open(name);
  try{
    const r=await fetch(req,{cache:'no-store'});
    if(r?.ok)c.put(req,r.clone()).catch(()=>{});
    return r;
  }catch(e){
    const cached=await c.match(req);
    if(cached)return cached;
    return new Response('Offline',{status:503});
  }
}

async function staleWhileRevalidate(req,name){
  const c=await caches.open(name);
  const cached=await c.match(req);
  const np=fetch(req).then(r=>{if(r?.ok)c.put(req,r.clone()).catch(()=>{});return r;}).catch(()=>cached);
  return cached||np;
}

self.addEventListener('message',e=>{
  if(e.data==='SKIP_WAITING')self.skipWaiting();
});
