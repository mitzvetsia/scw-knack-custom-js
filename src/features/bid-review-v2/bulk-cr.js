/*** BID REVIEW V2 — BULK CHANGE REQUEST ************************************
 *
 * Apply the SAME change request to a batch of selected line items, for ONE
 * bid (the column whose header button was clicked). Selection is the grid's
 * SOW-line-item row checkboxes (data-scw-ws-v2-select); the modal lets the
 * user set one or more common fields (Qty / Rate / Labor Description) plus an
 * optional note, then queues an identical pending CR on every selected row
 * that has a bid record on the chosen package.
 *
 * The heavy lifting (row lookup, item construction, reciprocal-safe merge)
 * lives in v1's SCW.bidReview.addBulkChangeRequest — this file is just the
 * picker UI + selection gathering. Connections / cabling are intentionally
 * out of bulk v1 (bucket-specific); use the per-cell Revise for those.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns) return;

  var STYLE_ID = 'scw-br-v2-bulkcr-css';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.scw-br-v2-bulkcr-overlay {',
      '  position: fixed; inset: 0; background: rgba(15,23,42,.45);',
      '  z-index: 100000; display: flex; align-items: center; justify-content: center;',
      '}',
      '.scw-br-v2-bulkcr-modal {',
      '  background: #fff; border-radius: 12px; width: 460px; max-width: 94vw;',
      '  max-height: 88vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3);',
      '  font: 13px/1.4 system-ui, sans-serif; color: #1e293b;',
      '}',
      '.scw-br-v2-bulkcr-hd {',
      '  display: flex; align-items: flex-start; justify-content: space-between;',
      '  padding: 16px 20px 10px; border-bottom: 1px solid #e2e8f0;',
      '}',
      '.scw-br-v2-bulkcr-title { font-size: 15px; font-weight: 800; }',
      '.scw-br-v2-bulkcr-sub { font-size: 12px; color: #64748b; margin-top: 2px; }',
      '.scw-br-v2-bulkcr-close {',
      '  border: 0; background: none; font-size: 22px; line-height: 1; cursor: pointer;',
      '  color: #94a3b8; padding: 0 2px;',
      '}',
      '.scw-br-v2-bulkcr-body { padding: 14px 20px; }',
      '.scw-br-v2-bulkcr-hint {',
      '  font-size: 12px; color: #475569; background: #f1f5f9; border-radius: 8px;',
      '  padding: 8px 10px; margin-bottom: 12px;',
      '}',
      '.scw-br-v2-bulkcr-field { margin-bottom: 11px; }',
      '.scw-br-v2-bulkcr-field > label {',
      '  display: flex; align-items: center; gap: 7px; font-weight: 700;',
      '  font-size: 12px; margin-bottom: 4px; cursor: pointer;',
      '}',
      '.scw-br-v2-bulkcr-field input[type="number"],',
      '.scw-br-v2-bulkcr-field input[type="text"],',
      '.scw-br-v2-bulkcr-field textarea {',
      '  width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1;',
      '  border-radius: 7px; padding: 7px 9px; font: inherit;',
      '}',
      '.scw-br-v2-bulkcr-field textarea { min-height: 60px; resize: vertical; }',
      '.scw-br-v2-bulkcr-field input:disabled, .scw-br-v2-bulkcr-field textarea:disabled {',
      '  background: #f1f5f9; color: #94a3b8;',
      '}',
      '.scw-br-v2-bulkcr-ft {',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '  padding: 12px 20px 18px; border-top: 1px solid #e2e8f0;',
      '}',
      '.scw-br-v2-bulkcr-status { flex: 1 1 auto; align-self: center; font-size: 12px; color: #64748b; }',
      '.scw-br-v2-bulkcr-btn {',
      '  border: 1px solid transparent; border-radius: 8px; padding: 8px 14px;',
      '  font-weight: 700; font-size: 12px; cursor: pointer;',
      '}',
      '.scw-br-v2-bulkcr-btn--cancel { background: #fff; border-color: #cbd5e1; color: #475569; }',
      '.scw-br-v2-bulkcr-btn--save { background: #07467c; color: #fff; }',
      '.scw-br-v2-bulkcr-btn--save:disabled { opacity: .55; cursor: default; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Fields offered for bulk change. key matches v1's FIELD_DEFS so the
  // pending item + submission payload line up. Each has an "apply" toggle so
  // an empty value can be sent intentionally vs. simply skipped.
  var FIELDS = [
    { key: 'qty',       label: 'Qty',               type: 'number' },
    { key: 'rate',      label: 'Sub Bid Rate ($)',  type: 'number' },
    { key: 'laborDesc', label: 'Labor Description',  type: 'textarea' }
  ];

  function fieldRow(f) {
    var inputHtml = f.type === 'textarea'
      ? '<textarea data-f="' + f.key + '" disabled placeholder="New value for all selected"></textarea>'
      : '<input type="' + (f.type === 'number' ? 'number' : 'text') + '" step="any" ' +
        'data-f="' + f.key + '" disabled placeholder="New value for all selected">';
    return '<div class="scw-br-v2-bulkcr-field">' +
        '<label><input type="checkbox" data-apply="' + f.key + '"> ' + esc(f.label) + '</label>' +
        inputHtml +
      '</div>';
  }

  /** open({ pkgId, pkgName, sowItemIds }) */
  function open(opts) {
    opts = opts || {};
    var ids = (opts.sowItemIds || []).slice();
    if (!ids.length) return;
    injectCss();

    var v1 = window.SCW.bidReview;
    if (!v1 || typeof v1.addBulkChangeRequest !== 'function') {
      if (v1 && v1.renderToast) v1.renderToast('Bulk change request unavailable', 'error');
      return;
    }

    var overlay = document.createElement('div');
    overlay.className = 'scw-br-v2-bulkcr-overlay';
    overlay.innerHTML =
      '<div class="scw-br-v2-bulkcr-modal" role="dialog" aria-modal="true">' +
        '<div class="scw-br-v2-bulkcr-hd">' +
          '<div>' +
            '<div class="scw-br-v2-bulkcr-title">Request Change — ' + esc(opts.pkgName || 'Bid') + '</div>' +
            '<div class="scw-br-v2-bulkcr-sub">Applied to ' + ids.length +
              ' selected line item' + (ids.length === 1 ? '' : 's') + '</div>' +
          '</div>' +
          '<button type="button" class="scw-br-v2-bulkcr-close" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="scw-br-v2-bulkcr-body">' +
          '<div class="scw-br-v2-bulkcr-hint">Tick a field to change it; the same value is ' +
            'requested on every selected item that has a bid on this package. Connections &amp; ' +
            'cabling aren’t bulk-editable — use Revise on the cell for those.</div>' +
          FIELDS.map(fieldRow).join('') +
          '<div class="scw-br-v2-bulkcr-field">' +
            '<label>Note to bidder (optional)</label>' +
            '<textarea data-note placeholder="Add an instruction the bidder will see"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="scw-br-v2-bulkcr-ft">' +
          '<span class="scw-br-v2-bulkcr-status"></span>' +
          '<button type="button" class="scw-br-v2-bulkcr-btn scw-br-v2-bulkcr-btn--cancel">Cancel</button>' +
          '<button type="button" class="scw-br-v2-bulkcr-btn scw-br-v2-bulkcr-btn--save">Apply to ' + ids.length + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.scw-br-v2-bulkcr-close').addEventListener('click', close);
    overlay.querySelector('.scw-br-v2-bulkcr-btn--cancel').addEventListener('click', close);

    // Enable a field's input only when its apply box is ticked.
    overlay.addEventListener('change', function (e) {
      var ab = e.target.getAttribute && e.target.getAttribute('data-apply');
      if (!ab) return;
      var input = overlay.querySelector('[data-f="' + ab + '"]');
      if (input) { input.disabled = !e.target.checked; if (e.target.checked) input.focus(); }
    });

    var status = overlay.querySelector('.scw-br-v2-bulkcr-status');
    overlay.querySelector('.scw-br-v2-bulkcr-btn--save').addEventListener('click', function () {
      var requested = {};
      for (var i = 0; i < FIELDS.length; i++) {
        var f = FIELDS[i];
        var apply = overlay.querySelector('[data-apply="' + f.key + '"]');
        if (!apply || !apply.checked) continue;
        var input = overlay.querySelector('[data-f="' + f.key + '"]');
        var raw = input ? String(input.value).trim() : '';
        if (f.type === 'number') requested[f.key] = raw ? parseFloat(raw) : 0;
        else requested[f.key] = raw;
      }
      var note = (overlay.querySelector('[data-note]').value || '').trim();

      var hasField = false;
      for (var k in requested) { if (Object.prototype.hasOwnProperty.call(requested, k)) { hasField = true; break; } }
      if (!hasField && !note) {
        status.textContent = 'Tick a field or add a note first.';
        return;
      }

      var res = v1.addBulkChangeRequest(opts.pkgId, ids, requested, note);
      var applied = (res && res.applied) || 0;
      var skipped = (res && res.skipped) || 0;
      if (v1.renderToast) {
        if (applied) {
          v1.renderToast('Change request queued on ' + applied + ' item' + (applied === 1 ? '' : 's') +
            (skipped ? ' (' + skipped + ' skipped — no bid on this package)' : ''), 'success');
        } else {
          v1.renderToast('No items updated' +
            (skipped ? ' — ' + skipped + ' selected have no bid on this package' : ''), 'info');
        }
      }
      close();
    });
  }

  ns.bulkCr = { open: open };
})();
/*** END BID REVIEW V2 — BULK CHANGE REQUEST ********************************/
