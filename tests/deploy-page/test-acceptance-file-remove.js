// jsdom smoke test: acceptance-card.js — remove (and replace) a signed PDF (2026-10-30).
// "I need the ability to remove a signed PDF document from an acceptance record." The uploader
// modal had carried "Remove file" since 2026-10-02, but fileSlot's proposal-sourced guard read
// `fk !== F.bidPdf`, which sent a POPULATED signed-agreement tile down the read-only branch: a
// plain link, no pencil, no modal — so neither replace nor remove was reachable once the PDF was
// on the record. Now a populated tile of the acceptance's OWN file fields (field_2767 agreement,
// field_2947 bid PDF stamp) carries a hover × (confirm → clear through the view → refetch → toast)
// and opens the uploader whose footer leads with "Remove file"; the proposal-sourced bid PDF
// (field_2945) stays a read-only link; the sub dashboard renders no remove at all.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/59277492086' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
const renders = {};
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
// Short timers (renders, the toast's "is-in") run at once; the toast's 4.5 s takedown never
// does, so a toast stays in the DOM for the assertions.
window.setTimeout = function (fn, ms) { if ((ms || 0) <= 200) fn(); return 0; }; global.setTimeout = window.setTimeout;
let fetched = 0;
window.Knack = { views: { view_3914: { model: { fetch() { fetched++; } } } }, router: { current_scene_key: 'scene_1311' },
                 api_url: 'https://api.knack.com', application_id: 'app1', getUserToken() { return 'tok'; } };
global.Knack = window.Knack;
const puts = [];
let putFail = 0;
window.SCW = {
  CONFIG: {}, debug() {}, onViewRender(v, fn) { renders[v] = fn; },
  knackRecordUrl(v, id) { return 'https://api.knack.com/v1/pages/scene_1311/views/' + v + '/records/' + id; },
  knackAjax(o) { puts.push({ url: o.url, type: o.type, body: JSON.parse(o.data) }); if (putFail) o.error({ status: putFail }); else o.success({ id: 'x' }); }
};
global.SCW = window.SCW;
let confirmAnswer = true; const confirms = [];
window.confirm = function (msg) { confirms.push(msg); return confirmAnswer; }; global.confirm = window.confirm;
console.warn = () => {};
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/acceptance-card.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

const ASSET = 'https://api.knack.com/v1/applications/app1/download/asset/64a1b2c3d4e5f6a7b8c9d0e1/';
function fileCell(fk, name) {
  return '<td class="' + fk + '">' + (name
    ? '<a class="kn-view-asset" href="' + ASSET + encodeURIComponent(name) + '" data-file-name="' + name + '">' + name + '</a>'
    : '&nbsp;') + '</td>';
}
const COLS = [['field_2755', 'Proposal'], ['field_2766', 'Signed'], ['field_2765', 'Paid'], ['field_2940', 'Terms'],
              ['field_3309', 'No sig'], ['field_3310', 'Not billable'], ['field_3311', 'Reason'],
              ['field_2767', 'Signed agreement'], ['field_2947', 'Bid PDF'], ['field_2945', 'Bid PDF (proposal)']];
function row(id, proposal, f) {
  f = f || {};
  return '<tr id="' + id + '">' +
    [['field_2755', proposal], ['field_2766', f.signed || 'No'], ['field_2765', 'No'], ['field_2940', 'No'],
     ['field_3309', 'No'], ['field_3310', 'No'], ['field_3311', '']].map(c => '<td class="' + c[0] + '">' + c[1] + '</td>').join('') +
    fileCell('field_2767', f.agreement) + fileCell('field_2947', f.bidPdf) + fileCell('field_2945', f.bidPdfProp) + '</tr>';
}
function grid(viewId, rows) {
  return '<div class="scw-ktl-accordion"><div class="scw-ktl-accordion__header"><span class="scw-acc-title">ACCEPTANCE</span>' +
    '<span class="scw-acc-count">' + rows.length + '</span></div><div class="scw-ktl-accordion__body">' +
    '<div class="kn-table kn-view" id="' + viewId + '"><div class="kn-table-wrapper"><table>' +
    '<thead><tr>' + COLS.map(c => '<th class="' + c[0] + '">' + c[1] + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + rows.join('') + '</tbody></table></div></div></div></div>';
}
function render(viewId, rows) {
  document.body.innerHTML = '<div id="kn-scene_1311">' + grid(viewId, rows) + '</div>';
  puts.length = 0; confirms.length = 0; fetched = 0;
  renders[viewId]();
}
const tick = () => new Promise(r => setImmediate(r));
const $1 = sel => document.querySelector(sel);
const tileOf = fk => { const b = $1('[data-remove-field="' + fk + '"]'); return b ? b.parentNode : null; };
const toastText = () => { const t = $1('.scw-acpt-toast'); return t ? [t.textContent, t.classList.contains('is-err')] : null; };

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

(async () => {
  // 1. A populated signed agreement is WRITABLE: the tile carries the × before the pencil and
  //    says so; the bid PDF stamp the same; the proposal-sourced bid PDF stays a read-only link.
  render('view_3914', [row('a1', '59277492086-SW1210 | 20260624-10393', { signed: 'Yes', agreement: 'SW1210 signed.pdf', bidPdf: 'bid-183.pdf' }),
                       row('a2', '59277492086-SW1779CO | 20260915-11608', { signed: 'Yes', agreement: 'SW1779CO signed.pdf', bidPdfProp: 'bid-184.pdf' })]);
  const agr = tileOf('field_2767');
  check('signed agreement tile: open link + × + pencil, in that order',
    agr ? [...agr.children].map(el => el.className + '|' + (el.getAttribute('data-remove-field') || el.getAttribute('data-edit-field'))) : null,
    ['scw-acpt-doc__open|field_2767', 'scw-acpt-doc__edit scw-acpt-doc__rm|field_2767', 'scw-acpt-doc__edit|field_2767']);
  check('the tile says the file can be removed',
    [agr && agr.querySelector('.scw-acpt-doc__open').getAttribute('title'), agr && agr.querySelector('.scw-acpt-doc__rm').getAttribute('title')],
    ['View, replace or remove signed agreement', 'Remove signed agreement']);
  check('no read-only styling on the acceptance\'s own populated tiles',
    [...document.querySelectorAll('.scw-acpt-doc--ro')].map(el => el.textContent.trim()), ['Bid PDF']);
  check('the bid PDF stamp (field_2947) gets its own ×; the proposal-sourced copy (field_2945) none',
    [!!$1('[data-remove-field="field_2947"]'), !!$1('[data-remove-field="field_2945"]'), !!$1('[data-edit-field="field_2945"]')],
    [true, false, false]);
  const ro = $1('.scw-acpt-doc--ro a');
  check('the read-only tile is a plain link to the asset', [ro && ro.getAttribute('href').indexOf(ASSET) === 0, ro && ro.getAttribute('target')], [true, '_blank']);
  check('two signed agreements on the card → two × buttons', document.querySelectorAll('[data-remove-field="field_2767"]').length, 2);

  // 2. An empty slot has no ×, only the dashed "+ add".
  render('view_3914', [row('a3', 'X-SW1300 | 3', {})]);
  check('empty slot: dashed add tile, no remove', [!!$1('button.scw-acpt-doc--missing[data-edit-field="field_2767"]'), !!$1('[data-remove-field]')], [true, false]);

  // 3. Declining the confirm writes nothing.
  render('view_3914', [row('a1', 'X-SW1210 | 1', { signed: 'Yes', agreement: 'SW1210 signed.pdf' })]);
  confirmAnswer = false;
  $1('[data-remove-field="field_2767"]').click();
  await tick();
  check('confirm declined: the file is named, no PUT, tile untouched',
    [confirms[0], puts.length, tileOf('field_2767').classList.contains('is-removing'), $1('[data-remove-field="field_2767"]').disabled],
    ['Remove "SW1210 signed.pdf" from this record?\n\nThe slot goes back to empty — you can upload a new file any time.', 0, false, false]);

  // 4. Confirmed: one PUT through view_3914 on that record clearing field_2767, then refetch + toast.
  confirmAnswer = true;
  $1('[data-remove-field="field_2767"]').click();
  check('the tile greys and locks while the clear is in flight', [tileOf('field_2767').classList.contains('is-removing'), $1('[data-remove-field="field_2767"]').disabled], [true, true]);
  await tick();
  check('one view-based PUT clearing the signed agreement',
    puts, [{ url: 'https://api.knack.com/v1/pages/scene_1311/views/view_3914/records/a1', type: 'PUT', body: { field_2767: null } }]);
  check('the grid refetches and the toast says so', [fetched, toastText()], [1, ['Signed agreement removed.', false]]);

  // 5. The bid PDF stamp clears its own field.
  render('view_3914', [row('a1', 'X-SW1210 | 1', { signed: 'Yes', bidPdf: 'bid-183.pdf' })]);
  $1('[data-remove-field="field_2947"]').click();
  await tick();
  check('bid PDF ×: PUT field_2947 null + its own toast', [puts.map(p => p.body), confirms[0].indexOf('bid-183.pdf') > 0, toastText()],
    [[{ field_2947: null }], true, ['Bid basis PDF removed.', false]]);

  // 6. A failed clear restores the tile and says why.
  render('view_3914', [row('a1', 'X-SW1210 | 1', { signed: 'Yes', agreement: 'SW1210 signed.pdf' })]);
  putFail = 403;
  $1('[data-remove-field="field_2767"]').click();
  await tick();
  check('403: tile restored, error toast names the failure, no refetch',
    [tileOf('field_2767').classList.contains('is-removing'), $1('[data-remove-field="field_2767"]').disabled, toastText(), fetched],
    [false, false, ['Could not remove the signed agreement — save failed (403)', true], 0]);
  putFail = 0;

  // 7. photo-edit-panel's verified clear is preferred when loaded (it retries with '' when Knack
  //    ignores null) — the card hands it the view, record and field.
  const pepCalls = [];
  window.SCW.photoEditPanel = { util: { clearFileField(v, id, fk, extra) { pepCalls.push([v, id, fk, extra]); return Promise.resolve({}); } } };
  render('view_3914', [row('a9', 'X-SW1210 | 1', { signed: 'Yes', agreement: 'SW1210 signed.pdf' })]);
  $1('[data-remove-field="field_2767"]').click();
  await tick();
  check('clearFileField preferred over the plain null PUT', [pepCalls, puts.length, fetched], [[['view_3914', 'a9', 'field_2767', {}]], 0, 1]);
  delete window.SCW.photoEditPanel;

  // 8. The pencil opens the uploader for the POPULATED agreement (it used to be unreachable):
  //    current file shown, "Remove file" leads the footer, and it removes through the same path.
  render('view_3914', [row('a1', 'X-SW1210 | 1', { signed: 'Yes', agreement: 'SW1210 signed.pdf' })]);
  $1('button[data-edit-field="field_2767"]').click();
  const modal = $1('.scw-acpt-m');
  const foot = modal && modal.querySelector('.scw-acpt-m__foot');
  check('uploader opens on the populated agreement with the current file',
    [modal && modal.querySelector('.scw-acpt-m__head').textContent, modal && modal.querySelector('.scw-acpt-cur__nm').textContent],
    ['Signed agreement', 'SW1210 signed.pdf']);
  check('footer order: Remove file | Cancel | Upload (destructive first)',
    foot ? [...foot.querySelectorAll('button')].map(b => b.textContent) : null, ['Remove file', 'Cancel', 'Upload']);
  foot.querySelector('.scw-acpt-m__btn--danger').click();
  await tick();
  check('modal Remove file: same confirm, same PUT, modal closed, toast',
    [confirms.length, puts.map(p => p.body), !!$1('.scw-acpt-m'), toastText()],
    [1, [{ field_2767: null }], false, ['Signed agreement removed.', false]]);

  // 9. The sub dashboard renders no remove and no editor at all.
  render('view_4066', [row('s1', 'X-SW1210 | 1', { signed: 'Yes', agreement: 'SW1210 signed.pdf', bidPdf: 'bid-183.pdf' })]);
  check('sub view: nothing removable, nothing editable', [document.querySelectorAll('[data-remove-field]').length, document.querySelectorAll('[data-edit-field]').length], [0, 0]);

  console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: all passed');
  process.exit(fails ? 1 : 0);
})();
