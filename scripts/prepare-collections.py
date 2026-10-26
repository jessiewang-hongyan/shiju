"""Normalize downloaded, public-domain poetry; keep originals and licenses unchanged.
Input cache: /tmp/shiju-{shijing,chuci,yuanqu}.json and /tmp/shiju-werner-{汉,魏晋,唐}.csv.
"""
import csv,json,re,shutil
from pathlib import Path
out=Path('dist/data')
def save(name,rows):
 seen=set();unique=[]
 for r in rows:
  key=(r['title'],r['author'],r['text'])
  if key not in seen and r['text'].strip():seen.add(key);unique.append(r)
 (out/(name+'.json')).write_text(json.dumps(unique,ensure_ascii=False,separators=(',',':')))
 print(name,len(unique))
 return unique
def data(name):return json.loads(Path('/tmp/shiju-'+name+'.json').read_text())
def lines(s):return re.sub(r'([。！？])',r'\1\n',s).strip()
save('shijing',[dict(title=r['title'],author='佚名',text='\n'.join(r['content']),collection='诗经 · '+r['chapter']+' · '+r['section']) for r in data('shijing')])
save('chuci',[dict(title=r['title'],author=r.get('author','佚名'),text='\n'.join(r['content']),collection='楚辞 · '+r.get('section','')) for r in data('chuci')])
save('yuan',[dict(title=r['title'],author='元 · '+r['author'],text='\n'.join(r['paragraphs']),collection='元曲') for r in data('yuanqu')])
def readcsv(era):return list(csv.DictReader(Path('/tmp/shiju-werner-'+era+'.csv').open(encoding='utf-8-sig')))
def row(r,era,col):return dict(title=r['题目'],author=era+' · '+r['作者'],text=lines(r['内容']),collection=col)
han=readcsv('汉');wei=readcsv('魏晋')
save('han-yuefu',[row(r,'汉','汉乐府') for r in han if r['作者']=='两汉乐府'])
save('han',[row(r,'汉','汉诗') for r in han if r['作者']!='两汉乐府']+[row(r,'汉','古诗十九首') for r in wei if r['题目'].startswith('古诗十九首')])
save('weijin',[row(r,'魏晋','魏晋诗') for r in wei if not r['题目'].startswith('古诗十九首')])
save('tang',[row(r,'唐','唐诗') for r in readcsv('唐')])
shutil.copyfile('/tmp/shiju-werner-LICENSE',out/'LICENSE-Werneror.txt')
