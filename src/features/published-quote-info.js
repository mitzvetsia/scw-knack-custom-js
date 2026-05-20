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
  var DEFAULT_TOKEN_URL = 'field_2908'; // cached public tokenized URL

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
      // Regular (proposal page / sales totals panel). Flex column so
      // every interactive element (PDF chip, Customer Link, internal
      // CTA, expired note) gets its own row instead of sitting on
      // the same baseline as inline-flex siblings. align-items per
      // host: right-aligned in the sales totals panel via the wrap\'s
      // CSS, defaults to center elsewhere.
      '.scw-pq-info--regular {' +
      '  display: flex;' +
      '  flex-direction: column;' +
      '  align-items: center;' +
      '  font-size: 14px;' +
      '  padding: 2px 0;' +
      '}' +
      // When the host explicitly right-aligns text (the sales totals
      // panel), match the flex alignment so the column stacks against
      // the right edge.
      '.scw-pq-info--regular[style*="text-align: right"] {' +
      '  align-items: flex-end;' +
      '}' +
      // Panel (sales totals) — right-aligned with a top border, header
      // label, and consistent inner spacing. The container sets its own
      // outer margin so the panel docks against whatever sits above it.
      '.scw-pq-info--panel {' +
      '  border-top: 1px solid #e5e7eb;' +
      '  margin-top: 12px;' +
      '  padding: 10px 10px 0 0;' +
      '  text-align: right;' +
      '}' +

      // ── Header ──
      // Compact label up top. Type chip + EXPIRED badge sit inline to
      // the right (in a right-aligned panel they read as a chip cluster
      // following the label).
      '.scw-pq-header {' +
      '  display: flex; align-items: center;' +
      '  justify-content: flex-end; gap: 8px;' +
      '  font-size: 11px; font-weight: 700;' +
      '  color: #475569; text-transform: uppercase;' +
      '  letter-spacing: 0.06em;' +
      '  margin-bottom: 10px;' +
      '}' +
      // Type chip already has its own styling; nudge size down inside
      // the header so it doesn't dwarf the label.
      '.scw-pq-header .scw-proposal-type-chip {' +
      '  font-size: 10px !important;' +
      '  padding: 2px 8px !important;' +
      '}' +

      // ── Identity row ──
      '.scw-pq-name {' +
      '  font-size: 16px; font-weight: 600;' +
      '  color: #0f172a;' +
      '  margin: 0 0 2px 0;' +
      '}' +
      '.scw-pq-name a, .scw-pq-name a:visited {' +
      '  color: #2563eb; text-decoration: none;' +
      '}' +
      '.scw-pq-name a:hover { text-decoration: underline; }' +

      // ── Expiration date ──
      '.scw-pq-exp {' +
      '  font-size: 12px;' +
      '  color: #64748b;' +
      '  margin-bottom: 14px;' +
      '}' +
      // Red tinted when expired so the eye catches it from the date alone.
      '.scw-pq-exp--past {' +
      '  color: #b91c1c; font-weight: 600;' +
      '}' +

      // ── PDF link (styled as a "downloadable file" chip) ──
      // The leading red "PDF" badge is the universal cue that this is
      // a PDF download; the filename trails after as plain dark text.
      // Outlined chip so it reads as a tappable file affordance, not
      // a generic blue text link.
      '.scw-pq-pdf, .scw-pq-pdf:visited {' +
      '  display: inline-flex; align-items: center; gap: 8px;' +
      '  margin-bottom: 14px;' +
      '  padding: 6px 10px 6px 6px;' +
      '  background: #fff;' +
      '  border: 1px solid #e2e8f0;' +
      '  border-radius: 6px;' +
      '  color: #0f172a; text-decoration: none;' +
      '  font: 500 12px/1.3 system-ui, sans-serif;' +
      '  max-width: 100%;' +
      '}' +
      '.scw-pq-pdf:hover {' +
      '  border-color: #cbd5e1; background: #f8fafc;' +
      '  text-decoration: none;' +
      '}' +
      '.scw-pq-pdf__badge {' +
      '  display: inline-flex; align-items: center;' +
      '  padding: 3px 6px;' +
      '  background: #dc2626; color: #fff;' +
      '  border-radius: 3px;' +
      '  font: 800 10px/1 system-ui, sans-serif;' +
      '  letter-spacing: 0.06em;' +
      '  flex-shrink: 0;' +
      '}' +
      '.scw-pq-pdf__name {' +
      '  overflow: hidden; text-overflow: ellipsis;' +
      '  white-space: nowrap;' +
      '}' +

      // ── EXPIRED badge (inline with header chips) ──
      '.scw-pq-expired-badge {' +
      '  display: inline-block;' +
      '  padding: 2px 8px;' +
      '  background: #fef2f2;' +
      '  color: #b91c1c;' +
      '  border: 1px solid #fecaca;' +
      '  border-radius: 4px;' +
      '  font: 700 10px/1 system-ui, sans-serif;' +
      '  letter-spacing: 0.06em;' +
      '  text-transform: uppercase;' +
      '}' +

      // ── Expired-warning blurb ──
      // Amber callout that replaces the customer CTA when the proposal
      // is past its expiration date.
      '.scw-pq-expired-note {' +
      '  margin: 14px 0 10px 0;' +
      '  padding: 10px 12px;' +
      '  background: #fffbeb;' +
      '  border: 1px solid #fde68a;' +
      '  border-radius: 6px;' +
      '  color: #92400e;' +
      '  font: 500 12px/1.45 system-ui, sans-serif;' +
      '  text-align: left;' +
      '}' +
      '.scw-pq-expired-note strong { color: #78350f; font-weight: 700; }' +

      // ── Primary CTA (Customer Link, not expired) ──
      // Solid brand blue, fixed width so it stacks neatly with sibling
      // CTAs (the outlined Preview Proposal button in the same panel
      // uses the same width — uniform column of actions reads cleaner
      // than ragged-edge buttons).
      '.scw-pq-customer-cta, .scw-pq-customer-cta:visited {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  gap: 7px;' +
      '  margin-top: 4px; padding: 10px 18px;' +
      '  width: 220px; box-sizing: border-box;' +
      '  background: #07467c; color: #fff !important;' +
      '  border-radius: 6px; text-decoration: none;' +
      '  font: 700 12px/1.2 system-ui, sans-serif;' +
      '  letter-spacing: 0.04em; text-transform: uppercase;' +
      '  box-shadow: 0 1px 2px rgba(0,0,0,.12);' +
      '  transition: background 120ms ease, box-shadow 120ms ease;' +
      '}' +
      '.scw-pq-customer-cta:hover {' +
      '  background: #053659;' +
      '  box-shadow: 0 2px 6px rgba(0,0,0,.22);' +
      '  text-decoration: none;' +
      '}' +
      '.scw-pq-customer-cta svg { flex-shrink: 0; }' +

      // ── Secondary CTA (Internal Details, when expired) ──
      // Outlined version of the primary, same fixed width. Reads as a
      // "still available action, but not what you reach for first".
      '.scw-pq-internal-cta, .scw-pq-internal-cta:visited {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  gap: 7px;' +
      '  margin-top: 4px; padding: 9px 16px;' +
      '  width: 220px; box-sizing: border-box;' +
      '  background: #fff; color: #07467c !important;' +
      '  border: 1px solid #cbd5e1;' +
      '  border-radius: 6px; text-decoration: none;' +
      '  font: 700 12px/1.2 system-ui, sans-serif;' +
      '  letter-spacing: 0.04em; text-transform: uppercase;' +
      '}' +
      '.scw-pq-internal-cta:hover {' +
      '  background: #f1f5f9; border-color: #94a3b8;' +
      '  text-decoration: none;' +
      '}' +

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

    // Tokenized customer URL — minted at publish, stored on the
    // proposal record. Falls back to the bare token + reconstruction
    // not attempted here (the snippet builds the URL itself; this
    // module just surfaces what's stored).
    var tokenUrl = '';
    var rawTokenUrl = attrs[fields.tokenUrl + '_raw'];
    if (typeof rawTokenUrl === 'string' && rawTokenUrl.trim()) {
      tokenUrl = rawTokenUrl.trim();
    } else if (typeof attrs[fields.tokenUrl] === 'string') {
      tokenUrl = String(attrs[fields.tokenUrl]).replace(/<[^>]*>/g, '').trim();
    }

    return {
      recordId: id,
      name:     name,
      expDate:  expDate,
      expired:  isExpired(expDate),
      pdfUrl:   pdfUrl,
      pdfName:  pdfName || 'Download PDF',
      viewLink: viewLink,
      tokenUrl: tokenUrl,
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

    var expDate  = cellText(fields.exp);
    var tokenUrl = cellText(fields.tokenUrl);
    // The token-url cell may render as an anchor; prefer the href.
    var tokenA = cellAnchor(fields.tokenUrl);
    if (tokenA) {
      var hrefVal = tokenA.getAttribute('href');
      if (hrefVal) tokenUrl = hrefVal;
    }

    return {
      recordId: tr.id || '',
      name:     cellText(fields.name),
      expDate:  expDate,
      expired:  isExpired(expDate),
      pdfUrl:   pdfA  ? (pdfA.getAttribute('href') || '') : '',
      pdfName:  pdfA  ? ((pdfA.textContent || '').trim() || 'Download PDF')
                      : 'Download PDF',
      viewLink: pageA ? (pageA.getAttribute('href') || '') : '',
      tokenUrl: tokenUrl,
      type:     type
    };
  }

  function resolveFields(opts) {
    return {
      sourceView: opts.sourceView,
      status:     opts.statusField   || DEFAULT_STATUS,
      name:       opts.nameField     || DEFAULT_NAME,
      exp:        opts.expField      || DEFAULT_EXP,
      pdf:        opts.pdfField      || DEFAULT_PDF,
      sow:        opts.sowField      || DEFAULT_SOW,
      tokenUrl:   opts.tokenUrlField || DEFAULT_TOKEN_URL
    };
  }

  // ── Expiration check ──────────────────────────────────────────
  // Returns true when the expDate string (e.g. "06/13/2026") is
  // strictly before today (calendar-day boundary). Blank / unparseable
  // dates are treated as not expired.
  function isExpired(expDateStr) {
    if (!expDateStr) return false;
    var d = new Date(expDateStr);
    if (isNaN(d.getTime())) return false;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return d < today;
  }

  // ── Read first published proposal ─────────────────────────────
  function read(opts) {
    opts = opts || {};
    if (!opts.sourceView) return null;
    var fields = resolveFields(opts);

    // Knack model first — fully-typed, includes _raw values. Two
    // shapes to handle:
    //   1. List views (kn-records): v.model.data.models[] is an array
    //      of Backbone models, one per row.
    //   2. Details views (kn-details): the view's model IS the single
    //      record — its attributes hold the field values directly.
    // The proposal page uses a details view as both source and target,
    // so falling through to the details path matters even when the
    // list path returns no rows.
    try {
      var v = window.Knack && Knack.views && Knack.views[opts.sourceView];
      if (v && v.model) {
        var models = v.model.data && v.model.data.models;
        if (models && models.length) {
          for (var i = 0; i < models.length; i++) {
            var a = models[i].attributes;
            if (!a || !isPublishedAttrs(a, fields.status)) continue;
            return fromAttrs(a, fields);
          }
        }
        // Details-view shape — single record at v.model.attributes.
        // Skip the published-status filter here: details views target
        // one specific record already, and the page wouldn't be open
        // unless this record is the intended one.
        var single = v.model.attributes;
        if (single && (single.id || single[fields.name] != null)) {
          return fromAttrs(single, fields);
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

    // Header row — "PUBLISHED PROPOSAL" label + chip cluster (type
    // chip and the EXPIRED badge when applicable). Reads as a single
    // identifying line at the top of the card.
    if (opts.header) {
      var hdr = document.createElement('div');
      hdr.className = 'scw-pq-header';
      hdr.appendChild(document.createTextNode(opts.header));
      if (proposal.type && window.SCW && SCW.proposalTypeChip) {
        var chip = SCW.proposalTypeChip.buildChip(proposal.type);
        if (chip) hdr.appendChild(chip);
      }
      if (proposal.expired) {
        var badge = document.createElement('span');
        badge.className = 'scw-pq-expired-badge';
        badge.textContent = 'Expired';
        hdr.appendChild(badge);
      }
      block.appendChild(hdr);
    } else if (proposal.type && window.SCW && SCW.proposalTypeChip) {
      // Variants without a header still get a type chip up top.
      var soloChip = SCW.proposalTypeChip.buildChip(proposal.type);
      if (soloChip) block.appendChild(soloChip);
    }

    // Proposal name — plain text by default. The action lives in the
    // CTA below; surfacing the identifier as a link to the internal
    // details page was redundant clutter. Callers that need it can
    // still pass opts.linkBuilder.
    if (proposal.name) {
      var nameRow = document.createElement('div');
      nameRow.className = 'scw-pq-name';
      var href = '';
      if (typeof opts.linkBuilder === 'function') {
        href = opts.linkBuilder(proposal) || '';
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
      expRow.className = 'scw-pq-exp' + (proposal.expired ? ' scw-pq-exp--past' : '');
      expRow.textContent = (proposal.expired ? 'Expired: ' : 'Expires: ') + proposal.expDate;
      block.appendChild(expRow);
    }

    if (proposal.pdfUrl) {
      // "Downloadable file" chip: red PDF badge + filename. The badge
      // is the universal cue ("this is a PDF") and the chip border
      // signals "tap to download" without leaning on a generic blue
      // text-link.
      var pdfLink = document.createElement('a');
      pdfLink.className = 'scw-pq-pdf';
      pdfLink.setAttribute('href', proposal.pdfUrl);
      // No target=_blank by default — let the browser handle inline PDFs.
      var badge = document.createElement('span');
      badge.className = 'scw-pq-pdf__badge';
      badge.textContent = 'PDF';
      var fname = document.createElement('span');
      fname.className = 'scw-pq-pdf__name';
      fname.textContent = proposal.pdfName;
      pdfLink.appendChild(badge);
      pdfLink.appendChild(fname);
      block.appendChild(pdfLink);
    }

    // ── Primary CTA ─────────────────────────────────────────────
    // Caller passes opts.customerLink = {
    //   url:                tokenized URL (used when not expired)
    //   label:              CTA text (default "Customer Link")
    //   expiredFallbackUrl: internal details URL (used when expired)
    //   expiredFallbackLabel: CTA text when expired (default "View Details")
    // }
    //
    // When not expired: render a primary "Customer Link" button to
    // the tokenized URL. That's the only navigation the user needs.
    //
    // When expired: render an amber warning blurb followed by an
    // outlined "View Details" secondary button to the internal page.
    // The bright primary action is suppressed because re-sharing a
    // stale link isn't the right next step.
    var cust = opts.customerLink;
    if (cust) {
      if (proposal.expired) {
        var note = document.createElement('div');
        note.className = 'scw-pq-expired-note';
        note.innerHTML =
          '<strong>This proposal is expired.</strong> Coordinate an ' +
          'extension with Ops before re-sharing the customer link.';
        block.appendChild(note);

        if (cust.expiredFallbackUrl) {
          var intBtn = document.createElement('a');
          intBtn.className = 'scw-pq-internal-cta';
          intBtn.setAttribute('href', cust.expiredFallbackUrl);
          intBtn.setAttribute('target', '_blank');
          intBtn.setAttribute('rel', 'noopener');
          intBtn.textContent = cust.expiredFallbackLabel || 'View Details';
          block.appendChild(intBtn);
        }
      } else if (cust.url) {
        var custBtn = document.createElement('a');
        custBtn.className = 'scw-pq-customer-cta';
        custBtn.setAttribute('href', cust.url);
        custBtn.setAttribute('target', '_blank');
        custBtn.setAttribute('rel', 'noopener');
        custBtn.innerHTML =
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
          'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
          'stroke-linejoin="round">' +
          '<path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07L11 6"/>' +
          '<path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07L13 18"/>' +
          '</svg>' +
          (cust.label || 'Customer Link');
        block.appendChild(custBtn);
      }
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
