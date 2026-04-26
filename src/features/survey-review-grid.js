/*** FEATURE: Survey Review Comparison Grid (scene_1303) **********************
 *
 * Side-by-side comparison of survey deliverables across all subs who
 * surveyed a single SOW. Mirrors the bid-review grid shape:
 *
 *   - Rows: unique SOW Line Items across all surveys, grouped by MDF/IDF
 *   - Columns: Survey Requests (one per sub)
 *   - Cells: photos count + notes preview from that sub's coverage of
 *            that SOW Line Item (or "—" if the sub didn't survey it)
 *
 * Top of each column: subcontractor identity, submitted date, QA-status
 * badge, and a Mark Reviewed button. "Reviewed" is decorate-only — it
 * doesn't gate any other view (per design discussion: surveys with
 * unreviewed deliverables still appear on the Bids comparison page,
 * just flagged with a `⚠ Survey not reviewed` badge there).
 *
 * Mount: kn-scene_1303
 * Sources:
 *   - view_3890 (Survey Requests) → column headers
 *   - view_3889 (Survey Line Items) → cell data, indexed by
 *     field_2404 (SOW Line Item) × field_2360 (Survey Request)
 *
 * Mark Reviewed: PUT field_2743=Yes, field_2744=current user,
 * field_2745=now against view_3890 record. Column transitions to
 * reviewed state in place; no page reload.
 ******************************************************************************/
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────
  var SCENE_ID                  = 'scene_1303';
  var SURVEY_REQUESTS_VIEW      = 'view_3890';
  var SURVEY_LINE_ITEMS_VIEW    = 'view_3889';

  // Survey Request fields (column header data)
  var FIELD_SUB                 = 'field_2347'; // subcontractor connection
  var FIELD_SUBMITTED           = 'field_2354'; // submitted date
  var FIELD_QA_REVIEWED         = 'field_2743'; // Yes/No flag
  var FIELD_QA_REVIEWED_BY      = 'field_2744'; // user connection
  var FIELD_QA_REVIEWED_AT      = 'field_2745'; // timestamp

  // Survey Line Item fields (cell data + axes)
  var FIELD_SOW_LI              = 'field_2404'; // ROW pivot — connection to SOW Line Item
  var FIELD_SURVEY              = 'field_2360'; // COLUMN pivot — connection to Survey Request
  var FIELD_MDF_IDF             = 'field_2375'; // grouping field
  var FIELD_PHOTOS              = 'field_2697'; // file-array of photos
  var FIELD_NOTES               = 'field_2412'; // long-text per-item observations

  var GRID_CONTAINER_ID         = 'scw-survey-review-grid';
  var STYLE_ID                  = 'scw-survey-review-grid-css';
  var EVENT_NS                  = '.scwSurveyReview';
  var NOTES_PREVIEW_LEN         = 80;
  var BUILD_DEBOUNCE_MS         = 150;

  // ── Styles ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + GRID_CONTAINER_ID + ' {',
      '  margin: 16px 0;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
      '  color: #1f2937;',
      '}',
      '.scw-srv-status {',
      '  margin-bottom: 14px;',
      '  font-size: 13px;',
      '  color: #4b5563;',
      '  font-weight: 500;',
      '}',
      '.scw-srv-status strong { color: #1f2937; font-weight: 700; }',
      '.scw-srv-empty {',
      '  padding: 32px 20px;',
      '  text-align: center;',
      '  color: #6b7280;',
      '  background: #f9fafb;',
      '  border-radius: 8px;',
      '  border: 1px dashed #d1d5db;',
      '}',
      '.scw-srv-table-wrap {',
      '  overflow-x: auto;',
      '  background: #fff;',
      '  border: 1px solid #e5e7eb;',
      '  border-radius: 8px;',
      '}',
      '.scw-srv-table {',
      '  border-collapse: collapse;',
      '  width: 100%;',
      '  min-width: 720px;',
      '}',
      '.scw-srv-table th, .scw-srv-table td {',
      '  border-bottom: 1px solid #f3f4f6;',
      '  vertical-align: top;',
      '  text-align: left;',
      '  padding: 10px 12px;',
      '}',
      '.scw-srv-table thead th {',
      '  position: sticky; top: 0;',
      '  background: #f9fafb;',
      '  border-bottom: 2px solid #e5e7eb;',
      '  z-index: 2;',
      '  font-weight: 600;',
      '}',
      '.scw-srv-row-label {',
      '  position: sticky; left: 0;',
      '  background: #fff;',
      '  font-weight: 600;',
      '  min-width: 220px; max-width: 280px;',
      '  z-index: 1;',
      '}',
      '.scw-srv-table thead .scw-srv-row-label {',
      '  background: #f9fafb;',
      '  z-index: 3;',
      '}',
      '.scw-srv-group-row td {',
      '  background: #163C6E;',
      '  color: #fff;',
      '  font-weight: 700;',
      '  letter-spacing: 0.04em;',
      '  text-transform: uppercase;',
      '  font-size: 11px;',
      '  padding: 8px 12px;',
      '}',
      // Column header pieces
      '.scw-srv-colhead {',
      '  display: flex; flex-direction: column; gap: 4px;',
      '  min-width: 220px;',
      '}',
      '.scw-srv-colhead-name {',
      '  font-size: 13px; font-weight: 700; color: #111827;',
      '}',
      '.scw-srv-colhead-date {',
      '  font-size: 11px; color: #6b7280; font-weight: 500;',
      '}',
      '.scw-srv-status-badge {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 2px 8px; border-radius: 999px;',
      '  font-size: 11px; font-weight: 700;',
      '  text-transform: uppercase; letter-spacing: 0.04em;',
      '  width: fit-content;',
      '}',
      '.scw-srv-status-badge--reviewed {',
      '  background: #d1fae5; color: #065f46;',
      '}',
      '.scw-srv-status-badge--pending {',
      '  background: #fef3c7; color: #92400e;',
      '}',
      '.scw-srv-reviewed-stamp {',
      '  font-size: 11px; color: #6b7280; font-weight: 500;',
      '}',
      '.scw-srv-mark-btn {',
      '  appearance: none; border: 1px solid #163C6E;',
      '  background: #163C6E; color: #fff;',
      '  font: 600 12px system-ui, sans-serif;',
      '  padding: 6px 12px; border-radius: 6px;',
      '  cursor: pointer; align-self: flex-start;',
      '  letter-spacing: 0.02em;',
      '}',
      '.scw-srv-mark-btn:hover { background: #0f2d55; }',
      '.scw-srv-mark-btn[disabled] { opacity: 0.55; cursor: default; }',
      '.scw-srv-reopen-link {',
      '  font: 500 11px system-ui, sans-serif;',
      '  color: #2563eb; cursor: pointer;',
      '  align-self: flex-start;',
      '  text-decoration: underline;',
      '  background: none; border: none; padding: 0;',
      '}',
      '.scw-srv-reopen-link:hover { color: #1d4ed8; }',
      // Cell pieces
      '.scw-srv-cell--empty {',
      '  color: #9ca3af; font-size: 16px;',
      '  text-align: center;',
      '}',
      '.scw-srv-cell-photos {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  font-weight: 600; color: #111827;',
      '}',
      '.scw-srv-cell-notes {',
      '  margin-top: 4px;',
      '  color: #4b5563;',
      '  font-size: 12px;',
      '  line-height: 1.35;',
      '}',
      '.scw-srv-cell-no-photos { color: #9ca3af; font-style: italic; font-size: 12px; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Read helpers ──────────────────────────────────────────
  function getModels(viewId) {
    if (typeof Knack === 'undefined' || !Knack.views || !Knack.views[viewId]) return [];
    var view = Knack.views[viewId];
    var data = view.model && view.model.data;
    return (data && data.models) || [];
  }

  function attrsOf(model) { return model.attributes || model; }

  function rawConn(attrs, fieldKey) {
    var raw = attrs && attrs[fieldKey + '_raw'];
    if (!Array.isArray(raw) || !raw.length || !raw[0]) return null;
    return raw[0];
  }
  function connId(attrs, fk) { var c = rawConn(attrs, fk); return c && c.id ? c.id : null; }
  function connLabel(attrs, fk) {
    var c = rawConn(attrs, fk);
    return c && c.identifier ? String(c.identifier).trim() : '';
  }

  function isReviewed(attrs) {
    var v = attrs && attrs[FIELD_QA_REVIEWED];
    return !!v && String(v).trim().toLowerCase() === 'yes';
  }

  function readPhotoCount(attrs) {
    var raw = attrs && attrs[FIELD_PHOTOS + '_raw'];
    if (Array.isArray(raw)) return raw.length;
    // file fields sometimes show as a single object — count it as 1
    if (raw && typeof raw === 'object') return 1;
    return 0;
  }

  function readNotes(attrs) {
    var raw = attrs && (attrs[FIELD_NOTES] || attrs[FIELD_NOTES + '_raw']);
    if (raw == null) return '';
    return String(raw).replace(/<[^>]*>/g, '').trim();
  }

  function truncate(s, n) {
    if (!s) return '';
    if (s.length <= n) return s;
    return s.slice(0, n).replace(/\s+\S*$/, '') + '…';
  }

  // ── Build / render ────────────────────────────────────────
  function getOrCreateContainer() {
    var existing = document.getElementById(GRID_CONTAINER_ID);
    if (existing) return existing;
    var sceneEl = document.getElementById('kn-' + SCENE_ID);
    if (!sceneEl) return null;
    var c = document.createElement('div');
    c.id = GRID_CONTAINER_ID;
    // Insert at top of the scene so the grid is the first thing the user sees.
    sceneEl.insertBefore(c, sceneEl.firstChild);
    return c;
  }

  function build() {
    injectStyles();
    var container = getOrCreateContainer();
    if (!container) return;

    var requests  = getModels(SURVEY_REQUESTS_VIEW);
    var lineItems = getModels(SURVEY_LINE_ITEMS_VIEW);

    if (!requests.length) {
      container.innerHTML = '<div class="scw-srv-empty">' +
        'No surveys received yet. Once subcontractors submit, they’ll appear here for review.' +
        '</div>';
      return;
    }

    // ── Build columns (one per Survey Request) ──
    var columns = requests.map(function (m) {
      var a = attrsOf(m);
      return {
        id:           a.id,
        sub:          connLabel(a, FIELD_SUB) || '(no subcontractor)',
        submitted:    a[FIELD_SUBMITTED] || '',
        reviewed:     isReviewed(a),
        reviewedBy:   connLabel(a, FIELD_QA_REVIEWED_BY),
        reviewedAt:   a[FIELD_QA_REVIEWED_AT] || ''
      };
    });
    // Stable order: by submitted date asc, then by sub name
    columns.sort(function (a, b) {
      var d = String(a.submitted).localeCompare(String(b.submitted));
      if (d !== 0) return d;
      return a.sub.localeCompare(b.sub);
    });

    // ── Index Survey Line Items into a 2-D matrix ──
    // cells[sowLiId][surveyId] = { photoCount, notes }
    var cells = {};
    var sowLiLabel = {};            // sowLiId -> display label
    var groupBySowLi = {};          // sowLiId -> mdf label
    var groupOrder = [];            // ordered list of group labels seen
    var groupSeen = {};
    var sowLiSeen = {};
    var sowLiByGroup = {};          // groupLabel -> [sowLiIds] in insertion order

    for (var i = 0; i < lineItems.length; i++) {
      var a = attrsOf(lineItems[i]);
      var sowLiId   = connId(a, FIELD_SOW_LI);
      var surveyId  = connId(a, FIELD_SURVEY);
      if (!sowLiId || !surveyId) continue;

      if (!cells[sowLiId]) cells[sowLiId] = {};
      cells[sowLiId][surveyId] = {
        photoCount: readPhotoCount(a),
        notes:      readNotes(a)
      };

      if (!sowLiSeen[sowLiId]) {
        sowLiSeen[sowLiId] = true;
        sowLiLabel[sowLiId] = connLabel(a, FIELD_SOW_LI) || sowLiId;
        var grp = connLabel(a, FIELD_MDF_IDF) || 'Unassigned';
        groupBySowLi[sowLiId] = grp;
        if (!groupSeen[grp]) {
          groupSeen[grp] = true;
          groupOrder.push(grp);
          sowLiByGroup[grp] = [];
        }
        sowLiByGroup[grp].push(sowLiId);
      }
    }

    // Pull "Unassigned" group to the end if present
    var unIdx = groupOrder.indexOf('Unassigned');
    if (unIdx !== -1 && unIdx !== groupOrder.length - 1) {
      groupOrder.splice(unIdx, 1);
      groupOrder.push('Unassigned');
    }

    // ── Status line ──
    var reviewedCount = columns.filter(function (c) { return c.reviewed; }).length;
    var statusHtml =
      '<div class="scw-srv-status">' +
        '<strong>' + columns.length + '</strong> survey' +
        (columns.length === 1 ? '' : 's') + ' received · ' +
        '<strong>' + reviewedCount + '</strong> reviewed · ' +
        '<strong>' + (columns.length - reviewedCount) + '</strong> awaiting review' +
      '</div>';

    // ── Build the table ──
    var html = [];
    html.push(statusHtml);

    if (!sowLiSeen || !Object.keys(sowLiSeen).length) {
      html.push('<div class="scw-srv-empty">' +
        'Surveys received, but no Survey Line Item records have been submitted yet.' +
        '</div>');
      container.innerHTML = html.join('');
      return;
    }

    html.push('<div class="scw-srv-table-wrap"><table class="scw-srv-table">');

    // Header row
    html.push('<thead><tr>');
    html.push('<th class="scw-srv-row-label">SOW Line Item</th>');
    columns.forEach(function (col) {
      html.push('<th>' + buildColumnHeaderHtml(col) + '</th>');
    });
    html.push('</tr></thead>');

    // Body
    html.push('<tbody>');
    groupOrder.forEach(function (grp) {
      // Group header row spans the whole table
      html.push('<tr class="scw-srv-group-row"><td colspan="' + (columns.length + 1) + '">' +
        escapeHtml(grp) + '</td></tr>');

      sowLiByGroup[grp].forEach(function (sowLiId) {
        html.push('<tr>');
        html.push('<td class="scw-srv-row-label">' + escapeHtml(sowLiLabel[sowLiId]) + '</td>');
        columns.forEach(function (col) {
          var cell = cells[sowLiId] && cells[sowLiId][col.id];
          html.push('<td>' + buildCellHtml(cell) + '</td>');
        });
        html.push('</tr>');
      });
    });
    html.push('</tbody></table></div>');

    container.innerHTML = html.join('');
    bindCardActions(container);
  }

  function buildColumnHeaderHtml(col) {
    var parts = [];
    parts.push('<div class="scw-srv-colhead">');
    parts.push('<span class="scw-srv-colhead-name">' + escapeHtml(col.sub) + '</span>');
    if (col.submitted) {
      parts.push('<span class="scw-srv-colhead-date">Submitted ' +
        escapeHtml(String(col.submitted)) + '</span>');
    }
    if (col.reviewed) {
      parts.push('<span class="scw-srv-status-badge scw-srv-status-badge--reviewed">' +
        '✓ Reviewed</span>');
      if (col.reviewedBy || col.reviewedAt) {
        parts.push('<span class="scw-srv-reviewed-stamp">' +
          (col.reviewedBy ? 'by ' + escapeHtml(col.reviewedBy) : '') +
          (col.reviewedBy && col.reviewedAt ? ' · ' : '') +
          (col.reviewedAt ? escapeHtml(String(col.reviewedAt)) : '') +
          '</span>');
      }
      parts.push('<button type="button" class="scw-srv-reopen-link" ' +
        'data-action="reopen" data-survey-id="' + escapeAttr(col.id) + '">' +
        'Re-open Review</button>');
    } else {
      parts.push('<span class="scw-srv-status-badge scw-srv-status-badge--pending">' +
        '⚠ Awaiting Review</span>');
      parts.push('<button type="button" class="scw-srv-mark-btn" ' +
        'data-action="mark-reviewed" data-survey-id="' + escapeAttr(col.id) + '">' +
        'Mark Reviewed</button>');
    }
    parts.push('</div>');
    return parts.join('');
  }

  function buildCellHtml(cell) {
    if (!cell) return '<span class="scw-srv-cell--empty">—</span>';
    var parts = [];
    if (cell.photoCount > 0) {
      parts.push('<span class="scw-srv-cell-photos">📷 ' + cell.photoCount + '</span>');
    } else {
      parts.push('<span class="scw-srv-cell-no-photos">No photos</span>');
    }
    if (cell.notes) {
      parts.push('<div class="scw-srv-cell-notes" title="' +
        escapeAttr(cell.notes) + '">📝 ' +
        escapeHtml(truncate(cell.notes, NOTES_PREVIEW_LEN)) + '</div>');
    }
    return parts.join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ── Mark Reviewed actions ────────────────────────────────
  function bindCardActions(container) {
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var surveyId = btn.getAttribute('data-survey-id');
      if (!surveyId) return;
      if (action === 'mark-reviewed') {
        flipReviewed(surveyId, true, btn);
      } else if (action === 'reopen') {
        flipReviewed(surveyId, false, btn);
      }
    });
  }

  function currentUserId() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && u.id) return u.id;
    } catch (e) { /* ignore */ }
    return '';
  }

  function flipReviewed(surveyId, toReviewed, btn) {
    if (!window.SCW || typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') {
      console.error('[scw-srv] knackAjax/knackRecordUrl unavailable');
      return;
    }

    var body = {};
    body[FIELD_QA_REVIEWED] = toReviewed ? 'Yes' : 'No';
    if (toReviewed) {
      var uid = currentUserId();
      if (uid) body[FIELD_QA_REVIEWED_BY] = [uid];
      // Knack accepts ISO timestamps for date/time fields.
      body[FIELD_QA_REVIEWED_AT] = new Date().toISOString();
    } else {
      body[FIELD_QA_REVIEWED_BY] = [];
      body[FIELD_QA_REVIEWED_AT] = '';
    }

    var origLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = toReviewed ? 'Saving…' : 'Re-opening…';

    SCW.knackAjax({
      type: 'PUT',
      url: SCW.knackRecordUrl(SURVEY_REQUESTS_VIEW, surveyId),
      data: JSON.stringify(body),
      dataType: 'json',
      success: function (resp) {
        // Patch model so the next build() reflects the new state without a fetch.
        try {
          if (typeof SCW.syncKnackModel === 'function') {
            SCW.syncKnackModel(SURVEY_REQUESTS_VIEW, surveyId, resp,
              FIELD_QA_REVIEWED, body[FIELD_QA_REVIEWED]);
            SCW.syncKnackModel(SURVEY_REQUESTS_VIEW, surveyId, resp,
              FIELD_QA_REVIEWED_BY, body[FIELD_QA_REVIEWED_BY]);
            SCW.syncKnackModel(SURVEY_REQUESTS_VIEW, surveyId, resp,
              FIELD_QA_REVIEWED_AT, body[FIELD_QA_REVIEWED_AT]);
          }
        } catch (e) { /* best-effort */ }
        // Re-render so the column transitions to the new state.
        build();
      },
      error: function (xhr) {
        console.error('[scw-srv] Mark Reviewed failed',
          xhr && xhr.status, xhr && xhr.responseText);
        btn.disabled = false;
        btn.textContent = origLabel;
        alert('Could not update review status. Please try again.');
      }
    });
  }

  // ── Triggers ──────────────────────────────────────────────
  var _buildTimer = null;
  function debouncedBuild() {
    clearTimeout(_buildTimer);
    _buildTimer = setTimeout(build, BUILD_DEBOUNCE_MS);
  }

  if (window.SCW && SCW.onSceneRender) {
    SCW.onSceneRender(SCENE_ID, debouncedBuild, EVENT_NS);
  } else {
    $(document).off('knack-scene-render.' + SCENE_ID + EVENT_NS)
               .on('knack-scene-render.' + SCENE_ID + EVENT_NS, debouncedBuild);
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(SURVEY_REQUESTS_VIEW, debouncedBuild, EVENT_NS);
    SCW.onViewRender(SURVEY_LINE_ITEMS_VIEW, debouncedBuild, EVENT_NS);
  } else {
    $(document).off('knack-view-render.' + SURVEY_REQUESTS_VIEW + EVENT_NS)
               .on('knack-view-render.' + SURVEY_REQUESTS_VIEW + EVENT_NS, debouncedBuild);
    $(document).off('knack-view-render.' + SURVEY_LINE_ITEMS_VIEW + EVENT_NS)
               .on('knack-view-render.' + SURVEY_LINE_ITEMS_VIEW + EVENT_NS, debouncedBuild);
  }

  // First-paint attempt for hot reloads / direct navigation.
  setTimeout(function () {
    if (document.getElementById('kn-' + SCENE_ID)) build();
  }, 300);
})();
