// jsdom smoke test: the reconcile-bid grid's cut-out cells carry a way to LINK an existing bid
// item. A "Not surveyed" cell (no bid record points at the SOW line item) offers "Link bid item…"
// next to "+ Add to bid" — the bid item usually exists and is pointing at another SOW's line item
// (revised SOW) or sits removed from the bid, so it is not a row in this grid and Re-link (which
// only renders inside a populated bid cell) could never reach it. A removed-from-bid row (a bid
// record with no populated cell anywhere) gets Re-link beside "+ Reinstate". A row that already
// has a populated cell elsewhere keeps exposing Re-link from that cell only (no duplicate).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#bids/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
for (const f of ['bid-review/config.js', 'bid-review-v2/config.js', 'bid-review-v2/transform.js', 'bid-review-v2/card.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const card = window.SCW.bidReviewV2.card;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const PKG = { id: '6ac5537aaf9b474c1a527433', label: '411' };
const SOW = '6ac54f532221abeb438b72ec';
function actions(td) {
  return Array.from(td.querySelectorAll('.scw-bid-review-v2__cell-actions button')).map(b => b.getAttribute('data-action'));
}

// 1. "Not surveyed": a SOW line item with no bid record at all (the Ubi kit on the revised SOW).
const notSurveyed = {
  id: '6ac7cc916ae34b2adf6b7a1f', sowItem: '6ac7cc916ae34b2adf6b7a1f', noBid: true, surveyNoBid: false, offSow: false,
  cellsByPackage: {}, displayLabel: 'Ubiquiti airMAX 5GHz NanoBeam ()', productName: 'Ubiquiti airMAX 5GHz NanoBeam AC Kit',
  proposalBucket: 'Other Equipment', proposalBucketId: 'pb1', sortOrder: 1, mdfIdf: 'IDF: 01:', mdfIdfId: 'm1',
  sowItemData: { qty: 1, fee: 625, laborDesc: 'Assemble and mount the NanoBeam', productName: 'Ubiquiti airMAX 5GHz NanoBeam AC Kit' },
  detail: null
};
const td1 = card.buildBidCell(null, notSurveyed, PKG, SOW, false);
check('not-surveyed badge', td1.querySelector('.scw-bid-review-v2__no-bid-badge').textContent.trim(), 'Not surveyed');
check('not-surveyed cell offers Add to bid AND Link bid item…', actions(td1), ['cell_add_to_bid', 'cell_link_bid_item']);
const link = td1.querySelector('button[data-action="cell_link_bid_item"]');
check('link button names the SOW line item, this column\'s bid and the SOW',
  [link.getAttribute('data-sow-item-id'), link.getAttribute('data-package-id'), link.getAttribute('data-sow-id'), link.getAttribute('data-row-id')],
  [notSurveyed.sowItem, PKG.id, SOW, notSurveyed.id]);
check('link button is its own visible family (not the row-hidden --relink class)',
  [link.classList.contains('scw-bid-review__cell-action--link'), link.classList.contains('scw-bid-review__cell-action--relink'), link.textContent],
  [true, false, 'Link bid item…']);
check('link button carries the label + product for the picker title fallback',
  [link.getAttribute('data-display-label'), link.getAttribute('data-product-name')],
  ['Ubiquiti airMAX 5GHz NanoBeam ()', 'Ubiquiti airMAX 5GHz NanoBeam AC Kit']);

// 2. Removed from bid (Source B): the bid record exists, is on no package — row.id IS the record.
const removedBid = {
  id: '6a3978845cd223435973ed0e', sowItem: 's-old', noBid: true, removed: true, hasBidRecord: true, cellsByPackage: {},
  displayLabel: 'Ubiquiti airMAX 5GHz NanoBeam AC Kit', productName: 'Ubiquiti airMAX 5GHz NanoBeam AC Kit',
  detail: { side: 'BID', product: 'Ubiquiti airMAX 5GHz NanoBeam AC Kit', qty: 1, fee: 650, desc: 'Assemble…' }
};
const td2 = card.buildBidCell(null, removedBid, PKG, SOW, false);
check('removed badge', td2.querySelector('.scw-bid-review-v2__no-bid-badge').textContent.trim(), 'Removed from bid');
check('removed-from-bid cell offers Reinstate AND Re-link (never Link — the bid record is the row)', actions(td2), ['cell_reinstate', 'cell_relink_bid']);
const relink = td2.querySelector('button[data-action="cell_relink_bid"]');
check('Re-link targets the removed bid record itself', [relink.getAttribute('data-bid-record-id'), relink.getAttribute('data-sow-id')], [removedBid.id, SOW]);
check('Re-link keeps the panel-only class (hidden in the row, relocated into the card label)', relink.classList.contains('scw-bid-review__cell-action--relink'), true);

// 3. A matched row with a populated cell on ANOTHER bid: this cell is "Removed from bid" but the
//    populated cell's card already carries Re-link — no second one here, and no Link.
const partial = {
  id: 'b-1', sowItem: 's-1', cellsByPackage: { pkgOther: { id: 'b-1', qty: 1, rate: 100, labor: 100, laborDesc: '', connDevice: [] } },
  displayLabel: 'E-001', productName: 'Camera', detail: null, sowItemData: { qty: 1, fee: 100, laborDesc: '' }
};
const td3 = card.buildBidCell(null, partial, PKG, SOW, false);
check('row with a populated cell elsewhere: Reinstate only', actions(td3), ['cell_reinstate']);

// 4. No SOW line item to link to → no Link button (nothing to point at).
const noTarget = { id: 'x', sowItem: '', noBid: true, cellsByPackage: {}, displayLabel: 'Z', productName: 'Z', detail: null };
const td4 = card.buildBidCell(null, noTarget, PKG, SOW, false);
check('no SOW item → Add to bid only', actions(td4), ['cell_add_to_bid']);

// 5. Assumption rows stay blank (no actions at all).
const td5 = card.buildBidCell(null, notSurveyed, PKG, SOW, true);
check('assumption cut-out carries no actions', actions(td5), []);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
