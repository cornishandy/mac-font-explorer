(() => {
  const DATA = window.FONT_DATA;
  const rows = DATA.rows;
  const meta = DATA.meta;
  const byName = new Map(rows.map(row => [row.family, row]));
  const $ = id => document.getElementById(id);

  // ---------- Persistent, mergeable state ----------
  // Everything the user creates lives in one document so it can be merged across devices:
  //   stars:  {family: {on: bool, t: ms}}      (tombstoned, last write wins per family)
  //   views:  {name: {data, t, deleted?}}      (tombstoned, last write wins per view)
  //   weight: {v: '400', t: ms}
  const storeKey = 'mac-font-explorer-state-v3';
  const tokenKey = 'mac-font-explorer-sync-token';
  const gistKey = 'mac-font-explorer-sync-gist';
  const syncFile = 'mac-font-explorer-sync.json';
  const legacy = {stars: 'font-field-stars-v1', weight: 'font-field-weight-v1', views: 'font-field-views-v2'};
  const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const write = (key, v) => { try { v == null ? localStorage.removeItem(key) : localStorage.setItem(key, v); } catch (_) {} };

  function emptyDoc() { return {version: 3, stars: {}, views: {}, weight: {v: '400', t: 0}}; }
  function loadDoc() {
    try { const doc = JSON.parse(read(storeKey)); if (doc && doc.version === 3) return doc; } catch (_) {}
    // First run: migrate the original Font Field keys (same file:// origin in Chrome).
    const doc = emptyDoc();
    try {
      for (const name of JSON.parse(read(legacy.stars) || '[]')) doc.stars[name] = {on: true, t: 1};
      for (const [name, data] of Object.entries(JSON.parse(read(legacy.views) || '{}') || {})) doc.views[name] = {data, t: 1};
      const w = read(legacy.weight); if (w) doc.weight = {v: w, t: 1};
    } catch (_) {}
    return doc;
  }
  function mergeDocs(a, b) {
    const out = emptyDoc();
    for (const part of ['stars', 'views']) {
      for (const key of new Set([...Object.keys(a[part] || {}), ...Object.keys(b[part] || {})])) {
        const x = a[part]?.[key], y = b[part]?.[key];
        out[part][key] = !x ? y : !y ? x : (y.t > x.t ? y : x);
      }
    }
    out.weight = (b.weight?.t || 0) > (a.weight?.t || 0) ? b.weight : a.weight;
    return out;
  }
  const sameDoc = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  let doc = loadDoc();
  const state = {tab: 'gallery', compare: false, filters: [], tags: new Set(), sort: 'family', direction: 'asc', selected: null, openAbout: new Set()};
  const starred = name => !!doc.stars[name]?.on;
  const starCount = () => Object.entries(doc.stars).filter(([name, s]) => s.on && byName.has(name)).length;
  const liveViews = () => Object.fromEntries(Object.entries(doc.views).filter(([, v]) => !v.deleted));
  function commit() { write(storeKey, JSON.stringify(doc)); scheduleSync(); }

  // ---------- Is each font installed on this device? ----------
  // A family is present if text set in it measures differently from every generic fallback.
  const installed = (() => {
    const ctx = document.createElement('canvas').getContext('2d');
    const probe = 'mmmmmmmmmmlliWWQ@#0123456789';
    const bases = ['monospace', 'serif', 'sans-serif'];
    const baseWidth = {};
    for (const b of bases) { ctx.font = `72px ${b}`; baseWidth[b] = ctx.measureText(probe).width; }
    const isApple = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const isMac = /Mac/.test(navigator.platform || '') && (navigator.maxTouchPoints || 0) < 2;
    const result = new Map();
    for (const row of rows) {
      if (row.family === 'SF Pro') { result.set(row.family, isApple); continue; }
      // A Latin probe can't see fonts without Latin glyphs; every family here ships with macOS.
      if (!row.english && isMac) { result.set(row.family, true); continue; }
      const quoted = `"${row.family.replaceAll('"', '\\"')}"`;
      result.set(row.family, bases.some(b => { ctx.font = `72px ${quoted}, ${b}`; return Math.abs(ctx.measureText(probe).width - baseWidth[b]) > 0.5; }));
    }
    return result;
  })();
  // ?preview-missing shows every font as a device without it would (the phone view), for testing.
  const previewMissing = new URLSearchParams(location.search).has('preview-missing');
  for (const r of rows) r.onDevice = !previewMissing && installed.get(r.family);

  // ---------- Fields ----------
  const fields = [
    ['family','Family','text'],['category','Typeface','text'],['subtype','Subtype','text'],['tagText','Style tags','text'],['tier','Tier','text'],
    ['year','Year','number'],['yearBasis','Year source','text'],['designers','Designer','text'],['capHeight16','Cap height','number'],['xHeight16','x-height','number'],
    ['lineHeight16','Line height','number'],['sentenceWidth16','Sentence width','number'],['relativeWidth','Relative width','number'],
    ['averageLowercaseWidth16','Avg lowercase width','number'],['averageUppercaseWidth16','Avg uppercase width','number'],
    ['digitWidth16','Digit width','number'],['iWidth16','i width','number'],['wWidth16','W width','number'],
    ['familyMembers','Faces','number'],['widthClass','Width class','number'],['monoTrait','Monospace','boolean'],
    ['english','English A–Z','boolean'],['starred','Starred','boolean'],['onDevice','On this device','boolean'],
    ['manufacturer','Manufacturer','text'],['postscript','PostScript','text'],['pc1','PCA 1','number'],['pc2','PCA 2','number']
  ].map(([key,label,type]) => ({key,label,type}));
  for (const r of rows) r.tagText = r.tags.join(', ');
  const fieldMap = Object.fromEntries(fields.map(f => [f.key,f]));
  const tableFields = ['starred','family','category','subtype','tagText','tier','year','yearBasis','designers','capHeight16','xHeight16','sentenceWidth16','relativeWidth','averageLowercaseWidth16','lineHeight16','monoTrait','english','onDevice','familyMembers','pc1','pc2'];
  const chartFields = fields.filter(f => f.key !== 'tagText');
  const palette = ['#d84c32','#2d6670','#8f6b31','#715b94','#55835d','#b15e80','#4d5451','#c28141','#457c9b','#9a684e'];
  const svgNS = 'http://www.w3.org/2000/svg';
  const value = (row,key) => key === 'starred' ? starred(row.family) : row[key];
  const fmt = (v,key) => {
    if (v == null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return key === 'year' ? String(v) : Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
    return String(v);
  };
  const taxonomy = meta.taxonomy || {categories: [], subtypes: [], tags: []};
  const subtypeInfo = new Map((taxonomy.subtypes || []).map(s => [`${s.category}|${s.name}`, s]));
  const categoryInfo = new Map((taxonomy.categories || []).map(c => [c.name, c]));
  const tagInfo = new Map((taxonomy.tags || []).map(t => [t.name, t]));

  function option(select, val, label) { const el = document.createElement('option'); el.value = val; el.textContent = label; select.append(el); }
  function node(tag,cls,content) { const x=document.createElement(tag); if(cls)x.className=cls; if(content !== undefined)x.textContent=content; return x; }
  function link(url,label) { const a=node('a','',label); a.href=url; a.target='_blank'; a.rel='noreferrer'; return a; }

  function populate() {
    const order = meta.taxonomyOrder;
    for (const c of Object.keys(order)) if (rows.some(r => r.category === c)) option($('category-filter'), c, c);
    updateSubtypeOptions();
    [...new Set(rows.map(r => r.tier))].sort().forEach(v => option($('tier-filter'),v,v));
    const chips = $('tag-chips');
    for (const tag of meta.tagOrder) {
      const n = rows.filter(r => r.tags.includes(tag)).length;
      if (!n) continue;
      const b = node('button','tag-chip'); b.type='button'; b.dataset.tag=tag; b.setAttribute('aria-pressed','false');
      b.title = tagInfo.get(tag)?.summary || tag;
      b.append(document.createTextNode(tag), node('span','chip-count',String(n)));
      chips.append(b);
    }
    for (const f of fields) { option($('field-filter'), f.key, f.label); option($('sort-field'), f.key, f.label); }
    for (const f of chartFields) {
      for (const id of ['chart-x','chart-y','chart-color','pca-color']) option($(id),f.key,f.label);
      if (f.type === 'number') option($('chart-size'),f.key,f.label);
    }
    option($('chart-size'),'','Fixed size');
    $('chart-x').value = 'year'; $('chart-y').value = 'relativeWidth';
    $('chart-color').value = 'category'; $('chart-size').value = '';
    $('pca-color').value = 'category';
    $('sort-field').value = state.sort;
    if ([...$('weight').options].some(o => o.value === doc.weight.v)) $('weight').value = doc.weight.v;
    updateOperators();
    updateSavedViews();
  }
  function updateSubtypeOptions() {
    const select = $('subtype-filter'), old = select.value, cat = $('category-filter').value;
    select.replaceChildren(); option(select,'','All subtypes');
    for (const [c, subs] of Object.entries(meta.taxonomyOrder)) {
      if (cat && c !== cat) continue;
      for (const s of subs) if (rows.some(r => r.category === c && r.subtype === s)) option(select, s, cat ? s : `${s}  (${c})`);
    }
    select.value = [...select.options].some(o => o.value === old) ? old : '';
  }
  function updateOperators() {
    const f = fieldMap[$('field-filter').value];
    const select = $('operator-filter'); select.replaceChildren();
    const choices = f.type === 'number' ? [['eq','='],['lt','<'],['lte','≤'],['gt','>'],['gte','≥'],['missing','Is blank'],['present','Is present']]
      : f.type === 'boolean' ? [['eq','Is'],['missing','Is blank']]
      : [['contains','Contains'],['eq','Equals'],['missing','Is blank'],['present','Is present']];
    choices.forEach(([v,l]) => option(select,v,l));
    $('value-filter').placeholder = f.type === 'boolean' ? 'Yes or no' : 'Type a value';
  }

  // ---------- Filtering and sorting ----------
  const filterIds = ['category-filter','subtype-filter','tier-filter','english-filter','mono-filter','device-filter','year-source-filter','year-min','year-max','height-min','height-max','width-min','width-max','tag-mode'];
  const rangeIds = ['year-min','year-max','height-min','height-max','width-min','width-max'];
  function number(id) { const raw = $(id).value.trim(); return raw === '' ? null : Number(raw); }
  function passesCustom(row, filter) {
    const v = value(row,filter.field);
    if (filter.op === 'missing') return v == null || v === '';
    if (filter.op === 'present') return v != null && v !== '';
    if (v == null) return false;
    if (filter.op === 'contains') return String(v).toLocaleLowerCase().includes(filter.input.toLocaleLowerCase());
    const type = fieldMap[filter.field].type;
    const term = type === 'number' ? Number(filter.input) : type === 'boolean' ? /^(yes|true|1)$/i.test(filter.input) : filter.input;
    if (filter.op === 'eq') return type === 'text' ? String(v).toLocaleLowerCase() === String(term).toLocaleLowerCase() : v === term;
    if (filter.op === 'lt') return v < term;
    if (filter.op === 'lte') return v <= term;
    if (filter.op === 'gt') return v > term;
    if (filter.op === 'gte') return v >= term;
    return true;
  }
  function filtered() {
    const q = $('search').value.trim().toLocaleLowerCase();
    const tags = [...state.tags], all = $('tag-mode').value === 'all';
    return rows.filter(r => {
      if (state.compare && !starred(r.family)) return false;
      if (q && ![r.family,r.category,r.subtype,r.designers,r.manufacturer,r.tagText,r.summary].some(s => String(s || '').toLocaleLowerCase().includes(q))) return false;
      for (const key of ['category','subtype','tier']) if ($(`${key}-filter`).value && r[key] !== $(`${key}-filter`).value) return false;
      if (tags.length && !(all ? tags.every(t => r.tags.includes(t)) : tags.some(t => r.tags.includes(t)))) return false;
      if ($('english-filter').value && r.english !== ($('english-filter').value === 'yes')) return false;
      if ($('mono-filter').value && r.monoTrait !== ($('mono-filter').value === 'yes')) return false;
      if ($('device-filter').value && r.onDevice !== ($('device-filter').value === 'yes')) return false;
      if ($('year-source-filter').value && r.yearBasis !== $('year-source-filter').value) return false;
      const limits = [['year-min','year','min'],['year-max','year','max'],['height-min','capHeight16','min'],['height-max','capHeight16','max'],['width-min','sentenceWidth16','min'],['width-max','sentenceWidth16','max']];
      for (const [id,key,side] of limits) { const n = number(id); if (n != null && (r[key] == null || (side === 'min' ? r[key] < n : r[key] > n))) return false; }
      return state.filters.every(f => passesCustom(r,f));
    });
  }
  function sorted(list) {
    const key = state.sort, sign = state.direction === 'asc' ? 1 : -1;
    return [...list].sort((a,b) => {
      const av=value(a,key),bv=value(b,key);
      if (av == null || av === '') return bv == null || bv === '' ? a.family.localeCompare(b.family) : 1;
      if (bv == null || bv === '') return -1;
      const cmp = typeof av === 'number' ? av-bv : typeof av === 'boolean' ? Number(av)-Number(bv) : String(av).localeCompare(String(bv));
      return sign*cmp || a.family.localeCompare(b.family);
    });
  }

  // ---------- Gallery ----------
  function setFont(el,name) {
    el.style.setProperty('--spec-font', name === 'SF Pro' ? '-apple-system, BlinkMacSystemFont, sans-serif' : `"${name.replaceAll('"','\\"')}", sans-serif`);
    el.style.setProperty('--spec-weight',$('weight').value);
  }
  function starButton(row) {
    const on = starred(row.family);
    const b=node('button','star-button',on?'★':'☆');
    b.type='button'; b.dataset.font=row.family; b.setAttribute('aria-label',`${on?'Remove':'Star'} ${row.family}`);b.setAttribute('aria-pressed',String(on));
    return b;
  }
  function specimen(row) {
    const primary = 'The quick brown fox jumps over the lazy dog.';
    if (row.onDevice) return node('p','spec-primary',primary);
    // Not installed here: show the Mac rendering. Falls back to text if the image folder isn't alongside.
    const img = node('img','spec-image'); img.src = `specimens/${row.slug}.png`; img.alt = `${primary} (set in ${row.family})`; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => img.replaceWith(node('p','spec-primary',primary)), {once: true});
    return img;
  }
  function aboutPanel(row) {
    const d = node('details','font-about'); d.dataset.about = row.family; d.open = state.openAbout.has(row.family);
    d.append(node('summary','', 'About & history'));
    if (row.history) d.append(node('p','about-history',row.history));
    const facts = node('dl','about-facts');
    const fact = (k,v) => { if (v) facts.append(node('dt','',k), node('dd','',v)); };
    fact('Designer', row.designers); fact('Year', row.year ? `${row.year} · ${row.yearBasis === 'Design' ? 'original design' : row.yearBasis.toLowerCase()}` : '');
    fact('Maker', row.manufacturer); fact('Faces', String(row.familyMembers));
    d.append(facts);
    const sub = subtypeInfo.get(`${row.category}|${row.subtype}`);
    if (sub) {
      const box = node('div','about-subtype');
      box.append(node('strong','',`${row.subtype} · ${row.category}`), node('p','',sub.summary));
      const guide = node('button','link-button','Read about this subtype →'); guide.type='button'; guide.dataset.guide=`${row.category}|${row.subtype}`;
      box.append(guide); d.append(box);
    }
    if (row.links.length) {
      const list = node('ul','about-links');
      for (const l of row.links) { const li = node('li'); li.append(link(l.url, l.label)); list.append(li); }
      d.append(list);
    }
    return d;
  }
  function card(row,index) {
    const on = starred(row.family);
    const a=node('article','font-card'+(on?' is-starred':''));setFont(a,row.family);
    const info=node('div','card-info'); info.append(node('span','font-index',String(index+1).padStart(3,'0')));
    info.append(node('h2','font-name',row.family));
    const metaLine=node('button','font-meta link-button',`${row.category} · ${row.subtype}`); metaLine.type='button'; metaLine.dataset.guide=`${row.category}|${row.subtype}`; metaLine.title='About this subtype';
    info.append(metaLine);
    if (row.tags.length) { const t=node('div','card-tags'); row.tags.forEach(tag=>{const c=node('button','mini-tag',tag);c.type='button';c.dataset.addTag=tag;c.title=`Filter: ${tag}`;t.append(c);}); info.append(t); }
    const bottom=node('div','card-bottom');bottom.append(node('span','tag',`TIER ${row.tier} · ${row.familyMembers} ${row.familyMembers===1?'FACE':'FACES'}${row.year?` · ${row.year}`:''}`),starButton(row));info.append(bottom);
    const sample=node('div','card-specimen');
    const label = !row.onDevice ? 'IMAGE PREVIEW · NOT INSTALLED ON THIS DEVICE · REGULAR' : `${row.englishMetricUsable?'ENGLISH SPECIMEN':'ENGLISH SPECIMEN · FALLBACK LIKELY'} / ${$('weight').value} WEIGHT`;
    sample.append(node('div','spec-label',label), specimen(row));
    if (row.onDevice) sample.append(node('p','spec-secondary','A better way to see the little things.'));
    if (row.summary) sample.append(node('p','font-summary',row.summary));
    const detail=node('div','spec-detail');detail.append(node('span',row.onDevice?'':'plain','0123456789  &  !?  @#'),node('span','',`CAP ${fmt(row.capHeight16)} · WIDTH ${fmt(row.sentenceWidth16)} · REL ${fmt(row.relativeWidth)}`));
    sample.append(detail, aboutPanel(row));
    a.append(info,sample);return a;
  }
  function renderGallery(list) {
    const frag=document.createDocumentFragment();sorted(list).forEach((r,i)=>frag.append(card(r,i)));
    $('font-list').replaceChildren(frag);$('font-list').classList.toggle('compare-grid',state.compare);
  }
  function renderTable(list) {
    const table=$('font-table'); const head=document.createElement('thead'),tr=document.createElement('tr');
    tableFields.forEach(key=>{const th=document.createElement('th'); const b=node('button','',fieldMap[key].label+(state.sort===key?(state.direction==='asc'?' ↑':' ↓'):''));b.dataset.sort=key; b.title=`Sort by ${fieldMap[key].label}`; th.append(b);tr.append(th);});head.append(tr);
    const body=document.createElement('tbody');
    for (const r of sorted(list)) {const tr=document.createElement('tr');tr.dataset.font=r.family;
      tableFields.forEach(key=>{const td=document.createElement('td');
        if(key==='starred')td.append(starButton(r));
        else if(key==='family'){const b=node('button','table-family',r.family);b.dataset.open=r.family;setFont(b,r.family);td.append(b);}
        else if(key==='year'&&r.yearSource){td.append(link(r.yearSource,fmt(r.year,'year')));td.title='Source for the design year';}
        else{td.textContent=fmt(value(r,key),key);if(key==='year')td.title=r.yearBasis;}
        tr.append(td);});body.append(tr);}
    table.replaceChildren(head,body);
  }

  // ---------- Type guide ----------
  function renderGuide() {
    const box = $('guide'); box.replaceChildren();
    const show = (patch) => { clearFilters(false); Object.entries(patch).forEach(([id,v]) => { $(id).value = v; if (id === 'category-filter') updateSubtypeOptions(); }); if (patch['subtype-filter']) $('subtype-filter').value = patch['subtype-filter']; state.tab='gallery'; render(); $('panel-gallery').scrollIntoView({behavior:'smooth'}); };
    const links = (list) => { const p = node('p','guide-links'); (list||[]).forEach((l,i) => { if (i) p.append(document.createTextNode(' · ')); p.append(link(l.url, l.label)); }); return p; };
    const nav = node('nav','guide-nav');
    for (const [cat, subs] of Object.entries(meta.taxonomyOrder)) {
      const members = rows.filter(r => r.category === cat); if (!members.length) continue;
      const a = node('a','',`${cat} (${members.length})`); a.href = `#guide-${cat.replace(/\W+/g,'-')}`; nav.append(a);
      const sec = node('section','guide-category'); sec.id = `guide-${cat.replace(/\W+/g,'-')}`;
      const info = categoryInfo.get(cat) || {};
      const h = node('div','guide-head'); h.append(node('h3','',cat));
      const b = node('button','',`Show ${members.length} fonts`); b.type='button'; b.addEventListener('click',()=>show({'category-filter':cat})); h.append(b);
      sec.append(h);
      if (info.summary) sec.append(node('p','guide-summary',info.summary));
      if (info.history) sec.append(node('p','guide-history',info.history));
      sec.append(links(info.links));
      const grid = node('div','guide-grid');
      for (const sub of subs) {
        const subRows = members.filter(r => r.subtype === sub); if (!subRows.length) continue;
        const s = subtypeInfo.get(`${cat}|${sub}`) || {};
        const card = node('article','guide-card'); card.id = `guide-${cat}|${sub}`.replace(/\W+/g,'-');
        const top = node('div','guide-card-head'); top.append(node('h4','',sub));
        const sb = node('button','',`Show ${subRows.length}`); sb.type='button'; sb.addEventListener('click',()=>show({'category-filter':cat,'subtype-filter':sub})); top.append(sb);
        card.append(top);
        if (s.summary) card.append(node('p','',s.summary));
        if (s.history) card.append(node('p','guide-history',s.history));
        if (s.examples?.length) card.append(node('p','guide-examples',`Classic examples: ${s.examples.join(', ')}`));
        const here = node('p','guide-members'); here.append(node('span','','On this Mac: '));
        subRows.slice(0,14).forEach((r,i)=>{ if(i) here.append(document.createTextNode(', ')); const x=node('button','link-button',r.family); x.type='button'; x.dataset.open=r.family; setFont(x,r.family); here.append(x); });
        if (subRows.length > 14) here.append(document.createTextNode(`, +${subRows.length-14} more`));
        card.append(here, links(s.links));
        grid.append(card);
      }
      sec.append(grid); box.append(sec);
    }
    const tagSec = node('section','guide-category'); tagSec.id='guide-styles';
    const th = node('div','guide-head'); th.append(node('h3','','Style tags')); tagSec.append(th);
    tagSec.append(node('p','guide-summary','Tags cut across categories: a font can be both “Narrow / condensed” and “Signage / industrial”. Choose a tag to filter by it.'));
    const tagGrid = node('div','guide-grid');
    for (const tag of meta.tagOrder) {
      const n = rows.filter(r => r.tags.includes(tag)).length; if (!n) continue;
      const t = tagInfo.get(tag) || {};
      const c = node('article','guide-card'); const top=node('div','guide-card-head'); top.append(node('h4','',tag));
      const b=node('button','',`Show ${n}`); b.type='button'; b.addEventListener('click',()=>{clearFilters(false); state.tags=new Set([tag]); state.tab='gallery'; render(); $('panel-gallery').scrollIntoView({behavior:'smooth'});}); top.append(b);
      c.append(top); if (t.summary) c.append(node('p','',t.summary)); c.append(links(t.links)); tagGrid.append(c);
    }
    const na = node('a','','Style tags'); na.href='#guide-styles'; nav.append(na);
    tagSec.append(tagGrid); box.prepend(nav); box.append(tagSec);
  }

  // ---------- Charts ----------
  const svgEl=(tag,attrs={})=>{const e=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
  function domain(key) {
    const vals=rows.map(r=>value(r,key)).filter(v=>v!==null&&v!==undefined&&v!=='');
    if(fieldMap[key].type==='number') {const min=Math.min(...vals),max=Math.max(...vals);return {numeric:true,min,max:max===min?min+1:max};}
    return {numeric:false, values:[...new Set(vals.map(String))].sort((a,b)=>a.localeCompare(b))};
  }
  function coordinate(v,d,start,end) {
    if(v==null||v==='')return null;
    if(d.numeric)return start+(Number(v)-d.min)/(d.max-d.min)*(end-start);
    const i=d.values.indexOf(String(v));return i<0?null:start+(i+.5)/d.values.length*(end-start);
  }
  function colorFor(v,d) {
    if(v==null||v==='')return '#c7c4ba';
    if(d.numeric){const t=Math.max(0,Math.min(1,(Number(v)-d.min)/(d.max-d.min)));const a=[45,102,112],b=[216,76,50];return `rgb(${a.map((n,i)=>Math.round(n+(b[i]-n)*t)).join(',')})`;}
    return palette[d.values.indexOf(String(v))%palette.length];
  }
  function showTooltip(id,event,row,xKey,yKey) {
    const tip=$(id);tip.replaceChildren();
    tip.append(node('strong','',row.family),node('span','',`${fieldMap[xKey].label}: ${fmt(value(row,xKey))}`),node('span','',`${fieldMap[yKey].label}: ${fmt(value(row,yKey))}`),node('span','',`${row.category} · ${starred(row.family)?'★ Starred':'☆ Not starred'}`));
    tip.hidden=false;const rect=event.currentTarget.ownerSVGElement.getBoundingClientRect();tip.style.left=`${Math.min(event.clientX-rect.left+12,rect.width-220)}px`;tip.style.top=`${Math.max(4,event.clientY-rect.top-70)}px`;
  }
  function drawPlot(id,legendId,list,xKey,yKey,colorKey,sizeKey,tipId) {
    const svg=$(id);svg.replaceChildren();
    const dx=domain(xKey),dy=domain(yKey),dc=domain(colorKey),ds=sizeKey?domain(sizeKey):null;
    const L=78,R=866,T=30,B=455;
    svg.append(svgEl('rect',{x:L,y:T,width:R-L,height:B-T,fill:'#fffefb',stroke:'#d8d5cb'}));
    for(let i=0;i<=5;i++) {const x=L+i*(R-L)/5,y=B-i*(B-T)/5;svg.append(svgEl('line',{x1:x,y1:T,x2:x,y2:B,stroke:'#e8e5de'}),svgEl('line',{x1:L,y1:y,x2:R,y2:y,stroke:'#e8e5de'}));}
    function ticks(d,isX) {
      const arr=d.numeric?Array.from({length:6},(_,i)=>d.min+(d.max-d.min)*i/5):d.values.length<=12?d.values:d.values.filter((_,i)=>i%Math.ceil(d.values.length/10)===0);
      for(const v of arr){const n=coordinate(v,d,isX?L:B,isX?R:T);const label=svgEl('text',isX?{x:n,y:B+20,'text-anchor':'middle',class:'axis-tick'}:{x:L-9,y:n+3,'text-anchor':'end',class:'axis-tick'});label.textContent=d.numeric?Number(v).toFixed(Math.abs(v)<10?1:0):String(v).slice(0,12);svg.append(label);}
    }
    ticks(dx,true);ticks(dy,false);
    const xl=svgEl('text',{x:(L+R)/2,y:510,'text-anchor':'middle',class:'axis-label'});xl.textContent=fieldMap[xKey].label;svg.append(xl);
    const yl=svgEl('text',{x:21,y:(T+B)/2,transform:`rotate(-90 21 ${(T+B)/2})`,'text-anchor':'middle',class:'axis-label'});yl.textContent=fieldMap[yKey].label;svg.append(yl);
    let plotted=0;
    for(const row of list) {
      const x=coordinate(value(row,xKey),dx,L,R),y=coordinate(value(row,yKey),dy,B,T);
      if(x==null||y==null)continue;
      const on=starred(row.family);
      const sv=sizeKey?value(row,sizeKey):null;
      const radius=ds&&sv!=null?4+Math.max(0,Math.min(1,(sv-ds.min)/(ds.max-ds.min)))*7:on?7:5;
      const c=svgEl('circle',{cx:x,cy:y,r:radius,fill:colorFor(value(row,colorKey),dc),'fill-opacity':on?1:.78,stroke:on?'#20231f':'#fff','stroke-width':on?2:1.2,tabindex:0,role:'img','aria-label':`${row.family}; ${fieldMap[xKey].label} ${fmt(value(row,xKey))}; ${fieldMap[yKey].label} ${fmt(value(row,yKey))}`});
      const title=svgEl('title');title.textContent=`${row.family} · ${fieldMap[xKey].label}: ${fmt(value(row,xKey))} · ${fieldMap[yKey].label}: ${fmt(value(row,yKey))}`;c.append(title);
      c.addEventListener('mouseenter',e=>showTooltip(tipId,e,row,xKey,yKey));c.addEventListener('mouseleave',()=>{$(tipId).hidden=true;});c.addEventListener('focus',e=>showTooltip(tipId,e,row,xKey,yKey));c.addEventListener('blur',()=>{$(tipId).hidden=true;});
      c.addEventListener('click',()=>openFont(row.family));
      svg.append(c);plotted++;
    }
    const legend=$(legendId);legend.replaceChildren();
    if(dc.numeric){legend.append(node('span','',`${fieldMap[colorKey].label}: ${fmt(dc.min)} → ${fmt(dc.max)}`));}
    else for(const v of dc.values.slice(0,12)){const item=node('span','legend-item');const dot=node('i','');dot.style.background=colorFor(v,dc);item.append(dot,document.createTextNode(v));legend.append(item);}
    legend.append(node('span','plot-count',`${plotted} plotted · outlined = starred`));
  }

  // ---------- Render ----------
  function renderFilters() {
    const box=$('active-filters');box.replaceChildren();
    state.filters.forEach((f,i)=>{const b=node('button','filter-chip',`${fieldMap[f.field].label} ${f.op} ${f.input} ×`);b.dataset.remove=i;box.append(b);});
    for (const chip of document.querySelectorAll('.tag-chip')) chip.setAttribute('aria-pressed', String(state.tags.has(chip.dataset.tag)));
  }
  const tabs = ['gallery','table','pca','chart','guide'];
  function render() {
    const list=filtered();
    $('star-count').textContent=starCount();
    $('result-count').textContent=`${list.length} / ${rows.length} FONTS`;
    $('all-button').setAttribute('aria-pressed',String(!state.compare));$('compare-button').setAttribute('aria-pressed',String(state.compare));
    for(const tab of tabs){$(`tab-${tab}`).setAttribute('aria-selected',String(state.tab===tab));$(`panel-${tab}`).hidden=state.tab!==tab;}
    renderFilters();
    if(state.tab==='gallery')renderGallery(list);
    if(state.tab==='table')renderTable(list);
    if(state.tab==='pca'){
      $('pca-caption').textContent=`${meta.pcaCount} Latin-oriented families with complete English glyph coverage · PC1 ${meta.pcaVariance[0]}% · PC2 ${meta.pcaVariance[1]}% of geometric variation. Points shown: ${list.filter(r=>r.pc1!=null).length}.`;
      drawPlot('pca-plot','pca-legend',list,'pc1','pc2',$('pca-color').value,'','pca-tooltip');
    }
    if(state.tab==='chart')drawPlot('custom-plot','chart-legend',list,$('chart-x').value,$('chart-y').value,$('chart-color').value,$('chart-size').value,'chart-tooltip');
    if(state.tab==='guide' && !$('guide').childElementCount) renderGuide();
    const empty = list.length === 0 && state.tab !== 'guide';
    $('empty-state').hidden=!empty;
    if(empty){$('empty-heading').textContent=state.compare&&starCount()===0?'Your shortlist starts here.':'No fonts match these filters.';$('empty-copy').textContent=state.compare&&starCount()===0?'Star fonts in the full list, then compare them here.':'Clear or change a filter to see more families.';}
  }
  function openFont(name) {
    clearFilters(false); state.tab='gallery'; state.compare=false; $('search').value=name; state.openAbout.add(name); render();
    $('panel-gallery').scrollIntoView({behavior:'smooth'});
  }
  function openGuide(key) {
    state.tab='guide'; render();
    const target = $(`guide-${key}`.replace(/\W+/g,'-'));
    (target || $('guide')).scrollIntoView({behavior:'smooth', block:'start'});
    target?.classList.add('flash'); setTimeout(()=>target?.classList.remove('flash'),1600);
  }

  // ---------- Saved views ----------
  function updateSavedViews(){const s=$('saved-views'),old=s.value;s.replaceChildren();option(s,'','Choose a saved view');const views=liveViews();Object.keys(views).sort().forEach(k=>option(s,k,k));s.value=old in views?old:'';}
  function snapshot(){return {tab:state.tab,compare:state.compare,filters:state.filters,tags:[...state.tags],sort:state.sort,direction:state.direction,weight:$('weight').value,search:$('search').value,controls:Object.fromEntries([...filterIds,'chart-x','chart-y','chart-color','chart-size','pca-color'].map(id=>[id,$(id).value]))};}
  function restore(s){
    state.tab=tabs.includes(s.tab)?s.tab:'gallery';state.compare=!!s.compare;state.filters=Array.isArray(s.filters)?s.filters.filter(f=>fieldMap[f.field]):[];
    state.tags=new Set((s.tags||[]).filter(t=>meta.tagOrder.includes(t)));
    state.sort=fieldMap[s.sort]?s.sort:'family';state.direction=s.direction==='desc'?'desc':'asc';$('weight').value=s.weight||'400';$('search').value=s.search||'';
    const controls = s.controls || {};
    if ('category-filter' in controls) { $('category-filter').value = controls['category-filter']; updateSubtypeOptions(); }
    for(const [id,v] of Object.entries(controls))if($(id)&&[...($(id).options||[{value:v}])].some(o=>o.value===v))$(id).value=v;
    $('sort-field').value=state.sort;$('sort-direction').value=state.direction;render();
  }
  function clearFilters(doRender=true){state.filters=[];state.tags.clear();state.compare=false;$('search').value='';filterIds.forEach(id=>{$(id).value=id==='tag-mode'?'any':'';});updateSubtypeOptions();if(doRender)render();}

  // ---------- Sync through a private GitHub Gist ----------
  const sync = {token: read(tokenKey), gist: read(gistKey), timer: null, busy: false, again: false, last: null};
  const api = (path, opts={}) => fetch(`https://api.github.com${path}`, {...opts, headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${sync.token}`, ...(opts.body ? {'Content-Type': 'application/json'} : {})}})
    .then(async r => { if (!r.ok) { const e = new Error(`GitHub ${r.status}`); e.status = r.status; throw e; } return r.status === 204 ? null : r.json(); });
  function setSyncStatus(text, tone='') { $('sync-status').textContent = text; $('sync-status').dataset.tone = tone; }
  function renderSyncControls() {
    const on = !!sync.token;
    $('sync-connect').hidden = on;
    for (const id of ['sync-now','sync-link','sync-disconnect']) $(id).hidden = !on;
    if (!on) setSyncStatus('Not connected. Stars and views are saved in this browser only.');
  }
  async function findGist() {
    if (sync.gist) return sync.gist;
    for (let page = 1; page <= 10; page++) {
      const list = await api(`/gists?per_page=100&page=${page}`);
      const hit = list.find(g => g.files && g.files[syncFile]);
      if (hit) return hit.id;
      if (list.length < 100) break;
    }
    const created = await api('/gists', {method: 'POST', body: JSON.stringify({description: 'Mac Font Explorer sync (stars and saved views)', public: false, files: {[syncFile]: {content: JSON.stringify(doc, null, 1)}}})});
    return created.id;
  }
  async function runSync() {
    if (!sync.token) return;
    if (sync.busy) { sync.again = true; return; }
    sync.busy = true; setSyncStatus('Syncing…');
    try {
      sync.gist = await findGist(); write(gistKey, sync.gist);
      const gist = await api(`/gists/${sync.gist}`);
      const file = gist.files[syncFile];
      let remote = emptyDoc();
      if (file) {
        const text = file.truncated ? await fetch(file.raw_url).then(r => r.text()) : file.content;
        try { const parsed = JSON.parse(text); if (parsed?.version === 3) remote = parsed; } catch (_) {}
      }
      const merged = mergeDocs(doc, remote);
      const localChanged = !sameDoc(merged, doc), remoteChanged = !sameDoc(merged, remote);
      if (localChanged) { doc = merged; write(storeKey, JSON.stringify(doc)); applyDoc(); }
      if (remoteChanged) await api(`/gists/${sync.gist}`, {method: 'PATCH', body: JSON.stringify({files: {[syncFile]: {content: JSON.stringify(doc, null, 1)}}})});
      sync.last = new Date();
      setSyncStatus(`Synced ${sync.last.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})} · ${starCount()} stars · ${Object.keys(liveViews()).length} views`, 'ok');
    } catch (e) {
      if (e.status === 401) { setSyncStatus('GitHub rejected the token. Reconnect with a new token that has the “gist” scope.', 'error'); }
      else if (e.status === 404) { sync.gist = null; write(gistKey, null); setSyncStatus('Sync gist not found. It will be recreated on the next sync.', 'error'); }
      else setSyncStatus(`Offline or GitHub unavailable. Changes are saved here and will sync later. (${e.message})`, 'error');
    } finally {
      sync.busy = false;
      if (sync.again) { sync.again = false; runSync(); }
    }
  }
  function scheduleSync() { if (!sync.token) return; clearTimeout(sync.timer); sync.timer = setTimeout(runSync, 1200); }
  function applyDoc() {
    if ([...$('weight').options].some(o => o.value === doc.weight.v)) $('weight').value = doc.weight.v;
    updateSavedViews(); render();
  }
  function connect(token, gist) {
    sync.token = token.trim(); write(tokenKey, sync.token);
    if (gist) { sync.gist = gist; write(gistKey, gist); }
    renderSyncControls(); runSync();
  }
  // Setup links carry the token in the URL fragment, which browsers never send to servers.
  (function acceptSetupLink() {
    const m = location.hash.match(/^#sync=([A-Za-z0-9_\-]+)$/);
    if (!m) return;
    try {
      const {t, g} = JSON.parse(atob(m[1].replace(/-/g,'+').replace(/_/g,'/')));
      if (t) connect(t, g);
    } catch (_) {}
    history.replaceState(null, '', location.pathname + location.search);
  })();
  $('sync-connect-button').addEventListener('click', () => { const t = $('sync-token').value.trim(); if (!t) { $('sync-token').focus(); return; } $('sync-token').value=''; connect(t); });
  $('sync-token').addEventListener('keydown', e => { if (e.key === 'Enter') $('sync-connect-button').click(); });
  $('sync-now').addEventListener('click', runSync);
  $('sync-disconnect').addEventListener('click', () => { sync.token = null; sync.gist = null; write(tokenKey, null); write(gistKey, null); renderSyncControls(); });
  $('sync-link').addEventListener('click', async () => {
    const payload = btoa(JSON.stringify({t: sync.token, g: sync.gist})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const base = location.protocol === 'file:' ? 'https://cornishandy.github.io/mac-font-explorer/' : location.origin + location.pathname;
    const url = `${base}#sync=${payload}`;
    try { await navigator.clipboard.writeText(url); setSyncStatus('Setup link copied. AirDrop or message it to your phone and open it once. It contains your gist token, so keep it private.', 'ok'); }
    catch (_) { window.prompt('Copy this link and open it on your phone (keep it private: it contains your token):', url); }
  });
  $('export-state').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(doc, null, 1)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mac-font-explorer-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  });
  $('import-state').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { const incoming = JSON.parse(await file.text()); if (incoming?.version !== 3) throw new Error('not a backup'); doc = mergeDocs(doc, incoming); commit(); applyDoc(); $('view-message').textContent = 'Backup merged'; }
    catch (_) { $('view-message').textContent = 'That file isn’t a Mac Font Explorer backup.'; }
    e.target.value = '';
  });
  window.addEventListener('focus', () => { if (sync.token && (!sync.last || Date.now() - sync.last > 15000)) runSync(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sync.token) runSync(); });
  setInterval(() => { if (sync.token && document.visibilityState === 'visible') runSync(); }, 120000);
  // Another tab on this device changed the state.
  window.addEventListener('storage', e => { if (e.key === storeKey && e.newValue) { try { doc = JSON.parse(e.newValue); applyDoc(); } catch (_) {} } });

  // ---------- Events ----------
  populate();
  renderSyncControls();
  // Phones start with the long filter panel folded away so the fonts come first.
  const controls = document.querySelector('.dashboard-controls');
  function setControls(open) { controls.classList.toggle('is-collapsed', !open); $('toggle-controls').setAttribute('aria-expanded', String(open)); $('toggle-controls').textContent = open ? 'Hide filters & sync' : 'Show filters & sync'; }
  setControls(!matchMedia('(max-width: 700px)').matches);
  $('toggle-controls').addEventListener('click', () => setControls(controls.classList.contains('is-collapsed')));
  $('search').addEventListener('input',render);
  $('weight').addEventListener('change',()=>{doc.weight={v:$('weight').value,t:Date.now()};commit();render();});
  $('all-button').addEventListener('click',()=>{state.compare=false;render();});$('compare-button').addEventListener('click',()=>{state.compare=true;render();});
  for(const tab of tabs)$(`tab-${tab}`).addEventListener('click',()=>{state.tab=tab;render();});
  for(const id of filterIds)$(id).addEventListener(rangeIds.includes(id)?'input':'change',()=>{if(id==='category-filter')updateSubtypeOptions();render();});
  for(const id of ['chart-x','chart-y','chart-color','chart-size','pca-color'])$(id).addEventListener('change',render);
  $('field-filter').addEventListener('change',updateOperators);
  $('add-filter').addEventListener('click',()=>{const field=$('field-filter').value,op=$('operator-filter').value,input=$('value-filter').value.trim();if(!['missing','present'].includes(op)&&!input)return; if(fieldMap[field].type==='number'&&!['missing','present'].includes(op)&&!Number.isFinite(Number(input)))return;state.filters.push({field,op,input});$('value-filter').value='';render();});
  $('value-filter').addEventListener('keydown',e=>{if(e.key==='Enter')$('add-filter').click();});
  $('active-filters').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b){state.filters.splice(Number(b.dataset.remove),1);render();}});
  $('tag-chips').addEventListener('click',e=>{const b=e.target.closest('[data-tag]');if(!b)return;const t=b.dataset.tag;state.tags.has(t)?state.tags.delete(t):state.tags.add(t);render();});
  $('clear-filters').addEventListener('click',()=>clearFilters());$('empty-action').addEventListener('click',()=>clearFilters());
  document.addEventListener('toggle',e=>{const d=e.target;if(d.dataset?.about){d.open?state.openAbout.add(d.dataset.about):state.openAbout.delete(d.dataset.about);}},true);
  document.addEventListener('click',e=>{
    const star=e.target.closest('.star-button');
    if(star){const name=star.dataset.font;doc.stars[name]={on:!starred(name),t:Date.now()};commit();render();return;}
    const sort=e.target.closest('[data-sort]');
    if(sort){const key=sort.dataset.sort;state.direction=state.sort===key&&state.direction==='asc'?'desc':'asc';state.sort=key;$('sort-field').value=key;$('sort-direction').value=state.direction;render();return;}
    const addTag=e.target.closest('[data-add-tag]');
    if(addTag){state.tags.add(addTag.dataset.addTag);render();$('tag-chips').scrollIntoView({behavior:'smooth',block:'center'});return;}
    const guide=e.target.closest('[data-guide]');
    if(guide){openGuide(guide.dataset.guide);return;}
    const open=e.target.closest('[data-open]');
    if(open){openFont(open.dataset.open);}
  });
  $('sort-field').addEventListener('change',()=>{state.sort=$('sort-field').value;render();});$('sort-direction').addEventListener('change',()=>{state.direction=$('sort-direction').value;render();});
  $('save-view').addEventListener('click',()=>{const name=$('view-name').value.trim();if(!name){$('view-message').textContent='Enter a view name first.';$('view-name').focus();return;}doc.views[name]={data:snapshot(),t:Date.now()};commit();updateSavedViews();$('saved-views').value=name;$('view-name').value='';$('view-message').textContent=`Saved “${name}”`;});
  $('view-name').addEventListener('keydown',e=>{if(e.key==='Enter')$('save-view').click();});
  $('load-view').addEventListener('click',()=>{const name=$('saved-views').value;const v=liveViews()[name];if(!v)return;restore(v.data);$('view-message').textContent=`Loaded “${name}”`;});
  $('delete-view').addEventListener('click',()=>{const name=$('saved-views').value;if(!liveViews()[name])return;doc.views[name]={deleted:true,t:Date.now()};commit();updateSavedViews();$('view-message').textContent=`Deleted “${name}”`;});
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}});
  if (read(storeKey) == null) write(storeKey, JSON.stringify(doc));
  render();
  if (sync.token) runSync();
})();
