// jsdom smoke test: the survey worksheet's EDITABLE Parent (REL_parent field_2416, 2026-10-28).
// "These items show up as orphaned on the SVS side and I don't have a way to relink." The survey
// card's connection column now leads with a Parent picker on every default-category row that is
// not Networking / Headend (and always once a parent exists). The generic parent branch in
// init.js serves it: candidates are the survey's primary items (never an accessory, never the row
// itself), grouped by the survey's OWN MDF/IDF field; a pick writes the child's pointer (the
// picker's PUT), carries the parent's Bid + MDF/IDF onto the accessory (accessoryFollow) and
// writes NOTHING on the parents — the survey object has no forward children list. The SOW pair
// keeps its forward-list rewrite + SOW/MDF inherit.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#site-survey/site-survey-request-details/6a0000000000000000000001' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.MutationObserver = window.MutationObserver;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; },
  find() { return jqObj; }, ajaxError() { return jqObj; }, length: 0 };
jq.fn = {};
jq.Deferred = function () {
  let state = 'pending', value; const cbs = [];
  const d = {
    resolve(v) { if (state === 'pending') { state = 'resolved'; value = v; cbs.splice(0).forEach(f => f(v)); } return d; },
    reject() { return d; }, promise() { return d; },
    then(ok) { const n = jq.Deferred(); const run = v => n.resolve(ok ? ok(v) : v); if (state === 'resolved') run(value); else cbs.push(run); return n.promise(); }
  };
  return d;
};
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

const CAM = '6481e5ba38f283002898113c', MOUNT = '594a94536877675816984cb9', NET = '647953bb54b4e1002931ed97';
const SVC = '6977caa7f246edf67b52cbcd';
const conn = (id, name) => [{ id, identifier: name }];
const MDF = conn('L1', 'MDF - Clubhouse'), MDF2 = conn('L2', 'IDF: 02: CR6');
// Survey Line Item records (view_3505 keys). b3 is the orphan: its parent is not on this survey.
const survey = [
  { id: 'c1', field_2379: 'Deputy 8.0 v5', field_2365: 'E-001', field_2399: 1, field_2366_raw: conn(CAM, 'Camera / Reader'), field_2375_raw: MDF, field_2218: 10, field_2416_raw: [], field_2415_raw: conn('bidA', 'BD-1') },
  { id: 'c2', field_2379: 'Dell Pro Micro Desktop Computer', field_2365: '', field_2399: 1, field_2366_raw: conn('5df12ce036f91b0015404d78', 'Other Equipment'), field_2375_raw: MDF2, field_2218: 30, field_2416_raw: [], field_2415_raw: conn('bidA', 'BD-1').concat(conn('bidB', 'BD-2')) },
  { id: 'b1', field_2379: 'Wall Mount Bracket', field_2399: 1, field_2366_raw: conn(MOUNT, 'Mounting Hardware'), field_2375_raw: MDF, field_2218: 40, field_2478: 'No', field_2478_raw: false, field_2416_raw: conn('c1', 'E-001'), field_2415_raw: conn('bidA', 'BD-1') },
  { id: 'b3', field_2379: '[SPECIAL ORDER] 26" to 55" Monitor Wall Mount', field_2399: 1, field_2366_raw: conn(MOUNT, 'Mounting Hardware'), field_2375_raw: MDF2, field_2218: 40, field_2478: 'Yes', field_2478_raw: true, field_2416_raw: conn('gone', 'E-099'), field_2415_raw: conn('bidA', 'BD-1') },
  { id: 'n1', field_2379: 'Imperial NVR 16ch', field_2365: 'NVR', field_2399: 1, field_2366_raw: conn(NET, 'Networking'), field_2375_raw: MDF, field_2218: 1, field_2416_raw: [] },
  { id: 'n2', field_2379: 'PoE injector', field_2365: '', field_2399: 1, field_2366_raw: conn(NET, 'Networking'), field_2375_raw: MDF, field_2218: 1, field_2416_raw: conn('n1', 'NVR') },
  { id: 's1', field_2379: 'Programming service', field_2399: 1, field_2366_raw: conn(SVC, 'Other Services'), field_2218: 50, field_2416_raw: [] },
  { id: 'x1', field_2379: 'Patch panel', field_2399: 1, field_2366_raw: conn('5df12ce036f91b0015404d78', 'Other Equipment'), field_2218: 30, field_2416_raw: [] }   // no MDF/IDF
];
// SOW line items (view_3962 keys) — the regression check for the SOW pair.
const sow = [
  { id: 'sc1', field_1949: 'Deputy 8.0 v5', field_1950: 'E-001', field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: MDF, field_2154_raw: conn('sowX', '1589'), field_2464_raw: [], field_2207_raw: [] },
  { id: 'sb1', field_1949: 'Wall Mount Bracket', field_1964: 1, field_2219_raw: conn(MOUNT, 'Mounting Hardware'), field_1946_raw: MDF2, field_2154_raw: [], field_2464_raw: [] }
];
const byView = { view_3505: survey, view_3962: sow };
const models = recs => ({ model: { data: {
  get(id) { const a = recs.find(r => r.id === id); return a ? { attributes: a, set(o) { Object.assign(a, o); } } : null; },
  toJSON() { return recs; }, models: recs.map(r => ({ id: r.id, attributes: r }))
} } });
const refetched = [], notified = [], ajax = [];
window.Knack = { views: { view_3505: models(survey), view_3962: models(sow) }, router: { current_scene_key: 'scene_1140' } };
global.Knack = window.Knack;
window.SCW = {
  CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {}, isInternalUser() { return true; },
  knackRecordUrl(v, id) { return '/v/' + v + '/' + id; },
  knackAjax(o) { ajax.push({ url: o.url, type: o.type, body: o.data ? JSON.parse(o.data) : null }); if (o.success) o.success({ record: {} }); }
};
global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js', 'warnings.js', 'bulk.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
ns.data = {
  readRecords: v => byView[v] || [], subscribe() {}, attachListeners() {}, subscribeRendered() {},
  refetchAndNotify: v => refetched.push(v), notify: v => notified.push(v)
};
let opened = null;
ns.picker = { open: o => { opened = o; } };
// init.js: load with its deferred mount attempt neutralised (no worksheet DOM here).
const realTimeout = window.setTimeout;
window.setTimeout = function () {}; global.setTimeout = window.setTimeout;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/init.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
window.setTimeout = realTimeout; global.setTimeout = realTimeout;

let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const parentBtn = (recs, id, view) => ns.card.buildCard(recs.find(r => r.id === id), view).querySelector('[data-scw-ws-v2-conn="' + (view === 'view_3505' ? 'field_2416' : 'field_2464') + '"]');

// ── the card ──
const b3btn = parentBtn(survey, 'b3', 'view_3505');
ok(!!b3btn && b3btn.getAttribute('data-scw-ws-v2-conn-label') === 'Parent' && b3btn.getAttribute('data-scw-ws-v2-view') === 'view_3505',
  'orphaned accessory: the survey card carries an editable Parent picker (field_2416, writes through view_3505)');
ok(/E-099/.test(b3btn.textContent), 'the picker shows the parent the record names today (E-099, not on this survey)');
ok(!!parentBtn(survey, 'b1', 'view_3505'), 'a linked accessory shows it too (so it can be re-pointed)');
ok(!!parentBtn(survey, 'c2', 'view_3505'), 'an Other Equipment row shows it (the SOW rule: any default-category row that is not networking)');
ok(!parentBtn(survey, 'c1', 'view_3505'), 'a camera never shows it');
ok(!parentBtn(survey, 'n1', 'view_3505'), 'a networking row with no parent does not');
ok(!!parentBtn(survey, 'n2', 'view_3505'), '…but once it has one it does (to clear it)');
ok(!parentBtn(survey, 's1', 'view_3505'), 'a service does not');
const b3card = ns.card.buildCard(survey.find(r => r.id === 'b3'), 'view_3505');
const connCol = b3card.querySelector('.scw-ws-v2-sd-group--conn');
const labels = connCol ? [...connCol.querySelectorAll('.scw-ws-v2-detail-label')].map(l => l.textContent.trim()) : [];
ok(labels[0] === 'Parent' && /MDF/.test(labels[1] || ''), 'Parent sits first in the connection column, MDF / IDF under it (' + labels.join(' | ') + ')');

// ── the picker the button opens ──
document.body.appendChild(b3card);
b3card.querySelector('[data-scw-ws-v2-conn="field_2416"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
ok(!!opened && opened.fieldKey === 'field_2416' && opened.putViewKey === 'view_3505' && opened.sourceViewKey === 'view_3505' &&
   opened.recordId === 'b3' && opened.multi === false && opened.label === 'Parent',
  'click → the picker opens on field_2416 for b3, single-select, PUT through view_3505');
ok(opened && JSON.stringify((opened.selectedIds || []).slice()) === '["gone"]', 'pre-selected: the parent it names today');
const candIds = opened ? opened.candidates.map(r => r.id).sort() : [];
ok(JSON.stringify(candIds) === JSON.stringify(['c1', 'c2', 'n1', 's1', 'x1']),
  'candidates = every primary survey item: not the row itself, not the accessories (b1, n2) (' + candIds.join(',') + ')');
ok(typeof opened.groupBy === 'function' &&
   JSON.stringify(opened.groupBy(survey[0])) === JSON.stringify({ id: 'L1', label: 'MDF - Clubhouse' }) &&
   JSON.stringify(opened.groupBy(survey.find(r => r.id === 'c2'))) === JSON.stringify({ id: 'L2', label: 'IDF: 02: CR6' }) &&
   opened.groupBy(survey.find(r => r.id === 'x1')).id === '__unknown',
  'grouped by the SURVEY MDF/IDF field (field_2375), no-MDF items sink to "No MDF / IDF"');
ok(opened.itemLabel(survey[0]) === 'E-001 · Deputy 8.0 v5' && opened.itemLabel(survey.find(r => r.id === 'c2')) === 'Dell Pro Micro Desktop Computer',
  'items read "label · product", product alone when the label is blank');

// ── a pick: the child's pointer is the picker's own PUT; the accessory takes the parent's Bid + MDF/IDF; nothing on the parents ──
ajax.length = 0; refetched.length = 0; notified.length = 0;
opened.onSaved(['c2']);
ok(ajax.length === 1 && ajax[0].type === 'PUT' && ajax[0].url === '/v/view_3505/b3',
  'exactly one write after the pick, on the accessory (' + ajax.map(a => a.url).join(', ') + ')');
ok(ajax[0] && JSON.stringify(ajax[0].body) === JSON.stringify({ field_2415: ['bidA', 'bidB'], field_2375: ['L2'] }),
  'it carries the parent\'s Bid + MDF/IDF onto the accessory (accessoryFollow: bid, mdfIdf) — ' + JSON.stringify(ajax[0] && ajax[0].body));
ok(!ajax.some(a => a.url === '/v/view_3505/c2' || a.url === '/v/view_3505/gone'), 'no forward-list write on the new or old parent (the survey object has none)');
const b3 = survey.find(r => r.id === 'b3');
ok(b3.field_2416_raw[0].id === 'c2' && b3.field_2375_raw[0].id === 'L2' && b3.field_2415_raw.length === 2,
  'the local model is patched (pointer, MDF/IDF, bids) so the card regroups before the refetch');
ok(notified[0] === 'view_3505' && refetched[0] === 'view_3505', 'immediate re-render, then a refetch of view_3505 once the write lands');

// ── clearing the parent writes nothing extra ──
ajax.length = 0;
opened.onSaved([]);
ok(ajax.length === 0 && b3.field_2416_raw.length === 0, 'clearing the parent: no inherit write, pointer cleared locally');

// ── regression: the SOW pair is unchanged (forward list rewrite + SOW/MDF inherit) ──
window.Knack.router.current_scene_key = 'scene_1085';
opened = null;
const sbCard = ns.card.buildCard(sow[1], 'view_3962');
document.body.appendChild(sbCard);
const sbBtn = sbCard.querySelector('[data-scw-ws-v2-conn="field_2464"]');
ok(!!sbBtn, 'SOW accessory card still carries its Parent picker');
sbBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
ok(!!opened && opened.fieldKey === 'field_2464' && opened.groupBy === undefined, 'SOW: field_2464, the picker\'s default MDF grouping (field_1946)');
ajax.length = 0;
opened.onSaved(['sc1']);
const urls = ajax.map(a => a.url + ' ' + JSON.stringify(a.body));
ok(ajax.length === 2 && ajax.some(a => a.url === '/v/view_3962/sb1' && JSON.stringify(a.body) === JSON.stringify({ field_2154: ['sowX'], field_1946: ['L1'] })),
  'SOW: the accessory inherits the parent\'s SOW + MDF/IDF exactly as before (' + urls.join(' ; ') + ')');
ok(ajax.some(a => a.url === '/v/view_3962/sc1' && JSON.stringify(a.body) === JSON.stringify({ field_2207: ['sb1'] })),
  'SOW: the parent\'s forward list field_2207 is rewritten from the back-pointers, as before');

// ── un-parent (2026-10-28 "need to be able to also un-parent") ──
// A priced accessory has its own card: the picker's "(no selection)" row clears it (onSaved([])
// above). A folded (Require Sub Bid = No) accessory has NO card — its chip on the parent's
// Mounting Hardware line carries the unlink instead.
window.Knack.router.current_scene_key = 'scene_1140';
ns.idxGen = (ns.idxGen || 0) + 1;
const c1card = ns.card.buildCard(survey.find(r => r.id === 'c1'), 'view_3505');
const wrap = document.createElement('div'); wrap.id = 'scw-ws-v2-view_3505'; wrap.appendChild(c1card); document.body.appendChild(wrap);
const unlink = c1card.querySelector('[data-scw-ws-v2-mh-unlink="b1"]');
ok(!!unlink && unlink.getAttribute('data-scw-ws-v2-mh-uparent') === 'c1', 'the folded bracket\'s chip on its camera carries an unlink (b1 → c1)');
ok(!!c1card.querySelector('[data-scw-ws-v2-acc-chip="b1"] .scw-ws-v2-mh-chip--inert'), 'the chip itself stays inert (no edit link, no qty stepper, no delete)');
ajax.length = 0;
unlink.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
ok(ajax.length === 1 && ajax[0].type === 'PUT' && ajax[0].url === '/v/view_3505/b1' && JSON.stringify(ajax[0].body) === JSON.stringify({ field_2416: [] }),
  'click → one PUT clearing the bracket\'s field_2416 through view_3505 (' + ajax.map(a => a.url + ' ' + JSON.stringify(a.body)).join(' ; ') + ')');
ok(!ajax.some(a => a.url === '/v/view_3505/c1'), 'nothing written on the camera (no forward list on the survey)');
ok(survey.find(r => r.id === 'b1').field_2416_raw.length === 0, 'the local pointer is cleared, so the bracket regroups as an orphan card on the next render');
ok(!c1card.querySelector('[data-scw-ws-v2-acc-chip="b1"]'), 'the chip is dropped from the card at once');
ok(opened && opened.allowClear !== false, 'the Parent picker keeps its "(no selection)" row, so a priced accessory\'s own card can un-parent too');

// Install surfaces keep inert chips (no accessoryRelink): same builder, no unlink.
ns.idxGen = (ns.idxGen || 0) + 1;
const install = [
  { id: 'i1', field_2790: 'Deputy 8.0 v5', field_2801: 'I-001', field_2822_raw: conn(CAM, 'Camera / Reader'), field_2818_raw: MDF, field_2218: 2 },
  { id: 'ia', field_2790: 'Wall Mount Bracket', field_2822_raw: conn(MOUNT, 'Mounting Hardware'), field_2818_raw: MDF, field_2218: 4, field_2853_raw: conn('i1', 'I-001') }
];
byView.view_4093 = install;
window.Knack.router.current_scene_key = 'scene_1311';
let iCard = null, iErr = '';
try { iCard = ns.card.buildCard(install[0], 'view_4093'); } catch (e) { iErr = String(e && e.message || e); }
ok(!!iCard && !!iCard.querySelector('[data-scw-ws-v2-acc-chip="ia"]') && !iCard.querySelector('[data-scw-ws-v2-mh-unlink]'),
  'install card: the attached bracket\'s chip has no unlink (accessoryRelink is survey-only)' + (iErr ? ' — threw: ' + iErr : ''));

// The SOW chip unlink is unchanged: clears field_2464, then rewrites the parent's field_2207.
window.Knack.router.current_scene_key = 'scene_1085';
ns.idxGen = (ns.idxGen || 0) + 1;
const sc1card = ns.card.buildCard(sow[0], 'view_3962');
const swrap = document.createElement('div'); swrap.id = 'scw-ws-v2-view_3962'; swrap.appendChild(sc1card); document.body.appendChild(swrap);
const sUnlink = sc1card.querySelector('[data-scw-ws-v2-mh-unlink="sb1"]');
ok(!!sUnlink, 'SOW card: the accessory chip carries its unlink as before');
ajax.length = 0;
sUnlink.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
ok(ajax.length === 2 && ajax[0].url === '/v/view_3962/sb1' && JSON.stringify(ajax[0].body) === JSON.stringify({ field_2464: [] }) &&
   ajax[1].url === '/v/view_3962/sc1' && JSON.stringify(ajax[1].body) === JSON.stringify({ field_2207: [] }),
  'SOW: clears field_2464 on the accessory, then rewrites the parent\'s forward list field_2207 (' + ajax.map(a => a.url + ' ' + JSON.stringify(a.body)).join(' ; ') + ')');

console.log('RESULT ' + (n - fails) + '/' + n + (fails ? ' FAILED' : ' passed'));
process.exit(fails ? 1 : 0);
