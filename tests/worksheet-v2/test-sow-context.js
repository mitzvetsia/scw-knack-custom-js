// jsdom smoke test: worksheet-v2 SOW CONTEXT (sow-context.js) — "which scope of work am I looking
// at?" made unavoidable (RCA, 2026-10-06 revision: the ops project page mixed two SOWs' items and
// nothing said "you are on SW1589 — Alternate"). Project page (view_3962): a sticky bar names the
// SOW the worksheet is filtered to with an Original / Alternate / Change order badge (lowest SW
// number = Original; a CO identifier = Change order), counts, and scope tabs; with 2+ SOWs and no
// stored choice the panel waits behind a chooser; "All · mixed" is an explicit, amber choice stored
// as the __all sentinel. SOW page (view_3586): the bar names THIS SOW (view_3827) and its siblings
// (view_3869). The scope strip's meta line says which scope it counts.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1085"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#k2-build-sows/project-details/6a2c00010000000000001111/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.localStorage = window.localStorage;   // the modules reference the bare global, as in a browser
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const A = '6a2c000100000000000a1334', B = '6a2c000100000000000b1589', C = '6a2c000100000000000c1781';
const CAM = '6481e5ba38f283002898113c';
const conn = (id, name) => [{ id, identifier: name }];
const sowRef = ids => ids.map(id => ({ id, identifier: id === A ? 'SW-1334' : id === B ? 'SW-1589' : 'SW-1781CO' }));
const rec = (id, sows, extra) => Object.assign({ id, field_1949: 'Vista Dome 4MP', field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'),
  field_1946_raw: conn('L1', 'MDF - Clubhouse'), field_2218: 10, field_2150: 100, field_2154_raw: sowRef(sows) }, extra || {});
const project = [rec('r1', [A]), rec('r2', [A]), rec('r3', [A, B]), rec('r4', [B]), rec('r5', [C]), rec('r6', [])];
const sowPage = [rec('s1', [B]), rec('s2', [B])];
window.Knack = {
  router: { current_scene_key: 'scene_1085' },
  views: {
    view_3962: { model: { data: { models: project.map(r => ({ attributes: r })) } } },
    view_3325: { model: { data: { models: [
      { attributes: { id: A, field_2122: '60486704913-SW1334', field_2126: 'SW1334 - Fellowship Hall P2P' } },
      { attributes: { id: B, field_2122: '60486704913-SW1589', field_2126: 'SW1589 - Alternate Sign Option' } },
      { attributes: { id: C, field_2122: '60486704913-SW1781CO', field_2126: 'SW1781CO - Switch swap' } }
    ] } } },
    view_3586: { model: { data: { models: sowPage.map(r => ({ attributes: r })) } } },
    view_3827: { model: { attributes: { id: B, field_2122: '60486704913-SW1589', field_2126: 'SW1589 - Alternate Sign Option' } } },
    view_3869: { model: { data: { models: [
      { attributes: { id: A, field_2122: '60486704913-SW1334', field_2126: 'SW1334 - Fellowship Hall P2P' } },
      { attributes: { id: C, field_2122: '60486704913-SW1781CO', field_2126: 'SW1781CO - Switch swap', field_2952: 'change order' } }
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
const renders = [];
ns.data = { readRecords: vk => (vk === 'view_3962' ? project : vk === 'view_3586' ? sowPage : []) };
ns.render = { renderView: (vk, recs) => renders.push([vk, recs.length]) };
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
// text with a space between child elements (the markup has none), collapsed
const txt = el => el ? Array.from(el.childNodes).map(n => n.nodeType === 3 ? n.textContent : txt(n)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() : null;
const panel = (vk) => { const p = document.createElement('div'); p.id = 'scw-ws-v2-' + vk; p.className = 'scw-ws-v2';
  p.innerHTML = '<div class="scw-ws-v2-banner"><span class="scw-ws-v2-banner-title">x</span></div><div class="scw-ws-v2-body"></div>'; document.body.appendChild(p); return p; };
try { window.localStorage.clear(); } catch (e) {}

// ── badges ────────────────────────────────────────────────────────────────────────────────────
check('badge rule: lowest SW number = Original, the others Alternate, a CO identifier = Change order',
  ns.sowContext.classify([{ label: 'SW-1589' }, { label: 'SW-1334', name: 'x' }, { label: 'SW-1781CO' }, { label: '', name: 'SW1900 - late' }]).map(s => s.kind),
  ['alternate', 'original', 'co', 'alternate']);
check('parseSow reads the number from the identifier, the name, or a full "deal-SW" id',
  [ns.sowContext.parseSow('SW-1589'), ns.sowContext.parseSow('', 'SW1334 - Fellowship'), ns.sowContext.parseSow('60486704913-SW1781CO')],
  [{ num: 1589, isCo: false }, { num: 1334, isCo: false }, { num: 1781, isCo: true }]);

// ── project page: unchosen → chooser ─────────────────────────────────────────────────────────
const P = panel('view_3962');
ns.sowFilter.mount('view_3962');          // pills mount + applyFilter → sow-context bar
const bar = P.querySelector(':scope > .scw-ws-v2-sowctx');
check('2+ SOWs and nothing stored: the panel waits behind the chooser (bar first child, unchosen state)',
  [bar && bar === P.firstElementChild, P.classList.contains('scw-ws-v2--sow-unchosen'), P.classList.contains('scw-ws-v2--sowctx'), bar && bar.getAttribute('data-scw-ws-v2-sowctx-mode')],
  [true, true, true, 'unchosen']);
const opts = [...P.querySelectorAll('[data-scw-ws-v2-sowctx-choose]')];
check('chooser lists every scope with token, badge, name and line-item count (shared item counts on both), plus the explicit "all" option',
  opts.map(o => txt(o)),
  ['SW1334 Original Fellowship Hall P2P 3 line items', 'SW1589 Alternate Alternate Sign Option 2 line items', 'Show all 2 scopes together (mixed counts)']);
check('unchosen: the filter leaves every record visible (nothing stored) and describe() says the scopes are mixed',
  [ns.sowFilter.filterRecords('view_3962', project).length, ns.sowContext.describe('view_3962')], [5, 'across 2 scopes, mixed']);
// ── change orders are not served on the project page (sowContext.hideChangeOrders, 2026-10-13) ──
const mixedCo = rec('rx', [A, C]);   // base scope that a change order also lists
check('hideChangeOrders: the CO is only in the unfiltered SOW list; its ref is still known by id; the CO-only item r5 is dropped, an item on a base SOW + the CO stays (view-only)',
  [ns.sowFilter.collectSowList('view_3962').map(s => s.label), ns.sowFilter.collectSowList('view_3962', { includeCo: true }).map(s => s.label),
   ns.sowContext.isChangeOrderRef({ id: C, identifier: '' }, 'view_3962'), ns.sowFilter.visibleRecords('view_3962', project.concat([mixedCo])).map(r => r.id),
   ns.card.isCoLocked(mixedCo, 'view_3962'), ns.card.isCoLocked(project[2], 'view_3962')],
  [['SW-1334', 'SW-1589'], ['SW-1334', 'SW-1589', 'SW-1781CO'], true, ['r1', 'r2', 'r3', 'r4', 'r6', 'rx'], true, false]);

// ── choose SW1589 ─────────────────────────────────────────────────────────────────────────────
renders.length = 0;
opts[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
check('choosing a scope stores it as the SOW filter selection, re-renders the view, and drops the chooser',
  [ns.sowFilter.loadActive('view_3962'), renders.length > 0, P.classList.contains('scw-ws-v2--sow-unchosen'), P.querySelector('.scw-ws-v2-sowctx-chooser')],
  [[B], true, false, null]);
check('single mode: the bar names the scope (token · name · Alternate badge) with its count, shared items and hidden scopes; filterRecords narrows to it',
  [txt(P.querySelector('.scw-ws-v2-sowctx-eyebrow')), txt(P.querySelector('.scw-ws-v2-sowctx-tok')), txt(P.querySelector('.scw-ws-v2-sowctx-name')),
   txt(P.querySelector('.scw-ws-v2-sowctx-badge')), txt(P.querySelector('.scw-ws-v2-sowctx-meta')),
   ns.sowFilter.filterRecords('view_3962', project).map(r => r.id), ns.sowContext.describe('view_3962')],
  ['Working on', 'SW1589', 'Alternate Sign Option', 'Alternate', '2 line items · 1 also on another scope · 1 other scope hidden', ['r3', 'r4'], 'on SW1589 (alternate)']);
const tabs = [...P.querySelectorAll('[data-scw-ws-v2-sowctx-tab]')];
check('scope tabs: one per SOW (with kind + count), (no SOW) for blank rows, All · mixed; the chosen one is on; the pills strip is hidden by the --sowctx class',
  [tabs.map(t => txt(t) + (t.classList.contains('is-on') ? ' *' : '')), P.classList.contains('scw-ws-v2--sowctx'), !!P.querySelector('.scw-ws-v2-sow-pills')],
  [['SW1334 3', 'SW1589 Alternate 2 *', '(no SOW) 1', 'All · mixed'], true, true]);

// ── shift-click adds a scope (mixed) ──────────────────────────────────────────────────────────
tabs[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
check('shift-click adds a second scope: amber mixed state, both named with counts, filter widens',
  [ns.sowFilter.loadActive('view_3962').slice().sort(), P.querySelector('.scw-ws-v2-sowctx').getAttribute('data-scw-ws-v2-sowctx-mode'), P.classList.contains('scw-ws-v2--sow-mixed'),
   txt(P.querySelector('.scw-ws-v2-sowctx-tok')), txt(P.querySelector('.scw-ws-v2-sowctx-badge')), ns.sowFilter.filterRecords('view_3962', project).length, ns.sowContext.describe('view_3962')],
  [[A, B].sort(), 'multi', true, 'SW1589 (2) · SW1334 (3)', 'Mixed', 4, 'across SW1589 + SW1334, mixed']);

// ── All · mixed is an explicit, remembered choice ─────────────────────────────────────────────
P.querySelector('[data-scw-ws-v2-sowctx-tab="__all"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
check('"All · mixed" stores the __all sentinel (so the chooser does not return), shows every record, reads amber',
  [ns.sowFilter.loadActive('view_3962'), ns.sowFilter.filterRecords('view_3962', project).length, P.classList.contains('scw-ws-v2--sow-unchosen'),
   P.querySelector('.scw-ws-v2-sowctx').getAttribute('data-scw-ws-v2-sowctx-mode'), txt(P.querySelector('.scw-ws-v2-sowctx-tok')), txt(P.querySelector('.scw-ws-v2-sowctx-meta'))],
  [['__all'], 5, false, 'all', 'All 2 scopes', 'SW1334 (3) · SW1589 (2) · counts and totals combine every scope · click a scope tab to work on one']);
check('a plain click on a scope tab from "all" selects just that scope (the sentinel is dropped)',
  (P.querySelector('[data-scw-ws-v2-sowctx-tab="' + A + '"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })),   // the bar was rebuilt — re-query the live tab
   [ns.sowFilter.loadActive('view_3962'), ns.sowFilter.filterRecords('view_3962', project).map(r => r.id)]),
  [[A], ['r1', 'r2', 'r3']]);
check('the legacy pills still work: their Show All stores the sentinel on a view that requires a choice',
  (P.querySelector('[data-scw-ws-v2-sow-pill="__all"]').click(), ns.sowFilter.loadActive('view_3962')), ['__all']);

// ── the choice is per project: another project on the same scene asks again ─────────────────
window.location.hash = '#k2-build-sows/project-details/6a2c00010000000000009999/';
ns.sowFilter.mount('view_3962');
check('a different project (route record id) has no stored choice: the chooser returns; the first project keeps its own',
  [P.classList.contains('scw-ws-v2--sow-unchosen'), ns.sowFilter.loadActive('view_3962'),
   (window.location.hash = '#k2-build-sows/project-details/6a2c00010000000000001111/', ns.sowFilter.mount('view_3962'), ns.sowFilter.loadActive('view_3962'))],
  [true, [], ['__all']]);

// ── a stored choice of a change order alone is dropped on mount: the chooser returns ─────────
ns.sowFilter.setActive('view_3962', [C]);
ns.sowFilter.mount('view_3962');
check('a stored selection naming only the CO is discarded (not a served scope): nothing stored, chooser back',
  [ns.sowFilter.loadActive('view_3962'), P.classList.contains('scw-ws-v2--sow-unchosen')], [[], true]);

// ── scope strip meta names the scope ──────────────────────────────────────────────────────────
ns.sowFilter.setActive('view_3962', [B]);
const F = ns.cfg.fields('view_3962');
const strip = ns.summary.buildScopeStrip(ns.groups.buildGroupTree(ns.sowFilter.filterRecords('view_3962', project), [], { viewKey: 'view_3962', fields: F }), { viewKey: 'view_3962', fields: F, moneyLabel: 'sub bid' });
check('the scope strip meta leads with the scope it counts', [txt(strip.querySelector('.scw-ws-v2-scope-ctx')), /^on SW1589 \(alternate\) · 2 line items/.test(txt(strip.querySelector('.scw-ws-v2-scope-meta')))], ['on SW1589 (alternate)', true]);

// ── single-SOW project: no chooser, no tabs ───────────────────────────────────────────────────
try { window.localStorage.clear(); } catch (e) {}
window.Knack.views.view_3962.model.data.models = [rec('q1', [A]), rec('q2', [A])].map(r => ({ attributes: r }));
ns.data.readRecords = vk => (vk === 'view_3962' ? [rec('q1', [A]), rec('q2', [A])] : vk === 'view_3586' ? sowPage : []);
ns.sowFilter.mount('view_3962');
check('one SOW on the project: no chooser, the bar just states the scope, no tabs, describe() is empty',
  [P.classList.contains('scw-ws-v2--sow-unchosen'), txt(P.querySelector('.scw-ws-v2-sowctx-tok')), txt(P.querySelector('.scw-ws-v2-sowctx-badge')), P.querySelectorAll('[data-scw-ws-v2-sowctx-tab]').length,
   txt(P.querySelector('.scw-ws-v2-sowctx-meta')), ns.sowContext.describe('view_3962')],
  [false, 'SW1334', 'Original', 0, '2 line items · the only scope on this project', '']);
// records whose SOWs all vanished: the bar is removed rather than left stale
window.Knack.views.view_3962.model.data.models = [rec('z1', [])].map(r => ({ attributes: r }));
ns.data.readRecords = vk => (vk === 'view_3962' ? [rec('z1', [])] : vk === 'view_3586' ? sowPage : []);
ns.sowFilter.mount('view_3962');
check('no SOW on any record: no pills and no context bar', [!!P.querySelector('.scw-ws-v2-sow-pills'), !!P.querySelector('.scw-ws-v2-sowctx'), P.classList.contains('scw-ws-v2--sowctx')], [false, false, false]);

// ── a choice that matches no line item is not applied (2026-11-17, Toyota SOW 2136) ──────────
// "(no SOW)" was picked while a cloned SOW still had unassigned lines. Once every line had its SOW
// the page read "No SOW designated · 0 line items", the worksheet was empty, and with ONE scope on
// the project the bar drew no tabs — no way back to the SOW's items.
const setRecs = (list) => { window.Knack.views.view_3962.model.data.models = list.map(r => ({ attributes: r }));
  ns.data.readRecords = vk => (vk === 'view_3962' ? list : vk === 'view_3586' ? sowPage : []); };
const mode = () => { const b = P.querySelector(':scope > .scw-ws-v2-sowctx'); return b ? b.getAttribute('data-scw-ws-v2-sowctx-mode') : null; };
const tabTexts = () => [...P.querySelectorAll('[data-scw-ws-v2-sowctx-tab]')].map(t => txt(t) + (t.classList.contains('is-on') ? ' *' : ''));
try { window.localStorage.clear(); window.sessionStorage.clear(); } catch (e) {}
let one = [rec('t1', [A]), rec('t2', [A]), rec('t3', [])];
setRecs(one);
ns.sowFilter.mount('view_3962');
check('one SOW + an unassigned line: the bar offers the SOW and a (no SOW) tab',
  [mode(), tabTexts()], ['only', ['SW1334 2', '(no SOW) 1']]);
P.querySelector('[data-scw-ws-v2-sowctx-tab="__blank"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
check('picking (no SOW) shows only the unassigned line, with the tabs to leave it',
  [mode(), ns.sowFilter.loadActive('view_3962'), ns.sowFilter.filterRecords('view_3962', one).map(r => r.id), tabTexts(), P.getAttribute('data-scw-ws-v2-sow-filter')],
  ['blank', ['__blank'], ['t3'], ['SW1334 2', '(no SOW) 1 *'], '__blank']);
one = [rec('t1', [A]), rec('t2', [A]), rec('t3', [A])];   // the last unassigned line gets its SOW
setRecs(one);
ns.sowFilter.mount('view_3962');
check('nothing unassigned any more: the (no SOW) pick is not applied — the bar names the only SOW, every line shows, no filter attribute, no (blank) pill lit',
  [mode(), txt(P.querySelector('.scw-ws-v2-sowctx-tok')), txt(P.querySelector('.scw-ws-v2-sowctx-meta')), ns.sowFilter.filterRecords('view_3962', one).map(r => r.id),
   ns.sowFilter.effectiveActive('view_3962'), P.hasAttribute('data-scw-ws-v2-sow-filter'), P.classList.contains('scw-ws-v2--sow-blank'),
   !!P.querySelector('.scw-ws-v2-sow-pill--blank.scw-ws-v2-sow-pill--active'), ns.sowContext.describe('view_3962')],
  ['only', 'SW1334', '3 line items · the only scope on this project', ['t1', 't2', 't3'], [], false, false, false, '']);
check('while the page cannot say it holds every record (no server total) the pick is only left unapplied: still stored, and back the moment a line is unassigned',
  [ns.sowFilter.loadActive('view_3962'),
   (one = one.concat([rec('t4', [])]), setRecs(one), ns.sowFilter.mount('view_3962'), mode()), ns.sowFilter.filterRecords('view_3962', one).map(r => r.id)],
  [['__blank'], 'blank', ['t4']]);
// with the complete record set on the page a pick that matches nothing is over: retired from storage
const total = (n) => { window.Knack.views.view_3962.model.data.total_records = n; };
one = [rec('t1', [A]), rec('t2', [A]), rec('t3', [A])];
setRecs(one); total(5);
ns.sowFilter.mount('view_3962');
check('a partly loaded grid (3 of 5 records) never retires the pick', [mode(), ns.sowFilter.loadActive('view_3962')], ['only', ['__blank']]);
total(3);
window.location.hash = '#k2-build-sows/project-details/6a2c00010000000000001111/?view_3962_filters=%5B%5D';
ns.sowFilter.setActive('view_3962', ['__blank']);
ns.sowFilter.mount('view_3962');
check('a native Knack filter on the view (the model is a subset) never retires it either', [mode(), ns.sowFilter.loadActive('view_3962')], ['only', ['__blank']]);
window.location.hash = '#k2-build-sows/project-details/6a2c00010000000000001111/';
ns.sowFilter.mount('view_3962');
check('every record on the page and nothing unassigned: the pick is retired, so a line that loses its SOW later does not take the page over',
  [mode(), ns.sowFilter.loadActive('view_3962'),
   (one = one.concat([rec('t4', [])]), setRecs(one), total(4), ns.sowFilter.mount('view_3962'), mode()), tabTexts(), ns.sowFilter.filterRecords('view_3962', one).length],
  ['only', [], 'only', ['SW1334 3', '(no SOW) 1'], 4]);
total(undefined);
// a SOW no line item is on any more (deleted / consolidated), on a project left with one scope
one = [rec('t1', [A]), rec('t2', [A])];
setRecs(one);
ns.sowFilter.setActive('view_3962', [B]);
ns.sowFilter.mount('view_3962');
check('a stored SOW that no line item is on any more is not applied either: the only scope shows with its lines (it used to read "2 line items" over an empty worksheet)',
  [mode(), ns.sowFilter.loadActive('view_3962'), ns.sowFilter.effectiveActive('view_3962'), ns.sowFilter.filterRecords('view_3962', one).map(r => r.id)],
  ['only', [B], [], ['t1', 't2']]);
// 2+ scopes: the dead (no SOW) pick falls back to the chooser; beside a live scope it is simply dropped
let two = [rec('u1', [A]), rec('u2', [B])];
setRecs(two);
ns.sowFilter.setActive('view_3962', ['__blank']);
ns.sowFilter.mount('view_3962');
check('two scopes and a (no SOW) pick with nothing unassigned: the chooser asks again (as if never chosen)',
  [mode(), P.classList.contains('scw-ws-v2--sow-unchosen'), ns.sowFilter.filterRecords('view_3962', two).length], ['unchosen', true, 2]);
ns.sowFilter.setActive('view_3962', ['__blank', A]);
ns.sowFilter.mount('view_3962');
check('(no SOW) + a scope with nothing unassigned: plain single scope, not "mixed"; a shift-click builds on what applies',
  [mode(), ns.sowFilter.filterRecords('view_3962', two).map(r => r.id),
   (P.querySelector('[data-scw-ws-v2-sowctx-tab="' + B + '"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })),
    ns.sowFilter.loadActive('view_3962').slice().sort())],
  ['single', ['u1'], [A, B].sort()]);
try { window.localStorage.clear(); window.sessionStorage.clear(); } catch (e) {}

// ── SOW page: this SOW + its siblings ─────────────────────────────────────────────────────────
document.body.id = 'knack-body scene_1116';
const S = panel('view_3586');
ns.sowContext.mount('view_3586');
const sbar = S.querySelector(':scope > .scw-ws-v2-sowctx');
check('SOW page: the bar names THIS SOW from the detail view with its badge, counts its items, and lists the project\'s other scopes with their badges',
  [sbar && sbar.getAttribute('data-scw-ws-v2-sowctx-mode'), txt(sbar.querySelector('.scw-ws-v2-sowctx-eyebrow')), txt(sbar.querySelector('.scw-ws-v2-sowctx-tok')), txt(sbar.querySelector('.scw-ws-v2-sowctx-badge')),
   txt(sbar.querySelector('.scw-ws-v2-sowctx-meta')), sbar.querySelectorAll('[data-scw-ws-v2-sowctx-tab]').length, ns.sowContext.describe('view_3586'), S.classList.contains('scw-ws-v2--sow-unchosen')],
  ['single', 'Scope of work', 'SW1589', 'Alternate', '2 line items · 1 of 3 scopes on this project · also on this project: SW1334 (Original), SW1781CO (Change order)', 0, 'on SW1589 (alternate)', false]);
check('a view without a sowContext config gets no bar', (panel('view_4093'), ns.sowContext.mount('view_4093'), document.querySelector('#scw-ws-v2-view_4093 .scw-ws-v2-sowctx')), null);

// ── sticky offset only where sticky can reach the viewport (2026-10-12) ──────────────────────
// KTL wraps every view in section.ktlBoxWithBorder { overflow: hidden }; position:sticky then
// resolves against the box, not the viewport, and a top offset only shoves the bar DOWN over the
// toolbar beneath it (the "buttons tucked away after an add" hiccup). The pinned project bar
// exists here (jsdom measures it 0 → the 48px fallback).
const pinned = document.createElement('div'); pinned.id = 'scw-phn-bar'; document.body.appendChild(pinned);
const ktlCss = document.createElement('style'); ktlCss.textContent = 'section.ktlBoxWithBorder { overflow: hidden; }';
document.head.appendChild(ktlCss);
const box = document.createElement('section'); box.className = 'ktlBoxWithBorder'; box.style.overflow = 'hidden';
document.body.appendChild(box); box.appendChild(S);
ns.sowContext.mount('view_3586');
check('inside an overflow:hidden KTL box the bar gets NO sticky offset (it could only push it down over the toolbar)',
  [ns.sowContext.canStickToViewport(sbar), sbar.style.getPropertyValue('--scw-sowctx-top')], [false, '0px']);
document.body.appendChild(S);   // back under body: nothing clips, so sticky can reach the viewport
ns.sowContext.mount('view_3586');
check('with no clipping ancestor the bar reserves the pinned project bar\'s height',
  [ns.sowContext.canStickToViewport(sbar), sbar.style.getPropertyValue('--scw-sowctx-top')], [true, '48px']);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
