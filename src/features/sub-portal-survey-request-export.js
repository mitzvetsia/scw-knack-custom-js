/*** SUBCONTRACTOR PORTAL — SURVEY REQUEST EXPORT (view_3825) ***/
/*
 * Adds a "Regenerate Survey Field PDF" button below the field_2356 detail row
 * on the subcontractor-portal survey request details page (scene_1140).
 *
 * Reuses SCW.surveyWorksheetPdf.scrape / buildHtml to produce the same
 * payload shape as the tech-side survey-worksheet-pdf-export:
 *   { viewId, formViewId, recordId, title, surveyRequest, rowCount, html }
 *
 * The subcontractor portal renders the survey worksheet in view_3505, so
 * we scrape that view. If no rows are found, we still POST a minimal
 * payload (recordId + title) so Make has a trigger record.
 *
 * After POSTing, the field_2356 detail row is grayed out with a
 * "Generating…" overlay. We poll view_3825 every few seconds until
 * field_2356's content changes (indicating Make has written the new
 * PDF reference back) or a timeout elapses.
 */
(function () {
  'use strict';

  var DETAIL_VIEW     = 'view_3825';
  var TARGET_FIELD    = 'field_2356';
  var WORKSHEET_VIEW  = 'view_3505';
  var TITLE_VIEW      = 'view_3504';
  var TITLE_FIELD     = 'field_666';
  var SURVEY_ID_FIELD = 'field_2345';
  var WEBHOOK_URL     = 'https://hook.us1.make.com/u7x7hxladwuk6sgk4gzcqvwqgm3vpeza';
  var FORM_VIEW_ID    = 'view_3809';

  var POLL_INTERVAL_MS = 4000;
  var POLL_TIMEOUT_MS  = 180000; // 3 minutes — PDF generation can take a while

  var BTN_ID       = 'scw-sub-portal-survey-export-btn';
  var WRAP_ID      = 'scw-sub-portal-survey-export-wrap';
  var CSS_ID       = 'scw-sub-portal-survey-export-css';
  var TOAST_ID     = 'scw-sub-portal-survey-export-toast';
  var OVERLAY_CLS  = 'scw-sp-sx-generating';
  var EVENT_NS     = '.scwSubPortalSurveyExport';

  // Poll state
  var _pollTimer     = null;
  var _pollActive    = false;
  var _pollInitial   = '';
  var _pollStartedAt = 0;

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '#' + WRAP_ID + ' {',
      '  display: flex; justify-content: flex-start; margin: 10px 0 16px;',
      '}',
      '#' + BTN_ID + ' {',
      '  display: inline-flex; align-items: center; gap: 8px;',
      '  padding: 9px 18px; border: none; border-radius: 6px;',
      '  background: #0891b2; color: #fff !important;',
      '  font: 600 13px/1 system-ui, -apple-system, sans-serif;',
      '  cursor: pointer; text-decoration: none;',
      '  transition: filter .15s, opacity .15s;',
      '  box-shadow: 0 1px 2px rgba(0,0,0,.1);',
      '}',
      '#' + BTN_ID + ':hover { filter: brightness(.92); }',
      '#' + BTN_ID + ':disabled { opacity: .55; cursor: not-allowed; }',
      '#' + BTN_ID + ' .scw-sp-sx-spin {',
      '  width: 13px; height: 13px; border: 2px solid rgba(255,255,255,.35);',
      '  border-top-color: #fff; border-radius: 50%;',
      '  animation: scwSpSxSpin .8s linear infinite;',
      '}',
      '@keyframes scwSpSxSpin { to { transform: rotate(360deg); } }',
      '#' + TOAST_ID + ' {',
      '  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);',
      '  background: #1e3a5f; color: #fff; padding: 12px 20px;',
      '  border-radius: 8px; font: 500 13px/1.3 system-ui, sans-serif;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,.18); z-index: 10000;',
      '  max-width: 420px; text-align: center;',
      '  display: flex; align-items: center; gap: 10px;',
      '}',
      '#' + TOAST_ID + '.is-success { background: #059669; }',
      '#' + TOAST_ID + '.is-error   { background: #b91c1c; }',
      '#' + TOAST_ID + ' .scw-sp-sx-toast-spin {',
      '  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.35);',
      '  border-top-color: #fff; border-radius: 50%;',
      '  animation: scwSpSxSpin .8s linear infinite; flex-shrink: 0;',
      '}',
      // Field overlay — grays out the existing content and pins a
      // centered "Generating…" message on top.
      '.kn-detail.' + TARGET_FIELD + '.' + OVERLAY_CLS + ' {',
      '  position: relative !important;',
      '}',
      '.kn-detail.' + TARGET_FIELD + '.' + OVERLAY_CLS + ' > * {',
      '  opacity: .35; pointer-events: none; filter: grayscale(1);',
      '}',
      '.kn-detail.' + TARGET_FIELD + '.' + OVERLAY_CLS + '::after {',
      '  content: attr(data-scw-overlay-msg);',
      '  position: absolute; top: 0; left: 0; right: 0; bottom: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '  background: rgba(255,255,255,.82); border-radius: 6px; z-index: 5;',
      '  color: #1e3a5f; font: 600 13px/1.3 system-ui, sans-serif;',
      '  padding: 10px 14px; text-align: center;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Toast helpers ──

  function showToast(msg, variant, autoHideMs, withSpinner) {
    var existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = TOAST_ID;
    if (variant) toast.classList.add('is-' + variant);
    if (withSpinner) {
      var sp = document.createElement('span');
      sp.className = 'scw-sp-sx-toast-spin';
      toast.appendChild(sp);
    }
    toast.appendChild(document.createTextNode(msg));
    document.body.appendChild(toast);
    if (autoHideMs) {
      setTimeout(function () {
        if (toast.parentNode) toast.remove();
      }, autoHideMs);
    }
    return toast;
  }

  function hideToast() {
    var t = document.getElementById(TOAST_ID);
    if (t) t.remove();
  }

  // ── Field overlay ──

  function applyOverlay(msg) {
    var viewEl = document.getElementById(DETAIL_VIEW);
    if (!viewEl) return;
    var detail = viewEl.querySelector('.kn-detail.' + TARGET_FIELD);
    if (!detail) return;
    detail.classList.add(OVERLAY_CLS);
    detail.setAttribute('data-scw-overlay-msg', msg || 'Generating Survey Field PDF…');
  }

  function clearOverlay() {
    var nodes = document.querySelectorAll('.kn-detail.' + TARGET_FIELD + '.' + OVERLAY_CLS);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.remove(OVERLAY_CLS);
      nodes[i].removeAttribute('data-scw-overlay-msg');
    }
  }

  // ── Record ID & title discovery ──

  function getRecordIdFromDetail() {
    var view = Knack && Knack.views && Knack.views[DETAIL_VIEW];
    if (view && view.model && view.model.id) return view.model.id;
    if (view && view.model && view.model.attributes && view.model.attributes.id) {
      return view.model.attributes.id;
    }
    var hash = window.location.hash || '';
    var m = hash.match(/\/([0-9a-f]{24})(?:\?|$)/i);
    return m ? m[1] : '';
  }

  function readDetailField(viewId, fieldKey) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return '';
    var detail = viewEl.querySelector('.kn-detail.' + fieldKey + ' .kn-detail-body');
    if (!detail) return '';
    return (detail.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function readTargetFieldSignature() {
    // Prefer the href of any link in the field cell — that changes when
    // Make uploads a new PDF version, even if the visible filename is
    // the same. Fall back to trimmed textContent.
    var viewEl = document.getElementById(DETAIL_VIEW);
    if (!viewEl) return '';
    var body = viewEl.querySelector('.kn-detail.' + TARGET_FIELD + ' .kn-detail-body');
    if (!body) return '';
    var link = body.querySelector('a[href]');
    if (link) return (link.getAttribute('href') || '').trim();
    return (body.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function getTitle() {
    var val = readDetailField(TITLE_VIEW, TITLE_FIELD);
    if (val) return val;
    return (document.title || '').replace(/\s+/g, ' ').trim();
  }

  function getSurveyRequestId() {
    return readDetailField(TITLE_VIEW, SURVEY_ID_FIELD);
  }

  // ── Payload build ──

  function buildPayload() {
    var recordId      = getRecordIdFromDetail();
    var title         = getTitle();
    var surveyRequest = getSurveyRequestId();
    var html          = '';
    var rowCount      = 0;

    var api = window.SCW && window.SCW.surveyWorksheetPdf;
    if (api && typeof api.scrape === 'function' && typeof api.buildHtml === 'function') {
      try {
        var scraped = api.scrape(WORKSHEET_VIEW);
        if (scraped) {
          rowCount = (scraped.rows && scraped.rows.length) || 0;
          if (rowCount > 0) {
            scraped.title = title;
            if (surveyRequest) scraped.surveyId = surveyRequest;
            html = api.buildHtml(scraped);
          }
        }
      } catch (err) {
        console.warn('[SCW sub-portal survey export] scrape failed', err);
      }
    }

    return {
      viewId:        WORKSHEET_VIEW,
      formViewId:    FORM_VIEW_ID,
      recordId:      recordId,
      title:         title,
      surveyRequest: surveyRequest,
      rowCount:      rowCount,
      html:          html
    };
  }

  // ── Polling ──

  function stopPolling(finalToast) {
    _pollActive = false;
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    clearOverlay();
    if (finalToast) {
      showToast(finalToast.msg, finalToast.variant, 4000);
    } else {
      hideToast();
    }
    var btn = document.getElementById(BTN_ID);
    if (btn) resetButton(btn);
  }

  function startPolling() {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollActive    = true;
    _pollInitial   = readTargetFieldSignature();
    _pollStartedAt = Date.now();

    applyOverlay('Generating Survey Field PDF…');
    showToast('Generating Survey Field PDF…', null, 0, true);

    // Re-apply overlay whenever view_3825 re-renders (model.fetch triggers
    // a re-render that blows away our class). If the field has changed,
    // that render will bring the new value and we can stop polling.
    $(document).off('knack-view-render.' + DETAIL_VIEW + EVENT_NS + '.poll');
    $(document).on('knack-view-render.' + DETAIL_VIEW + EVENT_NS + '.poll', function () {
      if (!_pollActive) return;
      var current = readTargetFieldSignature();
      if (current && current !== _pollInitial) {
        stopPolling({ msg: 'Survey Field PDF updated.', variant: 'success' });
        return;
      }
      // Re-apply overlay onto the freshly rendered detail row
      applyOverlay('Generating Survey Field PDF…');
    });

    _pollTimer = setInterval(function () {
      if (!_pollActive) return;

      // Direct field check — catches cases where model.fetch doesn't
      // trigger a re-render.
      var current = readTargetFieldSignature();
      if (current && current !== _pollInitial) {
        stopPolling({ msg: 'Survey Field PDF updated.', variant: 'success' });
        return;
      }

      if (Date.now() - _pollStartedAt >= POLL_TIMEOUT_MS) {
        stopPolling({
          msg: 'Still generating — refresh the page in a minute to see the new PDF.',
          variant: 'error'
        });
        return;
      }

      // Fetch fresh data for view_3825 (drives field_2356 refresh)
      if (typeof Knack !== 'undefined' && Knack.views && Knack.views[DETAIL_VIEW]) {
        var model = Knack.views[DETAIL_VIEW].model;
        if (model && typeof model.fetch === 'function') model.fetch();
      }
    }, POLL_INTERVAL_MS);
  }

  // ── Button state ──

  function setButtonBusy(btn, labelText) {
    btn.disabled = true;
    var labelSpan = btn.querySelector('.scw-sp-sx-label');
    var iconSpan  = btn.querySelector('.scw-sp-sx-icon');
    if (labelSpan) labelSpan.textContent = labelText || 'Working…';
    if (iconSpan)  iconSpan.innerHTML = '<span class="scw-sp-sx-spin"></span>';
  }

  function resetButton(btn) {
    var labelSpan = btn.querySelector('.scw-sp-sx-label');
    var iconSpan  = btn.querySelector('.scw-sp-sx-icon');
    if (labelSpan) labelSpan.textContent = 'Regenerate Survey Field PDF';
    if (iconSpan)  iconSpan.textContent = '↪';
    btn.disabled = false;
  }

  // ── Send ──

  // Gate: WORKSHEET_VIEW must have been transformed by device-worksheet
  // before scrape can pull device cards. Without this guard, a user
  // who clicks Submit before the page is fully ready gets a PDF with
  // only L1 group headers and notes — the cards aren't in the DOM
  // yet. Check for the .scw-ws-row card shells device-worksheet
  // creates after its transform completes.
  function worksheetReady() {
    var view = document.getElementById(WORKSHEET_VIEW);
    if (!view) return false;
    return !!view.querySelector('tr.scw-ws-row');
  }

  function sendPayload(btn) {
    if (!worksheetReady()) {
      console.warn('[SCW sub-portal survey] worksheet not ready — view ' +
        WORKSHEET_VIEW + ' has no .scw-ws-row card shells. Aborting.');
      showToast(
        'Page still loading — please wait for the device worksheet to finish rendering, then try again.',
        'error', 6000
      );
      return;
    }

    var payload = buildPayload();
    if (!payload.recordId) {
      showToast('Could not determine survey request record ID.', 'error', 5000);
      return;
    }

    // Show the overlay and start polling IMMEDIATELY on click. Make's
    // scenario holds the HTTP request open until the PDF is fully
    // generated (often 30–90s) and only THEN fires its Webhook
    // Response module. If we waited for jQuery's success callback to
    // flip the UI to "Generating…", the overlay would appear right as
    // generation finishes — exactly backwards from what the user
    // expects. The polling loop is harmless either way: it stops on
    // the first cycle that sees field_2356 change, or times out.
    setButtonBusy(btn, 'Generating…');
    startPolling();

    console.log('[SCW sub-portal survey] POST', { url: WEBHOOK_URL, recordId: payload.recordId });

    $.ajax({
      url: WEBHOOK_URL,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload),
      crossDomain: true,
      // Make's Webhook Response module holds the connection open until
      // the scenario finishes. PDF gen + Knack upload can run 90+s on
      // big surveys; 180s matches the polling timeout ceiling.
      timeout: 180000,
      success: function (resp, status, xhr) {
        // Unconditional log so user can see exactly what came back
        // without flipping SCW.DEBUG.
        console.log('[SCW sub-portal survey] success', {
          status: xhr && xhr.status,
          contentType: xhr && xhr.getResponseHeader && xhr.getResponseHeader('Content-Type'),
          responseType: typeof resp,
          response: resp,
          rawResponseText: xhr && xhr.responseText
        });

        // Trust an informative response. Make's scenario has a
        // Webhook Response module that returns {"status":"ready"} (or
        // similar) AFTER the PDF is generated and uploaded to
        // field_2356. When we see that response, the file is ready —
        // stop polling immediately instead of waiting for the next
        // poll tick to notice the field change.
        var informative = (resp != null && resp !== '' &&
          (typeof resp === 'object' || String(resp).length > 0));
        if (informative) {
          console.log('[SCW sub-portal survey] informative response → stopping poll');
          // Kick a model.fetch so the on-page <a> updates to the new file.
          if (typeof Knack !== 'undefined' && Knack.views && Knack.views[DETAIL_VIEW]) {
            var v = Knack.views[DETAIL_VIEW].model;
            if (v && typeof v.fetch === 'function') v.fetch();
          }
          stopPolling({ msg: 'Survey Field PDF updated.', variant: 'success' });
          return;
        }

        // Empty body — Make didn't end with a Webhook Response module,
        // or returned an empty 200. Fall through to the existing poll
        // loop to wait for field_2356 to change.
        console.log('[SCW sub-portal survey] empty response → polling continues');
        if (typeof Knack !== 'undefined' && Knack.views && Knack.views[DETAIL_VIEW]) {
          var model = Knack.views[DETAIL_VIEW].model;
          if (model && typeof model.fetch === 'function') model.fetch();
        }
      },
      error: function (xhr, status, errThrown) {
        console.log('[SCW sub-portal survey] error', {
          status: xhr && xhr.status,
          contentType: xhr && xhr.getResponseHeader && xhr.getResponseHeader('Content-Type'),
          jqStatus: status,
          errThrown: errThrown && errThrown.toString && errThrown.toString(),
          rawResponseText: xhr && xhr.responseText
        });

        // status 0 = opaque CORS response. Browser blocks reading
        // body but delivery succeeded. Leave the poll loop running.
        if (xhr && xhr.status === 0) {
          console.log('[SCW sub-portal survey] status 0 (opaque/CORS) → polling continues');
          return;
        }

        // HTTP 2xx with a body that jQuery couldn't parse (Content-Type
        // mismatch) lands in error too — treat as success.
        var raw = xhr && xhr.responseText;
        var httpOk = xhr && xhr.status >= 200 && xhr.status < 300;
        if (httpOk && raw) {
          console.log('[SCW sub-portal survey] HTTP OK with body → treating as success');
          if (typeof Knack !== 'undefined' && Knack.views && Knack.views[DETAIL_VIEW]) {
            var vm = Knack.views[DETAIL_VIEW].model;
            if (vm && typeof vm.fetch === 'function') vm.fetch();
          }
          stopPolling({ msg: 'Survey Field PDF updated.', variant: 'success' });
          return;
        }

        console.warn('[SCW sub-portal survey] webhook error', xhr);
        stopPolling({
          msg: 'Webhook failed (HTTP ' + (xhr ? xhr.status : '?') + '). See console.',
          variant: 'error'
        });
      }
    });
  }

  // ── Button injection ──

  function injectButton() {
    var viewEl = document.getElementById(DETAIL_VIEW);
    if (!viewEl) return;

    var detail = viewEl.querySelector('.kn-detail.' + TARGET_FIELD);
    if (!detail) return;

    if (document.getElementById(BTN_ID)) return;

    injectStyles();

    var wrap = document.createElement('div');
    wrap.id = WRAP_ID;

    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';

    var icon = document.createElement('span');
    icon.className = 'scw-sp-sx-icon';
    icon.textContent = '↪';

    var label = document.createElement('span');
    label.className = 'scw-sp-sx-label';
    label.textContent = 'Regenerate Survey Field PDF';

    btn.appendChild(icon);
    btn.appendChild(label);
    wrap.appendChild(btn);

    btn.addEventListener('click', function () {
      console.log('[SCW sub-portal survey] button clicked');
      sendPayload(btn);
    });

    if (detail.parentNode) {
      detail.parentNode.insertBefore(wrap, detail.nextSibling);
    }

    // If a poll is already running when the view re-renders, keep the
    // button in its busy state.
    if (_pollActive) setButtonBusy(btn, 'Generating…');
  }

  // ── Per-scene view-ID overrides ──
  // The shared SCW.surveyWorksheetPdf module has hard-coded page-1 /
  // cover-image / trailing-image view IDs for a different sub-portal
  // scene. On scene_1140 the equivalent content lives in different
  // views, so we override the lists here and prime the image cache for
  // the cover-image view ourselves (the module's setupImagePreloads
  // only listens to its own hard-coded view IDs).
  var PAGE1_VIEWS = [
    { viewId: 'view_3504' },                              // h1 client name + status
    { viewId: 'view_3826' },                              // STATUS / REQ_ID / Clickup / dates
    { viewId: 'view_3825' },                              // Address / Instructions / Other Notes
    { viewId: 'view_3568', label: 'Survey Contact(s)' }   // POC name / phone / email
  ];
  var COVER_IMAGE_VIEWS    = [{ viewId: 'view_3531', label: 'Site Map(s)' }];
  var TRAILING_IMAGE_VIEWS = [{ viewId: 'view_3530', label: 'Additional Photos' }];

  function applySceneOverrides() {
    var api = window.SCW && window.SCW.surveyWorksheetPdf;
    if (!api || typeof api.configureForScene !== 'function') return;
    api.configureForScene({
      page1Views:         PAGE1_VIEWS,
      coverImageViews:    COVER_IMAGE_VIEWS,
      trailingImageViews: TRAILING_IMAGE_VIEWS
    });
  }

  function primeImageCacheFor(cfg, isCover) {
    var api = window.SCW && window.SCW.surveyWorksheetPdf;
    if (!api || typeof api.refreshImageCache !== 'function') return;
    // Cover images (site maps) get auto-cropped: site map screenshots
    // typically have huge white margins built in, and without the
    // crop they render as a small dot in the middle of a landscape
    // page. Bumping maxDim to 1800 too, matching the module's own
    // setupImagePreloads default for covers.
    var maxDim   = isCover ? 1800 : 600;
    var quality  = isCover ? 0.82 : 0.65;
    var autoCrop = !!isCover;
    api.refreshImageCache(cfg.viewId, cfg.label, maxDim, quality, autoCrop);
  }

  // ── Bindings ──

  $(document)
    .off('knack-view-render.' + DETAIL_VIEW + EVENT_NS)
    .on('knack-view-render.' + DETAIL_VIEW + EVENT_NS, function () {
      applySceneOverrides();
      setTimeout(injectButton, 80);
    });

  // Prime the image caches whenever the cover / trailing image views
  // render. Without this the html payload sent to Make has no images.
  COVER_IMAGE_VIEWS.forEach(function (cfg) {
    $(document)
      .off('knack-view-render.' + cfg.viewId + EVENT_NS)
      .on('knack-view-render.' + cfg.viewId + EVENT_NS, function () {
        applySceneOverrides();   // ensure overrides are in place before priming
        primeImageCacheFor(cfg, true);
      });
  });
  TRAILING_IMAGE_VIEWS.forEach(function (cfg) {
    $(document)
      .off('knack-view-render.' + cfg.viewId + EVENT_NS)
      .on('knack-view-render.' + cfg.viewId + EVENT_NS, function () {
        applySceneOverrides();
        primeImageCacheFor(cfg, false);
      });
  });
})();
