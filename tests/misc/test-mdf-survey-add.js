// jsdom smoke test: the sub's "+ Add MDF/IDF" on the survey page (2026-11-12 — "we're serving the knack
// native create record module which is not enforcing the install project connection (or making connections to
// the site) … when submitted from this page we'll also need to pass and create the connection to the Site
// Survey"). worksheet-v2 view_3505 carries mdfAddModal: 'survey', so the toolbar's add-mdf action opens
// mdf-site-tools' modal in SURVEY mode for every login (no site route): it lists the project's closets
// (view_3617), checks the ## on the project, and POSTs 22.02 create with surveyRequestId (Make reads the project
// off the request — the page often cannot tell it; projectId rides along only when the page knows it),
// numberScope 'project', lifecycle 'proposed' and the sub's note as a
// stamped survey-note entry. A reply without surveyNotesSaved (an unpatched 22.02) makes the page append the note.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const SR = '6a1111111111111111111111', PRJ = '6a2222222222222222222222';
const dom = new JSDOM('<!doctype html><html><head></head><body id="knack-body scene_1140"><div id="view_3509" class="kn-menu kn-view"><a href="#new-add-mdfidf/' + SR + '" class="kn-link-page">Add MDF/IDF</a></div></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#subcontractor-portal/site-survey-request-details/' + SR + '/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.localStorage = window.localStorage; global.sessionStorage = window.sessionStorage;
global.Event = window.Event; global.CustomEvent = window.CustomEvent; global.MutationObserver = window.MutationObserver;
global.AbortController = window.AbortController || global.AbortController;
const timers = [];
window.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
window.clearTimeout = () => {};
global.setTimeout = window.setTimeout; global.clearTimeout = window.clearTimeout;
window.setInterval = function () {}; global.setInterval = function () {};
function runTimers() { let n = 0; while (timers.length && n++ < 50) timers.shift().fn(); }
const flush = () => new Promise((r) => setImmediate(r));
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; jq.ajax = () => {};
window.$ = jq; window.jQuery = jq; global.$ = jq;

const closet = (id, type, num, name, lifecycle) => ({ attributes: {
  id, field_1641: type, field_2458: num, field_2458_raw: num === '' ? '' : Number(num), field_1943: name,
  field_1642: type + ': ' + (num === '' ? '' : String(num).padStart(2, '0')) + ': ' + name, field_1643: '',
  field_2845: lifecycle || 'approved', field_2457: '', field_1648_raw: [{ id: PRJ, identifier: 'Acme' }] } });
let grid = [closet('h1', 'HEADEND', '', 'Server room'), closet('i1', 'IDF', 1, 'Warehouse'), closet('i2', 'IDF', 2, 'Dock', 'proposed')];
let gridFetches = 0;
window.Knack = {
  router: { current_scene_key: 'scene_1140' },
  getUserAttributes() { return { id: 'u9', email: 'tech@svs.example' }; },
  views: {
    view_3504: { model: { attributes: { id: SR, field_2345: '60524852230-SR1145', field_2346_raw: [{ id: PRJ, identifier: 'Acme' }] } } },
    view_3617: { model: { data: { get models() { return grid; } }, fetch() { gridFetches++; return Promise.resolve(); } } },
    view_3505: { model: { data: { models: [] } } }
  }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: { MAKE_MDF_IDF_WEBHOOK: 'https://hook.us1.make.com/create' }, worksheetV2: {},
  debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;
const ajax = [];
window.SCW.knackRecordUrl = (v, id) => 'url:' + v + '/' + id;
window.SCW.knackAjax = (o) => { ajax.push(o); if (o.type === 'GET') o.success({ record: { id: o.url.split('/').pop(), field_2457: '' } }); else if (o.success) o.success({ id: 'new1', field_2457: JSON.parse(o.data || '{}').field_2457 }); };
window.SCW.syncKnackModel = () => {};
let posts = [];
let reply = { status: 200, body: '{"ok": true, "created": true, "id": "new1", "number": "3", "type": "IDF", "surveyNotesSaved": true}' };
window.fetch = (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); return Promise.resolve({ status: reply.status, text: () => Promise.resolve(reply.body) }); };
global.fetch = window.fetch;

function load(f) {
  new Function('window', 'document', '$', 'jQuery', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, f), 'utf8'))(
    window, document, jq, jq, window.Knack, window.SCW);
}
load('../../src/features/mdf-edit-core.js');
load('../../src/features/mdf-site-tools.js');
for (const f of ['config.js', 'card.js', 'toolbar.js']) load('../../src/features/worksheet-v2/' + f);
const ns = window.SCW.worksheetV2;
const refreshed = [];
ns.data = { refetchAndNotify(k) { refreshed.push(k); }, readRecords() { return []; } };
const T = window.SCW.mdfSiteTools;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const $m = (sel) => document.querySelector('.scw-mst-overlay ' + sel);
const clickAdd = () => $m('[data-act="add"]').click();

(async () => {
  check('view_3505 is a survey-mode worksheet over view_3617', [ns.cfg.viewCfg('view_3505').mdfAddModal, T.surveyGridOf('view_3505')], ['survey', 'view_3617']);
  check('no site route needed: a sub login can add', [T.canAddSurvey('view_3505'), T.canAdd('view_3617')], [true, false]);
  check('other worksheets are not survey mode', [T.surveyGridOf('view_3962'), T.canAddSurvey('view_3962')], ['', false]);
  check('the request\'s project comes off view_3504 (REL_project)', T.surveyProjectId(SR, 'view_3617'), PRJ);

  // ── the toolbar's + Add MDF/IDF opens the survey modal, not the native form ──
  let nativeClicks = 0;
  document.querySelector('#view_3509 a').addEventListener('click', (e) => { e.preventDefault(); nativeClicks++; });
  ns.toolbar._handleAction('add-mdf', 'view_3505');
  check('the modal opens and the native link is not followed', [!!document.querySelector('.scw-mst-overlay'), nativeClicks], [true, 0]);
  check('it lists the project\'s closets, says which are not reviewed yet',
    Array.from(document.querySelectorAll('.scw-mst-row')).map((r) => r.textContent),
    ['HEADEND: : Server room', 'IDF: 01: Warehouse', 'IDF: 02: Dockadded on a survey · SCW has not reviewed it yet']);
  check('the section says on this project, the ## is the next free on the project, notes are survey notes',
    [$m('.scw-mst-sec').textContent, $m('[data-in="number"]').value, $m('textarea').previousElementSibling.textContent],
    ['Already on this project (3)', '3', 'Survey notes']);
  const numIn = $m('[data-in="number"]');
  numIn.value = '2'; numIn.dispatchEvent(new window.Event('input'));
  clickAdd();
  check('a ## already on the project is refused before anything is sent',
    [$m('.scw-mst-note').textContent, posts.length], ['IDF 02 already exists on this project (IDF: 02: Dock).', 0]);
  numIn.value = '3'; numIn.dispatchEvent(new window.Event('input'));
  $m('[data-in="name"]').value = 'Mezzanine closet';
  $m('[data-in="notes"]').value = 'Behind the freight elevator, key at front desk';
  clickAdd();
  await flush(); await flush();
  const p = posts[0] && posts[0].body;
  check('one POST to 22.02 create', [posts.length, posts[0] && posts[0].url], [1, 'https://hook.us1.make.com/create']);
  check('the payload carries the project, the survey request, the project scope and proposed',
    { action: p.action, projectId: p.projectId, surveyRequestId: p.surveyRequestId, surveyRequest: p.surveyRequest, type: p.type, number: p.number,
      name: p.name, notes: p.notes, lifecycle: p.lifecycle, numberScope: p.numberScope, source: p.source, viewKey: p.viewKey },
    { action: 'create', projectId: PRJ, surveyRequestId: SR, surveyRequest: 'SR1145', type: 'IDF', number: '3',
      name: 'Mezzanine closet', notes: '', lifecycle: 'proposed', numberScope: 'project', source: 'survey-modal', viewKey: 'view_3505' });
  check('the sub\'s note rides as a stamped survey-note entry (date · survey, never the person)',
    /^\[\d\d\/\d\d\/\d{4} · SR1145\] Behind the freight elevator, key at front desk$/.test(p.surveyNotes), true);
  check('the modal closes and the toast says SCW reviews it',
    [!!document.querySelector('.scw-mst-overlay'), document.querySelector('.scw-mst-toast').textContent],
    [false, 'Added IDF 03: Mezzanine closet. It is on this survey now; SCW reviews it.']);
  runTimers(); await flush(); await flush();
  check('the closet grid is re-read and the worksheet refreshed', [gridFetches >= 1, refreshed.includes('view_3505')], [true, true]);
  check('Make saved the note, so the page writes nothing itself', ajax.length, 0);

  // ── an unpatched 22.02 (no surveyNotesSaved): the page appends the note through view_3617 ──
  posts = []; reply = { status: 200, body: '{"ok": true, "created": true, "id": "new2", "number": "4", "type": "IDF"}' };
  T.openAdd({ viewKey: 'view_3505', gridKey: 'view_3617', mode: 'survey' });
  $m('[data-in="notes"]').value = 'Roof access';
  clickAdd(); await flush(); await flush();
  runTimers(); await flush(); await flush();
  const put = ajax.find((a) => a.type === 'PUT');
  check('the note is read then written on the new closet through view_3617',
    [ajax[0] && ajax[0].type, ajax[0] && ajax[0].url, put && put.url, put && /^\[\d\d\/\d\d\/\d{4} · SR1145\] Roof access$/.test(JSON.parse(put.data).field_2457)],
    ['GET', 'url:view_3617/new2', 'url:view_3617/new2', true]);

  // ── HEADEND: no ## ──
  posts = []; reply = { status: 200, body: '{"ok": true, "created": true, "id": "new3", "number": "", "type": "HEADEND", "surveyNotesSaved": false}' };
  T.openAdd({ viewKey: 'view_3505', gridKey: 'view_3617', mode: 'survey' });
  $m('[data-type="HEADEND"]').click();
  check('HEADEND hides the ##', $m('[data-num-fld]').style.display, 'none');
  clickAdd(); await flush(); await flush();
  check('HEADEND posts no number and no note', [posts[0].body.type, posts[0].body.number, posts[0].body.surveyNotes], ['HEADEND', '', '']);
  runTimers(); await flush();

  // ── Make refusals keep the window open ──
  posts = []; reply = { status: 409, body: '{"ok": false, "error": "number-taken", "message": "IDF 5 already exists on this project."}' };
  T.openAdd({ viewKey: 'view_3505', gridKey: 'view_3617', mode: 'survey' });
  $m('[data-in="number"]').value = '5'; clickAdd(); await flush(); await flush();
  check('a 409 shows Make\'s message and re-enables Add', [$m('.scw-mst-note').textContent, $m('[data-act="add"]').disabled],
    ['IDF 5 already exists on this project.', false]);
  reply = { status: 422, body: '{"ok": false, "error": "no-site", "message": "This project has no Site. Set the project\'s Site first."}' };
  clickAdd(); await flush(); await flush();
  check('no site: the sub is told SCW has to set the project up', /SCW has to finish setting up this project/.test($m('.scw-mst-note').textContent), true);
  document.querySelector('.scw-mst-overlay [data-act="cancel"]').click();

  // ── fallbacks ──
  window.SCW.CONFIG.MAKE_MDF_IDF_WEBHOOK = 'PLACEHOLDER';
  check('no hook → the native form link', T.canAddSurvey('view_3505'), false);
  ns.toolbar._handleAction('add-mdf', 'view_3505');
  check('… and the toolbar follows view_3509', [nativeClicks, !!document.querySelector('.scw-mst-overlay')], [1, false]);
  window.SCW.CONFIG.MAKE_MDF_IDF_WEBHOOK = 'https://hook.us1.make.com/create';
  window.history.replaceState(null, '', '#subcontractor-portal/');
  check('no survey id in the route → the native form', T.canAddSurvey('view_3505'), false);
  window.history.replaceState(null, '', '#subcontractor-portal/site-survey-request-details/' + SR + '/');
  T.CONFIG.surveyPreviewEmails = ['someone@getscw.com'];
  check('a preview list leaves everyone else on the native form', T.canAddSurvey('view_3505'), false);
  T.CONFIG.surveyPreviewEmails = [];
  // project not on the page: a closet on the grid names it; none → the modal refuses
  const savedReq = window.Knack.views.view_3504; delete window.Knack.views.view_3504;
  check('no request record: the project comes off a closet on the grid', T.surveyProjectId(SR, 'view_3617'), PRJ);
  grid = [];
  posts = []; reply = { status: 200, body: '{"ok": true, "created": true, "id": "new4", "number": "1", "type": "IDF", "surveyNotesSaved": false}' };
  T.openAdd({ viewKey: 'view_3505', gridKey: 'view_3617', mode: 'survey' });
  clickAdd(); await flush(); await flush();
  check('the page cannot tell the project: it still posts, Make reads the project off the survey request',
    [posts.length, posts[0] && posts[0].body.projectId, posts[0] && posts[0].body.surveyRequestId, !!document.querySelector('.scw-mst-overlay')],
    [1, '', SR, false]);
  runTimers(); await flush();
  // a 22.02 without the survey route stops on the missing project and answers Make's bare "Accepted"
  posts = []; reply = { status: 200, body: 'Accepted' };
  T.openAdd({ viewKey: 'view_3505', gridKey: 'view_3617', mode: 'survey' });
  clickAdd(); await flush(); await flush();
  check('a bare 200 with no JSON on the survey page says nothing was added and keeps the window',
    [!!document.querySelector('.scw-mst-overlay'), /did not create the MDF\/IDF/.test($m('.scw-mst-note').textContent)], [true, true]);
  reply = { status: 422, body: '{"ok": false, "error": "no-project", "message": "This survey request is not on a project. Ask SCW to connect it."}' };
  clickAdd(); await flush(); await flush();
  check('a survey request with no project: Make\'s message', $m('.scw-mst-note').textContent, 'This survey request is not on a project. Ask SCW to connect it.');
  document.querySelector('.scw-mst-overlay [data-act="cancel"]').click();
  window.Knack.views.view_3504 = savedReq;

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
