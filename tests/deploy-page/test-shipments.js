// jsdom smoke test: shipments-tray.js — the Installation tile's compact shipments line and the
// drawer behind it. Field keys are DISCOVERED off view_4163's own headers (the live labels are
// used here verbatim), OMS facts are read-only, an unknown status falls through to a neutral chip,
// "Missing in OMS" is surfaced, stale data outranks every other headline, and "Re-check shipments"
// POSTs the project + SOWs + acceptances + the shipments we already hold.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/6aa43526d15c143d30214121/deploy/6aa43526d15c143d30214121/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
const ajaxCalls = [];
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {};
jq.ajax = function (o) {
  ajaxCalls.push({ url: o.url, type: o.type, payload: JSON.parse(o.data) });
  const d = { done(fn) { if (!/fail/.test(o.url)) fn({ success: true }); return d; }, fail(fn) { if (/fail/.test(o.url)) fn({ status: 500 }); return d; } };
  return d;
};
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

// The LIVE view_4163 columns (field_3281…field_3305), labels verbatim from the Builder.
const COLS = [
  ['field_3281', 'SHIP_order no'], ['field_3282', 'SYS_oms order id'], ['field_3283', 'SYS_oms url'],
  ['field_3284', 'SHIP_source'], ['field_3285', 'SHIP_sync state'], ['field_3286', 'SYS_last synced'],
  ['field_3287', 'OMS_order date'], ['field_3288', 'OMS_order status'], ['field_3289', 'OMS_ship to name'],
  ['field_3290', 'SHIP_status'], ['field_3291', 'SHIP_carrier'], ['field_3292', 'SHIP_tracking no'],
  ['field_3293', 'SHIP_tracking url'], ['field_3294', 'SHIP_ship date'], ['field_3295', 'SHIP_delivered date'],
  ['field_3296', 'SHIP_address street'], ['field_3297', 'SHIP_address city'], ['field_3298', 'SHIP_address state'],
  ['field_3299', 'SHIP_address zip'], ['field_3300', 'Record ID'], ['field_3301', 'Created By'],
  ['field_3302', 'Updated By'], ['field_3303', 'Owned By'], ['field_3304', 'CORE_projects'],
  ['field_3305', 'INSTALL_acceptances']
];
const DAY = 86400000;
const iso = ms => new Date(ms).toISOString();
const dateRaw = ms => ({ date: new Date(ms).toLocaleDateString('en-US'), iso_timestamp: iso(ms) });
const now = Date.now();
const models = recs => ({ model: { data: { models: recs.map(a => ({ attributes: a })) } }, fetched: 0 });
function shipRec(o) {
  return Object.assign({
    id: o.id, field_3281: o.orderNo || '', field_3282: o.omsId || '', field_3283_raw: o.omsUrl ? { url: o.omsUrl } : null,
    field_3284: o.source || 'Auto', field_3285: o.sync || 'Linked',
    field_3286_raw: o.synced == null ? null : dateRaw(o.synced),
    field_3287_raw: o.orderDate == null ? null : dateRaw(o.orderDate), field_3288: o.orderStatus || '',
    field_3289: o.shipTo || '', field_3290: o.status || '', field_3291: o.carrier || '',
    field_3292: o.tracking || '', field_3293_raw: o.trackUrl ? { url: o.trackUrl } : null,
    field_3294_raw: o.shipDate == null ? null : dateRaw(o.shipDate),
    field_3295_raw: o.delivered == null ? null : dateRaw(o.delivered),
    field_3296: o.street || '', field_3297: o.city || '', field_3298: o.state || '', field_3299: o.zip || ''
  });
}
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' } }; global.Knack = window.Knack;
let opened = null;
window.SCW = { CONFIG: { MAKE_SHIPMENTS_RESYNC_WEBHOOK: 'https://hook.example/ships' }, debug() {},
  deployNav: { openPanel(o) { opened = o; o.el.classList.add('scw-deploy-drawer__custom'); document.body.appendChild(o.el); return true; } } };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/shipments-tray.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

function scene(recs) {
  document.body.innerHTML = '<div id="kn-scene_1311">' +
    '<div class="kn-table kn-view" id="view_4163"><table><thead><tr>' +
      COLS.map(([k, label]) => '<th class="' + k + '"><span class="table-fixed-label"><a class="kn-sort"><span>' + label + '</span></a></span></th>').join('') +
    '</tr></thead><tbody></tbody></table></div>' +
    '<div class="kn-table kn-view" id="view_4161"></div><div class="kn-table kn-view" id="view_3914"></div>' +
  '</div>';
  window.Knack.views.view_4163 = models(recs);
  // SOW ID carries the left side alone; the acceptance's proposal identifier carries the full
  // reference ShipEdge holds: "<project no>-SW<sow no> | <quote no>". SW1454 appears BOTH ways —
  // as an accepted proposal and as a SOW — so the dedupe and the two forms are both exercised.
  window.Knack.views.view_4161 = models([
    { id: 'sow1', field_2122: '62489857827-SW1454' },
    { id: 'sow2', field_2122: '62489857827-SW1455' },
    { id: 'sow3', field_2122: '' }                        // nothing to build a reference from
  ]);
  window.Knack.views.view_3914 = models([
    { id: 'acc1', field_2755_raw: [{ id: 'p1', identifier: '62489857827-SW1454 | 20260910-11567' }], field_2766: 'Yes' },
    { id: 'acc2', field_2755_raw: [{ id: 'p2', identifier: '62489857827-SW1456 | 20260921-11690' }], field_2766: 'No' }
  ]);
}
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '\n      got= ' + JSON.stringify(got) + '\n      want=' + JSON.stringify(want)));
}
const api = window.SCW.shipments;
const lineText = () => {
  const d = document.createElement('div'); d.innerHTML = api.tileLine();
  const t = d.querySelector('.scw-ships-text');
  return t ? t.textContent : '';
};
const lineTone = () => {
  const d = document.createElement('div'); d.innerHTML = api.tileLine();
  const dot = d.querySelector('.scw-ships-dot');
  return dot ? dot.className.replace('scw-ships-dot scw-ships-dot--', '') : '';
};

// ── Field discovery ────────────────────────────────────────────────
scene([]);
check('field keys are discovered off the view\'s own headers, by label — including the four address parts, the project and the acceptance link',
  (() => { const f = api.fields(); return [f.orderNo, f.omsId, f.omsUrl, f.source, f.syncState, f.lastSynced, f.orderDate, f.orderStatus, f.shipToName, f.shipStatus, f.carrier, f.trackingNo, f.trackingUrl, f.shipDate, f.deliveredDate, f.street, f.city, f.state, f.zip, f.project, f.acceptance, f.eta, f.orderTotal]; })(),
  ['field_3281', 'field_3282', 'field_3283', 'field_3284', 'field_3285', 'field_3286', 'field_3287', 'field_3288', 'field_3289', 'field_3290', 'field_3291', 'field_3292', 'field_3293', 'field_3294', 'field_3295', 'field_3296', 'field_3297', 'field_3298', 'field_3299', 'field_3304', 'field_3305', undefined, undefined]);

// ── Tile line ──────────────────────────────────────────────────────
check('no shipments yet reads as a plain fact, not a problem', [lineText(), lineTone()], ['No shipments on this project yet', 'none']);

scene([
  shipRec({ id: 's1', orderNo: 'SO-1001', status: 'Delivered', synced: now - 3600000, delivered: now - 2 * DAY }),
  shipRec({ id: 's2', orderNo: 'SO-1002', status: 'In Transit', synced: now - 3600000, shipDate: now - DAY, carrier: 'UPS', tracking: '1Z999', trackUrl: 'https://ups/1Z999' })
]);
check('fresh + in transit: leads with what is moving and when it shipped (no ETA field on this view, so no arrival is implied)',
  [lineText(), lineTone()], ['1 in transit · last shipped ' + new Date(now - DAY).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · 1 delivered', 'go']);

scene([shipRec({ id: 's1', orderNo: 'SO-1001', status: 'Delivered', synced: now - 3600000, delivered: now - DAY })]);
check('everything landed', [lineText(), lineTone()], ['All 1 shipment delivered', 'ok']);

scene([
  shipRec({ id: 's1', orderNo: 'SO-1001', status: 'In Transit', synced: now - 5 * DAY, shipDate: now - 6 * DAY }),
  shipRec({ id: 's2', orderNo: 'SO-1002', status: 'Delivered', synced: now - 2 * 3600000, delivered: now - DAY })
]);
check('STALE OUTRANKS EVERYTHING: the oldest stamp is judged, and the line says the status may be out of date rather than reporting it as fact',
  [lineText(), lineTone()], ['2 shipments · not synced since 5 days ago — status may be out of date', 'warn']);

scene([
  shipRec({ id: 's1', orderNo: 'SO-1001', status: 'In Transit', sync: 'Missing in OMS', synced: now - 3600000, shipDate: now - DAY }),
  shipRec({ id: 's2', orderNo: 'SO-1002', status: 'Delivered', synced: now - 3600000, delivered: now - DAY })
]);
check('a record whose OMS order no longer resolves is surfaced on the tile, not hidden', [lineText(), lineTone()], ['1 order missing in the OMS', 'warn']);

// ── Drawer ─────────────────────────────────────────────────────────
scene([
  shipRec({ id: 's1', orderNo: 'SO-1001', omsId: 'OMS-1', omsUrl: 'https://oms/1', status: 'Delivered', synced: now - 3600000,
            delivered: now - 2 * DAY, shipDate: now - 5 * DAY, carrier: 'UPS', tracking: '1Z001', trackUrl: 'https://ups/1Z001',
            orderDate: now - 9 * DAY, orderStatus: 'Complete', shipTo: 'Ed Haman', street: '12 Main St', city: 'Durham', state: 'NC', zip: '27701' }),
  shipRec({ id: 's2', orderNo: 'SO-1002', omsId: 'OMS-2', status: 'Rolling down a hill', synced: now - 3600000, shipDate: now - DAY, carrier: 'FedEx', tracking: '77', sync: 'Missing in OMS' }),
  shipRec({ id: 's3', orderNo: 'SO-1003', omsId: 'OMS-3', status: '', orderStatus: 'Processing', synced: now - 3600000 })
]);
api.open();
const tray = opened && opened.el;
check('open() puts the tray in the deploy drawer, titled and tagged for the drawer to clear',
  [opened && opened.title, opened && opened.eyebrow, tray && tray.classList.contains('scw-deploy-drawer__custom')],
  ['Shipments', '3 · Installation', true]);
check('the drawer leads with freshness and the re-check button',
  [tray.querySelector('.scw-ships__freshness').textContent, !!tray.querySelector('[data-scw-ships-resync]'), tray.querySelector('.scw-ships__stalebanner') === null],
  ['Last synced 1 hour ago', true, true]);
check('counts: total, delivered, in transit, not shipped, and the missing-in-OMS warning',
  [...tray.querySelectorAll('.scw-ships__counts span')].map(s => s.textContent),
  ['3shipments', '1delivered', '1in transit', '1not shipped', '1missing in OMS']);
const cards = [...tray.querySelectorAll('.scw-ships__card')];
check('rows: in transit first, delivered last; each leads with when it lands / landed',
  cards.map(c => [c.querySelector('.scw-ships__order').textContent, c.querySelector('.scw-ships__when').textContent]),
  [['SO-1002', 'Shipped ' + new Date(now - DAY).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · no ETA from the carrier'],
   ['SO-1003', 'Not shipped yet'],
   ['SO-1001', 'Delivered ' + new Date(now - 2 * DAY).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })]]);
check('AN UNKNOWN OMS STATUS IS SHOWN VERBATIM ON A NEUTRAL CHIP — the vocabulary is open, never assumed closed',
  [api.tone('Rolling down a hill'), api.tone('Delivered'), api.tone('In Transit'), api.tone('Exception'), api.tone(''),
   [...cards[0].querySelectorAll('.scw-ships__chip')].map(c => c.className.replace('scw-ships__chip scw-ships__chip--', '') + ':' + c.textContent)],
  ['neutral', 'ok', 'go', 'warn', 'none', ['neutral:Rolling down a hill', 'warn:Missing in OMS']]);
check('carrier + tracking sit on the row as a link; order administration hides behind a disclosure',
  [cards[2].querySelector('.scw-ships__meta').textContent, cards[2].querySelector('.scw-ships__more summary').textContent,
   [...cards[2].querySelectorAll('.scw-ships__dl dt')].map(d => d.textContent)],
  ['UPS · 1Z001 ›', 'Order details',
   ['Order no', 'Order date', 'Order status', 'Ship to', 'Address', 'Source', 'Sync state', 'Last synced', 'In the OMS']]);
check('the four address parts compose into one line', cards[2].querySelector('.scw-ships__dl dd:nth-of-type(5)').textContent, '12 Main St · Durham, NC 27701');
check('NOTHING IS EDITABLE — the OMS owns these facts; the only controls are the re-check button and the disclosures',
  [tray.querySelectorAll('input, select, textarea, [contenteditable]').length,
   [...tray.querySelectorAll('button')].map(b => b.getAttribute('data-scw-ships-resync') ? 'resync' : b.tagName)],
  [0, ['resync']]);
check('with no ETA column the drawer says so once, instead of implying an arrival date',
  /No estimated-delivery field is published/.test(tray.textContent), true);

// ── Staleness in the drawer ────────────────────────────────────────
scene([shipRec({ id: 's1', orderNo: 'SO-1001', status: 'In Transit', synced: now - 4 * DAY, shipDate: now - 5 * DAY })]);
api.open();
const stale = opened.el;
check('stale: the banner leads, the freshness reads as a warning, and only one tray is ever in the page',
  [/last sync, not from the OMS right now/.test(stale.querySelector('.scw-ships__stalebanner').textContent),
   stale.querySelector('.scw-ships__freshness').classList.contains('is-stale'), document.querySelectorAll('.scw-ships').length],
  [true, true, 1]);

// ── Re-check ───────────────────────────────────────────────────────
scene([
  shipRec({ id: 's1', orderNo: 'SO-1001', omsId: 'OMS-1', status: 'Delivered', synced: now - 3600000, delivered: now - DAY }),
  shipRec({ id: 's2', orderNo: 'SO-1002', omsId: 'OMS-2', status: 'In Transit', sync: 'Missing in OMS', synced: now - 3600000 })
]);
check('the re-check payload carries everything the page knows: the project, its SOWs, its acceptances, and the shipments we already hold',
  (() => { const p = api.resyncPayload(); return [p.project_recordID, p.source, p.sows.map(x => x.sowId), p.acceptances.map(x => x.id + ':' + x.signed), p.shipments.map(s => [s.id, s.orderNo, s.omsOrderId, s.syncState])]; })(),
  ['6aa43526d15c143d30214121', 'deploy-page',
   ['62489857827-SW1454', '62489857827-SW1455', ''],
   ['acc1:true', 'acc2:false'],
   [['s1', 'SO-1001', 'OMS-1', 'Linked'], ['s2', 'SO-1002', 'OMS-2', 'Missing in OMS']]]);
// ShipEdge has no contains filter on reference_number, so the page constructs the exact strings.
check('a reference parses into its parts, and the left side alone parses too; anything not reference-shaped is dropped',
  [api.parseReference('62489857827-SW1454 | 20260910-11567'), api.parseReference('62489857827-SW1454'),
   api.parseReference('SW1454'), api.parseReference(''), api.parseReference('  62489857827-SW1454  |  20260910-11567  ')],
  [{ reference: '62489857827-SW1454 | 20260910-11567', sowRef: '62489857827-SW1454', projectNo: '62489857827', sow: 'SW1454', quote: '20260910-11567' },
   { reference: '62489857827-SW1454', sowRef: '62489857827-SW1454', projectNo: '62489857827', sow: 'SW1454', quote: '' },
   null, null,
   { reference: '62489857827-SW1454 | 20260910-11567', sowRef: '62489857827-SW1454', projectNo: '62489857827', sow: 'SW1454', quote: '20260910-11567' }]);
check('references: the accepted proposals\' full strings first (they know the quote), then the SOW-only forms, deduped, each naming where it came from',
  api.resyncPayload().references,
  [{ reference: '62489857827-SW1454 | 20260910-11567', sowRef: '62489857827-SW1454', projectNo: '62489857827', sow: 'SW1454', quote: '20260910-11567', acceptanceId: 'acc1', signed: true },
   { reference: '62489857827-SW1456 | 20260921-11690', sowRef: '62489857827-SW1456', projectNo: '62489857827', sow: 'SW1456', quote: '20260921-11690', acceptanceId: 'acc2', signed: false },
   { reference: '62489857827-SW1454', sowRef: '62489857827-SW1454', projectNo: '62489857827', sow: 'SW1454', quote: '', sowRecordId: 'sow1' },
   { reference: '62489857827-SW1455', sowRef: '62489857827-SW1455', projectNo: '62489857827', sow: 'SW1455', quote: '', sowRecordId: 'sow2' }]);
check('the project number rides at the top level — the one needle for a contains pass when an exact lookup cannot be used',
  api.resyncPayload().projectNo, '62489857827');
api.open();
const t2 = opened.el;
const btn = t2.querySelector('[data-scw-ships-resync]');
ajaxCalls.length = 0;
btn.click();
check('the button POSTs that payload and reports back',
  [ajaxCalls.length, ajaxCalls[0].url, ajaxCalls[0].type, ajaxCalls[0].payload.shipments.length, btn.textContent, btn.classList.contains('is-done')],
  [1, 'https://hook.example/ships', 'POST', 2, 'Re-check requested', true]);
window.SCW.CONFIG.MAKE_SHIPMENTS_RESYNC_WEBHOOK = 'PLACEHOLDER';
api.open();
const t3 = opened.el, btn3 = t3.querySelector('[data-scw-ships-resync]');
ajaxCalls.length = 0;
btn3.click();
check('an unconfigured webhook fires nothing and says so, rather than failing silently',
  [ajaxCalls.length, btn3.textContent, btn3.classList.contains('is-err')], [0, 'Re-check not configured', true]);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
