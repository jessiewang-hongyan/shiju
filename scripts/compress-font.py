"""Convert the complete Kangxi font to WOFF2 without subsetting.
Requires: pip install 'fonttools[woff]'
"""
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
source = root / 'dist/fonts/kangxi.ttf'
target = source.with_suffix('.woff2')
font = TTFont(source)
font.flavor = 'woff2'
font.save(target)
result = TTFont(target)
original = TTFont(source)
assert original.getBestCmap() == result.getBestCmap()
assert original.getGlyphOrder() == result.getGlyphOrder()
assert original['hmtx'].metrics == result['hmtx'].metrics
for name in original.getGlyphOrder():
    assert original['glyf'][name].compile(original['glyf']) == result['glyf'][name].compile(result['glyf']), name
print(f'{source.stat().st_size:,} → {target.stat().st_size:,} bytes')
print(f'{len(result.getBestCmap()):,} characters; all glyph outlines and metrics match')
