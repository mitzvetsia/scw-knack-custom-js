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
  function sumViewField(viewIds, fieldKey) {
    var total = 0;
    for (var v = 0; v < viewIds.length; v++) {
      var container = document.getElementById(viewIds[v]);
      if (!container) { console.log('[scw-totals] container not found:', viewIds[v]); continue; }
      var cells = container.querySelectorAll('td[data-field-key="' + fieldKey + '"]');
      console.log('[scw-totals]', viewIds[v], fieldKey, '→', cells.length, 'cells');
      for (var i = 0; i < cells.length; i++) {
        var val = parseNum(cells[i].textContent);
        console.log('  [' + i + ']', cells[i].textContent.trim(), '→', val);
        total += val;
      }
    }
    console.log('[scw-totals] SUM', fieldKey, '=', total);
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
    var projTotal    = eqSubtotal + installTotal;

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
    layout.appendChild(createSubtotal('Subtotal', formatMoney(installTotal)));

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
      var model = Knack.views.view_3814 && Knack.views.view_3814.model;
      var records = model && model.data && model.data.models;
      if (!records || !records.length) return;

      var pub = null;
      for (var i = 0; i < records.length; i++) {
        var attrs = records[i].attributes || records[i];
        var status = (attrs.field_2658 || '').replace(/<[^>]*>/g, '').trim();
        if (/published/i.test(status)) { pub = attrs; break; }
      }
      if (!pub) return;

      var proposalName = (pub.field_2665 || '').replace(/<[^>]*>/g, '').trim();
      var expDate = (pub.field_2659 || '').replace(/<[^>]*>/g, '').trim();

      // Extract PDF link
      var pdfUrl = '';
      var pdfName = '';
      var pdfRaw = pub.field_2681 || '';
      if (typeof pdfRaw === 'string') {
        var m = pdfRaw.match(/href="([^"]+)"/);
        if (m) pdfUrl = m[1];
        var m2 = pdfRaw.match(/>([^<]+\.pdf)</i);
        if (m2) pdfName = m2[1];
      }
      if (!pdfUrl && pub.field_2681_raw && pub.field_2681_raw.url) {
        pdfUrl = pub.field_2681_raw.url;
        pdfName = pub.field_2681_raw.filename || 'Download PDF';
      }

      // Extract proposal view link from the first link column
      var viewLink = '';
      var viewEl = document.getElementById('view_3814');
      if (viewEl && pub.id) {
        var row = viewEl.querySelector('tr#' + pub.id);
        if (row) {
          var link = row.querySelector('a.kn-link-page');
          if (link) viewLink = link.getAttribute('href') || '';
        }
      }

      var wrap = document.createElement('div');
      wrap.className = 'scw-totals-proposal';
      wrap.style.cssText = 'border-top:1px solid #e5e7eb;margin-top:12px;padding-top:10px;';

      var hdr = document.createElement('div');
      hdr.style.cssText = 'font-size:11px;font-weight:700;color:#163C6E;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;';
      hdr.textContent = 'Published Proposal';
      wrap.appendChild(hdr);

      if (proposalName) {
        var nameRow = document.createElement('div');
        nameRow.style.cssText = 'font-size:13px;color:#1e293b;margin-bottom:4px;';
        if (viewLink) {
          var nameLink = document.createElement('a');
          nameLink.href = viewLink;
          nameLink.textContent = proposalName;
          nameLink.style.cssText = 'color:#2563eb;text-decoration:none;font-weight:500;';
          nameRow.appendChild(nameLink);
        } else {
          nameRow.textContent = proposalName;
        }
        wrap.appendChild(nameRow);
      }

      if (expDate) {
        var expRow = document.createElement('div');
        expRow.style.cssText = 'font-size:12px;color:#64748b;margin-bottom:4px;';
        expRow.textContent = 'Expires: ' + expDate;
        wrap.appendChild(expRow);
      }

      if (pdfUrl) {
        var pdfRow = document.createElement('a');
        pdfRow.href = pdfUrl;
        pdfRow.target = '_blank';
        pdfRow.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#2563eb;text-decoration:none;font-weight:500;';
        pdfRow.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
        pdfRow.appendChild(document.createTextNode(pdfName || 'Download PDF'));
        wrap.appendChild(pdfRow);
      }

      container.appendChild(wrap);
    } catch (e) {}
  }

  // Expose for external callers (e.g. refresh-view-on-form-submit.js)
  window.SCW = window.SCW || {};
  SCW.restructureTotals = restructureTotals;

  // ── Bind ──
  // Debounced wrapper so we only run once after all views finish rendering
  var _totalsTimer = null;
  function debouncedTotals() {
    clearTimeout(_totalsTimer);
    _totalsTimer = setTimeout(restructureTotals, 300);
  }

  if (window.SCW && SCW.onViewRender) {
    // Trigger after the totals container renders
    SCW.onViewRender('view_3418', debouncedTotals, NS);
    SCW.onViewRender('view_3814', debouncedTotals, NS);
    // Trigger after each equipment/hardware grid renders (these contain the actual data cells)
    for (var ev = 0; ev < ALL_VIEWS.length; ev++) {
      SCW.onViewRender(ALL_VIEWS[ev], debouncedTotals, NS);
    }
  } else {
    $(document).ready(function () {
      setTimeout(restructureTotals, 1000);
    });
  }
})();
