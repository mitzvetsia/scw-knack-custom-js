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
#view_3418 .view-header {
  display: none !important;
}
/* Hide original detail body — replaced by custom layout */
#view_3418 .kn-detail.kn-detail-body {
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

  /** Create a section header element. */
  function createSectionHeader(text) {
    var div = document.createElement('div');
    div.className = 'scw-totals-section-hdr';
    div.textContent = text;
    return div;
  }

  /** Create a label + value row. */
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

  /** Create a subtotal row. */
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

  /** Create the grand total row. */
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

  /** Read Knack detail items into a label→value map. */
  function readFieldMap(view) {
    var map = {};
    var items = view.querySelectorAll('.kn-detail-body-item');
    for (var i = 0; i < items.length; i++) {
      var labelEl = items[i].querySelector('.kn-detail-label');
      var valueEl = items[i].querySelector('.kn-detail-body');
      if (labelEl && valueEl) {
        map[labelEl.textContent.trim()] = valueEl.textContent.trim();
      }
    }
    return map;
  }

  /** Look up a value by partial label match. */
  function val(map, label) {
    if (map[label]) return map[label];
    var lc = label.toLowerCase();
    for (var key in map) {
      if (key.toLowerCase().indexOf(lc) !== -1) return map[key];
    }
    return null;
  }

  /** Build the custom grouped totals layout. */
  function restructureTotals() {
    var view = document.getElementById('view_3418');
    if (!view) return;

    // Remove previous custom layout if rebuilding
    var existing = view.querySelector('.scw-totals-custom');
    if (existing) existing.remove();

    var fields = readFieldMap(view);
    if (!Object.keys(fields).length) return;

    var layout = document.createElement('div');
    layout.className = 'scw-totals-custom';

    // ── EQUIPMENT ──
    layout.appendChild(createSectionHeader('Equipment'));

    var retail = val(fields, 'Equipment Retail');
    if (retail) layout.appendChild(createRow('Retail', retail));

    var discount = val(fields, 'Total Equipment Discount');
    var discountPct = val(fields, 'Total Discount %') || val(fields, 'Discount %');
    if (discount) {
      var discountDisplay = '- ' + discount;
      if (discountPct) discountDisplay += ' (' + discountPct + ')';
      layout.appendChild(createRow('Discount', discountDisplay, 'discount'));
    }

    var eqTotal = val(fields, 'Equipment Total');
    if (eqTotal) layout.appendChild(createSubtotal('Subtotal', eqTotal));

    // ── INSTALLATION ──
    layout.appendChild(createSectionHeader('Installation'));

    var installTotal = val(fields, 'Installation Total') || val(fields, 'Installation');
    if (installTotal) layout.appendChild(createSubtotal('Subtotal', installTotal));

    // ── PROJECT TOTAL ──
    var projTotal = val(fields, 'Project Total');
    if (projTotal) layout.appendChild(createGrandTotal('Project Total', projTotal));

    view.appendChild(layout);
  }

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
