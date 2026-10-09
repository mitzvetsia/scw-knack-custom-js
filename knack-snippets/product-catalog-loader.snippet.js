/*** BUILDER SNIPPET — product catalog (window.SCW.productMap & friends) *****
 *
 * Paste into Knack Builder → Settings → API & Code → JavaScript (app-level),
 * alongside the other SCW snippets. Runs before the CDN bundle loads and
 * exposes the Enabled product catalog (object_8) for the in-bundle pickers:
 *
 *   window.SCW.productMap          = { '<productId>': { name, buckets: [bucketId…],
 *                                       subAllowed, salesAllowed }, … }
 *   window.SCW.productBucketMap    = { '<productId>': [bucketId…], … }   // bucket filter
 *   window.SCW.mountingBoxProducts = [ { id, name, bucketId, bucketName,
 *                                       compatibleProducts, compatibleProductsAlt }, … ]
 *   window.SCW.productMapReady     = Promise → productMap (resolves after the
 *                                    last page; the error path resolves too)
 *   document event 'scw-mounting-box-products-ready'
 *
 *   subAllowed   = field_2433 "FLAG_subcontractor can add" (boolean)
 *   salesAllowed = field_2434 "FLAG_sales can add"         (boolean)
 *
 * Consumers (grep productMap / productBucketMap / mountingBoxProducts in src/):
 *   - worksheet-v2 product pickers + bulk editor, bid-review, the v2 add-item
 *     modal (sow-add-item-form.js — in SURVEY mode it offers ONLY products
 *     with subAllowed and hides buckets with none; without the key on the
 *     entries it shows every product behind an amber notice),
 *     filter-products-by-bucket.js, bulk-add-mounting-box.js, product-lifecycle.js.
 *
 * Version-controlled copy added 2026-10-09 (the Builder copy is the live one —
 * keep THIS file as the source of truth and re-paste on any change).
 *
 * ⚠️ Known Issue #17: this ships the REST key client-side. Slated for migration
 * to a hidden-view read; until then it follows the existing snippet pattern.
 ***************************************************************************/
(function () {
  var APP_ID  = Knack.application_id;
  // ⚠️ Key is NOT stored in this repo. Fill in from Builder → Settings →
  // API & Code before pasting; never commit the value.
  var API_KEY = '###';   // TBD — fill from Builder, never commit the value

  var PRODUCT_OBJECT   = 'object_8';
  var NAME_FIELD       = 'field_35';
  var SKU_FIELD        = 'field_56';  // type name field
  var BUCKET_FIELD     = 'field_133';
  var STATUS_FIELD     = 'field_956';
  var COMPAT_FIELD     = 'field_2236';
  var COMPAT_FIELD_ALT = 'field_2205';
  var SALES_ALLOWED    = 'field_2434';
  var SUB_ALLOWED      = 'field_2433';


  var filters = encodeURIComponent(JSON.stringify({
    match: 'and',
    rules: [ { field: STATUS_FIELD, operator: 'is', value: 'Enabled' } ]
  }));

  window.SCW = window.SCW || {};
  var out = [], productMap = {}, productBucketMap = {}, _ready;
  window.SCW.productMapReady = new Promise(function (r) { _ready = r; });

  function readIdList(rec, key) {
    var raw = rec[key + '_raw'], ids = [];
    if (Array.isArray(raw)) for (var i=0;i<raw.length;i++) if (raw[i]&&raw[i].id) ids.push(raw[i].id);
    return ids;
  }
  function allBuckets(rec) {
    var raw = rec[BUCKET_FIELD + '_raw'], ids = [];
    if (Array.isArray(raw)) { for (var i=0;i<raw.length;i++) if (raw[i]&&raw[i].id) ids.push(raw[i].id); }
    else if (raw && raw.id) ids.push(raw.id);
    return ids;
  }
  // Yes/No fields: _raw is a boolean; fall back to the formatted "Yes".
  function flag(rec, key) {
    var raw = rec[key + '_raw'];
    if (raw === true || raw === false) return raw;
    return String(rec[key] == null ? '' : rec[key]).trim().toLowerCase() === 'yes';
  }

  function fetchPage(page) {
    $.ajax({
      url: 'https://api.knack.com/v1/objects/' + PRODUCT_OBJECT +
           '/records?rows_per_page=1000&filters=' + filters + '&page=' + page,
      type: 'GET',
      headers: { 'X-Knack-Application-Id': APP_ID, 'X-Knack-REST-API-Key': API_KEY },
      success: function (res) {
        var recs = res.records || [];
        for (var i = 0; i < recs.length; i++) {
          var rec = recs[i];
          if (!rec || !rec.id) continue;
          var name = (rec[NAME_FIELD] || rec.identifier || '').toString()
            .replace(/<[^>]*>/g, '').trim() || '(unnamed)';
          var sku = (rec[SKU_FIELD + '_raw'] != null
            ? rec[SKU_FIELD + '_raw'] : (rec[SKU_FIELD] || '')).toString()
            .replace(/<[^>]*>/g, '').trim();
          if (sku) name = name + ' - ' + sku;
          var buckets = allBuckets(rec);


          // product-picker globals — subAllowed / salesAllowed gate the
          // sub survey page (sow-add-item-form.js SURVEY mode) and, later,
          // the sales page.
          productMap[rec.id] = {
            name:         name,
            buckets:      buckets,
            subAllowed:   flag(rec, SUB_ALLOWED),     // field_2433 FLAG_subcontractor can add
            salesAllowed: flag(rec, SALES_ALLOWED)    // field_2434 FLAG_sales can add
          };
          if (buckets.length) productBucketMap[rec.id] = buckets;

          // accessory-picker global (unchanged)
          var braw = rec[BUCKET_FIELD + '_raw'], bucketId = '', bucketName = '';
          if (Array.isArray(braw) && braw[0] && braw[0].id) {
            bucketId = braw[0].id; bucketName = (braw[0].identifier || '').toString().trim();
          } else if (braw && braw.id) {
            bucketId = braw.id; bucketName = (braw.identifier || '').toString().trim();
          }
          out.push({
            id: rec.id, name: name, bucketId: bucketId, bucketName: bucketName,
            compatibleProducts:    readIdList(rec, COMPAT_FIELD),
            compatibleProductsAlt: readIdList(rec, COMPAT_FIELD_ALT)
          });
        }
        if (res.total_pages && page < res.total_pages) {
          fetchPage(page + 1);
        } else {
          out.sort(function (a, b) {
            return String(a.name).localeCompare(String(b.name), undefined,
              { numeric: true, sensitivity: 'base' });
          });
          window.SCW.mountingBoxProducts = out;
          window.SCW.productMap          = productMap;
          window.SCW.productBucketMap    = productBucketMap;
          if (_ready) _ready(productMap);
          document.dispatchEvent(new CustomEvent('scw-mounting-box-products-ready'));
        }
      },
      error: function (xhr) {
        console.warn('[product-catalog-loader] fetch failed', xhr && xhr.status);
        if (_ready) _ready(productMap);
      }
    });
  }
  fetchPage(1);
})();
