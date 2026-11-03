// jsdom test: Create Alternate SOW window — rows with no label (2026-11-03, "I think these are services or
// assumptions coming through 'unlabelled'"). field_1950 is a device designator; services and licenses usually
// have none, so eight lines read "(unlabelled)" under "No MDF / IDF". Now a row is named by its label, else its
// product, else its service description, else its bucket; services file under "Project Wide Services" and
// licenses under "Licenses" (the worksheet's own groups), after the MDF/IDFs and "No MDF / IDF"; a bucket NAMED
// Assumptions is left out like the assumptions bucket id; a line with no product has no model dropdown (one
// would preselect the bucket's first product) and the review names it. Payload: every carried line is linked.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#sales/scope-of-work-details/s0000000000000000000000a/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;

const READER = 'a1000000000000000000000a', HUB = 'a3000000000000000000000a';
const ONBOARD = 'a6000000000000000000000a', CLOUD = 'a7000000000000000000000a', SVC2 = 'a8000000000000000000000a';
const B_READ = 'b1000000000000000000000b', B_HEAD = 'b2000000000000000000000b';
const B_SVC = '6977caa7f246edf67b52cbcd', B_LIC = '645554dce6f3a60028362a6a', B_ASM2 = 'b9000000000000000000000b';
const MDF = 'c1000000000000000000000c';
const BUCKET_NAME = { [B_READ]: 'Readers', [B_HEAD]: 'Headend', [B_SVC]: 'Other Services', [B_LIC]: 'License',
  [B_ASM2]: 'Assumptions' };
let n = 0;
function li({ label = '', product = null, productName = '', bucket, mdf = null, desc = '' }) {
  n++;
  const id = 'ab' + String(n).padStart(22, '0');
  const a = { id, field_1950: label, field_1950_raw: label,
    field_1949_raw: product ? [{ id: product, identifier: productName }] : [],
    field_2219_raw: [{ id: bucket, identifier: BUCKET_NAME[bucket] }],
    field_1946_raw: mdf ? [{ id: mdf, identifier: 'HEADEND: 2nd Floor (Main) MDF' }] : [],
    field_2020: desc, field_2020_raw: desc };
  return { attributes: a };
}
const recs = [
  li({ label: 'AC-001', product: READER, productName: 'Avigilon Alta Smart Door Reader Dual Freq', bucket: B_READ, mdf: MDF }),
  // A described service: no label, no product, an MDF/IDF on it all the same.
  li({ bucket: B_SVC, mdf: MDF, desc: '<p>Programming and commissioning of the<br>access control system &amp; cloud portal</p>' }),
  // A productized service, no label.
  li({ product: ONBOARD, productName: 'Onboarding fee', bucket: B_SVC }),
  li({ product: SVC2, productName: 'Site walk', bucket: B_SVC }),
  // A license with a product, no label, on an MDF/IDF.
  li({ product: CLOUD, productName: 'Avigilon Alta Cloud License 1yr', bucket: B_LIC, mdf: MDF }),
  // A device with no label and no MDF/IDF.
  li({ product: HUB, productName: 'Avigilon Alta 8 Door Hub', bucket: B_HEAD }),
  // An assumption under a bucket whose id is not the assumptions id but whose name is.
  li({ product: null, bucket: B_ASM2, desc: 'Customer provides power at each door' })
];
const ids = recs.map(r => r.attributes.id);

window.Knack = {
  views: {
    view_3586: { model: { data: { models: recs } } },
    view_3827: { model: { attributes: { id: 'd0000000000000000000000d', field_2122: '60486704913-SW1980',
      field_2126: 'Access control', field_1199_raw: [{ id: 'x', identifier: 'Install' }] } } }
  },
  getUserAttributes() { return { id: 'u1', name: 'Micah', email: 'm@example.com' }; }
};
global.Knack = window.Knack;
const posts = [];
window.fetch = (url, opts) => { posts.push({ url, body: JSON.parse(opts.body) });
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"success":true,"newSowUrl":"#sales/scope-of-work-details/new/"}') }); };
global.fetch = window.fetch;
window.SCW = {
  CONFIG: { MAKE_DUPLICATE_SOW_WEBHOOK: 'https://hook.example/dup' }, debug() {},
  onViewRender() {}, onSceneRender() {},
  productMap: {
    [READER]: { name: 'Avigilon Alta Smart Door Reader Dual Freq', buckets: [B_READ] },
    [HUB]: { name: 'Avigilon Alta 8 Door Hub', buckets: [B_HEAD] },
    [ONBOARD]: { name: 'Onboarding fee', buckets: [B_SVC] },
    [SVC2]: { name: 'Site walk', buckets: [B_SVC] },
    [CLOUD]: { name: 'Avigilon Alta Cloud License 1yr', buckets: [B_LIC] }
  }
};
global.SCW = window.SCW;
const alerts = []; window.alert = global.alert = (m) => { alerts.push(m); };
new Function('window', 'document', '$', 'Knack', 'SCW', 'fetch',
  fs.readFileSync(path.join(__dirname, '../../src/features/create-sow-option-btn.js'), 'utf8'))(
  window, document, jq, window.Knack, window.SCW, window.fetch);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const $1 = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const row = id => $1('[data-alt-row="' + id + '"]');
const nameOf = id => [txt(row(id).querySelector('[data-alt-kind]')), txt(row(id).querySelector('[data-alt-name]'))];

(async () => {
  window.SCW.createAltSow.open(null);

  check('no row reads "(unlabelled)"', /unlabelled/i.test(txt($1('[data-alt-body]'))), false);
  check('groups: the MDF/IDF, then No MDF / IDF, then Project Wide Services, then Licenses',
    $$('[data-alt-grp]').map(txt),
    ['HEADEND: 2nd Floor (Main) MDF', 'No MDF / IDF', 'Project Wide Services', 'Licenses']);
  check('each group holds what it says: the services leave the MDF/IDF (sorted by name), the license too',
    $$('.scw-alt-sow-rows').map(w => [...w.querySelectorAll('[data-alt-row]')].map(r => ids.indexOf(r.getAttribute('data-alt-row')))),
    [[0], [5], [2, 1, 3], [4]]);
  check('rows are named: label, else product, else the service description (tags stripped, entities read), with a kind tag',
    [nameOf(ids[0]), nameOf(ids[1]), nameOf(ids[2]), nameOf(ids[4]), nameOf(ids[5])],
    [['', 'AC-001'],
     ['Service', 'Programming and commissioning of the access control system & cloud portal'],
     ['Service', 'Onboarding fee'],
     ['License', 'Avigilon Alta Cloud License 1yr'],
     ['Headend', 'Avigilon Alta 8 Door Hub']]);
  check('a bucket named Assumptions is left out like the assumptions bucket', row(ids[6]), null);
  check('the counters count the six listed lines', ['shared', 'copy', 'off'].map(k => txt($1('[data-alt-n-' + k + ']'))),
    ['6', '0', '0']);

  $1('[data-alt-go]').click();
  check('step 2: the described service has no model dropdown, the productized one does',
    [!!row(ids[1]).querySelector('select'), txt(row(ids[1]).querySelector('[data-alt-nomodel]')),
     !!row(ids[2]).querySelector('select'), row(ids[2]).querySelector('select').value],
    [false, 'No product', true, ONBOARD]);
  check('step 2 swap list: the line pickers name services by product, not "(unlabelled)"',
    /unlabelled/i.test(txt($1('[data-alt-swapcard]'))), false);

  $1('[data-alt-go]').click();
  const shared = $$('.scw-alt-sow-rv--shared .scw-alt-sow-rv-row').map(r => txt(r.querySelector('.m')));
  check('step 3 names the line with no product', shared.indexOf('Services with no product') !== -1, true);
  check('nothing is "(no model)"', /no model\)/.test(txt($1('[data-alt-review]'))), false);

  $1('[data-alt-go]').click();
  await new Promise(r => setTimeout(r, 20));
  const p = posts[0] && posts[0].body;
  check('every listed line is linked, the described service included; nothing cloned',
    [p && p.linkIds.slice().sort(), p && p.cloneItems],
    [ids.slice(0, 6).slice().sort(), []]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
