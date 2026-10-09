// jsdom smoke test: on the ops project worksheet (view_3962, coItemsReadOnly) a line item on a
// CHANGE-ORDER SOW is view-only — COs are drafted, priced and signed on their own scene (view_4079,
// co-ops-lock), so the card locks every field (no whitelist), drops the bulk-select box, swaps the
// trash for a lock and says why. A CO is recognised by the identifier's CO suffix ("1926CO" — the SOW
// identifier is the bare number) or by the SOW grid's Type (field_2952). The SOW context bar marks
// CO scopes "view only"; the "(no SOW)" filter reads as unassigned, not mixed.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1085"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#k2-build-sows/project-details/6a2c00010000000000001111/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.localStorage = window.localStorage;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const BASE = '6a2c000100000000000a1628', CO = '6a2c000100000000000c1926', CO2 = '6a2c000100000000000d1927';
const CAM = '6481e5ba38f283002898113c';
const conn = (id, name) => [{ id, identifier: name }];
const ident = { [BASE]: '1628', [CO]: '1926CO', [CO2]: '1927' };   // bare numbers, as the app shows them
const sowRef = ids => ids.map(id => ({ id, identifier: ident[id] }));
const rec = (id, sows) => ({ id, field_1949: 'Vista Dome 4MP', field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: conn('L1', 'MDF - Clubhouse'),
  field_2218: 10, field_2150: 100, field_2461: 'No', field_1984: 'No', field_1983: 'No', field_1953: 'note', field_2154_raw: sowRef(sows) });
const project = [rec('b1', [BASE]), rec('b2', [BASE]), rec('c1', [CO]), rec('c2', [CO2]), rec('n1', [])];
window.Knack = {
  router: { current_scene_key: 'scene_1085' },
  views: {
    view_3962: { model: { data: { models: project.map(r => ({ attributes: r })) } } },
    // the SOW grid: 1927 carries no CO suffix — only its Type says change order
    view_3325: { model: { data: { models: [
      { attributes: { id: BASE, field_2122: '1628', field_2126: '1628 - Fellowship Hall P2P', field_2952: 'base scope' } },
      { attributes: { id: CO, field_2122: '1926CO', field_2126: '1926CO - Switch swap', field_2952: 'change order' } },
      { attributes: { id: CO2, field_2122: '1927', field_2126: '1927 - Camera add', field_2952_raw: 'change order' } }
    ] } } }
  }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  sowColor: { dot: i => ['#2563eb', '#dc2626', '#16a34a'][i] || '#000', chipStyle: () => ({ bg: '#fff', border: '#000', text: '#000' }) } };
global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js', 'sow-filter.js', 'sow-context.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
ns.data = { readRecords: vk => (vk === 'view_3962' ? project : []) };
ns.render = { renderView: () => {} };
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => el ? Array.from(el.childNodes).map(n => n.nodeType === 3 ? n.textContent : txt(n)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() : null;
try { window.localStorage.clear(); } catch (e) {}

// ── identifiers are bare numbers ──────────────────────────────────────────────────────────────
check('bare-number identifiers parse: "1628" → 1628, "1926CO" → change order; a deal-prefixed id still parses',
  [ns.sowContext.parseSow('1628'), ns.sowContext.parseSow('1926CO'), ns.sowContext.parseSow('', '1927 - Camera add'), ns.sowContext.parseSow('60486704913-SW1589')],
  [{ num: 1628, isCo: false }, { num: 1926, isCo: true }, { num: 1927, isCo: false }, { num: 1589, isCo: false }]);
check('a CO is known by its suffix OR the SOW grid\'s Type (1927 has no suffix); a base SOW is not',
  [ns.sowContext.isChangeOrderRef({ id: CO, identifier: '1926CO' }, 'view_3962'), ns.sowContext.isChangeOrderRef({ id: CO2, identifier: '1927' }, 'view_3962'),
   ns.sowContext.isChangeOrderRef({ id: BASE, identifier: '1628' }, 'view_3962')],
  [true, true, false]);

// ── cards ─────────────────────────────────────────────────────────────────────────────────────
const base = ns.card.buildCard(project[0], 'view_3962');
const coCard = ns.card.buildCard(project[2], 'view_3962');
const coCard2 = ns.card.buildCard(project[3], 'view_3962');
check('a base-SOW item stays editable: no lock class, bulk-select box present, product picker live',
  [base.classList.contains('scw-ws-v2-card--locked'), !!base.querySelector('[data-scw-ws-v2-select]'), base.querySelector('[data-scw-ws-v2-conn="field_1949"]').style.pointerEvents],
  [false, true, '']);
const inputs = [...coCard.querySelectorAll('input[data-scw-ws-v2-field], textarea[data-scw-ws-v2-field]')];
check('a change-order item is view-only: locked classes, every field read-only (no whitelist — product and notes included), no bulk-select box, lock in the trash slot',
  [coCard.classList.contains('scw-ws-v2-card--locked'), coCard.classList.contains('scw-ws-v2-card--co-locked'),
   inputs.length > 0 && inputs.every(i => i.readOnly), coCard.querySelector('[data-scw-ws-v2-conn="field_1949"]').style.pointerEvents,
   coCard.querySelector('[data-scw-ws-v2-field="field_1953"]') ? coCard.querySelector('[data-scw-ws-v2-field="field_1953"]').readOnly : 'n/a',
   !!coCard.querySelector('[data-scw-ws-v2-select]'), !!coCard.querySelector('.scw-ws-v2-lock-cell'), !!coCard.querySelector('.scw-ws-v2-trash:not(.scw-ws-v2-lock-cell)')],
  [true, true, true, 'none', true, false, true, false]);
check('the card says why: a CHANGE ORDER · VIEW ONLY flag on the row and the note in the detail panel',
  [txt(coCard.querySelector('.scw-ws-v2-co-flag--viewonly')), /on a change order, so it is view-only here/.test(txt(coCard.querySelector('.scw-ws-v2-locked-note')))],
  ['CHANGE ORDER · VIEW ONLY', true]);
check('the Type-only CO (no suffix) locks the same way', [coCard2.classList.contains('scw-ws-v2-card--co-locked'), !!coCard2.querySelector('[data-scw-ws-v2-select]')], [true, false]);
check('isCoLocked is a no-op on a view without coItemsReadOnly', ns.card.isCoLocked(project[2], 'view_3586'), false);

// ── context bar: CO scopes read view-only; (no SOW) is unassigned, not mixed ──────────────────
const P = document.createElement('div'); P.id = 'scw-ws-v2-view_3962'; P.className = 'scw-ws-v2';
P.innerHTML = '<div class="scw-ws-v2-banner"></div><div class="scw-ws-v2-body"></div>'; document.body.appendChild(P);
ns.sowFilter.setActive('view_3962', [CO]);
check('single CO scope: the bar reads "Viewing · 1926CO · Change order · View only" and says where to edit',
  [txt(P.querySelector('.scw-ws-v2-sowctx-eyebrow')), txt(P.querySelector('.scw-ws-v2-sowctx-tok')), [...P.querySelectorAll('.scw-ws-v2-sowctx-title .scw-ws-v2-sowctx-badge')].map(txt),
   /view-only here — change-order items are edited on the change order/.test(txt(P.querySelector('.scw-ws-v2-sowctx-meta')))],
  ['Viewing', '1926CO', ['Change order', 'View only'], true]);
const tabs = [...P.querySelectorAll('[data-scw-ws-v2-sowctx-tab]')];
check('tabs keep the bare identifiers the app shows; CO tabs carry the lock; the base SOW reads Original',
  [tabs.map(t => txt(t) + (t.querySelector('.scw-ws-v2-sowctx-lock') ? ' [lock]' : '')), ns.sowContext.info('view_3962').sows.map(s => s.kind)],
  [['1628 2', '1926CO Change order 1 [lock]', '1927 Change order 1 [lock]', '(no SOW) 1', 'All · mixed'], ['original', 'co', 'co']]);
ns.sowFilter.setActive('view_3962', ['__blank']);
check('(no SOW) alone: not "mixed" — "No SOW designated · Unassigned", the count, and what it means; describe() matches',
  [P.querySelector('.scw-ws-v2-sowctx').getAttribute('data-scw-ws-v2-sowctx-mode'), P.classList.contains('scw-ws-v2--sow-mixed'), P.classList.contains('scw-ws-v2--sow-blank'),
   txt(P.querySelector('.scw-ws-v2-sowctx-tok')), txt(P.querySelector('.scw-ws-v2-sowctx-badge')), txt(P.querySelector('.scw-ws-v2-sowctx-meta')), ns.sowContext.describe('view_3962')],
  ['blank', false, true, 'No SOW designated', 'Unassigned', '1 line item on no scope of work — not on any proposal until a SOW is set · click a scope tab to work on one', 'with no SOW designated']);
ns.sowFilter.setActive('view_3962', [BASE, '__blank']);
check('a scope plus (no SOW) is mixed again', [P.querySelector('.scw-ws-v2-sowctx').getAttribute('data-scw-ws-v2-sowctx-mode'), ns.sowContext.describe('view_3962')], ['multi', 'across 1628 + no SOW, mixed']);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
