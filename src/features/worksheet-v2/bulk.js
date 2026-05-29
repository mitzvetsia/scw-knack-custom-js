/*** WORKSHEET V2 — BULK EDIT *************************************************
 *
 * Per-row + per-L1 + worksheet-wide selection, a floating toolbar that
 * appears when ≥1 row is selected, and an "Edit selected" modal that
 * lets the user write one or more fields to every selected record in
 * a single action.
 *
 * Architecture:
 *   - selectedIds   : Set of currently-selected record ids.
 *   - data-scw-ws-v2-select        on each card
 *   - data-scw-ws-v2-l1-select     on each L1 head
 *   - delegated change listener flips state + UI on / off
 *   - field registry by bucket category (cam / default / services /
 *     assumptions) maps to {fieldKey, label, kind} entries used to
 *     build the bulk-edit modal. Modal shows the intersection of
 *     applicable fields across all selected records' buckets, with
 *     a per-field "Apply" checkbox so untouched fields aren't written.
 *   - Connection fields reuse ns.picker in pickOnly mode — captures
 *     the chosen ids once, then the queue writes them to every
 *     selected record.
 *   - Writes run through a concurrency-capped queue (max 4) with
 *     retry-and-backoff for 429/5xx, mirroring the canonical pattern
 *     from mirror-connection-sync.js + bid-review/init.js so a 30-
 *     row bulk write doesn't lose records to Knack's rate limit.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  // ── Selection state ───────────────────────────────────────────
  var selectedIds = Object.create(null); // { recordId: true }
  function selSize() { var n = 0; for (var k in selectedIds) n++; return n; }
  function selList() { var a = []; for (var k in selectedIds) a.push(k); return a; }
  function isSelected(id) { return !!selectedIds[id]; }
  function setSelected(id, on) {
    if (on) selectedIds[id] = true;
    else delete selectedIds[id];
  }
  function clearAll() { selectedIds = Object.create(null); }

  // ── Field registry by bucket category ────────────────────────
  // kind: 'text' | 'number' | 'bool' | 'conn-single' | 'conn-multi'
  // For conn fields, candSource describes where to source candidates:
  //   - 'mdf' uses CONFIG.mdfSourceViewKey + mdfLabelField
  //   - 'devices' uses Knack.views[sourceViewKey] records (NVRs etc.)
  //   - 'sows'    uses Knack.views.view_3325 records
  //   - 'mh'      uses SCW.productMap (mounting hardware bucket)
  var FIELDS = {
    cam: [
      { key: 'field_2020', label: 'Labor description', kind: 'text' },
      { key: 'field_2150', label: 'Sub Bid',           kind: 'number' },
      { key: 'field_1973', label: '+Hrs',              kind: 'number' },
      { key: 'field_1974', label: '+Mat',              kind: 'number' },
      { key: 'field_2461', label: 'Existing cabling',  kind: 'bool' },
      { key: 'field_1984', label: 'Exterior',          kind: 'bool' },
      { key: 'field_1983', label: 'Plenum',            kind: 'bool' },
      { key: 'field_1951', label: 'Drop number',       kind: 'number' },
      { key: 'field_1965', label: 'Drop length',       kind: 'number' },
      { key: 'field_2035', label: 'Conduit',           kind: 'number' },
      { key: 'field_1953', label: 'SCW Notes',         kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',         kind: 'conn-single', candSource: 'mdf' },
      { key: 'field_2154', label: 'SOW',               kind: 'conn-multi',  candSource: 'sows' },
      { key: 'field_2197', label: 'Connected Device',  kind: 'conn-single', candSource: 'devices' }
    ],
    'default': [
      { key: 'field_2020', label: 'Labor description', kind: 'text' },
      { key: 'field_1964', label: 'Qty',               kind: 'number' },
      { key: 'field_2150', label: 'Sub Bid',           kind: 'number' },
      { key: 'field_1973', label: '+Hrs',              kind: 'number' },
      { key: 'field_1974', label: '+Mat',              kind: 'number' },
      { key: 'field_1953', label: 'SCW Notes',         kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',         kind: 'conn-single', candSource: 'mdf' },
      { key: 'field_2154', label: 'SOW',               kind: 'conn-multi',  candSource: 'sows' },
      { key: 'field_1957', label: 'Connected Devices', kind: 'conn-multi',  candSource: 'devices' }
    ],
    services: [
      { key: 'field_2020', label: 'Service description', kind: 'text' },
      { key: 'field_1964', label: 'Qty',                 kind: 'number' },
      { key: 'field_2150', label: 'Sub Bid',             kind: 'number' },
      { key: 'field_1973', label: '+Hrs',                kind: 'number' },
      { key: 'field_1974', label: '+Mat',                kind: 'number' },
      { key: 'field_1953', label: 'SCW Notes',           kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',           kind: 'conn-single', candSource: 'mdf' },
      { key: 'field_2154', label: 'SOW',                 kind: 'conn-multi',  candSource: 'sows' }
    ],
    assumptions: [
      { key: 'field_2020', label: 'Assumption text', kind: 'text' },
      { key: 'field_1953', label: 'SCW Notes',       kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',       kind: 'conn-single', candSource: 'mdf' }
    ]
  };

  function intersectFields(categories) {
    if (!categories.length) return [];
    var seed = FIELDS[categories[0]] || [];
    var result = [];
    for (var i = 0; i < seed.length; i++) {
      var f = seed[i];
      var keepAll = true;
      for (var c = 1; c < categories.length; c++) {
        var list = FIELDS[categories[c]] || [];
        var found = false;
        for (var j = 0; j < list.length; j++) {
          if (list[j].key === f.key) { found = true; break; }
        }
        if (!found) { keepAll = false; break; }
      }
      if (keepAll) result.push(f);
    }
    return result;
  }

  function recordCategories(ids, sourceViewKey) {
    var seen = {};
    var v = Knack.views[sourceViewKey];
    if (!v || !v.model || !v.model.data) return [];
    for (var i = 0; i < ids.length; i++) {
      var rec = v.model.data.get && v.model.data.get(ids[i]);
      if (!rec) continue;
      var attrs = rec.attributes || rec;
      var cat = ns.card && ns.card.bucketCategoryOf
        ? ns.card.bucketCategoryOf(attrs)
        : 'default';
      seen[cat] = true;
    }
    var out = [];
    for (var k in seen) out.push(k);
    return out;
  }

  // ── Toolbar ──────────────────────────────────────────────────
  var toolbar; // DOM element, lazily created
  function ensureToolbar(sourceViewKey) {
    if (toolbar) return toolbar;
    toolbar = document.createElement('div');
    toolbar.className = 'scw-ws-v2-bulk-toolbar';
    // Destructive action on the LEFT per CLAUDE.md\'s button-order
    // rule (destructive first, primary action last).
    toolbar.innerHTML =
      '<span class="scw-ws-v2-bulk-count">0 selected</span>' +
      '<button type="button" class="scw-ws-v2-bulk-edit" disabled>Edit selected</button>' +
      '<button type="button" class="scw-ws-v2-bulk-clear">Clear</button>' +
      '<button type="button" class="scw-ws-v2-bulk-delete" disabled>' +
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
          'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
          'stroke-linejoin="round">' +
          '<polyline points="3 6 5 6 21 6"></polyline>' +
          '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
          '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
          '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>' +
        '</svg>' +
        '<span class="scw-ws-v2-bulk-delete-label">Delete</span>' +
      '</button>';
    document.body.appendChild(toolbar);

    toolbar.querySelector('.scw-ws-v2-bulk-clear').addEventListener('click', function () {
      clearAll();
      syncDomFromState();
      refreshToolbar();
    });
    toolbar.querySelector('.scw-ws-v2-bulk-edit').addEventListener('click', function () {
      var ids = selList();
      if (!ids.length) return;
      openBulkModal(ids, sourceViewKey);
    });
    toolbar.querySelector('.scw-ws-v2-bulk-delete').addEventListener('click', function () {
      var ids = selList();
      if (!ids.length) return;
      openBulkDeleteConfirm(ids, sourceViewKey);
    });
    return toolbar;
  }

  function refreshToolbar() {
    if (!toolbar) return;
    var n = selSize();
    toolbar.classList.toggle('scw-ws-v2-bulk-toolbar--active', n > 0);
    toolbar.querySelector('.scw-ws-v2-bulk-count').textContent = n + ' selected';
    toolbar.querySelector('.scw-ws-v2-bulk-edit').disabled   = (n === 0);
    var delBtn = toolbar.querySelector('.scw-ws-v2-bulk-delete');
    delBtn.disabled = (n === 0);
    var delLabel = delBtn.querySelector('.scw-ws-v2-bulk-delete-label');
    if (delLabel) delLabel.textContent = n > 0 ? ('Delete ' + n) : 'Delete';
  }

  // ── DOM sync (when re-renders happen) ────────────────────────
  function syncDomFromState() {
    var boxes = document.querySelectorAll('[data-scw-ws-v2-select]');
    for (var i = 0; i < boxes.length; i++) {
      var id = boxes[i].getAttribute('data-scw-ws-v2-select');
      boxes[i].checked = isSelected(id);
      boxes[i].closest('.scw-ws-v2-card').classList.toggle('scw-ws-v2-card--selected', isSelected(id));
    }
    // L1 select-all reflects child state.
    var heads = document.querySelectorAll('[data-scw-ws-v2-l1-select]');
    for (var h = 0; h < heads.length; h++) {
      var l1 = heads[h].closest('.scw-ws-v2-l1');
      if (!l1) continue;
      var childBoxes = l1.querySelectorAll('[data-scw-ws-v2-select]');
      var all = childBoxes.length > 0;
      var any = false;
      for (var c = 0; c < childBoxes.length; c++) {
        if (childBoxes[c].checked) any = true;
        else all = false;
      }
      heads[h].checked = all;
      heads[h].indeterminate = any && !all;
    }
  }

  // ── Delegated handlers ───────────────────────────────────────
  // Last clicked row checkbox id — anchor for shift-click range select.
  var lastAnchorId = null;

  function rowCheckboxesInDocOrder() {
    return document.querySelectorAll('[data-scw-ws-v2-select]');
  }

  function applyRange(anchorId, targetId, on) {
    var boxes = rowCheckboxesInDocOrder();
    var ai = -1, ti = -1;
    for (var i = 0; i < boxes.length; i++) {
      var id = boxes[i].getAttribute('data-scw-ws-v2-select');
      if (id === anchorId) ai = i;
      if (id === targetId) ti = i;
    }
    if (ai === -1 || ti === -1) return;
    var lo = Math.min(ai, ti), hi = Math.max(ai, ti);
    for (var j = lo; j <= hi; j++) {
      var rid = boxes[j].getAttribute('data-scw-ws-v2-select');
      setSelected(rid, on);
    }
  }

  function wireGlobalDelegates(sourceViewKey) {
    if (document.documentElement.hasAttribute('data-scw-ws-v2-bulk-bound')) return;
    document.documentElement.setAttribute('data-scw-ws-v2-bulk-bound', '1');

    // Capture shift-state at mousedown — by the time `change` fires the
    // modifier keys aren\'t on the event. We hijack the click on the row
    // checkbox if shift is held, run a range-select, and prevent the
    // default toggle (which would only flip the clicked box).
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.hasAttribute) return;
      if (!t.hasAttribute('data-scw-ws-v2-select')) return;

      // Stop the click bubbling to the card\'s expand handler.
      e.stopPropagation();

      if (e.shiftKey && lastAnchorId) {
        // Range mode: the box\'s checked state already flipped via the
        // browser default; use the new state as the "on/off" for the
        // whole range. Then refresh DOM.
        var targetId = t.getAttribute('data-scw-ws-v2-select');
        applyRange(lastAnchorId, targetId, !!t.checked);
        syncDomFromState();
        refreshToolbar();
        // Anchor stays put so consecutive shift-clicks extend from the
        // original origin — matches Gmail / Finder behavior.
        return;
      }

      // Plain click — let the change handler do the state update; just
      // remember this id as the new anchor.
      lastAnchorId = t.getAttribute('data-scw-ws-v2-select');
    }, true);

    // Row checkbox toggles individual selection (non-shift path).
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.hasAttribute && t.hasAttribute('data-scw-ws-v2-select')) {
        // Shift-click was handled in the click listener above; here we
        // only catch the plain toggle. If shift was held, the click
        // handler already updated state.
        var id = t.getAttribute('data-scw-ws-v2-select');
        setSelected(id, !!t.checked);
        syncDomFromState();
        refreshToolbar();
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-scw-ws-v2-l1-select')) {
        var l1id   = t.getAttribute('data-scw-ws-v2-l1-select');
        var l1     = document.querySelector('[data-scw-ws-v2-l1="' + l1id + '"]');
        var boxes  = l1 ? l1.querySelectorAll('[data-scw-ws-v2-select]') : [];
        for (var i = 0; i < boxes.length; i++) {
          var rid = boxes[i].getAttribute('data-scw-ws-v2-select');
          setSelected(rid, !!t.checked);
        }
        syncDomFromState();
        refreshToolbar();
      }
    });
  }

  // ── Save queue: concurrency-capped + retry + backoff ─────────
  var MAX_CONCURRENT = 4;
  var BASE_BACKOFF   = 500; // ms
  var MAX_ATTEMPTS   = 4;

  function isRetryable(xhr) {
    if (!xhr) return true;
    var s = xhr.status;
    return s === 0 || s === 408 || s === 429 || (s >= 500 && s <= 599);
  }
  function doPutWithRetry(viewKey, recordId, body, attempt) {
    attempt = attempt || 1;
    var d = $.Deferred();
    try {
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(viewKey, recordId),
        type: 'PUT',
        data: JSON.stringify(body),
        success: function (resp) {
          d.resolve({ ok: true, recordId: recordId, status: 200, resp: resp });
        },
        error: function (xhr) {
          if (attempt < MAX_ATTEMPTS && isRetryable(xhr)) {
            var wait = BASE_BACKOFF * Math.pow(2, attempt - 1) + Math.random() * 250;
            setTimeout(function () {
              doPutWithRetry(viewKey, recordId, body, attempt + 1)
                .then(function (r) { d.resolve(r); });
            }, wait);
          } else {
            d.resolve({ ok: false, recordId: recordId, status: xhr && xhr.status });
          }
        }
      });
    } catch (e) {
      d.resolve({ ok: false, recordId: recordId, status: -1 });
    }
    return d.promise();
  }
  /** POST to MAKE_DELETE_RECORD_WEBHOOK with { recordId } — same
   *  contract the per-row trash + chip × handlers use. Retried on
   *  transient errors. Resolves to a settle-shaped result so partial
   *  failures don\'t reject the whole batch. */
  function doDeleteWithRetry(recordId, webhookUrl, attempt) {
    attempt = attempt || 1;
    var d = $.Deferred();
    try {
      $.ajax({
        url:  webhookUrl,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ recordId: recordId }),
        crossDomain: true,
        timeout: 60000,
        success: function () { d.resolve({ ok: true, recordId: recordId, status: 200 }); },
        error: function (xhr) {
          // Make webhooks often CORS-block the response (status 0)
          // even when the scenario ran fine — treat as success.
          if (xhr && xhr.status === 0) {
            d.resolve({ ok: true, recordId: recordId, status: 0 });
            return;
          }
          if (attempt < MAX_ATTEMPTS && isRetryable(xhr)) {
            var wait = BASE_BACKOFF * Math.pow(2, attempt - 1) + Math.random() * 250;
            setTimeout(function () {
              doDeleteWithRetry(recordId, webhookUrl, attempt + 1)
                .then(function (r) { d.resolve(r); });
            }, wait);
          } else {
            d.resolve({ ok: false, recordId: recordId, status: xhr && xhr.status });
          }
        }
      });
    } catch (e) {
      d.resolve({ ok: false, recordId: recordId, status: -1 });
    }
    return d.promise();
  }

  /** Generic concurrency-capped job runner — takes a list of work
   *  items and an async fn(item) → promise<result>. Same in-flight
   *  cap as runQueue. */
  function runJobQueue(items, fn, onProgress) {
    var results = [];
    var i = 0, inflight = 0, total = items.length;
    var d = $.Deferred();
    function pump() {
      while (inflight < MAX_CONCURRENT && i < total) {
        var item = items[i++];
        inflight++;
        fn(item).then(function (r) {
          inflight--;
          results.push(r);
          if (typeof onProgress === 'function') onProgress(results.length, total);
          if (results.length === total) d.resolve(results);
          else pump();
        });
      }
    }
    if (!total) d.resolve(results);
    else pump();
    return d.promise();
  }

  /** Collect the accessory line-item ids attached (via field_2464
   *  back-mirror) to any of the given parent ids. Walks the source
   *  view\'s model — accessories are hidden from the v2 tree but
   *  still present in Knack\'s records. */
  function collectAccessoryIds(parentIds, sourceViewKey) {
    var parentSet = Object.create(null);
    for (var p = 0; p < parentIds.length; p++) parentSet[parentIds[p]] = true;

    var v = window.Knack && Knack.views && Knack.views[sourceViewKey];
    if (!v || !v.model || !v.model.data) return [];
    var models = v.model.data.models || [];
    var accIds = [];
    var seen = Object.create(null);
    for (var i = 0; i < models.length; i++) {
      var r = models[i] && models[i].attributes;
      if (!r || !r.id) continue;
      // Skip parents themselves — we delete them separately.
      if (parentSet[r.id]) continue;
      var raw = r.field_2464_raw;
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && parentSet[raw[j].id]) {
          if (!seen[r.id]) { seen[r.id] = true; accIds.push(r.id); }
          break;
        }
      }
    }
    return accIds;
  }

  /** Standalone "are you sure" modal for the toolbar Delete button.
   *  Surfaces the parent + accessory counts so users see the
   *  cascade scope before confirming. */
  function openBulkDeleteConfirm(parentIds, sourceViewKey) {
    var accIds = collectAccessoryIds(parentIds, sourceViewKey);
    var subline = accIds.length
      ? 'Also deletes ' + accIds.length + ' attached accessor' +
        (accIds.length === 1 ? 'y' : 'ies') + ' (mounting hardware, etc.).'
      : 'These line items have no attached accessories.';

    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-bulk-overlay';
    overlay.innerHTML =
      '<div class="scw-ws-v2-bulk-modal scw-ws-v2-bulk-modal--confirm">' +
        '<div class="scw-ws-v2-bulk-modal-head">' +
          '<div class="scw-ws-v2-bulk-modal-title">Delete ' + parentIds.length +
            ' line item' + (parentIds.length === 1 ? '' : 's') + '?</div>' +
          '<div class="scw-ws-v2-bulk-modal-sub">' + escapeHtml(subline) +
            ' This cannot be undone.</div>' +
        '</div>' +
        '<div class="scw-ws-v2-bulk-modal-status"></div>' +
        '<div class="scw-ws-v2-bulk-modal-actions">' +
          '<button type="button" class="scw-ws-v2-bulk-modal-cancel">Cancel</button>' +
          '<button type="button" class="scw-ws-v2-bulk-modal-confirm-delete">' +
            'Delete ' + (parentIds.length + accIds.length) + ' record' +
            ((parentIds.length + accIds.length) === 1 ? '' : 's') +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var status    = overlay.querySelector('.scw-ws-v2-bulk-modal-status');
    var cancelBtn = overlay.querySelector('.scw-ws-v2-bulk-modal-cancel');
    var confirmBtn = overlay.querySelector('.scw-ws-v2-bulk-modal-confirm-delete');

    function close() { overlay.parentNode && overlay.parentNode.removeChild(overlay); }
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    confirmBtn.addEventListener('click', function () {
      runBulkDelete(parentIds, accIds, sourceViewKey, overlay, status,
        confirmBtn, cancelBtn, close);
    });
  }

  /** Bulk delete — accessories first, then parents. Both go through
   *  the existing MAKE_DELETE_RECORD_WEBHOOK (no API keys, no auto-
   *  confirm modal serialization), capped at MAX_CONCURRENT in flight
   *  with retry-on-transient-error. */
  function runBulkDelete(parentIds, accIds, sourceViewKey, overlay, status, confirmBtn, cancelBtn, close) {
    var webhookUrl = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_DELETE_RECORD_WEBHOOK) || '';
    if (!webhookUrl || /PLACEHOLDER/.test(webhookUrl)) {
      status.innerHTML = '<div class="scw-ws-v2-bulk-fail">' +
        'Delete webhook URL not configured (MAKE_DELETE_RECORD_WEBHOOK).</div>';
      return;
    }
    var totalN  = parentIds.length + accIds.length;

    confirmBtn.disabled = true;
    cancelBtn.disabled  = true;
    overlay.classList.add('scw-ws-v2-bulk-overlay--saving');
    status.innerHTML =
      '<div class="scw-ws-v2-bulk-progress">' +
        '<div class="scw-ws-v2-bulk-progress-bar" style="width:0%"></div>' +
      '</div>' +
      '<div class="scw-ws-v2-bulk-progress-text">' +
        '<span class="scw-ws-v2-bulk-spinner"></span>' +
        '<span class="scw-ws-v2-bulk-progress-label">Deleting 0 of ' + totalN + '…</span>' +
      '</div>';
    var bar   = status.querySelector('.scw-ws-v2-bulk-progress-bar');
    var label = status.querySelector('.scw-ws-v2-bulk-progress-label');

    // Accessories first so the parent\'s connections don\'t go stale
    // mid-cascade.
    var jobs = accIds.concat(parentIds);
    runJobQueue(jobs, function (id) {
      return doDeleteWithRetry(id, webhookUrl);
    }, function (done, total) {
      var pct = Math.round((done / total) * 100);
      if (bar) bar.style.width = pct + '%';
      if (label) label.textContent = 'Deleting ' + done + ' of ' + total + '… (' + pct + '%)';
    }).then(function (results) {
      var ok = 0, fail = 0;
      for (var r = 0; r < results.length; r++) {
        if (results[r].ok) ok++; else fail++;
      }
      overlay.classList.remove('scw-ws-v2-bulk-overlay--saving');
      if (fail === 0) {
        status.innerHTML = '<div class="scw-ws-v2-bulk-success">' +
          '<span class="scw-ws-v2-bulk-success-check">&#10003;</span>' +
          'Deleted ' + ok + ' records. Refreshing…</div>';
        setTimeout(function () {
          close();
          clearAll();
          if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
            ns.data.refetchAndNotify(sourceViewKey);
          }
          syncDomFromState();
          refreshToolbar();
        }, 1200);
      } else {
        status.innerHTML = '<div class="scw-ws-v2-bulk-fail">' +
          'Deleted ' + ok + ', failed ' + fail + '. Try again or close.</div>';
        confirmBtn.disabled = false;
        cancelBtn.disabled  = false;
      }
    });
  }

  function runQueue(jobs, onProgress) {
    // jobs: [{viewKey, recordId, body}, ...]
    var results = [];
    var i = 0, inflight = 0, total = jobs.length;
    var d = $.Deferred();
    function pump() {
      while (inflight < MAX_CONCURRENT && i < total) {
        var job = jobs[i++];
        inflight++;
        doPutWithRetry(job.viewKey, job.recordId, job.body).then(function (r) {
          inflight--;
          results.push(r);
          if (typeof onProgress === 'function') onProgress(results.length, total);
          if (results.length === total) d.resolve(results);
          else pump();
        });
      }
    }
    if (!total) d.resolve(results);
    else pump();
    return d.promise();
  }

  // ── Bulk-edit modal ──────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim();
  }
  function isMapConnectionsRow(rec) {
    var raw = rec && rec['field_2231_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = (rec && rec['field_2231'] || '').toString().trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }

  function getSourceCandidatesForConn(field, sourceViewKey) {
    // Returns: { candidates: [...], groupBy: fn|null, itemLabel: fn|null }
    // - mdf:     MDF/IDF locations from CONFIG.mdfSourceViewKey
    // - sows:    Scopes of Work from view_3325 (field_2122 = SW-#### id, field_2126 = name)
    // - devices: NVR/headend rows from the worksheet source view,
    //            filtered to records with field_2231 (Map Connections) = Yes,
    //            grouped by MDF/IDF (field_1946_raw[0])
    function fromViewAttrs(vk) {
      var v = Knack.views[vk];
      if (!v || !v.model || !v.model.data) return [];
      var models = v.model.data.models || [];
      var list = [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes || models[i];
        if (a && a.id) list.push(a);
      }
      return list;
    }

    if (field.candSource === 'mdf') {
      var cfgViews = (ns.CONFIG && ns.CONFIG.views) || [];
      var labelField = 'field_1642';
      var mdfViewKey = '';
      for (var v = 0; v < cfgViews.length; v++) {
        if (cfgViews[v].sourceViewKey === sourceViewKey) {
          mdfViewKey = cfgViews[v].mdfSourceViewKey;
          labelField = cfgViews[v].mdfLabelField || 'field_1642';
          break;
        }
      }
      var mdfAttrs = fromViewAttrs(mdfViewKey);
      var mdfCands = mdfAttrs.map(function (a) {
        return { id: a.id, identifier: stripHtml(a[labelField] || a.identifier) };
      }).filter(function (c) { return c.identifier; });
      return { candidates: mdfCands, groupBy: null, itemLabel: null };
    }

    if (field.candSource === 'sows') {
      var sowAttrs = fromViewAttrs('view_3325');
      var sowCands = [];
      for (var s = 0; s < sowAttrs.length; s++) {
        var a = sowAttrs[s];
        var sowId   = stripHtml(a.field_2122);
        var sowName = stripHtml(a.field_2126);
        if (!sowId && !sowName) continue;
        sowCands.push({ id: a.id, sowId: sowId, name: sowName,
                        identifier: sowId || sowName });
      }
      sowCands.sort(function (a, b) {
        return String(a.sowId).localeCompare(String(b.sowId), undefined,
          { numeric: true, sensitivity: 'base' });
      });
      return {
        candidates: sowCands,
        groupBy:    null,
        itemLabel:  function (r) {
          if (r.sowId && r.name) return r.sowId + ' · ' + r.name;
          return r.sowId || r.name || r.id;
        }
      };
    }

    if (field.candSource === 'devices') {
      var devAttrs = fromViewAttrs(sourceViewKey);
      var devCands = [];
      for (var d = 0; d < devAttrs.length; d++) {
        var r = devAttrs[d];
        if (!isMapConnectionsRow(r)) continue;
        devCands.push(r);
      }
      return {
        candidates: devCands,
        groupBy: function (r) {
          var raw = r.field_1946_raw;
          if (Array.isArray(raw) && raw.length && raw[0]) {
            return { id: raw[0].id, label: raw[0].identifier || '' };
          }
          return { id: '__unknown', label: 'Unassigned' };
        },
        itemLabel: function (r) {
          var lbl  = stripHtml(r.field_1950);
          var prod = stripHtml(r.field_1949);
          if (lbl && prod) return lbl + ' · ' + prod;
          return lbl || prod || r.id;
        }
      };
    }

    return { candidates: [], groupBy: null, itemLabel: null };
  }

  function openBulkModal(ids, sourceViewKey) {
    var categories = recordCategories(ids, sourceViewKey);
    var fields = intersectFields(categories);

    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-bulk-overlay';
    overlay.innerHTML =
      '<div class="scw-ws-v2-bulk-modal" role="dialog" aria-modal="true">' +
        '<div class="scw-ws-v2-bulk-modal-head">' +
          '<div class="scw-ws-v2-bulk-modal-title">Edit ' + ids.length + ' selected</div>' +
          '<div class="scw-ws-v2-bulk-modal-sub">' +
            (categories.length === 1
              ? 'All rows in <b>' + escapeHtml(categories[0]) + '</b> category'
              : 'Mixed buckets — showing fields common to all') +
          '</div>' +
        '</div>' +
        '<div class="scw-ws-v2-bulk-modal-body"></div>' +
        '<div class="scw-ws-v2-bulk-modal-status"></div>' +
        '<div class="scw-ws-v2-bulk-modal-actions">' +
          '<button type="button" class="scw-ws-v2-bulk-modal-cancel">Cancel</button>' +
          '<button type="button" class="scw-ws-v2-bulk-modal-save">Apply to ' + ids.length + ' rows</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var body   = overlay.querySelector('.scw-ws-v2-bulk-modal-body');
    var status = overlay.querySelector('.scw-ws-v2-bulk-modal-status');
    var saveBtn   = overlay.querySelector('.scw-ws-v2-bulk-modal-save');
    var cancelBtn = overlay.querySelector('.scw-ws-v2-bulk-modal-cancel');

    if (!fields.length) {
      body.innerHTML = '<div class="scw-ws-v2-bulk-empty">No fields are editable across all selected rows.</div>';
      saveBtn.disabled = true;
    }

    // Track per-field state: { apply: bool, value: any }
    var rowState = {};

    fields.forEach(function (f) {
      rowState[f.key] = { apply: false, value: null };
      var row = document.createElement('div');
      row.className = 'scw-ws-v2-bulk-row';
      row.setAttribute('data-scw-ws-v2-bulk-field', f.key);
      row.innerHTML =
        '<label class="scw-ws-v2-bulk-row-apply">' +
          '<input type="checkbox" data-scw-ws-v2-bulk-apply>' +
          '<span class="scw-ws-v2-bulk-row-label">' + escapeHtml(f.label) + '</span>' +
        '</label>' +
        '<div class="scw-ws-v2-bulk-row-value"></div>';
      body.appendChild(row);

      var applyCb = row.querySelector('[data-scw-ws-v2-bulk-apply]');
      var slot    = row.querySelector('.scw-ws-v2-bulk-row-value');

      // Build the appropriate input for this field kind.
      if (f.kind === 'text') {
        slot.innerHTML = '<input type="text" class="scw-ws-v2-bulk-input" placeholder="New value">';
        slot.querySelector('input').addEventListener('input', function (e) {
          rowState[f.key].value = e.target.value;
          rowState[f.key].apply = true;
          applyCb.checked = true;
        });
      } else if (f.kind === 'number') {
        slot.innerHTML = '<input type="number" step="any" class="scw-ws-v2-bulk-input" placeholder="New value">';
        slot.querySelector('input').addEventListener('input', function (e) {
          rowState[f.key].value = e.target.value;
          rowState[f.key].apply = true;
          applyCb.checked = true;
        });
      } else if (f.kind === 'bool') {
        slot.innerHTML =
          '<select class="scw-ws-v2-bulk-input">' +
            '<option value="">(no change)</option>' +
            '<option value="Yes">Yes</option>' +
            '<option value="No">No</option>' +
          '</select>';
        slot.querySelector('select').addEventListener('change', function (e) {
          if (!e.target.value) {
            rowState[f.key].apply = false;
            applyCb.checked = false;
          } else {
            rowState[f.key].value = e.target.value;
            rowState[f.key].apply = true;
            applyCb.checked = true;
          }
        });
      } else if (f.kind === 'conn-single' || f.kind === 'conn-multi') {
        slot.innerHTML =
          '<button type="button" class="scw-ws-v2-bulk-conn-btn">' +
            '<span class="scw-ws-v2-bulk-conn-val">(choose)</span>' +
            '<span class="scw-ws-v2-bulk-conn-edit">pick</span>' +
          '</button>';
        slot.querySelector('button').addEventListener('click', function () {
          var resolved = getSourceCandidatesForConn(f, sourceViewKey);
          var cands = resolved.candidates;
          if (!ns.picker || typeof ns.picker.open !== 'function') {
            status.textContent = 'Picker not available.';
            return;
          }
          if (!cands.length) {
            status.textContent = 'No candidates available for ' + f.label + '.';
            return;
          }
          ns.picker.open({
            sourceViewKey: sourceViewKey,
            recordId:      ids[0], // not used in pickOnly mode
            fieldKey:      f.key,
            label:         f.label,
            selectedIds:   [],
            candidates:    cands,
            groupBy:       resolved.groupBy || undefined,
            multi:         f.kind === 'conn-multi',
            pickOnly:      true,
            itemLabel:     resolved.itemLabel || function (r) { return r.identifier || r.id; },
            onChoose: function (chosenIds) {
              rowState[f.key].value = f.kind === 'conn-multi'
                ? chosenIds
                : (chosenIds[0] || '');
              rowState[f.key].apply = true;
              applyCb.checked = true;
              var lbl;
              if (!chosenIds.length) lbl = '(clear)';
              else if (f.kind === 'conn-single') {
                var match = null;
                for (var ci = 0; ci < cands.length; ci++) {
                  if (cands[ci].id === chosenIds[0]) { match = cands[ci]; break; }
                }
                lbl = match
                  ? (resolved.itemLabel ? resolved.itemLabel(match) : match.identifier)
                  : chosenIds[0];
              } else {
                lbl = chosenIds.length + ' selected';
              }
              slot.querySelector('.scw-ws-v2-bulk-conn-val').textContent = lbl;
            }
          });
        });
      }

      applyCb.addEventListener('change', function (e) {
        rowState[f.key].apply = !!e.target.checked;
      });
    });

    function close() {
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
    }
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    saveBtn.addEventListener('click', function () {
      // Build the body once from the rowState (same body for every record).
      var body = {};
      var applied = 0;
      Object.keys(rowState).forEach(function (k) {
        if (rowState[k].apply) {
          body[k] = rowState[k].value;
          applied++;
        }
      });
      if (!applied) {
        status.textContent = 'Tick at least one field to apply.';
        return;
      }

      var jobs = ids.map(function (rid) {
        return { viewKey: sourceViewKey, recordId: rid, body: body };
      });

      saveBtn.disabled   = true;
      cancelBtn.disabled = true;
      overlay.classList.add('scw-ws-v2-bulk-overlay--saving');
      status.innerHTML =
        '<div class="scw-ws-v2-bulk-progress">' +
          '<div class="scw-ws-v2-bulk-progress-bar" style="width:0%"></div>' +
        '</div>' +
        '<div class="scw-ws-v2-bulk-progress-text">' +
          '<span class="scw-ws-v2-bulk-spinner"></span>' +
          '<span class="scw-ws-v2-bulk-progress-label">Saving 0 of ' + jobs.length + '…</span>' +
        '</div>';
      var bar   = status.querySelector('.scw-ws-v2-bulk-progress-bar');
      var label = status.querySelector('.scw-ws-v2-bulk-progress-label');

      runQueue(jobs, function (done, total) {
        var pct = Math.round((done / total) * 100);
        if (bar) bar.style.width = pct + '%';
        if (label) label.textContent = 'Saving ' + done + ' of ' + total + '… (' + pct + '%)';
      }).then(function (results) {
        var ok = 0, fail = 0;
        for (var r = 0; r < results.length; r++) {
          if (results[r].ok) ok++; else fail++;
        }
        overlay.classList.remove('scw-ws-v2-bulk-overlay--saving');
        if (fail === 0) {
          status.innerHTML =
            '<div class="scw-ws-v2-bulk-success">' +
              '<span class="scw-ws-v2-bulk-success-check">&#10003;</span>' +
              'Saved ' + ok + ' rows. Refreshing…' +
            '</div>';
          setTimeout(function () {
            close();
            clearAll();
            try {
              if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
                ns.data.refetchAndNotify(sourceViewKey);
              } else {
                var v = Knack.views[sourceViewKey];
                if (v && v.model && typeof v.model.fetch === 'function') {
                  v.model.fetch();
                }
              }
            } catch (e) { /* ignore */ }
            syncDomFromState();
            refreshToolbar();
          }, 900);
        } else {
          status.innerHTML =
            '<div class="scw-ws-v2-bulk-fail">' +
              'Saved ' + ok + ', failed ' + fail +
              '. Try again or close — Knack may have rate-limited.' +
            '</div>';
          saveBtn.disabled   = false;
          cancelBtn.disabled = false;
        }
      });
    });
  }

  // ── Public entry point ───────────────────────────────────────
  function mount(sourceViewKey) {
    ensureToolbar(sourceViewKey);
    wireGlobalDelegates(sourceViewKey);
    // After each re-render, sync visible boxes to current state.
    syncDomFromState();
    refreshToolbar();
  }

  ns.bulk = {
    mount:           mount,
    syncDomFromState: syncDomFromState,
    refreshToolbar:  refreshToolbar
  };
})();
/*** END WORKSHEET V2 — BULK EDIT *********************************************/
