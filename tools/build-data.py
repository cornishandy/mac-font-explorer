"""Build font-data.js from local measurements, researched descriptions, and the taxonomy.

Inputs (all relative to the project root):
  data/metrics.json              CoreText measurements (tools/generate-font-metrics.swift)
  data/wikidata-years-raw.json   Wikidata typeface inception dates
  research/descriptions-*.json   Per-family summary, history, classification, tags, links
  research/taxonomy.json         Category, subtype, and tag descriptions
Output:
  font-data.js                   window.FONT_DATA = {rows, meta}
"""
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rows = json.loads((ROOT / 'data/metrics.json').read_text())['rows']
years_raw = json.loads((ROOT / 'data/wikidata-years-raw.json').read_text())
wikidata_years = {x['label']['value']: (int(x['date']['value'][:4]), x['item']['value'].replace('http:', 'https:')) for x in years_raw}

research = {}
for path in sorted((ROOT / 'research').glob('descriptions-*.json')):
    for entry in json.loads(path.read_text()):
        research[entry['family']] = entry
taxonomy_path = ROOT / 'research/taxonomy.json'
taxonomy = json.loads(taxonomy_path.read_text()) if taxonomy_path.exists() else {'categories': [], 'subtypes': [], 'tags': []}

TAXONOMY = {
    'Serif': ['Old-style', 'Transitional', 'Didone / modern', 'Slab serif', 'Glyphic / incised', 'Contemporary text serif'],
    'Sans serif': ['Grotesque / neo-grotesque', 'Humanist', 'Geometric', 'Industrial / DIN'],
    'Monospace': ['Coding monospace', 'Typewriter'],
    'Script & handwriting': ['Formal / calligraphic', 'Casual handwriting', 'Brush / marker'],
    'Display & decorative': ['Engraved / titling', 'Historical / antique', 'Textured / novelty'],
    'Symbols & pictographs': ['Dingbats / pictographs', 'Math & technical', 'Emoji', 'Braille'],
    'World script': ['Arabic', 'Hebrew', 'Indic', 'Chinese', 'Japanese', 'Korean', 'Southeast Asian',
                     'Tibetan', 'Ethiopic', 'Armenian', 'Other world script'],
}
TAGS = ['Narrow / condensed', 'Wide / extended', 'Handwritten', 'Calligraphic', 'Brush / marker', 'Rounded',
        'Heavy / black', 'Typewriter', 'Caps / small caps', 'Engraved / inline', 'Textured / chalk',
        'Historical / antique', 'Screen / UI', 'Web-safe classic', 'Pan-Unicode / multi-script',
        'Signage / industrial', 'Formal / elegant', 'Playful / casual']


def slug(name):
    """Must match slug() in tools/render-specimens.swift and app.js."""
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def fallback_classify(r):
    """Used only when a family has no researched classification."""
    n = r['family']
    if re.search(r'emoji', n, re.I): return 'Symbols & pictographs', 'Emoji'
    if re.search(r'braille', n, re.I): return 'Symbols & pictographs', 'Braille'
    if re.search(r'stix two math|^symbol$', n, re.I): return 'Symbols & pictographs', 'Math & technical'
    if re.search(r'ornaments|dingbats|wingdings|webdings|symbols', n, re.I): return 'Symbols & pictographs', 'Dingbats / pictographs'
    if not r['english']: return 'World script', 'Other world script'
    if r['monoTrait']: return 'Monospace', 'Coding monospace'
    return 'Display & decorative', 'Textured / novelty'


def computed_tags(r):
    """Tags derivable from the font file itself, merged with researched tags."""
    tags = set()
    n = r['family']
    if (0 < r['widthClass'] < 5) or re.search(r'narrow|condensed|compressed', n, re.I): tags.add('Narrow / condensed')
    if r['widthClass'] > 5 or re.search(r'extended|expanded|wide', n, re.I): tags.add('Wide / extended')
    if re.search(r'black|heavy|impact', n, re.I): tags.add('Heavy / black')
    if re.search(r'rounded|maru', n, re.I): tags.add('Rounded')
    if re.search(r'smallcaps|small caps', n, re.I): tags.add('Caps / small caps')
    return tags


missing_research = []
for r in rows:
    info = research.get(r['family'])
    if not info: missing_research.append(r['family'])
    info = info or {}
    category, subtype = info.get('category'), info.get('subtype')
    if category not in TAXONOMY or subtype not in TAXONOMY[category]:
        category, subtype = fallback_classify(r)
    r['category'], r['subtype'] = category, subtype
    r['tags'] = sorted((set(t for t in info.get('tags', []) if t in TAGS) | computed_tags(r)), key=TAGS.index)
    r['summary'] = info.get('summary', '')
    r['history'] = info.get('history', '')
    r['designers'] = info.get('designers') or r['designer']
    r['links'] = [l for l in info.get('links', []) if l.get('url', '').startswith('https://')]
    r['slug'] = slug(r['family'])

    r['englishMetricUsable'] = r['english'] and category not in ('Symbols & pictographs', 'World script')
    if not r['englishMetricUsable']:
        for key in ('capHeight16', 'xHeight16', 'lineHeight16', 'sentenceWidth16', 'averageLowercaseWidth16',
                    'averageUppercaseWidth16', 'digitWidth16', 'iWidth16', 'wWidth16'):
            r[key] = None
    # Sentence width in cap-heights: size-independent width. Arial ≈ 28.0, Arial Narrow ≈ 22.8, DIN Condensed ≈ 19.6.
    r['relativeWidth'] = round(r['sentenceWidth16'] / r['capHeight16'], 1) if r['sentenceWidth16'] and r['capHeight16'] else None
    if r['relativeWidth'] and r['relativeWidth'] < 23.5 and category in ('Serif', 'Sans serif', 'Display & decorative'):
        r['tags'] = sorted(set(r['tags']) | {'Narrow / condensed'}, key=TAGS.index)
    members = r['familyMembers']
    r['tier'] = 'S' if members >= 8 else 'A' if members >= 4 else 'B' if members >= 2 else 'C'

    researched_year = info.get('originalDesignYear')
    copyright_years = [int(y) for y in re.findall(r'(?<!\d)(?:18|19|20)\d{2}(?!\d)', r['copyright'])]
    # World-script research mostly confirmed dates from the font file itself; label those honestly.
    from_file = category == 'World script' and copyright_years and researched_year == min(copyright_years)
    if isinstance(researched_year, int) and 1400 < researched_year < 2100 and not from_file:
        r['year'], r['yearBasis'] = researched_year, 'Design'
        r['yearSource'] = next((l['url'] for l in r['links']), '')
    elif r['family'] in wikidata_years:
        r['year'], r['yearSource'] = wikidata_years[r['family']]
        r['yearBasis'] = 'Design'
    else:
        r['year'] = min(copyright_years) if copyright_years else None
        r['yearBasis'] = 'File copyright' if copyright_years else 'Unknown'
        r['yearSource'] = ''
    for gone in ('designer', 'panose', 'italicTrait'):
        r.pop(gone, None)

features = ['capHeight16', 'xHeight16', 'lineHeight16', 'averageLowercaseWidth16',
            'averageUppercaseWidth16', 'digitWidth16', 'iWidth16', 'wWidth16']
eligible = [r for r in rows if r['englishMetricUsable'] and all(isinstance(r[k], (int, float)) for k in features)]
means = [sum(r[k] for r in eligible) / len(eligible) for k in features]
stds = [math.sqrt(sum((r[k] - means[j]) ** 2 for r in eligible) / (len(eligible) - 1)) or 1 for j, k in enumerate(features)]
matrix = [[(r[k] - means[j]) / stds[j] for j, k in enumerate(features)] for r in eligible]
cov = [[sum(v[i] * v[j] for v in matrix) / (len(matrix) - 1) for j in range(len(features))] for i in range(len(features))]


def eigens(c):
    # Jacobi rotations for this small symmetric covariance matrix.
    n = len(c)
    a = [row[:] for row in c]
    v = [[float(i == j) for j in range(n)] for i in range(n)]
    for _ in range(1000):
        p, q = max(((i, j) for i in range(n) for j in range(i + 1, n)), key=lambda ij: abs(a[ij[0]][ij[1]]))
        if abs(a[p][q]) < 1e-12: break
        theta = .5 * math.atan2(2 * a[p][q], a[q][q] - a[p][p])
        cs, sn = math.cos(theta), math.sin(theta)
        for k in range(n):
            if k in (p, q): continue
            ap, aq = a[k][p], a[k][q]
            a[k][p] = a[p][k] = cs * ap - sn * aq
            a[k][q] = a[q][k] = sn * ap + cs * aq
        app, aqq, apq = a[p][p], a[q][q], a[p][q]
        a[p][p] = cs*cs*app - 2*cs*sn*apq + sn*sn*aqq
        a[q][q] = sn*sn*app + 2*cs*sn*apq + cs*cs*aqq
        a[p][q] = a[q][p] = 0
        for k in range(n):
            vp, vq = v[k][p], v[k][q]
            v[k][p], v[k][q] = cs*vp - sn*vq, sn*vp + cs*vq
    return sorted([(a[i][i], [v[k][i] for k in range(n)]) for i in range(n)], reverse=True)


eigen = eigens(cov)[:2]
for r, vector in zip(eligible, matrix):
    r['pc1'] = round(sum(vector[i] * eigen[0][1][i] for i in range(len(features))), 4)
    r['pc2'] = round(sum(vector[i] * eigen[1][1][i] for i in range(len(features))), 4)
for r in rows:
    r.setdefault('pc1', None); r.setdefault('pc2', None)

data = {'rows': rows, 'meta': {
    'measuredPointSize': 16,
    'yearSource': 'https://www.wikidata.org/', 'pcaFeatures': features,
    'pcaCount': len(eligible), 'pcaVariance': [round(x[0] / sum(cov[i][i] for i in range(len(features))) * 100, 1) for x in eigen],
    'pcaLoadings': [{features[i]: round(vec[i], 3) for i in range(len(features))} for _, vec in eigen],
    'taxonomyOrder': TAXONOMY, 'tagOrder': TAGS, 'taxonomy': taxonomy,
}}
(ROOT / 'font-data.js').write_text('window.FONT_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f"Built {len(rows)} fonts; {len(eligible)} PCA points; variance {data['meta']['pcaVariance']}; "
      f"{len(rows) - len(missing_research)} researched")
if missing_research: print('No research yet for:', ', '.join(missing_research))
