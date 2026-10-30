// jsdom smoke test: worksheet-v2/accessory-edit.js (2026-10-30, CO page) — "need to be able to edit the
// custom discount % and custom discount $ on child / accessory records — right now it's opening a knack
// native form. Can we just do a custom modal that pushes inline edits?" + "I also need to be able to bulk
// edit those accessories". The mounting-hardware chip on an opted-in view (config accessoryEdit: view_4079)
// opens a modal — facts, qty, Custom discount % / $ each / reason — whose Save is ONE view-based PUT of the
// changed fields; the bulk bar's "Edit accessories (N)" opens the same form over every accessory under the
// selected cards (a ticked list; blank = leave as is; 0 clears), one PUT per ticked accessory through a
// capped retry queue. A 200 that kept the old value is reported as "not applied".
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const nodeTimeout = global.setTimeout;   // Node's own timer — never hand jsdom's unbound setTimeout to the global
const PID = '69c4310cf4b1b33df77fa499', CO = '6a0000000000000000000c01';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/' + PID + '/change-order/' + CO });
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

const CAM = '6481e5ba38f283002898113c', MOUNT = '594a94536877675816984cb9';
const conn = (id, name) => [{ id, identifier: name }];
const MDF = conn('L1', 'MDF - Clubhouse');
// CO line items (view_4079 = the SOW line item object): two cameras, three accessories under them.
const acc = (id, name, parent, extra) => Object.assign({
  id, field_1949: name, field_1950: name + ' (MDF)', field_1964: 1, field_1964_raw: 1, field_2219_raw: conn(MOUNT, 'Mounting Hardware'),
  field_1946_raw: MDF, field_2154_raw: conn(CO, '1781CO'), field_2464_raw: conn(parent, 'E-00' + parent.slice(-1)),
  field_1960: '$25.00', field_1960_raw: 25, field_2261: '', field_2261_raw: '', field_2262: '', field_2262_raw: '', field_2263: '',
  field_2303_raw: 0, field_2268_raw: 25, field_2269_raw: 25, field_2230: 'No', field_2230_raw: false
}, extra || {});
const co = [
  { id: 'p1', field_1949: 'Deputy 8.0 v5', field_1950: 'E-001', field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: MDF, field_2154_raw: conn(CO, '1781CO'), field_2464_raw: [], field_2207_raw: [], field_1960_raw: 300 },
  { id: 'p2', field_1949: 'Bullet 8MP', field_1950: 'E-002', field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: MDF, field_2154_raw: conn(CO, '1781CO'), field_2464_raw: [], field_2207_raw: [], field_1960_raw: 300 },
  acc('a1', 'Electrical Box Mount for The Detective', 'p1', { field_1964: 2, field_1964_raw: 2, field_2261: '10%', field_2261_raw: 10, field_2303_raw: 5, field_2268_raw: 22.5, field_2269_raw: 45 }),
  acc('a2', 'Junction Box', 'p1', { field_2230: 'Yes', field_2230_raw: true }),
  acc('a3', 'Pole Mount', 'p2')
];
// The sales SOW view: the same object, NOT opted in — the chip keeps its plain link.
const sow = [
  { id: 's1', field_1949: 'Deputy 8.0 v5', field_1950: 'E-001', field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: MDF, field_2154_raw: conn('sowX', '1589'), field_2464_raw: [], field_2207_raw: [] },
  acc('sb1', 'Wall Mount Bracket', 's1', { field_2154_raw: conn('sowX', '1589') })
];
const byView = { view_4079: co, view_3962: sow };
const models = recs => ({ model: { data: {
  get(id) { const a = recs.find(r => r.id === id); return a ? { attributes: a, set(o) { Object.assign(a, o); } } : null; },
  toJSON() { return recs; }, models: recs.map(r => ({ id: r.id, attributes: r }))
} } });
const refetched = [], recRefetched = [], notified = [], ajax = [];
let ajaxMode = 'ok';   // 'ok' | 'drop' | 'fail-once' | 'fail-403'
let failed = 0;
window.Knack = { views: { view_4079: models(co), view_3962: models(sow) }, router: { current_scene_key: 'scene_1311' } };
global.Knack = window.Knack;
window.SCW = {
  CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {}, isInternalUser() { return true; },
  knackRecordUrl(v, id) { return '/v/' + v + '/' + id; },
  knackAjax(o) {
    const body = o.data ? JSON.parse(o.data) : null;
    ajax.push({ url: o.url, type: o.type, body });
    const id = o.url.split('/').pop();
    const rec = co.find(r => r.id === id) || sow.find(r => r.id === id) || {};
    if (ajaxMode === 'fail-once' && !failed) { failed++; o.error({ status: 429 }); return; }
    if (ajaxMode === 'fail-403') { o.error({ status: 403, responseText: 'Unauthorized' }); return; }
    const record = { id };
    for (const k in body) record[k + '_raw'] = ajaxMode === 'drop' ? rec[k + '_raw'] : body[k];   // 'drop' = Knack kept the old value
    record.field_2269_raw = 40;   // a recalculated CALC comes back with the record
    o.success({ record });
  },
  syncKnackModel(v, id, resp, key, value) { const a = byView[v].find(r => r.id === id); if (!a) return; const rr = resp && resp.record || resp; if (key) { a[key] = value; a[key + '_raw'] = (rr && rr[key + '_raw'] != null) ? rr[key + '_raw'] : value; } if (rr) for (const k in rr) if (/_raw$/.test(k)) a[k] = rr[k]; }
};
global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js', 'warnings.js', 'bulk.js', 'accessory-edit.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
ns.data = {
  readRecords: v => byView[v] || [], subscribe() {}, attachListeners() {}, subscribeRendered() {},
  refetchAndNotify: v => refetched.push(v), refetchRecordAndNotify: (v, id, k, val) => recRefetched.push([v, id, k, val]), notify: v => notified.push(v)
};
const realTimeout = window.setTimeout;
window.setTimeout = function () {}; global.setTimeout = window.setTimeout;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/init.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
window.setTimeout = realTimeout; global.setTimeout = nodeTimeout;
// The modal's queue / retry timers: no gap, a ~1 ms backoff (real timers; the test ticks 15 ms).
ns.accessoryEdit.CONFIG.GAP_MS = 0; ns.accessoryEdit.CONFIG.RETRY_BASE_MS = 1; ns.accessoryEdit.CONFIG.RETRY_MAX_MS = 2;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const tick = () => new Promise(r => nodeTimeout(r, 15));
const overlay = () => document.querySelector('.scw-ws-v2-ae-overlay');
const text = sel => { const el = overlay() && overlay().querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
const input = key => overlay().querySelector('[data-scw-ae-field="' + key + '"]');
const setVal = (key, v) => { input(key).value = v; };
const click = el => { const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev; };
function mountCard(rec, view) {
  let host = document.getElementById('scw-ws-v2-' + view);
  if (!host) { host = document.createElement('div'); host.id = 'scw-ws-v2-' + view; document.body.appendChild(host); }
  host.innerHTML = '';
  const card = ns.card.buildCard(rec, view);
  host.appendChild(card);
  return card;
}

(async () => {
  check('the CO view opted in; the sales SOW view did not', [ns.accessoryEdit.canOpen('view_4079'), ns.accessoryEdit.canOpen('view_3962')], [true, false]);
  check('accessoriesOf: the accessories under the given parents, in model order', ns.accessoryEdit.accessoriesOf('view_4079', ['p1', 'p2']).map(r => r.id), ['a1', 'a2', 'a3']);

  // ── the chip ──
  const card = mountCard(co[0], 'view_4079');
  const chip = card.querySelector('a.scw-ws-v2-mh-chip[data-scw-ws-v2-mh-edit="a1"]');
  check('the CO card\'s accessory chip is a link that names the accessory and its parent for the modal (the Knack edit page stays its href)',
    [!!chip, chip && chip.getAttribute('data-scw-ws-v2-mh-eparent'), chip && /\/edit-accessory-line-item2\/a1\/$/.test(chip.getAttribute('href'))], [true, 'p1', true]);
  const sowCard = mountCard(sow[0], 'view_3962');
  check('the sales SOW card\'s chip has no modal hook (plain Knack link as before)',
    [!!sowCard.querySelector('[data-scw-ws-v2-mh-edit]'), !!sowCard.querySelector('.scw-ws-v2-mh-chip')], [false, true]);
  const ev = click(chip);
  check('clicking the chip opens the modal instead of navigating: the accessory, its parent, the facts, qty + discount fields',
    [ev.defaultPrevented, !!overlay(), text('.scw-ws-v2-mb-title'), text('.scw-ws-v2-mb-sub'), text('.scw-ws-v2-ae-facts'),
     input('field_1964').value, input('field_2261').value, input('field_2262').value, input('field_2263').value],
    [true, true, 'Edit accessory', 'Electrical Box Mount for The Detective (MDF) on E-001',
     'Unit price$25.00 Applied discount$5.00 Net unit$22.50 Line total$45.00', '2', '10', '', '']);
  // Only what changed is sent; the other fields stay off the PUT.
  ajax.length = 0; recRefetched.length = 0;
  setVal('field_2262', '2.50'); setVal('field_2263', 'bulk buy'); setVal('field_1964', '3');
  click(overlay().querySelector('.scw-ws-v2-mb-submit'));
  await tick(); await tick();
  check('Save: ONE PUT through the CO view with only the changed fields (qty, disc $, reason), then the record is re-read and the modal closes',
    [ajax.map(a => [a.type, a.url, a.body]), recRefetched.map(r => r.slice(0, 2)), !!overlay(), co[2].field_2262_raw, co[2].field_2269_raw],
    [[['PUT', '/v/view_4079/a1', { field_1964: 3, field_2262: 2.5, field_2263: 'bulk buy' }]], [['view_4079', 'a1']], false, 2.5, 40]);
  check('…and a toast says so', document.getElementById('scw-ws-v2-ae-toast').textContent, 'Accessory saved.');

  // A blank number clears the field; nothing changed = just close.
  ns.accessoryEdit.open('view_4079', ['a1']);
  ajax.length = 0;
  setVal('field_2261', '');
  click(overlay().querySelector('.scw-ws-v2-mb-submit'));
  await tick(); await tick();
  check('emptying a discount box clears it (an empty value is sent)', ajax.map(a => a.body), [{ field_2261: '' }]);
  ns.accessoryEdit.open('view_4079', ['a1']);
  ajax.length = 0;
  click(overlay().querySelector('.scw-ws-v2-mb-submit'));
  await tick();
  check('Save with nothing changed sends nothing and closes', [ajax.length, !!overlay()], [0, false]);

  // Qty is only offered when the accessory product allows multi-qty (the chip stepper's rule).
  ns.accessoryEdit.open('view_4079', ['a2']);
  check('a qty-locked accessory gets no Quantity box', [!!input('field_1964'), !!input('field_2261')], [false, true]);
  ns.accessoryEdit.close();

  // A 200 that kept the old value is reported, not celebrated.
  ajaxMode = 'drop';
  ns.accessoryEdit.open('view_4079', ['a3']);
  ajax.length = 0; refetched.length = 0; recRefetched.length = 0;
  setVal('field_2261', '15');
  click(overlay().querySelector('.scw-ws-v2-mb-submit'));
  await tick(); await tick();
  check('a dropped write (Knack echoed the old value): the modal stays, names the field and the Builder cause, no record re-read',
    [!!overlay(), /Knack did not apply Custom discount % on this accessory — the column is not inline-editable on view_4079/.test(text('.scw-ws-v2-mb-status')), recRefetched.length],
    [true, true, 0]);
  ns.accessoryEdit.close();
  ajaxMode = 'ok';

  // Locked cards keep the chip inert for the modal (co-ops-lock / a read-only panel).
  const lockedCard = mountCard(co[0], 'view_4079');
  lockedCard.classList.add('scw-ws-v2-card--locked');
  const ev2 = click(lockedCard.querySelector('a.scw-ws-v2-mh-chip[data-scw-ws-v2-mh-edit="a1"]'));
  check('on a locked card the chip click opens nothing — the Knack edit page (its href) is the fallback', [!!overlay(), ev2.defaultPrevented], [false, false]);

  // ── bulk ──
  ns.accessoryEdit.openForParents('view_4079', ['p1', 'p2']);
  const rowsOf = () => Array.from(overlay().querySelectorAll('.scw-ws-v2-ae-row')).map(r => r.getAttribute('data-scw-ae-row'));
  check('"Edit accessories" over two parents: the three accessories listed by parent, all ticked, blank fields with a "leave as is" placeholder, no qty box',
    [text('.scw-ws-v2-mb-title'), rowsOf(), text('[data-scw-ae-count]'), text('.scw-ws-v2-mb-submit'), input('field_2261').placeholder, !!input('field_1964'),
     text('[data-scw-ae-row="a1"] .v')],
    ['Edit 3 accessories', ['a1', 'a2', 'a3'], '3 of 3 ticked', 'Apply to 3', 'leave as is', false, 'qty 3 · $2.50 each · net $22.50']);
  // Untick one, fill two fields, Apply: one PUT per ticked accessory, the blank field never sent.
  overlay().querySelector('.scw-ws-v2-ae-check[value="a2"]').checked = false;
  overlay().querySelector('.scw-ws-v2-ae-check[value="a2"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  check('unticking updates the count and the button', [text('[data-scw-ae-count]'), text('.scw-ws-v2-mb-submit')], ['2 of 3 ticked', 'Apply to 2']);
  ajax.length = 0; refetched.length = 0;
  setVal('field_2262', '5'); setVal('field_2263', 'promo');
  click(overlay().querySelector('.scw-ws-v2-mb-submit'));
  await tick(); await tick(); await tick();
  check('Apply: one PUT per ticked accessory with the filled fields only, one worksheet re-read, the modal closes',
    [ajax.map(a => [a.url, a.body]), refetched, !!overlay(), document.getElementById('scw-ws-v2-ae-toast').textContent],
    [[['/v/view_4079/a1', { field_2262: 5, field_2263: 'promo' }], ['/v/view_4079/a3', { field_2262: 5, field_2263: 'promo' }]], ['view_4079'], false, 'Updated 2 accessories.']);
  // 0 clears; nothing filled is refused.
  ns.accessoryEdit.openForParents('view_4079', ['p1', 'p2']);
  ajax.length = 0;
  click(overlay().querySelector('.scw-ws-v2-mb-submit'));
  check('Apply with every field blank is refused with a hint', [ajax.length, text('.scw-ws-v2-mb-status')], [0, 'Fill in at least one field — a blank field is left as it is.']);
  setVal('field_2261', '0');
  click(overlay().querySelector('.scw-ws-v2-mb-submit'));
  await tick(); await tick(); await tick();
  check('0 is sent to every ticked accessory (it clears the discount)', ajax.map(a => a.body), [{ field_2261: 0 }, { field_2261: 0 }, { field_2261: 0 }]);
  ns.accessoryEdit.openForParents('view_4079', ['p2']);
  check('a lone accessory under the selected parent opens the single form', [text('.scw-ws-v2-mb-title'), !!input('field_1964')], ['Edit accessory', true]);
  ns.accessoryEdit.close();

  // A transient failure is retried; a permanent one is reported and stays ticked for another Apply.
  ajaxMode = 'fail-once'; failed = 0;
  ns.accessoryEdit.openForParents('view_4079', ['p1']);
  ajax.length = 0;
  setVal('field_2261', '20');
  click(overlay().querySelector('.scw-ws-v2-mb-submit'));
  await tick(); await tick(); await tick();
  check('a 429 is retried: three calls for two accessories, both saved', [ajax.length, !!overlay()], [3, false]);
  ajaxMode = 'fail-403';
  ns.accessoryEdit.openForParents('view_4079', ['p1']);
  ajax.length = 0; refetched.length = 0;
  setVal('field_2261', '20');
  click(overlay().querySelector('.scw-ws-v2-mb-submit'));
  await tick(); await tick();
  check('a 403 is not retried: both reported by label with the status, both stay ticked for another Apply, no re-read',
    [ajax.length, /Electrical Box Mount for The Detective \(MDF\) failed \(HTTP 403\); Junction Box \(MDF\) failed \(HTTP 403\)\./.test(text('.scw-ws-v2-mb-status')),
     Array.from(overlay().querySelectorAll('.scw-ws-v2-ae-check')).map(c => c.checked), refetched.length],
    [2, true, [true, true], 0]);
  ns.accessoryEdit.close();
  ajaxMode = 'ok';
  check('no accessories under the selection: a toast, no modal', [ns.accessoryEdit.openForParents('view_4079', ['a1']), document.getElementById('scw-ws-v2-ae-toast').textContent],
    [null, 'The selected items have no accessories.']);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL uncaught: ' + (e && e.stack || e)); process.exit(1); });
