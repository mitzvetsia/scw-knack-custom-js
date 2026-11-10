// jsdom smoke test: the MDF/IDF site tools (2026-11-10, src/features/mdf-site-tools.js) — the
// "+ Add MDF/IDF" modal (Make 22.02 create) and "Merge…" (Make 22.03), on the site route only.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#installation-projects/project-dashboard/' + PID + '/build-sow/' + PID });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.localStorage = window.localStorage; global.sessionStorage = window.sessionStorage;
global.AbortController = window.AbortController || global.AbortController;
const nodeTimeout = setTimeout;
const timers = [];
window.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
window.clearTimeout = () => {};
global.setTimeout = window.setTimeout; global.clearTimeout = window.clearTimeout;
function runTimers() { while (timers.length) timers.shift().fn(); }
const TOAST_MS = 7000;
// the merge re-reads (CONFIG.mergePollMs) — not the toast timer or the request timeout
const isWatch = (t) => t.ms !== TOAST_MS && t.ms !== 40000;
const watchTimers = () => timers.filter(isWatch);
function nextWatch() { const i = timers.findIndex(isWatch); return i < 0 ? null : timers.splice(i, 1)[0]; }
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, length: 0 };
window.jQuery = jq; window.$ = jq;

let userEmail = 'micah.shearer@getscw.com';
// the site grid's model (view_4166): a HEADEND, IDF 01, IDF 03, a merged IDF 07, one created on another project
function rec(id, type, num, name, opts) {
  opts = opts || {};
  return { attributes: {
    id, field_1641: type, field_2458: num, field_2458_raw: num === '' ? '' : Number(num), field_1943: name,
    field_1642: type + ': ' + (num === '' ? '' : String(num).padStart(2, '0')) + ': ' + name,
    field_1643: opts.notes || '', field_2845: opts.lifecycle || 'approved',
    field_1648_raw: [{ id: opts.project || PID, identifier: 'P' }]
  } };
}
let gridModels = [
  rec('h1', 'HEADEND', '', 'Server room'),
  rec('i1', 'IDF', 1, 'Warehouse'),
  rec('i3', 'IDF', 3, 'Office', { notes: 'by the stairs' }),
  rec('i7', 'IDF', 7, 'Old', { lifecycle: 'merged' }),
  rec('h2', 'HEADEND', '', '', { project: 'bbbbbbbbbbbbbbbbbbbbbbbb' })
];
let fetches = 0;
window.Knack = {
  getUserAttributes() { return { email: userEmail }; },
  views: { view_4166: { model: { data: { get models() { return gridModels; } }, fetch() { fetches++; return Promise.resolve(); } } } }
};
window.SCW = { CONFIG: {
  MAKE_MDF_IDF_WEBHOOK: 'https://hook.us1.make.com/create',
  MAKE_MDF_MERGE_WEBHOOK: 'https://hook.us1.make.com/merge'
} };
const refreshed = [];
window.SCW.worksheetV2 = {
  cfg: { viewCfg(k) { return k === 'view_3962' ? { mdfSourceViewKey: 'view_4166' } : null; } },
  data: {
    refetchAndNotify(k) { refreshed.push(k); },
    readRecords() { return [{ field_1946_raw: [{ id: 'i3' }] }, { field_1946_raw: [{ id: 'i3' }] }, { field_1946_raw: [{ id: 'h2' }] }]; }
  }
};
let posts = [];
let reply = { status: 200, body: '{"ok": true, "created": true, "id": "new1", "number": "4", "type": "IDF"}' };
window.fetch = (url, o) => {
  posts.push({ url, body: JSON.parse(o.body) });
  return Promise.resolve({ status: reply.status, text: () => Promise.resolve(reply.body) });
};
global.fetch = window.fetch;
global.Knack = window.Knack; global.SCW = window.SCW;

function load(f) {
  new Function('window', 'document', '$', 'jQuery', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, f), 'utf8'))(
    window, document, jq, jq, window.Knack, window.SCW);
}
load('../../src/features/mdf-site-route.js');
load('../../src/features/mdf-site-tools.js');
const T = window.SCW.mdfSiteTools;

let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const flush = () => new Promise((r) => nodeTimeout(r, 0));
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

(async () => {
  // ── gates ──
  ok(T.canAdd('view_4166') && T.canMerge('view_4166'), 'on the route + a site grid: add and merge are on');
  ok(!T.canAdd('view_3577') && !T.canMerge('view_3822'), 'a project grid never gets them');
  userEmail = 'someone@getscw.com';
  ok(!T.canAdd('view_4166') && !T.canMerge('view_4166'), 'a login off the preview list never gets them');
  userEmail = 'micah.shearer@getscw.com';
  ok(T.projectId() === PID, 'the project comes from the record after the page slug');
  ok(T.nextFree(T.closets('view_4166')) === '4', 'next free IDF ## at the site skips the merged IDF 07 (max live = 03)');

  // ── + Add MDF/IDF ──
  T.openAdd({ viewKey: 'view_3962', gridKey: 'view_4166' });
  const listRows = $$('.scw-mst-list .scw-mst-row');
  ok(listRows.length === 4, 'the modal lists the 4 live closets at the site first (the merged one is left out)');
  ok(/HEADEND/.test(listRows[0].textContent) && /HEADEND/.test(listRows[1].textContent), 'HEADENDs lead the list');
  ok(listRows.some((r) => /created on another project/.test(r.textContent)), 'a closet made on another project says so');
  ok($('[data-in="number"]').value === '4', 'the IDF ## is prefilled with the next free number');
  $('[data-in="number"]').value = '3';
  $('[data-in="number"]').dispatchEvent(new window.Event('input'));
  ok(/IDF 03 already exists/.test($('.scw-mst-note').textContent), 'a ## taken at the site is named');
  $('[data-act="add"]').click();
  await flush();
  ok(posts.length === 0, 'a taken ## never posts');
  $('[data-in="number"]').value = '4';
  $('[data-in="number"]').dispatchEvent(new window.Event('input'));
  $('[data-in="name"]').value = 'Shop';
  $('[data-act="add"]').click();
  await flush(); await flush();
  const p = posts[0] && posts[0].body;
  ok(posts.length === 1 && posts[0].url === 'https://hook.us1.make.com/create', 'Add posts once to the 22.02 hook');
  ok(p && p.action === 'create' && p.projectId === PID && p.type === 'IDF' && p.number === '4' && p.name === 'Shop' &&
     p.lifecycle === 'approved' && p.triggeredBy === 'micah.shearer@getscw.com', 'the create payload');
  ok(!$('.scw-mst-overlay'), 'a created reply closes the modal');
  ok(/Added IDF 04: Shop/.test(($('.scw-mst-toast') || {}).textContent || ''), 'the toast names what was added');
  runTimers(); await flush();
  ok(fetches >= 1 && refreshed.indexOf('view_3962') >= 0, 'the site grid and the worksheet are re-read');

  // HEADEND: no ##
  posts = []; fetches = 0;
  T.openAdd({ viewKey: 'view_3962', gridKey: 'view_4166' });
  $('.scw-mst-chip[data-type="HEADEND"]').click();
  ok($('[data-num-fld]').style.display === 'none', 'HEADEND hides the ##');
  reply = { status: 422, body: '{"ok": false, "error": "no-site", "message": "This project has no Site."}' };
  $('[data-act="add"]').click();
  await flush(); await flush();
  ok(posts[0].body.type === 'HEADEND' && posts[0].body.number === '', 'a HEADEND posts no ##');
  ok($('.scw-mst-overlay') && /no Site/.test($('.scw-mst-note').textContent), "Make's refusal shows in the modal, which stays open");
  // an unreadable 200 ("Accepted") counts as sent
  reply = { status: 200, body: 'Accepted' };
  $('[data-act="add"]').click();
  await flush(); await flush();
  ok(!$('.scw-mst-overlay') && /Sent/.test($('.scw-mst-toast').textContent), 'an "Accepted" reply closes as sent');
  timers.length = 0;

  // ── Merge… ──
  posts = []; fetches = 0; refreshed.length = 0;
  reply = { status: 200, body: 'Accepted' };
  T.openMerge({ viewKey: 'view_3962', gridKey: 'view_4166', keeperId: 'i1', keeperLabel: 'IDF: 01: Warehouse' });
  ok(/Merge into IDF: 01: Warehouse/.test($('.scw-mst-head').textContent), 'the keeper is the closet the panel was open on');
  const rows = $$('.scw-mst-list .scw-mst-row');
  ok(rows.length === 3 && !rows.some((r) => /Warehouse/.test(r.textContent)), "the list is the site's OTHER live closets");
  ok(/IDF/.test(rows[0].textContent) && /Office/.test(rows[0].textContent), 'same type as the keeper comes first');
  ok(/Different: IDF 03, this is IDF 01/.test(rows[0].textContent), 'a different ## gets an amber note');
  ok(rows.some((r) => /Different: a HEADEND, this is a IDF/.test(r.textContent)), 'a different type gets an amber note');
  ok(/2 items here/.test(rows[0].textContent), "the page's line items on each closet are counted");
  const go = $('[data-act="merge"]');
  ok(go.disabled, 'nothing ticked = Merge disabled');
  const box = rows[0].querySelector('input');
  box.checked = true; box.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok(!go.disabled && /Merge 1 into/.test(go.textContent), 'ticking one arms the button');
  ok(/differ from this one/.test($('.scw-mst-note').textContent), 'a mixed pick warns, never blocks');
  go.click();
  ok(posts.length === 0 && /Yes, merge 1/.test(go.textContent), 'the first click asks again (two-step)');
  go.click();
  await flush(); await flush();
  const m = posts[0] && posts[0].body;
  ok(posts.length === 1 && posts[0].url === 'https://hook.us1.make.com/merge', 'the second click posts once to the 22.03 hook');
  ok(m && m.keeperId === 'i1' && m.loserIds.join() === 'i3' && m.loserLabels[0] === 'IDF: 03: Office' && m.projectId === PID,
    'the merge payload: keeper + loser ids + labels');
  ok(!$('.scw-mst-overlay') && /Merging 1 into/.test($('.scw-mst-toast').textContent), 'the modal closes; the toast says Make is merging');

  // the watch: first tick the loser is still live, the second it reads merged
  ok(watchTimers().length === 1, 'a re-read is scheduled');
  nextWatch().fn(); await flush(); await flush();
  ok(fetches === 1 && watchTimers().length === 1, 'still live after the first re-read → another is scheduled');
  gridModels[2].attributes.field_2845 = 'merged';
  nextWatch().fn(); await flush(); await flush();
  ok(/Merged 1 into IDF: 01: Warehouse/.test($('.scw-mst-toast').textContent) && refreshed.indexOf('view_3962') >= 0,
    'once it reads merged: the worksheet is refreshed and the toast says so');
  ok(watchTimers().length === 0, 'no further re-reads');

  // a loser that drops out of the grid (the "not merged" filter) also counts as done
  timers.length = 0;
  window.SCW.mdfSiteTools._watchMerge('view_4166', 'view_3962', ['gone'], 'X');
  nextWatch().fn(); await flush(); await flush();
  ok(/Merged 1 into X/.test($('.scw-mst-toast').textContent), 'a loser gone from the site grid counts as merged');

  console.log('RESULT ' + (fails ? 'FAIL' : 'PASS') + ' ' + (n - fails) + '/' + n);
  process.exit(fails ? 1 : 0);
})();
