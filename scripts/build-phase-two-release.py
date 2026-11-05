"""Build phase two from a fixed production revision; retire only audited older data.
No network, push or deployment. Requires the pinned data checkout supplied by CI.
"""
import argparse, hashlib, io, json, os, subprocess, tarfile, tempfile
from pathlib import Path
BASELINE = "c66b1e1a36d11df111201bac98e227f2c91650c6"
def sha(b): return hashlib.sha256(b).hexdigest()
def run(*cmd, **kw): subprocess.run(cmd, check=True, **kw)
def main():
 p=argparse.ArgumentParser();p.add_argument("--dataset",default=".release-data");p.add_argument("--out",default="_site");p.add_argument("--compare",help="Previously accepted slim archive")
 a=p.parse_args();root=Path.cwd();dataset=Path(a.dataset).resolve();out=Path(a.out).resolve()
 if out.exists(): raise ValueError("Output already exists")
 policy=json.loads((dataset/"compatibility-policy.json").read_text())
 raw=(dataset/policy["inventory"]).read_bytes()
 if sha(raw)!=policy["inventorySha256"]: raise ValueError("Invalid pinned inventory")
 drop={r["path"]:r["sha256"] for r in json.loads(raw)["files"] if r["path"].startswith("static-data/")}
 with tempfile.TemporaryDirectory(prefix="shiju-release-") as tmp:
  tmp=Path(tmp);base=tmp/"baseline";base.mkdir()
  archive=subprocess.check_output(["git","archive",BASELINE])
  with tarfile.open(fileobj=io.BytesIO(archive)) as t:
   for m in t:
    if m.name.startswith("/") or ".." in Path(m.name).parts or not (m.isfile() or m.isdir()):raise ValueError("Unsafe baseline archive")
    t.extract(m,base)
  env={**os.environ,"RELEASE_DATA_DIR":str(dataset),"RELEASE_OUT":str(tmp/"site")}
  run("node","scripts/build-release.mjs",cwd=base,env=env)
  inventory=json.loads((base/"release-artifacts/production-inventory.json").read_text())
  full=tmp/"phase-two.tar.gz"
  run("python3","scripts/package-phase-two-rc.py",env={**os.environ,"PHASE_TWO_BASELINE":str(tmp/"site"),"PHASE_TWO_INVENTORY":str(base/"release-artifacts/production-inventory.json"),"PHASE_TWO_ARCHIVE":str(full)})
  out.mkdir();actual={};removed=set()
  with tarfile.open(full,"r|gz") as t:
   for m in t:
    if not m.isfile() or m.name.startswith("/") or ".." in Path(m.name).parts:raise ValueError("Unsafe archive entry")
    b=t.extractfile(m).read()
    if m.name in drop:
     if sha(b)!=drop[m.name]:raise ValueError("Retired bytes differ")
     removed.add(m.name);continue
    if m.name=="release.json":
     meta=json.loads(b);meta.update(compatibilityMode="refresh-earlier-tabs",retainedRuntime=inventory["version"]);meta.pop("compatibilityPolicySHA256",None)
     b=(json.dumps(meta,indent=2)+"\n").encode()
    dest=out/m.name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b);actual[m.name]=sha(b)
  if removed!=set(drop):raise ValueError("Retirement set mismatch")
  if a.compare:
   expected={}
   with tarfile.open(a.compare,"r|gz") as t:
    for m in t:
     b=t.extractfile(m).read()
     if m.name=="release.json":
      candidate=json.loads(b);candidate["compatibilityMode"]="refresh-earlier-tabs"
      if candidate!=meta:raise ValueError("Release metadata differs")
     else:expected[m.name]=sha(b)
   if expected!={k:v for k,v in actual.items() if k!="release.json"}:raise ValueError("Candidate mismatch")
  result={"baselineCommit":BASELINE,"runtime":meta["runtime"],"files":len(actual),"bytes":sum(p.stat().st_size for p in out.rglob("*") if p.is_file()),"retiredFiles":len(removed),"comparedCandidate":a.compare,"hashes":actual}
  Path("release-artifacts").mkdir(exist_ok=True)
  Path("release-artifacts/phase-two-final-inventory.json").write_text(json.dumps(result,indent=2)+"\n")
  print(json.dumps({k:v for k,v in result.items() if k!="hashes"}))
if __name__=="__main__":main()
