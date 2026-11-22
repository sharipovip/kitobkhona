/* Keyboard/focus handling only. Original service, edit and confirmation handlers stay authoritative. */
(function(){
'use strict';
const sheets=[...document.querySelectorAll('.sheet-overlay')],app=document.querySelector('.app');
if(!sheets.length)return;
const openers=new Map();let active=null;
function controls(root){return [...root.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(e=>!e.disabled&&e.getClientRects().length&&!e.closest('[hidden]'))}
function confirmationOpen(){const d=document.getElementById('kitobkhona-dialog-overlay');return d&&getComputedStyle(d).display!=='none'}
for(const overlay of sheets){
 const sheet=overlay.querySelector('.sheet');if(!sheet)continue;
 const title=sheet.querySelector('.sheet-head h3');
 sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.tabIndex=-1;
 if(title){if(!title.id)title.id=overlay.id+'Title';sheet.setAttribute('aria-labelledby',title.id)}
 for(const e of overlay.querySelectorAll('div[onclick],.icon-btn:not(button):not(a)')){
  e.setAttribute('role','button');e.tabIndex=0;
  if(e.classList.contains('icon-btn'))e.setAttribute('aria-label','Пӯшидан');
  e.addEventListener('keydown',event=>{if(event.target===e&&(event.key==='Enter'||event.key===' ')){event.preventDefault();e.click()}});
 }
 if(['helpOverlay','aboutOverlay','feedbackOverlay'].includes(overlay.id)){
  const back=document.createElement('button');back.type='button';back.className='icon-btn service-return';back.textContent='‹';back.setAttribute('aria-label','Бозгашт ба танзимот');
  sheet.querySelector('.sheet-head')?.prepend(back);
  back.addEventListener('click',()=>{overlay.classList.remove('open');window.openSettings()});
 }
}
function reconcile(){
 const opened=sheets.filter(e=>e.classList.contains('open')),next=opened.at(-1)||null;
 sheets.forEach(e=>{const on=e===next;e.inert=!on;e.setAttribute('aria-hidden',String(!on))});
 if(app)app.inert=!!next;
 if(next!==active){
  const previous=active;
  if(next){if(!openers.has(next))openers.set(next,document.activeElement);const focusSheet=()=>{if(next===active&&next.classList.contains('open')&&!confirmationOpen())(controls(next)[0]||next.querySelector('.sheet')).focus({preventScroll:true})};requestAnimationFrame(focusSheet);setTimeout(focusSheet,180)}
  else if(previous){const opener=openers.get(previous);if(opener?.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true});else document.getElementById('settingsBtn')?.focus({preventScroll:true})}
  if(previous&&!previous.classList.contains('open'))openers.delete(previous);
  active=next;
 }
}
const observer=new MutationObserver(reconcile);sheets.forEach(e=>observer.observe(e,{attributes:true,attributeFilter:['class']}));reconcile();
document.addEventListener('keydown',event=>{
 if(!active||confirmationOpen())return;
 if(event.key==='Escape'){
  event.preventDefault();const close=active.querySelector('.sheet-head [id^="close"]');if(close)close.click();else active.classList.remove('open');return;
 }
 if(event.key!=='Tab')return;
 const items=controls(active);if(!items.length){event.preventDefault();active.querySelector('.sheet')?.focus();return}
 const first=items[0],last=items.at(-1);
 if(event.shiftKey&&(document.activeElement===first||!active.contains(document.activeElement))){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&(document.activeElement===last||!active.contains(document.activeElement))){event.preventDefault();first.focus()}
});
})();
