/*** BID REVISION INJECTION — view_3782 → view_3505 ***/
/**
 * Reads bid-revision line items from view_3782 and injects a compact
 * "revision badge + detail strip" onto matching survey-item rows in
 * view_3505 (the device worksheet).
 *
 * view_3782 is on the same scene as view_3505; we hide it visually and
 * treat it purely as a data source.
 *
 * Join key: field_2644 (connection from revision record → survey item).
 */
(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────

  var CFG = {
    revisionView: 'view_3782',
    targetViews:  ['view_3505'],
    /** field_2644 — connection to the survey line item */
    surveyItemField: 'field_2644',
    /** Fields to display in the revision detail strip */
    fields: {
      status:     { key: 'field_2645', label: 'Status' },
      connDev:    { key: 'field_2646', label: 'Connected Devices' },
      connTo:     { key: 'field_2647', label: 'Connected To' },
      subBid:     { key: 'field_2648', label: 'Sub Bid' },
      laborDesc:  { key: 'field_2649', label: 'Labor Desc' },
      existing:   { key: 'field_2650', label: 'Existing' },
      exterior:   { key: 'field_2651', label: 'Exterior' },
      plenum:     { key: 'field_2652', label: 'Plenum' },
      other:      { key: 'field_2653', label: 'Other' },
    },
  };

  var STYLE_ID   = 'scw-bid-revision-inject-css';
  var BADGE_CLS  = 'scw-revision-badge';
  var STRIP_CLS  = 'scw-revision-strip';
  var INJECTED   = 'data-scw-rev-injected';
  var EVENT_NS   = '.scwBidRevInject';
  var P          = 'scw-rev';

  // ── CSS ─────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* Hide the source view entirely */
      '#' + CFG.revisionView + ' { display: none !important; }',

      /* Badge on the summary row */
      '.' + BADGE_CLS + ' {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 2px 8px; border-radius: 10px;',
      '  background: #fef3c7; color: #92400e;',
      '  font-size: 11px; font-weight: 600;',
      '  cursor: default; white-space: nowrap;',
      '  margin-left: 6px; vertical-align: middle;',
      '}',
      '.' + BADGE_CLS + '::before {',
      '  content: "\\f0e2"; font-family: FontAwesome;',
      '  font-size: 10px; font-weight: 400;',
      '}',

      /* Revision detail strip — lives inside the card, below the detail panel */
      '.' + STRIP_CLS + ' {',
      '  margin: 0; padding: 8px 12px;',
      '  background: #fffbeb; border-top: 1px solid #fde68a;',
      '  font-size: 12px; color: #78350f;',
      '}',
      '.' + P + '-strip-header {',
      '  font-weight: 700; font-size: 11px; text-transform: uppercase;',
      '  letter-spacing: .04em; color: #92400e; margin-bottom: 6px;',
      '}',
      '.' + P + '-item {',
      '  padding: 4px 0; border-bottom: 1px dashed #fde68a;',
      '}',
      '.' + P + '-item:last-child { border-bottom: none; }',
      '.' + P + '-row {',
      '  display: flex; flex-wrap: wrap; gap: 4px 12px;',
      '}',
      '.' + P + '-tag {',
      '  display: inline-block; padding: 1px 6px; border-radius: 3px;',
      '  background: #fef9c3; font-size: 11px; white-space: nowrap;',
      '}',
      '.' + P + '-tag-label {',
      '  font-weight: 600; margin-right: 3px;',
      '}',
      '.' + P + '-edit-link {',
      '  font-size: 11px; color: #b45309; text-decoration: underline;',
      '  cursor: pointer; margin-left: 6px;',
      '}',
      '.' + P + '-edit-link:hover { color: #92400e; }',
    ].join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── DATA EXTRACTION ─────────────────────────────────────

  /**
   * Try to find the Knack model for a view.
   */
  function findModel(viewKey) {
    if (typeof Knack === 'undefined' || !Knack.models) return null;
    var keys = Object.keys(Knack.models);
    for (var i = 0; i < keys.length; i++) {
      var m = Knack.models[keys[i]];
      if (m && m.view && m.view.key === viewKey) return m;
    }
    return null;
  }

  /**
   * Extract records from a Knack model.
   */
  function extractRecords(model) {
    if (!model) return [];
    if (model.data) {
      if (Array.isArray(model.data)) return model.data;
      if (typeof model.data.toJSON === 'function') return model.data.toJSON();
      if (model.data.models && Array.isArray(model.data.models)) {
        return model.data.models.map(function (m) {
          return typeof m.toJSON === 'function' ? m.toJSON() : m.attributes || m;
        });
      }
    }
    return [];
  }

  /**
   * Extract the survey-item record ID from a revision record's field_2644.
   * Tries _raw first (array of {id, identifier}), then parses the HTML string.
   */
  function getSurveyItemId(record) {
    var raw = record[CFG.surveyItemField + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0].id) return raw[0].id;
    // Fallback: parse connection HTML
    var html = record[CFG.surveyItemField];
    if (typeof html === 'string') {
      var m = html.match(/class="([0-9a-f]{24})"/i);
      if (m) return m[1];
    }
    return null;
  }

  /**
   * Strip HTML tags from a value.
   */
  function stripHtml(v) {
    if (typeof v !== 'string') return String(v == null ? '' : v);
    return v.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Read revision records from view_3782's Knack model.
   * Returns a map: surveyItemId → [{ id, editHref, changes: [{label, value}] }]
   */
  function buildRevisionMap() {
    var model   = findModel(CFG.revisionView);
    var records = extractRecords(model);

    // Fallback: scrape from DOM if model is empty
    if (!records.length) {
      records = scrapeFromDom();
    }

    var map = {};
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var siId = getSurveyItemId(rec);
      if (!siId) continue;

      // Build change summary
      var changes = [];
      var fKeys = Object.keys(CFG.fields);
      for (var fi = 0; fi < fKeys.length; fi++) {
        var fd = CFG.fields[fKeys[fi]];
        var val = stripHtml(rec[fd.key] || '');
        if (!val || val === '&nbsp;' || val === '\u00a0') continue;
        // Skip Yes/No flags that are "No" (no change)
        if (fKeys[fi] === 'existing' || fKeys[fi] === 'exterior' || fKeys[fi] === 'plenum') {
          if (/^no$/i.test(val)) continue;
        }
        changes.push({ label: fd.label, value: val });
      }

      // Extract edit href from DOM row if available
      var editHref = '';
      var domRow = document.getElementById(rec.id);
      if (domRow) {
        var link = domRow.querySelector('a.kn-link-page');
        if (link) editHref = link.getAttribute('href') || '';
      }

      if (!map[siId]) map[siId] = [];
      map[siId].push({ id: rec.id, editHref: editHref, changes: changes });
    }
    return map;
  }

  /**
   * Fallback: scrape records from the view_3782 DOM table.
   */
  function scrapeFromDom() {
    var table = document.querySelector('#' + CFG.revisionView + ' table.kn-table-table');
    if (!table) return [];
    var rows = table.querySelectorAll('tbody > tr');
    var records = [];
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (!tr.id) continue;
      var rec = { id: tr.id };
      // Extract field_2644 (survey item connection)
      var siCell = tr.querySelector('td.' + CFG.surveyItemField);
      if (siCell) {
        var span = siCell.querySelector('span[data-kn="connection-value"]');
        if (span) {
          rec[CFG.surveyItemField + '_raw'] = [{ id: span.className.trim(), identifier: span.textContent.trim() }];
        }
      }
      // Extract each data field
      var fKeys = Object.keys(CFG.fields);
      for (var fi = 0; fi < fKeys.length; fi++) {
        var fd = CFG.fields[fKeys[fi]];
        var cell = tr.querySelector('td.' + fd.key);
        if (cell) rec[fd.key] = cell.textContent.trim();
      }
      records.push(rec);
    }
    return records;
  }

  // ── DOM INJECTION ───────────────────────────────────────

  /**
   * Find the worksheet card wrapper for a given record ID in the target view.
   * The original <tr> has id=recordId; the worksheet row (scw-ws-row) follows it.
   */
  function findCardForRecord(viewEl, recordId) {
    var origTr = viewEl.querySelector('tr#' + recordId);
    if (!origTr) return null;
    var wsTr = origTr.nextElementSibling;
    if (!wsTr || !wsTr.classList.contains('scw-ws-row')) return null;
    return wsTr.querySelector('.scw-ws-card') || null;
  }

  /**
   * Build the badge element: "N revision(s)"
   */
  function makeBadge(count) {
    var badge = document.createElement('span');
    badge.className = BADGE_CLS;
    badge.textContent = count + ' revision' + (count !== 1 ? 's' : '');
    return badge;
  }

  /**
   * Build the revision detail strip for one survey item's revisions.
   */
  function makeStrip(revisions) {
    var strip = document.createElement('div');
    strip.className = STRIP_CLS;

    var header = document.createElement('div');
    header.className = P + '-strip-header';
    header.textContent = 'Bid Revisions (' + revisions.length + ')';
    strip.appendChild(header);

    for (var i = 0; i < revisions.length; i++) {
      var rev = revisions[i];
      var item = document.createElement('div');
      item.className = P + '-item';

      var row = document.createElement('div');
      row.className = P + '-row';

      for (var ci = 0; ci < rev.changes.length; ci++) {
        var ch = rev.changes[ci];
        var tag = document.createElement('span');
        tag.className = P + '-tag';
        var lbl = document.createElement('span');
        lbl.className = P + '-tag-label';
        lbl.textContent = ch.label + ':';
        tag.appendChild(lbl);
        tag.appendChild(document.createTextNode(' ' + ch.value));
        row.appendChild(tag);
      }

      if (!rev.changes.length) {
        var empty = document.createElement('span');
        empty.className = P + '-tag';
        empty.textContent = '(no field changes)';
        row.appendChild(empty);
      }

      item.appendChild(row);

      if (rev.editHref) {
        var link = document.createElement('a');
        link.className = P + '-edit-link';
        link.href = rev.editHref;
        link.textContent = 'Edit';
        item.appendChild(link);
      }

      strip.appendChild(item);
    }
    return strip;
  }

  /**
   * Main injection: for each target view, match revision records to rows
   * and inject badge + detail strip.
   */
  function inject(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    var revMap = buildRevisionMap();
    var siIds = Object.keys(revMap);
    if (!siIds.length) return;

    for (var i = 0; i < siIds.length; i++) {
      var siId = siIds[i];
      var card = findCardForRecord(viewEl, siId);
      if (!card) continue;
      if (card.getAttribute(INJECTED)) continue;
      card.setAttribute(INJECTED, '1');

      var revisions = revMap[siId];

      // Badge → append to the identity / product area in the summary
      var identity = card.querySelector('.scw-ws-identity');
      if (identity) {
        identity.appendChild(makeBadge(revisions.length));
      }

      // Detail strip → append at the end of the card (after detail, before photos)
      var photoWrap = card.querySelector('.scw-ws-photo-wrap');
      if (photoWrap) {
        card.insertBefore(makeStrip(revisions), photoWrap);
      } else {
        card.appendChild(makeStrip(revisions));
      }
    }
  }

  // ── EVENT BINDING ───────────────────────────────────────

  injectStyles();

  // We need both view_3782 and view_3505 to have rendered.
  // Track readiness and inject when both are available.
  var _ready = {};

  function onViewReady(viewId) {
    _ready[viewId] = true;
    // Only inject once the revision view AND at least one target have rendered
    if (!_ready[CFG.revisionView]) return;
    for (var i = 0; i < CFG.targetViews.length; i++) {
      if (_ready[CFG.targetViews[i]]) {
        // Small delay to let device-worksheet finish its transform
        setTimeout(function (tid) { inject(tid); }, 200, CFG.targetViews[i]);
      }
    }
  }

  // Bind revision view render
  $(document).off('knack-view-render.' + CFG.revisionView + EVENT_NS)
             .on('knack-view-render.' + CFG.revisionView + EVENT_NS, function () {
    onViewReady(CFG.revisionView);
  });

  // Bind each target view render
  for (var ti = 0; ti < CFG.targetViews.length; ti++) {
    (function (tv) {
      $(document).off('knack-view-render.' + tv + EVENT_NS)
                 .on('knack-view-render.' + tv + EVENT_NS, function () {
        onViewReady(tv);
      });
    })(CFG.targetViews[ti]);
  }

  // Also re-inject after inline edits / re-renders on target views
  for (var ti2 = 0; ti2 < CFG.targetViews.length; ti2++) {
    (function (tv) {
      $(document).off('knack-cell-update.' + tv + EVENT_NS)
                 .on('knack-cell-update.' + tv + EVENT_NS, function () {
        // Clear injected flags so we re-inject
        var cards = document.querySelectorAll('#' + tv + ' [' + INJECTED + ']');
        for (var ci = 0; ci < cards.length; ci++) cards[ci].removeAttribute(INJECTED);
        setTimeout(function () { inject(tv); }, 300);
      });
    })(CFG.targetViews[ti2]);
  }

  // Reset on scene change
  $(document).off('knack-scene-render.any' + EVENT_NS)
             .on('knack-scene-render.any' + EVENT_NS, function () {
    _ready = {};
  });

})();
