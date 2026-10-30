// jsdom smoke test (2026-10-30, CO worksheet view_4079): "on a 'remove' item like this for a swap you
// shouldn't be able to 'add' an accessory — the only thing you should be able to do is identify that you
// want to remove one of the accessories that is attached to the deployment item you're removing."
// A CO Remove line's Mounting Hardware block has no "+ Add"; the credit lines already under it lose the
// qty stepper and the unlink (delete stays); co-remove.js lists the TARGET install item's accessories in
// the block — "Add Removal" on a live one (the single-accessory webhook path), "on this CO" / "removed"
// otherwise, never twice for one a credit line already takes out. The other "add under a Remove line"
// paths are closed too: the add-accessory modal, the bulk bar's button, the Parent picker and the CO add
// form's "Mounts on" list.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const nodeTimeout = global.setTimeout;
const PID = '69c4310cf4b1b33df77fa499', CO = '6a0000000000000000000c01';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/' + PID + '/change-order/' + CO });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.Event = window.Event;
global.MutationObserver = window.MutationObserver;
const alerts = [];
window.alert = m => alerts.push(String(m)); global.alert = window.alert;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; },
  find() { return jqObj; }, ajaxError() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

const CAM = '6481e5ba38f283002898113c', MOUNT = '594a94536877675816984cb9';
const conn = (id, name) => [{ id, identifier: name }];
const MDF = conn('L1', 'MDF - Clubhouse');
const line = (id, extra) => Object.assign({ id, field_1964: 1, field_1964_raw: 1, field_1946_raw: MDF, field_2154_raw: conn(CO, '1781CO'),
  field_2464_raw: [], field_2207_raw: [], field_2230: 'No', field_2230_raw: false }, extra);
// The CO worksheet: the swap of RA-E-029 (its Remove half with one credit line under it, its Add half with a
// bracket), a top-level Remove line for another of the camera's accessories, two more plain Remove lines, and
// a loose bracket (the Parent picker's subject).
const co = [
  line('rm1', { field_2965: 'Remove', field_2966_raw: conn('dev1', 'RA-E-029'), field_1949: 'Deputy 8.0 v5', field_1949_raw: conn('pDep', 'Deputy 8.0 v5'),
    field_1950: 'RA-E-029', field_2219_raw: conn(CAM, 'Camera / Reader'), field_1960_raw: 650 }),
  line('rm1-acc', { field_2965: 'Remove', field_2966_raw: conn('acc-credit', 'Pole Adapter'), field_2464_raw: conn('rm1', 'RA-E-029'),
    field_1949: 'Pole Adapter', field_1950: 'Pole Adapter (MDF)', field_2219_raw: conn(MOUNT, 'Mounting Hardware') }),
  line('rm-top', { field_2965: 'Remove', field_2966_raw: conn('acc-top', 'Junction Box'), field_1949: 'Junction Box',
    field_1950: 'Junction Box (MDF)', field_2219_raw: conn(MOUNT, 'Mounting Hardware') }),
  line('rm2', { field_2965: 'Remove', field_2966_raw: conn('dev2', 'RA-E-030'), field_1949: 'Deputy 8.0 v5', field_1950: 'RA-E-030',
    field_2219_raw: conn(CAM, 'Camera / Reader') }),
  line('rm3', { field_2965: 'Remove', field_2966_raw: conn('dev3', 'RA-E-031'), field_1949: 'Deputy 8.0 v5', field_1950: 'RA-E-031',
    field_2219_raw: conn(CAM, 'Camera / Reader') }),
  line('add1', { field_2965: 'Add', field_2966_raw: conn('dev1', 'RA-E-029'), field_1949: 'Informant 8.0 v5', field_1949_raw: conn('pInf', 'Informant 8.0 v5'),
    field_1950: 'RA-E-029', field_2219_raw: conn(CAM, 'Camera / Reader') }),
  line('add1-acc', { field_2965: 'Add', field_2464_raw: conn('add1', 'RA-E-029'), field_1949: 'Wall Mount Bracket', field_1950: 'Wall Mount Bracket (MDF)',
    field_2219_raw: conn(MOUNT, 'Mounting Hardware') }),
  line('loose', { field_2965: 'Add', field_1949: 'Pole Mount', field_1950: 'Pole Mount (MDF)', field_2219_raw: conn(MOUNT, 'Mounting Hardware') })
];
// The project's install items (view_4086, the removal panel's source): RA-E-029 with five accessories in
// every state, RA-E-030 with one live accessory, RA-E-031 with none.
const inst = (id, extra) => Object.assign({ id, field_2789: 1 }, extra);
const installs = [
  inst('dev1', { field_2790: 'Deputy 8.0 v5', field_2802: 'RA-E-029', field_2822_raw: conn(CAM, 'Camera / Reader') }),
  inst('acc-live', { field_2790: 'Wall Mount Bracket for The Deputy', field_2789: 2, field_2853_raw: conn('dev1', 'RA-E-029') }),
  inst('acc-credit', { field_2790: 'Pole Adapter', field_2853_raw: conn('dev1', 'RA-E-029') }),
  inst('acc-top', { field_2790: 'Junction Box', field_2853_raw: conn('dev1', 'RA-E-029') }),
  inst('acc-mine', { field_2790: 'Conduit Adapter', field_2853_raw: conn('dev1', 'RA-E-029'), field_2967_raw: conn(CO, '1781CO') }),
  inst('acc-other', { field_2790: 'Old Wall Mount', field_2853_raw: conn('dev1', 'RA-E-029'), field_2967_raw: conn('line-elsewhere', 'Old Wall Mount') }),
  inst('dev2', { field_2790: 'Deputy 8.0 v5', field_2802: 'RA-E-030', field_2822_raw: conn(CAM, 'Camera / Reader') }),
  inst('acc2', { field_2790: 'Electrical Box Mount', field_2853_raw: conn('dev2', 'RA-E-030') }),
  inst('dev3', { field_2790: 'Deputy 8.0 v5', field_2802: 'RA-E-031', field_2822_raw: conn(CAM, 'Camera / Reader') })
];
const byView = { view_4079: co, view_4086: installs };
const fetchedViews = [];
const models = (vk, recs) => ({ model: {
  fetch() { fetchedViews.push(vk); },
  data: { get(id) { const a = recs.find(r => r.id === id); return a ? { attributes: a } : null; }, toJSON() { return recs; },
          models: recs.map(r => ({ id: r.id, attributes: r })), length: recs.length }
} });
window.Knack = { views: { view_4079: models('view_4079', co), view_4086: models('view_4086', installs) },
  router: { current_scene_key: 'scene_1362' }, getUserAttributes() { return { id: 'u1', name: 'Micah', email: 'x@getscw.com' }; } };
global.Knack = window.Knack;

// The remove webhook: held open until the test releases it (so the pending state can be read).
const posts = [];
let release = null;
const fetchStub = (url, o) => {
  posts.push({ url, body: JSON.parse(o.body) });
  return new Promise(res => { release = () => res({ ok: true, text: () => Promise.resolve('{"success":true}') }); });
};
global.fetch = window.fetch = fetchStub;

const rendered = {};
let confirmOpts = null;
window.SCW = {
  CONFIG: { MAKE_CO_REMOVE_ITEMS_WEBHOOK: 'https://hook.test/co-remove', MAKE_CO_ADD_ITEMS_WEBHOOK: 'https://hook.test/co-add' },
  worksheetV2: {
    data: {
      readRecords: v => byView[v] || [], subscribe() {}, attachListeners() {},
      subscribeRendered(vk, fn) { (rendered[vk] = rendered[vk] || []).push(fn); },
      refetchAndNotify() {}, refetchRecordAndNotify() {}, notify() {}
    },
    confirmModal(o) { confirmOpts = o; return Promise.resolve(true); }
  },
  mountingBoxProducts: [{ id: 'brX', name: 'Wall Mount Bracket for The Informant', compatibleProducts: ['pInf'] }],
  debug() {}, onViewRender() {}, onSceneRender() {}, isInternalUser() { return true; },
  knackRecordUrl(v, id) { return '/v/' + v + '/' + id; }, knackAjax() {}
};
global.SCW = window.SCW;
const load = f => new Function('window', 'document', '$', 'Knack', 'SCW', 'fetch',
  fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW, fetchStub);
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js', 'warnings.js', 'bulk.js', 'toolbar.js', 'co-add-item-form.js', 'co-remove.js']) load(f);
const ns = window.SCW.worksheetV2;
let opened = null;
ns.picker = { open: o => { opened = o; } };
const realTimeout = window.setTimeout;
window.setTimeout = function () {}; global.setTimeout = window.setTimeout;
load('init.js');
window.setTimeout = realTimeout; global.setTimeout = nodeTimeout;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const tick = () => new Promise(r => nodeTimeout(r, 15));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const click = el => { const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev; };

const panel = document.createElement('div');
panel.id = 'scw-ws-v2-view_4079'; panel.className = 'scw-ws-v2';
document.body.appendChild(panel);
const cards = {};
for (const id of ['rm1', 'rm2', 'rm3', 'add1', 'loose']) {
  cards[id] = ns.card.buildCard(co.find(r => r.id === id), 'view_4079');
  panel.appendChild(cards[id]);
}
const block = id => cards[id].querySelector('[data-scw-co-rm-line]');
const taccRows = id => cards[id].querySelectorAll('.scw-co-tacc-row');
const taccs = id => [...cards[id].querySelectorAll('[data-scw-co-tacc]')].map(w =>
  [w.getAttribute('data-scw-co-tacc'), w.getAttribute('data-scw-co-tacc-state'), txt(w.querySelector('.scw-ws-v2-mh-chip')),
   txt(w.querySelector('.scw-co-remove-acc-x, .scw-co-remove-acc-tag, .scw-ws-v2-mh-removed'))]);
const paintCo = () => (rendered.view_4079 || []).forEach(fn => fn('view_4079'));

(async () => {
  // ── the card ──
  check('a Remove line\'s Mounting Hardware has no "+ Add"; the swap\'s Add half keeps it',
    [!!cards.rm1.querySelector('[data-scw-ws-v2-add-accessory]'), !!cards.rm3.querySelector('[data-scw-ws-v2-add-accessory]'),
     !!cards.add1.querySelector('[data-scw-ws-v2-add-accessory]')], [false, false, true]);
  check('the block names the Remove line and the install item it takes out (field_2966)',
    [block('rm1').getAttribute('data-scw-co-rm-line'), block('rm1').getAttribute('data-scw-co-rm-target'), !!block('add1')], ['rm1', 'dev1', false]);
  const credit = cards.rm1.querySelector('.scw-ws-v2-mh-chip-wrap[data-scw-co-line-target]');
  check('the credit line already under the Remove line: names its install accessory, no qty stepper, no unlink, delete stays',
    [credit && credit.getAttribute('data-scw-co-line-target'), !!credit.querySelector('.scw-ws-v2-mh-stepper'),
     !!credit.querySelector('.scw-ws-v2-mh-unlink'), !!credit.querySelector('[data-scw-ws-v2-mh-del="rm1-acc"]')],
    ['acc-credit', false, false, true]);
  const addChip = cards.add1.querySelector('.scw-ws-v2-mh-chip-wrap');
  check('…while an accessory under an Add line keeps its stepper and unlink',
    [!!addChip.querySelector('.scw-ws-v2-mh-stepper'), !!addChip.querySelector('.scw-ws-v2-mh-unlink')], [true, true]);
  check('card.js exports the rule (isCoRemoveOnCo) — CO worksheets only',
    [ns.card.isCoRemoveOnCo(co[0], 'view_4079'), ns.card.isCoRemoveOnCo(co[5], 'view_4079'), ns.card.isCoRemoveOnCo(co[0], 'view_3962')], [true, false, false]);

  // ── the removed item's installed accessories ──
  check('co-remove maps the CO worksheet to its removal panel', ns.coRemove.removalViewForCo('view_4079').sourceViewKey, 'view_4086');
  check('co-remove repaints after each render of the CO worksheet', (rendered.view_4079 || []).length > 0, true);
  paintCo();
  check('RA-E-029: every installed accessory not already taken out by the credit line, in its state',
    taccs('rm1'), [
      ['acc-live', 'live', 'Wall Mount Bracket for The Deputy ×2', 'Add Removal'],
      ['acc-top', 'co', 'Junction Box', 'on this CO'],
      ['acc-mine', 'co', 'Conduit Adapter', 'on this CO'],
      ['acc-other', 'removed', 'Old Wall Mount', 'removed']
    ]);
  check('the list sits under a caption, after the credit chips', [txt(cards.rm1.querySelector('.scw-co-tacc-lbl')), taccRows('rm1').length],
    ['Installed with this item', 1]);
  const btn = cards.rm1.querySelector('[data-scw-co-tacc="acc-live"] .scw-co-remove-acc-x');
  check('the live accessory\'s button drafts through the removal panel\'s view, in the CO-line context',
    [btn.getAttribute('data-scw-co-remove-acc'), btn.getAttribute('data-scw-co-remove-view'), btn.getAttribute('data-scw-co-remove-ctx'),
     btn.getAttribute('data-scw-co-remove-line')], ['acc-live', 'view_4086', 'co-line', 'rm1']);
  const empty2 = cards.rm2.querySelector('.scw-ws-v2-mh-empty'), empty3 = cards.rm3.querySelector('.scw-ws-v2-mh-empty');
  check('RA-E-030 (no credit lines): its live accessory is listed and the "—" is hidden; RA-E-031 has no accessories: "—" stays',
    [taccs('rm2'), empty2.style.display, taccRows('rm3').length, empty3.style.display],
    [[['acc2', 'live', 'Electrical Box Mount', 'Add Removal']], 'none', 0, '']);
  paintCo();
  check('repainting is idempotent (one list per block, same chips)', [taccRows('rm1').length, taccs('rm1').length, taccRows('rm2').length], [1, 4, 1]);

  // ── Add Removal ── (the repaint above rebuilt the chip: click the live one)
  click(cards.rm1.querySelector('[data-scw-co-tacc="acc-live"] .scw-co-remove-acc-x'));
  await tick();
  check('the confirm names the device it came with — never "stays installed" (the device is going on this CO)',
    [confirmOpts && confirmOpts.title, /installed with <b>RA-E-029<\/b>/.test(confirmOpts.body), /stays installed/.test(confirmOpts.body),
     confirmOpts.okLabel], ['Add a removal for this accessory?', true, false, 'Add Removal to CO']);
  check('while the webhook runs the chip reads "Adding…", disabled (and survives a repaint)',
    (paintCo(), taccs('rm1')[0]), ['acc-live', 'pending', 'Wall Mount Bracket for The Deputy ×2', 'Adding…']);
  check('…the button is disabled', cards.rm1.querySelector('[data-scw-co-tacc="acc-live"] .scw-co-remove-acc-x').disabled, true);
  check('ONE webhook: just the accessory, as its own Remove line (the single-accessory path)',
    posts.map(p => [p.url, p.body.changeOrderId, p.body.installItemIds, p.body.accessoryInstallItemIds, p.body.items, p.body.removal]),
    [['https://hook.test/co-remove', CO, ['acc-live'], [], [{ id: 'acc-live', accessoryIds: [] }], true]]);
  release();
  await tick();
  check('after the ACK the chip reads "on this CO" and the CO worksheet + panel are refetched',
    [taccs('rm1')[0], fetchedViews.includes('view_4079'), fetchedViews.includes('view_4086')],
    [['acc-live', 'co', 'Wall Mount Bracket for The Deputy ×2', 'on this CO'], true, true]);
  // Deleting that Remove line (init.js → onCoLineDeleted) puts the button back.
  ns.coRemove.onCoLineDeleted('view_4079', { id: 'rm-new', field_2965: 'Remove', field_2966_raw: conn('acc-live', 'Wall Mount Bracket') });
  check('deleting the accessory\'s Remove line makes it live again', taccs('rm1')[0][1], 'live');
  // A locked CO (co-ops-lock / co-sub-lock stamp the panel read-only): no drafting from the card.
  panel.classList.add('scw-ws-v2--readonly');
  posts.length = 0; confirmOpts = null;
  click(cards.rm1.querySelector('[data-scw-co-tacc="acc-live"] .scw-co-remove-acc-x'));
  await tick();
  const coCss = (document.getElementById('scw-ws-v2-co-remove-css') || { textContent: '' }).textContent;
  check('a locked CO worksheet: the button is hidden by CSS and a click drafts nothing',
    [/\.scw-ws-v2--readonly \.scw-co-tacc \.scw-co-remove-acc-x \{ display: none !important; \}/.test(coCss), confirmOpts, posts.length], [true, null, 0]);
  panel.classList.remove('scw-ws-v2--readonly');

  // ── the other add paths skip Remove lines ──
  alerts.length = 0;
  ns.toolbar.openAddAccessories('view_4079', { ids: ['rm1'], labels: ['RA-E-029'] });
  check('the add-accessory modal refuses a selection of only Remove lines, and says where to go instead',
    [!!document.querySelector('.scw-ws-v2-mb-overlay'), alerts.length === 1 && /Remove lines can.t take new accessories/.test(alerts[0]),
     /Add Removal/.test(alerts[0] || '')], [false, true, true]);
  ns.toolbar.openAddAccessories('view_4079', { ids: ['rm1', 'add1'], labels: ['RA-E-029', 'RA-E-029'] });
  const ov = document.querySelector('.scw-ws-v2-mb-overlay');
  check('a mixed selection opens the modal for the Add line only (and its compatible bracket)',
    [!!ov, txt(ov && ov.querySelector('.scw-ws-v2-mb-title')), [...(ov ? ov.querySelectorAll('.scw-ws-v2-mb-check') : [])].map(b => b.value)],
    [true, 'Add accessories to 1 row', ['brX']]);
  if (ov) ov.parentNode.removeChild(ov);

  ns.bulk.mount('view_4079');
  const addAccBtn = document.querySelector('.scw-ws-v2-bulk-add-acc');
  const sel = (id, on) => { const b = cards[id].querySelector('[data-scw-ws-v2-select="' + id + '"]'); b.checked = on; b.dispatchEvent(new window.Event('change', { bubbles: true })); };
  sel('rm1', true);
  check('bulk bar: only Remove lines selected → "Add accessories" is off and says why',
    [addAccBtn.disabled, /Remove lines take no new accessories/.test(addAccBtn.title)], [true, true]);
  sel('add1', true);
  check('…an Add line in the selection turns it back on', [addAccBtn.disabled, addAccBtn.title], [false, '']);
  sel('rm1', false); sel('add1', false);

  opened = null;
  click(cards.loose.querySelector('[data-scw-ws-v2-conn="field_2464"]'));
  check('the Parent picker never offers a Remove line (nor an accessory or the row itself)',
    opened ? opened.candidates.map(r => r.id).sort() : null, ['add1']);

  check('the CO add form\'s "Mounts on" lists no Remove line from this CO',
    ns.coAddForm.parentCandidates('view_4079').filter(c => c.source === 'co').map(c => c.id), ['co:add1']);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
