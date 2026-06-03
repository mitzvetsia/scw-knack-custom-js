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

  function findFilterWidgets(viewKey) {
    // Knack splits the filter UI into two siblings inside .kn-records-nav:
    //   .kn-filters      → the rendered active filter PILLS (each
    //                      clickable to edit + an X to remove)
    //   .kn-filters-nav  → the "+ Add filter" link + Search dropdown
    // Older / different layouts sometimes nest them together; pull
    // whichever we find. Both go into the same toolbar slot so they
    // sit next to each other.
    var view = document.getElementById(viewKey);
    if (!view) return [];
    var widgets = [];
    var pills = view.querySelector('.kn-filters');
    if (pills) widgets.push(pills);
    var nav   = view.querySelector('.kn-filters-nav') ||
                view.querySelector('.kn-add-filter');
    if (nav) widgets.push(nav);
    return widgets;
  }

  function mount(viewKey) {
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    var toolbar = container.querySelector('.scw-ws-v2-toolbar');
    if (!toolbar) return;

    // If we\'ve already hoisted AND the moved widget is still attached,
    // bail out. If Knack re-rendered the source view (e.g. after a
    // filter change) some of the widgets we moved may have been
    // replaced — strip the empty slot so we re-hoist on this pass.
    var existingSlot = toolbar.querySelector('.scw-ws-v2-native-filter-slot');
    if (existingSlot) {
      var still = existingSlot.querySelector('.kn-filters-nav, .kn-add-filter, .kn-filters');
      if (still) return;
      existingSlot.parentNode.removeChild(existingSlot);
    }

    var widgets = findFilterWidgets(viewKey);
    if (!widgets.length) return; // Knack hasn\'t rendered yet; next pass.

    var slot = document.createElement('div');
    slot.className = 'scw-ws-v2-native-filter-slot';
    // Move (not clone) — Knack reuses the elements on filter changes;
    // clones would go stale and lose their handlers.
    for (var i = 0; i < widgets.length; i++) slot.appendChild(widgets[i]);

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
