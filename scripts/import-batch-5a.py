"""Import 5A from the audited fixed snapshot. Usage: python3 scripts/import-batch-5a.py SNAPSHOT
Only insert sentence line breaks; preserve every source character and duplicate row.
Then run scripts/split-collections.py to build source shards and BOTH search indexes.
"""
import csv
import hashlib
import json
from pathlib import Path
import re
import sys
from collections import Counter

repo = Path(__file__).resolve().parents[1]
root = Path(sys.argv[1]) / 'Werneror'
inventory = json.loads((repo / 'docs/source-catalog-inventory.json').read_text())
books = [('jin', '金', 2741), ('yuan-era', '元', 37375), ('song-jin', '宋末金初', 234),
         ('jin-yuan', '金末元初', 3019), ('song-yuan', '宋末元初', 12058), ('yuan-ming', '元末明初', 15736)]
report = []
for key, name, count in books:
    path = name + '.csv'
    source = next(s for s in inventory if s['repo'] == 'Werneror/Poetry' and s['path'] == path)
    assert hashlib.sha256((root / path).read_bytes()).hexdigest() == source['sha256'], path
    with (root / path).open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == ['题目', '朝代', '作者', '内容']
        rows = list(reader)
    assert len(rows) == count
    result = []
    parentheses = []
    for i, r in enumerate(rows, 1):
        assert set(r) == {'题目', '朝代', '作者', '内容'} and all(r.values()), (path, i)
        text = re.sub(r'([。！？])', r'\1\n', r['内容'])
        # Do not strip source whitespace; discard only the newline we just inserted at EOF.
        if r['内容'].endswith(('。', '！', '？')):
            text = text[:-1]
        if re.search(r'[（(]', r['内容']):
            parentheses.append({'pointer': i, 'title': r['题目'], 'text': r['内容']})
        result.append(dict(title=r['题目'], author=r['作者'], text=text, collection=name,
            notice='含缺文或待核对标记，按原文保留。' if any(c in ''.join(r.values()) for c in '□■〓�') else '',
            provenance=dict(repo=source['repo'], commit=source['commit'], path=path, pointer=i,
                            sha256=source['sha256'], dynasty=r['朝代'])))
    encoded = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()
    (repo / 'dist/data' / (key + '.json')).write_bytes(encoded)
    frequencies = Counter((r['题目'], r['作者'], r['内容']) for r in rows)
    report.append(dict(key=key, category=name, count=count, source=source,
        outputSha256=hashlib.sha256(encoded).hexdigest(),
        exactDuplicateExtra=sum(n-1 for n in frequencies.values()),
        gapRecords=sum(bool(r['notice']) for r in result), parentheses=parentheses,
        maxTextLength=max(len(r['内容']) for r in rows)))
    print(key, count)
(repo / 'docs/batch-5a-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
