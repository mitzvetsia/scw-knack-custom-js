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
        sourceViewKey: 'view_3610',
        // Anchor for the v2 preview mount point. Use the source
        // view's element as the anchor — v2 mounts directly after.
        // Falls back to `.kn-scene` append if the anchor isn't found
        // at attach time.
        mountAfterSelector: '#view_3610',
        // Display label for the WIP banner.
        label: 'SOW Line Items (v2 preview)'
      }
    ]
  };
})();
/*** END WORKSHEET V2 — CONFIG ************************************************/
