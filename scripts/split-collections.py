"""Split bundled collections into deterministic, content-addressed JSON batches."""
from pathlib import Path
import hashlib
import json
ROOT = Path(__file__).resolve().parents[1] / 'dist/data'
for source in sorted(ROOT.glob('*.json')):
    poems = json.loads(source.read_text())
    folder = ROOT / 'parts' / source.stem
    folder.mkdir(parents=True, exist_ok=True)
    batches, batch, size = [], [], 2
    for poem in poems:
        encoded = json.dumps(poem, ensure_ascii=False, separators=(',', ':')).encode()
        if batch and size + len(encoded) + 1 > 200_000:
            batches.append(batch)
            batch, size = [], 2
        batch.append(poem)
        size += len(encoded) + 1
    if batch:
        batches.append(batch)
    manifest = []
    for batch in batches:
        data = json.dumps(batch, ensure_ascii=False, separators=(',', ':')).encode()
        name = hashlib.sha256(data).hexdigest()[:16] + '.json'
        (folder / name).write_bytes(data)
        manifest.append({'file': name, 'count': len(batch)})
    assert [p for b in batches for p in b] == poems
    (folder / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')))
    print(source.stem, len(poems), 'poems;', len(batches), 'batches')
