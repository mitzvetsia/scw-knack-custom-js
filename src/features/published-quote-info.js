/*** FEATURE: Published quote info widget (shared) ***/
/**
 * Single source of truth for the "Published Proposal" widget that
 * appears across the app — the SOW grid (view_3325), the proposal
 * page (view_3883), and the sales build totals panel (driven by
 * view_3814). Before this module each location had its own copy of
 * the read-from-Knack-and-render-DOM logic; the look drifted out
 * of sync over time and the type chip had to be wired in three
 * separate places.
 *
 * Public API (window.SCW.publishedQuoteInfo):
 *
 *   read(opts)
 *     opts: {
 *       sourceView   : 'view_3886',                // required
 *       statusField  : 'field_2658' (default),
 *       nameField    : 'field_2665' (default),
 *       expField     : 'field_2659' (default),
 *       pdfField     : 'field_2681' (default),
 *       sowField     : 'field_2666' (optional — only used for indexing
 *                                    by SOW; not needed for single-SOW
 *                                    lookups where the source view is
 *                                    already filtered).
 *     }
 *     Returns the first published proposal as
 *       { recordId, name, expDate, pdfUrl, pdfName, viewLink, type }
 *     or null. Tries the Knack model first, then falls back to DOM
 *     scraping when the model isn't populated yet.
 *
 *   readById(opts)
 *     Same shape, but returns a map keyed by SOW record id. Requires
 *     opts.sowField. Used by the SOW grid to index every published
 *     proposal at once and look them up per row.
 *
 *   buildBlock(proposal, opts)
 *     opts: {
 *       variant   : 'compact' | 'regular' | 'panel'   (default 'regular')
 *       header    : string — render a "PUBLISHED PROPOSAL" label above
 *                   (omit for variants that don't want a header)
 *       emptyText : string — what to render when proposal is null
 *                   (omit to render nothing on empty)
 *       linkBuilder : function(proposal) → href, override the default
 *                     "#published-proposals/sow-published-proposal-details/<id>"
 *                     link target. Used by the proposal-page widget
 *                     which prefers the in-row "View Published Proposal"
 *                     anchor href instead.
 *     }
 *     Returns a DOM element ready to append.
 *
 *   renderInto(container, proposal, opts)
 *     Convenience: removes any previous block this module injected
 *     (.scw-pq-info already in container) and appends a new one.
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-pq-info-css';

  // Default field keys — matches the current Published Proposal object.
  // Per-call overrides via opts are honored.
  var DEFAULT_STATUS = 'field_2658';   // "Published" / "Draft" / etc.
  var DEFAULT_NAME   = 'field_2665';   // proposal display name
  var DEFAULT_EXP    = 'field_2659';   // expiration date
  var DEFAULT_PDF    = 'field_2681';   // PDF file
  var DEFAULT_SOW    = 'field_2666';   // connection → SOW

  // ── CSS ────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      // ── Block ──
      '.scw-pq-info {' +
      '  font: 400 11px/1.4 system-ui, sans-serif;' +
      '  color: #64748b;' +
      '  text-align: center;' +
      '}' +
      // Compact (SOW grid table cell) — tight padding, top divider.
      '.scw-pq-info--compact {' +
      '  margin-top: 8px;' +
      '  padding-top: 6px;' +
      '  border-top: 1px solid #e5e7eb;' +
      '  font-size: 11px;' +
      '}' +
      // Regular (proposal page, inline) — ~30% larger than compact.
      '.scw-pq-info--regular {' +
      '  font-size: 14px;' +
      '}' +
      '.scw-pq-info--regular .scw-pq-name { font-size: 14px; }' +
      '.scw-pq-info--regular .scw-pq-exp,' +
      '.scw-pq-info--regular .scw-pq-pdf  { font-size: 13.5px; }' +
      // Panel (sales totals) — right-aligned with a top border, header
      // label, and consistent inner spacing. The container sets its own
      // outer margin so the panel docks against whatever sits above it.
      '.scw-pq-info--panel {' +
      '  border-top: 1px solid #e5e7eb;' +
      '  margin-top: 12px;' +
      '  padding: 10px 10px 0 0;' +
      '  text-align: right;' +
      '}' +

      // ── Header (panel only) ──
      '.scw-pq-header {' +
      '  font-size: 12px; font-weight: 700;' +
      '  color: #163C6E; text-transform: uppercase;' +
      '  letter-spacing: 0.04em; margin-bottom: 6px;' +
      '}' +

      // ── Name + link ──
      '.scw-pq-name {' +
      '  font-weight: 500; margin-bottom: 2px;' +
      '  color: #1e293b;' +
      '}' +
      '.scw-pq-name a, .scw-pq-name a:visited {' +
      '  color: #2563eb; text-decoration: none;' +
      '}' +
      '.scw-pq-name a:hover { text-decoration: underline; }' +

      // ── Expiration date ──
      '.scw-pq-exp {' +
      '  font-size: 10.5px;' +
      '  color: #64748b;' +
      '  margin-bottom: 2px;' +
      '}' +

      // ── PDF link ──
      '.scw-pq-pdf, .scw-pq-pdf:visited {' +
      '  display: inline-flex; align-items: center;' +
      '  margin-top: 3px; color: #2563eb;' +
      '  text-decoration: none; font-size: 10.5px;' +
      '  font-weight: 500;' +
      '}' +
      '.scw-pq-pdf svg {' +
      '  vertical-align: -1px; margin-right: 3px;' +
      '}' +
      '.scw-pq-pdf:hover { text-decoration: underline; }' +

      // ── Empty state ──
      '.scw-pq-empty {' +
      '  font-style: italic; color: #94a3b8;' +
      '}';
    document.head.appendChild(s);
  }

  // ── Status check ───────────────────────────────────────────────
  function isPublishedAttrs(attrs, statusField) {
    var raw = attrs[statusField + '_raw'];
    if (typeof raw === 'string' && raw.trim()) return /published/i.test(raw);
    var v = attrs[statusField];
    if (typeof v === 'string' && v.trim()) {
      return /published/i.test(v.replace(/<[^>]*>/g, ''));
    }
    return false;
  }
  function isPublishedRow(tr, statusField) {
    var cell = tr.querySelector('td.' + statusField +
                                ', td[data-field-key="' + statusField + '"]');
    if (!cell) return true;   // status column absent — accept all
    var text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
    return /published/i.test(text);
  }

  // ── Extract one record's normalized info ──────────────────────
  function fromAttrs(attrs, fields) {
    var id      = attrs.id || '';
    var name    = String(attrs[fields.name] || '').replace(/<[^>]*>/g, '').trim();
    var expDate = String(attrs[fields.exp]  || '').replace(/<[^>]*>/g, '').trim();

    // PDF file — Knack stores either an object on _raw or anchor-html
    // on the bare field. Try both, then HTML-anchor regex fallback.
    var pdfUrl = '', pdfName = '';
    var pdfRaw = attrs[fields.pdf + '_raw'];
    if (pdfRaw && typeof pdfRaw === 'object') {
      pdfUrl  = pdfRaw.url || '';
      pdfName = pdfRaw.filename || '';
    }
    if (!pdfUrl) {
      var pdfHtml = String(attrs[fields.pdf] || '');
      var mHref = pdfHtml.match(/href="([^"]+)"/i);
      if (mHref) pdfUrl = mHref[1];
      var mName = pdfHtml.match(/>([^<]+\.pdf)</i);
      if (mName) pdfName = mName[1];
    }

    // "View Published Proposal" link — Knack renders this as a
    // kn-link-page anchor inside the row. Scrape from the live DOM.
    var viewLink = '';
    if (id && fields.sourceView) {
      var viewEl = document.getElementById(fields.sourceView);
      if (viewEl) {
        var row = viewEl.querySelector('tr#' + id);
        if (row) {
          var a = row.querySelector('a.kn-link-page');
          if (a) viewLink = a.getAttribute('href') || '';
        }
      }
    }

    return {
      recordId: id,
      name:     name,
      expDate:  expDate,
      pdfUrl:   pdfUrl,
      pdfName:  pdfName || 'Download PDF',
      viewLink: viewLink,
      type:     (window.SCW && SCW.proposalTypeChip)
                  ? SCW.proposalTypeChip.getType(attrs) : null
    };
  }

  function fromDom(tr, fields) {
    function cellText(fk) {
      var td = tr.querySelector('td.' + fk +
                                ', td[data-field-key="' + fk + '"]');
      return td ? (td.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }
    function cellAnchor(fk) {
      var td = tr.querySelector('td.' + fk +
                                ', td[data-field-key="' + fk + '"]');
      return td ? td.querySelector('a') : null;
    }
    var pdfA  = cellAnchor(fields.pdf);
    var pageA = tr.querySelector('a.kn-link-page');

    // Type detection from DOM cells — only works if the boolean fields
    // are on the view's columns; otherwise type stays null.
    var type = null;
    if (window.SCW && SCW.proposalTypeChip) {
      function flagFromCell(fk) {
        var td = tr.querySelector('td.' + fk +
                                  ', td[data-field-key="' + fk + '"]');
        if (!td) return false;
        return /yes/i.test((td.textContent || '').trim());
      }
      if (flagFromCell(SCW.proposalTypeChip.GFE_FIELD))             type = 'gfe';
      else if (flagFromCell(SCW.proposalTypeChip.FINAL_FIELD))      type = 'final';
      else if (flagFromCell(SCW.proposalTypeChip.EQUIP_ONLY_FIELD)) type = 'equipment-only';
    }

    return {
      recordId: tr.id || '',
      name:     cellText(fields.name),
      expDate:  cellText(fields.exp),
      pdfUrl:   pdfA  ? (pdfA.getAttribute('href') || '') : '',
      pdfName:  pdfA  ? ((pdfA.textContent || '').trim() || 'Download PDF')
                      : 'Download PDF',
      viewLink: pageA ? (pageA.getAttribute('href') || '') : '',
      type:     type
    };
  }

  function resolveFields(opts) {
    return {
      sourceView: opts.sourceView,
      status:     opts.statusField || DEFAULT_STATUS,
      name:       opts.nameField   || DEFAULT_NAME,
      exp:        opts.expField    || DEFAULT_EXP,
      pdf:        opts.pdfField    || DEFAULT_PDF,
      sow:        opts.sowField    || DEFAULT_SOW
    };
  }

  // ── Read first published proposal ─────────────────────────────
  function read(opts) {
    opts = opts || {};
    if (!opts.sourceView) return null;
    var fields = resolveFields(opts);

    // Knack model first — fully-typed, includes _raw values.
    try {
      var v = window.Knack && Knack.views && Knack.views[opts.sourceView];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (models && models.length) {
        for (var i = 0; i < models.length; i++) {
          var a = models[i].attributes;
          if (!a || !isPublishedAttrs(a, fields.status)) continue;
          return fromAttrs(a, fields);
        }
      }
    } catch (e) { /* fall through */ }

    // DOM fallback.
    try {
      var viewEl = document.getElementById(opts.sourceView);
      if (viewEl) {
        var rows = viewEl.querySelectorAll('tbody tr[id]');
        for (var r = 0; r < rows.length; r++) {
          var tr = rows[r];
          if (!/^[a-f0-9]{24}$/i.test(tr.id || '')) continue;
          if (!isPublishedRow(tr, fields.status)) continue;
          return fromDom(tr, fields);
        }
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  // ── Read map keyed by SOW record id ───────────────────────────
  // Used by the SOW grid (ops-review-pill) where one view holds many
  // published proposals across many SOWs. Pulls the connection cell's
  // hex id (DOM) or _raw value (model) per row.
  function readById(opts) {
    opts = opts || {};
    if (!opts.sourceView || !opts.sowField) return {};
    var fields = resolveFields(opts);
    var idx = {};

    // Model path.
    try {
      var v = window.Knack && Knack.views && Knack.views[opts.sourceView];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (models && models.length) {
        for (var i = 0; i < models.length; i++) {
          var a = models[i].attributes;
          if (!a || !isPublishedAttrs(a, fields.status)) continue;
          var sowId = readSowFromAttrs(a, fields.sow);
          if (!sowId || idx[sowId]) continue;
          idx[sowId] = fromAttrs(a, fields);
        }
        if (Object.keys(idx).length) return idx;
      }
    } catch (e) { /* fall through */ }

    // DOM fallback.
    try {
      var viewEl = document.getElementById(opts.sourceView);
      if (viewEl) {
        var rows = viewEl.querySelectorAll('tbody tr[id]');
        for (var r = 0; r < rows.length; r++) {
          var tr = rows[r];
          if (!/^[a-f0-9]{24}$/i.test(tr.id || '')) continue;
          if (!isPublishedRow(tr, fields.status)) continue;
          var sowIdDom = readSowFromDom(tr, fields.sow);
          if (!sowIdDom || idx[sowIdDom]) continue;
          idx[sowIdDom] = fromDom(tr, fields);
        }
      }
    } catch (e) { /* ignore */ }

    return idx;
  }

  function readSowFromAttrs(attrs, sowField) {
    var raw = attrs[sowField + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
  }
  function readSowFromDom(tr, sowField) {
    var cell = tr.querySelector('td.' + sowField +
                                ', td[data-field-key="' + sowField + '"]');
    if (!cell) return '';
    var span = cell.querySelector('span[data-kn="connection-value"]');
    if (!span) return '';
    var cls = (span.className || '').trim();
    return /^[a-f0-9]{24}$/i.test(cls) ? cls : '';
  }

  // ── Build the block DOM ───────────────────────────────────────
  // Inline paperclip glyph for the PDF link. Sized for the chrome the
  // block renders in — looks correct against text in any variant.
  var PDF_SVG =
    '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/></svg>';

  function buildBlock(proposal, opts) {
    opts = opts || {};
    injectStyles();

    var variant = opts.variant || 'regular';
    var block = document.createElement('div');
    block.className = 'scw-pq-info scw-pq-info--' + variant;

    // Empty state — render only if emptyText is provided. Variants that
    // want to silently skip on empty just pass null and check upstream.
    if (!proposal) {
      if (!opts.emptyText) return null;
      block.classList.add('scw-pq-empty');
      block.textContent = opts.emptyText;
      return block;
    }

    // Optional header label (panel variant uses it).
    if (opts.header) {
      var hdr = document.createElement('div');
      hdr.className = 'scw-pq-header';
      hdr.textContent = opts.header;
      block.appendChild(hdr);
    }

    // Type chip (GFE / Final / Equipment Only) — top of the block.
    if (proposal.type && window.SCW && SCW.proposalTypeChip) {
      var chip = SCW.proposalTypeChip.buildChip(proposal.type);
      if (chip) block.appendChild(chip);
    }

    // Name + link.
    if (proposal.name) {
      var nameRow = document.createElement('div');
      nameRow.className = 'scw-pq-name';
      var href = '';
      if (typeof opts.linkBuilder === 'function') {
        href = opts.linkBuilder(proposal) || '';
      } else if (proposal.recordId) {
        href = '#published-proposals/sow-published-proposal-details/' + proposal.recordId;
      }
      if (href) {
        var a = document.createElement('a');
        a.setAttribute('href', href);
        if (opts.openInNewTab !== false) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
        }
        a.textContent = proposal.name;
        nameRow.appendChild(a);
      } else {
        nameRow.textContent = proposal.name;
      }
      block.appendChild(nameRow);
    }

    if (proposal.expDate) {
      var expRow = document.createElement('div');
      expRow.className = 'scw-pq-exp';
      expRow.textContent = 'Expires: ' + proposal.expDate;
      block.appendChild(expRow);
    }

    if (proposal.pdfUrl) {
      var pdfLink = document.createElement('a');
      pdfLink.className = 'scw-pq-pdf';
      pdfLink.setAttribute('href', proposal.pdfUrl);
      // No target=_blank by default — let the browser handle inline PDFs.
      pdfLink.innerHTML = PDF_SVG;
      pdfLink.appendChild(document.createTextNode(proposal.pdfName));
      block.appendChild(pdfLink);
    }

    return block;
  }

  function renderInto(container, proposal, opts) {
    if (!container) return null;
    // Drop any prior block this module rendered into the same host.
    var prev = container.querySelector(':scope > .scw-pq-info');
    if (prev) prev.remove();
    var el = buildBlock(proposal, opts);
    if (el) container.appendChild(el);
    return el;
  }

  // ── Expose ────────────────────────────────────────────────────
  window.SCW = window.SCW || {};
  SCW.publishedQuoteInfo = {
    read:        read,
    readById:    readById,
    buildBlock:  buildBlock,
    renderInto:  renderInto,
    injectStyles: injectStyles
  };
})();
