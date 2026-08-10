/*** FEATURE: "Send CoC" button + CoC status pill on the CLOSEOUT view ******
 *
 * Builds a closeout-actions toolbar row on the closeout view (view_3940).
 * The row holds:
 *
 *   • the "Regenerate Docs…" control — adopted into the row (utility
 *     action, LEFT; it absorbed the retired standalone Regenerate Kickoff
 *     Deck button). regenerate-closeout-docs.js still owns its creation +
 *     behavior; this module only re-parents the node.
 *   • a "Send CoC" button (primary action, RIGHT — repo convention: primary
 *     is rightmost) that navigates to the Knack child page
 *     `edit-install-closeout-send-coc/<closeoutId>/`.
 *   • a status pill fed from the closeout row so the user sees when / to
 *     whom the CoC went:
 *       field_2970 — CoC status (on the closeout)
 *       field_2969 — REL contact the CoC is sent to
 *
 * When field_2970 reads as sent (sent/complete/signed/issued/done) the pill
 * goes green ("CoC sent → <contact>") and the Send CoC button demotes to an
 * outline secondary style — still clickable (resend / review), but no longer
 * shouting for an action that's finished. Any other non-empty status shows
 * as an amber "CoC: <status>" pill (pending-ish states).
 *
 * Field reads go model-first (field_2970 rendered text, field_2969_raw
 * [{id, identifier}]) with a DOM-scrape fallback on the hidden native grid.
 ***************************************************************************/
(function () {
  'use strict';

  // Deployments — mirror closeout-deliverables.js. Internal deploy scene
  // only for now; add the sub view here if subs ever send CoCs.
  var DEPLOYMENTS = [
    { view: 'view_3940', slug: 'edit-install-closeout-send-coc' }
  ];

  var F = {
    cocStatus:  'field_2970',
    cocContact: 'field_2969'
  };

  var TOOLBAR_ID   = 'scw-closeout-actions';
  var BTN_ID       = 'scw-send-coc-btn';
  var PILL_ID      = 'scw-coc-status-pill';
  var REGEN_WRAP_ID = 'scw-regen-docs-wrap';   // Regenerate Docs (utility, LEFT)
  var REGEN_BTN_ID  = 'scw-regen-docs-btn';
  var STYLE_ID     = 'scw-send-coc-css';
  var EVENT_NS     = '.scwSendCoc';
  var SENT_RE      = /sent|complete|signed|issued|done/i;
  var HEX24        = /[0-9a-f]{24}/i;

  var SEND_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line>' +
    '<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="20 6 9 17 4 12"></polyline></svg>';
  var CLOCK_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + TOOLBAR_ID + '{display:flex;align-items:center;flex-wrap:wrap;gap:10px;' +
        'margin:0 0 14px 0;}' +
      '#' + TOOLBAR_ID + ' #' + REGEN_BTN_ID + '{margin:0;}' +
      // Visual hierarchy: Regenerate Docs is a utility action — render it
      // as an outline secondary inside the row so the primary Send CoC
      // stands alone. Idle state only: its own loading/done/err colors win.
      '#' + TOOLBAR_ID + ' #' + REGEN_BTN_ID +
        ':not(.is-loading):not(.is-done):not(.is-err){' +
        'color:#0f4c75;background:#fff;border-color:#c7d4e0;}' +
      '#' + TOOLBAR_ID + ' #' + REGEN_BTN_ID +
        ':not(.is-loading):not(.is-done):not(.is-err):hover{background:#f1f5f9;}' +
      '#' + BTN_ID + '{display:inline-flex;align-items:center;gap:8px;' +
        'padding:9px 16px;font:600 13px/1 system-ui,-apple-system,sans-serif;cursor:pointer;' +
        'color:#fff;background:#0f4c75;border:1px solid #0a3a63;border-radius:6px;' +
        'transition:background .12s,color .12s;}' +
      '#' + BTN_ID + ':hover{background:#0a3a63;}' +
      // Sent → demote to outline secondary; the pill carries the state.
      '#' + BTN_ID + '.is-sent{color:#0f4c75;background:#fff;border-color:#c7d4e0;}' +
      '#' + BTN_ID + '.is-sent:hover{background:#f1f5f9;}' +
      // Status pill reads as state, not a third button — push it to the far
      // right of the row, away from the action cluster.
      '#' + PILL_ID + '{display:inline-flex;align-items:center;gap:6px;' +
        'margin-left:auto;padding:6px 12px;border-radius:999px;' +
        'font:600 12px/1 system-ui,-apple-system,sans-serif;}' +
      '#' + PILL_ID + '.is-sent{color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;}' +
      '#' + PILL_ID + '.is-pending{color:#b45309;background:#fffbeb;border:1px solid #fde68a;}' +
      '#' + PILL_ID + '.is-none{color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;}';
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function activeDep() {
    for (var i = 0; i < DEPLOYMENTS.length; i++) {
      if (document.getElementById(DEPLOYMENTS[i].view)) return DEPLOYMENTS[i];
    }
    return null;
  }

  // ── Closeout row reads (model first, DOM fallback) ─────────────────
  function firstModel(viewId) {
    try {
      var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewId] : null;
      var models = v && v.model && v.model.data && v.model.data.models;
      if (models && models.length && models[0]) return models[0].attributes || models[0];
    } catch (e) {}
    return null;
  }
  function firstRow(viewId) {
    return document.querySelector('#' + viewId + ' tbody tr[id]');
  }
  function closeoutId(viewId) {
    var rec = firstModel(viewId);
    if (rec && rec.id) return rec.id;
    var tr = firstRow(viewId);
    return (tr && HEX24.test(tr.id)) ? tr.id : '';
  }
  function readCocState(viewId) {
    var status = '', contact = '';
    var rec = firstModel(viewId);
    if (rec) {
      status = stripHtml(rec[F.cocStatus]);
      var raw = rec[F.cocContact + '_raw'];
      if (Array.isArray(raw) && raw.length && raw[0]) contact = stripHtml(raw[0].identifier);
      else if (raw && raw.identifier) contact = stripHtml(raw.identifier);
    }
    var tr = firstRow(viewId);
    if (tr) {
      if (!status) {
        var std = tr.querySelector('td.' + F.cocStatus);
        if (std) status = stripHtml(std.textContent);
      }
      if (!contact) {
        var ctd = tr.querySelector('td.' + F.cocContact + ' span[data-kn="connection-value"]');
        if (ctd) contact = stripHtml(ctd.textContent);
      }
    }
    return { status: status, contact: contact, sent: SENT_RE.test(status) };
  }

  // ── Child-page navigation (same hash pattern as closeout-deliverables) ──
  function sendCocHash(slug, recordId) {
    if (!recordId) return '';
    var hash = window.location.hash || '';
    var qIdx = hash.indexOf('?');
    if (qIdx >= 0) hash = hash.substring(0, qIdx);
    hash = hash.replace(/\/+$/, '');
    return hash + '/' + slug + '/' + recordId + '/';
  }

  // ── Mount ──────────────────────────────────────────────────────────
  function mount() {
    var dep = activeDep();
    if (!dep) return;
    var view = document.getElementById(dep.view);
    if (!view) return;
    injectStyles();

    var tb = document.getElementById(TOOLBAR_ID);
    if (!tb) {
      tb = document.createElement('div');
      tb.id = TOOLBAR_ID;
      var header = view.querySelector('.view-header');
      if (header && header.parentNode) header.parentNode.insertBefore(tb, header.nextSibling);
      else view.insertBefore(tb, view.firstChild);
    }

    // Adopt the Regenerate Docs control (utility, LEFT) if its module has
    // mounted it outside the row. It stays fully owned by its own module.
    var regen = document.getElementById(REGEN_WRAP_ID);
    if (regen && regen.parentNode !== tb) tb.insertBefore(regen, tb.firstChild);

    var state = readCocState(dep.view);

    var btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = BTN_ID; btn.type = 'button';
      btn.addEventListener('click', function () {
        var h = sendCocHash(dep.slug, closeoutId(dep.view));
        if (h) window.location.hash = h;
      });
      tb.appendChild(btn);
    }
    btn.classList.toggle('is-sent', !!state.sent);
    btn.innerHTML = SEND_SVG + '<span>Send CoC</span>';

    var pill = document.getElementById(PILL_ID);
    if (!pill) {
      pill = document.createElement('span');
      pill.id = PILL_ID;
      tb.appendChild(pill);
    }
    // Contact identifiers render as "Name, email" — show just the name in
    // the pill (full identifier stays in the tooltip).
    var who = state.contact ? state.contact.split(',')[0].trim() : '';
    if (state.sent) {
      pill.className = 'is-sent';
      pill.innerHTML = CHECK_SVG + '<span>CoC sent' +
        (who ? ' → ' + esc(who) : '') + '</span>';
    } else if (state.status) {
      pill.className = 'is-pending';
      pill.innerHTML = CLOCK_SVG + '<span>CoC: ' + esc(state.status) +
        (who ? ' → ' + esc(who) : '') + '</span>';
    } else {
      // No status yet — quiet neutral chip, no recipient (that's chosen /
      // confirmed on the send page).
      pill.className = 'is-none';
      pill.innerHTML = '<span>CoC not sent</span>';
    }
    pill.title = 'CoC status: ' + (state.status || 'not sent') +
                 (state.contact ? ' · Recipient: ' + state.contact : '');
  }

  // Run AFTER regenerate-closeout-docs' 60/160ms mounts so the adopt pass
  // finds its control; the 600ms retry catches a late re-mount.
  function mountSoon() {
    setTimeout(mount, 250);
    setTimeout(mount, 600);
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    for (var d = 0; d < DEPLOYMENTS.length; d++) {
      SCW.onViewRender(DEPLOYMENTS[d].view, mountSoon, EVENT_NS);
    }
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, mountSoon);
})();
/*** END FEATURE: Send CoC button ******************************************/
