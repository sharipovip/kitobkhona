(function(){
const D=window.DOV_CATALOG,params=new URLSearchParams(location.search),grade=params.get('grade'),cluster=params.get('cluster'),list=D.subjects[grade]?.[cluster]||[],requested=(params.get('subjects')||params.get('subject')||'').split(',').filter(Boolean),selected=list.filter(s=>requested.includes(s.id));
if(!selected.length){location.replace('choose-grade.html?mode=exam');return}
const info=document.getElementById('examInfo'),start=document.getElementById('beginExam'),host=document.getElementById('quizHost');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));const raf=window.requestAnimationFrame?window.requestAnimationFrame.bind(window):f=>setTimeout(()=>f(performance.now?performance.now():Date.now()),16);
const greet=()=>{document.getElementById('examGreet').textContent=`${(window.Dov&&window.Dov.profile()&&window.Dov.profile().name)||'Довталаб'}, омода ба санҷиш?`};greet();window.addEventListener('dov:profile',greet);
document.getElementById('changeExam').href=`choose-subjects.html?mode=exam&grade=${encodeURIComponent(grade)}&cluster=${encodeURIComponent(cluster)}`;
// Расмии ММТ: ҷадвали табдили холҳо ба балл (0–40 хол → 0–75 балл), ntc.tj.
const SCALE=[0,1.8766,3.7542,5.6351,7.5185,9.4082,11.3006,13.1966,15.0959,16.9975,18.9040,20.8106,22.7195,24.6274,26.5376,28.4465,30.3579,32.2706,34.1836,36.0978,38.0090,39.9173,41.8271,43.7324,45.6330,47.5315,49.4300,51.3220,53.2112,55.0977,56.9815,58.8630,60.7423,62.6211,64.4982,66.3743,68.2499,70.1250,72.0000,73.8750,75];
const ballFor=hol=>SCALE[Math.max(0,Math.min(40,Math.round(hol)))];
let data=null,run=null,timer=null,auto=null,tick=null;
window.DovBank.load().then(x=>{data=x;let n=selected.reduce((a,s)=>a+(data[DovBank.id(grade,cluster,s.id)]||[]).length,0);start.disabled=!n;info.textContent=n?`Синфи ${grade} · кластери ${cluster} · ${selected.map(s=>s.name).join(', ')} · ${n} савол`:'Барои ин интихоб саволҳо ҳоло нестанд.';if(n&&params.get('auto')==='1')start.click()}).catch(()=>{info.textContent='Мавод бор нашуд. Саҳифаро аз нав кушоед.'});
start.onclick=async()=>{start.disabled=true;let bank;try{bank=(await Promise.all(selected.map(async s=>(await DovBank.questions(grade,cluster,s.id)).map(q=>({...q,subjectName:s.name}))))).flat()}catch(e){info.textContent='Саволҳо бор нашуданд.';start.disabled=false;return}
if(!bank.length)return;
run={bank,answers:Array(bank.length).fill(null),locked:Array(bank.length).fill(false),index:0,started:Date.now(),name:selected.map(s=>s.name).join(', ')};
document.getElementById('examSetup').classList.add('hidden');host.classList.remove('hidden');document.body.classList.add('exam-session');draw();timer=setInterval(clock,1000)};
function clock(){const e=document.getElementById('clock');if(!e||!run)return;const t=Math.floor((Date.now()-run.started)/1000);e.querySelector('b').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;e.classList.remove('tick');void e.offsetWidth;e.classList.add('tick')}
function clearTimers(){clearTimeout(auto);clearInterval(tick)}
function draw(){const q=run.bank[run.index],locked=run.locked[run.index],chosen=run.answers[run.index];
host.innerHTML=`<div class="exam-screen"><div class="exam-top"><strong>${run.index+1} / ${run.bank.length}</strong><span class="time" id="clock" role="timer" aria-label="Вақти гузашта"><i aria-hidden="true"></i><b>00:00</b></span><button id="finish" class="btn btn-outline btn-small">Анҷоми кор</button></div><div class="exam-progress"><span style="width:${(run.index+(locked?1:0))/run.bank.length*100}%"></span></div><article class="exam-question ${locked?'is-locked':''}"><div class="exam-subject">${esc(q.subjectName)}</div>${q.context?`<p class="reading-context">${esc(q.context)}</p>`:''}<h2><span class="exam-qnum">${q.number}</span>${esc(q.prompt)}</h2>${q.answerOrigin==='ai'?'<div class="exam-warning">⚠ Ҷавобро ИИ ҳал кардааст; мустақилона санҷед.</div>':''}<div class="exam-answers">${q.options.map((o,i)=>{const picked=chosen===i;let cls='exam-option';if(locked&&picked)cls+=Number.isInteger(q.answer)&&q.answer===i?' chosen-right':' chosen-wrong';if(locked&&Number.isInteger(q.answer))cls+=i===q.answer?' is-right':(picked?' is-wrong':'');return `<button type="button" class="${cls}" data-choice="${i}" ${locked?'disabled':''} aria-pressed="${picked}"><b>${'АВСD'[i]})</b><span>${esc(o)}</span><em aria-hidden="true">${locked&&Number.isInteger(q.answer)&&i===q.answer?'✓':(locked&&picked&&q.answer!==i?'✗':'')}</em></button>`}).join('')}</div><div class="exam-verdict" id="verdict" role="status" aria-live="polite"></div></article><div class="exam-bottom"><button class="btn btn-primary" id="next" ${locked?'':'disabled'}>${run.index===run.bank.length-1?'Натиҷа':'Баъдӣ →'}</button></div><div class="countdown-bar" id="cbar" ${locked?'':'hidden'} aria-hidden="true"><i></i></div></div>`;
clock();host.querySelectorAll('.exam-verdict').forEach(v=>{if(locked)raf(()=>v.classList.add('show'))});
if(locked){const v=document.getElementById('verdict');let state='pending';
if(Number.isInteger(q.answer)){state=chosen===q.answer?'ok':'no';v.textContent=chosen===q.answer?'Дуруст! ✓':`Хато. Ҷавоби дуруст: ${'АВСD'[q.answer]}) ${q.options[q.answer]}`}
else v.textContent='Ҷавоби дурусти ин савол ҳоло маълум нест.';
v.classList.add(state,'show');
const cb=document.getElementById('cbar');cb.hidden=false;raf(()=>cb.classList.add('go'));
let n=3;const nb=document.getElementById('next');tick=setInterval(()=>{n--;if(n>0&&nb&&!nb.textContent.startsWith('Натиҷа'))nb.textContent=`Баъдӣ → · ${n}`},1000);
auto=setTimeout(()=>advance(),3000)}
else host.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>answer(Number(b.dataset.choice)));
document.getElementById('next').onclick=()=>{if(run.locked[run.index])advance()};document.getElementById('finish').onclick=()=>finish()}
function answer(i){if(!run||run.locked[run.index])return;run.answers[run.index]=i;run.locked[run.index]=true;draw()}
function advance(){if(!run)return;clearTimers();if(run.index===run.bank.length-1){finish();return}run.index++;draw()}
function finish(){if(!run)return;clearTimers();clearInterval(timer);
const bank=run.bank,scorable=bank.filter(q=>Number.isInteger(q.answer)).length,correct=bank.reduce((n,q,i)=>n+(Number.isInteger(q.answer)&&run.answers[i]===q.answer?1:0),0),answered=run.answers.filter(x=>x!==null).length,secs=Math.floor((Date.now()-run.started)/1000),minutes=Math.max(1,Math.round(secs/60));
const per={};bank.forEach((q,i)=>{const s=per[q.subjectName]||(per[q.subjectName]={name:q.subjectName,total:0,correct:0});s.total++;if(Number.isInteger(q.answer)&&run.answers[i]===q.answer)s.correct++});
const subjects=Object.values(per).map(s=>{const hol40=s.total>=40?s.correct:Math.round(s.correct/Math.max(1,s.total)*40);return {...s,hol:s.correct,hol40,ball:ballFor(hol40),approx:s.total<40}});
const hol=subjects.reduce((a,s)=>a+s.hol,0),ball=+subjects.reduce((a,s)=>a+s.ball,0).toFixed(1),maxBall=subjects.reduce((a,s)=>a+ballFor(Math.min(40,s.total)),0),pct=scorable?Math.round(correct/scorable*100):0;
window.Dov.record({answered,correct,minutes,sessions:1});
let sessions=[];try{sessions=JSON.parse(window.Dov.storage.getItem('dov.sessions')||'[]')}catch(e){}
sessions.push({d:window.Dov.today(),name:run.name,total:bank.length,answered,correct,minutes,hol,ball,maxBall,pct,subjects});sessions=sessions.slice(-30);try{window.Dov.storage.setItem('dov.sessions',JSON.stringify(sessions))}catch(e){}
window.dispatchEvent(new Event('dov:sessions'));
document.body.classList.remove('exam-session');
const C=2*Math.PI*54,okLen=scorable?correct/scorable*C:0,noLen=scorable?(answered-correct)/scorable*C:0;
host.innerHTML=`<article class="exam-result"><div class="tricolor" aria-hidden="true"></div><h1>Натиҷаи санҷиш</h1><p class="result-sub">${esc(run.name)} · ${Math.floor(secs/60)} дақ. ${secs%60} сон. · ${pct>=85?'Сатаи «Аъло»':pct>=70?'Сатаи «Хуб»':pct>=50?'Сатаи «Қонеъовар»':'Машқи бештар лозим'}</p>
<div class="result-hero"><div class="donut" role="img" aria-label="${correct} дуруст, ${answered-correct} хато"><svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="54"/><circle class="ring-no" cx="60" cy="60" r="54" stroke-dasharray="0 ${C}" data-len="${noLen}"/><circle class="ring-ok" cx="60" cy="60" r="54" stroke-dasharray="0 ${C}" data-len="${okLen}"/></svg><div class="donut-label"><b class="count" data-to="${correct}">0</b><span>аз ${bank.length} дуруст</span></div></div>
<div class="score-box"><small>ҶАМЪИ БАЛЛ АЗ РӯИ ШКАЛАИ ММТ</small><strong><span class="count" data-to="${ball}" data-dec="1">0</span></strong><span>аз ${maxBall} балли имконӣ · ${hol} хол</span><small class="score-note">Табдили расмии хол→балл (ntc.tj). Балли ниҳоии озмуни қабул вобаста ба вазни фанҳои гурӯҳи интихобшуда аст.</small></div></div>
<div class="subject-bars">${subjects.map(s=>`<div class="sbar"><span class="sbar-name">${esc(s.name)}${s.approx?' <i class="approx">тақрибӣ</i>':''}</span><span class="sbar-track"><i style="--w:${s.total?Math.round(s.correct/s.total*100):0}%"></i></span><span class="sbar-val">${s.correct}/${s.total} · ${s.ball} балл</span></div>`).join('')}</div>
${answered-correct||answered<bank.length?`<p class="notice">Дуруст: ${correct} · Хато: ${answered-correct} · Бе ҷавоб: ${bank.length-answered}</p>`:`<p class="notice ok-notice">Ҳамаи ҷавобҳо дуруст! 🎉</p>`}
${bank.some(q=>q.answerOrigin==='ai')?`<div class="notice warn">Ҷавобҳои ИИ (мустақилона санҷед): ${bank.map((q,i)=>q.answerOrigin==='ai'?`${esc(q.subjectName)} №${q.number}: ${'АВСD'[q.answer]}`:'').filter(Boolean).join('; ')}</div>`:''}
<div class="toolbar"><a href="./choose-grade.html?mode=exam" class="btn btn-primary">Аз нав санҷиш</a><a class="btn btn-outline" href="./progress.html">Пешрафт</a><a class="btn btn-outline" href="../index.html">Асосӣ</a></div>${pct>=60?'<div class="confetti" aria-hidden="true">'+Array.from({length:28},(_,k)=>`<i style="left:${3+k*3.4+(k*37)%7}%;animation-delay:${(k%9)*0.22}s;animation-duration:${2.4+(k%5)*0.35}s"></i>`).join('')+'</div>':''}</article>`;
raf(()=>{host.querySelectorAll('.ring-ok,.ring-no').forEach(c=>c.style.strokeDasharray=`${c.dataset.len} ${C}`)});
host.querySelectorAll('.count').forEach(el=>{const to=+el.dataset.to,dec=+(el.dataset.dec||0),t0=performance.now(),dur=900;const stepF=t=>{const k=Math.min(1,(t-t0)/dur),v=to*(1-Math.pow(1-k,3));el.textContent=dec?v.toFixed(dec):Math.round(v);if(k<1)raf(stepF)};raf(stepF)});
run=null;window.scrollTo(0,0)}
})();
