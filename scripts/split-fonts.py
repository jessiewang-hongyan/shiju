"""Build complete, frequency-ordered WOFF2 shards for on-demand mobile loading.
Requires fonttools[woff]. Every original cmap code point is retained.
"""
from pathlib import Path
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
import json, argparse, io
from fontTools.ttLib import TTFont
from fontTools import subset
import brotli
_compress=brotli.compress
def fast_compress(data, **kwargs):
    kwargs["quality"]=5
    return _compress(data, **kwargs)
brotli.compress=fast_compress
ROOT=Path(__file__).resolve().parents[1]
SOURCES={'kangxi':'kangxi.ttf','huiwen':'huiwen.woff2','bakudai':'bakudai.woff2','chenyu':'chenyu.ttf'}
def build(key):
    src=ROOT/'dist/fonts'/SOURCES[key]
    font=TTFont(src); cmap=font.getBestCmap(); counts=Counter()
    font.flavor=None; buffer=io.BytesIO();font.save(buffer);sfnt=buffer.getvalue()
    for path in (ROOT/'dist/data').glob('*.json'): counts.update(path.read_text())
    codes=sorted(cmap,key=lambda c:(-counts[chr(c)],c)); out=ROOT/'dist/fonts'/key;out.mkdir(exist_ok=True)
    manifest=[];seen=set()
    for index,start in enumerate(range(0,len(codes),256)):
        chars=codes[start:start+256]; part=TTFont(io.BytesIO(sfnt));options=subset.Options();options.flavor='woff2';options.layout_features=['*'];options.recalc_bounds=True
        worker=subset.Subsetter(options=options);worker.populate(unicodes=chars);worker.subset(part);part.flavor='woff2'
        if key in ('bakudai','chenyu'):
            # OFL reserves Bakudai: name the modified subset family separately.
            names={1:'Shiju Brush',3:'ShijuBrush-Regular',4:'Shiju Brush Regular',6:'ShijuBrush-Regular',16:'Shiju Brush',17:'Regular'}
            if key=='chenyu':names={1:'Shiju Thin Hand',3:'ShijuThinHand-Regular',4:'Shiju Thin Hand Regular',6:'ShijuThinHand-Regular',16:'Shiju Thin Hand',17:'Regular'}
            for record in part['name'].names:
                if record.nameID in names:record.string=names[record.nameID].encode(record.getEncoding())
        name=f'{index:03}.woff2';part.save(out/name)
        check=TTFont(out/name);assert set(check.getBestCmap())==set(chars);seen.update(check.getBestCmap())
        manifest.append({'file':key+'/'+name,'codes':chars,'bytes':(out/name).stat().st_size})
    assert seen==set(cmap)
    (out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
    print(key,len(manifest),'shards;',len(seen),'codepoints; largest',max(x['bytes'] for x in manifest),flush=True)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('fonts',nargs='*');args=parser.parse_args()
    if any(key not in SOURCES for key in args.fonts):parser.error('Unknown font')
    with ProcessPoolExecutor(max_workers=2) as pool:list(pool.map(build,args.fonts or list(SOURCES)))
