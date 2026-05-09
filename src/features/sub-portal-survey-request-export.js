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

  function sendPayload(btn) {
    var payload = buildPayload();
    if (!payload.recordId) {
      showToast('Could not determine survey request record ID.', 'error', 5000);
      return;
    }

    setButtonBusy(btn, 'Sending…');

    $.ajax({
      url: WEBHOOK_URL,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload),
      crossDomain: true,
      timeout: 60000,
      success: function () {
        setButtonBusy(btn, 'Generating…');
        startPolling();
      },
      error: function (xhr) {
        // Make webhooks often return opaque CORS responses — status 0
        // with a successful delivery. Treat that as success and still
        // start polling the field.
        if (xhr && xhr.status === 0) {
          setButtonBusy(btn, 'Generating…');
          startPolling();
          return;
        }
        showToast('Webhook failed (HTTP ' + (xhr ? xhr.status : '?') + '). See console.', 'error', 6000);
        console.warn('[SCW sub-portal survey export] webhook error', xhr);
        resetButton(btn);
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

    btn.addEventListener('click', function () { sendPayload(btn); });

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
    var maxDim  = isCover ? 1400 : 600;
    var quality = isCover ? 0.8  : 0.65;
    api.refreshImageCache(cfg.viewId, cfg.label, maxDim, quality);
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
