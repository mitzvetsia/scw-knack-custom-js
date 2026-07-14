/* ============================================================
 * KTL LOADER GATE (Knack-side snippet — NOT in the CDN bundle)
 * ============================================================
 *
 * LIVES IN: Knack Builder → Settings → API & Code → JavaScript,
 * as the app's `KnackInitAsync` entry point (replaces KTL's stock one).
 *
 * WHAT IT DOES
 * ============
 * Skips loading KTL entirely when the ENTRY URL resolves to one of the
 * NO_KTL_SCENES. On those scenes the bundle's own accordion engine
 * (src/features/ktl-accordion/ktl-accordion.js) owns every `_hsv` view —
 * keep the `_hsv` keywords on the views; the bundle reads them, KTL just
 * isn't there to paint them.
 *
 * ⚠ SYNC CONTRACT: NO_KTL_SCENES here MUST match KTL_FREE_SCENES in
 * src/features/ktl-accordion/ktl-accordion.js. Add scenes to BOTH lists.
 * (Safe in either order — the bundle's keyword path stays dormant while
 * KTL's buttons are present, so a bundle-side entry does nothing until
 * the loader gate actually stops KTL.)
 *
 * ⚠ BOOT-TIME DECISION: KnackInitAsync runs ONCE, at app boot. The entry
 * page decides KTL for the whole SPA session — land on a gated scene and
 * navigate elsewhere, KTL stays absent until a full reload (and vice
 * versa: land elsewhere and navigate INTO a gated scene, KTL is present
 * there — the bundle detects its buttons and stays dormant, so both
 * directions degrade consistently).
 *
 * Matching is by stable scene KEY via Knack's scene metadata (slug →
 * key), so page renames don't break the gate. Segments are compared with
 * any query part stripped (`slug?param` still matches `slug`).
 * ============================================================ */

KnackInitAsync = function ($, callback) {
  var NO_KTL_SCENES = ['scene_1085','scene_1116','scene_1155','scene_1140','scene_1096','scene_1311','scene_1362'];   // stable scene KEYS, rename-proof

  // Map the entry URL's slug segments → scene keys via Knack's metadata,
  // then match on the key. Exact-segment match (not substring), and a rename
  // changes the slug in BOTH the URL and the metadata, so this still resolves.
  var skip = false;
  try {
    var segs = location.hash.replace(/^#/, '').split('/').filter(Boolean)
      .map(function (s) { return s.split('?')[0]; });   // strip query part: 'slug?x=y' → 'slug'
    var scenes = (Knack.scenes && Knack.scenes.models) || [];
    for (var i = 0; i < scenes.length; i++) {
      var a = scenes[i].attributes || {};
      if (segs.indexOf(a.slug) !== -1 && NO_KTL_SCENES.indexOf(a.key) !== -1) { skip = true; break; }
    }
  } catch (e) { /* metadata not ready → fall through and load KTL (safe default) */ }

  if (skip) { callback(); return; }            // boot WITHOUT KTL
  (window.LazyLoad = LazyLoad) && LazyLoad.js(
    ['https://ctrnd.s3.amazonaws.com/Lib/KTL/KTL_Start.js'],
    function () { loadKtl($, callback, (typeof KnackApp === 'function' ? KnackApp : null), '', 'full'); }
  );
};
