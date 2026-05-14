// src/features/bulk-upload.js
// ---------------------------------------------------------------------------
// Multi-file uploader — drop-in replacement for the JotForm "Bulk Add Photos"
// flow. Built because JotForm stopped signing file URLs in their post-submission
// payloads, breaking the downstream retrieval step. By POSTing one file per
// webhook call we stay well under Make's 5 MB body limit and never need to
// retrieve files from a third party.
//
// Workflow:
//   1. User clicks a configured menu link (e.g. "Bulk Add Photos" on view_3482).
//   2. Modal opens with drag-drop zone + file picker.
//   3. Files are written to IndexedDB immediately so a tab close doesn't lose
//      the queue. The browser is the queue — Make never has to babysit.
//   4. User clicks Upload. Sequential POST to MAKE_BULK_UPLOAD_WEBHOOK, one
//      file per request.
//   5. On 2xx + { success: true }, blob is deleted from IDB to reclaim space.
//      On failure, the row is marked failed and a Retry button appears.
//   6. On reopen, any non-done rows from a previous session surface a Resume
//      banner.
//
// CONFIGURATION (CONFIG.VIEWS, below):
//   Empty by default — populate to switch a "Bulk Add Photos" link from the
//   JotForm flow to this uploader. ⚠ When you enable a view here, REMOVE the
//   matching entry from FORM_CONFIGS in jotform-embed-sow-photos.js — otherwise
//   both modals will open on the same click.
//
// CONSOLE HELPERS:
//   SCW.bulkUpload.open(viewCfg, recordId)   — open the modal manually
//   SCW.bulkUpload.dbGetAll()                — inspect persisted queue
//   SCW.bulkUpload.dbClear()                 — wipe persisted queue
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────
  var CONFIG = {
    MAX_FILES:      50,
    MAX_FILE_BYTES: 5 * 1024 * 1024,    // 5 MB raw — Make webhook body limit

    // Throttle between consecutive successful uploads (ms). Make limits
    // operations per minute at the org level — each upload triggers a
    // scenario that does multiple Knack API calls, so 50 files back-to-
    // back can blow through small plan quotas. 1500ms = ~40 files/min.
    UPLOAD_DELAY_MS: 1500,

    // Per-file retry on rate-limit / server-error responses. Each retry
    // waits longer; if all retries fail the file is marked 'failed' and
    // the user gets a Retry button. Non-rate-limit errors (4xx other
    // than 429) fail immediately — no point hammering.
    MAX_RETRIES_PER_FILE: 4,
    RETRY_BACKOFF_MS:     [3000, 8000, 20000, 45000],

    // Each entry hooks the new uploader onto a menu link by text. The
    // matching FORM_CONFIGS entries in jotform-embed-sow-photos.js are
    // disabled so both modals don't open on the same click.
    //
    // Three refresh strategies, applied on modal close after a
    // successful batch. They can be combined.
    //
    // refreshRecordInViews: array of view ids in which to refresh just
    //   THIS upload's recordId (the SOW / Survey / etc. linked by
    //   linkField). Re-fetches the single record and updates its
    //   Backbone model so just that one row's data refreshes — leaves
    //   the rest of the grid untouched. Cheapest, most precise. Use
    //   this when you only need to repaint a single row.
    //
    // refreshViews: array of view ids to re-fetch in full. Use for
    //   gallery / list views where you want every record's data to
    //   refresh (e.g. a photo strip that gained new records).
    //
    // reloadOnClose: if true, full window.location.reload() instead of
    //   either of the above. Heaviest but bulletproof. Off by default.
    //
    // Make's per-file webhook response can also include:
    //   { success: true, refresh: ["view_XXX", ...] }
    //     → those view ids unioned with refreshViews on close (full
    //       re-fetch of each named view).
    //   { success: true, refreshRecords: ["abc123...", "def456..."] }
    //     → those record ids will each be refreshed across every view
    //       in refreshRecordInViews. Use this when photos get connected
    //       to records OTHER than the upload's recordId — e.g. survey
    //       line items rather than the survey itself.
    //
    // The upload's own recordId is ALWAYS refreshed in refreshRecordInViews
    // too (in case the photo is connected to the parent record). So your
    // Make scenario only needs to include refreshRecords for the
    // additional / different records that got touched.
    VIEWS: [
      {
        menuViewId:           'view_3482',
        linkText:             'Bulk Add Photos',
        linkField:            'sowID',
        hashPattern:          /scope-of-work-details\/([a-f0-9]{24})/,
        refreshRecordInViews: [],
        refreshViews:         [],
        reloadOnClose:        false
      },
      {
        menuViewId:           'view_3532',
        linkText:             'Bulk Add Photos',
        linkField:            'surveyID',
        hashPattern:          /site-survey-request-details\/([a-f0-9]{24})/,
        refreshRecordInViews: ['view_3505'],
        refreshViews:         [],
        reloadOnClose:        false,
        // Also inject a standalone button at the top of another view's
        // toolbar. Useful when you want the bulk-upload entry point to
        // be next to other grid actions, not buried in a side menu.
        injectIntoView:       'view_3505',
        injectBeforeText:     'Add Survey/Bid Item'   // existing button to position before
      }
    ]
  };

  var MODAL_ID   = 'scw-bulk-upload-modal';
  var STYLE_ID   = 'scw-bulk-upload-css';
  var DB_NAME    = 'scw-bulk-upload';
  var DB_VERSION = 1;
  var STORE      = 'files';

  // The currently-open modal's in-memory state. null when modal is closed.
  var _state = null;

  // ── UTIL ──────────────────────────────────────────────────────────────
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getExtension(name) {
    var m = (name || '').match(/\.([^.]+)$/);
    return m ? m[1].toLowerCase() : '';
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function getCurrentUser() {
    try {
      var u = Knack.getUserAttributes();
      return { id: u.id, name: u.name, email: u.email };
    } catch (e) { return { id: '', name: '', email: '' }; }
  }

  function getRecordId(hashPattern) {
    var hash = window.location.hash || '';
    var m = hash.match(hashPattern);
    return m ? m[1] : '';
  }

  // ── INDEXEDDB ─────────────────────────────────────────────────────────
  // The queue is a single object store keyed by row id (uuid). Rows store
  // { id, recordId, linkField, filename, mimeType, extension, sizeBytes,
  //   blob, status, error, addedAt, batchId, uploadId }.
  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('byStatus', 'status');
          store.createIndex('byRecord', 'recordId');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  function dbPut(row) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(row);
        tx.oncomplete = function () { resolve(row); };
        tx.onerror    = function () { reject(tx.error || new Error('IDB write failed')); };
        tx.onabort    = function () { reject(tx.error || new Error('IDB write aborted (quota?)')); };
      });
    });
  }

  function dbGetAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function dbDelete(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror    = function () { reject(tx.error); };
      });
    });
  }

  function dbClear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror    = function () { reject(tx.error); };
      });
    });
  }

  // Ask the browser to mark our origin as persistent so the IDB queue
  // isn't evicted under storage pressure. Best-effort — Chrome prompts,
  // Safari decides based on heuristics, all errors swallowed.
  function tryPersist() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  }

  function readAsBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload  = function () {
        var s = String(r.result || '');     // "data:<mime>;base64,<...>"
        var i = s.indexOf(',');
        resolve(i >= 0 ? s.substring(i + 1) : s);
      };
      r.onerror = function () { reject(r.error || new Error('Could not read file')); };
      r.readAsDataURL(blob);
    });
  }

  // ── STYLES ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var M = '#' + MODAL_ID;
    var css = [
      M + '-backdrop {',
      '  position:fixed; inset:0; z-index:100000;',
      '  background:rgba(0,0,0,0.55);',
      '  display:flex; align-items:center; justify-content:center;',
      '  font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;',
      '}',
      M + ' {',
      '  background:#fff; border-radius:10px;',
      '  width:min(720px, 92vw); max-height:90vh;',
      '  display:flex; flex-direction:column;',
      '  box-shadow:0 20px 60px rgba(0,0,0,.4);',
      '  overflow:hidden;',
      '}',
      M + '-header {',
      '  padding:14px 18px;',
      '  display:flex; align-items:center; justify-content:space-between;',
      '  background:#07467c; color:#fff;',
      '}',
      M + '-header .title { font-weight:700; font-size:15px; }',
      M + '-header .close {',
      '  background:none; border:none; color:#fff; font-size:22px;',
      '  cursor:pointer; padding:0 4px; line-height:1;',
      '}',
      M + '-body { padding:14px 18px; overflow-y:auto; flex:1; }',
      M + '-footer {',
      '  padding:10px 18px; border-top:1px solid #e5e7eb;',
      '  display:flex; gap:8px; justify-content:flex-end; align-items:center;',
      '  background:#f8fafc;',
      '}',
      M + '-footer .scw-bu-summary { margin-right:auto; color:#475569; font-size:13px; }',
      M + ' button.scw-bu-btn {',
      '  padding:8px 14px; border-radius:6px; border:none; cursor:pointer;',
      '  font:600 13px/1 system-ui,sans-serif;',
      '}',
      M + ' button.scw-bu-btn.primary { background:#07467c; color:#fff; }',
      M + ' button.scw-bu-btn.primary:hover:not([disabled]) { opacity:.92; }',
      M + ' button.scw-bu-btn.ghost { background:#fff; color:#0f172a; border:1px solid #cbd5e1; }',
      M + ' button.scw-bu-btn[disabled] { opacity:.55; cursor:default; }',
      M + ' .scw-bu-drop {',
      '  border:2px dashed #cbd5e1; border-radius:8px;',
      '  padding:22px 14px; text-align:center; color:#475569;',
      '  background:#f8fafc; cursor:pointer;',
      '  transition: background 150ms, border-color 150ms;',
      '}',
      M + ' .scw-bu-drop.is-over { background:#e0f2fe; border-color:#0284c7; color:#0c4a6e; }',
      M + ' .scw-bu-drop .scw-bu-drop-hint { display:block; margin-top:6px; font-size:12px; color:#64748b; }',
      M + ' .scw-bu-banner {',
      '  margin-bottom:12px; padding:10px 14px; border-radius:8px;',
      '  background:#fef9c3; border:1px solid #fde68a; color:#713f12;',
      '  display:flex; gap:8px; align-items:center; flex-wrap:wrap;',
      '}',
      M + ' .scw-bu-banner .scw-bu-banner-msg { flex:1; min-width:160px; }',
      M + ' .scw-bu-list { margin-top:10px; }',
      M + ' .scw-bu-row {',
      '  display:flex; align-items:center; gap:10px;',
      '  padding:8px 0; border-bottom:1px solid #f1f5f9;',
      '}',
      M + ' .scw-bu-row .scw-bu-thumb {',
      '  width:36px; height:36px; flex:none;',
      '  background:#f1f5f9; border-radius:4px;',
      '  display:flex; align-items:center; justify-content:center;',
      '  font-size:10px; font-weight:700; color:#64748b; overflow:hidden;',
      '}',
      M + ' .scw-bu-row .scw-bu-thumb img { width:100%; height:100%; object-fit:cover; }',
      M + ' .scw-bu-row .scw-bu-name { flex:1; min-width:0; overflow:hidden; }',
      M + ' .scw-bu-row .scw-bu-name-line { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      M + ' .scw-bu-row .scw-bu-size { color:#64748b; font-size:12px; flex:none; }',
      M + ' .scw-bu-row .scw-bu-status { flex:none; font-size:12px; min-width:90px; text-align:right; }',
      M + ' .scw-bu-row .scw-bu-status.is-queued    { color:#475569; }',
      M + ' .scw-bu-row .scw-bu-status.is-uploading { color:#0369a1; }',
      M + ' .scw-bu-row .scw-bu-status.is-done      { color:#15803d; font-weight:600; }',
      M + ' .scw-bu-row .scw-bu-status.is-failed    { color:#b91c1c; font-weight:600; }',
      M + ' .scw-bu-row .scw-bu-status.is-too-big   { color:#b91c1c; font-weight:600; }',
      M + ' .scw-bu-row .scw-bu-row-actions { flex:none; display:flex; gap:4px; }',
      M + ' .scw-bu-row button.scw-bu-row-btn {',
      '  background:none; border:none; cursor:pointer; padding:4px 6px;',
      '  color:#475569; font-size:12px; border-radius:4px;',
      '}',
      M + ' .scw-bu-row button.scw-bu-row-btn:hover { background:#f1f5f9; color:#0f172a; }',
      M + ' .scw-bu-row .scw-bu-error { color:#b91c1c; font-size:11px; margin-top:2px; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── MODAL OPEN / CLOSE ────────────────────────────────────────────────
  function openModal(viewCfg, recordId) {
    injectStyles();
    closeModal();
    tryPersist();

    _state = {
      viewCfg:          viewCfg,
      recordId:         recordId,
      batchId:          uuid(),
      rows:             [],
      uploading:        false,
      successCount:     0,
      refreshViewIds:   {},   // Set of view ids — harvested from response.refresh
      refreshRecordIds: {}    // Set of record ids — harvested from response.refreshRecords
    };

    var backdrop = document.createElement('div');
    backdrop.id = MODAL_ID + '-backdrop';
    backdrop.innerHTML =
      '<div id="' + MODAL_ID + '" role="dialog" aria-modal="true">' +
        '<div id="' + MODAL_ID + '-header">' +
          '<div class="title">Bulk Upload Files</div>' +
          '<button class="close" title="Close">×</button>' +
        '</div>' +
        '<div id="' + MODAL_ID + '-body">' +
          '<div class="scw-bu-banner-slot"></div>' +
          '<div class="scw-bu-drop" tabindex="0">' +
            '<div><strong>Drop files here</strong> or click to choose</div>' +
            '<span class="scw-bu-drop-hint">Up to ' + CONFIG.MAX_FILES +
              ' files · any type · max ' + fmtBytes(CONFIG.MAX_FILE_BYTES) + ' per file</span>' +
            '<input type="file" multiple style="display:none">' +
          '</div>' +
          '<div class="scw-bu-list"></div>' +
        '</div>' +
        '<div id="' + MODAL_ID + '-footer">' +
          '<div class="scw-bu-summary"></div>' +
          '<button class="scw-bu-btn ghost scw-bu-clear">Clear all</button>' +
          '<button class="scw-bu-btn primary scw-bu-upload">Upload</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);
    wireModal(backdrop);
    loadExistingRows();
  }

  function closeModal() {
    var el = document.getElementById(MODAL_ID + '-backdrop');
    if (el) el.remove();
    // Auto-refresh on close intentionally disabled — was visibly
    // refreshing rows one-at-a-time after the modal closed, which the
    // user found disruptive. Manual refresh paths still exist:
    //   - reloadOnClose: true   on a CONFIG.VIEWS entry to do a full
    //                           window.location.reload() instead
    //   - SCW.bulkUpload.refreshSingleRecord(viewId, recordId) from
    //                           the console to trigger refresh ad-hoc
    if (_state && _state.successCount > 0) {
      var viewCfg = _state.viewCfg || {};
      if (viewCfg.reloadOnClose) {
        setTimeout(function () { window.location.reload(); }, 50);
      }
    }
    _state = null;
  }

  // Refresh a single record's row in a configured grid view.
  //
  // Multi-step strategy because Knack's table-view rendering doesn't
  // always react to Backbone change events the same way across view
  // types — and because the record may not yet be in the current
  // pagination page of the collection.
  //
  //   1. If the record exists in view.model.data → record.fetch()
  //      (Backbone re-fetches, fires change events, view should
  //      re-render the row in place).
  //   2. If the record isn't in the local collection (because it's on
  //      a different page) OR if step 1 silently fails → fall back to
  //      view.model.fetch() (full re-fetch of the visible page).
  //   3. Either way, if the view exposes a render() method we call it
  //      defensively after a short delay so the DOM definitely picks
  //      up the change — Knack table views with custom transforms
  //      (the SCW worksheet card pattern especially) don't always
  //      re-render on model change alone.
  //
  // All steps are best-effort and silent on failure — the user can
  // reload manually if needed.
  function refreshSingleRecord(viewId, recordId) {
    if (!viewId || !recordId || !window.Knack || !Knack.views) {
      if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] refreshSingleRecord: missing prereqs', { viewId: viewId, recordId: recordId, hasKnack: !!window.Knack });
      return;
    }
    var view = Knack.views[viewId];
    if (!view) {
      if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] refreshSingleRecord: Knack.views[' + viewId + '] not found');
      return;
    }
    if (!view.model || !view.model.data) {
      if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] refreshSingleRecord: view has no model.data', viewId);
      // Last resort: try a generic re-render
      try { if (typeof view.render === 'function') view.render(); } catch (e) {}
      return;
    }

    var coll = view.model.data;
    var record = (coll && typeof coll.get === 'function') ? coll.get(recordId) : null;
    if (!record && coll && typeof coll.findWhere === 'function') {
      record = coll.findWhere({ id: recordId });
    }

    function defensiveRender(reason) {
      if (window.SCW && SCW.DEBUG) console.log('[bulk-upload] defensiveRender (' + reason + ') on', viewId);
      setTimeout(function () {
        try {
          if (typeof view.render === 'function') view.render();
        } catch (e) {}
      }, 200);
    }

    if (record && typeof record.fetch === 'function') {
      record.fetch({
        success: function () {
          if (window.SCW && SCW.DEBUG) console.log('[bulk-upload] record.fetch() OK for', recordId, 'in', viewId);
          defensiveRender('after record.fetch success');
        },
        error: function (m, resp) {
          if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] record.fetch() failed; falling back to view.model.fetch()', resp && resp.status, resp && resp.responseText);
          if (typeof view.model.fetch === 'function') view.model.fetch();
        }
      });
      return;
    }

    if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] record', recordId, 'not in view', viewId, '— falling back to full view.model.fetch()');
    if (typeof view.model.fetch === 'function') {
      view.model.fetch();
    } else {
      defensiveRender('no fetch available');
    }
  }

  function confirmClose() {
    if (_state && _state.uploading) {
      var ok = confirm(
        'An upload is in progress. Closing will pause it — pending files ' +
        'will resume next time you open this. Close anyway?'
      );
      if (!ok) return;
    }
    closeModal();
  }

  function wireModal(backdrop) {
    var closeBtn = backdrop.querySelector('.close');
    var drop     = backdrop.querySelector('.scw-bu-drop');
    var input    = drop.querySelector('input[type=file]');
    var clear    = backdrop.querySelector('.scw-bu-clear');
    var upload   = backdrop.querySelector('.scw-bu-upload');

    // Click-on-backdrop to close (but not click-on-modal)
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) confirmClose();
    });
    closeBtn.addEventListener('click', confirmClose);

    // Drop zone: click → file picker; keyboard activate → file picker
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
      addFiles(Array.prototype.slice.call(input.files || []));
      input.value = '';   // allow picking same filenames again
    });

    // Drag-and-drop
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.remove('is-over');
      });
    });
    drop.addEventListener('drop', function (e) {
      var files = (e.dataTransfer && e.dataTransfer.files) || [];
      addFiles(Array.prototype.slice.call(files));
    });

    clear.addEventListener('click', clearQueue);
    upload.addEventListener('click', startUpload);
  }

  // ── ROW STATE ─────────────────────────────────────────────────────────
  function loadExistingRows() {
    dbGetAll().then(function (rows) {
      // Per-record queues — don't show another record's files here
      var mine = rows.filter(function (r) { return r.recordId === _state.recordId; });

      // Any 'uploading' status is a crash/close mid-flight — flip to queued
      // so it gets retried. Make should idempotency-check by uploadId.
      var stuck = mine.filter(function (r) { return r.status === 'uploading'; });
      var fixes = stuck.map(function (r) {
        r.status = 'queued'; r.error = null;
        return dbPut(r);
      });

      Promise.all(fixes).then(function () {
        if (!_state) return;
        _state.rows = mine;
        renderRows();
        var pending = mine.filter(function (r) { return r.status !== 'done'; });
        if (pending.length) showResumeBanner(pending.length);
      });
    }).catch(function (err) {
      console.warn('[bulk-upload] Could not read IndexedDB:', err);
    });
  }

  function showResumeBanner(count) {
    var slot = document.querySelector('#' + MODAL_ID + '-body .scw-bu-banner-slot');
    if (!slot) return;
    slot.innerHTML =
      '<div class="scw-bu-banner">' +
        '<span class="scw-bu-banner-msg">' +
          '<strong>' + count + '</strong> file' + (count === 1 ? '' : 's') +
          ' pending from your previous session.' +
        '</span>' +
        '<button class="scw-bu-btn primary scw-bu-banner-resume">Resume</button>' +
        '<button class="scw-bu-btn ghost scw-bu-banner-discard">Discard</button>' +
      '</div>';
    slot.querySelector('.scw-bu-banner-resume').addEventListener('click', function () {
      slot.innerHTML = '';
      startUpload();
    });
    slot.querySelector('.scw-bu-banner-discard').addEventListener('click', function () {
      if (!_state) return;
      var ids = _state.rows
        .filter(function (r) { return r.status !== 'done'; })
        .map(function (r) { return r.id; });
      Promise.all(ids.map(dbDelete)).then(function () {
        if (!_state) return;
        _state.rows = _state.rows.filter(function (r) { return r.status === 'done'; });
        slot.innerHTML = '';
        renderRows();
      });
    });
  }

  function addFiles(files) {
    if (!_state || !files.length) return;
    var existingCount = _state.rows.filter(function (r) { return r.status !== 'done'; }).length;
    var slotsLeft = CONFIG.MAX_FILES - existingCount;
    if (slotsLeft <= 0) {
      alert('Queue is full (' + CONFIG.MAX_FILES + '-file maximum).');
      return;
    }
    if (files.length > slotsLeft) {
      alert('Adding only the first ' + slotsLeft + ' files — ' +
            CONFIG.MAX_FILES + '-file maximum.');
      files = files.slice(0, slotsLeft);
    }
    var puts = files.map(function (f) {
      var tooBig = f.size > CONFIG.MAX_FILE_BYTES;
      var row = {
        id:        uuid(),
        recordId:  _state.recordId,
        linkField: _state.viewCfg.linkField,
        filename:  f.name,
        // File.type can be empty for some extensions on some OSes; fall back
        // to a generic binary MIME so downstream code always has something.
        mimeType:  f.type || 'application/octet-stream',
        extension: getExtension(f.name),
        sizeBytes: f.size,
        blob:      f,
        status:    tooBig ? 'too-big' : 'queued',
        error:     tooBig ? ('File exceeds ' + fmtBytes(CONFIG.MAX_FILE_BYTES) + ' limit') : null,
        addedAt:   Date.now(),
        batchId:   _state.batchId,
        uploadId:  uuid()
      };
      return dbPut(row).then(function () {
        if (_state) _state.rows.push(row);
      });
    });
    Promise.all(puts).then(renderRows).catch(function (err) {
      alert('Could not save file to local storage: ' +
            ((err && err.message) || err) +
            '\n\nThis usually means the browser ran out of storage. Try fewer files at once.');
      loadExistingRows();   // resync in case of partial writes
    });
  }

  function clearQueue() {
    if (!_state) return;
    var pending = _state.rows.filter(function (r) { return r.status !== 'done'; });
    if (!pending.length) return;
    if (!confirm('Remove all ' + pending.length + ' queued file' +
                 (pending.length === 1 ? '' : 's') + '?')) return;
    Promise.all(pending.map(function (r) { return dbDelete(r.id); })).then(function () {
      if (!_state) return;
      _state.rows = _state.rows.filter(function (r) { return r.status === 'done'; });
      renderRows();
    });
  }

  function removeRow(row) {
    dbDelete(row.id).then(function () {
      if (!_state) return;
      _state.rows = _state.rows.filter(function (r) { return r.id !== row.id; });
      renderRows();
    });
  }

  function retryRow(row) {
    row.status = 'queued'; row.error = null;
    dbPut(row).then(renderRows);
  }

  // ── RENDER ────────────────────────────────────────────────────────────
  function renderRows() {
    if (!_state) return;
    var listEl    = document.querySelector('#' + MODAL_ID + '-body .scw-bu-list');
    var summaryEl = document.querySelector('#' + MODAL_ID + '-footer .scw-bu-summary');
    var uploadBtn = document.querySelector('#' + MODAL_ID + '-footer .scw-bu-upload');
    if (!listEl) return;

    if (!_state.rows.length) {
      listEl.innerHTML = '';
      if (summaryEl) summaryEl.textContent = '';
      if (uploadBtn) uploadBtn.disabled = true;
      return;
    }

    listEl.innerHTML = _state.rows.map(rowHtml).join('');

    var stats = countByStatus(_state.rows);
    if (summaryEl) {
      summaryEl.textContent =
        stats.total + ' file' + (stats.total === 1 ? '' : 's') + ' · ' +
        stats.queued + ' queued · ' + stats.done + ' done' +
        (stats.failed ? ' · ' + stats.failed + ' failed' : '') +
        (stats.tooBig ? ' · ' + stats.tooBig + ' too big' : '');
    }
    if (uploadBtn) {
      uploadBtn.disabled = _state.uploading || (stats.queued === 0 && stats.failed === 0);
    }

    // Wire row-level action buttons
    Array.prototype.forEach.call(listEl.querySelectorAll('button[data-action]'), function (btn) {
      btn.addEventListener('click', function () {
        if (!_state) return;
        var id = btn.getAttribute('data-id');
        var action = btn.getAttribute('data-action');
        var row = _state.rows.find(function (r) { return r.id === id; });
        if (!row) return;
        if (action === 'remove') removeRow(row);
        else if (action === 'retry') retryRow(row);
      });
    });

    // Lazy-build image thumbnails — Object URLs are revoked on load to free memory
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-thumb-id]'), function (slot) {
      var id = slot.getAttribute('data-thumb-id');
      var row = _state.rows.find(function (r) { return r.id === id; });
      if (!row || !row.blob || row.mimeType.indexOf('image/') !== 0) return;
      var url = URL.createObjectURL(row.blob);
      var img = document.createElement('img');
      img.src = url;
      img.onload = img.onerror = function () { URL.revokeObjectURL(url); };
      slot.innerHTML = '';
      slot.appendChild(img);
    });
  }

  function rowHtml(row) {
    var isImg = row.mimeType.indexOf('image/') === 0 && row.blob;
    var thumb = isImg
      ? '<div class="scw-bu-thumb" data-thumb-id="' + row.id + '">' +
          escapeHtml((row.extension || '?').toUpperCase()) + '</div>'
      : '<div class="scw-bu-thumb">' +
          escapeHtml((row.extension || '?').toUpperCase()) + '</div>';
    var labels = {
      queued:    'Queued',
      uploading: 'Uploading…',
      done:      '✓ Done',
      failed:    '✗ Failed',
      'too-big': '✗ Too big'
    };
    var actions = '';
    if (row.status === 'queued' || row.status === 'too-big') {
      actions = '<button class="scw-bu-row-btn" data-action="remove" data-id="' + row.id + '">Remove</button>';
    } else if (row.status === 'failed') {
      actions =
        '<button class="scw-bu-row-btn" data-action="retry"  data-id="' + row.id + '">Retry</button>' +
        '<button class="scw-bu-row-btn" data-action="remove" data-id="' + row.id + '">Remove</button>';
    }
    var errLine = row.error
      ? '<div class="scw-bu-error">' + escapeHtml(row.error) + '</div>'
      : '';
    return (
      '<div class="scw-bu-row">' +
        thumb +
        '<div class="scw-bu-name">' +
          '<div class="scw-bu-name-line" title="' + escapeHtml(row.filename) + '">' +
            escapeHtml(row.filename) +
          '</div>' +
          errLine +
        '</div>' +
        '<div class="scw-bu-size">' + fmtBytes(row.sizeBytes) + '</div>' +
        '<div class="scw-bu-status is-' + row.status + '">' +
          (labels[row.status] || row.status) +
        '</div>' +
        '<div class="scw-bu-row-actions">' + actions + '</div>' +
      '</div>'
    );
  }

  function countByStatus(rows) {
    var s = { total: rows.length, queued: 0, uploading: 0, done: 0, failed: 0, tooBig: 0 };
    rows.forEach(function (r) {
      if (r.status === 'too-big')        s.tooBig++;
      else if (s[r.status] != null)      s[r.status]++;
    });
    return s;
  }

  // ── UPLOAD LOOP ───────────────────────────────────────────────────────
  function startUpload() {
    if (!_state || _state.uploading) return;
    var webhook = SCW.CONFIG && SCW.CONFIG.MAKE_BULK_UPLOAD_WEBHOOK;
    if (!webhook) {
      alert('Bulk upload webhook is not configured (SCW.CONFIG.MAKE_BULK_UPLOAD_WEBHOOK).');
      return;
    }
    // Re-queue any rows the user wants retried
    _state.rows.forEach(function (r) {
      if (r.status === 'failed') { r.status = 'queued'; r.error = null; }
    });
    _state.uploading = true;
    setButtonsDisabled(true);
    processNext(webhook);
  }

  function setButtonsDisabled(disabled) {
    var clearBtn  = document.querySelector('#' + MODAL_ID + '-footer .scw-bu-clear');
    var uploadBtn = document.querySelector('#' + MODAL_ID + '-footer .scw-bu-upload');
    if (clearBtn)  clearBtn.disabled  = disabled;
    if (uploadBtn) {
      uploadBtn.disabled    = disabled;
      uploadBtn.textContent = disabled ? 'Uploading…' : 'Upload';
    }
  }

  function processNext(webhook) {
    if (!_state) return;
    var row = _state.rows.find(function (r) { return r.status === 'queued'; });
    if (!row) {
      // Batch complete
      _state.uploading = false;
      setButtonsDisabled(false);
      var stats = countByStatus(_state.rows);
      if (stats.failed === 0 && stats.tooBig === 0 && stats.done > 0) {
        setTimeout(function () {
          alert('All ' + stats.done + ' file' +
                (stats.done === 1 ? '' : 's') + ' uploaded.');
          closeModal();
        }, 100);
      }
      return;
    }
    uploadOne(row, webhook).then(function () {
      // Throttle between uploads — gives Make headroom against per-minute
      // operations limits. Skipped after a failure since that file's
      // already paused itself with a retry delay.
      if (!_state) return;
      var delay = row.status === 'done' ? CONFIG.UPLOAD_DELAY_MS : 0;
      setTimeout(function () { processNext(webhook); }, delay);
    });
  }

  // Heuristic: is this error a "back off and try again" type, or
  // a "this will never succeed" type?
  function isRateLimitError(httpStatus, body, errMsg) {
    if (httpStatus === 429) return true;
    if (httpStatus >= 500 && httpStatus < 600) return true;     // 5xx
    var blob = ((body && body.error) || errMsg || '').toLowerCase();
    return /rate.?limit|too many|throttl|quota|operations limit|operation limit/.test(blob);
  }

  // Parse a Retry-After header value (either seconds or HTTP-date).
  // Returns delay in ms, or null if header missing/unparseable.
  function parseRetryAfter(headers) {
    if (!headers || !headers.get) return null;
    var v = headers.get('Retry-After');
    if (!v) return null;
    var s = parseInt(v, 10);
    if (!isNaN(s) && s >= 0) return s * 1000;
    var t = Date.parse(v);
    if (!isNaN(t)) return Math.max(0, t - Date.now());
    return null;
  }

  function uploadOne(row, webhook) {
    row.status = 'uploading'; row.error = null;
    row.retryCount = row.retryCount || 0;
    return dbPut(row).then(function () {
      renderRows();
      return readAsBase64(row.blob);
    }).then(function (b64) {
      var payload = {
        recordId:    row.recordId,
        linkField:   row.linkField,
        filename:    row.filename,
        mimeType:    row.mimeType,
        extension:   row.extension,
        sizeBytes:   row.sizeBytes,
        dataBase64:  b64,
        uploadId:    row.uploadId,
        batchId:     row.batchId,
        triggeredBy: getCurrentUser()
      };
      return fetch(webhook, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      }).then(function (resp) {
        return resp.text().then(function (txt) {
          var body = null;
          try { body = JSON.parse(txt); } catch (e) { /* tolerate */ }
          return { ok: resp.ok, status: resp.status, headers: resp.headers, body: body, raw: txt };
        });
      });
    }).then(function (r) {
      // Explicit failure response, even with HTTP 200 (Make often wraps).
      if (r.body && r.body.success === false) {
        var msg = r.body.error || 'Make scenario reported failure';
        var simulated = isRateLimitError(0, r.body, msg) ? 429 : 0;
        var err = new Error(msg);
        err.httpStatus = simulated;
        err.responseBody = r.body;
        throw err;
      }
      if (!r.ok) {
        var err2 = new Error('HTTP ' + r.status + (r.raw ? ' — ' + r.raw.slice(0, 120) : ''));
        err2.httpStatus = r.status;
        err2.responseBody = r.body;
        err2.retryAfter = parseRetryAfter(r.headers);
        throw err2;
      }
      // Capture any view-refresh hints the scenario returned so we can
      // refresh them when the modal closes.
      if (_state && r.body && Array.isArray(r.body.refresh)) {
        r.body.refresh.forEach(function (v) {
          if (typeof v === 'string' && /^view_\d+/.test(v)) {
            _state.refreshViewIds[v] = true;
          }
        });
      }
      // Capture any per-record refresh hints — record ids that should
      // be re-fetched in the configured refreshRecordInViews. Use this
      // when photos got connected to records other than the upload's
      // own recordId (e.g. survey line items rather than the survey).
      if (_state && r.body && Array.isArray(r.body.refreshRecords)) {
        r.body.refreshRecords.forEach(function (id) {
          if (typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)) {
            _state.refreshRecordIds[id] = true;
          }
        });
      }
      // Success — drop the blob from IDB, keep a transient in-memory marker.
      return dbDelete(row.id).then(function () {
        row.status = 'done';
        row.blob = null;
        row.error = null;
        if (_state) _state.successCount++;
        renderRows();
      });
    }).catch(function (err) {
      var status = err && err.httpStatus;
      var body   = err && err.responseBody;
      var msg    = (err && err.message) || String(err);

      if (isRateLimitError(status, body, msg) && row.retryCount < CONFIG.MAX_RETRIES_PER_FILE) {
        // Back off and re-queue. Prefer Retry-After header when present.
        row.retryCount++;
        var delay = err.retryAfter ||
                    CONFIG.RETRY_BACKOFF_MS[row.retryCount - 1] ||
                    CONFIG.RETRY_BACKOFF_MS[CONFIG.RETRY_BACKOFF_MS.length - 1];
        row.status = 'queued';
        row.error  = 'Rate limited — retry ' + row.retryCount + '/' +
                     CONFIG.MAX_RETRIES_PER_FILE + ' in ' + Math.round(delay / 1000) + 's';
        return dbPut(row)
          .then(renderRows)
          .then(function () {
            return new Promise(function (resolve) { setTimeout(resolve, delay); });
          });
      }

      // Permanent failure — mark and move on
      row.status = 'failed';
      row.error  = msg + (status ? ' (HTTP ' + status + ')' : '');
      return dbPut(row).then(renderRows).catch(function () { renderRows(); });
    });
  }

  // ── Inline button injection ───────────────────────────────────────────
  // Photo icon — Feather 'image' SVG (picture frame with sun + mountain),
  // not the camera icon. currentColor so it inherits the button's text
  // color from scw-acc-action-btn / the active --scw-accent.
  var PHOTO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>' +
      '<circle cx="8.5" cy="8.5" r="1.5"></circle>' +
      '<polyline points="21 15 16 10 5 21"></polyline>' +
    '</svg>';

  function injectInlineStyles() {
    if (document.getElementById('scw-bulk-inline-btn-css')) return;
    var css = [
      // Match the visual layout of scw-acc-action-btn so the icon
      // sits to the left of the label with the same spacing as
      // sibling action buttons in the accordion-actions toolbar.
      '.scw-bulk-inline-btn {',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '}',
      '.scw-bulk-inline-btn svg { flex-shrink: 0; vertical-align: middle; }',
      '.scw-bulk-inline-btn > span:first-child {',
      '  display: inline-flex; align-items: center;',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'scw-bulk-inline-btn-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // Find a clickable element in `scope` whose visible text matches
  // `text`. Looks at Knack's native button classes AND SCW's custom
  // accordion-action button class, since hoisted action buttons use
  // the latter. Ignores anything inside our own injected button.
  function findButtonByText(scope, text) {
    if (!scope || !text) return null;
    var nodes = scope.querySelectorAll(
      'a.kn-link, a.kn-button, button.kn-button, ' +
      'button.scw-acc-action-btn, .scw-acc-action-btn'
    );
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].closest('.scw-bulk-inline-btn')) continue;
      if ((nodes[i].textContent || '').trim() === text) return nodes[i];
    }
    return null;
  }

  // Inject a "Bulk Add Photos" button into another view's toolbar
  // (configurable per VIEWS entry). Re-runnable / idempotent — uses a
  // data-attribute marker to avoid duplicating itself on re-renders.
  function injectInlineButton(viewCfg) {
    var targetView = document.getElementById(viewCfg.injectIntoView);
    if (!targetView) return;

    // Already injected? Bail.
    if (targetView.querySelector('button[data-scw-bulk-inline-bound="1"]')) return;
    // Also bail if the button was injected into a sibling toolbar that
    // moved when the view re-rendered (idempotency across re-renders)
    var scene = targetView.closest('.kn-scene') || targetView.parentElement || targetView;
    if (scene.querySelector('button[data-scw-bulk-inline-bound="1"]')) return;

    injectInlineStyles();

    // Try to slot before the configured reference button. Search the
    // surrounding scene so it works whether the reference button lives
    // in this view's toolbar, a sibling hoisted toolbar, or a separate
    // menu view alongside this one.
    var beforeBtn = viewCfg.injectBeforeText
      ? findButtonByText(scene, viewCfg.injectBeforeText)
      : null;

    // Build the button. Match the structural pattern of scw-acc-action-btn
    // (icon wrapped in a <span>, label after) so the new button is
    // visually consistent with the reference button when it sits in
    // the same toolbar.
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-acc-action-btn scw-bulk-inline-btn';
    btn.setAttribute('data-scw-bulk-inline-bound', '1');
    btn.innerHTML = '<span>' + PHOTO_SVG + '</span>Bulk Add Photos';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var recordId = getRecordId(viewCfg.hashPattern);
      if (!recordId) { alert('Could not determine record id from URL.'); return; }
      openModal(viewCfg, recordId);
    });

    if (beforeBtn && beforeBtn.parentNode) {
      beforeBtn.parentNode.insertBefore(btn, beforeBtn);
    } else {
      // Reference button not found — drop into the kn-records-nav
      // toolbar of the target view, or the view itself as last resort.
      var toolbar = targetView.querySelector('.kn-records-nav')
                 || targetView.querySelector('.view-header')
                 || targetView;
      toolbar.insertBefore(btn, toolbar.firstChild);
    }
  }

  // ── INIT: intercept configured menu links + inject inline buttons ─────
  CONFIG.VIEWS.forEach(function (viewCfg) {
    SCW.onViewRender(viewCfg.menuViewId, function () {
      var view = document.getElementById(viewCfg.menuViewId);
      if (!view) return;
      var links = view.querySelectorAll('a.kn-link, a.kn-button');
      Array.prototype.forEach.call(links, function (a) {
        if ((a.textContent || '').trim() !== viewCfg.linkText) return;
        if (a.getAttribute('data-scw-bulk-bound') === '1') return;
        a.setAttribute('data-scw-bulk-bound', '1');
        a.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();    // beat any other listeners (e.g. JotForm)
          var recordId = getRecordId(viewCfg.hashPattern);
          if (!recordId) { alert('Could not determine record id from URL.'); return; }
          openModal(viewCfg, recordId);
        });
      });
    }, 'scwBulkUpload.' + viewCfg.menuViewId);

    // Inline button on a different view's toolbar, if configured
    if (viewCfg.injectIntoView) {
      SCW.onViewRender(viewCfg.injectIntoView, function () {
        injectInlineButton(viewCfg);
      }, 'scwBulkUploadInject.' + viewCfg.injectIntoView);
    }
  });

  // Console debug helpers
  //   SCW.DEBUG = true                          → enable verbose refresh logging
  //   SCW.bulkUpload.refreshSingleRecord(v,r)   → manually trigger a row refresh
  //   SCW.bulkUpload.dbGetAll()                 → inspect persisted queue
  //   SCW.bulkUpload.dbClear()                  → wipe persisted queue
  window.SCW.bulkUpload = {
    open:                openModal,
    config:              CONFIG,
    dbGetAll:            dbGetAll,
    dbClear:             dbClear,
    refreshSingleRecord: refreshSingleRecord
  };
})();
