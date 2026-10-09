// jsdom smoke test: the reconcile-bids page top section, reworked (bid-review-v2/header.js,
// design boards 7–9 on the "Worksheet Scope Summary" canvas, 2026-10-09). SOW tabs show ONE SOW
// at a time (number + Original / Alternate badge, the full name, the scope counts, the review
// state; the synthetic no-SOW grid is the "Unmatched bid items" tab; the choice persists per
// scene + project). The old navy SOW header is the status line (Scope summary ▸ + warning chips).
// The four head bands read as one card per column: SCW's card gets the diff bar's basis picker and
// "Next step" with the mirrored review state ahead of Preview Proposal; each sub card gets a radio
// that drives that picker, the BASIS badge, "$X off the SOW" / "✓ matches the SOW", the gap count
// (basis card only), "N change requests queued for <sub>" over "Review & send to <sub>" and a ⋮
// menu holding the moved buttons. The Line item / Photos labels sit in a row directly above the
// line items, after the documents row. No basis = every bid column shows (the radios are the picker).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PROJECT = '69f0d4b567a35332e743cc27';
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155"></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/' + PROJECT + '/review-bids/' + PROJECT });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
global.MutationObserver = window.MutationObserver; global.Event = window.Event;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
function load(rel) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + rel), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js']) load('worksheet-v2/' + f);
load('bid-review/config.js');
// v1 is a library here: friendly names, pending change requests, the status bar it builds into
// SCW's column (SOW Name input + metrics + the Preview pill + the documents block).
const v1 = window.SCW.bidReview;
const NAMES = { s1: 'Fellowship Hall P2P', s2: 'Parking Lot Sign — pole-mounted LPR at both entrances, second NVR' };
v1.sowFriendlyName = id => NAMES[id] || '';
v1.changeRequests = { getPending: () => ({ pkgA: { items: [{}, {}, {}] } }) };
v1.buildSowStatusBar = function (g) {
  const details = document.createElement('div'); details.className = 'scw-bid-review__sow-status';
  details.innerHTML = '<div class="scw-bid-review__sow-name"><span class="scw-bid-review__sow-name-label">SOW Name</span>' +
    '<input type="text" class="scw-bid-review__sow-name-input" data-action="sow_name_update" data-sow-id="' + g.sowId + '" value="' + (NAMES[g.sowId] || '') + '"></div>' +
    '<div class="scw-bid-review__sow-metrics"><label class="scw-bid-review__sow-metric">Survey Costs <input class="scw-bid-review__sow-metric-input" data-action="sow_survey_costs"></label></div>';
  const actions = document.createElement('div'); actions.className = 'scw-bid-review__sow-actions';
  actions.innerHTML = '<a class="scw-ops-pill" href="#">Preview Proposal for Next Steps</a>';
  const docs = document.createElement('div'); docs.className = 'scw-bid-review__docs scw-bid-review__docs--sow'; docs.textContent = 'Documents';
  return { details, actions, docs };
};
const basisMap = { s1: 'pkgA', s2: '' };
window.SCW.subBidDiff = { render: { basisFor: id => basisMap[id] || '' } };
for (const f of ['config.js', 'transform.js', 'basis-filter.js', 'card.js', 'header.js']) load('bid-review-v2/' + f);
const ns = window.SCW.bidReviewV2;
const NO_SOW = ns.transform.NO_SOW;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const q = (root, sel) => root.querySelector(sel);
const qa = (root, sel) => Array.from(root.querySelectorAll(sel));
const conn = (id, name) => [{ id, identifier: name }];

// ── Fixture: two SOWs + the synthetic no-SOW grid ─────────────────────────────────────────
const pkgA = { id: 'pkgA', label: 'BD-141', subName: 'SVS', bidName: 'SVS bid', pdfUrl: 'https://files/svs.pdf', bidStatus: 'Submitted', subBidTotal: 29900, deltaVsSow: -1580, matchesSow: false };
const pkgB = { id: 'pkgB', label: 'BD-93', subName: 'ACME', bidName: '', pdfUrl: '', bidStatus: 'Submitted', subBidTotal: 31480, deltaVsSow: 0, matchesSow: true };
const flat = () => [{ key: '__all__', level: 0, rows: [], subgroups: [] }];
const grid1 = { sowId: 's1', sowName: '1589', packages: [pkgA, pkgB], sowTotals: { subBid: 31480, install: 40000 }, rows: [], groups: flat() };
const grid2 = { sowId: 's2', sowName: '1628', packages: [pkgB], sowTotals: { subBid: 9000, install: 12000 }, rows: [], groups: flat() };
const gridN = { sowId: NO_SOW, sowName: 'Bid items (no matching SOW)', packages: [pkgA], sowTotals: { subBid: 0, install: 0 }, rows: [{}, {}, {}], groups: flat() };
ns.builtState = { sowGrids: [grid1, grid2, gridN] };
const CAM = '6481e5ba38f283002898113c', MNT = '594a94536877675816984cb9', NET = '647953bb54b4e1002931ed97';
const item = (id, sowId, bucket, name, extra) => Object.assign({
  id, field_2154_raw: conn(sowId, sowId === 's1' ? '1589' : '1628'), field_2219_raw: conn(bucket, 'b'),
  field_1949: name, field_1964: 1, field_1946_raw: conn('m1', 'MDF - Clubhouse')
}, extra || {});
ns.lastSowItems = [
  item('c1', 's1', CAM, 'Vista Dome 4MP', { field_2461: 'No', field_1984: 'No' }),
  item('c2', 's1', CAM, 'Vista Dome 4MP', { field_2461: 'Yes', field_1984: 'Yes' }),
  item('m1x', 's1', MNT, 'Wall Mount Bracket', { field_2464_raw: conn('c1', 'C-001') }),
  item('n1', 's1', NET, '16ch NVR'),
  item('c3', 's2', CAM, 'LPR Camera')
];

// The page: banner + toolbar + body, sections built by card.js, the diff bar blocks as
// sub-bid-diff injects them (after the section header).
const container = document.createElement('div'); container.id = ns.CONFIG.mountId; container.className = 'scw-bid-review-v2';
container.innerHTML = '<div class="scw-bid-review-v2-banner"></div><div class="scw-ws-v2-toolbar scw-bid-review-v2__toolbar"></div><div class="scw-bid-review-v2-body"></div>';
document.body.appendChild(container);
const body = q(container, '.scw-bid-review-v2-body');
function sbdBlock(sowId, basis, readyCls, readyText, gaps) {
  const d = document.createElement('div'); d.className = 'scw-sbd-inline';
  d.innerHTML = '<div class="scw-sbd-inline-bar"><button type="button" class="scw-sbd-collapse" data-scw-sbd-collapse data-sow-id="' + sowId + '">fold</button>' +
    '<div class="scw-sbd-baseline"><label>Basis bid:</label><select data-scw-sbd-basis data-sow-id="' + sowId + '" data-sow-name="' + sowId + '">' +
      '<option value="">— choose the basis bid —</option><option value="K1">K1 Bid OR no subcontractor bid</option>' +
      '<option value="pkgA"' + (basis === 'pkgA' ? ' selected' : '') + '>SVS</option><option value="pkgB"' + (basis === 'pkgB' ? ' selected' : '') + '>ACME</option></select>' +
      '<span class="scw-sbd-baseline__meta">✓ saved</span></div>' +
    '<span class="scw-sbd-ready scw-sbd-ready--' + readyCls + '">' + readyText + '</span>' +
    (gaps ? '<span class="scw-sbd-bargap">⚠ ' + gaps + ' gap' + (gaps === 1 ? '' : 's') + '</span>' : '') +
    '</div><div class="scw-sbd-inline-body">exceptions + note</div>';
  return d;
}
function buildPage() {
  body.innerHTML = '';
  for (const g of [grid1, grid2, gridN]) {
    const sec = ns.card.buildSowSection(g);
    body.appendChild(sec);
    if (g.sowId === 's1') q(sec, '.scw-bid-review-v2__sow-header').insertAdjacentElement('afterend', sbdBlock('s1', 'pkgA', 'ready', '✓ Reviewed — auto-saved', 3));
    if (g.sowId === 's2') q(sec, '.scw-bid-review-v2__sow-header').insertAdjacentElement('afterend', sbdBlock('s2', '', 'needs-basis', 'Pick a basis bid', 0));
  }
}
buildPage();
ns.header.afterRender(body);
const sec1 = q(body, '.scw-bid-review-v2__sow[data-sow-id="s1"]');
const sec2 = q(body, '.scw-bid-review-v2__sow[data-sow-id="s2"]');
const secN = q(body, '.scw-bid-review-v2__sow[data-sow-id="' + NO_SOW + '"]');

// ── Tabs ────────────────────────────────────────────────────────────────────────────────
check('the container is in tabs mode (CSS hook + the init.js header-fold guard attribute)',
  [container.classList.contains('scw-bid-review-v2--tabs'), document.documentElement.getAttribute('data-scw-br-v2-tabs')], [true, '1']);
const tabs = q(container, '.scw-bid-review-v2__sowtabs');
check('the tab strip sits above the toolbar', tabs && tabs.nextElementSibling.classList.contains('scw-bid-review-v2__toolbar'), true);
const tabEls = qa(tabs, '[data-scw-br-v2-tab]');
check('one tab per section, the no-SOW grid last as "Unmatched bid items"', tabEls.map(t => t.getAttribute('data-scw-br-v2-tab')), ['s1', 's2', NO_SOW]);
check('number + badge: the lowest SW number is the Original, the other an Alternate',
  tabEls.slice(0, 2).map(t => [txt(q(t, '.scw-bid-review-v2__sowtab-num')), txt(q(t, '.scw-bid-review-v2__sowtab-badge'))]),
  [['1589', 'Original'], ['1628', 'Alternate']]);
check('the full SOW name on its own line (long names included), with the hover title',
  tabEls.slice(0, 2).map(t => [txt(q(t, '.scw-bid-review-v2__sowtab-name')), q(t, '.scw-bid-review-v2__sowtab-name').getAttribute('title') === txt(q(t, '.scw-bid-review-v2__sowtab-name'))]),
  [[NAMES.s1, true], [NAMES.s2, true]]);
check('the counts line — the same families as the worksheet header line, attached mounts included',
  tabEls.slice(0, 2).map(t => txt(q(t, '.scw-bid-review-v2__sowtab-counts'))), ['2 cameras · 1 mount · 1 headend', '1 camera']);
check('the state line: reviewed + gaps + queued change requests / pick a basis + bids in',
  tabEls.slice(0, 2).map(t => [txt(q(t, '.scw-bid-review-v2__sowtab-state')), q(t, '.scw-bid-review-v2__sowtab-state').className.replace(/.*--/, '')]),
  [['✓ reviewed · 3 gaps · 3 change requests queued', 'ok'], ['○ pick a basis bid · 1 bid in', 'todo']]);
check('the unmatched tab carries its count and no badge', [txt(q(tabEls[2], '.scw-bid-review-v2__sowtab-count')), !!q(tabEls[2], '.scw-bid-review-v2__sowtab-badge'), txt(q(tabEls[2], '.scw-bid-review-v2__sowtab-counts'))], ['3', false, 'bid lines on no SOW']);
check('"N of M scopes reviewed" counts the real SOWs only', txt(q(tabs, '.scw-bid-review-v2__sowtabs-meta')), '1 of 2 scopes reviewed');
check('default = the Original: only its section is active; the others are not folded, just inactive',
  [sec1.classList.contains('scw-bid-review-v2__sow--active'), sec2.classList.contains('scw-bid-review-v2__sow--active'), secN.classList.contains('scw-bid-review-v2__sow--active'),
   tabEls[0].getAttribute('aria-selected'), !q(tabEls[0], '[data-scw-br-v2-rename]').hidden, q(tabEls[1], '[data-scw-br-v2-rename]').hidden],
  [true, false, false, 'true', true, true]);
// Section fold is off under the tabs: a persisted fold must not hide the one visible grid.
sec1.classList.add('scw-bid-review-v2__sow--collapsed');
tabEls[1].click();
check('clicking a tab switches the active section and persists the choice per scene + project',
  [sec1.classList.contains('scw-bid-review-v2__sow--active'), sec2.classList.contains('scw-bid-review-v2__sow--active'), sec1.classList.contains('scw-bid-review-v2__sow--collapsed'),
   window.localStorage.getItem('scw:br-v2:sow-tab:scene_1155:' + PROJECT)],
  [false, true, false, 's2']);
buildPage(); ns.header.afterRender(body);
check('a rebuild keeps the stored tab', q(body, '.scw-bid-review-v2__sow--active').getAttribute('data-sow-id'), 's2');
const s1 = q(body, '.scw-bid-review-v2__sow[data-sow-id="s1"]'), s2 = q(body, '.scw-bid-review-v2__sow[data-sow-id="s2"]');
check('the tab strip is rebuilt in place (one strip)', qa(container, ':scope > .scw-bid-review-v2__sowtabs').length, 1);

// ── Status line (the old SOW header) ───────────────────────────────────────────────────
const hdr = q(s1, '.scw-bid-review-v2__sow-header');
const scopeBtn = q(hdr, '[data-scw-br-v2-scope]');
check('the header is no longer a fold button and leads with the scope summary disclosure',
  [hdr.getAttribute('role'), hdr.getAttribute('tabindex'), !!scopeBtn, txt(scopeBtn), scopeBtn.getAttribute('aria-expanded')], [null, '-1', true, 'Scope summary ▸', 'false']);
scopeBtn.click();
const holder = q(hdr, '.scw-bid-review-v2__scope-holder');
check('Scope summary ▸ unfolds the worksheet scope strip for this SOW (built on first open)',
  [holder.hidden, !!q(holder, '.scw-ws-v2-scope'), txt(q(holder, '.scw-ws-v2-scope-tile--cam .scw-ws-v2-scope-n')), txt(q(holder, '.scw-ws-v2-scope-mounts')), scopeBtn.getAttribute('aria-expanded'), txt(scopeBtn)],
  [false, true, '2', '1 mount', 'true', 'Scope summary ▾']);
check('the strip carries no money on this page', !!q(holder, '.scw-ws-v2-scope-corner'), false);
// A tile highlights that family's rows (ids ride on the tile), the warning-chip gesture.
const tbody1 = q(s1, 'tbody');
for (const id of ['c1', 'c2', 'n1']) { const tr = document.createElement('tr'); tr.className = 'scw-bid-review-v2__row'; tr.setAttribute('data-sow-item-id', id); tr.innerHTML = '<td>row ' + id + '</td>'; tbody1.appendChild(tr); }
const camTile = q(holder, '.scw-ws-v2-scope-tile--cam');
camTile.click();
check('a scope tile toggles a highlight on the grid rows of that family, one family at a time',
  [qa(s1, 'tr.scw-bid-review-v2__row--scope-hl').map(tr => tr.getAttribute('data-sow-item-id')), camTile.getAttribute('aria-pressed')], [['c1', 'c2'], 'true']);
camTile.click();
check('a second tile click clears it', [qa(s1, 'tr.scw-bid-review-v2__row--scope-hl').length, camTile.getAttribute('aria-pressed')], [0, 'false']);
scopeBtn.click();
check('a second click folds it', holder.hidden, true);

// ── SCW's card ─────────────────────────────────────────────────────────────────────────
check('SCW column title', txt(q(s1, '.scw-bid-review-v2__th--sow.scw-bid-review-v2__head-cell--title .scw-bid-review-v2__head-title')), 'SCW · SOW');
const slot = q(s1, '.scw-bid-review-v2__basis-slot');
check('the diff bar\'s basis picker moved into SCW\'s card (workflow slot, first), gone from the bar',
  [!!q(slot, 'select[data-scw-sbd-basis]'), slot.parentNode.classList.contains('scw-bid-review-v2__head--sow-details'), slot === slot.parentNode.firstElementChild, !!q(s1, '.scw-sbd-inline .scw-sbd-baseline')],
  [true, true, true, false]);
const next = q(s1, '.scw-bid-review-v2__nextstep');
check('"Next step": the mirrored review state ahead of the Preview Proposal pill, "auto-saved" trimmed',
  [txt(q(next, '.scw-bid-review-v2__nextstep-label')), txt(q(next, '.scw-bid-review-v2__ready')), q(next, '.scw-bid-review-v2__ready').className, next.nextElementSibling.classList.contains('scw-bid-review__sow-actions')],
  ['Next step', '✓ Reviewed', 'scw-bid-review-v2__ready scw-bid-review-v2__ready--ready', true]);
check('no basis yet (s2): the review state reads the diff bar\'s own words', txt(q(s2, '.scw-bid-review-v2__ready')), 'Pick a basis bid');

// ── Sub cards ──────────────────────────────────────────────────────────────────────────
const titleA = q(s1, '.scw-bid-review-v2__head-cell--title[data-pkg-id="pkgA"]');
const titleB = q(s1, '.scw-bid-review-v2__head-cell--title[data-pkg-id="pkgB"]');
check('basis card: radio checked, BASIS badge, basis frame; the other: unchecked + "Set as basis"',
  [q(titleA, '[data-scw-br-v2-basis-radio]').checked, q(titleA, '.scw-bid-review-v2__basis-badge').hidden, q(titleA, '.scw-bid-review-v2__basis-radio-label').hidden, titleA.classList.contains('scw-bid-review-v2__head-cell--basis'),
   q(titleB, '[data-scw-br-v2-basis-radio]').checked, q(titleB, '.scw-bid-review-v2__basis-badge').hidden, txt(q(titleB, '.scw-bid-review-v2__basis-radio-label')), titleB.classList.contains('scw-bid-review-v2__head-cell--basis')],
  [true, false, true, true, false, true, 'Set as basis', false]);
check('who-row keeps the sub name (the existing title element, moved) + the bid label',
  [txt(q(titleA, '.scw-bid-review-v2__card-who .scw-bid-review-v2__head-title')), txt(q(titleA, '.scw-bid-review-v2__card-pkglabel'))], ['SVS', 'BD-141']);
check('basis-filter still parks its "Show all bids" pill on the basis column and hides the other column',
  [!!q(titleA, '.scw-bid-review-v2__basis-toggle'), titleB.classList.contains('scw-bid-review-v2__pkg-col--basis-hidden')], [true, true]);
check('money rule: a difference is never good news — "$X off the SOW", amber; a match is green',
  [txt(q(s1, '.scw-bid-review-v2__head-cell--totals[data-pkg-id="pkgA"] .scw-bid-review-v2__head-delta')), q(s1, '.scw-bid-review-v2__head-cell--totals[data-pkg-id="pkgA"] .scw-bid-review-v2__head-delta').className.indexOf('--gap') > 0,
   txt(q(s1, '.scw-bid-review-v2__head-cell--totals[data-pkg-id="pkgB"] .scw-bid-review-v2__head-delta'))],
  ['$1,580.00 off the SOW', true, '✓ matches the SOW']);
const detA = q(s1, '.scw-bid-review-v2__head-cell--details[data-pkg-id="pkgA"]');
const detB = q(s1, '.scw-bid-review-v2__head-cell--details[data-pkg-id="pkgB"]');
check('status line of the sub card: PDF · Submitted · Reopen Bid on one line',
  qa(q(detA, '.scw-bid-review-v2__head-statusline'), ':scope > *').map(e => e.className.split(' ')[0]),
  ['scw-bid-review-v2__pdf-link', 'scw-bid-review-v2__status-badge', 'scw-bid-review__btn']);
check('the gap count mirrors into the BASIS card only', [q(detA, '.scw-bid-review-v2__gap').hidden, txt(q(detA, '.scw-bid-review-v2__gap')), q(detB, '.scw-bid-review-v2__gap').hidden], [false, '3 gaps', true]);
const actA = q(s1, '.scw-bid-review-v2__head-cell--actions[data-pkg-id="pkgA"]');
const actB = q(s1, '.scw-bid-review-v2__head-cell--actions[data-pkg-id="pkgB"]');
check('actions slot says what it acts on, over ONE primary: the preview modal, relabelled',
  [txt(q(actA, '.scw-bid-review-v2__card-actions-line')), q(actA, '.scw-bid-review-v2__card-primary').getAttribute('data-action'), txt(q(actA, '.scw-bid-review-v2__card-primary'))],
  ['3 change requests queued for SVS, not sent yet', 'cr_preview', 'Review & send to SVS']);
check('with nothing queued the primary is "Request changes on selected…" (the bulk CR button, moved)',
  [txt(q(actB, '.scw-bid-review-v2__card-actions-line')), q(actB, '.scw-bid-review-v2__card-primary').getAttribute('data-action'), txt(q(actB, '.scw-bid-review-v2__card-primary'))],
  ['no change requests queued', 'cr_bulk_selected', 'Request changes on selected…']);
const menuA = q(actA, '.scw-bid-review-v2__menu');
check('the ⋮ menu holds the rest, same data-actions (v1 handlers), set-as-basis hidden on the basis card',
  qa(menuA, 'button, a').map(b => [b.getAttribute('data-action') || (b.hasAttribute('data-scw-br-v2-setbasis') ? 'set-basis' : b.tagName.toLowerCase()), txt(b), !!b.hidden]),
  [['set-basis', 'Set as basis bid', true], ['a', 'Open bid PDF', false], ['cr_bulk_selected', 'Request changes on selected rows…', false], ['cr_clear_all', 'Discard the 3 queued requests', false],
   ['package_copy_to_sow', 'Update SOW to match this bid…', false], ['package_create_sow', 'Create a new SOW from this bid…', false]]);
check('the direct submit button is out of sight (sending happens from the preview modal); old groups hidden',
  [q(actA, '[data-action="cr_submit"]').hidden, qa(actA, '.scw-bid-review-v2__head-group').every(g => g.hidden)], [true, true]);
check('the menu buttons keep the head-btn class init.js routes to v1', q(menuA, '[data-action="cr_clear_all"]').classList.contains('scw-bid-review-v2__head-btn'), true);
check('the non-basis card offers "Set as basis bid", no PDF item (none on file), and its bulk button is the primary, not a menu item',
  qa(q(actB, '.scw-bid-review-v2__menu'), 'button, a').map(b => [txt(b), !!b.hidden]), [['Set as basis bid', false], ['Update SOW to match this bid…', false], ['Create a new SOW from this bid…', false]]);
const toggleA = q(actA, '[data-scw-br-v2-menu-toggle]');
toggleA.click();
check('⋮ opens its menu', [menuA.hidden, toggleA.getAttribute('aria-expanded')], [false, 'true']);
document.body.click();
check('a click elsewhere closes it', [menuA.hidden, toggleA.getAttribute('aria-expanded')], [true, 'false']);

// ── Basis bridge: the radio / menu drive the diff bar's own <select> ───────────────────
const seen = [];
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('select[data-scw-sbd-basis]')) seen.push([e.target.getAttribute('data-sow-id'), e.target.value]); });
const radioB = q(titleB, '[data-scw-br-v2-basis-radio]');
radioB.checked = true; radioB.dispatchEvent(new window.Event('change', { bubbles: true }));
check('the radio sets the select and fires ONE change (sub-bid-diff persists, basis-filter repaints)', [seen, q(slot, 'select').value], [[['s1', 'pkgB']], 'pkgB']);
q(slot, 'select').value = 'pkgA';
q(actB, '[data-scw-br-v2-setbasis]').click();
check('"Set as basis bid" in the menu does the same', [seen.length, seen[1], q(slot, 'select').value], [2, ['s1', 'pkgB'], 'pkgB']);
q(slot, 'select').value = 'pkgA';

// ── Column labels row + documents row ──────────────────────────────────────────────────
const labels = q(s1, 'tr.scw-bid-review-v2__collabels');
check('the Line item / Photos labels sit in a row directly above the line items, after the documents row',
  [!!labels, labels.previousElementSibling.classList.contains('scw-bid-review-v2__docs-row'), labels.parentNode.tagName, qa(labels, 'td').map(td => txt(td))],
  [true, true, 'TBODY', ['Line item', 'Photos', 'SCW · SOW', 'SVSBD-141Basis', 'ACMEBD-93Basis']]);
check('bid label cells ride the column (class + pkg id) so the filter hides them with it; the basis marker on the basis column only',
  qa(labels, 'td.scw-bid-review-v2__collabel--pkg').map(td => [td.getAttribute('data-pkg-id'), td.classList.contains('scw-bid-review-v2__pkg-col'), td.classList.contains('scw-bid-review-v2__pkg-col--basis-hidden'), q(td, '.scw-bid-review-v2__collabel-basis').hidden]),
  [['pkgA', true, false, false], ['pkgB', true, true, true]]);

// ── Rename from the active tab ─────────────────────────────────────────────────────────
const saves = [];
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('.scw-bid-review__sow-name-input')) saves.push([e.target.getAttribute('data-sow-id'), e.target.value]); });
const tab2 = q(container, '[data-scw-br-v2-tab="s2"]');
q(tab2, '[data-scw-br-v2-rename]').click();
const inp = q(tab2, '.scw-bid-review-v2__sowtab-input');
check('✎ opens an inline editor prefilled with the name', [!!inp, inp.value, q(tab2, '.scw-bid-review-v2__sowtab-name').hidden], [true, NAMES.s2, true]);
inp.value = 'Parking Lot Sign';
inp.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
check('Enter writes the hidden SOW Name input and fires its change (v1 saves), the tab shows the new name',
  [saves, q(s2, '.scw-bid-review__sow-name-input').value, txt(q(tab2, '.scw-bid-review-v2__sowtab-name')), !!q(tab2, '.scw-bid-review-v2__sowtab-input')],
  [[['s2', 'Parking Lot Sign']], 'Parking Lot Sign', 'Parking Lot Sign', false]);

// ── No basis = every bid shows (the radios are the picker); K1 still folds them away ───
check('basis-filter: no basis → nothing hidden under the rework', ns.basisFilter.hiddenFor('s2', ['pkgA', 'pkgB']), null);
basisMap.s2 = 'K1';
check('K1 (self-perform) still hides every bid column', ns.basisFilter.hiddenFor('s2', ['pkgA', 'pkgB']), { pkgA: true, pkgB: true });
basisMap.s2 = '';
ns.CONFIG.headerRework = false;
check('without the rework the old no-basis rule holds (hide all)', ns.basisFilter.hiddenFor('s2', ['pkgA', 'pkgB']), { pkgA: true, pkgB: true });
ns.CONFIG.headerRework = true;

// ── Mirrors follow the diff bar ────────────────────────────────────────────────────────
const bar1 = q(s1, '.scw-sbd-inline-bar');
q(bar1, '.scw-sbd-ready').className = 'scw-sbd-ready scw-sbd-ready--needs-note';
q(bar1, '.scw-sbd-ready').textContent = 'Add a reviewer note';
q(bar1, '.scw-sbd-bargap').textContent = '⚠ 1 gap';
ns.header.syncAll();
check('a diff-bar re-render re-syncs the Next step pill, the gap count, the tab state and the reviewed count',
  [txt(q(s1, '.scw-bid-review-v2__ready')), q(s1, '.scw-bid-review-v2__ready').className.replace(/.*--/, ''), txt(q(detA, '.scw-bid-review-v2__gap')),
   txt(q(container, '[data-scw-br-v2-tab="s1"] .scw-bid-review-v2__sowtab-state')), txt(q(container, '.scw-bid-review-v2__sowtabs-meta'))],
  ['Add a reviewer note', 'needs-note', '1 gap', '● basis chosen · 1 gap · 3 change requests queued', '0 of 2 scopes reviewed']);

// ── Kill switch ────────────────────────────────────────────────────────────────────────
ns.CONFIG.headerRework = false;
ns.header.afterRender(body);
check('CONFIG.headerRework=false drops the tabs-mode hooks', [container.classList.contains('scw-bid-review-v2--tabs'), document.documentElement.hasAttribute('data-scw-br-v2-tabs')], [false, false]);

console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: all passed');
process.exit(fails ? 1 : 0);
