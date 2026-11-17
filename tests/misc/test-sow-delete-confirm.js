// jsdom test: the SOW delete confirmation (sow-delete-confirm.js, ClickUp 86bd3yf2p).
// The SOW list's Delete on BUILD SOW (view_3325) is Knack's native delete link, and
// delete-intercept.js answers Knack's own prompt — so one click deleted the SOW. The module
// stops that click, names the SOW and what is attached to it, and lets exactly one confirmed
// click through to Knack.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const A = 'a'.repeat(24), B = 'b'.repeat(24), C = 'c'.repeat(24);
const dom = new JSDOM('<!doctype html><html><body>' +
  '<div class="kn-view" id="view_3325"><table class="kn-table-table"><tbody>' +
    '<tr id="' + A + '"><td class="field_2122">60486704913-SW1589</td><td><a class="kn-link-delete" href="#"><i class="fa fa-trash"></i></a></td></tr>' +
    '<tr id="' + B + '"><td class="field_2122">60486704913-SW1628</td><td><a class="kn-link-delete" href="#"><i class="fa fa-trash"></i></a></td></tr>' +
  '</tbody></table></div>' +
  '<div class="kn-view" id="view_9000"><table><tbody>' +
    '<tr id="' + C + '"><td><a class="kn-link-delete" href="#">x</a></td></tr>' +
  '</tbody></table></div>' +
  '</body></html>', { url: 'https://x.knack.com/app#projects/project-dashboard/p/build-sow/p' });
const { window } = dom;
const document = window.document;
global.window = window; global.document = document;

// "Knack": a delegated (bubble-phase) delete handler per view, as Backbone binds it.
const deleted = [];
['view_3325', 'view_9000'].forEach((vk) => {
  document.getElementById(vk).addEventListener('click', (e) => {
    const a = e.target.closest('a.kn-link-delete');
    if (a) deleted.push(vk + ':' + a.closest('tr').id);
  });
});

const model = (rows) => ({ model: { data: { models: rows.map((a) => ({ id: a.id, attributes: a })) } } });
window.Knack = {
  views: {
    view_3325: model([
      { id: A, field_2122: '60486704913-SW1589', field_2126: 'Alternate — fewer cameras', field_2200_raw: 48250.5,
        field_2706: 'No', field_2725: 'No', field_2737: 0 },
      { id: B, field_2122: '60486704913-SW1628', field_2126: 'Original scope', field_2200_raw: 91000,
        field_2706: 'Yes', field_2725: 'Yes', field_2737: 2 }
    ]),
    view_3885: model([
      { id: 'p1', field_2665: '<span>60486704913-SW1628 | 20261007-11977</span>', field_2666_raw: [{ id: B, identifier: 'SW-1628' }] }
    ]),
    view_3962: model([
      { id: 'i1', field_2154_raw: [{ id: A }] },
      { id: 'i2', field_2154_raw: [{ id: A }, { id: B }] },
      { id: 'i3', field_2154_raw: [{ id: A }] },
      { id: 'i4', field_2154_raw: [{ id: B }] },
      { id: 'i5', field_2154_raw: [] }
    ])
  }
};
global.Knack = window.Knack;
window.SCW = {}; global.SCW = window.SCW;

new Function('window', 'document', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/sow-delete-confirm.js'), 'utf8'))(window, document, window.Knack, window.SCW);
const M = window.SCW.sowDeleteConfirm;
M.CONFIG.armMs = 30;

let fails = 0;
function ok(cond, msg) { if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const linkOf = (vk, id) => document.querySelector('#' + vk + ' tr[id="' + id + '"] a.kn-link-delete');
const dialog = () => document.querySelector('.scw-sdc-overlay');
const txt = () => (dialog() ? dialog().textContent.replace(/\s+/g, ' ') : '');
const delBtn = () => dialog().querySelector('[data-scw-sdc-delete]');
const keepBtn = () => dialog().querySelector('[data-scw-sdc-keep]');

(async () => {
  ok(M._sowNumber('60486704913-SW1589') === '1589' && M._sowNumber('59277492086-SW1838CO') === '1838CO' && M._sowNumber('no token') === '',
    'the SOW number is read off the ID (change orders keep their CO suffix)');

  // ── the trashcan: stopped, named, nothing deleted ──
  click(linkOf('view_3325', A).querySelector('i'));
  ok(deleted.length === 0 && !!dialog(), 'a click on the SOW trashcan deletes nothing and opens the window');
  ok(/SOW 1589/.test(txt()) && /Alternate — fewer cameras/.test(txt()) && /\$48,250\.50/.test(txt()),
    'the window names the SOW: number, name, project total');
  ok(/3 line items are on this SOW\. 2 are on no other SOW and will be left with no SOW\./.test(txt()),
    'it counts the line items on the SOW and the ones on no other SOW');
  ok(/cannot be undone/.test(txt()), 'it says the delete cannot be undone');
  ok(!dialog().querySelector('[data-scw-sdc-ack]'), 'a SOW with no survey, bids or proposal needs no extra tick');
  ok(document.activeElement === keepBtn(), 'focus starts on "Keep it" (Enter keeps)');
  ok(/Yes, delete SOW 1589/.test(delBtn().textContent), 'the delete button names the SOW');

  // ── arming: the second half of a double-click does nothing ──
  ok(delBtn().disabled === true, 'the delete button is dead while the window arms');
  click(delBtn());
  click(dialog());                                   // click outside while arming
  ok(deleted.length === 0 && !!dialog(), 'a click on it — or outside — while arming leaves the window up and deletes nothing');
  await wait(60);
  ok(delBtn().disabled === false, 'it comes alive after the arming delay');

  // ── Keep it / Esc / outside ──
  click(keepBtn());
  ok(!dialog() && deleted.length === 0, '"Keep it" closes the window; the SOW stays');
  click(linkOf('view_3325', A));
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  ok(!dialog() && deleted.length === 0, 'Esc keeps the SOW');
  click(linkOf('view_3325', A));
  await wait(60);
  click(dialog());
  ok(!dialog() && deleted.length === 0, 'a click outside (once armed) keeps the SOW');

  // ── confirm: exactly one delete reaches Knack ──
  click(linkOf('view_3325', A));
  await wait(60);
  click(delBtn());
  ok(!dialog() && JSON.stringify(deleted) === JSON.stringify(['view_3325:' + A]), '"Yes, delete" lets exactly one click through to Knack');
  click(linkOf('view_3325', A));
  ok(deleted.length === 1 && !!dialog(), 'the pass is one-shot: the next click on the same trashcan asks again');
  click(keepBtn());

  // ── a SOW with a survey, bids and a published proposal: warnings + the tick ──
  click(linkOf('view_3325', B));
  ok(/SOW 1628/.test(txt()) && /survey has been requested/.test(txt()) && /2 bids are tied to it/.test(txt()) &&
     /published proposal: 60486704913-SW1628 \| 20261007-11977/.test(txt()) && /released to sales/.test(txt()),
    'a SOW with a survey, bids and a published proposal lists each of them');
  ok(/2 line items are on this SOW\. 1 is on no other SOW/.test(txt()), '… and its own line item counts');
  const ack = dialog().querySelector('[data-scw-sdc-ack]');
  await wait(60);
  ok(!!ack && delBtn().disabled === true, 'its delete button stays dead until "I understand" is ticked');
  click(delBtn());
  ok(deleted.length === 1, '… and a click on it deletes nothing');
  ack.checked = true; ack.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok(delBtn().disabled === false, 'ticking it enables the button');

  // ── the grid re-rendered while the window was open: the CURRENT link is clicked ──
  const tr = linkOf('view_3325', B).closest('tr');
  const fresh = tr.cloneNode(true);
  tr.parentNode.replaceChild(fresh, tr);
  click(delBtn());
  ok(deleted.length === 2 && deleted[1] === 'view_3325:' + B && !dialog(), 'after a re-render the row\'s current link is the one clicked');

  // ── the row is gone at confirm time: nothing is deleted, the window says so ──
  click(linkOf('view_3325', A));
  await wait(60);
  const gone = linkOf('view_3325', A).closest('tr');
  gone.parentNode.removeChild(gone);
  click(delBtn());
  ok(deleted.length === 2 && !!dialog() && /no longer in the list\. Nothing was deleted/.test(txt()) && delBtn().disabled === true,
    'a SOW that left the list meanwhile is not deleted; the window says so');
  click(keepBtn());

  // ── a second click never stacks two windows ──
  click(linkOf('view_3325', B));
  click(linkOf('view_3325', B));
  ok(document.querySelectorAll('.scw-sdc-overlay').length === 1, 'two clicks open one window');
  click(keepBtn());

  // ── other grids are untouched ──
  click(linkOf('view_9000', C));
  ok(!dialog() && deleted[deleted.length - 1] === 'view_9000:' + C, 'a delete link in a grid that is not configured goes straight to Knack as before');

  // ── no line-item grid on the page: no line about line items ──
  delete window.Knack.views.view_3962;
  click(linkOf('view_3325', B));
  ok(!/line item/.test(txt()), 'with no line-item grid on the page the window makes no claim about line items');
  click(keepBtn());

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
