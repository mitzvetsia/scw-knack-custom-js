// jsdom smoke test: acceptance-card.js project footer — accepted rows only (2026-10-30).
// "If an agreement is not signed or accepted in some fashion it shouldn't be lumped into the totals;
// maybe have a section below that's 'not yet accepted' numbers." The PROJECT band used to sum every
// row on the card, so an unsigned change order's $3,231 rode "billed to client" and its $2,600 rode
// "billed by sub". Now the project band sums the accepted rows (signed, or approved on a no-signature
// path) and carries the note "accepted agreements only"; the unsigned rows are tallied in their own
// NOT YET ACCEPTED band underneath (same columns, amber caption, the rollup's wording). Nothing
// pending → the footer is exactly what it was. Nothing accepted → only the pending band.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/63222296454' });
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
              ['field_3309', 'No sig'], ['field_3310', 'Not billable'], ['field_3311', 'Reason'],
              ['field_2669', 'Equipment total'], ['field_2668', 'Install total'], ['field_2670', 'Project total'], ['field_2944', 'Bid doc']];
const usd = n => n == null ? '' : '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// One acceptance row as Builder renders it: the proposal money through the connection, the bid document
// (the sub's grand total) as Knack renders the stored fragment.
function row(id, proposal, f) {
  f = f || {};
  const doc = f.sub == null ? '&nbsp;' :
    '<div class="project-totals"><div class="pt-line pt-line--grand-total"><span class="pt-label">Grand Total</span><span class="pt-value">' + usd(f.sub) + '</span></div></div>';
  const cells = [['field_2755', proposal], ['field_2766', f.signed || 'No'], ['field_2765', f.paid || 'No'], ['field_2940', f.terms || 'No'],
    ['field_3309', f.noSig || 'No'], ['field_3310', f.notBill || 'No'], ['field_3311', ''],
    ['field_2669', f.equip == null ? '' : usd(f.equip)], ['field_2668', f.install == null ? '' : usd(f.install)],
    ['field_2670', f.equip == null && f.install == null ? '' : usd((f.equip || 0) + (f.install || 0))], ['field_2944', doc]];
  return '<tr id="' + id + '">' + cells.map(c => '<td class="' + c[0] + '">' + c[1] + '</td>').join('') + '</tr>';
}
function grid(viewId, rows) {
  return '<div class="scw-ktl-accordion"><div class="scw-ktl-accordion__header"><span class="scw-acc-title">ACCEPTANCE</span>' +
    '<span class="scw-acc-count">' + rows.length + '</span></div><div class="scw-ktl-accordion__body">' +
    '<div class="kn-table kn-view" id="' + viewId + '"><div class="kn-table-wrapper"><table>' +
    '<thead><tr>' + COLS.map(c => '<th class="' + c[0] + '">' + c[1] + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + rows.join('') + '</tbody></table></div></div></div></div>';
}
function render(viewId, rows) {
  document.body.innerHTML = '<div id="kn-scene_1311">' + grid(viewId, rows) + '</div>';
  renders[viewId]();
  return [...document.querySelectorAll('.scw-acpt-foot')].map(band => ({
    cls: band.className.replace('scw-acpt-foot', '').trim(),
    cap: band.querySelector('.scw-acpt-foot__cap').textContent,
    note: (band.querySelector('.scw-acpt-foot__note') || {}).textContent || '',
    split: band.querySelector('.scw-acpt-split') ? [...band.querySelector('.scw-acpt-split').children].map(c => c.textContent).join(' ') : '',
    lines: [...band.querySelectorAll('.scw-acpt-line__val')].map(v => [v.textContent, v.nextSibling.textContent.trim()])
  }));
}
const wrapped = () => !!document.querySelector('.scw-acpt-foots');
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

// The live page (2026-10-30 screenshot): a signed base agreement, two signed COs (one with no sub bid) and
// one CO still unsigned — $3,231 to the client / $2,600 to the sub that the client has not agreed to.
const P = '63222296454-';
const live = [
  row('a1', P + 'SW1564 | 20260910-11561',   { signed: 'Yes', terms: 'Yes', equip: 2200, install: 5559, sub: 4535 }),
  row('a2', P + 'SW1819CO | 20260921-11702', { signed: 'Yes', equip: 0, install: 0 }),
  row('a3', P + 'SW1855CO | 20261014-12069', { signed: 'Yes', equip: 1550, install: 2127, sub: 1870 }),
  row('a4', P + 'SW1964CO | 20261014-12088', { equip: 275, install: 2956, sub: 2600 })
];
let bands = render('view_3914', live);
check('two bands: the project (accepted only) and the not-yet-accepted tally, wrapped together',
  [wrapped(), bands.map(b => [b.cap, b.cls])], [true, [['Project', ''], ['Not yet accepted', 'scw-acpt-foot--pending']]]);
check('PROJECT sums the three accepted rows only, and says so',
  [bands[0].note, bands[0].lines],
  ['accepted agreements only', [['$11,436.00', 'billed to client'], ['$3,750.00', 'equipment'], ['$7,686.00', 'labor'], ['$6,405.00', 'billed by sub'], ['17%', 'remaining']]]);
check('the base + CO split under PROJECT counts the accepted COs only',
  bands[0].split, '$4,535.00 original bid + +$1,870.00 change order = $6,405.00 to sub');
check('NOT YET ACCEPTED carries the unsigned CO\'s figures and the rollup\'s wording',
  [bands[1].note, bands[1].lines],
  ['1 change order awaiting signature', [['$3,231.00', 'billed to client'], ['$275.00', 'equipment'], ['$2,956.00', 'labor'], ['$2,600.00', 'billed by sub'], ['12%', 'remaining']]]);

// Every row accepted → the footer is exactly what it was: one band, no note, every row summed.
bands = render('view_3914', [live[0], live[1], live[2], row('a4', P + 'SW1964CO | 20261014-12088', { signed: 'Yes', equip: 275, install: 2956, sub: 2600 })]);
check('all signed: one PROJECT band with every row, no note, no wrapper',
  [wrapped(), bands.length, bands[0].cap, bands[0].note, bands[0].lines.slice(0, 1), bands[0].lines[3]],
  [false, 1, 'Project', '', [['$14,667.00', 'billed to client']], ['$9,005.00', 'billed by sub']]);

// Approved without a signature (not billable, or approved for terms without the client signing) is accepted.
bands = render('view_3914', [live[0], row('a4', P + 'SW1964CO | 20261014-12088', { noSig: 'Yes', notBill: 'Yes', equip: 275, install: 2956, sub: 2600 })]);
check('a no-signature approval counts as accepted: no pending band', [bands.length, bands[0].lines[0]], [1, ['$10,990.00', 'billed to client']]);

// A signed base agreement plus one unsigned CO: the project band renders (it used to only when it summed
// two billed rows) so the accepted figure reads against the pending one.
bands = render('view_3914', [live[0], live[3]]);
check('one accepted row + one pending: PROJECT shows the accepted figure beside the pending band',
  [bands.map(b => b.cap), bands[0].note, bands[0].lines[0], bands[1].lines[0]],
  [['Project', 'Not yet accepted'], 'accepted agreements only', ['$7,759.00', 'billed to client'], ['$3,231.00', 'billed to client']]);

// Nothing accepted yet → only the pending band, with the two-row wording.
bands = render('view_3914', [row('a1', P + 'SW1564 | 20260910-11561', { equip: 2200, install: 5559, sub: 4535 }), live[3]]);
check('nothing accepted: the pending band alone, counting both and naming the CO',
  [wrapped(), bands.map(b => b.cap), bands[0].note, bands[0].lines[0]],
  [false, ['Not yet accepted'], '2 awaiting signature · 1 is a change order', ['$10,990.00', 'billed to client']]);

// An unsigned row with no money on it has nothing to tally: no pending band, the project band as before.
bands = render('view_3914', [live[0], live[2], row('a9', P + 'SW1970CO | 20261020-12190', {})]);
check('an unsigned row with no figures adds no band', [bands.length, bands[0].cap, bands[0].note, bands[0].lines[0]],
  [1, 'Project', '', ['$11,436.00', 'billed to client']]);

// The sub dashboard's card runs the same footer: the sub's own totals split the same way.
bands = render('view_4066', [live[0], live[3]]);
check('sub view: "your total" for the accepted base, the unsigned CO under NOT YET ACCEPTED',
  bands.map(b => [b.cap, b.lines]),
  [['Project', [['$4,535.00', 'your total']]], ['Not yet accepted', [['$2,600.00', 'your total']]]]);

console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: all passed');
process.exit(fails ? 1 : 0);
