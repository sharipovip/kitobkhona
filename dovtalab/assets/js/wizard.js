(async function(){
 const D=window.DOV_CATALOG,p=new URLSearchParams(location.search),step=document.body.dataset.step,mode=['study','exam','materials'].includes(p.get('mode'))?p.get('mode'):'study',g=p.get('grade'),c=p.get('cluster');
 const esc=x=>String(x??'').replace(/[&<>"']/g,y=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[y]));
 const steps=['grade','cluster','subjects'],index=steps.indexOf(step),area=document.getElementById('choiceArea'),next=document.getElementById('wizardNext'),back=document.getElementById('wizardBack'),info=document.getElementById('selectedInfo');
 if(index>0&&!['9','11'].includes(g)){location.replace(`choose-grade.html?mode=${mode}`);return}if(index>1&&!D.clusterNames[c]){location.replace(`choose-cluster.html?mode=${mode}&grade=${g}`);return}
 document.body.dataset.page=mode;document.querySelector(`.nav a[href$="mode=${mode}"]`)?.setAttribute('aria-current','page');
 document.getElementById('modeLabel').textContent={study:'ОМӮЗИШ',exam:'САНҶИШ',materials:'МАВОД'}[mode]+' · ҚАДАМИ '+(index+1)+' АЗ 3';
 document.title={study:'Омӯзиш',exam:'Санҷиш',materials:'Мавод'}[mode]+' · Интихоб';
 const uname=(window.Dov&&window.Dov.profile()&&window.Dov.profile().name)||'';const titled=base=>uname?`${uname}, ${base.charAt(0).toLowerCase()+base.slice(1)}`:base;
 document.getElementById('wizardTitle').textContent=[titled('Синфи худро интихоб намоед'),titled('Кластерро интихоб кунед'),titled('Кадом фанҳоро мехонед?')][index];
 document.getElementById('wizardDescription').textContent=['Барои оғози роҳат ва дақиқ зинаи таҳсилатонро интихоб намоед.','Самти таҳсилатонро интихоб намоед. Баъд аз он фанҳои мувофиқро мебинед.','Якчанд фан ё ҳамаи фанҳои дастрасро интихоб кунед.'][index];
 steps.forEach((name,i)=>document.getElementById('step'+name[0].toUpperCase()+name.slice(1)).classList.add(i===index?'current':i<index?'done':'future'));
 document.getElementById('selectionSummary').textContent=index?`Синфи ${g}${index===2?`  ·  Кластери ${c} · ${D.clusterNames[c]}`:''}`:'';
 const url=(name,more={})=>{const z=new URLSearchParams({mode,...more});return `choose-${name}.html?${z}`};
 back.href=index===0?'../index.html':index===1?url('grade'):url('cluster',{grade:g});
 let selected=new Set();
 if(step==='grade'){
  area.innerHTML=[['11','11','Қисми А','Дар заминаи таҳсилоти умумии миёна'],['9','09','Қисми Б','Дар заминаи таҳсилоти умумии асосӣ']].map(([id,num,name,desc])=>`<button class="choice" type="button" data-choice="${id}" aria-pressed="false"><span class="choice-digit">${num}</span><span class="choice-body"><strong>Синфи ${id} · ${name}</strong><small>${desc}</small></span><span class="choice-mark">✓</span></button>`).join('');
 }else if(step==='cluster'){
  const icons=['✳','◈','✎','⚖','✚'];area.innerHTML=Object.entries(D.clusterNames).map(([n,name],i)=>`<button class="choice" type="button" data-choice="${n}" aria-pressed="false"><span class="choice-icon">${icons[i]}</span><span class="choice-body"><strong>Кластери ${n}</strong><small>${esc(name)}</small></span><span class="choice-mark">✓</span></button>`).join('');
 }else{
  let data;try{data=await DovBank.load()}catch(e){area.textContent='Базаи саволҳо бор нашуд. Саҳифаро аз нав кушоед.';return}
  const list=D.subjects[g]?.[c]||[],available=list.filter(x=>(data[DovBank.id(g,c,x.id)]||[]).length);
  area.innerHTML=`<button class="choice all-choice" type="button" data-all aria-pressed="false" ${available.length?'':'disabled'}><span class="choice-icon">✦</span><span class="choice-body"><strong>Ҳамаи фанҳои дастрас</strong><small>Якбора интихоб кардани ${available.length} фан</small></span><span class="choice-mark">✓</span></button>`+list.map((x,i)=>{let n=(data[DovBank.id(g,c,x.id)]||[]).length;return `<button class="choice" type="button" data-choice="${esc(x.id)}" aria-pressed="false" ${n?'':'disabled'}><span class="choice-icon">${String(i+1).padStart(2,'0')}</span><span class="choice-body"><strong>${esc(x.name)}</strong><small>${n?`${n} савол дастрас`:'Ҳоло савол дастрас нест'}</small></span><span class="choice-mark">✓</span></button>`}).join('');
  area.querySelector('[data-all]').onclick=()=>{let all=selected.size===available.length;selected=new Set(all?[]:available.map(x=>x.id));refresh()};
 }
 function refresh(){area.querySelectorAll('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',String(selected.has(b.dataset.choice))));const all=area.querySelector('[data-all]');if(all){const available=area.querySelectorAll('[data-choice]:not(:disabled)').length;all.setAttribute('aria-pressed',String(available>0&&selected.size===available));info.textContent=selected.size?`${selected.size} фан интихоб шуд`:''}else info.textContent=selected.size?(step==='grade'?`Пешфарз аз профил: синфи ${[...selected][0]}`:`Пешфарз аз профил: кластери ${[...selected][0]}`):'';next.disabled=selected.size===0}
 area.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{if(step==='subjects'){selected.has(b.dataset.choice)?selected.delete(b.dataset.choice):selected.add(b.dataset.choice)}else selected=new Set([b.dataset.choice]);refresh()});
 if(step==='grade'||step==='cluster'){const pr=(window.Dov&&window.Dov.profile())||{},val=String(step==='grade'?(pr.grade||''):(pr.cluster||''));const ok=step==='grade'?['11','9'].includes(val):!!D.clusterNames[val];if(ok){selected=new Set([val]);const card=area.querySelector(`[data-choice="${val}"]`);if(card)card.classList.add('from-profile');refresh()}}
 function navigate(href){const shell=document.querySelector('.wizard-shell');if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){location.href=href;return}shell.classList.add('leaving');next.disabled=true;setTimeout(()=>{location.href=href},150)}
 next.onclick=()=>{if(!selected.size)return;let value=[...selected][0];if(step==='grade'){navigate(url('cluster',{grade:value}));return}if(step==='cluster'){navigate(url('subjects',{grade:g,cluster:value}));return}
  const ids=(D.subjects[g]?.[c]||[]).filter(x=>selected.has(x.id)).map(x=>x.id),q=new URLSearchParams({grade:g,cluster:c,subjects:ids.join(',')});if(mode==='study')navigate(`test-view.html?${q}`);else if(mode==='exam'){q.set('auto','1');navigate(`exam.html?${q}`)}else navigate(`materials.html?${q}`);
 };
})();
