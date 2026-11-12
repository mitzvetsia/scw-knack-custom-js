// jsdom test: the closet panel (worksheet-v2/mdf-notes.js, the L1 pencil) offers "Delete…" only where a
// location may be deleted (2026-11-12 — "subs can't delete MDF/IDFs so we shouldn't show them that option").
// mdfManage.noDelete (the sub survey page view_3505 and the sub deployment dashboard view_4056) and a manage
// grid with no Delete link in Builder (SCW.viewHasDeleteLink === false: the DELETE would 403) leave it off;
// the ops pages keep it. Drives the real util.js (viewHasDeleteLink off Knack.scenes), worksheet-v2/config.js
// (the shipped view configs), mdf-edit-core.js and mdf-notes.js.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const L1 = 'cccccccccccccccccccccccc';
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#subcontractor-portal/site-survey-request-details/aaaaaaaaaaaaaaaaaaaaaaaa/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage; global.sessionStorage = window.sessionStorage;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, ajaxError() { return jqObj; },
  ajaxPrefilter() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; jq.ajax = () => {}; jq.ajaxPrefilter = () => {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const closet = (viewKey) => ({ model: { data: { models: [{ id: L1, attributes: {
  id: L1, field_1641: 'IDF', field_2458: '2', field_1943: 'Server Room', field_1642: 'IDF: 02 : Server Room' } }] } } });
const grid = (key, del) => ({ key, type: 'table', columns: [{ type: 'link' }].concat(del ? [{ type: 'delete' }] : []) });
window.Knack = {
  router: { current_scene_key: 'scene_1140' },
  getUserAttributes() { return { email: 'tech@svs.example' }; },
  views: { view_3617: closet(), view_4060: closet(), view_3577: closet(), view_3932: closet() },
  // the live schema (2026-11-12): view_3617 has no Delete link; the others do
  scenes: { models: [
    { attributes: { key: 'scene_1140', views: [grid('view_3617', false)] } },
    { attributes: { key: 'scene_1353', views: [grid('view_4060', true)] } },
    { attributes: { key: 'scene_1085', views: [grid('view_3577', true)] } },
    { attributes: { key: 'scene_1311', views: [grid('view_3932', true)] } }
  ] }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;
function load(rel) {
  new Function('window', 'document', '$', 'jQuery', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, rel), 'utf8'))(
    window, document, jq, jq, window.Knack, window.SCW);
}
load('../../src/util.js');
load('../../src/features/mdf-edit-core.js');
load('../../src/features/worksheet-v2/config.js');
load('../../src/features/worksheet-v2/mdf-notes.js');
const ns = window.SCW.worksheetV2;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
/** Open the closet panel on a worksheet's L1 the way a pencil click does; → the panel's button labels. */
function panelButtons(sourceViewKey) {
  document.body.innerHTML = '';
  const block = document.createElement('div');
  block.className = 'scw-ws-v2-l1';
  block.innerHTML = '<div class="scw-ws-v2-l1-head-wrap"><span class="scw-ws-v2-l1-label">IDF: 02 : Server Room</span></div>';
  document.body.appendChild(block);
  const btn = ns.mdfNotes.headerControl({ id: L1 }, sourceViewKey);
  if (!btn) return null;
  block.querySelector('.scw-ws-v2-l1-head-wrap').appendChild(btn);
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const panel = block.querySelector('.scw-ws-v2-mdf-notes-panel, [class$="-panel"]');
  return panel ? Array.from(panel.querySelectorAll('button')).map((b) => b.textContent.trim()) : null;
}

check('the schema read: view_3617 has no Delete link, view_4060 / view_3577 do, an unknown view cannot say',
  ['view_3617', 'view_4060', 'view_3577', 'view_9999'].map((v) => window.SCW.viewHasDeleteLink(v)), [false, true, true, null]);
check('the shipped configs mark both sub pages noDelete',
  [ns.cfg.viewCfg('view_3505').mdfManage.noDelete, ns.cfg.viewCfg('view_4056').mdfManage.noDelete,
   !!ns.cfg.viewCfg('view_3962').mdfManage.noDelete, !!ns.cfg.viewCfg('view_4093').mdfManage.noDelete],
  [true, true, false, false]);
check('sub survey page: the panel has no Delete', panelButtons('view_3505'), []);
check('sub deployment dashboard: no Delete, although its grid carries a Delete link', panelButtons('view_4056'), []);
check('ops Build SOW: Delete stays', panelButtons('view_3962'), ['Delete…']);
check('ops Manage Deployment: Delete stays', panelButtons('view_4093'), ['Delete…']);
// an ops page whose manage grid lost its Delete link in Builder: the button would only 403
window.Knack.scenes.models[2].attributes.views[0].columns = [{ type: 'link' }];
// (the index is memoized; a fresh schema read happens only for a key it has not seen — use a fresh view key)
window.Knack.scenes.models.push({ attributes: { key: 'scene_x', views: [grid('view_7777', false)] } });
window.Knack.views.view_7777 = closet();
const origCfg = ns.cfg.viewCfg;
ns.cfg.viewCfg = (k) => (k === 'view_7000' ? { mdfManage: { viewKey: 'view_7777', notesField: 'field_1643' } } : origCfg(k));
check('a manage grid with no Delete link: no Delete (the DELETE would 403)', panelButtons('view_7000'), []);
ns.cfg.viewCfg = (k) => (k === 'view_7000' ? { mdfManage: { viewKey: 'view_8888', notesField: 'field_1643' } } : origCfg(k));
window.Knack.views.view_8888 = closet();
check('a schema that cannot say leaves Delete on', panelButtons('view_7000'), ['Delete…']);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
