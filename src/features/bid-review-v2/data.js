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

  // Debounce — multiple source views often render in the same tick on
  // initial load (Knack fires them sequentially). One notify per
  // animation frame is enough.
  var _notifyTimer = null;
  function notifyDebounced() {
    if (_notifyTimer) return;
    _notifyTimer = requestAnimationFrame(function () {
      _notifyTimer = null;
      notify();
    });
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
      notify();
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
  }

  ns.data = {
    readRecords:     readRecords,
    readAll:         readAll,
    subscribe:       subscribe,
    notify:          notify,
    notifyDebounced: notifyDebounced,
    refetchAll:      refetchAll,
    attachListeners: attachListeners
  };
})();
/*** END BID REVIEW V2 — DATA *************************************************/
