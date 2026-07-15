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
      document.addEventListener('scw-cascade-idle', refetchDebounced);
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
      var capped = (cap != null && loaded >= cap) ||
                   (total != null && loaded < total);
      out.push({ view: k, loaded: loaded, perPage: cap, total: total, truncated: !!capped });
    }
    return out;
  }

  // One recovery attempt per view per page load. A failed recovery
  // (still truncated after the forced fetch) must not loop — every
  // fetch fires knack-view-render → render → warnIfTruncated again.
  var _truncRecoveryTried = {};

  function warnIfTruncated() {
    var stats = sourceStats();
    for (var i = 0; i < stats.length; i++) {
      if (!stats[i].truncated) continue;
      console.warn('[scw-br-v2] SOURCE VIEW TRUNCATED — diff will be wrong ' +
        '(phantom Removed/Not-surveyed rows):', stats[i]);

      // Self-heal: the usual cause is per-user persisted view state (a
      // saved records-per-page choice or filter on the hidden source
      // grid) capping the Backbone model below the real record count —
      // change-record-limit.js's render-time bump ran before the user
      // state applied, so the model reloaded capped. Force the cap back
      // to 1000 and refetch; the fetch's knack-view-render notifies this
      // grid to rebuild on the full dataset. Same strategy-2 pattern as
      // change-record-limit.js (incl. the URL probe — a model without a
      // usable URL makes Backbone.sync throw synchronously).
      var k = stats[i].view;
      if (_truncRecoveryTried[k]) continue;
      _truncRecoveryTried[k] = true;
      try {
        var v = Knack.views && Knack.views[k];
        if (!v || !v.model || !v.model.view) continue;
        v.model.view.rows_per_page = 1000;
        if (v.model.view.source) v.model.view.source.limit = 1000;
        var url = (typeof v.model.url === 'function')
          ? v.model.url.call(v.model) : v.model.url;
        if (!url) continue;
        console.warn('[scw-br-v2] forcing ' + k + ' to 1000/page and refetching…');
        v.model.fetch();
      } catch (e) { /* leave the warn as the record */ }
    }
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
    warnIfTruncated: warnIfTruncated
  };
})();
/*** END BID REVIEW V2 — DATA *************************************************/
