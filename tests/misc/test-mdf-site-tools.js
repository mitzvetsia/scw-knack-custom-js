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
const isWatch = (t) => t.ms !== TOAST_MS && t.ms !== 40000 && t.ms !== 2000;
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
let keeperProgress = '';
const ajaxCalls = [];
window.SCW.knackRecordUrl = (v, id) => 'url:' + v + '/' + id;
// The grid read with the page's crumb (util.js SCW.viewRecordsUrl): the site grid's records, the keeper
// carrying Make's progress. listFails = the list read errors and the window falls back to the one-record read.
let listFails = false;
window.SCW.viewRecordsUrl = (v) => 'list:' + v + '?format=both&build-sow_id=' + PID;
window.SCW.knackAjax = (o) => {
  ajaxCalls.push(o);
  if (/^list:/.test(o.url)) {
    if (listFails) { o.error({ status: 404 }); return; }
    o.success({ records: gridModels.map((g) => Object.assign({}, g.attributes,
      g.attributes.id === 'i1' ? { field_9999: keeperProgress } : {})) });
    return;
  }
  o.success({ record: { id: 'i1', field_1641: 'IDF', field_9999: keeperProgress } });
};
global.Knack = window.Knack; global.SCW = window.SCW;

function load(f) {
  new Function('window', 'document', '$', 'jQuery', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, f), 'utf8'))(
    window, document, jq, jq, window.Knack, window.SCW);
}
load('../../src/features/mdf-site-route.js');
load('../../src/features/mdf-site-tools.js');
const T = window.SCW.mdfSiteTools;
// The eased crawl between Make's readings runs on a real interval; off here so the widths the
// blocks below assert are Make's own. Its own block (near the end) turns it on with a captured timer.
const CREEP_MS = T.CONFIG.creepEveryMs;
T.CONFIG.creepEveryMs = 0;

let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const flush = () => new Promise((r) => nodeTimeout(r, 0));
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

(async () => {
  // ── gates ──
  ok(T.canAdd('view_4166') && T.canMerge('view_4166'), 'on the route + a site grid: add and merge are on');
  ok(T.addGridFor('view_3577') === 'view_4166' && !T.canMerge('view_3577'),
    'a project grid: add reads its site twin, merge never runs on it');
  ok(T.addGridFor('view_3822') === '', 'no add when the site twin is not on the page');
  userEmail = 'someone@getscw.com';
  ok(T.canAdd('view_4166') && T.addGridFor('view_3577') === 'view_4166' && !T.canMerge('view_4166'),
    'a login off the preview list: add is on (not gated since 2026-11-17), merge stays off');
  window.SCW.CONFIG.MAKE_MDF_IDF_WEBHOOK = 'PLACEHOLDER';
  ok(!T.canAdd('view_4166') && T.addGridFor('view_3577') === '', 'no hook: no add for anyone');
  window.SCW.CONFIG.MAKE_MDF_IDF_WEBHOOK = 'https://hook.us1.make.com/create';
  userEmail = 'micah.shearer@getscw.com';
  ok(T.projectId() === PID, 'the project comes from the record after the page slug');
  ok(T.nextFree(T.closets('view_4166')) === '4', 'next free IDF ## at the site skips the merged IDF 07 (max live = 03)');

  // ── + Add MDF/IDF ── (a login off the route: its worksheet reads the project grid view_3577)
  let pageFetches = 0;
  window.Knack.views.view_3577 = { model: { data: { models: [] }, fetch() { pageFetches++; return Promise.resolve(); } } };
  T.openAdd({ viewKey: 'view_3962', gridKey: 'view_4166', pageGridKey: 'view_3577' });
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
  ok(pageFetches >= 1, "the page's own closet grid is re-read too (the new closet shows without a reload)");
  delete window.Knack.views.view_3577;

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
  ok(m && m.keeperId === 'i1' && m.loserIds.join() === 'i3' && m.loserLabels[0] === 'IDF: 03: Office' && m.projectId === PID &&
     /^m[a-z0-9]+$/.test(m.runId), 'the merge payload: run id, keeper + loser ids + labels');

  // ── the progress window: stays open, blocks, reads the keeper's progress ──
  const RUN = m.runId;
  ok($('.scw-mst-overlay') && /Merging 1 into IDF: 01: Warehouse/.test($('.scw-mst-head').textContent),
    'the window stays open as a progress view');
  const closeBtn = () => $('[data-act="close"]');
  ok(closeBtn().disabled && /Working/.test(closeBtn().textContent), 'no way out while it runs');
  ok($('.scw-mst-bar').classList.contains('is-waiting') && /Waiting for it to start/.test($('.scw-mst-pstatus').textContent),
    'a moving "waiting for Make" bar until Make reports');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  ok($('.scw-mst-overlay'), 'Esc does not close it');

  const pollTimers = () => timers.filter((t) => t.ms === T.CONFIG.progressPollMs);
  function nextPoll() { const i = timers.findIndex((t) => t.ms === T.CONFIG.progressPollMs); return i < 0 ? null : timers.splice(i, 1)[0]; }
  ok(pollTimers().length === 1, 'a progress read is scheduled');

  keeperProgress = RUN + '|1|1|1|37|200|Moving SOW line items';
  nextPoll().fn(); await flush(); await flush(); await flush();
  ok(ajaxCalls[0] && ajaxCalls[0].url === 'list:view_4166?format=both&build-sow_id=' + PID + '&rows_per_page=1000&page=1' &&
     ajaxCalls[0].type === 'GET' && ajaxCalls[0].cache === false,
    "it reads the keeper off the site grid's list, with the page's crumb (a one-record read without it found nothing live)");
  ok(!$('.scw-mst-bar').classList.contains('is-waiting'), 'a readable progress turns the bar determinate');
  const w1 = parseFloat($('.scw-mst-bar__fill').style.width);
  ok(w1 > 0 && w1 < 10, 'step 1, 37 of 200 -> a few percent (' + w1 + '%)');
  ok(/Moving SOW line items · 37 of 200/.test($('.scw-mst-pstatus').textContent), 'the status names the step and the count');

  keeperProgress = 'someOtherRun|1|1|7|1|1|Marked X merged';
  nextPoll().fn(); await flush(); await flush(); await flush();
  ok(parseFloat($('.scw-mst-bar__fill').style.width) === w1 && $('.scw-mst-overlay'), "another run's progress is ignored");

  keeperProgress = RUN + '|1|1|5|1|1|Moving survey requests';
  nextPoll().fn(); await flush(); await flush(); await flush();
  const w2 = parseFloat($('.scw-mst-bar__fill').style.width);
  ok(w2 > 70 && w2 < 72, 'step 5 of 7 done -> 71% (' + w2 + '%)');

  keeperProgress = RUN + '|1|1|7|1|1|Marked IDF: 03: Office merged';
  refreshed.length = 0;
  nextPoll().fn(); await flush(); await flush(); await flush(); await flush();
  ok(/Merged 1 into IDF: 01: Warehouse/.test($('.scw-mst-pstatus').textContent) &&
     $('.scw-mst-bar').classList.contains('is-done') && $('.scw-mst-bar__fill').style.width === '100%',
    'the last step fills the bar and says Merged');
  ok(!closeBtn().disabled && closeBtn().textContent === 'Close', 'Close appears only when it is done');
  ok(refreshed.indexOf('view_3962') >= 0, 'the worksheet is refreshed');
  ok(pollTimers().length === 0, 'polling stops');
  closeBtn().click();
  ok(!$('.scw-mst-overlay'), 'Close closes it');

  // ── no progress field yet: the bar runs by losers merged on the grid ──
  timers.length = 0; ajaxCalls.length = 0; posts = [];
  gridModels[2].attributes.field_2845 = 'approved';
  keeperProgress = '';
  T.openMerge({ viewKey: 'view_3962', gridKey: 'view_4166', keeperId: 'i1', keeperLabel: 'IDF: 01: Warehouse' });
  let r0 = $$('.scw-mst-list .scw-mst-row')[0].querySelector('input');
  r0.checked = true; r0.dispatchEvent(new window.Event('change', { bubbles: true }));
  $('[data-act="merge"]').click(); $('[data-act="merge"]').click();
  await flush(); await flush();
  nextPoll().fn(); await flush(); await flush(); await flush();
  nextPoll().fn(); await flush(); await flush(); await flush();
  ok($('.scw-mst-bar').classList.contains('is-waiting'), 'no progress and nothing merged yet -> still waiting');
  gridModels[2].attributes.field_2845 = 'merged';
  nextPoll().fn(); await flush(); await flush(); await flush(); await flush();
  ok(/Merged 1 into/.test($('.scw-mst-pstatus').textContent), 'the loser reading merged on the grid completes it');
  closeBtn().click();

  // ── stall: no change for stallMs -> say so, allow Close, keep checking in the background ──
  timers.length = 0; posts = [];
  gridModels[2].attributes.field_2845 = 'approved';
  T.CONFIG.stallMs = -1;
  T.openMerge({ viewKey: 'view_3962', gridKey: 'view_4166', keeperId: 'i1', keeperLabel: 'IDF: 01: Warehouse' });
  r0 = $$('.scw-mst-list .scw-mst-row')[0].querySelector('input');
  r0.checked = true; r0.dispatchEvent(new window.Event('change', { bubbles: true }));
  $('[data-act="merge"]').click(); $('[data-act="merge"]').click();
  await flush(); await flush();
  nextPoll().fn(); await flush(); await flush(); await flush();
  ok(/^No progress from Make\. If 22\.03/.test($('.scw-mst-note').textContent) && !closeBtn().disabled,
    'a stall with no progress at all says so (the grid can still tell) and allows Close');
  ok(pollTimers().length === 1, 'and keeps polling while open');
  closeBtn().click();
  ok(!$('.scw-mst-overlay') && watchTimers().length >= 1, 'closing a stalled merge hands over to the background check');

  // ── 22.03 v2: Make answers once it holds the site ──
  const pick = () => {
    const b = $$('.scw-mst-list .scw-mst-row')[0].querySelector('input');
    b.checked = true; b.dispatchEvent(new window.Event('change', { bubbles: true }));
    $('[data-act="merge"]').click(); $('[data-act="merge"]').click();
  };
  T.CONFIG.stallMs = 90000;
  timers.length = 0; posts = []; ajaxCalls.length = 0;
  gridModels[2].attributes.field_2845 = 'approved';
  keeperProgress = '';
  reply = { status: 200, body: '{"ok": true, "started": true, "runId": "x", "losers": 1, "siteId": "s1"}' };
  T.openMerge({ viewKey: 'view_3962', gridKey: 'view_4166', keeperId: 'i1', keeperLabel: 'IDF: 01: Warehouse' });
  pick();
  await flush(); await flush();
  const RUN2 = posts[0].body.runId;
  ok(/Make has started/.test($('.scw-mst-pstatus').textContent) && !$('.scw-mst-bar').classList.contains('is-waiting'),
    'a "started" reply shows Make has started at once, with a determinate bar');
  ok($('.scw-mst-ptime') && $('.scw-mst-ptime').textContent === '0:00', 'an elapsed clock sits beside the status');
  const first = timers.findIndex((t) => t.ms === 800);
  ok(first >= 0, 'after a started reply the first progress read comes quickly (800 ms)');
  fetches = 0;
  keeperProgress = RUN2 + '|1|1|2|10|40|Moving survey line items';
  timers.splice(first, 1)[0].fn(); await flush(); await flush(); await flush();
  ok(/Moving survey line items · 10 of 40/.test($('.scw-mst-pstatus').textContent), 'progress reads as before');
  nextPoll().fn(); await flush(); await flush(); await flush();
  nextPoll().fn(); await flush(); await flush(); await flush();
  ok(fetches === 0, 'while progress is readable the site grid is not re-fetched');
  keeperProgress = RUN2 + '|1|1|8|1|1|Done';
  nextPoll().fn(); await flush(); await flush(); await flush(); await flush();
  ok(/Merged 1 into IDF: 01: Warehouse in \d+:\d\d/.test($('.scw-mst-pstatus').textContent) && $('.scw-mst-bar').classList.contains('is-done'),
    'the closing Done marker (step 8) finishes it and names the time taken');
  ok(fetches === 1, 'one grid re-read confirms the end');
  closeBtn().click();

  // busy: another merge holds this site -> nothing sent, the pick stays, the window says who / where / when
  timers.length = 0; posts = [];
  reply = { status: 409, body: JSON.stringify({ ok: false, error: 'busy', runId: 'mzz', keeperId: 'i3', by: 'jon.carter@getscw.com',
    since: String(Math.floor(Date.now() / 1000) - 180), message: 'Another MDF/IDF merge is running at this site.' }) };
  T.openMerge({ viewKey: 'view_3962', gridKey: 'view_4166', keeperId: 'i1', keeperLabel: 'IDF: 01: Warehouse' });
  pick();
  await flush(); await flush();
  ok($('.scw-mst-list') && !$('.scw-mst-bar'), 'a busy refusal keeps the merge list (no progress window)');
  ok(/Another merge is running at this site into IDF: 03: Office \(started by jon\.carter@getscw\.com 3 minutes ago\)\. Nothing was sent/
    .test($('.scw-mst-note').textContent), 'the refusal names the other merge: its keeper, who, how long ago');
  ok(!$('.scw-mst-note').classList.contains('scw-mst-err'), 'busy is a notice, not an error');
  ok(/Merge 1 into/.test($('[data-act="merge"]').textContent) && !$('[data-act="merge"]').disabled, 'the Merge button is ready to try again');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  ok(!$('.scw-mst-overlay'), 'and the window can be closed');

  reply = { status: 409, body: '{"ok": false, "error": "keeper-merged", "message": "This MDF/IDF was itself merged into another one. Reload the page."}' };
  T.openMerge({ viewKey: 'view_3962', gridKey: 'view_4166', keeperId: 'i1', keeperLabel: 'IDF: 01: Warehouse' });
  pick();
  await flush(); await flush();
  ok(/itself merged/.test($('.scw-mst-note').textContent) && $('.scw-mst-note').classList.contains('scw-mst-err'),
    'a keeper that was merged meanwhile is refused as an error');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

  // an older 22.03 ("Accepted"), no progress, a grid without FLAG_lifecycle: the stall says the page cannot tell
  timers.length = 0; posts = [];
  reply = { status: 200, body: 'Accepted' };
  const saved = gridModels.map((g) => g.attributes.field_2845);
  gridModels.forEach((g) => { delete g.attributes.field_2845; });
  T.CONFIG.stallMs = -1;
  T.openMerge({ viewKey: 'view_3962', gridKey: 'view_4166', keeperId: 'i1', keeperLabel: 'IDF: 01: Warehouse' });
  pick();
  await flush(); await flush();
  nextPoll().fn(); await flush(); await flush(); await flush();
  ok(/No progress from Make, and this page cannot see merged MDF\/IDFs either/.test($('.scw-mst-note').textContent),
    'with no progress and no lifecycle column the stall says the page cannot tell, instead of spinning');
  closeBtn().click();
  gridModels.forEach((g, i) => { g.attributes.field_2845 = saved[i]; });
  T.CONFIG.stallMs = 90000;
  timers.length = 0;

  // ── the list read fails: the one-record read still drives the bar ──
  timers.length = 0; posts = []; ajaxCalls.length = 0;
  reply = { status: 200, body: '{"ok": true, "started": true}' };
  gridModels[2].attributes.field_2845 = 'approved';
  listFails = true;
  const infos = []; const realInfo = console.info; console.info = (m) => infos.push(String(m));
  T.openMerge({ viewKey: 'view_3962', gridKey: 'view_4166', keeperId: 'i1', keeperLabel: 'IDF: 01: Warehouse' });
  pick();
  await flush(); await flush();
  const RUN3 = posts[0].body.runId;
  keeperProgress = RUN3 + '|1|1|3|2|4|Moving install line items';
  const f3 = timers.findIndex((t) => t.ms === 800);
  timers.splice(f3, 1)[0].fn(); await flush(); await flush(); await flush(); await flush();
  ok(ajaxCalls.some((c) => c.url === 'url:view_4166/i1'), 'a failed list read falls back to the one-record read');
  ok(/Moving install line items · 2 of 4/.test($('.scw-mst-pstatus').textContent), '… which still drives the bar');
  ok(infos.some((l) => /the list read failed \(HTTP 404/.test(l) && /progress step 3/.test(l)),
    'one console line says which read worked and what it found');
  console.info = realInfo;
  keeperProgress = RUN3 + '|1|1|8|1|1|Done';
  nextPoll().fn(); await flush(); await flush(); await flush(); await flush();
  closeBtn().click();
  listFails = false;
  timers.length = 0;

  // ── the bar eases forward between Make's real readings (2026-11-17) ──
  ok(CREEP_MS > 0, 'the crawl is on by default');
  T.CONFIG.creepEveryMs = CREEP_MS;
  const c1 = T._creepNext(0.02, T.CONFIG.creepTauMs, 1);
  ok(c1 > 0.55 && c1 < 0.62, 'one tau closes ~63% of the gap to the cap (2% -> ' + Math.round(c1 * 100) + '%)');
  ok(T._creepNext(0.02, T.CONFIG.creepTauMs, 3) < c1, 'more MDF/IDFs to merge = a slower crawl');
  ok(T._creepNext(0.5, 10 * 60 * 1000, 1) <= T.CONFIG.creepCap + 1e-9, 'it never passes the cap, however long Make takes');
  ok(T._creepNext(0.97, 5000, 1) === 0.97, 'a real reading past the cap is left alone');
  const intervals = []; const realSetInterval = global.setInterval; const realClearInterval = global.clearInterval;
  const cleared = [];
  global.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return { fake: intervals.length }; };
  global.clearInterval = (h) => { cleared.push(h); if (!(h && h.fake)) realClearInterval(h); };
  const realNow = Date.now; let clockNow = realNow();
  Date.now = () => clockNow;
  timers.length = 0; posts = []; ajaxCalls.length = 0; keeperProgress = '';
  gridModels[2].attributes.field_2845 = 'approved';
  reply = { status: 200, body: '{"ok": true, "started": true}' };
  T.openMerge({ viewKey: 'view_3962', gridKey: 'view_4166', keeperId: 'i1', keeperLabel: 'IDF: 01: Warehouse' });
  pick();
  await flush(); await flush();
  const creep = intervals.find((t) => t.ms === CREEP_MS);
  ok(!!creep, 'a started merge starts the crawl');
  const width = () => parseFloat($('.scw-mst-bar__fill').style.width);
  const wA = width();
  clockNow += 5000; creep.fn();
  const wB = width();
  ok(wB > wA && wB < 30, 'with nothing new from Make the bar still moves (' + wA + '% -> ' + wB + '% after 5 s)');
  ok(/Make has started/.test($('.scw-mst-pstatus').textContent), '… while the status line stays what Make last said');
  clockNow += 10 * 60 * 1000; creep.fn();
  ok(width() === wB, 'Make silent past the stall time: the bar stops moving');
  const RUN4 = posts[0].body.runId;
  keeperProgress = RUN4 + '|1|1|5|1|1|Moving survey requests';
  const f4 = timers.findIndex((t) => t.ms === 800);
  timers.splice(f4, 1)[0].fn(); await flush(); await flush(); await flush();
  ok(width() > 70 && width() < 72, 'a real reading ahead of the crawl moves the bar to it (' + width() + '%)');
  clockNow += 3000; creep.fn();
  ok(width() > 71.4 && width() < T.CONFIG.creepCap * 100, '… and the crawl carries on from there');
  keeperProgress = RUN4 + '|1|1|8|1|1|Done';
  nextPoll().fn(); await flush(); await flush(); await flush(); await flush();
  ok($('.scw-mst-bar__fill').style.width === '100%' && cleared.some((h) => h && h.fake), 'done fills the bar and stops the crawl');
  closeBtn().click();
  Date.now = realNow; global.setInterval = realSetInterval; global.clearInterval = realClearInterval;
  T.CONFIG.creepEveryMs = 0;
  timers.length = 0;

  // parse + share helpers
  ok(T._parseProgress('<span>r1|2|3|4|5|10|Moving a|b</span>', 'r1').text === 'Moving a|b', 'progress parse keeps pipes in the text');
  ok(T._parseProgress('r2|1|1|1|1|1|x', 'r1') === null, 'progress of another run is null');
  ok(Math.abs(T._progressShare({ loser: 2, losers: 2, step: 1, i: 0, of: 0 }, 7) - 8 / 14) < 1e-9, 'share: closet 2 of 2, step 1 with nothing found');

  // a loser that drops out of the grid (the "not merged" filter) also counts as done
  timers.length = 0;
  window.SCW.mdfSiteTools._watchMerge('view_4166', 'view_3962', ['gone'], 'X');
  nextWatch().fn(); await flush(); await flush();
  ok(/Merged 1 into X/.test($('.scw-mst-toast').textContent), 'background check: a loser gone from the site grid counts as merged');

  console.log('RESULT ' + (fails ? 'FAIL' : 'PASS') + ' ' + (n - fails) + '/' + n);
  process.exit(fails ? 1 : 0);
})();
