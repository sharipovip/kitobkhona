(function(){
const D=window.Dov;let period=7;
const byId=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const safe=x=>Math.max(0,Number(x)||0);const raf=window.requestAnimationFrame?window.requestAnimationFrame.bind(window):f=>setTimeout(()=>f(performance.now()),16);
function sessions(){try{return JSON.parse(D.storage.getItem('dov.sessions')||'[]')}catch(e){return []}}
function countUp(el,to){const from=Number(el.textContent)||0,t0=performance.now(),dur=620;const f=t=>{const k=Math.min(1,(t-t0)/dur),v=from+(to-from)*(1-Math.pow(1-k,3));el.textContent=String(Math.round(v));if(k<1)raf(f)};raf(f)}
function render(){
const a=D.getActivity()||{},days=[];
for(let i=29;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);const key=dateKey(d),r=a[key]||{};days.push({key,answered:safe(r.answered),correct:safe(r.correct),sessions:safe(r.sessions),minutes:safe(r.minutes)})}
const win=days.slice(30-period),sum=k=>win.reduce((s,d)=>s+d[k],0),answered=sum('answered'),correct=sum('correct'),accuracy=answered?Math.round(correct/answered*100):null;
countUp(byId('metricAnswered'),answered);byId('metricAccuracy').textContent=accuracy===null?'—':accuracy+'%';countUp(byId('metricMinutes'),sum('minutes'));countUp(byId('metricSessions'),sum('sessions'));
byId('chartSummary').textContent=`${period} рӯзи охир · ${answered} савол`;
let d=new Date();d.setHours(12,0,0,0);if(!a[dateKey(d)]?.answered)d.setDate(d.getDate()-1);let streak=0;for(let i=0;i<366;i++){if(!a[dateKey(d)]?.answered)break;streak++;d.setDate(d.getDate()-1)}
countUp(byId('metricStreak'),streak);byId('chartEmpty').hidden=answered>0;
const max=Math.max(1,...win.map(x=>x.answered)),chart=byId('activityChart');chart.classList.toggle('dense',period===30);
chart.innerHTML=win.map((x,i)=>{const label=x.key.slice(5).split('-').reverse().join('.'),pct=Math.round(x.answered/max*100),show=period===7||i%5===0||i===win.length-1;return `<button class="chart-day" type="button" data-day="${i}" aria-label="${label}: ${x.answered} савол, ${x.correct} дуруст"><span class="chart-bar-track"><span class="chart-bar" style="height:${Math.max(x.answered?3:1,pct)}%"></span></span><span class="chart-day-label">${show?label:'&nbsp;'}</span></button>`}).join('');
chart.querySelectorAll('[data-day]').forEach(btn=>btn.onclick=()=>{chart.querySelectorAll('[data-day]').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');const x=win[+btn.dataset.day];byId('chartInfo').textContent=`${x.key.split('-').reverse().join('.')} · ${x.answered} савол · ${x.correct} дуруст · ${x.minutes} дақ.`});
byId('chartInfo').textContent='Барои дидани маълумоти рӯз сутунро интихоб кунед.';
document.querySelectorAll('[data-period]').forEach(b=>{b.setAttribute('aria-pressed',String(+b.dataset.period===period));b.onclick=()=>{period=+b.dataset.period;render()}});
// Тақвими 30 рӯз
const heat=byId('heatGrid');if(heat)heat.innerHTML=days.map(x=>{const l=x.answered===0?0:x.answered<3?1:x.answered<6?2:x.answered<10?3:4;return `<i class="l${l}" title="${x.key.split('-').reverse().join('.')}: ${x.answered} савол, ${x.correct} дуруст"></i>`}).join('');
// Дақиқ аз рӯи фанҳо
const agg={};sessions().forEach(s=>(s.subjects||[]).forEach(t=>{const g=agg[t.name]||(agg[t.name]={name:t.name,total:0,correct:0});g.total+=safe(t.total);g.correct+=safe(t.correct)}));
const top=Object.values(agg).sort((x,y)=>y.total-x.total).slice(0,4),rings=byId('subjectRings');
if(rings)rings.innerHTML=top.length?top.map(t=>{const p=Math.round(t.correct/Math.max(1,t.total)*100);return `<div class="ring-item"><div class="ring" style="--p:${p}" data-val="${p}%"></div><span title="${esc(t.name)}">${esc(t.name)}</span></div>`}).join(''):'<p class="dash-hint">Баъди санҷишҳои аввал ин ҷо дақиқи ҳар фан намоён мешавад.</p>';
// Сессияҳои охирин
const list=sessions().slice(-3).reverse(),sl=byId('sessionList');
if(sl)sl.innerHTML=list.length?list.map(s=>`<li><span class="dot"></span><span class="s-main"><b>${s.d.split('-').reverse().join('.')} · ${esc(s.name)}</b><span class="sc">${safe(s.correct)}/${safe(s.total)} · ${s.ball} балл</span></span></li>`).join(''):'<li class="empty"><span class="dash-hint">Ҳанӯз сессия нест — бахши «Санҷиш»ро оғоз кунед.</span></li>';
// Ҳадафи ҳафта (аз душанбе)
const now=new Date();now.setHours(12,0,0,0);const dow=(now.getDay()+6)%7;let week=0;
for(let i=0;i<=dow;i++){const dd=new Date(now);dd.setDate(now.getDate()-i);week+=safe((a[dateKey(dd)]||{}).answered)}
const GOAL=50,p=Math.min(100,Math.round(week/GOAL*100)),gr=byId('goalRing');
if(gr){gr.style.setProperty('--p',p);byId('goalPct').textContent=p+'%';byId('goalNote').textContent=week>=GOAL?`Ҳадаф иҷро шуд — ${week} савол дар ҳафта!`:`${week} аз ${GOAL} саволи ҳафта ҳал шуд.`}
}
render();window.addEventListener('dov:activity',render);window.addEventListener('dov:sessions',render);
})();
