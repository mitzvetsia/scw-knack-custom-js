/*** FEATURE: Knack renderTotals defensive wrap ******************************
 *
 * Knack's table-view postRender chain calls .renderTotals(), which
 * iterates over view.totals[].column and pushes per-column tallies
 * into an array.  Intermittently we see:
 *
 *   Uncaught TypeError: Cannot read properties of undefined (reading 'push')
 *     at renderTotals → postRender → postRenderViews → renderCompletedScene
 *
 * This kills the WHOLE postRenderViews loop, so every later view in the
 * scene fails to render too (manifests as missing tabs, dead pages,
 * stuck spinners).  The root cause is almost certainly a Builder-side
 * Totals config on one of the scene's views referencing a stale/missing
 * column — but the bug doesn't tell us which one.
 *
 * This guard:
 *   1. Monkey-patches Knack.View.prototype.renderTotals (when available)
 *      so the throw becomes a console.warn that names the failing view.
 *      Knack keeps rendering the next view instead of bailing.
 *   2. Falls back to wrapping each Knack.views[viewId].renderTotals on
 *      knack-view-render for views that escaped the prototype patch.
 *
 * Doesn't fix the Builder config — that has to be tracked down with the
 * named view id in the console warning. But it stops one bad view from
 * blanking the whole scene.
 ******************************************************************************/
(function () {
  'use strict';

  var NS = '.scwTotalsGuard';
  var FLAG = '__scwRenderTotalsGuarded';

  function wrap(fn, viewLabel) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        var label = viewLabel ||
                    (this && this.model && this.model.view && this.model.view.key) ||
                    (this && this.cid) || '<unknown view>';
        console.warn(
          '[SCW] renderTotals threw on ' + label +
          ' — check that view\'s Totals row config in Knack Builder; ' +
          'every Totals column must reference a live field. Suppressing ' +
          'so the rest of the scene still renders.', e
        );
      }
    };
  }

  // ── 1) Prototype patch ───────────────────────────────────────────
  // Knack's GridView is on Knack.Views (plural) or via a Backbone view
  // we can\'t name from outside.  Try the most likely globals.  When we
  // find it, wrap renderTotals once and mark with FLAG so we don't
  // double-wrap.
  function tryPatchPrototype() {
    var roots = [
      window.Knack && Knack.Views && Knack.Views.TableView,
      window.Knack && Knack.Views && Knack.Views.GridView,
      window.Knack && Knack.View
    ];
    for (var i = 0; i < roots.length; i++) {
      var ctor = roots[i];
      var proto = ctor && ctor.prototype;
      if (!proto || proto[FLAG]) continue;
      if (typeof proto.renderTotals !== 'function') continue;
      proto.renderTotals = wrap(proto.renderTotals);
      proto[FLAG] = true;
      return true;
    }
    return false;
  }

  // Try at script load, DOM ready, and after Knack init — Knack's view
  // constructors aren\'t always on `window` until after loadApp.
  tryPatchPrototype();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryPatchPrototype);
  }
  setTimeout(tryPatchPrototype, 1500);
  setTimeout(tryPatchPrototype, 4000);

  // ── 2) Per-instance fallback ──────────────────────────────────────
  // Whether or not the prototype patch landed, also wrap each view
  // instance's renderTotals on every render. Idempotent via FLAG.
  $(document).off('knack-view-render.any' + NS)
    .on('knack-view-render.any' + NS, function (e, view) {
      if (!view || !view.key) return;
      var v = window.Knack && Knack.views && Knack.views[view.key];
      if (!v || typeof v.renderTotals !== 'function') return;
      if (v[FLAG]) return;
      v.renderTotals = wrap(v.renderTotals, view.key);
      v[FLAG] = true;
    });

  // ── 3) Global onerror safety net ─────────────────────────────────
  // If the throw happens before our prototype/instance patches landed
  // (initial scene render is the most common case), at least catch the
  // uncaught error from window.onerror so it doesn't show as a red
  // console crash and doesn't trigger any "scene failed" handlers.
  // Only suppress THIS specific message — every other error bubbles
  // normally so we still see real bugs.
  window.addEventListener('error', function (ev) {
    var msg = ev && ev.message;
    if (!msg) return;
    if (msg.indexOf("Cannot read properties of undefined (reading 'push')") === -1) return;
    var stack = ev.error && ev.error.stack || '';
    if (stack.indexOf('renderTotals') === -1) return;
    console.warn(
      '[SCW] Suppressed Knack renderTotals uncaught error. ' +
      'Audit Totals rows on the views in the current scene — one of ' +
      'them is referencing a missing field.', ev.error
    );
    ev.preventDefault();
    return true;
  });
})();
/*** END FEATURE: Knack renderTotals defensive wrap **************************/
