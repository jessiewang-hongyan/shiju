"""Build exact positional substring indexes; rebuild after split-collections.py."""
from pathlib import Path
import json, hashlib
ROOT = Path(__file__).resolve().parents[1] / 'dist/data'
FIELDS = ('title', 'label', 'collection', 'sourceWork', 'author', 'text')
def write(folder, value):
    data = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
    name = hashlib.sha256(data).hexdigest()[:16] + '.json'
    (folder / name).write_bytes(data)
    return name
for source in sorted(ROOT.glob('*.json')):
    rows = json.loads(source.read_text())
    folder = ROOT / 'search' / source.stem
    folder.mkdir(parents=True, exist_ok=True)
    buckets = [{} for _ in range(64)]
    offsets, cursor = [], 0
    for row in rows:
        offsets.append(cursor)
        text = ' '.join(str(row.get(k)) for k in FIELDS if row.get(k)).lower()
        # JavaScript substring positions are UTF-16 code units, including astral glyphs.
        raw = text.encode('utf-16-le', errors='surrogatepass')
        units = [raw[i] + 256 * raw[i+1] for i in range(0, len(raw), 2)]
        for position, unit in enumerate(units):
            buckets[unit % 64].setdefault(str(unit), []).append(cursor + position)
        cursor += len(units) + 1  # gap prevents matching across records
    manifest = {
        'version': 1, 'count': len(rows), 'offsets': offsets,
        'parts': json.loads((ROOT / 'parts' / source.stem / 'manifest.json').read_text()),
        'buckets': [write(folder, bucket) for bucket in buckets],
    }
    (folder / 'manifest.json').write_text(json.dumps(manifest,separators=(',', ':')))
    print(source.stem, len(rows))
