/*** FEATURE: Create Alternate SOW button → view_3869 accordion header ***/
/**
 * Injects a "Create Alternate SOW" button into the accordion header for
 * view_3869. Visible only after the Initiate Install step has fired
 * (field_1199 populated on the SOW detail view_3827).
 *
 * Click fires SCW.CONFIG.MAKE_DUPLICATE_SOW_WEBHOOK with:
 *   { sourceRecordId: <SOW record id>, triggeredBy: { id, name, email } }
 *
 * Make creates a new SOW + appends its ID to field_2154 on each line
 * item / license / recurring service (many-to-many SOW connection),
 * then returns { success, newSowId, newSowUrl }. Client redirects to
 * newSowUrl on success.
 */
(function () {
  'use strict';

  var TARGET_VIEW    = 'view_3869';
  var GATE_VIEW      = 'view_3827';   // SOW detail view supplying field_1199 + record id
  var GATE_FIELD     = 'field_1199';  // Install Project populated -> show button
  var BTN_MARKER     = 'scw-create-sow-option-btn';
  var BTN_LABEL      = 'Clone SOW / Create Alternative SOW';
  var EVENT_NS       = '.scwCreateSowOption';

  var COPY_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round" class="scw-create-sow-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // Inject the spinner keyframes once.
  (function injectStyles() {
    if (document.getElementById('scw-create-sow-option-css')) return;
    var s = document.createElement('style');
    s.id = 'scw-create-sow-option-css';
    s.textContent =
      '.' + BTN_MARKER + '.is-loading { pointer-events: none; opacity: 0.75; cursor: wait; }' +
      '.' + BTN_MARKER + '.is-loading svg { animation: scw-create-sow-spin 0.8s linear infinite; }' +
      '@keyframes scw-create-sow-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  })();

  // ── Read field_1199 from the SOW detail view DOM ─────────
  function getGateFieldValue() {
    var view = document.getElementById(GATE_VIEW);
    if (!view) return '';
    var cell = view.querySelector('.kn-detail.' + GATE_FIELD + ' .kn-detail-body');
    if (!cell) return '';
    return (cell.textContent || '').replace(/\u00a0/g, ' ').trim();
  }

  // ── Current SOW record id (pulled from view_3827's model) ─
  function getSourceSowId() {
    try {
      var v = Knack.views && Knack.views[GATE_VIEW];
      if (v && v.model && v.model.attributes && v.model.attributes.id) {
        return v.model.attributes.id;
      }
    } catch (e) { /* fall through */ }
    return '';
  }

  function getTriggeredBy() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // ── Collect line-item record IDs from a Knack table view's model ──
  // Used so Make doesn't need a round-trip to query existing items;
  // the client already has them loaded in memory.
  function collectRecordIdsFromView(viewId) {
    var out = [];
    try {
      var v = Knack && Knack.views && Knack.views[viewId];
      var data = v && v.model && v.model.data;
      var models = data && data.models;
      if (!models || !models.length) return out;
      for (var i = 0; i < models.length; i++) {
        var attrs = models[i].attributes;
        if (attrs && typeof attrs.id === 'string' && /^[a-f0-9]{24}$/.test(attrs.id)) {
          out.push(attrs.id);
        }
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  // ── Safety net: force a fresh fetch on a view's model ────
  // Guards against the click firing before a view (esp. one inside a
  // collapsed accordion or briefly re-fetched) has populated its
  // model.data.models. Resolves on success OR failure so a single
  // slow/broken view can't block the webhook entirely.
  function refreshView(viewId) {
    return new Promise(function (resolve) {
      try {
        var v = Knack && Knack.views && Knack.views[viewId];
        if (!v || !v.model || typeof v.model.fetch !== 'function') {
          resolve(); return;
        }
        v.model.fetch({
          success: function () { resolve(); },
          error:   function () { resolve(); }   // fall through with whatever's cached
        });
      } catch (e) { resolve(); }
    });
  }

  // ── Fire the duplicate-SOW webhook ───────────────────────
  function fireWebhook(btn) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_DUPLICATE_SOW_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert('Duplicate-SOW webhook URL is not configured.');
      return;
    }
    var sourceRecordId = getSourceSowId();
    if (!sourceRecordId) {
      alert('Could not determine current SOW record ID.');
      return;
    }

    setBtnLoading(btn, true);

    // Re-fetch both line-item grids before reading IDs. view_3471
    // (Licenses / Recurring Services) sits in a collapsed accordion by
    // default — on some page loads its data may be stale or not yet
    // populated when the user clicks. view_3586 is usually loaded
    // already, but a fresh fetch also catches the rare case where an
    // item was added elsewhere (e.g. another tab) since last render.
    Promise.all([
      refreshView('view_3586'),
      refreshView('view_3471')
    ]).then(function () {
      var sowLineItemIds      = collectRecordIdsFromView('view_3586');
      var licenseRecurringIds = collectRecordIdsFromView('view_3471');

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRecordId:      sourceRecordId,
          sowLineItemIds:      sowLineItemIds,
          licenseRecurringIds: licenseRecurringIds,
          triggeredBy:         getTriggeredBy()
        })
      });
    }).then(function (resp) {
      // Read as text first so we can log whatever came back even if
      // the scenario hasn't been configured to return JSON yet.
      return resp.text().then(function (body) {
        var data = null;
        try { data = body ? JSON.parse(body) : null; } catch (e) { /* not JSON */ }
        console.log('[SCW clone-sow] status=' + resp.status + ' body=' + body);
        return { status: resp.status, body: body, data: data, ok: resp.ok };
      });
    }).then(function (resp) {
      if (resp.data && resp.data.success && resp.data.newSowUrl) {
        window.location.href = resp.data.newSowUrl;
        return;
      }
      setBtnLoading(btn, false);

      // Surface the real reason so it's easier to fix the Make scenario.
      var msg;
      if (!resp.ok) {
        msg = 'Webhook returned HTTP ' + resp.status + '. Response:\n\n' + (resp.body || '(empty)');
      } else if (!resp.data) {
        msg = 'Webhook returned non-JSON response. Add a "Webhook Response" module in Make ' +
              'that returns JSON like {"success": true, "newSowUrl": "..."}.\n\n' +
              'Actual body:\n' + (resp.body || '(empty)');
      } else if (resp.data.error || resp.data.message) {
        msg = resp.data.error || resp.data.message;
      } else if (resp.data.success && !resp.data.newSowUrl) {
        msg = 'Webhook returned success but no newSowUrl. Add newSowUrl to the ' +
              'Webhook Response body so the client knows where to redirect.';
      } else {
        msg = 'Failed to create SOW option. Body:\n\n' + (resp.body || '(empty)');
      }
      alert(msg);
    }).catch(function (err) {
      setBtnLoading(btn, false);
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    var iconSpan = btn.querySelector('.scw-create-sow-icon');
    if (loading) {
      btn.classList.add('is-loading');
      if (iconSpan) iconSpan.innerHTML = SPINNER_SVG;
    } else {
      btn.classList.remove('is-loading');
      if (iconSpan) iconSpan.innerHTML = COPY_SVG;
    }
  }

  // ── Inject / remove the button based on gate + presence ──
  function syncButton() {
    var targetEl = document.getElementById(TARGET_VIEW);
    if (!targetEl) return;
    var accordion = targetEl.closest('.scw-ktl-accordion');
    if (!accordion) return;
    var header = accordion.querySelector('.scw-ktl-accordion__header');
    if (!header) return;

    var existing = header.querySelector('.' + BTN_MARKER);
    var shouldShow = !!getGateFieldValue();

    if (!shouldShow) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;   // already injected, nothing to do

    var actions = header.querySelector('.scw-acc-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'scw-acc-actions';
      var chevron = header.querySelector('.scw-acc-chevron');
      if (chevron) header.insertBefore(actions, chevron);
      else header.appendChild(actions);
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-acc-action-btn ' + BTN_MARKER;
    btn.title = 'Create a second SOW option on this project';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'scw-create-sow-icon';
    iconSpan.innerHTML = COPY_SVG;
    btn.appendChild(iconSpan);

    btn.appendChild(document.createTextNode(BTN_LABEL));

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (btn.classList.contains('is-loading')) return;
      fireWebhook(btn);
    });

    actions.appendChild(btn);
  }

  // ── Bindings ─────────────────────────────────────────────
  function bind() {
    $(document)
      .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
      .on('knack-view-render.' + TARGET_VIEW + EVENT_NS, function () {
        setTimeout(syncButton, 500);
      });

    $(document)
      .off('knack-view-render.' + GATE_VIEW + EVENT_NS)
      .on('knack-view-render.' + GATE_VIEW + EVENT_NS, function () {
        setTimeout(syncButton, 500);
      });

    $(document)
      .off('knack-scene-render.any' + EVENT_NS)
      .on('knack-scene-render.any' + EVENT_NS, function () {
        setTimeout(syncButton, 1500);
      });
  }

  bind();
})();
