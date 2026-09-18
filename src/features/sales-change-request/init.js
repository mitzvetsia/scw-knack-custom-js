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

  // Check if the sales CR module should be active. Returns true if
  // field_2706 = "Yes" on ANY of the configured addModeViews.
  function readAddModeFlag(viewId) {
    // Model first \u2014 mirrors workflow-stepper's readField on the same
    // views: a details view's model carries the field even when its
    // DOM lags a re-render, omits the field, or the view is hidden by
    // hide-data-source-views. The DOM-only read silently returned ''
    // here, which deactivated the whole module (v1 UI and the v2
    // adapter both gate on S.onPage()).
    try {
      var v = Knack && Knack.views && Knack.views[viewId];
      var attrs = v && v.model && v.model.attributes;
      if (attrs && Object.prototype.hasOwnProperty.call(attrs, CFG.addModeField)) {
        var raw = attrs[CFG.addModeField];
        if (raw != null && String(raw).length) {
          return String(raw).replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').trim();
        }
      }
    } catch (e) { /* fall through to DOM */ }
    var $pv = $('#' + viewId);
    if (!$pv.length) return '';
    // Grid cell shape (data-field-key on td)
    var $cell = $pv.find('[data-field-key="' + CFG.addModeField + '"]');
    // Details-view shape: wrapper div has the field class, value lives in .kn-detail-body
    if (!$cell.length) $cell = $pv.find('.' + CFG.addModeField + ' .kn-detail-body');
    // Last-resort fallback: wrapper itself (may include the label text)
    if (!$cell.length) $cell = $pv.find('.' + CFG.addModeField);
    return ($cell.text() || '').replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').trim();
  }

  function isModuleActive() {
    var views = CFG.addModeViews || [CFG.proposalView];
    for (var i = 0; i < views.length; i++) {
      if (/^yes$/i.test(readAddModeFlag(views[i]))) return true;
    }
    if (CFG.debug) {
      var seen = {};
      for (var d = 0; d < views.length; d++) seen[views[d]] = readAddModeFlag(views[d]) || '(empty)';
      console.info('[SalesCR] sync flag reads came up empty:', seen);
    }
    return false;
  }

  // ── API fallback for the add-mode flag ────────────────
  // The sales-portal scope-of-work-details scene doesn't render any of
  // the addModeViews (view_3491/view_3827 live on other scenes), so
  // the sync model/DOM reads can't ever activate the module there.
  // Read field_2706 straight off the SOW record via CFG.draftView
  // (view_3841) — the same view-based endpoint the draft persistence
  // already GETs/PUTs on this page. Cached per SOW id.
  var _apiFlagCache = {};
  ns._apiAddModeVal = '';   // change-detection's checkAddMode reads this

  function readAddModeFlagFromApi() {
    ns.detectSowRecordId();
    var sowId = S.sowRecordId();
    if (!sowId) return $.Deferred().resolve('').promise();
    if (_apiFlagCache[sowId] != null) {
      return $.Deferred().resolve(_apiFlagCache[sowId]).promise();
    }
    return SCW.knackAjax({
      url:  SCW.knackRecordUrl(CFG.draftView, sowId),
      type: 'GET'
    }).then(function (resp) {
      var raw = resp && (resp[CFG.addModeField + '_raw'] != null
        ? resp[CFG.addModeField + '_raw']
        : resp[CFG.addModeField]);
      var val = raw == null ? '' : String(raw).replace(/<[^>]*>/g, '').trim();
      _apiFlagCache[sowId] = val;
      ns._apiAddModeVal = val;
      // console.info, NOT SCW.debug — SCW.debug is gated on the global
      // SCW.DEBUG flag (default false), which made every activation
      // diagnostic in this module invisible in production.
      if (CFG.debug) {
        console.info('[SalesCR] API flag read via ' + CFG.draftView + ': ' +
          CFG.addModeField + ' = ' + (val || '(absent — expose the field on ' +
          CFG.draftView + ' in Builder)'));
      }
      return val;
    }, function (xhr) {
      if (CFG.debug) {
        console.info('[SalesCR] API flag read FAILED via ' + CFG.draftView +
          ' (HTTP ' + (xhr && xhr.status) + ') — is ' + CFG.draftView +
          ' a view on this scene?');
      }
      return '';
    });
  }

  /** True when any loaded worksheet record is survey-derived
   *  (field_2586 >= 1). Those rows are LOCKED by the per-card rule —
   *  the only way to change them is a change request — so the CR
   *  surface must be active whenever they exist, regardless of the
   *  SOW-level field_2706 flag (observed reading "No" on SOWs whose
   *  line items are clearly survey-derived). */
  function worksheetHasSurveyItems() {
    try {
      var v = Knack.views && Knack.views[CFG.worksheetView];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && models[i].attributes;
        if (!a) continue;
        var raw = a[CFG.addCountField + '_raw'];
        var n = (typeof raw === 'number') ? raw
          : parseFloat(String(a[CFG.addCountField] || '').replace(/[^0-9.\-]/g, ''));
        if (!isNaN(n) && n >= 1) return true;
      }
    } catch (e) { /* fall through */ }
    return false;
  }

  var _rehydrated = false;

  function activateModule() {
    S.setOnPage(true);
    ns.injectStyles();
    ns.buildBaseline();

    // Re-detect the SOW id on EVERY activation — never gate this behind
    // _rehydrated. In-app navigation between two SOWs' pages is the same
    // scene (only the record id in the hash changes), so the scene-change
    // teardown below can't see it; before this ran unconditionally, every
    // CR submitted after such a hop carried the FIRST SOW's id. state.js
    // flushes the old SOW's draft and swaps per-SOW state on a change;
    // here we only need to notice the change and rehydrate fresh.
    var sowBefore = S.sowRecordId();
    ns.detectSowRecordId();
    if (S.sowRecordId() !== sowBefore) _rehydrated = false;

    if (!_rehydrated) {
      _rehydrated = true;
      ns.rehydrateFromKnack();
    }

    // Inject UI after the worksheet transform settles. ns.refresh (not
    // the local refresh) so the worksheet-v2 adapter's wrap runs too.
    setTimeout(function () {
      ns.checkAddMode();
      ns.detectAddRecords();
      (ns.refresh || refresh)();
    }, CFG.uiDelay);
  }

  SCW.onViewRender(CFG.worksheetView, function () {
    _activeScene = Knack.router.current_scene_key || '';

    // Activate if field_2706 = Yes on a flag view…
    if (isModuleActive()) {
      activateModule();
      return;
    }
    // …or if the worksheet carries survey-locked rows — the lock and
    // the CR surface are one policy; locked rows without CR affordances
    // are a dead end for the user.
    if (worksheetHasSurveyItems()) {
      if (CFG.debug) {
        console.info('[SalesCR] ACTIVE — survey-derived (locked) rows present on ' +
          CFG.worksheetView);
      }
      activateModule();
      return;
    }
    // Sync reads found nothing — the flag views may simply not be on
    // this scene. Ask the server before declaring the module inactive.
    readAddModeFlagFromApi().then(function (val) {
      if (/^yes$/i.test(val || '')) {
        if (CFG.debug) console.info('[SalesCR] ACTIVE via API flag');
        activateModule();
      } else {
        S.setOnPage(false);
        if (CFG.debug) {
          console.info('[SalesCR] INACTIVE — API ' + CFG.addModeField + ' = ' +
            (val || '(none)') + '. Run SCW.salesCR.debugActivation() for detail.');
        }
      }
    });
  }, CFG.eventNs);

  // Console helper: SCW.salesCR.debugActivation() — prints everything
  // the activation gate looks at so a dark module is diagnosable.
  // BUILD_MARK identifies which bundle revision is actually loaded —
  // if debugActivation itself is undefined, the loader SHA predates
  // the CR-v2 work entirely.
  ns.BUILD_MARK = 'salescr-v2-api-fallback-2';
  ns.debugActivation = function () {
    console.log('[SalesCR] build:', ns.BUILD_MARK,
      '| v2 adapter loaded:', typeof ns._buildPendingCard === 'function',
      '| scene:', (Knack.router && Knack.router.current_scene_key) || '?');
    var views = CFG.addModeViews || [CFG.proposalView];
    for (var i = 0; i < views.length; i++) {
      var vid = views[i];
      var hasModel = !!(Knack.views && Knack.views[vid] && Knack.views[vid].model &&
                        Knack.views[vid].model.attributes);
      console.log('[SalesCR]', vid,
        '| inDom:', !!document.getElementById(vid),
        '| hasModel:', hasModel,
        '| flagRead:', readAddModeFlag(vid) || '(empty)');
    }
    console.log('[SalesCR] sowId:', S.sowRecordId() || '(none)',
      '| onPage:', S.onPage(),
      '| addMode:', S.isAddMode(),
      '| apiFlag:', ns._apiAddModeVal || '(not read)',
      '| surveyItems:', worksheetHasSurveyItems(),
      '| pending:', Object.keys(S.pending()).length,
      '| v2 container:', !!document.getElementById('scw-ws-v2-' + CFG.worksheetView));
    readAddModeFlagFromApi().then(function (v) {
      console.log('[SalesCR] fresh API flag:', v || '(absent)');
    });
  };

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
        if (CFG.debug) SCW.debug('[SalesCR] AJAX PUT intercepted for', resp.id, 'resp.field_1953:', resp.field_1953);
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
          if (CFG.debug) SCW.debug('[SalesCR] Using', fresh ? 'model' : 'resp', 'for', resp.id,
            'field_1953:', fresh ? fresh.field_1953 : resp.field_1953);
          ns.onCellUpdate(null, null, fresh || resp);
        }, 500);
      }
    } catch (e) {}
  });

  // ── Add-mode view render(s) → check add mode ─────────────
  // Binds to every view listed in CFG.addModeViews so that whichever
  // view carries field_2706 triggers the re-check when it re-renders.

  function onAddModeViewRender() {
    setTimeout(function () {
      // Re-check activation — field_2706 may have rendered after worksheet
      if (isModuleActive() && !S.onPage()) {
        S.setOnPage(true);
        ns.injectStyles();
        ns.buildBaseline();
        // Same unconditional re-detect as activateModule — a SOW switch
        // must reset the rehydrate gate (see the comment there).
        var sowBefore = S.sowRecordId();
        ns.detectSowRecordId();
        if (S.sowRecordId() !== sowBefore) _rehydrated = false;
        if (!_rehydrated) {
          _rehydrated = true;
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
  }

  (CFG.addModeViews || [CFG.proposalView]).forEach(function (vid) {
    SCW.onViewRender(vid, onAddModeViewRender, CFG.eventNs);
  });

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

  if (CFG.debug) SCW.debug('[SalesCR] Module initialized');

})();
