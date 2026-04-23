/*** FEATURE: Published-quote info on the proposal page (view_3883) ***/
/**
 * Mirror of the per-row published-proposal block in ops-review-pill.js,
 * but for the single-SOW proposal page. Reads view_3886 (published
 * proposals data view), filters to status = Published, and injects a
 * compact info block into view_3883 styled identically to the SOW-list
 * version. When no published proposal exists for this SOW, renders the
 * same "No published quotes" empty state.
 *
 * Reuses CSS classes (.scw-ops-proposal-info / -name / -exp / -pdf /
 * -empty) that ops-review-pill.js already injects globally — so this
 * module only needs to build the DOM and let the existing styles
 * carry the look.
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────
  var SOURCE_VIEW   = 'view_3886';   // Published proposals (data source)
  var TARGET_VIEW   = 'view_3883';   // Where to inject the info block
  var STATUS_FIELD  = 'field_2658';  // "Published" / "Draft" / etc.
  var NAME_FIELD    = 'field_2665';  // Display name
  var EXP_FIELD     = 'field_2659';  // Expiration date
  var PDF_FIELD     = 'field_2681';  // PDF file

  var BLOCK_CLASS = 'scw-published-quote-block';
  var NS          = '.scwPublishedQuote';

  // ── Status filter ───────────────────────────────────────
  function isPublishedFromAttrs(attrs) {
    var raw = attrs[STATUS_FIELD + '_raw'];
    if (typeof raw === 'string' && raw.trim()) return /published/i.test(raw);
    var v = attrs[STATUS_FIELD];
    if (typeof v === 'string' && v.trim()) {
      return /published/i.test(v.replace(/<[^>]*>/g, ''));
    }
    return false;
  }
  function isPublishedFromDom(tr) {
    var cell = tr.querySelector('td.' + STATUS_FIELD +
                                ', td[data-field-key="' + STATUS_FIELD + '"]');
    // Status column absent from the view → accept all rows rather
    // than silently filtering everything out.
    if (!cell) return true;
    var text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
    return /published/i.test(text);
  }

  // ── Field extraction ────────────────────────────────────
  function extractFromAttrs(attrs) {
    var id      = attrs.id || '';
    var name    = String(attrs[NAME_FIELD] || '').replace(/<[^>]*>/g, '').trim();
    var expDate = String(attrs[EXP_FIELD]  || '').replace(/<[^>]*>/g, '').trim();

    var pdfUrl = '', pdfName = '';
    var pdfRaw = attrs[PDF_FIELD + '_raw'];
    if (pdfRaw && typeof pdfRaw === 'object') {
      pdfUrl  = pdfRaw.url || '';
      pdfName = pdfRaw.filename || '';
    }
    if (!pdfUrl) {
      var pdfHtml = String(attrs[PDF_FIELD] || '');
      var mHref = pdfHtml.match(/href="([^"]+)"/i);
      if (mHref) pdfUrl = mHref[1];
      var mName = pdfHtml.match(/>([^<]+\.pdf)</i);
      if (mName) pdfName = mName[1];
    }

    var viewLink = '';
    if (id) {
      var viewEl = document.getElementById(SOURCE_VIEW);
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
      viewLink: viewLink
    };
  }

  function extractFromDom(tr) {
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
    var pdfA  = cellAnchor(PDF_FIELD);
    var pageA = tr.querySelector('a.kn-link-page');
    return {
      recordId: tr.id || '',
      name:     cellText(NAME_FIELD),
      expDate:  cellText(EXP_FIELD),
      pdfUrl:   pdfA  ? (pdfA.getAttribute('href') || '') : '',
      pdfName:  pdfA  ? ((pdfA.textContent || '').trim() || 'Download PDF')
                      : 'Download PDF',
      viewLink: pageA ? (pageA.getAttribute('href') || '') : ''
    };
  }

  // ── First Published proposal (model first, DOM fallback) ─
  function getPublishedProposal() {
    try {
      var v = Knack && Knack.views && Knack.views[SOURCE_VIEW];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (models && models.length) {
        for (var i = 0; i < models.length; i++) {
          var a = models[i].attributes;
          if (!a || !isPublishedFromAttrs(a)) continue;
          return extractFromAttrs(a);
        }
      }
    } catch (e) { /* fall through */ }

    try {
      var viewEl = document.getElementById(SOURCE_VIEW);
      if (viewEl) {
        var rows = viewEl.querySelectorAll('tbody tr[id]');
        for (var r = 0; r < rows.length; r++) {
          var tr = rows[r];
          if (!/^[a-f0-9]{24}$/i.test(tr.id || '')) continue;
          if (!isPublishedFromDom(tr)) continue;
          return extractFromDom(tr);
        }
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  // ── Render block (same DOM shape ops-review-pill uses) ──
  function renderBlock(host, proposal) {
    // Drop any previous render — view re-renders happen often.
    var prev = host.querySelector('.' + BLOCK_CLASS);
    if (prev) prev.remove();

    var block = document.createElement('div');
    // BLOCK_CLASS lets us find/remove our own injection; the second
    // class pulls in the shared ops-review-pill styling so the look
    // matches the SOW grid exactly.
    block.className = BLOCK_CLASS + ' scw-ops-proposal-info';

    if (!proposal) {
      block.classList.add('scw-ops-proposal-empty');
      block.textContent = 'No published quotes';
      host.appendChild(block);
      return;
    }

    if (proposal.name) {
      var nameRow = document.createElement('div');
      nameRow.className = 'scw-ops-proposal-name';
      if (proposal.viewLink) {
        var a = document.createElement('a');
        a.setAttribute('href', proposal.viewLink);
        a.textContent = proposal.name;
        nameRow.appendChild(a);
      } else {
        nameRow.textContent = proposal.name;
      }
      block.appendChild(nameRow);
    }

    if (proposal.expDate) {
      var expRow = document.createElement('div');
      expRow.className = 'scw-ops-proposal-exp';
      expRow.textContent = 'Expires: ' + proposal.expDate;
      block.appendChild(expRow);
    }

    if (proposal.pdfUrl) {
      var pdfLink = document.createElement('a');
      pdfLink.className = 'scw-ops-proposal-pdf';
      pdfLink.setAttribute('href', proposal.pdfUrl);
      pdfLink.setAttribute('target', '_blank');
      pdfLink.setAttribute('rel', 'noopener');
      pdfLink.innerHTML =
        '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px;">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
        '<polyline points="14 2 14 8 20 8"/></svg>';
      pdfLink.appendChild(document.createTextNode(proposal.pdfName));
      block.appendChild(pdfLink);
    }

    host.appendChild(block);
  }

  // ── Bind ────────────────────────────────────────────────
  function transform() {
    var host = document.getElementById(TARGET_VIEW);
    if (!host) return;
    renderBlock(host, getPublishedProposal());
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(SOURCE_VIEW, function () { setTimeout(transform, 150); }, NS);
    SCW.onViewRender(TARGET_VIEW, function () { setTimeout(transform, 150); }, NS);
  } else {
    $(document)
      .off('knack-view-render.' + SOURCE_VIEW + NS)
      .on('knack-view-render.' + SOURCE_VIEW + NS, function () { setTimeout(transform, 150); })
      .off('knack-view-render.' + TARGET_VIEW + NS)
      .on('knack-view-render.' + TARGET_VIEW + NS, function () { setTimeout(transform, 150); });
  }

  // First-paint attempt in case both views are already in the DOM by
  // the time this IIFE runs.
  if (document.getElementById(TARGET_VIEW) && document.getElementById(SOURCE_VIEW)) {
    setTimeout(transform, 150);
  }
})();
