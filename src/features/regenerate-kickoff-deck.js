/*** FEATURE: "Regenerate Kickoff Deck" button on the CLOSEOUT view *********
 *
 * Injects a "Regenerate Kickoff Deck" button into the closeout details view
 * (view_3940). On click it POSTs to the Make webhook with the proposal,
 * project, and questionnaire record ids — matching the scenario's payload:
 *
 *   [{ "project_recordID": "...", "questionnaire_recordID": "...",
 *      "acceptance_recordID": "..." }]
 *
 * ID sources (all on the deploy scene):
 *   project_recordID       → the page URL (#…/project-dashboard/<id>/deploy/<id>/)
 *   questionnaire_recordID → the single questionnaire row in view_4015 (tr id)
 *   acceptance_recordID    → the single ACCEPTANCE row in view_3914 (tr id)
 ****************************************************************************/
(function () {
  'use strict';

  var VIEW         = 'view_3940';   // CLOSEOUT view (button mount)
  var ACCEPTANCE_VIEW     = 'view_3914';   // ACCEPTANCE (single row)
  var QUESTIONNAIRE_VIEW = 'view_4015';  // System Setup Questionnaire (single row)
  var WEBHOOK = 'https://hook.us1.make.com/biytjoog3spow4fx2f7zanjjjj792q9c';

  var BTN_ID    = 'scw-regen-kickoff-deck';
  var STYLE_ID  = 'scw-regen-kickoff-deck-css';
  var EVENT_NS  = '.scwKickoffDeck';
  var LABEL     = 'Regenerate Kickoff Deck';
  var HEX24     = /[0-9a-f]{24}/i;

  var DECK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"></rect>' +
    '<line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
  var SPIN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + BTN_ID + '{display:inline-flex;align-items:center;gap:8px;margin:0 0 14px;' +
        'padding:9px 16px;font:600 13px/1 system-ui,-apple-system,sans-serif;cursor:pointer;' +
        'color:#fff;background:#0f4c75;border:1px solid #0a3a63;border-radius:6px;' +
        'transition:background .12s;}' +
      '#' + BTN_ID + ':hover{background:#0a3a63;}' +
      '#' + BTN_ID + '[disabled]{opacity:.7;cursor:default;}' +
      '#' + BTN_ID + '.is-loading svg{animation:scw-kod-spin .8s linear infinite;}' +
      '#' + BTN_ID + '.is-done{background:#15803d;border-color:#166534;}' +
      '#' + BTN_ID + '.is-err{background:#b91c1c;border-color:#991b1b;}' +
      '@keyframes scw-kod-spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(s);
  }

  // project id from the deploy-scene URL: #…/project-dashboard/<id>/deploy/<id>/
  function urlProjectId() {
    var m = (window.location.hash || '').match(/project-dashboard\/([0-9a-f]{24})/i);
    return m ? m[1] : '';
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
  function gatherPayload() {
    return [{
      project_recordID:       urlProjectId(),
      questionnaire_recordID: firstRowId(QUESTIONNAIRE_VIEW),
      acceptance_recordID:    firstRowId(ACCEPTANCE_VIEW),
      closeout_recordID:      firstRowId(VIEW)   // first row of the closeout grid
    }];
  }

  function setState(btn, state) {
    btn.classList.remove('is-loading', 'is-done', 'is-err');
    if (state === 'loading') {
      btn.classList.add('is-loading'); btn.disabled = true;
      btn.innerHTML = SPIN_SVG + '<span>Regenerating…</span>';
    } else if (state === 'done') {
      btn.classList.add('is-done'); btn.disabled = false;
      btn.innerHTML = DECK_SVG + '<span>Sent — regenerating</span>';
      setTimeout(function () { setState(btn, 'idle'); }, 4000);
    } else {
      btn.disabled = false;
      btn.innerHTML = DECK_SVG + '<span>' + LABEL + '</span>';
    }
  }

  function fire(btn) {
    var payload = gatherPayload();
    if (window.SCW && SCW.debug) SCW.debug('[kickoff-deck] payload', payload[0]);
    setState(btn, 'loading');
    $.ajax({
      url: WEBHOOK, type: 'POST', contentType: 'application/json',
      data: JSON.stringify(payload), crossDomain: true, timeout: 60000
    }).always(function () { setState(btn, 'done'); });
  }

  function mount() {
    var view = document.getElementById(VIEW);
    if (!view || document.getElementById(BTN_ID)) return;
    injectStyles();
    var btn = document.createElement('button');
    btn.id = BTN_ID; btn.type = 'button';
    setState(btn, 'idle');
    btn.addEventListener('click', function () { if (!btn.disabled) fire(btn); });
    var header = view.querySelector('.view-header');
    if (header && header.parentNode) header.parentNode.insertBefore(btn, header.nextSibling);
    else view.insertBefore(btn, view.firstChild);
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, function () { setTimeout(mount, 50); }, EVENT_NS);
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(mount, 150); });
})();
/*** END FEATURE: Regenerate Kickoff Deck ***********************************/
