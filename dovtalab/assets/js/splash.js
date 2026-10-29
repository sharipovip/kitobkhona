(function(){
const s=document.getElementById('splashOverlay');
let seen=false;
try{seen=!!sessionStorage.getItem('dov.splash');sessionStorage.setItem('dov.splash','1')}catch(e){}
if(seen||!s){if(s)s.remove();return}
const hide=()=>{if(!s.parentNode)return;s.classList.add('done');setTimeout(()=>s.remove(),650)};
// v14: заставка ніколи «намемонад» — ҳатто агар load-и саҳифа дер кунад,
// танҳо пас аз 1 сония (ё максимум 2.2 с) пинҳон мешавад.
if(document.readyState==='complete')setTimeout(hide,1000);
else{window.addEventListener('load',()=>setTimeout(hide,1000));setTimeout(hide,2200);}
})();
