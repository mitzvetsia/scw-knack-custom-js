/*** BID REVIEW — DANGER CONFIRM MODAL ****************************************
 * ns.confirmDanger({ title, body, detail, okLabel, cancelLabel }, onOk)
 *
 * One small "Are you SURE!?!" dialog for the destructive-leaning actions on
 * the reconcile page (first user, 2026-10-12: unlinking a document from the
 * SOW, whose pill is now always on the tile). Cancel, Escape and a click on
 * the backdrop close it and nothing runs; OK disables itself and calls
 * onOk(close). Same look as photo-grid-manager's confirmDelete so the app
 * keeps one confirm. Button order per CLAUDE.md: Cancel | <the action>.
 * Returns the close function.
 ******************************************************************************/
(function () {
  'use strict';
  window.SCW = window.SCW || {};
  var ns = (window.SCW.bidReview = window.SCW.bidReview || {});
  var STYLE_ID = 'scw-bid-review-confirm-css';
  var CLS = 'scw-bid-review-confirm';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.' + CLS + '-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.55); z-index: 100000;',
      '  display: flex; align-items: center; justify-content: center; padding: 20px; }',
      '.' + CLS + ' { background: #fff; color: #0f172a; border-radius: 10px; max-width: 440px; width: 100%;',
      '  box-shadow: 0 20px 50px rgba(0,0,0,.35); font: 14px/1.4 system-ui, -apple-system, sans-serif; overflow: hidden; }',
      '.' + CLS + '__head { padding: 13px 18px; background: #9f1239; color: #fff; font-weight: 800; font-size: 15px; }',
      '.' + CLS + '__body { padding: 16px 18px; }',
      '.' + CLS + '__body p { margin: 0 0 8px; }',
      '.' + CLS + '__body p:last-child { margin-bottom: 0; }',
      '.' + CLS + '__detail { color: #475569; font-size: 12.5px; }',
      '.' + CLS + '__foot { padding: 12px 18px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 8px; background: #f8fafc; }',
      '.' + CLS + '__foot button { padding: 7px 14px; border-radius: 5px; font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer; border: 1px solid transparent; }',
      '.' + CLS + '__cancel { background: #fff; color: #475569; border-color: #cbd5e1 !important; }',
      '.' + CLS + '__cancel:hover { background: #f1f5f9; }',
      '.' + CLS + '__ok { background: #9f1239; color: #fff; }',
      '.' + CLS + '__ok:hover { background: #881337; }',
      '.' + CLS + '__ok:disabled { opacity: .6; cursor: wait; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function confirmDanger(opts, onOk) {
    opts = opts || {};
    injectStyles();
    var old = document.querySelector('.' + CLS + '-backdrop');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var title = opts.title || 'Are you sure?';
    var backdrop = document.createElement('div');
    backdrop.className = CLS + '-backdrop';
    backdrop.innerHTML =
      '<div class="' + CLS + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="' + CLS + '__head">' + esc(title) + '</div>' +
        '<div class="' + CLS + '__body">' +
          '<p>' + esc(opts.body || '') + '</p>' +
          (opts.detail ? '<p class="' + CLS + '__detail">' + esc(opts.detail) + '</p>' : '') +
        '</div>' +
        '<div class="' + CLS + '__foot">' +
          '<button type="button" class="' + CLS + '__cancel">' + esc(opts.cancelLabel || 'Cancel') + '</button>' +
          '<button type="button" class="' + CLS + '__ok">' + esc(opts.okLabel || 'Yes, do it') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);
    var done = false;
    function close() {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.keyCode === 27) { e.preventDefault(); close(); }
    }
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    var cancel = backdrop.querySelector('.' + CLS + '__cancel');
    cancel.addEventListener('click', close);
    var ok = backdrop.querySelector('.' + CLS + '__ok');
    ok.addEventListener('click', function () {
      ok.disabled = true;
      ok.textContent = opts.busyLabel || ((opts.okLabel || 'Working') + '…');
      try { if (typeof onOk === 'function') onOk(close); } catch (e) { close(); throw e; }
    });
    // Enter lands on Cancel: the safe default under a destructive question.
    try { cancel.focus(); } catch (e) { /* ignore */ }
    return close;
  }

  ns.confirmDanger = confirmDanger;
})();
/*** END BID REVIEW — DANGER CONFIRM MODAL ************************************/
