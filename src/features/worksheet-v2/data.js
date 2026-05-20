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
  }

  ns.data = {
    readRecords: readRecords,
    subscribe:   subscribe,
    notify:      notify,
    attachListeners: attachListeners
  };
})();
/*** END WORKSHEET V2 — DATA LAYER ********************************************/
