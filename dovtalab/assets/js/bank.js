/* Единая база загружается как локальный скрипт, без fetch и ограничений file://. */
(function(){
let resolved;
function load(){
 if(resolved)return Promise.resolve(resolved);
 try{
  const db=window.DOV_QUESTION_BANK;
  if(!db||db.schemaVersion!==1||!db.questions||!db.books)throw new Error('Файли data/question-bank.js бор нашуд ё вайрон аст.');
  const result={};
  for(const [book,refs] of Object.entries(db.books)){
   if(!Array.isArray(refs))throw new Error('Рӯйхати саволҳо вайрон аст.');
   result[book]=refs.map(ref=>{
    const q=db.questions[ref.id];
    if(!q)throw new Error('Савол дар база ёфт нашуд: '+ref.id);
    return {...q,number:ref.number};
   });
  }
  resolved=result;
  return Promise.resolve(resolved);
 }catch(error){return Promise.reject(error)}
}
function id(g,c,s){return 'test-'+(window.DOV_BOOK_MAP?.[`${g}-${c}`]?.[s]||'')}
async function questions(g,c,s){const data=await load();return data[id(g,c,s)]||[]}
window.DovBank={load,questions,id};
})();
