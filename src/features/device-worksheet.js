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
        hideDeleteWhenFieldNotBlank: 'field_2404',
        fields: {
          // ── Summary row ──
          bid:              { key: 'field_2415', type: 'readOnly',   summary: true, label: 'Bid',   group: 'right', groupCls: 'sum-group--bid' },
          move:             { key: 'field_2375', type: 'moveIcon',   summary: true },
          label:            { key: 'field_2364', type: 'readOnly',   summary: true },
          product:          { key: 'field_2379', type: 'readOnly',   summary: true, productStyle: true, columnIndex: 4 },
          laborDescription: { key: 'field_2409', type: 'directEdit', summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          existingCabling:  { key: 'field_2370', type: 'toggleChit', summary: true, feeTrigger: true },
          labor:            { key: 'field_2400', type: 'directEdit', summary: true, label: 'Labor', group: 'right', groupCls: 'sum-group--labor', feeTrigger: true },
          quantity:         { key: 'field_2399', type: 'readOnly', label: 'Qty' },
          warningCount:     { key: 'field_2454', type: 'warningChit' },

          // ── Detail panel ──
          mounting:         { key: 'field_2463', type: 'readOnly',   columnIndex: 6 },
          connections:      { key: 'field_2381', type: 'readOnly' },
          scwNotes:         { key: 'field_2418', type: 'readOnly' },
          surveyNotes:      { key: 'field_2412', type: 'directEdit', notes: true },
          exterior:         { key: 'field_2372', type: 'chipStack' },
          plenum:           { key: 'field_2371', type: 'readOnly' },
          mountingHeight:   { key: 'field_2455', type: 'singleChip', options: ["Under 16'", "16' - 24'", "Over 24'"] },
          dropLength:       { key: 'field_2367', type: 'directEdit' },
          conduitFeet:      { key: 'field_2368', type: 'directEdit' }
        },
        summaryLayout: ['laborDescription', 'existingCabling', 'labor', 'bid'],
        // Same BID-object keys as view_3505 (see that entry's note).
        rowSort: [
          { field: 'field_2218', order: 'asc',  type: 'number' },
          { field: 'field_2361', order: 'asc',  type: 'text'   },
          { field: 'field_2362', order: 'asc',  type: 'number' },
          { field: 'field_2382', order: 'desc', type: 'number' }
        ],
        detailLayout: {
          left:  ['mounting', 'scwNotes'],
          right: ['connections', 'exterior', 'mountingHeight', 'dropLength', 'conduitFeet', 'surveyNotes']
        }
      },
      // view_3505 (survey worksheet) v1 config removed — fully v2 (cutover:
      // worksheet-v2 view_3505 entry is the primary survey/bid surface, the
      // native #view_3505 table is hidden by styles.js, and v1 bailed here
      // via V2_TAKEOVER). See worksheet-v2/config.js view_3505 entry.
      {
        // ── INSTALL line items (Implementation page, scene_1311) ──
        // Mirrors view_3505's bucketing: Camera/Reader rows get the full
        // install card; Mounting Hardware + Assumptions get simpler rows.
        // Field map mirrors the SOW/Survey worksheet concepts so the UI
        // is recognizable to anyone who's used the survey/SOW pages.
        viewId: 'view_4093',
        layout: { productGroupWidth: '300px', detailGrid: '455px 1fr', labelInProductGroup: true, productEditable: false },
        // ── Main config: used for Camera or Reader rows ──
        fields: {
          // ── Summary row ──
          label:            { key: 'field_2819', type: 'readOnly',   summary: true },
          product:          { key: 'field_2790', type: 'readOnly',   summary: true, productStyle: true },
          // TODO: confirm field_2825's actual Knack dropdown option list — guesses below.
          installStatus:    { key: 'field_2825', type: 'singleChip', segmented: true, options: ['Not Started', 'In Progress', 'Blocked', 'Done'], summary: true, label: 'Status', group: 'right', groupCls: 'sum-group--install-status' },
          // Header QA chits — one small icon per required photo, green
          // check = captured, amber warning = missing. Photo data is
          // scraped from the same field_2445/2446/2447 connection cells
          // that inline-photo-row reads, so they must remain as columns
          // on view_4093 in the Builder.
          requiredPhotos:   { type: 'requiredPhotos', summary: true, label: 'QA', group: 'right', groupCls: 'sum-group--req-photos' },
          existingCabling:  { key: 'field_2807', type: 'readOnly', label: 'Existing cabling', showWhenFieldIsYes: 'field_2807' },
          exteriorChit:     { key: 'field_2805', type: 'readOnly', label: 'Exterior',         showWhenFieldIsYes: 'field_2805' },
          plenumChit:       { key: 'field_2806', type: 'readOnly', label: 'Plenum',           showWhenFieldIsYes: 'field_2806' },

          // ── Detail panel ──
          // Camera/Reader rows are CHILDREN in the connection cascade —
          // they only show the back-connection to their parent network
          // device.  The forward "Connected Devices" editor lives in
          // bucketOverride (network devices are non-Camera/Reader).
          // Same shape view_3505 uses: main=field_2381 readOnly,
          // bucketOverride=field_2380 nativeEdit.
          connectedTo:      { key: 'field_2821', type: 'readOnly',   label: 'Connected To', skipEmpty: true },
          // Accessories — mounting brackets and other connected
          // hardware records.  Same shape as view_3505 line 117
          // (mountingHardware: field_1958 connectedRecords) — the
          // connectedRecords widget renders each connected accessory
          // as a clickable chip that opens the accessory's edit page.
          accessories:      { key: 'field_2852', type: 'connectedRecords', skipEmpty: true },
          laborDescription: { key: 'field_2809', type: 'readOnly' },
          scwNotes:         { key: 'field_2808', type: 'directEdit', notes: true, rows: 4 },
          dropLength:       { key: 'field_2804', type: 'readOnly' },
          conduitFeet:      { key: 'field_2803', type: 'readOnly' }
        },
        summaryLayout: ['requiredPhotos'],
        // Detail-panel groupings: left = the action / editable bits;
        // right = read-only / info.  Existing-cabling, exterior, and
        // plenum sit in Info as flag-chip rows (showWhenFieldIsYes
        // hides them when off, install-config-subpanel restyles them).
        //
        // MDF/IDF is NOT in the detail panel — Knack's native grouping
        // emits a kn-table-group header above each row that already
        // shows the MDF/IDF, so repeating it as a row-level field
        // would be redundant noise.
        detailLayout: {
          left:  ['connectedTo', 'scwNotes'],
          right: ['accessories', 'existingCabling', 'exteriorChit', 'plenumChit', 'dropLength', 'conduitFeet', 'laborDescription']
        },
        // Row sort within each group section.  Two-rule shape mirrors
        // view_3596 line 685, view_3610 line 662 etc.:
        //   1. field_2218  – proposal bucket's CONFIG_sort order
        //   2. field_2819  – source-line label (E-001 …) so a camera
        //                    and its accessories stay adjacent within
        //                    the same bucket-sort tier
        // Requires field_2218 to be exposed as a column on view_4093
        // in Knack Builder so the worksheet can read each row's td.
        rowSort: [
          { field: 'field_2218', order: 'asc', type: 'number' },
          { field: 'field_2819', order: 'asc', type: 'text'   }
        ],
        // Knack Builder's default table sort on view_4093 is field_2816
        // (SYS_auto increment) asc.  Without this flag, device-worksheet
        // detects th.sorted-asc on field_2816 and uses THAT as the sole
        // sort rule — silently overriding our rowSort.  forceRowSort:
        // true keeps our config-side rowSort authoritative.
        forceRowSort: true,
        sortPresets: [
          { id: 'default',  label: 'Default' },
          { id: 'label',    label: 'Label',   field: 'field_2819', type: 'text' },
          { id: 'product',  label: 'Product', field: 'field_2790', type: 'text' }
        ],
        syntheticGroupsPosition: 'bottom',
        bucketField: 'field_2822',
        // ── Override: used for all NON-camera/reader rows
        //    (Assumptions, Mounting Hardware) ──
        bucketOverride: {
          keepBuckets: ['6481e5ba38f283002898113c'],   // Camera or Reader
          fields: {
            product:          { key: 'field_2790', type: 'readOnly', summary: true, productStyle: true },
            installStatus:    { key: 'field_2825', type: 'singleChip', segmented: true, options: ['Not Started', 'In Progress', 'Blocked', 'Done'], summary: true, label: 'Status', group: 'right', groupCls: 'sum-group--install-status' },
            requiredPhotos:   { type: 'requiredPhotos', summary: true, label: 'QA', group: 'right', groupCls: 'sum-group--req-photos' },
            laborDescription: { key: 'field_2809', type: 'readOnly', summary: true, label: 'Description', group: 'fill', multiline: true },
            // Editable forward connection (TRIGGER_FIELD for the cascade).
            // Gated on field_2795 so it appears on network-device products
            // (Yes) and stays hidden on mounting hardware / assumption
            // rows (No).  Same shape as view_3505 line 146.
            connectedDevices: { key: 'field_2820', type: 'nativeEdit', label: 'Connected Devices', showWhenFieldIsYes: 'field_2795' },
            // Accessories on non-Camera/Reader rows — same widget as
            // the main config.  On a network device (Imperial 32 etc.)
            // this lists the hard drive / rack / UPS / WattBox.  On a
            // mounting-hardware row field_2852 points back at the
            // parent camera, which is the per-piece "what does this
            // bracket belong to?" identifier.  skipEmpty hides the
            // row entirely when blank (e.g. on assumption rows).
            accessories:      { key: 'field_2852', type: 'connectedRecords', skipEmpty: true },
            scwNotes:         { key: 'field_2808', type: 'directEdit', notes: true, rows: 4 }
          },
          summaryLayout: ['requiredPhotos'],
          // Same Edit/Info split as the main config; MDF/IDF is omitted
          // because the Knack-native group header above the row already
          // shows it.
          detailLayout: {
            left:  ['connectedDevices', 'scwNotes'],
            right: ['accessories']
          }
        },
        bucketRules: {
          '697b7a023a31502ec68b3303': {                       // Assumptions
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            hideProduct: true,
            // Drop number doesn't apply to project-wide assumption
            // rows.  Accessories (field_2852) skip-empty on their own.
            hideFields: ['field_2798'],
            rowClass: 'scw-row--assumptions',
          },
          '594a94536877675816984cb9': {                       // Mounting Hardware
            label: 'HARDWARE',
            descLabel: 'Mounting Hardware',
            rowClass: 'scw-row--mounting-hw',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ]
      },
      {
        // view_3577 (build-SOW scene) and view_3617 (survey scene) MDF/IDF
        // grids are REMOVED from this V1 config so `mdf-idf-cards.js` owns them
        // and renders the newer compact `.scw-mdf-card` layout instead. When
        // both systems claim a view they RACE — device-worksheet builds
        // scw-ws-row cards, mdf-idf-cards sees them and tears its own cards
        // down (see its defer-to-worksheet guard), so the view "flashes" the
        // new cards then reverts to the old worksheet. Dropping a view from
        // this list kills BOTH the transform binding AND the raw-row cloak (the
        // cloak CSS is generated from this same list), so the native Knack
        // table renders normally and mdf-idf-cards transforms it in place.
        // (view_3577 was also pulled for a perf reason — its V1 transformView
        // was ~1100ms for 8 rows on that heavy page.)
        viewIds: ['view_3559', 'view_3803', 'view_3932', 'view_4060'],
        layout: { labelWidth: '400px' },
        fields: {
          label:            { key: 'field_1642', type: 'readOnly',   summary: true },

          mdfIdf:           { key: 'field_1641', type: 'singleChip', options: ['HEADEND', 'IDF'], segmented: true, headerTrigger: true },
          mdfNumber:        { key: 'field_2458', type: 'directEdit', headerTrigger: true, hideWhenFieldEquals: { field: 'field_1641', value: 'HEADEND' } },
          name:             { key: 'field_1943', type: 'directEdit', headerTrigger: true },
          status:           { key: 'field_2845', type: 'nativeEdit' },
          surveyNotes:      { key: 'field_2457', type: 'directEdit', summary: true, label: 'Survey Notes', group: 'fill', multiline: true },
          notes:            { key: 'field_1643', type: 'directEdit' }
        },
        summaryLayout: ['surveyNotes'],
        detailLayout: {
          left:  ['mdfIdf', 'mdfNumber', 'name', 'status'],
          right: ['notes']
        }
      },
      {
        viewId: 'view_3602',
        layout: { labelWidth: '400px' },
        fields: {
          label:            { key: 'field_1642', type: 'readOnly',   summary: true },

          mdfIdf:           { key: 'field_1641', type: 'singleChip', options: ['HEADEND', 'IDF'], segmented: true, headerTrigger: true },
          mdfNumber:        { key: 'field_2458', type: 'readOnly',   headerTrigger: true, hideWhenFieldEquals: { field: 'field_1641', value: 'HEADEND' } },
          name:             { key: 'field_1943', type: 'directEdit', headerTrigger: true },
          notes:            { key: 'field_1643', type: 'directEdit', notes: true }
        },
        summaryLayout: [],
        detailLayout: {
          left:  ['mdfIdf', 'mdfNumber', 'name'],
          right: ['notes']
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
          // TODO(field_1968/field_2462): commented out — fields not found on Site Survey /
          // Survey Line Item / SOW / SOW Line Item objects in Knack. See CLAUDE.md Known Issues.
          // mountCableBoth:   { key: 'field_1968', type: 'readOnly',    summary: true, label: 'MCB',  group: 'pre',   groupCls: 'sum-group--mcb' },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          // laborCategory:    { key: 'field_2462', type: 'readOnly',    summary: true, label: 'Cat',  group: 'right', groupCls: 'sum-group--cat' },
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
          scwNotes:         { key: 'field_1953', type: 'directEdit',  notes: true },
          selectedSubBid:   { key: 'field_2630', type: 'link', label: 'Selected Sub Bid',
                              linkField: 'field_2360',
                              linkPattern: 'https://scwinstallation.knack.com/installationservices#subcontractor-portal/site-survey-request-details/{linkField}/view-site-survey-line-item-details/{recordId}' },
          subBidLock:       { key: 'field_2634', type: 'singleChip', options: ['Yes', 'No'], segmented: true, label: 'Lock Record' }
        },
        // TODO(field_1968/field_2462): 'mountCableBoth' and 'laborCategory' removed from layout.
        // Children (field_2464 → parent) sort directly beneath their
        // parent row, overriding the rowSort keys.
        threadParentField: 'field_2464',
        summaryLayout: ['laborDescription', 'existingCabling',
                         'laborVariables', 'subBid', 'plusHrs', 'plusMat', 'installFee', 'sow'],
        detailLayout: {
          left:  ['dropPrefix', 'dropNumber', 'mountingHardware'],
          right: ['connectedDevice', 'dropLength', 'scwNotes', 'selectedSubBid', 'subBidLock']
        },
        // recordLockField disabled — field_2634 lock not used on view_3313
        lockExemptFields: ['field_1949', 'field_1958', 'field_1953', 'field_2634']
      },
      {
        // view_3610 (Ops build SOW) removed — fully v2 (view_3962 source).
        // view_3921 (comparison grid) still listed here pending its own phase.
        viewId: 'view_3921',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', productEditable: true, identityWidth: '366px', labelWidth: '110px' },
        fields: {
          // ── Summary row ──
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true, columnIndex: 3 },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          sow:              { key: 'field_2154', type: 'readOnly',    summary: true, label: 'SOW',  group: 'right', groupCls: 'sum-group--sow' },
          quantity:         { key: 'field_1964', type: 'directEdit',  summary: true, label: 'Qty',  group: 'right', groupCls: 'sum-group--qty', feeTrigger: true, alwaysEditable: true },
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
          selectedSubBid:   { key: 'field_2630', type: 'link', label: 'Selected Sub Bid',
                              linkField: 'field_2360',
                              linkPattern: 'https://scwinstallation.knack.com/installationservices#subcontractor-portal/site-survey-request-details/{linkField}/view-site-survey-line-item-details/{recordId}' },
          surveyNotes:      { key: 'field_2412', type: 'readOnly', label: 'Survey Notes' },
          subBidLock:       { key: 'field_2634', type: 'singleChip', options: ['Yes', 'No'], segmented: true, label: 'Lock Record' },
          connectedDevice:  { key: 'field_1957', type: 'nativeEdit' },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' }
        },
        summaryLayout: ['laborDescription', 'quantity', 'subBid', 'plusHrs', 'plusMat', 'installFee', 'sow'],
        detailLayout: {
          // Restored from commit eaf720f — was accidentally dropped in
          // 7794df2 ('Worksheet sort presets: dropdown replaces thead')
          // while adding sortPresets, which silently broke chevron
          // expansion for non-camera rows on view_3610. selectedSubBid
          // (field_2630) and subBidLock (field_2634) intentionally
          // omitted at user request.
          left:  ['connectedDevice', 'mountingHardware'],
          right: ['scwNotes', 'surveyNotes']
        },
        sortPresets: [
          { id: 'default',  label: 'Default' },
          { id: 'label',    label: 'Label',   field: 'field_1950', type: 'text'   },
          { id: 'sub-bid',  label: 'Sub bid', field: 'field_2150', type: 'number' },
          { id: 'qty',      label: 'Qty',     field: 'field_1964', type: 'number' },
          { id: 'sow',      label: 'By SOW',  rule: [{ field: 'field_2154', order: 'asc', type: 'text' },
                                                     { field: 'field_1950', order: 'asc', type: 'text' }] }
        ],
        // recordLockField disabled — field_2634 lock not used on view_3610
        conditionalHide: [
          {
            whenLocked: 'field_1964',
            hideFields: ['field_2151', 'field_1997', 'field_2146']
          }
        ],
        bucketField: 'field_2219',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_1949'],
            label: '+fee',
            descLabel: 'Service',
            hideProduct: true,
            hideDetailFields: ['field_1958'],
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_1949', 'field_1964', 'field_2150', 'field_2151', 'field_1973', 'field_1997', 'field_1974', 'field_2146', 'field_2028'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            hideProduct: true,
            // Hide the entire left-column block for assumption rows:
            // mountingHardware (field_1958) and connectedDevice (field_1957)
            // are device-specific concepts that don't apply to project-wide
            // assumption text. Once both are hidden the left column has no
            // content, so singleColumnDetail collapses the layout into one
            // column (right-hand fields move into the left section).
            hideDetailFields: ['field_1958', 'field_1957'],
            singleColumnDetail: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ],
        syntheticGroupsPosition: 'bottom',
        // ── Override: cameras/readers rows mirror view_3313's config.
        //    Only includes fields that exist on view_3610's raw table.
        //    stackedSummary: false matches view_3586's cam/reader layout
        //    so the summary doesn't stretch vertically. ──
        bucketOverride: {
          overrideBuckets: ['6481e5ba38f283002898113c'],   // cameras or readers
          stackedSummary: false,
          fields: {
            // ── Summary row ──
            label:            { key: 'field_1950', type: 'readOnly',    summary: true },
            product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
            sow:              { key: 'field_2154', type: 'readOnly',    summary: true, label: 'SOW',  group: 'right', groupCls: 'sum-group--sow' },
            laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
            existingCabling:  { key: 'field_2461', type: 'toggleChit',  summary: true, feeTrigger: true, chitLabel: 'Existing' },
            exteriorChit:     { key: 'field_1984', type: 'toggleChit',  summary: true, feeTrigger: true, chitLabel: 'Exterior' },
            plenumChit:       { key: 'field_1983', type: 'toggleChit',  summary: true, feeTrigger: true, chitLabel: 'Plenum' },
            subBid:           { key: 'field_2150', type: 'directEdit',  summary: true, label: 'Sub Bid', group: 'right', groupCls: 'sum-group--sub-bid', feeTrigger: true },
            plusHrs:          { key: 'field_1973', type: 'directEdit',  summary: true, label: '+Hrs', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true },
            plusMat:          { key: 'field_1974', type: 'directEdit',  summary: true, label: '+Mat', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true },
            installFee:       { key: 'field_2028', type: 'readOnly',    summary: true, label: 'Fee',  group: 'right', groupCls: 'sum-group--fee', readOnlySummary: true },
            move:             { key: 'field_1946', type: 'moveIcon',    summary: true },

            // ── Detail panel ──
            dropPrefix:       { key: 'field_2240', type: 'readOnly' },
            dropNumber:       { key: 'field_1951', type: 'directEdit' },
            dropLength:       { key: 'field_1965', type: 'directEdit',  feeTrigger: true },
            conduit:          { key: 'field_2035', type: 'directEdit',  feeTrigger: true },
            mountingHardware: { key: 'field_1958', type: 'connectedRecords' },
            connectedDevice:  { key: 'field_2197', type: 'nativeEdit' },
            scwNotes:         { key: 'field_1953', type: 'directEdit',  notes: true },
            selectedSubBid:   { key: 'field_2630', type: 'link', label: 'Selected Sub Bid',
                                linkField: 'field_2360',
                                linkPattern: 'https://scwinstallation.knack.com/installationservices#subcontractor-portal/site-survey-request-details/{linkField}/view-site-survey-line-item-details/{recordId}' },
            subBidLock:       { key: 'field_2634', type: 'singleChip', options: ['Yes', 'No'], segmented: true, label: 'Lock Record' }
          },
          summaryLayout: [
            'laborDescription',
            { stack: ['existingCabling', 'exteriorChit', 'plenumChit'] },
            'subBid', 'plusHrs', 'plusMat', 'installFee', 'sow'
          ],
          detailLayout: {
            // selectedSubBid (field_2630) and subBidLock (field_2634)
            // intentionally omitted at user request.
            left:  ['dropPrefix', 'dropNumber', 'mountingHardware'],
            right: ['connectedDevice', 'dropLength', 'conduit', 'scwNotes']
          }
        }
      },
      {
        // ── view_3450 — drops/cameras device worksheet (mirrors the
        //    cameras/readers shape from view_3586's bucketOverride). ──
        viewId: 'view_3450',
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
          dropPrefix:       { key: 'field_2240', type: 'nativeEdit' },
          dropNumber:       { key: 'field_1951', type: 'directEdit' },

          // ── Detail panel – right ──
          connectedDevice:  { key: 'field_2197', type: 'nativeEdit' },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' },
          dropLength:       { key: 'field_1965', type: 'directEdit', skipEmpty: true },
          laborDescription: { key: 'field_2020', type: 'directEdit', skipEmpty: true, notes: true }
        },
        summaryLayout: ['scwNotes', 'existingCabling', 'exteriorChit', 'lineItemTotal'],
        // Explicit thead column order. Raw field keys, left-to-right.
        theadOrder: [
          'field_1950', // Label
          'field_1953', // SCW Notes
          'field_2461', // Existing cabling
          'field_1984', // Exterior
          'field_2269'  // Total
        ],
        // Client-side row sort. Sort order (numeric) then drop prefix
        // (text, natural compare) then drop number (numeric). Missing values trail.
        rowSort: [
          { field: 'field_2218', order: 'asc', type: 'number' },
          { field: 'field_2240', order: 'asc', type: 'text'   },
          { field: 'field_1951', order: 'asc', type: 'number' }
        ],
        sortPresets: [
          { id: 'default',  label: 'Default' },
          { id: 'label',    label: 'Label',   field: 'field_1950', type: 'text'   },
          { id: 'total',    label: 'Total',   field: 'field_2269', type: 'number' },
          { id: 'qty',      label: 'Qty',     field: 'field_1964', type: 'number' },
          { id: 'product',  label: 'Product', field: 'field_1949', type: 'text'   }
        ],
        detailLayout: {
          left:  ['dropPrefix', 'dropNumber', 'retailPrice', 'discountDlr', 'appliedDiscount', 'total', 'dropLength'],
          right: ['connectedDevice', 'mountingHardware', 'laborDescription']
        }
      },
      {
        viewId: 'view_3997',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', identityWidth: '366px' },
        stackedSummary: false,
        photoAlwaysVisible: true,
        qtyBadgeField: 'field_1964',
        bucketField: 'field_2219',
        rowSort: [
          { field: 'field_2218', order: 'asc', type: 'number' },
          { field: 'field_1950', order: 'asc', type: 'text'   }
        ],
        fields: {
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Description of Work', group: 'fill', multiline: true },
          existingCabling:  { key: 'field_2461', type: 'toggleChit',  summary: true, showOnlyIfYes: true },
          connectedDevice:  { key: 'field_2197', type: 'readOnly' },
          mountingHardware: { key: 'field_1958', type: 'readOnly' },
          scwNotes:         { key: 'field_1953', type: 'readOnly',  notes: true },
          surveyNotes:      { key: 'field_2412', type: 'readOnly',  notes: true, label: 'Survey Notes' }
        },
        summaryLayout: ['laborDescription', 'existingCabling'],
        detailLayout: {
          left:  ['mountingHardware', 'connectedDevice', 'scwNotes'],
          right: ['surveyNotes']
        },
        syntheticGroupsPosition: 'bottom',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {
            hideFields: ['field_1949', 'field_1957'],
            label: '+fee',
            descLabel: 'Service',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {
            hideFields: ['field_1949', 'field_1957'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ],
        bucketOverride: {
          keepBuckets: ['6481e5ba38f283002898113c'],
          fields: {
            product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
            laborDescription: { key: 'field_2020', type: 'readOnly',  summary: true, label: ' ', group: 'fill', multiline: true },
            connectedDevice:  { key: 'field_1957', type: 'readOnly',    summary: true, label: 'Connected Devices', showWhenFieldIsYes: 'field_2231' },
            mountingHardware: { key: 'field_1958', type: 'readOnly' },
            scwNotes:         { key: 'field_1953', type: 'readOnly',  notes: true },
            surveyNotes:      { key: 'field_2412', type: 'readOnly',  notes: true, label: 'Survey Notes' }
          },
          summaryLayout: ['laborDescription', 'connectedDevice'],
          detailLayout: {
            left:  ['scwNotes'],
            right: ['mountingHardware', 'surveyNotes']
          }
        }
      },
      {
        viewId: 'view_3596',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', identityWidth: '366px' },
        stackedSummary: false,
        photoAlwaysVisible: true,
        qtyBadgeField: 'field_1964',
        bucketField: 'field_2219',
        // Client-side row sort. Bucket order first (field_2218 — cams/
        // readers come after networking/headend), then natural-compare
        // on field_1950 (the device label like "E-001", "I-001") so
        // cam/reader rows sort like E-001, E-002, …, I-001, I-002.
        // Default rowSort falls back to field_2240 + field_1951 which
        // aren't in this view's cells, so it was a no-op.
        rowSort: [
          { field: 'field_2218', order: 'asc', type: 'number' },
          { field: 'field_1950', order: 'asc', type: 'text'   }
        ],
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Description of Work', group: 'fill', multiline: true },
          existingCabling:  { key: 'field_2461', type: 'toggleChit',  summary: true, showOnlyIfYes: true },

          // ── Detail panel ──
          connectedDevice:  { key: 'field_2197', type: 'readOnly' },
          mountingHardware: { key: 'field_1958', type: 'readOnly' },
          scwNotes:         { key: 'field_1953', type: 'readOnly',  notes: true },
          surveyNotes:      { key: 'field_2412', type: 'readOnly',  notes: true, label: 'Survey Notes' }
        },
        summaryLayout: ['laborDescription', 'existingCabling'],
        detailLayout: {
          left:  ['mountingHardware', 'connectedDevice', 'scwNotes'],
          right: ['surveyNotes']
        },
        syntheticGroupsPosition: 'bottom',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_1949', 'field_1957'],
            label: '+fee',
            descLabel: 'Service',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_1949', 'field_1957'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ],
        // When bucket is NOT cameras/readers, use view_3608-style config
        bucketOverride: {
          keepBuckets: ['6481e5ba38f283002898113c'],   // cameras or readers
          fields: {
            product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
            laborDescription: { key: 'field_2020', type: 'readOnly',  summary: true, label: '\u00a0', group: 'fill', multiline: true },
            connectedDevice:  { key: 'field_1957', type: 'readOnly',    summary: true, label: 'Connected Devices', showWhenFieldIsYes: 'field_2231' },
            mountingHardware: { key: 'field_1958', type: 'readOnly' },
            scwNotes:         { key: 'field_1953', type: 'readOnly',  notes: true },
            surveyNotes:      { key: 'field_2412', type: 'readOnly',  notes: true, label: 'Survey Notes' }
          },
          summaryLayout: ['laborDescription', 'connectedDevice'],
          detailLayout: {
            left:  ['scwNotes'],
            right: ['mountingHardware', 'surveyNotes']
          }
        }
      },
      {
        // ── Field Tech Survey Worksheet ──
        // view_3800 is the on-site survey entry worksheet. Same general
        // UX as view_3596 (photoAlwaysVisible, bucket-driven row variants,
        // synthetic services/assumptions groups) but field keys come from
        // the Survey Line Item schema (field_23XX) and most fields are
        // directEdit so field techs can capture data from the job site.
        viewId: 'view_3800',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', identityWidth: '366px', detailGrid: '455px 1fr' },
        stackedSummary: false,
        photoAlwaysVisible: true,
        qtyBadgeField: 'field_2399',
        bucketField: 'field_2366',
        fields: {
          // ── Summary row ──
          label:            { key: 'field_2365', type: 'readOnly',    summary: true },
          product:          { key: 'field_2379', type: 'readOnly',    summary: true, productStyle: true },
          surveyNotes:      { key: 'field_2412', type: 'directEdit',  summary: true, label: 'Survey Notes', group: 'fill', multiline: true, rows: 4 },
          connections:      { key: 'field_2381', type: 'readOnly',    summary: true, label: 'Connected Devices' },
          warningCount:     { key: 'field_2454', type: 'warningChit' },

          // ── Detail panel ──
          laborDescription: { key: 'field_2409', type: 'readOnly',    label: 'Labor Desc' },
          mounting:         { key: 'field_2463', type: 'readOnly' },
          scwNotes:         { key: 'field_2418', type: 'readOnly' },
          // Yes/No survey flags — rendered as segmented chips so each row shows
          // a clear two-button toggle. Unselected = neither button lit, which
          // signals "needs input" to the field tech and reads the same way in
          // the eventual PDF export.
          existingCabling:  { key: 'field_2370', type: 'singleChip', options: ['Yes', 'No'], segmented: true, label: 'Existing Cabling' },
          exterior:         { key: 'field_2372', type: 'singleChip', options: ['Yes', 'No'], segmented: true, label: 'Exterior' },
          plenum:           { key: 'field_2371', type: 'singleChip', options: ['Yes', 'No'], segmented: true, label: 'Plenum' },
          mountingHeight:   { key: 'field_2455', type: 'singleChip', options: ["Under 16'", "16' - 24'", "Over 24'"] },
          dropLength:       { key: 'field_2367', type: 'directEdit' },
          conduitFeet:      { key: 'field_2368', type: 'directEdit' }
        },
        summaryLayout: ['surveyNotes', 'connections'],
        detailLayout: {
          left:  ['laborDescription', 'mounting', 'scwNotes'],
          right: ['existingCabling', 'exterior', 'plenum', 'mountingHeight', 'dropLength', 'conduitFeet']
        },
        syntheticGroupsPosition: 'bottom',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_2379', 'field_2463', 'field_2370', 'field_2372', 'field_2371'],
            label: '+fee',
            descLabel: 'Service',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_2379', 'field_2463', 'field_2370', 'field_2372', 'field_2371'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ],
        // When bucket is NOT cameras/readers (networking, other equip, etc.),
        // hide the Label and the camera-only mounting/drop/conduit fields.
        // Yes/No survey flags (existing cabling, exterior, plenum) are also
        // dropped — those questions only apply to cameras/readers.
        bucketOverride: {
          keepBuckets: ['6481e5ba38f283002898113c'],   // cameras or readers
          fields: {
            // No `label` — hidden for non camera/reader buckets by request.
            product:          { key: 'field_2379', type: 'readOnly',    summary: true, productStyle: true },
            surveyNotes:      { key: 'field_2412', type: 'directEdit',  summary: true, label: 'Survey Notes', group: 'fill', multiline: true, rows: 4 },
            connections:      { key: 'field_2380', type: 'readOnly',    summary: true, label: 'Connected Devices', showWhenFieldIsYes: 'field_2374' },
            warningCount:     { key: 'field_2454', type: 'warningChit' },
            laborDescription: { key: 'field_2409', type: 'readOnly',    label: 'Labor Desc' },
            mounting:         { key: 'field_2463', type: 'readOnly' },
            scwNotes:         { key: 'field_2418', type: 'readOnly',    notes: true }
          },
          summaryLayout: ['surveyNotes', 'connections'],
          detailLayout: {
            left:  ['laborDescription', 'mounting', 'scwNotes'],
            right: []
          }
        }
      },
      {
        viewId: 'view_3608',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', identityWidth: '366px' },
        stackedSummary: false,
        photoAlwaysVisible: true,
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          laborDescription: { key: 'field_2020', type: 'readOnly',  summary: true, label: 'Description of Work', group: 'fill', multiline: true },
          connectedDevice:  { key: 'field_1957', type: 'readOnly',    summary: true, label: 'Connected Devices', showWhenFieldIsYes: 'field_2231' },

          // ── Detail panel ──
          mountingHardware: { key: 'field_1958', type: 'readOnly' },
          scwNotes:         { key: 'field_1953', type: 'readOnly',  notes: true }
        },
        summaryLayout: ['laborDescription', 'connectedDevice'],
        detailLayout: {
          left:  ['scwNotes'],
          right: ['mountingHardware']
        },
        bucketField: 'field_2219',
        syntheticGroupsPosition: 'bottom',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_1949'],
            label: '+fee',
            descLabel: 'Service',
            descLabelWhenSynthetic: '\u00a0',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_1949'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            descLabelWhenSynthetic: '\u00a0',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ]
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
/* Prevents flash of unstyled/duplicate inputs during re-render.
   IMPORTANT: this used to ship as a .map() returning single-quoted
   strings that embedded literal '\${PROCESSED_ATTR}' / '\${WORKSHEET_ROW}'
   — invalid CSS, so the rule was silently dropped and raw rows flashed
   on every reload. The selectors are built explicitly here so the
   substitution actually happens. */
${WORKSHEET_CONFIG.views.map(function (v) {
  // The :not() chain enumerates every row class that's either Knack-
  // native non-data (group headers / totals) OR injected by our own
  // features. Anything NOT in this list is presumed to be a raw
  // unprocessed Knack data row, hidden until transformView marks it
  // with PROCESSED_ATTR.
  //
  // If a new injected-row class is added in a sibling feature, list
  // it here too — otherwise it'll go invisible during the transform
  // window and look like the feature is broken.
  // Constrain to the OUTER Knack table's tbody. Without this, the
  // descendant combinator matches any nested tbody — including the
  // MDF summary table (.scw-mdf-summary-table > tbody > tr) inside
  // the per-L1 summary strip. None of those rows carry any of the
  // excluded classes, so they were getting visibility:hidden/height:0
  // and the entire MDF summary panel rendered blank.
  return '#' + v.viewId + ' table.kn-table > tbody > tr' +
    ':not([' + PROCESSED_ATTR + '])' +
    ':not(.' + WORKSHEET_ROW + ')' +
    ':not(.kn-table-group)' +
    ':not(.kn-table-totals)' +
    ':not(.scw-inline-photo-row)' +
    ':not(.scw-mdf-summary-row)' +
    ':not(.scw-synth-divider)' +
    ':not(.scw-mounting-product-line)' +
    ':not(.scw-rev-orphan-row)' +
    ' { visibility: hidden; height: 0; overflow: hidden; }';
}).join('\n')}

/* ── Hide the original data row (cells moved out, shell stays) ── */
tr[${PROCESSED_ATTR}="1"] {
  display: none !important;
}

/* ── Hide Existing Cabling column header (moved to summary bar as toggleChit) ── */
#view_3512 th.field_2370,
#view_3505 th.field_2370 {
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
  border-top: 2px solid #e2e8f0 !important;
}

/* ── Photo content moved inside card ── */
.${P}-photo-wrap {
  padding: 20px 16px 50px 70px;
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

/* ── Top separator above every worksheet row ──
   Acts as the divider between cards. The base reset above zeros all
   borders on .scw-ws-row > td; this longhand !important wins by
   source order so each card gets a 2px line above it. */
tr.${WORKSHEET_ROW} > td {
  border-top: 2px solid #e2e8f0 !important;
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
/* Round the summary corners when card is expanded */
.${P}-card:has(.${P}-open) .${P}-summary {
  background: #fff;
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

/* Fixed-width warning slot between chevron and identity — always present.
   min-width keeps single-icon alignment; grows only in the rare case a row
   carries two header warnings (e.g. accessory mismatch + discontinued). */
.${P}-warn-slot {
  flex: 0 0 auto;
  min-width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.${P}-warn-slot:empty {
  visibility: hidden;
}
.${P}-warn-slot .scw-cr-hdr-warning {
  margin-left: 0;
  margin-top: 5px;
}

/* Discontinued-product flag — amber tint on the product name (warning
   palette; red reserved for errors/destructive). The warning icon itself
   sits in the shared warn-slot. Mirrors worksheet-v2. */
td.${P}-sum-product--discontinued,
td.${P}-sum-product--discontinued span {
  color: #b45309 !important;
  font-weight: 600 !important;
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
  margin-top: 5px;
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

/* Combined-label mode: when the label cell sits INSIDE the product-group
   (layout.labelInProductGroup), let it auto-size so it shares the
   product-group's fixed width with the product. Caps at 90px so a long
   label can't push the product out — anything longer truncates via the
   inherited ellipsis rules. Used on view_3505 to align labor description
   across cam/reader rows (which carry a label) and non-cam rows (which don't). */
.${P}-product-group > td.${P}-sum-label-cell--in-product,
.${P}-product-group > td.${P}-sum-label-cell--in-product:hover {
  width: auto !important;
  min-width: 0 !important;
  max-width: 90px !important;
  flex: 0 0 auto;
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
  min-width: 150px;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  margin-left: 10px;
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
  align-self: flex-start;
  flex-shrink: 0;
  min-width: 22px;
  padding: 5px 4px 0 4px;
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
/* Label is rendered via ::after off the data-chit-label attribute so
   the chit element itself has no textContent — that keeps the host
   td.textContent reading as the bare "Yes" / "No" Knack stored,
   which KTL's bulk-edit reads from the source cell. */
.${P}-cabling-chit::after {
  content: attr(data-chit-label);
}
/* Visually hidden but readable by innerText / textContent / jQuery
   .text() — the original Yes/No span. KTL bulk-edit uses innerText
   to read the source cell, which skips display:none and visibility:
   hidden content; off-screen-positioned elements stay readable. */
.${P}-chit-value {
  position: absolute !important;
  width: 1px !important; height: 1px !important;
  padding: 0 !important; margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0,0,0,0) !important;
  white-space: nowrap !important;
  border: 0 !important;
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

/* ── Stacked toggle-chit column (used for cam/reader flags) ── */
.${P}-sum-group--chit-stack {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  flex-shrink: 0;
}
.${P}-sum-group--chit-stack .${P}-sum-group--cabling {
  width: 100%;
}
.${P}-sum-group--chit-stack .${P}-cabling-chit {
  padding: 1px 6px;
  font-size: 10px;
  border-radius: 4px;
  width: 100%;
  min-width: 44px;
  letter-spacing: 0;
}
/* Keep the first chit's empty label spacer so the top of the stack
   aligns with the top of other labeled summary inputs (Sub Bid, +Hrs,
   etc.); hide the rest so the chits below stack flush. */
.${P}-sum-group--chit-stack .${P}-sum-group--cabling:not(:first-child) > .${P}-sum-label {
  display: none;
}

/* ── Required-photo header chits (QA-glance) ────────────────────── */
/* Stacked layout — one chit per row so labels read top-down and
   the column has a predictable width across all rows (so the
   left edge lines up between cam/reader rows and other rows).
   Fixed width (not min-width) is critical: with min-width, long
   photo-type names like "BACK OF INSTALLED NVR/SWITCH" inflate the
   column on that row, which under .sum-right { margin-left: auto }
   shifts the whole right cluster left and breaks across-row
   vertical alignment of the chits' left edge. */
/* Scope under .sum-right to win over the generic
   sum-right > sum-group fit-content rule above — without that extra
   specificity, the fixed 220px column never applies and long photo
   labels still inflate the column on those rows. */
.${P}-sum-right .${P}-sum-group--req-photos {
  width: 300px;
  padding-right: 15px;
  box-sizing: border-box;
  flex-shrink: 0;
}

/* ── Install status segmented picker ──────────────────────────────
   Width pinned so labels render in full (no "In Progres" / "Not
   Starte" truncation) and the column lines up across rows.  Selected
   chip is color-coded by state so the row's status reads at a glance
   without having to parse which of four segments is highlighted. */
.${P}-sum-right .${P}-sum-group--install-status {
  width: 360px;
  flex-shrink: 0;
}
.${P}-sum-group--install-status .${P}-radio-chips {
  width: 100%;
}
.${P}-sum-group--install-status .${P}-radio-chip {
  flex: 1 1 0;
  min-width: 0;
  padding: 4px 6px;
  font-size: 11px;
}
/* Selected-state colors — override the generic green is-selected
   style.  Higher specificity (group--install-status .is-selected) so
   these win against the global .radio-chip.is-selected rule. */
.${P}-sum-group--install-status .${P}-radio-chip.is-selected[data-option="Not Started"] {
  background: #e5e7eb;
  color: #374151;
  border-color: #9ca3af;
  box-shadow: none;
}
.${P}-sum-group--install-status .${P}-radio-chip.is-selected[data-option="In Progress"] {
  background: #fef3c7;
  color: #92400e;
  border-color: #fbbf24;
  box-shadow: none;
}
.${P}-sum-group--install-status .${P}-radio-chip.is-selected[data-option="Blocked"] {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
  box-shadow: none;
}
.${P}-sum-group--install-status .${P}-radio-chip.is-selected[data-option="Done"] {
  background: #dcfce7;
  color: #15803d;
  border-color: #86efac;
  box-shadow: none;
}
/* Segmented border-merge fix: when In Progress / Blocked / Done is
   selected, the adjacent unselected chip's left border still inherits
   green from the global .is-selected + .is-unselected rule.  Reset
   that to the gray default so the seam color matches the new palette. */
.${P}-sum-group--install-status .${P}-radio-chip.is-selected + .${P}-radio-chip.is-unselected {
  border-left-color: #d1d5db;
}
.${P}-req-photos {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  width: 100%;
  min-width: 0;
}
.${P}-req-photo-chit {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  width: 100%;
  padding: 0 10px 0 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  box-sizing: border-box;
  flex-shrink: 0;
  cursor: pointer;
}
.${P}-req-photo-chit > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.${P}-req-photo-chit svg {
  flex-shrink: 0;
}
.${P}-req-photo-chit-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.${P}-req-photo-chit-state {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 8px;
  font-weight: 600;
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.75;
}
.${P}-req-photo-chit-state::before {
  content: '·';
  display: inline-block;
  margin-right: 6px;
  opacity: 0.6;
}
/* photo missing (not yet uploaded) — red */
.${P}-req-photo-chit.is-missing {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
}
/* uploaded but QA not yet done — neutral indigo-tinted */
.${P}-req-photo-chit.is-qa-pending {
  background: #eef2ff;
  color: #4338ca;
  border-color: #a5b4fc;
}
/* internal pass, client signoff still pending — green fill, amber outline */
.${P}-req-photo-chit.is-half-pass {
  background: #dcfce7;
  color: #15803d;
  border-color: #fbbf24;
  border-width: 2px;
  padding: 0 9px 0 7px;       /* compensate for thicker border */
  height: 22px;
}
/* fully signed off — solid green */
.${P}-req-photo-chit.is-done {
  background: #dcfce7;
  color: #15803d;
  border-color: #86efac;
}
/* QA failed — red */
.${P}-req-photo-chit.is-fail {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
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
  padding: 14px 20px 14px 70px;
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

/* ── Segmented toggle (either/or style) ── */
.${P}-radio-chips.${P}-segmented {
  gap: 0;
  flex-wrap: nowrap;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip {
  border-radius: 0;
  border-right-width: 0;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip:first-child {
  border-radius: 6px 0 0 6px;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip:last-child {
  border-radius: 0 6px 6px 0;
  border-right-width: 1px;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip.is-unselected {
  border-color: #d1d5db;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip.is-selected + .${P}-radio-chip.is-unselected {
  border-left-color: #047857;
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
/* Calculated cell recalculating after a feeTrigger edit — a gentle pulse so
   the totals visibly "register" while Knack recomputes them server-side. */
.${P}-recalc {
  animation: scwWsRecalcPulse 0.9s ease-in-out infinite;
  border-radius: 4px;
}
@keyframes scwWsRecalcPulse {
  0%, 100% { background-color: rgba(99, 102, 241, 0.06); }
  50%      { background-color: rgba(99, 102, 241, 0.18); }
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
  overflow: hidden;
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
  max-height: none;
  line-height: 1.3;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow: hidden;
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
/* When the editable product cell is locked (row finalized or row already
   adopted to SOW), strip the pill chrome so it reads as plain text. */
td.${P}-sum-product--editable.${P}-td-locked,
td.${P}-sum-product--editable.${P}-td-locked:hover {
  border: none !important;
  border-radius: 0;
  background: transparent !important;
  padding: 0;
  min-height: 0;
  cursor: default;
}



/* Fee label — align with value text (match td padding-left) */
.${P}-sum-group--fee > .${P}-sum-label {
  padding-left: 8px;
  text-align: center;
  width: 100%;
}

/* Per-group width overrides (scoped under .sum-right for specificity) */
.${P}-sum-right .${P}-sum-group--qty {
  width: min-content;
  min-width: 36px;
}
/* Hide Qty label when its cell is grayed out (locked) */
.${P}-sum-group--qty:has(td.scw-cond-grayed) > .${P}-sum-label {
  visibility: hidden;
}
.${P}-sum-right .${P}-sum-group--labor {
  width: 75px;
  min-width: 75px;
}
.${P}-sum-right .${P}-sum-group--ext {
  width: min-content;
  min-width: 36px;
}
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
.${P}-sum-right .${P}-sum-group--qty-badge {
  min-width: 110px;
  align-items: center;
}
.${P}-sum-group--qty-badge td.${P}-sum-field-ro {
  justify-content: center;
}
/* Center Connected Devices text */
.${P}-sum-group[data-scw-fields="field_1957"] {
  align-items: center;
}
.${P}-sum-group[data-scw-fields="field_1957"] td {
  justify-content: center;
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
/* Sort affordance icon — appended to every sortable <th> via JS */
.${P}-thead-styled th .scw-sort-hint {
  display: inline-flex;
  align-items: center;
  margin-left: 3px;
  opacity: 0.4;
  transition: opacity 150ms ease;
  flex-shrink: 0;
}
.${P}-thead-styled th:hover .scw-sort-hint {
  opacity: 0.85;
}
/* Hide the hint when Knack's own active-sort icon is present */
.${P}-thead-styled th.sorted-asc .scw-sort-hint,
.${P}-thead-styled th.sorted-desc .scw-sort-hint {
  display: none;
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
#view_3596 .${P}-summary,
#view_3997 .${P}-summary {
  border-bottom: none;
  border-top: 1px solid #e5e7eb;
}
#view_3596 .${P}-sum-group--fill .${P}-sum-label,
#view_3997 .${P}-sum-group--fill .${P}-sum-label {
  display: none;
}
#view_3596 .${P}-bucket-override .${P}-sum-group--fill .${P}-sum-label,
#view_3997 .${P}-bucket-override .${P}-sum-group--fill .${P}-sum-label {
  display: block;
}
#view_3596 .${P}-bucket-override .${P}-identity,
#view_3997 .${P}-bucket-override .${P}-identity {
  gap: 0;
}
#view_3596 .${P}-bucket-override .${P}-sum-sep,
#view_3997 .${P}-bucket-override .${P}-sum-sep {
  display: none !important;
}
#view_3596 .${P}-bucket-override td.${P}-sum-field-ro,
#view_3997 .${P}-bucket-override td.${P}-sum-field-ro {
  padding-left: 0 !important;
}
#view_3596 .scw-inline-photo-label,
#view_3997 .scw-inline-photo-label {
  display: none;
}

/* ── view_3596 / view_3997: disable clicks on detail links and photo strip ── */
#view_3596 .${P}-detail a,
#view_3596 .${P}-photo-wrap a,
#view_3596 .${P}-photo-wrap .scw-inline-photo-card,
#view_3997 .${P}-detail a,
#view_3997 .${P}-photo-wrap a,
#view_3997 .${P}-photo-wrap .scw-inline-photo-card {
  pointer-events: none;
  cursor: default;
  color: inherit;
  text-decoration: none;
}

/* ── view_3800: field tech survey worksheet ── */
#view_3800 .${P}-summary {
  border-bottom: none;
  border-top: 1px solid #e5e7eb;
}
/* Survey Notes: keep the label visible, and default the textarea to
   ~4 lines tall. autoGrow still handles content that exceeds that. */
#view_3800 .${P}-sum-group--fill .${P}-sum-direct-edit textarea.${P}-direct-textarea {
  min-height: 5.6em;
}
#view_3800 .${P}-bucket-override .${P}-identity {
  gap: 0;
}
#view_3800 .${P}-bucket-override .${P}-sum-sep {
  display: none !important;
}
#view_3800 .${P}-bucket-override td.${P}-sum-field-ro {
  padding-left: 0 !important;
}
#view_3800 .scw-inline-photo-label {
  display: none;
}

/* Detail sections: flex-wrap so specific fields can share a row.
   Rows default to full-width; the yes/no chip trio and the drop/conduit
   pair below opt into narrower flex-basis to sit side-by-side. All
   field labels keep the default 100px fixed width so the first column
   of chips/inputs lines up vertically across every row. */
#view_3800 .${P}-section {
  display: flex;
  flex-wrap: wrap;
  column-gap: 12px;
  row-gap: 0;
}
#view_3800 .${P}-section > .${P}-field {
  flex: 1 1 100%;
}
/* Existing Cabling + Exterior + Plenum on one line — each sized to
   content so the chips sit close together instead of stretching to
   fill the column. */
#view_3800 .${P}-section > .${P}-field[data-scw-field="field_2370"],
#view_3800 .${P}-section > .${P}-field[data-scw-field="field_2372"],
#view_3800 .${P}-section > .${P}-field[data-scw-field="field_2371"] {
  flex: 0 1 auto;
  min-width: 0;
}
#view_3800 .${P}-section > .${P}-field[data-scw-field="field_2370"] .${P}-field-value,
#view_3800 .${P}-section > .${P}-field[data-scw-field="field_2372"] .${P}-field-value,
#view_3800 .${P}-section > .${P}-field[data-scw-field="field_2371"] .${P}-field-value {
  flex: 0 0 auto;
}
/* Drop Length + Conduit Feet on one line */
#view_3800 .${P}-section > .${P}-field[data-scw-field="field_2367"],
#view_3800 .${P}-section > .${P}-field[data-scw-field="field_2368"] {
  flex: 1 1 calc(50% - 6px);
  min-width: 240px;
}

/* ── view_3608: summary border on top, not bottom ── */
#view_3608 .${P}-summary {
  border-bottom: none;
  border-top: 1px solid #e5e7eb;
}
#view_3608 .${P}-sum-group--fill .${P}-sum-label {
  display: none;
}
#view_3608 .${P}-identity {
  gap: 0;
}
#view_3608 .${P}-sum-sep {
  display: none !important;
}
#view_3608 td.${P}-sum-field-ro {
  padding-left: 0 !important;
}
#view_3608 .scw-row--assumptions .${P}-sum-group--fill .${P}-sum-label,
#view_3608 .scw-row--services .${P}-sum-group--fill .${P}-sum-label {
  display: block;
}
#view_3608 .scw-inline-photo-label {
  display: none;
}
/* ── view_3608: disable clicks on detail links and photo strip ── */
#view_3608 .${P}-detail a,
#view_3608 .${P}-photo-wrap a,
#view_3608 .${P}-photo-wrap .scw-inline-photo-card {
  pointer-events: none;
  cursor: default;
  color: inherit;
  text-decoration: none;
}

/* ── Record lock: make locked fields look like normal readOnly fields ── */
.${P}-input-locked {
  display: none !important;
}
.${P}-lock-text {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  padding: 2px 0;
  line-height: 1.5;
}
.${P}-chips-locked {
  pointer-events: none !important;
}
.${P}-chips-locked .${P}-radio-chip {
  opacity: 0.6;
  cursor: default;
}
.${P}-chit-locked {
  pointer-events: none !important;
}
.${P}-chit-locked .${P}-cabling-chit {
  opacity: 0.6;
  cursor: default;
}
.${P}-native-locked {
  pointer-events: none !important;
  cursor: default !important;
}
.${P}-card.${P}-locked td.${P}-sum-check {
  visibility: hidden;
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

  /** Check if a td is editable via Knack or KTL inline-edit classes. */
  function isCellEditable(td) {
    if (!td) return false;
    return td.classList.contains('cell-edit') || td.classList.contains('ktlInlineEditableCellsStyle');
  }

  /** Check if a td has been explicitly locked/grayed by conditional modules. */
  function isCellLocked(td) {
    if (!td) return false;
    return td.classList.contains('scw-cond-grayed')
        || td.classList.contains('scw-cell-locked')
        || td.classList.contains(P + '-td-locked');
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
   * Walk parallel connection cells on a source <tr> (each keyed by the
   * connected photo record id) and return the list of REQUIRED photos
   * with their type / completion / QA state.
   *
   * opts: {
   *   typeKey, reqKey, doneKey,                         // photo metadata
   *   qaStatusKey, qaClientKey, qaNotesKey, qaHistoryKey // optional QA fields
   * }
   *
   * Used by the requiredPhotos summary field type to render the header-
   * level QA chits and by qa-popover to seed the picker.
   */
  function readRequiredPhotos(tr, opts) {
    opts = opts || {};
    var photos = {};
    function ensure(id) {
      if (!photos[id]) {
        photos[id] = {
          id: id, type: '', required: false, completed: false,
          qaStatus: '', qaClient: '', qaNotes: '', qaHistory: ''
        };
      }
      return photos[id];
    }
    function walk(cellSel, apply) {
      if (!cellSel) return;
      var cell = tr.querySelector('td.' + cellSel);
      if (!cell) return;
      var outers = cell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var i = 0; i < outers.length; i++) {
        var id = (outers[i].id || '').trim();
        if (!id) continue;
        apply(ensure(id), outers[i]);
      }
    }
    walk(opts.typeKey, function (rec, span) {
      var inner = span.querySelector('span[data-kn="connection-value"]');
      rec.type = inner ? inner.textContent.trim() : span.textContent.trim();
    });
    walk(opts.reqKey, function (rec, span) {
      var v = (span.textContent || '').trim().toLowerCase();
      rec.required = (v === 'yes' || v === 'true');
    });
    walk(opts.doneKey, function (rec, span) {
      var v = (span.textContent || '').trim().toLowerCase();
      rec.completed = (v === 'yes' || v === 'true');
    });
    walk(opts.qaStatusKey, function (rec, span) {
      rec.qaStatus = (span.textContent || '').trim();
    });
    walk(opts.qaClientKey, function (rec, span) {
      rec.qaClient = (span.textContent || '').trim();
    });
    walk(opts.qaNotesKey, function (rec, span) {
      rec.qaNotes = (span.textContent || '').trim();
    });
    walk(opts.qaHistoryKey, function (rec, span) {
      // Paragraph text — preserve linebreaks via innerHTML
      rec.qaHistory = (span.innerHTML || '').trim();
    });
    var out = [];
    for (var k in photos) {
      if (photos.hasOwnProperty(k) && photos[k].required) out.push(photos[k]);
    }
    out.sort(function (a, b) { return (a.type || '').localeCompare(b.type || ''); });
    return out;
  }

  /**
   * Compute the QA-aware visual state of a required-photo chit.
   * Returns one of: 'missing' | 'qa-pending' | 'half-pass' | 'done' | 'fail'.
   *
   * hasQAColumns: pass false when the QA fields aren't exposed as
   * columns on the view (graceful degrade — treat any uploaded photo
   * as 'done' so existing views aren't visually regressed before the
   * columns are added).
   */
  function computePhotoChitState(ph, hasQAColumns) {
    if (!ph.completed) return 'missing';
    if (!hasQAColumns) return 'done';
    var s = (ph.qaStatus || '').toLowerCase();
    if (s === 'fail') return 'fail';
    if (s === 'pass') {
      var c = (ph.qaClient || '').toLowerCase();
      // No client gate OR client gate already cleared → fully signed off
      if (c === '' || c === 'n/a' || c === 'approved' || c === 'bypassed') return 'done';
      // Internal pass but client signoff still pending → partial
      return 'half-pass';
    }
    // Empty / "pending" / anything else → uploaded but QA not yet done
    return 'qa-pending';
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
            groups[i].style.display = 'none';
            break;
          }
        }
      }
    }

    // ── Inject bucket chit to the left of product ──
    if (rule.label) {
      var identity = card.querySelector('.' + P + '-identity');
      var productDesc = viewCfg.fields && viewCfg.fields.product;
      var productHidden = productDesc && hideSet.has(productDesc.key);
      if (identity) {
        if (productHidden && (rule.summarySwapField || rule.hideProduct)) {
          // Hide identity — the fill group spans full width and
          // carries the bucket label via descLabel.
          identity.style.display = 'none';
        } else if (!productHidden) {
          // Product visible — inject teal pill chit beside it
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
          chitGroup.appendChild(chitEl);

          identity.insertBefore(chitGroup, identity.firstChild);
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

    // ── Override individual summary-field labels per bucket ──
    // e.g. Materials relabels the price column (field_2400) "Unit Price"
    // instead of "Labor" — the sub is pricing equipment, not labor.
    if (rule.fieldLabelOverrides) {
      Object.keys(rule.fieldLabelOverrides).forEach(function (fk) {
        var lblGrp = card.querySelector('[data-scw-fields="' + fk + '"] > .' + P + '-sum-label');
        if (lblGrp) lblGrp.textContent = rule.fieldLabelOverrides[fk];
      });
    }

    // ── Swap summary field with another field (read-only) ──
    // e.g. replace scwNotes (field_1953) with laborDescription (field_2020)
    if (rule.summarySwapField) {
      // Find the swap source td anywhere in the card (usually in detail panel)
      var swapTd = card.querySelector('td[data-field-key="' + rule.summarySwapField + '"]');
      var swapText = '';
      if (swapTd) {
        var swapSpan = swapTd.querySelector('span[class^="col-"]');
        swapText = (swapSpan || swapTd).textContent.replace(/^\s+|\s+$/g, '').replace(/\u00a0/g, '');
      }
      // Find the hidden summary group for the field being replaced
      // (it was hidden above via hideFields — un-hide it and replace content)
      var hiddenGroups = card.querySelectorAll('[data-scw-fields]');
      for (var hg = 0; hg < hiddenGroups.length; hg++) {
        var hgFields = hiddenGroups[hg].getAttribute('data-scw-fields').split(' ');
        for (var hf = 0; hf < hgFields.length; hf++) {
          if (hideSet.has(hgFields[hf]) && hiddenGroups[hg].classList.contains(P + '-sum-group--fill')) {
            // Un-hide and replace with swap field content
            hiddenGroups[hg].style.display = '';
            hiddenGroups[hg].setAttribute('data-scw-fields', rule.summarySwapField);
            // Remove old label + td, build fresh read-only content
            hiddenGroups[hg].innerHTML = '';
            var swLabelText = rule.label
              ? rule.label.charAt(0).toUpperCase() + rule.label.slice(1).toLowerCase()
              : '\u00a0';
            var swLabel = document.createElement('span');
            swLabel.className = P + '-sum-label';
            swLabel.textContent = swLabelText;
            hiddenGroups[hg].appendChild(swLabel);
            var swVal = document.createElement('span');
            swVal.className = P + '-sum-field-ro ' + P + '-sum-field--desc ' + P + '-sum-direct-edit';
            swVal.style.cssText = 'white-space: pre-wrap; cursor: default;';
            swVal.textContent = swapText || '\u00a0';
            hiddenGroups[hg].appendChild(swVal);
            break;
          }
        }
      }
    }

    // ── Hide detail sections (keep photo wraps only) ──
    if (rule.hideDetail) {
      var detSections = card.querySelector('.' + P + '-sections');
      if (detSections) detSections.style.display = 'none';
    }

    // ── Hide specific fields from the detail panel ──
    if (rule.hideDetailFields && rule.hideDetailFields.length) {
      var detailEl = card.querySelector('.' + P + '-detail');
      if (detailEl) {
        for (var hdf = 0; hdf < rule.hideDetailFields.length; hdf++) {
          var hdfKey = rule.hideDetailFields[hdf];
          // Detail fields are wrapped in .scw-ws-field divs containing a td
          var hdfTd = detailEl.querySelector('td[data-field-key="' + hdfKey + '"]');
          if (hdfTd) {
            var hdfField = hdfTd.closest('.' + P + '-field');
            if (hdfField) hdfField.style.display = 'none';
          }
        }
      }
    }

    // ── Show product field in detail panel (for Assumptions) ──
    if (rule.showProductInDetail) {
      var pDesc = viewCfg.fields && viewCfg.fields.product;
      if (pDesc) {
        var pTd = card.querySelector('td[data-field-key="' + pDesc.key + '"]');
        var pText = '';
        if (pTd) {
          var pSpan = pTd.querySelector('span[class^="col-"]');
          pText = (pSpan || pTd).textContent.replace(/^\s+|\s+$/g, '').replace(/\u00a0/g, '');
        }
        if (pText) {
          var detSect = card.querySelector('.' + P + '-sections > .' + P + '-section');
          if (detSect) {
            var pField = document.createElement('div');
            pField.className = P + '-field';
            var pLabel = document.createElement('div');
            pLabel.className = P + '-field-label';
            pLabel.textContent = 'Product';
            pField.appendChild(pLabel);
            var pVal = document.createElement('div');
            pVal.className = P + '-field-value';
            pVal.style.cssText = 'white-space: normal; word-break: break-word;';
            pVal.textContent = pText;
            pField.appendChild(pVal);
            detSect.insertBefore(pField, detSect.firstChild);
          }
        }
      }
    }

    // ── Single-column detail (e.g. Assumptions on view_3610) ──
    // Move every .scw-ws-field from later sections into the first
    // section, then remove the now-empty later sections. Run after
    // hideDetailFields so genuinely-hidden fields stay hidden when
    // they migrate into the left column.
    if (rule.singleColumnDetail) {
      var sectionsEl = card.querySelector('.' + P + '-sections');
      if (sectionsEl) {
        var allSections = sectionsEl.querySelectorAll(':scope > .' + P + '-section');
        if (allSections.length > 1) {
          var firstSection = allSections[0];
          for (var sx = 1; sx < allSections.length; sx++) {
            var src = allSections[sx];
            var fields = src.querySelectorAll(':scope > .' + P + '-field');
            for (var fx = 0; fx < fields.length; fx++) {
              firstSection.appendChild(fields[fx]);
            }
            src.parentNode.removeChild(src);
          }
        }
      }
    }
  }

  /**
   * Apply conditional field hiding based on whether a trigger field is locked.
   * When the lock/grayout modules have grayed or locked the trigger field,
   * hide individual field tds (and their associated labels in stacked pairs).
   * If every field in a group is hidden, hides the entire group.
   */
  function applyConditionalHide(card, tr, viewCfg) {
    if (!viewCfg.conditionalHide) return;

    viewCfg.conditionalHide.forEach(function (rule) {
      // Look for the trigger field td — it may be in the card (moved by
      // buildWorksheetCard) or still in the original tr.
      var triggerTd = card.querySelector('td[data-field-key="' + rule.whenLocked + '"]')
                   || card.querySelector('td.' + rule.whenLocked)
                   || tr.querySelector('td.' + rule.whenLocked);
      if (!triggerTd) return;

      var locked = triggerTd.classList.contains('scw-cond-grayed')
                || triggerTd.classList.contains('scw-cell-locked')
                || triggerTd.classList.contains(P + '-td-locked');
      if (!locked) return;

      // Hide the trigger field's label (e.g. "Qty" label when qty is locked)
      var triggerGroup = triggerTd.closest('[data-scw-fields]');
      if (triggerGroup) {
        var triggerLabel = triggerGroup.querySelector('.' + P + '-sum-label');
        if (triggerLabel) triggerLabel.style.display = 'none';
      }

      var hideSet = new Set(rule.hideFields || []);

      // Find each target td by data-field-key and hide it.
      // In stacked pairs, also hide the preceding TOTAL label.
      hideSet.forEach(function (fieldKey) {
        var td = card.querySelector('td[data-field-key="' + fieldKey + '"]');
        if (!td) return;

        var group = td.closest('[data-scw-fields]');
        if (!group) return;

        var groupFields = group.getAttribute('data-scw-fields').split(' ');
        var allHidden = groupFields.every(function (f) { return hideSet.has(f); });

        if (allHidden) {
          // Every field in this group is hidden — hide the whole group
          group.style.display = 'none';
        } else {
          // Hide just this td. If it's a TOTAL in a stacked pair, also
          // hide the preceding TTL label.
          td.style.display = 'none';
          var prev = td.previousElementSibling;
          if (prev && prev.classList.contains(P + '-sum-label--ttl')) {
            prev.style.display = 'none';
          }
        }
      });
    });
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

  // Accordion expanded state is now in-memory only — so inline-edit
  // re-renders don't collapse a card mid-edit, but every fresh page
  // load starts with all summaries collapsed regardless of what the
  // user had open last time. localStorage write/read removed
  // intentionally; the key is still cleaned up on render to evict
  // any stale state from previous bundle versions.
  function wsStorageKey(viewId) { return 'scw:ws-expanded:' + viewId; }
  function loadWsState() { return []; }
  function saveWsState() { /* no-op: state is in-memory only */ }

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

  // Discontinued-product flag (parity with worksheet-v2). field_2912 is a
  // yes/no on the line item sourced from the connected product:
  // Yes = still active, No/false = discontinued. Only flag an EXPLICIT
  // No/false; a missing/empty value is "unknown" and not flagged so
  // unpopulated rows don't show false positives. Requires field_2912 to be
  // a column on the worksheet's source view so the cell renders.
  var DISCONTINUED_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="10"></circle>' +
    '<line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';

  function isDiscontinuedRow(tr) {
    var cell = findCell(tr, 'field_2912');
    if (!cell) return false;
    var s = (cell.textContent || '')
      .replace(/<[^>]*>/g, '').replace(/[\u00a0\s]+/g, ' ').trim().toLowerCase();
    if (!s) return false;
    return s === 'no' || s === 'false';
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
  function buildRadioChipRow(label, td, fKey, options, multi, opts) {
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
    if (opts && opts.segmented) chips.classList.add(P + '-segmented');
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

  // Field keys whose stored value is meaningful HTML (not plain text).
  // Any directEdit / textarea on these fields must seed itself from
  // innerHTML, not textContent, otherwise opening the input strips
  // the formatting and a no-change save round-trips the field as
  // plain text. Currently:
  //   field_2020 \u2014 Labor Description (per-line-item)
  //   field_2409 \u2014 Labor Description (DTO scope)
  var HTML_PRESERVE_FIELDS = { field_2020: true, field_2409: true };

  /** Read a field's editable value, preserving HTML for known rich-
   *  text fields. Strips Knack's outer <span class="col-N"> wrapper
   *  so the textarea doesn't see that scaffolding. */
  function readFieldValue(td, fieldKey) {
    if (!td) return '';
    if (!fieldKey || !HTML_PRESERVE_FIELDS[fieldKey]) {
      return readFieldText(td);
    }
    var inner = td.querySelector('span[class^="col-"]');
    var src = inner || td;
    return (src.innerHTML || '').replace(/^\s+|\s+$/g, '');
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

    var currentVal = readFieldValue(td, fieldKey);
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

  /** Post-save housekeeping. No re-flash — the input already flashed
   *  briefly on Enter; re-painting it green when the PUT eventually
   *  returns just re-introduces the "stuck saving" feel. Silently
   *  refresh the conditional color in case the new value crossed a
   *  warning/danger threshold and clear any lingering error UI. */
  function showInputSuccess(input) {
    input.classList.remove('is-error');
    input.classList.remove('is-saving');
    var wrapper = input.parentNode;
    var errEl = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (errEl) errEl.remove();
    refreshInputConditionalColor(input);
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

  /** After a feeTrigger save, patch calculated/readOnly cells in-place
   * from the PUT response instead of doing a full view refresh.
   * This avoids the gray-out / opacity fade that blocks back-to-back edits.
   */
  /**
   * After ANY save, patch all visible field cells in-place from the
   * PUT response.  Updates readOnly summary fields, directEdit inputs
   * & textareas, toggle chits, and detail-panel cells.
   */
  function patchCardFromResponse(viewId, recordId, resp, opts) {
    if (!resp) return;
    opts = opts || {};
    var cfg = viewCfgFor(viewId);
    if (!cfg) return;

    // Knack view-scoped PUT may wrap the record under a "record" key
    if (resp.record && typeof resp.record === 'object' && resp.record.id) {
      resp = resp.record;
    }

    var viewEl = document.getElementById(viewId);

    // Find the worksheet card for this record. Search the view\'s own
    // tree first, then fall back to anywhere the wsTr might have been
    // moved (e.g. bid-review\'s expand cell, where the row was relocated
    // by SCW.bidReview but still belongs logically to this view).
    var card = null;
    if (viewEl) {
      var cards = viewEl.querySelectorAll('.' + P + '-card');
      for (var ci = 0; ci < cards.length; ci++) {
        var row = cards[ci].closest('tr');
        if (row && getRecordId(row) === recordId) { card = cards[ci]; break; }
      }
    }
    if (!card) {
      var movedRow = document.querySelector(
        'tr.' + WORKSHEET_ROW + '[id="' + recordId + '"][data-scw-view-id="' + viewId + '"]'
      );
      if (movedRow) card = movedRow.querySelector('.' + P + '-card');
    }
    if (!card) {
      SCW.debug('[scw-ws] patchCard: no card found for ' + recordId + ' in ' + viewId);
      return;
    }

    // Debug: log which config fields have matching response keys
    var f = cfg.fields;
    var readOnlyKeys = [];
    Object.keys(f).forEach(function (name) {
      var desc = f[name];
      if (desc.type === 'readOnly') {
        var fk = desc.key;
        var hasDisplay = resp[fk] != null;
        var hasRaw = resp[fk + '_raw'] != null;
        readOnlyKeys.push(fk + (hasDisplay ? '=\u2713' : '=\u2717') + (hasRaw ? '/raw\u2713' : '/raw\u2717'));
      }
    });
    SCW.debug('[scw-ws] patchCard readOnly fields in response: ' + readOnlyKeys.join(', '));

    // Helper: extract clean display text from a response value.
    // Prefers the formatted display string (resp[fk]) for readOnly fields
    // because _raw is often a bare number (294 vs "$294.00") or object.
    function displayText(fk) {
      var display = resp[fk];
      if (display != null) return String(display).replace(/<[^>]*>/g, '').trim();
      var raw = resp[fk + '_raw'];
      if (raw == null) return null;
      if (typeof raw === 'object') {
        if (Array.isArray(raw)) {
          return raw.map(function (r) { return (r && r.identifier) || ''; }).filter(Boolean).join(', ');
        }
        return (raw && raw.identifier) ? raw.identifier : null;
      }
      return String(raw);
    }

    // Helper: extract raw/editable text from a response value.
    // For directEdit inputs the raw value is often more appropriate.
    // HTML_PRESERVE_FIELDS skip the html-strip so labor descriptions
    // round-trip through Knack with their formatting intact.
    function editableText(fk) {
      var raw = resp[fk + '_raw'];
      var display = resp[fk];
      var val = raw != null ? raw : display;
      if (val == null) return null;
      var preserve = !!HTML_PRESERVE_FIELDS[fk];
      if (typeof val === 'object') {
        if (Array.isArray(val)) {
          return val.map(function (r) { return (r && r.identifier) || ''; }).filter(Boolean).join(', ');
        }
        if (val && val.identifier) return val.identifier;
        if (display == null) return null;
        return preserve
          ? String(display).trim()
          : String(display).replace(/<[^>]*>/g, '').trim();
      }
      return preserve
        ? String(val).trim()
        : String(val).replace(/<[^>]*>/g, '').trim();
    }

    var f = cfg.fields;
    var patched = 0;
    Object.keys(f).forEach(function (name) {
      var desc = f[name];
      var fk = desc.key;

      // Deferred fee refetch (opts.readOnlyOnly): patch ONLY calculated
      // (readOnly) cells. The user's editable fields are authoritative from
      // their own typing + the PUT that already saved them. A refetch that
      // races ahead of Knack's async server-side commit/recalc would return a
      // STALE editable value and write it back over what the user just typed —
      // that's the "custom discount won't stick / have to refresh a lot" bug
      // (field_2261, feeTrigger). Skip every non-readOnly field here.
      if (opts.readOnlyOnly && desc.type !== 'readOnly') return;

      // ── readOnly fields: patch ALL matching tds (summary + detail) ──
      if (desc.type === 'readOnly') {
        var txt = displayText(fk);
        if (txt == null) return;
        var tds = card.querySelectorAll('td.' + fk + ', td[data-field-key="' + fk + '"]');
        for (var ti = 0; ti < tds.length; ti++) {
          var span = tds[ti].querySelector('span[class^="col-"]');
          if (span) { span.textContent = txt; }
          else { tds[ti].textContent = txt; }
          patched++;
        }
        return;
      }

      // ── directEdit fields: patch both input/textarea AND hidden backing store ──
      if (desc.type === 'directEdit') {
        var txt = editableText(fk);
        if (txt == null) return;
        // Summary bar direct-edit inputs
        var inputs = card.querySelectorAll('[' + DIRECT_EDIT_ATTR + '][data-field="' + fk + '"]');
        for (var ii = 0; ii < inputs.length; ii++) {
          var inp = inputs[ii];
          if (inp.tagName === 'INPUT' || inp.tagName === 'TEXTAREA') {
            // Silent polls: never clobber a field the user is actively editing.
            if (opts.skipFocused && document.activeElement === inp) continue;
            inp.value = txt;
            inp._scwPrev = txt;
            refreshInputConditionalColor(inp);
          }
        }
        // Hidden tds / spans that back the inputs
        var hiddenTds = card.querySelectorAll('td[' + DIRECT_EDIT_ATTR + '].' + fk +
                        ', td[' + DIRECT_EDIT_ATTR + '][data-field-key="' + fk + '"]');
        for (var hi = 0; hi < hiddenTds.length; hi++) {
          hiddenTds[hi].textContent = txt;
        }
        // Hidden spans in summary bar
        var directWrapper = card.querySelector('[data-scw-fields="' + fk + '"] td.' + P + '-sum-direct-edit');
        if (directWrapper) {
          var hiddenSpan = directWrapper.querySelector('span[style*="display"]');
          if (hiddenSpan) hiddenSpan.textContent = txt;
        }
        patched++;
        return;
      }

      // ── toggleChit (booleans): patch ALL matching tds ──
      if (desc.type === 'toggleChit') {
        var txt = displayText(fk);
        if (txt == null) return;
        var chitTds = card.querySelectorAll('td.' + fk + ', td[data-field-key="' + fk + '"]');
        for (var chi = 0; chi < chitTds.length; chi++) {
          var chitTd = chitTds[chi];
          // Hidden Yes/No span — was located via [style*="display"]
          // when we used display:none, now lives at .scw-ws-chit-value.
          var chitSpan = chitTd.querySelector('.' + P + '-chit-value')
                      || chitTd.querySelector('span[style*="display"]');
          if (chitSpan) chitSpan.textContent = txt;
          // Mirror onto the td's data-value too (defensive, see render).
          chitTd.setAttribute('data-value', txt);
        }
        patched++;
        return;
      }
    });

    SCW.debug('[scw-ws] Patched ' + patched + ' fields on card ' + recordId + ' in ' + viewId);

    // Re-evaluate hideWhenFieldEquals after patching (e.g. toggling HEADEND/IDF)
    applyHideWhenFieldEquals(card, cfg);

    // Re-evaluate record lock after patching (e.g. toggling sub bid lock)
    applyRecordLock(card, cfg);
  }

  /** Apply hideWhenFieldEquals rules on a card — show or hide fields dynamically. */
  function applyHideWhenFieldEquals(card, viewCfg) {
    var tr = card.closest('tr');
    var fNames = Object.keys(viewCfg.fields);
    for (var hwi = 0; hwi < fNames.length; hwi++) {
      var hwDesc = viewCfg.fields[fNames[hwi]];
      if (!hwDesc.hideWhenFieldEquals) continue;
      var hwGuard = hwDesc.hideWhenFieldEquals;
      var hwTd = (tr ? tr.querySelector('td.' + hwGuard.field) : null)
              || card.querySelector('td[data-field-key="' + hwGuard.field + '"]');
      var hwVal = hwTd ? (hwTd.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim() : '';
      var shouldHide = hwVal.toUpperCase() === hwGuard.value.toUpperCase();

      // Summary group
      var hwSumGroup = card.querySelector('[data-scw-fields="' + hwDesc.key + '"]');
      if (hwSumGroup) hwSumGroup.style.display = shouldHide ? 'none' : '';

      // Detail field wrapper
      var hwDetailTd = card.querySelector('td.' + hwDesc.key)
                    || card.querySelector('td[data-field-key="' + hwDesc.key + '"]');
      if (hwDetailTd) {
        var hwFieldWrap = hwDetailTd.closest('.' + P + '-field');
        if (hwFieldWrap) hwFieldWrap.style.display = shouldHide ? 'none' : '';
      }
    }
  }

  // ── Record-level lock (field_2634 = "Yes" → disable most editing) ──

  var LOCK_CLASS = P + '-locked';

  /**
   * When viewCfg.recordLockField is set and its value is "Yes",
   * disable all editable controls except those in lockExemptFields.
   * Toggles both a card-level CSS class and individual input states
   * so it works on initial render AND after chip-toggle saves.
   */
  function applyRecordLock(card, viewCfg) {
    if (!viewCfg.recordLockField) return;
    var exempt = viewCfg.lockExemptFields || [];
    var tr = card.closest('tr');

    // Read lock field value
    var lockTd = (tr ? tr.querySelector('td.' + viewCfg.recordLockField) : null)
              || card.querySelector('td[data-field-key="' + viewCfg.recordLockField + '"]');
    var lockVal = lockTd ? (lockTd.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim() : '';
    var isLocked = /^yes$/i.test(lockVal);

    // Toggle card-level class (hides checkbox via CSS)
    card.classList.toggle(LOCK_CLASS, isLocked);

    // Walk every configured field and lock/unlock editable controls
    var fNames = Object.keys(viewCfg.fields);
    for (var li = 0; li < fNames.length; li++) {
      var desc = viewCfg.fields[fNames[li]];
      if (exempt.indexOf(desc.key) !== -1) continue;

      var fk = desc.key;

      // ── Direct-edit inputs and textareas: hide input, show static text ──
      var inputs = card.querySelectorAll(
        '[' + DIRECT_EDIT_ATTR + '][data-field="' + fk + '"]'
      );
      for (var ii = 0; ii < inputs.length; ii++) {
        var inp = inputs[ii];
        if (isLocked) {
          inp.classList.add(P + '-input-locked');
          // Create a static text span if not already present
          var lockText = inp.nextElementSibling;
          if (!lockText || !lockText.classList.contains(P + '-lock-text')) {
            lockText = document.createElement('span');
            lockText.className = P + '-lock-text';
            inp.parentNode.insertBefore(lockText, inp.nextSibling);
          }
          lockText.textContent = inp.value || '\u2014';
          lockText.style.display = '';
        } else {
          inp.classList.remove(P + '-input-locked');
          // Hide the static text span
          var existingText = inp.nextElementSibling;
          if (existingText && existingText.classList.contains(P + '-lock-text')) {
            existingText.style.display = 'none';
          }
        }
      }

      // ── Strip Knack inline-edit classes from ALL tds for this field ──
      var allTds = card.querySelectorAll(
        'td.' + fk + ', td[data-field-key="' + fk + '"]'
      );
      for (var ti = 0; ti < allTds.length; ti++) {
        if (isLocked) {
          // Store original classes so we can restore on unlock
          if (!allTds[ti].hasAttribute('data-scw-lock-edit')) {
            var had = [];
            if (allTds[ti].classList.contains('cell-edit')) had.push('cell-edit');
            if (allTds[ti].classList.contains('ktlInlineEditableCellsStyle')) had.push('ktlInlineEditableCellsStyle');
            // Always mark as locked — even tds without edit classes need
            // click blocking because Knack uses delegated event handlers.
            allTds[ti].setAttribute('data-scw-lock-edit', had.join(' ') || 'none');
          }
          allTds[ti].classList.remove('cell-edit', 'ktlInlineEditableCellsStyle');
        } else {
          // Restore original edit classes
          var saved = allTds[ti].getAttribute('data-scw-lock-edit');
          if (saved && saved !== 'none') {
            saved.split(' ').forEach(function (cls) { allTds[ti].classList.add(cls); });
          }
          allTds[ti].removeAttribute('data-scw-lock-edit');
        }
      }

      // ── Radio / multi chip containers ──
      var chipContainers = card.querySelectorAll(
        '.' + P + '-radio-chips[data-field="' + fk + '"], ' +
        '.' + RADIO_CHIP_CLASS + '[data-field="' + fk + '"]'
      );
      for (var ci = 0; ci < chipContainers.length; ci++) {
        var container = chipContainers[ci].closest('.' + P + '-radio-chips') || chipContainers[ci];
        if (isLocked) container.classList.add(P + '-chips-locked');
        else container.classList.remove(P + '-chips-locked');
      }

      // ── Toggle chits (boolean Yes/No) ──
      if (desc.type === 'toggleChit') {
        var chitHost = card.querySelector('td.' + fk + ', td[data-field-key="' + fk + '"]');
        if (chitHost) {
          if (isLocked) chitHost.classList.add(P + '-chit-locked');
          else chitHost.classList.remove(P + '-chit-locked');
        }
      }

      // ── Native-edit fields (Knack popup inline edit) ──
      if (desc.type === 'nativeEdit') {
        var nativeTd = card.querySelector('td.' + fk + ', td[data-field-key="' + fk + '"]');
        if (nativeTd) {
          if (isLocked) nativeTd.classList.add(P + '-native-locked');
          else nativeTd.classList.remove(P + '-native-locked');
        }
      }
    }
  }

  // ── Capture-phase click blocker for locked fields ──
  // Knack binds its own click handlers to td.cell-edit elements.
  // Even after we strip those classes, existing jQuery delegated handlers
  // can still fire. This capture-phase listener stops the event before
  // Knack ever sees it.
  document.addEventListener('click', function (e) {
    var td = e.target.closest('td');
    if (!td) return;
    var card = td.closest('.' + P + '-card');
    if (!card || !card.classList.contains(LOCK_CLASS)) return;

    // Check if this td belongs to a locked (non-exempt) field
    if (td.hasAttribute('data-scw-lock-edit') ||
        td.classList.contains(P + '-native-locked')) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true); // ← capture phase

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

    SCW.debug('[scw-ws-header] Fetching label via view API for ' + recordId);

    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId),
      type: 'GET',
      success: function (resp) {
        var txt = extractLabelFromResponse(viewId, resp);
        SCW.debug('[scw-ws-header] View API label for ' + recordId + ': "' + txt + '"');
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

  /** Re-fetch the record after a fee-affecting field change, with a delay
   *  long enough for Knack's record rules to finish recomputing.
   *
   *  Why delayed and not immediate: Knack's PUT response is built
   *  synchronously, but record rules that update derived fields based on
   *  connected-record lookups (the camera/reader install fee depends on
   *  field_2461 + field_1984 + field_2740 + drop length + connected
   *  product price) often settle a beat AFTER the PUT acknowledgment.
   *  Reading the PUT response in patchCardFromResponse paints the
   *  pre-recompute value; a fresh GET ~700ms later picks up the
   *  recomputed fee and lets us re-patch the card with the right number.
   *
   *  patchCardFromResponse is idempotent — readOnly fields like the
   *  install fee, total, and applied-discount get rewritten from the
   *  fresh response with no other side effects. */
  var FEE_REFETCH_DELAY_MS = 700;
  function scheduleFeeRefetch(viewId, recordId) {
    if (typeof Knack === 'undefined') return;
    // Feedback: the calculated cells (applied discount, total, …) recompute
    // server-side and land ~700ms later. Mark them "recalculating" now so the
    // edit visibly registers instead of looking like it didn't take.
    markRecalculating(viewId, recordId, true);
    setTimeout(function () {
      SCW.knackAjax({
        url: SCW.knackRecordUrl(viewId, recordId),
        type: 'GET',
        success: function (resp) {
          // readOnlyOnly: refresh ONLY the calculated cells. Never re-write the
          // user's editable fields from this deferred GET — see the guard in
          // patchCardFromResponse ("won't stick" bug).
          patchCardFromResponse(viewId, recordId, resp, { readOnlyOnly: true });
          markRecalculating(viewId, recordId, false);
        },
        error: function (xhr) {
          markRecalculating(viewId, recordId, false);
          console.warn('[scw-ws-fee] Refetch failed for ' + recordId, xhr && xhr.status);
        }
      });
    }, FEE_REFETCH_DELAY_MS);
  }

  /** Toggle a "recalculating" shimmer on a record's calculated (readOnly)
   *  cells while the fee refetch is in flight. Purely visual feedback that the
   *  downstream numbers are updating after a feeTrigger edit. */
  function markRecalculating(viewId, recordId, on) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.fields) return;
    var viewEl = document.getElementById(viewId);
    var card = null;
    var scope = viewEl || document;
    var cards = scope.querySelectorAll('.' + P + '-card');
    for (var ci = 0; ci < cards.length; ci++) {
      var row = cards[ci].closest('tr');
      if (row && getRecordId(row) === recordId) { card = cards[ci]; break; }
    }
    if (!card) return;
    Object.keys(cfg.fields).forEach(function (name) {
      var desc = cfg.fields[name];
      if (desc.type !== 'readOnly') return;      // only calculated/derived cells
      var tds = card.querySelectorAll('td.' + desc.key +
        ', td[data-field-key="' + desc.key + '"]');
      for (var ti = 0; ti < tds.length; ti++) {
        tds[ti].classList.toggle(P + '-recalc', !!on);
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
        SCW.debug('[scw-ws-header] Applied label for ' + recordId + ': "' + txt + '"');
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
          SCW.debug('[scw-ws-header] Restored cached label for ' + rid + ': "' + _labelCache[rid] + '"');
        }
      }
    }
  }

  /** Sync a single field value into Knack's internal Backbone model so
   *  KTL bulk edit (and any other code reading from the model) sees the
   *  correct value after an AJAX PUT save.
   *
   *  IMPORTANT: only update the ONE field that changed. Merging the full
   *  API response would write HTML-formatted display values into model
   *  attributes, corrupting subsequent model.updateRecord calls. */
  function syncKnackModel(viewId, recordId, resp, fieldKey, value) {
    try {
      var view = Knack.views[viewId];
      if (!view || !view.model) return;
      var m = view.model;

      // Knack view-scoped PUTs wrap the record under a "record" key —
      // unwrap so the field_NNNN scan below sees calc fields like
      // field_2151 / field_2028 in the response.
      if (resp && resp.record && typeof resp.record === 'object' && resp.record.id) {
        resp = resp.record;
      }

      // Find the Backbone record — try multiple paths
      var record = typeof m.get === 'function' ? m.get(recordId) : null;
      if (!record && m.data && typeof m.data.get === 'function') {
        record = m.data.get(recordId);
      }
      if (!record) {
        var arr = m.models || (m.data && m.data.models) || [];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].id === recordId) { record = arr[i]; break; }
        }
      }
      if (!record) return;

      var attrs = record.attributes || record;

      // Use _raw value from the response (clean server format) when available,
      // otherwise fall back to the value we sent.
      var rawVal = (resp && resp[fieldKey + '_raw'] != null) ? resp[fieldKey + '_raw'] : value;
      attrs[fieldKey] = rawVal;
      attrs[fieldKey + '_raw'] = rawVal;

      // Patch every other field from the response so calc/equation fields
      // (e.g. field_2028 install fee, field_2269 equipment total) reflect
      // the recalculated values without waiting for a view re-render.
      if (resp && typeof resp === 'object') {
        var respKeys = Object.keys(resp);
        for (var rk = 0; rk < respKeys.length; rk++) {
          var key = respKeys[rk];
          if (!/^field_\d+(_raw)?$/.test(key)) continue;
          if (key === fieldKey || key === fieldKey + '_raw') continue;
          attrs[key] = resp[key];
        }
      }

      // This is a DIRECT attribute mutation — Backbone fires no 'change', so
      // worksheet-v2's dirty tracking would miss it. Mark the record dirty so
      // its v2 card rebuilds on the next render (the rest reuse without a sig).
      try {
        if (window.SCW && SCW.worksheetV2 && SCW.worksheetV2.data &&
            typeof SCW.worksheetV2.data.markDirty === 'function') {
          SCW.worksheetV2.data.markDirty(viewId, recordId);
        }
      } catch (e2) { /* ignore */ }
    } catch (ex) {
      // Silently ignore — model sync is best-effort
    }
  }

  /** Save a direct-edit field value.
   *  For header-trigger fields, always uses AJAX PUT so we can read
   *  the recalculated formula from the response.  For other fields,
   *  prefers model.updateRecord to avoid a full re-render.
   *  Calls onSuccess(resp) or onError(message) when done. */
  function saveDirectEditValue(viewId, recordId, fieldKey, value, onSuccess, onError, extraData) {
    if (typeof Knack === 'undefined') return;

    var data = {};
    data[fieldKey] = value;
    // Pre-save hooks (e.g. survey-bid-validate) can pass companion
    // field writes through extraData so they land in the same PUT —
    // e.g. saving field_2150 also writing the survey note to
    // field_2412 in a single transaction.
    if (extraData && typeof extraData === 'object') {
      for (var ek in extraData) {
        if (Object.prototype.hasOwnProperty.call(extraData, ek)) {
          data[ek] = extraData[ek];
        }
      }
    }
    var trigger = isHeaderTrigger(viewId, fieldKey);

    // Always use AJAX PUT so we get the full response for card patching
    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId),
      type: 'PUT',
      data: JSON.stringify(data),
      success: function (resp) {
        patchCardFromResponse(viewId, recordId, resp);
        if (trigger) fetchAndApplyLabel(viewId, recordId);
        if (isFeeTrigger(viewId, fieldKey)) scheduleFeeRefetch(viewId, recordId);
        syncKnackModel(viewId, recordId, resp, fieldKey, value);
        // Payload lets downstream listeners (e.g. bid-review) patch a
        // single row instead of doing a full grid rebuild. Listeners
        // ignoring the args keep working — jQuery just passes them.
        $(document).trigger('scw-record-saved',
          [{ recordId: recordId, viewId: viewId, fieldKey: fieldKey }]);
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

    // Brief acknowledgment flash — added on Enter, REMOVED after a
    // fixed 200ms regardless of whether the PUT has returned yet.
    // Without the timed removal, .is-saving stays painted green for
    // the full PUT round-trip (200-1000ms+ on Knack's server), making
    // every edit feel "stuck waiting." The optimistic update of
    // hiddenTd / hiddenSpan above already shows the new value; the
    // flash is just feedback that we received the keystroke. On
    // error, showInputError will repaint the input red.
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    setTimeout(function () {
      // Only clear if still saving — error path may have replaced it.
      if (input.classList.contains('is-saving')) {
        input.classList.remove('is-saving');
      }
    }, 200);
    var errEl = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (errEl) errEl.remove();

    // Find record ID and view ID
    var wsTr = input.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    // Prefer the source view id stamped on the wsTr — it survives the
    // wsTr being moved out of its native view container (e.g. bid-
    // review\'s expand cell). Fall back to the closest [id^="view_"].
    var viewId = wsTr.getAttribute('data-scw-view-id');
    if (!viewId) {
      var viewEl = input.closest('[id^="view_"]');
      viewId = viewEl ? viewEl.id : null;
    }
    if (recordId && viewId) {
      // Pre-save hook — feature modules (e.g. survey-bid-validate) can
      // register a function on SCW.deviceWorksheet.preSaveHook to
      // gate or augment a save. Hook signature:
      //   preSaveHook({ viewId, recordId, fieldKey, newValue,
      //                 previousValue, input }) → Promise<{
      //                   proceed: bool,    // false → revert
      //                   extraData?: {}    // merged into PUT body
      //                 }>
      var doSave = function (extraData) {
        saveDirectEditValue(viewId, recordId, fieldKey, newValue,
          function () { showInputSuccess(input); },
          function (msg) { showInputError(input, msg, previousValue); },
          extraData || null
        );
      };
      var hook = (window.SCW && SCW.deviceWorksheet && SCW.deviceWorksheet.preSaveHook);
      if (typeof hook === 'function') {
        var hookCtx = {
          viewId: viewId, recordId: recordId, fieldKey: fieldKey,
          newValue: newValue, previousValue: previousValue, input: input
        };
        Promise.resolve()
          .then(function () { return hook(hookCtx); })
          .then(function (decision) {
            if (decision && decision.proceed === false) {
              showInputError(input, 'Save canceled', previousValue);
              return;
            }
            doSave(decision && decision.extraData);
          })
          .catch(function (err) {
            console.warn('[scw-ws-direct] preSaveHook threw', err);
            doSave();
          });
      } else {
        doSave();
      }
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

    if (typeof Knack === 'undefined') return;

    // Always use AJAX PUT so we get the full response for card patching
    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId),
      type: 'PUT',
      data: JSON.stringify(data),
      success: function (resp) {
        patchCardFromResponse(viewId, recordId, resp);
        if (trigger) fetchAndApplyLabel(viewId, recordId);
        if (isFeeTrigger(viewId, fieldKey)) scheduleFeeRefetch(viewId, recordId);
        syncKnackModel(viewId, recordId, resp, fieldKey, value);
        if (onSuccess) onSuccess(resp);
      },
      error: function (xhr) {
        console.warn('[scw-ws-radio] Save failed for ' + recordId, xhr.responseText);
      }
    });
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

    // Block clicks on locked chip containers (record lock)
    if (container.classList.contains(P + '-chips-locked')) return;

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
      saveRadioValue(viewId, recordId, fk, saveValue);
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

    // Let KTL bulk-edit handle the click when active. .bulkEditSelectSrc
    // marks the source cell; .bulkEditSelectedRow is on tds in a row that
    // got picked for bulk ops. Either signal means our toggle would
    // fight KTL's source-select / apply flow, so bail.
    //
    // (Earlier revisions also bailed on .bulkEditTh anywhere in the view,
    //  but that class is statically present on every column header label
    //  span and would suppress every click. The two td-level signals
    //  above are dynamic and reliable.)
    var chitTd = chit.closest('td');
    if (chitTd && (
      chitTd.classList.contains('bulkEditSelectSrc') ||
      chitTd.classList.contains('bulkEditSelectedRow')
    )) return;

    // Block clicks on locked chits (record lock)
    if (chitTd && chitTd.classList.contains(P + '-chit-locked')) return;

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
      // Update the inner chip-stack bool-chip (if present — view_3505\'s
      // exterior cell for example) so its data-value stays the truth
      // for subsequent reads. The plain "Yes"/"No" span fallback
      // covers tds without chip-stack rendering.
      var innerBoolChip = srcTd.querySelector('.scw-bool-chip[data-field="' + fieldKey + '"]');
      if (innerBoolChip) {
        innerBoolChip.setAttribute('data-value', newBool.toLowerCase());
        innerBoolChip.classList.remove('is-yes', 'is-no');
        innerBoolChip.classList.add(newBool === 'Yes' ? 'is-yes' : 'is-no');
      } else {
        var hiddenSpan = srcTd.querySelector('.' + P + '-chit-value')
                      || srcTd.querySelector('span[style*="display"]');
        if (hiddenSpan) hiddenSpan.textContent = newBool;
      }
      srcTd.setAttribute('data-value', newBool);
    }

    // Save
    var wsTr = chit.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    // Prefer the source view id stamped on the wsTr — survives the
    // wsTr being moved (e.g. into bid-review's expand cell). Fall back
    // to closest [id^="view_"] for native render contexts.
    var viewId = wsTr.getAttribute('data-scw-view-id');
    if (!viewId) {
      var viewEl = chit.closest('[id^="view_"]');
      viewId = viewEl ? viewEl.id : null;
    }
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
    // readFieldValue preserves HTML for HTML_PRESERVE_FIELDS so opening
    // the input on a rich-text field (e.g. labor description) doesn't
    // round-trip through textContent and lose formatting.
    var currentVal = readFieldValue(td, fieldKey);
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
        var sh = input.scrollHeight;
        input.style.height = sh > 0 ? (sh + 'px') : '';
      }
      input.addEventListener('input', autoGrow);
      // Initial size — use multiple deferred calls because the first
      // requestAnimationFrame may fire before the browser has finished
      // laying out the container (scrollHeight returns 0 in that case).
      requestAnimationFrame(autoGrow);
      setTimeout(autoGrow, 50);
      setTimeout(autoGrow, 200);
      setTimeout(autoGrow, 600);

      // ResizeObserver: re-run autoGrow when the textarea's width changes
      // (flex container may settle its layout after initial paint).
      if (typeof ResizeObserver !== 'undefined') {
        var lastW = 0;
        var ro = new ResizeObserver(function (entries) {
          var w = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : 0;
          if (w && w !== lastW) {
            lastW = w;
            autoGrow();
          }
        });
        ro.observe(input);
      }
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
        // Editable if Knack/KTL has cell-edit on the td, or if the field
        // is flagged alwaysEditable (and not locked by conditional modules).
        var _knackEditable = isCellEditable(td)
          || (desc.alwaysEditable && td && !isCellLocked(td));
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
            injectSummaryDirectEdit(td, desc.key, { multiline: !!desc.multiline, rows: desc.rows || 1 });
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
        if (desc.segmented) chips.classList.add(P + '-segmented');
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
        // Prefer an inner .scw-bool-chip[data-field=fieldKey] when present
        // \u2014 that\'s the chip-stack renderer\'s authoritative value. On
        // view_3505 the same <td.field_2372> hosts both Exterior AND
        // Plenum chips, so td.textContent reads "ExteriorPlenum" and
        // the plain yes/true match fails, leaving the chit gray even
        // when the field actually is Yes.
        var innerChip = td.querySelector('.scw-bool-chip[data-field="' + desc.key + '"]');
        var isChitYes;
        if (innerChip) {
          var dv = (innerChip.getAttribute('data-value') || '').trim().toLowerCase();
          isChitYes = (dv === 'yes' || dv === 'true');
        } else {
          var chitVal = (td.textContent || '').replace(/[\u00a0\s]/g, '').trim().toLowerCase();
          isChitYes = (chitVal === 'yes' || chitVal === 'true');
        }
        // Skip rendering entirely when showOnlyIfYes and value is not yes
        if (desc.showOnlyIfYes && !isChitYes) break;
        var chit = document.createElement('span');
        var chitCls = P + '-cabling-chit ' + (isChitYes ? 'is-yes' : 'is-no');
        if (!desc.feeTrigger) chitCls += ' is-readonly';
        chit.className = chitCls;
        chit.setAttribute('data-field', desc.key);
        // Label rendered via CSS ::after (.scw-ws-cabling-chit::after
        // pulls content from data-chit-label) — keeping the chit's
        // innerHTML empty means td.textContent stays the bare "Yes"
        // or "No" that KTL bulk-edit reads from the source cell.
        chit.setAttribute('data-chit-label', desc.chitLabel || 'Existing Cabling');
        // Visually hide the original Yes/No span via off-screen
        // positioning rather than display:none — KTL's bulk-edit
        // source reader uses innerText (which skips display:none and
        // visibility:hidden content), so display:none made the
        // source-cell value read as empty and downstream rows got
        // defaulted to No. Off-screen-but-rendered keeps the value
        // readable to innerText, textContent, and jQuery .text().
        var chitSpan = td.querySelector('span');
        if (chitSpan) {
          chitSpan.classList.add(P + '-chit-value');
          chitSpan.setAttribute('aria-hidden', 'true');
        }
        // Mirror the Yes/No on the td as a data attribute too so any
        // KTL path that reads via [data-value] also lines up.
        td.setAttribute('data-value', isChitYes ? 'Yes' : 'No');
        td.appendChild(chit);
        td.classList.add(P + '-sum-chip-host');
        td.setAttribute('data-scw-cabling-src', '1');
        // Force-add Knack's inline-edit classes on toggleChit cells so
        // KTL's bulk-edit recognizes them as bulk-source candidates
        // (it gates the `bulkEditSelectSrc` outline + cursor on cells
        // carrying these classes). Builder's per-field inline-edit
        // toggle on view_3505 omits these classes for field_2371
        // (Plenum) while setting them for field_2370 / field_2372 —
        // so without this nudge Plenum's TD wouldn't show the
        // bulk-edit source affordance even though it's visually a
        // peer of the other two chits. feeTrigger=true means we
        // already intend the cell to be editable via our own toggle,
        // so adding the class doesn't introduce new write semantics.
        if (desc.feeTrigger) {
          td.classList.add('cell-edit');
          td.classList.add('ktlInlineEditableCellsStyle');
        }
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

      case 'requiredPhotos':
        // Header-level QA indicator: one chit per required photo on the
        // row, color-coded by the photo's QA state (missing / qa-pending
        // / half-pass / done / fail). Hover title = photo type + state.
        // Each chit carries data-photo-id so the qa-popover module can
        // identify which PIC record a click corresponds to.
        var qaStatusKey  = desc.qaStatusField  || 'field_2859';
        var qaClientKey  = desc.qaClientField  || 'field_2860';
        var qaNotesKey   = desc.qaNotesField   || 'field_2861';
        var qaHistoryKey = desc.qaHistoryField || 'field_2865';
        var photoList = readRequiredPhotos(tr, {
          typeKey:      desc.typeField      || 'field_2445',
          reqKey:       desc.requiredField  || 'field_2446',
          doneKey:      desc.completedField || 'field_2447',
          qaStatusKey:  qaStatusKey,
          qaClientKey:  qaClientKey,
          qaNotesKey:   qaNotesKey,
          qaHistoryKey: qaHistoryKey
        });
        var hasQAColumns = !!tr.querySelector('td.' + qaStatusKey);
        if (!photoList.length) {
          // Reserve a spacer so stacked-summary alignment doesn't shift
          // between rows that have required photos and ones that don't.
          if (desc.alwaysReserveSpace !== false) {
            var phEmpty = document.createElement('span');
            phEmpty.className = P + '-sum-group ' + (desc.groupCls ? P + '-' + desc.groupCls : '');
            phEmpty.style.visibility = 'hidden';
            var phEmptyLbl = document.createElement('span');
            phEmptyLbl.className = P + '-sum-label';
            phEmptyLbl.innerHTML = '&nbsp;';
            phEmpty.appendChild(phEmptyLbl);
            target.appendChild(phEmpty);
          }
          break;
        }
        var phGroup = document.createElement('span');
        phGroup.className = P + '-sum-group' + (desc.groupCls ? ' ' + P + '-' + desc.groupCls : '');
        var phLabel = document.createElement('span');
        phLabel.className = P + '-sum-label';
        phLabel.textContent = desc.label || 'Photos';
        phGroup.appendChild(phLabel);
        var phRow = document.createElement('span');
        phRow.className = P + '-req-photos';
        var doneCount = 0;
        for (var pp = 0; pp < photoList.length; pp++) {
          var ph = photoList[pp];
          var chitState = computePhotoChitState(ph, hasQAColumns);
          if (chitState === 'done') doneCount++;
          var phChit = document.createElement('span');
          phChit.className = P + '-req-photo-chit is-' + chitState;
          phChit.setAttribute('data-photo-id', ph.id);
          phChit.setAttribute('data-photo-state', chitState);
          phChit.title = (ph.type || 'Photo') + ' — ' + chitStateTooltip(chitState);
          phChit.innerHTML = chitStateIcon(chitState);
          var phName = document.createElement('span');
          phName.className = P + '-req-photo-chit-name';
          phName.textContent = ph.type || 'Photo';
          phChit.appendChild(phName);
          var phState = document.createElement('span');
          phState.className = P + '-req-photo-chit-state';
          phState.textContent = chitStateLabel(chitState);
          phChit.appendChild(phState);
          phRow.appendChild(phChit);
        }
        if (doneCount === photoList.length) {
          phGroup.classList.add(P + '-req-photos-all-done');
        }
        phGroup.appendChild(phRow);
        target.appendChild(phGroup);
        break;
    }
  }

  // ── Photo chit visual helpers ───────────────────────────────────

  function chitStateTooltip(state) {
    switch (state) {
      case 'missing':    return 'photo not uploaded';
      case 'qa-pending': return 'photo uploaded, QA not yet done';
      case 'half-pass':  return 'internal pass, awaiting client signoff';
      case 'done':       return 'signed off';
      case 'fail':       return 'QA failed';
      default:           return state;
    }
  }

  /** Short suffix label rendered inside the chit so the state reads
      explicitly without relying on color alone. */
  function chitStateLabel(state) {
    switch (state) {
      case 'missing':    return 'Missing';
      case 'qa-pending': return 'Needs QA';
      case 'half-pass':  return 'Client pending';
      case 'done':       return 'Signed off';
      case 'fail':       return 'Failed';
      default:           return '';
    }
  }

  function chitStateIcon(state) {
    var checkSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var warnSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    var xSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    // Clock-face icon — clearly says "waiting / not yet done"
    var clockSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    // Half-filled circle — clearly intermediate state
    var halfSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9" fill="none"/><path d="M12 3 A9 9 0 0 1 12 21 Z" fill="currentColor"/></svg>';
    switch (state) {
      case 'done':       return checkSvg;
      case 'half-pass':  return halfSvg;
      case 'missing':    return warnSvg;
      case 'fail':       return xSvg;
      case 'qa-pending': return clockSvg;
      default:           return clockSvg;
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
      chevWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;margin-top:2px;';
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

    // Warning chit — always reserve space so layout stays consistent;
    // hidden (visibility:hidden) when count is 0.
    var warnDesc = fieldDesc(viewCfg, 'warningCount');
    if (warnDesc) {
      var warnTd = findCell(tr, warnDesc.key);
      var warnVal = warnTd ? parseFloat((warnTd.textContent || '').replace(/[^0-9.-]/g, '')) : 0;
      var warnChit = document.createElement('span');
      warnChit.className = P + '-warn-chit';
      if (warnVal > 0) {
        warnChit.classList.add(P + '-warn-chit--active');
        warnChit.setAttribute('data-scw-warn-type', 'photos');
        warnChit.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 9.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.507l-3.22-3.22a.75.75 0 00-1.06 0l-3.22 3.22-1.72-1.72a.75.75 0 00-1.06 0L2.5 12.993v1.757zM12.75 7a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clip-rule="evenodd"/></svg>'
            + Math.round(warnVal);
      } else {
        warnChit.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 9.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.507l-3.22-3.22a.75.75 0 00-1.06 0l-3.22 3.22-1.72-1.72a.75.75 0 00-1.06 0L2.5 12.993v1.757zM12.75 7a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clip-rule="evenodd"/></svg>0';
        warnChit.style.visibility = 'hidden';
      }
      identity.appendChild(warnChit);
    }

    var labelDesc = fieldDesc(viewCfg, 'label');
    var productDesc = fieldDesc(viewCfg, 'product');
    var pgLayoutEarly = viewCfg.layout || {};
    // Opt-in mode: tuck the label cell INSIDE the product-group so label +
    // product share the product-group's fixed width. Used on view_3505 to
    // align labor description across cam/reader rows (which carry a label)
    // and non-cam rows (which don't), so labor desc starts at the same x.
    var combineLabelWithProduct = !!(pgLayoutEarly.labelInProductGroup
      && labelDesc && productDesc && productDesc.summary);

    if (labelDesc && !combineLabelWithProduct) {
      var labelTd = findCell(tr, labelDesc.key, labelDesc.columnIndex);
      if (labelTd) {
        labelTd.classList.add(P + '-sum-label-cell');
        identity.appendChild(labelTd);
      }
    } else if (!labelDesc && viewCfg.labelPlaceholder && !pgLayoutEarly.labelInProductGroup) {
      // Insert an invisible spacer matching the label cell's width
      // so that product + laborDescription align with rows that have a label.
      // Skipped under labelInProductGroup mode: there the label rides
      // inside the (fixed-width) product-group, so non-label rows are
      // already aligned without any spacer in identity.
      var labelSpacer = document.createElement('span');
      labelSpacer.className = P + '-sum-label-cell';
      labelSpacer.style.visibility = 'hidden';
      labelSpacer.innerHTML = '&nbsp;';
      identity.appendChild(labelSpacer);
    }

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
        // Only needed when there's no label-cell; when there IS a
        // label-cell (view_3313) the identity wrapper handles alignment.
        if (hasStackedFields && !labelDesc) {
          var prodLabel = document.createElement('span');
          prodLabel.className = P + '-sum-label';
          prodLabel.innerHTML = '&nbsp;';
          productGroup.appendChild(prodLabel);
        }

        // Combined-label mode: prepend the label cell inside the product-group
        // so they share the product-group's fixed width. CSS overrides the
        // standalone label-cell sizing via the --in-product modifier.
        if (combineLabelWithProduct) {
          var combLabelTd = findCell(tr, labelDesc.key, labelDesc.columnIndex);
          if (combLabelTd) {
            combLabelTd.classList.add(P + '-sum-label-cell');
            combLabelTd.classList.add(P + '-sum-label-cell--in-product');
            productGroup.appendChild(combLabelTd);
          }
        }

        productTd.classList.add(P + '-sum-product');
        if (pgLayout.productEditable) {
          productTd.classList.add(P + '-sum-product--editable');
        }

        // view_3596: qty badge — rendered in rightGroup below
        var qtyBadgeVal = 0;
        if (viewCfg.qtyBadgeField) {
          var qtyCell = findCell(tr, viewCfg.qtyBadgeField);
          if (qtyCell) {
            qtyBadgeVal = parseInt((qtyCell.textContent || '').trim(), 10) || 0;
          }
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

      // Stack layout item: { stack: [fieldNames...] } renders the listed
      // fields into a column-flex wrapper so they stack vertically.
      // Used for things like multiple toggleChits on cam/reader rows.
      if (name && typeof name === 'object' && Array.isArray(name.stack)) {
        var stackWrap = document.createElement('span');
        stackWrap.className = P + '-sum-group ' + P + '-sum-group--chit-stack';
        for (var si = 0; si < name.stack.length; si++) {
          var sName = name.stack[si];
          var sDesc = fieldDesc(viewCfg, sName);
          if (!sDesc || !sDesc.summary) continue;
          renderSummaryField(stackWrap, tr, sName, sDesc, viewCfg);
        }
        rightGroup.appendChild(stackWrap);
        continue;
      }

      var desc = fieldDesc(viewCfg, name);
      if (!desc || !desc.summary) continue;

      // Skip identity-grouped fields (rendered inside product group above)
      if (desc.group === 'identity') continue;
      // Route to the right container based on group
      var container = (desc.group === 'fill' || desc.group === 'pre') ? bar : rightGroup;
      renderSummaryField(container, tr, name, desc, viewCfg);
    }

    // ── Qty badge (far right, before move/delete) ──
    if (qtyBadgeVal > 1) {
      var qtyTd = document.createElement('td');
      qtyTd.textContent = qtyBadgeVal;
      appendSumGroup(rightGroup, 'Quantity', qtyTd, { readOnly: true, cls: P + '-sum-group--qty-badge' });
    }

    // ── Move icon (structural — always last before delete) ──
    var moveDesc = fieldDesc(viewCfg, 'move');
    if (moveDesc && moveDesc.type === 'moveIcon') {
      var moveTd = findCell(tr, moveDesc.key);
      if (moveTd) {
        if (!moveTd.querySelector('.fa-exchange')) {
          moveTd.innerHTML =
            '<i class="fa fa-exchange" aria-hidden="true" title="Change MDF/IDF" ' +
              'style="font-size:18px; line-height:1; color:rgba(237,131,38,1); cursor:pointer;"></i>';
        }
        moveTd.classList.add(P + '-sum-move');
        var moveWrap = document.createElement('span');
        moveWrap.className = P + '-sum-group ' + P + '-sum-group--move';
        var moveLabel = document.createElement('span');
        moveLabel.className = P + '-sum-label';
        moveLabel.textContent = 'IDF';
        moveWrap.appendChild(moveLabel);
        moveWrap.appendChild(moveTd);
        rightGroup.appendChild(moveWrap);
      }
    }

    // ── Delete link (always reserve space for alignment) ──
    var deleteLink = tr.querySelector('a.kn-link-delete');
    var deleteWrap = document.createElement('span');
    deleteWrap.className = P + '-sum-delete';
    if (deleteLink) {
      var deleteTd = deleteLink.closest('td');
      deleteWrap.appendChild(deleteLink);
      if (deleteTd && !deleteTd.children.length) {
        deleteTd.style.display = 'none';
      }
    }
    if (hasStackedFields) {
      var delCol = document.createElement('span');
      delCol.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;';
      var delSpacer = document.createElement('span');
      delSpacer.className = P + '-sum-label';
      delSpacer.innerHTML = '&nbsp;';
      delCol.appendChild(delSpacer);
      delCol.appendChild(deleteWrap);
      rightGroup.appendChild(delCol);
    } else {
      rightGroup.appendChild(deleteWrap);
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
    connectedDevice:  'Connected To',
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
    status:           'Status',
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

    // Tag each appended row with data-scw-field so CSS (and other code)
    // can target specific fields inside the detail panel — e.g. for
    // multi-field-per-line layouts in view_3800.
    function addRow(row) {
      if (!row) return;
      if (desc && desc.key) row.setAttribute('data-scw-field', desc.key);
      section.appendChild(row);
    }

    switch (desc.type) {
      case 'readOnly':
        // Strip inline-edit affordance — this field is read-only
        if (td) {
          td.classList.remove('cell-edit', 'ktlInlineEditableCellsStyle');
        }
        addRow(buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty, notes: !!desc.notes }));
        break;

      case 'nativeEdit':
        // Preserve Knack's native inline-edit (cell-edit class stays).
        // Used for connection fields that open Knack's modal picker.
        addRow(buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty, notes: !!desc.notes }));
        break;

      case 'directEdit':
        // Editable if Knack/KTL has cell-edit on the td, or if the field
        // is flagged alwaysEditable (and not locked by conditional modules).
        var _detailEditable = isCellEditable(td)
          || (desc.alwaysEditable && td && !isCellLocked(td));
        if (!_detailEditable) {
          addRow(buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty, notes: !!desc.notes }));
        } else {
          if (desc.skipEmpty && (!td || isCellEmpty(td))) break;
          addRow(buildEditableFieldRow(label, td, desc.key, { notes: !!desc.notes }));
        }
        break;

      case 'singleChip':
      case 'multiChip':
        addRow(buildRadioChipRow(label, td, desc.key, desc.options || [], desc.type === 'multiChip', { segmented: !!desc.segmented }));
        break;

      case 'connectedRecords':
        // Connected records widget (e.g. mounting hardware in view_3313)
        if (window.SCW && SCW.connectedRecords && typeof SCW.connectedRecords.buildWidget === 'function') {
          var recordId = getRecordId(tr);
          var crWidget = SCW.connectedRecords.buildWidget(viewId, recordId, desc.key, tr);
          if (crWidget) {
            addRow(crWidget);
          } else {
            addRow(buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty }));
          }
        } else {
          addRow(buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty }));
        }
        break;

      case 'link':
        // Render a connection field as a clickable link
        // desc.linkField = field key for the secondary record ID (from the same row)
        // desc.linkPattern = URL template with {linkField} and {recordId} placeholders
        if (td && !isCellEmpty(td)) {
          // Extract connection record ID from the cell (Knack wraps in <a> or <span>)
          var linkA = td.querySelector('a[href*="knack"]') || td.querySelector('a');
          var connRecordId = '';
          if (linkA && linkA.href) {
            var idMatch = linkA.href.match(/([0-9a-f]{24})/i);
            if (idMatch) connRecordId = idMatch[1];
          }
          if (!connRecordId) {
            // Fallback: try data attribute or raw model data
            var trRecId = getRecordId(tr);
            if (trRecId && typeof Knack !== 'undefined' && Knack.models) {
              var modelKeys = Object.keys(Knack.models);
              for (var mk = 0; mk < modelKeys.length; mk++) {
                var mdl = Knack.models[modelKeys[mk]];
                if (!mdl || !mdl.data) continue;
                var recs = Array.isArray(mdl.data) ? mdl.data : (mdl.data.models || []);
                for (var ri = 0; ri < recs.length; ri++) {
                  var rec = recs[ri].attributes || recs[ri];
                  if (rec.id === trRecId) {
                    var rawConn = rec[desc.key + '_raw'] || rec[desc.key];
                    if (rawConn) {
                      if (Array.isArray(rawConn) && rawConn.length) connRecordId = rawConn[0].id || '';
                      else if (typeof rawConn === 'object' && rawConn.id) connRecordId = rawConn.id;
                    }
                    break;
                  }
                }
                if (connRecordId) break;
              }
            }
          }

          // Get the secondary field's record ID (e.g. survey request record ID)
          var linkFieldVal = '';
          if (desc.linkField) {
            // Primary: Knack model _raw data (always gives the connection record ID)
            var trRecId2 = trRecId || getRecordId(tr);
            if (trRecId2 && typeof Knack !== 'undefined' && Knack.models) {
              var mk2 = Object.keys(Knack.models);
              for (var mi = 0; mi < mk2.length; mi++) {
                var mdl2 = Knack.models[mk2[mi]];
                if (!mdl2 || !mdl2.data) continue;
                var recs2 = Array.isArray(mdl2.data) ? mdl2.data : (mdl2.data.models || []);
                for (var ri2 = 0; ri2 < recs2.length; ri2++) {
                  var rec2 = recs2[ri2].attributes || recs2[ri2];
                  if (rec2.id === trRecId2) {
                    var rawLf = rec2[desc.linkField + '_raw'] || rec2[desc.linkField];
                    if (rawLf) {
                      if (Array.isArray(rawLf) && rawLf.length) linkFieldVal = rawLf[0].id || '';
                      else if (typeof rawLf === 'object' && rawLf.id) linkFieldVal = rawLf.id;
                    }
                    break;
                  }
                }
                if (linkFieldVal) break;
              }
            }
            // Fallback: extract record ID from DOM cell
            if (!linkFieldVal) {
              var linkTd = findCell(tr, desc.linkField);
              if (linkTd) {
                // Try <a> href first
                var lfA = linkTd.querySelector('a');
                if (lfA && lfA.href) {
                  var lfMatch = lfA.href.match(/([0-9a-f]{24})/i);
                  if (lfMatch) linkFieldVal = lfMatch[1];
                }
                // Try <span data-kn="connection-value"> — Knack puts the
                // record ID in the class or id attribute of these spans
                if (!linkFieldVal) {
                  // Knack puts the record ID in the class or id attribute.
                  // For through-connections there are nested spans — the
                  // innermost one holds the actual target record ID, so we
                  // iterate all and keep the last match.
                  var connSpans = linkTd.querySelectorAll('span[data-kn="connection-value"]');
                  for (var cs = 0; cs < connSpans.length; cs++) {
                    var csClass = (connSpans[cs].className || '').trim();
                    var csId    = (connSpans[cs].id || '').trim();
                    if (/^[0-9a-f]{24}$/i.test(csClass)) linkFieldVal = csClass;
                    else if (/^[0-9a-f]{24}$/i.test(csId)) linkFieldVal = csId;
                  }
                }
              }
            }
          }

          var displayText = (td.textContent || '').replace(/[\u00a0]/g, ' ').trim();
          var linkRow = document.createElement('div');
          linkRow.className = P + '-field';

          var linkLabel = document.createElement('div');
          linkLabel.className = P + '-field-label';
          linkLabel.textContent = label;
          linkRow.appendChild(linkLabel);

          var linkVal = document.createElement('div');
          linkVal.className = P + '-field-value';

          if (connRecordId && desc.linkPattern) {
            var href = desc.linkPattern
              .replace('{recordId}', connRecordId)
              .replace('{linkField}', linkFieldVal);
            var anchor = document.createElement('a');
            anchor.href = href;
            anchor.textContent = displayText || 'View';
            anchor.style.cssText = 'color:#2563eb;text-decoration:underline;cursor:pointer;';
            anchor.target = '_blank';
            linkVal.appendChild(anchor);
          } else {
            linkVal.textContent = displayText || '\u2014';
          }

          linkRow.appendChild(linkVal);
          addRow(linkRow);
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
          addRow(chipFieldRow);
        } else {
          addRow(buildFieldRow(label, td));
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
      // Hide the in-card photo wrapper on collapse.
      // For photoAlwaysVisible views, only keep it visible if there are
      // actual uploaded images (not just required placeholders / "+ Add").
      var hasRealPhotos = false;
      if (keepPhoto) {
        var pw = wsTr.querySelector('.' + P + '-photo-wrap');
        hasRealPhotos = pw && pw.querySelector('.scw-inline-photo-card[data-photo-has-image="true"]');
      }
      if (!keepPhoto || !hasRealPhotos) {
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
        warnIcon.setAttribute('data-scw-warn-type', 'accessory');
        warnIcon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        warnIcon.title = 'Accessory mismatch — one or more accessories do not match parent product';

        var slot = card.querySelector('.' + P + '-warn-slot');
        if (slot) slot.appendChild(warnIcon);
        break;
      }
    }

    // ── Discontinued-product header warning ──
    // Same warn-slot as the accessory-mismatch icon (parity with all other
    // header warnings); also tint the product name amber.
    if (isDiscontinuedRow(tr)) {
      var discIcon = document.createElement('span');
      discIcon.className = 'scw-cr-hdr-warning';
      discIcon.setAttribute('data-scw-warn-type', 'discontinued');
      discIcon.innerHTML = DISCONTINUED_SVG;
      discIcon.title =
        'Product discontinued — no longer available. Replace before submitting.';
      var discSlot = card.querySelector('.' + P + '-warn-slot');
      if (discSlot) discSlot.appendChild(discIcon);
      var discProd = card.querySelector('.' + P + '-sum-product');
      if (discProd) discProd.classList.add(P + '-sum-product--discontinued');
    }

    // ── Apply bucket-based field hiding + label injection ──
    applyBucketRules(card, tr, viewCfg);

    // ── Apply conditional field hiding (e.g. hide totals when qty=1) ──
    applyConditionalHide(card, tr, viewCfg);

    // ── Apply showWhenFieldIsYes visibility ──
    var fNames = Object.keys(viewCfg.fields);
    // Check if this row's bucket rule has a descLabel (Services/Assumptions) —
    // if so, skip all showWhenFieldIsYes guards; bucket hideFields handles hiding instead.
    var swBucketId = viewCfg.bucketField ? readBucketId(tr, viewCfg.bucketField) : null;
    var swBucketRule = swBucketId && viewCfg.bucketRules ? viewCfg.bucketRules[swBucketId] : null;
    for (var swi = 0; swi < fNames.length; swi++) {
      var swDesc = viewCfg.fields[fNames[swi]];
      if (!swDesc.showWhenFieldIsYes) continue;
      if (swBucketRule && swBucketRule.descLabel) continue;
      var guardTd = tr.querySelector('td.' + swDesc.showWhenFieldIsYes)
                 || card.querySelector('td[data-field-key="' + swDesc.showWhenFieldIsYes + '"]');
      var guardVal = guardTd ? (guardTd.textContent || '').replace(/[\u00a0\s]/g, '').trim().toLowerCase() : '';
      if (guardVal !== 'yes' && guardVal !== 'true') {
        // Optional secondary guard: still show if orShowWhenFieldIsNo is "no"
        var allowShow = false;
        if (swDesc.orShowWhenFieldIsNo) {
          var orTd = tr.querySelector('td.' + swDesc.orShowWhenFieldIsNo)
                  || card.querySelector('td[data-field-key="' + swDesc.orShowWhenFieldIsNo + '"]');
          var orVal = orTd ? (orTd.textContent || '').replace(/[\u00a0\s]/g, '').trim().toLowerCase() : '';
          if (orVal === 'no' || orVal === 'false') allowShow = true;
        }
        if (!allowShow) {
          // Summary groups use [data-scw-fields="<key>"] (plural);
          // detail-panel rows use [data-scw-field="<key>"] (singular).
          // Hide whichever is present.
          var targetGroup = card.querySelector(
            '[data-scw-fields="' + swDesc.key + '"], ' +
            '[data-scw-field="'  + swDesc.key + '"]'
          );
          if (targetGroup) targetGroup.style.display = 'none';
        }
      }
    }

    // ── Apply hideWhenFieldEquals visibility ──
    applyHideWhenFieldEquals(card, viewCfg);

    // ── Apply record-level lock (sub bid lock) ──
    applyRecordLock(card, viewCfg);

    return card;
  }

  // ============================================================
  // TRANSFORM VIEW
  // ============================================================
  //
  // transformView() is the worksheet's hot path — Phase 1 reads the
  // Knack-rendered <tr>s, Phase 2 builds and inserts the worksheet
  // card rows, Phase 3 restores expanded state + group-collapse +
  // header labels and notifies dependents.
  //
  // Multiple triggers can drive it in rapid succession (the same
  // user editing several rows in a few hundred ms, plus sibling
  // model.fetch() ripples from refresh-on-inline-edit.js, plus the
  // post-edit settle in preserve-scroll-on-refresh.js). Without a
  // guard, run #2's Phase 1 starts while run #1's Phase 2 is still
  // mutating the DOM — the result is empty <tr class="scw-ws-row">
  // shells, stale cells, half-built cards. Documented as Known
  // Issues #5 and #8 in CLAUDE.md.
  //
  // Per-view in-flight guard pattern (cribbed from bid-review/init.js
  // 'silent refresh'): if a transform is already running for a view,
  // a second call just sets `queued = true` and bails. The finally
  // block re-fires once after completion so the queued retry sees
  // up-to-date DOM. One overlap-free retry per burst, regardless of
  // how many triggers piled up.

  var _transformState = {}; // viewId → { inFlight: bool, queued: bool }

  function _transformViewState(viewId) {
    if (!_transformState[viewId]) {
      _transformState[viewId] = { inFlight: false, queued: false };
    }
    return _transformState[viewId];
  }

  function isTransformInFlight(viewId) {
    var s = _transformState[viewId];
    return !!(s && s.inFlight);
  }

  // ── tbody cloak helpers ─────────────────────────────────────
  // Between Knack's view-render and our transformView running
  // (~150ms setTimeout), users see the empty source <tr> shells —
  // device-worksheet hides their cells via CSS once data-scw-worksheet
  // is set, so the table flashes through an empty-grid state.
  //
  // Cloak the tbody with visibility:hidden at view-render time;
  // uncloak in transformView's finally. visibility (not display)
  // keeps layout intact so scroll position and row heights don't
  // jump when we reveal. If a queued retry is pending, the cloak
  // is left in place across the gap so the user only sees the
  // final settled state.
  function _tbodyOf(viewId) {
    var sel = '#' + viewId + ' table.kn-table-table > tbody, ' +
              '#' + viewId + ' table.kn-table > tbody';
    return document.querySelector(sel);
  }

  function cloakTbody(viewId) {
    var tb = _tbodyOf(viewId);
    if (!tb) return;
    if (tb.getAttribute('data-scw-cloaked') === '1') return;
    tb.setAttribute('data-scw-cloaked', '1');
    tb.style.visibility = 'hidden';
  }

  function uncloakTbody(viewId) {
    var tb = _tbodyOf(viewId);
    if (!tb) return;
    if (tb.getAttribute('data-scw-cloaked') !== '1') return;
    tb.removeAttribute('data-scw-cloaked');
    tb.style.visibility = '';
  }

  // True when bid-review-v2 owns a source view (replaceV1 active + the view is
  // one of v2's sources, e.g. the hidden view_3921 on scene_1155). Used to skip
  // wasteful v1 processing of that hidden view on every edit's refetch.
  function brV2OwnsView(viewId) {
    var c = window.SCW && SCW.bidReviewV2 && SCW.bidReviewV2.CONFIG;
    return !!(c && c.enabled !== false && c.replaceV1 &&
      c.sourceViewKeys && c.sourceViewKeys.indexOf(viewId) !== -1);
  }

  function transformView(viewCfg) {
    if (!viewCfg || viewCfg.disabled) return;
    // Bid-review v2 cutover: on the comparison page (scene_1155) view_3921 is
    // a HIDDEN data source — bid-review-v2 renders the live grid and its
    // expand panel uses worksheet-v2 cards, not these v1 cards. So rebuilding
    // v1 worksheet cards here on every edit's refetch is pure waste (and its
    // scroll-preservation coordination was a prime cause of the post-edit
    // page jump). Bail when v2 owns view_3921. Reversible via replaceV1.
    if (viewCfg.viewId === 'view_3921' && brV2OwnsView('view_3921')) return;
    // V2 cutover kill-switch (Known Issue: v1→v2 migration). When v2 is
    // enabled AND has a CONFIG entry for the superseding source view,
    // bail out of v1\'s transformView entirely — no card builds, no
    // group-collapse, no photo strips, no DOM thrash on a hidden
    // table. Now keyed for view_4093 (install) only — its v1 config block
    // still exists but bails here when v2 is enabled.
    // (view_3586/sales + view_3610/ops + view_3505/survey were fully removed —
    // their v1 config blocks are gone entirely, so they never reach here.)
    // Reversible: flip SCW.worksheetV2.CONFIG.enabled = false.
    var V2_TAKEOVER = { view_4093: 'view_4093' };
    var v2SourceKey = V2_TAKEOVER[viewCfg.viewId];
    if (v2SourceKey &&
        window.SCW && window.SCW.worksheetV2 &&
        window.SCW.worksheetV2.CONFIG &&
        window.SCW.worksheetV2.CONFIG.enabled !== false) {
      var v2Views = (window.SCW.worksheetV2.CONFIG.views || []);
      for (var v2i = 0; v2i < v2Views.length; v2i++) {
        if (v2Views[v2i] && v2Views[v2i].sourceViewKey === v2SourceKey &&
            v2Views[v2i].enabled !== false) {
          return;
        }
      }
    }
    var viewId = viewCfg.viewId;
    var state = _transformViewState(viewId);

    if (state.inFlight) {
      // A transform is already running for this view. Mark the queue
      // bit and bail — the finally block in the current run will
      // re-fire transformView once with up-to-date DOM. Cloak stays
      // on across the gap (uncloak happens only when there's no
      // queued retry pending).
      state.queued = true;
      return;
    }

    state.inFlight = true;
    state.queued = false;

    try {
      var _pfTransform = (window.SCW && SCW.perf)
        ? SCW.perf('device-worksheet.transformView ' + viewId) : null;
      _transformViewImpl(viewCfg);
      if (_pfTransform) {
        var _tb = _tbodyOf(viewId);
        _pfTransform(_tb ? ('cards=' + _tb.querySelectorAll('tr.scw-ws-row').length) : '');
      }
    } catch (err) {
      console.error('[device-worksheet] transformView threw for ' + viewId, err);
    } finally {
      state.inFlight = false;
      if (state.queued) {
        state.queued = false;
        // Defer one tick so any pending DOM mutations from the just-
        // completed pass settle before the queued retry reads them.
        // Keep cloak on — the queued retry will uncloak.
        setTimeout(function () { transformView(viewCfg); }, 0);
      } else {
        // Final pass for this burst — reveal the table.
        uncloakTbody(viewId);
      }
    }
  }

  function _transformViewImpl(viewCfg) {
    if (viewCfg.disabled) return;
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;

    // ── Phase timing (gated on SCW.perfLog) ──────────────────────────────
    // transformView can dominate the main thread on a heavy page (it
    // showed 1100ms for 8 cards on the build-SOW scene). Break the run into
    // labeled phases so the slow one is obvious instead of guessed at. Free
    // when perfLog is off.
    var _XF = !!(window.SCW && SCW.perfLog && SCW._now);
    var _xt = _XF ? SCW._now() : 0;
    var _xmarks = [];
    function _xmark(name) {
      if (!_XF) return;
      var _n = SCW._now();
      _xmarks.push(name + '=' + (_n - _xt).toFixed(0));
      _xt = _n;
    }

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

      // Build desired field-key order + labels from view config.
      // The thead is for sorting — only include fields that are useful
      // sort targets (skip product identity and move icon columns).
      //   [checkbox] [label] [summaryLayout fields...] [quantity if present]
      var desiredFields = [];
      var thLabels = {};   // field_key → display label

      // Explicit thead override: if the view config provides theadOrder,
      // that array (of raw field keys) IS the thead column order, and the
      // usual label/summaryLayout/quantity/extraSortFields logic is skipped.
      var _theadOrder = viewCfg.theadOrder || null;
      if (_theadOrder && _theadOrder.length) {
        // Build a key → label lookup from every named fieldDesc so
        // theadOrder entries pick up the same display labels the summary
        // row uses (e.g. "Total", "SCW Notes").
        if (viewCfg.fields) {
          for (var _fn in viewCfg.fields) {
            if (!viewCfg.fields.hasOwnProperty(_fn)) continue;
            var _fd = viewCfg.fields[_fn];
            if (_fd && _fd.key && _fd.label && !thLabels[_fd.key]) {
              thLabels[_fd.key] = _fd.label;
            }
          }
        }
        for (var _to = 0; _to < _theadOrder.length; _to++) {
          var _tk = _theadOrder[_to];
          if (_tk && desiredFields.indexOf(_tk) === -1) desiredFields.push(_tk);
        }
      } else {
        var _labelDesc = fieldDesc(viewCfg, 'label');
        if (_labelDesc) desiredFields.push(_labelDesc.key);

        var _summaryLayout = viewCfg.summaryLayout || [];
        for (var si = 0; si < _summaryLayout.length; si++) {
          var _name = _summaryLayout[si];
          var _desc = fieldDesc(viewCfg, _name);
          if (!_desc || desiredFields.indexOf(_desc.key) !== -1) continue;
          desiredFields.push(_desc.key);
          if (_desc.label) thLabels[_desc.key] = _desc.label;
        }

        // Add quantity if it exists in config but isn't already included
        var _qtyDesc = fieldDesc(viewCfg, 'quantity');
        if (_qtyDesc && desiredFields.indexOf(_qtyDesc.key) === -1) {
          desiredFields.push(_qtyDesc.key);
          if (_qtyDesc.label) thLabels[_qtyDesc.key] = _qtyDesc.label;
        }

        // Append any explicit extra sort columns requested by the view config.
        // These are raw field keys that get a visible <th> (and Knack's sort
        // anchor) without being part of the summary row layout.
        var _extraSorts = viewCfg.extraSortFields || [];
        for (var xi = 0; xi < _extraSorts.length; xi++) {
          var _xk = _extraSorts[xi];
          if (_xk && desiredFields.indexOf(_xk) === -1) desiredFields.push(_xk);
        }
      }

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

      // ── Inject sort-hint icons into sortable <th>s ──
      var sortableThs = thead.querySelectorAll('th a.kn-sort');
      for (var si = 0; si < sortableThs.length; si++) {
        var sortLink = sortableThs[si];
        if (sortLink.querySelector('.scw-sort-hint')) continue;
        var hint = document.createElement('span');
        hint.className = 'scw-sort-hint';
        hint.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
          'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" ' +
          'stroke-linejoin="round">' +
          '<path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg>';
        sortLink.appendChild(hint);
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

    // ── Sort eligible rows ──
    // viewCfg.rowSort is an array of { field, order, type } rules applied
    // in order. type: 'number' | 'text' (default: 'number'). Missing values
    // always sort last regardless of order. Default sorts by
    // field_2218 asc / field_2240 asc / field_1951 asc.
    //
    // When the user clicks a column header, Knack marks that <th> with
    // .sorted-asc / .sorted-desc. In that case we defer to Knack's sort
    // and use the clicked column as the sole rule, otherwise every click
    // would be visually reset by the hard-coded default here.
    var rowSortRules;
    // viewCfg.forceRowSort = true → ignore Knack's th.sorted-asc and use
    // the rowSort defined on viewCfg.  Use this when Knack Builder's
    // default sort doesn't match the worksheet's intended ordering and
    // changing the Builder default isn't feasible.
    var _sortedTh = (!viewCfg.forceRowSort) && thead && thead.querySelector('th.sorted-asc, th.sorted-desc');
    if (_sortedTh) {
      var _sFk = null;
      var _sClasses = _sortedTh.className.split(/\s+/);
      for (var _sc = 0; _sc < _sClasses.length; _sc++) {
        var _cc = _sClasses[_sc];
        if (_cc.indexOf('field_') === 0) {
          _sFk = _cc.indexOf(':') !== -1 ? _cc.substring(0, _cc.indexOf(':')) : _cc;
          break;
        }
      }
      var _sOrder = _sortedTh.classList.contains('sorted-desc') ? 'desc' : 'asc';
      // Guess type: if any td in that column parses as a finite number, treat
      // as number; else text. Prevents alphabetic sort of dollar amounts.
      var _sType = 'text';
      if (_sFk) {
        var _probe = table.querySelector('tbody td.' + _sFk);
        if (_probe) {
          var _raw = (_probe.textContent || '').replace(/[^0-9.\-]/g, '');
          if (_raw && isFinite(parseFloat(_raw))) _sType = 'number';
        }
      }
      rowSortRules = _sFk ? [{ field: _sFk, order: _sOrder, type: _sType }] : [];
    } else {
      // Consult the worksheet-sort feature for a user-selected preset.
      // If the user has not made a selection (or the first/default preset
      // is active), getActiveSortRules returns null and we fall back to
      // the view's own rowSort, then to the hardcoded default.
      var _wsSortRules = null;
      try {
        if (window.SCW && window.SCW.worksheetSort &&
            typeof window.SCW.worksheetSort.getActiveSortRules === 'function') {
          _wsSortRules = window.SCW.worksheetSort.getActiveSortRules(viewCfg);
        }
      } catch (e) { /* ignore */ }

      rowSortRules = _wsSortRules || viewCfg.rowSort || [
        { field: 'field_2218', order: 'asc',  type: 'number' },
        { field: 'field_2240', order: 'asc',  type: 'text'   },
        { field: 'field_1951', order: 'asc',  type: 'number' },
        // Equipment value (CALC_LI_EQUIPMENT extended net) — pricier
        // gear floats up among rows the drop keys can't split. Inert on
        // views that don't expose the column (reads null → tie).
        { field: 'field_2269', order: 'desc', type: 'number' }
      ];
    }

    function _scwCellValue(tr, fieldKey, type) {
      var td = tr.querySelector('td.' + fieldKey);
      var text = td ? (td.textContent || '').trim() : '';
      if (!text) return null;
      if (type === 'text') return text;
      // Numeric (default)
      var n = parseFloat(text.replace(/[^0-9.\-]/g, ''));
      return isFinite(n) ? n : null;
    }

    eligible.sort(function (a, b) {
      for (var si = 0; si < rowSortRules.length; si++) {
        var rule = rowSortRules[si];
        var type = rule.type || 'number';
        var vA = _scwCellValue(a.tr, rule.field, type);
        var vB = _scwCellValue(b.tr, rule.field, type);
        var missA = (vA === null);
        var missB = (vB === null);
        if (missA && missB) continue;
        if (missA) return 1;
        if (missB) return -1;
        var cmp;
        if (type === 'text') {
          cmp = vA.localeCompare(vB, undefined, { numeric: true, sensitivity: 'base' });
        } else {
          cmp = vA - vB;
        }
        if (cmp !== 0) return rule.order === 'desc' ? -cmp : cmp;
      }
      return 0;
    });

    // ── Parent/child threading (viewCfg.threadParentField) ──────
    // Mirrors worksheet-v2's threadChildrenUnderParents: any row whose
    // parent-connection cell points at another VISIBLE row is pulled
    // out of its sorted slot and placed directly beneath that parent.
    // Outranks every sort rule. Children of one parent keep comparator
    // order; rows whose parent isn't on this view keep their own slot;
    // cycle-safe (leftovers append in sorted order).
    if (viewCfg.threadParentField) {
      (function () {
        var pf = viewCfg.threadParentField;
        var presentById = Object.create(null);
        var ti, eid;
        for (ti = 0; ti < eligible.length; ti++) {
          eid = eligible[ti].tr && eligible[ti].tr.id;
          if (eid) presentById[eid] = true;
        }
        var childrenOf = Object.create(null);
        var isChild    = Object.create(null);
        var anyThreads = false;
        for (ti = 0; ti < eligible.length; ti++) {
          var ttr = eligible[ti].tr;
          if (!ttr || !ttr.id) continue;
          var pcell = ttr.querySelector('td.' + pf);
          var pspan = pcell && pcell.querySelector('span[data-kn="connection-value"]');
          var pid   = pspan ? (pspan.className || '').trim() : '';
          if (/^[a-f0-9]{24}$/.test(pid) && pid !== ttr.id && presentById[pid]) {
            (childrenOf[pid] = childrenOf[pid] || []).push(eligible[ti]);
            isChild[ttr.id] = true;
            anyThreads = true;
          }
        }
        if (!anyThreads) return;
        var out = [];
        var emitted = Object.create(null);
        function emit(entry) {
          var id2 = entry.tr.id;
          if (emitted[id2]) return;
          emitted[id2] = true;
          out.push(entry);
          var kids = childrenOf[id2];
          if (kids) for (var ki = 0; ki < kids.length; ki++) emit(kids[ki]);
        }
        for (ti = 0; ti < eligible.length; ti++) {
          eid = eligible[ti].tr && eligible[ti].tr.id;
          if (eid && isChild[eid]) continue;
          emit(eligible[ti]);
        }
        for (ti = 0; ti < eligible.length; ti++) {
          if (!emitted[eligible[ti].tr.id]) emit(eligible[ti]);
        }
        eligible = out;
      })();
    }

    _xmark('phase1-read');
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

      // Per-row bucket override: swap fields/layouts when row's bucket
      // doesn't match the keepBuckets whitelist (e.g. cameras/readers),
      // or when it matches the overrideBuckets whitelist.
      var effectiveCfg = viewCfg;
      if (viewCfg.bucketOverride && viewCfg.bucketField) {
        var rowBucket = readBucketId(tr, viewCfg.bucketField);
        var keep = viewCfg.bucketOverride.keepBuckets || null;
        var only = viewCfg.bucketOverride.overrideBuckets || null;
        var applyOverride = false;
        if (rowBucket) {
          if (only) {
            applyOverride = only.indexOf(rowBucket) !== -1;
          } else if (keep) {
            applyOverride = keep.indexOf(rowBucket) === -1;
          }
        }
        if (applyOverride) {
          // Build a shallow copy with overridden fields/layouts
          effectiveCfg = {};
          for (var ck in viewCfg) {
            if (viewCfg.hasOwnProperty(ck)) effectiveCfg[ck] = viewCfg[ck];
          }
          effectiveCfg.fields = viewCfg.bucketOverride.fields;
          effectiveCfg.summaryLayout = viewCfg.bucketOverride.summaryLayout;
          effectiveCfg.detailLayout = viewCfg.bucketOverride.detailLayout;
          // Allow per-bucket override of stackedSummary so cam/reader rows
          // on a view whose main config is stacked can opt out (and vice versa).
          if (Object.prototype.hasOwnProperty.call(viewCfg.bucketOverride, 'stackedSummary')) {
            effectiveCfg.stackedSummary = viewCfg.bucketOverride.stackedSummary;
          }
          // If the main config has a label but the override doesn't,
          // flag the effective config so a spacer is inserted to keep alignment.
          if (viewCfg.fields.label && !effectiveCfg.fields.label) {
            effectiveCfg.labelPlaceholder = true;
          }
        }
      }
      // ── Lock all fields if field_2551 = Yes (row is finalized) ──
      // Uses a worksheet-specific class (P + '-td-locked') instead of
      // 'scw-cell-locked' to avoid picking up lock-fields.js CSS
      // (slategray background + "N/A" badge) that is meant for
      // individual cell locks, not whole-row finalization.
      var lockTd = tr.querySelector('td.field_2551');
      var isLocked = lockTd && /yes/i.test((lockTd.textContent || '').trim());
      if (isLocked) {
        var allTds = tr.querySelectorAll('td');
        for (var lk = 0; lk < allTds.length; lk++) {
          allTds[lk].classList.remove('cell-edit', 'ktlInlineEditableCellsStyle');
          allTds[lk].classList.add(P + '-td-locked');
        }
      }

      // (view_3505 product-lock-on-SOW-adopt removed with its v1 config —
      // worksheet-v2 survey card owns that lock now.)

      var card = buildWorksheetCard(tr, effectiveCfg);
      if (isLocked) {
        card.classList.add(P + '-locked');
        // Lock chip containers (radio chips for mounting height, exterior, etc.)
        var chipContainers = card.querySelectorAll('.' + P + '-radio-chips');
        for (var lci = 0; lci < chipContainers.length; lci++) {
          chipContainers[lci].classList.add(P + '-chips-locked');
        }
        // Lock chip stacks (boolean chip groups for exterior/plenum)
        var chipStacks = card.querySelectorAll('.scw-chip-stack, .' + P + '-chips');
        for (var lsi = 0; lsi < chipStacks.length; lsi++) {
          chipStacks[lsi].classList.add(P + '-chips-locked');
        }
        // Lock toggle chits (existing cabling)
        var chitHosts = card.querySelectorAll('[data-scw-cabling-src], .' + P + '-sum-chip-host');
        for (var lhi = 0; lhi < chitHosts.length; lhi++) {
          chitHosts[lhi].classList.add(P + '-chit-locked');
        }
        // Block Knack's native inline-edit popup modals on locked rows
        // but allow the toggle-zone (chevron + identity) so the detail panel still opens
        card.addEventListener('click', function (e) {
          if (e.target.closest('.' + P + '-toggle-zone')) return;
          var td = e.target.closest('td');
          if (td) {
            e.stopPropagation();
            e.preventDefault();
          }
        }, true); // capturing phase — fires before Knack's handlers
      }
      if (effectiveCfg !== viewCfg) {
        card.classList.add(P + '-bucket-override');
      }

      // Override descLabel for synthetic-group rows (no MDF/IDF assigned)
      if (entry.hasNoMove && entry.bucketCls && viewCfg.bucketRules) {
        var rules = viewCfg.bucketRules;
        for (var bk in rules) {
          if (rules.hasOwnProperty(bk) && rules[bk].rowClass === entry.bucketCls && rules[bk].descLabelWhenSynthetic) {
            var ldDesc = viewCfg.fields && viewCfg.fields.laborDescription;
            if (ldDesc) {
              var ldLabel = card.querySelector('[data-scw-fields="' + ldDesc.key + '"] > .' + P + '-sum-label');
              if (ldLabel) ldLabel.textContent = rules[bk].descLabelWhenSynthetic;
            }
            break;
          }
        }
      }

      var wsTr = document.createElement('tr');
      wsTr.className = WORKSHEET_ROW;
      wsTr.id = tr.id;
      // Stamp the source view id so direct-edit save can resolve the
      // right Knack view even after the wsTr is moved into another
      // container (e.g. bid-review\'s expand cell).
      wsTr.setAttribute('data-scw-view-id', viewCfg.viewId);
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

    // ── Reorder source <tr> elements by field_2218 sort value ──
    // Sort within each group section so group headers stay in place.
    if (pendingInserts.length > 1) {
      // Tag each insert with its group header ref before any DOM changes
      for (var gi = 0; gi < pendingInserts.length; gi++) {
        var src = pendingInserts[gi].sourceTr;
        var hdr = src.previousElementSibling;
        while (hdr && !hdr.classList.contains('kn-table-group')) {
          hdr = hdr.previousElementSibling;
        }
        pendingInserts[gi]._groupHdr = hdr || null; // null = no group (flat view)
        // Capture trailing photo row before detach
        var nxt = src.nextElementSibling;
        if (nxt && nxt.classList.contains('scw-inline-photo-row')) {
          pendingInserts[gi]._photoRow = nxt;
        }
      }

      // Detach all source rows (and their photo rows) from the DOM
      for (var di = 0; di < pendingInserts.length; di++) {
        if (pendingInserts[di]._photoRow) pendingInserts[di]._photoRow.parentNode.removeChild(pendingInserts[di]._photoRow);
        pendingInserts[di].sourceTr.parentNode.removeChild(pendingInserts[di].sourceTr);
      }

      // Re-insert in sorted order, grouped by their original group header.
      // For each insert, append after its group header (or at end of tbody for flat views).
      // Since pendingInserts is already sorted by field_2218 and we process in order,
      // rows within each group section end up in the correct sorted position.
      var _tbody = table.querySelector('tbody');
      for (var ri2 = 0; ri2 < pendingInserts.length; ri2++) {
        var _ins = pendingInserts[ri2];
        var _hdr = _ins._groupHdr;
        // Find the last data row already reinserted under this group header
        // (or the header itself) and insert after it.
        var insertAfter = _hdr || null;
        if (insertAfter) {
          var _sib = insertAfter.nextElementSibling;
          while (_sib && !_sib.classList.contains('kn-table-group')) {
            insertAfter = _sib;
            _sib = _sib.nextElementSibling;
          }
          insertAfter.parentNode.insertBefore(_ins.sourceTr, insertAfter.nextSibling);
        } else {
          _tbody.appendChild(_ins.sourceTr);
        }
        if (_ins._photoRow) {
          _ins.sourceTr.parentNode.insertBefore(_ins._photoRow, _ins.sourceTr.nextSibling);
        }
      }
    }

    _xmark('phase2-build');
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
        // are no actual uploaded photos (only placeholders / "+ Add" button).
        if (viewCfg.photoAlwaysVisible && !photoWrap.querySelector('.scw-inline-photo-card[data-photo-has-image="true"]')) {
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

      // Clean up any synthetic groups / dividers from a previous render
      // (model.fetch re-renders the view but our injected rows may survive)
      var staleGroups = tbody.querySelectorAll('tr.scw-synthetic-group, tr.scw-synth-divider');
      for (var si = 0; si < staleGroups.length; si++) staleGroups[si].remove();

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
      // and any orphaned non-worksheet rows directly beneath them.
      // Bucket rows (services/assumptions) and non-bucket rows alike
      // are left in place — the synthetic builder will relocate bucket
      // rows, and a later pass creates an "Unassigned" group for the rest.
      var nativeGroups = tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1');
      for (var gi = 0; gi < nativeGroups.length; gi++) {
        var grp = nativeGroups[gi];
        if (grp.classList.contains('scw-synthetic-group')) continue;
        var labelText = getGroupLabelText(grp);
        if (labelText.length === 0) {
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

      // Single full-tree scan for all worksheet rows that are eligible
      // for synthetic-bucket placement. Used by both the per-bucket
      // candidate filter below AND the orphan-collection pass further
      // down — caching saves one full tbody walk per bucket plus another
      // for the orphan pass (4+ scans → 1 on view_3610's 100-row grid).
      var allNoMove = Array.prototype.slice.call(
        tbody.querySelectorAll('tr.' + WORKSHEET_ROW + '[data-scw-no-move="1"]')
      );

      buckets.forEach(function (bucket) {
        // Find worksheet rows that belong to this bucket AND have no MDF/IDF.
        var candidates = allNoMove.filter(function (r) {
          return r.classList.contains(bucket.cls);
        });
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

        // Insert the group header at top or bottom of tbody
        if (viewCfg.syntheticGroupsPosition === 'bottom') {
          tbody.appendChild(groupTr);
        } else {
          var firstChild = tbody.firstChild;
          tbody.insertBefore(groupTr, firstChild);
        }

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

      // Collect orphaned non-bucket rows (regular line items with no
      // MDF/IDF) and place them under an "Unassigned" group header.
      var bucketClasses = {};
      for (var bi = 0; bi < buckets.length; bi++) {
        bucketClasses[buckets[bi].cls] = true;
      }
      // Reuse the cached allNoMove scan from above. Bucket rows have
      // already been claimed by their group; what's left here is
      // anything that has data-scw-no-move but doesn't match any
      // configured bucket class.
      var orphanRows = allNoMove.filter(function (oRow) {
        for (var bk in bucketClasses) {
          if (oRow.classList.contains(bk)) return false;
        }
        return true;
      });
      if (orphanRows.length) {
        anySyntheticBuilt = true;

        // Build "Unassigned" group header
        var unassignedTr = document.createElement('tr');
        unassignedTr.className = 'kn-table-group kn-group-level-1 scw-group-header scw-synthetic-group scw-unassigned-group';
        unassignedTr.style.cssText = '--scw-grp-accent: ' + SYNTH_ACCENT +
          '; --scw-grp-accent-rgb: ' + SYNTH_ACCENT_RGB + ';';
        var unassignedTd = document.createElement('td');
        unassignedTd.setAttribute('colspan', String(colSpan));
        unassignedTd.textContent = 'Unassigned';
        unassignedTr.appendChild(unassignedTd);

        // Position matches syntheticGroupsPosition: append to the bottom
        // of tbody when the view wants synthetic groups at the end,
        // otherwise prepend so Unassigned leads the synthetic section.
        if (viewCfg.syntheticGroupsPosition === 'bottom') {
          tbody.appendChild(unassignedTr);
        } else {
          tbody.insertBefore(unassignedTr, tbody.firstChild);
        }

        // Move orphan rows (and their associated orig/photo rows) under the header
        var oInsertRef = unassignedTr;
        for (var oj = 0; oj < orphanRows.length; oj++) {
          var oWs = orphanRows[oj];
          var oOrig = oWs.previousElementSibling;
          if (oOrig && oOrig.getAttribute(PROCESSED_ATTR) === '1') {
            oInsertRef.parentNode.insertBefore(oOrig, oInsertRef.nextSibling);
            oInsertRef = oOrig;
          }
          oInsertRef.parentNode.insertBefore(oWs, oInsertRef.nextSibling);
          oInsertRef = oWs;
          var oNxt = oWs.nextElementSibling;
          while (oNxt && oNxt.classList.contains('scw-inline-photo-row')) {
            var oPhoto = oNxt;
            oNxt = oNxt.nextElementSibling;
            oInsertRef.parentNode.insertBefore(oPhoto, oInsertRef.nextSibling);
            oInsertRef = oPhoto;
          }
        }
        lastInsertedRow = oInsertRef;
      }

      // ── Sort "Project Wide Assumptions" to the very END of the
      // table. Iteration order above (Services then Assumptions) plus
      // the Unassigned append leaves Assumptions sandwiched in the
      // middle of the synthetic section. Per UX request, Assumptions
      // should be the final group on the page — after MDF/IDFs,
      // Services, and Unassigned. Find the Assumptions synthetic
      // header by its label and re-append its entire row block to
      // the bottom of tbody, then update lastInsertedRow so the
      // divider lands below it.
      if (anySyntheticBuilt) {
        var assumpHeader = null;
        var synthHeaders = tbody.querySelectorAll(
          'tr.scw-synthetic-group:not(.scw-unassigned-group)'
        );
        for (var ai = 0; ai < synthHeaders.length; ai++) {
          var ahTd = synthHeaders[ai].querySelector('td');
          if (ahTd && ahTd.textContent.trim() === 'Project Wide Assumptions') {
            assumpHeader = synthHeaders[ai];
            break;
          }
        }
        if (assumpHeader) {
          var groupRows = [assumpHeader];
          var cur = assumpHeader.nextElementSibling;
          while (cur &&
                 !cur.classList.contains('kn-table-group') &&
                 !cur.classList.contains('scw-synth-divider')) {
            groupRows.push(cur);
            cur = cur.nextElementSibling;
          }
          for (var gr = 0; gr < groupRows.length; gr++) {
            tbody.appendChild(groupRows[gr]);
          }
          lastInsertedRow = groupRows[groupRows.length - 1];
        }
      }

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
    // Evict any persisted state from older bundle versions — accordion
    // state is now in-memory only so every fresh page load defaults to
    // collapsed.
    try { localStorage.removeItem(wsStorageKey(viewCfg.viewId)); } catch (e) {}

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
    _xmark('phase3-insert+synthetic');
    if (window.SCW && window.SCW.groupCollapse && window.SCW.groupCollapse.enhance) {
      window.SCW.groupCollapse.enhance();
    }
    _xmark('groupCollapse');

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
    _xmark('finalize+ready');
    if (_XF && _xmarks.length) {
      console.log('[SCW perf] transformView ' + viewCfg.viewId +
        ' phases: ' + _xmarks.join('  '));
    }
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
  // HIDE-DELETE SYNC (cross-view)
  // ============================================================

  /**
   * For views with hideDeleteWhenFieldNotBlank, hide the delete link
   * on each row where the specified field is not blank.
   * Called after any worksheet view transforms.
   */
  /**
   * Look up a field's <td> from a worksheet card — checks the original
   * Knack data row first, then falls back to the card / worksheet row.
   */
  function findFieldTd(card, fieldKey) {
    var tr = card.closest('tr');
    var td = null;
    var sel = 'td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]';
    if (tr) {
      // Check previous sibling (data row comes before ws-row in some views)
      var prev = tr.previousElementSibling;
      if (prev) td = prev.querySelector(sel);
      // Check next siblings (data row comes after ws-row + photo-row in other views)
      if (!td) {
        var next = tr.nextElementSibling;
        while (next) {
          if (next.classList.contains(P + '-row') || next.classList.contains('kn-table-group')) break;
          td = next.querySelector(sel);
          if (td) break;
          next = next.nextElementSibling;
        }
      }
      if (!td) td = tr.querySelector(sel);
    }
    if (!td) td = card.querySelector(sel);
    return td;
  }

  function syncDeleteVisibility() {
    WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
      var fieldKey = viewCfg.hideDeleteWhenFieldNotBlank || viewCfg.hideDeleteWhenCountGtZero;
      if (!fieldKey) return;
      var isCountCheck = !!viewCfg.hideDeleteWhenCountGtZero;

      var $view = $('#' + viewCfg.viewId);
      if (!$view.length) return;

      var cards = $view[0].querySelectorAll('.' + P + '-card');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var td = findFieldTd(card, fieldKey);
        var raw = td ? (td.textContent || '').replace(/[\u00a0\s]/g, '').trim() : '';
        var shouldHide = isCountCheck ? (parseFloat(raw) > 0) : !!raw;
        var del = card.querySelector('.' + P + '-sum-delete');
        if (del) {
          del.style.visibility = shouldHide ? 'hidden' : '';
        }
        // Restore the bulk-edit checkbox if a previous render had blocked
        // it. The per-row delete-link visibility above is sufficient
        // protection against accidental delete; KTL's "Delete Selected"
        // button is hidden separately at the view-config level on views
        // where bulk-delete is forbidden, so we don't need to disable
        // individual checkboxes (which also blocks Copy/Paste/Duplicate
        // — those are useful even on rows where delete is disallowed).
        var cbCell = card.querySelector('.' + P + '-sum-check');
        var cb = cbCell ? cbCell.querySelector('input[type="checkbox"]') : null;
        if (cb && cb.getAttribute('data-scw-bulk-blocked') === '1') {
          cb.disabled = false;
          cb.removeAttribute('data-scw-bulk-blocked');
          if (cbCell) {
            cbCell.style.visibility = '';
            cbCell.removeAttribute('title');
          }
        }
      }
    });
  }

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
          // Cloak the tbody the moment Knack re-renders so the empty
          // source-row shells aren't visible during the 150ms gap
          // before transformView runs. transformView's finally will
          // uncloak once the worksheet cards are built.
          cloakTbody(viewId);
          setTimeout(function () {
            transformView(viewCfg);
            syncDeleteVisibility();
            // KTL's hide/show toggle may not fire on SPA navigation,
            // leaving .ktlHideShowSection without inline display:block.
            // Backstop: if the section exists and has no display set, force it.
            var $viewEl = $('#' + viewId);
            var $section = $viewEl.find('.ktlHideShowSection').first();
            if ($section.length && !$section[0].style.display) {
              $section[0].style.display = 'block';
            }
          }, 150);
        });

      $(document)
        .off('knack-cell-update.' + viewId + EVENT_NS)
        .on('knack-cell-update.' + viewId + EVENT_NS, function (event, view, record) {
          // Capture expanded panel state BEFORE Knack re-renders.
          // transformView will restore it after rebuilding.
          captureExpandedState(viewId);

          // Patch the edited record's card in-place from the updated
          // record data Knack passes with the event — no extra API call.
          //
          // Skip the in-place patch if a transformView is currently
          // running for this view: the card may not exist yet (Phase 2
          // hasn't built it) and the patch would silently fail. The
          // transform's in-flight guard queues a retry that will rebuild
          // the card with fresh data anyway, so the edit lands either
          // way — just on a slightly delayed timeline (~150-300ms).
          //
          // NOTE: an earlier optimization (commit 39afb5e) also
          // CANCELED the queued transformView here under the assumption
          // that patchCardFromResponse fully covered single-row updates.
          // That was wrong — it broke rowSort (transformView is what
          // enforces the worksheet's intended sort order over Knack's
          // default) and card summaries (patchCardFromResponse covers a
          // subset of the fields the card displays). Reverted: every
          // cell-update still runs the full transformView from the
          // companion knack-view-render handler, and patchCardFromResponse
          // is purely a pre-render "instant feedback on the edited cell"
          // pass that the upcoming transformView will then override.
          if (record && record.id && !isTransformInFlight(viewId)) {
            patchCardFromResponse(viewId, record.id, record);
          }
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
  window.SCW.syncKnackModel = syncKnackModel;
  window.SCW.deviceWorksheet = {
    /** Per-view configs — read by device-worksheet-sort.js to discover
     *  which views opt into the sort-preset dropdown. */
    _configs: WORKSHEET_CONFIG.views,
    /** Capture expanded panel state for all worksheet views. */
    captureState: captureAllExpandedStates,
    /** Force re-transform a view (idempotent). */
    refresh: function (viewId) {
      WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
        if (!viewId || viewCfg.viewId === viewId) {
          transformView(viewCfg);
        }
      });
    },
    /** Silent in-place patch of a single worksheet card.
     *  opts.skipFocused — don't clobber inputs that currently have focus.
     *  Used by silent-poll-view-3505 to reflect webhook-driven record
     *  updates without re-rendering the view. */
    patchCard: patchCardFromResponse,
    /** True while transformView is mid-pass on the given view. Other
     *  per-row scanners (lock-fields, conditional-grayout, mdf-summary,
     *  group-collapse, etc.) consult this to skip their own MutationObserver
     *  re-passes during the burst — transformView's mutations would
     *  otherwise re-fire their observers 150ms after they've already
     *  applied. */
    isTransforming: isTransformInFlight,
    /** True while transformView is mid-pass on ANY view. Use this from
     *  scene-wide observers (e.g. group-collapse's tbody MO) that don't
     *  know which view triggered the mutation. */
    isAnyTransforming: function () {
      for (var k in _transformState) {
        if (_transformState[k] && _transformState[k].inFlight) return true;
      }
      return false;
    }
  };
})();
// ============================================================
// End Device Worksheet
// ============================================================
