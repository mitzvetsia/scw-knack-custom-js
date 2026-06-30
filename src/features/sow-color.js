/*** FEATURE: SOW / Bid color coding — shared palette + helpers ***************
 *
 * One source of truth for the "assign each SOW / Bid a color and tint its
 * line-item rows" feature. Consumed by BOTH filter-pill modules:
 *   • worksheet-v2/sow-filter.js   (v2 card grids — SOW + Bid filters)
 *   • sow-filter-pills.js          (v1 Knack-table SOW grid, view_3610)
 *
 * Each module collects its unique SOWs/Bids (already sorted by label),
 * builds an id→index map via buildMap(), and then:
 *   • dot(i)        → a solid swatch color for the pill chip
 *   • barFor(idxs)  → the left-edge bar background for a row. ONE index →
 *                     a solid color; MANY → a hard-stop vertical gradient
 *                     (one segment per SOW/Bid) so a row on >1 SOW/Bid
 *                     visibly shows every color it belongs to.
 *   • tintFor(idxs) → a faint row-background wash (first color).
 *
 * Exposed as window.SCW.sowColor.
 ******************************************************************************/
(function () {
  'use strict';
  window.SCW = window.SCW || {};
  if (window.SCW.sowColor) return;

  // Categorical palette — medium-saturation, mutually distinguishable on a
  // white row. 16 entries; assignment cycles past that (rare — few SOWs/Bids
  // per page). Stored as [r,g,b] so we can emit both solid and alpha forms.
  var PALETTE = [
    [37, 99, 235],   // blue
    [220, 38, 38],   // red
    [22, 163, 74],   // green
    [217, 119, 6],   // amber
    [147, 51, 234],  // purple
    [13, 148, 136],  // teal
    [219, 39, 119],  // pink
    [101, 163, 13],  // lime
    [2, 132, 199],   // sky
    [234, 88, 12],   // orange
    [79, 70, 229],   // indigo
    [190, 18, 60],   // rose
    [5, 150, 105],   // emerald
    [124, 58, 237],  // violet
    [161, 98, 7],    // dark amber
    [71, 85, 105]    // slate
  ];

  function rgb(c)     { return 'rgb('  + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function colorAt(i) {
    var n = PALETTE.length;
    return PALETTE[((i % n) + n) % n];
  }

  // Ordered list of ids → { id: index } map. Index drives the color.
  function buildMap(ids) {
    var m = Object.create(null);
    for (var i = 0; i < ids.length; i++) m[ids[i]] = i;
    return m;
  }

  function dot(i) { return rgb(colorAt(i)); }

  // Left-bar background for a row. Single index → solid; multiple → a
  // hard-stop vertical gradient with one equal segment per color, so a
  // multi-SOW/Bid row shows every color it's on.
  function barFor(indices) {
    if (!indices || !indices.length) return '';
    if (indices.length === 1) return rgb(colorAt(indices[0]));
    var n = indices.length, step = 100 / n, stops = [];
    for (var i = 0; i < n; i++) {
      stops.push(rgb(colorAt(indices[i])) + ' ' +
        (step * i).toFixed(3) + '% ' + (step * (i + 1)).toFixed(3) + '%');
    }
    return 'linear-gradient(to bottom, ' + stops.join(', ') + ')';
  }

  // Faint full-row wash. Uses the first color (the bar conveys multi).
  function tintFor(indices, alpha) {
    if (!indices || !indices.length) return '';
    return rgba(colorAt(indices[0]), alpha == null ? 0.13 : alpha);
  }

  // De-dupe + ascending sort so a row's bar segments are in a stable order.
  function normIndices(indices) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < indices.length; i++) {
      var v = indices[i];
      if (v == null || seen[v]) continue;
      seen[v] = true;
      out.push(v);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  window.SCW.sowColor = {
    PALETTE:     PALETTE,
    colorAt:     colorAt,
    rgb:         rgb,
    rgba:        rgba,
    buildMap:    buildMap,
    dot:         dot,
    barFor:      barFor,
    tintFor:     tintFor,
    normIndices: normIndices
  };
})();
/*** END FEATURE: SOW / Bid color coding **************************************/
