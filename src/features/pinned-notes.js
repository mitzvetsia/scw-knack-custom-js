/*** PINNED PROJECT NOTES (scene_1311) ***************************************
 *
 * docs/deploy-page-redesign.md, Phase I. Up to three project notes flagged
 * FLAG_pinned render as a strip directly under the project header, so the
 * things a PM must know every time they open the project are in their face;
 * the Project Notes grid (in its drawer) gets a Pin / Unpin toggle per row
 * and floats pinned rows to the top.
 *
 * Data: DOC_notes via the deploy scene's Project Notes grid (view_4135).
 * The pin flag saves through that view (view-based PUT, the session token)
 * — the column must be on the grid with inline editing on. Pins are shared:
 * everyone who opens the project sees the same strip.
 ****************************************************************************/
(function () {
  'use strict';

  var SCENES = [
    { sceneId: 'scene_1311',
      notesView: 'view_4135',
      headerView: 'view_3938',        // the strip mounts right after this view
      fields: { pinned: 'field_3278', note: 'field_328', date: 'field_327', author: 'field_678' },
      maxPinned: 3 }
  ];

  var STRIP_ID  = 'scw-pinned-notes';
  var STYLE_ID  = 'scw-pinned-notes-css';
  var EVENT_NS  = '.scwPinnedNotes';
  var PIN_SVG   = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M9 3h6l-1 7 3 3H7l3-3z"></path></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '#' + STRIP_ID + ' {',
      '  width: 100%; max-width: 100%; box-sizing: border-box;',
      '  grid-column: 1 / -1; flex: 1 1 100%;',
      '  display: flex; align-items: center; gap: 10px; margin: 0 0 10px;',
      '  font: 13px/1.4 system-ui, sans-serif; color: #0f172a;',
      '}',
      '.scw-pin-label {',
      '  display: inline-flex; align-items: center; gap: 5px; flex: none;',
      '  font: 700 10.5px/1 system-ui, sans-serif; letter-spacing: 0.1em;',
      '  text-transform: uppercase; color: #92400e;',
      '}',
      '.scw-pin-note {',
      '  display: flex; align-items: center; gap: 10px; flex: 1 1 0; min-width: 0;',
      '  padding: 7px 10px; border-radius: 8px; background: #fffbeb; border: 1px solid #fde68a;',
      '  cursor: pointer; text-align: left; font: inherit; color: inherit;',
      '}',
      '.scw-pin-note:hover { border-color: #f59e0b; }',
      '.scw-pin-note__text { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; }',
      '.scw-pin-note__meta { flex: none; font-size: 11px; color: #92400e; white-space: nowrap; }',
      '.scw-pin-all { flex: none; background: none; border: 0; padding: 0; cursor: pointer; font: 600 12px/1.2 system-ui, sans-serif; color: #0f4c81; }',
      /* Row toggle inside the notes grid */
      '.scw-pin-toggle {',
      '  display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; vertical-align: middle;',
      '  padding: 2px 8px; border-radius: 999px; border: 1px solid #dbe4ee; background: #fff;',
      '  color: #475569; font: 600 11px/1.2 system-ui, sans-serif; cursor: pointer;',
      '}',
      '.scw-pin-toggle.is-pinned { background: #fef3c7; border-color: #f59e0b; color: #92400e; }',
      '.scw-pin-toggle[disabled] { opacity: 0.6; cursor: default; }',
      'tr.scw-pin-row-pinned > td { background: #fffbeb !important; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function plain(v) {
    return String(v == null ? '' : v).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function isYes(v) {
    if (v === true) return true;
    return /^(yes|true|on|1)$/i.test(String(v == null ? '' : v).trim());
  }
  function activeScene() {
    for (var i = 0; i < SCENES.length; i++) {
      if (document.getElementById('kn-' + SCENES[i].sceneId)) return SCENES[i];
    }
    return null;
  }
  function records(viewId) {
    var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewId] : null;
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return [];
    return models.map(function (m) { return m.attributes || (m.toJSON ? m.toJSON() : m); });
  }
  function noteModel(rec, F) {
    var authorRaw = rec[F.author + '_raw'];
    var author = Array.isArray(authorRaw) ? (authorRaw[0] && authorRaw[0].identifier) || '' : plain(rec[F.author]);
    return {
      id:     rec.id,
      pinned: isYes(rec[F.pinned + '_raw'] != null ? rec[F.pinned + '_raw'] : rec[F.pinned]),
      text:   plain(rec[F.note]),
      date:   plain(rec[F.date]),
      author: author
    };
  }
  function pinnedNotes(cfg) {
    return records(cfg.notesView).map(function (r) { return noteModel(r, cfg.fields); })
      .filter(function (n) { return n.pinned; });
  }

  // ── The strip under the project header ─────────────────────────────
  function openNotes(cfg) {
    var api = window.SCW && SCW.deployNav;
    if (api && typeof api.openSection === 'function' && api.openSection(/^project notes$/i)) return;
    var v = document.getElementById(cfg.notesView);
    if (v) { try { v.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { v.scrollIntoView(); } }
  }

  function renderStrip(cfg) {
    var header = document.getElementById(cfg.headerView);
    var strip = document.getElementById(STRIP_ID);
    var notes = pinnedNotes(cfg).slice(0, cfg.maxPinned);
    if (!header || !notes.length) {
      if (strip && strip.parentNode) strip.parentNode.removeChild(strip);
      return;
    }
    var sig = notes.map(function (n) { return n.id + ':' + n.text + ':' + n.date; }).join('|');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = STRIP_ID;
    }
    if (strip.previousElementSibling !== header) {
      header.parentNode.insertBefore(strip, header.nextSibling);
    }
    if (strip.getAttribute('data-scw-sig') === sig) return;
    strip.setAttribute('data-scw-sig', sig);
    strip.innerHTML = '<span class="scw-pin-label">' + PIN_SVG + 'Pinned</span>' +
      notes.map(function (n) {
        var meta = [n.author, n.date].filter(Boolean).join(' · ');
        return '<button type="button" class="scw-pin-note" title="' + esc(n.text) + '">' +
          '<span class="scw-pin-note__text">' + esc(n.text) + '</span>' +
          (meta ? '<span class="scw-pin-note__meta">' + esc(meta) + '</span>' : '') +
        '</button>';
      }).join('') +
      '<button type="button" class="scw-pin-all">All notes ›</button>';
    var open = function () { openNotes(cfg); };
    var btns = strip.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', open);
  }

  // ── Pin / Unpin toggle on each grid row ─────────────────────────────
  function setPinned(cfg, recordId, on, btn) {
    if (!(window.SCW && typeof SCW.knackAjax === 'function' && typeof SCW.knackRecordUrl === 'function')) return;
    var body = {}; body[cfg.fields.pinned] = on;
    btn.disabled = true;
    SCW.knackAjax({
      url: SCW.knackRecordUrl(cfg.notesView, recordId), type: 'PUT', data: JSON.stringify(body),
      success: function () {
        var v = Knack.views && Knack.views[cfg.notesView];
        if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();  // re-render → strip + rows refresh
        else btn.disabled = false;
      },
      error: function (xhr) {
        btn.disabled = false;
        console.warn('[scw-pinned-notes] pin PUT failed', xhr && xhr.status);
        window.alert('Could not save the pin. Is FLAG_pinned on the Project Notes grid with inline editing on?');
      }
    });
  }

  function decorateGrid(cfg) {
    var view = document.getElementById(cfg.notesView);
    var tbody = view && view.querySelector('table tbody');
    if (!tbody) return;
    var F = cfg.fields;
    var byId = {};
    records(cfg.notesView).forEach(function (r) { byId[r.id] = noteModel(r, F); });
    var rows = tbody.querySelectorAll('tr[id]');
    var pinnedRows = [];
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i], n = byId[tr.id];
      if (!n) continue;
      var cell = tr.querySelector('td.' + F.note) || tr.querySelector('td');
      if (!cell) continue;
      tr.classList.toggle('scw-pin-row-pinned', n.pinned);
      var btn = cell.querySelector('.scw-pin-toggle');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scw-pin-toggle';
        cell.insertBefore(btn, cell.firstChild);
        (function (rid, b) {
          b.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            var now = b.classList.contains('is-pinned');
            if (!now && pinnedNotes(cfg).length >= cfg.maxPinned) {
              window.alert('Up to ' + cfg.maxPinned + ' notes can be pinned. Unpin one first.');
              return;
            }
            setPinned(cfg, rid, !now, b);
          });
        })(tr.id, btn);
      }
      btn.classList.toggle('is-pinned', n.pinned);
      btn.innerHTML = PIN_SVG + (n.pinned ? 'Pinned · unpin' : 'Pin');
      btn.title = n.pinned ? 'Remove from the project header' : 'Show in the project header';
      if (n.pinned) pinnedRows.push(tr);
    }
    // Pinned rows float to the top, in their existing relative order.
    for (var p = pinnedRows.length - 1; p >= 0; p--) {
      if (tbody.firstChild !== pinnedRows[p]) tbody.insertBefore(pinnedRows[p], tbody.firstChild);
    }
  }

  // ── Orchestration ─────────────────────────────────────────────────
  var _timer = null;
  function scheduleApply(delay) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () {
      _timer = null;
      var cfg = activeScene();
      if (!cfg) return;
      injectStyles();
      try { renderStrip(cfg); } catch (e) { /* strip is optional chrome */ }
      try { decorateGrid(cfg); } catch (e) { /* toggles are optional */ }
    }, delay == null ? 150 : delay);
  }
  for (var s = 0; s < SCENES.length; s++) {
    $(document).on('knack-scene-render.' + SCENES[s].sceneId + EVENT_NS, function () { scheduleApply(200); });
    $(document).on('knack-view-render.' + SCENES[s].notesView + EVENT_NS, function () { scheduleApply(50); });
    $(document).on('knack-view-render.' + SCENES[s].headerView + EVENT_NS, function () { scheduleApply(50); });
  }
})();
/*** END PINNED PROJECT NOTES ***********************************************/
