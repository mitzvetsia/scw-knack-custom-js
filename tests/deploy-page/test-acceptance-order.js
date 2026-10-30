// jsdom smoke test: acceptance-card.js row order (2026-10-30). "For the Agreements & Invoices
// panel we need to always show the non-CO acceptances FIRST, followed by the COs in chronological
// oldest to newest order." The ops card used to float every row that still waited (unsigned, or a
// base acceptance with neither payment nor terms) to the top, in grid order within each tier; the sub
// card rendered the grid's order. Both now render the base-scope acceptances first, then the change
// orders, each group oldest → newest by the proposal's quote number ("20261007-11977" = publish date
// + running sequence), by the SOW number when a row carries no quote, then by grid order.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/59277492086' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
const renders = {};
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.setTimeout = function (fn) { fn(); return 0; }; global.setTimeout = window.setTimeout;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender(v, fn) { renders[v] = fn; } }; global.SCW = window.SCW;
console.warn = () => {};
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/acceptance-card.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

const COLS = [['field_2755', 'Proposal'], ['field_2766', 'Signed'], ['field_2765', 'Paid'], ['field_2940', 'Terms'],
              ['field_3309', 'No sig'], ['field_3310', 'Not billable'], ['field_3311', 'Reason']];
function row(id, proposal, f, thin) {
  f = f || {};
  const cells = [['field_2755', proposal], ['field_2766', f.signed || 'No'], ['field_2765', f.paid || 'No'], ['field_2940', f.terms || 'No']]
    .concat(thin ? [] : [['field_3309', f.noSig || 'No'], ['field_3310', f.notBill || 'No'], ['field_3311', '']]);
  return '<tr id="' + id + '">' + cells.map(c => '<td class="' + c[0] + '">' + c[1] + '</td>').join('') + '</tr>';
}
function grid(viewId, rows, thin) {
  const cols = thin ? COLS.slice(0, 4) : COLS;
  return '<div class="scw-ktl-accordion"><div class="scw-ktl-accordion__header"><span class="scw-acc-title">ACCEPTANCE</span>' +
    '<span class="scw-acc-count">' + rows.length + '</span></div><div class="scw-ktl-accordion__body">' +
    '<div class="kn-table kn-view" id="' + viewId + '"><div class="kn-table-wrapper"><table>' +
    '<thead><tr>' + cols.map(c => '<th class="' + c[0] + '">' + c[1] + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + rows.join('') + '</tbody></table></div></div></div></div>';
}
// The rendered order, as the SOW token of each row (both variants render one .scw-acpt-row per record).
function order(viewId, rows, thin) {
  document.body.innerHTML = '<div id="kn-scene_1311">' + grid(viewId, rows, thin) + '</div>';
  renders[viewId]();
  return [...document.querySelectorAll('.scw-acpt-row')].map(el => (el.textContent.match(/SW\d+(?:CO)?/) || ['?'])[0]);
}
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

// 1. The live page (Etude Capital) with its grid scrambled: the base agreement leads, then the COs by issue date.
const P = '59277492086-';
const live = [
  row('a6', P + 'SW1955CO | 20261014-12084', { signed: 'Yes' }),
  row('a2', P + 'SW1837CO | 20261007-11979', { noSig: 'Yes', notBill: 'Yes' }),
  row('a4', P + 'SW1779CO | 20260915-11608', { signed: 'Yes' }),
  row('a3', P + 'SW1210 | 20260624-10393', { signed: 'Yes', terms: 'Yes' }),
  row('a1', P + 'SW1838CO | 20261007-11977', { noSig: 'Yes', notBill: 'Yes' }),
  row('a5', P + 'SW1823CO | 20260921-11701', { signed: 'Yes' })
];
check('ops: base first, then COs oldest → newest by quote number',
  order('view_3914', live), ['SW1210', 'SW1779CO', 'SW1823CO', 'SW1838CO', 'SW1837CO', 'SW1955CO']);
check('same day, same date prefix: the running sequence orders them (11977 before 11979)',
  order('view_3914', [row('a2', P + 'SW1837CO | 20261007-11979', {}), row('a1', P + 'SW1838CO | 20261007-11977', {})]), ['SW1838CO', 'SW1837CO']);

// 2. Waiting never reorders: an unsigned base agreement and an unsigned CO sit where the rule puts them.
check('an unsigned CO stays below the signed base agreement and behind the older COs',
  order('view_3914', [row('a7', P + 'SW1964CO | 20261020-12190', {}), row('a3', P + 'SW1210 | 20260624-10393', { signed: 'Yes', terms: 'Yes' }),
                      row('a4', P + 'SW1779CO | 20260915-11608', { signed: 'Yes' })]),
  ['SW1210', 'SW1779CO', 'SW1964CO']);
check('an unsigned, unpaid base agreement still leads the list',
  order('view_3914', [row('a4', P + 'SW1779CO | 20260915-11608', { signed: 'Yes' }), row('a3', P + 'SW1210 | 20260624-10393', {})]),
  ['SW1210', 'SW1779CO']);

// 3. Two base acceptances (the duplicate case) are both ahead of every CO, oldest first.
check('duplicate base acceptances: both before the COs, older first',
  order('view_3914', [row('a4', P + 'SW1779CO | 20260915-11608', { signed: 'Yes' }), row('b2', P + 'SW1210 | 20260701-10500', { signed: 'Yes' }),
                      row('a3', P + 'SW1210 | 20260624-10393', { signed: 'Yes' })]),
  ['SW1210', 'SW1210', 'SW1779CO']);

// 4. No quote number on the identifier: the SOW number is the clock; nothing to go on: grid order.
check('no quote → SOW number orders the COs', order('view_3914', [row('c1', 'X-SW1964CO', {}), row('c2', 'X-SW1779CO', {}), row('c3', 'X-SW1210', {})]),
  ['SW1210', 'SW1779CO', 'SW1964CO']);
check('a quote outranks the SOW number (a CO created earlier but issued later lists later)',
  order('view_3914', [row('c1', P + 'SW1779CO | 20261020-12190', {}), row('c2', P + 'SW1823CO | 20260921-11701', {})]), ['SW1823CO', 'SW1779CO']);
check('neither quote nor SOW number: grid order', order('view_3914', [row('d1', 'Proposal B', {}), row('d2', 'Proposal A', {})]).length, 2);
check('the project number never reads as a quote (11 digits, then the SOW)',
  order('view_3914', [row('c1', P + 'SW1964CO', {}), row('c2', P + 'SW1779CO', {})]), ['SW1779CO', 'SW1964CO']);

// 5. The sub dashboard renders the same order (it used to be the grid's).
check('sub view: base first, then COs oldest → newest',
  order('view_4066', [row('a6', P + 'SW1955CO | 20261014-12084', { signed: 'Yes' }, true), row('a3', P + 'SW1210 | 20260624-10393', { signed: 'Yes' }, true),
                      row('a4', P + 'SW1779CO | 20260915-11608', { signed: 'Yes' }, true)], true),
  ['SW1210', 'SW1779CO', 'SW1955CO']);

// 6. The tally is order-independent: the same counts whatever the grid order.
document.body.innerHTML = '<div id="kn-scene_1311">' + grid('view_3914', live) + '</div>';
renders.view_3914();
const pill = document.querySelector('.scw-acpt-rollup');
check('rollup unchanged by the reorder', [pill.textContent, document.querySelector('.scw-acpt-row') !== null], ['all accepted', true]);

console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: all passed');
process.exit(fails ? 1 : 0);
