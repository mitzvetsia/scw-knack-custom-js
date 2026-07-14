/*** CO ADD-ITEM FORM — auto-connect field_2182 to THIS change order ********
 *
 * view_4100 is a copy of the SOW multi-add form (view_3329) opened from the
 * CO worksheet's "+ Add New Item" button. On the base form the user hand-
 * picks which SOW(s) to add to (field_2182, REL_scope of work — a checkbox
 * multi-connection). On a Change Order that choice is NOT the user's: every
 * item must land on THIS CO's own SOW record, period.
 *
 * Knack's native "default this connection to the page's parent record" would
 * do it (the same hidden-injection that fills field_2181=project on
 * view_3329) — but that can't be set on view_4100 without rebuilding the
 * form. So we do it client-side, ONCE per form render (a prefill, NOT an
 * ongoing cascade — nothing to drift):
 *
 *   1. Resolve the CO's SOW id = last 24-hex segment of the hash (same rule
 *      co-adopt.js uses; view_4100 is a drill-in child page whose OWN record
 *      is the CO's SOW).
 *   2. Force field_2182 to exactly [coSowId]: uncheck every other box, and
 *      check the CO's box — injecting it if the CO isn't in the rendered
 *      list (base-scope forms filter change-order SOWs out of the picker).
 *   3. Sync Knack's form model (checkbox .checked + change event + the hidden
 *      connection input) so submit carries the CO id.
 *   4. Hide the whole field — on a CO the SOW target is not a decision.
 *
 * If the CO id can't be resolved, we do nothing and leave the native form
 * (the user can still pick manually) rather than break the add flow.
 ***************************************************************************/
(function () {
  'use strict';

  var VIEW      = 'view_4100';
  var SOW_FIELD = 'field_2182';   // REL_scope of work (checkbox multi-connection)
  var STYLE_ID  = 'scw-co-add-prefill-css';
  var EVENT_NS  = '.scwCoAddPrefill';
  var HEX24     = /^[a-f0-9]{24}$/i;

  // CO's SOW id = last 24-hex segment of the hash. view_4100 is a drill-in
  // child page whose own record IS the CO's SOW (mirrors co-adopt.js).
  function getCoSowId() {
    var segs = (window.location.hash || '').replace(/^#/, '').split('?')[0].split('/');
    for (var i = segs.length - 1; i >= 0; i--) {
      if (HEX24.test(segs[i])) return segs[i];
    }
    return '';
  }

  // Hide the SOW field on view_4100 only. Two id selectors outweigh the
  // visibility module's `#view .kn-input.scw-visible` (one id + two classes),
  // so this wins even though that rule carries !important.
  function injectHideCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = '#' + VIEW + ' #kn-input-' + SOW_FIELD +
      ' { display: none !important; }';
    (document.head || document.documentElement).appendChild(s);
  }

  function prefill() {
    var view = document.getElementById(VIEW);
    if (!view) return;
    if (view.getAttribute('data-scw-co-sow-locked') === '1') return;

    var coId = getCoSowId();
    if (!coId) {
      if (window.console) {
        console.warn('[scw-co-add] could not resolve the CO SOW id from the ' +
          'hash — leaving ' + SOW_FIELD + ' as a manual pick.');
      }
      return;
    }

    var wrap = view.querySelector('#kn-input-' + SOW_FIELD);
    if (!wrap) return;   // field not rendered yet — a later render retries
    var container = wrap.querySelector('.conn_inputs') || wrap;

    // Uncheck every rendered SOW box; check only the CO's (inject if absent).
    var boxes = wrap.querySelectorAll('input[type="checkbox"][name="' + SOW_FIELD + '"]');
    var found = null;
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].value === coId) { found = boxes[i]; boxes[i].checked = true; }
      else boxes[i].checked = false;
    }
    if (!found) {
      var ctrl = document.createElement('div');
      ctrl.className = 'control';
      ctrl.innerHTML = '<label class="option checkbox">' +
        '<input name="' + SOW_FIELD + '" type="checkbox" value="' + coId + '" checked>' +
        '&nbsp;<span>This Change Order</span></label>';
      container.appendChild(ctrl);
      found = ctrl.querySelector('input');
    }

    // Sync the hidden connection input Knack renders alongside the checkboxes
    // (URL-encoded JSON, matching its initial `%22%22` = "").
    var hidden = wrap.querySelector('input.connection[name="' + SOW_FIELD + '"]');
    if (hidden) {
      try { hidden.value = encodeURIComponent(JSON.stringify(coId)); } catch (e) {}
    }

    // Fire change the way a real click would, so Knack's delegated handler
    // syncs its internal form model (jQuery first — Knack binds via jQuery).
    if (found) {
      if (window.$ && typeof window.$ === 'function') {
        window.$(found).trigger('change');
      } else {
        found.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    injectHideCss();
    view.setAttribute('data-scw-co-sow-locked', '1');
    if (window.console) {
      console.log('[scw-co-add] locked ' + SOW_FIELD + ' to CO SOW ' + coId +
        (found && !boxes.length ? ' (injected)' : ''));
    }
  }

  function prefillSoon() {
    // After the bucket-visibility module's render pass (it re-classes fields),
    // so our hide rule and checkbox state land on the settled DOM.
    setTimeout(prefill, 60);
    setTimeout(prefill, 300);
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, prefillSoon, EVENT_NS);
  }
  $(document).off('knack-view-render.' + VIEW + EVENT_NS)
    .on('knack-view-render.' + VIEW + EVENT_NS, prefillSoon);
})();
/*** END: CO add-item prefill **********************************************/
