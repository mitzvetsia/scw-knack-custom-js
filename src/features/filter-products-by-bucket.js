/*** FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
(function () {
  'use strict';

  var EVENT_NS = '.scwProdBucketFilter';
  var LOG_PREFIX = '[scwProdBucketFilter]';

  // ── CONFIG ──────────────────────────────────────────────────────
  var CONFIG = {
    LINE_ITEM_BUCKET_FIELD: 'field_2219',
    PRODUCT_CELL_FIELD: 'field_1949',
    VIEWS: ['view_3456', 'view_3586', 'view_3610'],
    DEBUG: true
  };

  // ── STATE ──────────────────────────────────────────────────────
  var _lastClickedTr = null;
  var _popoverObserver = null;

  // productId → Set of bucketIds (built from all grid view models)
  var _productBucketMap = {};

  function log() {
    if (!CONFIG.DEBUG || !window.console) return;
    var args = [LOG_PREFIX].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  // ── BUILD MAP FROM KNACK VIEW MODEL ──────────────────────────
  // Each grid view model already has every record with raw field data.
  // We read field_1949_raw (product) + field_2219_raw (bucket) to build
  // the product→bucket lookup with zero API calls.
  function buildMapFromViewModel(viewId) {
    var view = Knack.views[viewId];
    if (!view || !view.model || !view.model.data) {
      log('No model data for', viewId);
      return;
    }

    var records = view.model.data.models || view.model.data;
    if (!records || !records.length) {
      log('No records in', viewId, 'model');
      return;
    }

    var added = 0;
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      // Knack model stores records as Backbone models or plain objects
      var attrs = rec.attributes || rec;

      var productRaw = attrs[CONFIG.PRODUCT_CELL_FIELD + '_raw'];
      var bucketRaw  = attrs[CONFIG.LINE_ITEM_BUCKET_FIELD + '_raw'];

      // Extract product ID(s)
      var productIds = [];
      if (Array.isArray(productRaw)) {
        for (var p = 0; p < productRaw.length; p++) {
          if (productRaw[p] && productRaw[p].id) productIds.push(productRaw[p].id);
        }
      } else if (productRaw && productRaw.id) {
        productIds.push(productRaw.id);
      }

      // Extract bucket ID(s)
      var bucketIds = [];
      if (Array.isArray(bucketRaw)) {
        for (var b = 0; b < bucketRaw.length; b++) {
          if (bucketRaw[b] && bucketRaw[b].id) bucketIds.push(bucketRaw[b].id);
        }
      } else if (bucketRaw && bucketRaw.id) {
        bucketIds.push(bucketRaw.id);
      }

      // Map each product to its bucket(s)
      for (var pi = 0; pi < productIds.length; pi++) {
        var pid = productIds[pi];
        if (!_productBucketMap[pid]) _productBucketMap[pid] = [];
        for (var bi = 0; bi < bucketIds.length; bi++) {
          if (_productBucketMap[pid].indexOf(bucketIds[bi]) === -1) {
            _productBucketMap[pid].push(bucketIds[bi]);
            added++;
          }
        }
      }
    }

    log('Built map from', viewId, ':', added, 'new mappings, total products:', Object.keys(_productBucketMap).length);
  }

  // ── READ BUCKET ID FROM A TABLE ROW (DOM) ────────────────────
  function readRowBucketId(tr) {
    var cell = tr.querySelector('td.' + CONFIG.LINE_ITEM_BUCKET_FIELD);
    if (!cell) {
      log('No td.' + CONFIG.LINE_ITEM_BUCKET_FIELD + ' in row. TD classes:',
        Array.prototype.map.call(tr.querySelectorAll('td'), function (td) {
          return td.className;
        }).join(' | '));
      return '';
    }
    var span = cell.querySelector('span[data-kn="connection-value"]');
    if (!span) {
      log('No connection-value span in bucket cell. HTML:', cell.innerHTML.substring(0, 200));
      return '';
    }
    return (span.className || '').trim();
  }

  // ── READ BUCKET FROM KNACK MODEL (fallback if DOM scrape fails) ──
  function readRowBucketFromModel(tr) {
    var recordId = tr.id;
    if (!recordId) return '';

    for (var v = 0; v < CONFIG.VIEWS.length; v++) {
      var view = Knack.views[CONFIG.VIEWS[v]];
      if (!view || !view.model || !view.model.data) continue;
      var records = view.model.data.models || view.model.data;
      if (!records) continue;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var attrs = rec.attributes || rec;
        if (attrs.id !== recordId) continue;

        var bucketRaw = attrs[CONFIG.LINE_ITEM_BUCKET_FIELD + '_raw'];
        if (Array.isArray(bucketRaw) && bucketRaw[0] && bucketRaw[0].id) return bucketRaw[0].id;
        if (bucketRaw && bucketRaw.id) return bucketRaw.id;
        return '';
      }
    }
    return '';
  }

  // ── CHECK IF A PRODUCT MATCHES THE BUCKET ────────────────────
  function productMatchesBucket(productId, bucketId) {
    if (!productId || !bucketId) return true;
    var buckets = _productBucketMap[productId];
    if (!buckets) {
      // Unknown product — not in any viewed row. Let it through.
      return true;
    }
    for (var i = 0; i < buckets.length; i++) {
      if (buckets[i] === bucketId) return true;
    }
    return false;
  }

  // ── FILTER POPOVER OPTIONS ───────────────────────────────────
  function filterPopover(popover) {
    if (!_lastClickedTr) { log('filterPopover: no _lastClickedTr'); return; }

    // Try DOM first, fall back to model
    var bucketId = readRowBucketId(_lastClickedTr);
    if (!bucketId) {
      bucketId = readRowBucketFromModel(_lastClickedTr);
      if (bucketId) log('Got bucket from model:', bucketId);
    }
    if (!bucketId) {
      log('No bucket on row — skipping filter');
      return;
    }

    log('Filtering for bucket', bucketId, '| map size:', Object.keys(_productBucketMap).length);
    log('Popover classes:', popover.className);
    log('Popover innerHTML (first 500):', popover.innerHTML.substring(0, 500));

    var hidden = 0;
    var total = 0;

    // Pattern 1: radio/checkbox controls inside .conn_inputs
    var controls = popover.querySelectorAll('.conn_inputs .control');
    if (controls.length) {
      total = controls.length;
      log('Found', total, 'controls in .conn_inputs');
      for (var i = 0; i < controls.length; i++) {
        var input = controls[i].querySelector('input[type="radio"], input[type="checkbox"]');
        if (!input || !input.value) continue;
        if (!productMatchesBucket(input.value, bucketId)) {
          controls[i].style.display = 'none';
          hidden++;
        } else {
          controls[i].style.display = '';
        }
      }
      log('Hidden', hidden, 'of', total, 'options');
      return;
    }

    // Pattern 2: Chosen.js <select>
    var select = popover.querySelector('select');
    if (select) {
      var opts = select.querySelectorAll('option');
      total = opts.length;
      log('Found select with', total, 'options');
      for (var j = 0; j < opts.length; j++) {
        if (!opts[j].value) continue;
        if (!productMatchesBucket(opts[j].value, bucketId)) {
          opts[j].disabled = true;
          opts[j].style.display = 'none';
          hidden++;
        } else {
          opts[j].disabled = false;
          opts[j].style.display = '';
        }
      }
      $(select).trigger('chosen:updated').trigger('liszt:updated');
      log('Hidden', hidden, 'of', total, 'options');
      return;
    }

    log('No .conn_inputs controls or select found in popover');
  }

  // ── CAPTURE CLICK ON PRODUCT CELL ────────────────────────────
  document.addEventListener('click', function (e) {
    var td = e.target.closest
      ? e.target.closest('td.' + CONFIG.PRODUCT_CELL_FIELD)
      : null;
    if (!td) return;

    var viewEl = td.closest('[id^="view_"]');
    if (!viewEl || CONFIG.VIEWS.indexOf(viewEl.id) === -1) return;

    var tr = td.closest('tr');
    if (!tr || !tr.id) return;

    _lastClickedTr = tr;
    log('Product cell clicked in', viewEl.id, 'row', tr.id, 'td classes:', td.className);
  }, true);

  // ── OBSERVE POPOVER OPEN ─────────────────────────────────────
  function watchPopoverContent(popover) {
    if (_popoverObserver) { _popoverObserver.disconnect(); _popoverObserver = null; }

    var target = popover.querySelector('.drop-content') || popover;
    var timer = 0;

    _popoverObserver = new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () { filterPopover(popover); }, 30);
    });

    _popoverObserver.observe(target, { childList: true, subtree: true });
  }

  var _bodyObserver = new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var mutation = mutations[m];

      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        var el = mutation.target;
        if (el.classList.contains('kn-popover')) {
          log('Popover class change:', el.className);
          if (el.classList.contains('drop-open') && _lastClickedTr) {
            setTimeout(function () {
              filterPopover(el);
              watchPopoverContent(el);
            }, 100);
          }
        }
      }

      if (mutation.type === 'childList') {
        for (var n = 0; n < mutation.addedNodes.length; n++) {
          var node = mutation.addedNodes[n];
          if (node.nodeType !== 1) continue;
          if (node.classList.contains('kn-popover')) {
            log('New popover node added');
            if (_lastClickedTr) {
              (function (p) {
                setTimeout(function () {
                  filterPopover(p);
                  watchPopoverContent(p);
                }, 100);
              })(node);
            }
          }
        }
      }
    }
  });

  _bodyObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  // ── INIT: BUILD MAP ON VIEW RENDER ───────────────────────────
  for (var i = 0; i < CONFIG.VIEWS.length; i++) {
    (function (viewId) {
      $(document)
        .off('knack-view-render.' + viewId + EVENT_NS)
        .on('knack-view-render.' + viewId + EVENT_NS, function () {
          log('View rendered:', viewId);
          buildMapFromViewModel(viewId);
        });
    })(CONFIG.VIEWS[i]);
  }

  log('Module loaded, watching views:', CONFIG.VIEWS.join(', '));
})();
/*** END FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
