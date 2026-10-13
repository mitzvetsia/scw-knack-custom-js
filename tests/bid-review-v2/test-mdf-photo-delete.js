// jsdom smoke test: bid-review-v2 MDF/IDF photo delete (mdf-manage.js deleteMdfPhoto +
// card.js's trash chip). 2026-10-13: the chip is always on the thumb (pale pink, dark red
// on hover) and the click goes through an "Are you SURE!?!" confirm; only a yes fires the
// REST DELETE through the delete-enabled grid and drops the thumb optimistically.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155"></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#reconcile-bids/6a2c00010000000000001111/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
const jq = () => jqObj; jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;
const ajax = [], confirms = []; let answer = false;
window.SCW = { CONFIG: {}, onViewRender() {}, onSceneRender() {}, debug() {},
  bidReviewV2: {}, bidReview: { CONFIG: { mdfIdfViewKey: 'view_3822' } },
  worksheetV2: { confirmModal(opts) { confirms.push(opts); return Promise.resolve(answer); } },
  knackAjax(o) { ajax.push(o); },
  knackRecordUrl(view, id) { return '/v1/scenes/scene_1155/views/' + view + '/records/' + id; } };
global.SCW = window.SCW;
for (const f of ['mdf-edit-core.js', 'bid-review-v2/mdf-manage.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const tick = () => new Promise(r => setTimeout(r, 0));
// A thumb with its delete chip, as card.js renders it.
function thumb(id) {
  const a = document.createElement('a'); a.className = 'scw-bid-review-v2__l1-detail-photo'; a.href = '#';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'scw-bid-review-v2__l1-detail-photo-del';
  b.setAttribute('data-scw-mdf-photo-del', id); a.appendChild(b); document.body.appendChild(a); return { a, b };
}
(async () => {
  const t1 = thumb('p1');
  t1.b.click(); await tick();
  check('the click asks first — "Are you SURE!?!", what it deletes, Cancel | Delete photo',
    [confirms.length, confirms[0] && confirms[0].title, confirms[0] && /permanently deletes/.test(confirms[0].body),
     confirms[0] && confirms[0].cancelLabel, confirms[0] && confirms[0].okLabel],
    [1, 'Are you SURE!?!', true, 'Cancel', 'Delete photo']);
  check('a no fires nothing and keeps the thumb', [ajax.length, document.body.contains(t1.a)], [0, true]);

  answer = true;
  const t2 = thumb('p2');
  t2.b.click(); await tick();
  check('a yes fires one REST DELETE through the delete grid for that photo and drops the thumb',
    [ajax.length, ajax[0] && ajax[0].type, ajax[0] && ajax[0].url, document.body.contains(t2.a)],
    [1, 'DELETE', '/v1/scenes/scene_1155/views/view_4098/records/p2', false]);

  // The chip's styles (bid-review-v2/styles.js): always visible, pale pink at rest, no hover-reveal rule.
  const css = fs.readFileSync(path.join(__dirname, '../../src/features/bid-review-v2/styles.js'), 'utf8');
  const i = css.indexOf("'.scw-bid-review-v2__l1-detail-photo-del {'");
  const block = css.slice(i, css.indexOf("'}'", i));
  check('the chip is always on the thumb, pale pink with a dark red glyph',
    [i > 0, /opacity: 1;/.test(block), /opacity: 0/.test(block), /background: #ffe4e6; color: #9f1239;/.test(block)], [true, true, false, true]);
  check('no hover-reveal rule remains; hover is the dark red fill',
    [/l1-detail-photo:hover \.scw-bid-review-v2__l1-detail-photo-del \{/.test(css),
     /l1-detail-photo-del:hover,\s*'\s*,?\s*'\.scw-bid-review-v2__l1-detail-photo-del:focus-visible \{',\s*'  background: #9f1239; border-color: #9f1239; color: #fff;'/.test(css)],
    [false, true]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
