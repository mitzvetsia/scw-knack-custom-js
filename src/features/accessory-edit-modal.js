/*** ACCESSORY EDIT MODAL *****************************************************
 *
 * Custom edit modal for ACCESSORY line items (mounting hardware chips) on
 * the ops build-SOW worksheet (view_3962) and the bid-review comparison
 * grid's expand panels (view_3921). Clicking an accessory chip used to
 * navigate to Knack's native edit-accessory page, tearing the user out of
 * the worksheet flow; this intercepts the click and opens a focused modal
 * with the five fields ops actually edits there:
 *
 *   · Product            (field_1949, connection)
 *   · Labor Description  (field_2020, text w/ line breaks)
 *   · Parent             (field_2464, connection — accessory → parent)
 *   · SOW                (field_2154, multi connection)
 *   · MDF / IDF          (field_1946, connection)
 *
 * Deliberately thin: the modal renders the SAME stamped controls the v2
 * worksheet cards use, so the existing delegated handlers do all the work —
 *   · connection rows carry data-scw-ws-v2-conn/-record/-view, so
 *     worksheet-v2/init.js's picker branches open the real pickers with
 *     their full candidate logic AND follow-on cascades (parent change
 *     inherits SOW+MDF, SOW change mirrors to children, bucket-scoped
 *     product candidates, …);
 *   · the Labor Description textarea carries data-scw-ws-v2-field/-record/
 *     -view, so worksheet-v2/edit.js commits it on blur/Enter with the
 *     optimistic-UI + pending-write + audit pipeline.
 * Everything saves as you go — the footer only closes.
 *
 * The SALES worksheet (view_3586) is intentionally NOT intercepted: its
 * chips keep navigating to the native page (that page is the only path to
 * the accessory's Custom Disc % for survey-locked rows).
 *
 * Graceful degradation: when the record can't be resolved from the view's
 * loaded model (or the view isn't one of ours) the click falls through to
 * the chip's native href untouched. Modifier-clicks (ctrl/cmd/shift —
 * open-in-new-tab) always pass through.
 ****************************************************************************/
(function () {
  'use strict';

  // Views whose accessory chips open the modal. Sales (view_3586) stays
  // native on purpose — see header comment.
  var VIEWS = { view_3962: 1, view_3921: 1 };

  var F = {
    product:   'field_1949',
    laborDesc: 'field_2020',
    parent:    'field_2464',
    sow:       'field_2154',
    mdf:       'field_1946'
  };

  var OVERLAY_ID = 'scw-accem-overlay';
  var STYLE_ID   = 'scw-accem-css';
  var HEX24      = /^[a-f0-9]{24}(\s|\b|$)/i;

  function ws() { return (window.SCW && SCW.worksheetV2) || null; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function stripHtml(v) {
    return (v == null ? '' : String(v)).replace(/<[^>]*>/g, '').trim();
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* Below the v2 picker overlay (100000) so pickers stack on top of the
         modal; above the bulk overlay (9999) and page chrome. */
      '#' + OVERLAY_ID + ' {',
      '  position: fixed; inset: 0; z-index: 99000;',
      '  background: rgba(15, 23, 42, 0.55);',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '.scw-accem-modal {',
      '  background: #fff; border-radius: 8px;',
      '  box-shadow: 0 20px 50px rgba(0,0,0,0.35);',
      '  width: min(520px, 92vw); max-height: 86vh;',
      '  display: flex; flex-direction: column;',
      '  font: 400 13px/1.4 system-ui, -apple-system, sans-serif; color: #0f172a;',
      '}',
      '.scw-accem-head {',
      '  display: flex; align-items: flex-start; gap: 10px;',
      '  padding: 14px 16px 10px; border-bottom: 1px solid #e2e8f0;',
      '}',
      '.scw-accem-head-txt { flex: 1 1 auto; min-width: 0; }',
      '.scw-accem-title { font: 600 15px/1.3 system-ui, -apple-system, sans-serif; color: #0f172a; }',
      '.scw-accem-sub {',
      '  margin-top: 2px; font: 400 12px/1.4 system-ui, -apple-system, sans-serif;',
      '  color: #64748b; overflow-wrap: anywhere;',
      '}',
      '.scw-accem-x {',
      '  flex: 0 0 auto; border: none; background: none; cursor: pointer;',
      '  font: 400 18px/1 system-ui, sans-serif; color: #94a3b8; padding: 2px 4px;',
      '}',
      '.scw-accem-x:hover { color: #475569; }',
      '.scw-accem-body {',
      '  padding: 12px 16px; overflow-y: auto;',
      '  display: flex; flex-direction: column; gap: 12px;',
      '}',
      /* The worksheet textarea min-height is tuned for in-card cells; give
         the modal's labor description a bit more room. */
      '.scw-accem-body .scw-ws-v2-input--textarea { min-height: 56px !important; }',
      '.scw-accem-foot {',
      '  display: flex; align-items: center; gap: 8px;',
      '  padding: 10px 16px 14px; border-top: 1px solid #e2e8f0;',
      '}',
      '.scw-accem-hint {',
      '  font: 400 11px/1.3 system-ui, sans-serif; color: #94a3b8;',
      '  margin-right: auto;',
      '}',
      '.scw-accem-native {',
      '  font: 500 12px/1.2 system-ui, sans-serif; color: #64748b;',
      '  text-decoration: underline;',
      '}',
      '.scw-accem-native:hover { color: #334155; }',
      '.scw-accem-done {',
      '  background: #2563eb; color: #fff; border: none;',
      '  border-radius: 5px; padding: 6px 16px; cursor: pointer;',
      '  font: 500 13px/1.2 system-ui, sans-serif;',
      '}',
      '.scw-accem-done:hover { background: #1d4ed8; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── Record readers ────────────────────────────────────────────────── */

  function readRecord(viewKey, recordId) {
    var n = ws();
    var records = (n && n.data && typeof n.data.readRecords === 'function')
      ? n.data.readRecords(viewKey) : [];
    for (var i = 0; i < records.length; i++) {
      if (records[i] && records[i].id === recordId) return records[i];
    }
    return null;
  }

  /** Accessory display label: connection identifier (field_1950 drop label,
   *  how Knack lists it under a parent), else card.js's drop·product
   *  composite. Mirrors detailMountingHardware's chip-label logic. */
  function accessoryLabel(rec) {
    var lbl = stripHtml(rec.field_1950);
    if (!lbl && Array.isArray(rec.field_1950_raw) && rec.field_1950_raw[0]) {
      lbl = stripHtml(rec.field_1950_raw[0].identifier || rec.field_1950_raw[0].name || '');
    }
    if (!lbl || HEX24.test(lbl)) {
      var n = ws();
      if (n && n.card && typeof n.card.labelLineItem === 'function') {
        lbl = n.card.labelLineItem(rec);
      }
    }
    return (lbl && !HEX24.test(lbl)) ? lbl : (rec.id || '');
  }

  /** Connection display value (multi-aware). Line-item connections
   *  (Parent) whose auto identifier degenerates to a record id get a
   *  proper label via the loaded parent record — same fixup card.js's
   *  readConnRef does. */
  function connDisplay(viewKey, rec, fieldKey) {
    var raw = rec[fieldKey + '_raw'];
    var parts = [];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        var it = raw[i];
        if (!it || !it.id) continue;
        var lbl = stripHtml(it.identifier || '');
        if ((!lbl || HEX24.test(lbl)) && fieldKey === F.parent) {
          var pRec = readRecord(viewKey, it.id);
          var n = ws();
          if (pRec && n && n.card && typeof n.card.labelLineItem === 'function') {
            lbl = stripHtml(n.card.labelLineItem(pRec));
          }
        }
        parts.push((lbl && !HEX24.test(lbl)) ? lbl : '(unnamed)');
      }
    }
    return parts.join(', ');
  }

  /** Editable multi-line read — stored markup verbatim, <br> as \n, matching
   *  card.js readMultiline so edit.js's \n→<br> save round-trips lossless. */
  function readMultiline(rec, key) {
    var v = rec[key];
    if (v == null || v === '') {
      var raw = rec[key + '_raw'];
      v = (raw == null || typeof raw === 'object') ? '' : raw;
    }
    return String(v).replace(/<br\s*\/?>/gi, '\n').trim();
  }

  /* ── Modal rendering ───────────────────────────────────────────────── */

  // Open-modal state: { viewKey, recordId, overlay, editHref }
  var _open = null;

  /** Connection row — same markup shape as card.js detailConnection so the
   *  global .scw-ws-v2-* styles apply and init.js's [data-scw-ws-v2-conn]
   *  handler opens the real picker (with its cascades) on click. */
  function connRow(rec, viewKey, fieldKey, label) {
    var val = connDisplay(viewKey, rec, fieldKey) || '(none)';
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--conn" ' +
        'data-scw-df="' + esc(fieldKey) + '">' +
      '<div class="scw-ws-v2-detail-label">' + esc(label) + '</div>' +
      '<button type="button" class="scw-ws-v2-conn-btn" ' +
        'data-scw-ws-v2-conn="' + esc(fieldKey) + '" ' +
        'data-scw-ws-v2-record="' + esc(rec.id) + '" ' +
        'data-scw-ws-v2-view="' + esc(viewKey) + '" ' +
        'data-scw-ws-v2-conn-label="' + esc(label) + '" ' +
        'title="Click to edit ' + esc(label) + '">' +
        '<span class="scw-ws-v2-conn-btn-val">' + esc(val) + '</span>' +
        '<span class="scw-ws-v2-conn-btn-edit">edit</span>' +
      '</button>' +
    '</div>';
  }

  /** Labor Description row — worksheet-stamped textarea; edit.js commits it
   *  on blur/Enter (Shift+Enter = newline) through the standard pipeline. */
  function laborRow(rec, viewKey) {
    return '<div class="scw-ws-v2-detail-field" data-scw-df="' + esc(F.laborDesc) + '">' +
      '<div class="scw-ws-v2-detail-label">Labor Description</div>' +
      '<textarea class="scw-ws-v2-input scw-ws-v2-input--textarea" rows="3" ' +
        'aria-label="Labor Description" placeholder="Labor Description" ' +
        'data-scw-ws-v2-field="' + esc(F.laborDesc) + '" ' +
        'data-scw-ws-v2-record="' + esc(rec.id) + '" ' +
        'data-scw-ws-v2-view="' + esc(viewKey) + '">' +
        esc(readMultiline(rec, F.laborDesc)) +
      '</textarea>' +
    '</div>';
  }

  function bodyHtml(rec, viewKey) {
    return connRow(rec, viewKey, F.product, 'Product') +
      laborRow(rec, viewKey) +
      connRow(rec, viewKey, F.parent, 'Parent') +
      connRow(rec, viewKey, F.sow, 'SOW') +
      connRow(rec, viewKey, F.mdf, 'MDF / IDF');
  }

  function closeModal() {
    if (!_open) return;
    // Commit a still-focused labor textarea before tearing down — blur fires
    // edit.js's focusout commit (unchanged values no-op there).
    try {
      var ae = document.activeElement;
      if (ae && _open.overlay.contains(ae) && typeof ae.blur === 'function') ae.blur();
    } catch (e) { /* ignore */ }
    if (_open.overlay.parentNode) _open.overlay.parentNode.removeChild(_open.overlay);
    _open = null;
  }

  function openModal(viewKey, recordId, editHref) {
    closeModal();
    injectCss();
    var rec = readRecord(viewKey, recordId);
    if (!rec) return false;

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML =
      '<div class="scw-accem-modal" role="dialog" aria-modal="true" aria-label="Edit accessory">' +
        '<div class="scw-accem-head">' +
          '<div class="scw-accem-head-txt">' +
            '<div class="scw-accem-title">Edit accessory</div>' +
            '<div class="scw-accem-sub">' + esc(accessoryLabel(rec)) + '</div>' +
          '</div>' +
          '<button type="button" class="scw-accem-x" title="Close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="scw-accem-body">' + bodyHtml(rec, viewKey) + '</div>' +
        '<div class="scw-accem-foot">' +
          '<span class="scw-accem-hint">Changes save as you go.</span>' +
          (editHref
            ? '<a class="scw-accem-native" href="' + esc(editHref) + '" ' +
                'title="Open the full Knack edit form (qty, discount, every field)">Open full form</a>'
            : '') +
          '<button type="button" class="scw-accem-done">Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    _open = { viewKey: viewKey, recordId: recordId, overlay: overlay, editHref: editHref || '' };

    overlay.querySelector('.scw-accem-x').addEventListener('click', closeModal);
    overlay.querySelector('.scw-accem-done').addEventListener('click', closeModal);
    // Backdrop click closes — but only a click that both started and ended on
    // the backdrop, so a text-selection drag out of the textarea can't nuke
    // the modal.
    overlay.addEventListener('mousedown', function (e) {
      overlay._scwDownOnSelf = (e.target === overlay);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && overlay._scwDownOnSelf) closeModal();
      overlay._scwDownOnSelf = false;
    });
    // "Open full form" = leave the modal for the native page.
    var nat = overlay.querySelector('.scw-accem-native');
    if (nat) nat.addEventListener('click', function () { closeModal(); });

    ensureSubscribed(viewKey);
    return true;
  }

  /** Re-read the record and refresh the modal's values in place — fired by
   *  the view's data notifications (picker saves refetch + notify). The
   *  labor textarea is only refreshed when it's neither focused nor dirty,
   *  so a conn-save refresh can't clobber in-progress typing. */
  function refreshOpen() {
    if (!_open) return;
    var rec = readRecord(_open.viewKey, _open.recordId);
    if (!rec) { closeModal(); return; }   // deleted / dropped from the view

    var ov = _open.overlay;
    var sub = ov.querySelector('.scw-accem-sub');
    if (sub) sub.textContent = accessoryLabel(rec);

    var CONN = [
      [F.product, 'Product'], [F.parent, 'Parent'],
      [F.sow, 'SOW'], [F.mdf, 'MDF / IDF']
    ];
    for (var i = 0; i < CONN.length; i++) {
      var valEl = ov.querySelector(
        '[data-scw-df="' + CONN[i][0] + '"] .scw-ws-v2-conn-btn-val');
      if (valEl) {
        valEl.textContent = connDisplay(_open.viewKey, rec, CONN[i][0]) || '(none)';
      }
    }

    var ta = ov.querySelector('textarea[data-scw-ws-v2-field="' + F.laborDesc + '"]');
    if (ta && document.activeElement !== ta) {
      var prev = (ta._scwWsV2Prev != null) ? ta._scwWsV2Prev : ta.defaultValue;
      if (ta.value === prev) {   // not dirty → safe to sync from the model
        var fresh = readMultiline(rec, F.laborDesc);
        if (fresh !== ta.value) { ta.value = fresh; ta._scwWsV2Prev = fresh; }
      }
    }
  }

  // data.subscribe has no unsubscribe — register ONE forwarding handler per
  // view, lazily, and let it no-op while no modal is open on that view.
  var _subscribed = {};
  function ensureSubscribed(viewKey) {
    if (_subscribed[viewKey]) return;
    var n = ws();
    if (!(n && n.data && typeof n.data.subscribe === 'function')) return;
    _subscribed[viewKey] = 1;
    n.data.subscribe(viewKey, function () {
      if (_open && _open.viewKey === viewKey) refreshOpen();
    });
  }

  /* ── Chip-click interception ───────────────────────────────────────── */

  function resolveViewKey(chip) {
    // Standard worksheet container id ("scw-ws-v2-view_XXXX")…
    var container = chip.closest('[id^="scw-ws-v2-view_"]');
    if (container) return container.id.replace(/^scw-ws-v2-/, '');
    // …else the bid-review expand panel: the embedded card mounts outside
    // any container, so read the view stamped on the card's own controls
    // (same fallback the accessory qty stepper uses in worksheet-v2/init.js).
    var card = chip.closest('.scw-ws-v2-card');
    var node = card && card.querySelector('[data-scw-ws-v2-view]');
    return (node && node.getAttribute('data-scw-ws-v2-view')) || '';
  }

  function resolveAccessoryId(chip) {
    var wrap = chip.closest('.scw-ws-v2-mh-chip-wrap');
    if (wrap) {
      var attrs = ['data-scw-ws-v2-acc-id', 'data-scw-ws-v2-mh-del', 'data-scw-ws-v2-mh-unlink'];
      for (var i = 0; i < attrs.length; i++) {
        var node = wrap.querySelector('[' + attrs[i] + ']');
        var id = node && node.getAttribute(attrs[i]);
        if (id && /^[a-f0-9]{24}$/i.test(id)) return id;
      }
    }
    // Last resort: the record id embedded in the chip's edit href
    // ("…/edit-accessory-line-item2/<id>/").
    var href = chip.getAttribute && chip.getAttribute('href');
    var m = href && href.match(/([a-f0-9]{24})\/?$/i);
    return m ? m[1] : '';
  }

  if (!document.documentElement.hasAttribute('data-scw-accem-bound')) {
    document.documentElement.setAttribute('data-scw-accem-bound', '1');

    // Capture phase — must beat the anchor's native navigation AND any
    // bubble-phase document handlers.
    document.addEventListener('click', function (e) {
      var chip = e.target && e.target.closest && e.target.closest('.scw-ws-v2-mh-chip');
      if (!chip) return;
      // Modifier / non-left clicks keep native behavior (open in new tab).
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      // Mid-delete chips are display-only.
      var wrap = chip.closest('.scw-ws-v2-mh-chip-wrap');
      if (wrap && wrap.classList.contains('scw-ws-v2-mh-chip-wrap--deleting')) return;

      var viewKey = resolveViewKey(chip);
      if (!VIEWS[viewKey]) return;                 // sales & others: native nav
      var accId = resolveAccessoryId(chip);
      if (!accId) return;
      if (!readRecord(viewKey, accId)) return;     // not in the model → native

      e.preventDefault();
      e.stopPropagation();
      var href = (chip.tagName === 'A' && chip.getAttribute('href')) || '';
      if (!openModal(viewKey, accId, href)) {
        // Shouldn't happen (record read above) — fall back to the native page.
        if (href) window.location.hash = href.replace(/^#/, '');
      }
    }, true);

    // Escape closes the modal — unless a v2 picker is stacked on top (the
    // picker owns Escape then).
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !_open) return;
      if (document.querySelector('.scw-ws-v2-picker-overlay')) return;
      closeModal();
    });
  }

  // Tiny public hook (debug / other features).
  window.SCW = window.SCW || {};
  SCW.accessoryEditModal = { open: openModal, close: closeModal };
})();
/*** END ACCESSORY EDIT MODAL *************************************************/
