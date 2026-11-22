(function(){
  const records=window.DOV_ADMISSIONS?.records||[];
  const search=document.getElementById('instSearch'),grade=document.getElementById('instGrade'),cluster=document.getElementById('instCluster'),city=document.getElementById('instCity'),fee=document.getElementById('instFee'),form=document.getElementById('instForm'),cards=document.getElementById('institutionCards');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tidyCity=x=>String(x||'').replace(/\s+/g,' ').trim();
  const seenCity=new Map();for(const r of records){const c=tidyCity(r.city);if(!seenCity.has(c.toLocaleLowerCase('tg')))seenCity.set(c.toLocaleLowerCase('tg'),c)}
  const cities=[...seenCity.values()].sort((a,b)=>a.localeCompare(b,'tg'));
  const seenForm=new Map();for(const r of records){const f=tidyCity(r.studyForm);if(f&&!seenForm.has(f.toLocaleLowerCase('tg')))seenForm.set(f.toLocaleLowerCase('tg'),f)}
  const forms=[...seenForm.values()].sort((a,b)=>a.localeCompare(b,'tg'));
  city.innerHTML='<option value="all">Ҳама</option>'+cities.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  form.innerHTML='<option value="all">Ҳама</option>'+forms.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  const favoriteButton=document.getElementById('favoriteFilter'),favoriteCount=document.getElementById('favoriteCount');
  let favs;try{let stored=JSON.parse(Dov.storage.getItem('dov.favoriteSpecialties')||'[]');favs=new Set(Array.isArray(stored)?stored:[])}catch(e){favs=new Set()}
  let onlyFavorites=false;const key=r=>`${r.sourceId}|${r.rowId}`;
  function countFavorites(){favoriteCount.textContent=favs.size;favoriteButton.setAttribute('aria-pressed',String(onlyFavorites));const none=favs.size===0;if(none&&onlyFavorites)onlyFavorites=false;favoriteButton.disabled=none;favoriteButton.title=none?'Аввал муассиса ё ихтисосро интихоб кунед':''}
  favoriteButton.onclick=()=>{onlyFavorites=!onlyFavorites;countFavorites();draw()};countFavorites();
  const resetBtn=document.getElementById('instReset');if(resetBtn)resetBtn.onclick=()=>{search.value='';[grade,cluster,city,fee,form].forEach(x=>x.value='all');onlyFavorites=false;countFavorites();draw()};
  const tidyName=s=>String(s||'').replace(/[‐‑‒–—−]/g,'-').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ').trim();
  function draw(){
    const q=search.value.trim().toLocaleLowerCase('tg'),g=grade.value,c=cluster.value,ct=city.value,f=fee.value,sf=form.value;
    const filtered=records.filter(r=>(!onlyFavorites||favs.has(key(r)))&&(g==='all'||r.grade===g)&&(c==='all'||r.cluster===c)&&(ct==='all'||r.city===ct)&&(f==='all'||(f==='ройгон'?r.tuitionType==='ройгон':String(r.tuitionType).startsWith('пулакӣ')))&&(sf==='all'||r.studyForm===sf)&&(!q||`${r.institution} ${r.city} ${r.specialty} ${r.specialtyCode} ${r.studyForm} ${r.language}`.toLocaleLowerCase('tg').includes(q)));
    const grouped=new Map();
    for(const r of filtered){const institution=tidyName(r.institution),key=`${institution}||${r.city}`;if(!grouped.has(key))grouped.set(key,{name:institution,city:r.city,rows:[],seats:0,free:0,paid:0});const x=grouped.get(key);x.rows.push(r);x.seats+=r.seats||0;if(r.tuitionType==='ройгон')x.free+=r.seats||0;else x.paid+=r.seats||0}
    const list=[...grouped.values()].sort((a,b)=>a.city.localeCompare(b.city,'tg')||a.name.localeCompare(b.name,'tg'));
    const totalSeats=filtered.reduce((n,r)=>n+(r.seats||0),0);
    document.getElementById('instCount').textContent=`${list.length.toLocaleString('tg')} гурӯҳи муассиса/шаҳр · ${filtered.length.toLocaleString('tg')} ихтисос/сатр`;
    document.getElementById('instSummary').textContent=`${totalSeats.toLocaleString('tg')} ҷой дар филтри интихобшуда`;
    cards.innerHTML=list.map((item,i)=>`<details class="card list-card institution-entry" data-entry="${i}">
      <summary>
        <span class="badge">${esc(item.city)} · ${item.rows.length} сатри нақша</span>
        <h3>${esc(item.name)}</h3>
        <p>${item.seats.toLocaleString('tg')} ҷой${item.free?` · ${item.free.toLocaleString('tg')} ройгон`:''}${item.paid?` · ${item.paid.toLocaleString('tg')} пулакӣ`:''}</p>
        <span class="small muted">Барои дидани ихтисос, маблағ ва забон кушоед ▾</span>
      </summary><div class="institution-detail"></div>
    </details>`).join('')||'<div class="empty">Бо ин филтр ягон муассиса ё ихтисос ёфт нашуд.</div>';
    cards.querySelectorAll('details[data-entry]').forEach((el,i)=>el.addEventListener('toggle',()=>{
      if(!el.open||el.dataset.ready)return;el.dataset.ready='1';
      el.querySelector('.institution-detail').innerHTML=list[i].rows.map(r=>`<article class="card pad admission-row" style="box-shadow:none">
        <div class="admission-row-head"><div><span class="badge">Синфи ${esc(r.grade)} · кластери ${esc(r.cluster)}</span><h4>${esc(r.specialty)}</h4><div class="small muted">Рамзи ихтисос: <b>${esc(r.specialtyCode)}</b></div></div><div class="admission-seats"><b>${r.seats.toLocaleString('tg')}</b><span>ҷой</span></div></div>
        <button type="button" class="btn btn-outline favorite-star" data-favorite="${esc(key(r))}" aria-pressed="${favs.has(key(r))}" aria-label="${favs.has(key(r))?'Аз интихобшудаҳо хориҷ кардан':'Интихоб кардан'}">${favs.has(key(r))?'♥ Интихобшуда':'♡ Интихоб кардан'}</button><div class="admission-facts"><span><small>Шакли таҳсил</small><b>${esc(r.studyForm)}</b></span><span><small>Намуди маблағгузорӣ</small><b>${r.tuitionType==='ройгон'?'Ройгон':`Пулакӣ${r.priceSomoni!==null?` · ${r.priceSomoni.toLocaleString('tg')} сомонӣ`:''}`}</b></span><span><small>Забони таҳсил</small><b>${esc(r.language)}</b></span></div>
        
      </article>`).join('');
    }));
    cards.querySelectorAll('details').forEach(el=>el.addEventListener('click',event=>{const b=event.target.closest('[data-favorite]');if(!b)return;const id=b.dataset.favorite;favs.has(id)?favs.delete(id):favs.add(id);Dov.storage.setItem('dov.favoriteSpecialties',JSON.stringify([...favs]));countFavorites();if(onlyFavorites){draw();return}const on=favs.has(id);b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',on?'Аз баргузидаҳо хориҷ кардан':'Ба баргузидаҳо илова кардан');b.textContent=on?'♥ Интихобшуда':'♡ Интихоб кардан';b.setAttribute('aria-label',on?'Аз интихобшудаҳо хориҷ кардан':'Интихоб кардан')}));
  }
  [search,grade,cluster,city,fee,form].forEach(el=>el.addEventListener(el===search?'input':'change',draw));draw();
})();
