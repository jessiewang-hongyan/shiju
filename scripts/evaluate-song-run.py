"""Run each cold-query measurement in a fresh Node process, three repeats.
Usage: python3 scripts/evaluate-song-run.py DATA OUTPUT_JSON
Run from the repository root. No browser/network timing is implied.
"""
import json,subprocess,sys,platform,time
from pathlib import Path
root,out=sys.argv[1:];results=[]
scenarios=[(field,q,'song') for field in ['title-author','full'] for q in ['苏轼','陆游','春','水调歌头','明月','山 水','不存在xyz']]
scenarios += [('title','水调歌头','song'),('author','苏轼','song'),('title-author','苏轼','all'),('full','明月','all')]
for field,q,scope in scenarios:
 for repeat in range(3):
  raw=subprocess.check_output(['node','--expose-gc','scripts/evaluate-song-search.mjs',root,field,q,scope],text=True)
  row=json.loads(raw);row['repeat']=repeat+1;results.append(row)
  Path(out).write_text(json.dumps(dict(node=subprocess.check_output(['node','--version'],text=True).strip(),platform=platform.platform(),results=results),ensure_ascii=False,indent=2)+'\n')
  print(field,q,scope,repeat+1,round(row['searchMs'],1),row['results'],flush=True)
