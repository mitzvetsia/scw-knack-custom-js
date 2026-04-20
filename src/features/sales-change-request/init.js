/*** SALES CHANGE REQUEST — INIT ***/
/**
 * Event bindings: wires view-render, cell-update, and scene-change
 * events to the sales change request pipeline.
 *
 * Reads : SCW.salesCR.* (all sibling modules)
 * Writes: SCW.salesCR.refresh (combined refresh entry point)
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;

  // Track which scene we're on so we only reset when truly navigating away
  var _activeScene = '';

  // ── Combined refresh (called after any mutation) ──────

  function refresh() {
    ns.renderUI();
    ns.injectRevisions();
  }

  ns.refresh = refresh;

  // ── Worksheet view render ─────────────────────────────
  // Fires on initial load AND on re-renders triggered by
  // refresh-on-inline-edit.js (model.fetch after cell updates).
  // We re-inject UI every time since re-render wipes the DOM.

  // Check if the sales CR module should be active (field_2706 = Yes on proposal view)
  function isModuleActive() {
    var $pv = $('#' + CFG.proposalView);
    if (!$pv.length) return false;
    // Grid cell shape (data-field-key on td)
    var $cell = $pv.find('[data-field-key="' + CFG.addModeField + '"]');
    // Details-view shape: wrapper div has the field class, value lives in .kn-detail-body
    if (!$cell.length) $cell = $pv.find('.' + CFG.addModeField + ' .kn-detail-body');
    // Last-resort fallback: wrapper itself (may include the label text)
    if (!$cell.length) $cell = $pv.find('.' + CFG.addModeField);
    var val = ($cell.text() || '').replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').trim();
    return /^yes$/i.test(val);
  }

  var _rehydrated = false;

  SCW.onViewRender(CFG.worksheetView, function () {
    _activeScene = Knack.router.current_scene_key || '';

    // Only activate if field_2706 = Yes
    if (!isModuleActive()) {
      S.setOnPage(false);
      return;
    }

    S.setOnPage(true);
    ns.injectStyles();
    ns.buildBaseline();

    // Detect SOW record ID from URL and rehydrate from Knack (once per page)
    if (!_rehydrated) {
      _rehydrated = true;
      ns.detectSowRecordId();
      ns.rehydrateFromKnack();
    }

    // Inject UI after device-worksheet transform (uses 150ms)
    setTimeout(function () {
      ns.checkAddMode();
      ns.detectAddRecords();
      refresh();
    }, CFG.uiDelay);
  }, CFG.eventNs);

  // ── Cell update → auto-create CR ──────────────────────
  // Device-worksheet uses direct AJAX PUT (not model.updateRecord),
  // so knack-cell-update never fires. We intercept successful PUT
  // responses to the worksheet view's records URL instead.

  $(document).on('knack-cell-update.' + CFG.worksheetView + CFG.eventNs, ns.onCellUpdate);

  // Intercept AJAX PUT responses for view_3586 records
  $(document).ajaxComplete(function (event, xhr, settings) {
    if (!S.onPage()) return;
    if (settings.type !== 'PUT') return;
    var url = settings.url || '';
    if (url.indexOf(CFG.worksheetView) === -1) return;
    if (xhr.status !== 200) return;

    try {
      var resp = typeof xhr.responseJSON === 'object' ? xhr.responseJSON
               : JSON.parse(xhr.responseText);
      if (resp && resp.id) {
        if (CFG.debug) console.log('[SalesCR] AJAX PUT intercepted for', resp.id, 'resp.field_1953:', resp.field_1953);
        // Delay to let Knack model absorb the response (connection _raw fields)
        setTimeout(function () {
          var model = Knack.views[CFG.worksheetView] && Knack.views[CFG.worksheetView].model;
          var records = model && model.data && model.data.models;
          var fresh = null;
          if (records) {
            for (var ri = 0; ri < records.length; ri++) {
              if (records[ri].id === resp.id) { fresh = records[ri].attributes || records[ri].toJSON(); break; }
            }
          }
          if (CFG.debug) console.log('[SalesCR] Using', fresh ? 'model' : 'resp', 'for', resp.id,
            'field_1953:', fresh ? fresh.field_1953 : resp.field_1953);
          ns.onCellUpdate(null, null, fresh || resp);
        }, 500);
      }
    } catch (e) {}
  });

  // ── Proposal view render → check add mode ─────────────

  SCW.onViewRender(CFG.proposalView, function () {
    setTimeout(function () {
      // Re-check activation — field_2706 may have rendered after worksheet
      if (isModuleActive() && !S.onPage()) {
        S.setOnPage(true);
        ns.injectStyles();
        ns.buildBaseline();
        if (!_rehydrated) {
          _rehydrated = true;
          ns.detectSowRecordId();
          ns.rehydrateFromKnack();
        }
        refresh();
      }
      ns.checkAddMode();
      if (S.isAddMode() && Object.keys(S.baseline()).length) {
        ns.detectAddRecords();
        refresh();
      }
    }, 300);
  }, CFG.eventNs);

  // ── Revision view render → load + inject ──────────────

  SCW.onViewRender(CFG.revisionView, function () {
    setTimeout(function () {
      ns.loadRevisions();
      ns.injectRevisions();
    }, 300);
  }, CFG.eventNs);

  // ── Scene change → only reset when navigating AWAY ────
  // refresh-on-inline-edit.js triggers model.fetch() on sibling
  // views after any cell update, which can fire scene-render on
  // the SAME scene. We must not wipe state when that happens.

  $(document)
    .off('knack-scene-render.any' + CFG.eventNs)
    .on('knack-scene-render.any' + CFG.eventNs, function () {
      var newScene = Knack.router.current_scene_key || '';
      if (_activeScene && newScene === _activeScene) return;

      // Truly navigated away
      S.setOnPage(false);
      S.setBaseline({});
      _activeScene = '';
      _rehydrated = false;
      ns.renderActionBar();
    });

  // ── Expose remaining public API ───────────────────────

  ns.getPending   = function () { return S.pending(); };
  ns.getBaseline  = function () { return S.baseline(); };

  if (CFG.debug) console.log('[SalesCR] Module initialized');

})();
