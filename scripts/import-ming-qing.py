"""Import the audited Ming/Qing snapshot without changing production data."""
import csv, hashlib, json, re, sys
from pathlib import Path
from collections import Counter
root = Path(sys.argv[1]) / 'Werneror'
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=False)
inventory = json.loads(Path('docs/source-catalog-inventory.json').read_text())
report = []
for key, name, expected in [('ming-era','明',236957),('qing-era','清',90089),('ming-qing','明末清初',17700)]:
    sources = [s for s in inventory if s['repo']=='Werneror/Poetry' and (s['path']==name+'.csv' or re.fullmatch(re.escape(name)+r'_\d+\.csv',s['path']))]
    rows=[]; frequencies=Counter(); missing=Counter()
    for source in sorted(sources,key=lambda s:s['path']):
        p=root/source['path']; assert hashlib.sha256(p.read_bytes()).hexdigest()==source['sha256'],p
        with p.open(encoding='utf-8-sig',newline='') as f:
            reader=csv.DictReader(f); assert reader.fieldnames==['题目','朝代','作者','内容']
            for i,r in enumerate(reader,1):
                assert set(r)=={'题目','朝代','作者','内容'} and all(v is not None for v in r.values())
                for field,value in r.items():
                    if not value: missing[field]+=1
                if not r['内容']: continue
                frequencies[(r['题目'],r['作者'],r['内容'])]+=1
                text=re.sub(r'([。！？])',r'\1\n',r['内容'])
                if r['内容'].endswith(('。','！','？')): text=text[:-1]
                rows.append(dict(title=r['题目'],author=r['作者'],text=text,collection=name,
                    notice='含缺文或待核对标记，按原文保留。' if any(c in ''.join(r.values()) for c in '□■〓�') else '',
                    provenance=dict(repo=source['repo'],commit=source['commit'],path=source['path'],pointer=i,sha256=source['sha256'],dynasty=r['朝代'])))
    assert len(rows)==expected,(key,len(rows))
    raw=json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode(); (out/(key+'.json')).write_bytes(raw)
    report.append(dict(key=key,name=name,count=len(rows),sources=sources,sha256=hashlib.sha256(raw).hexdigest(),missing=dict(missing),exactDuplicateExtra=sum(n-1 for n in frequencies.values()),gapRecords=sum(bool(r['notice']) for r in rows),maxTextLength=max(len(r['text']) for r in rows)))
    print(key,len(rows),flush=True)
(out/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
