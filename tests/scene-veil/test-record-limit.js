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

// THE BUG behind "27 of 50 cameras": Knack sends the page size as request DATA. jQuery serializes
// data before prefilters and appends it to a GET's URL after them — so the final request must
// carry 1000 once, not "?rows_per_page=1000&…&rows_per_page=100" (the server read the last one).
function jqFinal(url, data) {
  const o = { url, type: 'GET', data };
  prefilter(o);
  return o.data ? o.url + (o.url.indexOf('?') === -1 ? '?' : '&') + o.data : o.url;
}
const finalUrl = jqFinal(API + 'view_4031/records', 'format=both&page=1&rows_per_page=100&sort_field=field_2801&sort_order=asc');
check('Knack\'s page size in request data is rewritten to 1000 (one rows_per_page in the final URL)',
  [finalUrl.match(/rows_per_page=\d+/g), /page=1(&|$)/.test(finalUrl)], [['rows_per_page=1000'], true]);
check('a page-2 pagination request on a forced grid asks for page 1 (the full set lives there)',
  jqFinal(API + 'view_4031/records', 'format=both&page=2&rows_per_page=100').match(/(^|[?&])page=\d+/g), ['&page=1']);
check('data without rows_per_page gets one added to the data, not the URL',
  jqFinal(API + 'view_4031/records', 'format=both&page=1'), API + 'view_4031/records?format=both&page=1&rows_per_page=1000');

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

// ── Short grid → the bid-review-v2 / proposal-grid-v2 pattern: stamp 1000, Knack refetches.
function collection(n, total) { return { models: new Array(n).fill(0).map((_, i) => ({ id: 'm' + i })), total_records: total }; }

// The bug behind "27 of 50 cameras": the model already SAYS 1000 but holds 100 of 139.
document.body.innerHTML = '<div id="view_4031"><div class="kn-entries-summary">Showing 1-100 of 139</div></div>';
let f4031 = 0;
Knack.views.view_4031 = { model: { view: { rows_per_page: 100, source: { limit: 100 } }, data: collection(100, 139), fetch() { f4031++; } } };
wrap([document]).trigger('knack-view-render.view_4031');
check('100 of 139 loaded → page size stamped 1000 and Knack\'s own refetch called once',
  [f4031, Knack.views.view_4031.model.view.rows_per_page, Knack.views.view_4031.model.view.source.limit], [1, 1000, 1000]);
// Knack re-renders the same element; still short → one more try, then it gives up.
wrap([document]).trigger('knack-view-render.view_4031');
wrap([document]).trigger('knack-view-render.view_4031');
check('still short after re-render → retried, bounded at 2 refetches', f4031, 2);
// Knack re-renders with the full set → nothing more.
Knack.views.view_4031.model.data = collection(139, 139);
wrap([document]).trigger('knack-view-render.view_4031');
check('full set loaded → no further refetch', f4031, 2);

// Total unknown on the collection → read from Knack's "Showing … of N" line.
document.body.innerHTML = '<div id="view_4075"><div class="kn-entries-summary">Showing 1-25 of 60</div></div>';
let f4075 = 0;
Knack.views.view_4075 = { model: { view: { rows_per_page: 25 }, data: Object.assign(collection(25, undefined), { total_records: undefined }), fetch() { f4075++; } } };
wrap([document]).trigger('knack-view-render.view_4075');
check('total read from the entries summary when the collection has none → refetch runs', f4075, 1);

// Complete grid with no dropdown → nothing fetched.
document.body.innerHTML = '<div id="view_3573"></div>';
let f3573 = 0;
Knack.views.view_3573 = { model: { view: { rows_per_page: 25 }, data: collection(60, 60), fetch() { f3573++; } } };
wrap([document]).trigger('knack-view-render.view_3573');
check('complete grid → no refetch', f3573, 0);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
