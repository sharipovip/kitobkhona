"""Check the canonical database and its book references without third-party libraries."""
import json,hashlib
from pathlib import Path
p=Path(__file__).resolve().parent.parent/'data/question-bank.js'
raw=p.read_text(); prefix='window.DOV_QUESTION_BANK='; assert raw.startswith(prefix) and raw.rstrip().endswith(';'); d=json.loads(raw[len(prefix):].rstrip()[:-1]); assert d['schemaVersion']==1
questions=d['questions'];seen=set();content_answers={}
for key,q in questions.items():
 assert q.get('prompt') and len(q.get('options',[]))==4 and all(q['options']),key
 assert isinstance(q.get('answer'),int) and q['answer'] in range(4),key
 assert q.get('answerOrigin') in ('ai','official-auto','official-checked','independent-checked'),key
 ident={k:q.get(k) for k in ['prompt','options','answer','context']}
 fingerprint='q'+hashlib.sha256(json.dumps(ident,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]
 content=json.dumps({k:q.get(k) for k in ['prompt','options','context']},ensure_ascii=False,sort_keys=True)
 assert content not in content_answers or content_answers[content]==q['answer'],('conflicting answers',key)
 content_answers[content]=q['answer']
 assert fingerprint==key and fingerprint not in seen,key
 seen.add(fingerprint)
referenced=set();count=0
for book,refs in d['books'].items():
 bookset=set()
 for r in refs:
  assert r['id'] in questions,(book,r['id'])
  assert r['id'] not in bookset,(book,r['id'])
  assert isinstance(r.get('number'),int),(book,r)
  bookset.add(r['id']);referenced.add(r['id']);count+=1
assert referenced==set(questions),'unreferenced question'
print(f'База исправна: {len(questions)} уникальных вопросов; {count} ссылок из {len(d["books"])} книг.')
