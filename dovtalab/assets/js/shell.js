(function(){
  const base=document.body.dataset.base||'./';
  const pageTitle=document.body.dataset.title||'Асосӣ';
  const content=document.getElementById('page-content');
  const items=[
    ['index.html','Асосӣ','⌂','home'],['pages/choose-grade.html?mode=study','Омӯзиш','✦','study'],
    ['pages/choose-grade.html?mode=exam','Санҷиш','◷','exam'],['pages/choose-grade.html?mode=materials','Мавод','▤','materials'],
    ['pages/admission.html','Қабул','▦','admission'],['pages/institutions.html','Ихтисосҳо','⌕','institutions'],
    ['pages/progress.html','Пешрафт','↗','progress']
  ];
  const active=document.body.dataset.page||'home';
  const data=window.DOV_DATA||{clusterNames:{1:'Табиӣ ва техникӣ',2:'Иқтисод ва география',3:'Филология, педагогика ва санъат',4:'Ҷомеа ва ҳуқуқ',5:'Тиб, биология ва варзиш'}};
  // Some browsers deny localStorage for file:// or private mode. Keep the UI working in memory.
  const memory={};
  const storage={getItem(k){try{return window.localStorage.getItem(k)}catch(e){return Object.prototype.hasOwnProperty.call(memory,k)?memory[k]:null}},setItem(k,v){try{window.localStorage.setItem(k,String(v))}catch(e){memory[k]=String(v)}},removeItem(k){try{window.localStorage.removeItem(k)}catch(e){delete memory[k]}}};
  function readJSON(key,fallback){try{return JSON.parse(storage.getItem(key)||JSON.stringify(fallback))}catch(e){return fallback}}
  let profile=readJSON('dov.profile',null);

  const app=document.createElement('div');app.className='app';
  const aside=document.createElement('aside');aside.className='sidebar';aside.id='mainSidebar';aside.setAttribute('aria-label','Навигатсия');
  aside.innerHTML=`<div class="brand"><img class="brandmark-img" src="${base}assets/icon-192.png" alt=""><div><div class="brandname">Довталаб</div><span class="brandcaption">Ёвари Шумо</span></div></div><nav class="nav">${items.map(([href,label,icon,key])=>`<a href="${base+href}" aria-label="${label}" title="${label}" ${active===key?'aria-current="page"':''}><span class="navicon" aria-hidden="true">${icon}</span><span class="navlabel">${label}</span></a>`).join('')}</nav>`;
  const main=document.createElement('main');main.className='main';
  const toggle=document.createElement('button');toggle.className='sidebar-trigger';toggle.id='navToggle';toggle.type='button';toggle.textContent='⋯';toggle.setAttribute('aria-label','Кушодани меню');toggle.setAttribute('aria-controls','mainSidebar');toggle.setAttribute('aria-expanded','false');aside.querySelector('.brand').appendChild(toggle);
  aside.insertAdjacentHTML('beforeend', `<div class="sidebar-settings"><a class="sidebar-action kitob" href="https://play.google.com/store/apps/details?id=com.kitobkhona.app&pcampaignid=web_share" target="_blank" rel="noopener" title="Китобхона — барномаи дигари мо"><span class="settings-icon">📖</span><span class="settings-label">Китобхона</span></a><a class="sidebar-action" href="${base}Download-Довталаб.html" title="Версия барои Windows"><span class="settings-icon">⊞</span><span class="settings-label">Барои Windows</span></a><button class="sidebar-action" id="profileOpen" type="button" title="Профил" aria-label="Профил"><span class="settings-icon">◉</span><span class="settings-label">Профил</span></button><div class="sidebar-font"><span>Андозаи ҳарф</span><button id="fsDown" type="button" aria-label="Хурд кардани ҳарф">А−</button><button id="fsUp" type="button" aria-label="Калон кардани ҳарф">А+</button></div></div>`);
  if(content){main.appendChild(content);content.removeAttribute('id')}
  const foot=document.createElement('footer');foot.className='footer';foot.textContent='ММТ ТҶ · Омодагӣ ба ИМД';
  main.appendChild(foot);app.append(aside,main);document.body.prepend(app);
  const backdrop=document.createElement('button');backdrop.className='sidebar-backdrop';backdrop.type='button';backdrop.setAttribute('aria-label','Пӯшидани меню');document.body.appendChild(backdrop);

  const savedNav=storage.getItem('dov.sidebar');
  let navExpanded=savedNav===null ? !(window.matchMedia&&window.matchMedia('(max-width: 700px)').matches) : savedNav==='expanded';
  function setNav(open){navExpanded=open;document.body.classList.toggle('sidebar-collapsed',!open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Печонидани меню':'Кушодани меню');toggle.title=open?'Печонидани меню':'Кушодани меню';toggle.textContent=open?'‹':'›';storage.setItem('dov.sidebar',open?'expanded':'collapsed')}
  setNav(navExpanded);
  /* На телефоне кнопка меню живёт на body: fixed внутри .sidebar (у неё transform) уезжает вместе с панелью */
  const mqMobile=window.matchMedia?window.matchMedia('(max-width: 860px)'):null;
  function placeToggle(){
    if(mqMobile&&mqMobile.matches){if(toggle.parentElement!==document.body)document.body.appendChild(toggle)}
    else{const brand=aside.querySelector('.brand');if(toggle.parentElement!==brand)brand.appendChild(toggle);setNav(navExpanded)}
  }
  placeToggle();
  if(mqMobile){if(mqMobile.addEventListener)mqMobile.addEventListener('change',placeToggle);else mqMobile.addListener(placeToggle)}
  function applyTheme(){document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark'}
  function applyProfile(){document.title=`${pageTitle} · ММТ ТҶ`;const name=profile?.name||'Довталаб';document.querySelectorAll('[data-username]').forEach(el=>el.textContent=name)}
  function showProfile(){if(profile){document.getElementById('profileName').value=profile.name||'';document.getElementById('profileGrade').value=profile.grade||'11';document.getElementById('profileCluster').value=profile.cluster||'1'}document.getElementById('profileModal').classList.remove('hidden');document.getElementById('profileName').focus()}
  const modal=document.createElement('div');modal.id='profileModal';modal.className='modal-backdrop hidden';
  modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="profileTitle"><div class="eyebrow">ММТ ТҶ · Профил</div><h2 id="profileTitle">Танзимоти омӯзиш</h2><p id="profileLead">Ном, синф ва кластер ихтиёрӣ буда, танҳо дар ҳамин дастгоҳ нигоҳ дошта мешаванд.</p><div class="field"><label for="profileName">НОМ</label><input id="profileName" maxlength="45" autocomplete="given-name" placeholder="Номи худро нависед"></div><div class="field"><label for="profileGrade">СИНФ</label><select id="profileGrade"><option value="11">Синфи 11 · қисми А</option><option value="9">Синфи 9 · қисми Б</option></select></div><div class="field"><label for="profileCluster">КЛАСТЕР</label><select id="profileCluster">${Object.entries(data.clusterNames).map(([k,v])=>`<option value="${k}">Кластери ${k} · ${v}</option>`).join('')}</select></div><div class="toolbar" style="justify-content:flex-end"><button class="btn btn-outline" type="button" id="profileCancel">Бекор кардан</button><button class="btn btn-primary" type="button" id="profileSave">Сабт кардан</button></div></section>`;
  document.body.appendChild(modal);
  document.addEventListener('click',e=>{const a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;const h=a.getAttribute('href')||'';if(!/^https?:\/\//i.test(h))return;const Cap=window.Capacitor;if(Cap&&Cap.isNativePlatform&&Cap.isNativePlatform()){const App=Cap.Plugins&&Cap.Plugins.App;if(App&&App.launchUrl){e.preventDefault();try{App.launchUrl(a.href,{openInSystem:true}).catch(()=>{location.href=h})}catch(err){location.href=h}}}else if(window.pywebview&&window.pywebview.api&&window.pywebview.api.open_url){e.preventDefault();try{window.pywebview.api.open_url(h)}catch(err2){window.open(h,'_blank')}}},true);
  document.getElementById('navToggle').addEventListener('click',e=>{const mobile=window.matchMedia&&window.matchMedia('(max-width: 860px)').matches;if(mobile){const open=!document.body.classList.contains('sidebar-open');document.body.classList.toggle('sidebar-open',open);toggle.textContent=open?'×':'☰';toggle.setAttribute('aria-expanded',String(open));return}setNav(!navExpanded);if(!navExpanded&&e.detail>0)toggle.blur()});
  document.querySelector('.sidebar-backdrop').addEventListener('click',()=>{document.body.classList.remove('sidebar-open');toggle.textContent='☰'});
  document.querySelectorAll('#mainSidebar .nav a').forEach(a=>a.addEventListener('click',()=>{if(window.matchMedia&&window.matchMedia('(max-width: 860px)').matches){document.body.classList.remove('sidebar-open');toggle.textContent='☰'}}));
  if(window.matchMedia&&window.matchMedia('(max-width: 860px)').matches){toggle.textContent='☰'}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){modal.classList.add('hidden')}});
  document.getElementById('profileOpen').addEventListener('click',showProfile);
  document.getElementById('profileCancel').addEventListener('click',()=>modal.classList.add('hidden'));
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
  document.getElementById('profileSave').addEventListener('click',()=>{const name=document.getElementById('profileName').value.trim();profile={name:name||'Довталаб',grade:document.getElementById('profileGrade').value,cluster:document.getElementById('profileCluster').value};storage.setItem('dov.profile',JSON.stringify(profile));modal.classList.add('hidden');applyProfile();window.dispatchEvent(new CustomEvent('dov:profile',{detail:profile}))});
  window.addEventListener('dov:profile',applyProfile);
  if(!profile&&!storage.getItem('dov.profileAsked')){storage.setItem('dov.profileAsked','1');document.getElementById('profileTitle').textContent='Ба Довталаб хуш омадед!';document.getElementById('profileLead').textContent='Номи худро нависед — барнома бо номи шумо муроҷиат мекунад. Синфу кластери интихобшуда ҳамчун пешфарз сабт мешаванд. Ин равзана дигар кушода намешавад; баъдтар тавассути тугмаи «Профил» тағйир додан мумкин аст.';showProfile()}
  
  const FS=[90,100,112,125,140];
  function applyFs(){const v=+storage.getItem('dov.fs')||100;document.documentElement.style.fontSize=v+'%'}
  function stepFs(d){let i=FS.indexOf(+storage.getItem('dov.fs')||100);if(i<0)i=1;i=Math.max(0,Math.min(FS.length-1,i+d));storage.setItem('dov.fs',FS[i]);applyFs()}
  document.getElementById('fsUp').addEventListener('click',()=>stepFs(1));document.getElementById('fsDown').addEventListener('click',()=>stepFs(-1));
  applyFs();applyTheme();applyProfile();
  window.Dov={base,profile:()=>profile,data,storage,today:()=>{const x=new Date();return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`},getActivity:()=>readJSON('dov.activity',{}),record:stats=>{const a=readJSON('dov.activity',{}),k=window.Dov.today();if(!a[k])a[k]={answered:0,correct:0,minutes:0,sessions:0};for(const key of ['answered','correct','minutes','sessions'])a[k][key]=(a[k][key]||0)+(stats[key]||0);storage.setItem('dov.activity',JSON.stringify(a));window.dispatchEvent(new Event('dov:activity'))}};
  if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register(base+'sw.js').catch(()=>{});
})();
