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

  // CTA buttons surfaced inside the iframe — one entry per source view
  // on the scene. Each entry's gate is evaluated against the published-
  // proposal record's attrs; if true, every action link inside that
  // view is mirrored as a button in the CTA bar (above the first
  // .view-title in the iframe).
  //
  //   view_3858 — "I'm Ready for a Site Survey" link, shown for GFE
  //               and Equipment-Only proposals (and only while no
  //               change requests have queued yet — once they have,
  //               the workflow is past the survey stage).
  //   view_3902 — Final-bid CTA, shown only when field_2747 = Yes.
  var CTA_CONFIGS = [
    {
      viewId: 'view_3858',
      gate: function (attrs) {
        if (readCrCount() > 0) return false;
        return isYesValue(attrs.field_2746) || isYesValue(attrs.field_2746_raw)
            || isYesValue(attrs.field_2748) || isYesValue(attrs.field_2748_raw);
      }
    },
    {
      viewId: 'view_3902',
      gate: function (attrs) {
        return isYesValue(attrs.field_2747) || isYesValue(attrs.field_2747_raw);
      }
    }
  ];

  // ── CSS ──────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    // Hide every configured CTA source view on the parent page — its
    // links/buttons are read out and re-injected inside the iframe by
    // the renderer. Showing it here would just duplicate.
    var hideRules = CTA_CONFIGS.map(function (c) {
      return '#' + c.viewId + ' { display: none !important; }';
    }).join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '/* Hide the entire detail view */',
      '#' + VIEW_ID + ' { display: none !important; }',
      hideRules,
      '/* Hide breadcrumb trail + view_3874 when this scene is active */',
      'body.scw-hide-crumbtrail .kn-crumbtrail,',
      'body.scw-hide-crumbtrail #view_3874 { display: none !important; }',
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

  // Inject immediately so view_3813 is hidden before Knack renders it
  injectStyles();

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

    // Patch the expiration-date cell from the live record (field_2659)
    // — the HTML stored in field_2680 is a snapshot from the moment of
    // publish, but the published-proposal record's expiration date can
    // be edited after the fact. Show the current value, not the
    // snapshot.
    setTimeout(function () { patchExpirationDate(iframe); }, 250);
    setTimeout(function () { patchExpirationDate(iframe); }, 1200);

    // Inject the CTA bar inside the iframe, just above the first
    // .view-title — typically "Proposed Solution" — so it sits between
    // the project-address detail row and the line-items table.
    // Idempotent re-runs are guarded by .scw-cta-bar presence in the
    // iframe body. Resize after the bar lays out so the iframe height
    // includes it.
    setTimeout(function () { injectCtaIntoIframe(iframe, resizeIframe); }, 250);
    setTimeout(function () { injectCtaIntoIframe(iframe, resizeIframe); }, 1200);

    return fullHtml;
  }

  // ── CTA bar (CTA_CONFIGS → iframe) ───────────────────────────
  //
  // Each CTA_CONFIGS entry's gate is evaluated against the published-
  // proposal record's attrs; matching entries' action links get mirrored
  // as styled <a target=_top> buttons inside the iframe, inserted just
  // above the first .view-title.

  function isYesValue(v) {
    if (v === true) return true;
    if (typeof v === 'string') return /^(yes|true)$/i.test(v.trim());
    return false;
  }

  // ── Live expiration date (field_2659) ──────────────────────
  // The published HTML in field_2680 is a snapshot from publish-time
  // and bakes in whatever expiration date was on the SOW then. After
  // publish, the proposal record's expiration (field_2659) can be
  // edited — those edits should reflect on the page without
  // re-publishing the whole quote. Find the "Expiration Date" row in
  // the iframe's detail-table and overwrite its value cell with the
  // record's current field_2659 value.
  var EXPIRATION_FIELD = 'field_2659';

  function readLiveExpirationDate() {
    var attrs = readPublishedProposalAttrs();
    if (!attrs) return '';
    var raw = attrs[EXPIRATION_FIELD + '_raw'];
    if (raw && typeof raw === 'object') {
      // Knack date fields can come back as { date, date_formatted, … }
      if (raw.date_formatted) return String(raw.date_formatted).trim();
      if (raw.date)            return String(raw.date).trim();
    }
    var v = attrs[EXPIRATION_FIELD];
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').trim();
  }

  function patchExpirationDate(iframe) {
    if (!iframe) return;
    var doc;
    try { doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document); }
    catch (e) { return; }
    if (!doc || !doc.body) return;

    var live = readLiveExpirationDate();
    if (!live) return;

    // Already patched? Skip — re-runs are idempotent.
    if (doc.body.querySelector('.detail-value[data-scw-live-exp]')) return;

    var labels = doc.body.querySelectorAll('td.detail-label');
    for (var i = 0; i < labels.length; i++) {
      var labelText = (labels[i].textContent || '').trim().toLowerCase();
      // Match "Expiration Date" / "Expires" — anything that starts
      // with "expir" is the expiration label.
      if (!/^expir/.test(labelText)) continue;
      var valueCell = labels[i].nextElementSibling;
      if (valueCell && valueCell.classList && valueCell.classList.contains('detail-value')) {
        valueCell.textContent = live;
        valueCell.setAttribute('data-scw-live-exp', '1');
      }
      break;
    }
  }

  function readPublishedProposalAttrs() {
    try {
      var v = window.Knack && Knack.views && Knack.views[VIEW_ID];
      var attrs = v && v.model && (v.model.attributes
                  || (v.model.data && v.model.data.attributes));
      return attrs || null;
    } catch (e) { return null; }
  }

  // Read field_2728 (count of pending change requests) off the SOW
  // detail view that's also on this scene (view_3874). Returns 0 if
  // the view or the field isn't populated yet.
  var SOW_DETAIL_VIEW = 'view_3874';
  var CR_COUNT_FIELD  = 'field_2728';
  function readCrCount() {
    try {
      var v = window.Knack && Knack.views && Knack.views[SOW_DETAIL_VIEW];
      var attrs = v && v.model && (v.model.attributes
                  || (v.model.data && v.model.data.attributes));
      if (!attrs) return 0;
      var raw = attrs[CR_COUNT_FIELD + '_raw'];
      var val = (raw != null) ? raw : attrs[CR_COUNT_FIELD];
      var n = Number(String(val == null ? '' : val).replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? 0 : n;
    } catch (e) { return 0; }
  }

  function readLinksFromView(viewId) {
    var src = document.getElementById(viewId);
    if (!src) return [];
    var anchors = src.querySelectorAll('a.kn-link, a.kn-link-page, a.kn-button, button.kn-button');
    var out = [];
    for (var i = 0; i < anchors.length; i++) {
      var el = anchors[i];
      var label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      var href = el.getAttribute && el.getAttribute('href');
      out.push({ label: label, href: href || '' });
    }
    return out;
  }

  function gatherCtaLinks() {
    var attrs = readPublishedProposalAttrs();
    if (!attrs) return [];
    var all = [];
    for (var i = 0; i < CTA_CONFIGS.length; i++) {
      var cfg = CTA_CONFIGS[i];
      try {
        if (!cfg.gate(attrs)) continue;
      } catch (e) { continue; }
      var links = readLinksFromView(cfg.viewId);
      for (var j = 0; j < links.length; j++) all.push(links[j]);
    }
    return all;
  }

  function injectCtaIntoIframe(iframe, onAfter) {
    if (!iframe) return;
    var doc;
    try { doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document); }
    catch (e) { return; }
    if (!doc || !doc.body) return;
    if (doc.body.querySelector('.scw-cta-bar')) return;     // already injected

    var links = gatherCtaLinks();
    if (!links.length) return;

    var firstTitle = doc.body.querySelector('.view-title');
    if (!firstTitle) return;     // no anchor to insert before

    var bar = doc.createElement('div');
    bar.className = 'scw-cta-bar';
    bar.style.cssText =
      'margin: 16px 0 24px 0; padding: 14px 18px;' +
      'background: #fff5e6; border: none;' +
      'border-radius: 8px; display: flex; gap: 10px;' +
      'flex-direction: column; align-items: stretch;';

    for (var i = 0; i < links.length; i++) {
      var btn = doc.createElement('a');
      btn.textContent = links[i].label;
      if (links[i].href) btn.setAttribute('href', links[i].href);
      // target=_top so the link navigates the parent window — keeping
      // it _self would scope the navigation to the iframe and break
      // Knack routing.
      btn.setAttribute('target', '_top');
      btn.style.cssText =
        'display: block; width: 100%; box-sizing: border-box;' +
        'padding: 10px 22px; font-size: 15px; font-weight: 400;' +
        'background: orange; color: #fff; text-decoration: none;' +
        'border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,.18);' +
        'text-align: center;';
      bar.appendChild(btn);
    }

    firstTitle.parentNode.insertBefore(bar, firstTitle);
    if (typeof onAfter === 'function') onAfter();
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
      var oldBtn = document.getElementById(BTN_ID);
      if (oldBtn) oldBtn.remove();
    }
  });

  // If any CTA source view renders later than the iframe is built
  // (Knack doesn't guarantee view-render order), retry the iframe
  // injection then.
  for (var ci = 0; ci < CTA_CONFIGS.length; ci++) {
    (function (vid) {
      $(document).on('knack-view-render.' + vid + NS, function () {
        var iframe = document.getElementById(IFRAME_ID);
        if (iframe) injectCtaIntoIframe(iframe);
      });
    })(CTA_CONFIGS[ci].viewId);
  }

  $(document).on('knack-scene-render.' + SCENE_ID + NS, function () {
    document.body.classList.add('scw-hide-crumbtrail');
    setTimeout(function () {
      var raw = getStoredHtml();
      if (!raw) {
        SCW.debug('[SCW Published Proposal] No HTML found in ' + HTML_FIELD);
        return;
      }
      SCW.debug('[SCW Published Proposal] Raw fragment:', raw.length, 'chars');
      var fullHtml = buildFullHtml(raw);
      SCW.debug('[SCW Published Proposal] Full HTML:', fullHtml.length, 'chars');
      renderProposal(fullHtml);
      injectPrintButton(fullHtml);
    }, 500);
  });
})();
