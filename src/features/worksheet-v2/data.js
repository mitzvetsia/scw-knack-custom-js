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

  /** Read all records currently in the source view's model. */
  function readRecords(sourceViewKey) {
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
  function notify(sourceViewKey) {
    var list = subscribers[sourceViewKey];
    if (!list || !list.length) return;
    var records = readRecords(sourceViewKey);
    for (var i = 0; i < list.length; i++) {
      try { list[i](sourceViewKey, records); }
      catch (e) { console.warn('[scw-ws-v2] subscriber threw', e); }
    }
  }

  /**
   * Refetch a view's model AND notify subscribers when the fetch
   * completes. Used by the cascade-idle handler — by the time the
   * mirror-connection-sync cascade is done, all the reciprocal-side
   * PUTs have landed, so the freshest view of the world is
   * server-side. A model.fetch() pulls it back into Knack's local
   * Backbone model, then notify re-renders v2's cards.
   */
  function refetchAndNotify(viewKey) {
    try {
      var v = Knack.views[viewKey];
      if (!v || !v.model || typeof v.model.fetch !== 'function') {
        notify(viewKey);
        return;
      }
      var p = v.model.fetch();
      if (p && typeof p.always === 'function') {
        p.always(function () { notify(viewKey); });
      } else if (p && typeof p.then === 'function') {
        p.then(function () { notify(viewKey); }, function () { notify(viewKey); });
      } else {
        // Backbone returned no thenable — fall back to a small delay
        setTimeout(function () { notify(viewKey); }, 400);
      }
    } catch (e) {
      notify(viewKey);
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
    refetchAndNotify: refetchAndNotify,
    attachListeners: attachListeners
  };
})();
/*** END WORKSHEET V2 — DATA LAYER ********************************************/
