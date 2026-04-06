/*** PROPOSAL PDF EXPORT — scene_1096 ***/
(function () {
  'use strict';

  var SCENE_ID = 'scene_1096';
  var WEBHOOK_URL = 'https://hook.us1.make.com/ozk2uk1e58upnpsj0fx1bmdg387ekvf5';
  var BUTTON_ID = 'scw-proposal-pdf-btn';

  // Views to skip (Knack internal UI, hidden data sources)
  var SKIP_VIEWS = { view_3342: true };

  var KEYS = {
    qty: 'field_1964',
    labor: 'field_2028',
    hardware: 'field_2201',
    cost: 'field_2203',
    discount: 'field_2267',
    lineItemDiscount: 'field_2303',
    description: 'field_2019',
    prefix: 'field_2240',
    number: 'field_1951',
    connectedDevices: 'field_1957',
  };

  // ── Helpers ──

  function norm(s) {
    return String(s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseMoney(text) {
    var raw = String(text || '').replace(/[^0-9.\-]/g, '');
    var n = parseFloat(raw);
    return isFinite(n) ? n : 0;
  }

  function esc(s) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(String(s || '')));
    return div.innerHTML;
  }

  function groupLabelText(tr) {
    var td = tr.querySelector('td:first-child');
    return td ? norm(td.textContent) : '';
  }

  function isVisibleRow(tr) {
    return tr.style.display !== 'none' && !tr.classList.contains('scw-hide-level3-header') && !tr.classList.contains('scw-hide-level4-header');
  }

  // ── View type detection ──

  function getViewTitle(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return '';
    var h2 = root.querySelector('.view-header h2');
    if (h2) return norm(h2.textContent);
    var h1 = root.querySelector('.view-header h1');
    if (h1) return norm(h1.textContent);
    return '';
  }

  function isKnackFilterOrButton(viewId) {
    // Knack generates filter/button sub-elements with IDs like view_XXXX_filters, view_XXXX-filterDivId, etc.
    return /_filters$|-filter|_filterBtn$|-filterBtn$|-filterDivId$/.test(viewId);
  }

  function detectViewType(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;

    // Check for grid/table view
    if (root.querySelector('.kn-table tbody')) return 'grid';
    // Check for detail view (field list)
    if (root.querySelector('.kn-detail-body') || root.classList.contains('kn-detail') || root.querySelector('.field-list')) return 'detail';
    // Check for rich text view
    if (root.classList.contains('kn-rich_text') || root.querySelector('.kn-rich-text-content')) return 'richtext';

    return 'unknown';
  }

  function viewHasDataRows(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return false;
    var tbody = root.querySelector('.kn-table tbody');
    if (!tbody) return false;
    return tbody.querySelectorAll('tr[id]').length > 0;
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPER: Detail views (label/value field pairs)
  // ══════════════════════════════════════════════════════════════

  function scrapeDetailView(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;

    var title = getViewTitle(viewId);
    var fields = [];

    // Knack detail views: .kn-detail contains .kn-detail-label + .kn-detail-body
    var detailItems = root.querySelectorAll('.kn-detail');
    for (var i = 0; i < detailItems.length; i++) {
      var item = detailItems[i];
      // Skip the outer container that wraps everything
      if (item.id === viewId) continue;

      var labelEl = item.querySelector('.kn-detail-label');
      var valueEl = item.querySelector('.kn-detail-body');
      if (!labelEl || !valueEl) continue;

      var label = norm(labelEl.textContent);
      var value = norm(valueEl.textContent);
      var valueHtml = valueEl.innerHTML || '';

      // Skip empty fields
      if (!value || value === '-' || value === '—') continue;

      fields.push({ label: label, value: value, valueHtml: valueHtml });
    }

    if (!fields.length && !title) return null;

    return { viewId: viewId, type: 'detail', title: title, fields: fields };
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPER: Rich text views
  // ══════════════════════════════════════════════════════════════

  function scrapeRichTextView(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;

    var title = getViewTitle(viewId);

    // Get the rich text content
    var contentEl = root.querySelector('.kn-rich-text-content') || root.querySelector('.view-body');
    var html = '';
    var text = '';
    if (contentEl) {
      html = contentEl.innerHTML || '';
      text = norm(contentEl.textContent);
    }

    if (!text && !title) return null;

    return { viewId: viewId, type: 'richtext', title: title, contentHtml: html, contentText: text };
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPER: Grid views (the existing proposal grid scraper)
  // ══════════════════════════════════════════════════════════════

  function scrapeGridView(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;

    var tbody = root.querySelector('.kn-table tbody');
    if (!tbody) return null;

    var rows = Array.from(tbody.children);
    if (!rows.length) return null;

    var title = getViewTitle(viewId);
    var sections = [];
    var currentL1 = null;
    var currentL2 = null;
    var currentL3 = null;

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];

      if (tr.id && !tr.classList.contains('kn-table-group') && !tr.classList.contains('scw-level-total-row')) continue;

      if (tr.classList.contains('kn-group-level-1')) {
        var l1Label = groupLabelText(tr);
        if (tr.style.display === 'none') {
          currentL1 = { level: 1, label: '', promoted: true, buckets: [], footer: null };
          sections.push(currentL1);
        } else {
          currentL1 = { level: 1, label: l1Label, promoted: false, buckets: [], footer: null };
          sections.push(currentL1);
        }
        currentL2 = null;
        currentL3 = null;
        continue;
      }

      if (tr.classList.contains('kn-group-level-2')) {
        var l2Label = groupLabelText(tr);
        var isPromoted = tr.classList.contains('scw-promoted-l2-as-l1');

        currentL2 = {
          level: 2, label: l2Label, isPromoted: isPromoted, products: [], footer: null,
        };

        if (isPromoted) {
          currentL1 = { level: 1, label: l2Label, promoted: true, buckets: [], footer: null };
          sections.push(currentL1);
        }

        if (currentL1) currentL1.buckets.push(currentL2);
        currentL3 = null;
        continue;
      }

      if (tr.classList.contains('kn-group-level-3')) {
        if (!isVisibleRow(tr)) continue;

        var l3Label = groupLabelText(tr);
        var l3Qty = parseMoney(norm((tr.querySelector('td.' + KEYS.qty) || {}).textContent || ''));
        var l3Cost = norm((tr.querySelector('td.' + KEYS.cost) || {}).textContent || '');

        var connDevSpan = tr.querySelector('.scw-l3-connected-devices');
        var connDevices = [];
        if (connDevSpan) {
          var connText = norm(connDevSpan.textContent).replace(/^\(/, '').replace(/\)$/, '');
          if (connText) connDevices = connText.split(',').map(function (s) { return norm(s); }).filter(Boolean);
        }

        var isMounting = tr.classList.contains('scw-level3--mounting-hardware');

        currentL3 = {
          level: 3, label: l3Label, qty: l3Qty, cost: l3Cost,
          connectedDevices: connDevices, isMountingHardware: isMounting, lineItems: [],
        };

        if (currentL2) currentL2.products.push(currentL3);
        continue;
      }

      if (tr.classList.contains('kn-group-level-4')) {
        if (!isVisibleRow(tr)) continue;

        var labelCell = tr.querySelector('td:first-child');
        var l4Label = labelCell ? norm(labelCell.textContent) : '';

        var descSpan = tr.querySelector('.scw-l4-2019');
        var description = '';
        if (descSpan) description = descSpan.innerHTML || '';

        var camB = tr.querySelector('.scw-concat-cameras b');
        var cameraList = '';
        if (camB) cameraList = norm(camB.textContent).replace(/^\(/, '').replace(/\)$/, '');

        var l4Qty = parseMoney(norm((tr.querySelector('td.' + KEYS.qty) || {}).textContent || ''));
        var l4Cost = norm((tr.querySelector('td.' + KEYS.cost) || {}).textContent || '');

        var lineItem = {
          level: 4, label: l4Label, description: description,
          qty: l4Qty, cost: l4Cost, cameraList: cameraList,
        };

        if (!currentL3 && currentL2) {
          currentL3 = {
            level: 3, label: '', qty: l4Qty, cost: l4Cost,
            connectedDevices: [], isMountingHardware: false, lineItems: [],
          };
          currentL2.products.push(currentL3);
        }
        if (currentL3) currentL3.lineItems.push(lineItem);
        continue;
      }

      if (tr.classList.contains('scw-subtotal--level-2')) {
        var l2FooterLabel = norm(tr.getAttribute('data-scw-group-label') || '');
        var l2FooterQty = parseMoney(norm((tr.querySelector('td.' + KEYS.qty) || {}).textContent || ''));
        var l2FooterCost = norm((tr.querySelector('td.' + KEYS.cost) || {}).textContent || '');

        if (currentL2) {
          currentL2.footer = { label: l2FooterLabel, qty: l2FooterQty, cost: l2FooterCost };
        }
        continue;
      }

      if (tr.classList.contains('scw-subtotal--level-1') && !tr.classList.contains('scw-project-totals')) {
        if (!currentL1) continue;

        if (!currentL1.footer) {
          var titleDiv = tr.querySelector('.scw-l1-title');
          currentL1.footer = {
            title: titleDiv ? norm(titleDiv.textContent) : currentL1.label,
            hasDiscount: false, lines: [],
          };
        }

        var lineLabel = tr.querySelector('.scw-l1-label');
        var lineValue = tr.querySelector('.scw-l1-value');
        if (lineLabel && lineValue) {
          var type = 'final';
          if (tr.classList.contains('scw-l1-line--sub')) type = 'sub';
          else if (tr.classList.contains('scw-l1-line--disc')) { type = 'disc'; currentL1.footer.hasDiscount = true; }

          currentL1.footer.lines.push({
            type: type, label: norm(lineLabel.textContent), value: norm(lineValue.textContent),
          });
        }
        continue;
      }
    }

    var projectTotals = null;
    var ptRows = tbody.querySelectorAll('tr.scw-project-totals');
    if (ptRows.length) {
      projectTotals = { title: 'Project Totals', lines: [] };
      for (var p = 0; p < ptRows.length; p++) {
        var ptr = ptRows[p];
        var ptTitle = ptr.querySelector('.scw-l1-title');
        if (ptTitle) { projectTotals.title = norm(ptTitle.textContent); continue; }
        var ptLabel = ptr.querySelector('.scw-l1-label');
        var ptValue = ptr.querySelector('.scw-l1-value');
        if (ptLabel && ptValue) {
          var ptType = 'final';
          if (ptr.classList.contains('scw-l1-line--sub')) ptType = 'sub';
          else if (ptr.classList.contains('scw-l1-line--disc')) ptType = 'disc';
          projectTotals.lines.push({ type: ptType, label: norm(ptLabel.textContent), value: norm(ptValue.textContent) });
        }
      }
    }

    return { viewId: viewId, type: 'grid', title: title, sections: sections, projectTotals: projectTotals };
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPE ALL VIEWS on scene
  // ══════════════════════════════════════════════════════════════

  function scrapeAllViews() {
    var result = { views: [] };

    var sceneEl = document.getElementById('kn-' + SCENE_ID);
    // Get direct child views only (avoid nested filter elements)
    // Knack scene structure: #kn-scene_XXXX > .kn-scene > columns > .kn-view (views)
    var allViewEls = sceneEl ? sceneEl.querySelectorAll('[id^="view_"]') : [];

    for (var i = 0; i < allViewEls.length; i++) {
      var viewId = allViewEls[i].id;

      // Skip filter/button UI elements
      if (isKnackFilterOrButton(viewId)) continue;
      // Skip explicitly excluded views
      if (SKIP_VIEWS[viewId]) continue;

      var viewType = detectViewType(viewId);
      console.log('[SCW PDF Export]', viewId, '→ type:', viewType, 'title:', getViewTitle(viewId));

      var data = null;

      if (viewType === 'grid') {
        // Skip grid views with no data rows (e.g. empty view_3371)
        if (!viewHasDataRows(viewId)) {
          console.log('[SCW PDF Export]', viewId, '→ grid has no data rows, skipping');
          continue;
        }
        data = scrapeGridView(viewId);
      } else if (viewType === 'detail') {
        data = scrapeDetailView(viewId);
      } else if (viewType === 'richtext') {
        data = scrapeRichTextView(viewId);
      }

      if (data) result.views.push(data);
    }

    // Extract project totals from the first grid view that has them
    for (var j = 0; j < result.views.length; j++) {
      if (result.views[j].projectTotals) {
        result.projectTotals = result.views[j].projectTotals;
        break;
      }
    }

    return result;
  }

  // ══════════════════════════════════════════════════════════════
  // HTML PDF RENDERER
  // ══════════════════════════════════════════════════════════════

  function renderDetailView(view, html) {
    if (view.title) {
      html.push('<div class="view-title">' + esc(view.title) + '</div>');
    }
    if (view.fields.length) {
      html.push('<table class="detail-table">');
      for (var i = 0; i < view.fields.length; i++) {
        var f = view.fields[i];
        html.push('<tr>');
        html.push('<td class="detail-label">' + esc(f.label) + '</td>');
        html.push('<td class="detail-value">' + esc(f.value) + '</td>');
        html.push('</tr>');
      }
      html.push('</table>');
    }
  }

  function renderRichTextView(view, html) {
    if (view.title) {
      html.push('<div class="view-title">' + esc(view.title) + '</div>');
    }
    if (view.contentText) {
      html.push('<div class="richtext-content">' + view.contentHtml + '</div>');
    }
  }

  function renderGridSections(view, html) {
    if (view.title) {
      html.push('<div class="view-title">' + esc(view.title) + '</div>');
    }

    for (var s = 0; s < view.sections.length; s++) {
      var section = view.sections[s];

      if (section.promoted && !section.label && !section.buckets.length) continue;
      if (!section.footer && !hasSectionContent(section)) continue;

      html.push('<div class="l1-section">');

      if (section.label) {
        html.push('<div class="l1-header">' + esc(section.label) + '</div>');
      }

      for (var b = 0; b < section.buckets.length; b++) {
        var bucket = section.buckets[b];
        if (!bucket.products.length && !bucket.footer) continue;

        if (!bucket.isPromoted) {
          html.push('<div class="l2-header">' + esc(bucket.label) + '</div>');
        }

        if (bucket.products.length) {
          html.push('<table class="product-table">');
          html.push('<thead><tr><th class="col-desc">Description</th><th class="col-qty">Qty</th><th class="col-cost">Cost</th></tr></thead>');
          html.push('<tbody>');

          for (var p = 0; p < bucket.products.length; p++) {
            var prod = bucket.products[p];
            var prodClass = prod.isMountingHardware ? ' class="mounting"' : '';

            if (prod.label) {
              html.push('<tr class="l3-row">');
              html.push('<td' + prodClass + '>' + esc(prod.label));
              if (prod.connectedDevices && prod.connectedDevices.length) {
                html.push('<span class="connected-devices">(' + esc(prod.connectedDevices.join(', ')) + ')</span>');
              }
              html.push('</td>');
              html.push('<td class="col-qty">' + prod.qty + '</td>');
              html.push('<td class="col-cost">' + esc(prod.cost) + '</td>');
              html.push('</tr>');
            }

            var l4Class = prod.label ? 'l4-row' : 'l3-row';
            var l4TdClass = prod.label ? 'l4-desc' : '';
            for (var li = 0; li < prod.lineItems.length; li++) {
              var item = prod.lineItems[li];
              html.push('<tr class="' + l4Class + '">');
              html.push('<td' + (l4TdClass ? ' class="' + l4TdClass + '"' : '') + '>' + esc(item.label) + '</td>');
              html.push('<td class="col-qty">' + item.qty + '</td>');
              html.push('<td class="col-cost">' + esc(item.cost) + '</td>');
              html.push('</tr>');
            }
          }

          html.push('</tbody>');

          if (bucket.footer) {
            html.push('<tfoot>');
            html.push('<tr class="l2-footer">');
            html.push('<td>' + esc(bucket.footer.label) + '</td>');
            html.push('<td class="col-qty">' + bucket.footer.qty + '</td>');
            html.push('<td class="col-cost">' + esc(bucket.footer.cost) + '</td>');
            html.push('</tr>');
            html.push('</tfoot>');
          }

          html.push('</table>');
        }
      }

      if (section.footer && section.footer.lines.length) {
        html.push('<div class="l1-footer">');
        html.push('<div class="l1-footer-title">' + esc(section.footer.title) + '</div>');
        for (var fl = 0; fl < section.footer.lines.length; fl++) {
          var line = section.footer.lines[fl];
          html.push('<div class="l1-footer-line l1-line--' + line.type + '">');
          html.push('<span class="l1-footer-label">' + esc(line.label) + '</span>');
          html.push('<span class="l1-footer-value">' + esc(line.value) + '</span>');
          html.push('</div>');
        }
        html.push('</div>');
      }

      html.push('</div>');
    }
  }

  function buildPdfHtml(payload) {
    if (!payload.views.length) return '';

    var html = [];

    html.push('<!DOCTYPE html>');
    html.push('<html><head><meta charset="utf-8">');
    html.push('<title>Proposal</title>');
    html.push('<style>');
    html.push(getPdfCss());
    html.push('</style>');
    html.push('</head><body>');

    // ── Render ALL views in DOM order ──
    for (var v = 0; v < payload.views.length; v++) {
      var view = payload.views[v];

      if (view.type === 'detail') {
        renderDetailView(view, html);
      } else if (view.type === 'richtext') {
        renderRichTextView(view, html);
      } else if (view.type === 'grid') {
        renderGridSections(view, html);
      }
    }

    // ── Project Totals ──
    var pt = payload.projectTotals;
    if (!pt) {
      for (var j = 0; j < payload.views.length; j++) {
        if (payload.views[j].projectTotals) { pt = payload.views[j].projectTotals; break; }
      }
    }
    if (pt && pt.lines.length) {
      html.push('<div class="project-totals">');
      html.push('<div class="pt-title">' + esc(pt.title) + '</div>');
      for (var tl = 0; tl < pt.lines.length; tl++) {
        var tline = pt.lines[tl];
        html.push('<div class="pt-line pt-line--' + tline.type + '">');
        html.push('<span class="pt-label">' + esc(tline.label) + '</span>');
        html.push('<span class="pt-value">' + esc(tline.value) + '</span>');
        html.push('</div>');
      }
      html.push('</div>');
    }

    html.push('</body></html>');
    return html.join('\n');
  }

  function hasSectionContent(section) {
    for (var i = 0; i < section.buckets.length; i++) {
      if (section.buckets[i].products.length || section.buckets[i].footer) return true;
    }
    return false;
  }

  function getPdfCss() {
    return [
      '@page { size: letter; margin: 0.6in 0.75in; }',
      '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }',
      '',
      '*, *::before, *::after { box-sizing: border-box; }',
      'body { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #333; font-size: 11px; line-height: 1.4; margin: 0; padding: 20px; }',
      '',
      '/* ── View Title ── */',
      '.view-title {',
      '  font-size: 20px; font-weight: 800; color: #07467c;',
      '  margin: 24px 0 8px 0; padding-bottom: 4px;',
      '  border-bottom: 3px solid #07467c;',
      '}',
      '.view-title:first-child { margin-top: 0; }',
      '',
      '/* ── Detail View ── */',
      '.detail-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }',
      '.detail-table tr { border-bottom: 1px solid #f0f0f0; }',
      '.detail-label {',
      '  font-weight: 600; color: #07467c; padding: 5px 12px 5px 0;',
      '  white-space: nowrap; vertical-align: top; width: 180px; font-size: 11px;',
      '}',
      '.detail-value { padding: 5px 0; color: #333; font-size: 11px; }',
      '',
      '/* ── Rich Text View ── */',
      '.richtext-content { margin-bottom: 16px; line-height: 1.5; color: #333; font-size: 11px; }',
      '.richtext-content p { margin: 0 0 6px 0; }',
      '',
      '/* ── L1 Section ── */',
      '.l1-section { margin-bottom: 12px; page-break-inside: avoid; }',
      '.l1-header {',
      '  font-size: 18px; font-weight: 200; color: #07467c;',
      '  padding: 20px 0 6px 0; border-bottom: 3px solid #07467c;',
      '  margin-bottom: 4px;',
      '}',
      '',
      '/* ── L2 Bucket ── */',
      '.l2-header {',
      '  font-size: 13px; font-weight: 400; color: #07467c;',
      '  background: aliceblue; padding: 5px 10px;',
      '  margin-top: 12px; margin-bottom: 0;',
      '}',
      '',
      '/* ── Product Table ── */',
      '.product-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }',
      '.product-table thead th {',
      '  font-size: 9px; font-weight: 600; color: #999; text-transform: uppercase;',
      '  letter-spacing: 0.5px; padding: 4px 8px; border-bottom: 1px solid #ddd;',
      '}',
      '.product-table th.col-desc { text-align: left; }',
      '.product-table .col-qty { text-align: center; width: 50px; }',
      '.product-table .col-cost { text-align: right; width: 100px; }',
      '',
      '/* ── L3 Product Row ── */',
      '.l3-row td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; font-weight: 400; color: #07467c; }',
      '.l3-row td:first-child { font-size: 12px; }',
      '.l3-row td.col-qty, .l3-row td.col-cost { font-weight: 600; }',
      '.l3-row td.mounting { padding-left: 40px; font-size: 11px; }',
      '.connected-devices { display: inline; margin-left: 4px; color: orange; font-weight: 700; font-size: 10px; }',
      '',
      '/* ── L4 Line Item Row ── */',
      '.l4-row td { padding: 3px 8px 3px 40px; color: #555; font-size: 10px; font-weight: 300; border-bottom: 1px solid #f8f8f8; }',
      '.l4-row td.col-qty, .l4-row td.col-cost { padding-left: 8px; font-weight: 600; color: #07467c; }',
      '',
      '/* ── L2 Footer ── */',
      '.l2-footer td {',
      '  font-weight: 800 !important; color: #07467c; background: aliceblue;',
      '  padding: 6px 8px; text-align: center; border-bottom: none;',
      '}',
      '.l2-footer td:first-child { text-align: right; }',
      '.l2-footer td:last-child { text-align: right; }',
      '',
      '/* ── L1 Footer ── */',
      '.l1-footer {',
      '  margin-top: 14px; padding-top: 8px;',
      '  border-top: 3px solid #07467c;',
      '}',
      '.l1-footer-title {',
      '  text-align: right; font-weight: 700; color: #07467c;',
      '  font-size: 13px; margin-bottom: 4px;',
      '}',
      '.l1-footer-line {',
      '  display: flex; justify-content: flex-end; gap: 20px;',
      '  padding: 2px 0;',
      '}',
      '.l1-footer-label { font-weight: 600; opacity: 0.85; min-width: 80px; text-align: right; }',
      '.l1-footer-value { font-weight: 700; min-width: 120px; text-align: right; }',
      '.l1-line--sub .l1-footer-label, .l1-line--sub .l1-footer-value { color: #07467c; }',
      '.l1-line--disc .l1-footer-label, .l1-line--disc .l1-footer-value { color: orange; }',
      '.l1-line--final .l1-footer-label, .l1-line--final .l1-footer-value { color: #07467c; font-weight: 900; }',
      '.l1-line--final .l1-footer-value { font-size: 15px; }',
      '',
      '/* ── Project Totals ── */',
      '.project-totals {',
      '  margin-top: 30px; page-break-inside: avoid;',
      '}',
      '.pt-title {',
      '  font-size: 22px; font-weight: 600; color: #07467c;',
      '  padding-bottom: 8px; border-bottom: 3px solid #07467c;',
      '  margin-bottom: 6px;',
      '}',
      '.pt-line {',
      '  display: flex; justify-content: flex-end; gap: 24px;',
      '  padding: 3px 0;',
      '}',
      '.pt-label { font-weight: 600; min-width: 160px; text-align: right; }',
      '.pt-value { font-weight: 700; min-width: 130px; text-align: right; }',
      '.pt-line--sub .pt-label, .pt-line--sub .pt-value { color: #07467c; }',
      '.pt-line--disc .pt-label, .pt-line--disc .pt-value { color: orange; }',
      '.pt-line--final .pt-label, .pt-line--final .pt-value { color: #07467c; font-weight: 900; }',
      '.pt-line--final:last-child .pt-label { font-size: 17px; }',
      '.pt-line--final:last-child .pt-value { font-size: 19px; }',
    ].join('\n');
  }

  // ── Open PDF in new tab ──

  function openPdfPreview(htmlStr) {
    var win = window.open('', '_blank');
    if (!win) {
      alert('Popup blocked — please allow popups for this site and try again.');
      return;
    }
    win.document.write(htmlStr);
    win.document.close();
    setTimeout(function () { win.print(); }, 600);
  }

  // ── Send to webhook ──

  function sendToWebhook(data) {
    var jsonStr = JSON.stringify(data);
    $.ajax({
      url: WEBHOOK_URL,
      type: 'POST',
      contentType: 'application/json',
      data: jsonStr,
      crossDomain: true,
    });
  }

  // ── Hide empty grid views on the page ──

  function hideEmptyGridViews() {
    var el3371 = document.getElementById('view_3371');
    if (el3371 && !viewHasDataRows('view_3371')) el3371.style.display = 'none';
    var el3343 = document.getElementById('view_3343');
    if (el3343 && !viewHasDataRows('view_3343')) el3343.style.display = 'none';
  }

  // ── Button injection ──

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;

    var sceneEl = document.getElementById('kn-' + SCENE_ID);
    if (!sceneEl) return;

    var $btn = $('<button></button>')
      .attr('id', BUTTON_ID)
      .text('Generate PDF')
      .css({
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        padding: '12px 24px',
        fontSize: '15px',
        fontWeight: 700,
        color: '#fff',
        background: '#07467c',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,.25)',
      });

    $btn.on('mouseenter', function () { $(this).css('opacity', 0.9); });
    $btn.on('mouseleave', function () { $(this).css('opacity', 1); });

    $btn.on('click', function () {
      var payload = scrapeAllViews();
      if (!payload.views.length) {
        alert('No proposal data found on this page.');
        return;
      }
      var htmlStr = buildPdfHtml(payload);
      openPdfPreview(htmlStr);
      payload.html = htmlStr;
      sendToWebhook(payload);
    });

    $(sceneEl).append($btn);
  }

  // ── Bind to scene render ──

  $(document).on('knack-scene-render.' + SCENE_ID, function () {
    setTimeout(function () {
      hideEmptyGridViews();
      injectButton();
    }, 1500);
  });

  $(document).on('knack-view-render.view_3371 knack-view-render.view_3343', function () {
    setTimeout(hideEmptyGridViews, 500);
  });
})();
