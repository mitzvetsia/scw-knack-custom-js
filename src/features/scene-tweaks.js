/*** Per-scene visual tweaks — organized by scene ID ***/
(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  //  CSS
  // ══════════════════════════════════════════════════════════════
  var STYLE_ID = 'scw-scene-tweaks-css';
  if (!document.getElementById(STYLE_ID)) {
    var css = `
/* ══════════════════════════════════════════════════════════════
   SCENE 1116 — Sales Edit Proposal
   ══════════════════════════════════════════════════════════════ */

/* ── Hide scene until transforms settle, then fade in ── */
/* Reserve viewport height up-front so progressive view renders don't */
/* push surrounding chrome (nav, menu, sibling sections) around as    */
/* each view populates. Main contributor to CLS 0.60 on scene_1116.   */
/* The veil hides the CHILDREN (not the container) so the loading     */
/* spinner — drawn as ::before/::after on the container — stays       */
/* visible while everything renders + transforms underneath it.       */
#kn-scene_1116 {
  min-height: 100vh;
  position: relative;
}
#kn-scene_1116 > * {
  opacity: 0;
  transition: opacity 350ms ease;
}
#kn-scene_1116.scw-scene-ready > * {
  opacity: 1;
}
/* Invisible content must not catch clicks */
#kn-scene_1116:not(.scw-scene-ready) {
  pointer-events: none;
}
#kn-scene_1116:not(.scw-scene-ready)::before {
  content: '';
  position: absolute;
  top: 140px;
  left: 50%;
  width: 30px;
  height: 30px;
  margin-left: -15px;
  border: 3px solid #e5e7eb;
  border-top-color: #163C6E;
  border-radius: 50%;
  animation: scwSceneVeilSpin 0.8s linear infinite;
}
#kn-scene_1116:not(.scw-scene-ready)::after {
  content: 'Loading page…';
  position: absolute;
  top: 184px;
  left: 50%;
  transform: translateX(-50%);
  font: 600 13px/1.3 system-ui, -apple-system, sans-serif;
  color: #64748b;
  letter-spacing: 0.02em;
}
@keyframes scwSceneVeilSpin {
  to { transform: rotate(360deg); }
}

/* ── Totals details view (view_3418) — card ── */
#view_3418 {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  padding: 20px 24px 16px;
  margin-bottom: 0;
}
/* Hide original Knack detail content — replaced by custom layout */
#view_3418 .view-header {
  display: none !important;
}
#view_3418 .kn-details-column {
  display: none !important;
}

/* ── Custom totals layout ── */
.scw-totals-custom {
  font-variant-numeric: tabular-nums;
}
.scw-totals-section-hdr {
  font-size: 12px;
  font-weight: 700;
  color: #163C6E;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 14px 0 4px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 2px;
}
.scw-totals-section-hdr:first-child {
  padding-top: 0;
}
.scw-totals-section-hdr + .scw-totals-subtotal {
  border-top: none;
}
.scw-totals-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 5px 12px;
  font-size: 14px;
}
.scw-totals-row-label {
  color: #64748b;
  font-weight: 500;
}
.scw-totals-row-value {
  font-weight: 500;
  color: #1e293b;
}
.scw-totals-row.is-discount .scw-totals-row-value {
  color: #16a34a;
  font-style: italic;
}
.scw-totals-subtotal {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 12px;
  border-top: 1px solid #e5e7eb;
  margin-top: 2px;
}
.scw-totals-subtotal-label {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.scw-totals-subtotal-value {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}
.scw-totals-grand {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 12px 12px 4px;
  border-top: 2px solid #163C6E;
  margin-top: 8px;
}
.scw-totals-grand-label {
  font-size: 13px;
  font-weight: 700;
  color: #163C6E;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.scw-totals-grand-value {
  font-size: 22px;
  font-weight: 800;
  color: #163C6E;
}

/* view_3492 / view_3490 form styling handled by inline-form-recompose.js */

/* ══════════════════════════════════════════════════════════════
   SCENE 1085 — Build SOWs page (Project Dashboard)
   ══════════════════════════════════════════════════════════════ */

/* Treat these four accordions as one supporting-files group so they
   visually subordinate to the Scope of Work Line Items grid below.
   Selectors target by data-view-key on the header so we don't touch
   other accordions that happen to live on the scene.

   Affected: view_3577 (Manage MDF/IDFs), view_3917 (Additional Photos),
   view_3949 (Site Maps & Other Files), view_3369 (Licenses).         */
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3577"]),
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3917"]),
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3949"]),
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3369"]) {
  /* Tighten the wrapper margin so adjacent siblings sit flush as a group */
  margin-top: 2px !important;
  margin-bottom: 2px !important;
}

/* Compact header — about 2/3 the default height (44px → ~30px).
   Smaller padding + reduced icon/title sizes keep proportions sane. */
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3577"]) > .scw-ktl-accordion__header,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3917"]) > .scw-ktl-accordion__header,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3949"]) > .scw-ktl-accordion__header,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3369"]) > .scw-ktl-accordion__header {
  min-height: 30px;
  padding: 6px 12px 6px 18px;
}
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3577"]) .scw-acc-title,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3917"]) .scw-acc-title,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3949"]) .scw-acc-title,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3369"]) .scw-acc-title {
  font-size: 13px;
}
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3577"]) .scw-acc-icon svg,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3917"]) .scw-acc-icon svg,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3949"]) .scw-acc-icon svg,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3369"]) .scw-acc-icon svg {
  width: 13px;
  height: 13px;
}
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3577"]) .scw-acc-count,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3917"]) .scw-acc-count,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3949"]) .scw-acc-count,
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3369"]) .scw-acc-count {
  padding: 1px 7px;
  font-size: 11px;
  min-width: 0 !important;
}

/* Make the group read as one block: shared muted accent + collapsed look.
   Accent is a lighter, desaturated slate so these compact items recede
   relative to the prominent SOW Line Items accordion below.            */
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3577"]),
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3917"]),
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3949"]),
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3369"]) {
  --scw-accent: #6b7a8c !important;
  --scw-accent-rgb: 107, 122, 140 !important;
}

/* Scope of Work Line Items (view_3610) — darken accent ~20% so it
   reads as the primary content on the page. Default blue
   rgb(41,95,145) → rgb(33,76,116) (each channel × 0.8). Bumps the
   expanded-state header background alpha a touch as well.            */
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3610"]) {
  --scw-accent: #214c74 !important;
  --scw-accent-rgb: 33, 76, 116 !important;
}
#kn-scene_1085 .scw-ktl-accordion:has(> .scw-ktl-accordion__header[data-view-key="view_3610"]).is-expanded > .scw-ktl-accordion__header {
  background: rgba(33, 76, 116, 0.18) !important;
}

/* Hide the dev scratch marker (view_3898 "MICAH's SHIT") and EVERYTHING
   below it on this page. Per the layout, view_3898 + view_3884 ("for MICAH")
   share view-group-8's column, and view-groups 9-12 follow it:
     • view_3888  Mounting Hardware grid   (kept as model/REST source only —
                                            mirror-connection-sync reads its
                                            model; display:none is safe)
     • view_3584  Photos grid              (REST-DELETE fallback endpoint for
                                            worksheet-v2 photos; URL-based, so
                                            display:none is safe)
     • view_3961  Orphaned Mounting Brackets
     • view_3962  hidden v2 source grid    (already display:none; the v2 panel
                                            scrapes its DOM, which survives
                                            display:none)
     • view_3964  Add Document menu
   The v2 SOW worksheet panel (#scw-ws-v2-view_3962) mounts after view_3369 in
   group 7 — ABOVE view_3898 — so it is unaffected by this rule.            */
#kn-scene_1085 #view_3898,
#kn-scene_1085 #view_3898 ~ .kn-view,
#kn-scene_1085 .view-group:has(#view_3898) ~ .view-group {
  display: none !important;
}
`;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════════════════
  //  JS — restructure view_3418 into grouped financial summary
  // ══════════════════════════════════════════════════════════════
  var NS = '.scwSceneTweaks';

  function createSectionHeader(text) {
    var div = document.createElement('div');
    div.className = 'scw-totals-section-hdr';
    div.textContent = text;
    return div;
  }

  function createRow(label, value, modifier) {
    var div = document.createElement('div');
    div.className = 'scw-totals-row' + (modifier ? ' is-' + modifier : '');
    var lbl = document.createElement('span');
    lbl.className = 'scw-totals-row-label';
    lbl.textContent = label;
    var val = document.createElement('span');
    val.className = 'scw-totals-row-value';
    val.textContent = value;
    div.appendChild(lbl);
    div.appendChild(val);
    return div;
  }

  function createSubtotal(label, value) {
    var div = document.createElement('div');
    div.className = 'scw-totals-subtotal';
    var lbl = document.createElement('span');
    lbl.className = 'scw-totals-subtotal-label';
    lbl.textContent = label;
    var val = document.createElement('span');
    val.className = 'scw-totals-subtotal-value';
    val.textContent = value;
    div.appendChild(lbl);
    div.appendChild(val);
    return div;
  }

  function createGrandTotal(label, value) {
    var div = document.createElement('div');
    div.className = 'scw-totals-grand';
    var lbl = document.createElement('span');
    lbl.className = 'scw-totals-grand-label';
    lbl.textContent = label;
    var val = document.createElement('span');
    val.className = 'scw-totals-grand-value';
    val.textContent = value;
    div.appendChild(lbl);
    div.appendChild(val);
    return div;
  }

  // ── Frontend calculation config ──
  var EQUIPMENT_VIEWS = ['view_3586'];                 // device line-item grids
  var HARDWARE_VIEWS  = ['view_3604'];                 // mounting hardware grid
  var ALL_VIEWS       = EQUIPMENT_VIEWS.concat(HARDWARE_VIEWS);
  var LUMP_DISCOUNT_FIELD = 'field_2290';              // additional lump sum discount (view_3490 form)

  /** Parse a currency / number string into a float. Returns 0 for non-numeric. */
  function parseNum(text) {
    if (!text) return 0;
    var raw = String(text).replace(/[^0-9.\-]/g, '');
    var n = parseFloat(raw);
    return isFinite(n) ? n : 0;
  }

  /** Sum a field across all td cells with data-field-key in the given views.
   *  Device-worksheet moves td elements from original rows into card panels,
   *  but each cell appears exactly once per record in the DOM tree. */
  /** Read a single field off the SOW record on this scene.
   *  Tries the totals view (view_3418) and the SOW detail view
   *  (view_3827) — each is a kn-details view of the SOW. We check
   *  the Backbone model first (which holds every attribute on the
   *  record, even fields the view doesn't display) and fall back to
   *  scraping a visible kn-detail cell if the field happens to be
   *  rendered. Strips HTML so callers always get plain text. */
  var SOW_DETAIL_VIEWS = ['view_3418', 'view_3827'];
  function readSowField(fieldKey) {
    if (typeof Knack !== 'undefined' && Knack.views) {
      for (var i = 0; i < SOW_DETAIL_VIEWS.length; i++) {
        var v = Knack.views[SOW_DETAIL_VIEWS[i]];
        if (!v || !v.model) continue;
        var attrs = (v.model.data && v.model.data.attributes) ||
                    v.model.attributes || null;
        if (attrs && attrs[fieldKey] != null) {
          return String(attrs[fieldKey]).replace(/<[^>]*>/g, '').trim();
        }
      }
    }
    // DOM fallback for fields rendered as kn-detail rows
    for (var j = 0; j < SOW_DETAIL_VIEWS.length; j++) {
      var el = document.getElementById(SOW_DETAIL_VIEWS[j]);
      if (!el) continue;
      var cell = el.querySelector('.kn-detail.' + fieldKey + ' .kn-detail-body');
      if (cell) return (cell.textContent || '').replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  function sumViewField(viewIds, fieldKey) {
    var total = 0;
    for (var v = 0; v < viewIds.length; v++) {
      var viewId = viewIds[v];
      // Prefer Knack's Backbone model — it has every record regardless
      // of how device-worksheet rearranged the DOM. Some records get
      // their data <tr> eaten during the transform (e.g. the first
      // service row's data <td>s end up absorbed into the card and the
      // td.field_XXXX disappears from the DOM), so summing DOM cells
      // undercounts. Same record IS still in the model.
      var view = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewId] : null;
      var models = view && view.model && view.model.data && view.model.data.models;
      if (models && models.length) {
        for (var i = 0; i < models.length; i++) {
          var attrs = models[i].attributes || {};
          var raw = attrs[fieldKey];
          // Equation/sum fields may live on the _raw companion as an
          // object {currency_field_extended: ...}. Try a few shapes.
          if (raw && typeof raw === 'object') {
            raw = raw.currency_field_extended || raw.amount || raw.value || JSON.stringify(raw);
          }
          var val = parseNum(raw);
          SCW.debug('[scw-totals model]', viewId, fieldKey, '[' + i + ']', raw, '→', val);
          total += val;
        }
        continue;
      }
      // DOM fallback when the model isn't available
      var container = document.getElementById(viewId);
      if (!container) { SCW.debug('[scw-totals] container not found:', viewId); continue; }
      var cells = container.querySelectorAll('td[data-field-key="' + fieldKey + '"]');
      SCW.debug('[scw-totals dom]', viewId, fieldKey, '→', cells.length, 'cells');
      for (var j = 0; j < cells.length; j++) {
        var domVal = parseNum(cells[j].textContent);
        total += domVal;
      }
    }
    SCW.debug('[scw-totals] SUM', fieldKey, '=', total);
    return total;
  }

  /** Read the lump sum discount from the view_3490 form input. */
  function getLumpDiscount() {
    var input = document.querySelector('#view_3490 #' + LUMP_DISCOUNT_FIELD);
    if (input) return parseNum(input.value);
    var wrapped = document.querySelector('#view_3490 input[name="' + LUMP_DISCOUNT_FIELD + '"]');
    if (wrapped) return parseNum(wrapped.value);
    return 0;
  }

  function formatMoney(n) {
    return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Calculate totals from Knack model data and build the custom layout. */
  function restructureTotals() {
    var view = document.getElementById('view_3418');
    if (!view) return;

    // Remove previous custom layout if rebuilding after re-render
    var existing = view.querySelector('.scw-totals-custom');
    if (existing) existing.remove();

    // ── Calculate from DOM cells ──
    // field_2269 is the per-line "Total" column (extended NET price,
    // qty × unit minus per-line discount). It's rendered in the view,
    // so we can sum it from the DOM. We need to add the line discount
    // back to recover the extended list (retail) for the display row.
    // Don't sum field_1960 (unit price) — it undercounts any line with
    // qty > 1 (NanoBeam ×2, Wattbox ×2, etc.).
    var lineDiscount = sumViewField(EQUIPMENT_VIEWS, 'field_2303');  // device applied discount (extended)
    var hwDiscount   = sumViewField(HARDWARE_VIEWS, 'field_2303');   // hardware applied discount (extended)
    var eqNet        = sumViewField(ALL_VIEWS, 'field_2269');        // extended net price (devices + hardware)
    var retail       = eqNet + Math.abs(lineDiscount) + Math.abs(hwDiscount);
    var lumpDiscount = getLumpDiscount();
    var discount     = Math.abs(lineDiscount) + Math.abs(hwDiscount) + Math.abs(lumpDiscount);
    var discountPct  = retail > 0 ? (discount / retail * 100) : 0;
    var eqSubtotal   = retail - discount;
    var installTotal = sumViewField(EQUIPMENT_VIEWS, 'field_2028');  // per-row installation fee
    // field_2725 (FLAG_released to sales) gates whether Sales sees a
    // real number or a TBD placeholder. Until Ops has explicitly
    // released this quote to Sales, the install fee is still a draft
    // and the user shouldn't see a project total that bakes it in.
    // Same convention ops-stepper + ops-review-pill use: anything
    // other than "Yes" is TBD.
    var releasedToSales = readSowField('field_2725').toLowerCase() === 'yes';
    var projTotal       = releasedToSales ? (eqSubtotal + installTotal) : eqSubtotal;

    var layout = document.createElement('div');
    layout.className = 'scw-totals-custom';

    var h2 = document.createElement('h2');
    h2.textContent = 'Totals';
    h2.style.cssText = 'font-size:18px;font-weight:700;color:#163C6E;margin:0 0 12px;';
    layout.appendChild(h2);

    // ── EQUIPMENT ──
    layout.appendChild(createSectionHeader('Equipment'));
    layout.appendChild(createRow('Retail', formatMoney(retail)));
    if (discount > 0) {
      var discountDisplay = '- ' + formatMoney(discount);
      if (discountPct > 0) discountDisplay += ' (' + discountPct.toFixed(1) + '%)';
      layout.appendChild(createRow('Discount', discountDisplay, 'discount'));
    }
    layout.appendChild(createSubtotal('Subtotal', formatMoney(eqSubtotal)));

    // ── INSTALLATION ──
    layout.appendChild(createSectionHeader('Installation'));
    layout.appendChild(createSubtotal('Subtotal',
      releasedToSales ? formatMoney(installTotal) : 'TBD'));

    // ── PROJECT TOTAL ──
    layout.appendChild(createGrandTotal('Project Total', formatMoney(projTotal)));

    // ── SCW Notes button (field_1953) ──
    // Show a small speak/comment icon when the SOW has SCW notes
    // attached. Click reveals the full notes text in a popover so the
    // panel doesn't grow vertically for every long note.
    var scwNotes = readSowField('field_1953');
    if (scwNotes && scwNotes.length) {
      layout.appendChild(buildScwNotesButton(scwNotes));
    }

    view.appendChild(layout);

    // Inject the published-proposal block (PDF link + Open Customer
    // Link + Preview Draft Proposal link) at the bottom of the totals
    // panel. published-proposal-sow-card.js also renders this on the
    // scene, but it anchors above view_3827 which lives at the very
    // bottom of the page (after every accordion) — practically
    // invisible. The totals panel is where users actually look, so
    // duplicate it here too.
    injectProposalInfo(layout);
  }

  // Build a small "SCW Notes" speak/comment button + click-to-toggle
  // popover anchored below the totals. Idempotent — clicking outside
  // closes it; clicking the icon toggles.
  function buildScwNotesButton(notesText) {
    var wrap = document.createElement('div');
    wrap.className = 'scw-totals-notes';
    wrap.style.cssText = 'position:relative;margin-top:10px;padding-top:10px;' +
      'border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-totals-notes-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.style.cssText =
      'appearance:none;background:#f8fafc;border:1px solid #cbd5e1;' +
      'border-radius:6px;padding:5px 10px;cursor:pointer;' +
      'display:inline-flex;align-items:center;gap:6px;' +
      'font:600 11.5px/1.2 system-ui,sans-serif;color:#475569;' +
      'transition:background .12s, border-color .12s, color .12s;';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '<span>SCW Notes</span>';
    wrap.appendChild(btn);

    var pop = document.createElement('div');
    pop.className = 'scw-totals-notes-pop';
    pop.style.cssText =
      'display:none;position:absolute;right:0;top:calc(100% + 4px);' +
      'z-index:50;max-width:320px;min-width:220px;' +
      'background:#fff;border:1px solid #cbd5e1;border-radius:8px;' +
      'box-shadow:0 6px 20px rgba(15,23,42,0.12);' +
      'padding:10px 12px;text-align:left;' +
      'font:500 12px/1.45 system-ui,sans-serif;color:#1e293b;' +
      'white-space:pre-wrap;word-break:break-word;';
    pop.textContent = notesText;
    wrap.appendChild(pop);

    function close() {
      pop.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      btn.style.background = '#f8fafc';
      btn.style.borderColor = '#cbd5e1';
      btn.style.color = '#475569';
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('keydown', onKey, true);
    }
    function open() {
      pop.style.display = 'block';
      btn.setAttribute('aria-expanded', 'true');
      btn.style.background = '#eef2f7';
      btn.style.borderColor = '#94a3b8';
      btn.style.color = '#0f4c75';
      document.addEventListener('mousedown', onDocMouseDown, true);
      document.addEventListener('keydown', onKey, true);
    }
    function onDocMouseDown(e) {
      if (!wrap.contains(e.target)) close();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pop.style.display === 'block') close(); else open();
    });

    return wrap;
  }

  function injectProposalInfo(container) {
    var old = container.querySelector('.scw-totals-proposal');
    if (old) old.remove();

    try {
      // Read the published proposal via the shared helper (model-first
      // with DOM fallback, status-filtered). Same data shape that
      // ops-review-pill and the proposal page consume.
      var proposal = (window.SCW && SCW.publishedQuoteInfo)
        ? SCW.publishedQuoteInfo.read({ sourceView: 'view_3814' })
        : null;
      var hasPublished = !!proposal;

      // Build the Preview Draft Proposal href directly from the SOW
      // record id. Same construction as preview-proposal-btn.js — the
      // earlier view_3815 scrape was an intermittent failure on first
      // render because the menu view sometimes lagged behind view_3418.
      // Reading from the model is synchronous against scene state.
      var sowId = readSowField('id');
      var previewHref = (sowId && /^[0-9a-f]{24}$/i.test(sowId))
        ? '#proposals/proposal/' + sowId + '/'
        : '';

      // Nothing to render in either column — bail.
      if (!hasPublished && !previewHref) return;

      // Outer wrap — ".scw-totals-proposal" stays the find/remove anchor
      // for previous renders, and provides the right-aligned panel chrome
      // shared by the published-proposal block AND the preview-draft link
      // below. Using 'regular' variant inside (no panel chrome of its
      // own) so the wrap is the single source of border / margin /
      // alignment, regardless of which children are present.
      var wrap = document.createElement('div');
      wrap.className = 'scw-totals-proposal';
      wrap.style.cssText =
        'border-top:1px solid #e5e7eb;margin-top:12px;padding-top:10px;' +
        'padding-right:10px;text-align:right;';

      if (hasPublished && window.SCW && SCW.publishedQuoteInfo) {
        var block = SCW.publishedQuoteInfo.buildBlock(proposal, {
          variant: 'regular',
          header:  'Published Proposal',
          // No linkBuilder — when the proposal is live, the
          // identifier is plain text and the only navigation users
          // need is the Customer Link CTA below. When expired,
          // buildBlock renders a secondary outlined CTA to the
          // internal details page via customerLink.expiredFallbackUrl.
          customerLink: {
            url:                  proposal.tokenUrl || '',
            label:                'Open Customer Link',
            expiredFallbackUrl:   proposal.viewLink || '',
            expiredFallbackLabel: 'View Published Details'
          }
        });
        if (block) {
          // The base .scw-pq-info rule centers text; the panel here is
          // right-aligned via the wrap, so override on this child only.
          block.style.textAlign = 'right';
          wrap.appendChild(block);
        }
      }

      // Preview Proposal — always available when the SOW id resolves.
      // Outlined button beneath the Published Proposal card. Reads as
      // a clear secondary action without competing visually with the
      // primary Customer Link CTA.
      if (previewHref) {
        var solo = !hasPublished || !!(proposal && proposal.expired);
        var previewRow = document.createElement('div');
        previewRow.style.cssText = hasPublished
          ? 'margin-top:14px; padding-top:12px;' +
            'border-top:1px solid #e5e7eb;'
          : 'margin-top:0;';

        var previewLink = document.createElement('a');
        previewLink.href = previewHref;
        previewLink.target = '_blank';
        previewLink.rel = 'noopener';
        // Fixed 220px width matches the Customer Link CTA inside the
        // panel above so the action column stacks neatly.
        previewLink.style.cssText = solo
          // Solo (no published proposal yet OR expired) → primary chrome.
          ? 'display:inline-flex;align-items:center;justify-content:center;' +
            'gap:7px;padding:10px 18px;width:220px;box-sizing:border-box;' +
            'background:#07467c;color:#fff;border-radius:6px;' +
            'text-decoration:none;font:700 12px/1.2 system-ui,sans-serif;' +
            'letter-spacing:0.04em;text-transform:uppercase;' +
            'box-shadow:0 1px 2px rgba(0,0,0,.12);'
          // Companion to the customer CTA → outlined secondary button.
          : 'display:inline-flex;align-items:center;justify-content:center;' +
            'gap:7px;padding:9px 16px;width:220px;box-sizing:border-box;' +
            'background:#fff;color:#07467c;border:1px solid #cbd5e1;' +
            'border-radius:6px;text-decoration:none;' +
            'font:700 12px/1.2 system-ui,sans-serif;' +
            'letter-spacing:0.04em;text-transform:uppercase;';
        previewLink.innerHTML = '<svg viewBox="0 0 24 24" width="13" ' +
          'height="13" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
          '<circle cx="12" cy="12" r="3"/></svg>';
        previewLink.appendChild(document.createTextNode('Preview Proposal'));
        previewRow.appendChild(previewLink);
        wrap.appendChild(previewRow);
      }

      container.appendChild(wrap);
    } catch (e) {
      console.warn('[scw-totals] injectProposalInfo error:', e);
    }
  }

  // Expose for external callers (e.g. refresh-view-on-form-submit.js)
  window.SCW = window.SCW || {};
  SCW.restructureTotals = restructureTotals;

  // ── Scene reveal ──
  // The veil (CSS at the top of this file) hides scene_1116's content
  // from its very first paint. Revealing used to key off the totals
  // views only, which fired ~900ms after view_3418 rendered — BEFORE
  // the 1000/page refetch re-renders, the KTL-accordion wrapping, and
  // the v2 worksheet mount finished, so raw native views flashed
  // through the fade-in. Reveal now requires BOTH:
  //   1. render-quiet: no knack-view-render anywhere on the scene for
  //      REVEAL_QUIET_MS (every render re-arms the timer — covers the
  //      record-limit refetches and late hidden-view renders), and
  //   2. transforms mounted: the v2 worksheet panel exists and at
  //      least one accordion shell has wrapped.
  // If the markers aren't there at quiet-timeout, keep waiting (the
  // safety timers below cap the worst case so the page can never stay
  // blank).
  var REVEAL_QUIET_MS  = 600;
  var REVEAL_SAFETY_MS = 6000;
  var _revealTimer = null;
  var _revealSafetyTimer = null;
  function sceneEl() {
    return document.getElementById('kn-scene_1116');
  }
  function revealScene() {
    clearTimeout(_revealTimer);
    _revealTimer = null;
    clearTimeout(_revealSafetyTimer);
    _revealSafetyTimer = null;
    var scene = sceneEl();
    if (scene) scene.classList.add('scw-scene-ready');
  }
  function transformsReady() {
    var scene = sceneEl();
    if (!scene) return false;
    // v2 worksheet panel mounted (the page's main surface)
    if (!document.getElementById('scw-ws-v2-view_3586')) return false;
    // accordion wrapping has run (the most visible transform)
    if (!scene.querySelector('.scw-ktl-accordion')) return false;
    // workflow stepper applied — its applySteps pass runs on a delay
    // (500ms after view_3827 / 800ms after scene render), later than the
    // other transforms, and restyles the step accordions + forms. Without
    // this gate the veil lifted first and the raw step forms flashed.
    // #scw-step-initiate-install has no showWhen condition, so it exists
    // on every SOW once applySteps has run.
    if (!document.getElementById('scw-step-initiate-install')) return false;
    return true;
  }
  function scheduleReveal() {
    var scene = sceneEl();
    if (!scene || scene.classList.contains('scw-scene-ready')) return;
    // Absolute cap from the first render of a fresh (veiled) scene.
    if (!_revealSafetyTimer) {
      _revealSafetyTimer = setTimeout(revealScene, REVEAL_SAFETY_MS);
    }
    clearTimeout(_revealTimer);
    _revealTimer = setTimeout(function () {
      _revealTimer = null;
      if (transformsReady()) revealScene();
      else scheduleReveal();   // markers not up yet — extend the wait
    }, REVEAL_QUIET_MS);
  }

  // Any view rendering on the scene re-arms the quiet window while the
  // veil is up. Renders after reveal are ignored (class already set),
  // so the page never re-veils on poll refetches or inline edits.
  $(document).on('knack-view-render.any' + NS + 'Veil', function () {
    scheduleReveal();
  });

  // ── Bind ──
  // Debounced wrapper so we only run once after all views finish rendering
  var _totalsTimer = null;
  function debouncedTotals() {
    clearTimeout(_totalsTimer);
    _totalsTimer = setTimeout(function () {
      restructureTotals();
      scheduleReveal();
    }, 300);
  }

  if (window.SCW && SCW.onViewRender) {
    // Trigger after the totals container renders. view_3814 + view_3827
    // are SOW-context details views — view_3814 carries the published
    // proposal record, view_3827 carries the SOW record we read field_2725
    // and the SOW id off of. Re-run on either, plus on every equipment
    // grid render so the totals stay in sync with the visible data.
    SCW.onViewRender('view_3418', debouncedTotals, NS);
    SCW.onViewRender('view_3814', debouncedTotals, NS);
    SCW.onViewRender('view_3827', debouncedTotals, NS);

    // Every link inside the totals view (Preview Proposal, Customer
    // Link, anything Knack renders) should open in a new tab. Re-run
    // after each render — the custom totals block rebuilds anchors.
    SCW.onViewRender('view_3418', function () {
      var view = document.getElementById('view_3418');
      if (!view) return;
      var links = view.querySelectorAll('a[href]');
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        if (a.getAttribute('target') === '_blank') continue;
        a.setAttribute('target', '_blank');
        var rel = (a.getAttribute('rel') || '').split(/\s+/);
        if (rel.indexOf('noopener') === -1) rel.push('noopener');
        a.setAttribute('rel', rel.filter(Boolean).join(' '));
      }
    }, NS + '.openInNewTab');
    // Trigger after each equipment/hardware grid renders (these contain the actual data cells)
    for (var ev = 0; ev < ALL_VIEWS.length; ev++) {
      SCW.onViewRender(ALL_VIEWS[ev], debouncedTotals, NS);
    }
  } else {
    $(document).ready(function () {
      setTimeout(function () { restructureTotals(); revealScene(); }, 1000);
    });
  }

  // Secondary safety cap — reveal 3s after the scene's initial render
  // pass completes, whatever state the transforms are in. Together with
  // the REVEAL_SAFETY_MS cap (armed at first view render) this
  // guarantees the veil can never leave the page blank.
  $(document).on('knack-scene-render.scene_1116' + NS, function () {
    setTimeout(revealScene, 3000);
  });

  // ── Stuck-veil watchdog (event-independent) ──
  // Both caps above arm off Knack EVENTS. A user whose scene data fetch
  // hangs (or whose render events get starved by an exception upstream)
  // gets NO events — observed in the field 2026-07-15 as an indefinite
  // "Loading page…" on the sales build page. Poll the veiled scene on a
  // plain timer: veiled for WATCHDOG_MS since first seen → force the
  // reveal (whatever state the page is in beats a spinner forever) and
  // dump diagnostics naming which reveal markers / view renders are
  // missing, so a stuck report is debuggable from the user's console.
  var VEIL_WATCHDOG_MS = 10000;
  var _veilFirstSeen = 0;
  setInterval(function () {
    var scene = sceneEl();
    if (!scene || scene.classList.contains('scw-scene-ready')) {
      _veilFirstSeen = 0;
      return;
    }
    var now = Date.now();
    if (!_veilFirstSeen) { _veilFirstSeen = now; return; }
    if (now - _veilFirstSeen < VEIL_WATCHDOG_MS) return;
    try {
      var rendered = [];
      if (typeof Knack !== 'undefined' && Knack.views) {
        for (var k in Knack.views) rendered.push(k);
      }
      console.warn('[scw-scene-veil] scene_1116 still veiled after ' +
        Math.round((now - _veilFirstSeen) / 1000) + 's — forcing reveal.' +
        ' ws-v2 panel=' + !!document.getElementById('scw-ws-v2-view_3586') +
        ' accordion=' + !!scene.querySelector('.scw-ktl-accordion') +
        ' stepper=' + !!document.getElementById('scw-step-initiate-install') +
        ' | Knack.views: ' + (rendered.join(', ') || '(none)'));
    } catch (e) { /* diagnostics only */ }
    revealScene();
  }, 2000);
})();
