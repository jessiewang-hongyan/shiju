"""Audit both fixed upstream snapshots; never writes website data.
Usage: python3 scripts/audit-source-catalog.py SNAPSHOT OUTPUT_DIR
Requires catalog-sources.json, tree.json and werner-tree.json in SNAPSHOT.
"""
import argparse
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('prior', Path(__file__).with_name('audit-next-collections.py'))
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)

BOOKS = {'daxue':'大学','zhongyong':'中庸','mengzi':'孟子','lunyu':'论语',
 'guwenguanzhi':'古文观止','baijiaxing':'百家姓','dizigui':'弟子规','qianjiashi':'千家诗',
 'qianziwen':'千字文','sanzijing-new':'三字经·新版','sanzijing-traditional':'三字经·传统版',
 'shenglvqimeng':'声律启蒙','tangshisanbaishou':'唐诗三百首·蒙学',
 'wenzimengqiu':'文字蒙求','youxueqionglin':'幼学琼林','zengguangxianwen':'增广贤文','zhuzijiaxun':'朱子家训'}
MODERN = {'清末民国初','清末近现代初','近现代','民国末当代初','近现代末当代初','当代'}

def classify(repo, path):
    """Return an upstream-preserving audit group or an explicit exclusion."""
    p = Path(path); top = p.parts[0]
    if repo.startswith('Werneror'):
        if p.suffix == '.csv': return 'Werneror/' + re.sub(r'_\d+$', '', p.stem), '正文'
        return None, '词牌索引' if path == 'cipai_2.txt' else '许可/说明/程序'
    if p.suffix != '.json': return None, '许可/说明/程序/图片/数据库副本'
    if top in ('rank','strains'): return None, '排名/格律辅助数据'
    if '/error/' in path: return None, '错误记录，不作正文库'
    if p.name.startswith(('authors.','author.')) or p.name in ('authors.json','intro.json','huajianji-0-preface.json','表面结构字.json'):
        return None, '作者/介绍/序言/字形辅助资料'
    if top == '全唐诗':
        if p.name.startswith('poet.song.'): return 'chinese-poetry/宋诗', '正文'
        if p.name.startswith('poet.tang.'): return 'chinese-poetry/唐诗', '正文'
        if p.stem in ('唐诗三百首','唐诗补录'): return 'chinese-poetry/'+p.stem, '选本/补录'
    if top == '宋词': return 'chinese-poetry/'+('宋词三百首' if p.stem == '宋词三百首' else '宋词'), '正文'
    if top == '五代诗词': return 'chinese-poetry/'+('花间集' if 'huajianji' in path else '南唐二主词'), '正文'
    if top in ('蒙学','四书五经','论语'): return 'chinese-poetry/'+BOOKS.get(p.stem,p.stem), '正文'
    if top in ('元曲','幽梦影','御定全唐詩','曹操诗集','楚辞','水墨唐诗','纳兰性德','诗经'): return 'chinese-poetry/'+top, '正文'
    return None, '非文集资料'


def extract_json(data, file):
    """Whitelist body fields. Preserve hierarchy; never traverse notes or biographies."""
    def visit(node, pointer='$', hierarchy=(), inherited_author=''):
        if isinstance(node,list):
            for i,child in enumerate(node): yield from visit(child,f'{pointer}[{i}]',hierarchy,inherited_author)
            return
        if not isinstance(node,dict): raise ValueError((file,pointer,'expected object'))
        title = next((node[k] for k in ('title','chapter','subchapter','rhythmic','type') if isinstance(node.get(k),str) and node[k]), '')
        context = tuple(node[k] for k in ('volume','chapter','section','type') if isinstance(node.get(k),str) and node[k] and node[k] != title)
        hierarchy = hierarchy + context + ((title,) if title else ())
        author = node.get('author',inherited_author)
        if not isinstance(author,str): raise ValueError((file,pointer,'non-string author'))
        body = next((k for k in ('paragraphs','para') if k in node),None)
        if body is None and isinstance(node.get('content'),str): body='content'
        if body is None and isinstance(node.get('content'),list) and all(isinstance(v,str) for v in node['content']): body='content'
        if body:
            values=node[body]; values=[values] if isinstance(values,str) else values
            if isinstance(values,list) and values and all(isinstance(v,dict) for v in values):
                yield from visit(values,pointer+'.'+body,hierarchy,author)
                return
            if not isinstance(values,list) or not all(isinstance(v,str) for v in values): raise ValueError((file,pointer,'invalid body'))
            yield dict(title=title,author=author,text='\n'.join(values),file=file,index=pointer,
                       hierarchy=list(hierarchy),paragraphs=len(values),source=node.get('source',''),
                       metadata_fields=sorted(set(node)-{body,'author','title','chapter','rhythmic','type','content'}))
        elif isinstance(node.get('content'),list):
            # Editors of anthologies are not automatically the author of every work.
            inherited='' if Path(file).stem in ('qianjiashi','guwenguanzhi','tangshisanbaishou') else author
            yield from visit(node['content'],pointer+'.content',hierarchy,inherited)
        else: raise ValueError((file,pointer,'unrecognized body schema'))
    yield from visit(data)


def rows(path, relative):
    if path.suffix == '.csv':
        with path.open(encoding='utf-8-sig',newline='') as f:
            reader=csv.DictReader(f)
            if reader.fieldnames != ['题目','朝代','作者','内容']:raise ValueError(path)
            for i,r in enumerate(reader,1):
                if None in r or any(v is None for v in r.values()):raise ValueError((path,i))
                yield dict(title=r['题目'],author=r['作者'],text=r['内容'],file=relative,index=i,
                           hierarchy=[r['朝代']],paragraphs=len(r['内容'].splitlines()),source='',metadata_fields=[])
    else: yield from extract_json(json.loads(path.read_text()),relative)


def run(root,out):
    sources=json.loads((root/'catalog-sources.json').read_text()); source_map={(s['repo'],s['path']):s for s in sources}
    inventory=[]; grouped=defaultdict(list)
    for tf,repo in [('werner-tree.json','Werneror/Poetry'),('tree.json','chinese-poetry/chinese-poetry')]:
        tree=json.loads((root/tf).read_text())
        if tree.get('truncated'):raise ValueError('Truncated upstream tree')
        for entry in tree['tree']:
            if entry['type']!='blob':continue
            group,kind=classify(repo,entry['path'])
            item=dict(repo=repo,commit=tree['sha'],path=entry['path'],bytes=entry['size'],git_blob=entry['sha'],group=group,kind=kind)
            if group:
                s=source_map[(repo,entry['path'])];p=root/repo.split('/')[0]/entry['path'];b=p.read_bytes()
                if len(b)!=entry['size'] or prior.digest(b)!=s['sha256'] or hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()!=entry['sha']:raise ValueError(p)
                item['sha256']=s['sha256'];grouped[group].append(item)
            elif (repo,entry['path']) in source_map:
                item['sha256']=source_map[(repo,entry['path'])]['sha256']
            inventory.append(item)
    existing=defaultdict(list);existing_files=[]
    for p in sorted((Path(__file__).resolve().parents[1]/'dist/data').glob('*.json')):
        b=p.read_bytes();existing_files.append(dict(file=p.name,sha256=prior.digest(b)))
        data=json.loads(b)
        if isinstance(data,list):
            for r in data:
                if isinstance(r,dict) and r.get('text'):existing[prior.body_key(r['text'])].append({k:r.get(k,'') for k in ('title','author','collection')})
    report=dict(method='NFC + strip whitespace/punctuation; no script conversion; counts are records/sections, not necessarily poems. Missing metadata != damaged body. No legal clearance or scholarly collation.',existing_files=existing_files,collections={})
    details={};out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='shiju-catalog-') as tmp:
        db=sqlite3.connect(str(Path(tmp)/'audit.db'))
        db.execute('CREATE TABLE records(id INTEGER PRIMARY KEY,collection TEXT,body TEXT,exact TEXT,reference TEXT)')
        for group,files in sorted(grouped.items()):
            stats=Counter();flags=[];overlaps=[];excluded=Counter();authors=set();longest=[]
            for f in files:
                p=root/f['repo'].split('/')[0]/f['path']
                f['parsed_records']=0
                for row in rows(p,f['path']):
                    f['parsed_records']+=1
                    stats['records']+=1;authors.add(row['author']);excluded.update(row['metadata_fields'])
                    ref={k:row[k] for k in ('file','index','title','author','hierarchy','source')}
                    text=row['text'];stats['characters']+=len(text);stats['paragraphs']+=row['paragraphs'];stats['max_characters']=max(stats['max_characters'],len(text))
                    for k in ('title','author','text'):
                        stats['missing_'+k]+=not row[k].strip()
                    marks={k:{c:row[k].count(c) for c in '?�□〓' if c in row[k]} for k in ('title','author','text')};marks={k:v for k,v in marks.items() if v}
                    concerns=[]
                    if len(row['author'])>40:
                        concerns.append('long_author_field');stats['long_author_records']+=1
                    if not text.strip():concerns.append('empty_body')
                    if re.search(r'[（(].{1,80}[）)]',text):stats['body_parenthesis_candidates']+=1
                    if len(text)>10000:stats['over_10000_characters']+=1
                    if marks:
                        stats['marker_records']+=1
                        non_question=any(c!='?' for field in marks.values() for c in field)
                        stats['non_question_marker_records']+=non_question
                        stats['question_mark_only_records']+=not non_question
                    if marks or concerns:flags.append(dict(reference=ref,markers=marks,concerns=concerns))
                    if text.strip():
                        body=prior.body_key(text);exact=prior.digest(json.dumps([row[k] for k in ('title','author','text')],ensure_ascii=False).encode())
                        db.execute('INSERT INTO records(collection,body,exact,reference) VALUES(?,?,?,?)',(group,body,exact,json.dumps(ref,ensure_ascii=False)))
                        if body in existing:overlaps.append(dict(candidate=ref,existing=existing[body]))
                    longest.append((len(text),ref));longest=sorted(longest,key=lambda x:x[0],reverse=True)[:3]
            db.commit();stats['files']=len(files);stats['author_strings']=len(authors);stats['existing_overlap_records']=len(overlaps)
            report['collections'][group]={**dict(stats),'metadata_fields_outside_body':dict(excluded),'longest':[dict(characters=n,reference=r) for n,r in longest],'rights_review_required':group.split('/')[-1] in MODERN or group.endswith('三字经·新版')}
            details[group]=dict(flags=flags,existing_overlaps=overlaps)
            print(group,stats['records'],'markers',stats['marker_records'],flush=True)
        for sql in ['CREATE INDEX by_body ON records(body)','CREATE INDEX by_exact ON records(exact)','CREATE INDEX by_collection_body ON records(collection,body)','CREATE INDEX by_collection_exact ON records(collection,exact)']:db.execute(sql)
        for group in grouped:
            for prefix,field in [('exact','exact'),('body','body')]:
                gs=prior.groups(db,field,group);report['collections'][group][prefix+'_duplicate_extra']=sum(len(g)-1 for g in gs);details[group][prefix+'_duplicate_groups']=gs
        cross=prior.groups(db,'body');report['cross_group_body_matches']=len(cross)
        db.close()
    def save(name,value): (out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    save('source-catalog-inventory.json',inventory);save('source-catalog-audit.json',report)
    packed=json.dumps(dict(collections=details,cross_group_body_matches=cross),ensure_ascii=False,separators=(',',':')).encode()
    (out/'source-catalog-details.json.gz').write_bytes(gzip.compress(packed,mtime=0))
    print('Complete',len(grouped),'groups',len(inventory),'files inventoried',len(cross),'cross groups',flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('snapshot',type=Path);ap.add_argument('output',type=Path);args=ap.parse_args();run(args.snapshot,args.output)
