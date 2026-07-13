/*** WORKSHEET V2 — DATA LAYER ************************************************
 *
 * Reads records from the existing Knack source view's Backbone model.
 * Does NOT load data itself — we let Knack do all the network +
 * filtering + pagination work, then we consume the already-loaded
 * records from sourceView.model.data.models.
 *
 * Exposes a small subscriber API so render.js can re-render whenever
 * the source view's data changes — triggered off knack-view-render
 * for the source view OR knack-cell-update for record-level edits.
 *
 * Future: when v2 fully replaces v1 we'll likely move to direct API
 * loads (mirroring bid-review/adapters.js loadView pattern) so the
 * source view can be deleted from the scene. For now: piggyback on
 * the existing view.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return; // config didn't load — bail

  // Per-source-view subscriber lists. Each entry is a function called
  // with (sourceViewKey, records) on every change event.
  var subscribers = Object.create(null);

  // ── readRecords cache ─────────────────────────────────────────────────
  // readRecords was rebuilding a full N-element array on EVERY call, and the
  // card builder calls it once PER card that renders a connection (Connected
  // Devices, accessories) — so a 333-row worksheet did 333× full-array
  // rebuilds (O(n²)) just to render. Cache the array per view and hand back
  // the SAME reference until the model structurally changes (add/remove/reset
  // → invalidated in bindChangeTracking). In-place attribute edits keep the
  // record object refs (Backbone mutates the attributes hash in place), so the
  // cached array reflects them with no rebuild. The stable ref also lets the
  // card layer memoize its back-pointer index against it (card.js).
  var _recCache = Object.create(null);   // viewKey -> records array
  function invalidateRecords(viewKey) {
    if (viewKey) delete _recCache[viewKey];
    else _recCache = Object.create(null);
  }

  /** Read all records currently in the source view's model (cached). */
  function readRecords(sourceViewKey) {
    // Bind (or REBIND) change tracking FIRST, before serving from cache. On an
    // SPA navigation between two pages that reuse the same view id (e.g. two
    // different SOWs' build pages, both view_3962), Knack rebuilds the view
    // with a BRAND-NEW model/collection. bindChangeTracking detects that the
    // collection object changed, rebinds its listeners to the live collection,
    // and drops the stale _recCache — so we don't keep serving the PREVIOUS
    // page's records (the "page shows SOW 1374 but the worksheet lists SOW
    // 1432's items" bug). Must run before the cache read below, or the stale
    // array short-circuits the whole detection.
    bindChangeTracking(sourceViewKey);
    var cached = _recCache[sourceViewKey];
    if (cached) return cached;
    try {
      var v = Knack.views[sourceViewKey];
      if (!v || !v.model || !v.model.data) return [];
      var models = v.model.data.models || [];
      var out = [];
      for (var i = 0; i < models.length; i++) {
        var m = models[i];
        if (!m) continue;
        // Use the Backbone attributes hash — same shape Knack passes
        // to knack-cell-update's record arg. Includes _raw companions
        // for connection / multi-choice fields.
        var attrs = m.attributes || (typeof m.toJSON === 'function' ? m.toJSON() : null);
        if (attrs) out.push(attrs);
      }
      _recCache[sourceViewKey] = out;
      return out;
    } catch (e) {
      console.warn('[scw-ws-v2] readRecords failed for ' + sourceViewKey, e);
      return [];
    }
  }

  /** Subscribe to record changes for a source view. */
  function subscribe(sourceViewKey, handler) {
    if (!subscribers[sourceViewKey]) subscribers[sourceViewKey] = [];
    subscribers[sourceViewKey].push(handler);
  }

  /** Fire all subscribers for a given view. */
  // Each notify drives a FULL worksheet rebuild in render.js (rebuilds every
  // card's DOM + summaries). Recalc-field edits fire notify twice — once from
  // refetchAndNotify's model.fetch().always, and once from the knack-view-render
  // that the same fetch triggers — so without coalescing every such edit pays
  // for two full rebuilds back-to-back (the post-edit "freeze"). Collapse all
  // notifies for a view that land in the same frame into ONE render.
  var notifyScheduled = Object.create(null);

  // ── Dirty tracking (so render.js can skip JSON.stringify for unchanged rows) ─
  // The keyed-card reuse check used to JSON.stringify EVERY record every render
  // just to detect change — ~168× per render, even on idle polls. Instead track
  // exactly what changed: Backbone fires 'change' on a model whose attributes a
  // fetch/poll updated, and 'add'/'remove'/'reset' on structural changes; the
  // optimistic edit path (SCW.syncKnackModel) calls markDirty directly (a direct
  // attribute mutation fires no 'change'). render.js rebuilds only dirty/new
  // records and reuses the rest with NO signature work.
  var _dirtyIds    = Object.create(null);  // viewKey -> { recId: true }
  var _dirtyAll    = Object.create(null);  // viewKey -> bool (structural → rebuild all)
  var _boundColl   = Object.create(null);  // viewKey -> the Backbone collection we bound to

  function markDirty(viewKey, recId) {
    if (!viewKey || !recId) return;
    (_dirtyIds[viewKey] || (_dirtyIds[viewKey] = Object.create(null)))[recId] = true;
  }
  // Bind our change listeners to the source view's Backbone collection. Keyed
  // to the collection INSTANCE (not a boolean) so that when Knack rebuilds the
  // view on an SPA navigation — a NEW collection object under the same view id —
  // we detect the swap, rebind to the live collection, and invalidate the cache
  // built from the previous page's data. A stale boolean guard was the bug: it
  // left our listeners on the dead collection, so the new page's add/reset
  // events never busted _recCache and the worksheet showed the prior SOW's
  // line items. Idempotent for the same collection instance.
  function bindChangeTracking(viewKey) {
    try {
      var v = Knack.views[viewKey];
      var coll = v && v.model && v.model.data;
      if (!coll || typeof coll.on !== 'function') return;
      if (_boundColl[viewKey] === coll) return;   // already bound to THIS collection
      // Different (or first) collection instance → this is a fresh view. Drop
      // any cache/dirty state built from the old one and bind to the new one.
      _boundColl[viewKey] = coll;
      invalidateRecords(viewKey);
      _dirtyAll[viewKey] = true;
      coll.on('change', function (m) { if (m && m.id) markDirty(viewKey, m.id); });
      coll.on('add remove reset', function () {
        _dirtyAll[viewKey] = true;
        invalidateRecords(viewKey);   // model set changed → drop the cached array
      });
    } catch (e) { /* ignore — render falls back to the full-sig path */ }
  }
  // Consumed by render.js at the start of a rebuild; returns what changed since
  // the last render and CLEARS it. all:true → rebuild everything (first render
  // or structural change), so render falls back to the signature path.
  function takeDirty(viewKey) {
    var out = { all: !!_dirtyAll[viewKey], ids: _dirtyIds[viewKey] || Object.create(null) };
    _dirtyIds[viewKey] = Object.create(null);
    _dirtyAll[viewKey] = false;
    return out;
  }
  // Non-destructive peek — lets the notify-driven render path skip a wholesale
  // DOM rebuild when nothing actually changed (Knack fires knack-view-render
  // several times on load + on unrelated cross-view refreshes). Does NOT clear,
  // so a later takeDirty in renderView still sees the real state.
  function peekDirty(viewKey) {
    return {
      all:   !!_dirtyAll[viewKey],
      count: Object.keys(_dirtyIds[viewKey] || {}).length
    };
  }

  function runNotify(sourceViewKey) {
    var list = subscribers[sourceViewKey];
    if (!list || !list.length) return;
    bindChangeTracking(sourceViewKey);
    // Re-assert still-live optimistic writes on EVERY render, not only the
    // data-layer's own refetch paths. Plenty of OTHER features call
    // model.fetch() on a source view directly (revision polling, bid-gate
    // refresh, record-limit bump, mirror-sync resync…) — each ends in a
    // knack-view-render → notify → rebuild that used to bypass the overlay,
    // so a fetch whose response predated a just-committed PUT would repaint
    // the stale value ("edit flashes green then reverts"). Applying the
    // overlay here makes every rebuild honor writes newer than the TTL.
    applyPendingOverlay(sourceViewKey);
    var records = readRecords(sourceViewKey);
    for (var i = 0; i < list.length; i++) {
      try { list[i](sourceViewKey, records); }
      catch (e) { console.warn('[scw-ws-v2] subscriber threw', e); }
    }
  }

  // Leading + trailing debounce. Knack streams the 333 records in as a burst of
  // add/reset/view-render events during load, and each marked the model dirty →
  // each drove a FULL tree rebuild (measured: 17 renders / ~1s on a 333-row
  // page, 16 of them rebuilding identical-but-for-more-rows data). We don't need
  // 17 intermediate paints — one when the burst settles. So: fire promptly on
  // the FIRST notify after a quiet gap (isolated edit stays responsive), but
  // collapse any rapid follow-ups into a single TRAILING render after the burst.
  var _notifyLeadTs = Object.create(null);   // viewKey -> last fire timestamp
  var _notifyTrail  = Object.create(null);   // viewKey -> trailing timer id
  var NOTIFY_BURST_MS = 150;

  function fireNotify(sourceViewKey) {
    notifyScheduled[sourceViewKey] = false;
    _notifyLeadTs[sourceViewKey] = Date.now();
    runNotify(sourceViewKey);
  }

  function notify(sourceViewKey) {
    var quiet = (Date.now() - (_notifyLeadTs[sourceViewKey] || 0)) >= NOTIFY_BURST_MS;
    if (quiet && !_notifyTrail[sourceViewKey]) {
      // Leading edge — render next frame (responsive for isolated edits + the
      // first event of a load burst). rAF coalesces same-frame duplicates.
      if (notifyScheduled[sourceViewKey]) return;
      notifyScheduled[sourceViewKey] = true;
      var run = function () { fireNotify(sourceViewKey); };
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
      else setTimeout(run, 0);
      return;
    }
    // Inside a burst — (re)arm a single trailing render after it settles.
    if (_notifyTrail[sourceViewKey]) clearTimeout(_notifyTrail[sourceViewKey]);
    _notifyTrail[sourceViewKey] = setTimeout(function () {
      _notifyTrail[sourceViewKey] = null;
      fireNotify(sourceViewKey);
    }, NOTIFY_BURST_MS);
  }

  /** Synchronous notify — bypasses the frame coalescing. Reserved for the
   *  rare caller that must render before reading the DOM back. */
  function notifyNow(sourceViewKey) {
    notifyScheduled[sourceViewKey] = false;
    if (_notifyTrail[sourceViewKey]) {
      clearTimeout(_notifyTrail[sourceViewKey]);
      _notifyTrail[sourceViewKey] = null;
    }
    _notifyLeadTs[sourceViewKey] = Date.now();
    runNotify(sourceViewKey);
  }

  /**
   * Refetch a view's model AND notify subscribers when the fetch
   * completes. Used by the cascade-idle handler — by the time the
   * mirror-connection-sync cascade is done, all the reciprocal-side
   * PUTs have landed, so the freshest view of the world is
   * server-side. A model.fetch() pulls it back into Knack's local
   * Backbone model, then notify re-renders v2's cards.
   */
  // In-flight guard per view. A single user action can ask for a refetch
  // from several places at once — edit.js (recalc field), the cascade's
  // scw-cascade-idle handler, a sales-CR refresh — and each model.fetch()
  // is BOTH a network round-trip AND a full knack-view-render storm through
  // every feature on the view (this is the "fires 3x per interaction" churn).
  // Collapse overlapping requests: while a fetch is pending, later callers
  // don't start a second one — they flag a single follow-up notify (the
  // in-flight fetch already pulls the freshest server state, so a re-render
  // off it is enough; no extra fetch needed).
  var _fetchInFlight   = Object.create(null);
  var _fetchWantFollow = Object.create(null);

  // ── Pending-writes overlay ───────────────────────────────────────────
  // model.fetch() REPLACES every record in the Backbone model with fresh
  // server data, discarding the in-place optimistic patches (syncKnackModel)
  // for any edit the server hasn't committed yet. That's why a discount edit
  // (a RECALC field → it fires refetchAndNotify) reverts OTHER recent edits
  // (notes, etc.) and can even revert itself, while notes-only edits — which
  // never fetch — don't. Fix: remember each optimistic write and RE-APPLY it
  // onto the model after every fetch, so a refetch can't roll back an edit
  // the server is still catching up on. Entries expire after a TTL (the
  // server has surely committed by then) and are cleared on PUT error.
  var _pending = Object.create(null);   // viewKey -> recordId -> fieldKey -> {raw, ts}
  var PENDING_TTL_MS = 12000;

  function registerPendingWrite(viewKey, recordId, fieldKey, raw) {
    if (!viewKey || !recordId || !fieldKey) return;
    var v = _pending[viewKey] || (_pending[viewKey] = Object.create(null));
    var r = v[recordId] || (v[recordId] = Object.create(null));
    r[fieldKey] = { raw: raw, ts: Date.now() };
  }

  function clearPendingWrite(viewKey, recordId, fieldKey) {
    var v = _pending[viewKey]; if (!v) return;
    var r = v[recordId]; if (!r) return;
    delete r[fieldKey];
    if (Object.keys(r).length === 0) delete v[recordId];
  }

  // Re-apply still-live optimistic writes onto the freshly-fetched model.
  // Only the user-edited INPUT field is re-applied — server-recomputed CALC
  // fields (Applied Discount, Total, Fee, …) are intentionally left as the
  // fetch returned them, so the recompute we refetched FOR still lands.
  function applyPendingOverlay(viewKey) {
    var v = _pending[viewKey]; if (!v) return;
    var view = Knack.views[viewKey];
    if (!view || !view.model || !view.model.data) return;
    var models = view.model.data.models || [];
    var byId = Object.create(null);
    for (var i = 0; i < models.length; i++) {
      if (models[i] && models[i].id) byId[models[i].id] = models[i];
    }
    var now = Date.now();
    var recIds = Object.keys(v);
    for (var ri = 0; ri < recIds.length; ri++) {
      var rid = recIds[ri];
      var fields = v[rid];
      var fkeys = Object.keys(fields);
      var rec = byId[rid];
      for (var fi = 0; fi < fkeys.length; fi++) {
        var fk = fkeys[fi];
        var pw = fields[fk];
        if (!pw || (now - pw.ts) > PENDING_TTL_MS) { delete fields[fk]; continue; }
        if (!rec) continue;                       // record not in this fetch — keep entry
        var attrs = rec.attributes || rec;
        // Only touch (and dirty-flag) records a fetch actually reverted —
        // same-ref values mean the optimistic patch is still in place.
        if (attrs[fk] !== pw.raw || attrs[fk + '_raw'] !== pw.raw) {
          attrs[fk] = pw.raw;
          attrs[fk + '_raw'] = pw.raw;
          markDirty(viewKey, rid);
          if (window.SCW && SCW.DEBUG) {
            console.log('[scw-ws-v2] pending-write overlay re-applied (a stale ' +
              'fetch tried to revert an in-flight edit)', viewKey, rid, fk);
          }
        }
      }
      if (Object.keys(fields).length === 0) delete v[rid];
    }
    if (Object.keys(v).length === 0) delete _pending[viewKey];
  }

  function refetchAndNotify(viewKey) {
    try {
      var v = Knack.views[viewKey];
      if (!v || !v.model || typeof v.model.fetch !== 'function') {
        notify(viewKey);
        return;
      }
      if (_fetchInFlight[viewKey]) {
        // Coalesce — a fetch is already running for this view. Just make
        // sure we re-render once it lands.
        _fetchWantFollow[viewKey] = true;
        return;
      }
      _fetchInFlight[viewKey] = true;
      var settle = function () {
        _fetchInFlight[viewKey] = false;
        // Re-apply optimistic edits the fetch just clobbered BEFORE notify,
        // so the rebuild renders the user's in-flight values, not stale
        // pre-commit server data.
        applyPendingOverlay(viewKey);
        notify(viewKey);
        if (_fetchWantFollow[viewKey]) {
          _fetchWantFollow[viewKey] = false;
          // Another caller asked mid-flight — one more (coalesced) notify,
          // NOT another fetch: the completed fetch is already current.
          notify(viewKey);
        }
      };
      var p = v.model.fetch();
      if (p && typeof p.always === 'function') {
        p.always(settle);
      } else if (p && typeof p.then === 'function') {
        p.then(settle, settle);
      } else {
        // Backbone returned no thenable — fall back to a small delay
        setTimeout(settle, 400);
      }
    } catch (e) {
      _fetchInFlight[viewKey] = false;
      notify(viewKey);
    }
  }

  // ── Single-record refetch ────────────────────────────────────────────
  // refetchAndNotify() above pulls the ENTIRE view model (all N records)
  // back over the wire AND triggers Knack's native grid to re-render every
  // row — on a 300+ row SOW that's a multi-second storm just to refresh ONE
  // edited card's server-recomputed CALC fields (Fee, Applied Discount,
  // Total, drop Label, survey Ext…).
  //
  // For an edit, only the EDITED record's derived fields changed, so we read
  // back JUST that record via the same view-scoped session-token endpoint we
  // PUT through (SCW.knackRecordUrl → /v1/pages/<scene>/views/<view>/records/
  // <id>, authed with Knack.getUserToken() — NOT the exposed REST API key /
  // objects API). syncKnackModel patches every field_NNNN from the response
  // (including the recomputed CALCs) into the one Backbone record, markDirty
  // flags it, and notify rebuilds only that card. No full fetch, no native
  // grid re-render.
  //
  // Why a short delay: Knack equation fields that reference a CONNECTED
  // record (e.g. install fee ← connected product price) settle a beat AFTER
  // the PUT acknowledgment — a GET fired immediately can read the
  // pre-recompute value. v1's scheduleFeeRefetch uses the same ~700ms wait.
  // The optimistic syncKnackModel(resp) from the PUT already painted an
  // approximate value instantly, so this only corrects the precise figure.
  var _recFetchInFlight = Object.create(null);
  var REC_REFETCH_DELAY_MS = 650;

  function refetchRecordAndNotify(viewKey, recordId, fieldKey, value) {
    try {
      if (!viewKey || !recordId ||
          !(window.SCW && typeof SCW.knackAjax === 'function' &&
            typeof SCW.knackRecordUrl === 'function')) {
        // No session-token endpoint available — fall back to the full refetch.
        refetchAndNotify(viewKey);
        return;
      }
      var inflightKey = viewKey + '|' + recordId;
      if (_recFetchInFlight[inflightKey]) {
        // A read for this exact record is already pending — it'll pull the
        // freshest state, so just coalesce (a later notify will render it).
        return;
      }
      _recFetchInFlight[inflightKey] = true;
      setTimeout(function () {
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(viewKey, recordId),
          type: 'GET',
          success: function (resp) {
            _recFetchInFlight[inflightKey] = false;
            try {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(viewKey, recordId, resp, fieldKey, value);
              }
            } catch (e) { /* ignore */ }
            // Re-apply any still-live optimistic writes (other in-flight
            // edits on this view) so the refresh can't roll them back.
            applyPendingOverlay(viewKey);
            notify(viewKey);
          },
          error: function (xhr) {
            _recFetchInFlight[inflightKey] = false;
            console.warn('[scw-ws-v2] record refetch failed', {
              recordId: recordId, status: xhr && xhr.status
            });
            // Best-effort: render whatever the optimistic patch already set.
            notify(viewKey);
          }
        });
      }, REC_REFETCH_DELAY_MS);
    } catch (e) {
      _recFetchInFlight[viewKey + '|' + recordId] = false;
      refetchAndNotify(viewKey);
    }
  }

  /** Wire the Knack event listeners that drive notify(). */
  function attachListeners() {
    if (!ns.CONFIG || !ns.CONFIG.enabled) return;
    var views = ns.CONFIG.views || [];
    views.forEach(function (vcfg) {
      var key = vcfg.sourceViewKey;
      // knack-view-render fires on every full re-render of the source
      // view (initial load, filter change, sort change, model.fetch).
      $(document)
        .off('knack-view-render.' + key + '.scwWsV2')
        .on('knack-view-render.' + key + '.scwWsV2', function () { notify(key); });

      // knack-cell-update fires on inline-edit save — we re-notify so
      // subscribers can patch the affected record without waiting for
      // the next full render.
      $(document)
        .off('knack-cell-update.' + key + '.scwWsV2')
        .on('knack-cell-update.' + key + '.scwWsV2', function () { notify(key); });

      // If this view is seeded with empty L1 groups from a separate
      // MDF/IDF source view (e.g. view_3358), re-notify whenever that
      // view renders — otherwise empty groups don't appear until the
      // next source-view render fires.
      if (vcfg.mdfSourceViewKey) {
        var mdfKey = vcfg.mdfSourceViewKey;
        $(document)
          .off('knack-view-render.' + mdfKey + '.scwWsV2-' + key)
          .on('knack-view-render.' + mdfKey + '.scwWsV2-' + key, function () { notify(key); });
      }
    });

    // mirror-connection-sync emits this when its reciprocal/cascade
    // PUTs are all settled. By the time it fires, OTHER records have
    // been updated server-side (reciprocal field_2197, regrouped
    // accessory MDFs, etc.) — but Knack's local Backbone model for
    // the source view doesn't auto-refresh in response, so v2's
    // cards would render stale data. Refetch the model on every
    // idle event so the cards stay accurate.
    if (!document.documentElement.hasAttribute('data-scw-ws-v2-cascade-bound')) {
      document.documentElement.setAttribute('data-scw-ws-v2-cascade-bound', '1');
      document.addEventListener('scw-cascade-idle', function () {
        var vs = (ns.CONFIG && ns.CONFIG.views) || [];
        for (var i = 0; i < vs.length; i++) {
          refetchAndNotify(vs[i].sourceViewKey);
        }
      });
    }
  }

  ns.data = {
    readRecords: readRecords,
    subscribe:   subscribe,
    notify:      notify,
    notifyNow:   notifyNow,
    refetchAndNotify: refetchAndNotify,
    refetchRecordAndNotify: refetchRecordAndNotify,
    registerPendingWrite: registerPendingWrite,
    clearPendingWrite:    clearPendingWrite,
    markDirty:       markDirty,
    takeDirty:       takeDirty,
    peekDirty:       peekDirty,
    attachListeners: attachListeners
  };
})();
/*** END WORKSHEET V2 — DATA LAYER ********************************************/
