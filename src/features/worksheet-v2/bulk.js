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
    toolbar.innerHTML =
      '<span class="scw-ws-v2-bulk-count">0 selected</span>' +
      '<button type="button" class="scw-ws-v2-bulk-edit" disabled>Edit selected</button>' +
      '<button type="button" class="scw-ws-v2-bulk-clear">Clear</button>';
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
    return toolbar;
  }

  function refreshToolbar() {
    if (!toolbar) return;
    var n = selSize();
    toolbar.classList.toggle('scw-ws-v2-bulk-toolbar--active', n > 0);
    toolbar.querySelector('.scw-ws-v2-bulk-count').textContent = n + ' selected';
    toolbar.querySelector('.scw-ws-v2-bulk-edit').disabled = (n === 0);
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

  function getSourceCandidatesForConn(field, sourceViewKey) {
    // Use the same candidate-resolution pattern as init.js\'s per-row
    // pickers, simplified to "give me [{id, identifier}] for this
    // field". We don\'t try to filter by NVR/cam compatibility here —
    // the modal is a "set everyone to this value" tool; user owns
    // the choice.
    var out = [];
    function fromView(vk, labelField) {
      var v = Knack.views[vk];
      if (!v || !v.model || !v.model.data) return [];
      var models = v.model.data.models || [];
      var list = [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes || models[i];
        if (!a || !a.id) continue;
        var lbl = String(a[labelField] || a.identifier || '')
          .replace(/<[^>]*>/g, '').trim();
        if (lbl) list.push({ id: a.id, identifier: lbl });
      }
      return list;
    }
    if (field.candSource === 'mdf') {
      var cfgViews = (ns.CONFIG && ns.CONFIG.views) || [];
      for (var v = 0; v < cfgViews.length; v++) {
        if (cfgViews[v].sourceViewKey === sourceViewKey) {
          out = fromView(cfgViews[v].mdfSourceViewKey,
                         cfgViews[v].mdfLabelField || 'field_1642');
          break;
        }
      }
    } else if (field.candSource === 'sows') {
      out = fromView('view_3325', 'field_2022');
    } else if (field.candSource === 'devices') {
      out = fromView(sourceViewKey, 'field_1949');
    }
    return out;
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
          var cands = getSourceCandidatesForConn(f, sourceViewKey);
          if (!ns.picker || typeof ns.picker.open !== 'function') {
            status.textContent = 'Picker not available.';
            return;
          }
          ns.picker.open({
            sourceViewKey: sourceViewKey,
            recordId:      ids[0], // not used in pickOnly mode
            fieldKey:      f.key,
            label:         f.label,
            selectedIds:   [],
            candidates:    cands,
            multi:         f.kind === 'conn-multi',
            pickOnly:      true,
            itemLabel:     function (r) { return r.identifier || r.id; },
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
                lbl = match ? match.identifier : chosenIds[0];
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
      status.textContent = 'Saving 0 / ' + jobs.length + '…';

      runQueue(jobs, function (done, total) {
        status.textContent = 'Saving ' + done + ' / ' + total + '…';
      }).then(function (results) {
        var ok = 0, fail = 0;
        for (var r = 0; r < results.length; r++) {
          if (results[r].ok) ok++; else fail++;
        }
        if (fail === 0) {
          status.textContent = 'Saved ' + ok + ' rows.';
          setTimeout(function () {
            close();
            clearAll();
            // Re-fetch source view so cards rebuild with new values.
            try {
              var v = Knack.views[sourceViewKey];
              if (v && v.model && typeof v.model.fetch === 'function') {
                v.model.fetch();
              }
            } catch (e) { /* ignore */ }
            syncDomFromState();
            refreshToolbar();
          }, 600);
        } else {
          status.textContent = 'Saved ' + ok + ', failed ' + fail + '. Try again or close.';
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
