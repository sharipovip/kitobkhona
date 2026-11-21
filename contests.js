const $=id=>document.getElementById(id);let CONTESTS=null;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function openContestLink(url){const u=new URL(url);if(['https:','http:'].includes(u.protocol))location.href=u.href;}
const OZ_MONTHS=['январ','феврал','март','апрел','май','июн','июл','август','сентябр','октябр','ноябр','декабр'];
function ozDay(s){ const d=new Date(s+'T00:00:00'); return Number.isNaN(d.getTime())?null:d; }
function ozFmt(s){ const d=ozDay(s); return d?`${d.getDate()} ${OZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`:s; }
function ozRange(st){ const a=ozDay(st.start),b=ozDay(st.end); if(!a||!b) return st.start; if(a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${OZ_MONTHS[a.getMonth()]} ${a.getFullYear()}`; return `${ozFmt(st.start)} — ${ozFmt(st.end)}`; }
function ozShift(st,years){ const sh=s=>{const d=ozDay(s); if(!d) return s; d.setFullYear(d.getFullYear()+years); return d.toISOString().slice(0,10)}; return {...st,start:sh(st.start),end:sh(st.end),approx:true}; }
// Ҷадвали амалкунанда: агар ҳамаи даврҳои сол гузашта бошанд, ҷадвал ба соли оянда кӯчонида мешавад (тахминӣ).
function ozTimeline(c){ const today=new Date(); today.setHours(0,0,0,0); let stages=(c.stages||[]).slice(); if(!stages.length) return {stages:[],next:null}; if(c.recurring){ let guard=0; while(guard++<3 && stages.every(s=>{const e=ozDay(s.end); return e && e<today})){ stages=stages.map(s=>ozShift(s,1)); } } const next=stages.find(s=>{const e=ozDay(s.end); return e && e>=today})||null; let state='none',days=null; if(next){ const a=ozDay(next.start); if(a&&a<=today) state='now'; else if(a){ days=Math.ceil((a-today)/86400000); state=days<=Number(CONTESTS?.soonDays||30)?'soon':'later'; } } return {stages,next,state,days}; }
function openContestSheet(c,page){
  document.getElementById('ozSheet')?.remove();
  const t=ozTimeline(c); const today=new Date(); today.setHours(0,0,0,0);
  let status='';
  if(t.state==='now') status=`<div class="oz-status oz-status-now">● Ҳоло идома дорад: ${esc(t.next.name)} · то ${ozFmt(t.next.end)}</div>`;
  else if(t.state==='soon') status=`<div class="oz-status oz-status-soon">● Пас аз ${t.days} рӯз: ${esc(t.next.name)} — ${ozRange(t.next)}</div>`;
  else if(t.state==='later') status=`<div class="oz-status">Даври навбатӣ: ${esc(t.next.name)} — ${ozRange(t.next)}${t.next.approx?' (тахминӣ)':''}</div>`;
  else status=`<div class="oz-status">Ҷадвали даврҳои нав ҳанӯз эълон нашудааст</div>`;
  const stages=t.stages.map(s=>{ const a=ozDay(s.start),b=ozDay(s.end); const past=b&&b<today; const cur=t.next&&s.n===t.next.n&&s.start===t.next.start; return `<div class="oz-stage${past?' past':''}${cur?' cur':''}"><div class="oz-stage-dot"></div><div><div class="oz-stage-name">${esc(s.name)}${s.final?' 🏆':''}</div><div class="oz-stage-meta">📅 ${ozRange(s)}${s.approx?' · тахминӣ':''}${s.place?`<br>📍 ${esc(s.place)}`:''}</div></div></div>`; }).join('');
  const how=(c.how||[]).map((h,i)=>`<li>${esc(h)}</li>`).join('');
  // v127: тугмаҳои тамос бо data-атрибутҳо (onclick бо нохунакҳои дугона кор намекард) + танҳо номи сомона нишон дода мешавад
  const contacts=(c.contacts||[]).map((k,i)=>{ let host=''; try{ host=new URL(k.url).hostname.replace(/^www\./,''); }catch(e){ host=String(k.url||''); } return `<button type="button" class="oz-contact" data-oz-link="${i}"><b>${esc(k.label)}</b><span>${esc(k.note||'')}${k.note?' · ':''}${esc(host)} ↗</span></button>`; }).join('');
  const wrap=document.createElement('div'); wrap.id='ozSheet'; wrap.className='oz-sheet-wrap'; wrap.onclick=e=>{ if(e.target===wrap) wrap.remove(); };
  wrap.innerHTML=`<div class="oz-sheet" role="dialog" aria-modal="true"><div class="oz-grip"></div>
    <div class="oz-title">${esc(c.name)}</div><div class="oz-sub">${esc(c.decree||'')}</div>
    ${status}
    <div class="oz-h">📅 Кай ва дар куҷо</div><div class="oz-stages">${stages}</div>
    ${c.who?`<div class="oz-h">👥 Кӣ иштирок карда метавонад</div><div class="oz-p">${esc(c.who)}</div>`:''}
    ${how?`<div class="oz-h">📝 Чӣ тавр иштирок кунем</div><ol class="oz-ol">${how}</ol>`:''}
    ${contacts?`<div class="oz-h">☎️ Тамос ва сомонаҳои расмӣ</div><div class="oz-contacts">${contacts}</div>`:''}
    <button type="button" class="oz-btn oz-btn-gold" onclick="location.href='${esc(page||c.page)}'">📜 Низомномаи пурраи Озмун</button>
    <button type="button" class="oz-btn" onclick="document.getElementById('ozSheet').remove()">Пӯшидан</button>
    <div class="oz-src">${(c.sources||[]).map(esc).join(' · ')}</div></div>`;
  wrap.querySelectorAll('[data-oz-link]').forEach(btn=>{ btn.addEventListener('click',ev=>{ ev.preventDefault(); ev.stopPropagation(); const k=(c.contacts||[])[Number(btn.dataset.ozLink)]; if(!k) return; btn.classList.add('busy'); openContestLink(k.url,k.label); wrap.remove(); }); });
  document.body.appendChild(wrap);
}


async function initContests(){
try{const r=await fetch('data/contests.json',{cache:'no-cache'});if(!r.ok)throw Error(r.status);CONTESTS=await r.json();localStorage.setItem('kk_contests_cache_v1',JSON.stringify(CONTESTS))}catch(e){try{CONTESTS=JSON.parse(localStorage.getItem('kk_contests_cache_v1')||'null')}catch(e){}}
const list=$('contestList');if(!CONTESTS?.contests?.length){list.textContent='Ҷадвали озмунҳо ҳоло дастрас нест. Лутфан боз кӯшиш кунед.';return;}
const score=c=>{const t=ozTimeline(c);return t.state==='now'?-1000:t.days??500};
list.textContent='';[...CONTESTS.contests].sort((a,b)=>score(a)-score(b)).forEach(c=>{const t=ozTimeline(c);const b=document.createElement('button');b.type='button';b.className='contest-card';b.innerHTML=`<span class="contest-emblem"><img src="${esc(c.banner)}" alt="" loading="lazy"></span><span class="contest-name">${esc(c.name)}</span><span class="contest-status">${t.state==='now'?'● Ҳоло идома дорад':t.days!=null?'Пас аз '+t.days+' рӯз':'Ҷадвали навбатӣ'}</span><span class="contest-stage">${t.next?esc(t.next.name)+'<br>'+esc(ozRange(t.next))+(t.next.approx?' · тахминӣ':''): 'Ҷадвал ҳанӯз эълон нашудааст'}</span><span class="contest-more">Муфассал →</span>`;b.addEventListener('click',()=>openContestSheet(c,c.page));list.appendChild(b)});
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('ozSheet')?.remove()});initContests();
