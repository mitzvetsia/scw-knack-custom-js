/*** CUSTOM MDF/IDF PICKER FOR field_2375 ON view_3505 ***/
/**
 * Replaces Knack's native single-connection editor for the MDF/IDF
 * field on Survey Line Items. Knack's editor is a search-driven popover
 * that doesn't pre-populate any options, so it can't be filtered by
 * hiding <option>s. Instead we intercept the click, show our own modal
 * listing exactly the records currently rendered by view_3617
 * (OPS_MDF-IDFs on the same scene), and PUT field_2375 directly.
 *
 * Pattern mirrors connection-picker.js (which does the same trick for
 * field_1957 on view_3586/3610). Single-select instead of multi.
 */
(function () {
  'use strict';

  var LOG_PREFIX  = '[scwMdfIdfPicker]';
  var STYLE_ID    = 'scw-mdf-idf-picker-css';
  var CLASS_PFX   = 'scw-mip';

  var CFG = {
    TARGET_VIEW:    'view_3505',
    TARGET_FIELD:   'field_2375',
    SOURCE_VIEW:    'view_3617',
    SOURCE_LABEL:   'field_1642',  // identifier on the MDF/IDF object
    // Fallback label parts when the auto-built identifier is empty —
    // happens when the user hasn't filled in Name/## on the MDF/IDF
    // record yet, so field_1642 renders as just "HEADEND: :" or similar.
    SOURCE_TYPE:    'field_1641',  // HEADEND | IDF
    SOURCE_NUM:     'field_2458',  // ##
    SOURCE_NAME:    'field_1943',  // Name
    DEBUG:          true
  };

  function log() {
    if (!CFG.DEBUG || !window.console) return;
    var args = [LOG_PREFIX].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  // ── Styles ──────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var P = '.' + CLASS_PFX;
    var css = [
      P + '-backdrop {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(0,0,0,0.45);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font: 14px/1.4 system-ui, -apple-system, sans-serif;',
      '}',
      P + '-modal {',
      '  background: #fff; border-radius: 10px;',
      '  box-shadow: 0 20px 60px rgba(0,0,0,0.35);',
      '  width: 420px; max-width: 95vw; max-height: 90vh;',
      '  display: flex; flex-direction: column; overflow: hidden;',
      '}',
      P + '-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 14px 18px; border-bottom: 1px solid #e5e7eb; background: #f9fafb;',
      '}',
      P + '-title { margin: 0; font-size: 15px; font-weight: 700; color: #111827; }',
      P + '-close {',
      '  appearance: none; background: none; border: none;',
      '  color: #6b7280; font-size: 22px; line-height: 1; cursor: pointer;',
      '  padding: 2px 6px; margin: -4px -4px -4px 8px; border-radius: 4px;',
      '}',
      P + '-close:hover { color: #111827; background: #e5e7eb; }',
      P + '-body { padding: 8px 0; overflow-y: auto; flex: 1 1 auto; }',
      P + '-row {',
      '  display: flex; align-items: center; gap: 10px;',
      '  padding: 10px 18px; cursor: pointer; user-select: none;',
      '  border-bottom: 1px solid #f3f4f6;',
      '}',
      P + '-row:hover { background: #f3f4f6; }',
      P + '-row.is-current { background: #eef2f7; font-weight: 600; color: #163C6E; }',
      P + '-row.is-clear { color: #6b7280; font-style: italic; }',
      P + '-row[disabled], ' + P + '-row.is-saving { opacity: 0.55; pointer-events: none; }',
      P + '-empty { padding: 24px 18px; text-align: center; color: #6b7280; font-size: 13px; }',
      P + '-error {',
      '  background: #fef2f2; color: #991b1b; border-bottom: 1px solid #fecaca;',
      '  padding: 10px 18px; font-size: 13px; font-weight: 500;',
      '}',
      P + '-footer {',
      '  display: flex; align-items: center; gap: 8px;',
      '  padding: 12px 18px; border-top: 1px solid #e5e7eb; background: #f9fafb;',
      '}',
      P + '-status { font-size: 12px; color: #4b5563; flex: 1; }',
      P + '-status.is-saving::before {',
      '  content: ""; display: inline-block; width: 12px; height: 12px;',
      '  margin-right: 6px; vertical-align: -2px;',
      '  border: 2px solid #cbd5e1; border-top-color: #163C6E;',
      '  border-radius: 50%; animation: scw-mip-spin 0.7s linear infinite;',
      '}',
      '@keyframes scw-mip-spin { to { transform: rotate(360deg); } }',
      P + '-btn {',
      '  appearance: none; border: 1px solid #d1d5db; background: #fff; color: #374151;',
      '  padding: 7px 16px; border-radius: 6px;',
      '  font-size: 13px; font-weight: 600; cursor: pointer;',
      '}',
      P + '-btn:hover { background: #f3f4f6; }',
      P + '-btn[disabled] { opacity: 0.55; cursor: default; pointer-events: none; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Read records from the source view's model ──────────────────
  // Try several paths — Knack.views[viewId].model is the obvious one,
  // but the view's Backbone View can be torn down/rebuilt while the
  // model lives on under Knack.models[viewId]. We also scan Knack.models
  // for any model whose view.key matches, since some views (filtered,
  // wrapped) register the model under a derived key.
  function findSourceModel() {
    if (typeof Knack === 'undefined') return null;
    if (Knack.views && Knack.views[CFG.SOURCE_VIEW] &&
        Knack.views[CFG.SOURCE_VIEW].model) {
      return Knack.views[CFG.SOURCE_VIEW].model;
    }
    if (Knack.models && Knack.models[CFG.SOURCE_VIEW]) {
      return Knack.models[CFG.SOURCE_VIEW];
    }
    if (Knack.models) {
      var keys = Object.keys(Knack.models);
      for (var i = 0; i < keys.length; i++) {
        var m = Knack.models[keys[i]];
        if (m && m.view && m.view.key === CFG.SOURCE_VIEW) return m;
      }
    }
    return null;
  }

  function extractRecords(model) {
    if (!model) return [];
    if (model.data) {
      if (Array.isArray(model.data)) return model.data;
      if (model.data.models && Array.isArray(model.data.models)) {
        return model.data.models.map(function (m) {
          return (m && m.attributes) || m;
        });
      }
      if (typeof model.data.toJSON === 'function') return model.data.toJSON();
    }
    if (model.models && Array.isArray(model.models)) {
      return model.models.map(function (m) {
        return (m && m.attributes) || m;
      });
    }
    return [];
  }

  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim();
  }

  // A label is "weak" when it has no alphanumerics — e.g. "HEADEND: :"
  // collapses to "HEADEND ::" with only colons/spaces aside from the
  // type word. We still treat anything with letters/digits as good.
  function isWeakLabel(s) {
    return !/[A-Za-z0-9]/.test(String(s || '').replace(/HEADEND|IDF|MDF/gi, ''));
  }

  function buildLabel(attrs) {
    // Try the auto-built identifier first.
    var identifier = stripHtml(attrs[CFG.SOURCE_LABEL]);
    if (identifier && !isWeakLabel(identifier)) return identifier;
    // Compose from parts.
    var type = stripHtml(attrs[CFG.SOURCE_TYPE]);
    var num  = stripHtml(attrs[CFG.SOURCE_NUM]);
    var name = stripHtml(attrs[CFG.SOURCE_NAME]);
    var parts = [];
    if (type) parts.push(type);
    if (num)  parts.push('#' + num);
    if (name) parts.push(name);
    if (parts.length) return parts.join(' ');
    // Last resort: the original (even if weak) or identifier
    if (identifier) return identifier;
    if (attrs.identifier) return stripHtml(attrs.identifier);
    return '';
  }

  function getSourceRecords() {
    var model = findSourceModel();
    var records = extractRecords(model);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var attrs = records[i] || {};
      if (!attrs.id) continue;
      var label = buildLabel(attrs);
      out.push({ id: attrs.id, label: label || attrs.id });
    }
    // Natural-order sort so "IDF 2" < "IDF 10"
    out.sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label),
        undefined, { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  // ── Read the line item's currently-selected MDF/IDF id ─────────
  function getCurrentSelection(recordId) {
    if (typeof Knack === 'undefined') return null;
    var model = (Knack.views && Knack.views[CFG.TARGET_VIEW] &&
                 Knack.views[CFG.TARGET_VIEW].model) ||
                (Knack.models && Knack.models[CFG.TARGET_VIEW]) ||
                null;
    var records = extractRecords(model);
    for (var i = 0; i < records.length; i++) {
      var attrs = records[i] || {};
      if (attrs.id !== recordId) continue;
      var raw = attrs[CFG.TARGET_FIELD + '_raw'];
      if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
      if (raw && raw.id) return raw.id;
      return null;
    }
    return null;
  }

  // ── Modal ──────────────────────────────────────────────────────
  function openModal(recordId) {
    injectStyles();

    var records = getSourceRecords();
    var currentId = getCurrentSelection(recordId);

    var backdrop = document.createElement('div');
    backdrop.className = CLASS_PFX + '-backdrop';

    var modal = document.createElement('div');
    modal.className = CLASS_PFX + '-modal';

    var header = document.createElement('div');
    header.className = CLASS_PFX + '-header';
    var titleEl = document.createElement('h2');
    titleEl.className = CLASS_PFX + '-title';
    titleEl.textContent = 'Move to MDF/IDF';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = CLASS_PFX + '-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');
    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    var errorBar = document.createElement('div');
    errorBar.className = CLASS_PFX + '-error';
    errorBar.style.display = 'none';

    var body = document.createElement('div');
    body.className = CLASS_PFX + '-body';

    if (!records.length) {
      var empty = document.createElement('div');
      empty.className = CLASS_PFX + '-empty';
      var sourceModel = findSourceModel();
      if (!sourceModel) {
        empty.innerHTML =
          'Could not read MDF/IDF choices.<br>' +
          '<small style="color:#9ca3af">' +
          'Source view ' + CFG.SOURCE_VIEW + ' is not on this scene. ' +
          'Reload the page and try again — if this persists, share the ' +
          'console output.</small>';
      } else {
        empty.textContent = 'No MDF/IDF records on this survey yet.';
      }
      body.appendChild(empty);
      log('source model:', sourceModel, 'records:', records);
    } else {
      // "Unassigned" option first — clears the connection
      var clearRow = document.createElement('div');
      clearRow.className = CLASS_PFX + '-row ' + CLASS_PFX + '-row--clear is-clear';
      clearRow.setAttribute('data-id', '');
      clearRow.textContent = '— Unassigned —';
      if (!currentId) clearRow.classList.add('is-current');
      body.appendChild(clearRow);

      for (var i = 0; i < records.length; i++) {
        var row = document.createElement('div');
        row.className = CLASS_PFX + '-row';
        row.setAttribute('data-id', records[i].id);
        row.textContent = records[i].label;
        if (currentId && currentId === records[i].id) row.classList.add('is-current');
        body.appendChild(row);
      }
    }

    var footer = document.createElement('div');
    footer.className = CLASS_PFX + '-footer';
    var statusEl = document.createElement('div');
    statusEl.className = CLASS_PFX + '-status';
    statusEl.textContent = records.length + ' available';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = CLASS_PFX + '-btn';
    cancelBtn.textContent = 'Cancel';
    footer.appendChild(statusEl);
    footer.appendChild(cancelBtn);

    modal.appendChild(header);
    modal.appendChild(errorBar);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    var closed = false;
    var saving = false;

    function close() {
      if (closed) return;
      closed = true;
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', onKey, true);
    }
    function tryCancel() {
      if (saving) return;
      close();
    }
    function showError(msg) {
      if (!msg) {
        errorBar.style.display = 'none';
        errorBar.textContent = '';
        return;
      }
      errorBar.textContent = msg;
      errorBar.style.display = 'block';
    }
    function setSaving(isSaving, label) {
      saving = !!isSaving;
      cancelBtn.disabled = saving;
      closeBtn.disabled = saving;
      var rows = body.querySelectorAll('.' + CLASS_PFX + '-row');
      for (var i = 0; i < rows.length; i++) {
        if (saving) rows[i].classList.add('is-saving');
        else rows[i].classList.remove('is-saving');
      }
      if (saving) {
        statusEl.classList.add('is-saving');
        statusEl.textContent = label || 'Saving…';
      } else {
        statusEl.classList.remove('is-saving');
        statusEl.textContent = records.length + ' available';
      }
    }

    closeBtn.addEventListener('click', tryCancel);
    cancelBtn.addEventListener('click', tryCancel);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) tryCancel();
    });
    function onKey(e) { if (e.key === 'Escape') tryCancel(); }
    document.addEventListener('keydown', onKey, true);

    body.addEventListener('click', function (e) {
      if (saving) return;
      var row = e.target.closest && e.target.closest('.' + CLASS_PFX + '-row');
      if (!row) return;
      var newId = row.getAttribute('data-id') || '';
      if ((newId || '') === (currentId || '')) {
        close();
        return;
      }
      saveSelection(recordId, newId, function (err) {
        if (err) {
          setSaving(false);
          var msg = 'Failed to save.';
          if (err && err.status) msg += ' HTTP ' + err.status + '.';
          if (err && err.responseText) {
            var body;
            try { body = JSON.parse(err.responseText); }
            catch (parseErr) { body = null; }
            if (body && body.errors && body.errors[0] && body.errors[0].message) {
              msg += ' ' + body.errors[0].message;
            } else if (typeof err.responseText === 'string' &&
                       err.responseText.length < 200) {
              msg += ' ' + err.responseText;
            }
          }
          showError(msg + ' (See console for details.)');
          return;
        }
        // Camera now lives in a new MDF/IDF — if its current Connected
        // To switch is in a DIFFERENT MDF/IDF, the linkage no longer
        // makes physical sense. Clear field_2381 BEFORE refreshing so
        // the view rebuilds against fresh data; otherwise the refresh
        // fetches while the clear PUT is still in flight and the row
        // renders with the stale Connected To.
        clearStaleConnection(recordId, newId, function () {
          close();
          refreshTargetView();
        });
      });
      setSaving(true);
      showError('');
    });
  }

  // ── Object-scoped fallback ───────────────────────────────────
  // When the view-scoped endpoint silently strips field_2375 from
  // the request, retry against the object-scoped endpoint. Object-
  // scoped writes skip view-level inline-edit allow-lists and
  // view-level submit rules. Object key is discovered dynamically
  // from Knack.objects via the view's source.
  function findObjectKeyForView(viewId) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewId];
      var src = v && v.model && v.model.view && v.model.view.source;
      if (src && src.object) return src.object;
    } catch (e) { /* fall through */ }
    try {
      var sceneViews = window.Knack && Knack.scenes &&
        Knack.router && Knack.router.scene_view &&
        Knack.router.scene_view.model &&
        Knack.router.scene_view.model.views;
      if (sceneViews && typeof sceneViews.get === 'function') {
        var viewObj = sceneViews.get(viewId);
        var src2 = viewObj && viewObj.attributes && viewObj.attributes.source;
        if (src2 && src2.object) return src2.object;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  function objectScopedRetry(recordId, newId, onDone) {
    var objectKey = findObjectKeyForView(CFG.TARGET_VIEW);
    if (!objectKey) {
      console.warn(LOG_PREFIX,
        'object-scoped retry: could not discover object key for ' +
        CFG.TARGET_VIEW + ' — falling back to view-scoped result');
      onDone(new Error('object key unavailable'));
      return;
    }
    var apiUrl = (window.Knack && Knack.api_url) || 'https://us-api.knack.com';
    var url = apiUrl + '/v1/objects/' + objectKey + '/records/' + recordId;
    var body = {};
    body[CFG.TARGET_FIELD] = newId ? [newId] : [];
    console.log(LOG_PREFIX, 'object-scoped PUT', recordId, body, '→', url);
    window.SCW.knackAjax({
      type: 'PUT',
      url: url,
      data: JSON.stringify(body),
      dataType: 'json',
      success: function (resp) {
        var R = (resp && resp.record) || resp || {};
        console.log(LOG_PREFIX, 'object-scoped PUT ok', recordId,
          'response field_2375:', R[CFG.TARGET_FIELD],
          'response field_2375_raw:', R[CFG.TARGET_FIELD + '_raw'],
          'full resp:', resp);
        if (typeof window.SCW.syncKnackModel === 'function') {
          try {
            window.SCW.syncKnackModel(CFG.TARGET_VIEW, recordId, resp,
              CFG.TARGET_FIELD, newId ? [newId] : []);
          } catch (e) { /* best-effort */ }
        }
        onDone(null, resp);
      },
      error: function (xhr) {
        console.error(LOG_PREFIX, 'object-scoped PUT failed',
          xhr && xhr.status, xhr && xhr.responseText);
        onDone(xhr || new Error('object-scoped save failed'));
      }
    });
  }

  // ── model.updateRecord retry ─────────────────────────────────
  // Some Knack views handle inline-edit field permissions only
  // through their Backbone view's updateRecord() helper, which
  // wraps the same view-scoped endpoint but with different
  // session/CSRF context than raw $.ajax. Worth one shot when
  // direct PUT got silently stripped.
  function modelUpdateRetry(recordId, newId, onDone) {
    try {
      var view = window.Knack && Knack.views && Knack.views[CFG.TARGET_VIEW];
      if (!view || !view.model || typeof view.model.updateRecord !== 'function') {
        console.warn(LOG_PREFIX,
          'model.updateRecord retry: view or updateRecord unavailable');
        onDone(new Error('updateRecord unavailable'));
        return;
      }
      var body = {};
      body[CFG.TARGET_FIELD] = newId ? [newId] : [];
      console.log(LOG_PREFIX, 'model.updateRecord', recordId, body);
      // Backbone callback signature varies by Knack version. Try
      // promise first, fall back to options.success/error.
      var maybePromise = view.model.updateRecord(recordId, body, {
        success: function (resp) {
          var R = (resp && resp.record) || resp || {};
          console.log(LOG_PREFIX, 'model.updateRecord ok', recordId,
            'response field_2375_raw:', R[CFG.TARGET_FIELD + '_raw'],
            'full resp:', resp);
          onDone(null, resp);
        },
        error: function (xhr) {
          console.error(LOG_PREFIX, 'model.updateRecord failed',
            xhr && xhr.status, xhr && xhr.responseText);
          onDone(xhr || new Error('updateRecord save failed'));
        }
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(
          function (resp) {
            var R = (resp && resp.record) || resp || {};
            console.log(LOG_PREFIX, 'model.updateRecord ok (promise)',
              recordId,
              'response field_2375_raw:', R[CFG.TARGET_FIELD + '_raw'],
              'full resp:', resp);
            onDone(null, resp);
          },
          function (err) {
            console.error(LOG_PREFIX,
              'model.updateRecord failed (promise)', err);
            onDone(err || new Error('updateRecord save failed'));
          }
        );
      }
    } catch (e) {
      console.error(LOG_PREFIX, 'model.updateRecord threw', e);
      onDone(e);
    }
  }

  // ── Post-save sanity check ─────────────────────────────────────
  // When the camera (or any survey line item) gets a new MDF/IDF,
  // walk its "Connected To" field (field_2381 — the back-connection
  // to the parent switch/NVR/etc.) and verify each connected device
  // lives in the SAME MDF/IDF as the camera now does. If any of them
  // are in a different MDF/IDF the linkage is stale — clear field_2381
  // so the camera doesn't ghost into the old switch's group on the
  // next render. Reciprocal Knack connections take care of dropping
  // the back-reference on the switch side; the mirror-connection-sync
  // cascade picks up that change on the next render.
  var CONNECTED_TO_FIELD       = 'field_2381'; // camera -> switch (back-ref)
  var CONNECTED_DEVICES_FIELD  = 'field_2380'; // switch -> camera (forward)

  function getRecordAttrs(recordId) {
    if (typeof Knack === 'undefined') return null;
    var model = (Knack.views && Knack.views[CFG.TARGET_VIEW] &&
                 Knack.views[CFG.TARGET_VIEW].model) ||
                (Knack.models && Knack.models[CFG.TARGET_VIEW]) ||
                null;
    var records = extractRecords(model);
    for (var i = 0; i < records.length; i++) {
      var attrs = records[i] || {};
      if (attrs.id === recordId) return attrs;
    }
    return null;
  }

  function mdfIdOf(attrs) {
    if (!attrs) return '';
    var raw = attrs[CFG.TARGET_FIELD + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
    if (raw && raw.id) return raw.id;
    return '';
  }

  // Callback-style so the modal-close path can wait for the PUT to
  // complete before triggering a view refresh. Without the wait, the
  // refresh fetches data while the clear PUT is still in flight and
  // the row renders with its STALE Connected To value.
  //
  // onDone(needsRefresh): true → clear PUT landed, caller should
  // refresh; false → no clear needed (no mismatch / no model record /
  // helpers unavailable), caller can refresh immediately for normal
  // post-MDF-change rendering.
  function clearStaleConnection(recordId, newMdfId, onDone) {
    function done(needsRefresh) {
      if (typeof onDone === 'function') {
        try { onDone(!!needsRefresh); } catch (e) { /* swallow */ }
      }
    }
    if (!recordId) { done(false); return; }
    var attrs = getRecordAttrs(recordId);
    if (!attrs) {
      log('clearStaleConnection: record not in model — skipping', recordId);
      done(false); return;
    }
    var connRaw = attrs[CONNECTED_TO_FIELD + '_raw'];
    if (!Array.isArray(connRaw) || !connRaw.length) { done(false); return; }

    // Collect every connected device that's in a DIFFERENT MDF/IDF.
    // These are the ones whose linkage to this camera is now stale and
    // need to be scrubbed off the camera's "Connected To" AND off each
    // switch's reciprocal "Connected Devices" (Knack does not reliably
    // auto-reciprocate multi-connection fields — see mirror-connection-
    // sync.js for the same pattern).
    var staleSwitchIds = [];
    for (var i = 0; i < connRaw.length; i++) {
      var connId = connRaw[i] && connRaw[i].id;
      if (!connId) continue;
      var connAttrs = getRecordAttrs(connId);
      if (!connAttrs) continue;        // not in this view's pagination
      var connMdfId = mdfIdOf(connAttrs);
      if (connMdfId && connMdfId !== newMdfId) {
        log('clearStaleConnection: switch',
            connId, 'is in MDF/IDF', connMdfId,
            '— camera moved to', newMdfId,
            '— will scrub from both sides');
        staleSwitchIds.push(connId);
      }
    }
    if (!staleSwitchIds.length) { done(false); return; }

    if (!window.SCW || typeof window.SCW.knackAjax !== 'function' ||
        typeof window.SCW.knackRecordUrl !== 'function') {
      done(false); return;
    }

    // Step 1: clear camera's CONNECTED_TO_FIELD.
    var url = window.SCW.knackRecordUrl(CFG.TARGET_VIEW, recordId);
    var body = {};
    body[CONNECTED_TO_FIELD] = [];
    window.SCW.knackAjax({
      type: 'PUT',
      url: url,
      data: JSON.stringify(body),
      dataType: 'json',
      success: function (resp) {
        log('clearStaleConnection: cleared', CONNECTED_TO_FIELD,
            'on', recordId, 'resp:', resp);
        if (typeof window.SCW.syncKnackModel === 'function') {
          try {
            window.SCW.syncKnackModel(CFG.TARGET_VIEW, recordId, resp,
              CONNECTED_TO_FIELD, []);
          } catch (e) { /* best-effort */ }
        }
        // Step 2: scrub camera off each upstream switch's
        // CONNECTED_DEVICES_FIELD.  Wait for all PUTs to land before
        // signalling done so the subsequent refresh fetches truly
        // fresh data on both sides.
        scrubReverseConnections(recordId, staleSwitchIds, function () {
          done(true);
        });
      },
      error: function (xhr) {
        console.warn(LOG_PREFIX, 'clearStaleConnection PUT failed',
          xhr && xhr.status, xhr && xhr.responseText);
        // Still refresh — the user moved the MDF successfully even
        // if the cleanup failed. Leaving them on a half-saved state
        // would be more confusing than just rendering stale.
        done(true);
      }
    });
  }

  // For each upstream switch, read its CONNECTED_DEVICES_FIELD from
  // the local model, filter out the camera, and PUT the trimmed list
  // back. Mirrors mirror-connection-sync.js's explicit two-sided write
  // — Knack does not reliably reciprocate multi-connection PUTs.
  function scrubReverseConnections(cameraId, switchIds, onAllDone) {
    var pending = switchIds.length;
    if (!pending) { onAllDone(); return; }
    function tick() {
      pending--;
      if (pending <= 0) onAllDone();
    }
    switchIds.forEach(function (switchId) {
      var switchAttrs = getRecordAttrs(switchId);
      if (!switchAttrs) {
        log('scrubReverseConnections: switch', switchId,
            'not in model — skipping (will be picked up on next render)');
        tick(); return;
      }
      var currentRaw = switchAttrs[CONNECTED_DEVICES_FIELD + '_raw'];
      if (!Array.isArray(currentRaw)) { tick(); return; }
      var keptIds = [];
      for (var k = 0; k < currentRaw.length; k++) {
        var rid = currentRaw[k] && currentRaw[k].id;
        if (rid && rid !== cameraId) keptIds.push(rid);
      }
      // No change — camera wasn't in the list (Knack already reciprocated,
      // or the list was stale in the local model). Nothing to PUT.
      if (keptIds.length === currentRaw.length) {
        log('scrubReverseConnections: switch', switchId,
            'did not list camera', cameraId, '— nothing to do');
        tick(); return;
      }
      var switchUrl = window.SCW.knackRecordUrl(CFG.TARGET_VIEW, switchId);
      var switchBody = {};
      switchBody[CONNECTED_DEVICES_FIELD] = keptIds;
      window.SCW.knackAjax({
        type: 'PUT',
        url: switchUrl,
        data: JSON.stringify(switchBody),
        dataType: 'json',
        success: function (resp) {
          log('scrubReverseConnections: removed', cameraId,
              'from switch', switchId, 'new list:', keptIds);
          if (typeof window.SCW.syncKnackModel === 'function') {
            try {
              window.SCW.syncKnackModel(CFG.TARGET_VIEW, switchId, resp,
                CONNECTED_DEVICES_FIELD, keptIds);
            } catch (e) { /* best-effort */ }
          }
          tick();
        },
        error: function (xhr) {
          console.warn(LOG_PREFIX, 'scrubReverseConnections PUT failed',
            switchId, xhr && xhr.status, xhr && xhr.responseText);
          tick();
        }
      });
    });
  }

  // ── Save: PUT field_2375 with the chosen MDF/IDF id ─────────────
  // Tries array form first ({field_2375:[id]}), falls back to bare
  // string ({field_2375:id}) on 4xx — covers single-connection field
  // configs that reject the array form. Clears with an empty array.
  function saveSelection(recordId, newId, onDone) {
    if (!window.SCW || typeof window.SCW.knackAjax !== 'function' ||
        typeof window.SCW.knackRecordUrl !== 'function') {
      console.error(LOG_PREFIX, 'SCW.knackAjax/knackRecordUrl unavailable');
      onDone(new Error('ajax helpers unavailable'));
      return;
    }
    var url = window.SCW.knackRecordUrl(CFG.TARGET_VIEW, recordId);
    var firstShape = newId ? [newId] : [];

    function attempt(value, isRetry) {
      var body = {};
      body[CFG.TARGET_FIELD] = value;
      console.log(LOG_PREFIX, isRetry ? 'PUT (string retry)' : 'PUT',
        recordId, body, '→', url);
      window.SCW.knackAjax({
        type: 'PUT',
        url: url,
        data: JSON.stringify(body),
        dataType: 'json',
        success: function (resp) {
          // Dig out the record's field_2375 value from the response so
          // we can see whether Knack actually persisted the change or
          // whether a record rule stripped it back out. Knack wraps
          // single records under `record` and sometimes also surfaces
          // them at top level.
          var R = (resp && resp.record) || resp || {};
          var savedRaw = R[CFG.TARGET_FIELD + '_raw'];
          var savedVal = R[CFG.TARGET_FIELD];
          console.log(LOG_PREFIX, 'PUT ok', recordId,
            'requested:', newId || '(clear)',
            'response field_2375:', savedVal,
            'response field_2375_raw:', savedRaw,
            'full resp:', resp);
          // Heuristic: if we tried to set a value but the response
          // came back with empty/no value, a Knack rule probably
          // reverted it. Surface a warning so it doesn't read as
          // "save worked" when it actually didn't stick.
          var stickFailed = false;
          if (newId) {
            var raw = savedRaw;
            var hasRaw = Array.isArray(raw) ? raw.length > 0
                       : (raw && typeof raw === 'object') ? !!raw.id
                       : !!raw;
            if (!hasRaw && !savedVal) stickFailed = true;
          }
          // If the view-scoped PUT silently stripped the field
          // (response field_2375_raw is empty even though we sent
          // a non-empty value), try going through Knack's internal
          // Backbone model.updateRecord() instead. On some Knack
          // versions that path handles inline-edit field permissions
          // differently than raw $.ajax. Object-scoped retry was
          // tried previously but 403s for non-admin sessions, so
          // skip it.
          if (stickFailed && !isRetry) {
            console.warn(LOG_PREFIX,
              'view-scoped PUT stripped field_2375 ' +
              '(saved empty despite non-empty request). Retrying ' +
              'through Knack.views.' + CFG.TARGET_VIEW +
              '.model.updateRecord() to use Knack\'s internal ' +
              'save path.');
            modelUpdateRetry(recordId, newId, function (err2, resp2) {
              if (err2) { onDone(err2); return; }
              onDone(null, resp2);
            });
            return;
          }
          if (typeof window.SCW.syncKnackModel === 'function') {
            try {
              window.SCW.syncKnackModel(CFG.TARGET_VIEW, recordId, resp,
                CFG.TARGET_FIELD, newId ? [newId] : []);
            } catch (e) { /* best-effort */ }
          }
          // Read-back verification: GET the record fresh and log
          // the full response shape so we can see exactly what
          // Knack stored. Use the object-scoped GET because the
          // view-scoped GET sometimes returns a different envelope
          // and may strip non-inline-edit-listed fields.
          (function verify() {
            try {
              window.SCW.knackAjax({
                type: 'GET',
                url: url,
                dataType: 'json',
                success: function (vresp) {
                  var VR = (vresp && vresp.record) || vresp || {};
                  console.log(LOG_PREFIX, 'verify GET (view-scoped)',
                    recordId,
                    'field_2375:', VR[CFG.TARGET_FIELD],
                    'field_2375_raw:', VR[CFG.TARGET_FIELD + '_raw'],
                    'full resp:', vresp);
                },
                error: function (xhr) {
                  console.warn(LOG_PREFIX, 'verify GET failed',
                    xhr && xhr.status);
                }
              });
            } catch (e) { /* best-effort */ }
          })();
          onDone(null, resp);
        },
        error: function (xhr) {
          var status = xhr && xhr.status;
          console.error(LOG_PREFIX, 'PUT failed',
            status, xhr && xhr.responseText);
          // 4xx + we sent an array + newId is non-empty → try bare string.
          // (Empty-clear and 5xx errors get no retry.)
          var is4xx = status >= 400 && status < 500;
          if (!isRetry && newId && is4xx && Array.isArray(value)) {
            console.warn(LOG_PREFIX,
              'array form rejected — retrying with bare string id');
            attempt(newId, true);
            return;
          }
          onDone(xhr || new Error('save failed'));
        }
      });
    }

    attempt(firstShape, false);
  }

  function refreshTargetView() {
    try {
      var view = Knack.views && Knack.views[CFG.TARGET_VIEW];
      if (view && view.model && typeof view.model.fetch === 'function') {
        view.model.fetch();
      }
    } catch (e) { /* best-effort */ }
  }

  // ── Click interceptor ──────────────────────────────────────────
  var RECORD_ID_RE = /^[0-9a-f]{24}$/i;
  function getRecordIdFromCell(td) {
    var wsTr = td.closest('tr.scw-ws-row');
    if (wsTr && wsTr.id && RECORD_ID_RE.test(wsTr.id)) return wsTr.id;
    var tr = td.closest('tr[id]');
    if (tr && RECORD_ID_RE.test(tr.id)) return tr.id;
    return null;
  }

  document.addEventListener('click', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!e.target || !e.target.closest) return;
    var td = e.target.closest('td.' + CFG.TARGET_FIELD);
    if (!td) return;
    var viewEl = td.closest('#' + CFG.TARGET_VIEW);
    if (!viewEl) return;
    if (!td.classList.contains('cell-edit')) return;
    // KTL bulk-edit: when copy/paste mode is armed, KTL adds
    // .bulkEditSelectSrc to cells so clicking selects the source rather
    // than opening an editor. Don't hijack those clicks.
    if (td.classList.contains('bulkEditSelectSrc')) return;
    var recordId = getRecordIdFromCell(td);
    if (!recordId) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    log('intercept click on', recordId);
    openModal(recordId);
  }, true);

  // ── Render-pass diff: catch ANY field_2381 clear ──────────────
  // The clearStaleConnection path above scrubs upstream switches when
  // WE initiate the change via the MDF picker. But the user can also
  // clear field_2381 through:
  //   - Knack native inline edit on the cell (nativeEdit type)
  //   - KTL bulk paste with an empty source
  //   - The connection-picker's reciprocal path
  //   - An edit in another tab/window
  // For any of those, the switch's field_2380 would still list this
  // camera until something explicitly scrubs it. Diff snapshot vs.
  // fresh-render data each time the view renders and trigger the
  // scrub on every transition from "had connections" to "empty".
  var _connSnapshot = {};

  function readConnectedToIds(attrs) {
    var raw = attrs && attrs[CONNECTED_TO_FIELD + '_raw'];
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].id) out.push(raw[i].id);
    }
    return out;
  }

  function diffAndScrubClearedConnections() {
    if (typeof Knack === 'undefined') return;
    var view = Knack.views && Knack.views[CFG.TARGET_VIEW];
    if (!view || !view.model || !view.model.data) return;
    var records = view.model.data.models || [];
    if (!records.length) return;

    var next = {};
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var attrs = rec.attributes || rec;
      var id = rec.id || attrs.id;
      if (!id) continue;
      var ids = readConnectedToIds(attrs);
      next[id] = ids;

      // Did this record previously have connections that are now gone?
      var prev = _connSnapshot[id];
      if (!prev || !prev.length) continue;        // no prior connections
      if (ids.length) continue;                    // still has connections

      log('field_2381 cleared on', id,
          '— scrubbing prior switches', prev);
      scrubReverseConnections(id, prev, function () {
        log('cleared-connection scrub done for', id);
      });
    }
    _connSnapshot = next;
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(CFG.TARGET_VIEW, function () {
      // Delay so the model has fully repopulated after fetch — without
      // this we'd diff against half-loaded data on the first render
      // after a refresh and falsely declare records "cleared".
      setTimeout(diffAndScrubClearedConnections, 600);
    }, '.scwMdfIdfPickerClearedWatch');
  }

  log('Module loaded');
})();
/*** END CUSTOM MDF/IDF PICKER ***/
