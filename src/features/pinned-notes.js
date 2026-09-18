/*** PINNED PROJECT NOTES (scene_1311) ***************************************
 *
 * docs/deploy-page-redesign.md, Phase I. Up to three project notes flagged
 * FLAG_pinned render as a strip directly under the project header, so the
 * things a PM must know every time they open the project are in their face.
 *
 * The Project Notes grid itself (in its drawer) is re-presented as a list of
 * note cards — date · author, the note text, a Pin / Unpin toggle, and any
 * per-row links the grid carries (e.g. "Push Note to ClickUp and Slack",
 * proxied to the original anchor so Knack's own handler still runs). The raw
 * Knack table stays in the DOM, hidden: it is the data source, the save
 * target and the home of those links. Pinned notes float to the top; with no
 * notes the list shows a plain empty state instead of Knack's "No Data" row.
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
  var CARDS_CLS = 'scw-notes-cards';     // on the view element while the card list owns the surface
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
      /* Pin / Unpin toggle (note cards) */
      '.scw-pin-toggle {',
      '  display: inline-flex; align-items: center; gap: 4px; vertical-align: middle; flex: none;',
      '  padding: 3px 9px; border-radius: 999px; border: 1px solid #dbe4ee; background: #fff;',
      '  color: #475569; font: 600 11px/1.2 system-ui, sans-serif; cursor: pointer;',
      '}',
      '.scw-pin-toggle:hover { border-color: #94a3b8; color: #0f172a; }',
      '.scw-pin-toggle.is-pinned { background: #fef3c7; border-color: #f59e0b; color: #92400e; }',
      '.scw-pin-toggle[disabled] { opacity: 0.6; cursor: default; }',
      /* The note cards that replace the raw grid */
      '.' + CARDS_CLS + ' .kn-table-wrapper, .' + CARDS_CLS + ' table.kn-table, .' + CARDS_CLS + ' > table { display: none !important; }',
      '.scw-notes-list { display: flex; flex-direction: column; gap: 10px; margin: 0 0 12px; font-family: system-ui, sans-serif; }',
      '.scw-note-card {',
      '  padding: 12px 14px 12px 16px; border: 1px solid #e2e8f0; border-left-width: 3px; border-radius: 10px; background: #fff;',
      '}',
      '.scw-note-card.is-pinned { background: #fffbeb; border-color: #fde68a; border-left-color: #f59e0b; }',
      '.scw-note-card__meta { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 11.5px; color: #64748b; }',
      '.scw-note-card__author { font-weight: 600; color: #334155; }',
      '.scw-note-card__meta .scw-pin-toggle { margin-left: auto; }',
      '.scw-note-card__text { font-size: 13.5px; line-height: 1.5; color: #0f172a; white-space: pre-line; overflow-wrap: anywhere; }',
      '.scw-note-card__links { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; }',
      '.scw-note-card__link { background: none; border: 0; padding: 0; cursor: pointer; font: 600 12px/1.2 system-ui, sans-serif; color: #0f4c81; }',
      '.scw-note-card__link:hover { text-decoration: underline; }',
      '.scw-notes-empty {',
      '  padding: 30px 16px; text-align: center; border: 1px dashed #cbd5e1; border-radius: 10px;',
      '  color: #64748b; font: 13px/1.5 system-ui, sans-serif;',
      '}',
      '.scw-notes-empty strong { display: block; color: #334155; font-size: 14px; margin-bottom: 2px; }'
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
  function decode(s) {
    return String(s == null ? '' : s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  function plain(v) {
    return decode(String(v == null ? '' : v).replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li)>/gi, ' ').replace(/<[^>]*>/g, ''))
      .replace(/\s+/g, ' ').trim();
  }
  /** Note body for a card: paragraphs / line breaks kept as newlines. */
  function lines(v) {
    var s = String(v == null ? '' : v)
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '');
    return decode(s).split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); })
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
      body:   lines(rec[F.note]),
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

  // ── Pin / Unpin (view-based PUT through the notes grid) ────────────
  function setPinned(cfg, recordId, on, btn) {
    if (!(window.SCW && typeof SCW.knackAjax === 'function' && typeof SCW.knackRecordUrl === 'function')) return;
    var body = {}; body[cfg.fields.pinned] = on;
    btn.disabled = true;
    SCW.knackAjax({
      url: SCW.knackRecordUrl(cfg.notesView, recordId), type: 'PUT', data: JSON.stringify(body),
      success: function () {
        var v = Knack.views && Knack.views[cfg.notesView];
        if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();  // re-render → strip + cards refresh
        else btn.disabled = false;
      },
      error: function (xhr) {
        btn.disabled = false;
        console.warn('[scw-pinned-notes] pin PUT failed', xhr && xhr.status);
        window.alert('Could not save the pin. Is FLAG_pinned on the Project Notes grid with inline editing on?');
      }
    });
  }
  function pinToggle(cfg, n) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-pin-toggle' + (n.pinned ? ' is-pinned' : '');
    btn.innerHTML = PIN_SVG + (n.pinned ? 'Pinned · unpin' : 'Pin');
    btn.title = n.pinned ? 'Remove from the project header' : 'Show in the project header';
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var now = btn.classList.contains('is-pinned');
      if (!now && pinnedNotes(cfg).length >= cfg.maxPinned) {
        window.alert('Up to ' + cfg.maxPinned + ' notes can be pinned. Unpin one first.');
        return;
      }
      setPinned(cfg, n.id, !now, btn);
    });
    return btn;
  }

  // ── The card list that replaces the raw grid ───────────────────────
  /** Per-row anchors the grid carries outside the note fields (action links,
   *  child-page links). Rendered as card links that proxy the click to the
   *  original anchor, so Knack's own handlers keep working. */
  function rowLinks(tr, F) {
    var out = [];
    if (!tr) return out;
    var skip = {}; skip[F.note] = 1; skip[F.date] = 1; skip[F.author] = 1; skip[F.pinned] = 1;
    var cells = tr.querySelectorAll('td');
    for (var i = 0; i < cells.length; i++) {
      var td = cells[i], key = (td.className.match(/\bfield_\d+\b/) || [])[0];
      if (key && skip[key]) continue;
      var anchors = td.querySelectorAll('a');
      for (var j = 0; j < anchors.length; j++) {
        var label = plain(anchors[j].textContent);
        if (label) out.push({ label: label, a: anchors[j] });
      }
    }
    return out;
  }
  function buildCard(cfg, n, tr) {
    var card = document.createElement('article');
    card.className = 'scw-note-card' + (n.pinned ? ' is-pinned' : '');
    card.setAttribute('data-scw-note-id', n.id);
    var meta = document.createElement('div');
    meta.className = 'scw-note-card__meta';
    meta.innerHTML = (n.author ? '<span class="scw-note-card__author">' + esc(n.author) + '</span>' : '') +
      (n.author && n.date ? '<span>·</span>' : '') +
      (n.date ? '<span class="scw-note-card__date">' + esc(n.date) + '</span>' : '');
    meta.appendChild(pinToggle(cfg, n));
    card.appendChild(meta);
    var text = document.createElement('div');
    text.className = 'scw-note-card__text';
    text.textContent = n.body || n.text || '(empty note)';
    card.appendChild(text);
    var links = rowLinks(tr, cfg.fields);
    if (links.length) {
      var wrap = document.createElement('div');
      wrap.className = 'scw-note-card__links';
      links.forEach(function (l) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'scw-note-card__link';
        b.textContent = l.label + ' ›';
        b.addEventListener('click', function (e) { e.preventDefault(); l.a.click(); });
        wrap.appendChild(b);
      });
      card.appendChild(wrap);
    }
    return card;
  }
  function renderCards(cfg) {
    var view = document.getElementById(cfg.notesView);
    if (!view) return;
    var table = view.querySelector('.kn-table-wrapper') || view.querySelector('table');
    var host = table ? table.parentNode : view;
    var list = view.querySelector('.scw-notes-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'scw-notes-list';
    }
    if (table ? list.nextSibling !== table : list.parentNode !== host) {
      host.insertBefore(list, table || null);
    }
    var F = cfg.fields;
    var notes = records(cfg.notesView).map(function (r) { return noteModel(r, F); });
    // Pinned first, otherwise the grid's own order.
    var pinned = notes.filter(function (n) { return n.pinned; });
    var rest   = notes.filter(function (n) { return !n.pinned; });
    notes = pinned.concat(rest);
    list.innerHTML = '';
    if (!notes.length) {
      list.innerHTML = '<div class="scw-notes-empty"><strong>No notes yet</strong>' +
        'Site access, contacts, gotchas — add the first one with Add Project Note.</div>';
    } else {
      notes.forEach(function (n) {
        var tr = null;
        try { tr = view.querySelector('tbody tr[id="' + n.id + '"]'); } catch (e) { /* odd id */ }
        list.appendChild(buildCard(cfg, n, tr));
      });
    }
    view.classList.add(CARDS_CLS);
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
      try { renderCards(cfg); } catch (e) { /* the raw grid is still there */ }
    }, delay == null ? 150 : delay);
  }
  for (var s = 0; s < SCENES.length; s++) {
    $(document).on('knack-scene-render.' + SCENES[s].sceneId + EVENT_NS, function () { scheduleApply(200); });
    $(document).on('knack-view-render.' + SCENES[s].notesView + EVENT_NS, function () { scheduleApply(50); });
    $(document).on('knack-view-render.' + SCENES[s].headerView + EVENT_NS, function () { scheduleApply(50); });
  }
})();
/*** END PINNED PROJECT NOTES ***********************************************/
