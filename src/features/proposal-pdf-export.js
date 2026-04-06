/*** PROPOSAL PDF EXPORT — scene_1096 ***/
(function () {
  'use strict';

  var SCENE_ID = 'scene_1096';
  var WEBHOOK_URL = 'https://hook.us1.make.com/ozk2uk1e58upnpsj0fx1bmdg387ekvf5';
  var BUTTON_ID = 'scw-proposal-pdf-btn';
  var VIEW_IDS = ['view_3301', 'view_3341', 'view_3371'];

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

  function isVisible(tr) {
    return tr.style.display !== 'none' && !tr.classList.contains('scw-hide-level3-header') && !tr.classList.contains('scw-hide-level4-header');
  }

  // ── DOM scraper ──

  function scrapeView(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;

    var tbody = root.querySelector('.kn-table tbody');
    if (!tbody) return null;

    var rows = Array.from(tbody.children);
    if (!rows.length) return null;

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
          level: 2,
          label: l2Label,
          isPromoted: isPromoted,
          products: [],
          footer: null,
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
        if (!isVisible(tr)) continue;

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
          level: 3,
          label: l3Label,
          qty: l3Qty,
          cost: l3Cost,
          connectedDevices: connDevices,
          isMountingHardware: isMounting,
          lineItems: [],
        };

        if (currentL2) currentL2.products.push(currentL3);
        continue;
      }

      if (tr.classList.contains('kn-group-level-4')) {
        if (!isVisible(tr)) continue;

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
          level: 4,
          label: l4Label,
          description: description,
          qty: l4Qty,
          cost: l4Cost,
          cameraList: cameraList,
        };

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
            hasDiscount: false,
            lines: [],
          };
        }

        var lineLabel = tr.querySelector('.scw-l1-label');
        var lineValue = tr.querySelector('.scw-l1-value');
        if (lineLabel && lineValue) {
          var type = 'final';
          if (tr.classList.contains('scw-l1-line--sub')) type = 'sub';
          else if (tr.classList.contains('scw-l1-line--disc')) { type = 'disc'; currentL1.footer.hasDiscount = true; }

          currentL1.footer.lines.push({
            type: type,
            label: norm(lineLabel.textContent),
            value: norm(lineValue.textContent),
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

    return { viewId: viewId, sections: sections, projectTotals: projectTotals };
  }

  function scrapeAllViews() {
    var result = { views: [] };
    for (var i = 0; i < VIEW_IDS.length; i++) {
      var data = scrapeView(VIEW_IDS[i]);
      if (data && data.sections.length) result.views.push(data);
    }
    for (var j = 0; j < result.views.length; j++) {
      if (result.views[j].projectTotals) { result.projectTotals = result.views[j].projectTotals; break; }
    }
    return result;
  }

  // ══════════════════════════════════════════════════════════════
  // HTML PDF RENDERER — builds a print-ready page from JSON
  // ══════════════════════════════════════════════════════════════

  function buildPdfHtml(payload) {
    var view = payload.views[0];
    if (!view) return '';

    var html = [];

    html.push('<!DOCTYPE html>');
    html.push('<html><head><meta charset="utf-8">');
    html.push('<title>Proposal</title>');
    html.push('<style>');
    html.push(getPdfCss());
    html.push('</style>');
    html.push('</head><body>');

    // ── Render each L1 section ──
    for (var s = 0; s < view.sections.length; s++) {
      var section = view.sections[s];

      // Skip empty placeholder sections (blank promoted L1 with no content)
      if (section.promoted && !section.label && !section.buckets.length) continue;
      // Skip sections with no real content (only empty buckets, no footer)
      if (!section.footer && !hasSectionContent(section)) continue;

      html.push('<div class="l1-section">');

      // L1 header
      if (section.label) {
        html.push('<div class="l1-header">' + esc(section.label) + '</div>');
      }

      // Render each L2 bucket
      for (var b = 0; b < section.buckets.length; b++) {
        var bucket = section.buckets[b];
        if (!bucket.products.length && !bucket.footer) continue;

        // Skip promoted L2 headers (label already shown as L1)
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

            html.push('<tr class="l3-row"' + '>');
            html.push('<td' + prodClass + '>' + esc(prod.label));
            if (prod.connectedDevices && prod.connectedDevices.length) {
              html.push('<span class="connected-devices">(' + esc(prod.connectedDevices.join(', ')) + ')</span>');
            }
            html.push('</td>');
            html.push('<td class="col-qty">' + prod.qty + '</td>');
            html.push('<td class="col-cost">' + esc(prod.cost) + '</td>');
            html.push('</tr>');

            // L4 line items
            for (var li = 0; li < prod.lineItems.length; li++) {
              var item = prod.lineItems[li];
              html.push('<tr class="l4-row">');
              html.push('<td class="l4-desc">' + esc(item.label) + '</td>');
              html.push('<td class="col-qty">' + item.qty + '</td>');
              html.push('<td class="col-cost">' + esc(item.cost) + '</td>');
              html.push('</tr>');
            }
          }

          html.push('</tbody>');

          // L2 footer
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

      // L1 footer
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

      html.push('</div>'); // .l1-section
    }

    // ── Project Totals ──
    var pt = payload.projectTotals || view.projectTotals;
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
    // Auto-trigger print dialog after a brief render delay
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
      // Build the HTML once, use it for both preview and webhook
      var htmlStr = buildPdfHtml(payload);
      // Open print-ready PDF preview
      openPdfPreview(htmlStr);
      // Fire webhook with data + rendered HTML
      payload.html = htmlStr;
      sendToWebhook(payload);
    });

    $(sceneEl).append($btn);
  }

  // ── Bind to scene render ──

  $(document).on('knack-scene-render.' + SCENE_ID, function () {
    setTimeout(injectButton, 1500);
  });
})();
