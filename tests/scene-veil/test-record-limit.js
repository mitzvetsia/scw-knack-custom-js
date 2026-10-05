// jsdom smoke test: change-record-limit.js forces listed grids to a full 1000-row page the
// way Knack's own per-page dropdown does. With a dropdown: set it to 1000. Without one (the
// customer questionnaire grid view_4031, 100 of 139): put view_XXXX_per_page=1000 in the page
// address — Knack keeps paging state there — once, and say so if Knack still comes back short.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const BASE = 'https://scwinstallation.knack.com/installationservices';
const START = '#team-calendar/project-dashboard/P1/deploy/P1/install-system-setup-questionnairre-details/Q1';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: BASE + START });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;

const handlers = {}; const data = new WeakMap();
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
window.$ = jq; global.$ = jq;
window.Knack = { views: {} }; global.Knack = window.Knack;
const warns = [];
console.warn = (...a) => { warns.push(a.join(' ')); };
console.info = () => {};

new Function('window', 'document', '$', 'Knack',
  fs.readFileSync(path.join(__dirname, '../../src/features/change-record-limit.js'), 'utf8'))(window, document, jq, window.Knack);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
function collection(n, total) { return { models: new Array(n).fill(0).map((_, i) => ({ id: 'm' + i })), total_records: total }; }
const render = v => wrap([document]).trigger('knack-view-render.' + v);

// ── With a per-page dropdown: complete grid → dropdown set to 1000, address untouched.
document.body.innerHTML = '<div id="view_3921"><select name="limit"><option>25</option><option>1000</option></select></div>';
Knack.views.view_3921 = { model: { view: { rows_per_page: 25 }, data: collection(169, 169) } };
document.querySelector('#view_3921 select').value = '25';
render('view_3921');
check('complete grid with a dropdown → dropdown set to 1000, address untouched',
  [document.querySelector('#view_3921 select').value, window.location.hash], ['1000', START]);

// ── No dropdown, 100 of 139 (the questionnaire): the address gets view_4031_per_page=1000 + page 1.
document.body.innerHTML = '<div id="view_4031"><div class="kn-entries-summary">Showing 1-100 of 139</div>' +
  '<select name="page_select" class="kn-page-select"><option>Page 1</option></select></div>';
Knack.views.view_4031 = { model: { view: { rows_per_page: 100 }, data: collection(100, 139) } };
render('view_4031');
check('100 of 139, no dropdown → address carries view_4031_per_page=1000&view_4031_page=1 (what the dropdown does)',
  window.location.hash, START + '?view_4031_per_page=1000&view_4031_page=1');

// Knack re-routes and re-renders the grid: still short with the parameter in place → one warning, no loop.
const hashBefore = window.location.hash;
render('view_4031');
check('still short with the parameter already in the address → warns, does not touch the address again',
  [window.location.hash === hashBefore, warns.some(w => /already in the address/.test(w))], [true, true]);

// An existing page param for the view is replaced, other views' params are kept.
document.body.innerHTML = '<div id="view_4075"><div class="kn-entries-summary">Showing 1-25 of 60</div></div>';
window.location.hash = START + '?view_4056_per_page=1000&view_4075_page=2';
Knack.views.view_4075 = { model: { view: { rows_per_page: 25 }, data: Object.assign(collection(25, undefined), { total_records: undefined }) } };
render('view_4075');
check('total read from "Showing … of N"; the view\'s own page param is replaced, other views\' params kept',
  window.location.hash, START + '?view_4056_per_page=1000&view_4075_per_page=1000&view_4075_page=1');

// ── Complete grid with no dropdown → address untouched.
const h2 = window.location.hash;
document.body.innerHTML = '<div id="view_3573"></div>';
Knack.views.view_3573 = { model: { view: { rows_per_page: 25 }, data: collection(60, 60) } };
render('view_3573');
check('complete grid → address untouched', window.location.hash, h2);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
