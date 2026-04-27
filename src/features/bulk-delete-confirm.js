/*** FEATURE: Bulk-delete confirmation + control-bar positioning ***************
 *
 * Two related tweaks for KTL's bulkOpsControlsDiv:
 *
 *  1. Move #bulkOpsControlsDiv-view_3610's button cluster to the far
 *     right of its container (KTL renders it left-aligned by default).
 *
 *  2. Add a confirm-before-delete prompt to the "Delete Selected: N"
 *     button. Per-record deletes elsewhere in the app (connected-records
 *     trash icon) are intentionally one-click; bulk delete is much more
 *     destructive, so an extra "are you sure?" is warranted.
 *
 * Adds the same protection to view_3586's bulk-delete button if it
 * shows up — same control shape, same risk.
 ******************************************************************************/
(function () {
  'use strict';

  var CONFIRM_VIEWS = ['view_3610', 'view_3586'];
  var STYLE_ID      = 'scw-bulk-delete-confirm-css';
  var EVENT_NS      = '.scwBulkDeleteConfirm';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // ── Position the bulk-ops control row to the far right ──
      '#bulkOpsControlsDiv-view_3610,',
      '#bulkOpsControlsDiv-view_3586 {',
      '  display: flex !important;',
      '  justify-content: flex-end !important;',
      '  gap: 6px;',
      '}',

      // ── Confirm modal ──
      '.scw-bdc-overlay {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(15, 23, 42, 0.55);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
      '}',
      '.scw-bdc-card {',
      '  background: #fff; border-radius: 10px;',
      '  box-shadow: 0 18px 50px rgba(0,0,0,0.35);',
      '  padding: 22px 24px; min-width: 360px; max-width: 520px;',
      '  text-align: center;',
      '}',
      '.scw-bdc-icon {',
      '  font-size: 30px; margin-bottom: 8px;',
      '}',
      '.scw-bdc-msg {',
      '  font-size: 15px; font-weight: 700; color: #111827;',
      '  margin-bottom: 6px;',
      '}',
      '.scw-bdc-sub {',
      '  font-size: 13px; color: #4b5563; margin-bottom: 18px;',
      '}',
      '.scw-bdc-btns {',
      '  display: flex; justify-content: center; gap: 8px;',
      '}',
      '.scw-bdc-btn {',
      '  appearance: none; cursor: pointer;',
      '  padding: 9px 20px; border-radius: 6px;',
      '  font: 600 13px system-ui, sans-serif;',
      '  border: 1px solid transparent;',
      '}',
      '.scw-bdc-btn--cancel {',
      '  background: #fff; color: #1f2937; border-color: #d1d5db;',
      '}',
      '.scw-bdc-btn--cancel:hover { background: #f3f4f6; }',
      '.scw-bdc-btn--confirm {',
      '  background: #b91c1c; color: #fff; border-color: #991b1b;',
      '}',
      '.scw-bdc-btn--confirm:hover { background: #991b1b; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showConfirm(count) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'scw-bdc-overlay';
      overlay.innerHTML =
        '<div class="scw-bdc-card" role="alertdialog" aria-modal="true">' +
          '<div class="scw-bdc-icon">⚠️</div>' +
          '<div class="scw-bdc-msg">Bulk delete ' + count +
            ' record' + (count === 1 ? '' : 's') + '?</div>' +
          '<div class="scw-bdc-sub">This cannot be undone.</div>' +
          '<div class="scw-bdc-btns">' +
            '<button type="button" class="scw-bdc-btn scw-bdc-btn--cancel">Cancel</button>' +
            '<button type="button" class="scw-bdc-btn scw-bdc-btn--confirm">Delete ' +
              count + '</button>' +
          '</div>' +
        '</div>';

      function close(answer) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
        resolve(answer);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); }

      overlay.querySelector('.scw-bdc-btn--cancel')
        .addEventListener('click', function () { close(false); });
      overlay.querySelector('.scw-bdc-btn--confirm')
        .addEventListener('click', function () { close(true); });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(false);
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      // Default focus on Cancel so Enter doesn't blow through.
      var cancelBtn = overlay.querySelector('.scw-bdc-btn--cancel');
      if (cancelBtn) cancelBtn.focus();
    });
  }

  /** Best-effort selected-row count from the button label
   *  ("Delete Selected: 12") — KTL keeps that text in sync as the user
   *  toggles checkboxes, and we don't want to depend on a specific row
   *  selector that varies between worksheet and grid views. */
  function readCount(btn) {
    var m = String(btn.textContent || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  // Capture-phase click listener — runs BEFORE KTL's bubble-phase
  // delete handler. We swallow the click, ask for confirmation, and
  // (on yes) re-fire the click with a one-shot flag so our handler
  // lets the second click reach KTL untouched.
  injectStyles();
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button[id^="ktl-bulk-delete-selected-"]');
    if (!btn) return;
    if (btn.disabled) return;

    // One of the views we're protecting?
    var viewMatch = btn.id.match(/ktl-bulk-delete-selected-(view_\d+)$/);
    if (!viewMatch) return;
    if (CONFIRM_VIEWS.indexOf(viewMatch[1]) === -1) return;

    // Already confirmed → let this click flow through to KTL.
    if (btn._scwBdcConfirmed) {
      btn._scwBdcConfirmed = false;
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();

    var count = readCount(btn);
    if (count <= 0) return; // nothing selected — nothing to confirm

    showConfirm(count).then(function (ok) {
      if (!ok) return;
      btn._scwBdcConfirmed = true;
      btn.click();
    });
  }, true);
})();
