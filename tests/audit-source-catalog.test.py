"""Offline extraction and inventory regression tests."""
import importlib.util
from pathlib import Path
import sys
import json
import hashlib
import tempfile
import gzip
import unittest
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('catalog',Path(__file__).resolve().parents[1]/'scripts/audit-source-catalog.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class CatalogTests(unittest.TestCase):
    def test_prose_chapters_do_not_include_abstracts_or_notes(self):
        data={'title':'古文觀止','abstract':['介绍'], 'content':[{'title':'卷一','content':[{'chapter':'篇名','author':'甲','source':'左傳','paragraphs':['正文'], 'notes':['注释']}]}]}
        row=list(m.extract_json(data,'蒙学/guwenguanzhi.json'))[0]
        self.assertEqual(row['hierarchy'],['古文觀止','卷一','篇名'])
        self.assertEqual(row['text'],'正文');self.assertEqual(row['source'],'左傳')
        self.assertEqual(row['index'],'$.content[0].content[0]')

    def test_group_poems_keep_subchapters_and_author(self):
        data={'title':'合集','author':'编者','content':[{'chapter':'组诗','author':'诗人','paragraphs':[{'subchapter':'其一','paragraphs':['一']},{'subchapter':'其二','paragraphs':['二']}]}]}
        rs=list(m.extract_json(data,'蒙学/qianjiashi.json'))
        self.assertEqual([r['author'] for r in rs],['诗人','诗人'])
        self.assertEqual(rs[1]['hierarchy'],['合集','组诗','其二'])
        self.assertEqual(rs[1]['text'],'二')

    def test_editor_not_inherited_as_poet(self):
        r=list(m.extract_json({'title':'合集','author':'编者','content':[{'chapter':'诗','paragraphs':['正文']}]},'蒙学/qianjiashi.json'))[0]
        self.assertEqual(r['author'],'')

    def test_untitled_aphorism_is_not_empty_body(self):
        r=list(m.extract_json([{'content':'正文','comment':['评语']}],'幽梦影/youmengying.json'))[0]
        self.assertEqual(r['title'],'');self.assertEqual(r['text'],'正文')

    def test_auxiliary_files_excluded_and_transition_labels_kept(self):
        self.assertIsNone(m.classify('chinese-poetry/chinese-poetry','全唐诗/error/poet.song.0.json')[0])
        self.assertIsNone(m.classify('chinese-poetry/chinese-poetry','五代诗词/nantang/authors.json')[0])
        self.assertEqual(m.classify('Werneror/Poetry','宋末元初.csv')[0],'Werneror/宋末元初')

    def test_volume_and_shijing_sections_are_preserved(self):
        r=list(m.extract_json({'title':'题','volume':'卷一','paragraphs':['正文']},'御定全唐詩/json/001.json'))[0]
        self.assertEqual(r['hierarchy'],['卷一','题'])
        r=list(m.extract_json({'title':'关雎','chapter':'国风','section':'周南','content':['正文']},'诗经/shijing.json'))[0]
        self.assertEqual(r['hierarchy'],['国风','周南','关雎'])

    def test_full_audit_verifies_snapshots_and_preserves_counts(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'Werneror').mkdir()
            data='题目,朝代,作者,内容\n甲,秦,乙,测试正文\n甲,秦,乙,测试正文\n'.encode()
            (root/'Werneror/秦.csv').write_bytes(data)
            sha=hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()
            entry=dict(path='秦.csv',type='blob',size=len(data),sha=sha)
            (root/'werner-tree.json').write_text(json.dumps(dict(sha='fixed',truncated=False,tree=[entry])))
            (root/'tree.json').write_text(json.dumps(dict(sha='fixed',truncated=False,tree=[])))
            source=dict(repo='Werneror/Poetry',path='秦.csv',sha256=hashlib.sha256(data).hexdigest())
            (root/'catalog-sources.json').write_text(json.dumps([source]))
            m.run(root,root/'output')
            report=json.loads((root/'output/source-catalog-audit.json').read_text())
            self.assertEqual(report['collections']['Werneror/秦']['records'],2)
            self.assertEqual(report['collections']['Werneror/秦']['exact_duplicate_extra'],1)
            details=json.loads(gzip.decompress((root/'output/source-catalog-details.json.gz').read_bytes()))
            self.assertEqual(len(details['collections']['Werneror/秦']['body_duplicate_groups'][0]),2)
            (root/'Werneror/秦.csv').write_bytes(data+b'changed')
            with self.assertRaises(ValueError):m.run(root,root/'bad-output')

    def test_unknown_schema_fails_instead_of_silent_skip(self):
        with self.assertRaises(ValueError):list(m.extract_json({'unknown':['正文']},'unknown.json'))

if __name__=='__main__':unittest.main()
