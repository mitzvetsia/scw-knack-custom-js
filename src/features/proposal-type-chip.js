/*** FEATURE: Published proposal type chip (GFE / Final / Equipment Only) ***/
/**
 * Small inline badge identifying which kind of published quote a row is.
 * One of three booleans on the Published Proposal record drives it:
 *
 *   field_2746 = Yes  →  "GFE"             (amber)
 *   field_2747 = Yes  →  "Final"           (green)
 *   field_2748 = Yes  →  "Equipment Only"  (blue)
 *
 * Exactly one of these is expected to be true per record. If multiple are
 * set, GFE > Final > Equipment Only takes precedence (most specific
 * disclaimer wins). If none are set, no chip renders — same behavior as
 * for a missing record.
 *
 * Shared by ops-review-pill.js (view_3325 SOW grid) and
 * published-quote-on-proposal-page.js (view_3883), so both places identify
 * a proposal's type with one consistent visual.
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-proposal-type-chip-css';

  var GFE_FIELD        = 'field_2746';
  var FINAL_FIELD      = 'field_2747';
  var EQUIP_ONLY_FIELD = 'field_2748';

  var TYPES = {
    gfe: {
      label: 'GFE',
      bg:    '#fef3c7',
      fg:    '#78350f',
      border:'#d97706'
    },
    final: {
      label: 'Final',
      bg:    '#dcfce7',
      fg:    '#14532d',
      border:'#16a34a'
    },
    'equipment-only': {
      label: 'Equipment Only',
      bg:    '#dbeafe',
      fg:    '#1e3a8a',
      border:'#2563eb'
    }
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.scw-proposal-type-chip {' +
      '  display: inline-block; vertical-align: middle;' +
      '  padding: 2px 8px; margin: 0 0 4px 0;' +
      '  border-radius: 999px; border: 1px solid;' +
      '  font: 700 10px/1.25 system-ui, -apple-system, "Segoe UI", sans-serif;' +
      '  letter-spacing: 0.04em; text-transform: uppercase;' +
      '  white-space: nowrap;' +
      '}';
    document.head.appendChild(s);
  }
  injectStyles();

  // Robust truthiness for a Knack Yes/No field. Knack stores either
  // "Yes"/"No" strings or true/false booleans depending on schema flavor;
  // _raw can also carry the same. Anything else (empty, "No", false) is
  // treated as not-set.
  function isYes(v) {
    if (v === true) return true;
    // Match "yes" AND "true" — Knack stores Yes/No fields as booleans
    // in *_raw, and stringified reads can come through as "true"/"false".
    if (typeof v === 'string') return /^(yes|true)$/i.test(v.trim());
    return false;
  }

  function readFlag(attrs, fieldKey) {
    if (!attrs) return false;
    return isYes(attrs[fieldKey + '_raw']) || isYes(attrs[fieldKey]);
  }

  function getTypeFromAttrs(attrs) {
    if (!attrs) return null;
    if (readFlag(attrs, GFE_FIELD))        return 'gfe';
    if (readFlag(attrs, FINAL_FIELD))      return 'final';
    if (readFlag(attrs, EQUIP_ONLY_FIELD)) return 'equipment-only';
    return null;
  }

  function buildChipElement(typeOrAttrs) {
    var type = (typeof typeOrAttrs === 'string')
      ? typeOrAttrs
      : getTypeFromAttrs(typeOrAttrs);
    if (!type || !TYPES[type]) return null;
    var t = TYPES[type];
    var el = document.createElement('span');
    el.className = 'scw-proposal-type-chip scw-proposal-type-chip--' + type;
    el.textContent = t.label;
    el.style.background   = t.bg;
    el.style.color        = t.fg;
    el.style.borderColor  = t.border;
    return el;
  }

  // Public API
  window.SCW = window.SCW || {};
  SCW.proposalTypeChip = {
    GFE_FIELD:        GFE_FIELD,
    FINAL_FIELD:      FINAL_FIELD,
    EQUIP_ONLY_FIELD: EQUIP_ONLY_FIELD,
    getType:          getTypeFromAttrs,
    buildChip:        buildChipElement
  };
})();
