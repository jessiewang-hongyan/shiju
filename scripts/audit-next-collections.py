"""Read-only audit: python3 scripts/audit-next-collections.py SNAPSHOT_DIR OUTPUT_JSON.
Snapshot layout and fixed upstream versions are recorded in docs/next-collections.md.
No imports or changes to dist/data are performed. Paragraph notes are never imported.
"""
import csv
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

root, output = map(Path, sys.argv[1:])
repo = Path(__file__).resolve().parents[1]
sources = json.loads((root / 'sources.json').read_text())
for src in sources:
    file = root / src['repo'].split('/')[0] / src['path']
    assert hashlib.sha256(file.read_bytes()).hexdigest() == src['sha256'], file

def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFC', text) if not c.isspace() and not unicodedata.category(c).startswith('P'))

def ref(row):
    return {k: row[k] for k in ['file', 'index', 'title', 'author']}

sets = {}
for name in ['南北朝', '隋']:
    path = root / 'Werneror' / (name + '.csv')
    sets[name] = [dict(title=r['题目'], author=r['作者'], text=r['内容'], dynasty=r['朝代'], file=path.name, index=i) for i,r in enumerate(csv.DictReader(path.open(encoding='utf-8-sig')),1)]
for name, pattern in [('花间集','huajianji/*-juan.json'), ('南唐二主词','nantang/poetrys.json')]:
    rows = []
    for path in sorted((root/'chinese-poetry/五代诗词').glob(pattern)):
        data=json.loads(path.read_text())
        assert isinstance(data,list), path
        for i,r in enumerate(data,1):
            rows.append(dict(title=r.get('title',r.get('rhythmic','')),author=r.get('author',''),text='\n'.join(r['paragraphs']),file=str(path.relative_to(root/'chinese-poetry')),index=i))
    sets[name]=rows
existing=defaultdict(list)
existing_files=[]
for path in (repo/'dist/data').glob('*.json'):
    data=json.loads(path.read_text())
    existing_files.append({'file':str(path.relative_to(repo)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    if not isinstance(data,list): continue
    for r in data:
        if isinstance(r,dict) and r.get('text'):
            existing[norm(r['text'])].append(dict(file=path.name,title=r.get('title'),author=r.get('author')))
report={'method':{'normalization':'NFC; strip whitespace and Unicode punctuation; no simplified/traditional conversion; body-only matches are review candidates, not automatic deletions','markers':'ASCII ?, U+FFFD, □, 〓 in title, author, body; flags require review','existing_scope':'dist/data/*.json full collections; excludes built-in selections in modules/poems.js'},'sources':sources,'existing_files':existing_files,'collections':{}}
allrows=defaultdict(list)
for name,rows in sets.items():
    exact=defaultdict(list); body=defaultdict(list); flags=[]; overlaps=[]
    for r in rows:
        exact[(r['title'],r['author'],r['text'])].append(ref(r))
        body[norm(r['text'])].append(ref(r))
        allrows[norm(r['text'])].append({'collection':name,**ref(r)})
        fields={k:{c:r[k].count(c) for c in '?�□〓' if c in r[k]} for k in ['title','author','text']}
        fields={k:v for k,v in fields.items() if v}
        missing=[k for k in ['title','author','text'] if not r[k].strip()]
        if fields or missing: flags.append({**ref(r),'markers':fields,'empty_fields':missing})
        if norm(r['text']) in existing: overlaps.append({'candidate':ref(r),'existing':existing[norm(r['text'])]})
    report['collections'][name]={'rows':len(rows),'authors':len(set(r['author'] for r in rows)),'exact_duplicate_extra':sum(len(v)-1 for v in exact.values()),'exact_duplicate_groups':[v for v in exact.values() if len(v)>1],'normalized_body_duplicate_extra':sum(len(v)-1 for v in body.values()),'normalized_body_duplicate_groups':[v for v in body.values() if len(v)>1],'flagged_rows':len(flags),'flags':flags,'existing_overlap_rows':len(overlaps),'existing_overlaps':overlaps,'dynasties':dict(Counter(r.get('dynasty','未提供') for r in rows)),'max_body_length':max(map(lambda r:len(r['text']),rows),default=0)}
report['cross_collection_body_groups']=[v for v in allrows.values() if len(set(r['collection'] for r in v))>1]
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for name,r in report['collections'].items(): print(name,{k:r[k] for k in ['rows','authors','exact_duplicate_extra','normalized_body_duplicate_extra','flagged_rows','existing_overlap_rows','max_body_length']})
print('Cross-collection body groups:',len(report['cross_collection_body_groups']))
