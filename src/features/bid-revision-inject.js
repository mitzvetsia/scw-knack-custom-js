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
    /** Rich-text field holding pre-built HTML card from change request */
    changeHtmlField: 'field_2695',
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

      /* Revision detail strip — lives INSIDE .scw-ws-detail */
      '.' + STRIP_CLS + ' {',
      '  margin: 8px 12px 4px; padding: 10px 14px;',
      '  background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;',
      '  font-size: 12px; color: #78350f;',
      '}',
      '.' + P + '-strip-header {',
      '  font-weight: 700; font-size: 11px; text-transform: uppercase;',
      '  letter-spacing: .04em; color: #92400e; margin-bottom: 6px;',
      '}',
      '.' + P + '-item {',
      '  padding: 6px 0; border-bottom: 1px dashed #fde68a;',
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

      /* ── Action buttons (Approve / Reject) ── */
      '.' + P + '-actions {',
      '  display: flex; gap: 8px; margin-top: 8px;',
      '}',
      '.' + P + '-btn {',
      '  padding: 4px 14px; border-radius: 4px; border: none;',
      '  font-size: 12px; font-weight: 600; cursor: pointer;',
      '}',
      '.' + P + '-btn--approve {',
      '  background: #16a34a; color: #fff;',
      '}',
      '.' + P + '-btn--approve:hover { background: #15803d; }',
      '.' + P + '-btn--reject {',
      '  background: #dc2626; color: #fff;',
      '}',
      '.' + P + '-btn--reject:hover { background: #b91c1c; }',
      '.' + P + '-btn:disabled {',
      '  opacity: 0.5; cursor: not-allowed;',
      '}',

      /* ── Reject notes input ── */
      '.' + P + '-reject-wrap {',
      '  display: none; margin-top: 6px;',
      '}',
      '.' + P + '-reject-wrap.is-open { display: block; }',
      '.' + P + '-reject-input {',
      '  width: 100%; padding: 6px 8px; font-size: 12px;',
      '  border: 1px solid #fca5a5; border-radius: 4px;',
      '  box-sizing: border-box;',
      '}',
      '.' + P + '-reject-input:focus { outline: none; border-color: #dc2626; }',
      '.' + P + '-reject-confirm {',
      '  margin-top: 4px; padding: 3px 12px; border-radius: 4px;',
      '  border: none; background: #dc2626; color: #fff;',
      '  font-size: 11px; font-weight: 600; cursor: pointer;',
      '}',
      '.' + P + '-reject-confirm:hover { background: #b91c1c; }',
      '.' + P + '-reject-error {',
      '  color: #dc2626; font-size: 11px; margin-top: 2px;',
      '}',

      /* ── Orphaned add-request section at top of view ── */
      '.' + P + '-orphan-section {',
      '  margin: 0 0 16px; padding: 12px 14px;',
      '  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;',
      '}',
      '.' + P + '-orphan-header {',
      '  font-weight: 700; font-size: 13px; text-transform: uppercase;',
      '  letter-spacing: .04em; color: #166534; margin-bottom: 10px;',
      '  display: flex; align-items: center; gap: 6px;',
      '}',
      '.' + P + '-orphan-header::before {',
      '  content: "+"; display: inline-flex; align-items: center;',
      '  justify-content: center; width: 20px; height: 20px;',
      '  border-radius: 50%; background: #16a34a; color: #fff;',
      '  font-size: 14px; font-weight: 700;',
      '}',
      '.' + P + '-orphan-card {',
      '  padding: 8px 0; border-bottom: 1px solid #dcfce7;',
      '}',
      '.' + P + '-orphan-card:last-child { border-bottom: none; }',
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
    // Fallback: parse connection HTML — look for 24-char hex in class attr
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
   * Build a revision entry from a raw record.
   */
  function buildRevEntry(rec) {
    var changeHtml = rec[CFG.changeHtmlField] || '';
    if (typeof changeHtml === 'string') changeHtml = changeHtml.trim();

    var changes = [];
    if (!changeHtml) {
      var fKeys = Object.keys(CFG.fields);
      for (var fi = 0; fi < fKeys.length; fi++) {
        var fd = CFG.fields[fKeys[fi]];
        var val = stripHtml(rec[fd.key] || '');
        if (!val || val === '&nbsp;' || val === '\u00a0') continue;
        if (fKeys[fi] === 'existing' || fKeys[fi] === 'exterior' || fKeys[fi] === 'plenum') {
          if (/^no$/i.test(val)) continue;
        }
        changes.push({ label: fd.label, value: val });
      }
    }

    var editHref = '';
    var domRow = document.getElementById(rec.id);
    if (domRow) {
      var link = domRow.querySelector('a.kn-link-page');
      if (link) editHref = link.getAttribute('href') || '';
    }

    return { id: rec.id, editHref: editHref, changeHtml: changeHtml, changes: changes };
  }

  /**
   * Read revision records from view_3782's Knack model.
   * Returns { map: surveyItemId → [entry], orphaned: [entry] }
   * Orphaned = records with no survey item connection (e.g. Add requests).
   */
  function buildRevisionMap() {
    var model   = findModel(CFG.revisionView);
    var records = extractRecords(model);
    console.log('[BidRevInject] Model records:', records.length);

    if (!records.length) {
      records = scrapeFromDom();
      console.log('[BidRevInject] DOM-scraped records:', records.length);
    }

    var map = {};
    var orphaned = [];
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var siId = getSurveyItemId(rec);
      var entry = buildRevEntry(rec);

      if (!siId) {
        // No survey item connection — orphaned add request
        orphaned.push(entry);
        continue;
      }

      if (!map[siId]) map[siId] = [];
      map[siId].push(entry);
    }
    console.log('[BidRevInject] Revision map:', Object.keys(map).length,
                'matched,', orphaned.length, 'orphaned');
    return { map: map, orphaned: orphaned };
  }

  /**
   * Fallback: scrape records from the view_3782 DOM table.
   * Works even when view_3782 is display:none — elements still exist in DOM.
   */
  function scrapeFromDom() {
    var table = document.querySelector('#' + CFG.revisionView + ' table.kn-table-table');
    if (!table) { console.log('[BidRevInject] No DOM table for', CFG.revisionView); return []; }
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
      // Extract pre-built HTML field (rich text — keep innerHTML)
      var htmlCell = tr.querySelector('td.' + CFG.changeHtmlField);
      if (htmlCell) rec[CFG.changeHtmlField] = htmlCell.innerHTML.trim();
      records.push(rec);
    }
    return records;
  }

  // ── DOM INJECTION ───────────────────────────────────────

  /**
   * Find the worksheet card wrapper for a given record ID in the target view.
   * The device-worksheet transform puts the record ID on the scw-ws-row <tr>
   * itself (not the original data <tr>).  The card lives inside that row.
   * Uses attribute selector because Knack IDs start with digits (invalid for #).
   */
  function findCardForRecord(viewEl, recordId) {
    var wsTr = viewEl.querySelector('tr.scw-ws-row[id="' + recordId + '"]');
    if (!wsTr) return null;
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
   * Build Approve / Reject action buttons for a single revision.
   */
  function buildActionButtons(revisionId) {
    var wrap = document.createElement('div');

    var actions = document.createElement('div');
    actions.className = P + '-actions';

    var approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.className = P + '-btn ' + P + '-btn--approve';
    approveBtn.textContent = 'Approve';
    approveBtn.setAttribute('data-rev-id', revisionId);

    var rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = P + '-btn ' + P + '-btn--reject';
    rejectBtn.textContent = 'Reject';
    rejectBtn.setAttribute('data-rev-id', revisionId);

    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
    wrap.appendChild(actions);

    // Reject notes — hidden until Reject is clicked
    var rejectWrap = document.createElement('div');
    rejectWrap.className = P + '-reject-wrap';

    var input = document.createElement('textarea');
    input.className = P + '-reject-input';
    input.placeholder = 'Reason for rejection (required)\u2026';
    input.rows = 2;
    rejectWrap.appendChild(input);

    var errorMsg = document.createElement('div');
    errorMsg.className = P + '-reject-error';
    rejectWrap.appendChild(errorMsg);

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = P + '-reject-confirm';
    confirmBtn.textContent = 'Confirm Rejection';
    rejectWrap.appendChild(confirmBtn);

    wrap.appendChild(rejectWrap);

    // ── Approve handler ──
    approveBtn.addEventListener('click', function () {
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      submitRevisionAction(revisionId, 'approve', '', wrap);
    });

    // ── Reject handler — toggle notes input ──
    rejectBtn.addEventListener('click', function () {
      rejectWrap.classList.toggle('is-open');
      if (rejectWrap.classList.contains('is-open')) {
        input.focus();
      }
    });

    // ── Confirm rejection ──
    confirmBtn.addEventListener('click', function () {
      var reason = input.value.trim();
      if (!reason) {
        errorMsg.textContent = 'A reason is required to reject.';
        input.focus();
        return;
      }
      errorMsg.textContent = '';
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      confirmBtn.disabled = true;
      submitRevisionAction(revisionId, 'reject', reason, wrap);
    });

    return wrap;
  }

  /**
   * Submit an approve/reject action for a revision record.
   */
  function submitRevisionAction(revisionId, action, reason, wrapEl) {
    var payload = {
      actionType:  'revision_' + action,
      revisionId:  revisionId,
      timestamp:   new Date().toISOString(),
    };
    if (reason) payload.reason = reason;

    console.log('[BidRevInject] Submitting', action, 'for', revisionId, payload);

    // Post to the same change-request webhook
    var webhookUrl = (window.SCW && window.SCW.bidReview && window.SCW.bidReview.CONFIG)
                   ? window.SCW.bidReview.CONFIG.changeRequestWebhook
                   : '';
    if (!webhookUrl) {
      console.error('[BidRevInject] No webhook URL configured');
      return;
    }

    SCW.knackAjax({
      url:  webhookUrl,
      type: 'POST',
      data: JSON.stringify(payload),
      success: function () {
        console.log('[BidRevInject]', action, 'success for', revisionId);
        // Replace buttons with status indicator
        var badge = document.createElement('div');
        badge.style.cssText = 'padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;display:inline-block;margin-top:6px;';
        if (action === 'approve') {
          badge.style.background = '#dcfce7';
          badge.style.color = '#166534';
          badge.textContent = '\u2713 Approved';
        } else {
          badge.style.background = '#fee2e2';
          badge.style.color = '#991b1b';
          badge.textContent = '\u2717 Rejected' + (reason ? ': ' + reason : '');
        }
        wrapEl.innerHTML = '';
        wrapEl.appendChild(badge);
      },
      error: function (xhr) {
        console.error('[BidRevInject]', action, 'failed for', revisionId, xhr.status);
        // Re-enable buttons
        var btns = wrapEl.querySelectorAll('button');
        for (var bi = 0; bi < btns.length; bi++) btns[bi].disabled = false;
        var err = wrapEl.querySelector('.' + P + '-reject-error');
        if (err) err.textContent = 'Failed to submit \u2014 please try again.';
      },
    });
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

      if (rev.changeHtml) {
        // Pre-built HTML card from change request payload
        var htmlWrap = document.createElement('div');
        htmlWrap.className = P + '-html-card';
        htmlWrap.innerHTML = rev.changeHtml;
        item.appendChild(htmlWrap);
      } else {
        // Fallback: tag-based rendering for older records
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
      }

      if (rev.editHref) {
        var link = document.createElement('a');
        link.className = P + '-edit-link';
        link.href = rev.editHref;
        link.textContent = 'Edit';
        item.appendChild(link);
      }

      // ── Approve / Reject buttons ──
      item.appendChild(buildActionButtons(rev.id));

      strip.appendChild(item);
    }
    return strip;
  }

  /**
   * Main injection: for each target view, match revision records to rows
   * and inject badge + detail strip.
   */
  /**
   * Build a standalone orphan card for an add request with no matching
   * survey item in view_3505.
   */
  function makeOrphanCard(rev) {
    var card = document.createElement('div');
    card.className = P + '-orphan-card';

    if (rev.changeHtml) {
      var htmlWrap = document.createElement('div');
      htmlWrap.className = P + '-html-card';
      htmlWrap.innerHTML = rev.changeHtml;
      card.appendChild(htmlWrap);
    } else {
      // Fallback: tag-based
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
        empty.textContent = '(no details)';
        row.appendChild(empty);
      }
      card.appendChild(row);
    }

    if (rev.editHref) {
      var link = document.createElement('a');
      link.className = P + '-edit-link';
      link.href = rev.editHref;
      link.textContent = 'Edit';
      card.appendChild(link);
    }

    card.appendChild(buildActionButtons(rev.id));
    return card;
  }

  /**
   * Render orphaned add requests as a banner at the top of the view.
   */
  function renderOrphanSection(viewEl, orphans) {
    // Remove any existing orphan section
    var existing = viewEl.querySelector('.' + P + '-orphan-section');
    if (existing) existing.remove();

    if (!orphans.length) return;

    var section = document.createElement('div');
    section.className = P + '-orphan-section';

    var header = document.createElement('div');
    header.className = P + '-orphan-header';
    header.textContent = 'Add Requests (' + orphans.length + ')';
    section.appendChild(header);

    for (var i = 0; i < orphans.length; i++) {
      section.appendChild(makeOrphanCard(orphans[i]));
    }

    // Insert at the very top of the view, before the table
    var table = viewEl.querySelector('table') || viewEl.firstChild;
    if (table) {
      viewEl.insertBefore(section, table);
    } else {
      viewEl.appendChild(section);
    }

    console.log('[BidRevInject] Rendered', orphans.length, 'orphaned add requests');
  }

  function inject(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) { console.log('[BidRevInject] View element not found:', viewId); return; }

    // Verify the device-worksheet transform has run
    var wsRows = viewEl.querySelectorAll('tr.scw-ws-row');
    if (!wsRows.length) {
      console.log('[BidRevInject] No scw-ws-row found in', viewId, '— transform may not have run yet, retrying in 500ms');
      setTimeout(function () { inject(viewId); }, 500);
      return;
    }

    var result = buildRevisionMap();
    var revMap = result.map;
    var orphaned = result.orphaned;
    var siIds = Object.keys(revMap);
    if (!siIds.length && !orphaned.length) {
      console.log('[BidRevInject] No revisions to inject');
      return;
    }

    var injected = 0;
    for (var i = 0; i < siIds.length; i++) {
      var siId = siIds[i];
      var card = findCardForRecord(viewEl, siId);
      if (!card) {
        // No matching row in view_3505 — treat as orphaned add
        var unmatched = revMap[siId];
        for (var ui = 0; ui < unmatched.length; ui++) orphaned.push(unmatched[ui]);
        continue;
      }
      if (card.getAttribute(INJECTED)) continue;
      card.setAttribute(INJECTED, '1');

      var revisions = revMap[siId];

      // Badge → append to the identity / product area in the summary
      var identity = card.querySelector('.scw-ws-identity');
      if (identity) {
        identity.appendChild(makeBadge(revisions.length));
      }

      // Revision strip → inside the detail panel (visible when expanded)
      var detail = card.querySelector('.scw-ws-detail');
      if (detail) {
        detail.appendChild(makeStrip(revisions));
      } else {
        var photoWrap = card.querySelector('.scw-ws-photo-wrap');
        if (photoWrap) {
          card.insertBefore(makeStrip(revisions), photoWrap);
        } else {
          card.appendChild(makeStrip(revisions));
        }
      }
      injected++;
    }
    console.log('[BidRevInject] Injected revisions onto', injected, 'cards,',
                orphaned.length, 'orphaned adds');

    // Render orphaned add requests at the top of the view
    renderOrphanSection(viewEl, orphaned);
  }

  // ── EVENT BINDING ───────────────────────────────────────

  injectStyles();

  // We need both view_3782 and view_3505 to have rendered.
  // Track readiness and inject when both are available.
  var _ready = {};

  function onViewReady(viewId) {
    _ready[viewId] = true;
    console.log('[BidRevInject] View ready:', viewId, '| all ready:', JSON.stringify(_ready));
    // Only inject once the revision view AND at least one target have rendered
    if (!_ready[CFG.revisionView]) return;
    for (var i = 0; i < CFG.targetViews.length; i++) {
      if (_ready[CFG.targetViews[i]]) {
        // Delay to let device-worksheet finish its 150ms transform
        setTimeout(function (tid) { inject(tid); }, 350, CFG.targetViews[i]);
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
        setTimeout(function () { inject(tv); }, 400);
      });
    })(CFG.targetViews[ti2]);
  }

  // Reset on scene change
  $(document).off('knack-scene-render.any' + EVENT_NS)
             .on('knack-scene-render.any' + EVENT_NS, function () {
    _ready = {};
  });

})();
