// jsdom smoke test: other-files-gallery.js renders the Other Files grid as cards and, on the
// ops deploy page only, lets a PM delete a file: confirm → view-based DELETE through the DOC
// save view (view_3941) → card + native row gone → models refetched.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
const calls = []; const fetched = {};
const models = (key, ids) => ({ key, model: { data: { models: ids.map(id => ({ attributes: { id, field_68_raw: { url: 'https://s3/' + id + '.pdf', filename: id + '.pdf' } } })) }, fetch() { fetched[key] = (fetched[key] || 0) + 1; } } });
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' }, api_url: 'https://api.knack.com' }; global.Knack = window.Knack;
const viewHandlers = {};
window.SCW = { CONFIG: {}, knackRecordUrl(v, id) { return '/' + v + '/' + id; },
  knackAjax(o) { calls.push({ url: o.url, type: o.type || 'PUT' }); if (/fail/.test(o.url)) o.error({ status: 403 }); else o.success({}); },
  onViewRender(v, fn) { (viewHandlers[v] = viewHandlers[v] || []).push(fn); }, debug() {} };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/other-files-gallery.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

function scene(view, saveView, ids) {
  document.body.innerHTML = '<div id="kn-scene_1311">' +
    '<div class="kn-view kn-table" id="' + view + '"><div class="kn-table-wrapper"><table><thead><tr><th class="field_68">File</th><th class="field_2877">Type</th><th class="kn-table-link">edit</th></tr></thead><tbody>' +
    ids.map(id => '<tr id="' + id + '"><td class="field_68"><a class="kn-view-asset" href="https://s3/' + id + '.pdf">' + id + '.pdf</a></td><td class="field_2877"></td><td class="kn-table-link"><a href="#edit/' + id + '">edit</a></td></tr>').join('') +
    '</tbody></table></div></div>' +
    '<div class="kn-view kn-table" id="' + saveView + '"><table><thead><tr><th class="field_2894">Req</th><th class="field_588">Notes</th></tr></thead><tbody></tbody></table></div></div>';
  window.Knack.views = {};
  window.Knack.views[view] = models(view, ids);
  window.Knack.views[saveView] = models(saveView, ids);
  (viewHandlers[view] || []).forEach(fn => fn());
}
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const A = 'a1a1a1a1a1a1a1a1a1a1a1a1', B = 'b2b2b2b2b2b2b2b2b2b2b2b2', F = 'fail0000000000000000fail';
scene('view_3942', 'view_3941', [A, B, F]);
setTimeout(() => {
  const view = document.getElementById('view_3942');
  check('ops page: one card per row, each with a delete control', [view.querySelectorAll('.scw-ofg-card').length, view.querySelectorAll('.scw-ofg-del').length], [3, 3]);
  let asked = null; window.confirm = m => { asked = m; return false; };
  view.querySelectorAll('.scw-ofg-del')[0].click();
  check('delete asks first (names the file); declining does nothing', [/a1a1a1a1a1a1a1a1a1a1a1a1\.pdf/.test(asked), calls.length, view.querySelectorAll('.scw-ofg-card').length], [true, 0, 3]);
  window.confirm = () => true;
  view.querySelectorAll('.scw-ofg-del')[0].click();
  check('confirming DELETEs through the save view, drops the card and the native row, refetches the save view', [calls[0], view.querySelectorAll('.scw-ofg-card').length, !!view.querySelector('tr[id="' + A + '"]'), fetched.view_3941], [{ url: '/view_3941/' + A, type: 'DELETE' }, 2, false, 1]);
  const alerts = []; window.alert = m => alerts.push(m); global.alert = window.alert;
  view.querySelectorAll('.scw-ofg-del')[1].click();   // the "fail" record → 403
  check('a failed DELETE keeps the card and explains', [view.querySelectorAll('.scw-ofg-card').length, alerts.length === 1 && /HTTP 403/.test(alerts[0]), view.querySelectorAll('.scw-ofg-del')[1].disabled], [2, true, false]);
  // Sub dashboard: same module, no delete.
  scene('view_4063', 'view_4068', [A, B]);
  setTimeout(() => {
    const sub = document.getElementById('view_4063');
    check('sub dashboard: cards, but no delete control', [sub.querySelectorAll('.scw-ofg-card').length, sub.querySelectorAll('.scw-ofg-del').length], [2, 0]);
    console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
    process.exit(fails ? 1 : 0);
  }, 100);
}, 100);
