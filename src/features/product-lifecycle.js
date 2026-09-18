/*** PRODUCT LIFECYCLE — disable cascade + "where is this product quoted?" ****
 *
 * Design + Builder prerequisites: docs/product-retirement.md. Short version:
 *
 *   1. When a product's status is saved as Disabled (edit form or grid inline
 *      edit on the Products page), find every SOW line item carrying that
 *      product whose SOW was quoted in the last 12 months — OR never quoted
 *      but created in the last 12 months — and flip its "is disabled" flag.
 *      Older SOWs are left alone. A confirm modal shows the impact first
 *      (CONFIG.autoApply skips it).
 *   2. On the product details view, a "Where is this product quoted?" button
 *      lists every SOW carrying the product with a proposal in the last 6
 *      months (window selectable) — the stock-running-low check.
 *
 * Everything is view-based through the logged-in session on ONE scene (the
 * Products page): a hidden all-records SOW Line Items grid (filtered by
 * product via the page-scoped records endpoint's `filters` param) joined in
 * memory with a hidden SOW headers grid (created date + latest published
 * proposal date). Writes go through a concurrency-capped retry queue
 * (Knack's ~10 req/s silent-429 limit — see CLAUDE.md).
 *
 * ⚠️ Builder TBDs — every '' below fails OPEN: the module stays inert and
 * logs one console warning naming what's missing the first time a trigger
 * fires. Fill them in as the fields/views are created.
 ***************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    // ── The Products page (one scene hosts the trigger + both data grids) ──
    sceneKey:           '',        // TODO scene_XXXX
    productDetailView:  '',        // TODO view_XXXX — kn-details of ONE product (panel mounts under it)
    productStatusViews: [],        // TODO ['view_XXXX', …] — edit form(s) / grid(s) where field_956 changes

    // ── Product object (object_8) ──
    product: {
      status: 'field_956',         // FLAG_product status
      name:   'field_35',          // INPUT_product name
      sku:    'field_56'           // INPUT_sku
    },
    // Status values (case-insensitive, tags stripped) that count as "disabled".
    disabledStatusValues: ['disabled', 'discontinued', 'inactive', 'retired'],

    // ── Hidden data grids on sceneKey (add both to hide-data-source-views.js) ──
    lineItemsView: '',             // TODO view_XXXX — ALL SOW line items; flag column inline-editable
    sowsView:      '',             // TODO view_XXXX — ALL SOW headers
    lineItem: {
      product:  'field_1949',      // REL_product
      sow:      'field_2154',      // REL_SOW (multi)
      qty:      'field_1964',      // quantity
      disabled: ''                 // TODO field_XXXX — FLAG_is disabled (Yes/No) — the flag the cascade flips
    },
    sow: {
      id:             'field_2122',  // ID (SW-####)
      name:           'field_2126',  // NAME
      created:        '',            // TODO field_XXXX — SYS_create date
      latestProposal: '',            // TODO field_XXXX — MAX(published proposals' create date) formula
      project:        ''             // TODO field_XXXX — REL_project (optional: SOW link + project name)
    },

    windows: { cascadeMonths: 12, impactMonths: 6 },
    autoApply:     false,          // true = flag on disable without the confirm modal
    maxConcurrent: 4,
    maxAttempts:   4,
    baseBackoffMs: 350,
    sowCacheMs:    5 * 60 * 1000,  // SOW headers re-fetched at most every 5 min
    debug:         false
  };

  var STYLE_ID = 'scw-plc-css';
  var NS = '.scwProductLifecycle';
  var P  = 'scw-plc';

  // ── helpers ─────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function stripTags(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function log() {
    if (!CONFIG.debug) return;
    try { console.log.apply(console, ['[scw-plc]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function warnOnce(key, msg) {
    warnOnce._seen = warnOnce._seen || {};
    if (warnOnce._seen[key]) return;
    warnOnce._seen[key] = true;
    console.warn('[scw-plc] ' + msg);
  }
  function isYes(v) {
    if (v === true || v === 1) return true;
    var s = stripTags(v).toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }
  function connIds(attrs, fk) {
    var raw = attrs && attrs[fk + '_raw'];
    var out = [];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) out.push(String(raw[i].id));
    } else if (raw && typeof raw === 'object' && raw.id) {
      out.push(String(raw.id));
    }
    return out;
  }
  function connLabel(attrs, fk) {
    var raw = attrs && attrs[fk + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].identifier) return stripTags(raw[0].identifier);
    if (raw && typeof raw === 'object' && raw.identifier) return stripTags(raw.identifier);
    return stripTags(attrs && attrs[fk]);
  }
  function numOf(attrs, fk) {
    var raw = attrs && attrs[fk + '_raw'];
    var n = parseFloat(raw != null && typeof raw !== 'object' ? raw : stripTags(attrs && attrs[fk]));
    return isFinite(n) ? n : 0;
  }
  /** Knack date → Date|null. Accepts the rendered "07/14/2026 7:03pm", the
   *  raw {date:'07/14/2026', timestamp, unix_timestamp, iso_timestamp}
   *  companion, ISO strings and epoch numbers. Blank → null. */
  function parseKnackDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') { var dn = new Date(v < 1e11 ? v * 1000 : v); return isNaN(dn) ? null : dn; }
    if (typeof v === 'object') {
      if (v.unix_timestamp) return parseKnackDate(Number(v.unix_timestamp));
      if (v.iso_timestamp)  return parseKnackDate(String(v.iso_timestamp));
      if (v.timestamp)      return parseKnackDate(String(v.timestamp));
      if (v.date)           return parseKnackDate(String(v.date));
      return null;
    }
    var s = stripTags(v);
    if (!s) return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function dateOf(attrs, fk) {
    if (!attrs || !fk) return null;
    return parseKnackDate(attrs[fk + '_raw'] != null ? attrs[fk + '_raw'] : attrs[fk]);
  }
  function monthsBefore(n, from) {
    var d = new Date((from || new Date()).getTime());
    d.setMonth(d.getMonth() - n);
    return d;
  }
  function fmtDate(d) {
    if (!d) return '';
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + '/' + d.getFullYear();
  }

  // ── readiness (Builder TBDs fail open) ──────────────────────
  function missingConfig(need) {
    var miss = [];
    if (!CONFIG.sceneKey)      miss.push('sceneKey');
    if (!CONFIG.lineItemsView) miss.push('lineItemsView');
    if (!CONFIG.sowsView)      miss.push('sowsView');
    if (!CONFIG.sow.created)        miss.push('sow.created');
    if (!CONFIG.sow.latestProposal) miss.push('sow.latestProposal');
    if (need === 'write' && !CONFIG.lineItem.disabled) miss.push('lineItem.disabled');
    return miss;
  }
  function ready(need) {
    var miss = missingConfig(need);
    if (miss.length) {
      warnOnce('cfg-' + need, 'inert — fill CONFIG in product-lifecycle.js: ' + miss.join(', ') +
        ' (see docs/product-retirement.md)');
      return false;
    }
    return true;
  }

  // ── data (view-based, page-scoped) ──────────────────────────
  function recordsUrl(viewKey, page, filters) {
    var url = Knack.api_url + '/v1/pages/' + CONFIG.sceneKey + '/views/' + viewKey +
      '/records?rows_per_page=1000&page=' + page;
    if (filters) url += '&filters=' + encodeURIComponent(JSON.stringify(filters));
    return url;
  }
  function recordUrl(viewKey, recordId) {
    return Knack.api_url + '/v1/pages/' + CONFIG.sceneKey + '/views/' + viewKey +
      '/records/' + recordId;
  }
  /** All records of a view (paginated), optionally filtered. */
  function fetchAll(viewKey, filters) {
    return new Promise(function (resolve, reject) {
      var all = [], page = 1, maxPages = 30;
      function next() {
        SCW.knackAjax({
          url: recordsUrl(viewKey, page, filters),
          type: 'GET',
          success: function (resp) {
            var recs = (resp && resp.records) || [];
            all = all.concat(recs);
            var total = (resp && resp.total_pages) || 1;
            if (page < total && page < maxPages) { page++; next(); }
            else resolve(all);
          },
          error: function (xhr) {
            reject(new Error('GET ' + viewKey + ' page ' + page + ' failed (' + (xhr && xhr.status) + ')'));
          }
        });
      }
      next();
    });
  }
  function fetchProductItems(productId) {
    return fetchAll(CONFIG.lineItemsView, {
      match: 'and',
      rules: [{ field: CONFIG.lineItem.product, operator: 'is', value: productId }]
    });
  }
  var _sowCache = { at: 0, byId: null };
  function fetchSowIndex(force) {
    if (!force && _sowCache.byId && Date.now() - _sowCache.at < CONFIG.sowCacheMs) {
      return Promise.resolve(_sowCache.byId);
    }
    return fetchAll(CONFIG.sowsView).then(function (recs) {
      var byId = Object.create(null);
      for (var i = 0; i < recs.length; i++) if (recs[i] && recs[i].id) byId[recs[i].id] = sowFacts(recs[i]);
      _sowCache = { at: Date.now(), byId: byId };
      return byId;
    });
  }

  // ── rules ───────────────────────────────────────────────────
  function sowFacts(rec) {
    var S = CONFIG.sow;
    return {
      id:             String(rec.id || ''),
      sowId:          stripTags(rec[S.id]),
      name:           stripTags(rec[S.name]),
      projectId:      S.project ? (connIds(rec, S.project)[0] || '') : '',
      projectName:    S.project ? connLabel(rec, S.project) : '',
      created:        dateOf(rec, S.created),
      latestProposal: dateOf(rec, S.latestProposal)
    };
  }
  /** Cascade rule (12 mo): quoted recently, or never quoted but created recently. */
  function sowQualifiesCascade(sf, now, months) {
    var cutoff = monthsBefore(months == null ? CONFIG.windows.cascadeMonths : months, now);
    if (sf.latestProposal) return sf.latestProposal >= cutoff;
    return !!sf.created && sf.created >= cutoff;
  }
  /** Impact rule (6 mo): a proposal within the window. */
  function sowQualifiesImpact(sf, now, months) {
    var cutoff = monthsBefore(months == null ? CONFIG.windows.impactMonths : months, now);
    return !!sf.latestProposal && sf.latestProposal >= cutoff;
  }
  /**
   * evaluate(items, sowsById, opts) → {
   *   mode, months, bySow: [{ sow, items:[], qty, alreadyFlagged }], sowsOlder: [...],
   *   items: [qualifying line items not yet flagged], alreadyFlagged: n, orphans: n, total: n }
   * opts.mode 'cascade' | 'impact', opts.months override, opts.now for tests.
   */
  function evaluate(items, sowsById, opts) {
    opts = opts || {};
    var mode   = opts.mode === 'impact' ? 'impact' : 'cascade';
    var now    = opts.now || new Date();
    var months = opts.months != null ? opts.months
               : (mode === 'impact' ? CONFIG.windows.impactMonths : CONFIG.windows.cascadeMonths);
    var qualifies = mode === 'impact' ? sowQualifiesImpact : sowQualifiesCascade;
    var L = CONFIG.lineItem;
    var bySow = Object.create(null), older = Object.create(null);
    var out = [], flagged = 0, orphans = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var sowIds = connIds(it, L.sow);
      if (!sowIds.length) { orphans++; continue; }
      var already = L.disabled ? isYes(it[L.disabled + '_raw'] != null ? it[L.disabled + '_raw'] : it[L.disabled]) : false;
      var hit = false;
      for (var s = 0; s < sowIds.length; s++) {
        var sf = sowsById[sowIds[s]] || { id: sowIds[s], sowId: connLabel(it, L.sow), name: '', created: null, latestProposal: null };
        var ok = (months === Infinity) ? true : qualifies(sf, now, months);
        var bucket = ok ? bySow : older;
        var entry = bucket[sf.id] || (bucket[sf.id] = { sow: sf, items: [], qty: 0, alreadyFlagged: 0 });
        entry.items.push(it);
        entry.qty += numOf(it, L.qty) || 1;
        if (already) entry.alreadyFlagged++;
        if (ok) hit = true;
      }
      if (!hit) continue;
      if (already) { flagged++; continue; }
      out.push(it);
    }
    function list(map) {
      var arr = [];
      for (var k in map) arr.push(map[k]);
      arr.sort(function (a, b) {
        var da = a.sow.latestProposal || a.sow.created, db = b.sow.latestProposal || b.sow.created;
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
      });
      return arr;
    }
    return { mode: mode, months: months, bySow: list(bySow), sowsOlder: list(older),
             items: out, alreadyFlagged: flagged, orphans: orphans, total: items.length };
  }

  // ── writes: capped + retried PUT queue (settle, never reject) ──
  function isTransient(status) {
    return status === 429 || status === 408 || status === 0 || (status >= 500 && status < 600);
  }
  function putOnce(url, body) {
    return new Promise(function (resolve) {
      SCW.knackAjax({
        url: url, type: 'PUT', data: JSON.stringify(body), dataType: 'json',
        success: function () { resolve({ ok: true, status: 200 }); },
        error: function (xhr) { resolve({ ok: false, status: (xhr && xhr.status) || 0 }); }
      });
    });
  }
  function putWithRetry(url, body) {
    var attempt = 0;
    function go() {
      attempt++;
      return putOnce(url, body).then(function (r) {
        if (r.ok || !isTransient(r.status) || attempt >= CONFIG.maxAttempts) return r;
        var delay = CONFIG.baseBackoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
        return new Promise(function (res) { setTimeout(res, delay); }).then(go);
      });
    }
    return go();
  }
  function runQueue(tasks, onProgress) {
    return new Promise(function (resolve) {
      var results = [], running = 0, idx = 0, done = 0;
      if (!tasks.length) { resolve(results); return; }
      function drain() {
        while (running < CONFIG.maxConcurrent && idx < tasks.length) {
          (function (t, i) {
            running++; idx++;
            putWithRetry(t.url, t.body).then(function (r) {
              results[i] = { ok: r.ok, status: r.status, recordId: t.recordId };
              running--; done++;
              if (onProgress) onProgress(done, tasks.length);
              if (done === tasks.length) resolve(results); else drain();
            });
          })(tasks[idx], idx);
        }
      }
      drain();
    });
  }
  /** Flip the flag on every item → tally {ok, failed, failures:[{recordId,status}]}. */
  function flagItems(items, onProgress) {
    var L = CONFIG.lineItem;
    var tasks = [];
    for (var i = 0; i < items.length; i++) {
      var body = {}; body[L.disabled] = 'Yes';
      tasks.push({ url: recordUrl(CONFIG.lineItemsView, items[i].id), body: body, recordId: items[i].id });
    }
    return runQueue(tasks, onProgress).then(function (results) {
      var ok = 0, failures = [];
      for (var r = 0; r < results.length; r++) {
        if (results[r].ok) ok++; else failures.push(results[r]);
      }
      if (failures.length) console.warn('[scw-plc] flag failures:', failures);
      return { ok: ok, failed: failures.length, failures: failures };
    });
  }

  // ── load + evaluate for one product ─────────────────────────
  function analyze(productId, opts) {
    return Promise.all([fetchProductItems(productId), fetchSowIndex(opts && opts.forceSows)])
      .then(function (r) { return evaluate(r[0], r[1], opts); });
  }

  // ── UI ──────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.' + P + '-overlay { position: fixed; inset: 0; z-index: 100000; background: rgba(15,23,42,.55);',
      '  display: flex; align-items: center; justify-content: center; padding: 20px; }',
      '.' + P + '-modal { background: #fff; border-radius: 12px; width: min(720px, 100%); max-height: 90vh;',
      '  display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.35);',
      '  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; }',
      '.' + P + '-hdr { padding: 16px 20px 12px; border-bottom: 1px solid #e5e7eb; }',
      '.' + P + '-eyebrow { font: 700 10.5px/1 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .5px; color: #ed8326; margin-bottom: 6px; }',
      '.' + P + '-title { font-size: 17px; font-weight: 750; color: #0f172a; line-height: 1.25; }',
      '.' + P + '-sub { margin-top: 6px; color: #475569; }',
      '.' + P + '-body { padding: 12px 20px; overflow: auto; flex: 1 1 auto; }',
      '.' + P + '-win { display: flex; gap: 6px; align-items: center; margin: 0 0 10px; }',
      '.' + P + '-win button { font: 600 11.5px/1 system-ui, sans-serif; padding: 6px 10px; border-radius: 6px;',
      '  border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; }',
      '.' + P + '-win button.is-on { background: #0f4c75; color: #fff; border-color: #0f4c75; }',
      '.' + P + '-stats { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 10px; color: #475569; }',
      '.' + P + '-stats b { color: #0f172a; }',
      '.' + P + '-table { width: 100%; border-collapse: collapse; }',
      '.' + P + '-table th { text-align: left; font: 700 10.5px/1.2 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .3px; color: #94a3b8; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }',
      '.' + P + '-table td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }',
      '.' + P + '-table td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.' + P + '-table a { color: #1d4ed8; text-decoration: none; font-weight: 600; }',
      '.' + P + '-table a:hover { text-decoration: underline; }',
      '.' + P + '-muted { color: #94a3b8; font-style: italic; }',
      '.' + P + '-older { margin-top: 12px; }',
      '.' + P + '-older summary { cursor: pointer; font-weight: 600; color: #475569; }',
      '.' + P + '-status { margin-right: auto; font-weight: 600; color: #0f4c75; }',
      '.' + P + '-status.is-err { color: #b91c1c; }',
      '.' + P + '-ftr { display: flex; gap: 8px; align-items: center; justify-content: flex-end;',
      '  padding: 12px 20px 16px; border-top: 1px solid #e5e7eb; background: #f9fafb; border-radius: 0 0 12px 12px; }',
      '.' + P + '-btn { font: 600 12.5px/1.2 system-ui, sans-serif; padding: 8px 14px; border-radius: 7px;',
      '  border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; }',
      '.' + P + '-btn:hover { background: #f1f5f9; }',
      '.' + P + '-btn--primary { background: #0f4c75; border-color: #0f4c75; color: #fff; }',
      '.' + P + '-btn--primary:hover { background: #0c3d5e; }',
      '.' + P + '-btn:disabled { opacity: .55; cursor: not-allowed; }',
      /* details-view launcher */
      '.' + P + '-launch { display: inline-flex; align-items: center; gap: 6px; margin: 8px 0 12px;',
      '  font: 600 12px/1.2 system-ui, sans-serif; padding: 7px 12px; border-radius: 7px;',
      '  border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; }',
      '.' + P + '-launch:hover { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function sowHref(sf) {
    if (!sf.projectId) return '';
    return '#team-calendar/project-dashboard/' + sf.projectId + '/build-sow/' + sf.projectId;
  }
  function sowRowsHtml(list, emptyCopy) {
    if (!list.length) return '<div class="' + P + '-muted">' + esc(emptyCopy) + '</div>';
    var h = '<table class="' + P + '-table"><thead><tr>' +
      '<th>SOW</th><th>Project</th><th>Last quoted</th><th>SOW created</th>' +
      '<th class="num">Items</th><th class="num">Qty</th></tr></thead><tbody>';
    for (var i = 0; i < list.length; i++) {
      var e = list[i], sf = e.sow, href = sowHref(sf);
      var label = (sf.sowId || sf.name || sf.id) + (sf.name && sf.sowId ? ' · ' + sf.name : '');
      h += '<tr>' +
        '<td>' + (href ? '<a href="' + esc(href) + '">' + esc(label) + '</a>' : esc(label)) + '</td>' +
        '<td>' + (sf.projectName ? esc(sf.projectName) : '<span class="' + P + '-muted">—</span>') + '</td>' +
        '<td>' + (sf.latestProposal ? esc(fmtDate(sf.latestProposal)) : '<span class="' + P + '-muted">never</span>') + '</td>' +
        '<td>' + (sf.created ? esc(fmtDate(sf.created)) : '<span class="' + P + '-muted">—</span>') + '</td>' +
        '<td class="num">' + e.items.length + (e.alreadyFlagged ? ' <span class="' + P + '-muted">(' + e.alreadyFlagged + ' flagged)</span>' : '') + '</td>' +
        '<td class="num">' + e.qty + '</td>' +
      '</tr>';
    }
    return h + '</tbody></table>';
  }

  /**
   * openImpactModal({ productId, productName, mode:'cascade'|'impact', months })
   * — loads, evaluates, renders; the primary action flags the qualifying
   * items (cascade rule) through the capped queue.
   */
  function openImpactModal(o) {
    if (!ready('read')) { alert('Product impact check is not configured yet (see console).'); return; }
    injectStyles();
    var mode = o.mode === 'impact' ? 'impact' : 'cascade';
    var months = o.months != null ? o.months
               : (mode === 'impact' ? CONFIG.windows.impactMonths : CONFIG.windows.cascadeMonths);
    var overlay = document.createElement('div');
    overlay.className = P + '-overlay';
    overlay.innerHTML =
      '<div class="' + P + '-modal" role="dialog" aria-modal="true">' +
        '<div class="' + P + '-hdr">' +
          '<div class="' + P + '-eyebrow">' + (mode === 'cascade' ? 'Product disabled' : 'Product impact') + '</div>' +
          '<div class="' + P + '-title">' + esc(o.productName || 'Product') + '</div>' +
          '<div class="' + P + '-sub">' + (mode === 'cascade'
            ? 'Line items on SOWs quoted in the last ' + months + ' months (or never quoted but created in that window) will be flagged as disabled.'
            : 'Every SOW carrying this product with a proposal in the window.') + '</div>' +
        '</div>' +
        '<div class="' + P + '-body"><div class="' + P + '-muted">Loading…</div></div>' +
        '<div class="' + P + '-ftr">' +
          '<span class="' + P + '-status"></span>' +
          '<button type="button" class="' + P + '-btn" data-plc-cancel>' + (mode === 'cascade' ? 'Skip' : 'Close') + '</button>' +
          '<button type="button" class="' + P + '-btn ' + P + '-btn--primary" data-plc-flag disabled>Flag line items</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var body   = overlay.querySelector('.' + P + '-body');
    var status = overlay.querySelector('.' + P + '-status');
    var flagB  = overlay.querySelector('[data-plc-flag]');
    var result = null, busy = false;
    function close() { if (busy) return; if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.querySelector('[data-plc-cancel]').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); }
    });

    function render() {
      var r = result;
      var wins = [6, 12, 24, Infinity];
      var winHtml = '<div class="' + P + '-win"><span>Window:</span>';
      for (var w = 0; w < wins.length; w++) {
        winHtml += '<button type="button" data-plc-win="' + wins[w] + '"' +
          (wins[w] === months ? ' class="is-on"' : '') + '>' +
          (wins[w] === Infinity ? 'All' : wins[w] + ' mo') + '</button>';
      }
      winHtml += '</div>';
      body.innerHTML = winHtml +
        '<div class="' + P + '-stats">' +
          '<span><b>' + r.bySow.length + '</b> SOW' + (r.bySow.length === 1 ? '' : 's') + ' in window</span>' +
          '<span><b>' + (r.items.length + r.alreadyFlagged) + '</b> line item' + ((r.items.length + r.alreadyFlagged) === 1 ? '' : 's') + '</span>' +
          (r.alreadyFlagged ? '<span><b>' + r.alreadyFlagged + '</b> already flagged</span>' : '') +
          '<span><b>' + r.total + '</b> total across all SOWs</span>' +
          (r.orphans ? '<span><b>' + r.orphans + '</b> on no SOW</span>' : '') +
        '</div>' +
        sowRowsHtml(r.bySow, 'No SOWs carry this product in this window.') +
        (r.sowsOlder.length
          ? '<details class="' + P + '-older"><summary>' + r.sowsOlder.length + ' older SOW' +
            (r.sowsOlder.length === 1 ? '' : 's') + ' outside the window (left alone)</summary>' +
            sowRowsHtml(r.sowsOlder, '') + '</details>'
          : '');
      var n = r.items.length;
      flagB.disabled = !n || !CONFIG.lineItem.disabled;
      flagB.textContent = n ? 'Flag ' + n + ' line item' + (n === 1 ? '' : 's') : 'Nothing to flag';
      if (!CONFIG.lineItem.disabled) flagB.title = 'CONFIG.lineItem.disabled is not set — see docs/product-retirement.md';
      var wb = body.querySelectorAll('[data-plc-win]');
      for (var i = 0; i < wb.length; i++) {
        wb[i].addEventListener('click', function () {
          months = parseFloat(this.getAttribute('data-plc-win'));
          load();
        });
      }
    }
    function load() {
      status.className = P + '-status';
      status.textContent = 'Loading…';
      analyze(o.productId, { mode: mode, months: months }).then(function (r) {
        result = r; status.textContent = ''; render();
      }).catch(function (err) {
        status.className = P + '-status is-err';
        status.textContent = 'Couldn’t load: ' + ((err && err.message) || err);
        body.innerHTML = '';
      });
    }
    flagB.addEventListener('click', function () {
      if (!result || !result.items.length || busy) return;
      if (!ready('write')) return;
      busy = true;
      flagB.disabled = true;
      status.className = P + '-status';
      status.textContent = 'Flagging 0 / ' + result.items.length + '…';
      flagItems(result.items, function (done, total) {
        status.textContent = 'Flagging ' + done + ' / ' + total + '…';
      }).then(function (t) {
        busy = false;
        if (!t.failed) {
          status.textContent = 'Flagged ' + t.ok + ' line item' + (t.ok === 1 ? '' : 's') + ' ✓';
        } else if (t.ok) {
          status.className = P + '-status is-err';
          status.textContent = 'Flagged ' + t.ok + ', ' + t.failed + ' failed — see console; run again to retry.';
        } else {
          status.className = P + '-status is-err';
          status.textContent = 'Nothing flagged — ' + t.failed + ' failed (' +
            (t.failures[0] && t.failures[0].status) + '). Is the flag inline-editable on ' + CONFIG.lineItemsView + '?';
        }
        overlay.querySelector('[data-plc-cancel]').textContent = 'Close';
        load();   // re-evaluate so "already flagged" reflects the writes
      });
    });
    load();
  }

  // ── triggers ────────────────────────────────────────────────
  function statusIsDisabled(record) {
    if (!record) return false;
    var fk = CONFIG.product.status;
    var v = record[fk + '_raw'] != null ? record[fk + '_raw'] : record[fk];
    if (Array.isArray(v)) v = v[0];
    var s = stripTags(typeof v === 'object' && v ? (v.identifier || v.label || v.value || '') : v).toLowerCase();
    if (!s) return false;
    for (var i = 0; i < CONFIG.disabledStatusValues.length; i++) {
      if (s === String(CONFIG.disabledStatusValues[i]).toLowerCase()) return true;
    }
    return false;
  }
  function productNameOf(record) {
    return stripTags(record && (record[CONFIG.product.name] || record.identifier || '')) || 'Product';
  }
  function onProductSaved(record) {
    if (!record || !record.id || !statusIsDisabled(record)) return;
    log('product saved as disabled', record.id);
    if (!ready('write')) return;
    if (CONFIG.autoApply) {
      analyze(record.id, { mode: 'cascade' }).then(function (r) {
        if (!r.items.length) return;
        return flagItems(r.items).then(function (t) {
          console.info('[scw-plc] ' + productNameOf(record) + ': flagged ' + t.ok + ' line item(s)' +
            (t.failed ? ', ' + t.failed + ' failed' : ''));
        });
      }).catch(function (err) { console.warn('[scw-plc] auto-cascade failed:', err); });
      return;
    }
    openImpactModal({ productId: record.id, productName: productNameOf(record), mode: 'cascade' });
  }
  function bindStatusViews() {
    var views = CONFIG.productStatusViews || [];
    for (var i = 0; i < views.length; i++) {
      (function (v) {
        $(document)
          .off('knack-form-submit.' + v + NS).on('knack-form-submit.' + v + NS, function (e, view, record) { onProductSaved(record); })
          .off('knack-cell-update.' + v + NS).on('knack-cell-update.' + v + NS, function (e, view, record) { onProductSaved(record); })
          .off('knack-record-update.' + v + NS).on('knack-record-update.' + v + NS, function (e, view, record) { onProductSaved(record); });
      })(views[i]);
    }
  }

  // Product details view → "Where is this product quoted?" launcher.
  function detailProduct() {
    var v = Knack.views && Knack.views[CONFIG.productDetailView];
    var a = v && v.model && (v.model.attributes || v.model);
    var id = (a && a.id) || (v && v.model && v.model.id) || '';
    if (!id) {
      var m = (location.hash || '').match(/[a-f0-9]{24}/gi);
      id = m ? m[m.length - 1] : '';
    }
    var el = document.getElementById(CONFIG.productDetailView);
    var nameEl = el && el.querySelector('.kn-detail.' + CONFIG.product.name + ' .kn-detail-body');
    var name = (a && stripTags(a[CONFIG.product.name])) || (nameEl ? stripTags(nameEl.innerHTML) : '');
    return { id: id, name: name };
  }
  function mountLauncher() {
    var el = document.getElementById(CONFIG.productDetailView);
    if (!el || el.querySelector('.' + P + '-launch')) return;
    injectStyles();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = P + '-launch';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Where is this product quoted?';
    btn.addEventListener('click', function () {
      var p = detailProduct();
      if (!p.id) { alert('Couldn’t read the product record id on this page.'); return; }
      openImpactModal({ productId: p.id, productName: p.name, mode: 'impact' });
    });
    el.insertBefore(btn, el.firstChild);
  }

  if (CONFIG.productStatusViews.length) bindStatusViews();
  if (CONFIG.productDetailView) SCW.onViewRender(CONFIG.productDetailView, mountLauncher, NS);

  // ── public API (console-usable) ─────────────────────────────
  //   SCW.productLifecycle.impact('<productId>')            → opens the 6-month impact modal
  //   SCW.productLifecycle.cascade('<productId>')           → opens the 12-month flag modal
  //   SCW.productLifecycle.analyze('<productId>', {mode})   → Promise<evaluation> (no UI)
  window.SCW = window.SCW || {};
  SCW.productLifecycle = {
    CONFIG:  CONFIG,
    impact:  function (productId, name) { openImpactModal({ productId: productId, productName: name, mode: 'impact' }); },
    cascade: function (productId, name) { openImpactModal({ productId: productId, productName: name, mode: 'cascade' }); },
    analyze: analyze,
    _rules:  { parseKnackDate: parseKnackDate, sowFacts: sowFacts, evaluate: evaluate,
               sowQualifiesCascade: sowQualifiesCascade, sowQualifiesImpact: sowQualifiesImpact,
               statusIsDisabled: statusIsDisabled }
  };
})();
/*** END PRODUCT LIFECYCLE *************************************************/
