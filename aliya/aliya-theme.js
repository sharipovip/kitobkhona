/* Shared visual theme only. No authentication, API calls or storage deletion. */
(function(){
  'use strict';
  var allowed=['dark','light','minimal'];
  function read(){try{var t=localStorage.getItem('kk_theme');return allowed.indexOf(t)>=0?t:'dark';}catch(e){return 'dark';}}
  function apply(theme,persist){
    var t=allowed.indexOf(theme)>=0?theme:'dark',root=document.documentElement;
    root.dataset.appTheme=t;root.classList.toggle('aliya-light',t!=='dark');root.style.colorScheme=t==='dark'?'dark':'light';
    var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content={dark:'#101c2b',light:'#f5f6f0',minimal:'#f4f7fb'}[t];
    if(persist)try{localStorage.setItem('kk_theme',t);}catch(e){}
    return t;
  }
  window.KitobkhonaAliyaTheme={read:read,apply:apply};apply(read(),false);
  window.addEventListener('storage',function(e){if(e.key==='kk_theme')apply(read(),false);});
})();
