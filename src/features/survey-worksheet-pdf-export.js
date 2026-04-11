/*** SCW SURVEY WORKSHEET — PDF EXPORT (view_3800) ***/
/*
 * Scrapes the live device-worksheet DOM (tr.scw-ws-row) into a printable
 * HTML payload suitable for:
 *   a) immediate preview via window.open + print
 *   b) forwarding to the Make.com PDF webhook
 *
 * Rules implemented here:
 *   • All sections are expanded in the output.
 *   • Photo strip is omitted when no real (uploaded) photos exist —
 *     "required but missing" placeholder slots do not count.
 *   • A card collapses to header-only when the detail panel has no
 *     populated readOnly content AND no populated directEdit content.
 *
 * Public API (exposed on window.SCW.surveyWorksheetPdf):
 *   scrape(viewId?)          → structured payload object
 *   buildHtml(payload)       → full HTML document string
 *   preview(viewId?)         → scrape + buildHtml + open print window
 *   sendToWebhook(viewId?)   → scrape + buildHtml + POST to Make.com
 *   generate(viewId?)        → preview() (alias, matches proposal-pdf-export)
 *
 * Default viewId = 'view_3800'.
 */
(function () {
  'use strict';

  var DEFAULT_VIEW_ID = 'view_3800';
  var WEBHOOK_URL     = 'https://hook.us1.make.com/u7x7hxladwuk6sgk4gzcqvwqgm3vpeza';
  var FORM_VIEW_ID    = 'view_3809'; // "Update SITE SURVEY_request" — submit = trigger

  // ── shared helpers ───────────────────────────────────────────────

  function norm(s) {
    return String(s == null ? '' : s).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s == null ? '' : s)));
    return d.innerHTML;
  }

  function textOf(el) {
    if (!el) return '';
    return norm(el.textContent || '');
  }

  /** Read the effective value of a detail/summary field cell. Handles
   *  <input>/<textarea>/<select> inside the td as well as plain text. */
  function cellValue(td) {
    if (!td) return '';
    var input = td.querySelector('textarea, input[type="text"], input[type="number"], input:not([type]), select');
    if (input) {
      if (input.tagName === 'SELECT') {
        var opt = input.options[input.selectedIndex];
        return norm(opt ? opt.textContent : '');
      }
      return norm(input.value || '');
    }
    // Radio chips — read the selected chip
    var selChip = td.querySelector('.scw-ws-radio-chip.is-selected');
    if (selChip) return norm(selChip.textContent);
    // Multi-chip selection
    var selChips = td.querySelectorAll('.scw-ws-radio-chip.is-selected');
    if (selChips && selChips.length > 1) {
      var vals = [];
      for (var i = 0; i < selChips.length; i++) vals.push(norm(selChips[i].textContent));
      return vals.join(', ');
    }
    // Boolean chit
    var chit = td.querySelector('.scw-ws-cabling-chit.is-yes, .scw-ws-cabling-chit.is-no');
    if (chit) return chit.classList.contains('is-yes') ? 'Yes' : 'No';
    return norm(td.textContent || '');
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPER
  // ══════════════════════════════════════════════════════════════

  function scrape(viewId) {
    viewId = viewId || DEFAULT_VIEW_ID;
    var root = document.getElementById(viewId);
    if (!root) return { viewId: viewId, title: '', rows: [] };

    var title = '';
    var h2 = root.querySelector('.view-header h2, .view-header h1');
    if (h2) title = textOf(h2);

    var tbody = root.querySelector('table tbody');
    if (!tbody) return { viewId: viewId, title: title, rows: [] };

    var out = [];
    var kids = tbody.children;

    for (var i = 0; i < kids.length; i++) {
      var tr = kids[i];
      if (tr.style && tr.style.display === 'none') continue;

      // ── group header rows ──
      if (tr.classList.contains('kn-table-group')) {
        var level = tr.classList.contains('kn-group-level-1') ? 1
                  : tr.classList.contains('kn-group-level-2') ? 2
                  : tr.classList.contains('kn-group-level-3') ? 3 : 1;
        var label = textOf(tr.querySelector('td'));
        if (!label) continue;
        out.push({ type: 'group', level: level, label: label });
        continue;
      }

      // ── worksheet card rows ──
      if (!tr.classList.contains('scw-ws-row')) continue;
      var card = tr.querySelector('.scw-ws-card');
      if (!card) continue;

      var rowObj = scrapeCard(card);
      if (rowObj) out.push(rowObj);
    }

    return { viewId: viewId, title: title, rows: out };
  }

  function scrapeCard(card) {
    // ── Summary / header ─────────────────────────────────────────
    var summary = card.querySelector('.scw-ws-summary');
    var label   = '';
    var product = '';

    if (summary) {
      var labelCell = summary.querySelector('.scw-ws-sum-label-cell');
      if (labelCell) label = textOf(labelCell);

      var productCell = summary.querySelector('.scw-ws-sum-product');
      if (productCell) product = textOf(productCell);
    }

    // Warning count (visible chit, not the hidden spacer)
    var warnCount = 0;
    if (summary) {
      var warnChit = summary.querySelector('.scw-ws-warn-chit');
      if (warnChit && warnChit.style.visibility !== 'hidden') {
        var n = parseInt(norm(warnChit.textContent).replace(/[^0-9]/g, ''), 10);
        if (n > 0) warnCount = n;
      }
    }

    // Summary fields (right bar + "fill" fields like Survey Notes)
    // Each .scw-ws-sum-group has a .scw-ws-sum-label + the field td.
    var summaryFields = [];
    if (summary) {
      var groups = summary.querySelectorAll('.scw-ws-sum-group');
      for (var g = 0; g < groups.length; g++) {
        var grp = groups[g];
        // Skip structural groups (move icon, delete, qty badge, checkbox spacers)
        if (grp.classList.contains('scw-ws-sum-group--move')) continue;
        if (grp.classList.contains('scw-ws-sum-group--qty-badge')) continue;
        var lblEl = grp.querySelector('.scw-ws-sum-label');
        var fieldTd = grp.querySelector(
          'td.scw-ws-sum-field, td.scw-ws-sum-field-ro, td.scw-ws-sum-direct-edit, td.scw-ws-sum-chip-host'
        );
        if (!fieldTd) continue;
        var val = cellValue(fieldTd);
        if (!val) continue;
        var lbl = lblEl ? textOf(lblEl) : '';
        summaryFields.push({ label: lbl, value: val });
      }
    }

    // ── Detail panel ─────────────────────────────────────────────
    // Collect every .scw-ws-field present in the detail panel, keyed
    // by its field_XXXX identifier. The PDF renderer uses a static
    // left/right layout (below) and looks up values from this map.
    var detailValues = {};
    var detailHasAnyField = false;

    var detail = card.querySelector('.scw-ws-detail');
    if (detail) {
      var fields = detail.querySelectorAll('.scw-ws-field[data-scw-field]');
      for (var f = 0; f < fields.length; f++) {
        var fEl = fields[f];
        var key = fEl.getAttribute('data-scw-field');
        if (!key) continue;
        detailHasAnyField = true;
        var valEl = fEl.querySelector('.scw-ws-field-value');
        if (!valEl) { detailValues[key] = ''; continue; }
        var isEmpty = valEl.classList.contains('scw-ws-field-value--empty');
        detailValues[key] = isEmpty ? '' : cellValue(valEl);
      }
    }

    // Collapse rule: drop the detail panel entirely when the card has
    // NO detail fields in the live DOM (services / assumptions rows).
    // Cards that have detail fields are always expanded so the tech has
    // space to fill in blanks in the field.
    var showDetail = detailHasAnyField;

    // ── Photos ───────────────────────────────────────────────────
    var photos = [];
    var photoWrap = card.querySelector('.scw-ws-photo-wrap');
    if (photoWrap && !photoWrap.classList.contains('scw-ws-photo-hidden')) {
      var photoCards = photoWrap.querySelectorAll('.scw-inline-photo-card[data-photo-has-image="true"]');
      for (var p = 0; p < photoCards.length; p++) {
        var pc = photoCards[p];
        var img = pc.querySelector('img');
        if (!img) continue;
        var src = img.getAttribute('src') || '';
        if (!src) continue;
        photos.push({
          src: src,
          alt: img.getAttribute('alt') || '',
          type: pc.getAttribute('data-photo-type') || '',
          notes: pc.getAttribute('data-photo-notes') || ''
        });
      }
    }

    return {
      type: 'card',
      label: label,
      product: product,
      warnCount: warnCount,
      summaryFields: summaryFields,
      detailValues: detailValues,
      photos: photos,
      showDetail: showDetail,
      showPhotos: photos.length > 0
    };
  }

  // ══════════════════════════════════════════════════════════════
  // PDF PRINT LAYOUT
  // Static definition of which fields appear where in the printable
  // form, regardless of how the device-worksheet renders them on the
  // screen. "text" → read-only value; "fill" → value-or-blank-line;
  // "yesno" → checkbox pair for Yes / No.
  // ══════════════════════════════════════════════════════════════

  var PDF_DETAIL_LAYOUT = {
    // Full-width context rows rendered above the grid. Each is shown
    // only when the field actually has a value on this card.
    context: [
      { key: 'field_2409', label: 'Labor Description', kind: 'text' },
      { key: 'field_2418', label: 'SCW Notes',         kind: 'text' }
    ],
    left: [
      // Mounting Hardware is reference data — only show if populated.
      { key: 'field_2463', label: 'Mounting Hardware', kind: 'text', onlyIfValue: true },
      // Mounting Height is always printed BLANK — checkboxes for each of
      // the multi-select options, regardless of what's currently saved.
      { key: 'field_2455', label: 'Mounting Height',   kind: 'choices',
        options: ["Under 16'", "16' - 24'", "Over 24'"] },
      { key: 'field_2367', label: 'Drop Length',       kind: 'fill' },
      { key: 'field_2368', label: 'Conduit Ft',        kind: 'fill' }
    ],
    right: [
      { key: 'field_2370', label: 'Existing Cabling',  kind: 'yesno' },
      { key: 'field_2372', label: 'Exterior',          kind: 'yesno' },
      { key: 'field_2371', label: 'Plenum',            kind: 'yesno' }
    ]
  };

  // ══════════════════════════════════════════════════════════════
  // HTML BUILDER
  // ══════════════════════════════════════════════════════════════

  function buildHtml(payload) {
    var html = [];
    html.push('<!DOCTYPE html>');
    html.push('<html><head><meta charset="utf-8">');
    html.push('<title>' + esc(payload.title || 'Survey Worksheet') + '</title>');
    html.push('<style>');
    html.push(getCss());
    html.push('</style>');
    html.push('</head><body>');

    if (payload.title) {
      html.push('<h1 class="doc-title">' + esc(payload.title) + '</h1>');
    }

    for (var i = 0; i < payload.rows.length; i++) {
      var row = payload.rows[i];
      if (row.type === 'group') {
        html.push(renderGroupHeader(row));
      } else if (row.type === 'card') {
        html.push(renderCard(row));
      }
    }

    html.push('</body></html>');
    return html.join('\n');
  }

  function renderGroupHeader(row) {
    var cls = 'group-header group-level-' + (row.level || 1);
    return '<div class="' + cls + '">' + esc(row.label) + '</div>';
  }

  function renderContextRows(card, specs) {
    var h = [];
    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      if (!(spec.key in card.detailValues)) continue;
      var value = card.detailValues[spec.key] || '';
      if (!value) continue; // context rows are always onlyIfValue
      h.push('<div class="ws-context-row">');
      h.push('<span class="ws-context-label">' + esc(spec.label) + '</span>');
      h.push('<span class="ws-context-value">' + esc(value) + '</span>');
      h.push('</div>');
    }
    return h.join('');
  }

  function renderDetailColumn(card, specs) {
    var h = [];
    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      // Only render fields that actually exist on this card's detail panel.
      // (Some buckets — e.g. subcontractor override — use a narrower set.)
      if (!(spec.key in card.detailValues)) continue;
      var value = card.detailValues[spec.key] || '';
      // Fields flagged onlyIfValue are hidden when blank — used for
      // reference-only data that shouldn't show a blank line.
      if (spec.onlyIfValue && !value) continue;

      h.push('<div class="ws-detail-field ws-detail-field--' + spec.kind + '">');
      h.push('<span class="ws-detail-label">' + esc(spec.label) + '</span>');

      if (spec.kind === 'choices') {
        // Always-blank checkbox row (options from spec.options)
        h.push('<span class="ws-detail-value ws-choices">');
        var opts = spec.options || [];
        for (var oi = 0; oi < opts.length; oi++) {
          h.push('<span class="ws-choice">');
          h.push('<span class="ws-box">\u2610</span> ' + esc(opts[oi]));
          h.push('</span>');
        }
        h.push('</span>');
      } else if (spec.kind === 'yesno') {
        var v = value.toLowerCase();
        var yesOn = v === 'yes' || v === 'true';
        var noOn  = v === 'no'  || v === 'false';
        h.push('<span class="ws-detail-value ws-yesno">');
        h.push('<span class="ws-box' + (yesOn ? ' is-on' : '') + '">' + (yesOn ? '\u2612' : '\u2610') + '</span> Yes');
        h.push('<span class="ws-box' + (noOn ? ' is-on' : '') + '">' + (noOn ? '\u2612' : '\u2610') + '</span> No');
        h.push('</span>');
      } else if (spec.kind === 'fill') {
        // Value-or-blank-line: show the value if present, otherwise a
        // bottom-ruled span wide enough to write on.
        h.push('<span class="ws-detail-value ws-fill">' + esc(value) + '</span>');
      } else {
        // Plain text (read-only data field)
        h.push('<span class="ws-detail-value">' + esc(value) + '</span>');
      }

      h.push('</div>');
    }
    return h.join('');
  }

  function renderCard(card) {
    var h = [];
    h.push('<section class="ws-card' + (card.showDetail ? '' : ' ws-card--header-only') + '">');

    // ── Header row ──
    h.push('<header class="ws-header">');
    h.push('<div class="ws-identity">');
    if (card.label) h.push('<span class="ws-label">' + esc(card.label) + '</span>');
    if (card.label && card.product) h.push('<span class="ws-sep">&middot;</span>');
    if (card.product) h.push('<span class="ws-product">' + esc(card.product) + '</span>');
    if (card.warnCount > 0) {
      h.push('<span class="ws-warn">&#9888; ' + card.warnCount + '</span>');
    }
    h.push('</div>');

    if (card.summaryFields.length) {
      h.push('<div class="ws-summary-fields">');
      for (var s = 0; s < card.summaryFields.length; s++) {
        var sf = card.summaryFields[s];
        // Rename "Survey Notes" → "Other Notes" when populated (only
        // populated summary fields make it into this array).
        var sfLabel = sf.label;
        if (sfLabel && sfLabel.toLowerCase().replace(/\s+/g, ' ').trim() === 'survey notes') {
          sfLabel = 'Other Notes';
        }
        h.push('<div class="ws-sum-field">');
        if (sfLabel) h.push('<span class="ws-sum-label">' + esc(sfLabel) + '</span>');
        h.push('<span class="ws-sum-value">' + esc(sf.value) + '</span>');
        h.push('</div>');
      }
      h.push('</div>');
    }
    h.push('</header>');

    // ── Full-width context rows (labor desc, scw notes) ──
    if (card.showDetail && PDF_DETAIL_LAYOUT.context) {
      var ctxHtml = renderContextRows(card, PDF_DETAIL_LAYOUT.context);
      if (ctxHtml) {
        h.push('<div class="ws-context">');
        h.push(ctxHtml);
        h.push('</div>');
      }
    }

    // ── Detail grid (static left/right layout + fillable blanks) ──
    if (card.showDetail) {
      h.push('<div class="ws-detail">');
      h.push('<div class="ws-detail-col">');
      h.push(renderDetailColumn(card, PDF_DETAIL_LAYOUT.left));
      h.push('</div>');
      h.push('<div class="ws-detail-col">');
      h.push(renderDetailColumn(card, PDF_DETAIL_LAYOUT.right));
      h.push('</div>');
      h.push('</div>');

      // ── Blank notes area ──
      h.push('<div class="ws-notes">');
      h.push('<div class="ws-notes-label">Notes</div>');
      h.push('<div class="ws-notes-lines">');
      h.push('<div class="ws-notes-line"></div>');
      h.push('<div class="ws-notes-line"></div>');
      h.push('<div class="ws-notes-line"></div>');
      h.push('</div>');
      h.push('</div>');
    }

    // ── Photo strip ──
    if (card.showPhotos) {
      h.push('<div class="ws-photos">');
      for (var p = 0; p < card.photos.length; p++) {
        var ph = card.photos[p];
        h.push('<figure class="ws-photo">');
        h.push('<img src="' + esc(ph.src) + '" alt="' + esc(ph.alt) + '" />');
        if (ph.type) h.push('<figcaption>' + esc(ph.type) + '</figcaption>');
        h.push('</figure>');
      }
      h.push('</div>');
    }

    h.push('</section>');
    return h.join('');
  }

  function getCss() {
    return [
      '@page { size: letter; margin: 0.2in 0.225in; }',
      '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }',
      '',
      '*, *::before, *::after { box-sizing: border-box; }',
      'body {',
      '  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;',
      '  color: #1f2937; font-size: 11px; line-height: 1.4;',
      '  margin: 0; padding: 8px;',
      '}',
      '.doc-title {',
      '  font-size: 20px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 12px 0; padding-bottom: 6px;',
      '  border-bottom: 3px solid #07467c;',
      '}',
      '.group-header {',
      '  font-size: 13px; font-weight: 600; color: #07467c;',
      '  background: #eef5fb; padding: 6px 10px;',
      '  margin: 14px 0 6px 0; border-left: 3px solid #5b9bd5;',
      '  page-break-after: avoid;',
      '}',
      '.group-header.group-level-1 {',
      '  font-size: 14px; font-weight: 700;',
      '  background: #dbeafe; border-left-color: #07467c;',
      '}',
      '',
      '.ws-card {',
      '  border: 1px solid #d0d7de; border-radius: 6px;',
      '  margin: 6px 0; padding: 8px 10px;',
      '  page-break-inside: avoid; background: #fff;',
      '}',
      '.ws-card--header-only { padding: 6px 10px; }',
      '',
      '.ws-header {',
      '  display: flex; flex-wrap: wrap; justify-content: space-between;',
      '  align-items: baseline; gap: 12px;',
      '}',
      '.ws-identity {',
      '  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px;',
      '  min-width: 0; flex: 1 1 auto;',
      '}',
      '.ws-label {',
      '  font-size: 13px; font-weight: 700; color: #07467c;',
      '}',
      '.ws-sep { color: #94a3b8; }',
      '.ws-product {',
      '  font-size: 12px; font-weight: 500; color: #374151;',
      '}',
      '.ws-warn {',
      '  font-size: 10px; font-weight: 700; color: #b45309;',
      '  background: #fef3c7; border-radius: 999px;',
      '  padding: 1px 7px; margin-left: 4px;',
      '}',
      '',
      '.ws-summary-fields {',
      '  display: flex; flex-wrap: wrap; gap: 4px 14px;',
      '  flex: 0 1 auto; max-width: 60%;',
      '}',
      '.ws-sum-field {',
      '  display: inline-flex; gap: 4px; align-items: baseline;',
      '  font-size: 10.5px;',
      '}',
      '.ws-sum-label {',
      '  font-weight: 600; color: #6b7280; text-transform: uppercase;',
      '  font-size: 9px; letter-spacing: 0.3px;',
      '}',
      '.ws-sum-value {',
      '  color: #111827; font-weight: 500;',
      '  white-space: pre-wrap;',
      '}',
      '',
      '.ws-context {',
      '  margin-top: 6px; padding-top: 5px;',
      '  border-top: 1px dashed #e5e7eb;',
      '  display: flex; flex-direction: column; gap: 2px;',
      '}',
      '.ws-context-row {',
      '  display: flex; gap: 8px; align-items: baseline;',
      '  font-size: 10.5px;',
      '}',
      '.ws-context-label {',
      '  font-weight: 600; color: #07467c;',
      '  min-width: 110px; flex: 0 0 110px;',
      '}',
      '.ws-context-value {',
      '  color: #111827; flex: 1 1 auto;',
      '  white-space: pre-wrap; word-break: break-word;',
      '}',
      '',
      '.ws-detail {',
      '  display: grid; grid-template-columns: 1fr 1fr;',
      '  column-gap: 24px; row-gap: 4px;',
      '  margin-top: 8px; padding-top: 6px;',
      '  border-top: 1px dashed #e5e7eb;',
      '}',
      '.ws-detail-col { display: flex; flex-direction: column; gap: 4px; }',
      '.ws-detail-field {',
      '  display: flex; gap: 8px; align-items: baseline;',
      '  font-size: 10.5px; padding: 2px 0;',
      '}',
      '.ws-detail-label {',
      '  font-weight: 600; color: #07467c;',
      '  min-width: 110px; flex: 0 0 110px;',
      '  white-space: normal;',
      '}',
      '.ws-detail-value {',
      '  color: #111827; flex: 1 1 auto;',
      '  white-space: pre-wrap; word-break: break-word;',
      '}',
      '',
      '/* Fill-in-the-blank value: underline, taller for writing */',
      '.ws-detail-field--fill .ws-detail-value.ws-fill {',
      '  border-bottom: 1px solid #4b5563;',
      '  min-height: 16px; padding-bottom: 1px;',
      '}',
      '',
      '/* Multi-option checkbox row (e.g. Mounting Height) */',
      '.ws-choices {',
      '  display: inline-flex; flex-wrap: wrap; gap: 12px;',
      '  align-items: baseline; font-size: 11px;',
      '}',
      '.ws-choice { white-space: nowrap; }',
      '',
      '/* Yes / No checkbox pair */',
      '.ws-yesno {',
      '  display: inline-flex; gap: 14px; align-items: baseline;',
      '  font-size: 11px;',
      '}',
      '.ws-box {',
      '  display: inline-block; font-size: 14px; line-height: 1;',
      '  margin-right: 3px; color: #111827;',
      '}',
      '.ws-box.is-on { color: #07467c; font-weight: 700; }',
      '',
      '/* Field Notes — blank lined writing area */',
      '.ws-notes {',
      '  margin-top: 10px; padding-top: 6px;',
      '  border-top: 1px dashed #e5e7eb;',
      '}',
      '.ws-notes-label {',
      '  font-size: 9px; font-weight: 700; color: #6b7280;',
      '  text-transform: uppercase; letter-spacing: 0.5px;',
      '  margin-bottom: 4px;',
      '}',
      '.ws-notes-lines { display: flex; flex-direction: column; gap: 12px; }',
      '.ws-notes-line {',
      '  height: 14px; border-bottom: 1px solid #9ca3af;',
      '}',
      '',
      '.ws-photos {',
      '  display: flex; flex-wrap: wrap; gap: 6px;',
      '  margin-top: 8px; padding-top: 6px;',
      '  border-top: 1px dashed #e5e7eb;',
      '}',
      '.ws-photo {',
      '  margin: 0; width: 110px;',
      '  border: 1px solid #d0d7de; border-radius: 4px;',
      '  padding: 2px; text-align: center; background: #f8fafc;',
      '}',
      '.ws-photo img {',
      '  width: 100%; height: 80px; object-fit: cover; display: block;',
      '  border-radius: 2px;',
      '}',
      '.ws-photo figcaption {',
      '  font-size: 8px; color: #6b7280; margin-top: 2px;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}'
    ].join('\n');
  }

  // ══════════════════════════════════════════════════════════════
  // ACTIONS
  // ══════════════════════════════════════════════════════════════

  function openPreview(htmlStr) {
    var win = window.open('', '_blank');
    if (!win) {
      alert('Popup blocked — please allow popups for this site and try again.');
      return;
    }
    win.document.write(htmlStr);
    win.document.close();
    setTimeout(function () { try { win.print(); } catch (e) {} }, 600);
  }

  function postToWebhook(data) {
    if (typeof $ === 'undefined') return;
    $.ajax({
      url: WEBHOOK_URL,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(data),
      crossDomain: true
    });
  }

  function preview(viewId) {
    var payload = scrape(viewId);
    if (!payload.rows.length) {
      alert('No survey worksheet data found on this page.');
      return null;
    }
    var htmlStr = buildHtml(payload);
    openPreview(htmlStr);
    return { payload: payload, html: htmlStr };
  }

  function sendToWebhook(viewId) {
    var payload = scrape(viewId);
    if (!payload.rows.length) return null;
    var htmlStr = buildHtml(payload);
    var wire = {
      viewId: payload.viewId,
      title: payload.title,
      html: htmlStr,
      rowCount: payload.rows.length
    };
    postToWebhook(wire);
    return wire;
  }

  // ══════════════════════════════════════════════════════════════
  // FORM SUBMIT TRIGGER
  // ══════════════════════════════════════════════════════════════
  // When the "Update SITE SURVEY_request" form (view_3809) is submitted,
  // scrape view_3800, build the HTML, and POST the payload to the
  // Make.com webhook. The form's native submit proceeds in parallel;
  // the webhook call is fire-and-forget.

  function handleFormSubmit() {
    var payload = scrape(DEFAULT_VIEW_ID);
    if (!payload.rows.length) {
      console.log('[SCW survey-pdf] view_3800 produced no rows — skipping webhook');
      return;
    }
    var htmlStr = buildHtml(payload);

    // Pull the record ID out of the form's hidden input
    var recordId = '';
    var idInput = document.querySelector('#' + FORM_VIEW_ID + ' input[name="id"]');
    if (idInput) recordId = idInput.value || '';

    var wire = {
      viewId: payload.viewId,
      formViewId: FORM_VIEW_ID,
      recordId: recordId,
      title: payload.title,
      rowCount: payload.rows.length,
      html: htmlStr
    };

    console.log('[SCW survey-pdf] posting to webhook', {
      recordId: recordId,
      rowCount: wire.rowCount
    });
    postToWebhook(wire);
  }

  function setupFormSubmitTrigger() {
    if (typeof $ === 'undefined') return;
    var ns = '.scwSurveyPdf';

    $(document).on('knack-view-render.' + FORM_VIEW_ID, function () {
      var $form = $('#' + FORM_VIEW_ID + ' form');
      if (!$form.length) return;
      $form.off('submit' + ns).on('submit' + ns, function () {
        try {
          handleFormSubmit();
        } catch (e) {
          console.warn('[SCW survey-pdf] submit handler failed', e);
        }
      });
    });
  }

  setupFormSubmitTrigger();

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════

  window.SCW = window.SCW || {};
  window.SCW.surveyWorksheetPdf = {
    scrape: scrape,
    buildHtml: buildHtml,
    preview: preview,
    generate: preview,
    sendToWebhook: sendToWebhook
  };
})();
