/* Зеркашии тест ба PDF / Word — кор мекунад бе интернет (китобхонаҳо дар assets/vendor) */
(function(){
  const base=(document.body.dataset.base||'./');
  const L='АВСD',BLUE=[27,95,214],MODES={plain:'бе_ҷавоб',marked:'бо_ҷавоб',key:'бо_калид'};
  const loaded={};
  function load(src){return loaded[src]||(loaded[src]=new Promise((ok,bad)=>{const s=document.createElement('script');s.src=base+src;s.onload=ok;s.onerror=()=>bad(new Error('Файл бор нашуд: '+src));document.head.appendChild(s)}))}
  const lib=f=>f==='pdf'?Promise.all([load('assets/vendor/jspdf.umd.min.js'),load('assets/js/export-fonts.js')]):load('assets/vendor/docx.umd.js');

  function makePDF(set,mode){
    const {jsPDF}=window.jspdf,F=window.DOV_FONTS,d=new jsPDF({unit:'mm',format:'a4'});
    d.addFileToVFS('r.ttf',F.r);d.addFont('r.ttf','DJ','normal');d.addFileToVFS('b.ttf',F.b);d.addFont('b.ttf','DJ','bold');d.addFileToVFS('bi.ttf',F.bi);d.addFont('bi.ttf','DJ','bolditalic');
    const W=210,M=18,TW=W-2*M;let y=M;const need=h=>{if(y+h>297-M){d.addPage();y=M}};
    d.setFont('DJ','bold');d.setFontSize(15);d.setTextColor(20);d.splitTextToSize(set.title,TW).forEach(l=>{d.text(l,W/2,y+4,{align:'center'});y+=7});
    d.setFont('DJ','normal');d.setFontSize(10.5);d.setTextColor(100);d.splitTextToSize(set.subtitle||'',TW).forEach(line=>{d.text(line,W/2,y+3,{align:'center'});y+=5});y+=5;
    set.questions.forEach((q,n)=>{
      if(q.subjectName&&(n===0||set.questions[n-1].subjectName!==q.subjectName)){need(12);d.setFont('DJ','bold');d.setFontSize(11);d.setTextColor(...BLUE);d.text(q.subjectName,M,y+4);y+=9}
      const opts=q.options||[];if(q.context){d.setFont('DJ','normal');d.setFontSize(9);d.setTextColor(70);for(const line of d.splitTextToSize(q.context,TW)){need(5);d.text(line,M,y+3);y+=4.5}y+=3}d.setFont('DJ','bold');d.setFontSize(11);
      const qTag=mode!=='plain'?(q.answerOrigin==='ai'?' [ИИ: санҷед]':!Number.isInteger(q.answer)?' [Ҷавоб нест]':q.answerOrigin==='official-auto'?' [Худкор: санҷед]':''):'';
      const ql=d.splitTextToSize((q.number||n+1)+'.  '+q.prompt+qTag,TW);need(ql.length*5.4+opts.length*7+6);
      d.setTextColor(20);d.text(ql,M,y+4);y+=ql.length*5.4+2;
      opts.forEach((t,k)=>{
        const ok=mode==='marked'&&k===q.answer,ol=d.splitTextToSize(L[k]+')   '+t,TW-16),h=Math.max(7,ol.length*5.2+1.8);need(h);
        if(ok){d.setFillColor(234,241,255);d.roundedRect(M+4,y-.5,TW-4,h,1.5,1.5,'F');d.setFont('DJ','bolditalic');d.setFontSize(12.5);d.setTextColor(...BLUE);d.text(ol,M+7,y+4.6);
          d.setDrawColor(...BLUE);d.setLineWidth(.7);const cx=M+TW-6;d.line(cx-2,y+3.4,cx-.6,y+5);d.line(cx-.6,y+5,cx+2.4,y+1.4)}
        else{d.setFont('DJ','normal');d.setFontSize(11);d.setTextColor(30);d.text(ol,M+7,y+4.6)}
        y+=h;
      });y+=4;
    });
    if(mode==='key'){d.addPage();y=M;d.setFont('DJ','bold');d.setFontSize(15);d.setTextColor(...BLUE);d.text('КАЛИД (ҷавобҳо)',W/2,y+4,{align:'center'});y+=14;d.setFontSize(13);
      set.questions.forEach((q,n)=>{if(q.subjectName&&(n===0||set.questions[n-1].subjectName!==q.subjectName)){need(14);d.setTextColor(...BLUE);d.setFont('DJ','bold');d.setFontSize(11);d.text(q.subjectName,M,y);y+=8;d.setFontSize(13)}if(y>275){d.addPage();y=M}d.setTextColor(20);d.setFont('DJ','normal');d.text((q.number||n+1)+'.',M+30,y);d.setFont('DJ','bold');d.setTextColor(...BLUE);d.text((L[q.answer]||'?')+(q.answerOrigin==='ai'?'  ИИ: санҷед':q.answerOrigin==='official-auto'?'  Худкор: санҷед':''),M+48,y);y+=9})}
    return d.output('blob');
  }

  function makeDOCX(set,mode){
    const D=window.docx,F='Times New Roman',C='1B5FD6',P=[];
    P.push(new D.Paragraph({alignment:D.AlignmentType.CENTER,spacing:{after:80},children:[new D.TextRun({text:set.title,bold:true,size:32,font:F})]}));
    P.push(new D.Paragraph({alignment:D.AlignmentType.CENTER,spacing:{after:240},children:[new D.TextRun({text:set.subtitle||'',size:22,color:'666666',font:F})]}));
    set.questions.forEach((q,n)=>{
      if(q.subjectName&&(n===0||set.questions[n-1].subjectName!==q.subjectName))P.push(new D.Paragraph({spacing:{before:180,after:80},children:[new D.TextRun({text:q.subjectName,bold:true,size:24,color:C,font:F})]}));
      if(q.context)P.push(new D.Paragraph({spacing:{before:120,after:120},children:[new D.TextRun({text:q.context,size:21,font:F})]}));
      P.push(new D.Paragraph({keepNext:true,spacing:{before:180,after:80},children:[new D.TextRun({text:(q.number||n+1)+'.  '+q.prompt+(mode!=='plain'?(q.answerOrigin==='ai'?' [ИИ: санҷед]':!Number.isInteger(q.answer)?' [Ҷавоб нест]':q.answerOrigin==='official-auto'?' [Худкор: санҷед]':''):''),bold:true,size:24,font:F})]}));
      (q.options||[]).forEach((t,k,a)=>{
        const ok=mode==='marked'&&k===q.answer,o={keepNext:k<a.length-1,keepLines:true,indent:{left:360},spacing:{after:40},tabStops:[{type:D.TabStopType.RIGHT,position:9638}]};
        if(ok){o.shading={type:D.ShadingType.CLEAR,fill:'EAF1FF',color:'auto'};o.children=[new D.TextRun({text:L[k]+')   '+t,bold:true,italics:true,size:27,color:C,font:F}),new D.TextRun({text:'\t✓',bold:true,size:27,color:C,font:'Segoe UI Symbol'})]}
        else o.children=[new D.TextRun({text:L[k]+')   '+t,size:24,font:F})];
        P.push(new D.Paragraph(o));
      });
    });
    if(mode==='key'){P.push(new D.Paragraph({pageBreakBefore:true,alignment:D.AlignmentType.CENTER,spacing:{after:240},children:[new D.TextRun({text:'КАЛИД (ҷавобҳо)',bold:true,size:32,color:C,font:F})]}));
      set.questions.forEach((q,n)=>{if(q.subjectName&&(n===0||set.questions[n-1].subjectName!==q.subjectName))P.push(new D.Paragraph({spacing:{before:180,after:80},children:[new D.TextRun({text:q.subjectName,bold:true,size:24,color:C,font:F})]}));P.push(new D.Paragraph({alignment:D.AlignmentType.CENTER,spacing:{after:100},children:[new D.TextRun({text:(q.number||n+1)+'.   ',size:28,font:F}),new D.TextRun({text:(L[q.answer]||'?')+(q.answerOrigin==='ai'?'  ИИ: санҷед':q.answerOrigin==='official-auto'?'  Худкор: санҷед':''),bold:true,size:28,color:C,font:F})]}))})}
    return D.Packer.toBlob(new D.Document({sections:[{properties:{page:{margin:{top:1134,bottom:1134,left:1134,right:1134}}},children:P}]}));
  }

  function save(blob,name){const letters={'а':'a','б':'b','в':'v','г':'g','ғ':'gh','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','ӣ':'i','й':'y','к':'k','қ':'q','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ӯ':'u','ф':'f','х':'h','ҳ':'h','ц':'ts','ч':'ch','ҷ':'j','ш':'sh','щ':'sh','ъ':'','ь':'','ы':'y','э':'e','ю':'yu','я':'ya'};name=name.toLowerCase().replace(/[а-яёғӣқӯҳҷ]/g,c=>letters[c]||'').replace(/[^a-z0-9._-]+/g,'_');const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)}

  /* v14: пешрафти зеркашӣ — ҳамон тавре ки китобҳо дар хонанда (reader) бор мешаванд:
     нуқтаҳои кор + камони пешрафт + матни фоиз. */
  function dlProgress(pct,text,done){
    try{
      let box=document.getElementById('dovDlProgress');
      if(!box){
        box=document.createElement('div');box.id='dovDlProgress';
        box.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;width:min(340px,86vw);padding:12px 16px;border-radius:14px;background:#132a23;color:#eaf4ee;font:13px/1.45 system-ui,sans-serif;border:1px solid #2b4a3e;box-shadow:0 8px 24px rgba(0,0,0,.45);opacity:0;transition:opacity .25s';
        box.innerHTML='<div id="dovDlText" style="margin-bottom:8px"></div><div style="height:7px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden"><div id="dovDlBar" style="height:100%;width:0;border-radius:99px;background:#3e8f68;transition:width .25s"></div></div>';
        document.body.appendChild(box);
      }
      box.style.borderColor=done?'#3e8f68':'#2b4a3e';
      box.querySelector('#dovDlText').textContent=text||'';
      box.querySelector('#dovDlBar').style.width=Math.max(0,Math.min(100,pct||0))+'%';
      box.style.opacity='1';
      clearTimeout(box._h);
      if(done)box._h=setTimeout(()=>{box.style.opacity='0'},done===2?2500:3500);
    }catch(e){}
  }

  async function exportWithProgress(set,m,f,st){
    try{
      dlProgress(8,'Боркунии китобхонаҳо…');if(st)st('Тайёр шуда истодааст…');
      await lib(f);
      dlProgress(45,'Тайёр кардани файл…');if(st)st('Тайёр кардани файл…');
      const blob=f==='pdf'?makePDF(set,m):await makeDOCX(set,m);
      dlProgress(85,'Нигоҳдории файл…');
      save(blob,(set.file||'Тест')+'_'+MODES[m]+'.'+f);
      dlProgress(100,'✓ Файл зеркашӣ шуд',1);
      return true;
    }catch(e){
      dlProgress(0,'Хато: '+(e&&e.message||e),2);
      throw e;
    }
  }
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function open(set){
    const qs=(set.questions||[]).filter(q=>q&&q.prompt&&Array.isArray(q.options)&&q.options.length);
    if(!qs.length){alert('Саволи дастрас нест.');return}
    set={...set,questions:qs};
    const el=document.createElement('div');el.className='dx-back';
    const row=(m,t,s)=>`<div class="dx-row"><div class="t"><b>${t}</b><small>${s}</small></div><button class="btn btn-dl" data-m="${m}" data-f="pdf">PDF</button><button class="btn btn-outline" data-m="${m}" data-f="docx">Word</button></div>`;
    el.innerHTML=`<section class="dx" role="dialog" aria-modal="true"><div class="eyebrow">⬇ Зеркашӣ / Скачать</div><h2>${esc(set.title)}</h2><p>${esc(set.subtitle||'')} · ${qs.length} савол</p>${row('plain','Тест бе ҷавоб','Простой тест — для учеников')}${row('marked','Бо ҷавоби дуруст','Верный ответ выделен синим ✓')}${row('key','Тест + калид','Простой тест и страница с ключом')}<div class="dx-st" id="dxSt" role="status"></div><div class="dx-foot"><button class="btn btn-outline" id="dxClose">Пӯшидан</button></div></section>`;
    document.body.appendChild(el);
    const st=s=>el.querySelector('#dxSt').textContent=s,close=()=>{el.remove();document.removeEventListener('keydown',esc_)},esc_=e=>{if(e.key==='Escape')close()};
    document.addEventListener('keydown',esc_);el.addEventListener('click',e=>{if(e.target===el)close()});el.querySelector('#dxClose').onclick=close;
    el.querySelectorAll('[data-m]').forEach(b=>b.onclick=async()=>{
      const m=b.dataset.m,f=b.dataset.f;b.disabled=true;st('Тайёр шуда истодааст…');
      try{await exportWithProgress(set,m,f,st);
        st('Тайёр ✓ — файл дар ҷузвдони «Загрузки» захира шуд.')}
      catch(e){st('Хато: '+(e&&e.message||e))}
      b.disabled=false;
    });
  }
  async function run(set,m,f){await exportWithProgress(set,m,f,null)}
  window.DovExport={open,run};
})();
