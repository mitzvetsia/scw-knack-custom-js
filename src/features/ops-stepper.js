/*** FEATURE: Ops-side stepper (view_3345 rich-text host) ***/
/**
 * Three button-actions rendered into the role-gated rich-text host
 * view_3345 on the Ops proposal page. Each button opens a notes-prompt
 * modal and fires a Make webhook with the SOW context + payload fields
 * so Make can update the CU project task, post to Slack, and (for
 * step 2 / 3) create the supporting records.
 *
 * Steps
 *   1. Mark Ready for Survey
 *        showWhen: field_2706 = No
 *        webhook : MAKE_OPS_MARK_READY_WEBHOOK
 *        server  : flips field_2723 = Yes, updates CU task, Slack
 *
 *   2. Request Alternative Bid from Subcontractor
 *        showWhen: field_2706 = No AND field_2728 > 0
 *        webhook : MAKE_OPS_REQUEST_ALT_BID_WEBHOOK
 *        server  : creates missing Survey Item records + alt-bid package,
 *                  updates CU task, posts to Slack
 *
 *   3. Publish and Submit Completed Proposal to Sales
 *        showWhen: field_2725 = No
 *        webhook : MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK
 *        server  : flips field_2725 = Yes, updates CU task, Slack
 *
 * Payload for steps 2 and 3 includes every field from SOURCE_VIEW
 * (view_3861) plus field_2126, line-item record ids from view_3341,
 * and license record ids from LICENSE_VIEW (empty placeholder until
 * the view is supplied).
 */
(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────
  var HOST_VIEW      = 'view_3345';   // role-gated rich-text host in Knack
  var SOURCE_VIEW    = 'view_3861';   // SOW details view on the proposal page
  var LINE_ITEM_VIEW = 'view_3341';   // SOW Line Items grid
  var LICENSE_VIEW   = '';            // TODO: user will supply the license-table view id
  var EXTRA_FIELD    = 'field_2126';  // SOW Name — always in the payload

  var NS         = '.scwOpsStepper';
  var BLOCK_CLS  = 'scw-ops-stepper';
  var STYLE_ID   = 'scw-ops-stepper-css';

  var STEPS = [
    {
      id: 'mark-ready',
      label: 'Mark Ready for Survey',
      tone: 'primary',
      showWhen: { field: 'field_2706', value: 'No' },
      webhookKey: 'MAKE_OPS_MARK_READY_WEBHOOK',
      modal: {
        title:       'Mark Ready for Survey',
        intro:       'Note to the sales team — what should they know?',
        placeholder: 'e.g. Proposal is internally consistent, ready to hand off',
        submitLabel: 'Mark Ready'
      },
      includeFullPayload: false   // this step just needs sourceRecordId + notes
    },
    {
      id: 'request-alt-bid',
      label: 'Request Alternative Bid from Subcontractor',
      tone: 'amber',
      showWhen: {
        all: [
          { field: 'field_2706', value: 'No' },
          { field: 'field_2728', gt: 0 }
        ]
      },
      webhookKey: 'MAKE_OPS_REQUEST_ALT_BID_WEBHOOK',
      modal: {
        title:       'Request Alternative Bid',
        intro:       'Note to the subcontractor — what should they know about this alternative bid?',
        placeholder: 'e.g. Budget-friendly alternative — fewer cameras in the lot, cheaper NVR',
        submitLabel: 'Send Request'
      },
      includeFullPayload: true
    },
    {
      id: 'publish-proposal',
      label: 'Publish and Submit Completed Proposal to Sales',
      tone: 'success',
      showWhen: { field: 'field_2725', value: 'No' },
      webhookKey: 'MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK',
      modal: {
        title:       'Publish & Submit Completed Proposal',
        intro:       'Note to the sales team — any context to include with the finalized proposal?',
        placeholder: 'e.g. Bid validated, ready for client review',
        submitLabel: 'Publish & Submit'
      },
      includeFullPayload: true
    }
  ];

  // ── Icons ────────────────────────────────────────────────
  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // ── Styles (injected once) ───────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.' + BLOCK_CLS + ' {' +
      '  display: flex; flex-direction: column; gap: 8px;' +
      '  padding: 14px 16px; border-radius: 8px;' +
      '  background: #f9fafb; border: 1px solid #e5e7eb;' +
      '  margin: 8px 0;' +
      '}' +
      '.' + BLOCK_CLS + '__title {' +
      '  font-size: 12px; font-weight: 700; letter-spacing: 0.04em;' +
      '  text-transform: uppercase; color: #6b7280;' +
      '  margin-bottom: 2px;' +
      '}' +
      '.' + BLOCK_CLS + '__row {' +
      '  display: flex; flex-direction: column; gap: 6px;' +
      '}' +
      '.' + BLOCK_CLS + '__empty {' +
      '  font-size: 13px; color: #6b7280; font-style: italic;' +
      '}' +
      '.scw-ops-step-btn {' +
      '  display: inline-flex; align-items: center; gap: 8px;' +
      '  padding: 9px 14px; border-radius: 6px; cursor: pointer;' +
      '  font-size: 13px; font-weight: 600; line-height: 1.25;' +
      '  border: 1px solid transparent; text-align: left;' +
      '  transition: background 0.15s, border-color 0.15s;' +
      '  align-self: flex-start;' +
      '}' +
      '.scw-ops-step-btn.is-primary {' +
      '  background: #2563eb; color: #fff; border-color: #1d4ed8;' +
      '}' +
      '.scw-ops-step-btn.is-primary:hover { background: #1d4ed8; }' +
      '.scw-ops-step-btn.is-amber {' +
      '  background: #f59e0b; color: #fff; border-color: #d97706;' +
      '}' +
      '.scw-ops-step-btn.is-amber:hover { background: #d97706; }' +
      '.scw-ops-step-btn.is-success {' +
      '  background: #059669; color: #fff; border-color: #047857;' +
      '}' +
      '.scw-ops-step-btn.is-success:hover { background: #047857; }' +
      '.scw-ops-step-btn.is-loading {' +
      '  pointer-events: none; opacity: 0.75; cursor: wait;' +
      '}' +
      '.scw-ops-step-btn.is-loading svg { animation: scw-ops-spin 0.8s linear infinite; }' +
      '@keyframes scw-ops-spin { to { transform: rotate(360deg); } }' +

      /* Modal — mirrors workflow-stepper's notes-prompt modal. */
      '.scw-ops-modal-overlay {' +
      '  position: fixed; inset: 0; z-index: 10000;' +
      '  display: flex; align-items: center; justify-content: center;' +
      '  background: rgba(15,23,42,0.55);' +
      '}' +
      '.scw-ops-modal {' +
      '  width: 480px; max-width: 92vw; background: #fff;' +
      '  border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);' +
      '  padding: 20px 22px 16px;' +
      '  font-family: inherit; color: #111827;' +
      '}' +
      '.scw-ops-modal-hdr {' +
      '  font-size: 16px; font-weight: 700; margin-bottom: 4px;' +
      '}' +
      '.scw-ops-modal-intro {' +
      '  font-size: 13px; color: #4b5563; margin-bottom: 12px;' +
      '}' +
      '.scw-ops-modal-textarea {' +
      '  width: 100%; box-sizing: border-box; min-height: 110px;' +
      '  padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px;' +
      '  font-family: inherit; font-size: 13px; resize: vertical;' +
      '}' +
      '.scw-ops-modal-error {' +
      '  margin-top: 8px; color: #b91c1c; font-size: 12px;' +
      '}' +
      '.scw-ops-modal-actions {' +
      '  display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;' +
      '}' +
      '.scw-ops-modal-cancel, .scw-ops-modal-submit {' +
      '  padding: 7px 14px; border-radius: 5px; font-size: 13px;' +
      '  font-weight: 600; cursor: pointer; border: 1px solid transparent;' +
      '}' +
      '.scw-ops-modal-cancel {' +
      '  background: #fff; color: #374151; border-color: #d1d5db;' +
      '}' +
      '.scw-ops-modal-cancel:hover { background: #f3f4f6; }' +
      '.scw-ops-modal-submit {' +
      '  background: #2563eb; color: #fff; border-color: #1d4ed8;' +
      '}' +
      '.scw-ops-modal-submit:hover { background: #1d4ed8; }' +
      '.scw-ops-modal-submit[disabled] {' +
      '  opacity: 0.6; cursor: wait;' +
      '}';

    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Helpers ──────────────────────────────────────────────
  function getSourceModel() {
    try {
      var v = Knack.views && Knack.views[SOURCE_VIEW];
      return (v && v.model && v.model.attributes) || null;
    } catch (e) { return null; }
  }

  function getSourceRecordId() {
    var attrs = getSourceModel();
    return (attrs && attrs.id) || '';
  }

  // Read from the source-view DOM (matches workflow-stepper.js's pattern).
  // The Details view renders each field as `.kn-detail.field_XXXX` with
  // the value inside `.kn-detail-body`. The Knack model isn't always
  // populated when the view first renders, but the DOM always is.
  function readField(fieldKey) {
    var view = document.getElementById(SOURCE_VIEW);
    if (!view) return '';
    var cell = view.querySelector('.kn-detail.' + fieldKey + ' .kn-detail-body');
    if (cell) return (cell.textContent || '').replace(/ /g, ' ').trim();
    return '';
  }

  // Numeric comparison for `gt` / `gte` etc.
  function toNum(v) {
    if (v == null) return NaN;
    var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? NaN : n;
  }

  function conditionMet(cond) {
    if (!cond) return true;
    if (cond.all) return cond.all.every(conditionMet);
    if (cond.any) return cond.any.some(conditionMet);
    if (cond.not) return !conditionMet(cond.not);
    if (cond.field) {
      var v = String(readField(cond.field) || '').trim();
      if (cond.value    != null) return v.toLowerCase() === String(cond.value).toLowerCase();
      if (cond.notValue != null) return v.toLowerCase() !== String(cond.notValue).toLowerCase();
      if (cond.hasValue === true)  return v !== '';
      if (cond.hasValue === false) return v === '';
      if (cond.gt  != null) return toNum(v) >  Number(cond.gt);
      if (cond.gte != null) return toNum(v) >= Number(cond.gte);
      if (cond.lt  != null) return toNum(v) <  Number(cond.lt);
      if (cond.lte != null) return toNum(v) <= Number(cond.lte);
    }
    return true;
  }

  function getTriggeredBy() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // Pull every attribute off the source view's model. Skips internal Knack
  // keys (id, account_id, object, etc) and keeps both raw and display values
  // — Make can pick whichever it needs per field.
  function readAllFields() {
    var attrs = getSourceModel();
    if (!attrs) return {};
    var out = {};
    var keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (/^field_\d+(_raw)?$/.test(k)) out[k] = attrs[k];
    }
    return out;
  }

  function collectRecordIdsFromView(viewId) {
    var out = [];
    if (!viewId) return out;
    try {
      var v = Knack && Knack.views && Knack.views[viewId];
      var data = v && v.model && v.model.data;
      var models = data && data.models;
      if (!models || !models.length) return out;
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes;
        if (a && typeof a.id === 'string' && /^[a-f0-9]{24}$/.test(a.id)) {
          out.push(a.id);
        }
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  // ── Payload ──────────────────────────────────────────────
  function buildPayload(step, notes) {
    var payload = {
      sourceRecordId: getSourceRecordId(),
      stepId:         step.id,
      notes:          notes || '',
      triggeredBy:    getTriggeredBy()
    };
    if (step.includeFullPayload) {
      payload.sowFields = readAllFields();
      // EXTRA_FIELD (field_2126 — SOW Name) is usually in sowFields already,
      // but surface it at the top level so Make can reference it without
      // digging through the map.
      payload.sowName        = readField(EXTRA_FIELD);
      payload.sowLineItemIds = collectRecordIdsFromView(LINE_ITEM_VIEW);
      payload.licenseIds     = collectRecordIdsFromView(LICENSE_VIEW);
    }
    return payload;
  }

  // ── Notes prompt modal ───────────────────────────────────
  function openNotesPromptModal(opts, onSubmit) {
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'scw-ops-modal-overlay';

    var card = document.createElement('div');
    card.className = 'scw-ops-modal';

    var hdr = document.createElement('div');
    hdr.className = 'scw-ops-modal-hdr';
    hdr.textContent = opts.title || 'Add a note';
    card.appendChild(hdr);

    if (opts.intro) {
      var intro = document.createElement('div');
      intro.className = 'scw-ops-modal-intro';
      intro.textContent = opts.intro;
      card.appendChild(intro);
    }

    var ta = document.createElement('textarea');
    ta.className = 'scw-ops-modal-textarea';
    ta.placeholder = opts.placeholder || '';
    card.appendChild(ta);

    var err = document.createElement('div');
    err.className = 'scw-ops-modal-error';
    err.style.display = 'none';
    card.appendChild(err);

    var actions = document.createElement('div');
    actions.className = 'scw-ops-modal-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'scw-ops-modal-cancel';
    cancelBtn.textContent = 'Cancel';

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'scw-ops-modal-submit';
    submitBtn.textContent = opts.submitLabel || 'Submit';

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 30);

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    function setSubmitting(on) {
      submitBtn.disabled = !!on;
      submitBtn.textContent = on ? 'Submitting…' : (opts.submitLabel || 'Submit');
      cancelBtn.disabled = !!on;
    }
    function showError(msg) {
      err.textContent = msg || 'Something went wrong.';
      err.style.display = 'block';
    }

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    submitBtn.addEventListener('click', function () {
      err.style.display = 'none';
      var notes = (ta.value || '').trim();
      onSubmit(notes, { setSubmitting: setSubmitting, showError: showError, close: close });
    });
  }

  // ── Webhook ──────────────────────────────────────────────
  function fireStep(step, btn) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG[step.webhookKey]) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert(step.label + ' webhook URL is not configured (' + step.webhookKey + ').');
      return;
    }
    if (!getSourceRecordId()) {
      alert('Could not determine the SOW record ID from ' + SOURCE_VIEW + '.');
      return;
    }

    openNotesPromptModal(step.modal, function (notes, ctx) {
      ctx.setSubmitting(true);
      setBtnLoading(btn, true);
      var payload = buildPayload(step, notes);

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (resp) {
        return resp.text().then(function (body) {
          var data = null;
          try { data = body ? JSON.parse(body) : null; } catch (e) {}
          return { ok: resp.ok, status: resp.status, body: body, data: data };
        });
      }).then(function (resp) {
        if (resp.data && resp.data.success) {
          // Reload so the stepper re-evaluates against the flipped flags
          // that Make wrote server-side (field_2723 / field_2725 / etc).
          window.location.reload();
          return;
        }
        setBtnLoading(btn, false);
        ctx.setSubmitting(false);
        ctx.showError(
          (resp.data && (resp.data.error || resp.data.message)) ||
          (resp.ok
            ? 'Webhook returned a non-JSON or unexpected response.'
            : 'Webhook returned HTTP ' + resp.status + '.')
        );
      }).catch(function (e) {
        setBtnLoading(btn, false);
        ctx.setSubmitting(false);
        ctx.showError('Network error: ' + (e && e.message ? e.message : e));
      });
    });
  }

  function setBtnLoading(btn, on) {
    if (!btn) return;
    if (on) {
      btn.classList.add('is-loading');
      btn.dataset.origHtml = btn.dataset.origHtml || btn.innerHTML;
      btn.innerHTML = SPINNER_SVG + '<span>Working…</span>';
    } else {
      btn.classList.remove('is-loading');
      if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
    }
  }

  // ── Render ───────────────────────────────────────────────
  function renderInto(host) {
    // Clear any previous render — the source view may re-render many times.
    var prev = host.querySelector('.' + BLOCK_CLS);
    if (prev) prev.remove();

    var block = document.createElement('div');
    block.className = BLOCK_CLS;

    var title = document.createElement('div');
    title.className = BLOCK_CLS + '__title';
    title.textContent = 'Ops Actions';
    block.appendChild(title);

    var row = document.createElement('div');
    row.className = BLOCK_CLS + '__row';

    var visible = 0;
    STEPS.forEach(function (step) {
      if (!conditionMet(step.showWhen)) return;
      visible += 1;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scw-ops-step-btn is-' + (step.tone || 'primary');
      btn.textContent = step.label;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (btn.classList.contains('is-loading')) return;
        fireStep(step, btn);
      });
      row.appendChild(btn);
    });

    if (!visible) {
      var empty = document.createElement('div');
      empty.className = BLOCK_CLS + '__empty';
      empty.textContent = 'No Ops actions are available for this SOW right now.';
      row.appendChild(empty);
    }

    block.appendChild(row);
    host.appendChild(block);
  }

  function render() {
    var host = document.getElementById(HOST_VIEW);
    if (!host) return;           // view is hidden by role rule — nothing to do
    var sourceEl = document.getElementById(SOURCE_VIEW);
    if (!sourceEl) return;       // source not in DOM yet — wait for its render event
    renderInto(host);
  }

  // ── Bindings ─────────────────────────────────────────────
  function bind() {
    $(document)
      .off('knack-view-render.' + HOST_VIEW + NS)
      .on('knack-view-render.' + HOST_VIEW + NS, function () { setTimeout(render, 200); });

    $(document)
      .off('knack-view-render.' + SOURCE_VIEW + NS)
      .on('knack-view-render.' + SOURCE_VIEW + NS, function () { setTimeout(render, 200); });

    $(document)
      .off('knack-scene-render.any' + NS)
      .on('knack-scene-render.any' + NS, function () { setTimeout(render, 600); });
  }

  injectStyles();
  bind();
  if (document.getElementById(HOST_VIEW)) setTimeout(render, 200);
})();
