/*** PROPOSAL PREVIEW — show the expiration date (scene_1096) ****************
 *
 * The customer-facing proposal shows an "Expiration Date" row in its top
 * detail block (built by proposal-pdf-export's tokenized `_Expiration_Date_`
 * row + live-patched by published-proposal-render.js). The internal Preview
 * Proposal page (scene_1096, #proposals/proposal/<sowId>/) renders the
 * proposal from LIVE Knack views and had no expiration row — so staff
 * previewing a quote couldn't see it.
 *
 * WHERE THE VALUE COMES FROM: we read the SOW-side expiration `field_2135`
 * (the field that feeds publish and mirrors the proposal's `field_2659`)
 * off whichever rendered view on the scene carries it — on scene_1096 that's
 * `view_3861` (the hidden "SOW_sow header Details" host). We fall back to
 * `field_2659` if `field_2135` isn't present. Nothing is injected until a
 * value is available (blank = no row, same as the customer page when unset).
 *
 * WHERE IT'S PLACED: the SOW identity on this scene lives in `view_3339` as
 * label-less items — `field_2126` (SOW name `<h1>`) and `field_2122` (SW#
 * `<strong>`). That block is the preview-page equivalent of the customer
 * proposal's top detail table. We insert an "Expiration Date" `.kn-detail`
 * row right after the SW# (`field_2122`), inside the same `.kn-label-left`
 * container, so it reads Name · SW# · Expiration Date — mirroring the
 * customer layout. style-detail-labels.js styles the injected `.kn-detail-label`
 * (aliceblue) exactly like every other detail label on the scene.
 *
 * There is intentionally NO reliance on a `.kn-detail` labeled "SOW ID" —
 * scene_1096 doesn't render one (the SW# is label-less in view_3339). A
 * legacy "SOW ID"/proposal-ID `.kn-detail` search is kept only as a fallback
 * anchor for any scene that does surface one.
 ****************************************************************************/
(function () {
  'use strict';

  var SCENE_ID   = 'scene_1096';
  var ID_VIEW    = 'view_3339';                    // SOW identity host
  var ANCHOR_FLD = 'field_2122';                   // SW# item to insert after
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

  // ── Build a native-looking labeled detail row ───────────────────────
  function buildExpRow(value) {
    var row = document.createElement('div');
    row.className = 'kn-detail ' + MARKER;
    row.setAttribute('data-scw-preview-exp', '1');

    var label = document.createElement('div');
    label.className = 'kn-detail-label';
    label.style.minWidth = '174px';
    label.style.maxWidth = '174px';
    label.innerHTML = '<span><span class="">Expiration Date</span></span>';

    var body = document.createElement('div');
    body.className = 'kn-detail-body';
    var bSpan = document.createElement('span');
    var bInner = document.createElement('span');
    bInner.textContent = value;
    bSpan.appendChild(bInner);
    body.appendChild(bSpan);

    row.appendChild(label);
    row.appendChild(body);
    return row;
  }

  function detailLabelText(item) {
    var lbl = item.querySelector('.kn-detail-label');
    return lbl ? (lbl.textContent || '').replace(/[ \s]+/g, ' ').trim().toLowerCase() : '';
  }
  function isVisible(el) {
    return !!(el && (el.offsetParent !== null || el.getClientRects().length));
  }

  // ── Inject the expiration row into the SOW-identity block ───────────
  function inject() {
    var scene = document.getElementById('kn-' + SCENE_ID);
    if (!scene) return;

    var value = readExpiration();
    if (!value) return;   // nothing to show yet — retries below catch late loads

    // Idempotent — one expiration row on the scene.
    if (scene.querySelector('.' + MARKER)) return;

    // Primary anchor: the SW# item (field_2122) inside view_3339. Insert the
    // expiration row right after it, in the same label-column container, so
    // the block reads Name · SW# · Expiration Date.
    var idView = scene.querySelector('#' + ID_VIEW);
    var anchor = idView && isVisible(idView)
      ? idView.querySelector('.' + ANCHOR_FLD)
      : null;

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(buildExpRow(value), anchor.nextSibling);
      return;
    }

    // Fallback anchor: a visible `.kn-detail` labeled "SOW ID" / "Proposal ID"
    // on any scene that surfaces one. Insert the expiration row just before it.
    var items = scene.querySelectorAll('.kn-detail');
    for (var i = 0; i < items.length; i++) {
      if (!isVisible(items[i])) continue;
      var t = detailLabelText(items[i]);
      if (/^expir/.test(t)) return;                 // already present
      if (/^sow\s*id/.test(t) || /^proposal\s*id/.test(t)) {
        if (items[i].parentNode) {
          items[i].parentNode.insertBefore(buildExpRow(value), items[i]);
          return;
        }
      }
    }
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
