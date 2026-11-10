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
      .off('knack-scene-render.any.scwMdfSiteRoute')
      .on('knack-scene-render.any.scwMdfSiteRoute', function () {
        install();
        logOnce();
        try { document.documentElement.classList.toggle('scw-mdf-site-route', active()); } catch (e) { /* old DOM */ }
      });
  }

  SCW.mdfSiteRoute = {
    CONFIG: CONFIG,
    active: active,
    view: view,
    views: views,
    isSiteGrid: isSiteGrid,
    install: install
  };
})();
