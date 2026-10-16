// jsdom smoke test: worksheet-v2 BID CONTEXT on the survey / bid worksheet (sow-context.js kind:'bid',
// 2026-10-16) — the build-SOW page's "which scope am I on?" bar reproduced for a survey request's BIDS
// (view_3505 / scene_1140). The Bid filter (sow-filter.js filterPills on field_2415) now also lists
// every bid on the BIDs grid (view_3507, listAll) so a freshly created variant with no items has a tab.
// The bar names the bid being worked on (BD-n · friendly name · Base / Variant by BD number · the grid's
// status text, or "Submitted" when it shows a bid PDF), carries bid tabs with counts, "(no bid)", "All ·
// mixed" (amber), and gates the body behind "Which bid are you working on?" with 2+ bids and no choice.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1140"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#site-survey-request-details/6a2c00010000000000002222/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.localStorage = window.localStorage;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const B1 = '6a2c000100000000000bd001', B2 = '6a2c000100000000000bd002', B3 = '6a2c000100000000000bd003';
const CAM = '6481e5ba38f283002898113c';
const conn = (id, name) => [{ id, identifier: name }];
const bidRef = ids => ids.map(id => ({ id, identifier: id === B1 ? 'BD-1' : id === B2 ? 'BD-2' : 'BD-3' }));
const rec = (id, bids, extra) => Object.assign({ id, field_2365: id.toUpperCase(), field_2379: 'Vista Dome 4MP', field_2399: 1, field_2400: 120,
  field_2366_raw: conn(CAM, 'Camera / Reader'), field_2375_raw: conn('L1', 'MDF - Clubhouse'), field_2218: 10, field_2415_raw: bidRef(bids) }, extra || {});
const survey = [rec('r1', [B1]), rec('r2', [B1]), rec('r3', [B1, B2]), rec('r4', [B2]), rec('r5', [])];
const bidRows = [
  { id: B1, field_2414: 'BD-1', field_2636: 'Base bid', field_2626: '<a href="https://x/bid.pdf">bid.pdf</a>', field_2626_raw: { id: 'f1', filename: 'bid.pdf', url: 'https://x/bid.pdf' } },
  { id: B2, field_2414: 'BD-2', field_2636: 'No readers', field_2550: 'Revising', field_2626: '', field_2626_raw: '' },
  { id: B3, field_2414: 'BD-3', field_2636: 'Fresh variant' }   // created, no items yet
];
window.Knack = {
  router: { current_scene_key: 'scene_1140' },
  views: {
    view_3505: { model: { data: { models: survey.map(r => ({ attributes: r })) } } },
    view_3507: { model: { data: { models: bidRows.map(r => ({ attributes: r })) } } }
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
ns.data = { readRecords: vk => (vk === 'view_3505' ? survey : []) };
ns.render = { renderView: (vk, recs) => renders.push([vk, recs.length]) };
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => el ? Array.from(el.childNodes).map(n => n.nodeType === 3 ? n.textContent : txt(n)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() : null;
const panel = (vk) => { const p = document.createElement('div'); p.id = 'scw-ws-v2-' + vk; p.className = 'scw-ws-v2';
  p.innerHTML = '<div class="scw-ws-v2-banner"><span class="scw-ws-v2-banner-title">x</span></div><div class="scw-ws-v2-body"></div>'; document.body.appendChild(p); return p; };
const click = (el, init) => el.dispatchEvent(new window.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, init || {})));
try { window.localStorage.clear(); } catch (e) {}

// ── the bid list + badge rule ────────────────────────────────────────────────────────────────
check('filter spec on the survey worksheet: the Bid connection, labelled Bid, listing the BIDs grid',
  [ns.sowFilter.filterSpec('view_3505').fieldKey, ns.sowFilter.filterSpec('view_3505').label, ns.sowFilter.filterSpec('view_3505').listAll], ['field_2415', 'Bid', true]);
check('collectSowList lists the bids the items connect to AND the grid-only BD-3 (no items yet), with friendly names',
  [ns.sowFilter.collectSowList('view_3505').map(b => b.label), ns.sowFilter.collectSowList('view_3505').map(b => b.name)],
  [['BD-1', 'BD-2', 'BD-3'], ['Base bid', 'No readers', 'Fresh variant']]);
check('badge rule for bids: lowest BD number = Base, the others Variant, an unnumbered bid = other; BD 3 / a bare number parse',
  [ns.sowContext.classify([{ label: 'BD-2' }, { label: 'BD-1' }, { label: 'Acme bid' }], 'bid').map(s => s.kind),
   ns.sowContext.parseRef('BD 3', '', 'bid'), ns.sowContext.parseRef('', '2 — second pass', 'bid'), ns.sowContext.parseRef('BD-1', '', 'bid').isCo],
  [['alternate', 'original', 'other'], { num: 3, isCo: false }, { num: 2, isCo: false }, false]);
check('the SOW vocabulary is untouched: classify defaults to SOW parsing', ns.sowContext.classify([{ label: 'SW-1589' }, { label: 'SW-1334' }]).map(s => s.kind), ['alternate', 'original']);

// ── 2+ bids, nothing stored → chooser ────────────────────────────────────────────────────────
const P = panel('view_3505');
ns.sowFilter.mount('view_3505');
const bar = P.querySelector(':scope > .scw-ws-v2-sowctx');
check('2+ bids and nothing stored: the panel waits behind the chooser; the bar is marked kind=bid',
  [bar && bar === P.firstElementChild, P.classList.contains('scw-ws-v2--sow-unchosen'), bar && bar.getAttribute('data-scw-ws-v2-sowctx-mode'), bar && bar.getAttribute('data-scw-ws-v2-sowctx-kind')],
  [true, true, 'unchosen', 'bid']);
check('the chooser asks about bids', [txt(P.querySelector('.scw-ws-v2-sowctx-chooser-q')), txt(P.querySelector('.scw-ws-v2-sowctx-chooser-sub'))],
  ['Which bid are you working on?', 'This survey has 3 bids and this page holds all of their line items. Pick one so counts, totals and edits stay in the right bid.']);
const opts = [...P.querySelectorAll('[data-scw-ws-v2-sowctx-choose]')];
check('chooser options: BD-n · Base / Variant · Submitted (PDF) or the grid\'s status · name · count (the empty variant too), plus "all"',
  opts.map(o => txt(o)),
  ['BD-1 Base Submitted Base bid 3 line items', 'BD-2 Variant Revising No readers 2 line items', 'BD-3 Variant Fresh variant 0 line items', 'Show all 3 bids together (mixed counts)']);
check('unchosen: every record stays visible and describe() says the bids are mixed',
  [ns.sowFilter.filterRecords('view_3505', survey).length, ns.sowContext.describe('view_3505')], [5, 'across 3 bids, mixed']);

// ── choose BD-1 ──────────────────────────────────────────────────────────────────────────────
renders.length = 0;
click(opts[0]);
check('choosing a bid stores it as the Bid filter selection, re-renders, drops the chooser',
  [ns.sowFilter.loadActive('view_3505'), renders.length > 0, P.classList.contains('scw-ws-v2--sow-unchosen'), P.querySelector('.scw-ws-v2-sowctx-chooser')],
  [[B1], true, false, null]);
check('single mode: Working on · BD-1 · name · Base + Submitted badges · counts (shared item, hidden bids); the filter narrows to it',
  [txt(P.querySelector('.scw-ws-v2-sowctx-eyebrow')), txt(P.querySelector('.scw-ws-v2-sowctx-tok')), txt(P.querySelector('.scw-ws-v2-sowctx-name')),
   [...P.querySelectorAll('.scw-ws-v2-sowctx-title .scw-ws-v2-sowctx-badge')].map(txt), txt(P.querySelector('.scw-ws-v2-sowctx-meta')),
   ns.sowFilter.filterRecords('view_3505', survey).map(r => r.id), ns.sowContext.describe('view_3505')],
  ['Working on', 'BD-1', 'Base bid', ['Base', 'Submitted'], '3 line items · 1 also on another bid · 2 other bids hidden', ['r1', 'r2', 'r3'], 'on BD-1 (base)']);
let tabs = [...P.querySelectorAll('[data-scw-ws-v2-sowctx-tab]')];
check('bid tabs carry the friendly name: one per bid (kind + count), (no bid), All · mixed; the pills strip is hidden by the --sowctx class',
  [tabs.map(t => txt(t) + (t.classList.contains('is-on') ? ' *' : '')), txt(P.querySelector('.scw-ws-v2-sowctx-tabs-label')), P.classList.contains('scw-ws-v2--sowctx'), !!P.querySelector('.scw-ws-v2-sow-pills')],
  [['BD-1 Base bid 3 *', 'BD-2 Variant No readers 2', 'BD-3 Variant Fresh variant 0', '(no bid) 1', 'All · mixed'], 'Bid', true, true]);

// ── the empty variant is a real choice (not dropped as stale on re-mount) ────────────────────
click(P.querySelector('[data-scw-ws-v2-sowctx-tab="' + B3 + '"]'));
ns.sowFilter.mount('view_3505');
check('choosing the grid-only BD-3 sticks across a re-mount: 0 line items, no chooser',
  [ns.sowFilter.loadActive('view_3505'), P.querySelector('.scw-ws-v2-sowctx').getAttribute('data-scw-ws-v2-sowctx-mode'), txt(P.querySelector('.scw-ws-v2-sowctx-tok')),
   txt(P.querySelector('.scw-ws-v2-sowctx-meta')), ns.sowFilter.filterRecords('view_3505', survey).length, ns.sowContext.describe('view_3505')],
  [[B3], 'single', 'BD-3', '0 line items · 2 other bids hidden', 0, 'on BD-3 (variant)']);

// ── status text beats the PDF badge ──────────────────────────────────────────────────────────
click(P.querySelector('[data-scw-ws-v2-sowctx-tab="' + B2 + '"]'));
check('BD-2: Variant + the grid\'s status text as the badge', [[...P.querySelectorAll('.scw-ws-v2-sowctx-title .scw-ws-v2-sowctx-badge')].map(txt), txt(P.querySelector('.scw-ws-v2-sowctx-meta'))],
  [['Variant', 'Revising'], '2 line items · 1 also on another bid · 2 other bids hidden']);

// ── shift-click adds a bid (mixed) ───────────────────────────────────────────────────────────
click(P.querySelector('[data-scw-ws-v2-sowctx-tab="' + B1 + '"]'), { shiftKey: true });
check('shift-click adds a second bid: amber mixed state, both named with counts, filter widens',
  [ns.sowFilter.loadActive('view_3505'), P.querySelector('.scw-ws-v2-sowctx').getAttribute('data-scw-ws-v2-sowctx-mode'), P.classList.contains('scw-ws-v2--sow-mixed'),
   txt(P.querySelector('.scw-ws-v2-sowctx-tok')), txt(P.querySelector('.scw-ws-v2-sowctx-badge')), txt(P.querySelector('.scw-ws-v2-sowctx-meta')),
   ns.sowFilter.filterRecords('view_3505', survey).length, ns.sowContext.describe('view_3505')],
  [[B2, B1], 'multi', true, 'BD-2 (2) · BD-1 (3)', 'Mixed', 'counts and totals combine these bids · click a bid tab to work on one', 4, 'across BD-2 + BD-1, mixed']);

// ── All · mixed ──────────────────────────────────────────────────────────────────────────────
click(P.querySelector('[data-scw-ws-v2-sowctx-tab="__all"]'));
check('"All · mixed" stores the __all sentinel, shows every record, names every bid with its count',
  [ns.sowFilter.loadActive('view_3505'), ns.sowFilter.filterRecords('view_3505', survey).length, P.querySelector('.scw-ws-v2-sowctx').getAttribute('data-scw-ws-v2-sowctx-mode'),
   txt(P.querySelector('.scw-ws-v2-sowctx-tok')), txt(P.querySelector('.scw-ws-v2-sowctx-meta'))],
  [['__all'], 5, 'all', 'All 3 bids', 'BD-1 (3) · BD-2 (2) · BD-3 (0) · counts and totals combine every bid · click a bid tab to work on one']);

// ── (no bid): items taken off every bid ──────────────────────────────────────────────────────
click(P.querySelector('[data-scw-ws-v2-sowctx-tab="__blank"]'));
check('(no bid) alone: "Not on any bid · Unassigned", the count and what it means; filter = the unassigned items',
  [ns.sowFilter.loadActive('view_3505'), P.querySelector('.scw-ws-v2-sowctx').getAttribute('data-scw-ws-v2-sowctx-mode'), txt(P.querySelector('.scw-ws-v2-sowctx-tok')),
   txt(P.querySelector('.scw-ws-v2-sowctx-badge')), txt(P.querySelector('.scw-ws-v2-sowctx-meta')), ns.sowFilter.filterRecords('view_3505', survey).map(r => r.id), ns.sowContext.describe('view_3505')],
  [['__blank'], 'blank', 'Not on any bid', 'Unassigned', '1 line item on no bid — not priced on any bid until one is set · click a bid tab to work on one', ['r5'], 'with no bid']);

// ── the choice is per survey request ─────────────────────────────────────────────────────────
window.location.hash = '#site-survey-request-details/6a2c00010000000000003333/';
ns.sowFilter.mount('view_3505');
check('another request on the same scene has no stored choice (chooser back); the first keeps its own',
  [P.classList.contains('scw-ws-v2--sow-unchosen'), ns.sowFilter.loadActive('view_3505'),
   (window.location.hash = '#site-survey-request-details/6a2c00010000000000002222/', ns.sowFilter.mount('view_3505'), ns.sowFilter.loadActive('view_3505'))],
  [true, [], ['__blank']]);

// ── one bid on the request (the common sub case): no chooser, no amber, no tabs ──────────────
try { window.localStorage.clear(); } catch (e) {}
const one = [rec('q1', [B1]), rec('q2', [B1])];
window.Knack.views.view_3505.model.data.models = one.map(r => ({ attributes: r }));
window.Knack.views.view_3507.model.data.models = [{ attributes: bidRows[0] }];
ns.data.readRecords = vk => (vk === 'view_3505' ? one : []);
ns.sowFilter.mount('view_3505');
check('one bid: the bar just states it (Bid · BD-1 · Base · Submitted · the only bid on this survey) — no chooser, not amber, no tabs, describe() empty',
  [P.classList.contains('scw-ws-v2--sow-unchosen'), P.classList.contains('scw-ws-v2--sow-mixed'), P.querySelector('.scw-ws-v2-sowctx').getAttribute('data-scw-ws-v2-sowctx-mode'),
   txt(P.querySelector('.scw-ws-v2-sowctx-eyebrow')), txt(P.querySelector('.scw-ws-v2-sowctx-tok')), [...P.querySelectorAll('.scw-ws-v2-sowctx-title .scw-ws-v2-sowctx-badge')].map(txt),
   P.querySelectorAll('[data-scw-ws-v2-sowctx-tab]').length, txt(P.querySelector('.scw-ws-v2-sowctx-meta')), ns.sowContext.describe('view_3505')],
  [false, false, 'only', 'Bid', 'BD-1', ['Base', 'Submitted'], 0, '2 line items · the only bid on this survey', '']);
// no bids anywhere (grid empty, items unassigned): no pills, no bar
window.Knack.views.view_3505.model.data.models = [rec('z1', [])].map(r => ({ attributes: r }));
window.Knack.views.view_3507.model.data.models = [];
ns.data.readRecords = vk => (vk === 'view_3505' ? [rec('z1', [])] : []);
ns.sowFilter.mount('view_3505');
check('no bid on the grid or any item: no pills and no context bar', [!!P.querySelector('.scw-ws-v2-sow-pills'), !!P.querySelector('.scw-ws-v2-sowctx'), P.classList.contains('scw-ws-v2--sowctx')], [false, false, false]);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
