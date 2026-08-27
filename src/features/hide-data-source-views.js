/*** FEATURE: Hide data-source views ***/
/**
 * Several views are present on a page only because other custom-JS
 * features scrape their rendered DOM / Knack model for data — the
 * user has no business seeing or interacting with them. Knack's
 * builder doesn't expose a "render but hide" toggle, so we hide them
 * here via CSS.
 *
 * `display: none` keeps the elements in the DOM and lets Knack
 * populate the Backbone model normally — features that read from
 * `Knack.views[viewId].model` or `tr#<recordId>` selectors continue
 * to work because the markup is still rendered, just not painted.
 *
 * Three selector forms per view, because Knack/KTL nest views
 * differently in different contexts:
 *   1. `#view_XXXX`                                         — the view element itself
 *   2. `.view-column:has(> #view_XXXX)`                     — the column wrapper (so empty columns don't claim layout)
 *   3. `.scw-ktl-accordion:has(... data-view-key=view_XXXX)` — the KTL accordion shell, header + body
 *      (otherwise the accordion's "Title N" header stays visible even though the body is empty)
 *
 * Add views here as needed; keep the comment next to each one
 * explaining what consumes it so a future cleanup pass knows where
 * to look before deleting.
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-hide-data-source-views-css';

  // viewId → consumer note. Comment is the documentation, not used
  // by the CSS — but keep it close to the id for grep-discovery.
  var HIDDEN_VIEWS = [
    // 'view_4073' — pending change requests data source on scene_1149.
    // Read from the DOM by the bid page enhancements; users never see it
    // (and proposal-pdf-export skips it so it never enters the bid PDF).
    'view_4073',
    // 'view_3827' — SOW kn-details: workflow-stepper SOURCE_VIEW,
    // create-sow-option-btn / preview-proposal-btn / import-unique-
    // items-btn read field_1199 / record id from this view's model.
    'view_3827',
    // 'view_3841' — SOW edit form used as a write target by ops-
    // review-pill (field_2725 + field_2736 PUTs) and by sales-change-
    // request as draftView for SOW record API calls.
    'view_3841',
    // 'view_3876' — workflow-stepper reads field_2329 here to build
    // the action link href; survey-request-cards renders its rows as
    // cards and workflow-stepper ships the latest row as the
    // lastSurveyRequestInfo payload snapshot.
    'view_3876',
    // 'view_4155' — SURVEY_requests rounds for the project on the sales
    // build-SOW page (scene_1116). workflow-stepper's bidIsBack() reads
    // field_2955 from its model (drives the alt-proposal step's bid-back
    // copy) and the alt-proposal payload ships its rounds as context.
    'view_4155',
    // 'view_3913' — hidden grid of all SOW line items on the project,
    // scraped by import-unique-items-btn for the sowId → lineItemIds
    // index (and itemId → label map). change-record-limit pumps it
    // to 1000 rows/page so the index covers the whole project.
    'view_3913',
    // 'view_3926' — DOC_files records connected to SOWs (field_2143)
    // and bid packages (field_2421). Bid-review render scrapes this
    // view to surface attached files in the SOW status bar and bid
    // column headers.
    'view_3926',
    // ── Bid Review comparison page (scene_1155) ───────────────
    // The bid-review feature replaces these source grids with its
    // own composite #bid-review-matrix mount. Keep them rendered
    // (Backbone models still need to populate) but visually hidden.
    // 'view_3680' — bid records (the bids being compared).
    // TEMPORARILY UNHIDDEN: debugging field_771 (photos) read path
    // for rows with no matching SOW item. Restore by uncommenting.
    // 'view_3680',
    // 'view_3921' — SOW line items (unbid noBid rows + worksheet
    // wsTrs that get moved into the expand panel).
    'view_3921',
    // 'view_3573' — bid package records (PDF link in the bid column
    // header).
    'view_3573',
    // 'view_3822' — MDF/IDF location records (group labels + L1
    // SCW notes / survey notes callouts).
    'view_3822',
    // 'view_3818' — pending Change Request records, scraped for the
    // CR badges and the "+ Add to bid" pending state.
    'view_3818',
    // 'view_3842' — BID_revision line items, read by sales-revision-
    // column.js and bid-review/init.js (revision card prefill) via
    // DOM scrape of the rendered grid.
    'view_3842',
    // 'view_4153' — BID_revision requests. Not consumed by anything in the
    // bundle; it's on the scene as the request-level companion to view_4154.
    // Nothing to read, nothing for the user to do with it — hidden outright.
    'view_4153',
    // 'view_4154' — BID_revision line items, UNFILTERED. view_3842 renders
    // only revisions awaiting Ops triage, so the Revision Requests panel
    // reads this one for accepted/rejected/forwarded history (sales-revision-
    // column.js CFG.revisionViews). MUST stay rendered — the panel scrapes
    // its rows out of the DOM.
    'view_4154',
    // 'view_3918' — Scopes of Work grid; bid-review's "next step"
    // surface reads/writes through this view (config.nextStepViewKey
    // + surveyCostsWriteView). Kept rendered for model access.
    'view_3918',
    // 'view_3923' — Update Installation Project form view used by
    // bid-review's margin edit flow (field_2158 PUT target).
    'view_3923',
    // 'view_3927' — mounting-hardware accessory view; mirror-connection-
    // sync.js (ACCESSORIES_VIEW_ID) reads from it.
    'view_3927',
    // 'view_3962' — dedicated SOW Line Items source for the v2
    // worksheet rewrite (worksheet-v2/). Hidden so end users only
    // see the v1 grid (view_3610) + the v2 preview panel during
    // the parallel build.
    'view_3962',
    // 'view_3966' — "Add Document" menu/button view on the review-bids
    // page. Not a data source — purely an unwanted nav button the user
    // doesn't want surfaced. Hidden via the same mechanism for simplicity.
    'view_3966',
    // 'view_4001' — Add-to-SOW menu link on the review-bids page. The
    // comparison grid's "+ Add to SOW" toolbar button clicks this view's
    // (hidden) link programmatically — see bid-review-v2/toolbar.js
    // handleAddSow. The link opens the view_4002 multi-add form.
    'view_4001',
    // 'view_4068' — DOC save-target form; closeout-deliverables.js writes
    // through it (docSaveView). Kept rendered so the PUT path works, hidden
    // from the user.
    'view_4068',
    // 'view_4075' — DOC_photos connected to install line items on the
    // customer questionnaire scene; customer-questionnaire.js reads its
    // model to inject photo strips into the questionnaire cards.
    'view_4075',
    // 'view_4099' — Add-item menu link on the Change Order scene. The CO
    // worksheet's "+ Add New Item" toolbar button clicks this view's
    // (hidden) link programmatically (worksheet-v2 addSowMenuView on the
    // view_4079 entry) — same mechanism as view_4001 on review-bids. The
    // link opens a copy of the Add-to-SOW form targeted at the CO.
    'view_4099',
    // 'view_4109' — CO record details (CO Status + Sub Pricing Snapshot)
    // on the CO drafting scene. co-stage-strip.js reads status/snapshot
    // from its model and polls it while the CO is Pending Sub Pricing.
    'view_4109',
    // 'view_4122' — CO record details on the sub portal Manage Change
    // Order page (scene_1374). co-sub-lock.js reads CO Status from its
    // model to decide the page-wide edit window.
    'view_4122',
    // 'view_4066' — ACCEPTANCE grid on the sub deployment dashboard
    // (scene_1353). Hidden from subs entirely (decided 2026-08-12) —
    // agreements/invoices are an ops surface. Kept rendered because
    // regenerate-closeout-docs.js reads its first row for the
    // AcceptanceID webhook payload (and install-as-quoted-panel.js reads
    // it as the sub-scene acceptance source for origin/quote chips).
    'view_4066',
    // 'view_4151' — SOW_proposed line items grid on the sub deployment
    // dashboard (scene_1353): the sub-scene analogue of view_4072.
    // install-as-quoted-panel.js reads its model for the As Quoted
    // panels; subs have no business seeing the raw grid.
    'view_4151',
  ];

  // Views that must NEVER be hidden as collateral damage from the
  // column-wrapper / accordion-shell rules below. Add ids here if you
  // see a visible view disappear because it happens to share a column
  // or KTL accordion with one of HIDDEN_VIEWS.
  var NEVER_HIDE = {
    'view_3885': 1,  // published-proposal lookup on the ops-list scene
                     // (shares chrome with view_3841 SOW edit-form).
    'view_3920': 1   // published-proposal source on scene_1155 — shares
                     // layout with several hidden bid-review source views;
                     // must stay visible.
  };

  if (!document.getElementById(STYLE_ID)) {
    var selectors = [];
    for (var i = 0; i < HIDDEN_VIEWS.length; i++) {
      var v = HIDDEN_VIEWS[i];
      // Always safe — hides the view element itself only.
      selectors.push('#' + v);
      // The column-wrapper and accordion-shell rules are LAYOUT helpers
      // (kill empty columns / kill orphan accordion headers). They
      // over-hide when the same column / accordion also holds a view
      // we want visible — see hideOnRender below for the JS gates that
      // make these conditional. The CSS rules are kept tight: column
      // must have NO other direct child element; accordion must have
      // NO other view-key headers inside.
      // ktl-accordion stamps scw-acc-for-<viewKey> on the wrapper it
      // builds (one view per wrapper), so the shell hide is an exact
      // class match — the old :has()/:not(:has()) pair taxed every
      // style recalc document-wide. The column-wrapper hide is now
      // JS-only (hideOnRender below) — worst case the empty column
      // holds layout for one render pass.
      selectors.push('.scw-acc-for-' + v);
    }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = selectors.join(',\n') +
      ' {\n  display: none !important;\n}\n';
    document.head.appendChild(style);
  }

  // True when the column/accordion contains a view we must keep visible.
  function containsProtectedView(container) {
    if (!container) return false;
    for (var id in NEVER_HIDE) {
      if (container.querySelector('#' + id)) return true;
    }
    return false;
  }

  // Belt-and-suspenders: on each render of a hidden view, also set
  // inline display:none directly on the view element. We additionally
  // try to hide the parent column wrapper and the KTL accordion shell —
  // but ONLY when they're effectively single-tenant for this view.
  // Otherwise we'd take sibling views like view_3885 down with us.
  function hideOnRender(viewId) {
    SCW.onViewRender(viewId, function () {
      var el = document.getElementById(viewId);
      if (!el) return;
      el.style.display = 'none';
      // Column wrapper — only hide if this view is its only child AND
      // it doesn't also contain a NEVER_HIDE view.
      var col = el.closest('.view-column');
      if (col && col.children.length === 1 && !containsProtectedView(col)) {
        col.style.display = 'none';
      }
      // Accordion shell — only hide if no NEVER_HIDE view shares it,
      // and only one accordion header inside (the one we're hiding).
      var acc = el.closest('.scw-ktl-accordion');
      if (acc && !containsProtectedView(acc)) {
        var headers = acc.querySelectorAll('.scw-ktl-accordion__header[data-view-key]');
        if (headers.length <= 1) acc.style.display = 'none';
      }
    }, 'scwHideDataSource');
  }
  for (var h = 0; h < HIDDEN_VIEWS.length; h++) hideOnRender(HIDDEN_VIEWS[h]);
})();
/*** END FEATURE: Hide data-source views ***/
