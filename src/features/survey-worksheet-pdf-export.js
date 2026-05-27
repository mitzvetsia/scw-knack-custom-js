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

  var DEFAULT_VIEW_ID        = 'view_3800';
  var WEBHOOK_URL            = 'https://hook.us1.make.com/u7x7hxladwuk6sgk4gzcqvwqgm3vpeza';
  var FORM_VIEW_ID           = 'view_3809'; // "Update SITE SURVEY_request" — submit = trigger

  // Detail views that contribute to the page-1 info cover (rendered
  // before any image covers or worksheet items). Each entry is
  // { viewId, label? } — if `label` is set it replaces the view's
  // own header as the section title.
  var PAGE1_DETAIL_VIEWS = [
    { viewId: 'view_3796' },
    { viewId: 'view_3795' },
    { viewId: 'view_3798', label: 'Survey Contact(s)' }
  ];

  // Label substrings used to pick the client and site names out of
  // the page-1 detail-view fields when building the doc title.
  // Matching is case-insensitive substring; first match wins.
  var TITLE_CLIENT_LABEL_HINTS = ['client', 'customer', 'company', 'account'];
  var TITLE_SITE_LABEL_HINTS   = ['site name', 'location name', 'site', 'location', 'property', 'project name', 'project'];
  var SURVEY_ID_FIELD          = 'field_2345';

  // Worksheet bucket field on the survey line item object (view_3800).
  // The bucket record ID matches the SOW bid-item schema (same bucket
  // table), but the field key is different from the form-side
  // field_2223 — on the worksheet it lives under field_2366.
  // view_3505 (SOW line items) uses field_2219 instead, so both keys
  // are tried when classifying a row.
  var BUCKET_FIELD             = 'field_2366';
  var BUCKET_FIELD_FALLBACKS   = ['field_2366', 'field_2219'];
  var CAMERAS_READERS_BUCKET   = '6481e5ba38f283002898113c';
  var OTHER_EQUIPMENT_BUCKET   = '5df12ce036f91b0015404d78';

  // Summary fields that the on-screen worksheet renders but the survey
  // PDF must NOT surface — typically pricing/labor data the tech in
  // the field shouldn't see. Keyed by Knack field id; the scraper
  // skips any .scw-ws-sum-group whose payload td matches.
  // field_2400 = Labor price (directEdit number on view_3505)
  // field_2401 = Ext (qty × labor, readOnly on view_3505)
  // field_2415 = BID reference (e.g. "BD-1") — internal sales linkage
  //              that has no bearing on the field tech's work.
  // field_2627 = Product connection on view_3505 — hidden by bucket
  //              rules on service/assumption rows but the DOM cell
  //              persists, so explicitly skip in the summary scrape.
  // field_2187 = legacy bucket connection that surfaces on some
  //              worksheet views and is meaningless to the tech.
  var EXCLUDED_SUMMARY_FIELDS = {
    field_2400: 1,
    field_2401: 1,
    field_2415: 1,
    field_2627: 1,
    field_2187: 1
  };

  // Distribution-device flag on a survey line item. Cards/records
  // with this field truthy become columns in the connection-map pivot.
  var DISTRIBUTION_DEVICE_FIELD = 'field_2374';

  // Pivot padding targets — the connection map lives on its own page
  // and we want it to feel like a full worksheet: blank checkbox
  // columns and blank rows are padded in to fill remaining space.
  var TARGET_PIVOT_COLS = 22;
  var TARGET_PIVOT_ROWS = 28;

  // Views whose image attachments render as full-page covers
  // BEFORE the survey worksheet items. Each image is labeled with
  // the section label (regardless of Knack field values).
  var COVER_IMAGE_VIEWS = [
    { viewId: 'view_3808', label: 'Site Map(s)' }
  ];

  // Views whose image attachments render at the BOTTOM of the PDF
  // under a section header.
  var TRAILING_IMAGE_VIEWS = [
    { viewId: 'view_3805', label: 'Additional Photos' }
  ];

  // ── shared helpers ───────────────────────────────────────────────

  function norm(s) {
    return String(s == null ? '' : s).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Like norm, but preserves newlines. Collapses only runs of spaces
  // and tabs within each line so multi-line detail values (e.g. an
  // "Additional Instructions" blob) keep their line breaks.
  function normMultiline(s) {
    var str = String(s == null ? '' : s).replace(/\u00A0/g, ' ');
    var lines = str.split(/\r?\n/);
    var cleaned = [];
    var blankRun = false;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].replace(/[ \t]+/g, ' ').trim();
      if (!ln) {
        if (blankRun) continue;
        blankRun = true;
      } else {
        blankRun = false;
      }
      cleaned.push(ln);
    }
    while (cleaned.length && !cleaned[0]) cleaned.shift();
    while (cleaned.length && !cleaned[cleaned.length - 1]) cleaned.pop();
    return cleaned.join('\n');
  }

  // Walks an element and returns its text with <br>/block-tag breaks
  // converted to \n, so downstream normMultiline can keep real line
  // boundaries that textContent would otherwise collapse.
  function multilineTextOf(el) {
    if (!el) return '';
    var html = el.innerHTML || '';
    html = html.replace(/<br\s*\/?>/gi, '\n');
    html = html.replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return normMultiline(tmp.textContent || '');
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

  // Return the first truthy value from `map` matched by any key in
  // `keys` (in order). Used so a render spec can list multiple known
  // field keys (different worksheet views use different schemas) and
  // pick whichever one this card happens to have populated.
  // True when a scraped string carries actual content. Filters out
  // both the literal HTML entity "&nbsp;" (when the scraper read
  // innerHTML without decoding) and the rendered U+00A0 character
  // (when it read textContent), plus all-whitespace strings — any
  // of which Knack sometimes leaves in optional fields and which we
  // don't want surfacing as visible labor-description blocks on the
  // PDF.
  function hasMeaningfulText(s) {
    if (s == null) return false;
    var stripped = String(s)
      .replace(/&nbsp;/gi, '')
      .replace(/[ \s]/g, '');
    return stripped.length > 0;
  }

  function firstKeyValue(map, keys) {
    if (!map || !keys) return '';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k && map[k]) return map[k];
    }
    return '';
  }

  // Group rows like "Project Wide Assumptions8" have the L1 record
  // count baked into the cell text via a `.scw-group-badges /
  // .scw-record-count` span. Clone, strip those spans, then read
  // textContent so the count doesn't end up concatenated onto the
  // label.
  function scrapeGroupLabel(tr) {
    var td = tr && tr.querySelector('td');
    if (!td) return '';
    var clone = td.cloneNode(true);
    var dropSel = '.scw-group-badges, .scw-record-count, ' +
                  '.scw-collapse-icon, .scw-sa-grp-check, ' +
                  '.scw-group-inner > svg';
    var drops = clone.querySelectorAll(dropSel);
    for (var i = 0; i < drops.length; i++) {
      drops[i].parentNode && drops[i].parentNode.removeChild(drops[i]);
    }
    return norm(clone.textContent || '');
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

  // ── Image downsampling ───────────────────────────────────────────
  //
  // Given an already-loaded <img> element, draw it to a canvas at a
  // reduced max-dimension and return a JPEG data URL. Falls back to
  // the original src when the canvas taints (cross-origin without
  // CORS headers) or the image isn't fully loaded yet.
  var _dsWarned = false;

  function downsampleImage(imgEl, maxDim, quality) {
    if (!imgEl) return '';
    var fallback = imgEl.getAttribute('src') || '';
    try {
      if (!imgEl.complete || !imgEl.naturalWidth) return fallback;
      var w = imgEl.naturalWidth;
      var h = imgEl.naturalHeight;
      var scale = Math.min(1, maxDim / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(imgEl, 0, 0, cw, ch);
      // toDataURL throws SecurityError if the canvas is tainted.
      return canvas.toDataURL('image/jpeg', quality);
    } catch (e) {
      if (!_dsWarned) {
        console.warn('[SCW survey-pdf] photo downsample failed (likely cross-origin canvas taint); falling back to original URLs', e);
        _dsWarned = true;
      }
      return fallback;
    }
  }

  // Auto-crop whitespace borders around an image before downsampling.
  // Walks rows/columns from each edge, treats pixels with all three
  // RGB channels >= threshold as "white", and stops at the first row
  // / column containing real content. A small content-relative pad is
  // kept on each side so the cropped image doesn't visually clip to
  // the bounding box.
  //
  // Used for site maps (typical screenshots have huge white margins)
  // — for device photos the trip through getImageData isn't worth it
  // and downsampleImage stays the default path.
  //
  // Returns a JPEG data URL, or the fallback URL if the canvas is
  // tainted by cross-origin pixels.
  function autoCropAndDownsample(imgEl, maxDim, quality, threshold) {
    if (!imgEl) return '';
    var fallback = imgEl.getAttribute('src') || '';
    threshold = threshold == null ? 245 : threshold;
    try {
      if (!imgEl.complete || !imgEl.naturalWidth) return fallback;
      var w = imgEl.naturalWidth;
      var h = imgEl.naturalHeight;
      var work = document.createElement('canvas');
      work.width = w; work.height = h;
      var wctx = work.getContext('2d');
      wctx.drawImage(imgEl, 0, 0);

      var imgData;
      try {
        imgData = wctx.getImageData(0, 0, w, h);
      } catch (taintErr) {
        // Tainted canvas — fall back to plain downsample (which will
        // also return the URL fallback if it can't touch pixels).
        return downsampleImage(imgEl, maxDim, quality);
      }
      var data = imgData.data;

      function isWhitePixel(x, y) {
        var i = (y * w + x) * 4;
        return data[i] >= threshold &&
               data[i + 1] >= threshold &&
               data[i + 2] >= threshold;
      }
      function rowIsWhite(y) {
        for (var x = 0; x < w; x++) if (!isWhitePixel(x, y)) return false;
        return true;
      }
      function colIsWhite(x, top, bottom) {
        for (var y = top; y <= bottom; y++) if (!isWhitePixel(x, y)) return false;
        return true;
      }

      var top = 0, bottom = h - 1, left = 0, right = w - 1;
      while (top < bottom && rowIsWhite(top))    top++;
      while (bottom > top && rowIsWhite(bottom)) bottom--;
      while (left < right && colIsWhite(left, top, bottom))   left++;
      while (right > left && colIsWhite(right, top, bottom))  right--;

      // Degenerate: image was entirely white. Signal "skip" so the
      // caller drops this cover entry rather than emitting a blank
      // landscape page (which is what happens if we fall back to a
      // plain downsample of all-white pixels).
      if (top >= bottom || left >= right) {
        return '__SCW_SKIP_IMAGE__';
      }

      // Tiny relative pad so cropped content doesn't kiss the edges.
      var sw = right - left + 1;
      var sh = bottom - top + 1;
      var pad = Math.max(4, Math.round(Math.min(sw, sh) * 0.01));
      top    = Math.max(0,     top    - pad);
      bottom = Math.min(h - 1, bottom + pad);
      left   = Math.max(0,     left   - pad);
      right  = Math.min(w - 1, right  + pad);
      sw = right - left + 1;
      sh = bottom - top + 1;

      var scale = Math.min(1, maxDim / Math.max(sw, sh));
      var dw = Math.max(1, Math.round(sw * scale));
      var dh = Math.max(1, Math.round(sh * scale));
      var out = document.createElement('canvas');
      out.width = dw; out.height = dh;
      out.getContext('2d').drawImage(work, left, top, sw, sh, 0, 0, dw, dh);
      return out.toDataURL('image/jpeg', quality);
    } catch (e) {
      if (!_dsWarned) {
        console.warn('[SCW survey-pdf] cover image auto-crop failed', e);
        _dsWarned = true;
      }
      return fallback;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Knack model helpers — pull raw record data by ID
  // ══════════════════════════════════════════════════════════════

  // Grab the 24-char Mongo-style record ID out of a <tr id="…">.
  function recordIdFromTr(tr) {
    if (!tr || !tr.id) return '';
    var m = tr.id.match(/[0-9a-f]{24}/i);
    return m ? m[0] : '';
  }

  // Build a { recordId: attributes } map from a view's Knack model.
  function buildRecordMap(viewId) {
    var map = {};
    try {
      var view = window.Knack && Knack.views && Knack.views[viewId];
      if (!view || !view.model) return map;
      var m = view.model;
      var records = [];
      if (m.models && m.models.length) records = m.models;
      else if (m.data && m.data.models && m.data.models.length) records = m.data.models;
      else if (Array.isArray(m.data)) records = m.data;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var attrs = rec && (rec.attributes || rec);
        if (!attrs) continue;
        var id = rec.id || attrs.id || '';
        if (id) map[id] = attrs;
      }
    } catch (e) {
      console.warn('[SCW survey-pdf] buildRecordMap failed for ' + viewId, e);
    }
    return map;
  }

  // Read a bucket ID out of a record's field_XXX_raw connection
  // value. Knack renders these as arrays of {id, identifier}.
  function bucketIdOf(record, fieldKey) {
    if (!record) return '';
    var raw = record[fieldKey + '_raw'];
    if (raw && raw.length) return raw[0].id || '';
    // Some views return a plain string ID.
    var plain = record[fieldKey];
    if (typeof plain === 'string' && /^[0-9a-f]{24}$/i.test(plain)) return plain;
    return '';
  }

  // Flexible yes/true detection that looks at both display value
  // and _raw form. Works for Knack "Yes/No", boolean, and enum fields.
  function isYesish(record, fieldKey) {
    if (!record) return false;
    var v = record[fieldKey];
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
      var s = v.toLowerCase().trim();
      if (s === 'yes' || s === 'true' || s === '1' || s === 'on') return true;
    }
    var raw = record[fieldKey + '_raw'];
    if (raw === true || raw === 1) return true;
    if (typeof raw === 'string') {
      var sr = raw.toLowerCase().trim();
      if (sr === 'yes' || sr === 'true' || sr === '1' || sr === 'on') return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPER
  // ══════════════════════════════════════════════════════════════

  function scrape(viewId) {
    viewId = viewId || DEFAULT_VIEW_ID;
    var root = document.getElementById(viewId);
    var emptyPayload = {
      viewId: viewId,
      title: '',
      surveyId: '',
      rows: [],
      page1Sections: [],
      coverImageSections: [],
      trailingImageSections: []
    };
    if (!root) return emptyPayload;

    var page1Sections         = scrapePage1Cover();
    var coverImageSections    = getImageSections(COVER_IMAGE_VIEWS);
    var trailingImageSections = getImageSections(TRAILING_IMAGE_VIEWS);

    // Main document title is now derived from the page-1 detail
    // views (client + site) rather than view_3800's own header.
    var title = buildSurveyTitle(page1Sections);
    var surveyId = getPage1FieldValue(SURVEY_ID_FIELD);

    // Scope to Knack's standard table class — `table tbody` was
    // ambiguous once mdf-summary-panel started injecting its own
    // `<table class="scw-mdf-summary-table">` above the worksheet
    // table inside .kn-table-wrapper. querySelector returns the first
    // match in DOM order, so the unspecific selector was grabbing the
    // summary's tbody (no scw-ws-row cards) and walking zero rows.
    var tbody = root.querySelector('table.kn-table-table tbody');
    if (!tbody) {
      return {
        viewId: viewId,
        title: title,
        surveyId: surveyId,
        rows: [],
        page1Sections: page1Sections,
        coverImageSections: coverImageSections,
        trailingImageSections: trailingImageSections
      };
    }

    var out = [];
    var kids = tbody.children;

    var currentL1 = '';
    var currentL2 = '';

    // Pull raw record attributes so the pivot / bucket logic can
    // read fields that aren't in the detail panel (bucket, field_2374).
    var recordMap = buildRecordMap(viewId);

    // Unconditional diagnostic — tells us whether device-worksheet
    // had finished transforming the view before scrape ran. If
    // wsRowCount is 0 but groupCount > 0, the export ran before
    // transformView created the .scw-ws-row card shells (most often
    // a timing/race issue or device-worksheet not bound on this
    // scene). The PDF will render only group headers + L1 notes.
    var _scrapeStats = {
      viewId: viewId,
      tbodyChildren: kids.length,
      groupCount: 0,
      wsRowCount: 0,
      knTableRowCount: 0,
      cardCount: 0
    };

    for (var i = 0; i < kids.length; i++) {
      var tr = kids[i];
      var trHidden = tr.style && tr.style.display === 'none';

      // ── group header rows ──
      if (tr.classList.contains('kn-table-group')) {
        if (trHidden) continue;   // empty / removed group headers
        _scrapeStats.groupCount++;
        var level = tr.classList.contains('kn-group-level-1') ? 1
                  : tr.classList.contains('kn-group-level-2') ? 2
                  : tr.classList.contains('kn-group-level-3') ? 3 : 1;
        var label = scrapeGroupLabel(tr);
        if (!label) continue;
        if (level === 1) { currentL1 = label; currentL2 = ''; }
        else if (level === 2) { currentL2 = label; }
        out.push({ type: 'group', level: level, label: label });
        continue;
      }

      // Track raw Knack data rows separately from transformed card
      // rows — gives a clear "transform ran" vs "transform didn't"
      // signal in the log.
      if (tr.tagName === 'TR' && tr.id) _scrapeStats.knTableRowCount++;

      // ── worksheet card rows ──
      // Do NOT skip rows hidden by group-collapse. The survey worksheet
      // collapses its synthetic groups (Project Wide Services /
      // Assumptions) by default, so those .scw-ws-row members are
      // display:none on screen — but the PDF must include every item
      // regardless of the on-screen accordion state. Knack's own
      // source/helper rows are excluded by the .scw-ws-row check below,
      // so they stay out even though they're also hidden.
      if (!tr.classList.contains('scw-ws-row')) continue;
      _scrapeStats.wsRowCount++;
      var card = tr.querySelector('.scw-ws-card');
      if (!card) continue;
      _scrapeStats.cardCount++;

      var rowObj = scrapeCard(card);
      if (rowObj) {
        rowObj.groupL1 = currentL1;
        rowObj.groupL2 = currentL2;
        rowObj.recordId = recordIdFromTr(tr);
        rowObj.raw = rowObj.recordId ? (recordMap[rowObj.recordId] || null) : null;
        // Capture the TR's classes so the renderer can detect bucket
        // type from DOM signals (scw-row--services, scw-row--assumptions)
        // when the Knack model's _raw bucket data isn't reliable —
        // device-worksheet stamps these row classes based on the
        // resolved bucket override, which is the source of truth on
        // the live worksheet.
        rowObj.rowClasses = tr.className || '';
        out.push(rowObj);
      }
    }

    console.log('[SCW survey-pdf] scrape', _scrapeStats);
    if (_scrapeStats.wsRowCount === 0 && _scrapeStats.knTableRowCount > 0) {
      console.warn('[SCW survey-pdf] scrape found raw Knack rows but NO ' +
        '.scw-ws-row cards — device-worksheet transform has not run on ' +
        viewId + ' on this scene. PDF will be missing device records.');
    }

    // After each L1 group header (MDF/IDF), insert a blank "Additional
    // Notes" block so the tech can jot down anything for that location
    // before the device cards start.
    out = insertL1NotesBlocks(out);

    // PDF ordering: Project Wide Assumptions block always lands at the
    // very end of the worksheet section, regardless of where the live
    // worksheet has it. Move the assumption L1 header + every row up
    // to the next L1 header (or end of list) to the tail.
    out = pushGroupToEnd(out, 'Project Wide Assumptions');

    return {
      viewId: viewId,
      title: title,
      surveyId: surveyId,
      rows: out,
      page1Sections: page1Sections,
      coverImageSections: coverImageSections,
      trailingImageSections: trailingImageSections
    };
  }

  // Slice out one L1 group's run (its group header + every following
  // non-L1 row up to the next L1 header) and append it to the end of
  // the row list. Used to keep Project Wide Assumptions at the very
  // bottom of the PDF regardless of where the live worksheet sorts it.
  function pushGroupToEnd(rows, groupLabel) {
    var startIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].type === 'group' && rows[i].level === 1 &&
          rows[i].label === groupLabel) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) return rows;
    var endIdx = rows.length;
    for (var j = startIdx + 1; j < rows.length; j++) {
      if (rows[j].type === 'group' && rows[j].level === 1) {
        endIdx = j;
        break;
      }
    }
    var slice = rows.slice(startIdx, endIdx);
    var head  = rows.slice(0, startIdx);
    var tail  = rows.slice(endIdx);
    return head.concat(tail).concat(slice);
  }

  // Walks the row list and inserts one notes block at the START of
  // each L1 group (right after the L1 header). Techs use this to jot
  // MDF/IDF-level observations BEFORE diving into individual device
  // cards in that group. Previously this block lived at the tail of
  // each L1 group, but a header-position block reads more naturally
  // — group context first, then the items inside it.
  function insertL1NotesBlocks(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push(r);
      // Project Wide Assumptions is reference text, not a fill-in
      // section — skip its blank writing-line block so it stays compact.
      if (r.type === 'group' && r.level === 1 &&
          !/project wide assumptions/i.test(r.label || '')) {
        out.push({ type: 'l1-notes', position: 'header', groupL1: r.label });
      }
    }
    return out;
  }

  // ══════════════════════════════════════════════════════════════
  // IMAGE SECTION PRELOAD
  // ══════════════════════════════════════════════════════════════
  //
  // Any Knack view that holds file attachments can contribute image
  // pages to the PDF — either as full-page covers (view_3808) or as
  // a photo strip at the bottom (view_3805).
  //
  // For each such view we walk Knack.views[viewId].model.data.models,
  // find every field_XX_raw file descriptor, filter to images, then
  // preload each raw CDN URL via new Image() and downsample the
  // result to a JPEG data URL. The preload runs on every render of
  // the source view so the cache is hot by the time the form is
  // submitted. If an image hasn't finished downsampling yet, its
  // entry still contains the raw URL as a usable fallback.

  // imageCache[viewId] = [{ assetId, src, filename, label, alt, loaded }]
  var imageCache = {};

  function isImageFile(file) {
    if (!file) return false;
    var name = String(file.filename || '').toLowerCase();
    var type = String(file.type || '').toLowerCase();
    if (type && type.indexOf('image/') === 0) return true;
    return /\.(png|jpe?g|gif|webp|bmp)$/.test(name);
  }

  function extractViewRecords(view) {
    if (!view || !view.model || !view.model.data) return [];
    var data = view.model.data;
    if (Array.isArray(data)) return data.map(function (m) {
      return typeof m.toJSON === 'function' ? m.toJSON() : (m.attributes || m);
    });
    if (data.models && Array.isArray(data.models)) {
      return data.models.map(function (m) {
        return typeof m.toJSON === 'function' ? m.toJSON() : (m.attributes || m);
      });
    }
    return [];
  }

  // Walks a record's field_XXX_raw attributes and returns any file
  // descriptor objects ({filename, url, public_url, type, id}).
  function extractFilesFromRecord(record) {
    var files = [];
    if (!record) return files;
    for (var key in record) {
      if (!record.hasOwnProperty(key)) continue;
      if (!/^field_\d+_raw$/.test(key)) continue;
      var val = record[key];
      if (!val) continue;
      if (Array.isArray(val)) {
        for (var i = 0; i < val.length; i++) {
          var v = val[i];
          if (v && v.filename && (v.url || v.public_url)) files.push(v);
        }
      } else if (val.filename && (val.url || val.public_url)) {
        files.push(val);
      }
    }
    return files;
  }

  // Preload a URL into an <img>, downsample on load, call cb with the
  // data URL (or the original URL if loading/canvas fails). When
  // autoCrop is true the image is walked edge-in to strip whitespace
  // borders (used for site maps where the source screenshot has huge
  // white margins).
  function preloadAndDownsample(url, maxDim, quality, autoCrop, cb) {
    // Back-compat: old (url, maxDim, quality, cb) signature.
    if (typeof autoCrop === 'function' && cb == null) {
      cb = autoCrop;
      autoCrop = false;
    }
    if (!url) { cb(''); return; }
    var img = new Image();
    var done = false;
    function finish(result) {
      if (done) return;
      done = true;
      cb(result);
    }
    img.onload = function () {
      try {
        var ds = autoCrop
          ? autoCropAndDownsample(img, maxDim, quality)
          : downsampleImage(img, maxDim, quality);
        if (ds === '__SCW_SKIP_IMAGE__') { finish(null); return; }
        finish(ds || url);
      } catch (e) {
        finish(url);
      }
    };
    img.onerror = function () { finish(url); };
    // Attempt CORS-enabled fetch so the canvas stays clean; the
    // downsampleImage fallback handles taint gracefully either way.
    try { img.crossOrigin = 'anonymous'; } catch (e) {}
    img.src = url;
  }

  function refreshImageCacheForView(viewId, sectionLabel, maxDim, quality, autoCrop) {
    try {
      var view = window.Knack && Knack.views && Knack.views[viewId];
      if (!view) { imageCache[viewId] = []; return; }
      var records = extractViewRecords(view);
      var nextCache = [];
      for (var r = 0; r < records.length; r++) {
        var rec = records[r];
        var files = extractFilesFromRecord(rec);
        for (var f = 0; f < files.length; f++) {
          var file = files[f];
          if (!isImageFile(file)) continue;
          var rawUrl = file.url || file.public_url || '';
          if (!rawUrl) continue;
          var entry = {
            assetId: file.id || rawUrl,
            src: rawUrl, // fallback until downsample completes
            filename: file.filename || '',
            label: sectionLabel || '',
            alt: sectionLabel || file.filename || 'Attachment',
            loaded: false
          };
          nextCache.push(entry);
          (function (e, u) {
            preloadAndDownsample(u, maxDim, quality, !!autoCrop, function (dataUrl) {
              if (dataUrl === null) {
                // All-white / degenerate crop — flag for skip so
                // getImagesForView filters this entry entirely.
                e.skip = true;
              } else if (dataUrl) {
                e.src = dataUrl;
              }
              e.loaded = true;
            });
          })(entry, rawUrl);
        }
      }
      imageCache[viewId] = nextCache;
      SCW.debug('[SCW survey-pdf] image cache primed for ' + viewId, {
        count: nextCache.length
      });
    } catch (e) {
      console.warn('[SCW survey-pdf] image preload failed for ' + viewId, e);
      imageCache[viewId] = [];
    }
  }

  function getImagesForView(viewId) {
    var entries = imageCache[viewId] || [];
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var c = entries[i];
      if (c.skip) continue;
      out.push({ src: c.src, label: c.label, alt: c.alt });
    }
    return out;
  }

  function getImageSections(viewConfigs) {
    var out = [];
    for (var i = 0; i < viewConfigs.length; i++) {
      var cfg = viewConfigs[i];
      var images = getImagesForView(cfg.viewId);
      if (!images.length) continue;
      out.push({ viewId: cfg.viewId, label: cfg.label, images: images });
    }
    return out;
  }

  function setupImagePreloads() {
    if (typeof $ === 'undefined') return;
    var all = COVER_IMAGE_VIEWS.concat(TRAILING_IMAGE_VIEWS);
    for (var i = 0; i < all.length; i++) {
      (function (cfg) {
        $(document).on('knack-view-render.' + cfg.viewId + '.scwSurveyPdf', function () {
          // Covers use a larger max-dim than trailing photos, and
          // auto-crop whitespace so site map screenshots fill the
          // page instead of getting margins on top of the page margins.
          var isCover = COVER_IMAGE_VIEWS.indexOf(cfg) !== -1;
          var maxDim   = isCover ? 1800 : 600;
          var quality  = isCover ? 0.82 : 0.65;
          var autoCrop = isCover;
          refreshImageCacheForView(cfg.viewId, cfg.label, maxDim, quality, autoCrop);
        });
      })(all[i]);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PAGE 1 INFO COVER — detail-view scrape
  // ══════════════════════════════════════════════════════════════
  // Reads every populated .kn-detail label/value pair from the named
  // views. Runs synchronously at form-submit time against the live
  // DOM (no preload required — detail views render their values
  // directly in the page).

  // Read a field value directly off one of the page-1 detail views'
  // Knack model. Used for fields we know by key (e.g. Survey ID)
  // where we don't want to depend on the label text.
  function getPage1FieldValue(fieldKey) {
    if (typeof Knack === 'undefined' || !Knack.views) return '';
    for (var i = 0; i < PAGE1_DETAIL_VIEWS.length; i++) {
      var viewId = PAGE1_DETAIL_VIEWS[i].viewId;
      var view = Knack.views[viewId];
      if (!view || !view.model) continue;
      var attrs = (view.model.attributes)
                || (view.model.data && view.model.data.attributes)
                || null;
      if (!attrs) continue;
      var raw = attrs[fieldKey + '_raw'];
      if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
        if (raw.identifier) return String(raw.identifier);
      }
      if (Array.isArray(raw) && raw.length) {
        if (raw[0] && raw[0].identifier) return String(raw[0].identifier);
      }
      var plain = attrs[fieldKey];
      if (plain != null && plain !== '') {
        // Strip HTML if Knack returned a formatted string.
        var tmp = document.createElement('div');
        tmp.innerHTML = String(plain);
        var text = norm(tmp.textContent || '');
        if (text) return text;
      }
    }
    return '';
  }

  function scrapeDetailViewFields(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;
    var title = '';
    var h2 = root.querySelector('.view-header h2, .view-header h1');
    if (h2) title = textOf(h2);

    var fields = [];
    var items = root.querySelectorAll('.kn-detail');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.id === viewId) continue;
      var labelEl = item.querySelector('.kn-detail-label');
      var valueEl = item.querySelector('.kn-detail-body');
      if (!valueEl) continue;
      // Preserve line breaks for long-text fields like "Additional
      // Instructions" by walking <br>/block tags into \n.
      var value = multilineTextOf(valueEl);
      if (!value || value === '-' || value === '—') continue;
      var label = '';
      if (labelEl && !item.classList.contains('kn-label-none')) {
        label = norm(labelEl.textContent || '');
      }
      fields.push({ label: label, value: value });
    }
    if (!fields.length && !title) return null;
    return { viewId: viewId, title: title, fields: fields };
  }

  function scrapePage1Cover() {
    var sections = [];
    var seenValues = {};
    for (var i = 0; i < PAGE1_DETAIL_VIEWS.length; i++) {
      var cfg = PAGE1_DETAIL_VIEWS[i];
      var sec = scrapeDetailViewFields(cfg.viewId);
      if (!sec) continue;
      // Label override (e.g. view_3798 → "Survey Contact(s)")
      if (cfg.label) sec.title = cfg.label;
      // Dedupe across sections by normalized value — the same address
      // can show up in multiple detail views, and we only want it
      // printed once on the info cover.
      var uniqueFields = [];
      for (var f = 0; f < sec.fields.length; f++) {
        var fld = sec.fields[f];
        var key = norm(fld.value).toLowerCase();
        if (!key) continue;
        if (seenValues[key]) continue;
        seenValues[key] = true;
        uniqueFields.push(fld);
      }
      if (!uniqueFields.length) continue;
      sec.fields = uniqueFields;
      sections.push(sec);
    }
    return sections;
  }

  // ── Title builder ──────────────────────────────────────────────
  // Build a "Survey: {client} — {site}" string from the detail-view
  // sections on the page-1 cover. Falls back to a shorter variant
  // when only one of client/site can be found.

  function findFieldByLabelHints(sections, hints) {
    var hintsLower = hints.map(function (h) { return h.toLowerCase(); });
    for (var s = 0; s < sections.length; s++) {
      var flds = sections[s].fields || [];
      for (var f = 0; f < flds.length; f++) {
        var lbl = norm(flds[f].label || '').toLowerCase();
        if (!lbl) continue;
        for (var h = 0; h < hintsLower.length; h++) {
          if (lbl.indexOf(hintsLower[h]) !== -1) {
            return norm(flds[f].value || '');
          }
        }
      }
    }
    return '';
  }

  function buildSurveyTitle(sections) {
    var client = findFieldByLabelHints(sections, TITLE_CLIENT_LABEL_HINTS);
    var site   = findFieldByLabelHints(sections, TITLE_SITE_LABEL_HINTS);
    var parts = [];
    if (client) parts.push(client);
    if (site && site !== client) parts.push(site);
    if (!parts.length) return 'Survey';
    return 'Survey: ' + parts.join(' — ');
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

    // Hoisted so the summary scrape below can promote chit-host
    // values directly into the detail map (used by the flags band).
    // The detail panel walk later will add to these.
    var detailValues = {};
    var detailHasAnyField = false;
    // Labor / SCW Notes on view_3505 live in the SUMMARY bar (not
    // the detail panel). Promote them out of summaryFields so the
    // 3-column body's col-2 / col-3 renderers can pick them up.
    var laborText = '';
    var scwText   = '';
    var LABOR_KEYS = ['field_2409', 'field_2020'];
    var SCW_KEYS   = ['field_2418', 'field_1953'];

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
        // Skip blacklisted fields (e.g. labor pricing) regardless of value.
        var fieldKey = fieldTd.getAttribute('data-field-key') || '';
        if (fieldKey && EXCLUDED_SUMMARY_FIELDS[fieldKey]) continue;
        var val = cellValue(fieldTd);
        if (!val) continue;
        // On view_3505 the cabling/exterior/plenum chits live in the
        // summary bar, not the detail panel. Their group has an empty
        // .scw-ws-sum-label (just &nbsp;), so left alone they render
        // as bare "No / Yes / No" tokens in the card header. Promote
        // chit-host values into the detailValues map instead so the
        // flags band renders them properly with labels + checkboxes,
        // and suppress from the header summary.
        if (fieldTd.classList.contains('scw-ws-sum-chip-host')) {
          if (fieldKey) detailValues[fieldKey] = val;
          detailHasAnyField = true;
          continue;
        }
        // Labor Description / SCW Notes live in the summary bar on
        // view_3505 with an unhelpful label ("Labor Desc"). Promote
        // them to dedicated card fields so the 3-col body's
        // labor / scw cells render them instead of letting them
        // surface as labelled summary chips in the header.
        if (fieldKey && LABOR_KEYS.indexOf(fieldKey) !== -1) {
          if (val) laborText = val;
          continue;
        }
        if (fieldKey && SCW_KEYS.indexOf(fieldKey) !== -1) {
          if (val) scwText = val;
          continue;
        }
        var lbl = lblEl ? textOf(lblEl) : '';
        // Quantity is rendered on every card today even when it equals
        // 1, which is just visual noise. Hide qty <= 1, render >1 as
        // the small chip on the right of the header.
        var lblLower = lbl.toLowerCase();
        if (lblLower === 'qty' || lblLower === 'quantity') {
          var n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
          if (!isFinite(n) || n <= 1) continue;
        }
        // Assumption rows render with an "ASSUMPTION" label on the
        // body text. Strip that label so the body reads cleanly —
        // the L1 group header already says "Project Wide Assumptions"
        // so the per-row prefix is redundant.
        if (lblLower === 'assumption') lbl = '';
        summaryFields.push({ label: lbl, value: val });
      }
    }

    // ── Detail panel ─────────────────────────────────────────────
    // Collect every .scw-ws-field present in the detail panel, keyed
    // by its field_XXXX identifier. The PDF renderer uses a static
    // left/right layout (below) and looks up values from this map.
    // detailValues / detailHasAnyField are hoisted above the summary
    // loop so chit-host promotion can populate them.
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
    // Photos are already rendered in the DOM by inline-photo-row, so
    // their <img> elements are fully loaded. We draw each one onto a
    // canvas at a reduced max dimension and re-encode as JPEG before
    // handing off to the PDF — this shrinks Knack's 2–5 MB originals
    // to ~30–50 KB and dramatically speeds up PDF generation.
    var photos = [];
    var photoWrap = card.querySelector('.scw-ws-photo-wrap');
    if (photoWrap && !photoWrap.classList.contains('scw-ws-photo-hidden')) {
      var photoCards = photoWrap.querySelectorAll('.scw-inline-photo-card[data-photo-has-image="true"]');
      for (var p = 0; p < photoCards.length; p++) {
        var pc = photoCards[p];
        var img = pc.querySelector('img');
        if (!img) continue;
        var src = downsampleImage(img, 320, 0.55);
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
      laborText: laborText,
      scwText: scwText,
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

  // Three horizontal "bands" inside each card, in render order. Empty
  // bands collapse so service / assumption cards stay short.
  //   ref     — read-only reference info shown only when populated
  //   flags   — Y/N pairs inline (cabling / location / plenum)
  //   measure — height checkbox cluster + drop / conduit fillable
  var PDF_DETAIL_LAYOUT = {
    // Reference items shown in the LEFT column under the [Label]
    // [Product] identity line. Only Mount lives here now — Labor
    // and SCW Notes both render in the right column.
    ref: [
      { key: 'field_2463', label: 'Mount' }
    ],
    // Rendered as the lead cell of col 2 (plain text, no label prefix).
    // Multiple keys cover both worksheet schemas:
    //   field_2409 — view_3800 (survey line items, in detail panel)
    //   field_2020 — view_3505 (SOW line items, in summary bar)
    labor: { keys: ['field_2409', 'field_2020'], label: 'Labor Description' },
    // SCW Notes — secondary col-2 block under labor.
    //   field_2418 — view_3800 / 3610 / 3596 (in detail panel)
    //   field_1953 — view_3505 (in detail panel under scwNotes)
    scwNotes: { keys: ['field_2418', 'field_1953'], label: 'SCW Notes' },
    flags: [
      // view_3800 (survey line items)
      { key: 'field_2370', label: 'Existing', yesLabel: 'Y', noLabel: 'N' },
      { key: 'field_2372', label: 'Exterior', yesLabel: 'Y', noLabel: 'N' },
      { key: 'field_2371', label: 'Plenum',   yesLabel: 'Y', noLabel: 'N' },
      // view_3505 (SOW line items — same flags, different keys)
      { key: 'field_2461', label: 'Existing', yesLabel: 'Y', noLabel: 'N' },
      { key: 'field_1984', label: 'Exterior', yesLabel: 'Y', noLabel: 'N' },
      { key: 'field_1983', label: 'Plenum',   yesLabel: 'Y', noLabel: 'N' },
      // DTO line items (added when bucket == Camera or Readers per
      // bucket-field-visibility config). renderFlagsRow only emits
      // rows whose key is actually populated in detailValues, so on
      // non-camera rows these stay invisible automatically.
      { key: 'field_2739', label: 'Exterior', yesLabel: 'Y', noLabel: 'N' },
      { key: 'field_2740', label: 'Plenum',   yesLabel: 'Y', noLabel: 'N' }
    ],
    measure: [
      { key: 'field_2455', label: 'Height',  kind: 'choices',
        options: ["<16'", "16-24'", ">24'"] },
      { key: 'field_2367', label: 'Drop',    kind: 'fill', unit: 'ft' },
      // Conduit Ft is always printed blank — the survey is the source
      // of truth for this measurement, not whatever's already on the
      // record.
      { key: 'field_2368', label: 'Conduit', kind: 'fill', unit: 'ft', forceBlank: true }
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
    html.push(getCss(payload));
    html.push('</style>');
    html.push('</head><body>');

    // ── Page 1: info cover (view_3796 + view_3795 + view_3798) ──
    if (payload.page1Sections && payload.page1Sections.length) {
      html.push(renderPage1Cover(payload));
    }

    // ── Cover image pages (e.g. Site Map(s) from view_3808) ──
    if (payload.coverImageSections && payload.coverImageSections.length) {
      for (var cs = 0; cs < payload.coverImageSections.length; cs++) {
        html.push(renderImageCoverSection(payload.coverImageSections[cs]));
      }
    }

    // Note: the doc-title used to print here as an <h1> before the
    // first worksheet row, but it's now redundant with the page-1
    // info cover's <h1>. The info cover is the title page.

    // Pre-fill legend — explains to the tech that the gray check
    // marks in each card's flags row aren't confirmed answers, just
    // SCW's best guess from existing record data. One-line at the
    // top of the worksheet section so it sits in the tech's eye on
    // first turn-of-page; not repeated per-card.
    html.push(
      '<div class="ws-prefill-legend">' +
        '<span class="ws-box ws-box--prefill">☒</span> ' +
        '<strong>Gray marks reflect file data — our best guess.</strong> ' +
        'If correct, ink over to confirm. If wrong, strike it out and mark the other box.' +
      '</div>'
    );

    for (var i = 0; i < payload.rows.length; i++) {
      var row = payload.rows[i];
      if (row.type === 'group') {
        html.push(renderGroupHeader(row));
      } else if (row.type === 'card') {
        html.push(renderCard(row));
      } else if (row.type === 'l1-notes') {
        html.push(renderL1Notes(row));
      }
    }

    // ── Connection Map pivot (cameras/readers × distribution devices) ──
    var pivotHtml = renderConnectionPivot(payload);
    if (pivotHtml) html.push(pivotHtml);

    // ── Trailing image sections (e.g. Additional Photos from view_3805) ──
    if (payload.trailingImageSections && payload.trailingImageSections.length) {
      for (var ts = 0; ts < payload.trailingImageSections.length; ts++) {
        html.push(renderTrailingImageSection(payload.trailingImageSections[ts]));
      }
    }

    html.push('</body></html>');
    return html.join('\n');
  }

  // ── Additional Notes block (inserted directly under each L1 group header) ──
  function renderL1Notes(row) {
    var h = [];
    var heading = (row && row.position === 'header') ? 'Notes' : 'Additional Notes';
    h.push('<section class="ws-card ws-card--notes">');
    h.push('<div class="ws-notes-heading">' + heading);
    if (row && row.groupL1) {
      h.push(' <span class="ws-notes-scope">\u2014 ' + esc(row.groupL1) + '</span>');
    }
    h.push('</div>');
    h.push('<div class="ws-notes-lines ws-notes-lines--l1">');
    for (var i = 0; i < 2; i++) {
      h.push('<div class="ws-notes-line"></div>');
    }
    h.push('</div>');
    h.push('</section>');
    return h.join('');
  }

  // ══════════════════════════════════════════════════════════════
  // CONNECTION MAP — pivot table
  // ══════════════════════════════════════════════════════════════
  //
  //   Rows    = every line item whose bucket (field_2223) is the
  //             "Cameras or Readers" bucket.
  //   Columns = every line item where field_2374 is YES (a product
  //             flagged as a distribution device).
  //   Cells   = empty checkbox for the tech to mark the connection.
  //
  // All classification reads the raw Knack record attributes that
  // we attached to each card during scrape(). The detail panel
  // doesn't render the bucket or field_2374, so detailValues is
  // not a reliable source.

  // Generic bucket-ID match across the survey + SOW worksheet keys.
  function bucketMatches(card, bucketId, regex) {
    if (!card || !card.raw) return false;
    for (var i = 0; i < BUCKET_FIELD_FALLBACKS.length; i++) {
      var fk = BUCKET_FIELD_FALLBACKS[i];
      var bid = bucketIdOf(card.raw, fk);
      if (bid && bid === bucketId) return true;
      var disp = card.raw[fk];
      if (regex && typeof disp === 'string' && regex.test(disp)) return true;
    }
    return false;
  }

  function isCamerasReadersBucket(card) {
    return bucketMatches(card, CAMERAS_READERS_BUCKET, /camera|reader/i);
  }

  function isOtherEquipmentBucket(card) {
    return bucketMatches(card, OTHER_EQUIPMENT_BUCKET, /other.*equipment/i);
  }

  // Services and Assumptions are the two buckets where the labor-
  // description field IS the actual content (service description /
  // assumption text), not a sales artifact. These render with an
  // explicit labor body line REGARDLESS of brief vs. detailed
  // classification — without this gate they'd inherit the
  // cam/reader / networking / headend rule of "drop labor".
  var SERVICES_BUCKET    = '6977caa7f246edf67b52cbcd';
  var ASSUMPTIONS_BUCKET = '697b7a023a31502ec68b3303';
  function isServiceOrAssumptionBucket(card) {
    // First: the device-worksheet TR class. Most reliable signal —
    // applied based on the live bucket override, doesn't depend on
    // the Knack model being primed.
    if (card && card.rowClasses &&
        /\bscw-row--(services|assumptions)\b/.test(card.rowClasses)) {
      return true;
    }
    return bucketMatches(card, SERVICES_BUCKET,    /service/i) ||
           bucketMatches(card, ASSUMPTIONS_BUCKET, /assumption/i);
  }

  // Networking / Headend / Other Equipment cards have short identity
  // info (no drop label like E-001) and longer labor-description text.
  // The default cam/reader 3-col layout wastes space on the empty
  // identity column. Stack product-on-top, labor-description-below in
  // a single combined column instead, and let the SCW-notes column
  // claim the freed width.
  function useStackedProductLabor(card) {
    return isOtherEquipmentBucket(card) ||
           bucketMatches(card, null, /network|headend/i);
  }

  function isDistributionDevice(card) {
    if (!card || !card.raw) return false;
    return isYesish(card.raw, DISTRIBUTION_DEVICE_FIELD);
  }

  function renderConnectionPivot(payload) {
    var cols = [];
    var rows = [];
    for (var i = 0; i < payload.rows.length; i++) {
      var r = payload.rows[i];
      if (!r || r.type !== 'card') continue;
      if (isDistributionDevice(r)) cols.push(r);
      if (isCamerasReadersBucket(r)) rows.push(r);
    }
    if (!rows.length) {
      SCW.debug('[SCW survey-pdf] connection pivot: skipped (no camera/reader rows)');
      return '';
    }

    var blankColCount = Math.max(0, TARGET_PIVOT_COLS - cols.length);
    var blankRowCount = Math.max(0, TARGET_PIVOT_ROWS - rows.length);
    var totalCols = cols.length + blankColCount;

    var h = [];
    h.push('<section class="pivot">');
    h.push('<h2 class="pivot-title">Connection Map</h2>');
    h.push('<table class="pivot-table"><thead><tr>');
    h.push('<th class="pivot-corner pivot-corner--label">Label</th>');
    h.push('<th class="pivot-corner pivot-corner--product">Product</th>');
    for (var c = 0; c < cols.length; c++) {
      var col = cols[c];
      var colHead = col.product || col.label || '';
      h.push('<th class="pivot-col"><div class="pivot-col-text">' + esc(colHead) + '</div></th>');
    }
    for (var bc = 0; bc < blankColCount; bc++) {
      h.push('<th class="pivot-col pivot-col--blank"><div class="pivot-col-text">&nbsp;</div></th>');
    }
    h.push('</tr></thead><tbody>');
    for (var r2 = 0; r2 < rows.length; r2++) {
      var row = rows[r2];
      h.push('<tr>');
      h.push('<th class="pivot-row pivot-row--label" scope="row">' + esc(row.label || '') + '</th>');
      h.push('<td class="pivot-row pivot-row--product">' + esc(row.product || '') + '</td>');
      for (var c2 = 0; c2 < totalCols; c2++) {
        h.push('<td class="pivot-cell">\u2610</td>');
      }
      h.push('</tr>');
    }
    for (var br = 0; br < blankRowCount; br++) {
      h.push('<tr class="pivot-blank-row">');
      h.push('<th class="pivot-row pivot-row--label" scope="row">&nbsp;</th>');
      h.push('<td class="pivot-row pivot-row--product">&nbsp;</td>');
      for (var c3 = 0; c3 < totalCols; c3++) {
        h.push('<td class="pivot-cell">\u2610</td>');
      }
      h.push('</tr>');
    }
    h.push('</tbody></table>');
    h.push('</section>');
    return h.join('');
  }

  // ── Page 1 info cover renderer ──
  function renderPage1Cover(payload) {
    var h = [];
    h.push('<section class="info-cover">');
    if (payload.title) {
      h.push('<h1 class="info-cover-title">' + esc(payload.title) + '</h1>');
    } else {
      h.push('<h1 class="info-cover-title">Site Survey</h1>');
    }
    for (var i = 0; i < payload.page1Sections.length; i++) {
      var sec = payload.page1Sections[i];
      h.push('<div class="info-cover-section">');
      if (sec.title) {
        h.push('<h2 class="info-cover-section-title">' + esc(sec.title) + '</h2>');
      }
      h.push('<dl class="info-cover-fields">');
      for (var f = 0; f < sec.fields.length; f++) {
        var fld = sec.fields[f];
        // Long / multiline values span both columns so line breaks
        // have room to render without crushing sibling fields.
        var isWide = /\n/.test(fld.value) || fld.value.length > 80;
        var cls = 'info-cover-field' + (isWide ? ' info-cover-field--wide' : '');
        h.push('<div class="' + cls + '">');
        if (fld.label) {
          h.push('<dt>' + esc(fld.label) + '</dt>');
        }
        h.push('<dd>' + esc(fld.value) + '</dd>');
        h.push('</div>');
      }
      h.push('</dl>');
      h.push('</div>');
    }
    h.push('</section>');
    return h.join('');
  }

  // ── Cover image section renderer (one full-page image per entry) ──
  // The image element itself gets absolute-inch width/height so its
  // rendered box is deterministic regardless of intrinsic pixel size.
  // object-fit: contain then scales the bitmap to fit the box.
  // Percentage-based sizes on an <img> inside a print-flow block don't
  // reliably resolve in Chrome's print engine — absolute units do.
  function renderImageCoverSection(section) {
    var h = [];
    var label = section.label || '';
    // Inline style + width attribute on the <img> are harder for the
    // PDF renderer to override than a stylesheet rule. Some PDF
    // services wrap injected html inside a constraining container or
    // strip class-level CSS, leaving the image at its intrinsic size.
    //
    // Previous version used `width:100%; height:auto` which let a
    // portrait-aspect map overflow the landscape page — content
    // spilled onto a second mostly-blank page, and combined with the
    // section's page-break-after: always, that produced a blank page
    // between consecutive maps. Constrain BOTH dimensions and use
    // object-fit so the image always fits one page regardless of
    // source aspect ratio.
    // Portrait Letter useful area ~8.1in × 10.4in (minus margins +
    // page footer). Subtract ~0.4in for the label + spacing on top.
    // 8.5in keeps total section height ≈ 9in — comfortably under the
    // 10in usable page area so the renderer never has to split.
    var imgStyle = 'display:block; margin:0 auto; ' +
                   'max-width:100%; max-height:8.5in; ' +
                   'width:auto; height:auto; object-fit:contain;';
    for (var i = 0; i < section.images.length; i++) {
      var img = section.images[i];
      h.push('<section class="cover-page">');
      if (label) {
        h.push('<div class="cover-section-label">' + esc(label) + '</div>');
      }
      h.push('<img class="cover-img" ' +
             'style="' + imgStyle + '" ' +
             'src="' + esc(img.src) + '" ' +
             'alt="' + esc(img.alt || label) + '" />');
      h.push('</section>');
    }
    return h.join('');
  }

  // ── Trailing image section renderer (compact grid at end) ──
  function renderTrailingImageSection(section) {
    var h = [];
    h.push('<section class="trailing-photos">');
    h.push('<h2 class="trailing-photos-title">' + esc(section.label || '') + '</h2>');
    h.push('<div class="trailing-photos-grid">');
    for (var i = 0; i < section.images.length; i++) {
      var img = section.images[i];
      h.push('<figure class="trailing-photo">');
      h.push('<img src="' + esc(img.src) + '" alt="' + esc(img.alt || '') + '" />');
      h.push('</figure>');
    }
    h.push('</div>');
    h.push('</section>');
    return h.join('');
  }

  function renderGroupHeader(row) {
    var cls = 'group-header group-level-' + (row.level || 1);
    return '<div class="' + cls + '">' + esc(row.label) + '</div>';
  }

  // ── Reference band ──
  // Compact read-only info — labor description, mounting hardware,
  // SCW notes from the original proposal. Each item is single-line;
  // items with no value are omitted. Iterates PDF_DETAIL_LAYOUT.ref
  // so the field set is configurable without touching the renderer.
  function renderRefSection(card) {
    var specs = PDF_DETAIL_LAYOUT.ref || [];
    var items = [];
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      if (!(s.key in card.detailValues)) continue;
      var v = card.detailValues[s.key] || '';
      if (!v) continue;
      items.push(
        '<div class="ws-ref-item">' +
          '<span class="ws-ref-label">' + esc(s.label) + '</span>' +
          '<span class="ws-ref-value">' + esc(v) + '</span>' +
        '</div>'
      );
    }
    if (!items.length) return '';
    return '<div class="ws-ref">' + items.join('') + '</div>';
  }

  // ── Yes/No flag band ──
  // Single horizontal row of Yes/No pairs. Existing saved values are
  // pre-checked so the tech sees what was already answered and can
  // override on paper if needed.
  function renderFlagsRow(card) {
    var specs = PDF_DETAIL_LAYOUT.flags || [];
    var items = [];
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      if (!(s.key in card.detailValues)) continue;
      var v = String(card.detailValues[s.key] || '').toLowerCase();
      var yesOn = v === 'yes' || v === 'true';
      var noOn  = v === 'no'  || v === 'false';
      items.push(
        '<div class="ws-flag">' +
          '<span class="ws-flag-label">' + esc(s.label) + '</span>' +
          '<span class="ws-box' + (yesOn ? ' is-on' : '') + '">' + (yesOn ? '☒' : '☐') + '</span>' +
          '<span class="ws-flag-opt">' + esc(s.yesLabel || 'Yes') + '</span>' +
          '<span class="ws-box' + (noOn ? ' is-on' : '') + '">' + (noOn ? '☒' : '☐') + '</span>' +
          '<span class="ws-flag-opt">' + esc(s.noLabel || 'No') + '</span>' +
        '</div>'
      );
    }
    if (!items.length) return '';
    return '<div class="ws-flags">' + items.join('') + '</div>';
  }

  // ── Measurement band ──
  // Mounting Height (multi-checkbox), Drop Length (fillable),
  // Conduit Ft (fillable, always blank — survey is the source of
  // truth). All inline on one row.
  function renderMeasureRow(card) {
    var specs = PDF_DETAIL_LAYOUT.measure || [];
    var items = [];
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      if (!(s.key in card.detailValues)) continue;
      var item = ['<div class="ws-m-item">',
                  '<span class="ws-m-label">' + esc(s.label) + '</span>'];
      if (s.kind === 'choices') {
        var opts = s.options || [];
        for (var oi = 0; oi < opts.length; oi++) {
          item.push('<span class="ws-box">☐</span>');
          item.push('<span class="ws-flag-opt">' + esc(opts[oi]) + '</span>');
        }
      } else if (s.kind === 'fill') {
        var fv = s.forceBlank ? '' : (card.detailValues[s.key] || '');
        item.push('<span class="ws-fill">' + esc(fv) + '</span>');
        if (s.unit) item.push('<span class="ws-m-unit">' + esc(s.unit) + '</span>');
      }
      item.push('</div>');
      items.push(item.join(''));
    }
    if (!items.length) return '';
    return '<div class="ws-measure">' + items.join('') + '</div>';
  }

  // Legacy 2-column detail renderer — kept for now in case a
  // downstream consumer calls into it via the legacy PDF_DETAIL_LAYOUT
  // shape, but unused by the current renderCard flow.
  function renderDetailColumn(card, specs) {
    var h = [];
    if (!specs) return '';
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
        var yesOn   = v === 'yes' || v === 'true';
        var noOn    = v === 'no'  || v === 'false';
        var yesText = spec.yesLabel || 'Yes';
        var noText  = spec.noLabel  || 'No';
        h.push('<span class="ws-detail-value ws-yesno">');
        h.push('<span class="ws-box' + (yesOn ? ' is-on' : '') + '">' + (yesOn ? '\u2612' : '\u2610') + '</span> ' + esc(yesText));
        h.push('<span class="ws-box' + (noOn  ? ' is-on' : '') + '">' + (noOn  ? '\u2612' : '\u2610') + '</span> ' + esc(noText));
        h.push('</span>');
      } else if (spec.kind === 'fill') {
        // Value-or-blank-line: show the value if present, otherwise a
        // bottom-ruled span wide enough to write on. spec.forceBlank
        // overrides the value and always renders an empty fillable line.
        var fillVal = spec.forceBlank ? '' : value;
        h.push('<span class="ws-detail-value ws-fill">' + esc(fillVal) + '</span>');
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
    // Two-column body lights up when the card has detail data
    // (cameras/readers, NVRs, switches). Service/assumption rows
    // collapse to a single brief header line + body text.
    var brief = !card.showDetail;
    var isAssumption = card.rowClasses && /\bscw-row--assumptions\b/.test(card.rowClasses);
    var cls = 'ws-card' +
      (card.showDetail ? '' : ' ws-card--header-only ws-card--brief') +
      (isAssumption ? ' ws-card--assumption' : '');
    h.push('<section class="' + cls + '">');

    // ── Header row ──
    // For brief (service/assumption) cards the header carries the
    // full identity (label + product + warn + summary fields).
    // For detail cards the identity moves into col 1; the header
    // becomes a thin strip for residual chips (warn, qty, Other
    // Notes summary) only.
    h.push('<header class="ws-header">');
    h.push('<div class="ws-identity">');
    if (brief) {
      // Knack's identifier formula often concatenates "name - product"
      // and renders a trailing " - " when product is empty (typical
      // for assumption / service rows). Strip it so the header reads
      // cleanly.
      var briefLabel = String(card.label || '').replace(/\s*[-–—]\s*$/, '');
      if (briefLabel) h.push('<span class="ws-label">' + esc(briefLabel) + '</span>');
      if (briefLabel && card.product) h.push('<span class="ws-sep">&middot;</span>');
      if (card.product) h.push('<span class="ws-product">' + esc(card.product) + '</span>');
    }
    // Warning / alert chits intentionally suppressed — survey PDF
    // is a fill-in-the-field doc; on-screen QA chips are noise here.
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
        // Services / assumptions render labor as a dedicated body
        // block below the header (see ws-brief-labor), so skip the
        // duplicate when the same value would appear as an unlabeled
        // or "Service" / "Assumption" summary entry.
        if (isServiceOrAssumptionBucket(card) && card.laborText && sf.value === card.laborText) continue;
        h.push('<div class="ws-sum-field">');
        if (sfLabel) h.push('<span class="ws-sum-label">' + esc(sfLabel) + '</span>');
        h.push('<span class="ws-sum-value">' + esc(sf.value) + '</span>');
        h.push('</div>');
      }
      h.push('</div>');
    }
    h.push('</header>');

    // ── Services / Assumptions: explicit labor body line ──
    // Cam/reader cards drop labor description (sales artifact, no
    // field-use). Services and assumptions are DIFFERENT — for those
    // rows, the labor-description field IS the actual content
    // (service description / assumption text). Render it as a
    // dedicated full-width body line regardless of brief vs detail
    // classification — if a service row has a residual chip-host
    // field, it'll classify as showDetail=true but we still want the
    // service description rendered prominently.
    var isSvcOrAssump = isServiceOrAssumptionBucket(card);
    if (isSvcOrAssump && hasMeaningfulText(card.laborText)) {
      h.push('<div class="ws-brief-labor">' + esc(card.laborText) + '</div>');
    }

    // ── Two-column body (camera/reader/NVR cards only) ──
    if (card.showDetail) {
      // Notes square is reserved for cards where the tech is likely
      // to capture install observations (cameras/readers/networking).
      // Other Equipment cards (UPS, racks, hard drives) don't need it
      // — they're spec'd by part number, not surveyed.
      var renderNotesSquare = !isOtherEquipmentBucket(card);

      // Labor description is intentionally NOT rendered — dropped per
      // user request 2026-05. The tech doesn't need labor copy in the
      // field; it's a sales artifact. The space that column used to
      // occupy now goes to the SCW Notes + Tech Notes column on
      // cam/reader cards (one wide right column instead of two).
      var scwSpec   = PDF_DETAIL_LAYOUT.scwNotes || {};
      var scwVal    = card.scwText || firstKeyValue(card.detailValues, scwSpec.keys || (scwSpec.key ? [scwSpec.key] : []));

      function scwBlock() {
        if (!scwVal) return '';
        return '<div class="ws-labor ws-labor--scw">' +
          '<div class="ws-labor-label">' + esc(scwSpec.label || 'SCW Notes') + '</div>' +
          '<div class="ws-labor-value">' + esc(scwVal) + '</div>' +
        '</div>';
      }

      function techNotesBlock() {
        if (!renderNotesSquare) return '';
        return '<div class="ws-notes-open"></div>';
      }

      var stacked = useStackedProductLabor(card);
      h.push('<div class="ws-body-3col' + (stacked ? ' ws-body-3col--stacked' : '') + '">');

      if (stacked) {
        // Networking / Headend / Other Equipment: single column with
        //   [Product]
        //   [SCW Notes] (if any)
        //   [Tech Notes]
        // + ref / flags / measure beneath.
        h.push('<div class="ws-body-col ws-body-col--left">');
        if (card.label) {
          h.push('<div class="ws-id-label-block">' + esc(card.label) + '</div>');
        }
        if (card.product) {
          h.push('<div class="ws-id-product ws-id-product--stacked">' + esc(card.product) + '</div>');
        }
        h.push(scwBlock());
        h.push(techNotesBlock());
        h.push(renderRefSection(card));
        h.push(renderFlagsRow(card));
        h.push(renderMeasureRow(card));
        h.push('</div>');
      } else {
        // Cam/Reader: two columns —
        //   Col 1: identity + ref + flags + measure
        //   Col 2 (wide, absorbs the old labor + tech-notes columns):
        //         [SCW Notes] (if any) above [Tech Notes square]
        h.push('<div class="ws-body-col ws-body-col--left">');
        if (card.label || card.product) {
          h.push('<div class="ws-id-line">');
          if (card.label) {
            h.push('<span class="ws-id-label">' + esc(card.label) + '</span>');
          }
          if (card.product) {
            h.push('<span class="ws-id-product">' + esc(card.product) + '</span>');
          }
          h.push('</div>');
        }
        h.push(renderRefSection(card));
        h.push(renderFlagsRow(card));
        h.push(renderMeasureRow(card));
        h.push('</div>');

        h.push('<div class="ws-body-col ws-body-col--mid">');
        h.push(scwBlock());
        h.push(techNotesBlock());
        h.push('</div>');
      }

      h.push('</div>');
    }

    // ── Photo strip (full width below the 2-col body) ──
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

  function cssString(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ');
  }

  function getCss(payload) {
    payload = payload || {};
    var surveyId = payload.surveyId || '';
    // Fallback: if we couldn't find a labelled Survey ID, pull the
    // client/site off the document title so the footer still has
    // something identifying.
    if (!surveyId && payload.title) {
      surveyId = String(payload.title).replace(/^Survey:\s*/i, '');
    }
    var footerPrefix = surveyId ? (cssString(surveyId) + '  \\2014  Page ') : 'Page ';

    return [
      '@page {',
      '  size: letter portrait;',
      '  margin: 0.18in 0.2in 0.3in 0.2in;',
      '  @bottom-center {',
      '    content: "' + footerPrefix + '" counter(page) " of " counter(pages);',
      '    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;',
      '    font-size: 7.5pt; color: #6b7280;',
      '    margin-top: 0.04in;',
      '  }',
      '}',
      '/* Site-map pages and the connection-pivot page go landscape — */',
      '/* maps are usually wider than tall, and the pivot has many cols. */',
      '@page landscape-map {',
      '  size: letter landscape;',
      '  margin: 0.18in 0.2in 0.3in 0.2in;',
      '  @bottom-center {',
      '    content: "' + footerPrefix + '" counter(page) " of " counter(pages);',
      '    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;',
      '    font-size: 7.5pt; color: #6b7280;',
      '    margin-top: 0.04in;',
      '  }',
      '}',
      '@page landscape-pivot {',
      '  size: letter landscape;',
      '  margin: 0.18in 0.2in 0.3in 0.2in;',
      '  @bottom-center {',
      '    content: "' + footerPrefix + '" counter(page) " of " counter(pages);',
      '    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;',
      '    font-size: 7.5pt; color: #6b7280;',
      '    margin-top: 0.04in;',
      '  }',
      '}',
      '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }',
      '',
      '*, *::before, *::after { box-sizing: border-box; }',
      'body {',
      '  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;',
      '  color: #1f2937; font-size: 9.5px; line-height: 1.25;',
      '  margin: 0; padding: 4px;',
      '}',
      '.doc-title {',
      '  font-size: 16px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 6px 0; padding-bottom: 3px;',
      '  border-bottom: 2px solid #07467c;',
      '}',
      '',
      '/* Page 1 info cover (detail views: view_3796/3795/3798) */',
      '.info-cover {',
      '  page-break-after: always; break-after: page;',
      '  padding: 0.1in 0.1in; min-height: 10.3in;',
      '}',
      '.info-cover-title {',
      '  font-size: 17px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 8px 0; padding-bottom: 3px;',
      '  border-bottom: 2px solid #07467c; text-align: center;',
      '}',
      '.info-cover-section {',
      '  margin-bottom: 8px; padding: 6px 10px;',
      '  border: 1px solid #d0d7de; border-radius: 4px;',
      '  background: #f8fafc; page-break-inside: avoid;',
      '}',
      '.info-cover-section-title {',
      '  font-size: 11px; font-weight: 700; color: #07467c;',
      '  margin: 0 0 4px 0; padding-bottom: 2px;',
      '  border-bottom: 1px dashed #c9d4de;',
      '  text-transform: uppercase; letter-spacing: 0.4px;',
      '}',
      '.info-cover-fields {',
      '  margin: 0; padding: 0;',
      '  display: grid; grid-template-columns: 1fr 1fr;',
      '  column-gap: 16px; row-gap: 2px;',
      '}',
      '.info-cover-field {',
      '  display: flex; gap: 5px; align-items: baseline;',
      '  font-size: 9.5px; padding: 1px 0;',
      '  break-inside: avoid;',
      '}',
      '.info-cover-field dt {',
      '  font-weight: 600; color: #07467c;',
      '  min-width: 92px; flex: 0 0 92px;',
      '  margin: 0;',
      '}',
      '.info-cover-field dd {',
      '  margin: 0; color: #111827; flex: 1 1 auto;',
      '  white-space: pre-wrap; word-break: break-word;',
      '}',
      '.info-cover-field--wide {',
      '  grid-column: 1 / -1;',
      '  flex-direction: column; align-items: stretch; gap: 1px;',
      '}',
      '.info-cover-field--wide dt {',
      '  min-width: 0; flex: 0 0 auto;',
      '}',
      '',
      '/* Cover pages rendered before the survey items (site maps, etc.) */',
      '/* Forced landscape so a typical wide floor-plan screenshot fills */',
      '/* the page after auto-crop strips the whitespace borders. */',
      // Cover pages render on the SAME portrait page as the rest of
      // the worksheet (no @page landscape-map transition — that's
      // what Chrome-based PDF renderers insert blank pages around).
      //
      // Previous attempt added max-height + overflow:hidden to
      // hard-cap each section to one page. That backfired: the
      // fixed-height container caused renderers to split the
      // section's children across pages (label on page N,
      // image on page N+1). Now we let the section size naturally
      // and rely on the image's max-height to keep total content
      // under the page floor. page-break-after starts the next
      // section on a fresh page.
      '.cover-page {',
      '  page-break-after: always; break-after: page;',
      '  page-break-inside: avoid; break-inside: avoid;',
      '  text-align: center;',
      '  box-sizing: border-box;',
      '  width: 100%;',
      '}',
      '.cover-page:last-of-type {',
      '  page-break-after: auto;',
      '  break-after: auto;',
      '}',
      '.cover-section-label {',
      '  font-size: 12px; font-weight: 800; color: #07467c;',
      '  text-transform: uppercase; letter-spacing: 0.5px;',
      '  margin: 0 0 3px 0; padding: 2px 0 3px 0;',
      '  border-bottom: 2px solid #07467c; width: 100%;',
      '}',
      '.cover-img-wrap { display: none; }',
      '.cover-img {',
      '  display: block;',
      '  width: 100% !important;',
      '  height: auto !important;',
      // Letter landscape = 11" x 8.5".  With 0.18/0.2in margins minus
      // ~0.25in for the section label, the usable area is roughly
      // 10.6in x 8.0in. Bias height-bound for floor plans.
      '  max-width: 10.55in !important;',
      '  max-height: 7.95in !important;',
      '  object-fit: contain;',
      '  margin: 0 auto;',
      '  -webkit-print-color-adjust: exact;',
      '  print-color-adjust: exact;',
      '}',
      '',
      '/* Trailing photo grid (e.g. Additional Photos) */',
      '.trailing-photos {',
      '  margin-top: 8px; padding-top: 5px;',
      '  border-top: 1.5px solid #07467c;',
      '  page-break-before: auto;',
      '}',
      '.trailing-photos-title {',
      '  font-size: 12px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 4px 0;',
      '  text-transform: uppercase; letter-spacing: 0.5px;',
      '}',
      '.trailing-photos-grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(5, 1fr);',
      '  gap: 4px;',
      '}',
      '.trailing-photo {',
      '  margin: 0;',
      '  border: 1px solid #d0d7de; border-radius: 3px;',
      '  padding: 1px; background: #f8fafc;',
      '  page-break-inside: avoid;',
      '}',
      '.trailing-photo img {',
      '  width: 100%; height: 90px; object-fit: cover;',
      '  display: block; border-radius: 2px;',
      '}',
      '.group-header {',
      '  font-size: 11px; font-weight: 600; color: #07467c;',
      '  background: #eef5fb; padding: 3px 8px;',
      '  margin: 5px 0 2px 0; border-left: 3px solid #5b9bd5;',
      '  page-break-after: avoid;',
      '}',
      '.group-header.group-level-1 {',
      '  font-size: 12px; font-weight: 700;',
      '  background: #dbeafe; border-left-color: #07467c;',
      '}',
      '',
      '.ws-card {',
      '  border: 1px solid #d0d7de; border-radius: 4px;',
      '  margin: 2px 0; padding: 3px 6px;',
      '  page-break-inside: avoid; background: #fff;',
      '}',
      '.ws-card--header-only { padding: 2px 6px; }',
      '',
      '.ws-header {',
      '  display: flex; flex-wrap: wrap; justify-content: space-between;',
      '  align-items: baseline; gap: 8px;',
      '}',
      '.ws-identity {',
      '  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px;',
      '  min-width: 0; flex: 1 1 auto;',
      '}',
      '.ws-label {',
      '  font-size: 11.5px; font-weight: 700; color: #07467c;',
      '}',
      '.ws-sep { color: #94a3b8; }',
      '.ws-product {',
      '  font-size: 10.5px; font-weight: 500; color: #374151;',
      '}',
      '.ws-warn {',
      '  font-size: 9px; font-weight: 700; color: #b45309;',
      '  background: #fef3c7; border-radius: 999px;',
      '  padding: 0 6px; margin-left: 3px;',
      '}',
      '',
      '.ws-summary-fields {',
      '  display: flex; flex-wrap: wrap; gap: 2px 12px;',
      '  flex: 0 1 auto; max-width: 60%;',
      '}',
      '.ws-sum-field {',
      '  display: inline-flex; gap: 3px; align-items: baseline;',
      '  font-size: 9.5px;',
      '}',
      '.ws-sum-label {',
      '  font-weight: 600; color: #6b7280; text-transform: uppercase;',
      '  font-size: 8px; letter-spacing: 0.3px;',
      '}',
      '.ws-sum-value {',
      '  color: #111827; font-weight: 500;',
      '  white-space: pre-wrap;',
      '}',
      '',
      '/* ── Three-column body for camera/reader/NVR cards ───────── */',
      '/* col 1 = identity + flags + measurements (40%)            */',
      '/* col 2 = Labor Description, plain text (40%)              */',
      '/* col 3 = SCW Notes + open tech-notes square (20%)         */',
      /* Cam/Reader: two columns —
         Col 1 (--left): identity + ref/flags/measure.
         Col 2 (--mid):  SCW Notes (if any) + open Tech Notes square.
         Col 2 absorbs what used to be the labor-description column +
         the right-edge tech-notes column. Labor description dropped
         per user request — sales artifact, no use in the field. */
      '.ws-body-3col {',
      '  display: grid; grid-template-columns: 2fr 3fr;',
      '  column-gap: 8px; row-gap: 0;',
      '  margin-top: 2px; padding-top: 2px;',
      '  border-top: 1px solid #e5e7eb;',
      '  align-items: stretch;',
      '}',
      /* Networking / Headend / Other Equipment: single column with
         product, SCW notes, tech notes square, ref/flags/measure all
         stacked together. */
      '.ws-body-3col--stacked {',
      '  grid-template-columns: 1fr;',
      '}',
      '.ws-body-col { display: flex; flex-direction: column; gap: 2px; min-height: 0; }',
      '.ws-body-col--left  { padding-right: 4px; border-right: 1px dotted #e5e7eb; }',
      /* --mid is the rightmost column in the new 2-col layout, so it
         no longer needs a right border separator. */
      '.ws-body-col--mid   { padding-left: 4px; }',
      /* --left in the stacked single-column layout has no neighbour
         to separate from — drop the dotted right border. */
      '.ws-body-3col--stacked .ws-body-col--left { padding-right: 0; border-right: none; }',
      /* Stacked product/labor: block-level so they sit on their own
         lines without the inline ws-id-line flex layout. Product keeps
         its 11.5px bold blue styling; labor uses the standard
         ws-labor sizing. */
      '.ws-id-label-block {',
      '  font-weight: 700; color: #07467c; font-size: 11.5px;',
      '  line-height: 1.2;',
      '}',
      '.ws-id-product--stacked {',
      '  display: block;',
      '  line-height: 1.2;',
      '  margin-bottom: 2px;',
      '}',
      '.ws-labor--stacked {',
      '  margin-top: 0;',
      '}',
      '',
      '/* Identity line at top of col 1: [Label] [Product] no prefix */',
      '.ws-id-line {',
      '  display: flex; flex-wrap: wrap; gap: 6px;',
      '  align-items: baseline; line-height: 1.2;',
      '  margin-bottom: 1px;',
      '}',
      '.ws-id-label {',
      '  font-weight: 700; color: #07467c; font-size: 11.5px;',
      '}',
      '.ws-id-product {',
      // Match the label styling (bold + blue) so the device reads as',
      // one unified identifier line instead of label-then-graytext.',
      '  font-weight: 700; color: #07467c; font-size: 10.5px;',
      '}',
      '',
      '/* ── Reference items (Mount / SCW) — same shape as ws-line ── */',
      '.ws-ref {',
      '  display: flex; flex-direction: column; gap: 1px;',
      '  font-size: 9px; line-height: 1.25;',
      '}',
      '.ws-ref-item {',
      '  display: flex; gap: 4px; align-items: baseline;',
      '  break-inside: avoid;',
      '}',
      '.ws-ref-label {',
      '  font-weight: 700; color: #6b7280;',
      '  font-size: 7.5px; letter-spacing: 0.4px;',
      '  text-transform: uppercase;',
      '  min-width: 38px; flex: 0 0 38px; text-align: right;',
      '  padding-top: 1px;',
      '}',
      '.ws-ref-value {',
      '  color: #111827; flex: 1 1 auto;',
      '  white-space: pre-wrap; word-break: break-word;',
      '}',
      '',
      '/* ── Flag band (Existing / Exterior / Plenum) ────────────── */',
      '.ws-flags {',
      '  display: flex; flex-wrap: wrap; gap: 2px 8px;',
      '  margin-top: 2px; padding-top: 2px;',
      '  border-top: 1px dashed #e5e7eb;',
      '  font-size: 9px; align-items: baseline;',
      '}',
      '.ws-flag {',
      '  display: inline-flex; gap: 2px; align-items: baseline;',
      '  white-space: nowrap;',
      '}',
      '.ws-flag-label {',
      '  font-weight: 700; color: #07467c;',
      '  font-size: 8.5px;',
      '  margin-right: 1px;',
      '}',
      '.ws-flag-opt {',
      '  color: #374151; margin-right: 4px; font-size: 8.5px;',
      '}',
      '',
      '/* ── Measurement band (Height · Drop · Conduit) ──────────── */',
      '/* Aggressive shrink: tight gaps, narrower fill spans, smaller */',
      '/* checkbox glyphs so the whole row sits on one line.          */',
      '.ws-measure {',
      '  display: flex; flex-wrap: wrap; gap: 1px 6px;',
      '  margin-top: 2px; padding-top: 2px;',
      '  border-top: 1px dashed #e5e7eb;',
      '  font-size: 8.5px; align-items: baseline;',
      '}',
      '.ws-m-item {',
      '  display: inline-flex; gap: 1px; align-items: baseline;',
      '  white-space: nowrap;',
      '}',
      '.ws-m-label {',
      '  font-weight: 700; color: #07467c;',
      '  font-size: 8px; margin-right: 1px;',
      '}',
      '.ws-m-unit {',
      '  color: #6b7280; font-size: 7.5px; margin-left: 1px;',
      '}',
      '',
      '/* Fill-in-the-blank: underline span tall enough to write on */',
      '.ws-fill {',
      '  display: inline-block; min-width: 28px;',
      '  border-bottom: 1px solid #4b5563;',
      '  min-height: 11px; line-height: 10px;',
      '  padding: 0 1px; color: #111827;',
      '}',
      '',
      '.ws-box {',
      '  display: inline-block; font-size: 11px; line-height: 1;',
      '  margin-right: 1px; color: #111827;',
      '}',
      // is-on now means "SCW pre-fill / best guess" — rendered as a
      // soft GRAY ☒ so the tech reads it as a draft, not a confirmed
      // answer. Designed to be inked-over: tech draws over the gray
      // to confirm, or strikes it out and marks the other box to
      // override. Avoid #07467c (the strong blue was indistinguishable
      // from a "tech confirmed" mark).
      '.ws-box.is-on {',
      '  color: #9ca3af;',
      '  font-weight: 400;',
      '}',
      // Legend at top of the worksheet section. One short line; the
      // gray box matches what techs see in each card's flags row.
      // page-break-after: avoid so it stays glued to the first card.
      '.ws-prefill-legend {',
      '  margin: 6px 0 8px;',
      '  padding: 5px 8px;',
      '  background: #f9fafb;',
      '  border: 1px solid #e5e7eb;',
      '  border-radius: 3px;',
      '  font-size: 9px; line-height: 1.35;',
      '  color: #374151;',
      '  page-break-after: avoid; break-after: avoid;',
      '}',
      '.ws-prefill-legend strong { color: #111827; font-weight: 700; }',
      '.ws-box--prefill {',
      '  color: #9ca3af;',
      '  font-size: 11px;',
      '  margin-right: 2px;',
      '}',
      '',
      '/* ── Right column: Labor + SCW Notes + open Notes ─────────── */',
      '/* Labor Description is the lead cell of col 2 — rendered as  */',
      '/* plain text (no label block, no row prefix). SCW Notes gets  */',
      '/* a small uppercase tag because it\'s secondary context.       */',
      '.ws-labor {',
      '  font-size: 10px; line-height: 1.3;',
      '  margin-bottom: 3px;',
      '  flex: 0 0 auto;',
      '  color: #111827;',
      '  white-space: pre-wrap; word-break: break-word;',
      '}',
      '.ws-labor--scw { margin-bottom: 3px; color: inherit; }',
      '.ws-labor-label {',
      '  font-weight: 700; color: #6b7280;',
      '  font-size: 7.5px; letter-spacing: 0.4px;',
      '  text-transform: uppercase;',
      '  margin-bottom: 1px;',
      '}',
      '.ws-labor-value {',
      '  color: #111827;',
      '  white-space: pre-wrap; word-break: break-word;',
      '}',
      '/* Open notes square: no lines, no min-height — flex-grow soaks */',
      '/* up whatever vertical space col 1 leaves behind. The label    */',
      '/* sits in the top-left corner; the rest is blank writing area. */',
      '.ws-notes-open {',
      '  flex: 1 1 0;',
      '  /* Reserve at least 2 visible writing lines so techs always',
      '     have somewhere to jot. Label removed and box stripped per',
      '     user request — the writing area is implied whitespace now. */',
      '  min-height: 42px;',
      '  padding: 3px 5px;',
      '  background: transparent;',
      '  border: none;',
      '  border-radius: 0;',
      '}',
      '.ws-notes-open-label {',
      '  font-weight: 700; color: #6b7280;',
      '  font-size: 7.5px; letter-spacing: 0.4px;',
      '  text-transform: uppercase;',
      '}',
      '',
      '/* ── Brief cards (services / assumptions) — small body text ── */',
      '/* Project Wide rows are short text, so shrink the body to claw */',
      '/* back vertical space on the assumption / services pages.    */',
      '.ws-card--brief .ws-sum-value {',
      '  font-size: 8.5px; line-height: 1.3;',
      '}',
      '.ws-card--brief .ws-sum-label { font-size: 7.5px; }',
      '.ws-card--brief .ws-label { font-size: 10.5px; }',
      '.ws-card--brief .ws-product { font-size: 9.5px; }',
      '',
      '/* ── Assumptions: reference text, kept as tight as possible ── */',
      '.ws-card--assumption {',
      '  margin: 1px 0; padding: 1px 6px;',
      '}',
      '.ws-card--assumption .ws-header { gap: 4px; }',
      '.ws-card--assumption .ws-label { font-size: 9px; }',
      '.ws-card--assumption .ws-sum-value { font-size: 8px; line-height: 1.15; }',
      '.ws-card--assumption .ws-brief-labor {',
      '  margin-top: 0; padding-top: 0; border-top: none;',
      '  font-size: 9px; line-height: 1.2;',
      '}',
      /* Brief-card labor block — service description / assumption text */
      '.ws-brief-labor {',
      '  margin-top: 3px; padding-top: 3px;',
      '  border-top: 1px dotted #e5e7eb;',
      '  font-size: 9.5px; line-height: 1.35;',
      '  color: #1f2937;',
      '  white-space: pre-wrap;',
      '}',
      '',
      '/* Field Notes — blank lined writing area */',
      '.ws-notes {',
      '  margin-top: 4px; padding-top: 3px;',
      '  border-top: 1px dashed #e5e7eb;',
      '}',
      '.ws-notes-label {',
      '  font-size: 8px; font-weight: 700; color: #6b7280;',
      '  text-transform: uppercase; letter-spacing: 0.5px;',
      '  margin-bottom: 2px;',
      '}',
      '.ws-notes-lines { display: flex; flex-direction: column; gap: 7px; }',
      '.ws-notes-line {',
      '  height: 11px; border-bottom: 1px solid #9ca3af;',
      '}',
      '',
      '.ws-photos {',
      '  display: flex; flex-wrap: wrap; gap: 4px;',
      '  margin-top: 4px; padding-top: 3px;',
      '  border-top: 1px dashed #e5e7eb;',
      '}',
      '.ws-photo {',
      '  margin: 0; width: 78px;',
      '  border: 1px solid #d0d7de; border-radius: 3px;',
      '  padding: 1px; text-align: center; background: #f8fafc;',
      '}',
      '.ws-photo img {',
      '  width: 100%; height: 56px; object-fit: cover; display: block;',
      '  border-radius: 2px;',
      '}',
      '.ws-photo figcaption {',
      '  font-size: 7.5px; color: #6b7280; margin-top: 1px;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '',
      '/* Additional Notes block inserted directly under each L1 group header */',
      '.ws-card--notes {',
      '  border: 1px dashed #94a3b8;',
      '  background: #fbfdff;',
      '}',
      '.ws-notes-heading {',
      '  font-size: 9px; font-weight: 800; color: #07467c;',
      '  text-transform: uppercase; letter-spacing: 0.5px;',
      '  margin-bottom: 3px;',
      '}',
      '.ws-notes-scope {',
      '  color: #6b7280; font-weight: 600;',
      '  letter-spacing: 0.3px;',
      '}',
      '.ws-notes-lines--l1 { gap: 9px; }',
      '',
      '/* Connection Map pivot table — landscape page so we get more  */',
      '/* horizontal room for column headers and avoid vertical text. */',
      '.pivot {',
      '  page: landscape-pivot;',
      '  margin-top: 0; padding-top: 0;',
      '  page-break-before: always; page-break-after: always;',
      '  break-before: page; break-after: page;',
      '}',
      '.pivot-title {',
      '  font-size: 13px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 4px 0;',
      '  text-transform: uppercase; letter-spacing: 0.5px;',
      '}',
      '.pivot-table {',
      '  border-collapse: collapse; table-layout: auto;',
      '  width: 100%; font-size: 9px;',
      '}',
      '.pivot-table th, .pivot-table td {',
      '  border: 1px solid #94a3b8; padding: 1px 3px;',
      '  vertical-align: middle;',
      '}',
      '.pivot-corner {',
      '  background: #eef5fb; vertical-align: bottom; padding: 3px 5px;',
      '  font-weight: 700; color: #07467c; text-align: left;',
      '  white-space: nowrap; width: 1%;',
      '}',
      '.pivot-col {',
      '  background: #eef5fb; text-align: center;',
      '  height: 110px; vertical-align: bottom; padding: 3px 2px;',
      '  width: auto;',
      '}',
      '.pivot-col-text {',
      '  writing-mode: vertical-rl; transform: rotate(180deg);',
      '  display: inline-block;',
      '  height: 104px;',
      '  font-weight: 700; color: #07467c; font-size: 8.5px;',
      '  line-height: 1.1;',
      '  white-space: normal; word-break: break-word; overflow-wrap: break-word;',
      '}',
      '.pivot-col--blank { background: #f8fafc; }',
      '.pivot-row {',
      '  background: #f8fafc; text-align: left;',
      '  white-space: nowrap; width: 1%;',
      '  padding: 2px 5px;',
      '}',
      '.pivot-row--label   { font-weight: 700; color: #07467c; }',
      '.pivot-row--product { font-weight: 400; color: #374151; }',
      '.pivot-cell {',
      '  text-align: center; font-size: 12px; color: #111827;',
      '  height: 18px;',
      '}',
      '.pivot-blank-row .pivot-row { background: #fff; }'
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
      SCW.debug('[SCW survey-pdf] view_3800 produced no rows — skipping webhook');
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

    SCW.debug('[SCW survey-pdf] posting to webhook', {
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
  setupImagePreloads();

  // ══════════════════════════════════════════════════════════════
  // READINESS CHECK — for headless/Puppeteer callers
  // ══════════════════════════════════════════════════════════════
  //
  // A single probe that returns `true` once everything the export
  // needs is actually on the page and loaded:
  //   1. view_3800 has rendered at least one .scw-ws-row (custom JS
  //      has finished transforming the table)
  //   2. every image view configured for cover / trailing photos
  //      has been primed in imageCache, and every entry has finished
  //      its async preload + downsample
  //
  // `whenReady()` polls that probe on a short tick and resolves when
  // it returns true, or with `false` on timeout. Puppeteer can await
  // it instead of sleeping a fixed amount of time.

  function isReady() {
    var root = document.getElementById(DEFAULT_VIEW_ID);
    if (!root) return false;
    if (!root.querySelectorAll('tr.scw-ws-row').length) return false;

    var allViews = COVER_IMAGE_VIEWS.concat(TRAILING_IMAGE_VIEWS);
    for (var i = 0; i < allViews.length; i++) {
      var vid = allViews[i].viewId;
      if (!(vid in imageCache)) return false;
      var entries = imageCache[vid] || [];
      for (var j = 0; j < entries.length; j++) {
        if (!entries[j].loaded) return false;
      }
    }
    return true;
  }

  function whenReady(opts) {
    opts = opts || {};
    var timeoutMs = typeof opts.timeout === 'number' ? opts.timeout : 20000;
    var tickMs    = typeof opts.tick    === 'number' ? opts.tick    : 150;
    var start = Date.now();
    return new Promise(function (resolve) {
      (function tick() {
        try {
          if (isReady()) { resolve(true); return; }
        } catch (e) {}
        if (Date.now() - start >= timeoutMs) { resolve(false); return; }
        setTimeout(tick, tickMs);
      })();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════

  // Override the page-1 / cover-image / trailing-image view lists at
  // runtime. Used by sub-portal-survey-request-export.js, where the
  // survey lives on a scene that uses different view IDs than the
  // ops-side worksheet. Pass `null`/omit to leave a list unchanged.
  // Note: this only updates the constants used by scrape() and
  // getImageSections(); it does NOT re-run setupImagePreloads() —
  // callers are responsible for refreshing the image cache for any
  // newly-added image views (use SCW.surveyWorksheetPdf.refreshImageCache).
  function configureForScene(opts) {
    if (!opts) return;
    if (Array.isArray(opts.page1Views))         PAGE1_DETAIL_VIEWS  = opts.page1Views.slice();
    if (Array.isArray(opts.coverImageViews))    COVER_IMAGE_VIEWS   = opts.coverImageViews.slice();
    if (Array.isArray(opts.trailingImageViews)) TRAILING_IMAGE_VIEWS = opts.trailingImageViews.slice();
  }

  window.SCW = window.SCW || {};
  window.SCW.surveyWorksheetPdf = {
    scrape: scrape,
    buildHtml: buildHtml,
    preview: preview,
    generate: preview,
    sendToWebhook: sendToWebhook,
    isReady: isReady,
    whenReady: whenReady,
    refreshImageCache: refreshImageCacheForView,
    getImagesForView: getImagesForView,
    scrapePage1Cover: scrapePage1Cover,
    configureForScene: configureForScene
  };
})();
