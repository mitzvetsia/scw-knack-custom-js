/*** PRODUCT CATALOG — derived product facts (nothing stamped) ***************
 *
 * One reader over the catalog the Builder snippet loads at boot
 * (knack-snippets/product-catalog-loader.snippet.js → window.SCW.productMap,
 * window.SCW.mountingBoxProducts, window.SCW.productMapReady and the
 * 'scw-mounting-box-products-ready' event). The add-accessory pickers already
 * filter by the product's two compatibility lists (field_2236 / field_2205);
 * this module makes that same rule, and the product's status, available to
 * every surface as a QUESTION instead of a stamped line-item flag. Decided
 * 2026-10-13: the stamped "accessory match check" (field_2244) and the
 * product-mirror flag (field_2912) went stale whenever the catalog or the line
 * changed, needed a column on every view, and were one more thing to keep in
 * step. Nothing is written back; the catalog is the truth.
 *
 *   SCW.catalog.isReady()                           — the maps have landed
 *   SCW.catalog.ready(fn)                           — fn now if ready, else once they land
 *   SCW.catalog.product(id)                         — { id, name, buckets, enabled, status } | null
 *   SCW.catalog.isDisabled(productId)               — true | false | null
 *   SCW.catalog.fits(accProductId, parentProductId) — true | false | null
 *   SCW.catalog.auditAccessories(records, fields)   — { ready, wrong, ok, undecided }
 *
 * Three-state answers are the contract: null means "the catalog cannot say"
 * (not loaded, load failed, product unknown, no compatibility list, no status
 * column) and the caller falls back to whatever it had — never a warning.
 * Disabled is only ever reported from an explicit status, so a catalog that
 * holds enabled products only (the snippet before 2026-10-13) answers false
 * for the products it holds and null for the rest.
 *
 * Source-agnostic on purpose: when the snippet's REST-key fetch gives way to
 * hidden all-products grids (Known Issue #17), only source() changes.
 ****************************************************************************/
(function () {
  'use strict';
  window.SCW = window.SCW || {};

  function source() {
    var S = window.SCW || {};
    return {
      map:       (S.productMap && typeof S.productMap === 'object') ? S.productMap : null,
      list:      Array.isArray(S.mountingBoxProducts) ? S.mountingBoxProducts : null,
      hasStatus: S.productMapHasStatus === true
    };
  }

  function isReady() { return !!source().map; }

  var _waiters = [], _armed = false;
  function flush() {
    var w = _waiters; _waiters = [];
    for (var i = 0; i < w.length; i++) {
      try { w[i](); } catch (e) { /* one listener never blocks the next */ }
    }
  }
  function ready(fn) {
    if (typeof fn !== 'function') return;
    if (isReady()) { fn(); return; }
    _waiters.push(fn);
    if (_armed) return;
    _armed = true;
    document.addEventListener('scw-mounting-box-products-ready', function () { if (isReady()) flush(); });
    var p = window.SCW && window.SCW.productMapReady;
    // The snippet's error path resolves the promise WITHOUT publishing the
    // map, so isReady() stays false and nobody is told — the fallbacks hold.
    if (p && typeof p.then === 'function') p.then(function () { if (isReady()) flush(); }, function () {});
  }

  // Accessory product id → set of parent product ids it fits (null = the
  // product carries no compatibility list at all). Rebuilt only when the
  // snippet publishes a new list object.
  var _idxFor = null, _idx = null;
  function compatIndex() {
    var list = source().list;
    if (!list) return null;
    if (_idxFor === list && _idx) return _idx;
    var idx = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      var a = Array.isArray(p.compatibleProducts)    ? p.compatibleProducts    : [];
      var b = Array.isArray(p.compatibleProductsAlt) ? p.compatibleProductsAlt : [];
      var set = null;
      if (a.length || b.length) {
        set = Object.create(null);
        for (var j = 0; j < a.length; j++) if (a[j]) set[String(a[j])] = true;
        for (var k = 0; k < b.length; k++) if (b[k]) set[String(b[k])] = true;
      }
      idx[String(p.id)] = set;
    }
    _idxFor = list; _idx = idx;
    return idx;
  }

  function product(id) {
    var src = source();
    if (!src.map || !id) return null;
    var e = src.map[String(id)];
    if (!e) return null;
    var enabled = (typeof e.enabled === 'boolean') ? e.enabled : (src.hasStatus ? null : true);
    return { id: String(id), name: e.name || '', buckets: e.buckets || [], enabled: enabled, status: e.status || '' };
  }

  /** true = the product's status is not Enabled; false = it is enabled;
   *  null = the catalog cannot say. Never "disabled" on mere absence. */
  function isDisabled(productId) {
    var src = source();
    if (!src.map || !productId) return null;
    var e = src.map[String(productId)];
    if (!e) return null;
    if (typeof e.enabled === 'boolean') return !e.enabled;
    return src.hasStatus ? null : false;   // enabled-only catalog: present ⇒ enabled
  }

  /** true = the accessory product's compatibility lists name the parent's
   *  product; false = they exist and do not; null = cannot say (either id
   *  missing, catalog not loaded, accessory unknown, or no list at all). */
  function fits(accProductId, parentProductId) {
    if (!accProductId || !parentProductId) return null;
    var idx = compatIndex();
    if (!idx) return null;
    var set = idx[String(accProductId)];
    if (set === undefined || set === null) return null;
    return !!set[String(parentProductId)];
  }

  function connId(v) {
    if (Array.isArray(v)) v = v[0];
    return (v && v.id) ? String(v.id) : '';
  }

  /** Audit every accessory in a record set against its parent. `fields` names
   *  the object's keys: { product, parent } (field_XXXX); `records` are Knack
   *  attribute hashes with their _raw companions, parents included (an
   *  accessory whose parent is not in the set is undecided). Each map is
   *  accessoryId → parentId: wrong = the catalog says it does not fit, ok =
   *  it fits, undecided = the catalog cannot say. ready:false = no catalog. */
  function auditAccessories(records, fields) {
    var out = { ready: isReady(), wrong: Object.create(null), ok: Object.create(null), undecided: Object.create(null) };
    if (!out.ready || !records || !fields || !fields.product || !fields.parent) return out;
    var byId = Object.create(null);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r && r.id) byId[r.id] = r;
    }
    for (var j = 0; j < records.length; j++) {
      var rec = records[j];
      if (!rec || !rec.id) continue;
      var parentId = connId(rec[fields.parent + '_raw']);
      if (!parentId) continue;                     // not an accessory
      var parent  = byId[parentId];
      var accProd = connId(rec[fields.product + '_raw']);
      var parProd = parent ? connId(parent[fields.product + '_raw']) : '';
      var f = fits(accProd, parProd);
      if (f === false)     out.wrong[rec.id]     = parentId;
      else if (f === true) out.ok[rec.id]        = parentId;
      else                 out.undecided[rec.id] = parentId;
    }
    return out;
  }

  window.SCW.catalog = {
    isReady:          isReady,
    ready:            ready,
    product:          product,
    isDisabled:       isDisabled,
    fits:             fits,
    auditAccessories: auditAccessories
  };
})();
/*** END PRODUCT CATALOG *****************************************************/
