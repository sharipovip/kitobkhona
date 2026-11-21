/* One visible contest; rotation is local-only and pauses while the page is hidden. */
(function(){
 const list=document.getElementById('ozmunList');if(!list)return;
 let active=0;list.classList.add('contest-spotlight');
 function paint(){const items=[...list.querySelectorAll('.ozmun-item-v3')];if(!items.length)return;active%=items.length;items.forEach((el,i)=>{el.hidden=i!==active;el.setAttribute('aria-hidden',String(i!==active));const c=CONTESTS?.contests?.find(x=>x.id===el.dataset.oz);let meta=el.querySelector('.contest-meta');if(!meta){meta=document.createElement('div');meta.className='contest-meta';el.appendChild(meta)}if(c){el.querySelector('.ozmun-label-v3').textContent=c.name;const t=ozTimeline(c);meta.textContent=t.next?(t.state==='now'?'● Ҳоло идома дорад · ':t.days!=null?'Пас аз '+t.days+' рӯз · ':'')+t.next.name+' · '+ozRange(t.next)+(t.next.approx?' · тахминӣ':''):'Ҷадвали нав ҳанӯз эълон нашудааст';}el.tabIndex=i===active?0:-1;el.setAttribute('role','button');});}
 const observer=new MutationObserver(paint);observer.observe(list,{childList:true});
 // loadContests changes badge nodes, so watch those without observing text changes from paint.
 const original=applyOzmunBadges;applyOzmunBadges=function(){original();paint()};
 list.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const el=e.target.closest('.ozmun-item-v3');if(el){e.preventDefault();ozmunTap(el)}}});
 const timer=setInterval(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden||document.getElementById('ozSheet')||list.matches(':focus-within,:hover'))return;active++;paint()},6500);
 window.addEventListener('pagehide',()=>{clearInterval(timer);observer.disconnect()},{once:true});paint();
})();
