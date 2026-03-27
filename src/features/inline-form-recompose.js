/*** Inline Form Recompose — move native Knack form inputs into a compact panel ***/
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
      // Container will be inserted inside this element
      hostViewId: 'view_3418',
      insertPosition: 'afterend',    // 'afterend' of the host view
      forms: [
        {
          viewId: 'view_3492',
          compactLabel: 'Global Discount %',
          // Fields auto-detected from the form; first input gets focus
          enterToSubmit: true,
          fieldOverrides: {}          // fieldKey → { placeholder, label }
        },
        {
          viewId: 'view_3490',
          compactLabel: 'Additional Lump Sum Discount',
          enterToSubmit: 'inputsOnly',   // Enter submits from inputs but not textarea
          ctrlEnterToSubmit: true,        // Cmd/Ctrl+Enter submits from textarea
          fieldOverrides: {}
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
  gap: 14px;
}

/* Each form section */
.${P}-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.${P}-section + .${P}-section {
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
}

/* Section label */
.${P}-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Row: input + button side by side */
.${P}-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Textarea row: full width */
.${P}-row--textarea {
  flex-direction: column;
  align-items: stretch;
}

/* Native Knack inputs restyled */
.${P}-section input[type="text"],
.${P}-section input[type="number"],
.${P}-section select {
  flex: 1;
  font-size: 14px !important;
  padding: 6px 10px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  background: #fff !important;
  color: #1e293b !important;
  outline: none !important;
  box-shadow: none !important;
  transition: border-color 0.15s;
  min-width: 0;
  height: auto !important;
  line-height: 1.5 !important;
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
  background: #fff !important;
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

/* Submit button */
.${P}-submit {
  flex-shrink: 0;
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
}
.${P}-submit:hover {
  background: rgb(7, 70, 124) !important;
}
.${P}-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed !important;
}

/* Textarea hint */
.${P}-hint {
  font-size: 10px;
  color: #94a3b8;
  text-align: right;
  margin-top: 2px;
}

/* Success / error messages — restyle native Knack messages */
.${P}-section .kn-message {
  font-size: 12px !important;
  padding: 6px 12px !important;
  border-radius: 6px !important;
  margin: 4px 0 0 !important;
}
.${P}-section .kn-message.success {
  background: #0d9466 !important;
  border: none !important;
  color: #fff !important;
}
.${P}-section .kn-message.is-danger,
.${P}-section .kn-message.error {
  background: #fef2f2 !important;
  border: 1px solid #fca5a5 !important;
  color: #991b1b !important;
}

/* Hide native form chrome that was left behind */
.${P}-native-hidden {
  position: absolute !important;
  left: -9999px !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  pointer-events: none !important;
}

/* Sub-label for textarea fields */
.${P}-sub-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  margin-top: 4px;
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

  /** Trigger native form submission via the real submit button. */
  function triggerNativeSubmit(submitBtn) {
    if (!submitBtn || submitBtn.disabled) return;
    submitBtn.click();
  }

  /** Extract all user-facing input/textarea/select elements from a Knack form. */
  function extractFormFields(viewEl) {
    var fields = [];
    var groups = viewEl.querySelectorAll('.kn-input');
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      // Get the field key from the group id (kn-input-field_XXXX)
      var fieldKey = null;
      var idMatch = (group.id || '').match(/kn-input-(field_\d+)/);
      if (idMatch) fieldKey = idMatch[1];

      // Find the actual input element
      var input = group.querySelector('input[type="text"], input[type="number"], textarea, select');
      if (!input) continue;

      // Find the label
      var labelEl = group.querySelector('label .kn-label-text, label');
      var labelText = labelEl ? labelEl.textContent.trim() : '';

      fields.push({
        key: fieldKey,
        input: input,
        group: group,
        label: labelText,
        type: input.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'input'
      });
    }
    return fields;
  }

  // ══════════════════════════════════════════════════════════════
  //  CORE — build compact section for one form
  // ══════════════════════════════════════════════════════════════

  function buildFormSection(formCfg) {
    var viewEl = document.getElementById(formCfg.viewId);
    if (!viewEl) return null;
    if (viewEl.getAttribute(APPLIED_ATTR) === '1') return null;

    var fields = extractFormFields(viewEl);
    var submitBtn = findSubmitBtn(viewEl);
    if (!fields.length) return null;

    // Mark as applied
    viewEl.setAttribute(APPLIED_ATTR, '1');

    // Create section wrapper
    var section = document.createElement('div');
    section.className = P + '-section';
    section.setAttribute('data-view', formCfg.viewId);

    // Section label
    var label = document.createElement('div');
    label.className = P + '-label';
    label.textContent = formCfg.compactLabel || '';
    section.appendChild(label);

    // Process each field
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var overrides = (formCfg.fieldOverrides && f.key) ? formCfg.fieldOverrides[f.key] : null;

      if (f.type === 'textarea') {
        // Sub-label for textarea
        var subLabel = document.createElement('div');
        subLabel.className = P + '-sub-label';
        subLabel.textContent = (overrides && overrides.label) || f.label || '';
        if (subLabel.textContent) section.appendChild(subLabel);

        // Textarea row
        var taRow = document.createElement('div');
        taRow.className = P + '-row ' + P + '-row--textarea';
        taRow.appendChild(f.input);
        section.appendChild(taRow);

        // Ctrl+Enter hint
        if (formCfg.ctrlEnterToSubmit) {
          var hint = document.createElement('div');
          hint.className = P + '-hint';
          hint.textContent = 'Ctrl+Enter to submit';
          section.appendChild(hint);
        }

        // Ctrl/Cmd+Enter handler for textarea
        if (formCfg.ctrlEnterToSubmit && submitBtn) {
          (function (ta, btn) {
            ta.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                triggerNativeSubmit(btn);
              }
            });
          })(f.input, submitBtn);
        }
      } else {
        // Input row: input + submit button
        var row = document.createElement('div');
        row.className = P + '-row';
        f.input.removeAttribute('style');
        row.appendChild(f.input);

        // Only put the submit button in the LAST input row
        if (submitBtn && i === fields.length - 1) {
          submitBtn.className = P + '-submit';
          submitBtn.textContent = submitBtn.textContent.trim() || 'Update';
          row.appendChild(submitBtn);
        } else if (submitBtn && fields.filter(function(x) { return x.type !== 'textarea'; }).length === 1) {
          // Single input form — attach button here
          submitBtn.className = P + '-submit';
          submitBtn.textContent = submitBtn.textContent.trim() || 'Update';
          row.appendChild(submitBtn);
        }

        section.appendChild(row);

        // Apply placeholder
        if (overrides && overrides.placeholder) {
          f.input.placeholder = overrides.placeholder;
        }

        // Enter-to-submit for inputs
        if (formCfg.enterToSubmit && submitBtn) {
          (function (inp, btn) {
            inp.addEventListener('keydown', function (e) {
              if (e.key === 'Enter') {
                e.preventDefault();
                triggerNativeSubmit(btn);
              }
            });
          })(f.input, submitBtn);
        }
      }
    }

    // Move any success/error messages into our section
    var messages = viewEl.querySelectorAll('.kn-message');
    for (var m = 0; m < messages.length; m++) {
      section.appendChild(messages[m]);
    }

    // Hide the original form view (inputs/button are now in our section)
    viewEl.classList.add(P + '-native-hidden');

    // Watch for Knack re-injecting messages into the original view
    var msgObserver = new MutationObserver(function (mutations) {
      for (var mi = 0; mi < mutations.length; mi++) {
        var added = mutations[mi].addedNodes;
        for (var ai = 0; ai < added.length; ai++) {
          var node = added[ai];
          if (node.nodeType === 1 && node.classList && node.classList.contains('kn-message')) {
            section.appendChild(node);
          }
        }
      }
    });
    msgObserver.observe(viewEl, { childList: true, subtree: true });

    return section;
  }

  // ══════════════════════════════════════════════════════════════
  //  PANEL BUILDER — assembles all form sections into one panel
  // ══════════════════════════════════════════════════════════════

  function buildPanel(panelCfg) {
    var hostView = document.getElementById(panelCfg.hostViewId);
    if (!hostView) return;

    // Check if panel already exists
    var existingPanel = document.getElementById(P + '-' + panelCfg.scene);
    if (existingPanel) {
      // Check if all form sections are still intact
      var allApplied = true;
      for (var c = 0; c < panelCfg.forms.length; c++) {
        var fvEl = document.getElementById(panelCfg.forms[c].viewId);
        if (fvEl && fvEl.getAttribute(APPLIED_ATTR) !== '1') {
          allApplied = false;
          break;
        }
      }
      if (allApplied) return; // Already built and intact
      // Knack re-rendered a form — remove old panel and rebuild
      existingPanel.remove();
    }

    var panel = document.createElement('div');
    panel.className = P + '-panel';
    panel.id = P + '-' + panelCfg.scene;

    var hasContent = false;
    for (var i = 0; i < panelCfg.forms.length; i++) {
      var section = buildFormSection(panelCfg.forms[i]);
      if (section) {
        panel.appendChild(section);
        hasContent = true;
      }
    }

    if (!hasContent) return;

    // Insert panel
    if (panelCfg.insertPosition === 'afterend') {
      hostView.insertAdjacentElement('afterend', panel);
    } else {
      hostView.parentNode.insertBefore(panel, hostView.nextSibling);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  INIT — bind to scene & view renders
  // ══════════════════════════════════════════════════════════════

  function init() {
    injectStyles();

    for (var p = 0; p < PANELS.length; p++) {
      var panelCfg = PANELS[p];

      // Bind on scene render
      SCW.onSceneRender(panelCfg.scene, (function (cfg) {
        return function () {
          // Defer slightly to let Knack finish rendering all views
          setTimeout(function () { buildPanel(cfg); }, 100);
        };
      })(panelCfg), NS);

      // Also bind on each form's view render (for re-render after submit)
      for (var f = 0; f < panelCfg.forms.length; f++) {
        SCW.onViewRender(panelCfg.forms[f].viewId, (function (cfg) {
          return function () {
            setTimeout(function () { buildPanel(cfg); }, 100);
          };
        })(panelCfg), NS);
      }
    }
  }

  // Wait for SCW namespace
  if (window.SCW && SCW.onViewRender) {
    init();
  } else {
    $(document).ready(init);
  }
})();
