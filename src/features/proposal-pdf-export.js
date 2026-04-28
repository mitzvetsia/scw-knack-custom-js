/*** SCW PDF EXPORT — Multi-Scene Template ***/
(function () {
  'use strict';

  var WEBHOOK_URL = 'https://hook.us1.make.com/ozk2uk1e58upnpsj0fx1bmdg387ekvf5';
  var SAVE_HTML_WEBHOOK = 'https://hook.us1.make.com/fvop4hwz5gn2lujroky2vsuy4ddsamyx';

  // ══════════════════════════════════════════════════════════════
  // SCENE CONFIGS — add new scenes here
  // ══════════════════════════════════════════════════════════════

  var SCENES = [
    {
      sceneId: 'scene_1096',
      trigger: { type: 'button', buttonId: 'scw-proposal-pdf-btn', openPreview: false, buttonText: 'Publish Quote' },
      // view_3861 is the Ops-side SOW details host (hidden via CSS)
      // — its presence in the DOM is a signal for TBD-masking and the
      // Ops stepper, not part of the published proposal. Keep it out
      // of the PDF scrape.
      // view_3345 is the Ops stepper host (rich-text role-gated).
      // view_3883 is the published-quote info host we inject into.
      // view_3886 is the published-proposals data source we read to
      //   populate view_3883 — itself not part of the quote.
      // Neither belongs in the published proposal content.
      skipViews: {
        view_3342: true,
        view_3861: true,
        view_3345: true,
        view_3883: true,
        view_3886: true,
        // Hidden data-only grid: a richer Survey Line Item / SOW Line
        // Item projection added solely so the publish JSON payload
        // includes every field downstream Make pipelines need (e.g.
        // duplicating Survey Line Item records on Request Alt Bid).
        // Lives in the Builder, hidden from users via global-styles.js.
        // Dropped from the rendered proposal (skipViews) but is the
        // sole grid in the JSON payload via jsonIncludeViews below.
        view_3896: true,
        // Survey-picker grid the Ops stepper modal reads from
        // ("SITE SURVEY_requests"). Internal-only — it's the data
        // source for the alt-bid / update-bid survey picker, not
        // part of the customer-facing proposal.
        view_3897: true
      },
      // JSON snapshot for this scene is intentionally slim:
      //   { sowRecordId, view_3896: [...full records...] }
      // No header detail, no other grids — Make pipelines that
      // duplicate records only care about view_3896's projection.
      // The rendered HTML proposal is unaffected.
      jsonIncludeViews: ['view_3896'],
      hideEmptyGrids: ['view_3371', 'view_3343'],
      gridKeys: { qty: 'field_1964', cost: 'field_2203', field2019: 'field_2019' },
      recurringGrids: ['view_3371'],
      payloadType: 'proposal',
      saveHtml: true,
      pollViewOnReturn: 'view_3814',
      pollField: 'field_2681',
      // Field rendered just below the "Proposed Solution" view title
      // (matches the layout on the in-app preview page). Scraped from
      // wherever it appears on scene_1096 — typically a detail view.
      proposedSolutionField: 'field_2128',
    },
    {
      sceneId: 'scene_1149',
      trigger: { type: 'formSubmit', formViewId: 'view_3679', recordIdInput: 'id' },
      skipViews: { view_3679: true, view_3770: true, view_3552: true },
      hideEmptyGrids: [],
      gridKeys: { qty: 'field_2399', cost: 'field_2401' },
      payloadType: 'subcontractor bid',
      pollViewOnReturn: 'view_3507',
      pollField: 'field_2626',
      extraFields: [
        { field: 'field_2386', name: 'surveyRequestId' },
        // bidId comes from the resolved record id — same source the
        // form's hidden `id` input feeds extra.recordId from. URL-based
        // extraction missed it when the bid-submit URL didn't end in a
        // 24-hex segment.
        { name: 'bidId', source: 'recordId' },
        { field: 'field_666',  name: 'clientSite' },
        { field: 'field_2410', name: 'projectAddress' },
        { field: 'field_2633', name: 'field_2633' },
        { field: 'field_2631', name: 'cuTaskId', sourceView: 'view_3552', hide: true }
      ],
    },
  ];

  // ══════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════

  function getPageRecordId() {
    var match = (window.location.hash || '').split('?')[0].match(/\/([a-f0-9]{24})\/?$/);
    return match ? match[1] : '';
  }

  // Identity of the user who clicked / submitted — included on every
  // webhook payload so Make scenarios can attribute the action in
  // Slack messages, audit trails, CU task descriptions, etc.
  function getTriggeredBy() {
    try {
      var u = (typeof Knack !== 'undefined' && Knack.getUserAttributes)
        ? Knack.getUserAttributes()
        : null;
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

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
    if (!td) return '';
    // Clone and strip injected spans so label doesn't include
    // connected-devices or field_2019 text.
    var clone = td.cloneNode(true);
    var injected = clone.querySelectorAll(
      '.scw-l3-connected-devices, br.scw-l3-connected-br, ' +
      '.scw-l4-2019, br.scw-l4-2019-br'
    );
    for (var ci = 0; ci < injected.length; ci++) injected[ci].remove();
    // .scw-concat-cameras is special: on most L3 rows it contains
    // ONLY the camera-list pill (e.g. "(RA-E-70, RA-E-71)"), but on
    // Mounting Hardware L3 rows it WRAPS the product label too. So
    // we can't just strip the whole div — we'd lose the label and
    // the L3 row would never render. Instead, strip only the <b>
    // children whose text matches the parenthesized camera-list
    // pattern, plus their preceding <br>s.
    var concatBlocks = clone.querySelectorAll('.scw-concat-cameras');
    for (var cb = 0; cb < concatBlocks.length; cb++) {
      var bs = concatBlocks[cb].querySelectorAll('b');
      for (var bi = 0; bi < bs.length; bi++) {
        if (/^\(.*\)$/.test(norm(bs[bi].textContent))) {
          var prev = bs[bi].previousSibling;
          if (prev && prev.nodeType === 1 && prev.tagName === 'BR') prev.remove();
          bs[bi].remove();
        }
      }
    }
    return norm(clone.textContent);
  }

  function isVisibleRow(tr) {
    return tr.style.display !== 'none' && !tr.classList.contains('scw-hide-level3-header') && !tr.classList.contains('scw-hide-level4-header');
  }

  // ── View type detection ──

  function getViewTitle(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return '';
    var h = root.querySelector('.view-header h2') || root.querySelector('.view-header h1');
    if (!h) return '';
    // Clone so we can strip the KTL hide/show accordion arrow span
    // (".ktlArrow", text "◀" / "▶") without mutating the live DOM.
    // Without this the published title leaks the chevron character.
    var clone = h.cloneNode(true);
    var arrows = clone.querySelectorAll('.ktlArrow');
    for (var i = 0; i < arrows.length; i++) arrows[i].remove();
    var text = norm(clone.textContent);
    // Suppress generic "Proposal" header — it's redundant noise above the
    // actual project title. Knack auto-titles the host detail view this
    // way; nothing else identifies itself with the bare word.
    if (text.toLowerCase() === 'proposal') return '';
    return text;
  }

  function isKnackFilterOrButton(viewId) {
    return /_filters$|-filter|_filterBtn$|-filterBtn$|-filterDivId$/.test(viewId);
  }

  function detectViewType(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;
    if (root.classList.contains('kn-report')) return 'report';
    if (root.querySelector('.kn-table tbody')) return 'grid';
    if (root.querySelector('.kn-detail-body') || root.classList.contains('kn-detail') || root.querySelector('.field-list')) return 'detail';
    if (root.classList.contains('kn-rich_text') || root.querySelector('.kn-rich-text-content')) return 'richtext';
    return 'unknown';
  }

  function viewHasDataRows(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return false;
    // "No data" indicator means empty regardless of view type
    if (root.querySelector('.kn-tr-nodata')) return false;
    // Standard grid: data rows have id attributes
    var tbody = root.querySelector('.kn-table tbody');
    if (tbody && tbody.querySelectorAll('tr[id]').length > 0) return true;
    // Report/pivot views: check for rendered report content
    if (root.querySelector('.kn-report-rendered')) return true;
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPER: Detail views
  // ══════════════════════════════════════════════════════════════

  function scrapeDetailView(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;

    var title = getViewTitle(viewId);
    var fields = [];

    // 1) Standard labeled fields
    var detailItems = root.querySelectorAll('.kn-detail');
    for (var i = 0; i < detailItems.length; i++) {
      var item = detailItems[i];
      if (item.id === viewId) continue;
      if (item.classList.contains('kn-label-none')) continue;

      var labelEl = item.querySelector('.kn-detail-label');
      var valueEl = item.querySelector('.kn-detail-body');
      if (!labelEl || !valueEl) continue;

      var label = norm(labelEl.textContent);
      var value = norm(valueEl.textContent);
      var valueHtml = valueEl.innerHTML || '';

      if (!value || value === '-' || value === '—') continue;

      fields.push({ label: label, value: value, valueHtml: valueHtml });
    }

    // 2) Label-none fields (headings, standalone values)
    var labelNoneItems = root.querySelectorAll('.kn-label-none');
    for (var j = 0; j < labelNoneItems.length; j++) {
      var lnItem = labelNoneItems[j];
      var lnBody = lnItem.querySelector('.kn-detail-body');
      if (!lnBody) continue;

      var lnText = norm(lnBody.textContent);
      var lnHtml = lnBody.innerHTML || '';

      if (!lnText) continue;

      fields.push({ label: '', value: lnText, valueHtml: lnHtml, labelNone: true });
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

    var contentEl = root.querySelector('.kn-rich-text-content') || root.querySelector('.view-body') || root;
    var contentHtml = '';
    var text = '';
    if (contentEl) {
      contentHtml = contentEl.innerHTML || '';
      text = norm(contentEl.textContent);
    }

    if (!contentHtml && !title) return null;

    return { viewId: viewId, type: 'richtext', title: title, contentHtml: contentHtml, contentText: text };
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPER: Report / pivot views
  // ══════════════════════════════════════════════════════════════

  function scrapeReportView(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;

    var rendered = root.querySelector('.kn-report-rendered');
    if (!rendered) return null;

    var title = getViewTitle(viewId);

    // Grab the table HTML directly — it's already well-structured
    var tableEl = rendered.querySelector('table');
    var tableHtml = tableEl ? tableEl.outerHTML : '';
    if (!tableHtml) return null;

    return { viewId: viewId, type: 'report', title: title, tableHtml: tableHtml };
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPER: Grid views (parameterized by keys)
  // ══════════════════════════════════════════════════════════════

  function scrapeGridView(viewId, keys) {
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
        // Either flag suppresses qty + cost in the published HTML.
        // - scw-hide-cost — legacy cost-only suppressor (rarely used)
        // - scw-hide-qty-cost — what proposal-grid.js actually adds for
        //   buckets configured with hideQtyCostColumns=true (e.g. the
        //   Assumptions bucket, recordId 697b7a023a31502ec68b3303). The
        //   bucket flag was being set but never made it through to the
        //   published HTML because we only checked the legacy class.
        var hideQtyCost = tr.classList.contains('scw-hide-qty-cost');
        var hideCost = hideQtyCost || tr.classList.contains('scw-hide-cost');
        var l3Qty = hideQtyCost ? 0 : parseMoney(norm((tr.querySelector('td.' + keys.qty) || {}).textContent || ''));
        var l3Cost = hideCost ? '' : norm((tr.querySelector('td.' + keys.cost) || {}).textContent || '');

        var connDevSpan = tr.querySelector('.scw-l3-connected-devices');
        var connDevices = [];
        if (connDevSpan) {
          var connText = norm(connDevSpan.textContent).replace(/^\(/, '').replace(/\)$/, '');
          if (connText) connDevices = connText.split(',').map(function (s) { return norm(s); }).filter(Boolean);
        }

        var isMounting = tr.classList.contains('scw-level3--mounting-hardware');

        currentL3 = {
          level: 3, label: l3Label, qty: l3Qty, cost: l3Cost, hideCost: hideCost,
          connectedDevices: connDevices, isMountingHardware: isMounting, lineItems: [],
        };

        if (currentL2) currentL2.products.push(currentL3);
        continue;
      }

      if (tr.classList.contains('kn-group-level-4')) {
        if (!isVisibleRow(tr)) continue;

        // proposal-grid tags assumption-bucket L4 rows with
        // scw-hide-qty-cost (the parent L3 was already hidden via
        // scw-hide-level3-header so the L4 carries the flag instead).
        // We need this when auto-creating a synthetic L3 below.
        var l4HideQtyCost = tr.classList.contains('scw-hide-qty-cost');

        var labelCell = tr.querySelector('td:first-child');
        var l4Label = labelCell ? norm(labelCell.textContent) : '';

        var descSpan = tr.querySelector('.scw-l4-2019');
        var description = '';
        if (descSpan) description = descSpan.innerHTML || '';

        // Fallback: read field_2019 directly from the first data row under this L4 group
        if (!description && keys.field2019) {
          var nextSib = tr.nextElementSibling;
          while (nextSib && nextSib.classList.contains('kn-table-group')) nextSib = nextSib.nextElementSibling;
          if (nextSib && nextSib.id && nextSib.tagName === 'TR') {
            var f2019Cell = nextSib.querySelector('td.' + keys.field2019);
            if (f2019Cell) {
              var rawDesc = f2019Cell.innerHTML || '';
              // Sanitize: keep only <br> and <b>/<strong> tags, strip everything else
              rawDesc = rawDesc.replace(/<strong>/gi, '<b>').replace(/<\/strong>/gi, '</b>');
              rawDesc = rawDesc.replace(/<(?!\/?b\s*\/?>|br\s*\/?>)[^>]*>/gi, '');
              rawDesc = rawDesc.replace(/&nbsp;/gi, ' ').replace(/^\s+|\s+$/g, '');
              if (rawDesc) description = rawDesc;
            }
          }
        }

        var cameraList = '';
        var camBs = tr.querySelectorAll('.scw-concat-cameras b');
        for (var cb = camBs.length - 1; cb >= 0; cb--) {
          var camText = norm(camBs[cb].textContent);
          if (/^\(.*\)$/.test(camText)) {
            cameraList = camText.replace(/^\(/, '').replace(/\)$/, '').trim();
            break;
          }
        }

        var l4Qty = parseMoney(norm((tr.querySelector('td.' + keys.qty) || {}).textContent || ''));
        var l4Cost = norm((tr.querySelector('td.' + keys.cost) || {}).textContent || '');

        var lineItem = {
          level: 4, label: l4Label, description: description,
          qty: l4Qty, cost: l4Cost, cameraList: cameraList,
        };

        if (!currentL3 && currentL2) {
          // Auto-create a synthetic L3 to host this orphan L4 (the real
          // L3 was hidden, e.g. assumption rows). Propagate the L4's
          // hide-qty-cost flag so the renderer suppresses the qty/cost
          // columns for the whole synthetic product — matches what
          // proposal-grid does on the live grid.
          currentL3 = {
            level: 3, label: '', qty: l4Qty, cost: l4Cost,
            hideCost: l4HideQtyCost,
            connectedDevices: [], isMountingHardware: false, lineItems: [],
          };
          currentL2.products.push(currentL3);
        } else if (currentL3 && l4HideQtyCost && !currentL3.hideCost) {
          // Existing synthetic L3 picked up another hide-qty-cost L4 —
          // promote the whole product to hideCost so the renderer
          // suppresses qty/cost across all of its line items.
          currentL3.hideCost = true;
        }
        if (currentL3) currentL3.lineItems.push(lineItem);
        continue;
      }

      if (tr.classList.contains('scw-subtotal--level-2')) {
        var l2FooterLabel = norm(tr.getAttribute('data-scw-group-label') || '');
        var l2FooterQty = parseMoney(norm((tr.querySelector('td.' + keys.qty) || {}).textContent || ''));
        var l2FooterCost = norm((tr.querySelector('td.' + keys.cost) || {}).textContent || '');

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
        var ptValues = ptr.querySelectorAll('.scw-l1-value');
        // Pick the last non-empty .scw-l1-value (grand total row has qty + cost cells)
        var ptValue = null;
        for (var pv = ptValues.length - 1; pv >= 0; pv--) {
          if (norm(ptValues[pv].textContent)) { ptValue = ptValues[pv]; break; }
        }
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
  // TBD MASK for published HTML
  // ══════════════════════════════════════════════════════════════
  //
  // proposal-grid.js applies a visual TBD mask to install-labor cells
  // when field_2725 is not "Yes" — but bypasses the mask for Ops users
  // (so they can see real numbers on the proposal page). That bypass
  // means Ops' DOM shows real figures, and a plain textContent scrape
  // would leak them into the published HTML. Since Ops is the primary
  // publisher (Mark Ready / Submit Final Proposal), we re-apply the
  // TBD treatment to the scraped payload whenever the bid hasn't been
  // validated, regardless of who's publishing.
  //
  // Reads field_2725 straight from view_3861 without the Ops bypass.
  function shouldPublishAsTbd() {
    try {
      var view = document.getElementById('view_3861');
      if (view) {
        var cell = view.querySelector('.kn-detail.field_2725 .kn-detail-body');
        if (cell) return !/^yes$/i.test((cell.textContent || '').trim());
      }
      var m = typeof Knack !== 'undefined'
            && Knack.views && Knack.views.view_3861
            && Knack.views.view_3861.model;
      var attrs = m && (m.attributes || (m.toJSON && m.toJSON()) || {});
      if (attrs && attrs.field_2725 !== undefined) {
        return !/^yes$/i.test(String(attrs.field_2725).replace(/<[^>]*>/g, '').trim());
      }
    } catch (e) { /* fall through */ }
    // Default to TBD when the state can't be read — same defensive
    // posture as proposal-grid.js's isInstallationMasked().
    return true;
  }

  // Mutate a scraped proposal payload so every install-labor surface
  // renders "TBD". Targets:
  //   - L4 line item cost (per-product install-labor line)
  //   - L1 footer "Installation" subtotal
  //   - Scene-level projectTotals "Installation Total" line
  function applyTbdToPublishPayload(payload) {
    var TBD = 'TBD';
    if (!payload || !Array.isArray(payload.views)) return;

    function tbdifyFooterLines(lines) {
      if (!Array.isArray(lines)) return;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line && line.label && /installation/i.test(String(line.label))) {
          line.value = TBD;
        }
      }
    }

    for (var v = 0; v < payload.views.length; v++) {
      var view = payload.views[v];
      if (!view) continue;
      if (Array.isArray(view.sections)) {
        for (var s = 0; s < view.sections.length; s++) {
          var section = view.sections[s];
          if (!section) continue;
          if (Array.isArray(section.buckets)) {
            for (var b = 0; b < section.buckets.length; b++) {
              var bucket = section.buckets[b];
              if (!bucket || !Array.isArray(bucket.products)) continue;
              for (var p = 0; p < bucket.products.length; p++) {
                var prod = bucket.products[p];
                if (!prod || !Array.isArray(prod.lineItems)) continue;
                for (var li = 0; li < prod.lineItems.length; li++) {
                  prod.lineItems[li].cost = TBD;
                }
              }
            }
          }
          if (section.footer) tbdifyFooterLines(section.footer.lines);
        }
      }
      if (view.projectTotals) tbdifyFooterLines(view.projectTotals.lines);
    }
    if (payload.projectTotals) tbdifyFooterLines(payload.projectTotals.lines);
  }

  // ══════════════════════════════════════════════════════════════
  // SCRAPE ALL VIEWS on a scene
  // ══════════════════════════════════════════════════════════════

  function scrapeAllViews(cfg, opts) {
    opts = opts || {};
    var result = { views: [], sceneId: cfg.sceneId, type: cfg.payloadType || '' };

    var sceneEl = document.getElementById('kn-' + cfg.sceneId);
    var allViewEls = sceneEl ? sceneEl.querySelectorAll('[id^="view_"]') : [];

    for (var i = 0; i < allViewEls.length; i++) {
      var viewId = allViewEls[i].id;

      if (isKnackFilterOrButton(viewId)) continue;
      if (cfg.skipViews[viewId]) continue;

      var viewType = detectViewType(viewId);
      SCW.debug('[SCW PDF Export]', cfg.sceneId, viewId, '→', viewType);

      var data = null;

      if (viewType === 'grid') {
        if (!viewHasDataRows(viewId)) {
          SCW.debug('[SCW PDF Export]', viewId, '→ empty grid, skipping');
          continue;
        }
        data = scrapeGridView(viewId, cfg.gridKeys);
        if (data && cfg.recurringGrids && cfg.recurringGrids.indexOf(viewId) !== -1) {
          data.isRecurring = true;
        }
      } else if (viewType === 'report') {
        if (!viewHasDataRows(viewId)) {
          SCW.debug('[SCW PDF Export]', viewId, '→ empty report, skipping');
          continue;
        }
        data = scrapeReportView(viewId);
      } else if (viewType === 'detail') {
        data = scrapeDetailView(viewId);
      } else if (viewType === 'richtext') {
        data = scrapeRichTextView(viewId);
      }

      if (data) result.views.push(data);
    }

    for (var j = 0; j < result.views.length; j++) {
      if (result.views[j].projectTotals) {
        result.projectTotals = result.views[j].projectTotals;
        break;
      }
    }

    // Stash the optional "Proposed Solution" narrative field on the
    // matching grid view. Pulled from the live DOM rather than from
    // an already-scraped detail view so callers don't have to know
    // which detail view it lives on; renderGridSections then renders
    // it just below the view title to mirror the preview-page layout.
    if (cfg.proposedSolutionField) {
      var narrativeEl = sceneEl &&
        sceneEl.querySelector('.kn-detail.' + cfg.proposedSolutionField + ' .kn-detail-body');
      var narrativeHtml = narrativeEl ? (narrativeEl.innerHTML || '').trim() : '';
      if (narrativeHtml) {
        for (var pv = 0; pv < result.views.length; pv++) {
          var rv = result.views[pv];
          if (rv.type === 'grid' && /proposed\s+solution/i.test(rv.title || '')) {
            rv.narrativeHtml = narrativeHtml;
            break;
          }
        }
      }
    }

    // Stamp TBD into every install-labor surface if the bid hasn't
    // been validated (field_2725 != Yes). Only applies to proposal
    // payloads — subcontractor bids have different semantics.
    //
    // opts.tbdMode lets the caller override the field_2725 default:
    //   true  → force TBD (e.g. publish-sow-tbd from ops-stepper)
    //   false → force NO TBD (e.g. publish-gfe / publish-final)
    //   undefined → fall back to shouldPublishAsTbd() (field_2725 read)
    var tbdActive = (opts.tbdMode === true)  ? true
                  : (opts.tbdMode === false) ? false
                  : shouldPublishAsTbd();
    if (cfg.payloadType === 'proposal' && tbdActive) {
      applyTbdToPublishPayload(result);
    }

    // Inject "Proposal ID" detail row right above SOW ID. Mirrors the
    // existing SOW ID row visually — same label/value cells in the
    // detail-table — and lets Make's Replace step swap the token in
    // post-create. Only fires on proposal payloads since subcontractor
    // bids don't carry a published-proposal record at all.
    if (cfg.payloadType === 'proposal') {
      for (var pi = 0; pi < result.views.length; pi++) {
        var dv = result.views[pi];
        if (dv.type !== 'detail' || !dv.fields || !dv.fields.length) continue;
        var sowIdx = -1;
        for (var fi = 0; fi < dv.fields.length; fi++) {
          if (/sow\s*id/i.test(dv.fields[fi].label || '')) { sowIdx = fi; break; }
        }
        if (sowIdx === -1) continue;
        // Don't double-insert if a previous run already added the row.
        var alreadyHas = false;
        for (var ai = 0; ai < dv.fields.length; ai++) {
          if (/proposal\s*id/i.test(dv.fields[ai].label || '')) { alreadyHas = true; break; }
        }
        if (alreadyHas) break;
        dv.fields.splice(sowIdx, 0, {
          label: 'Proposal ID',
          value: tok('Proposal_ID'),
          valueHtml: tok('Proposal_ID')
        });
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
      var hasLabeled = false;
      for (var i = 0; i < view.fields.length; i++) {
        var f = view.fields[i];
        if (f.labelNone) {
          html.push('<div class="detail-label-none">' + f.valueHtml + '</div>');
        } else {
          if (!hasLabeled) {
            html.push('<table class="detail-table">');
            hasLabeled = true;
          }
          html.push('<tr>');
          html.push('<td class="detail-label">' + esc(f.label) + '</td>');
          // Prefer valueHtml so structural markup like <br> survives —
          // Knack stores the project address with a real line break
          // between street and city/state, and esc(f.value) was
          // collapsing it to a single line.
          var detailValue = f.valueHtml || esc(f.value);
          html.push('<td class="detail-value">' + detailValue + '</td>');
          html.push('</tr>');
        }
      }
      if (hasLabeled) html.push('</table>');
    }
  }

  function renderRichTextView(view, html) {
    if (view.title) {
      html.push('<div class="view-title">' + esc(view.title) + '</div>');
    }
    if (view.contentHtml) {
      html.push('<div class="richtext-content">' + view.contentHtml + '</div>');
    }
  }

  function renderReportView(view, html) {
    if (view.title) {
      html.push('<div class="view-title">' + esc(view.title) + '</div>');
    }
    if (view.tableHtml) {
      html.push('<div class="report-table-wrap">' + view.tableHtml + '</div>');
    }
  }

  function renderGridSections(view, html) {
    if (view.title) {
      html.push('<div class="view-title">' + esc(view.title) + '</div>');
    }
    // Optional narrative block right below the title — used by
    // scene_1096 to drop field_2128 ("Proposed Solution" intro text)
    // beneath the heading, matching the in-app preview layout.
    if (view.narrativeHtml) {
      html.push(
        '<div class="view-narrative" style="' +
          'margin: 4px 0 12px 0; line-height: 1.5; color: #333;' +
          'font-size: 11px;' +
        '">' + view.narrativeHtml + '</div>'
      );
    }

    for (var s = 0; s < view.sections.length; s++) {
      var section = view.sections[s];

      if (section.promoted && !section.label && !section.buckets.length) continue;
      if (!section.footer && !hasSectionContent(section)) continue;

      html.push('<div class="l1-section">');

      if (section.label && !view.isRecurring) {
        html.push('<div class="l1-header">' + esc(section.label) + '</div>');
      }

      for (var b = 0; b < section.buckets.length; b++) {
        var bucket = section.buckets[b];
        if (!bucket.products.length && !bucket.footer) continue;

        if (!bucket.isPromoted) {
          html.push('<div class="l2-header">' + esc(bucket.label) + '</div>');
        }

        if (bucket.products.length) {
          // When EVERY product in a bucket hides cost (Assumptions
          // bucket, recordId 697b7a023a31502ec68b3303), skip the
          // Qty/Cost column headers entirely — otherwise the thead
          // shows "Qty Cost" labels above colspan-3 rows with no
          // values, which reads as a broken table.
          var bucketHideCost = bucket.products.every(function (p) { return p.hideCost; });
          html.push('<table class="product-table">');
          if (bucketHideCost) {
            html.push('<thead><tr><th class="col-desc"></th></tr></thead>');
          } else {
            html.push('<thead><tr><th class="col-desc"></th><th class="col-qty">Qty</th><th class="col-cost">Cost</th></tr></thead>');
          }
          html.push('<tbody>');

          for (var p = 0; p < bucket.products.length; p++) {
            var prod = bucket.products[p];
            var prodClass = prod.isMountingHardware ? ' class="mounting"' : '';

            if (prod.label) {
              html.push('<tr class="l3-row">');
              html.push('<td' + prodClass + (prod.hideCost ? ' colspan="3"' : '') + '>' + esc(prod.label));
              if (prod.connectedDevices && prod.connectedDevices.length) {
                html.push('<span class="connected-devices">(' + esc(prod.connectedDevices.join(', ')) + ')</span>');
              }
              html.push('</td>');
              if (!prod.hideCost) {
                html.push('<td class="col-qty">' + prod.qty + '</td>');
                html.push('<td class="col-cost">' + esc(prod.cost) + '</td>');
              }
              html.push('</tr>');
            }

            var l4Class = prod.label ? 'l4-row' : 'l3-row';
            var l4TdClass = prod.label ? 'l4-desc' : '';
            for (var li = 0; li < prod.lineItems.length; li++) {
              var item = prod.lineItems[li];
              html.push('<tr class="' + l4Class + '">');
              var l4Content = item.description
                ? item.description
                    .replace(/<b>/gi, '<span style="font-weight:700">')
                    .replace(/<\/b>/gi, '</span>')
                    .replace(/<p>/gi, '<div>')
                    .replace(/<\/p>/gi, '</div>')
                : esc(item.label);
              if (item.cameraList) {
                l4Content += '<br><span class="connected-devices">(' + esc(item.cameraList) + ')</span>';
              }
              html.push('<td' + (l4TdClass ? ' class="' + l4TdClass + '"' : '') + (prod.hideCost ? ' colspan="3"' : '') + '>' + l4Content + '</td>');
              if (!prod.hideCost) {
                html.push('<td class="col-qty">' + item.qty + '</td>');
                html.push('<td class="col-cost">' + esc(item.cost) + '</td>');
              }
              html.push('</tr>');
            }
          }

          html.push('</tbody>');

          if (bucket.footer) {
            html.push('<tfoot>');
            html.push('<tr class="l2-footer">');
            // L2 footer hides the qty roll-up (per the on-page grid).
            // The roll-up isn't meaningful across mixed product types
            // in a bucket, and the per-product L3 rows already show
            // their own qty. Render an empty qty cell rather than
            // collapsing it via colspan — keeping the same 3-cell
            // shape as the body rows guarantees the cost cell lands
            // under the COST column even in email/PDF renderers that
            // ignore <th> widths or don't honor colspan precisely.
            // When the entire bucket hides cost too (assumption-style),
            // the label cell takes the whole footer row.
            if (bucketHideCost) {
              html.push('<td colspan="3">' + esc(bucket.footer.label) + '</td>');
            } else {
              html.push('<td>' + esc(bucket.footer.label) + '</td>');
              html.push('<td class="col-qty"></td>');
              html.push('<td class="col-cost">' + esc(bucket.footer.cost) + '</td>');
            }
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

  // ── Proposal token contract ──────────────────────────────────
  // Tokens that don't exist when this client builds the HTML (the
  // published-proposal record hasn't been minted yet) but DO exist by
  // the time Make's PDF generator runs. Keep this list in sync with
  // the "Tools → Replace" / Iterator step in the Make scenario.
  //
  // Double-underscore syntax (NOT {{...}} or [...]) — Make's UI
  // auto-resolves {{...}} as references to other modules' output, and
  // its replace() treats [...] as a regex character class. Underscores
  // are never special in regex, HTML, or Make formulas, so the literal
  // matches whatever Make sends to the replace step.
  //
  //   __Proposal_ID__       public-facing identifier (e.g. "20260427-10055_v30")
  //                         — the human-readable proposal name, NOT
  //                         the 24-hex Knack record id (Make has that
  //                         in its own context already).
  //   __Proposal_URL__      canonical published-proposals details link
  //   __Expiration_Date__   formatted MM/DD/YYYY
  //   __Version__           proposal version number
  //
  // Make's "Replace" step should match the token text literally — no
  // regex needed. If a token is intentionally missing from the record
  // (e.g. version number on a draft), Make should replace it with an
  // empty string so the placeholder doesn't leak into the PDF.
  var PROPOSAL_TOKENS = [
    'Proposal_ID',
    'Proposal_URL',
    'Expiration_Date',
    'Version'
  ];
  function tok(name) { return '__' + name + '__'; }

  // (The previous floating "Proposal __Proposal_ID__" letterhead tag
  // has been removed in favor of a detail-table row above SOW ID, so
  // the buildHtml flow no longer needs a post-process injector for it.)

  function buildPdfHtml(payload) {
    if (!payload.views.length) return '';

    var html = [];

    html.push('<!DOCTYPE html>');
    html.push('<html><head><meta charset="utf-8">');
    // Document title carries the proposal id token so Make gets a nice
    // tab/file name (e.g. "20260427-10055_v30") after the record is
    // created.
    html.push('<title>' + tok('Proposal_ID') + '</title>');
    html.push('<style>');
    html.push(getPdfCss());
    html.push('</style>');
    html.push('</head><body>');

    // Split views into project vs. recurring vs. report
    var projectViews = [];
    var recurringViews = [];
    var reportViews = [];
    for (var v = 0; v < payload.views.length; v++) {
      var view = payload.views[v];
      if (view.type === 'report') {
        reportViews.push(view);
      } else if (view.type === 'grid' && view.isRecurring) {
        recurringViews.push(view);
      } else {
        projectViews.push(view);
      }
    }

    // Render project views
    for (var pv = 0; pv < projectViews.length; pv++) {
      var pView = projectViews[pv];
      if (pView.type === 'detail') {
        renderDetailView(pView, html);
      } else if (pView.type === 'richtext') {
        renderRichTextView(pView, html);
      } else if (pView.type === 'grid') {
        renderGridSections(pView, html);
      }
    }

    // Project totals
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

    // Recurring services section (below project totals)
    if (recurringViews.length) {
      html.push('<div class="recurring-section">');
      for (var rv = 0; rv < recurringViews.length; rv++) {
        renderGridSections(recurringViews[rv], html);
      }
      html.push('</div>');
    }

    // Report views (e.g. BOM) at the bottom
    if (reportViews.length) {
      for (var rp = 0; rp < reportViews.length; rp++) {
        renderReportView(reportViews[rp], html);
      }
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
      // Inter via Google Fonts — embeds a known sans-serif so the PDF
      // renderer doesn't fall back to the system serif (which on minimal
      // Linux PDF environments produces oversized, wrong-face output).
      // Helvetica/Arial stay in the stack for previewing in browsers
      // that already have them; sans-serif is the last-ditch fallback.
      '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap");',
      '@page { size: letter; margin: 0.42in 0.53in; }',
      '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }',
      '',
      '*, *::before, *::after { box-sizing: border-box; }',
      'body { font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif; color: #333; font-size: 11px; line-height: 1.4; margin: 0; padding: 14px; }',
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
      '/* ── Detail Label-None (headings, standalone values) ── */',
      '.detail-label-none { margin-bottom: 4px; color: #07467c; }',
      '.detail-label-none h1 { font-size: 22px; font-weight: 700; margin: 0 0 2px 0; color: #07467c; }',
      '.detail-label-none h2 { font-size: 16px; font-weight: 400; margin: 0 0 2px 0; color: #07467c; }',
      '.detail-label-none span { color: #07467c; }',
      '',
      '/* ── Rich Text View ── */',
      '.richtext-content { margin-bottom: 16px; line-height: 1.5; color: #333; font-size: 11px; }',
      '.richtext-content p { margin: 0 0 6px 0; }',
      '.richtext-content img { max-width: 100%; height: auto; }',
      '.richtext-content hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }',
      '',
      '/* ── L1 Section ── */',
      '.l1-section { margin-bottom: 12px; }',
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
      '.l4-row td p { margin: 0; }',
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
      '',
      '/* ── Recurring Services ── */',
      '.recurring-section { margin-top: 40px; }',
      '.recurring-header {',
      '  font-size: 20px; font-weight: 800; color: #07467c;',
      '  margin-bottom: 8px; padding-bottom: 4px;',
      '  border-bottom: 3px solid #07467c;',
      '}',
      '',
      '/* ── Report / BOM Table ── */',
      '.report-table-wrap { margin-top: 30px; }',
      '.report-table-wrap table { width: 100%; border-collapse: collapse; }',
      '.report-table-wrap thead th {',
      '  font-size: 10px; font-weight: 600; color: #07467c; text-transform: uppercase;',
      '  letter-spacing: 0.5px; padding: 6px 8px; border-bottom: 2px solid #07467c;',
      '  text-align: left;',
      '}',
      '.report-table-wrap tbody td {',
      '  padding: 5px 8px; font-size: 11px; color: #333;',
      '  border-bottom: 1px solid #f0f0f0;',
      '}',
      '.report-table-wrap .kn-table_summary td {',
      '  font-weight: 700; color: #07467c; border-top: 2px solid #07467c;',
      '  padding-top: 8px;',
      '}',
    ].join('\n');
  }

  // ══════════════════════════════════════════════════════════════
  // EXTRACT SUMMARY FIELDS from scraped payload
  // ══════════════════════════════════════════════════════════════

  function findDetailField(payload, labelPattern) {
    for (var v = 0; v < payload.views.length; v++) {
      var view = payload.views[v];
      if (view.type !== 'detail' || !view.fields) continue;
      for (var f = 0; f < view.fields.length; f++) {
        if (labelPattern.test(view.fields[f].label)) return view.fields[f].value;
      }
    }
    return '';
  }

  function findTotalLine(payload, labelPattern) {
    var pt = payload.projectTotals;
    if (!pt || !pt.lines) return '';
    for (var i = 0; i < pt.lines.length; i++) {
      if (labelPattern.test(pt.lines[i].label)) return pt.lines[i].value;
    }
    return '';
  }

  function extractSummaryFields(payload) {
    return {
      sowId:              findDetailField(payload, /sow\s*id/i),
      expirationDate:     findDetailField(payload, /expir/i),
      equipmentTotal:     findTotalLine(payload, /equipment\s*total/i),
      installationTotal:  findTotalLine(payload, /installation\s*total/i),
      grandTotal:         findTotalLine(payload, /grand\s*total/i)
    };
  }

  // ══════════════════════════════════════════════════════════════
  // JSON SNAPSHOT — raw Knack records for line items + header
  // ══════════════════════════════════════════════════════════════

  function extractGridRecords(viewId) {
    if (typeof Knack === 'undefined' || !Knack.views) return [];
    var view = Knack.views[viewId];
    if (!view || !view.model || !view.model.data) return [];
    var data = view.model.data;
    if (Array.isArray(data)) {
      return data.map(function (m) {
        return typeof m.toJSON === 'function' ? m.toJSON() : (m.attributes || m);
      });
    }
    if (data.models && Array.isArray(data.models)) {
      return data.models.map(function (m) {
        return typeof m.toJSON === 'function' ? m.toJSON() : (m.attributes || m);
      });
    }
    return [];
  }

  function extractDetailRecord(viewId) {
    if (typeof Knack === 'undefined' || !Knack.views) return null;
    var view = Knack.views[viewId];
    if (!view || !view.model) return null;
    var attrs = view.model.attributes
             || (view.model.data && view.model.data.attributes)
             || null;
    if (!attrs) return null;
    var src = typeof attrs.toJSON === 'function' ? attrs.toJSON() : attrs;
    // Copy so we don't mutate live model attrs when patching in id below.
    var rec = {};
    for (var k in src) if (src.hasOwnProperty(k)) rec[k] = src[k];
    // Backbone keeps the record id on model.id (not attributes.id) for
    // some Knack detail views — that left snapshot.header.id missing
    // and Make pipelines couldn't identify the SOW record being
    // published. Backfill from model.id when attributes don't carry it.
    if (!rec.id) {
      rec.id = (view.model && view.model.id) ||
               (view.model && view.model.data && view.model.data.id) || '';
    }
    return rec;
  }

  function buildJsonSnapshot(sceneId) {
    var sceneEl = document.getElementById('kn-' + sceneId);
    if (!sceneEl) return {};

    var cfg = resolveConfiguredScene(sceneId);

    // ── Slim shape: cfg.jsonIncludeViews (allow-list) ──
    // When set, the snapshot is just `{ sowRecordId, <view>: [...] }`
    // for each listed view — no header, no other grids, nothing else.
    // Used by scenes whose Make pipelines only need a focused subset
    // (e.g. view_3896 on scene_1096, the hidden data-only grid that
    // carries the full Survey/SOW Line Item projection).
    if (cfg && Array.isArray(cfg.jsonIncludeViews) && cfg.jsonIncludeViews.length) {
      var slim = { sowRecordId: getPageRecordId() || '' };
      for (var s = 0; s < cfg.jsonIncludeViews.length; s++) {
        var vid = cfg.jsonIncludeViews[s];
        if (typeof vid !== 'string') continue;
        var slimT = detectViewType(vid);
        if (slimT === 'grid') {
          slim[vid] = extractGridRecords(vid);
        } else if (slimT === 'detail') {
          slim[vid] = extractDetailRecord(vid);
        }
      }
      return slim;
    }

    // ── Full shape (default) ──
    // skipViews is HTML-only (drives scrapeAllViews → the rendered
    // proposal). The JSON snapshot wants the opposite by default —
    // include everything the scene exposes — because Make pipelines
    // clone records from this payload. cfg.jsonSkipViews lets a
    // scene opt out a specific view from JSON without affecting HTML.
    var jsonSkip = (cfg && cfg.jsonSkipViews) || {};

    var snapshot = { header: null, headerId: '' };

    var allViewEls = sceneEl.querySelectorAll('[id^="view_"]');
    for (var i = 0; i < allViewEls.length; i++) {
      var viewId = allViewEls[i].id;
      if (jsonSkip[viewId]) continue;
      if (!/^view_\d+$/.test(viewId)) continue;  // skip pseudo-ids
      var t = detectViewType(viewId);
      if (t === 'grid') {
        snapshot[viewId] = extractGridRecords(viewId);
      } else if (t === 'detail' && !snapshot.header) {
        var rec = extractDetailRecord(viewId);
        if (rec) {
          snapshot.header   = rec;
          snapshot.headerId = rec.id || '';
        }
      }
    }

    // Final fallback: if no detail view yielded an id, drop in the
    // page-hash record id so Make always has SOMETHING addressable.
    if (!snapshot.headerId) {
      snapshot.headerId = getPageRecordId() || '';
    }

    return snapshot;
  }

  // ══════════════════════════════════════════════════════════════
  // SHARED ACTIONS
  // ══════════════════════════════════════════════════════════════

  var PUBLISH_TOAST_ID = 'scw-publish-toast';
  var PUBLISH_SPIN_CSS = 'scw-publish-spin-css';

  function injectPublishSpinCss() {
    if (document.getElementById(PUBLISH_SPIN_CSS)) return;
    var s = document.createElement('style');
    s.id = PUBLISH_SPIN_CSS;
    s.textContent = '@keyframes scwPublishSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

  function dismissPublishToast() {
    var el = document.getElementById(PUBLISH_TOAST_ID);
    if (el) el.remove();
  }

  /**
   * @param {string}  message
   * @param {boolean} autoClose  — auto-dismiss after 3 s
   * @param {boolean} showSpinner — prepend a spinning ring
   */
  function showPublishToast(message, autoClose, showSpinner) {
    var existing = document.getElementById(PUBLISH_TOAST_ID);
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = PUBLISH_TOAST_ID;
    toast.style.cssText = [
      'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);',
      'background: #07467c; color: #fff; padding: 20px 50px 20px 40px;',
      'border-radius: 8px; font-size: 16px; font-weight: 600;',
      'box-shadow: 0 4px 20px rgba(0,0,0,.3); z-index: 10000;',
      'display: flex; align-items: center; gap: 10px;',
      'text-align: center; min-width: 260px; justify-content: center;'
    ].join('');

    if (showSpinner) {
      injectPublishSpinCss();
      var spin = document.createElement('span');
      spin.style.cssText = [
        'display: inline-block; width: 16px; height: 16px; flex-shrink: 0;',
        'border: 2.5px solid rgba(255,255,255,.3); border-top-color: #fff;',
        'border-radius: 50%; animation: scwPublishSpin .8s linear infinite;'
      ].join('');
      toast.appendChild(spin);
    }

    var span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00D7';
    closeBtn.style.cssText = [
      'position: absolute; top: 6px; right: 10px;',
      'background: none; border: none; color: #fff; font-size: 22px;',
      'cursor: pointer; line-height: 1; padding: 0; opacity: 0.8;'
    ].join('');
    closeBtn.addEventListener('mouseenter', function () { closeBtn.style.opacity = '1'; });
    closeBtn.addEventListener('mouseleave', function () { closeBtn.style.opacity = '0.8'; });
    closeBtn.addEventListener('click', dismissPublishToast);
    toast.appendChild(closeBtn);

    document.body.appendChild(toast);

    if (autoClose) {
      setTimeout(dismissPublishToast, 3000);
    }
  }

  /** Navigate to the parent page by stripping the last two hash segments. */
  function redirectToParent() {
    dismissPublishToast();
    var hash = (window.location.hash || '').split('?')[0].replace(/\/+$/, '');
    // Knack child page: #parent-slug/parent-id/child-slug/child-id
    // Strip last two segments → #parent-slug/parent-id
    var parts = hash.replace(/^#\/?/, '').split('/');
    if (parts.length >= 2) {
      parts.splice(-2, 2);
      window.location.hash = '#' + parts.join('/');
    } else {
      window.location.hash = '#';
    }
  }

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

  function runExport(cfg, extra) {
    var payload = scrapeAllViews(cfg);
    if (!payload.views.length) {
      SCW.debug('[SCW PDF Export]', cfg.sceneId, '→ no views scraped');
      return;
    }
    if (extra) {
      for (var k in extra) { if (extra.hasOwnProperty(k)) payload[k] = extra[k]; }
    }
    var htmlStr = buildPdfHtml(payload);
    payload.html = htmlStr;
    sendToWebhook(payload);

    if (cfg.trigger.openPreview) {
      openPdfPreview(htmlStr);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // HIDE EMPTY GRID VIEWS
  // ══════════════════════════════════════════════════════════════

  function hideEmptyGridViews(viewIds) {
    for (var i = 0; i < viewIds.length; i++) {
      var el = document.getElementById(viewIds[i]);
      if (!el) continue;
      el.style.display = viewHasDataRows(viewIds[i]) ? '' : 'none';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // TRIGGER: Button injection
  // ══════════════════════════════════════════════════════════════

  function setupButtonTrigger(cfg) {
    var btnId = cfg.trigger.buttonId;

    $(document).on('knack-scene-render.' + cfg.sceneId, function () {
      setTimeout(function () {
        hideEmptyGridViews(cfg.hideEmptyGrids);

        if (document.getElementById(btnId)) return;

        var sceneEl = document.getElementById('kn-' + cfg.sceneId);
        if (!sceneEl) return;

        var $btn = $('<button></button>')
          .attr('id', btnId)
          .text(cfg.trigger.buttonText || 'Generate PDF')
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
          var payload = scrapeAllViews(cfg);
          if (!payload.views.length) {
            alert('No data found on this page.');
            return;
          }
          var htmlStr = buildPdfHtml(payload);
          if (cfg.trigger.openPreview) {
            openPdfPreview(htmlStr);
          }
          payload.html = htmlStr;
          sendToWebhook(payload);

          if (cfg.saveHtml) {
            // Disable button to prevent double-submit
            $btn.prop('disabled', true).css({ opacity: 0.5, cursor: 'not-allowed' });

            var pageRecordId = getPageRecordId();
            var summary = extractSummaryFields(payload);
            var jsonSnapshot = buildJsonSnapshot(cfg.sceneId);

            var savePayload = {
              recordId: pageRecordId || '',
              hash: window.location.hash || '',
              sceneId: cfg.sceneId,
              type: cfg.payloadType,
              sowId: summary.sowId,
              equipmentTotal: summary.equipmentTotal,
              installationTotal: summary.installationTotal,
              grandTotal: summary.grandTotal,
              expirationDate: summary.expirationDate,
              html: htmlStr,
              json: jsonSnapshot
            };
            SCW.debug('[SCW PDF Export] Sending to save webhook:', savePayload.recordId, summary, '| records:', jsonSnapshot.length);
            showPublishToast('Submitting…', false, true);
            $.ajax({
              url: SAVE_HTML_WEBHOOK,
              type: 'POST',
              contentType: 'application/json',
              data: JSON.stringify(savePayload),
              crossDomain: true,
              timeout: 90000,
              success: function () {
                SCW.debug('[SCW PDF Export] Webhook accepted, redirecting to parent');
                if (cfg.pollViewOnReturn) {
                  try {
                    sessionStorage.setItem('scw-pdf-poll-view', cfg.pollViewOnReturn);
                    if (cfg.pollField) sessionStorage.setItem('scw-pdf-poll-field', cfg.pollField);
                    if (cfg.payloadType) sessionStorage.setItem('scw-pdf-poll-type', cfg.payloadType);
                  } catch (e) {}
                }
                redirectToParent();
              },
              error: function (xhr, status) {
                console.error('[SCW PDF Export] Webhook failed:', status);
                showPublishToast('Webhook failed — please try again.', true, false);
                $btn.prop('disabled', false).css({ opacity: 1, cursor: 'pointer' });
              }
            });
          }
        });

        $(sceneEl).append($btn);
      }, 1500);
    });

    // Re-hide empty grids on view re-render
    if (cfg.hideEmptyGrids.length) {
      var hideEvents = cfg.hideEmptyGrids.map(function (v) { return 'knack-view-render.' + v; }).join(' ');
      $(document).on(hideEvents, function () {
        setTimeout(function () { hideEmptyGridViews(cfg.hideEmptyGrids); }, 500);
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // TRIGGER: Form submit
  // ══════════════════════════════════════════════════════════════

  function setupFormSubmitTrigger(cfg) {
    var formViewId = cfg.trigger.formViewId;
    var ns = '.scwPdfExport' + cfg.sceneId;

    $(document).on('knack-view-render.' + formViewId, function () {
      var $form = $('#' + formViewId + ' form');
      $form.off('submit' + ns).on('submit' + ns, function () {
        var extra = {};

        // Extract record ID from the form
        if (cfg.trigger.recordIdInput) {
          var $idInput = $('#' + formViewId + ' input[name="' + cfg.trigger.recordIdInput + '"]');
          if ($idInput.length) extra.recordId = $idInput.val();
        }
        // Fallback: extract record ID from the URL hash
        if (!extra.recordId) {
          extra.recordId = getPageRecordId();
        }

        // Stamp the user who clicked Submit. Read from Knack.getUserAttributes
        // — works for any logged-in user. null if Knack isn't ready (form
        // submits without auth shouldn't happen, but guard anyway).
        var triggeredBy = getTriggeredBy();
        if (triggeredBy) extra.triggeredBy = triggeredBy;

        // Extract additional field values from the scene DOM
        if (cfg.extraFields) {
          var _fNum;
          for (var ef = 0; ef < cfg.extraFields.length; ef++) {
            var spec = cfg.extraFields[ef];
            if (spec.source === 'url') {
              var urlVal = getPageRecordId();
              if (urlVal) extra[spec.name] = urlVal;
              continue;
            }
            // Echo the resolved recordId under a different key — useful
            // when the receiving Make scenario expects a domain-specific
            // name like "bidId" alongside the generic "recordId".
            if (spec.source === 'recordId') {
              if (extra.recordId) extra[spec.name] = extra.recordId;
              continue;
            }
            _fNum = spec.field.replace('field_', '');
            // If sourceView is specified, scope the search to that view first
            var el = null;
            if (spec.sourceView) {
              el = document.querySelector('#' + spec.sourceView + ' .field_' + _fNum);
              if (!el) el = document.querySelector('#' + spec.sourceView + ' td.' + spec.field);
              if (!el) el = document.querySelector('#' + spec.sourceView + ' [data-field-key="' + spec.field + '"]');
            }
            if (!el) el = document.querySelector('#kn-' + cfg.sceneId + ' .field_' + _fNum);
            if (!el) el = document.querySelector('#kn-' + cfg.sceneId + ' td.' + spec.field);
            if (!el) el = document.querySelector('#kn-' + cfg.sceneId + ' [data-field-key="' + spec.field + '"]');
            // Fallback: search anywhere on the page (field may be in a detail view outside the scene wrapper)
            if (!el) el = document.querySelector('.kn-detail.' + spec.field + ', .kn-label-none.' + spec.field);
            // Read value only — cascade through Knack detail-view DOM wrappers
            var valEl = el ? (el.querySelector('.kn-detail-body .kn-value') || el.querySelector('.kn-detail-body') || el.querySelector('.kn-value') || el) : null;
            var val = valEl ? (valEl.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim() : '';
            if (val) extra[spec.name] = val;
          }
        }

        SCW.debug('[SCW PDF Export]', cfg.sceneId, '→ form submit, scraping...');
        runExport(cfg, extra);

        // Flag for poll-refresh on the parent page
        if (cfg.pollViewOnReturn) {
          try {
            sessionStorage.setItem('scw-pdf-poll-view', cfg.pollViewOnReturn);
            if (cfg.pollField) sessionStorage.setItem('scw-pdf-poll-field', cfg.pollField);
            if (cfg.payloadType) sessionStorage.setItem('scw-pdf-poll-type', cfg.payloadType);
          } catch (e) {}
        }
      });
    });

    // Hide extraFields marked with hide:true when their source view renders
    if (cfg.extraFields) {
      cfg.extraFields.forEach(function (spec) {
        if (!spec.hide || !spec.sourceView) return;
        var _fn = spec.field.replace('field_', '');
        $(document).on('knack-view-render.' + spec.sourceView + ns, function () {
          var el = document.querySelector('#' + spec.sourceView + ' .field_' + _fn)
               || document.querySelector('#' + spec.sourceView + ' [data-field-key="' + spec.field + '"]');
          if (el) {
            var hideTarget = el.closest('.kn-detail') || el;
            hideTarget.style.display = 'none';
          }
        });
      });
    }

    // Also hide empty grids on scene render
    if (cfg.hideEmptyGrids.length) {
      $(document).on('knack-scene-render.' + cfg.sceneId, function () {
        setTimeout(function () { hideEmptyGridViews(cfg.hideEmptyGrids); }, 1500);
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // POLL-REFRESH — after form submit returns to parent page
  // ══════════════════════════════════════════════════════════════

  var POLL_INTERVAL_MS = 4000;
  var POLL_TIMEOUT_MS  = 60000;
  var POLL_TOAST_ID    = 'scw-pdf-poll-toast';
  var POLL_CSS_ID      = 'scw-pdf-poll-css';
  var POLL_NS          = '.scwPdfPoll';
  var _pollTimer       = null;
  var _pollActive      = false;
  var _pollViewId      = null;
  var _pollFieldId     = null;
  var _pollInitial     = '';
  var _pollMsg         = '';

  function injectPollStyles() {
    if (document.getElementById(POLL_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = POLL_CSS_ID;
    s.textContent = [
      '#' + POLL_TOAST_ID + ' {',
      '  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);',
      '  background: #1e3a5f; color: #fff; padding: 10px 20px;',
      '  border-radius: 8px; font-size: 13px; font-weight: 500;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,.18); z-index: 10000;',
      '  display: flex; align-items: center; gap: 8px;',
      '  transition: opacity 300ms ease;',
      '}',
      '#' + POLL_TOAST_ID + ' .scw-poll-spinner {',
      '  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3);',
      '  border-top-color: #fff; border-radius: 50%;',
      '  animation: scwPollSpin .8s linear infinite;',
      '}',
      '#' + POLL_TOAST_ID + ' .scw-poll-close {',
      '  background: none; border: none; color: rgba(255,255,255,.7);',
      '  font-size: 16px; cursor: pointer; padding: 0 0 0 6px;',
      '  line-height: 1; font-weight: 700;',
      '}',
      '#' + POLL_TOAST_ID + ' .scw-poll-close:hover { color: #fff; }',
      '@keyframes scwPollSpin { to { transform: rotate(360deg); } }',
      '.scw-pdf-poll-target { position: relative !important; }',
      '.scw-pdf-poll-target > * { opacity: .35; pointer-events: none; }',
      '.scw-pdf-poll-target::after {',
      '  content: attr(data-scw-poll-msg);',
      '  position: absolute; top: 0; left: 0; right: 0; bottom: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '  background: rgba(255,255,255,.80); border-radius: 6px; z-index: 5;',
      '  color: #555; font-size: 12px; font-weight: 500;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showPollToast(msg) {
    injectPollStyles();
    if (document.getElementById(POLL_TOAST_ID)) return;
    var toast = document.createElement('div');
    toast.id = POLL_TOAST_ID;
    toast.innerHTML = '<span class="scw-poll-spinner"></span> ' + esc(msg || 'Generating PDF\u2026');
    var closeBtn = document.createElement('button');
    closeBtn.className = 'scw-poll-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Dismiss and stop refreshing';
    closeBtn.addEventListener('click', function () {
      stopPolling();
    });
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);
  }

  function hidePollToast() {
    var toast = document.getElementById(POLL_TOAST_ID);
    if (!toast) return;
    toast.style.opacity = '0';
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 350);
  }

  function readFieldText(viewId, fieldId) {
    if (!fieldId) return '';
    var td = document.querySelector('#' + viewId + ' td.' + fieldId);
    if (!td) return '';
    return (td.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim();
  }

  // Apply the overlay class + message to the target td in the current DOM
  function applyFieldOverlay(viewId, fieldId, msg) {
    if (!fieldId) return;
    var td = document.querySelector('#' + viewId + ' td.' + fieldId);
    if (td) {
      td.classList.add('scw-pdf-poll-target');
      td.setAttribute('data-scw-poll-msg', msg || 'Generating PDF\u2026');
    }
  }

  function clearFieldOverlay() {
    var targets = document.querySelectorAll('.scw-pdf-poll-target');
    for (var j = 0; j < targets.length; j++) targets[j].classList.remove('scw-pdf-poll-target');
  }

  function stopPolling() {
    _pollActive = false;
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    $(document).off('knack-view-render.' + _pollViewId + POLL_NS);
    clearFieldOverlay();
    hidePollToast();
    _pollViewId = null;
    _pollFieldId = null;
    _pollInitial = '';
    _pollMsg = '';
  }

  // Called every time the polled view re-renders (from model.fetch or anything else)
  function onPollViewRender() {
    if (!_pollActive) return;
    var newValue = readFieldText(_pollViewId, _pollFieldId);
    SCW.debug('[SCW PDF Export] View render — field check: "' + _pollInitial + '" → "' + newValue + '"');
    if (_pollFieldId && newValue !== _pollInitial) {
      SCW.debug('[SCW PDF Export] Field changed — stopping poll');
      stopPolling();
    } else {
      // View re-rendered with same data; re-apply overlay to fresh td
      applyFieldOverlay(_pollViewId, _pollFieldId, _pollMsg);
    }
  }

  function startPollRefresh(viewId, fieldId, pollType) {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollActive = true;
    _pollViewId = viewId;
    _pollFieldId = fieldId;
    _pollInitial = readFieldText(viewId, fieldId);

    var label = pollType === 'proposal' ? 'quote' : (pollType || 'bid');
    _pollMsg = 'Generating ' + label + ' PDF\u2026';

    SCW.debug('[SCW PDF Export] Polling ' + viewId + ' (watching ' + (fieldId || 'none') + ', initial: "' + _pollInitial + '")');
    showPollToast(_pollMsg);
    applyFieldOverlay(viewId, fieldId, _pollMsg);

    // Listen for every re-render of this view
    $(document).off('knack-view-render.' + viewId + POLL_NS)
               .on('knack-view-render.' + viewId + POLL_NS, onPollViewRender);

    // Interval triggers model.fetch() AND also directly checks the field
    // value (model.fetch may not fire knack-view-render on collapsed views).
    var elapsed = 0;
    _pollTimer = setInterval(function () {
      elapsed += POLL_INTERVAL_MS;
      if (typeof Knack === 'undefined') return;

      // Direct field check — doesn't depend on view re-render event
      if (_pollFieldId) {
        var currentVal = readFieldText(_pollViewId, _pollFieldId);
        if (currentVal !== _pollInitial) {
          SCW.debug('[SCW PDF Export] Field changed (direct check): "' + _pollInitial + '" → "' + currentVal + '"');
          stopPolling();
          return;
        }
      }

      var view = Knack.views && Knack.views[viewId];
      if (view && view.model && typeof view.model.fetch === 'function') {
        view.model.fetch();
      }
      if (elapsed >= POLL_TIMEOUT_MS) {
        SCW.debug('[SCW PDF Export] Poll timeout for ' + viewId + ' after ' + (elapsed / 1000) + 's');
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }

  // Check for poll flag whenever any scene renders
  $(document).on('knack-scene-render.any.scwPdfPoll', function () {
    var viewId, fieldId, pollType;
    try {
      viewId = sessionStorage.getItem('scw-pdf-poll-view');
      fieldId = sessionStorage.getItem('scw-pdf-poll-field');
      pollType = sessionStorage.getItem('scw-pdf-poll-type');
    } catch (e) {}
    if (!viewId) return;
    if (!document.getElementById(viewId)) return;
    try {
      sessionStorage.removeItem('scw-pdf-poll-view');
      sessionStorage.removeItem('scw-pdf-poll-field');
      sessionStorage.removeItem('scw-pdf-poll-type');
    } catch (e) {}
    setTimeout(function () { startPollRefresh(viewId, fieldId, pollType); }, 2000);
  });

  // ══════════════════════════════════════════════════════════════
  // REMOTE API — expose scrape+render for headless/Puppeteer callers
  // ══════════════════════════════════════════════════════════════
  //
  // Entry point for driving the PDF export from outside the user's UI
  // (e.g. a Make "Custom JS" / Puppeteer module). Does NOT post to the
  // webhook and does NOT open a preview window — the caller decides what
  // to do with the returned payload. Requires the target scene to be
  // fully rendered and all SCW feature modules to have run; wait for a
  // sentinel like `.scw-subtotal--level-1` and `window.SCW.pdfExport.run`
  // before calling.

  // Build the exact "save payload" shape the Publish Quote button sends
  // to SAVE_HTML_WEBHOOK. Every code path that publishes a quote should
  // call this so Make receives identical inputs regardless of origin.
  //
  // sceneId is optional — when omitted we auto-detect by:
  //   1. Knack.scene.attributes.key (Knack's JS model)
  //   2. DOM presence of `#kn-<cfg.sceneId>` for any configured scene
  // The DOM check is the more reliable fallback since Knack's JS model
  // can briefly lag DOM state during transitions.
  function resolveConfiguredScene(sceneId) {
    // Explicit pass-through wins.
    if (sceneId) {
      for (var i = 0; i < SCENES.length; i++) {
        if (SCENES[i].sceneId === sceneId) return SCENES[i];
      }
      return null;
    }
    // Try Knack's model.
    try {
      var key = (Knack && Knack.scene && Knack.scene.attributes && Knack.scene.attributes.key) || '';
      if (key) {
        for (var j = 0; j < SCENES.length; j++) {
          if (SCENES[j].sceneId === key) return SCENES[j];
        }
      }
    } catch (e) { /* fall through */ }
    // Fallback: whichever configured scene is actually rendered in the DOM.
    for (var k = 0; k < SCENES.length; k++) {
      if (document.getElementById('kn-' + SCENES[k].sceneId)) return SCENES[k];
    }
    return null;
  }

  function buildPublishPayload(sceneId, opts) {
    opts = opts || {};
    var cfg = resolveConfiguredScene(sceneId);
    if (!cfg) {
      console.warn('[SCW pdfExport] buildPublishPayload: no matching SCENES entry for sceneId=' + sceneId + ' (auto-detect also failed).');
      return null;
    }
    // opts.tbdMode (true | false | undefined) overrides the
    // field_2725-based default inside scrapeAllViews.
    var payload = scrapeAllViews(cfg, opts);
    if (!payload.views.length) {
      console.warn('[SCW pdfExport] buildPublishPayload: scrapeAllViews returned 0 views for ' + cfg.sceneId + '. Page may not be fully rendered.');
      return null;
    }
    var htmlStr      = buildPdfHtml(payload);
    var summary      = extractSummaryFields(payload);
    var jsonSnapshot = buildJsonSnapshot(cfg.sceneId);
    return {
      recordId:          getPageRecordId() || '',
      hash:              window.location.hash || '',
      sceneId:           cfg.sceneId,
      type:              cfg.payloadType,
      sowId:             summary.sowId,
      equipmentTotal:    summary.equipmentTotal,
      installationTotal: summary.installationTotal,
      grandTotal:        summary.grandTotal,
      expirationDate:    summary.expirationDate,
      html:              htmlStr,
      json:              jsonSnapshot,
      // Token contract — Make's "Tools → Replace" step should run
      // through this list and substitute each {{TOKEN}} occurrence in
      // .html with the post-create record's matching field. Listed on
      // the payload so the Make scenario doesn't have to keep its own
      // hard-coded copy.
      tokens:            PROPOSAL_TOKENS
    };
  }

  window.SCW = window.SCW || {};
  window.SCW.pdfExport = {
    run: function (sceneId) {
      var cfg = null;
      for (var si = 0; si < SCENES.length; si++) {
        if (SCENES[si].sceneId === sceneId) { cfg = SCENES[si]; break; }
      }
      if (!cfg) return null;
      var payload = scrapeAllViews(cfg);
      if (!payload.views.length) return payload;
      payload.html = buildPdfHtml(payload);
      return payload;
    },
    getCss: getPdfCss,
    buildPublishPayload: buildPublishPayload,
    // Exposed so consumers (or a future Make-replacement helper that
    // also runs client-side, e.g. for previewing) can introspect the
    // token list without poking at internals.
    PROPOSAL_TOKENS: PROPOSAL_TOKENS
  };

  // ══════════════════════════════════════════════════════════════
  // INIT — wire up all scenes
  // ══════════════════════════════════════════════════════════════

  for (var i = 0; i < SCENES.length; i++) {
    var cfg = SCENES[i];

    if (cfg.trigger.type === 'button') {
      setupButtonTrigger(cfg);
    } else if (cfg.trigger.type === 'formSubmit') {
      setupFormSubmitTrigger(cfg);
    }
  }
})();
