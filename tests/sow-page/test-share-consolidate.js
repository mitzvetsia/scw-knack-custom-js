// jsdom smoke test: the alternative-SOWs grid (view_3869) offers two intents and says what each
// leaves behind. SHARE links the selected items onto the current SOW and the source keeps them
// (field_2154 is a multi-connection — one record on both SOWs). CONSOLIDATE moves everything and
// deletes the source SOW(s); it is offered only when no source SOW has Survey Requested set, it
// locks the checklist to everything (a partial consolidate would orphan the unticked items), and
// in bulk it takes every other SOW on the project — even one with nothing unique — but never a
// change-order SOW.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#sow/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, val() { return '1000'; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
const alerts = [];
window.alert = m => alerts.push(String(m)); global.alert = window.alert;
window.Knack = { views: {}, getUserAttributes() { return { id: 'u1', name: 'Tester', email: 't@example.com' }; } };
global.Knack = window.Knack;
window.SCW = { CONFIG: { MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK: 'https://hook.example/x' } }; global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/import-unique-items-btn.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const I = window.SCW.importUniqueItems._internals;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const conn = (id, name) => [{ id, identifier: name }];
const mdl = attrs => ({ id: attrs.id, attributes: attrs });
const ASSUMPTIONS = '697b7a023a31502ec68b3303';

// ── Fixture: receiving SOW rcv; alternatives alt1 (clean), alt2 (survey requested), alt3 (nothing
//    unique — an empty shell), co1 (a change order). Line items on view_3913.
window.Knack.views.view_3827 = { model: { attributes: { id: 'rcv' } } };
window.Knack.views.view_3869 = { model: { data: { models: [
  mdl({ id: 'alt1', field_2706: 'No' }),
  mdl({ id: 'alt2', field_2706: 'Yes' }),
  mdl({ id: 'alt3', field_2706: 'No' }),
  mdl({ id: 'co1',  field_2706: 'No', field_2952: 'change order' })
] } } };
window.Knack.views.view_3913 = { model: { data: { total_records: 6, models: [
  mdl({ id: 'i1', field_1950: 'E-001', field_1949_raw: conn('p1', 'Camera'), field_2154_raw: conn('alt1', 'SW-1334'), field_1946_raw: conn('m1', 'IDF: 01') }),
  mdl({ id: 'i2', field_1950: 'E-002', field_1949_raw: conn('p1', 'Camera'), field_2154_raw: conn('alt1', 'SW-1334').concat(conn('rcv', 'SW-1897')), field_1946_raw: conn('m1', 'IDF: 01') }),
  mdl({ id: 'i3', field_1950: '',      field_1949_raw: conn('p2', 'NVR'),    field_2154_raw: conn('alt2', 'SW-1500'), field_1946_raw: conn('m0', 'HEADEND') }),
  mdl({ id: 'i4', field_1950: 'E-004', field_1949_raw: conn('p1', 'Camera'), field_2154_raw: conn('rcv', 'SW-1897') }),
  mdl({ id: 'i5', field_1950: '',      field_1949_raw: [], field_2020: 'Assumption text', field_2154_raw: conn('alt1', 'SW-1334'), field_2219_raw: conn(ASSUMPTIONS, 'Assumptions') }),
  mdl({ id: 'i6', field_1950: 'CO-1',  field_1949_raw: conn('p3', 'Thing'),  field_2154_raw: conn('co1', 'SW1418CO') })
] } } };
I.buildSowIndex();

// ── Aggregates ────────────────────────────────────────────────────────────────────────────────
check('unique items of alt1 vs rcv (i2 is already shared → excluded)', I.uniqueItemsFor('alt1', 'rcv'), ['i1', 'i5']);
const share = I.aggregateAllUnique('rcv');
check('share: only CONTRIBUTING SOWs are sources (alt3 has nothing unique)', [share.sourceIds.indexOf('alt1') !== -1, share.sourceIds.indexOf('alt2') !== -1, share.sourceIds.indexOf('alt3')], [true, true, -1]);
check('share: unique union', share.itemIds.slice().sort(), ['i1', 'i3', 'i5', 'i6']);
const cons = I.aggregateConsolidate('rcv');
check('consolidate: EVERY other SOW is a source, incl. the empty shell, never the change order', cons.sourceIds, ['alt1', 'alt2', 'alt3']);
check('consolidate: the surveyed SOW blocks it', cons.blockedSourceIds, ['alt2']);
check('consolidate: change order reported as kept', cons.coKeptIds, ['co1']);
check('consolidate: empty shell contributes nothing but is still deleted', cons.perSow.alt3, []);
check('consolidate: unique union excludes the change order\'s items', cons.itemIds.slice().sort(), ['i1', 'i3', 'i5']);

const overlay = () => document.querySelector('.scw-iui-overlay');
const radio = v => overlay().querySelector('input[name="scw-iui-mode"][value="' + v + '"]');
function pick(v) { const r = radio(v); r.checked = true; r.dispatchEvent(new window.Event('change', { bubbles: true })); }
const boxes = () => Array.from(overlay().querySelectorAll('.scw-iui-item-cb'));
const primary = () => overlay().querySelector('.scw-iui-btn--primary');

(async () => {
  // ── Per-row modal, source not surveyed ─────────────────────────────────────────────────────
  let p = I.showImportConfirm({ sourceToken: 'SW-1334', sourceFull: 'SW-1334 · alt', surveyRequested: false,
    items: [{ id: 'i1', label: 'E-001 · Camera' }, { id: 'i5', label: 'Assumption text' }] });
  check('per-row: Share is the default', [radio('share').checked, radio('consolidate').checked, radio('consolidate').disabled], [true, false, false]);
  check('per-row: share copy says the source keeps the items', /keeps them too: one line item on both SOWs/.test(overlay().textContent), true);
  check('per-row: primary reads Add', [primary().textContent, primary().disabled, overlay().querySelector('.scw-iui-msg').textContent], ['Add', false, 'Add 2 unique items?']);
  boxes()[1].checked = false; boxes()[1].dispatchEvent(new window.Event('change', { bubbles: true }));
  check('per-row: trimming the selection updates the title', overlay().querySelector('.scw-iui-msg').textContent, 'Add 1 unique item?');
  pick('consolidate');
  check('per-row: consolidate locks the checklist to everything', [boxes().map(b => b.checked), boxes().map(b => b.disabled), overlay().querySelector('.scw-iui-items').classList.contains('is-locked')], [[true, true], [true, true], true]);
  check('per-row: locked header says everything moves', overlay().querySelector('.scw-iui-items-count').textContent, 'All 2 items move');
  check('per-row: primary turns into the red consolidate action', [primary().textContent, primary().classList.contains('is-delete'), overlay().querySelector('.scw-iui-msg').textContent], ['Consolidate & delete SW-1334', true, 'Consolidate SW-1334 into this SOW?']);
  pick('share');
  check('per-row: back to share restores the trimmed selection', [boxes().map(b => b.checked), boxes().map(b => b.disabled), primary().textContent], [[true, false], [false, false], 'Add']);
  pick('consolidate');
  primary().click();
  let res = await p;
  check('per-row: consolidate resolves with EVERY unique item', res, { action: 'consolidate', selectedIds: ['i1', 'i5'] });
  check('per-row: modal closed', !!overlay(), false);

  // ── Per-row modal, source surveyed → consolidate unavailable ────────────────────────────────
  p = I.showImportConfirm({ sourceToken: 'SW-1500', surveyRequested: true, items: [{ id: 'i3', label: 'NVR' }] });
  check('surveyed: consolidate tile disabled + blocked', [radio('consolidate').disabled, radio('consolidate').closest('.scw-iui-mode').classList.contains('is-blocked')], [true, true]);
  check('surveyed: the reason names the SOW', /survey has been requested on SW-1500/.test(overlay().textContent), true);
  primary().click();
  res = await p;
  check('surveyed: share still works', res, { action: 'share', selectedIds: ['i3'] });

  // ── Bulk modal opened from the Consolidate button (no blockers) ─────────────────────────────
  const groups = [{ token: 'IDF: 01', items: [{ id: 'i1', label: 'E-001' }] }, { token: 'Project Wide', items: [{ id: 'i5', label: 'Assumption', defaultChecked: false }] }];
  p = I.showBulkConfirm({ initialMode: 'consolidate', groups, sourceCount: 1, allSources: [{ id: 'alt1', token: 'SW-1334' }, { id: 'alt3', token: 'SW-1600' }], blockers: [], coKeptCount: 1 });
  check('bulk consolidate: tile pre-selected', [radio('consolidate').checked, radio('consolidate').closest('.scw-iui-mode').classList.contains('is-selected')], [true, true]);
  check('bulk consolidate: the default-deselected assumption is locked IN', boxes().map(b => [b.checked, b.disabled]), [[true, true], [true, true]]);
  check('bulk consolidate: copy names every SOW that goes, and the CO that stays', [primary().textContent, /Everything on SW-1334, SW-1600 moves/.test(overlay().textContent), /1 change order is kept/.test(overlay().textContent)], ['Consolidate & delete 2 SOWs', true, true]);
  primary().click();
  res = await p;
  check('bulk consolidate: resolves with everything', res, { action: 'consolidate', selectedIds: ['i1', 'i5'] });

  // ── Bulk modal with a surveyed SOW: consolidate pre-selection falls back to share ──────────
  p = I.showBulkConfirm({ initialMode: 'consolidate', groups, sourceCount: 2, allSources: [{ id: 'alt1', token: 'SW-1334' }, { id: 'alt2', token: 'SW-1500' }], blockers: ['SW-1500'], coKeptCount: 0 });
  check('bulk blocked: share selected, consolidate disabled', [radio('share').checked, radio('consolidate').disabled], [true, true]);
  check('bulk blocked: share copy says items stay on their original SOWs', /They stay on their original SOWs too/.test(overlay().textContent), true);
  check('bulk share: assumption stays deselected, title counts the selection', [boxes().map(b => b.checked), overlay().querySelector('.scw-iui-msg').textContent, primary().textContent], [[true, false], 'Add 1 unique item?', 'Add All']);
  primary().click();
  res = await p;
  check('bulk share: resolves with the trimmed selection', res, { action: 'share', selectedIds: ['i1'] });

  check('no alerts fired along the way', alerts, []);
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL threw ' + (e && e.stack || e)); process.exit(1); });
