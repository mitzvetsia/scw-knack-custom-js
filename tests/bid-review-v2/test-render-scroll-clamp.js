// jsdom smoke test: the reconcile grid rebuild can no longer shrink the document (2026-10-21).
// Every re-render of a hidden source grid on scene_1155 sent the page to y=261 with NO scroll
// call: the rebuild detached reused sections into a fragment and inserted fresh ones without the
// tabs' --active class (display:none), and a layout flush in that window (reopenExpandedRows'
// offsetParent probe) let Chrome clamp scrollY to the ~1260px page that was left. Covered here,
// driving the real render.js + _v2-scroll-anchor.js: the floor across the rebuild, the active
// class pre-applied at build time, the one-pass swap (nothing touched when the sections are
// unchanged), and the guard's pixel hold when no grid row is in view.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155">' +
  '<div id="scw-bid-review-v2" class="scw-bid-review-v2--tabs">' +
  '<div class="scw-bid-review-v2-count"></div><div class="scw-bid-review-v2-body"></div></div>' +
  '</body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#review-bids/6a2c00010000000000001111' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
// The modules read `localStorage` as a bare global (inside new Function that is Node's scope, not jsdom's).
global.localStorage = window.localStorage;

// Scroll geometry — jsdom has no layout, so the page's height and position are stubs.
let pageY = 6700, docH = 50000;
Object.defineProperty(window, 'pageYOffset', { configurable: true, get: () => pageY });
Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => docH });
Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, get: () => pageY, set: v => { pageY = v; } });
const scrolls = [];
window.scrollTo = (x, y) => { scrolls.push(['to', Math.round(y)]); pageY = y; };
window.scrollBy = (x, dy) => { scrolls.push(['by', Math.round(dy)]); pageY += dy; };
window.requestAnimationFrame = fn => setTimeout(() => fn(Date.now()), 16);
try { window.localStorage.scwScrollSpy = '1'; } catch (e) { /* diary optional */ }
const warns = [];
console.warn = function () { warns.push(Array.prototype.join.call(arguments, ' ')); };

window.SCW = { CONFIG: {} };
global.SCW = window.SCW;
function load(rel) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/', rel), 'utf8'))(window, document, undefined, undefined, window.SCW);
}
load('_v2-scroll-anchor.js');

// Reconcile namespace stubs around the real render.js.
let builds = 0, afterRenderCalls = 0, activeAtAfterRender = null;
const ns = window.SCW.bidReviewV2 = {
  CONFIG: { mountId: 'scw-bid-review-v2', sourceViewKeys: ['view_3680', 'view_3921', 'view_3573'] },
  transform: { buildState(bids, sows) {
    return { isEmpty: false, sowGrids: sows.map(s => ({ sowId: s.sowId, rev: s.rev })) };
  } },
  card: { buildSowSection(grid) {
    builds++;
    const sec = document.createElement('section');
    sec.className = 'scw-bid-review-v2__sow';
    sec.setAttribute('data-sow-id', grid.sowId);
    sec.innerHTML = '<div class="scw-bid-review-v2__sow-header"></div><table><tbody>' +
      '<tr class="scw-bid-review-v2__row scw-bid-review-v2__row--expandable" data-row-id="row-' + grid.sowId + '"><td>x</td></tr>' +
      '</tbody></table>';
    return sec;
  } },
  header: {
    activeSowId() { return 's2'; },
    afterRender(body) {
      afterRenderCalls++;
      activeAtAfterRender = Array.from(body.querySelectorAll('.scw-bid-review-v2__sow'))
        .map(s => s.classList.contains('scw-bid-review-v2__sow--active'));
    }
  },
  data: { warnIfTruncated() {}, truncationRepairPending() { return false; } }
};
load('bid-review-v2/render.js');

const body = document.querySelector('.scw-bid-review-v2-body');
let removed = 0, appended = 0, wipes = 0;
const _rm = body.removeChild.bind(body), _ap = body.appendChild.bind(body);
body.removeChild = n => { removed++; return _rm(n); };
body.appendChild = n => { appended++; return _ap(n); };
let proto = window.Element.prototype, ihDesc = null;
while (proto && !ihDesc) { ihDesc = Object.getOwnPropertyDescriptor(proto, 'innerHTML'); proto = Object.getPrototypeOf(proto); }
if (ihDesc) {
  Object.defineProperty(body, 'innerHTML', { configurable: true,
    get() { return ihDesc.get.call(this); }, set(v) { wipes++; return ihDesc.set.call(this, v); } });
}

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const snap = (s1rev, s2rev) => ({ view_3680: [{ id: 'b1' }], view_3921: [{ sowId: 's1', rev: s1rev }, { sowId: 's2', rev: s2rev }], view_3573: [] });
const sections = () => Array.from(body.querySelectorAll(':scope > .scw-bid-review-v2__sow'));
const ids = () => sections().map(s => s.getAttribute('data-sow-id'));
const guardLines = () => warns.filter(w => w.indexOf('[scw-v2-guard]') === 0);
const ROW_SEL = '.scw-bid-review-v2__row[data-row-id]';

(async () => {
  // 1. First render while scrolled: floor applied, active class on s2 before afterRender, no innerHTML wipe.
  ns.render.renderSnapshot(snap(1, 1));
  check('render floors the document at the pre-rebuild height', document.body.style.minHeight, '50000px');
  check('two sections in state order', ids(), ['s1', 's2']);
  check('the active SOW section is visible BEFORE header.afterRender runs', activeAtAfterRender, [false, true]);
  check('header.afterRender ran once', afterRenderCalls, 1);
  check('no innerHTML wipe of the body', wipes, 0);
  const [s1a, s2a] = sections();
  const removedAfterFirst = removed;

  // 2. Identical snapshot: DOM untouched, same nodes, nothing built.
  ns.render.renderSnapshot(snap(1, 1));
  check('unchanged render builds nothing', builds, 2);
  check('unchanged render removes nothing from the body', removed, removedAfterFirst);
  check('unchanged render keeps the same section nodes', [sections()[0] === s1a, sections()[1] === s2a], [true, true]);
  check('unchanged render diary says DOM untouched', warns.some(w => /REBUILD — 2 section\(s\) reused, 0 rebuilt.*DOM untouched/.test(w)), true);

  // 3. s2 changed: s1 reused by identity, s2 rebuilt with the active class, order kept, no wipe.
  ns.render.renderSnapshot(snap(1, 2));
  check('changed render rebuilds only the changed section', builds, 3);
  check('reused section keeps its node', sections()[0] === s1a, true);
  check('rebuilt section is a new node', sections()[1] === s2a, false);
  check('rebuilt active section carries the active class at afterRender time', activeAtAfterRender, [false, true]);
  check('order preserved after a partial rebuild', ids(), ['s1', 's2']);
  check('still no innerHTML wipe', wipes, 0);
  check('swap re-appends every section once', appended >= 4, true);

  // 4. Floor releases after its window; a render at the top of the page does not floor.
  await sleep(1700);
  check('floor released after FLOOR_MS', document.body.style.minHeight, '');
  pageY = 0;
  ns.render.renderSnapshot(snap(2, 2));
  check('no floor at the top of the page', document.body.style.minHeight, '');
  check('diary reports the floor off at top', warns.some(w => /REBUILD — .*floor off \(at top\)/.test(w)), true);

  // 5. Guard pixel hold: no row is visible (jsdom rects are 0), the page is clamped → restored.
  const A = window.SCW.v2ScrollAnchor;
  A.cancel(); scrolls.length = 0; warns.length = 0;
  pageY = 6700; docH = 50000;
  A.guard(600, ROW_SEL, 'data-row-id');
  check('guard arms a pixel hold when no row is in view', guardLines().some(w => /armed \(pixel hold\) y=6700/.test(w)), true);
  pageY = 261;                      // the browser's clamp, no scroll call
  await sleep(120);
  check('pixel hold restores the pre-render position', scrolls[scrolls.length - 1], ['to', 6700]);
  check('page is back where the user was', pageY, 6700);

  // 6. Unreachable position (the page really got shorter): left alone.
  A.cancel(); scrolls.length = 0;
  pageY = 6700; docH = 50000;
  A.guard(600, ROW_SEL, 'data-row-id');
  docH = 1200; pageY = 261;
  await sleep(120);
  check('no restore when the old position no longer exists', scrolls.length, 0);

  // 7. A click cancels the guard before it can act.
  A.cancel(); scrolls.length = 0; warns.length = 0;
  pageY = 6700; docH = 50000;
  A.guard(600, ROW_SEL, 'data-row-id');
  window.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
  pageY = 261;
  await sleep(120);
  check('mousedown cancels the guard', guardLines().some(w => /cancelled by user gesture \(mousedown\)/.test(w)), true);
  check('no restore after the user clicked', scrolls.length, 0);

  // 8. A skipped arm at the top leaves the window open for the next arm.
  A.cancel(); warns.length = 0;
  pageY = 0;
  A.guard(600, ROW_SEL, 'data-row-id');
  check('arm at the top is skipped', guardLines().some(w => /arm SKIPPED — at the top/.test(w)), true);
  pageY = 6700;
  A.guard(600, ROW_SEL, 'data-row-id');
  check('next arm is a fresh arm, not a re-arm of the skipped one', guardLines().some(w => /armed \(pixel hold\) y=6700/.test(w)), true);
  check('no stale re-arm line', guardLines().some(w => /re-arm → window extended/.test(w)), false);

  // 9. Row anchor still wins when a row IS in view: it is chased, not pixel-held.
  A.cancel(); scrolls.length = 0; warns.length = 0;
  pageY = 6700; docH = 50000;
  const row = document.querySelector(ROW_SEL);
  let rowTop = 300;
  row.getBoundingClientRect = () => ({ top: rowTop, bottom: rowTop + 40, left: 0, right: 100, width: 100, height: 40 });
  row.getClientRects = () => [1];
  A.guard(600, ROW_SEL, 'data-row-id');
  check('guard anchors on the visible row', guardLines().some(w => /armed on row-s1 @top=300/.test(w)), true);
  rowTop = 3000;                    // content inserted above the row
  await sleep(120);
  check('row displacement is corrected with scrollBy', scrolls[0], ['by', 2700]);
  A.cancel();

  console.log('RESULT ' + (fails ? fails + ' FAILED' : 'all passed'));
  process.exit(fails ? 1 : 0);
})();
