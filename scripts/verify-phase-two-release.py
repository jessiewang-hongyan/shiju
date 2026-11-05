"""Verify a built phase-two artifact against its build inventory and resource paths."""
import hashlib,json,re,sys
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else "_site").resolve()
inv=json.loads(Path("release-artifacts/phase-two-final-inventory.json").read_text())
actual={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob("*") if p.is_file()}
assert actual==inv["hashes"],"Artifact differs from build inventory"
lock=json.loads(Path("phase-two-release-lock.json").read_text())
assert hashlib.sha256(json.dumps(actual,sort_keys=True,separators=(",",":")).encode()).hexdigest()==lock["treeSha256"],"Artifact differs from accepted release lock"
assert all(inv[k]==lock[k] for k in ("runtime","baselineCommit","files","bytes","retiredFiles"))
meta=json.loads((root/"release.json").read_text())
assert meta["compatibilityMode"]=="refresh-earlier-tabs"
assert meta["editorSchema"]==2 and meta["runtime"]==inv["runtime"]
assert meta["retainedRuntime"]=="7aab5f4c84cde74f"
assert not (root/"static-data/config-92e9af008a108b43e4b9.json").exists()
assert (root/meta["config"]).is_file()
assert inv["bytes"]<1_000_000_000
imports=0
for name in actual:
 p=root/name
 if p.suffix in (".js",".mjs"):
  for rel in re.findall(r"""(?:from\s*|import\s*\(\s*|import\s*)["'](\.[^"']+)["']""",p.read_text()):
   target=(p.parent/rel.split("?")[0]).resolve()
   assert str(target).startswith(str(root)+"/") and target.is_file(),(name,rel)
   imports+=1
for name in ["wenkai","kangxi","chenyu","bakudai","huiwen"]:
 for part in json.loads((root/"fonts"/name/"manifest.json").read_text()):
  assert (root/"fonts"/part["file"]).is_file(),part["file"]
for key in ["ten-bamboo","lokta","cloud","newsprint","kraft"]:
 assert (root/"assets/papers"/(key+".jpg")).is_file(),key
assert 'src="'+meta["modules"]+'/app-v2.js"' in (root/"index.html").read_text()
print(json.dumps({"pass":True,"files":len(actual),"imports":imports,"bytes":inv["bytes"],"runtime":meta["runtime"]}))
