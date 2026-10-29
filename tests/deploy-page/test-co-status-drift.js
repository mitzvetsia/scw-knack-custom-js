// jsdom smoke test: co-cards.js acceptance cross-check (2026-10-29). Make 13.06b writes the CO
// status LAST and the acceptance's "agreement signed" flag FIRST, so a run that dies in between
// leaves the Change orders drawer saying Issued while Agreements & Invoices says signed. The card
// now matches its acceptance (the CO grid's through-connection columns, else the acceptance grid
// on the page, by the SW####CO token in the proposal identifier) and wears an amber
// "status not updated" tag — the pill keeps the stored status, the tag says it is stale.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {} }; global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/co-cards.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

const coRow = (id, name, number, status, extra) =>
  '<tr id="' + id + '">' +
    '<td class="field_2126">' + name + '</td>' +
    '<td class="field_2122">' + number + '</td>' +
    '<td class="field_2953">' + status + '</td>' + (extra || '') +
    '<td class="kn-table-link"><a class="kn-link-page" href="#deploy/x/change-order/' + id + '">Edit</a></td>' +
  '</tr>';
const coGrid = (viewId, rows, extraTh) =>
  '<div class="kn-table kn-view" id="' + viewId + '"><div class="kn-table-wrapper"><table>' +
    '<thead><tr><th class="field_2126">Name</th><th class="field_2122">SOW id</th>' +
      '<th class="field_2953">Status</th>' + (extraTh || '') + '<th class="kn-table-link"></th></tr></thead>' +
    '<tbody>' + rows.join('') + '</tbody>' +
  '</table></div></div>';
// One acceptance row as the Builder renders it (the proposal identifier carries the SOW token).
const accRow = (id, proposal, signed, noSig, notBill) =>
  '<tr id="' + id + '">' +
    '<td class="field_2755">' + proposal + '</td>' +
    '<td class="field_2766">' + signed + '</td>' +
    '<td class="field_3309">' + (noSig || 'No') + '</td>' +
    '<td class="field_3310">' + (notBill || 'No') + '</td>' +
  '</tr>';
const accGrid = (viewId, rows) =>
  '<div class="kn-table kn-view" id="' + viewId + '"><div class="kn-table-wrapper"><table>' +
    '<thead><tr><th class="field_2755">Proposal</th><th class="field_2766">Signed</th>' +
      '<th class="field_3309">No sig</th><th class="field_3310">Not billable</th></tr></thead>' +
    '<tbody>' + rows.join('') + '</tbody>' +
  '</table></div></div>';
function scene(sceneId, html) {
  document.body.innerHTML = '<div id="kn-' + sceneId + '">' + html + '</div>';
}
const fire = (viewId) => (handlers['knack-view-render.any.scwCoCards'] || []).forEach(fn => fn({}, { key: viewId }));
const cards = (viewId) => [...document.querySelectorAll('#' + viewId + ' .scw-co-card')];
const cardFor = (viewId, number) => cards(viewId).find(c => (c.querySelector('.scw-co-card__num') || {}).textContent === number);
const tagOf = (card) => card && card.querySelector('.scw-co-card__basis-tag--drift');

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

// ── 1. The live case (2026-10-29): three Issued COs, one of them signed on its acceptance ──
const THREE = [
  coRow('co1', 'Video Intercom Licenses', '63222296454-SW1819CO', 'Issued'),
  coRow('co2', 'New Wireless Point to Point setup.', '63222296454-SW1855CO', 'Issued'),
  coRow('co3', 'New Entry PMO Lobby', '63222296454-SW1964CO', 'Issued')
];
const ACCS = [
  accRow('a1', '63222296454-SW1819CO | 20260921-11702', 'No'),
  accRow('a2', '63222296454-SW1964CO | 20261014-12088', 'No'),
  accRow('a3', '63222296454-SW1564 | 20260910-11561', 'Yes'),
  accRow('a4', '63222296454-SW1855CO | 20261014-12069', 'Yes')
];
scene('scene_1311', coGrid('view_4076', THREE) + accGrid('view_3914', ACCS));
fire('view_4076');
check('three cards, one drift tag — on the CO whose acceptance is signed',
  [cards('view_4076').length, cards('view_4076').filter(c => tagOf(c)).map(c => c.querySelector('.scw-co-card__num').textContent)],
  [3, ['63222296454-SW1855CO']]);
const c2 = cardFor('view_4076', '63222296454-SW1855CO');
check('the tag reads "Signed · status not updated" and the pill still shows the stored status',
  [tagOf(c2).textContent, c2.querySelector('.scw-co-card__pill').textContent],
  ['Signed · status not updated', 'Issued']);
check('the ops title names the scenario and the fix',
  [/13\.06b/.test(tagOf(c2).title), /set the status to Accepted/.test(tagOf(c2).title)], [true, true]);
check('the card accent turns amber; the clean cards keep the Issued blue',
  [c2.style.getPropertyValue('--scw-co-accent'), cardFor('view_4076', '63222296454-SW1819CO').style.getPropertyValue('--scw-co-accent')],
  ['#b45309', '#0369a1']);
check('the base SOW\'s signed acceptance (SW1564, no CO) is never matched to a CO',
  [!!tagOf(cardFor('view_4076', '63222296454-SW1819CO')), !!tagOf(cardFor('view_4076', '63222296454-SW1964CO'))], [false, false]);

// ── 2. Status caught up → no tag ─────────────────────────────────────
scene('scene_1311', coGrid('view_4076', [coRow('co2', 'Wireless P2P', '63222296454-SW1855CO', 'Accepted')]) + accGrid('view_3914', ACCS));
fire('view_4076');
check('Accepted + signed acceptance: no tag, green accent', [!!tagOf(cards('view_4076')[0]), cards('view_4076')[0].style.getPropertyValue('--scw-co-accent')], [false, '#166534']);

// ── 3. Declined / Void are left alone even with a signed acceptance ───
scene('scene_1311', coGrid('view_4076', [coRow('co2', 'Wireless P2P', '63222296454-SW1855CO', 'Void'), coRow('co9', 'X', '63222296454-SW1855CO', 'Declined')]) + accGrid('view_3914', ACCS));
fire('view_4076');
check('Void / Declined: no tag', cards('view_4076').map(c => !!tagOf(c)), [false, false]);

// ── 4. The CO grid's own through-connection column wins, no acceptance grid needed ──
scene('scene_1311', coGrid('view_4076',
  [coRow('co2', 'Wireless P2P', '63222296454-SW1855CO', 'Issued', '<td class="field_2942-field_2766">Yes</td>'),
   coRow('co1', 'Licenses', '63222296454-SW1819CO', 'Issued', '<td class="field_2942-field_2766">No</td>')],
  '<th class="field_2942-field_2766">Signed</th>'));
fire('view_4076');
check('through-connection Yes → tag; No → none (no acceptance grid on the page)',
  [!!tagOf(cardFor('view_4076', '63222296454-SW1855CO')), !!tagOf(cardFor('view_4076', '63222296454-SW1819CO'))], [true, false]);

// ── 5. Approved without a signature, status still Ops Review ─────────
scene('scene_1311', coGrid('view_4076', [coRow('co5', 'Mount credit', '63222296454-SW1900CO', 'Ops Review')]) +
  accGrid('view_3914', [accRow('a5', '63222296454-SW1900CO | 20261020-12100', 'No', 'Yes', 'No')]));
fire('view_4076');
check('approved-without-signature acceptance → "Approved · status not updated"',
  tagOf(cards('view_4076')[0]).textContent, 'Approved · status not updated');

// ── 6. Sub dashboard: same tag, neutral title (never names Make) ─────
scene('scene_1353', '<nav id="scw-deploy-nav"></nav>' + coGrid('view_4123', [coRow('co2', 'Wireless P2P', '63222296454-SW1855CO', 'Issued')]) +
  accGrid('view_4066', [accRow('a4', '63222296454-SW1855CO | 20261014-12069', 'Yes')]));
fire('view_4123');
const subTag = tagOf(cards('view_4123')[0]);
check('sub scene: tag present, title says SCW is finalizing and never mentions 13.06b',
  [!!subTag, subTag && /SCW is finalizing/.test(subTag.title), subTag && /13\.06b/.test(subTag.title)], [true, true, false]);

// ── 7. The acceptance grid landing AFTER the CO grid rebuilds the cards ──
scene('scene_1311', coGrid('view_4076', THREE));
fire('view_4076');
check('no acceptance grid yet → no tag', cards('view_4076').some(c => tagOf(c)), false);
document.getElementById('kn-scene_1311').insertAdjacentHTML('beforeend', accGrid('view_3914', ACCS));
fire('view_3914');
check('the acceptance grid\'s render rebuilds the CO list with the tag',
  cards('view_4076').filter(c => tagOf(c)).map(c => c.querySelector('.scw-co-card__num').textContent), ['63222296454-SW1855CO']);

console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: all passed');
process.exit(fails ? 1 : 0);
