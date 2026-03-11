/*** CONNECTED RECORDS EDITOR ***/
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  var STYLE_ID = 'scw-connected-records-css';
  var NS = '.scwConnRec';

  var CONFIG = {
    views: [
      {
        parentViewId: 'view_3313',
        connectionField: 'field_1963',   // self-referential connection to child SOW line items
        productField: 'field_1949',      // product connection on child record
        label: 'Mounting\nHardware'
      }
    ]
  };

  // ============================================================
  // OBJECT KEY DISCOVERY
  // ============================================================

  var _lineItemObjKey = null;
  var _productObjKey = null;

  function discoverObjectKeys() {
    if (_lineItemObjKey && _productObjKey) return;

    // Line item object key from view metadata
    if (!_lineItemObjKey) {
      try {
        var v = Knack.views['view_3313'];
        if (v && v.model && v.model.view && v.model.view.source) {
          _lineItemObjKey = v.model.view.source.object;
        }
      } catch (e) { /* will retry */ }
    }

    // Product object key from field_1949 relationship definition
    if (!_productObjKey && typeof Knack !== 'undefined' && Knack.objects) {
      var models = Knack.objects.models || [];
      for (var i = 0; i < models.length; i++) {
        var fields = models[i].attributes.fields || [];
        for (var j = 0; j < fields.length; j++) {
          if (fields[j].key === 'field_1949' && fields[j].relationship) {
            _productObjKey = fields[j].relationship.object;
            break;
          }
        }
        if (_productObjKey) break;
      }
    }
  }

  // ============================================================
  // KNACK API HELPERS
  // ============================================================

  function knackHeaders() {
    return {
      'X-Knack-Application-Id': Knack.application_id,
      'x-knack-rest-api-key': 'knack',
      'Authorization': Knack.getUserToken()
    };
  }

  /** Search products by keyword. Returns array of {id, identifier}. */
  function searchProducts(keyword, callback) {
    discoverObjectKeys();
    if (!_productObjKey) {
      console.warn('[scw-cr] Product object key not found');
      callback([]);
      return;
    }

    var url = Knack.api_url + '/v1/objects/' + _productObjKey + '/records' +
      '?rows_per_page=20&keyword=' + encodeURIComponent(keyword);

    $.ajax({
      url: url,
      type: 'GET',
      headers: knackHeaders(),
      success: function (resp) {
        var results = [];
        var records = resp.records || [];
        for (var i = 0; i < records.length; i++) {
          results.push({
            id: records[i].id,
            identifier: records[i].field_1943 || records[i].identifier || records[i].id
          });
        }
        callback(results);
      },
      error: function (xhr) {
        console.warn('[scw-cr] Product search failed', xhr.responseText);
        callback([]);
      }
    });
  }

  /** Update the product (field_1949) on a child record. */
  function updateChildProduct(childRecordId, productId, productName, callback) {
    discoverObjectKeys();
    if (!_lineItemObjKey) { callback(false); return; }

    var data = {};
    data['field_1949'] = [productId];

    $.ajax({
      url: Knack.api_url + '/v1/objects/' + _lineItemObjKey + '/records/' + childRecordId,
      type: 'PUT',
      headers: knackHeaders(),
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: function () { callback(true); },
      error: function (xhr) {
        console.warn('[scw-cr] Update product failed', xhr.responseText);
        callback(false);
      }
    });
  }

  /** Delete a child record. */
  function deleteChildRecord(childRecordId, callback) {
    discoverObjectKeys();
    if (!_lineItemObjKey) { callback(false); return; }

    $.ajax({
      url: Knack.api_url + '/v1/objects/' + _lineItemObjKey + '/records/' + childRecordId,
      type: 'DELETE',
      headers: knackHeaders(),
      success: function () { callback(true); },
      error: function (xhr) {
        console.warn('[scw-cr] Delete failed', xhr.responseText);
        callback(false);
      }
    });
  }

  /** Create a new child record with a product, then connect it to the parent. */
  function createChildRecord(parentRecordId, productId, viewId, connectionField, callback) {
    discoverObjectKeys();
    if (!_lineItemObjKey) { callback(false); return; }

    // Step 1: Create the new child record with the product set
    var childData = {};
    childData['field_1949'] = [productId];

    $.ajax({
      url: Knack.api_url + '/v1/objects/' + _lineItemObjKey + '/records',
      type: 'POST',
      headers: knackHeaders(),
      contentType: 'application/json',
      data: JSON.stringify(childData),
      success: function (resp) {
        var newChildId = resp.id;
        if (!newChildId) { callback(false); return; }

        // Step 2: Add the new child to the parent's connection field
        var existingIds = getConnectedRecordIds(viewId, parentRecordId, connectionField);
        existingIds.push(newChildId);

        var parentData = {};
        parentData[connectionField] = existingIds;

        $.ajax({
          url: Knack.api_url + '/v1/objects/' + _lineItemObjKey + '/records/' + parentRecordId,
          type: 'PUT',
          headers: knackHeaders(),
          contentType: 'application/json',
          data: JSON.stringify(parentData),
          success: function () { callback(true, newChildId); },
          error: function (xhr) {
            console.warn('[scw-cr] Parent connection update failed', xhr.responseText);
            callback(false);
          }
        });
      },
      error: function (xhr) {
        console.warn('[scw-cr] Create child failed', xhr.responseText);
        callback(false);
      }
    });
  }

  // ============================================================
  // DATA READING
  // ============================================================

  /** Get connected record objects [{id, identifier}] from Knack view model. */
  function getConnectedRecords(viewId, recordId, connectionField) {
    try {
      var v = Knack.views[viewId];
      if (!v || !v.model || !v.model.data) return [];
      var models = v.model.data.models || v.model.data;
      for (var i = 0; i < models.length; i++) {
        var rec = models[i].attributes || models[i];
        if (rec.id === recordId) {
          return rec[connectionField + '_raw'] || [];
        }
      }
    } catch (e) {
      console.warn('[scw-cr] Error reading connected records', e);
    }
    return [];
  }

  /** Get just the IDs of connected records (for connection updates). */
  function getConnectedRecordIds(viewId, recordId, connectionField) {
    var records = getConnectedRecords(viewId, recordId, connectionField);
    var ids = [];
    for (var i = 0; i < records.length; i++) {
      ids.push(records[i].id);
    }
    return ids;
  }

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

      .scw-cr-product {
        flex: 1;
        cursor: pointer;
        font-size: 12px;
        line-height: 1.3;
        color: #333;
        padding: 2px 4px;
        border-bottom: 1px dashed rgba(0,0,0,0.2);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 280px;
      }
      .scw-cr-product:hover {
        color: #1a73e8;
        border-bottom-color: #1a73e8;
      }

      .scw-cr-delete {
        flex-shrink: 0;
        background: none;
        border: none;
        cursor: pointer;
        color: #999;
        padding: 2px 4px;
        font-size: 11px;
        line-height: 1;
        border-radius: 3px;
        transition: color 0.15s, background 0.15s;
      }
      .scw-cr-delete:hover {
        color: #d32f2f;
        background: rgba(211,47,47,0.08);
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

      /* ── Product picker (autocomplete) ── */
      .scw-cr-picker {
        position: relative;
        margin-top: 4px;
      }
      .scw-cr-search {
        width: 100%;
        padding: 4px 8px;
        font-size: 12px;
        border: 1px solid #ccc;
        border-radius: 4px;
        outline: none;
        box-sizing: border-box;
      }
      .scw-cr-search:focus {
        border-color: #1a73e8;
        box-shadow: 0 0 0 2px rgba(26,115,232,0.15);
      }
      .scw-cr-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 200px;
        overflow-y: auto;
        background: #fff;
        border: 1px solid #ddd;
        border-top: none;
        border-radius: 0 0 4px 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        display: none;
      }
      .scw-cr-dropdown.is-open {
        display: block;
      }
      .scw-cr-option {
        padding: 6px 8px;
        font-size: 12px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .scw-cr-option:last-child {
        border-bottom: none;
      }
      .scw-cr-option:hover,
      .scw-cr-option.is-active {
        background: #e8f0fe;
        color: #1a73e8;
      }
      .scw-cr-option--empty {
        color: #999;
        font-style: italic;
        cursor: default;
      }
      .scw-cr-option--loading {
        color: #999;
        font-style: italic;
        cursor: wait;
      }

      /* ── Status indicators ── */
      .scw-cr-item.is-saving {
        opacity: 0.5;
        pointer-events: none;
      }
      .scw-cr-item.is-error {
        background: rgba(211,47,47,0.08);
      }
    `;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
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
   * Called from device-worksheet.js buildSimpleDetailPanel.
   * Returns a DOM element (div.scw-ws-field) or null.
   */
  function buildWidget(viewId, recordId, fieldKey) {
    var cfg = findConfig(viewId);
    if (!cfg) return null;

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

    // Load & render connected records
    var records = getConnectedRecords(viewId, recordId, fieldKey);
    renderRecordList(valueDiv, records, viewId, recordId, cfg);

    return container;
  }

  // ============================================================
  // RENDER
  // ============================================================

  function renderRecordList(container, records, viewId, parentRecordId, cfg) {
    container.innerHTML = '';

    for (var i = 0; i < records.length; i++) {
      (function (rec) {
        var item = document.createElement('div');
        item.className = 'scw-cr-item';
        item.setAttribute('data-record-id', rec.id);

        // Product label (clickable to edit)
        var productLabel = document.createElement('span');
        productLabel.className = 'scw-cr-product';
        productLabel.textContent = rec.identifier || '\u2014';
        productLabel.title = rec.identifier || '';
        productLabel.addEventListener('click', function () {
          openProductPicker(item, productLabel, rec.id, cfg, viewId, parentRecordId);
        });
        item.appendChild(productLabel);

        // Delete button
        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'scw-cr-delete';
        deleteBtn.innerHTML = '<i class="fa fa-trash"></i>';
        deleteBtn.title = 'Remove';
        deleteBtn.addEventListener('click', function () {
          handleDelete(item, rec.id, viewId, parentRecordId, cfg, container);
        });
        item.appendChild(deleteBtn);

        container.appendChild(item);
      })(records[i]);
    }

    // Add button
    var addBtn = document.createElement('button');
    addBtn.className = 'scw-cr-add';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', function () {
      openAddPicker(container, addBtn, cfg, viewId, parentRecordId);
    });
    container.appendChild(addBtn);
  }

  // ============================================================
  // PRODUCT PICKER (Autocomplete)
  // ============================================================

  /** Close any open pickers. */
  function closeAllPickers() {
    var existing = document.querySelectorAll('.scw-cr-picker');
    for (var i = 0; i < existing.length; i++) {
      existing[i].remove();
    }
  }

  /** Open a product picker inline, replacing the product label. */
  function openProductPicker(itemEl, labelEl, childRecordId, cfg, viewId, parentRecordId) {
    closeAllPickers();

    var wrapper = document.createElement('div');
    wrapper.className = 'scw-cr-picker';

    var input = document.createElement('input');
    input.className = 'scw-cr-search';
    input.placeholder = 'Search products\u2026';
    input.value = '';
    wrapper.appendChild(input);

    var dropdown = document.createElement('div');
    dropdown.className = 'scw-cr-dropdown';
    wrapper.appendChild(dropdown);

    // Hide the label, show picker in its place
    labelEl.style.display = 'none';
    itemEl.insertBefore(wrapper, labelEl.nextSibling);

    input.focus();

    var debounceTimer;
    var activeIndex = -1;
    var currentResults = [];

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var keyword = input.value.trim();
      if (keyword.length < 2) {
        dropdown.classList.remove('is-open');
        return;
      }
      showLoading(dropdown);
      debounceTimer = setTimeout(function () {
        searchProducts(keyword, function (results) {
          currentResults = results;
          activeIndex = -1;
          renderDropdownOptions(dropdown, results, function (product) {
            // Selected a product — save it
            closeAllPickers();
            labelEl.style.display = '';
            labelEl.textContent = product.identifier;
            labelEl.title = product.identifier;
            itemEl.classList.add('is-saving');

            updateChildProduct(childRecordId, product.id, product.identifier, function (ok) {
              itemEl.classList.remove('is-saving');
              if (!ok) {
                itemEl.classList.add('is-error');
                setTimeout(function () { itemEl.classList.remove('is-error'); }, 2000);
              }
            });
          });
        });
      }, 300);
    });

    // Keyboard navigation
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAllPickers();
        labelEl.style.display = '';
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (activeIndex < currentResults.length - 1) {
          activeIndex++;
          highlightOption(dropdown, activeIndex);
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeIndex > 0) {
          activeIndex--;
          highlightOption(dropdown, activeIndex);
        }
      }
      if (e.key === 'Enter' && activeIndex >= 0 && currentResults[activeIndex]) {
        e.preventDefault();
        var opts = dropdown.querySelectorAll('.scw-cr-option:not(.scw-cr-option--empty):not(.scw-cr-option--loading)');
        if (opts[activeIndex]) opts[activeIndex].click();
      }
    });

    // Close on outside click
    setTimeout(function () {
      document.addEventListener('mousedown', function handler(e) {
        if (!wrapper.contains(e.target)) {
          closeAllPickers();
          labelEl.style.display = '';
          document.removeEventListener('mousedown', handler);
        }
      });
    }, 0);
  }

  /** Open a product picker for adding a new connected record. */
  function openAddPicker(listContainer, addBtn, cfg, viewId, parentRecordId) {
    closeAllPickers();

    var wrapper = document.createElement('div');
    wrapper.className = 'scw-cr-picker';

    var input = document.createElement('input');
    input.className = 'scw-cr-search';
    input.placeholder = 'Search products\u2026';
    wrapper.appendChild(input);

    var dropdown = document.createElement('div');
    dropdown.className = 'scw-cr-dropdown';
    wrapper.appendChild(dropdown);

    // Insert before the add button
    listContainer.insertBefore(wrapper, addBtn);
    addBtn.style.display = 'none';
    input.focus();

    var debounceTimer;
    var activeIndex = -1;
    var currentResults = [];

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var keyword = input.value.trim();
      if (keyword.length < 2) {
        dropdown.classList.remove('is-open');
        return;
      }
      showLoading(dropdown);
      debounceTimer = setTimeout(function () {
        searchProducts(keyword, function (results) {
          currentResults = results;
          activeIndex = -1;
          renderDropdownOptions(dropdown, results, function (product) {
            closeAllPickers();
            addBtn.style.display = '';

            // Show a temporary "saving" item
            var tempItem = document.createElement('div');
            tempItem.className = 'scw-cr-item is-saving';
            var tempLabel = document.createElement('span');
            tempLabel.className = 'scw-cr-product';
            tempLabel.textContent = product.identifier;
            tempItem.appendChild(tempLabel);
            listContainer.insertBefore(tempItem, addBtn);

            createChildRecord(parentRecordId, product.id, viewId, cfg.connectionField, function (ok, newId) {
              if (ok) {
                // Refresh: re-read model and rebuild list
                tempItem.remove();
                var records = getConnectedRecords(viewId, parentRecordId, cfg.connectionField);
                // If the model hasn't updated yet, add optimistically
                if (newId && !records.some(function (r) { return r.id === newId; })) {
                  records.push({ id: newId, identifier: product.identifier });
                }
                renderRecordList(listContainer, records, viewId, parentRecordId, cfg);
              } else {
                tempItem.classList.remove('is-saving');
                tempItem.classList.add('is-error');
                setTimeout(function () { tempItem.remove(); }, 2000);
              }
            });
          });
        });
      }, 300);
    });

    // Keyboard navigation
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAllPickers();
        addBtn.style.display = '';
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (activeIndex < currentResults.length - 1) {
          activeIndex++;
          highlightOption(dropdown, activeIndex);
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeIndex > 0) {
          activeIndex--;
          highlightOption(dropdown, activeIndex);
        }
      }
      if (e.key === 'Enter' && activeIndex >= 0 && currentResults[activeIndex]) {
        e.preventDefault();
        var opts = dropdown.querySelectorAll('.scw-cr-option:not(.scw-cr-option--empty):not(.scw-cr-option--loading)');
        if (opts[activeIndex]) opts[activeIndex].click();
      }
    });

    // Close on outside click
    setTimeout(function () {
      document.addEventListener('mousedown', function handler(e) {
        if (!wrapper.contains(e.target)) {
          closeAllPickers();
          addBtn.style.display = '';
          document.removeEventListener('mousedown', handler);
        }
      });
    }, 0);
  }

  // ============================================================
  // DROPDOWN RENDERING
  // ============================================================

  function showLoading(dropdown) {
    dropdown.innerHTML = '<div class="scw-cr-option scw-cr-option--loading">Searching\u2026</div>';
    dropdown.classList.add('is-open');
  }

  function renderDropdownOptions(dropdown, results, onSelect) {
    dropdown.innerHTML = '';

    if (!results.length) {
      var empty = document.createElement('div');
      empty.className = 'scw-cr-option scw-cr-option--empty';
      empty.textContent = 'No products found';
      dropdown.appendChild(empty);
      dropdown.classList.add('is-open');
      return;
    }

    for (var i = 0; i < results.length; i++) {
      (function (product) {
        var opt = document.createElement('div');
        opt.className = 'scw-cr-option';
        opt.textContent = product.identifier;
        opt.title = product.identifier;
        opt.addEventListener('click', function () {
          onSelect(product);
        });
        dropdown.appendChild(opt);
      })(results[i]);
    }

    dropdown.classList.add('is-open');
  }

  function highlightOption(dropdown, index) {
    var opts = dropdown.querySelectorAll('.scw-cr-option:not(.scw-cr-option--empty):not(.scw-cr-option--loading)');
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.toggle('is-active', i === index);
    }
    if (opts[index]) {
      opts[index].scrollIntoView({ block: 'nearest' });
    }
  }

  // ============================================================
  // DELETE HANDLER
  // ============================================================

  function handleDelete(itemEl, childRecordId, viewId, parentRecordId, cfg, listContainer) {
    // Quick confirmation
    if (!confirm('Remove this mounting hardware item?')) return;

    itemEl.classList.add('is-saving');

    deleteChildRecord(childRecordId, function (ok) {
      if (ok) {
        itemEl.remove();
      } else {
        itemEl.classList.remove('is-saving');
        itemEl.classList.add('is-error');
        setTimeout(function () { itemEl.classList.remove('is-error'); }, 2000);
      }
    });
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  window.SCW = window.SCW || {};
  SCW.connectedRecords = {
    /**
     * Build the connected-records widget for a detail panel.
     * @param {string} viewId      - Parent view ID (e.g. 'view_3313')
     * @param {string} recordId    - Parent record ID (24-char hex)
     * @param {string} fieldKey    - Connection field key (e.g. 'field_1963')
     * @returns {HTMLElement|null} - The widget DOM element, or null
     */
    buildWidget: function (viewId, recordId, fieldKey) {
      injectStyles();
      discoverObjectKeys();
      return buildWidget(viewId, recordId, fieldKey);
    }
  };

})();
