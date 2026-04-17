/*** FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
(function () {
  'use strict';

  var EVENT_NS = '.scwProdBucketFilter';
  var LOG_PREFIX = '[scwProdBucketFilter]';

  // ── CONFIG ──────────────────────────────────────────────────────
  var CONFIG = {
    PRODUCT_OBJECT: 'object_8',
    PRODUCT_BUCKET_FIELD: 'field_133',
    LINE_ITEM_BUCKET_FIELD: 'field_2219',
    PRODUCT_CELL_FIELD: 'field_1949',
    VIEWS: ['view_3456', 'view_3586', 'view_3610'],
    DEBUG: false
  };

  // ── STATE ──────────────────────────────────────────────────────
  var _productBucketMap = null;   // productId → [bucketId, ...]
  var _fetchInFlight = false;
  var _lastClickedTr = null;
  var _popoverObserver = null;

  function log() {
    if (!CONFIG.DEBUG || !window.console) return;
    var args = [LOG_PREFIX].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  // ── FETCH PRODUCT→BUCKET MAPPING ─────────────────────────────
  function fetchProductBuckets(callback) {
    if (_productBucketMap) { if (callback) callback(_productBucketMap); return; }
    if (_fetchInFlight) return;
    _fetchInFlight = true;

    var map = {};

    function fetchPage(page) {
      if (!window.SCW || typeof SCW.knackAjax !== 'function') {
        console.warn(LOG_PREFIX, 'SCW.knackAjax not available');
        _fetchInFlight = false;
        return;
      }

      SCW.knackAjax({
        url: '/v1/objects/' + CONFIG.PRODUCT_OBJECT + '/records?rows_per_page=1000&page=' + page,
        type: 'GET',
        success: function (res) {
          var records = res.records || [];
          for (var i = 0; i < records.length; i++) {
            var rec = records[i];
            var raw = rec[CONFIG.PRODUCT_BUCKET_FIELD + '_raw'];
            var buckets = [];
            if (Array.isArray(raw)) {
              for (var j = 0; j < raw.length; j++) {
                if (raw[j] && raw[j].id) buckets.push(raw[j].id);
              }
            } else if (raw && raw.id) {
              buckets.push(raw.id);
            }
            map[rec.id] = buckets;
          }

          if (res.total_pages && page < res.total_pages) {
            fetchPage(page + 1);
          } else {
            _productBucketMap = map;
            _fetchInFlight = false;
            log('Loaded', Object.keys(map).length, 'products');
            if (callback) callback(map);
          }
        },
        error: function () {
          _fetchInFlight = false;
          console.warn(LOG_PREFIX, 'Failed to fetch products from', CONFIG.PRODUCT_OBJECT);
        }
      });
    }

    fetchPage(1);
  }

  // ── READ BUCKET ID FROM A TABLE ROW ──────────────────────────
  function readRowBucketId(tr) {
    var cell = tr.querySelector('td.' + CONFIG.LINE_ITEM_BUCKET_FIELD);
    if (!cell) return '';
    var span = cell.querySelector('span[data-kn="connection-value"]');
    if (!span) return '';
    return (span.className || '').trim();
  }

  // ── CHECK IF A PRODUCT MATCHES THE BUCKET ────────────────────
  function productMatchesBucket(productId, bucketId) {
    if (!_productBucketMap || !productId) return true;
    var buckets = _productBucketMap[productId];
    if (!buckets) return true;
    for (var i = 0; i < buckets.length; i++) {
      if (buckets[i] === bucketId) return true;
    }
    return false;
  }

  // ── FILTER POPOVER OPTIONS ───────────────────────────────────
  function filterPopover(popover) {
    if (!_lastClickedTr || !_productBucketMap) return;

    var bucketId = readRowBucketId(_lastClickedTr);
    if (!bucketId) {
      log('No bucket on row — skipping filter');
      return;
    }

    log('Filtering for bucket', bucketId);
    var hidden = 0;

    // Pattern 1: radio/checkbox controls inside .conn_inputs
    var controls = popover.querySelectorAll('.conn_inputs .control');
    if (controls.length) {
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
      log('Hidden', hidden, 'of', controls.length, 'options (controls)');
      return;
    }

    // Pattern 2: Chosen.js <select>
    var select = popover.querySelector('select');
    if (select) {
      var opts = select.querySelectorAll('option');
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
      log('Hidden', hidden, 'of', opts.length, 'options (select)');
    }
  }

  // ── CAPTURE CLICK ON PRODUCT CELL ────────────────────────────
  // Fires in capture phase before Knack opens its inline-edit popover,
  // so we know which row to filter against.
  document.addEventListener('click', function (e) {
    var td = e.target.closest
      ? e.target.closest('td.' + CONFIG.PRODUCT_CELL_FIELD + '.cell-edit')
      : null;
    if (!td) { _lastClickedTr = null; return; }

    var viewEl = td.closest('[id^="view_"]');
    if (!viewEl || CONFIG.VIEWS.indexOf(viewEl.id) === -1) return;

    var tr = td.closest('tr');
    if (!tr || !tr.id) return;

    _lastClickedTr = tr;
    log('Product cell clicked in', viewEl.id, 'row', tr.id);
  }, true);

  // ── OBSERVE POPOVER OPEN ─────────────────────────────────────
  // Re-applies filter whenever options change (covers lazy-load / search).
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
    if (!_lastClickedTr) return;

    for (var m = 0; m < mutations.length; m++) {
      var mutation = mutations[m];

      // Class change: kn-popover gets drop-open added
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        var el = mutation.target;
        if (el.classList.contains('kn-popover') && el.classList.contains('drop-open')) {
          setTimeout(function () {
            filterPopover(el);
            watchPopoverContent(el);
          }, 60);
        }
      }

      // New node: kn-popover appended to body
      if (mutation.type === 'childList') {
        for (var n = 0; n < mutation.addedNodes.length; n++) {
          var node = mutation.addedNodes[n];
          if (node.nodeType !== 1) continue;
          if (node.classList.contains('kn-popover')) {
            (function (p) {
              setTimeout(function () {
                filterPopover(p);
                watchPopoverContent(p);
              }, 60);
            })(node);
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

  // ── INIT: FETCH ON FIRST RELEVANT VIEW RENDER ───────────────
  var _fetched = false;

  function onViewRender() {
    if (_fetched) return;
    _fetched = true;
    fetchProductBuckets(null);
  }

  for (var i = 0; i < CONFIG.VIEWS.length; i++) {
    $(document)
      .off('knack-view-render.' + CONFIG.VIEWS[i] + EVENT_NS)
      .on('knack-view-render.' + CONFIG.VIEWS[i] + EVENT_NS, onViewRender);
  }
})();
/*** END FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
