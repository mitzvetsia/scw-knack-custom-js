/*** FEATURE: Sales-side stepper (view_3969 rich-text host) ***/
/**
 * Sales counterpart to ops-stepper.js. Renders action buttons into the
 * role-gated rich-text host view_3969 on the proposal page (scene_1096),
 * alongside (and mirroring) the Ops stepper in view_3345. Only the host
 * view differs — Knack's role rules decide which host renders for the
 * current user, so the two steppers never collide.
 *
 * Steps
 *   1. Publish Proposal
 *        showWhen: always (no gate, for now)
 *        webhook : MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK → the shared publish
 *                  scenario (same Make hook as the ops publish variants);
 *                  Make branches on payload.stepId. Payload shape matches
 *                  ops-stepper's publish steps.
 *        TBD     : inherits the field_2725 default (tbdMode undefined) —
 *                  publishes with TBD labor until FLAG_released-to-sales
 *                  flips to Yes. See proposal-pdf-export.js shouldPublishAsTbd.
 *
 * Payload mirrors ops-stepper's publish steps: full SOW field map +
 * line-item / license ids + the standalone publish snapshot from
 * SCW.pdfExport.buildPublishPayload (html / json / totals / secure link).
 * step.id = 'publish-proposal' is the Make discriminator.
 */
(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────
  var HOST_VIEW      = 'view_3969';   // role-gated rich-text host (Sales)
  var SOURCE_VIEW    = 'view_3861';   // SOW details view on the proposal page
  var LINE_ITEM_VIEW = 'view_3341';   // SOW Line Items grid
  var LICENSE_VIEW   = 'view_3371';   // License records table
  var EXTRA_FIELD    = 'field_2126';  // SOW Name — surfaced top-level
  var SCENE_ID       = 'scene_1096';  // proposal page scene

  var NS        = '.scwSalesStepper';
  var BLOCK_CLS = 'scw-sales-stepper';
  var STYLE_ID  = 'scw-sales-stepper-css';

  var STEPS = [
    {
      id: 'publish-proposal',
      label: 'Publish Proposal',
      webhookKey: 'MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK',
      modal: {
        title:       'Publish Proposal',
        intro:       'Publish this proposal for the customer.',
        placeholder: 'Optional note to include with the publish…',
        submitLabel: 'Publish'
      },
      includeFullPayload: true
    }
  ];

  // ── Icons ────────────────────────────────────────────────
  var ZAP_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // ── Styles ───────────────────────────────────────────────
  // Re-declares the shared .scw-step-action primitives (also injected by
  // ops-stepper / workflow-stepper) so this module renders correctly even
  // if those aren't on the page, plus its own namespaced modal styles.
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.' + BLOCK_CLS + ' { display: flex; flex-direction: column; gap: 0; margin: 8px 0; }' +
      '.' + BLOCK_CLS + '__title {' +
      '  font-size: 12px; font-weight: 700; letter-spacing: 0.04em;' +
      '  text-transform: uppercase; color: #6b7280; margin-bottom: 6px;' +
      '}' +

      '.scw-step-action {' +
      '  position: relative; display: flex; align-items: center;' +
      '  width: 100%; min-height: 44px; padding: 14px 16px 14px 22px;' +
      '  background: #fff; cursor: pointer; user-select: none;' +
      '  box-sizing: border-box; transition: background 180ms ease;' +
      '  border: 1px solid #e5e7eb; border-radius: 14px;' +
      '  margin-bottom: 8px; text-decoration: none !important; color: inherit;' +
      '}' +
      '.scw-step-action::before {' +
      '  content: ""; position: absolute; left: 0; top: 0; bottom: 0;' +
      '  width: 6px; background: var(--scw-step-accent, #295f91);' +
      '  border-radius: 14px 0 0 14px;' +
      '}' +
      '.scw-step-action:hover { background: rgba(41,95,145,0.06); }' +
      '.scw-step-action .scw-step-icon {' +
      '  flex: 0 0 auto; display: inline-flex; align-items: center;' +
      '  justify-content: center; width: 28px; margin-right: 6px;' +
      '  color: var(--scw-step-accent, #295f91); opacity: .75;' +
      '}' +
      '.scw-step-action .scw-step-title {' +
      '  flex: 1 1 auto; font-size: 14px; font-weight: 600; color: #1e293b;' +
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' +
      '  text-decoration: none !important;' +
      '}' +
      '.scw-step-action.is-loading { pointer-events: none; opacity: 0.75; cursor: wait; }' +
      '.scw-step-action.is-loading .scw-step-icon svg { animation: scw-step-spin 0.8s linear infinite; }' +
      '@keyframes scw-step-spin { to { transform: rotate(360deg); } }' +
      // Blocked: fully readable but not clickable (amber accent + lock-out).
      '.scw-step-action.is-blocked { opacity: 0.55; pointer-events: none; cursor: default; --scw-step-accent: #b45309; }' +
      '.scw-step-action.is-blocked .scw-step-icon { color: #b45309; opacity: 1; }' +
      // Gate note shown beneath a blocked button (amber; red is for errors).
      '.' + BLOCK_CLS + '__note {' +
      '  display: flex; align-items: flex-start; gap: 6px;' +
      '  margin: -2px 0 8px; padding: 7px 10px;' +
      '  font-size: 12px; font-weight: 600; line-height: 1.35; color: #b45309;' +
      '  background: rgba(245,158,11,0.10); border: 1px solid rgba(245,158,11,0.35);' +
      '  border-radius: 8px;' +
      '}' +

      '.scw-sales-modal-overlay {' +
      '  position: fixed; inset: 0; z-index: 10000; display: flex;' +
      '  align-items: center; justify-content: center; background: rgba(15,23,42,0.55);' +
      '}' +
      '.scw-sales-modal {' +
      '  width: 480px; max-width: 92vw; background: #fff; border-radius: 10px;' +
      '  box-shadow: 0 10px 30px rgba(0,0,0,0.3); padding: 20px 22px 16px;' +
      '  font-family: inherit; color: #111827;' +
      '}' +
      '.scw-sales-modal-hdr { font-size: 16px; font-weight: 700; margin-bottom: 4px; }' +
      '.scw-sales-modal-intro { font-size: 13px; color: #4b5563; margin-bottom: 12px; }' +
      '.scw-sales-modal-textarea {' +
      '  width: 100%; box-sizing: border-box; min-height: 100px; padding: 8px 10px;' +
      '  border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit;' +
      '  font-size: 13px; resize: vertical;' +
      '}' +
      '.scw-sales-modal-error { margin-top: 8px; color: #b91c1c; font-size: 12px; }' +
      '.scw-sales-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }' +
      '.scw-sales-modal-cancel, .scw-sales-modal-submit {' +
      '  padding: 7px 14px; border-radius: 5px; font-size: 13px; font-weight: 600;' +
      '  cursor: pointer; border: 1px solid transparent;' +
      '}' +
      '.scw-sales-modal-cancel { background: #fff; color: #374151; border-color: #d1d5db; }' +
      '.scw-sales-modal-cancel:hover { background: #f3f4f6; }' +
      '.scw-sales-modal-submit { background: #2563eb; color: #fff; border-color: #1d4ed8; }' +
      '.scw-sales-modal-submit:hover { background: #1d4ed8; }' +
      '.scw-sales-modal-submit[disabled], .scw-sales-modal-cancel[disabled] { opacity: 0.6; cursor: wait; }';

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

  function readField(fieldKey) {
    var view = document.getElementById(SOURCE_VIEW);
    if (!view) return '';
    var cell = view.querySelector('.kn-detail.' + fieldKey + ' .kn-detail-body');
    if (cell) return (cell.textContent || '').replace(/ /g, ' ').trim();
    return '';
  }

  // ── Publish gate ─────────────────────────────────────────
  // Block (but don't hide) the Publish Proposal button when the SOW is
  // released to sales (field_2725 = Yes) AND the install total has drifted
  // since the last publish — i.e. the published-proposal record's stored
  // installation total (field_2668) no longer matches the live grid total
  // in view_3341. Forces a re-publish through Ops rather than letting Sales
  // ship a quote whose numbers changed underneath it.
  var GRID_VIEW            = 'view_3341';  // rendered proposal grid (project totals)
  var PUBLISHED_DETAIL_VIEW = 'view_3883'; // published-proposal details on this scene
  var PUBLISHED_LIST_VIEW   = 'view_3886'; // published-proposal data grid (fallback)
  var INSTALL_TOTAL_FIELD   = 'field_2668';// published record's installation total

  function parseMoney(s) {
    if (s == null) return null;
    var n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
  }

  // Live installation total from the rendered proposal grid (view_3341).
  function readGridInstallationTotal() {
    var view = document.getElementById(GRID_VIEW);
    if (!view) return null;
    var el = view.querySelector('.scw-project-totals--installation-total .scw-l1-value');
    return el ? parseMoney(el.textContent) : null;
  }

  // Published record's stored installation total (field_2668). Tries the
  // details view model/DOM, then the list view model. Returns null when no
  // published record exists or the field isn't exposed — caller treats null
  // as "nothing to compare" and does NOT block.
  function readPublishedInstallationTotal() {
    function fromAttrs(attrs) {
      if (!attrs) return null;
      var raw = attrs[INSTALL_TOTAL_FIELD + '_raw'];
      if (raw != null && raw !== '') return parseMoney(raw);
      var v = attrs[INSTALL_TOTAL_FIELD];
      if (v != null && v !== '') return parseMoney(v);
      return null;
    }
    try {
      var dv = Knack.views && Knack.views[PUBLISHED_DETAIL_VIEW];
      var dAttrs = dv && dv.model && (dv.model.attributes ||
        (dv.model.toJSON && dv.model.toJSON()));
      var fromDetail = fromAttrs(dAttrs);
      if (fromDetail != null) return fromDetail;
    } catch (e) { /* fall through */ }

    var cell = document.querySelector('#' + PUBLISHED_DETAIL_VIEW +
      ' .kn-detail.' + INSTALL_TOTAL_FIELD + ' .kn-detail-body');
    if (cell) {
      var domVal = parseMoney(cell.textContent);
      if (domVal != null) return domVal;
    }

    try {
      var lv = Knack.views && Knack.views[PUBLISHED_LIST_VIEW];
      var models = lv && lv.model && lv.model.data && lv.model.data.models;
      if (models && models.length) {
        var fromList = fromAttrs(models[0].attributes || models[0]);
        if (fromList != null) return fromList;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // { blocked, reason } — only blocks when released AND both totals are
  // readable AND they differ (to the cent).
  function evaluatePublishGate() {
    var released = (readField('field_2725') || '').trim().toLowerCase() === 'yes';
    if (!released) return { blocked: false };
    var published = readPublishedInstallationTotal();
    var grid = readGridInstallationTotal();
    if (published == null || grid == null) return { blocked: false };
    if (Math.round(published * 100) !== Math.round(grid * 100)) {
      return {
        blocked: true,
        reason: 'Installation total has changed — check with Ops for re-publish.'
      };
    }
    return { blocked: false };
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
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models || !models.length) return out;
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes;
        if (a && typeof a.id === 'string' && /^[a-f0-9]{24}$/.test(a.id)) out.push(a.id);
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  // Inherit the field_2725-based default — publish-proposal carries no
  // forced tbdMode, so the published quote shows TBD labor until the SOW
  // is released to sales (field_2725 = Yes). Mirrors ops-stepper.
  function shouldPublishAsTbd() {
    return (readField('field_2725') || '').trim().toLowerCase() !== 'yes';
  }

  function buildPayload(step, notes) {
    var payload = {
      sourceRecordId: getSourceRecordId(),
      stepId:         step.id,
      actionLabel:    step.label || '',
      notes:          notes || '',
      // No submission/second-set concept on the sales publish, but keep
      // the key so the body shape matches ops-stepper's publish payloads
      // (Make's shared scenario maps it).
      mode:           null,
      triggeredBy:    getTriggeredBy()
    };
    if (step.includeFullPayload) {
      payload.sowFields      = readAllFields();
      payload.sowName        = readField(EXTRA_FIELD);
      payload.sowLineItemIds = collectRecordIdsFromView(LINE_ITEM_VIEW);
      payload.licenseIds     = collectRecordIdsFromView(LICENSE_VIEW);
    }

    // tbdMode undefined → fall back to the field_2725 read (same contract
    // as ops-stepper's non-forced steps).
    payload.publishAsTbd = shouldPublishAsTbd();

    try {
      var pub = window.SCW && SCW.pdfExport && SCW.pdfExport.buildPublishPayload
        ? SCW.pdfExport.buildPublishPayload(SCENE_ID, { tbdMode: undefined })
        : null;
      if (pub) {
        var PUBLISH_KEYS = [
          'recordId', 'hash', 'sceneId', 'type',
          'sowId', 'equipmentTotal', 'installationTotal',
          'grandTotal', 'expirationDate',
          'html', 'plaintext', 'plaintextJsonEscaped',
          'scopeOfWorkDocumentElements', 'scopeOfWorkDocumentElementsString',
          'json', 'jsonString',
          'invoiceItems', 'invoiceItemsString',
          'proposalAccessToken', 'proposalAccessUrl'
        ];
        for (var pi = 0; pi < PUBLISH_KEYS.length; pi++) {
          var pk = PUBLISH_KEYS[pi];
          if (pub[pk] !== undefined) payload[pk] = pub[pk];
        }
      } else {
        console.warn('[scw-sales-stepper] buildPublishPayload returned null — ' +
          'SCW.pdfExport not ready or scene not configured. html/json fields ' +
          'will be missing from this webhook call.');
      }
    } catch (e) {
      console.warn('[scw-sales-stepper] buildPublishPayload threw:', e);
    }
    return payload;
  }

  // ── Notes prompt modal ───────────────────────────────────
  function openNotesPromptModal(opts, onSubmit) {
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'scw-sales-modal-overlay';

    var card = document.createElement('div');
    card.className = 'scw-sales-modal';

    var hdr = document.createElement('div');
    hdr.className = 'scw-sales-modal-hdr';
    hdr.textContent = opts.title || 'Add a note';
    card.appendChild(hdr);

    if (opts.intro) {
      var intro = document.createElement('div');
      intro.className = 'scw-sales-modal-intro';
      intro.textContent = opts.intro;
      card.appendChild(intro);
    }

    var ta = document.createElement('textarea');
    ta.className = 'scw-sales-modal-textarea';
    ta.placeholder = opts.placeholder || '';
    card.appendChild(ta);

    var err = document.createElement('div');
    err.className = 'scw-sales-modal-error';
    err.style.display = 'none';
    card.appendChild(err);

    var actions = document.createElement('div');
    actions.className = 'scw-sales-modal-actions';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'scw-sales-modal-cancel';
    cancelBtn.textContent = 'Cancel';
    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'scw-sales-modal-submit';
    submitBtn.textContent = opts.submitLabel || 'Submit';
    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 30);

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    function setSubmitting(on) {
      submitBtn.disabled = !!on;
      submitBtn.textContent = on ? 'Publishing…' : (opts.submitLabel || 'Submit');
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
      onSubmit((ta.value || '').trim(), {
        setSubmitting: setSubmitting, showError: showError, close: close
      });
    });
  }

  // Navigate up one level in Knack's hash route after a successful
  // publish — strips the last two hash segments (child-slug + child-id).
  function redirectToParent() {
    var hash = (window.location.hash || '').split('?')[0].replace(/\/+$/, '');
    var parts = hash.replace(/^#\/?/, '').split('/');
    if (parts.length >= 2) { parts.splice(-2, 2); window.location.hash = '#' + parts.join('/'); }
    else { window.location.hash = '#'; }
  }

  // ── Webhook ──────────────────────────────────────────────
  function postWebhook(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      return resp.text().then(function (body) {
        var data = null;
        try { data = body ? JSON.parse(body) : null; } catch (e) {}
        return { ok: resp.ok, status: resp.status, body: body, data: data };
      });
    });
  }

  function webhookErrorMsg(resp, genericLabel) {
    if (resp.data && (resp.data.error || resp.data.message)) {
      return resp.data.error || resp.data.message;
    }
    if (resp.ok) return (genericLabel || 'Webhook') + ' returned a non-JSON or unexpected response.';
    return (genericLabel || 'Webhook') + ' returned HTTP ' + resp.status + '.';
  }

  function setBtnLoading(btn, on) {
    if (!btn) return;
    var icon = btn.querySelector('.scw-step-icon');
    if (on) { btn.classList.add('is-loading'); if (icon) icon.innerHTML = SPINNER_SVG; }
    else    { btn.classList.remove('is-loading'); if (icon) icon.innerHTML = ZAP_SVG; }
  }

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
    // Hard re-check the publish gate at click time (defense in depth — the
    // button is also visually blocked + pointer-events:none in renderInto).
    var gate = evaluatePublishGate();
    if (gate.blocked) {
      alert(gate.reason);
      return;
    }
    // Publishing scrapes the full proposal scene — block until ready so
    // the payload isn't built from a half-rendered page.
    if (window.SCW && SCW.pdfExport && typeof SCW.pdfExport.isPageReady === 'function' &&
        !SCW.pdfExport.isPageReady(SCENE_ID)) {
      alert('Page is still loading — please wait a moment, then try again.');
      return;
    }

    openNotesPromptModal(step.modal, function (notes, ctx) {
      ctx.setSubmitting(true);
      setBtnLoading(btn, true);
      var payload = buildPayload(step, notes);
      postWebhook(url, payload).then(function (resp) {
        var accepted = resp.data && (
          resp.data.success === true ||
          (typeof resp.data.status === 'string' && resp.data.status.toLowerCase() === 'accepted')
        );
        if (!accepted) throw new Error(webhookErrorMsg(resp, step.label + ' webhook'));
        ctx.close();
        redirectToParent();
      }).catch(function (e) {
        setBtnLoading(btn, false);
        ctx.setSubmitting(false);
        ctx.showError((e && e.message) ? e.message : ('Network error: ' + e));
      });
    });
  }

  // ── Render ───────────────────────────────────────────────
  function renderInto(host) {
    var prev = host.querySelector('.' + BLOCK_CLS);
    if (prev) prev.remove();

    var block = document.createElement('div');
    block.className = BLOCK_CLS;

    var title = document.createElement('div');
    title.className = BLOCK_CLS + '__title';
    title.textContent = 'Sales Actions';
    block.appendChild(title);

    STEPS.forEach(function (step) {
      var el = document.createElement('a');
      el.href = 'javascript:void(0)';
      el.className = 'scw-step-action';

      var icon = document.createElement('span');
      icon.className = 'scw-step-icon';
      icon.innerHTML = ZAP_SVG;
      el.appendChild(icon);

      var titleEl = document.createElement('span');
      titleEl.className = 'scw-step-title';
      titleEl.textContent = step.label;
      el.appendChild(titleEl);

      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (el.classList.contains('is-loading')) return;
        if (el.classList.contains('is-blocked')) return;
        fireStep(step, el);
      });
      block.appendChild(el);

      // Publish gate — block (don't hide) when the install total has
      // drifted since the last publish on a released SOW.
      if (step.id === 'publish-proposal') {
        var gate = evaluatePublishGate();
        if (gate.blocked) {
          el.classList.add('is-blocked');
          el.setAttribute('title', gate.reason);
          var note = document.createElement('div');
          note.className = BLOCK_CLS + '__note';
          note.textContent = gate.reason;
          block.appendChild(note);
        }
      }
    });

    host.appendChild(block);
  }

  function render() {
    var host = document.getElementById(HOST_VIEW);
    if (!host) return;            // hidden by role rule — nothing to do
    if (!document.getElementById(SOURCE_VIEW)) return; // source not in DOM yet
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
    // Re-render when the proposal grid or published-proposal record renders
    // so the publish gate re-evaluates as install totals change.
    $(document)
      .off('knack-view-render.' + GRID_VIEW + NS)
      .on('knack-view-render.' + GRID_VIEW + NS, function () { setTimeout(render, 250); });
    $(document)
      .off('knack-view-render.' + PUBLISHED_DETAIL_VIEW + NS)
      .on('knack-view-render.' + PUBLISHED_DETAIL_VIEW + NS, function () { setTimeout(render, 250); });
    $(document)
      .off('knack-scene-render.any' + NS)
      .on('knack-scene-render.any' + NS, function () { setTimeout(render, 600); });
  }

  injectStyles();
  bind();
  if (document.getElementById(HOST_VIEW)) setTimeout(render, 200);
})();
