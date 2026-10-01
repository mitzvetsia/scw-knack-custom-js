// jsdom smoke test: on the CO drafting scene's removal panel (view_4086) an accessory can be
// flagged for removal ON ITS OWN from the expanded card's Mounting Hardware chip — a labelled
// REMOVE button (the row chip's bare "×" went unnoticed), the drafted state struck through with
// an "on this CO" tag, a signed-CO-removed chip left alone, and the webhook targeting ONLY the
// accessory's install record (the device stays).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const CO_ID = '69aaaaaaaaaaaaaaaaaaaaaa';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#change-orders/view-co/' + CO_ID });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
window.alert = function () {}; global.alert = window.alert;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1362' } }; global.Knack = window.Knack;

const CAM = '6481e5ba38f283002898113c';
const conn = (id, identifier) => [{ id, identifier }];
const device  = { id: 'dev1', field_2790: 'Informant 8.0 v5', field_2802: 'I-03', field_2789: 1,
                  field_2822_raw: conn(CAM, 'Camera / Reader'), field_2791_raw: conn('p1', 'Informant 8.0 v5') };
const live    = { id: 'acc-live', field_2790: 'Electrical Box Mount', field_2789: 1, field_2853_raw: conn('dev1', 'I-03') };
const drafted = { id: 'acc-drafted', field_2790: 'Pole Adapter', field_2789: 1, field_2853_raw: conn('dev1', 'I-03') };
const signed  = { id: 'acc-signed', field_2790: 'Old Wall Mount', field_2789: 1, field_2853_raw: conn('dev1', 'I-03'),
                  field_2967_raw: conn('co0', 'Old Wall Mount') };
const installRecords = [device, live, drafted, signed];
// The CO worksheet already carries ONE Remove line targeting acc-drafted (field_2966).
const coLines = [{ id: 'line1', field_2965: 'Remove', field_2966_raw: conn('acc-drafted', 'Pole Adapter') }];

const rendered = {};
const fetchCalls = [];
window.SCW = {
  CONFIG: { MAKE_CO_REMOVE_ITEMS_WEBHOOK: 'https://hook.example/remove' },
  worksheetV2: {
    data: {
      readRecords(vk) { return vk === 'view_4086' ? installRecords : (vk === 'view_4079' ? coLines : []); },
      subscribe() {},
      subscribeRendered(vk, fn) { rendered[vk] = fn; }
    },
    confirmModal() { return Promise.resolve(true); }
  },
  debug() {}, onViewRender() {}, onSceneRender() {}
};
global.SCW = window.SCW;
window.fetch = function (url, opts) {
  fetchCalls.push(JSON.parse(opts.body));
  return Promise.resolve({ ok: true, text() { return Promise.resolve('{"success":true}'); } });
};
global.fetch = window.fetch;

for (const f of ['config.js', 'card.js', 'co-remove.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;

const container = document.createElement('div');
container.className = 'scw-ws-v2 scw-ws-v2--readonly';
container.id = 'scw-ws-v2-view_4086';
document.body.appendChild(container);
container.appendChild(ns.card.buildCard(device, 'view_4086'));

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const wrapOf = id => container.querySelector('.scw-ws-v2-mh-chip-wrap[data-scw-ws-v2-acc-chip="' + id + '"]');
const flagged = w => w.classList.contains('scw-co-remove-acc-chip--flagged');
const tagOf = w => (w.querySelector('.scw-co-remove-acc-tag') || { textContent: '' }).textContent;
const btnOf = w => w.querySelector('.scw-co-remove-acc-x--detail');

check('card.js stamps each detail chip with the accessory install id',
  ['acc-live', 'acc-drafted', 'acc-signed'].map(id => !!wrapOf(id)), [true, true, true]);
check('co-remove subscribed to the removal panel render', typeof rendered.view_4086, 'function');
rendered.view_4086();

const wLive = wrapOf('acc-live'), wDrafted = wrapOf('acc-drafted'), wSigned = wrapOf('acc-signed');
check('live accessory: a labelled REMOVE button on the detail chip, not flagged',
  [!!btnOf(wLive), btnOf(wLive) && btnOf(wLive).textContent, flagged(wLive)], [true, 'Remove', false]);
check('the button names the accessory and the view',
  [btnOf(wLive).getAttribute('data-scw-co-remove-acc'), btnOf(wLive).getAttribute('data-scw-co-remove-acc-label'),
   btnOf(wLive).getAttribute('data-scw-co-remove-view')], ['acc-live', 'Electrical Box Mount', 'view_4086']);
check('accessory already targeted by a CO Remove line: struck + "on this CO", no button',
  [flagged(wDrafted), tagOf(wDrafted), !!btnOf(wDrafted)], [true, 'on this CO', false]);
check('accessory removed by a SIGNED CO: left to card.js — no button, no drafted state',
  [!!btnOf(wSigned), flagged(wSigned), wSigned.classList.contains('scw-ws-v2-mh-chip-wrap--removed')], [false, false, true]);
check('the row summary chips still carry their own per-accessory control',
  !!container.querySelector('.scw-co-remove-accs .scw-co-remove-acc-x[data-scw-co-remove-acc="acc-live"]'), true);

rendered.view_4086();   // decorate again — must not duplicate controls
check('decorate is idempotent on the detail chip',
  [wLive.querySelectorAll('.scw-co-remove-acc-x').length, wDrafted.querySelectorAll('.scw-co-remove-acc-tag').length], [1, 1]);

// Click REMOVE on the live accessory → confirm → webhook → optimistic flip.
btnOf(wLive).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
setTimeout(() => {
  check('the webhook gets ONLY the accessory as the acted-on item — the device stays',
    fetchCalls.map(b => [b.changeOrderId, b.installItemIds, b.accessoryInstallItemIds, b.items]),
    [[CO_ID, ['acc-live'], [], [{ id: 'acc-live', accessoryIds: [] }]]]);
  check('after the ACK the detail chip flips to the drafted state',
    [flagged(wLive), tagOf(wLive), !!btnOf(wLive)], [true, 'on this CO', false]);
  check('…and so does the row chip',
    !!container.querySelector('.scw-co-remove-acc-chip--flagged[data-scw-co-remove-acc-chip="acc-live"]:not(.scw-ws-v2-mh-chip-wrap)'), true);
  check('the device row itself is NOT flagged',
    !!container.querySelector('.scw-ws-v2-card[data-scw-ws-v2-record="dev1"].scw-co-remove-card--flagged'), false);
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
}, 50);
