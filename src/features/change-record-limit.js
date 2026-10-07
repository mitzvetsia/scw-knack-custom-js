/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 and view_3341 **************************/

(function () {
  // Device-worksheet views are listed here too — Knack's default 25/page
  // hides records that the worksheet renderer never gets to transform,
  // which silently breaks group-collapse and sort. Forcing 1000/page
  // makes the worksheet operate on the complete dataset.
  const VIEW_IDS = [
    // Misc views forced full-page. (view_3341 dropped at the v2 cutover:
    // its grid is hidden and nothing reads its model anymore — letting it
    // fetch the Builder-default page size halves the scene's data load
    // until the view is deleted in Builder. view_3896 dropped 2026-07-31:
    // the publish JSON snapshot now reads view_4140 — see
    // proposal-pdf-export.js jsonIncludeViews — so nothing reads its
    // model; delete the view in Builder.)
    'view_3550', 'view_3586', 'view_3610', 'view_3926',
    // worksheet-v2 source view (mirrors view_3610 — same cap rationale)
    'view_3962',
    // All WORKSHEET_CONFIG views from device-worksheet.js
    'view_3313', 'view_3450', 'view_3505', 'view_3512', 'view_3575',
    'view_3596', 'view_3997', 'view_3602', 'view_3608', 'view_3800', 'view_4093',
    // "WHAT WE'RE INSTALLING" worksheet (same install object as view_4093)
    'view_4056',
    // bid-review-v2 SOURCE views. v2 reads these straight off their
    // on-scene Backbone models (Knack.views[k].model.data.models), so a
    // page cap means v2's diff runs on PARTIAL data — e.g. a SOW item
    // whose bid record sits on an unloaded page gets misclassified as
    // "Removed / Not surveyed". v1 loads its own copy via API, but that
    // doesn't bump these on-scene models, so force them here.
    'view_3680', 'view_3921', 'view_3573', 'view_3822', 'view_3818',
    // review-bids DOC_photos delete-plumbing grid (worksheet-v2/photos.js
    // Path 1 clicks kn-link-delete rows in it — full page = every photo's
    // row present in the DOM; the grid itself is hidden by photos.js)
    'view_4098',
    // Deploy scene As-Quoted plumbing: view_4072 = hidden grid of the OG
    // proposed line items (install-as-quoted-panel reads it whole off the
    // model — a page cap silently drops the LAST-created records, i.e.
    // change-order items, and their install cards lose the As Quoted
    // panel); view_3914 = acceptance grid feeding origin/quote chips.
    // view_4151 / view_4066 = the sub deployment dashboard's (scene_1353)
    // analogues of the same two grids.
    'view_4072', 'view_3914', 'view_4151', 'view_4066',
    // Customer questionnaire scene (scene_1347): view_4031 = install line
    // items the cards render from; view_4075 = hidden DOC_photos grid the
    // photo strips scrape (was 100/page — projects past 100 photos lost
    // strips silently).
    'view_4031', 'view_4075',
    // Change Order scene: CO line items (v2 source), MDF/IDF locations,
    // project install items (removal source), project SOW/proposal items
    // (adoption source). All read whole via the Backbone model.
    'view_4079', 'view_4084', 'view_4086', 'view_4088',
    // Sub portal Manage Change Order page (scene_1374) — 1:1 analogues of
    // the four CO scene views above, same full-model rationale.
    'view_4112', 'view_4114', 'view_4116', 'view_4118',
    // proposal-grid-v2 flat data view (duplicate of view_3341, no
    // groupings) — v2 renders the whole grid off this model.
    'view_4140'
  ];
  const LIMIT_VALUE = '1000';
  const LIMIT_NUM = 1000;
  const EVENT_NS = '.scwLimit1000';

  // Views forced to 1000 records/page elsewhere in the codebase. The
  // per-page navigator is meaningless on these views (everything fits in
  // one page) — hide the pagination control on each so the UI doesn't
  // display "Page 1 of 1" / orphan arrows. Kept as a single union list
  // so there's exactly one place to update when another module starts
  // forcing full pages.
  const FORCED_FULL_PAGE_VIEWS = [
    // change-record-limit.js — misc views
    'view_3550', 'view_3586', 'view_3610', 'view_3926',
    // worksheet-v2 source view
    'view_3962',
    // change-record-limit.js — device-worksheet views
    'view_3313', 'view_3450', 'view_3505', 'view_3512', 'view_3575',
    'view_3596', 'view_3997', 'view_3602', 'view_3608', 'view_3800', 'view_4093',
    // "WHAT WE'RE INSTALLING" worksheet (same install object as view_4093)
    'view_4056',
    // import-unique-items-btn.js
    'view_3913',
    // bid-review source/compare views (now also in VIEW_IDS above)
    'view_3680', 'view_3921', 'view_3573', 'view_3822', 'view_3818',
    // review-bids DOC_photos delete-plumbing grid (see VIEW_IDS above)
    'view_4098',
    // Deploy-scene As-Quoted source grids, ops + sub (see VIEW_IDS above)
    'view_4072', 'view_3914', 'view_4151', 'view_4066',
    // Customer questionnaire scene grids (see VIEW_IDS above)
    'view_4031', 'view_4075',
    // Change Order scene views (see VIEW_IDS above)
    'view_4079', 'view_4084', 'view_4086', 'view_4088',
    // Sub portal Manage Change Order views (see VIEW_IDS above)
    'view_4112', 'view_4114', 'view_4116', 'view_4118',
    // proposal-grid-v2 flat data view (see VIEW_IDS above)
    'view_4140'
  ];

  (function injectHidePaginationCss() {
    const ID = 'scw-hide-forced-full-page-pagination-css';
    if (document.getElementById(ID)) return;
    const sel = FORCED_FULL_PAGE_VIEWS
      .map(v => '#' + v + ' .kn-pagination.level-right')
      .join(',\n');
    const s = document.createElement('style');
    s.id = ID;
    s.textContent = sel + ' { display: none !important; }';
    document.head.appendChild(s);
  })();

  // Pre-fetch limit push — on ANY view render, sweep every listed view and
  // stamp rows_per_page=1000 on models that haven't fetched yet. Knack
  // renders a scene's views serially, so by the time the FIRST view fires
  // its render event, later views' models usually exist but haven't built
  // their fetch request — stamping them now means their FIRST fetch loads
  // the full page. Without this, every listed view loads twice on scene
  // entry (Builder-default page size first, then our 1000/page refetch) —
  // double network, double render, and the partial first load is what
  // bid-review-v2's truncation repair exists to mop up. The per-view
  // handlers below remain as the safety net for models that appear late.
  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      if (typeof Knack === 'undefined' || !Knack.views) return;
      for (var i = 0; i < VIEW_IDS.length; i++) {
        var v = Knack.views[VIEW_IDS[i]];
        var mv = v && v.model && v.model.view;
        if (!mv) continue;
        if (mv.rows_per_page === LIMIT_NUM || mv.rows_per_page === LIMIT_VALUE) continue;
        mv.rows_per_page = LIMIT_NUM;
        if (mv.source) mv.source.limit = LIMIT_NUM;
      }
    });

  VIEW_IDS.forEach((VIEW_ID) => {
    $(document)
      .off(`knack-view-render.${VIEW_ID}${EVENT_NS}`)
      .on(`knack-view-render.${VIEW_ID}${EVENT_NS}`, function () {
        const $view = $('#' + VIEW_ID);
        if (!$view.length) return;

        // Run-once guard per view instance for the dropdown / stamp work.
        // A grid that is still short re-checks on every render (the try
        // counter in forceFullLoad bounds the refetches).
        if ($view.data('scwLimitSet')) { forceFullLoad(VIEW_ID); return; }
        $view.data('scwLimitSet', true);

        const $limit = $view.find('select[name="limit"]');

        // Already complete — the prefilter above made the first fetch a
        // full page (loaded >= server total). Stamp the model + dropdown
        // silently and skip the refetch that used to double every scene
        // load (and re-render every worksheet).
        var kv = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[VIEW_ID] : null;
        var km = kv && kv.model;
        var kd = km && km.data;
        if (kd && kd.models) {
          var total = kd.total_records != null ? kd.total_records
            : (kd.pagination_meta && kd.pagination_meta.total_records);
          if (typeof total === 'number' && kd.models.length >= total) {
            var kmv = km.view;
            if (kmv) {
              kmv.rows_per_page = LIMIT_NUM;
              if (kmv.source) kmv.source.limit = LIMIT_NUM;
            }
            if ($limit.length && $limit.val() !== LIMIT_VALUE) $limit.val(LIMIT_VALUE);
            return;
          }
        }

        // Strategy 1: DOM dropdown exists — use it
        if ($limit.length) {
          if ($limit.val() !== LIMIT_VALUE) {
            $limit.val(LIMIT_VALUE).trigger('change');
          }
          return;
        }

        // Strategy 2: no dropdown → FORCE-LOAD. Asking Knack to refetch at a
        // bigger page size (rows_per_page on the model + model.fetch) is not
        // reliable — on grids without the per-page control Knack keeps the
        // Builder page size (seen 2026-10-05: the customer questionnaire
        // grid view_4031 stayed at 100 of 139, 27 of 50 cameras). So when a
        // listed grid holds fewer records than its total, GET every record
        // straight from the view's endpoint (session auth, 1000 per page,
        // all pages), put them into the grid's model, and fire the grid's
        // render so every consumer reading the model rebuilds with the
        // full set. The native table under it keeps Knack's first page;
        // every listed grid is a data source the bundle renders from.
        forceFullLoad(VIEW_ID);
      });
  });

  /** Server total for a grid: the collection's stamp, else Knack's
   *  "Showing 1-100 of 139" line. null when neither is readable. */
  function totalOf(viewId, data) {
    var t = data && (data.total_records != null ? data.total_records
      : (data.pagination_meta && data.pagination_meta.total_records));
    if (typeof t === 'number') return t;
    var el = document.querySelector('#' + viewId + ' .kn-entries-summary');
    var m = el && (el.textContent || '').match(/of\s+([\d,]+)/i);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }

  // Grids WITHOUT the per-page dropdown (view_4031, the customer
  // questionnaire's install line items). Every lever that asks Knack for a
  // BIGGER page was tried and failed on this grid (2026-10-05..07):
  // rows_per_page on the model + model.fetch(), a request prefilter, and
  // view_XXXX_per_page=1000 in the page address all came back 100 of 142 —
  // with the dropdown disabled in Builder, Knack serves its configured page
  // size, period. What it DOES honor is its own paging (the "Page 1 / Page
  // 2" select). So page through: GET pages 2..N at Knack's own page size on
  // the grid's OWN request address (the model's URL — it carries the
  // parent-record crumb a hand-built one lacks), add the records to the
  // grid's collection, and re-fire the grid's render so every consumer
  // reading the model (the questionnaire cards) rebuilds with the full set.
  // The native table underneath keeps Knack's first page; every listed grid
  // is a data source the bundle renders from. Once per view instance.
  var _paging = {};
  /** The parent-record crumbs a child-page grid is filtered by. Knack does
   *  NOT put them in model.url() — it adds `<parent-slug>_id=<id>` as request
   *  data at send time (seen 2026-10-07: the model URL was bare
   *  `…/records?format=both` and page 2 without the crumb came back EMPTY).
   *  Every form on the scene carries them as hidden `input.crumb`s with the
   *  exact names Knack sends; the page address (slug/id pairs) is the
   *  fallback when the scene has no form. */
  function sceneCrumbs(scene) {
    var out = [], seen = {};
    var sceneEl = document.getElementById('kn-' + scene);
    var inputs = (sceneEl || document).querySelectorAll('input.crumb[name]');
    for (var i = 0; i < inputs.length; i++) {
      var n = inputs[i].getAttribute('name'), v = inputs[i].value;
      if (!n || !v || seen[n]) continue;
      seen[n] = true;
      out.push({ name: n, value: v });
    }
    if (out.length) return out;
    var parts = (window.location.hash || '').split('?')[0].replace(/^#\/?/, '').split('/').filter(Boolean);
    for (var j = 1; j < parts.length; j++) {
      if (/^[a-f0-9]{24}$/i.test(parts[j]) && !/^[a-f0-9]{24}$/i.test(parts[j - 1])) {
        var name = parts[j - 1] + '_id';
        if (!seen[name]) { seen[name] = true; out.push({ name: name, value: parts[j] }); }
      }
    }
    return out;
  }
  function recordsUrl(view, viewId, scene) {
    var base = '';
    try {
      var mu = typeof view.model.url === 'function' ? view.model.url.call(view.model) : view.model.url;
      if (mu) base = String(mu);
    } catch (e) { /* hand-built below */ }
    if (!base) base = Knack.api_url + '/v1/scenes/' + scene + '/views/' + viewId + '/records?format=both';
    base = base.replace(/([?&])(rows_per_page|page)=[^&]*/g, '$1').replace(/[?&]+$/, '').replace(/([?&])&+/g, '$1');
    if (!/[?&]format=/.test(base)) base += (base.indexOf('?') === -1 ? '?' : '&') + 'format=both';
    var crumbs = sceneCrumbs(scene);
    for (var c = 0; c < crumbs.length; c++) {
      if (base.indexOf(crumbs[c].name + '=') !== -1) continue;   // Knack already carries it
      base += '&' + encodeURIComponent(crumbs[c].name) + '=' + encodeURIComponent(crumbs[c].value);
    }
    return base;
  }
  function forceFullLoad(viewId) {
    if (typeof Knack === 'undefined' || !Knack.views) return;
    var view = Knack.views[viewId];
    var data = view && view.model && view.model.data;
    if (!data || !data.models) return;
    var total = totalOf(viewId, data);
    var loaded = data.models.length;
    if (total == null || loaded >= total) return;     // complete (or unknowable)
    if (_paging[viewId] === view) return;             // already paged this instance
    if (!(window.SCW && typeof SCW.knackAjax === 'function')) return;
    var scene = Knack.router && Knack.router.current_scene_key;
    if (!scene || !Knack.api_url) return;
    _paging[viewId] = view;

    var pageSize = loaded;                             // what Knack actually served
    var pages = Math.ceil(total / pageSize);
    var base = recordsUrl(view, viewId, scene);
    var have = {};
    for (var i = 0; i < data.models.length; i++) { var m = data.models[i]; have[(m && (m.id || (m.attributes && m.attributes.id))) || i] = true; }
    console.info('[scw-record-limit] ' + viewId + ': ' + loaded + ' of ' + total + ' loaded — paging through the rest at Knack\'s page size (' +
      pageSize + ' per page, pages 2-' + pages + ') on ' + base);
    var added = [], page = 2;
    function finish() {
      if (!added.length) {
        console.warn('[scw-record-limit] ' + viewId + ': paging returned nothing new (' + data.models.length + ' of ' + total + ')');
        return;
      }
      if (!document.getElementById(viewId) || Knack.views[viewId] !== view) return;   // navigated away
      try {
        if (typeof data.add === 'function') data.add(added, { silent: true });
        else data.models = data.models.concat(added);
        data.total_records = total;
        var mv = view.model.view;
        if (mv) { mv.rows_per_page = LIMIT_NUM; if (mv.source) mv.source.limit = LIMIT_NUM; }
      } catch (e) { console.warn('[scw-record-limit] could not add the paged records to ' + viewId, e); return; }
      console.info('[scw-record-limit] ' + viewId + ': now ' + data.models.length + ' of ' + total + ' — re-rendering');
      // Knack's own render event, so every SCW.onViewRender consumer
      // re-reads the (now complete) model. The run-once guard keeps this
      // from looping: the grid is complete, so the next pass returns early.
      $(document).trigger('knack-view-render.' + viewId, [view]);
    }
    function next() {
      if (page > pages || page > 50) { finish(); return; }
      var url = base + '&rows_per_page=' + pageSize + '&page=' + page;
      SCW.knackAjax({
        url: url, type: 'GET',
        success: function (resp) {
          var recs = (resp && resp.records) || [];
          var fresh = 0;
          for (var r = 0; r < recs.length; r++) { if (recs[r] && recs[r].id && !have[recs[r].id]) { have[recs[r].id] = true; added.push(recs[r]); fresh++; } }
          console.info('[scw-record-limit] ' + viewId + ': page ' + page + ' → ' + recs.length + ' records (' + fresh + ' new)' +
            (resp && resp.total_pages ? ', server says ' + resp.total_pages + ' pages' : ''));
          if (resp && resp.total_pages && resp.total_pages < pages) pages = resp.total_pages;
          if (!recs.length) { finish(); return; }
          page++; next();
        },
        error: function (xhr) {
          console.warn('[scw-record-limit] ' + viewId + ': page ' + page + ' failed (HTTP ' + (xhr && xhr.status) + ') — ' + url,
            xhr && xhr.responseText ? String(xhr.responseText).slice(0, 200) : '');
          finish();
        }
      });
    }
    next();
  }
})();


/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 **************************/
