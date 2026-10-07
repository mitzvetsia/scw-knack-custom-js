/*** PRICING DISCOUNT GATE — per-user limits on the Adjust Pricing forms ***/
//
// The Build SOW page's "Adjust Pricing" panel (inline-form-recompose.js,
// scene_1116) exposes two native Knack forms:
//   view_3492  Global Discount %          (field_2276 on the project)
//   view_3490  Additional Lump Sum Discount (field_2290 + note field_2291 on the SOW)
//
// Knack has no per-user field rules, so this module gates them in the
// browser by the logged-in user's email (Knack.getUserAttributes().email):
//   • Users in ALLOWED_EMAILS: no limits.
//   • Everyone else: Global Discount % is CAPPED (a higher value is clamped
//     to the cap, the submit is blocked, an amber note explains); the Lump
//     Sum form is LOCKED read-only (locked-field convention: fully readable,
//     no input chrome, pointer-events none, submit hidden) with a note.
//
// Submits are intercepted in the CAPTURE phase on the form (submit event +
// submit-button click), so the panel's Enter/Tab-to-apply path — which
// calls btn.click() — is covered too. This is a UX guard, not security:
// Knack's own view permissions still decide what the server accepts.
(function () {
  'use strict';

  var CONFIG = {
    ALLOWED_EMAILS: ['micah.shearer@getscw.com', 'ben.larue@getscw.com'],
    FORMS: {
      // Cap for everyone not in ALLOWED_EMAILS. Value is the field's own
      // unit (percent as entered: 15 = 15%).
      view_3492: { mode: 'cap', field: 'field_2276', max: 15,
                   label: 'Global Discount %',
                   note: 'Global discounts above 15% need ops-management approval — the value was set to 15%. Press Enter to apply.' },
      // Locked read-only for everyone not in ALLOWED_EMAILS.
      view_3490: { mode: 'lock',
                   label: 'Additional Lump Sum Discount',
                   note: 'Lump sum discounts can only be entered by ops management.' }
    },
    debug: false
  };

  var NS = '.scwPricingGate';
  var STYLE_ID = 'scw-pricing-gate-css';
  var NOTE_CLS = 'scw-pricing-gate-note';

  function log() { if (CONFIG.debug) { try { console.info.apply(console, ['[scw-pricing-gate]'].concat([].slice.call(arguments))); } catch (e) { /* ignore */ } } }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      // Amber = warning, per the repo's warning convention (never red for a limit).
      '.' + NOTE_CLS + '{margin:6px 0 0;padding:6px 10px;border-radius:6px;background:#fffbeb;border:1px solid #fde68a;' +
        'color:#b45309;font:600 12px/1.4 system-ui,-apple-system,sans-serif}' +
      // Locked form: readable, no input chrome (locked-field convention).
      '.kn-view.scw-pricing-gate--locked .kn-input input,' +
      '.kn-view.scw-pricing-gate--locked .kn-input textarea{pointer-events:none!important;background:transparent!important;' +
        'border-color:transparent!important;box-shadow:none!important;color:#1f2937!important;resize:none}' +
      '.kn-view.scw-pricing-gate--locked .kn-submit{display:none!important}';
    document.head.appendChild(s);
  }

  function userEmail() {
    try {
      var u = typeof Knack !== 'undefined' && Knack.getUserAttributes && Knack.getUserAttributes();
      return u && u.email ? String(u.email).trim().toLowerCase() : '';
    } catch (e) { return ''; }
  }
  function isAllowed() {
    var email = userEmail();
    if (!email) return false;   // no identity → treat as restricted
    for (var i = 0; i < CONFIG.ALLOWED_EMAILS.length; i++) {
      if (CONFIG.ALLOWED_EMAILS[i].toLowerCase() === email) return true;
    }
    return false;
  }

  function note(formEl, text) {
    var box = formEl.querySelector('.' + NOTE_CLS);
    if (!text) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = NOTE_CLS;
      // Beneath the inputs, above the (possibly hidden) submit row.
      var submit = formEl.querySelector('.kn-submit');
      if (submit) formEl.insertBefore(box, submit); else formEl.appendChild(box);
    }
    box.textContent = text;
  }

  function numberOf(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
  }

  /** Cap: clamp an over-limit value and block the submit that carried it. */
  function enforceCap(viewId, formEl, cfg) {
    var input = formEl.querySelector('#' + CSS.escape(cfg.field) + ', [name="' + cfg.field + '"]');
    if (!input) return true;
    var n = numberOf(input.value);
    if (n === null || n <= cfg.max) { note(formEl, ''); return true; }
    input.value = String(cfg.max);
    note(formEl, cfg.note);
    log(viewId + ' capped ' + n + ' → ' + cfg.max);
    return false;
  }

  function lockForm(viewEl, formEl, cfg) {
    viewEl.classList.add('scw-pricing-gate--locked');
    var inputs = formEl.querySelectorAll('.kn-input input, .kn-input textarea, .kn-input select');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].readOnly = true;
      inputs[i].setAttribute('tabindex', '-1');
      inputs[i].setAttribute('aria-readonly', 'true');
    }
    note(formEl, cfg.note);
  }

  function blockSubmit(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function bind(viewId) {
    var cfg = CONFIG.FORMS[viewId];
    var viewEl = document.getElementById(viewId);
    var formEl = viewEl && viewEl.querySelector('form');
    if (!cfg || !formEl || formEl.__scwPricingGate) return;
    formEl.__scwPricingGate = true;
    if (isAllowed()) { log(viewId + ' — ' + userEmail() + ' is allowed, no gate'); return; }
    injectCss();

    if (cfg.mode === 'lock') {
      lockForm(viewEl, formEl, cfg);
      formEl.addEventListener('submit', blockSubmit, true);
      formEl.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('button[type="submit"], input[type="submit"], .kn-submit .kn-button');
        if (btn && formEl.contains(btn)) blockSubmit(e);
      }, true);
      log(viewId + ' locked for ' + (userEmail() || '(no user)'));
      return;
    }

    // mode: 'cap'
    formEl.addEventListener('submit', function (e) {
      if (!enforceCap(viewId, formEl, cfg)) blockSubmit(e);
    }, true);
    formEl.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('button[type="submit"], input[type="submit"], .kn-submit .kn-button');
      if (!btn || !formEl.contains(btn)) return;
      if (!enforceCap(viewId, formEl, cfg)) blockSubmit(e);
    }, true);
    // Clamp as they leave the field too, so the note shows before Enter.
    formEl.addEventListener('change', function (e) {
      var t = e.target;
      if (t && (t.id === cfg.field || t.getAttribute('name') === cfg.field)) enforceCap(viewId, formEl, cfg);
    }, true);
    log(viewId + ' capped at ' + cfg.max + ' for ' + (userEmail() || '(no user)'));
  }

  Object.keys(CONFIG.FORMS).forEach(function (viewId) {
    $(document).off('knack-view-render.' + viewId + NS).on('knack-view-render.' + viewId + NS, function () { bind(viewId); });
  });

  window.SCW = window.SCW || {};
  SCW.pricingGate = { CONFIG: CONFIG, bind: bind, isAllowed: isAllowed };
})();
