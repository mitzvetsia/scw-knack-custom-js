// jsdom smoke test: bucket-field-visibility_add-product.js — the Add Product form (view_466)
// shows only the fields whitelisted for the chosen equipment bucket. The Other Services bucket
// used to map to an EMPTY list, which hid every field but the bucket, so no service product
// could be created (found 2026-10-23 while productizing services). It now shows the service
// product's fields; SKU / source / default qty / the equipment-only flags stay hidden, and a
// field the module does not list (the sub-can-add flag) is never touched.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ALL = ['field_35','field_56','field_57','field_2021','field_133','field_146','field_2166','field_956','field_1926','field_2232',
  'field_2242','field_1562','field_2205','field_2236','field_974','field_2220','field_1655','field_1563','field_1841','field_74',
  'field_1667','field_1554','field_1582','field_1754','field_1755','field_1909','field_1928','field_1517','field_2075','field_2249'];
const B_SERVICE = '6977caa7f246edf67b52cbcd', B_MOUNT = '594a94536877675816984cb9', B_CAMERA = '6481e5ba38f283002898113c';
const inputs = ALL.concat(['field_2433']).map(k =>
  k === 'field_133'
    ? '<div class="kn-input" id="kn-input-field_133" data-input-id="field_133"><select id="view_466-field_133" name="field_133">' +
      '<option value=""></option><option value="' + B_SERVICE + '">Other Services</option><option value="' + B_MOUNT + '">Mounting Hardware</option>' +
      '<option value="' + B_CAMERA + '">Cameras</option></select></div>'
    : '<div class="kn-input" id="kn-input-' + k + '" data-input-id="' + k + '"><input name="' + k + '"></div>').join('');
const dom = new JSDOM('<!doctype html><html><body><div id="knack-dist"><div id="view_466" class="kn-view kn-form"><form>' + inputs +
  '</form></div></div></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#add-product', pretendToBeVisual: true });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
global.MutationObserver = window.MutationObserver; global.Element = window.Element;

// ── minimal jQuery: selectors, find/each/get/css/val, namespaced on/off, custom-event trigger ──
const docHandlers = [];   // { type, ns:Set, selector, fn }
function parseEv(name) { const p = name.split('.'); return { type: p[0], ns: new Set(p.slice(1)) }; }
function wrap(els) {
  const w = { length: els.length, _els: els };
  w.each = function (fn) { els.forEach((el, i) => fn.call(el, i, el)); return w; };
  w.find = function (sel) { const out = []; els.forEach(el => out.push(...el.querySelectorAll(sel))); return wrap(out); };
  w.get = function (i) { return els[i]; };
  w.css = function (prop, val) { els.forEach(el => { el.style[prop] = val; }); return w; };
  w.val = function () { return els.length ? els[0].value : undefined; };
  w.off = function (ev) {
    const { type, ns } = parseEv(ev);
    els.forEach(el => { (el.__h = el.__h || []).slice().forEach(h => {
      if (h.type === type && [...ns].every(n => h.ns.has(n))) { el.removeEventListener(type, h.fn); el.__h.splice(el.__h.indexOf(h), 1); } }); });
    return w;
  };
  w.on = function (ev, fn) {
    const { type, ns } = parseEv(ev);
    els.forEach(el => { (el.__h = el.__h || []).push({ type, ns, fn }); el.addEventListener(type, fn); });
    return w;
  };
  return w;
}
const docWrap = {
  length: 1,
  off(ev, selector) { const { type, ns } = parseEv(ev);
    for (let i = docHandlers.length - 1; i >= 0; i--) { const h = docHandlers[i];
      if (h.type === type && [...ns].every(n => h.ns.has(n)) && (selector === undefined || h.selector === selector)) docHandlers.splice(i, 1); }
    return docWrap; },
  on(ev, a, b) { const { type, ns } = parseEv(ev); docHandlers.push({ type, ns, selector: typeof a === 'string' ? a : undefined, fn: typeof a === 'function' ? a : b }); return docWrap; },
  trigger(ev) { const { type, ns } = parseEv(ev);
    docHandlers.filter(h => h.type === type && [...ns].every(n => h.ns.has(n)) && !h.selector).forEach(h => h.fn({ type })); return docWrap; }
};
function jq(a) {
  if (a === undefined || a === null) return wrap([]);
  if (a === document) return docWrap;
  if (typeof a === 'function') { a(); return docWrap; }
  if (typeof a === 'string') return wrap(Array.from(document.querySelectorAll(a)));
  if (a.nodeType) return wrap([a]);
  if (a._els) return a;
  return wrap([]);
}
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;

new Function('window', 'document', '$',
  fs.readFileSync(path.join(__dirname, '../../src/features/bucket-field-visibility_add-product.js'), 'utf8'))(window, document, jq);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const disp = k => document.getElementById('kn-input-' + k).style.display;
const visible = keys => keys.filter(k => disp(k) !== 'none');
const sel = document.getElementById('view_466-field_133');
function pick(id) { sel.value = id; sel.dispatchEvent(new window.Event('change', { bubbles: true })); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(30);   // the rAF recheck after boot
  check('boot, no bucket: only the bucket field shows', visible(ALL), ['field_133']);
  check('a field the module does not list (sub-can-add) is never touched', disp('field_2433'), '');

  pick(B_SERVICE);
  check('Other Services: the service product fields show — bucket, status, type, name, description, retail price, discount flag, default labor description, default sub bid, default install hours',
    visible(ALL), ['field_35', 'field_57', 'field_2021', 'field_133', 'field_146', 'field_2166', 'field_956', 'field_1562', 'field_1563', 'field_1517']);
  check('Other Services: SKU, source, default qty, map-connections, limit-to-qty-1 and the deliverables schema stay hidden',
    ['field_56', 'field_1926', 'field_74', 'field_2232', 'field_2242', 'field_2220'].map(disp), ['none', 'none', 'none', 'none', 'none', 'none']);
  check('…and the unlisted flag is still untouched', disp('field_2433'), '');

  pick(B_MOUNT);
  check('switching to Mounting Hardware folds the labor fields away and shows SKU / source again',
    [disp('field_2021'), disp('field_2166'), disp('field_56'), disp('field_1926')], ['none', 'none', '', '']);

  pick(B_SERVICE);
  jq(document).trigger('knack-view-render.view_466');
  await sleep(30);
  check('a Knack re-render re-applies the Services whitelist (idempotent)', visible(ALL).length, 10);

  pick('');
  check('clearing the bucket hides everything but the bucket again', visible(ALL), ['field_133']);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
