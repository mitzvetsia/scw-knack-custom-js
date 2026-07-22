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
  // Slug fallback — used when Knack.scenes metadata is EMPTY at boot
  // (observed live 2026-07-22: the slug→key match silently failed open on
  // scene_1155 and KTL loaded, costing ~9s of :visible scanning on the
  // reconcile page). Keep in sync with the scenes above. Slugs are less
  // rename-proof than keys, so the key match stays primary.
  var NO_KTL_SLUGS = ['review-bids'];

  // Map the entry URL's slug segments → scene keys via Knack's metadata,
  // then match on the key. Exact-segment match (not substring), and a rename
  // changes the slug in BOTH the URL and the metadata, so this still resolves.
  var skip = false, why = 'no match';
  var segs = [];
  try {
    segs = location.hash.replace(/^#/, '').split('/').filter(Boolean)
      .map(function (s) { return s.split('?')[0]; });   // strip query part: 'slug?x=y' → 'slug'
    var scenes = (Knack.scenes && Knack.scenes.models) || [];
    if (!scenes.length) why = 'scene metadata EMPTY at boot';
    for (var i = 0; i < scenes.length; i++) {
      var a = scenes[i].attributes || {};
      if (segs.indexOf(a.slug) !== -1 && NO_KTL_SCENES.indexOf(a.key) !== -1) {
        skip = true; why = 'matched ' + a.key + ' (slug ' + a.slug + ')'; break;
      }
    }
    if (!skip) {
      for (var j = 0; j < NO_KTL_SLUGS.length; j++) {
        if (segs.indexOf(NO_KTL_SLUGS[j]) !== -1) {
          skip = true; why = 'slug fallback: ' + NO_KTL_SLUGS[j]; break;
        }
      }
    }
  } catch (e) { why = 'threw: ' + e; }

  // Diagnostic — keep this log. When a gated scene still loads KTL, this
  // line says whether the metadata was missing, the slug didn't match, or
  // the Builder copy of this snippet is stale (no [KTL gate v2] tag = stale).
  try { console.log('[KTL gate v2] skip =', skip, '(' + why + ')', '#' + segs.join('/')); } catch (e2) {}

  if (skip) { callback(); return; }            // boot WITHOUT KTL
  (window.LazyLoad = LazyLoad) && LazyLoad.js(
    ['https://ctrnd.s3.amazonaws.com/Lib/KTL/KTL_Start.js'],
    function () { loadKtl($, callback, (typeof KnackApp === 'function' ? KnackApp : null), '', 'full'); }
  );
};
