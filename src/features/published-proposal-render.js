/*** PUBLISHED PROPOSAL — Render stored PDF HTML on scene_1279 ***/
(function () {
  'use strict';

  var SCENE_ID   = 'scene_1279';
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
      '#' + IFRAME_ID + ' {',
      '  width: 100%; border: 1px solid #e0e0e0; border-radius: 6px;',
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

    var sceneEl = document.getElementById('kn-' + SCENE_ID);
    if (!sceneEl) return '';

    var viewEls = sceneEl.querySelectorAll('[id^="view_"]');
    for (var i = 0; i < viewEls.length; i++) {
      var viewId = viewEls[i].id;
      var view = Knack.views[viewId];
      if (!view || !view.model) continue;

      var attrs = view.model.attributes
               || (view.model.data && view.model.data.attributes)
               || null;
      if (!attrs) continue;

      // Prefer _raw (unformatted) if available
      var html = attrs[HTML_FIELD + '_raw'] || attrs[HTML_FIELD] || '';
      if (html) return html;
    }

    // Fallback: read from DOM
    var domEl = sceneEl.querySelector('.kn-detail.' + HTML_FIELD + ' .kn-detail-body');
    if (domEl) return domEl.innerHTML || '';

    return '';
  }

  // ── Render HTML in iframe ────────────────────────────────────

  function renderProposal(html) {
    injectStyles();

    // Find the field's detail container and inject iframe after it
    var sceneEl = document.getElementById('kn-' + SCENE_ID);
    if (!sceneEl) return;

    // Remove existing iframe if re-rendering
    var existing = document.getElementById(IFRAME_ID);
    if (existing) existing.remove();

    // Hide the raw field display
    var fieldEl = sceneEl.querySelector('.kn-detail.' + HTML_FIELD);
    if (fieldEl) fieldEl.style.display = 'none';

    // Create iframe
    var iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');

    // Insert iframe where the field was, or at top of scene
    if (fieldEl && fieldEl.parentNode) {
      fieldEl.parentNode.insertBefore(iframe, fieldEl.nextSibling);
    } else {
      sceneEl.insertBefore(iframe, sceneEl.firstChild);
    }

    // Write HTML into iframe
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
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

    // Resize after content loads and images render
    setTimeout(resizeIframe, 300);
    setTimeout(resizeIframe, 1000);
    setTimeout(resizeIframe, 3000);

    return html;
  }

  // ── Print button ─────────────────────────────────────────────

  function injectPrintButton(html) {
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
      win.document.write(html);
      win.document.close();
      setTimeout(function () { win.print(); }, 600);
    });

    document.body.appendChild(btn);
  }

  // ── Init ─────────────────────────────────────────────────────

  $(document).on('knack-scene-render.' + SCENE_ID + NS, function () {
    setTimeout(function () {
      var html = getStoredHtml();
      if (!html) {
        console.log('[SCW Published Proposal] No HTML found in ' + HTML_FIELD);
        return;
      }
      console.log('[SCW Published Proposal] Rendering stored HTML (' + html.length + ' chars)');
      renderProposal(html);
      injectPrintButton(html);
    }, 500);
  });
})();
