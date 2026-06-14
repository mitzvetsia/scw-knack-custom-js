/*** FEATURE: Bulk Add Mounting Box to device-worksheet rows ******************
 *
 * On every device worksheet view (3505 / 3512 / 3313 / 3586 / 3610 / 3921),
 * watches the existing row checkboxes (KTL .ktlCheckbox-row). When ≥1 row
 * is checked, mounts an "+ Add Mounting Box to Selected" button next to the
 * native bulk-ops controls (#bulkOpsControlsDiv-<viewId>). Click opens a
 * modal where the user picks a mounting-box product; submit fires one
 * webhook with the selected parent record ids + chosen product.
 *
 * Make then creates one SOW line item per parent (field_1958 = product,
 * field_2464 = parent record id back-connection, field_1946 = inherited
 * MDF/IDF, field_2154 = sowId). Mirrors the per-row "add mounting
 * hardware" flow but batched.
 *
 * Product picker: window.SCW.mountingBoxProducts (Builder snippet) — the
 * accessory catalog shared with worksheet-v2's add-accessory modal.
 ******************************************************************************/
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────

  // Views this feature is active on — every device-worksheet view.
  // Mirror WORKSHEET_CONFIG.views from device-worksheet.js. If the
  // worksheet feature gets disabled on a view, this won't add to it
  // (the row checkboxes won't be there anyway).
  var ACTIVE_VIEWS = [
    'view_3505',
    'view_3512',
    'view_3313',
    'view_3586',
    'view_3610',
    'view_3921'
  ];

  // Accessory catalog comes from window.SCW.mountingBoxProducts —
  // populated by an out-of-bundle snippet (mirrors how
  // filter-products-by-bucket.js consumes window.SCW.productBucketMap).
  // The snippet fetches EVERY Enabled product (not just mounting
  // hardware) with its compatibility lists (field_2236/field_2205) —
  // consumers must compatibility-filter; "no compat list" means "not
  // an accessory".
  //
  // If the global is missing (snippet hasn't loaded yet, or wasn't
  // wired up at all), the modal falls back to a free-text input so
  // users aren't blocked.
  function getMountingBoxProducts() {
    var list = (window.SCW && window.SCW.mountingBoxProducts) || null;
    return Array.isArray(list) ? list : null;
  }

  // Webhook + button ids
  var WEBHOOK_KEY     = 'MAKE_BULK_ADD_MOUNTING_BOX_WEBHOOK';
  var BTN_CLS         = 'scw-bulk-mountbox-btn';
  var STYLE_ID        = 'scw-bulk-mountbox-css';
  var MODAL_CLS       = 'scw-bulk-mountbox';
  var EVENT_NS        = '.scwBulkMountBox';

  // ─────────────────────────────────────────────────────────────
  // CSS
  // ─────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.' + BTN_CLS + ' {',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '  padding: 6px 12px; margin-left: 6px;',
      '  background: #0f4c75; color: #fff;',
      '  border: none; border-radius: 4px;',
      '  font: 600 12px/1.4 system-ui, -apple-system, sans-serif;',
      '  cursor: pointer;',
      '  transition: background 0.15s ease;',
      '}',
      '.' + BTN_CLS + ':hover { background: #07467c; }',
      '.' + BTN_CLS + '[disabled] { opacity: 0.55; cursor: not-allowed; }',

      '.' + MODAL_CLS + '-overlay {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(15, 23, 42, 0.55);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
      '}',
      '.' + MODAL_CLS + '-card {',
      '  background: #fff; border-radius: 10px;',
      '  box-shadow: 0 18px 50px rgba(0,0,0,0.35);',
      '  padding: 22px 24px; min-width: 420px; max-width: 560px;',
      '}',
      '.' + MODAL_CLS + '-title {',
      '  font: 700 16px/1.3 system-ui; color: #0f172a;',
      '  margin: 0 0 12px 0;',
      '}',
      '.' + MODAL_CLS + '-subtitle {',
      '  font-size: 12px; color: #64748b; margin: 0 0 14px 0;',
      '}',
      '.' + MODAL_CLS + '-rowlist {',
      '  max-height: 160px; overflow-y: auto;',
      '  background: #f8fafc; border: 1px solid #e2e8f0;',
      '  border-radius: 6px; padding: 8px 10px; margin-bottom: 14px;',
      '  font-size: 12px; color: #334155;',
      '}',
      '.' + MODAL_CLS + '-rowlist div { padding: 2px 0; }',
      '.' + MODAL_CLS + '-rowlist div + div { border-top: 1px dashed #e2e8f0; }',
      '.' + MODAL_CLS + '-label {',
      '  display: block; font: 600 12px/1.4 system-ui;',
      '  color: #334155; margin: 8px 0 4px;',
      '}',
      '.' + MODAL_CLS + '-select, .' + MODAL_CLS + '-input {',
      '  width: 100%; padding: 8px 10px;',
      '  font: 13px/1.4 system-ui;',
      '  border: 1px solid #cbd5e1; border-radius: 5px;',
      '  background: #fff; box-sizing: border-box;',
      '}',
      '.' + MODAL_CLS + '-select:focus, .' + MODAL_CLS + '-input:focus {',
      '  outline: none; border-color: #0f4c75;',
      '  box-shadow: 0 0 0 2px rgba(15,76,117,0.15);',
      '}',
      '.' + MODAL_CLS + '-empty-note {',
      '  font-size: 11px; color: #b45309; margin-top: 6px;',
      '}',
      '.' + MODAL_CLS + '-actions {',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '  margin-top: 18px;',
      '}',
      '.' + MODAL_CLS + '-btn {',
      '  padding: 8px 16px; border-radius: 5px; border: none;',
      '  font: 600 13px/1.2 system-ui; cursor: pointer;',
      '}',
      '.' + MODAL_CLS + '-cancel {',
      '  background: #f1f5f9; color: #475569;',
      '}',
      '.' + MODAL_CLS + '-cancel:hover { background: #e2e8f0; }',
      '.' + MODAL_CLS + '-submit {',
      '  background: #0f4c75; color: #fff;',
      '}',
      '.' + MODAL_CLS + '-submit:hover { background: #07467c; }',
      '.' + MODAL_CLS + '-submit[disabled] {',
      '  opacity: 0.55; cursor: not-allowed;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  /** Find checked row checkboxes inside a view. Returns array of
   *  { recordId, label } for each checked row. */
  function getSelected(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return [];
    var cbs = viewEl.querySelectorAll(
      '.kn-table-bulk-checkbox input[type="checkbox"]:checked, ' +
      'input.ktlCheckbox-row[type="checkbox"]:checked'
    );
    var out = [];
    for (var i = 0; i < cbs.length; i++) {
      var tr = cbs[i].closest('tr');
      if (!tr) continue;
      // The data row id IS the record id for Knack-rendered grid rows.
      var recordId = tr.id || tr.getAttribute('data-record-id') || '';
      if (!/^[a-f0-9]{24}$/.test(recordId)) continue;
      // Try to grab a human label — first non-empty td text excluding
      // the checkbox cell. Falls back to the recordId tail.
      var label = '';
      var tds = tr.querySelectorAll('td');
      for (var ti = 0; ti < tds.length; ti++) {
        if (tds[ti].querySelector('input[type="checkbox"]')) continue;
        var txt = (tds[ti].textContent || '').trim();
        if (txt && txt.length > 1) { label = txt.replace(/\s+/g, ' ').slice(0, 80); break; }
      }
      if (!label) label = recordId.slice(-6);
      out.push({ recordId: recordId, label: label });
    }
    return out;
  }

  /** Try to read the current SOW record id from the URL hash. SOW-
   *  scoped scenes always carry it as the 24-hex tail segment. */
  function getSowIdFromHash() {
    var m = (window.location.hash || '').split('?')[0].match(/\/([a-f0-9]{24})\/?$/);
    return m ? m[1] : '';
  }

  function getTriggeredBy() {
    try {
      var u = (typeof Knack !== 'undefined' && Knack.getUserAttributes)
        ? Knack.getUserAttributes() : null;
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) {}
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // MODAL
  // ─────────────────────────────────────────────────────────────

  function openModal(viewId, selected) {
    injectStyles();

    var overlay = document.createElement('div');
    overlay.className = MODAL_CLS + '-overlay';

    var card = document.createElement('div');
    card.className = MODAL_CLS + '-card';

    var title = document.createElement('h3');
    title.className = MODAL_CLS + '-title';
    title.textContent = 'Add Mounting Box to ' + selected.length +
                        ' row' + (selected.length === 1 ? '' : 's');
    card.appendChild(title);

    var subtitle = document.createElement('p');
    subtitle.className = MODAL_CLS + '-subtitle';
    subtitle.textContent = 'One mounting-box line item will be created per selected row, ' +
                           'connected back to the parent camera/reader.';
    card.appendChild(subtitle);

    var rowlist = document.createElement('div');
    rowlist.className = MODAL_CLS + '-rowlist';
    for (var ri = 0; ri < selected.length; ri++) {
      var row = document.createElement('div');
      row.textContent = selected[ri].label;
      rowlist.appendChild(row);
    }
    card.appendChild(rowlist);

    // Product picker — dropdown when window.SCW.mountingBoxProducts is
    // populated (preferred), free-text input as a fallback so the
    // feature still works if the catalog snippet hasn't loaded yet.
    var products  = getMountingBoxProducts();
    var hasList   = !!(products && products.length);
    var pickerLabel = document.createElement('label');
    pickerLabel.className = MODAL_CLS + '-label';
    pickerLabel.textContent = 'Mounting box product';
    card.appendChild(pickerLabel);

    var picker;
    if (hasList) {
      picker = document.createElement('select');
      picker.className = MODAL_CLS + '-select';
      var blank = document.createElement('option');
      blank.value = ''; blank.textContent = '— Choose a mounting box —';
      picker.appendChild(blank);
      for (var pi = 0; pi < products.length; pi++) {
        var p = products[pi];
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        opt.dataset.name = p.name;
        picker.appendChild(opt);
      }
    } else {
      picker = document.createElement('input');
      picker.type = 'text';
      picker.className = MODAL_CLS + '-input';
      picker.placeholder = 'Type the mounting box product name';
    }
    card.appendChild(picker);

    if (!hasList) {
      var note = document.createElement('div');
      note.className = MODAL_CLS + '-empty-note';
      note.textContent =
        'window.SCW.mountingBoxProducts is not loaded — using free-text input. ' +
        'Wire the catalog-loader snippet into Knack JS settings (or wait a moment ' +
        'and reopen) to get the dropdown.';
      card.appendChild(note);

      // If the catalog finishes loading while the modal is open,
      // swap the input for a dropdown without forcing the user to
      // reopen.
      document.addEventListener('scw-mounting-box-products-ready', function once () {
        document.removeEventListener('scw-mounting-box-products-ready', once);
        var fresh = getMountingBoxProducts();
        if (!fresh || !fresh.length || !picker.parentNode) return;
        var sel = document.createElement('select');
        sel.className = MODAL_CLS + '-select';
        var blank2 = document.createElement('option');
        blank2.value = ''; blank2.textContent = '— Choose a mounting box —';
        sel.appendChild(blank2);
        for (var pj = 0; pj < fresh.length; pj++) {
          var pp = fresh[pj];
          var op = document.createElement('option');
          op.value = pp.id; op.textContent = pp.name; op.dataset.name = pp.name;
          sel.appendChild(op);
        }
        picker.parentNode.replaceChild(sel, picker);
        picker = sel;
        if (note.parentNode) note.parentNode.removeChild(note);
      });
    }

    var actions = document.createElement('div');
    actions.className = MODAL_CLS + '-actions';

    var cancel = document.createElement('button');
    cancel.className = MODAL_CLS + '-btn ' + MODAL_CLS + '-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', close);

    var submit = document.createElement('button');
    submit.className = MODAL_CLS + '-btn ' + MODAL_CLS + '-submit';
    submit.textContent = 'Add to ' + selected.length + ' row' +
                         (selected.length === 1 ? '' : 's');
    submit.addEventListener('click', doSubmit);

    actions.appendChild(cancel);
    actions.appendChild(submit);
    card.appendChild(actions);

    overlay.appendChild(card);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);

    setTimeout(function () { picker.focus(); }, 0);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function doSubmit() {
      var productId = '';
      var productName = '';
      // hasList captured at open time can be stale if the catalog
      // loaded mid-modal and the input was swapped for a <select>.
      // Read the live picker shape instead.
      var isSelect = picker.tagName === 'SELECT';
      if (isSelect) {
        productId = picker.value;
        var sel = picker.options[picker.selectedIndex];
        productName = sel ? (sel.dataset.name || sel.textContent) : '';
        if (!productId) {
          alert('Please pick a mounting box product first.');
          return;
        }
      } else {
        productName = (picker.value || '').trim();
        if (!productName) {
          alert('Please enter a mounting box product name.');
          return;
        }
      }

      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG[WEBHOOK_KEY]) || '';
      if (!url || /PLACEHOLDER/.test(url)) {
        alert('Bulk-add mounting box webhook URL is not configured (' + WEBHOOK_KEY + '). ' +
              'Set it in src/config.js once the Make scenario is built.');
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Submitting…';
      cancel.disabled = true;

      var payload = {
        sowId:            getSowIdFromHash(),
        productId:        productId,
        productName:      productName,
        parentRecordIds:  selected.map(function (s) { return s.recordId; }),
        parentLabels:     selected.map(function (s) { return s.label; }),
        sourceViewId:     viewId,
        triggeredBy:      getTriggeredBy()
      };

      $.ajax({
        url: url,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        crossDomain: true,
        timeout: 60000,
        success: function () {
          close();
          showToast('Added mounting box to ' + selected.length + ' row' +
                    (selected.length === 1 ? '' : 's') + '. Refreshing…', false);
          // Trigger a worksheet refresh so the new line items appear.
          if (window.SCW && SCW.deviceWorksheet && SCW.deviceWorksheet.refresh) {
            // Knack will re-render once the underlying view model picks up
            // the new records; give Make a moment to write, then refresh.
            setTimeout(function () {
              try {
                if (Knack && Knack.views && Knack.views[viewId] &&
                    Knack.views[viewId].model) {
                  Knack.views[viewId].model.fetch();
                }
              } catch (e) {}
            }, 1500);
          }
        },
        error: function (xhr, status) {
          // Make webhooks often fire CORS-blocked responses with
          // status 0 even though the scenario actually ran. Treat
          // status 0 + null xhr as a probable success.
          if (xhr && xhr.status === 0) {
            close();
            showToast('Submitted — Make is processing. The new rows will appear shortly.', false);
            return;
          }
          submit.disabled = false;
          cancel.disabled = false;
          submit.textContent = 'Add to ' + selected.length + ' row' +
                               (selected.length === 1 ? '' : 's');
          alert('Webhook failed (' + status + '). Please try again.');
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TOAST (lightweight, no dependency on other toast features)
  // ─────────────────────────────────────────────────────────────

  function showToast(msg, isError) {
    var existing = document.querySelector('.scw-bulk-mountbox-toast');
    if (existing) existing.remove();
    var t = document.createElement('div');
    t.className = 'scw-bulk-mountbox-toast';
    t.style.cssText =
      'position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);' +
      'background: ' + (isError ? '#991b1b' : '#0f4c75') + ';' +
      'color: #fff; padding: 10px 18px; border-radius: 6px;' +
      'font: 600 13px/1.4 system-ui; box-shadow: 0 4px 14px rgba(0,0,0,0.3);' +
      'z-index: 100001;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 4500);
  }

  // ─────────────────────────────────────────────────────────────
  // BUTTON MOUNT
  // ─────────────────────────────────────────────────────────────

  function ensureButton(viewId) {
    var bar = document.getElementById('bulkOpsControlsDiv-' + viewId);
    if (!bar) return;
    if (bar.querySelector('.' + BTN_CLS + '[data-view-id="' + viewId + '"]')) return;

    injectStyles();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLS;
    btn.setAttribute('data-view-id', viewId);
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" ' +
      'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' +
      '<line x1="12" y1="8" x2="12" y2="16"/>' +
      '<line x1="8" y1="12" x2="16" y2="12"/>' +
      '</svg>' +
      '<span class="' + BTN_CLS + '-label">+ Add Mounting Box</span>';
    btn.addEventListener('click', function () {
      var sel = getSelected(viewId);
      if (!sel.length) {
        showToast('No rows selected. Tick the rows you want to add mounting boxes to.', true);
        return;
      }
      openModal(viewId, sel);
    });
    bar.appendChild(btn);
  }

  function updateButtonVisibility(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;
    var checked = viewEl.querySelectorAll(
      '.kn-table-bulk-checkbox input[type="checkbox"]:checked, ' +
      'input.ktlCheckbox-row[type="checkbox"]:checked'
    ).length;
    var btn = document.querySelector('.' + BTN_CLS + '[data-view-id="' + viewId + '"]');
    if (!btn) return;
    if (checked > 0) {
      btn.style.display = 'inline-flex';
      var label = btn.querySelector('.' + BTN_CLS + '-label');
      if (label) label.textContent = '+ Add Mounting Box to ' + checked +
                                      ' row' + (checked === 1 ? '' : 's');
      btn.disabled = false;
    } else {
      btn.style.display = 'none';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // BIND
  // ─────────────────────────────────────────────────────────────
  //
  // Mount via SCW.toolbar.register() so the button survives KTL's
  // habit of replacing #bulkOpsControlsDiv-<viewId> outside any
  // knack-view-render event (filter changes, model refetches,
  // accordion rebuilds, etc.). The registry's watchdog re-runs every
  // 2s, so even if the MutationObserver scope gets orphaned the
  // button is re-injected on the next tick.

  ACTIVE_VIEWS.forEach(function (viewId) {
    if (window.SCW && SCW.toolbar && SCW.toolbar.register) {
      SCW.toolbar.register({
        id:        'add-mounting-box-' + viewId,
        slot:      SCW.toolbar.SLOTS.bulkOps,
        viewMatch: function (viewEl) { return viewEl && viewEl.id === viewId; },
        // mount() is idempotent: ensureButton() bails if the button
        // is already present in the right container. updateButton-
        // Visibility runs every tick so the label/count stays in
        // sync if rows are checked between watchdog passes.
        mount: function () {
          ensureButton(viewId);
          updateButtonVisibility(viewId);
        }
      });
    } else if (window.SCW && SCW.onViewRender) {
      // Fallback for environments where the toolbar registry hasn't
      // loaded yet (shouldn't happen in production — _toolbar-registry
      // ships first in build.sh — but keeps this module standalone-safe).
      SCW.onViewRender(viewId, function () {
        setTimeout(function () {
          ensureButton(viewId);
          updateButtonVisibility(viewId);
        }, 250);
      }, EVENT_NS);
    }

    // Track checkbox state changes — delegated to document so we
    // catch new rows added by transformView / re-renders.
    $(document)
      .off('change' + EVENT_NS + '_' + viewId,
           '#' + viewId + ' input[type="checkbox"]')
      .on('change' + EVENT_NS + '_' + viewId,
          '#' + viewId + ' input[type="checkbox"]',
          function () { updateButtonVisibility(viewId); });
  });
})();
/*** END FEATURE: Bulk Add Mounting Box *************************************/
