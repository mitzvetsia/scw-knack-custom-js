/*** Inline Form Recompose — restyle native Knack forms into a compact panel ***/
(function () {
  'use strict';

  var P = 'scw-ifc';          // prefix for CSS classes
  var NS = '.scwInlineForm';   // event namespace
  var STYLE_ID = P + '-css';
  var APPLIED_ATTR = 'data-' + P;

  // ══════════════════════════════════════════════════════════════
  //  CONFIG — each entry describes one compact panel
  // ══════════════════════════════════════════════════════════════
  var PANELS = [
    {
      scene: 'scene_1116',
      hostViewId: 'view_3418',         // panel inserted after this view
      forms: [
        {
          viewId: 'view_3492',
          compactLabel: 'Global Discount %',
          enterToSubmit: true,
          hideButton: true
        },
        {
          viewId: 'view_3490',
          compactLabel: 'Additional Lump Sum Discount',
          enterToSubmit: true,
          hideButton: true
        }
      ]
    }
  ];

  // ══════════════════════════════════════════════════════════════
  //  CSS — compact panel + per-form chrome hiding
  // ══════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = `
/* ── Inline Form Recompose — compact pricing panel ── */
.${P}-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.06);
  padding: 16px 20px;
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Form section: each form view moved into the panel ── */
.${P}-panel .${P}-section {
  padding: 12px 0;
}
.${P}-panel .${P}-section + .${P}-section {
  border-top: 1px solid #f1f5f9;
}
.${P}-panel .${P}-section:first-child {
  padding-top: 0;
}
.${P}-panel .${P}-section:last-child {
  padding-bottom: 0;
}

/* Section label (injected above the form) */
.${P}-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

/* ── Hide native Knack form chrome ── */
/* View headers (accordion titles, view titles) */
.${P}-section .view-header {
  display: none !important;
}
/* Form field labels (we show our own compact label) */
.${P}-section .kn-input > label {
  display: none !important;
}
/* Form instructions / help text */
.${P}-section .kn-instructions,
.${P}-section .kn-form-group .kn-help-text {
  display: none !important;
}
/* Extra form margins/padding */
.${P}-section .kn-form-group {
  margin: 0 !important;
  padding: 0 !important;
}
.${P}-section .kn-input {
  margin-bottom: 6px !important;
  padding: 0 !important;
}
.${P}-section .kn-input:last-of-type {
  margin-bottom: 0 !important;
}
/* Submit wrapper — make it inline */
.${P}-section .kn-submit {
  margin: 6px 0 0 !important;
  padding: 0 !important;
}
/* Hidden submit button (still in DOM for programmatic click) */
.${P}-section.${P}-hide-btn .kn-submit {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(0,0,0,0) !important;
  white-space: nowrap !important;
  border: 0 !important;
  padding: 0 !important;
  margin: -1px !important;
}

/* ── Restyle native inputs ── */
.${P}-section input[type="text"],
.${P}-section input[type="number"],
.${P}-section input[type="email"],
.${P}-section select {
  font-size: 14px !important;
  padding: 6px 10px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: #1e293b !important;
  outline: none !important;
  box-shadow: none !important;
  transition: background 0.4s, border-color 0.15s;
  height: auto !important;
  line-height: 1.5 !important;
  width: 100% !important;
  max-width: 100% !important;
}
.${P}-section input[type="text"]:focus,
.${P}-section input[type="number"]:focus {
  border-color: #163C6E !important;
  box-shadow: 0 0 0 2px rgba(22,60,110,0.12) !important;
}

.${P}-section textarea {
  width: 100% !important;
  font-size: 13px !important;
  padding: 8px 10px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: #1e293b !important;
  outline: none !important;
  box-shadow: none !important;
  min-height: 60px;
  resize: vertical;
  line-height: 1.5 !important;
  font-family: inherit !important;
}
.${P}-section textarea:focus {
  border-color: #163C6E !important;
  box-shadow: 0 0 0 2px rgba(22,60,110,0.12) !important;
}

/* ── Submit button ── */
.${P}-section .kn-submit button,
.${P}-section .kn-submit input[type="submit"] {
  font-size: 12px !important;
  font-weight: 600 !important;
  padding: 6px 14px !important;
  background: #163C6E !important;
  color: #fff !important;
  border: none !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  white-space: nowrap;
  transition: background 0.15s;
  line-height: 1.5 !important;
  height: auto !important;
  width: auto !important;
}
.${P}-section .kn-submit button:hover,
.${P}-section .kn-submit input[type="submit"]:hover {
  background: rgb(7, 70, 124) !important;
}

/* ── Hide native success/confirmation — we flash the input instead ── */
.${P}-section .kn-form-confirmation {
  display: none !important;
}
.${P}-section .kn-message.is-danger,
.${P}-section .kn-message.error {
  font-size: 12px !important;
  padding: 6px 12px !important;
  border-radius: 6px !important;
  margin: 6px 0 0 !important;
  background: #fef2f2 !important;
  border: 1px solid #fca5a5 !important;
  color: #991b1b !important;
}

/* Enter hint for textarea forms */
.${P}-hint {
  font-size: 10px;
  color: #94a3b8;
  text-align: right;
  margin-top: 2px;
}

/* Sub-label for textarea fields */
.${P}-sub-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 4px;
}
`;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════════

  /** Find the native submit button inside a Knack form view. */
  function findSubmitBtn(viewEl) {
    return viewEl.querySelector('.kn-submit button[type="submit"], .kn-submit input[type="submit"]');
  }

  /** Find all user-facing inputs/textareas in a form view. */
  function findFormInputs(viewEl) {
    return viewEl.querySelectorAll(
      '.kn-input input[type="text"], .kn-input input[type="number"], ' +
      '.kn-input input[type="email"], .kn-input textarea, .kn-input select'
    );
  }

  /** Flash all user-facing inputs green inside a view (inline styles). */
  function flashInputs(viewId) {
    var el = document.getElementById(viewId);
    if (!el) return;
    var inputs = findFormInputs(el);
    for (var i = 0; i < inputs.length; i++) {
      (function (inp) {
        inp.style.setProperty('background', '#dcfce7', 'important');
        inp.style.setProperty('border-color', '#4ade80', 'important');
        inp.style.setProperty('transition', 'background 0.5s, border-color 0.5s', 'important');
        setTimeout(function () {
          inp.style.removeProperty('background');
          inp.style.removeProperty('border-color');
          setTimeout(function () { inp.style.removeProperty('transition'); }, 600);
        }, 1500);
      })(inputs[i]);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  CORE — enhance one form view in-place, move into panel
  // ══════════════════════════════════════════════════════════════

  function enhanceForm(section, formCfg) {
    var viewEl = document.getElementById(formCfg.viewId);
    if (!viewEl) return false;
    if (viewEl.getAttribute(APPLIED_ATTR) === '1') return false;

    var submitBtn = findSubmitBtn(viewEl);
    var inputs = findFormInputs(viewEl);
    if (!inputs.length) return false;

    // Mark as applied
    viewEl.setAttribute(APPLIED_ATTR, '1');

    // Hide submit button if configured
    if (formCfg.hideButton) {
      section.classList.add(P + '-hide-btn');
    }

    // Restyle the submit button label
    if (submitBtn && formCfg.buttonLabel) {
      submitBtn.textContent = formCfg.buttonLabel;
    }

    // Move the entire view element into our section
    section.appendChild(viewEl);

    // On form submit: flash inputs green immediately, lock scroll.
    $(document).off('knack-form-submit.' + formCfg.viewId + NS)
               .on('knack-form-submit.' + formCfg.viewId + NS, function () {
      formCfg._submitAt = Date.now();

      // Flash inputs green RIGHT NOW (before Knack re-renders)
      flashInputs(formCfg.viewId);

      // Also flash after Knack re-renders (fresh DOM)
      formCfg._flashOnRender = true;

      // Lock scroll
      var savedY = window.scrollY;
      var origScrollTo = window.scrollTo;
      var origScrollIntoView = Element.prototype.scrollIntoView;
      window.scrollTo = function () {};
      Element.prototype.scrollIntoView = function () {};
      setTimeout(function () {
        window.scrollTo = origScrollTo;
        Element.prototype.scrollIntoView = origScrollIntoView;
        window.scrollTo(0, savedY);
      }, 2000);
    });

    return true;
  }

  // ══════════════════════════════════════════════════════════════
  //  PANEL BUILDER
  // ══════════════════════════════════════════════════════════════

  function buildPanel(panelCfg) {
    // If a form just submitted, delay rebuild so the <form> stays connected
    // and Knack can finish its AJAX cycle without "form not connected" errors.
    for (var d = 0; d < panelCfg.forms.length; d++) {
      var fc = panelCfg.forms[d];
      if (fc._submitAt && (Date.now() - fc._submitAt) < 800) {
        setTimeout(function () { buildPanel(panelCfg); }, 800);
        return;
      }
    }

    var hostView = document.getElementById(panelCfg.hostViewId);
    if (!hostView) return;

    // Check if panel already exists and all forms are intact
    var panelId = P + '-' + panelCfg.scene;
    var existingPanel = document.getElementById(panelId);
    if (existingPanel) {
      var allApplied = true;
      for (var c = 0; c < panelCfg.forms.length; c++) {
        var fvEl = document.getElementById(panelCfg.forms[c].viewId);
        if (fvEl && fvEl.getAttribute(APPLIED_ATTR) !== '1') {
          allApplied = false;
          break;
        }
      }
      if (allApplied) return;
      // A form was re-rendered — rebuild the panel
      // Move form views back to their original parent before removing panel
      for (var r = 0; r < panelCfg.forms.length; r++) {
        var fv = document.getElementById(panelCfg.forms[r].viewId);
        if (fv && fv.parentElement && fv.parentElement.closest('.' + P + '-panel')) {
          hostView.parentNode.insertBefore(fv, existingPanel);
          fv.removeAttribute(APPLIED_ATTR);
        }
      }
      existingPanel.remove();
    }

    // Build the panel
    var panel = document.createElement('div');
    panel.className = P + '-panel';
    panel.id = panelId;

    var hasContent = false;
    for (var i = 0; i < panelCfg.forms.length; i++) {
      var formCfg = panelCfg.forms[i];

      // Create a section wrapper
      var section = document.createElement('div');
      section.className = P + '-section';

      // Add compact label
      var label = document.createElement('div');
      label.className = P + '-label';
      label.textContent = formCfg.compactLabel || '';
      section.appendChild(label);

      // Check for textarea hint
      var hasTextarea = false;
      var viewEl = document.getElementById(formCfg.viewId);
      if (viewEl) {
        hasTextarea = !!viewEl.querySelector('.kn-input textarea');
      }

      // Enhance and move the form into section
      if (enhanceForm(section, formCfg)) {
        // Add hint after the form if it has a textarea
        if (formCfg.enterToSubmit && hasTextarea) {
          var hint = document.createElement('div');
          hint.className = P + '-hint';
          hint.textContent = 'Enter to submit · Shift+Enter for newline';
          section.appendChild(hint);
        }
        panel.appendChild(section);
        hasContent = true;
      }
    }

    if (!hasContent) return;

    // Insert after host view
    hostView.insertAdjacentElement('afterend', panel);

    // After rebuild, flash green on any forms that just submitted
    for (var fi = 0; fi < panelCfg.forms.length; fi++) {
      if (panelCfg.forms[fi]._flashOnRender) {
        panelCfg.forms[fi]._flashOnRender = false;
        flashInputs(panelCfg.forms[fi].viewId);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════

  // Build lookup of enterToSubmit view IDs for the document-level handler
  var ENTER_SUBMIT_VIEWS = {};
  for (var pi = 0; pi < PANELS.length; pi++) {
    for (var fi2 = 0; fi2 < PANELS[pi].forms.length; fi2++) {
      var fc = PANELS[pi].forms[fi2];
      if (fc.enterToSubmit) ENTER_SUBMIT_VIEWS[fc.viewId] = true;
    }
  }

  // Document-level keydown (capture phase) — survives Knack re-renders.
  // Finds the closest form view wrapper and clicks its submit button.
  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
    var isTextarea = (tag === 'textarea');

    var isEnter = (e.key === 'Enter' || e.keyCode === 13);
    var isTab = (e.key === 'Tab' || e.keyCode === 9);

    if (!isEnter && !isTab) return;
    if (isTextarea && isEnter && e.shiftKey) return; // Shift+Enter = newline

    // Walk up to find a view wrapper that's in our config
    var el = e.target;
    while (el && el !== document.body) {
      if (el.id && ENTER_SUBMIT_VIEWS[el.id]) {
        var btn = findSubmitBtn(el);
        if (btn) {
          e.preventDefault();
          e.stopImmediatePropagation();
          flashInputs(el.id);
          btn.click();
        }
        return;
      }
      el = el.parentElement;
    }
  }, true);

  function init() {
    injectStyles();

    for (var p = 0; p < PANELS.length; p++) {
      var panelCfg = PANELS[p];

      // Bind on scene render
      SCW.onSceneRender(panelCfg.scene, (function (cfg) {
        return function () {
          setTimeout(function () { buildPanel(cfg); }, 150);
        };
      })(panelCfg), NS);

      // Bind on each form's view render (re-render after submit)
      for (var f = 0; f < panelCfg.forms.length; f++) {
        SCW.onViewRender(panelCfg.forms[f].viewId, (function (cfg) {
          return function () {
            setTimeout(function () { buildPanel(cfg); }, 150);
          };
        })(panelCfg), NS);
      }
    }
  }

  if (window.SCW && SCW.onViewRender) {
    init();
  } else {
    $(document).ready(init);
  }
})();
