/*** WORKSHEET V2 — MDF/IDF LOCATION MANAGE (manage-section integration) ******
 *
 * Folds the standalone "Manage MDFs / IDFs" section INTO the worksheet
 * (deploy scene view_3932; build-SOW scene view_3577 — config-driven per
 * worksheet-v2 view entry), with full parity to the bid-review-v2 manage panel
 * (bid-review-v2/mdf-manage.js): every real-location L1 header gets a pencil
 * that opens a panel directly under the header with
 *
 *   - editable designator badge (HEADEND/IDF select + in-badge ## input —
 *     HEADENDs never carry a ##: flipping to HEADEND hides + clears it)
 *   - editable Name (field_1943), Notes (field_1643), Survey Notes (field_2457)
 *   - the location's PHOTO STRIP (scraped from the manage view's rendered
 *     row) + an Add-photos tile (identity-aware bulk uploader, linkField
 *     mdfIdfID — same pipeline as the comparison page)
 *
 * Saves are diff-only PUTs through the manage view (view_3932) with the
 * user's session; on success the L1 header label is retitled in place and
 * the manage view quietly refetches so the model agrees.
 *
 * The standalone accordion sections are hidden by STATIC CSS (injected at
 * bundle load) so they never flash before the worksheet takes over. A
 * retrofit pass re-adds pencils when the manage view's model finishes
 * loading AFTER the worksheet rendered (the old flakiness).
 *
 * Config (per worksheet-v2 view entry):
 *   mdfManage: { viewKey: 'view_3932', notesField: 'field_1643' }
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var STYLE_ID = 'scw-ws-v2-mdf-notes-css';
  var P = 'scw-ws-v2-mdf';

  var F = {
    type:        'field_1641',
    num:         'field_2458',
    name:        'field_1943',
    notes:       'field_1643',
    surveyNotes: 'field_2457',
    displayName: 'field_1642'
  };

  var PENCIL_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M12 20h9"></path>' +
    '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
  var CAMERA_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>' +
    '<circle cx="12" cy="13" r="4"/></svg>';
  var DOC_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/>' +
    '<line x1="9" y1="17" x2="15" y2="17"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function stripTags(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  // ── Static styles — includes the no-flash hide of the standalone
  // Manage MDFs/IDFs section (view_3932 lives only on the deploy scene).
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* The standalone manage sections never paint — the worksheet is
         their home now. Static CSS so there is no flash while models load.
         view_3932 = deploy scene; view_3577 = build-SOW scene (view_3962
         integration); view_4060 = sub-portal deployment dashboard
         (view_4056 integration). The views still render (display:none
         keeps their models + rows readable for the pencil panel /
         photo scrape). */
      '.scw-acc-for-view_3932,',
      '.scw-acc-for-view_3577,',
      '.scw-acc-for-view_4060 {',
      '  display: none !important;',
      '}',
      /* Icon-only pencil before the L1 title — borderless, quiet; a soft
         circle only appears on hover. */
      '.scw-ws-v2-mdf-notes-btn {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  width: 22px; height: 22px; padding: 0; flex: none; margin: 0 2px;',
      '  border: none; border-radius: 50%; align-self: center;',
      '  background: transparent; color: rgba(255,255,255,0.75); cursor: pointer;',
      '  transition: background .15s, color .15s;',
      '}',
      '.scw-ws-v2-mdf-notes-btn:hover { background: rgba(255,255,255,0.22); color: #fff; }',
      /* ── Manage panel — mirrors bid-review-v2 mdf-manage / mdf-idf-cards */
      '.' + P + '-panel { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start;',
      '  margin: 0 0 6px; padding: 12px 14px; background: #fff;',
      '  border: 1px solid #dbe4ee; border-left: 4px solid #94a3b8;',
      '  border-radius: 0 0 10px 10px; box-shadow: 0 1px 2px rgba(15,23,42,.04);',
      '  font: 12.5px/1.45 system-ui, -apple-system, sans-serif; color: #0f172a; }',
      '.' + P + '-panel--head { border-left-color: #0f4c81;',
      '  background: linear-gradient(0deg,#fff,rgba(15,76,129,.05)); }',
      '.' + P + '-badge { display: inline-flex; align-items: center; gap: 6px; flex: none;',
      '  padding: 5px 9px; border-radius: 8px; background: #f1f5f9;',
      '  min-width: 78px; justify-content: center; margin-top: 17px; }',
      '.' + P + '-badge--head { background: rgba(15,76,129,.12); }',
      '.' + P + '-badge__type-sel { border: none; background: transparent; margin: 0;',
      '  padding: 0 2px 0 0; font: 800 11px/1 system-ui, sans-serif; letter-spacing: .4px;',
      '  text-transform: uppercase; color: #475569; cursor: pointer; max-width: 120px; }',
      '.' + P + '-badge--head .' + P + '-badge__type-sel { color: #0f4c81; }',
      '.' + P + '-badge__type-sel:focus { outline: none; text-decoration: underline; }',
      '.' + P + '-badge__num-in { width: 38px; padding: 3px 4px; text-align: center;',
      '  border: 1px solid #cbd5e1; border-radius: 5px; background: #fff;',
      '  font: 700 13px/1 system-ui, sans-serif; font-variant-numeric: tabular-nums; }',
      '.' + P + '-fld { flex: 1 1 180px; min-width: 160px; }',
      '.' + P + '-fld--wide { flex: 2 1 240px; }',
      '.' + P + '-lbl { font: 700 10px/1.2 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .05em; color: #64748b; margin-bottom: 4px; }',
      '.' + P + '-fld input, .' + P + '-fld textarea { width: 100%; box-sizing: border-box;',
      '  padding: 6px 9px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit;',
      '  background: #fff; resize: vertical; }',
      '.' + P + '-fld--name input { font-weight: 700; font-size: 14px; }',
      '.' + P + '-fld textarea { min-height: 52px; }',
      '.' + P + '-fld input:focus, .' + P + '-fld textarea:focus { outline: none;',
      '  border-color: #0f4c81; box-shadow: 0 0 0 3px rgba(15,76,129,.15); }',
      /* Photos strip inside the panel */
      '.' + P + '-photos { flex: 1 1 100%; }',
      '.' + P + '-photos-strip { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }',
      '.' + P + '-thumb { display: block; width: 74px; height: 74px; border-radius: 8px;',
      '  overflow: hidden; border: 1px solid #e2e8f0; background: #f8fafc; flex: none; }',
      '.' + P + '-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.' + P + '-thumb:hover { border-color: #0f4c81; }',
      '.' + P + '-addphoto { display: inline-flex; flex-direction: column;',
      '  align-items: center; justify-content: center; gap: 4px;',
      '  width: 74px; height: 74px; border: 2px dashed #cbd5e1; border-radius: 8px;',
      '  background: #f8fafc; color: #64748b; cursor: pointer;',
      '  font: 600 11px/1 system-ui, sans-serif; flex: none;',
      '  transition: border-color .15s, color .15s; }',
      '.' + P + '-addphoto:hover { border-color: #0f4c75; color: #0f4c75; background: #eff6ff; }',
      /* ── L1 detail band — always-visible location info at the top of an
         expanded group: survey-notes callout + photos strip + SCW notes.
         Mirrors the comparison page's L1 treatment. */
      '.' + P + '-band { background: #fff; border-bottom: 1px solid #e2e8f0; }',
      '.' + P + '-callout { display: flex; gap: 10px; align-items: flex-start;',
      '  background: #fefce8; padding: 10px 16px; border-bottom: 1px solid #f1e9c8; }',
      '.' + P + '-callout-ic { width: 26px; height: 26px; border-radius: 50%; flex: none;',
      '  background: #1e293b; color: #fff; display: inline-flex;',
      '  align-items: center; justify-content: center; margin-top: 1px; }',
      '.' + P + '-callout-lbl { font: 700 10px/1.2 system-ui, sans-serif;',
      '  text-transform: uppercase; letter-spacing: .06em; color: #334155;',
      '  margin-bottom: 2px; }',
      '.' + P + '-callout-txt { font: 13px/1.5 system-ui, sans-serif; color: #1e293b;',
      '  white-space: pre-line; }',
      '.' + P + '-band-grid { display: flex; flex-wrap: wrap; gap: 28px;',
      '  padding: 12px 16px; }',
      '.' + P + '-band-sec { flex: 1 1 240px; min-width: 200px; }',
      '.' + P + '-band-sec--photos { flex: 2 1 320px; }',
      /* SCW Notes are edited inline in the band — blur saves. */
      '.' + P + '-band-ta { width: 100%; box-sizing: border-box; min-height: 44px;',
      '  font: 13px/1.5 system-ui, sans-serif; color: #1e293b;',
      '  padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px;',
      '  background: #fff; resize: vertical;',
      '  transition: background .4s, border-color .2s; }',
      '.' + P + '-band-ta:focus { outline: none; border-color: #0f4c81; }',
      '.' + P + '-band-ta--saving { border-color: #93c5fd !important; }',
      '.' + P + '-band-ta--saved  { background: #dcfce7 !important; border-color: #4ade80 !important; }',
      '.' + P + '-band-ta--err    { background: #fef2f2 !important; border-color: #fca5a5 !important; }',
      '.' + P + '-band-notes { font: 13px/1.5 system-ui, sans-serif; color: #1e293b;',
      '  white-space: pre-line; }',
      '.' + P + '-band-notes--empty { color: #94a3b8; }',
      '.' + P + '-actions { flex: 1 1 100%; display: flex; justify-content: flex-end;',
      '  align-items: center; gap: 8px; }',
      '.' + P + '-status { margin-right: auto; font-weight: 600; color: #0f4c75; }',
      '.' + P + '-status.is-err { color: #be123c; }',
      '.' + P + '-btn { padding: 7px 14px; border-radius: 6px; cursor: pointer;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; border: 1px solid transparent; }',
      '.' + P + '-btn--cancel { background: #fff; color: #475569; border-color: #cbd5e1; }',
      '.' + P + '-btn--save { background: #0f4c75; color: #fff; }',
      '.' + P + '-btn--save:disabled { background: #cbd5e1; cursor: not-allowed; }',
      /* Delete location — red is reserved for destructive actions. */
      '.' + P + '-btn--delete { background: #fff; color: #b91c1c; border-color: #fca5a5; margin-right: auto; }',
      '.' + P + '-btn--delete:hover:not(:disabled) { background: #fef2f2; }',
      '.' + P + '-btn--delete:disabled { color: #94a3b8; border-color: #e2e8f0; cursor: not-allowed; }',
      '.' + P + '-btn--delete + .' + P + '-status { margin-right: 0; }',
      /* Delete confirmation — deliberately loud. */
      '.' + P + '-delconf { flex: 1 1 100%; padding: 14px 16px; border: 2px solid #dc2626;',
      '  border-radius: 8px; background: #fef2f2; }',
      '.' + P + '-delconf-title { font: 800 15px/1.4 system-ui, sans-serif; color: #991b1b; }',
      '.' + P + '-delconf-msg { margin: 6px 0 12px; font: 13px/1.5 system-ui, sans-serif; color: #7f1d1d; }',
      '.' + P + '-delconf-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }',
      '.' + P + '-delconf-status { margin-right: auto; font-weight: 600; color: #be123c; }',
      '.' + P + '-btn--confirm-del { background: #dc2626; color: #fff; }',
      '.' + P + '-btn--confirm-del:disabled { background: #fca5a5; cursor: not-allowed; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function manageCfg(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return (vc && vc.mdfManage && vc.mdfManage.viewKey) ? vc.mdfManage : null;
    } catch (e) { return null; }
  }

  function manageAttrs(manageViewKey, recId) {
    try {
      var v = Knack && Knack.views && Knack.views[manageViewKey];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        if (models[i].id === recId) return models[i].attributes;
      }
    } catch (e) { /* view not on scene */ }
    return null;
  }

  function fieldText(attrs, fk) {
    if (!attrs) return '';
    var raw = attrs[fk + '_raw'];
    return stripTags(raw != null ? raw : attrs[fk]);
  }

  /** field_1642 is the computed "TYPE: ##: name" label — parse as fallback
   *  when the dedicated columns come back empty. */
  function parseDisplayName(dn) {
    dn = String(dn == null ? '' : dn);
    var m = /^([^:]*):([^:]*):([\s\S]*)$/.exec(dn);
    if (m) return { type: m[1].trim(), num: m[2].trim(), name: m[3].trim() };
    m = /^([^:]*):([\s\S]*)$/.exec(dn);
    if (m) return { type: m[1].trim(), num: '', name: m[2].trim() };
    return { type: '', num: '', name: dn.trim() };
  }

  /** Row index for a manage view: 24-hex id → its rendered <tr>. Built
   *  ONCE per sweep and passed into locationPhotos — the old per-L1
   *  `a[href*="/<id>"]` substring selector re-scanned the manage view's
   *  whole DOM for every group (profiled inside the 3.5s retrofit task
   *  on big quotes). First row per id wins, matching the old selector. */
  function photoRowIndex(manageViewKey) {
    var map = Object.create(null);
    var mv = document.getElementById(manageViewKey);
    if (!mv) return map;
    var links = mv.querySelectorAll('tbody tr a[href]');
    for (var i = 0; i < links.length; i++) {
      var ids = (links[i].getAttribute('href') || '').match(/[a-f0-9]{24}/gi);
      if (!ids) continue;
      var tr = links[i].closest('tr');
      if (!tr) continue;
      for (var j = 0; j < ids.length; j++) {
        if (!map[ids[j]]) map[ids[j]] = tr;
      }
    }
    return map;
  }

  /** Photos for a location, scraped from the manage view's rendered row —
   *  the data row whose edit link points at add-photo…/<locationId>. Each
   *  photo is {thumb, href} (href = the photo's own edit child page).
   *  `rowIndex` (optional) is a prebuilt photoRowIndex for the view. */
  function locationPhotos(manageViewKey, l1Id, rowIndex) {
    var out = [];
    var row;
    if (rowIndex) {
      row = rowIndex[l1Id] || null;
    } else {
      var mv = document.getElementById(manageViewKey);
      if (!mv) return out;
      var editA = mv.querySelector('a[href*="/' + l1Id + '"]');
      row = editA && editA.closest('tr');
    }
    if (!row) return out;
    var cell = row.querySelector('td[data-field-key="field_771"]');
    if (!cell) return out;
    var imgs = cell.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var a = imgs[i].closest('a[href]');
      out.push({
        thumb: imgs[i].getAttribute('src') || '',
        href: (a && a.getAttribute('href')) || ''
      });
    }
    return out;
  }

  /** Content signature for a band — retrofit skips the rebuild+replaceChild
   *  when nothing it displays has changed. */
  function bandSig(attrs, photos, notesField) {
    var s = (attrs ? fieldText(attrs, F.surveyNotes) : '') + '\u0001' +
            (attrs ? fieldText(attrs, notesField) : '');
    for (var i = 0; i < photos.length; i++) s += '\u0001' + photos[i].thumb;
    return s;
  }

  /** Identity-aware bulk photo uploader against this MDF/IDF location
   *  (linkField mdfIdfID) — same pipeline as the comparison page. */
  function openMdfBulkUpload(manageViewKey, l1Id, label) {
    var bu = window.SCW && window.SCW.bulkUpload;
    var viewCfg = null;
    if (bu && typeof bu.open === 'function' && bu.config) {
      var views = bu.config.VIEWS || [];
      for (var vi = 0; vi < views.length; vi++) {
        if (views[vi].menuViewId === 'view_3482') { viewCfg = views[vi]; break; }
      }
    }
    if (!viewCfg) {
      alert('Bulk upload is not loaded. Refresh the page and try again.');
      return;
    }
    bu.open($.extend({}, viewCfg, {
      linkField: 'mdfIdfID',
      lineItemUpload: true,
      targetLabel: label || '',
      refreshViews: [manageViewKey]
    }), l1Id);
  }

  /** Called by render.js buildL1Block for every L1 — returns the pencil
   *  control (lives in the head-wrap next to the select-all checkbox). */
  function headerControl(l1, sourceViewKey) {
    var cfg = manageCfg(sourceViewKey);
    if (!cfg) return null;
    if (!l1 || !/^[a-f0-9]{24}$/i.test(String(l1.id || ''))) return null;
    var attrs = manageAttrs(cfg.viewKey, l1.id);
    if (!attrs) return null;
    injectStyles();

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-ws-v2-mdf-notes-btn';
    btn.setAttribute('data-scw-ws-v2-mdf-notes', l1.id);
    btn.setAttribute('data-scw-ws-v2-view', sourceViewKey);
    btn.setAttribute('aria-label', 'Edit this MDF/IDF');
    btn.title = 'Change HEADEND/IDF designator, number, or name';
    btn.innerHTML = PENCIL_SVG;
    return btn;
  }

  /** L1 DETAIL BAND — always-visible location info at the top of an
   *  expanded group (survey-notes callout + photos strip + SCW notes),
   *  mirroring the comparison page's L1 treatment. Called by render.js
   *  buildL1Block; also injected by the retrofit sweep when the manage
   *  view's model lands after the worksheet rendered. */
  function detailBand(l1, sourceViewKey, prebuilt) {
    var cfg = manageCfg(sourceViewKey);
    if (!cfg) return null;
    if (!l1 || !/^[a-f0-9]{24}$/i.test(String(l1.id || ''))) return null;
    var attrs = (prebuilt && prebuilt.attrs !== undefined)
      ? prebuilt.attrs : manageAttrs(cfg.viewKey, l1.id);
    var photos = (prebuilt && prebuilt.photos)
      ? prebuilt.photos : locationPhotos(cfg.viewKey, l1.id);
    if (!attrs && !photos.length) return null;   // nothing yet — retrofit adds later
    injectStyles();

    var sNotes = attrs ? fieldText(attrs, F.surveyNotes) : '';
    var notes  = attrs ? fieldText(attrs, cfg.notesField || F.notes) : '';

    var photosHtml = '';
    for (var p = 0; p < photos.length; p++) {
      photosHtml += '<a class="' + P + '-thumb" href="' + esc(photos[p].href) + '" ' +
        'title="Open photo"><img src="' + esc(photos[p].thumb) + '" alt="" loading="lazy"></a>';
    }
    photosHtml += '<button type="button" class="' + P + '-addphoto" ' +
      'data-scw-ws-v2-mdf-add="' + esc(l1.id) + '" ' +
      'data-scw-ws-v2-view="' + esc(sourceViewKey) + '" ' +
      'title="Add photos to this MDF/IDF">' + CAMERA_SVG + '<span>+ Add</span></button>';

    var band = document.createElement('div');
    band.className = P + '-band';
    band.setAttribute('data-scw-ws-v2-mdf-band', l1.id);
    // Content signature — retrofit compares before rebuilding so an
    // unchanged band is never re-created/replaced on sweep.
    band.setAttribute('data-scw-sig',
      bandSig(attrs, photos, cfg.notesField || F.notes));
    band.innerHTML =
      // Survey Notes stay READ-ONLY here (subs' territory — same rule as
      // the comparison page); SCW Notes edit INLINE, saving on blur.
      (sNotes
        ? '<div class="' + P + '-callout">' +
            '<span class="' + P + '-callout-ic">' + DOC_SVG + '</span>' +
            '<div><div class="' + P + '-callout-lbl">Survey Notes</div>' +
            '<div class="' + P + '-callout-txt">' + esc(sNotes) + '</div></div>' +
          '</div>'
        : '') +
      '<div class="' + P + '-band-grid">' +
        '<div class="' + P + '-band-sec ' + P + '-band-sec--photos">' +
          '<div class="' + P + '-lbl">Photos</div>' +
          '<div class="' + P + '-photos-strip">' + photosHtml + '</div>' +
        '</div>' +
        '<div class="' + P + '-band-sec">' +
          '<div class="' + P + '-lbl">SCW Notes</div>' +
          '<textarea class="' + P + '-band-ta" placeholder="Add notes — saves when you click away"></textarea>' +
        '</div>' +
      '</div>';
    var ta = band.querySelector('.' + P + '-band-ta');
    if (ta) {
      ta.value = notes;
      ta.setAttribute('data-scw-saved-val', notes);
      ta.addEventListener('blur', function () {
        saveBandNotes(ta, cfg.viewKey, l1.id, cfg.notesField || F.notes);
      });
    }
    return band;
  }

  /** Blur-save for the band's inline SCW Notes textarea. */
  function saveBandNotes(ta, manageViewKey, recId, field) {
    if (ta.getAttribute('data-scw-saved-val') === ta.value) return;
    if (!(window.SCW && typeof SCW.knackAjax === 'function' &&
          typeof SCW.knackRecordUrl === 'function')) return;
    var value = ta.value;
    var body = {}; body[field] = value;
    ta.classList.add(P + '-band-ta--saving');
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(manageViewKey, recId),
      type: 'PUT',
      data: JSON.stringify(body),
      dataType: 'json'
    }).then(function (resp) {
      ta.classList.remove(P + '-band-ta--saving');
      ta.setAttribute('data-scw-saved-val', value);
      ta.classList.add(P + '-band-ta--saved');
      setTimeout(function () { ta.classList.remove(P + '-band-ta--saved'); }, 1200);
      try {
        if (typeof SCW.syncKnackModel === 'function') {
          SCW.syncKnackModel(manageViewKey, recId, resp, field, value);
        }
      } catch (e) { /* model sync best-effort */ }
    }, function (xhr) {
      ta.classList.remove(P + '-band-ta--saving');
      ta.classList.add(P + '-band-ta--err');
      console.warn('[scw-ws-v2-mdf] notes save failed', manageViewKey, recId,
        xhr && xhr.status);
      setTimeout(function () { ta.classList.remove(P + '-band-ta--err'); }, 2500);
    });
  }

  /** RETROFIT — the worksheet can render before the manage view's model is
   *  ready, in which case headerControl/detailBand returned null and the
   *  L1s have no pencil / band. When the manage view (re)renders, sweep
   *  every mounted worksheet whose config points at it and fill the gaps. */
  function retrofit() {
    var mounts = document.querySelectorAll('.scw-ws-v2[id^="scw-ws-v2-"]');
    // Per-sweep caches, one entry per manage view: record-id → attrs, and
    // the photo-row index. The old per-L1 lookups (linear model scan +
    // whole-view substring selector) made one sweep O(L1 × page-DOM) —
    // profiled as a single 3.5s task on a big quote (2026-07-23 trace).
    var attrsIdx = Object.create(null);
    var rowIdx   = Object.create(null);
    function attrsFor(manageViewKey, id) {
      var idx = attrsIdx[manageViewKey];
      if (!idx) {
        idx = attrsIdx[manageViewKey] = Object.create(null);
        try {
          var v = Knack && Knack.views && Knack.views[manageViewKey];
          var models = (v && v.model && v.model.data && v.model.data.models) || [];
          for (var i = 0; i < models.length; i++) {
            if (models[i] && models[i].id) idx[models[i].id] = models[i].attributes;
          }
        } catch (e) { /* view not on scene */ }
      }
      return idx[id] || null;
    }
    for (var m = 0; m < mounts.length; m++) {
      var srcKey = mounts[m].id.replace('scw-ws-v2-', '');
      var cfg = manageCfg(srcKey);
      if (!cfg) continue;
      if (!(cfg.viewKey in rowIdx)) rowIdx[cfg.viewKey] = photoRowIndex(cfg.viewKey);
      var notesField = cfg.notesField || F.notes;
      var sections = mounts[m].querySelectorAll('[data-scw-ws-v2-l1]');
      for (var s = 0; s < sections.length; s++) {
        var id = sections[s].getAttribute('data-scw-ws-v2-l1') || '';
        if (!/^[a-f0-9]{24}$/i.test(id)) continue;
        var attrs = attrsFor(cfg.viewKey, id);
        var headWrap = sections[s].querySelector(':scope > .scw-ws-v2-l1-head-wrap');
        if (headWrap && attrs && !headWrap.querySelector('[data-scw-ws-v2-mdf-notes]')) {
          var btn = headerControl({ id: id }, srcKey);
          if (btn) {
            var headEl = headWrap.querySelector(':scope > .scw-ws-v2-l1-head');
            if (headEl) headWrap.insertBefore(btn, headEl);
            else headWrap.appendChild(btn);
          }
        }
        // Bands refresh on sweep so photos/notes catch up after the manage
        // view refetches (bulk upload, panel save) — but ONLY when their
        // content signature actually changed. The old unconditional
        // rebuild+replaceChild per L1 per sweep churned layout for
        // nothing. Never replace a band the user is typing in.
        var bodyEl = sections[s].querySelector(':scope > .scw-ws-v2-l1-body');
        if (bodyEl) {
          var cur = bodyEl.querySelector(':scope > [data-scw-ws-v2-mdf-band]');
          if (!(cur && cur.contains(document.activeElement))) {
            var photos = locationPhotos(cfg.viewKey, id, rowIdx[cfg.viewKey]);
            if (attrs || photos.length) {
              var sig = bandSig(attrs, photos, notesField);
              if (!(cur && cur.getAttribute('data-scw-sig') === sig)) {
                var fresh = detailBand({ id: id }, srcKey,
                  { attrs: attrs, photos: photos });
                if (fresh) {
                  if (cur) cur.parentNode.replaceChild(fresh, cur);
                  else bodyEl.insertBefore(fresh, bodyEl.firstChild);
                }
              }
            }
          }
        }
      }
    }
  }

  function closePanels() {
    var panels = document.querySelectorAll('.' + P + '-panel');
    for (var i = 0; i < panels.length; i++) {
      panels[i].parentNode.removeChild(panels[i]);
    }
  }

  /** True only when NOTHING points at this location: no worksheet cards in
   *  its L1 block AND no loaded source-view record whose MDF/IDF connection
   *  (cfg mdfIdf, default field_1946) references it. Fails CLOSED — if the
   *  model can't be read, the location is treated as NOT empty so the
   *  delete stays disabled rather than trusting a blind check. */
  function locationIsEmpty(sourceViewKey, l1Id, block) {
    if (block && block.querySelector('.scw-ws-v2-card')) return false;
    var mdfField = 'field_1946';
    try {
      var f = ns.cfg && typeof ns.cfg.fields === 'function' && ns.cfg.fields(sourceViewKey);
      if (f && f.mdfIdf) mdfField = f.mdfIdf;
    } catch (e) { /* default */ }
    try {
      var v = Knack.views && Knack.views[sourceViewKey];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models) return false;
      for (var i = 0; i < models.length; i++) {
        var raw = models[i].attributes && models[i].attributes[mdfField + '_raw'];
        if (Array.isArray(raw)) {
          for (var j = 0; j < raw.length; j++) {
            if (raw[j] && raw[j].id === l1Id) return false;
          }
        } else if (raw && raw.id === l1Id) {
          return false;
        }
      }
    } catch (e) { return false; }
    return true;
  }

  /** Big, loud confirm → view-scoped REST DELETE of the location record.
   *  Only reachable when locationIsEmpty() said yes; the manage view
   *  (view_3577 / view_3932) carries the Delete link in Builder that
   *  authorizes the session-authed DELETE. On success the L1 block is
   *  removed in place and the manage + source views refetch so the next
   *  rebuild agrees. */
  function openDeleteConfirm(panel, cfg, sourceViewKey, l1Id, block, label) {
    if (panel.querySelector('.' + P + '-delconf')) return;
    var conf = document.createElement('div');
    conf.className = P + '-delconf';
    conf.innerHTML =
      '<div class="' + P + '-delconf-title">Are you ABSOLUTELY sure you want to delete this MDF/IDF?</div>' +
      '<div class="' + P + '-delconf-msg">&ldquo;' + esc(label) + '&rdquo; will be permanently deleted, ' +
        'along with its notes and photo links. There is no undo.</div>' +
      '<div class="' + P + '-delconf-actions">' +
        '<span class="' + P + '-delconf-status"></span>' +
        '<button type="button" class="' + P + '-btn ' + P + '-btn--cancel">Keep it</button>' +
        '<button type="button" class="' + P + '-btn ' + P + '-btn--confirm-del">Yes &mdash; delete it</button>' +
      '</div>';
    panel.appendChild(conf);

    var st = conf.querySelector('.' + P + '-delconf-status');
    conf.querySelector('.' + P + '-btn--cancel').addEventListener('click', function () {
      conf.parentNode.removeChild(conf);
    });
    var goBtn = conf.querySelector('.' + P + '-btn--confirm-del');
    goBtn.addEventListener('click', function () {
      // Re-verify at the moment of truth — records may have been added
      // while the confirm sat open.
      if (!locationIsEmpty(sourceViewKey, l1Id, block)) {
        st.textContent = 'This location is no longer empty — delete cancelled.';
        goBtn.disabled = true;
        return;
      }
      goBtn.disabled = true;
      st.textContent = 'Deleting…';
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(cfg.viewKey, l1Id),
        type: 'DELETE',
        success: function () {
          closePanels();
          if (block && block.parentNode) block.parentNode.removeChild(block);
          // Refetch the manage view (groups.js seeds empty L1 groups from
          // it — without this the deleted location reappears on the next
          // rebuild) and the mdf options source if it's a different view.
          try {
            var mv = Knack.views && Knack.views[cfg.viewKey];
            if (mv && mv.model && typeof mv.model.fetch === 'function') mv.model.fetch();
            var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(sourceViewKey);
            if (vc && vc.mdfSourceViewKey && vc.mdfSourceViewKey !== cfg.viewKey) {
              var ov = Knack.views && Knack.views[vc.mdfSourceViewKey];
              if (ov && ov.model && typeof ov.model.fetch === 'function') ov.model.fetch();
            }
          } catch (e) { /* best-effort */ }
        },
        error: function (xhr) {
          goBtn.disabled = false;
          var status = xhr && xhr.status;
          st.textContent = 'Delete failed (' + status + ')' +
            (status === 403 ? ' — the manage view needs a Delete link enabled in Knack Builder.' : '.');
          console.warn('[scw-ws-v2-mdf] location delete failed', {
            view: cfg.viewKey, recordId: l1Id, status: status,
            response: xhr && xhr.responseText
          });
        }
      });
    });
  }

  function openPanel(btn) {
    var l1Id = btn.getAttribute('data-scw-ws-v2-mdf-notes');
    var sourceViewKey = btn.getAttribute('data-scw-ws-v2-view');
    var cfg = manageCfg(sourceViewKey);
    var block = btn.closest('.scw-ws-v2-l1');
    if (!cfg || !block) return;

    // Toggle: clicking the pencil with its panel open closes it.
    var existing = block.querySelector(':scope > .' + P + '-panel');
    closePanels();
    if (existing) return;

    var attrs = manageAttrs(cfg.viewKey, l1Id);
    if (!attrs) { alert('Location record not loaded yet — try again in a moment.'); return; }

    var dn    = parseDisplayName(fieldText(attrs, F.displayName));
    var type  = fieldText(attrs, F.type) || dn.type;
    var num   = fieldText(attrs, F.num)  || dn.num;
    var name  = fieldText(attrs, F.name) || dn.name;
    var isHead = /headend|mdf/i.test(type);

    // Identity only — designator / ## / name. Notes edit inline in the
    // band; Survey Notes are read-only on this page.
    var initial = {};
    initial[F.type] = type;
    initial[F.num] = num;
    initial[F.name] = name;

    var panel = document.createElement('div');
    panel.className = P + '-panel' + (isHead ? ' ' + P + '-panel--head' : '');
    panel.innerHTML =
      '<span class="' + P + '-badge' + (isHead ? ' ' + P + '-badge--head' : '') + '">' +
        '<select data-fk="' + F.type + '" class="' + P + '-badge__type-sel" aria-label="Type">' +
          '<option value="HEADEND"' + (isHead ? ' selected' : '') + '>HEADEND</option>' +
          '<option value="IDF"' + (!isHead ? ' selected' : '') + '>IDF</option>' +
        '</select>' +
        // HEADENDs never carry a ## — only IDFs are numbered.
        '<input type="text" data-fk="' + F.num + '" class="' + P + '-badge__num-in" ' +
          (isHead ? 'hidden ' : '') +
          'value="' + esc(num) + '" inputmode="numeric" placeholder="#" aria-label="Number">' +
      '</span>' +
      '<div class="' + P + '-fld ' + P + '-fld--name">' +
        '<div class="' + P + '-lbl">Name</div>' +
        '<input type="text" data-fk="' + F.name + '" value="' + esc(name) + '" placeholder="Location name">' +
      '</div>' +
      '<div class="' + P + '-actions">' +
        '<button type="button" class="' + P + '-btn ' + P + '-btn--delete">Delete&hellip;</button>' +
        '<span class="' + P + '-status">Enter saves &middot; Esc cancels</span>' +
      '</div>';

    // Directly after the header wrap (NOT inside the l1-body) so the panel
    // is usable even while the group accordion is collapsed.
    var headWrap = block.querySelector(':scope > .scw-ws-v2-l1-head-wrap');
    if (headWrap && headWrap.nextSibling) {
      block.insertBefore(panel, headWrap.nextSibling);
    } else {
      block.appendChild(panel);
    }

    var status  = panel.querySelector('.' + P + '-status');
    var inputs  = panel.querySelectorAll('[data-fk]');

    // Delete — only for locations with NOTHING under them. Not-empty
    // locations get a disabled button with the reason, so the capability
    // is discoverable without being dangerous.
    var delBtn = panel.querySelector('.' + P + '-btn--delete');
    if (delBtn) {
      var emptyNow = locationIsEmpty(sourceViewKey, l1Id, block);
      delBtn.disabled = !emptyNow;
      delBtn.title = emptyNow
        ? 'Delete this MDF/IDF location'
        : 'Can’t delete — this MDF/IDF still has line items under it. Move or delete them first.';
      delBtn.addEventListener('click', function () {
        var lblEl = block.querySelector('.scw-ws-v2-l1-label');
        openDeleteConfirm(panel, cfg, sourceViewKey, l1Id, block,
          (lblEl && lblEl.textContent.trim()) || fieldText(attrs, F.displayName) || 'this location');
      });
    }
    // No Save/Cancel buttons — Enter or tabbing/clicking away commits,
    // Escape closes without saving. Dirty/saving flags gate the autosave.
    var dirty = false, saving = false;
    function markDirty() { dirty = true; }
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', markDirty);
      inputs[i].addEventListener('change', markDirty);
    }

    // Designator flip: retint + enforce the HEADEND-never-numbered rule.
    var typeSel = panel.querySelector('.' + P + '-badge__type-sel');
    var numIn   = panel.querySelector('.' + P + '-badge__num-in');
    typeSel.addEventListener('change', function () {
      var head = /headend|mdf/i.test(typeSel.value);
      panel.classList.toggle(P + '-panel--head', head);
      panel.querySelector('.' + P + '-badge').classList.toggle(P + '-badge--head', head);
      numIn.hidden = head;
      numIn.value  = head ? '' : (numIn.value || initial[F.num] || '');
    });

    // Enter-to-save + tab/click-away-to-save — the rest of the app saves
    // inline fields on blur (SCW notes textarea, direct-edit worksheet
    // cells) rather than requiring an explicit button click; match that
    // here. Escape closes the panel without saving (the old Cancel
    // button). closePanels removes the panel synchronously, so the
    // deferred focusout autosave sees !panel.isConnected and skips.
    for (var ki = 0; ki < inputs.length; ki++) {
      inputs[ki].addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); closePanels(); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (dirty && !saving) doSave();
      });
    }
    panel.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!panel.isConnected) return;   // panel already closed
        if (!panel.contains(document.activeElement) && dirty && !saving) doSave();
      }, 0);
    });

    function doSave() {
      // Diff-only PUT — never send an unchanged field (the prefill can be a
      // parsed fallback; blindly PUTting everything could wipe real values).
      var fields = {};
      var changed = 0;
      for (var k = 0; k < inputs.length; k++) {
        var fk = inputs[k].getAttribute('data-fk');
        var v  = inputs[k].value.trim();
        if (v !== (initial[fk] || '')) { fields[fk] = v; changed++; }
      }
      if (!changed) { closePanels(); return; }
      saving = true;
      status.classList.remove('is-err');
      status.textContent = 'Saving…';
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(cfg.viewKey, l1Id),
        type: 'PUT',
        data: JSON.stringify(fields),
        success: function (resp) {
          saving = false;
          // Knack's view-based PUT can return 200 while silently DROPPING a
          // field the target view doesn't expose as an inline-editable
          // column — the record is otherwise saved, that one field just
          // never lands. BUT the response only echoes fields the view
          // DISPLAYS: a field that saved fine but isn't a column on the
          // view is simply ABSENT from the response (observed live
          // 2026-07-22 — field_1943 saved, refresh showed the new name,
          // yet the old absence-as-dropped check flagged it). So absence
          // proves nothing; only an echoed value that CONTRADICTS what we
          // sent proves a real drop.
          var own = Object.prototype.hasOwnProperty;
          var dropped = [];
          for (var fk in fields) {
            if (!own.call(fields, fk)) continue;
            if (!resp || (!own.call(resp, fk + '_raw') && !own.call(resp, fk))) continue;
            var got = resp[fk + '_raw'] != null ? resp[fk + '_raw'] : resp[fk];
            got = stripTags(got == null ? '' : got);
            if (got !== fields[fk]) dropped.push(fk);
          }
          if (dropped.length) {
            dirty = true;
            status.classList.add('is-err');
            status.textContent = 'Save didn’t take — ' + dropped.join(', ') +
              ' isn’t editable on this view (check Knack Builder inline-edit settings).';
            console.warn('[scw-ws-v2-mdf] server echoed a different value — view is ' +
              'missing inline-edit config for these fields', {
                view: cfg.viewKey, recordId: l1Id, sent: fields, dropped: dropped, response: resp
              });
            return;
          }
          dirty = false;
          status.textContent = 'Saved ✓';
          // Retitle the L1 header in place from the saved values.
          var nT = own.call(fields, F.type) ? fields[F.type] : type;
          var nN = own.call(fields, F.num)  ? fields[F.num]  : num;
          var nM = own.call(fields, F.name) ? fields[F.name] : name;
          if (nN && nN.length === 1) nN = '0' + nN;
          var lbl = block.querySelector('.scw-ws-v2-l1-label');
          if (lbl) lbl.textContent = nT + ': ' + nN + ': ' + nM;
          // Quiet model sync so the next rebuild reads fresh values.
          try {
            var v = window.Knack && Knack.views && Knack.views[cfg.viewKey];
            if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
          } catch (e) { /* best-effort */ }
          setTimeout(closePanels, 700);
        },
        error: function (xhr) {
          saving = false;
          dirty = true;
          status.classList.add('is-err');
          var srvMsg = '';
          try {
            var rb = JSON.parse((xhr && xhr.responseText) || '');
            var errs = (rb && (rb.errors || rb.error)) || [];
            if (!Array.isArray(errs)) errs = [errs];
            srvMsg = errs.map(function (er) {
              return (er && (er.message || er.msg)) || (typeof er === 'string' ? er : '');
            }).filter(Boolean).join('; ');
          } catch (e) { /* not JSON */ }
          console.warn('[scw-ws-v2-mdf] save failed', {
            view: cfg.viewKey, recordId: l1Id, sent: fields,
            status: xhr && xhr.status, response: xhr && xhr.responseText
          });
          status.textContent = 'Save failed (' + (xhr && xhr.status) + ')' +
            (srvMsg ? ': ' + srvMsg : '');
        }
      });
    }
  }

  // ── Delegated toggle ──────────────────────────────────────────────
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-mdf-notes-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-mdf-notes-bound', '1');
    document.addEventListener('click', function (e) {
      var add = e.target && e.target.closest &&
        e.target.closest('[data-scw-ws-v2-mdf-add]');
      if (add) {
        e.preventDefault();
        e.stopPropagation();
        var aCfg = manageCfg(add.getAttribute('data-scw-ws-v2-view'));
        if (aCfg) {
          var aId = add.getAttribute('data-scw-ws-v2-mdf-add');
          var aAttrs = manageAttrs(aCfg.viewKey, aId);
          openMdfBulkUpload(aCfg.viewKey, aId,
            aAttrs ? fieldText(aAttrs, F.displayName) : '');
        }
        return;
      }
      var btn = e.target && e.target.closest &&
        e.target.closest('[data-scw-ws-v2-mdf-notes]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openPanel(btn);
    }, true);
  }

  // Retrofit pencils when the manage view's model lands after the worksheet
  // rendered — the source of the "pencils sometimes missing" flakiness.
  var _retrofitTimer = 0;
  $(document)
    .off('knack-view-render.any.scwWsV2MdfRetrofit')
    .on('knack-view-render.any.scwWsV2MdfRetrofit', function () {
      // Trailing debounce — scene load / refetch storms fire one render
      // event per view; one sweep per storm is enough (each sweep covers
      // every mount). The old per-event scheduling stacked dozens of
      // full sweeps during a big-quote init.
      if (_retrofitTimer) clearTimeout(_retrofitTimer);
      _retrofitTimer = setTimeout(function () {
        _retrofitTimer = 0;
        retrofit();
      }, 150);
    });

  injectStyles();

  ns.mdfNotes = { headerControl: headerControl, retrofit: retrofit };
})();
/*** END WORKSHEET V2 — MDF/IDF LOCATION MANAGE *******************************/
