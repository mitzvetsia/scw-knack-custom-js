/*** FEATURE: Preview Proposal Button → view_3814 header **********************
 *
 * Adds a "Preview Proposal" button to view_3814's accordion header. The
 * button always navigates to:
 *
 *   #proposals/proposal/<sowRecordId>/
 *
 * The SOW record id comes from view_3827's Backbone model — a kn-details
 * view of the SOW that's always present on this scene. Constructing the
 * hash directly is more reliable than scraping a menu view: there's no
 * "first link wins" ambiguity, no stale `_href` race after scene-render,
 * and no slug to keep in sync if Knack reorders menu items.
 ******************************************************************************/
(function () {
  'use strict';

  var SOW_VIEW    = 'view_3827';   // SOW kn-details view on this scene
  var TARGET_VIEW = 'view_3814';   // Published-proposals accordion host
  var BTN_MARKER  = 'scw-preview-proposal-btn';
  var EVENT_NS    = '.scwPreviewProposal';
  var BTN_LABEL   = 'Preview Proposal';
  var HEX24       = /^[0-9a-f]{24}$/i;

  function getSowId() {
    try {
      var v = Knack && Knack.views && Knack.views[SOW_VIEW];
      var attrs = v && v.model && (
        (v.model.data && v.model.data.attributes) ||
        v.model.attributes
      );
      var id = attrs && attrs.id;
      return (id && HEX24.test(id)) ? id : '';
    } catch (e) {
      return '';
    }
  }

  function buildHref(sowId) {
    return '#proposals/proposal/' + sowId + '/';
  }

  function injectOrUpdate() {
    var sowId = getSowId();
    if (!sowId) return;
    var href = buildHref(sowId);

    var targetEl = document.getElementById(TARGET_VIEW);
    if (!targetEl) return;

    var accordion = targetEl.closest('.scw-ktl-accordion');
    if (!accordion) return;
    var header = accordion.querySelector('.scw-ktl-accordion__header');
    if (!header) return;

    // Already injected — refresh the href in case the SOW id ever
    // changes mid-scene (e.g. parent page swap without full reload).
    var existing = header.querySelector('.' + BTN_MARKER);
    if (existing) {
      existing.setAttribute('data-link-href', href);
      return;
    }

    // Pre-existing accordion-action button with the same label gets
    // adopted rather than duplicated — keeps the header tidy when
    // another module also injected it.
    var existingBtns = header.querySelectorAll('.scw-acc-action-btn');
    for (var i = 0; i < existingBtns.length; i++) {
      if ((existingBtns[i].textContent || '').trim() === BTN_LABEL) {
        existingBtns[i].classList.add(BTN_MARKER);
        existingBtns[i].setAttribute('data-link-href', href);
        existingBtns[i].addEventListener('click', clickHandler);
        return;
      }
    }

    var actions = header.querySelector('.scw-acc-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'scw-acc-actions';
      var chevron = header.querySelector('.scw-acc-chevron');
      if (chevron) header.insertBefore(actions, chevron);
      else header.appendChild(actions);
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-acc-action-btn ' + BTN_MARKER;
    btn.setAttribute('data-link-href', href);
    btn.textContent = BTN_LABEL;
    btn.addEventListener('click', clickHandler);
    actions.appendChild(btn);
  }

  function clickHandler(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var href = this.getAttribute('data-link-href');
    if (href) window.location.hash = href;
  }

  // Re-attempt on every render of either view we depend on. The SOW
  // model is populated once per scene, but view_3814's accordion
  // header is what we mount onto, so we need both to exist.
  $(document)
    .off('knack-view-render.' + SOW_VIEW + EVENT_NS)
    .on('knack-view-render.' + SOW_VIEW + EVENT_NS,
      function () { setTimeout(injectOrUpdate, 200); });

  $(document)
    .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
    .on('knack-view-render.' + TARGET_VIEW + EVENT_NS,
      function () { setTimeout(injectOrUpdate, 300); });

  // First-paint attempt for the case where both views are already in
  // the DOM by the time this IIFE runs.
  setTimeout(injectOrUpdate, 500);
})();
