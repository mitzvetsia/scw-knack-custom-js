// jsdom smoke test: the role read-only gate (2026-10-28). "SCW Sales" sees Build SOWs (scene_1085)
// and Reconcile Bids (scene_1155) read-only; "SCW Install Ops" / "SCW Sales Manager" / "Admin" win
// over it (full access); Manage Deployment (scene_1311) is never locked; no readable role fails OPEN.
// On a locked scene: a banner, body.scw-role-ro, worksheet-v2 panels wear .scw-ws-v2--readonly,
// edit controls are hidden / read-only and their clicks and submits are blocked at capture, while
// viewing controls (tabs, group heads, search, filters, close buttons, plain links) stay live.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#build-sows/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.MutationObserver = window.MutationObserver;
global.localStorage = window.localStorage; global.sessionStorage = window.sessionStorage; global.Event = window.Event;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; },
  ajaxError() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; jq.ajax = () => ({ done() { return this; }, fail() { return this; }, always() { return this; } });
window.$ = jq; window.jQuery = jq; global.$ = jq;
let roleNames = ['SCW Sales'];
window.Knack = { views: {}, router: { current_scene_key: 'scene_1085' },
  getUserAttributes() { return { id: 'u1', name: 'Rep', email: 'rep@getscw.com' }; },
  getUserRoleNames() { return roleNames.join(', '); } };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {}, worksheetV2: { data: { subscribe() {} } },
  bidReview: { renderToast() {} } };
global.SCW = window.SCW;
function load(rel) {
  new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/' + rel), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function scene(key) {
  window.Knack.router.current_scene_key = key;
  document.body.className = '';
  document.body.innerHTML =
    '<div class="kn-scene" id="kn-' + key + '">' +
      '<div id="scw-pid-hero"><a href="#manage-deployment/x" class="scw-phn-tab">Manage Deployment</a></div>' +
      '<div class="kn-view kn-form" id="view_9001"><form><input id="fName" type="text" value="Name"><div class="kn-submit"><button type="submit" id="bSubmit">Submit</button></div></form></div>' +
      '<div class="kn-view kn-table" id="view_9002">' +
        '<div class="kn-records-nav"><div class="kn-search"><form id="fSearch"><input id="iSearch" type="text" placeholder="search"><button type="submit" id="bSearch">Search</button></form></div>' +
        '<a class="kn-add-filter" id="aFilter" href="#">Add filters</a><div class="kn-per-page"><select id="sPer"><option>25</option></select></div></div>' +
        '<table><tr><td class="field_1 cell-edit" id="tdEdit">1</td><td class="kn-table-link"><a href="#edit-sow/1" id="aEdit">edit</a></td><td><a class="kn-link-delete" href="#" id="aDel">delete</a></td></tr></table>' +
        '<a href="#build-sows/x/add-note/" id="aAdd">Add note</a>' +
      '</div>' +
      '<div class="scw-ws-v2" id="scw-ws-v2-view_3962">' +
        '<div class="scw-ws-v2-sowctx"><button class="scw-ws-v2-sowctx-tab" id="bTab">1589</button><button class="scw-ws-v2-sowctx-choose" id="bChoose">Show all</button></div>' +
        '<div class="scw-ws-v2-toolbar"><button id="bAdd">+ Add to SOW</button><button id="bPhotos">+ Add Photos</button></div>' +
        '<div class="scw-ws-v2-search"><input class="scw-ws-v2-search-input" id="iWsSearch" type="text"><button class="scw-ws-v2-search-clear" id="bClear">×</button></div>' +
        '<div class="scw-ws-v2-scope"><button class="scw-ws-v2-scope-tile" id="bTile">Cameras</button><button class="scw-ws-v2-scope-prodtoggle" id="bProd">Products (3)</button></div>' +
        '<div class="scw-ws-v2-group-head" id="dHead"><button class="scw-ws-v2-group-toggle" id="bGroup">MDF</button></div>' +
        '<div class="scw-ws-v2-card"><input type="checkbox" class="scw-ws-v2-select" id="cbSel"><div data-scw-ws-v2-edit="field_1964" id="dEdit">1</div><div data-scw-ws-v2-conn="field_1946" id="dConn">MDF</div>' +
          '<input type="text" id="iQty" value="1"><textarea id="tNotes">n</textarea><select id="sProd"><option>x</option></select><button id="bTrash">Delete</button>' +
          '<button class="scw-ws-v2-photo-view" id="bPhoto">photo</button><a href="#build-sows/x/item/1" id="aItem">open</a></div>' +
      '</div>' +
      '<div class="scw-bid-review-v2" id="scw-bid-review-v2">' +
        '<div class="scw-bid-review-v2__sowtabs"><button class="scw-bid-review-v2__sowtab" id="bSowTab">1105</button><button class="scw-bid-review-v2__sowtab-rename" data-scw-br-v2-rename="s1" id="bRename">✎</button></div>' +
        '<div class="scw-ws-v2-toolbar scw-bid-review-v2__toolbar"><button class="scw-ws-v2-toolbar-btn" id="bExpand">Expand all</button><button class="scw-ws-v2-toolbar-btn" id="bAddSow">+ Add to SOW</button></div>' +
        '<label class="scw-bid-review-v2__basis-radio"><input type="radio" data-scw-br-v2-basis-radio="p1" data-sow-id="s1" id="rBasis"></label>' +
        '<button data-action="cr_preview" id="bCr">Review &amp; send</button><button data-action="package_copy_to_sow" id="bCopy">Update SOW…</button>' +
        '<button class="scw-bid-review-v2__row-caret" id="bCaret">▸</button>' +
        '<div class="scw-bid-review-v2__cell-actions"><button data-action="cell_revise" id="bRevise">Revise ▾</button></div>' +
        '<input type="checkbox" class="scw-br-v2-rowselect" id="cbRow">' +
        '<textarea data-scw-sbd-note id="tNote">why</textarea><select data-scw-sbd-basis id="sBasis"><option>Bid 8</option></select>' +
        '<button data-scw-sbd-collapse id="bFold">Fold</button><button data-scw-tray-add="i1" id="bTray">+ Add to this SOW</button><button data-scw-tray-toggle id="bTrayT">Items not on this SOW</button>' +
        '<div class="scw-basis-filter"><button id="bShowAll">Show all bids (+2)</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="scw-some-modal"><button id="bModalClose" class="scw-modal-close">Close</button><button id="bModalSave">Save</button><input type="file" id="iFile"></div>';
}
load('util.js');
scene('scene_1085');
load('features/role-readonly.js');
const RO = window.SCW.roleReadonly;

function clicked(id) {
  const el = document.getElementById(id);
  let reached = false;
  const h = () => { reached = true; };
  el.addEventListener('click', h);          // bubble-phase handler = what a module would see
  const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  const notCancelled = el.dispatchEvent(ev);
  el.removeEventListener('click', h);
  return reached && notCancelled;
}
function submitted(id) {
  const f = document.getElementById(id);
  const ev = new window.Event('submit', { bubbles: true, cancelable: true });
  return f.dispatchEvent(ev);
}
const hidden = id => document.getElementById(id).hasAttribute('data-scw-ro-denied');
const q = sel => document.querySelector(sel);

(async () => {
  // ── roles ─────────────────────────────────────────────────────────────────────────────────────
  check('SCW.userRoleNames reads Knack.getUserRoleNames (comma-joined)', window.SCW.userRoleNames(), ['SCW Sales']);
  check('SCW.hasRole is whole-name, case-insensitive', [window.SCW.hasRole('scw sales'), window.SCW.hasRole('SCW Sales Manager')], [true, false]);
  check('decide: SCW Sales alone → read-only', RO.decide().mode, 'readonly');
  roleNames = ['SCW Sales', 'SCW Sales Manager'];
  check('decide: a full-access role wins over SCW Sales', [RO.decide().mode, RO.decide().why], ['full', 'full-access role: SCW Sales Manager']);
  roleNames = ['SCW Admin'];
  check('decide: "Admin" matches as a whole word inside a role name', RO.decide().mode, 'full');
  roleNames = ['SCW Install Ops'];
  check('decide: Install Ops → full', RO.decide().mode, 'full');
  roleNames = ['Subcontractor'];
  check('decide: an unlisted role → full (only SCW Sales is read-only)', RO.decide().mode, 'full');
  roleNames = [];
  check('decide: no readable role → unknown (fails open)', RO.decide().mode, 'unknown');
  localStorage.setItem('scw:role-sim', 'SCW Sales');
  check('localStorage scw:role-sim replaces the live roles (test seam for ops)', [window.SCW.userRoleNames(), RO.decide().mode], [['SCW Sales'], 'readonly']);
  localStorage.removeItem('scw:role-sim');

  // ── lock on Build SOWs ────────────────────────────────────────────────────────────────────────
  roleNames = ['SCW Sales'];
  RO.refresh();
  check('locked: body class + scene attribute + banner at the top of the scene',
    [document.body.classList.contains('scw-role-ro'), document.body.getAttribute('data-scw-role-ro-scene'),
     !!q('#kn-scene_1085 > #scw-role-ro-banner'), q('#scw-role-ro-banner').textContent.indexOf('Build SOWs') > 0,
     q('#scw-role-ro-banner').textContent.indexOf('SCW Sales') > 0],
    [true, 'scene_1085', true, true, true]);
  check('the worksheet-v2 panel wears the read-only class', q('#scw-ws-v2-view_3962').classList.contains('scw-ws-v2--readonly'), true);
  check('edit controls are marked: worksheet add / photos / trash / bulk box, card inputs read-only, select disabled',
    [hidden('bAdd'), hidden('bPhotos'), hidden('bTrash'), hidden('cbSel'), q('#iQty').readOnly, q('#tNotes').readOnly, q('#sProd').disabled, q('#cbSel').disabled],
    [true, true, true, true, true, true, true, true]);
  check('Knack form: input read-only, Submit hidden + blocked', [q('#fName').readOnly, hidden('bSubmit'), submitted('fSearch'), (() => { const f = q('#view_9001 form'); return f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); })()],
    [true, true, true, false]);
  check('viewing controls stay unmarked: context tabs + chooser, search box + clear, scope tiles, Products toggle, group toggle, per-page select',
    [hidden('bTab'), hidden('bChoose'), q('#iWsSearch').readOnly, hidden('bClear'), hidden('bTile'), hidden('bProd'), hidden('bGroup'), q('#sPer').disabled, q('#iSearch').readOnly],
    [false, false, false, false, false, false, false, false, false]);
  check('clicks: denied controls never reach their handlers; viewing controls do',
    [clicked('bAdd'), clicked('bTrash'), clicked('dEdit'), clicked('dConn'), clicked('tdEdit'), clicked('aDel'), clicked('aEdit'), clicked('aAdd'),
     clicked('bTab'), clicked('bChoose'), clicked('bTile'), clicked('bGroup'), clicked('aItem'), clicked('bPhoto'), clicked('aFilter')],
    [false, false, false, false, false, false, false, false, true, true, true, true, true, true, true]);
  check('a change on a denied input is stopped at capture',
    (() => { const i = q('#iQty'); let seen = false; i.addEventListener('change', () => { seen = true; });
             i.dispatchEvent(new window.Event('change', { bubbles: true, cancelable: true })); return seen; })(), false);
  check('modals mounted on <body>: Close stays live, Save and the file input are denied',
    [hidden('bModalClose'), clicked('bModalClose'), hidden('bModalSave'), clicked('bModalSave'), q('#iFile').disabled], [false, true, true, false, true]);
  // reconcile-grid controls on the same page (the selectors, not the scene)
  check('reconcile controls: SOW tab, caret, fold, tray toggle, Expand all, Show all bids live; rename, basis radio, data-actions, row box, note, tray add, + Add to SOW denied',
    [hidden('bSowTab'), hidden('bCaret'), hidden('bFold'), hidden('bTrayT'), hidden('bExpand'), hidden('bShowAll'),
     hidden('bRename'), hidden('rBasis'), hidden('bCr'), hidden('bCopy'), hidden('bRevise'), hidden('cbRow'), q('#tNote').readOnly, q('#sBasis').disabled, hidden('bTray'), hidden('bAddSow')],
    [false, false, false, false, false, false, true, true, true, true, true, true, true, true, true, true]);
  check('…and their clicks', [clicked('bSowTab'), clicked('bExpand'), clicked('bShowAll'), clicked('bCr'), clicked('bRename'), clicked('bTray'), clicked('bAddSow')],
    [true, true, true, false, false, false, false]);

  // ── re-render: new controls get the belt from the observer ────────────────────────────────────
  RO._observe();
  q('#scw-ws-v2-view_3962').insertAdjacentHTML('beforeend', '<button id="bLate">Save changes</button><button class="scw-ws-v2-sowctx-tab" id="bLateTab">1628</button>');
  await sleep(260);
  check('controls added after the lock are marked on the next tick; viewing ones are not', [hidden('bLate'), hidden('bLateTab')], [true, false]);

  // ── full access: same page, nothing locked ────────────────────────────────────────────────────
  roleNames = ['SCW Sales', 'SCW Install Ops'];
  RO.refresh();
  check('full-access role: lock released, banner gone, marks removed, inputs editable again',
    [document.body.classList.contains('scw-role-ro'), !!q('#scw-role-ro-banner'), hidden('bAdd'), q('#iQty').readOnly, q('#sProd').disabled,
     q('#scw-ws-v2-view_3962').classList.contains('scw-ws-v2--readonly'), clicked('bAdd')],
    [false, false, false, false, false, false, true]);

  // ── Reconcile Bids locks too; Manage Deployment never ─────────────────────────────────────────
  roleNames = ['SCW Sales'];
  scene('scene_1155'); RO.refresh();
  check('Reconcile Bids (scene_1155) locks for SCW Sales', [document.body.classList.contains('scw-role-ro'), q('#scw-role-ro-banner').textContent.indexOf('Reconcile Bids') > 0, hidden('bCr')], [true, true, true]);
  scene('scene_1311'); RO.refresh();
  check('Manage Deployment (scene_1311) is never locked', [document.body.classList.contains('scw-role-ro'), !!q('#scw-role-ro-banner'), hidden('bAdd'), clicked('bAdd')], [false, false, false, true]);
  roleNames = [];
  scene('scene_1085'); RO.refresh();
  check('no readable role on a listed scene → open (fails open)', [document.body.classList.contains('scw-role-ro'), clicked('bAdd')], [false, true]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
