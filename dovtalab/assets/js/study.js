(async function(){
 const D=window.DOV_DATA,P=window.Dov.profile(),g=document.getElementById('gradeSelect'),c=document.getElementById('clusterSelect'),s=document.getElementById('subjectSelect'),cards=document.getElementById('subjectCards'),availability=document.getElementById('studyAvailability'),start=document.getElementById('startStudy');let bank;
 const esc=x=>String(x??'').replace(/[&<>"']/g,y=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[y]));
 g.innerHTML='<option value="11">Синфи 11 · қисми А</option><option value="9">Синфи 9 · қисми Б</option>';g.value=P?.grade||'11';c.innerHTML=Object.entries(D.clusterNames).map(([k,v])=>`<option value="${k}">Кластери ${k} · ${esc(v)}</option>`).join('');c.value=P?.cluster||'1';start.disabled=true;
 try{bank=await window.DovBank.load()}catch(e){availability.textContent='Хатои боркунии база. Пайвастшавиро санҷида, саҳифаро аз нав кушоед.';return}
 function href(sid){return `./test-view.html?grade=${g.value}&cluster=${c.value}&subject=${encodeURIComponent(sid)}`}
 function count(sid){return (bank[window.DovBank.id(g.value,c.value,sid)]||[]).length}
 function syncButton(){start.disabled=!count(s.value)}
 function render(){const list=D.subjects[g.value]?.[c.value]||[],old=s.value;s.innerHTML=list.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');if(list.some(x=>x.id===old))s.value=old;
 const total=list.reduce((sum,x)=>sum+count(x.id),0);document.getElementById('structureNote').textContent=`${D.clusterNames[c.value]} · ${list.length} фан`;availability.textContent=`${total} савол барои ин синф ва кластер дастрас аст.`;
 cards.innerHTML=list.map(x=>{const n=count(x.id);return `<article class="card subject-card"><span class="badge">${x.alternative?'Фанни интихобӣ':'Фан'}</span><h3>${esc(x.name)}</h3><p>${n?`${n} савол дастрас аст.`:'Саволҳои мувофиқ ҳоло дастрас нестанд.'}</p>${n?`<a class="btn btn-secondary btn-small" href="${href(x.id)}">Намунаи тест →</a>`:''}</article>`}).join('');syncButton();}
 g.onchange=render;c.onchange=render;s.onchange=syncButton;start.onclick=()=>{if(count(s.value))location.href=href(s.value)};window.addEventListener('dov:profile',e=>{g.value=e.detail.grade;c.value=e.detail.cluster;render()});render();
})();
