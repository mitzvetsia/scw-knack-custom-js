/*** WORKSHEET V2 — CONFIG ****************************************************
 *
 * Per-view configuration for the v2 worksheet pipeline. Designed so the
 * same render pipeline can be deployed across different pages/views that
 * look at SIMILAR-BUT-NOT-IDENTICAL fields.
 *
 * Two layers:
 *   1. DEFAULT_FIELDS / BUCKETS — the canonical map for the SOW Line Item
 *      object (view_3962 / view_3921 on the build-SOW + bid-review scenes).
 *      Every field the pipeline reads is here under a stable LOGICAL name.
 *   2. Per-view overrides — each entry in `views` may carry a `fields` and
 *      `buckets` object that MERGES over the defaults. A new deployment only
 *      lists the keys that differ; everything else falls through to default.
 *
 * Modules never hardcode `field_XXXX` — they resolve through:
 *   SCW.worksheetV2.cfg.fields(sourceViewKey)   → { logicalName: 'field_NN' }
 *   SCW.worksheetV2.cfg.bucket(name, viewKey)   → '<24-hex bucket id>'
 *   SCW.worksheetV2.cfg.viewCfg(sourceViewKey)  → the raw view entry
 *
 * Adding a deployment (e.g. the sales build-SOW page on view_3450) is then
 * just a new `views` entry with its sourceViewKey, mount anchor, and the
 * handful of `fields`/`buckets` that differ — no module edits.
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};
  window.SCW.worksheetV2 = window.SCW.worksheetV2 || {};

  // ── Canonical SOW-line-item field map (logical name → Knack key) ──
  // Per-view `fields` overrides merge over this.
  var DEFAULT_FIELDS = {
    // identity / grouping
    product:        'field_1949',   // Product (connection, display label)
    displayLabel:   'field_1950',   // drop label (E-001, etc.)
    labelAlt:       'field_2365',    // LABEL_set line item label (tiebreaker)
    dropPrefix:     'field_2240',
    dropNumber:     'field_1951',
    dropLength:     'field_1965',
    conduit:        'field_2035',
    bucket:         'field_2219',   // proposal bucket (L2)
    sortOrder:      'field_2218',
    mdfIdf:         'field_1946',   // MDF/IDF location (L1)
    sow:            'field_2154',   // REL_SOW (columns / SOW filter)
    // money / qty
    qty:            'field_1964',
    subBid:         'field_2150',   // INPUT sub bid
    fee:            'field_2151',   // CALC sub-bid / install fee extended
    addHrs:         'field_1973',
    addMat:         'field_1974',
    hrsTotal:       'field_1997',   // CALC extended hours
    matTotal:       'field_2146',   // CALC extended materials
    installFee:     'field_2028',   // CALC install fee extended
    // text
    laborDesc:      'field_2020',
    scwNotes:       'field_1953',
    surveyNotes:    'field_2412',
    // booleans / flags
    existCabling:   'field_2461',
    exterior:       'field_1984',
    plenum:         'field_1983',
    mapConn:        'field_2231',   // FLAG_map camera/reader connections
    requireSubBid:  'field_2479',   // No/false → child-only accessory
    qtyCarryFlag:   'field_2634',   // row carries a quantity?
    discontinued:   'field_2912',   // product discontinued
    accAllowMultiQty:'field_2230',  // accessory allows multiple qty
    accessoryMatch: 'field_2244',   // accessory match check (No/false = wrong)
    // connections
    connectedDevice:  'field_2197', // cam/reader Connected Device
    connectedDevices: 'field_1957', // Connected Devices (multi)
    accessories:    'field_1958',   // Mounting Hardware (parent → children)
    children:       'field_2207',   // mirror "my children" array
    parent:         'field_2464',   // accessory → parent line item
    // photo sub-records (DOC_photos object, connected to the line item)
    photoImage:     'field_771',
    photoType:      'field_2445',
    photoRequired:  'field_2446',
    photoCompleted: 'field_2447',
    photoNotes:     'field_114',
    // SOW object (parent record, used for header name / id label)
    sowName:        'field_2126',
    sowIdLabel:     'field_2122',
    // Product object (accessory compatibility lists + bucket)
    productCompat:    'field_2236',
    productCompatAlt: 'field_2205',
    productBucket:    'field_133'
  };

  // ── Proposal-bucket ids (logical name → 24-hex). Per-view `buckets`
  //    overrides merge over this. ──
  var DEFAULT_BUCKETS = {
    camReader:        '6481e5ba38f283002898113c',
    mountingHardware: '594a94536877675816984cb9',
    networking:       '647953bb54b4e1002931ed97',
    services:         '6977caa7f246edf67b52cbcd',
    assumptions:      '697b7a023a31502ec68b3303'
  };

  SCW.worksheetV2.CONFIG = {
    enabled: true,

    // Exposed so per-view overrides can be reasoned about / extended.
    defaultFields:  DEFAULT_FIELDS,
    defaultBuckets: DEFAULT_BUCKETS,

    views: [
      {
        // Build-SOW page (internal). The canonical deployment.
        sourceViewKey:    'view_3962',
        mountAfterSelector: '#view_3610',
        label:            'SOW Line Items',
        mdfSourceViewKey: 'view_3577',
        mdfLabelField:    'field_1642',
        // No field/bucket overrides — uses the defaults above verbatim.
        fields:  {},
        buckets: {}
      }

      // ── TEMPLATE (not yet enabled) — sales build-SOW page ───────────
      // Deploy target derived from view_3450. Fill in only the fields that
      // DIFFER from DEFAULT_FIELDS, the mount anchor, and the mdf source.
      // NOTE: view_3450 has its own change-request management code we must
      // integrate with — wire that through a per-view hook before enabling
      // (see init.js). Keep enabled:false until both are ready.
      // ,{
      //   enabled:          false,
      //   sourceViewKey:    'view_3450',
      //   mountAfterSelector: '#view_3450',
      //   label:            'Sales SOW Line Items',
      //   mdfSourceViewKey: '',            // TODO
      //   mdfLabelField:    '',            // TODO
      //   changeRequestMode:'sales',       // TODO: hook for view_3450's CR code
      //   fields:  { /* only the keys that differ from DEFAULT_FIELDS */ },
      //   buckets: { /* only bucket ids that differ */ }
      // }
    ]
  };

  // ── Resolver API ──────────────────────────────────────────────────
  // Modules read field keys + bucket ids through these so a deployment is
  // pure config. Cheap; safe to call per render.
  var _fieldCache  = Object.create(null);
  var _bucketCache = Object.create(null);

  function viewCfg(sourceViewKey) {
    var views = SCW.worksheetV2.CONFIG.views || [];
    for (var i = 0; i < views.length; i++) {
      if (views[i] && views[i].sourceViewKey === sourceViewKey) return views[i];
    }
    return null;
  }

  function merge(base, over) {
    var out = {};
    for (var k in base) out[k] = base[k];
    if (over) for (var j in over) out[j] = over[j];
    return out;
  }

  // Resolved field map for a view.
  //   - default: merge the view's `fields` OVER DEFAULT_FIELDS (same-object
  //     deployments override only what differs).
  //   - `independentFields: true`: use the view's `fields` map AS-IS with NO
  //     default fallback. Use this for a DIFFERENT object whose keys all
  //     differ — it prevents the silent-fallback bug where a forgotten key
  //     inherits the SOW object's (wrong/absent) field.
  // Falls back to defaults when the view isn't registered, so callers that
  // don't know their view still work.
  function fields(sourceViewKey) {
    var key = sourceViewKey || '__default';
    if (_fieldCache[key]) return _fieldCache[key];
    var cfg = viewCfg(sourceViewKey);
    var map;
    if (cfg && cfg.independentFields) {
      map = merge(cfg.fields, null);   // copy; no default inheritance
    } else {
      map = merge(DEFAULT_FIELDS, cfg && cfg.fields);
    }
    _fieldCache[key] = map;
    return map;
  }

  // Debug aid — list logical names the pipeline expects that are missing
  // from a view's resolved map (catches forgotten keys on a new object).
  function missingFields(sourceViewKey) {
    var resolved = fields(sourceViewKey);
    var out = [];
    for (var name in DEFAULT_FIELDS) if (!resolved[name]) out.push(name);
    return out;
  }

  function buckets(sourceViewKey) {
    var key = sourceViewKey || '__default';
    if (_bucketCache[key]) return _bucketCache[key];
    var cfg = viewCfg(sourceViewKey);
    var map = merge(DEFAULT_BUCKETS, cfg && cfg.buckets);
    _bucketCache[key] = map;
    return map;
  }

  function bucket(name, sourceViewKey) {
    return buckets(sourceViewKey)[name] || '';
  }

  SCW.worksheetV2.cfg = {
    viewCfg:       viewCfg,
    fields:        fields,
    buckets:       buckets,
    bucket:        bucket,
    missingFields: missingFields
  };
})();
/*** END WORKSHEET V2 — CONFIG ************************************************/
