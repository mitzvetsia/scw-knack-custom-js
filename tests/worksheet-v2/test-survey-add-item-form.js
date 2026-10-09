// jsdom smoke test: sow-add-item-form.js in SURVEY mode — the sub survey / bid worksheet (view_3505,
// scene_1140) runs the same modal with the survey DTO form's (view_3627) per-bucket rules
// (bucket-field-visibility_add-survey-bid-item.js), the page's survey request as the target, a bid(s)
// row from the BIDs grid (view_3507), and ONE payload to SCW.CONFIG.MAKE_SURVEY_ADD_ITEMS_WEBHOOK that
// mirrors the survey DTO record (field_2426 request · field_2427 bids · field_2432 notes · field_2233
// labor bid …) so the re-triggered Make 05.01 scenario reads it unchanged. While that URL is a
// PLACEHOLDER the view's requireWebhook keeps the toolbar on the native Knack add link.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const REQ = '6a1f0c2b7e4d9a3c5b8e1f20', PID = '6a286df9cccc376ebd6e5525';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#subcontractor-portal/site-survey-request-details/' + REQ });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

const NVR = '6481e5ba38f283002898aaaa', CAM = '6481e5ba38f283002898bbbb', LIC = '6481e5ba38f283002898cccc', MAT = '6481e5ba38f283002898dddd',
      OTH = '6481e5ba38f283002898eeee', ACC = '6481e5ba38f283002898ffff', STDA = '697b7a023a31502ec68b3399', CUSTOM = '69ce7098172caa5786d3767d';
const MDF1 = '6abd0251e5d0b1ca628ebb94', MDF2 = '6abd0286c3e527b8ea5499ef', BID1 = '6a2c0001000000000000b1d1', BID2 = '6a2c0001000000000000b1d2';
const B_CAM = '6481e5ba38f283002898113c', B_NET = '647953bb54b4e1002931ed97', B_OTH = '5df12ce036f91b0015404d78', B_SVC = '6977caa7f246edf67b52cbcd',
      B_ASM = '697b7a023a31502ec68b3303', B_MATL = '6a14eee134e422f3769ada00', B_LIC = '645554dce6f3a60028362a6a';
const PREFIX_E = '697c23e95fcd43d578c31963';
let email = 'aaron@sub.example';   // a subcontractor — NOT on the preview list
window.Knack = {
  router: { current_scene_key: 'scene_1140' },
  getUserAttributes() { return { id: 'u9', name: { first: 'Aaron', last: 'M' }, email }; },
  views: {
    // the survey request details view (project through the request, field_2346)
    view_3825: { model: { attributes: { id: REQ, field_2346_raw: [{ id: PID, identifier: 'Project X' }] } } },
    view_3505: { model: { data: { models: [
      { attributes: { id: 's1', field_2627_raw: [{ id: CAM, identifier: 'Vista Dome 4MP' }], field_2415_raw: [{ id: BID1, identifier: '141' }], field_2360_raw: [{ id: REQ, identifier: '60524852230-SR1145' }] } },
      { attributes: { id: 's2', field_2627_raw: [{ id: NVR, identifier: 'NVR' }], field_2415_raw: [{ id: BID2, identifier: '93' }], field_2360_raw: [{ id: REQ, identifier: '60524852230-SR1145' }] } }
    ] } } },
    view_3507: { model: { data: { models: [
      { attributes: { id: BID1, field_2414: '141', field_2636: 'White Storage Shelf' } },
      { attributes: { id: BID2, field_2414: '93', field_2636: 'Parking lot' } }
    ] } } },
    view_3617: { model: { data: { models: [
      { attributes: { id: MDF1, field_1642_raw: 'HEADEND: behind cashregister' } },
      { attributes: { id: MDF2, field_1642_raw: 'IDF: 01: Guard Shack' } }
    ] } } }
  }
};
global.Knack = window.Knack;
window.SCW = {
  CONFIG: { MAKE_SOW_ADD_ITEMS_WEBHOOK: 'https://hook.us1.make.com/rrypzupolck7mbov3gmiv8hbvnw5lns4', MAKE_SURVEY_ADD_ITEMS_WEBHOOK: 'PLACEHOLDER' },
  worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  productMap: {
    [NVR]: { name: 'Imperial 256 Channel 4K NVR - IMP256' }, [CAM]: { name: 'Vista Dome 4MP' }, [LIC]: { name: 'Cloud license 1yr' },
    [MAT]: { name: 'Cat6 plenum 1000ft' }, [OTH]: { name: 'Monitor 27in' }, [STDA]: { name: 'Standard assumption' }, [CUSTOM]: { name: 'Custom Assumption' }
  },
  productBucketMap: { [NVR]: [B_NET], [CAM]: [B_CAM], [LIC]: [B_LIC], [MAT]: [B_MATL], [OTH]: [B_OTH], [STDA]: [B_ASM], [CUSTOM]: [B_ASM] },
  mountingBoxProducts: [{ id: ACC, name: 'Anchor kit', compatibleProducts: [MAT] }]
};
global.SCW = window.SCW;
const posts = [];
global.fetch = window.fetch = (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); return Promise.resolve({ ok: true, text: () => Promise.resolve('{"success":true}') }); };

for (const f of ['config.js', 'sow-add-item-form.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', 'fetch',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW, global.fetch);
}
// the worksheet's active bid filter pill (sow-filter.js) — bid 141 selected
window.SCW.worksheetV2.sowFilter = { loadActive: vk => (vk === 'view_3505' ? [BID1] : []) };
const form = window.SCW.worksheetV2.sowAddForm;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const q = s => document.querySelector(s), qa = s => Array.from(document.querySelectorAll(s));
const texts = s => qa(s).map(e => e.textContent.trim());
const md = el => el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
const chip = id => q('.scw-sowadd__chip[data-bucket="' + id + '"]').click();
const fieldLabels = () => texts('.scw-sowadd__lbl').slice(2);   // after the item-type question + the bid row

// Config + gate
check('view_3505 runs survey mode: survey webhook key, requireWebhook, bids from view_3507, MDFs from the survey locations grid, preview list',
  (o => [o.mode, o.webhookKey, o.requireWebhook, o.bidViews, o.mdfView, o.mdfLabelField, o.previewEmails])(form.modalOpts('view_3505')),
  ['survey', 'MAKE_SURVEY_ADD_ITEMS_WEBHOOK', true, ['view_3507'], 'view_3617', 'field_1642', ['micah.shearer@getscw.com']]);
check('SOW views are untouched by the survey mode (no preview list)', (o => [o.mode, o.webhookKey, o.requireWebhook, o.previewEmails])(form.modalOpts('view_3962')), ['sow', 'MAKE_SOW_ADD_ITEMS_WEBHOOK', false, []]);
check('preview gate: a user outside previewEmails is NOT allowed (webhook set or not) — the native button is all they see; SOW views unaffected',
  [form.isPreview('view_3505'), form.isAllowed('view_3505'), form.isAllowed('view_3962'), form.webhookUrl('view_3505')], [true, false, true, '']);
form.open({ viewKey: 'view_3505' });
check('open() refuses for the non-preview user', !!q('.scw-sowadd'), false);
window.SCW.CONFIG.MAKE_SURVEY_ADD_ITEMS_WEBHOOK = 'https://hook.us1.make.com/survey-add-items';
check('still refused with the webhook configured — the preview list decides', form.isAllowed('view_3505'), false);
email = 'Micah.Shearer@getscw.com';   // the preview user (case-insensitive)
window.SCW.CONFIG.MAKE_SURVEY_ADD_ITEMS_WEBHOOK = 'PLACEHOLDER';
check('the preview user is allowed even before the webhook is configured (so the form can be reviewed); the toolbar title names the surface',
  [form.isAllowed('view_3505'), form.buttonTitle('view_3505'), form.buttonTitle('view_3962')], [true, 'Add survey / bid items', 'Add line items to the Scope of Work']);
form.open({ viewKey: 'view_3505' });
check('preview user: the modal opens with a Preview pill', [!!q('.scw-sowadd'), q('.scw-sowadd__beta') && q('.scw-sowadd__beta').textContent], [true, 'Preview']);
q('[data-act="cancel"]').click();
window.SCW.CONFIG.MAKE_SURVEY_ADD_ITEMS_WEBHOOK = 'https://hook.us1.make.com/survey-add-items';
check('the survey suite keeps the seven DTO buckets (same ids, different field suites)',
  [form.bucketsFor('view_3505').map(b => b.name), form.bucketsFor('view_3505') === form.bucketsFor('view_3962')],
  [['Camera or Reader', 'Networking or Headend', 'Other Equipment', 'Other Services', 'Assumptions', 'Materials', 'License'], false]);
check('bids come from the BIDs grid: worksheet label (bid number) + friendly name, numeric order',
  form.bidCandidates('view_3505').map(c => c.name), ['93 — Parking lot', '141 — White Storage Shelf']);

// Open → survey chrome, bid row (active filter pre-checked), no SOW row
form.open({ viewKey: 'view_3505' });
check('survey chrome: title, submit label, item-type question', [q('.scw-sowadd__title').textContent, q('[data-act="submit"]').textContent, q('.scw-sowadd__lbl').textContent],
  ['Add Survey / Bid Item', 'Add to survey', 'What type of item are you adding to the survey?']);
check('bid row: "Which bid(s) is this item on?" with every bid, the active filter pill (141) pre-checked; no "Which SOW(s)" row',
  [texts('.scw-sowadd__lbl')[1], texts('.scw-sowadd__check'), qa('.scw-sowadd__check input').map(i => i.checked), texts('.scw-sowadd__lbl').some(t => /Which SOW/.test(t))],
  ['Which bid(s) is this item on?', ['93 — Parking lot', '141 — White Storage Shelf'], [false, true], false]);
check('product-first list spans the survey buckets (bucket-labelled)', texts('.scw-sowadd__opt').length, 7);

// view_3627 rules, bucket by bucket
chip(B_CAM);
check('Camera or Reader: product · MDF single (mandatory) · qty · pre-fix · start # · cabling flags · survey notes · labor bid — NO accessories, NO camera notes',
  fieldLabels(), ['Product', 'Cabling for these cameras will route back to which MDF or IDF? *', 'How many cameras or readers do you want to add?', 'Label pre-fix',
    'What number should we start the camera label numbers on?', 'Cabling', 'Survey notes', 'Labor bid ($ each)']);
check('camera: the three cabling toggles; labor helper says blank = product default', [qa('.scw-sowadd__tog').length, q('[data-f="serviceCost"]').previousElementSibling.textContent.indexOf('default labor rate') !== -1], [3, true]);
chip(B_NET);
check('Networking or Headend: product · qty per MDF · MDF multi (mandatory) · labor bid · survey notes',
  fieldLabels(), ['Product', 'How many do you want to add to EACH MDF/IDF selected below?', 'Which MDF or IDFs will this item go in? *', 'Labor bid ($ each)', 'Survey notes']);
chip(B_OTH);
check('Other Equipment: products (multi) · qty · MDF optional · labor bid · survey notes',
  fieldLabels(), ['Products', 'Quantity', 'MDF / IDF (optional)', 'Labor bid ($ each)', 'Survey notes']);
chip(B_SVC);
check('Other Services (product-less): description · labor bid · qty · MDF optional · survey notes',
  fieldLabels(), ['Service description', 'Labor bid ($)', 'Quantity', 'MDF / IDF (optional)', 'Survey notes']);
chip(B_ASM);
check('Assumptions: assumption(s) · custom detail (hidden until Custom Assumption) · MDF optional · survey notes',
  [fieldLabels(), q('[data-cond="customAssumption"]').style.display], [['Assumption(s)', 'Detail custom assumption', 'MDF / IDF (optional)', 'Survey notes'], 'none']);
md(qa('.scw-sowadd__opt').find(o => o.textContent.trim() === 'Custom Assumption'));
check('picking "Custom Assumption" reveals the detail field', q('[data-cond="customAssumption"]').style.display, '');
chip(B_MATL);
check('Materials: products · optional accessories (the only survey bucket with field_2206) · MDF optional · survey notes',
  fieldLabels(), ['Products', 'Optional accessories', 'MDF / IDF (optional)', 'Survey notes']);
chip(B_LIC);
check('License: products + qty only — no MDF, no notes, no labor bid (the bid row is the only check group)',
  [fieldLabels(), qa('.scw-sowadd__checks').length, !!q('[data-f="notes"]'), !!q('[data-f="serviceCost"]')], [['Products', 'Quantity'], 1, false, false]);

// Camera flow → validation → ONE POST mirroring the survey DTO record
chip(B_CAM);
q('[data-act="submit"]').click();
check('validation: a product first', q('.scw-sowadd__err').textContent, 'Pick a product.');
md(q('.scw-sowadd__opt'));
q('[data-act="submit"]').click();
check('validation: the camera MDF/IDF is mandatory', q('.scw-sowadd__err').textContent, 'Pick at least one MDF / IDF.');
const mdfBox = qa('.scw-sowadd__checks').pop().querySelectorAll('input')[1]; mdfBox.checked = true; mdfBox.dispatchEvent(new window.Event('change', { bubbles: true }));
q('[data-f="qty"]').value = '2'; q('[data-f="prefix"]').value = PREFIX_E; q('[data-f="startNumber"]').value = '12';
q('[data-f="existingCabling"]').checked = true; q('[data-f="notes"]').value = 'Ceiling tiles loose';
q('[data-act="submit"]').click();
setTimeout(() => {
  const p = posts[0] && posts[0].body;
  check('one POST to the SURVEY webhook', [posts.length, posts[0] && posts[0].url], [1, 'https://hook.us1.make.com/survey-add-items']);
  check('readable keys: the page\'s survey request (+ identifier from the rows), bids, project through the request, sub origin, no SOW',
    [p.surveyRequestId, p.surveyRequest, p.bidIds, p.projectId, p.sowId, p.sowIds, p.origin, p.originView, p.originScene, p.bucketId, p.productIds, p.mdfIds, p.qty, p.prefix, p.startNumber, p.laborBid, p.surveyNotes],
    [REQ, '60524852230-SR1145', [BID1], PID, '', [], 'sub', 'view_3505', 'scene_1140', B_CAM, [CAM], [MDF2], '2', 'E-', '12', '', 'Ceiling tiles loose']);
  check('survey DTO mirror: request (formatted + raw — the 05.01 "is connected to a Survey" gate), bids, bucket, MDF single, product, unified product, project, NO SOW',
    [p.field_2426, p.field_2426_raw, p.field_2427_raw, p.field_2223_raw, p.field_2211_raw, p.field_2193_raw, p.field_2246_raw, p.field_2181_raw, p.field_2182_raw],
    ['60524852230-SR1145', [{ id: REQ, identifier: '60524852230-SR1145' }], [{ id: BID1, identifier: '141' }], [{ id: B_CAM, identifier: 'Camera or Reader' }],
     [{ id: MDF2, identifier: 'IDF: 01: Guard Shack' }], [{ id: CAM, identifier: 'Vista Dome 4MP' }], [{ id: CAM, identifier: 'Vista Dome 4MP' }], [{ id: PID, identifier: '' }], []]);
  check('survey DTO mirror: qty / start # / labor (null = product default) / pre-fix (connection + legacy text) / flags / SURVEY notes (field_2432, not field_2466)',
    [p.field_2183_raw, p.field_2184_raw, p.field_2233_raw, p.field_2241_raw, p.field_2185, p.field_2462_raw, p.field_2462, p.field_2739_raw, p.field_2432, 'field_2466' in p, p.field_2180_raw, p.field_2250_raw, p.field_2206_raw],
    [2, 12, null, [{ id: PREFIX_E, identifier: 'E-' }], 'E-', true, 'Yes', false, 'Ceiling tiles loose', false, [], [], []]);
  check('the modal closed after the accepted POST', !!q('.scw-sowadd'), false);

  // Service flow: description required; labor + qty carried as the DTO's field_2233 / field_2183; no product keys
  form.open({ viewKey: 'view_3505' });
  chip(B_SVC);
  q('[data-act="submit"]').click();
  check('service: the description defines the line', q('.scw-sowadd__err').textContent, 'Enter a description — it defines this line item.');
  q('[data-f="description"]').value = 'Lift rental'; q('[data-f="serviceCost"]').value = '450'; q('[data-f="notes"]').value = 'Two days';
  // un-check the pre-checked bid → an item on the survey only
  const bidBox = qa('.scw-sowadd__checks')[0].querySelectorAll('input')[1]; bidBox.checked = false; bidBox.dispatchEvent(new window.Event('change', { bubbles: true }));
  q('[data-act="submit"]').click();
  setTimeout(() => {
    const s = posts[1] && posts[1].body;
    check('service POST: product-less bucket, description + labor + notes, no bids (survey only), MDF optional left empty',
      [posts.length, s.bucketId, s.productIds, s.field_2210, s.field_2233_raw, s.field_2183_raw, s.field_2432, s.bidIds, s.field_2427_raw, s.field_2250_raw, s.field_2193_raw, s.field_2246_raw],
      [2, B_SVC, [], 'Lift rental', 450, 1, 'Two days', [], [], [], [], []]);
    console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
    process.exit(fails ? 1 : 0);
  }, 50);
}, 50);
