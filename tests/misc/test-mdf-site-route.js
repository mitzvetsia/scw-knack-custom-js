// jsdom smoke test: the MDF/IDF site route preview (2026-11-10, src/features/mdf-site-route.js).
// A login on previewEmails reads the closets of the project's SITE (view_4166 / view_4167 / view_4168)
// wherever the pages read the project grids (view_3577 / view_3822 / view_3932); everyone else is
// unchanged; the three site grids are hidden for everyone.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/p1/build-sow/p1' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.sessionStorage = window.sessionStorage; global.localStorage = window.localStorage;
const handlers = {};
function jq(x) { return jqObj; }
const jqObj = {
  on(ev, fn) { handlers[ev] = fn; return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, ajaxError() { return jqObj; },
  ajaxPrefilter() { return jqObj; }, length: 0
};
jq.fn = {}; jq.extend = Object.assign; jq.ajax = () => ({}); jq.ajaxPrefilter = () => {};
window.$ = jq; window.jQuery = jq; global.$ = jq; global.jQuery = jq;

let userEmail = 'someone@getscw.com';
window.Knack = {
  getUserAttributes() { return { email: userEmail, name: 'X' }; },
  views: {},
  scenes: { models: [
    { attributes: { key: 'scene_1085', views: [{ key: 'view_3577' }, { key: 'view_4166' }, { key: 'view_3962' }] } },
    { attributes: { key: 'scene_1155', views: [{ key: 'view_3822' }, { key: 'view_4167' }, { key: 'view_3921' }] } },
    { attributes: { key: 'scene_1311', views: [{ key: 'view_3932' }, { key: 'view_4168' }, { key: 'view_4093' }] } }
  ] }
};
global.Knack = window.Knack;
window.SCW = {}; global.SCW = window.SCW;
const infos = [];
console.info = (m) => infos.push(String(m));

function load(f) {
  new Function('window', 'document', '$', 'jQuery', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, f), 'utf8'))(
    window, document, jq, jq, window.Knack, window.SCW);
}
load('../../src/util.js');
load('../../src/features/bid-review/config.js');
load('../../src/features/bid-review-v2/config.js');
load('../../src/features/worksheet-v2/config.js');
// the add-item form's host table, as sow-add-item-form.js exports it
SCW.worksheetV2.sowAddForm = { CONFIG: { HOSTS: { view_3921: { page: 'project', mdfView: 'view_3822', mdfLabelField: 'field_1642' } } } };
load('../../src/features/mdf-site-route.js');

let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const cfg = (k) => SCW.worksheetV2.cfg.viewCfg(k);
const route = SCW.mdfSiteRoute;

// ── everyone else: unchanged ──
ok(!route.active(), 'a login not on the preview list is off the route');
ok(cfg('view_3962').mdfSourceViewKey === 'view_3577', 'Build SOW worksheet reads the project grid view_3577');
ok(cfg('view_3962').mdfManage.viewKey === 'view_3577', 'Build SOW location edits go through view_3577');
ok(cfg('view_4093').mdfSourceViewKey === 'view_3932' && cfg('view_4093').mdfManage.viewKey === 'view_3932',
  'deploy worksheet reads + writes through view_3932');
ok(SCW.bidReview.CONFIG.mdfIdfViewKey === 'view_3822', 'reconcile v1 loads view_3822');
ok(SCW.bidReviewV2.CONFIG.sourceViewKeys.indexOf('view_3822') >= 0 && SCW.bidReviewV2.CONFIG.sourceViewKeys.indexOf('view_4167') < 0,
  'reconcile v2 listens to view_3822, not view_4167');
ok(SCW.worksheetV2.sowAddForm.CONFIG.HOSTS.view_3921.mdfView === 'view_3822', 'reconcile "+ Add to SOW" lists view_3822');
ok(cfg('view_3586').mdfSourceViewKey === 'view_3602', 'the sales SOW page (no site grid) is never touched');
ok(cfg('view_4056').mdfSourceViewKey === 'view_4060', 'the sub deploy clone keeps its own grid');

// ── the site grids are hidden for everyone ──
const css = (document.getElementById('scw-mdf-site-route-css') || {}).textContent || '';
ok(['#view_4166', '#view_4167', '#view_4168', '.scw-acc-for-view_4166', '.scw-acc-for-view_4168'].every((s) => css.indexOf(s) >= 0),
  'static CSS hides the three site grids and their accordion sections');

// ── the preview login ──
userEmail = 'Micah.Shearer@getscw.com';
ok(route.active(), 'the preview login (any case) is on the route');
ok(cfg('view_3962').mdfSourceViewKey === 'view_4166' && cfg('view_3962').mdfManage.viewKey === 'view_4166',
  'Build SOW worksheet reads + writes through the site grid view_4166');
ok(cfg('view_4093').mdfSourceViewKey === 'view_4168' && cfg('view_4093').mdfManage.viewKey === 'view_4168',
  'deploy worksheet reads + writes through the site grid view_4168');
ok(SCW.bidReview.CONFIG.mdfIdfViewKey === 'view_4167', 'reconcile v1 loads the site grid view_4167');
const keys = SCW.bidReviewV2.CONFIG.sourceViewKeys;
ok(keys[3] === 'view_4167' && keys[0] === 'view_3680' && keys[1] === 'view_3921', 'reconcile v2 swaps only the MDF/IDF source (4th) to view_4167');
ok(SCW.worksheetV2.sowAddForm.CONFIG.HOSTS.view_3921.mdfView === 'view_4167', 'reconcile "+ Add to SOW" lists the site closets');
ok(cfg('view_3586').mdfSourceViewKey === 'view_3602', 'the sales SOW page stays on its project grid');
ok(cfg('view_4056').mdfSourceViewKey === 'view_4060', 'the sub deploy clone stays on view_4060');
ok(JSON.parse(JSON.stringify(cfg('view_3962'))).mdfSourceViewKey === 'view_4166', 'JSON copies see the routed value');
ok(route.views(['view_3577', 'view_3822', 'view_9999']).join() === 'view_4166,view_4167,view_9999', 'views() maps a list');

// the log line on scene render
handlers['knack-scene-render.any.scwMdfSiteRoute']();
ok(infos.some((l) => /site route ON/.test(l) && /view_3577→view_4166/.test(l)), 'one console line names the route on scene render');
ok(document.documentElement.classList.contains('scw-mdf-site-route'), 'html carries scw-mdf-site-route');

// ── install is idempotent; a re-install after a config write keeps the getter ──
route.install(); route.install();
ok(cfg('view_3962').mdfSourceViewKey === 'view_4166', 'install() twice changes nothing');
cfg('view_3962').mdfSourceViewKey = 'view_3577';
ok(cfg('view_3962').mdfSourceViewKey === 'view_4166', 'a write of the base key still routes');

// ── per-browser switch ──
localStorage.setItem('scwMdfSiteRoute', '0');
ok(!route.active() && cfg('view_3962').mdfSourceViewKey === 'view_3577', "localStorage '0' turns the route off for a preview login");
localStorage.setItem('scwMdfSiteRoute', '1');
userEmail = 'someone@getscw.com';
ok(route.active() && cfg('view_4093').mdfManage.viewKey === 'view_4168', "localStorage '1' turns it on for any login");
localStorage.removeItem('scwMdfSiteRoute');

// ── a site grid missing from the schema falls back ──
userEmail = 'micah.shearer@getscw.com';
// (util memoizes the schema walk for the session; a schema without view_4168 answers '')
const realSceneOf = SCW.sceneOfView;
SCW.sceneOfView = (k) => (k === 'view_4168' ? '' : realSceneOf(k));
ok(cfg('view_4093').mdfSourceViewKey === 'view_3932', 'a deleted site grid (not in the schema) falls back to the project grid');
ok(cfg('view_3962').mdfSourceViewKey === 'view_4166', 'the other pairs keep routing');
SCW.sceneOfView = realSceneOf;

// ── merged closets are taken out of every closet grid's model ──
function coll(models) {
  const c = { models, _ev: {} };
  c.on = (ev, fn) => { ev.split(' ').forEach((e) => { c._ev[e] = fn; }); };
  c.remove = (gone) => { c.models = c.models.filter((m) => gone.indexOf(m) < 0); };
  return c;
}
const live = { attributes: { id: 'a', field_2845: 'approved' } };
const merged = { attributes: { id: 'b', field_2845: 'merged', field_2845_raw: ['merged'] } };
const blank = { attributes: { id: 'c' } };
window.Knack.views.view_4166 = { model: { data: coll([live, merged, blank]) } };
handlers['knack-view-render.any.scwMdfMergedPrune']({}, { key: 'view_4166' });
ok(window.Knack.views.view_4166.model.data.models.map((m) => m.attributes.id).join() === 'a,c',
  'a site grid render drops merged closets (blank lifecycle stays)');
const c2 = window.Knack.views.view_4166.model.data;
c2.models.push({ attributes: { id: 'd', field_2845: '<span>merged</span>' } });
c2._ev.sync();
ok(c2.models.map((m) => m.attributes.id).join() === 'a,c', 'a refetch (sync) drops them again before anyone reads');
window.Knack.views.view_3577 = { model: { data: coll([merged, live]) } };
handlers['knack-view-render.any.scwMdfMergedPrune']({}, { key: 'view_3577' });
ok(window.Knack.views.view_3577.model.data.models.length === 1, 'project closet grids are cleaned the same way');
window.Knack.views.view_3962 = { model: { data: coll([merged]) } };
handlers['knack-view-render.any.scwMdfMergedPrune']({}, { key: 'view_3962' });
ok(window.Knack.views.view_3962.model.data.models.length === 1, 'other grids are never touched');

// ── "Merged into" (field_3318) alone marks a closet merged ──
ok(route.isMerged({ id: 'x', field_3318_raw: [{ id: 'k1', identifier: 'MDF' }] }), 'a Merged into link marks it merged');
ok(!route.isMerged({ id: 'x', field_3318_raw: [], field_3318: '' , field_2845: 'approved' }), 'an empty Merged into does not');
ok(!route.isMerged({ id: 'x', field_3318: '&nbsp;' }), 'a blank-rendered Merged into does not');

// ── any view render prunes every closet grid, and repaints what reads it ──
const notified = [];
SCW.worksheetV2.data = { notify: (k) => notified.push('ws:' + k) };
SCW.bidReviewV2 = SCW.bidReviewV2 || {};
SCW.bidReviewV2.data = { notifyDebounced: () => notified.push('br2') };
userEmail = 'micah.shearer@getscw.com';
const mergedInto = { attributes: { id: 'e', field_2845: 'approved', field_3318_raw: [{ id: 'k', identifier: 'Main' }] } };
window.Knack.views.view_4166 = { model: { data: coll([live, merged, mergedInto]) } };
window.Knack.views.view_3962 = { model: { data: coll([]) } };
handlers['knack-view-render.any.scwMdfMergedPrune']({}, { key: 'view_3962' });
ok(window.Knack.views.view_4166.model.data.models.map((m) => m.attributes.id).join() === 'a',
  "the WORKSHEET's render prunes the site grid too (data can land before the grid's own render)");
ok(notified.indexOf('ws:view_3962') >= 0, 'and repaints the worksheet that reads it (its listener sits on view_3577)');
notified.length = 0;
handlers['knack-view-render.any.scwMdfMergedPrune']({}, { key: 'view_4166' });
ok(notified.indexOf('ws:view_3962') >= 0, "a site grid's own render repaints its worksheet even with nothing to prune");
notified.length = 0;
window.Knack.views.view_4167 = { model: { data: coll([merged, live]) } };
handlers['knack-view-render.any.scwMdfMergedPrune']({}, { key: 'view_9999' });
ok(notified.indexOf('br2') >= 0 && window.Knack.views.view_4167.model.data.models.length === 1,
  'the reconcile site grid is pruned and the reconcile grid repainted');
notified.length = 0;
const c3 = window.Knack.views.view_4166.model.data;
c3.models.push({ attributes: { id: 'f', field_2845_raw: ['merged'] } });
c3._ev.sync();
ok(c3.models.length === 1 && notified.indexOf('ws:view_3962') >= 0, 'a refetch that brings a merged row back prunes + repaints');

// ── the worksheet never seeds a group from a merged closet, pruned or not ──
ok(typeof route.isMerged === 'function', 'isMerged is exported for the readers (render.js / bulk.js)');

// ── a grid with no merged signal is named once in the console ──
const warns = [];
const realWarn = console.warn;
console.warn = (m) => warns.push(String(m));
window.Knack.views.view_4168 = { model: { data: coll([{ attributes: { id: 'g', field_1642: 'MDF' } }]) } };
handlers['knack-view-render.any.scwMdfMergedPrune']({}, { key: 'view_4168' });
handlers['knack-view-render.any.scwMdfMergedPrune']({}, { key: 'view_4168' });
console.warn = realWarn;
ok(warns.filter((w) => w.indexOf('view_4168') >= 0 && w.indexOf('is not merged') >= 0).length === 1,
  'a closet grid serving neither column is named once, with the Builder fix');
ok(!warns.some((w) => w.indexOf('view_4166') >= 0), 'a grid that serves the column is not');

// ── diagnose() ──
console.table = () => {};
const diag = route.diagnose();
const d66 = diag.filter((r) => r.grid === 'view_4166')[0];
const d68 = diag.filter((r) => r.grid === 'view_4168')[0];
ok(d66 && d66.lifecycleColumn && d66.mergedHidden >= 3 && d66.siteGrid, 'diagnose: view_4166 serves the column, merged rows hidden');
ok(d68 && !d68.lifecycleColumn && !d68.mergedIntoColumn, 'diagnose: view_4168 serves neither');

// ── empty preview list = everyone (the full cut-over) ──
route.CONFIG.previewEmails = [];
userEmail = 'anyone@example.com';
ok(route.active(), 'an empty preview list puts every login on the route');

console.log('RESULT ' + (fails ? 'FAIL' : 'PASS') + ' ' + (n - fails) + '/' + n);
process.exit(fails ? 1 : 0);
