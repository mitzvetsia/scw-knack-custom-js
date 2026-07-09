/*** PROPOSAL PREVIEW — show the expiration date (scene_1096) ****************
 *
 * The customer-facing proposal shows an "Expiration Date" row in its detail
 * block (built by proposal-pdf-export's tokenized `_Expiration_Date_` row +
 * live-patched by published-proposal-render.js). The internal Preview Proposal
 * page (scene_1096, #proposals/proposal/<sowId>/) renders the proposal from
 * LIVE Knack detail views and had no expiration row — so staff previewing a
 * quote couldn't see it.
 *
 * This surfaces it in the SAME place: right above the "SOW ID" detail item,
 * mirroring the customer layout (Proposal ID · Expiration Date · SOW ID). We
 * CLONE the existing SOW-ID `.kn-detail` item and relabel it, so the DOM
 * structure + classes (and style-detail-labels' aliceblue label) match the
 * rest of the block exactly.
 *
 * Value source: the SOW's expiration field (field_2135 — the SOW-side field
 * that feeds publish and mirrors the proposal's field_2659), read from
 * whichever rendered view on the scene carries it; falls back to field_2659.
 * Nothing is injected until a value is available (blank = no row, same as the
 * customer page when the date is unset).
 ****************************************************************************/
(function () {
  'use strict';

  var SCENE_ID   = 'scene_1096';
  var EXP_FIELDS = ['field_2135', 'field_2659'];   // SOW expiration, then proposal
  var MARKER     = 'scw-preview-exp';
  var NS         = '.scwPreviewExp';

  // ── Read the live expiration off any rendered view on the scene ─────
  function pickDate(attrs) {
    if (!attrs) return '';
    for (var i = 0; i < EXP_FIELDS.length; i++) {
      var raw = attrs[EXP_FIELDS[i] + '_raw'];
      if (raw && typeof raw === 'object') {
        if (raw.date_formatted) return String(raw.date_formatted).trim();
        if (raw.date)           return String(raw.date).trim();
      }
      var v = attrs[EXP_FIELDS[i]];
      if (v != null && String(v).replace(/<[^>]*>/g, '').trim()) {
        return String(v).replace(/<[^>]*>/g, '').trim();
      }
    }
    return '';
  }

  function readExpiration() {
    try {
      var views = window.Knack && Knack.views;
      if (!views) return '';
      for (var vk in views) {
        if (!Object.prototype.hasOwnProperty.call(views, vk)) continue;
        var m = views[vk] && views[vk].model;
        if (!m) continue;
        // Details view — single record on model.attributes.
        var got = pickDate(m.attributes);
        if (got) return got;
        // Grid/table view — scan its records.
        var models = m.data && m.data.models;
        if (models) {
          for (var i = 0; i < models.length; i++) {
            got = pickDate(models[i] && models[i].attributes);
            if (got) return got;
          }
        }
      }
    } catch (e) { /* fail soft */ }
    return '';
  }

  // ── Inject the row above the visible "SOW ID" detail item ───────────
  function detailLabelText(item) {
    var lbl = item.querySelector('.kn-detail-label');
    return lbl ? (lbl.textContent || '').replace(/[ \s]+/g, ' ').trim().toLowerCase() : '';
  }
  function isVisible(el) {
    return !!(el && (el.offsetParent !== null || el.getClientRects().length));
  }

  function inject() {
    var scene = document.getElementById('kn-' + SCENE_ID);
    if (!scene) return;

    var value = readExpiration();
    if (!value) return;   // nothing to show yet — retries below catch late loads

    var items = scene.querySelectorAll('.kn-detail');
    var sowIdItem = null;
    for (var i = 0; i < items.length; i++) {
      if (!isVisible(items[i])) continue;
      var t = detailLabelText(items[i]);
      if (/^sow\s*id/.test(t) || t === 'sow id') { sowIdItem = items[i]; break; }
    }
    if (!sowIdItem || !sowIdItem.parentNode) return;

    // Idempotent — one expiration row per detail block.
    var container = sowIdItem.parentNode;
    if (container.querySelector('.' + MARKER)) return;
    // Also bail if the block already has an expiration item (belt).
    for (var j = 0; j < items.length; j++) {
      if (/^expir/.test(detailLabelText(items[j]))) return;
    }

    // Clone the SOW-ID item so structure/classes/styling match exactly.
    var row = sowIdItem.cloneNode(true);
    row.classList.add(MARKER);
    // Strip the source field's key class so no downstream feature mistakes
    // this clone for the real SOW-ID field.
    row.className = row.className.replace(/\bfield_\d+\b/g, '').replace(/\s+/g, ' ').trim();
    row.setAttribute('data-scw-preview-exp', '1');

    var lbl = row.querySelector('.kn-detail-label');
    if (lbl) {
      // Preserve any inner <span> wrapper Knack uses; just swap the text.
      var lblInner = lbl.querySelector('span') || lbl;
      lblInner.textContent = 'Expiration Date';
    }
    var body = row.querySelector('.kn-detail-body');
    if (body) {
      var bodyInner = body.querySelector('span') || body;
      bodyInner.textContent = value;
    }

    sowIdItem.parentNode.insertBefore(row, sowIdItem);
  }

  var _t = null;
  function injectSoon() {
    clearTimeout(_t);
    _t = setTimeout(inject, 120);
  }

  function boot() {
    inject();
    // Detail views + their models can land a beat after scene render.
    [200, 600, 1500].forEach(function (ms) { setTimeout(inject, ms); });
  }

  if (window.SCW && SCW.onSceneRender) SCW.onSceneRender(SCENE_ID, boot, NS);
  $(document).off('knack-scene-render.any' + NS).on('knack-scene-render.any' + NS, function () {
    if ((document.body.id || '').indexOf(SCENE_ID) !== -1) boot();
  });
  // Re-inject after any view on the scene re-renders (data refresh, etc.).
  $(document).off('knack-view-render.any' + NS).on('knack-view-render.any' + NS, function () {
    if ((document.body.id || '').indexOf(SCENE_ID) !== -1) injectSoon();
  });
})();
/*** END PROPOSAL PREVIEW — expiration date *********************************/
