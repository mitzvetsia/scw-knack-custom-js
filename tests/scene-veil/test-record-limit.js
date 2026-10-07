// jsdom smoke test: change-record-limit.js forces listed grids to the full record set. With a
// per-page dropdown: set it to 1000. Without one (the customer questionnaire grid view_4031,
// 100 of 142) Knack ignores every bigger-page request, so the module pages through 2..N at
// Knack's own page size on the grid's own request address, adds the records to the model and
// re-fires the grid's render. Once per view instance; nothing new → one warning.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const BASE = 'https://scwinstallation.knack.com/installationservices';
const START = '#team-calendar/project-dashboard/P1/deploy/P1/install-system-setup-questionnairre-details/Q1';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: BASE + START });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;

const handlers = {}; const data = new WeakMap(); const fired = [];
function key(ev) { return ev.split('.').slice(0, 2).join('.'); }
function wrap(els) {
  const o = {
    length: els.length,
    on(ev, fn) { ev.split(/\s+/).forEach(e => { (handlers[key(e)] = handlers[key(e)] || []).push(fn); }); return o; },
    off() { return o; },
    trigger(ev, args) { fired.push(key(ev)); (handlers[key(ev)] || []).forEach(fn => fn({ type: ev }, ...(args || []))); return o; },
    data(k, v) { const el = els[0]; if (!el) return undefined; const m = data.get(el) || {}; if (v === undefined) return m[k]; m[k] = v; data.set(el, m); return o; },
    find(sel) { return wrap(els[0] ? [...els[0].querySelectorAll(sel)] : []); },
    val(v) { if (v === undefined) return els[0] && els[0].value; els.forEach(e => { e.value = v; }); return o; }
  };
  return o;
}
function jq(sel) { if (sel === document || !sel) return wrap([document]); return wrap([...document.querySelectorAll(sel)]); }
window.$ = jq; global.$ = jq;
window.Knack = { views: {}, api_url: 'https://api.knack.com', router: { current_scene_key: 'scene_1347' } }; global.Knack = window.Knack;
const requests = [];
const pages = {};   // page number → records the fake server returns
window.SCW = { knackAjax(o) { requests.push(o.url); const m = /[?&]page=(\d+)/.exec(o.url); const recs = pages[m && m[1]] || []; o.success({ records: recs, total_pages: 2, total_records: 142 }); } };
global.SCW = window.SCW;
const warns = [];
console.warn = (...a) => { warns.push(a.join(' ')); };
console.info = () => {};

new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/change-record-limit.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
function rec(i) { return { id: 'r' + String(i).padStart(3, '0') }; }
function collection(n, total) {
  const c = { models: [], total_records: total };
  for (let i = 0; i < n; i++) c.models.push({ id: 'r' + String(i).padStart(3, '0'), attributes: rec(i) });
  c.add = (recs) => { recs.forEach(r => c.models.push({ id: r.id, attributes: r })); };
  return c;
}
const render = v => wrap([document]).trigger('knack-view-render.' + v);

// ── With a per-page dropdown: complete grid → dropdown set to 1000, nothing fetched.
document.body.innerHTML = '<div id="view_3921"><select name="limit"><option>25</option><option>1000</option></select></div>';
Knack.views.view_3921 = { model: { view: { rows_per_page: 25 }, data: collection(169, 169) } };
document.querySelector('#view_3921 select').value = '25';
render('view_3921');
check('complete grid with a dropdown → dropdown set to 1000, no requests', [document.querySelector('#view_3921 select').value, requests.length], ['1000', 0]);

// ── No dropdown, 100 of 142 (the questionnaire): pages 2..N are fetched on the grid's own address.
document.body.innerHTML = '<div id="kn-scene_1347">' +
  '<div id="view_4025"><form><input class="crumb" type="hidden" name="install-system-setup-questionnairre-details_id" value="6ac660637ca88d28d9113e82"></form></div>' +
  '<div id="view_4031"><div class="kn-entries-summary">Showing 1-100 of 142</div>' +
  '<select name="page_select" class="kn-page-select"><option>Page 1</option><option>Page 2</option></select></div></div>';
for (let i = 100; i < 142; i++) (pages[2] = pages[2] || []).push(rec(i));
// Knack's model URL is bare — the parent crumb is added as request data at send time (seen live).
const MODEL_URL = 'https://api.knack.com/v1/scenes/scene_1347/views/view_4031/records?format=both';
Knack.views.view_4031 = { model: { view: { rows_per_page: 100 }, url() { return MODEL_URL; }, data: collection(100, 142) } };
fired.length = 0;
render('view_4031');
check('100 of 142, no dropdown → page 2 requested at Knack\'s page size on the model\'s own address + the scene\'s parent crumb',
  requests, ['https://api.knack.com/v1/scenes/scene_1347/views/view_4031/records?format=both&install-system-setup-questionnairre-details_id=6ac660637ca88d28d9113e82&rows_per_page=100&page=2']);
check('the 42 page-2 records join the model and the grid\'s render is re-fired for the consumers',
  [Knack.views.view_4031.model.data.models.length, fired.filter(f => f === 'knack-view-render.view_4031').length], [142, 2]);
check('the address is never touched', window.location.hash, START);

// A later render of the now-complete grid fetches nothing more.
render('view_4031');
check('complete after paging → no further requests', requests.length, 1);

// ── No form on the scene → the crumb is read from the address (slug / 24-hex id pairs).
window.location.hash = '#project-questionnaire/install-system-setup-questionnairre-details/6ac660637ca88d28d9113e82/';
document.body.innerHTML = '<div id="kn-scene_1347"><div id="view_4031"><div class="kn-entries-summary">Showing 1-100 of 142</div></div></div>';
Knack.views.view_4031 = { model: { view: { rows_per_page: 100 }, url() { return MODEL_URL; }, data: collection(100, 142) } };
render('view_4031');
check('no form on the scene → crumb parsed from the address',
  requests[requests.length - 1], 'https://api.knack.com/v1/scenes/scene_1347/views/view_4031/records?format=both&install-system-setup-questionnairre-details_id=6ac660637ca88d28d9113e82&rows_per_page=100&page=2');
window.location.hash = START;

// ── A grid whose extra pages come back empty: one warning, one attempt per view instance.
delete pages[2];
document.body.innerHTML = '<div id="view_4075"><div class="kn-entries-summary">Showing 1-25 of 60</div></div>';
Knack.views.view_4075 = { model: { view: { rows_per_page: 25 }, url() { return 'https://api.knack.com/v1/scenes/scene_1347/views/view_4075/records?format=both'; }, data: Object.assign(collection(25, undefined), { total_records: undefined }) } };
render('view_4075'); render('view_4075');
check('total read from "Showing … of N"; nothing new → one warning, one attempt',
  [requests.length, warns.filter(w => /view_4075: paging returned nothing new/.test(w)).length], [3, 1]);

// ── Complete grid with no dropdown → untouched.
document.body.innerHTML = '<div id="view_3573"></div>';
Knack.views.view_3573 = { model: { view: { rows_per_page: 25 }, data: collection(60, 60) } };
render('view_3573');
check('complete grid → no requests', requests.length, 3);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
