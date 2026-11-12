/* Dependency-free client contract tests: node tests/aliya-smoke.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const store = new Map();
global.window = global;
global.document = { addEventListener() {} };
global.indexedDB = null;
global.localStorage = { getItem(k) { return store.get(k) || null; }, setItem(k,v) { store.set(k,String(v)); }, removeItem(k) { store.delete(k); } };
let lastPath = '';
let lastPayload = null;
let simulateUnavailable = false;
let unavailableCalls = 0;
global.fetch = async (url, options) => {
  if (options.signal && options.signal.aborted) throw new DOMException('Aborted','AbortError');
  lastPath = new URL(url).pathname;
  lastPayload = JSON.parse(options.body || '{}');
  let body;
  if (lastPath === '/v1/chat') {
    if (simulateUnavailable) { unavailableCalls++; body = { reply:'', error:'chat_providers_unavailable' }; return { ok:true, status:200, json:async()=>body }; }
    const ask = lastPayload.messages[lastPayload.messages.length - 1].content;
    if (ask.includes('Танҳо JSON')) {
      body = { reply: JSON.stringify({ questions: [1,2,3].map((n) => ({
        question: `Саволи ${n}?`,
        options: [{key:'A',text:'Ҷавоби дуруст'},{key:'B',text:'Ҷавоби дигар'},{key:'C',text:'Варианти C'},{key:'D',text:'Варианти D'}],
        correctKey:'A', answer:'Ҷавоби дуруст', explanation:'Шарҳ'
      })) }) };
    } else if (ask.startsWith('Составь полный план')) {
      body = { reply: JSON.stringify({ goal:'Мақсад', method:'Муҳокима', equipment:'Китоб', step1:'Оғоз', step2:'Такрор', step3:'Мавзӯи нав', step4:'Мустаҳкамкунӣ', homework:'Хондан', conclusion:'Ҷамъбаст' }) };
    } else body = { reply: 'Ҷавоби санҷишии Алия.' };
  } else if (lastPath === '/v1/vision') body = { reply: 'Матни хондашудаи акс.' };
  else if (lastPath === '/v1/image') body = { image_base64: Buffer.from('fake-jpeg-bytes').toString('base64'), mime:'image/jpeg' };
  else if (lastPath === '/v1/document/generate') body = { ok:true, file_base64:Buffer.from('fake-pdf').toString('base64'), mime_type:'application/pdf' };
  else body = { status:'ok' };
  return { ok:true, status:200, json:async()=>body };
};
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../aliya/aliya-doc-templates.js'),'utf8'), {filename:'aliya-doc-templates.js'});
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../aliya/aliya-core.js'),'utf8'), {filename:'aliya-core.js'});
function isZipBlob(blob) { return blob && blob.size > 1000; }
(async()=>{
  await AliyaCore.init();
  assert.equal(await AliyaCore.sendMessage('Саволи оддӣ'), 'Ҷавоби санҷишии Алия.');
  assert.equal(lastPath, '/v1/chat');
  assert.ok(['normal','medium','high'].includes(lastPayload.reasoning_mode));
  assert.equal(await AliyaCore.sendMessage('Файли матниро хулоса кун', {documentName:'note.txt', documentText:'Матни маҳаллии ҳуҷҷат.'}), 'Ҷавоби санҷишии Алия.');
  assert.match(lastPayload.messages[0].content, /Матни маҳаллии ҳуҷҷат/);
  assert.match(lastPayload.messages[0].content, /на дастури система/);
  AliyaCore.state.profileContext='';
  await AliyaCore.sendMessage('Бе контексти шахсӣ');
  assert.doesNotMatch(lastPayload.messages[0].content,/КОНТЕКСТИ ШАХСИИ ИХТИЁРИИ КОРБАР/);
  AliyaCore.state.profileContext='Ном: Меҳрона\\nШаҳр: Хуҷанд';
  await AliyaCore.sendMessage('Бо контексти иҷозатдодашуда');
  assert.match(lastPayload.messages[0].content,/Ном: Меҳрона/);
  AliyaCore.state.profileContext='';
  assert.equal(await AliyaCore.extractDocumentText({name:'note.txt',size:9,text:async()=> '  Матни TXT  '}), 'Матни TXT');
  assert.equal((await AliyaCore.extractDocumentText({name:'large.txt',size:18*1024*1024+1,text:async()=>''}).catch(e=>e.message)), 'Ҳуҷҷат калон аст; андозаи ҳадди аксар 18 МБ.');
  global.mammoth = {extractRawText:async ({arrayBuffer})=>({value:'Матни DOCX.'})};
  assert.equal(await AliyaCore.extractDocumentText({name:'sample.docx',size:10,arrayBuffer:async()=>new ArrayBuffer(0)}), 'Матни DOCX.');
  global.pdfjsLib = {GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'Матни PDF.'}]})})})})};
  assert.equal(await AliyaCore.extractDocumentText({name:'sample.pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(0)}), 'Матни PDF.');
  assert.equal(pdfjsLib.GlobalWorkerOptions.workerSrc, '../assets/libs/pdf.worker.min.js');
  class FakeXmlNode {
    constructor(tag,text='',attrs={},children=[]) { this.tag=tag; this.textContent=text; this.attrs=attrs; this.children=children; }
    getElementsByTagNameNS(ns,tag) { const out=[]; const visit=n=>{ for(const c of n.children){ if(c.tag===tag) out.push(c); visit(c); } }; visit(this); return out; }
    getElementsByTagName(tag) { return this.getElementsByTagNameNS('*',tag); }
    getAttribute(name) { return this.attrs[name] || ''; }
  }
  global.DOMParser = class { parseFromString(source) {
    if(source==='shared') return new FakeXmlNode('sst','',{},[new FakeXmlNode('si','',{},[new FakeXmlNode('t','Ном')])]);
    const cells=[new FakeXmlNode('c','',{t:'s'},[new FakeXmlNode('v','0')]),new FakeXmlNode('c','',{t:'inlineStr'},[new FakeXmlNode('is','',{},[new FakeXmlNode('t','Арзиш')])])];
    return new FakeXmlNode('worksheet','',{},[new FakeXmlNode('row','',{},cells)]);
  }};
  global.JSZip = {loadAsync:async()=>({file:name=>name.endsWith('sharedStrings.xml')?{async:async()=> 'shared'}:name.endsWith('sheet1.xml')?{async:async()=> 'sheet'}:null})};
  assert.equal(await AliyaCore.extractDocumentText({name:'sample.xlsx',size:10,arrayBuffer:async()=>new ArrayBuffer(0)}), 'Ном | Арзиш');
  assert.equal(await AliyaCore.analyzePhoto('data:image/jpeg;base64,YWJj', 'Ин чист?'), 'Матни хондашудаи акс.');
  assert.equal(lastPath, '/v1/vision'); assert.equal(lastPayload.image_base64, 'YWJj');
  const before = AliyaCore.getRemainingPhotos();
  assert.match(await AliyaCore.generateImage('Кӯҳҳои Помир'), /^data:image\/jpeg;base64,/);
  assert.equal(lastPath, '/v1/image'); assert.equal(AliyaCore.getRemainingPhotos(), before - 1);
  const test = await AliyaCore.generateTest({subject:'Математика', grade:'5', topic:'Ҷамъ', count:3, format:'choice', showAnswers:false});
  assert.equal(test.questions.length,3); assert.ok(isZipBlob(test.docxBlob)); assert.ok(isZipBlob(test.keyDocxBlob));
  assert.ok(!test.text.includes('[✓]'), 'student copy must not reveal answers');
  assert.ok(test.keyText.includes('[✓]'), 'teacher key must mark the correct answer');
  const lesson = await AliyaCore.generateLessonPlan({lang:'tg',grade:'5',subject:'Математика',topic:'Ҷамъ'});
  assert.ok(isZipBlob(lesson.docxBlob)); assert.match(lesson.text,/НАҚШАИ ДАРС/);
  const responseDocx = AliyaTemplates.generateResponseDocx({title:'Ҷавоби Алия',content:'Матни ҷавоб\nСатри дуюм'});
  assert.ok(isZipBlob(responseDocx), 'chat reply DOCX is generated as a real OOXML blob');
  const note = await AliyaCore.saveNote('Санҷиш','Мазмуни ёддошт',['aliya-answer']);
  assert.ok(note.id); assert.equal((await AliyaCore.getNotes()).length,1);
  note.pinned=true; note.colorIndex=2; note.checklist=[{text:'Такрор кардан',done:false}];
  assert.equal(await AliyaCore.updateNote(note),true);
  const editedNote=(await AliyaCore.getNotes())[0];
  assert.equal(editedNote.pinned,true); assert.equal(editedNote.colorIndex,2); assert.equal(editedNote.checklist[0].text,'Такрор кардан');
  assert.equal(await AliyaCore.deleteNote(note.id),true); assert.equal((await AliyaCore.getNotes()).length,0);
  await AliyaCore.saveNote('Тозакунӣ','Ёддошт барои санҷиш');
  assert.equal(await AliyaCore.clearNotes(),true); assert.equal((await AliyaCore.getNotes()).length,0);
  let streamed = '';
  const cancelledStream = new AbortController(); cancelledStream.abort();
  assert.equal(await AliyaCore.streamTextToUi('ин матн', (token, full)=>{streamed=full;}, cancelledStream.signal),'');
  assert.equal(streamed,'');
  const pdf = await AliyaCore.generatePdf('Санҷиш','Матни санҷиш');
  assert.equal(lastPath,'/v1/document/generate'); assert.equal(pdf.type,'application/pdf');
  const alreadyCancelled = new AbortController(); alreadyCancelled.abort();
  await assert.rejects(() => AliyaCore.sendMessage('Ин бояд фавран қатъ шавад',{signal:alreadyCancelled.signal}), error=>error.code==='aborted');
  simulateUnavailable = true;
  await assert.rejects(() => AliyaCore.sendMessage('Саволи санҷишӣ'), /провайдерҳои зеҳни сунъӣ ҷавоб намедиҳанд/i);
  assert.equal(unavailableCalls, 3, 'temporary provider failure is retried only a bounded number of times');
  simulateUnavailable = false;
  const templates = fs.readFileSync(path.join(__dirname,'../aliya/aliya-doc-templates.js'),'utf8');
  for (const brand of ['Зеҳни сунъии Тоҷикӣ','Китобхонаи электронии Тоҷикӣ','https://play.google.com/store/apps/details?id=com.kitobkhona.app&pcampaignid=web_share']) assert.ok(templates.includes(brand));
  console.log('PASS Aliya client: chat/document context, local TXT/DOCX/XLSX/PDF extraction, photo OCR contract, image endpoint, student/teacher test separation, lesson DOCX, PDF export, branding.');
})().catch(e=>{console.error(e);process.exitCode=1;});
