/* PDF-only gesture controller. No API, storage writes or account operations. */
(function(){
'use strict';
window.KKAttachReaderGestures=function(api){
 const stage=api.stage,container=api.container,pointers=new Set();
 let gesture=null,session=null,serial=0,suppressUntil=0,settling=false;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function snapshot(cv){const box=container.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),c=document.createElement('canvas');c.width=Math.round(box.width*d);c.height=Math.round(box.height*d);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);const w=parseFloat(cv.style.width)||box.width,h=parseFloat(cv.style.height)||box.height;ctx.drawImage(cv,(box.width-w)*d/2,(box.height-h)*d/2,w*d,h*d);return c;}
 function cleanup(){if(session){session.renderer?.destroy();session.layer.remove();session=null;}container.classList.remove('curl-active');api.busy(false);}
 function draw(progress){if(!session)return;session.progress=Math.max(0,Math.min(1,progress));if(session.renderer)session.renderer.draw(session.direction>0?session.progress:1-session.progress);else{session.front.style.transform='translateX('+(session.direction>0?-session.progress*100:(1-session.progress)*-100)+'%)';session.front.style.opacity=String(1-session.progress*.15);}}
 async function prepare(g){const id=++serial;api.busy(true);try{
   const target=await api.preview(g.target);if(!gesture||gesture!==g||id!==serial)return;
   const current=api.current();if(!current){api.busy(false);return;}
   const front=snapshot(g.direction>0?current:target),back=snapshot(g.direction>0?target:current),box=container.getBoundingClientRect();
   const layer=document.createElement('div');layer.className='reader-curl-layer';back.className='reader-curl-base';layer.appendChild(back);
   const surface=document.createElement('canvas');surface.width=front.width;surface.height=front.height;surface.className='reader-curl-surface';layer.appendChild(surface);
   let renderer=null;try{if(!reduced()&&window.KKCreatePDFCurl)renderer=window.KKCreatePDFCurl(surface,front,box.width,box.height,g.direction);}catch(e){renderer=null;}
   if(!renderer){surface.replaceWith(front);front.className='reader-curl-surface';}
   layer.dataset.backend=renderer?'webgl':'slide';container.appendChild(layer);container.classList.add('curl-active');session={layer,renderer,front,direction:g.direction,progress:0};draw(g.progress);
 }catch(e){api.busy(false);g.previewFailed=true;}}
 async function finish(commit){if(!gesture)return;const g=gesture;gesture=null;serial++;settling=true;suppressUntil=performance.now()+650;
  if(session){const from=session.progress,to=commit?1:0,duration=reduced()?0:220,start=performance.now();await new Promise(resolve=>{function frame(now){const t=duration?Math.min(1,(now-start)/duration):1;draw(from+(to-from)*(1-Math.pow(1-t,3)));if(t<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});}
  try{if(commit)await api.commit(g.target);}finally{cleanup();settling=false;api.activity();}
 }
 stage.addEventListener('pointerdown',e=>{
  pointers.add(e.pointerId);api.activity();
  if(pointers.size>1){if(gesture)finish(false);return;}
  const state=api.state();if(settling||!state.ready||state.zoom>1.01||e.button!==0)return;
  gesture={id:e.pointerId,x:e.clientX,y:e.clientY,startPage:state.page,target:0,direction:0,progress:0,dragged:false};
 });
 stage.addEventListener('pointermove',e=>{
  const g=gesture;if(!g||e.pointerId!==g.id||pointers.size!==1||settling)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y,w=Math.max(1,container.clientWidth);
  if(!g.dragged){if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.2)return;g.direction=dx<0?1:-1;g.target=g.startPage+g.direction;const s=api.state();if(g.target<1||g.target>s.pages){gesture=null;return;}g.dragged=true;try{stage.setPointerCapture(e.pointerId);}catch(err){}prepare(g);}
  g.progress=Math.max(0,Math.min(1,-dx*g.direction/(w*.9)));draw(g.progress);e.preventDefault();
 },{passive:false});
 stage.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);const g=gesture;if(!g||g.id!==e.pointerId)return;if(!g.dragged){gesture=null;return;}finish(g.progress>=.24);});
 function cancel(e){pointers.delete(e.pointerId);if(gesture&&gesture.id===e.pointerId)finish(false);}
 stage.addEventListener('pointercancel',cancel);stage.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))cancel(e);});
 // Block the synthetic click after a swipe, including a swipe returned to its origin.
 stage.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 window.addEventListener('resize',()=>{if(gesture)finish(false);});
 return {cancel:()=>{if(gesture)finish(false);},active:()=>!!gesture||settling};
};
})();
