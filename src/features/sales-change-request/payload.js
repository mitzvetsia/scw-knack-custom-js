/*** SALES CHANGE REQUEST — PAYLOAD BUILDERS ***/
/**
 * Builds the clean JSON payload and self-contained HTML payload
 * for webhook submission.
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
  //  JSON PAYLOAD
  // ═══════════════════════════════════════════════════════════

  function buildPayload(isDraft) {
    var pending = S.pending();
    var ids = Object.keys(pending);
    var items = [];

    for (var i = 0; i < ids.length; i++) {
      var it = pending[ids[i]];
      var entry = {
        action:       it.action,
        rowId:        it.rowId || null,
        displayLabel: it.displayLabel || '',
        productName:  it.productName || '',
        changeNotes:  it.changeNotes || '',
        bucketId:     it.bucketId || '',
        bucketName:   it.bucketName || '',
        laborHours:   it.laborHours || 0,
      };

      if (it.action === 'revise' || it.action === 'add') {
        entry.current = it.current || {};
        var fields = [];
        var r = it.requested || {};
        var c = it.current || {};

        for (var f = 0; f < TF.length; f++) {
          var def = TF[f];
          if (r[def.key] == null) continue;
          var fieldEntry = {
            field: def.key,
            label: def.label,
            from:  c[def.key] != null ? c[def.key] : null,
            to:    r[def.key],
          };
          // Include record IDs for connection fields so Make can look up
          // per-product flags (e.g., "requires requote on swap")
          if (def.type === 'connection') {
            if (c[def.key + '_ids']) fieldEntry.fromIds = c[def.key + '_ids'];
            if (r[def.key + '_ids']) fieldEntry.toIds   = r[def.key + '_ids'];
          }
          fields.push(fieldEntry);
          entry[def.key] = r[def.key];
          if (def.type === 'connection' && r[def.key + '_ids']) {
            entry[def.key + '_ids'] = r[def.key + '_ids'];
          }
        }
        entry.fields = fields;
      }

      items.push(entry);
    }

    return {
      actionType: 'sales_change_request',
      isDraft:    isDraft,
      timestamp:  new Date().toISOString(),
      itemCount:  items.length,
      items:      items,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  HTML PAYLOAD
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
      { key: 'revise', title: 'Revisions',      color: '#3b82f6', bg: '#eff6ff', icon: '\u270E' },
      { key: 'add',    title: 'Items to Add',    color: '#16a34a', bg: '#f0fdf4', icon: '+' },
      { key: 'remove', title: 'Items to Remove', color: '#dc2626', bg: '#fef2f2', icon: '\u2212' },
      { key: 'note',   title: 'Notes',           color: '#f59e0b', bg: '#fffbeb', icon: '\u270D' },
    ];

    for (var si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var arr = groups[sec.key];
      if (!arr || !arr.length) continue;

      h.push('<div style="margin-bottom:20px;">');
      h.push('<div style="font-size:14px;font-weight:700;color:' + sec.color + ';margin-bottom:8px;">');
      h.push(esc(sec.icon) + ' ' + esc(sec.title) + ' (' + arr.length + ')');
      h.push('</div>');

      for (var j = 0; j < arr.length; j++) {
        var item = arr[j];
        h.push('<div style="background:' + sec.bg + ';border:1px solid ' + sec.color + '33;border-radius:6px;padding:10px 14px;margin-bottom:8px;">');

        // Item header (label + product)
        if (item.displayLabel || item.productName) {
          h.push('<div style="font-weight:600;font-size:13px;margin-bottom:4px;">');
          h.push(esc(item.displayLabel || ''));
          if (item.productName && item.productName !== item.displayLabel) {
            h.push(' <span style="font-weight:400;color:#64748b;">&mdash; ' + esc(item.productName) + '</span>');
          }
          h.push('</div>');
        }

        if (sec.key === 'note' || sec.key === 'remove') {
          // Note / removal — just show text
          if (item.changeNotes) {
            h.push('<div style="font-size:12px;color:#64748b;font-style:italic;">&ldquo;' + esc(item.changeNotes) + '&rdquo;</div>');
          } else if (sec.key === 'remove') {
            h.push('<div style="font-size:12px;color:#64748b;">Requesting removal</div>');
          }
        } else {
          // Revise / Add — field-change table
          var r = item.requested || {};
          var c = item.current || {};
          var hasFields = false;
          for (var fk in r) { if (r.hasOwnProperty(fk)) { hasFields = true; break; } }

          if (hasFields) {
            h.push('<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;">');
            for (var fi = 0; fi < TF.length; fi++) {
              var def = TF[fi];
              if (r[def.key] == null) continue;
              var fromStr = c[def.key] != null ? esc(H.formatFieldValue(def, c[def.key])) : '&mdash;';
              var toStr = esc(H.formatFieldValue(def, r[def.key]));

              h.push('<tr>');
              h.push('<td style="padding:3px 8px 3px 0;color:#475569;white-space:nowrap;font-weight:500;">' + esc(def.label) + '</td>');
              if (sec.key === 'revise') {
                h.push('<td style="padding:3px 8px;color:#94a3b8;text-decoration:line-through;">' + fromStr + '</td>');
                h.push('<td style="padding:3px 0;color:#94a3b8;">&rarr;</td>');
              }
              h.push('<td style="padding:3px 8px;font-weight:600;color:' + sec.color + ';">' + toStr + '</td>');
              h.push('</tr>');
            }
            h.push('</table>');
          }

          if (item.changeNotes) {
            h.push('<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:6px;">&ldquo;' + esc(item.changeNotes) + '&rdquo;</div>');
          }
        }

        h.push('</div>'); // card
      }

      h.push('</div>'); // section
    }

    // Footer
    h.push('<div style="font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:12px;">');
    h.push('Generated ' + esc(new Date().toLocaleString()));
    h.push('</div>');

    h.push('</div>');
    return h.join('');
  }

  // ── Public API ──
  ns.buildPayload = buildPayload;
  ns.buildHtml    = buildHtml;

})();
