/*** SURVEY REQUEST HEADER — custom page header (view_3504 / 3825 / 3538) ****
 *
 * The subcontractor "Site Survey Request Details" page leads with three native
 * Knack views that load with visible layout thrash (the kn-details label-width
 * JS sets inline min/max-width AFTER first paint, and Knack emits
 * `flex-basis: undefined%`, so the block reflows on every render). We hide that
 * native markup from first paint (CSS) and render our own STABLE cards in its
 * place, scraping the values straight out of the (hidden) native DOM:
 *
 *   view_3504  → header card: site title · Status chip · REQ_ID
 *   view_3825  → details card: Address · Edit button · Instructions /
 *                Other Notes / Survey Field Form (non-empty only)
 *   view_3826  → status card: a Requested → Scheduled → Completed → Bid
 *                Delivered date timeline (Status + ClickUp ride in the header)
 *   view_3568  → Survey POC card: Name · Cell (tel) · Email (mailto)
 *
 * Pure DOM scrape (the native content stays in the DOM, just display:none), so
 * there's no model-timing dependency. Idempotent on every render.
 ***************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-srq-header-css';
  var EVENT_NS = '.scwSrqHeader';
  var VIEWS = ['view_3504', 'view_3825', 'view_3826', 'view_3568'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function bodyEl(view, fk) {
    return view.querySelector('.kn-detail.' + fk + ' .kn-detail-body') ||
           view.querySelector('.' + fk + ' .kn-detail-body');
  }
  function txt(view, fk) { var el = bodyEl(view, fk); return el ? el.textContent.trim() : ''; }
  function htmlOf(view, fk) { var el = bodyEl(view, fk); return el ? el.innerHTML.trim() : ''; }

  // ── view_3504: header card ──────────────────────────────────
  function statusMod(status) {
    var s = status.toLowerCase();
    if (/complete|done|finished|submitted/.test(s)) return 'done';
    if (/progress|scheduled|visit|active/.test(s))  return 'active';
    if (/request|pending|new|await/.test(s))         return 'pending';
    return 'neutral';
  }
  // ClickUp link (field_2632) — surfaced in the header next to REQ #. It may
  // live on view_3826 OR (if moved) view_3504, so read from either's DOM.
  function clickupHref() {
    var sel = '.kn-detail.field_2632 a, .field_2632 a';
    var a = document.querySelector('#view_3504 ' + sel) ||
            document.querySelector('#view_3826 ' + sel);
    return a ? (a.getAttribute('href') || '') : '';
  }
  // Render every OTHER detail field on the view (beyond the ones the header
  // lays out explicitly) as a styled label/value row — so fields MOVED onto
  // view_3504 get the same card treatment automatically, no per-field code.
  function extraDetailRows(view, skipFields) {
    var skip = Object.create(null);
    for (var i = 0; i < skipFields.length; i++) skip[skipFields[i]] = true;
    var out = '';
    var dets = view.querySelectorAll('.kn-detail');
    for (var d = 0; d < dets.length; d++) {
      var det = dets[d];
      var fk = '', parts = (det.className || '').split(/\s+/);
      for (var c = 0; c < parts.length; c++) {
        if (/^field_\d+$/.test(parts[c])) { fk = parts[c]; break; }
      }
      if (!fk || skip[fk]) continue;
      var lab = det.querySelector('.kn-detail-label');
      var bod = det.querySelector('.kn-detail-body');
      var label   = lab ? lab.textContent.trim() : '';
      var valHtml = bod ? bod.innerHTML.trim() : '';
      if (!valHtml.replace(/<[^>]*>/g, '').trim()) continue;   // skip blanks
      out += noteRow(label, valHtml);
    }
    return out;
  }
  function buildHeader(view) {
    // Title (field_666 connection). The auto-identifier reads
    // "Account : Account - Location" — keep the part after the last " : ".
    var rawTitle = txt(view, 'field_666');
    var title = rawTitle.indexOf(' : ') >= 0 ? rawTitle.split(' : ').pop().trim() : rawTitle;
    var status = txt(view, 'field_2349');
    var reqId  = txt(view, 'field_2345');
    var cu     = clickupHref();
    // Any other field the user dropped onto view_3504 (skip the ones already
    // shown: Status, REQ #, ClickUp).
    var extra  = extraDetailRows(view, ['field_2349', 'field_2345', 'field_2632']);
    return '' +
      '<div class="scw-srq-title">' + esc(title || 'Survey Request') + '</div>' +
      '<div class="scw-srq-meta">' +
        (status ? '<span class="scw-srq-status scw-srq-status--' + statusMod(status) + '">' +
          esc(status) + '</span>' : '') +
        (reqId ? '<span class="scw-srq-reqid">REQ ' + esc(reqId) + '</span>' : '') +
        (cu ? '<a class="scw-srq-clickup" href="' + esc(cu) + '" target="_blank" ' +
          'rel="noopener">ClickUp Task &#8599;</a>' : '') +
      '</div>' +
      (extra ? '<div class="scw-srq-rows">' + extra + '</div>' : '');
  }

  // ── view_3825: details card ─────────────────────────────────
  function noteRow(label, valueHtml) {
    if (!valueHtml) return '';
    return '<div class="scw-srq-row">' +
      '<div class="scw-srq-row-label">' + esc(label) + '</div>' +
      '<div class="scw-srq-row-val">' + valueHtml + '</div>' +
    '</div>';
  }
  function pin() {
    return '<svg class="scw-srq-pin" viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  }
  function buildDetails(view) {
    var addr  = htmlOf(view, 'field_2410');
    var instr = htmlOf(view, 'field_2355');
    var other = htmlOf(view, 'field_2357');
    var form  = htmlOf(view, 'field_2356');

    // strip empty-span shells Knack leaves for blank fields
    function clean(h) {
      var t = h.replace(/<[^>]*>/g, '').trim();
      return t ? h : '';
    }
    // Any OTHER field on this view (beyond Address + the three notes) gets a
    // generic styled row, so nothing disappears if a field is moved/added.
    var extra = extraDetailRows(view, ['field_2410', 'field_2355', 'field_2357', 'field_2356']);
    return '' +
      (addr ? '<div class="scw-srq-addr">' + pin() + '<span>' + addr + '</span></div>' : '') +
      '<div class="scw-srq-rows">' +
        noteRow('Instructions', clean(instr)) +
        noteRow('Other Notes', clean(other)) +
        noteRow('Survey Field Form', clean(form)) +
        extra +
      '</div>';
  }

  // ── view_3826: status timeline card ─────────────────────────
  // Just the Requested → Bid Delivered timeline. Status is NOT repeated here
  // (it leads the header above) and the ClickUp link now lives in the header
  // next to REQ #.
  function buildStatus(view) {
    var steps = [
      { fk: 'field_2351', label: 'Requested' },
      { fk: 'field_2352', label: 'Scheduled' },
      { fk: 'field_2353', label: 'Completed' },
      { fk: 'field_2354', label: 'Bid Delivered' }
    ];
    var tl = '';
    for (var i = 0; i < steps.length; i++) {
      var d = txt(view, steps[i].fk);
      tl += '<div class="scw-srq-tl-item' + (d ? ' scw-srq-tl-item--done' : '') + '">' +
        '<span class="scw-srq-tl-dot"></span>' +
        '<span class="scw-srq-tl-label">' + esc(steps[i].label) + '</span>' +
        '<span class="scw-srq-tl-date">' + (d ? esc(d) : 'Pending') + '</span>' +
      '</div>';
    }
    return '<div class="scw-srq-timeline">' + tl + '</div>';
  }

  // ── view_3568: Survey POC (kn-list) ─────────────────────────
  function phoneIcon() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 ' +
      '1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 ' +
      '4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 ' +
      '2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  }
  function mailIcon() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M22 7l-10 6L2 7"></path></svg>';
  }
  function fieldHtml(el, fk) {
    var h = htmlOf(el, fk);
    return h.replace(/<[^>]*>/g, '').trim() ? h : '';
  }
  function buildPoc(view) {
    // kn-list: one POC per .kn-list-item-container (usually one). Read Name
    // (field_198, text) + Cell (field_195) + Email (field_196), keeping the
    // tel:/mailto: links from the native cell.
    var items = view.querySelectorAll('.kn-list-item-container');
    if (!items.length) items = [view];
    var blocks = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var name  = txt(it, 'field_198');
      var phone = fieldHtml(it, 'field_195');
      var email = fieldHtml(it, 'field_196');
      if (!name && !phone && !email) continue;
      blocks += '<div class="scw-srq-poc">' +
        (name ? '<div class="scw-srq-poc-name">' + esc(name) + '</div>' : '') +
        '<div class="scw-srq-poc-lines">' +
          (phone ? '<div class="scw-srq-poc-line">' + phoneIcon() + '<span>' + phone + '</span></div>' : '') +
          (email ? '<div class="scw-srq-poc-line">' + mailIcon() + '<span>' + email + '</span></div>' : '') +
        '</div>' +
      '</div>';
    }
    if (!blocks) return '';
    return '<div class="scw-srq-card-title">Survey POC</div>' + blocks;
  }

  // Native action / page links (Edit, Regenerate Survey Documents, a PDF link,
  // …) live inside .kn-details-link and would be hidden along with the rest of
  // the native content — re-render them as buttons so they survive the card
  // replacement. Deduped by href+text.
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function actionLinks(view) {
    var out = '', seen = Object.create(null);
    // Action / page / menu links (Edit, Regenerate Survey Documents, a PDF
    // link, …) — Knack renders these in several shapes, so cast a wide net.
    var links = view.querySelectorAll(
      '.kn-details-link a[href], .kn-menu a[href], .kn-action-link a[href], ' +
      'a.kn-link-page[href], a.kn-link.kn-button[href], a.kn-link-action[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      // Skip links that are a FIELD VALUE (inside a .kn-detail body — e.g. an
      // email/phone/file value); those belong in their field row, not here.
      if (a.closest && a.closest('.kn-detail') && !a.closest('.kn-details-link')) continue;
      var href = a.getAttribute('href') || '';
      var text = (a.textContent || '').trim();
      if (!href || !text) continue;
      var k = href + '|' + text;
      if (seen[k]) continue;
      seen[k] = true;
      var ext = /^https?:/i.test(href) || a.getAttribute('target') === '_blank';
      out += '<a class="scw-srq-action" href="' + esc(href) + '"' +
        (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(cap(text)) + '</a>';
    }
    return out;
  }

  // ── transform ───────────────────────────────────────────────
  function mountCard(view, cls, innerHtml) {
    if (!innerHtml) return;
    var card = view.querySelector('.scw-srq-card');
    if (!card) {
      card = document.createElement('div');
      view.insertBefore(card, view.firstChild);
    }
    card.className = 'scw-srq-card ' + cls;
    // Only rebuild when the HTML actually changed. Knack re-renders these views
    // several times on load; rebuilding identical content each time wipes any
    // externally-injected children (e.g. the Regenerate PDF button), making
    // them flicker and vanish.
    if (card.getAttribute('data-scw-srq-html') === innerHtml) return;
    card.setAttribute('data-scw-srq-html', innerHtml);
    card.innerHTML = innerHtml;
  }

  function transformEl(viewId, view) {
    var cls = '', inner = '';
    if (viewId === 'view_3504')      { cls = 'scw-srq-header';    inner = buildHeader(view); }
    else if (viewId === 'view_3825') { cls = 'scw-srq-details';   inner = buildDetails(view); }
    else if (viewId === 'view_3826') { cls = 'scw-srq-status';    inner = buildStatus(view); }
    else if (viewId === 'view_3568') { cls = 'scw-srq-poc-card';  inner = buildPoc(view); }
    else return;
    // Preserve native action/page links (Edit, Regenerate Survey Documents,
    // PDF link, …) that the card replacement would otherwise hide.
    var acts = actionLinks(view);
    if (acts) inner = (inner || '') + '<div class="scw-srq-actions">' + acts + '</div>';
    mountCard(view, cls, inner);
  }
  // The header (view_3504) shows view_3826's ClickUp link, so when view_3826
  // renders (its data lands in the DOM) re-run the header to pick it up.
  function afterTransform(viewId) {
    if (viewId === 'view_3826') transform('view_3504');
  }
  // Knack occasionally renders the same view id twice in the DOM — handle every
  // matching element, not just document.getElementById's first hit.
  function transform(viewId) {
    var els = document.querySelectorAll('#' + viewId);
    for (var i = 0; i < els.length; i++) transformEl(viewId, els[i]);
    afterTransform(viewId);
  }

  // ── styles ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    // Hide native content from first paint (kills the thrash) — our card sits
    // before it. The rich-text (view_3538) keeps its content, just restyled.
    var css = [
      // Hide EVERY native child of these views (section.columns, the view
      // header, and any stray Knack element) — leave only our injected card.
      // More robust than hiding section.columns alone (kills leftover bits that
      // were bleeding through behind the card).
      '#view_3504 > *:not(.scw-srq-card), #view_3825 > *:not(.scw-srq-card),',
      '#view_3826 > *:not(.scw-srq-card), #view_3568 > *:not(.scw-srq-card) { display: none !important; }',
      '#view_3504, #view_3825, #view_3826, #view_3568 { background: transparent !important;',
      '  box-shadow: none !important; border: none !important; border-radius: 0 !important;',
      '  padding: 0 !important; margin: 0 0 12px !important; overflow: visible !important; }',
      // Strip border / radius / shadow / outline off the COLUMN / GROUP wrappers
      // around the views (their own native content is already hidden).
      '.view-column:has(> #view_3504), .view-column:has(> #view_3825),',
      '.view-column:has(> #view_3826), .view-column:has(> #view_3568),',
      '.view-group:has(#view_3504), .view-group:has(#view_3825),',
      '.view-group:has(#view_3826), .view-group:has(#view_3568) {',
      '  border: none !important; border-radius: 0 !important; box-shadow: none !important;',
      '  outline: none !important; background: transparent !important; }',

      '.scw-srq-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 16px 18px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  color: #1f2937; position: relative; }',

      /* header */
      '.scw-srq-header { padding: 18px 20px; }',
      '.scw-srq-title { font-size: 22px; font-weight: 750; letter-spacing: -.01em; color: #0f172a;',
      '  line-height: 1.2; }',
      '.scw-srq-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }',
      /* Flat status badge — NO border (a border + 999px radius was the stray */
      /* "pill outline"). Subtle tinted background, lightly rounded. */
      '.scw-srq-status { font: 700 11px/1 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .4px; padding: 5px 9px; border-radius: 5px; white-space: nowrap; }',
      '.scw-srq-status--pending { background: #fef3c7; color: #b45309; }',
      '.scw-srq-status--active  { background: #dbeafe; color: #1d4ed8; }',
      '.scw-srq-status--done    { background: #d1fae5; color: #047857; }',
      '.scw-srq-status--neutral { background: #f1f5f9; color: #475569; }',
      '.scw-srq-reqid { font: 600 11.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;',
      '  color: #64748b; background: #f1f5f9; padding: 5px 9px; border-radius: 5px; }',
      /* ClickUp link sits at the far right of the header meta row. */
      '.scw-srq-meta .scw-srq-clickup { margin-left: auto; }',

      /* native action / page links re-rendered as buttons (Edit, Regenerate
         Survey Documents, PDF link, …) — sit in a footer row on the card. */
      '.scw-srq-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px;',
      '  padding-top: 12px; border-top: 1px solid #f1f5f9; }',
      '.scw-srq-action { font: 600 12px/1.2 system-ui, sans-serif; text-decoration: none;',
      '  color: #334155; background: #fff; border: 1px solid #cbd5e1; border-radius: 7px;',
      '  padding: 6px 12px; white-space: nowrap; }',
      '.scw-srq-action:hover { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }',
      '/* details */',
      '.scw-srq-addr { display: flex; align-items: flex-start; gap: 8px; font-size: 14px;',
      '  font-weight: 600; color: #0f172a; line-height: 1.4; }',
      '.scw-srq-addr .scw-srq-pin { color: #2f5f91; flex: 0 0 auto; margin-top: 2px; }',
      '.scw-srq-rows { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }',
      '.scw-srq-rows:empty { margin-top: 0; }',
      '.scw-srq-row { display: grid; grid-template-columns: 130px 1fr; gap: 4px 14px;',
      '  align-items: start; }',
      '.scw-srq-row-label { font: 600 11px/1.4 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .3px; color: #94a3b8; padding-top: 1px; }',
      '.scw-srq-row-val { font-size: 13.5px; color: #334155; line-height: 1.45; min-width: 0; }',
      '.scw-srq-row-val a { color: #1d4ed8; }',

      /* ClickUp link (in the header meta row) — flat, borderless chip. */
      '.scw-srq-clickup { font: 600 11.5px/1 system-ui, sans-serif; text-decoration: none;',
      '  color: #5a3df0; background: #f1effe; border-radius: 5px;',
      '  padding: 5px 9px; white-space: nowrap; }',
      '.scw-srq-clickup:hover { background: #e6e1fb; }',
      /* status card (view_3826): just the date timeline. */
      '.scw-srq-timeline { position: relative; }',
      '.scw-srq-timeline::before { content: ""; position: absolute; left: 6px; top: 13px; bottom: 13px;',
      '  width: 2px; background: #e2e8f0; }',
      '.scw-srq-tl-item { position: relative; display: grid; grid-template-columns: 16px 1fr auto;',
      '  align-items: center; gap: 0 10px; padding: 6px 0; }',
      '.scw-srq-tl-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #cbd5e1;',
      '  background: #fff; box-sizing: border-box; position: relative; z-index: 1; }',
      '.scw-srq-tl-item--done .scw-srq-tl-dot { border-color: #047857; background: #047857; }',
      '.scw-srq-tl-label { font: 600 12.5px/1.2 system-ui, sans-serif; color: #64748b; }',
      '.scw-srq-tl-item--done .scw-srq-tl-label { color: #0f172a; }',
      '.scw-srq-tl-date { font-size: 12px; color: #475569; text-align: right; white-space: nowrap; }',
      '.scw-srq-tl-item:not(.scw-srq-tl-item--done) .scw-srq-tl-date { color: #cbd5e1; font-style: italic; }',

      /* POC card (view_3568) */
      '.scw-srq-card-title { font: 700 11px/1 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .4px; color: #94a3b8; margin-bottom: 10px; }',
      '.scw-srq-poc + .scw-srq-poc { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f1f5f9; }',
      '.scw-srq-poc-name { font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.2; }',
      '.scw-srq-poc-lines { display: flex; flex-direction: column; gap: 6px; margin-top: 7px; }',
      '.scw-srq-poc-line { display: flex; align-items: center; gap: 8px; font-size: 13.5px;',
      '  color: #334155; min-width: 0; }',
      '.scw-srq-poc-line svg { color: #2f5f91; flex: 0 0 auto; }',
      '.scw-srq-poc-line span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.scw-srq-poc-line a { color: #1d4ed8; text-decoration: none; }',
      '.scw-srq-poc-line a:hover { text-decoration: underline; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── bindings ────────────────────────────────────────────────
  function bindView(viewId) {
    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(viewId, function () { transform(viewId); }, EVENT_NS);
    } else {
      $(document)
        .off('knack-view-render.' + viewId + EVENT_NS)
        .on('knack-view-render.' + viewId + EVENT_NS, function () { transform(viewId); });
    }
  }

  injectStyles();
  for (var i = 0; i < VIEWS.length; i++) {
    bindView(VIEWS[i]);
    if (document.getElementById(VIEWS[i])) {
      (function (vid) { setTimeout(function () { transform(vid); }, 50); })(VIEWS[i]);
    }
  }

  // Public refresh hook — lets other features force the cards to
  // re-scrape the native DOM after they write a new field value (e.g.
  // the sub-portal survey PDF export updating Survey Field Form /
  // field_2356). mountCard's change-detection means a no-op refresh is
  // cheap; it only rebuilds when the scraped HTML actually changed.
  window.SCW = window.SCW || {};
  SCW.srqHeader = SCW.srqHeader || {};
  SCW.srqHeader.refresh = function (viewId) {
    if (viewId) { transform(viewId); return; }
    for (var k = 0; k < VIEWS.length; k++) transform(VIEWS[k]);
  };
})();
/*** END SURVEY REQUEST HEADER **********************************************/
