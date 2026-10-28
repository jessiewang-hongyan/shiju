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
    buckets = [{} for _ in range(128)]
    offsets, cursor = [], 0
    for row in rows:
        offsets.append(cursor)
        text = ' '.join(str(row.get(k)) for k in FIELDS if row.get(k)).lower()
        # JavaScript substring positions are UTF-16 code units, including astral glyphs.
        raw = text.encode('utf-16-le', errors='surrogatepass')
        units = [raw[i] + 256 * raw[i+1] for i in range(0, len(raw), 2)]
        for position, unit in enumerate(units):
            buckets[unit % 128].setdefault(str(unit), []).append(cursor + position)
        cursor += len(units) + 1  # gap prevents matching across records
    manifest = {
        'version': 2, 'count': len(rows), 'offsets': [v - (offsets[i-1] if i else 0) for i,v in enumerate(offsets)],
        'parts': json.loads((ROOT / 'parts' / source.stem / 'manifest.json').read_text()),
        'buckets': [write(folder, {k: [v - (values[i-1] if i else 0) for i,v in enumerate(values)] for k,values in bucket.items()}) for bucket in buckets],
    }
    (folder / 'manifest-v2.json').write_text(json.dumps(manifest,separators=(',', ':')))
    print(source.stem, len(rows))

    # Independent title/author index; no body, source notes or full-text offsets.
    metadata_folder = folder / 'metadata'
    metadata_folder.mkdir(parents=True, exist_ok=True)
    metadata_buckets = [{} for _ in range(128)]
    metadata_offsets, title_lengths, cursor = [], [], 0
    for row in rows:
        title = (row.get('title') or row.get('label') or '').lower()
        author = (row.get('author') or '').lower()
        metadata_offsets.append(cursor)
        title_lengths.append(len(title.encode('utf-16-le')) // 2)
        raw = (title + ' ' + author).encode('utf-16-le', errors='surrogatepass')
        for i in range(0, len(raw), 2):
            unit = raw[i] + 256 * raw[i+1]
            metadata_buckets[unit % 128].setdefault(str(unit), []).append(cursor + i//2)
        cursor += len(raw)//2 + 1
    metadata_manifest = {
        'version': 2, 'count': len(rows),
        'offsets': [v - (metadata_offsets[i-1] if i else 0) for i,v in enumerate(metadata_offsets)],
        'titleLengths': title_lengths, 'parts': manifest['parts'],
        'buckets': [write(metadata_folder, {k: [v - (values[i-1] if i else 0) for i,v in enumerate(values)] for k,values in bucket.items()}) for bucket in metadata_buckets],
    }
    (metadata_folder / 'manifest-v2.json').write_text(json.dumps(metadata_manifest,separators=(',', ':')))
