// ============================================================
// Device Worksheet – compact summary row + expandable detail
// ============================================================
//
// Transforms flat table rows into a two-part layout:
//   1. SUMMARY ROW – always-visible, compact bar with key bid
//      fields that are directly inline-editable.
//   2. DETAIL PANEL – accordion-expandable section with the full
//      set of remaining editable fields (survey, mounting, etc.)
//
// A chevron on the summary row toggles the detail panel and the
// associated inline-photo row (injected by inline-photo-row.js).
//
// INLINE-EDIT PRESERVATION STRATEGY
//   The actual <td> elements are *moved* (reparented) into the
//   worksheet layout — NOT cloned.  This keeps all of Knack's
//   jQuery event bindings alive.  When Knack fires cell-edit or
//   re-renders the view, the whole table is replaced and this
//   script re-runs from scratch.
//
// CONFIGURATION
//   Edit WORKSHEET_CONFIG below. Each entry maps semantic field
//   names to Knack field keys for a given view.
//
(function () {
  'use strict';

  // ============================================================
  // CONFIG – declarative field descriptors per view
  // ============================================================
  //
  // Field descriptor shape (string shorthand or object):
  //   key            – Knack field id  (required)
  //   type           – 'readOnly' | 'directEdit' | 'singleChip' | 'multiChip' | 'toggleChit' | 'chipStack'
  //   summary        – true if the field appears in the summary bar
  //   label          – display label (summary group or detail row)
  //   group          – 'fill' | 'right' (summary bar placement)
  //   groupCls       – extra CSS class on the summary group wrapper
  //   readOnlySummary – render as read-only in summary (no edit affordance)
  //   multiline      – for directEdit: use textarea
  //   options        – for chip types: array of option labels
  //   notes          – detail textarea/notes styling
  //   skipEmpty      – hide detail row if cell is empty
  //   columnIndex    – disambiguate duplicate field keys (e.g. product vs mounting)
  //   feeTrigger     – true if saving this field should refresh the fee
  //   headerTrigger  – true if saving this field should refresh the label
  //   productStyle   – true to apply product identity styling in summary
  //
  // summaryLayout – ordered array of field names rendered in the summary bar
  //   (label and product are handled structurally by the toggle zone)
  // detailLayout  – { left: [...], right: [...] } for detail panel columns
  //
  // ── Layout defaults — views only need to specify properties that differ ──
  var LAYOUT_DEFAULTS = {
    productGroupWidth: '300px',    // fixed width or 'flex'
    productGroupLayout: 'row',     // 'row' | 'column'
    productEditable: false,        // true = editable-field styling on product td
    identityWidth: null,           // null = auto, or '366px' etc.
    labelWidth: '80px',            // label td width
    detailGrid: '1fr 1fr',        // grid-template-columns for detail sections
  };

  var WORKSHEET_CONFIG = {
    views: [
      {
        viewId: 'view_3512',
        layout: { detailGrid: '455px 1fr' },
        fields: {
          // ── Summary row ──
          bid:              { key: 'field_2415', type: 'readOnly',   summary: true, label: 'Bid',   group: 'right', groupCls: 'sum-group--bid' },
          move:             { key: 'field_2375', type: 'moveIcon',   summary: true },
          label:            { key: 'field_2364', type: 'readOnly',   summary: true },
          product:          { key: 'field_2379', type: 'readOnly',   summary: true, productStyle: true, columnIndex: 4 },
          laborDescription: { key: 'field_2409', type: 'directEdit', summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          labor:            { key: 'field_2400', type: 'directEdit', summary: true, label: 'Labor', group: 'right', groupCls: 'sum-group--labor', feeTrigger: true },
          warningCount:     { key: 'field_2454', type: 'warningChit' },

          // ── Detail panel ──
          mounting:         { key: 'field_2463', type: 'readOnly',   columnIndex: 6, skipEmpty: true },
          connections:      { key: 'field_2381', type: 'readOnly' },
          scwNotes:         { key: 'field_2418', type: 'readOnly' },
          surveyNotes:      { key: 'field_2412', type: 'directEdit', notes: true },
          exterior:         { key: 'field_2372', type: 'chipStack' },
          existingCabling:  { key: 'field_2370', type: 'readOnly' },
          plenum:           { key: 'field_2371', type: 'readOnly' },
          mountingHeight:   { key: 'field_2455', type: 'singleChip', options: ["Under 16'", "16' - 24'", "Over 24'"] },
          dropLength:       { key: 'field_2367', type: 'directEdit' },
          conduitFeet:      { key: 'field_2368', type: 'directEdit' }
        },
        summaryLayout: ['laborDescription', 'bid', 'labor'],
        detailLayout: {
          left:  ['mounting', 'scwNotes'],
          right: ['connections', 'exterior', 'mountingHeight', 'dropLength', 'conduitFeet', 'surveyNotes']
        }
      },
      {
        viewId: 'view_3505',
        layout: { productGroupWidth: '400px', detailGrid: '555px 1fr' },
        fields: {
          bid:              { key: 'field_2415', type: 'readOnly',   summary: true, label: 'Bid',   group: 'right', groupCls: 'sum-group--bid' },
          move:             { key: 'field_2375', type: 'moveIcon',   summary: true },
          label:            { key: 'field_2364', type: 'readOnly',   summary: true },
          product:          { key: 'field_2379', type: 'readOnly',   summary: true, productStyle: true, columnIndex: 3 },
          laborDescription: { key: 'field_2409', type: 'directEdit', summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          labor:            { key: 'field_2400', type: 'directEdit', summary: true, label: 'Labor', group: 'right', groupCls: 'sum-group--labor', feeTrigger: true },
          quantity:         { key: 'field_2399', type: 'directEdit', summary: true, label: 'Qty',   group: 'right', groupCls: 'sum-group--qty', feeTrigger: true },
          extended:         { key: 'field_2401', type: 'readOnly',   summary: true, label: 'Extended', group: 'right', groupCls: 'sum-group--ext', readOnlySummary: true },
          warningCount:     { key: 'field_2454', type: 'warningChit' },

          mounting:         { key: 'field_2463', type: 'readOnly',   columnIndex: 5, skipEmpty: true },
          connections:      { key: 'field_2380', type: 'readOnly' },
          scwNotes:         { key: 'field_2418', type: 'readOnly' },
          surveyNotes:      { key: 'field_2412', type: 'directEdit', notes: true },
          exterior:         { key: 'field_2372', type: 'chipStack' },
          existingCabling:  { key: 'field_2370', type: 'readOnly' },
          plenum:           { key: 'field_2371', type: 'readOnly' }
        },
        summaryLayout: ['laborDescription', 'bid', 'labor', 'quantity', 'extended'],
        detailLayout: {
          left:  ['mounting', 'scwNotes'],
          right: ['connections', 'exterior', 'surveyNotes']
        },
        bucketField: 'field_2366',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: [],
            label: 'SERVICE',
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_2400', 'field_2399', 'field_2401'],
            label: 'ASSUMPTION',
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ]
      },
      {
        viewIds: ['view_3559', 'view_3577'],
        layout: { labelWidth: '400px' },
        fields: {
          label:            { key: 'field_1642', type: 'readOnly',   summary: true },

          mdfIdf:           { key: 'field_1641', type: 'singleChip', options: ['HEADEND', 'IDF'], headerTrigger: true },
          mdfNumber:        { key: 'field_2458', type: 'readOnly',   headerTrigger: true },
          name:             { key: 'field_1943', type: 'directEdit', notes: true, headerTrigger: true },
          surveyNotes:      { key: 'field_2457', type: 'directEdit', notes: true }
        },
        summaryLayout: [],
        detailLayout: {
          left:  ['mdfIdf', 'mdfNumber', 'name'],
          right: ['surveyNotes']
        }
      },
      {
        viewId: 'view_3575',
        layout: { /* defaults are fine */ },
        comparisonLayout: true,
        fields: {
          // ── Summary row ──
          label:            { key: 'field_2365', type: 'readOnly',   summary: true },
          product:          { key: 'field_2379', type: 'readOnly',   summary: true, productStyle: true },
          laborDescription: { key: 'field_2409', type: 'directEdit', summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          labor:            { key: 'field_2400', type: 'directEdit', summary: true, label: 'Labor', group: 'right', groupCls: 'sum-group--labor' },

          // ── Detail comparison – SCW side ──
          connections:      { key: 'field_2381', type: 'readOnly' },
          dropLength:       { key: 'field_2367', type: 'readOnly' },
          exterior:         { key: 'field_2372', type: 'chipStack' },
          existingCabling:  { key: 'field_2370', type: 'readOnly' },
          plenum:           { key: 'field_2371', type: 'readOnly' },
          mountingHeight:   { key: 'field_2455', type: 'singleChip', options: ["Under 16'", "16' - 24'", "Over 24'"] },
          conduitFeet:      { key: 'field_2368', type: 'readOnly' },
          scwNotes:         { key: 'field_2412', type: 'readOnly' },

          // ── Detail comparison – Survey side ──
          surveyLabel:      { key: 'field_1950', type: 'readOnly' },
          surveyProduct:    { key: 'field_1958', type: 'readOnly' },
          surveyConnections:{ key: 'field_2197', type: 'readOnly' },
          surveyDropLength: { key: 'field_1965', type: 'readOnly' },
          surveyChips:      { key: 'field_1972', type: 'readOnly' },
          surveyNotes:      { key: 'field_1953', type: 'readOnly' }
        },
        summaryLayout: ['laborDescription', 'labor']
      },
      {
        viewId: 'view_3313',
        layout: { productGroupWidth: '280px', productGroupLayout: 'column', productEditable: true },
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          sow:              { key: 'field_2154', type: 'readOnly',    summary: true, label: 'SOW',  group: 'right', groupCls: 'sum-group--sow' },
          mountCableBoth:   { key: 'field_1968', type: 'readOnly',    summary: true, label: 'MCB',  group: 'pre',   groupCls: 'sum-group--mcb' },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          laborCategory:    { key: 'field_2462', type: 'readOnly',    summary: true, label: 'Cat',  group: 'right', groupCls: 'sum-group--cat' },
          laborVariables:   { key: 'field_1972', type: 'multiChip',   summary: true, label: 'Vars', group: 'right', groupCls: 'sum-group--vars',
                              options: ['Exterior', 'High Traffic', 'Plenum'], feeTrigger: true },
          existingCabling:  { key: 'field_2461', type: 'toggleChit',  summary: true, feeTrigger: true },
          subBid:           { key: 'field_2150', type: 'directEdit',  summary: true, label: 'Sub Bid', group: 'right', groupCls: 'sum-group--sub-bid', feeTrigger: true },
          plusHrs:           { key: 'field_1973', type: 'directEdit',  summary: true, label: '+Hrs', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true },
          plusMat:           { key: 'field_1974', type: 'directEdit',  summary: true, label: '+Mat', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true },
          installFee:       { key: 'field_2028', type: 'readOnly',    summary: true, label: 'Fee',  group: 'right', groupCls: 'sum-group--fee', readOnlySummary: true },
          move:             { key: 'field_1946', type: 'moveIcon',    summary: true },

          // ── Detail panel ──
          dropPrefix:       { key: 'field_2240', type: 'readOnly' },
          dropNumber:       { key: 'field_1951', type: 'directEdit' },
          dropLength:       { key: 'field_1965', type: 'directEdit',  feeTrigger: true },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' },
          connectedDevice:  { key: 'field_2197', type: 'nativeEdit' },
          scwNotes:         { key: 'field_1953', type: 'directEdit',  notes: true }
        },
        summaryLayout: ['mountCableBoth', 'laborDescription', 'existingCabling',
                         'laborCategory', 'laborVariables', 'sow', 'subBid', 'plusHrs', 'plusMat', 'installFee'],
        detailLayout: {
          left:  ['dropPrefix', 'dropNumber', 'mountingHardware'],
          right: ['connectedDevice', 'dropLength', 'scwNotes']
        }
      },
      {
        viewId: 'view_3332',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', productEditable: true, identityWidth: '366px' },
        fields: {
          // ── Summary row ──
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true, columnIndex: 3 },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          sow:              { key: 'field_2154', type: 'readOnly',    summary: true, label: 'SOW',  group: 'right', groupCls: 'sum-group--sow' },
          quantity:         { key: 'field_1964', type: 'directEdit',  summary: true, label: 'Qty',  group: 'right', groupCls: 'sum-group--qty', feeTrigger: true },
          subBid:           { key: 'field_2150', type: 'directEdit',  summary: true, label: 'Sub Bid', group: 'right', groupCls: 'sum-group--sub-bid', feeTrigger: true,
                              stackWith: 'subBidTotal' },
          subBidTotal:      { key: 'field_2151', type: 'readOnly',    label: 'TOTAL' },
          plusHrs:           { key: 'field_1973', type: 'directEdit',  summary: true, label: '+Hrs', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true,
                              stackWith: 'hrsTtl' },
          hrsTtl:           { key: 'field_1997', type: 'readOnly',    label: 'TOTAL' },
          plusMat:           { key: 'field_1974', type: 'directEdit',  summary: true, label: '+Mat', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true,
                              stackWith: 'matTtl' },
          matTtl:           { key: 'field_2146', type: 'readOnly',    label: 'TOTAL' },
          installFee:       { key: 'field_2028', type: 'readOnly',    summary: true, label: 'Fee',  group: 'right', groupCls: 'sum-group--fee', readOnlySummary: true },
          move:             { key: 'field_1946', type: 'moveIcon',    summary: true },

          // ── Detail panel ──
          scwNotes:         { key: 'field_1953', type: 'directEdit',  notes: true },
          connectedDevice:  { key: 'field_1957', type: 'nativeEdit' },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' }
        },
        summaryLayout: ['laborDescription', 'sow', 'quantity', 'subBid', 'plusHrs', 'plusMat', 'installFee'],
        detailLayout: {
          left:  ['connectedDevice', 'mountingHardware'],
          right: ['scwNotes']
        },
        bucketField: 'field_2219',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_1949'],
            label: 'SERVICE',
            descLabel: 'Description of Service',
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_1964', 'field_2150', 'field_2151', 'field_1973', 'field_1997', 'field_1974', 'field_2146', 'field_2028'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ]
      },
      {
        viewId: 'view_3586',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', productEditable: true, identityWidth: '366px' },
        stackedSummary: false,
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          scwNotes:         { key: 'field_1953', type: 'directEdit',  summary: true, label: 'SCW Notes', group: 'fill', multiline: true },
          lineItemTotal:    { key: 'field_2269', type: 'readOnly',    summary: true, label: 'Total',    group: 'right', groupCls: 'sum-group--total', readOnlySummary: true },
          move:             { key: 'field_1946', type: 'moveIcon',    summary: true },

          // ── Detail panel ──
          retailPrice:      { key: 'field_1960', type: 'readOnly' },
          quantity:         { key: 'field_1964', type: 'directEdit', feeTrigger: true },
          customDiscPct:    { key: 'field_2261', type: 'directEdit', feeTrigger: true },
          customDiscDlr:    { key: 'field_2262', type: 'directEdit', feeTrigger: true },
          appliedDiscount:  { key: 'field_2303', type: 'readOnly' },
          connectedDevice:  { key: 'field_1957', type: 'nativeEdit' },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' },
          laborDescription: { key: 'field_2020', type: 'directEdit',  notes: true }
        },
        summaryLayout: ['scwNotes', 'lineItemTotal'],
        detailLayout: {
          left:  ['retailPrice', 'quantity', 'customDiscPct', 'appliedDiscount', 'connectedDevice', 'mountingHardware'],
          right: ['laborDescription']
        },
        bucketField: 'field_2219',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_1949'],
            label: 'SERVICE',
            descLabel: 'Description of Service',
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_1964', 'field_2261', 'field_2262', 'field_2303', 'field_2269', 'field_1960'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ]
      },
      {
        viewId: 'view_3588',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', productEditable: true, identityWidth: '366px' },
        stackedSummary: false,
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          scwNotes:         { key: 'field_1953', type: 'directEdit',  summary: true, label: 'SCW Notes', group: 'fill', multiline: true },
          existingCabling:  { key: 'field_2461', type: 'toggleChit',  summary: true, feeTrigger: true },
          exteriorChit:     { key: 'field_1984', type: 'toggleChit',  summary: true, feeTrigger: true, chitLabel: 'Exterior' },
          lineItemTotal:    { key: 'field_2269', type: 'readOnly',    summary: true, label: 'Total',    group: 'right', groupCls: 'sum-group--total', readOnlySummary: true },
          move:             { key: 'field_1946', type: 'moveIcon',    summary: true },

          // ── Detail panel – left ──
          retailPrice:      { key: 'field_1960', type: 'readOnly' },
          discountDlr:      { key: 'field_2261', type: 'directEdit', feeTrigger: true },
          appliedDiscount:  { key: 'field_2303', type: 'readOnly' },
          total:            { key: 'field_2269', type: 'readOnly' },
          dropPrefix:       { key: 'field_2240', type: 'directEdit' },
          dropNumber:       { key: 'field_1951', type: 'directEdit' },

          // ── Detail panel – right ──
          connectedDevice:  { key: 'field_2197', type: 'nativeEdit' },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' },
          dropLength:       { key: 'field_1965', type: 'directEdit', skipEmpty: true },
          laborDescription: { key: 'field_2020', type: 'directEdit', skipEmpty: true, notes: true }
        },
        summaryLayout: ['scwNotes', 'existingCabling', 'exteriorChit', 'lineItemTotal'],
        detailLayout: {
          left:   ['dropPrefix', 'dropNumber', 'retailPrice', 'discountDlr', 'appliedDiscount', 'total'],
          right:  ['connectedDevice', 'mountingHardware', 'dropLength', 'laborDescription']
        }
      },
      {
        viewId: 'view_3596',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', identityWidth: '366px' },
        stackedSummary: false,
        photoAlwaysVisible: true,
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Description of Work', group: 'fill', multiline: true },
          existingCabling:  { key: 'field_2461', type: 'toggleChit',  summary: true, showOnlyIfYes: true },

          // ── Detail panel ──
          connectedDevice:  { key: 'field_2197', type: 'readOnly' },
          mountingHardware: { key: 'field_1958', type: 'readOnly' },
          scwNotes:         { key: 'field_1953', type: 'readOnly',  notes: true }
        },
        summaryLayout: ['laborDescription', 'existingCabling'],
        detailLayout: {
          left:  ['connectedDevice', 'mountingHardware'],
          right: ['scwNotes']
        }
      }
    ]
  };

  // ── Normalise config ──
  //  1. Expand viewIds → one entry per viewId (shared fields/layout by reference)
  //  2. Merge layout defaults so every view has a complete layout object
  //  3. Compute derived arrays (feeTriggerFields, headerTriggerFields)

  // Step 1: Expand viewIds
  var expandedViews = [];
  WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
    var ids = viewCfg.viewIds || (viewCfg.viewId ? [viewCfg.viewId] : []);
    ids.forEach(function (id) {
      // Shallow copy so each entry has its own viewId but shares fields etc.
      var copy = {};
      for (var k in viewCfg) { if (viewCfg.hasOwnProperty(k)) copy[k] = viewCfg[k]; }
      copy.viewId = id;
      delete copy.viewIds;
      expandedViews.push(copy);
    });
  });
  WORKSHEET_CONFIG.views = expandedViews;

  // Step 2: Merge layout defaults
  WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
    var merged = {};
    for (var dk in LAYOUT_DEFAULTS) {
      if (LAYOUT_DEFAULTS.hasOwnProperty(dk)) merged[dk] = LAYOUT_DEFAULTS[dk];
    }
    var src = viewCfg.layout || {};
    for (var sk in src) {
      if (src.hasOwnProperty(sk)) merged[sk] = src[sk];
    }
    viewCfg.layout = merged;
  });

  // Step 3: Compute derived arrays from field descriptors
  WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
    var feeTriggers = [];
    var headerTriggers = [];
    var f = viewCfg.fields;
    Object.keys(f).forEach(function (name) {
      var desc = f[name];
      if (typeof desc === 'string') { f[name] = { key: desc, type: 'readOnly' }; desc = f[name]; }
      if (desc.feeTrigger)    feeTriggers.push(desc.key);
      if (desc.headerTrigger) headerTriggers.push(desc.key);
    });
    if (feeTriggers.length)    viewCfg.feeTriggerFields  = feeTriggers;
    if (headerTriggers.length) viewCfg.headerTriggerFields = headerTriggers;
  });

  // ============================================================
  // CONSTANTS
  // ============================================================
  var STYLE_ID       = 'scw-device-worksheet-css';
  var WORKSHEET_ROW  = 'scw-ws-row';
  var PROCESSED_ATTR = 'data-scw-worksheet';
  var EVENT_NS       = '.scwDeviceWorksheet';
  var P              = 'scw-ws';  // class prefix

  // SVG chevron (matches group-collapse.js style)
  var CHEVRON_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 2 8 6 4 10"/></svg>';

  // ============================================================
  // CSS – injected once
  // ============================================================
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = `
/* ── Hide raw Knack rows until transformView processes them ── */
/* Prevents flash of unstyled/duplicate inputs during re-render */
${WORKSHEET_CONFIG.views.map(function (v) {
  return '#' + v.viewId + ' tbody > tr:not([${PROCESSED_ATTR}]):not(.${WORKSHEET_ROW}):not(.kn-table-group):not(.scw-inline-photo-row):not(.kn-table-totals) { visibility: hidden; height: 0; overflow: hidden; }';
}).join('\n')}

/* ── Hide the original data row (cells moved out, shell stays) ── */
tr[${PROCESSED_ATTR}="1"] {
  display: none !important;
}

/* ── Kill ALL residual Knack hover / striping ── */
tr.${WORKSHEET_ROW},
tr.${WORKSHEET_ROW}:hover,
tr.scw-inline-photo-row,
tr.scw-inline-photo-row:hover,
tr[data-scw-worksheet],
tr[data-scw-worksheet]:hover {
}
tr.${WORKSHEET_ROW} > td:not(.bulkEditSelectedRow),
tr.${WORKSHEET_ROW}:hover > td:not(.bulkEditSelectedRow),
tr.scw-inline-photo-row > td,
tr.scw-inline-photo-row:hover > td {
  background: #fff !important;
  background-color: #fff !important;
}
tr[data-scw-worksheet] > td:not(.bulkEditSelectedRow),
tr[data-scw-worksheet]:hover > td:not(.bulkEditSelectedRow) {
  background: none !important;
  background-color: transparent !important;
}

/* ── Worksheet row <td> — zero padding so the card fills it ── */
.${WORKSHEET_ROW} > td {
  padding: 0 !important;
  border: none !important;
}

/* ── Photo row — original <tr> hidden; content moved into card ── */
tr.scw-inline-photo-row.${P}-photo-absorbed {
  display: none !important;
}
tr.scw-inline-photo-row > td {
  padding: 20px 16px 50px 16px !important;
  border: none !important;
  border-bottom: 2px solid #e2e8f0 !important;
}

/* ── Photo content moved inside card ── */
.${P}-photo-wrap {
  padding: 20px 16px 50px 16px;
  background: #fff;
}
.${P}-photo-wrap.${P}-photo-hidden {
  display: none;
}

/* ── Card wrapper ── */
.${P}-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  min-width: 0;
  overflow: hidden;
}

/* ── Bottom separator between record groups (card + photo row) ── */
.${WORKSHEET_ROW}.${P}-last > td {
  border-bottom: 2px solid #e2e8f0 !important;
}

/* ================================================================
   SUMMARY BAR – single-row layout
   [checkbox] [chevron] [label · product] [labor desc] → push right → [bid] [labor] [qty] [ext] [move]
   ================================================================ */
.${P}-summary {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  padding: 15px 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  min-height: 38px;
  min-width: 0;
  transition: background 0.15s, box-shadow 0.2s;
}
.${P}-summary:hover {
  background: #f1f5f9;
}

/* ── Expanded: header + detail + photo strip pop out as one unit ── */
tr.${WORKSHEET_ROW}:has(.${P}-open) {
  z-index: 1;
  position: relative;
}
.${P}-card:has(.${P}-open) {
  box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
  border-radius: 8px;
  border: 1px solid #d1d5db;
  margin-bottom: 10px;
}
/* Remove internal borders when expanded */
.${P}-card:has(.${P}-open) .${P}-summary {
  background: #fff;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
}
/* Photo wrap gets bottom border-radius when card is expanded */
.${P}-card:has(.${P}-open) .${P}-photo-wrap:not(.${P}-photo-hidden) {
  border-radius: 0 0 8px 8px;
}
/* If no photo wrap visible, detail gets bottom radius */
.${P}-card:has(.${P}-open) .${P}-detail:last-child,
.${P}-card:has(.${P}-open) .${P}-detail:has(+ .${P}-photo-wrap.${P}-photo-hidden) {
  border-radius: 0 0 8px 8px;
}

/* Right-aligned group: bid, labor, qty, ext, move pushed to far right */
.${P}-sum-right {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 1;
  min-width: 0;
}
/* Each field group in the right section gets fixed width for vertical alignment */
.${P}-sum-right .${P}-sum-group {
  width: fit-content;
}
/* Bid group can be a bit narrower */
.${P}-sum-right .${P}-sum-group--bid {
  width: 70px;
  min-width: 70px;
}
/* Bid field grows in height when multiple selections are present */
.${P}-sum-group--bid td.${P}-sum-field {
  height: auto;
  min-height: 30px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
/* Qty group narrower */
.${P}-sum-right .${P}-sum-group--qty {
  width: 50px;
  min-width: 50px;
}
/* Fields inside right groups stretch to fill their group */
.${P}-sum-right td.${P}-sum-field,
.${P}-sum-right td.${P}-sum-field-ro {
  width: 100%;
  min-width: 0;
  height: fit-content;
}

/* ── KTL bulk-edit checkbox cell ── */
td.${P}-sum-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  flex: 0 0 auto;
  padding: 5px 4px 0 4px !important;
  border: none !important;
  background: transparent !important;
  min-width: 20px;
}
td.${P}-sum-check input[type="checkbox"] {
  width: 15px !important;
  height: 15px !important;
  margin: 2px 0 0;
  cursor: pointer;
}

/* Clickable toggle zone (chevron + identity) — fixed width so labor desc aligns */
.${P}-toggle-zone {
  display: flex;
  align-items: flex-start;
  align-self: flex-start;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  flex: 0 1 auto;
  min-width: 0;
}
.${P}-toggle-zone:hover .${P}-chevron {
  color: #6b7280;
}

/* Chevron toggle */
.${P}-chevron {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: #9ca3af;
  transition: transform 200ms ease, color 150ms ease;
  transform: rotate(0deg);
  padding-top: 5px;
}
.${P}-chevron.${P}-collapsed {
  transform: rotate(0deg);
}
.${P}-chevron.${P}-expanded {
  transform: rotate(90deg);
  color: #6b7280;
}

/* Fixed-width warning slot between chevron and identity — always present */
.${P}-warn-slot {
  flex: 0 0 18px;
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
}
.${P}-warn-slot:empty {
  visibility: hidden;
}
.${P}-warn-slot .scw-cr-hdr-warning {
  margin-left: 0;
}

/* Label + Product identity block */
.${P}-identity {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex: 0 1 auto;
  min-width: 0;
}

/* Warning chit (field_2454 count > 0) */
.${P}-warn-chit {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px 1px 5px;
  font-size: 12px;
  font-weight: 700;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.4;
}
.${P}-warn-chit svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}
/* Wrapper so chit + product share the product's fixed width */
.${P}-product-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}
/* Product group column layout variant */
.${P}-product-group--column {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}
.${P}-product-group--column > td.${P}-sum-product {
  width: 100% !important;
  flex: none;
}
/* Product group flex variant (fills identity width) */
.${P}-product-group--flex {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  max-width: none;
}
.${P}-product-group > td.${P}-sum-product {
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Label td in summary — primary styling, fixed width for alignment */
td.${P}-sum-label-cell,
td.${P}-sum-label-cell:hover {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #1e4d78;
  cursor: pointer !important;
  border: none !important;
  background: transparent !important;
  padding: 0 2px;
  white-space: nowrap;
  width: 80px;
  min-width: 80px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Product td in summary — fixed width so labor desc and right fields align vertically */
td.${P}-sum-product,
td.${P}-sum-product:hover {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #1e4d78;
  cursor: pointer !important;
  border: none !important;
  background: transparent !important;
  padding: 0 2px;
  width: 400px;
  min-width: 400px;
  max-width: 400px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
/* view_3512: product width managed by product-group wrapper */

/* Separator dot */
.${P}-sum-sep {
  color: #d1d5db;
  font-size: 12px;
  user-select: none;
  flex-shrink: 0;
}

/* ── Standardized editable field cell height ── */
td.${P}-sum-field {
  display: inline-flex;
  align-items: center;
  position: relative;
  padding: 2px 8px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: rgba(134, 182, 223, 0.1);
  white-space: nowrap;
  height: 30px;
  min-width: 40px;
  box-sizing: border-box;
  transition: border-color 0.15s, background-color 0.15s;
}
td.${P}-sum-field.cell-edit:hover,
td.${P}-sum-field.ktlInlineEditableCellsStyle:hover {
  background-color: rgba(134, 182, 223, 0.18) !important;
  border-color: #93c5fd !important;
  cursor: pointer;
}
/* Empty summary fields */
td.${P}-sum-field.${P}-empty {
  color: #9ca3af;
  font-style: italic;
}

/* Read-only summary field (non-editable, e.g. Extended total) */
td.${P}-sum-field-ro {
  display: inline-flex;
  align-items: center;
  position: relative;
  padding: 2px 8px !important;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  white-space: nowrap;
  height: 30px;
  min-width: 40px;
  box-sizing: border-box;
}

/* Labor desc field — fills available space between identity and right-aligned fields */
td.${P}-sum-field--desc {
  white-space: normal;
  word-break: break-word;
  height: auto;
  min-height: 30px;
}

/* Summary field label (tiny, above or inline) */
.${P}-sum-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #374151;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Summary field group: label + value stacked */
.${P}-sum-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  min-width: 0;
  flex-shrink: 0;
}

/* Labor desc group — fills middle space, pushes right group to far right.
   align-self:stretch makes it match the tallest sibling (e.g. stacked chips). */
.${P}-sum-group--fill {
  flex: 1 1 0;
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
}
/* Fill td + textarea stretch to fill the group height */
.${P}-sum-group--fill td.${P}-sum-direct-edit {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
}
.${P}-sum-group--fill td.${P}-sum-direct-edit .${P}-direct-textarea {
  flex: 0 0 auto;
}

/* Move td sits at the right end */
td.${P}-sum-move {
  display: inline-flex !important;
  align-items: center;
  align-self: flex-start;
  padding: 0 4px;
  border: none !important;
  background: transparent !important;
  flex-shrink: 0;
}

/* ── Delete button (extracted from Knack row) ── */
.${P}-sum-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  flex-shrink: 0;
  padding: 0 4px;
  border: none !important;
  background: transparent !important;
}
.${P}-sum-delete a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 14px;
  transition: color 150ms ease;
}
.${P}-sum-delete a:hover {
  color: #ef4444;
}

/* ── Cabling group alignment (match variables column) ── */
.${P}-sum-group--cabling {
  align-self: stretch;
  display: flex;
  align-items: center;
}

/* ── Toggle chit (boolean, inline in summary bar) ── */
.${P}-cabling-chit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.02em;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  border: 1px solid transparent;
  text-align: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
  height: 100%;
  box-sizing: border-box;
  vertical-align: middle;
}
.${P}-cabling-chit.is-yes {
  background: #059669;
  color: #ffffff;
  border-color: #047857;
  box-shadow: 0 1px 2px rgba(5, 150, 105, 0.2);
}
.${P}-cabling-chit.is-yes:hover {
  background: #047857;
  box-shadow: 0 2px 4px rgba(5, 150, 105, 0.3);
}
.${P}-cabling-chit.is-no {
  background: #ffffff;
  color: #6b7280;
  border-color: #d1d5db;
}
.${P}-cabling-chit.is-no:hover {
  background: #f9fafb;
  color: #374151;
  border-color: #9ca3af;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.${P}-cabling-chit.is-saving {
  opacity: 0.6;
  pointer-events: none;
}
.${P}-cabling-chit.is-readonly {
  cursor: default;
  pointer-events: none;
}

/* ── Summary chip host td — visible for KTL bulk-edit but visually transparent ── */
td.${P}-sum-chip-host {
  display: inline-flex !important;
  align-items: center;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  min-height: 0 !important;
  vertical-align: middle;
}
td.${P}-sum-chip-host:hover,
td.${P}-sum-chip-host.ktlInlineEditableCellsStyle,
td.${P}-sum-chip-host.cell-edit {
  background: transparent !important;
}
/* KTL bulk-edit highlight on chip host */
td.${P}-sum-chip-host.ktlInlineEditableCellsStyle:hover,
td.${P}-sum-chip-host.bulkEditSelectSrc {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
  border-radius: 4px !important;
}
/* When KTL bulk-edit is active on chip hosts, disable chit/chip interaction */
td.${P}-sum-chip-host.bulkEditSelectSrc .${P}-cabling-chit,
td.${P}-sum-chip-host.bulkEditSelectSrc .${P}-radio-chip {
  pointer-events: none !important;
  cursor: cell !important;
}

/* ── field_1972 (Labor Variables): ensure no blue background leaks through ── */
#view_3313 .${P}-sum-group--vars td,
#view_3313 .${P}-sum-group--vars td[style] {
}

/* ── Summary-bar radio chips (Labor Variables) ── */
.${P}-sum-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
  align-self: center;
}
.${P}-sum-chips .${P}-radio-chip {
  flex: 1 1 calc(50% - 2px);
  min-width: 0;
  text-align: center;
  box-sizing: border-box;
}

/* ── Synthetic group divider bars ── */
tr.scw-synth-divider > td {
  height: 6px;
  padding: 0 !important;
  background: #d1d5db;
  border: none !important;
  line-height: 0;
  font-size: 0;
}

/* ================================================================
   DETAIL PANEL – expandable section
   ================================================================ */
.${P}-detail {
  display: none;
  border-top: 10px solid #ffffff;
}
.${P}-detail.${P}-open {
  display: block;
}

/* ── Sections grid ── */
.${P}-sections {
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1fr);
  gap: 0;
  overflow: hidden;
}
@media (max-width: 1200px) {
  .${P}-sections {
    grid-template-columns: 1fr;
  }
}

/* ── Individual section ── */
.${P}-section {
  padding: 14px 20px 14px 16px;
  min-width: 0;
}
.${P}-section:last-child {
}

.${P}-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #4b5563;
  padding-bottom: 6px;
  margin-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
}

/* ── Field row inside a section ── */
.${P}-field {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: flex-start;
  min-height: 24px;
}
.${P}-field:last-child {
  margin-bottom: 0;
}

.${P}-field-label {
  flex: 0 0 100px;
  width: 100px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-top: 5px;
  white-space: pre-line;
  line-height: 1.3;
}

/* ── The moved <td> becomes the field value container ── */
.${P}-field-value {
  flex: 1;
  font-size: 13px;
  color: #1f2937;
  line-height: 1.5;
  min-width: 0;
  word-break: break-word;
}

td.${P}-field-value {
  display: block;
  padding: 4px 8px;
  min-height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  text-align: left !important;
  justify-content: flex-start !important;
}

/* ── Editable field affordance (border + background only for editable cells) ── */
td.${P}-field-value.cell-edit,
td.${P}-field-value.ktlInlineEditableCellsStyle {
  border: 1px solid #e5e7eb;
  background: rgba(134, 182, 223, 0.1);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}
td.${P}-field-value.cell-edit:hover,
td.${P}-field-value.ktlInlineEditableCellsStyle:hover {
  background-color: rgba(134, 182, 223, 0.18) !important;
  border-color: #93c5fd !important;
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25);
}
/* Detail-section direct-edit inputs/textareas — blue tint to match summary bar */
.${P}-detail .${P}-direct-input,
.${P}-detail .${P}-direct-textarea {
  background-color: rgba(134, 182, 223, 0.1);
}

/* ── Chip host td — invisible cell, chips aligned with fields ── */
td.${P}-chip-host {
  display: block !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  min-height: 0 !important;
}
td.${P}-chip-host:hover {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.${P}-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 0;
}

/* ── Notes fields — allow more vertical space ── */
td.${P}-field-value--notes {
  font-size: 13px;
  line-height: 1.5;
  max-height: 120px;
  overflow-y: auto;
}

/* ── Empty field value ── */
.${P}-field-value--empty {
  color: #9ca3af;
  font-style: italic;
}

/* ── Radio chips (Mounting Height / Labor Variables) ── */
.${P}-radio-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 0;
}
.${P}-radio-chip {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.02em;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  white-space: nowrap;
  border: 1px solid transparent;
  text-align: center;
}
.${P}-radio-chip.is-selected {
  background: #059669;
  color: #ffffff;
  border-color: #047857;
  box-shadow: 0 1px 2px rgba(5, 150, 105, 0.2);
}
.${P}-radio-chip.is-selected:hover {
  background: #047857;
  box-shadow: 0 2px 4px rgba(5, 150, 105, 0.3);
}
.${P}-radio-chip.is-unselected {
  background: #ffffff;
  color: #6b7280;
  border-color: #d1d5db;
}
.${P}-radio-chip.is-unselected:hover {
  background: #f9fafb;
  color: #374151;
  border-color: #9ca3af;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.${P}-radio-chip.is-saving {
  opacity: 0.6;
  pointer-events: none;
}

/* ── Direct-edit inputs (type-and-save text fields) ── */
.${P}-direct-input,
.${P}-direct-textarea {
  width: 100%;
  font-size: 13px;
  font-family: inherit;
  color: #1f2937;
  line-height: 1.5;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: rgba(134, 182, 223, 0.1);
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}
.${P}-direct-input:focus,
.${P}-direct-textarea:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25);
}
.${P}-direct-input.is-saving,
.${P}-direct-textarea.is-saving {
  background-color: #dcfce7 !important;
  border-color: #4ade80 !important;
}
.${P}-direct-input.is-error,
.${P}-direct-textarea.is-error {
  background-color: #fef2f2 !important;
  border-color: #fca5a5 !important;
  box-shadow: 0 0 0 2px rgba(252, 165, 165, 0.25);
}
.${P}-direct-error {
  font-size: 11px;
  color: #dc2626;
  margin-top: 3px;
  line-height: 1.3;
}
.${P}-direct-textarea {
  resize: vertical;
  min-height: 28px;
  max-height: 200px;
}

/* ── Summary bar inline direct-edit inputs ── */
td.${P}-sum-direct-edit {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
}
td.${P}-sum-direct-edit .${P}-direct-input,
td.${P}-sum-direct-edit .${P}-direct-textarea {
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 500;
  width: 100%;
  box-sizing: border-box;
  display: block;
}
td.${P}-sum-direct-edit .${P}-direct-input {
  height: 28px;
}
td.${P}-sum-direct-edit .${P}-direct-textarea {
  resize: vertical;
  min-height: 28px;
  line-height: 1.3;
  white-space: pre-wrap;
  word-wrap: break-word;
}
td.${P}-sum-direct-edit .${P}-direct-error {
  position: absolute;
  top: 100%;
  left: 0;
  white-space: nowrap;
  z-index: 10;
  background: #fff;
  padding: 2px 4px;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
/* When KTL bulk-edit copy mode is active (KTL adds bulkEditSelectSrc
   to cell-edit tds), disable input interaction so td handles clicks. */
td.${P}-sum-direct-edit.bulkEditSelectSrc {
  cursor: cell !important;
}
td.${P}-sum-direct-edit.bulkEditSelectSrc .${P}-direct-input,
td.${P}-sum-direct-edit.bulkEditSelectSrc .${P}-direct-textarea {
  pointer-events: none !important;
  cursor: cell !important;
}

/* ── KTL bulk-edit selected-row yellow highlight ──
   KTL adds .bulkEditSelectedRow to the moved tds inside the card.
   Use :has() to detect that and make all opaque layers transparent,
   then paint the outer td yellow.  Works identically across all
   worksheet views (3512, 3505, 3313). */
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) > td {
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-card {
  background: transparent;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-summary,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-summary:hover {
  background: transparent;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-field:not(.bulkEditSelectedRow) {
  background: transparent !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-field.cell-edit:not(.bulkEditSelectedRow):hover,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-field.ktlInlineEditableCellsStyle:not(.bulkEditSelectedRow):hover {
  background-color: transparent !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-product:not(.bulkEditSelectedRow) {
  background: transparent !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-product.cell-edit:not(.bulkEditSelectedRow):hover,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-product.ktlInlineEditableCellsStyle:not(.bulkEditSelectedRow):hover {
  background-color: transparent !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-field-value:not(.bulkEditSelectedRow) {
  background: transparent;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-field-value.cell-edit:not(.bulkEditSelectedRow),
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-field-value.ktlInlineEditableCellsStyle:not(.bulkEditSelectedRow) {
  background: transparent;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-direct-input,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-direct-textarea {
  background-color: transparent !important;
}
/* Detail-panel: hidden td still receives bulkEditSelectedRow from KTL —
   propagate yellow to the visible wrapper via :has() */
.${P}-field-value:has(td.bulkEditSelectedRow) {
  background-color: rgb(255, 253, 204) !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-comp-row > .${P}-comp-val:last-child,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val:last-child {
  background: transparent;
}


/* ── Photo row hidden when detail collapsed (legacy fallback) ── */
tr.scw-inline-photo-row.${P}-photo-hidden {
  display: none !important;
}

/* ================================================================
   COMPARISON LAYOUT (view_3575) – side-by-side SCW vs Survey
   ================================================================ */
.${P}-comp {
  display: grid;
  grid-template-columns: 110px 1fr 1fr;
  gap: 0;
  padding: 8px 16px 12px;
}
.${P}-comp-header {
  display: contents;
}
.${P}-comp-header > div {
  padding: 8px 8px 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #4b5563;
  border-bottom: 2px solid #e5e7eb;
}
.${P}-comp-row {
  display: contents;
}
.${P}-comp-row > div {
  padding: 6px 8px;
  border-bottom: 1px solid #f3f4f6;
  min-height: 28px;
  display: flex;
  align-items: flex-start;
}
.${P}-comp-label {
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-top: 10px !important;
  white-space: pre-line;
  line-height: 1.3;
}
.${P}-comp-val {
  min-width: 0;
  word-break: break-word;
}
.${P}-comp-val > td.${P}-field-value {
  display: block;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  min-height: 24px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.${P}-comp-text {
  display: block;
  padding: 4px 8px;
  font-size: 13px;
  color: #1f2937;
  line-height: 1.5;
}
.${P}-comp-text--empty {
  color: #9ca3af;
  font-style: italic;
}

/* Survey column subtle background to visually distinguish sides */
.${P}-comp-row > .${P}-comp-val:last-child {
  background: #fafbfc;
}

/* Highlight mismatched rows for quick discrepancy identification */
.${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val {
  background: #fffbeb;
}
.${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val:last-child {
  background: #fef3c7;
}

/* ── Product editable styling (shared class, applied via layout.productEditable) ── */
td.${P}-sum-product--editable,
td.${P}-sum-product--editable:hover {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  border: 1px solid #e5e7eb !important;
  border-radius: 4px;
  background: rgba(134, 182, 223, 0.1) !important;
  padding: 2px 8px;
  height: auto;
  min-height: 30px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s, background-color 0.15s;
}
td.${P}-sum-product--editable.cell-edit:hover,
td.${P}-sum-product--editable.ktlInlineEditableCellsStyle:hover {
  background-color: rgba(134, 182, 223, 0.18) !important;
  border-color: #93c5fd !important;
  cursor: pointer;
}
td.${P}-sum-product--editable.bulkEditSelectSrc {
  outline-offset: 1px;
  cursor: cell !important;
  background-color: rgb(255, 253, 204) !important;
}



/* Fee label — align with value text (match td padding-left) */
.${P}-sum-group--fee > .${P}-sum-label {
  padding-left: 8px;
  text-align: center;
  width: 100%;
}

/* Per-group width overrides (scoped under .sum-right for specificity) */
.${P}-sum-right .${P}-sum-group--narrow {
  width: 50px;
  min-width: 50px;
}
.${P}-sum-right .${P}-sum-group--sub-bid {
  width: min-content;
  min-width: 70px;
}
.${P}-sum-right .${P}-sum-group--cat {
  width: 70px;
  min-width: 70px;
}
.${P}-sum-right .${P}-sum-group--vars {
  width: 100px;
  min-width: 100px;
  overflow: hidden;
}
.${P}-sum-right .${P}-sum-group--fee {
  width: min-content;
  min-width: 70px;
}
.${P}-sum-right .${P}-sum-group--sow {
  width: 100px;
  min-width: 100px;
  flex-shrink: 0;
}
/* SOW field grows in height to show multiple connection values */
.${P}-sum-group--sow td.${P}-sum-field {
  height: auto;
  min-height: 30px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
.${P}-sum-group--mcb {
  width: 80px;
  min-width: 80px;
}

@media (max-width: 900px) {
  .${P}-comp {
    grid-template-columns: 90px 1fr 1fr;
  }
}

/* ── Stacked pair groups (label → input → TTL label → value, single column) ── */
.${P}-sum-group--stacked-pair {
  display: flex !important;
  flex-direction: column !important;
  align-items: center;
  gap: 0;
}
/* TOTAL label — padding above, minimal below, centered */
.${P}-sum-label--ttl {
  margin-top: 8px;
  margin-bottom: 0;
  text-align: center;
  width: 100%;
}
/* Read-only total in stacked pair — match Fee value size, centered */
.${P}-sum-group--stacked-pair .${P}-sum-field-ro {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  padding: 0 4px !important;
  justify-content: center;
  width: 100%;
}

/* view_3586 right-group widths — compact to leave room for SCW Notes fill */
.${P}-sum-right .${P}-sum-group--retail {
  width: min-content;
  min-width: 60px;
}
.${P}-sum-right .${P}-sum-group--disc-pct {
  width: 55px;
  min-width: 55px;
}
.${P}-sum-right .${P}-sum-group--disc-dlr {
  width: 60px;
  min-width: 60px;
}
.${P}-sum-right .${P}-sum-group--applied {
  width: min-content;
  min-width: 60px;
}
.${P}-sum-right .${P}-sum-group--total {
  width: 90px;
  min-width: 90px;
}

/* ── Non-stacked alignment: push checkbox/chevron/product down by label height ── */
.${P}-summary:not(.${P}-summary--stacked) td.${P}-sum-check,
.${P}-summary:not(.${P}-summary--stacked) .${P}-toggle-zone {
  margin-top: 12px;
}
/* Non-stacked fill textarea — stretches to match tallest sibling, grows for extra text */
.${P}-summary:not(.${P}-summary--stacked) .${P}-sum-group--fill .${P}-direct-textarea {
  min-height: 28px;
  max-height: none;
}

/* ── Bucket chit wrapper (empty label + chit, aligned with field columns) ── */
.${P}-bucket-chit-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex-shrink: 0;
}
/* ── Bucket chit (SERVICE / ASSUMPTION) — teal pill matching radio-chip shape ── */
.${P}-bucket-chit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  background: #2f6f73;
  border-radius: 10px;
  border: 1px solid transparent;
  white-space: nowrap;
  padding: 1px 8px;
  line-height: 1.5;
  flex-shrink: 0;
  min-width: 40px;
}
/* When product is empty, let chit fill up to full width */
.${P}-bucket-chit--wide {
  max-width: none;
}
/* Bucket chit present — product flexes automatically within fixed identity */

/* ── Worksheet <thead> column styling ── */
.${P}-thead-styled tr {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
}
.${P}-thead-styled th {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem !important;
  text-align: center !important;
  padding: 6px 10px !important;
  line-height: 1.2;
  box-sizing: border-box !important;
  white-space: nowrap;
  background: rgb(7, 70, 124) !important;
  color: #fff !important;
  border: none !important;
  border-right: 1px solid rgba(255,255,255,0.2) !important;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
}
.${P}-thead-styled th:last-child {
  border-right: none !important;
}
.${P}-thead-styled th a,
.${P}-thead-styled th a span,
.${P}-thead-styled th span {
  color: #fff !important;
}
.${P}-thead-styled th:hover {
  background: rgb(10, 90, 155) !important;
}
.${P}-thead-styled th .table-fixed-label {
  justify-content: center;
}
.${P}-thead-styled th .kn-sort {
  justify-content: center;
  margin-top: 5px;
}
/* Widen checkbox header to align over row checkboxes (covers checkbox + chevron area) */
.${P}-thead-styled .ktlCheckboxHeaderCell {
  width: 48px !important;
  min-width: 48px !important;
  background: rgb(7, 70, 124) !important;
  border: none !important;
}
/* Stack bulk-edit checkbox below the label text */
.${P}-thead-styled th .table-fixed-label.bulkEditTh {
  flex-direction: column !important;
  align-items: center !important;
  gap: 2px;
}
.${P}-thead-styled th .bulkEditHeaderCbox {
  margin: 0 auto !important;
  text-align: center;
}

/* ══════════════════════════════════════════════════════════════════
   AUTO-GENERATED PER-VIEW LAYOUT RULES
   Driven by the layout block in each WORKSHEET_CONFIG entry.
   ══════════════════════════════════════════════════════════════════ */
${WORKSHEET_CONFIG.views.map(function (v) {
  var id = v.viewId;
  var L = v.layout;
  var rules = [];

  // ── Product group width ──
  if (L.productGroupWidth && L.productGroupWidth !== 'flex') {
    var w = L.productGroupWidth;
    rules.push(
      '#' + id + ' .' + P + '-product-group {' +
      ' width: ' + w + '; min-width: ' + w + '; max-width: ' + w + '; }'
    );
  }

  // ── Label width (when non-default) ──
  if (L.labelWidth && L.labelWidth !== LAYOUT_DEFAULTS.labelWidth) {
    rules.push(
      '#' + id + ' td.' + P + '-sum-label-cell,' +
      '#' + id + ' td.' + P + '-sum-label-cell:hover {' +
      ' width: ' + L.labelWidth + '; min-width: ' + L.labelWidth + '; max-width: ' + L.labelWidth + ';' +
      ' white-space: normal; word-break: break-word; line-height: 1.3; }'
    );
  }

  // ── Identity width ──
  if (L.identityWidth) {
    var iw = L.identityWidth;
    rules.push(
      '#' + id + ' .' + P + '-identity {' +
      ' width: ' + iw + '; max-width: ' + iw + '; flex: 0 1 ' + iw + '; min-width: 0; }'
    );
  }

  // ── Detail grid columns (when non-default) ──
  if (L.detailGrid && L.detailGrid !== LAYOUT_DEFAULTS.detailGrid) {
    // Replace bare "1fr" with "minmax(0,1fr)" so columns can shrink below content width
    var safeGrid = L.detailGrid.replace(/(?<!\S)1fr(?!\S)/g, 'minmax(0,1fr)');
    rules.push(
      '#' + id + ' .' + P + '-sections { grid-template-columns: ' + safeGrid + '; }'
    );
    rules.push(
      '@media (max-width: 900px) { #' + id + ' .' + P + '-sections { grid-template-columns: 1fr; } }'
    );
  }

  return rules.length
    ? '/* ── ' + id + ' (auto-generated) ── */\n' + rules.join('\n')
    : '';
}).filter(Boolean).join('\n\n')}

/* ── view_3596: summary border on top, not bottom ── */
#view_3596 .${P}-summary {
  border-bottom: none;
  border-top: 1px solid #e5e7eb;
}
/* ── view_3596: disable clicks on detail links and photo strip ── */
#view_3596 .${P}-detail a,
#view_3596 .${P}-photo-wrap a,
#view_3596 .${P}-photo-wrap .scw-inline-photo-card {
  pointer-events: none;
  cursor: default;
  color: inherit;
  text-decoration: none;
}
`;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  function findCell(tr, fieldKey, colIndex) {
    var cells = tr.querySelectorAll(
      'td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]'
    );
    if (!cells.length) return null;
    if (colIndex != null) {
      for (var i = 0; i < cells.length; i++) {
        var ci = cells[i].getAttribute('data-column-index');
        if (ci !== null && parseInt(ci, 10) === colIndex) return cells[i];
      }
    }
    return cells[0];
  }

  function isCellEmpty(td) {
    if (!td) return true;
    var text = (td.textContent || '').replace(/[\u00a0\s]/g, '').trim();
    return text.length === 0 && !td.querySelector('img');
  }

  function getRecordId(tr) {
    var trId = tr.id || '';
    var match = trId.match(/[0-9a-f]{24}/i);
    return match ? match[0] : null;
  }

  // ── Bucket detection for per-view conditional field hiding ──

  /**
   * Return the true label text of a Knack group-header row, ignoring any
   * elements injected by group-collapse (collapse icons, record-count badges).
   */
  function getGroupLabelText(groupRow) {
    var td = groupRow.querySelector('td');
    if (!td) return '';
    var clone = td.cloneNode(true);
    var extras = clone.querySelectorAll('.scw-collapse-icon, .scw-group-badges');
    for (var i = 0; i < extras.length; i++) extras[i].remove();
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Read the bucket connection record ID from a detect cell.
   * Knack renders connection values as <span data-kn="connection-value" class="<recordId>">.
   */
  function readBucketId(tr, bucketField) {
    var td = tr.querySelector('td.' + bucketField);
    if (!td) return '';
    var span = td.querySelector('span[data-kn="connection-value"]');
    if (span) {
      var cls = (span.getAttribute('class') || '').trim();
      if (cls) return cls;
    }
    return '';
  }

  /**
   * Apply bucket rules to a worksheet card's summary bar.
   * Hides summary groups whose data-scw-fields contain any field in rule.hideFields,
   * and injects the bucket label into the product area.
   */
  function applyBucketRules(card, tr, viewCfg) {
    if (!viewCfg.bucketField || !viewCfg.bucketRules) return;

    var bucketId = readBucketId(tr, viewCfg.bucketField);
    if (!bucketId) return;

    var rule = viewCfg.bucketRules[bucketId];
    if (!rule) return;

    // ── Hide summary groups containing fields in hideFields ──
    var hideSet = new Set(rule.hideFields || []);
    if (hideSet.size) {
      var groups = card.querySelectorAll('[data-scw-fields]');
      for (var i = 0; i < groups.length; i++) {
        var fields = groups[i].getAttribute('data-scw-fields').split(' ');
        for (var j = 0; j < fields.length; j++) {
          if (hideSet.has(fields[j])) {
            groups[i].style.visibility = 'hidden';
            break;
          }
        }
      }
    }

    // ── Inject bucket chit to the left of product ──
    if (rule.label) {
      var identity = card.querySelector('.' + P + '-identity');
      if (identity) {
        // Wrap in a group with empty label so chit aligns with labor desc input
        var chitGroup = document.createElement('span');
        chitGroup.className = P + '-bucket-chit-group';
        chitGroup.style.visibility = 'visible';
        var chitLabel = document.createElement('span');
        chitLabel.className = P + '-sum-label';
        chitLabel.innerHTML = '&nbsp;';
        chitGroup.appendChild(chitLabel);

        var chitEl = document.createElement('span');
        chitEl.className = P + '-bucket-chit';
        chitEl.textContent = rule.label;

        // If product is hidden/empty, allow chit to grow wider
        var productDesc = viewCfg.fields && viewCfg.fields.product;
        if (productDesc && hideSet.has(productDesc.key)) {
          chitEl.classList.add(P + '-bucket-chit--wide');
        }
        chitGroup.appendChild(chitEl);

        // Insert as first child of identity (before separator + product-group)
        identity.insertBefore(chitGroup, identity.firstChild);

        // Hide separator dot when product is hidden
        if (productDesc && hideSet.has(productDesc.key)) {
          var sep = identity.querySelector('.' + P + '-sum-sep');
          if (sep) sep.style.display = 'none';
        }
      }
    }

    // ── Override labor-desc label per bucket ──
    if (rule.descLabel) {
      var ldDesc = viewCfg.fields && viewCfg.fields.laborDescription;
      if (ldDesc) {
        var ldGroup = card.querySelector('[data-scw-fields="' + ldDesc.key + '"] > .' + P + '-sum-label');
        if (ldGroup) ldGroup.textContent = rule.descLabel;
      }
    }
  }

  // ============================================================
  // EXPANDED STATE PERSISTENCE (across inline-edit re-renders)
  // ============================================================
  //
  // Device-worksheet panels start collapsed after every transformView.
  // Without persistence, an inline edit causes all expanded panels to
  // close — losing the user's context.
  //
  // On knack-cell-update (BEFORE re-render): scan worksheet rows and
  // save which record IDs have expanded detail panels.
  // At the end of transformView (AFTER rebuild): re-expand saved panels.

  var _expandedState = {};  // viewId → [recordId, ...]

  // localStorage helpers for persisting accordion state across page refreshes
  function wsStorageKey(viewId) { return 'scw:ws-expanded:' + viewId; }
  function loadWsState(viewId) {
    try { return JSON.parse(localStorage.getItem(wsStorageKey(viewId)) || '[]'); }
    catch (e) { return []; }
  }
  function saveWsState(viewId, expanded) {
    try { localStorage.setItem(wsStorageKey(viewId), JSON.stringify(expanded)); }
    catch (e) {}
  }

  /** Scan current worksheet rows for open detail panels and save their
   *  record IDs so they can be re-expanded after transformView. */
  function captureExpandedState(viewId) {
    var expanded = [];
    var wsRows = document.querySelectorAll('#' + viewId + ' tr.' + WORKSHEET_ROW);
    for (var i = 0; i < wsRows.length; i++) {
      var detail = wsRows[i].querySelector('.' + P + '-detail.' + P + '-open');
      if (detail) {
        var rid = getRecordId(wsRows[i]);
        if (rid) expanded.push(rid);
      }
    }
    _expandedState[viewId] = expanded;
    saveWsState(viewId, expanded);
  }

  /** Capture expanded state for ALL configured worksheet views.
   *  Called on ANY knack-cell-update because refresh-on-inline-edit.js
   *  may refresh sibling views — not just the one that was edited. */
  function captureAllExpandedStates() {
    WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
      // Skip views not in the current DOM — avoids unnecessary
      // querySelectorAll on views that aren't on this page.
      if (!document.getElementById(viewCfg.viewId)) return;
      captureExpandedState(viewCfg.viewId);
    });
  }

  /** Re-expand detail panels for previously-expanded records.
   *  Called at the end of transformView after new worksheet rows
   *  have been built. Uses record ID (24-char hex) for stable
   *  identity across re-renders. */
  function restoreExpandedState(viewId) {
    // Prefer in-memory state (inline edit); fall back to localStorage (page refresh)
    var expanded = _expandedState[viewId];
    if (!expanded || !expanded.length) {
      expanded = loadWsState(viewId);
    }
    if (!expanded || !expanded.length) return;

    // Build a lookup set for O(1) checks
    var expandedSet = {};
    for (var i = 0; i < expanded.length; i++) {
      expandedSet[expanded[i]] = true;
    }

    var wsRows = document.querySelectorAll('#' + viewId + ' tr.' + WORKSHEET_ROW);
    for (var j = 0; j < wsRows.length; j++) {
      var rid = getRecordId(wsRows[j]);
      if (rid && expandedSet[rid]) {
        toggleDetail(wsRows[j]);
      }
    }

    delete _expandedState[viewId];
  }

  // ============================================================
  // BUILD DETAIL PANEL HELPERS
  // ============================================================

  var GRAYED_CLASS = 'scw-cond-grayed';

  function buildFieldRow(label, td, opts) {
    opts = opts || {};

    // If the cell was grayed out by the conditional-grayout script,
    // remove it from the detail panel entirely (keep summary graying).
    if (td && td.classList.contains(GRAYED_CLASS)) return null;

    // If skipEmpty is set, omit the field entirely when the cell is blank.
    if (opts.skipEmpty && (!td || isCellEmpty(td))) return null;

    var row = document.createElement('div');
    row.className = P + '-field';

    var lbl = document.createElement('div');
    lbl.className = P + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    if (td && !isCellEmpty(td)) {
      td.classList.add(P + '-field-value');
      if (opts.notes) td.classList.add(P + '-field-value--notes');
      row.appendChild(td);
    } else if (td) {
      td.classList.add(P + '-field-value');
      td.classList.add(P + '-field-value--empty');
      if (opts.notes) td.classList.add(P + '-field-value--notes');
      row.appendChild(td);
    } else {
      var placeholder = document.createElement('div');
      placeholder.className = P + '-field-value ' + P + '-field-value--empty';
      placeholder.textContent = '\u2014';
      row.appendChild(placeholder);
    }

    return row;
  }

  function buildSection(title) {
    var section = document.createElement('div');
    section.className = P + '-section';

    if (title) {
      var titleEl = document.createElement('div');
      titleEl.className = P + '-section-title';
      titleEl.textContent = title;
      section.appendChild(titleEl);
    }

    return section;
  }

  // ============================================================
  // RADIO CHIPS – single-select chip UI for multiple-choice fields
  // ============================================================
  var RADIO_CHIP_CLASS = P + '-radio-chip';
  var RADIO_CHIPS_ATTR = 'data-scw-radio-chips';
  var MULTI_CHIP_ATTR  = 'data-multi';

  /** Read current value from a cell's text content. */
  function readCellText(td) {
    if (!td) return '';
    return (td.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim();
  }

  /** Resolve a field descriptor to its Knack key. */
  function fieldKey(viewCfg, name) {
    if (!viewCfg || !viewCfg.fields) return null;
    var desc = viewCfg.fields[name];
    if (!desc) return null;
    return typeof desc === 'string' ? desc : desc.key;
  }

  /** Get the descriptor object for a field name. */
  function fieldDesc(viewCfg, name) {
    if (!viewCfg || !viewCfg.fields) return null;
    var desc = viewCfg.fields[name];
    if (!desc) return null;
    if (typeof desc === 'string') return { key: desc, type: 'readOnly' };
    return desc;
  }

  /** Build radio/multi chip elements for a set of options.
   *  multi=true → multiple chips can be selected (toggle behavior). */
  function buildRadioChips(td, fKey, options, multi) {
    var currentVal = readCellText(td);
    var container = document.createElement('div');
    container.className = P + '-radio-chips';
    container.setAttribute('data-field', fKey);

    // For multi-chip, parse comma-separated values
    var selectedSet = {};
    if (multi) {
      container.setAttribute(MULTI_CHIP_ATTR, '1');
      var parts = currentVal.split(',');
      for (var j = 0; j < parts.length; j++) {
        var trimmed = parts[j].replace(/[\u00a0\s]+/g, ' ').trim();
        if (trimmed) selectedSet[trimmed] = true;
      }
    }

    for (var i = 0; i < options.length; i++) {
      var chip = document.createElement('span');
      chip.className = RADIO_CHIP_CLASS;
      chip.setAttribute('data-option', options[i]);
      chip.setAttribute('data-field', fKey);
      chip.textContent = options[i];

      var isSelected = multi
        ? !!selectedSet[options[i]]
        : (currentVal === options[i]);

      if (isSelected) {
        chip.classList.add('is-selected');
      } else {
        chip.classList.add('is-unselected');
      }
      container.appendChild(chip);
    }
    return container;
  }

  /** Build a field row that uses radio chips instead of the raw cell. */
  function buildRadioChipRow(label, td, fKey, options, multi) {
    if (td && td.classList.contains(GRAYED_CLASS)) return null;

    var row = document.createElement('div');
    row.className = P + '-field';

    var lbl = document.createElement('div');
    lbl.className = P + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    var valueWrapper = document.createElement('div');
    valueWrapper.className = P + '-field-value';
    valueWrapper.style.border = 'none';
    valueWrapper.style.padding = '0';
    valueWrapper.style.background = 'transparent';

    var chips = buildRadioChips(td, fKey, options, multi);
    valueWrapper.appendChild(chips);

    // Keep the original td hidden so Knack's data binding stays alive
    if (td) {
      td.style.display = 'none';
      td.setAttribute(RADIO_CHIPS_ATTR, '1');
      valueWrapper.appendChild(td);
    }

    row.appendChild(valueWrapper);
    return row;
  }

  // ============================================================
  // DIRECT-EDIT INPUTS – type-and-save text fields
  // ============================================================
  var DIRECT_EDIT_ATTR = 'data-scw-direct-edit';
  var DIRECT_INPUT_CLASS = P + '-direct-input';
  var DIRECT_TEXTAREA_CLASS = P + '-direct-textarea';

  /** Read the display text from a td, stripping whitespace. */
  function readFieldText(td) {
    if (!td) return '';
    return (td.textContent || '').replace(/[\u00a0]/g, ' ').trim();
  }

  /** Build an editable field row with a native input or textarea. */
  function buildEditableFieldRow(label, td, fieldKey, opts) {
    opts = opts || {};
    if (td && td.classList.contains(GRAYED_CLASS)) return null;
    if (opts.skipEmpty && (!td || isCellEmpty(td))) return null;

    var row = document.createElement('div');
    row.className = P + '-field';

    var lbl = document.createElement('div');
    lbl.className = P + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    var valueWrapper = document.createElement('div');
    valueWrapper.className = P + '-field-value';
    valueWrapper.style.border = 'none';
    valueWrapper.style.padding = '0';
    valueWrapper.style.background = 'transparent';

    var currentVal = readFieldText(td);
    var input;

    if (opts.notes) {
      input = document.createElement('textarea');
      input.className = DIRECT_TEXTAREA_CLASS;
      input.value = currentVal;
      input.rows = 4;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = DIRECT_INPUT_CLASS;
      input.value = currentVal;
    }

    input.setAttribute('data-field', fieldKey);
    input.setAttribute(DIRECT_EDIT_ATTR, '1');

    valueWrapper.appendChild(input);

    // Keep the original td hidden so Knack data binding stays alive
    if (td) {
      td.style.display = 'none';
      td.setAttribute(DIRECT_EDIT_ATTR, '1');
      valueWrapper.appendChild(td);
    }

    row.appendChild(valueWrapper);
    return row;
  }

  /** Parse an error message from a Knack API response. */
  function parseKnackError(xhr) {
    try {
      var body = JSON.parse(xhr.responseText || '{}');
      // Knack returns { errors: [{ message: "..." }] } or { errors: [{ field: "...", message: "..." }] }
      if (body.errors && body.errors.length) {
        return body.errors.map(function (e) { return e.message || e; }).join('; ');
      }
      if (body.message) return body.message;
    } catch (ignored) {}
    return 'Save failed';
  }

  /** Show an error message below a direct-edit input, with red styling. */
  function showInputError(input, message, previousValue) {
    // Remove saving state, add error state
    input.classList.remove('is-saving');
    input.classList.add('is-error');

    // Revert value
    input.value = previousValue;
    input._scwPrev = previousValue;

    // Update hidden td back to previous value (detail panel)
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    if (hiddenTd) {
      hiddenTd.textContent = previousValue;
    }
    // Update hidden span (summary bar)
    var hiddenSpan = wrapper ? wrapper.querySelector('span[style*="display"]') : null;
    if (hiddenSpan) hiddenSpan.textContent = previousValue;

    // Show error message element
    var existing = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (existing) existing.remove();

    var errEl = document.createElement('div');
    errEl.className = P + '-direct-error';
    errEl.textContent = message;
    if (wrapper) wrapper.appendChild(errEl);

    // Auto-clear after 4 seconds
    setTimeout(function () {
      input.classList.remove('is-error');
      if (errEl.parentNode) errEl.remove();
    }, 4000);
  }

  /** Show success feedback on input. */
  function showInputSuccess(input) {
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    // Remove any lingering error
    var wrapper = input.parentNode;
    var errEl = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (errEl) errEl.remove();

    setTimeout(function () {
      input.classList.remove('is-saving');
      // Re-evaluate conditional formatting after save completes.
      // The hidden td has already been updated with the new value;
      // recalculate whether the field still meets a danger/warning
      // condition and update the input background accordingly.
      refreshInputConditionalColor(input);
    }, 600);
  }

  // ============================================================
  // CONDITIONAL CELL COLOR EVALUATOR (shared by render + save)
  // ============================================================
  //
  // Pure-logic function: given a field key and its text value,
  // returns the conditional color key ('danger', 'warning') or
  // null.  Used both at initial render (to set input bg without
  // getComputedStyle) and after saves (refreshInputConditionalColor).
  //
  // Rules mirror dynamic-cell-colors.js for the direct-edit fields
  // that device-worksheet manages.

  var COND_COLORS_MAP = {
    danger:  'rgb(248, 215, 218)',
    warning: 'rgb(255, 243, 205)'
  };

  var COND_DEFAULT_BG = 'rgba(134, 182, 223, 0.1)';

  function evaluateConditionalColor(fieldKey, rawText) {
    var cleaned = (rawText || '').replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ').trim();
    var isEmpty = cleaned === '' || cleaned === '-' || cleaned === '\u2014';
    var isZero = /^[$]?0+(\.0+)?$/.test(cleaned);

    if (fieldKey === 'field_2400') {
      if (isEmpty) return 'danger';
      if (isZero)  return 'warning';
    } else if (fieldKey === 'field_2409') {
      if (isEmpty) return 'danger';
    } else if (fieldKey === 'field_2415' || fieldKey === 'field_771') {
      if (isEmpty) return 'warning';
    } else if (fieldKey === 'field_2399') {
      if (isZero) return 'warning';
    }
    return null;
  }

  /**
   * After a successful save, recalculate the conditional background
   * color (danger/warning) for a direct-edit input based on the
   * updated value in its hidden td.  Clears the color when the
   * condition no longer applies.
   */
  function refreshInputConditionalColor(input) {
    var wrapper = input.parentNode;
    if (!wrapper) return;
    var fieldKey = input.getAttribute('data-field');
    if (!fieldKey) return;

    // Read value from hidden td (detail panel) or input itself (summary bar)
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var rawText = hiddenTd ? (hiddenTd.textContent || '') : (input.value || '');

    var conditionColor = evaluateConditionalColor(fieldKey, rawText);

    // The element to update classes/styles on
    var styleTd = hiddenTd || wrapper;
    var dangerCls = 'scw-cell-danger';
    var warningCls = 'scw-cell-warning';

    styleTd.classList.remove(dangerCls, warningCls);
    if (conditionColor === 'danger') {
      styleTd.classList.add(dangerCls);
      styleTd.style.backgroundColor = COND_COLORS_MAP.danger;
    } else if (conditionColor === 'warning') {
      styleTd.classList.add(warningCls);
      styleTd.style.backgroundColor = COND_COLORS_MAP.warning;
    } else {
      styleTd.style.backgroundColor = '';
    }

    // Update the visible input's background
    if (conditionColor && COND_COLORS_MAP[conditionColor]) {
      input.style.backgroundColor = COND_COLORS_MAP[conditionColor];
    } else {
      input.style.backgroundColor = COND_DEFAULT_BG;
    }
  }

  // Number fields that need client-side validation
  var NUMBER_FIELDS = ['field_2367', 'field_2368', 'field_2400', 'field_2399', 'field_2458',
                       'field_2150', 'field_1973', 'field_1974', 'field_1951', 'field_1965',
                       'field_1964'];

  // ============================================================
  // SOFT HEADER REFRESH
  // ============================================================
  //
  // For views whose header label is a Knack formula (e.g. view_3559's
  // field_1642 = composite of field_1641 + field_2458 + field_1943),
  // we read the recalculated formula from the PUT response after
  // saving a trigger field and patch the label td in place.
  //
  // The view-level GET endpoint does NOT return formula fields, so
  // the label must come from the PUT response itself.
  //
  // We also cache the last-known label per record so that if Knack
  // re-renders the view (via model change events), we can re-apply
  // the label in transformView without another round-trip.

  var _labelCache = {};  // recordId → label text

  /** Look up the viewCfg that owns a given viewId. */
  function viewCfgFor(viewId) {
    var views = WORKSHEET_CONFIG.views;
    for (var i = 0; i < views.length; i++) {
      if (views[i].viewId === viewId) return views[i];
    }
    return null;
  }

  /** Returns true if fieldKey is a header-trigger field for viewId. */
  function isHeaderTrigger(viewId, fieldKey) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.headerTriggerFields) return false;
    return cfg.headerTriggerFields.indexOf(fieldKey) !== -1;
  }

  /** Returns true if fieldKey affects the calculated Install Fee. */
  function isFeeTrigger(viewId, fieldKey) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.feeTriggerFields) return false;
    return cfg.feeTriggerFields.indexOf(fieldKey) !== -1;
  }

  /** After a fee-trigger save, patch the Fee cell from the API response
   *  and re-evaluate danger styling on Sub Bid / +Hrs / +Mat groups. */
  /**
   * After a feeTrigger save, refresh the view so Knack re-renders
   * with updated calculated / related values.
   * Holds the view's height and fades opacity to avoid a jarring flash.
   */
  function refreshViewAfterSave(viewId) {
    if (typeof Knack === 'undefined') return;
    setTimeout(function () {
      try {
        var view = Knack.views[viewId];
        if (!view || !view.model || typeof view.model.fetch !== 'function') return;

        var el = document.getElementById(viewId);
        if (el) {
          // Lock height + fade so the DOM doesn't collapse during fetch
          el.style.minHeight = el.offsetHeight + 'px';
          el.style.opacity = '0.45';
          el.style.transition = 'opacity .15s';

          // Restore on next render of this view
          $(document).one('knack-view-render.' + viewId + '.scwRefreshFade', function () {
            el.style.opacity = '1';
            // Release min-height after the fade-in completes
            setTimeout(function () { el.style.minHeight = ''; el.style.transition = ''; }, 200);
          });
        }

        console.log('[scw-ws] Refreshing view ' + viewId + ' after fee-trigger save');
        view.model.fetch();
      } catch (e) {
        console.warn('[scw-ws] Could not refresh ' + viewId, e);
      }
    }, 750);
  }

  /** Extract the label text from a Knack API response object. */
  function extractLabelFromResponse(viewId, resp) {
    var cfg = viewCfgFor(viewId);
    var labelField = fieldKey(cfg, 'label');
    if (!labelField) return '';
    var raw = resp[labelField + '_raw'] || resp[labelField] || '';
    return typeof raw === 'string'
      ? raw.replace(/<[^>]*>/g, '').trim()
      : String(raw);
  }

  /**
   * Fetch the record via the VIEW-level API and apply the label.
   * Uses the same-origin view URL to avoid CORS issues.
   */
  function fetchAndApplyLabel(viewId, recordId) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !fieldKey(cfg, 'label')) return;
    if (typeof Knack === 'undefined') return;

    console.log('[scw-ws-header] Fetching label via view API for ' + recordId);

    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId),
      type: 'GET',
      success: function (resp) {
        var txt = extractLabelFromResponse(viewId, resp);
        console.log('[scw-ws-header] View API label for ' + recordId + ': "' + txt + '"');
        if (txt) {
          _labelCache[recordId] = txt;
          applyLabelText(viewId, recordId, txt);
        }
      },
      error: function (xhr) {
        console.warn('[scw-ws-header] View GET failed for ' + recordId, xhr.status);
      }
    });
  }

  /** Patch the label td text for a single record in the DOM. */
  function applyLabelText(viewId, recordId, txt) {
    var cfg = viewCfgFor(viewId);
    var labelField = fieldKey(cfg, 'label');
    if (!labelField) return;

    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    // Find ALL label tds in the view, then match by closest row id
    var allLabels = viewEl.querySelectorAll(
      'td.' + labelField + ', td[data-field-key="' + labelField + '"]'
    );
    for (var i = 0; i < allLabels.length; i++) {
      var row = allLabels[i].closest('tr.' + WORKSHEET_ROW);
      if (row && getRecordId(row) === recordId) {
        allLabels[i].textContent = txt;
        console.log('[scw-ws-header] Applied label for ' + recordId + ': "' + txt + '"');
        return;
      }
    }
    console.warn('[scw-ws-header] Label td not found for ' + recordId);
  }

  /**
   * Called at the end of transformView — re-apply any cached labels
   * that Knack's re-render may have wiped with stale formula data.
   */
  function restoreCachedLabels(viewId) {
    var cfg = viewCfgFor(viewId);
    var labelField = fieldKey(cfg, 'label');
    if (!labelField) return;

    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    var allLabels = viewEl.querySelectorAll(
      'td.' + labelField + ', td[data-field-key="' + labelField + '"]'
    );
    for (var i = 0; i < allLabels.length; i++) {
      var row = allLabels[i].closest('tr.' + WORKSHEET_ROW);
      if (!row) continue;
      var rid = getRecordId(row);
      if (rid && _labelCache[rid]) {
        var current = (allLabels[i].textContent || '').trim();
        if (!current || current === '\u00a0') {
          allLabels[i].textContent = _labelCache[rid];
          console.log('[scw-ws-header] Restored cached label for ' + rid + ': "' + _labelCache[rid] + '"');
        }
      }
    }
  }

  /** Save a direct-edit field value.
   *  For header-trigger fields, always uses AJAX PUT so we can read
   *  the recalculated formula from the response.  For other fields,
   *  prefers model.updateRecord to avoid a full re-render.
   *  Calls onSuccess(resp) or onError(message) when done. */
  function saveDirectEditValue(viewId, recordId, fieldKey, value, onSuccess, onError) {
    if (typeof Knack === 'undefined') return;

    var data = {};
    data[fieldKey] = value;
    var trigger = isHeaderTrigger(viewId, fieldKey);
    var feeTrig = isFeeTrigger(viewId, fieldKey);

    // Non-trigger fields: prefer model.updateRecord (no re-render)
    if (!trigger && !feeTrig) {
      var view = Knack.views[viewId];
      if (view && view.model && typeof view.model.updateRecord === 'function') {
        view.model.updateRecord(recordId, data);
        $(document).trigger('scw-record-saved');
        if (onSuccess) onSuccess(null);
        return;
      }
    }

    // Trigger / fee-trigger fields (or fallback): direct AJAX PUT
    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId),
      type: 'PUT',
      data: JSON.stringify(data),
      success: function (resp) {
        if (feeTrig) refreshViewAfterSave(viewId);
        $(document).trigger('scw-record-saved');
        if (onSuccess) onSuccess(resp);
      },
      error: function (xhr) {
        var msg = parseKnackError(xhr);
        console.warn('[scw-ws-direct] Save failed for ' + recordId, xhr.responseText);
        if (onError) onError(msg);
      }
    });
  }

  /** Handle save for a direct-edit input. */
  function handleDirectEditSave(input) {
    var fieldKey = input.getAttribute('data-field') || '';
    var newValue = input.value;

    // Percent fields: user types whole number (6), Knack expects decimal (0.06)
    if (window.SCW && SCW.pctFormat && SCW.pctFormat.isPercentField(fieldKey)) {
      var pctNum = parseFloat(String(newValue).replace(/[%\s]/g, ''));
      if (!isNaN(pctNum)) newValue = String(pctNum / 100);
    }

    // Capture previous value: from hidden td (detail panel) or _scwPrev (summary bar)
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var previousValue = hiddenTd ? readFieldText(hiddenTd) : (input._scwPrev || '');

    // Client-side validation for number fields
    if (NUMBER_FIELDS.indexOf(fieldKey) !== -1) {
      var trimmed = newValue.trim().replace(/[$,]/g, '');
      if (trimmed !== '' && isNaN(Number(trimmed))) {
        showInputError(input, 'Please enter a number', previousValue);
        return;
      }
    }

    // Optimistically update backing store
    if (hiddenTd) {
      hiddenTd.textContent = newValue;
    }
    input._scwPrev = newValue;
    // Update hidden span (summary bar) so dynamic-cell-colors sees new value
    var hiddenSpan = wrapper ? wrapper.querySelector('span[style*="display"]') : null;
    if (hiddenSpan) hiddenSpan.textContent = newValue;

    // Visual feedback — start saving
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    var errEl = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (errEl) errEl.remove();

    // Find record ID and view ID
    var wsTr = input.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = input.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveDirectEditValue(viewId, recordId, fieldKey, newValue,
        function () {
          showInputSuccess(input);
          if (isHeaderTrigger(viewId, fieldKey)) {
            fetchAndApplyLabel(viewId, recordId);
          }
        },
        function (msg) { showInputError(input, msg, previousValue); }
      );
    }
  }

  // ── Keydown handler for direct-edit inputs: save on Enter ──
  document.addEventListener('keydown', function (e) {
    var target = e.target;
    if (!target.hasAttribute(DIRECT_EDIT_ATTR)) return;

    if (e.key === 'Enter') {
      // For textareas, Shift+Enter inserts newline; Enter alone saves
      if (target.tagName === 'TEXTAREA' && e.shiftKey) return;

      e.preventDefault();
      e.stopPropagation();
      // Mark as just-saved so blur handler doesn't double-fire
      target._scwJustSaved = true;
      handleDirectEditSave(target);
      target.blur();
    }

    if (e.key === 'Escape') {
      // Revert to the original value
      target._scwJustSaved = true; // prevent blur save
      var wrapper = target.parentNode;
      var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
      target.value = hiddenTd ? readFieldText(hiddenTd) : (target._scwPrev || '');
      target.blur();
    }
  }, true);

  // ── Blur handler: save when focus leaves ──
  document.addEventListener('focusout', function (e) {
    var target = e.target;
    if (!target.hasAttribute(DIRECT_EDIT_ATTR)) return;

    // Skip if Enter/Escape already handled it
    if (target._scwJustSaved) {
      target._scwJustSaved = false;
      return;
    }

    // Check if value actually changed
    var wrapper = target.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var originalVal = hiddenTd ? readFieldText(hiddenTd) : (target._scwPrev || '');
    if (target.value !== originalVal) {
      handleDirectEditSave(target);
    }
  }, true);

  // ── Capture-phase click/mousedown: block Knack inline-edit on direct-edit inputs ──
  document.addEventListener('click', function (e) {
    if (e.target.hasAttribute(DIRECT_EDIT_ATTR)) {
      e.stopPropagation();
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    if (e.target.hasAttribute(DIRECT_EDIT_ATTR)) {
      e.stopPropagation();
    }
  }, true);

  /** Save a radio/multi chip selection via Knack's internal API.
   *  value may be a string (single chip) or an array (multi chip). */
  function saveRadioValue(viewId, recordId, fieldKey, value, onSuccess) {
    var data = {};
    data[fieldKey] = value;
    var trigger = isHeaderTrigger(viewId, fieldKey);
    var feeTrig = isFeeTrigger(viewId, fieldKey);

    // Non-trigger: prefer model.updateRecord (no re-render)
    if (!trigger && !feeTrig) {
      var view = typeof Knack !== 'undefined' && Knack.views ? Knack.views[viewId] : null;
      if (view && view.model && typeof view.model.updateRecord === 'function') {
        view.model.updateRecord(recordId, data);
        if (onSuccess) onSuccess(null);
        return;
      }
    }

    // Trigger / fee-trigger fields (or fallback): AJAX PUT — response has the formula
    if (typeof Knack !== 'undefined') {
      SCW.knackAjax({
        url: SCW.knackRecordUrl(viewId, recordId),
        type: 'PUT',
        data: JSON.stringify(data),
        success: function (resp) {
          if (feeTrig) refreshViewAfterSave(viewId);
          if (onSuccess) onSuccess(resp);
        },
        error: function (xhr) {
          console.warn('[scw-ws-radio] Save failed for ' + recordId, xhr.responseText);
        }
      });
    }
  }

  // ── Capture-phase click handler for radio / multi chips ──
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.' + RADIO_CHIP_CLASS);
    if (!chip) return;

    // Let KTL bulk-edit handle the click when active
    var chipTd = chip.closest('td');
    if (chipTd && chipTd.classList.contains('bulkEditSelectSrc')) return;

    e.stopPropagation();
    e.preventDefault();

    var clickedOption = chip.getAttribute('data-option') || '';
    var fk = chip.getAttribute('data-field') || '';
    var container = chip.closest('.' + P + '-radio-chips');
    if (!container) return;

    var isMulti = container.getAttribute(MULTI_CHIP_ATTR) === '1';
    var allChips = container.querySelectorAll('.' + RADIO_CHIP_CLASS);
    var saveValue;

    if (isMulti) {
      // Toggle the clicked chip independently
      chip.classList.toggle('is-selected');
      chip.classList.toggle('is-unselected');
      chip.classList.add('is-saving');

      // Collect all selected options as an array
      var selected = [];
      for (var i = 0; i < allChips.length; i++) {
        if (allChips[i].classList.contains('is-selected')) {
          selected.push(allChips[i].getAttribute('data-option'));
        }
      }
      saveValue = selected;
    } else {
      // Single-select radio behavior
      for (var j = 0; j < allChips.length; j++) {
        allChips[j].classList.remove('is-selected', 'is-unselected');
        if (allChips[j].getAttribute('data-option') === clickedOption) {
          allChips[j].classList.add('is-selected', 'is-saving');
        } else {
          allChips[j].classList.add('is-unselected');
        }
      }
      saveValue = clickedOption;
    }

    setTimeout(function () {
      var saving = container.querySelectorAll('.is-saving');
      for (var k = 0; k < saving.length; k++) saving[k].classList.remove('is-saving');
    }, 400);

    // Update source td text so re-renders stay in sync
    var hiddenTd = container.closest('td[' + RADIO_CHIPS_ATTR + ']')
                || container.parentNode.querySelector('td[' + RADIO_CHIPS_ATTR + ']');
    var textValue = isMulti ? saveValue.join(', ') : saveValue;
    if (hiddenTd) {
      var hSpan = hiddenTd.querySelector('span[style*="display"]');
      if (hSpan) hSpan.textContent = textValue;
      else hiddenTd.textContent = textValue;
    }

    // Find record ID and view ID, then save
    var wsTr = chip.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = chip.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveRadioValue(viewId, recordId, fk, saveValue, function () {
        if (isHeaderTrigger(viewId, fk)) {
          fetchAndApplyLabel(viewId, recordId);
        }
      });
    }
  }, true);

  // ── Capture-phase mousedown: block Knack inline-edit trigger on chips ──
  document.addEventListener('mousedown', function (e) {
    var chip = e.target.closest('.' + RADIO_CHIP_CLASS);
    if (!chip) return;
    var chipTd = chip.closest('td');
    if (chipTd && chipTd.classList.contains('bulkEditSelectSrc')) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ── Capture-phase: block Knack inline-edit on chip host td and container ──
  document.addEventListener('click', function (e) {
    var host = e.target.closest('td.' + P + '-sum-chip-host');
    if (host && !host.classList.contains('bulkEditSelectSrc')) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    var host = e.target.closest('td.' + P + '-sum-chip-host');
    if (host && !host.classList.contains('bulkEditSelectSrc')) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // ── Capture-phase click handler for cabling toggle chit ──
  var CABLING_CHIT_SEL = '.' + P + '-cabling-chit';
  document.addEventListener('click', function (e) {
    var chit = e.target.closest(CABLING_CHIT_SEL);
    if (!chit) return;

    // Let KTL bulk-edit handle the click when active
    var chitTd = chit.closest('td');
    if (chitTd && chitTd.classList.contains('bulkEditSelectSrc')) return;

    e.stopPropagation();
    e.preventDefault();

    var fieldKey = chit.getAttribute('data-field') || '';
    var isYes = chit.classList.contains('is-yes');
    var newBool = isYes ? 'No' : 'Yes';

    // Toggle visual state
    chit.classList.remove('is-yes', 'is-no');
    chit.classList.add(newBool === 'Yes' ? 'is-yes' : 'is-no', 'is-saving');
    setTimeout(function () { chit.classList.remove('is-saving'); }, 400);

    // Update source td (chit may be inside or beside the td)
    var srcTd = chit.closest('td[data-scw-cabling-src]')
             || chit.parentNode.querySelector('td[data-scw-cabling-src]');
    if (srcTd) {
      var hiddenSpan = srcTd.querySelector('span[style*="display"]');
      if (hiddenSpan) hiddenSpan.textContent = newBool;
    }

    // Save
    var wsTr = chit.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = chit.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveRadioValue(viewId, recordId, fieldKey, newBool);
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    var chitEl = e.target.closest(CABLING_CHIT_SEL);
    if (!chitEl) return;
    var chitTd = chitEl.closest('td');
    if (chitTd && chitTd.classList.contains('bulkEditSelectSrc')) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ============================================================
  // SUMMARY BAR DIRECT-EDIT  (in-place input inside existing td)
  // ============================================================

  /** Inject a direct-edit input into an existing summary bar td.
   *  The td stays visible in the DOM with all its Knack/KTL classes
   *  so bulk-edit can still discover it.  The original span content
   *  is hidden; the previous value is stashed on input._scwPrev.
   *  opts.multiline — use a textarea that wraps and auto-grows. */
  function injectSummaryDirectEdit(td, fieldKey, opts) {
    opts = opts || {};
    // Guard against duplicate injection
    if (td.querySelector('[' + DIRECT_EDIT_ATTR + ']')) return;
    var currentVal = readFieldText(td);
    td.classList.add(P + '-sum-direct-edit');

    // Compute conditional background color from the field value
    // instead of reading getComputedStyle on the td.  This avoids
    // forced style recalculations entirely — the color is derived
    // from pure logic (field key + text value) using the same rules
    // as dynamic-cell-colors.js, rather than asking the browser to
    // resolve the computed style of each td in the document.
    var condColor = evaluateConditionalColor(fieldKey, currentVal);

    // Keep a hidden span with the text value so dynamic-cell-colors
    // (which reads $td.text()) still sees the real content.
    var existingSpan = td.querySelector('span');
    if (existingSpan) {
      existingSpan.style.display = 'none';
    } else {
      var hiddenSpan = document.createElement('span');
      hiddenSpan.style.display = 'none';
      hiddenSpan.textContent = currentVal;
      td.appendChild(hiddenSpan);
    }

    var input;
    if (opts.multiline) {
      input = document.createElement('textarea');
      input.className = DIRECT_TEXTAREA_CLASS;
      input.value = currentVal;
      input.rows = opts.rows || 4;

      // Auto-grow: resize textarea to fit content
      function autoGrow() {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
      }
      input.addEventListener('input', autoGrow);
      // Initial size after append (deferred so layout is ready)
      requestAnimationFrame(autoGrow);
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = DIRECT_INPUT_CLASS;
      input.value = currentVal;
    }
    input.setAttribute('data-field', fieldKey);
    input.setAttribute(DIRECT_EDIT_ATTR, '1');
    input._scwPrev = currentVal;

    // Apply conditional background color to the input
    if (condColor && COND_COLORS_MAP[condColor]) {
      input.style.backgroundColor = COND_COLORS_MAP[condColor];
    }

    td.appendChild(input);
  }

  // ============================================================
  // SUMMARY GROUP HELPER
  // ============================================================

  /** Append a labelled summary-bar group to a parent element.
   *  opts.readOnly   — use read-only styling (no edit affordance)
   *  opts.directEdit — inject a type-and-save input
   *  opts.fieldKey   — field key for direct-edit save target
   *  opts.cls        — extra CSS class for the group wrapper */
  function appendSumGroup(parent, label, td, opts) {
    opts = opts || {};
    if (!td) return null;
    var group = document.createElement('span');
    group.className = P + '-sum-group' + (opts.cls ? ' ' + opts.cls : '');
    if (opts.fieldKey) group.setAttribute('data-scw-fields', opts.fieldKey);
    var lbl = document.createElement('span');
    lbl.className = P + '-sum-label';
    lbl.textContent = label;
    group.appendChild(lbl);
    td.classList.add(opts.readOnly ? (P + '-sum-field-ro') : (P + '-sum-field'));
    if (isCellEmpty(td)) td.classList.add(P + '-empty');
    if (opts.directEdit && opts.fieldKey) {
      injectSummaryDirectEdit(td, opts.fieldKey);
    }
    group.appendChild(td);

    // Inherit Knack's text-align setting (e.g. center) so the value
    // AND label honour the column alignment configured in the builder.
    // The td uses display:inline-flex (text-align is ignored by flex),
    // so we translate text-align into the flex equivalents.
    var tdAlign = td.style.textAlign || getComputedStyle(td).textAlign;
    if (tdAlign === 'center' || tdAlign === 'right') {
      var flexAlign = tdAlign === 'center' ? 'center' : 'flex-end';
      group.style.alignItems = flexAlign;         // centers label + td within the group column
      td.style.justifyContent = flexAlign;        // centers content inside the td (which is width:100%)
      lbl.style.textAlign = tdAlign;              // centers the label text
    }

    parent.appendChild(group);
    return group;
  }

  // ============================================================
  // BUILD SUMMARY BAR
  // ============================================================

  /** Render a single field into the summary bar based on its descriptor type. */
  function renderSummaryField(target, tr, name, desc, viewCfg) {
    var td = findCell(tr, desc.key, desc.columnIndex);

    switch (desc.type) {
      case 'readOnly':
        if (desc.group === 'fill') {
          // Fill group — read-only version of the stretchy middle field
          if (!td) break;
          var roFillGroup = document.createElement('span');
          roFillGroup.className = P + '-sum-group ' + P + '-sum-group--fill';
          roFillGroup.setAttribute('data-scw-fields', desc.key);
          var roFillLabel = document.createElement('span');
          roFillLabel.className = P + '-sum-label';
          roFillLabel.textContent = desc.label || name;
          roFillGroup.appendChild(roFillLabel);
          td.classList.add(P + '-sum-field-ro');
          if (desc.multiline) td.classList.add(P + '-sum-field--desc');
          if (isCellEmpty(td)) td.classList.add(P + '-empty');
          roFillGroup.appendChild(td);
          target.appendChild(roFillGroup);
        } else if (desc.readOnlySummary) {
          appendSumGroup(target, desc.label || name, td,
            { cls: desc.groupCls ? (P + '-' + desc.groupCls) : undefined, readOnly: true, fieldKey: desc.key });
        } else {
          appendSumGroup(target, desc.label || name, td,
            { cls: desc.groupCls ? (P + '-' + desc.groupCls) : undefined, fieldKey: desc.key });
        }
        break;

      case 'directEdit':
        // Respect Knack's inline-edit setting: if the td lacks cell-edit,
        // render as read-only instead of injecting an input.
        var _knackEditable = td && td.classList.contains('cell-edit');
        if (desc.group === 'fill') {
          // Fill group — special layout (fills middle space)
          if (!td) break;
          var ldGroup = document.createElement('span');
          ldGroup.className = P + '-sum-group ' + P + '-sum-group--fill';
          ldGroup.setAttribute('data-scw-fields', desc.key);
          var ldLabel = document.createElement('span');
          ldLabel.className = P + '-sum-label';
          ldLabel.textContent = desc.label || name;
          ldGroup.appendChild(ldLabel);
          if (_knackEditable) {
            td.classList.add(P + '-sum-field');
            td.classList.add(P + '-sum-field--desc');
            injectSummaryDirectEdit(td, desc.key, { multiline: !!desc.multiline, rows: 1 });
          } else {
            td.classList.add(P + '-sum-field-ro');
            if (desc.multiline) td.classList.add(P + '-sum-field--desc');
            if (isCellEmpty(td)) td.classList.add(P + '-empty');
          }
          ldGroup.appendChild(td);
          target.appendChild(ldGroup);
        } else if (desc.stackWith && viewCfg) {
          // Stacked pair — editable field on top, read-only total below
          if (!td) break;
          var pairDesc = fieldDesc(viewCfg, desc.stackWith);
          var pairTd = pairDesc ? findCell(tr, pairDesc.key, pairDesc.columnIndex) : null;
          var pairGroup = document.createElement('span');
          pairGroup.className = P + '-sum-group ' + P + '-sum-group--stacked-pair'
            + (desc.groupCls ? ' ' + P + '-' + desc.groupCls : '');
          var pairFields = [desc.key];
          if (pairDesc) pairFields.push(pairDesc.key);
          pairGroup.setAttribute('data-scw-fields', pairFields.join(' '));
          // Top: label + editable field
          var topLbl = document.createElement('span');
          topLbl.className = P + '-sum-label';
          topLbl.textContent = desc.label || name;
          pairGroup.appendChild(topLbl);
          if (_knackEditable) {
            td.classList.add(P + '-sum-field');
            injectSummaryDirectEdit(td, desc.key);
          } else {
            td.classList.add(P + '-sum-field-ro');
            if (isCellEmpty(td)) td.classList.add(P + '-empty');
          }
          pairGroup.appendChild(td);
          // Bottom: TTL label + read-only value
          if (pairTd) {
            var btmLbl = document.createElement('span');
            btmLbl.className = P + '-sum-label ' + P + '-sum-label--ttl';
            btmLbl.textContent = pairDesc.label || desc.stackWith;
            pairGroup.appendChild(btmLbl);
            pairTd.classList.add(P + '-sum-field-ro');
            if (isCellEmpty(pairTd)) pairTd.classList.add(P + '-empty');
            pairGroup.appendChild(pairTd);
          }
          target.appendChild(pairGroup);
        } else {
          if (_knackEditable) {
            appendSumGroup(target, desc.label || name, td,
              { cls: desc.groupCls ? (P + '-' + desc.groupCls) : undefined,
                directEdit: true, fieldKey: desc.key });
          } else {
            appendSumGroup(target, desc.label || name, td,
              { cls: desc.groupCls ? (P + '-' + desc.groupCls) : undefined,
                readOnly: true, fieldKey: desc.key });
          }
        }
        break;

      case 'multiChip':
      case 'singleChip':
        if (!td) break;
        var isMulti = (desc.type === 'multiChip');
        var chipsGroup = document.createElement('span');
        chipsGroup.className = P + '-sum-group' + (desc.groupCls ? ' ' + P + '-' + desc.groupCls : '');
        chipsGroup.setAttribute('data-scw-fields', desc.key);
        var chipsLabel = document.createElement('span');
        chipsLabel.className = P + '-sum-label';
        chipsLabel.textContent = desc.label || name;
        chipsGroup.appendChild(chipsLabel);
        // Hide original text content but keep td visible for KTL
        var chipSpan = td.querySelector('span');
        if (chipSpan) { chipSpan.style.display = 'none'; }
        else {
          var chipHidden = document.createElement('span');
          chipHidden.style.display = 'none';
          chipHidden.textContent = readCellText(td);
          td.appendChild(chipHidden);
        }
        var chips = buildRadioChips(td, desc.key, desc.options || [], isMulti);
        chips.classList.add(P + '-sum-chips');
        td.textContent = '';
        if (chipSpan) td.appendChild(chipSpan);
        td.appendChild(chips);
        td.classList.add(P + '-sum-chip-host');
        td.setAttribute(RADIO_CHIPS_ATTR, '1');
        chipsGroup.appendChild(td);
        target.appendChild(chipsGroup);
        break;

      case 'toggleChit':
        if (!td) break;
        var chitVal = (td.textContent || '').replace(/[\u00a0\s]/g, '').trim().toLowerCase();
        var isChitYes = (chitVal === 'yes' || chitVal === 'true');
        // Skip rendering entirely when showOnlyIfYes and value is not yes
        if (desc.showOnlyIfYes && !isChitYes) break;
        var chit = document.createElement('span');
        var chitCls = P + '-cabling-chit ' + (isChitYes ? 'is-yes' : 'is-no');
        if (!desc.feeTrigger) chitCls += ' is-readonly';
        chit.className = chitCls;
        chit.setAttribute('data-field', desc.key);
        chit.innerHTML = desc.chitLabel || 'Existing Cabling';
        var chitSpan = td.querySelector('span');
        if (chitSpan) { chitSpan.style.display = 'none'; }
        td.textContent = '';
        if (chitSpan) td.appendChild(chitSpan);
        td.appendChild(chit);
        td.classList.add(P + '-sum-chip-host');
        td.setAttribute('data-scw-cabling-src', '1');
        var chitWrap = document.createElement('span');
        chitWrap.className = P + '-sum-group ' + P + '-sum-group--cabling';
        chitWrap.setAttribute('data-scw-fields', desc.key);
        var chitLabel = document.createElement('span');
        chitLabel.className = P + '-sum-label';
        chitLabel.innerHTML = '&nbsp;';
        chitWrap.appendChild(chitLabel);
        chitWrap.appendChild(td);
        target.appendChild(chitWrap);
        break;
    }
  }

  function buildSummaryBar(tr, viewCfg) {
    var f = viewCfg.fields;
    var layout = viewCfg.summaryLayout || [];

    var bar = document.createElement('div');
    bar.className = P + '-summary';

    // Detect stacked labels early — needed for vertical alignment of all elements
    // Views can opt out via stackedSummary: false (alignment handled by CSS margin-top)
    var hasStackedFields = viewCfg.stackedSummary !== false && layout.some(function (n) {
      var d = fieldDesc(viewCfg, n);
      return d && d.group === 'right' && d.label;
    });
    if (hasStackedFields) bar.classList.add(P + '-summary--stacked');

    // ── KTL / legacy bulk-edit checkbox (if present) ──
    var checkTd = tr.querySelector('td > input[type="checkbox"]');
    if (checkTd) {
      var checkCell = checkTd.closest('td');
      checkCell.classList.add(P + '-sum-check');
      if (hasStackedFields) {
        // Wrap in column-flex with empty label so checkbox aligns with value row
        var checkWrap = document.createElement('span');
        checkWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;';
        var checkSpacer = document.createElement('span');
        checkSpacer.className = P + '-sum-label';
        checkSpacer.innerHTML = '&nbsp;';
        checkWrap.appendChild(checkSpacer);
        checkWrap.appendChild(checkCell);
        bar.appendChild(checkWrap);
      } else {
        bar.appendChild(checkCell);
      }
    }

    // ── Toggle zone: chevron + identity (label + product) ──
    var toggleZone = document.createElement('span');
    toggleZone.className = P + '-toggle-zone';
    if (hasStackedFields) {
      toggleZone.style.alignSelf = 'flex-start';
      toggleZone.style.alignItems = 'flex-start';
    }

    var chevron = document.createElement('span');
    chevron.className = P + '-chevron ' + P + '-collapsed';
    chevron.innerHTML = CHEVRON_SVG;
    if (hasStackedFields) {
      // Wrap in column-flex with empty label so chevron aligns with value row
      var chevWrap = document.createElement('span');
      chevWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;';
      var chevSpacer = document.createElement('span');
      chevSpacer.className = P + '-sum-label';
      chevSpacer.innerHTML = '&nbsp;';
      chevWrap.appendChild(chevSpacer);
      chevWrap.appendChild(chevron);
      toggleZone.appendChild(chevWrap);
    } else {
      toggleZone.appendChild(chevron);
    }

    // Fixed-width warning slot — always present so layout never shifts
    var warnSlot = document.createElement('span');
    warnSlot.className = P + '-warn-slot';
    if (hasStackedFields) {
      var slotWrap = document.createElement('span');
      slotWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;';
      var slotSpacer = document.createElement('span');
      slotSpacer.className = P + '-sum-label';
      slotSpacer.innerHTML = '&nbsp;';
      slotWrap.appendChild(slotSpacer);
      slotWrap.appendChild(warnSlot);
      toggleZone.appendChild(slotWrap);
    } else {
      toggleZone.appendChild(warnSlot);
    }

    var identity = document.createElement('span');
    identity.className = P + '-identity';

    // Warning chit — placed before label so it appears at the left of the identity block
    var warnDesc = fieldDesc(viewCfg, 'warningCount');
    if (warnDesc) {
      var warnTd = findCell(tr, warnDesc.key);
      var warnVal = warnTd ? parseFloat((warnTd.textContent || '').replace(/[^0-9.-]/g, '')) : 0;
      if (warnVal > 0) {
        var warnChit = document.createElement('span');
        warnChit.className = P + '-warn-chit';
        warnChit.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 9.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.507l-3.22-3.22a.75.75 0 00-1.06 0l-3.22 3.22-1.72-1.72a.75.75 0 00-1.06 0L2.5 12.993v1.757zM12.75 7a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clip-rule="evenodd"/></svg>'
            + Math.round(warnVal);
        identity.appendChild(warnChit);
      }
    }

    var labelDesc = fieldDesc(viewCfg, 'label');
    if (labelDesc) {
      var labelTd = findCell(tr, labelDesc.key, labelDesc.columnIndex);
      if (labelTd) {
        labelTd.classList.add(P + '-sum-label-cell');
        identity.appendChild(labelTd);
      }
    }

    var productDesc = fieldDesc(viewCfg, 'product');
    if (productDesc && productDesc.summary) {
      var productTd = findCell(tr, productDesc.key, productDesc.columnIndex);
      if (productTd) {
        var sep0 = document.createElement('span');
        sep0.className = P + '-sum-sep';
        sep0.textContent = '\u00b7';
        identity.appendChild(sep0);

        var productGroup = document.createElement('span');
        productGroup.className = P + '-product-group';
        // Apply layout-driven classes
        var pgLayout = viewCfg.layout || {};
        if (pgLayout.productGroupLayout === 'column') {
          productGroup.classList.add(P + '-product-group--column');
        }
        if (pgLayout.productGroupWidth === 'flex') {
          productGroup.classList.add(P + '-product-group--flex');
        }
        productGroup.setAttribute('data-scw-fields', productDesc.key);

        // Empty label so product aligns vertically with editable field values
        // Only needed when there's no label-cell (view_3332); when there IS a
        // label-cell (view_3313) the identity wrapper handles alignment.
        if (hasStackedFields && !labelDesc) {
          var prodLabel = document.createElement('span');
          prodLabel.className = P + '-sum-label';
          prodLabel.innerHTML = '&nbsp;';
          productGroup.appendChild(prodLabel);
        }

        productTd.classList.add(P + '-sum-product');
        if (pgLayout.productEditable) {
          productTd.classList.add(P + '-sum-product--editable');
        }
        productGroup.appendChild(productTd);

        // Render identity-grouped fields below the product
        // Text fields (readOnly/directEdit) render as block text;
        // chits collect into a single inline-flex row.
        // Scan ALL fields (not just summaryLayout) for identity group.
        var idChits = [];
        var fieldNames = Object.keys(viewCfg.fields);
        for (var ig = 0; ig < fieldNames.length; ig++) {
          var igDesc = fieldDesc(viewCfg, fieldNames[ig]);
          if (!igDesc || igDesc.group !== 'identity') continue;

          if (igDesc.type === 'toggleChit') {
            // Collect chits for the inline row below
            var chitTd = findCell(tr, igDesc.key, igDesc.columnIndex);
            if (chitTd) {
              var chitText = (chitTd.textContent || '').replace(/[\u00a0\s]/g, '').trim().toLowerCase();
              if (chitText === 'yes' || chitText === 'true') {
                idChits.push({ name: layout[ig], desc: igDesc });
              }
            }
          } else {
            // Text field — render as a block element directly in productGroup
            var idTd = findCell(tr, igDesc.key, igDesc.columnIndex);
            if (idTd && !isCellEmpty(idTd)) {
              idTd.style.cssText = 'display:block;font-size:13px;font-weight:400;color:#374151;' +
                'white-space:normal;word-break:break-word;line-height:1.4;margin-top:2px;padding:0;' +
                'border:none;background:transparent;';
              productGroup.appendChild(idTd);
            }
          }
        }
        if (idChits.length) {
          var idRow = document.createElement('span');
          idRow.style.cssText = 'display:inline-flex;gap:4px;margin-top:4px;flex-wrap:wrap;';
          for (var idf = 0; idf < idChits.length; idf++) {
            renderSummaryField(idRow, tr, idChits[idf].name, idChits[idf].desc, viewCfg);
          }
          if (idRow.childNodes.length) productGroup.appendChild(idRow);
        }

        identity.appendChild(productGroup);
      }
    }

    if (hasStackedFields && labelDesc) {
      // Wrap entire identity so label-cell, separator, and product all
      // drop down together — keeps them aligned with checkbox & chevron.
      var idWrap = document.createElement('span');
      idWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-self:flex-start;';
      var idSpacer = document.createElement('span');
      idSpacer.className = P + '-sum-label';
      idSpacer.innerHTML = '&nbsp;';
      idWrap.appendChild(idSpacer);
      idWrap.appendChild(identity);
      toggleZone.appendChild(idWrap);
    } else {
      toggleZone.appendChild(identity);
    }
    bar.appendChild(toggleZone);

    // ── Walk summaryLayout: dispatch each field to its type builder ──
    var rightGroup = document.createElement('span');
    rightGroup.className = P + '-sum-right';

    for (var i = 0; i < layout.length; i++) {
      var name = layout[i];
      var desc = fieldDesc(viewCfg, name);
      if (!desc || !desc.summary) continue;

      // Skip identity-grouped fields (rendered inside product group above)
      if (desc.group === 'identity') continue;
      // Route to the right container based on group
      var container = (desc.group === 'fill' || desc.group === 'pre') ? bar : rightGroup;
      renderSummaryField(container, tr, name, desc, viewCfg);
    }

    // ── Move icon (structural — always last before delete) ──
    var moveDesc = fieldDesc(viewCfg, 'move');
    if (moveDesc && moveDesc.type === 'moveIcon') {
      var moveTd = findCell(tr, moveDesc.key);
      if (moveTd) {
        if (!moveTd.querySelector('.fa-server')) {
          moveTd.innerHTML =
            '<span style="display:inline-flex; align-items:center; justify-content:center; gap:4px; vertical-align:middle;">' +
              '<i class="fa fa-server" aria-hidden="true" title="Changing Location" style="font-size:22px; line-height:1;"></i>' +
              '<span style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:0; line-height:1;">' +
                '<i class="fa fa-level-up" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
                '<i class="fa fa-level-down" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
              '</span>' +
            '</span>';
        }
        moveTd.classList.add(P + '-sum-move');
        var moveWrap = document.createElement('span');
        moveWrap.className = P + '-sum-group ' + P + '-sum-group--move';
        var moveLabel = document.createElement('span');
        moveLabel.className = P + '-sum-label';
        moveLabel.innerHTML = '&nbsp;';
        moveWrap.appendChild(moveLabel);
        moveWrap.appendChild(moveTd);
        rightGroup.appendChild(moveWrap);
      }
    }

    // ── Delete link (if Knack provides one in this grid) ──
    var deleteLink = tr.querySelector('a.kn-link-delete');
    if (deleteLink) {
      var deleteTd = deleteLink.closest('td');
      var deleteWrap = document.createElement('span');
      deleteWrap.className = P + '-sum-delete';
      deleteWrap.appendChild(deleteLink);
      rightGroup.appendChild(deleteWrap);
      if (deleteTd && !deleteTd.children.length) {
        deleteTd.style.display = 'none';
      }
    }

    bar.appendChild(rightGroup);

    return bar;
  }

  // ============================================================
  // BUILD DETAIL PANEL (data-driven from detailLayout)
  // ============================================================

  // Label map for detail rows — maps field names to display labels.
  // Falls back to a prettified version of the field name if not listed.
  var DETAIL_LABELS = {
    mounting:         'Mounting\nHardware',
    mountingHardware: 'Mounting\nHardware',
    connections:      'Connected to',
    connectedDevice:  'Connected\nDevice',
    scwNotes:         'SCW Notes',
    surveyNotes:      'Survey\nNotes',
    exterior:         'Exterior',
    existingCabling:  'Existing Cabling',
    plenum:           'Plenum',
    mountingHeight:   'Mounting\nHeight',
    dropLength:       'Drop Length',
    conduitFeet:      'Conduit Ft',
    mdfIdf:           'MDF/IDF',
    mdfNumber:        '##',
    name:             'Name',
    dropPrefix:       'Drop Prefix',
    dropNumber:       'Label #',
    laborDescription: 'Labor\nDesc',
    retailPrice:      'Retail Price',
    quantity:         'Qty',
    customDiscPct:    'Custom\nDisc %',
    discountDlr:      'Line Item Discount %',
    appliedDiscount:  'Applied\nDiscount',
    total:            'Total'
  };

  /** Render a single field into a detail section based on its descriptor type. */
  function renderDetailField(section, tr, name, desc, viewId) {
    var td = findCell(tr, desc.key, desc.columnIndex);
    var label = DETAIL_LABELS[name] || desc.label || name;

    switch (desc.type) {
      case 'readOnly':
        // Strip inline-edit affordance — this field is read-only
        if (td) td.classList.remove('cell-edit');
        var row = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty, notes: !!desc.notes });
        if (row) section.appendChild(row);
        break;

      case 'nativeEdit':
        // Preserve Knack's native inline-edit (cell-edit class stays).
        // Used for connection fields that open Knack's modal picker.
        var neRow = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty, notes: !!desc.notes });
        if (neRow) section.appendChild(neRow);
        break;

      case 'directEdit':
        // Respect Knack's inline-edit setting: if the td lacks cell-edit,
        // render as read-only instead of injecting an input.
        if (td && !td.classList.contains('cell-edit')) {
          var roRow = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty, notes: !!desc.notes });
          if (roRow) section.appendChild(roRow);
        } else {
          if (desc.skipEmpty && (!td || isCellEmpty(td))) break;
          var editRow = buildEditableFieldRow(label, td, desc.key, { notes: !!desc.notes });
          if (editRow) section.appendChild(editRow);
        }
        break;

      case 'singleChip':
      case 'multiChip':
        var chipRow = buildRadioChipRow(label, td, desc.key, desc.options || [], desc.type === 'multiChip');
        if (chipRow) section.appendChild(chipRow);
        break;

      case 'connectedRecords':
        // Connected records widget (e.g. mounting hardware in view_3313)
        if (window.SCW && SCW.connectedRecords && typeof SCW.connectedRecords.buildWidget === 'function') {
          var recordId = getRecordId(tr);
          var crWidget = SCW.connectedRecords.buildWidget(viewId, recordId, desc.key, tr);
          if (crWidget) {
            section.appendChild(crWidget);
          } else {
            var crFallback = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty });
            if (crFallback) section.appendChild(crFallback);
          }
        } else {
          var crFallback2 = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty });
          if (crFallback2) section.appendChild(crFallback2);
        }
        break;

      case 'chipStack':
        // Boolean chip stack (exterior/cabling/plenum) injected by boolean-chips.js
        if (!td || td.classList.contains(GRAYED_CLASS)) break;
        var chipStack = td.querySelector('.scw-chip-stack');
        if (chipStack) {
          var chipFieldRow = document.createElement('div');
          chipFieldRow.className = P + '-field';

          var chipLabel = document.createElement('div');
          chipLabel.className = P + '-field-label';
          chipLabel.textContent = '';
          chipFieldRow.appendChild(chipLabel);

          td.classList.add(P + '-chip-host');
          td.classList.add(P + '-field-value');
          td.innerHTML = '';
          var chipsRow = document.createElement('div');
          chipsRow.className = P + '-chips';
          while (chipStack.firstChild) {
            chipsRow.appendChild(chipStack.firstChild);
          }
          td.appendChild(chipsRow);
          chipFieldRow.appendChild(td);
          section.appendChild(chipFieldRow);
        } else {
          var fallbackRow = buildFieldRow(label, td);
          if (fallbackRow) section.appendChild(fallbackRow);
        }
        break;
    }
  }

  function buildDetailPanel(tr, viewCfg) {
    var layout = viewCfg.detailLayout;
    if (!layout) return null;

    var detail = document.createElement('div');
    detail.className = P + '-detail';

    var sections = document.createElement('div');
    sections.className = P + '-sections';

    var sides = ['left', 'center', 'right'];
    for (var s = 0; s < sides.length; s++) {
      var side = sides[s];
      var fieldNames = layout[side];
      if (!fieldNames || !fieldNames.length) continue;

      var section = buildSection('');

      for (var i = 0; i < fieldNames.length; i++) {
        var name = fieldNames[i];
        var desc = fieldDesc(viewCfg, name);
        if (!desc) continue;
        renderDetailField(section, tr, name, desc, viewCfg.viewId);
      }

      sections.appendChild(section);
    }

    detail.appendChild(sections);
    return detail;
  }

  // ============================================================
  // BUILD COMPARISON DETAIL PANEL (view_3575)
  // ============================================================
  //
  // Side-by-side layout: Label | SCW Bid value | Survey value
  // for quick visual discrepancy identification.
  //
  // `snapshots` contains text values for fields that were already
  // moved into the summary bar (label, product).

  function buildComparisonDetailPanel(tr, viewCfg, snapshots) {
    // Resolve field keys from descriptors
    var f = {};
    Object.keys(viewCfg.fields).forEach(function (name) {
      var desc = viewCfg.fields[name];
      f[name] = typeof desc === 'string' ? desc : desc.key;
    });

    var detail = document.createElement('div');
    detail.className = P + '-detail';

    var comp = document.createElement('div');
    comp.className = P + '-comp';

    // ── Column headers ──
    var hdr = document.createElement('div');
    hdr.className = P + '-comp-header';
    var hdrLabel = document.createElement('div');
    hdrLabel.className = P + '-comp-label';
    hdr.appendChild(hdrLabel);
    var hdrScw = document.createElement('div');
    hdrScw.textContent = 'SCW Bid';
    hdr.appendChild(hdrScw);
    var hdrSurvey = document.createElement('div');
    hdrSurvey.textContent = 'Survey';
    hdr.appendChild(hdrSurvey);
    comp.appendChild(hdr);

    // ── Helper: build a standard comparison row ──
    function addCompRow(label, scwTd, surveyTd, opts) {
      opts = opts || {};
      var row = document.createElement('div');
      row.className = P + '-comp-row';

      // Label column
      var lbl = document.createElement('div');
      lbl.className = P + '-comp-label';
      lbl.textContent = label;
      row.appendChild(lbl);

      // SCW value column
      var scwVal = document.createElement('div');
      scwVal.className = P + '-comp-val';
      var scwText = '';
      if (scwTd && !scwTd.classList.contains(GRAYED_CLASS)) {
        scwText = readCellText(scwTd);
        scwTd.classList.add(P + '-field-value');
        if (opts.notes) scwTd.classList.add(P + '-field-value--notes');
        scwVal.appendChild(scwTd);
      } else if (opts.scwSnapshot != null) {
        scwText = opts.scwSnapshot;
        var span = document.createElement('span');
        span.className = P + '-comp-text' + (scwText ? '' : ' ' + P + '-comp-text--empty');
        span.textContent = scwText || '\u2014';
        scwVal.appendChild(span);
      } else {
        scwVal.innerHTML = '<span class="' + P + '-comp-text ' + P + '-comp-text--empty">\u2014</span>';
      }
      row.appendChild(scwVal);

      // Survey value column
      var survVal = document.createElement('div');
      survVal.className = P + '-comp-val';
      var survText = '';
      if (surveyTd && !surveyTd.classList.contains(GRAYED_CLASS)) {
        survText = readCellText(surveyTd);
        surveyTd.classList.add(P + '-field-value');
        if (opts.notes) surveyTd.classList.add(P + '-field-value--notes');
        survVal.appendChild(surveyTd);
      } else if (!opts.emptyRight) {
        survVal.innerHTML = '<span class="' + P + '-comp-text ' + P + '-comp-text--empty">\u2014</span>';
      }
      row.appendChild(survVal);

      // Mismatch highlight (when both sides have comparable values)
      if (!opts.skipMismatch && scwText && survText &&
          scwText.toLowerCase() !== survText.toLowerCase()) {
        row.classList.add(P + '-comp-mismatch');
      }

      comp.appendChild(row);
      return row;
    }

    // ── LABEL ──
    addCompRow('Label',
      findCell(tr, f.label),          // may be null if summary took it
      findCell(tr, f.surveyLabel),
      { scwSnapshot: snapshots.label }
    );

    // ── PRODUCT ──
    addCompRow('Product',
      findCell(tr, f.product),        // may be null if summary took it
      findCell(tr, f.surveyProduct),
      { scwSnapshot: snapshots.product }
    );

    // ── CONNECTED TO ──
    addCompRow('Connected To',
      findCell(tr, f.connections),
      findCell(tr, f.surveyConnections)
    );

    // ── DROP LENGTH ──
    addCompRow('Drop Length',
      findCell(tr, f.dropLength),
      findCell(tr, f.surveyDropLength)
    );

    // ── BOOLEAN CHIPS (unlabelled) ──
    // SCW side: reconstituted chip stack (exterior / existing cabling / plenum)
    // Survey side: field_1972 (TBD placeholder)
    var chipsRow = document.createElement('div');
    chipsRow.className = P + '-comp-row';

    var chipsLabel = document.createElement('div');
    chipsLabel.className = P + '-comp-label';
    chipsLabel.textContent = '';
    chipsRow.appendChild(chipsLabel);

    // SCW chips
    var chipsScwVal = document.createElement('div');
    chipsScwVal.className = P + '-comp-val';
    var chipHostTd = findCell(tr, f.exterior);
    if (chipHostTd && !chipHostTd.classList.contains(GRAYED_CLASS)) {
      var chipStack = chipHostTd.querySelector('.scw-chip-stack');
      if (chipStack) {
        chipHostTd.classList.add(P + '-chip-host');
        chipHostTd.classList.add(P + '-field-value');
        chipHostTd.innerHTML = '';
        var chipsWrap = document.createElement('div');
        chipsWrap.className = P + '-chips';
        while (chipStack.firstChild) {
          chipsWrap.appendChild(chipStack.firstChild);
        }
        chipHostTd.appendChild(chipsWrap);
        chipsScwVal.appendChild(chipHostTd);
      } else {
        chipHostTd.classList.add(P + '-field-value');
        chipsScwVal.appendChild(chipHostTd);
      }
    }
    chipsRow.appendChild(chipsScwVal);

    // Survey chips placeholder
    var chipsSurvVal = document.createElement('div');
    chipsSurvVal.className = P + '-comp-val';
    var surveyChipsTd = findCell(tr, f.surveyChips);
    if (surveyChipsTd && !surveyChipsTd.classList.contains(GRAYED_CLASS)) {
      surveyChipsTd.classList.add(P + '-field-value');
      chipsSurvVal.appendChild(surveyChipsTd);
    } else {
      chipsSurvVal.innerHTML = '<span class="' + P + '-comp-text ' + P + '-comp-text--empty">\u2014</span>';
    }
    chipsRow.appendChild(chipsSurvVal);
    comp.appendChild(chipsRow);

    // ── MOUNT HEIGHT (radio chips, SCW only) ──
    var mhRow = document.createElement('div');
    mhRow.className = P + '-comp-row';

    var mhLabel = document.createElement('div');
    mhLabel.className = P + '-comp-label';
    mhLabel.textContent = 'Mount Height';
    mhRow.appendChild(mhLabel);

    var mhScwVal = document.createElement('div');
    mhScwVal.className = P + '-comp-val';
    var mhTd = findCell(tr, f.mountingHeight);
    if (mhTd && !mhTd.classList.contains(GRAYED_CLASS)) {
      var mhWrapper = document.createElement('div');
      mhWrapper.className = P + '-field-value';
      mhWrapper.style.border = 'none';
      mhWrapper.style.padding = '0';
      mhWrapper.style.background = 'transparent';
      var mhDesc = fieldDesc(viewCfg, 'mountingHeight');
      var mhOpts = (mhDesc && mhDesc.options) || ["Under 16'", "16' - 24'", "Over 24'"];
      var mhChips = buildRadioChips(mhTd, f.mountingHeight, mhOpts);
      mhWrapper.appendChild(mhChips);
      mhTd.style.display = 'none';
      mhTd.setAttribute(RADIO_CHIPS_ATTR, '1');
      mhWrapper.appendChild(mhTd);
      mhScwVal.appendChild(mhWrapper);
    }
    mhRow.appendChild(mhScwVal);

    var mhSurvVal = document.createElement('div');
    mhSurvVal.className = P + '-comp-val';
    mhRow.appendChild(mhSurvVal);
    comp.appendChild(mhRow);

    // ── CONDUIT FEET (SCW only) ──
    addCompRow('Conduit Feet',
      findCell(tr, f.conduitFeet),
      null,
      { emptyRight: true }
    );

    // ── SURVEY NOTES ──
    addCompRow('Survey Notes',
      findCell(tr, f.scwNotes),
      findCell(tr, f.surveyNotes),
      { notes: true }
    );

    detail.appendChild(comp);
    return detail;
  }

  // (buildSimpleDetailPanel removed — merged into generic buildDetailPanel)

  // ============================================================
  // ACCORDION TOGGLE
  // ============================================================

  function toggleDetail(wsTr) {
    var detail = wsTr.querySelector('.' + P + '-detail');
    var chevron = wsTr.querySelector('.' + P + '-chevron');
    if (!detail) return;

    var isOpen = detail.classList.contains(P + '-open');

    var keepPhoto = wsTr.hasAttribute('data-scw-photo-always');

    if (isOpen) {
      // Collapse
      detail.classList.remove(P + '-open');
      if (chevron) {
        chevron.classList.remove(P + '-expanded');
        chevron.classList.add(P + '-collapsed');
      }
      // Hide the in-card photo wrapper (unless photoAlwaysVisible)
      if (!keepPhoto) {
        var photoWrap = wsTr.querySelector('.' + P + '-photo-wrap');
        if (photoWrap) photoWrap.classList.add(P + '-photo-hidden');
        // Legacy: also hide sibling photo row if not absorbed
        var photoRow = wsTr.nextElementSibling;
        if (photoRow && photoRow.classList.contains('scw-inline-photo-row')) {
          photoRow.classList.add(P + '-photo-hidden');
        }
      }
    } else {
      // Expand
      detail.classList.add(P + '-open');
      if (chevron) {
        chevron.classList.remove(P + '-collapsed');
        chevron.classList.add(P + '-expanded');
      }
      // Show the in-card photo wrapper
      var photoWrap2 = wsTr.querySelector('.' + P + '-photo-wrap');
      if (photoWrap2) photoWrap2.classList.remove(P + '-photo-hidden');
      // Legacy: also show sibling photo row if not absorbed
      var photoRow2 = wsTr.nextElementSibling;
      if (photoRow2 && photoRow2.classList.contains('scw-inline-photo-row')) {
        photoRow2.classList.remove(P + '-photo-hidden');
      }
    }
  }

  // ============================================================
  // BUILD FULL WORKSHEET CARD
  // ============================================================

  function buildWorksheetCard(tr, viewCfg) {
    var card = document.createElement('div');
    card.className = P + '-card';

    // For comparison layouts, snapshot field text values that appear
    // in both the summary and detail BEFORE the summary moves them.
    var snapshots = null;
    if (viewCfg.comparisonLayout) {
      snapshots = {};
      var labelK = fieldKey(viewCfg, 'label');
      var prodK  = fieldKey(viewCfg, 'product');
      var prodDesc = fieldDesc(viewCfg, 'product');
      if (labelK) snapshots.label   = readCellText(findCell(tr, labelK));
      if (prodK)  snapshots.product = readCellText(findCell(tr, prodK, prodDesc ? prodDesc.columnIndex : undefined));
    }

    // Pre-clone cells whose field key appears in BOTH the summary and
    // detail layouts.  The summary builder moves the original <td> out of
    // the <tr>, so the detail builder would find nothing.  Cloned cells
    // are appended (hidden) to the <tr> so findCell still works for the
    // detail pass.
    var _sharedClones = [];
    if (viewCfg.detailLayout && viewCfg.summaryLayout) {
      var summaryKeys = {};
      viewCfg.summaryLayout.forEach(function (n) {
        var d = fieldDesc(viewCfg, n);
        if (d) summaryKeys[d.key] = true;
      });
      var sides = ['left', 'center', 'right'];
      for (var si = 0; si < sides.length; si++) {
        var names = (viewCfg.detailLayout[sides[si]] || []);
        for (var di = 0; di < names.length; di++) {
          var dd = fieldDesc(viewCfg, names[di]);
          if (dd && summaryKeys[dd.key]) {
            var origTd = findCell(tr, dd.key, dd.columnIndex);
            if (origTd) {
              var clone = origTd.cloneNode(true);
              clone.style.display = 'none';
              _sharedClones.push(clone);
              tr.appendChild(clone);
            }
          }
        }
      }
    }

    // Summary bar (always visible)
    var summary = buildSummaryBar(tr, viewCfg);
    card.appendChild(summary);

    // Un-hide cloned cells so the detail builder can render them normally
    for (var ci = 0; ci < _sharedClones.length; ci++) {
      _sharedClones[ci].style.display = '';
    }

    // Detail panel (expandable)
    var detail;
    if (viewCfg.comparisonLayout) {
      detail = buildComparisonDetailPanel(tr, viewCfg, snapshots);
    } else {
      detail = buildDetailPanel(tr, viewCfg);
    }
    if (detail) card.appendChild(detail);

    // ── Accessory mismatch header warning ──
    // If any connected-records widget flagged a warning, place icon in the
    // fixed-width warn-slot (between chevron and identity) so it never shifts layout.
    var crWidgets = card.querySelectorAll('.scw-ws-field > .scw-cr-list');
    for (var w = 0; w < crWidgets.length; w++) {
      var parentField = crWidgets[w].parentElement;
      if (parentField && parentField._hasWarning) {
        var warnIcon = document.createElement('span');
        warnIcon.className = 'scw-cr-hdr-warning';
        warnIcon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        warnIcon.title = 'Accessory mismatch — one or more accessories do not match parent product';

        var slot = card.querySelector('.' + P + '-warn-slot');
        if (slot) slot.appendChild(warnIcon);
        break;
      }
    }

    // ── Apply bucket-based field hiding + label injection ──
    applyBucketRules(card, tr, viewCfg);

    return card;
  }

  // ============================================================
  // TRANSFORM VIEW
  // ============================================================

  function transformView(viewCfg) {
    if (viewCfg.disabled) return;
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;

    var table = $view.find('table.kn-table-table, table.kn-table')[0];
    if (!table) return;

    table.classList.remove('is-striped', 'ktlTable--rowHover', 'is-bordered', 'can-overflow-x');

    // Also remove can-overflow-x from table wrapper div if present
    var tableWrapper = table.parentElement;
    if (tableWrapper) tableWrapper.classList.remove('can-overflow-x');

    var thead = table.querySelector('thead');
    if (thead) thead.style.display = '';

    var $rows = $(table).find('tbody > tr');

    // ── Hoist colCount — same for every row, no need to recompute ──
    // Must run BEFORE thead reordering so colspan reflects full column count.
    var headerRow = table.querySelector('thead tr');
    var colCount = 1;
    if (headerRow) {
      colCount = 0;
      var hCells = headerRow.children;
      for (var ci = 0; ci < hCells.length; ci++) {
        colCount += parseInt(hCells[ci].getAttribute('colspan') || '1', 10);
      }
    }

    // ── Reorder & filter <thead> columns to match summary bar layout ──
    // Width application is deferred until after PHASE 3 so we can measure
    // the actual rendered summary-bar group widths instead of guessing.
    // (thead columns are content-width only — no measured-width lock)

    if (headerRow) {
      var L = viewCfg.layout;

      // Build desired field-key order + labels from view config:
      //   [checkbox] [label] [product] [summaryLayout fields...] [move]
      var desiredFields = [];
      var thLabels = {};   // field_key → display label

      var _labelDesc = fieldDesc(viewCfg, 'label');
      if (_labelDesc) desiredFields.push(_labelDesc.key);

      var _productDesc = fieldDesc(viewCfg, 'product');
      if (_productDesc) desiredFields.push(_productDesc.key);

      var _summaryLayout = viewCfg.summaryLayout || [];
      for (var si = 0; si < _summaryLayout.length; si++) {
        var _name = _summaryLayout[si];
        var _desc = fieldDesc(viewCfg, _name);
        if (!_desc || desiredFields.indexOf(_desc.key) !== -1) continue;
        desiredFields.push(_desc.key);
        if (_desc.label) thLabels[_desc.key] = _desc.label;
      }

      var _moveDesc = fieldDesc(viewCfg, 'move');
      if (_moveDesc) desiredFields.push(_moveDesc.key);

      // Index <th> elements by field key
      var thByField = {};
      var checkboxTh = null;
      var allThs = [];
      for (var ti = headerRow.children.length - 1; ti >= 0; ti--) {
        allThs.unshift(headerRow.children[ti]);
      }

      for (var tj = 0; tj < allThs.length; tj++) {
        var _th = allThs[tj];
        if (_th.classList.contains('ktlCheckboxHeaderCell')) {
          checkboxTh = _th;
          continue;
        }
        var _cls = _th.className.split(/\s+/);
        var _fk = null;
        for (var tc = 0; tc < _cls.length; tc++) {
          var _c = _cls[tc];
          if (_c.indexOf('field_') === 0) {
            _fk = _c.indexOf(':') !== -1 ? _c.substring(0, _c.indexOf(':')) : _c;
            break;
          }
        }
        if (_fk) thByField[_fk] = _th;
      }

      // Hide all non-checkbox <th>s, then show + reorder desired ones
      for (var tk = 0; tk < allThs.length; tk++) {
        if (allThs[tk] !== checkboxTh) allThs[tk].style.display = 'none';
      }

      thead.classList.add(P + '-thead-styled');

      if (checkboxTh) headerRow.appendChild(checkboxTh);

      for (var di = 0; di < desiredFields.length; di++) {
        var _fKey = desiredFields[di];
        if (_fKey === 'field_1946') continue; // hide move/MDF field from sort header
        var _showTh = thByField[_fKey];
        if (!_showTh) continue;

        _showTh.style.display = '';
        _showTh.style.width = '';
        _showTh.style.minWidth = '';
        _showTh.style.maxWidth = '';

        // Inject bulk-edit checkbox into field_1984 (Exterior Mounting)
        // KTL doesn't add one but it should match field_2461 (Existing Cabling)
        if (_fKey === 'field_1984') {
          var _fl = _showTh.querySelector('.table-fixed-label');
          if (_fl && !_fl.querySelector('.bulkEditHeaderCbox')) {
            _fl.classList.add('bulkEditTh');
            _fl.style.display = 'inline-flex';
            var _cb = document.createElement('input');
            _cb.type = 'checkbox';
            _cb.className = 'ktlCheckbox bulkEditHeaderCbox ktlDisplayNone ktlCheckbox-header ktlCheckbox-table ktlCheckbox-bulkops bulkEditCb';
            _cb.setAttribute('aria-label', 'Select column');
            _cb.setAttribute('data-ktl-bulkops', '1');
            _fl.appendChild(_cb);
          }
        }

        // Rename label to match summary bar display name
        var _tl = thLabels[_fKey];
        if (_tl) {
          var _labelSpan = _showTh.querySelector('.kn-sort > span');
          if (!_labelSpan) _labelSpan = _showTh.querySelector('.table-fixed-label > span');
          if (_labelSpan) _labelSpan.textContent = _tl;
        }

        headerRow.appendChild(_showTh);
      }

      // ── Sync header checkbox visibility with row selections ──
      // KTL's own listeners break when we reorder <th> elements.
      // Watch for any checkbox change in the entire view and toggle
      // ktlDisplayNone on header bulk-edit checkboxes accordingly.
      (function (viewEl, hRow) {
        function syncHeaderCboxes() {
          // Any selection checkbox checked? (row-level, group-level, or master)
          var anyChecked = viewEl.querySelector(
            'input.ktlCheckbox:checked'
          );
          var hCboxes = hRow.querySelectorAll('.bulkEditHeaderCbox');
          for (var ci = 0; ci < hCboxes.length; ci++) {
            if (anyChecked) {
              hCboxes[ci].classList.remove('ktlDisplayNone');
            } else {
              hCboxes[ci].classList.add('ktlDisplayNone');
            }
          }
        }
        $($view).off('change.scwBulkSync').on('change.scwBulkSync', 'input[type="checkbox"]', syncHeaderCboxes);
      })($view[0], headerRow);

    }

    // ── PHASE 1: READ — filter eligible rows, collect DOM-read data ──
    //
    // Conditional cell colors (danger/warning) are now computed from
    // field values using evaluateConditionalColor() instead of reading
    // getComputedStyle() on each td.  This eliminates ALL forced style
    // recalculations from the render path — the color is derived from
    // pure logic (field key + text value), not from the browser's
    // computed style resolution.
    //
    // Bucket and move-field info are also collected here (DOM tree
    // reads with no layout cost) so Phase 2 can build cards without
    // any reads from the live document.
    var eligible = [];

    $rows.each(function () {
      var tr = this;
      if (tr.classList.contains('kn-table-group')) return;
      if (tr.classList.contains('scw-inline-photo-row')) return;
      if (tr.classList.contains(WORKSHEET_ROW)) return;
      if (!getRecordId(tr)) return;
      if (tr.getAttribute(PROCESSED_ATTR) === '1') return;

      // Pre-read bucket and move-field info (DOM reads, no layout cost)
      var preBucketRowClass = '';
      if (viewCfg.bucketField && viewCfg.bucketRules) {
        var rowBucketId = readBucketId(tr, viewCfg.bucketField);
        var rowBucketRule = rowBucketId ? viewCfg.bucketRules[rowBucketId] : null;
        if (rowBucketRule && rowBucketRule.rowClass) {
          preBucketRowClass = rowBucketRule.rowClass;
        }
      }
      var hasNoMove = false;
      if (viewCfg.syntheticBucketGroups) {
        var prev = tr.previousElementSibling;
        while (prev && !prev.classList.contains('kn-table-group')) {
          prev = prev.previousElementSibling;
        }
        if (!prev) {
          hasNoMove = true;
        } else {
          hasNoMove = getGroupLabelText(prev).length === 0;
        }
      }

      eligible.push({ tr: tr, bucketCls: preBucketRowClass, hasNoMove: hasNoMove });
    });

    // ── PHASE 2: BUILD — construct cards from collected data ──
    //
    // buildWorksheetCard reparents <td> elements into the card DOM,
    // which mutates the source rows.  Conditional colors are computed
    // from field values (evaluateConditionalColor), not from the
    // browser's computed style, so these mutations cause zero forced
    // style recalculations.
    var pendingInserts = [];

    for (var ri = 0; ri < eligible.length; ri++) {
      var entry = eligible[ri];
      var tr = entry.tr;

      var card = buildWorksheetCard(tr, viewCfg);

      var wsTr = document.createElement('tr');
      wsTr.className = WORKSHEET_ROW;
      wsTr.id = tr.id;
      tr.removeAttribute('id');

      if (entry.bucketCls) wsTr.classList.add(entry.bucketCls);
      if (entry.hasNoMove) wsTr.setAttribute('data-scw-no-move', '1');
      if (viewCfg.photoAlwaysVisible) wsTr.setAttribute('data-scw-photo-always', '1');

      var wsTd = document.createElement('td');
      wsTd.setAttribute('colspan', String(colCount));
      wsTd.appendChild(card);
      wsTr.appendChild(wsTd);

      tr.setAttribute(PROCESSED_ATTR, '1');
      pendingInserts.push({ wsTr: wsTr, sourceTr: tr });
    }

    // ── PHASE 3: INSERT — batch all DOM insertions in one pass ──
    //
    // Batching avoids interleaving writes with the reads that happened
    // in Phase 1.  The browser can coalesce these mutations into a
    // single reflow instead of reflowing after each insertion.
    for (var pi = 0; pi < pendingInserts.length; pi++) {
      var ins = pendingInserts[pi];
      ins.sourceTr.parentNode.insertBefore(ins.wsTr, ins.sourceTr.nextSibling);
    }

    // After all rows are processed, absorb photo row content into the
    // card div so header + detail + photos form one shadow-able unit.
    var wsRows = table.querySelectorAll('tr.' + WORKSHEET_ROW);
    for (var j = 0; j < wsRows.length; j++) {
      var ws = wsRows[j];
      var card = ws.querySelector('.' + P + '-card');
      var photoRow = ws.nextElementSibling;
      if (photoRow && photoRow.classList.contains('scw-inline-photo-row') && card) {
        // Move photo content into the card
        var photoWrap = document.createElement('div');
        photoWrap.className = P + '-photo-wrap' + (viewCfg.photoAlwaysVisible ? '' : ' ' + P + '-photo-hidden');
        var photoTd = photoRow.querySelector('td');
        if (photoTd) {
          while (photoTd.firstChild) {
            photoWrap.appendChild(photoTd.firstChild);
          }
        }
        card.appendChild(photoWrap);
        // Mark the original photo <tr> as absorbed so it stays hidden
        photoRow.classList.add(P + '-photo-absorbed');

        // For photoAlwaysVisible views, hide the strip when there
        // are no actual photo records (only the "+ Add" button).
        if (viewCfg.photoAlwaysVisible && !photoWrap.querySelector('.scw-inline-photo-card')) {
          photoWrap.classList.add(P + '-photo-hidden');
        }
      }
    }

    // ── SYNTHETIC GROUP HEADERS for ungrouped Assumptions / Services ──
    // Rows with an empty MDF/IDF (move) field that are Assumptions or
    // Services get collected under synthetic group-header rows placed
    // FIRST in the table (before MDF/IDF groups).
    if (viewCfg.syntheticBucketGroups && viewCfg.syntheticBucketGroups.length) {
      var tbody = table.querySelector('tbody');
      var colSpan = 1;
      var hdr = table.querySelector('thead tr');
      if (hdr) {
        colSpan = 0;
        var hCells = hdr.children;
        for (var ci = 0; ci < hCells.length; ci++) {
          colSpan += parseInt(hCells[ci].getAttribute('colspan') || '1', 10);
        }
      }

      // Pale blue accent for synthetic groups (matches view accordion style)
      var SYNTH_ACCENT = '#5b9bd5';
      var SYNTH_ACCENT_RGB = '91,155,213';

      // Remove empty native Knack group headers (blank MDF/IDF value)
      // and any orphaned photo rows directly beneath them.
      var nativeGroups = tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1');
      for (var gi = 0; gi < nativeGroups.length; gi++) {
        var grp = nativeGroups[gi];
        if (grp.classList.contains('scw-synthetic-group')) continue;
        var labelText = getGroupLabelText(grp);
        if (labelText.length === 0) {
          // Remove orphaned photo rows that follow this empty header
          var sib = grp.nextElementSibling;
          while (sib && !sib.classList.contains('kn-table-group') &&
                 !sib.classList.contains(WORKSHEET_ROW)) {
            var toRemove = sib;
            sib = sib.nextElementSibling;
            toRemove.remove();
          }
          grp.remove();
        }
      }

      // Helper: build a gray divider row
      function makeDivider() {
        var divTr = document.createElement('tr');
        divTr.className = 'scw-synth-divider';
        var divTd = document.createElement('td');
        divTd.setAttribute('colspan', String(colSpan));
        divTr.appendChild(divTd);
        return divTr;
      }

      // Build synthetic groups in reverse so insertions at top keep order:
      // Project Assumptions first, then Project Services.
      var buckets = viewCfg.syntheticBucketGroups;

      // Track the last inserted row to place the bottom divider after
      var lastInsertedRow = null;
      var anySyntheticBuilt = false;

      buckets.forEach(function (bucket) {
        // Find worksheet rows that belong to this bucket AND have no MDF/IDF.
        var candidates = tbody.querySelectorAll(
          'tr.' + WORKSHEET_ROW + '.' + bucket.cls + '[data-scw-no-move="1"]'
        );
        if (!candidates.length) return;

        anySyntheticBuilt = true;

        // Build a synthetic kn-table-group row styled with pale blue accent
        var groupTr = document.createElement('tr');
        groupTr.className = 'kn-table-group kn-group-level-1 scw-group-header scw-synthetic-group';
        groupTr.style.cssText = '--scw-grp-accent: ' + SYNTH_ACCENT +
          '; --scw-grp-accent-rgb: ' + SYNTH_ACCENT_RGB + ';';
        var groupTd = document.createElement('td');
        groupTd.setAttribute('colspan', String(colSpan));
        groupTd.textContent = bucket.label;
        groupTr.appendChild(groupTd);

        // Collect rows to move (snapshot to avoid live-NodeList issues)
        var rowsToMove = [];
        for (var k = 0; k < candidates.length; k++) {
          var wsRow = candidates[k];
          var origRow = wsRow.previousElementSibling;
          var photoRows = [];
          var nxt = wsRow.nextElementSibling;
          while (nxt && nxt.classList.contains('scw-inline-photo-row')) {
            photoRows.push(nxt);
            nxt = nxt.nextElementSibling;
          }
          rowsToMove.push({
            orig: (origRow && origRow.getAttribute(PROCESSED_ATTR) === '1') ? origRow : null,
            ws: wsRow,
            photos: photoRows
          });
        }

        // Insert the group header at the very top of tbody
        var firstChild = tbody.firstChild;
        tbody.insertBefore(groupTr, firstChild);

        // Insert each row set right after the group header (in order)
        var insertRef = groupTr;
        for (var m = 0; m < rowsToMove.length; m++) {
          var set = rowsToMove[m];
          if (set.orig) {
            insertRef.parentNode.insertBefore(set.orig, insertRef.nextSibling);
            insertRef = set.orig;
          }
          insertRef.parentNode.insertBefore(set.ws, insertRef.nextSibling);
          insertRef = set.ws;
          for (var p = 0; p < set.photos.length; p++) {
            insertRef.parentNode.insertBefore(set.photos[p], insertRef.nextSibling);
            insertRef = set.photos[p];
          }
        }
        lastInsertedRow = insertRef;
      });

      // Insert gray divider bars around the synthetic section
      if (anySyntheticBuilt) {
        // Bottom divider: after the last synthetic group's rows
        if (lastInsertedRow && lastInsertedRow.nextSibling) {
          tbody.insertBefore(makeDivider(), lastInsertedRow.nextSibling);
        } else if (lastInsertedRow) {
          tbody.appendChild(makeDivider());
        }
      }
    }

    // ── THEAD SIZING ──
    // Let each <th> size to its content naturally (no measured-width lock).
    // The thead is for sorting/bulk-edit only — it doesn't need to align
    // pixel-perfectly with the summary bars below.

    // ── RESTORE EXPANDED STATE ──
    // Re-expand detail panels that were open before the inline-edit
    // re-render.  Must run AFTER all worksheet rows + photo rows are
    // built so toggleDetail can find and show the photo row too.
    restoreExpandedState(viewCfg.viewId);

    // ── DEFAULT OPEN ──
    // If the view config sets defaultOpen: true, expand ALL rows that
    // are still collapsed after restore (first render, not re-render).
    if (viewCfg.defaultOpen) {
      var allWsRows = table.querySelectorAll('tr.' + WORKSHEET_ROW);
      for (var doi = 0; doi < allWsRows.length; doi++) {
        var dDetail = allWsRows[doi].querySelector('.' + P + '-detail');
        if (dDetail && !dDetail.classList.contains(P + '-open')) {
          toggleDetail(allWsRows[doi]);
        }
      }
    }

    // ── RE-APPLY GROUP COLLAPSE STATE ──
    // transformView creates new DOM rows that are visible by default.
    // Group-collapse may have already run and set .scw-collapsed on
    // headers before these rows existed.  Explicitly re-enhance so
    // collapsed groups properly hide their new content rows.
    if (window.SCW && window.SCW.groupCollapse && window.SCW.groupCollapse.enhance) {
      window.SCW.groupCollapse.enhance();
    }

    // ── RESTORE CACHED HEADER LABELS ──
    // If a trigger-field save caused this re-render, the rebuilt DOM
    // may have stale formula data.  Re-apply labels from our cache
    // (populated from the PUT response) now that the DOM is stable.
    restoreCachedLabels(viewCfg.viewId);

    // ── NOTIFY DEPENDENT MODULES ──
    // Dispatch a custom event so modules like select-all-checkboxes can
    // run exactly once after the worksheet DOM is stable, instead of
    // relying on blind timers or a body-level MutationObserver.
    document.dispatchEvent(new CustomEvent('scw-worksheet-ready', {
      detail: { viewId: viewCfg.viewId }
    }));
  }

  // ============================================================
  // DELEGATED CLICK HANDLER FOR ACCORDION TOGGLE
  // ============================================================
  // ONLY the toggle-zone (chevron + identity) toggles the detail
  // panel.  All other clicks in the summary bar are left alone so
  // Knack / KTL inline edit can work without interference.

  $(document).on('click' + EVENT_NS, '.' + P + '-toggle-zone', function (e) {
    // Let clicks on the product cell pass through to KTL / Knack inline-edit
    var target = e.target;
    if (target.closest('.' + P + '-sum-product') || target.closest('.' + P + '-product-group')) {
      return;
    }
    e.preventDefault();
    var wsTr = this.closest('tr.' + WORKSHEET_ROW);
    if (wsTr) {
      toggleDetail(wsTr);
      // Persist accordion state to localStorage after toggle
      var viewEl = wsTr.closest('.kn-view');
      if (viewEl) captureExpandedState(viewEl.id);
    }
  });

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    injectStyles();

    WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
      var viewId = viewCfg.viewId;

      $(document)
        .off('knack-view-render.' + viewId + EVENT_NS)
        .on('knack-view-render.' + viewId + EVENT_NS, function () {
          setTimeout(function () { transformView(viewCfg); }, 150);
        });

      $(document)
        .off('knack-cell-update.' + viewId + EVENT_NS)
        .on('knack-cell-update.' + viewId + EVENT_NS, function () {
          // Capture expanded panel state BEFORE Knack re-renders.
          // transformView will restore it after rebuilding.
          captureExpandedState(viewId);
        });

      if ($('#' + viewId).length) {
        setTimeout(function () { transformView(viewCfg); }, 150);
      }
    });
  }

  // Capture ALL worksheet view states on ANY cell-update, because
  // refresh-on-inline-edit.js may trigger model.fetch() on sibling
  // views — causing them to re-render even though the edit wasn't
  // on their view.  The per-view handler above handles the edited
  // view; this generic handler covers the cross-refresh case.
  $(document)
    .off('knack-cell-update' + EVENT_NS + 'All')
    .on('knack-cell-update' + EVENT_NS + 'All', function () {
      captureAllExpandedStates();
    });

  if (document.readyState === 'loading') {
    $(document).ready(init);
  } else {
    init();
  }

  // ── Expose API for coordination with post-edit restore ──
  window.SCW = window.SCW || {};
  window.SCW.deviceWorksheet = {
    /** Capture expanded panel state for all worksheet views. */
    captureState: captureAllExpandedStates,
    /** Force re-transform a view (idempotent). */
    refresh: function (viewId) {
      WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
        if (!viewId || viewCfg.viewId === viewId) {
          transformView(viewCfg);
        }
      });
    }
  };
})();
// ============================================================
// End Device Worksheet
// ============================================================
