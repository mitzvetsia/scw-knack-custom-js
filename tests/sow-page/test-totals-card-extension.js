// jsdom test: the sales Totals panel's Published Proposal block carries the quote-extension state
// (2026-11-06, "an extension request pending shows on the reconcile page but not on the sales build
// page"). scene_1116 renders the published proposal twice: published-proposal-sow-card.js's card
// (collapsed, at the very bottom of the page) already called SCW.quoteExtension.decorateSalesCard;
// the Totals panel (scene-tweaks.js injectProposalInfo) — where sales looks — did not. Drives the real
// scene-tweaks.js + quote-extension.js + published-quote-info.js: the pending state (SOW field_3314 =
// Requested, field_3315 the date) renders inside .scw-totals-proposal, left-aligned, between the
// block and the Preview Proposal row; the ready state shows the button; a re-render never doubles it;
// a login the preview list excludes sees the panel exactly as before.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const SOW = '6a465ad1bb00d991572419dd', PROP = '6a4ab0e1cc2d7f0a3c111111';
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#sales/scope-of-work-details/' + SOW + '/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.sessionStorage = window.sessionStorage; global.localStorage = window.localStorage;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, a, b) { const fn = typeof a === 'function' ? a : b; (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
let user = { name: 'Danny Mize', email: 'danny@getscw.com' };
window.Knack = { views: {}, router: { current_scene_key: 'scene_1116' }, getUserAttributes() { return user; } };
global.Knack = window.Knack;
const renders = {};
let hook = 'https://hook.us1.make.com/qext';
window.SCW = { CONFIG: { get MAKE_QUOTE_EXTENSION_WEBHOOK() { return hook; } },
  onViewRender(view, fn) { (renders[view] = renders[view] || []).push(fn); }, onSceneRender() {}, debug() {},
  knackAjax() { return {}; },
  projectId: { resolve() { return { id: '60486704913', source: 'derived' }; } },
  salesCR: { sowDisplayLabel() { return '1589'; } } };
global.SCW = window.SCW;
// build.sh order: scene-tweaks.js loads long before quote-extension.js — the decorator is looked up at
// render time, so the order here is the bundle's.
for (const f of ['scene-tweaks.js', 'published-quote-info.js', 'quote-extension.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const qx = window.SCW.quoteExtension;
qx.CONFIG.previewEmails = [];                              // the launch switch (the hook) for most of the file
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (sel, root) => (root || document).querySelector(sel);
const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function salesPage(expDate, extraSow) {
  document.body.innerHTML =
    '<div id="kn-scene_1116">' +
      '<div class="kn-view kn-details" id="view_3418"></div>' +
      '<div class="view-column"><div class="kn-view kn-details" id="view_3827"></div></div>' +
      '<div class="kn-view kn-table" id="view_3814"><table><tbody><tr id="' + PROP + '">' +
        '<td class="field_2658">Published</td><td class="field_2665">20261009-12028</td><td class="field_2659">' + expDate + '</td>' +
        '<td class="field_2681"><a href="https://files/x.pdf">x.pdf</a></td><td class="field_2908">https://tok</td></tr></tbody></table></div>' +
    '</div>';
  window.Knack.views = {
    view_3827: { model: { attributes: Object.assign({ id: SOW }, extraSow || {}) } },
    view_3814: { model: { data: { models: [{ attributes: { id: PROP, field_2658: 'Published', field_2658_raw: 'Published', field_2665: '20261009-12028', field_2659: expDate,
      field_2659_raw: { date_formatted: expDate, date: expDate }, field_2681: '<a href="https://files/x.pdf">x.pdf</a>', field_2908: 'https://tok' } }] } } }
  };
}
// scene-tweaks binds its debounced totals builder to view_3418 / view_3814 / view_3827 (300 ms).
async function renderTotals() { (renders.view_3418 || []).forEach(fn => fn()); await sleep(400); }
const panel = () => q('#view_3418 .scw-totals-custom .scw-totals-proposal');
const box = () => q('.scw-totals-proposal .scw-qext');
const future = (() => { const d = new Date(); d.setDate(d.getDate() + 20); return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear(); })();

(async () => {
  // ── pending: the SOW record says Requested + a date ──
  salesPage(future, { field_3314: 'Requested', field_3315: '01/04/2027' });
  await renderTotals();
  check('the Totals panel renders its Published Proposal block', [!!panel(), txt(q('.scw-pq-info', panel())).indexOf('Published Proposal') !== -1], [true, true]);
  check('the pending extension box is INSIDE the Totals panel, read off the SOW record', [!!box(), box() && box().getAttribute('data-scw-qext'), txt(q('.scw-qext__line', box())), txt(q('.scw-qext__line.scw-qext__muted', box()))], [true, 'pending', 'Extension to 01/04/2027', 'Awaiting SVS']);
  check('it carries Cancel request | Nudge', [!!q('[data-qext-cancel-req]', box()), !!q('[data-qext-nudge]', box())], [true, true]);
  const kids = Array.from(panel().children);
  check('it sits between the proposal block and the Preview Proposal row', [kids.indexOf(q('.scw-pq-info', panel())) < kids.indexOf(box()), kids.indexOf(box()) < kids.indexOf(q('a[href^="#proposals/proposal/"]', panel()).parentNode)], [true, true]);
  check('the left-align rule for the right-aligned panel is in the injected css', /\.scw-totals-proposal \.scw-qext \{ text-align: left/.test(q('#scw-qext-css') ? q('#scw-qext-css').textContent : (document.head.textContent || '')), true);
  // ── a second render never doubles the box ──
  await renderTotals();
  check('a re-render leaves exactly one panel and one box', [qa('#view_3418 .scw-totals-proposal').length, qa('.scw-totals-proposal .scw-qext').length], [1, 1]);
  // ── held (Re-Price Requested) ──
  salesPage(future, { field_3314: 'Re-Price Requested', field_3315: '01/04/2027' });
  await renderTotals();
  check('a held re-price shows read-only in the panel', [box() && box().getAttribute('data-scw-qext'), /Re-price requested/.test(txt(box())), !!q('button', box())], ['reprice-requested', true, false]);
  // ── nothing requested: the Request extension button ──
  salesPage(future, { field_3314: '' });
  await renderTotals();
  check('with nothing pending the panel offers "Request extension"', [box() && box().getAttribute('data-scw-qext'), txt(q('[data-qext-request]', box()))], ['ready', 'Request extension']);
  // ── switched off (no hook): the panel is exactly as before ──
  hook = 'PLACEHOLDER';
  salesPage(future, { field_3314: 'Requested', field_3315: '01/04/2027' });
  await renderTotals();
  check('with the feature off the panel has its block and preview link and no extension box', [!!q('.scw-pq-info', panel()), !!q('a[href^="#proposals/proposal/"]', panel()), !!box()], [true, true, false]);
  // ── the preview list: only the listed login sees it ──
  hook = 'https://hook.us1.make.com/qext';
  qx.CONFIG.previewEmails = ['micah.shearer@getscw.com'];
  salesPage(future, { field_3314: 'Requested', field_3315: '01/04/2027' });
  await renderTotals();
  check('a login the preview list excludes sees no box', !!box(), false);
  user = { name: 'Micah Shearer', email: 'Micah.Shearer@getscw.com' };
  salesPage(future, { field_3314: 'Requested', field_3315: '01/04/2027' });
  await renderTotals();
  check('the listed login sees the pending box in the Totals panel', box() && box().getAttribute('data-scw-qext'), 'pending');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);   // scene-tweaks.js arms a veil watchdog setInterval
})().catch(e => { console.error(e); process.exit(1); });
