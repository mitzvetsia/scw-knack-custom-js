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
  var BUCKET_FIELD             = 'field_2366';
  var CAMERAS_READERS_BUCKET   = '6481e5ba38f283002898113c';

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

    var tbody = root.querySelector('table tbody');
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
        if (level === 1) { currentL1 = label; currentL2 = ''; }
        else if (level === 2) { currentL2 = label; }
        out.push({ type: 'group', level: level, label: label });
        continue;
      }

      // ── worksheet card rows ──
      if (!tr.classList.contains('scw-ws-row')) continue;
      var card = tr.querySelector('.scw-ws-card');
      if (!card) continue;

      var rowObj = scrapeCard(card);
      if (rowObj) {
        rowObj.groupL1 = currentL1;
        rowObj.groupL2 = currentL2;
        rowObj.recordId = recordIdFromTr(tr);
        rowObj.raw = rowObj.recordId ? (recordMap[rowObj.recordId] || null) : null;
        out.push(rowObj);
      }
    }

    // Append an "Additional Notes" space at the end of each L1
    // (MDF/IDF) group so the tech can jot down anything that didn't
    // fit the structured fields.
    out = insertL1NotesBlocks(out);

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

  // Walks the row list and, after each L1 group's cards, appends
  // a single {type:'l1-notes'} entry tagged with that L1's label.
  // The renderer turns this into a blank "Additional Notes" block.
  function insertL1NotesBlocks(rows) {
    var out = [];
    var inL1 = false;
    var currentL1 = '';
    function flushNotes() {
      if (!inL1) return;
      out.push({ type: 'l1-notes', groupL1: currentL1 });
    }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.type === 'group' && r.level === 1) {
        flushNotes();
        inL1 = true;
        currentL1 = r.label;
      }
      out.push(r);
    }
    flushNotes();
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
  // data URL (or the original URL if loading/canvas fails).
  function preloadAndDownsample(url, maxDim, quality, cb) {
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
        var ds = downsampleImage(img, maxDim, quality);
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

  function refreshImageCacheForView(viewId, sectionLabel, maxDim, quality) {
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
            preloadAndDownsample(u, maxDim, quality, function (dataUrl) {
              if (dataUrl) e.src = dataUrl;
              e.loaded = true;
            });
          })(entry, rawUrl);
        }
      }
      imageCache[viewId] = nextCache;
      console.log('[SCW survey-pdf] image cache primed for ' + viewId, {
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
          // Covers use a larger max-dim than trailing photos.
          var isCover = COVER_IMAGE_VIEWS.indexOf(cfg) !== -1;
          var maxDim  = isCover ? 1400 : 600;
          var quality = isCover ? 0.8  : 0.65;
          refreshImageCacheForView(cfg.viewId, cfg.label, maxDim, quality);
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
      // Yes = Existing Cabling, No = New Cabling
      { key: 'field_2370', label: 'Cabling', kind: 'yesno',
        yesLabel: 'Existing Cabling', noLabel: 'New Cabling' },
      // Yes = Exterior, No = Interior
      { key: 'field_2372', label: 'Location', kind: 'yesno',
        yesLabel: 'Exterior', noLabel: 'Interior' },
      { key: 'field_2371', label: 'Plenum',  kind: 'yesno' }
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

  // ── Additional Notes block (appended at the end of each L1 group) ──
  function renderL1Notes(row) {
    var h = [];
    h.push('<section class="ws-card ws-card--notes">');
    h.push('<div class="ws-notes-heading">Additional Notes');
    if (row && row.groupL1) {
      h.push(' <span class="ws-notes-scope">\u2014 ' + esc(row.groupL1) + '</span>');
    }
    h.push('</div>');
    h.push('<div class="ws-notes-lines ws-notes-lines--l1">');
    for (var i = 0; i < 5; i++) {
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

  function isCamerasReadersBucket(card) {
    if (!card || !card.raw) return false;
    // Primary: connection _raw holds [{id, identifier}]
    var bucketId = bucketIdOf(card.raw, BUCKET_FIELD);
    if (bucketId && bucketId === CAMERAS_READERS_BUCKET) return true;
    // Fallback: display string (e.g. "Cameras or Readers")
    var disp = card.raw[BUCKET_FIELD];
    if (typeof disp === 'string' && /camera|reader/i.test(disp)) return true;
    return false;
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
    if (!rows.length || !cols.length) {
      console.log('[SCW survey-pdf] connection pivot: skipped', {
        rowCount: rows.length,
        colCount: cols.length
      });
      // Diagnostic: if we have columns but no rows, dump one card's
      // raw attrs so we can see where the bucket value actually lives.
      if (!rows.length && cols.length && payload.rows.length) {
        for (var d = 0; d < payload.rows.length; d++) {
          var dc = payload.rows[d];
          if (dc && dc.type === 'card' && dc.raw) {
            var sample = {};
            for (var k in dc.raw) {
              if (!dc.raw.hasOwnProperty(k)) continue;
              var val = dc.raw[k];
              if (val == null || val === '') continue;
              sample[k] = typeof val === 'string' && val.length > 80
                ? val.slice(0, 80) + '\u2026'
                : val;
            }
            console.log('[SCW survey-pdf] sample card raw attrs', {
              label: dc.label,
              product: dc.product,
              groupL1: dc.groupL1,
              groupL2: dc.groupL2,
              attrs: sample
            });
            break;
          }
        }
      }
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
    for (var i = 0; i < section.images.length; i++) {
      var img = section.images[i];
      h.push('<section class="cover-page">');
      if (label) {
        h.push('<div class="cover-section-label">' + esc(label) + '</div>');
      }
      h.push('<img class="cover-img" src="' + esc(img.src) + '" alt="' + esc(img.alt || label) + '" />');
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
      '  size: letter;',
      '  margin: 0.2in 0.225in 0.35in 0.225in;',
      '  @bottom-center {',
      '    content: "' + footerPrefix + '" counter(page) " of " counter(pages);',
      '    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;',
      '    font-size: 8pt; color: #6b7280;',
      '    margin-top: 0.05in;',
      '  }',
      '}',
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
      '',
      '/* Page 1 info cover (detail views: view_3796/3795/3798) */',
      '.info-cover {',
      '  page-break-after: always; break-after: page;',
      '  padding: 0.2in 0.15in; min-height: 10.3in;',
      '}',
      '.info-cover-title {',
      '  font-size: 22px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 14px 0; padding-bottom: 6px;',
      '  border-bottom: 3px solid #07467c; text-align: center;',
      '}',
      '.info-cover-section {',
      '  margin-bottom: 16px; padding: 10px 12px;',
      '  border: 1px solid #d0d7de; border-radius: 6px;',
      '  background: #f8fafc; page-break-inside: avoid;',
      '}',
      '.info-cover-section-title {',
      '  font-size: 13px; font-weight: 700; color: #07467c;',
      '  margin: 0 0 8px 0; padding-bottom: 4px;',
      '  border-bottom: 1px dashed #c9d4de;',
      '  text-transform: uppercase; letter-spacing: 0.4px;',
      '}',
      '.info-cover-fields {',
      '  margin: 0; padding: 0;',
      '  display: grid; grid-template-columns: 1fr 1fr;',
      '  column-gap: 20px; row-gap: 4px;',
      '}',
      '.info-cover-field {',
      '  display: flex; gap: 6px; align-items: baseline;',
      '  font-size: 11px; padding: 2px 0;',
      '  break-inside: avoid;',
      '}',
      '.info-cover-field dt {',
      '  font-weight: 600; color: #07467c;',
      '  min-width: 110px; flex: 0 0 110px;',
      '  margin: 0;',
      '}',
      '.info-cover-field dd {',
      '  margin: 0; color: #111827; flex: 1 1 auto;',
      '  white-space: pre-wrap; word-break: break-word;',
      '}',
      '.info-cover-field--wide {',
      '  grid-column: 1 / -1;',
      '  flex-direction: column; align-items: stretch; gap: 2px;',
      '}',
      '.info-cover-field--wide dt {',
      '  min-width: 0; flex: 0 0 auto;',
      '}',
      '',
      '/* Cover pages rendered before the survey items */',
      '.cover-page {',
      '  page-break-after: always; break-after: page;',
      '  text-align: center;',
      '  box-sizing: border-box;',
      '  width: 100%;',
      '}',
      '.cover-page:last-of-type { page-break-after: always; }',
      '.cover-section-label {',
      '  font-size: 14px; font-weight: 800; color: #07467c;',
      '  text-transform: uppercase; letter-spacing: 0.6px;',
      '  margin: 0 0 6px 0; padding: 4px 0 6px 0;',
      '  border-bottom: 2px solid #07467c; width: 100%;',
      '}',
      '.cover-img-wrap { display: none; }',
      '.cover-img {',
      '  display: block;',
      '  width: 8in !important;',
      '  height: 9.7in !important;',
      '  max-width: none !important;',
      '  max-height: none !important;',
      '  object-fit: contain;',
      '  margin: 0 auto;',
      '  -webkit-print-color-adjust: exact;',
      '  print-color-adjust: exact;',
      '}',
      '',
      '/* Trailing photo grid (e.g. Additional Photos) */',
      '.trailing-photos {',
      '  margin-top: 16px; padding-top: 10px;',
      '  border-top: 2px solid #07467c;',
      '  page-break-before: auto;',
      '}',
      '.trailing-photos-title {',
      '  font-size: 14px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 8px 0;',
      '  text-transform: uppercase; letter-spacing: 0.5px;',
      '}',
      '.trailing-photos-grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(4, 1fr);',
      '  gap: 6px;',
      '}',
      '.trailing-photo {',
      '  margin: 0;',
      '  border: 1px solid #d0d7de; border-radius: 4px;',
      '  padding: 2px; background: #f8fafc;',
      '  page-break-inside: avoid;',
      '}',
      '.trailing-photo img {',
      '  width: 100%; height: 120px; object-fit: cover;',
      '  display: block; border-radius: 2px;',
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
      '}',
      '',
      '/* Additional Notes block appended at the end of each L1 group */',
      '.ws-card--notes {',
      '  border: 1px dashed #94a3b8;',
      '  background: #fbfdff;',
      '}',
      '.ws-notes-heading {',
      '  font-size: 10px; font-weight: 800; color: #07467c;',
      '  text-transform: uppercase; letter-spacing: 0.5px;',
      '  margin-bottom: 6px;',
      '}',
      '.ws-notes-scope {',
      '  color: #6b7280; font-weight: 600;',
      '  letter-spacing: 0.3px;',
      '}',
      '.ws-notes-lines--l1 { gap: 14px; }',
      '',
      '/* Connection Map pivot table */',
      '.pivot {',
      '  margin-top: 0; padding-top: 0;',
      '  page-break-before: always; page-break-after: always;',
      '  break-before: page; break-after: page;',
      '}',
      '.pivot-title {',
      '  font-size: 14px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 6px 0;',
      '  text-transform: uppercase; letter-spacing: 0.5px;',
      '}',
      '.pivot-table {',
      '  border-collapse: collapse; table-layout: auto;',
      '  width: 100%; font-size: 9.5px;',
      '}',
      '.pivot-table th, .pivot-table td {',
      '  border: 1px solid #94a3b8; padding: 2px 4px;',
      '  vertical-align: middle;',
      '}',
      '.pivot-corner {',
      '  background: #eef5fb; vertical-align: bottom; padding: 4px 6px;',
      '  font-weight: 700; color: #07467c; text-align: left;',
      '  white-space: nowrap; width: 1%;',
      '}',
      '.pivot-col {',
      '  background: #eef5fb; text-align: center;',
      '  height: 140px; vertical-align: bottom; padding: 4px 2px;',
      '  width: auto;',
      '}',
      '.pivot-col-text {',
      '  writing-mode: vertical-rl; transform: rotate(180deg);',
      '  display: inline-block;',
      '  height: 132px;',
      '  font-weight: 700; color: #07467c; font-size: 9px;',
      '  line-height: 1.15;',
      '  white-space: normal; word-break: break-word; overflow-wrap: break-word;',
      '}',
      '.pivot-col--blank { background: #f8fafc; }',
      '.pivot-row {',
      '  background: #f8fafc; text-align: left;',
      '  white-space: nowrap; width: 1%;',
      '  padding: 3px 6px;',
      '}',
      '.pivot-row--label   { font-weight: 700; color: #07467c; }',
      '.pivot-row--product { font-weight: 400; color: #374151; }',
      '.pivot-cell {',
      '  text-align: center; font-size: 13px; color: #111827;',
      '  height: 22px;',
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
  setupImagePreloads();

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════

  window.SCW = window.SCW || {};
  window.SCW.surveyWorksheetPdf = {
    scrape: scrape,
    buildHtml: buildHtml,
    preview: preview,
    generate: preview,
    sendToWebhook: sendToWebhook,
    refreshImageCache: refreshImageCacheForView,
    getImagesForView: getImagesForView,
    scrapePage1Cover: scrapePage1Cover
  };
})();
