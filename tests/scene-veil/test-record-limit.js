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

// ── Force-load: a grid short of its total is loaded straight from the view endpoint at
// 1000/page (all pages), the records go into the model, and the grid's render fires again.
const gets = []; let renders = 0;
window.SCW = global.SCW = { knackAjax(o) {
  gets.push(o.url);
  const page = +(o.url.match(/[?&]page=(\d+)/) || [])[1];
  // 1200 records over two pages of 1000.
  const n = page === 1 ? 1000 : 200;
  o.success({ records: Array.from({ length: n }, (_, i) => ({ id: 'r' + page + '_' + i })), total_pages: 2, total_records: 1200 });
} };
Knack.api_url = 'https://api.knack.com'; Knack.router = { current_scene_key: 'scene_1347' };
function collection(n, total) {
  return { models: new Array(n).fill(0).map((_, i) => ({ id: 'm' + i })), total_records: total,
    reset(recs) { this.models = recs.map(r => ({ id: r.id, attributes: r })); } };
}
handlers['knack-view-render.view_4031'] = handlers['knack-view-render.view_4031'] || [];
handlers['knack-view-render.view_4031'].push(() => { renders++; });

// The bug behind "27 of 50 cameras": the model already SAYS 1000 but holds 100 of 139.
document.body.innerHTML = '<div id="view_4031"><div class="kn-entries-summary">Showing 1-100 of 139</div></div>';
Knack.views.view_4031 = { model: { view: { rows_per_page: 1000, source: { limit: 1000 } }, data: collection(100, 139), fetch() { fetched++; } } };
const before = fetched;
wrap([document]).trigger('knack-view-render.view_4031');
check('100 of 139 loaded (model already claims 1000) → direct GET of every page at 1000, no Knack refetch',
  [gets.length, gets[0], /page=2/.test(gets[1]), fetched - before],
  [2, 'https://api.knack.com/v1/pages/scene_1347/views/view_4031/records?format=both&rows_per_page=1000&page=1', true, 0]);
check('the full set lands in the model and the grid\'s render fires again for the consumers',
  [Knack.views.view_4031.model.data.models.length, Knack.views.view_4031.model.data.total_records, renders], [1200, 1200, 2]);
check('the re-fired render does not loop (run-once guard)', gets.length, 2);

// Total unknown on the collection → read from Knack's "Showing … of N" line.
gets.length = 0;
document.body.innerHTML = '<div id="view_4075"><div class="kn-entries-summary">Showing 1-25 of 60</div></div>';
Knack.views.view_4075 = { model: { view: { rows_per_page: 25 }, data: Object.assign(collection(25, undefined), { total_records: undefined }) } };
wrap([document]).trigger('knack-view-render.view_4075');
check('total read from the entries summary when the collection has none → force-load runs', gets.length > 0, true);

// Complete grid with no dropdown → nothing fetched.
gets.length = 0;
document.body.innerHTML = '<div id="view_3573"></div>';
Knack.views.view_3573 = { model: { view: { rows_per_page: 25 }, data: collection(60, 60) } };
wrap([document]).trigger('knack-view-render.view_3573');
check('complete grid → no request', gets.length, 0);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
