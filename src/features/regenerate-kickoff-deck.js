/*** FEATURE: "Regenerate Kickoff Deck" button on the CLOSEOUT view *********
 *
 * Injects a "Regenerate Kickoff Deck" button into the closeout details view
 * (view_3940). On click it POSTs to the Make webhook with the proposal,
 * project, and questionnaire record ids — matching the scenario's payload:
 *
 *   [{ "proposal_recordID": "...", "project_recordID": "...",
 *      "questionnaire_recordID": "..." }]
 *
 * The ids are read from connection fields on the closeout record (view_3940's
 * model). Set WEBHOOK + ID_FIELDS below.
 ****************************************************************************/
(function () {
  'use strict';

  var VIEW     = 'view_3940';            // CLOSEOUT details view
  var WEBHOOK  = '__FILL_WEBHOOK_URL__';  // Make webhook for kickoff-deck regen
  // Where each payload id comes from — a connection field on the closeout
  // record (read from view_3940's model). Fill in the field keys.
  var ID_FIELDS = {
    proposal_recordID:      '__field_proposal__',
    project_recordID:       '__field_project__',
    questionnaire_recordID: '__field_questionnaire__'
  };

  var BTN_ID    = 'scw-regen-kickoff-deck';
  var STYLE_ID  = 'scw-regen-kickoff-deck-css';
  var EVENT_NS  = '.scwKickoffDeck';
  var LABEL     = 'Regenerate Kickoff Deck';

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
      '@keyframes scw-kod-spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(s);
  }

  function closeoutAttrs() {
    var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[VIEW] : null;
    return (v && v.model && (v.model.attributes || (v.model.data && v.model.data.attributes))) || null;
  }
  function firstConnId(attrs, fk) {
    if (!attrs || !fk) return '';
    var raw = attrs[fk + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || '';
    if (raw && raw.id) return raw.id;
    var plain = attrs[fk];
    return (plain && /^[0-9a-f]{24}$/i.test(String(plain).trim())) ? String(plain).trim() : '';
  }
  function gatherPayload() {
    var attrs = closeoutAttrs();
    var obj = {};
    for (var key in ID_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(ID_FIELDS, key)) {
        obj[key] = firstConnId(attrs, ID_FIELDS[key]);
      }
    }
    return [obj];   // array-wrapped, matching the Make scenario's expected shape
  }

  function setState(btn, state) {
    btn.classList.remove('is-loading', 'is-done');
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
    // Mount at the top of the closeout view body.
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
