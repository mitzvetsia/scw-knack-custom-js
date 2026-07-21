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
         integration). The views still render (display:none keeps their
         models + rows readable for the pencil panel / photo scrape). */
      '.scw-ktl-accordion:has(.scw-ktl-accordion__header[data-view-key="view_3932"]),',
      '.scw-ktl-accordion:has(.scw-ktl-accordion__header[data-view-key="view_3577"]) {',
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
      '.' + P + '-btn--save:disabled { background: #cbd5e1; cursor: not-allowed; }'
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

  /** Photos for a location, scraped from the manage view's rendered row —
   *  the data row whose edit link points at add-photo…/<locationId>. Each
   *  photo is {thumb, href} (href = the photo's own edit child page). */
  function locationPhotos(manageViewKey, l1Id) {
    var out = [];
    var mv = document.getElementById(manageViewKey);
    if (!mv) return out;
    var editA = mv.querySelector('a[href*="/' + l1Id + '"]');
    var row = editA && editA.closest('tr');
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
  function detailBand(l1, sourceViewKey) {
    var cfg = manageCfg(sourceViewKey);
    if (!cfg) return null;
    if (!l1 || !/^[a-f0-9]{24}$/i.test(String(l1.id || ''))) return null;
    var attrs = manageAttrs(cfg.viewKey, l1.id);
    var photos = locationPhotos(cfg.viewKey, l1.id);
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
    for (var m = 0; m < mounts.length; m++) {
      var srcKey = mounts[m].id.replace('scw-ws-v2-', '');
      var cfg = manageCfg(srcKey);
      if (!cfg) continue;
      var sections = mounts[m].querySelectorAll('[data-scw-ws-v2-l1]');
      for (var s = 0; s < sections.length; s++) {
        var id = sections[s].getAttribute('data-scw-ws-v2-l1') || '';
        if (!/^[a-f0-9]{24}$/i.test(id)) continue;
        var headWrap = sections[s].querySelector(':scope > .scw-ws-v2-l1-head-wrap');
        if (headWrap && !headWrap.querySelector('[data-scw-ws-v2-mdf-notes]')) {
          var btn = headerControl({ id: id }, srcKey);
          if (btn) {
            var headEl = headWrap.querySelector(':scope > .scw-ws-v2-l1-head');
            if (headEl) headWrap.insertBefore(btn, headEl);
            else headWrap.appendChild(btn);
          }
        }
        // Bands rebuild on every sweep — photos/notes refresh after the
        // manage view refetches (bulk upload, panel save). Cheap DOM.
        // Never replace a band the user is typing in (inline notes).
        var bodyEl = sections[s].querySelector(':scope > .scw-ws-v2-l1-body');
        if (bodyEl) {
          var cur = bodyEl.querySelector(':scope > [data-scw-ws-v2-mdf-band]');
          if (!(cur && cur.contains(document.activeElement))) {
            var fresh = detailBand({ id: id }, srcKey);
            if (fresh) {
              if (cur) cur.parentNode.replaceChild(fresh, cur);
              else bodyEl.insertBefore(fresh, bodyEl.firstChild);
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
        '<span class="' + P + '-status"></span>' +
        '<button type="button" class="' + P + '-btn ' + P + '-btn--cancel">Cancel</button>' +
        '<button type="button" class="' + P + '-btn ' + P + '-btn--save" disabled>Save</button>' +
      '</div>';

    // Directly after the header wrap (NOT inside the l1-body) so the panel
    // is usable even while the group accordion is collapsed.
    var headWrap = block.querySelector(':scope > .scw-ws-v2-l1-head-wrap');
    if (headWrap && headWrap.nextSibling) {
      block.insertBefore(panel, headWrap.nextSibling);
    } else {
      block.appendChild(panel);
    }

    var saveBtn = panel.querySelector('.' + P + '-btn--save');
    var status  = panel.querySelector('.' + P + '-status');
    var inputs  = panel.querySelectorAll('[data-fk]');
    function markDirty() { saveBtn.disabled = false; }
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

    panel.querySelector('.' + P + '-btn--cancel').addEventListener('click', closePanels);

    // Enter-to-save + tab/click-away-to-save — the rest of the app saves
    // inline fields on blur (SCW notes textarea, direct-edit worksheet
    // cells) rather than requiring an explicit button click; match that
    // here so Tab/Enter behave consistently. The Save button stays for
    // mouse users. Cancel is exempt (blurring into it doesn't autosave).
    for (var ki = 0; ki < inputs.length; ki++) {
      inputs[ki].addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!saveBtn.disabled) doSave();
      });
    }
    panel.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!panel.isConnected) return;   // panel already closed
        if (!panel.contains(document.activeElement) && !saveBtn.disabled) doSave();
      }, 0);
    });

    saveBtn.addEventListener('click', doSave);

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
      saveBtn.disabled = true;
      status.classList.remove('is-err');
      status.textContent = 'Saving…';
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(cfg.viewKey, l1Id),
        type: 'PUT',
        data: JSON.stringify(fields),
        success: function (resp) {
          // Knack's view-based PUT can return 200 while silently DROPPING a
          // field the target view doesn't expose as an inline-editable
          // column — the record is otherwise saved, that one field just
          // never lands. Verify the response actually reflects what we
          // sent before declaring success; otherwise the header retitles
          // optimistically here, then reverts a moment later when
          // model.fetch() below reads the still-unchanged stored value.
          // See bid-review-v2/mdf-manage.js's documented Builder
          // dependency for view_3822/field_1943 — view_3577 needs the
          // same inline-edit column configured for field_1943 (Name).
          var own = Object.prototype.hasOwnProperty;
          var dropped = [];
          for (var fk in fields) {
            if (!own.call(fields, fk)) continue;
            var got = resp && (resp[fk + '_raw'] != null ? resp[fk + '_raw'] : resp[fk]);
            got = stripTags(got == null ? '' : got);
            if (got !== fields[fk]) dropped.push(fk);
          }
          if (dropped.length) {
            saveBtn.disabled = false;
            status.classList.add('is-err');
            status.textContent = 'Save didn’t take — ' + dropped.join(', ') +
              ' isn’t editable on this view (check Knack Builder inline-edit settings).';
            console.warn('[scw-ws-v2-mdf] server dropped field(s) — view is missing ' +
              'inline-edit config for these fields', {
                view: cfg.viewKey, recordId: l1Id, sent: fields, dropped: dropped, response: resp
              });
            return;
          }
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
          saveBtn.disabled = false;
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
  $(document)
    .off('knack-view-render.any.scwWsV2MdfRetrofit')
    .on('knack-view-render.any.scwWsV2MdfRetrofit', function () {
      setTimeout(retrofit, 150);
    });

  injectStyles();

  ns.mdfNotes = { headerControl: headerControl, retrofit: retrofit };
})();
/*** END WORKSHEET V2 — MDF/IDF LOCATION MANAGE *******************************/
