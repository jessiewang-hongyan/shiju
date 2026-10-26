import json, subprocess, urllib.parse, concurrent.futures
from pathlib import Path
base='https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master/'
def get(path):
 return subprocess.run(['curl','-fsSL','--retry','2','--max-time','25',base+urllib.parse.quote(path)],check=True,capture_output=True).stdout.decode()
def batch(i):
 rows=json.loads(get(f'宋词/ci.song.{i}.json'))
 return [{'title':r['rhythmic'],'author':'宋 · '+r['author'],'text':'\n'.join(r['paragraphs']),'collection':'宋词'} for r in rows if r.get('rhythmic') and r.get('author') and r.get('paragraphs')]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 rows=[r for part in pool.map(batch,range(0,22000,1000)) for r in part]
seen=set();unique=[]
for r in rows:
 key=(r['title'],r['author'],r['text'])
 if key not in seen:unique.append(r);seen.add(key)
Path('dist/data/song-ci.json').write_text(json.dumps(unique,ensure_ascii=False,separators=(',',':')))
Path('dist/data/LICENSE-poetry.txt').write_text(get('LICENSE'))
print('Imported',len(unique),'poems;',Path('dist/data/song-ci.json').stat().st_size,'bytes')
