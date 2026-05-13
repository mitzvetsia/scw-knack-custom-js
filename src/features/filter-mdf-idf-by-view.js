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
        close();
        refreshTargetView();
      });
      setSaving(true);
      showError('');
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
          if (stickFailed) {
            console.warn(LOG_PREFIX,
              'PUT returned 200 but field_2375 came back empty. ' +
              'A Knack record rule on Survey Line Item is likely ' +
              'reverting field_2375 for this record. Check Builder → ' +
              'Survey Line Item object → Record Rules.');
          }
          if (typeof window.SCW.syncKnackModel === 'function') {
            try {
              window.SCW.syncKnackModel(CFG.TARGET_VIEW, recordId, resp,
                CFG.TARGET_FIELD, newId ? [newId] : []);
            } catch (e) { /* best-effort */ }
          }
          // Read-back verification: GET the record fresh from the view-
          // scoped endpoint and log what its field_2375 looks like NOW.
          // If the PUT response showed the value set but the read-back
          // shows it empty, something is reverting between save and
          // re-read (record rule, integration, background task). If the
          // PUT response already showed it empty, Knack dropped it
          // server-side at PUT-time (perms / view inline-edit list /
          // connection-field validation we haven't found in Builder yet).
          (function verify() {
            try {
              window.SCW.knackAjax({
                type: 'GET',
                url: url,
                dataType: 'json',
                success: function (vresp) {
                  var VR = (vresp && vresp.record) || vresp || {};
                  console.log(LOG_PREFIX, 'verify GET',
                    recordId,
                    'field_2375:', VR[CFG.TARGET_FIELD],
                    'field_2375_raw:', VR[CFG.TARGET_FIELD + '_raw']);
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

  log('Module loaded');
})();
/*** END CUSTOM MDF/IDF PICKER ***/
