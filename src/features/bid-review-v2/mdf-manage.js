/*** BID REVIEW V2 — MDF/IDF MANAGE PANEL *************************************
 *
 * Inline location management on the comparison grid, sharing the visual
 * language of mdf-idf-cards.js (the location cards on the survey / sales /
 * sub pages) so MDF/IDF interaction looks the same everywhere. Each real
 * MDF/IDF L1 group header carries a pencil (rendered by card.js
 * buildL1HeaderRow); clicking it expands a panel row under the header with:
 *
 *   - editable type/number badge (designator select — HEADEND/IDF/… — and
 *     a renumber input, HEADEND accented apart from IDFs)
 *   - editable Name (field_1943) + Notes (field_1643)
 *   - Add photos (identity-aware bulk uploader, linkField mdfIdfID)
 *
 * Survey Notes (field_2457) are deliberately NOT editable here — they're
 * the subs' territory. The read-only L1 survey-notes callout remains the
 * display surface on this grid.
 *
 * view_3822 (the MDF/IDF records view on scene_1155) often exposes only
 * the computed display name (field_1642, "TYPE: ## : name") — not the
 * individual type/##/name columns — so prefill parses the display name
 * when the dedicated fields come back empty.
 *
 * Saving: each field COMMITS ON BLUR / Enter (selects on change) like
 * every other inline field — no Save button. PUTs go through view_3822
 * with the user's session and send ONLY the field(s) the user changed
 * (never a blank prefill). On success the header title updates in place
 * AND the renamed location's connection identifiers are patched across
 * every loaded view model on the scene: the comparison grid groups by
 * the LINE ITEMS' field_1946 identifier (snapshotted at load), so
 * without the patch the next grid rebuild resurrected the old name —
 * which read as "the rename didn't take". No refetch is fired (the old
 * post-save refetch was what triggered that reverting rebuild).
 *
 * ⚠ Builder dependency: view_3822 must accept edits on field_1641 /
 * field_2458 / field_1943 / field_1643 (inline editing on those columns)
 * or the PUT is rejected — surfaced as an explicit error in the panel.
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

  /** field_1642 is the computed "TYPE: ## : name" label. Split on the first
   *  two colons; degrade gracefully when the ## segment is missing. */
  function parseDisplayName(dn) {
    dn = String(dn == null ? '' : dn);
    var m = /^([^:]*):([^:]*):([\s\S]*)$/.exec(dn);
    if (m) return { type: m[1].trim(), num: m[2].trim(), name: m[3].trim() };
    m = /^([^:]*):([\s\S]*)$/.exec(dn);
    if (m) return { type: m[1].trim(), num: '', name: m[2].trim() };
    return { type: '', num: '', name: dn.trim() };
  }

  function allRecords() {
    var recs = [];
    try {
      if (ns.data && ns.data.readRecords) recs = ns.data.readRecords(mdfViewKey()) || [];
    } catch (e) { recs = []; }
    if (!recs.length) {
      var v1 = window.SCW.bidReview;
      if (v1 && typeof v1.getMdfIdfRecords === 'function') recs = v1.getMdfIdfRecords() || [];
    }
    return recs;
  }

  /** Resolve the location record for a group — by id, then by label. */
  function findRecord(mdfIdfId, label) {
    var recs = allRecords();
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

  /** After a rename, rewrite the location's connection identifier in EVERY
   *  loaded view model on the scene. The comparison grid groups by the line
   *  items' field_1946 identifier (transform.js connectionLabel), which
   *  snapshots the display name at load — left stale, the next grid rebuild
   *  resurrects the old name and the rename looks like it "didn't take".
   *  Patches `_raw` identifiers plus the rendered HTML connection copy
   *  (<span class="<recId>">label</span>). Best-effort by design. */
  function patchConnectionIdentifiers(recId, newLabel) {
    if (!recId || !newLabel) return;
    var own = Object.prototype.hasOwnProperty;
    var spanRe = new RegExp(
      '(<span[^>]*class="[^"]*' + recId + '[^"]*"[^>]*>)[^<]*(</span>)', 'g');
    var htmlLabel = esc(newLabel).replace(/\$/g, '$$$$');
    try {
      var views = (window.Knack && Knack.views) || {};
      for (var vk in views) {
        if (!own.call(views, vk)) continue;
        var v = views[vk];
        var models = v && v.model && v.model.data && v.model.data.models;
        if (!models || !models.length) continue;
        for (var i = 0; i < models.length; i++) {
          var attrs = models[i] && (models[i].attributes || models[i]);
          if (!attrs) continue;
          for (var key in attrs) {
            if (!own.call(attrs, key)) continue;
            var val = attrs[key];
            if (/_raw$/.test(key)) {
              if (Array.isArray(val)) {
                for (var r = 0; r < val.length; r++) {
                  if (val[r] && val[r].id === recId) val[r].identifier = newLabel;
                }
              } else if (val && val.id === recId && val.identifier != null) {
                val.identifier = newLabel;
              }
            } else if (typeof val === 'string' && val.indexOf(recId) !== -1) {
              attrs[key] = val.replace(spanRe, '$1' + htmlLabel + '$2');
            }
          }
        }
      }
    } catch (e) { /* best-effort — a manual refresh still shows the rename */ }
  }

  /** Designator <option> markup: HEADEND/IDF always offered, plus any other
   *  type seen across the loaded location records (dedicated column first,
   *  parsed display name as fallback), plus the current value so the select
   *  never invents a change. */
  function typeOptionsHtml(cur) {
    var types = ['HEADEND', 'IDF'];
    var seen = { headend: true, idf: true };
    var recs = allRecords();
    for (var i = 0; i < recs.length; i++) {
      var t = fieldText(recs[i], F.type) ||
              parseDisplayName(fieldText(recs[i], F.displayName)).type;
      if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = true; types.push(t); }
    }
    if (cur && !seen[cur.toLowerCase()]) types.push(cur);
    var html = '';
    for (var j = 0; j < types.length; j++) {
      var isCur = cur && types[j].toLowerCase() === cur.toLowerCase();
      html += '<option value="' + esc(types[j]) + '"' + (isCur ? ' selected' : '') + '>' +
        esc(types[j]) + '</option>';
    }
    return html;
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var ACC = 'var(--scw-accent, #2f5f91)';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Subtle pencil affordance next to the L1 title — same circular chip
      // language as the row/panel carets. (The old z-index/pill hack is
      // gone: the header summary warn-chips were inheriting the base rule's
      // absolute positioning and painting over the header; styles.js now
      // keeps the --sum variant in normal flex flow, so nothing covers this.)
      '.scw-brv2-mdf-gear { display: inline-flex; align-items: center;',
      '  justify-content: center; width: 22px; height: 22px; padding: 0;',
      '  border: none; border-radius: 50%; cursor: pointer; flex: none;',
      '  background: rgba(41,95,145,0.10); color: #295f91;',
      '  transition: background .15s, color .15s; }',
      '.scw-brv2-mdf-gear:hover { background: rgba(41,95,145,0.22); color: #1e4e85; }',

      // "+ Add" photo tile in the L1 detail Photos strip.
      '.scw-brv2-mdf-addphoto { display: inline-flex; flex-direction: column;',
      '  align-items: center; justify-content: center; gap: 4px;',
      '  width: 74px; height: 74px; border: 2px dashed #cbd5e1; border-radius: 8px;',
      '  background: #f8fafc; color: #64748b; cursor: pointer;',
      '  font: 600 11px/1 system-ui, sans-serif; flex: none;',
      '  transition: border-color .15s, color .15s; }',
      '.scw-brv2-mdf-addphoto:hover { border-color: #0f4c75; color: #0f4c75;',
      '  background: #eff6ff; }',

      '.' + ROW_CLS + ' td { padding: 0 !important; }',
      // Panel chrome mirrors mdf-idf-cards' .scw-mdf-card: white card,
      // type-tinted left border, HEADEND gets the accent wash.
      '.' + P + '-panel { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start;',
      '  margin: 8px 10px 10px; padding: 12px 14px; background: #fff;',
      '  border: 1px solid #e2e8f0; border-left: 4px solid #94a3b8; border-radius: 10px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04);',
      '  font: 12.5px/1.45 system-ui, -apple-system, sans-serif; color: #0f172a; }',
      '.' + P + '-panel--head { border-left-color: ' + ACC + ';',
      '  background: linear-gradient(0deg,#fff,rgba(var(--scw-accent-rgb,47,95,145),.05)); }',
      // Badge — same shape/typography as .scw-mdf-badge in mdf-idf-cards.
      '.' + P + '-badge { display: inline-flex; align-items: center; gap: 6px; flex: none;',
      '  padding: 5px 9px; border-radius: 8px; background: #f1f5f9;',
      '  min-width: 78px; justify-content: center; margin-top: 17px; }',
      '.' + P + '-badge--head { background: rgba(var(--scw-accent-rgb,47,95,145),.12); }',
      // Designator select styled to read as the badge label (cards parity);
      // renumber input as the in-badge ## box.
      '.' + P + '-badge__type-sel { border: none; background: transparent; margin: 0;',
      '  padding: 0 2px 0 0; font: 800 11px/1 system-ui, sans-serif; letter-spacing: .4px;',
      '  text-transform: uppercase; color: #475569; cursor: pointer; max-width: 120px; }',
      '.' + P + '-badge--head .' + P + '-badge__type-sel { color: ' + ACC + '; }',
      '.' + P + '-badge__type-sel:focus { outline: none; text-decoration: underline; }',
      '.' + P + '-badge__num-in { width: 38px; padding: 3px 4px; text-align: center;',
      '  border: 1px solid #cbd5e1; border-radius: 5px; background: #fff;',
      '  font: 700 13px/1 system-ui, sans-serif; font-variant-numeric: tabular-nums; }',
      '.' + P + '-fld { flex: 1 1 180px; min-width: 160px; }',
      '.' + P + '-fld--wide { flex: 2 1 260px; }',
      '.' + P + '-lbl { font: 700 10px/1.2 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .05em; color: #64748b; margin-bottom: 4px; }',
      '.' + P + '-fld input, .' + P + '-fld textarea { width: 100%; box-sizing: border-box;',
      '  padding: 6px 9px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit;',
      '  background: #fff; resize: vertical; }',
      '.' + P + '-fld--name input { font-weight: 700; font-size: 14px; }',
      '.' + P + '-fld textarea { min-height: 52px; }',
      '.' + P + '-fld input:focus, .' + P + '-fld textarea:focus { outline: none;',
      '  border-color: ' + ACC + '; box-shadow: 0 0 0 3px rgba(var(--scw-accent-rgb,47,95,145),.15); }',
      '.' + P + '-actions { flex: 1 1 100%; display: flex; justify-content: flex-end;',
      '  align-items: center; gap: 8px; }',
      // Photos affordance — same bordered chip as mdf-idf-cards' .scw-mdf-photos.
      '.' + P + '-photos { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px;',
      '  border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; color: #475569;',
      '  font: 600 12px/1 system-ui, sans-serif; cursor: pointer; }',
      '.' + P + '-photos:hover { background: #f8fafc; }',
      '.' + P + '-status { margin-right: auto; font-weight: 600; color: #0f4c75; }',
      '.' + P + '-status.is-err { color: #be123c; }',
      '.' + P + '-btn { padding: 7px 14px; border-radius: 6px; cursor: pointer;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; border: 1px solid transparent; }',
      '.' + P + '-btn--close { background: #fff; color: #475569; border-color: #cbd5e1; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  var CAMERA_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>' +
      '<circle cx="12" cy="13" r="4"/></svg>';

  // Delete-enabled DOC_photos grid on this scene, used ONLY as a REST-DELETE
  // endpoint (view-scoped PUT/DELETE, same trick every other save in this
  // file uses). This is the SAME "all-photos" helper grid worksheet-v2/
  // photos.js already added to review-bids for line-item photo deletion
  // (view_4098, added 2026-07-13) — DOC_photos is one shared object across
  // line items AND MDF/IDF locations (different connection field per
  // parent), so no separate Builder view should be needed here. If deletes
  // 404/403, the object differs after all and a dedicated helper grid for
  // MDF/IDF location photos needs to be added and pointed at below.
  var MDF_PHOTO_DELETE_GRID = 'view_4098';

  /** Open the identity-aware bulk photo uploader against an MDF/IDF
   *  location record (linkField mdfIdfID). Shared by the manage panel's
   *  Add photos button and the L1 detail strip's "+ Add" tile. */
  function openMdfBulkUpload(mdfIdfId, label) {
    var bu = window.SCW && window.SCW.bulkUpload;
    if (!bu || typeof bu.open !== 'function' || !bu.config) {
      alert('Bulk upload is not loaded. Refresh the page and try again.');
      return;
    }
    var views = bu.config.VIEWS || [];
    var viewCfg = null;
    for (var vi = 0; vi < views.length; vi++) {
      if (views[vi].menuViewId === 'view_3482') { viewCfg = views[vi]; break; }
    }
    if (!viewCfg) { alert('Bulk upload config not found.'); return; }
    // lineItemUpload flips the modal into targeted copy ("Uploading to this
    // MDF/IDF location", no SOW auto-match blurb); targetLabel names it.
    // refreshViews: the borrowed view_3482 config refreshes NOTHING on close,
    // so new MDF photos stayed invisible until a full page reload. Refetch the
    // (hidden) MDF/IDF locations grid — the L1 photo strip scrapes ITS DOM,
    // and v2 subscribes to its knack-view-render, so the refetch re-renders
    // the grid with the fresh photos after Make's async write lands.
    bu.open($.extend({}, viewCfg, {
      linkField: 'mdfIdfID',
      lineItemUpload: true,
      targetLabel: label || '',
      refreshViews: [mdfViewKey()]
    }), mdfIdfId);
  }

  function gearLabelOf(rec) {
    return stripTags(rec && rec[F.displayName]) || '';
  }

  function closePanels() {
    var rows = document.querySelectorAll('tr.' + ROW_CLS);
    for (var i = 0; i < rows.length; i++) rows[i].parentNode.removeChild(rows[i]);
    // Restore the read-only surfaces a panel hid while it was open (header
    // title, SCW Notes callout) — see the de-dupe block in openPanel.
    var hid = document.querySelectorAll('[data-scw-mdf-dup-hidden]');
    for (var h = 0; h < hid.length; h++) {
      hid[h].style.display = '';
      hid[h].removeAttribute('data-scw-mdf-dup-hidden');
    }
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

    // Dedicated columns first; computed display name as fallback (see header).
    var dn      = parseDisplayName(fieldText(rec, F.displayName) || label);
    var type    = fieldText(rec, F.type) || dn.type;
    var num     = fieldText(rec, F.num)  || dn.num;
    var name    = fieldText(rec, F.name) || dn.name;
    var notes   = fieldText(rec, F.notes);
    var isMdf   = /headend|mdf/i.test(type);

    var initial = {};
    initial[F.type]  = type;
    initial[F.num]   = num;
    initial[F.name]  = name;
    initial[F.notes] = notes;

    var tr = document.createElement('tr');
    // __row so the L1 collapse toggle hides it with the group.
    tr.className = 'scw-bid-review-v2__row ' + ROW_CLS;
    var td = document.createElement('td');
    td.colSpan = headerTr.firstChild ? (headerTr.firstChild.colSpan || 1) : 1;
    td.innerHTML =
      '<div class="' + P + '-panel' + (isMdf ? ' ' + P + '-panel--head' : '') + '">' +
        // Editable badge, mirroring mdf-idf-cards: the designator is a select
        // styled to read as the badge label, the ## an in-badge renumber input.
        '<span class="' + P + '-badge' + (isMdf ? ' ' + P + '-badge--head' : '') + '">' +
          '<select data-fk="' + F.type + '" class="' + P + '-badge__type-sel" ' +
            'aria-label="Type">' + typeOptionsHtml(type || 'IDF') + '</select>' +
          // HEADENDs never carry a ## — only IDFs are numbered.
          '<input type="text" data-fk="' + F.num + '" class="' + P + '-badge__num-in" ' +
            (isMdf ? 'hidden ' : '') +
            'value="' + esc(num) + '" inputmode="numeric" placeholder="#" aria-label="Number">' +
        '</span>' +
        '<div class="' + P + '-fld ' + P + '-fld--name">' +
          '<div class="' + P + '-lbl">Name</div>' +
          '<input type="text" data-fk="' + F.name + '" value="' + esc(name) + '" placeholder="Location name">' +
        '</div>' +
        '<div class="' + P + '-fld ' + P + '-fld--wide">' +
          '<div class="' + P + '-lbl">Notes</div>' +
          '<textarea data-fk="' + F.notes + '">' + esc(notes) + '</textarea>' +
        '</div>' +
        '<div class="' + P + '-actions">' +
          '<button type="button" class="' + P + '-photos">' + CAMERA_SVG +
            '<span>Add photos</span></button>' +
          '<span class="' + P + '-status"></span>' +
          '<button type="button" class="' + P + '-btn ' + P + '-btn--close">Close</button>' +
        '</div>' +
      '</div>';
    tr.appendChild(td);
    headerTr.parentNode.insertBefore(tr, headerTr.nextSibling);

    // De-dupe while editing: the panel's inputs REPLACE the read-only display
    // of the same values, so hide those for this group while the panel is
    // open — the header's "TYPE: ## : name" title (the badge + Name input
    // show the same thing editable) and the L1 detail band's SCW Notes
    // callout (the Notes textarea edits it). Both are marked and restored
    // by closePanels; a v2 grid rebuild recreates them fresh anyway.
    function hideDup(el) {
      if (!el) return;
      el.setAttribute('data-scw-mdf-dup-hidden', '');
      el.style.display = 'none';
    }
    hideDup(headerTr.querySelector('.scw-bid-review-v2__grp-title'));
    var sib = tr.nextElementSibling;
    while (sib && !sib.classList.contains('scw-bid-review-v2__group-header')) {
      if (sib.classList.contains('scw-bid-review-v2__l1-detail-row')) {
        var dSecs = sib.querySelectorAll('.scw-bid-review-v2__l1-detail-section');
        for (var ds = 0; ds < dSecs.length; ds++) {
          var dLbl = dSecs[ds].querySelector('.scw-bid-review-v2__l1-detail-label');
          if (dLbl && /^scw notes$/i.test((dLbl.textContent || '').trim())) hideDup(dSecs[ds]);
        }
        break;
      }
      sib = sib.nextElementSibling;
    }

    var status = td.querySelector('.' + P + '-status');
    var inputs = td.querySelectorAll('[data-fk]');

    // Last value the server has per field — the diff base for each commit.
    // Starts at the prefill; advances on every successful PUT.
    var saved = {};
    for (var sk in initial) {
      if (Object.prototype.hasOwnProperty.call(initial, sk)) saved[sk] = initial[sk];
    }

    var statusTimer = 0;
    function setStatus(msg, isErr, sticky) {
      status.classList.toggle('is-err', !!isErr);
      status.textContent = msg || '';
      if (statusTimer) { clearTimeout(statusTimer); statusTimer = 0; }
      if (msg && !sticky) {
        statusTimer = setTimeout(function () { status.textContent = ''; }, 1800);
      }
    }

    // Display label after a save — prefer the server-recomputed field_1642
    // in the PUT response; compose locally as fallback.
    function labelAfterSave(resp) {
      var r = (resp && resp.record && resp.record.id) ? resp.record : resp;
      var dn2 = r ? stripTags(r[F.displayName + '_raw'] != null
        ? r[F.displayName + '_raw'] : r[F.displayName]) : '';
      if (dn2) return dn2;
      return ((saved[F.type] || '') + ': ' + (saved[F.num] || '') + ' : ' +
        (saved[F.name] || '')).replace(/:\s*:/g, ':');
    }

    // Shared commit: diff-only PUT of the given {field: value} map. On
    // success, sync view_3822's model in place, retitle the header, and
    // patch the location's connection identifiers across every loaded
    // model (see patchConnectionIdentifiers). NO refetch — the old
    // post-save refetch triggered a grid rebuild whose stale line-item
    // identifiers reverted the rename on screen.
    var saving = false;
    function commitFields(fields) {
      var fks = [];
      for (var fk0 in fields) {
        if (Object.prototype.hasOwnProperty.call(fields, fk0)) fks.push(fk0);
      }
      if (!fks.length || saving) return;
      saving = true;
      setStatus('Saving…', false, true);
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(mdfViewKey(), rec.id),
        type: 'PUT',
        data: JSON.stringify(fields),
        success: function (resp) {
          saving = false;
          for (var k2 = 0; k2 < fks.length; k2++) {
            saved[fks[k2]] = fields[fks[k2]];
            try {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(mdfViewKey(), rec.id, resp, fks[k2], fields[fks[k2]]);
              }
            } catch (e) { /* best-effort */ }
          }
          var newLabel = labelAfterSave(resp);
          var title = headerTr.querySelector('.scw-bid-review-v2__grp-title');
          if (title) title.textContent = newLabel.replace(/:\s*:/g, ':');
          patchConnectionIdentifiers(rec.id, newLabel);
          setStatus('Saved ✓');
        },
        error: function (xhr) {
          saving = false;
          // Surface Knack's actual rejection reason — the generic "are these
          // fields editable?" guess sent users hunting the wrong Builder
          // setting. Knack 400s carry {"errors":[{"message":…}]} naming the
          // offending field/rule.
          var srvMsg = '';
          try {
            var rb = JSON.parse((xhr && xhr.responseText) || '');
            var errs = (rb && (rb.errors || rb.error)) || [];
            if (!Array.isArray(errs)) errs = [errs];
            srvMsg = errs.map(function (er) {
              return (er && (er.message || er.msg)) || (typeof er === 'string' ? er : '');
            }).filter(Boolean).join('; ');
          } catch (e) { /* not JSON */ }
          // Introspect the view's LIVE schema — Knack ships it to the browser
          // (Knack.views[k].model.view), so we can say exactly which
          // precondition for a view-scoped PUT fails instead of guessing:
          //   1. view type must be 'table' (lists/details can't take PUTs)
          //   2. the view-level cell editor (inline editing) must be on
          //   3. each sent field must be a column, without ignore_edit
          var vinfo = null;
          try {
            var kv = window.Knack && Knack.views && Knack.views[mdfViewKey()];
            var vv = kv && kv.model && kv.model.view;
            if (vv) {
              vinfo = {
                type: vv.type || '',
                cellEditor: !!(vv.options && vv.options.cell_editor),
                columns: {}
              };
              var cols = vv.columns || [];
              for (var ci = 0; ci < cols.length; ci++) {
                var col = cols[ci] || {};
                var cf = (col.field && col.field.key) || col.id;
                if (cf) vinfo.columns[cf] = { ignoreEdit: !!col.ignore_edit };
              }
            }
          } catch (e) { /* best-effort */ }
          var problems = [];
          if (vinfo) {
            if (vinfo.type && vinfo.type !== 'table') {
              problems.push(mdfViewKey() + ' is a "' + vinfo.type + '" view — record ' +
                'PUTs need an inline-editable grid (table). Use/add a grid of MDF/IDF ' +
                'locations on this scene instead.');
            } else if (!vinfo.cellEditor) {
              problems.push('inline editing (cell editor) is OFF on ' + mdfViewKey() +
                ' as this page loaded it — enable it in Builder, then hard-refresh.');
            } else {
              for (var pk in fields) {
                if (!Object.prototype.hasOwnProperty.call(fields, pk)) continue;
                var colInfo = vinfo.columns[pk];
                if (!colInfo) {
                  problems.push(pk + ' is not a column on ' + mdfViewKey() +
                    ' — add it to the grid in Builder.');
                } else if (colInfo.ignoreEdit) {
                  problems.push(pk + '’s column on ' + mdfViewKey() +
                    ' has inline editing disabled (column setting).');
                }
              }
            }
          }
          console.warn('[scw-brv2-mdf] save failed', {
            view: mdfViewKey(), recordId: rec.id, sent: fields,
            status: xhr && xhr.status, response: xhr && xhr.responseText,
            viewSchema: vinfo, problems: problems
          });
          var msg = 'Save failed (' + (xhr && xhr.status) + ')';
          if (srvMsg) msg += ': ' + srvMsg;
          if (problems.length) {
            msg += ' — ' + problems.join(' ');
          } else if (!srvMsg || /invalid request/i.test(srvMsg)) {
            msg += ' — view schema looks editable from here; see console ' +
              '([scw-brv2-mdf]) for the sent fields + view schema snapshot.';
          }
          setStatus(msg, true, true);
        }
      });
    }

    function commitEl(el) {
      var fk = el.getAttribute('data-fk');
      if (!fk) return;
      var v = el.value.trim();
      if (v === (saved[fk] || '')) return;
      var one = {};
      one[fk] = v;
      commitFields(one);
    }

    // Commit-on-blur / Enter, like every other inline field. Escape reverts
    // to the last saved value (blur then finds no diff → no PUT).
    var typeSel = td.querySelector('.' + P + '-badge__type-sel');
    var numIn   = td.querySelector('.' + P + '-badge__num-in');
    for (var i = 0; i < inputs.length; i++) {
      (function (el) {
        if (el.tagName === 'SELECT') return;   // designator handled below
        el.addEventListener('blur', function () { commitEl(el); });
        el.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' && el.tagName !== 'TEXTAREA') {
            ev.preventDefault();
            el.blur();
          } else if (ev.key === 'Escape') {
            el.value = saved[el.getAttribute('data-fk')] || '';
            el.blur();
          }
        });
      })(inputs[i]);
    }

    // Designator flip HEADEND ↔ IDF: live badge/panel retint, enforce the
    // numbering rule (HEADENDs never carry a ## — only IDFs), and commit
    // immediately — type plus the ## change it implies ride one PUT.
    typeSel.addEventListener('change', function () {
      var head  = /headend|mdf/i.test(typeSel.value);
      var panel = td.querySelector('.' + P + '-panel');
      var badge = td.querySelector('.' + P + '-badge');
      panel.classList.toggle(P + '-panel--head', head);
      badge.classList.toggle(P + '-badge--head', head);
      numIn.hidden = head;
      numIn.value  = head ? '' : (numIn.value || initial[F.num] || '');
      var fields = {};
      if (typeSel.value.trim() !== (saved[F.type] || '')) fields[F.type] = typeSel.value.trim();
      var numV = numIn.value.trim();
      if (numV !== (saved[F.num] || '')) fields[F.num] = numV;
      commitFields(fields);
    });
    // mousedown → blur fires first, so a pending edit commits before close.
    td.querySelector('.' + P + '-btn--close').addEventListener('click', closePanels);

    // Add photos — same identity-aware bulk uploader the line-item photo
    // pills use, but the record shipped is THIS MDF/IDF location, labeled
    // mdfIdfID. (Make's router needs an mdfIdfID branch to land these.)
    td.querySelector('.' + P + '-photos').addEventListener('click', function () {
      openMdfBulkUpload(rec.id, gearLabelOf(rec));
    });
  }

  // Capture phase: the L1 header row itself is the collapse toggle — the
  // gear must win and stop the event before that handler sees it.
  if (!document.documentElement.hasAttribute('data-scw-brv2-mdf-bound')) {
    document.documentElement.setAttribute('data-scw-brv2-mdf-bound', '1');
    document.addEventListener('click', function (e) {
      var gear = e.target && e.target.closest && e.target.closest('.scw-brv2-mdf-gear');
      if (gear) {
        e.preventDefault();
        e.stopPropagation();
        openPanel(gear);
        return;
      }
      var add = e.target && e.target.closest &&
                e.target.closest('[data-scw-mdf-addphoto]');
      if (add) {
        e.preventDefault();
        e.stopPropagation();
        openMdfBulkUpload(add.getAttribute('data-scw-mdf-addphoto'),
                          add.getAttribute('data-mdf-label') || '');
      }
      // CAPTURE phase so the thumb's own click-through (opens the full
      // image in a new tab) never fires when the delete button is hit.
      var del = e.target && e.target.closest &&
                e.target.closest('[data-scw-mdf-photo-del]');
      if (del) {
        e.preventDefault();
        e.stopPropagation();
        deleteMdfPhoto(del);
      }
    }, true);
  }

  /** Delete an MDF/IDF location photo (DOC_photos record) via a REST DELETE
   *  through MDF_PHOTO_DELETE_GRID, then quietly refetch the MDF/IDF
   *  locations view so the L1 photos strip rebuilds without it. Confirms
   *  first — this permanently removes the photo and can't be undone. */
  function deleteMdfPhoto(btn) {
    var photoId = btn.getAttribute('data-scw-mdf-photo-del');
    if (!photoId) return;

    function doDelete() {
      var a = btn.closest('.scw-bid-review-v2__l1-detail-photo');
      if (a && a.parentNode) a.parentNode.removeChild(a);   // optimistic
      if (!(window.SCW && typeof SCW.knackAjax === 'function' &&
            typeof SCW.knackRecordUrl === 'function')) return;
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(MDF_PHOTO_DELETE_GRID, photoId),
        type: 'DELETE',
        success: function () {
          try {
            var v = window.Knack && Knack.views && Knack.views[mdfViewKey()];
            if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
          } catch (e) { /* best-effort */ }
        },
        error: function (xhr) {
          console.warn('[scw-brv2-mdf] photo delete failed via ' +
            MDF_PHOTO_DELETE_GRID + ' for ' + photoId,
            xhr && xhr.status, xhr && xhr.responseText);
          alert('Couldn’t delete that photo (status ' + (xhr && xhr.status) +
            '). It may belong to a different object than ' + MDF_PHOTO_DELETE_GRID +
            ' — check the console for details.');
          // Refetch either way — if the delete silently landed server-side
          // despite the error, the strip should still catch up.
          try {
            var v2 = window.Knack && Knack.views && Knack.views[mdfViewKey()];
            if (v2 && v2.model && typeof v2.model.fetch === 'function') v2.model.fetch();
          } catch (e2) { /* best-effort */ }
        }
      });
    }

    var wsv2 = window.SCW && SCW.worksheetV2;
    if (wsv2 && typeof wsv2.confirmModal === 'function') {
      wsv2.confirmModal({
        title: 'Delete this photo?',
        body: 'This permanently removes the photo from this MDF/IDF location and ' +
              'can’t be undone.',
        okLabel: 'Delete photo',
        cancelLabel: 'Cancel'
      }).then(function (ok) { if (ok) doDelete(); });
    } else if (window.confirm('Delete this photo? This can’t be undone.')) {
      doDelete();
    }
  }

  // Tile/gear styles must exist at render time, not first-panel-open time.
  injectCss();
})();
/*** END BID REVIEW V2 — MDF/IDF MANAGE PANEL *********************************/
