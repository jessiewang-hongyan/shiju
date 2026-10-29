"""Verify the compressed artifact contains exactly the inventoried file bytes."""
import hashlib
import json
import os
import tarfile

manifest = json.load(open('prototype/release/package-inventory.json'))
expected = {row['path']: row for row in manifest['inventory']}
seen = set()
archive = 'release-artifacts/shiju-preview-20261029.tar.gz'
with tarfile.open(archive, 'r:gz') as tar:
    for item in tar:
        if item.isdir():
            continue
        assert item.isfile(), item.name
        name = item.name.removeprefix('./')
        assert name in expected and name not in seen, name
        content = tar.extractfile(item).read()
        assert hashlib.sha256(content).hexdigest() == expected[name]['sha256'], name
        seen.add(name)
assert seen == set(expected)
with open(archive, 'rb') as file:
    hasher = hashlib.sha256()
    for chunk in iter(lambda: file.read(1024 * 1024), b''):
        hasher.update(chunk)
    digest = hasher.hexdigest()
with open(archive + '.sha256', 'w') as file:
    file.write(digest + '  ' + os.path.basename(archive) + '\n')
report = dict(passed=True, files=len(seen), archiveBytes=os.path.getsize(archive), sha256=digest)
with open('prototype/release/archive-verification.json', 'w') as file:
    json.dump(report, file, indent=2)
print(report)
