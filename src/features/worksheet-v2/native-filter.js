/*** WORKSHEET V2 — NATIVE FILTER HOIST ***************************************
 *
 * Lifts Knack\'s native filter widget (`.kn-filters-nav`, `.kn-add-filter`,
 * any rendered filter pills) out of the hidden source view (view_3962)
 * and grafts it into the v2 toolbar so users get the standard "+ Add
 * filter" affordance plus live pills. Mirrors v1\'s
 * device-worksheet-toolbar.js hoist of `.kn-filters-nav` into the
 * `.kn-records-nav` toolbar slot.
 *
 * Filter changes naturally re-fetch view_3962\'s model and fire
 * `knack-view-render.view_3962`, which v2\'s data subscriber already
 * picks up — no additional wiring needed for filter → re-render.
 *
 * Idempotent: on every render, if the widget is already mounted in
 * the toolbar we just leave it alone.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  function findFilterWidget(viewKey) {
    // Prefer the whole .kn-filters-nav block (filter pills + Add filter
    // button + Filter / Search dropdown). Fall back to the bare
    // .kn-add-filter link if Knack hasn\'t rendered the wrapper yet.
    var view = document.getElementById(viewKey);
    if (!view) return null;
    return view.querySelector('.kn-filters-nav') ||
           view.querySelector('.kn-add-filter') ||
           null;
  }

  function mount(viewKey) {
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    var toolbar = container.querySelector('.scw-ws-v2-toolbar');
    if (!toolbar) return;

    // If we\'ve already hoisted and the moved widget is still attached,
    // bail out — nothing to do. If the widget went missing (Knack
    // re-rendered the source view and replaced its DOM), strip the
    // empty slot and re-hoist below.
    var existingSlot = toolbar.querySelector('.scw-ws-v2-native-filter-slot');
    if (existingSlot) {
      if (existingSlot.querySelector('.kn-filters-nav, .kn-add-filter')) return;
      existingSlot.parentNode.removeChild(existingSlot);
    }

    var widget = findFilterWidget(viewKey);
    if (!widget) return; // Knack hasn\'t rendered it yet; next pass will catch it.

    var slot = document.createElement('div');
    slot.className = 'scw-ws-v2-native-filter-slot';
    // Move (not clone) — Knack reuses the element on filter changes;
    // a clone would go stale and detach from its event handlers.
    slot.appendChild(widget);

    // Insert right after the sort dropdown (or after the mode group
    // if sort isn\'t mounted yet).
    var anchor = toolbar.querySelector('.scw-ws-v2-sort') ||
                 toolbar.querySelector('.scw-ws-v2-toolbar-group');
    if (anchor && anchor.nextSibling) {
      toolbar.insertBefore(slot, anchor.nextSibling);
    } else {
      toolbar.appendChild(slot);
    }
  }

  ns.nativeFilter = { mount: mount };
})();
/*** END WORKSHEET V2 — NATIVE FILTER HOIST ***********************************/
