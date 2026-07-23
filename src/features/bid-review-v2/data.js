/*** BID REVIEW V2 — DATA *****************************************************
 *
 * Multi-view subscriber, mirroring worksheet-v2/data.js but listening
 * to several views at once (bids + sow items + bid packages + mdf/idf
 * + change requests).
 *
 * Render is triggered whenever ANY of the subscribed views fires a
 * knack-view-render or knack-cell-update. The renderer reads from all
 * sources on each tick — cheap because reads come straight off
 * Backbone models that Knack already has loaded.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns) return;

  var subscribers = [];

  // Set true when the NEXT notify is a result of scw-cascade-idle (a
  // mirror-connection-sync cascade settling — e.g. Connected Devices).
  // init.js's subscribe callback reads + resets this to decide whether the
  // render needs the scroll-anchor safety net. Ordinary field edits (view-
  // render/cell-update/scw-ws-v2-record-saved) leave it false — see the
  // note at that call site for why those must NOT use the anchor.
  ns._pendingCascadeAnchor = false;

  /** Read records from a single view's Backbone model. */
  function readRecords(viewKey) {
    try {
      var v = Knack.views[viewKey];
      if (!v || !v.model || !v.model.data) return [];
      var models = v.model.data.models || [];
      var out = [];
      for (var i = 0; i < models.length; i++) {
        var m = models[i];
        if (!m) continue;
        var attrs = m.attributes || (typeof m.toJSON === 'function' ? m.toJSON() : null);
        if (attrs) out.push(attrs);
      }
      return out;
    } catch (e) {
      console.warn('[scw-br-v2] readRecords failed for ' + viewKey, e);
      return [];
    }
  }

  /** Read records from EVERY configured source view, keyed by viewKey. */
  function readAll() {
    var keys = (ns.CONFIG && ns.CONFIG.sourceViewKeys) || [];
    var out = {};
    for (var i = 0; i < keys.length; i++) out[keys[i]] = readRecords(keys[i]);
    return out;
  }

  function subscribe(handler) { subscribers.push(handler); }

  /** Fire every subscriber with the latest snapshot. */
  function notify() {
    var snapshot = readAll();
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](snapshot); }
      catch (e) { console.warn('[scw-br-v2] subscriber threw', e); }
    }
  }

  // Debounce — an edit refetches SEVERAL source views, and each one's fetch
  // completes in its OWN frame, firing a separate knack-view-render. A
  // per-frame (rAF) coalesce therefore still produced one render PER view =
  // several rebuilds + several scroll-anchor passes per edit ("several jumps
  // to the bottom"). Use a short TRAILING debounce so the whole burst of
  // refetch renders collapses into ONE render (one rebuild, one anchor pass).
  var _notifyTimer = null;
  var NOTIFY_DEBOUNCE_MS = 90;
  function notifyDebounced() {
    if (_notifyTimer) clearTimeout(_notifyTimer);
    _notifyTimer = setTimeout(function () {
      _notifyTimer = null;
      notify();
    }, NOTIFY_DEBOUNCE_MS);
  }

  /**
   * Refetch every source view's Backbone model from the server, then
   * notify once they've all settled. Used by the cascade-idle handler:
   * mirror-connection-sync's PUTs (e.g. the SOW cascade) land server-side
   * but never fire a knack-view-render, so Knack's local models — and thus
   * this grid — stay stale until something forces a re-read. A model.fetch
   * pulls the fresh records back, then notify() rebuilds the grid.
   */
  function refetchAll() {
    var keys = (ns.CONFIG && ns.CONFIG.sourceViewKeys) || [];
    var pending = 0;
    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      // Coalesce with any knack-view-render notifies the same fetches fired,
      // so the whole refetch settles into a single render.
      notifyDebounced();
    }
    function oneDone() { if (--pending <= 0) finish(); }
    for (var i = 0; i < keys.length; i++) {
      // Skip views no longer in the DOM — a fetch resolving after the user
      // navigated to another scene trips Knack's "Scene keys do not match!"
      // alert (the router processes the response against the wrong scene).
      if (!document.getElementById(keys[i])) continue;
      var v = Knack.views[keys[i]];
      if (!v || !v.model || typeof v.model.fetch !== 'function') continue;
      var p;
      try { p = v.model.fetch(); } catch (e) { p = null; }
      if (p && typeof p.always === 'function') { pending++; p.always(oneDone); }
      else if (p && typeof p.then === 'function') { pending++; p.then(oneDone, oneDone); }
    }
    // No fetch returned a thenable → still re-read after a short beat.
    if (pending === 0) setTimeout(finish, 400);
  }

  // Coalesce rapid cascade-idle bursts into a single refetch.
  var _refetchTimer = null;
  function refetchDebounced() {
    if (_refetchTimer) clearTimeout(_refetchTimer);
    _refetchTimer = setTimeout(function () {
      _refetchTimer = null;
      // Only fetch when the grid is actually mounted on this scene —
      // avoids pointless network churn on pages without the v2 grid.
      if (!ns.CONFIG || !document.getElementById(ns.CONFIG.mountId)) return;
      refetchAll();
    }, 250);
  }

  function attachListeners() {
    if (!ns.CONFIG || !ns.CONFIG.enabled) return;
    var keys = ns.CONFIG.sourceViewKeys || [];
    var nsEvt = ns.CONFIG.eventNs;
    keys.forEach(function (key) {
      $(document)
        .off('knack-view-render.' + key + nsEvt)
        .on('knack-view-render.' + key + nsEvt, notifyDebounced);
      $(document)
        .off('knack-cell-update.' + key + nsEvt)
        .on('knack-cell-update.' + key + nsEvt, notifyDebounced);
    });

    // mirror-connection-sync emits scw-cascade-idle once all its PUTs
    // settle (the SOW cascade, accessory regroups, reciprocal writes,
    // etc.). Those mutate records this grid reads but fire no Knack
    // render, so refetch the source views and rebuild. Guard against
    // duplicate binding across re-inits.
    if (!document.documentElement.hasAttribute('data-scw-br-v2-cascade-bound')) {
      document.documentElement.setAttribute('data-scw-br-v2-cascade-bound', '1');
      document.addEventListener('scw-cascade-idle', function () {
        // A cascade (e.g. Connected Devices) can move a child's row into a
        // DIFFERENT MDF/IDF group, or change the parent's device-list text
        // enough to change its row height — a real layout shift the plain
        // keyed-section rebuild has no way to hold scroll position through.
        // Flag it so the render this triggers gets the anchor correction;
        // reset by init.js's subscribe callback once it's read.
        ns._pendingCascadeAnchor = true;
        refetchDebounced();
      });
    }

    // The expand-panel SOW editor is an embedded worksheet-v2 card that writes
    // through worksheet-v2/edit.js. It commits via SCW.knackAjax (no
    // knack-cell-update event) and the optimistic local patch isn't reliably
    // reflected in this grid's read-only SOW cell — so a saved edit only showed
    // after a manual refresh. edit.js fires scw-ws-v2-record-saved on success;
    // refetch the source views (server-fresh) and rebuild. refetchDebounced
    // coalesces and guards on the grid being mounted; renderSnapshot defers
    // while the panel still has focus and flushes when the row collapses.
    if (!document.documentElement.hasAttribute('data-scw-br-v2-wsv2saved-bound')) {
      document.documentElement.setAttribute('data-scw-br-v2-wsv2saved-bound', '1');
      $(document).on('scw-ws-v2-record-saved', function (e, info) {
        if (!info || !info.viewKey) return;
        var srcKeys = (ns.CONFIG && ns.CONFIG.sourceViewKeys) || [];
        if (srcKeys.indexOf(info.viewKey) === -1) return;
        refetchDebounced();
      });
    }
  }

  /** Report each source view's loaded record count vs. its page cap.
   *  v2 diffs against whatever is in the on-scene Backbone model, so a
   *  capped source view (loaded === rows_per_page) silently produces
   *  phantom "Removed / Not surveyed" rows. Run SCW.bidReviewV2.debugSources()
   *  from the console; also warns automatically on each render when a
   *  source view looks truncated. */
  function sourceStats() {
    var keys = (ns.CONFIG && ns.CONFIG.sourceViewKeys) || [];
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = Knack.views && Knack.views[k];
      var loaded = (v && v.model && v.model.data && v.model.data.models)
        ? v.model.data.models.length : 0;
      var cap = (v && v.model && v.model.view && v.model.view.rows_per_page) || null;
      var total = null;
      try {
        // Knack stamps the server total on the collection after a fetch.
        total = (v && v.model && v.model.data &&
          (v.model.data.total_records != null ? v.model.data.total_records
            : (v.model.data.pagination_meta && v.model.data.pagination_meta.total_records)));
      } catch (e) { /* ignore */ }
      // Trust the server total when Knack stamped one: loaded < total is
      // the ONLY real truncation signal. The loaded >= rows_per_page
      // heuristic is a fallback for when total is unknown — it used to be
      // OR'd in unconditionally, and misfired whenever a scene re-render
      // reset rows_per_page to the Builder default (loaded 169 >= cap 100
      // with ALL 169 records present), warn+repair-refetching every render
      // until the retry budget burned.
      var capped = (total != null)
        ? (loaded < total)
        : (cap != null && loaded >= cap);
      out.push({ view: k, loaded: loaded, perPage: cap, total: total, truncated: !!capped });
    }
    return out;
  }

  // Self-heal for truncated source views. A truncated view means its
  // Backbone model holds fewer records than the server has — observed live
  // 2026-07-22 on view_3921 (loaded 100 of 304) with rows_per_page ALREADY
  // '1000': change-record-limit.js set the limit, but its refetch got
  // raced/aborted in the scene's initial render burst, leaving the
  // collection stuck at the Builder-default page. The damage is not
  // cosmetic — every unloaded bid record becomes a phantom "Not bid /
  // Removed" diff row (e.g. "137 not bid, labor Δ +$260k" on a 2-SOW
  // project). Warning alone leaves the diff wrong for the whole session,
  // so re-issue the fetch ourselves. Bounded per view so a genuinely
  // >1000-record view can't refetch-loop forever.
  var TRUNC_REPAIR_MAX = 2;
  var _truncRepairTries = {};
  var _truncRepairInflight = {};

  function repairTruncated(stat) {
    var k = stat.view;
    if (_truncRepairInflight[k]) return true;   // already refetching — don't burn a retry
    var tries = _truncRepairTries[k] || 0;
    if (tries >= TRUNC_REPAIR_MAX) return false;
    // Never fire a repair for a view that's no longer in the DOM — the
    // user navigated away, and a view-scoped fetch resolving against a
    // different scene trips Knack's "Scene keys do not match!" alert.
    if (!document.getElementById(k)) return false;
    var v = Knack.views && Knack.views[k];
    if (!v || !v.model || typeof v.model.fetch !== 'function') return false;
    _truncRepairTries[k] = tries + 1;
    try {
      var mv = v.model.view;
      if (mv) {
        mv.rows_per_page = 1000;
        if (mv.source) mv.source.limit = 1000;
      }
      var p = v.model.fetch();   // completion fires knack-view-render → notifyDebounced → rebuild
      _truncRepairInflight[k] = true;
      var clear = function () { _truncRepairInflight[k] = false; };
      if (p && typeof p.always === 'function') p.always(clear);
      else setTimeout(clear, 3000);
      return true;
    } catch (e) {
      _truncRepairInflight[k] = false;
      return false;
    }
  }

  function warnIfTruncated() {
    var stats = sourceStats();
    for (var i = 0; i < stats.length; i++) {
      if (!stats[i].truncated) continue;
      var repairing = repairTruncated(stats[i]);
      console.warn('[scw-br-v2] SOURCE VIEW TRUNCATED — diff will be wrong ' +
        '(phantom Removed/Not-surveyed rows):', stats[i],
        repairing
          ? ('→ refetching ' + stats[i].view + ' now to self-repair (attempt ' +
             (_truncRepairTries[stats[i].view] || 0) + '/' + TRUNC_REPAIR_MAX + ')')
          : ('→ self-repair retries exhausted for ' + stats[i].view +
             '; if it is missing from change-record-limit.js VIEW_IDS add it there, ' +
             'otherwise the view may genuinely exceed 1000 records'));
    }
  }

  /** True while a truncation-repair refetch is in flight. render.js uses
   *  this to SKIP building the grid on known-partial data — rendering the
   *  diff mid-repair paints phantom Removed/Not-bid sections that collapse
   *  a moment later (the "giant gaps while it's running" report). Returns
   *  false once repairs settle (or retries exhaust), so a genuinely
   *  >1000-record view still renders rather than deadlocking. */
  function truncationRepairPending() {
    for (var k in _truncRepairInflight) {
      if (_truncRepairInflight[k]) return true;
    }
    return false;
  }

  ns.debugSources = function () {
    var stats = sourceStats();
    console.table(stats);
    return stats;
  };

  ns.data = {
    readRecords:     readRecords,
    readAll:         readAll,
    subscribe:       subscribe,
    notify:          notify,
    notifyDebounced: notifyDebounced,
    refetchAll:      refetchAll,
    attachListeners: attachListeners,
    warnIfTruncated: warnIfTruncated,
    truncationRepairPending: truncationRepairPending
  };
})();
/*** END BID REVIEW V2 — DATA *************************************************/
