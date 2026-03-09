// ============================================================
// Boolean Chips – one-click toggle chips (stacked in one column)
// ============================================================
//
// Replaces Yes/No boolean columns with compact chip elements
// stacked vertically inside a single "host" column. The other
// source columns are hidden. Clicking a chip instantly toggles
// the value (Yes↔No) and saves via Knack's internal APIs.
// Knack's native inline-edit popup is suppressed for these cells.
//
// CONFIGURATION
//   Edit BOOL_CHIP_CONFIG below to add views and fields.
//   `hostFieldKey` is the column where all chips are rendered.
//   `hideFieldKeys` lists columns to hide (their data is read first).
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
        // All chips render stacked inside the Exterior column
        hostFieldKey: 'field_2372',
        // These columns get hidden (header + cells)
        hideFieldKeys: ['field_2370', 'field_2371'],
        fields: [
          { label: 'Exterior',         fieldKey: 'field_2372' },
          { label: 'Existing Cabling', fieldKey: 'field_2370' },
          { label: 'Plenum',           fieldKey: 'field_2371' }
        ]
      },
      {
        viewId: 'view_3505',
        hostFieldKey: 'field_2372',
        hideFieldKeys: ['field_2370', 'field_2371'],
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
  var CHIP_STACK     = 'scw-chip-stack';
  var PROCESSED_ATTR = 'data-scw-chip-processed';
  var EVENT_NS       = '.scwBoolChips';

  // ============================================================
  // CSS – injected once
  // ============================================================
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var hiddenSelectors = [];
    BOOL_CHIP_CONFIG.views.forEach(function (viewCfg) {
      (viewCfg.hideFieldKeys || []).forEach(function (fk) {
        var sel = '#' + viewCfg.viewId;
        hiddenSelectors.push(sel + ' th.' + fk);
        hiddenSelectors.push(sel + ' td.' + fk);
        hiddenSelectors.push(sel + ' th[data-field-key="' + fk + '"]');
        hiddenSelectors.push(sel + ' td[data-field-key="' + fk + '"]');
      });
    });

    var css = [
      /* ---- chip stack container ---- */
      '.' + CHIP_STACK + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 3px;',
      '}',

      /* ---- base chip ---- */
      '.' + CHIP_CLASS + ' {',
      '  display: inline-block;',
      '  padding: 1px 8px;',
      '  border-radius: 10px;',
      '  font-size: 11px;',
      '  font-weight: 500;',
      '  line-height: 1.5;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  transition: background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;',
      '  white-space: nowrap;',
      '  border: 1px solid transparent;',
      '  text-align: center;',
      '}',

      /* ---- yes state (warm amber — action, not warning) ---- */
      '.' + CHIP_CLASS + '.is-yes {',
      '  background-color: #fffbeb;',
      '  color: #92400e;',
      '  border-color: #fde68a;',
      '}',
      '.' + CHIP_CLASS + '.is-yes:hover {',
      '  background-color: #fef3c7;',
      '  box-shadow: 0 1px 3px rgba(146,64,14,0.15);',
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

      /* ---- saving flash ---- */
      '.' + CHIP_CLASS + '.is-saving {',
      '  opacity: 0.6;',
      '  pointer-events: none;',
      '}',

      /* ---- suppress Knack inline-edit on managed cells ---- */
      'td[' + PROCESSED_ATTR + '] .kn-edit-col,',
      'td[' + PROCESSED_ATTR + '] .kn-td-edit {',
      '  display: none !important;',
      '}'
    ];

    /* ---- hide source columns ---- */
    if (hiddenSelectors.length) {
      css.push(hiddenSelectors.join(',\n') + ' {');
      css.push('  display: none !important;');
      css.push('}');
    }

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css.join('\n');
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

  /**
   * Get the record id for a table row.
   */
  function getRecordId(tr) {
    var trId = tr.id || '';
    var match = trId.match(/[0-9a-f]{24}/i);
    return match ? match[0] : null;
  }

  /**
   * Update a field value via Knack's internal APIs.
   */
  function saveFieldValue(viewId, recordId, fieldKey, boolValue) {
    var data = {};
    data[fieldKey] = boolValue === 'yes';

    var view = Knack.views[viewId];
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      view.model.updateRecord(recordId, data);
      return;
    }

    if (typeof Knack !== 'undefined' && Knack.models) {
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

  // ============================================================
  // CHIP TRANSFORMATION — stacked in host column
  // ============================================================

  /**
   * Read a boolean value from a (possibly hidden) cell in the row.
   */
  function readBoolFromRow($tr, fieldKey) {
    var $td = $tr.find('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]');
    if (!$td.length) return null;
    // If this cell already has a chip, read from the chip's data-value
    var $chip = $td.find('.' + CHIP_CLASS);
    if ($chip.length) return $chip.attr('data-value') || null;
    // Otherwise read raw text
    return normalizeBool($td.text());
  }

  /** Transform rows: stack all field chips into the host column. */
  function transformView(viewCfg) {
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;

    var hostFK = viewCfg.hostFieldKey;
    var $rows = $view.find('table.kn-table-table tbody tr, table.kn-table tbody tr');
    if (!$rows.length) return;

    // Rename the host column header to something generic
    var $hostTh = $view.find('th.' + hostFK + ', th[data-field-key="' + hostFK + '"]');
    if ($hostTh.length && !$hostTh.attr('data-scw-relabeled')) {
      $hostTh.find('.kn-sort-link, a').first().text('Survey');
      $hostTh.attr('data-scw-relabeled', '1');
    }

    $rows.each(function () {
      var $tr = $(this);
      if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

      var $hostTd = $tr.find('td.' + hostFK + ', td[data-field-key="' + hostFK + '"]');
      if (!$hostTd.length) return;

      // Skip if already processed and chips still present
      if ($hostTd.attr(PROCESSED_ATTR) === '1' && $hostTd.find('.' + CHIP_CLASS).length) return;

      // Read boolean values for ALL fields from their respective cells
      var chipData = [];
      viewCfg.fields.forEach(function (fieldCfg) {
        var val = readBoolFromRow($tr, fieldCfg.fieldKey);
        if (val) {
          chipData.push({ label: fieldCfg.label, value: val, fieldKey: fieldCfg.fieldKey });
        }
      });

      if (!chipData.length) return;

      // Build the stacked chip container
      var stack = document.createElement('div');
      stack.className = CHIP_STACK;
      chipData.forEach(function (d) {
        stack.appendChild(createChip(d.label, d.value, d.fieldKey));
      });

      $hostTd.empty().append(stack);
      $hostTd.attr(PROCESSED_ATTR, '1');
    });
  }

  // ============================================================
  // ONE-CLICK TOGGLE
  // ============================================================
  // We use a single capturing-phase click listener that:
  //   1. Stops Knack's inline-edit from opening (stopPropagation)
  //   2. Performs the toggle + save directly
  // A jQuery delegated handler would never fire because
  // stopPropagation in capture phase kills bubbling.

  function handleChipToggle(chip) {
    var td = chip.closest('td');
    if (!td) return;

    var fieldKey     = chip.getAttribute('data-field') || '';
    var currentValue = chip.getAttribute('data-value') || 'no';
    var newValue     = currentValue === 'yes' ? 'no' : 'yes';

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

    // Instantly update just this chip in-place
    var newChip = createChip(fieldCfg.label, newValue, fieldCfg.fieldKey);
    newChip.classList.add('is-saving');
    chip.parentNode.replaceChild(newChip, chip);

    setTimeout(function () { newChip.classList.remove('is-saving'); }, 400);

    // Also update the hidden source cell so re-renders stay in sync
    var $tr = $(td).closest('tr');
    var $srcTd = $tr.find('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]').not(td);
    if ($srcTd.length) {
      $srcTd.text(newValue === 'yes' ? 'Yes' : 'No');
    }

    // Save
    var tr = td.closest('tr');
    var recordId = tr ? getRecordId(tr) : null;
    if (recordId) {
      saveFieldValue(viewCfg.viewId, recordId, fieldCfg.fieldKey, newValue);
    } else {
      console.warn('[scw-bool-chips] Could not determine record ID for save');
    }
  }

  // Capture-phase click: block Knack + toggle
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.' + CHIP_CLASS);
    if (!chip) return;
    var td = chip.closest('td');
    if (!td || !td.hasAttribute(PROCESSED_ATTR)) return;

    e.stopPropagation();
    e.preventDefault();
    handleChipToggle(chip);
  }, true);

  // Capture-phase mousedown: block Knack's inline-edit trigger
  document.addEventListener('mousedown', function (e) {
    var chip = e.target.closest('.' + CHIP_CLASS);
    if (!chip) return;
    var td = chip.closest('td');
    if (!td || !td.hasAttribute(PROCESSED_ATTR)) return;

    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ============================================================
  // INIT – bind to knack-view-render for each configured view
  // ============================================================
  function init() {
    injectStyles();

    BOOL_CHIP_CONFIG.views.forEach(function (viewCfg) {
      var viewId = viewCfg.viewId;

      $(document)
        .off('knack-view-render.' + viewId + EVENT_NS)
        .on('knack-view-render.' + viewId + EVENT_NS, function () {
          transformView(viewCfg);
        });

      $(document)
        .off('knack-cell-update.' + viewId + EVENT_NS)
        .on('knack-cell-update.' + viewId + EVENT_NS, function () {
          setTimeout(function () { transformView(viewCfg); }, 100);
        });

      if ($('#' + viewId).length) {
        transformView(viewCfg);
      }
    });
  }

  if (document.readyState === 'loading') {
    $(document).ready(init);
  } else {
    init();
  }
})();
// ============================================================
// End Boolean Chips
// ============================================================
