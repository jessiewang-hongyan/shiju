"""Audit fixed local snapshots without modifying the website.
Usage: python3 scripts/audit-next-collections.py SNAPSHOT_DIR OUTPUT_JSON [--extended]
See docs/next-collections.md for snapshot layout and normalization limitations.
"""
import argparse
import csv
import hashlib
import json
import sqlite3
import tempfile
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def body_key(text):
    normalized = ''.join(
        c for c in unicodedata.normalize('NFC', text)
        if not c.isspace() and not unicodedata.category(c).startswith('P')
    )
    return digest(normalized.encode())


def reference(row):
    return {key: row[key] for key in ('file', 'index', 'title', 'author')}


def read_rows(root, name):
    if name in ('花间集', '南唐二主词'):
        pattern = 'huajianji/*-juan.json' if name == '花间集' else 'nantang/poetrys.json'
        for path in sorted((root / 'chinese-poetry/五代诗词').glob(pattern)):
            rows = json.loads(path.read_text())
            assert isinstance(rows, list), path
            for index, row in enumerate(rows, 1):
                yield dict(title=row.get('title', row.get('rhythmic', '')),
                           author=row.get('author', ''), text='\n'.join(row['paragraphs']),
                           file=str(path.relative_to(root / 'chinese-poetry')), index=index,
                           dynasty='未提供')
    else:
        paths = sorted((root / 'Werneror').glob(name + '_*.csv'))
        if not paths:
            paths = [root / 'Werneror' / (name + '.csv')]
        for path in paths:
            with path.open(encoding='utf-8-sig', newline='') as stream:
                reader = csv.DictReader(stream)
                assert reader.fieldnames == ['题目', '朝代', '作者', '内容'], path
                for index, row in enumerate(reader, 1):
                    assert None not in row and all(v is not None for v in row.values()), (path, index)
                    yield dict(title=row['题目'], author=row['作者'], text=row['内容'],
                               dynasty=row['朝代'], file=path.name, index=index)


def groups(db, field, collection=None):
    # field is an internal constant, never external SQL input.
    assert field in ('body', 'exact')
    if collection is None:
        keys = db.execute('SELECT body FROM records GROUP BY body HAVING COUNT(DISTINCT collection)>1')
    else:
        keys = db.execute(f'SELECT {field} FROM records WHERE collection=? GROUP BY {field} HAVING COUNT(*)>1', (collection,))
    result = []
    for (key,) in keys:
        query = f'SELECT collection, reference FROM records WHERE {field}=?'
        args = [key]
        if collection is not None:
            query += ' AND collection=?'
            args.append(collection)
        items = []
        for name, ref in db.execute(query + ' ORDER BY id', args):
            entry = json.loads(ref)
            if collection is None:
                entry = {'collection': name, **entry}
            items.append(entry)
        result.append(items)
    return result


def audit(root, extended=False):
    repo = Path(__file__).resolve().parents[1]
    manifest = 'extended-sources.json' if extended else 'sources.json'
    sources = json.loads((root / manifest).read_text())
    for source in sources:
        path = root / source['repo'].split('/')[0] / source['path']
        data = path.read_bytes()
        assert len(data) == source['bytes'] and digest(data) == source['sha256'], path
        if source.get('git_blob'):
            assert hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() == source['git_blob'], path
    existing = defaultdict(list)
    existing_files = []
    for path in sorted((repo / 'dist/data').glob('*.json')):
        data = json.loads(path.read_text())
        existing_files.append({'file': str(path.relative_to(repo)), 'sha256': digest(path.read_bytes())})
        if isinstance(data, list):
            for row in data:
                if isinstance(row, dict) and row.get('text'):
                    existing[body_key(row['text'])].append(dict(file=path.name, title=row.get('title'), author=row.get('author')))
    report = {'method': {
        'normalization': 'NFC; strip whitespace and Unicode punctuation; no simplified/traditional conversion; body-only matches are review candidates, not automatic deletions',
        'markers': 'ASCII ?, U+FFFD, □, 〓 in title, author, body; flags require review',
        'existing_scope': 'dist/data/*.json full collections; excludes built-in selections in modules/poems.js',
        'index': 'SHA-256 body/exact keys in temporary SQLite; no candidate body stored in report'},
        'sources': sources, 'existing_files': existing_files, 'collections': {}}
    names = ['南北朝', '隋', '花间集', '南唐二主词']
    if extended:
        names += ['宋', '金', '元', '明', '清']
    with tempfile.TemporaryDirectory(prefix='shiju-audit-') as directory:
        db = sqlite3.connect(str(Path(directory) / 'audit.sqlite'))
        db.execute('CREATE TABLE records(id INTEGER PRIMARY KEY, collection TEXT, body TEXT, exact TEXT, reference TEXT)')
        for name in names:
            flags, overlaps, authors, dynasties = [], [], set(), Counter()
            count = maximum = 0
            for row in read_rows(root, name):
                count += 1
                ref = reference(row)
                body = body_key(row['text'])
                exact = digest(json.dumps([row[k] for k in ('title', 'author', 'text')], ensure_ascii=False).encode())
                db.execute('INSERT INTO records(collection,body,exact,reference) VALUES(?,?,?,?)', (name, body, exact, json.dumps(ref, ensure_ascii=False)))
                fields = {k: {c: row[k].count(c) for c in '?�□〓' if c in row[k]} for k in ('title', 'author', 'text')}
                fields = {k: v for k, v in fields.items() if v}
                missing = [k for k in ('title', 'author', 'text') if not row[k].strip()]
                if fields or missing:
                    flags.append({**ref, 'markers': fields, 'empty_fields': missing})
                if body in existing:
                    overlaps.append({'candidate': ref, 'existing': existing[body]})
                authors.add(row['author'])
                dynasties[row['dynasty']] += 1
                maximum = max(maximum, len(row['text']))
            assert count, name
            report['collections'][name] = dict(rows=count, authors=len(authors), flagged_rows=len(flags), flags=flags,
                existing_overlap_rows=len(overlaps), existing_overlaps=overlaps, dynasties=dict(dynasties), max_body_length=maximum,
                marker_field_rows=dict(Counter(field for flag in flags for field in flag['markers'])),
                empty_field_rows=sum(bool(flag['empty_fields']) for flag in flags),
                existing_author_difference_rows=sum(any(item.get('author', '').rsplit(' · ', 1)[-1].strip() != overlap['candidate']['author'].strip() for item in overlap['existing']) for overlap in overlaps))
            db.commit()
            print(name, 'parsed', count, 'flagged', len(flags), 'existing overlaps', len(overlaps), flush=True)
        db.execute('CREATE INDEX by_body ON records(body)')
        db.execute('CREATE INDEX by_collection_body ON records(collection,body)')
        db.execute('CREATE INDEX by_exact ON records(exact)')
        db.execute('CREATE INDEX by_collection_exact ON records(collection,exact)')
        for name, result in report['collections'].items():
            for prefix, field in [('exact', 'exact'), ('normalized_body', 'body')]:
                found = groups(db, field, name)
                result[prefix + '_duplicate_extra'] = sum(len(g) - 1 for g in found)
                result[prefix + '_duplicate_groups'] = found
        report['cross_collection_body_groups'] = groups(db, 'body')
        db.close()
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--extended', action='store_true')
    args = parser.parse_args()
    result = audit(args.snapshot, args.extended)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print('Cross-collection body groups:', len(result['cross_collection_body_groups']))
