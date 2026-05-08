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

  var LOG_PREFIX = '[scwProdBucketFilter]';

  // Per-view: which td holds the product connection cell, and which td
  // carries the bucket-id used to filter the connection options.
  // SOW line-item views (view_3456 / view_3586 / view_3610) use field_1949
  // for the product and field_2219 for the bucket. Survey line-item views
  // (view_3505) use field_2627 for the product and field_2366 for the
  // proposal-bucket.
  var CONFIG = {
    VIEWS: {
      view_3456: { product: 'field_1949', bucket: 'field_2219' },
      view_3505: { product: 'field_2627', bucket: 'field_2366' },
      view_3586: { product: 'field_1949', bucket: 'field_2219' },
      view_3610: { product: 'field_1949', bucket: 'field_2219' },
      view_3921: { product: 'field_1949', bucket: 'field_2219' }
    },
    POLL_INTERVAL: 200,
    POLL_MAX: 6000,
    DEBUG: true
  };

  var _lastClickedTr = null;
  var _lastViewCfg = null;
  var _pollTimer = null;

  function log() {
    if (!CONFIG.DEBUG || !window.console) return;
    var args = [LOG_PREFIX].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function getMap() {
    return (window.SCW && window.SCW.productBucketMap) || null;
  }

  // ── READ BUCKET ID FROM A TABLE ROW ──────────────────────────
  function readRowBucketId(tr, viewCfg) {
    var bucketField = viewCfg.bucket;
    var cell = tr.querySelector('td.' + bucketField);
    if (cell) {
      var span = cell.querySelector('span[data-kn="connection-value"]');
      if (span) {
        var id = (span.className || '').trim();
        if (id) { log('Bucket from DOM cell:', bucketField, '→', id); return id; }
      }
      log('Bucket cell present but no connection-value span:', bucketField);
    } else {
      log('No bucket cell in row DOM, will check Knack model. Field:', bucketField);
    }
    var recordId = tr.id;
    if (!recordId) { log('Row has no id, cannot fallback'); return ''; }
    var viewIds = Object.keys(CONFIG.VIEWS);
    for (var v = 0; v < viewIds.length; v++) {
      var view = Knack.views[viewIds[v]];
      if (!view || !view.model || !view.model.data) continue;
      var records = view.model.data.models || view.model.data;
      if (!records) continue;
      for (var i = 0; i < records.length; i++) {
        var attrs = records[i].attributes || records[i];
        if (attrs.id !== recordId) continue;
        var raw = attrs[bucketField + '_raw'];
        log('Found record', recordId, 'in', viewIds[v], '— ' + bucketField + '_raw =', raw);
        if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
        if (raw && raw.id) return raw.id;
        return '';
      }
    }
    log('Record', recordId, 'not in any configured Knack view — cannot resolve bucket');
    return '';
  }

  function productMatchesBucket(productId, bucketId) {
    var map = getMap();
    if (!map || !productId || !bucketId) return true;
    var buckets = map[productId];
    if (!buckets) return true;
    for (var i = 0; i < buckets.length; i++) {
      if (buckets[i] === bucketId) return true;
    }
    return false;
  }

  // ── FIND THE CHOSEN SELECT INSIDE THE POPOVER ────────────────
  function findSelect(viewCfg) {
    // The cell-editor form contains the select for the product field
    var select = document.querySelector('#connection-picker-chosen-' + viewCfg.product + ' select');
    if (select && select.options.length > 1) return select;

    // Fallback: any select with chzn-select inside a cell-editor
    select = document.querySelector('#cell-editor select.chzn-select');
    if (select && select.options.length > 1) return select;

    return null;
  }

  // ── FILTER THE SELECT OPTIONS + REFRESH CHOSEN ───────────────
  function tryFilter() {
    var map = getMap();
    if (!map) { log('SCW.productBucketMap is missing/empty — cannot filter'); return false; }
    if (!_lastClickedTr || !_lastViewCfg) return false;

    var bucketId = readRowBucketId(_lastClickedTr, _lastViewCfg);
    if (!bucketId) { log('No bucket on row'); return false; }

    var select = findSelect(_lastViewCfg);
    if (!select) { log('Select not found or not populated yet'); return false; }

    var opts = select.options;
    var hexPattern = /^[a-f0-9]{24}$/;
    var hidden = 0;
    var shown = 0;
    var total = 0;

    for (var i = 0; i < opts.length; i++) {
      var val = opts[i].value;
      if (!val || !hexPattern.test(val)) continue;  // skip placeholder
      total++;

      if (!productMatchesBucket(val, bucketId)) {
        opts[i].disabled = true;
        opts[i].style.display = 'none';
        opts[i].setAttribute('data-scw-hidden', '1');
        hidden++;
      } else {
        opts[i].disabled = false;
        opts[i].style.display = '';
        opts[i].removeAttribute('data-scw-hidden');
        shown++;
      }
    }

    if (total === 0) {
      log('Select has', opts.length, 'options but none with hex IDs — still loading?');
      // Log first few option values for diagnosis
      for (var d = 0; d < Math.min(5, opts.length); d++) {
        log('  option[' + d + '] value:', opts[d].value, '| text:', (opts[d].textContent || '').substring(0, 40));
      }
      return false;
    }

    // Refresh Chosen to reflect hidden options
    $(select).trigger('chosen:updated').trigger('liszt:updated');

    log('Filtered: hidden', hidden, ', shown', shown, 'of', total, 'products for bucket', bucketId);
    return true;
  }

  // ── POLL UNTIL OPTIONS LOAD ──────────────────────────────────
  function startPolling() {
    stopPolling();
    var elapsed = 0;

    _pollTimer = setInterval(function () {
      elapsed += CONFIG.POLL_INTERVAL;

      var done = tryFilter();
      if (done) {
        log('Filter applied after', elapsed, 'ms');
        stopPolling();
        return;
      }

      if (elapsed >= CONFIG.POLL_MAX) {
        log('Timed out after', elapsed, 'ms');
        stopPolling();
      }
    }, CONFIG.POLL_INTERVAL);
  }

  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ── CAPTURE CLICK ON PRODUCT CELL ────────────────────────────
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;

    // Standard path: clicked cell lives inside a Knack view container.
    var viewEl = e.target.closest('[id^="view_"]');
    var viewCfg = viewEl ? CONFIG.VIEWS[viewEl.id] : null;
    var viewIdForLog = viewEl ? viewEl.id : '';

    // Bid-review path: the bid comparison grid mounts at
    // #bid-review-matrix (outside any #view_XXXX), and expands rows by
    // moving worksheet cards (tr.scw-ws-row) out of #view_3921 into
    // its own table. Clicks inside that moved card never see a
    // [id^="view_"] ancestor — so re-anchor to view_3921's config
    // (field_1949 product / field_2219 bucket) when we detect either
    // the matrix container or a transplanted worksheet row.
    if (!viewCfg && (
      e.target.closest('#bid-review-matrix') ||
      e.target.closest('tr.scw-ws-row')
    )) {
      viewCfg = CONFIG.VIEWS.view_3921;
      viewIdForLog = 'view_3921 (via bid-review-matrix)';
    }
    if (!viewCfg) return;

    var td = e.target.closest('td.' + viewCfg.product);
    if (!td) return;

    var tr = td.closest('tr');
    if (!tr || !tr.id) return;

    _lastClickedTr = tr;
    _lastViewCfg = viewCfg;
    var map = getMap();
    log(
      'Product cell clicked in', viewIdForLog,
      'row', tr.id,
      '— productBucketMap entries:', map ? Object.keys(map).length : '(missing)'
    );
    startPolling();
  }, true);

  log('Module loaded, waiting for SCW.productBucketMap');
})();
/*** END FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
