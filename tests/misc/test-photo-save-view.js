// jsdom smoke test: the photo save view on the Build SOW page (2026-10-28).
// util.js knackRecordUrl addresses a view under the scene that OWNS it (Knack.scenes), so the
// edit-photo FORM on child scene_1159 is the save view for view_3962 — view_3584 (the grid that only
// houses the strip's Edit link: no field columns, inline editing off) 400'd every PUT. photo-edit-
// panel.js putRecord drops the fields a form has no input for and rejects when nothing is left.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/p1/build-sow/p1' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.sessionStorage = window.sessionStorage; global.localStorage = window.localStorage;
const ajaxCalls = [];
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; },
  find() { return jqObj; }, ajaxError() { return jqObj; }, ajaxPrefilter() { return jqObj; }, length: 0 };
jq.fn = {}; jq.ajax = (o) => { ajaxCalls.push(o); if (o.success) o.success({ id: 'r1' }); return {}; };
jq.ajaxPrefilter = () => {}; jq.extend = Object.assign;
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.fetch = () => Promise.resolve({ status: 200, clone() { return this; }, text() { return Promise.resolve(''); } });

// The app schema as Knack holds it client-side: Build SOW (scene_1085) with the link-only grid
// view_3584 and the editable-but-filtered grid view_3917; its child edit-photo scene_1159 with the
// update form view_3585 (field_675 read-only); the deploy scene_1311 with the grid view_3937.
const formInputs = [
  { id: 'field_675', type: 'connection', field: { key: 'field_675' }, read_only: true },
  { id: 'field_2341', type: 'connection', field: { key: 'field_2341' } },
  { id: 'field_2342', type: 'connection', field: { key: 'field_2342' } },
  { id: 'field_771', type: 'image', field: { key: 'field_771' } },
  { id: 'field_2445', type: 'connection', field: { key: 'field_2445' } },
  { id: 'field_114', type: 'short_text', field: { key: 'field_114' } },
  { id: 'field_2446', type: 'boolean', field: { key: 'field_2446' } }
];
window.Knack = {
  api_url: 'https://us-api.knack.com', application_id: 'app',
  router: { current_scene_key: 'scene_1085' },
  getUserToken() { return 'tok'; },
  views: { view_3584: {}, view_3917: {} },
  scenes: { models: [
    { attributes: { key: 'scene_1085', slug: 'build-sow', views: [
      { key: 'view_3584', type: 'table', columns: [{ type: 'link' }, { type: 'delete' }] },
      { key: 'view_3917', type: 'table', options: { cell_editor: true }, columns: [{ field: { key: 'field_771' } }] },
      { key: 'view_3962', type: 'table' }
    ] } },
    // a scene whose views ride a Backbone-style collection (sc.views.models / v.attributes)
    { attributes: { key: 'scene_1159', slug: 'edit-photo', parent: 'build-sow' },
      views: { models: [ { attributes: { key: 'view_3585', type: 'form', action: 'update',
        groups: [{ columns: [{ inputs: formInputs }] }] } } ] } },
    { attributes: { key: 'scene_1311', slug: 'deploy', views: [
      { key: 'view_3937', type: 'table', options: { cell_editor: true }, columns: [{ field: { key: 'field_771' } }, { field: { key: 'field_2447' } }] }
    ] } }
  ] }
};
global.Knack = window.Knack;
window.SCW = {}; global.SCW = window.SCW;
const infos = [];
const realInfo = console.info; console.info = (m) => infos.push(String(m));

for (const f of ['../../src/util.js', '../../src/features/photo-edit-panel.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const SCW = window.SCW;

let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }

(async () => {
  // ── sceneOfView / knackRecordUrl ──
  ok(SCW.sceneOfView('view_3585') === 'scene_1159', 'sceneOfView: a form on a child scene resolves to that scene (Backbone-shaped views)');
  ok(SCW.sceneOfView('view_3584') === 'scene_1085', 'sceneOfView: a grid on the page resolves to the page (plain-array views)');
  ok(SCW.sceneOfView('view_3937') === 'scene_1311', 'sceneOfView: the deploy grid resolves to the deploy scene');
  ok(SCW.sceneOfView('view_9999') === '', 'sceneOfView: an unknown view is ""');
  ok(SCW.knackRecordUrl('view_3585', 'r1') === 'https://us-api.knack.com/v1/pages/scene_1159/views/view_3585/records/r1',
    'knackRecordUrl: the edit-photo form is addressed under scene_1159 while the page is scene_1085');
  ok(SCW.knackRecordUrl('view_3584', 'r1') === 'https://us-api.knack.com/v1/pages/scene_1085/views/view_3584/records/r1',
    'knackRecordUrl: a view on the current scene is unchanged');
  ok(SCW.knackRecordUrl('view_9999', 'r1') === 'https://us-api.knack.com/v1/pages/scene_1085/views/view_9999/records/r1',
    'knackRecordUrl: a view the schema does not list falls back to the current scene (the old behaviour)');
  ok(SCW.knackRecordUrl('view_3937', 'r1') === 'https://us-api.knack.com/v1/pages/scene_1311/views/view_3937/records/r1',
    'knackRecordUrl: qa-popover\'s hardcoded deploy grid now addresses the deploy scene from any page');

  // ── viewWritableFields ──
  const wf = SCW.viewWritableFields('view_3585');
  ok(Array.isArray(wf) && wf.join() === 'field_2341,field_2342,field_771,field_2445,field_114,field_2446',
    'viewWritableFields: the form\'s inputs minus the read-only one, in form order (' + (wf && wf.join()) + ')');
  ok(SCW.viewWritableFields('view_3937') === null, 'viewWritableFields: a grid is null (sent as-is)');
  ok(SCW.viewWritableFields('view_9999') === null, 'viewWritableFields: an unknown view is null');

  // ── SAVE_VIEWS + putRecord ──
  const pep = SCW.photoEditPanel;
  ok(pep.SAVE_VIEWS.view_3962 === 'view_3585', 'SAVE_VIEWS: the Build SOW page saves through the edit-photo form view_3585');
  ok(pep.SAVE_VIEWS.view_4093 === 'view_3937', 'SAVE_VIEWS: the deploy page still saves through view_3937');

  ajaxCalls.length = 0;
  const r1 = await pep.util.putRecord('view_3585', 'slot1', { field_771: 'asset1' });
  ok(ajaxCalls.length === 1 && ajaxCalls[0].type === 'PUT' &&
     ajaxCalls[0].url === 'https://us-api.knack.com/v1/pages/scene_1159/views/view_3585/records/slot1',
    'putRecord: the fill PUTs the asset id to the form under scene_1159');
  ok(JSON.stringify(JSON.parse(ajaxCalls[0].data)) === JSON.stringify({ field_771: 'asset1' }), 'putRecord: the body is the image field');
  ok(r1 && r1.id === 'r1', 'putRecord: resolves with the response');

  ajaxCalls.length = 0; infos.length = 0;
  await pep.util.putRecord('view_3585', 'slot1', { field_771: null, field_2447: false });
  ok(ajaxCalls.length === 1 && JSON.stringify(JSON.parse(ajaxCalls[0].data)) === JSON.stringify({ field_771: null }),
    'putRecord: a mixed body keeps the image field and drops the flag the form lacks (Remove photo still clears)');
  ok(infos.length === 1 && /view_3585 has no input for field_2447/.test(infos[0]) && /Builder/.test(infos[0]),
    'putRecord: one console line names the dropped field and the Builder fix');

  ajaxCalls.length = 0; infos.length = 0;
  let err = null;
  try { await pep.util.putRecord('view_3585', 'slot1', { field_2447: 'Yes', field_2865: 'line' }); } catch (e) { err = e; }
  ok(ajaxCalls.length === 0, 'putRecord: the completion stamp sends nothing when the form has neither field');
  ok(err && err.status === 400 && /field_2447, field_2865/.test(err.message), 'putRecord: …and rejects honestly (status 400, permanent — no retry)');
  ok(infos.length === 1, 'putRecord: the console line for that field set is printed once');
  await pep.util.putRecord('view_3585', 'slot2', { field_2447: 'Yes', field_2865: 'x' }).catch(() => {});
  ok(infos.length === 1, 'putRecord: …and not again for the same view + fields');

  ajaxCalls.length = 0;
  await pep.util.putRecord('view_3937', 'p1', { field_771: 'a', field_2447: 'Yes', field_2865: 'h' });
  ok(ajaxCalls.length === 1 && Object.keys(JSON.parse(ajaxCalls[0].data)).join() === 'field_771,field_2447,field_2865',
    'putRecord: a grid save view is sent as-is (deploy page unchanged)');
  ok(ajaxCalls[0].url === 'https://us-api.knack.com/v1/pages/scene_1311/views/view_3937/records/p1', 'putRecord: …under its own scene');

  // ── no schema at all: everything behaves as before ──
  const savedScenes = window.Knack.scenes; window.Knack.scenes = undefined;
  ok(SCW.knackRecordUrl('view_3585', 'r1') === 'https://us-api.knack.com/v1/pages/scene_1159/views/view_3585/records/r1',
    'knackRecordUrl: a memoized answer survives the schema going away');
  window.Knack.scenes = savedScenes;

  console.info = realInfo;
  console.log('RESULT ' + (n - fails) + '/' + n + (fails ? ' FAILED' : ' passed'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.info = realInfo; console.log('FAIL - threw ' + (e && e.stack || e)); process.exit(1); });
