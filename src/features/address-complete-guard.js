/***************************** ADDRESS COMPLETE GUARD *****************************/
/*
 * Knack's address input (.kn-input-address) is four independent text boxes
 * and Knack happily submits with the ENTIRE address smushed into Street
 * Address ("756 Fairview Rd, Asheville, NC, USA") and city/state/zip blank —
 * which breaks downstream consumers of the components.
 *
 * Two-layer fix, global to every Knack form (add + edit, page + modal):
 *
 *   1. AUTO-SPLIT — when the user leaves the street box and city/state are
 *      empty, a "street, city, ST[ zip][, USA]" string is parsed and
 *      distributed into the component inputs. The common paste/autocomplete
 *      miss silently fixes itself.
 *
 *   2. SUBMIT GATE — capture-phase check on form submit: any visible US
 *      address with a street but no city or state first gets one more parse
 *      attempt; if it still can't be completed the submit is blocked with a
 *      red inline error under the field (red = error, per repo convention).
 *
 * Empty addresses pass untouched (whether the field is required is Knack's
 * business); international-format address inputs (.address-intl) are left
 * alone — the parser is US-shaped.
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-addr-guard-css';
  var ERR_CLS  = 'scw-addr-guard-err';

  function injectCssOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.' + ERR_CLS + ' {' +
      '  color: #b91c1c; font-size: 12.5px; font-weight: 600;' +
      '  margin-top: 4px; line-height: 1.35;' +
      '}';
    document.head.appendChild(style);
  }

  /** Parse a smushed single-line US address into components.
   *  Handles: "756 Fairview Rd, Asheville, NC, USA"
   *           "756 Fairview Rd, Asheville, NC 28803, USA"
   *           "756 Fairview Rd Suite 2, Asheville, NC, 28803"
   *  Returns { street, city, state, zip } or null when it doesn't fit. */
  function parseSmushed(s) {
    var parts = String(s || '').split(',');
    var clean = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (p) clean.push(p);
    }
    if (clean.length < 3) return null;

    // Trailing country
    if (/^(usa|us|united states( of america)?)$/i.test(clean[clean.length - 1])) {
      clean.pop();
    }
    if (clean.length < 3) return null;

    // Trailing zip as its own comma part ("..., NC, 28803")
    var zip = '';
    var lastZip = clean[clean.length - 1].match(/^(\d{5}(?:-\d{4})?)$/);
    if (lastZip) { zip = lastZip[1]; clean.pop(); }
    if (clean.length < 3) return null;

    // "ST" or "ST 28803"
    var stPart = clean[clean.length - 1]
      .match(/^([A-Za-z]{2})(?:\.)?(?:\s+(\d{5}(?:-\d{4})?))?$/);
    if (!stPart) return null;
    var state = stPart[1].toUpperCase();
    if (stPart[2]) zip = zip || stPart[2];
    clean.pop();

    var city = clean.pop();
    if (!city || !clean.length) return null;

    return { street: clean.join(', '), city: city, state: state, zip: zip };
  }

  function inputs(wrap) {
    return {
      street:  wrap.querySelector('input[name="street"]'),
      street2: wrap.querySelector('input[name="street2"]'),
      city:    wrap.querySelector('input[name="city"]'),
      state:   wrap.querySelector('input[name="state"]'),
      zip:     wrap.querySelector('input[name="zip"]')
    };
  }
  function val(el) { return el ? String(el.value || '').trim() : ''; }
  function setVal(el, v) {
    if (!el || val(el) === v) return;
    el.value = v;
    // Sync anything listening (Knack reads the DOM on submit, but change
    // events keep any bound state honest — repo form-field convention).
    try {
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { /* ignore */ }
  }

  /** True when the address group holds an incomplete smush:
   *  street filled, but city or state blank. */
  function isIncomplete(f) {
    return !!(val(f.street) && (!val(f.city) || !val(f.state)));
  }

  /** Try to fix a smushed street in place. Returns true when the address is
   *  complete afterwards (fixed, or was never broken). */
  function tryFix(wrap) {
    var f = inputs(wrap);
    if (!f.street) return true;
    if (!isIncomplete(f)) return true;
    var parsed = parseSmushed(val(f.street));
    if (!parsed) return false;
    setVal(f.street, parsed.street);
    if (!val(f.city))  setVal(f.city,  parsed.city);
    if (!val(f.state)) setVal(f.state, parsed.state);
    if (parsed.zip && !val(f.zip)) setVal(f.zip, parsed.zip);
    return !isIncomplete(f);
  }

  function clearError(knInput) {
    var old = knInput.querySelector('.' + ERR_CLS);
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }
  function showError(knInput) {
    clearError(knInput);
    var el = document.createElement('div');
    el.className = ERR_CLS;
    el.textContent = 'This address looks incomplete — everything is in ' +
      'Street Address. Please split it into Street / City / State (and Zip).';
    knInput.appendChild(el);
    try { knInput.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    catch (e) { /* ignore */ }
  }

  injectCssOnce();

  // ── 1. Auto-split when leaving the street box ─────────────────────
  document.addEventListener('focusout', function (e) {
    var street = e.target;
    if (!street || street.name !== 'street') return;
    var wrap = street.closest && street.closest('.kn-input-address .address-us');
    if (!wrap) return;
    if (tryFix(wrap)) {
      var knInput = wrap.closest('.kn-input-address');
      if (knInput) clearError(knInput);
    }
  }, true);

  // Typing in any component clears a shown error.
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var knInput = t.closest('.kn-input-address');
    if (knInput) clearError(knInput);
  }, true);

  // ── 2. Submit gate (capture phase — runs before Knack's handler) ──
  function guardSubmit(e, form) {
    var wraps = form.querySelectorAll('.kn-input-address .address-us');
    for (var i = 0; i < wraps.length; i++) {
      var wrap = wraps[i];
      // Skip hidden address groups (display-rule-hidden fields shouldn't block)
      if (!wrap.offsetParent) continue;
      if (tryFix(wrap)) {
        var ok = wrap.closest('.kn-input-address');
        if (ok) clearError(ok);
        continue;
      }
      var knInput = wrap.closest('.kn-input-address') || wrap;
      showError(knInput);
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      return false;
    }
    return true;
  }

  // Knack submits via a delegated click on the submit button AND via native
  // form submit (Enter). Guard both, capture phase.
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest &&
              e.target.closest('.kn-form .kn-submit button[type="submit"], ' +
                               '.kn-form .kn-submit input[type="submit"]');
    if (!btn) return;
    var form = btn.closest('form');
    if (!form || !form.querySelector('.kn-input-address .address-us')) return;
    guardSubmit(e, form);
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.querySelector ||
        !form.querySelector('.kn-input-address .address-us')) return;
    guardSubmit(e, form);
  }, true);
})();
/*** END ADDRESS COMPLETE GUARD ****************************************************/
