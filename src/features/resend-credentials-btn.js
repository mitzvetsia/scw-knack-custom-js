/*** FEATURE: "Resend Credentials" button (view_4033 — Edit Customer modal) **
 *
 * Adds a "Resend Credentials" button to the Edit Customer form (view_4033,
 * a Knack modal on scene_1348). On click it POSTs the full customer record
 * to the Make webhook, which re-sends the user's login credentials.
 *
 * Payload: the Knack form model's record attributes (every field_XXXX +
 * _raw on the record) plus the live on-screen form values (so an unsaved
 * edit — e.g. a freshly typed temp password — is included), the record id,
 * and who triggered it.
 ****************************************************************************/
(function () {
  'use strict';

  var VIEW     = 'view_4033';
  var WEBHOOK  = 'https://hook.us1.make.com/kuyoy400iam4t7cdnwx3lobhno3wync5';
  var BTN_ID   = 'scw-resend-credentials';
  var STYLE_ID = 'scw-resend-credentials-css';
  var EVENT_NS = '.scwResendCreds';
  var LABEL    = 'Resend Credentials';

  var SEND_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line>' +
    '<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
  var SPIN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + BTN_ID + '{display:inline-flex;align-items:center;gap:8px;' +
        'margin:0 10px 0 0;padding:9px 16px;font:600 13px/1 system-ui,-apple-system,sans-serif;' +
        'cursor:pointer;color:#0f4c75;background:#eef5fc;border:1px solid #bcd6ef;' +
        'border-radius:6px;transition:background .12s,border-color .12s;}' +
      '#' + BTN_ID + ':hover{background:#dceafa;border-color:#93c5fd;}' +
      '#' + BTN_ID + '[disabled]{opacity:.7;cursor:default;}' +
      '#' + BTN_ID + '.is-loading svg{animation:scw-rc-spin .8s linear infinite;}' +
      '#' + BTN_ID + '.is-done{background:#dcfce7;border-color:#86efac;color:#15803d;}' +
      '#' + BTN_ID + '.is-err{background:#fef2f2;border-color:#fca5a5;color:#b91c1c;}' +
      '@keyframes scw-rc-spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(s);
  }

  function recordId(viewEl) {
    var inp = viewEl.querySelector('input[name="id"]');
    if (inp && inp.value) return inp.value;
    try {
      var v = window.Knack && Knack.views && Knack.views[VIEW];
      var a = v && v.model && (v.model.attributes || (v.model.toJSON && v.model.toJSON()));
      if (a && a.id) return a.id;
    } catch (e) {}
    return '';
  }

  // The record as Knack has it on the form model — every field_XXXX (+ _raw).
  function modelRecord() {
    try {
      var v = window.Knack && Knack.views && Knack.views[VIEW];
      if (v && v.model) {
        if (typeof v.model.toJSON === 'function') return v.model.toJSON() || {};
        if (v.model.attributes) return v.model.attributes;
      }
    } catch (e) {}
    return {};
  }

  // Live on-screen values keyed by field key, so an unsaved edit (newly typed
  // temp password, changed email, etc.) is captured even before Submit.
  function liveFormValues(viewEl) {
    var out = {};
    var groups = viewEl.querySelectorAll('.kn-input[data-input-id]');
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var key = g.getAttribute('data-input-id');
      if (!key) continue;
      if (g.classList.contains('kn-input-name')) {
        var f = g.querySelector('input[name="first"]');
        var l = g.querySelector('input[name="last"]');
        out[key] = { first: f ? f.value : '', last: l ? l.value : '' };
      } else {
        var el = g.querySelector('select, textarea, input:not([type="hidden"])');
        if (el) out[key] = (el.type === 'checkbox') ? el.checked : el.value;
      }
    }
    return out;
  }

  function getTriggeredBy() {
    try {
      var u = window.Knack && Knack.getUserAttributes && Knack.getUserAttributes();
      if (u) return { id: u.id || '', name: u.name || '', email: u.email || '' };
    } catch (e) {}
    return { id: '', name: '', email: '' };
  }

  function setState(btn, state) {
    btn.classList.remove('is-loading', 'is-done', 'is-err');
    if (state === 'loading') {
      btn.classList.add('is-loading'); btn.disabled = true;
      btn.innerHTML = SPIN_SVG + '<span>Sending…</span>';
    } else if (state === 'done') {
      btn.classList.add('is-done'); btn.disabled = false;
      btn.innerHTML = SEND_SVG + '<span>Credentials sent</span>';
      setTimeout(function () { setState(btn, 'idle'); }, 4000);
    } else if (state === 'err') {
      btn.classList.add('is-err'); btn.disabled = false;
      btn.innerHTML = SEND_SVG + '<span>Failed — retry</span>';
      setTimeout(function () { setState(btn, 'idle'); }, 6000);
    } else {
      btn.disabled = false;
      btn.innerHTML = SEND_SVG + '<span>' + LABEL + '</span>';
    }
  }

  // Parent-page hash for this modal: strip the trailing two segments
  // (modal slug + modal record id), preserving the query string. Same
  // approach as modal-refresh-redirect.js / proposal-pdf-export's
  // redirectToParent — closing the modal returns to the page behind it.
  function parentHash() {
    var raw      = window.location.hash || '';
    var qIdx     = raw.indexOf('?');
    var pathPart = qIdx >= 0 ? raw.substring(0, qIdx) : raw;
    var queryPart = qIdx >= 0 ? raw.substring(qIdx)   : '';
    pathPart = pathPart.replace(/\/+$/, '');
    var parts = pathPart.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts.length >= 2) { parts.splice(-2, 2); return '#' + parts.join('/') + queryPart; }
    return '#';
  }

  function fire(btn, viewEl) {
    var record = modelRecord();
    var live   = liveFormValues(viewEl);
    // "Dump all the record fields": spread the model record at the top level,
    // then overlay the live form values so on-screen edits win, plus metadata.
    var payload = {};
    for (var k in record) if (record.hasOwnProperty(k)) payload[k] = record[k];
    for (var lk in live) if (live.hasOwnProperty(lk)) payload[lk] = live[lk];
    payload.event       = 'resend-credentials';
    payload.record_id   = recordId(viewEl);
    payload.id          = payload.id || payload.record_id;
    payload.view_id     = VIEW;
    payload.scene_id    = (window.Knack && Knack.router && Knack.router.current_scene_key) || '';
    payload.triggered_by = getTriggeredBy();

    setState(btn, 'loading');

    // Close the modal + return to the parent page once the webhook settles
    // (success OR failure — same end state as a native Knack form submit),
    // with a hard cap so a slow webhook never traps the user in the modal.
    var target = parentHash();
    var closed = false;
    function closeToParent() {
      if (closed) return;
      closed = true;
      try { window.location.hash = target; } catch (e) { /* ignore */ }
    }

    $.ajax({
      url: WEBHOOK, type: 'POST', contentType: 'application/json',
      data: JSON.stringify(payload), crossDomain: true, timeout: 60000
    }).always(function () { closeToParent(); });

    setTimeout(closeToParent, 8000);   // hard cap — release the modal regardless
  }

  function mount() {
    var viewEl = document.getElementById(VIEW);
    if (!viewEl || document.getElementById(BTN_ID)) return;
    injectStyles();
    var btn = document.createElement('button');
    btn.id = BTN_ID; btn.type = 'button';
    setState(btn, 'idle');
    btn.addEventListener('click', function () { if (!btn.disabled) fire(btn, viewEl); });
    // Sit to the LEFT of the primary Submit button (secondary action first).
    var submit = viewEl.querySelector('.kn-submit');
    if (submit) submit.insertBefore(btn, submit.firstChild);
    else viewEl.appendChild(btn);
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, function () { setTimeout(mount, 30); }, EVENT_NS);
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(mount, 150); });
})();
/*** END FEATURE: Resend Credentials button ********************************/
