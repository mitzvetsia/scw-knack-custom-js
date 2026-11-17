// jsdom test: the site's MDF/IDFs on the sales Scope of Work Details page (mdf-site-remote.js, 2026-11-17).
// The page's own closet grid view_3602 holds the PROJECT's closets; on the site route the module reads the
// site's closets through a grid on a project-record page (BUILD SOW's view_4166, with the build-sow crumb)
// and adds the ones the page lacks to view_3602's model, marked _scwSiteRemote. Off the route: nothing.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PID = 'a1000000000000000000000a', SOW = 'b2000000000000000000000b';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://x.knack.com/app#sales-portal/company-details/c3000000000000000000000c/scope-of-work-details/' + SOW });
const { window } = dom;
global.window = window; global.document = window.document;

// minimal jQuery: namespaced on/off/trigger on document
const handlers = {};
function jq() { return api; }
const api = {
  off(ev) { delete handlers[ev]; return api; },
  on(ev, fn) { handlers[ev] = fn; return api; }
};
window.jQuery = window.$ = jq; global.jQuery = global.$ = jq;
const fire = (ev) => { const out = []; Object.keys(handlers).forEach(k => { if (k.indexOf(ev + '.') === 0 || k === ev) out.push(handlers[k]()); }); return out; };

let routeOn = true;
const gets = [];
let answer = (url) => ({ ok: true, body: { records: [] } });
const notified = [];
window.SCW = {
  CONFIG: {}, debug() {},
  mdfSiteRoute: { active: () => routeOn },
  mdfSiteTools: { pageProject: () => ({ id: PID, sowId: SOW }) },
  worksheetV2: { data: { notify: (k) => notified.push(k) } },
  knackAjax(o) { gets.push(o.url); const a = answer(o.url); setTimeout(() => (a.ok ? o.success(a.body) : o.error({ status: a.status })), 0); }
};
global.SCW = window.SCW;
const closet = (id, name, extra) => Object.assign({ id, field_1642: name, field_1642_raw: name }, extra || {});
function freshGrid() {
  const models = [{ id: 'own1', attributes: closet('own1', 'HEADEND: Server room') }];
  window.Knack.views.view_3602 = { model: { data: { models } } };       // plain collection: no .add
  return window.Knack.views.view_3602.model.data;
}
window.Knack = { api_url: 'https://api.knack.com', views: {}, getUserToken: () => 't', application_id: 'app' };
global.Knack = window.Knack;
new Function('window', 'document', 'jQuery', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/mdf-site-remote.js'), 'utf8'))(window, window.document, jq, jq, window.Knack, window.SCW);
const R = window.SCW.mdfSiteRemote;

let fails = 0;
function ok(cond, msg) { if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const names = (coll) => coll.models.map(m => (m.attributes || m).field_1642);

(async () => {
  // ── off the route: no read, no change ──
  routeOn = false;
  let coll = freshGrid();
  await R.run('view_3602');
  ok(gets.length === 0 && coll.models.length === 1, 'off the site route: nothing is read and the page list is untouched');
  ok(R.loaded('view_3602') === false, '… and the list does not count as the site\'s');

  // ── on the route: the site's closets are read through BUILD SOW's grid and added ──
  routeOn = true;
  answer = () => ({ ok: true, body: { records: [
    closet('own1', 'HEADEND: Server room'),                                   // already on the page
    closet('site2', 'IDF: 02: 4th floor'),
    closet('site3', 'IDF: 03: Warehouse'),
    closet('gone4', 'IDF: 04: Old closet', { field_2845: 'merged' })          // merged: never shown
  ] } });
  coll = freshGrid();
  const n = await R.run('view_3602');
  ok(gets.length === 1 && /\/v1\/scenes\/scene_1085\/views\/view_4166\/records\?format=both/.test(gets[0]) &&
     gets[0].indexOf('build-sow_id=' + PID) > 0 && /rows_per_page=1000/.test(gets[0]),
    'the read goes to BUILD SOW\'s site grid with the project as its crumb (the source with no view is skipped)');
  ok(n === 2 && JSON.stringify(names(coll)) === JSON.stringify(['HEADEND: Server room', 'IDF: 02: 4th floor', 'IDF: 03: Warehouse']),
    'the two site closets the page lacked are added; the one it had is not doubled; the merged one is left out');
  ok(R.isRemote('view_3602', 'site2') === true && R.isRemote('view_3602', 'own1') === false,
    'added closets are marked as the site\'s; the project\'s own is not');
  ok(JSON.stringify(notified) === JSON.stringify(['view_3586']), 'the sales worksheet is told to rebuild');
  ok(R.loaded('view_3602') === true, 'the page list now counts as the site\'s (the add window numbers on the site)');

  // ── Knack re-renders the grid (its model is reset): the closets come back from the cache, no second read ──
  coll = freshGrid();
  fire('knack-view-render.view_3602');
  await new Promise(r => setTimeout(r, 20));
  ok(gets.length === 1 && coll.models.length === 3, 'a re-render of the page grid puts them back without another read');
  await R.run('view_3602');
  ok(coll.models.length === 3, 'running again adds nothing twice');

  // ── refresh() re-reads the site ──
  answer = () => ({ ok: true, body: { records: [closet('site2', 'IDF: 02: 4th floor'), closet('site5', 'IDF: 05: New')] } });
  await R.refresh('view_3602');
  ok(gets.length === 2 && names(coll).indexOf('IDF: 05: New') >= 0, 'refresh re-reads and adds a closet made elsewhere since');

  // ── a refused read (a login that cannot open BUILD SOW) changes nothing and keeps the last good list ──
  delete R._cache[PID];
  answer = () => ({ ok: false, status: 403 });
  coll = freshGrid();
  const warns = []; const w0 = console.warn; console.warn = (m) => warns.push(String(m));
  const n2 = await R.run('view_3602');
  console.warn = w0;
  ok(n2 === 0 && coll.models.length === 1, 'a refused read leaves the page with its own closets');
  ok(warns.length === 1 && /view_4166/.test(warns[0]) && /403/.test(warns[0]), '… and says once which grid refused');
  ok(R.loaded('view_3602') === false, '… and the list is the project\'s again');

  // ── a Sales Portal source, once Builder has one, is tried first ──
  R.CONFIG.pages.view_3602.sources[0].view = 'view_9999';
  gets.length = 0;
  answer = (url) => (/view_9999/.test(url) ? { ok: true, body: { records: [closet('site2', 'IDF: 02: 4th floor')] } } : { ok: false, status: 500 });
  coll = freshGrid();
  await R.run('view_3602');
  ok(gets.length === 1 && /scenes\/scene_1127\/views\/view_9999/.test(gets[0]) && gets[0].indexOf('view-core-project-details_id=' + PID) > 0,
    'with a grid on the Sales Portal project page configured, that one is read (its own crumb) and BUILD SOW is not asked');

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
