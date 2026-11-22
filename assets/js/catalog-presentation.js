/* Presentation only: original card actions, fetches and rendering are retained. */
(function(){
'use strict';
const grid=document.getElementById('booksGrid');if(!grid)return;
const switches=[...document.querySelectorAll('[data-catalog-view]')];
function setView(value){const view=value==='list'?'list':'grid';grid.classList.toggle('catalog-list',view==='list');switches.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.catalogView===view)));try{localStorage.setItem('kk_catalog_view',view)}catch(e){}}
let initial='grid';try{initial=localStorage.getItem('kk_catalog_view')||'grid'}catch(e){}setView(initial);switches.forEach(b=>b.addEventListener('click',()=>setView(b.dataset.catalogView)));
const picker=document.getElementById('catalogCategoryPicker');
const dialog=document.createElement('dialog');dialog.className='catalog-category-dialog';dialog.setAttribute('aria-labelledby','catalogCategoriesTitle');dialog.innerHTML='<header><h2 id="catalogCategoriesTitle">Ҳамаи категорияҳо</h2><button type="button" aria-label="Пӯшидан">×</button></header><div class="catalog-category-options"></div>';document.body.appendChild(dialog);
function openCategories(){const container=dialog.querySelector('.catalog-category-options');container.replaceChildren();document.querySelectorAll('#shelfRow .spine').forEach(source=>{const button=document.createElement('button');button.type='button';const icon=source.querySelector('svg');if(icon)button.appendChild(icon.cloneNode(true));const text=document.createElement('span');text.textContent=source.querySelector('.label')?.textContent||'';button.appendChild(text);button.setAttribute('aria-current',String(source.classList.contains('active')));button.addEventListener('click',()=>{dialog.close();source.click();source.scrollIntoView({block:'nearest',inline:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})});container.appendChild(button)});dialog.showModal()}
picker?.addEventListener('click',openCategories);dialog.querySelector('header button').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
})();
