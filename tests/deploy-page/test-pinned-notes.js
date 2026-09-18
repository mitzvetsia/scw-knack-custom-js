// jsdom smoke test: pinned-notes.js renders the pinned strip under the project
// header from the notes grid's model, re-presents the grid as note cards
// (pinned first, Pin/Unpin per card, row links proxied to the hidden grid),
// saves through a view-based PUT, caps pins, and shows an empty state.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
const puts = []; let fetched = 0; let opened = null; const alerts = []; let pushed = 0;
window.alert = m => alerts.push(m);
const recs = [
  { id: 'a1', field_3278_raw: true,  field_328: '<p>Badge in at Gate 3; escort required.</p><p>Ask for Dana.</p>', field_327: '09/12/2026', field_678_raw: [{ id: 'u1', identifier: 'Gil Illescas' }] },
  { id: 'b2', field_3278_raw: false, field_328: 'Plain note', field_327: '09/13/2026', field_678: 'Micah Shearer' },
  { id: 'c3', field_3278_raw: true,  field_328: 'Avoid Friday installs.', field_327: '09/14/2026', field_678: 'Micah Shearer' },
  { id: 'd4', field_3278_raw: false, field_328: '<p>' + 'Long note. '.repeat(40) + '</p>', field_327: '09/15/2026', field_678: 'Micah Shearer' }
];
const model = { data: { models: recs.map(a => ({ attributes: a })) }, fetch() { fetched++; } };
window.Knack = { views: { view_4135: { model } },
  router: { current_scene_key: 'scene_1311' }, api_url: 'https://api.knack.com', application_id: 'app', getUserToken() { return 't'; } };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, knackRecordUrl(v, id) { return '/' + v + '/' + id; },
  knackAjax(o) { puts.push({ url: o.url, type: o.type || 'PUT', body: JSON.parse(o.data) }); o.success({ record: { id: 'new1' } }); },
  deployNav: { openSection(re) { opened = String(re); return true; } } };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/pinned-notes.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

function grid(rows) {
  return '<div class="kn-table-wrapper"><table class="kn-table"><thead><tr><th class="kn-table-action-link"><span class="table-fixed-label">Push Note<br> to Clickup<br> and Slack</span></th><th>Note Date</th><th>Notes</th></tr></thead><tbody>' +
    // Three Knack shapes for the action-link cell: the live one (icon + EMPTY anchor — label only in the header),
    // a bare labelled <a class="kn-action-link">, and a .kn-action-link wrapper holding the <a>.
    (rows.length ? rows.map((r, i) => '<tr id="' + r.id + '"><td class="kn-table-link knTableColumn__link"><span class="col-0">' +
        (i % 3 === 0 ? '<i class="fa fa-send"></i><a href="javascript:void(0);" data-action-rule-index="0" class="kn-link kn-link-page kn-action-link"></a>'
          : i % 3 === 1 ? '<span class="kn-action-link"><a href="#push">Push Note to Clickup and Slack</a></span>' : '<a class="kn-action-link" href="#push">Push Note to Clickup and Slack</a>') +
        '</span></td><td class="field_327">' + r.field_327 + '</td><td class="field_328"><span class="col-2">' + r.field_328.slice(0, 20) + '... <a class="text-expand">view more</a></span></td></tr>').join('')
      : '<tr><td class="kn-td-nodata" colspan="3">No Data</td></tr>') +
    '</tbody></table></div>';
}
document.body.innerHTML = '<div id="kn-scene_1311"><div class="kn-view kn-details" id="view_3938"><h1>Project</h1></div>' +
  '<div class="kn-view kn-table" id="view_4135">' + grid(recs) + '</div></div>';
document.querySelector('#a1 a.kn-action-link').addEventListener('click', e => { e.preventDefault(); pushed++; });
const fire = () => (handlers['knack-view-render.view_4135.scwPinnedNotes'] || []).forEach(fn => fn());
fire();

setTimeout(() => {
  let fails = 0;
  function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
  }
  const strip = document.getElementById('scw-pinned-notes');
  check('strip mounts right after the project header', strip && strip.previousElementSibling && strip.previousElementSibling.id, 'view_3938');
  check('strip lists the pinned notes as plain text with author · date', [...strip.querySelectorAll('.scw-pin-note')].map(n => [n.querySelector('.scw-pin-note__text').textContent, n.querySelector('.scw-pin-note__meta').textContent]),
    [['Badge in at Gate 3; escort required. Ask for Dana.', 'Gil Illescas · 09/12/2026'], ['Avoid Friday installs.', 'Micah Shearer · 09/14/2026']]);
  strip.querySelector('.scw-pin-all').click();
  check('"All notes" opens the Project Notes drawer', opened, String(/^project notes$/i));
  const view = document.getElementById('view_4135');
  const cards = () => [...view.querySelectorAll('.scw-note-card')];
  check('the grid is replaced by note cards, pinned first, raw table hidden', [cards().map(c => c.getAttribute('data-scw-note-id')), view.classList.contains('scw-notes-cards'), view.querySelector('.scw-notes-list').nextSibling === view.querySelector('.kn-table-wrapper')],
    [['a1', 'c3', 'b2', 'd4'], true, true]);
  check('card shows author · date, the note with paragraphs kept, Pin/Unpin', (() => { const c = cards()[0]; return [c.querySelector('.scw-note-card__author').textContent, c.querySelector('.scw-note-card__date').textContent, c.querySelector('.scw-note-card__text').textContent, c.querySelector('.scw-pin-toggle').textContent, c.classList.contains('is-pinned')]; })(),
    ['Gil Illescas', '09/12/2026', 'Badge in at Gate 3; escort required.\nAsk for Dana.', 'Pinned · unpin', true]);
  check('every card gets a Pin / Unpin toggle', cards().map(c => c.querySelector('.scw-pin-toggle').textContent), ['Pinned · unpin', 'Pinned · unpin', 'Pin', 'Pin']);
  const link = cards()[0].querySelector('.scw-note-card__link');
  link.click();
  check('row links (Push to ClickUp/Slack) ride on the card and proxy to the grid anchor', [link.textContent, pushed], ['Push Note to Clickup and Slack ›', 1]);
  check('every card carries exactly one Push link, whichever markup Knack used', cards().map(c => c.querySelectorAll('.scw-note-card__link').length), [1, 1, 1, 1]);
  const long = view.querySelector('[data-scw-note-id="d4"]');
  check('a long note starts collapsed with Show more; short notes have no toggle', [long.classList.contains('is-collapsed'), long.querySelector('.scw-note-card__more').textContent, !!cards()[1].querySelector('.scw-note-card__more')], [true, 'Show more', false]);
  long.querySelector('.scw-note-card__more').click();
  check('Show more expands the note', [long.classList.contains('is-collapsed'), long.querySelector('.scw-note-card__more').textContent], [false, 'Show less']);
  view.querySelector('[data-scw-note-id="b2"] .scw-pin-toggle').click();
  check('Pin saves the flag through the notes view and refetches', [puts[0], fetched], [{ url: '/view_4135/b2', type: 'PUT', body: { field_3278: true } }, 1]);
  view.querySelector('[data-scw-note-id="a1"] .scw-pin-toggle').click();
  check('Unpin saves false', puts[1], { url: '/view_4135/a1', type: 'PUT', body: { field_3278: false } });
  // ── Inline composer: the action-bar link posts through the child page's form view.
  const PROJECT = '6a317499f8c8cfac425c873d';
  const cta = document.createElement('a'); cta.id = 'scw-deploy-notes-cta';
  cta.href = '#team-calendar/project-dashboard/' + PROJECT + '/deploy/' + PROJECT + '/add-project-note-k2/' + PROJECT;
  view.parentNode.insertBefore(cta, view);
  const clickCta = () => { const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true }); cta.dispatchEvent(ev); return ev.defaultPrevented; };
  check('without the form in the app schema, the link keeps its native page', [clickCta(), !!view.querySelector('.scw-notes-compose')], [false, false]);
  window.Knack.scenes = { models: [{ attributes: { key: 'scene_9', slug: 'add-project-note-k2', views: [
    { key: 'view_9', type: 'form', action: 'insert', source: { object: 'object_7', connection_key: 'field_100' },
      groups: [{ columns: [{ inputs: [{ field: { key: 'field_328' } }, { field: { key: 'field_3278' } }] }] }] } ] } }] };
  window.Knack.getUserAttributes = () => ({ id: 'u9' });
  check('with the form found, the link opens the composer in the tray instead', [clickCta(), !!view.querySelector('.scw-notes-compose'), view.querySelector('.scw-notes-compose').nextElementSibling.className], [true, true, 'scw-notes-list']);
  const box = view.querySelector('.scw-notes-compose');
  box.querySelector('textarea').value = 'Gate code is 4471.';
  box.querySelector('input[name="pin"]').checked = true;
  box.querySelector('[type="submit"]').click();
  check('Save posts through the form view: note, project connection, pin (no author/date inputs → not sent), then refetches and closes',
    [puts[2], fetched, !!view.querySelector('.scw-notes-compose')],
    [{ url: 'https://api.knack.com/v1/pages/scene_9/views/view_9/records', type: 'POST', body: { field_328: 'Gate code is 4471.', field_100: PROJECT, field_3278: true } }, 3, false]);
  // ── Preferred path: the add-note form ON the scene is adopted into the notes list (no button, no composer).
  const formHost = document.createElement('div'); formHost.className = 'kn-view kn-form'; formHost.id = 'view_4162';
  // Live markup (view_4162): the textarea is #field_328, the project rides in a hidden field_329, no pin input.
  formHost.innerHTML = '<div class="view-header"><h2 class="kn-title">Add DOC_note</h2></div><div class="kn-form-confirmation" style="display: none"><a href="#" class="kn-form-reload">Reload form</a></div>' +
    '<form action="#" method="post"><label class="kn-label">Notes</label><textarea class="kn-textarea" id="field_328" name="field_328"></textarea><input type="hidden" name="field_329" value="' + PROJECT + '"><div class="kn-submit"><button class="kn-button is-primary" type="submit">Submit</button></div></form>';
  const shell = document.createElement('div'); shell.className = 'scw-ktl-accordion'; shell.appendChild(formHost);
  document.getElementById('kn-scene_1311').appendChild(shell);
  const bar = document.createElement('div'); bar.id = 'scw-deploy-notes-actionbar'; bar.appendChild(cta);
  view.parentNode.insertBefore(bar, view);
  let submitted = 0, reloaded = 0;
  formHost.querySelector('form').addEventListener('submit', e => { e.preventDefault(); submitted++; });
  formHost.querySelector('.kn-form-reload').addEventListener('click', e => { e.preventDefault(); reloaded++; });
  // No schema for the form in Knack.views: detection is DOM-only.
  fire();
  setTimeout(() => {
    check('the on-page form moves above the card list, restyled, its accordion shell hidden',
      [formHost.parentNode === view, formHost.nextElementSibling && formHost.nextElementSibling.className, formHost.classList.contains('scw-notes-addform'), shell.style.display],
      [true, 'scw-notes-list', true, 'none']);
    check('the proxied "Add Project Note" button is hidden; the form keeps its own submit, relabelled',
      [document.getElementById('scw-pinned-notes-css-form').textContent, formHost.querySelector('button[type="submit"]').textContent, !!formHost.querySelector('textarea').getAttribute('placeholder')],
      ['#scw-deploy-notes-actionbar { display: none !important; }', 'Save note', true]);
    const pinCb = formHost.querySelector('.kn-submit input[name="scw_pin"]');
    check('a Pin checkbox rides in the submit row (the form has no pin input)', [!!pinCb, pinCb && pinCb.disabled], [true, false]);
    check('the empty-state hint / CTA click focuses the form instead of navigating', [clickCta(), !!view.querySelector('.scw-notes-compose')], [true, false]);
    formHost.querySelector('#field_328').value = 'Escort required after 6pm.';
    pinCb.checked = true;
    const before = puts.length;
    formHost.querySelector('button[type="submit"]').click();
    check('Save is Knack\'s own submit (no REST call from the bundle)', [submitted, puts.length - before], [1, 0]);
    (handlers['knack-record-create.view_4162.scwPinnedNotesSave'] || []).forEach(fn => fn(null, {}, { id: 'n1' }));
    (handlers['knack-form-submit.view_4162.scwPinnedNotesSave'] || []).forEach(fn => fn(null, {}, { id: 'n1' }));
    check('record-create pins the new record through the grid and refetches once', [puts[puts.length - 1], fetched], [{ url: '/view_4135/n1', type: 'PUT', body: { field_3278: true } }, 4]);
    setTimeout(() => {
      check('form-submit for the same record is not a second save', [puts.length, fetched], [before + 1, 4]);
      // Knack re-renders the form (same element) after the save: a pass re-dresses it without moving it.
      formHost.querySelector('button[type="submit"]').textContent = 'Submit';
      fire();
      setTimeout(() => {
        check('a re-render pass re-labels in place; still one Pin checkbox', [formHost.querySelector('button[type="submit"]').textContent, formHost.querySelectorAll('input[name="scw_pin"]').length, formHost.nextElementSibling.className], ['Save note', 1, 'scw-notes-list']);
        setTimeout(() => {
          check('the form is reloaded for the next note', reloaded, 1);
          afterComposer();
        }, 1000);
      }, 200);
    }, 500);
  }, 250);
  function afterComposer() {
  // Cap: with 3 pinned in the model, pinning a 4th is refused.
  recs[1].field_3278_raw = true;
  fire();
  setTimeout(() => {
    view.querySelector('[data-scw-note-id="d4"] .scw-pin-toggle').click();
    check('a fourth pin is refused with an explanation', [puts.length, alerts.length > 0 && /Up to 3/.test(alerts[0])], [4, true]);
    check('strip shows at most three', document.querySelectorAll('#scw-pinned-notes .scw-pin-note').length, 3);
    // No notes: empty state instead of Knack's "No Data" row; strip gone.
    model.data.models = [];
    view.innerHTML = grid([]);
    fire();
    setTimeout(() => {
      check('no notes → empty state, no strip', [!!view.querySelector('.scw-notes-empty'), view.querySelectorAll('.scw-note-card').length, !!document.getElementById('scw-pinned-notes')], [true, 0, false]);
      console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
      process.exit(fails ? 1 : 0);
    }, 200);
  }, 200);
  }
}, 300);
