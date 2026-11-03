// jsdom test: closet survey notes (field_2457) are a stamped, append-only log (2026-11-02).
// "Let's not include the sub name in the append … just identifying by Survey Record would be enough."
// A survey ADDS "[MM/DD/YYYY · SR####] text" on top of the closet's notes (mdf-edit-core.js
// appendSurveyNote: read the record first, prepend, save through the shared PUT); nothing an
// earlier survey wrote is replaced. Sub-facing surfaces show only the page's survey's entries plus
// the unstamped earlier text; ops surfaces show every entry. Drives the real mdf-edit-core.js,
// worksheet-v2/mdf-notes.js (the band) and mdf-idf-cards.js (the location cards).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REQ = 'aaaaaaaaaaaaaaaaaaaaaaaa';     // this page's survey request
const OLD_REQ = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CLOSET = 'cccccccccccccccccccccccc';
const SURVEY_HASH = '#subcontractor-portal/site-survey-request-details/' + OLD_REQ +
  '/site-survey-request-details/' + REQ + '/';   // nested route: the DEEPEST segment is the page
const OPS_HASH = '#project-dashboard/build-sow/dddddddddddddddddddddddd/';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices' + SURVEY_HASH, pretendToBeVisual: true });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;

// Another survey (SR1102) wrote before this one; a sub wrote unstamped text before the log existed
// (SR1102's append marked it "[Earlier notes]").
const STORED = '[10/14/2026 · SR1102] Closet locked — key with the front desk.\n\n' +
  '[Earlier notes] Old note from before the log: rack in the back.';
function closetModel(viewKey, notes) {
  return { key: viewKey, model: { data: { models: [{ id: CLOSET, attributes: {
    id: CLOSET, field_1641: 'IDF', field_2458: '2', field_1943: 'Server Room',
    field_1642: 'IDF: 02 : Server Room', field_1643: 'SCW: patch panel labelled',
    field_1643_raw: 'SCW: patch panel labelled', field_2457: notes, field_2457_raw: notes } }] } } };
}
window.Knack = {
  views: {
    // The request's details view on the page carries its REQ_ID.
    view_3600: { model: { attributes: { id: REQ, field_2345: '60524852230-SR1145', field_2345_raw: '60524852230-SR1145' } } },
    view_3617: closetModel('view_3617', STORED),
    view_3577: closetModel('view_3577', STORED),
    view_4060: closetModel('view_4060', STORED)
  },
  getUserAttributes() { return { name: 'Joe Subcontractor', email: 'joe@svs.example' }; }
};
global.Knack = window.Knack;

const calls = [];
let serverNotes = STORED;            // what a fresh GET returns
let getFails = false;
window.SCW = {
  CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackRecordUrl(v, id) { return 'https://api/' + v + '/' + id; },
  knackAjax(o) {
    calls.push(o);
    if (o.type === 'GET') {
      if (getFails) { o.error && o.error({ status: 500 }); return; }
      o.success && o.success({ id: CLOSET, field_2457: serverNotes, field_2457_raw: serverNotes });
      return;
    }
    // PUT: echo what was sent.
    const body = JSON.parse(o.data);
    if ('field_2457' in body) serverNotes = body.field_2457;
    o.success && o.success(Object.assign({ id: CLOSET }, body, { field_2457_raw: body.field_2457 }));
  },
  syncKnackModel() {}
};
global.SCW = window.SCW;

const VIEW_CFG = {
  view_3505: { mdfManage: { viewKey: 'view_3617', notesField: 'field_2457', notesLabel: 'Survey Notes',
    calloutField: 'field_1643', calloutLabel: 'SCW Notes', surveyLog: 'own' } },
  view_3962: { mdfManage: { viewKey: 'view_3577', notesField: 'field_1643' } },
  view_4056: { mdfManage: { viewKey: 'view_4060', notesField: 'field_1643', surveyLog: 'own' } }
};
window.SCW.worksheetV2 = { cfg: { viewCfg(k) { return VIEW_CFG[k] || null; } } };

function load(rel) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features', rel), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
load('mdf-edit-core.js');
load('worksheet-v2/mdf-notes.js');
const core = window.SCW.mdfEdit;
const band = window.SCW.worksheetV2.mdfNotes._detailBand;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 0));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const metas = el => [...el.querySelectorAll('.scw-svlog__meta')].map(m => m.textContent);
const DAY = new Date(2026, 10, 2);

(async () => {
  // ── the helpers ──
  check('a stamp names the date and the survey record',
    core.composeSurveyEntry('  Rack is full.  ', 'SR1145', DAY), '[11/02/2026 · SR1145] Rack is full.');
  check('a blank note is no entry', core.composeSurveyEntry('  \n ', 'SR1145', DAY), '');
  check('survey labels shorten to the SR number',
    ['60524852230-SR1145', 'SR-77', 'SR 9', 'Walkthrough'].map(core.shortSurveyLabel), ['SR1145', 'SR77', 'SR9', 'Walkthrough']);
  check('the page\'s survey is the DEEPEST route segment, labelled from the request\'s REQ_ID',
    core.surveyContext(), { id: REQ, label: 'SR1145' });
  check('off a survey page there is no survey', core.surveyContext(OPS_HASH), null);

  const log = core.parseSurveyLog('[11/02/2026 · SR1145] Two lines\nsecond line\n\n' + STORED);
  check('the log parses newest first, multi-line entries intact, unstamped text last as "earlier"',
    log.map(e => [e.date, e.survey, e.text, e.legacy]),
    [['11/02/2026', 'SR1145', 'Two lines\nsecond line', false],
     ['10/14/2026', 'SR1102', 'Closet locked — key with the front desk.', false],
     ['', '', 'Old note from before the log: rack in the back.', true]]);
  check('a sub surface sees its own survey + the earlier text, never another survey\'s entry',
    core.visibleSurveyEntries('[11/02/2026 · SR1145] Mine\n\n' + STORED, { ownOnly: true, only: 'SR1145' }).map(e => e.text),
    ['Mine', 'Old note from before the log: rack in the back.']);
  check('a sub surface about no survey sees only the earlier text',
    core.visibleSurveyEntries(STORED, { ownOnly: true, only: '' }).map(e => e.legacy), [true]);
  check('unstamped text above the first stamp still reads as the earlier entry',
    core.parseSurveyLog('Typed in Knack\n[10/14/2026 · SR1102] A').map(e => [e.survey, e.text, e.legacy]),
    [['SR1102', 'A', false], ['', 'Typed in Knack', true]]);
  check('rendered entries escape their text',
    /5 &lt; 6 &amp; ok/.test(core.renderSurveyLog('[11/02/2026 · SR1] 5 < 6 & ok')), true);

  // ── appendSurveyNote: read first, then prepend ──
  calls.length = 0;
  serverNotes = '[11/01/2026 · SR1150] Added by another survey after this page loaded.\n\n' + STORED;
  let done = null;
  core.appendSurveyNote({ viewKey: 'view_3617', recordId: CLOSET, text: 'Rack is full.', survey: 'SR1145', date: DAY,
    onDone(r) { done = r; } });
  check('the record is read before the write, and the new entry goes on top of what the SERVER holds',
    [calls.map(c => c.type), JSON.parse(calls[1].data).field_2457.split('\n\n')[0],
     JSON.parse(calls[1].data).field_2457.indexOf('Added by another survey') > 0, done && done.value === serverNotes],
    [['GET', 'PUT'], '[11/02/2026 · SR1145] Rack is full.', true, true]);

  calls.length = 0; serverNotes = 'Rack in the back.\nSecond line.';
  core.appendSurveyNote({ viewKey: 'view_3617', recordId: CLOSET, text: 'First stamped note.', survey: 'SR1145', date: DAY });
  const firstVal = JSON.parse(calls[1].data).field_2457;
  check('the first append marks the old unstamped text "[Earlier notes]" so it stays its own entry',
    [firstVal, core.parseSurveyLog(firstVal).map(e => e.legacy ? 'earlier: ' + e.text : e.survey + ': ' + e.text)],
    ['[11/02/2026 · SR1145] First stamped note.\n\n[Earlier notes] Rack in the back.\nSecond line.',
     ['SR1145: First stamped note.', 'earlier: Rack in the back.\nSecond line.']]);

  calls.length = 0; getFails = true; serverNotes = STORED;
  core.appendSurveyNote({ viewKey: 'view_3617', recordId: CLOSET, text: 'Fallback', survey: 'SR1145', date: DAY,
    current: STORED });
  check('a failed read falls back to the page\'s copy (never writes blind)',
    JSON.parse(calls[1].data).field_2457, '[11/02/2026 · SR1145] Fallback\n\n' + STORED);
  getFails = false;

  calls.length = 0;
  let err = '';
  window.SCW.knackAjax = (function (orig) {
    return function (o) { if (o.type === 'GET') { calls.push(o); o.success({ id: CLOSET }); return; } orig(o); };
  })(window.SCW.knackAjax);
  core.appendSurveyNote({ viewKey: 'view_9999', recordId: CLOSET, text: 'No column', survey: 'SR1145',
    onError(m) { err = m; } });
  check('when neither the read nor the page carries the field, nothing is written',
    [calls.map(c => c.type), /could not be read/.test(err)], [['GET'], true]);
  // restore the plain stub
  window.SCW.knackAjax = function (o) {
    calls.push(o);
    if (o.type === 'GET') { o.success({ id: CLOSET, field_2457: serverNotes, field_2457_raw: serverNotes }); return; }
    const body = JSON.parse(o.data);
    if ('field_2457' in body) serverNotes = body.field_2457;
    o.success(Object.assign({ id: CLOSET }, body, { field_2457_raw: body.field_2457 }));
  };

  // ── the survey page band (view_3505 → view_3617, the sub writes survey notes) ──
  serverNotes = STORED;
  window.Knack.views.view_3617 = closetModel('view_3617', '[10/20/2026 · SR1145] My earlier note.\n\n' + STORED);
  const b = band({ id: CLOSET }, 'view_3505');
  document.body.appendChild(b);
  const logEl = b.querySelector('[data-scw-ws-v2-mdf-log]');
  const ta = b.querySelector('.scw-ws-v2-mdf-band-ta');
  check('the survey band lists this survey\'s entries + the earlier text, not SR1102\'s, above an EMPTY box',
    [metas(logEl), /front desk/.test(txt(logEl)), ta.value, ta.placeholder],
    [['10/20/2026 · SR1145', 'Earlier notes'], false, '', 'Add a survey note — saves when you click away']);
  check('the callout stays SCW Notes there', txt(b.querySelector('.scw-ws-v2-mdf-callout')).indexOf('SCW Notes') === 0, true);

  calls.length = 0;
  serverNotes = '[10/20/2026 · SR1145] My earlier note.\n\n' + STORED;
  ta.value = 'Two open ports on the patch panel.';
  ta.dispatchEvent(new window.Event('blur'));
  await tick();
  const put = calls.find(c => c.type === 'PUT');
  const sent = put && JSON.parse(put.data).field_2457;
  const today = core.composeSurveyEntry('x', 'SR1145').slice(0, 13);   // "[MM/DD/YYYY ·"
  check('blur ADDS one stamped entry on top — the earlier entries are all still there',
    [calls.map(c => c.type), sent && sent.indexOf(today + ' SR1145] Two open ports on the patch panel.\n\n[10/20/2026 · SR1145] My earlier note.') === 0,
     sent && sent.indexOf('SR1102') > 0, sent && /before the log/.test(sent)],
    [['GET', 'PUT'], true, true, true]);
  check('the stamp names the survey record, never the person or the company',
    [/Joe|Subcontractor|svs/i.test(sent || '')], [false]);
  check('after the save the box is empty and the new entry heads the log',
    [ta.value, metas(logEl)[0] === today.slice(1) + ' SR1145', metas(logEl).length], ['', true, 3]);

  calls.length = 0;
  ta.value = '   ';
  ta.dispatchEvent(new window.Event('blur'));
  await tick();
  check('a blank box writes nothing', calls.length, 0);

  // ── an ops page band (view_3962 → view_3577): every entry, read-only in the callout ──
  window.location.hash = OPS_HASH;
  const ob = band({ id: CLOSET }, 'view_3962');
  const callout = ob.querySelector('.scw-ws-v2-mdf-callout');
  check('ops see every survey\'s entries in the callout, and their box edits SCW Notes as before',
    [metas(callout), ob.querySelector('.scw-ws-v2-mdf-band-ta').value],
    [['10/14/2026 · SR1102', 'Earlier notes'], 'SCW: patch panel labelled']);

  // ── the sub deployment dashboard (view_4056 → view_4060): about no survey ──
  const sb = band({ id: CLOSET }, 'view_4056');
  const sc = sb.querySelector('.scw-ws-v2-mdf-callout');
  check('the installing sub sees no survey\'s stamped entries — only the earlier text',
    [metas(sc), /front desk/.test(txt(sc))], [['Earlier notes'], false]);

  // ── the location cards (mdf-idf-cards.js) ──
  function gridHtml(viewKey, editable) {
    const ce = editable ? ' cell-edit' : '';
    return '<div class="kn-view kn-table" id="' + viewKey + '"><div class="kn-table-wrapper"><table class="kn-table-table">' +
      '<thead><tr><th class="field_1641"></th><th class="field_1943"></th><th class="field_1642"></th><th class="field_2457"></th></tr></thead>' +
      '<tbody><tr id="' + CLOSET + '"><td class="field_1641' + ce + '">IDF</td><td class="field_1943' + ce + '">Server Room</td>' +
      '<td class="field_1642">IDF: 02 : Server Room</td><td class="field_2457' + ce + '" data-field-key="field_2457"><span class="col-3">x</span></td></tr></tbody>' +
      '</table></div></div>';
  }
  window.Knack.views.view_3803 = closetModel('view_3803', STORED);
  window.Knack.views.view_3892 = closetModel('view_3892', STORED);
  // A browser that last chose the retired "Table view" must not get the raw table back.
  window.localStorage.setItem('scwMdfIdfCardsMode', 'table');
  window.location.hash = '#survey-forms/site-survey-request-details2/' + REQ + '/';
  document.body.insertAdjacentHTML('beforeend', gridHtml('view_3803', true));
  load('mdf-idf-cards.js');
  await tick(260);
  let card = document.querySelector('#view_3803 .scw-mdf-card');
  let note = card && card.querySelector('.scw-mdf-note--log');
  const addIn = note && note.querySelector('input[data-append="1"]');
  check('on a survey page the card shows this survey\'s entries + earlier text and an empty "add" input',
    [!!note, note && metas(note), addIn && addIn.value, addIn && addIn.placeholder],
    [true, ['Earlier notes'], '', 'Add a survey note']);

  calls.length = 0; serverNotes = STORED;
  addIn.focus(); addIn.value = 'Card note.';
  addIn.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
  await tick();
  const cput = calls.find(c => c.type === 'PUT');
  check('a card note is added through the same append (read, then stamped on top)',
    [calls.map(c => c.type), cput && JSON.parse(cput.data).field_2457.indexOf(today + ' SR1145] Card note.\n\n' + STORED) === 0,
     addIn.value, metas(note)[0] === today.slice(1) + ' SR1145'],
    [['GET', 'PUT'], true, '', true]);

  // An ops grid (no survey in the route) where Builder still has the column inline-editable.
  window.location.hash = OPS_HASH;
  document.body.insertAdjacentHTML('beforeend', gridHtml('view_3892', true));
  // The module re-scans on Knack renders ($ is stubbed here); a second load runs another initial sweep.
  document.getElementById('view_3803').remove();
  load('mdf-idf-cards.js');
  await tick(260);
  card = document.querySelector('#view_3892 .scw-mdf-card');
  note = card && card.querySelector('.scw-mdf-note--log');
  check('off a survey page survey notes are read-only: every entry, no input that could overwrite them',
    [note && metas(note), note && note.querySelectorAll('input').length], [['10/14/2026 · SR1102', 'Earlier notes'], 0]);
  const v3892 = document.getElementById('view_3892');
  check('there is no "Table view" toggle: the raw grid (and its editable survey-notes cell) never shows',
    [v3892.querySelectorAll('.scw-mdf-toggle, .scw-mdf-toolbar').length, v3892.classList.contains('scw-mdf-cards-on'),
     window.localStorage.getItem('scwMdfIdfCardsMode')],
    [0, true, null]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
