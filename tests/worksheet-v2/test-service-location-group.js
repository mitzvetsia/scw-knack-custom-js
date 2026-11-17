// A service WITH an MDF/IDF sits in that MDF/IDF; only a service with none is "Project Wide Services"
// (2026-11-17 — "worksheets are supposed to show under their MDF/IDF if they have one"). The worksheet
// (worksheet-v2/groups.js) has always done this — and so does the reconcile grid (bid-review-v2/transform.js
// groupRows: `r.mdfIdf || syntheticL1ForBucket(...)`, not exported, so not driven here); a note in the
// add-item form and in CLAUDE.md said the opposite, and the Create Alternate SOW window followed the note
// (its own test: tests/sow-page/test-alternate-sow-labels.js). This pins the worksheet's rule. A license
// still goes to "Licenses" whatever MDF/IDF it carries.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://x.knack.com/app#page' });
const { window } = dom;
global.window = window; global.document = window.document;
window.SCW = { worksheetV2: {}, CONFIG: {}, debug() {} };
global.SCW = window.SCW;
window.Knack = { views: {} }; global.Knack = window.Knack;
const load = (rel) => new Function('window', 'document', 'SCW', 'Knack',
  fs.readFileSync(path.join(__dirname, '../../src/features/' + rel), 'utf8'))(window, window.document, window.SCW, window.Knack);
load('worksheet-v2/groups.js');

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

const SVC = '6977caa7f246edf67b52cbcd', LIC = '645554dce6f3a60028362a6a';
const mdf = [{ id: 'm1', identifier: 'IDF: 01: East wing' }];
const recs = [
  { id: 'cam1', field_1946_raw: mdf, field_2219_raw: [{ id: 'cam', identifier: 'Camera or Reader' }], field_2218: 1 },
  { id: 'svcLocated', field_1946_raw: mdf, field_2219_raw: [{ id: SVC, identifier: 'Other Services' }], field_2218: 9 },
  { id: 'svcWide', field_1946_raw: [], field_2219_raw: [{ id: SVC, identifier: 'Other Services' }], field_2218: 9 },
  { id: 'licLocated', field_1946_raw: mdf, field_2219_raw: [{ id: LIC, identifier: 'License' }], field_2218: 12 }
];
const tree = window.SCW.worksheetV2.groups.buildGroupTree(recs, [], {});
const shape = tree.map(l1 => [l1.label, [].concat.apply([], l1.l2.map(l2 => l2.records.map(r => r.id))).sort()]);
check('worksheet: the located service sits in its MDF/IDF beside the camera; the one with none is project wide; the license has its own group',
  shape,
  [['IDF: 01: East wing', ['cam1', 'svcLocated']], ['Project Wide Services', ['svcWide']], ['Licenses', ['licLocated']]]);
check('worksheet: the MDF/IDF group is a real group, Project Wide Services a synthetic one',
  tree.map(l1 => !!l1.isSynthetic), [false, true, true]);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
