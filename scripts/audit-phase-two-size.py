"""Measure immutable release resources. No release assets are modified."""
from pathlib import Path
import base64, collections, gzip, json
root=Path("release-artifacts/migration-final-site")
inv=json.loads(Path("release-artifacts/migration-final-inventory.json").read_text())
counts=collections.Counter(); byte_delta=files=0
for item in inv["files"]:
    path=item["path"]; counts["/".join(path.split("/")[:2]) if path.startswith("static-data/") else path.split("/")[0]]+=item["bytes"]
    if not path.startswith(("static-data/6232011b885ca65c14fd/","static-data/cd604eda")):continue
    with (root/path).open('rb') as f:
        if not f.read(50).startswith(b'{"encoding":"gzip-base64-v1"'):continue
        f.seek(0); value=json.load(f)
    raw=base64.b64decode(value['data'],validate=True)
    if gzip.decompress(raw) is None: raise ValueError(path)
    byte_delta+=item["bytes"]-len(raw);files+=1
print(json.dumps(dict(baselineBytes=inv['bytes'],groups=counts,binaryGzipEligibleFiles=files,binaryGzipGrossSaving=byte_delta),indent=2))
