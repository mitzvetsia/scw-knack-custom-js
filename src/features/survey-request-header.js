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
 *   view_3538  → "BIDs" rich-text restyled as a clean section heading
 *
 * Pure DOM scrape (the native content stays in the DOM, just display:none), so
 * there's no model-timing dependency. Idempotent on every render.
 ***************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-srq-header-css';
  var EVENT_NS = '.scwSrqHeader';
  var VIEWS = ['view_3504', 'view_3825', 'view_3538'];

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
  function buildHeader(view) {
    // Title (field_666 connection). The auto-identifier reads
    // "Account : Account - Location" — keep the part after the last " : ".
    var rawTitle = txt(view, 'field_666');
    var title = rawTitle.indexOf(' : ') >= 0 ? rawTitle.split(' : ').pop().trim() : rawTitle;
    var status = txt(view, 'field_2349');
    var reqId  = txt(view, 'field_2345');
    return '' +
      '<div class="scw-srq-title">' + esc(title || 'Survey Request') + '</div>' +
      '<div class="scw-srq-meta">' +
        (status ? '<span class="scw-srq-status scw-srq-status--' + statusMod(status) + '">' +
          esc(status) + '</span>' : '') +
        (reqId ? '<span class="scw-srq-reqid">REQ ' + esc(reqId) + '</span>' : '') +
      '</div>';
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
    var editA = view.querySelector('.kn-details-link a.kn-link-page, .kn-details-link a');
    var editHref = editA ? (editA.getAttribute('href') || '') : '';

    // strip empty-span shells Knack leaves for blank fields
    function clean(h) {
      var t = h.replace(/<[^>]*>/g, '').trim();
      return t ? h : '';
    }
    return '' +
      (editHref ? '<a class="scw-srq-edit" href="' + esc(editHref) + '">Edit</a>' : '') +
      (addr ? '<div class="scw-srq-addr">' + pin() + '<span>' + addr + '</span></div>' : '') +
      '<div class="scw-srq-rows">' +
        noteRow('Instructions', clean(instr)) +
        noteRow('Other Notes', clean(other)) +
        noteRow('Survey Field Form', clean(form)) +
      '</div>';
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
    card.innerHTML = innerHtml;
  }

  function transformEl(viewId, view) {
    if (viewId === 'view_3504') mountCard(view, 'scw-srq-header', buildHeader(view));
    else if (viewId === 'view_3825') mountCard(view, 'scw-srq-details', buildDetails(view));
    else if (viewId === 'view_3538') view.classList.add('scw-srq-section');
  }
  // Knack occasionally renders the same view id twice in the DOM — handle every
  // matching element, not just document.getElementById's first hit.
  function transform(viewId) {
    var els = document.querySelectorAll('#' + viewId);
    for (var i = 0; i < els.length; i++) transformEl(viewId, els[i]);
  }

  // ── styles ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    // Hide native content from first paint (kills the thrash) — our card sits
    // before it. The rich-text (view_3538) keeps its content, just restyled.
    var css = [
      '#view_3504 > section.columns, #view_3825 > section.columns { display: none !important; }',
      '#view_3504, #view_3825 { background: transparent !important; box-shadow: none !important;',
      '  border: none !important; padding: 0 !important; margin: 0 0 12px !important; }',

      '.scw-srq-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 16px 18px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  color: #1f2937; position: relative; }',

      /* header */
      '.scw-srq-header { padding: 18px 20px; }',
      '.scw-srq-title { font-size: 22px; font-weight: 750; letter-spacing: -.01em; color: #0f172a;',
      '  line-height: 1.2; }',
      '.scw-srq-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }',
      '.scw-srq-status { font: 700 11px/1 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .4px; padding: 5px 10px; border-radius: 999px; white-space: nowrap; }',
      '.scw-srq-status--pending { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }',
      '.scw-srq-status--active  { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }',
      '.scw-srq-status--done    { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }',
      '.scw-srq-status--neutral { background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; }',
      '.scw-srq-reqid { font: 600 11.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;',
      '  color: #64748b; background: #f1f5f9; padding: 5px 9px; border-radius: 6px; }',

      /* details */
      '.scw-srq-edit { position: absolute; top: 14px; right: 16px; background: #fff;',
      '  border: 1px solid #cbd5e1; color: #334155; border-radius: 7px; padding: 5px 12px;',
      '  font: 600 12px/1.2 system-ui, sans-serif; text-decoration: none; }',
      '.scw-srq-edit:hover { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }',
      '.scw-srq-addr { display: flex; align-items: flex-start; gap: 8px; font-size: 14px;',
      '  font-weight: 600; color: #0f172a; line-height: 1.4; padding-right: 64px; }',
      '.scw-srq-addr .scw-srq-pin { color: #2f5f91; flex: 0 0 auto; margin-top: 2px; }',
      '.scw-srq-rows { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }',
      '.scw-srq-rows:empty { margin-top: 0; }',
      '.scw-srq-row { display: grid; grid-template-columns: 130px 1fr; gap: 4px 14px;',
      '  align-items: start; }',
      '.scw-srq-row-label { font: 600 11px/1.4 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .3px; color: #94a3b8; padding-top: 1px; }',
      '.scw-srq-row-val { font-size: 13.5px; color: #334155; line-height: 1.45; min-width: 0; }',
      '.scw-srq-row-val a { color: #1d4ed8; }',

      /* section heading (view_3538 "BIDs") */
      '#view_3538.scw-srq-section { margin: 18px 0 10px !important; padding: 0 !important;',
      '  background: transparent !important; box-shadow: none !important; border: none !important; }',
      '#view_3538.scw-srq-section .kn-rich_text__content h1 { font-size: 15px !important;',
      '  font-weight: 700 !important; text-transform: uppercase !important; letter-spacing: .5px !important;',
      '  color: #64748b !important; margin: 0 !important; padding: 0 0 7px !important;',
      '  border-bottom: 2px solid #e2e8f0 !important; }'
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
})();
/*** END SURVEY REQUEST HEADER **********************************************/
