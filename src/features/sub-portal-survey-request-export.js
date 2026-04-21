/*** SUBCONTRACTOR PORTAL — SURVEY REQUEST EXPORT (view_3825) ***/
/*
 * Adds a "Send Survey PDF to Make" button below the field_2356 detail row
 * on the subcontractor-portal survey request details page (scene_1140).
 *
 * Reuses SCW.surveyWorksheetPdf.scrape / buildHtml to produce the same
 * payload shape as the tech-side survey-worksheet-pdf-export:
 *   { viewId, formViewId, recordId, title, rowCount, html }
 *
 * The subcontractor portal renders the survey worksheet in view_3505, so
 * we scrape that view. If no rows are found, we still POST a minimal
 * payload (recordId + title) so Make has a trigger record.
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

  var BTN_ID    = 'scw-sub-portal-survey-export-btn';
  var WRAP_ID   = 'scw-sub-portal-survey-export-wrap';
  var CSS_ID    = 'scw-sub-portal-survey-export-css';
  var TOAST_ID  = 'scw-sub-portal-survey-export-toast';
  var EVENT_NS  = '.scwSubPortalSurveyExport';

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
      '}',
      '#' + TOAST_ID + '.is-success { background: #059669; }',
      '#' + TOAST_ID + '.is-error   { background: #b91c1c; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Toast helpers ──

  function showToast(msg, variant, autoHideMs) {
    var existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = TOAST_ID;
    if (variant) toast.classList.add('is-' + variant);
    toast.textContent = msg;
    document.body.appendChild(toast);
    if (autoHideMs) {
      setTimeout(function () {
        if (toast.parentNode) toast.remove();
      }, autoHideMs);
    }
    return toast;
  }

  // ── Record ID & title discovery ──

  function getRecordIdFromDetail() {
    var view = Knack && Knack.views && Knack.views[DETAIL_VIEW];
    if (view && view.model && view.model.id) return view.model.id;
    if (view && view.model && view.model.attributes && view.model.attributes.id) {
      return view.model.attributes.id;
    }
    // Fallback: parse the URL hash — details pages end in /<recordId>
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

  function getTitle() {
    var val = readDetailField(TITLE_VIEW, TITLE_FIELD);
    if (val) return val;
    // Fallback: document title
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
          // Keep title from view_3504/field_666 — do not override.
          if (rowCount > 0) {
            // Inject our title + survey-request ID so the generated
            // HTML header reflects the subcontractor-portal context.
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

  // ── Send ──

  function sendPayload(btn) {
    var payload = buildPayload();
    if (!payload.recordId) {
      showToast('Could not determine survey request record ID.', 'error', 5000);
      return;
    }

    btn.disabled = true;
    var labelSpan = btn.querySelector('.scw-sp-sx-label');
    var iconSpan  = btn.querySelector('.scw-sp-sx-icon');
    if (labelSpan) labelSpan.textContent = 'Sending…';
    if (iconSpan)  iconSpan.innerHTML = '<span class="scw-sp-sx-spin"></span>';

    function resetBtn(finalLabel) {
      if (labelSpan) labelSpan.textContent = finalLabel || 'Send Survey PDF to Make';
      if (iconSpan)  iconSpan.textContent = '↪';
      btn.disabled = false;
    }

    $.ajax({
      url: WEBHOOK_URL,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload),
      crossDomain: true,
      timeout: 60000,
      success: function () {
        showToast('Survey PDF payload sent (' + payload.rowCount + ' item' +
                  (payload.rowCount === 1 ? '' : 's') + ').', 'success', 4000);
        resetBtn('Sent ✓');
        setTimeout(function () { resetBtn(); }, 3000);
      },
      error: function (xhr) {
        // Make webhooks often return opaque CORS responses — status 0
        // with a successful delivery. Treat that as success.
        if (xhr && xhr.status === 0) {
          showToast('Survey PDF payload sent (delivery unconfirmed).', 'success', 4000);
          resetBtn('Sent ✓');
          setTimeout(function () { resetBtn(); }, 3000);
          return;
        }
        showToast('Webhook failed (HTTP ' + (xhr ? xhr.status : '?') + '). See console.', 'error', 6000);
        console.warn('[SCW sub-portal survey export] webhook error', xhr);
        resetBtn();
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
    label.textContent = 'Send Survey PDF to Make';

    btn.appendChild(icon);
    btn.appendChild(label);
    wrap.appendChild(btn);

    btn.addEventListener('click', function () { sendPayload(btn); });

    // Insert immediately after the field_2356 detail row
    if (detail.parentNode) {
      detail.parentNode.insertBefore(wrap, detail.nextSibling);
    }
  }

  // ── Bindings ──

  $(document)
    .off('knack-view-render.' + DETAIL_VIEW + EVENT_NS)
    .on('knack-view-render.' + DETAIL_VIEW + EVENT_NS, function () {
      setTimeout(injectButton, 80);
    });
})();
