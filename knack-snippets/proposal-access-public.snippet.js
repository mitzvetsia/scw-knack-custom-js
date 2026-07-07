/* ============================================================
 * PROPOSAL ACCESS — PUBLIC TOKENIZED VIEW (Knack-side snippet)
 * ============================================================
 *
 * PASTE THIS INTO KNACK'S CUSTOM JS INPUT (Settings → API & Code → JS).
 *
 * Self-contained: depends only on jQuery + Knack (both Knack-default).
 * Reuses the CDN bundle's SCW.pdfExport.getCss() when available so the
 * public rendering matches the internal preview exactly. If the bundle
 * isn't loaded, falls back to an inlined copy of the proposal CSS.
 *
 * WHAT IT DOES
 * ============
 *
 * Customer arrives at:
 *   https://<your-app>.knack.com/<app-path>#project-proposal/?token=<hex>
 *
 *   1. Read `token=` from the hash query string.
 *   2. Apply a runtime filter on a HIDDEN Knack list view so it only
 *      fetches proposals whose access-token field (field_2904) equals
 *      that token. The view is the security boundary — it must be
 *      publicly readable and expose ONLY field_2904 + field_2680
 *      (+ optional gate fields).
 *   3. Wait for the hidden view to re-render, then read records.
 *   4. Require EXACTLY ONE matching record. Zero or many → fallback.
 *      Then run gate checks (active flag, superseded, expiration).
 *   5. Render the snapshot HTML (field_2680) into an <iframe> inserted
 *      as a sibling of the hidden list view, exactly mirroring how
 *      src/features/published-proposal-render.js renders the internal
 *      preview on scene_1279/view_3813.
 *   6. On any failure path render a generic fallback — never leak
 *      which check failed.
 *
 * Why an iframe? The proposal CSS uses generic selectors (body, table,
 * .kn-table, .l1-header, …) that would clobber Knack's own UI if
 * dropped into the parent page. The internal preview uses an iframe
 * for exactly this reason — mirror it.
 * ============================================================ */

(function () {
  'use strict';

  // ---- CONFIG (edit these) ----------------------------------------------
  var SCENE_ID         = 'scene_1321';
  var LOOKUP_VIEW_ID   = 'view_3952';
  var TOKEN_FIELD      = 'field_2904';
  var HTML_FIELD       = 'field_2680';
  var HASH_ROUTE       = 'project-proposal';

  // Proposal lifecycle status — multi-select on the proposal record.
  // Only proposals whose status set INTERSECTS STATUS_ALLOWED are
  // viewable on the public page. Anything else (including blank)
  // produces the generic "not available" fallback.
  //   field_2658 values: "Published" | "Superseded" | "Archived"
  // Expose field_2658 on the lookup view (view_3952) for this gate
  // to work.
  var STATUS_FIELD     = 'field_2658';
  var STATUS_ALLOWED   = ['Published'];

  var EXPIRATION_FIELD = 'field_2659';

  // Fails closed when true — leave false until OTP UI lands.
  var OTP_REQUIRED     = false;

  // ── CTA buttons surfaced inside the iframe ─────────────────────────
  // Each entry's `gate(attrs)` is evaluated against the proposal
  // record's attributes; matching entries have their source view's
  // anchor(s) mirrored as styled buttons in the iframe's CTA bar.
  // The source views are hidden on the parent page so the same link
  // doesn't render twice.
  //
  // Required fields exposed on the public lookup view (view_3952):
  //   field_2746  FLAG_good faith estimate          → site-survey gate
  //   field_2747  FLAG_final proposal               → accept-proposal gate
  //   field_2748  FLAG_sow only                     → site-survey gate
  //   field_2907  FLAG_SOWs with Survey Requested   → site-survey gate
  //                (Text-formula field on the proposal that pulls from
  //                 the connected SOW, which in turn pulls field_2728
  //                 from the project. If > 0, hides the Site Survey
  //                 button. Treated as 0 if not exposed.)
  //
  // Source view IDs on the public scene:
  //   view_3953  "I'm Ready for a Site Survey"
  //   view_3956  "Accept Proposal"
  var CR_COUNT_FIELD = 'field_2907';
  var CTA_CONFIGS = [
    {
      viewId: 'view_3953',   // I'm Ready for a Site Survey
      gate: function (attrs) {
        if (readCrCount(attrs) > 0) return false;
        return isYes(attrs.field_2746) || isYes(attrs.field_2746_raw)
            || isYes(attrs.field_2748) || isYes(attrs.field_2748_raw);
      }
    },
    {
      viewId: 'view_3956',   // Accept Proposal
      // The accept page (#project-proposal/accept-proposal3) is a Knack
      // record-scoped CHILD page of the proposal. On the public token flow
      // there's no record in route context, so Knack renders the link WITHOUT
      // the proposal id — the accept form then opens connectionless. Splice the
      // proposal record id on as the final path segment so Knack scopes the
      // child page to it and the connected Add form auto-fills the connection.
      appendRecordId: true,
      gate: function (attrs) {
        return isYes(attrs.field_2747) || isYes(attrs.field_2747_raw);
      }
    }
  ];

  // Customer-facing fallback. Intentionally vague.
  var FALLBACK_MESSAGE =
    'This proposal link is no longer active or could not be found. ' +
    'Please contact your SCW representative.';

  // -----------------------------------------------------------------------
  // Implementation. Shouldn't need editing below this line.
  // -----------------------------------------------------------------------

  // ── Boot-time URL-filter priming ───────────────────────────────────────
  // The lookup view's source criteria has no token rule, so Knack's FIRST
  // fetch would pull a full page of published proposals (each with its
  // multi-MB field_2680 snapshot) and render them into hidden DOM before
  // our runtime filter refetches the right one — the "link takes 30s+ to
  // open" problem. New links carry the token as a native Knack URL filter
  // (view_3952_filters=…) so that first fetch is already server-filtered;
  // this shim rewrites OLD-format links (?token= only) to the new format
  // BEFORE Knack's router boots, so every link ever sent gets the fast
  // path. location.replace keeps it out of history (back button works).
  (function primeUrlFilter() {
    try {
      var hash = window.location.hash || '';
      var routeRe = new RegExp('^#' + HASH_ROUTE + '(?:/|$)');
      if (!routeRe.test(hash)) return;
      if (hash.indexOf(LOOKUP_VIEW_ID + '_filters=') !== -1) return;  // already primed
      var m = hash.match(/[?&]token=([0-9a-fA-F]{16,})/);
      if (!m) return;
      var f = encodeURIComponent(JSON.stringify([
        { field: TOKEN_FIELD, operator: 'is', value: m[1] }
      ]));
      var glue = hash.indexOf('?') === -1 ? '?' : '&';
      window.location.replace(
        window.location.pathname + window.location.search +
        hash + glue + LOOKUP_VIEW_ID + '_filters=' + f);
    } catch (e) { /* fall through — page still works, just slower */ }
  })();

  var STYLE_ID  = 'scw-proposal-access-css';
  var IFRAME_ID = 'scw-proposal-access-frame';
  var FALLBACK_ID = 'scw-proposal-access-fallback';
  var NS        = '.scwProposalAccessSnippet';
  var STATE_KEY = '__scwProposalAccessState';

  // ---- Page-level styles (NOT the proposal CSS — that goes in the iframe)
  // Hides the raw list view that Knack would otherwise paint, hides the
  // CTA source views (their anchors are re-injected inside the iframe),
  // and styles the loading/fallback panels.
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var ctaHide = CTA_CONFIGS.map(function (c) {
      return '#' + c.viewId + ' { display: none !important; }';
    }).join('\n');
    var css = [
      '#' + LOOKUP_VIEW_ID + ',',
      '#' + LOOKUP_VIEW_ID + ' .view-header,',
      '#' + LOOKUP_VIEW_ID + ' .kn-records-nav,',
      '#' + LOOKUP_VIEW_ID + ' .kn-list-content {',
      '  display: none !important;',
      '  visibility: hidden !important;',
      '  height: 0 !important;',
      '  overflow: hidden !important;',
      '}',
      ctaHide,
      '#' + IFRAME_ID + ' {',
      '  display: block;',
      '  width: 100%;',
      '  margin: 0;',
      '  border: 0;',
      '  background: #fff;',
      '  min-height: 400px;',
      '}',
      '#' + FALLBACK_ID + ' {',
      '  max-width: 560px;',
      '  margin: 64px auto;',
      '  padding: 28px;',
      '  background: #f8fafc;',
      '  border: 1px solid #e2e8f0;',
      '  border-radius: 10px;',
      '  text-align: center;',
      '  box-shadow: 0 2px 12px rgba(0,0,0,.04);',
      '  font: 14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;',
      '  color: #475569;',
      '}',
      '#' + FALLBACK_ID + ' .scw-pa-title {',
      '  font-weight: 700;',
      '  font-size: 18px;',
      '  color: #0f172a;',
      '  margin-bottom: 8px;',
      '}',
      '#' + FALLBACK_ID + ' .scw-pa-loading {',
      '  font-style: italic;',
      '  color: #475569;',
      '}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Hash parsing -----------------------------------------------------
  function readTokenFromHash() {
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash) return '';
    var routeRe = new RegExp('^' + HASH_ROUTE + '(?:/|$)');
    if (!routeRe.test(hash)) return '';
    var qIdx = hash.indexOf('?');
    if (qIdx === -1) return '';
    var qs = hash.substring(qIdx + 1);
    var pairs = qs.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split('=');
      if (decodeURIComponent(kv[0] || '') === 'token') {
        return decodeURIComponent(kv[1] || '').trim();
      }
    }
    return '';
  }

  function isPlausibleToken(t) {
    return typeof t === 'string' && t.length >= 16 && /^[0-9a-fA-F]+$/.test(t);
  }

  // ---- Fallback / loading panels ---------------------------------------
  function ensureFallbackNode() {
    var el = document.getElementById(FALLBACK_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = FALLBACK_ID;
    // Insert next to the (hidden) lookup view's container.
    var view = document.getElementById(LOOKUP_VIEW_ID);
    if (view && view.parentNode) view.parentNode.insertBefore(el, view.nextSibling);
    else (document.querySelector('.kn-scene') || document.body).appendChild(el);
    return el;
  }

  function renderLoading() {
    removeIframe();
    ensureFallbackNode().innerHTML =
      '<div class="scw-pa-loading">Loading your proposal&hellip;</div>';
  }

  function renderFallback() {
    removeIframe();
    ensureFallbackNode().innerHTML =
      '<div class="scw-pa-title">Proposal Unavailable</div>' +
      '<div>' + escapeHtml(FALLBACK_MESSAGE) + '</div>';
  }

  function removeFallback() {
    var el = document.getElementById(FALLBACK_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function removeIframe() {
    var el = document.getElementById(IFRAME_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // ---- Apply runtime filter on the hidden lookup view ------------------
  function applyLookupFilter(token) {
    var view = window.Knack && Knack.views && Knack.views[LOOKUP_VIEW_ID];
    if (!view || !view.model) return false;
    var filterSpec = {
      match: 'and',
      rules: [ { field: TOKEN_FIELD, operator: 'is', value: token } ]
    };
    try {
      if (typeof view.model.setFilters === 'function') {
        view.model.setFilters(filterSpec);
      } else if (view.model.view) {
        view.model.view.filters = filterSpec;
      }
      view.model.fetch();
      return true;
    } catch (e) {
      console.warn('[proposal-access] Filter/fetch failed', e);
      return false;
    }
  }

  function readRecordsFromView(viewId) {
    try {
      var view = Knack.views[viewId];
      var data = view && view.model && view.model.data;
      if (!data) return [];
      var models = data.models || data;
      if (!Array.isArray(models)) return [];
      var out = [];
      for (var i = 0; i < models.length; i++) {
        var attrs = (models[i] && models[i].attributes) || models[i];
        if (attrs) out.push(attrs);
      }
      return out;
    } catch (e) { return []; }
  }

  // ---- Gate checks -----------------------------------------------------
  function passesGates(attrs) {
    if (STATUS_FIELD && STATUS_ALLOWED && STATUS_ALLOWED.length) {
      if (!statusMatches(attrs, STATUS_FIELD, STATUS_ALLOWED)) return false;
    }
    if (EXPIRATION_FIELD) {
      var raw = attrs[EXPIRATION_FIELD + '_raw'];
      var dateStr =
        (raw && (raw.iso_timestamp || raw.date || raw.date_formatted)) ||
        attrs[EXPIRATION_FIELD];
      if (!dateStr) return false;
      var expiry = new Date(dateStr);
      if (isNaN(expiry.getTime())) return false;
      var today = new Date(); today.setHours(0, 0, 0, 0);
      if (expiry < today) return false;
    }
    return true;
  }

  function isYes(v) {
    if (v === true) return true;
    if (typeof v === 'string') return /^(yes|true)$/i.test(v.trim());
    return false;
  }

  // Knack multi-select fields come back as an array on `_raw` and a
  // comma-separated string on the plain key. Normalize, then look for
  // any intersection with the allowed-list (case-insensitive). An
  // empty / missing value is treated as "not allowed" — only an
  // explicit match passes.
  function statusMatches(attrs, fieldKey, allowed) {
    var allowedLower = allowed.map(function (s) { return String(s).trim().toLowerCase(); });
    var raw = attrs[fieldKey + '_raw'];
    var values = [];
    if (Array.isArray(raw)) {
      values = raw.map(function (v) { return String(v == null ? '' : v); });
    } else if (raw != null) {
      values = String(raw).split(',');
    } else {
      var plain = attrs[fieldKey];
      if (plain != null) values = String(plain).split(',');
    }
    for (var i = 0; i < values.length; i++) {
      var v = values[i].trim().toLowerCase();
      if (v && allowedLower.indexOf(v) !== -1) return true;
    }
    return false;
  }

  // ---- HTML cleanup ----------------------------------------------------
  // Same regex set as src/features/published-proposal-render.js. Knack
  // inserts spurious <br> tags between block elements when storing
  // rich-text fields; strip them so spacing matches the print/PDF view.
  function cleanFragment(html) {
    html = String(html).replace(/^<span>([\s\S]*)<\/span>$/i, '$1');
    html = html.replace(/<br\s*\/?>\s*(?=<(?:div|table|thead|tbody|tfoot|tr|section|\/div|\/table|\/thead|\/tbody|\/tfoot|\/tr|\/section))/gi, '');
    html = html.replace(/(?:(?:<\/div>|<\/table>|<\/section>|<\/tr>|<\/tbody>|<\/tfoot>|<\/thead>))\s*<br\s*\/?>/gi, function (m) {
      return m.replace(/<br\s*\/?>/gi, '');
    });
    html = html.replace(/^(\s*<br\s*\/?>\s*)+/i, '').replace(/(\s*<br\s*\/?>\s*)+$/i, '');
    html = html.replace(/<br\s*\/?>\s*<\/div>/gi, '</div>');
    html = html.replace(/<br\s*\/?>\s*<\/td>/gi, '</td>');
    html = html.replace(/\(([A-Z]-\d+(?:,\s*[A-Z]-\d+)*)\)/g, '<span class="connected-devices">($1)</span>');
    return html;
  }

  // ---- Resolve proposal CSS (bundle-first, inline fallback) ------------
  // The CDN bundle exposes SCW.pdfExport.getCss(); that's our preferred
  // source so the public render matches the internal preview exactly.
  // If the bundle isn't loaded on this scene, fall back to PROPOSAL_CSS
  // inlined below (kept in sync with proposal-pdf-export.js's getPdfCss).
  function resolveCss() {
    try {
      if (window.SCW && window.SCW.pdfExport &&
          typeof window.SCW.pdfExport.getCss === 'function') {
        var bundleCss = window.SCW.pdfExport.getCss();
        if (bundleCss) return bundleCss;
      }
    } catch (e) { /* fall through */ }
    return PROPOSAL_CSS;
  }

  // ---- Build full HTML doc for the iframe ------------------------------
  function buildFullHtml(fragment) {
    var css = resolveCss();
    // On-screen readability overrides — same set published-proposal-render
    // uses. Base CSS is print-tuned at ~11px; on screens we want ~14px.
    var overrides = [
      'body { font-size: 14px; }',
      '.detail-label, .detail-value { font-size: 14px; }',
      '.richtext-content { font-size: 14px; }',
      '.l3-row td:first-child { font-size: 15px; }',
      '.l4-row td { font-size: 14px; padding-left: 40px; letter-spacing: 0.3px; line-height: 1.6; }',
      '.l4-row td.col-qty, .l4-row td.col-cost { font-size: 14px; }',
      '.connected-devices { font-size: 13px; }',
      '.product-table thead th { font-size: 11px; }',
      '.l2-header { font-size: 15px; }'
    ].join('\n');

    return [
      '<!DOCTYPE html>',
      '<html><head><meta charset="utf-8"><title>Proposal</title>',
      '<style>', css, overrides, '</style>',
      '</head><body>',
      fragment,
      '</body></html>'
    ].join('\n');
  }

  // ---- Render the proposal into an iframe ------------------------------
  // Mirrors src/features/published-proposal-render.js's renderProposal:
  // iframe placed as a SIBLING of the hidden lookup view, doc.write into
  // it, triple-resize to content height.
  function renderProposal(attrs) {
    var html = attrs[HTML_FIELD + '_raw'] || attrs[HTML_FIELD] || '';
    if (!html) { renderFallback(); return; }

    var viewEl = document.getElementById(LOOKUP_VIEW_ID);
    if (!viewEl || !viewEl.parentNode) { renderFallback(); return; }

    removeFallback();
    removeIframe();

    var fullHtml = buildFullHtml(cleanFragment(html));

    var iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');
    viewEl.parentNode.insertBefore(iframe, viewEl.nextSibling);

    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(fullHtml);
    doc.close();

    function resize() {
      try {
        var b = doc.body, d = doc.documentElement;
        if (b && d) {
          var h = Math.max(b.scrollHeight, b.offsetHeight, d.scrollHeight, d.offsetHeight);
          iframe.style.height = (h + 40) + 'px';
        }
      } catch (e) { /* ignore */ }
    }
    setTimeout(resize, 300);
    setTimeout(resize, 1000);
    setTimeout(resize, 3000);

    // Live expiration date — the snapshot HTML in field_2680 bakes in
    // whatever expiration was on the SOW at publish time. After
    // publish, EXPIRATION_FIELD (field_2659) can be edited; those
    // edits must show on the public page without re-publishing the
    // whole quote. patchExpirationDate finds the snapshot's
    // "Expiration Date" row and overwrites its value cell.
    setTimeout(function () { patchExpirationDate(iframe, attrs); }, 250);
    setTimeout(function () { patchExpirationDate(iframe, attrs); }, 1200);

    // CTA bar injection — mirrors src/features/published-proposal-render
    // injectCtaIntoIframe. Re-run after layout settles AND after the
    // CTA source views likely rendered (they're sibling views on the
    // same scene; render-order isn't guaranteed).
    setTimeout(function () { injectCtaIntoIframe(iframe, attrs, resize); }, 350);
    setTimeout(function () { injectCtaIntoIframe(iframe, attrs, resize); }, 1200);
  }

  // ---- Live expiration date patch (field_2659 → snapshot row) ---------
  // Mirrors src/features/published-proposal-render.js's
  // patchExpirationDate. Reads field_2659 off the proposal record's
  // attrs (always live — the snippet just refetched the record) and
  // overwrites the matching detail-table row inside the iframe.
  function readLiveExpirationDate(attrs) {
    if (!attrs || !EXPIRATION_FIELD) return '';
    var raw = attrs[EXPIRATION_FIELD + '_raw'];
    if (raw && typeof raw === 'object') {
      if (raw.date_formatted) return String(raw.date_formatted).trim();
      if (raw.date)            return String(raw.date).trim();
    }
    var v = attrs[EXPIRATION_FIELD];
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').trim();
  }

  function patchExpirationDate(iframe, attrs) {
    if (!iframe) return;
    var doc;
    try { doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document); }
    catch (e) { return; }
    if (!doc || !doc.body) return;

    var live = readLiveExpirationDate(attrs);
    if (!live) return;

    // Idempotent — skip if a previous run already stamped the row.
    if (doc.body.querySelector('.detail-value[data-scw-live-exp]')) return;

    var labels = doc.body.querySelectorAll('td.detail-label');
    for (var i = 0; i < labels.length; i++) {
      var labelText = (labels[i].textContent || '').trim().toLowerCase();
      // Match "Expiration Date" / "Expires" — anything starting with "expir".
      // Overwriting also cleans up an un-replaced _Expiration_Date_ token
      // if Make's Replace step ever misses it.
      if (!/^expir/.test(labelText)) continue;
      var valueCell = labels[i].nextElementSibling;
      if (valueCell && valueCell.classList && valueCell.classList.contains('detail-value')) {
        valueCell.textContent = live;
        valueCell.setAttribute('data-scw-live-exp', '1');
      }
      return;
    }

    // No expiration row in the snapshot at all — proposals published while
    // the SOW-side date was blank (the payload scraper drops empty detail
    // fields; the token row only ships on NEW publishes). Insert the row so
    // the live field_2659 value still reaches the customer: right after the
    // Proposal ID row when present, else at the top of the first
    // detail-table. Mirrors published-proposal-render.js.
    var table = doc.body.querySelector('table.detail-table');
    if (!table) return;
    var tr = doc.createElement('tr');
    var labelTd = doc.createElement('td');
    labelTd.className = 'detail-label';
    labelTd.textContent = 'Expiration Date';
    var valueTd = doc.createElement('td');
    valueTd.className = 'detail-value';
    valueTd.setAttribute('data-scw-live-exp', '1');
    valueTd.textContent = live;
    tr.appendChild(labelTd);
    tr.appendChild(valueTd);

    var anchorRow = null;
    for (var p = 0; p < labels.length; p++) {
      if (/^proposal\s*id/i.test((labels[p].textContent || '').trim())) {
        anchorRow = labels[p].parentNode;
        break;
      }
    }
    if (anchorRow && anchorRow.parentNode) {
      anchorRow.parentNode.insertBefore(tr, anchorRow.nextSibling);
    } else {
      var tbody = table.tBodies[0] || table;
      tbody.insertBefore(tr, tbody.firstChild);
    }
  }

  // ---- CTA gathering / injection (mirror internal renderer) ------------
  function readCrCount(attrs) {
    if (!attrs) return 0;
    var raw = attrs[CR_COUNT_FIELD + '_raw'];
    var val = (raw != null) ? raw : attrs[CR_COUNT_FIELD];
    var n = Number(String(val == null ? '' : val).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function readLinksFromView(viewId) {
    var v = document.getElementById(viewId);
    if (!v) return [];
    var anchors = v.querySelectorAll('a.kn-link, a.kn-button, a.knMenuLink');
    var out = [];
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var href  = a.getAttribute && a.getAttribute('href');
      if (label) out.push({ label: label, href: href || '' });
    }
    return out;
  }

  // Append a Knack record id as the final hash path segment, e.g.
  //   #project-proposal/accept-proposal3  →  …/accept-proposal3/<id>
  // Idempotent — won't double-append if the id is already the last segment.
  function appendRecordIdToHref(href, recordId) {
    if (!href || !recordId) return href;
    if (new RegExp('/' + recordId + '/?$').test(href)) return href;  // already there
    return href.replace(/\/?$/, '/') + recordId;
  }

  function gatherCtaLinks(attrs) {
    var all = [];
    var recordId = attrs && attrs.id;
    for (var i = 0; i < CTA_CONFIGS.length; i++) {
      var cfg = CTA_CONFIGS[i];
      var ok;
      try { ok = cfg.gate(attrs); } catch (e) { ok = false; }
      if (!ok) continue;
      var links = readLinksFromView(cfg.viewId);
      for (var j = 0; j < links.length; j++) {
        if (cfg.appendRecordId && recordId) {
          links[j].href = appendRecordIdToHref(links[j].href, recordId);
        }
        all.push(links[j]);
      }
    }
    return all;
  }

  function injectCtaIntoIframe(iframe, attrs, onAfter) {
    if (!iframe) return;
    var doc;
    try { doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document); }
    catch (e) { return; }
    if (!doc || !doc.body) return;
    if (doc.body.querySelector('.scw-cta-bar')) return;   // already injected

    var links = gatherCtaLinks(attrs);
    if (!links.length) return;

    var firstTitle = doc.body.querySelector('.view-title');
    if (!firstTitle) return;

    var bar = doc.createElement('div');
    bar.className = 'scw-cta-bar';
    bar.style.cssText =
      'margin: 16px 0 24px 0; padding: 14px 18px;' +
      'background: #fff5e6; border: none; border-radius: 8px;' +
      'display: flex; gap: 10px; flex-direction: column; align-items: stretch;';

    for (var i = 0; i < links.length; i++) {
      var btn = doc.createElement('a');
      btn.textContent = links[i].label;
      if (links[i].href) btn.setAttribute('href', links[i].href);
      // target=_top so the link navigates the parent window — _self
      // would scope the navigation to the iframe and break Knack
      // hash routing.
      btn.setAttribute('target', '_top');
      btn.style.cssText =
        'display: block; width: 100%; box-sizing: border-box;' +
        'padding: 10px 22px; font-size: 15px; font-weight: 400;' +
        'background: orange; color: #fff; text-decoration: none;' +
        'border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,.18);' +
        'text-align: center;';
      bar.appendChild(btn);
    }

    firstTitle.parentNode.insertBefore(bar, firstTitle);
    if (typeof onAfter === 'function') onAfter();
  }

  // ---- Main flow --------------------------------------------------------
  function handleSceneRender() {
    injectStyles();

    var token = readTokenFromHash();
    if (!isPlausibleToken(token)) { renderFallback(); return; }

    window[STATE_KEY] = { token: token, pending: true };
    renderLoading();
    applyLookupFilter(token);
  }

  function handleLookupRender() {
    injectStyles();
    var state = window[STATE_KEY];
    if (!state || !state.pending) {
      var token = readTokenFromHash();
      if (isPlausibleToken(token)) {
        window[STATE_KEY] = { token: token, pending: true };
        renderLoading();
        applyLookupFilter(token);
      }
      return;
    }

    var records = readRecordsFromView(LOOKUP_VIEW_ID);
    if (!records || records.length !== 1) {
      renderFallback();
      state.pending = false;
      return;
    }

    var attrs = records[0];
    if (!passesGates(attrs)) { renderFallback(); state.pending = false; return; }
    if (OTP_REQUIRED) { renderFallback(); state.pending = false; return; }

    try { renderProposal(attrs); }
    catch (e) {
      console.warn('[proposal-access] Render failed', e);
      renderFallback();
    }
    state.pending = false;
  }

  // ---- Bindings ---------------------------------------------------------
  injectStyles();

  $(document)
    .off('knack-scene-render.' + SCENE_ID + NS)
    .on('knack-scene-render.' + SCENE_ID + NS, function () {
      handleSceneRender();
    });

  $(document)
    .off('knack-view-render.' + LOOKUP_VIEW_ID + NS)
    .on('knack-view-render.' + LOOKUP_VIEW_ID + NS, function () {
      handleLookupRender();
    });

  $(window)
    .off('hashchange' + NS)
    .on('hashchange'  + NS, function () {
      var hash = (window.location.hash || '').replace(/^#/, '');
      if (new RegExp('^' + HASH_ROUTE + '(?:/|$)').test(hash)) {
        handleSceneRender();
      }
    });

  // -----------------------------------------------------------------------
  // Inlined proposal CSS — fallback when SCW.pdfExport.getCss() isn't on
  // the page (CDN bundle not loaded). Mirrors src/features/
  // proposal-pdf-export.js getPdfCss().
  // -----------------------------------------------------------------------
  var PROPOSAL_CSS = [
    '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap");',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body { font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif; color: #333; font-size: 11px; line-height: 1.4; margin: 0; padding: 14px; }',
    '.view-title { font-size: 20px; font-weight: 800; color: #07467c; margin: 24px 0 8px 0; padding-bottom: 4px; border-bottom: 3px solid #07467c; }',
    '.view-title:first-child { margin-top: 0; }',
    '.detail-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }',
    '.detail-table tr { border-bottom: 1px solid #f0f0f0; }',
    '.detail-label { font-weight: 600; color: #07467c; padding: 5px 12px 5px 0; white-space: nowrap; vertical-align: top; width: 180px; font-size: 11px; }',
    '.detail-value { padding: 5px 0; color: #333; font-size: 11px; }',
    '.detail-label-none { margin-bottom: 4px; color: #07467c; }',
    '.detail-label-none h1 { font-size: 22px; font-weight: 700; margin: 0 0 2px 0; color: #07467c; }',
    '.detail-label-none h2 { font-size: 16px; font-weight: 400; margin: 0 0 2px 0; color: #07467c; }',
    '.detail-label-none span { color: #07467c; }',
    '.richtext-content { margin-bottom: 16px; line-height: 1.5; color: #333; font-size: 11px; }',
    '.richtext-content p { margin: 0 0 6px 0; }',
    '.richtext-content img { max-width: 100%; height: auto; }',
    '.richtext-content hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }',
    '.l1-section { margin-bottom: 12px; }',
    '.l1-header { font-size: 18px; font-weight: 200; color: #07467c; padding: 20px 0 6px 0; border-bottom: 3px solid #07467c; margin-bottom: 4px; }',
    '.l2-header { font-size: 13px; font-weight: 400; color: #07467c; background: aliceblue; padding: 5px 10px; margin-top: 12px; margin-bottom: 0; }',
    '.product-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }',
    '.product-table thead th { font-size: 9px; font-weight: 600; color: #999; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 8px; border-bottom: 1px solid #ddd; }',
    '.product-table th.col-desc { text-align: left; }',
    '.product-table .col-qty { text-align: center; width: 50px; }',
    '.product-table .col-cost { text-align: right; width: 100px; }',
    '.l3-row td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; font-weight: 400; color: #07467c; }',
    '.l3-row td:first-child { font-size: 12px; }',
    '.l3-row td.col-qty, .l3-row td.col-cost { font-weight: 600; }',
    '.l3-row td.mounting { padding-left: 40px; font-size: 11px; }',
    '.connected-devices { display: inline; margin-left: 4px; color: orange; font-weight: 700; font-size: 10px; }',
    '.l4-row td { padding: 3px 8px 3px 40px; color: #555; font-size: 10px; font-weight: 300; border-bottom: 1px solid #f8f8f8; }',
    '.l4-row td p { margin: 0; }',
    '.l4-row td.col-qty, .l4-row td.col-cost { padding-left: 8px; font-weight: 600; color: #07467c; }',
    '.l2-footer td { font-weight: 800 !important; color: #07467c; background: aliceblue; padding: 6px 8px; text-align: center; border-bottom: none; }',
    '.l2-footer td:first-child { text-align: right; }',
    '.l2-footer td:last-child { text-align: right; }',
    '.l1-footer { margin-top: 14px; padding-top: 8px; border-top: 3px solid #07467c; }',
    '.l1-footer-title { text-align: right; font-weight: 700; color: #07467c; font-size: 13px; margin-bottom: 4px; }',
    '.l1-footer-line { display: flex; justify-content: flex-end; gap: 20px; padding: 2px 0; }',
    '.l1-footer-label { font-weight: 600; opacity: 0.85; min-width: 80px; text-align: right; }',
    '.l1-footer-value { font-weight: 700; min-width: 120px; text-align: right; }',
    '.l1-line--sub .l1-footer-label, .l1-line--sub .l1-footer-value { color: #07467c; }',
    '.l1-line--disc .l1-footer-label, .l1-line--disc .l1-footer-value { color: orange; }',
    '.l1-line--final .l1-footer-label, .l1-line--final .l1-footer-value { color: #07467c; font-weight: 900; }',
    '.l1-line--final .l1-footer-value { font-size: 15px; }',
    '.l1-line--sub, .l1-line--disc { padding-top: 0; padding-bottom: 0; }',
    '.project-totals { margin-top: 30px; }',
    '.pt-title { font-size: 22px; font-weight: 600; color: #07467c; padding-bottom: 8px; border-bottom: 3px solid #07467c; margin-bottom: 6px; }',
    '.pt-line { display: flex; justify-content: flex-end; gap: 24px; padding: 3px 0; }',
    '.pt-label { font-weight: 600; min-width: 160px; text-align: right; }',
    '.pt-value { font-weight: 700; min-width: 130px; text-align: right; }',
    '.pt-line--sub .pt-label, .pt-line--sub .pt-value { color: #07467c; }',
    '.pt-line--disc .pt-label, .pt-line--disc .pt-value { color: orange; }',
    '.pt-line--final .pt-label, .pt-line--final .pt-value { color: #07467c; font-weight: 900; }',
    '.pt-line--final:last-child .pt-label { font-size: 17px; }',
    '.pt-line--final:last-child .pt-value { font-size: 19px; }',
    '.report-table-wrap { margin-top: 30px; }',
    '.report-table-wrap table { width: 100%; border-collapse: collapse; }',
    '.report-table-wrap thead th { font-size: 10px; font-weight: 600; color: #07467c; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; border-bottom: 2px solid #07467c; text-align: left; }',
    '.report-table-wrap tbody td { padding: 5px 8px; font-size: 11px; color: #333; border-bottom: 1px solid #f0f0f0; }',
    '.report-table-wrap .kn-table_summary td { font-weight: 700; color: #07467c; border-top: 2px solid #07467c; padding-top: 8px; }',
    '.append-image-title { font-size: 18px; font-weight: 800; color: #07467c; margin: 24px 0 12px 0; padding-bottom: 6px; border-bottom: 3px solid #07467c; text-align: left; }',
    '.append-image { display: block; width: 100%; max-width: 100%; max-height: 9.5in; height: auto; margin: 12px auto; object-fit: contain; }'
  ].join('\n');
})();
