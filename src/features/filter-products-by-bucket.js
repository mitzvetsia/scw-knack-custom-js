/*** FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
/**
 * Requires: window.SCW.productBucketMap (object: productId → [bucketId, ...])
 *
 * That map is built by a snippet in Knack's custom JS input (not in this
 * public repo) which calls the object API with the app's API key.
 * This module only reads the map — no API key, no fetch.
 */
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

  function log() {
    if (!CONFIG.DEBUG || !window.console) return;
    var args = [LOG_PREFIX].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function getMap() {
    return (window.SCW && window.SCW.productBucketMap) || null;
  }

  // ── READ BUCKET ID FROM A TABLE ROW ──────────────────────────
  function readRowBucketId(tr) {
    // Try DOM first
    var cell = tr.querySelector('td.' + CONFIG.LINE_ITEM_BUCKET_FIELD);
    if (cell) {
      var span = cell.querySelector('span[data-kn="connection-value"]');
      if (span) {
        var id = (span.className || '').trim();
        if (id) return id;
      }
    }

    // Fallback: Knack model
    var recordId = tr.id;
    if (!recordId) return '';
    for (var v = 0; v < CONFIG.VIEWS.length; v++) {
      var view = Knack.views[CONFIG.VIEWS[v]];
      if (!view || !view.model || !view.model.data) continue;
      var records = view.model.data.models || view.model.data;
      if (!records) continue;
      for (var i = 0; i < records.length; i++) {
        var attrs = records[i].attributes || records[i];
        if (attrs.id !== recordId) continue;
        var raw = attrs[CONFIG.LINE_ITEM_BUCKET_FIELD + '_raw'];
        if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
        if (raw && raw.id) return raw.id;
        return '';
      }
    }
    return '';
  }

  // ── CHECK IF A PRODUCT MATCHES THE BUCKET ────────────────────
  function productMatchesBucket(productId, bucketId) {
    var map = getMap();
    if (!map || !productId || !bucketId) return true;
    var buckets = map[productId];
    if (!buckets) return true;   // unknown product — let it through
    for (var i = 0; i < buckets.length; i++) {
      if (buckets[i] === bucketId) return true;
    }
    return false;
  }

  // ── FILTER POPOVER OPTIONS ───────────────────────────────────
  function filterPopover(popover) {
    if (!_lastClickedTr) { log('filterPopover: no _lastClickedTr'); return; }
    var map = getMap();
    if (!map) { log('filterPopover: SCW.productBucketMap not available yet'); return; }

    var bucketId = readRowBucketId(_lastClickedTr);
    if (!bucketId) {
      log('No bucket on row — skipping filter');
      return;
    }

    log('Filtering for bucket', bucketId, '| map size:', Object.keys(map).length);

    var hidden = 0;
    var total = 0;

    // Pattern 1: radio/checkbox controls inside .conn_inputs
    var controls = popover.querySelectorAll('.conn_inputs .control');
    if (controls.length) {
      total = controls.length;
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
      log('Hidden', hidden, 'of', total, 'controls');
      return;
    }

    // Pattern 2: Chosen.js <select>
    var select = popover.querySelector('select');
    if (select) {
      var opts = select.querySelectorAll('option');
      total = opts.length;
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
      log('Hidden', hidden, 'of', total, 'select options');
      return;
    }

    log('Popover HTML (first 500):', popover.innerHTML.substring(0, 500));
    log('No .conn_inputs controls or select found');
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
    log('Product cell clicked in', viewEl.id, 'row', tr.id);
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
        if (el.classList.contains('kn-popover') && el.classList.contains('drop-open') && _lastClickedTr) {
          setTimeout(function () {
            filterPopover(el);
            watchPopoverContent(el);
          }, 100);
        }
      }

      if (mutation.type === 'childList') {
        for (var n = 0; n < mutation.addedNodes.length; n++) {
          var node = mutation.addedNodes[n];
          if (node.nodeType !== 1) continue;
          if (node.classList.contains('kn-popover') && _lastClickedTr) {
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
  });

  _bodyObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  log('Module loaded, waiting for SCW.productBucketMap');
})();
/*** END FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
