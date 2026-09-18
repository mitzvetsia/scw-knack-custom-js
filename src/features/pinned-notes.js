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
 * Adding a note: the scene carries Knack's own "Add DOC_note" form
 * (view_4162, project connection hidden). The bundle ADOPTS that form —
 * moves it to the top of the notes list, restyles it — so the note is
 * written where the notes are read, with Knack's record rules, validation
 * and confirmation untouched. The "Add Project Note" menu link (a trip to a
 * child page) is hidden once the form is in place; it keeps its native
 * behaviour only on a scene without the form.
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
      // The "add DOC_notes connected to this project" form ON this scene,
      // adopted into the notes list. Auto-detected when blank (a form view
      // on the scene whose source object is the notes grid's object).
      addFormView: 'view_4162',      // "Add DOC_note" (Notes + hidden project connection field_329)
      maxPinned: 3 }
  ];

  var STRIP_ID  = 'scw-pinned-notes';
  var STYLE_ID  = 'scw-pinned-notes-css';
  var EVENT_NS  = '.scwPinnedNotes';
  var CARDS_CLS = 'scw-notes-cards';     // on the view element while the card list owns the surface
  var COLLAPSE_CHARS = 320;              // longer notes start collapsed (Show more)
  var COLLAPSE_LINES = 4;
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
      '.scw-note-card.is-collapsed .scw-note-card__text {',
      '  display: -webkit-box; -webkit-line-clamp: ' + COLLAPSE_LINES + '; -webkit-box-orient: vertical; overflow: hidden;',
      '}',
      '.scw-note-card__more {',
      '  margin-top: 6px; background: none; border: 0; padding: 0; cursor: pointer;',
      '  font: 600 12px/1.2 system-ui, sans-serif; color: #0f4c81;',
      '}',
      '.scw-note-card__more:hover { text-decoration: underline; }',
      '.scw-note-card__links { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; }',
      '.scw-note-card__link { background: none; border: 0; padding: 0; cursor: pointer; font: 600 12px/1.2 system-ui, sans-serif; color: #0f4c81; }',
      '.scw-note-card__link:hover { text-decoration: underline; }',
      '.scw-notes-empty {',
      '  padding: 30px 16px; text-align: center; border: 1px dashed #cbd5e1; border-radius: 10px;',
      '  color: #64748b; font: 13px/1.5 system-ui, sans-serif;',
      '}',
      '.scw-notes-empty strong { display: block; color: #334155; font-size: 14px; margin-bottom: 2px; }',
      '.scw-notes-empty__add { background: none; border: 0; padding: 0; cursor: pointer; font: inherit; font-weight: 600; color: #0f4c81; }',
      /* Inline composer */
      '.scw-notes-compose {',
      '  margin: 0 0 12px; padding: 12px 14px; border: 1px solid #b6c9db; border-radius: 10px; background: #f8fafc;',
      '  display: flex; flex-direction: column; gap: 8px; font-family: system-ui, sans-serif;',
      '}',
      '.scw-notes-compose__text {',
      '  width: 100%; box-sizing: border-box; resize: vertical; min-height: 88px; padding: 8px 10px;',
      '  border: 1px solid #cbd5e1; border-radius: 8px; font: 13.5px/1.5 system-ui, sans-serif; color: #0f172a; background: #fff;',
      '}',
      '.scw-notes-compose__text:focus { outline: 2px solid #163C6E; outline-offset: 1px; border-color: #163C6E; }',
      '.scw-notes-compose__row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
      '.scw-notes-compose__pin { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #334155; }',
      '.scw-notes-compose__hint { color: #94a3b8; }',
      '.scw-notes-compose__status { margin-left: auto; font-size: 12px; color: #64748b; }',
      '.scw-notes-compose__btn {',
      '  padding: 6px 14px; border-radius: 8px; border: 1px solid #dbe4ee; background: #fff; color: #334155;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; cursor: pointer;',
      '}',
      '.scw-notes-compose__btn--primary { background: #163C6E; border-color: #163C6E; color: #fff; }',
      '.scw-notes-compose__btn[disabled] { opacity: 0.6; cursor: default; }',
      /* Knack's own add-note form, adopted at the top of the list */
      '.scw-notes-addform {',
      '  margin: 0 0 12px !important; padding: 12px 14px !important; border: 1px solid #b6c9db; border-radius: 10px; background: #f8fafc;',
      '  font-family: system-ui, sans-serif;',
      '}',
      '.scw-notes-addform .view-header, .scw-notes-addform .kn-title, .scw-notes-addform .kn-label, .scw-notes-addform .kn-instructions { display: none !important; }',
      '.scw-notes-addform .kn-form { margin: 0; }',
      '.scw-notes-addform .kn-input, .scw-notes-addform .kn-input-paragraph, .scw-notes-addform .control { width: 100%; max-width: none; margin: 0 0 8px; }',
      '.scw-notes-addform textarea, .scw-notes-addform .kn-textarea {',
      '  width: 100% !important; max-width: none; box-sizing: border-box; resize: vertical; min-height: 88px; padding: 8px 10px;',
      '  border: 1px solid #cbd5e1; border-radius: 8px; font: 13.5px/1.5 system-ui, sans-serif; color: #0f172a; background: #fff;',
      '}',
      '.scw-notes-addform textarea:focus { outline: 2px solid #163C6E; outline-offset: 1px; border-color: #163C6E; }',
      '.scw-notes-addform .kn-submit { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0; padding: 0; }',
      '.scw-notes-addform .kn-submit .scw-notes-compose__pin { margin-right: auto; }',
      '.scw-notes-addform .kn-submit .kn-button {',
      '  padding: 6px 14px; border-radius: 8px; border: 1px solid #163C6E; background: #163C6E; color: #fff;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; cursor: pointer; margin: 0;',
      '}',
      '.scw-notes-addform .kn-submit .kn-button:hover { background: #0f4c81; border-color: #0f4c81; }',
      '.scw-notes-addform .kn-submit .kn-button.is-loading, .scw-notes-addform .kn-submit .kn-button[disabled] { opacity: 0.6; }',
      '.scw-notes-addform .kn-form-confirmation { display: none !important; }',
      '.scw-notes-addform .kn-message.is-error { margin: 0 0 8px; }',
      /* KTL hide/show chrome on the form view: no button, no arrow, body always open */
      '.scw-notes-addform .ktlHideShowButton, .scw-notes-addform .ktlArrow, .scw-notes-addform [id^="hideShow_view_"] { display: none !important; }',
      '.scw-notes-addform .ktlHideShowSection { display: block !important; }',
      '.scw-notes-addform .kn-form-group, .scw-notes-addform .kn-form-col, .scw-notes-addform .columns, .scw-notes-addform .column {',
      '  width: 100% !important; max-width: none !important; flex: 1 1 100% !important; margin: 0 !important; padding: 0 !important;',
      '}',
      '.scw-notes-saved { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #166534; font: 600 12.5px/1.3 system-ui, sans-serif; }'
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
    // Column headers by index: an action link shown as an ICON has an empty
    // anchor (<a class="kn-action-link"></a> beside <i class="fa fa-send">),
    // so its only label is the header ("Push Note to Clickup and Slack").
    var table = tr.closest && tr.closest('table');
    var ths = table ? table.querySelectorAll('thead th') : [];
    for (var i = 0; i < cells.length; i++) {
      var td = cells[i], key = (td.className.match(/\bfield_\d+\b/) || [])[0];
      if (key && skip[key]) continue;
      var headLabel = ths[i] ? plain(ths[i].textContent) : '';
      // Knack renders link columns several ways: <a class="kn-action-link">,
      // a .kn-action-link wrapper holding an <a>, or (older) a bare span —
      // take the innermost clickable element; label from it, else the header.
      var els = td.querySelectorAll('a, button, .kn-action-link, .kn-link');
      var seen = [];
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (el.querySelector('a, button')) continue;        // wrapper: its child is the target
        if (/\btext-expand\b/.test(el.className)) continue; // Knack's own "view more"
        var label = plain(el.textContent) || plain(el.getAttribute('title')) ||
                    plain(el.getAttribute('aria-label')) || headLabel;
        if (!label || seen.indexOf(el) >= 0) continue;
        seen.push(el);
        out.push({ label: label, a: el });
      }
      // A link cell with plain text and nothing clickable inside: proxy the
      // cell itself (Knack's delegated handler reads the row from the td).
      if (!els.length && /\bkn-table-link\b/.test(td.className)) {
        var t = plain(td.textContent);
        if (t) out.push({ label: t, a: td });
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
    var body = n.body || n.text || '(empty note)';
    text.textContent = body;
    card.appendChild(text);
    // Long notes start collapsed to a few lines with a Show more toggle;
    // short ones show whole.
    if (body.length > COLLAPSE_CHARS || body.split('\n').length > COLLAPSE_LINES) {
      card.classList.add('is-collapsed');
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'scw-note-card__more';
      more.textContent = 'Show more';
      more.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var open = card.classList.toggle('is-collapsed');
        more.textContent = open ? 'Show more' : 'Show less';
      });
      card.appendChild(more);
    }
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
    var addForm = null;
    try { addForm = findOnPageForm(cfg); } catch (e) { /* no form: the link keeps its page */ }
    if (addForm) {
      try { adoptForm(cfg, addForm, view, list); } catch (e) { hideForm(addForm); console.warn('[scw-pinned-notes] add form not adopted', e); }
    } else if (cfg.addFormView && _everAdopted[cfg.addFormView]) {
      formStyle('#scw-deploy-notes-actionbar { display: none !important; }');   // the form is coming back, not the button
    } else {
      formStyle('');
    }
    var F = cfg.fields;
    var notes = records(cfg.notesView).map(function (r) { return noteModel(r, F); });
    // Pinned first, otherwise the grid's own order.
    var pinned = notes.filter(function (n) { return n.pinned; });
    var rest   = notes.filter(function (n) { return !n.pinned; });
    notes = pinned.concat(rest);
    list.innerHTML = '';
    var linkTotal = 0, firstTr = null;
    if (!notes.length) {
      list.innerHTML = '<div class="scw-notes-empty"><strong>No notes yet</strong>' +
        'Site access, contacts, gotchas — <button type="button" class="scw-notes-empty__add" data-notes-compose="1">add the first one</button>.</div>';
    } else {
      notes.forEach(function (n) {
        var tr = null;
        try { tr = view.querySelector('tbody tr[id="' + n.id + '"]'); } catch (e) { /* odd id */ }
        if (tr && !firstTr) firstTr = tr;
        linkTotal += rowLinks(tr, F).length;
        list.appendChild(buildCard(cfg, n, tr));
      });
    }
    view.classList.add(CARDS_CLS);
    // The grid declares an action-link column (e.g. Push Note to ClickUp and
    // Slack) but no row carried an anchor: say so once, with the first row,
    // so a missing button can be diagnosed from the console.
    if (notes.length && !linkTotal && view.querySelector('thead th.kn-table-action-link, thead th.kn-table-link') && !view.__scwNotesLinkWarned) {
      view.__scwNotesLinkWarned = true;
      console.warn('[scw-pinned-notes] action column present but no row links found; first row:',
        firstTr ? firstTr.outerHTML.slice(0, 1500) : '(no row matched a model record; tbody: ' +
          String((view.querySelector('table tbody') || {}).innerHTML || '').slice(0, 600) + ')');
    }
    watchGrid(cfg, view);
  }
  /** Knack can fill / refresh the hidden grid's rows after our pass (action
   *  links, inline-edit refreshes): re-render the cards when they change. */
  function watchGrid(cfg, view) {
    if (view.__scwNotesObs || typeof MutationObserver === 'undefined') return;
    var tbody = view.querySelector('table tbody');
    if (!tbody) return;
    var obs = new MutationObserver(function () {
      if (view.__scwNotesMuted) return;
      scheduleApply(120);
    });
    obs.observe(tbody, { childList: true, subtree: true });
    view.__scwNotesObs = obs;
  }

  // ── The on-page add form, adopted into the notes list ──────────────
  // Knack's own "Add DOC_note" form (project connection hidden) sits on
  // the scene. It is moved to the top of the notes list and restyled: the
  // note is written where the notes are read, and Knack keeps validation,
  // record rules (author / date) and the confirmation. On save the grid is
  // refetched (new card, strip) and the form reloaded for the next note.
  // The pin (no input on the form) is written through the grid afterwards.
  var HEX24 = /^[0-9a-f]{24}$/i;
  var ADDFORM_CLS = 'scw-notes-addform';
  function formInputs(vw) {
    var inputs = {};
    (vw && vw.groups || []).forEach(function (g) {
      (g.columns || []).forEach(function (c) {
        (c.inputs || []).forEach(function (inp) { if (inp && inp.field && inp.field.key) inputs[inp.field.key] = true; });
      });
    });
    return inputs;
  }
  /** Inputs the rendered form carries, by field key (name="field_N" or
   *  id="[view-]field_N"), so detection never depends on Knack's schema. */
  function domInputs(el) {
    var inputs = {}, els = el.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var m = (els[i].getAttribute('name') || '').match(/^field_\d+$/) ||
              (els[i].id || '').match(/field_\d+$/);
      if (m) inputs[m[0]] = true;
    }
    return inputs;
  }
  /** The add-note form ON this scene: { mode:'dom', viewKey, el, inputs } or
   *  null. With addFormView configured the DOM is the source of truth (the
   *  element, a <form> inside); otherwise a form view whose source object is
   *  the notes grid's object is looked up in Knack.views. */
  function findOnPageForm(cfg) {
    var K = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views : null;
    var keys, el, vw;
    if (cfg.addFormView) {
      el = liveFormEl(cfg.addFormView);
      if (!el) return null;
      vw = K && K[cfg.addFormView] && K[cfg.addFormView].model && K[cfg.addFormView].model.view;
      var inputs = domInputs(el), schema = formInputs(vw);
      for (var k in schema) inputs[k] = true;
      return { mode: 'dom', viewKey: cfg.addFormView, el: el, inputs: inputs, live: !!el.querySelector('form') };
    }
    if (!K) return null;
    var notesObj = K[cfg.notesView] && K[cfg.notesView].model && K[cfg.notesView].model.view &&
                   K[cfg.notesView].model.view.source && K[cfg.notesView].model.view.source.object;
    if (!notesObj) return null;
    keys = Object.keys(K);
    for (var i = 0; i < keys.length; i++) {
      var v = K[keys[i]];
      vw = v && v.model && v.model.view;
      if (!vw || vw.type !== 'form' || (vw.action && vw.action !== 'insert')) continue;
      if (!vw.source || vw.source.object !== notesObj) continue;
      el = liveFormEl(keys[i]);
      if (!el) continue;
      var ins = domInputs(el), sch = formInputs(vw);
      for (var k2 in sch) ins[k2] = true;
      return { mode: 'dom', viewKey: keys[i], el: el, inputs: ins, live: !!el.querySelector('form') };
    }
    return null;
  }
  /** Knack re-renders a view by REPLACING its element (sometimes leaving the
   *  old one where we moved it): of every element carrying the id, take the
   *  one with a live <form> (freshest last), else the adopted one showing
   *  Knack's confirmation; stale adopted duplicates are removed. */
  function liveFormEl(viewKey) {
    var all = document.querySelectorAll('[id="' + viewKey + '"]');
    if (!all.length) return null;
    var live = null, adopted = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].querySelector('form')) live = all[i];
      else if (all[i].classList.contains(ADDFORM_CLS)) adopted = all[i];
    }
    var pick = live || adopted;
    for (var j = 0; j < all.length; j++) {
      if (all[j] !== pick && all[j].classList.contains(ADDFORM_CLS) && all[j].parentNode) {
        all[j].parentNode.removeChild(all[j]);
      }
    }
    return pick;
  }
  /** One style element. Before adoption: the form stays out of sight.
   *  Once adopted (ever, on this page load): an un-adopted copy (Knack's
   *  fresh render, until the next pass moves it) stays hidden AND the
   *  proxied "Add Project Note" button is gone for good — the form IS the
   *  add action, and a re-render must never bring the child-page trip back. */
  var _everAdopted = {};
  function formStyle(css) {
    var id = STYLE_ID + '-form';
    var st = document.getElementById(id);
    if (!st) { st = document.createElement('style'); st.id = id; document.head.appendChild(st); }
    if (st.textContent !== css) st.textContent = css;
  }
  function hideForm(form) {
    if (!form || form.mode !== 'dom') return;
    formStyle('#' + form.viewKey + ':not(.' + ADDFORM_CLS + ') { display: none !important; }' +
      (_everAdopted[form.viewKey] ? '\n#scw-deploy-notes-actionbar { display: none !important; }' : ''));
  }
  function adoptedForm(cfg) {
    var view = document.getElementById(cfg.notesView);
    return view ? view.querySelector('.' + ADDFORM_CLS) : null;
  }
  /** Move the form above the card list (a sibling of the list: list
   *  re-renders never touch a draft), restyle, add the Pin checkbox, and
   *  listen for Knack's save. Idempotent; runs on every pass because Knack
   *  re-renders the form after each submit / reload. */
  function imp(el, props) {
    for (var k in props) el.style.setProperty(k, props[k], 'important');
  }
  function adoptForm(cfg, form, view, list) {
    var F = cfg.fields, el = form.el;
    // The ktl accordion that wrapped the form (if any) is an empty shell
    // now: keep it out of sight and out of the nav.
    try {
      var shell = el.parentNode && el.parentNode.closest && el.parentNode.closest('.scw-ktl-accordion');
      if (shell && !shell.contains(view)) shell.style.setProperty('display', 'none', 'important');
    } catch (e) { /* no shell */ }
    el.classList.add(ADDFORM_CLS);
    if (el.parentNode !== list.parentNode || el.nextSibling !== list) {
      list.parentNode.insertBefore(el, list);
    }
    _everAdopted[form.viewKey] = true;
    formStyle('#' + form.viewKey + ':not(.' + ADDFORM_CLS + ') { display: none !important; }\n' +
              '#scw-deploy-notes-actionbar { display: none !important; }');
    // KTL / legacy chrome on the view host (colored box, hide/show button,
    // orange centered submit) is applied with !important: inline
    // !important is the only thing that wins.
    imp(el, { background: '#f8fafc', 'background-color': '#f8fafc', padding: '12px 14px', margin: '0 0 12px',
              border: '1px solid #b6c9db', 'border-radius': '10px', 'box-shadow': 'none', 'max-width': 'none', width: 'auto' });
    var ta = el.querySelector('textarea');
    if (ta) {
      if (!ta.getAttribute('placeholder')) {
        ta.setAttribute('placeholder', 'What should the team know? Site access, contacts, gotchas, status…');
        ta.rows = 4;
      }
      imp(ta, { width: '100%', 'max-width': 'none', 'min-height': '88px', 'box-sizing': 'border-box', resize: 'vertical',
                padding: '8px 10px', border: '1px solid #cbd5e1', 'border-radius': '8px', background: '#fff',
                font: '13.5px/1.5 system-ui, sans-serif', color: '#0f172a', margin: '0' });
    }
    var formEl = el.querySelector('form');
    var submit = formEl && formEl.querySelector('button[type="submit"], input[type="submit"]');
    if (submit) {
      if (submit.tagName === 'BUTTON' && /^submit$/i.test(plain(submit.textContent))) submit.textContent = 'Save note';
      else if (submit.tagName === 'INPUT' && /^submit$/i.test(submit.value)) submit.value = 'Save note';
      imp(submit, { width: 'auto', display: 'inline-flex', margin: '0', padding: '7px 16px', 'border-radius': '8px',
                    border: '1px solid #163C6E', background: '#163C6E', 'background-color': '#163C6E', color: '#fff',
                    font: '600 13px/1.2 system-ui, sans-serif', 'font-size': '13px', 'box-shadow': 'none' });
    }
    // Pin to the header: the form has no FLAG_pinned input, so the choice
    // rides along and is written through the grid once Knack hands back
    // the record.
    if (!form.inputs[F.pinned] && submit && submit.parentNode) {
      var row = submit.parentNode;
      var pin = row.querySelector('.scw-notes-compose__pin');
      var atCap = pinnedNotes(cfg).length >= cfg.maxPinned;
      if (!pin) {
        pin = document.createElement('label');
        pin.className = 'scw-notes-compose__pin';
        pin.innerHTML = '<input type="checkbox" name="scw_pin"> Pin to project header <span class="scw-notes-compose__hint"></span>';
        row.insertBefore(pin, submit);
      }
      var cb = pin.querySelector('input');
      cb.disabled = atCap;
      if (atCap) cb.checked = false;
      pin.querySelector('.scw-notes-compose__hint').textContent = atCap ? '(' + cfg.maxPinned + ' already pinned)' : '';
    }
    if (formEl && !formEl.__scwNotesBound) {
      formEl.__scwNotesBound = true;
      formEl.addEventListener('submit', function () {
        var cb = el.querySelector('input[name="scw_pin"]');
        _pendingPin[form.viewKey] = !!(cb && cb.checked && !cb.disabled);
      });
    }
    bindSave(cfg, form.viewKey);
  }
  /** Our own "Note saved." line at the top of the notes list (Knack's
   *  confirmation is hidden: the form reloads on its own). */
  function flashSaved(cfg, text) {
    var view = document.getElementById(cfg.notesView);
    var list = view && view.querySelector('.scw-notes-list');
    if (!list) return;
    var n = view.querySelector('.scw-notes-saved');
    if (!n) { n = document.createElement('div'); n.className = 'scw-notes-saved'; }
    n.textContent = text;
    list.parentNode.insertBefore(n, list);
    clearTimeout(n.__t);
    n.__t = setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 2500);
  }
  var _pendingPin = {}, _boundSave = {}, _lastSaved = {};
  function bindSave(cfg, viewKey) {
    if (_boundSave[viewKey]) return;
    _boundSave[viewKey] = true;
    var ns = EVENT_NS + 'Save';
    // record-create proves the POST landed (and carries the record);
    // form-submit may fire too — one save, one refresh.
    $(document).on('knack-record-create.' + viewKey + ns, function (e, view, record) { onSaved(cfg, viewKey, record); });
    $(document).on('knack-form-submit.' + viewKey + ns, function (e, view, record) { setTimeout(function () { onSaved(cfg, viewKey, record); }, 400); });
  }
  function onSaved(cfg, viewKey, record) {
    var newId = record && (record.id || (record.record && record.record.id)) || '';
    var key = newId || 'anon', now = Date.now();
    if (_lastSaved[viewKey] && _lastSaved[viewKey].key === key && now - _lastSaved[viewKey].at < 3000) return;
    _lastSaved[viewKey] = { key: key, at: now };
    var wantPin = !!_pendingPin[viewKey];
    _pendingPin[viewKey] = false;
    var refetch = function () {
      var v = Knack.views && Knack.views[cfg.notesView];
      if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();   // re-render → new card + strip
    };
    if (wantPin && newId && window.SCW && typeof SCW.knackAjax === 'function' && typeof SCW.knackRecordUrl === 'function') {
      var body = {}; body[cfg.fields.pinned] = true;
      SCW.knackAjax({ url: SCW.knackRecordUrl(cfg.notesView, newId), type: 'PUT', data: JSON.stringify(body),
        success: refetch,
        error: function (xhr) { console.warn('[scw-pinned-notes] pin after add failed', xhr && xhr.status); refetch(); } });
    } else {
      refetch();
    }
    flashSaved(cfg, 'Note saved.');
    // Knack swaps the form for its confirmation ("Reload form"): reload it
    // so the next note finds a live form. If Knack dropped the element
    // instead (a view re-render replaces elements), render it again.
    setTimeout(function () {
      var el = liveFormEl(viewKey);
      var reload = el && el.querySelector('.kn-form-reload');
      if (reload) reload.click();
    }, 900);
    setTimeout(function () {
      var el = liveFormEl(viewKey);
      if (el && el.querySelector('form')) { scheduleApply(0); return; }
      var v = Knack.views && Knack.views[viewKey];
      try {
        if (v && typeof v.renderForm === 'function') v.renderForm();
        else if (v && typeof v.render === 'function') v.render();
        else console.warn('[scw-pinned-notes] add form gone after save and Knack.views has no renderer for', viewKey);
      } catch (e) { console.warn('[scw-pinned-notes] add form re-render failed', e); }
      scheduleApply(300);
    }, 2500);
  }
  function focusForm(cfg) {
    var el = adoptedForm(cfg);
    var ta = el && el.querySelector('textarea');
    if (!ta) return false;
    try { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* optional */ }
    try { ta.focus(); } catch (e) { /* focus is a courtesy */ }
    return true;
  }

  // ── Fallback composer (scenes without the on-page form) ───────────────
  // The "Add Project Note" menu link points at a child page whose form adds
  // a DOC_notes record connected to the project. The app schema
  // (Knack.scenes) has that page — matched by the link's URL slug — and its
  // form view: the connection key to the project and the inputs it carries.
  // Posting through that form view (view-based POST, session token) runs
  // the same record rules as the page would. If the form can't be found
  // the link keeps its native behaviour.
  function ctaLink() {
    return document.getElementById('scw-deploy-notes-cta') ||
      document.querySelector('#kn-scene_1311 .kn-menu a[href*="add-project-note"]');
  }
  /** { sceneKey, viewKey, connKey, inputs:{field_X:true}, projectId } or null */
  function findAddForm() {
    var a = ctaLink();
    var href = a ? (a.getAttribute('href') || '') : '';
    var segs = href.split('#')[1] ? href.split('#')[1].split('/') : [];
    var slug = '', projectId = '';
    for (var i = segs.length - 1; i >= 0; i--) {
      if (HEX24.test(segs[i])) { if (!projectId) projectId = segs[i]; continue; }
      slug = segs[i]; break;
    }
    if (!slug || !projectId) return null;
    var scenes = (typeof Knack !== 'undefined' && Knack.scenes && Knack.scenes.models) || [];
    for (var s = 0; s < scenes.length; s++) {
      var sc = scenes[s], at = sc.attributes || sc;
      if (at.slug !== slug) continue;
      var views = (sc.views && sc.views.models ? sc.views.models.map(function (v) { return v.attributes || v; }) : at.views) || [];
      for (var v = 0; v < views.length; v++) {
        var vw = views[v];
        if (vw.type !== 'form' || (vw.action && vw.action !== 'insert')) continue;
        var inputs = {};
        (vw.groups || []).forEach(function (g) {
          (g.columns || []).forEach(function (c) {
            (c.inputs || []).forEach(function (inp) { if (inp && inp.field && inp.field.key) inputs[inp.field.key] = true; });
          });
        });
        return { mode: 'post', sceneKey: at.key || sc.id, viewKey: vw.key, connKey: (vw.source && vw.source.connection_key) || '',
                 inputs: inputs, projectId: projectId };
      }
    }
    return null;
  }
  function today() {
    var d = new Date();
    return (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '/' + (d.getDate() < 10 ? '0' : '') + d.getDate() + '/' + d.getFullYear();
  }
  function postNote(cfg, form, text, pin, cb) {
    var F = cfg.fields, body = {};
    body[F.note] = text;
    if (form.connKey) body[form.connKey] = form.projectId;
    if (form.inputs[F.pinned]) body[F.pinned] = !!pin;
    if (form.inputs[F.date]) body[F.date] = today();
    if (form.inputs[F.author]) {
      var u = null;
      try { u = Knack.getUserAttributes(); } catch (e) { /* no user */ }
      if (u && u.id) body[F.author] = u.id;
    }
    SCW.knackAjax({
      url: Knack.api_url + '/v1/pages/' + form.sceneKey + '/views/' + form.viewKey + '/records',
      type: 'POST', data: JSON.stringify(body),
      success: function (res) { cb(null, res); },
      error: function (xhr) { cb(new Error('HTTP ' + (xhr && xhr.status))); }
    });
  }
  function openComposer(cfg, form) {
    var view = document.getElementById(cfg.notesView);
    var list = view && view.querySelector('.scw-notes-list');
    if (!list) return false;
    var box = view.querySelector('.scw-notes-compose');
    if (box) { box.querySelector('textarea').focus(); return true; }
    box = document.createElement('form');
    box.className = 'scw-notes-compose';
    // Pin: set by the form when it carries the flag, else by a PUT through
    // the notes grid on the record Knack hands back.
    var canPin = form.inputs[cfg.fields.pinned] ||
      !!(window.SCW && typeof SCW.knackAjax === 'function' && typeof SCW.knackRecordUrl === 'function');
    var atCap = pinnedNotes(cfg).length >= cfg.maxPinned;
    box.innerHTML =
      '<textarea class="scw-notes-compose__text" rows="4" placeholder="What should the team know? Site access, contacts, gotchas, status…" required></textarea>' +
      '<div class="scw-notes-compose__row">' +
        (canPin ? '<label class="scw-notes-compose__pin"><input type="checkbox" name="pin"' + (atCap ? ' disabled' : '') + '> Pin to project header' +
          (atCap ? ' <span class="scw-notes-compose__hint">(' + cfg.maxPinned + ' already pinned)</span>' : '') + '</label>' : '') +
        '<span class="scw-notes-compose__status" aria-live="polite"></span>' +
        '<button type="button" class="scw-notes-compose__btn" data-compose-cancel="1">Cancel</button>' +
        '<button type="submit" class="scw-notes-compose__btn scw-notes-compose__btn--primary">Save note</button>' +
      '</div>';
    list.parentNode.insertBefore(box, list);   // a sibling: list re-renders never touch the draft
    var ta = box.querySelector('textarea'), status = box.querySelector('.scw-notes-compose__status');
    var submit = box.querySelector('[type="submit"]');
    function close() { if (box.parentNode) box.parentNode.removeChild(box); }
    box.querySelector('[data-compose-cancel]').addEventListener('click', close);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    box.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      var pinEl = box.querySelector('input[name="pin"]');
      submit.disabled = true; status.textContent = 'Saving…';
      var wantPin = !!(pinEl && pinEl.checked);
      postNote(cfg, form, text, wantPin, function (err, record) {
        if (err) {
          submit.disabled = false;
          status.textContent = 'Could not save (' + err.message + '). Try again, or use the Knack page.';
          console.warn('[scw-pinned-notes] add note failed', err);
          return;
        }
        close();
        var refetch = function () {
          var v = Knack.views && Knack.views[cfg.notesView];
          if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();   // re-render → new card + strip
        };
        var newId = record && (record.id || (record.record && record.record.id));
        if (wantPin && !form.inputs[cfg.fields.pinned] && newId &&
            window.SCW && typeof SCW.knackAjax === 'function' && typeof SCW.knackRecordUrl === 'function') {
          var body = {}; body[cfg.fields.pinned] = true;
          SCW.knackAjax({ url: SCW.knackRecordUrl(cfg.notesView, newId), type: 'PUT', data: JSON.stringify(body),
            success: refetch,
            error: function (xhr) { console.warn('[scw-pinned-notes] pin after add failed', xhr && xhr.status); refetch(); } });
        } else {
          refetch();
        }
      });
    });
    try { ta.focus(); } catch (e) { /* focus is a courtesy */ }
    return true;
  }
  // The empty state's hint (and the action-bar link, on a scene without the
  // on-page form) — focus the adopted form, else open the fallback composer;
  // without a discoverable form the link keeps its native page.
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('#scw-deploy-notes-cta, [data-notes-compose]');
    if (!t) return;
    var cfg = activeScene();
    if (!cfg) return;
    if (focusForm(cfg)) { e.preventDefault(); e.stopPropagation(); return; }
    var form = findAddForm();
    if (!form) return;
    if (openComposer(cfg, form)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // ── Orchestration ─────────────────────────────────────────────────
  var _timer = null;
  function scheduleApply(delay) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () {
      _timer = null;
      var cfg = activeScene();
      if (!cfg) return;
      injectStyles();
      // Until the notes list adopts it, the form stays out of sight.
      try { var f0 = findOnPageForm(cfg); if (f0 && !f0.el.classList.contains(ADDFORM_CLS)) hideForm(f0); } catch (e) { /* form stays visible */ }
      try { renderStrip(cfg); } catch (e) { /* strip is optional chrome */ }
      try { renderCards(cfg); } catch (e) { /* the raw grid is still there */ }
    }, delay == null ? 150 : delay);
  }
  for (var s = 0; s < SCENES.length; s++) {
    $(document).on('knack-scene-render.' + SCENES[s].sceneId + EVENT_NS, function () { scheduleApply(200); });
    $(document).on('knack-view-render.' + SCENES[s].notesView + EVENT_NS, function () { scheduleApply(50); });
    $(document).on('knack-view-render.' + SCENES[s].headerView + EVENT_NS, function () { scheduleApply(50); });
  }
  // The adopted add form re-renders after each submit / reload: re-dress it.
  $(document).on('knack-view-render.any' + EVENT_NS, function () { if (activeScene()) scheduleApply(100); });
})();
/*** END PINNED PROJECT NOTES ***********************************************/
