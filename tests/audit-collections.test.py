"""Small offline regression for the audit rules; run with python3 tests/audit-collections.test.py."""
import importlib.util
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('collection_audit', Path(__file__).resolve().parents[1] / 'scripts/audit-next-collections.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditRules(unittest.TestCase):
    def test_changed_snapshot_is_rejected_before_audit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'Werneror').mkdir()
            (root / 'Werneror/test.csv').write_text('changed')
            (root / 'sources.json').write_text(json.dumps([dict(repo='Werneror/Poetry', path='test.csv', bytes=7, sha256='invalid')]))
            with self.assertRaises(AssertionError):
                audit.audit(root)

    def test_body_normalization_retains_script_differences(self):
        self.assertEqual(audit.body_key('明月，松間照。\n'), audit.body_key('明月松間照'))
        self.assertNotEqual(audit.body_key('间'), audit.body_key('間'))

    def test_csv_handles_quoted_newlines_and_numbered_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'Werneror').mkdir()
            (root / 'Werneror/宋_1.csv').write_text('题目,朝代,作者,内容\n题,宋,甲,"明月\n松间照"\n')
            (root / 'Werneror/宋_2.csv').write_text('题目,朝代,作者,内容\n另题,宋,乙,清泉\n')
            # Cross-dynasty files must not be included by the 宋 selector.
            (root / 'Werneror/宋末元初.csv').write_text('invalid')
            rows = list(audit.read_rows(root, '宋'))
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]['text'], '明月\n松间照')
            self.assertEqual(rows[1]['file'], '宋_2.csv')
            self.assertEqual(rows[1]['index'], 1)

    def test_body_duplicates_and_cross_collection_groups_keep_references(self):
        db = sqlite3.connect(':memory:')
        db.execute('CREATE TABLE records(id INTEGER PRIMARY KEY, collection TEXT, body TEXT, exact TEXT, reference TEXT)')
        for name, title, text in [('宋', '甲题', '明月'), ('宋', '乙题', '明月'), ('金', '丙题', '明月'), ('元', '丁题', '清泉')]:
            ref = json.dumps(dict(file=name + '.csv', index=1, title=title, author='作者'))
            db.execute('INSERT INTO records(collection,body,exact,reference) VALUES(?,?,?,?)', (name, audit.body_key(text), title, ref))
        self.assertEqual(len(audit.groups(db, 'body', '宋')[0]), 2)
        self.assertEqual(audit.groups(db, 'exact', '宋'), [])
        cross = audit.groups(db, 'body')
        self.assertEqual(len(cross), 1)
        self.assertEqual([r['collection'] for r in cross[0]], ['宋', '宋', '金'])
        db.close()


if __name__ == '__main__':
    unittest.main()
