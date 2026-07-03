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

  // ── Deployments ──────────────────────────────────────────────────
  // The closeout strip runs on multiple scenes. Each deployment pairs:
  //   closeoutView — the CLOSEOUT grid we replace with the card strip
  //   docSaveView  — a hidden DOC inline-edit grid on the SAME scene
  //                  (raw S3 urls/thumbs + the QA-save/delete PUT/DELETE
  //                  target). SCW.knackRecordUrl is scoped to the CURRENT
  //                  scene, so this MUST live on the closeout's own scene;
  //                  it must expose every field we PUT as a cell-edit column
  //                  (field_2879/2880/2881/2882/2883/2895 + field_68).
  //   addSlug / editSlug — child-page slugs for "add doc"/"edit doc"
  //                  navigation (appended to the current hash).
  //   view_3940: deploy scene.  view_4058: subcontractor edit-core-project.
  var DEPLOYMENTS = [
    { closeoutView: 'view_3940', docSaveView: 'view_3941',
      addSlug: 'add-file-to-closeout',  editSlug: 'edit-doc-file' },
    { closeoutView: 'view_4058', docSaveView: 'view_4068',
      addSlug: 'add-file-to-closeout3', editSlug: 'edit-doc-file' }
  ];
  function depFor(closeoutView) {
    for (var i = 0; i < DEPLOYMENTS.length; i++) {
      if (DEPLOYMENTS[i].closeoutView === closeoutView) return DEPLOYMENTS[i];
    }
    return null;
  }
  // The deployment whose closeout grid is on the CURRENT scene (only one
  // closeout scene renders at a time) — used by the save/upload/slug paths.
  function activeDep() {
    for (var i = 0; i < DEPLOYMENTS.length; i++) {
      if (document.getElementById(DEPLOYMENTS[i].closeoutView)) return DEPLOYMENTS[i];
    }
    return DEPLOYMENTS[0];
  }

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
    qaHistory:     'field_2883',
    // Upload audit — populated by Make's upload scenario.
    uploadedBy:    'field_2902',  // Connection → user
    uploadedDate:  'field_2903'   // Date/Time
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
    var changed = false;
    for (var d = 0; d < DEPLOYMENTS.length; d++) {
      var v = window.Knack && Knack.views && Knack.views[DEPLOYMENTS[d].docSaveView];
      if (!v || !v.model || !v.model.data || !v.model.data.models) continue;
      changed = scanDocModels(v.model.data.models) || changed;
    }
    return changed;
  }
  function scanDocModels(models) {
    var changed = false;
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      if (!m || !m.id) continue;
      var raw = m.attributes && m.attributes[F.file + '_raw'];
      if (!raw || !raw.url) continue;

      // Connection field — Knack stores as [{id, identifier}].
      var upByArr = m.attributes[F.uploadedBy + '_raw'];
      var uploadedBy = (Array.isArray(upByArr) && upByArr.length && upByArr[0].identifier)
        ? String(upByArr[0].identifier) : '';
      // Date field — m.attributes[fk] is the formatted display string
      // ("05/13/2026 9:42 AM"); fk + '_raw' has the parsed components.
      var uploadedDate = String(m.attributes[F.uploadedDate] || '').trim();

      var prev = docFileMeta[m.id];
      var next = {
        url:          raw.url,
        thumbUrl:     raw.thumb_url || '',
        filename:     raw.filename || '',
        size:         raw.size || 0,
        type:         raw.type || '',
        uploadedBy:   uploadedBy,
        uploadedDate: uploadedDate
      };
      if (!prev || prev.url !== next.url || prev.thumbUrl !== next.thumbUrl ||
          prev.uploadedBy !== next.uploadedBy ||
          prev.uploadedDate !== next.uploadedDate) {
        docFileMeta[m.id] = next;
        changed = true;
      }
    }
    return changed;
  }

  // add/edit-doc slugs are per-deployment now (see DEPLOYMENTS above).

  // ── CSS injection ────────────────────────────────────────────────

  function injectCSS() {
    if (document.getElementById('scw-closeout-deliverables-css')) return;
    var css = [
      /* Hide the raw closeout grid — title, records-nav, table — we
         replace it with the strip card.  Easy to bring back: comment out
         this block (or selectively re-show parts) when the grid view
         becomes useful again. */
      // No '>' direct-child selector — Knack wraps the grid in a
      // <section.hideShow_view_3940 ktlHideShowSection ...> so a
      // direct-child combinator misses .kn-records-nav and
      // .kn-table-wrapper.  Descendant selector covers both layouts.
      DEPLOYMENTS.map(function (d) {
        return '#' + d.closeoutView + ' .view-header,' +
               '#' + d.closeoutView + ' .kn-records-nav,' +
               '#' + d.closeoutView + ' .kn-table-wrapper';
      }).join(',') + ' { display: none !important; }',

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
      /* Placeholder remove (×) — empty cards only */
      '.scw-cd-doc__del {',
      '  position: absolute; top: 5px; right: 5px; z-index: 2;',
      '  width: 20px; height: 20px; padding: 0; line-height: 1;',
      '  display: flex; align-items: center; justify-content: center;',
      '  border: none; border-radius: 50%; cursor: pointer;',
      '  background: rgba(15,23,42,0.06); color: #64748b; font-size: 15px;',
      '  opacity: 0; transition: opacity 0.12s, background 0.12s, color 0.12s;',
      '}',
      '.scw-cd-doc:hover .scw-cd-doc__del { opacity: 1; }',
      '.scw-cd-doc__del:hover { background: #fee2e2; color: #b91c1c; }',

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
      /* Non-required uploaded doc — neutral, no QA verdict. */
      '.scw-cd-doc.is-uploaded { border-color: #cbd5e1; }',
      '.scw-cd-doc.is-uploaded .scw-cd-doc__icon { color: #64748b; }',

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
      // PDF first-page preview — fills the thumb, non-interactive so the card
      // click still opens the popover.
      '.scw-cd-doc__preview--pdf {',
      '  width: 100%; height: 150px; max-height: none; max-width: none;',
      '  border: 0; pointer-events: none; overflow: hidden;',
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
      '}',

      // Brief green-pulse flash applied to a card immediately after an
      // upload succeeds.  Fades out over ~1.6s so the user gets a clear
      // "done" signal without lingering UI noise.
      '.scw-cd-doc.is-upload-success {',
      '  animation: scw-cd-flash 1.6s ease-out 1;',
      '}',
      '@keyframes scw-cd-flash {',
      '  0%   { box-shadow: 0 0 0 0   rgba(34, 197, 94, 0.0); }',
      '  20%  { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.55); }',
      '  100% { box-shadow: 0 0 0 0   rgba(34, 197, 94, 0.0); }',
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
      docs[id].rawUrl       = meta.url;
      docs[id].thumbUrl     = meta.thumbUrl;
      docs[id].uploadedBy   = meta.uploadedBy;
      docs[id].uploadedDate = meta.uploadedDate;
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
    return buildHashFromCurrent(activeDep().addSlug, closeoutId);
  }

  function editDocHash(docId) {
    return buildHashFromCurrent(activeDep().editSlug, docId);
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

  // A real thumbnail for the card: Knack's thumb_url when present, else the raw
  // S3 URL as an <img> for image files. PDFs are NOT embedded inline — Chrome
  // renders embedded PDFs via its built-in PDF Viewer extension, which trips
  // org "DeveloperToolsAvailability" policies and blocks DevTools on the whole
  // page. PDFs fall back to the icon (the popover still shows the full PDF on
  // demand). Returns null when there's no image preview (→ icon).
  function buildCardPreview(doc) {
    if (doc.thumbUrl) {
      var t = document.createElement('img');
      t.className = 'scw-cd-doc__preview';
      t.src = doc.thumbUrl; t.alt = doc.fileName || doc.type || 'Document';
      t.loading = 'lazy';
      return t;
    }
    var src = doc.rawUrl || doc.fileUrl;
    if (!src) return null;
    var ext = ((doc.fileName || src).toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/) || [])[1] || '';
    if (/^(png|jpe?g|gif|bmp|webp|heic|heif|tiff?|svg)$/.test(ext)) {
      var im = document.createElement('img');
      im.className = 'scw-cd-doc__preview';
      im.src = src; im.alt = doc.fileName || doc.type || 'Document';
      im.loading = 'lazy';
      return im;
    }
    return null;   // PDFs / other → icon fallback (no inline PDF embed)
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
    } else if (!doc.required) {
      // Non-required docs have no QA — neutral "uploaded" state, no QA colour.
      card.classList.add('is-uploaded');
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
    var previewEl = hasFile ? buildCardPreview(doc) : null;
    if (previewEl) {
      thumb.appendChild(previewEl);
    } else {
      var iconBox = document.createElement('div');
      iconBox.className = 'scw-cd-doc__icon';
      var iconLabel;
      if (hasFile) {
        if (!doc.required)   iconLabel = 'Uploaded';
        else if (isPass)     iconLabel = 'QA Pass';
        else if (isFail)     iconLabel = 'QA Fail';
        else                 iconLabel = 'Pending QA';
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

    // Placeholder delete — empty (no-file) cards get a small × to remove the
    // empty deliverable slot (the DOC record itself). Filed cards delete via
    // the QA popover's "Delete file" button instead.
    if (!hasFile) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'scw-cd-doc__del';
      del.title = 'Remove this placeholder';
      del.setAttribute('aria-label', 'Remove placeholder');
      del.innerHTML = '&times;';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        var label = doc.type || 'this placeholder';
        if (!window.confirm('Remove ' + label + ' from this closeout?')) return;
        setCardPending(card);
        performDocDelete(doc.id, null, function (xhr) {
          card.classList.remove('is-pending');
          alert('Delete failed (' + xhr.status + ')');
        });
      });
      card.appendChild(del);
    }

    // Click behaviour: ALWAYS open the QA popover — filed docs get the
    // viewer + QA sidebar, empty slots get the in-popover add-file pane
    // (renderViewerInto's dropzone) instead of being dumped straight into
    // a file picker. Knack's edit form stays reachable only as the
    // no-webhook fallback inside the popover pane.
    var uploadEnabled = !hasFile && !!(
      window.SCW && window.SCW.CONFIG && window.SCW.CONFIG.MAKE_DOC_UPLOAD_WEBHOOK
    );
    card.addEventListener('click', function (e) {
      if (card.classList.contains('is-pending')) return;
      e.stopPropagation();
      openQAPopover(card, doc, closeoutId);
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
          viewId:      activeDep().closeoutView,
          filename:    file.name || 'document.pdf',
          mimeType:    file.type || 'application/pdf',
          sizeBytes:   file.size,
          dataBase64:  b64,
          triggeredBy: getTriggeredBy()
        })
      });
    }).then(function (resp) {
      if (resp && resp.status && resp.status >= 400) {
        throw new Error('Webhook returned ' + resp.status);
      }
      return resp.text().then(function (txt) {
        var body = null;
        try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = null; }
        console.log('[SCW] doc upload webhook response:', resp.status, JSON.stringify(txt));
        return body;
      }).then(function (body) {
        // Explicit failure → stop and surface error.
        if (body && body.success === false) {
          delete pendingUploads[docId];
          setCardError(card, body.error || 'Upload failed');
          return;
        }
        // Anything else (success: true, "Accepted", empty body, plain
        // text response) → start the fast check pipeline.  Even with
        // {success: true} we still need to refetch view_3941 because
        // that's where the file metadata lives.
        startDocUploadPolling(docId);
      });
    }).catch(function (err) {
      console.error('[SCW] Doc upload error:', err);
      delete pendingUploads[docId];
      setCardError(card, 'Upload failed');
    });
  }

  // Unified upload-arrival polling pipeline.  Refetches view_3941 every
  // tick and checks docHasFileUploaded(docId) until the file lands or
  // we hit the timeout.  Cadence ramps: 700ms × 8 for the first ~5.6s
  // (most uploads land in this window), then 4s × N until 90s total.
  function startDocUploadPolling(docId) {
    var startedAt = Date.now();
    var ticks = 0;
    var FAST_TICKS    = 8;
    var FAST_INTERVAL = 700;
    var SLOW_INTERVAL = 4000;

    function tick() {
      if (!pendingUploads[docId]) return;
      var fastPhase = ticks < FAST_TICKS;
      var interval  = fastPhase ? FAST_INTERVAL : SLOW_INTERVAL;

      var promise = fetchBothViewsForDoc();
      promise.then(function () {
        if (!pendingUploads[docId]) return;
        var found = docHasFileUploaded(docId);
        console.log('[SCW] doc upload poll tick', ticks,
                    'phase=' + (fastPhase ? 'fast' : 'slow'),
                    'docId=' + docId,
                    'fileMeta=' + (docFileMeta[docId] ? 'YES' : 'no'),
                    'found=' + found);
        if (found) {
          delete pendingUploads[docId];
          // Trigger a strip rebuild directly. We can't rely on the
          // view_3941 onViewRender hook to do it — by the time that
          // event fires, our own docHasFileUploaded → rebuildFileMetaIndex
          // has already updated docFileMeta in place, so the hook sees
          // no change and skips the rebuild. Force it from here.
          var viewEl = document.getElementById(activeDep().closeoutView);
          if (viewEl) renderInto(viewEl);
          // Flash a green pulse on the freshly-rebuilt card so the user
          // sees the upload land. The class is removed after the
          // animation completes so subsequent uploads on the same card
          // re-trigger it.
          setTimeout(function () {
            var fresh = document.querySelector(
              '.scw-cd-doc[data-doc-id="' + docId + '"]'
            );
            if (!fresh) return;
            fresh.classList.add('is-upload-success');
            setTimeout(function () {
              fresh.classList.remove('is-upload-success');
            }, 1700);
          }, 0);
          return;
        }
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          delete pendingUploads[docId];
          console.warn('[SCW] Doc upload poll timed out for', docId,
                       '— check Make scenario or field_68 wiring');
          return;
        }
        ticks++;
        setTimeout(tick, interval);
      });
    }

    // First tick fires immediately (don't wait the full interval) so a
    // file that landed before the webhook returned shows up fast.
    tick();
  }

  // Legacy entry point — kept so existing callers in case any other
  // path triggers it.  Delegates to the unified pipeline.
  function pollForDocArrival(docId) { startDocUploadPolling(docId); }

  // Fetch BOTH views and return a Promise that resolves when both have
  // either completed or been skipped.  Returns immediately if no view
  // is fetchable.  Resolves with `null` (we don't need the data, the
  // Knack model updates in place — we just need to know when it's safe
  // to re-check).
  //
  // Each per-view Promise is racing a 4s timeout: if a jqXHR's always()
  // never fires (Knack/Backbone throwing inside its own success/error
  // handler can strand the deferred indefinitely), the timeout resolves
  // for us and the outer poll tick keeps going.  Without this, an
  // upstream "Cannot read properties of undefined" inside Knack would
  // leave our spinner pinned.
  var FETCH_RESOLVE_TIMEOUT_MS = 4000;

  function fetchBothViewsForDoc() {
    var _dep = activeDep();
    var ids = [_dep.closeoutView, _dep.docSaveView];
    var promises = [];
    for (var i = 0; i < ids.length; i++) {
      var v = window.Knack && Knack.views && Knack.views[ids[i]];
      if (!v || !v.model || typeof v.model.fetch !== 'function') continue;
      try {
        var u = (typeof v.model.url === 'function') ? v.model.url.call(v.model) : v.model.url;
        if (!u) continue;
      } catch (e) { continue; }
      try {
        var jq = v.model.fetch();
        if (jq && typeof jq.always === 'function') {
          promises.push(new Promise(function (resolve) {
            var settled = false;
            var done = function () {
              if (settled) return;
              settled = true;
              resolve();
            };
            try { jq.always(done); } catch (e) { /* swallow */ }
            // Safety timeout — Knack-internal exceptions inside the
            // deferred's success/error chain can prevent .always from
            // firing.  Don't strand the outer poll.
            setTimeout(done, FETCH_RESOLVE_TIMEOUT_MS);
          }));
        }
      } catch (e) { /* swallow */ }
    }
    if (!promises.length) return Promise.resolve();
    return Promise.all(promises);
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
    var viewEl = document.getElementById(activeDep().closeoutView);
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
      '.' + POPOVER_ID + '__btn--danger {',
      '  color: #b91c1c; border-color: #fecaca; background: #fff; margin-right: auto;',
      '}',
      '.' + POPOVER_ID + '__btn--danger:hover { background: #fef2f2; border-color: #fca5a5; }',
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

      // Remove file — clears field_68 but KEEPS the deliverable slot (unlike
      // the sidebar Delete, which removes the whole DOC record). The slot
      // flips back to empty and can take a fresh upload from the same panel.
      var rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = POPOVER_ID + '__head-btn';
      rmBtn.textContent = 'Remove file';
      rmBtn.addEventListener('click', function () {
        var label = doc.type || 'this deliverable';
        if (!window.confirm('Remove the uploaded file from ' + label + '?\n\n' +
              'The deliverable slot stays — only the file is cleared.')) return;
        var popEl = document.getElementById(POPOVER_ID);
        if (popEl) popEl.classList.add(POPOVER_ID + '__saving');
        var fields = {};
        fields[F.file] = null;
        fields[F.completed] = 'No';
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(activeDep().docSaveView, doc.id),
          type: 'PUT',
          data: JSON.stringify(fields),
          success: function () { closeQAPopover(); refetchCloseoutViews(); },
          error: function (xhr) {
            if (popEl) popEl.classList.remove(POPOVER_ID + '__saving');
            alert('Remove failed (' + xhr.status + ')');
          }
        });
      });
      headActions.appendChild(rmBtn);
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

    // QA options (status chips + notes) are only shown for REQUIRED docs
    // (field_2894 = Yes). Optional deliverables don't get a QA sign-off.
    if (doc.required) {
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
    }

    // Upload audit — who uploaded this file and when (from field_2902/2903
    // on the DOC record, captured by Make at upload time).
    if (doc.uploadedBy || doc.uploadedDate) {
      var uploadAudit = document.createElement('div');
      uploadAudit.className = POPOVER_ID + '__signoff';
      uploadAudit.style.marginBottom = '8px';
      uploadAudit.innerHTML =
        'Uploaded by <strong>' + escapeHtml(doc.uploadedBy || '—') +
        '</strong> on <strong>' + escapeHtml(doc.uploadedDate || '—') + '</strong>';
      sbContent.appendChild(uploadAudit);
    }

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
  /** In-popover add-file pane for an empty slot: click → native picker,
   *  or drag a file straight onto it. Dispatches through the existing
   *  Make upload path (card pending state + polling), closing the popover
   *  so the grid's progress feedback takes over. No-webhook fallback links
   *  to Knack's edit form. */
  function buildAddFilePane(doc) {
    var canUpload = !!(window.SCW && window.SCW.CONFIG &&
                       window.SCW.CONFIG.MAKE_DOC_UPLOAD_WEBHOOK);
    var pane = document.createElement('div');
    pane.className = POPOVER_ID + '__viewer-empty' +
      (canUpload ? ' ' + POPOVER_ID + '__viewer-empty--drop' : '');
    if (!canUpload) {
      pane.innerHTML = 'No file uploaded yet.<br>';
      var link = document.createElement('a');
      link.href = 'javascript:void(0)';
      link.textContent = 'Upload via the edit form →';
      link.addEventListener('click', function () {
        var h = editDocHash(doc.id);
        closeQAPopover();
        if (h) navigate(h);
      });
      pane.appendChild(link);
      return pane;
    }
    pane.innerHTML =
      '<strong>No file uploaded yet</strong><br>' +
      'Click to choose a PDF/doc, or drag one here.';
    if (!document.getElementById('scw-cd-addfile-css')) {
      var st = document.createElement('style');
      st.id = 'scw-cd-addfile-css';
      st.textContent =
        '.' + POPOVER_ID + '__viewer-empty--drop { cursor: pointer;' +
        ' border: 2px dashed #6b7280; border-radius: 10px; margin: 24px;' +
        ' padding: 40px 24px; transition: border-color .15s, color .15s; }' +
        '.' + POPOVER_ID + '__viewer-empty--drop:hover,' +
        '.' + POPOVER_ID + '__viewer-empty--drop.is-over {' +
        ' border-color: #60a5fa; color: #e5e7eb; }';
      document.head.appendChild(st);
    }
    pane.addEventListener('click', function () {
      var card = _popoverCard, coId = _popoverCloseoutId;
      closeQAPopover();
      openDocFilePicker(card, doc.id, coId);
    });
    pane.addEventListener('dragover', function (ev) {
      ev.preventDefault();
      pane.classList.add('is-over');
    });
    pane.addEventListener('dragleave', function () { pane.classList.remove('is-over'); });
    pane.addEventListener('drop', function (ev) {
      ev.preventDefault();
      pane.classList.remove('is-over');
      var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (!file) return;
      var card = _popoverCard, coId = _popoverCloseoutId;
      closeQAPopover();
      if (card) dispatchDocUpload(card, doc.id, coId, file);
    });
    return pane;
  }

  function renderViewerInto(viewerEl, doc) {
    viewerEl.innerHTML = '';
    // Just-in-time raw-URL resolve. The closeout grid only exposes Knack's
    // ROUTE url for the file (a #kn-asset/… hash) — embedding that in the
    // iframe loads the WHOLE Knack app in the background instead of the PDF.
    // The raw S3 url lives on the hidden DOC inline-edit grid's model
    // (docSaveView), which may have rendered AFTER the card list was built.
    // Re-scan now so the preview embeds the file directly (matching the view
    // whose docSaveView was already loaded). If still missing, the docSaveView
    // for THIS scene isn't projecting the file field — see fallback below.
    if (doc && !doc.rawUrl && doc.id) {
      rebuildFileMetaIndex();
      var jitMeta = docFileMeta[doc.id];
      if (jitMeta && jitMeta.url) {
        doc.rawUrl = jitMeta.url;
        if (!doc.thumbUrl) doc.thumbUrl = jitMeta.thumbUrl;
      }
    }
    // Prefer the raw S3 URL from view_3941's model — that gives the
    // browser a real application/pdf response so Chrome's PDF viewer
    // renders directly inside the iframe (no Knack app chrome).  Fall
    // back to the route URL (Knack's `#kn-asset/...`) only if we never
    // got the raw URL from the model.
    var src = doc.rawUrl || doc.fileUrl;
    if (!src) {
      viewerEl.appendChild(buildAddFilePane(doc));
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

    // PDF (or anything browser-renders inline). Embed the file directly and
    // let the browser show its FULL native PDF viewer — toolbar, thumbnail
    // panel, zoom — same interactive experience view_3940 gets from Knack's
    // route URL. (We intentionally do NOT append #toolbar=0&navpanes=0&… —
    // those would strip the viewer chrome on the raw-S3 path, which is the
    // ONLY reason view_4058 used to render chrome-less while view_3940 didn't.)
    var iframe = document.createElement('iframe');
    iframe.src = src;
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
      var locked = !!_popoverDoc.required && (status === 'Pass');
      replaceBtn.disabled = locked;
      if (locked) {
        replaceBtn.textContent = 'Replace locked (QA signed off)';
        replaceBtn.title = 'Set QA back to Pending or Fail to enable replacement';
      } else {
        replaceBtn.textContent = _popoverDoc.fileUrl ? 'Replace file…' : 'Upload file…';
        replaceBtn.removeAttribute('title');
      }
    }

    // Destructive action first (leftmost) — deletes the file/document.
    // Hidden once QA is signed off (Pass) so a completed deliverable can't be
    // deleted out from under the sign-off; flip QA back to Pending/Fail first.
    var signedOff = !!_popoverDoc.required && (status === 'Pass');
    if (!signedOff) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = POPOVER_ID + '__btn ' + POPOVER_ID + '__btn--danger';
      del.textContent = 'Delete file';
      del.addEventListener('click', function () { deleteDoc(); });
      footer.appendChild(del);
    }

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = POPOVER_ID + '__btn';
    closeBtn.textContent = dirty ? 'Cancel' : 'Close';
    closeBtn.addEventListener('click', function () { closeQAPopover(); });
    footer.appendChild(closeBtn);

    // QA save only for required docs (optional docs show no QA controls).
    if (_popoverDoc.required) {
      var save = document.createElement('button');
      save.type = 'button';
      save.className = POPOVER_ID + '__btn ' + POPOVER_ID + '__btn--primary';
      save.textContent = (status === 'Pass') ? 'Sign off' :
                         (status === 'Fail') ? 'Mark fail' : 'Save QA';
      save.disabled = !dirty || needsNotes;
      save.addEventListener('click', function () { saveQA(); });
      footer.appendChild(save);
    }
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
      url:  SCW.knackRecordUrl(activeDep().docSaveView, _popoverDoc.id),
      type: 'PUT',
      data: JSON.stringify(fields),
      success: function () {
        closeQAPopover();
        // Refresh both views so the strip and the underlying DOC grid
        // both reflect the new state.
        var v1 = window.Knack && Knack.views && Knack.views[activeDep().closeoutView];
        if (v1 && v1.model && typeof v1.model.fetch === 'function') v1.model.fetch();
        var v2 = window.Knack && Knack.views && Knack.views[activeDep().docSaveView];
        if (v2 && v2.model && typeof v2.model.fetch === 'function') v2.model.fetch();
      },
      error: function (xhr) {
        if (pop) pop.classList.remove(POPOVER_ID + '__saving');
        console.error('[SCW] doc QA save error:', xhr.status, xhr.responseText);
        alert('Save failed (' + xhr.status + ')');
      }
    });
  }

  function refetchCloseoutViews() {
    var v1 = window.Knack && Knack.views && Knack.views[activeDep().closeoutView];
    if (v1 && v1.model && typeof v1.model.fetch === 'function') v1.model.fetch();
    var v2 = window.Knack && Knack.views && Knack.views[activeDep().docSaveView];
    if (v2 && v2.model && typeof v2.model.fetch === 'function') v2.model.fetch();
  }
  // Delete a DOC record via the view_3941 record endpoint — mirror of saveQA's
  // PUT. Removing the DOC drops it from the closeout's connection columns, so
  // the card disappears on the refetch. Shared by the popover (filed docs) and
  // the placeholder × (empty cards).
  function performDocDelete(docId, onSuccess, onError) {
    if (typeof SCW === 'undefined' || typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') {
      alert('Delete unavailable (SCW.knackAjax missing)');
      return;
    }
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(activeDep().docSaveView, docId),
      type: 'DELETE',
      success: function () { if (onSuccess) onSuccess(); refetchCloseoutViews(); },
      error: function (xhr) {
        console.error('[SCW] doc delete error:', xhr.status, xhr.responseText);
        if (onError) onError(xhr);
      }
    });
  }
  function deleteDoc() {   // popover (filed doc)
    if (!_popover || !_popoverDoc) return;
    var label = _popoverDoc.type || 'this file';
    if (!window.confirm('Delete ' + label + '?\n\nThis permanently removes the document from this closeout.')) return;
    var pop = _popover.querySelector('.' + POPOVER_ID);
    if (pop) pop.classList.add(POPOVER_ID + '__saving');
    performDocDelete(_popoverDoc.id, function () { closeQAPopover(); }, function (xhr) {
      if (pop) pop.classList.remove(POPOVER_ID + '__saving');
      alert('Delete failed (' + xhr.status + ')');
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
    DEPLOYMENTS.forEach(function (dep) {
      SCW.onViewRender(dep.closeoutView, function () {
        var viewEl = document.getElementById(dep.closeoutView);
        if (!viewEl) return;
        renderInto(viewEl);
      }, 'scwCloseoutDeliverables');

      // The DOC inline-edit grid carries the raw file URL and thumb_url
      // that the closeout grid hides behind a route URL. When it renders
      // (which may be before OR after the closeout grid), refresh our index
      // and rebuild the strip so the cards pick up the new metadata for
      // thumbnails + clean modal previews.
      SCW.onViewRender(dep.docSaveView, function () {
        var changed = rebuildFileMetaIndex();
        if (!changed) return;
        var viewEl = document.getElementById(dep.closeoutView);
        if (viewEl) renderInto(viewEl);
      }, 'scwCloseoutDeliverables_metaIndex');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindView);
  } else {
    bindView();
  }
})();
