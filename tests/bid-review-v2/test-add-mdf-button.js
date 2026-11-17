// jsdom test: the Reconcile Bids toolbar's "+ Add MDF/IDF" (2026-11-17). On the site route
// (mdf-site-route.js preview) the button opens the custom add window (mdf-site-tools openAdd,
// Make 22.02), so it no longer needs a native Knack "Add MDF/IDF" menu on the page — the native
// page + menu can be deleted in Builder without the window losing its button. Off the route the
// button still follows a native menu link, as before. Drives the real bid-review-v2/toolbar.js;
// mdf-site-tools is stubbed to its canAdd / openAdd switch.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PID = '69c4310cf4b1b33df77fa499';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/' + PID + '/review-bids/' + PID });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, ajaxError() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { router: { current_scene_key: 'scene_1155' }, getUserAttributes() { return { email: 'micah.shearer@getscw.com' }; }, views: {} };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;

let routeOn = false;
const opens = [];
window.SCW.mdfSiteTools = {
  canAdd: (grid) => routeOn && grid === 'view_4167',
  openAdd: (o) => opens.push(o)
};
window.SCW.bidReview = { CONFIG: { mdfIdfViewKey: 'view_4167' } };
window.SCW.bidReviewV2 = { CONFIG: { mountId: 'scw-bid-review-v2' } };
new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/bid-review-v2/toolbar.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0;
function ok(cond, msg) { if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const host = document.createElement('div'); host.id = 'scw-bid-review-v2';
host.innerHTML = '<div class="scw-bid-review-v2-body"></div>';
document.body.appendChild(host);
function remount() {
  const old = host.querySelector('.scw-ws-v2-toolbar');
  if (old) old.remove();
  window.SCW.bidReviewV2.toolbar.mount();
  return host.querySelector('[data-scw-br-v2-tb="add-mdf"]');
}
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

ok(!remount(), 'route off, no native menu: no button (nothing to open)');

const menu = document.createElement('div');
menu.className = 'kn-menu kn-view'; menu.id = 'view_9001';
menu.innerHTML = '<a href="#add-mdfidf/' + PID + '" class="kn-link-page">Add MDF/IDF</a>';
document.body.appendChild(menu);
let nativeClicks = 0;
menu.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); nativeClicks++; });
const b1 = remount();
ok(!!b1, 'route off, native menu on the page: the button renders');
ok(menu.style.display === 'none', '… and the lone menu is hidden');
click(b1);
ok(nativeClicks === 1 && opens.length === 0, '… and its click follows the native link');

routeOn = true;
menu.remove();
const b2 = remount();
ok(!!b2, 'route on, native menu deleted in Builder: the button still renders');
click(b2);
ok(opens.length === 1 && opens[0].gridKey === 'view_4167' && opens[0].viewKey === 'view_3921',
  '… and opens the add window over the site grid');

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
