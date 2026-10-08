// jsdom smoke test: sow-add-item-form.js — the custom "Add to Scope of Work" modal that replaces
// the DTO add forms. Gated to ALLOWED_EMAILS; renders the DTO forms' per-bucket field suite; posts
// ONE payload to SCW.CONFIG.MAKE_SOW_ADD_ITEMS_WEBHOOK carrying readable keys AND the DTO record's
// shape (field_XXXX_raw = [{id, identifier}]) so the remapped 02.01 scenario reads it unchanged.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PID = '6a286df9cccc376ebd6e5525', SOW = '69dd0f8333dbe73a5cdfc652', SOW2 = '69ea62103a04f2f006dde85c';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/' + PID + '/build-sow/' + SOW });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

const NVR = '6481e5ba38f283002898aaaa', CAM = '6481e5ba38f283002898bbbb', MDF1 = '6abd0251e5d0b1ca628ebb94', MDF2 = '6abd0286c3e527b8ea5499ef';
const B_NET = '647953bb54b4e1002931ed97', B_CAM = '6481e5ba38f283002898113c';
let email = 'Micah.Shearer@getscw.com';
window.Knack = {
  router: { current_scene_key: 'scene_1085' },
  getUserAttributes() { return email ? { id: 'u1', name: { first: 'Micah', last: 'S' }, email } : null; },
  views: {
    view_3962: { model: { data: { models: [
      { attributes: { id: 'li1', field_1949_raw: [{ id: CAM, identifier: 'Cam' }], field_2154_raw: [{ id: SOW, identifier: 'SW-1001' }] } },
      { attributes: { id: 'li2', field_1949_raw: [{ id: NVR, identifier: 'NVR' }], field_2154_raw: [{ id: SOW, identifier: 'SW-1001' }, { id: SOW2, identifier: 'SW-1060' }] } }
    ] } } },
    view_3577: { model: { data: { models: [
      { attributes: { id: MDF1, field_1642_raw: 'HEADEND: behind cashregister' } },
      { attributes: { id: MDF2, field_1642_raw: 'IDF: 01: Guard Shack' } }
    ] } } }
  }
};
global.Knack = window.Knack;
window.SCW = {
  CONFIG: { MAKE_SOW_ADD_ITEMS_WEBHOOK: 'PLACEHOLDER' }, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  productMap: { [NVR]: { name: 'Imperial 256 Channel 4K NVR - IMP256' }, [CAM]: { name: 'Vista Dome 4MP' } },
  productBucketMap: { [NVR]: [B_NET], [CAM]: [B_CAM] },
  mountingBoxProducts: []
};
global.SCW = window.SCW;
const posts = [];
global.fetch = window.fetch = (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); return Promise.resolve({ ok: true, text: () => Promise.resolve('{"success":true}') }); };

for (const f of ['config.js', 'sow-add-item-form.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', 'fetch',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW, global.fetch);
}
const form = window.SCW.worksheetV2.sowAddForm;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const q = s => document.querySelector(s), qa = s => Array.from(document.querySelectorAll(s));
const texts = s => qa(s).map(e => e.textContent.trim());

// Gate
check('gate: the allowed user (case-insensitive) sees the button', form.isAllowed('view_3962'), true);
email = 'someone@getscw.com';
check('gate: another user does not', form.isAllowed('view_3962'), false);
email = '';
check('gate: no identity → not allowed', form.isAllowed('view_3962'), false);
form.open({ viewKey: 'view_3962' });
check('open() refuses for a user outside the gate', !!q('.scw-sowadd'), false);
email = 'micah.shearer@getscw.com';

// Open → bucket chips + SOW row (two SOWs known from the worksheet rows; the page SOW pre-checked)
form.open({ viewKey: 'view_3962' });
check('the seven DTO buckets render as chips, in DTO order', texts('.scw-sowadd__chip'),
  ['Camera or Reader', 'Networking or Headend', 'Other Equipment', 'Other Services', 'Assumptions', 'Materials', 'License']);
check('SOW row: page SOW first and pre-checked, the other SOW on the worksheet offered',
  [texts('.scw-sowadd__check').slice(0, 2), qa('.scw-sowadd__check input').map(i => i.checked)],
  [['SW-1001 (this page)', 'SW-1060'], [true, false]]);

// Networking bucket → the DTO form's field suite for that bucket
q('.scw-sowadd__chip[data-bucket="' + B_NET + '"]').click();
check('Networking: product, optional accessories, qty (per MDF/IDF wording) and the mandatory MDF multi-select, in that order',
  texts('.scw-sowadd__lbl').slice(2),
  ['Product', 'Optional accessories', 'How many do you want to add to EACH MDF/IDF selected below?', 'Which MDF or IDFs will this item go in? *']);
check('product single/multi per bucket: camera + networking single, other equipment + license multi',
  ['camera', 'networking', 'otherEquipment', 'license'].map(k => !!form.BUCKETS.find(b => b.id === form.BUCKET_KEYS[k]).productMulti), [false, false, true, true]);
check('sales page (view_3586) offers only the "allow sales to add" buckets, in the DTO dropdown\'s order',
  form.bucketsFor('view_3586').map(b => b.name), ['Networking or Headend', 'Other Equipment', 'Camera or Reader', 'License']);
check('build-SOW page (view_3962) offers every bucket', form.bucketsFor('view_3962').length, 7);
// Sales page: no SOW choice even when the rows carry several SOWs — the page's SOW is implicit.
window.Knack.views.view_3586 = window.Knack.views.view_3962;
form.open({ viewKey: 'view_3586' });
const sales = qa('.scw-sowadd').pop();
check('sales page (view_3586): four bucket chips and NO "Which SOW(s)" row',
  [sales.querySelectorAll('.scw-sowadd__chip').length, sales.querySelectorAll('.scw-sowadd__checks').length], [4, 0]);
sales.querySelector('[data-act="cancel"]').click();
check('ops page keeps its SOW row (plus the Networking MDF group)',
  [texts('.scw-sowadd__lbl').includes('Which SOW(s) are you adding to? *'), q('.scw-sowadd').querySelectorAll('.scw-sowadd__checks').length], [true, 2]);
check('product list is filtered to the bucket (NVR only — the camera is not offered)', texts('.scw-sowadd__opt'), ['Imperial 256 Channel 4K NVR - IMP256']);
const mdfGroup = () => qa('.scw-sowadd__checks').pop();   // the SOW group is first, the MDF group last
check('MDF/IDF locations come from the scene\'s locations grid', Array.from(mdfGroup().querySelectorAll('.scw-sowadd__check')).map(e => e.textContent.trim()),
  ['HEADEND: behind cashregister', 'IDF: 01: Guard Shack']);

// Validation + unconfigured webhook
q('[data-act="submit"]').click();
check('validation: a product is required first', q('.scw-sowadd__err').textContent, 'Pick a product.');
q('.scw-sowadd__opt').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
q('[data-act="submit"]').click();
check('validation: a mandatory MDF/IDF is required', q('.scw-sowadd__err').textContent, 'Pick at least one MDF / IDF.');
const mdfBox = mdfGroup().querySelectorAll('input')[1]; mdfBox.checked = true; mdfBox.dispatchEvent(new window.Event('change', { bubbles: true }));
q('[data-f="qty"]').value = '2';
q('[data-act="submit"]').click();
check('an unconfigured webhook is reported, nothing is sent', [q('.scw-sowadd__err').textContent, posts.length],
  ['Add-item webhook is not configured yet (SCW.CONFIG.MAKE_SOW_ADD_ITEMS_WEBHOOK).', 0]);

// Configured → ONE POST, readable keys + DTO mirror
window.SCW.CONFIG.MAKE_SOW_ADD_ITEMS_WEBHOOK = 'https://hook.us1.make.com/rrypzupolck7mbov3gmiv8hbvnw5lns4';
q('[data-act="submit"]').click();
setTimeout(() => {
  const p = posts[0] && posts[0].body;
  check('one POST to the configured webhook', [posts.length, posts[0] && posts[0].url], [1, 'https://hook.us1.make.com/rrypzupolck7mbov3gmiv8hbvnw5lns4']);
  check('readable keys: SOW(s), project, bucket, product, MDF, qty, origin',
    [p.sowId, p.sowIds, p.projectId, p.bucketId, p.bucketName, p.productIds, p.mdfIds, p.qty, p.origin, p.originView, p.triggeredBy.email],
    [SOW, [SOW], PID, B_NET, 'Networking or Headend', [NVR], [MDF2], '2', 'ops', 'view_3962', 'micah.shearer@getscw.com']);
  check('DTO mirror: bucket/SOW/product/MDF connections in Knack _raw shape under the bucket\'s DTO field keys',
    [p.field_2223_raw, p.field_2182_raw, p.field_2194_raw, p.field_2180_raw, p.field_2181_raw],
    [[{ id: B_NET, identifier: 'Networking or Headend' }], [{ id: SOW, identifier: 'SW-1001' }],
     [{ id: NVR, identifier: 'Imperial 256 Channel 4K NVR - IMP256' }], [{ id: MDF2, identifier: 'IDF: 01: Guard Shack' }], [{ id: PID, identifier: '' }]]);
  check('DTO mirror: keys this bucket does not use are EMPTY arrays (the scenario merges them)',
    [p.field_2193_raw, p.field_2195_raw, p.field_2224_raw, p.field_2248_raw, p.field_2913_raw, p.field_2211_raw, p.field_2250_raw, p.field_2206_raw, p.field_2241_raw, p.field_2187_raw],
    [[], [], [], [], [], [], [], [], [], []]);
  check('DTO mirror: plain inputs as number raw + formatted text, flags as booleans + Yes/No',
    [p.field_2183_raw, p.field_2183, p.field_2184_raw, p.field_2233_raw, p.field_2462_raw, p.field_2462, p.field_2739_raw, p.field_2740_raw, p.field_2210, p.field_2466],
    [2, '2', null, null, false, 'No', false, false, '', '']);
  check('the modal closed after the accepted POST', !!q('.scw-sowadd'), false);
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
}, 50);
