/* Standalone documents share the app theme without booting account/API services. */
(function(){
 const themes={dark:['#101C2B','#19283B','#22354A','#F2EAD9','#B5C1D1','#E6BD70','#304054'],light:['#F5F6F0','#FFFFFF','#E6EDDD','#203B34','#53685F','#25634E','#DCE4DA'],minimal:['#F4F7FB','#FFFFFF','#E9EFFB','#1E304C','#52647B','#315DCC','#DCE4EF']};
 function apply(){let name='dark';try{name=localStorage.getItem('kk_theme')||'dark'}catch(e){}if(!themes[name])name='dark';document.documentElement.dataset.appTheme=name;const values=themes[name];['bg','card','card2','text','muted','gold','line'].forEach((key,i)=>document.documentElement.style.setProperty('--'+key,values[i]));document.documentElement.style.colorScheme=name==='dark'?'dark':'light'}
 apply();window.addEventListener('storage',e=>{if(e.key==='kk_theme')apply()});window.addEventListener('pageshow',apply);
})();
