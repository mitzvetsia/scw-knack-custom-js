/*** BID REVIEW V2 — MDF/IDF MANAGE PANEL *************************************
 *
 * Inline location management on the comparison grid, mirroring the
 * mdf-idf-cards.js edit surface. Each real MDF/IDF L1 group header carries
 * a pencil (rendered by card.js buildL1HeaderRow); clicking it expands a
 * panel row directly under the header with:
 *
 *   - type/number badge (HEADEND accented apart from IDFs)
 *   - editable Name (field_1943), Notes (field_1643), Survey Notes (field_2457)
 *
 * Saves PUT through view_3822 (the MDF/IDF records view already on
 * scene_1155) with the user's session, then update the header title and
 * the L1 survey-notes callout IN PLACE (no grid rebuild, no refetch
 * flash) and quietly refetch view_3822 so the model agrees.
 *
 * ⚠ Builder dependency: view_3822 must accept edits on field_1943 /
 * field_1643 / field_2457 (inline editing on those columns) or the PUT
 * is rejected — surfaced as an explicit error in the panel.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  var P        = 'scw-brv2-mdf';
  var STYLE_ID = P + '-css';
  var ROW_CLS  = P + '-panel-row';

  var F = {
    type:        'field_1641',
    num:         'field_2458',
    name:        'field_1943',
    notes:       'field_1643',
    surveyNotes: 'field_2457',
    displayName: 'field_1642'
  };

  function mdfViewKey() {
    return (window.SCW.bidReview && window.SCW.bidReview.CONFIG &&
            window.SCW.bidReview.CONFIG.mdfIdfViewKey) || 'view_3822';
  }
  function stripTags(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  /** Resolve the location record for a group — by id, then by label. */
  function findRecord(mdfIdfId, label) {
    var recs = [];
    try {
      if (ns.data && ns.data.readRecords) recs = ns.data.readRecords(mdfViewKey()) || [];
    } catch (e) { recs = []; }
    if (!recs.length) {
      var v1 = window.SCW.bidReview;
      if (v1 && typeof v1.getMdfIdfRecords === 'function') recs = v1.getMdfIdfRecords() || [];
    }
    var target = label ? stripTags(label).toLowerCase() : '';
    var byLabel = null;
    for (var i = 0; i < recs.length; i++) {
      if (mdfIdfId && recs[i].id === mdfIdfId) return recs[i];
      if (target && !byLabel && stripTags(recs[i][F.displayName]).toLowerCase() === target) {
        byLabel = recs[i];
      }
    }
    return byLabel;
  }
  function fieldText(rec, fk) {
    if (!rec) return '';
    var raw = rec[fk + '_raw'];
    return stripTags(raw != null ? raw : rec[fk]);
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.scw-brv2-mdf-gear { display: inline-flex; align-items: center; justify-content: center;',
      '  width: 22px; height: 22px; margin-left: 6px; border-radius: 5px; cursor: pointer;',
      '  background: transparent; border: 1px solid transparent; color: inherit; opacity: .55;',
      '  padding: 0; flex: none; }',
      '.scw-brv2-mdf-gear:hover { opacity: 1; background: rgba(255,255,255,.18);',
      '  border-color: rgba(255,255,255,.35); }',

      '.' + ROW_CLS + ' td { padding: 0 !important; }',
      '.' + P + '-panel { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start;',
      '  margin: 8px 10px 10px; padding: 12px 14px; background: #fff;',
      '  border: 1px solid #cbd5e1; border-left: 4px solid #0f4c75; border-radius: 8px;',
      '  font: 12.5px/1.45 system-ui, -apple-system, sans-serif; color: #0f172a; }',
      '.' + P + '-badge { display: inline-flex; align-items: center; gap: 6px; flex: none;',
      '  padding: 6px 10px; border-radius: 7px; font: 800 12px/1 system-ui, sans-serif;',
      '  letter-spacing: .04em; }',
      '.' + P + '-badge--mdf { background: #fff7ed; color: #c2410c; border: 1px solid #fdba74; }',
      '.' + P + '-badge--idf { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }',
      '.' + P + '-fld { flex: 1 1 180px; min-width: 160px; }',
      '.' + P + '-fld--wide { flex: 2 1 260px; }',
      '.' + P + '-lbl { font: 700 10px/1.2 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .05em; color: #64748b; margin-bottom: 4px; }',
      '.' + P + '-fld input, .' + P + '-fld textarea { width: 100%; box-sizing: border-box;',
      '  padding: 6px 9px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit;',
      '  background: #fff; resize: vertical; }',
      '.' + P + '-fld textarea { min-height: 52px; }',
      '.' + P + '-fld input:focus, .' + P + '-fld textarea:focus { outline: none;',
      '  border-color: #0f4c75; box-shadow: 0 0 0 3px rgba(15,76,117,.13); }',
      '.' + P + '-actions { flex: 1 1 100%; display: flex; justify-content: flex-end;',
      '  align-items: center; gap: 8px; }',
      '.' + P + '-status { margin-right: auto; font-weight: 600; color: #0f4c75; }',
      '.' + P + '-status.is-err { color: #be123c; }',
      '.' + P + '-btn { padding: 7px 14px; border-radius: 6px; cursor: pointer;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; border: 1px solid transparent; }',
      '.' + P + '-btn--cancel { background: #fff; color: #475569; border-color: #cbd5e1; }',
      '.' + P + '-btn--save { background: #0f4c75; color: #fff; }',
      '.' + P + '-btn--save:disabled { background: #cbd5e1; cursor: not-allowed; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function closePanels() {
    var rows = document.querySelectorAll('tr.' + ROW_CLS);
    for (var i = 0; i < rows.length; i++) rows[i].parentNode.removeChild(rows[i]);
  }

  function openPanel(gear) {
    injectCss();
    var headerTr = gear.closest('tr');
    if (!headerTr) return;
    // Toggle: clicking the same gear with its panel open closes it.
    var next = headerTr.nextElementSibling;
    if (next && next.classList.contains(ROW_CLS)) { closePanels(); return; }
    closePanels();

    var mdfIdfId = gear.getAttribute('data-scw-mdf-manage') || '';
    var label    = gear.getAttribute('data-scw-mdf-label') || '';
    var rec      = findRecord(mdfIdfId, label);
    if (!rec) {
      alert('Could not find the MDF/IDF record for "' + label + '" on ' + mdfViewKey() + '.');
      return;
    }

    var type    = fieldText(rec, F.type);
    var isMdf   = /headend|mdf/i.test(type);
    var num     = fieldText(rec, F.num);
    var name    = fieldText(rec, F.name);
    var notes   = fieldText(rec, F.notes);
    var svNotes = fieldText(rec, F.surveyNotes);

    var tr = document.createElement('tr');
    // __row so the L1 collapse toggle hides it with the group.
    tr.className = 'scw-bid-review-v2__row ' + ROW_CLS;
    var td = document.createElement('td');
    td.colSpan = headerTr.firstChild ? (headerTr.firstChild.colSpan || 1) : 1;
    td.innerHTML =
      '<div class="' + P + '-panel">' +
        '<span class="' + P + '-badge ' + P + '-badge--' + (isMdf ? 'mdf' : 'idf') + '">' +
          esc(type || 'IDF') + (num ? ' · ' + esc(num) : '') + '</span>' +
        '<div class="' + P + '-fld">' +
          '<div class="' + P + '-lbl">Name</div>' +
          '<input type="text" data-fk="' + F.name + '" value="' + esc(name) + '">' +
        '</div>' +
        '<div class="' + P + '-fld ' + P + '-fld--wide">' +
          '<div class="' + P + '-lbl">Notes</div>' +
          '<textarea data-fk="' + F.notes + '">' + esc(notes) + '</textarea>' +
        '</div>' +
        '<div class="' + P + '-fld ' + P + '-fld--wide">' +
          '<div class="' + P + '-lbl">Survey Notes</div>' +
          '<textarea data-fk="' + F.surveyNotes + '">' + esc(svNotes) + '</textarea>' +
        '</div>' +
        '<div class="' + P + '-actions">' +
          '<span class="' + P + '-status"></span>' +
          '<button type="button" class="' + P + '-btn ' + P + '-btn--cancel">Cancel</button>' +
          '<button type="button" class="' + P + '-btn ' + P + '-btn--save" disabled>Save</button>' +
        '</div>' +
      '</div>';
    tr.appendChild(td);
    headerTr.parentNode.insertBefore(tr, headerTr.nextSibling);

    var saveBtn = td.querySelector('.' + P + '-btn--save');
    var status  = td.querySelector('.' + P + '-status');
    var inputs  = td.querySelectorAll('[data-fk]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', function () { saveBtn.disabled = false; });
    }
    td.querySelector('.' + P + '-btn--cancel').addEventListener('click', closePanels);

    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      status.classList.remove('is-err');
      status.textContent = 'Saving…';
      var fields = {};
      for (var k = 0; k < inputs.length; k++) {
        fields[inputs[k].getAttribute('data-fk')] = inputs[k].value.trim();
      }
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(mdfViewKey(), rec.id),
        type: 'PUT',
        data: JSON.stringify(fields),
        success: function () {
          status.textContent = 'Saved ✓';
          // In-place refresh: header title + survey-notes callout text.
          var newName = fields[F.name];
          if (newName && newName !== name) {
            var title = headerTr.querySelector('.scw-bid-review-v2__grp-title');
            // Display label = "TYPE: ## : name" shape; safest in-place move is
            // swapping the old name substring when present, else append.
            if (title) {
              var t = title.textContent;
              title.textContent = (name && t.indexOf(name) !== -1)
                ? t.replace(name, newName) : t + ' — ' + newName;
            }
          }
          var sv = fields[F.surveyNotes];
          var callout = tr.nextElementSibling;
          while (callout && !callout.classList.contains('scw-bid-review-v2__l1-survey-notes-row') &&
                 callout.classList.contains(ROW_CLS)) callout = callout.nextElementSibling;
          if (callout && callout.classList.contains('scw-bid-review-v2__l1-survey-notes-row')) {
            var body = callout.querySelector('.scw-bid-review-v2__l1-survey-notes-body');
            if (body && sv) body.textContent = sv;
            if (!sv) callout.style.display = 'none';
          }
          // Quiet model sync so the next rebuild reads fresh values.
          try {
            var v = window.Knack && Knack.views && Knack.views[mdfViewKey()];
            if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
          } catch (e) { /* best-effort */ }
          setTimeout(closePanels, 700);
        },
        error: function (xhr) {
          saveBtn.disabled = false;
          status.classList.add('is-err');
          status.textContent = 'Save failed (' + (xhr && xhr.status) + ') — are these ' +
            'fields editable on ' + mdfViewKey() + '?';
        }
      });
    });
  }

  // Capture phase: the L1 header row itself is the collapse toggle — the
  // gear must win and stop the event before that handler sees it.
  if (!document.documentElement.hasAttribute('data-scw-brv2-mdf-bound')) {
    document.documentElement.setAttribute('data-scw-brv2-mdf-bound', '1');
    document.addEventListener('click', function (e) {
      var gear = e.target && e.target.closest && e.target.closest('.scw-brv2-mdf-gear');
      if (!gear) return;
      e.preventDefault();
      e.stopPropagation();
      openPanel(gear);
    }, true);
  }
})();
/*** END BID REVIEW V2 — MDF/IDF MANAGE PANEL *********************************/
