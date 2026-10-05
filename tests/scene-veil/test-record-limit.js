// jsdom smoke test: change-record-limit.js rewrites the page size ON THE WIRE for listed
// views (so the very first fetch is a full page), leaves other views and record PUTs alone,
// and skips the second fetch when the model already holds every record.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom; const { document } = window;
global.window = window; global.document = document;

const handlers = {}; let prefilter = null; const data = new WeakMap();
function key(ev) { return ev.split('.').slice(0, 2).join('.'); }
function wrap(els) {
  const o = {
    length: els.length,
    on(ev, fn) { ev.split(/\s+/).forEach(e => { (handlers[key(e)] = handlers[key(e)] || []).push(fn); }); return o; },
    off() { return o; },
    trigger(ev) { (handlers[key(ev)] || []).forEach(fn => fn({ type: ev })); return o; },
    data(k, v) { const el = els[0]; if (!el) return undefined; const m = data.get(el) || {}; if (v === undefined) return m[k]; m[k] = v; data.set(el, m); return o; },
    find(sel) { return wrap(els[0] ? [...els[0].querySelectorAll(sel)] : []); },
    val(v) { if (v === undefined) return els[0] && els[0].value; els.forEach(e => { e.value = v; }); return o; }
  };
  return o;
}
function jq(sel) { if (sel === document || !sel) return wrap([document]); return wrap([...document.querySelectorAll(sel)]); }
jq.ajaxPrefilter = fn => { prefilter = fn; };
window.$ = jq; global.$ = jq;
window.Knack = { views: {} }; global.Knack = window.Knack;

new Function('window', 'document', '$', 'Knack',
  fs.readFileSync(path.join(__dirname, '../../src/features/change-record-limit.js'), 'utf8'))(window, document, jq, window.Knack);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const API = 'https://api.knack.com/v1/scenes/scene_1085/views/';
function run(url, type) { const o = { url, type: type || 'GET' }; prefilter(o); return o.url; }

check('prefilter installed', typeof prefilter, 'function');
check('listed view: Builder page size rewritten to 1000',
  run(API + 'view_3962/records?format=both&page=1&rows_per_page=25&sort_field=field_1'),
  API + 'view_3962/records?format=both&page=1&rows_per_page=1000&sort_field=field_1');
check('listed view without rows_per_page gets one appended',
  run(API + 'view_3921/records?format=both'), API + 'view_3921/records?format=both&rows_per_page=1000');
check('unlisted view untouched',
  run(API + 'view_44/records?rows_per_page=25'), API + 'view_44/records?rows_per_page=25');
check('record PUT untouched (URL has /records/<id>)',
  run(API + 'view_3962/records/64a1b2c3d4e5f6a7b8c9d0e1?rows_per_page=25', 'PUT'),
  API + 'view_3962/records/64a1b2c3d4e5f6a7b8c9d0e1?rows_per_page=25');
check('already 1000 left as is', run(API + 'view_3962/records?rows_per_page=1000&page=1'), API + 'view_3962/records?rows_per_page=1000&page=1');

// Model stamped when the prefilter sees its fetch.
Knack.views.view_3962 = { model: { view: { rows_per_page: 25, source: { limit: 25 } }, data: { models: [] } } };
run(API + 'view_3962/records?rows_per_page=25');
check('model rows_per_page + source.limit stamped from the prefilter',
  [Knack.views.view_3962.model.view.rows_per_page, Knack.views.view_3962.model.view.source.limit], [1000, 1000]);

// Completeness: loaded >= total → no refetch, dropdown set silently.
document.body.innerHTML = '<div id="view_3921"><select name="limit"><option>25</option><option>1000</option></select></div>';
let fetched = 0, changed = 0;
const sel = document.querySelector('#view_3921 select');
const origTrigger = wrap([sel]).trigger;
Knack.views.view_3921 = { model: {
  view: { rows_per_page: 25, source: { limit: 25 } },
  data: { models: new Array(169), total_records: 169 },
  fetch() { fetched++; }, url() { return API + 'view_3921/records'; }
} };
// Count change triggers routed through $(select).trigger — our wrap() routes trigger to the
// handler bus, so detect a change by whether the module called val('1000') AND trigger.
jq('#view_3921 select').val('25');
wrap([document]).trigger('knack-view-render.view_3921');
check('complete first page → no refetch, dropdown value set to 1000',
  [fetched, sel.value, Knack.views.view_3921.model.view.rows_per_page], [0, '1000', 1000]);

// Incomplete (total > loaded, no dropdown) → refetch path still runs.
document.body.innerHTML = '<div id="view_3573"></div>';
Knack.views.view_3573 = { model: {
  view: { rows_per_page: 25, source: { limit: 25 } },
  data: { models: new Array(25), total_records: 60 },
  fetch() { fetched++; }, url() { return API + 'view_3573/records'; }
} };
wrap([document]).trigger('knack-view-render.view_3573');
check('truncated first page (no dropdown) → model stamped and refetched once', [fetched, Knack.views.view_3573.model.view.rows_per_page], [1, 1000]);
wrap([document]).trigger('knack-view-render.view_3573');
check('run-once guard: a second render of the same view instance does not refetch again', fetched, 1);

// The bug behind "27 of 50 cameras": the model already SAYS 1000 (stamped before the first
// request left at the Builder page size) but holds 100 of 139 — it must still refetch.
document.body.innerHTML = '<div id="view_4031"></div>';
Knack.views.view_4031 = { model: {
  view: { rows_per_page: 1000, source: { limit: 1000 } },
  data: { models: new Array(100), total_records: 139 },
  fetch() { fetched++; }, url() { return API + 'view_4031/records'; }
} };
const before4031 = fetched;
wrap([document]).trigger('knack-view-render.view_4031');
check('model stamped 1000 but only 100 of 139 loaded → refetch anyway', fetched - before4031, 1);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
