/*** SOW PDF stepper — scene_833 *********************************************
 *
 * One-step "Generate SOW PDF" action card mounted at the top of the SOW
 * detail page. Clicking the action scrapes the rendered SOW HTML and
 * POSTs it to MAKE_GENERATE_SOW_PDF_WEBHOOK; Make handles HTML → PDF
 * rendering and depositing the file (this module is fire-and-forget on
 * the client side — no polling).
 *
 * Pattern copied from ops-stepper.js / workflow-stepper.js (visual
 * language) and sub-portal-survey-request-export.js (scrape-and-POST
 * payload shape).
 ******************************************************************************/
(function () {
  'use strict';

  var SCENE_ID = 'scene_833';
  var STYLE_ID = 'scw-sow-pdf-stepper-css';
  var HOST_ID  = 'scw-sow-pdf-stepper';
  var NS       = '.scwSowPdfStepper';

  // ── Record id extraction ────────────────────────────────────
  // URL hash on this scene looks like:
  //   #team-calendar/project-dashboard/<projId>/build-quote/<projId>/sow/<sowId>
  // Pull the 24-hex segment after '/sow/'.
  function getSowId() {
    var hash = (window.location.hash || '').split('?')[0];
    var m = hash.match(/\/sow\/([a-f0-9]{24})/i);
    return m ? m[1] : null;
  }

  // ── Triggered-by user info ──────────────────────────────────
  function getTriggeredBy() {
    try {
      var u = window.Knack && Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && u !== 'No user found') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return { id: '', name: '', email: '' };
  }

  // ── Styles ──────────────────────────────────────────────────
  // Matches ops-stepper / workflow-stepper visual language:
  // bordered card, left accent stripe, icon + title + status.
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + HOST_ID + ' {',
      '  display: flex; align-items: stretch;',
      '  gap: 10px; margin: 12px 0 16px;',
      '  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;',
      '}',
      '#' + HOST_ID + ' .scw-step-action {',
      '  position: relative;',
      '  flex: 1 1 auto;',
      '  display: flex; align-items: center;',
      '  gap: 12px;',
      '  padding: 14px 18px 14px 22px;',
      '  background: #ffffff;',
      '  border: 1px solid #cbd5e1;',
      '  border-radius: 8px;',
      '  color: #1e293b;',
      '  cursor: pointer;',
      '  transition: background 120ms ease, border-color 120ms ease;',
      '  --scw-step-accent: #295f91;',
      '}',
      '#' + HOST_ID + ' .scw-step-action::before {',
      '  content: ""; position: absolute; left: 0; top: 8px; bottom: 8px;',
      '  width: 6px; background: var(--scw-step-accent);',
      '  border-radius: 3px;',
      '}',
      '#' + HOST_ID + ' .scw-step-action:hover {',
      '  background: rgba(41,95,145,0.06);',
      '  border-color: #94a3b8;',
      '}',
      '#' + HOST_ID + ' .scw-step-icon {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  flex: 0 0 auto;',
      '  width: 32px; height: 32px;',
      '  border-radius: 50%;',
      '  background: rgba(41,95,145,0.10);',
      '  color: var(--scw-step-accent);',
      '}',
      '#' + HOST_ID + ' .scw-step-icon svg { width: 18px; height: 18px; }',
      '#' + HOST_ID + ' .scw-step-body {',
      '  display: flex; flex-direction: column; gap: 2px;',
      '  flex: 1 1 auto; min-width: 0;',
      '}',
      '#' + HOST_ID + ' .scw-step-title {',
      '  font-weight: 700; font-size: 14px; color: #0f172a;',
      '}',
      '#' + HOST_ID + ' .scw-step-sub {',
      '  font-size: 12px; color: #475569;',
      '}',
      // ── Pending / busy ──
      '#' + HOST_ID + '.is-busy .scw-step-action {',
      '  cursor: progress;',
      '  background: rgba(41,95,145,0.04);',
      '  border-color: var(--scw-step-accent);',
      '}',
      '#' + HOST_ID + '.is-busy .scw-step-icon svg {',
      '  animation: scw-sow-spin 0.9s linear infinite;',
      '}',
      '@keyframes scw-sow-spin { to { transform: rotate(360deg); } }',
      // ── Completed (success) ──
      '#' + HOST_ID + '.is-done .scw-step-action {',
      '  --scw-step-accent: #16a34a;',
      '  cursor: default;',
      '  background: rgba(22,163,74,0.06);',
      '  border-color: #16a34a;',
      '}',
      '#' + HOST_ID + '.is-done .scw-step-action:hover { background: rgba(22,163,74,0.06); }',
      '#' + HOST_ID + '.is-done .scw-step-icon {',
      '  background: rgba(22,163,74,0.14); color: #16a34a;',
      '}',
      // ── Error ──
      '#' + HOST_ID + '.is-error .scw-step-action {',
      '  --scw-step-accent: #b45309;',
      '  background: rgba(180,83,9,0.04);',
      '  border-color: #d97706;',
      '}',
      '#' + HOST_ID + '.is-error .scw-step-icon {',
      '  background: rgba(180,83,9,0.14); color: #b45309;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Icons (inline SVGs, swap based on state) ────────────────
  var ICON_PDF =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="12" y1="18" x2="12" y2="12"/>' +
    '<polyline points="9 15 12 12 15 15"/>' +
    '</svg>';
  var ICON_SPIN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>' +
    '</svg>';
  var ICON_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="20 6 9 17 4 12"/>' +
    '</svg>';
  var ICON_WARN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"/>' +
    '</svg>';

  // ── Mount ───────────────────────────────────────────────────
  // Top of scene: insert before the first existing view group so it sits
  // above the logo + project header block.
  function mount() {
    var scene = document.getElementById('kn-' + SCENE_ID);
    if (!scene) return;
    if (scene.querySelector('#' + HOST_ID)) return;

    var host = document.createElement('div');
    host.id = HOST_ID;
    host.innerHTML =
      '<div class="scw-step-action" role="button" tabindex="0" data-step="generate-sow-pdf">' +
      '  <span class="scw-step-icon">' + ICON_PDF + '</span>' +
      '  <span class="scw-step-body">' +
      '    <span class="scw-step-title">Generate SOW PDF</span>' +
      '    <span class="scw-step-sub">Convert this Scope of Work to a PDF.</span>' +
      '  </span>' +
      '</div>';

    scene.insertBefore(host, scene.firstChild);

    var btn = host.querySelector('.scw-step-action');
    btn.addEventListener('click', onClick);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    });
  }

  // ── State transitions ───────────────────────────────────────
  function setState(state, title, sub) {
    var host = document.getElementById(HOST_ID);
    if (!host) return;
    host.classList.remove('is-busy', 'is-done', 'is-error');
    if (state) host.classList.add(state);

    var iconEl = host.querySelector('.scw-step-icon');
    var titleEl = host.querySelector('.scw-step-title');
    var subEl  = host.querySelector('.scw-step-sub');
    if (iconEl) {
      iconEl.innerHTML =
        state === 'is-busy'  ? ICON_SPIN  :
        state === 'is-done'  ? ICON_CHECK :
        state === 'is-error' ? ICON_WARN  : ICON_PDF;
    }
    if (titleEl && title) titleEl.textContent = title;
    if (subEl   && sub)   subEl.textContent   = sub;
  }

  // ── Build a complete standalone HTML document ───────────────
  // Make/headless-browser PDF renderers need a full document with
  // <head> + styles, not bare body markup. We assemble:
  //   • <!DOCTYPE html><html><head>…</head><body>…</body></html>
  //   • All <link rel="stylesheet"> tags from the current page (Knack's
  //     CSS, Google Fonts, etc. — these resolve from public CDNs so a
  //     headless browser in Make can fetch them).
  //   • All inline <style> blocks (this is where every SCW feature
  //     injects its styles, plus Knack's per-page rules).
  //   • A <base href> so any relative image/asset URLs in the scraped
  //     content resolve against the original page.
  //   • The scraped scene HTML as the body content (stepper removed).
  function buildStandaloneHtml(sceneClone) {
    var parts = [];
    parts.push('<!DOCTYPE html>');
    parts.push('<html lang="en">');
    parts.push('<head>');
    parts.push('<meta charset="utf-8">');
    parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');

    // Base href — so <img src="/path/..."> in scraped content resolves
    // back to the Knack-hosted origin instead of breaking in Make's
    // renderer.
    parts.push('<base href="' + window.location.origin + '/">');

    parts.push('<title>' + escapeHtml(document.title || 'SOW') + '</title>');

    // External stylesheets — Knack's main CSS, Font Awesome, Google
    // Fonts, etc. We re-emit the <link> tags verbatim so the renderer
    // fetches the same CSS the user is looking at.
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (!href) continue;
      // Resolve protocol-relative + relative refs to absolute so the
      // renderer doesn't have to guess.
      var abs = links[i].href || href;
      parts.push('<link rel="stylesheet" href="' + escapeAttr(abs) + '">');
    }

    // Inline <style> blocks — this is where every SCW feature injects
    // its styles (including the workflow-stepper, group-collapse,
    // mdf-summary, etc.) plus any per-page Knack rules.
    var styles = document.querySelectorAll('style');
    for (var j = 0; j < styles.length; j++) {
      var css = styles[j].textContent || '';
      if (!css.trim()) continue;
      parts.push('<style>' + css + '</style>');
    }

    // Print-specific overrides — appended LAST so they win against any
    // upstream rule that bled in from the live page. Goals:
    //   • landscape letter with tight margins → more content per page
    //   • smaller base font / tighter line-height → text density up
    //   • cap thumbnail width → camera table fits 5-7 rows per page
    //     instead of 2
    //   • tighten table cell padding everywhere
    //   • hide pagination / filter / sort / bulk-ops chrome — data
    //     stays, controls go away
    //   • prevent row splits across pages
    parts.push(
      '<style>' +
      // ── Page geometry ──────────────────────────────────────
      '  @page { size: letter landscape; margin: 0.3in 0.35in; }' +
      '  html, body {' +
      '    background: #ffffff !important;' +
      '    margin: 0; padding: 0;' +
      '    font: 10.5px/1.35 -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;' +
      '    color: #111827;' +
      '  }' +
      '  body { padding: 4px 6px; }' +

      // ── App shell — gone (no nav / header / popovers in the PDF) ──
      '  #kn-app-header, #kn-mobile-menu, #kn-popover, #kn-overlay,' +
      '  .kn-info-bar, #knack-logo a, #kn-loading-spinner,' +
      '  .kn-back-link, .ktlAddonsDiv, .bulkOpsControlsDiv {' +
      '    display: none !important;' +
      '  }' +

      // ── Page-level chrome we never want in the PDF ──────────
      '  .kn-records-nav, .kn-pagination, .kn-entries-summary,' +
      '  .kn-filters, .kn-filters-nav, .kn-add-filter,' +
      '  .filterCtrlDiv, .filterDiv, .kn-filter-rule,' +
      '  .js-filter-menu, .kn-select, .level { display: none !important; }' +

      // ── In-cell controls (sort arrows, edit-link columns) ───
      '  .kn-sort .icon, .scw-sort-hint, .fa-sort-amount-asc,' +
      '  .fa-sort-amount-desc { display: none !important; }' +
      '  .kn-table-link, th.kn-table-link {' +
      '    display: none !important;' +
      '  }' +
      // Sort links should look like plain text headers — no underline,
      // no hover color, no pointer.
      '  th .kn-sort, th .kn-sort a, th a { color: inherit !important; text-decoration: none !important; cursor: default !important; }' +

      // ── Typography for top-of-page identity ─────────────────
      // Drop the giant H1 / H2 sizes the live page uses — we have a
      // tiny page and don\'t need 36px headings.
      '  h1 { font-size: 18px !important; margin: 0 0 4px !important; }' +
      '  h2 { font-size: 14px !important; margin: 10px 0 4px !important; color: #0f4c75 !important; }' +
      '  h3 { font-size: 12px !important; margin: 8px 0 4px !important; color: #0f4c75 !important; }' +
      '  p  { margin: 4px 0 !important; }' +
      '  ul { margin: 4px 0 4px 18px !important; padding: 0 !important; }' +
      '  li { margin: 1px 0 !important; }' +
      '  hr { margin: 6px 0 !important; border: 0; border-top: 1px solid #cbd5e1; }' +

      // ── Project header card ─────────────────────────────────
      '  #view_998 section.columns { display: flex !important; gap: 16px; align-items: flex-start; }' +
      '  #view_998 .kn-details-column { flex: 1 1 0 !important; min-width: 0; }' +
      '  #view_998 .kn-detail-label { font-size: 9px !important; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }' +
      '  #view_998 .kn-detail-body { font-size: 11px !important; padding: 1px 0 !important; }' +
      '  #view_998 h1 { font-size: 16px !important; color: #0f4c75 !important; }' +
      '  #view_998 h2 { font-size: 12px !important; color: #334155 !important; margin: 0 0 2px !important; }' +

      // ── Tables — uniform compact density ────────────────────
      '  table.kn-table { width: 100% !important; border-collapse: collapse !important; margin: 4px 0 8px !important; font-size: 10px !important; }' +
      '  table.kn-table thead th {' +
      '    background: #f1f5f9 !important; color: #0f172a !important;' +
      '    font-size: 9.5px !important; font-weight: 700 !important;' +
      '    text-transform: uppercase; letter-spacing: 0.03em;' +
      '    padding: 4px 6px !important; border-bottom: 1px solid #cbd5e1 !important;' +
      '    text-align: left;' +
      '  }' +
      '  table.kn-table tbody td {' +
      '    padding: 3px 6px !important; vertical-align: top !important;' +
      '    border-bottom: 1px solid #e2e8f0 !important;' +
      '    font-size: 10px !important;' +
      '    word-break: break-word;' +
      '  }' +
      '  table.kn-table tbody tr {' +
      '    page-break-inside: avoid; break-inside: avoid;' +
      '  }' +
      '  table.kn-table tbody tr:nth-child(even) td {' +
      '    background: #fafbfc !important;' +
      '  }' +

      // ── Camera table specifically (view_2292) ───────────────
      // Cap photo column width so we get 5–7 rows per page instead
      // of the 2 we get when every thumbnail is 300px wide.
      '  #view_2292 table { table-layout: fixed; }' +
      '  #view_2292 th.field_71,  #view_2292 td.field_71  { width: 7%; }' +
      '  #view_2292 th.field_1485, #view_2292 td.field_1485 { width: 22%; }' +
      '  #view_2292 th.field_32,  #view_2292 td.field_32  { width: 38%; }' +
      '  #view_2292 th.field_409, #view_2292 td.field_409 { width: 8%; text-align: center; }' +
      '  #view_2292 th[class*="field_771"], #view_2292 td[class*="field_771"] { width: 25%; }' +
      '  #view_2292 td[class*="field_771"] img {' +
      '    max-width: 140px !important; max-height: 100px !important;' +
      '    width: auto !important; height: auto !important;' +
      '    margin: 1px 4px 1px 0 !important;' +
      '    object-fit: cover;' +
      '    border: 1px solid #e2e8f0;' +
      '  }' +
      '  #view_2292 td[class*="field_771"] br { display: none; }' +

      // ── NVR + Other Equipment + Services tables ─────────────
      // No images — let columns reflow naturally.
      '  #view_2294 table, #view_2296 table, #view_2809 table, #view_2299 table,' +
      '  #view_2391 table {' +
      '    table-layout: auto;' +
      '  }' +
      // Hide selection checkboxes (data already in DOM, control unneeded).
      '  th.ktlCheckboxHeaderCell, td.ktlCheckboxCell { display: none !important; }' +

      // ── Cabling + Camera Mounting summary blocks ────────────
      '  #view_2803 section.columns, #view_2804 section.columns {' +
      '    display: flex !important; gap: 16px; align-items: flex-start;' +
      '    page-break-inside: avoid; break-inside: avoid;' +
      '  }' +
      '  #view_2803 .kn-detail-body p, #view_2804 .kn-detail-body p { font-size: 10.5px !important; }' +
      '  #view_2803 .kn-detail-label, #view_2804 .kn-detail-label { font-size: 11px !important; }' +

      // ── Documents — show image at reasonable size ───────────
      '  #view_2299 td.field_754 img {' +
      '    max-width: 100% !important; max-height: 5in !important;' +
      '    height: auto !important;' +
      '  }' +

      // ── Logo header ─────────────────────────────────────────
      '  #view_2308 img { max-height: 38px !important; width: auto !important; }' +
      '  #view_2291 h3 { color: #0f4c75 !important; font-size: 16px !important; }' +

      // ── Footer license band ─────────────────────────────────
      '  #view_2811 p { font-size: 9px !important; color: #64748b !important; text-align: center; }' +

      // ── Hide stepper card itself (defensive — already removed' +
      //    from sceneClone, but if anything sneaks through, kill it
      //    via CSS too).
      '  #scw-sow-pdf-stepper { display: none !important; }' +

      // ── Break hints ─────────────────────────────────────────
      // Major section starts shouldn\'t orphan their heading at the
      // bottom of a page.
      '  h2, h3 { page-break-after: avoid; break-after: avoid; }' +
      '}'.slice(0, 0) + // (no-op, keeps the rule list flat)
      '</style>'
    );

    parts.push('</head>');
    parts.push('<body>');
    parts.push(sceneClone.outerHTML);
    parts.push('</body>');
    parts.push('</html>');

    return parts.join('\n');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  // ── Click handler — scrape + POST ───────────────────────────
  function onClick() {
    var host = document.getElementById(HOST_ID);
    if (!host || host.classList.contains('is-busy') || host.classList.contains('is-done')) return;

    var sowId = getSowId();
    if (!sowId) {
      setState('is-error', 'Could not identify SOW', 'No SOW id in the page URL. Try reloading.');
      return;
    }

    var scene = document.getElementById('kn-' + SCENE_ID);
    if (!scene) {
      setState('is-error', 'Page not ready', 'Scope of Work content has not loaded yet.');
      return;
    }

    setState('is-busy', 'Generating SOW PDF…', 'Sending the page to PDF generation.');

    // Scrape: use the entire scene container's HTML so Make receives the
    // rendered, styled content — including all tables, photos, and the
    // header detail block. We exclude the stepper itself so it doesn't
    // appear in the generated PDF.
    var sceneClone = scene.cloneNode(true);
    var stepperInClone = sceneClone.querySelector('#' + HOST_ID);
    if (stepperInClone && stepperInClone.parentNode) {
      stepperInClone.parentNode.removeChild(stepperInClone);
    }

    var webhook = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_GENERATE_SOW_PDF_WEBHOOK) || '';
    if (!webhook) {
      setState('is-error', 'Webhook not configured', 'MAKE_GENERATE_SOW_PDF_WEBHOOK is empty in config.js.');
      return;
    }

    // Build a complete, standalone HTML document with embedded styles
    // and external stylesheet refs — what a PDF renderer actually needs.
    var fullHtml = buildStandaloneHtml(sceneClone);

    // Scrape sanity metadata — sent alongside the html so Make can see
    // at-a-glance whether the scrape captured everything, even when the
    // html field is too long to inspect directly in the Make UI.
    var sceneBodyHtml  = sceneClone.outerHTML;
    var viewCount      = sceneClone.querySelectorAll('.kn-view').length;
    var rowCount       = sceneClone.querySelectorAll('tr').length;
    var imgCount       = sceneClone.querySelectorAll('img').length;
    var tableCount     = sceneClone.querySelectorAll('table').length;
    var styleTagCount  = (fullHtml.match(/<style\b/g) || []).length;
    var linkTagCount   = (fullHtml.match(/<link\b/g)  || []).length;

    var payload = {
      stepId:         'generate-sow-pdf',
      sourceRecordId: sowId,
      html:           fullHtml,
      // ── Sanity metadata: surface scrape coverage in Make without
      //    having to scroll through the html string. If these numbers
      //    look wrong (e.g. viewCount: 0, rowCount: 0), the scrape
      //    grabbed the page before Knack finished rendering — reload
      //    and try again.
      htmlBytes:      fullHtml.length,
      bodyBytes:      sceneBodyHtml.length,
      viewCount:      viewCount,
      tableCount:     tableCount,
      rowCount:       rowCount,
      imgCount:       imgCount,
      styleTagCount:  styleTagCount,
      linkTagCount:   linkTagCount,
      pageTitle:      document.title || '',
      pageUrl:        window.location.href,
      triggeredBy:    getTriggeredBy()
    };

    // eslint-disable-next-line no-console
    console.log('[SCW SOW PDF] scrape summary', {
      sowId:      sowId,
      htmlBytes:  fullHtml.length,
      bodyBytes:  sceneBodyHtml.length,
      viewCount:  viewCount,
      tableCount: tableCount,
      rowCount:   rowCount,
      imgCount:   imgCount,
      url:        webhook
    });
    // Stash the full HTML on window so you can grab it from DevTools:
    //   copy(window.__scwSowPdfLastHtml)
    // → pastes the exact document we sent to Make into your clipboard,
    //   ready to drop into a .html file or paste into any renderer.
    try { window.__scwSowPdfLastHtml = fullHtml; } catch (e) { /* ignore */ }

    // ──────────────────────────────────────────────────────────
    // POST as application/json — same wire format ops-stepper.js
    // uses for publish-proposals. Make's webhook auto-parses the JSON
    // body, so {{1.html}} in the next module is the raw HTML string
    // with real " and real newlines — pipe it straight into the PDF
    // converter, no JSON Parse / Unescape step needed.
    //
    // If a previous version of this webhook was configured against a
    // different shape (e.g. multipart), open it in Make and click
    // "Redetermine data structure" so {{1.html}} reappears as a
    // first-class field.
    // ──────────────────────────────────────────────────────────
    fetch(webhook, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    })
      .then(function (resp) {
        if (resp.ok) {
          setState('is-done',
            'SOW sent for PDF generation',
            'Make is rendering the PDF and depositing it shortly.');
        } else {
          setState('is-error',
            'PDF generation failed',
            'Webhook returned ' + resp.status + '. Try again.');
        }
      })
      .catch(function () {
        // CORS / no-response: webhook fired and Make is handling the
        // deposit out-of-band. Treat as success.
        setState('is-done',
          'SOW sent for PDF generation',
          'Make is rendering the PDF and depositing it shortly.');
      });
  }

  // ── Bindings ────────────────────────────────────────────────
  injectStyles();

  if (window.SCW && typeof SCW.onSceneRender === 'function') {
    SCW.onSceneRender(SCENE_ID, function () {
      // Defer slightly so other modules that may also insert at the top
      // of the scene settle first.
      setTimeout(mount, 50);
    }, 'scwSowPdfStepper');
  } else {
    $(document)
      .off('knack-scene-render.' + SCENE_ID + NS)
      .on('knack-scene-render.' + SCENE_ID + NS, function () {
        setTimeout(mount, 50);
      });
  }

  // First load: if we land directly on this scene, mount once the DOM
  // is in place.
  if (document.getElementById('kn-' + SCENE_ID)) {
    setTimeout(mount, 50);
  }
})();
/*** END SOW PDF stepper ******************************************************/
