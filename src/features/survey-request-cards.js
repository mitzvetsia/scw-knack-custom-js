/*** FEATURE: SURVEY REQUEST CARDS — show submitted requests on the sales build stepper ***/
/**
 * The survey step on scene_1116 is a CREATE form — after submitting, the
 * sales user has no way to see what they asked for (one SOW → many Survey
 * Requests). This module reads the hidden view_3876 grid and renders each
 * request back as a card directly beneath the survey step: status chip
 * (armed requests render amber with "Sends when Ops validates"), the SOW
 * it belongs to, POC, request date, and the badging/PPE answers.
 *
 * Source: view_3876 — its object is SOW_OPS_site survey request, the
 * SALES-side capture record the view_3853 form creates (POC / badging /
 * PPE), NOT the sub-facing REQ object (SR-# / status / partner — created
 * downstream by Make). Field map matches view_3876's actual columns
 * (confirmed from live DOM 2026-08-02). Rows may span the whole PROJECT
 * (sibling SOWs), so each card tags its SOW.
 *
 * ⚠️ Builder: view_3876 currently shows NO DATA even when this SOW has a
 * submitted request (field_2706 = Yes) — its source/filters must be
 * widened to include the page SOW's own requests before cards can render.
 * Optional extra columns worth adding: field_1194 ("anything else" notes)
 * and, once it exists, the pending/complete status field.
 *
 * Also exposes SCW.surveyRequests.getRecords()/armedCount() for other
 * modules.
 */
(function () {
  'use strict';

  var CONFIG = {
    sceneId: 'scene_1116',
    viewId: 'view_3876',            // hidden Survey Requests grid (existing)
    fields: {
      sow:            'field_2329', // SOW connection (rows may span the project)
      requested:      'field_1195', // SYS_request date
      // POC lives in the request's INPUT fields (what the view_3853 form
      // writes) — the REL_poc contact connection (field_1197) is
      // typically BLANK, so read the inputs and fall back to the rel.
      pocName:        'field_1191', // INPUT_poc name
      pocEmail:       'field_1192', // INPUT_poc email
      pocPhone:       'field_1193', // INPUT_phone
      poc:            'field_1197', // REL_poc contact record (fallback)
      pocAuthorized:  'field_1198', // FLAG_poc authorized to make changes
      badgingFlag:    'field_1358', // FLAG_badging/security/training reqs
      badgingDetails: 'field_1360', // badging details text
      ppe:            'field_1361', // FLAG_ppe requirements
      // FLAG_status (PENDING/…) — landed in Builder 2026-08-03. Reads ''
      // until the column is added to view_3876; the derived armed signal
      // covers that gap.
      status:         'field_2992'
    },
    armedStatusMatch: 'pending'
  };

  // SOW-header source view on this scene (hidden details view the
  // workflow stepper also reads) — used for the derived armed signal.
  var SOW_VIEW = 'view_3827';

  var STYLE_ID = 'scw-srq-cards-css';
  var WRAP_ID  = 'scw-srq-cards';
  var NS       = '.scwSrqCards';

  // ── Styles ───────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + WRAP_ID + ' { margin: 0 0 8px; }' +
      '.scw-srqc-label {' +
      '  font-size: 11px; font-weight: 700; letter-spacing: 0.05em;' +
      '  text-transform: uppercase; color: #64748b; margin: 0 2px 6px;' +
      '}' +
      '.scw-srqc {' +
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;' +
      '  padding: 10px 14px; margin-bottom: 8px; font-size: 12.5px; color: #334155;' +
      '  border-left: 4px solid #295f91;' +
      '}' +
      '.scw-srqc--armed { border-left-color: #b45309; }' +
      '.scw-srqc__top {' +
      '  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;' +
      '}' +
      '.scw-srqc__req {' +
      '  font: 600 11.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;' +
      '  color: #64748b; background: #f1f5f9; padding: 4px 8px; border-radius: 5px;' +
      '}' +
      '.scw-srqc__chip {' +
      '  font: 700 10.5px/1 system-ui, sans-serif; text-transform: uppercase;' +
      '  letter-spacing: .4px; padding: 4px 8px; border-radius: 5px; white-space: nowrap;' +
      '}' +
      '.scw-srqc__chip--armed   { background: #fef3c7; color: #b45309; }' +
      '.scw-srqc__chip--active  { background: #dbeafe; color: #1d4ed8; }' +
      '.scw-srqc__chip--done    { background: #d1fae5; color: #047857; }' +
      '.scw-srqc__chip--neutral { background: #f1f5f9; color: #475569; }' +
      '.scw-srqc__partner { font-weight: 650; color: #0f172a; }' +
      '.scw-srqc__armed-note {' +
      '  margin-left: auto; font-size: 11.5px; font-weight: 600; color: #b45309;' +
      '}' +
      '.scw-srqc__dates {' +
      '  display: flex; gap: 14px; flex-wrap: wrap; margin-top: 7px;' +
      '  font-size: 11.5px; color: #475569;' +
      '}' +
      '.scw-srqc__date b {' +
      '  display: block; font-size: 10px; font-weight: 700; color: #94a3b8;' +
      '  text-transform: uppercase; letter-spacing: .3px;' +
      '}' +
      '.scw-srqc__row { margin-top: 7px; line-height: 1.4; }' +
      '.scw-srqc__row b {' +
      '  font-size: 10px; font-weight: 700; color: #94a3b8;' +
      '  text-transform: uppercase; letter-spacing: .3px; display: block;' +
      '}' +
      /* Peek: when cards exist, the completed/armed survey step header is
         clickable again — the click toggles the cards panel (NOT the
         locked create form). Three-class selector out-specifies
         workflow-stepper's two-class pointer-events:none lock; this file
         loads after it in build order. */
      '.scw-ktl-accordion.scw-srqc-has-cards.scw-step-completed.scw-step-disabled {' +
      '  pointer-events: auto;' +
      '}' +
      '.scw-ktl-accordion.scw-srqc-has-cards.scw-step-completed.scw-step-disabled' +
      '  .scw-ktl-accordion__header { cursor: pointer; }' +
      /* Keep the form body sealed even though pointer-events came back. */
      '.scw-ktl-accordion.scw-srqc-has-cards.scw-step-completed.scw-step-disabled' +
      '  .scw-ktl-accordion__body { display: none !important; }' +
      /* One-request-per-project guard notice (amber = warning). */
      '#scw-srq-guard-msg {' +
      '  margin: 8px 0; padding: 10px 12px; border-radius: 8px;' +
      '  background: #fef3c7; border: 1px solid #f0c489; color: #b45309;' +
      '  font: 600 12.5px/1.4 system-ui, sans-serif;' +
      '}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Data ─────────────────────────────────────────────────
  function displayValue(attrs, fieldKey) {
    if (!attrs || !fieldKey) return '';
    var raw = attrs[fieldKey + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].identifier) {
      return String(raw[0].identifier).trim();
    }
    if (raw && typeof raw === 'object' && raw.identifier) {
      return String(raw.identifier).trim();
    }
    var v = attrs[fieldKey];
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').replace(/ /g, ' ').trim();
  }

  // Connection RECORD ID from a raw attr (first {id}) — for matching a
  // row's SOW against the page's SOW.
  function connectionId(attrs, fieldKey) {
    if (!attrs || !fieldKey) return '';
    var raw = attrs[fieldKey + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].id) return String(raw[0].id);
    if (raw && typeof raw === 'object' && raw.id) return String(raw.id);
    return '';
  }

  // The page's SOW record id — second 24-hex segment in the hash.
  function currentSowId() {
    var m = (window.location.hash || '').match(/[a-f0-9]{24}/g);
    return (m && m[1]) || '';
  }

  // Is the page's SOW validated (field_2723 = Yes)? Drives the DERIVED
  // armed state until the status field exists on the request object.
  function sowValidated() {
    try {
      var v = Knack.views && Knack.views[SOW_VIEW];
      var a = v && v.model && v.model.attributes;
      if (a && a.field_2723 != null) {
        return String(a.field_2723).replace(/<[^>]*>/g, '').trim().toLowerCase() === 'yes';
      }
    } catch (e) { /* fall back to DOM */ }
    var el = document.querySelector('#' + SOW_VIEW + ' .kn-detail.field_2723 .kn-detail-body');
    return !!el && el.textContent.trim().toLowerCase() === 'yes';
  }

  // Numeric field off the SOW-header view (model attrs, DOM fallback).
  // Returns null when unreadable — callers fail open.
  function sowHeaderNumber(fieldKey) {
    var txt = '';
    try {
      var v = Knack.views && Knack.views[SOW_VIEW];
      var a = v && v.model && v.model.attributes;
      if (a && a[fieldKey] != null) txt = String(a[fieldKey]);
    } catch (e) { /* fall back to DOM */ }
    if (!txt) {
      var el = document.querySelector('#' + SOW_VIEW + ' .kn-detail.' + fieldKey + ' .kn-detail-body');
      if (el) txt = el.textContent;
    }
    txt = String(txt || '').replace(/<[^>]*>/g, '').trim();
    if (txt === '') return null;
    var n = parseInt(txt, 10);
    return isFinite(n) ? n : null;
  }

  // Count of the project's SOWs with a VALIDATED survey — field_2917 on
  // the SOW header view. 0 means NO survey request anywhere on the
  // project has fired yet, so every request row is still pending —
  // including sibling-SOW rows the own-SOW fallback below can't judge.
  function projectValidatedCount() {
    return sowHeaderNumber('field_2917');
  }

  // ONE SURVEY REQUEST PER PROJECT — does the project already carry one?
  // Union of two signals so a stale/misconfigured view can't open a hole:
  //   • any row in the project-wide requests grid (view_3876), OR
  //   • the SOW header's field_2728 count (SOWs with survey requested,
  //     project-wide incl. siblings) > 0.
  function projectHasRequest() {
    if (getRecords().length > 0) return true;
    var n = sowHeaderNumber('field_2728');
    return n != null && n > 0;
  }

  function getRecords() {
    var out = [];
    if (!CONFIG.viewId) return out;
    var F = CONFIG.fields;
    try {
      var v = Knack.views && Knack.views[CONFIG.viewId];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes || models[i];
        if (!a || !a.id) continue;
        out.push({
          id:             a.id,
          sow:            displayValue(a, F.sow),
          sowId:          connectionId(a, F.sow),
          requested:      displayValue(a, F.requested),
          poc:            displayValue(a, F.pocName) || displayValue(a, F.poc),
          pocEmail:       displayValue(a, F.pocEmail),
          pocPhone:       displayValue(a, F.pocPhone),
          pocAuthorized:  displayValue(a, F.pocAuthorized),
          badgingFlag:    displayValue(a, F.badgingFlag),
          badgingDetails: displayValue(a, F.badgingDetails),
          ppe:            displayValue(a, F.ppe),
          status:         displayValue(a, F.status)
        });
      }
    } catch (e) { /* fall through to DOM */ }
    if (!out.length) {
      var viewEl = document.getElementById(CONFIG.viewId);
      var rows = viewEl ? viewEl.querySelectorAll('tbody tr[id]') : [];
      for (var r = 0; r < rows.length; r++) {
        if (!/^[a-f0-9]{24}$/i.test(rows[r].id || '')) continue;
        var cell = function (fk) {
          var td = fk ? rows[r].querySelector('td.' + fk) : null;
          return td ? (td.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim() : '';
        };
        var sowSpan = rows[r].querySelector('td.' + F.sow + ' span[data-kn="connection-value"]');
        out.push({
          id: rows[r].id,
          sow: cell(F.sow),
          sowId: sowSpan ? String(sowSpan.className || '').trim() : '',
          requested: cell(F.requested),
          poc: cell(F.pocName) || cell(F.poc),
          pocEmail: cell(F.pocEmail), pocPhone: cell(F.pocPhone),
          pocAuthorized: cell(F.pocAuthorized), badgingFlag: cell(F.badgingFlag),
          badgingDetails: cell(F.badgingDetails), ppe: cell(F.ppe),
          status: cell(F.status)
        });
      }
    }
    return out;
  }

  function isArmed(rec) {
    // Real status field wins once it exists.
    if (rec.status) {
      return String(rec.status).toLowerCase()
        .indexOf(CONFIG.armedStatusMatch) !== -1;
    }
    // Project-level guard: ZERO SOWs on the project have a validated
    // survey → nothing has fired yet, so every request is still pending
    // — including sibling-SOW rows the per-SOW derivation below can't
    // judge (they used to fall through to "Submitted").
    if (projectValidatedCount() === 0) return true;
    // Derived: this page's SOW's own request while the SOW isn't yet
    // validated — the submit flipped field_2706 but the survey hasn't
    // been sent. Sibling rows can't be judged from here → treated sent.
    return rec.sowId === currentSowId() && !sowValidated();
  }

  function chipClass(rec) {
    if (isArmed(rec)) return 'armed';
    var s = String(rec.status || '').toLowerCase();
    if (/schedul|progress|active/.test(s)) return 'active';
    return 'done';   // no status field yet: not-armed = sent
  }

  // ── Render ───────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function textRow(label, val) {
    if (!val) return '';
    return '<div class="scw-srqc__row"><b>' + esc(label) + '</b>' + esc(val) + '</div>';
  }

  function buildCard(rec) {
    var armed = isArmed(rec);
    var chipText = armed ? 'Pending' : (rec.status || 'Submitted');
    return '' +
      '<div class="scw-srqc' + (armed ? ' scw-srqc--armed' : '') + '" data-req="' + esc(rec.id) + '">' +
        '<div class="scw-srqc__top">' +
          '<span class="scw-srqc__chip scw-srqc__chip--' + chipClass(rec) + '">' + esc(chipText) + '</span>' +
          (rec.sow ? '<span class="scw-srqc__req">' + esc(rec.sow) + '</span>' : '') +
          (rec.poc ? '<span class="scw-srqc__partner">POC: ' + esc(rec.poc) + '</span>' : '') +
          (armed ? '<span class="scw-srqc__armed-note">Sends when Ops validates</span>' : '') +
        '</div>' +
        (rec.requested
          ? '<div class="scw-srqc__dates"><span class="scw-srqc__date">' +
            '<b>Requested</b>' + esc(rec.requested) + '</span></div>'
          : '') +
        textRow('POC contact',
                [rec.pocEmail, rec.pocPhone].filter(Boolean).join(' · ')) +
        textRow('POC authorized for scope changes', rec.pocAuthorized) +
        textRow('Badging / site access requirements',
                rec.badgingDetails || (rec.badgingFlag === 'Yes' ? 'Yes' : '')) +
        (rec.ppe === 'Yes' ? textRow('PPE required', 'Yes') : '') +
      '</div>';
  }

  // Anchor: directly beneath the survey step — the view_3853 accordion
  // wrapper, or the either/or choice group when the accordion currently
  // lives inside it (workflow-stepper moves it there pre-decision).
  function surveyHeader() {
    return document.querySelector('.scw-ktl-accordion__header[data-view-key="view_3853"]');
  }
  function findAnchor() {
    var hdr = surveyHeader();
    var wrap = hdr && hdr.closest('.scw-ktl-accordion');
    if (!wrap) return null;
    return wrap.closest('.scw-step-choice') || wrap;
  }

  // Peek: clicking the COMPLETED/armed survey step toggles the cards
  // panel instead of doing nothing. Capture-phase so it beats the
  // ktl-accordion toggle handler when the step is active-but-clicked-
  // while-locked; active (unlocked) accordions keep native behavior.
  function bindPeek(hdr) {
    if (!hdr || hdr.getAttribute('data-scw-srqc-peek')) return;
    hdr.setAttribute('data-scw-srqc-peek', '1');
    hdr.addEventListener('click', function (e) {
      var aw = hdr.closest('.scw-ktl-accordion');
      if (!aw || !aw.classList.contains('scw-step-disabled')) return;
      var cards = document.getElementById(WRAP_ID);
      if (!cards) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      cards.style.display = (cards.style.display === 'none') ? '' : 'none';
    }, true);
  }

  function render() {
    if (!CONFIG.viewId) return;
    var anchor = findAnchor();
    var wrap = document.getElementById(WRAP_ID);
    var records = getRecords();
    var hdr = surveyHeader();
    var accWrap = hdr && hdr.closest('.scw-ktl-accordion');

    if (!records.length || !anchor) {
      if (wrap) wrap.remove();
      if (accWrap) accWrap.classList.remove('scw-srqc-has-cards');
      return;
    }

    // Cards exist → the completed/armed step header becomes a toggle.
    if (accWrap && !accWrap.classList.contains('scw-srqc-has-cards')) {
      accWrap.classList.add('scw-srqc-has-cards');
    }
    bindPeek(hdr);

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = WRAP_ID;
    }
    // Self-assert position: directly after the survey step, every pass —
    // the choice group forming/dissolving moves the anchor around.
    if (wrap.previousElementSibling !== anchor || wrap.parentNode !== anchor.parentNode) {
      anchor.after(wrap);
    }

    var html =
      '<div class="scw-srqc-label">Submitted Survey Request' +
      (records.length > 1 ? 's' : '') + '</div>' +
      records.map(buildCard).join('');
    // Change-guarded — renders fire often on this scene.
    if (wrap.getAttribute('data-scw-html') !== html) {
      wrap.setAttribute('data-scw-html', html);
      wrap.innerHTML = html;
    }

    syncFormGuard();
  }

  // ── HARD GUARD: one survey request per PROJECT ───────────────────────
  // A project may NEVER carry more than one survey request. The workflow
  // stepper hides/disables the survey step once flags flip, but that's
  // cosmetic gating — flags settle late, a tab can go stale, and the
  // view_3853 form is still reachable. This locks the form itself:
  //   • render pass: disable the submit button + show an amber notice
  //     whenever the project already has a request;
  //   • capture-phase click/submit blockers as the backstop, so even a
  //     click that races the render pass (or a stale-tab submit) is
  //     stopped before Knack's handler runs.
  var GUARD_MSG = 'This project already has a survey request — only one ' +
    'survey request is allowed per project. Edit or work from the ' +
    'existing request instead.';

  function guardNoticeEl(form) {
    var el = document.getElementById('scw-srq-guard-msg');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'scw-srq-guard-msg';
    el.textContent = GUARD_MSG;
    var submit = form.querySelector('.kn-submit');
    if (submit) submit.insertAdjacentElement('beforebegin', el);
    else form.appendChild(el);
    return el;
  }

  function syncFormGuard() {
    var form = document.querySelector('#view_3853 form');
    if (!form) return;
    var btn = form.querySelector('.kn-submit button');
    var blocked = projectHasRequest();
    if (blocked) {
      guardNoticeEl(form);
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('title', GUARD_MSG);
      }
    } else {
      var el = document.getElementById('scw-srq-guard-msg');
      if (el) el.remove();
      if (btn && btn.disabled) {
        btn.disabled = false;
        btn.removeAttribute('title');
      }
    }
  }

  function blockIfDuplicate(e, target) {
    if (!target) return;
    if (!projectHasRequest()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var form = document.querySelector('#view_3853 form');
    if (form) guardNoticeEl(form);
    syncFormGuard();
  }

  if (!document.documentElement.hasAttribute('data-scw-srq-guard-bound')) {
    document.documentElement.setAttribute('data-scw-srq-guard-bound', '1');
    document.addEventListener('click', function (e) {
      blockIfDuplicate(e, e.target && e.target.closest &&
        e.target.closest('#view_3853 .kn-submit button'));
    }, true);
    // Enter-key submits bypass the button — catch the form submit too.
    document.addEventListener('submit', function (e) {
      blockIfDuplicate(e, e.target && e.target.closest &&
        e.target.closest('#view_3853 form'));
    }, true);
  }

  // ── Public API ───────────────────────────────────────────
  window.SCW = window.SCW || {};
  SCW.surveyRequests = SCW.surveyRequests || {};
  SCW.surveyRequests.getRecords = getRecords;
  SCW.surveyRequests.armedCount = function () {
    return getRecords().filter(isArmed).length;
  };
  SCW.surveyRequests.refresh = render;

  // ── Bindings ─────────────────────────────────────────────
  injectStyles();
  if (CONFIG.viewId && window.SCW && SCW.onViewRender) {
    SCW.onViewRender(CONFIG.viewId, function () { setTimeout(render, 150); }, NS);
  }
  $(document)
    .off('knack-scene-render.' + CONFIG.sceneId + NS)
    .on('knack-scene-render.' + CONFIG.sceneId + NS, function () {
      setTimeout(render, 900);   // after workflow-stepper's applySteps pass
    });
  // The survey step's position changes when the choice group forms or
  // dissolves (workflow-stepper re-applies on view_3827 renders) — track it.
  $(document)
    .off('knack-view-render.view_3827' + NS)
    .on('knack-view-render.view_3827' + NS, function () {
      setTimeout(render, 900);
    });

  // After the survey form (view_3853) submits, the new request should
  // appear here without a manual reload. Refetch the hidden grid's model
  // on a few delays (the record + its SOW connection settle server-side
  // moments after the submit response) and re-render. Bound BOTH to
  // Knack's record events and to a raw submit-button click — the Knack
  // events don't reliably fire for this form (same gap workflow-stepper
  // covers), and a refetch after a validation-blocked click is a
  // harmless idempotent read.
  function refetchAndRender() {
    try {
      var v = Knack.views && Knack.views[CONFIG.viewId];
      if (v && v.model) {
        v.model.fetch({
          success: function () { setTimeout(render, 200); },
          error:   function () { render(); }
        });
        return;
      }
    } catch (e) { /* fall through */ }
    render();
  }
  function scheduleSubmitRefresh() {
    [2000, 5000, 10000].forEach(function (ms) {
      setTimeout(refetchAndRender, ms);
    });
  }
  ['knack-form-submit', 'knack-record-create', 'knack-record-update'].forEach(function (evt) {
    $(document)
      .off(evt + '.view_3853' + NS)
      .on(evt + '.view_3853' + NS, scheduleSubmitRefresh);
  });
  $(document)
    .off('click' + NS, '#view_3853 .kn-submit button')
    .on('click' + NS, '#view_3853 .kn-submit button', scheduleSubmitRefresh);
})();
/*** END SURVEY REQUEST CARDS ***********************************************/
