"""Isolated 5B Song sizing. Usage: python3 scripts/evaluate-song-build.py SNAPSHOT OUT
Does not change dist or publish. Uses the production index builder unchanged except ROOT.
"""
import csv, hashlib, json, re, sys, gzip, time
from pathlib import Path
repo=Path(__file__).resolve().parents[1]
root=Path(sys.argv[1]);out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
assert out != (repo/'dist/data').resolve()
inventory=json.loads((repo/'docs/source-catalog-inventory.json').read_text())
sources=[s for s in inventory if s.get('group')=='Werneror/宋']
rows=[];excluded=[];start=time.monotonic()
for source in sources:
 path=root/'Werneror'/source['path']
 assert hashlib.sha256(path.read_bytes()).hexdigest()==source['sha256']
 with path.open(encoding='utf-8-sig',newline='') as f:
  for i,r in enumerate(csv.DictReader(f),1):
   if not r['内容'].strip():
    excluded.append([source['path'],i]);continue
   text=re.sub(r'([。！？])',r'\1\n',r['内容'])
   if r['内容'].endswith(('。','！','？')):text=text[:-1]
   rows.append(dict(title=r['题目'],author=r['作者'],text=text,collection='宋',notice='含缺文或待核对标记，按原文保留。' if any(c in ''.join(r.values()) for c in '□■〓�') else '',provenance=dict(repo=source['repo'],commit=source['commit'],path=source['path'],pointer=i,sha256=source['sha256'],dynasty=r['朝代'])))
def compact(x):return json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()
(out/'song-era.json').write_bytes(compact(rows))
folder=out/'parts/song-era';folder.mkdir(parents=True,exist_ok=True)
manifest=[];batch=[];size=2
for r in rows:
 data=compact(r)
 if batch and size+len(data)+1>200000:
  blob=compact(batch);name=hashlib.sha256(blob).hexdigest()[:16]+'.json';(folder/name).write_bytes(blob);manifest.append(dict(file=name,count=len(batch)));batch=[];size=2
 batch.append(r);size+=len(data)+1
if batch:
 blob=compact(batch);name=hashlib.sha256(blob).hexdigest()[:16]+'.json';(folder/name).write_bytes(blob);manifest.append(dict(file=name,count=len(batch)))
(folder/'manifest.json').write_bytes(compact(manifest))
del rows,batch
code=(repo/'scripts/build-search-index.py').read_text().replace("ROOT = Path(__file__).resolve().parents[1] / 'dist/data'",f'ROOT = Path({str(out)!r})')
exec(compile(code,'build-search-index.py','exec'),{'__file__':str(repo/'scripts/build-search-index.py')})
def sizes(paths):
 paths=list(paths);raw=[p.stat().st_size for p in paths];gz=[len(gzip.compress(p.read_bytes(),mtime=0)) for p in paths]
 return dict(files=len(paths),bytes=sum(raw),gzipBytes=sum(gz),maxBytes=max(raw,default=0),maxGzipBytes=max(gz,default=0))
report=dict(sources=sources,records=sum(p['count'] for p in manifest),excludedEmpty=excluded,buildSeconds=time.monotonic()-start,
 source=sizes([out/'song-era.json']),parts=sizes(folder.glob('*.json')),full=sizes((out/'search/song-era').glob('*.json')),metadata=sizes((out/'search/song-era/metadata').glob('*.json')),
 currentDeployBytes=sum(p.stat().st_size for p in (repo/'dist').rglob('*') if p.is_file()))
(out/'size-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
