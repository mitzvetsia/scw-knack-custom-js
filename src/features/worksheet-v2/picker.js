/*** WORKSHEET V2 — PICKER ****************************************************
 *
 * Connection-picker modal. Generic enough to handle every connection
 * field v2 cards need to edit:
 *   - field_1957 Connected Devices (multi, NVR → cameras/readers)
 *   - field_1958 Mounting Hardware (multi, line item → products)
 *   - any future single- or multi-connection field
 *
 * Public API:
 *   ns.picker.open({
 *     sourceViewKey:    'view_3962',          // for the PUT endpoint
 *     recordId:         '<24-hex>',           // record being edited
 *     fieldKey:         'field_1957',         // connection field on it
 *     label:            'Connected Devices',  // modal title
 *     selectedIds:      ['id1', 'id2', ...],  // currently connected
 *     candidates:       [recordAttrs, ...],   // pre-filtered options
 *     groupBy:          function (rec) -> {id, label},   // optional
 *     itemLabel:        function (rec) -> 'E-001 · NVR Pro 16ch',
 *     multi:            true,                 // false → single-select
 *     onSaved:          function (newIds) {} // after PUT success
 *   })
 *
 * Save fires a direct PUT via SCW.knackAjax — same pattern as
 * sub-variant-bid + edit.js. Sets field_<key> to the array of
 * selected ids (multi) or the single id (single-select).
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function close(overlay, onKey) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (onKey) document.removeEventListener('keydown', onKey);
  }

  /** Group candidates via opts.groupBy → [{ id, label, items: [...] }, ...]. */
  function groupCandidates(candidates, groupBy) {
    if (typeof groupBy !== 'function') {
      return [{ id: '__all', label: '', items: candidates.slice() }];
    }
    var groups = Object.create(null);
    var order = [];
    for (var i = 0; i < candidates.length; i++) {
      var g = groupBy(candidates[i]) || { id: '__unknown', label: 'Unassigned' };
      if (!groups[g.id]) {
        groups[g.id] = { id: g.id, label: g.label || '', items: [] };
        order.push(g.id);
      }
      groups[g.id].items.push(candidates[i]);
    }
    // Sort groups: by label natural-asc; unknowns sink to bottom.
    order.sort(function (a, b) {
      var la = groups[a].label, lb = groups[b].label;
      if (a === '__unknown' && b !== '__unknown') return 1;
      if (b === '__unknown' && a !== '__unknown') return -1;
      return String(la).localeCompare(String(lb), undefined, {
        numeric: true, sensitivity: 'base'
      });
    });
    return order.map(function (k) { return groups[k]; });
  }

  function injectStyles() {
    if (document.getElementById('scw-ws-v2-picker-css')) return;
    var css = [
      '.scw-ws-v2-picker-overlay {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(15, 23, 42, 0.55);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
      '}',
      '.scw-ws-v2-picker {',
      '  background: #fff; border-radius: 10px;',
      '  box-shadow: 0 18px 50px rgba(0,0,0,0.35);',
      '  min-width: 480px; max-width: 640px;',
      '  max-height: 80vh; display: flex; flex-direction: column;',
      '  overflow: hidden;',
      '}',
      '.scw-ws-v2-picker-hd {',
      '  display: flex; align-items: baseline; gap: 12px;',
      '  padding: 14px 18px;',
      '  border-bottom: 1px solid #e5e7eb;',
      '  font-size: 15px; font-weight: 700; color: #07467c;',
      '}',
      '.scw-ws-v2-picker-hd .scw-ws-v2-picker-sub {',
      '  font-weight: 500; font-size: 12px; color: #64748b;',
      '  margin-left: auto;',
      '}',
      '.scw-ws-v2-picker-bd {',
      '  flex: 1 1 auto; overflow: auto; padding: 8px 0;',
      '}',
      '.scw-ws-v2-picker-empty {',
      '  padding: 24px;',
      '  text-align: center;',
      '  color: #64748b;',
      '  font-style: italic;',
      '}',
      '.scw-ws-v2-picker-group {',
      '  padding: 6px 18px 4px;',
      '  font: 700 11px/1.2 system-ui, -apple-system, sans-serif;',
      '  letter-spacing: 0.05em;',
      '  text-transform: uppercase;',
      '  color: #475569;',
      '  background: #f8fafc;',
      '  border-top: 1px solid #e2e8f0;',
      '  border-bottom: 1px solid #e2e8f0;',
      '  position: sticky; top: 0; z-index: 2;',
      '}',
      '.scw-ws-v2-picker-item {',
      '  display: flex; align-items: center; gap: 10px;',
      '  padding: 6px 18px;',
      '  font-size: 13px; color: #1f2937;',
      '  cursor: pointer;',
      '  transition: background-color 80ms ease;',
      '}',
      '.scw-ws-v2-picker-item:hover { background: #f1f5f9; }',
      '.scw-ws-v2-picker-item-label {',
      '  font-weight: 600; color: #07467c;',
      '  min-width: 60px;',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.scw-ws-v2-picker-item-name { flex: 1 1 auto; }',
      '.scw-ws-v2-picker-item input[type=checkbox],',
      '.scw-ws-v2-picker-item input[type=radio] {',
      '  width: 16px; height: 16px; cursor: pointer;',
      '}',
      '.scw-ws-v2-picker-ft {',
      '  padding: 12px 18px;',
      '  border-top: 1px solid #e5e7eb;',
      '  display: flex; justify-content: space-between; align-items: center;',
      '  gap: 12px;',
      '}',
      '.scw-ws-v2-picker-status {',
      '  font-size: 12px; color: #64748b;',
      '}',
      '.scw-ws-v2-picker-status--err { color: #b45309; }',
      '.scw-ws-v2-picker-actions { display: flex; gap: 8px; }',
      '.scw-ws-v2-picker-btn {',
      '  appearance: none; cursor: pointer;',
      '  padding: 8px 16px; border-radius: 6px;',
      '  font: 600 13px system-ui, sans-serif;',
      '  border: 1px solid transparent;',
      '}',
      '.scw-ws-v2-picker-btn--cancel {',
      '  background: #fff; color: #1f2937; border-color: #d1d5db;',
      '}',
      '.scw-ws-v2-picker-btn--cancel:hover { background: #f3f4f6; }',
      '.scw-ws-v2-picker-btn--confirm {',
      '  background: #07467c; color: #fff; border-color: #053659;',
      '}',
      '.scw-ws-v2-picker-btn--confirm:hover { background: #053659; }',
      '.scw-ws-v2-picker-btn[disabled] { opacity: 0.6; cursor: not-allowed; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'scw-ws-v2-picker-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /** Open the picker modal. */
  function open(opts) {
    if (!opts || !opts.fieldKey || !opts.recordId || !opts.sourceViewKey) {
      console.warn('[scw-ws-v2-picker] open() requires fieldKey, recordId, sourceViewKey');
      return;
    }
    injectStyles();

    var multi      = opts.multi !== false; // default true
    var selected   = (opts.selectedIds || []).slice();
    var candidates = (opts.candidates || []).slice();
    var groups     = groupCandidates(candidates, opts.groupBy);
    var itemLabel  = (typeof opts.itemLabel === 'function')
      ? opts.itemLabel
      : function (r) { return (r.identifier || r.id) || ''; };

    // Build modal scaffold
    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-picker-overlay';
    var card = document.createElement('div');
    card.className = 'scw-ws-v2-picker';
    overlay.appendChild(card);

    var hd = document.createElement('div');
    hd.className = 'scw-ws-v2-picker-hd';
    hd.innerHTML = escapeHtml(opts.label || 'Pick a record') +
      '<span class="scw-ws-v2-picker-sub">' +
        (multi ? candidates.length + ' options' : 'Single select') +
      '</span>';
    card.appendChild(hd);

    var bd = document.createElement('div');
    bd.className = 'scw-ws-v2-picker-bd';
    card.appendChild(bd);

    if (!candidates.length) {
      bd.innerHTML = '<div class="scw-ws-v2-picker-empty">No candidates available.</div>';
    } else {
      var inputType = multi ? 'checkbox' : 'radio';
      var inputName = 'scw-ws-v2-pick-' + opts.fieldKey;
      groups.forEach(function (g) {
        if (g.label) {
          var head = document.createElement('div');
          head.className = 'scw-ws-v2-picker-group';
          head.textContent = g.label;
          bd.appendChild(head);
        }
        g.items.forEach(function (rec) {
          var row = document.createElement('label');
          row.className = 'scw-ws-v2-picker-item';
          var labelText = itemLabel(rec) || rec.id;
          var isChecked = selected.indexOf(rec.id) !== -1;
          row.innerHTML =
            '<input type="' + inputType + '" name="' + inputName + '" value="' +
              escapeHtml(rec.id) + '"' + (isChecked ? ' checked' : '') + '>' +
            '<span class="scw-ws-v2-picker-item-name">' + escapeHtml(labelText) + '</span>';
          bd.appendChild(row);
        });
      });
    }

    var ft = document.createElement('div');
    ft.className = 'scw-ws-v2-picker-ft';
    ft.innerHTML =
      '<span class="scw-ws-v2-picker-status"></span>' +
      '<div class="scw-ws-v2-picker-actions">' +
        '<button type="button" class="scw-ws-v2-picker-btn scw-ws-v2-picker-btn--cancel">Cancel</button>' +
        '<button type="button" class="scw-ws-v2-picker-btn scw-ws-v2-picker-btn--confirm">Save</button>' +
      '</div>';
    card.appendChild(ft);

    var statusEl  = ft.querySelector('.scw-ws-v2-picker-status');
    var cancelBtn = ft.querySelector('.scw-ws-v2-picker-btn--cancel');
    var confirmBtn = ft.querySelector('.scw-ws-v2-picker-btn--confirm');

    function setStatus(msg, err) {
      statusEl.className = 'scw-ws-v2-picker-status' + (err ? ' scw-ws-v2-picker-status--err' : '');
      statusEl.textContent = msg || '';
    }

    function onKey(e) { if (e.key === 'Escape') close(overlay, onKey); }
    document.addEventListener('keydown', onKey);
    cancelBtn.addEventListener('click', function () { close(overlay, onKey); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close(overlay, onKey);
    });

    confirmBtn.addEventListener('click', function () {
      var inputs = bd.querySelectorAll('input[name="' + 'scw-ws-v2-pick-' + opts.fieldKey + '"]:checked');
      var ids = [];
      for (var i = 0; i < inputs.length; i++) ids.push(inputs[i].value);

      // For single-select fields, send the bare id (or empty string)
      // — multi-connection always sends an array.
      var body = {};
      body[opts.fieldKey] = multi ? ids : (ids[0] || '');

      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      setStatus('Saving…');

      var putKey = opts.putViewKey || opts.sourceViewKey;

      try {
        SCW.knackAjax({
          // PUT URL is normally the source view, but for fields whose
          // mirror-connection-sync cascade is bound to a DIFFERENT
          // view (e.g. field_1957 — its cascade lives on view_3610,
          // not v2's source view_3962), the caller can override
          // putViewKey so the cascade runs on the view that's bound.
          url:  SCW.knackRecordUrl(putKey, opts.recordId),
          type: 'PUT',
          data: JSON.stringify(body),
          success: function (resp) {
            // ── Wire up the cascade ─────────────────────────────────
            // SCW.knackAjax's PUT updates Knack's data server-side but
            // does NOT fire knack-cell-update on its own — that event
            // is Knack's inline-edit-internal signal. mirror-connection-
            // sync listens for knack-cell-update.<putViewKey>, so unless
            // we do two extra things ourselves the cascade never runs:
            //
            //   1. Patch the local Backbone model for putViewKey with
            //      the new attrs so a subsequent read in the cascade
            //      reflects the user's selection (not the pre-PUT state).
            //
            //   2. Dispatch knack-cell-update.<putViewKey> with the
            //      same (view, record) args Knack would normally pass,
            //      so mirror-connection-sync's handler treats it like
            //      a real inline edit.
            try {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(putKey, opts.recordId, resp,
                  opts.fieldKey, body[opts.fieldKey]);
              }
              var view = Knack.views[putKey];
              if (view && view.model && view.model.data) {
                var rec = (typeof view.model.data.get === 'function')
                  ? view.model.data.get(opts.recordId)
                  : null;
                if (rec) {
                  $(document).trigger(
                    'knack-cell-update.' + putKey,
                    [view, rec.attributes || rec]
                  );
                }
              }
            } catch (eSync) {
              console.warn('[scw-ws-v2-picker] cascade trigger failed', eSync);
            }

            close(overlay, onKey);
            if (typeof opts.onSaved === 'function') opts.onSaved(ids, resp);
          },
          error: function (xhr) {
            console.warn('[scw-ws-v2-picker] PUT failed', xhr);
            setStatus('Save failed. Try again.', true);
            confirmBtn.disabled = false;
            cancelBtn.disabled  = false;
          }
        });
      } catch (e) {
        setStatus('Save failed. Try again.', true);
        confirmBtn.disabled = false;
        cancelBtn.disabled  = false;
      }
    });

    document.body.appendChild(overlay);
  }

  ns.picker = {
    open: open
  };
})();
/*** END WORKSHEET V2 — PICKER ************************************************/
