/*** CLOSEOUT DELIVERABLES STRIP ***
 *
 * Renders the project's closeout deliverables as a strip of cards on
 * view_3940 (INSTALL_closeouts), mirroring the photo-strip UX from
 * inline-photo-row.js.  Each card represents one DOC record connected
 * to the closeout — file slot + required/complete badges, click to
 * upload/edit via the Knack form for that doc.
 *
 * Data contract (closeout row on view_3940):
 *   field_2877 — CONFIG_file type  (connection-displayed names of connected DOCs)
 *   field_2894 — FLAG_required     (per-doc Yes/No)
 *   field_2895 — FLAG_complete     (per-doc Yes/No)
 *   field_68   — INPUT_upload doc  (per-doc file URL, when present)
 *
 * Each <span id="docRecordId" data-kn="connection-value"> inside those
 * cells is keyed by the DOC record id — same connection-value pattern
 * the photo strip uses.
 *
 * URL slugs (placeholders — rename in Knack and update here):
 *   add-doc-to-closeout/{closeoutId}     — Knack form for new DOC
 *   edit-closeout-doc/{docId}            — Knack form for editing a DOC
 */
(function () {
  'use strict';

  var VIEW_ID = 'view_3940';

  // Connection-displayed columns on view_3940 (each row has one
  // connection-value span per connected DOC, keyed by DOC record id).
  var F = {
    type:      'field_2877',
    required:  'field_2894',
    completed: 'field_2895',
    file:      'field_68'
  };

  // Placeholder slugs — rename to match the Knack pages you create.
  var ADD_DOC_SLUG  = 'add-doc-to-closeout';
  var EDIT_DOC_SLUG = 'edit-closeout-doc';

  // ── CSS injection ────────────────────────────────────────────────

  function injectCSS() {
    if (document.getElementById('scw-closeout-deliverables-css')) return;
    var css = [
      /* Hide the raw closeout table — we replace it with the strip card. */
      '#' + VIEW_ID + ' > .kn-records-nav,',
      '#' + VIEW_ID + ' > .kn-table-wrapper { display: none; }',

      /* Container card */
      '.scw-cd-card {',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  padding: 18px 20px; margin-top: 8px;',
      '  box-shadow: 0 1px 2px rgba(0,0,0,0.04);',
      '}',
      '.scw-cd-card__head {',
      '  display: flex; align-items: baseline; justify-content: space-between;',
      '  margin-bottom: 14px;',
      '}',
      '.scw-cd-card__title {',
      '  font-size: 14px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: 0.04em; color: #374151;',
      '}',
      '.scw-cd-card__meta {',
      '  font-size: 11px; color: #6b7280;',
      '}',

      /* Strip — horizontal row of doc cards */
      '.scw-cd-strip {',
      '  display: flex; flex-wrap: wrap; gap: 12px; align-items: stretch;',
      '}',

      /* Individual doc card */
      '.scw-cd-doc {',
      '  display: flex; flex-direction: column;',
      '  width: 160px; min-height: 180px;',
      '  border-radius: 8px; border: 1px solid #e5e7eb;',
      '  background: #fff; padding: 10px;',
      '  cursor: pointer; transition: all 0.15s;',
      '  position: relative;',
      '}',
      '.scw-cd-doc:hover {',
      '  border-color: #9ca3af; box-shadow: 0 2px 6px rgba(0,0,0,0.06);',
      '  transform: translateY(-1px);',
      '}',

      /* Empty + required = amber dashed (matches photo "Required" placeholder) */
      '.scw-cd-doc.is-missing {',
      '  border: 2px dashed #fbbf24; background: #fffbeb;',
      '}',
      '.scw-cd-doc.is-missing:hover {',
      '  background: #fef3c7; border-color: #f59e0b;',
      '}',

      /* Empty + optional = light dashed grey */
      '.scw-cd-doc.is-empty-optional {',
      '  border: 2px dashed #d1d5db; background: #f9fafb;',
      '}',

      /* Filled + complete = solid green tint */
      '.scw-cd-doc.is-complete {',
      '  border-color: #86efac; background: #f0fdf4;',
      '}',

      /* Filled but not flagged complete = neutral */
      '.scw-cd-doc.is-uploaded { border-color: #93c5fd; background: #eff6ff; }',

      /* Thumbnail / icon area */
      '.scw-cd-doc__thumb {',
      '  flex: 1; display: flex; align-items: center; justify-content: center;',
      '  background: #f3f4f6; border-radius: 6px; margin-bottom: 8px;',
      '  min-height: 100px;',
      '}',
      '.scw-cd-doc.is-missing .scw-cd-doc__thumb,',
      '.scw-cd-doc.is-empty-optional .scw-cd-doc__thumb { background: transparent; }',
      '.scw-cd-doc.is-complete .scw-cd-doc__thumb { background: #ffffff; }',

      /* Icons */
      '.scw-cd-doc__icon {',
      '  display: flex; flex-direction: column; align-items: center; gap: 4px;',
      '  color: #6b7280; font-size: 11px; text-align: center; padding: 8px;',
      '}',
      '.scw-cd-doc.is-missing .scw-cd-doc__icon { color: #b45309; }',
      '.scw-cd-doc.is-complete .scw-cd-doc__icon { color: #15803d; }',
      '.scw-cd-doc__icon svg { width: 32px; height: 32px; }',
      '.scw-cd-doc__icon-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }',

      /* Type label */
      '.scw-cd-doc__type {',
      '  font-size: 12px; font-weight: 700; color: #1f2937; line-height: 1.3;',
      '  margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis;',
      '  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;',
      '  min-height: 32px;',
      '}',

      /* Required chip — mirrors photo strip pattern */
      '.scw-cd-doc__chip {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  font-size: 10px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: 0.04em; padding: 2px 8px; border-radius: 999px;',
      '  align-self: flex-start;',
      '}',
      '.scw-cd-doc__chip.is-req-missing {',
      '  background: #fef3c7; color: #b45309; border: 1px solid #fbbf24;',
      '}',
      '.scw-cd-doc__chip.is-req-done {',
      '  background: #dcfce7; color: #15803d; border: 1px solid #86efac;',
      '}',
      '.scw-cd-doc__chip.is-optional {',
      '  background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db;',
      '}',

      /* "Add another" — for optional docs the user wants to attach beyond required set */
      '.scw-cd-add {',
      '  display: flex; flex-direction: column; align-items: center; justify-content: center;',
      '  width: 160px; min-height: 180px;',
      '  border: 2px dashed #d1d5db; border-radius: 8px;',
      '  background: #fafbfc; color: #6b7280;',
      '  font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s;',
      '}',
      '.scw-cd-add:hover {',
      '  border-color: #3b82f6; background: #eff6ff; color: #1d4ed8;',
      '}',
      '.scw-cd-add__plus { font-size: 32px; font-weight: 300; line-height: 1; margin-bottom: 4px; }',

      /* Empty-state when no docs are connected at all */
      '.scw-cd-empty {',
      '  text-align: center; color: #6b7280; padding: 40px 20px;',
      '  font-size: 13px;',
      '}'
    ].join('\n');

    var s = document.createElement('style');
    s.id = 'scw-closeout-deliverables-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── DOC extraction ───────────────────────────────────────────────

  /**
   * Walk the closeout row's connection-displayed cells and assemble a
   * map of DOC records keyed by record id, then return as a sorted list.
   *
   * Each DOC record on the closeout view shows up as a
   * <span id="docRecordId" data-kn="connection-value"> in each of the
   * type / required / completed / file columns.
   */
  function extractDocsFromRow(tr) {
    var docs = {};
    function ensure(id) {
      if (!docs[id]) {
        docs[id] = {
          id: id, type: '', typeId: '',
          required: false, completed: false, fileUrl: '', fileName: ''
        };
      }
      return docs[id];
    }
    function eachSpan(cellKey, apply) {
      var cell = tr.querySelector('td.' + cellKey);
      if (!cell) return;
      var spans = cell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var i = 0; i < spans.length; i++) {
        var id = (spans[i].id || '').trim();
        if (!id) continue;
        apply(ensure(id), spans[i]);
      }
    }
    eachSpan(F.type, function (rec, span) {
      var inner = span.querySelector('span[data-kn="connection-value"]');
      rec.type   = inner ? inner.textContent.trim() : span.textContent.trim();
      rec.typeId = inner ? (inner.className || '').trim() : '';
    });
    eachSpan(F.required, function (rec, span) {
      var v = (span.textContent || '').trim().toLowerCase();
      rec.required = (v === 'yes' || v === 'true');
    });
    eachSpan(F.completed, function (rec, span) {
      var v = (span.textContent || '').trim().toLowerCase();
      rec.completed = (v === 'yes' || v === 'true');
    });
    // File field — Knack renders connected file fields with either an
    // <a href="..."> link OR an inner span wrapping a link.  Pick up the
    // first anchor we can find inside the per-doc span.
    eachSpan(F.file, function (rec, span) {
      var a = span.querySelector('a[href]');
      if (a) {
        rec.fileUrl  = a.getAttribute('href') || '';
        rec.fileName = (a.getAttribute('data-file-name') || a.textContent || '').trim();
      }
    });

    // Sort: missing-required first, then alphabetical by type
    var out = [];
    for (var k in docs) if (docs.hasOwnProperty(k)) out.push(docs[k]);
    out.sort(function (a, b) {
      var ar = a.required && !a.completed ? 0 : 1;
      var br = b.required && !b.completed ? 0 : 1;
      if (ar !== br) return ar - br;
      return (a.type || '').localeCompare(b.type || '');
    });
    return out;
  }

  // ── URL helpers ──────────────────────────────────────────────────

  /** Resolve the deploy-scene base URL from the current hash. */
  function deployBasePath() {
    var hash = window.location.hash || '';
    var m = hash.match(
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/deploy\/[a-f0-9]{24})/
    );
    return m ? m[1] : '';
  }

  function addDocHash(closeoutId) {
    var base = deployBasePath();
    if (!base || !closeoutId) return '';
    return '#' + base + '/' + ADD_DOC_SLUG + '/' + closeoutId;
  }

  function editDocHash(docId) {
    var base = deployBasePath();
    if (!base || !docId) return '';
    return '#' + base + '/' + EDIT_DOC_SLUG + '/' + docId;
  }

  function navigate(hash) {
    if (!hash) return;
    window.location.hash = hash;
  }

  // ── Rendering ────────────────────────────────────────────────────

  function pdfIconSvg() {
    return [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"',
      ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>',
      '<polyline points="14 2 14 8 20 8"/>',
      '<line x1="9" y1="13" x2="15" y2="13"/>',
      '<line x1="9" y1="17" x2="15" y2="17"/>',
      '</svg>'
    ].join('');
  }

  function uploadIconSvg() {
    return [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"',
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
      '<polyline points="17 8 12 3 7 8"/>',
      '<line x1="12" y1="3" x2="12" y2="15"/>',
      '</svg>'
    ].join('');
  }

  function buildDocCard(doc) {
    var card = document.createElement('div');
    card.className = 'scw-cd-doc';
    card.setAttribute('data-doc-id', doc.id);

    var hasFile = !!doc.fileUrl;
    var isMissing = doc.required && !doc.completed;
    var isComplete = doc.completed && hasFile;
    var isUploaded = doc.completed && !hasFile; // marked complete but no file URL visible
    if (isMissing) card.classList.add('is-missing');
    else if (isComplete) card.classList.add('is-complete');
    else if (isUploaded) card.classList.add('is-uploaded');
    else if (!doc.required && !hasFile) card.classList.add('is-empty-optional');

    // Thumbnail / icon area
    var thumb = document.createElement('div');
    thumb.className = 'scw-cd-doc__thumb';
    var iconBox = document.createElement('div');
    iconBox.className = 'scw-cd-doc__icon';
    if (hasFile) {
      iconBox.innerHTML = pdfIconSvg() +
        '<span class="scw-cd-doc__icon-label">View PDF</span>';
    } else if (isMissing) {
      iconBox.innerHTML = uploadIconSvg() +
        '<span class="scw-cd-doc__icon-label">Required</span>';
    } else {
      iconBox.innerHTML = uploadIconSvg() +
        '<span class="scw-cd-doc__icon-label">Upload</span>';
    }
    thumb.appendChild(iconBox);
    card.appendChild(thumb);

    // Type label
    var type = document.createElement('div');
    type.className = 'scw-cd-doc__type';
    type.textContent = doc.type || 'Document';
    type.title = doc.type || '';
    card.appendChild(type);

    // Required chip
    var chip = document.createElement('div');
    chip.className = 'scw-cd-doc__chip';
    if (doc.required && doc.completed) {
      chip.classList.add('is-req-done');
      chip.textContent = '✓ Required';
    } else if (doc.required) {
      chip.classList.add('is-req-missing');
      chip.textContent = 'Required';
    } else {
      chip.classList.add('is-optional');
      chip.textContent = 'Optional';
    }
    card.appendChild(chip);

    // Click: open file if exists, else go to edit-doc form
    card.addEventListener('click', function () {
      if (hasFile && doc.fileUrl.indexOf('http') === 0) {
        window.open(doc.fileUrl, '_blank');
      } else {
        var h = editDocHash(doc.id);
        if (h) navigate(h);
      }
    });

    return card;
  }

  function buildAddCard(closeoutId) {
    var add = document.createElement('div');
    add.className = 'scw-cd-add';
    add.innerHTML =
      '<span class="scw-cd-add__plus">+</span>' +
      '<span>Add document</span>';
    add.title = 'Add a new document to this closeout';
    add.addEventListener('click', function () {
      var h = addDocHash(closeoutId);
      if (h) navigate(h);
    });
    return add;
  }

  function buildCloseoutDate(tr) {
    var dateCell = tr.querySelector('td.field_2869');
    if (!dateCell) return '';
    return (dateCell.textContent || '').trim();
  }

  function renderInto(viewEl) {
    var tbody = viewEl.querySelector('tbody');
    if (!tbody) return;
    var row = tbody.querySelector('tr[id]');
    if (!row) {
      // No closeout record yet — show a small placeholder
      mountPanel(viewEl, '<div class="scw-cd-empty">No closeout record found for this project.</div>');
      return;
    }
    var closeoutId = (row.id || '').trim();
    var docs = extractDocsFromRow(row);
    var dateText = buildCloseoutDate(row);

    var card = document.createElement('div');
    card.className = 'scw-cd-card';
    card.setAttribute('data-closeout-id', closeoutId);

    var head = document.createElement('div');
    head.className = 'scw-cd-card__head';
    var title = document.createElement('div');
    title.className = 'scw-cd-card__title';
    title.textContent = 'Project Deliverables';
    head.appendChild(title);
    if (dateText) {
      var meta = document.createElement('div');
      meta.className = 'scw-cd-card__meta';
      meta.textContent = 'Started ' + dateText;
      head.appendChild(meta);
    }
    card.appendChild(head);

    var strip = document.createElement('div');
    strip.className = 'scw-cd-strip';
    if (!docs.length) {
      var empty = document.createElement('div');
      empty.className = 'scw-cd-empty';
      empty.textContent = 'No documents required for this project yet.';
      strip.appendChild(empty);
    } else {
      for (var i = 0; i < docs.length; i++) {
        strip.appendChild(buildDocCard(docs[i]));
      }
    }
    strip.appendChild(buildAddCard(closeoutId));
    card.appendChild(strip);

    mountPanel(viewEl, card);
  }

  function mountPanel(viewEl, contentEl) {
    var existing = viewEl.querySelector(':scope > .scw-cd-card');
    if (existing) existing.remove();
    if (typeof contentEl === 'string') {
      var wrap = document.createElement('div');
      wrap.innerHTML = contentEl;
      while (wrap.firstChild) viewEl.appendChild(wrap.firstChild);
    } else {
      viewEl.appendChild(contentEl);
    }
  }

  // ── Wire up to view render ──────────────────────────────────────

  function bindView() {
    if (!window.SCW || typeof SCW.onViewRender !== 'function') return;
    injectCSS();
    SCW.onViewRender(VIEW_ID, function () {
      var viewEl = document.getElementById(VIEW_ID);
      if (!viewEl) return;
      renderInto(viewEl);
    }, 'scwCloseoutDeliverables');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindView);
  } else {
    bindView();
  }
})();
