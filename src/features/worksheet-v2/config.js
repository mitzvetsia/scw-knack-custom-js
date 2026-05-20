/*** WORKSHEET V2 — CONFIG ****************************************************
 *
 * Per-view configuration for the v2 worksheet pipeline. Mirrors the
 * shape of WORKSHEET_CONFIG in device-worksheet.js (v1) so we can
 * incrementally port viewCfg entries over as each view's render is
 * implemented in v2.
 *
 * Architecture (target state, not all live yet — see init.js):
 *   - sourceViewKey: the EXISTING Knack table view that loads the
 *     records. v2 doesn't render into this DOM — it reads records
 *     from sourceView.model.data.models and renders into its own
 *     mount point.
 *   - mountAfter: a selector for the element after which v2 mounts.
 *     We append #scw-ws-v2-<viewKey> right after this so v1 keeps
 *     working untouched. Once v2 reaches parity we'll flip view_3610
 *     to display:none and move v2 into its slot.
 *
 * Per-view fields will grow over time as more of v1's viewCfg moves
 * across — fields, bucketRules, rowSort, syntheticBucketGroups,
 * summary layout, etc. Start narrow: just enough to prove the data
 * pipeline.
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};
  window.SCW.worksheetV2 = window.SCW.worksheetV2 || {};

  SCW.worksheetV2.CONFIG = {
    // Master kill-switch. Flip to false to disable v2 entirely without
    // touching build.sh — useful if v2 misbehaves in production while
    // we're still developing it.
    enabled: true,

    // Per-view registrations. Add a view here when its v2 render is
    // ready to ship a preview. Order is irrelevant; each view stands
    // alone.
    views: [
      {
        // Dedicated source view. Mirrors view_3610's SOW Line Items
        // data but isn't touched by v1's transformView, so v2 can
        // load independently of v1's render lifecycle. The user is
        // responsible for hiding it via hide-data-source-views.js
        // (or a display:none CSS rule) so it doesn't show as a raw
        // Knack table to end users.
        sourceViewKey: 'view_3962',
        // Anchor for the v2 preview mount point. Mount after the
        // ORIGINAL v1 view (view_3610) so the user can compare
        // side-by-side during the parallel build. Once Phase 5
        // retires v1, swap this to mount where view_3610 used to be.
        mountAfterSelector: '#view_3610',
        // Display label for the WIP banner.
        label: 'SOW Line Items (v2 preview)'
      }
    ]
  };
})();
/*** END WORKSHEET V2 — CONFIG ************************************************/
