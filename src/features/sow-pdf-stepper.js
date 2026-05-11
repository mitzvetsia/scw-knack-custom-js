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

    var payload = {
      stepId:         'generate-sow-pdf',
      sourceRecordId: sowId,
      html:           sceneClone.outerHTML,
      pageTitle:      document.title || '',
      pageUrl:        window.location.href,
      triggeredBy:    getTriggeredBy()
    };

    var webhook = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_GENERATE_SOW_PDF_WEBHOOK) || '';
    if (!webhook) {
      setState('is-error', 'Webhook not configured', 'MAKE_GENERATE_SOW_PDF_WEBHOOK is empty in config.js.');
      return;
    }

    $.ajax({
      url:         webhook,
      method:      'POST',
      contentType: 'application/json',
      data:        JSON.stringify(payload),
      timeout:     60000
    })
      .done(function (resp) {
        // Treat any 200 as success — Make handles deposit, no polling.
        var ok = !resp || resp.success !== false;
        if (ok) {
          setState('is-done',
            'SOW sent for PDF generation',
            'Make is rendering the PDF and depositing it shortly.');
        } else {
          setState('is-error',
            'PDF generation failed',
            (resp && resp.error) || 'Unknown error returned from Make.');
        }
      })
      .fail(function (xhr) {
        // status 0 = CORS/no-response — common when Make returns before
        // the browser's preflight resolves. Treat as success since the
        // webhook fired and Make is handling the deposit out-of-band.
        if (xhr && xhr.status === 0) {
          setState('is-done',
            'SOW sent for PDF generation',
            'Make is rendering the PDF and depositing it shortly.');
          return;
        }
        setState('is-error',
          'PDF generation failed',
          'Webhook returned ' + (xhr && xhr.status ? xhr.status : 'error') + '. Try again.');
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
