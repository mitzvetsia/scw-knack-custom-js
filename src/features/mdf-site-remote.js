/*** MDF/IDF SITE REMOTE (preview) — the site's closets on a page that cannot host a site grid ***/
/**
 * "Sales needs to see existent MDF/IDFs when they're building the SOW" (Micah, 2026-11-17).
 *
 * The sales Scope of Work Details page (scene_1116) is a SOW-record page: Knack can show it the
 * closets "connected to the project connected to this SOW" (view_3602) but not the closets of
 * the project's SITE — that is one connection further than a Knack grid reaches. So the page has
 * no site twin for mdf-site-route.js to switch to.
 *
 * What it does instead: it READS a site grid that lives on a project-record page, passing that
 * page's crumb (`<slug>_id=<projectId>`) — proven live 2026-11-17 from this page against BUILD
 * SOW's view_4166 (36 MDF/IDFs came back) — and ADDS the closets the page does not already have
 * to the model of the page's own closet grid. Every consumer (the worksheet's MDF/IDF groups,
 * the MDF/IDF pickers, the add-item window, "+ Add MDF/IDF", the photo targets) reads that
 * model at use time, so they all see the site's closets with no change of their own — the
 * change-record-limit.js idiom (records added to the model, consumers re-notified).
 *
 * Gate: the site route (mdf-site-route.js `active()` — the preview list, or
 * localStorage.scwMdfSiteRoute = '1'). Off the route nothing is read and nothing changes.
 *
 * Added records carry `_scwSiteRemote: true`: they are at the site but were not created on this
 * project, and the page's own grid cannot write them. mdf-notes.js shows a read-only note for
 * them instead of the rename / delete panel.
 *
 * Sources are tried in order; one with no `view`, or whose view the schema does not list, is
 * skipped. BUILD SOW's grid sits under the Projects login, so a SALES login will most likely be
 * refused there (not tried yet): Builder should add the same grid to the Sales Portal project
 * page (scene_1127 "View CORE_project Details") and its key goes in the first source.
 */
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var CONFIG = {
    pages: {
      view_3602: {                                    // "Manage MDFs & IDFs" on Scope of Work Details
        worksheets: ['view_3586'],
        sources: [
          // Builder TBD — OPS_MDF-IDFs connected to the Site connected to this project, on the
          // Sales Portal project page (Sales Portal → Company Details → View CORE_project Details).
          { scene: 'scene_1127', view: '', crumb: 'view-core-project-details_id' },
          // BUILD SOW's site grid (Projects → Project Dashboard → BUILD SOW).
          { scene: 'scene_1085', view: 'view_4166', crumb: 'build-sow_id' }
        ]
      }
    },
    ttlMs: 60000,
    rows: 1000,
    retryMs: 400,
    retries: 6,
    markKey: '_scwSiteRemote',
    debug: false
  };

  var _cache = Object.create(null);      // projectId → { at, records, source }
  var _inflight = Object.create(null);   // projectId → Promise
  var _warned = Object.create(null);

  function active() {
    return !!(SCW.mdfSiteRoute && typeof SCW.mdfSiteRoute.active === 'function' && SCW.mdfSiteRoute.active());
  }

  function projectId() {
    try {
      var p = SCW.mdfSiteTools && typeof SCW.mdfSiteTools.pageProject === 'function' ? SCW.mdfSiteTools.pageProject() : null;
      return (p && p.id) || '';
    } catch (e) { return ''; }
  }

  function isMerged(a) {
    if (!a) return false;
    var v = a.field_2845_raw != null && a.field_2845_raw !== '' ? a.field_2845_raw : a.field_2845;
    if (Array.isArray(v)) v = v.join(' ');
    return /(^|\b)merged\b/i.test(String(v == null ? '' : v).replace(/<[^>]*>/g, ''));
  }

  function usable(src) {
    if (!src || !src.view || !src.scene || !src.crumb) return false;
    // A view deleted in Builder is skipped; with no schema to ask (tests) it is trusted.
    if (typeof SCW.sceneOfView === 'function' && window.Knack && Knack.scenes && !SCW.sceneOfView(src.view)) return false;
    return true;
  }

  function get(url) {
    return new Promise(function (resolve) {
      var opts = {
        type: 'GET', url: url, cache: false,
        success: function (r) { resolve({ ok: true, body: r }); },
        error: function (x) { resolve({ ok: false, status: (x && x.status) || 0 }); }
      };
      try {
        if (typeof SCW.knackAjax === 'function') SCW.knackAjax(opts);
        else resolve({ ok: false, status: 0 });
      } catch (e) { resolve({ ok: false, status: 0 }); }
    });
  }

  /** Read the site's closets for a project: the first source that answers. Resolves
   *  { records, source } or null (every source refused / none configured). */
  function read(pageGrid, pid) {
    var page = CONFIG.pages[pageGrid];
    var sources = (page && page.sources || []).filter(usable);
    var i = 0;
    function next() {
      if (i >= sources.length) return Promise.resolve(null);
      var src = sources[i++];
      var url = Knack.api_url + '/v1/scenes/' + src.scene + '/views/' + src.view + '/records?format=both' +
        '&rows_per_page=' + CONFIG.rows + '&page=1&' + encodeURIComponent(src.crumb) + '=' + encodeURIComponent(pid);
      return get(url).then(function (r) {
        if (r.ok && r.body && Array.isArray(r.body.records)) return { records: r.body.records, source: src };
        if (!_warned[src.view]) {
          _warned[src.view] = true;
          try { console.warn('[scw-mdf-site] could not read the site\'s MDF/IDFs through ' + src.view + ' (' + src.scene +
            ', HTTP ' + (r.status || '?') + ')' + (i < sources.length ? ' — trying the next source' : '')); } catch (e) { /* console absent */ }
        }
        return next();
      });
    }
    return next();
  }

  function load(pageGrid, pid, force) {
    var hit = _cache[pid];
    if (!force && hit && (Date.now() - hit.at) < CONFIG.ttlMs) return Promise.resolve(hit);
    if (_inflight[pid]) return _inflight[pid];
    _inflight[pid] = read(pageGrid, pid).then(function (res) {
      delete _inflight[pid];
      if (!res) return hit || null;                 // keep the last good list over a failed re-read
      _cache[pid] = { at: Date.now(), records: res.records, source: res.source };
      return _cache[pid];
    });
    return _inflight[pid];
  }

  function idOf(m) { return (m && (m.id || (m.attributes && m.attributes.id))) || ''; }

  /** Add the site closets the page grid's model does not hold. Returns how many were added. */
  function inject(pageGrid, records) {
    var v = window.Knack && Knack.views && Knack.views[pageGrid];
    var coll = v && v.model && v.model.data;
    if (!coll || !coll.models) return 0;
    var have = Object.create(null);
    for (var i = 0; i < coll.models.length; i++) have[idOf(coll.models[i])] = true;
    var add = [];
    for (var j = 0; j < (records || []).length; j++) {
      var r = records[j];
      if (!r || !r.id || have[r.id] || isMerged(r)) continue;
      have[r.id] = true;
      var c = {};
      for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) c[k] = r[k];
      c[CONFIG.markKey] = true;
      add.push(c);
    }
    if (!add.length) return 0;
    if (typeof coll.add === 'function') coll.add(add, { silent: true });
    else coll.models = coll.models.concat(add.map(function (a) { return { id: a.id, attributes: a }; }));
    return add.length;
  }

  function notify(pageGrid) {
    var page = CONFIG.pages[pageGrid];
    var data = SCW.worksheetV2 && SCW.worksheetV2.data;
    if (!page || !data || typeof data.notify !== 'function') return;
    for (var i = 0; i < (page.worksheets || []).length; i++) {
      try { data.notify(page.worksheets[i]); } catch (e) { /* worksheet not mounted */ }
    }
  }

  var _logged = Object.create(null);
  function run(pageGrid, attempt) {
    if (!CONFIG.pages[pageGrid] || !active()) return Promise.resolve(0);
    if (!(window.Knack && Knack.views && Knack.views[pageGrid])) return Promise.resolve(0);
    var pid = projectId();
    if (!pid) {
      // The page's project comes off a single-record view that may render after the grid.
      attempt = attempt || 0;
      if (attempt >= CONFIG.retries) return Promise.resolve(0);
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(run(pageGrid, attempt + 1)); }, CONFIG.retryMs);
      });
    }
    return load(pageGrid, pid).then(function (hit) {
      if (!hit) return 0;
      var n = inject(pageGrid, hit.records);
      if (n) notify(pageGrid);
      var sig = pid + ':' + hit.records.length + ':' + n;
      if (n && !_logged[sig]) {
        _logged[sig] = true;
        try { console.info('[scw-mdf-site] ' + pageGrid + ': ' + hit.records.length + ' MDF/IDFs at this project\'s site (read through ' +
          hit.source.view + '), ' + n + ' of them not on this project — added to the page\'s list'); } catch (e) { /* console absent */ }
      }
      return n;
    });
  }

  /** Does the page grid hold site closets from a read (so its list is the SITE's, not the project's)? */
  function loaded(pageGrid) {
    if (!CONFIG.pages[pageGrid] || !active()) return false;
    var pid = projectId();
    var hit = pid && _cache[pid];
    return !!(hit && hit.records && hit.records.length);
  }

  /** Is this closet one the page got from the site read (at the site, not created on this project)? */
  function isRemote(pageGrid, id) {
    try {
      var v = Knack.views[pageGrid];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        if (idOf(models[i]) === id) {
          var a = models[i].attributes || models[i];
          return !!(a && a[CONFIG.markKey]);
        }
      }
    } catch (e) { /* not on the page */ }
    return false;
  }

  /** Re-read the site (after a closet was added or merged elsewhere) and add what is new. */
  function refresh(pageGrid) {
    var pid = projectId();
    if (!pid || !CONFIG.pages[pageGrid] || !active()) return Promise.resolve(0);
    return load(pageGrid, pid, true).then(function () { return run(pageGrid); });
  }

  if (window.jQuery) {
    Object.keys(CONFIG.pages).forEach(function (pageGrid) {
      jQuery(document)
        .off('knack-view-render.' + pageGrid + '.scwMdfSiteRemote')
        .on('knack-view-render.' + pageGrid + '.scwMdfSiteRemote', function () { run(pageGrid); });
    });
  }

  SCW.mdfSiteRemote = {
    CONFIG: CONFIG,
    run: run,
    refresh: refresh,
    loaded: loaded,
    isRemote: isRemote,
    _inject: inject,
    _cache: _cache
  };
})();
