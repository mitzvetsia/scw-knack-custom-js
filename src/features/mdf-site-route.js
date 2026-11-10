/*** MDF/IDF SITE ROUTE (preview) — read the closets of the project's SITE, not the project ***/
/**
 * Part 1 of docs/locations.md moves MDF/IDFs to the Site. Builder now carries a SITE-sourced
 * copy of the three ops closet grids (2026-11-10): OPS_MDF-IDFs connected to the Site connected
 * to the page's project.
 *
 *   project grid                     site grid    page
 *   view_3577 (Build SOW)        →   view_4166    scene_1085  worksheet view_3962
 *   view_3822 (Reconcile Bids)   →   view_4167    scene_1155  bid-review / bid-review-v2 / add modal
 *   view_3932 (Manage Deployment)→   view_4168    scene_1311  worksheet view_4093
 *
 * The cut-over is gradual (Micah, 2026-11-10: "I need to be more gradual in this cut over… show
 * the new route to micah.shearer@getscw.com for now"). For a login on CONFIG.previewEmails the
 * pages READ AND WRITE closets through the site grid; everyone else stays on the project grid.
 * Nothing visible moves: every one of these grids is already a hidden data source (mdf-notes.js
 * hides view_3577 / view_3932, hide-data-source-views.js hides view_3822), and the three site
 * grids are hidden here for everyone.
 *
 * How: the config properties every consumer reads at use time become getters that answer the
 * site grid for a preview login —
 *   worksheet-v2  view_3962 / view_4093  mdfSourceViewKey + mdfManage.viewKey
 *   bid-review    CONFIG.mdfIdfViewKey (v1 load, v2 card / mdf-manage)
 *   bid-review-v2 CONFIG.sourceViewKeys (the 4th entry, its render listener)
 *   sow-add-item  HOSTS.view_3921.mdfView (the reconcile page's "+ Add to SOW" MDF list)
 * so no consumer changes. A pair whose site grid is not in the app schema stays on the project
 * grid (a deleted view never blanks a picker).
 *
 * Switches: CONFIG.previewEmails ([] = everyone, the full cut-over); per browser
 * localStorage.scwMdfSiteRoute = '1' forces the route on, '0' forces it off.
 * Builder (to do before widening): the site grids need "FLAG_lifecycle is not merged", and
 * view_4168 shows 25 rows a page (change-record-limit.js pushes all three to 1000).
 */
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var CONFIG = {
    previewEmails: ['micah.shearer@getscw.com'],
    pairs: {
      view_3577: 'view_4166',
      view_3822: 'view_4167',
      view_3932: 'view_4168'
    },
    flagKey: 'scwMdfSiteRoute',
    styleId: 'scw-mdf-site-route-css'
  };

  function email() {
    try {
      var a = window.Knack && Knack.getUserAttributes && Knack.getUserAttributes();
      return String((a && typeof a === 'object' && a.email) || '').trim().toLowerCase();
    } catch (e) { return ''; }
  }

  function override() {
    try {
      var v = window.localStorage && localStorage.getItem(CONFIG.flagKey);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (e) { /* storage blocked */ }
    return null;
  }

  /** Is the site route on for this login? */
  function active() {
    var o = override();
    if (o !== null) return o;
    var list = CONFIG.previewEmails || [];
    if (!list.length) return true;
    var e = email();
    if (!e) return false;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]).trim().toLowerCase() === e) return true;
    }
    return false;
  }

  /** The grid to read for a project closet grid: its site twin on the route, else itself. */
  function view(baseKey) {
    var pair = CONFIG.pairs[baseKey];
    if (!pair || !active()) return baseKey;
    // The site grid must exist in the app (a view deleted in Builder falls back). With no
    // schema to ask (tests, a page still booting) the pair is trusted.
    if (typeof SCW.sceneOfView === 'function' && window.Knack && Knack.scenes && !SCW.sceneOfView(pair)) return baseKey;
    return pair;
  }

  /** Is this one of the site-sourced grids (view_4166 / view_4167 / view_4168)? */
  function isSiteGrid(key) {
    for (var k in CONFIG.pairs) if (CONFIG.pairs[k] === key) return true;
    return false;
  }

  /** Every grid key a list of keys names on the route (for event listeners). */
  function views(list) {
    var out = [];
    for (var i = 0; i < (list || []).length; i++) out.push(view(list[i]));
    return out;
  }

  /** Turn obj[prop] into a getter over view(base). A write sets the base (config clones,
   *  tests); JSON.stringify still sees a plain value. */
  function routeProp(obj, prop) {
    if (!obj || typeof obj !== 'object') return false;
    var d = Object.getOwnPropertyDescriptor(obj, prop);
    if (d && d.get && d.get._scwMdfRoute) return true;   // already installed
    var base = obj[prop];
    if (typeof base !== 'string' || !CONFIG.pairs[base]) return false;
    var get = function () { return view(base); };
    get._scwMdfRoute = true;
    Object.defineProperty(obj, prop, {
      configurable: true,
      enumerable: true,
      get: get,
      set: function (v) { base = v; }
    });
    return true;
  }

  function routeArray(obj, prop) {
    if (!obj || !Array.isArray(obj[prop])) return false;
    var d = Object.getOwnPropertyDescriptor(obj, prop);
    if (d && d.get && d.get._scwMdfRoute) return true;
    var base = obj[prop];
    var hit = false;
    for (var i = 0; i < base.length; i++) if (CONFIG.pairs[base[i]]) hit = true;
    if (!hit) return false;
    var get = function () { return views(base); };
    get._scwMdfRoute = true;
    Object.defineProperty(obj, prop, {
      configurable: true,
      enumerable: true,
      get: get,
      set: function (v) { base = v; }
    });
    return true;
  }

  /** Install the getters. Idempotent; safe to call again after a late module load. */
  function install() {
    var done = [];
    var wv2 = SCW.worksheetV2;
    var cfgViews = (wv2 && wv2.CONFIG && wv2.CONFIG.views) || [];
    for (var i = 0; i < cfgViews.length; i++) {
      var vc = cfgViews[i];
      if (!vc || (vc.sourceViewKey !== 'view_3962' && vc.sourceViewKey !== 'view_4093')) continue;
      if (routeProp(vc, 'mdfSourceViewKey')) done.push(vc.sourceViewKey + '.mdfSourceViewKey');
      if (vc.mdfManage && routeProp(vc.mdfManage, 'viewKey')) done.push(vc.sourceViewKey + '.mdfManage');
    }
    var br = SCW.bidReview && SCW.bidReview.CONFIG;
    if (br && routeProp(br, 'mdfIdfViewKey')) done.push('bidReview.mdfIdfViewKey');
    var br2 = SCW.bidReviewV2 && SCW.bidReviewV2.CONFIG;
    if (br2 && routeArray(br2, 'sourceViewKeys')) done.push('bidReviewV2.sourceViewKeys');
    var host = wv2 && wv2.sowAddForm && wv2.sowAddForm.CONFIG && wv2.sowAddForm.CONFIG.HOSTS &&
               wv2.sowAddForm.CONFIG.HOSTS.view_3921;
    if (host && routeProp(host, 'mdfView')) done.push('sowAddForm.HOSTS.view_3921.mdfView');
    return done;
  }

  // ── merged closets never reach a reader ─────────────────────────────
  // A merged closet (FLAG_lifecycle = merged, Make 22.03) stays as a record. Builder should filter
  // every closet grid on "FLAG_lifecycle is not merged"; until a grid has that filter, a grid that
  // SERVES the lifecycle column has its merged rows taken out of the Backbone model the moment it
  // loads (render, reset, sync), so the worksheet groups, pickers and Merge lists never see them.
  // A grid without the column cannot be judged here: it needs the Builder filter.
  // Two signals, either one is enough: FLAG_lifecycle (field_2845) reads "merged", or the
  // "Merged into" link (field_3318, REL_merged into) points at a keeper. A grid serving NEITHER
  // column cannot be judged here — logOnceBlind() names it in the console.
  var CLOSET_GRIDS = ['view_3577', 'view_3602', 'view_3617', 'view_3803', 'view_3822', 'view_3892', 'view_3894',
                      'view_3932', 'view_4060', 'view_4084', 'view_4114', 'view_4166', 'view_4167', 'view_4168'];
  var LIFECYCLE = 'field_2845';
  var MERGED_INTO = 'field_3318';
  function filled(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return !!(v.id || v.identifier);
    return String(v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== '';
  }
  function isMerged(a) {
    if (!a) return false;
    var v = a[LIFECYCLE + '_raw'] != null && a[LIFECYCLE + '_raw'] !== '' ? a[LIFECYCLE + '_raw'] : a[LIFECYCLE];
    if (Array.isArray(v)) v = v.join(' ');
    if (/(^|\b)merged\b/i.test(String(v == null ? '' : v).replace(/<[^>]*>/g, ''))) return true;
    return filled(a[MERGED_INTO + '_raw']) || filled(a[MERGED_INTO]);
  }
  /** Does this record come from a grid that serves a merged signal at all? */
  function judgeable(a) {
    return !!a && (LIFECYCLE in a || (LIFECYCLE + '_raw') in a || MERGED_INTO in a || (MERGED_INTO + '_raw') in a);
  }

  var _blindWarned = {};
  function logOnceBlind(viewKey) {
    if (_blindWarned[viewKey]) return;
    _blindWarned[viewKey] = true;
    try {
      console.warn('[scw-mdf-site] ' + viewKey + ' has no FLAG_lifecycle (field_2845) or "Merged into" (field_3318) ' +
        'column, so merged closets on it cannot be hidden by the page. Builder: add the filter ' +
        '"FLAG_lifecycle is not merged" to ' + viewKey + ' (or add FLAG_lifecycle as a column).');
    } catch (e) { /* console absent */ }
  }

  var _pruned = {};   // viewKey -> merged rows taken out so far (diagnose())
  function pruneMerged(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var coll = v && v.model && v.model.data;
      if (!coll || !coll.models) return 0;
      if (!coll._scwMergedPrune && typeof coll.on === 'function') {
        coll._scwMergedPrune = true;
        coll.on('reset sync', function () { if (pruneMerged(viewKey)) repaint(viewKey); });
      }
      var gone = [];
      var blind = coll.models.length > 0;
      for (var i = 0; i < coll.models.length; i++) {
        var attrs = coll.models[i].attributes || coll.models[i];
        if (judgeable(attrs)) blind = false;
        if (isMerged(attrs)) gone.push(coll.models[i]);
      }
      if (blind) logOnceBlind(viewKey);
      if (!gone.length) return 0;
      if (typeof coll.remove === 'function') coll.remove(gone, { silent: true });
      else coll.models = coll.models.filter(function (m) { return gone.indexOf(m) < 0; });
      _pruned[viewKey] = (_pruned[viewKey] || 0) + gone.length;
      return gone.length;
    } catch (e) { return 0; }
  }

  /** Prune every closet grid on the page. Run on EVERY view render (not only the grid's own):
   *  a worksheet can read a grid whose data landed before the grid's render event, and the
   *  reset/sync hook is attached the first time the collection is seen. */
  function pruneAll() {
    var hit = [];
    var views = (window.Knack && Knack.views) || {};
    for (var i = 0; i < CLOSET_GRIDS.length; i++) {
      if (views[CLOSET_GRIDS[i]] && pruneMerged(CLOSET_GRIDS[i])) hit.push(CLOSET_GRIDS[i]);
    }
    return hit;
  }

  /** Re-render whatever reads this closet grid. The worksheet and the reconcile grid bind their
   *  "closet grid rendered" listeners when the bundle loads, BEFORE this module routes them to the
   *  site grid (and before the login is known), so on the route they listen to the project twin
   *  and would never repaint for view_4166 / view_4167 / view_4168. notify() is frame / burst
   *  coalesced on both, so an extra call costs nothing. */
  function repaint(viewKey) {
    try {
      var wv2 = SCW.worksheetV2;
      var vs = (wv2 && wv2.CONFIG && wv2.CONFIG.views) || [];
      for (var i = 0; i < vs.length; i++) {
        if (vs[i] && vs[i].mdfSourceViewKey === viewKey && wv2.data && typeof wv2.data.notify === 'function' &&
            window.Knack && Knack.views && Knack.views[vs[i].sourceViewKey]) {
          wv2.data.notify(vs[i].sourceViewKey);
        }
      }
      var br2 = SCW.bidReviewV2;
      var keys = (br2 && br2.CONFIG && br2.CONFIG.sourceViewKeys) || [];
      if (keys.indexOf(viewKey) >= 0 && br2.data && typeof br2.data.notifyDebounced === 'function') {
        br2.data.notifyDebounced();
      }
    } catch (e) { /* a consumer absent on this page */ }
  }

  /** Console check — SCW.mdfSiteRoute.diagnose() — one row per closet grid on the page. */
  function diagnose() {
    var out = [];
    var views = (window.Knack && Knack.views) || {};
    for (var i = 0; i < CLOSET_GRIDS.length; i++) {
      var k = CLOSET_GRIDS[i];
      var coll = views[k] && views[k].model && views[k].model.data;
      if (!coll || !coll.models) continue;
      var a0 = null, lc = false, mi = false;
      for (var j = 0; j < coll.models.length; j++) {
        a0 = coll.models[j].attributes || coll.models[j];
        if (LIFECYCLE in a0) lc = true;
        if (MERGED_INTO in a0) mi = true;
      }
      out.push({ grid: k, rows: coll.models.length, lifecycleColumn: lc, mergedIntoColumn: mi,
                 mergedHidden: _pruned[k] || 0, siteGrid: isSiteGrid(k) });
    }
    try { if (console.table) console.table(out); } catch (e) { /* no console */ }
    return out;
  }

  // The three site grids are data sources: never painted, for anyone. Static CSS so there is
  // no flash; the views still render (their models + rows stay readable).
  function injectStyles() {
    if (document.getElementById(CONFIG.styleId)) return;
    var keys = [];
    for (var k in CONFIG.pairs) keys.push(CONFIG.pairs[k]);
    var sel = [];
    for (var i = 0; i < keys.length; i++) sel.push('#' + keys[i], '.scw-acc-for-' + keys[i]);
    var style = document.createElement('style');
    style.id = CONFIG.styleId;
    style.textContent = sel.join(',\n') + ' { display: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }

  var _logged = false;
  function logOnce() {
    if (_logged || !active()) return;
    _logged = true;
    try {
      var on = [];
      for (var k in CONFIG.pairs) on.push(k + '→' + view(k));
      console.info('[scw-mdf-site] site route ON for this login: ' + on.join(', '));
    } catch (e) { /* console absent */ }
  }

  injectStyles();
  install();
  if (window.jQuery) {
    jQuery(document)
      .off('knack-view-render.any.scwMdfMergedPrune')
      .on('knack-view-render.any.scwMdfMergedPrune', function (e, view) {
        var key = view && (view.key || (view.attributes && view.attributes.key));
        var hit = pruneAll();
        for (var h = 0; h < hit.length; h++) repaint(hit[h]);
        // A routed site grid's own render: its readers are listening to the project twin.
        if (key && isSiteGrid(key) && hit.indexOf(key) < 0) repaint(key);
      });
    jQuery(document)
      .off('knack-scene-render.any.scwMdfSiteRoute')
      .on('knack-scene-render.any.scwMdfSiteRoute', function () {
        install();
        logOnce();
        pruneAll();
        try { document.documentElement.classList.toggle('scw-mdf-site-route', active()); } catch (e) { /* old DOM */ }
      });
  }

  SCW.mdfSiteRoute = {
    CONFIG: CONFIG,
    active: active,
    view: view,
    views: views,
    isSiteGrid: isSiteGrid,
    isMerged: isMerged,
    pruneMerged: pruneMerged,
    pruneAll: pruneAll,
    diagnose: diagnose,
    install: install
  };
})();
