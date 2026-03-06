// ============================================================
// Boolean Chips – one-click toggle chips
// ============================================================
//
// Replaces Yes/No text in boolean field cells with compact chip
// elements that show the field label and indicate state via color.
// Clicking a chip instantly toggles the value (Yes↔No) and saves.
// Knack's native inline-edit popup is suppressed for these cells.
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
  var PROCESSED_ATTR = 'data-scw-chip-processed';
  var EVENT_NS       = '.scwBoolChips';

  // Build a set of managed field keys for quick lookup
  var MANAGED_FIELDS = {};
  BOOL_CHIP_CONFIG.views.forEach(function (v) {
    v.fields.forEach(function (f) { MANAGED_FIELDS[f.fieldKey] = true; });
  });

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

  /**
   * Get the record id for a table row.
   * Knack stores it in the <tr> id attribute as "kn-table-row-ID".
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

    // Use Knack's internal model update
    var view = Knack.views[viewId];
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      view.model.updateRecord(recordId, data);
      return;
    }

    // Fallback: use Knack's global ajax helper if available
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

    // Last resort: PUT via Knack's built-in ajax
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
          if ($td.find('.' + CHIP_CLASS).length) return;
        }

        var rawText = $td.text();
        var boolVal = normalizeBool(rawText);
        if (!boolVal) return;

        // Replace cell contents with chip
        $td.empty();
        $td.append(createChip(fieldCfg.label, boolVal, fieldCfg.fieldKey));
        $td.attr(PROCESSED_ATTR, '1');
      });
    });
  }

  // ============================================================
  // ONE-CLICK TOGGLE (event delegation)
  // ============================================================

  // Block Knack's inline-edit from triggering on managed cells.
  // We use a capturing listener so we fire BEFORE Knack's delegated handlers.
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.' + CHIP_CLASS);
    if (!chip) return;

    var td = chip.closest('td');
    if (!td || !td.hasAttribute(PROCESSED_ATTR)) return;

    // Stop the event from reaching Knack's inline-edit handlers
    e.stopPropagation();
    e.preventDefault();
  }, true); // <-- capturing phase

  // Also suppress mousedown (Knack sometimes binds inline-edit on mousedown)
  document.addEventListener('mousedown', function (e) {
    var chip = e.target.closest('.' + CHIP_CLASS);
    if (!chip) return;

    var td = chip.closest('td');
    if (!td || !td.hasAttribute(PROCESSED_ATTR)) return;

    e.stopPropagation();
    e.preventDefault();
  }, true);

  // Our own click handler via jQuery delegation (bubbling phase, fires after capture block)
  $(document).on('click' + EVENT_NS, '.' + CHIP_CLASS, function (e) {
    e.stopPropagation();
    e.preventDefault();

    var chip = this;
    var td = chip.closest('td');
    if (!td) return;

    var fieldKey     = chip.getAttribute('data-field') || '';
    var currentValue = chip.getAttribute('data-value') || 'no';
    var newValue     = currentValue === 'yes' ? 'no' : 'yes';

    // Find config
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

    // Instantly update the chip UI
    var newChip = createChip(fieldCfg.label, newValue, fieldCfg.fieldKey);
    newChip.classList.add('is-saving');
    td.innerHTML = '';
    td.appendChild(newChip);
    td.setAttribute(PROCESSED_ATTR, '1');

    // Remove saving indicator after a short delay
    setTimeout(function () { newChip.classList.remove('is-saving'); }, 400);

    // Save the new value
    var tr = td.closest('tr');
    var recordId = tr ? getRecordId(tr) : null;
    if (recordId) {
      saveFieldValue(viewCfg.viewId, recordId, fieldCfg.fieldKey, newValue);
    } else {
      console.warn('[scw-bool-chips] Could not determine record ID for save');
    }
  });

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
