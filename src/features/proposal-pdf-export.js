/*** SCW PDF EXPORT — Multi-Scene Template ***/
(function () {
  'use strict';

  // Default publish webhook (proposal publish flow). The Make scenario
  // behind it stamps the new proposal record (HTML snapshot, JSON
  // snapshot, totals, expiration, token + tokenized URL), generates
  // PDFs, sends notifications. Per-scene SCENES entries can override
  // via `webhookUrl` when they're a different business flow with its
  // own Make scenario (e.g. subcontractor-bid submits on scene_1149).
  var WEBHOOK_URL = 'https://hook.us1.make.com/mezrtqmf6gh7yxlkx5fkit6fqrma213l';

  // Subcontractor-bid form-submit scenario. Used by scene_1149 only —
  // different business flow than a proposal publish, separate Make
  // scenario, different downstream Knack writes.
  var SUBCONTRACTOR_BID_WEBHOOK = 'https://hook.us1.make.com/ozk2uk1e58upnpsj0fx1bmdg387ekvf5';

  // Mint a public-access token + URL via the shared sales-side helper.
  // Used by every publish path (buildPublishPayload AND the inline
  // savePayload below) so the proposal record is born with field_2904
  // and field_2908 populated. SCW.secureProposalLink is set by
  // src/features/secure-proposal-link.js — load-order safe because
  // every caller here runs at click time, by which point both files
  // are present. Returns blanks + a console.warn on missing helpers
  // (graceful degrade — staff can still mint manually via the
  // Secure Proposal Link panel).
  function mintProposalAccess() {
    try {
      if (window.SCW && SCW.secureProposalLink &&
          typeof SCW.secureProposalLink.generateToken === 'function') {
        var t = SCW.secureProposalLink.generateToken();
        return { token: t, url: SCW.secureProposalLink.buildPublicUrl(t) };
      }
      console.warn('[SCW pdfExport] SCW.secureProposalLink not loaded; publish payload will lack proposalAccessToken/Url.');
    } catch (e) {
      console.warn('[SCW pdfExport] Token mint failed:', e && e.message);
    }
    return { token: '', url: '' };
  }

  // ══════════════════════════════════════════════════════════════
  // SCENE CONFIGS — add new scenes here
  // ══════════════════════════════════════════════════════════════

  var SCENES = [
    {
      sceneId: 'scene_1096',
      trigger: {
        type: 'button',
        buttonId: 'scw-proposal-pdf-btn',
        openPreview: false,
        buttonText: 'Publish Quote',
        // mountSelector: a CSS selector relative to the rendered scene
        // where the button is appended (inline placement). When omitted,
        // the button falls back to fixed-bottom-right. On scene_1096 the
        // .kn-notification "Proposal Preview Only — NOT Client Facing"
        // banner is the natural home — staff see it the moment they
        // land on the page.
        mountSelector: '.kn-notification',
        // hideIfFieldFilled: only show the button when this field is
        // blank on any record loaded into the scene. Once the SOW has
        // been published, field_1199 carries the published-proposal
        // back-reference — re-publishing from the preview at that point
        // would create a duplicate, so the button gates itself.
        hideIfFieldFilled: 'field_1199'
      },
      // view_3861 is the Ops-side SOW details host (hidden via CSS)
      // — its presence in the DOM is a signal for TBD-masking and the
      // Ops stepper, not part of the published proposal. Keep it out
      // of the PDF scrape.
      // view_3345 is the Ops stepper host (rich-text role-gated).
      // view_3969 is the Sales stepper host (rich-text role-gated) —
      //   same deal as the Ops stepper; its action buttons must not
      //   render into the published proposal.
      // view_3883 is the published-quote info host we inject into.
      // view_3886 is the published-proposals data source we read to
      //   populate view_3883 — itself not part of the quote.
      // Neither belongs in the published proposal content.
      skipViews: {
        view_3342: true,
        view_3861: true,
        view_3345: true,
        view_3969: true,
        view_3883: true,
        view_3886: true,
        // CTA button surfaced on the published-proposal page
        // (scene_1279) by published-proposal-render.js. Belongs around
        // the iframe, not inside the scraped quote html.
        view_3858: true,
        view_3902: true,
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
        view_3897: true,
        // Site maps + additional photos. Skipped from the natural
        // grid scrape — they're appended to the END of the PDF in a
        // dedicated image section instead (see appendImageViews).
        view_3928: true,
        view_3929: true
      },
      // Image-attachment views appended to the END of the PDF (in
      // order). Each entry: { viewId, label }. Site maps render first,
      // additional photos second, each image on its own page with the
      // section label on top. Files come from any field_<N>_raw on the
      // record carrying { filename, url } / { public_url } — same
      // shape Knack uses for every file-upload field.
      // view_3929 (Additional Photos) is a Knack *Image* field (field_771)
      // with server-generated thumbnail renditions. Knack thumbnail URLs are
      // just the original asset URL with the `/original/` path segment swapped
      // for `/thumb_NN/`, e.g.
      //   .../<assetId>/original/photo.jpg  ->  .../<assetId>/thumb_15/photo.jpg
      // `thumbVariant: 'thumb_14'` (the 300x300 rendition) is emitted directly
      // — it's already small, so we skip the canvas-downscale round-trip.
      // view_3928 (Site Maps) has no server thumbnails, so it stays on the
      // canvas-downscale path; its Image-field (field_754) assets are loaded
      // for downscaling from the rendered DOM <img> src (CORS-clean S3 host)
      // because their _raw.url taints the canvas (see collectDomImageSrcs).
      appendImageViews: [
        // ⚠️ proxyResize routes DOM-rendered map assets (File-field
        // floorplans that can't be canvas-downscaled) through a third-party
        // resize CDN — see SECURITY note in CLAUDE.md and toProxyResizeUrl.
        // includeFileLinks: surface non-image uploads (e.g. a PDF floorplan
        // in field_68) as download links / merge-targets. Image maps
        // (field_754) still go through proxyResize above.
        { viewId: 'view_3928', label: 'Site Maps', fullPage: true, proxyResize: { w: 2000, q: 80 }, includeFileLinks: true },
        { viewId: 'view_3929', label: 'Additional Photos', thumbVariant: 'thumb_14' }
      ],
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
      // Subcontractor-bid submits go to a separate Make scenario —
      // different inputs (bidId / surveyRequestId / clientSite),
      // different downstream Knack writes. Do NOT route this through
      // the proposal publish scenario.
      webhookUrl: SUBCONTRACTOR_BID_WEBHOOK,
      trigger: { type: 'formSubmit', formViewId: 'view_3679', recordIdInput: 'id' },
      skipViews: { view_3679: true, view_3770: true, view_3552: true, view_4073: true },
      hideEmptyGrids: [],
      gridKeys: { qty: 'field_2399', cost: 'field_2401', rate: 'field_2400' },
      // Bid identity header at the top of the rendered bid document:
      // field_2638 designates WHICH survey request + which bid + the
      // friendly name; field_2635 is the bid expiration date. Both live on
      // view_3552 (skipped from the scrape as PDF content, but its DOM is
      // on the scene and readable). NOTE field_2638 renders as
      // .kn-label-none, not .kn-detail.
      bidHeaderField:  'field_2638',
      bidExpiresField: 'field_2635',
      payloadType: 'subcontractor bid',
      pollViewOnReturn: 'view_3507',
      pollField: 'field_2626',
      extraFields: [
        { field: 'field_2386', name: 'surveyRequestId' },
        // bidId comes from the resolved record id — same source the
        // form's hidden `id` input feeds extra.recordId from. URL-based
        // extraction missed it when the bid-submit URL didn't end in a
        // 24-hex segment.
        { name: 'bidRecordID', source: 'recordId' },
        { field: 'field_666',  name: 'clientSite' },
        { field: 'field_2410', name: 'projectAddress' },
        { field: 'field_2633', name: 'bidVersionCounter' },   // SYS_bid version counter
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

  function labelSlug(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
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
    // proposal-grid hides relocated-empty Mounting Hardware L2/L3 headers
    // via .scw-empty-group-header { display: none } — class-based, not
    // inline. Without honoring it here, the original "Mounting Hardware"
    // L2 still gets emitted as a separate top-level section even though
    // every accessory has been moved under its parent camera.
    if (tr.classList.contains('scw-empty-group-header')) return false;
    if (tr.classList.contains('scw-hide-level3-header')) return false;
    if (tr.classList.contains('scw-hide-level4-header')) return false;
    if (tr.style.display === 'none') return false;
    return true;
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
        // Skip empty/hidden L2 (e.g. original "Mounting Hardware" L2
        // after accessories have been relocated under their parent
        // cameras). Without this, the snapshot emits a separate
        // mounting-hardware section in addition to the per-camera
        // nested accessories — visibly diverging from the live grid.
        if (!isVisibleRow(tr)) {
          currentL2 = null;
          currentL3 = null;
          continue;
        }

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
        // Rate (unit price) — only scenes that declare gridKeys.rate (the
        // subcontractor bid scene) capture it; feeds the named bidLineItems block.
        var l3Rate = (keys.rate && !hideCost) ? norm((tr.querySelector('td.' + keys.rate) || {}).textContent || '') : '';

        var connDevSpan = tr.querySelector('.scw-l3-connected-devices');
        var connDevices = [];
        if (connDevSpan) {
          var connText = norm(connDevSpan.textContent).replace(/^\(/, '').replace(/\)$/, '');
          if (connText) connDevices = connText.split(',').map(function (s) { return norm(s); }).filter(Boolean);
        } else {
          // Fallback: newer proposal-grid renders the camera/reader
          // label list inline inside .scw-concat-cameras as an orange
          // <b>(E-1, E-2, …)</b>. groupLabelText() strips those <b>s
          // out of the L3 label, so if we don't pull them out here
          // they vanish from the PDF entirely. Same parenthesized
          // pattern the L4 scraper already uses.
          var l3CamBs = tr.querySelectorAll('.scw-concat-cameras b');
          for (var l3cb = 0; l3cb < l3CamBs.length; l3cb++) {
            var l3CamText = norm(l3CamBs[l3cb].textContent);
            if (/^\(.*\)$/.test(l3CamText)) {
              var listText = l3CamText.replace(/^\(/, '').replace(/\)$/, '');
              connDevices = listText.split(',').map(function (s) { return norm(s); }).filter(Boolean);
              break;
            }
          }
        }

        var isMounting = tr.classList.contains('scw-level3--mounting-hardware');

        currentL3 = {
          level: 3, label: l3Label, qty: l3Qty, cost: l3Cost, rate: l3Rate, hideCost: hideCost,
          connectedDevices: connDevices, isMountingHardware: isMounting, lineItems: [],
        };

        if (currentL2) currentL2.products.push(currentL3);
        continue;
      }

      if (tr.classList.contains('scw-mounting-product-line')) {
        // proposal-grid emits these synthetic rows AFTER the
        // "Mounting Hardware" .scw-mounting-l4 header to summarize
        // accessory rollups per bracket product. They have no id and
        // no kn-table-group class, so without this branch they fall
        // through every other case and the snapshot ends up with an
        // empty "Mounting Hardware" L4 — visibly out of sync with
        // the live grid which shows e.g. "Electrical Box Mount …
        // (I-7, I-8, RA-E-1, …)  Qty 7  Cost $280.00".
        if (!currentL3) continue;
        var mptLabelTd = tr.querySelector('td:first-child');
        if (!mptLabelTd) continue;
        var mptClone = mptLabelTd.cloneNode(true);
        var mptParents = mptClone.querySelector('.scw-mounting-parents');
        var mptParentList = '';
        if (mptParents) {
          mptParentList = norm(mptParents.textContent).replace(/^\(/, '').replace(/\)$/, '').trim();
          mptParents.remove();
        }
        var mptName = norm(mptClone.textContent);
        if (!mptName) continue;
        var mptQty = parseMoney(norm((tr.querySelector('td.' + keys.qty) || {}).textContent || ''));
        var mptCost = norm((tr.querySelector('td.' + keys.cost) || {}).textContent || '');
        currentL3.lineItems.push({
          level: 4, label: mptName, description: '',
          qty: mptQty, cost: mptCost, cameraList: mptParentList,
          // These rollup lines are relocated EQUIPMENT accessories (hard
          // drives, rack enclosures, box mounts) — their cost is an
          // equipment price, not install labor, so it must NOT be masked to
          // "TBD" when the bid is unreleased (see applyTbdToPublishPayload).
          isEquipment: true,
        });
        continue;
      }

      if (tr.classList.contains('scw-mounting-labor-line')) {
        // The install-labor sub-line proposal-grid emits beneath an
        // equipment accessory that carries its own labor (e.g. a rack
        // enclosure). Unlike the equipment rollup line above, this IS
        // install labor — leave it maskable so it renders "TBD" when the
        // bid is unreleased.
        if (!currentL3) continue;
        var mltLabelTd = tr.querySelector('td:first-child');
        if (!mltLabelTd) continue;
        var mltName = norm(mltLabelTd.textContent);
        if (!mltName) continue;
        var mltCost = norm((tr.querySelector('td.' + keys.cost) || {}).textContent || '');
        currentL3.lineItems.push({
          level: 4, label: mltName, description: '',
          qty: '', cost: mltCost, cameraList: '',
        });
        continue;
      }

      if (tr.classList.contains('kn-group-level-4')) {
        if (!isVisibleRow(tr)) continue;

        // The .scw-mounting-l4 "Mounting Hardware" L4 is just a section
        // divider above the .scw-mounting-product-line summary rows
        // we already capture below. Emitting it as its own L4 line
        // item produces a redundant "Mounting Hardware  Qty: 0" row
        // in the PDF that sits right above the actual bracket rows.
        // The product-line rows under it carry the qty + cost we want.
        if (tr.classList.contains('scw-mounting-l4')) continue;

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
        if (!line || !line.label) continue;
        var lbl = String(line.label);
        // Install-labor subtotal AND the grand total both render "TBD". The
        // grand total sums in install labor, so while the bid is unreleased it
        // shows "TBD" rather than the equipment-only figure.
        if (/installation/i.test(lbl) || /grand\s*total/i.test(lbl)) {
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
                  // Equipment accessory rollup lines carry a real equipment
                  // price, not install labor — leave them alone.
                  if (prod.lineItems[li].isEquipment) continue;
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

  // ── Append-image scrape ────────────────────────────────────
  // Walk a Knack view's loaded model for every image-file attachment
  // and return [{ src, alt, filename }] in record order. Used by
  // scrape* paths that append cover pages of site maps / additional
  // photos to the end of the PDF.

  function isImageFile(file) {
    if (!file) return false;
    var name = String(file.filename || '').toLowerCase();
    var type = String(file.type || '').toLowerCase();
    if (type && type.indexOf('image/') === 0) return true;
    return /\.(png|jpe?g|gif|webp|bmp)$/.test(name);
  }

  function extractAppendImageViewRecords(view) {
    if (!view || !view.model) return [];
    var data = view.model.data;
    if (!data) return [];
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

  function extractFilesFromRecord(record) {
    var files = [];
    if (!record) return files;
    for (var key in record) {
      if (!record.hasOwnProperty(key)) continue;
      if (!/^field_\d+_raw$/.test(key)) continue;
      var val = record[key];
      if (!val) continue;
      if (Array.isArray(val)) {
        for (var i = 0; i < val.length; i++) {
          var v = val[i];
          if (v && v.filename && (v.url || v.public_url)) files.push(v);
        }
      } else if (val.filename && (val.url || val.public_url)) {
        files.push(val);
      }
    }
    return files;
  }

  // ── Append-image downscaling ───────────────────────────────
  // Site Maps / Additional Photos live in Knack *file* fields, which get
  // no server-side thumbnails — appending the full-size original bloats
  // the PDF to many MB. Instead we downscale each image in the browser
  // (canvas → JPEG, longest edge ≤ IMG_MAX_EDGE) and inline the result as
  // a data URI in the scraped HTML. Knack's asset host allows cross-
  // origin canvas reads (verified), so toDataURL() doesn't taint.
  //
  // buildPublishPayload is synchronous and called from three publish
  // paths, so we can't await the decode there. Instead we PRE-WARM a
  // url→dataURI cache on scene/view render (prewarmAppendImages); by the
  // time the user clicks Publish the cache is almost always ready.
  // scrapeImagesFromView reads the cache and falls back to the original
  // URL on a miss, so a cold cache degrades to the prior behaviour rather
  // than breaking.
  var IMG_MAX_EDGE = 3000;        // longest edge cap (preserves aspect ratio)
  var IMG_JPEG_QUALITY = 0.7;
  var _imgDownscaleCache = Object.create(null);    // url → dataURI ('' = failed)
  var _imgDownscaleInflight = Object.create(null); // url → Promise

  function downscaleImageToDataURL(url) {
    if (!url) return Promise.resolve('');
    if (_imgDownscaleCache[url] !== undefined) return Promise.resolve(_imgDownscaleCache[url]);
    if (_imgDownscaleInflight[url]) return _imgDownscaleInflight[url];

    var p = new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) { _imgDownscaleCache[url] = ''; resolve(''); return; }
          var scale = Math.min(1, IMG_MAX_EDGE / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
          var dataUri = canvas.toDataURL('image/jpeg', IMG_JPEG_QUALITY);
          _imgDownscaleCache[url] = dataUri;
          resolve(dataUri);
        } catch (e) {
          _imgDownscaleCache[url] = '';   // CORS taint / canvas error → URL fallback
          resolve('');
        }
      };
      img.onerror = function () { _imgDownscaleCache[url] = ''; resolve(''); };
      img.src = url;
    });
    _imgDownscaleInflight[url] = p;
    return p;
  }

  // Kick off downscaling for every append-image URL on the scene so the
  // cache is warm before the user publishes. Cheap + idempotent; safe to
  // call repeatedly (downscaleImageToDataURL dedupes by URL).
  function prewarmAppendImages(cfg) {
    if (!cfg || !cfg.appendImageViews || !cfg.appendImageViews.length) return;
    try {
      var sections = scrapeAppendImageSections(cfg);
      for (var s = 0; s < sections.length; s++) {
        var imgs = sections[s].images || [];
        for (var i = 0; i < imgs.length; i++) {
          // Skip URLs that are emitted directly (server thumbnails, resize
          // proxy) — they're already small and never read from the cache.
          var pu = imgs[i] && imgs[i].url;
          if (pu && pu.indexOf('/thumb_') === -1 && pu.indexOf('images.weserv.nl') === -1) {
            downscaleImageToDataURL(pu);
          }
        }
      }
    } catch (e) { /* non-fatal */ }
  }

  // Knack thumbnail URLs are the original asset URL with the `/original/`
  // path segment replaced by `/thumb_NN/`. Returns the original unchanged if
  // it doesn't contain `/original/` (e.g. File-field uploads, which have no
  // server thumbnail).
  function toThumbUrl(url, variant) {
    if (!url || !variant) return url;
    return url.indexOf('/original/') !== -1
      ? url.replace('/original/', '/' + variant + '/')
      : url;
  }

  function basenameOf(url) {
    return decodeURIComponent((url || '').split('?')[0].split('/').pop() || '');
  }

  // ⚠️ THIRD-PARTY IMAGE PROXY — see SECURITY note in CLAUDE.md.
  // Site Map floorplans live in Knack *File* fields, which: (a) cannot have
  // server-side thumbnails, and (b) are served from an asset host that does
  // NOT send CORS headers — so they taint a <canvas> and can't be downscaled
  // in the browser (verified: the embedded bytes were identical across
  // builds). The only way to shrink them while keeping the "just send the
  // HTML" pipeline is to point the <img> at a server-side resize proxy that
  // Make fetches instead of the full-res original.
  //
  // images.weserv.nl is a free public image CDN. The asset URL is passed to
  // it scheme-less and url-encoded. `&we` = no enlargement (don't upscale a
  // smaller map). This means the floorplan image transits / may be cached by
  // a third party. The Knack asset URLs are already public-but-unguessable,
  // but these are camera-placement diagrams — treat as a known, accepted
  // tradeoff, not something to extend silently to other images.
  function toProxyResizeUrl(url, opts) {
    if (!url) return url;
    var w = (opts && opts.w) || 2000;
    var q = (opts && opts.q) || 80;
    var bare = url.replace(/^https?:\/\//, '');
    // End the proxy URL with a real ".jpg" extension via weserv's `filename`
    // param. The published HTML snapshot (field_2680) round-trips through a
    // Knack rich-text field, whose sanitizer BLANKS <img src> URLs that don't
    // end in a recognized image extension — the bare proxy URL ended in
    // "&we", so the Site Map src came out empty in the stored snapshot and
    // the customer-facing page showed a broken-image icon. (The PDF was
    // unaffected because Make builds it from the live payload.html, not the
    // stored snapshot.) `filename` only sets the download name — it does NOT
    // change the rendered/resized output — so the PDF resize behaviour is
    // identical; we're purely making the URL survive the sanitizer.
    var base = basenameOf(url).replace(/\.[^.]+$/, '') || 'sitemap';
    var dlName = encodeURIComponent(base) + '.jpg';
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(bare) +
           '&w=' + w + '&output=jpg&q=' + q + '&we&filename=' + dlName;
  }

  // Inverse of toProxyResizeUrl — recover the original asset URL from a
  // weserv proxy URL by reading back its `url=` param. Returns the input
  // unchanged when it isn't a weserv URL. Used by the in-app preview to
  // show raw full-size images without the third-party CDN round-trip.
  function unwrapResizeProxyUrl(url) {
    if (!url || url.indexOf('images.weserv.nl') === -1) return url;
    var m = /[?&]url=([^&]+)/.exec(url);
    if (!m) return url;
    var bare = decodeURIComponent(m[1]);
    return /^https?:\/\//.test(bare) ? bare : 'https://' + bare;
  }

  // Build the SNAPSHOT variant of the published HTML — the copy Make stores
  // in Knack's field_2680 rich-text field (rendered on the customer-facing
  // published page). That field's sanitizer strips <img src> values that are
  // data: URIs or carry a query string, which blanked the Site Map images
  // there: Site Maps render from an api.knack.com URL that collectDomImageSrcs
  // doesn't recognize, so they take the canvas-downscale path and get embedded
  // as base64 data URIs — exactly what the sanitizer drops (the clean https://
  // logo URL survives). Swap each appended image's src to its original clean
  // asset URL (img.url — always an https:// Knack/CDN link, no data:, no
  // query), which survives storage AND renders natively. The PDF keeps the
  // inline/resized variant via payload.htmlPdf.
  function buildSnapshotHtml(payload, fallbackHtml) {
    var secs = payload && payload.appendImageSections;
    if (!secs || !secs.length) return fallbackHtml;
    var saved = [];
    for (var i = 0; i < secs.length; i++) {
      var imgs = secs[i].images || [];
      for (var j = 0; j < imgs.length; j++) {
        saved.push([imgs[j], imgs[j].src]);
        if (imgs[j].url) imgs[j].src = imgs[j].url;
      }
    }
    var html = buildPdfHtml(payload);
    for (var k = 0; k < saved.length; k++) saved[k][0].src = saved[k][1];
    return html;
  }

  // Collect rendered <img> srcs from a view's table. Knack *Image*/File
  // assets (e.g. field_754 Site Maps) render the asset from an S3 host that
  // does NOT allow cross-origin canvas reads, so the browser can display
  // them but cannot downscale them (toDataURL taints → full-res original is
  // embedded). We use this map both to identify those DOM-rendered assets
  // and to route them through the server-side resize proxy. Keyed by
  // filename so it can be matched against the record-derived files.
  function collectDomImageSrcs(viewId) {
    var map = {};
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return map;
    var imgs = viewEl.querySelectorAll('table img');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src') || imgs[i].src || '';
      if (!src || src.indexOf('data:') === 0) continue;
      if (src.indexOf('knackhq.com') === -1 && src.indexOf('amazonaws.com') === -1) continue;
      var fn = basenameOf(src);
      if (fn) map[fn.toLowerCase()] = src;
    }
    return map;
  }

  function scrapeImagesFromView(entry) {
    var viewId = entry.viewId;
    var label = entry.label;
    var out = [];
    if (typeof Knack === 'undefined' || !Knack.views) return out;
    var view = Knack.views[viewId];
    if (!view) return out;
    var records = extractAppendImageViewRecords(view);

    // Gather image files from the records (File fields carry CORS-clean
    // urls in _raw). For the canvas path, prefer the DOM-rendered <img> src
    // when one matches by filename — Image-field _raw urls taint the canvas
    // (see collectDomImageSrcs). The thumbVariant path doesn't canvas-read,
    // so it always uses the record url + URL transform.
    var domSrcs = entry.thumbVariant ? {} : collectDomImageSrcs(viewId);
    var files = [];
    var byName = {};
    for (var r = 0; r < records.length; r++) {
      var recFiles = extractFilesFromRecord(records[r]);
      for (var f = 0; f < recFiles.length; f++) {
        var file = recFiles[f];
        if (!isImageFile(file)) continue;
        var u = file.url || file.public_url || '';
        if (!u) continue;
        var fname = file.filename || basenameOf(u);
        // DOM-rendered assets (Image/File maps on the no-CORS S3 host) can't
        // be canvas-downscaled; mark them so they go through the resize proxy.
        var domSrc = domSrcs[String(fname).toLowerCase()];
        files.push({ filename: fname, url: domSrc || u, fromDom: !!domSrc });
        if (fname) byName[String(fname).toLowerCase()] = true;
      }
    }
    // Add any DOM images that have no matching record file (map rows whose
    // _raw lacks a usable filename/url, so extractFilesFromRecord didn't
    // surface them).
    if (!entry.thumbVariant) {
      for (var key in domSrcs) {
        if (!domSrcs.hasOwnProperty(key) || byName[key]) continue;
        files.push({ filename: basenameOf(domSrcs[key]), url: domSrcs[key], fromDom: true });
      }
    }

    // Dedupe repeated uploads of the same file (same filename, different
    // asset ids); without this each duplicate becomes its own full-page
    // image in the PDF — bloating the file and showing the same picture
    // twice. Key on filename, falling back to the URL when there's no name.
    var seen = {};
    for (var k = 0; k < files.length; k++) {
      var fl = files[k];
      var url = fl.url;
      if (!url) continue;
      var dkey = fl.filename
        ? 'fn:' + String(fl.filename).toLowerCase().trim()
        : 'url:' + url;
      if (seen[dkey]) continue;
      seen[dkey] = true;

      if (entry.thumbVariant) {
        // Native server thumbnail — already small, emit the URL directly
        // (no canvas-downscale round-trip).
        var thumbUrl = toThumbUrl(url, entry.thumbVariant);
        out.push({
          src: thumbUrl,
          url: thumbUrl,
          filename: fl.filename || '',
          alt: fl.filename || label || ''
        });
      } else if (entry.proxyResize) {
        // Map asset that can't be canvas-downscaled (no-CORS File/Image host)
        // AND whose raw File-field URL won't render natively / survive the
        // snapshot sanitizer. Route through the server-side resize proxy so
        // Make (and the published page) fetch a small, renderable .jpg copy —
        // for DOM-matched assets (fromDom) this resizes the DOM src; otherwise
        // it resizes the record's asset URL. Site Maps hit the latter (their
        // api.knack.com File URL isn't matched by collectDomImageSrcs).
        // ⚠️ third-party CDN, Site-Maps-only; see toProxyResizeUrl / CLAUDE.md.
        var proxyUrl = toProxyResizeUrl(url, entry.proxyResize);
        out.push({
          src: proxyUrl,
          url: proxyUrl,
          filename: fl.filename || '',
          alt: fl.filename || label || ''
        });
      } else {
        var cachedDataUri = _imgDownscaleCache[url];
        out.push({
          src: cachedDataUri ? cachedDataUri : url,
          url: url,
          filename: fl.filename || '',
          alt: fl.filename || label || ''
        });
      }
    }
    return out;
  }

  // Collect NON-image file attachments (e.g. a PDF site-map uploaded to a
  // File field like view_3928 field_68) from a view's loaded records. These
  // can't be inlined as <img>, so they surface as download links in the
  // preview/published HTML and their URLs ride the payload for Make to merge.
  // Only runs for entries flagged includeFileLinks; deduped by filename.
  function scrapeFilesFromView(entry) {
    var out = [];
    if (!entry.includeFileLinks) return out;
    if (typeof Knack === 'undefined' || !Knack.views) return out;
    var view = Knack.views[entry.viewId];
    if (!view) return out;
    var records = extractAppendImageViewRecords(view);
    var seen = {};
    for (var r = 0; r < records.length; r++) {
      var recFiles = extractFilesFromRecord(records[r]);
      for (var f = 0; f < recFiles.length; f++) {
        var file = recFiles[f];
        if (isImageFile(file)) continue;   // images go through the image path
        var url = file.url || file.public_url || '';
        if (!url) continue;
        var fname = file.filename || basenameOf(url);
        var dkey = fname ? 'fn:' + String(fname).toLowerCase().trim() : 'url:' + url;
        if (seen[dkey]) continue;
        seen[dkey] = true;
        out.push({ filename: fname || '', url: url });
      }
    }
    return out;
  }

  function scrapeAppendImageSections(cfg) {
    var sections = [];
    if (!cfg.appendImageViews || !cfg.appendImageViews.length) return sections;
    for (var i = 0; i < cfg.appendImageViews.length; i++) {
      var entry = cfg.appendImageViews[i];
      var images = scrapeImagesFromView(entry);
      var attachments = scrapeFilesFromView(entry);
      if (!images.length && !attachments.length) continue;
      sections.push({
        viewId: entry.viewId, label: entry.label, images: images,
        attachments: attachments, fullPage: !!entry.fullPage
      });
    }
    return sections;
  }

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

    // Image attachments to append at the END of the rendered PDF
    // (site maps, additional photos). buildPdfHtml emits a cover-page
    // section per image after the project content + report views.
    result.appendImageSections = scrapeAppendImageSections(cfg);

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

    // Bid identity header (subcontractor bid scene) — read from the
    // user-hidden view_4073; hidden views still have readable DOM.
    if (cfg.bidHeaderField || cfg.bidExpiresField) {
      var readSceneField = function (fk) {
        if (!fk || !sceneEl) return '';
        var el = sceneEl.querySelector('.kn-detail.' + fk + ' .kn-detail-body') ||
                 sceneEl.querySelector('.kn-label-none.' + fk + ' .kn-detail-body') ||
                 sceneEl.querySelector('.kn-detail.' + fk) ||
                 sceneEl.querySelector('.kn-label-none.' + fk) ||
                 sceneEl.querySelector('td.' + fk) ||
                 sceneEl.querySelector('[data-field-key="' + fk + '"]');
        // Trim a trailing "|" (the field_2638 label template ends with a
        // separator when no friendly name follows).
        return el ? norm(el.textContent || '').replace(/[|\s]+$/, '') : '';
      };
      result.bidHeader = {
        label:   readSceneField(cfg.bidHeaderField),
        expires: readSceneField(cfg.bidExpiresField)
      };
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
          html.push('<div class="l1-footer-line l1-line--' + line.type + ' l1-line--' + labelSlug(line.label) + '">');
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
  // Single-underscore wrap (_Foo_) — the {{...}} form was getting
  // resolved as Make module references, [...] hit Make's replace-
  // regex character-class issue, and __Foo__ (double underscore)
  // also failed to substitute. Single underscores keep the token
  // visually distinct without colliding with regex / Make syntax.
  //
  //   _Proposal_ID_       public-facing identifier (e.g. "20260427-10055_v30")
  //                       — the human-readable proposal name, NOT the
  //                       24-hex Knack record id (Make has that in
  //                       its own context already).
  //   _Proposal_URL_      canonical published-proposals details link
  //   _Expiration_Date_   formatted MM/DD/YYYY
  //   _Version_           proposal version number
  var PROPOSAL_TOKENS = [
    'Proposal_ID',
    'Proposal_URL',
    'Expiration_Date',
    'Version'
  ];
  function tok(name) { return '_' + name + '_'; }

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

    // Bid identity header — WHICH survey request / bid / friendly name
    // (field_2638) + expiration date (field_2635) at the top of the
    // subcontractor bid document. Understated: a header line with a thin
    // rule, not a callout.
    if (payload.bidHeader && (payload.bidHeader.label || payload.bidHeader.expires)) {
      html.push('<div class="bid-id-header" style="margin:0 0 16px;padding:0 0 10px;border-bottom:2px solid #e2e8f0;">');
      if (payload.bidHeader.label) {
        html.push('<div style="font-weight:700;font-size:16px;line-height:1.3;color:#07467c;">' + esc(payload.bidHeader.label) + '</div>');
      }
      if (payload.bidHeader.expires) {
        html.push('<div style="margin-top:2px;font-size:12px;color:#64748b;">Bid expires: ' + esc(payload.bidHeader.expires) + '</div>');
      }
      html.push('</div>');
    }

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
        html.push('<div class="pt-line pt-line--' + tline.type + ' pt-line--' + labelSlug(tline.label) + '">');
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

    // Append image attachments at the very end of the PDF — site
    // maps first, additional photos second, each image full-page
    // with the section label on top.
    if (payload.appendImageSections && payload.appendImageSections.length) {
      for (var ais = 0; ais < payload.appendImageSections.length; ais++) {
        renderAppendImageSection(payload.appendImageSections[ais], html);
      }
    }

    html.push('</body></html>');
    return html.join('\n');
  }

  function renderAttachmentLinks(section, html, label) {
    var atts = (section && section.attachments) || [];
    if (!atts.length) return;
    html.push('<section class="append-attachment-section">');
    if (label) {
      html.push('<h2 class="append-image-title">' + esc(label) + ' — Attachments</h2>');
    }
    html.push('<ul class="append-attachment-list">');
    for (var a = 0; a < atts.length; a++) {
      var name = atts[a].filename || basenameOf(atts[a].url) || 'Attachment';
      html.push('<li><a class="append-attachment-link" href="' + esc(atts[a].url) + '">' +
                esc(name) + '</a></li>');
    }
    html.push('</ul>');
    html.push('</section>');
  }

  function renderAppendImageSection(section, html) {
    if (!section) return;
    var label = section.label || '';
    if (!section.images || !section.images.length) {
      // Attachment-only section (e.g. a PDF site map with no image rows).
      renderAttachmentLinks(section, html, label);
      return;
    }
    if (section.fullPage) {
      // One image per page, full width (Site Maps — floorplans need room).
      for (var i = 0; i < section.images.length; i++) {
        var img = section.images[i];
        html.push('<section class="append-image-page">');
        if (label) {
          html.push('<h2 class="append-image-title">' + esc(label) + '</h2>');
        }
        html.push('<img class="append-image" width="780" ' +
                  'src="' + esc(img.src) + '" ' +
                  'alt="' + esc(img.alt || label) + '" />');
        html.push('</section>');
      }
      renderAttachmentLinks(section, html, label);
      return;
    }
    // Compact grid (Additional Photos — multiple per page, not full size).
    html.push('<section class="append-image-grid-section">');
    if (label) {
      html.push('<h2 class="append-image-title">' + esc(label) + '</h2>');
    }
    html.push('<div class="append-image-grid">');
    for (var j = 0; j < section.images.length; j++) {
      var pimg = section.images[j];
      html.push('<img class="append-image-thumb" ' +
                'src="' + esc(pimg.src) + '" ' +
                'alt="' + esc(pimg.alt || label) + '" />');
    }
    html.push('</div>');
    html.push('</section>');
    renderAttachmentLinks(section, html, label);
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
      '/* Tight cluster: per-L1 Subtotal → Discount → Total */',
      '.l1-line--sub, .l1-line--disc { padding-top: 0; padding-bottom: 0; }',
      '.l1-line--sub + .l1-footer-line, .l1-line--disc + .l1-footer-line { padding-top: 0; }',
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
      '/* Extra padding below Equipment Total and Installation Total */',
      '.pt-line--equipment-total, .pt-line--installation-total { padding-bottom: 14px; }',
      '/* Tight cluster: Equipment Subtotal → Line Item Discounts → Equipment Total */',
      '.pt-line--equipment-subtotal, .pt-line--line-item-discounts { padding-top: 0; padding-bottom: 0; }',
      '.pt-line--equipment-subtotal + .pt-line, .pt-line--line-item-discounts + .pt-line { padding-top: 0; }',
      '/* Tight cluster: Proposal Discount → Grand Total */',
      '.pt-line--proposal-discount { padding-bottom: 0; }',
      '.pt-line--proposal-discount + .pt-line { padding-top: 0; }',
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
      '',
      '/* ── Appended image sections (site maps, additional photos) ── */',
      '/* Each image gets its own page. page-break-before:always on every',
      '   page, including the first, so they always start fresh after the',
      '   project content. The image is forced to fit the printable area',
      '   via max width/height + object-fit:contain. */',
      '.append-image-page {',
      '  page-break-before: always;',
      '  break-before: page;',
      '  page-break-inside: avoid;',
      '  break-inside: avoid;',
      '  text-align: center;',
      '  padding-top: 8px;',
      '}',
      '.append-image-title {',
      '  font-size: 18px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 12px 0; padding-bottom: 6px;',
      '  border-bottom: 3px solid #07467c;',
      '  text-align: left;',
      '}',
      '.append-image {',
      '  display: block;',
      '  width: 100%;',
      '  max-width: 100%;',
      '  max-height: 9.5in;',
      '  height: auto;',
      '  margin: 0 auto;',
      '  object-fit: contain;',
      '}',
      '.append-image-grid-section {',
      '  page-break-before: always;',
      '  break-before: page;',
      '  padding-top: 8px;',
      '}',
      '.append-image-grid {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 10px;',
      '}',
      '.append-image-thumb {',
      '  width: 250px;',
      '  height: 250px;',
      '  object-fit: contain;',
      '  border: 1px solid #ddd;',
      '  background: #fafafa;',
      '  break-inside: avoid;',
      '  page-break-inside: avoid;',
      '}',
      '.append-attachment-section {',
      '  padding-top: 8px;',
      '}',
      '.append-attachment-list {',
      '  list-style: none;',
      '  margin: 0;',
      '  padding: 0;',
      '}',
      '.append-attachment-list li {',
      '  margin: 4px 0;',
      '}',
      '.append-attachment-link {',
      '  color: #07467c;',
      '  font-weight: 600;',
      '  text-decoration: underline;',
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

  // Per-scene webhook resolution. Defaults to the proposal publish
  // scenario (WEBHOOK_URL) unless the cfg has its own override.
  function resolveWebhookUrl(cfg) {
    return (cfg && cfg.webhookUrl) || WEBHOOK_URL;
  }

  // Now returns the jqXHR so callers can hook .done/.fail and await
  // Make's "Webhook Response" body. Always-on console.log so users
  // can see exactly what came back without flipping SCW.DEBUG. Times
  // out at 180s (matches the proposal-publish path) — Make holds the
  // HTTP connection open until the scenario's final Webhook Response
  // module fires, which can take 90+s for big PDFs.
  // The bid-submit webhook body, shaped. The unified payload builder is
  // shared with the proposal publish flow, which used to make the bid
  // payload a confusing superset: duplicate ids (recordId + bidId), and a
  // dozen proposal-only keys that are always empty on scene_1149. Contract
  // (agreed 2026-07-03; Make's scenario maps THESE names):
  //   bidRecordID          — the bid record (single id key)
  //   bidLineItems[]       — named {mdfIdf,bucket,description,qty,rate,cost}
  //   html                 — the rendered bid document (renders the PDF;
  //                          htmlPdf dropped — identical on this scene)
  //   json / jsonString    — full record snapshot (record ids + every
  //                          field), for Make's downstream Knack writes
  //   grandTotal           — the bid total
  //   bidLabel             — field_2638 (survey request + bid + friendly name)
  //   bidExpirationDate    — field_2635
  //   surveyRequestId, clientSite, projectAddress, bidVersionCounter,
  //   cuTaskId, triggeredBy, sceneId, type
  var BID_SUBMIT_DROP_KEYS = [
    'recordId', 'hash', 'sowId', 'htmlPdf',
    'equipmentTotal', 'installationTotal', 'expirationDate',
    'invoiceItems', 'invoiceItemsString',
    'proposalAccessToken', 'proposalAccessUrl',
    'plaintext', 'plaintextJsonEscaped',
    'scopeOfWorkDocumentElements', 'scopeOfWorkDocumentElementsString',
    'tokens', 'publishAsTbd',
    'subBidBidHtml', 'subBidDiffHtml', 'subBidReviewHtml',
    'subBidBasis', 'subBidBasisId', 'subBidBasisSubId',
    'subBidBasisSubName', 'subBidHasDiff', 'subBidNote'
  ];
  function shapeBidSubmitPayload(data) {
    if (!data.bidRecordID && data.recordId) data.bidRecordID = data.recordId;
    for (var i = 0; i < BID_SUBMIT_DROP_KEYS.length; i++) delete data[BID_SUBMIT_DROP_KEYS[i]];
    return data;
  }

  function sendToWebhook(data, cfg) {
    if (cfg.payloadType === 'subcontractor bid') data = shapeBidSubmitPayload(data);
    var url = resolveWebhookUrl(cfg);
    console.log('[SCW PDF Webhook] POST', { url: url, payloadType: cfg.payloadType });
    return $.ajax({
      url:         url,
      type:        'POST',
      contentType: 'application/json',
      data:        JSON.stringify(data),
      crossDomain: true,
      timeout:     180000
    });
  }

  function runExport(cfg, extra) {
    // Same unified payload shape as the click trigger uses — Make sees
    // one schema regardless of whether the publish came from a button
    // or a form submit. `extra` (form-field overrides) is merged in
    // after the base build so callers can stamp additional keys.
    var unified = buildPublishPayload(cfg.sceneId);
    if (!unified) {
      SCW.debug('[SCW PDF Export]', cfg.sceneId, '→ no views scraped');
      return;
    }
    if (extra) {
      for (var k in extra) { if (extra.hasOwnProperty(k)) unified[k] = extra[k]; }
    }
    sendToWebhook(unified, cfg);

    if (cfg.trigger.openPreview) {
      openPdfPreview(unified.html);
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

  // Returns true when the configured `hideIfFieldFilled` field is
  // blank across every Knack view loaded on the scene (or no gate is
  // configured). Checks Knack's loaded models first, then falls back
  // to a DOM scan of any `.kn-detail.field_XXXX` cell so the gate
  // works even before view-render plumbing has set view.model.
  function buttonGateOpen(cfg) {
    var field = cfg.trigger && cfg.trigger.hideIfFieldFilled;
    if (!field) return true;

    function isFilled(val) {
      if (val == null) return false;
      if (typeof val === 'string') return val.trim() !== '';
      if (Array.isArray(val))      return val.length > 0;
      if (typeof val === 'object') return Object.keys(val).length > 0;
      return !!val;   // truthy primitive
    }

    if (window.Knack && Knack.views) {
      for (var viewId in Knack.views) {
        var v = Knack.views[viewId];
        var attrs = v && v.model && (
          v.model.attributes ||
          (v.model.data && v.model.data.attributes)
        );
        if (!attrs) continue;
        var raw = attrs[field + '_raw'];
        var val = (raw != null) ? raw : attrs[field];
        if (isFilled(val)) return false;
      }
    }

    var sceneEl = document.getElementById('kn-' + cfg.sceneId);
    if (sceneEl) {
      var cells = sceneEl.querySelectorAll('.kn-detail.' + field + ' .kn-detail-body');
      for (var i = 0; i < cells.length; i++) {
        var text = (cells[i].textContent || '').replace(/ /g, ' ').trim();
        if (text !== '') return false;
      }
    }
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // PAGE-READY GATE
  // ══════════════════════════════════════════════════════════════
  // Publish flows run from buttons that the user can mash before
  // Knack has finished rendering every source view on the page. A
  // half-loaded scrape yields a half-baked payload. We gate each
  // publish action behind a per-scene "ready" signal:
  //
  //   • On knack-scene-render.<sceneId>, mark NOT ready, start a
  //     QUIET_MS countdown.
  //   • On every knack-view-render of a view that lives under
  //     #kn-<sceneId>, bump lastActivity (restarts the countdown).
  //   • Ready fires when (now - lastActivity) >= QUIET_MS, OR when
  //     (now - sceneStart) >= MAX_WAIT_MS (hard fallback so a flaky
  //     load never permanently jams the button).
  //
  // Exposed via SCW.pdfExport.isPageReady / .whenPageReady so the
  // ops-stepper publish actions (different file, different click
  // path) can gate on the same signal.
  var _ready = {};        // sceneId → { ready, startedAt, lastActivity, listeners }
  var _readyTimers = {};  // sceneId → pending timeout id

  var READY_QUIET_MS  = 800;
  var READY_MAX_WAIT_MS = 10000;

  function _readyState(sceneId) {
    if (!_ready[sceneId]) {
      _ready[sceneId] = {
        ready: false,
        startedAt: 0,
        lastActivity: 0,
        listeners: []
      };
    }
    return _ready[sceneId];
  }

  function _fireReady(sceneId) {
    var st = _readyState(sceneId);
    if (st.ready) return;
    st.ready = true;
    var cbs = st.listeners.slice();
    st.listeners.length = 0;
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](); } catch (e) { console.warn('[SCW PDF Export] ready cb threw', e); }
    }
  }

  function _scheduleReady(sceneId) {
    if (_readyTimers[sceneId]) {
      clearTimeout(_readyTimers[sceneId]);
      _readyTimers[sceneId] = null;
    }
    var st = _readyState(sceneId);
    if (st.ready) return;
    var now = Date.now();
    var sinceActivity = now - st.lastActivity;
    var sinceStart    = now - (st.startedAt || now);
    var until = Math.min(READY_QUIET_MS - sinceActivity, READY_MAX_WAIT_MS - sinceStart);
    if (until <= 0) { _fireReady(sceneId); return; }
    _readyTimers[sceneId] = setTimeout(function () {
      _readyTimers[sceneId] = null;
      var s = _readyState(sceneId);
      var n = Date.now();
      if (n - s.lastActivity >= READY_QUIET_MS || n - s.startedAt >= READY_MAX_WAIT_MS) {
        _fireReady(sceneId);
      } else {
        _scheduleReady(sceneId);
      }
    }, until + 5);
  }

  function isPageReady(sceneId) { return _readyState(sceneId).ready; }
  function whenPageReady(sceneId, cb) {
    var st = _readyState(sceneId);
    if (st.ready) { cb(); return; }
    st.listeners.push(cb);
  }

  // Bind ready-tracking events once per configured scene.
  function setupReadyTracker(sceneId) {
    $(document).on('knack-scene-render.' + sceneId + '.scwPdfReady', function () {
      var st = _readyState(sceneId);
      st.ready = false;
      st.startedAt = Date.now();
      st.lastActivity = Date.now();
      _scheduleReady(sceneId);
    });
    // Listen on the global view-render event — Knack fires
    // 'knack-view-render.<viewId>' AND a generic event we can hook
    // by namespacing. The lighter path is to subscribe per-view, but
    // we don't know the scene's view set up front — instead, hook
    // the catch-all and filter by DOM ancestry.
    $(document).on('knack-view-render.scwPdfReady_' + sceneId, function (event, view) {
      var sceneEl = document.getElementById('kn-' + sceneId);
      if (!sceneEl) return;
      var vid = view && view.key;
      var viewEl = vid ? document.getElementById(vid) : null;
      if (!viewEl || !sceneEl.contains(viewEl)) return;
      var st = _readyState(sceneId);
      st.lastActivity = Date.now();
      if (!st.startedAt) st.startedAt = Date.now();
      _scheduleReady(sceneId);
    });
  }

  function setupButtonTrigger(cfg) {
    var btnId = cfg.trigger.buttonId;

    // Pre-warm the append-image downscale cache so the published PDF
    // embeds small JPEGs instead of multi-MB file-field originals. These
    // grids populate asynchronously, so warm on scene render AND whenever
    // an append-image view (re)renders.
    if (cfg.appendImageViews && cfg.appendImageViews.length) {
      $(document).on('knack-scene-render.' + cfg.sceneId + '.scwImgPrewarm', function () {
        setTimeout(function () { prewarmAppendImages(cfg); }, 300);
      });
      cfg.appendImageViews.forEach(function (entry) {
        $(document).on('knack-view-render.' + entry.viewId + '.scwImgPrewarm', function () {
          setTimeout(function () { prewarmAppendImages(cfg); }, 50);
        });
      });
    }

    $(document).on('knack-scene-render.' + cfg.sceneId, function () {
      setTimeout(function () {
        hideEmptyGridViews(cfg.hideEmptyGrids);

        var existing = document.getElementById(btnId);

        // Gate check first — if the configured field is now filled,
        // tear down any previously-mounted button and bail. Lets the
        // button disappear after a successful publish without a
        // page reload (next view-render after the field updates).
        if (!buttonGateOpen(cfg)) {
          if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
          }
          return;
        }

        if (existing) return;

        var sceneEl = document.getElementById('kn-' + cfg.sceneId);
        if (!sceneEl) return;

        // Resolve the mount target. mountSelector (per-scene config)
        // takes the button INLINE inside the matching element with
        // normal block flow; the fixed-bottom-right fallback applies
        // when no selector is configured OR the selector misses.
        var mountSelector = cfg.trigger.mountSelector;
        var $mount = mountSelector ? $(sceneEl).find(mountSelector).first() : $();
        var isInline = $mount.length > 0;

        var labelReady   = cfg.trigger.buttonText || 'Generate PDF';
        var labelLoading = 'Loading page…';
        var ready        = isPageReady(cfg.sceneId);
        var $btn = $('<button></button>')
          .attr('id', btnId)
          .text(ready ? labelReady : labelLoading)
          .prop('disabled', !ready)
          .css(isInline ? {
            // Inline placement — full-width banner-style button inside
            // the mount element. No fixed positioning, no z-index
            // gymnastics. Box-sizing keeps padding from overflowing
            // when the mount has its own padding.
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            marginTop: '12px',
            padding: '12px 24px',
            fontSize: '15px',
            fontWeight: 700,
            color: '#fff',
            background: '#07467c',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,.25)',
          } : {
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

        // If the page isn't ready yet, dim the button and swap the
        // label to a "loading" message. whenPageReady fires (at most
        // READY_MAX_WAIT_MS later) and restores the live state.
        function applyReadyState(isReady) {
          if (isReady) {
            $btn.prop('disabled', false)
                .text(labelReady)
                .css({ opacity: 1, cursor: 'pointer' });
          } else {
            $btn.prop('disabled', true)
                .text(labelLoading)
                .css({ opacity: 0.55, cursor: 'wait' });
          }
        }
        applyReadyState(ready);
        if (!ready) whenPageReady(cfg.sceneId, function () { applyReadyState(true); });

        $btn.on('mouseenter', function () {
          if (!$(this).prop('disabled')) $(this).css('opacity', 0.9);
        });
        $btn.on('mouseleave', function () {
          if (!$(this).prop('disabled')) $(this).css('opacity', 1);
        });

        $btn.on('click', function () {
          // Defensive: even though we disable the button, a fast
          // double-click before the disabled flip can land. Bail if
          // the page isn't ready.
          if (!isPageReady(cfg.sceneId)) {
            showPublishToast('Page is still loading — please wait.', true, false);
            return;
          }
          // Build the full, unified publish payload. Same shape as the
          // public buildPublishPayload helper — Make sees identical
          // inputs whether the publish came from this click trigger,
          // the form-submit trigger (runExport), or an external caller
          // invoking SCW.pdfExport.buildPublishPayload directly.
          var unified = buildPublishPayload(cfg.sceneId);
          if (!unified) {
            alert('No data found on this page.');
            return;
          }
          if (cfg.trigger.openPreview) {
            openPdfPreview(unified.html);
          }

          // saveHtml gates the UX flow (button-disable / toast /
          // redirect-on-success), not whether the webhook fires. The
          // single Make scenario behind WEBHOOK_URL decides what to do
          // with the payload based on cfg.payloadType / its own rules.
          if (cfg.saveHtml) {
            $btn.prop('disabled', true).css({ opacity: 0.5, cursor: 'not-allowed' });
            SCW.debug('[SCW PDF Export] Sending publish payload:', unified.recordId,
              '| sowId:', unified.sowId, '| records:', (unified.json || []).length);
            showPublishToast('Submitting…', false, true);
            $.ajax({
              url: resolveWebhookUrl(cfg),
              type: 'POST',
              contentType: 'application/json',
              data: JSON.stringify(unified),
              crossDomain: true,
              // Bumped from 90s. Make holds the HTTP connection open
              // until the scenario's final "Webhook Response" module
              // fires; if PDF gen + Knack upload takes 90+s the client
              // would time out before Make finishes. 180s matches the
              // poll timeout fallback ceiling.
              timeout: 180000,
              success: function (resp, status, xhr) {
                // Unconditional log so we can see exactly what came
                // back without flipping SCW.DEBUG. Includes the parsed
                // response, the raw text (in case jQuery parsed it
                // unexpectedly), and the HTTP status.
                console.log('[SCW PDF Webhook] success', {
                  status: xhr && xhr.status,
                  contentType: xhr && xhr.getResponseHeader && xhr.getResponseHeader('Content-Type'),
                  responseType: typeof resp,
                  response: resp,
                  rawResponseText: xhr && xhr.responseText
                });

                // Informative response = non-empty body OR an object
                // (even an empty {}). If Make returned {"status":"ready"}
                // we'll land here as either a parsed object or the
                // raw string — handle both.
                var isInformativeResponse = (resp != null && resp !== '' &&
                  (typeof resp === 'object' || String(resp).length > 0));

                // Defensively clear any leftover poll flags from a
                // prior attempt — they'd auto-start polling on the
                // parent page even if THIS submission's response is
                // informative.
                try {
                  sessionStorage.removeItem('scw-pdf-poll-view');
                  sessionStorage.removeItem('scw-pdf-poll-field');
                  sessionStorage.removeItem('scw-pdf-poll-type');
                } catch (e) {}

                if (isInformativeResponse) {
                  console.log('[SCW PDF Webhook] informative response → skipping polling');
                  showPublishToast('PDF ready — opening…', false, false);
                } else {
                  console.log('[SCW PDF Webhook] empty response → falling back to polling');
                  if (cfg.pollViewOnReturn) {
                    try {
                      sessionStorage.setItem('scw-pdf-poll-view', cfg.pollViewOnReturn);
                      if (cfg.pollField) sessionStorage.setItem('scw-pdf-poll-field', cfg.pollField);
                      if (cfg.payloadType) sessionStorage.setItem('scw-pdf-poll-type', cfg.payloadType);
                    } catch (e) {}
                  }
                }
                redirectToParent();
              },
              error: function (xhr, status, errThrown) {
                // Make's "Webhook Response" module returns a 2xx status
                // and a JSON body. If jQuery's auto-parse fails (wrong
                // Content-Type from Make), jQuery treats it as an
                // error EVEN THOUGH the request succeeded. Recover by
                // checking if we got a usable response anyway and
                // treating it the same as the success branch.
                console.log('[SCW PDF Webhook] error', {
                  status: xhr && xhr.status,
                  contentType: xhr && xhr.getResponseHeader && xhr.getResponseHeader('Content-Type'),
                  jqStatus: status,
                  errThrown: errThrown && errThrown.toString && errThrown.toString(),
                  rawResponseText: xhr && xhr.responseText
                });

                var raw = xhr && xhr.responseText;
                var httpOk = xhr && xhr.status >= 200 && xhr.status < 300;
                if (httpOk && raw) {
                  console.log('[SCW PDF Webhook] HTTP OK with body — treating as success');
                  try {
                    sessionStorage.removeItem('scw-pdf-poll-view');
                    sessionStorage.removeItem('scw-pdf-poll-field');
                    sessionStorage.removeItem('scw-pdf-poll-type');
                  } catch (e) {}
                  showPublishToast('PDF ready — opening…', false, false);
                  redirectToParent();
                  return;
                }
                console.error('[SCW PDF Export] Webhook failed:', status);
                showPublishToast('Webhook failed — please try again.', true, false);
                $btn.prop('disabled', false).css({ opacity: 1, cursor: 'pointer' });
              }
            });
          } else {
            // Preview-only path (saveHtml=false): fire-and-forget POST
            // with the same payload shape so Make scenarios can branch
            // on cfg.payloadType / lack of `recordId` if they want.
            sendToWebhook(unified, cfg);
          }
        });

        if (isInline) $mount.append($btn);
        else          $(sceneEl).append($btn);
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
    console.log('[SCW PDF Webhook] setupFormSubmitTrigger (init)', {
      sceneId: cfg.sceneId,
      formViewId: formViewId,
      payloadType: cfg.payloadType
    });

    // Gate the form's submit button until the scene is ready. Without
    // this, mashing Submit before view-render finishes can fire a
    // half-formed payload (recordId / extraFields may not be wired up
    // yet, and downstream Make scenarios choke on the missing inputs).
    function applyFormReadiness() {
      var $submit = $('#' + formViewId + ' form button[type="submit"], #' +
                      formViewId + ' form input[type="submit"]');
      if (!$submit.length) return;
      var ready = isPageReady(cfg.sceneId);
      // Stash original label once so we can restore it on ready.
      $submit.each(function () {
        var $b = $(this);
        if ($b.data('scw-orig-label') === undefined) {
          $b.data('scw-orig-label', $b.is('button') ? $b.text() : $b.val());
        }
        if (ready) {
          var orig = $b.data('scw-orig-label');
          $b.prop('disabled', false).css({ opacity: '', cursor: '' });
          if ($b.is('button')) $b.text(orig); else $b.val(orig);
        } else {
          $b.prop('disabled', true).css({ opacity: 0.55, cursor: 'wait' });
          var loadingLabel = 'Loading page…';
          if ($b.is('button')) $b.text(loadingLabel); else $b.val(loadingLabel);
        }
      });
    }

    $(document).on('knack-view-render.' + formViewId, function () {
      console.log('[SCW PDF Webhook] view-render fired for ' + formViewId);
      applyFormReadiness();
      whenPageReady(cfg.sceneId, applyFormReadiness);

      var formEl = document.querySelector('#' + formViewId + ' form');
      if (!formEl) {
        console.warn('[SCW PDF Webhook] no <form> inside #' + formViewId);
        return;
      }
      if (formEl._scwPdfCaptureBound) {
        console.log('[SCW PDF Webhook] capture listener already bound, skipping');
      }

      // CAPTURE-PHASE listener. Knack binds its own submit handler in
      // bubble phase during view init. If we used jQuery .on('submit')
      // here (bubble-phase), Knack would fire FIRST when the user
      // clicks Submit — kicking off its own record-save and starting
      // the redirect — and by the time our handler ran, calling
      // preventDefault would be too late: navigation already initiated
      // and our $.ajax to Make gets killed mid-flight (which is
      // exactly why no `[SCW PDF Webhook] ...` logs appeared).
      //
      // Capture phase guarantees we run BEFORE Knack's bubble handler.
      // stopImmediatePropagation prevents Knack from ever seeing the
      // submit. We hold the page, fire the webhook, await Make's
      // "Webhook Response" body, then programmatically click Submit
      // again — the second pass sees _scwPdfAuthorized and falls
      // through so Knack does its native save + redirect.
      if (formEl._scwPdfCaptureBound) return; // idempotent across re-renders
      formEl._scwPdfCaptureBound = true;
      console.log('[SCW PDF Webhook] capture-phase submit listener bound to', formEl);

      // Knack handles the submit button by attaching a CLICK handler
      // that calls preventDefault, so the form's submit event NEVER
      // fires. That's why catching just 'submit' produced no logs.
      // Bind on click (capture phase) on the submit button too —
      // covers Knack's path. Keep the submit-event listener as
      // belt-and-suspenders for Enter-key submission.
      function captureHandler(e, source) {
        if (formEl._scwPdfAuthorized) {
          console.log('[SCW PDF Webhook] (' + source + ') authorized pass — letting Knack take over');
          return;
        }

        console.log('[SCW PDF Webhook] (' + source + ') intercepted', {
          sceneId: cfg.sceneId,
          formViewId: formViewId
        });
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        if (!isPageReady(cfg.sceneId)) {
          alert('Page is still loading -- please wait, then click Submit again.');
          return;
        }

        var extra = {};
        if (cfg.trigger.recordIdInput) {
          var idInput = formEl.querySelector('input[name="' + cfg.trigger.recordIdInput + '"]');
          if (idInput) extra.recordId = idInput.value;
        }
        if (!extra.recordId) extra.recordId = getPageRecordId();

        var triggeredBy = getTriggeredBy();
        if (triggeredBy) extra.triggeredBy = triggeredBy;

        if (cfg.extraFields) {
          var _fNum;
          for (var ef = 0; ef < cfg.extraFields.length; ef++) {
            var spec = cfg.extraFields[ef];
            if (spec.source === 'url') {
              var urlVal = getPageRecordId();
              if (urlVal) extra[spec.name] = urlVal;
              continue;
            }
            if (spec.source === 'recordId') {
              if (extra.recordId) extra[spec.name] = extra.recordId;
              continue;
            }
            _fNum = spec.field.replace('field_', '');
            var el = null;
            if (spec.sourceView) {
              el = document.querySelector('#' + spec.sourceView + ' .field_' + _fNum);
              if (!el) el = document.querySelector('#' + spec.sourceView + ' td.' + spec.field);
              if (!el) el = document.querySelector('#' + spec.sourceView + ' [data-field-key="' + spec.field + '"]');
            }
            if (!el) el = document.querySelector('#kn-' + cfg.sceneId + ' .field_' + _fNum);
            if (!el) el = document.querySelector('#kn-' + cfg.sceneId + ' td.' + spec.field);
            if (!el) el = document.querySelector('#kn-' + cfg.sceneId + ' [data-field-key="' + spec.field + '"]');
            if (!el) el = document.querySelector('.kn-detail.' + spec.field + ', .kn-label-none.' + spec.field);
            var valEl = el ? (el.querySelector('.kn-detail-body .kn-value') || el.querySelector('.kn-detail-body') || el.querySelector('.kn-value') || el) : null;
            var val = valEl ? (valEl.textContent || '').replace(/[ \s]+/g, ' ').trim() : '';
            if (val) extra[spec.name] = val;
          }
        }

        function authorizeAndResubmit(setPollFallback) {
          try {
            sessionStorage.removeItem('scw-pdf-poll-view');
            sessionStorage.removeItem('scw-pdf-poll-field');
            sessionStorage.removeItem('scw-pdf-poll-type');
          } catch (e2) {}
          if (setPollFallback && cfg.pollViewOnReturn) {
            try {
              sessionStorage.setItem('scw-pdf-poll-view', cfg.pollViewOnReturn);
              if (cfg.pollField) sessionStorage.setItem('scw-pdf-poll-field', cfg.pollField);
              if (cfg.payloadType) sessionStorage.setItem('scw-pdf-poll-type', cfg.payloadType);
            } catch (e3) {}
          }
          formEl._scwPdfAuthorized = true;
          var btn = formEl.querySelector('button[type="submit"], input[type="submit"]');
          if (btn) btn.click();
          else formEl.submit();
        }

        var unified = buildPublishPayload(cfg.sceneId);
        if (!unified) {
          console.warn('[SCW PDF Webhook] payload build failed -- releasing submit');
          authorizeAndResubmit(true);
          return;
        }
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k)) unified[k] = extra[k];
        }

        showPublishToast('Generating ' +
          (cfg.payloadType === 'subcontractor bid' ? 'bid' : 'PDF') +
          '...', false, true);

        sendToWebhook(unified, cfg)
          .done(function (resp, status, xhr) {
            console.log('[SCW PDF Webhook] success', {
              status: xhr && xhr.status,
              contentType: xhr && xhr.getResponseHeader && xhr.getResponseHeader('Content-Type'),
              responseType: typeof resp,
              response: resp,
              rawResponseText: xhr && xhr.responseText
            });
            var informative = (resp != null && resp !== '' &&
              (typeof resp === 'object' || String(resp).length > 0));
            if (informative) {
              console.log('[SCW PDF Webhook] informative -> releasing submit, no polling');
              // Make confirmed PDF creation — the file is already on the
              // Knack record by the time Make's webhook response fires.
              // Drop the publish toast entirely (no "PDF ready" message
              // is useful here — the user is about to land on the parent
              // page where the PDF link is already rendered).
              dismissPublishToast();
              authorizeAndResubmit(false);
            } else {
              console.log('[SCW PDF Webhook] empty response -> fallback to polling');
              authorizeAndResubmit(true);
            }
          })
          .fail(function (xhr, status, errThrown) {
            console.log('[SCW PDF Webhook] fail', {
              status: xhr && xhr.status,
              contentType: xhr && xhr.getResponseHeader && xhr.getResponseHeader('Content-Type'),
              jqStatus: status,
              errThrown: errThrown && errThrown.toString && errThrown.toString(),
              rawResponseText: xhr && xhr.responseText
            });
            var raw = xhr && xhr.responseText;
            var httpOk = xhr && xhr.status >= 200 && xhr.status < 300;
            if (httpOk && raw) {
              console.log('[SCW PDF Webhook] HTTP OK with body -- treating as success');
              dismissPublishToast();
              authorizeAndResubmit(false);
              return;
            }
            console.warn('[SCW PDF Webhook] webhook failed -- releasing with poll fallback');
            showPublishToast('Submission sent -- continuing...', false, false);
            authorizeAndResubmit(true);
          });
      }

      // Click on the submit button — the path Knack intercepts.
      var submitBtn = formEl.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        submitBtn.addEventListener('click', function (e) {
          captureHandler(e, 'capture click');
        }, true);
        console.log('[SCW PDF Webhook] capture-phase click listener bound to submit button');
      } else {
        console.warn('[SCW PDF Webhook] no submit button found in form');
      }

      // Form submit event — covers Enter-key submission and any other
      // path that fires the submit event natively. Knack's button-
      // click intercept usually preventDefaults the submit, but if a
      // user hits Enter inside a text input, the submit event WILL
      // fire and Knack might not catch it.
      formEl.addEventListener('submit', function (e) {
        captureHandler(e, 'capture submit');
      }, true /* capture phase */);
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
  // Make PDF generation can take 90+s for big proposals (page count
  // scales with line items). 60s was tight; 180s lets the slowest
  // happy path finish before we give up and clear the overlay.
  var POLL_TIMEOUT_MS  = 180000;
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

  // Pull the polled field's value out of a record returned by a
  // direct view-records REST call. Handles every Knack _raw shape:
  //   - file field:        { url, filename, ... }      \u2192 prefer url
  //   - connection field:  [ {id, identifier}, ... ]   \u2192 join ids
  //   - plain field:       primitive value             \u2192 string-coerce
  // Returns a "change signal" string we compare poll-over-poll.
  function extractFieldSignal(record, fieldId) {
    if (!record || !fieldId) return '';
    var raw = record[fieldId + '_raw'];
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
      if (raw.url)      return 'url:' + raw.url;
      if (raw.filename) return 'fn:'  + raw.filename;
      return 'obj:' + JSON.stringify(raw);
    }
    if (Array.isArray(raw)) {
      var ids = [];
      for (var i = 0; i < raw.length; i++) {
        if (raw[i] && raw[i].id) ids.push(raw[i].id);
      }
      return 'conn:' + (ids.length ? ids.join(',') : 'empty');
    }
    var rendered = record[fieldId];
    if (rendered == null) return '';
    return 'txt:' + String(rendered).replace(/<[^>]*>/g, '').trim();
  }

  // Direct view-records GET. Bypasses view.model.fetch() \u2014 Knack
  // sometimes caches/throttles those calls or doesn't re-render the
  // view, leaving stale data. Going straight to Knack's REST API
  // gives us a guaranteed-fresh record snapshot each tick.
  function fetchPolledRecord(viewId, cb) {
    if (!window.Knack || !Knack.router || !Knack.router.current_scene_key) {
      cb(null, 'no-scene');
      return;
    }
    var url = Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
              '/views/' + viewId + '/records';
    SCW.knackAjax({
      url:   url,
      type:  'GET',
      cache: false,
      success: function (resp) {
        var record = resp && resp.records && resp.records[0];
        cb(record || null, record ? null : 'no-records');
      },
      error: function (xhr) {
        cb(null, 'http-' + (xhr && xhr.status));
      }
    });
  }

  // DOM read used only for overlay placement (the polled td is the
  // overlay target). Completion detection lives in the REST path.
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

  // Re-apply overlay when the view re-renders (Knack drops our class
  // when it rebuilds the td). NOT used to detect completion — that is
  // entirely REST-driven now.
  function onPollViewRender() {
    if (!_pollActive) return;
    applyFieldOverlay(_pollViewId, _pollFieldId, _pollMsg);
  }

  function startPollRefresh(viewId, fieldId, pollType) {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollActive = true;
    _pollViewId = viewId;
    _pollFieldId = fieldId;
    _pollInitial = "";

    var label = pollType === "proposal" ? "quote" : (pollType || "bid");
    _pollMsg = "Generating " + label + " PDF…";

    console.log("[SCW PDF Poll] start", { viewId: viewId, fieldId: fieldId, type: pollType });
    showPollToast(_pollMsg);
    applyFieldOverlay(viewId, fieldId, _pollMsg);

    $(document).off("knack-view-render." + viewId + POLL_NS)
               .on("knack-view-render." + viewId + POLL_NS, onPollViewRender);

    var initialCaptured = false;
    var elapsed = 0;

    function tick() {
      if (!_pollActive) return;
      fetchPolledRecord(_pollViewId, function (record, err) {
        if (!_pollActive) return;
        if (err || !record) {
          console.log("[SCW PDF Poll] tick fetch error", { err: err, elapsed: elapsed });
          return;
        }
        var signal = extractFieldSignal(record, _pollFieldId);
        if (!initialCaptured) {
          _pollInitial = signal;
          initialCaptured = true;
          console.log("[SCW PDF Poll] initial captured", { signal: signal });
          return;
        }
        var changed = (signal !== _pollInitial);
        console.log("[SCW PDF Poll] tick", { elapsed: elapsed, initial: _pollInitial, current: signal, changed: changed });
        if (changed) {
          console.log("[SCW PDF Poll] CHANGED — stopping");
          try { var v = Knack.views && Knack.views[_pollViewId]; if (v && v.model && typeof v.model.fetch === "function") v.model.fetch(); } catch (e) {}
          stopPolling();
        }
      });
    }

    tick();
    _pollTimer = setInterval(function () {
      elapsed += POLL_INTERVAL_MS;
      if (elapsed >= POLL_TIMEOUT_MS) {
        console.log("[SCW PDF Poll] TIMEOUT", { elapsed: elapsed, initial: _pollInitial, initialCaptured: initialCaptured });
        stopPolling();
        return;
      }
      tick();
    }, POLL_INTERVAL_MS);
  }

  // Check for poll flag whenever any scene renders
  $(document).on('knack-scene-render.any.scwPdfPoll', function () {
    // Belt-and-suspenders: clear any publish toast that survived the
    // form-submit → parent-page hash navigation. The toast lives on
    // document.body so Knack's SPA scene swap doesn't remove it; if
    // any code path forgot to dismiss before submitting, kill it on
    // arrival so the user doesn't see a stale "PDF ready" sitting
    // on top of their parent page.
    dismissPublishToast();
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

  // Build the exact unified payload the Publish Quote button sends to
  // WEBHOOK_URL. Every code path that publishes a quote should call
  // this so Make receives identical inputs regardless of origin.
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

  // Convert the rendered proposal HTML to a structured plain-text version
  // suitable for tools that don't accept HTML (e.g. esignatures.com
  // installation agreements). DOM-based walk so we don't have to write a
  // hand-rolled HTML parser; preserves table structure as tab-separated
  // rows, headings as UPPERCASE blocks, and block elements as paragraph
  // breaks. Stays in the bundle (not Make) because the inputs (HTML +
  // structure) are already here, and round-tripping HTML through Make's
  // stripHTML mangles tables.
  function htmlToPlaintext(html) {
    if (!html || typeof html !== 'string') return '';

    var doc;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch (e) {
      return '';
    }
    if (!doc || !doc.body) return '';

    // Strip non-content nodes that would otherwise produce noise.
    var dropEls = doc.querySelectorAll('script, style, head, link, meta, noscript');
    for (var di = 0; di < dropEls.length; di++) dropEls[di].parentNode && dropEls[di].parentNode.removeChild(dropEls[di]);

    var BLOCK_TAGS = {
      p: 1, div: 1, section: 1, article: 1, header: 1, footer: 1, nav: 1,
      h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1,
      ul: 1, ol: 1, li: 1, dl: 1, dt: 1, dd: 1,
      table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1,
      blockquote: 1, pre: 1, hr: 1, figure: 1, figcaption: 1
    };

    var out = [];

    function emit(s) { if (s) out.push(s); }

    function walk(node) {
      if (node.nodeType === 3) {
        // Text node — collapse whitespace, leave content intact.
        var t = node.nodeValue.replace(/\s+/g, ' ');
        if (t) emit(t);
        return;
      }
      if (node.nodeType !== 1) return;

      var tag = node.tagName.toLowerCase();

      if (tag === 'br') { emit('\n'); return; }
      if (tag === 'hr') { emit('\n----------\n'); return; }
      if (tag === 'img') { return; } // images skipped — esignatures-friendly

      // Headings: blank line before + UPPERCASE the text content + blank line after.
      if (/^h[1-6]$/.test(tag)) {
        emit('\n\n');
        var headStart = out.length;
        for (var hi = 0; hi < node.childNodes.length; hi++) walk(node.childNodes[hi]);
        for (var hj = headStart; hj < out.length; hj++) {
          if (typeof out[hj] === 'string') out[hj] = out[hj].toUpperCase();
        }
        emit('\n\n');
        return;
      }

      // Table cells: tab-separated. We emit a leading tab BEFORE every
      // cell except the first in its row; tracked by walking parent's
      // children to find position.
      if (tag === 'td' || tag === 'th') {
        var parent = node.parentNode;
        var firstCell = true;
        if (parent) {
          for (var pi = 0; pi < parent.children.length; pi++) {
            var sib = parent.children[pi];
            var sibTag = sib.tagName && sib.tagName.toLowerCase();
            if (sibTag === 'td' || sibTag === 'th') {
              if (sib === node) break;
              firstCell = false;
              break;
            }
          }
        }
        if (!firstCell) emit('\t');
        for (var ci = 0; ci < node.childNodes.length; ci++) walk(node.childNodes[ci]);
        return;
      }

      // List items: bullet prefix per line.
      if (tag === 'li') {
        emit('\n  - ');
        for (var li = 0; li < node.childNodes.length; li++) walk(node.childNodes[li]);
        return;
      }

      var isBlock = BLOCK_TAGS[tag];
      if (isBlock) emit('\n');
      for (var ki = 0; ki < node.childNodes.length; ki++) walk(node.childNodes[ki]);
      if (isBlock) emit('\n');
    }

    walk(doc.body);

    var text = out.join('');

    // Cleanup pass:
    //   - Tabs at line start are noise (orphan cell separators).
    //   - 3+ consecutive newlines collapse to a paragraph break (2).
    //   - Trailing whitespace per line stripped.
    //   - Leading/trailing whitespace on the whole doc stripped.
    text = text.replace(/\n[\t ]+/g, '\n');
    text = text.replace(/[\t ]+\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/ /g, ' '); // non-breaking spaces → regular
    text = text.replace(/[ \t]{2,}/g, ' ');

    return text.trim();
  }

  // JSON-escape a string for safe interpolation between double quotes
  // in a hand-written JSON body template. JSON.stringify produces a full
  // JSON string literal (with surrounding quotes); we slice them off so
  // the caller writes `"value": "{{escaped}}"` and gets valid JSON.
  // Also handles the rare cases where the input is null/undefined.
  function jsonStringEscape(s) {
    if (s == null) return '';
    var encoded = JSON.stringify(String(s));
    return encoded.slice(1, -1);
  }

  // Recursively walk a Knack snapshot and drop every `field_xxx` key
  // that has a `field_xxx_raw` counterpart on the same object. Knack
  // returns connection / rich-text / file fields with a rendered-HTML
  // value at `field_xxx` (e.g. `<span class="abc">label</span>`) and
  // a clean structured value at `field_xxx_raw` (e.g.
  // `[{id, identifier}]`). The HTML version is purely for display —
  // for downstream consumers (Make, esignatures, anyone who needs to
  // round-trip the JSON through a string field) it's pure liability:
  // every quote inside the HTML is a JSON-escape footgun. Strip them.
  // Keep `id`, `headerId`, `sowRecordId`, and any field_xxx that has
  // no _raw twin.
  function stripNonRawFields(node) {
    if (Array.isArray(node)) {
      var arr = [];
      for (var i = 0; i < node.length; i++) arr.push(stripNonRawFields(node[i]));
      return arr;
    }
    if (node && typeof node === 'object') {
      var out = {};
      var keys = Object.keys(node);
      var hasRawTwin = {};
      for (var k = 0; k < keys.length; k++) {
        if (/_raw$/.test(keys[k])) hasRawTwin[keys[k].replace(/_raw$/, '')] = true;
      }
      // Match plain field keys (`field_1234`) AND Knack's dot-notation
      // equation/connection-projection keys (`field_1234.field_5678`,
      // `field_1234.field_5678.field_9012`, etc.). Both shapes have a
      // `_raw` twin and the non-raw shape is HTML, which breaks Make's
      // Parse JSON when its inner quotes are mishandled in transit.
      for (var ki = 0; ki < keys.length; ki++) {
        var key = keys[ki];
        if (/^field_\d+(\.field_\d+)*$/.test(key) && hasRawTwin[key]) continue;
        out[key] = stripNonRawFields(node[key]);
      }
      return out;
    }
    return node;
  }

  // Build invoice-ready line items from the JSON snapshot. Domain-aware
  // categorization (SKU vs labor vs license) lives here in the bundle;
  // Xero / TaxJar / external billing shape lives in Make. The output is
  // billing-system-agnostic — Make injects the tax codes and final API
  // shape at the integration layer.
  //
  // Rules:
  //   bucket "License"            -> invoiceItems.recurring (aggregated
  //                                  by sku+name+unitPrice)
  //   bucket "Assumptions"        -> skipped entirely (no equipment, no
  //                                  labor — assumptions don't bill)
  //   bucket "Other Services"     -> labor lump only (no SKU, no
  //                                  equipment — it's all services)
  //   anything else with SKU or
  //     name AND equipment value > 0 -> invoiceItems.equipment
  //                                  (aggregated by sku+name+unitPrice
  //                                  so two prices on the same SKU stay
  //                                  on separate invoice lines)
  //   any row's labor portion
  //     (except License/Assumptions) -> contributes to invoiceItems.labor
  //                                     lump
  //
  // Aggregation key includes unitPrice so 2 Beacons at $2,831 and 4
  // Beacons at $24.70 emit two distinct invoice lines instead of being
  // collapsed into one with mismatched math.
  //
  // Output is sorted by Proposal Bucket Sort Order (field_2218) when
  // available on the line-item record, else by bucket name then
  // description. To get the exact proposal-bucket order, project
  // field_2218 onto the snapshot view (view_3896) in Knack.
  //
  // Field map (per the line-item view's _raw values):
  //   field_2219_raw[0].identifier  bucket name
  //   field_2218_raw                bucket sort order (optional —
  //                                 falls back to bucket name)
  //   field_1963_raw                SKU
  //   field_1958_raw                product display name
  //   field_2268_raw                equipment unit price AND per-row
  //                                 amount, after per-line discounts
  //                                 (locked-down field — keep these
  //                                 in sync so qty × unitPrice = lineTotal
  //                                 on the Xero invoice line)
  //   field_2028_raw                labor value for this row (locked-down field)
  //
  // Proposal-level discount: a separate "Proposal Discount" line appears
  // in payload.projectTotals (rendered as `scw-l1-line--disc`). Per
  // request, the proposal discount is subtracted from the LABOR lump,
  // not from equipment lines (which already reflect their per-line
  // discounts via field_2269).
  function buildInvoiceItems(jsonSnapshot, sowId, projectTotals) {
    if (!jsonSnapshot || typeof jsonSnapshot !== 'object') return null;

    // Find any line-items array in the snapshot. Heuristic: an array
    // whose first member has `field_2219_raw` (the bucket connection).
    // Works for the slim snapshot shape (cfg.jsonIncludeViews) and the
    // full shape, regardless of which view_id the line items live in.
    // The snapshot view (view_3896) is set to 1000 rows/page in
    // change-record-limit.js — DON'T fall back to view_3341 here:
    // that view doesn't project field_2219/_1963/_1958/_2268, so its
    // models are missing the bucket/sku/name/unit-price needed below.
    var lineItems = [];
    var keys = Object.keys(jsonSnapshot);
    for (var ki = 0; ki < keys.length; ki++) {
      var v = jsonSnapshot[keys[ki]];
      if (Array.isArray(v) && v.length && v[0] && v[0].field_2219_raw !== undefined) {
        lineItems = lineItems.concat(v);
      }
    }
    if (!lineItems.length) return null;

    function num(x) {
      var n = parseFloat(x);
      return isNaN(n) ? 0 : n;
    }
    function round2(n) { return Math.round(n * 100) / 100; }

    var equipmentBySku = {};
    var recurringBySku = {};
    var laborTotal = 0;

    for (var i = 0; i < lineItems.length; i++) {
      var row = lineItems[i] || {};
      var bucketArr = row.field_2219_raw;
      var bucket = (bucketArr && bucketArr[0] && bucketArr[0].identifier) || '';
      var sku = (row.field_1963_raw || '').toString().trim();
      var name = (row.field_1958_raw || '').toString().trim();
      // Pull both unit price and per-row amount from field_2268_raw so
      // qty × unitPrice = lineTotal in the aggregated invoice item.
      // field_1960_raw is the LIST price (pre-discount) — using it as
      // unitPrice while summing post-discount amounts produced
      // mismatched invoice math.
      var unitAmount = num(row.field_2268_raw);
      var equipmentVal = unitAmount;
      var laborVal = num(row.field_2028_raw);
      // Bucket sort order from field_2218 if projected on the line-item
      // record; otherwise fall back to bucket name (so the output is at
      // least deterministic). Add field_2218 to view_3896 to get the
      // exact proposal-bucket sort order. NOTE: field_2218 here is a
      // plain numeric column (not a connection field), so we read the
      // formatted value (`field_2218`), not `_raw`.
      var bucketSortRaw = row.field_2218;
      var bucketSort;
      if (bucketSortRaw === undefined || bucketSortRaw === null || bucketSortRaw === '') {
        bucketSort = Number.POSITIVE_INFINITY;
      } else {
        var bs = parseFloat(bucketSortRaw);
        bucketSort = isNaN(bs) ? Number.POSITIVE_INFINITY : bs;
      }

      if (/^license\b/i.test(bucket)) {
        if ((sku || name) && equipmentVal > 0) {
          // Aggregation key: bucket + sku + name + unitPrice. Same SKU
          // at different prices (e.g. tiered pricing) yields separate
          // invoice lines so qty × unitPrice always equals lineTotal.
          var recurringKey = bucket + '␟' + sku + '␟' + name + '␟' + unitAmount;
          if (!recurringBySku[recurringKey]) {
            recurringBySku[recurringKey] = {
              sku: sku, description: name,
              qty: 0, unitPrice: unitAmount, lineTotal: 0,
              _sortBucket: bucketSort, _sortLabel: (bucket + '|' + name)
            };
          }
          recurringBySku[recurringKey].qty += 1;
          recurringBySku[recurringKey].lineTotal = round2(recurringBySku[recurringKey].lineTotal + equipmentVal);
        }
        continue;
      }

      if (/^assumption/i.test(bucket)) {
        continue;
      }

      if ((sku || name) && equipmentVal > 0) {
        var equipmentKey = bucket + '␟' + sku + '␟' + name + '␟' + unitAmount;
        if (!equipmentBySku[equipmentKey]) {
          equipmentBySku[equipmentKey] = {
            sku: sku, description: name,
            qty: 0, unitPrice: unitAmount, lineTotal: 0,
            _sortBucket: bucketSort, _sortLabel: (bucket + '|' + name)
          };
        }
        equipmentBySku[equipmentKey].qty += 1;
        equipmentBySku[equipmentKey].lineTotal = round2(equipmentBySku[equipmentKey].lineTotal + equipmentVal);
      }

      laborTotal = round2(laborTotal + laborVal);
    }

    // The per-row sum across the JSON snapshot (e.g. view_3896) is a
    // last-resort fallback only. Two reasons it under-reports:
    //   1. The snapshot view doesn't always project field_2028_raw for
    //      every row.
    //   2. In TBD-publish mode the projectTotals "Installation Total"
    //      line literally renders as "TBD" — strip-numeric leaves an
    //      empty string, parseFloat → NaN, no override happens.
    //
    // The authoritative source for labor on an invoice is field_2028
    // summed directly from the proposal grid view's loaded Knack model
    // (view_3341 for scene_1096). Those rows have ALL data loaded and
    // the underlying field_2028_raw values are real numbers regardless
    // of TBD-mode display masking.
    var modelLaborTotal = (function () {
      try {
        var candidateViews = ['view_3341', 'view_3450', 'view_3451'];
        if (typeof Knack === 'undefined' || !Knack.views) return null;
        for (var vi = 0; vi < candidateViews.length; vi++) {
          var v = Knack.views[candidateViews[vi]];
          var models = v && v.model && v.model.data && v.model.data.models;
          if (!models || !models.length) continue;
          var sum = 0;
          for (var mi = 0; mi < models.length; mi++) {
            var attrs = models[mi].attributes || {};
            var n = parseFloat(attrs.field_2028_raw);
            if (!isNaN(n)) sum += n;
          }
          return round2(sum);
        }
      } catch (e) { /* ignore */ }
      return null;
    })();
    if (modelLaborTotal !== null && modelLaborTotal > 0) {
      laborTotal = modelLaborTotal;
    } else if (projectTotals && Array.isArray(projectTotals.lines)) {
      // Secondary fallback: projectTotals "Installation Total" line.
      // Only useful when the value is a real number (not "TBD").
      for (var li = 0; li < projectTotals.lines.length; li++) {
        var ptLine = projectTotals.lines[li];
        if (!ptLine) continue;
        if (!/^installation\s+total\b/i.test(ptLine.label || '')) continue;
        var instRaw = (ptLine.value || '').replace(/[^0-9.]/g, '');
        var instAmt = parseFloat(instRaw);
        if (!isNaN(instAmt) && instAmt > 0) laborTotal = round2(instAmt);
        break;
      }
    }

    // Subtract proposal-level discount (the "Proposal Discount" line in
    // project totals) from the labor lump. Per-line discounts already
    // landed in field_2269_raw (equipment) for each row. The "Proposal
    // Discount" is a flat across-the-board discount that's accounted
    // for client-side against labor.
    var proposalDiscount = 0;
    if (projectTotals && Array.isArray(projectTotals.lines)) {
      for (var d = 0; d < projectTotals.lines.length; d++) {
        var line = projectTotals.lines[d];
        if (!line || line.type !== 'disc') continue;
        // Project totals can include MULTIPLE disc lines:
        //   "Line Item Discounts" — already baked into each row's
        //     field_2269_raw (post-discount equipment); summing it
        //     into labor would double-count.
        //   "Proposal Discount"  — flat across-the-board discount,
        //     this is the one we subtract from labor.
        // Match on the label so other future disc lines don't sneak in.
        if (!/^proposal\s+discount\b/i.test(line.label || '')) continue;
        // Strip everything except digits and dot. Discount values render
        // as "–$100.00" (en-dash + $); parseFloat needs the chars
        // stripped because the math-style minus isn't ASCII.
        var raw = (line.value || '').replace(/[^0-9.]/g, '');
        var amt = parseFloat(raw);
        if (!isNaN(amt) && amt > 0) proposalDiscount = round2(proposalDiscount + amt);
      }
    }
    var laborAfterDiscount = round2(laborTotal - proposalDiscount);
    if (laborAfterDiscount < 0) laborAfterDiscount = 0;

    function flatten(map) {
      var out = [];
      var skuKeys = Object.keys(map);
      for (var i = 0; i < skuKeys.length; i++) {
        var item = map[skuKeys[i]];
        if (item.qty > 0 && item.lineTotal === 0 && item.unitPrice > 0) {
          item.lineTotal = round2(item.qty * item.unitPrice);
        }
        out.push(item);
      }
      // Sort by proposal bucket sort order (field_2218), then bucket
      // name, then product name. Items missing field_2218 fall to the
      // bottom but stay grouped by bucket-name+description.
      out.sort(function (a, b) {
        if (a._sortBucket !== b._sortBucket) return a._sortBucket - b._sortBucket;
        return (a._sortLabel || '').localeCompare(b._sortLabel || '');
      });
      for (var j = 0; j < out.length; j++) {
        delete out[j]._sortBucket;
        delete out[j]._sortLabel;
      }
      return out;
    }

    return {
      equipment: flatten(equipmentBySku),
      labor: laborAfterDiscount > 0 ? {
        description: 'Installation services per SOW ' + (sowId || ''),
        qty: 1,
        unitPrice: laborAfterDiscount,
        lineTotal: laborAfterDiscount,
        // Surface the pre-discount and discount values too so Make can
        // render either ("Labor $X less proposal discount $Y = $Z") or
        // just ship the net.
        laborSubtotal: laborTotal,
        proposalDiscount: proposalDiscount
      } : null,
      recurring: flatten(recurringBySku)
    };
  }

  // Walk the rendered proposal HTML and emit an array of esignatures.com
  // document_elements. Output goes into a placeholder_fields entry as
  // `document_elements: [...]` so the agreement renders headings + tables
  // natively (instead of a plaintext blob).
  //
  // The walker is STRUCTURE-AWARE — it knows the exact class names this
  // file's renderer produces (.l1-section, .l1-header, .l2-header,
  // .product-table, .l1-footer, .project-totals, .detail-label-none,
  // .detail-table) and emits a curated, agreement-friendly subset:
  //
  //   Project / Quote names (.detail-label-none)        -> text_header_two
  //   Header detail rows (.detail-table)                -> 2-col table
  //                                                        (the
  //                                                        "Expiration
  //                                                        Date" row is
  //                                                        skipped)
  //   View titles (.view-title, e.g. "Proposed Solution")
  //                                                     -> text_header_two
  //   Each L1 section (.l1-section):
  //       .l1-header                                    -> text_header_three
  //       all .product-table bodies merged into ONE
  //         table (L2 headers and L2 footers skipped,
  //         header row deduped, Qty/Cost cells centered)
  //       .l1-footer lines                              -> text_header_three
  //   Project totals (.project-totals)                  -> text_header_two
  //                                                        + 2-col table
  //   BOM / report tables                               -> table (numeric
  //                                                        columns
  //                                                        centered)
  function buildSowDocumentElements(html) {
    if (!html || typeof html !== 'string') return [];

    var doc;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch (e) {
      return [];
    }
    if (!doc || !doc.body) return [];

    var dropEls = doc.querySelectorAll('script, style, head, link, meta, noscript, img');
    for (var di = 0; di < dropEls.length; di++) {
      if (dropEls[di].parentNode) dropEls[di].parentNode.removeChild(dropEls[di]);
    }

    var elements = [];

    function cleanText(s) {
      return (s || '').replace(/\s+/g, ' ').replace(/ /g, ' ').trim();
    }

    function pushHeader(level, text) {
      if (!text) return;
      var typeMap = { 1: 'text_header_one', 2: 'text_header_two', 3: 'text_header_three' };
      elements.push({ type: typeMap[level] || 'text_header_three', text: text });
    }

    function pushNormal(text) {
      if (!text) return;
      elements.push({ type: 'text_normal', text: text });
    }

    // .detail-label-none holds the rendered project name + quote name
    // as <h1>/<h2>. Skip the <h1> (project name) — Make injects it
    // dynamically at the top of the agreement instead. Keep the <h2>
    // (quote name) as text_header_two.
    function emitDetailLabelNone(el) {
      var seen = {};
      var headings = el.querySelectorAll('h2, h3, h4');
      for (var i = 0; i < headings.length; i++) {
        var t = cleanText(headings[i].textContent);
        if (t && !seen[t]) {
          pushHeader(2, t);
          seen[t] = true;
        }
      }
    }

    // .detail-table is a 2-column key/value table of header attrs (SOW
    // ID, Project Address, Expiration Date, Proposal ID, etc.). Drop
    // the Proposal ID row (Make injects the live value at the top of
    // the agreement) and the Expiration Date row.
    function emitDetailTable(table) {
      var rows = table.querySelectorAll('tr');
      var cells = [];
      for (var i = 0; i < rows.length; i++) {
        var labelEl = rows[i].querySelector('.detail-label');
        var valueEl = rows[i].querySelector('.detail-value');
        if (!labelEl) continue;
        var label = cleanText(labelEl.textContent);
        if (/^expiration\s+date/i.test(label)) continue;
        if (/^proposal\s+id/i.test(label)) continue;
        var value = cleanText(valueEl ? valueEl.textContent : '');
        cells.push([
          { text: label, styles: ['bold'] },
          { text: value }
        ]);
      }
      if (cells.length) elements.push({ type: 'table', table_cells: cells });
    }

    // .col-qty / .col-cost cells get center alignment per request.
    function cellAlignmentForClass(el) {
      if (!el || !el.classList) return null;
      if (el.classList.contains('col-qty') || el.classList.contains('col-cost')) return 'center';
      return null;
    }

    // .l1-section wraps an MDF/IDF/Headend group. Emit the L1 header as
    // H3, MERGE every .product-table inside the section into ONE
    // combined table (skipping L2 headers and L2 footers), then emit
    // each .l1-footer line as its own H3.
    function emitL1Section(section) {
      var headerEl = section.querySelector('.l1-header');
      if (headerEl) pushHeader(3, cleanText(headerEl.textContent));

      var combinedCells = [];
      var emittedHeaderRow = false;
      var tables = section.querySelectorAll('table.product-table');
      for (var t = 0; t < tables.length; t++) {
        if (!emittedHeaderRow) {
          var headRows = tables[t].querySelectorAll('thead tr');
          for (var hr = 0; hr < headRows.length; hr++) {
            var thCells = headRows[hr].querySelectorAll('th');
            if (!thCells.length) continue;
            var headerCells = [];
            for (var c = 0; c < thCells.length; c++) {
              var th = thCells[c];
              var cell = { text: cleanText(th.textContent), styles: ['bold'] };
              var align = cellAlignmentForClass(th);
              if (align) cell.alignment = align;
              headerCells.push(cell);
            }
            combinedCells.push(headerCells);
            emittedHeaderRow = true;
            break;
          }
        }
        var bodyRows = tables[t].querySelectorAll('tbody tr');
        for (var br = 0; br < bodyRows.length; br++) {
          var tdCells = bodyRows[br].querySelectorAll('td');
          if (!tdCells.length) continue;
          var rowCells = [];
          for (var cb = 0; cb < tdCells.length; cb++) {
            var td = tdCells[cb];
            var rcell = { text: cleanText(td.textContent) };
            var alignB = cellAlignmentForClass(td);
            if (alignB) rcell.alignment = alignB;
            rowCells.push(rcell);
          }
          combinedCells.push(rowCells);
        }
        // <tfoot> (.l2-footer) rows skipped intentionally.
      }
      if (combinedCells.length) {
        elements.push({ type: 'table', table_cells: combinedCells });
      }

      var footer = section.querySelector('.l1-footer');
      if (footer) {
        var fLines = footer.querySelectorAll('.l1-footer-line');
        for (var fi = 0; fi < fLines.length; fi++) {
          var lblEl = fLines[fi].querySelector('.l1-footer-label');
          var valEl = fLines[fi].querySelector('.l1-footer-value');
          var lbl = cleanText(lblEl ? lblEl.textContent : '');
          var val = cleanText(valEl ? valEl.textContent : '');
          var combined = (lbl && val) ? (lbl + '   ' + val) : (lbl || val);
          if (combined) pushHeader(3, combined);
        }
      }
    }

    function emitProjectTotals(rootEl) {
      var title = rootEl.querySelector('.pt-title');
      if (title) pushHeader(2, cleanText(title.textContent));
      var lines = rootEl.querySelectorAll('.pt-line');
      var tableCells = [];
      for (var i = 0; i < lines.length; i++) {
        var labelEl = lines[i].querySelector('.pt-label');
        var valueEl = lines[i].querySelector('.pt-value');
        if (!labelEl || !valueEl) continue;
        var label = cleanText(labelEl.textContent);
        var value = cleanText(valueEl.textContent);
        var isGrand = lines[i].className.indexOf('pt-line--grand') >= 0
                   || lines[i].className.indexOf('pt-line--final') >= 0
                   || /grand|total/i.test(label);
        var labelCell = { text: label };
        var valueCell = { text: value, alignment: 'right' };
        if (isGrand) {
          labelCell.styles = ['bold'];
          valueCell.styles = ['bold'];
        }
        tableCells.push([labelCell, valueCell]);
      }
      if (tableCells.length) {
        elements.push({ type: 'table', table_cells: tableCells });
      }
    }

    // Generic table fallback (BOM, etc.). Center-aligns numeric cells.
    function emitGenericTable(table) {
      var rowEls = table.querySelectorAll('tr');
      var cells = [];
      for (var r = 0; r < rowEls.length; r++) {
        var rowCellEls = rowEls[r].querySelectorAll('td, th');
        if (!rowCellEls.length) continue;
        var rowCells = [];
        for (var c = 0; c < rowCellEls.length; c++) {
          var el = rowCellEls[c];
          var text = cleanText(el.textContent);
          var entry = { text: text };
          var styles = [];
          if (el.tagName.toLowerCase() === 'th' || el.querySelector('strong, b')) styles.push('bold');
          if (el.querySelector('em, i')) styles.push('italic');
          if (styles.length) entry.styles = styles;
          if (/^[\$\(]?-?[\d,]+(?:\.\d+)?[\)\%]?$/.test(text)) entry.alignment = 'center';
          rowCells.push(entry);
        }
        cells.push(rowCells);
      }
      if (cells.length) elements.push({ type: 'table', table_cells: cells });
    }

    function walkChildren(parent) {
      for (var i = 0; i < parent.children.length; i++) {
        var child = parent.children[i];
        var classes = child.classList;

        // BOM / report views are skipped entirely in the agreement —
        // esignatures' renderer wraps mid-character in narrow currency
        // cells and the BOM doesn't belong in a signed contract anyway
        // (it's an internal accounting artifact). Customer-facing
        // equipment list lives in the L1 sections above.
        if (classes && (classes.contains('report-table-wrap') ||
                        classes.contains('report-section') ||
                        classes.contains('bom-section'))) {
          continue;
        }

        if (classes && classes.contains('detail-label-none')) { emitDetailLabelNone(child); continue; }
        if (child.tagName.toLowerCase() === 'table' && classes && classes.contains('detail-table')) {
          emitDetailTable(child); continue;
        }
        if (classes && classes.contains('view-title')) {
          pushHeader(2, cleanText(child.textContent));
          continue;
        }
        if (classes && classes.contains('view-narrative')) {
          var nt = cleanText(child.textContent);
          if (nt) pushNormal(nt);
          continue;
        }
        if (classes && classes.contains('l1-section')) { emitL1Section(child); continue; }
        if (classes && classes.contains('project-totals')) { emitProjectTotals(child); continue; }
        if (classes && classes.contains('recurring-section')) {
          walkChildren(child);
          continue;
        }
        if (child.tagName.toLowerCase() === 'table') { emitGenericTable(child); continue; }

        if (/^h([1-6])$/i.test(child.tagName)) {
          var level = parseInt(child.tagName.charAt(1), 10);
          pushHeader(Math.min(level, 3), cleanText(child.textContent));
          continue;
        }

        if (child.children.length) {
          walkChildren(child);
        } else {
          var t = cleanText(child.textContent);
          if (t) pushNormal(t);
        }
      }
    }

    walkChildren(doc.body);
    return elements;
  }

  // ── Sub-bid review (bid + diff) for the published-proposal record ──────
  // The sub-bid diff is computed on the Bid Review page and stamped onto the
  // SOW's field_2941 (JSON blob) by sub-bid-diff/pdf-html.js. That blob carries
  // two PDF-ready HTML fragments — `bidHtml` (the basis bid) and `diffHtml`
  // (what's off vs the SOW). On the proposal page (scene_1096) field_2941 is
  // projected onto view_3861, so we can read it here and surface:
  //   subBidBidHtml / subBidDiffHtml  — the raw fragments
  //   subBidReviewHtml                — a standalone internal document
  //                                     (getPdfCss + both fragments)
  // This is INTERNAL — it exposes subcontractor cost data, so it is NOT
  // spliced into the client-facing `html`/`htmlPdf`. Make should convert
  // subBidReviewHtml to its own PDF and attach it to the published-proposal
  // record (internal copy), not to the customer proposal.
  function buildSubBidReview() {
    // basisId / subId / subName are the STRUCTURED identity of the basis bid
    // — Make stamps these onto the published-proposal record (connection to
    // the bid package + subcontractor) so a greenlit project traces back to
    // the exact bid it was quoted from. basisId comes from the field_2941
    // blob (stamped at bid review); subId/subName ride the same blob once
    // sub-bid-diff's pkgSub config key is set (bid package → sub connection).
    var empty = { bidHtml: '', diffHtml: '', reviewHtml: '', basis: '', basisId: '',
      subId: '', subName: '', hasDiff: false, note: '' };
    function finishSubBid(snap) {
      if (!snap) return empty;
      var b = snap.bidHtml || '', d = snap.diffHtml || '', rv = '';
      if (b || d) {
        rv = ['<!DOCTYPE html>', '<html><head><meta charset="utf-8">',
          '<title>Sub-Bid Review — ' + esc(snap.basisBidName || '') + '</title>',
          '<style>', getPdfCss(), '</style>', '</head><body>',
          d, b, '</body></html>'].join('\n');
      }
      return { bidHtml: b, diffHtml: d, reviewHtml: rv,
        basis: snap.basisBidName || '', basisId: snap.basisBidId || '',
        subId: snap.basisSubId || '', subName: snap.basisSubName || '',
        hasDiff: Number(snap.total) > 0, note: snap.note || '' };
    }
    // Prefer the Knack MODEL value (verbatim JSON) — Knack renders the embedded
    // HTML fragments as elements in the detail body, so DOM textContent strips
    // the tags and corrupts the blob. The model holds it exactly as PUT.
    try {
      var mv = window.Knack && Knack.views && Knack.views.view_3861;
      var ma = mv && mv.model && mv.model.attributes;
      var mt = (ma && ma.field_2941 != null) ? String(ma.field_2941).trim() : '';
      if (mt) { try { return finishSubBid(JSON.parse(mt)); } catch (e) {} }
    } catch (e) { /* fall through to DOM */ }
    var cell = document.querySelector('.kn-detail.field_2941 .kn-detail-body');
    if (!cell) return empty;
    var txt = (cell.textContent || '').replace(/ /g, ' ').replace(/<[^>]*>/g, '').trim();
    if (!txt) return empty;
    var snap;
    try { snap = JSON.parse(txt); } catch (e) { return empty; }
    return finishSubBid(snap);
  }

  // Flat, explicitly-named projection of the scraped bid sections for the
  // submit-bid webhook. Make maps bidLineItems[].rate / .qty / .cost instead of
  // decoding raw field_XXXX keys out of `json`. One entry per rendered bid
  // line — the preview grid splits labor-description groups by rate
  // (bid-items-grid.js splitLevel3GroupsByRate), so a line is always a
  // single (description, rate) pair with qty and cost summed within it.
  function buildBidLineItems(payload) {
    var lines = [];
    var views = (payload && payload.views) || [];
    for (var v = 0; v < views.length; v++) {
      var sections = views[v].sections || [];
      for (var s = 0; s < sections.length; s++) {
        var l1 = sections[s];
        var buckets = l1.buckets || [];
        for (var b = 0; b < buckets.length; b++) {
          var l2 = buckets[b];
          var products = l2.products || [];
          for (var p = 0; p < products.length; p++) {
            var l3 = products[p];
            lines.push({
              mdfIdf:      l1.label || '',
              bucket:      l2.label || '',
              description: l3.label || '',
              qty:         l3.qty != null ? l3.qty : '',
              rate:        l3.rate || '',
              cost:        l3.cost || ''
            });
          }
        }
      }
    }
    return lines;
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
    var htmlStr       = buildPdfHtml(payload);
    var summary       = extractSummaryFields(payload);
    var jsonSnapshot  = buildJsonSnapshot(cfg.sceneId);
    var plaintextStr  = htmlToPlaintext(htmlStr);
    var subBid        = buildSubBidReview();
    // Tech group — field_2954 lives on the BID record; view_3861 displays
    // it THROUGH the SOW's basis connection (field_2942), so the read is
    // live: it always reflects whichever bid is currently the basis, with
    // nothing to stamp. Knack keys connected-field projections as
    // 'field_2942.field_2954' in the model — try both shapes, then DOM.
    try {
      var tgv = window.Knack && Knack.views && Knack.views.view_3861;
      var tga = tgv && tgv.model && tgv.model.attributes;
      var tgRaw = tga && (tga['field_2942.field_2954_raw'] || tga.field_2954_raw);
      var tgOne = Array.isArray(tgRaw) ? tgRaw[0] : tgRaw;
      if (!(tgOne && tgOne.id)) {
        var tgEl = document.querySelector('#view_3861 .kn-detail[class*="field_2954"] span[data-kn="connection-value"]');
        if (tgEl) tgOne = { id: (tgEl.className || tgEl.id || '').trim(), identifier: tgEl.textContent };
      }
      if (tgOne && tgOne.id && /^[0-9a-f]{24}$/i.test(tgOne.id)) {
        subBid.subId = tgOne.id;
        subBid.subName = String(tgOne.identifier || '').trim();
      }
    } catch (e) { /* keep snapshot values */ }

    // Mint a public access token + URL at publish time so the new
    // proposal record is born sharable. mintProposalAccess returns
    // { token, url } from SCW.secureProposalLink helpers.
    var access = mintProposalAccess();
    var accessToken = access.token;
    var accessUrl   = access.url;

    return {
      recordId:              getPageRecordId() || '',
      hash:                  window.location.hash || '',
      sceneId:               cfg.sceneId,
      type:                  cfg.payloadType,
      // Named line-item projection for the subcontractor-bid scenario only
      // (undefined elsewhere → dropped by JSON.stringify). See buildBidLineItems.
      bidLineItems:          cfg.payloadType === 'subcontractor bid' ? buildBidLineItems(payload) : undefined,
      bidLabel:              cfg.payloadType === 'subcontractor bid' ? ((payload.bidHeader || {}).label || '') : undefined,
      bidExpirationDate:     cfg.payloadType === 'subcontractor bid' ? ((payload.bidHeader || {}).expires || '') : undefined,
      sowId:                 summary.sowId,
      equipmentTotal:        summary.equipmentTotal,
      installationTotal:     summary.installationTotal,
      grandTotal:            summary.grandTotal,
      expirationDate:        summary.expirationDate,
      // Tokenized public link, minted client-side at publish time.
      // Make should write these to field_2904 and field_2908 on the
      // proposal record so the public snippet finds them on first
      // load. Token format: 64-char lowercase hex (32 random bytes
      // via window.crypto.getRandomValues).
      proposalAccessToken:   accessToken,
      proposalAccessUrl:     accessUrl,
      // `html` is the SNAPSHOT-safe variant: appended-image srcs use the
      // original clean Knack asset URL (no data: URI, no query string) so
      // they survive Knack's field_2680 rich-text sanitizer and render on
      // the customer-facing published page. This is what Make should store
      // in field_2680. `htmlPdf` keeps the inline/resized variant (base64
      // data URI for Site Maps, weserv for other DOM assets) for the PDF
      // render — Make's PDF step should read htmlPdf. Until the Make
      // scenario is pointed at htmlPdf, the PDF uses the raw (larger)
      // images — never broken, just bigger. See CLAUDE.md.
      html:                  buildSnapshotHtml(payload, htmlStr),
      htmlPdf:               htmlStr,
      // ── Sub-bid review (INTERNAL — subcontractor cost data) ──────────
      // Read from the SOW's field_2941 snapshot. NOT part of the
      // client-facing html/htmlPdf. Make should convert subBidReviewHtml to
      // its own PDF and attach it to the published-proposal record (internal
      // copy). subBidBidHtml/subBidDiffHtml are the raw fragments if you'd
      // rather compose them yourself.
      subBidBidHtml:         subBid.bidHtml,
      subBidDiffHtml:        subBid.diffHtml,
      subBidReviewHtml:      subBid.reviewHtml,
      subBidBasis:           subBid.basis,
      // Structured basis identity — Make should stamp these on the published
      // proposal record (connection → bid package, connection → subcontractor)
      // so a greenlit project traces to the exact bid it was quoted from.
      // basisId is the bid package record id (from the field_2941 blob; also
      // readable as field_2942_raw on the SOW). SubId/SubName populate once
      // the bid-review snapshot carries them (sub-bid-diff pkgSub config).
      subBidBasisId:         subBid.basisId,
      subBidBasisSubId:      subBid.subId,
      subBidBasisSubName:    subBid.subName,
      subBidHasDiff:         subBid.hasDiff,
      subBidNote:            subBid.note,
      plaintext:             plaintextStr,
      // Pre-escaped variant of `plaintext`, safe to drop directly between
      // double quotes in a JSON string template (e.g. an esignatures.com
      // request body that maps {{...}} placeholders into a hand-written
      // body template). JSON-encodes \, ", \n, \r, \t, and other control
      // chars; trims surrounding quotes so callers can do `"value": "{{x}}"`.
      plaintextJsonEscaped:  jsonStringEscape(plaintextStr),
      // Structured form of the SOW for esignatures.com "advanced
      // placeholder fields" (document_elements). Drop directly into a
      // placeholder_fields entry as `"document_elements": {{...}}`
      // INSTEAD of `"value": "..."` to render headings + tables natively
      // in the agreement. Bypasses JSON-string-escape entirely because
      // the value is a structured array, not a string.
      scopeOfWorkDocumentElements: buildSowDocumentElements(htmlStr),
      // Pre-stringified scopeOfWorkDocumentElements for the same reason
      // jsonString exists below: when Make maps an array value into a
      // plain-text/paragraph Knack field, it iterates the array and
      // joins inner items with ", " — losing the wrapping `[` and `]`.
      // The user then has to wrap-in-brackets at read time. Ship the
      // proper JSON.stringify of the array so it can be stored verbatim
      // and parseJSON'd back to a structured array on the read side.
      scopeOfWorkDocumentElementsString: (function () { try { return JSON.stringify(buildSowDocumentElements(htmlStr)); } catch (e) { return '[]'; } })(),
      // Full snapshot, both `field_xxx` (rendered HTML) and `field_xxx_raw`
      // (clean structured) shapes. Keep this intact for Make scenarios
      // that map directly to `.json[].field_xxx` for their downstream
      // Knack writes. If you're routing through Make's Parse JSON
      // module, use `jsonString` below instead — it's the clean,
      // raw-only shape and is safe to round-trip through string fields.
      json:                  jsonSnapshot,
      // Pre-stringified, raw-only snapshot. Strips every `field_xxx`
      // (and `field_xxx.field_yyy` equation projection) that has a
      // `_raw` twin — the rendered-HTML versions are pure liability
      // for any consumer that re-encodes the JSON, because the inner
      // HTML quotes (especially the equation-field `<span id="">…</span>`
      // wrappers) get half-escaped in transit and break Parse JSON.
      // Store this string verbatim in a Knack plain-text/paragraph
      // field; at read time, `parseJSON(field_value)` reconstitutes
      // the (raw-only) object exactly.
      jsonString:            (function () { try { return JSON.stringify(stripNonRawFields(jsonSnapshot)); } catch (e) { return ''; } })(),
      // Pre-categorized, billing-system-agnostic invoice line items.
      // Bundle owns the SKU vs labor vs license classification; Make
      // injects Xero / TaxJar product_tax_code values at integration
      // time. Shape:
      //   { equipment: [ { sku, description, qty, unitPrice, lineTotal } ],
      //     labor:    { description, qty, unitPrice, lineTotal } | null,
      //     recurring: [ { sku, description, qty, unitPrice, lineTotal } ] }
      invoiceItems:          buildInvoiceItems(jsonSnapshot, summary.sowId, payload.projectTotals),
      invoiceItemsString:    (function () { try { return JSON.stringify(buildInvoiceItems(jsonSnapshot, summary.sowId, payload.projectTotals) || {}); } catch (e) { return '{}'; } })(),
      // Token contract — Make's "Tools → Replace" step should run
      // through this list and substitute each {{TOKEN}} occurrence in
      // .html with the post-create record's matching field. Listed on
      // the payload so the Make scenario doesn't have to keep its own
      // hard-coded copy.
      tokens:                PROPOSAL_TOKENS
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
    // Render just the appended image sections (Site Maps / Additional
    // Photos) for a scene as an HTML string — the exact same markup the
    // published PDF/HTML appends at the end. proposal-preview-images.js
    // injects this at the bottom of the in-app preview so staff see the
    // images that WILL publish. Returns '' when the scene has no
    // appendImageViews or none of them have images yet.
    //
    // opts.rawSiteMaps: unwrap the images.weserv.nl resize proxy back to
    // the original asset URL. The in-app preview is internal and doesn't
    // need the small/resized variant — showing the raw full-size image
    // avoids routing internal viewing through the third-party CDN.
    appendImagesHtml: function (sceneId, opts) {
      var cfg = null;
      for (var si = 0; si < SCENES.length; si++) {
        if (SCENES[si].sceneId === sceneId) { cfg = SCENES[si]; break; }
      }
      if (!cfg) return '';
      var sections = scrapeAppendImageSections(cfg);
      if (!sections.length) return '';
      if (opts && opts.rawSiteMaps) {
        for (var s = 0; s < sections.length; s++) {
          var imgs = sections[s].images || [];
          for (var ii = 0; ii < imgs.length; ii++) {
            // Prefer the original clean asset URL; fall back to unwrapping a
            // weserv proxy src. (img.src may be a base64 data URI once the
            // downscale cache is warm — img.url is always the https:// link.)
            imgs[ii].src = imgs[ii].url || unwrapResizeProxyUrl(imgs[ii].src);
          }
        }
      }
      var html = [];
      for (var i = 0; i < sections.length; i++) {
        // opts.groupImages: render ONE section heading followed by all of
        // its images. The published path (renderAppendImageSection) repeats
        // the heading per full-page image because each lands on its own PDF
        // page; on the continuous in-app preview that repetition reads as
        // several identical stacked headings, so the preview groups instead.
        var sec = sections[i];
        if (opts && opts.groupImages && sec.fullPage) {
          var imgs2 = sec.images || [];
          if (imgs2.length) {
            html.push('<section class="append-image-page">');
            if (sec.label) {
              html.push('<h2 class="append-image-title">' + esc(sec.label) + '</h2>');
            }
            for (var k = 0; k < imgs2.length; k++) {
              html.push('<img class="append-image" src="' + esc(imgs2[k].src) + '" ' +
                        'alt="' + esc(imgs2[k].alt || sec.label) + '" />');
            }
            html.push('</section>');
          }
          renderAttachmentLinks(sec, html, sec.label);
        } else {
          renderAppendImageSection(sec, html);
        }
      }
      return html.join('\n');
    },
    // Page-ready gate. ops-stepper.js (and any other publish path
    // outside this file) calls isPageReady('scene_1096') before
    // firing a publish click. whenPageReady(sceneId, cb) is the
    // callback variant — fires cb immediately if already ready, or
    // queues it until the scene quiets down.
    isPageReady: isPageReady,
    whenPageReady: whenPageReady,
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

    // Track readiness for every configured scene so isPageReady /
    // whenPageReady are always wired before any trigger fires.
    setupReadyTracker(cfg.sceneId);

    if (cfg.trigger.type === 'button') {
      setupButtonTrigger(cfg);
    } else if (cfg.trigger.type === 'formSubmit') {
      setupFormSubmitTrigger(cfg);
    }
  }
})();
