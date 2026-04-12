/*** PUBLISHED PROPOSAL — Render stored PDF HTML on scene_1279 ***/
(function () {
  'use strict';

  var SCENE_ID    = 'scene_1279';
  var VIEW_ID     = 'view_3813';
  var HTML_FIELD  = 'field_2680';
  var STYLE_ID    = 'scw-published-proposal-css';
  var IFRAME_ID   = 'scw-published-proposal-frame';
  var BTN_ID      = 'scw-published-proposal-print-btn';
  var NS          = '.scwPublishedProposal';

  // ── CSS ──────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '/* Hide the entire detail view */',
      '#' + VIEW_ID + ' { display: none !important; }',
      '/* Hide breadcrumb trail when this scene is active */',
      'body.scw-hide-crumbtrail .kn-crumbtrail { display: none !important; }',
      '',
      '#' + IFRAME_ID + ' {',
      '  width: 100%; border: none;',
      '  background: #fff; min-height: 400px;',
      '}',
      '#' + BTN_ID + ' {',
      '  position: fixed; bottom: 24px; right: 24px; z-index: 9999;',
      '  padding: 12px 24px; font-size: 15px; font-weight: 700;',
      '  color: #fff; background: #07467c; border: none; border-radius: 6px;',
      '  cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25);',
      '}',
      '#' + BTN_ID + ':hover { opacity: 0.9; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Extract raw HTML from Knack model ────────────────────────

  function getStoredHtml() {
    if (typeof Knack === 'undefined' || !Knack.views) return '';

    var view = Knack.views[VIEW_ID];
    if (view && view.model) {
      var attrs = view.model.attributes
               || (view.model.data && view.model.data.attributes)
               || null;
      if (attrs) {
        var html = attrs[HTML_FIELD + '_raw'] || attrs[HTML_FIELD] || '';
        if (html) return html;
      }
    }

    // Fallback: read from DOM
    var domEl = document.querySelector('#' + VIEW_ID + ' .kn-detail.' + HTML_FIELD + ' .kn-detail-body');
    if (domEl) return domEl.innerHTML || '';

    return '';
  }

  // ── Clean up Knack's mangled HTML and re-wrap with PDF CSS ───

  function buildFullHtml(fragment) {
    // Knack's rich text field strips <style>, <head>, <body>, <!DOCTYPE>
    // and converts newlines between block elements into <br> tags.

    // Strip wrapping <span> if Knack added one
    fragment = fragment.replace(/^<span>([\s\S]*)<\/span>$/i, '$1');

    // Remove <br> tags between block-level elements
    // These are spurious — Knack converted the \n separators from buildPdfHtml
    fragment = fragment.replace(/<br\s*\/?>\s*(?=<(?:div|table|thead|tbody|tfoot|tr|section|\/div|\/table|\/thead|\/tbody|\/tfoot|\/tr|\/section))/gi, '');
    fragment = fragment.replace(/(?:(?:<\/div>|<\/table>|<\/section>|<\/tr>|<\/tbody>|<\/tfoot>|<\/thead>))\s*<br\s*\/?>/gi, function (m) {
      return m.replace(/<br\s*\/?>/gi, '');
    });

    // Remove leading/trailing <br> tags
    fragment = fragment.replace(/^(\s*<br\s*\/?>\s*)+/i, '');
    fragment = fragment.replace(/(\s*<br\s*\/?>\s*)+$/i, '');

    // Also clean <br> right before/after closing block tags
    fragment = fragment.replace(/<br\s*\/?>\s*<\/div>/gi, '</div>');
    fragment = fragment.replace(/<br\s*\/?>\s*<\/td>/gi, '</td>');

    // Re-wrap connected device lists — Knack strips class attrs from spans
    // Matches patterns like (I-1, I-2, I-3) or (E-1) inside table cells
    fragment = fragment.replace(/\(([A-Z]-\d+(?:,\s*[A-Z]-\d+)*)\)/g, '<span class="connected-devices">($1)</span>');

    // Get the CSS from the PDF export module
    var css = '';
    if (window.SCW && window.SCW.pdfExport && window.SCW.pdfExport.getCss) {
      css = window.SCW.pdfExport.getCss();
    }

    // Scale up font sizes for comfortable on-screen reading
    // (the base CSS targets print at 11px body / 10px L4)
    var overrides = [
      'body { font-size: 14px; }',
      '.detail-label, .detail-value { font-size: 14px; }',
      '.richtext-content { font-size: 14px; }',
      '.l3-row td:first-child { font-size: 15px; }',
      '.l4-row td { font-size: 14px; padding-left: 40px; letter-spacing: 0.3px; line-height: 1.6; }',
      '.l4-row td.col-qty, .l4-row td.col-cost { font-size: 14px; }',
      '.connected-devices { font-size: 13px; }',
      '.product-table thead th { font-size: 11px; }',
      '.l2-header { font-size: 15px; }',
    ].join('\n');

    var html = [];
    html.push('<!DOCTYPE html>');
    html.push('<html><head><meta charset="utf-8">');
    html.push('<title>Proposal</title>');
    html.push('<style>');
    html.push(css);
    html.push(overrides);
    html.push('</style>');
    html.push('</head><body>');
    html.push(fragment);
    html.push('</body></html>');
    return html.join('\n');
  }

  // ── Render HTML in iframe ────────────────────────────────────

  function renderProposal(fullHtml) {
    injectStyles();

    var viewEl = document.getElementById(VIEW_ID);
    if (!viewEl) return;

    // Remove existing iframe if re-rendering
    var existing = document.getElementById(IFRAME_ID);
    if (existing) existing.remove();

    // Create iframe
    var iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');

    // Insert iframe after the hidden view element
    viewEl.parentNode.insertBefore(iframe, viewEl.nextSibling);

    // Write HTML into iframe
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(fullHtml);
    doc.close();

    // Auto-size iframe to content height
    function resizeIframe() {
      try {
        var body = doc.body;
        var docEl = doc.documentElement;
        if (body && docEl) {
          var height = Math.max(body.scrollHeight, body.offsetHeight, docEl.scrollHeight, docEl.offsetHeight);
          iframe.style.height = height + 40 + 'px';
        }
      } catch (e) {}
    }

    setTimeout(resizeIframe, 300);
    setTimeout(resizeIframe, 1000);
    setTimeout(resizeIframe, 3000);

    return fullHtml;
  }

  // ── Print button ─────────────────────────────────────────────

  function injectPrintButton(fullHtml) {
    if (document.getElementById(BTN_ID)) return;

    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = 'Print Proposal';

    btn.addEventListener('click', function () {
      var win = window.open('', '_blank');
      if (!win) {
        alert('Popup blocked — please allow popups for this site and try again.');
        return;
      }
      win.document.write(fullHtml);
      win.document.close();
      setTimeout(function () { win.print(); }, 600);
    });

    document.body.appendChild(btn);
  }

  // ── Init ─────────────────────────────────────────────────────

  // Remove breadcrumb class when navigating away
  $(document).on('knack-scene-render.any' + NS, function (event, scene) {
    if (scene.key !== SCENE_ID) {
      document.body.classList.remove('scw-hide-crumbtrail');
    }
  });

  $(document).on('knack-scene-render.' + SCENE_ID + NS, function () {
    document.body.classList.add('scw-hide-crumbtrail');
    setTimeout(function () {
      var raw = getStoredHtml();
      if (!raw) {
        console.log('[SCW Published Proposal] No HTML found in ' + HTML_FIELD);
        return;
      }
      console.log('[SCW Published Proposal] Raw fragment:', raw.length, 'chars');
      var fullHtml = buildFullHtml(raw);
      console.log('[SCW Published Proposal] Full HTML:', fullHtml.length, 'chars');
      renderProposal(fullHtml);
      injectPrintButton(fullHtml);
    }, 500);
  });
})();
