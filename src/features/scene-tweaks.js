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
#kn-scene_1116 {
  min-height: 100vh;
  opacity: 0;
  transition: opacity 350ms ease;
}
#kn-scene_1116.scw-scene-ready {
  opacity: 1;
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
      var container = document.getElementById(viewIds[v]);
      if (!container) { SCW.debug('[scw-totals] container not found:', viewIds[v]); continue; }
      var cells = container.querySelectorAll('td[data-field-key="' + fieldKey + '"]');
      SCW.debug('[scw-totals]', viewIds[v], fieldKey, '→', cells.length, 'cells');
      for (var i = 0; i < cells.length; i++) {
        var val = parseNum(cells[i].textContent);
        SCW.debug('  [' + i + ']', cells[i].textContent.trim(), '→', val);
        total += val;
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
    var retail       = sumViewField(ALL_VIEWS, 'field_1960');        // retail price (devices + hardware)
    var lineDiscount = sumViewField(EQUIPMENT_VIEWS, 'field_2303');  // device applied discount
    var hwDiscount   = sumViewField(HARDWARE_VIEWS, 'field_2267');   // hardware effective discount
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

    view.appendChild(layout);

    // ── Published proposal info (from view_3814) ──
    injectProposalInfo(layout);
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

      // Preview Draft — always available when the SOW id resolves.
      // Visually subordinate to the Published Proposal card above:
      // smaller type, gray, separator line, lives in its own row so
      // it doesn't compete with the primary Customer Link CTA.
      if (previewHref) {
        var solo = !hasPublished || !!(proposal && proposal.expired);
        var previewRow = document.createElement('div');
        previewRow.style.cssText = hasPublished
          ? 'margin-top:14px; padding-top:12px;' +
            'border-top:1px solid #e5e7eb;'
          : 'margin-top:0;';

        var previewLink = document.createElement('a');
        previewLink.href = previewHref;
        previewLink.style.cssText = solo
          // Solo: this IS the primary action — same chrome as the
          // customer CTA so sales still gets a clear "do this".
          ? 'display:inline-flex;align-items:center;justify-content:center;' +
            'gap:7px;padding:10px 18px;background:#07467c;' +
            'color:#fff;border-radius:6px;text-decoration:none;' +
            'font:700 12px/1.2 system-ui,sans-serif;' +
            'letter-spacing:0.04em;text-transform:uppercase;' +
            'box-shadow:0 1px 2px rgba(0,0,0,.12);'
          // Companion to the customer CTA — small gray link, no chrome.
          : 'display:inline-flex;align-items:center;gap:5px;' +
            'font:600 11px/1.3 system-ui,sans-serif;' +
            'color:#64748b;text-decoration:none;' +
            'letter-spacing:0.04em;text-transform:uppercase;';
        previewLink.innerHTML = '<svg viewBox="0 0 24 24" width="' +
          (solo ? '13' : '12') + '" height="' + (solo ? '13' : '12') +
          '" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
          '<circle cx="12" cy="12" r="3"/></svg>';
        previewLink.appendChild(document.createTextNode(
          solo ? 'Preview Proposal' : 'Preview Draft'
        ));
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
  var _revealTimer = null;
  function revealScene() {
    var scene = document.getElementById('kn-scene_1116');
    if (scene) scene.classList.add('scw-scene-ready');
  }
  function scheduleReveal() {
    clearTimeout(_revealTimer);
    _revealTimer = setTimeout(revealScene, 600);
  }

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
    // Trigger after each equipment/hardware grid renders (these contain the actual data cells)
    for (var ev = 0; ev < ALL_VIEWS.length; ev++) {
      SCW.onViewRender(ALL_VIEWS[ev], debouncedTotals, NS);
    }
  } else {
    $(document).ready(function () {
      setTimeout(function () { restructureTotals(); revealScene(); }, 1000);
    });
  }

  // Safety fallback — always reveal after 3s even if views haven't rendered
  $(document).on('knack-scene-render.scene_1116' + NS, function () {
    setTimeout(revealScene, 3000);
  });
})();
