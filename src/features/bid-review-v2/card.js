/*** BID REVIEW V2 — CARD *****************************************************
 *
 * HTML factories for the v2 grid:
 *   buildSowSection(grid)        →  one SOW section (header + table)
 *   buildBidRow(row, packages)   →  one <tr> for one line item
 *   buildBidCell(cell, ctx)      →  one <td> for one (row × package) pair
 *
 * Every editable input is OUR input — never a Knack inline-edit field.
 * Inputs carry data-scw-br-v2-field / -record / -view; edit.js handles
 * commit + PUT.
 *
 * Phase 1: qty, rate, labor desc as plain inputs. Chips, connection
 * pickers, change-request buttons come in Phase 2.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns || !ns.CONFIG) return;

  var FK  = ns.CONFIG.fieldKeys;
  var SFK = ns.CONFIG.sowItemFieldKeys || {};
  // Synthetic "no SOW" grid (all-services bid etc.): the SOW column shows only
  // a "No SOW" note and per-row sync-to-SOW is suppressed — the only SOW action
  // is the per-bid "+ Create new SOW".
  var NO_SOW_ID = (ns.transform && ns.transform.NO_SOW) || '__no_sow__';
  function isNoSowGrid(sowId) { return sowId === NO_SOW_ID; }
  // Source views:
  //   [0] view_3680 — bid records  (READ-ONLY in this grid; changes go
  //                                 through Change Requests)
  //   [1] view_3921 — SOW items    (EDITABLE — source of truth)
  var BID_VIEW = (ns.CONFIG.sourceViewKeys || [])[0];
  var SOW_VIEW = (ns.CONFIG.sourceViewKeys || [])[1];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '"':'&quot;', '>':'&gt;', "'":'&#39;' })[c];
    });
  }

  /** Render Knack rich-text (labor desc / assumption text) PRESERVING its
   *  formatting. The old stripHtml→escapeHtml path flattened <br>, <b>,
   *  lists AND raw newlines into one run-on line — the data kept the
   *  markup, only the display lost it. Keeps the stored markup but
   *  neutralizes anything active (script/style/iframe, on* handlers,
   *  javascript: URLs); plain-text newlines become <br> when the value
   *  carries no block markup of its own. */
  function richTextHtml(s) {
    var raw = String(s == null ? '' : s);
    if (!raw) return '';
    var cleaned = raw
      .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?\s*>/gi, '')
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
      .replace(/(href|src)\s*=\s*(['"]?)\s*javascript:[^'">\s]*\2/gi, '');
    if (!/<\s*(br|p|div|li|ul|ol|h[1-6])\b/i.test(cleaned)) {
      cleaned = cleaned.replace(/\r?\n/g, '<br>');
    }
    return cleaned;
  }

  // Word-level diff for text fields (product name / labor desc). Returns
  // escaped HTML of `text` with only the WORDS that differ from the SOW
  // counterpart (`against`) wrapped in <u class="…tok-diff"> — the reviewer
  // sees exactly which terms changed instead of the whole value lighting up.
  //
  // Uses a TRUE positional diff: an LCS (longest common subsequence) over the
  // lowercased word sequences. Words that fall on the LCS are unchanged;
  // everything else (inserted / replaced) is underlined. Order matters, so a
  // reordered phrase highlights what actually moved — unlike a bag-of-words
  // compare. Whitespace/punctuation is preserved verbatim and never marked.
  // Pathologically long inputs (>600 words a side) fall back to a multiset
  // compare to bound the O(n·m) table.
  function isWordTok(p) { return /^[A-Za-z0-9]+$/.test(p); }
  function tokenizeParts(s) {
    return String(s).match(/[A-Za-z0-9]+|[^A-Za-z0-9]+/g) || [];
  }
  // Returns a boolean[] over `a` marking which words are part of the LCS
  // with `b` (true = unchanged / keep, false = differs / underline).
  function lcsKeep(a, b) {
    var n = a.length, mm = b.length;
    var dp = [];
    for (var i = 0; i <= n; i++) {
      var rowArr = new Array(mm + 1);
      for (var j = 0; j <= mm; j++) rowArr[j] = 0;
      dp.push(rowArr);
    }
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= mm; j++) {
        if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
        else dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
    var keep = new Array(n);
    for (i = 0; i < n; i++) keep[i] = false;
    i = n; j = mm;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) { keep[i - 1] = true; i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
      else j--;
    }
    return keep;
  }
  function multisetKeep(a, b) {
    var pool = Object.create(null);
    for (var i = 0; i < b.length; i++) pool[b[i]] = (pool[b[i]] || 0) + 1;
    var keep = new Array(a.length);
    for (var k = 0; k < a.length; k++) {
      if (pool[a[k]] > 0) { pool[a[k]]--; keep[k] = true; } else keep[k] = false;
    }
    return keep;
  }
  function markWordDiff(text, against) {
    var t = String(text == null ? '' : text);
    if (!t) return '';
    var a = String(against == null ? '' : against);
    if (!a.trim()) return escapeHtml(t);
    var parts = tokenizeParts(t);
    var aWords = [], aIdx = [];
    for (var i = 0; i < parts.length; i++) {
      if (isWordTok(parts[i])) { aWords.push(parts[i].toLowerCase()); aIdx.push(i); }
    }
    var bParts = tokenizeParts(a), bWords = [];
    for (var k = 0; k < bParts.length; k++) {
      if (isWordTok(bParts[k])) bWords.push(bParts[k].toLowerCase());
    }
    var keepWord = (aWords.length > 600 || bWords.length > 600)
      ? multisetKeep(aWords, bWords) : lcsKeep(aWords, bWords);
    var keepPart = Object.create(null);
    for (var w = 0; w < aIdx.length; w++) keepPart[aIdx[w]] = keepWord[w];
    var out = '';
    for (var j = 0; j < parts.length; j++) {
      var p = parts[j];
      if (isWordTok(p) && keepPart[j] !== true) {
        out += '<u class="scw-bid-review-v2__tok-diff">' + escapeHtml(p) + '</u>';
      } else {
        out += escapeHtml(p);
      }
    }
    return out;
  }

  // Cabling attributes (cam/reader) for a comparison cell: conduit + drop
  // length values, plenum / exterior / existing-cabling booleans. Rendered on
  // BOTH the SOW and bid sides so a reviewer can eyeball spec vs. bid.
  //   opts.side  'sow' | 'bid'
  //   opts.diffs per-field mismatch flags (bid side only) — a differing field
  //              gets the amber pill + the data-scw-diff-field hover hook;
  //              the SOW side carries the matching data-scw-sow-field target.
  // A boolean the bid DROPPED (false here, true on the SOW) still renders on
  // the bid side as a struck-through "off" chip so the removal is visible.
  function cablingLineHtml(data, opts) {
    if (!data) return '';
    opts = opts || {};
    var diffs = opts.diffs || {};
    var isSow = opts.side === 'sow';
    var DIFF = ' scw-bid-review-v2__field-diff';
    function hook(name, isDiff) {
      if (isSow) return ' data-scw-sow-field="' + name + '"';
      return isDiff ? ' data-scw-diff-field="' + name + '"' : '';
    }
    function valChip(v, label, name, isDiff) {
      var s = String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
      // Hide only blank — "0" is a real value (0 ft of conduit/drop) and should
      // show so the SOW spec reads explicitly. Truly empty fields stay hidden.
      if (!s) return '';
      return '<span class="scw-bid-review-v2__cabling-val' + (!isSow && isDiff ? DIFF : '') +
        '"' + hook(name, isDiff) + '><label>' + escapeHtml(label) + '</label>' +
        escapeHtml(s) + '</span>';
    }
    function boolChip(on, label, name, isDiff) {
      if (on) {
        return '<span class="scw-bid-review-v2__cabling-chip' + (!isSow && isDiff ? DIFF : '') +
          '"' + hook(name, isDiff) + '>' + escapeHtml(label) + '</span>';
      }
      // false but differing on the bid side → show it struck so "dropped" reads.
      if (!isSow && isDiff) {
        return '<span class="scw-bid-review-v2__cabling-chip scw-bid-review-v2__cabling-chip--off' +
          DIFF + '"' + hook(name, isDiff) + '>' + escapeHtml(label) + '</span>';
      }
      return '';
    }
    var inner =
      valChip(data.conduit,    'Conduit', 'conduit',    diffs.conduit) +
      valChip(data.dropLength, 'Drop',    'dropLength', diffs.dropLength) +
      boolChip(data.plenum,    'Plenum',   'plenum',   diffs.plenum) +
      boolChip(data.exterior,  'Exterior', 'exterior', diffs.exterior) +
      boolChip(data.existCabling, 'Existing cabling', 'existing', diffs.existing);
    if (!inner) return '';
    return '<div class="scw-bid-review-v2__cabling">' + inner + '</div>';
  }

  // Cam/reader detection — mirrors v1's showCabling(). Only these
  // buckets get the displayLabel column (E-001, E-002, …) and the
  // cabling/plenum/exterior chips (Phase 2).
  var CAM_READER_BUCKET_ID = '6481e5ba38f283002898113c';
  function isCamReader(row) {
    if (row.proposalBucketId === CAM_READER_BUCKET_ID) return true;
    var b = (row.proposalBucket || '').toLowerCase().trim();
    return b === 'camera' || b === 'cameras' ||
           b === 'reader' || b === 'readers' ||
           /(camera|reader)/.test(b);
  }

  // Assumption rows are free-text line items (no product, no qty/rate/fee).
  function isAssumption(row) {
    var b = (row && row.proposalBucket || '').toLowerCase().trim();
    return b.indexOf('assumption') !== -1;
  }

  // PDF document icon — same shape v1's bid PDF link uses.
  var PDF_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>' +
    '<line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';

  // Chevron SVG — same shape v1's group header uses.
  var GROUP_CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  // Amber warning triangle (matches the worksheet warning iconography).
  var WARN_TRI_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
    'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M12 2 22 12 12 22 2 12Z"></path>' +
    '<line x1="12" y1="8" x2="12" y2="13"></line>' +
    '<line x1="12" y1="16.5" x2="12.01" y2="16.5"></line></svg>';

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '';
    return '$' + Number(n).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  // ── Photos column ────────────────────────────────────────────
  // Mirrors v1's dedicated Photos column: one large thumb per row with
  // a "+N more" pill for the rest; clicking opens the row's expand
  // panel WITH a side-by-side photo viewer (init.js openWithPhoto).
  // We reuse v1's scraper verbatim — it already handles the 3-path
  // fallback (SOW-side .scw-inline-photo-card → view_3680 model
  // field_771_raw → view_3680 DOM) and caches across re-renders.
  var ROW_PHOTO_VISIBLE = 1;

  function getRowPhotoUrls(row) {
    var fn = window.SCW && SCW.bidReview && SCW.bidReview.scrapeRowPhotoUrls;
    if (typeof fn !== 'function') return null;
    // row.sowItem is the wsTr id (primary path); row.id is a bid
    // record id used by the fallback paths.
    return fn(row.sowItem || null, row.id || null);
  }

  function buildPhotosCell(row) {
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__photos-cell';
    var urls = getRowPhotoUrls(row);
    if (!urls || !urls.length) {
      td.innerHTML = '<div class="scw-bid-review-v2__photos-empty">—</div>';
      return td;
    }

    var stack = document.createElement('div');
    stack.className = 'scw-bid-review-v2__photos-stack';
    stack.setAttribute('title', urls.length + ' photo' +
      (urls.length === 1 ? '' : 's') +
      ' — click to open the editor with a full-size viewer');

    function openViewer(idx, e) {
      // Suppress the row's click-to-expand: we drive expansion ourselves
      // so the viewer mounts together with the panel.
      if (e) { e.preventDefault(); e.stopPropagation(); }
      var rowTr = td.parentNode;
      if (!rowTr || !ns.openWithPhoto) return;
      ns.openWithPhoto(rowTr, urls, idx);
    }

    var visible = Math.min(ROW_PHOTO_VISIBLE, urls.length);
    for (var v = 0; v < visible; v++) {
      (function (idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scw-bid-review-v2__photos-thumb';
        btn.addEventListener('click', function (e) { openViewer(idx, e); });
        var img = document.createElement('img');
        img.src = urls[idx]; img.alt = ''; img.loading = 'lazy';
        btn.appendChild(img);
        stack.appendChild(btn);
      })(v);
    }
    var hidden = urls.length - visible;
    if (hidden > 0) {
      (function (idx) {
        var more = document.createElement('span');
        more.className = 'scw-bid-review-v2__photos-more';
        more.textContent = '+' + hidden + ' more';
        more.addEventListener('click', function (e) { openViewer(idx, e); });
        stack.appendChild(more);
      })(visible);
    }
    td.appendChild(stack);
    return td;
  }

  /**
   * SOW item cell — leftmost data column. Read-only summary of the
   * underlying SOW line item that anchors this row. Edits to SOW
   * fields flow through worksheet-v2; bid-review v2 only displays.
   */
  var FIELD_DIFF = ' scw-bid-review-v2__field-diff';

  // Aggregate field-level mismatch across ALL of a row's bid cells, so we
  // can flag the differing field on the SOW side too (a field counts as
  // "different" when it doesn't match at least one displayed bid).
  function aggregateMismatch(row) {
    if (!row || !row.cellsByPackage || !ns.transform.getMismatches) return null;
    var agg = { product: false, laborDesc: false, fee: false, mdfIdf: false, any: false };
    for (var pid in row.cellsByPackage) {
      if (!Object.prototype.hasOwnProperty.call(row.cellsByPackage, pid)) continue;
      var m = ns.transform.getMismatches(row, row.cellsByPackage[pid]);
      if (!m) continue;
      if (m.product)   agg.product = true;
      if (m.laborDesc) agg.laborDesc = true;
      if (m.fee)       agg.fee = true;
      if (m.mdfIdf)    agg.mdfIdf = true;
      if (m.any)       agg.any = true;
    }
    return agg;
  }

  // Render a "what it was" detail block (product / qty / sub-bid / desc)
  // for cut-out cells where the live record/cell is gone or unlinked.
  function detailBlockHtml(d) {
    if (!d) return '';
    var html = '';
    if (d.product) {
      html += '<div class="scw-bid-review-v2__cell-product" title="' +
        escapeHtml(d.product) + '">' + escapeHtml(d.product) + '</div>';
    }
    var qtyTxt = (d.qty != null && d.qty !== '' && d.qty !== 0) ? String(d.qty) : '';
    var feeTxt = d.fee ? fmtMoney(d.fee) : '';
    if (qtyTxt || feeTxt) {
      html += '<div class="scw-bid-review-v2__cell-numbers">';
      if (qtyTxt) html += '<span class="scw-bid-review-v2__cell-num"><label>Qty</label>' +
        escapeHtml(qtyTxt) + '</span>';
      if (feeTxt) html += '<span class="scw-bid-review-v2__cell-num"><label>Sub Bid</label>' +
        escapeHtml(feeTxt) + '</span>';
      html += '</div>';
    }
    var descTxt = ns.transform.stripHtml(d.desc || '');
    if (descTxt) html += '<div class="scw-bid-review-v2__cell-desc" title="' +
      escapeHtml(descTxt) + '">' + escapeHtml(descTxt) + '</div>';
    return html;
  }

  // Connection-topology line for a comparison cell. `connDevice` is the
  // multi-value "Connected Devices" array ({id, identifier}); `connTo` is the
  // single "Connected To" label. An NVR/switch populates connDevice (its
  // cameras/readers), a camera/reader populates connTo (its NVR/switch) — so
  // rendering whichever is present shows the appropriate field per device.
  // Returns '' when neither is set, so rows without topology stay uncluttered.
  function connLineHtml(connDevice, connTo, opts) {
    opts = opts || {};
    var DIFF = ' scw-bid-review-v2__field-diff';
    // SOW side is the hover TARGET (data-scw-sow-field) under the soft cell
    // tint; the bid side carries the hard per-field highlight + hover SOURCE
    // (data-scw-diff-field), but only on a line that actually differs — the
    // same pattern product / fee / desc use.
    function lineAttrs(isDiff) {
      if (opts.side === 'sow') return { cls: '', hook: ' data-scw-sow-field="conn"' };
      return { cls: isDiff ? DIFF : '', hook: isDiff ? ' data-scw-diff-field="conn"' : '' };
    }
    var html = '';
    if (Array.isArray(connDevice) && connDevice.length) {
      var names = [];
      for (var i = 0; i < connDevice.length; i++) {
        var c = connDevice[i];
        var lbl = ns.transform.stripHtml((c && (c.identifier || c.name)) || '').trim();
        if (lbl) names.push(lbl);
      }
      if (names.length) {
        var a = lineAttrs(!!opts.deviceDiff);
        var joined = names.join(', ');
        html += '<div class="scw-bid-review-v2__cell-conn' + a.cls + '"' + a.hook +
          ' title="Connected devices: ' + escapeHtml(joined) + '">' +
          '<label>Connected</label>' + escapeHtml(joined) + '</div>';
      }
    } else if (opts.side === 'bid' && opts.deviceDiff) {
      // Bid has NO connected devices but the SOW does — surface the gap so the
      // dropped connection reads as a difference, not just an amber cell tint.
      var am = lineAttrs(true);
      html += '<div class="scw-bid-review-v2__cell-conn' + am.cls + '"' + am.hook +
        ' title="No connected devices on this bid (SOW expects connected devices)">' +
        '<label>Connected</label><em style="opacity:.6">(none)</em></div>';
    }
    var to = ns.transform.stripHtml(connTo || '').trim();
    if (to && !/^\(none\)$/i.test(to)) {
      var a2 = lineAttrs(!!opts.toDiff);
      html += '<div class="scw-bid-review-v2__cell-conn' + a2.cls + '"' + a2.hook +
        ' title="Connected to: ' + escapeHtml(to) + '">' +
        '<label>Connected&nbsp;to</label>' + escapeHtml(to) + '</div>';
    } else if (opts.side === 'bid' && opts.toDiff) {
      // Bid not connected but the SOW expects a connection — show the gap.
      var a2m = lineAttrs(true);
      html += '<div class="scw-bid-review-v2__cell-conn' + a2m.cls + '"' + a2m.hook +
        ' title="Not connected on this bid (SOW expects a connection)">' +
        '<label>Connected&nbsp;to</label><em style="opacity:.6">(none)</em></div>';
    }
    return html;
  }

  // Survey-note block (field_2412) for a bid cell — icon + label + text.
  // Used in BOTH populated cells (v1 parity: render.js appended cell.notes
  // after the values) and the no-bid cutout cells.
  function surveyNoteHtml(txt) {
    if (!txt) return '';
    return '<div class="scw-bid-review-v2__cell-survey-note" title="' +
        escapeHtml(txt) + '">' +
        '<span class="scw-bid-review-v2__cell-survey-note-icon">' +
          SURVEY_NOTES_SVG + '</span>' +
        '<div class="scw-bid-review-v2__cell-survey-note-body">' +
          '<span class="scw-bid-review-v2__cell-survey-note-label">Survey Note</span>' +
          '<span class="scw-bid-review-v2__cell-survey-note-text">' +
            escapeHtml(txt) + '</span>' +
        '</div></div>';
  }

  function buildSowCell(row, isAssumption, sowId) {
    var sowItemData = row && row.sowItemData;
    var diff = aggregateMismatch(row);
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__sow-cell';

    // No SOW item record exists for this row.
    if (!sowItemData) {
      td.classList.add('scw-bid-review-v2__sow-cell--empty');
      if (row && row.removed) {
        // Removed from everything → blue hash here too ("not on this
        // SOW"). A removed item still has a record somewhere (the bid
        // item, or the orphaned survey line item) — show what it WAS
        // inside the cut-out so reviewers see the removed item's details.
        td.classList.add('scw-bid-review-v2__sow-cell--off-sow');
        var rDetail = row.detail ? detailBlockHtml(row.detail) : '';
        td.innerHTML = rDetail ||
          '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      } else if (row && (!row.sowItem || row.needsSow)) {
        // Bid item with no SOW counterpart → offer "+ Add to SOW".
        td.innerHTML =
          '<span class="scw-bid-review-v2__cell-empty-mark">—</span>' +
          '<div class="scw-bid-review-v2__cell-actions">' +
            '<button type="button" class="scw-bid-review__cell-action ' +
              'scw-bid-review__cell-action--add scw-bid-review-v2__cell-action" ' +
              crAttrs('row_add_to_sow', row.id, '', sowId) + '>+ Add to SOW</button>' +
          '</div>';
      } else {
        // A blank cell means no corresponding SOW record exists.
        td.innerHTML = '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      }
      return td;
    }

    // The SOW item EXISTS → always show its details. If it isn't on THIS
    // SOW (offSow / belongs to another SOW / removed), wrap in the blue
    // cut-out so it reads as "exists, but not on this SOW".
    if (row && (row.offSow || row.removed)) td.classList.add('scw-bid-review-v2__sow-cell--off-sow');
    // Soft whole-cell tint when anything differs (no per-field hard
    // highlight on the SOW side — that's reserved for the bid columns).
    // The specific differing field lights up on hover of its bid-cell
    // counterpart, via the data-scw-sow-field hooks below.
    if (diff && diff.any) td.classList.add('scw-bid-review-v2__sow-cell--has-diff');
    var descTxt = ns.transform.stripHtml(sowItemData.laborDesc || '');
    // Rich display variant — formatting (<br>/<b>/lists) and line breaks
    // preserved; the stripped text stays for title tooltips + word diffs.
    var descRich = richTextHtml(sowItemData.laborDesc || '');
    // Assumptions are free-text only — no product name, no qty/fee numbers.
    if (isAssumption) {
      td.classList.add('scw-bid-review-v2__sow-cell--assumption');
      td.innerHTML = descTxt
        ? '<div class="scw-bid-review-v2__sow-desc" title="' +
            escapeHtml(descTxt) + '">' + descRich + '</div>'
        : '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      return td;
    }
    var qtyTxt  = sowItemData.qty ? String(sowItemData.qty) : '—';
    var feeTxt  = sowItemData.fee ? fmtMoney(sowItemData.fee) : '—';
    // SOW-item issue chips (missing photos / disconnected / wrong accessory /
    // has SCW notes). Computed from the SOW item only — never the bid side.
    // The actual note text is passed through so the "notes" chip's hover
    // shows the note itself instead of just a generic label.
    var warnHtml = (ns.warnings && row && row.sowItem)
      ? ns.warnings.chipsHtml(row.sowItem, sowItemData.scwNotes) : '';
    // Accessory rows get an "attached to <parent>" line so the relationship
    // is explicit even when scrolled away from the parent.
    var attachHtml = (row && row.isAccessory && row.parentLabel)
      ? '<div class="scw-bid-review-v2__sow-attached" title="Attached to ' +
          escapeHtml(row.parentLabel) + '">↳ attached to ' +
          '<span class="scw-bid-review-v2__sow-attached-name">' +
            escapeHtml(row.parentLabel) + '</span></div>'
      : '';
    // Text-only accessories line (bracket, UPS, etc. attached to this SOW
    // item) — same info worksheet-v2 shows as chips, but the accessory
    // RECORDS aren't loaded into this grid's source view (see transform.js),
    // so there's no chip UI to build — just list the names.
    var accList = sowItemData.accessories || [];
    var accessoriesHtml = accList.length
      ? '<div class="scw-bid-review-v2__sow-accessories" title="' +
          escapeHtml(accList.join(', ')) + '">' +
          '<label>Accessories</label>' + escapeHtml(accList.join(', ')) +
        '</div>'
      : '';
    td.innerHTML =
      warnHtml +
      attachHtml +
      (sowItemData.productName ?
        '<div class="scw-bid-review-v2__sow-product" data-scw-sow-field="product" title="' +
          escapeHtml(sowItemData.productName) + '">' +
          escapeHtml(sowItemData.productName) +
        '</div>' : '') +
      '<div class="scw-bid-review-v2__sow-numbers">' +
        '<span class="scw-bid-review-v2__sow-num" data-scw-sow-field="qty"><label>Qty</label>' +
          escapeHtml(qtyTxt) + '</span>' +
        '<span class="scw-bid-review-v2__sow-num" data-scw-sow-field="fee"><label>Sub Bid</label>' +
          escapeHtml(feeTxt) + '</span>' +
      '</div>' +
      (descTxt ?
        '<div class="scw-bid-review-v2__sow-desc" data-scw-sow-field="desc" title="' +
          escapeHtml(descTxt) + '">' + descRich +
        '</div>' : '') +
      accessoriesHtml +
      connLineHtml(sowItemData.connDevice, sowItemData.connTo, { side: 'sow' }) +
      cablingLineHtml(sowItemData, { side: 'sow' }) +
      // SOW MDF/IDF — shown when a bid overrides it (diff.mdfIdf) so the
      // override reads as a side-by-side: the SOW's location here, the bid's
      // (highlighted) in the bid cell. data-scw-sow-field is the hover target
      // the bid-cell MDF line lights up. (Off-SOW rows sit under the BID's MDF
      // group, so the SOW's own location is otherwise invisible without this.)
      ((diff && diff.mdfIdf) ?
        '<div class="scw-bid-review-v2__cell-conn" data-scw-sow-field="mdfIdf" title="SOW MDF/IDF: ' +
          escapeHtml((sowItemData && sowItemData.mdfIdf) || '(none)') + '">' +
          '<label>MDF&nbsp;/&nbsp;IDF</label>' +
          escapeHtml((sowItemData && sowItemData.mdfIdf) || '(none)') +
        '</div>' : '') +
      // "belongs to another SOW" rows note which SOW(s) the item is on.
      ((row && row.otherKind === 'other-sow' && row.otherSowNames && row.otherSowNames.length) ?
        '<div class="scw-bid-review-v2__sow-elsewhere">on ' +
          escapeHtml(row.otherSowNames.join(', ')) + '</div>' : '');
    return td;
  }

  // v1's change-request API + the pending state (live on the same scene).
  function crApi() {
    return (window.SCW.bidReview && window.SCW.bidReview.changeRequests) || null;
  }
  // Find the pending CR item for a given row+package, if any.
  function findPendingItem(rowId, pkgId) {
    var api = crApi();
    if (!api || !api.getPending) return null;
    var pending = api.getPending() || {};
    var bucket = pending[pkgId];
    if (!bucket || !bucket.items) return null;
    for (var i = 0; i < bucket.items.length; i++) {
      if (bucket.items[i].rowId === rowId) return bucket.items[i];
    }
    return null;
  }
  // Shared data-* attrs string for a cell CR button. `bidRecordId` (the
  // specific view_3680 record behind THIS cell) lets v1's CR handlers resolve
  // the target by bid record even when the row identity diverges between v2's
  // render and v1's _state — the case for a bid item whose "source of truth"
  // SOW line item lives on a DIFFERENT SOW than the panel it's shown in
  // (off-SOW rows), where matching by data-row-id alone silently misses and
  // the Revise/Remove buttons no-op.
  function crAttrs(action, rowId, pkgId, sowId, bidRecordId) {
    return 'data-action="' + escapeHtml(action) + '" ' +
      'data-row-id="' + escapeHtml(rowId || '') + '" ' +
      'data-package-id="' + escapeHtml(pkgId || '') + '" ' +
      'data-sow-id="' + escapeHtml(sowId || '') + '"' +
      (bidRecordId ? ' data-bid-record-id="' + escapeHtml(bidRecordId) + '"' : '');
  }
  // Revise + Remove stack for a populated bid cell. CR buttons require
  // sub-bid to be wanted on EITHER side: the bid record (field_2478 →
  // row.requireSubBid) OR the SOW line item (field_2479 →
  // row.requireSubBidSow). Suppress ONLY when both are explicitly No — a
  // lone "No" on the bid record no longer hides the buttons if the SOW
  // still wants the item priced.
  function cellActionStack(row, pkgId, sowId, diffs, bidRecordId) {
    var isNoFlag = function (v) {
      if (v === false) return true;
      if (v == null) return false;
      return /^(no|false)$/i.test(String(v).replace(/<[^>]*>/g, '').trim());
    };
    if (isNoFlag(row.requireSubBid) && isNoFlag(row.requireSubBidSow)) return '';
    // When the bid mismatches the SOW for this row, the Revise button
    // becomes a dropdown (v1 parity): "Edit bid values" (free-form CR) +
    // "Match SOW values" (CR prefilled from SOW). dispatchCRAction handles
    // both cell_request_change and cell_request_change_from_sow. With no
    // mismatch, it's a single Revise button. Reuses v1's .scw-bid-review__
    // overflow* classes (v1 CSS is on the same scene); the menu items also
    // carry the v2 cell-action class so v2's delegated click dispatches
    // them, and the trigger toggle is wired in init.js.
    // When the bid mismatches the SOW, the Revise button opens a dropdown
    // (v1 parity): "Edit bid values" (cell_request_change) + "Match SOW
    // values" (cell_request_change_from_sow). The menu is positioned fixed
    // by init.js on open so the SOW card's overflow:hidden can't clip it.
    // No mismatch → single plain Revise button.
    var revise;
    if (diffs && diffs.any) {
      revise =
        '<div class="scw-bid-review-v2__overflow">' +
          '<button type="button" class="scw-bid-review__cell-action ' +
            'scw-bid-review__cell-action--revise scw-bid-review-v2__cell-action ' +
            'scw-bid-review-v2__overflow-trigger">' +
            '<span class="scw-bid-review-v2__overflow-dots">⋮</span> Revise</button>' +
          '<div class="scw-bid-review-v2__overflow-menu">' +
            '<button type="button" class="scw-bid-review-v2__overflow-item scw-bid-review-v2__cell-action" ' +
              crAttrs('cell_request_change', row.id, pkgId, sowId, bidRecordId) + '>Edit bid values</button>' +
            '<button type="button" class="scw-bid-review-v2__overflow-item scw-bid-review-v2__cell-action" ' +
              crAttrs('cell_request_change_from_sow', row.id, pkgId, sowId, bidRecordId) + '>Match SOW values</button>' +
          '</div>' +
        '</div>';
    } else {
      revise =
        '<button type="button" class="scw-bid-review__cell-action ' +
          'scw-bid-review__cell-action--revise scw-bid-review-v2__cell-action" ' +
          crAttrs('cell_request_change', row.id, pkgId, sowId, bidRecordId) + '>Revise</button>';
    }
    // Re-link — re-point THIS bid record's source-of-truth SOW line item
    // (field_2404) at a different SOW item. Only renders when we know the
    // exact bid record behind the cell (criss-crossed items are per-record;
    // row identity alone is the SOW item, not the bid).
    var relink = bidRecordId
      ? '<button type="button" class="scw-bid-review__cell-action ' +
          'scw-bid-review__cell-action--relink scw-bid-review-v2__cell-action" ' +
          crAttrs('cell_relink_bid', row.id, pkgId, sowId, bidRecordId) +
          ' title="Point this bid item at a different SOW line item (source of truth)"' +
          '>Re-link</button>'
      : '';
    return '<div class="scw-bid-review-v2__cell-actions">' +
      revise +
      relink +
      '<button type="button" class="scw-bid-review__cell-action ' +
        'scw-bid-review__cell-action--remove scw-bid-review-v2__cell-action" ' +
        crAttrs('cell_remove_from_bid', row.id, pkgId, sowId, bidRecordId) + '>Remove</button>' +
    '</div>';
  }

  // One stacked DUPLICATE bid item — a second (third, …) bid line item
  // on the SAME bid that maps to the same SOW item as the primary cell.
  // Rendered beneath the primary inside the bid cell, full values shown
  // (they may differ), tagged, with a Remove that targets THIS bid
  // record (data-bid-record-id override consumed by v1 handleRemoveFromBid).
  function stackedDupeHtml(d, row, pkgId, sowId) {
    var descTxt = ns.transform.stripHtml(d.laborDesc || '');
    var qtyTxt  = d.qty  ? String(d.qty) : '—';
    var rateTxt = d.rate ? fmtMoney(d.rate) : '—';
    var extTxt  = d.labor ? fmtMoney(d.labor) : '—';
    var showExt = (Number(d.qty) || 0) > 1;
    return '<div class="scw-bid-review-v2__bid-item scw-bid-review-v2__bid-item--dupe">' +
      '<div class="scw-bid-review-v2__bid-dupe-tag" title="A second bid line item ' +
        'on this bid is linked to the same SOW item. Usually the extra should be ' +
        'removed or re-mapped to its own SOW item.">' +
        WARN_TRI_SVG + '<span>2nd bid item → same SOW item</span></div>' +
      (d.productName ?
        '<div class="scw-bid-review-v2__cell-product" title="' + escapeHtml(d.productName) + '">' +
          escapeHtml(d.productName) + '</div>' : '') +
      '<div class="scw-bid-review-v2__cell-numbers">' +
        '<span class="scw-bid-review-v2__cell-num"><label>Qty</label>' + escapeHtml(qtyTxt) + '</span>' +
        '<span class="scw-bid-review-v2__cell-num"><label>Sub Bid</label>' + escapeHtml(rateTxt) + '</span>' +
        (showExt ? '<span class="scw-bid-review-v2__cell-num"><label>Ext</label>' +
          escapeHtml(extTxt) + '</span>' : '') +
      '</div>' +
      (descTxt ?
        '<div class="scw-bid-review-v2__cell-desc" title="' + escapeHtml(descTxt) + '">' +
          escapeHtml(descTxt) + '</div>' : '') +
      '<div class="scw-bid-review-v2__cell-actions">' +
        // Keep both → split this duplicate onto its OWN new SOW line item.
        '<button type="button" class="scw-bid-review__cell-action ' +
          'scw-bid-review__cell-action--add scw-bid-review-v2__cell-action" ' +
          'data-action="cell_create_sow_from_bid" ' +
          'data-bid-record-id="' + escapeHtml(d.id) + '" ' +
          'data-sow-id="' + escapeHtml(sowId || '') + '" ' +
          'title="Keep both — create a separate SOW line item for this bid item">' +
          '+ New SOW item</button>' +
        // Duplicates are the prime criss-cross case — the 2nd bid item
        // usually belongs to a DIFFERENT existing SOW item. Re-link points
        // THIS dupe record's field_2404 at the one the user picks.
        '<button type="button" class="scw-bid-review__cell-action ' +
          'scw-bid-review__cell-action--relink scw-bid-review-v2__cell-action" ' +
          'data-action="cell_relink_bid" ' +
          'data-bid-record-id="' + escapeHtml(d.id) + '" ' +
          'data-sow-id="' + escapeHtml(sowId || '') + '" ' +
          'title="Point this bid item at a different SOW line item (source of truth)"' +
          '>Re-link</button>' +
        '<button type="button" class="scw-bid-review__cell-action ' +
          'scw-bid-review__cell-action--remove scw-bid-review-v2__cell-action" ' +
          crAttrs('cell_remove_from_bid', row.id, pkgId, sowId) +
          ' data-bid-record-id="' + escapeHtml(d.id) + '"' +
          ' data-bid-product="' + escapeHtml(ns.transform.stripHtml(d.productName || '')) +
          '">Remove</button>' +
      '</div>' +
    '</div>';
  }

  /**
   * One bid cell — the (row × package) intersection. Pure HTML factory
   * for content; CR buttons + pending card are appended after. Events
   * bind via delegation (edit.js for inputs, init.js for CR actions).
   */
  function buildBidCell(cell, row, pkg, sowId, isAssumption) {
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__cell scw-bid-review-v2__pkg-col';
    var pkgId = pkg && pkg.id;
    if (pkgId) td.setAttribute('data-pkg-id', pkgId);
    // Pending CR lookup: a removal CR is now keyed by the exact bid record
    // (cell.id), which on an off-SOW row shared across bids differs from the
    // row's meta id. Try the row id first (add/revise/normal rows), then the
    // cell's own record id (off-SOW removal) so the pending card still shows
    // on the right cell.
    var pendingItem = row ? findPendingItem(row.id, pkgId) : null;
    if (!pendingItem && cell && cell.id) pendingItem = findPendingItem(cell.id, pkgId);
    // Stacked duplicates: a CR raised from a dupe block ("2nd bid item →
    // same SOW item") is keyed by the DUPE's own bid record id — invisible
    // to both lookups above, so the pending card never rendered anywhere.
    // Collect dupe-keyed items separately; they render on the host cell
    // alongside (not instead of) any primary-cell card.
    var dupePendingItems = [];
    if (cell && cell.dupes) {
      for (var dpi = 0; dpi < cell.dupes.length; dpi++) {
        var dpItem = (cell.dupes[dpi] && cell.dupes[dpi].id)
          ? findPendingItem(cell.dupes[dpi].id, pkgId) : null;
        if (dpItem && dpItem !== pendingItem) dupePendingItems.push(dpItem);
      }
    }

    if (!cell) {
      td.classList.add('scw-bid-review-v2__cell--empty');
      // Assumptions aren't "on a bid" in the priced sense — leave blank.
      if (isAssumption) {
        td.innerHTML = '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
        appendPendingCard(td, pendingItem, row, pkg, sowId);
        return td;
      }
      // Any empty real-line-item cell is "not on this bid" → blue diagonal
      // hash. The LABEL depends on whether a bid item exists anywhere:
      //   • bid item exists (a populated cell elsewhere on this row, an
      //     unlinked surveyNoBid record, or a removed-from-bid snapshot)
      //     → "Removed from bid" + "Reinstate".
      //   • NO bid item points back at the SOW item at all (noBid, or an
      //     orphaned removed survey item) → "Not surveyed" + "Add to bid".
      td.classList.add('scw-bid-review-v2__cell--no-bid-cutout');
      var rowHasAnyBidCell = !!(row && row.cellsByPackage &&
        Object.keys(row.cellsByPackage).length > 0);
      var hasBidRecord = !!(row && (row.hasBidRecord || rowHasAnyBidCell ||
        (row.detail && row.detail.side === 'BID') || row.surveyNoBid));
      var badge    = hasBidRecord ? 'Removed from bid' : 'Not surveyed';
      var badgeCls = 'scw-bid-review-v2__no-bid-badge' +
        (hasBidRecord ? ' scw-bid-review-v2__no-bid-badge--removed' : '');
      // Show the bid item's details inside the hash when we have them.
      var detail   = (row && row.detail && row.detail.side === 'BID')
        ? detailBlockHtml(row.detail) : '';
      // Survey note (field_2412) — v1 renders it inside the no-bid cell.
      // Prefer the bid record's copy (row.surveyNotes), but fall back to the
      // SOW line item's own field_2412 (row.sowItemData.surveyNotes): the note
      // lives on the line item, and the bid-side copy is empty whenever Make
      // didn't mirror it — without this fallback the note silently vanishes.
      var surveyNoteTxt = (row && row.surveyNotes) ||
        (row && row.sowItemData && row.sowItemData.surveyNotes) || '';
      var noteHtml = surveyNoteHtml(surveyNoteTxt);
      var actions  = '';
      if (row) {
        // "+ Add to bid" (no existing bid record) → a true ADD that creates a
        // brand-new bid record. "+ Reinstate" (the bid record still exists, just
        // unlinked from this package) → a REVISE-type CR that RE-LINKS the
        // existing bid record (never a new add). The two MUST dispatch
        // different actions or reinstate duplicates the bid record.
        if (hasBidRecord) {
          // The bid RECORD id to re-link. For a bid-side row (surveyNoBid /
          // Source-B removed) row.id IS the view_3680 bid record id; the
          // snapshot carries the values to show in the CR.
          var det = (row.detail && row.detail.side === 'BID') ? row.detail : null;
          actions =
            '<div class="scw-bid-review-v2__cell-actions">' +
              '<button type="button" class="scw-bid-review__cell-action ' +
                'scw-bid-review__cell-action--add scw-bid-review-v2__cell-action" ' +
                crAttrs('cell_reinstate', row.id, pkgId, sowId) +
                ' data-bid-record-id="' + escapeHtml(row.id || '') + '"' +
                ' data-sow-item-id="' + escapeHtml(row.sowItem || '') + '"' +
                ' data-display-label="' + escapeHtml(row.displayLabel || '') + '"' +
                ' data-product-name="' + escapeHtml((det && det.product) || row.productName || '') + '"' +
                ' data-reinstate-qty="' + escapeHtml(det && det.qty != null ? det.qty : '') + '"' +
                ' data-reinstate-fee="' + escapeHtml(det && det.fee != null ? det.fee : '') + '"' +
                ' data-reinstate-desc="' + escapeHtml(ns.transform.stripHtml((det && det.desc) || '')) + '"' +
                '>+ Reinstate</button>' +
            '</div>';
        } else {
          // Prefill attrs: v1's handleAddToBid re-finds the row in v1's OWN
          // grid state to source the modal's SOW snapshot — but v1 DROPS rows
          // that are on no SOW and no bid (transform.js: `if (!hasBid && !hasSow)
          // continue`), which is exactly the "Removed — no longer on any SOW or
          // bid" rows this button appears on. Without the row v1 returned
          // silently ("+ Add to bid does nothing"). Emit the snapshot v2 already
          // has so v1 can synthesize the row from these attrs instead.
          var addDet = (row.detail && row.detail.side === 'SOW') ? row.detail : (row.detail || {});
          var addQty = (addDet.qty != null) ? addDet.qty
                     : (row.sowItemData && row.sowItemData.qty != null ? row.sowItemData.qty : '');
          var addFee = (addDet.fee != null) ? addDet.fee
                     : (row.sowItemData && row.sowItemData.fee != null ? row.sowItemData.fee : '');
          var addDesc = ns.transform.stripHtml(
            (addDet.desc || (row.sowItemData && row.sowItemData.laborDesc) || ''));
          actions =
            '<div class="scw-bid-review-v2__cell-actions">' +
              '<button type="button" class="scw-bid-review__cell-action ' +
                'scw-bid-review__cell-action--add scw-bid-review-v2__cell-action" ' +
                crAttrs('cell_add_to_bid', row.id, pkgId, sowId) +
                ' data-sow-item-id="' + escapeHtml(row.sowItem || '') + '"' +
                ' data-display-label="' + escapeHtml(row.displayLabel || '') + '"' +
                ' data-product-name="' + escapeHtml((addDet.product) || row.productName || '') + '"' +
                ' data-add-qty="' + escapeHtml(addQty != null ? addQty : '') + '"' +
                ' data-add-fee="' + escapeHtml(addFee != null ? addFee : '') + '"' +
                ' data-add-desc="' + escapeHtml(addDesc) + '"' +
                ' data-proposal-bucket="' + escapeHtml(row.proposalBucket || '') + '"' +
                ' data-proposal-bucket-id="' + escapeHtml(row.proposalBucketId || '') + '"' +
                ' data-sort-order="' + escapeHtml(row.sortOrder != null ? row.sortOrder : '') + '"' +
                ' data-mdf-idf="' + escapeHtml(row.mdfIdf || '') + '"' +
                ' data-mdf-idf-id="' + escapeHtml(row.mdfIdfId || '') + '"' +
                '>+ Add to bid</button>' +
          '</div>';
        }
      }
      td.innerHTML =
        '<span class="' + badgeCls + '">' + badge + '</span>' + detail + noteHtml + actions;
      appendPendingCard(td, pendingItem, row, pkg, sowId);
      return td;
    }

    var descTxt = ns.transform.stripHtml(cell.laborDesc || '');
    // Rich variant for display; stripped text stays for tooltips + diffs.
    var descRichBid = richTextHtml(cell.laborDesc || '');

    // Assumptions are free-text only — no product name, no qty/rate/ext.
    if (isAssumption) {
      td.classList.add('scw-bid-review-v2__cell--assumption');
      td.innerHTML = descTxt
        ? '<div class="scw-bid-review-v2__cell-desc" title="' +
            escapeHtml(descTxt) + '">' + descRichBid + '</div>'
        : '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      td.innerHTML += cellActionStack(row, pkgId, sowId, null, cell && cell.id);
      appendPendingCard(td, pendingItem, row, pkg, sowId);
      return td;
    }

    var qtyTxt  = cell.qty  ? String(cell.qty) : '—';
    var rateTxt = cell.rate ? fmtMoney(cell.rate) : '—';
    var extTxt  = cell.labor ? fmtMoney(cell.labor) : '—';
    // Ext (qty × rate) is only meaningful when the quantity can exceed 1.
    // When qty is 1 (or unset), Ext equals Rate — redundant, so hide it.
    var showExt = (Number(cell.qty) || 0) > 1;

    // Diff against the SOW line item (v1 parity). Flag the whole cell +
    // pinpoint the differing fields. The fee diff (SOW fee vs bid extended
    // total) lands on Ext when shown, else on the Sub Bid figure (qty≤1 →
    // Ext == Sub Bid).
    var diffs = ns.transform.getMismatches(row, cell);
    var DIFF = ' scw-bid-review-v2__field-diff';
    if (diffs && diffs.any) td.classList.add('scw-bid-review-v2__cell--mismatch');
    if (cell.dupes && cell.dupes.length) td.classList.add('scw-bid-review-v2__cell--dupe-bid');
    // Numeric fields (fee) still flag the whole value — there's no sub-token
    // to pinpoint. Text fields (product / desc) underline only the differing
    // WORDS via markWordDiff below, so they don't carry the whole-field pill.
    var feeOnExt = (diffs && diffs.fee && showExt) ? DIFF : '';
    var feeOnBid = (diffs && diffs.fee && !showExt) ? DIFF : '';
    // SOW counterparts for word-level diffing of the text fields. Desc basis
    // is the DISPLAYED SOW desc (sowItemData / field_2020) so the underlines
    // match the SOW column shown alongside, not the bid-snapshot field_2019.
    var sowProd  = (row.sowItemData && row.sowItemData.productName) || row.sowProduct || '';
    var sowDesc  = ns.transform.stripHtml(
      (row.sowItemData && row.sowItemData.laborDesc) || row.sowLaborDesc || '');
    var prodInner = (diffs && diffs.product)
      ? markWordDiff(cell.productName, sowProd) : escapeHtml(cell.productName);
    // Diff mode keeps the stripped word-diff (underline tokens need plain
    // text); otherwise show the rich formatting the record actually has.
    var descInner = (diffs && diffs.laborDesc)
      ? markWordDiff(descTxt, sowDesc) : descRichBid;
    // Hover hooks: hovering a differing field highlights its SOW-cell
    // counterpart (init.js wires the mouseover). Only the actually-
    // differing field carries the hook.
    var prodHover = (diffs && diffs.product)   ? ' data-scw-diff-field="product"' : '';
    var feeHover  = (diffs && diffs.fee)       ? ' data-scw-diff-field="fee"' : '';
    var descHover = (diffs && diffs.laborDesc) ? ' data-scw-diff-field="desc"' : '';
    var qtyDiff   = (diffs && diffs.qty) ? DIFF : '';
    var qtyHover  = (diffs && diffs.qty) ? ' data-scw-diff-field="qty"' : '';
    // Label drift — the bid record's copy of the display label (field_2365)
    // no longer matches the SOW line item's authoritative label (field_1950,
    // swapped onto row.displayLabel by the transform). Surface the bid's
    // stale label as a flagged line so the drift is visible instead of the
    // bid label silently winning the row title. Sourced from the SAME
    // getMismatches designator flag that flips diffs.any, so a designator
    // change also unlocks the Revise ▾ / Match SOW values menu.
    var labelDriftHtml = (diffs && diffs.designator)
      ? '<div class="scw-bid-review-v2__cell-conn scw-bid-review-v2__field-diff"' +
          ' data-scw-diff-field="label" title="Bid label: ' +
          escapeHtml(cell.label) + ' — SOW: ' + escapeHtml(row.displayLabel) + '">' +
          '<label>Label</label>' + escapeHtml(cell.label) +
        '</div>'
      : '';

    var primaryHtml =
      (cell.productName ?
        '<div class="scw-bid-review-v2__cell-product"' + prodHover + ' title="' +
          escapeHtml(cell.productName) + '">' +
          prodInner +
        '</div>' : '') +
      '<div class="scw-bid-review-v2__cell-numbers">' +
        '<span class="scw-bid-review-v2__cell-num' + qtyDiff + '"' + qtyHover +
          '><label>Qty</label>' + escapeHtml(qtyTxt) + '</span>' +
        '<span class="scw-bid-review-v2__cell-num' + feeOnBid + '"' + (showExt ? '' : feeHover) +
          '><label>Sub Bid</label>' + escapeHtml(rateTxt) + '</span>' +
        (showExt ?
          '<span class="scw-bid-review-v2__cell-num' + feeOnExt + '"' + feeHover +
            '><label>Ext</label>' + escapeHtml(extTxt) + '</span>' : '') +
      '</div>' +
      (descTxt ?
        '<div class="scw-bid-review-v2__cell-desc"' + descHover + ' title="' +
          escapeHtml(descTxt) + '">' + descInner +
        '</div>' : '') +
      connLineHtml(cell.connDevice, cell.connTo,
        { side: 'bid', deviceDiff: diffs && diffs.connDevice, toDiff: diffs && diffs.connTo }) +
      cablingLineHtml(cell, { side: 'bid', diffs: diffs }) +
      // Bid MDF/IDF — surfaced ONLY when the bid placed this item under a
      // different MDF/IDF than the SOW (the row's group). The row still sits in
      // its SOW MDF group; this line flags that the bid's location disagrees,
      // with both locations in the tooltip. Reuses the connection-line styling.
      ((diffs && diffs.mdfIdf) ?
        '<div class="scw-bid-review-v2__cell-conn scw-bid-review-v2__field-diff"' +
          ' data-scw-diff-field="mdfIdf" title="Bid MDF/IDF: ' +
          escapeHtml(cell.mdfIdf || '(none)') + ' — SOW: ' +
          escapeHtml((row.sowItemData && row.sowItemData.mdfIdf) || '(none)') + '">' +
          '<label>MDF&nbsp;/&nbsp;IDF</label>' +
          escapeHtml(cell.mdfIdf || '(none)') +
        '</div>' : '') +
      labelDriftHtml +
      // Survey note (field_2412) on the bid record — v1 parity: populated
      // cells render the sub's note too, not just the no-bid cutouts.
      surveyNoteHtml(cell.notes) +
      cellActionStack(row, pkgId, sowId, diffs, cell.id);

    // When 2+ bid line items on THIS bid map to the same SOW item, show
    // each stacked (they may differ in product / price / desc). The SOW
    // cell to the left is a single <td>, so it naturally spans the full
    // height of the stacked bid items. Each duplicate carries its own
    // Remove targeting that specific bid record (data-bid-record-id).
    if (cell.dupes && cell.dupes.length) {
      var blocks = ['<div class="scw-bid-review-v2__bid-item">' + primaryHtml + '</div>'];
      for (var di = 0; di < cell.dupes.length; di++) {
        blocks.push(stackedDupeHtml(cell.dupes[di], row, pkgId, sowId));
      }
      td.innerHTML = '<div class="scw-bid-review-v2__bid-stack">' + blocks.join('') + '</div>';
    } else {
      td.innerHTML = primaryHtml;
    }
    appendPendingCard(td, pendingItem, row, pkg, sowId);
    for (var dpc = 0; dpc < dupePendingItems.length; dpc++) {
      appendPendingCard(td, dupePendingItems[dpc], row, pkg, sowId);
    }
    return td;
  }

  // Append v1's pending-CR summary card (if any) into a cell + flag the cell
  // so it reads as "has a pending change". Clicking the card re-opens the CR
  // EDITOR (prefilled from the pending item — openChangeModal/openRemove detect
  // it via findPendingItem). The card had regressed into a row-expand trigger,
  // but expanding HIDES the data row + card + its × dismiss (init.js: "the data
  // row is hidden while expanded"), leaving the CR impossible to edit OR delete.
  // The card gets its OWN click handler that stops propagation before the click
  // reaches the row-expand document listener; the × dismiss keeps its own
  // handler (and stops propagation too, so it never triggers the editor).
  function appendPendingCard(td, pendingItem, row, pkg, sowId) {
    if (!pendingItem) return;
    var api = crApi();
    if (!api || !api.buildSummaryCard) return;
    try {
      var card = api.buildSummaryCard(pendingItem, pkg && pkg.id, pkg && pkg.label);
      if (!card) return;
      card.classList.add('scw-bid-review-v2__cell-cr-card');
      td.classList.add('scw-bid-review-v2__cell--has-cr');

      // Re-dispatch the pending item's own action to re-open its editor.
      var reAction = pendingItem.removeFromBid ? 'cell_remove_from_bid'
                   : pendingItem.reinstate     ? 'cell_reinstate'
                   : pendingItem.addToBid       ? 'cell_add_to_bid'
                   : 'cell_request_change';
      card.setAttribute('data-action', reAction);
      card.setAttribute('data-row-id', pendingItem.rowId || (row && row.id) || '');
      card.setAttribute('data-package-id', (pkg && pkg.id) || '');
      card.setAttribute('data-sow-id', sowId || '');
      // Carry the bid record id so re-opening the editor resolves the target
      // via resolveBidTarget's bid-record fallback — needed when the removal's
      // rowId is the cell's own record (off-SOW row) and doesn't match row.id.
      if (pendingItem.bidRecordId) {
        card.setAttribute('data-bid-record-id', pendingItem.bidRecordId);
      }
      // An add-to-bid item may sit on a "Removed" row that v1's grid drops
      // (`!hasBid && !hasSow`) — so handleAddToBid can't re-find it. Mirror the
      // "+ Add to bid" button's prefill attrs so it can synthesize the row and
      // still re-open the editor.
      if (pendingItem.addToBid) {
        var req = pendingItem.requested || {};
        card.setAttribute('data-display-label', pendingItem.displayLabel || (row && row.displayLabel) || '');
        card.setAttribute('data-product-name', req.productName || (row && row.productName) || '');
        card.setAttribute('data-add-qty', req.qty != null ? req.qty : '');
        card.setAttribute('data-add-fee', req.rate != null ? req.rate : '');
        card.setAttribute('data-add-desc', req.laborDesc || '');
        card.setAttribute('data-proposal-bucket', (row && row.proposalBucket) || '');
        card.setAttribute('data-proposal-bucket-id', (row && row.proposalBucketId) || '');
        card.setAttribute('data-sort-order', (row && row.sortOrder != null) ? row.sortOrder : '');
        card.setAttribute('data-mdf-idf', (row && row.mdfIdf) || '');
        card.setAttribute('data-mdf-idf-id', (row && row.mdfIdfId) || '');
      }
      card.addEventListener('click', function (e) {
        // The × dismiss button handles itself (and stops propagation).
        if (e.target && e.target.closest && e.target.closest('.scw-bid-cr-card__dismiss')) return;
        e.preventDefault();
        e.stopPropagation();   // don't let the row-expand listener also fire
        var v1 = window.SCW.bidReview;
        if (v1 && typeof v1.dispatchCRAction === 'function') v1.dispatchCRAction(card);
      });

      td.appendChild(card);
    } catch (e) { /* ignore */ }
  }

  function buildBidRow(row, packages, sowId) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__row';
    // Mismatch-state classes (v1 parity): on-SOW-not-on-bid and
    // on-bid-not-on-SOW. Styling lives in styles.js.
    if (row.noBid)       tr.classList.add('scw-bid-review-v2__row--no-bid');
    if (row.surveyNoBid) tr.classList.add('scw-bid-review-v2__row--survey-no-bid');
    if (row.offSow)      tr.classList.add('scw-bid-review-v2__row--off-sow');
    if (row.removed)     tr.classList.add('scw-bid-review-v2__row--removed');
    if (row.isAccessory) tr.classList.add('scw-bid-review-v2__row--accessory');
    // EVERY data row is expandable — including rows whose bid item points at
    // NO SOW item (off-SOW / orphaned bids). Those used to be dead rows, which
    // made the panel-only Re-link button unreachable for exactly the records
    // that most need re-pointing. The panel mounts the SOW editor only when a
    // SOW record exists; otherwise it shows the bid cards + a re-link hint.
    tr.classList.add('scw-bid-review-v2__row--expandable');
    tr.setAttribute('data-row-id', row.id);
    if (row.sowItem) tr.setAttribute('data-sow-item-id', row.sowItem);
    tr.setAttribute('aria-expanded', 'false');

    // Label column — only show displayLabel (E-001, etc.) for cam/reader
    // rows. Everything else (networking, services, assumptions) is
    // identified by product name only, in the bid cell columns.
    var labelTd = document.createElement('td');
    labelTd.className = 'scw-bid-review-v2__row-label-cell';
    // Expand caret — kept as a direct child of the <td> (absolutely
    // positioned) so the cell stays a table-cell and its background spans
    // the full row height. The stacked content lives in an inner flex div.
    var caretHtml =
      '<span class="scw-bid-review-v2__row-caret" aria-hidden="true">' +
        GROUP_CHEVRON_SVG + '</span>';
    var labelHtml = '';
    // Bulk-select checkbox — keyed on the SOW line-item id so the shared
    // worksheet-v2 bulk module (mounted on the SOW view) drives selection
    // + the floating edit/delete toolbar. Only for rows backed by a SOW
    // item (the editable record).
    if (row.sowItem) {
      labelHtml +=
        '<input type="checkbox" class="scw-br-v2-rowselect" ' +
        'data-scw-ws-v2-select="' + escapeHtml(row.sowItem) + '" ' +
        'aria-label="Select line item">';
    }
    if (isCamReader(row) && row.displayLabel) {
      labelHtml +=
        '<div class="scw-bid-review-v2__row-label">' +
          escapeHtml(row.displayLabel) + '</div>';
    }
    // Per-row SOW totals — Equipment Total above Install Fee, mirroring
    // v1's leftmost column. Read from the SOW item snapshot.
    var sd = row.sowItemData;
    if (sd && (sd.equipmentTotal || sd.installFee)) {
      labelHtml += '<div class="scw-bid-review-v2__row-totals">';
      if (sd.equipmentTotal) {
        labelHtml +=
          '<div class="scw-bid-review-v2__row-total scw-bid-review-v2__row-total--equip">' +
            '<span class="scw-bid-review-v2__row-total-label">Equip</span>' +
            '<span class="scw-bid-review-v2__row-total-value">' +
              escapeHtml(fmtMoney(sd.equipmentTotal)) + '</span>' +
          '</div>';
      }
      if (sd.installFee) {
        labelHtml +=
          '<div class="scw-bid-review-v2__row-total scw-bid-review-v2__row-total--install">' +
            '<span class="scw-bid-review-v2__row-total-label">Install</span>' +
            '<span class="scw-bid-review-v2__row-total-value">' +
              escapeHtml(fmtMoney(sd.installFee)) + '</span>' +
          '</div>';
      }
      labelHtml += '</div>';
    }
    labelTd.innerHTML = caretHtml +
      '<div class="scw-bid-review-v2__row-label-inner">' + labelHtml + '</div>';
    tr.appendChild(labelTd);

    // Photos column — one big thumb + "+N more"; click opens the
    // expand panel with a side-by-side viewer (v1 parity).
    tr.appendChild(buildPhotosCell(row));

    var assumption = isAssumption(row);

    // SOW item column — anchors the row, always second from left.
    tr.appendChild(buildSowCell(row, assumption, sowId));

    // One cell per bid package
    for (var p = 0; p < packages.length; p++) {
      var pkg = packages[p];
      var cell = row.cellsByPackage[pkg.id] || null;
      tr.appendChild(buildBidCell(cell, row, pkg, sowId, assumption));
    }
    return tr;
  }

  // Every SOW item id under an MDF/IDF group (direct rows + subgroup rows).
  function collectGroupSowIds(group) {
    var ids = [];
    function add(rows) {
      for (var i = 0; rows && i < rows.length; i++) {
        if (rows[i] && rows[i].sowItem) ids.push(rows[i].sowItem);
      }
    }
    add(group && group.rows);
    var subs = (group && group.subgroups) || [];
    for (var s = 0; s < subs.length; s++) add(subs[s].rows);
    return ids;
  }

  // Every SOW item id across an entire SOW grid (all groups).
  function collectSowItemIds(grid) {
    var ids = [];
    var groups = (grid && grid.groups) || [];
    for (var g = 0; g < groups.length; g++) {
      var gi = collectGroupSowIds(groups[g]);
      for (var k = 0; k < gi.length; k++) ids.push(gi[k]);
    }
    if (!ids.length && grid && grid.rows) {
      for (var r = 0; r < grid.rows.length; r++) {
        if (grid.rows[r] && grid.rows[r].sowItem) ids.push(grid.rows[r].sowItem);
      }
    }
    return ids;
  }

  function buildL1HeaderRow(group, colspan) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__group-header';
    if (group.otherBidItems) tr.className += ' scw-bid-review-v2__group-header--other';
    if (group.bidOnlyItems)  tr.className += ' scw-bid-review-v2__group-header--bid-only';
    if (group.removedItems)  tr.className += ' scw-bid-review-v2__group-header--removed';
    if (group.defaultCollapsed) tr.className += ' scw-bid-review-v2__group-header--collapsed';
    tr.setAttribute('data-l1-id', group.key);
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-expanded', group.defaultCollapsed ? 'false' : 'true');
    var td = document.createElement('td');
    td.colSpan = colspan;
    var rowCount =
      (group.rows ? group.rows.length : 0) +
      (group.subgroups || []).reduce(function (a, s) { return a + s.rows.length; }, 0);
    // Aggregate issue chips across every SOW item in this MDF/IDF group.
    var sowIds = collectGroupSowIds(group);
    var summaryChips = (ns.warnings && typeof ns.warnings.summaryChipsHtml === 'function')
      ? ns.warnings.summaryChipsHtml(sowIds) : '';
    // Manage gear — only for real MDF/IDF groups (synthetic groups like
    // "Other bid items" have no location record to edit). Click handled by
    // mdf-manage.js (capture phase, so the header collapse toggle doesn't fire).
    var manageBtn = (group.mdfIdfId || group.label) &&
        !group.otherBidItems && !group.bidOnlyItems && !group.removedItems
      ? '<button type="button" class="scw-brv2-mdf-gear" ' +
          'data-scw-mdf-manage="' + escapeHtml(group.mdfIdfId || '') + '" ' +
          'data-scw-mdf-label="' + escapeHtml(group.label || '') + '" ' +
          'title="Manage this MDF/IDF location">' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
            '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
        '</button>'
      : '';
    td.innerHTML =
      '<div class="scw-bid-review-v2__grp-inner">' +
        '<span class="scw-bid-review-v2__grp-chevron">' + GROUP_CHEVRON_SVG + '</span>' +
        manageBtn +
        // The computed display name ("TYPE: ## : name") leaves a stray
        // "TYPE: :" when the ## segment is blank — collapse it for display
        // only (data-scw-mdf-label above keeps the raw label for matching).
        '<span class="scw-bid-review-v2__grp-title">' +
          escapeHtml(String(group.label || '').replace(/:\s*:/g, ':')) + '</span>' +
        summaryChips +
        '<span class="scw-bid-review-v2__grp-count">' + rowCount + '</span>' +
      '</div>';
    tr.appendChild(td);
    return tr;
  }

  function buildL2HeaderRow(sub, colspan) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__subgroup-header';
    if (sub.removedItems)     tr.className += ' scw-bid-review-v2__subgroup-header--removed';
    if (sub.defaultCollapsed) tr.className += ' scw-bid-review-v2__subgroup-header--collapsed';
    // Collapsible: the chevron + click handler (init.js) fold this
    // subgroup independently of its parent L1.
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-expanded', sub.defaultCollapsed ? 'false' : 'true');
    tr.setAttribute('data-subgroup-key', sub.key || '');
    var td = document.createElement('td');
    td.colSpan = colspan;
    td.innerHTML =
      '<div class="scw-bid-review-v2__subgrp-inner">' +
        '<span class="scw-bid-review-v2__subgrp-chevron">' + GROUP_CHEVRON_SVG + '</span>' +
        '<span class="scw-bid-review-v2__subgrp-title">' + escapeHtml(sub.label) + '</span>' +
        '<span class="scw-bid-review-v2__subgrp-count">' + sub.rows.length + '</span>' +
      '</div>';
    tr.appendChild(td);
    return tr;
  }

  // ── L1 survey-notes callout (ported from v1) ─────────────────
  // MDF/IDF-level survey notes (field_2457 on view_3822) are the most
  // actionable thing the surveyor leaves; v1 promotes them to an amber
  // callout under each L1 group header. Scraped from the live view_3822
  // DOM, keyed by the group's mdfIdfId. Null when the source row is
  // missing or the field is empty (no callout = no clutter).
  var SURVEY_NOTES_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="9" y1="13" x2="15" y2="13"/>' +
    '<line x1="9" y1="17" x2="15" y2="17"/></svg>';

  function readSourceFieldText(sourceTr, fieldKey) {
    if (!sourceTr) return '';
    // Mirror v1's readRowFieldText: match the cell by CLASS or by
    // data-field-key (some views render the td with only the field class,
    // no data-field-key attr), and read the inner span.col-N when present.
    var td = sourceTr.querySelector('td.' + fieldKey +
      ', td[data-field-key="' + fieldKey + '"]');
    if (td) {
      var sp = td.querySelector('span.col-1, span[class^="col-"]');
      return ((sp || td).textContent || '').replace(/ /g, ' ').trim();
    }
    var cells = sourceTr.getElementsByTagName('td');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute('data-field-key') === fieldKey) {
        return (cells[i].textContent || '').replace(/ /g, ' ').trim();
      }
    }
    return '';
  }

  // Find the view_3822 source row for an MDF/IDF group. Prefer the record
  // id (fast, exact); fall back to matching the group's L1 label against a
  // row's text when the id is missing — connectionId() returns '' for
  // records lacking a *_raw connection array even though connectionLabel()
  // still resolves a label from the formatted value, so a group can have a
  // label but an empty mdfIdfId.
  function findMdfIdfSourceRow(view, mdfIdfId, label) {
    if (!view) return null;
    if (mdfIdfId) {
      var byId = view.querySelector('tbody tr[id="' + mdfIdfId + '"]');
      if (byId) return byId;
    }
    if (!label) return null;
    var target = String(label).replace(/\s+/g, ' ').trim().toLowerCase();
    if (!target) return null;
    var rows = view.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].getElementsByTagName('td');
      for (var c = 0; c < cells.length; c++) {
        var t = (cells[c].textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (t === target) return rows[i];
      }
    }
    return null;
  }

  // Resolve survey-notes text (field_2457) for an MDF/IDF group from the
  // Knack model records of view_3822 (a v2 source view, so its Backbone
  // model is in memory with field_2457_raw + the field_1642 label — even
  // when those columns aren't rendered in the DOM). Match by record id,
  // then by label. Falls back to v1's API-loaded records. Returns ''.
  function stripTags(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function notesFromRecord(rec) {
    if (!rec) return '';
    return stripTags(rec.field_2457_raw != null ? rec.field_2457_raw : rec.field_2457);
  }
  function notesFromModel(mdfIdfId, label) {
    var recs = [];
    try {
      if (ns.data && ns.data.readRecords) {
        var viewKey = (window.SCW.bidReview && window.SCW.bidReview.CONFIG &&
          window.SCW.bidReview.CONFIG.mdfIdfViewKey) || 'view_3822';
        recs = ns.data.readRecords(viewKey) || [];
      }
    } catch (e) { recs = []; }
    // Fall back to v1's API-loaded records if the model read came up empty.
    if (!recs.length) {
      var v1 = window.SCW.bidReview;
      if (v1 && typeof v1.getMdfIdfRecords === 'function') recs = v1.getMdfIdfRecords() || [];
    }
    if (!recs.length) return '';
    var target = label ? stripTags(label).toLowerCase() : '';
    var byLabel = null;
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      if (mdfIdfId && rec.id === mdfIdfId) return notesFromRecord(rec);
      if (target && !byLabel) {
        var lbl = stripTags(rec.field_1642).toLowerCase();
        if (lbl && lbl === target) byLabel = rec;
      }
    }
    return byLabel ? notesFromRecord(byLabel) : '';
  }

  function buildL1SurveyNotesRow(group, colspan) {
    var dbg = !!(window.SCW.bidReview && window.SCW.bidReview.CONFIG &&
      window.SCW.bidReview.CONFIG.debug);
    var mdfIdfId = group && group.mdfIdfId;
    var label    = group && group.label;
    if (!mdfIdfId && !label) {
      if (dbg) console.log('[scw-br-v2] survey-notes: no mdfIdfId or label on group');
      return null;
    }
    // Primary source: the in-memory view_3822 model records.
    var txt = notesFromModel(mdfIdfId, label);
    // Last resort: scrape the live view_3822 DOM (only works if field_2457
    // is a rendered column).
    if (!txt) {
      var viewKey = (window.SCW.bidReview && window.SCW.bidReview.CONFIG &&
        window.SCW.bidReview.CONFIG.mdfIdfViewKey) || 'view_3822';
      var view = document.getElementById(viewKey);
      var src  = findMdfIdfSourceRow(view, mdfIdfId, label);
      if (src) txt = readSourceFieldText(src, 'field_2457');
    }
    if (dbg) console.log('[scw-br-v2] survey-notes:', {
      mdfIdfId: mdfIdfId, label: label, len: txt ? txt.length : 0, txt: txt });
    if (!txt) return null;

    var tr = document.createElement('tr');
    // Tag as a __row so the L1 collapse toggle (init.js) hides it with
    // the rest of the group.
    tr.className = 'scw-bid-review-v2__row scw-bid-review-v2__l1-survey-notes-row';
    var td = document.createElement('td');
    td.colSpan = colspan;
    td.className = 'scw-bid-review-v2__l1-survey-notes-cell';
    td.innerHTML =
      '<div class="scw-bid-review-v2__l1-survey-notes-wrap">' +
        '<span class="scw-bid-review-v2__l1-survey-notes-icon">' + SURVEY_NOTES_SVG + '</span>' +
        '<div class="scw-bid-review-v2__l1-survey-notes-body">' +
          '<div class="scw-bid-review-v2__l1-survey-notes-label">Survey Notes</div>' +
          '<div class="scw-bid-review-v2__l1-survey-notes-text">' + escapeHtml(txt) + '</div>' +
        '</div>' +
      '</div>';
    tr.appendChild(td);
    return tr;
  }

  // ── L1 detail row: photos + SCW Notes (ported from v1) ───────
  // Mirrors v1's buildL1DetailRow. Surfaces the MDF/IDF record's
  // field_771 photos and field_1643 SCW notes (the survey-notes
  // field_2457 is handled separately above with more weight) so the
  // reviewer sees each headend's reference photos in the same place
  // view_3577 displays them. Source row is the live (hidden) view_3822
  // DOM, located by record id with a label fallback — same lookup the
  // survey-notes callout uses. Returns null when there's nothing to show
  // so groups with no MDF photos/notes don't get an empty band.
  function buildL1PhotosRow(group, colspan) {
    var mdfIdfId = group && group.mdfIdfId;
    var label    = group && group.label;
    if (!mdfIdfId && !label) return null;

    var viewKey = (window.SCW.bidReview && window.SCW.bidReview.CONFIG &&
      window.SCW.bidReview.CONFIG.mdfIdfViewKey) || 'view_3822';
    var view = document.getElementById(viewKey);
    var sourceTr = findMdfIdfSourceRow(view, mdfIdfId, label);
    if (!sourceTr) return null;

    var wrap = document.createElement('div');
    wrap.className = 'scw-bid-review-v2__l1-detail-wrap';

    // Photos (field_771) — gallery thumb strip. Each connection-value
    // span carries an <img data-kn-img-gallery> with the full-size URL;
    // surface that as the click-through target (opens full image in a
    // new tab) and as the thumb src. The span's id is the connected
    // DOC_photos record's id — kept so each thumb can carry a delete button
    // (see mdf-manage.js's delegated [data-scw-mdf-photo-del] handler).
    var photoCell = sourceTr.querySelector(
      'td.field_771, td[data-field-key="field_771"]');
    var photos = [];
    if (photoCell) {
      var imgSpans = photoCell.querySelectorAll(
        'span[id][data-kn="connection-value"]');
      for (var si = 0; si < imgSpans.length; si++) {
        var img = imgSpans[si].querySelector('img[data-kn-img-gallery], img');
        if (!img) continue;
        var url = img.getAttribute('data-kn-img-gallery') ||
                  img.getAttribute('src') || '';
        if (url) photos.push({ id: (imgSpans[si].id || '').trim(), url: url });
      }
    }
    // Render the Photos section whenever there are photos OR the group has
    // a real location record to attach photos to — the "+ Add" tile keeps
    // upload one click away right where the photos live.
    if (photos.length || mdfIdfId) {
      var photoSection = document.createElement('div');
      photoSection.className = 'scw-bid-review-v2__l1-detail-section';
      var pLabel = document.createElement('div');
      pLabel.className = 'scw-bid-review-v2__l1-detail-label';
      pLabel.textContent = 'Photos';
      photoSection.appendChild(pLabel);
      var photoStrip = document.createElement('div');
      photoStrip.className = 'scw-bid-review-v2__l1-detail-photos';
      for (var pi = 0; pi < photos.length; pi++) {
        var a = document.createElement('a');
        a.href = photos[pi].url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'scw-bid-review-v2__l1-detail-photo';
        var thumb = document.createElement('img');
        thumb.src = photos[pi].url;
        thumb.alt = '';
        thumb.loading = 'lazy';
        a.appendChild(thumb);
        if (photos[pi].id) {
          var delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'scw-bid-review-v2__l1-detail-photo-del';
          delBtn.setAttribute('data-scw-mdf-photo-del', photos[pi].id);
          delBtn.title = 'Delete photo';
          delBtn.innerHTML =
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
            'stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline>' +
            '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
            '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
            '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>';
          a.appendChild(delBtn);
        }
        photoStrip.appendChild(a);
      }
      if (mdfIdfId) {
        var addTile = document.createElement('button');
        addTile.type = 'button';
        addTile.className = 'scw-brv2-mdf-addphoto';
        addTile.setAttribute('data-scw-mdf-addphoto', mdfIdfId);
        addTile.setAttribute('data-mdf-label', label || '');
        addTile.title = 'Add photos to this MDF/IDF location';
        addTile.innerHTML =
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
          'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.8"/>' +
          '<path d="M21 16l-5-5-9 9"/></svg><span>+ Add</span>';
        photoStrip.appendChild(addTile);
      }
      photoSection.appendChild(photoStrip);
      wrap.appendChild(photoSection);
    }

    // SCW Notes (field_1643).
    var scwText = readSourceFieldText(sourceTr, 'field_1643');
    if (scwText) {
      var s2 = document.createElement('div');
      s2.className = 'scw-bid-review-v2__l1-detail-section';
      var sLabel = document.createElement('div');
      sLabel.className = 'scw-bid-review-v2__l1-detail-label';
      sLabel.textContent = 'SCW Notes';
      s2.appendChild(sLabel);
      var sText = document.createElement('div');
      sText.className = 'scw-bid-review-v2__l1-detail-text';
      sText.textContent = scwText;
      s2.appendChild(sText);
      wrap.appendChild(s2);
    }

    if (!wrap.children.length) return null;

    var tr = document.createElement('tr');
    // Tag as a __row so the L1 collapse toggle (init.js) folds it with
    // the rest of the group, same as the survey-notes callout above.
    tr.className = 'scw-bid-review-v2__row scw-bid-review-v2__l1-detail-row';
    var td = document.createElement('td');
    td.colSpan = colspan;
    td.className = 'scw-bid-review-v2__l1-detail-cell';
    td.appendChild(wrap);
    tr.appendChild(td);
    return tr;
  }

  function appendGroup(tbody, group, packages, colspan, sowId) {
    // Default-collapsed groups (e.g. "Removed items") render their rows
    // pre-hidden; the L1 collapse toggle in init.js flips them back.
    var hide = !!group.defaultCollapsed;
    function addRow(tr) {
      if (hide) {
        tr.classList.add('scw-bid-review-v2__row--hidden');
        tr.classList.add('scw-bid-review-v2__subgroup-header--hidden');
      }
      tbody.appendChild(tr);
    }
    // Level 0 means "flat" — no MDF/IDF on any row, just render rows.
    if (group.level === 1) {
      tbody.appendChild(buildL1HeaderRow(group, colspan));
      // MDF/IDF survey-notes callout immediately under the L1 header.
      var snRow = buildL1SurveyNotesRow(group, colspan);
      if (snRow) addRow(snRow);
      // MDF/IDF photos + SCW notes detail row (same data view_3577 shows).
      var phRow = buildL1PhotosRow(group, colspan);
      if (phRow) addRow(phRow);
    }
    // Direct rows (when there are no subgroups).
    for (var i = 0; i < group.rows.length; i++) {
      addRow(buildBidRow(group.rows[i], packages, sowId));
    }
    // Subgroups (e.g. the per-location "Removed" subgroup). The header
    // follows the L1's hide state; its rows are additionally hidden when
    // the subgroup is default-collapsed, and tagged --in-subgroup so the
    // collapse handlers in init.js can fold them independently.
    var subs = group.subgroups || [];
    for (var s = 0; s < subs.length; s++) {
      var sub = subs[s];
      addRow(buildL2HeaderRow(sub, colspan));
      var subHidden = hide || !!sub.defaultCollapsed;
      for (var sr = 0; sr < sub.rows.length; sr++) {
        var subRow = buildBidRow(sub.rows[sr], packages, sowId);
        subRow.classList.add('scw-bid-review-v2__row--in-subgroup');
        if (subHidden) subRow.classList.add('scw-bid-review-v2__row--hidden');
        tbody.appendChild(subRow);
      }
    }
  }

  // One labelled money figure in a column header (Sub Bid / Install).
  function headTotal(label, amount) {
    return '<div class="scw-bid-review-v2__head-total">' +
      '<span class="scw-bid-review-v2__head-total-label">' + escapeHtml(label) + '</span>' +
      '<span class="scw-bid-review-v2__head-total-value">' +
        escapeHtml(fmtMoney(amount) || '$0.00') + '</span>' +
    '</div>';
  }

  // ── Per-column header cells, one per header band ──────────────────
  // The header is built as four aligned <tr> bands (title / totals /
  // details / actions) so the SOW column and every bid column line up
  // horizontally row-for-row. Each builder returns one <th> for a band.

  function pkgTh(pkg, bandCls, inner) {
    return '<th class="scw-bid-review-v2__th scw-bid-review-v2__head--pkg ' +
        'scw-bid-review-v2__pkg-col ' + bandCls + '" data-pkg-id="' +
        escapeHtml(pkg.id) + '">' + inner + '</th>';
  }

  function pkgTitleCell(pkg, sowId, idx) {
    var pair = escapeHtml((sowId || '') + '::' + (pkg.id || ''));
    var label = 'Bid ' + ((idx || 0) + 1);
    // Collapse handle (»), an expand handle («) shown only while collapsed,
    // and the title. Wired by column-collapse.js via the data-* attrs.
    var controls =
      '<button type="button" class="scw-bid-review-v2__pkg-collapse-btn" ' +
        'data-scw-br-v2-colcollapse="' + pair + '" title="Collapse this bid column" ' +
        'aria-label="Collapse bid column">&raquo;</button>' +
      '<button type="button" class="scw-bid-review-v2__pkg-expand" ' +
        'data-scw-br-v2-colexpand="' + pair + '" title="Expand ' + label + '" ' +
        'aria-label="Expand bid column">' +
        '<span class="scw-bid-review-v2__pkg-expand-icon">&laquo;</span>' +
        '<span class="scw-bid-review-v2__pkg-expand-label">' + label + '</span>' +
      '</button>';
    return pkgTh(pkg, 'scw-bid-review-v2__head-cell--title',
      controls + '<div class="scw-bid-review-v2__head-title">Subcontractor Bid</div>');
  }

  function pkgTotalsCell(pkg) {
    var delta;
    if (pkg.matchesSow) {
      delta = '<div class="scw-bid-review-v2__head-delta scw-bid-review-v2__head-delta--match">' +
        '✓ matches SOW</div>';
    } else {
      var sign = pkg.deltaVsSow > 0 ? '+' : '−';
      delta = '<div class="scw-bid-review-v2__head-delta scw-bid-review-v2__head-delta--gap">' +
        sign + (fmtMoney(Math.abs(pkg.deltaVsSow)) || '$0.00') + ' vs SOW</div>';
    }
    return pkgTh(pkg, 'scw-bid-review-v2__head-cell--totals',
      '<div class="scw-bid-review-v2__head-totals">' +
        headTotal('Sub Bid', pkg.subBidTotal) +
      '</div>' + delta);
  }

  function pkgDetailsCell(pkg, sowId) {
    // Bid Name (field_2636) FIRST, with a label above it — mirrors the
    // "SOW Name" label/value at the top of the SOW details band so the two
    // columns' details line up vertically. Always rendered (placeholder
    // when empty) to keep the band height consistent across columns.
    var nameBlock =
      '<div class="scw-bid-review-v2__head-name">' +
        '<span class="scw-bid-review-v2__head-name-label">Bid Name</span>' +
        '<span class="scw-bid-review-v2__head-name-value">' +
          escapeHtml(pkg.bidName || '—') + '</span>' +
      '</div>';
    // PDF link (field_2626) — icon beside the bid label (BD-#).
    var pdfLink = pkg.pdfUrl
      ? '<a class="scw-bid-review-v2__pdf-link" href="' + escapeHtml(pkg.pdfUrl) + '" ' +
          'target="_blank" rel="noopener" title="' +
          escapeHtml(pkg.pdfFilename || 'View PDF') + '">' + PDF_SVG + '</a>'
      : '';
    // Status badge (field_2550).
    var statusBadge = pkg.bidStatus
      ? '<span class="scw-bid-review-v2__status-badge" data-status="' +
          escapeHtml(pkg.bidStatus.toLowerCase().replace(/\s+/g, '-')) + '">' +
          escapeHtml(pkg.bidStatus) + '</span>'
      : '';
    // Reopen Bid lives WITH the status (it's a bid-state action), directly
    // under the badge — separated from the SOW / CR action groups below.
    var isSubmitted = /^submitted$/i.test(String(pkg.bidStatus || '').trim());
    var reopenBtn = isSubmitted
      ? '<button type="button" class="scw-bid-review__btn scw-bid-review__btn--reopen ' +
          'scw-bid-review-v2__head-btn scw-bid-review-v2__head-btn--reopen-inline" ' +
          'data-action="package_reopen_bid" ' +
          'data-package-id="' + escapeHtml(pkg.id) + '" ' +
          'data-sow-id="' + escapeHtml(sowId || '') + '">Reopen Bid</button>'
      : '';
    return pkgTh(pkg, 'scw-bid-review-v2__head-cell--details',
      nameBlock +
      '<div class="scw-bid-review-v2__head-subtitle">' +
        '<span class="scw-bid-review-v2__head-pkg-label">' + escapeHtml(pkg.label) + '</span>' +
        pdfLink +
      '</div>' +
      ((statusBadge || reopenBtn)
        ? '<div class="scw-bid-review-v2__head-statusline">' + statusBadge + reopenBtn + '</div>'
        : ''));
  }

  function pkgActionsCell(pkg, sowId) {
    // Actions are grouped into two clearly-labelled categories so they don't
    // read as one undifferentiated stack:
    //   • SOW  — Create new SOW / Update SOW to match Bid
    //   • Change Requests — Request Change on Selected + Submit / Clear
    // (Reopen Bid — a BID-state action — moved up under the status badge.)
    // Reuse v1's handlers via SCW.bidReview.dispatchHeaderAction; buttons keep
    // the v1 data-* attrs + .scw-bid-review__btn classes v1's setBusy expects.
    var isSubmitted = /^submitted$/i.test(String(pkg.bidStatus || '').trim());
    // SOW-adoption actions (Create new SOW / Update SOW to match Bid) stay
    // gated to submitted bids (or the no-SOW grid) — you don't build a SOW off
    // an in-progress draft. The no-SOW grid surfaces draft / in-progress bids,
    // so it shows those there regardless of submitted status.
    var showActions = isSubmitted || isNoSowGrid(sowId);
    // Change Requests, however, ARE available on DRAFT bids — a reviewer may
    // want to request changes before the sub formally submits. Decoupled from
    // showActions so the CR group + bulk button render regardless of status.
    var allowCr = true;

    var sowGroup = '';
    if (showActions) {
      sowGroup =
        '<div class="scw-bid-review-v2__head-group scw-bid-review-v2__head-group--sow">' +
          '<div class="scw-bid-review-v2__head-group-label">SOW</div>' +
          // No-SOW grid: there's no SOW to "update to match", so show only
          // "+ Create new SOW" and hide "Update SOW to match Bid". Real grids
          // show both.
          headBtn('+ Create new SOW', 'create', 'package_create_sow', pkg.id, sowId) +
          (isNoSowGrid(sowId) ? '' :
            headBtn('← Update SOW to match Bid', 'adopt', 'package_copy_to_sow', pkg.id, sowId)) +
        '</div>';
    }

    // Pending change-request controls — Submit (N) + Clear All, shown when
    // this package has pending CRs.
    var api = crApi();
    var pending = (api && api.getPending) ? (api.getPending() || {}) : {};
    var bucket = pending[pkg.id];
    var crCount = (bucket && bucket.items) ? bucket.items.length : 0;

    var crGroup = '';
    if (allowCr || crCount) {
      var bulkBtn = allowCr
        ? '<button type="button" class="scw-bid-review__btn scw-bid-review-v2__head-btn ' +
            'scw-bid-review-v2__head-btn--cr-bulk" data-action="cr_bulk_selected" ' +
            'data-pkg-id="' + escapeHtml(pkg.id) + '" data-package-id="' + escapeHtml(pkg.id) + '" ' +
            'data-pkg-name="' + escapeHtml(pkg.label || '') + '" ' +
            'data-sow-id="' + escapeHtml(sowId || '') + '" ' +
            'title="Request the same change on all selected line items for this bid">' +
            'Request Change on Selected</button>'
        : '';
      var pendingBtns = crCount
        ? '<button type="button" class="scw-bid-review__btn scw-bid-review-v2__head-btn ' +
            'scw-bid-review-v2__head-btn--cr-preview" data-action="cr_preview" ' +
            'data-pkg-id="' + escapeHtml(pkg.id) + '" ' +
            'title="Preview exactly what will be sent to the subcontractor">' +
            'Preview</button>' +
          '<button type="button" class="scw-bid-review__btn scw-bid-review-v2__head-btn ' +
            'scw-bid-review-v2__head-btn--cr-submit" data-action="cr_submit" ' +
            'data-pkg-id="' + escapeHtml(pkg.id) + '">Submit Change Request (' + crCount + ')</button>' +
          '<button type="button" class="scw-bid-review__btn scw-bid-review-v2__head-btn ' +
            'scw-bid-review-v2__head-btn--cr-clear" data-action="cr_clear_all">Clear All</button>'
        : '';
      crGroup =
        '<div class="scw-bid-review-v2__head-group scw-bid-review-v2__head-group--cr">' +
          '<div class="scw-bid-review-v2__head-group-label">Change Requests' +
            (crCount ? ' <span class="scw-bid-review-v2__head-group-count">' + crCount + '</span>' : '') +
          '</div>' +
          bulkBtn + pendingBtns +
        '</div>';
    }

    return pkgTh(pkg, 'scw-bid-review-v2__head-cell--actions', sowGroup + crGroup);
  }

  // A header action button — v1-compatible classes + data attrs so
  // SCW.bidReview.dispatchHeaderAction can route it to v1's handler.
  function headBtn(label, mod, action, pkgId, sowId) {
    return '<button type="button" ' +
      'class="scw-bid-review__btn scw-bid-review__btn--' + mod +
        ' scw-bid-review-v2__head-btn" ' +
      'data-action="' + escapeHtml(action) + '" ' +
      'data-package-id="' + escapeHtml(pkgId) + '" ' +
      'data-sow-id="' + escapeHtml(sowId || '') + '">' +
      escapeHtml(label) +
    '</button>';
  }

  // ── Per-SOW collapse persistence ─────────────────────────────
  function sowCollapseScene() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function sowCollapseKey(sowId) {
    return 'scw:br-v2:sow-collapse:' + sowCollapseScene() + ':' + sowId;
  }
  function isSowCollapsed(sowId) {
    try { return localStorage.getItem(sowCollapseKey(sowId)) === '1'; }
    catch (e) { return false; }
  }

  var SOW_CARET =
    '<svg class="scw-bid-review-v2__sow-caret" viewBox="0 0 24 24" width="14" height="14" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  function buildSowSection(grid) {
    var section = document.createElement('section');
    section.className = 'scw-bid-review-v2__sow';
    section.setAttribute('data-sow-id', grid.sowId);
    var collapsed = isSowCollapsed(grid.sowId);
    if (collapsed) section.classList.add('scw-bid-review-v2__sow--collapsed');

    var header = document.createElement('header');
    header.className = 'scw-bid-review-v2__sow-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    // Aggregate issue chips across every SOW item in this SOW.
    var sowWarn = (ns.warnings && typeof ns.warnings.summaryChipsHtml === 'function')
      ? ns.warnings.summaryChipsHtml(collectSowItemIds(grid)) : '';
    // Friendly SOW name (field_2126) beside the SOW # — same source as v1's
    // header. Skipped when unset or identical to the SOW # so it never just
    // echoes the number.
    var v1r = window.SCW && window.SCW.bidReview;
    var friendly = (v1r && typeof v1r.sowFriendlyName === 'function')
      ? v1r.sowFriendlyName(grid.sowId) : '';
    var friendlyHtml = (friendly && friendly !== grid.sowName)
      ? '<span class="scw-bid-review-v2__sow-friendly" title="' + escapeHtml(friendly) + '">' +
          escapeHtml(friendly) + '</span>'
      : '';
    header.innerHTML =
      SOW_CARET +
      '<span class="scw-bid-review-v2__sow-name">' + escapeHtml(grid.sowName) + '</span>' +
      friendlyHtml +
      sowWarn +
      '<span class="scw-bid-review-v2__sow-meta">' +
        grid.rows.length + ' line item' + (grid.rows.length === 1 ? '' : 's') +
        ' × ' + grid.packages.length + ' bid' + (grid.packages.length === 1 ? '' : 's') +
      '</span>' +
      // Per-SOW expand/collapse-all of the MDF/IDF groups within this SOW.
      '<button type="button" class="scw-bid-review-v2__sow-groups-toggle" ' +
        'data-scw-br-v2-sow-groups title="Expand or collapse all groups in this SOW">' +
        'Collapse all</button>';
    section.appendChild(header);

    var table = document.createElement('table');
    table.className = 'scw-bid-review-v2__table';

    // Column headers — four aligned bands so SOW + bid columns line up
    // row-for-row: title / totals / details / actions. Line-item + Photos
    // columns span all four bands (rowspan).
    var thead = document.createElement('thead');
    var totals = grid.sowTotals || { subBid: 0, install: 0 };
    var pkgs = grid.packages;

    function makeRow(bandMod, sowCellHtml, pkgCellFn) {
      var tr = document.createElement('tr');
      tr.className = 'scw-bid-review-v2__head-row scw-bid-review-v2__head-row--' + bandMod;
      var html = sowCellHtml;
      for (var i = 0; i < pkgs.length; i++) html += pkgCellFn(pkgs[i]);
      tr.innerHTML = html;
      return tr;
    }

    function sowTh(bandCls, inner) {
      return '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--sow ' +
        'scw-bid-review-v2__head--sow ' + bandCls + '">' + inner + '</th>';
    }

    // Band 1 — titles. Line-item + Photos columns rowspan the whole head.
    var r1 = document.createElement('tr');
    r1.className = 'scw-bid-review-v2__head-row scw-bid-review-v2__head-row--title';
    var r1Html =
      '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--label" rowspan="4"></th>' +
      '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--photos" rowspan="4">Photos</th>' +
      sowTh('scw-bid-review-v2__head-cell--title',
        '<div class="scw-bid-review-v2__head-title">SCW SOW</div>');
    for (var p1 = 0; p1 < pkgs.length; p1++) r1Html += pkgTitleCell(pkgs[p1], grid.sowId, p1);
    r1.innerHTML = r1Html;
    thead.appendChild(r1);

    // Band 2 — totals (Sub Bid aligned across SOW + bids).
    thead.appendChild(makeRow('totals',
      sowTh('scw-bid-review-v2__head-cell--totals',
        '<div class="scw-bid-review-v2__head-totals">' +
          headTotal('Sub Bid', totals.subBid) +
          headTotal('Install', totals.install) +
        '</div>'),
      pkgTotalsCell));

    // Band 3 — details (SOW name/proposal/docs/survey/margin ‖ bid label/PDF/status).
    var r3 = makeRow('details',
      sowTh('scw-bid-review-v2__head-cell--details scw-bid-review-v2__head--sow-details', ''),
      function (pkg) { return pkgDetailsCell(pkg, grid.sowId); });
    thead.appendChild(r3);

    // Band 4 — actions (both columns' buttons at the bottom).
    var r4 = makeRow('actions',
      sowTh('scw-bid-review-v2__head-cell--actions scw-bid-review-v2__head--sow-actions', ''),
      function (pkg) { return pkgActionsCell(pkg, grid.sowId); });
    thead.appendChild(r4);

    // SOW metrics — reuse v1's status-bar renderer (SOW name, published
    // proposal, docs, survey costs, margin, margin-low warning, preview
    // pill). v1 runs on the same scene, so its DOM scrapers + opsReview are
    // live. The renderer returns { details, actions }; place details in the
    // details band and actions in the actions band so the SOW column tracks
    // the bid columns' layout.
    var v1 = window.SCW.bidReview;
    // separateDocs: the documents GALLERY comes back as bar.docs instead of
    // living inside the details band — the SOW column is too narrow for
    // preview cards. It mounts below as a full-width row between the SOW
    // header and the first line-item group.
    var sowDocsBlock = null;
    if (v1 && typeof v1.buildSowStatusBar === 'function') {
      try {
        var bar = v1.buildSowStatusBar({ sowId: grid.sowId, sowName: grid.sowName },
          { separateDocs: true });
        if (bar) {
          var detSlot = r3.querySelector('.scw-bid-review-v2__head--sow-details');
          var actSlot = r4.querySelector('.scw-bid-review-v2__head--sow-actions');
          if (detSlot && bar.details) detSlot.appendChild(bar.details);
          if (actSlot && bar.actions) actSlot.appendChild(bar.actions);
          sowDocsBlock = bar.docs || null;
        }
      } catch (err) {
        if (window.console && console.warn) {
          console.warn('[BidReviewV2] buildSowStatusBar failed', err);
        }
      }
    }
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    // colspan = label + photos + sow + one per bid package
    var colspan = grid.packages.length + 3;

    // Full-width documents gallery band — below the SOW header, above the
    // line items, so the preview cards get the whole grid width to breathe.
    if (sowDocsBlock) {
      var docsTr = document.createElement('tr');
      docsTr.className = 'scw-bid-review-v2__docs-row';
      var docsTd = document.createElement('td');
      docsTd.className = 'scw-bid-review-v2__docs-cell';
      docsTd.colSpan = colspan;
      docsTd.appendChild(sowDocsBlock);
      docsTr.appendChild(docsTd);
      tbody.appendChild(docsTr);
    }
    var groups = grid.groups || [{ key: '__all__', level: 0, rows: grid.rows, subgroups: [] }];
    for (var g = 0; g < groups.length; g++) {
      // Per-group guard: a throw in one group must not blank the whole section
      // (render.js's per-grid catch would otherwise drop the entire grid →
      // empty body, which is the "loads then disappears" on a no-SOW bid).
      try {
        appendGroup(tbody, groups[g], grid.packages, colspan, grid.sowId);
      } catch (ge) {
        if (window.console && console.warn) {
          console.warn('[scw-br-v2] appendGroup threw', grid.sowId, groups[g] && groups[g].key, ge);
        }
      }
    }
    table.appendChild(tbody);
    section.appendChild(table);

    // Re-assert persisted bid-column collapse state (thead + tbody were
    // just rebuilt). Cells already carry the column class + data-pkg-id.
    if (ns.columnCollapse && typeof ns.columnCollapse.applyToSection === 'function') {
      var pkgIds = [];
      for (var pc = 0; pc < pkgs.length; pc++) if (pkgs[pc] && pkgs[pc].id) pkgIds.push(pkgs[pc].id);
      ns.columnCollapse.applyToSection(section, grid.sowId, pkgIds);
    }
    return section;
  }

  ns.card = {
    buildSowSection: buildSowSection,
    buildBidRow:     buildBidRow,
    buildBidCell:    buildBidCell
  };
})();
/*** END BID REVIEW V2 — CARD *************************************************/
