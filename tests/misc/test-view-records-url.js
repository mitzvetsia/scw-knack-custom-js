// jsdom test: util.js SCW.viewRecordsUrl / SCW.sceneCrumbs (2026-11-17). A read of a grid filtered
// through the page's record (the site closet grids: project → site) must carry the page's parent-record
// crumb (`<slug>_id=<id>`) the way Knack's own reads do; without it Knack answers with nothing. Knack
// does not put the crumb in model.url(). The MDF/IDF merge window reads Make's progress this way.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="kn-scene_1085"></div></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#installation-projects/project-dashboard/' + PID + '/build-sow/' + PID });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage; global.sessionStorage = window.sessionStorage;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, ajaxError() { return jqObj; },
  ajaxPrefilter() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; jq.ajax = () => {}; jq.ajaxPrefilter = () => {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
let modelUrl = 'https://api.knack.com/v1/scenes/scene_1085/views/view_4166/records?format=both&page=1&rows_per_page=25';
window.Knack = {
  api_url: 'https://api.knack.com',
  router: { current_scene_key: 'scene_1085' },
  views: { view_4166: { model: { url() { return modelUrl; } } }, view_bare: { model: {} } },
  scenes: { models: [{ attributes: { key: 'scene_1085', views: [{ key: 'view_4166' }, { key: 'view_bare' }] } }] }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'jQuery', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/util.js'), 'utf8'))(
  window, document, jq, jq, window.Knack, window.SCW);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const S = window.SCW;

check('no form on the scene: the crumbs come from the page address (slug/id pairs)',
  S.sceneCrumbs('scene_1085'), [{ name: 'project-dashboard_id', value: PID }, { name: 'build-sow_id', value: PID }]);
check("the grid's own address, its paging dropped, the crumbs added",
  S.viewRecordsUrl('view_4166'),
  'https://api.knack.com/v1/scenes/scene_1085/views/view_4166/records?format=both&project-dashboard_id=' + PID + '&build-sow_id=' + PID);

// a form on the scene carries Knack's exact crumb names — those win over the address
document.getElementById('kn-scene_1085').innerHTML = '<input type="hidden" class="crumb" name="build-sow_id" value="' + PID + '">';
check('a form crumb on the scene wins', S.sceneCrumbs('scene_1085'), [{ name: 'build-sow_id', value: PID }]);
modelUrl = 'https://api.knack.com/v1/scenes/scene_1085/views/view_4166/records?format=both&build-sow_id=' + PID;
check('a crumb Knack already carries is not added twice',
  S.viewRecordsUrl('view_4166'), modelUrl);
check('no model url: the scenes path is built by hand',
  S.viewRecordsUrl('view_bare'), 'https://api.knack.com/v1/scenes/scene_1085/views/view_bare/records?format=both&build-sow_id=' + PID);
check('a view not on the page: no address', S.viewRecordsUrl('view_9999'), '');

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
