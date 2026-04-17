/*** SALES CHANGE REQUEST — PAYLOAD BUILDERS ***/
/**
 * Builds the webhook payload. Each item carries:
 *   - .json  — stringified clean JSON snapshot (no HTML)
 *   - .html  — self-contained inline-styled HTML card
 *
 * The top-level payload also has a combined .html wrapping all items.
 * Modelled on bid-review/change-requests.js buildSubmitPayload + buildItemHtml.
 *
 * Reads : SCW.salesCR.CONFIG, ._state, ._h
 * Writes: SCW.salesCR.buildPayload, .buildHtml
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;
  var H   = ns._h;
  var TF  = CFG.trackedFields;

  // ═══════════════════════════════════════════════════════════
  //  PER-ITEM HELPERS
  // ═══════════════════════════════════════════════════════════

  var PALETTES = {
    revise: { color: '#3b82f6', bg: '#eff6ff', border: '#3b82f633', badge: '#dbeafe', badgeText: '#1e40af', label: 'REVISE' },
    add:    { color: '#16a34a', bg: '#f0fdf4', border: '#16a34a33', badge: '#dcfce7', badgeText: '#166534', label: 'ADD' },
    remove: { color: '#dc2626', bg: '#fef2f2', border: '#dc262633', badge: '#fee2e2', badgeText: '#991b1b', label: 'REMOVE' },
    note:   { color: '#60a5fa', bg: '#eff6ff', border: '#60a5fa33', badge: '#dbeafe', badgeText: '#1e40af', label: 'NOTE' },
  };

  /** Build the fields array for one pending item (from→to diffs). */
  function buildItemFields(it) {
    var fields = [];
    var r = it.requested || {};
    var c = it.current   || {};

    for (var f = 0; f < TF.length; f++) {
      var def = TF[f];
      if (r[def.key] == null) continue;
      var entry = {
        field: def.key,
        label: def.label,
        from:  c[def.key] != null ? c[def.key] : null,
        to:    r[def.key],
      };
      if (def.type === 'connection') {
        if (c[def.key + '_ids']) entry.fromIds = c[def.key + '_ids'];
        if (r[def.key + '_ids']) entry.toIds   = r[def.key + '_ids'];
      }
      fields.push(entry);
    }
    return fields;
  }

  /** Build a self-contained HTML card for one item. */
  function buildItemHtml(item, fieldList) {
    var action  = item.action || 'revise';
    var palette = PALETTES[action] || PALETTES.revise;
    var esc     = H.escHtml;

    var h = [];
    h.push('<div style="font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1e293b;max-width:600px;">');
    h.push('<div style="background:' + palette.bg + ';border:1px solid ' + palette.border + ';border-radius:6px;padding:10px 14px;">');

    // Badge + item header
    h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">');
    h.push('<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:' + palette.badge + ';color:' + palette.badgeText + ';font-size:10px;font-weight:700;letter-spacing:0.5px;">' + palette.label + '</span>');
    var displayName = H.readableVal(item.displayLabel) || H.readableVal(item.productName) || 'Item';
    h.push('<span style="font-weight:600;font-size:13px;">' + esc(displayName) + '</span>');
    var prodName = H.readableVal(item.productName);
    if (prodName && item.displayLabel && prodName !== displayName) {
      h.push('<span style="color:#64748b;font-size:12px;">&mdash; ' + esc(prodName) + '</span>');
    }
    h.push('</div>');

    if (action === 'remove') {
      if (item.changeNotes) {
        h.push('<div style="font-size:12px;color:#64748b;font-style:italic;">&ldquo;' + esc(item.changeNotes) + '&rdquo;</div>');
      } else {
        h.push('<div style="font-size:12px;color:#64748b;">Requesting removal</div>');
      }
    } else if (action === 'note') {
      if (item.changeNotes) {
        h.push('<div style="font-size:12px;color:#64748b;font-style:italic;">&ldquo;' + esc(item.changeNotes) + '&rdquo;</div>');
      }
    } else if (fieldList && fieldList.length) {
      // Revise or Add — field changes table
      h.push('<table style="width:100%;border-collapse:collapse;font-size:12px;">');
      for (var fi = 0; fi < fieldList.length; fi++) {
        var f = fieldList[fi];
        var def = null;
        for (var di = 0; di < TF.length; di++) {
          if (TF[di].key === f.field) { def = TF[di]; break; }
        }
        var fromStr = f.from != null ? esc(H.formatFieldValue(def || {}, f.from)) : '&mdash;';
        var toStr   = esc(H.formatFieldValue(def || {}, f.to));

        h.push('<tr>');
        h.push('<td style="padding:3px 8px 3px 0;color:#475569;white-space:nowrap;font-weight:500;">' + esc(f.label) + '</td>');
        if (action === 'revise') {
          h.push('<td style="padding:3px 8px;color:#94a3b8;text-decoration:line-through;">' + fromStr + '</td>');
          h.push('<td style="padding:3px 0;color:#94a3b8;">&rarr;</td>');
        }
        h.push('<td style="padding:3px 8px;font-weight:600;color:' + palette.color + ';">' + toStr + '</td>');
        h.push('</tr>');
      }
      h.push('</table>');

      if (item.changeNotes) {
        h.push('<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:6px;border-top:1px solid ' + palette.border + ';padding-top:4px;">&ldquo;' + esc(item.changeNotes) + '&rdquo;</div>');
      }
    }

    h.push('</div>');
    h.push('</div>');
    return h.join('');
  }

  /** Build a plain-text version of one item (ClickUp-safe, no HTML). */
  function buildItemPlainText(item, fieldList) {
    var action = (item.action || 'revise').toUpperCase();
    var displayName = H.readableVal(item.displayLabel) || H.readableVal(item.productName) || 'Item';
    var prodName = H.readableVal(item.productName);

    var lines = [];
    var header = action + ' — ' + displayName;
    if (prodName && item.displayLabel && prodName !== displayName) {
      header += ' (' + prodName + ')';
    }
    lines.push(header);

    if (action === 'REMOVE') {
      if (item.changeNotes) lines.push('  "' + item.changeNotes + '"');
      else lines.push('  Requesting removal');
    } else if (action === 'NOTE') {
      if (item.changeNotes) lines.push('  "' + item.changeNotes + '"');
    } else if (fieldList && fieldList.length) {
      for (var fi = 0; fi < fieldList.length; fi++) {
        var f = fieldList[fi];
        var def = null;
        for (var di = 0; di < TF.length; di++) {
          if (TF[di].key === f.field) { def = TF[di]; break; }
        }
        var fromStr = f.from != null ? H.formatFieldValue(def || {}, f.from) : '—';
        var toStr   = H.formatFieldValue(def || {}, f.to);
        if (action === 'REVISE') {
          lines.push('  ' + f.label + ': ' + fromStr + ' → ' + toStr);
        } else {
          lines.push('  ' + f.label + ': ' + toStr);
        }
      }
      if (item.changeNotes) lines.push('  "' + item.changeNotes + '"');
    }

    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════
  //  PAYLOAD (per-item json + html + plainText)
  // ═══════════════════════════════════════════════════════════

  function buildPayload(isDraft) {
    var pending = S.pending();
    var ids = Object.keys(pending);
    var items = [];

    for (var i = 0; i < ids.length; i++) {
      var it = pending[ids[i]];

      // Base entry — IDs, labels, metadata
      var entry = {
        action:       it.action,
        rowId:        it.rowId || null,
        displayLabel: H.readableVal(it.displayLabel) || '',
        productName:  H.readableVal(it.productName) || '',
        changeNotes:  it.changeNotes || '',
        bucketId:     it.bucketId || '',
        bucketName:   it.bucketName || '',
        laborHours:   it.laborHours || 0,
      };

      // Snapshot of current + requested values
      entry.current   = it.current   || {};
      entry.requested = it.requested || {};

      // Flatten requested values + build fields array
      var fieldList = buildItemFields(it);
      var r = it.requested || {};
      for (var f = 0; f < TF.length; f++) {
        var def = TF[f];
        if (r[def.key] == null) continue;
        entry[def.key] = r[def.key];
        if (def.type === 'connection' && r[def.key + '_ids']) {
          entry[def.key + '_ids'] = r[def.key + '_ids'];
        }
      }
      entry.fields = fieldList;

      // Per-item JSON snapshot (stringified BEFORE html/plainText are added)
      entry.json = JSON.stringify(entry);

      // Per-item HTML card + plain-text version (ClickUp-safe)
      entry.html      = buildItemHtml(it, fieldList);
      entry.plainText = buildItemPlainText(it, fieldList);

      items.push(entry);
    }

    return {
      actionType: 'sales_change_request',
      isDraft:    isDraft,
      timestamp:  new Date().toISOString(),
      sowId:      S.sowRecordId() || '',
      itemCount:  items.length,
      items:      items,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  COMBINED PLAIN TEXT (ClickUp-safe)
  // ═══════════════════════════════════════════════════════════

  function buildPlainText() {
    var pending = S.pending();
    var ids = Object.keys(pending);
    if (!ids.length) return '';

    var lines = [];
    lines.push('SALES CHANGE REQUEST');
    lines.push(ids.length + ' item(s) — ' + new Date().toLocaleString());
    lines.push('────────────────────');
    lines.push('');

    var groups = { revise: [], add: [], remove: [], note: [] };
    for (var i = 0; i < ids.length; i++) {
      var it = pending[ids[i]];
      if (groups[it.action]) groups[it.action].push(it);
    }

    var sections = [
      { key: 'revise', title: 'REVISIONS' },
      { key: 'add',    title: 'ITEMS TO ADD' },
      { key: 'remove', title: 'ITEMS TO REMOVE' },
      { key: 'note',   title: 'NOTES' },
    ];

    for (var si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var arr = groups[sec.key];
      if (!arr || !arr.length) continue;

      lines.push(sec.title + ' (' + arr.length + ')');
      for (var j = 0; j < arr.length; j++) {
        lines.push(buildItemPlainText(arr[j], buildItemFields(arr[j])));
        lines.push('');
      }
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ═══════════════════════════════════════════════════════════
  //  COMBINED HTML (full submission document)
  // ═══════════════════════════════════════════════════════════

  function buildHtml() {
    var pending = S.pending();
    var ids = Object.keys(pending);
    if (!ids.length) return '';

    var esc = H.escHtml;
    var h = [];

    h.push('<div style="font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1e293b;max-width:720px;">');

    // Header
    h.push('<div style="border-bottom:2px solid #3b82f6;padding-bottom:8px;margin-bottom:16px;">');
    h.push('<div style="font-size:18px;font-weight:700;color:#0f172a;">Sales Change Request</div>');
    h.push('<div style="font-size:13px;color:#64748b;margin-top:2px;">');
    h.push(ids.length + ' item(s) &mdash; ' + esc(new Date().toLocaleString()));
    h.push('</div></div>');

    // Group by action
    var groups = { revise: [], add: [], remove: [], note: [] };
    for (var i = 0; i < ids.length; i++) {
      var it = pending[ids[i]];
      if (groups[it.action]) groups[it.action].push(it);
    }

    var sections = [
      { key: 'revise', title: 'Revisions',      icon: '\u270E' },
      { key: 'add',    title: 'Items to Add',    icon: '+' },
      { key: 'remove', title: 'Items to Remove', icon: '\u2212' },
      { key: 'note',   title: 'Notes',           icon: '\u270D' },
    ];

    for (var si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var arr = groups[sec.key];
      if (!arr || !arr.length) continue;
      var palette = PALETTES[sec.key];

      h.push('<div style="margin-bottom:20px;">');
      h.push('<div style="font-size:14px;font-weight:700;color:' + palette.color + ';margin-bottom:8px;">');
      h.push(esc(sec.icon) + ' ' + esc(sec.title) + ' (' + arr.length + ')');
      h.push('</div>');

      for (var j = 0; j < arr.length; j++) {
        var fieldList = buildItemFields(arr[j]);
        h.push(buildItemHtml(arr[j], fieldList));
        h.push('<div style="height:6px;"></div>');
      }

      h.push('</div>');
    }

    // Footer
    h.push('<div style="font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:12px;">');
    h.push('Generated ' + esc(new Date().toLocaleString()));
    h.push('</div>');

    h.push('</div>');
    return h.join('');
  }

  // ── Public API ──
  ns.buildPayload   = buildPayload;
  ns.buildHtml      = buildHtml;
  ns.buildPlainText = buildPlainText;

})();
