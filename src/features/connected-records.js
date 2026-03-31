/*** CONNECTED RECORDS EDITOR ***/
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  var STYLE_ID = 'scw-connected-records-css';

  var CONFIG = {
    views: [
      {
        parentViewId: 'view_3313',
        connectionField: 'field_1958',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item',
        warningField: 'field_2244',
        parentConnectionField: 'field_2464'   // connection FROM accessory back TO parent
      },
      {
        parentViewId: 'view_3332',
        connectionField: 'field_1958',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item',
        editSlug: 'edit-scope-line-item2',   // fallback: derive add URL by replacing this slug
        warningField: 'field_2244',
        parentConnectionField: 'field_2464'
      },
      {
        parentViewId: 'view_3610',
        connectionField: 'field_1958',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item',
        editSlug: 'edit-scope-line-item2',
        warningField: 'field_2244',
        parentConnectionField: 'field_2464'
      },
      {
        parentViewId: 'view_3586',
        connectionField: 'field_1958',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item',
        itemSlug: 'edit-accessory-line-item2',
        warningField: 'field_2244',
        parentConnectionField: 'field_2464'
      },
      {
        parentViewId: 'view_3588',
        connectionField: 'field_1958',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item2',
        editSlug: 'add-photo-to-sow-line-item2',
        itemSlug: 'edit-accessory-line-item2',
        warningField: 'field_2244',
        parentConnectionField: 'field_2464'
      }
    ]
  };

  // ==========================================================
  // CSS
  // ============================================================

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = `
      .scw-cr-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 200px;
      }

      .scw-cr-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 3px 6px;
        border-radius: 4px;
        background: rgba(0,0,0,0.03);
        transition: background 0.15s;
        width: 100%;
        box-sizing: border-box;
      }
      .scw-cr-item:hover {
        background: rgba(0,0,0,0.06);
      }

      .scw-cr-item-warn {
        background: #fff3cd !important;
        border-left: 3px solid #d97706;
      }
      .scw-cr-item-warn:hover {
        background: #ffecb3 !important;
      }

      .scw-cr-link {
        flex: 1 1 0%;
        min-width: 0;
        font-size: 12px;
        line-height: 1.3;
        color: #1a73e8;
        text-decoration: none;
        padding: 2px 4px;
        word-break: break-word;
      }
      .scw-cr-link:hover {
        text-decoration: underline;
      }

      .scw-cr-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        background: none;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: #999;
        padding: 0;
        flex-shrink: 0;
        transition: color 0.15s, background 0.15s;
      }
      .scw-cr-remove:hover {
        color: #d93025;
        background: rgba(217,48,37,0.08);
      }
      .scw-cr-remove svg {
        width: 14px;
        height: 14px;
      }
      .scw-cr-item.scw-cr-deleting {
        opacity: 0.5;
        pointer-events: none;
      }

      .scw-cr-add {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: none;
        border: 1px dashed rgba(0,0,0,0.2);
        border-radius: 4px;
        cursor: pointer;
        color: #666;
        font-size: 11px;
        padding: 3px 8px;
        margin-top: 2px;
        transition: color 0.15s, border-color 0.15s;
      }
      .scw-cr-add:hover {
        color: #1a73e8;
        border-color: #1a73e8;
      }

      .scw-cr-empty {
        font-size: 11px;
        color: #999;
        font-style: italic;
        padding: 2px 4px;
      }

      .scw-cr-warning {
        color: #d97706;
        font-size: 14px;
        flex-shrink: 0;
        line-height: 1;
      }

      .scw-cr-hdr-warning {
        color: #b45309;
        display: inline-flex;
        align-items: center;
        margin-left: 10px;
        flex-shrink: 0;
        padding-top: 5px;
      }
      .scw-cr-hdr-warning svg {
        width: 18px;
        height: 18px;
      }

      /* ── Delete confirmation modal ── */
      .scw-cr-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.45);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: scwCrFadeIn 0.15s ease-out;
      }
      @keyframes scwCrFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .scw-cr-modal {
        background: #fff;
        border-radius: 12px;
        padding: 28px 32px 24px;
        max-width: 380px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        text-align: center;
      }
      .scw-cr-modal__icon {
        font-size: 36px;
        margin-bottom: 12px;
      }
      .scw-cr-modal__msg {
        font-size: 15px;
        font-weight: 600;
        color: #333;
        margin-bottom: 8px;
      }
      .scw-cr-modal__name {
        font-size: 13px;
        color: #666;
        margin-bottom: 20px;
        word-break: break-word;
      }
      .scw-cr-modal__btns {
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      .scw-cr-modal__btn {
        padding: 8px 20px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: background 0.15s, transform 0.1s;
      }
      .scw-cr-modal__btn:active {
        transform: scale(0.97);
      }
      .scw-cr-modal__btn--cancel {
        background: #f1f3f4;
        color: #333;
      }
      .scw-cr-modal__btn--cancel:hover {
        background: #e0e2e4;
      }
      .scw-cr-modal__btn--confirm {
        background: #d93025;
        color: #fff;
      }
      .scw-cr-modal__btn--confirm:hover {
        background: #b71c1c;
      }

      /* Hide parent-connection field on add-accessory form before JS runs */
      #view_3580 #kn-input-field_2464,
      #view_3590 #kn-input-field_2464 {
        display: none !important;
      }
    `;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // DOM READING
  // ============================================================

  var REMOVE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  /**
   * Extract record ID from a connection link href.
   * Knack hrefs look like: #pages/scene_xxx/.../view_xxx/recordId
   * The record ID is the last 24-char hex segment.
   */
  function extractRecordId(href) {
    if (!href) return '';
    var match = href.match(/([a-f0-9]{24})(?:[\/]?$)/);
    return match ? match[1] : '';
  }

  /**
   * Extract connection data from a field <td> element.
   * Handles two Knack DOM formats:
   *   1) <a data-kn="connection-link"> wrapping <span data-kn="connection-value">
   *   2) Bare <span data-kn="connection-value"> (no anchor wrapper)
   * Returns [{text, href, recordId}].
   */
  function readLinksFromTd(td) {
    var links = [];

    // Format 1: anchor-wrapped connection links
    var anchors = td.querySelectorAll('a[data-kn="connection-link"]');
    if (anchors.length) {
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        var span = a.querySelector('span[data-kn="connection-value"]');
        var text = span ? span.textContent.trim() : a.textContent.trim();
        var href = a.getAttribute('href') || '';
        var recId = '';
        if (span && span.id && /^[a-f0-9]{24}$/.test(span.id)) {
          recId = span.id;
        } else {
          recId = extractRecordId(href);
        }
        if (text && text !== '&nbsp;' && text !== '\u00a0') {
          links.push({ text: text, href: href, recordId: recId });
        }
      }
      return links;
    }

    // Format 2: bare spans (no anchor wrapper) — e.g. field_1958
    var spans = td.querySelectorAll('span[data-kn="connection-value"]');
    for (var j = 0; j < spans.length; j++) {
      var sp = spans[j];
      var spText = sp.textContent.trim();
      var spId = (sp.id && /^[a-f0-9]{24}$/.test(sp.id)) ? sp.id : '';
      if (spText && spText !== '&nbsp;' && spText !== '\u00a0') {
        links.push({ text: spText, href: '', recordId: spId });
      }
    }
    return links;
  }

  function readConnectionLinks(tr, fieldKey) {
    // When duplicate columns exist for the same field key, querySelector
    // returns the first (possibly empty) td.  Try all matching tds and
    // return the first set that contains actual connection data.
    var tds = tr.querySelectorAll('td.' + fieldKey);
    if (!tds.length) return [];

    for (var t = 0; t < tds.length; t++) {
      var links = readLinksFromTd(tds[t]);
      if (links.length) return links;
    }
    // No td had links — return empty from the first td (preserves old behavior)
    return [];
  }

  /**
   * Find the add-accessory-line-item URL from the row's link columns.
   * If no explicit add link exists, derive one by swapping editSlug → addSlug
   * in an existing edit link (for views that lack a dedicated add action column).
   */
  function findAddUrl(tr, slug, editSlug) {
    var anchors = tr.querySelectorAll('td.kn-table-link a');
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute('href') || '';
      if (href.indexOf(slug) !== -1) return href;
    }

    // Fallback: derive from an edit link by replacing editSlug with addSlug
    if (editSlug) {
      for (var j = 0; j < anchors.length; j++) {
        var editHref = anchors[j].getAttribute('href') || '';
        if (editHref.indexOf(editSlug) !== -1) {
          return editHref.replace(editSlug, slug);
        }
      }
    }

    return '';
  }

  // ============================================================
  // KNACK API HELPERS
  // ============================================================

  /**
   * Find the Knack object key that owns a given field key.
   * Searches Knack.objects (Backbone collection) at runtime.
   * Returns the object key (e.g. 'object_123') or null.
   */
  function getObjectKeyForField(fieldKey) {
    try {
      var models = Knack.objects.models;
      for (var i = 0; i < models.length; i++) {
        var fields = models[i].attributes.fields;
        for (var j = 0; j < fields.length; j++) {
          if (fields[j].key === fieldKey) return models[i].attributes.key;
        }
      }
    } catch (e) {
      console.warn('[SCW][CR-DELETE] Could not search Knack.objects:', e);
    }
    return null;
  }

  /**
   * Clear a field on a record via Knack's internal model API.
   * Uses the scene/view REST endpoint (CORS-safe within Knack).
   * Tries Knack.views[viewId].model.updateRecord first, then
   * falls back to a direct scene/view PUT.
   * Returns a Promise that resolves on success or rejects on error.
   */
  function clearFieldOnRecord(viewId, recordId, fieldKey) {
    var data = {};
    data[fieldKey] = '';

    // Approach 1: Knack's internal model API
    try {
      var viewObj = Knack.views[viewId];
      if (viewObj && viewObj.model && typeof viewObj.model.updateRecord === 'function') {
        return new Promise(function (resolve, reject) {
          viewObj.model.updateRecord(recordId, data, {
            success: function () { resolve(); },
            error: function () { reject(new Error('updateRecord failed')); }
          });
        });
      }
    } catch (e) {
      console.warn('[SCW][CR-DELETE] updateRecord not available:', e);
    }

    // Approach 2: Direct scene/view PUT (CORS-safe)
    return new Promise(function (resolve, reject) {
      SCW.knackAjax({
        url: SCW.knackRecordUrl(viewId, recordId),
        type: 'PUT',
        data: JSON.stringify(data),
        success: function () { resolve(); },
        error: function (xhr) { reject(new Error('PUT ' + xhr.status)); }
      });
    });
  }

  // ============================================================
  // DELETE CONFIRMATION + WEBHOOK
  // ============================================================

  /**
   * Show a confirmation modal. Returns a Promise that resolves
   * true (delete) or false (cancel).
   */
  function confirmDelete(recordName) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'scw-cr-modal-overlay';

      overlay.innerHTML =
        '<div class="scw-cr-modal">' +
          '<div class="scw-cr-modal__icon">\u26A0\uFE0F</div>' +
          '<div class="scw-cr-modal__msg">Are you fucking sure you want to delete this?</div>' +
          '<div class="scw-cr-modal__name"></div>' +
          '<div class="scw-cr-modal__btns">' +
            '<button class="scw-cr-modal__btn scw-cr-modal__btn--cancel">Cancel</button>' +
            '<button class="scw-cr-modal__btn scw-cr-modal__btn--confirm">Remove</button>' +
          '</div>' +
        '</div>';

      // Set name safely via textContent to avoid XSS
      overlay.querySelector('.scw-cr-modal__name').textContent = recordName;

      function close(result) {
        overlay.remove();
        resolve(result);
      }

      overlay.querySelector('.scw-cr-modal__btn--cancel').addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); close(false);
      });
      overlay.querySelector('.scw-cr-modal__btn--confirm').addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); close(true);
      });

      // Click outside modal = cancel
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(false);
      });

      // Escape key = cancel
      function onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          close(false);
        }
      }
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);

      // Auto-focus cancel button
      overlay.querySelector('.scw-cr-modal__btn--cancel').focus();
    });
  }

  /**
   * Find the CONFIG entry that owns a given record ID (by checking which
   * view's widget contains the itemEl).  Falls back to the first entry.
   */
  function findCfgForItem(itemEl) {
    for (var i = 0; i < CONFIG.views.length; i++) {
      var cfg = CONFIG.views[i];
      var viewEl = itemEl.closest('#' + cfg.parentViewId);
      if (viewEl) return cfg;
    }
    return CONFIG.views[0] || null;
  }

  /**
   * Disconnect the accessory record from its parent (clear the back-
   * connection field) then delete it via the Make webhook.
   *
   * Clearing the parent connection BEFORE delete prevents Knack from
   * cascading the delete up to the parent record.
   *
   * @param {string} recordId   - The 24-char record ID to delete
   * @param {string} recordName - Display name (for logging)
   * @param {HTMLElement} itemEl - The .scw-cr-item element (for UI state)
   */
  function deleteRecord(recordId, recordName, itemEl) {
    var webhookUrl = (window.SCW && window.SCW.CONFIG && window.SCW.CONFIG.MAKE_DELETE_RECORD_WEBHOOK) || '';
    if (!webhookUrl) {
      console.error('[SCW] No MAKE_DELETE_RECORD_WEBHOOK configured');
      return;
    }

    var cfg = findCfgForItem(itemEl);
    var parentField = cfg ? cfg.parentConnectionField : null;

    console.log('[SCW][CR-DELETE] deleteRecord called', {
      recordId: recordId,
      recordName: recordName,
      parentConnectionField: parentField
    });

    // Visual pending state
    itemEl.classList.add('scw-cr-deleting');

    // Step 1: Clear the parent connection field so Knack can't cascade
    var disconnectPromise;
    var viewId = cfg ? cfg.parentViewId : null;
    if (parentField && viewId) {
      console.log('[SCW][CR-DELETE] Disconnecting: clearing', parentField,
                  'on', recordId, 'via', viewId);
      disconnectPromise = clearFieldOnRecord(viewId, recordId, parentField)
        .then(function () {
          console.log('[SCW][CR-DELETE] Disconnect succeeded');
        })
        .catch(function (err) {
          console.warn('[SCW][CR-DELETE] Disconnect failed, proceeding with delete anyway:', err);
        });
    } else {
      disconnectPromise = Promise.resolve();
    }

    // Step 2: After disconnect, send the delete webhook
    disconnectPromise.then(function () {
      console.log('[SCW][CR-DELETE] Sending webhook POST…');
      return fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: recordId, recordName: recordName })
      });
    })
    .then(function (resp) {
      console.log('[SCW][CR-DELETE] Webhook response status:', resp.status);
      if (!resp.ok) throw new Error('Webhook returned ' + resp.status);
      return resp.json().catch(function () { return {}; });
    })
    .then(function (body) {
      console.log('[SCW][CR-DELETE] Webhook response body:', body);

      // Remove the item from the DOM
      itemEl.remove();

      // Trigger preservation pipeline + refresh parent views
      $(document).trigger('knack-cell-update.scwScrollPreserve');
      CONFIG.views.forEach(function (cfg) {
        var viewObj = Knack.views[cfg.parentViewId];
        if (viewObj && viewObj.model && viewObj.model.fetch) {
          viewObj.model.fetch();
        }
      });
    })
    .catch(function (err) {
      console.error('[SCW][CR-DELETE] Delete record error:', err);
      itemEl.classList.remove('scw-cr-deleting');
      alert('Delete failed: ' + err.message);
    });
  }

  /**
   * Handle trash icon click: confirm, then delete via webhook.
   */
  function onDeleteClick(recordId, recordName, itemEl) {
    console.log('[SCW][CR-DELETE] onDeleteClick fired', {
      recordId: recordId,
      recordName: recordName
    });
    confirmDelete(recordName).then(function (confirmed) {
      console.log('[SCW][CR-DELETE] Confirmation result:', confirmed);
      if (!confirmed) return;
      deleteRecord(recordId, recordName, itemEl);
    });
  }

  // ============================================================
  // WARNING ICON — async field check on connected records
  // ============================================================

  var WARNING_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  /**
   * Build a map of recordId → boolean from a warning field cell in the DOM.
   * Reads per-record span[id][data-kn="connection-value"] elements (same
   * pattern as inline-photo-row's extractPhotoRecords reads field_2446).
   * Falls back to reading the cell's plain text when no per-record spans exist.
   */
  function buildWarningMap(tr, warningFieldKey) {
    var map = {};
    if (!tr || !warningFieldKey) return map;

    var cell = tr.querySelector('td[data-field-key="' + warningFieldKey + '"]');
    if (!cell) return map;

    // Per-record connection-value spans (preferred — like photo strip)
    var spans = cell.querySelectorAll('span[id][data-kn="connection-value"]');
    if (spans.length > 0) {
      for (var i = 0; i < spans.length; i++) {
        var rid = (spans[i].id || '').trim();
        if (!rid) continue;
        var val = (spans[i].textContent || '').trim().toLowerCase();
        map[rid] = (val === 'yes' || val === 'true');
      }
    } else {
      // Single value for all items (fallback)
      var plainVal = (cell.textContent || '').trim().toLowerCase();
      map._all = (plainVal === 'yes' || plainVal === 'true');
    }

    return map;
  }

  /**
   * If the warning map indicates this record should show a warning,
   * prepend a warning icon to the item element.
   */
  function applyWarningIcon(warningMap, recordId, itemEl) {
    var isYes = warningMap.hasOwnProperty(recordId)
      ? warningMap[recordId]
      : (warningMap._all || false);

    if (!isYes) {
      itemEl.classList.add('scw-cr-item-warn');
      var icon = document.createElement('span');
      icon.className = 'scw-cr-warning';
      icon.innerHTML = WARNING_SVG;
      icon.title = 'Accessory does not match parent product';
      var linkEl = itemEl.querySelector('.scw-cr-link');
      if (linkEl) {
        itemEl.insertBefore(icon, linkEl);
      }
      return true; // warning was applied
    }
    return false; // no warning
  }

  // ============================================================
  // WIDGET BUILDER
  // ============================================================

  function findConfig(viewId) {
    for (var i = 0; i < CONFIG.views.length; i++) {
      if (CONFIG.views[i].parentViewId === viewId) return CONFIG.views[i];
    }
    return null;
  }

  /**
   * Build the connected-records widget for a detail panel.
   * Called from device-worksheet.js renderDetailField.
   * @param {string} viewId   - Parent view ID (e.g. 'view_3313')
   * @param {string} recordId - Parent record ID (24-char hex)
   * @param {string} fieldKey - Connection field key (e.g. 'field_1963')
   * @param {HTMLElement} tr  - The original Knack table row
   * @returns {HTMLElement|null}
   */
  function buildWidget(viewId, recordId, fieldKey, tr) {
    var cfg = findConfig(viewId);
    if (!cfg || !tr) return null;

    var container = document.createElement('div');
    container.className = 'scw-ws-field';

    // Label
    var label = document.createElement('div');
    label.className = 'scw-ws-field-label';
    label.textContent = cfg.label;
    container.appendChild(label);

    // Value container (the list)
    var valueDiv = document.createElement('div');
    valueDiv.className = 'scw-ws-field-value scw-cr-list';
    container.appendChild(valueDiv);

    // Read links from DOM
    var links = readConnectionLinks(tr, fieldKey);
    var addUrl = findAddUrl(tr, cfg.addSlug, cfg.editSlug);

    console.log('[SCW][CR-DELETE] buildWidget links for', viewId, fieldKey, links.map(function (l) {
      return { text: l.text, recordId: l.recordId, href: l.href };
    }));

    // Build warning map from DOM (like photo strip reads field_2446)
    var warningMap = cfg.warningField ? buildWarningMap(tr, cfg.warningField) : {};

    // Render items
    var hasAnyWarning = false;
    if (links.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'scw-cr-empty';
      empty.textContent = '\u2014';
      valueDiv.appendChild(empty);
    } else {
      for (var i = 0; i < links.length; i++) {
        var item = document.createElement('div');
        item.className = 'scw-cr-item';

        var linkEl;
        var itemHref = links[i].href;

        // Rewrite item href when itemSlug is configured
        if (cfg.itemSlug && links[i].recordId) {
          if (itemHref) {
            // Replace the slug portion in existing href (e.g. add-photo-to-sow-line-item2 → edit-accessory-line-item2)
            itemHref = itemHref.replace(/\/[^\/]+\/([a-f0-9]{24})\/?$/, '/' + cfg.itemSlug + '/$1');
          } else if (addUrl) {
            // Construct from addUrl by swapping in the accessory record ID
            itemHref = addUrl.replace(/[a-f0-9]{24}\/?$/, links[i].recordId);
          }
          // Fallback: if regex didn't match, construct from current hash path
          if (cfg.itemSlug && links[i].recordId && itemHref === links[i].href) {
            var hashBase = (window.location.hash || '').replace(/\/[^\/]+\/[a-f0-9]{24}\/?$/, '');
            if (hashBase) itemHref = hashBase + '/' + cfg.itemSlug + '/' + links[i].recordId;
          }
        }

        if (itemHref) {
          linkEl = document.createElement('a');
          linkEl.href = itemHref;
        } else {
          linkEl = document.createElement('span');
        }
        linkEl.className = 'scw-cr-link';
        linkEl.textContent = links[i].text;
        linkEl.title = links[i].text;
        item.appendChild(linkEl);

        // Trash icon (only if we have a record ID)
        if (links[i].recordId) {
          var delBtn = document.createElement('button');
          delBtn.className = 'scw-cr-remove';
          delBtn.title = 'Delete';
          delBtn.innerHTML = REMOVE_SVG;
          delBtn.setAttribute('data-record-id', links[i].recordId);
          delBtn.setAttribute('data-record-name', links[i].text);
          (function (rid, rname, el, btn) {
            btn.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              onDeleteClick(rid, rname, el);
            });
          })(links[i].recordId, links[i].text, item, delBtn);
          item.appendChild(delBtn);
        }

        // Warning icon from DOM data (no API call needed)
        if (cfg.warningField && links[i].recordId) {
          if (applyWarningIcon(warningMap, links[i].recordId, item)) {
            hasAnyWarning = true;
          }
        }

        valueDiv.appendChild(item);
      }
    }

    // "+ Add" button
    if (addUrl) {
      var addBtn = document.createElement('a');
      addBtn.className = 'scw-cr-add';
      addBtn.textContent = '+ Add';
      addBtn.href = addUrl;
      valueDiv.appendChild(addBtn);
    }

    // Return element + warning state so the caller can add header warning
    container._hasWarning = hasAnyWarning;
    return container;
  }

  // ============================================================
  // AUTO-POPULATE PARENT CONNECTION ON ADD FORM
  // ============================================================
  //
  // When add-accessory-line-item form (view_3580) renders,
  // grab the parent scope line item ID from the URL hash
  // and set field_2464 (connection back to parent).

  function initAddAccessoryForm(viewId) {
    $(document).on('knack-view-render.' + viewId, function (event, view, data) {
      var hash = window.location.hash || '';
      // URL: #.../add-accessory-line-item/{parentRecordId} or add-accessory-line-item2/...
      var match = hash.match(/add-accessory-line-item[2]?\/([a-f0-9]{24})/);
      if (!match) return;

      var parentId = match[1];

      setTimeout(function () {
        // field_2464 is a Chosen.js connection select — set the <select> value,
        // update the hidden connection input, and trigger Chosen to refresh.
        var $select = $('#' + viewId + '-field_2464');
        var $hidden = $('#kn-input-field_2464 input.connection[name="field_2464"]');

        $select.val(parentId);
        $select.trigger('chosen:updated');
        $select.trigger('liszt:updated');
        $hidden.val(parentId);
        $select.trigger('change');
      }, 1);

      // On form submit, trigger the scroll/accordion preservation pipeline
      // so the parent page restores accordion state after Knack re-renders.
      $('#' + viewId + ' form').off('submit.scwCR').on('submit.scwCR', function () {
        $(document).trigger('knack-cell-update.scwScrollPreserve');
      });
    });
  }

  initAddAccessoryForm('view_3580');
  initAddAccessoryForm('view_3590');

  // ============================================================
  // PUBLIC API
  // ============================================================

  window.SCW = window.SCW || {};
  SCW.connectedRecords = {
    buildWidget: function (viewId, recordId, fieldKey, tr) {
      injectStyles();
      return buildWidget(viewId, recordId, fieldKey, tr);
    }
  };

})();
