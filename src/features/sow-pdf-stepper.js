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
      // ── Pending / busy (per-step) ──
      '#' + HOST_ID + ' .scw-step-action.is-busy {',
      '  cursor: progress;',
      '  background: rgba(41,95,145,0.04);',
      '  border-color: var(--scw-step-accent);',
      '}',
      '#' + HOST_ID + ' .scw-step-action.is-busy .scw-step-icon svg {',
      '  animation: scw-sow-spin 0.9s linear infinite;',
      '}',
      '@keyframes scw-sow-spin { to { transform: rotate(360deg); } }',
      // ── Completed (success, per-step) ──
      '#' + HOST_ID + ' .scw-step-action.is-done {',
      '  --scw-step-accent: #16a34a;',
      '  cursor: default;',
      '  background: rgba(22,163,74,0.06);',
      '  border-color: #16a34a;',
      '}',
      '#' + HOST_ID + ' .scw-step-action.is-done:hover { background: rgba(22,163,74,0.06); }',
      '#' + HOST_ID + ' .scw-step-action.is-done .scw-step-icon {',
      '  background: rgba(22,163,74,0.14); color: #16a34a;',
      '}',
      // ── Error (per-step) ──
      '#' + HOST_ID + ' .scw-step-action.is-error {',
      '  --scw-step-accent: #b45309;',
      '  background: rgba(180,83,9,0.04);',
      '  border-color: #d97706;',
      '}',
      '#' + HOST_ID + ' .scw-step-action.is-error .scw-step-icon {',
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
  var ICON_CAMERA =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>' +
    '<circle cx="12" cy="13" r="4"/>' +
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

  // ── Step config — registry of all stepper actions ───────────
  // Each step is independent: its own card, its own state (idle /
  // busy / done / error), its own htmlBuilder. To add a new step,
  // append an entry here and write the htmlBuilder.
  var STEPS = [
    {
      id:        'generate-sow-pdf',
      title:     'Generate SOW PDF',
      sub:       'Convert this Scope of Work to a PDF.',
      icon:      ICON_PDF,
      busyTitle: 'Generating SOW PDF…',
      busySub:   'Sending the page to PDF generation.',
      doneTitle: 'SOW sent for PDF generation',
      doneSub:   'Make is rendering the PDF and depositing it shortly.',
      buildHtml: function (scene) {
        // Clone the scene, strip the stepper card from the clone (it
        // shouldn\'t appear in the rendered PDF), then wrap the markup
        // in a complete standalone HTML document.
        var clone = scene.cloneNode(true);
        var inClone = clone.querySelector('#' + HOST_ID);
        if (inClone && inClone.parentNode) inClone.parentNode.removeChild(inClone);
        return buildStandaloneHtml(clone);
      },
      lastHtmlVar: '__scwSowPdfLastHtml'
    },
    {
      id:        'generate-location-approval-pdf',
      title:     'Generate Location Approval Form',
      sub:       'Build the customer-facing camera-mounting approval PDF.',
      icon:      ICON_CAMERA,
      busyTitle: 'Generating Location Approval Form…',
      busySub:   'Sending the page to PDF generation.',
      doneTitle: 'Location Approval Form sent for PDF generation',
      doneSub:   'Make is rendering the PDF and depositing it shortly.',
      buildHtml: function (scene) {
        return buildLocationApprovalHtml(scene);
      },
      lastHtmlVar: '__scwLocationApprovalLastHtml'
    }
  ];

  function findStep(stepId) {
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i].id === stepId) return STEPS[i];
    }
    return null;
  }

  // ── Mount ───────────────────────────────────────────────────
  // Top of scene: insert before the first existing view group so it
  // sits above the logo + project header block. Renders one card per
  // STEPS entry.
  function mount() {
    var scene = document.getElementById('kn-' + SCENE_ID);
    if (!scene) return;
    if (scene.querySelector('#' + HOST_ID)) return;

    var host = document.createElement('div');
    host.id = HOST_ID;
    host.innerHTML = STEPS.map(function (step) {
      return (
        '<div class="scw-step-action" role="button" tabindex="0" ' +
             'data-step="' + escapeAttr(step.id) + '">' +
        '  <span class="scw-step-icon">' + step.icon + '</span>' +
        '  <span class="scw-step-body">' +
        '    <span class="scw-step-title">' + escapeHtml(step.title) + '</span>' +
        '    <span class="scw-step-sub">'   + escapeHtml(step.sub)   + '</span>' +
        '  </span>' +
        '</div>'
      );
    }).join('');

    scene.insertBefore(host, scene.firstChild);

    Array.prototype.forEach.call(host.querySelectorAll('.scw-step-action'), function (btn) {
      btn.addEventListener('click', function (e) {
        var stepId = e.currentTarget.getAttribute('data-step');
        runStep(stepId);
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var stepId = e.currentTarget.getAttribute('data-step');
          runStep(stepId);
        }
      });
    });
  }

  // ── State transitions (per step card) ───────────────────────
  function setState(stepId, state, title, sub) {
    var host = document.getElementById(HOST_ID);
    if (!host) return;
    var btn = host.querySelector('[data-step="' + stepId + '"]');
    if (!btn) return;
    btn.classList.remove('is-busy', 'is-done', 'is-error');
    if (state) btn.classList.add(state);

    var step = findStep(stepId);
    var iconEl  = btn.querySelector('.scw-step-icon');
    var titleEl = btn.querySelector('.scw-step-title');
    var subEl   = btn.querySelector('.scw-step-sub');
    if (iconEl) {
      iconEl.innerHTML =
        state === 'is-busy'  ? ICON_SPIN  :
        state === 'is-done'  ? ICON_CHECK :
        state === 'is-error' ? ICON_WARN  : (step ? step.icon : ICON_PDF);
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

  // ── Location Approval Form HTML builder ─────────────────────
  // Same source data as the SOW PDF, different layout. Scrapes the
  // live scene for project header, cameras, equipment, services, and
  // assumptions; builds a fresh standalone HTML document tuned for
  // the customer-facing approval workflow:
  //   • compact project header on every page (title, project,
  //     proposal)
  //   • "Approved By" signature box + instructional callout (page 1)
  //   • per-camera row with an "Initials" gutter the customer signs
  //     off in
  //   • equipment, services, and assumptions sections at the back
  //
  // Layout is intentionally portrait (matches the reference PDF the
  // customer is used to seeing). All CSS is inline in the generated
  // doc — we don't pull Knack's stylesheets — so the output renders
  // identically in any HTML→PDF service.
  function buildLocationApprovalHtml(scene) {
    function txt(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

    // ── Project header ───────────────────────────────────────
    var projectName = txt(scene.querySelector('#view_998 .field_666 .kn-detail-body'));
    var projectTitle = txt(scene.querySelector('#view_998 .field_683 .kn-detail-body'));
    var proposal    = txt(scene.querySelector('#view_998 .field_874 .kn-detail-body'));
    var address     = (scene.querySelector('#view_998 .field_22 .kn-detail-body span span') ||
                       scene.querySelector('#view_998 .field_22 .kn-detail-body'));
    var addressHtml = address ? address.innerHTML : '';

    // ── Cameras (view_2292) ──────────────────────────────────
    var cameraRowsHtml = '';
    var cameraCount = 0;
    var camTbody = scene.querySelector('#view_2292 table tbody');
    if (camTbody) {
      var camRows = camTbody.querySelectorAll('tr');
      for (var i = 0; i < camRows.length; i++) {
        var tr = camRows[i];
        var idCell    = tr.querySelector('td.field_71');
        var prodCell  = tr.querySelector('td.field_1485');
        var notesCell = tr.querySelector('td.field_32');
        var photoEls  = tr.querySelectorAll('td[class*="field_771"] img');

        var camId    = txt(idCell);
        var product  = txt(prodCell);
        var notes    = txt(notesCell);
        if (!camId && !product) continue;

        // Pick the highest-resolution available image (img has both
        // a thumb src and a data-kn-img-gallery original) — full
        // resolution renders crisper at print scale.
        var photoSrcs = [];
        for (var p = 0; p < photoEls.length; p++) {
          var fullSrc = photoEls[p].getAttribute('data-kn-img-gallery') ||
                        photoEls[p].getAttribute('src') || '';
          if (fullSrc) photoSrcs.push(fullSrc);
        }
        var photoHtml = photoSrcs.length
          ? photoSrcs.slice(0, 2).map(function (src) {
              return '<img src="' + escapeAttr(src) + '" alt="">';
            }).join('')
          : '<div class="laf-camera__photo-empty">No photo</div>';

        cameraRowsHtml +=
          '<div class="laf-camera-row">' +
          '  <div class="laf-camera__initials">' +
          '    <div class="laf-camera__initials-label">Initials</div>' +
          '  </div>' +
          '  <div class="laf-camera__content">' +
          '    <div class="laf-camera__id">' + escapeHtml(camId) + '</div>' +
          '    <div class="laf-camera__product">' + escapeHtml(product) + '</div>' +
          '    <div class="laf-camera__photo">' + photoHtml + '</div>' +
          '    <div class="laf-camera__notes">' +
                  (notes ? escapeHtml(notes) : '<span class="laf-muted">General coverage</span>') +
          '    </div>' +
          '  </div>' +
          '</div>';
        cameraCount++;
      }
    }

    // ── NVR + headend networking equipment (view_2294) ───────
    var headendRowsHtml = '';
    var headendTbody = scene.querySelector('#view_2294 table tbody');
    if (headendTbody) {
      var hRows = headendTbody.querySelectorAll('tr');
      for (var hi = 0; hi < hRows.length; hi++) {
        var hRow = hRows[hi];
        var hProd  = txt(hRow.querySelector('td.field_1491'));
        var hLoc   = txt(hRow.querySelector('td.field_30'));
        var hNotes = txt(hRow.querySelector('td.field_121'));
        if (!hProd) continue;
        headendRowsHtml +=
          '<tr>' +
          '<td>' + escapeHtml(hProd)  + '</td>' +
          '<td>' + escapeHtml(hLoc)   + '</td>' +
          '<td>' + escapeHtml(hNotes) + '</td>' +
          '</tr>';
      }
    }

    // ── Other equipment (view_2296) ──────────────────────────
    var equipRowsHtml = '';
    var equipTbody = scene.querySelector('#view_2296 table tbody');
    if (equipTbody) {
      var eRows = equipTbody.querySelectorAll('tr');
      for (var ei = 0; ei < eRows.length; ei++) {
        var eRow = eRows[ei];
        var eProd  = txt(eRow.querySelector('td.field_1497'));
        var eQty   = txt(eRow.querySelector('td.field_1500'));
        var eNotes = txt(eRow.querySelector('td.field_129'));
        if (!eProd) continue;
        equipRowsHtml +=
          '<tr>' +
          '<td>' + escapeHtml(eProd)  + '</td>' +
          '<td class="laf-num">' + escapeHtml(eQty) + '</td>' +
          '<td>' + escapeHtml(eNotes) + '</td>' +
          '</tr>';
      }
    }

    // ── Service descriptions (cabling / mounting / NVR provisioning) ──
    function pickHtml(sel) {
      var el = scene.querySelector(sel);
      return el ? el.innerHTML : '';
    }
    var cablingHtml   = pickHtml('#view_2803 .field_1710 .kn-detail-body span');
    var mountingHtml  = pickHtml('#view_2804 .field_1709 .kn-detail-body span');
    var nvrProvHtml   = pickHtml('#view_2802 .field_1711 .kn-detail-body span');

    // ── Additional / "Other" services bulleted list (view_2809) ──
    var otherServicesHtml = '';
    var addlTbody = scene.querySelector('#view_2809 table tbody');
    if (addlTbody) {
      var addlRows = addlTbody.querySelectorAll('tr td.field_1715');
      for (var ai = 0; ai < addlRows.length; ai++) {
        otherServicesHtml += addlRows[ai].innerHTML;
      }
    }

    // ── Project Assumptions (view_2810 field_1210, hidden in DOM) ──
    var assumptionsHtml = '';
    var asEl = scene.querySelector('#view_2810 .field_1210 .kn-detail-body');
    if (asEl) assumptionsHtml = asEl.innerHTML;

    // ── Assemble the final document ──────────────────────────
    var html = [];
    html.push('<!DOCTYPE html>');
    html.push('<html lang="en"><head>');
    html.push('<meta charset="utf-8">');
    html.push('<base href="' + window.location.origin + '/">');
    html.push('<title>Location Approval Form — ' + escapeHtml(projectName) + '</title>');
    html.push('<style>');
    html.push(buildLafCss());
    html.push('</style>');
    html.push('</head><body>');

    // ── Page header (repeats on every page via running header) ──
    html.push('<header class="laf-header">');
    html.push('  <div class="laf-header__text">');
    html.push('    <h1>Location Approval Form</h1>');
    html.push('    <div class="laf-header__project">' + escapeHtml(projectName) + '</div>');
    if (proposal) {
      html.push('    <div class="laf-header__proposal">Proposal: ' + escapeHtml(proposal) + '</div>');
    }
    html.push('  </div>');
    html.push('  <div class="laf-header__logo">');
    html.push('    <img src="https://www.getscw.com/pub/media/logo/stores/1/logo-scw.jpeg" alt="SCW">');
    html.push('  </div>');
    html.push('</header>');

    // ── Approval signature block + instructional callout (page 1 only) ──
    html.push('<section class="laf-approval">');
    html.push('  <div class="laf-approval__signbox">');
    html.push('    <div class="laf-approval__signbox-header">Approved By</div>');
    html.push('    <div class="laf-approval__sign-fields">');
    html.push('      <div class="laf-approval__sign-row"></div>');
    html.push('      <div class="laf-approval__sign-label">Name</div>');
    html.push('      <div class="laf-approval__sign-row"></div>');
    html.push('      <div class="laf-approval__sign-label">Title</div>');
    html.push('      <div class="laf-approval__sign-row-half">');
    html.push('        <div>');
    html.push('          <div class="laf-approval__sign-row"></div>');
    html.push('          <div class="laf-approval__sign-label">Signature</div>');
    html.push('        </div>');
    html.push('        <div>');
    html.push('          <div class="laf-approval__sign-row"></div>');
    html.push('          <div class="laf-approval__sign-label">Date</div>');
    html.push('        </div>');
    html.push('      </div>');
    html.push('    </div>');
    html.push('  </div>');
    html.push('  <div class="laf-approval__callout">');
    html.push('    <p>Please initial to approve each camera location. Changes to camera location after approval may incur additional charges.</p>');
    html.push('    <p>Unless otherwise indicated, all cameras will be mounted on an electrical mounting box flush with the mounting surface.</p>');
    html.push('  </div>');
    html.push('</section>');

    // ── Cameras ──────────────────────────────────────────────
    if (cameraRowsHtml) {
      html.push('<section class="laf-section laf-cameras">');
      html.push('  <h2 class="laf-section__title">Camera Locations</h2>');
      html.push(cameraRowsHtml);
      html.push('</section>');
    }

    // ── Headend / networking equipment ───────────────────────
    if (headendRowsHtml) {
      html.push('<section class="laf-section">');
      html.push('  <h2 class="laf-section__title">Headend &amp; Networking Equipment</h2>');
      html.push('  <table class="laf-table">');
      html.push('    <thead><tr><th>Product</th><th>Location</th><th>Notes</th></tr></thead>');
      html.push('    <tbody>' + headendRowsHtml + '</tbody>');
      html.push('  </table>');
      html.push('</section>');
    }

    // ── Other equipment ──────────────────────────────────────
    if (equipRowsHtml) {
      html.push('<section class="laf-section">');
      html.push('  <h2 class="laf-section__title">Equipment</h2>');
      html.push('  <table class="laf-table">');
      html.push('    <thead><tr><th>Product</th><th class="laf-num">Qty</th><th>Notes</th></tr></thead>');
      html.push('    <tbody>' + equipRowsHtml + '</tbody>');
      html.push('  </table>');
      html.push('</section>');
    }

    // ── Installation services (cabling / mounting / NVR provisioning) ──
    var hasInstallText = !!(cablingHtml || mountingHtml || nvrProvHtml);
    if (hasInstallText) {
      html.push('<section class="laf-section">');
      html.push('  <h2 class="laf-section__title">Installation Services</h2>');
      if (cablingHtml)  { html.push('<h3 class="laf-section__sub">Cabling</h3>'         + cablingHtml); }
      if (mountingHtml) { html.push('<h3 class="laf-section__sub">Camera Mounting</h3>' + mountingHtml); }
      if (nvrProvHtml)  { html.push('<h3 class="laf-section__sub">NVR Provisioning &amp; Networking</h3>' + nvrProvHtml); }
      html.push('</section>');
    }

    if (otherServicesHtml) {
      html.push('<section class="laf-section">');
      html.push('  <h2 class="laf-section__title">Other Services</h2>');
      html.push('  <div class="laf-other-services">' + otherServicesHtml + '</div>');
      html.push('</section>');
    }

    // ── Project Assumptions ──────────────────────────────────
    if (assumptionsHtml) {
      html.push('<section class="laf-section laf-assumptions">');
      html.push('  <h2 class="laf-section__title">Project Assumptions</h2>');
      html.push('  <div class="laf-assumptions__body">' + assumptionsHtml + '</div>');
      html.push('</section>');
    }

    html.push('</body></html>');

    // Stash count for debug.
    try { window.__scwLastLafCameraCount = cameraCount; } catch (e) { /* ignore */ }

    return html.join('\n');
  }

  function buildLafCss() {
    return [
      '@page { size: letter portrait; margin: 0.45in 0.5in; }',
      '* { box-sizing: border-box; }',
      'html, body {',
      '  margin: 0; padding: 0;',
      '  font: 11px/1.45 -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;',
      '  color: #1e293b; background: #ffffff;',
      '}',
      // Header
      '.laf-header {',
      '  display: flex; align-items: flex-start; justify-content: space-between;',
      '  gap: 24px; padding-bottom: 10px;',
      '  border-bottom: 1px solid #cbd5e1; margin-bottom: 14px;',
      '}',
      '.laf-header h1 { font-size: 26px; color: #295F91; margin: 0 0 4px; font-weight: 700; }',
      '.laf-header__project { font-size: 14px; color: #1e293b; font-weight: 700; }',
      '.laf-header__proposal { font-size: 11px; color: #64748b; margin-top: 2px; }',
      '.laf-header__logo img { height: 42px; width: auto; }',
      // Approval block
      '.laf-approval {',
      '  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;',
      '  margin-bottom: 16px; page-break-inside: avoid; break-inside: avoid;',
      '}',
      '.laf-approval__signbox {',
      '  border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden;',
      '  background: #ffffff;',
      '}',
      '.laf-approval__signbox-header {',
      '  background: #eff6ff; padding: 8px 14px;',
      '  font-weight: 700; text-align: center; color: #1e293b;',
      '  border-bottom: 1px solid #cbd5e1;',
      '}',
      '.laf-approval__sign-fields { padding: 22px 22px 12px; }',
      '.laf-approval__sign-row {',
      '  border-bottom: 1px solid #475569;',
      '  height: 24px; margin-top: 14px;',
      '}',
      '.laf-approval__sign-label {',
      '  text-align: center; font-size: 10px; color: #64748b;',
      '  margin-top: 2px;',
      '}',
      '.laf-approval__sign-row-half { display: flex; gap: 24px; }',
      '.laf-approval__sign-row-half > div { flex: 1; }',
      '.laf-approval__callout {',
      '  background: #fef3e7; padding: 18px 22px; border-radius: 4px;',
      '}',
      '.laf-approval__callout p {',
      '  color: #295F91; font-size: 12px; margin: 0 0 10px;',
      '}',
      '.laf-approval__callout p:last-child { margin-bottom: 0; }',
      // Section chrome
      '.laf-section { margin: 14px 0; }',
      '.laf-section__title {',
      '  font-size: 18px; color: #295F91; margin: 0 0 8px;',
      '  font-weight: 700;',
      '}',
      '.laf-section__sub {',
      '  font-size: 13px; color: #1e293b; margin: 8px 0 4px; font-weight: 700;',
      '}',
      '.laf-section p, .laf-section ul, .laf-section li {',
      '  font-size: 11px; line-height: 1.45;',
      '}',
      '.laf-section ul { margin: 4px 0 8px 20px; padding: 0; }',
      // Camera row
      '.laf-camera-row {',
      '  display: grid; grid-template-columns: 110px 1fr;',
      '  border-bottom: 1px solid #cbd5e1;',
      '  page-break-inside: avoid; break-inside: avoid;',
      '}',
      '.laf-camera-row:nth-child(odd)  { background: #ffffff; }',
      '.laf-camera-row:nth-child(even) { background: #f8fafc; }',
      '.laf-camera__initials {',
      '  background: #e2e8f0; border-right: 1px solid #cbd5e1;',
      '  padding: 12px 8px; min-height: 130px;',
      '}',
      '.laf-camera__initials-label {',
      '  text-align: center; font-weight: 700; color: #475569;',
      '  font-size: 11px; padding: 4px 0;',
      '  border-bottom: 1px solid #94a3b8;',
      '}',
      '.laf-camera__content {',
      '  display: grid;',
      '  grid-template-columns: 70px minmax(0, 1.2fr) 170px minmax(0, 1.6fr);',
      '  gap: 14px; align-items: start;',
      '  padding: 12px 14px;',
      '}',
      '.laf-camera__id { font-weight: 700; color: #1e293b; font-size: 12px; }',
      '.laf-camera__product { color: #475569; font-size: 11px; }',
      '.laf-camera__photo img {',
      '  display: block; max-width: 160px; max-height: 120px;',
      '  width: auto; height: auto; object-fit: cover;',
      '  border: 1px solid #cbd5e1; border-radius: 2px;',
      '  margin-bottom: 4px;',
      '}',
      '.laf-camera__photo-empty {',
      '  width: 160px; height: 100px;',
      '  display: flex; align-items: center; justify-content: center;',
      '  border: 1px dashed #cbd5e1; color: #94a3b8;',
      '  font-size: 10px; border-radius: 2px;',
      '}',
      '.laf-camera__notes { color: #475569; font-size: 11px; line-height: 1.4; }',
      '.laf-muted { color: #94a3b8; font-style: italic; }',
      // Tables
      '.laf-table {',
      '  width: 100%; border-collapse: collapse; margin: 4px 0 8px;',
      '  font-size: 11px;',
      '}',
      '.laf-table thead th {',
      '  background: #f1f5f9; color: #1e293b;',
      '  font-size: 11px; font-weight: 700;',
      '  padding: 6px 10px; text-align: left;',
      '  border-bottom: 1px solid #cbd5e1;',
      '}',
      '.laf-table tbody td {',
      '  padding: 5px 10px; vertical-align: top;',
      '  border-bottom: 1px solid #e2e8f0;',
      '}',
      '.laf-table tbody tr:nth-child(even) td { background: #fafbfc; }',
      '.laf-table .laf-num { text-align: right; width: 60px; }',
      // Other services list
      '.laf-other-services ul { margin: 4px 0 4px 20px; padding: 0; }',
      '.laf-other-services li { margin: 3px 0; font-size: 11px; }',
      // Assumptions panel
      '.laf-assumptions {',
      '  background: #eff6ff; border: 1px solid #bfdbfe;',
      '  border-radius: 4px; padding: 14px 18px;',
      '  page-break-inside: avoid; break-inside: avoid;',
      '}',
      '.laf-assumptions .laf-section__title { margin-top: 0; }',
      '.laf-assumptions ul { margin: 6px 0 0 20px; padding: 0; }',
      '.laf-assumptions li { margin: 3px 0; font-size: 11px; }'
    ].join('\n');
  }

  // ── Click handler — scrape + POST ───────────────────────────
  function runStep(stepId) {
    var step = findStep(stepId);
    if (!step) return;

    var host = document.getElementById(HOST_ID);
    if (!host) return;
    var btn = host.querySelector('[data-step="' + stepId + '"]');
    if (!btn) return;
    if (btn.classList.contains('is-busy') || btn.classList.contains('is-done')) return;

    var sowId = getSowId();
    if (!sowId) {
      setState(stepId, 'is-error', 'Could not identify SOW', 'No SOW id in the page URL. Try reloading.');
      return;
    }

    var scene = document.getElementById('kn-' + SCENE_ID);
    if (!scene) {
      setState(stepId, 'is-error', 'Page not ready', 'Scope of Work content has not loaded yet.');
      return;
    }

    var webhook = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_GENERATE_SOW_PDF_WEBHOOK) || '';
    if (!webhook) {
      setState(stepId, 'is-error', 'Webhook not configured', 'MAKE_GENERATE_SOW_PDF_WEBHOOK is empty in config.js.');
      return;
    }

    setState(stepId, 'is-busy', step.busyTitle, step.busySub);

    // Build the HTML for whichever step we\'re running. Each step\'s
    // htmlBuilder owns its own scrape strategy and returns a complete
    // standalone <!DOCTYPE html>…</html> document.
    var fullHtml;
    try {
      fullHtml = step.buildHtml(scene);
    } catch (e) {
      console.error('[SCW SOW PDF] buildHtml threw for ' + stepId, e);
      setState(stepId, 'is-error', 'Could not build PDF document',
        e && e.message ? e.message : 'Unknown error during HTML construction.');
      return;
    }
    if (!fullHtml || typeof fullHtml !== 'string') {
      setState(stepId, 'is-error', 'Empty document', 'HTML builder returned no content.');
      return;
    }

    // Scrape sanity metadata for the JSON payload (lets Make see
    // coverage at a glance without inspecting the full html string).
    var imgCount       = (fullHtml.match(/<img\b/gi)   || []).length;
    var rowCount       = (fullHtml.match(/<tr\b/gi)    || []).length;
    var tableCount     = (fullHtml.match(/<table\b/gi) || []).length;
    var styleTagCount  = (fullHtml.match(/<style\b/g)  || []).length;
    var linkTagCount   = (fullHtml.match(/<link\b/g)   || []).length;

    var payload = {
      stepId:         stepId,
      sourceRecordId: sowId,
      html:           fullHtml,
      // ── Sanity metadata: surface scrape coverage in Make without
      //    having to scroll through the html string. If these numbers
      //    look wrong (e.g. rowCount: 0), the scrape grabbed the page
      //    before Knack finished rendering — reload and try again.
      htmlBytes:      fullHtml.length,
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
      stepId:     stepId,
      sowId:      sowId,
      htmlBytes:  fullHtml.length,
      tableCount: tableCount,
      rowCount:   rowCount,
      imgCount:   imgCount,
      url:        webhook
    });
    // Stash the full HTML on window so you can grab it from DevTools:
    //   copy(window.__scwSowPdfLastHtml)            ← SOW build
    //   copy(window.__scwLocationApprovalLastHtml)  ← LAF build
    // → pastes the exact document we sent to Make into your clipboard,
    //   ready to drop into a .html file or paste into any renderer.
    try { window[step.lastHtmlVar] = fullHtml; } catch (e) { /* ignore */ }

    // ──────────────────────────────────────────────────────────
    // POST as application/json — same wire format ops-stepper.js
    // uses for publish-proposals. Make's webhook auto-parses the JSON
    // body, so {{1.html}} in the next module is the raw HTML string
    // with real " and real newlines — pipe it straight into the PDF
    // converter, no JSON Parse / Unescape step needed.
    //
    // Make branches on payload.stepId to decide which downstream
    // path to run (SOW PDF vs Location Approval Form vs anything we
    // add later) and where to deposit the rendered file.
    // ──────────────────────────────────────────────────────────
    fetch(webhook, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    })
      .then(function (resp) {
        if (resp.ok) {
          setState(stepId, 'is-done', step.doneTitle, step.doneSub);
        } else {
          setState(stepId, 'is-error',
            'PDF generation failed',
            'Webhook returned ' + resp.status + '. Try again.');
        }
      })
      .catch(function () {
        // CORS / no-response: webhook fired and Make is handling the
        // deposit out-of-band. Treat as success.
        setState(stepId, 'is-done', step.doneTitle, step.doneSub);
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
