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
      hostViewId: 'view_3418',         // panel inserted beside/after this view
      moduleTitle: 'Adjust Pricing',
      layout: 'side-by-side',          // grid: totals left, controls right
      heroTotal: true,                 // extract last detail row as hero card
      forms: [
        {
          viewId: 'view_3492',
          compactLabel: 'Global Discount %',
          enterToSubmit: true,
          hideButton: true,
          percentSuffix: true           // show "%" badge on input
        },
        {
          viewId: 'view_3490',
          compactLabel: 'Additional Lump Sum Discount',
          enterToSubmit: true,
          hideButton: true,
          fields: {
            field_2290: { format: 'currency' }
          },
          textareaLabel: 'Discount Note / Reason'
        }
      ]
    }
  ];

  // ══════════════════════════════════════════════════════════════
  //  CSS
  // ══════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = `
/* ── Side-by-side layout ── */
.${P}-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 800px) {
  .${P}-layout {
    grid-template-columns: 1fr;
  }
}
.${P}-layout-left {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Project Total hero card ── */
.${P}-hero {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  padding: 16px 24px;
}
.${P}-hero-label {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 2px;
}
.${P}-hero-value {
  font-size: 28px;
  font-weight: 800;
  color: #163C6E;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

/* ── Pricing panel (right column) ── */
.${P}-panel {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  padding: 20px 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Module title ── */
.${P}-title {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 20px;
}

/* ── Form section ── */
.${P}-panel .${P}-section {
  padding: 0 0 16px;
}
.${P}-panel .${P}-section + .${P}-section {
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}
.${P}-panel .${P}-section:last-child {
  padding-bottom: 0;
}

/* Section label — uppercase control label */
.${P}-label {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

/* ── Percent suffix input group ── */
.${P}-suffix-wrap {
  display: flex;
  align-items: stretch;
}
.${P}-suffix-wrap input {
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
  border-right: none !important;
  flex: 1;
  min-width: 0;
}
.${P}-suffix {
  display: flex;
  align-items: center;
  padding: 0 14px;
  background: #f1f5f9;
  border: 1px solid #d1d5db;
  border-left: none;
  border-radius: 0 6px 6px 0;
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  flex-shrink: 0;
}

/* ── Textarea group (label + textarea in shared border) ── */
.${P}-ta-group {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  overflow: hidden;
  margin-top: 8px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.${P}-ta-group:focus-within {
  border-color: #163C6E;
  box-shadow: 0 0 0 2px rgba(22,60,110,0.10);
}
.${P}-ta-label {
  font-size: 12px;
  color: #94a3b8;
  padding: 8px 10px 0;
  font-style: italic;
}
.${P}-ta-group textarea {
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}
.${P}-ta-group textarea:focus {
  box-shadow: none !important;
  border: none !important;
}

/* ── Hide native Knack form chrome ── */
.${P}-section .view-header {
  display: none !important;
}
.${P}-section .kn-input > label {
  display: none !important;
}
.${P}-section .kn-instructions,
.${P}-section .kn-form-group .kn-help-text {
  display: none !important;
}
.${P}-section .kn-form-group {
  margin: 0 !important;
  padding: 0 !important;
}
.${P}-section .kn-input {
  margin-bottom: 4px !important;
  padding: 0 !important;
}
.${P}-section .kn-input:last-of-type {
  margin-bottom: 0 !important;
}
.${P}-section .kn-submit {
  margin: 4px 0 0 !important;
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
  font-size: 15px !important;
  font-weight: 500 !important;
  padding: 8px 12px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  background: #fff !important;
  color: #1e293b !important;
  outline: none !important;
  box-shadow: none !important;
  transition: background 0.4s, border-color 0.2s, box-shadow 0.2s;
  height: auto !important;
  line-height: 1.4 !important;
  width: 100% !important;
  max-width: 100% !important;
  font-variant-numeric: tabular-nums;
}
.${P}-section input[type="text"]:hover,
.${P}-section input[type="number"]:hover {
  border-color: #9ca3af !important;
}
.${P}-section input[type="text"]:focus,
.${P}-section input[type="number"]:focus {
  border-color: #163C6E !important;
  box-shadow: 0 0 0 2px rgba(22,60,110,0.10) !important;
}

.${P}-section textarea {
  width: 100% !important;
  font-size: 14px !important;
  padding: 6px 10px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  background: #fff !important;
  color: #1e293b !important;
  outline: none !important;
  box-shadow: none !important;
  min-height: 48px;
  resize: vertical;
  line-height: 1.5 !important;
  font-family: inherit !important;
  transition: background 0.4s, border-color 0.2s, box-shadow 0.2s;
}
.${P}-section textarea:hover {
  border-color: #9ca3af !important;
}
.${P}-section textarea:focus {
  border-color: #163C6E !important;
  box-shadow: 0 0 0 2px rgba(22,60,110,0.10) !important;
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
  line-height: 1.4 !important;
  height: auto !important;
  width: auto !important;
}
.${P}-section .kn-submit button:hover,
.${P}-section .kn-submit input[type="submit"]:hover {
  background: rgb(7, 70, 124) !important;
}

/* ── Hide native success/confirmation ── */
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

/* ── Hint text ── */
.${P}-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
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

  function findSubmitBtn(viewEl) {
    return viewEl.querySelector('.kn-submit button[type="submit"], .kn-submit input[type="submit"]');
  }

  function findFormInputs(viewEl) {
    return viewEl.querySelectorAll(
      '.kn-input input[type="text"], .kn-input input[type="number"], ' +
      '.kn-input input[type="email"], .kn-input textarea, .kn-input select'
    );
  }

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
  //  FIELD FORMATTING — currency display (percent handled by SCW.pctFormat)
  // ══════════════════════════════════════════════════════════════

  function applyCurrencyFormatting(viewEl, fieldsCfg) {
    if (!fieldsCfg) return;
    for (var fieldId in fieldsCfg) {
      if (!fieldsCfg.hasOwnProperty(fieldId)) continue;
      if (fieldsCfg[fieldId].format !== 'currency') continue;
      var inp = viewEl.querySelector('#' + fieldId);
      if (!inp || inp.getAttribute('data-scw-cur')) continue;
      inp.setAttribute('data-scw-cur', '1');

      var num = parseFloat(String(inp.value).replace(/[$,\s]/g, ''));
      if (!isNaN(num)) inp.value = '$' + num.toFixed(2);

      (function (input) {
        $(input).off('focus' + NS).on('focus' + NS, function () {
          input.value = String(input.value).replace(/[$,\s]/g, '');
          input.select();
        });
        $(input).off('blur' + NS).on('blur' + NS, function () {
          if (input._scwSubmitting) { input._scwSubmitting = false; return; }
          var n = parseFloat(String(input.value).replace(/[$,\s]/g, ''));
          if (!isNaN(n)) input.value = '$' + n.toFixed(2);
        });
      })(inp);
    }
  }

  function prepareCurrencyForSubmit(viewId) {
    var cfg = VIEW_FIELDS[viewId];
    if (!cfg) return;
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;
    for (var fieldId in cfg) {
      if (!cfg.hasOwnProperty(fieldId)) continue;
      if (cfg[fieldId].format !== 'currency') continue;
      var inp = viewEl.querySelector('#' + fieldId);
      if (!inp) continue;
      inp._scwSubmitting = true;
      var n = parseFloat(String(inp.value).replace(/[$,\s]/g, ''));
      if (!isNaN(n)) inp.value = String(n);
      $(inp).trigger('change');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  LAYOUT — side-by-side wrapper
  // ══════════════════════════════════════════════════════════════

  function ensureLayout(panelCfg) {
    var layoutId = P + '-layout-' + panelCfg.scene;
    var layout = document.getElementById(layoutId);
    var hostView = document.getElementById(panelCfg.hostViewId);
    if (!hostView) return null;

    if (layout) {
      // Verify hostView is still inside our layout
      if (hostView.closest('#' + layoutId)) {
        return {
          layout: layout,
          left: layout.querySelector('.' + P + '-layout-left'),
          right: layout.querySelector('.' + P + '-layout-right')
        };
      }
      // hostView was recreated outside layout — tear down and rebuild
      layout.remove();
    }

    layout = document.createElement('div');
    layout.id = layoutId;
    layout.className = P + '-layout';

    var left = document.createElement('div');
    left.className = P + '-layout-left';

    var right = document.createElement('div');
    right.className = P + '-layout-right';

    hostView.parentNode.insertBefore(layout, hostView);
    left.appendChild(hostView);
    layout.appendChild(left);
    layout.appendChild(right);

    return { layout: layout, left: left, right: right };
  }

  // ══════════════════════════════════════════════════════════════
  //  HERO TOTAL — extract last detail row into standalone card
  // ══════════════════════════════════════════════════════════════

  function updateHeroTotal(panelCfg, leftCol) {
    var hostView = document.getElementById(panelCfg.hostViewId);
    if (!hostView) return;

    var heroId = P + '-hero-' + panelCfg.scene;
    var items = hostView.querySelectorAll('.kn-detail-body-item');
    if (!items.length) return;

    var lastItem = items[items.length - 1];
    var labelEl = lastItem.querySelector('.kn-detail-label');
    var valueEl = lastItem.querySelector('.kn-detail-body');
    if (!labelEl || !valueEl) return;

    var labelText = labelEl.textContent.trim();
    var valueText = valueEl.textContent.trim();

    // Hide the last row in the original view
    lastItem.style.display = 'none';

    var hero = document.getElementById(heroId);
    if (hero) {
      hero.querySelector('.' + P + '-hero-label').textContent = labelText;
      hero.querySelector('.' + P + '-hero-value').textContent = valueText;
    } else {
      hero = document.createElement('div');
      hero.id = heroId;
      hero.className = P + '-hero';

      var hLabel = document.createElement('div');
      hLabel.className = P + '-hero-label';
      hLabel.textContent = labelText;

      var hValue = document.createElement('div');
      hValue.className = P + '-hero-value';
      hValue.textContent = valueText;

      hero.appendChild(hLabel);
      hero.appendChild(hValue);
      leftCol.appendChild(hero);
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

    viewEl.setAttribute(APPLIED_ATTR, '1');

    if (formCfg.hideButton) {
      section.classList.add(P + '-hide-btn');
    }

    if (submitBtn && formCfg.buttonLabel) {
      submitBtn.textContent = formCfg.buttonLabel;
    }

    // Move the entire view element into our section
    section.appendChild(viewEl);

    // Apply currency formatting
    applyCurrencyFormatting(viewEl, formCfg.fields);

    // Inject percent suffix badge
    if (formCfg.percentSuffix) {
      var pctInput = viewEl.querySelector('.kn-input input[type="text"], .kn-input input[type="number"]');
      if (pctInput && !pctInput.getAttribute('data-scw-pct-suffix')) {
        pctInput.setAttribute('data-scw-pct-suffix', '1');
        var suffixWrap = document.createElement('div');
        suffixWrap.className = P + '-suffix-wrap';
        pctInput.parentNode.insertBefore(suffixWrap, pctInput);
        suffixWrap.appendChild(pctInput);
        var suffixEl = document.createElement('span');
        suffixEl.className = P + '-suffix';
        suffixEl.textContent = '%';
        suffixWrap.appendChild(suffixEl);
      }
    }

    // Wrap textarea with floating label
    if (formCfg.textareaLabel) {
      var ta = viewEl.querySelector('.kn-input textarea');
      if (ta && !ta.getAttribute('data-scw-ta-wrapped')) {
        ta.setAttribute('data-scw-ta-wrapped', '1');
        var taGroup = document.createElement('div');
        taGroup.className = P + '-ta-group';
        var taLabelEl = document.createElement('div');
        taLabelEl.className = P + '-ta-label';
        taLabelEl.textContent = formCfg.textareaLabel;
        ta.parentNode.insertBefore(taGroup, ta);
        taGroup.appendChild(taLabelEl);
        taGroup.appendChild(ta);
      }
    }

    // On form submit: flash inputs green, lock scroll
    $(document).off('knack-form-submit.' + formCfg.viewId + NS)
               .on('knack-form-submit.' + formCfg.viewId + NS, function () {
      formCfg._submitAt = Date.now();

      flashInputs(formCfg.viewId);
      formCfg._flashOnRender = true;

      // Re-format after Knack re-renders with raw values
      var vid = formCfg.viewId;
      var fCfg = formCfg.fields;
      setTimeout(function () {
        var v = document.getElementById(vid);
        if (v) applyCurrencyFormatting(v, fCfg);
        if (SCW.pctFormat) SCW.pctFormat.reformatAfterRender(v);
      }, 1200);
      setTimeout(function () {
        var v = document.getElementById(vid);
        if (v) applyCurrencyFormatting(v, fCfg);
        if (SCW.pctFormat) SCW.pctFormat.reformatAfterRender(v);
      }, 2500);

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
    // Delay rebuild if a form just submitted
    for (var d = 0; d < panelCfg.forms.length; d++) {
      var fc = panelCfg.forms[d];
      if (fc._submitAt && (Date.now() - fc._submitAt) < 800) {
        setTimeout(function () { buildPanel(panelCfg); }, 800);
        return;
      }
    }

    var hostView = document.getElementById(panelCfg.hostViewId);
    if (!hostView) return;

    // Set up side-by-side layout if configured
    var cols = null;
    if (panelCfg.layout === 'side-by-side') {
      cols = ensureLayout(panelCfg);
      if (!cols) return;
    }

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
      if (allApplied) {
        // Still update hero total in case hostView re-rendered
        if (panelCfg.heroTotal && cols) updateHeroTotal(panelCfg, cols.left);
        return;
      }
      // A form was re-rendered — rebuild the panel
      var insertRef = cols ? cols.right : hostView.parentNode;
      for (var r = 0; r < panelCfg.forms.length; r++) {
        var fv = document.getElementById(panelCfg.forms[r].viewId);
        if (fv && fv.parentElement && fv.parentElement.closest('.' + P + '-panel')) {
          insertRef.insertBefore(fv, existingPanel);
          fv.removeAttribute(APPLIED_ATTR);
        }
      }
      existingPanel.remove();
    }

    // Build the panel
    var panel = document.createElement('div');
    panel.className = P + '-panel';
    panel.id = panelId;

    if (panelCfg.moduleTitle) {
      var title = document.createElement('div');
      title.className = P + '-title';
      title.textContent = panelCfg.moduleTitle;
      panel.appendChild(title);
    }

    var hasContent = false;
    for (var i = 0; i < panelCfg.forms.length; i++) {
      var formCfg = panelCfg.forms[i];

      var section = document.createElement('div');
      section.className = P + '-section';

      // Check for textarea
      var hasTextarea = false;
      var viewEl = document.getElementById(formCfg.viewId);
      if (viewEl) {
        hasTextarea = !!viewEl.querySelector('.kn-input textarea');
      }

      // Add compact label
      if (formCfg.compactLabel) {
        var label = document.createElement('div');
        label.className = P + '-label';
        label.textContent = formCfg.compactLabel;
        section.appendChild(label);
      }

      if (enhanceForm(section, formCfg)) {
        // Add hint text
        if (formCfg.enterToSubmit) {
          var hint = document.createElement('div');
          hint.className = P + '-hint';
          hint.textContent = hasTextarea
            ? 'Press Enter to apply \u00b7 Shift+Enter for newline'
            : 'Press Enter to apply';
          section.appendChild(hint);
        }
        panel.appendChild(section);
        hasContent = true;
      }
    }

    if (!hasContent) return;

    // Insert panel
    if (cols) {
      cols.right.appendChild(panel);
    } else {
      hostView.insertAdjacentElement('afterend', panel);
    }

    // Extract hero total
    if (panelCfg.heroTotal && cols) {
      updateHeroTotal(panelCfg, cols.left);
    }

    // Flash green on forms that just submitted
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

  var ENTER_SUBMIT_VIEWS = {};
  var VIEW_FIELDS = {};
  for (var pi = 0; pi < PANELS.length; pi++) {
    for (var fi2 = 0; fi2 < PANELS[pi].forms.length; fi2++) {
      var fc = PANELS[pi].forms[fi2];
      if (fc.enterToSubmit) ENTER_SUBMIT_VIEWS[fc.viewId] = true;
      if (fc.fields) VIEW_FIELDS[fc.viewId] = fc.fields;
    }
  }

  // Document-level keydown (capture phase) — survives Knack re-renders
  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
    var isTextarea = (tag === 'textarea');

    var isEnter = (e.key === 'Enter' || e.keyCode === 13);
    var isTab = (e.key === 'Tab' || e.keyCode === 9);

    if (!isEnter && !isTab) return;
    if (isTextarea && isEnter && e.shiftKey) return;

    var el = e.target;
    while (el && el !== document.body) {
      if (el.id && ENTER_SUBMIT_VIEWS[el.id]) {
        var btn = findSubmitBtn(el);
        if (btn) {
          e.preventDefault();
          e.stopImmediatePropagation();
          prepareCurrencyForSubmit(el.id);
          if (SCW.pctFormat) SCW.pctFormat.prepareForSubmit(el);
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

      SCW.onSceneRender(panelCfg.scene, (function (cfg) {
        return function () {
          setTimeout(function () { buildPanel(cfg); }, 150);
        };
      })(panelCfg), NS);

      // Bind on each form's view render
      for (var f = 0; f < panelCfg.forms.length; f++) {
        SCW.onViewRender(panelCfg.forms[f].viewId, (function (cfg) {
          return function () {
            setTimeout(function () { buildPanel(cfg); }, 150);
          };
        })(panelCfg), NS);
      }

      // Bind on host view render (to update hero total)
      SCW.onViewRender(panelCfg.hostViewId, (function (cfg) {
        return function () {
          setTimeout(function () {
            if (cfg.heroTotal && cfg.layout === 'side-by-side') {
              var layoutEl = document.getElementById(P + '-layout-' + cfg.scene);
              if (layoutEl) {
                var leftCol = layoutEl.querySelector('.' + P + '-layout-left');
                if (leftCol) updateHeroTotal(cfg, leftCol);
              }
            }
          }, 150);
        };
      })(panelCfg), NS);
    }
  }

  if (window.SCW && SCW.onViewRender) {
    init();
  } else {
    $(document).ready(init);
  }
})();
