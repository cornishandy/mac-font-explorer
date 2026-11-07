// Offline synthetic regressions. --base=<commit> reads only that revision in this worktree.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const base = process.argv.find(a => a.startsWith('--base='))?.slice(7);
const source = file => base
  ? execFileSync('git', ['show', `${base}:${file}`], {cwd: root, encoding: 'utf8'})
  : readFileSync(path.join(root, file), 'utf8');
const app = source('app.js');
function between(start, end) {
  const first = app.indexOf(start), last = app.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `source boundaries: ${start}`);
  return app.slice(first, last);
}
function fn(name, next) { return between(`  function ${name}(`, `  function ${next}(`); }

// Only the DOM operations used by the extracted production functions. No browser or services.
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.value = '';
    this.style = {setProperty() {}}; this.listeners = new Map(); this.textContent = '';
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  setAttribute() {}
  scrollIntoView() { this.scrolled = true; }
  addEventListener(event, callback, options) { this.listeners.set(event, {callback, options}); }
  dispatch(event) {
    const listener = this.listeners.get(event);
    listener.callback();
    if (listener.options?.once) this.listeners.delete(event);
  }
  replaceWith(other) {
    const parent = this.parentElement;
    parent.children[parent.children.indexOf(this)] = other; other.parentElement = parent;
    this.parentElement = null;
  }
  querySelector(selector) {
    const match = el => selector.startsWith('.') ? el.className?.split(' ').includes(selector.slice(1)) : el.tagName === selector;
    for (const child of this.children) { if (match(child)) return child; const nested = child.querySelector(selector); if (nested) return nested; }
    return null;
  }
}
function harness(rows = []) {
  const elements = new Map();
  const $ = id => { if (!elements.has(id)) elements.set(id, new Element('input')); return elements.get(id); };
  $('weight').value = '400'; $('tag-mode').value = 'any';
  const state = {filters: [], tags: new Set(), compare: false, openAbout: new Set()};
  const context = vm.createContext({rows, state, $, document: {createElement: tag => new Element(tag)},
    starred: () => false, updateSubtypeOptions() {}, render() {}, subtypeInfo: new Map()});
  const code = [
    between('  const fields =', '  for (const r of rows) r.tagText'),
    'const fieldMap = Object.fromEntries(fields.map(f => [f.key, f]));',
    app.match(/^  const value = .*$/m)[0], between('  const fmt =', '  const taxonomy ='),
    between('  const filterIds =', '  function number('), fn('number', 'passesCustom'),
    fn('passesCustom', 'filtered'), fn('filtered', 'sorted'),
    fn('node', 'link'), fn('link', 'populate'), fn('setFont', 'starButton'),
    fn('starButton', 'specimen'), fn('specimen', 'aboutPanel'), fn('aboutPanel', 'card'), fn('card', 'renderGallery'),
    app.match(/^  function clearFilters\(.*$/m)[0], fn('openFont', 'openGuide'),
    'globalThis.api = {passesCustom, filtered, openFont, card, aboutPanel, fmt};'
  ].join('\n');
  vm.runInContext(code, context);
  return {api: context.api, state, $};
}
const row = extra => ({family: 'Synthetic face', slug: 'synthetic-face', onDevice: true,
  english: true, englishMetricUsable: true, category: 'Sans serif', subtype: 'Synthetic',
  tags: [], links: [], tier: 'C', familyMembers: 1, ...extra});

test('F1: openFont selects exactly the family, clears stale filters/search, and opens its About panel', () => {
  const rows = [row({family: 'Arial'}), row({family: 'Arial Black'}), row({family: 'Symbol'}),
    row({family: 'Other symbols', category: 'Symbols & pictographs'}),
    row({family: 'Futura'}), row({family: 'Another face', summary: 'Inspired by Futura'})];
  const {api, state, $} = harness(rows);
  for (const name of ['Arial', 'Symbol', 'Futura']) {
    $('search').value = 'stale'; state.filters = [{field: 'family', op: 'eq', input: 'stale'}];
    state.tags.add('stale'); state.compare = true;
    api.openFont(name);
    assert.deepEqual(Array.from(api.filtered(), r => r.family), [name]);
    assert.equal($('search').value, ''); assert.equal(state.filters[0].field, 'family');
    assert.equal(state.filters[0].op, 'eq'); assert.equal(state.filters[0].input, name);
    assert.equal(state.tab, 'gallery'); assert.equal(state.compare, false);
    assert.ok(state.openAbout.has(name)); assert.ok($('panel-gallery').scrolled);
  }
});

test('F2: specimen label follows English glyph coverage independently of metric eligibility', () => {
  const {api} = harness();
  for (const category of ['World script', 'Symbols & pictographs']) {
    const card = api.card(row({category, english: true, englishMetricUsable: false}), 0);
    assert.equal(card.querySelector('.spec-label').textContent, 'ENGLISH SPECIMEN / 400 WEIGHT');
  }
  assert.match(api.card(row({english: false, englishMetricUsable: false}), 0).querySelector('.spec-label').textContent, /FALLBACK LIKELY/);
  assert.match(api.card(row({onDevice: false}), 0).querySelector('.spec-label').textContent, /IMAGE PREVIEW/);
});

test('F4: numeric equality uses displayed precision, including rounded integers; inequalities retain raw precision', () => {
  const {api} = harness();
  const pass = (v, input, op = 'eq', field = 'capHeight16') => api.passesCustom({[field]: v}, {field, input, op});
  for (const [v, input] of [[11.273, '11.27'], [11.279, '11.28'], [1.999, '2'], [2, '2.00'],
    [12345, '12345'], [12345.001, '12345'], [-1.999, '-2'], [0.004, '0']]) assert.ok(pass(v, input), `${v} = ${input}`);
  assert.equal(pass(11.273, '11.28'), false);
  assert.equal(pass(null, '0'), false); assert.equal(pass(1, 'invalid'), false);
  assert.equal(pass(1999, '1999', 'eq', 'year'), true);
  assert.equal(pass(1999, '1999.001', 'eq', 'year'), false);
  for (const [op, expected] of [['lt', false], ['lte', false], ['gt', true], ['gte', true]]) assert.equal(pass(11.273, '11.27', op), expected);
  assert.equal(api.passesCustom({english: true}, {field: 'english', input: 'yes', op: 'eq'}), true);
});

test('F6: a missing image replaces the preview claim with an explicit unavailable-font fallback warning', () => {
  const {api} = harness();
  const card = api.card(row({family: 'Unavailable face', onDevice: false}), 0);
  const image = card.querySelector('img'), label = card.querySelector('.spec-label');
  assert.match(label.textContent, /IMAGE PREVIEW/);
  image.dispatch('error');
  assert.match(label.textContent, /FALLBACK/);
  assert.match(label.textContent, /FONT UNAVAILABLE/);
  assert.match(label.textContent, /IMAGE MISSING/);
  assert.doesNotMatch(label.textContent, /IMAGE PREVIEW|Unavailable face/);
  assert.equal(card.querySelector('img'), null);
  assert.equal(card.querySelector('.spec-primary').textContent, 'The quick brown fox jumps over the lazy dog.');
});

test('F7: actual builder year logic preserves Wikidata provenance and the matching UI filter', () => {
  const builder = source('tools/build-data.py');
  const block = builder.slice(builder.indexOf('    researched_year ='), builder.indexOf('    for gone in'));
  assert.ok(block.length > 0);
  const cases = [
    {r: {family: 'Synthetic inception', copyright: '', category: 'Sans serif'}, info: {originalDesignYear: null}, wiki: {'Synthetic inception': [1999, 'https://www.wikidata.org/entity/Q-synthetic']}},
    {r: {family: 'Researched', copyright: '', category: 'Sans serif', links: [{url: 'https://example.invalid/research'}]}, info: {originalDesignYear: 1984}, wiki: {Researched: [1999, 'https://example.invalid/wiki']}},
    {r: {family: 'File date', copyright: 'Copyright 2001', category: 'World script'}, info: {originalDesignYear: 2001}, wiki: {}},
    {r: {family: 'Unknown', copyright: '', category: 'Sans serif'}, info: {}, wiki: {}}
  ];
  const script = `import json, re, sys, textwrap\npayload = json.load(sys.stdin)\nout = []\nfor case in payload['cases']:\n r = case['r']; r.setdefault('links', [])\n env = dict(r=r, category=r['category'], info=case['info'], wikidata_years=case['wiki'], re=re)\n exec(textwrap.dedent(payload['block']), env)\n out.append(r)\nprint(json.dumps(out))`;
  const built = JSON.parse(execFileSync('python3', ['-c', script], {cwd: root, input: JSON.stringify({block, cases}), encoding: 'utf8'}));
  assert.equal(built[0].yearBasis, 'Wikidata'); assert.equal(built[0].year, 1999);
  assert.equal(built[0].yearSource, cases[0].wiki['Synthetic inception'][1]);
  assert.equal(built[1].yearBasis, 'Design'); assert.equal(built[1].year, 1984);
  assert.equal(built[1].yearSource, 'https://example.invalid/research');
  assert.equal(built[2].yearBasis, 'File copyright'); assert.equal(built[3].yearBasis, 'Unknown');
  const template = source('index.template.html');
  const select = template.match(/<select id="year-source-filter">(.*?)<\/select>/s)[1];
  const choice = [...select.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].find(m => m[1] === built[0].yearBasis);
  assert.ok(choice, 'builder basis has a matching filter option'); assert.equal(choice[2], 'Wikidata inception');
  const {api, $} = harness(built.map(r => row(r)));
  $('year-source-filter').value = choice[1];
  assert.deepEqual(Array.from(api.filtered(), r => r.family), ['Synthetic inception']);
  const facts = api.aboutPanel(row(built[0])).querySelector('.about-facts');
  assert.ok(facts.children.some(c => c.textContent === '1999 · wikidata'));
});
