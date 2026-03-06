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
    view_3561: {
      surveyItemFieldClass: 'field_2419',  // REL_survey line item column
      addPhotoEnabled: true                // show "Add Context Photo" buttons
    }
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
   * Extract Survey Item entries from a table cell.
   *
   * Knack renders many-to-many connection fields as:
   *   <span class="RECORD_ID" data-kn="connection-value">E-003</span>
   *   <br>
   *   <span class="RECORD_ID" data-kn="connection-value">E-005</span>
   *
   * We prefer reading the connection-value spans (includes record IDs).
   * Falls back to comma-splitting plain text for non-connection fields.
   *
   * @param {jQuery} $cell – the <td> element
   * @returns {Array<{ label: string, connId: string }>}
   */
  function parseSurveyItemsFromCell($cell) {
    if (!$cell || !$cell.length) return [];

    // Prefer structured connection-value spans
    var $spans = $cell.find('span[data-kn="connection-value"]');
    if ($spans.length) {
      var items = [];
      $spans.each(function () {
        var label = (this.textContent || '').trim();
        // The span's class attribute holds the connected record ID
        var connId = (this.className || '').trim();
        if (label) items.push({ label: label, connId: connId });
      });
      return items;
    }

    // Fallback: plain text, comma-separated
    var text = ($cell.text() || '').trim();
    if (!text || text === '\u00a0') return []; // &nbsp; or empty
    return text
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; })
      .map(function (s) { return { label: s, connId: '' }; });
  }

  /**
   * Read rows from the Knack table and build a grouping structure.
   *
   * @param {jQuery}  $table     – the kn-table element
   * @param {string}  fieldClass – Knack field class on the <td> (e.g. 'field_2419')
   * @returns {{ groups: Object, headerRow: Element, ungrouped: Array }}
   *   groups     – { surveyItemLabel: [{ html, recordId, connId }] }
   *   headerRow  – the original <thead> row element
   *   ungrouped  – rows with no Survey Item value
   */
  function buildGroups($table, fieldClass) {
    var groups = {};
    var ungrouped = [];
    var headerRow = null;

    // Capture header row
    var $thead = $table.find('thead tr').first();
    if ($thead.length) {
      headerRow = $thead[0];
    }

    // Iterate data rows
    $table.find('tbody tr').each(function () {
      var tr = this;
      var $tr = $(tr);

      // Skip Knack native group-header rows
      if ($tr.hasClass('kn-table-group')) return;

      // Find the Survey Item cell
      var $cell = fieldClass ? $tr.find('td.' + fieldClass) : null;
      var items = parseSurveyItemsFromCell($cell);

      // Extract the Knack record ID from the row's id attribute
      var recordId = $tr.attr('id') || '';

      // Clone the entire row HTML — preserves edit/view/replace action links
      var rowHtml = tr.outerHTML;

      if (items.length === 0) {
        ungrouped.push({ html: rowHtml, recordId: recordId });
        return;
      }

      for (var i = 0; i < items.length; i++) {
        var key = items[i].label;
        if (!groups[key]) groups[key] = [];
        groups[key].push({
          html: rowHtml,
          recordId: recordId,
          connId: items[i].connId
        });
      }
    });

    return { groups: groups, headerRow: headerRow, ungrouped: ungrouped };
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
  /**
   * Build a table element populated with cloned rows.
   */
  function buildRowTable(headerRow, rows) {
    var table = document.createElement('table');
    table.className = CLS.table;

    if (headerRow) {
      var thead = document.createElement('thead');
      thead.appendChild(headerRow.cloneNode(true));
      table.appendChild(thead);
    }

    var tbody = document.createElement('tbody');
    for (var r = 0; r < rows.length; r++) {
      // <tr> elements must be parsed inside a <table><tbody> context,
      // otherwise the browser strips the tr/td tags as invalid.
      var tempTable = document.createElement('table');
      tempTable.innerHTML = '<tbody>' + rows[r].html + '</tbody>';
      var clonedRow = tempTable.querySelector('tbody > tr');
      if (clonedRow) tbody.appendChild(clonedRow);
    }
    table.appendChild(tbody);
    return table;
  }

  function renderGroups($view, result, viewCfg, editPageBasePath) {
    var groups = result.groups;
    var headerRow = result.headerRow;
    var ungrouped = result.ungrouped;
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
      if (editPageBasePath && rows.length && rows[0].connId) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = CLS.addBtn;
        btn.textContent = 'Add Context Photo';
        btn.setAttribute('data-survey-item', surveyItem);
        btn.setAttribute('data-page-path', editPageBasePath);
        btn.setAttribute('data-conn-id', rows[0].connId);
        header.appendChild(btn);
      }

      section.appendChild(header);
      section.appendChild(buildRowTable(headerRow, rows));
      wrapper.appendChild(section);
    }

    // Ungrouped rows (no Survey Item assigned)
    if (ungrouped.length) {
      var ugSection = document.createElement('div');
      ugSection.className = CLS.section;
      ugSection.setAttribute('data-survey-item', '');

      var ugHeader = document.createElement('div');
      ugHeader.className = CLS.header;
      ugHeader.style.background = '#5F6B7A';

      var ugLabel = document.createElement('span');
      ugLabel.className = CLS.headerLabel;
      ugLabel.textContent = 'Unassigned';
      ugHeader.appendChild(ugLabel);

      ugSection.appendChild(ugHeader);
      ugSection.appendChild(buildRowTable(headerRow, ungrouped));
      wrapper.appendChild(ugSection);
    }

    // If nothing at all, show a message
    if (keys.length === 0 && ungrouped.length === 0) {
      var msg = document.createElement('div');
      msg.className = CLS.noItems;
      msg.textContent = 'No photo records found.';
      wrapper.appendChild(msg);
    }

    // Replace the original table wrapper with our grouped view.
    var $tableWrapper = $view.find('.kn-table-wrapper');
    if ($tableWrapper.length) {
      $tableWrapper.replaceWith(wrapper);
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

      var pagePath = this.getAttribute('data-page-path') || '';
      var connId = this.getAttribute('data-conn-id') || '';
      if (!pagePath || !connId) return;

      // Navigate to the edit-site-survey-line-item page for this survey item.
      // That page has an add form for photos connected to the survey item.
      window.location.hash = pagePath + '/edit-site-survey-line-item/' + connId;
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

    // Extract the base path from the first edit link in the table.
    // e.g. "#.../site-survey-request-details/REQ_ID/edit-doc-photo/PHOTO_ID"
    //    → ".../site-survey-request-details/REQ_ID"
    // We strip the last two segments (child page + record ID) to get the
    // parent page path, then append edit-site-survey-line-item/{connId}.
    var editPageBasePath = '';
    if (viewCfg.addPhotoEnabled) {
      var firstEditLink = $table.find('td.kn-table-link a.kn-link-page').first();
      if (firstEditLink.length) {
        var href = firstEditLink.attr('href') || '';
        // Strip leading #, then remove the last two path segments
        // (edit-doc-photo/RECORD_ID) to get the parent page path
        editPageBasePath = href.replace(/^#/, '').replace(/\/[^/]+\/[^/]+$/, '');
      }
    }

    var result = buildGroups($table, viewCfg.surveyItemFieldClass);

    renderGroups($view, result, viewCfg, editPageBasePath);
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
