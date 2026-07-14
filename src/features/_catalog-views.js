/*** CATALOG VIEWS — key-free reads of global config objects ****************
 *
 * Replaces the REST-API-key Builder snippets (Known Issue #17) with
 * VIEW-BASED reads: a hidden, unconnected "all records" grid of the source
 * object is added to each scene that needs the catalog, and this module
 * reads its Backbone model — loaded with the logged-in user's session
 * cookie, no API key anywhere.
 *
 * Per catalog: list the hidden view ids (one per scene, filled in as the
 * grids are added in Builder) + the field keys to project. read() returns
 * the first present+populated view's records, normalized; when NO view is
 * on the current scene it falls back to the legacy Builder-snippet global
 * (window.SCW.<global>) so migration can proceed scene by scene. Returns
 * [] when neither exists — consumers keep their own last-resort behavior
 * (e.g. the in-use prefix scrape).
 *
 * Builder recipe per scene (from Known Issue #17): add a grid, source =
 * the catalog object with NO connection (an unconnected source shows all
 * records; if the Add-Grid flow only offers connected sources, add a
 * throwaway never-populated connection on the object and filter to all).
 * Include the columns listed in the catalog's `fields` below. The view ids
 * added here are auto-hidden — no need to also list them in
 * hide-data-source-views.js.
 ***************************************************************************/
(function () {
  'use strict';

  var CATALOGS = {
    // Drop Prefix catalog — powers every Prefix picker. Small object (one
    // page), so a single hidden grid per scene serves the whole catalog.
    // Columns the grid must include: the prefix label + the two visibility
    // flags.
    dropPrefix: {
      views: [
        // TODO: fill in as the hidden Drop Prefix grids are added, e.g.:
        // 'view_4110',   // scene_1085 (survey/bid page)
        // 'view_4111',   // scene_1116 (build SOW)
        // 'view_4112',   // scene_1155 (bid review)
      ],
      labelField:        'field_XXXX',  // TODO: prefix text (e.g. "E-")
      subVisibleField:   'field_2439',  // Available for Subcontractors
      salesVisibleField: 'field_2440',  // Available for Sales
      legacyGlobal:      'dropPrefixOptions'
    }
  };

  function stripHtml(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }

  // Yes/No → boolean; blank/unknown → null (consumers fail open).
  function yes(v) {
    if (v === true  || v === 1) return true;
    if (v === false || v === 0) return false;
    var s = stripHtml(v).toLowerCase();
    if (s === 'yes' || s === 'true'  || s === '1') return true;
    if (s === 'no'  || s === 'false' || s === '0') return false;
    return null;
  }

  /** Records (Backbone attribute hashes) of the first present+populated
   *  view in the list, or null when none is on the current scene. */
  function readFirstView(viewKeys) {
    if (typeof Knack === 'undefined' || !Knack.views) return null;
    for (var i = 0; i < viewKeys.length; i++) {
      var v = Knack.views[viewKeys[i]];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models || !models.length) continue;
      var out = [];
      for (var m = 0; m < models.length; m++) {
        var a = models[m] && models[m].attributes;
        if (a && a.id) out.push(a);
      }
      if (out.length) return out;
    }
    return null;
  }

  /** Drop Prefix entries: [{ id, identifier, subVisible, salesVisible }].
   *  View-based read first; legacy snippet global as the migration
   *  fallback; [] when neither is available. */
  function dropPrefixes() {
    var cfg = CATALOGS.dropPrefix;
    var recs = readFirstView(cfg.views);
    if (recs) {
      var out = [];
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        var label = stripHtml(r[cfg.labelField + '_raw'] != null
          ? r[cfg.labelField + '_raw'] : r[cfg.labelField]);
        if (!label) continue;
        out.push({
          id:           r.id,
          identifier:   label,
          subVisible:   yes(r[cfg.subVisibleField + '_raw'] != null
                          ? r[cfg.subVisibleField + '_raw'] : r[cfg.subVisibleField]),
          salesVisible: yes(r[cfg.salesVisibleField + '_raw'] != null
                          ? r[cfg.salesVisibleField + '_raw'] : r[cfg.salesVisibleField])
        });
      }
      if (out.length) return out;
    }
    // Legacy Builder-snippet global (interim, still keyed — retire the
    // snippet once every scene has its hidden view).
    var g = window.SCW && window.SCW[cfg.legacyGlobal];
    if (Array.isArray(g) && g.length) {
      var norm = [];
      for (var gi = 0; gi < g.length; gi++) {
        var e = g[gi];
        if (e && e.id && e.identifier) {
          norm.push({
            id: e.id, identifier: e.identifier,
            subVisible:   e.subVisible   != null ? e.subVisible   : null,
            salesVisible: e.salesVisible != null ? e.salesVisible : null
          });
        }
      }
      return norm;
    }
    return [];
  }

  // Auto-hide every configured catalog view (same display:none-but-rendered
  // approach as hide-data-source-views.js — models still populate).
  function hideCatalogViews() {
    var ids = [];
    for (var k in CATALOGS) {
      var vs = CATALOGS[k].views || [];
      for (var i = 0; i < vs.length; i++) ids.push(vs[i]);
    }
    if (!ids.length) return;
    var STYLE_ID = 'scw-catalog-views-css';
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = ids.map(function (id) { return '#' + id; }).join(',\n') +
      ' { display: none !important; }';
    document.head.appendChild(s);
  }
  hideCatalogViews();

  window.SCW = window.SCW || {};
  SCW.catalog = {
    CONFIG:       CATALOGS,
    dropPrefixes: dropPrefixes
  };
})();
/*** END: catalog views *****************************************************/
