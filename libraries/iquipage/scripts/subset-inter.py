"""Build assets/fonts/InterVariable.woff2 from the Inter 4.1 release.
Usage: python subset.py <path to Inter-4.1/InterVariable.ttf> <out.woff2>
Keeps axes opsz 14..32 and wght 400..700; glyphs for Latin, Latin-1, Latin Extended-A, Cyrillic, Cyrillic Supplement,
general punctuation, currency, letterlike (№, ™), basic arrows and the comparison operators; all OpenType features."""
import sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
src, out = sys.argv[1], sys.argv[2]
import tempfile
inst = instancer.instantiateVariableFont(TTFont(src), {"wght": (400, 700)}, inplace=False, updateFontNames=False)
tmp = os.path.join(tempfile.mkdtemp(), "inter-400-700.ttf"); inst.save(tmp)
font = TTFont(tmp)
ranges = ['0000-00FF','0100-017F','0400-04FF','0500-052F','2000-203A','2044','20A0-20BF','2116','2117','2122','2190-2199','21B5','2212','2215','2248','2260','2264','2265','221E','2026','2022','25A0-25A1','25CF','2713','2714']
u = []
for r in ranges:
    if '-' in r:
        a, b = r.split('-'); u += range(int(a, 16), int(b, 16) + 1)
    else:
        u.append(int(r, 16))
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = ['*']
opts.notdef_outline = True; opts.glyph_names = False; opts.hinting = False; opts.desubroutinize = True
s = subset.Subsetter(opts); s.populate(unicodes=sorted(set(u))); s.subset(font)
font.flavor = 'woff2'; font.save(out)
g = TTFont(out); cm = g.getBestCmap()
print(out, os.path.getsize(out), 'bytes; glyphs', len(cm), 'cyrillic', sum(1 for c in cm if 0x400 <= c <= 0x4FF), 'axes', [(a.axisTag, a.minValue, a.maxValue) for a in g['fvar'].axes])
