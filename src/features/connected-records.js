/*** CONNECTED RECORDS EDITOR ***/
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  var STYLE_ID = 'scw-connected-records-css';

  var CONFIG = {
    views: [
      {
        parentViewId: 'view_3313',
        connectionField: 'field_1963',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item'
      }
    ]
  };

  // ============================================================
  // CSS
  // ============================================================

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = `
      .scw-cr-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 200px;
      }

      .scw-cr-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 6px;
        border-radius: 4px;
        background: rgba(0,0,0,0.03);
        transition: background 0.15s;
      }
      .scw-cr-item:hover {
        background: rgba(0,0,0,0.06);
      }

      .scw-cr-link {
        flex: 1;
        font-size: 12px;
        line-height: 1.3;
        color: #1a73e8;
        text-decoration: none;
        padding: 2px 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 280px;
        cursor: pointer;
      }
      .scw-cr-link:hover {
        text-decoration: underline;
      }

      .scw-cr-add {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: none;
        border: 1px dashed rgba(0,0,0,0.2);
        border-radius: 4px;
        cursor: pointer;
        color: #666;
        font-size: 11px;
        padding: 3px 8px;
        margin-top: 2px;
        transition: color 0.15s, border-color 0.15s;
      }
      .scw-cr-add:hover {
        color: #1a73e8;
        border-color: #1a73e8;
      }

      .scw-cr-empty {
        font-size: 11px;
        color: #999;
        font-style: italic;
        padding: 2px 4px;
      }
    `;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // DOM READING
  // ============================================================

  /**
   * Extract connection links from the field_1963 <td> element.
   * Returns [{text, href}] from <a data-kn="connection-link"> tags.
   */
  function readConnectionLinks(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    if (!td) return [];

    var anchors = td.querySelectorAll('a[data-kn="connection-link"]');
    var links = [];
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var span = a.querySelector('span[data-kn="connection-value"]');
      var text = span ? span.textContent.trim() : a.textContent.trim();
      if (text && text !== '&nbsp;' && text !== '\u00a0') {
        links.push({ text: text, href: a.getAttribute('href') || '' });
      }
    }
    return links;
  }

  /**
   * Find the add-accessory-line-item URL from the row's link columns.
   */
  function findAddUrl(tr, slug) {
    var anchors = tr.querySelectorAll('td.kn-table-link a');
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute('href') || '';
      if (href.indexOf(slug) !== -1) return href;
    }
    return '';
  }

  // ============================================================
  // WIDGET BUILDER
  // ============================================================

  function findConfig(viewId) {
    for (var i = 0; i < CONFIG.views.length; i++) {
      if (CONFIG.views[i].parentViewId === viewId) return CONFIG.views[i];
    }
    return null;
  }

  /**
   * Build the connected-records widget for a detail panel.
   * Called from device-worksheet.js renderDetailField.
   * @param {string} viewId   - Parent view ID (e.g. 'view_3313')
   * @param {string} recordId - Parent record ID (24-char hex)
   * @param {string} fieldKey - Connection field key (e.g. 'field_1963')
   * @param {HTMLElement} tr  - The original Knack table row
   * @returns {HTMLElement|null}
   */
  function buildWidget(viewId, recordId, fieldKey, tr) {
    var cfg = findConfig(viewId);
    if (!cfg || !tr) return null;

    var container = document.createElement('div');
    container.className = 'scw-ws-field';

    // Label
    var label = document.createElement('div');
    label.className = 'scw-ws-field-label';
    label.textContent = cfg.label;
    container.appendChild(label);

    // Value container (the list)
    var valueDiv = document.createElement('div');
    valueDiv.className = 'scw-ws-field-value scw-cr-list';
    container.appendChild(valueDiv);

    // Read links from DOM
    var links = readConnectionLinks(tr, fieldKey);
    var addUrl = findAddUrl(tr, cfg.addSlug);

    // Render items
    if (links.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'scw-cr-empty';
      empty.textContent = '\u2014';
      valueDiv.appendChild(empty);
    } else {
      for (var i = 0; i < links.length; i++) {
        var item = document.createElement('div');
        item.className = 'scw-cr-item';

        var a = document.createElement('a');
        a.className = 'scw-cr-link';
        a.textContent = links[i].text;
        a.title = links[i].text;
        a.href = links[i].href;
        item.appendChild(a);

        valueDiv.appendChild(item);
      }
    }

    // "+ Add" button
    if (addUrl) {
      var addBtn = document.createElement('a');
      addBtn.className = 'scw-cr-add';
      addBtn.textContent = '+ Add';
      addBtn.href = addUrl;
      valueDiv.appendChild(addBtn);
    }

    return container;
  }

  // ============================================================
  // AUTO-POPULATE PARENT CONNECTION ON ADD FORM
  // ============================================================
  //
  // When add-accessory-line-item form (view_3580) renders,
  // grab the parent scope line item ID from the URL hash
  // and set field_2464 (connection back to parent).

  $(document).on('knack-view-render.view_3580', function (event, view, data) {
    var hash = window.location.hash || '';
    // URL: #.../add-accessory-line-item/{parentRecordId}
    var match = hash.match(/add-accessory-line-item\/([a-f0-9]{24})/);
    if (!match) return;

    var parentId = match[1];

    setTimeout(function () {
      // field_2464 is a Chosen.js connection select — set the <select> value,
      // update the hidden connection input, and trigger Chosen to refresh.
      var $select = $('#view_3580-field_2464');
      var $hidden = $('#kn-input-field_2464 input.connection[name="field_2464"]');

      $select.val(parentId);
      $select.trigger('chosen:updated');
      $select.trigger('liszt:updated');
      $hidden.val(parentId);
    }, 1);
  });

  // ============================================================
  // PUBLIC API
  // ============================================================

  window.SCW = window.SCW || {};
  SCW.connectedRecords = {
    buildWidget: function (viewId, recordId, fieldKey, tr) {
      injectStyles();
      return buildWidget(viewId, recordId, fieldKey, tr);
    }
  };

})();
