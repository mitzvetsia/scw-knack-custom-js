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

  // Hidden inline-editable grid of DOC records — used as the save target
  // for QA updates. Same pattern as qa-popover.js using view_3937 for
  // PIC photo records. The view must expose every field we PUT to as a
  // cell-edit column: field_2879/2880/2881/2882/2883/2895.
  var DOC_SAVE_VIEW = 'view_3941';

  // Connection-displayed columns on view_3940 (each row has one
  // connection-value span per connected DOC, keyed by DOC record id).
  var F = {
    type:          'field_2877',
    required:      'field_2894',
    completed:     'field_2895',
    file:          'field_68',
    // QA fields on the DOC object — exposed as connection-displayed
    // columns on view_3940 so we can read them without an extra view.
    // Writes go through MAKE_DOC_QA_WEBHOOK (Knack's REST API needs an
    // API key we can't ship client-side).
    qaStatus:      'field_2879',  // Pending / Pass / Fail
    qaNotes:       'field_2880',
    qaCompletedBy: 'field_2881',
    qaCompletedDt: 'field_2882',
    qaHistory:     'field_2883'
  };

  var QA_STATUS_OPTIONS = ['Pending', 'Pass', 'Fail'];

  // ── DOC file-meta index ───────────────────────────────────────────
  // view_3940 displays QA fields as connection columns but Knack only
  // gives us the route URL there (`#kn-asset/...`).  view_3941 is the
  // hidden DOC inline-edit grid — its model contains field_68_raw with
  // the actual S3 URL + thumbnail URL we need to embed cleanly.
  //
  // Index keyed by DOC record id:
  //   { url, thumbUrl, filename, size, type }
  var docFileMeta = {};

  function rebuildFileMetaIndex() {
    var v = window.Knack && Knack.views && Knack.views[DOC_SAVE_VIEW];
    if (!v || !v.model || !v.model.data || !v.model.data.models) return false;
    var models = v.model.data.models;
    var changed = false;
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      if (!m || !m.id) continue;
      var raw = m.attributes && m.attributes[F.file + '_raw'];
      if (!raw || !raw.url) continue;
      var prev = docFileMeta[m.id];
      var next = {
        url:      raw.url,
        thumbUrl: raw.thumb_url || '',
        filename: raw.filename || '',
        size:     raw.size || 0,
        type:     raw.type || ''
      };
      if (!prev || prev.url !== next.url || prev.thumbUrl !== next.thumbUrl) {
        docFileMeta[m.id] = next;
        changed = true;
      }
    }
    return changed;
  }

  var ADD_DOC_SLUG  = 'add-file-to-closeout';
  var EDIT_DOC_SLUG = 'edit-doc-file';

  // ── CSS injection ────────────────────────────────────────────────

  function injectCSS() {
    if (document.getElementById('scw-closeout-deliverables-css')) return;
    var css = [
      /* Hide the raw closeout grid — title, records-nav, table — we
         replace it with the strip card.  Easy to bring back: comment out
         this block (or selectively re-show parts) when the grid view
         becomes useful again. */
      '#' + VIEW_ID + ' > .view-header,',
      '#' + VIEW_ID + ' > .kn-records-nav,',
      '#' + VIEW_ID + ' > .kn-table-wrapper { display: none !important; }',

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

      /* State colours — three-tier QA model:
           no file          → red (urgent, blocks closeout)
           file, QA pending → purple (in flight — needs review)
           file, QA passed  → green (done)
         Optional + no-file stays gentle dashed-grey so it doesn\'t read
         as an error state on cards that aren\'t required. */
      '.scw-cd-doc.is-no-file {',
      '  border: 2px dashed #f87171; background: #fef2f2;',
      '}',
      '.scw-cd-doc.is-no-file:hover {',
      '  background: #fee2e2; border-color: #dc2626;',
      '}',
      '.scw-cd-doc.is-no-file .scw-cd-doc__icon { color: #b91c1c; }',
      '.scw-cd-doc.is-no-file.is-optional {',
      '  border: 2px dashed #d1d5db; background: #f9fafb;',
      '}',
      '.scw-cd-doc.is-no-file.is-optional .scw-cd-doc__icon { color: #6b7280; }',

      '.scw-cd-doc.is-qa-pending {',
      '  border: 1px solid #c4b5fd; background: #f5f3ff;',
      '}',
      '.scw-cd-doc.is-qa-pending:hover { background: #ede9fe; border-color: #8b5cf6; }',
      '.scw-cd-doc.is-qa-pending .scw-cd-doc__icon { color: #6d28d9; }',

      '.scw-cd-doc.is-qa-pass {',
      '  border: 1px solid #86efac; background: #f0fdf4;',
      '}',
      '.scw-cd-doc.is-qa-pass:hover { background: #dcfce7; border-color: #16a34a; }',
      '.scw-cd-doc.is-qa-pass .scw-cd-doc__icon { color: #15803d; }',

      /* Fail state — explicit red border but file is still there */
      '.scw-cd-doc.is-qa-fail {',
      '  border: 1px solid #dc2626; background: #fef2f2;',
      '}',
      '.scw-cd-doc.is-qa-fail .scw-cd-doc__icon { color: #b91c1c; }',

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

      // Real PDF/image thumbnail when Knack provides a thumb_url.
      '.scw-cd-doc__preview {',
      '  max-width: 100%; max-height: 100%;',
      '  width: auto; height: auto;',
      '  object-fit: contain;',
      '  background: #fff;',
      '  border-radius: 4px;',
      '  box-shadow: 0 1px 2px rgba(0,0,0,0.08);',
      '}',

      /* Type label */
      '.scw-cd-doc__type {',
      '  font-size: 12px; font-weight: 700; color: #1f2937; line-height: 1.3;',
      '  margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis;',
      '  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;',
      '  min-height: 32px;',
      '}',

      /* State chip — single source of truth, matches card colour. */
      '.scw-cd-doc__chip {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  font-size: 10px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: 0.04em; padding: 2px 8px; border-radius: 999px;',
      '  align-self: flex-start;',
      '}',
      '.scw-cd-doc__chip.is-missing-required {',
      '  background: #fee2e2; color: #b91c1c; border: 1px solid #f87171;',
      '}',
      '.scw-cd-doc__chip.is-missing-optional {',
      '  background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db;',
      '}',
      '.scw-cd-doc__chip.is-pending {',
      '  background: #ede9fe; color: #6d28d9; border: 1px solid #c4b5fd;',
      '}',
      '.scw-cd-doc__chip.is-pass {',
      '  background: #dcfce7; color: #15803d; border: 1px solid #86efac;',
      '}',
      '.scw-cd-doc__chip.is-fail {',
      '  background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;',
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
      '}',

      /* Drag-and-drop visual states for file upload (drop a file from
         desktop onto a doc card). Matches the photo-strip drop styling
         so the affordance reads the same across features. */
      '.scw-cd-doc.is-drop-hover {',
      '  border-color: #2563eb !important; background: #eff6ff !important;',
      '  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.20);',
      '}',
      '.scw-cd-doc.is-pending {',
      '  pointer-events: none; opacity: 0.85;',
      '}',
      '.scw-cd-doc.is-pending .scw-cd-doc__icon svg { animation: scw-cd-spin 1s linear infinite; }',
      '@keyframes scw-cd-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
      '.scw-cd-doc.is-error {',
      '  border-color: #dc2626 !important; background: #fef2f2 !important;',
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
          required: false, completed: false, fileUrl: '', fileName: '',
          qaStatus: 'Pending', qaNotes: '', qaHistory: '',
          qaCompletedBy: '', qaCompletedDt: ''
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
        // Keep a reference to the source anchor so clicks on the card
        // can dispatch a synthetic click to it. Knack's native file
        // handler intercepts clicks on these <a>s and opens an in-page
        // preview overlay — much nicer than window.open's new tab.
        rec.fileAnchor = a;
        rec.fileUrl  = a.getAttribute('href') || '';
        rec.fileName = (a.getAttribute('data-file-name') || a.textContent || '').trim();
      }
    });
    eachSpan(F.qaStatus, function (rec, span) {
      var inner = span.querySelector('span[data-kn="connection-value"]');
      var txt   = ((inner ? inner.textContent : span.textContent) || '').trim();
      if (txt) rec.qaStatus = txt;
    });
    eachSpan(F.qaNotes, function (rec, span) {
      rec.qaNotes = (span.textContent || '').trim();
    });
    eachSpan(F.qaCompletedBy, function (rec, span) {
      var inner = span.querySelector('span[data-kn="connection-value"]');
      rec.qaCompletedBy = ((inner ? inner.textContent : span.textContent) || '').trim();
    });
    eachSpan(F.qaCompletedDt, function (rec, span) {
      rec.qaCompletedDt = (span.textContent || '').trim();
    });
    eachSpan(F.qaHistory, function (rec, span) {
      // History is paragraph-text — preserve <br>s via innerHTML.
      rec.qaHistory = span.innerHTML || '';
    });

    // Enrich from view_3941's model — gives us the raw S3 URL and any
    // thumbnail. Falls back gracefully if view_3941 hasn't rendered yet
    // (we'll get it on the next render event).
    rebuildFileMetaIndex();
    Object.keys(docs).forEach(function (id) {
      var meta = docFileMeta[id];
      if (!meta) return;
      docs[id].rawUrl   = meta.url;
      docs[id].thumbUrl = meta.thumbUrl;
      if (!docs[id].fileName && meta.filename) docs[id].fileName = meta.filename;
      docs[id].fileSize = meta.size;
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

  /**
   * Take the current URL hash, strip any `?…` query params and trailing
   * slashes, and append `/{slug}/{recordId}/`.  Works regardless of how
   * many path segments precede the closeout view, so we don't have to
   * hardcode a regex for the deploy scene structure.
   */
  function buildHashFromCurrent(slug, recordId) {
    if (!slug || !recordId) return '';
    var hash = window.location.hash || '';
    var qIdx = hash.indexOf('?');
    if (qIdx >= 0) hash = hash.substring(0, qIdx);
    hash = hash.replace(/\/+$/, '');
    return hash + '/' + slug + '/' + recordId + '/';
  }

  function addDocHash(closeoutId) {
    return buildHashFromCurrent(ADD_DOC_SLUG, closeoutId);
  }

  function editDocHash(docId) {
    return buildHashFromCurrent(EDIT_DOC_SLUG, docId);
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

  function buildDocCard(doc, closeoutId) {
    var card = document.createElement('div');
    card.className = 'scw-cd-doc';
    card.setAttribute('data-doc-id', doc.id);

    var hasFile = !!doc.fileUrl;
    var qaStatus = doc.qaStatus || 'Pending';
    var isPass = (qaStatus === 'Pass');
    var isFail = (qaStatus === 'Fail');

    // State classes for the three-tier visual:
    //   no file              → is-no-file (+ .is-optional for soft grey)
    //   file, QA pending     → is-qa-pending (purple)
    //   file, QA pass        → is-qa-pass (green)
    //   file, QA fail        → is-qa-fail (red border, file still present)
    if (!hasFile) {
      card.classList.add('is-no-file');
      if (!doc.required) card.classList.add('is-optional');
    } else if (isPass) {
      card.classList.add('is-qa-pass');
    } else if (isFail) {
      card.classList.add('is-qa-fail');
    } else {
      card.classList.add('is-qa-pending');
    }

    // Re-apply pending state if an upload is still polling for this doc
    // (the card gets rebuilt on every renderInto call).
    if (pendingUploads[doc.id]) {
      card.classList.add('is-pending');
    }

    // Thumbnail / icon area.  If Knack gave us a real thumbnail URL,
    // render the document preview — the card carries its own state via
    // colour and there's no need for the separate chip + icon-label
    // pair we used to have. Otherwise fall back to the icon + a label
    // that reflects QA state (Pending QA / QA Pass / QA Fail / Required).
    var thumb = document.createElement('div');
    thumb.className = 'scw-cd-doc__thumb';
    if (hasFile && doc.thumbUrl) {
      var preview = document.createElement('img');
      preview.className = 'scw-cd-doc__preview';
      preview.src = doc.thumbUrl;
      preview.alt = doc.fileName || doc.type || 'Document';
      preview.loading = 'lazy';
      thumb.appendChild(preview);
    } else {
      var iconBox = document.createElement('div');
      iconBox.className = 'scw-cd-doc__icon';
      var iconLabel;
      if (hasFile) {
        if (isPass)      iconLabel = 'QA Pass';
        else if (isFail) iconLabel = 'QA Fail';
        else             iconLabel = 'Pending QA';
        iconBox.innerHTML = pdfIconSvg() +
          '<span class="scw-cd-doc__icon-label">' + iconLabel + '</span>';
      } else if (doc.required) {
        iconBox.innerHTML = uploadIconSvg() +
          '<span class="scw-cd-doc__icon-label">Required</span>';
      } else {
        iconBox.innerHTML = uploadIconSvg() +
          '<span class="scw-cd-doc__icon-label">Optional</span>';
      }
      thumb.appendChild(iconBox);
    }
    card.appendChild(thumb);

    // Type label — only label below the preview now (chip removed).
    var type = document.createElement('div');
    type.className = 'scw-cd-doc__type';
    type.textContent = doc.type || 'Document';
    type.title = doc.type || '';
    card.appendChild(type);

    // Click behaviour:
    //   No file              → file picker (or Knack edit form if webhook off)
    //   File, any QA state   → open QA popover (which has a "View file"
    //                          button to dispatch to Knack's preview).
    var uploadEnabled = !hasFile && !!(
      window.SCW && window.SCW.CONFIG && window.SCW.CONFIG.MAKE_DOC_UPLOAD_WEBHOOK
    );
    card.addEventListener('click', function (e) {
      if (card.classList.contains('is-pending')) return;
      if (hasFile) {
        e.stopPropagation();
        openQAPopover(card, doc, closeoutId);
        return;
      }
      if (uploadEnabled) {
        openDocFilePicker(card, doc.id, closeoutId);
        return;
      }
      var h = editDocHash(doc.id);
      if (h) navigate(h);
    });

    // Drag-and-drop from desktop. Bound on every card (filed and empty)
    // because a filed doc could still be replaced by dropping a new file
    // — same record, same field, fresh upload. uploadEnabled gates the
    // *drop* handler, not the dragenter/over, so we don't paint a hover
    // ring on a card we can't actually accept.
    if (uploadEnabled || hasFile) {
      card.addEventListener('dragenter', handleDocDragEnter);
      card.addEventListener('dragover',  handleDocDragOver);
      card.addEventListener('dragleave', handleDocDragLeave);
      card.addEventListener('drop', function (e) {
        e.preventDefault();
        card.classList.remove('is-drop-hover');
        if (card.classList.contains('is-pending')) return;
        var docWebhook = window.SCW && window.SCW.CONFIG &&
                         window.SCW.CONFIG.MAKE_DOC_UPLOAD_WEBHOOK;
        if (!docWebhook) {
          console.warn('[SCW] MAKE_DOC_UPLOAD_WEBHOOK not configured — drop ignored');
          return;
        }
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        dispatchDocUpload(card, doc.id, closeoutId, file);
      });
    }

    return card;
  }

  // ── Drag-and-drop helpers ────────────────────────────────────────
  function handleDocDragEnter(e) {
    if (!eventHasFiles(e)) return;
    e.preventDefault();
    this.classList.add('is-drop-hover');
  }
  function handleDocDragOver(e) {
    if (!eventHasFiles(e)) return;
    e.preventDefault();   // required for drop to fire
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
  function handleDocDragLeave(e) {
    // Only clear if the drag actually leaves the card, not when it moves
    // over a child element.
    if (this.contains(e.relatedTarget)) return;
    this.classList.remove('is-drop-hover');
  }
  function eventHasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt || !dt.types) return false;
    for (var i = 0; i < dt.types.length; i++) {
      if (dt.types[i] === 'Files') return true;
    }
    return false;
  }

  // ── Upload via Make webhook ──────────────────────────────────────
  // Same shape as inline-photo-row's upload + poll flow: read file as
  // base64, POST to MAKE_DOC_UPLOAD_WEBHOOK, then poll the view until
  // field_68 (the file URL) shows up on the DOC record.
  var pendingUploads = {};
  var POLL_INTERVAL_MS = 4000;
  var POLL_TIMEOUT_MS  = 90000;

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result || '');
        var comma = s.indexOf(',');
        resolve(comma >= 0 ? s.substring(comma + 1) : s);
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  function getTriggeredBy() {
    try {
      var u = window.Knack && Knack.getUserAttributes && Knack.getUserAttributes();
      if (u) return { id: u.id || '', name: u.name || '', email: u.email || '' };
    } catch (e) { /* ignore */ }
    return { id: '', name: '', email: '' };
  }

  function setCardPending(card) {
    card.classList.remove('is-error');
    card.classList.add('is-pending');
    var iconLabel = card.querySelector('.scw-cd-doc__icon-label');
    if (iconLabel) iconLabel.textContent = 'Uploading…';
  }
  function setCardError(card, msg) {
    card.classList.remove('is-pending');
    card.classList.add('is-error');
    var iconLabel = card.querySelector('.scw-cd-doc__icon-label');
    if (iconLabel) iconLabel.textContent = msg || 'Error';
  }

  function openDocFilePicker(card, docId, closeoutId) {
    var input = document.createElement('input');
    input.type = 'file';
    // Documents only — PDFs primary, plus office formats.  Images are
    // intentionally excluded; deliverables are forms/PDFs, not photos.
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) dispatchDocUpload(card, docId, closeoutId, file);
      document.body.removeChild(input);
    });
    document.body.appendChild(input);
    input.click();
  }

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf('image/') === 0) return true;
    // Fallback for files with no MIME (some camera/scan exports): check
    // the extension.
    var name = (file.name || '').toLowerCase();
    return /\.(jpe?g|png|gif|bmp|webp|heic|heif|tiff?|svg)$/.test(name);
  }

  function dispatchDocUpload(card, docId, closeoutId, file) {
    var webhookUrl = window.SCW && window.SCW.CONFIG &&
                     window.SCW.CONFIG.MAKE_DOC_UPLOAD_WEBHOOK;
    if (!webhookUrl) {
      console.error('[SCW] MAKE_DOC_UPLOAD_WEBHOOK not configured');
      setCardError(card, 'Upload not configured');
      return;
    }
    if (isImageFile(file)) {
      // Deliverables are forms/PDFs, not photos. Photos belong on the
      // line-item photo strip — sending one through here would land in
      // the wrong Knack object entirely.
      setCardError(card, 'PDFs/docs only — not images');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setCardError(card, 'File too large');
      return;
    }

    pendingUploads[docId] = true;
    setCardPending(card);

    readFileAsBase64(file).then(function (b64) {
      return fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind:        'document',
          docRecordId: docId,
          closeoutId:  closeoutId,
          viewId:      VIEW_ID,
          filename:    file.name || 'document.pdf',
          mimeType:    file.type || 'application/pdf',
          sizeBytes:   file.size,
          dataBase64:  b64,
          triggeredBy: getTriggeredBy()
        })
      });
    }).then(function (resp) {
      // Webhook contract — same as photo upload.
      if (resp && resp.status && resp.status >= 400) {
        throw new Error('Webhook returned ' + resp.status);
      }
      return resp.text().then(function (txt) {
        var body = null;
        try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = null; }
        console.log('[SCW] doc upload webhook response:', resp.status, txt);
        return body;
      }).then(function (body) {
        if (body && body.success === false) {
          delete pendingUploads[docId];
          setCardError(card, body.error || 'Upload failed');
          return;
        }
        if (body && body.success === true) {
          fetchBothViewsForDoc();
          var ticks = 0;
          (function fastCheck() {
            if (!pendingUploads[docId]) return;
            if (docHasFileUploaded(docId)) {
              delete pendingUploads[docId];
              return;
            }
            ticks++;
            if (ticks < 12) {
              setTimeout(fastCheck, 500);
            } else {
              pollForDocArrival(docId);
            }
          })();
          return;
        }
        pollForDocArrival(docId);
      });
    }).catch(function (err) {
      console.error('[SCW] Doc upload error:', err);
      delete pendingUploads[docId];
      setCardError(card, 'Upload failed');
    });
  }

  function pollForDocArrival(docId) {
    var startedAt = Date.now();
    function tick() {
      if (!pendingUploads[docId]) return;
      // Fire fetches against both views every tick (view_3940 for the
      // closeout-side connection display, view_3941 for the underlying
      // DOC record — that's where the file actually lives).
      fetchBothViewsForDoc();
      setTimeout(function () {
        if (docHasFileUploaded(docId)) {
          delete pendingUploads[docId];
          return;
        }
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          delete pendingUploads[docId];
          console.warn('[SCW] Doc upload poll timed out for', docId);
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      }, 1000);
    }
    setTimeout(tick, POLL_INTERVAL_MS);
  }

  // Fetch BOTH views: view_3940 (closeout-side connection display) and
  // view_3941 (DOC inline-edit grid). view_3941 is the source of truth
  // for the DOC's file field; view_3940 only mirrors it via connection
  // display, which doesn't always refresh promptly on its own.
  function fetchBothViewsForDoc() {
    var ids = [VIEW_ID, DOC_SAVE_VIEW];
    for (var i = 0; i < ids.length; i++) {
      var v = window.Knack && Knack.views && Knack.views[ids[i]];
      if (!v || !v.model || typeof v.model.fetch !== 'function') continue;
      try {
        var u = (typeof v.model.url === 'function') ? v.model.url.call(v.model) : v.model.url;
        if (!u) continue;
      } catch (e) { continue; }
      try { v.model.fetch(); } catch (e) { /* swallow */ }
    }
  }

  // True if the DOC record has a file landed.  Prefer the model-backed
  // index (rebuilt from view_3941 on every poll fetch) over DOM scraping
  // — view_3940 sometimes lags in re-rendering connection cells, and
  // view_3941's model is the source of truth anyway.
  function docHasFileUploaded(docId) {
    rebuildFileMetaIndex();
    if (docFileMeta[docId] && docFileMeta[docId].url) return true;
    return docHasFileInDOM(docId);
  }

  function docHasFileInDOM(docId) {
    var viewEl = document.getElementById(VIEW_ID);
    if (!viewEl) return false;
    var spans = viewEl.querySelectorAll(
      'td.' + F.file + ' span[id][data-kn="connection-value"],' +
      'td[data-field-key="' + F.file + '"] span[id][data-kn="connection-value"]'
    );
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].id !== docId) continue;
      if (spans[i].querySelector('a[href]')) return true;
    }
    return false;
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

  // ── Doc QA popover ──────────────────────────────────────────────
  // Click a card with a file → this popover anchors over it. Lets the
  // reviewer mark Pass/Fail, add notes, view the file, and save in one
  // place. Save goes through MAKE_DOC_QA_WEBHOOK because the DOC fields
  // aren't exposed inline-editable on view_3940; Make's scenario does
  // the actual REST PUT (it has the API key, we don't).

  var POPOVER_ID = 'scw-cd-qa-popover';
  var _popover = null;
  var _popoverDoc = null;       // working copy — mutated by chip clicks
  var _popoverOrig = null;      // snapshot for change detection / history
  var _popoverCard = null;
  var _popoverCloseoutId = null;

  function injectPopoverCSS() {
    if (document.getElementById('scw-cd-qa-popover-css')) return;
    var css = [
      // Overlay
      '.' + POPOVER_ID + '__overlay {',
      '  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);',
      '  z-index: 9998; display: flex; align-items: center; justify-content: center;',
      '}',

      // Modal shell — large viewer, not a popover.
      '.' + POPOVER_ID + ' {',
      '  position: relative; background: #fff; border-radius: 10px;',
      '  box-shadow: 0 20px 50px rgba(0,0,0,0.25);',
      '  width: 95vw; height: 92vh; max-width: 1400px; max-height: 1000px;',
      '  display: flex; flex-direction: column;',
      '  font: 12px/1.4 system-ui, -apple-system, sans-serif;',
      '  overflow: hidden;',
      '}',

      // Header strip
      '.' + POPOVER_ID + '__head {',
      '  display: flex; align-items: center; gap: 16px;',
      '  padding: 12px 18px;',
      '  border-bottom: 1px solid #e5e7eb;',
      '  background: #f9fafb;',
      '  flex: 0 0 auto;',
      '}',
      '.' + POPOVER_ID + '__type {',
      '  font-size: 15px; font-weight: 700; color: #111827;',
      '}',
      '.' + POPOVER_ID + '__sub  {',
      '  font-size: 12px; color: #6b7280; margin-top: 2px;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '  max-width: 600px;',
      '}',
      '.' + POPOVER_ID + '__head-meta { flex: 1 1 auto; min-width: 0; }',
      '.' + POPOVER_ID + '__head-actions { display: flex; gap: 8px; flex: 0 0 auto; }',
      '.' + POPOVER_ID + '__head-btn {',
      '  padding: 7px 14px; border-radius: 6px;',
      '  background: #fff; color: #1f2937; border: 1px solid #d1d5db;',
      '  font: 600 12px/1.2 system-ui;',
      '  cursor: pointer;',
      '}',
      '.' + POPOVER_ID + '__head-btn:hover { background: #f3f4f6; border-color: #9ca3af; }',
      '.' + POPOVER_ID + '__head-btn--close {',
      '  background: #fff; color: #6b7280; border-color: #d1d5db;',
      '  width: 32px; padding: 0; font-size: 18px; line-height: 30px;',
      '}',

      // Body split — preview area + sidebar.
      '.' + POPOVER_ID + '__body {',
      '  display: flex; flex: 1 1 auto; min-height: 0;',
      '}',
      '.' + POPOVER_ID + '__viewer {',
      '  flex: 1 1 auto; min-width: 0;',
      '  background: #1f2937;',         // dark bg so PDF whitespace stands out
      '  position: relative;',
      '  display: flex; align-items: center; justify-content: center;',
      '  overflow: hidden;',
      '}',
      '.' + POPOVER_ID + '__viewer iframe {',
      '  width: 100%; height: 100%; border: 0; background: #fff;',
      '}',
      '.' + POPOVER_ID + '__viewer img {',
      '  max-width: 100%; max-height: 100%; object-fit: contain;',
      '  background: #fff;',
      '}',
      '.' + POPOVER_ID + '__viewer-empty {',
      '  color: #9ca3af; padding: 40px; text-align: center;',
      '  font-size: 14px;',
      '}',
      '.' + POPOVER_ID + '__viewer-fallback {',
      '  color: #f3f4f6; padding: 40px; text-align: center; font-size: 13px;',
      '}',
      '.' + POPOVER_ID + '__viewer-fallback a {',
      '  display: inline-block; margin-top: 10px;',
      '  background: #2563eb; color: #fff; padding: 8px 18px;',
      '  border-radius: 6px; text-decoration: none; font-weight: 600;',
      '}',

      // Sidebar — QA controls + replace action.
      '.' + POPOVER_ID + '__sidebar {',
      '  flex: 0 0 340px;',
      '  border-left: 1px solid #e5e7eb;',
      '  display: flex; flex-direction: column;',
      '  background: #fff;',
      '}',
      '.' + POPOVER_ID + '__sidebar-content {',
      '  flex: 1 1 auto; overflow-y: auto;',
      '  padding: 16px 18px;',
      '}',
      '.' + POPOVER_ID + '__section { margin-bottom: 16px; }',
      '.' + POPOVER_ID + '__label {',
      '  font-size: 11px; font-weight: 700; text-transform: uppercase;',
      '  color: #6b7280; letter-spacing: 0.04em; margin-bottom: 6px;',
      '}',

      // Status chips
      '.' + POPOVER_ID + '__chips { display: flex; gap: 6px; }',
      '.' + POPOVER_ID + '__chip {',
      '  flex: 1; padding: 8px 10px; border-radius: 8px;',
      '  border: 1px solid #d1d5db; background: #fff;',
      '  font: 600 12px/1.2 system-ui; cursor: pointer;',
      '  transition: all 0.12s;',
      '}',
      '.' + POPOVER_ID + '__chip:hover { background: #f3f4f6; }',
      '.' + POPOVER_ID + '__chip.is-selected[data-value="Pending"] {',
      '  background: #ede9fe; color: #6d28d9; border-color: #8b5cf6;',
      '}',
      '.' + POPOVER_ID + '__chip.is-selected[data-value="Pass"] {',
      '  background: #dcfce7; color: #15803d; border-color: #16a34a;',
      '}',
      '.' + POPOVER_ID + '__chip.is-selected[data-value="Fail"] {',
      '  background: #fee2e2; color: #b91c1c; border-color: #dc2626;',
      '}',

      // Notes
      '.' + POPOVER_ID + '__notes {',
      '  width: 100%; min-height: 80px; resize: vertical;',
      '  border: 1px solid #d1d5db; border-radius: 6px;',
      '  padding: 8px 10px; font: inherit; box-sizing: border-box;',
      '}',
      '.' + POPOVER_ID + '__notes:focus { outline: none; border-color: #6b7280; }',
      '.' + POPOVER_ID + '__hint {',
      '  font-size: 11px; color: #b91c1c; margin-top: 4px; display: none;',
      '}',
      '.' + POPOVER_ID + '__signoff {',
      '  font-size: 11px; color: #6b7280;',
      '  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;',
      '  padding: 8px 10px;',
      '}',
      '.' + POPOVER_ID + '__signoff strong { color: #111827; font-weight: 600; }',

      // Replace-file action — visually distinct from save/QA flow.
      '.' + POPOVER_ID + '__replace {',
      '  border-top: 1px solid #e5e7eb;',
      '  padding: 12px 18px;',
      '  background: #f9fafb;',
      '}',
      '.' + POPOVER_ID + '__replace-btn {',
      '  width: 100%; padding: 10px 14px;',
      '  border-radius: 6px; background: #fff;',
      '  border: 1px dashed #9ca3af; color: #374151;',
      '  font: 600 12px/1.2 system-ui;',
      '  cursor: pointer; transition: all 0.12s;',
      '}',
      '.' + POPOVER_ID + '__replace-btn:hover {',
      '  background: #eff6ff; border-color: #2563eb; color: #1d4ed8;',
      '}',

      // Footer — Cancel / Save (save only enabled when QA changes).
      '.' + POPOVER_ID + '__footer {',
      '  display: flex; gap: 8px; justify-content: flex-end;',
      '  padding: 12px 18px;',
      '  border-top: 1px solid #e5e7eb; background: #fff;',
      '  flex: 0 0 auto;',
      '}',
      '.' + POPOVER_ID + '__btn {',
      '  padding: 8px 18px; border-radius: 6px;',
      '  font: 600 12px/1.2 system-ui;',
      '  cursor: pointer; border: 1px solid #d1d5db; background: #fff;',
      '  color: #1f2937;',
      '}',
      '.' + POPOVER_ID + '__btn:hover { background: #f3f4f6; }',
      '.' + POPOVER_ID + '__btn--primary {',
      '  background: #2563eb; color: #fff; border-color: #1d4ed8;',
      '}',
      '.' + POPOVER_ID + '__btn--primary:hover { background: #1d4ed8; }',
      '.' + POPOVER_ID + '__btn--primary:disabled {',
      '  background: #cbd5e1; border-color: #cbd5e1; color: #fff;',
      '  cursor: not-allowed;',
      '}',
      '.' + POPOVER_ID + '__saving { pointer-events: none; opacity: 0.7; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'scw-cd-qa-popover-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function openQAPopover(card, doc, closeoutId) {
    injectPopoverCSS();
    closeQAPopover();  // tear down any open instance first

    // Shallow-clone doc into a working copy so chip clicks mutate the
    // popover state, not the source record (which the next renderInto
    // will overwrite anyway).
    _popoverDoc = {};
    for (var k in doc) if (doc.hasOwnProperty(k)) _popoverDoc[k] = doc[k];
    _popoverOrig = {};
    for (var k2 in doc) if (doc.hasOwnProperty(k2)) _popoverOrig[k2] = doc[k2];
    _popoverCard = card;
    _popoverCloseoutId = closeoutId;

    var overlay = document.createElement('div');
    overlay.className = POPOVER_ID + '__overlay';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeQAPopover();
    });

    var pop = document.createElement('div');
    pop.className = POPOVER_ID;
    pop.id = POPOVER_ID;

    // ── Header ────────────────────────────────────────────────────────
    var head = document.createElement('div');
    head.className = POPOVER_ID + '__head';

    var headMeta = document.createElement('div');
    headMeta.className = POPOVER_ID + '__head-meta';
    var typeEl = document.createElement('div');
    typeEl.className = POPOVER_ID + '__type';
    typeEl.textContent = doc.type || 'Document';
    var subEl = document.createElement('div');
    subEl.className = POPOVER_ID + '__sub';
    subEl.textContent = doc.fileName ||
      (doc.required ? 'Required deliverable' : 'Optional deliverable');
    subEl.title = subEl.textContent;
    headMeta.appendChild(typeEl);
    headMeta.appendChild(subEl);
    head.appendChild(headMeta);

    var headActions = document.createElement('div');
    headActions.className = POPOVER_ID + '__head-actions';

    // "Open in tab" — escape hatch so users can pop the file out to a
    // full window if the embedded viewer is awkward for what they need.
    if (doc.fileUrl) {
      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = POPOVER_ID + '__head-btn';
      openBtn.textContent = 'Open in tab';
      openBtn.addEventListener('click', function () {
        if (doc.fileAnchor && document.contains(doc.fileAnchor)) {
          doc.fileAnchor.click();
        } else if (doc.fileUrl) {
          window.open(doc.fileUrl, '_blank');
        }
      });
      headActions.appendChild(openBtn);
    }
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = POPOVER_ID + '__head-btn ' + POPOVER_ID + '__head-btn--close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', function () { closeQAPopover(); });
    headActions.appendChild(closeBtn);
    head.appendChild(headActions);

    pop.appendChild(head);

    // ── Body: viewer on left, sidebar on right ────────────────────────
    var body = document.createElement('div');
    body.className = POPOVER_ID + '__body';

    var viewer = document.createElement('div');
    viewer.className = POPOVER_ID + '__viewer';
    renderViewerInto(viewer, doc);
    body.appendChild(viewer);

    var sidebar = document.createElement('div');
    sidebar.className = POPOVER_ID + '__sidebar';

    var sbContent = document.createElement('div');
    sbContent.className = POPOVER_ID + '__sidebar-content';

    // Status chips
    var statusSec = document.createElement('div');
    statusSec.className = POPOVER_ID + '__section';
    var statusLbl = document.createElement('div');
    statusLbl.className = POPOVER_ID + '__label';
    statusLbl.textContent = 'QA Status';
    statusSec.appendChild(statusLbl);
    var chips = document.createElement('div');
    chips.className = POPOVER_ID + '__chips';
    QA_STATUS_OPTIONS.forEach(function (opt) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = POPOVER_ID + '__chip';
      c.setAttribute('data-value', opt);
      c.textContent = opt;
      if (opt === _popoverDoc.qaStatus) c.classList.add('is-selected');
      c.addEventListener('click', function () {
        var siblings = chips.querySelectorAll('.' + POPOVER_ID + '__chip');
        for (var i = 0; i < siblings.length; i++) siblings[i].classList.remove('is-selected');
        c.classList.add('is-selected');
        _popoverDoc.qaStatus = opt;
        refreshActions(pop);
      });
      chips.appendChild(c);
    });
    statusSec.appendChild(chips);
    sbContent.appendChild(statusSec);

    // Notes
    var notesSec = document.createElement('div');
    notesSec.className = POPOVER_ID + '__section';
    var notesLbl = document.createElement('div');
    notesLbl.className = POPOVER_ID + '__label';
    notesLbl.textContent = 'Notes';
    notesSec.appendChild(notesLbl);
    var notes = document.createElement('textarea');
    notes.className = POPOVER_ID + '__notes';
    notes.value = _popoverDoc.qaNotes || '';
    notes.addEventListener('input', function () {
      _popoverDoc.qaNotes = notes.value;
      refreshActions(pop);
    });
    notesSec.appendChild(notes);
    var hint = document.createElement('div');
    hint.className = POPOVER_ID + '__hint';
    hint.textContent = 'Notes required when marking Fail.';
    notesSec.appendChild(hint);
    sbContent.appendChild(notesSec);

    // Sign-off metadata (read-only summary)
    if (doc.qaCompletedBy || doc.qaCompletedDt) {
      var signoff = document.createElement('div');
      signoff.className = POPOVER_ID + '__signoff';
      signoff.innerHTML =
        'Last signed off by <strong>' + escapeHtml(doc.qaCompletedBy || '—') +
        '</strong> on <strong>' + escapeHtml(doc.qaCompletedDt || '—') + '</strong>';
      sbContent.appendChild(signoff);
    }

    sidebar.appendChild(sbContent);

    // ── Replace file panel — separate from QA save ─────────────────────
    // Disabled when QA is already Pass — once a doc is signed off it
    // shouldn't be quietly replaced; reviewer must flip status first.
    var replacePanel = document.createElement('div');
    replacePanel.className = POPOVER_ID + '__replace';
    var replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = POPOVER_ID + '__replace-btn';
    var qaIsPass = (_popoverDoc.qaStatus === 'Pass');
    if (qaIsPass) {
      replaceBtn.disabled = true;
      replaceBtn.textContent = 'Replace locked (QA already signed off)';
      replaceBtn.title = 'Mark QA Pending or Fail to enable file replacement';
    } else {
      replaceBtn.textContent = doc.fileUrl ? 'Replace file…' : 'Upload file…';
      replaceBtn.addEventListener('click', function () {
        // Reuse the existing picker + upload pipeline. Close the modal
        // when the picker fires so the user sees the upload spinner on
        // the card rather than a stale modal preview.
        closeQAPopover();
        openDocFilePicker(card, doc.id, closeoutId);
      });
    }
    replacePanel.appendChild(replaceBtn);
    sidebar.appendChild(replacePanel);

    body.appendChild(sidebar);
    pop.appendChild(body);

    // ── Footer: Cancel / Save ─────────────────────────────────────────
    var footer = document.createElement('div');
    footer.className = POPOVER_ID + '__footer';
    pop.appendChild(footer);

    overlay.appendChild(pop);
    document.body.appendChild(overlay);
    _popover = overlay;
    refreshActions(pop);

    // ESC closes
    document.addEventListener('keydown', escListener);
  }

  // Embed the file inside the viewer pane.  Knack file links are
  // S3-presigned URLs that include the user's session — they render
  // inline in most browsers for PDF/image MIME types. If the browser
  // rejects inline (download instead of render), the user can still hit
  // "Open in tab" in the header.
  function renderViewerInto(viewerEl, doc) {
    viewerEl.innerHTML = '';
    // Prefer the raw S3 URL from view_3941's model — that gives the
    // browser a real application/pdf response so Chrome's PDF viewer
    // renders directly inside the iframe (no Knack app chrome).  Fall
    // back to the route URL (Knack's `#kn-asset/...`) only if we never
    // got the raw URL from the model.
    var src = doc.rawUrl || doc.fileUrl;
    if (!src) {
      var empty = document.createElement('div');
      empty.className = POPOVER_ID + '__viewer-empty';
      empty.textContent = 'No file uploaded yet.';
      viewerEl.appendChild(empty);
      return;
    }
    var ext = ((doc.fileName || src).toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/) || [])[1] || '';
    var isImage = /^(png|jpe?g|gif|bmp|webp|heic|heif|tiff?|svg)$/.test(ext);

    if (isImage) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = doc.fileName || 'Document';
      viewerEl.appendChild(img);
      return;
    }

    // PDF (or anything browser-renders inline). Append Chrome PDF-viewer
    // hash params to hide the toolbar + thumbnail panel — they only
    // take effect when the response is a real PDF, which is what the
    // raw URL gives us. Knack's route URL ignores them.
    var iframeSrc = src;
    if (doc.rawUrl) {
      iframeSrc = src + (src.indexOf('#') === -1 ? '#' : '&') +
                  'toolbar=0&navpanes=0&scrollbar=0&view=FitH';
    }
    var iframe = document.createElement('iframe');
    iframe.src = iframeSrc;
    iframe.setAttribute('title', doc.fileName || 'Document preview');
    viewerEl.appendChild(iframe);

    // Fallback link in case the iframe blocks rendering (some servers
    // send Content-Disposition: attachment which makes browsers download
    // instead of render).
    var fallback = document.createElement('div');
    fallback.className = POPOVER_ID + '__viewer-fallback';
    fallback.innerHTML =
      'If the preview is blank, the browser blocked inline rendering. ' +
      '<br><a href="' + src + '" target="_blank" rel="noopener">' +
      'Open file in new tab</a>';
    fallback.style.position = 'absolute';
    fallback.style.bottom = '12px';
    fallback.style.left = '50%';
    fallback.style.transform = 'translateX(-50%)';
    fallback.style.pointerEvents = 'auto';
    viewerEl.appendChild(fallback);
  }

  function escHtmlChar(c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] || c;
  }
  function escapeHtml(s) { return String(s || '').replace(/[<>&"']/g, escHtmlChar); }

  function escListener(e) {
    if (e.key === 'Escape') closeQAPopover();
  }

  function refreshActions(pop) {
    var footer = pop.querySelector('.' + POPOVER_ID + '__footer');
    if (!footer) return;
    footer.innerHTML = '';
    var hint = pop.querySelector('.' + POPOVER_ID + '__hint');

    var status = _popoverDoc.qaStatus;
    var notes = (_popoverDoc.qaNotes || '').trim();
    var needsNotes = (status === 'Fail') && !notes;
    if (hint) hint.style.display = needsNotes ? '' : 'none';

    var dirty = (status !== _popoverOrig.qaStatus) ||
                ((_popoverDoc.qaNotes || '') !== (_popoverOrig.qaNotes || ''));

    // Reflect the QA-Pass lock on the Replace button live (so flipping
    // status from Pass → Pending inside this modal immediately unlocks
    // the Replace action without a re-open).
    var replaceBtn = pop.querySelector('.' + POPOVER_ID + '__replace-btn');
    if (replaceBtn) {
      var locked = (status === 'Pass');
      replaceBtn.disabled = locked;
      if (locked) {
        replaceBtn.textContent = 'Replace locked (QA signed off)';
        replaceBtn.title = 'Set QA back to Pending or Fail to enable replacement';
      } else {
        replaceBtn.textContent = _popoverDoc.fileUrl ? 'Replace file…' : 'Upload file…';
        replaceBtn.removeAttribute('title');
      }
    }

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = POPOVER_ID + '__btn';
    closeBtn.textContent = dirty ? 'Cancel' : 'Close';
    closeBtn.addEventListener('click', function () { closeQAPopover(); });
    footer.appendChild(closeBtn);

    var save = document.createElement('button');
    save.type = 'button';
    save.className = POPOVER_ID + '__btn ' + POPOVER_ID + '__btn--primary';
    save.textContent = (status === 'Pass') ? 'Sign off' :
                       (status === 'Fail') ? 'Mark fail' : 'Save QA';
    save.disabled = !dirty || needsNotes;
    save.addEventListener('click', function () { saveQA(); });
    footer.appendChild(save);
  }

  function closeQAPopover() {
    if (_popover && _popover.parentNode) {
      _popover.parentNode.removeChild(_popover);
    }
    _popover = null;
    _popoverDoc = null;
    _popoverOrig = null;
    _popoverCard = null;
    _popoverCloseoutId = null;
    document.removeEventListener('keydown', escListener);
  }

  function saveQA() {
    if (!_popover) return;
    if (typeof SCW === 'undefined' || typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') {
      alert('Save unavailable (SCW.knackAjax missing)');
      return;
    }

    var pop = _popover.querySelector('.' + POPOVER_ID);
    if (pop) pop.classList.add(POPOVER_ID + '__saving');

    var status = _popoverDoc.qaStatus;
    var notes  = _popoverDoc.qaNotes || '';
    var who    = getTriggeredBy();

    // Build the field payload to PUT onto the DOC record via view_3941.
    var fields = {};
    fields[F.qaStatus] = status;
    fields[F.qaNotes]  = notes;

    // Sign-off math — same shape as qa-popover.js: Pass → set by/date,
    // anything else → clear them. History line prepended on every save.
    var historyLine = stampLine(
      (status === 'Pass') ? 'Signed off' :
      (status === 'Fail') ? 'Marked Fail' : ('Status set to ' + status),
      notes,
      who.name || who.email || 'Unknown user'
    );
    var newHistory = _popoverDoc.qaHistory || '';
    if (newHistory && !/^<br/.test(newHistory)) newHistory = '<br>' + newHistory;
    fields[F.qaHistory] = historyLine + newHistory;

    if (status === 'Pass') {
      // Connection → user field: Knack accepts the bare user id string.
      if (who.id) fields[F.qaCompletedBy] = who.id;
      fields[F.qaCompletedDt] = todayUS();
      fields[F.completed]     = 'Yes';
    } else {
      fields[F.qaCompletedBy] = '';
      fields[F.qaCompletedDt] = '';
      fields[F.completed]     = 'No';
    }

    SCW.knackAjax({
      url:  SCW.knackRecordUrl(DOC_SAVE_VIEW, _popoverDoc.id),
      type: 'PUT',
      data: JSON.stringify(fields),
      success: function () {
        closeQAPopover();
        // Refresh both views so the strip and the underlying DOC grid
        // both reflect the new state.
        var v1 = window.Knack && Knack.views && Knack.views[VIEW_ID];
        if (v1 && v1.model && typeof v1.model.fetch === 'function') v1.model.fetch();
        var v2 = window.Knack && Knack.views && Knack.views[DOC_SAVE_VIEW];
        if (v2 && v2.model && typeof v2.model.fetch === 'function') v2.model.fetch();
      },
      error: function (xhr) {
        if (pop) pop.classList.remove(POPOVER_ID + '__saving');
        console.error('[SCW] doc QA save error:', xhr.status, xhr.responseText);
        alert('Save failed (' + xhr.status + ')');
      }
    });
  }

  function todayUS() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + '/' + d.getFullYear();
  }

  function stampLine(event, detail, who) {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    var stamp = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
                ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    var line = stamp + ' — ' + who + ' — ' + event;
    if (detail) line += ': ' + detail;
    return escapeHtml(line);
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
        strip.appendChild(buildDocCard(docs[i], closeoutId));
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

    // view_3941 (DOC inline-edit grid) carries the raw file URL and
    // thumb_url that view_3940 hides behind a route URL.  When it
    // renders (which may be before OR after view_3940), refresh our
    // index and rebuild the strip so the cards pick up the new metadata
    // for thumbnails + clean modal previews.
    SCW.onViewRender(DOC_SAVE_VIEW, function () {
      var changed = rebuildFileMetaIndex();
      if (!changed) return;
      var viewEl = document.getElementById(VIEW_ID);
      if (viewEl) renderInto(viewEl);
    }, 'scwCloseoutDeliverables_metaIndex');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindView);
  } else {
    bindView();
  }
})();
