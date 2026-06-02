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
  }

  ns.data = {
    readRecords:     readRecords,
    readAll:         readAll,
    subscribe:       subscribe,
    notify:          notify,
    notifyDebounced: notifyDebounced,
    attachListeners: attachListeners
  };
})();
/*** END BID REVIEW V2 — DATA *************************************************/
