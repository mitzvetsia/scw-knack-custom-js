/*** PROPOSAL PDF EXPORT — scene_1096 ***/
(function () {
  'use strict';

  var SCENE_ID = 'scene_1096';
  var WEBHOOK_URL = 'https://hook.us1.make.com/ozk2uk1e58upnpsj0fx1bmdg387ekvf5';
  var BUTTON_ID = 'scw-proposal-pdf-btn';
  var VIEW_IDS = ['view_3301', 'view_3341', 'view_3371'];

  // Reuse the same field keys as proposal-grid.js
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

  function formatMoney(n) {
    var num = Number(n || 0);
    return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function cellText(row, fieldKey) {
    var td = row.querySelector('td.' + fieldKey);
    return td ? norm(td.textContent) : '';
  }

  function cellNum(row, fieldKey) {
    return parseMoney(cellText(row, fieldKey));
  }

  function groupLabelText(tr) {
    var td = tr.querySelector('td:first-child');
    return td ? norm(td.textContent) : '';
  }

  function isVisible(tr) {
    return tr.style.display !== 'none' && !tr.classList.contains('scw-hide-level3-header') && !tr.classList.contains('scw-hide-level4-header');
  }

  // ── DOM scraper: walk the rendered tbody and build the JSON ──

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

      // Skip data rows (hidden in proposal view) and subtotal rows (we rebuild totals from headers)
      if (tr.id && !tr.classList.contains('kn-table-group') && !tr.classList.contains('scw-level-total-row')) continue;

      // ── L1 group header ──
      if (tr.classList.contains('kn-group-level-1')) {
        var l1Label = groupLabelText(tr);
        // Skip blank/hidden L1 headers (promoted L2 scenario)
        if (tr.style.display === 'none') {
          // Blank L1 — subsequent L2s are promoted. We still create a placeholder.
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

      // ── L2 group header ──
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
          // Promoted L2 acts as its own L1
          currentL1 = { level: 1, label: l2Label, promoted: true, buckets: [], footer: null };
          sections.push(currentL1);
        }

        if (currentL1) currentL1.buckets.push(currentL2);
        currentL3 = null;
        continue;
      }

      // ── L3 group header ──
      if (tr.classList.contains('kn-group-level-3')) {
        if (!isVisible(tr)) continue;

        var l3Label = groupLabelText(tr);
        var l3Qty = parseMoney(norm((tr.querySelector('td.' + KEYS.qty) || {}).textContent || ''));
        var l3Cost = norm((tr.querySelector('td.' + KEYS.cost) || {}).textContent || '');

        // Extract connected devices if present
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

      // ── L4 group header ──
      if (tr.classList.contains('kn-group-level-4')) {
        if (!isVisible(tr)) continue;

        var labelCell = tr.querySelector('td:first-child');
        var l4Label = labelCell ? norm(labelCell.textContent) : '';

        // Extract rich description (the .scw-l4-2019 span or the full label cell)
        var descSpan = tr.querySelector('.scw-l4-2019');
        var description = '';
        if (descSpan) {
          description = descSpan.innerHTML || '';
        }

        // Extract camera list if present
        var camB = tr.querySelector('.scw-concat-cameras b');
        var cameraList = '';
        if (camB) {
          cameraList = norm(camB.textContent).replace(/^\(/, '').replace(/\)$/, '');
        }

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

      // ── L2 subtotal row ──
      if (tr.classList.contains('scw-subtotal--level-2')) {
        var l2FooterLabel = norm(tr.getAttribute('data-scw-group-label') || '');
        var l2FooterQty = parseMoney(norm((tr.querySelector('td.' + KEYS.qty) || {}).textContent || ''));
        var l2FooterCost = norm((tr.querySelector('td.' + KEYS.cost) || {}).textContent || '');

        if (currentL2) {
          currentL2.footer = {
            label: l2FooterLabel,
            qty: l2FooterQty,
            cost: l2FooterCost,
          };
        }
        continue;
      }

      // ── L1 footer rows ──
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

      // ── Project totals ──
      // (handled separately below)
    }

    // ── Scrape project totals ──
    var projectTotals = null;
    var ptRows = tbody.querySelectorAll('tr.scw-project-totals');
    if (ptRows.length) {
      projectTotals = { title: 'Project Totals', lines: [] };
      for (var p = 0; p < ptRows.length; p++) {
        var ptr = ptRows[p];
        var ptTitle = ptr.querySelector('.scw-l1-title');
        if (ptTitle) {
          projectTotals.title = norm(ptTitle.textContent);
          continue;
        }
        var ptLabel = ptr.querySelector('.scw-l1-label');
        var ptValue = ptr.querySelector('.scw-l1-value');
        if (ptLabel && ptValue) {
          var ptType = 'final';
          if (ptr.classList.contains('scw-l1-line--sub')) ptType = 'sub';
          else if (ptr.classList.contains('scw-l1-line--disc')) ptType = 'disc';

          projectTotals.lines.push({
            type: ptType,
            label: norm(ptLabel.textContent),
            value: norm(ptValue.textContent),
          });
        }
      }
    }

    return {
      viewId: viewId,
      sections: sections,
      projectTotals: projectTotals,
    };
  }

  function scrapeAllViews() {
    var result = { views: [] };

    for (var i = 0; i < VIEW_IDS.length; i++) {
      var data = scrapeView(VIEW_IDS[i]);
      if (data && data.sections.length) {
        result.views.push(data);
      }
    }

    // Use the first view that has project totals
    for (var j = 0; j < result.views.length; j++) {
      if (result.views[j].projectTotals) {
        result.projectTotals = result.views[j].projectTotals;
        break;
      }
    }

    return result;
  }

  // ── Send to webhook ──

  function sendToWebhook(data, $btn) {
    $btn.prop('disabled', true).text('Sending…');

    var jsonStr = JSON.stringify(data);
    console.log('[SCW PDF Export] payload size:', jsonStr.length, 'bytes');
    console.log('[SCW PDF Export] payload:', data);

    $.ajax({
      url: WEBHOOK_URL,
      type: 'POST',
      contentType: 'application/json',
      data: jsonStr,
      crossDomain: true,
      success: function (resp, status, xhr) {
        console.log('[SCW PDF Export] success:', status, resp);
        $btn.text('Sent ✓').css('background', '#28a745');
        setTimeout(function () {
          $btn.prop('disabled', false).text('Generate PDF').css('background', '');
        }, 3000);
      },
      error: function (xhr, status, err) {
        console.error('[SCW PDF Export] webhook error:', status, err, 'HTTP', xhr.status, xhr.responseText);
        // If CORS blocked, xhr.status is 0 — try fallback with no preflight
        if (xhr.status === 0) {
          console.log('[SCW PDF Export] Retrying with text/plain to avoid CORS preflight…');
          $.ajax({
            url: WEBHOOK_URL,
            type: 'POST',
            contentType: 'text/plain',
            data: jsonStr,
            crossDomain: true,
            success: function () {
              console.log('[SCW PDF Export] fallback success');
              $btn.text('Sent ✓').css('background', '#28a745');
              setTimeout(function () {
                $btn.prop('disabled', false).text('Generate PDF').css('background', '');
              }, 3000);
            },
            error: function (xhr2, status2, err2) {
              console.error('[SCW PDF Export] fallback also failed:', status2, err2);
              $btn.text('Error — retry?').css('background', '#dc3545');
              setTimeout(function () {
                $btn.prop('disabled', false).text('Generate PDF').css('background', '');
              }, 4000);
            },
          });
          return;
        }
        $btn.text('Error — retry?').css('background', '#dc3545');
        setTimeout(function () {
          $btn.prop('disabled', false).text('Generate PDF').css('background', '');
        }, 4000);
      },
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
      console.log('[SCW PDF Export] Button clicked — scraping views:', VIEW_IDS);
      var payload = scrapeAllViews();
      console.log('[SCW PDF Export] Scraped', payload.views.length, 'views, sections:', payload.views.map(function (v) { return v.viewId + ':' + v.sections.length; }));
      if (!payload.views.length) {
        console.warn('[SCW PDF Export] No data found. Views in DOM:', VIEW_IDS.map(function (id) { return id + '=' + !!document.getElementById(id); }));
        alert('No proposal data found on this page.');
        return;
      }
      sendToWebhook(payload, $btn);
    });

    $(sceneEl).append($btn);
  }

  // ── Bind to scene render ──

  $(document).on('knack-scene-render.' + SCENE_ID, function () {
    // Delay slightly so proposal-grid.js pipeline finishes first
    setTimeout(injectButton, 1500);
  });
})();
