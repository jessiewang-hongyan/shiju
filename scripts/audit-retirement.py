"""Build local-only retirement candidate and an exact standalone production rollback."""
from contextlib import ExitStack
from pathlib import Path
import gzip, hashlib, io, json, tarfile
A=Path('release-artifacts')
D=Path('docs/evidence/phase-two-retirement');D.mkdir(exist_ok=True,parents=True)
old=A/'migration-final-site'
src=A/'phase-two-72f42ed38a93ae68.tar.gz'
full=json.loads((A/'migration-final-inventory.json').read_text())
policy=json.loads((A/'migration-data-candidate/compatibility-policy.json').read_text())
inv=(A/'migration-data-candidate'/policy['inventory']).read_bytes()
assert hashlib.sha256(inv).hexdigest()==policy['inventorySha256']
drop={f['path']:f for f in json.loads(inv)['files'] if f['path'].startswith('static-data/')}
baseline={f['path']:f for f in full['files']}
out={k:A/(k+'-retirement-local.tar.gz') for k in ['candidate','rollback']}
metrics={k:{'files':0,'bytes':0} for k in out}
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as r:
  for b in iter(lambda:r.read(1048576),b''):h.update(b)
 return h.hexdigest()
def put(t,m,b,k):
 n=tarfile.TarInfo(m);n.size=len(b);n.mode=0o644;t.addfile(n,io.BytesIO(b));metrics[k]['files']+=1;metrics[k]['bytes']+=len(b)
assert sha(src)==json.loads(src.with_suffix('.json').read_text())['sha256']
seen=set();removed=set()
with ExitStack() as stack:
 archives={}
 for k,p in out.items():
  f=stack.enter_context(p.open('xb'));z=stack.enter_context(gzip.GzipFile(filename='',mode='wb',fileobj=f,mtime=0,compresslevel=3));archives[k]=stack.enter_context(tarfile.open(mode='w|',fileobj=z))
 with tarfile.open(src,'r|gz') as t:
  for m in t:
   name=m.name;b=t.extractfile(m).read()
   if name in baseline:
    orig=(old/name).read_bytes() if name in ['index.html','release.json'] else b
    assert hashlib.sha256(orig).hexdigest()==baseline[name]['sha256'],name
    put(archives['rollback'],name,orig,'rollback');seen.add(name)
   if name in drop:
    assert drop[name]['sha256']==baseline[name]['sha256'];removed.add(name);continue
   if name=='release.json':
    meta=json.loads(b);meta.update(compatibilityMode='local-retirement-audit',retainedRuntime=full['version']);meta.pop('compatibilityPolicySHA256',None);b=(json.dumps(meta,indent=2)+'\n').encode()
   put(archives['candidate'],name,b,'candidate')
assert removed==set(drop) and seen==set(baseline)
for k,p in out.items():
 metrics[k].update(archive=str(p),compressed=p.stat().st_size,sha256=sha(p))
(D/'rollback-only.txt').write_text('\n'.join(sorted(removed))+'\n')
(D/'main-retained.txt').write_text('\n'.join(sorted(set(baseline)-removed-{'index.html','release.json'}))+'\n')
metrics.update(removedBytes=sum(f['bytes'] for f in drop.values()),removedFiles=len(drop),previousCandidate=950307430)
(D/'sizes.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
