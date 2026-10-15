// jsdom smoke test: deploy-page ad-hoc photo delete (2026-10-15).
// On the ops deployment worksheet (view_4093) a photo that is NOT required and has NO photo type
// may be deleted outright — card trash + the modal's Delete button — after an are-you-SURE prompt.
// Required or typed photos keep disconnect + Remove photo only. Other surfaces are unchanged.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/64a1b2c3d4e5f6a7b8c9d0e1/deploy/64a1b2c3d4e5f6a7b8c9d0e1' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
window.requestAnimationFrame = fn => setTimeout(fn, 0); global.requestAnimationFrame = window.requestAnimationFrame;
window.scrollTo = () => {};
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' }, getUserToken() { return 't'; } }; global.Knack = window.Knack;

const ajaxCalls = [];
let confirmAnswer = true; const confirmCalls = [];
const opened = [];
window.SCW = {
  CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackAjax(o) { ajaxCalls.push(o); },
  knackRecordUrl(view, id) { return 'https://api.knack.com/v1/pages/scene_1311/views/' + view + '/records/' + id; },
  photoEditPanel: { SAVE_VIEWS: { view_4093: 'view_3937', view_3962: 'view_3584' }, util: {} },
  qaPopover: { openAnchor(el, id, snapshot) { opened.push({ id, snapshot }); } },
  worksheetV2: {
    confirmModal(opts) { confirmCalls.push(opts); return Promise.resolve(confirmAnswer); },
    data: { refetchAndNotify() {} },
    warnings: { invalidatePhotos() {} }
  }
};
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/photos.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const ns = window.SCW.worksheetV2;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const photo = (id, over) => Object.assign({
  id, imgUrl: 'https://s3/' + id + '.jpg', type: '', required: false, completed: true, notes: '',
  qaColumns: true, qaStatus: '', qaClient: '', qaNotes: '', qaHistory: '', qaCompletedBy: '', qaCompletedDate: ''
}, over || {});
const P_REQ   = photo('aaaaaaaaaaaaaaaaaaaaaaa1', { type: 'Installed Device Photo', required: true });
const P_TYPED = photo('aaaaaaaaaaaaaaaaaaaaaaa2', { type: 'Approved Camera View' });
const P_ADHOC = photo('aaaaaaaaaaaaaaaaaaaaaaa3');
const P_REQ_UNTYPED = photo('aaaaaaaaaaaaaaaaaaaaaaa4', { required: true });

// ── the rule ──────────────────────────────────────────────────────────
check('canDeleteAdhoc: deploy page, not required, no type → yes', ns.photos.canDeleteAdhoc('view_4093', P_ADHOC), true);
check('canDeleteAdhoc: typed → no', ns.photos.canDeleteAdhoc('view_4093', P_TYPED), false);
check('canDeleteAdhoc: required (even untyped) → no', ns.photos.canDeleteAdhoc('view_4093', P_REQ_UNTYPED), false);
check('canDeleteAdhoc: sub deploy page → no', ns.photos.canDeleteAdhoc('view_4056', P_ADHOC), false);
check('canDeleteAdhoc: sales page → no', ns.photos.canDeleteAdhoc('view_3586', P_ADHOC), false);
check('canDeleteAdhoc: no record id → no', ns.photos.canDeleteAdhoc('view_4093', photo('', {})), false);

// ── the cards ─────────────────────────────────────────────────────────
const strip = ns.photos.buildStripFromPhotos([P_REQ, P_TYPED, P_ADHOC, P_REQ_UNTYPED], 'rec1', 'view_4093');
document.body.appendChild(strip);
const cardOf = id => strip.querySelector('a.scw-ws-v2-photo-card[data-scw-ws-v2-photo-id="' + id + '"]');
const hasDel = id => !!cardOf(id).querySelector('.scw-ws-v2-photo-del');
const hasUnlink = id => !!cardOf(id).querySelector('.scw-ws-v2-photo-unlink');
check('deploy cards: only the ad-hoc photo gets the trash',
  [P_REQ.id, P_TYPED.id, P_ADHOC.id, P_REQ_UNTYPED.id].map(hasDel), [false, false, true, false]);
check('deploy cards: every photo keeps the disconnect button',
  [P_REQ.id, P_TYPED.id, P_ADHOC.id, P_REQ_UNTYPED.id].map(hasUnlink), [true, true, true, true]);
const adhocBtn = cardOf(P_ADHOC.id).querySelector('.scw-ws-v2-photo-del');
check('the ad-hoc trash is marked and says why it may go',
  [adhocBtn.getAttribute('data-scw-ws-v2-photo-adhoc'), /not required, no photo type/.test(adhocBtn.title)], ['1', true]);

const sowStrip = ns.photos.buildStripFromPhotos([P_REQ, P_ADHOC], 'rec2', 'view_3962');
check('build-SOW page unchanged: every card still has the (plain) trash',
  [...sowStrip.querySelectorAll('.scw-ws-v2-photo-del')].map(b => b.title), ['Delete photo', 'Delete photo']);
const subStrip = ns.photos.buildStripFromPhotos([P_ADHOC], 'rec3', 'view_4056');
check('sub deploy page: no trash on an ad-hoc photo', !!subStrip.querySelector('.scw-ws-v2-photo-del'), false);

// ── the prompt + the delete ───────────────────────────────────────────
function flush() { return new Promise(r => setTimeout(r, 5)); }
(async () => {
  // Keep it → nothing happens
  confirmAnswer = false;
  adhocBtn.click();
  await flush();
  check('the trash asks "Are you SURE?" before anything else',
    [confirmCalls.length, /Are you SURE\?/.test(confirmCalls[0].title), confirmCalls[0].okLabel, confirmCalls[0].cancelLabel],
    [1, true, 'Yes, delete it', 'Keep it']);
  check('the ad-hoc wording says why the photo may go', /not required and has no photo type/.test(confirmCalls[0].body), true);
  check('"Keep it" → no request, card stays', [ajaxCalls.length, !!cardOf(P_ADHOC.id)], [0, true]);

  // Yes, delete it → REST DELETE through the deploy scene's DOC_photos grid (no native row on the page)
  confirmAnswer = true;
  adhocBtn.click();
  await flush();
  check('"Yes, delete it" → one DELETE through view_3937, card dropped optimistically',
    [ajaxCalls.length, ajaxCalls[0] && ajaxCalls[0].type, ajaxCalls[0] && ajaxCalls[0].url, !!cardOf(P_ADHOC.id)],
    [1, 'DELETE', 'https://api.knack.com/v1/pages/scene_1311/views/view_3937/records/' + P_ADHOC.id, false]);
  ajaxCalls[0].success({});

  // A failed DELETE resolves false so the modal can say so
  const r = await (async () => {
    const p = ns.photos.deletePhotoRecord(P_TYPED.id, 'view_4093');
    await flush();
    ajaxCalls[1].error({ status: 403, responseText: 'nope' });
    return p;
  })();
  check('deletePhotoRecord resolves false on a failed DELETE', r, false);
  check('deletePhotoRecord resolves false where the scene has no delete plumbing',
    await ns.photos.deletePhotoRecord(P_ADHOC.id, 'view_4056'), false);

  // Path 1: a native delete link on the photo's row wins over the REST fallback
  const tr = document.createElement('tr'); tr.id = P_REQ.id;
  let clicked = 0;
  tr.innerHTML = '<td><a class="kn-link-delete" href="#">Delete</a></td>';
  tr.querySelector('a').addEventListener('click', e => { e.preventDefault(); clicked++; });
  document.body.appendChild(tr);
  const before = ajaxCalls.length;
  check('native kn-link-delete row → clicked, no REST call, resolves true',
    [await ns.photos.deletePhotoRecord(P_REQ.id, 'view_4093'), clicked, ajaxCalls.length - before], [true, 1, 0]);

  // ── the modal snapshot ───────────────────────────────────────────────
  // Live, a strip sits inside the worksheet host that carries the view key (the opener resolves
  // viewKey from the nearest [data-scw-ws-v2-view]).
  const host = document.createElement('div'); host.setAttribute('data-scw-ws-v2-view', 'view_4093');
  const strip2 = ns.photos.buildStripFromPhotos([P_TYPED, photo('aaaaaaaaaaaaaaaaaaaaaaa5')], 'rec4', 'view_4093');
  host.appendChild(strip2); document.body.appendChild(host);
  const cards = [...strip2.querySelectorAll('a.scw-ws-v2-photo-card')];
  cards.forEach(c => c.querySelector('img, .scw-ws-v2-photo-thumb, *').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })));
  check('the modal is opened for both cards', opened.length, 2);
  check('snapshot.canDelete: typed photo no, ad-hoc photo yes',
    opened.map(o => o.snapshot.canDelete), [false, true]);
  check('snapshot keeps required/viewKey', opened.map(o => [o.snapshot.required, o.snapshot.viewKey]), [[false, 'view_4093'], [false, 'view_4093']]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
