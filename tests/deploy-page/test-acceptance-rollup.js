// jsdom smoke test: acceptance-card.js accordion-header rollup (2026-10-30). The tally used to
// count every row whose "agreement signed" flag was No as "awaiting signature", so two change
// orders approved on the no-signature paths (field_3309 / field_3310) kept the deploy page's
// Paperwork tile on "Waiting" with "2 change orders awaiting signature". A row approved without a
// signature is settled: the pill goes green and reads "all accepted" (or "all signed" when every
// settled row carries a signature); only a genuinely unsigned row still waits.
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
window.setTimeout = function (fn) { fn(); return 0; }; global.setTimeout = window.setTimeout;   // run renders at once
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender(v, fn) { renders[v] = fn; } }; global.SCW = window.SCW;
const warns = []; console.warn = (...a) => warns.push(a.join(' '));
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/acceptance-card.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

const COLS = [['field_2755', 'Proposal'], ['field_2766', 'Signed'], ['field_2765', 'Paid'], ['field_2940', 'Terms'],
              ['field_3309', 'No sig'], ['field_3310', 'Not billable'], ['field_3311', 'Reason']];
// One acceptance row as Builder renders it; `thin` grids (the sub dashboard) carry no flag columns.
function row(id, proposal, f, thin) {
  f = f || {};
  const cells = [['field_2755', proposal], ['field_2766', f.signed || 'No'], ['field_2765', f.paid || 'No'], ['field_2940', f.terms || 'No']]
    .concat(thin ? [] : [['field_3309', f.noSig || 'No'], ['field_3310', f.notBill || 'No'], ['field_3311', f.reason || '']]);
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
function render(viewId, rows, thin) {
  document.body.innerHTML = '<div id="kn-scene_1311">' + grid(viewId, rows, thin) + '</div>';
  renders[viewId]();
  const acc = document.querySelector('.scw-ktl-accordion');
  const pill = acc.querySelector('.scw-acpt-rollup');
  return { text: pill ? pill.textContent : null, cls: pill ? pill.className.replace('scw-acpt-rollup ', '') : null,
           attention: acc.hasAttribute('data-scw-attention') };
}

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
check('the card bound its ops + sub views', [typeof renders.view_3914, typeof renders.view_4066], ['function', 'function']);

// 1. The live page (Etude Capital): 4 signed + 2 COs approved without a signature (not billable) → nothing waits.
let r = render('view_3914', [
  row('a1', '59277492086-SW1838CO | 20261007-11977', { noSig: 'Yes', notBill: 'Yes', reason: 'Credit' }),
  row('a2', '59277492086-SW1837CO | 20261007-11979', { noSig: 'Yes', notBill: 'Yes', reason: 'Credit' }),
  row('a3', '59277492086-SW1210 | 20260624-10393', { signed: 'Yes', terms: 'Yes' }),
  row('a4', '59277492086-SW1779CO | 20260915-11608', { signed: 'Yes' }),
  row('a5', '59277492086-SW1823CO | 20260921-11701', { signed: 'Yes' }),
  row('a6', '59277492086-SW1955CO | 20261014-12084', { signed: 'Yes' })
]);
check('no-signature approvals are settled: green "all accepted", no attention flag',
  r, { text: 'all accepted', cls: 'scw-acpt-rollup--ok', attention: false });

// 2. Approved without signature but billable (field_3309 alone) counts the same.
r = render('view_3914', [row('a1', 'X-SW1838CO | 1', { noSig: 'Yes' }), row('a3', 'X-SW1210 | 2', { signed: 'Yes', terms: 'Yes' })]);
check('field_3309 alone settles the row', r, { text: 'all accepted', cls: 'scw-acpt-rollup--ok', attention: false });

// 3. Every settled row signed → the old wording stays.
r = render('view_3914', [row('a3', 'X-SW1210 | 2', { signed: 'Yes', terms: 'Yes' }), row('a4', 'X-SW1779CO | 3', { signed: 'Yes' })]);
check('all e-signed → "all signed"', r, { text: 'all signed', cls: 'scw-acpt-rollup--ok', attention: false });

// 4. A genuinely unsigned CO still waits, and is counted as a change order.
r = render('view_3914', [row('a1', 'X-SW1838CO | 1', { noSig: 'Yes', notBill: 'Yes' }), row('a3', 'X-SW1210 | 2', { signed: 'Yes', terms: 'Yes' }),
  row('a7', 'X-SW1964CO | 4', {})]);
check('one unsigned CO → amber "change order awaiting signature" + attention',
  r, { text: 'change order awaiting signature', cls: 'scw-acpt-rollup--warn', attention: true });
r = render('view_3914', [row('a3', 'X-SW1210 | 2', {}), row('a7', 'X-SW1964CO | 4', {})]);
check('a base agreement and a CO unsigned → "2 awaiting signature · 1 is a change order"',
  r.text, '2 awaiting signature · 1 is a change order');

// 5. Waiting never reorders the list (2026-10-30: base scope first, then COs oldest → newest —
//    test-acceptance-order.js): the older CO (SW1838CO) stays ahead of the unsigned newer one.
render('view_3914', [row('a7', 'X-SW1964CO | 4', {}), row('a1', 'X-SW1838CO | 1', { noSig: 'Yes', notBill: 'Yes' })]);
check('an unsigned CO does not float above an older approved one',
  [...document.querySelectorAll('.scw-acpt-row')].map(el => /SW1964CO/.test(el.textContent) ? 'unsigned' : /SW1838CO/.test(el.textContent) ? 'approved' : '?'),
  ['approved', 'unsigned']);

// 6. Sub dashboard: the thin grid has no flag columns, so only the signature can settle a row…
r = render('view_4066', [row('a3', 'X-SW1210 | 2', { signed: 'Yes' }), row('a7', 'X-SW1964CO | 4', {})], true);
check('sub thin grid: unsigned CO still waits', r, { text: 'change order awaiting signature', cls: 'scw-acpt-rollup--warn', attention: true });
// …and when Builder adds the columns there, the same rule applies.
r = render('view_4066', [row('a3', 'X-SW1210 | 2', { signed: 'Yes' }), row('a1', 'X-SW1838CO | 1', { noSig: 'Yes', notBill: 'Yes' })]);
check('sub grid with the flag columns: approved CO is settled', r, { text: 'all accepted', cls: 'scw-acpt-rollup--ok', attention: false });

console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: all passed');
process.exit(fails ? 1 : 0);
