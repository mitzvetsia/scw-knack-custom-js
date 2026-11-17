// jsdom test: "+ Add MDF/IDF" in PROJECT mode (2026-11-17 — "let's get the custom modal on these two
// pages"): the sales SOW page (scene_1116, worksheet view_3586, closets view_3602) and the sub's deployment
// dashboard (scene_1353, worksheet view_4056, closets view_4060). Neither has a site closet grid, so their
// worksheet config says mdfAddModal: 'project': the toolbar opens mdf-site-tools' window over the page's own
// project closets, numbers on the project, and POSTs 22.02 create on the project route (projectId given, no
// survey request) with numberScope 'project' and lifecycle 'approved'. The SOW page is not the project: its
// project comes off the SOW's details view (view_3491 REL_project field_2119), else a form bound to the
// project. Drives the real worksheet-v2 config + toolbar and mdf-site-tools.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const CO = '6a0000000000000000000000', SOW = '6a1111111111111111111111', SOW_OLD = '6a9999999999999999999999';
const PRJ = '6a2222222222222222222222', PRJ_OLD = '6a8888888888888888888888';
const SALES = 'https://scwinstallation.knack.com/installationservices#sales-portal/company-details/' + CO + '/scope-of-work-details/' + SOW + '/';
const dom = new JSDOM('<!doctype html><html><head></head><body id="knack-body scene_1116">' +
  '<div id="view_3654" class="kn-menu kn-view"><a href="#new-add-mdfidf2/' + SOW + '" class="kn-link-page">Add MDF/IDF</a></div></body></html>',
  { url: SALES });
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
  field_2845: lifecycle || 'approved', field_2457: '' } });
const grid = [closet('h1', 'HEADEND', '', 'Server room'), closet('i1', 'IDF', 1, 'Warehouse'), closet('i2', 'IDF', 2, 'Dock', 'proposed')];
const fetched = [];
const gridView = (key) => ({ model: { data: { get models() { return grid; } }, fetch() { fetched.push(key); return Promise.resolve(); } } });
const sowDetails = (sowId, projectId) => ({ model: { attributes: { id: sowId, field_2119_raw: [{ id: projectId, identifier: 'Acme' }] },
  view: { source: { object: 'object_106' } } } });
const projectForm = (projectId) => ({ model: { id: projectId, attributes: { id: projectId }, view: { source: { object: 'object_3' } } } });
window.Knack = {
  router: { current_scene_key: 'scene_1116' },
  getUserAttributes() { return { id: 'u9', email: 'rep@getscw.com' }; },
  views: {
    view_3491: sowDetails(SOW, PRJ),
    view_3492: projectForm(PRJ),
    view_3602: gridView('view_3602'),
    view_3586: { model: { data: { models: [] } } }
  }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: { MAKE_MDF_IDF_WEBHOOK: 'https://hook.us1.make.com/create' }, worksheetV2: {},
  debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;
let posts = [];
let reply = { status: 200, body: '{"ok": true, "created": true, "id": "new1", "number": "3", "type": "IDF", "surveyNotesSaved": false}' };
window.fetch = (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); return Promise.resolve({ status: reply.status, text: () => Promise.resolve(reply.body) }); };
global.fetch = window.fetch;

function load(f) {
  new Function('window', 'document', '$', 'jQuery', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, f), 'utf8'))(
    window, document, jq, jq, window.Knack, window.SCW);
}
load('../../src/features/mdf-edit-core.js');
load('../../src/features/mdf-site-route.js');
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
const overlay = () => document.querySelector('.scw-mst-overlay');
const cancel = () => { const b = $m('[data-act="cancel"]'); if (b) b.click(); };
const html = (k) => { const b = ns.toolbar._build(k); return typeof b === 'string' ? b : (b && b.outerHTML) || ''; };
const hasAddMdf = (k) => /data-scw-ws-v2-action="add-mdf"/.test(html(k));

(async () => {
  // ══ the sales SOW page (scene_1116) ══
  check('the shipped configs: the sales worksheet and the sub deploy clone are project mode; ops deploy and Build SOW are not',
    ['view_3586', 'view_4056', 'view_4093', 'view_3962'].map((k) => ns.cfg.viewCfg(k).mdfAddModal || ''), ['project', 'project', '', '']);
  check('project mode needs no site grid and no site route', [T.addModeFor('view_3586'), T.pageGridOf('view_3586'), T.canAdd('view_3602')],
    ['project', 'view_3602', false]);
  check("the SOW page's project comes off the SOW's details view (REL_project)", T.pageProject(), { id: PRJ, sowId: SOW });

  let nativeClicks = 0;
  document.querySelector('#view_3654 a').addEventListener('click', (e) => { e.preventDefault(); nativeClicks++; });
  check('the toolbar shows + Add MDF/IDF and hides the native menu', [hasAddMdf('view_3586'), document.getElementById('view_3654').style.display], [true, 'none']);
  ns.toolbar._handleAction('add-mdf', 'view_3586');
  check('the window opens and the native link is not followed', [!!overlay(), nativeClicks], [true, 0]);
  check('it says what it does, in project words (no site talk)',
    /Add an MDF\/IDF to this project\. Check it is not already listed first\./.test(overlay().textContent) && !/site/i.test($m('.scw-mst-sub') ? $m('.scw-mst-sub').textContent : ''), true);
  check("it lists the project's closets off the page's own grid",
    Array.from(document.querySelectorAll('.scw-mst-row')).map((r) => r.textContent),
    ['HEADEND: : Server room', 'IDF: 01: Warehouse', 'IDF: 02: Dockadded on a survey · SCW has not reviewed it yet']);
  check('the section says on this project, the ## is the next free on the project, notes are plain notes',
    [$m('.scw-mst-sec').textContent, $m('[data-in="number"]').value, $m('textarea').previousElementSibling.textContent],
    ['Already on this project (3)', '3', 'Notes']);
  const numIn = $m('[data-in="number"]');
  numIn.value = '2'; numIn.dispatchEvent(new window.Event('input'));
  check('a ## taken on the project is named', /IDF 02 already exists on this project/.test($m('.scw-mst-note').textContent), true);
  $m('[data-act="add"]').click(); await flush();
  check('a taken ## never posts', posts.length, 0);
  numIn.value = '3'; numIn.dispatchEvent(new window.Event('input'));
  $m('[data-in="name"]').value = 'Mezzanine';
  $m('[data-in="notes"]').value = 'Above the dock office';
  $m('[data-act="add"]').click(); await flush(); await flush();
  const p = posts[0] && posts[0].body;
  check('one POST to the 22.02 hook', [posts.length, posts[0] && posts[0].url], [1, 'https://hook.us1.make.com/create']);
  check('the payload takes the project route: the project, numbered on the project, approved, no survey request',
    p && [p.action, p.projectId, p.type, p.number, p.name, p.notes, p.lifecycle, p.numberScope, p.source, p.viewKey, p.sowId,
      'surveyRequestId' in p, 'surveyNotes' in p, p.triggeredBy],
    ['create', PRJ, 'IDF', '3', 'Mezzanine', 'Above the dock office', 'approved', 'project', 'project-modal', 'view_3586', SOW,
      false, false, 'rep@getscw.com']);
  check('a created reply closes the window and says where it is', [!overlay(), (document.querySelector('.scw-mst-toast') || {}).textContent],
    [true, 'Added IDF 03: Mezzanine. It is on this project now.']);
  runTimers(); await flush(); await flush();
  check("the page's closet grid and the worksheet are re-read", [fetched.indexOf('view_3602') >= 0, refreshed.indexOf('view_3586') >= 0], [true, true]);

  // Make refuses a ## the page could not see was taken (a closet the grid filters out)
  posts = []; timers.length = 0;
  reply = { status: 409, body: '{"ok": false, "error": "number-taken", "message": "IDF 3 already exists on this project."}' };
  ns.toolbar._handleAction('add-mdf', 'view_3586');
  $m('[data-act="add"]').click(); await flush(); await flush();
  check('a number-taken refusal keeps the window, with the way out',
    [!!overlay(), $m('.scw-mst-note').textContent],
    [true, 'IDF 3 already exists on this project. Clear the ## to take the next free number.']);
  cancel();

  // HEADEND: no ##
  posts = [];
  reply = { status: 200, body: '{"ok": true, "created": true, "id": "new2", "number": "", "type": "HEADEND"}' };
  ns.toolbar._handleAction('add-mdf', 'view_3586');
  $m('.scw-mst-chip[data-type="HEADEND"]').click();
  $m('[data-act="add"]').click(); await flush(); await flush();
  check('a HEADEND goes out with no ##', posts[0] && [posts[0].body.type, posts[0].body.number], ['HEADEND', '']);

  // Knack nests a page under the page it was opened from: the SOW on screen is the LAST id
  posts = []; timers.length = 0;
  window.location.hash = '#sales-portal/company-details/' + CO + '/scope-of-work-details/' + SOW_OLD + '/scope-of-work-details/' + SOW + '/';
  window.Knack.views.view_stale = sowDetails(SOW_OLD, PRJ_OLD);
  check('two SOW views on a nested route: the page record (the last id) names the project', T.pageProject(), { id: PRJ, sowId: SOW });
  delete window.Knack.views.view_stale;
  window.location.hash = SALES.split('#')[1];

  // the details view has no REL_project: a form bound to the project still tells
  const keepDetails = window.Knack.views.view_3491;
  delete window.Knack.views.view_3491;
  check('no SOW view names the project: a view bound to the project does', T.pageProject(), { id: PRJ, sowId: '' });
  // … and with neither, the window says so and sends nothing
  const keepForm = window.Knack.views.view_3492;
  delete window.Knack.views.view_3492;
  ns.toolbar._handleAction('add-mdf', 'view_3586');
  $m('[data-act="add"]').click(); await flush();
  check('a page that cannot tell its project sends nothing and says so',
    [posts.length, /Could not tell which project this page is/.test($m('.scw-mst-note').textContent)], [0, true]);
  // a view that loads late is picked up at the click
  window.Knack.views.view_3491 = keepDetails;
  reply = { status: 200, body: '{"ok": true, "created": true, "id": "new3", "number": "3", "type": "IDF"}' };
  $m('[data-act="add"]').click(); await flush(); await flush();
  check('the project is asked for again at the click (a view that finished loading meanwhile)', posts.length && posts[0].body.projectId, PRJ);
  window.Knack.views.view_3492 = keepForm;
  timers.length = 0;

  // the native page + menu deleted in Builder
  document.getElementById('view_3654').remove();
  check('menu view deleted in Builder: the button still renders', hasAddMdf('view_3586'), true);
  window.SCW.CONFIG.MAKE_MDF_IDF_WEBHOOK = 'PLACEHOLDER';
  check('no hook: no project mode, and with no menu no button', [T.addModeFor('view_3586'), hasAddMdf('view_3586')], ['', false]);
  window.SCW.CONFIG.MAKE_MDF_IDF_WEBHOOK = 'https://hook.us1.make.com/create';

  // ══ the sub's deployment dashboard (scene_1353): the page record IS the project ══
  window.Knack.router.current_scene_key = 'scene_1353';
  window.location.hash = '#subcontractor-portal/deployment-dashboard/' + PRJ + '/';
  window.Knack.getUserAttributes = () => ({ id: 'u7', email: 'tech@svs.example' });
  delete window.Knack.views.view_3491; delete window.Knack.views.view_3492; delete window.Knack.views.view_3602;
  window.Knack.views.view_4060 = gridView('view_4060');
  window.Knack.views.view_4056 = { model: { data: { models: [] } } };
  posts = []; fetched.length = 0; refreshed.length = 0; timers.length = 0;
  check('sub deployment dashboard: project mode over view_4060, the project from the route',
    [T.addModeFor('view_4056'), T.pageGridOf('view_4056'), T.pageProject()], ['project', 'view_4060', { id: PRJ, sowId: '' }]);
  check('the button renders with no native menu on the page', hasAddMdf('view_4056'), true);
  check('the ops deploy worksheet is not project mode (it has a site grid)', T.addModeFor('view_4093'), '');
  reply = { status: 200, body: '{"ok": true, "created": true, "id": "new4", "number": "3", "type": "IDF"}' };
  ns.toolbar._handleAction('add-mdf', 'view_4056');
  check('the sub sees the same project window', /Add an MDF\/IDF to this project/.test(overlay().textContent), true);
  $m('[data-in="name"]').value = 'Roof';
  $m('[data-act="add"]').click(); await flush(); await flush();
  const d = posts[0] && posts[0].body;
  check('the sub payload: the project off the route, approved so it shows on the page (its grid hides proposed), no SOW',
    d && [d.projectId, d.lifecycle, d.numberScope, d.source, d.viewKey, 'sowId' in d, d.triggeredBy],
    [PRJ, 'approved', 'project', 'project-modal', 'view_4056', false, 'tech@svs.example']);
  runTimers(); await flush(); await flush();
  check("view_4060 and the sub's worksheet are re-read", [fetched.indexOf('view_4060') >= 0, refreshed.indexOf('view_4056') >= 0], [true, true]);

  // a failed send keeps the window
  posts = []; timers.length = 0;
  reply = { status: 422, body: '{"ok": false, "error": "no-site", "message": "This project has no Site. Set the project\'s Site first."}' };
  ns.toolbar._handleAction('add-mdf', 'view_4056');
  $m('[data-act="add"]').click(); await flush(); await flush();
  check("Make's refusal is shown and the window stays", [!!overlay(), /This project has no Site/.test($m('.scw-mst-note').textContent)], [true, true]);
  cancel();

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
