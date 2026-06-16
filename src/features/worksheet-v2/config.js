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
    surveyItemCount:'field_2586',   // # associated survey line items; >0 → delete blocked (v1 parity)
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

      // ── Deploy / Install Line Items (view_3915) ─────────────────────
      // DIFFERENT object from the SOW line item — install + QA records on
      // the deploy scene. independentFields:true means this `fields` map is
      // used AS-IS (no SOW fallback), so any omitted logical name resolves
      // undefined and its feature no-ops here (intended for the money
      // columns this object doesn't have). Keep enabled:false until the
      // render-side money-column suppression + QA surface are ported and
      // the existing v1 worksheet on this view is turned off.
      ,{
        enabled:          false,
        sourceViewKey:    'view_3915',
        mountAfterSelector: '#view_3915',   // TODO confirm anchor; disable v1 here on enable
        label:            'Install Line Items',
        independentFields: true,            // different object — no DEFAULT_FIELDS fallback
        mdfSourceViewKey: '',               // TODO: empty-L1 seed source (analogue of view_3577)
        mdfLabelField:    '',               // TODO
        hideMoneyColumns: true,             // no subBid/fee/hrs/mat/installFee on this object
        fields: {
          // identity / grouping
          product:        'field_2846',     // CORE_product (connection — for picker/edit)
          productName:    'field_2790',     // PRODUCT STORED_name (display text)
          displayLabel:   'field_2802',     // LABEL_DISPLAY (E-003)
          labelAlt:       'field_2801',     // LABEL_set label by bucket (tiebreaker)
          dropPrefix:     'field_2823',     // REL_CONFIG_pre-fix
          dropNumber:     'field_2798',     // LABEL_drop number
          dropLength:     'field_2804',
          conduit:        'field_2803',
          bucket:         'field_2822',     // REL_CONFIG_proposal bucket (L2)
          sortOrder:      'field_2218',     // same key as SOW
          mdfIdf:         'field_2818',     // L1 grouping (MDF/IDF location)
          // qty
          qty:            'field_2789',
          // text
          laborDesc:      'field_2809',
          scwNotes:       'field_2808',     // INPUT_scw external notes (direct-edit textarea)
          // flags
          existCabling:   'field_2807',
          exterior:       'field_2805',
          plenum:         'field_2806',
          mapConn:        'field_2795',
          requireSubBid:  'field_2796',
          // connections
          connectedDevices: 'field_2820',   // multi — on the switch/NVR
          connectedDevice:  'field_2821',   // single — on the cam ("Connected To")
          accessories:      'field_2852',   // accessories array on the parent
          children:         'field_2852',   // same forward array (no separate mirror here)
          parent:           'field_2853',   // accessory → parent line item
          // photos (shared DOC_photos object — identical keys to SOW)
          photoImage:     'field_771',
          photoType:      'field_2445',
          photoRequired:  'field_2446',
          photoCompleted: 'field_2447',
          photoNotes:     'field_114',
          // product catalog (shared object — identical keys)
          productCompat:    'field_2236',
          productCompatAlt: 'field_2205',
          productBucket:    'field_133',
          // install / QA group (new — no SOW analogue; port v1 QA surface)
          installStatus:    'field_2825',
          qaStatus:         'field_2859',
          qaClientSignoff:  'field_2860',
          qaNotes:          'field_2861',
          qaPassed:         'field_2830',
          qaHistory:        'field_2865',
          qaCompletedBy:    'field_2862',
          qaCompletedDate:  'field_2863'
        },
        buckets: {
          // shared proposal-bucket object; only the extra one this view shows
          otherEquip: '5df12ce036f91b0015404d78'   // "Other Equipment"
        }
      }

      // ── Sales scope-of-work-details page (view_3586) ────────────────
      // SAME object as view_3962 (SOW line items), so it inherits
      // DEFAULT_FIELDS — only the sales pricing fields are added. The
      // sales card swaps the build-SOW money columns (Sub Bid / +Hrs /
      // +Mat / Fee) for a single read-only Total (field_2269), with
      // Retail Price / Discount % / Applied Discount in the detail panel
      // (moneyMode:'sales', handled in card.js + render.js). v1 is
      // hidden on this view (styles.js cutover CSS + device-worksheet
      // V2_TAKEOVER bail) — v2 is the primary surface.
      ,{
        enabled:          true,
        sourceViewKey:    'view_3586',
        mountAfterSelector: '#view_3586',
        label:            'Scope of Work Line Items',
        mdfSourceViewKey: 'view_3602',   // MDF/IDF locations on the sales SOW page
        mdfLabelField:    'field_1642',
        moneyMode:        'sales',
        hideSow:          true,          // no SOW column / pills / sort on this page
        // "+ Add to SOW" toolbar button clicks the add link inside this
        // Knack menu view (same link v1 used). Without it the button
        // falls back to a page-wide link-text scan.
        addSowMenuView:   'view_3450',
        fields: {
          retailPrice:     'field_1960', // PRODUCT STORED_price (read-only)
          lineDiscPct:     'field_2261', // INPUT line discount % (editable)
          lineDiscAmt:     'field_2262', // INPUT line discount $
          lineDiscReason:  'field_2263', // discount reason notes
          appliedDiscount: 'field_2303', // CALC extended discount (read-only)
          total:           'field_2269'  // CALC line total (read-only summary)
        },
        buckets: {
          otherEquip: '5df12ce036f91b0015404d78'   // "Other Equipment"
        }
      }

      // ── Subcontractor SURVEY device worksheet (view_3505) ───────────
      // DIFFERENT object from the SOW line item (Survey Line Item), so
      // independentFields:true — this `fields` map is used AS-IS, no
      // DEFAULT_FIELDS fallback. Mirrors the v1 device-worksheet config
      // (device-worksheet.js view_3505 block) field-for-field.
      //
      // ⚠️ internalOnly:true — gated to @getscw.com staff via
      //    SCW.isInternalUser() in init.js. This is a PREVIEW running
      //    beneath the live v1 worksheet; subcontractors never see it.
      //
      // ⚠️ moneyMode:'survey' — the survey object has no Sub Bid/+Hrs/+Mat
      //    stacks. Money model is Labor (field_2400) · Ext (field_2401) ·
      //    Qty (field_2399), and the line's bid membership is a connection
      //    (field_2415). card.js branches on this (see isSurveyMoney).
      //
      // ⚠️ PARENT/CHILD: Survey Line Items have NO accessory parent/child
      //    denormalization yet (no analogue of the SOW's field_1957↔2197
      //    cascade or field_2464 accessory→parent). connectedDevices
      //    (field_2380, on NVR/switch) and connectedDevice (field_2381,
      //    "Connected To" on a cam/reader) exist as PLAIN Knack
      //    connections — they are NOT backed by mirror-connection-sync.
      //    `accessories`/`children`/`parent`/`accessoryMatch` are
      //    intentionally UNMAPPED here and the survey card path renders no
      //    mounting-hardware/accessory UI. When that relationship is added
      //    to the survey object (see CLAUDE.md), it maps into these same
      //    logical slots — config-only at that point.
      ,{
        // Survey card path lives in card.js (moneyMode:'survey' branch +
        // buildRow_survey/buildDetail_survey + bucket resolution via
        // field_2366; groups.js resolves L1/L2/sort per-view). Gated to
        // @getscw.com (internalOnly) so it previews beneath the live v1
        // worksheet. Editable: labor/qty/desc/drop/conduit/notes + cabling
        // chips (generic edit/chip handlers). Read-only for now: product +
        // connections (SOW-specific picker) — fast-follow.
        enabled:           true,
        internalOnly:      true,            // @getscw.com gate (init.js)
        sourceViewKey:     'view_3505',
        mountAfterSelector: '#view_3505',
        label:             'Survey Line Items (v2 preview)',
        independentFields: true,            // Survey object — no SOW fallback
        moneyMode:         'survey',
        hideSow:           true,            // survey groups by Bid, not SOW
        noAccessories:     true,            // Survey Line Items have no accessory
                                            // relationship yet (CLAUDE.md #16) — hide
                                            // the bulk Add/Remove accessories buttons
        // When a bulk edit CLEARS this connection, require a note ONCE and
        // write it into every clearing row's PUT (so the rows carry the note
        // and survey-bid-validate's bid-gate doesn't re-prompt). Logical names.
        clearNote:         { conn: 'bid', note: 'surveyNotes' },
        mdfSourceViewKey:  'view_3617',     // MDF/IDF locations grid on the survey scene
        mdfLabelField:     'field_1642',    // MDF/IDF full label
        fields: {
          // identity / grouping
          product:        'field_2627',     // REL_product (editable)
          productName:    'field_2379',     // STORED product name (display)
          displayLabel:   'field_2365',     // label (E-001 …)
          labelAlt:       'field_2365',     // same — survey line item label
          bucket:         'field_2366',     // proposal bucket (L2) — NOT SOW's 2219
          sortOrder:      'field_2218',     // CONFIG_sort order (shared key)
          mdfIdf:         'field_2375',     // MDF/IDF location (L1 grouping + move)
          bid:            'field_2415',     // REL_bid — survey grouping connection
          // money / qty (moneyMode:'survey')
          qty:            'field_2399',
          labor:          'field_2400',     // Labor rate
          extended:       'field_2401',     // CALC sub-bid extended (Ext)
          // text
          laborDesc:      'field_2409',
          scwNotes:       'field_2418',
          surveyNotes:    'field_2412',
          // booleans / flags
          existCabling:   'field_2370',
          exterior:       'field_2372',
          plenum:         'field_2371',
          mapConn:        'field_2374',     // FLAG_map camera/reader connections
          requireSubBid:  'field_2478',     // FLAG_require sub bid
          qtyOne:         'field_2373',     // FLAG_limit to quantity one
          locked:         'field_2551',     // FLAG_locked
          warningCount:   'field_2454',     // SYS_incomplete photos
          // connections (plain — NO mirror-sync cascade; see note above)
          connectedDevices: 'field_2380',   // on NVR/switch (multi)
          connectedDevice:  'field_2381',   // "Connected To" on cam/reader (single)
          // detail
          dropLength:     'field_2367',
          conduit:        'field_2368',
          mountingHeight: 'field_2455',     // survey single-chip (Under 16' / 16'-24' / Over 24')
          mounting:       'field_2463',     // INPUT_mounting hardware list (read-only display)
          sowLineItem:    'field_2404',     // REL_sow line item (source of truth) — gates lock/delete
          // photos (shared DOC_photos object — identical keys to SOW)
          photoImage:     'field_771',
          photoType:      'field_2445',
          photoRequired:  'field_2446',
          photoCompleted: 'field_2447',
          photoNotes:     'field_114'
        },
        buckets: {
          // survey shows the same buckets; only the extra ones beyond
          // DEFAULT_BUCKETS need listing.
          otherEquip: '5df12ce036f91b0015404d78'   // "Other Equipment"
        },

        // ── Bulk-edit field spec (config-driven; bulk.js resolves these
        //    LOGICAL names → field keys via cfg.fields and intersects with
        //    what's actually editable on the selected rows). ONLY fields that
        //    are editable in the survey card UI + on the Survey Line Item
        //    object. Excluded: product/ext/mounting hardware (read-only on the
        //    card); Connected Devices/To (edit per-row so the field_2380↔2381
        //    cascade fires); Mounting Height (3-option chip, no bulk widget).
        bulkFields: {
          cam: [
            { f: 'laborDesc',    kind: 'text',        label: 'Labor description' },
            { f: 'labor',        kind: 'number',      label: 'Labor' },
            { f: 'existCabling', kind: 'bool',        label: 'Existing cabling' },
            { f: 'exterior',     kind: 'bool',        label: 'Exterior' },
            { f: 'plenum',       kind: 'bool',        label: 'Plenum' },
            { f: 'dropLength',   kind: 'number',      label: 'Drop length' },
            { f: 'conduit',      kind: 'number',      label: 'Conduit' },
            { f: 'surveyNotes',  kind: 'text',        label: 'Survey notes' },
            { f: 'scwNotes',     kind: 'text',        label: 'SCW Notes' },
            { f: 'mdfIdf',       kind: 'conn-single', label: 'MDF / IDF', candSource: 'mdf' },
            { f: 'bid',          kind: 'conn-multi',  label: 'Bid',       candSource: 'survey-bids' }
          ],
          'default': [
            { f: 'laborDesc',   kind: 'text',        label: 'Labor description' },
            { f: 'labor',       kind: 'number',      label: 'Labor' },
            { f: 'qty',         kind: 'number',      label: 'Qty', gateNo: 'qtyOne' },
            { f: 'surveyNotes', kind: 'text',        label: 'Survey notes' },
            { f: 'scwNotes',    kind: 'text',        label: 'SCW Notes' },
            { f: 'mdfIdf',      kind: 'conn-single', label: 'MDF / IDF', candSource: 'mdf' },
            { f: 'bid',         kind: 'conn-multi',  label: 'Bid',       candSource: 'survey-bids' }
          ],
          services: [
            { f: 'laborDesc',   kind: 'text',        label: 'Service description' },
            { f: 'labor',       kind: 'number',      label: 'Labor' },
            { f: 'qty',         kind: 'number',      label: 'Qty', gateNo: 'qtyOne' },
            { f: 'surveyNotes', kind: 'text',        label: 'Survey notes' },
            { f: 'scwNotes',    kind: 'text',        label: 'SCW Notes' },
            { f: 'mdfIdf',      kind: 'conn-single', label: 'MDF / IDF', candSource: 'mdf' },
            { f: 'bid',         kind: 'conn-multi',  label: 'Bid',       candSource: 'survey-bids' }
          ],
          assumptions: [
            { f: 'laborDesc',   kind: 'text',        label: 'Assumption text' },
            { f: 'surveyNotes', kind: 'text',        label: 'Survey notes' },
            { f: 'scwNotes',    kind: 'text',        label: 'SCW Notes' },
            { f: 'mdfIdf',      kind: 'conn-single', label: 'MDF / IDF', candSource: 'mdf' },
            { f: 'bid',         kind: 'conn-multi',  label: 'Bid',       candSource: 'survey-bids' }
          ]
        }
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
