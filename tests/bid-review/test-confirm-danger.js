// jsdom smoke test: bid-review/confirm.js — the "Are you SURE!?!" dialog in front of the
// reconcile page's destructive-leaning actions (first user: the always-visible Unlink pill
// on the Documents tiles, 2026-10-12). Cancel / Escape / backdrop click close it and nothing
// runs; OK runs the action once, hands it close(), and disables itself.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
window.SCW = { bidReview: {} }; global.SCW = window.SCW;
new Function('window', 'document',
  fs.readFileSync(path.join(__dirname, '../../src/features/bid-review/confirm.js'), 'utf8'))(window, document);
const ns = window.SCW.bidReview;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const bd = () => document.querySelector('.scw-bid-review-confirm-backdrop');
const q = sel => bd() && bd().querySelector(sel);
let calls = 0, closeFn = null;

ns.confirmDanger({ title: 'Are you SURE!?!', body: 'Unlink “bid 141.pdf” from this SOW?',
  detail: 'The file itself is not deleted.', okLabel: 'Unlink' }, close => { calls++; closeFn = close; });
check('opens with the title, the question, the detail, and Cancel | Unlink in that order',
  [q('.scw-bid-review-confirm__head').textContent, q('.scw-bid-review-confirm__body p').textContent,
   q('.scw-bid-review-confirm__detail').textContent,
   Array.from(bd().querySelectorAll('.scw-bid-review-confirm__foot button')).map(b => b.textContent)],
  ['Are you SURE!?!', 'Unlink “bid 141.pdf” from this SOW?', 'The file itself is not deleted.', ['Cancel', 'Unlink']]);
check('focus lands on Cancel, the safe default', document.activeElement === q('.scw-bid-review-confirm__cancel'), true);
check('one stylesheet, injected once', document.querySelectorAll('#scw-bid-review-confirm-css').length, 1);

q('.scw-bid-review-confirm__cancel').click();
check('Cancel closes it and nothing runs', [bd(), calls], [null, 0]);

ns.confirmDanger({ title: 't', body: 'b' }, () => { calls++; });
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
check('Escape closes it and nothing runs', [bd(), calls], [null, 0]);

ns.confirmDanger({ title: 't', body: 'b' }, () => { calls++; });
q('.scw-bid-review-confirm').click();
check('a click inside the dialog keeps it open', !!bd(), true);
bd().click();
check('a click on the backdrop closes it, nothing runs', [bd(), calls], [null, 0]);

ns.confirmDanger({ title: 't', body: 'b', okLabel: 'Unlink' }, close => { calls++; closeFn = close; });
const okBtn = q('.scw-bid-review-confirm__ok');
okBtn.click();
check('OK runs the action once, hands it close(), and disables itself',
  [calls, typeof closeFn, okBtn.disabled, okBtn.textContent], [1, 'function', true, 'Unlink…']);
closeFn();
check('close() removes the dialog', bd(), null);
check('a stale Escape after close is harmless', (document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })), bd()), null);

ns.confirmDanger({ title: 'a', body: 'b' }, () => {});
ns.confirmDanger({ title: 'c', body: 'd' }, () => {});
check('a second open replaces the first', [document.querySelectorAll('.scw-bid-review-confirm-backdrop').length, q('.scw-bid-review-confirm__head').textContent], [1, 'c']);
check('text is escaped, never markup', (ns.confirmDanger({ title: '<b>x</b>', body: 'a & b' }, () => {}), [q('.scw-bid-review-confirm__head').innerHTML, q('.scw-bid-review-confirm__body p').textContent]), ['&lt;b&gt;x&lt;/b&gt;', 'a & b']);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
