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
  var EQUIPMENT_VIEWS = ['view_3586', 'view_3588'];  // grids with equipment line items
  var LUMP_DISCOUNT_FIELD = 'field_2290';             // additional lump sum discount (view_3490 form)

  /** Parse a raw Knack field value to a number. Handles strings, numbers, and _raw values. */
  function parseNum(val) {
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    if (!val) return 0;
    var raw = String(val).replace(/[^0-9.\-]/g, '');
    var n = parseFloat(raw);
    return isFinite(n) ? n : 0;
  }

  /** Sum a field across all records in Knack's model data for the given views. */
  function sumModelField(viewIds, fieldKey) {
    var total = 0;
    for (var v = 0; v < viewIds.length; v++) {
      var viewObj = Knack.views[viewIds[v]];
      if (!viewObj || !viewObj.model || !viewObj.model.data) continue;
      var records = viewObj.model.data.models || viewObj.model.data;
      if (!records) continue;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var attrs = rec.attributes || rec;
        // Prefer _raw numeric value, fall back to formatted string
        var rawVal = attrs[fieldKey + '_raw'];
        if (rawVal !== undefined && rawVal !== null) {
          total += parseNum(rawVal);
        } else {
          total += parseNum(attrs[fieldKey]);
        }
      }
    }
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

    // ── Calculate from Knack model data ──
    var retail       = sumModelField(EQUIPMENT_VIEWS, 'field_1960');  // per-row retail price
    var lineDiscount = sumModelField(EQUIPMENT_VIEWS, 'field_2303');  // per-row applied discount
    var lumpDiscount = getLumpDiscount();
    var discount     = Math.abs(lineDiscount) + Math.abs(lumpDiscount);
    var discountPct  = retail > 0 ? (discount / retail * 100) : 0;
    var eqSubtotal   = retail - discount;
    var installTotal = sumModelField(EQUIPMENT_VIEWS, 'field_2028');  // per-row installation fee
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
  }

  // Expose for external callers (e.g. refresh-view-on-form-submit.js)
  window.SCW = window.SCW || {};
  SCW.restructureTotals = restructureTotals;

  // ── Bind ──
  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender('view_3418', function () {
      setTimeout(restructureTotals, 100);
    }, NS);
    setTimeout(restructureTotals, 200);
  } else {
    $(document).ready(function () {
      setTimeout(restructureTotals, 200);
    });
  }
})();
