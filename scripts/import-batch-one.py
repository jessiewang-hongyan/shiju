"""Import audited batch one from a fixed local snapshot; no network or inferred text.
Usage: python3 scripts/import-batch-one.py SNAPSHOT
Then run python3 scripts/split-collections.py.
"""
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-source-catalog.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
root=Path(sys.argv[1]);repo=Path(__file__).resolve().parents[1]
manifest=json.loads((repo/'docs/source-catalog-inventory.json').read_text())
books=[('guwen','古文观止','蒙学/guwenguanzhi.json'),('youmengying','幽梦影','幽梦影/youmengying.json'),('shenglv','声律启蒙','蒙学/shenglvqimeng.json'),('nantang','南唐二主词','五代诗词/nantang/poetrys.json')]
for key,book,path in books:
 source=next(s for s in manifest if s['repo']=='chinese-poetry/chinese-poetry' and s['path']==path)
 raw=(root/'chinese-poetry'/path).read_bytes()
 assert hashlib.sha256(raw).hexdigest()==source['sha256'],path
 result=[]
 for i,row in enumerate(audit.rows(root/'chinese-poetry'/path,path),1):
  assert row['text'].strip(),(path,i)
  hierarchy=row['hierarchy'][:-1] if row['title'] else []
  if hierarchy and hierarchy[0] in ['古文觀止','聲律啓蒙']:hierarchy=hierarchy[1:]
  text=row['text'];removed=[]
  # Reviewed against all 34 parenthetical spans in this fixed Guwen snapshot.
  # Keep the uncertain glyph description (魚卷); do not blanket-strip brackets.
  if key=='guwen':
   def separate_note(match):
    note=match.group()
    if '一作' in note or re.search(r'\s通[：\s]',note) or note in ['()','（地名）','（選自《左傳》）','(bēi)']:
     removed.append(dict(start=match.start(),end=match.end(),text=note))
     return ''
    return note
   text=re.sub(r'[（(][^（）()]*[）)]',separate_note,text)
  label=row['title'] or f'第 {i} 则' 
  collection=' · '.join([book,*hierarchy,*([label] if not row['title'] else [])])
  result.append(dict(title=row['title'],label=label,author=row['author'],text=text,collection=collection,
   sourceWork=row['source'],notice='含缺文或待核对标记，按原文保留。' if any(c in row['text']+row['title']+row['author'] for c in '□〓�') else '',
   provenance=dict(repo=source['repo'],commit=source['commit'],path=path,pointer=row['index'],sha256=source['sha256'],separatedNotes=removed)))
 (repo/'dist/data'/f'{key}.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
 print(key,len(result))
