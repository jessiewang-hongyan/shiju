"""Build a standalone phase-two site from the last deployed site's verified inventory."""
import gzip, hashlib, io, json, os, sys, tarfile
from pathlib import Path
baseline = Path(os.environ.get("PHASE_TWO_BASELINE", "release-artifacts/migration-final-site"))
inventory = json.loads(Path(os.environ.get("PHASE_TWO_INVENTORY", "release-artifacts/migration-final-inventory.json")).read_text())
manifest = json.loads((baseline/"release.json").read_text())
assert manifest["runtime"] == inventory["version"] == "7aab5f4c84cde74f"
assert manifest["data"] == json.loads(Path("release-data.json").read_text())
files = {str(p.relative_to("dist/modules")): p.read_bytes() for p in Path("dist/modules").rglob("*.js")}
# Use the immutable, packaged Worker and search config from the deployed release.
files["search/transport.mjs"] = ('export {staticRequest} from "../../'+manifest["modules"]+'/search/transport.mjs";\n').encode()
style=Path("dist/style.css").read_bytes()+b"\n"+Path("dist/phase-two.css").read_bytes()
template=Path("dist/phase-two.html").read_text()
h=hashlib.sha256()
for key,value in sorted({**files,"../index.html":template.encode(),"../style.css":style}.items()):
    h.update(key.encode()+b"\0"+hashlib.sha256(value).digest())
runtime=h.hexdigest()[:16]
folder="modules-"+runtime
html=template.replace('    <link rel="stylesheet" href="phase-two.css" />\n','').replace('style.css?v=20261028batch5a','style-'+runtime+'.css').replace('src="modules/app-v2.js"','src="'+folder+'/app-v2.js"')
assert folder+'/app-v2.js' in html and 'href="phase-two.css"' not in html and 'style-'+runtime+'.css' in html
extra={folder+'/'+k:v for k,v in files.items()}
extra.update({"index.html":html.encode(),"style-"+runtime+".css":style,"release.json":(json.dumps({**manifest,"runtime":runtime,"modules":folder,"editorSchema":2,"previousRuntime":manifest["runtime"]},indent=2)+"\n").encode()})
rc=Path(os.environ.get("PHASE_TWO_ARCHIVE", "release-artifacts/phase-two-"+runtime+".tar.gz"))
if rc.exists():sys.exit('Already built: '+str(rc))
total=count=0
def add(name,data):
    global total,count
    t=tarfile.TarInfo(name);t.size=len(data);t.mode=0o644
    archive.addfile(t,io.BytesIO(data));total+=len(data);count+=1
temp=rc.with_suffix('.partial')
with temp.open('xb') as raw,gzip.GzipFile(filename='',fileobj=raw,mode='wb',compresslevel=3,mtime=0) as gz,tarfile.open(fileobj=gz,mode='w|') as archive:
    for f in inventory["files"]:
        name=f["path"]; data=(baseline/name).read_bytes()
        if len(data)!=f["bytes"] or hashlib.sha256(data).hexdigest()!=f["sha256"]:raise ValueError(name)
        if name not in ("index.html","release.json"):
            if name in extra:raise ValueError("immutable collision: "+name)
            add(name,data)
    for name,data in sorted(extra.items()):add(name,data)
if total>1_000_000_000:raise ValueError("site exceeds release limit")
os.rename(temp,rc)
def file_hash(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()
info=dict(runtime=runtime,baseline=manifest["runtime"],archive=str(rc),files=count,bytes=total,oldFiles=len(inventory["files"]),oldBytes=inventory["bytes"],headroom=1_000_000_000-total,compressed=rc.stat().st_size,sha256=file_hash(rc))
rc.with_suffix('.json').write_text(json.dumps(info,indent=2)+'\n')
print(info)
