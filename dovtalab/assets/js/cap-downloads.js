/* Довталаб: канал скачивания файлов внутри Android-приложения.
   В WebView браузерные скачивания (blob:) блокируются Android — поэтому
   файл сохраняется через плагин Filesystem в папку «Документы/Довталаб»,
   а пользователь видит уведомление. В обычном браузере ничего не меняется. */
(function(){
function native(){return !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())}
function toast(msg,ok){
  try{
    var t=document.getElementById('dovToast');
    if(!t){t=document.createElement('div');t.id='dovToast';
      t.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;padding:10px 18px;border-radius:12px;background:#132a23;color:#eaf4ee;font:14px/1.4 system-ui;border:1px solid #2b4a3e;box-shadow:0 8px 24px rgba(0,0,0,.45);max-width:86vw;text-align:center;opacity:0;transition:opacity .25s';
      document.body.appendChild(t)}
    t.textContent=msg;t.style.borderColor=ok?'#3e8f68':'#a05a52';
    t.style.opacity='1';clearTimeout(t._h);t._h=setTimeout(function(){t.style.opacity='0'},4000);
  }catch(e){}
}
function saveNative(href,name){
  var FS=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Filesystem;
  if(!FS){return false}
  toast('Файл нигоҳдорӣ мешавад…',true);
  fetch(href).then(function(r){return r.blob()}).then(function(blob){
    return new Promise(function(res,rej){
      try{var fr=new FileReader();fr.onload=function(){res(String(fr.result))};fr.onerror=rej;
        fr.readAsDataURL(blob)}catch(e){rej(e)}
    })
  }).then(function(dataURL){
    var b64=dataURL.split(',')[1]||'';
    var path=(name||'file').replace(/[\\\/]/g,'_');
    return FS.writeFile({path:'Довталаб/'+path,data:b64,directory:'DOCUMENTS',recursive:true})
      .then(function(){toast('✓ Нигоҳ дошта шуд: Документҳо/Довталаб/'+path,true)})
      .catch(function(){return FS.writeFile({path:path,data:b64,directory:'DOCUMENTS'})
        .then(function(){toast('✓ Нигоҳ дошта шуд: Документҳо/'+path,true)})});
  }).catch(function(){
    /* Сеть недоступна — открываем ссылку в системном браузере, там скачивание сработает */
    toast('Кушодаш дар browser…',true);
    try{
      var App=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App;
      if(App&&App.launchUrl){App.launchUrl(href,{openInSystem:true}).catch(function(){location.href=href})}
      else{location.href=href}
    }catch(e){location.href=href}
  });
  return true;
}
function fileLink(e){
  if(!native())return;
  const a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
  if(!a)return;
  const h=a.getAttribute('href')||'';
  if(!/^https?:/i.test(h))return;
  if(!/\.(exe|zip|apk|msi|pdf|docx)(\?|#|$)/i.test(h))return;
  e.preventDefault();e.stopPropagation();
  let name='file';
  try{name=decodeURIComponent(h.split('/').pop().split('?')[0])||'file'}catch(err){}
  /* 1) копия, вложенная в программу (www/pc/имя файла) — работает без интернета */
  try{
    const local=new URL('pc/'+name,location.href).href;
    toast('Истифодаи нусхаи дохилӣ…',true);
    fetch(local).then(r=>{
      if(!r.ok)throw 0;
      return r.blob().then(b=>{if(b.size<4096)throw 0;return b});
    }).then(blob=>{
      const fr=new FileReader();
      fr.onload=()=>{
        const path=name.replace(/[\\\/]/g,'_');
        const FS=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Filesystem;
        if(!FS)return;
        FS.writeFile({path:'Довталаб/'+path,data:String(fr.result).split(',')[1]||'',directory:'DOCUMENTS',recursive:true})
          .then(()=>toast('✓ Нигоҳ дошта шуд: Документҳо/Довталаб/'+path,true))
          .catch(()=>toast('Нигоҳдорӣ нагзашт.',false));
      };
      fr.readAsDataURL(blob);
    }).catch(()=>{ /* 2) файла нет внутри — качаем с GitHub */ saveNative(h,name) });
  }catch(err){saveNative(h,name)}
}
function pyw(){return window.pywebview&&window.pywebview.api&&!!window.pywebview.api}
function savePyw(href,name){
  if(!pyw())return false;
  toast('Дар проводники Windows ҷойро интихоб кунед…',true);
  fetch(href).then(function(r){return r.blob()}).then(function(blob){
    return new Promise(function(res,rej){
      try{var fr=new FileReader();fr.onload=function(){res(String(fr.result).split(',')[1]||'')};fr.onerror=rej;
        fr.readAsDataURL(blob)}catch(e){rej(e)}
    })
  }).then(function(b64){
    var api=window.pywebview.api;
    if(api.save_file_as){
      return api.save_file_as(name,b64).then(function(res){
        toast(res?('✓ Нигоҳ дошта шуд: '+res):'Бекор карда шуд.',true)
      })
    }
    var path=(name||'file').replace(/[\\/]/g,'_');
    return api.save_file(path,b64).then(function(){
      toast('✓ Нигоҳ дошта шуд: Downloads/'+path,true)
    })
  }).catch(function(){toast('Нигоҳдорӣ нагзашт. Аз нав кӯшиш кунед.',false)});
  return true;
}
function arm(){
  window.addEventListener('click',fileLink,true);
  try{
    var orig=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){
      try{
        var h=this.getAttribute('href')||'';
        if(this.download&&(/^(blob:|data:)/.test(h))){
          if(savePyw(h,this.download))return;
          if(saveNative(h,this.download))return;
        }
      }catch(e){}
      return orig.apply(this,arguments);
    };
  }catch(e){}
}
if(document.readyState!=='loading')arm();else document.addEventListener('DOMContentLoaded',arm);
})();
