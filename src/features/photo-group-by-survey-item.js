/*************  Photo Grouping by Survey Item  **********************/
/**
 * Explodes a DOC_Photo table view into sections grouped by Survey Item.
 *
 * A single photo record may belong to multiple Survey Items (many-to-many).
 * This feature reads each row, splits its Survey Item values, and renders
 * the row once per Survey Item under a grouped header.
 *
 * Each group header includes an "Add Context Photo" button that opens the
 * Knack create form with the relevant survey item pre-selected.
 *
 * Configuration:
 *   VIEW_CONFIG – maps view IDs to their Survey Item column index (0-based)
 *                 and optional add-photo form settings.
 */
(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════
  // CONFIG — add views here as needed
  // ══════════════════════════════════════════════════════════════════
  var VIEW_CONFIG = {
    // view_XXXX: {
    //   surveyItemColIndex: 0,       // 0-based column index for the Survey Item field
    //   surveyItemFieldClass: '',    // optional: Knack column class e.g. 'field_123'
    //   addPhotoFormHash: '',        // hash for the add-photo form page (without #)
    //   addPhotoSurveyItemField: '', // field key for survey_item in the add form
    //   addPhotoTypeField: '',       // field key for photo_type in the add form
    //   addPhotoTypeValue: 'Context' // default photo type value
    // }
  };

  var EVENT_NS = '.scwPhotoGroupBySurveyItem';
  var CSS_ID = 'scw-photo-group-survey-item-css';

  // CSS class names used in the DOM
  var CLS = {
    wrapper:     'scw-photo-groups',
    section:     'scw-photo-group-section',
    header:      'scw-photo-group-header',
    headerLabel: 'scw-photo-group-header-label',
    addBtn:      'scw-photo-group-add-btn',
    table:       'scw-photo-group-table',
    noItems:     'scw-photo-group-no-items'
  };

  // ══════════════════════════════════════════════════════════════════
  // CSS
  // ══════════════════════════════════════════════════════════════════
  function injectCssOnce() {
    if (document.getElementById(CSS_ID)) return;
    var style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = [
      /* Section wrapper */
      '.' + CLS.section + ' {',
      '  margin-bottom: 16px;',
      '}',

      /* Group header bar */
      '.' + CLS.header + ' {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  padding: 6px 12px;',
      '  background: rgba(237,131,38,1);',
      '  color: #fff;',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  border-radius: 4px 4px 0 0;',
      '}',

      /* Header label */
      '.' + CLS.headerLabel + ' {',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '}',

      /* Add Context Photo button */
      '.' + CLS.addBtn + ' {',
      '  display: inline-block;',
      '  margin-left: 12px;',
      '  padding: 2px 10px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  line-height: 1.6;',
      '  color: #fff;',
      '  background: rgba(255,255,255,.22);',
      '  border: 1px solid rgba(255,255,255,.35);',
      '  border-radius: 4px;',
      '  cursor: pointer;',
      '  white-space: nowrap;',
      '  transition: background 120ms ease;',
      '}',
      '.' + CLS.addBtn + ':hover {',
      '  background: rgba(255,255,255,.38);',
      '}',

      /* Grouped table */
      '.' + CLS.table + ' {',
      '  width: 100%;',
      '  border-collapse: collapse;',
      '}',
      '.' + CLS.table + ' th,',
      '.' + CLS.table + ' td {',
      '  padding: 4px 8px;',
      '  text-align: left;',
      '  border-bottom: 1px solid #e8e8e8;',
      '}',
      '.' + CLS.table + ' thead th {',
      '  background: #f5f5f5;',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  color: #333;',
      '}',

      /* No-items message */
      '.' + CLS.noItems + ' {',
      '  padding: 12px;',
      '  color: #888;',
      '  font-style: italic;',
      '  font-size: 12px;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════════════════════
  // PARSING — extract rows and Survey Item values
  // ══════════════════════════════════════════════════════════════════

  /**
   * Parse the Survey Item text from a cell.
   * Handles: "E-003, E-005", "E-003,E-005", "E-003 , E-005", single values.
   * Returns an array of trimmed, non-empty strings.
   */
  function parseSurveyItems(cellText) {
    if (!cellText || typeof cellText !== 'string') return [];
    return cellText
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  /**
   * Read rows from the Knack table and build a grouping structure.
   *
   * @param {jQuery}  $table          – the kn-table element
   * @param {number}  surveyItemColIdx – 0-based column index for Survey Item
   * @param {string}  [fieldClass]     – optional Knack field class on the <td>
   * @returns {{ headers: string[], groups: Object.<string, Array>, headerRow: Element }}
   *   headers  – column header texts (for rebuilding the table)
   *   groups   – { surveyItemLabel: [{ html, recordId }] }
   *   headerRow – the original <thead> row element
   */
  function buildGroups($table, surveyItemColIdx, fieldClass) {
    var groups = {};
    var headers = [];
    var headerRow = null;

    // Capture header row
    var $thead = $table.find('thead tr').first();
    if ($thead.length) {
      headerRow = $thead[0];
      $thead.find('th').each(function () {
        headers.push(this.textContent.trim());
      });
    }

    // Iterate data rows
    $table.find('tbody tr').each(function () {
      var tr = this;
      var $tr = $(tr);

      // Skip group-header rows from Knack's native grouping
      if ($tr.hasClass('kn-table-group')) return;

      // Determine Survey Item text
      var surveyText = '';
      if (fieldClass) {
        var $cell = $tr.find('td.' + fieldClass);
        if ($cell.length) surveyText = $cell.text();
      }
      if (!surveyText && typeof surveyItemColIdx === 'number') {
        var $cells = $tr.find('td');
        if ($cells.length > surveyItemColIdx) {
          surveyText = $cells.eq(surveyItemColIdx).text();
        }
      }

      var items = parseSurveyItems(surveyText);
      if (items.length === 0) return; // skip rows with no Survey Item

      // Try to extract the Knack record ID from the row
      var recordId = $tr.attr('id') || $tr.data('record-id') || '';

      // Clone the entire row HTML for each group it belongs to
      var rowHtml = tr.outerHTML;

      for (var i = 0; i < items.length; i++) {
        var key = items[i];
        if (!groups[key]) groups[key] = [];
        groups[key].push({ html: rowHtml, recordId: recordId });
      }
    });

    return { headers: headers, groups: groups, headerRow: headerRow };
  }

  // ══════════════════════════════════════════════════════════════════
  // DOM RECONSTRUCTION
  // ══════════════════════════════════════════════════════════════════

  /**
   * Sort group keys naturally (e.g. E-003 before E-005, E-010 after E-009).
   */
  function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  /**
   * Render grouped sections and replace the original table content.
   *
   * @param {jQuery} $view    – the Knack view container
   * @param {Object} result   – output of buildGroups()
   * @param {Object} viewCfg  – this view's entry from VIEW_CONFIG
   */
  function renderGroups($view, result, viewCfg) {
    var groups = result.groups;
    var headerRow = result.headerRow;
    var keys = Object.keys(groups).sort(naturalSort);

    // Build wrapper
    var wrapper = document.createElement('div');
    wrapper.className = CLS.wrapper;

    for (var k = 0; k < keys.length; k++) {
      var surveyItem = keys[k];
      var rows = groups[surveyItem];

      // Section
      var section = document.createElement('div');
      section.className = CLS.section;
      section.setAttribute('data-survey-item', surveyItem);

      // Header bar
      var header = document.createElement('div');
      header.className = CLS.header;

      var label = document.createElement('span');
      label.className = CLS.headerLabel;
      label.textContent = surveyItem;
      header.appendChild(label);

      // "Add Context Photo" button
      if (viewCfg.addPhotoFormHash) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = CLS.addBtn;
        btn.textContent = 'Add Context Photo';
        btn.setAttribute('data-survey-item', surveyItem);
        btn.setAttribute('data-form-hash', viewCfg.addPhotoFormHash);
        header.appendChild(btn);
      }

      section.appendChild(header);

      // Table with cloned rows
      var table = document.createElement('table');
      table.className = CLS.table;

      // Re-use original header row
      if (headerRow) {
        var thead = document.createElement('thead');
        thead.appendChild(headerRow.cloneNode(true));
        table.appendChild(thead);
      }

      var tbody = document.createElement('tbody');
      for (var r = 0; r < rows.length; r++) {
        // Insert cloned row HTML — preserves edit/view/replace action links
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = rows[r].html;
        var clonedRow = tempDiv.firstElementChild;
        if (clonedRow) tbody.appendChild(clonedRow);
      }
      table.appendChild(tbody);
      section.appendChild(table);

      wrapper.appendChild(section);
    }

    // If no groups at all, show a message
    if (keys.length === 0) {
      var msg = document.createElement('div');
      msg.className = CLS.noItems;
      msg.textContent = 'No photo records with Survey Item values found.';
      wrapper.appendChild(msg);
    }

    // Replace the original table with our grouped view.
    // Keep the original view container intact for Knack event handling.
    var $table = $view.find('table.kn-table');
    if ($table.length) {
      $table.replaceWith(wrapper);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // "ADD CONTEXT PHOTO" CLICK HANDLER (delegated)
  // ══════════════════════════════════════════════════════════════════
  $(document)
    .off('click' + EVENT_NS, '.' + CLS.addBtn)
    .on('click' + EVENT_NS, '.' + CLS.addBtn, function (e) {
      e.preventDefault();
      e.stopPropagation();

      var surveyItem = this.getAttribute('data-survey-item') || '';
      var formHash = this.getAttribute('data-form-hash') || '';
      if (!formHash) return;

      // Build the target URL with query parameters
      var params = [];
      params.push('survey_item_id=' + encodeURIComponent(surveyItem));
      params.push('photo_type=Context');

      var url = '#' + formHash + '?' + params.join('&');
      window.location.hash = url.replace(/^#/, '');
    });

  // ══════════════════════════════════════════════════════════════════
  // VIEW RENDER HANDLER
  // ══════════════════════════════════════════════════════════════════
  function handleViewRender(viewId) {
    var viewCfg = VIEW_CONFIG[viewId];
    if (!viewCfg) return;

    var $view = $('#' + viewId);
    if (!$view.length) return;

    var $table = $view.find('table.kn-table');
    if (!$table.length) return;

    // Guard: if we already processed this view instance, skip
    if ($view.find('.' + CLS.wrapper).length) return;

    var result = buildGroups(
      $table,
      viewCfg.surveyItemColIndex,
      viewCfg.surveyItemFieldClass
    );

    renderGroups($view, result, viewCfg);
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT — bind to knack-view-render for each configured view
  // ══════════════════════════════════════════════════════════════════
  injectCssOnce();

  var viewIds = Object.keys(VIEW_CONFIG);
  for (var i = 0; i < viewIds.length; i++) {
    (function (vid) {
      $(document)
        .off('knack-view-render.' + vid + EVENT_NS)
        .on('knack-view-render.' + vid + EVENT_NS, function () {
          handleViewRender(vid);
        });
    })(viewIds[i]);
  }
})();
/*************  Photo Grouping by Survey Item  **************************/
