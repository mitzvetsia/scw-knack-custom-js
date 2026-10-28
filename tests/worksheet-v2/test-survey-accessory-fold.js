// jsdom smoke test: the sub's survey worksheet (view_3505) reads REL_parent (field_2416,
// child → parent, 2026-10-28). Make now copies brackets onto surveys and links each to its
// parent's survey item; without the mapping every bracket landed in "Orphaned Accessories".
// A Require Sub Bid = No accessory folds under its parent, a priced one sits beside it (in the
// parent's MDF/IDF), one whose parent is not loaded is an orphan. The catalog's
// wrong-accessory flag stays off the sub's page (noAccessories), and a Bid or MDF/IDF edit on a
// parent (bulk or the card's pickers) carries its accessories along (accessoryFollow) — on the
// SOW worksheet only the SOW does.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#survey/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {};
jq.Deferred = function () {   // just enough of jQuery's Deferred for bulk.js runQueue
  let state = 'pending', value; const cbs = [];
  const d = {
    resolve(v) { if (state === 'pending') { state = 'resolved'; value = v; cbs.splice(0).forEach(f => f(v)); } return d; },
    reject() { return d; },
    promise() { return d; },
    then(ok) {
      const n = jq.Deferred();
      const run = v => n.resolve(ok ? ok(v) : v);
      if (state === 'resolved') run(value); else cbs.push(run);
      return n.promise();
    }
  };
  return d;
};
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1140' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js', 'warnings.js', 'bulk.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
const CAM = '6481e5ba38f283002898113c', MOUNT = '594a94536877675816984cb9';
const conn = (id, name) => [{ id, identifier: name }];
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

// ── survey records (Survey Line Item keys) ────────────────────────────────
const MDF = conn('L1', 'MDF - Clubhouse');
const survey = [
  { id: 'c1', field_2379: 'Deputy 8.0 v5', field_2365: 'E-001', field_2399: 1, field_2366_raw: conn(CAM, 'Camera / Reader'), field_2375_raw: MDF, field_2218: 10, field_2416_raw: [], field_2415_raw: conn('bidA', 'BD-1') },
  // folded: Require Sub Bid = No, parent loaded
  { id: 'b1', field_2379: 'Wall Mount Bracket', field_2399: 1, field_2366_raw: conn(MOUNT, 'Mounting Hardware'), field_2375_raw: MDF, field_2218: 40, field_2478: 'No', field_2478_raw: false, field_2416_raw: conn('c1', 'E-001'), field_2415_raw: conn('bidA', 'BD-1') },
  // promoted: priced (Require Sub Bid = Yes), no MDF/IDF of its own — sits in the parent's
  { id: 'b2', field_2379: 'Pole Mount Adapter', field_2399: 1, field_2366_raw: conn(MOUNT, 'Mounting Hardware'), field_2218: 40, field_2478: 'Yes', field_2478_raw: true, field_2416_raw: conn('c1', 'E-001'), field_2415_raw: conn('bidA', 'BD-1') },
  // orphan: names a parent that is not on this survey
  { id: 'b3', field_2379: 'Junction Box', field_2399: 1, field_2366_raw: conn(MOUNT, 'Mounting Hardware'), field_2375_raw: MDF, field_2218: 40, field_2478: 'No', field_2478_raw: false, field_2416_raw: conn('gone', 'E-099'), field_2415_raw: conn('bidA', 'BD-1') }
];
const fields = ns.cfg.fields('view_3505');
check('view_3505 maps REL_parent; no forward children list', [fields.parent, fields.children || null], ['field_2416', null]);

function idsByL1(tree) {
  const out = {};
  for (const l1 of tree) {
    const ids = [];
    (function walk(node) {
      for (const k of ['records', 'items', 'rows']) if (Array.isArray(node[k])) node[k].forEach(r => r && r.id && ids.push(r.id));
      for (const k of ['l2', 'l2s', 'children', 'groups']) if (Array.isArray(node[k])) node[k].forEach(walk);
    })(l1);
    out[l1.label] = ids.sort();
  }
  return out;
}
const tree = ns.groups.buildGroupTree(survey, [], { viewKey: 'view_3505', fields });
check('the No-sub-bid bracket folds under its camera; the priced one sits in the camera\'s MDF/IDF; the unparented one is an orphan',
  idsByL1(tree), { 'MDF - Clubhouse': ['b2', 'c1'], 'Orphaned Accessories': ['b3'] });

// Without the column (field_2416 absent on every record) every bracket is an orphan — the Builder step.
const noCol = survey.map(r => { const c = Object.assign({}, r); delete c.field_2416_raw; return c; });
const tree2 = ns.groups.buildGroupTree(noCol, [], { viewKey: 'view_3505', fields });
check('no field_2416 column on view_3505 → all three brackets read as orphans',
  idsByL1(tree2)['Orphaned Accessories'], ['b1', 'b2', 'b3']);

// ── the camera's Mounting Hardware line shows its linked accessories ──────
const withText = survey.map(r => r.id === 'c1' ? Object.assign({}, r, { field_2463: 'wall mount bracket' }) : r)
  .concat([{ id: 'c2', field_2379: 'Warrior 8.0', field_2365: 'E-002', field_2399: 1, field_2366_raw: conn(CAM, 'Camera / Reader'),
    field_2375_raw: MDF, field_2416_raw: [], field_2463: 'corner mount bracket' }]);
ns.data = { readRecords: () => withText };
ns.idxGen = (ns.idxGen || 0) + 1;
const mhOf = id => {
  const card = ns.card.buildCard(withText.find(r => r.id === id), 'view_3505');
  const field = [...card.querySelectorAll('.scw-ws-v2-detail-label')].find(l => /Mounting Hardware/.test(l.textContent));
  const box = field && field.parentNode;
  return box ? [...box.querySelectorAll('.scw-ws-v2-mh-chip')].map(c => c.textContent.trim()).concat(
    box.querySelector('.scw-ws-v2-mh-chip') ? [] : [box.textContent.replace('Mounting Hardware', '').trim()]) : null;
};
check('E-001 lists its two linked brackets as chips (not the stored text); E-002, with none linked, keeps the stored text',
  [mhOf('c1').sort(), mhOf('c2')], [['Pole Mount Adapter', 'Wall Mount Bracket'], ['corner mount bracket']]);
check('the card signature carries the linked accessories, so a newly linked bracket repaints its camera',
  [ns.card.accessoriesSig(withText[0], 'view_3505'), ns.card.accessoriesSig(withText.find(r => r.id === 'c2'), 'view_3505')],
  ['b1,b2', '']);
delete ns.data;

// ── the catalog's wrong-accessory flag stays off the sub's page ───────────
window.SCW.catalog = { auditAccessories: () => ({ ready: true, ok: {}, wrong: { b1: 'c1' } }) };
const surveyIssues = ns.warnings.analyze(survey, 'view_3505');
check('view_3505 (noAccessories): no wrong-accessory flag on the camera', (surveyIssues.c1 || []).indexOf('bracket'), -1);
const sow = [
  { id: 'c1', field_1949: 'Deputy 8.0 v5', field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: MDF, field_2464_raw: [] },
  { id: 'b1', field_1949: 'Wall Mount Bracket', field_1964: 1, field_2219_raw: conn(MOUNT, 'Mounting Hardware'), field_1946_raw: MDF, field_2479_raw: false, field_2464_raw: conn('c1', 'E-001') }
];
const sowIssues = ns.warnings.analyze(sow, 'view_3962');
check('view_3962 (SOW worksheet): the same catalog answer still flags the camera', (sowIssues.c1 || []).indexOf('bracket') !== -1, true);
delete window.SCW.catalog;

// ── bulk edit: accessories follow the parent's Bid on the survey, the SOW elsewhere ──
const models = recs => ({ model: { data: { models: recs.map(r => ({ id: r.id, attributes: r })) } } });
window.Knack.views.view_3505 = models(survey);
let jobs = { 'view_3505|c1': { viewKey: 'view_3505', recordId: 'c1', body: { field_2415: ['bidB'] } } };
ns.bulk._propagateToAccessories(jobs, ['c1'], ['field_2415'], 'view_3505');
check('survey: a bulk Bid edit on the camera carries both its brackets; the orphan is untouched',
  Object.keys(jobs).sort().map(k => k + '=' + JSON.stringify(jobs[k].body.field_2415)),
  ['view_3505|b1=["bidB"]', 'view_3505|b2=["bidB"]', 'view_3505|c1=["bidB"]']);
jobs = { 'view_3505|c1': { viewKey: 'view_3505', recordId: 'c1', body: { field_2375: ['L2'] } } };
ns.bulk._propagateToAccessories(jobs, ['c1'], ['field_2375'], 'view_3505');
check('survey: a bulk MDF/IDF move on the camera moves both its brackets',
  Object.keys(jobs).sort().map(k => k + '=' + JSON.stringify(jobs[k].body.field_2375)),
  ['view_3505|b1=["L2"]', 'view_3505|b2=["L2"]', 'view_3505|c1=["L2"]']);
jobs = { 'view_3505|c1': { viewKey: 'view_3505', recordId: 'c1', body: { field_2399: 2 } } };
ns.bulk._propagateToAccessories(jobs, ['c1'], ['field_2399'], 'view_3505');
check('survey: a Qty edit on the camera does not touch its brackets', Object.keys(jobs), ['view_3505|c1']);

window.Knack.views.view_3962 = models(sow);
jobs = { 'view_3962|c1': { viewKey: 'view_3962', recordId: 'c1', body: { field_2154: ['sowB'], field_2415: ['bidB'] } } };
ns.bulk._propagateToAccessories(jobs, ['c1'], ['field_2154', 'field_2415'], 'view_3962');
check('SOW worksheet: the SOW still follows (via field_2464); a bid field is not on its follow list',
  jobs['view_3962|b1'] && jobs['view_3962|b1'].body, { field_2154: ['sowB'] });

// ── the per-row Bid picker: followParent PUTs the camera's new bids onto its accessories ──
const puts = [];
window.SCW.knackRecordUrl = (vk, id) => 'https://api.knack.com/v1/pages/scene_1140/views/' + vk + '/records/' + id;
window.SCW.knackAjax = o => { puts.push({ url: o.url, type: o.type, body: JSON.parse(o.data) }); o.success({ id: 'x' }); };
const withNote = survey.map(r => r.id === 'b2' ? Object.assign({}, r, { field_2412: 'priced separately', field_2412_raw: 'priced separately' }) : r);
ns.data = { readRecords: () => withNote };
window.Knack.views.view_3505 = models(withNote);
let settled = null;
ns.bulk.followParent('view_3505', 'c1', { field_2415: ['bidB'] }, { fieldKey: 'field_2412', text: '' }).then(r => { settled = r; });
check('per-row: a new bid set on the camera is PUT onto both brackets (through view_3505), nothing else',
  [settled && settled.length, puts.map(p => p.url.split('/records/')[1] + ' ' + JSON.stringify(p.body)).sort()],
  [2, ['b1 {"field_2415":["bidB"]}', 'b2 {"field_2415":["bidB"]}']]);
puts.length = 0;
ns.bulk.followParent('view_3505', 'c1', { field_2415: [] }, { fieldKey: 'field_2412', text: 'not in scope' });
check('per-row: clearing the camera\'s bid clears the brackets\' too, each PUT carrying a note (its own if it has one)',
  puts.map(p => p.url.split('/records/')[1] + ' ' + JSON.stringify(p.body)).sort(),
  ['b1 {"field_2415":[],"field_2412":"not in scope"}', 'b2 {"field_2415":[],"field_2412":"priced separately"}']);
puts.length = 0;
ns.bulk.followParent('view_3505', 'c1', { field_2375: ['L2'] }, null);
check('per-row: an MDF/IDF move on the camera moves both brackets, no note',
  puts.map(p => p.url.split('/records/')[1] + ' ' + JSON.stringify(p.body)).sort(),
  ['b1 {"field_2375":["L2"]}', 'b2 {"field_2375":["L2"]}']);
puts.length = 0;
settled = null;
ns.bulk.followParent('view_3505', 'c1', { field_2399: 3 }, null).then(r => { settled = r; });
check('per-row: a field off the follow list writes nothing', [puts.length, settled], [0, []]);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: all passed');
process.exit(fails ? 1 : 0);
