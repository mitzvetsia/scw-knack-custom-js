/*** FEATURE: "Regenerate Docs" button on the CLOSEOUT view ******************
 *
 * Lets ops re-run the closeout document automations for ONE OR ALL of:
 * Scope of Work PDF, Location Approval Form, View Approval Form, and the
 * Kickoff Deck — without re-greenlighting the deal.
 *
 * The button mounts in the #scw-closeout-actions toolbar on view_3940 and
 * opens a small picker with one checkbox per document (NONE checked by
 * default — regeneration is always an explicit opt-in; Generate stays
 * disabled until something is picked). The three greenlight documents
 * POST to the SAME Make scenario
 * the greenlight flow uses, with the greenlight payload shape plus one
 * "yes"/"no" flag per document branch:
 *
 *   [{ "CloseoutID":   "<closeout record id>",
 *      "AcceptanceID": "<acceptance record id>",
 *      "GenerateSowPdf":              "yes" | "no",
 *      "GenerateLocationApprovalForm":"yes" | "no",
 *      "GenerateViewApprovalForm":    "yes" | "no",
 *      "Source": "regen-docs-button" }]
 *
 * ── Make-side setup (one-time) ─────────────────────────────────────────
 * Add a filter to each document branch in the scenario:
 *
 *     <flag key>  Not equal to  no
 *
 * "Not equal to no" (NOT "equal to yes") is deliberate: the original
 * greenlight trigger payload carries NO flags, so its runs pass every
 * branch filter unchanged — only this button's explicit "no"s skip a
 * branch. Nothing about the greenlight flow needs to change.
 *
 * The KICKOFF DECK option fires a SEPARATE POST to the kickoff-deck Make
 * scenario with the exact payload the retired standalone "Regenerate
 * Kickoff Deck" button sent (this feature absorbed that button):
 *
 *   [{ "project_recordID": "...", "questionnaire_recordID": "...",
 *      "acceptance_recordID": "...", "closeout_recordID": "..." }]
 *
 * No Make-side change for it — same scenario, same payload, new trigger UI.
 *
 * ID sources:
 *   CloseoutID / closeout_recordID → first row of view_3940 (CLOSEOUT grid)
 *   AcceptanceID / acceptance_recordID → the ACCEPTANCE row in view_3914
 *   questionnaire_recordID → the questionnaire row in view_4015
 *   project_recordID → the deploy-scene URL hash
 *
 * Response handling: lenient success parsing per request (any 2xx without
 * success:false counts; CORS-opaque status 0 counts). Both webhooks must
 * land for the "Done" state — a partial failure names the side that
 * failed. Then staggered refetches of view_3940/view_3941 so the
 * deliverables strip picks up the regenerated files.
 ****************************************************************************/
(function () {
  'use strict';

  // One entry per deployment page (mirror closeout-deliverables.js /
  // send-coc-button.js). Only one scene renders at a time — activeDep()
  // resolves the live one. refreshViews = closeout grid + the hidden DOC
  // grid the deliverables strip reads on that scene.
  var DEPLOYMENTS = [
    { view: 'view_3940', acceptanceView: 'view_3914',       // ops deploy
      questionnaireView: 'view_4015',
      refreshViews: ['view_3940', 'view_3941'] },
    { view: 'view_4058', acceptanceView: 'view_4066',       // sub dashboard
      questionnaireView: 'view_4053',
      refreshViews: ['view_4058', 'view_4068'] }
  ];
  function activeDep() {
    for (var i = 0; i < DEPLOYMENTS.length; i++) {
      if (document.getElementById(DEPLOYMENTS[i].view)) return DEPLOYMENTS[i];
    }
    return null;
  }
  var TOOLBAR_ID          = 'scw-closeout-actions';
  // The deal-greenlight document scenario's webhook. Same scenario as the
  // automated greenlight run — this button only adds the branch flags.
  var WEBHOOK = 'https://hook.us1.make.com/5b196mfxdtcklk0ik9rdsfdyy7da6d8g';
  // The kickoff-deck scenario's webhook (was regenerate-kickoff-deck.js).
  var KICKOFF_WEBHOOK = 'https://hook.us1.make.com/biytjoog3spow4fx2f7zanjjjj792q9c';

  var DOCS = [
    { flag: 'GenerateSowPdf',               label: 'Scope of Work PDF' },
    { flag: 'GenerateLocationApprovalForm', label: 'Location Approval Form' },
    { flag: 'GenerateViewApprovalForm',     label: 'View Approval Form' }
  ];
  // Picker-only flag — never sent to the greenlight webhook (gatherPayload
  // maps DOCS flags only); routes to KICKOFF_WEBHOOK instead.
  var KICKOFF_FLAG  = 'KickoffDeck';
  var KICKOFF_LABEL = 'Kickoff Deck';

  var BTN_ID   = 'scw-regen-docs-btn';
  var WRAP_ID  = 'scw-regen-docs-wrap';
  var PANEL_ID = 'scw-regen-docs-panel';
  var STYLE_ID = 'scw-regen-docs-css';
  var EVENT_NS = '.scwRegenDocs';
  var LABEL    = 'Regenerate Docs…';
  var HEX24    = /[0-9a-f]{24}/i;

  var DOC_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
    '<polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="13" x2="15" y2="13"></line>' +
    '<line x1="9" y1="17" x2="15" y2="17"></line></svg>';
  var SPIN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + WRAP_ID + '{position:relative;display:inline-flex;}' +
      // Same visual family as the sibling kickoff-deck button.
      '#' + BTN_ID + '{display:flex;align-items:center;gap:8px;' +
        'padding:9px 16px;font:600 13px/1 system-ui,-apple-system,sans-serif;cursor:pointer;' +
        'color:#fff;background:#0f4c75;border:1px solid #0a3a63;border-radius:6px;' +
        'transition:background .12s;}' +
      '#' + BTN_ID + ':hover{background:#0a3a63;}' +
      '#' + BTN_ID + '[disabled]{opacity:.7;cursor:default;}' +
      '#' + BTN_ID + '.is-loading svg{animation:scw-rgd-spin .8s linear infinite;}' +
      '#' + BTN_ID + '.is-done{background:#15803d;border-color:#166534;}' +
      '#' + BTN_ID + '.is-err{background:#b91c1c;border-color:#991b1b;}' +
      '@keyframes scw-rgd-spin{to{transform:rotate(360deg);}}' +
      /* picker panel */
      '#' + PANEL_ID + '{position:absolute;top:calc(100% + 6px);left:0;z-index:60;' +
        'min-width:250px;background:#fff;border:1px solid #dbe4ee;border-radius:10px;' +
        'box-shadow:0 10px 28px rgba(15,23,42,.18);padding:12px 14px;' +
        'font:13px/1.4 system-ui,-apple-system,sans-serif;color:#0f172a;}' +
      '#' + PANEL_ID + ' .scw-rgd-title{font:700 11px/1.2 system-ui,sans-serif;' +
        'text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:0 0 9px;}' +
      '#' + PANEL_ID + ' label{display:flex;align-items:center;gap:9px;padding:5px 0;' +
        'cursor:pointer;font-weight:600;color:#1e293b;}' +
      '#' + PANEL_ID + ' input[type=checkbox]{width:15px;height:15px;accent-color:#0f4c75;' +
        'cursor:pointer;flex:none;}' +
      '#' + PANEL_ID + ' .scw-rgd-actions{display:flex;justify-content:flex-end;gap:8px;' +
        'margin-top:11px;padding-top:11px;border-top:1px solid #eef2f7;}' +
      '#' + PANEL_ID + ' .scw-rgd-btn{padding:7px 14px;border-radius:6px;cursor:pointer;' +
        'font:600 12.5px/1.2 system-ui,sans-serif;border:1px solid transparent;}' +
      '#' + PANEL_ID + ' .scw-rgd-btn--cancel{background:#fff;color:#475569;border-color:#cbd5e1;}' +
      '#' + PANEL_ID + ' .scw-rgd-btn--go{background:#0f4c75;color:#fff;}' +
      '#' + PANEL_ID + ' .scw-rgd-btn--go:disabled{background:#cbd5e1;cursor:not-allowed;}';
    document.head.appendChild(s);
  }

  // The id of the first (only) row in a list view — model first, DOM fallback.
  function firstRowId(viewId) {
    try {
      var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewId] : null;
      var models = v && v.model && v.model.data && v.model.data.models;
      if (models && models.length && models[0]) {
        var id = models[0].id || (models[0].attributes && models[0].attributes.id);
        if (id) return id;
      }
    } catch (e) { /* fall through to DOM */ }
    var tr = document.querySelector('#' + viewId + ' tbody tr[id]');
    return (tr && HEX24.test(tr.id)) ? tr.id : '';
  }

  function gatherPayload(dep, selection) {
    var row = {
      CloseoutID:   firstRowId(dep.view),
      AcceptanceID: firstRowId(dep.acceptanceView),
      Source:       'regen-docs-button'
    };
    for (var i = 0; i < DOCS.length; i++) {
      row[DOCS[i].flag] = selection[DOCS[i].flag] ? 'yes' : 'no';
    }
    return [row];
  }

  // project id from the deploy-scene URL — ops route carries it as
  // #…/project-dashboard/<id>/…, the sub portal as
  // #…/deployment-dashboard/<id>/… (same derivation the retired
  // kickoff-deck button used).
  function urlProjectId() {
    var m = (window.location.hash || '')
      .match(/(?:project-dashboard|deployment-dashboard)\/([0-9a-f]{24})/i);
    return m ? m[1] : '';
  }
  function gatherKickoffPayload(dep) {
    return [{
      project_recordID:       urlProjectId(),
      questionnaire_recordID: firstRowId(dep.questionnaireView),
      acceptance_recordID:    firstRowId(dep.acceptanceView),
      closeout_recordID:      firstRowId(dep.view)
    }];
  }

  function setState(btn, state, msg) {
    btn.classList.remove('is-loading', 'is-done', 'is-err');
    if (state === 'loading') {
      btn.classList.add('is-loading'); btn.disabled = true;
      btn.innerHTML = SPIN_SVG + '<span>Regenerating…</span>';
    } else if (state === 'done') {
      btn.classList.add('is-done'); btn.disabled = false;
      btn.innerHTML = DOC_SVG + '<span>Done — docs requested</span>';
      setTimeout(function () { setState(btn, 'idle'); }, 4000);
    } else if (state === 'err') {
      btn.classList.add('is-err'); btn.disabled = false;
      btn.innerHTML = DOC_SVG + '<span>' + (msg || 'Failed — retry') + '</span>';
      setTimeout(function () { setState(btn, 'idle'); }, 6000);
    } else {
      btn.disabled = false;
      btn.innerHTML = DOC_SVG + '<span>' + LABEL + '</span>';
    }
  }

  // Same staggered refresh as the kickoff-deck button — Make writes the new
  // DOC records, then the deliverables strip rebuilds on these views' render.
  function refreshCloseoutViews(dep) {
    (dep ? dep.refreshViews : []).forEach(function (vk) {
      var v = window.Knack && Knack.views && Knack.views[vk];
      if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
    });
  }
  function onSuccess(btn, dep) {
    setState(btn, 'done');
    refreshCloseoutViews(dep);
    setTimeout(function () { refreshCloseoutViews(dep); }, 3000);
    setTimeout(function () { refreshCloseoutViews(dep); }, 8000);
  }

  // One lenient POST: cb(true) for any 2xx without an explicit
  // success:false, and for CORS-opaque status 0 (the webhook landed).
  function postWebhook(url, payload, cb) {
    $.ajax({
      url: url, type: 'POST', contentType: 'application/json',
      data: JSON.stringify(payload), crossDomain: true, timeout: 120000
    }).done(function (resp) {
      var data = resp;
      if (typeof resp === 'string') { try { data = JSON.parse(resp); } catch (e) { data = null; } }
      cb(!data || data.success !== false);
    }).fail(function (xhr) {
      cb(!!(xhr && (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300))));
    });
  }

  function fire(btn, selection) {
    var dep = activeDep();
    if (!dep) return;
    var docsWanted = false;
    for (var i = 0; i < DOCS.length; i++) {
      if (selection[DOCS[i].flag]) docsWanted = true;
    }
    var kickoffWanted = !!selection[KICKOFF_FLAG];
    if (!docsWanted && !kickoffWanted) return;

    var docsPayload = docsWanted ? gatherPayload(dep, selection) : null;
    if (docsWanted && (!docsPayload[0].CloseoutID || !docsPayload[0].AcceptanceID)) {
      setState(btn, 'err', 'Missing closeout/acceptance id');
      return;
    }
    var kickoffPayload = kickoffWanted ? gatherKickoffPayload(dep) : null;
    if (window.SCW && SCW.debug) {
      SCW.debug('[regen-docs] payloads', { docs: docsPayload, kickoff: kickoffPayload });
    }
    setState(btn, 'loading');

    // The two scenarios are independent webhooks — fire what's selected in
    // parallel and settle once, naming any side that failed.
    var pendingN = (docsWanted ? 1 : 0) + (kickoffWanted ? 1 : 0);
    var failedNames = [];
    function settle(name, ok) {
      if (!ok) failedNames.push(name);
      pendingN--;
      if (pendingN > 0) return;
      if (!failedNames.length) onSuccess(btn, dep);
      else setState(btn, 'err', failedNames.join(' + ') + ' failed — retry');
    }
    if (docsWanted) {
      postWebhook(WEBHOOK, docsPayload, function (ok) { settle('Docs', ok); });
    }
    if (kickoffWanted) {
      postWebhook(KICKOFF_WEBHOOK, kickoffPayload, function (ok) { settle('Kickoff deck', ok); });
    }
  }

  // ── picker panel ─────────────────────────────────────────────────────
  function closePanel() {
    var p = document.getElementById(PANEL_ID);
    if (p && p.parentNode) p.parentNode.removeChild(p);
    document.removeEventListener('mousedown', onOutside, true);
  }
  function onOutside(e) {
    var wrap = document.getElementById(WRAP_ID);
    if (wrap && !wrap.contains(e.target)) closePanel();
  }
  function openPanel(wrap, btn) {
    if (document.getElementById(PANEL_ID)) { closePanel(); return; }
    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    var rows = '';
    for (var i = 0; i < DOCS.length; i++) {
      rows += '<label><input type="checkbox" data-flag="' + DOCS[i].flag + '">' +
        DOCS[i].label + '</label>';
    }
    // Kickoff Deck rides in the same picker but fires its own webhook —
    // the flag is picker-only and never reaches the greenlight payload.
    rows += '<label><input type="checkbox" data-flag="' + KICKOFF_FLAG + '">' +
      KICKOFF_LABEL + '</label>';
    panel.innerHTML =
      '<div class="scw-rgd-title">Regenerate documents</div>' + rows +
      '<div class="scw-rgd-actions">' +
        '<button type="button" class="scw-rgd-btn scw-rgd-btn--cancel">Cancel</button>' +
        '<button type="button" class="scw-rgd-btn scw-rgd-btn--go">Generate</button>' +
      '</div>';
    wrap.appendChild(panel);

    var go = panel.querySelector('.scw-rgd-btn--go');
    function syncGo() {
      go.disabled = !panel.querySelector('input[type=checkbox]:checked');
    }
    var boxes = panel.querySelectorAll('input[type=checkbox]');
    for (var b = 0; b < boxes.length; b++) boxes[b].addEventListener('change', syncGo);
    syncGo();

    panel.querySelector('.scw-rgd-btn--cancel').addEventListener('click', closePanel);
    go.addEventListener('click', function () {
      var selection = {};
      var checks = panel.querySelectorAll('input[type=checkbox]');
      for (var c = 0; c < checks.length; c++) {
        selection[checks[c].getAttribute('data-flag')] = checks[c].checked;
      }
      closePanel();
      fire(btn, selection);
    });
    document.addEventListener('mousedown', onOutside, true);
  }

  // ── mount ────────────────────────────────────────────────────────────
  function mount() {
    var dep = activeDep();
    if (!dep) return;
    var view = document.getElementById(dep.view);
    if (!view) return;
    injectStyles();
    var wrap = document.getElementById(WRAP_ID);
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.id = WRAP_ID;
      var btn = document.createElement('button');
      btn.id = BTN_ID; btn.type = 'button';
      setState(btn, 'idle');
      btn.addEventListener('click', function () {
        if (!btn.disabled) openPanel(wrap, btn);
      });
      wrap.appendChild(btn);
    }
    // Live in the shared closeout-actions toolbar (send-coc-button.js builds
    // it and adopts this control into the utility slot on the LEFT — the
    // slot the retired kickoff-deck button used to hold); until the toolbar
    // exists, sit after the header, then get adopted on a later render pass.
    var tb = document.getElementById(TOOLBAR_ID);
    if (tb) {
      if (wrap.parentNode !== tb) tb.insertBefore(wrap, tb.firstChild);
    } else if (!wrap.parentNode) {
      var header = view.querySelector('.view-header');
      if (header && header.parentNode) header.parentNode.insertBefore(wrap, header.nextSibling);
      else view.insertBefore(wrap, view.firstChild);
    }
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    DEPLOYMENTS.forEach(function (dep) {
      SCW.onViewRender(dep.view, function () { setTimeout(mount, 60); }, EVENT_NS);
    });
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(mount, 160); });
})();
/*** END FEATURE: Regenerate Docs *******************************************/
