/* Китобхона Service Worker */
const VER='full-2026-06-15-v1';
const SHELL='kk-shell-'+VER;
const RUNTIME='kk-runtime-'+VER;
const PDFS='kk-pdfs-'+VER;
const PRECACHE=[
  './','./index.html','./admin.html','./manifest.json',
  './pages/winners.html','./pages/profile.html','./pages/users.html','./pages/chat.html','./pages/book_reviews.html',
  './data/age_groups.json','./data/chat_rules.json','./data/bad_words.json','./data/tajikistan_locations.json'
];
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(SHELL);for(const u of PRECACHE){try{await c.add(u)}catch(_){}}self.skipWaiting()})())});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>!k.endsWith(VER)).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.pathname.toLowerCase().endsWith('.pdf'))return e.respondWith(cacheFirst(req,PDFS));if(url.hostname.includes('githubusercontent.com')||url.hostname.includes('jsdelivr.net'))return e.respondWith(stale(req,RUNTIME));if(req.mode==='navigate'||url.pathname.endsWith('.html'))return e.respondWith(networkFirst(req,SHELL));if(url.pathname.endsWith('.json'))return e.respondWith(networkFirst(req,RUNTIME));if(/\.(jpe?g|png|webp|svg|gif|ico)$/i.test(url.pathname))return e.respondWith(cacheFirst(req,RUNTIME));e.respondWith(cacheFirst(req,RUNTIME))});
async function cacheFirst(req,name){const c=await caches.open(name);const hit=await c.match(req);if(hit){fetch(req).then(r=>{if(r.ok)c.put(req,r.clone())}).catch(()=>{});return hit}try{const r=await fetch(req);if(r.ok)c.put(req,r.clone());return r}catch(_){return new Response('Offline',{status:503})}}
async function networkFirst(req,name){const c=await caches.open(name);try{const r=await fetch(req,{cache:'no-store'});if(r.ok)c.put(req,r.clone());return r}catch(_){const hit=await c.match(req);return hit||new Response('Offline',{status:503})}}
async function stale(req,name){const c=await caches.open(name);const hit=await c.match(req);const p=fetch(req).then(r=>{if(r.ok)c.put(req,r.clone());return r}).catch(()=>hit);return hit||p}
