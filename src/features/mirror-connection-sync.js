/**************************************************************************************************
 * FEATURE: Silent deterministic regroup after a parent-multi-connection inline-edit
 *
 * Generic pattern: in a Knack table view, the record R holds a multi-connection
 * TRIGGER_FIELD pointing at children. Each child has:
 *   - CONNECTIONS_FIELD — back-connection to the parent (inverse of TRIGGER_FIELD)
 *   - GROUPING_FIELD    — the L1 group key (typically MDF/IDF), which must match
 *                         the parent's GROUPING_FIELD so the child renders
 *                         under the parent's group header in the worksheet.
 *
 * When R.TRIGGER_FIELD is edited, a Make webhook rewrites CONNECTIONS_FIELD +
 * GROUPING_FIELD on the added/removed children:
 *    - added child D    → D.GROUPING_FIELD    = R.GROUPING_FIELD
 *                         D.CONNECTIONS_FIELD = [R]
 *    - removed child D  → D.CONNECTIONS_FIELD = []  (GROUPING_FIELD untouched)
 * Which has the side-effect that child rows visually move between group headers.
 *
 * This module mirrors that rule deterministically FE-side so the UI updates
 * without waiting for the webhook, without polling, and without a full
 * model.fetch() re-render (which flashes the view and re-runs every per-card
 * enhancer). We know the rule exactly, so we compute the add/remove diff from
 * the cell-update event payload, move the DOM rows, patch the Backbone models,
 * patch the visible cards, fire background PUTs for each affected child, and
 * only after ALL PUTs land do we call model.fetch() to resync from the server.
 *
 * Strategy (once per instance):
 *   1. On knack-cell-update.<VIEW_ID> stash the event record R and arm a
 *      debounced settle timer — Knack's native post-edit re-render fires
 *      within ~50ms and would wipe any DOM changes we made synchronously.
 *   2. Every knack-view-render.<VIEW_ID> during the edit cycle resets the
 *      settle timer. After SETTLE_MS of render silence, apply the regroup.
 *   3. Deterministic regroup:
 *        newChildren     = R[TRIGGER_FIELD + '_raw'] (event payload)
 *        currentChildren = DOM-scan every visible card's td.<CONNECTIONS_FIELD>
 *                          for a `<span data-kn="connection-value">` whose class
 *                          list is R.id — device-worksheet.js moves the original
 *                          Knack-rendered td (with its spans intact) from the
 *                          hidden sourceTr into the card's detail panel, so the
 *                          DOM is the ground truth.
 *        added   = newChildren ∖ currentChildren
 *        removed = currentChildren ∖ newChildren
 *      For each added child D:
 *        - move D's row-triple into R's L1 group (walk back from R's wsTr to
 *          the nearest preceding .kn-table-group.kn-group-level-1)
 *        - patch D's Backbone model (GROUPING_FIELD, CONNECTIONS_FIELD)
 *        - patch D's visible card via SCW.deviceWorksheet.patchCard
 *        - fire PUT { GROUPING_FIELD: [R.<GROUPING_FIELD>], CONNECTIONS_FIELD: [R] }
 *      For each removed child D:
 *        - patch D's Backbone model (CONNECTIONS_FIELD = [])
 *        - patch D's visible card
 *        - fire PUT { CONNECTIONS_FIELD: [] }
 *      When ALL PUTs have landed (success or failure), fire a real
 *      view.model.fetch() to resync Knack's model with the now-consistent
 *      server state.
 *   4. Falls back to model.fetch() ONLY when R's wsTr has no L1 header before
 *      it (R was just moved into an empty group, or R is not visible) — we
 *      can't silently synthesize an L1 header row.
 *   5. A re-entrancy guard (ownPuts) ignores any stray knack-cell-update
 *      events that echo our own background PUTs.
 *   6. A MutationObserver "mut-guard" watches the view's tbody and re-applies
 *      the cached plan whenever drift is detected (catches Knack re-renders
 *      that bypass knack-view-render).
 *
 * Instances are registered at the bottom via createMirror(config). Each
 * instance has fully independent state (pendingPlan, settleTimer, ownPuts,
 * mutObserver, etc.); the event namespaces include VIEW_ID so handlers
 * don't collide.
 *
 * Current instances:
 *   - view_3505 / field_2380 → field_2381, grouped by field_2375  (survey line items)
 *   - view_3586 / field_1957 → field_2197, grouped by field_1946  (SOW line items)
 **************************************************************************************************/
(function () {
  'use strict';

  var HEX24 = /^[0-9a-f]{24}$/i;

  // ======================================================================
  // Cascade-in-flight tracker (shared by ALL mirror instances).
  // ----------------------------------------------------------------------
  // Both forward (field_1957 → children) and inverse (field_2197 →
  // accessories) cascades fire PUTs in the background and return
  // immediately. If the user navigates while requests are still pending,
  // the browser would normally cancel every in-flight XHR and writes
  // would be lost — which is exactly the "some children got updated, not
  // all" partial-cascade bug.
  //
  // Two-layer protection:
  //   1. fetch(..., { keepalive: true }) — the browser is required to
  //      finish the request even after the page unloads. This is the
  //      hard guarantee. See knackPutKeepalive() below.
  //   2. A loud toast + a beforeunload prompt while count > 0 so the
  //      user notices and (hopefully) pauses before navigating.
  //
  // The connection-picker has its own stage gate that keeps the modal
  // open until everything settles. But native inline edits and form
  // submits don't go through the picker, so the cascade fires-and-
  // forgets with no UI feedback at all without this tracker.
  // ======================================================================

  var _cascadeInFlight   = 0;
  var _cascadeToastEl    = null;
  var _cascadeUnloadBound = false;
  var CASCADE_TOAST_CSS_ID = 'scw-cascade-toast-css';

  function injectCascadeToastStyles() {
    if (document.getElementById(CASCADE_TOAST_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CASCADE_TOAST_CSS_ID;
    s.textContent = [
      '.scw-cascade-toast {',
      '  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);',
      '  z-index: 100000;',
      '  background: #b45309; color: #fff;',
      '  padding: 12px 20px; border-radius: 10px;',
      '  font: 600 13px/1.3 system-ui, -apple-system, sans-serif;',
      '  box-shadow: 0 6px 22px rgba(0,0,0,0.28);',
      '  display: inline-flex; align-items: center; gap: 12px;',
      '  pointer-events: none;',
      '  max-width: 92vw;',
      '}',
      '.scw-cascade-toast__spinner {',
      '  width: 14px; height: 14px;',
      '  border: 2px solid rgba(255,255,255,0.4);',
      '  border-top-color: #fff;',
      '  border-radius: 50%;',
      '  animation: scwCascadeSpin 0.8s linear infinite;',
      '  flex: 0 0 auto;',
      '}',
      '.scw-cascade-toast__msg { display: flex; flex-direction: column; gap: 2px; }',
      '.scw-cascade-toast__msg b { font-weight: 700; }',
      '.scw-cascade-toast__msg small { font-weight: 500; opacity: 0.9; font-size: 11px; }',
      '@keyframes scwCascadeSpin { to { transform: rotate(360deg); } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showCascadeToast() {
    if (_cascadeToastEl) return;
    injectCascadeToastStyles();
    _cascadeToastEl = document.createElement('div');
    _cascadeToastEl.className = 'scw-cascade-toast';
    _cascadeToastEl.innerHTML =
      '<span class="scw-cascade-toast__spinner"></span>' +
      '<span class="scw-cascade-toast__msg">' +
        '<b>Saving changes — please don\'t leave this page</b>' +
        '<small>Syncing connected records. This takes a few seconds.</small>' +
      '</span>';
    document.body.appendChild(_cascadeToastEl);
  }

  function hideCascadeToast() {
    if (!_cascadeToastEl) return;
    if (_cascadeToastEl.parentNode) _cascadeToastEl.parentNode.removeChild(_cascadeToastEl);
    _cascadeToastEl = null;
  }

  function cascadeUnloadHandler(e) {
    if (_cascadeInFlight <= 0) return;
    // Modern browsers ignore the custom string but still show a generic
    // "Are you sure you want to leave?" prompt as long as we set
    // returnValue. The actual writes are protected by keepalive:true on
    // the fetch — this prompt is just a soft warning.
    var msg = 'Saves still in progress — wait a moment before leaving.';
    e.preventDefault();
    e.returnValue = msg;
    return msg;
  }

  // ======================================================================
  // PUT helper that survives page unload.
  // ----------------------------------------------------------------------
  // fetch(..., { keepalive: true }) tells the browser it must finish
  // the request even if the page is unloading (tab close, navigation,
  // refresh). XHR / $.ajax / SCW.knackAjax do NOT have this guarantee —
  // the browser cancels them as soon as the page tears down. This is the
  // hard fix for "some children got the cascade write, others didn't"
  // when the user navigates partway through a multi-PUT cascade.
  //
  // Keepalive constraints:
  //   - body must be ≤ 64 KB (we send tiny JSON, no issue)
  //   - method-agnostic, request-body-only (no streaming response)
  //
  // Falls back to SCW.knackAjax if fetch() is unavailable for any reason.
  //
  // ── Reliability layer ────────────────────────────────────────────────
  // Knack's REST API rate-limits at ~10 req/s and any burst beyond that
  // returns 429s. A 13-child cascade therefore reliably loses a few
  // PUTs without protection. Two layers on top of the raw helper:
  //   1. Concurrency cap (MAX_CONCURRENT_PUTS) — never run more than N
  //      at once. Excess requests queue and start as slots free up.
  //   2. Retry-with-backoff on transient failures (429, 5xx, network
  //      error). Up to MAX_PUT_ATTEMPTS attempts with exponential
  //      delays + jitter. Permanent 4xx errors don't retry (no point).
  // ======================================================================
  var MAX_CONCURRENT_PUTS = 4;
  var MAX_PUT_ATTEMPTS    = 4;
  var BASE_BACKOFF_MS     = 350;

  var _putQueue   = [];
  var _putRunning = 0;

  function isTransientPutError(err) {
    var msg = (err && err.message) || '';
    if (/PUT 429/.test(msg)) return true;
    if (/PUT 5\d\d/.test(msg)) return true;
    if (/PUT 408/.test(msg)) return true;     // request timeout
    // fetch() rejects (network blip, connection reset, AbortError)
    if (/network|fetch|abort|timeout/i.test(msg)) return true;
    return false;
  }

  function knackPutKeepaliveOnce(url, body, onDone) {
    var hasFetch = typeof window.fetch === 'function';
    if (!hasFetch) {
      if (window.SCW && typeof window.SCW.knackAjax === 'function') {
        window.SCW.knackAjax({
          type: 'PUT', url: url, data: JSON.stringify(body), dataType: 'json',
          success: function (resp) { if (typeof onDone === 'function') onDone(null, resp); },
          error:   function (xhr)  {
            var status = xhr && xhr.status;
            if (typeof onDone === 'function') onDone(new Error('PUT ' + (status || 'failed')));
          }
        });
        return;
      }
      if (typeof onDone === 'function') onDone(new Error('fetch+knackAjax both unavailable'));
      return;
    }
    try {
      window.fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type':           'application/json',
          'X-Knack-Application-Id': Knack.application_id,
          'x-knack-rest-api-key':   'knack',
          'Authorization':          Knack.getUserToken()
        },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: 'include'
      }).then(function (resp) {
        if (!resp.ok) {
          if (typeof onDone === 'function') onDone(new Error('PUT ' + resp.status));
          return;
        }
        if (typeof onDone === 'function') onDone(null, resp);
      }).catch(function (err) {
        if (typeof onDone === 'function') onDone(err);
      });
    } catch (e) {
      if (typeof onDone === 'function') onDone(e);
    }
  }

  function knackPutKeepaliveWithRetry(url, body, onDone) {
    var attempt = 0;
    function go() {
      attempt++;
      knackPutKeepaliveOnce(url, body, function (err, resp) {
        if (!err) {
          if (typeof onDone === 'function') onDone(null, resp);
          return;
        }
        if (isTransientPutError(err) && attempt < MAX_PUT_ATTEMPTS) {
          var delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) +
                      Math.floor(Math.random() * 250);
          try {
            console.warn('[scw-mirror-sync] transient PUT failure ' + url +
              ' (' + (err && err.message) + ') — retry ' + attempt +
              '/' + (MAX_PUT_ATTEMPTS - 1) + ' in ' + delay + 'ms');
          } catch (e) { /* ignore */ }
          setTimeout(go, delay);
          return;
        }
        if (typeof onDone === 'function') onDone(err);
      });
    }
    go();
  }

  // Concurrency-limited queue — funnels every PUT through here so we
  // don't burst past Knack's rate limit on big cascades.
  function knackPutKeepalive(url, body, onDone) {
    _putQueue.push({ url: url, body: body, onDone: onDone });
    drainPutQueue();
  }

  function drainPutQueue() {
    while (_putRunning < MAX_CONCURRENT_PUTS && _putQueue.length) {
      var task = _putQueue.shift();
      _putRunning++;
      knackPutKeepaliveWithRetry(task.url, task.body, function (err, resp) {
        _putRunning--;
        try {
          if (typeof task.onDone === 'function') task.onDone(err, resp);
        } finally {
          // Defer to next tick so onDone callbacks (which may enqueue
          // more PUTs of their own) run before we recheck the queue.
          setTimeout(drainPutQueue, 0);
        }
      });
    }
  }

  function bindCascadeUnloadGuard() {
    if (_cascadeUnloadBound) return;
    _cascadeUnloadBound = true;
    window.addEventListener('beforeunload', cascadeUnloadHandler);
  }

  function unbindCascadeUnloadGuard() {
    if (!_cascadeUnloadBound) return;
    _cascadeUnloadBound = false;
    window.removeEventListener('beforeunload', cascadeUnloadHandler);
  }

  function cascadeBegin() {
    _cascadeInFlight++;
    if (_cascadeInFlight === 1) {
      showCascadeToast();
      bindCascadeUnloadGuard();
    }
  }

  // Subscribers waiting for the next idle moment via SCW.mirrorConn.whenIdle().
  // Resolved + cleared when _cascadeInFlight hits 0.
  var _idleSubscribers = [];

  function cascadeEnd() {
    _cascadeInFlight--;
    if (_cascadeInFlight <= 0) {
      _cascadeInFlight = 0;
      hideCascadeToast();
      unbindCascadeUnloadGuard();

      // Broadcast — any module that wants to refetch dependent data
      // (worksheet-v2's hidden source view, downstream summaries, etc.)
      // can listen for this event instead of polling.
      try {
        document.dispatchEvent(new CustomEvent('scw-cascade-idle'));
      } catch (e) { /* ancient browser fallback isn't a concern */ }

      // Resolve any pending whenIdle() promises and clear the queue.
      var subs = _idleSubscribers;
      _idleSubscribers = [];
      for (var i = 0; i < subs.length; i++) {
        try { subs[i](); } catch (e) { /* ignore */ }
      }
    }
  }

  /**
   * Public: returns a Promise that resolves when no cascade is in
   * flight. If one is currently running, resolves when it ends. If
   * no cascade is running AND no grace period was requested, resolves
   * on the next event-loop tick.
   *
   * Useful pattern after a connection edit fires a PUT — the cascade
   * may not have started yet, so wait a short grace window (default
   * 600ms) for it to kick off, then await its completion.
   */
  function whenIdle(opts) {
    opts = opts || {};
    var graceMs = (opts.graceMs != null) ? opts.graceMs : 600;
    var maxMs   = (opts.maxMs != null)   ? opts.maxMs   : 30000;

    return new Promise(function (resolve) {
      var resolved = false;
      function done() {
        if (resolved) return;
        resolved = true;
        resolve();
      }
      var hardCap = setTimeout(done, maxMs);

      // After the grace period, if no cascade is running, resolve.
      // If one IS running, queue ourselves on the idle subscribers.
      setTimeout(function () {
        if (_cascadeInFlight === 0) {
          clearTimeout(hardCap);
          done();
        } else {
          _idleSubscribers.push(function () {
            clearTimeout(hardCap);
            done();
          });
        }
      }, graceMs);
    });
  }

  // Expose the public surface.
  window.SCW = window.SCW || {};
  window.SCW.mirrorConn = window.SCW.mirrorConn || {};
  window.SCW.mirrorConn.whenIdle = whenIdle;
  window.SCW.mirrorConn.isCascadeInFlight = function () { return _cascadeInFlight > 0; };

  // ======================================================================
  // FACTORY — one instance per view that needs the silent-regroup pattern.
  // All state below (ownPuts, pendingPlan, settleTimer, mutObserver, …)
  // is closure-scoped per call, so instances never share state.
  // ======================================================================
  function createMirror(config) {
    // ── config ──
    var VIEW_ID           = config.VIEW_ID;
    var TRIGGER_FIELD     = config.TRIGGER_FIELD;     // children-connection on the edited record
    var GROUPING_FIELD    = config.GROUPING_FIELD;    // L1 group key (e.g. REL_mdf-idf)
    var CONNECTIONS_FIELD = config.CONNECTIONS_FIELD; // back-connection to parent (detail-panel)
    // Optional: when a child's GROUPING_FIELD changes, also update the
    // GROUPING_FIELD on every record connected to it via ACCESSORIES_FIELD.
    // Used by view_3586 / view_3610 to cascade an MDF/IDF change down to
    // the camera's mounting-hardware accessories (which live on
    // ACCESSORIES_VIEW_ID and need to share the camera's MDF for grouping
    // and totals to render correctly).
    //
    // ACCESSORIES_PARENT_FIELD is the back-connection on each accessory
    // pointing to its parent camera/reader. Reading it from the
    // accessory view's model is the source-of-truth lookup; the older
    // DOM scrape of the parent's td.<ACCESSORIES_FIELD> stays as a
    // fallback for views where the accessory view's model isn't loaded.
    var ACCESSORIES_FIELD        = config.ACCESSORIES_FIELD        || null;
    var ACCESSORIES_VIEW_ID      = config.ACCESSORIES_VIEW_ID      || null;
    var ACCESSORIES_PARENT_FIELD = config.ACCESSORIES_PARENT_FIELD || null;
    // Optional: when the parent's SOW connection (SOW_FIELD, e.g.
    // field_2154) is edited, cascade the SOW to its children so they stay
    // on the parent's SOW (see the SOW-cascade handler below for the exact
    // accessory-vs-connected-device rules).
    var SOW_FIELD                = config.SOW_FIELD                || null;
    var SETTLE_MS         = (config.SETTLE_MS       != null) ? config.SETTLE_MS       : 400;
    var EVENT_NS          = config.EVENT_NS         || '.scwSilentRegroup';
    var PUBLIC_API_NAME   = config.PUBLIC_API_NAME  || null;
    // MODEL_ONLY: source view has no v1 worksheet DOM (no .scw-ws-row
    // triplet, no .kn-table-group headers). Used by view_3962 — v2's
    // dedicated source view. In this mode we never DOM-walk or DOM-mutate:
    //   - candidate scan reads from the Backbone model
    //   - destHeader lookup is skipped (always null, no DOM moves)
    //   - patchCard calls are skipped (v1's API isn't bound here)
    //   - mut-guard observer + view-render replay are skipped
    //   - PUTs still fire normally; cascade-idle still emits when they
    //     settle, so v2's data layer picks up fresh data via refetch
    var MODEL_ONLY        = config.MODEL_ONLY === true;
    // LABEL_FIELD: the record's own display-label field on THIS instance's
    // object — the last-resort source for a parent's connection identifier in
    // sampleIdentifierForParent. Defaults to the survey label (field_2365),
    // which the original MODEL_ONLY branch hardcoded; SOW instances must pass
    // field_1950 and install instances field_2802, or the identifier resolves
    // empty and the optimistic child patch renders a raw record id in
    // Connected To (the "cascade writes an ID" bug).
    var LABEL_FIELD       = config.LABEL_FIELD || 'field_2365';
    var LOG_PREFIX        = '[scw-silent-regroup.' + VIEW_ID + ']';

    function log() {
      if (!window.SCW || !window.SCW.DEBUG) return;
      try { console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch (e) {}
    }

  // ======================================================================
  // DOM helpers — reading field cells out of the triple-row card layout.
  // ----------------------------------------------------------------------
  // For view_3505 each record is rendered as:
  //    sourceTr [data-scw-worksheet="1"]  (hidden, original Knack tr — most
  //                                        of its tds have been moved OUT
  //                                        into the card below)
  //    wsTr    .scw-ws-row                (visible, id=RECORD_ID, wraps the card)
  //    photoRow .scw-inline-photo-row     (optional trailing photo strip)
  //
  // device-worksheet.js moves the original field_2381 td into the card's
  // detail panel with its contents intact, so:
  //   - field_2381 → DOM-readable via `tr.scw-ws-row td.field_2381 span[data-kn="connection-value"]`
  //   - field_2375 → NOT DOM-readable (moveIcon rewrites innerHTML)
  //
  // Writes to field_2381/field_2375 flow through:
  //   - syncModelChild()                 → Backbone attrs
  //   - SCW.deviceWorksheet.patchCard()  → the visible card td text
  // No sourceTr cell is ever written — there's nothing to write to.
  // ======================================================================

  function getSourceTr(wsTr) {
    if (!wsTr) return null;
    var s = wsTr.previousElementSibling;
    if (s && s.getAttribute && s.getAttribute('data-scw-worksheet') === '1') return s;
    return null;
  }

  function getTrailingPhotoRow(wsTr) {
    if (!wsTr) return null;
    var n = wsTr.nextElementSibling;
    if (n && n.classList && n.classList.contains('scw-inline-photo-row')) return n;
    return null;
  }

  // ----------------------------------------------------------------------
  // Backbone model access — used only as a fallback for R's field_2375_raw
  // when the event payload doesn't include it (the DOM can't tell us because
  // moveIcon rewrites R's field_2375 td).
  // ----------------------------------------------------------------------

  function getModelRecords() {
    try {
      if (typeof Knack === 'undefined' || !Knack.views || !Knack.views[VIEW_ID]) return [];
      var v = Knack.views[VIEW_ID];
      if (!v.model) return [];
      return (v.model.data && v.model.data.models) || v.model.models || [];
    } catch (e) { return []; }
  }

  function getModelAttrs(recordId) {
    if (!recordId) return null;
    var arr = getModelRecords();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id === recordId) return arr[i].attributes || null;
    }
    return null;
  }

  /**
   * Return ids of every visible wsTr whose td.field_2381 contains a
   * connection-value span pointing to parentId.
   *
   * We scan the DOM (not the Backbone model) because device-worksheet.js
   * renders field_2381 as a readOnly detail field — it MOVES the original
   * Knack-rendered td (with its `<span class="RECORD_ID" data-kn="connection-value">IDENTIFIER</span>`
   * children fully intact) from the hidden sourceTr into the card's detail
   * panel (see buildFieldRow: `row.appendChild(td)`). The data is guaranteed
   * to be in the DOM after the card builds, whereas the Backbone model
   * `attributes[field_2381_raw]` shape has historically been inconsistent.
   */
  function findRowsPointingTo(parentId) {
    var results = [];
    if (!parentId) return results;

    // MODEL_ONLY: scan the Backbone model instead of the DOM. The v2
    // source view has no v1 .scw-ws-row to walk, so DOM scraping
    // returns 0 hits and breaks the diff.
    if (MODEL_ONLY) {
      var arr = getModelRecords();
      for (var mi = 0; mi < arr.length; mi++) {
        var attrs = arr[mi] && (arr[mi].attributes || arr[mi]);
        if (!attrs || !attrs.id) continue;
        var raw = attrs[CONNECTIONS_FIELD + '_raw'];
        if (!Array.isArray(raw)) continue;
        for (var mj = 0; mj < raw.length; mj++) {
          if (raw[mj] && raw[mj].id === parentId) {
            if (results.indexOf(attrs.id) === -1) results.push(attrs.id);
            break;
          }
        }
      }
      return results;
    }

    var view = document.getElementById(VIEW_ID);
    if (!view) return results;

    // NOTE: Knack stores the connected record's 24-hex id as the class
    // attribute of the span. We CANNOT use a `.<id>` CSS class selector here
    // because CSS class tokens cannot start with a digit — ~60% of hex ids
    // start with a digit, and `querySelectorAll('span.6abc...')` is invalid.
    // Instead we select all connection-value spans in td.field_2381 and
    // compare their class attribute programmatically.
    var spans = view.querySelectorAll(
      'tr.scw-ws-row td.' + CONNECTIONS_FIELD + ' span[data-kn="connection-value"]'
    );
    for (var i = 0; i < spans.length; i++) {
      var cls = (spans[i].getAttribute('class') || '').trim();
      if (cls !== parentId) continue;
      var tr = spans[i].closest('tr.scw-ws-row');
      if (tr && tr.id && HEX24.test(tr.id)) {
        if (results.indexOf(tr.id) === -1) results.push(tr.id);
      }
    }
    return results;
  }

  /**
   * Look up the display identifier for parentId. We scrape any existing
   * card td.field_2381 span that points to parentId — the identifier text
   * is the span's textContent. Falls back to an empty string.
   */
  function sampleIdentifierForParent(parentId) {
    if (!parentId) return '';

    // 1. DOM scrape (v1 worksheets only) — an existing card cell already
    //    shows the exact identifier Knack rendered for this parent.
    if (!MODEL_ONLY) {
      var view = document.getElementById(VIEW_ID);
      if (view) {
        // Same CSS-class-starts-with-digit gotcha as findRowsPointingTo —
        // iterate all spans and compare class attribute manually.
        var spans = view.querySelectorAll(
          'tr.scw-ws-row td.' + CONNECTIONS_FIELD + ' span[data-kn="connection-value"]'
        );
        for (var si = 0; si < spans.length; si++) {
          var cls = (spans[si].getAttribute('class') || '').trim();
          if (cls === parentId) return (spans[si].textContent || '').trim();
        }
      }
    }

    // 2. Model-wide _raw sample (BOTH modes) — any record whose back-pointer
    //    already lists this parent carries the true connection identifier.
    //    Most faithful source: it's exactly what a server refetch would show.
    var arr = getModelRecords();
    for (var i = 0; i < arr.length; i++) {
      var attrs = arr[i] && (arr[i].attributes || arr[i]);
      var raw = attrs && attrs[CONNECTIONS_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && raw[j].id === parentId && raw[j].identifier) {
          return String(raw[j].identifier);
        }
      }
    }

    // 3. Last resort: the parent record's own display label (LABEL_FIELD,
    //    per-instance — SOW field_1950 / survey field_2365 / install
    //    field_2802). Covers a parent gaining its FIRST child, where no
    //    back-pointer exists yet to sample from. The old code hardcoded
    //    field_2365 here, which is survey-only — on the MODEL_ONLY SOW
    //    instances (view_3962/view_3586) it resolved '', so the optimistic
    //    child patch shipped an empty identifier and Connected To displayed
    //    the raw record id.
    for (var pi = 0; pi < arr.length; pi++) {
      var pa = arr[pi] && (arr[pi].attributes || arr[pi]);
      if (pa && pa.id === parentId) {
        var lbl = pa[LABEL_FIELD];
        var lblRaw = pa[LABEL_FIELD + '_raw'];
        if (lbl == null && lblRaw != null && typeof lblRaw !== 'object') lbl = lblRaw;
        return String(lbl == null ? '' : lbl).replace(/<[^>]*>/g, '').trim();
      }
    }
    return '';
  }

  /** Look up accessory ids whose ACCESSORIES_PARENT_FIELD back-
   *  connection points at parentId, by walking the accessory view's
   *  Backbone model. Source-of-truth lookup — independent of which
   *  fields the parent's view projects in its column set, and picks
   *  up accessories the parent's td.<ACCESSORIES_FIELD> cell may not
   *  list (e.g. when ACCESSORIES_FIELD isn't surfaced on this view). */
  function findAccessoryIdsFromAccessoryModel(parentId) {
    if (!ACCESSORIES_VIEW_ID || !ACCESSORIES_PARENT_FIELD || !parentId) return [];
    var out = [];
    try {
      var v = window.Knack && Knack.views && Knack.views[ACCESSORIES_VIEW_ID];
      var models = v && v.model && ((v.model.data && v.model.data.models) || v.model.models);
      if (!models) return out;
      for (var i = 0; i < models.length; i++) {
        var attrs = models[i] && (models[i].attributes || models[i]);
        if (!attrs || !attrs.id) continue;
        var raw = attrs[ACCESSORIES_PARENT_FIELD + '_raw'];
        var match = false;
        if (Array.isArray(raw)) {
          for (var j = 0; j < raw.length; j++) {
            if (raw[j] && raw[j].id === parentId) { match = true; break; }
          }
        } else if (raw && typeof raw === 'object' && raw.id === parentId) {
          match = true;
        }
        if (match && out.indexOf(attrs.id) === -1) out.push(attrs.id);
      }
    } catch (e) { /* best-effort */ }
    return out;
  }

  /** Resolve the accessory ids attached to a given parent. Prefer the
   *  accessory model's back-connection lookup (source of truth); fall
   *  back to scraping the parent's td.<ACCESSORIES_FIELD> when the
   *  back-connection field isn't configured or the accessory view's
   *  model isn't loaded. */
  function findAccessoryIdsForParent(parentId) {
    var ids = findAccessoryIdsFromAccessoryModel(parentId);
    if (ids.length) return ids;
    return findAccessoryIds(parentId);
  }

  /** Scrape the accessory record ids connected to a given child via
   *  ACCESSORIES_FIELD. The Knack-rendered td.<accField> lives on the
   *  pre-transform <tr> sitting immediately above the child's worksheet
   *  card row, with each accessory rendered as
   *    <span id="<accId>" data-kn="connection-value">label</span>.
   *  (Note the inner span uses `id`, not `class`, on this field — unlike
   *  CONNECTIONS_FIELD where the id lives on the class.) */
  function findAccessoryIds(childId) {
    if (!ACCESSORIES_FIELD || !childId) return [];
    var wsTr = document.getElementById(childId);
    if (!wsTr) return [];
    // Pre-transform tr is the immediate previous sibling.
    var preTr = wsTr.previousElementSibling;
    if (!preTr) return [];
    var td = preTr.querySelector('td.' + ACCESSORIES_FIELD);
    if (!td) return [];
    var spans = td.querySelectorAll('span[data-kn="connection-value"][id]');
    var out = [];
    for (var i = 0; i < spans.length; i++) {
      var id = (spans[i].getAttribute('id') || '').trim();
      if (id && HEX24.test(id) && out.indexOf(id) === -1) out.push(id);
    }
    return out;
  }

  // ======================================================================
  // L1 group header lookup.
  // ----------------------------------------------------------------------
  // R (the edited parent) is itself a view_3505 record and lives in exactly
  // the L1 group we want added children to land in. We walk backward from
  // R's wsTr to find the nearest preceding `.kn-table-group.kn-group-level-1`
  // row — that's the destination header. This is more reliable than trying
  // to read field_2375 off any card, because the moveIcon td has its
  // innerHTML rewritten (the original connection-value span is destroyed).
  // ======================================================================

  /** Walk backward from wsTr until we hit an L1 group header row. */
  function findL1HeaderBefore(wsTr) {
    if (!wsTr) return null;
    var cur = wsTr.previousElementSibling;
    while (cur) {
      if (cur.classList.contains('kn-table-group') &&
          cur.classList.contains('kn-group-level-1')) {
        return cur;
      }
      cur = cur.previousElementSibling;
    }
    return null;
  }

  /** Walk forward from a group header to the last row in its section. */
  function findLastRowInGroup(headerTr) {
    var cur = headerTr;
    var nxt = cur.nextElementSibling;
    while (nxt) {
      if (nxt.classList.contains('kn-table-group') &&
          nxt.classList.contains('kn-group-level-1')) break;
      cur = nxt;
      nxt = nxt.nextElementSibling;
    }
    return cur;
  }

  /** Move the full triple (sourceTr + wsTr + optional photoRow) to the tail of destHeader's group. */
  function moveRowTriple(wsTr, destHeader) {
    var sourceTr = getSourceTr(wsTr);
    if (!sourceTr) {
      console.warn(LOG_PREFIX, 'missing sourceTr for', wsTr.id, '— cannot move');
      return false;
    }
    var photoRow = getTrailingPhotoRow(wsTr);
    var anchor = findLastRowInGroup(destHeader);
    var parent = destHeader.parentNode;
    if (!parent) return false;

    if (anchor === (photoRow || wsTr)) return true; // already at tail of the right group

    var cursor = anchor;
    parent.insertBefore(sourceTr, cursor.nextSibling);  cursor = sourceTr;
    parent.insertBefore(wsTr,     cursor.nextSibling);  cursor = wsTr;
    if (photoRow) parent.insertBefore(photoRow, cursor.nextSibling);
    return true;
  }

  // ======================================================================
  // Backbone model sync. Pattern borrowed from device-worksheet.js syncKnackModel.
  // ======================================================================

  function syncModelChild(recordId, attrsPatch) {
    try {
      if (typeof Knack === 'undefined' || !Knack.views || !Knack.views[VIEW_ID]) return;
      var v = Knack.views[VIEW_ID];
      if (!v.model) return;
      var m = v.model;

      var entry = (typeof m.get === 'function') ? m.get(recordId) : null;
      if (!entry && m.data && typeof m.data.get === 'function') entry = m.data.get(recordId);
      if (!entry) {
        var arr = m.models || (m.data && m.data.models) || [];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].id === recordId) { entry = arr[i]; break; }
        }
      }
      if (!entry) return;

      var attrs = entry.attributes || entry;
      Object.keys(attrsPatch).forEach(function (k) { attrs[k] = attrsPatch[k]; });
    } catch (ex) { /* best-effort */ }
  }

  // ======================================================================
  // Background PUTs via SCW.knackAjax (auto-adds auth headers).
  // ownPuts tracks in-flight ids so we can ignore echo cell-update events.
  // ======================================================================

  var ownPuts = {};

  /** PUT GROUPING_FIELD on an accessory record so its MDF/IDF stays
   *  in sync with the parent camera/reader after a regroup. Uses
   *  ACCESSORIES_VIEW_ID rather than VIEW_ID because the accessory
   *  records don't appear on this view; failure logs but doesn't
   *  bubble — at worst the user sees the accessory in the wrong
   *  group section until the next page load. */
  function fireAccessoryPut(accessoryId, mdfId, onDone) {
    if (!ACCESSORIES_VIEW_ID || !mdfId || !accessoryId) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    if (!window.SCW || typeof window.SCW.knackRecordUrl !== 'function') {
      if (typeof onDone === 'function') onDone(new Error('knackRecordUrl unavailable'));
      return;
    }
    var body = {};
    body[GROUPING_FIELD] = [mdfId];
    log('  PUT(accessory) → ' + accessoryId + ' MDF=' + mdfId);
    cascadeBegin();
    knackPutKeepalive(
      window.SCW.knackRecordUrl(ACCESSORIES_VIEW_ID, accessoryId),
      body,
      function (err) {
        cascadeEnd();
        if (err) {
          console.warn(LOG_PREFIX, 'accessory PUT failed ' + accessoryId, err);
        } else {
          log('  PUT(accessory) ok ' + accessoryId);
        }
        if (typeof onDone === 'function') onDone(err);
      }
    );
  }

  function firePut(recordId, body, onDone) {
    if (!window.SCW || typeof window.SCW.knackRecordUrl !== 'function') {
      console.warn(LOG_PREFIX, 'SCW.knackRecordUrl unavailable — skipping PUT for ' + recordId);
      if (typeof onDone === 'function') onDone(new Error('knackRecordUrl unavailable'));
      return;
    }
    var url = window.SCW.knackRecordUrl(VIEW_ID, recordId);
    log('  PUT → ' + recordId + ' body=' + JSON.stringify(body));
    ownPuts[recordId] = true;
    cascadeBegin();
    knackPutKeepalive(url, body, function (err, resp) {
      delete ownPuts[recordId];
      cascadeEnd();
      if (err) {
        console.warn(LOG_PREFIX, 'PUT failed ' + recordId, err);
        if (typeof onDone === 'function') onDone(err);
      } else {
        log('  PUT ok ' + recordId);
        if (typeof onDone === 'function') onDone(null, resp);
      }
    });
  }

  // ======================================================================
  // Fallback: full model.fetch when destination group isn't in the DOM.
  // ======================================================================

  function fallbackFetch(reason) {
    log('fallback → model.fetch(): ' + reason);
    try {
      if (window.SCW && window.SCW.deviceWorksheet &&
          typeof window.SCW.deviceWorksheet.captureState === 'function') {
        window.SCW.deviceWorksheet.captureState();
      }
    } catch (e) { /* ignore */ }
    try {
      var v = Knack.views && Knack.views[VIEW_ID];
      if (v && v.model && typeof v.model.fetch === 'function') {
        v.model.fetch();
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'fallback fetch threw', e);
    }
  }

  // ======================================================================
  // Deterministic regroup — the main payoff.
  // ----------------------------------------------------------------------
  // Plan cache: after we compute a regroup plan, we keep it around for
  // REPLAY_GRACE_MS so that any subsequent view re-render (either the
  // Make webhook's child PUTs echoing back, or Knack re-fetching after
  // its native post-edit cycle) can re-apply the moves. This is the fix
  // for "items visually snap back to old group after a brief move" — the
  // DOM-level moves get wiped by Knack's re-render-from-fresh-fetch
  // (which sees stale server data because the Make webhook / our own
  // child PUTs haven't landed yet), so we replay them until the server
  // converges and Knack starts rendering the correct group naturally.
  // ======================================================================

  var REPLAY_GRACE_MS = 8000; // window during which we replay moves on re-render
  var pendingPlan = null;     // { R_id, rGroupRaw, rGroupId, rIdentifier, added, removed }
  var planClearTimer = null;
  var mutObserver = null;     // tbody watchdog
  var mutSuppressed = false;  // re-entrance guard during our own DOM mutations
  var mutDebounceTimer = null;

  function clearPendingPlanSoon() {
    if (planClearTimer) clearTimeout(planClearTimer);
    planClearTimer = setTimeout(function () {
      log('plan expired — clearing pendingPlan');
      pendingPlan = null;
      planClearTimer = null;
      stopMutGuard();
    }, REPLAY_GRACE_MS);
  }

  // ----------------------------------------------------------------------
  // Plan drift detector: returns true if any added child is NOT currently
  // beneath R's L1 header in the tbody. Used by both the mutation observer
  // and the view-render replay to decide whether a reapply is needed.
  // ----------------------------------------------------------------------
  function planHasDrifted(plan) {
    if (!plan) return false;
    var rWsTr = document.getElementById(plan.R_id);
    if (!rWsTr) return false;
    var destHeader = findL1HeaderBefore(rWsTr);
    if (!destHeader) return false;
    for (var i = 0; i < plan.added.length; i++) {
      var cid = plan.added[i];
      var cWsTr = document.getElementById(cid);
      if (!cWsTr) continue; // not visible — nothing to check
      if (findL1HeaderBefore(cWsTr) !== destHeader) return true;
    }
    return false;
  }

  // ----------------------------------------------------------------------
  // Mutation observer watchdog on the view's tbody. Catches any DOM
  // change — whether Knack fires knack-view-render or not — and re-applies
  // the cached plan whenever drift is detected. Auto-reattaches if the
  // tbody element itself is replaced by Knack's renderer.
  // ----------------------------------------------------------------------
  function startMutGuard() {
    stopMutGuard();
    var view = document.getElementById(VIEW_ID);
    if (!view) return;
    mutObserver = new MutationObserver(function () {
      if (mutSuppressed) return;
      if (!pendingPlan) { stopMutGuard(); return; }
      clearTimeout(mutDebounceTimer);
      mutDebounceTimer = setTimeout(function () {
        if (!pendingPlan || mutSuppressed) return;
        if (!planHasDrifted(pendingPlan)) return;
        log('mut-guard: drift detected — replaying plan');
        mutSuppressed = true;
        try { applyPlanToDom(pendingPlan, 'mut-guard'); }
        catch (e) { console.warn(LOG_PREFIX, 'mut-guard replay threw', e); }
        // Keep suppression active briefly so our own reapply doesn't
        // retrigger the observer in an infinite loop.
        setTimeout(function () { mutSuppressed = false; }, 80);
      }, 40);
    });
    // Observe the whole view subtree so we catch both tbody-internal row
    // rearrangements AND full tbody replacement (childList on table).
    mutObserver.observe(view, { childList: true, subtree: true });
    log('mut-guard: installed on ' + VIEW_ID);
  }

  function stopMutGuard() {
    if (mutDebounceTimer) { clearTimeout(mutDebounceTimer); mutDebounceTimer = null; }
    if (mutObserver) { mutObserver.disconnect(); mutObserver = null; log('mut-guard: stopped'); }
  }

  function applyPlanToDom(plan, reason) {
    if (!plan) return;
    mutSuppressed = true; // don't retrigger the watchdog from our own writes
    var patchFn = window.SCW && window.SCW.deviceWorksheet && window.SCW.deviceWorksheet.patchCard;
    var rWsTr = document.getElementById(plan.R_id);
    var destHeader = findL1HeaderBefore(rWsTr);
    log('applyPlanToDom (' + reason + '): R wsTr=' + (!!rWsTr) +
        ' destHeader=' + (!!destHeader) +
        ' added=' + plan.added.length + ' removed=' + plan.removed.length);

    // Added children → move into R's L1 group + patch
    if (destHeader) {
      for (var a = 0; a < plan.added.length; a++) {
        var cid = plan.added[a];
        var wsTr = document.getElementById(cid);
        if (!wsTr || !wsTr.classList.contains('scw-ws-row')) continue;

        moveRowTriple(wsTr, destHeader);

        syncModelChild(cid, (function (rGroupRaw, rId, rIdentifier) {
          var p = {};
          p[GROUPING_FIELD] = rGroupRaw;
          p[GROUPING_FIELD + '_raw'] = rGroupRaw;
          p[CONNECTIONS_FIELD] = [{ id: rId, identifier: rIdentifier }];
          p[CONNECTIONS_FIELD + '_raw'] = [{ id: rId, identifier: rIdentifier }];
          return p;
        })(plan.rGroupRaw, plan.R_id, plan.rIdentifier));

        if (typeof patchFn === 'function') {
          var resp = { id: cid };
          resp[GROUPING_FIELD] = (plan.rGroupRaw && plan.rGroupRaw[0] && plan.rGroupRaw[0].identifier) || '';
          resp[GROUPING_FIELD + '_raw'] = plan.rGroupRaw;
          resp[CONNECTIONS_FIELD] = plan.rIdentifier;
          resp[CONNECTIONS_FIELD + '_raw'] = [{ id: plan.R_id, identifier: plan.rIdentifier }];
          try { patchFn(VIEW_ID, cid, resp, { skipFocused: true }); }
          catch (e) { console.warn(LOG_PREFIX, 'patchCard threw for ' + cid, e); }
        }
      }
    }

    // Removed children → clear field_2381 on the card + model
    for (var r = 0; r < plan.removed.length; r++) {
      var rid = plan.removed[r];
      syncModelChild(rid, (function () {
        var p = {};
        p[CONNECTIONS_FIELD] = [];
        p[CONNECTIONS_FIELD + '_raw'] = [];
        return p;
      })());
      if (typeof patchFn === 'function') {
        var resp2 = { id: rid };
        resp2[CONNECTIONS_FIELD] = '';
        resp2[CONNECTIONS_FIELD + '_raw'] = [];
        try { patchFn(VIEW_ID, rid, resp2, { skipFocused: true }); }
        catch (e) { console.warn(LOG_PREFIX, 'patchCard threw for ' + rid, e); }
      }
    }

    // Release the mutation-observer suppression on the next tick so our
    // own writes have all been queued before we start listening again.
    setTimeout(function () { mutSuppressed = false; }, 0);
  }

  function applyDeterministicRegroup(R, onComplete, authoritativeChildIds) {
    function done() {
      if (typeof onComplete === 'function') {
        try { onComplete(); } catch (e) { /* swallow */ }
      }
    }
    if (!R || !R.id) {
      log('applyDeterministicRegroup: no R or R.id — abort', R);
      done();
      return;
    }
    log('applyDeterministicRegroup: start R=' + R.id);

    // --- 1. New children from the event record --------------------------
    // Read the trigger value from BOTH the event snapshot (R) AND the live
    // Backbone model, then use whichever is non-empty. The v2 picker patches
    // the model via syncKnackModel (which writes to `m.get(id)`) but dispatches
    // the cell-update with `m.data.get(id).attributes` — and these can be
    // DIFFERENT record instances in Knack's view model. When they diverge, the
    // dispatched R carries a STALE / empty field_1957_raw, so newChildIds came
    // back empty and EVERY current child was treated as "removed" — exactly the
    // "downstream connection just gets cleared, never re-pointed" bug. Falling
    // back to the model's canonical attrs makes the read instance-agnostic.
    function extractChildIds(rawArr) {
      var out = [];
      if (!Array.isArray(rawArr)) return out;
      for (var k = 0; k < rawArr.length; k++) {
        var e = rawArr[k];
        // Accept a bare id string or a {id} object (the v2 picker stores the
        // raw PUT body — sometimes bare strings — when the response has no
        // _raw companion).
        var eid = (typeof e === 'string') ? e : (e && e.id);
        if (eid && HEX24.test(eid) && out.indexOf(eid) === -1) out.push(eid);
      }
      return out;
    }
    var snapChildIds  = extractChildIds(R[TRIGGER_FIELD + '_raw'] || []);
    var modelAttrsR   = getModelAttrs(R.id);
    var modelChildIds = modelAttrsR
      ? extractChildIds(modelAttrsR[TRIGGER_FIELD + '_raw'] || []) : [];
    var newChildIds;
    if (Array.isArray(authoritativeChildIds)) {
      // AUTHORITATIVE: the v2 picker handed us the exact ids the user
      // chose (the PUT body). field_1957 / field_2197 are SEPARATE Knack
      // fields kept aligned only by THIS cascade — so when we know the
      // selection precisely we must use it verbatim and never second-guess
      // it against a model/snapshot a refetch could have made stale. This
      // is what stops legitimately-selected devices from being cleared.
      newChildIds = extractChildIds(authoritativeChildIds);
      log('  ' + TRIGGER_FIELD + ' authoritative children = ' + newChildIds.length);
    } else {
      // Native edit (no picker): prefer the snapshot when it has values;
      // otherwise trust the model. An empty snapshot must NOT clear
      // everything if the model still shows children.
      newChildIds = snapChildIds.length ? snapChildIds : modelChildIds;
      log('  ' + TRIGGER_FIELD + '_raw snapshot=' + snapChildIds.length +
          ' model=' + modelChildIds.length + ' → using ' + newChildIds.length);
    }
    var newChildSet = {};
    newChildIds.forEach(function (id) { newChildSet[id] = true; });

    // --- 2. Current children — DOM-scan every visible card's td.field_2381.
    var currentChildIds = findRowsPointingTo(R.id);
    log('  findRowsPointingTo(' + R.id + ') →', currentChildIds);
    var currentChildSet = {};
    currentChildIds.forEach(function (id) { currentChildSet[id] = true; });

    // --- 3. Diff ---------------------------------------------------------
    var added = newChildIds.filter(function (id) { return !currentChildSet[id]; });
    var removed = currentChildIds.filter(function (id) { return !newChildSet[id]; });
    // KEPT = still-selected children (in both new and current). These are
    // NEITHER added NOR removed, so the diff never PUTs them — but a removal
    // can knock their CONNECTIONS_FIELD out from under them (see fireKeptRepairs).
    var kept = newChildIds.filter(function (id) { return currentChildSet[id]; });

    log('  diff: new=' + newChildIds.length +
        ' cur=' + currentChildIds.length +
        ' added=' + JSON.stringify(added) +
        ' removed=' + JSON.stringify(removed) +
        ' kept=' + kept.length);

    if (!added.length && !removed.length) {
      // No add/remove diff. In MODEL_ONLY a "resubmit" of an unchanged
      // Connected Devices selection is the user's manual repair gesture —
      // they hit Save again specifically to fix field_1957/field_2197 drift.
      // Fall through so the reconcile pass runs: re-assert field_2197=[R] on
      // every still-selected (kept) child + the post-fetch converging verify.
      // Without this, a resubmit was a silent no-op (the original bug: an
      // out-of-sync reciprocal could never be repaired by re-saving).
      // Only bail outright when there's literally nothing selected to
      // reconcile (or we're in v1 DOM mode, where the picker's own Stage-2
      // repair already covers this).
      if (!(MODEL_ONLY && kept.length)) {
        log('  no changes — done');
        done();
        return;
      }
      log('  no add/remove diff — reconcile-only resubmit: re-asserting ' +
          CONNECTIONS_FIELD + ' on ' + kept.length + ' still-selected child(ren)');
    }

    // --- 4. Resolve destination group for added children ---------------
    var rGroupRaw = R[GROUPING_FIELD + '_raw'];
    if (!Array.isArray(rGroupRaw) || !rGroupRaw.length) {
      var rAttrs = getModelAttrs(R.id);
      if (rAttrs && Array.isArray(rAttrs[GROUPING_FIELD + '_raw'])) {
        rGroupRaw = rAttrs[GROUPING_FIELD + '_raw'];
      }
    }
    var rGroupId = (Array.isArray(rGroupRaw) && rGroupRaw[0] && rGroupRaw[0].id) ? rGroupRaw[0].id : null;
    var rIdentifier = sampleIdentifierForParent(R.id);
    log('  R group raw=', rGroupRaw, ' id=' + rGroupId + ' identifier="' + rIdentifier + '"');

    // --- 5. Build and cache plan so subsequent re-renders can replay it.
    var plan = {
      R_id: R.id,
      rGroupRaw: rGroupRaw,
      rGroupId: rGroupId,
      rIdentifier: rIdentifier,
      added: added,
      removed: removed
    };
    pendingPlan = plan;
    // MODEL_ONLY: no DOM to watch. Skip the mut-guard + DOM lookups
    // and route the rest of the flow through the PUT-only branch
    // below — v2 picks up changes via scw-cascade-idle → refetch.
    if (!MODEL_ONLY) startMutGuard();

    // --- 6. Check destination header ------------------------------------
    var rWsTr = MODEL_ONLY ? null : document.getElementById(R.id);
    var destHeader = MODEL_ONLY ? null : findL1HeaderBefore(rWsTr);
    log('  R wsTr found=' + (!!rWsTr) + ' destHeader found=' + (!!destHeader) +
        (MODEL_ONLY ? ' (MODEL_ONLY)' : ''));

    // --- 7. Start the PUT-completion tracker ----------------------------
    // When ALL of our child PUTs have landed on the server, we fire a
    // real model.fetch() so Knack re-renders the view from fresh,
    // now-consistent server state. This replaces the user having to hit
    // browser-refresh manually after the silent regroup.
    // --- 6b. Compute accessory cascade -----------------------------------
    // For each added child, look up every accessory connected to it via
    // ACCESSORIES_FIELD and stage a PUT to update its GROUPING_FIELD to
    // match the parent's MDF. Removed children keep their MDF, so their
    // accessories don't move either.
    var accessoryPuts = []; // [{ accId, mdfId }]
    if (ACCESSORIES_VIEW_ID && rGroupId && added.length) {
      var seenAccIds = {};
      for (var ax = 0; ax < added.length; ax++) {
        var accIds = findAccessoryIdsForParent(added[ax]);
        for (var ay = 0; ay < accIds.length; ay++) {
          if (seenAccIds[accIds[ay]]) continue;
          seenAccIds[accIds[ay]] = true;
          accessoryPuts.push({ accId: accIds[ay], mdfId: rGroupId });
        }
      }
      if (accessoryPuts.length) {
        log('  accessory cascade: ' + accessoryPuts.length +
            ' PUT(s) queued for ' + added.length + ' added child(ren)');
      }
    }

    var totalPuts = added.length + removed.length + accessoryPuts.length;
    var putsRemaining = totalPuts;

    // Batch guard: hold one extra cascade-in-flight token for the whole
    // operation so the counter can't bottom out (and fire scw-cascade-idle /
    // hide the toast) BETWEEN phase 1 and the kept-children repair pass. Without
    // it, the last phase-1 PUT's cascadeEnd would emit scw-cascade-idle early,
    // data.js would refetch the still-cleared state, and the cards would flash
    // "disconnected" before the repair lands. Released in finishWithFetch.
    var batchGuardHeld = false;
    if (totalPuts > 0) { batchGuardHeld = true; cascadeBegin(); }

    function onPutFinished() {
      putsRemaining--;
      if (putsRemaining > 0) return;
      // Phase 1 (add/remove/accessory) done. Before the final fetch, fire a
      // repair pass over the KEPT children, then resync from the server.
      fireKeptRepairs(finishWithFetch);
    }

    // ── Repair pass — re-assert CONNECTIONS_FIELD on still-connected children.
    // ----------------------------------------------------------------------
    // The add/remove diff NEVER touches a kept child (it's in both the new and
    // current sets). That's normally fine — but CONNECTIONS_FIELD (field_2197)
    // and TRIGGER_FIELD (field_1957) are SEPARATE Knack fields, and clearing the
    // removed child's CONNECTIONS_FIELD ([] PUT) trips a server-side reciprocal
    // recompute (Knack connection rule / Make webhook) that can knock the kept
    // siblings' CONNECTIONS_FIELD out too — so a "remove one" reads back as
    // "ALL former members disconnected". An ADD fires no [] clear, so it never
    // triggers this and never needs repair — which is why adding always worked.
    //
    // This mirrors the v1 connection-picker's Stage-2 repair PUTs
    // (fireRepairPuts), which is exactly why the v1 edit path never exhibited
    // the bug. We fire it ONLY after a removal (kept children are only at risk
    // then) and ONLY after Phase 1 settles, so the re-assert lands AFTER the
    // removal-triggered recompute and wins. Scoped to MODEL_ONLY so the v1
    // DOM-mode views (already covered by the picker's own Stage 2) don't
    // double-write.
    function fireKeptRepairs(onAllDone) {
      // Re-assert CONNECTIONS_FIELD = [R] on every KEPT child — one the diff
      // judged already-connected, so it fired NO add PUT. This now runs on
      // EVERY edit with kept children, not just after a removal.
      //
      // The old `removed.length` guard assumed kept children are only at risk
      // when a sibling's []-clear trips a server-side recompute. But they're
      // ALSO at risk whenever the model MISJUDGED them as connected: a prior
      // partial cascade can leave field_1957 (parent) and field_2197 (child)
      // diverged, so the child reads as "currently pointing at R" in the model
      // while the server actually has it blank. The diff then files it under
      // `kept`, no add PUT fires, and it silently stays disconnected — exactly
      // the "only SOME downstream connect" bug. field_2197=[R] is idempotent
      // when already correct, so re-asserting unconditionally is safe and
      // closes that gap. MODEL_ONLY-scoped (v1 DOM views are covered by the
      // picker's own Stage-2 repair).
      if (!(MODEL_ONLY && kept.length)) { onAllDone(); return; }
      log('  repair: re-asserting ' + CONNECTIONS_FIELD + ' on ' + kept.length +
          ' kept child(ren)' + (removed.length ? ' after removal of ' + removed.length : ''));
      var remaining = kept.length;
      function tick() { remaining--; if (remaining <= 0) onAllDone(); }
      for (var i = 0; i < kept.length; i++) {
        var body = {};
        if (rGroupId) body[GROUPING_FIELD] = [rGroupId];
        body[CONNECTIONS_FIELD] = [R.id];
        firePut(kept[i], body, tick);
      }
    }

    function settleDone() {
      // Release the batch guard LAST — this cascadeEnd takes the in-flight
      // counter to 0, firing scw-cascade-idle (→ data.js refetch) once, now
      // that every PUT (incl. the verify pass) has landed.
      if (batchGuardHeld) { batchGuardHeld = false; cascadeEnd(); }
      // Signal upstream waiters (e.g. the connection picker keeping its modal
      // open until everything settled).
      done();
    }

    // ── Post-fetch verify pass (safety net) ──────────────────────────────
    // After the refetch, confirm every authoritatively-selected child REALLY
    // points back at R via CONNECTIONS_FIELD. Re-assert any that don't —
    // catches a child PUT that failed/raced or that a server-side reciprocal
    // recompute cleared after the fact (the "only 1/2 downstream connected,
    // and which one flips" report). Reads the freshly-fetched model so it
    // reflects real server state; runs at most once (its own re-PUTs don't
    // re-enter). MODEL_ONLY-scoped: the DOM views' child models are
    // unreliable (findRowsPointingTo scrapes the DOM there for that reason).
    // CONVERGING verify-and-repair. After each model.fetch we re-read the
    // freshly-fetched (server-truth) model and re-assert CONNECTIONS_FIELD=[R]
    // on any authoritatively-selected child that STILL doesn't point back,
    // then refetch and re-check — up to MAX_VERIFY_PASSES times.
    //
    // A single-shot verify (the prior behaviour) leaves two ways for a child
    // to stay disconnected: (a) its re-assert PUT lost a rate-limit race and
    // there was no second attempt, or (b) a late server-side recompute landed
    // just AFTER the one re-check and re-blanked it. Looping with a growing
    // settle delay catches both: each pass re-PUTs whatever the latest fetch
    // still shows blank, so the writes converge on "every selected child points
    // back". In MODEL_ONLY the read reflects server state (we never optimistically
    // patch children's field_2197), so a blank read is real — and even if a PUT
    // lands but the read lags, the next pass simply re-PUTs (idempotent). If we
    // exhaust the passes we log loudly with the exact ids so a live repro is
    // conclusive rather than silent.
    var MAX_VERIFY_PASSES = 4;
    function verifyForwardChildren(onDone) {
      if (!MODEL_ONLY || !newChildIds || !newChildIds.length) { onDone(); return; }

      function collectMissing() {
        var miss = [];
        for (var i = 0; i < newChildIds.length; i++) {
          var cid = newChildIds[i];
          var attrs = getModelAttrs(cid);
          var raw = attrs && attrs[CONNECTIONS_FIELD + '_raw'];
          var ok = false;
          if (Array.isArray(raw)) {
            for (var j = 0; j < raw.length; j++) {
              if (raw[j] && raw[j].id === R.id) { ok = true; break; }
            }
          }
          if (!ok) miss.push(cid);
        }
        return miss;
      }

      function refetchThen(cb) {
        try {
          var v2 = Knack.views && Knack.views[VIEW_ID];
          if (v2 && v2.model && typeof v2.model.fetch === 'function') {
            var p2 = v2.model.fetch();
            if (p2 && typeof p2.always === 'function') { p2.always(cb); return; }
            if (p2 && typeof p2.then === 'function') { p2.then(cb, cb); return; }
          }
        } catch (e) { /* ignore */ }
        setTimeout(cb, 400);
      }

      function pass(n) {
        var missing = collectMissing();
        if (!missing.length) { onDone(); return; }
        if (n >= MAX_VERIFY_PASSES) {
          // Exhausted — surface exactly which children never took the write so
          // a live repro pinpoints the residual instead of failing silently.
          console.warn(LOG_PREFIX, 'verify GAVE UP after ' + n + ' pass(es) — ' +
            missing.length + ' selected child(ren) still NOT pointing at parent ' +
            R.id + ':', missing.slice());
          onDone();
          return;
        }
        log('  verify pass ' + (n + 1) + '/' + MAX_VERIFY_PASSES + ': ' +
            missing.length + ' child(ren) not pointing back — re-asserting', missing);
        var remaining = missing.length;
        function tick() {
          remaining--;
          if (remaining > 0) return;
          // Let any late server-side recompute settle (growing delay), then
          // refetch + re-check on the next pass.
          setTimeout(function () {
            refetchThen(function () { pass(n + 1); });
          }, 250 + n * 250);
        }
        for (var k = 0; k < missing.length; k++) {
          var body = {};
          if (rGroupId) body[GROUPING_FIELD] = [rGroupId];
          body[CONNECTIONS_FIELD] = [R.id];
          firePut(missing[k], body, tick);
        }
      }
      pass(0);
    }

    function finishWithFetch() {
      log('all PUTs settled — firing real refresh (model.fetch)');
      // Clear plan + watchdog FIRST so the incoming render isn't fought
      // by our replay machinery.
      pendingPlan = null;
      stopMutGuard();
      if (planClearTimer) { clearTimeout(planClearTimer); planClearTimer = null; }
      try {
        if (window.SCW && window.SCW.deviceWorksheet &&
            typeof window.SCW.deviceWorksheet.captureState === 'function') {
          window.SCW.deviceWorksheet.captureState();
        }
      } catch (e) { /* best-effort */ }

      var v = Knack.views && Knack.views[VIEW_ID];
      if (!v || !v.model || typeof v.model.fetch !== 'function') { settleDone(); return; }

      var p;
      try { p = v.model.fetch(); }
      catch (e) { console.warn(LOG_PREFIX, 'final model.fetch threw', e); settleDone(); return; }

      // After the fetch lands, run the verify-and-repair pass, THEN settle.
      function afterFetch() { verifyForwardChildren(settleDone); }
      if (p && typeof p.always === 'function') p.always(afterFetch);
      else if (p && typeof p.then === 'function') p.then(afterFetch, afterFetch);
      else setTimeout(afterFetch, 600);
    }

    // MODEL_ONLY OR no destHeader: skip DOM moves, just fire PUTs and
    // let onPutFinished handle the post-settle model.fetch. For
    // MODEL_ONLY this is the only path; for DOM-mode it's a fallback.
    if (MODEL_ONLY || (added.length && !destHeader)) {
      log('  ' + (MODEL_ONLY ? 'MODEL_ONLY' : 'no destHeader for R') +
          ' — PUT-only + fallbackFetch');
      added.forEach(function (cid) { firePut(cid, buildAddedPut(rGroupId, R.id), onPutFinished); });
      removed.forEach(function (rid) { firePut(rid, buildRemovedPut(), onPutFinished); });
      accessoryPuts.forEach(function (ap) { fireAccessoryPut(ap.accId, ap.mdfId, onPutFinished); });
      // If no add/remove/accessory PUTs were queued, the tracker never
      // ticks and onPutFinished never fires. Two sub-cases:
      //   (a) Reconcile-only resubmit (MODEL_ONLY, kept children, no diff):
      //       the user re-saved to repair drift. Re-assert field_2197 on
      //       every still-selected child, then refetch + converging verify.
      //       Hold a batch guard so scw-cascade-idle fires exactly once at
      //       the end (after the repair AND verify land), not mid-repair.
      //   (b) Genuinely nothing to do: call done() so the picker stage
      //       gate doesn't hang.
      if (totalPuts === 0) {
        if (MODEL_ONLY && kept.length) {
          batchGuardHeld = true; cascadeBegin();
          fireKeptRepairs(finishWithFetch);
          return;
        }
        pendingPlan = null;
        if (planClearTimer) { clearTimeout(planClearTimer); planClearTimer = null; }
        done();
      } else {
        clearPendingPlanSoon();
      }
      return;
    }

    // --- 8. Apply plan to DOM (initial pass) ----------------------------
    applyPlanToDom(plan, 'initial');

    // --- 9. Fire background PUTs with completion tracking --------------
    if (totalPuts === 0) {
      log('  no PUTs to fire — skipping final fetch');
      done();
    } else {
      for (var a = 0; a < added.length; a++) {
        firePut(added[a], buildAddedPut(rGroupId, R.id), onPutFinished);
      }
      for (var r = 0; r < removed.length; r++) {
        firePut(removed[r], buildRemovedPut(), onPutFinished);
      }
      for (var ap = 0; ap < accessoryPuts.length; ap++) {
        fireAccessoryPut(accessoryPuts[ap].accId, accessoryPuts[ap].mdfId, onPutFinished);
      }
    }

    // --- 10. Schedule plan expiry as a safety net (in case a PUT hangs).
    clearPendingPlanSoon();

    log('  regroup done: ' + added.length + ' added, ' + removed.length + ' removed' +
        ' (plan cached for up to ' + REPLAY_GRACE_MS + 'ms, final fetch on PUT completion)');
  }

  function buildAddedPut(rGroupId, rId) {
    var body = {};
    if (rGroupId) body[GROUPING_FIELD] = [rGroupId];
    body[CONNECTIONS_FIELD] = [rId];
    return body;
  }

  function buildRemovedPut() {
    var body = {};
    body[CONNECTIONS_FIELD] = [];
    return body;
  }

  // ======================================================================
  // Event coordinator
  // ----------------------------------------------------------------------
  // Knack natively re-renders view_3505 within ~50ms of knack-cell-update
  // (device-worksheet.js:5721 patches the card off the same event). Any
  // DOM changes we make synchronously get wiped by that re-render, so we
  // defer the regroup until a debounced settle window passes.
  // ======================================================================

  var pendingRecord = null;
  var pendingChildIds = null;   // authoritative ids from the v2 picker (5th arg)
  var pendingChildIdsFor = null; // record id the authoritative ids belong to
  var settleTimer = null;

  function armSettle() {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(onSettled, SETTLE_MS);
  }

  function onSettled() {
    settleTimer = null;
    var R = pendingRecord;
    var authoritativeIds = pendingChildIds;
    pendingRecord = null;
    pendingChildIds = null;
    pendingChildIdsFor = null;
    if (!R) return;
    log('settled — applying deterministic regroup for R=' + R.id +
        (authoritativeIds ? ' (authoritative children supplied)' : ''));
    try { applyDeterministicRegroup(R, null, authoritativeIds); }
    catch (e) { console.warn(LOG_PREFIX, 'applyDeterministicRegroup threw', e); }
  }

  $(document).on('knack-cell-update.' + VIEW_ID + EVENT_NS, function (event, view, record, editedFieldKey, triggerIds) {
    try {
      if (!record || !record.id) return;
      // Re-entrancy: ignore echoes from our own background PUTs.
      if (ownPuts[record.id]) {
        log('ignoring cell-update echo for own PUT ' + record.id);
        return;
      }
      // The forward cascade (parent TRIGGER_FIELD → children CONNECTIONS_FIELD)
      // must ONLY run when the trigger field itself was edited. The v2 picker
      // reports the edited field key as a 4th arg; if it's some OTHER field
      // (e.g. a direct field_2197 edit, an MDF move, or a chip toggle), running
      // the forward regroup off this record reads its (empty) field_1957 and
      // would treat every current child as "removed" — silently clearing their
      // reciprocal. Native Knack inline edits supply no key → fall through and
      // let the cache-diff machinery below decide (v1 DOM-mode behavior).
      if (editedFieldKey && editedFieldKey !== TRIGGER_FIELD) {
        log('cell-update for ' + editedFieldKey + ' (not ' + TRIGGER_FIELD +
            ') — skipping forward cascade');
        return;
      }
      log('knack-cell-update received', { recordId: record.id });
      // If a later edit arrives before we've settled, the newest record wins —
      // Knack always provides the full record snapshot, so we don't lose data.
      pendingRecord = record;
      // 5th arg (v2 picker only): the exact ids the user chose for the
      // trigger field. Authoritative — bypasses the snapshot/model read so
      // a refetch race can't make the cascade clear still-selected children.
      //
      // STICKINESS: only OVERWRITE the authoritative ids when this event
      // actually supplies them for this record. On scenes where OTHER modules
      // also listen to knack-cell-update.<view> (e.g. sales-change-request on
      // view_3586), a second, non-authoritative cell-update for the same
      // record can land inside the settle window — if we let it null out the
      // ids, the cascade falls back to a possibly-stale model read and
      // over-removes (clearing EVERY former child instead of the de-selected
      // one). Keep the picker's ids unless a newer authoritative set arrives,
      // or the edited record changes.
      if (editedFieldKey === TRIGGER_FIELD && Array.isArray(triggerIds)) {
        pendingChildIds   = triggerIds;
        pendingChildIdsFor = record.id;
      } else if (pendingChildIdsFor !== record.id) {
        // A different record (or a native edit with no prior authoritative
        // ids) — drop any stale authoritative set so it can't be misapplied.
        pendingChildIds   = null;
        pendingChildIdsFor = null;
      }
      armSettle();
    } catch (e) {
      console.warn(LOG_PREFIX, 'knack-cell-update handler threw', e);
    }
  });

  // ======================================================================
  // Inverse cascade: child's CONNECTIONS_FIELD (field_2197) changes
  // ----------------------------------------------------------------------
  // The handler above watches the parent's TRIGGER_FIELD (field_1957) and
  // cascades down. But the user can ALSO change a child's CONNECTIONS_FIELD
  // directly — native inline edit, form save, anywhere Knack fires a
  // knack-cell-update on the child row. In that case the child has a new
  // parent, and the child's mounting-hardware accessories need their
  // GROUPING_FIELD (field_1946) updated to match the new parent's group.
  //
  // We compare the post-edit record's CONNECTIONS_FIELD to a per-record
  // cache primed from the model on each view-render. When a difference is
  // detected on a record that has accessories, fire accessory PUTs.
  // ownPuts still suppresses echoes from our own outbound child PUTs so
  // this doesn't double-cascade with the field_1957 flow.
  // ======================================================================

  var lastReciprocalSeen = {};

  function serializeReciprocal(attrs) {
    var raw = attrs && attrs[CONNECTIONS_FIELD + '_raw'];
    if (!Array.isArray(raw)) return '';
    return raw
      .map(function (r) { return r && r.id; })
      .filter(Boolean)
      .sort()
      .join(',');
  }

  function primeReciprocalCache() {
    var records = getModelRecords();
    for (var i = 0; i < records.length; i++) {
      var attrs = records[i] && (records[i].attributes || records[i]);
      if (attrs && attrs.id) {
        lastReciprocalSeen[attrs.id] = serializeReciprocal(attrs);
      }
    }
  }

  $(document).on('knack-view-render.' + VIEW_ID + EVENT_NS + '-prime',
    function () { primeReciprocalCache(); });

  // Per-record cache of the LAST seen GROUPING_FIELD id so the
  // mdf-direct-edit handler can detect a true change vs. an echo.
  var lastMdfSeen = {};
  function serializeMdf(attrs) {
    var raw = attrs && attrs[GROUPING_FIELD + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
    return '';
  }
  function primeMdfCache() {
    var records = getModelRecords();
    for (var i = 0; i < records.length; i++) {
      var attrs = records[i] && (records[i].attributes || records[i]);
      if (attrs && attrs.id) lastMdfSeen[attrs.id] = serializeMdf(attrs);
    }
  }
  $(document).on('knack-view-render.' + VIEW_ID + EVENT_NS + '-mdfprime',
    function () { primeMdfCache(); });

  /**
   * After a device's MDF/IDF (GROUPING_FIELD) is moved via the v2
   * picker, drop any cross-MDF peer connection it can no longer
   * physically have. A camera/reader points at its NVR/headend via
   * CONNECTIONS_FIELD (field_2197); the NVR lists its devices in
   * TRIGGER_FIELD (field_1957). An NVR only serves devices in its own
   * MDF/IDF, so once the device lands in a DIFFERENT location than its
   * peer, the link is stale — clear BOTH sides of the mirror.
   *
   * The peer's group is read from the freshly-synced Backbone model
   * (the v2 picker patches the model BEFORE dispatching the
   * knack-cell-update that drives this handler), so the "what MDF/IDF
   * does this belong in" comparison reflects the settled post-move
   * state, not a mid-edit snapshot — this is the timing fix.
   *
   * Guard rails:
   *   - Only acts when the peer's MDF is KNOWN and DIFFERENT. An
   *     unknown peer MDF (peer not loaded in the model) leaves the
   *     connection untouched rather than guessing.
   *   - The moving-NVR case is a no-op here: an NVR has no
   *     CONNECTIONS_FIELD value (it's the parent side), so peerId is
   *     empty. Children that should follow a moved NVR are handled by
   *     the forward field_1957 cascade, not this disconnect.
   */
  function maybeClearCrossMdfConnection(record, currMdf) {
    var connRaw = record[CONNECTIONS_FIELD + '_raw'];
    var peerId  = (Array.isArray(connRaw) && connRaw[0] && connRaw[0].id)
      ? connRaw[0].id : '';
    if (!peerId) return;

    var peerAttrs = getModelAttrs(peerId);
    var peerMdf   = peerAttrs ? serializeMdf(peerAttrs) : '';
    // Only disconnect when the peer is positively in a DIFFERENT, known MDF.
    if (!peerMdf || peerMdf === currMdf) return;

    log('mdf-direct-edit: ' + record.id + ' left peer ' + peerId +
        ' (peer MDF ' + peerMdf + ' != new ' + currMdf + ') — clearing connection');

    // Child side: clear CONNECTIONS_FIELD on the moved record. Patch the
    // local model + reciprocal cache so the -recip handler reads this as
    // a no-op (empty) rather than a fresh re-parent.
    var childBody = {};
    childBody[CONNECTIONS_FIELD] = [];
    lastReciprocalSeen[record.id] = '';
    syncModelChild(record.id, (function () {
      var p = {};
      p[CONNECTIONS_FIELD] = '';
      p[CONNECTIONS_FIELD + '_raw'] = [];
      return p;
    })());
    firePut(record.id, childBody);

    // Parent side: drop the moved record from the peer's TRIGGER_FIELD
    // list (these are mirrored fields, not reciprocal halves of one
    // Knack connection, so both must be written).
    var peerRaw = peerAttrs[TRIGGER_FIELD + '_raw'];
    if (!Array.isArray(peerRaw) || !peerRaw.length) return;
    var remainingRaw = [];
    var remainingIds = [];
    for (var i = 0; i < peerRaw.length; i++) {
      if (peerRaw[i] && peerRaw[i].id && peerRaw[i].id !== record.id) {
        remainingRaw.push(peerRaw[i]);
        remainingIds.push(peerRaw[i].id);
      }
    }
    if (remainingIds.length === peerRaw.length) return; // record wasn't listed
    var peerBody = {};
    peerBody[TRIGGER_FIELD] = remainingIds;
    syncModelChild(peerId, (function () {
      var p = {};
      p[TRIGGER_FIELD + '_raw'] = remainingRaw;
      return p;
    })());
    firePut(peerId, peerBody);
  }

  // MODEL_ONLY: when a child's GROUPING_FIELD (field_1946) is edited
  // directly via the v2 MDF picker, (1) drop any peer connection the
  // device can no longer physically have now that it's left its peer's
  // MDF/IDF, and (2) cascade the new group id down to its
  // mounting-hardware accessories so they regroup alongside the parent.
  // In v1 DOM mode this fires through the forward cascade path (when
  // field_1957 changes); the direct field_1946 edit is a v2-only entry
  // point so we scope the handler to MODEL_ONLY.
  $(document).on('knack-cell-update.' + VIEW_ID + EVENT_NS + '-mdf',
    function (event, view, record, editedFieldKey) {
      try {
        if (!MODEL_ONLY) return;
        if (!record || !record.id) return;
        if (ownPuts[record.id]) return;
        // When the v2 picker tells us which field was edited, only run
        // the MDF-move logic for an actual GROUPING_FIELD edit. (Native
        // inline edits supply no key → fall back to the cache diff.)
        if (editedFieldKey && editedFieldKey !== GROUPING_FIELD) return;

        var prevMdf = lastMdfSeen[record.id] || '';
        var currMdf = serializeMdf(record);
        if (prevMdf === currMdf) return;
        lastMdfSeen[record.id] = currMdf;
        if (!currMdf) return; // MDF cleared entirely — leave links alone

        // Always allow the move; clear a now-cross-MDF peer connection.
        maybeClearCrossMdfConnection(record, currMdf);

        // Cascade the new group down to mounting-hardware accessories.
        if (!ACCESSORIES_VIEW_ID) return;
        var accIds = findAccessoryIdsForParent(record.id);
        if (!accIds.length) return;

        log('mdf-direct-edit cascade: ' + GROUPING_FIELD + ' on ' +
            record.id + ' → ' + accIds.length + ' accessory PUT(s) to ' + currMdf);
        for (var k = 0; k < accIds.length; k++) {
          fireAccessoryPut(accIds[k], currMdf);
        }
      } catch (e) {
        console.warn(LOG_PREFIX, 'mdf-direct-edit handler threw', e);
      }
    });

  $(document).on('knack-cell-update.' + VIEW_ID + EVENT_NS + '-recip',
    function (event, view, record, editedFieldKey) {
      try {
        if (!ACCESSORIES_VIEW_ID) return;
        if (!record || !record.id) return;
        if (ownPuts[record.id]) return;
        // The inverse cascade ("connection changed → pull child to the
        // new parent's MDF") must NOT fire when the user only moved the
        // MDF/IDF. The v2 picker reports the edited field; if it's not
        // the connection field, bail — otherwise the MDF move snaps the
        // device straight back to its parent's group. Re-prime the cache
        // so a later real connection edit still diffs correctly. (Native
        // inline edits supply no key → keep the cache-diff behavior.)
        if (editedFieldKey && editedFieldKey !== CONNECTIONS_FIELD) {
          lastReciprocalSeen[record.id] = serializeReciprocal(record);
          return;
        }

        var prev = lastReciprocalSeen[record.id] || '';
        var curr = serializeReciprocal(record);
        if (prev === curr) return;
        lastReciprocalSeen[record.id] = curr;

        // No new parent → nothing to cascade. (Disconnect doesn't
        // implicitly relocate the child's accessories; they keep the
        // last-known group until a new parent assignment.)
        var raw = record[CONNECTIONS_FIELD + '_raw'];
        if (!Array.isArray(raw) || !raw.length || !raw[0] || !raw[0].id) return;

        var newParentId = raw[0].id;
        var parentAttrs = getModelAttrs(newParentId);
        if (!parentAttrs) {
          log('inverse cascade: new parent ' + newParentId + ' not in model — skipping');
          return;
        }
        var parentGroupRaw = parentAttrs[GROUPING_FIELD + '_raw'];
        if (!Array.isArray(parentGroupRaw) || !parentGroupRaw[0] || !parentGroupRaw[0].id) {
          log('inverse cascade: parent ' + newParentId + ' has no MDF — skipping');
          return;
        }
        var parentGroupId = parentGroupRaw[0].id;

        // MODEL_ONLY: also move the CHILD itself to the new parent's
        // MDF. In v1 (DOM mode) this case is handled by the v1
        // connection-picker reframing the edit as a parent-side
        // field_1957 update + driving applyDeterministicRegroup on
        // the parent — that cascade PUTs child's GROUPING_FIELD as
        // part of the added-child handling. v2's picker PUTs
        // field_2197 directly on the child instead, so without this
        // the child stays in its old MDF after a connection change.
        if (MODEL_ONLY) {
          var parentGroupIdent =
            (parentGroupRaw[0] && parentGroupRaw[0].identifier) || '';
          var childBody = {};
          childBody[GROUPING_FIELD] = [parentGroupId];
          // Patch the local model immediately so the v2 tree rebuild
          // on scw-cascade-idle puts the card under the new L1
          // without waiting for the PUT to land.
          syncModelChild(record.id, (function () {
            var p = {};
            p[GROUPING_FIELD] = parentGroupIdent;
            p[GROUPING_FIELD + '_raw'] = [{
              id: parentGroupId, identifier: parentGroupIdent
            }];
            return p;
          })());
          log('inverse cascade (MODEL_ONLY): also moving child ' +
              record.id + ' to MDF ' + parentGroupId);
          firePut(record.id, childBody);
        }

        var accIds = findAccessoryIdsForParent(record.id);
        if (!accIds.length) return;

        log('inverse cascade: ' + CONNECTIONS_FIELD + ' on ' + record.id +
            ' → cascade ' + accIds.length + ' accessory MDF PUT(s) to ' + parentGroupId);
        for (var i = 0; i < accIds.length; i++) {
          fireAccessoryPut(accIds[i], parentGroupId);
        }
      } catch (e) {
        console.warn(LOG_PREFIX, 'inverse cascade handler threw', e);
      }
    });

  // ======================================================================
  // SOW cascade: parent's SOW (SOW_FIELD, e.g. field_2154) edited → keep
  // its children on the parent's SOW.
  // ----------------------------------------------------------------------
  //   • Accessories (ACCESSORIES_PARENT_FIELD children): ALWAYS set to the
  //     parent's exact SOW set — an accessory's SOW must mirror its parent.
  //   • Connected devices (CONNECTIONS_FIELD children): only touched when
  //     the child is on a SOW the parent does NOT also include; then the
  //     child is re-aligned to the parent's exact SOW set. A child whose
  //     SOWs are a subset of the parent's is left alone (no spurious PUT).
  // Fires only on a genuine SOW_FIELD edit (the v2 picker reports the edited
  // field key; native inline edits supply none → fall back to a cache diff).
  // ======================================================================
  var lastSowSeen = {};
  function serializeSow(attrs) {
    var raw = attrs && attrs[SOW_FIELD + '_raw'];
    if (!Array.isArray(raw)) return '';
    return raw.map(function (r) { return r && r.id; }).filter(Boolean).sort().join(',');
  }
  function sowIdsFromAttrs(attrs) {
    var raw = attrs && attrs[SOW_FIELD + '_raw'];
    var out = [];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) out.push(raw[i].id);
    } else if (raw && raw.id) {
      out.push(raw.id);
    }
    return out;
  }
  function primeSowCache() {
    if (!SOW_FIELD) return;
    var records = getModelRecords();
    for (var i = 0; i < records.length; i++) {
      var attrs = records[i] && (records[i].attributes || records[i]);
      if (attrs && attrs.id) lastSowSeen[attrs.id] = serializeSow(attrs);
    }
  }
  if (SOW_FIELD) {
    $(document).on('knack-view-render.' + VIEW_ID + EVENT_NS + '-sowprime',
      function () { primeSowCache(); });
  }

  /** PUT SOW_FIELD = sowIds on an accessory record (lives on
   *  ACCESSORIES_VIEW_ID, not VIEW_ID). Best-effort, mirrors
   *  fireAccessoryPut. */
  function fireAccessorySowPut(accessoryId, sowIds, onDone) {
    if (!ACCESSORIES_VIEW_ID || !accessoryId) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    if (!window.SCW || typeof window.SCW.knackRecordUrl !== 'function') {
      if (typeof onDone === 'function') onDone(new Error('knackRecordUrl unavailable'));
      return;
    }
    var body = {};
    body[SOW_FIELD] = sowIds || [];
    log('  PUT(accessory SOW) → ' + accessoryId + ' SOW=' + JSON.stringify(sowIds));
    cascadeBegin();
    knackPutKeepalive(
      window.SCW.knackRecordUrl(ACCESSORIES_VIEW_ID, accessoryId),
      body,
      function (err) {
        cascadeEnd();
        if (err) console.warn(LOG_PREFIX, 'accessory SOW PUT failed ' + accessoryId, err);
        else log('  PUT(accessory SOW) ok ' + accessoryId);
        if (typeof onDone === 'function') onDone(err);
      }
    );
  }

  $(document).on('knack-cell-update.' + VIEW_ID + EVENT_NS + '-sow',
    function (event, view, record, editedFieldKey) {
      try {
        if (!SOW_FIELD) return;
        if (!record || !record.id) return;
        if (ownPuts[record.id]) return;
        // Only react to a genuine SOW_FIELD edit. Re-prime the cache on
        // other-field edits so a later real SOW edit still diffs correctly.
        if (editedFieldKey && editedFieldKey !== SOW_FIELD) {
          lastSowSeen[record.id] = serializeSow(record);
          return;
        }
        var prev = lastSowSeen[record.id] || '';
        var curr = serializeSow(record);
        if (prev === curr) return;
        lastSowSeen[record.id] = curr;

        var parentSowIds = sowIdsFromAttrs(record);
        // Parent SOW cleared entirely → leave children alone (don't orphan
        // everything on an accidental clear), mirroring the MDF-clear guard.
        if (!parentSowIds.length) {
          log('sow-cascade: parent ' + record.id + ' SOW cleared — leaving children alone');
          return;
        }
        var parentSowSet = {};
        for (var p = 0; p < parentSowIds.length; p++) parentSowSet[parentSowIds[p]] = true;

        var parentSowDisplay = record[SOW_FIELD];
        var parentSowRaw = record[SOW_FIELD + '_raw'] || [];

        // 1) Accessories — ALWAYS exact-match the parent's SOW.
        var accIds = findAccessoryIdsForParent(record.id);
        for (var a = 0; a < accIds.length; a++) {
          fireAccessorySowPut(accIds[a], parentSowIds);
        }

        // 2) Connected devices — only when the child sits on a SOW the
        //    parent does NOT also include; then re-align to the parent's
        //    exact SOW set.
        var childIds = findRowsPointingTo(record.id);
        var realigned = 0;
        for (var c = 0; c < childIds.length; c++) {
          var childId = childIds[c];
          if (childId === record.id) continue;
          var childSowIds = sowIdsFromAttrs(getModelAttrs(childId));
          var hasForeignSow = false;
          for (var s = 0; s < childSowIds.length; s++) {
            if (!parentSowSet[childSowIds[s]]) { hasForeignSow = true; break; }
          }
          if (!hasForeignSow) continue;   // child SOWs ⊆ parent's → leave alone
          var body = {};
          body[SOW_FIELD] = parentSowIds;
          // Patch the local model so the v2 tree rebuild on scw-cascade-idle
          // reflects the new SOW without waiting for the PUT to land.
          syncModelChild(childId, (function () {
            var pp = {};
            pp[SOW_FIELD] = parentSowDisplay;
            pp[SOW_FIELD + '_raw'] = parentSowRaw;
            return pp;
          })());
          log('sow-cascade: connected device ' + childId +
              ' on a SOW the parent lacks → re-aligning to ' + JSON.stringify(parentSowIds));
          firePut(childId, body);
          realigned++;
        }

        log('sow-cascade done for parent ' + record.id + ': ' + accIds.length +
            ' accessory PUT(s), ' + realigned + '/' + childIds.length +
            ' connected device(s) re-aligned');
      } catch (e) {
        console.warn(LOG_PREFIX, 'sow-cascade handler threw', e);
      }
    });

  // Re-renders during the edit cycle reset the settle timer rather than
  // aborting, so Knack's native post-edit re-render doesn't kill us.
  // After the initial regroup has run, the MutationObserver watchdog is
  // the primary reapply path, but we also hook view-render as a secondary
  // path with a longer defer (the observer fires immediately on childList
  // changes; view-render may fire later after Knack finishes its render
  // cycle — we want to catch both).
  $(document).on('knack-view-render.' + VIEW_ID + EVENT_NS, function () {
    if (pendingRecord || settleTimer) {
      log('view re-rendered during edit cycle — resetting settle timer');
      armSettle();
      return;
    }
    // MODEL_ONLY: there's no DOM to replay against. Skip the
    // mut-guard reattach + applyPlanToDom replays.
    if (MODEL_ONLY) return;
    if (pendingPlan) {
      log('view re-rendered during replay window — scheduling replay checks');
      // Re-attach the mutation observer in case the tbody element was
      // replaced (the old observer is bound to the defunct tbody).
      startMutGuard();
      // Run multiple replay checks at increasing delays so we catch both
      // immediate render commits and any tail-end re-sorts Knack does
      // after emitting view-render.
      [50, 200, 500].forEach(function (delay) {
        setTimeout(function () {
          if (!pendingPlan) return;
          if (planHasDrifted(pendingPlan)) {
            log('view-render replay @' + delay + 'ms: drift detected');
            applyPlanToDom(pendingPlan, 'view-render@' + delay);
          }
        }, delay);
      });
    }
  });

    // ======================================================================
    // Public debug hook — poke from DevTools under the configured name.
    // ======================================================================
    var api = {
      applyDeterministicRegroup: applyDeterministicRegroup,
      applyPlanToDom: applyPlanToDom,
      findRowsPointingTo: findRowsPointingTo,
      findL1HeaderBefore: findL1HeaderBefore,
      /** Cascade GROUPING_FIELD = [mdfId] to every accessory whose
       *  ACCESSORIES_PARENT_FIELD points back at any of the given
       *  parent ids. Source-of-truth lookup is the accessory view's
       *  model (preferred) with a fallback to scraping the parent's
       *  td.<ACCESSORIES_FIELD>. Used by the connection picker on
       *  resubmit so still-connected children get their accessories'
       *  MDF refreshed even when the parent's selection didn't change
       *  (the regroup diff returns empty in that case and the built-in
       *  accessory cascade only fires for `added` children). onAllDone
       *  fires after every accessory PUT settles. */
      cascadeAccessoryMdf: function (childIds, mdfId, onAllDone) {
        if (!ACCESSORIES_VIEW_ID || !mdfId || !childIds || !childIds.length) {
          if (typeof onAllDone === 'function') onAllDone();
          return;
        }
        var queue = [];
        var seenAcc = {};
        for (var i = 0; i < childIds.length; i++) {
          var accIds = findAccessoryIdsForParent(childIds[i]);
          for (var j = 0; j < accIds.length; j++) {
            if (seenAcc[accIds[j]]) continue;
            seenAcc[accIds[j]] = true;
            queue.push(accIds[j]);
          }
        }
        if (!queue.length) {
          if (typeof onAllDone === 'function') onAllDone();
          return;
        }
        log('cascadeAccessoryMdf: ' + queue.length +
            ' accessory PUT(s) for ' + childIds.length + ' child(ren)');
        var remaining = queue.length;
        function tick() {
          remaining--;
          if (remaining <= 0 && typeof onAllDone === 'function') onAllDone();
        }
        for (var k = 0; k < queue.length; k++) {
          fireAccessoryPut(queue[k], mdfId, tick);
        }
      },
      inspectState: function () {
        return {
          hasPendingRecord: pendingRecord != null,
          hasSettleTimer: settleTimer != null,
          hasPendingPlan: pendingPlan != null,
          pendingPlan: pendingPlan,
          ownPutsInFlight: Object.keys(ownPuts)
        };
      }
    };
    window.SCW = window.SCW || {};
    if (PUBLIC_API_NAME) window.SCW[PUBLIC_API_NAME] = api;

    log('installed — trigger=' + TRIGGER_FIELD + ', view=' + VIEW_ID);
    return api;
  }

  // ── Instance registrations ────────────────────────────────────────────
  createMirror({
    VIEW_ID:           'view_3505',
    TRIGGER_FIELD:     'field_2380',
    CONNECTIONS_FIELD: 'field_2381',
    GROUPING_FIELD:    'field_2375',
    LABEL_FIELD:       'field_2365',   // survey line-item display label
    PUBLIC_API_NAME:   'silentRegroupView3505'
  });

  createMirror({
    VIEW_ID:             'view_3586',
    TRIGGER_FIELD:       'field_1957',
    CONNECTIONS_FIELD:   'field_2197',
    GROUPING_FIELD:      'field_1946',
    // Cascade MDF/IDF down to mounting-hardware accessories
    // (mounting-box SOW line items). field_1958 is the parent's
    // forward-listing connection (DOM scrape fallback); field_2464 is
    // the accessory's own back-connection to its parent — the source
    // of truth queried from the accessory view's model. When a
    // camera/reader moves to a new MDF as part of a regroup, every
    // accessory whose field_2464 points at it gets the same MDF
    // write so they group with their parent.
    ACCESSORIES_FIELD:        'field_1958',
    ACCESSORIES_VIEW_ID:      'view_3887',
    ACCESSORIES_PARENT_FIELD: 'field_2464',
    SOW_FIELD:                'field_2154',
    // view_3586 is now driven by worksheet-v2 (custom card UI, no v1
    // .scw-ws-row triplets to scrape). Diff connected-device changes off
    // the Backbone model, not the DOM, and route through PUT-only +
    // scw-cascade-idle refetch — same as the view_3962 deployment — so the
    // field_1957 → field_2197 reciprocal cascade fires reliably.
    LABEL_FIELD:              'field_1950',   // SOW line-item display label
    MODEL_ONLY:          true,
    PUBLIC_API_NAME:     'silentRegroupView3586'
  });

  // view_3610 hosts the same SOW line items shape as view_3586 (same
  // field keys throughout), so the same mirror config applies — we just
  // need a second instance against this view's DOM/model.
  createMirror({
    VIEW_ID:             'view_3610',
    TRIGGER_FIELD:       'field_1957',
    CONNECTIONS_FIELD:   'field_2197',
    GROUPING_FIELD:      'field_1946',
    // Same accessory cascade as view_3586, but the accessory records on
    // this scene live on view_3888 instead of view_3887.
    ACCESSORIES_FIELD:        'field_1958',
    ACCESSORIES_VIEW_ID:      'view_3888',
    ACCESSORIES_PARENT_FIELD: 'field_2464',
    SOW_FIELD:                'field_2154',
    LABEL_FIELD:              'field_1950',   // SOW line-item display label
    PUBLIC_API_NAME:     'silentRegroupView3610'
  });

  // view_3962 is the v2 worksheet's dedicated source view — same SOW
  // Line Items object as view_3610, same field keys, but v1's
  // device-worksheet.js does NOT transform this view's DOM (no
  // .scw-ws-row triplet, no Knack native grouping headers). So this
  // instance runs in MODEL_ONLY mode: candidate scans + identifier
  // lookups read from the Backbone model, no DOM mutations, no
  // mut-guard, no view-render replay. PUTs still fire normally and
  // scw-cascade-idle still emits when they settle, so v2's data
  // layer picks up fresh data via refetchAndNotify.
  //
  // Accessories on this scene still live on view_3888 (shared with
  // view_3610). The accessory model-lookup path
  // (findAccessoryIdsFromAccessoryModel) is the primary source even
  // in DOM mode, so it works unchanged here.
  createMirror({
    VIEW_ID:             'view_3962',
    TRIGGER_FIELD:       'field_1957',
    CONNECTIONS_FIELD:   'field_2197',
    GROUPING_FIELD:      'field_1946',
    ACCESSORIES_FIELD:        'field_1958',
    ACCESSORIES_VIEW_ID:      'view_3888',
    ACCESSORIES_PARENT_FIELD: 'field_2464',
    SOW_FIELD:                'field_2154',
    LABEL_FIELD:              'field_1950',   // SOW line-item display label
    MODEL_ONLY:          true,
    PUBLIC_API_NAME:     'silentRegroupView3962'
  });

  // view_3921 (SOW Line Items source for the bid-review comparison
  // grid). Same SOW Line Items object as view_3586/3610, same field
  // keys, same regroup semantics. The bid-review feature edits
  // field_1957 through worksheet cards moved out of #view_3921 into
  // #bid-review-matrix; the connection-picker calls
  // silentRegroupView3921 on save so the reciprocal + grouping cascade
  // still fires.
  //
  // Mounting brackets on the comparison-grid scene live on view_3927
  // (a hidden source view added so cascadeAccessoryMdf can read each
  // bracket record's field_2464 back-connection from its model).
  createMirror({
    VIEW_ID:             'view_3921',
    TRIGGER_FIELD:       'field_1957',
    CONNECTIONS_FIELD:   'field_2197',
    GROUPING_FIELD:      'field_1946',
    ACCESSORIES_FIELD:        'field_1958',
    ACCESSORIES_VIEW_ID:      'view_3927',
    ACCESSORIES_PARENT_FIELD: 'field_2464',
    SOW_FIELD:                'field_2154',
    LABEL_FIELD:              'field_1950',   // SOW line-item display label
    PUBLIC_API_NAME:     'silentRegroupView3921'
  });

  // view_3915 (INSTALL line items on the Implementation page).
  // Same regroup semantics as the SOW/Survey worksheets, just bound
  // to the install-line-item field map:
  //   TRIGGER_FIELD     = field_2820  (REL_networking device → connection device)
  //   CONNECTIONS_FIELD = field_2821  (REL_connected device → network device)
  //   GROUPING_FIELD    = field_2818  (REL_OPS_MDF-IDF — the L1 group key)
  // No accessory cascade wired yet — add ACCESSORIES_* if/when mounting
  // hardware on the install side needs its MDF cascaded from the parent.
  createMirror({
    VIEW_ID:           'view_3915',
    TRIGGER_FIELD:     'field_2820',
    CONNECTIONS_FIELD: 'field_2821',
    GROUPING_FIELD:    'field_2818',
    LABEL_FIELD:       'field_2802',   // install line-item display label
    PUBLIC_API_NAME:   'silentRegroupView3915'
  });

  // view_4056 ("WHAT WE'RE INSTALLING") — SAME install object + field map as
  // view_3915, so it needs its own mirror instance to fire the field_2820↔2821
  // cascade when Connected Devices/To are edited through that view's pickers.
  createMirror({
    VIEW_ID:           'view_4056',
    TRIGGER_FIELD:     'field_2820',
    CONNECTIONS_FIELD: 'field_2821',
    GROUPING_FIELD:    'field_2818',
    LABEL_FIELD:       'field_2802',   // install line-item display label
    PUBLIC_API_NAME:   'silentRegroupView4056'
  });

  // Backward-compat alias for any lingering DevTools snippets that
  // referenced the old "silentPoll" name.
  window.SCW = window.SCW || {};
  if (window.SCW.silentRegroupView3505) {
    window.SCW.silentPollView3505 = window.SCW.silentRegroupView3505;
  }
})();
/*** END FEATURE: Silent deterministic regroup after a parent-multi-connection inline-edit *********/
