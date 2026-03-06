// ============================================================
// Boolean Chips – compact inline-editable toggle chips
// ============================================================
//
// Replaces Yes/No text in boolean field cells with compact chip
// elements that show the field label and indicate state via color.
// Clicking a chip opens an inline Yes/No toggle; selecting a value
// updates the record through Knack's native inline-edit mechanism.
//
// CONFIGURATION
//   Edit BOOL_CHIP_CONFIG below to add views and fields.
//   Each view entry lists the boolean fields to chip-ify.
//   `label` is the text shown on the chip.
//   `fieldKey` is the Knack field_### identifier.
//
(function () {
  'use strict';

  // ============================================================
  // CONFIG – add views / fields here
  // ============================================================
  var BOOL_CHIP_CONFIG = {
    views: [
      {
        viewId: 'view_3512',
        fields: [
          { label: 'Exterior',         fieldKey: 'field_2372' },
          { label: 'Existing Cabling', fieldKey: 'field_2370' },
          { label: 'Plenum',           fieldKey: 'field_2371' }
        ]
      }
    ]
  };

  // ============================================================
  // CONSTANTS
  // ============================================================
  var STYLE_ID       = 'scw-bool-chips-css';
  var CHIP_CLASS     = 'scw-bool-chip';
  var EDITOR_CLASS   = 'scw-chip-editor';
  var PROCESSED_ATTR = 'data-scw-chip-processed';
  var EVENT_NS       = '.scwBoolChips';

  // ============================================================
  // CSS – injected once
  // ============================================================
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      /* ---- base chip ---- */
      '.' + CHIP_CLASS + ' {',
      '  display: inline-block;',
      '  padding: 2px 10px;',
      '  border-radius: 12px;',
      '  font-size: 12px;',
      '  font-weight: 500;',
      '  line-height: 1.5;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  transition: background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;',
      '  white-space: nowrap;',
      '  border: 1px solid transparent;',
      '}',

      /* ---- yes state ---- */
      '.' + CHIP_CLASS + '.is-yes {',
      '  background-color: #dbeafe;',
      '  color: #1e40af;',
      '  border-color: #93c5fd;',
      '}',
      '.' + CHIP_CLASS + '.is-yes:hover {',
      '  background-color: #bfdbfe;',
      '  box-shadow: 0 1px 3px rgba(30,64,175,0.15);',
      '}',

      /* ---- no state ---- */
      '.' + CHIP_CLASS + '.is-no {',
      '  background-color: #f9fafb;',
      '  color: #9ca3af;',
      '  border-color: #d1d5db;',
      '}',
      '.' + CHIP_CLASS + '.is-no:hover {',
      '  background-color: #f3f4f6;',
      '  color: #6b7280;',
      '  box-shadow: 0 1px 3px rgba(0,0,0,0.08);',
      '}',

      /* ---- editor popover ---- */
      '.' + EDITOR_CLASS + ' {',
      '  display: inline-flex;',
      '  gap: 4px;',
      '  align-items: center;',
      '  padding: 2px 0;',
      '}',
      '.' + EDITOR_CLASS + ' .scw-chip-label {',
      '  font-size: 11px;',
      '  color: #6b7280;',
      '  margin-right: 4px;',
      '}',
      '.' + EDITOR_CLASS + ' button {',
      '  padding: 2px 12px;',
      '  border-radius: 10px;',
      '  border: 1px solid #d1d5db;',
      '  background: #fff;',
      '  font-size: 12px;',
      '  cursor: pointer;',
      '  transition: background-color 0.12s, border-color 0.12s;',
      '}',
      '.' + EDITOR_CLASS + ' button:hover {',
      '  background-color: #f3f4f6;',
      '}',
      '.' + EDITOR_CLASS + ' button.is-active {',
      '  background-color: #dbeafe;',
      '  border-color: #93c5fd;',
      '  color: #1e40af;',
      '  font-weight: 600;',
      '}',

      /* ---- prevent row click-through ---- */
      'td.' + CHIP_CLASS + '-cell { cursor: default; }'
    ].join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  /** Normalize cell text for Yes/No detection. */
  function normalizeBool(text) {
    var t = (text || '').replace(/[\u00a0\u200b]/g, ' ').trim().toLowerCase();
    if (t === 'yes' || t === 'true') return 'yes';
    if (t === 'no' || t === 'false') return 'no';
    return null;
  }

  /** Build a chip element. */
  function createChip(label, value, fieldKey) {
    var chip = document.createElement('span');
    chip.className = CHIP_CLASS + (value === 'yes' ? ' is-yes' : ' is-no');
    chip.setAttribute('data-field', fieldKey);
    chip.setAttribute('data-value', value);
    chip.textContent = label;
    return chip;
  }

  /** Build the inline editor. */
  function createEditor(label, currentValue) {
    var editor = document.createElement('div');
    editor.className = EDITOR_CLASS;

    var labelEl = document.createElement('span');
    labelEl.className = 'scw-chip-label';
    labelEl.textContent = label;
    editor.appendChild(labelEl);

    ['Yes', 'No'].forEach(function (optionText) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-value', optionText.toLowerCase());
      btn.textContent = optionText;
      if (optionText.toLowerCase() === currentValue) {
        btn.className = 'is-active';
      }
      editor.appendChild(btn);
    });

    return editor;
  }

  /**
   * Get the record id for a table row.
   * Knack stores it in the <tr> id attribute as "kn-table-row-ID".
   */
  function getRecordId(tr) {
    var trId = tr.id || '';
    // Knack format: "view_XXX-kn-table-row-ROWID" or just row id in data attr
    var match = trId.match(/[0-9a-f]{24}/i);
    return match ? match[0] : null;
  }

  /**
   * Update a field value using Knack's built-in inline edit mechanism.
   * This triggers Knack's normal save behavior without needing API keys.
   */
  function saveFieldValue(viewId, recordId, fieldKey, boolValue) {
    // Build the data payload as Knack expects
    var data = {};
    // Knack boolean fields accept true/false as values
    data[fieldKey] = boolValue === 'yes';

    // Use Knack's internal model update
    var view = Knack.views[viewId];
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      // Preferred: use the view's own model update (triggers all Knack hooks)
      view.model.updateRecord(recordId, data);
      return;
    }

    // Fallback: use Knack's global ajax helper if available
    if (typeof Knack !== 'undefined' && Knack.models) {
      // Find the model that has this record
      var modelKey = Object.keys(Knack.models).find(function (key) {
        var m = Knack.models[key];
        return m && m.data && m.data.find && m.data.find(function (r) {
          return r.id === recordId;
        });
      });

      if (modelKey) {
        var model = Knack.models[modelKey];
        if (typeof model.save === 'function') {
          data.id = recordId;
          model.save(data);
          return;
        }
      }
    }

    // Last resort: PUT via Knack's built-in ajax (uses session token, no API key)
    $.ajax({
      url: Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
           '/views/' + viewId + '/records/' + recordId,
      type: 'PUT',
      headers: {
        'X-Knack-Application-Id': Knack.application_id,
        'x-knack-rest-api-key': 'knack',
        'Authorization': Knack.getUserToken()
      },
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: function () {
        // Refresh the view to reflect saved data
        if (Knack.views[viewId] && Knack.views[viewId].model &&
            typeof Knack.views[viewId].model.fetch === 'function') {
          Knack.views[viewId].model.fetch();
        }
      },
      error: function (xhr) {
        console.warn('[scw-bool-chips] Save failed for ' + recordId, xhr.responseText);
      }
    });
  }

  // ============================================================
  // CHIP TRANSFORMATION
  // ============================================================

  /** Transform cells in a single view according to its field config. */
  function transformView(viewCfg) {
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;

    var $rows = $view.find('table.kn-table-table tbody tr, table.kn-table tbody tr');
    if (!$rows.length) return;

    viewCfg.fields.forEach(function (fieldCfg) {
      $rows.each(function () {
        var $tr = $(this);
        if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

        var $td = $tr.find('td.' + fieldCfg.fieldKey + ', td[data-field-key="' + fieldCfg.fieldKey + '"]');
        if (!$td.length) return;

        // Idempotency: skip already-processed cells
        if ($td.attr(PROCESSED_ATTR) === '1') {
          // But verify chip is still present (Knack may have replaced the cell contents)
          if ($td.find('.' + CHIP_CLASS).length) return;
        }

        var rawText = $td.text();
        var boolVal = normalizeBool(rawText);
        if (!boolVal) return; // skip unexpected values

        // Replace cell contents with chip
        $td.empty();
        $td.append(createChip(fieldCfg.label, boolVal, fieldCfg.fieldKey));
        $td.attr(PROCESSED_ATTR, '1');
      });
    });
  }

  // ============================================================
  // INLINE EDIT INTERACTION (event delegation)
  // ============================================================

  /** Currently open editor reference for cleanup. */
  var activeEditor = null;

  function closeActiveEditor() {
    if (!activeEditor) return;
    var td = activeEditor.td;
    var cfg = activeEditor.cfg;
    var value = activeEditor.value;

    // Restore chip display
    td.innerHTML = '';
    td.appendChild(createChip(cfg.label, value, cfg.fieldKey));
    td.setAttribute(PROCESSED_ATTR, '1');

    activeEditor = null;
  }

  /** Find field config by fieldKey across all view configs. */
  function findFieldConfig(fieldKey) {
    for (var v = 0; v < BOOL_CHIP_CONFIG.views.length; v++) {
      var viewCfg = BOOL_CHIP_CONFIG.views[v];
      for (var f = 0; f < viewCfg.fields.length; f++) {
        if (viewCfg.fields[f].fieldKey === fieldKey) {
          return { viewId: viewCfg.viewId, field: viewCfg.fields[f] };
        }
      }
    }
    return null;
  }

  /** Find which view config a <td> belongs to. */
  function findViewForCell(td) {
    var $view = $(td).closest('[id^="view_"]');
    if (!$view.length) return null;
    var viewId = $view.attr('id');
    for (var v = 0; v < BOOL_CHIP_CONFIG.views.length; v++) {
      if (BOOL_CHIP_CONFIG.views[v].viewId === viewId) return BOOL_CHIP_CONFIG.views[v];
    }
    return null;
  }

  // Delegate click on chips
  $(document).on('click' + EVENT_NS, '.' + CHIP_CLASS, function (e) {
    e.stopPropagation();
    e.preventDefault();

    var chip = this;
    var td = chip.closest('td');
    if (!td) return;

    var fieldKey = chip.getAttribute('data-field') || '';
    var currentValue = chip.getAttribute('data-value') || 'no';
    var label = chip.textContent;

    // Close any other open editor first
    closeActiveEditor();

    // Find field config
    var viewCfg = findViewForCell(td);
    if (!viewCfg) return;

    var fieldCfg = null;
    for (var i = 0; i < viewCfg.fields.length; i++) {
      if (viewCfg.fields[i].fieldKey === fieldKey) {
        fieldCfg = viewCfg.fields[i];
        break;
      }
    }
    if (!fieldCfg) return;

    // Replace chip with editor
    var editor = createEditor(label, currentValue);
    td.innerHTML = '';
    td.appendChild(editor);
    td.removeAttribute(PROCESSED_ATTR);

    activeEditor = {
      td: td,
      cfg: fieldCfg,
      value: currentValue,
      viewId: viewCfg.viewId
    };
  });

  // Delegate click on editor buttons
  $(document).on('click' + EVENT_NS, '.' + EDITOR_CLASS + ' button', function (e) {
    e.stopPropagation();
    e.preventDefault();

    if (!activeEditor) return;

    var newValue = this.getAttribute('data-value');
    if (!newValue) return;

    var td       = activeEditor.td;
    var fieldCfg = activeEditor.cfg;
    var viewId   = activeEditor.viewId;
    var oldValue = activeEditor.value;

    // Update the tracked value
    activeEditor.value = newValue;

    // Close editor, restore chip with new value
    closeActiveEditor();

    // Save if value changed
    if (newValue !== oldValue) {
      var tr = td.closest('tr');
      var recordId = tr ? getRecordId(tr) : null;
      if (recordId) {
        saveFieldValue(viewId, recordId, fieldCfg.fieldKey, newValue);
      } else {
        console.warn('[scw-bool-chips] Could not determine record ID for save');
      }
    }
  });

  // Close editor when clicking outside
  $(document).on('click' + EVENT_NS, function (e) {
    if (!activeEditor) return;
    if ($(e.target).closest('.' + EDITOR_CLASS).length) return;
    closeActiveEditor();
  });

  // Close editor on Escape
  $(document).on('keydown' + EVENT_NS, function (e) {
    if (e.key === 'Escape' && activeEditor) {
      closeActiveEditor();
    }
  });

  // ============================================================
  // INIT – bind to knack-view-render for each configured view
  // ============================================================
  function init() {
    injectStyles();

    BOOL_CHIP_CONFIG.views.forEach(function (viewCfg) {
      var viewId = viewCfg.viewId;

      // Listen for view renders
      $(document)
        .off('knack-view-render.' + viewId + EVENT_NS)
        .on('knack-view-render.' + viewId + EVENT_NS, function () {
          transformView(viewCfg);
        });

      // Listen for cell updates (inline edits from other scripts)
      $(document)
        .off('knack-cell-update.' + viewId + EVENT_NS)
        .on('knack-cell-update.' + viewId + EVENT_NS, function () {
          // Small delay to let Knack re-render the cell first
          setTimeout(function () { transformView(viewCfg); }, 100);
        });

      // Transform immediately if view is already rendered
      if ($('#' + viewId).length) {
        transformView(viewCfg);
      }
    });
  }

  // Run init on DOM ready (Knack includes jQuery)
  if (document.readyState === 'loading') {
    $(document).ready(init);
  } else {
    init();
  }
})();
// ============================================================
// End Boolean Chips
// ============================================================
