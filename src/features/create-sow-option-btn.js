/*** FEATURE: Create Alternate SOW button → view_3869 accordion header ***/
/**
 * Injects a "Create Alternate SOW" button into the accordion header for
 * view_3869. Visible only after the Initiate Install step has fired
 * (field_1199 populated on the SOW detail view_3827).
 *
 * WHY THERE IS A MODAL NOW:
 *   The button used to fire straight at Make with EVERY line item id on the
 *   SOW, and a fully-populated duplicate SOW appeared with no warning and no
 *   choices. Nobody could tell what it was about to do, which is the whole
 *   complaint. Clicking now opens a picker: which items go on the alternate,
 *   and what model each one uses there.
 *
 * PARENT ITEMS ONLY:
 *   Accessories (a populated field_2464 parent) are deliberately absent —
 *   mounting boxes and brackets ride along with the device they hang off,
 *   and listing them turns a 12-row decision into a 40-row scroll. The
 *   automation is expected to carry a parent's accessories with it.
 *
 * SAYING IT (2026-11-03, "it is not obvious enough that we're creating an
 *   alternate SOW with SHARED options"): the window opens on a band that
 *   draws it (this SOW → the same line items → the new alternate) and says
 *   it in words; three counters (Shared / Copies / Left off) and the Create
 *   button carry the totals; and EVERY row wears its state as a chip —
 *   "silence means shared" was what nobody read. A copy row names what this
 *   SOW keeps. Filter pills show one state at a time.
 *
 * SWAPPING A MODEL IN ONE MOVE ("swapping all the readers to a different
 *   type of reader — that's a LOT of clicks"): "Swap a model on the
 *   alternate" lists each model the rows carry today, most-used first; one
 *   choice there sets every row with that model (or only the rows in picked
 *   MDF/IDFs) — the item rows stay the one source of truth, the model row
 *   only sets their selects and reads them back ("Set per row below" when
 *   they were set by hand). A swap warns, in amber, when the catalog says a
 *   copied line's attached mounting hardware does not fit the new model
 *   (SCW.catalog.fits === false; undecided says nothing).
 *
 * LINK vs CLONE — the distinction the whole feature exists for:
 *   Leave a row's model alone and the SAME line item is shared onto the new
 *   SOW (field_2154 is a multi-connection) — one record, two SOWs, edits
 *   track both. Change the model and it must instead be CLONED, because the
 *   alternate needs a different product and the original has to keep its
 *   own. The payload says which per item; it never asks Make to guess.
 *
 * Payload:
 *   {
 *     sourceRecordId, triggeredBy,
 *     sowLineItemIds:      [ ids to LINK ],        // back-compat, link-only
 *     linkIds:             [ ids to LINK ],
 *     cloneItems:          [ { sourceItemId, productId, productName,
 *                              fromProductId, fromProductName } ],
 *     licenseRecurringIds: [ ids ]
 *   }
 *   Response: { success: true, newSowId, newSowUrl } | { success:false, error }
 *
 * ⚠️ sowLineItemIds carries ONLY the link-mode ids. Until the Make scenario
 *   grows a cloneItems branch, a model-changed row is simply absent from the
 *   new SOW — omitted, never linked with the wrong product. Failing by
 *   omission is recoverable; failing by quietly attaching the wrong model to
 *   a quote is not.
 */
(function () {
  'use strict';

  var TARGET_VIEW    = 'view_3869';
  var GATE_VIEW      = 'view_3827';   // SOW detail view supplying field_1199 + record id
  var GATE_FIELD     = 'field_1199';  // Install Project populated -> show button
  var ITEMS_VIEW     = 'view_3586';   // SOW line items
  var LICENSE_VIEW   = 'view_3471';   // Licenses / recurring services
  var BTN_MARKER     = 'scw-create-sow-option-btn';
  var BTN_LABEL      = 'Create Alternate SOW';
  var EVENT_NS       = '.scwCreateSowOption';

  var F = {
    product:  'field_1949',   // REL_product (single connection)
    label:    'field_1950',   // display label
    parent:   'field_2464',   // accessory → parent line item
    bucket:   'field_2219',   // proposal bucket
    mdfIdf:   'field_1946'    // MDF/IDF location
  };

  // Proposal-wide assumption rows carry no product, so a model dropdown on
  // them is meaningless — they're excluded from the picker entirely. Same
  // bucket id worksheet-v2's bucketCategoryOf uses for 'assumptions'.
  var ASSUMPTIONS_BUCKET = '697b7a023a31502ec68b3303';

  var P = 'scw-alt-sow';

  var COPY_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round" class="scw-create-sow-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // ── Styles ───────────────────────────────────────────────
  (function injectStyles() {
    if (document.getElementById('scw-create-sow-option-css')) return;
    var s = document.createElement('style');
    s.id = 'scw-create-sow-option-css';
    s.textContent = [
      '.' + BTN_MARKER + '.is-loading { pointer-events: none; opacity: 0.75; cursor: wait; }',
      '.' + BTN_MARKER + '.is-loading svg { animation: scw-create-sow-spin 0.8s linear infinite; }',
      '@keyframes scw-create-sow-spin { to { transform: rotate(360deg); } }',
      '.' + P + '-back {',
      '  position: fixed; inset: 0; background: rgba(15,23,42,.45);',
      '  z-index: 10060; display: flex; align-items: center; justify-content: center;',
      '}',
      '.' + P + '-modal {',
      '  background: #fff; border-radius: 12px; display: flex; flex-direction: column;',
      '  width: min(920px, calc(100vw - 32px)); max-height: 92vh;',
      '  box-shadow: 0 12px 32px rgba(15,23,42,.25);',
      '  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a;',
      '}',
      '.' + P + '-head { padding: 18px 24px 12px; border-bottom: 1px solid #eef2f7; }',
      '.' + P + '-title { margin: 0 0 2px; font: 700 18px/1.3 system-ui, sans-serif; color: #0c4a6e; }',
      '.' + P + '-sub { margin: 0; color: #475569; font-size: 13px; }',

      // ── "Everything starts shared" band. Full on open; once anything is
      // copied it folds to a one-line legend so the list gets the room.
      '.' + P + '-band { margin: 14px 24px 0; padding: 14px 16px; border-radius: 10px;',
      '  background: #f0f9ff; border: 1px solid #bae6fd; color: #0c4a6e; }',
      '.' + P + '-band.is-compact { background: #f8fafc; border-color: #e2e8f0; color: #334155;',
      '  padding: 9px 14px; }',
      '.' + P + '-band.is-compact .' + P + '-band-full { display: none; }',
      '.' + P + '-band:not(.is-compact) .' + P + '-band-mini { display: none; }',
      '.' + P + '-band-full { display: flex; gap: 20px; align-items: center; }',
      '.' + P + '-band-full p { margin: 0 0 6px; }',
      '.' + P + '-band-full p:last-child { margin: 0; }',
      '.' + P + '-diag { flex: none; display: flex; align-items: center; gap: 8px; }',
      '.' + P + '-diag-box { padding: 7px 10px; border-radius: 8px; background: #fff;',
      '  border: 1px solid #7dd3fc; text-align: center; line-height: 1.25;',
      '  font: 700 12px/1.25 system-ui, sans-serif; color: #075985; }',
      '.' + P + '-diag-box span { display: block; font-weight: 500; color: #475569; }',
      '.' + P + '-diag-box--mid { background: #0369a1; border-color: #0369a1; color: #fff; }',
      '.' + P + '-diag-box--mid span { color: #e0f2fe; }',
      '.' + P + '-diag-box--new { border-style: dashed; border-color: #0284c7; }',
      '.' + P + '-diag-line { width: 20px; height: 2px; background: #0284c7; }',
      '.' + P + '-band-mini { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; }',
      '.' + P + '-band-mini > span { display: inline-flex; align-items: center; gap: 6px; }',
      '.' + P + '-ic-shared { display: inline-flex; color: #075985; }',
      '.' + P + '-ic-copy { display: inline-flex; color: #5b21b6; }',

      // ── Counters
      '.' + P + '-counts { margin: 12px 24px 0; display: grid;',
      '  grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }',
      '.' + P + '-count { padding: 8px 14px; border-radius: 8px; display: flex;',
      '  align-items: center; gap: 10px; line-height: 1.3; }',
      '.' + P + '-count .n { font: 800 22px/1 system-ui, sans-serif; }',
      '.' + P + '-count--shared { background: #e0f2fe; color: #075985; }',
      '.' + P + '-count--copy { background: #f5f3ff; color: #5b21b6; }',
      '.' + P + '-count--copy.is-on { background: #ede9fe; box-shadow: inset 0 0 0 2px #8b5cf6; }',
      '.' + P + '-count--off { background: #f1f5f9; color: #334155; }',

      // ── Scrolling middle: the model swaps, then the item list.
      '.' + P + '-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 14px 24px 16px; }',
      '.' + P + '-card { border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 14px; }',
      '.' + P + '-card-h { padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;',
      '  border-radius: 10px 10px 0 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
      '.' + P + '-card-h h3 { margin: 0 8px 0 0; font: 700 14px/1.3 system-ui, sans-serif; color: #0f172a; }',
      '.' + P + '-hint { color: #475569; font-size: 12.5px; }',

      // Model swap rows
      '.' + P + '-mrow { display: grid; grid-template-columns: minmax(0, 1fr) 84px 260px;',
      '  gap: 8px 12px; align-items: center; padding: 8px 14px; border-bottom: 1px solid #f1f5f9; }',
      '.' + P + '-mrow:last-child { border-bottom: 0; }',
      '.' + P + '-mrow.is-swapped { background: #faf5ff; }',
      '.' + P + '-mrow.is-extra { display: none; }',
      '.' + P + '-mlist.is-all .' + P + '-mrow.is-extra { display: grid; }',
      '.' + P + '-mname { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.' + P + '-msub { color: #64748b; font-size: 12px; }',
      '.' + P + '-mcount { font-weight: 600; color: #334155; }',
      '.' + P + '-msel { height: 34px; width: 100%; border: 1px solid #cbd5e1; border-radius: 6px;',
      '  padding: 0 8px; background: #fff; color: #334155; font: inherit; font-size: 12.5px; }',
      '.' + P + '-mrow.is-swapped .' + P + '-msel { border: 2px solid #8b5cf6; color: #3b0764; font-weight: 600; }',
      '.' + P + '-mmore { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap;',
      '  gap: 8px 18px; }',
      '.' + P + '-mmore label, .' + P + '-mpick label { display: inline-flex; align-items: center; gap: 6px;',
      '  cursor: pointer; }',
      '.' + P + '-mwhere { font-weight: 700; color: #334155; }',
      '.' + P + '-mcopies { margin-left: auto; color: #5b21b6; font-weight: 700; }',
      // Pick locations or lines: a tick per MDF/IDF that unfolds to a tick per line.
      '.' + P + '-mpick { grid-column: 1 / -1; border-radius: 8px; background: #fff;',
      '  border: 1px solid #e9d5ff; }',
      '.' + P + '-mpick-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px;',
      '  padding: 8px 10px; border-bottom: 1px solid #f3e8ff; background: #faf5ff; border-radius: 8px 8px 0 0; }',
      '.' + P + '-mpick-n { color: #5b21b6; margin-right: 4px; }',
      '.' + P + '-mlocs-list { max-height: 340px; overflow-y: auto; padding: 4px 0; }',
      '.' + P + '-mloc-h { display: flex; align-items: center; gap: 8px; padding: 5px 10px; }',
      '.' + P + '-mloc-h input { margin: 0; }',
      '.' + P + '-mloc-x { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px;',
      '  border: 0; background: transparent; padding: 0; cursor: pointer; text-align: left;',
      '  font: 600 12.5px/1.3 system-ui, sans-serif; color: #1e293b; }',
      '.' + P + '-mloc:not(.is-open) .' + P + '-grp-chev { transform: rotate(-90deg); }',
      '.' + P + '-mloc-n { color: #475569; font-size: 12px; white-space: nowrap; }',
      '.' + P + '-mloc-n.is-some { color: #5b21b6; font-weight: 700; }',
      '.' + P + '-mlines { display: none; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));',
      '  gap: 2px 10px; padding: 2px 10px 8px 36px; }',
      '.' + P + '-mloc.is-open .' + P + '-mlines { display: grid; }',
      '.' + P + '-mline { font-size: 12.5px; padding: 2px 4px; border-radius: 4px; user-select: none; }',
      '.' + P + '-mline span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.' + P + '-mline.is-on { background: #f5f3ff; color: #3b0764; font-weight: 600; }',
      '.' + P + '-mline.is-off span { color: #94a3b8; text-decoration: line-through; }',
      '.' + P + '-mpick-tip { padding: 6px 10px 8px; border-top: 1px solid #f3e8ff; color: #64748b; font-size: 12px; }',
      '.' + P + '-mwarn { grid-column: 1 / -1; display: flex; gap: 8px; align-items: flex-start;',
      '  padding: 8px 10px; border-radius: 6px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }',
      '.' + P + '-mwarn svg { flex: none; color: #b45309; margin-top: 1px; }',
      '.' + P + '-mfoot { padding: 8px 14px; }',
      '.' + P + '-link { border: 0; background: transparent; padding: 0; cursor: pointer;',
      '  color: #0f4c75; font: 600 12.5px/1.4 system-ui, sans-serif; text-decoration: underline; }',

      // Toolbar buttons + filter pills
      '.' + P + '-tbtn { height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid #cbd5e1;',
      '  background: #fff; color: #0f4c75; cursor: pointer; font: 600 12px/1 system-ui, sans-serif; }',
      '.' + P + '-tbtn:hover:not(:disabled) { background: #f1f5f9; }',
      '.' + P + '-pill { height: 28px; padding: 0 11px; border-radius: 999px; border: 1px solid #cbd5e1;',
      '  background: #fff; color: #334155; cursor: pointer; font: 600 12px/1 system-ui, sans-serif; }',
      '.' + P + '-pill.is-on { background: #0f4c75; border-color: #0f4c75; color: #fff; }',
      '.' + P + '-tools-r { margin-left: auto; display: flex; gap: 6px; }',

      // Item list
      '.' + P + '-cols, .' + P + '-row { display: grid;',
      '  grid-template-columns: 22px minmax(0, 1fr) 268px 96px; gap: 10px; align-items: center; }',
      '.' + P + '-cols { padding: 6px 14px; border-bottom: 1px solid #e2e8f0; color: #475569;',
      '  font: 700 10.5px/1.3 system-ui, sans-serif; letter-spacing: .04em; text-transform: uppercase; }',
      // Group header. A wrapper rather than one big button, because it holds
      // TWO controls with different jobs: a checkbox that takes the whole
      // MDF/IDF in or out in one click, and a collapse toggle. Sticky so you
      // always know which location you're scrolled into.
      '.' + P + '-grp {',
      '  position: sticky; top: 0; z-index: 2;',
      '  display: flex; align-items: center; gap: 10px;',
      '  background: #f8fafc; border-bottom: 1px solid #eef2f7; padding: 7px 14px; margin: 0;',
      '}',
      '.' + P + '-grp-cb { margin: 0; flex: 0 0 auto; cursor: pointer; }',
      '.' + P + '-grp-btn {',
      '  flex: 1 1 auto; min-width: 0; display: flex; align-items: center;',
      '  gap: 8px; background: transparent; border: 0; padding: 0; margin: 0;',
      '  cursor: pointer; text-align: left;',
      '  font: 700 10.5px/1.3 system-ui, sans-serif; letter-spacing: .04em;',
      '  text-transform: uppercase; color: #334155;',
      '}',
      '.' + P + '-grp-btn:hover { color: #0f172a; }',
      '.' + P + '-grp-chev { display: inline-flex; transition: transform 120ms ease; color: #94a3b8; }',
      '.' + P + '-grp--closed .' + P + '-grp-chev { transform: rotate(-90deg); }',
      // Collapsed groups still have to report what's ticked inside them.
      '.' + P + '-grp-n { margin-left: auto; font-weight: 600; color: #475569; font-size: 11.5px; }',
      '.' + P + '-grp--closed + .' + P + '-rows { display: none; }',
      '.' + P + '-row { padding: 5px 14px; border-bottom: 1px solid #f1f5f9; }',
      '.' + P + '-row.is-copy { background: #fcfaff; }',
      '.' + P + '-row--off .' + P + '-name, .' + P + '-row--off .' + P + '-sel { opacity: .5; }',
      '.' + P + '-row input[type=checkbox] { margin: 0; }',
      '.' + P + '-grp.is-hidden, .' + P + '-rows.is-hidden, .' + P + '-row.is-hidden { display: none; }',
      '.' + P + '-name { min-width: 0; display: flex; flex-direction: column; }',
      '.' + P + '-name-l { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.' + P + '-was { color: #64748b; font-size: 11.5px; white-space: nowrap; overflow: hidden;',
      '  text-overflow: ellipsis; }',
      '.' + P + '-sel { width: 100%; height: 30px; padding: 0 7px; border: 1px solid #cbd5e1;',
      '  border-radius: 6px; font: inherit; font-size: 12px; background: #fff; color: #0f172a; }',
      '.' + P + '-sel:disabled { background: #f1f5f9; color: #64748b; }',
      // A changed model is what turns a share into a copy — flag it on the
      // control the user touched, in the copy colour.
      '.' + P + '-sel--changed { border: 2px solid #8b5cf6; color: #3b0764; font-weight: 600; }',
      '.' + P + '-chip { justify-self: start; display: inline-flex; align-items: center; gap: 5px;',
      '  padding: 2px 9px; border-radius: 999px; white-space: nowrap;',
      '  font: 700 11.5px/1.5 system-ui, sans-serif; }',
      '.' + P + '-chip--shared { background: #e0f2fe; color: #075985; }',
      '.' + P + '-chip--copy { background: #ede9fe; color: #5b21b6; }',
      '.' + P + '-chip--off { background: #f1f5f9; color: #475569; }',
      '.' + P + '-noshow { padding: 18px 14px; color: #64748b; }',

      // Steps: 1 what goes on it, 2 models, 3 review. A real sequence, so numbered.
      '.' + P + '-steps { margin: 12px 24px 0; display: flex; gap: 6px; flex-wrap: wrap; }',
      '.' + P + '-step { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px 5px 5px;',
      '  border-radius: 999px; border: 1px solid #e2e8f0; background: #fff; color: #475569; cursor: pointer;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; }',
      '.' + P + '-step i { font-style: normal; width: 22px; height: 22px; border-radius: 999px; background: #e2e8f0;',
      '  color: #334155; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; }',
      '.' + P + '-step.is-on { border-color: #0f4c75; color: #0f4c75; box-shadow: inset 0 0 0 1px #0f4c75; }',
      '.' + P + '-step.is-on i { background: #0f4c75; color: #fff; }',
      '.' + P + '-step.is-done i { background: #e0f2fe; color: #075985; }',
      '.' + P + '-step:disabled { cursor: not-allowed; opacity: .55; }',
      // What each step shows.
      '.' + P + '-modal[data-step="1"] [data-alt-swapcard], .' + P + '-modal[data-step="3"] [data-alt-swapcard],',
      '.' + P + '-modal[data-step="3"] [data-alt-itemscard] { display: none; }',
      '.' + P + '-modal:not([data-step="3"]) [data-alt-review] { display: none; }',
      '.' + P + '-modal[data-step="1"] .' + P + '-row, .' + P + '-modal[data-step="1"] .' + P + '-cols {',
      '  grid-template-columns: 22px minmax(0, 1fr) 96px; }',
      '.' + P + '-modal[data-step="1"] .' + P + '-sel, .' + P + '-modal[data-step="1"] .' + P + '-col-model { display: none; }',
      '.' + P + '-modal[data-step="2"] .' + P + '-row > input[type=checkbox], .' + P + '-modal[data-step="2"] .' + P + '-grp-cb {',
      '  visibility: hidden; }',
      '.' + P + '-modal[data-step="2"] [data-alt-filter="off"], .' + P + '-modal[data-step="2"] [data-alt-all],',
      '.' + P + '-modal[data-step="2"] [data-alt-none] { display: none; }',
      '.' + P + '-modal:not([data-step="2"]) [data-alt-reset] { display: none !important; }',
      // Review (step 3): read-only.
      '.' + P + '-review { display: flex; flex-direction: column; gap: 12px; }',
      '.' + P + '-rv-sum { margin: 0; padding: 12px 14px; border-radius: 8px; background: #f8fafc;',
      '  border: 1px solid #e2e8f0; font-size: 14px; color: #0f172a; }',
      '.' + P + '-rv-sec { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }',
      '.' + P + '-rv-h { display: flex; align-items: center; gap: 8px; padding: 9px 14px; font-weight: 700; }',
      '.' + P + '-rv-h .n { font-variant-numeric: tabular-nums; }',
      '.' + P + '-rv-note { padding: 7px 14px; color: #475569; font-size: 12.5px; }',
      '.' + P + '-rv-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 7px 14px;',
      '  border-top: 1px solid #f1f5f9; }',
      '.' + P + '-rv-row .m { min-width: 0; }',
      '.' + P + '-rv-row .c { color: #475569; white-space: nowrap; font-variant-numeric: tabular-nums; }',
      '.' + P + '-rv--shared .' + P + '-rv-h { background: #e0f2fe; color: #075985; }',
      '.' + P + '-rv--copy .' + P + '-rv-h { background: #ede9fe; color: #5b21b6; }',
      '.' + P + '-rv--off .' + P + '-rv-h { background: #f1f5f9; color: #334155; }',
      '.' + P + '-rv-to { color: #5b21b6; font-weight: 600; }',
      '.' + P + '-rv-empty { padding: 7px 14px 10px; color: #64748b; border-top: 1px solid #f1f5f9; }',
      '.' + P + '-foot {',
      '  display: flex; gap: 10px; align-items: center;',
      '  padding: 14px 24px; border-top: 1px solid #eef2f7; flex-wrap: wrap;',
      '}',
      '.' + P + '-foot-note { flex: 1 1 240px; color: #475569; font-size: 12px; }',
      '.' + P + '-btn {',
      '  padding: 10px 16px; border-radius: 6px; cursor: pointer;',
      '  border: 1px solid transparent; font: 600 13px/1.2 system-ui, sans-serif;',
      '}',
      '.' + P + '-btn--cancel { background: #fff; border-color: #cbd5e1; color: #334155; }',
      '.' + P + '-btn--go { background: #0f4c75; color: #fff; font-weight: 700; }',
      '.' + P + '-btn:hover:not(:disabled) { filter: brightness(1.08); }',
      '.' + P + '-btn:disabled { opacity: .5; cursor: not-allowed; }',
      '.' + P + '-empty { padding: 24px 4px; color: #64748b; }'
    ].join('\n');
    document.head.appendChild(s);
  })();

  // ── Reads ────────────────────────────────────────────────

  /** Gate value, MODEL first. The DOM read alone was a flakiness source: it
   *  needs view_3827 to have painted its detail cell, so a sync firing while
   *  that view is mid-render sees '' and silently concludes the button isn't
   *  wanted. The model carries the value as soon as the view has fetched,
   *  whatever the paint is doing. DOM stays as the fallback. */
  function getGateFieldValue() {
    try {
      var v = Knack && Knack.views && Knack.views[GATE_VIEW];
      var a = v && v.model && v.model.attributes;
      if (a) {
        var raw = a[GATE_FIELD + '_raw'];
        if (Array.isArray(raw)) {
          if (raw.length && raw[0]) return String(raw[0].identifier || raw[0].id || '').trim();
        } else if (raw && typeof raw === 'object') {
          var one = String(raw.identifier || raw.id || '').trim();
          if (one) return one;
        } else if (raw != null && String(raw).trim()) {
          return String(raw).replace(/<[^>]*>/g, '').trim();
        }
        var pv = a[GATE_FIELD];
        if (pv != null && String(pv).trim()) {
          return String(pv).replace(/<[^>]*>/g, '').trim();
        }
      }
    } catch (e) { /* fall through to the DOM read */ }

    var view = document.getElementById(GATE_VIEW);
    if (!view) return '';
    var cell = view.querySelector('.kn-detail.' + GATE_FIELD + ' .kn-detail-body');
    if (!cell) return '';
    return (cell.textContent || '').replace(/\u00a0/g, ' ').trim();
  }

  function getSourceSowId() {
    try {
      var v = Knack.views && Knack.views[GATE_VIEW];
      if (v && v.model && v.model.attributes && v.model.attributes.id) {
        return v.model.attributes.id;
      }
    } catch (e) { /* fall through */ }
    return '';
  }

  function getTriggeredBy() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function viewRecords(viewId) {
    var out = [];
    try {
      var v = Knack && Knack.views && Knack.views[viewId];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models) return out;
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes;
        if (a && typeof a.id === 'string' && /^[a-f0-9]{24}$/.test(a.id)) out.push(a);
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  function collectRecordIdsFromView(viewId) {
    var recs = viewRecords(viewId), out = [];
    for (var i = 0; i < recs.length; i++) out.push(recs[i].id);
    return out;
  }

  function refreshView(viewId) {
    return new Promise(function (resolve) {
      try {
        var v = Knack && Knack.views && Knack.views[viewId];
        if (!v || !v.model || typeof v.model.fetch !== 'function') { resolve(); return; }
        v.model.fetch({ success: function () { resolve(); },
                        error:   function () { resolve(); } });
      } catch (e) { resolve(); }
    });
  }

  function conn(rec, key) {
    var raw = rec && rec[key + '_raw'];
    if (Array.isArray(raw)) return raw.length && raw[0] ? raw[0] : null;
    if (raw && raw.id) return raw;
    return null;
  }

  function plain(rec, key) {
    var c = conn(rec, key);
    if (c) return String(c.identifier || '').replace(/<[^>]*>/g, '').trim();
    var v = rec && (rec[key + '_raw'] != null ? rec[key + '_raw'] : rec[key]);
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;',
               '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Product catalog ──────────────────────────────────────
  // Same sources and the same "no bucket data anywhere → universal" rule the
  // worksheet's own product picker uses, so the two offer the same models for
  // a given bucket. Falls back to the products actually in use on this SOW
  // when the Builder maps aren't deployed on this scene — degraded, but a
  // usable list beats a dead dropdown.

  function productsForBucket(bucketId, records) {
    var pmap = (window.SCW && SCW.productMap) || null;
    var bmap = (window.SCW && SCW.productBucketMap) || null;
    var out = [], seen = Object.create(null);

    function allowed(pid, p) {
      if (!bucketId) return true;
      var known = false, hit = false;
      if (p && Array.isArray(p.buckets) && p.buckets.length) {
        known = true;
        if (p.buckets.indexOf(bucketId) !== -1) hit = true;
      }
      if (!hit && bmap) {
        var bl = bmap[pid];
        if (bl && bl.length) {
          known = true;
          if (bl.indexOf(bucketId) !== -1) hit = true;
        }
      }
      return known ? hit : true;
    }

    if (pmap) {
      for (var pid in pmap) {
        var p = pmap[pid];
        if (!allowed(pid, p)) continue;
        var nm = (p && p.name) || '';
        if (!nm) continue;
        if (seen[pid]) continue;
        seen[pid] = 1;
        out.push({ id: pid, label: nm });
      }
    }

    if (!out.length) {
      // In-use fallback: every product paired with THIS bucket somewhere on
      // the SOW. Derived from the rows themselves, so the ids line up.
      for (var r = 0; r < records.length; r++) {
        var rec = records[r];
        var pc = conn(rec, F.product);
        if (!pc || !pc.id || seen[pc.id]) continue;
        var rb = conn(rec, F.bucket);
        if (bucketId && rb && rb.id && rb.id !== bucketId) continue;
        seen[pc.id] = 1;
        out.push({ id: pc.id, label: String(pc.identifier || pc.id).replace(/<[^>]*>/g, '').trim() });
      }
    }

    out.sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label), undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  // ── Candidate rows ───────────────────────────────────────

  /** Parent line items only — anything with a field_2464 parent is an
   *  accessory that travels with its device, and assumption rows have no
   *  model to choose. Grouped + sorted the canonical way (CLAUDE.md picker
   *  rule) via worksheet-v2's exported helpers. */
  function candidateGroups() {
    var recs = viewRecords(ITEMS_VIEW);
    var parents = [];
    for (var i = 0; i < recs.length; i++) {
      if (conn(recs[i], F.parent)) continue;              // accessory — skip
      var b = conn(recs[i], F.bucket);
      if (b && b.id === ASSUMPTIONS_BUCKET) continue;     // assumption — no model
      parents.push(recs[i]);
    }

    var pk = window.SCW && SCW.worksheetV2 && SCW.worksheetV2.picker;
    function itemLabel(rec) {
      var l = plain(rec, F.label), p = plain(rec, F.product);
      if (l && p && p !== l) return l + ' · ' + p;
      return l || p || rec.id;
    }
    var cmp = (pk && typeof pk.canonicalItemSort === 'function')
      ? pk.canonicalItemSort(itemLabel)
      : function (a, b) {
          return String(itemLabel(a)).localeCompare(String(itemLabel(b)),
            undefined, { numeric: true, sensitivity: 'base' });
        };
    var groupBy = (pk && pk.groupByMdfIdf) || function (rec) {
      var m = conn(rec, F.mdfIdf);
      return m && m.id ? { id: m.id, label: String(m.identifier || 'MDF / IDF') }
                       : { id: '__unknown', label: 'No MDF / IDF' };
    };

    var map = Object.create(null), order = [];
    for (var q = 0; q < parents.length; q++) {
      var g = groupBy(parents[q]) || { id: '__unknown', label: 'No MDF / IDF' };
      if (!map[g.id]) { map[g.id] = { id: g.id, label: g.label || '', items: [] }; order.push(g.id); }
      map[g.id].items.push(parents[q]);
    }
    var groups = [];
    for (var o = 0; o < order.length; o++) {
      map[order[o]].items.sort(cmp);
      groups.push(map[order[o]]);
    }
    groups.sort(function (a, b) {
      var au = a.id === '__unknown' ? 1 : 0, bu = b.id === '__unknown' ? 1 : 0;
      if (au !== bu) return au - bu;
      return String(a.label).localeCompare(String(b.label), undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return { groups: groups, all: parents, itemLabel: itemLabel };
  }

  // ── Modal ────────────────────────────────────────────────

  var LINK_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  var COPY_SM_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var WARN_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var CHEV = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="3" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  /** How many model rows show before "Show N more models". */
  var MODELS_SHOWN = 6;

  function closeModal() {
    var b = document.querySelector('.' + P + '-back');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  /** "SOW 1589" + its name, read off the SOW detail view the gate uses. */
  function sourceSowLabel() {
    try {
      var a = Knack.views[GATE_VIEW].model.attributes;
      var id = plain(a, 'field_2122'), name = plain(a, 'field_2126');
      var m = /SW-?\s*(\d+)/i.exec(id) || /SW-?\s*(\d+)/i.exec(name);
      return { num: m ? 'SOW ' + m[1] : 'this SOW', name: name };
    } catch (e) { return { num: 'this SOW', name: '' }; }
  }

  /** One entry per model the candidate rows carry today, most-used first —
   *  the "Swap a model" list. Locations use the SAME group ids the item list
   *  is built from, so a location scope maps straight onto the rows. */
  function modelSummary(built, allRecs) {
    var byId = Object.create(null), order = [];
    for (var g = 0; g < built.groups.length; g++) {
      var grp = built.groups[g];
      for (var i = 0; i < grp.items.length; i++) {
        var rec = grp.items[i];
        var pc = conn(rec, F.product);
        if (!pc || !pc.id) continue;
        var m = byId[pc.id];
        if (!m) {
          m = byId[pc.id] = {
            id: pc.id, name: String(pc.identifier || pc.id).replace(/<[^>]*>/g, '').trim(),
            count: 0, buckets: Object.create(null), locs: [], locIdx: Object.create(null)
          };
          order.push(pc.id);
        }
        m.count++;
        var b = conn(rec, F.bucket);
        if (b && b.id) {
          var bk = m.buckets[b.id] || (m.buckets[b.id] = { n: 0, label: plain({ x_raw: [b] }, 'x') });
          bk.n++;
        }
        if (m.locIdx[grp.id] == null) {
          m.locIdx[grp.id] = m.locs.length;
          m.locs.push({ id: grp.id, label: grp.label || 'No MDF / IDF', count: 0, lines: [] });
        }
        var loc = m.locs[m.locIdx[grp.id]];
        loc.count++;
        // Lines in the item list's own order, so "pick lines" reads like it.
        loc.lines.push({ id: rec.id, label: plain(rec, F.label) || '(unlabelled)' });
      }
    }
    var out = [];
    for (var o = 0; o < order.length; o++) {
      var mm = byId[order[o]], best = null;
      for (var bid in mm.buckets) {
        if (!best || mm.buckets[bid].n > mm.buckets[best].n) best = bid;
      }
      mm.bucketId = best || '';
      mm.bucketLabel = best ? mm.buckets[best].label : '';
      mm.opts = productsForBucket(mm.bucketId, allRecs).filter(function (p) { return p.id !== mm.id; });
      out.push(mm);
    }
    out.sort(function (a, b) {
      return (b.count - a.count) || String(a.name).localeCompare(String(b.name), undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  /** Accessory products under each parent line (the device's mounting
   *  hardware etc.), for the "does it fit the new model?" check. */
  function accessoryIndex(allRecs) {
    var idx = Object.create(null);
    for (var i = 0; i < allRecs.length; i++) {
      var par = conn(allRecs[i], F.parent);
      var pc = conn(allRecs[i], F.product);
      if (!par || !par.id || !pc || !pc.id) continue;
      (idx[par.id] || (idx[par.id] = [])).push(pc.id);
    }
    return idx;
  }

  function ensureOption(sel, id, label) {
    if (!sel || !id) return;
    for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === id) return;
    var o = document.createElement('option');
    o.value = id;
    o.textContent = label || id;
    sel.appendChild(o);
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /** The "Pick locations or lines…" picker of one model row: a tick per
   *  MDF/IDF (all of its lines at once) that unfolds to a tick per line,
   *  Tick all / Untick all, and a count. (A typed label range was tried and
   *  dropped, 2026-11-03: "this lines idea is bad".)
   *  "Change 100 of these 188 readers" is the case it exists for. */
  function pickerHtml(m, i) {
    var locs = '';
    for (var l = 0; l < m.locs.length; l++) {
      var lc = m.locs[l], lines = '';
      for (var k = 0; k < lc.lines.length; k++) {
        lines += '<label class="' + P + '-mline" data-alt-mline-wrap>' +
          '<input type="checkbox" data-alt-mline="' + esc(lc.lines[k].id) + '" checked> ' +
          '<span>' + esc(lc.lines[k].label) + '</span></label>';
      }
      var open = m.locs.length === 1;
      locs +=
        '<div class="' + P + '-mloc' + (open ? ' is-open' : '') + '">' +
          '<div class="' + P + '-mloc-h">' +
            '<input type="checkbox" data-alt-mloc="' + esc(lc.id) + '" checked ' +
              'aria-label="Every line in ' + esc(lc.label) + '">' +
            '<button type="button" class="' + P + '-mloc-x" data-alt-mloc-x aria-expanded="' + open + '">' +
              '<span class="' + P + '-grp-chev">' + CHEV + '</span><span>' + esc(lc.label) + '</span></button>' +
            '<span class="' + P + '-mloc-n" data-alt-mloc-n></span>' +
          '</div>' +
          '<div class="' + P + '-mlines" data-alt-mlines>' + lines + '</div>' +
        '</div>';
    }
    return '<div class="' + P + '-mpick" data-alt-mlocs style="display:none">' +
        '<div class="' + P + '-mpick-bar">' +
          '<b class="' + P + '-mpick-n" data-alt-mpick-n></b>' +
          '<button type="button" class="' + P + '-tbtn" data-alt-mpick-set="1">Tick all</button>' +
          '<button type="button" class="' + P + '-tbtn" data-alt-mpick-set="0">Untick all</button>' +
        '</div>' +
        '<div class="' + P + '-mlocs-list">' + locs + '</div>' +
        '<div class="' + P + '-mpick-tip">Ticked lines take the new model; the rest stay shared. ' +
          'Open a location to tick single lines. Shift-click ticks every line between two clicks.</div>' +
      '</div>';
  }

  function modelRowHtml(m, i, sowNum) {
    var opts = '<option value="">Keep this model (shared)</option>' +
      '<option value="__mixed" disabled>Set per row below</option>';
    for (var q = 0; q < m.opts.length; q++) {
      opts += '<option value="' + esc(m.opts[q].id) + '">' + esc(m.opts[q].label) + '</option>';
    }
    var sub = (m.bucketLabel ? esc(m.bucketLabel) + ' · ' : '') + plural(m.locs.length, 'location');
    return '<div class="' + P + '-mrow' + (i >= MODELS_SHOWN ? ' is-extra' : '') + '" data-alt-model="' + esc(m.id) + '">' +
        '<div style="min-width:0">' +
          '<div class="' + P + '-mname" title="' + esc(m.name) + '">' + esc(m.name) + '</div>' +
          '<div class="' + P + '-msub">' + sub + '</div>' +
        '</div>' +
        '<div class="' + P + '-mcount">' + plural(m.count, 'line') + '</div>' +
        '<select class="' + P + '-msel" data-alt-msel aria-label="Model to use on the alternate instead of ' + esc(m.name) + '">' +
          opts + '</select>' +
        '<div class="' + P + '-mmore" data-alt-mmore' + (m.count > 1 ? '' : ' style="display:none"') + '>' +
          '<span class="' + P + '-mwhere" data-alt-mscope-wrap>Which lines</span>' +
          '<label data-alt-mscope-wrap><input type="radio" name="scw-alt-where-' + i + '" value="all" data-alt-mscope checked> ' +
            'All ' + plural(m.count, 'line') + '</label>' +
          (m.count > 1
            ? '<label data-alt-mscope-wrap><input type="radio" name="scw-alt-where-' + i + '" value="pick" data-alt-mscope> ' +
                (m.locs.length > 1 ? 'Pick locations or lines…' : 'Pick lines…') + '</label>'
            : '') +
          '<span class="' + P + '-mcopies" data-alt-mcopies></span>' +
          '<button type="button" class="' + P + '-tbtn" data-alt-mkeep style="display:none" ' +
            'title="Every line keeps this model and stays shared with ' + esc(sowNum) + '">Keep current model</button>' +
        '</div>' +
        (m.count > 1 ? pickerHtml(m, i) : '') +
        '<div class="' + P + '-mwarn" data-alt-mwarn style="display:none"></div>' +
      '</div>';
  }

  function openModal(btn) {
    var built = candidateGroups();
    if (!built.all.length) {
      alert('No line items found on this SOW to build an alternate from.');
      setBtnLoading(btn, false);
      return;
    }
    var allRecs = viewRecords(ITEMS_VIEW);
    var sow = sourceSowLabel();
    var models = modelSummary(built, allRecs);
    var accIdx = accessoryIndex(allRecs);
    var total = built.all.length;
    var filter = 'all';

    closeModal();
    var back = document.createElement('div');
    back.className = P + '-back';
    back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });

    var modal = document.createElement('div');
    modal.className = P + '-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', P + '-title');

    var step = 1;

    function swapBodyHtml(ms) {
      if (!ms.length) return '<div class="' + P + '-noshow">No line on the alternate has a model to change.</div>';
      var h = '';
      for (var mi = 0; mi < ms.length; mi++) h += modelRowHtml(ms[mi], mi, sow.num);
      var extra = Math.max(0, ms.length - MODELS_SHOWN);
      return '<div class="' + P + '-mlist" data-alt-mlist>' + h + '</div>' +
        (extra ? '<div class="' + P + '-mfoot"><button type="button" class="' + P + '-link" data-alt-mall>' +
          'Show ' + plural(extra, 'more model') + '</button></div>' : '');
    }

    modal.innerHTML =
      '<div class="' + P + '-head">' +
        '<h3 class="' + P + '-title" id="' + P + '-title">Create Alternate SOW</h3>' +
        '<p class="' + P + '-sub">Starts from ' + esc(sow.num) + (sow.name ? ' · ' + esc(sow.name) : '') + '</p>' +
      '</div>' +
      '<div class="' + P + '-steps" role="list" aria-label="Steps">' +
        '<button type="button" class="' + P + '-step" role="listitem" data-alt-stepnav="1"><i>1</i>What goes on the alternate</button>' +
        '<button type="button" class="' + P + '-step" role="listitem" data-alt-stepnav="2"><i>2</i>New models</button>' +
        '<button type="button" class="' + P + '-step" role="listitem" data-alt-stepnav="3"><i>3</i>Review and create</button>' +
      '</div>' +
      '<div class="' + P + '-band" data-alt-band>' +
        '<div class="' + P + '-band-full">' +
          '<div class="' + P + '-diag" aria-hidden="true">' +
            '<div class="' + P + '-diag-box">' + esc(sow.num) + '<span>this SOW</span></div>' +
            '<div class="' + P + '-diag-line"></div>' +
            '<div class="' + P + '-diag-box ' + P + '-diag-box--mid">' + plural(total, 'line item') + '<span>one record each</span></div>' +
            '<div class="' + P + '-diag-line"></div>' +
            '<div class="' + P + '-diag-box ' + P + '-diag-box--new">New alternate<span>same records</span></div>' +
          '</div>' +
          '<div>' +
            '<p><b>Everything starts shared.</b> The alternate points at the same line items as ' +
              esc(sow.num) + '. Change a shared item on either SOW (price, quantity, notes, photos) ' +
              'and it changes on both.</p>' +
            '<p>Want the alternate to differ? <b>Swap a model below.</b> Those items become ' +
              '<b>copies</b> that only the alternate edits.</p>' +
          '</div>' +
        '</div>' +
        '<div class="' + P + '-band-mini">' +
          '<span><span class="' + P + '-ic-shared">' + LINK_SVG + '</span><b>Shared</b> one record on both SOWs: edit either, both change</span>' +
          '<span><span class="' + P + '-ic-copy">' + COPY_SM_SVG + '</span><b>Copy</b> the alternate’s own record; ' +
            esc(sow.num) + ' keeps its original</span>' +
        '</div>' +
      '</div>' +
      '<div class="' + P + '-counts">' +
        '<div class="' + P + '-count ' + P + '-count--shared"><span class="n" data-alt-n-shared>0</span>' +
          '<span><b>Shared</b><br>with ' + esc(sow.num) + '</span></div>' +
        '<div class="' + P + '-count ' + P + '-count--copy" data-alt-c-copy><span class="n" data-alt-n-copy>0</span>' +
          '<span><b>Copies</b><br>alternate only</span></div>' +
        '<div class="' + P + '-count ' + P + '-count--off"><span class="n" data-alt-n-off>0</span>' +
          '<span><b>Left off</b><br>not on the alternate</span></div>' +
      '</div>' +
      '<div class="' + P + '-scroll" data-alt-scroll>' +
        '<div class="' + P + '-card" data-alt-swapcard>' +
          '<div class="' + P + '-card-h"><h3>Which of these get a new model?</h3>' +
            '<span class="' + P + '-hint">Choose a new model for all of a model, or only the locations or lines you pick ' +
            'under it. Lines with a new model become copies; the rest stay shared.</span></div>' +
          '<div data-alt-swapbody>' + swapBodyHtml(models) + '</div>' +
        '</div>' +
        '<div class="' + P + '-card" data-alt-itemscard>' +
          '<div class="' + P + '-card-h"><h3 data-alt-items-title>What goes on the alternate?</h3>' +
            '<span class="' + P + '-hint" data-alt-items-hint></span>' +
            '<button type="button" class="' + P + '-pill is-on" data-alt-filter="all">All</button>' +
            '<button type="button" class="' + P + '-pill" data-alt-filter="shared">Shared</button>' +
            '<button type="button" class="' + P + '-pill" data-alt-filter="copy">Copies</button>' +
            '<button type="button" class="' + P + '-pill" data-alt-filter="off">Left off</button>' +
            '<span class="' + P + '-tools-r">' +
              '<button type="button" class="' + P + '-tbtn" data-alt-reset style="display:none" ' +
                'title="Put every model back to the one the item uses on ' + esc(sow.num) +
                ', so nothing is copied">Revert to current models</button>' +
              '<button type="button" class="' + P + '-tbtn" data-alt-all>Select all</button>' +
              '<button type="button" class="' + P + '-tbtn" data-alt-none>Select none</button>' +
            '</span>' +
          '</div>' +
          '<div class="' + P + '-cols"><span></span><span>Item</span><span class="' + P + '-col-model">Model on the alternate</span>' +
            '<span>On the alternate</span></div>' +
          '<div data-alt-body></div>' +
          '<div class="' + P + '-noshow" data-alt-noshow style="display:none">No items in this view.</div>' +
        '</div>' +
        '<div class="' + P + '-review" data-alt-review></div>' +
      '</div>' +
      '<div class="' + P + '-foot">' +
        '<span class="' + P + '-foot-note" data-alt-footnote></span>' +
        '<button type="button" class="' + P + '-btn ' + P + '-btn--cancel" data-alt-cancel>Cancel</button>' +
        '<button type="button" class="' + P + '-btn ' + P + '-btn--go" data-alt-go>Create alternate SOW</button>' +
      '</div>';

    var body = modal.querySelector('[data-alt-body]');
    for (var g = 0; g < built.groups.length; g++) {
      var grp = built.groups[g];
      var h = document.createElement('div');
      h.className = P + '-grp';
      h.innerHTML =
        '<input type="checkbox" class="' + P + '-grp-cb" data-alt-grp-cb checked ' +
          'title="Take this whole MDF/IDF in or out" ' +
          'aria-label="Carry every item in ' + esc(grp.label || 'this group') + '">' +
        '<button type="button" class="' + P + '-grp-btn" data-alt-grp>' +
          '<span class="' + P + '-grp-chev">' + CHEV + '</span>' +
          '<span>' + esc(grp.label || 'Unassigned') + '</span>' +
        '</button>' +
        '<span class="' + P + '-grp-n" data-alt-grp-n></span>';
      body.appendChild(h);
      var rowsWrap = document.createElement('div');
      rowsWrap.className = P + '-rows';
      for (var i = 0; i < grp.items.length; i++) {
        var rowEl = buildRow(grp.items[i], allRecs, sow.num);
        rowEl.setAttribute('data-alt-loc', grp.id);
        rowsWrap.appendChild(rowEl);
      }
      body.appendChild(rowsWrap);
    }

    back.appendChild(modal);
    document.body.appendChild(back);
    setBtnLoading(btn, false);

    var goBtn    = modal.querySelector('[data-alt-go]');
    var resetBtn = modal.querySelector('[data-alt-reset]');
    var band     = modal.querySelector('[data-alt-band]');

    function rows() { return body.querySelectorAll('[data-alt-row]'); }

    function readRow(row) {
      var cb  = row.querySelector('input[type=checkbox]');
      var sel = row.querySelector('select');
      var from = row.getAttribute('data-from-id') || '';
      var to   = sel ? sel.value : from;
      return {
        id:      row.getAttribute('data-alt-row'),
        on:      !!(cb && cb.checked),
        fromId:  from,
        toId:    to,
        changed: !!(to && from && to !== from),
        fromName: row.getAttribute('data-from-name') || '',
        toName:  sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent : ''
      };
    }
    function stateOf(st) { return !st.on ? 'off' : (st.changed ? 'copy' : 'shared'); }

    function rowOn(row) {
      var cb = row.querySelector('input[type=checkbox]');
      return !!(cb && cb.checked);
    }

    // Step 2 works only on the lines step 1 put on the alternate.
    function rowsOfModel(mid) {
      var out = [], rs = rows();
      for (var i = 0; i < rs.length; i++) if (rs[i].getAttribute('data-from-id') === mid && rowOn(rs[i])) out.push(rs[i]);
      return out;
    }

    /** Rebuild the model list from the carried lines (entering step 2). The
     *  rows keep any model already chosen, and paintModel reads it back. */
    function rebuildSwap() {
      var on = Object.create(null), rs = rows();
      for (var i = 0; i < rs.length; i++) if (rowOn(rs[i])) on[rs[i].getAttribute('data-alt-row')] = true;
      var carried = { groups: [] };
      for (var g = 0; g < built.groups.length; g++) {
        var items = built.groups[g].items.filter(function (rec) { return on[rec.id]; });
        if (items.length) carried.groups.push({ id: built.groups[g].id, label: built.groups[g].label, items: items });
      }
      models = modelSummary(carried, allRecs);
      modal.querySelector('[data-alt-swapbody]').innerHTML = swapBodyHtml(models);
    }

    /** Step 3: what the alternate will be, read-only. */
    function reviewHtml() {
      var rs = rows(), sec = { shared: {}, copy: {}, off: {} }, n = { shared: 0, copy: 0, off: 0 };
      var bad = 0, cat = window.SCW && SCW.catalog;
      for (var i = 0; i < rs.length; i++) {
        var st = readRow(rs[i]), kind = stateOf(st);
        n[kind]++;
        var key = kind === 'copy' ? st.fromName + '\u0000' + st.toName : st.fromName;
        var e = sec[kind][key] || (sec[kind][key] = { from: st.fromName || '(no model)', to: st.toName, n: 0, locs: {} });
        e.n++;
        e.locs[rs[i].getAttribute('data-alt-loc') || ''] = 1;
        if (kind === 'copy' && cat && typeof cat.fits === 'function') {
          var accs = accIdx[st.id] || [];
          for (var a = 0; a < accs.length; a++) if (cat.fits(accs[a], st.toId) === false) { bad++; break; }
        }
      }
      var carried = n.shared + n.copy;
      var sum = carried
        ? 'The alternate will have <b>' + plural(carried, 'line item') + '</b>: ' +
          (n.shared ? '<b style="color:#075985">' + n.shared + ' shared</b> with ' + esc(sow.num) : '') +
          (n.shared && n.copy ? ' and ' : '') +
          (n.copy ? '<b style="color:#5b21b6">' + plural(n.copy, 'copy', 'copies') + '</b> with a new model' : '') + '.' +
          (n.off ? ' <b>' + n.off + '</b> of ' + esc(sow.num) + '’s line items ' + (n.off === 1 ? 'stays' : 'stay') + ' off it.' : '')
        : 'Nothing is going on the alternate. Go back to step 1 and tick what it should carry.';
      function list(kind) {
        var keys = Object.keys(sec[kind]).sort(function (a, b) { return sec[kind][b].n - sec[kind][a].n; });
        if (!keys.length) return '<div class="' + P + '-rv-empty">None.</div>';
        return keys.map(function (k) {
          var e = sec[kind][k], nl = Object.keys(e.locs).length;
          var name = kind === 'copy'
            ? esc(e.from) + ' → <span class="' + P + '-rv-to">' + esc(e.to) + '</span>'
            : esc(e.from);
          return '<div class="' + P + '-rv-row"><span class="m">' + name + '</span>' +
            '<span class="c">' + plural(e.n, 'line') + ' · ' + plural(nl, 'location') + '</span></div>';
        }).join('');
      }
      function section(kind, icon, title, note) {
        return '<div class="' + P + '-rv-sec ' + P + '-rv--' + kind + '">' +
          '<div class="' + P + '-rv-h">' + icon + '<span>' + title + '</span><span class="n">' + n[kind] + '</span></div>' +
          '<div class="' + P + '-rv-note">' + note + '</div>' + list(kind) + '</div>';
      }
      return '<p class="' + P + '-rv-sum">' + sum + '</p>' +
        section('shared', LINK_SVG, 'Shared with ' + esc(sow.num),
          'One record on both SOWs. A change to one of these on either SOW shows on both.') +
        section('copy', COPY_SM_SVG, 'Copies with a new model',
          'The alternate gets its own record with the new model. ' + esc(sow.num) + ' keeps its original, unchanged.') +
        (bad ? '<div class="' + P + '-mwarn">' + WARN_SVG + '<span>On ' + plural(bad, 'copied line') +
          ' the attached mounting hardware isn’t listed as fitting the new model. Check it on the alternate.</span></div>' : '') +
        section('off', '', 'Left off', 'Not on the alternate. ' + esc(sow.num) + ' keeps them as they are.');
    }

    function setStep(nStep) {
      step = nStep;
      modal.setAttribute('data-step', String(step));
      if (step === 2) {
        rebuildSwap();
        if (filter === 'off') filter = 'all';
      }
      if (step === 3) modal.querySelector('[data-alt-review]').innerHTML = reviewHtml();
      var sc = modal.querySelector('[data-alt-scroll]');
      if (sc) sc.scrollTop = 0;
      repaint();
    }

    /** Push a model row's choice (target + where) onto its item rows. The
     *  item rows stay the one source of truth; this only sets their selects. */
    function applyModel(mrow, force) {
      var mid = mrow.getAttribute('data-alt-model');
      var sel = mrow.querySelector('[data-alt-msel]');
      var target = sel.value;
      if (target === '__mixed') return;
      // No new model yet: picking lines (or All / Pick) only prepares the
      // pick. Only an explicit "keep" (the select back on Keep, or the Keep
      // button) puts the rows back, so a row set by hand below survives.
      if (!target && !force) return;
      var label = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent : '';
      var pickEl = mrow.querySelector('[data-alt-mscope][value=pick]');
      var pick = !!(pickEl && pickEl.checked);
      var lineOn = linesOn(mrow);
      var rs = rowsOfModel(mid);
      for (var i = 0; i < rs.length; i++) {
        var inScope = !!target && (!pick || !!lineOn[rs[i].getAttribute('data-alt-row')]);
        var rsel = rs[i].querySelector('select');
        if (!rsel) continue;
        if (inScope) { ensureOption(rsel, target, label); rsel.value = target; }
        else rsel.value = mid;
      }
    }

    /** row id → ticked, from a model row's line picker. */
    function linesOn(mrow) {
      var on = Object.create(null);
      var ls = mrow.querySelectorAll('[data-alt-mline]');
      for (var l = 0; l < ls.length; l++) on[ls[l].getAttribute('data-alt-mline')] = ls[l].checked;
      return on;
    }

    function setLines(mrow, on, onlyIn) {
      var ls = (onlyIn || mrow).querySelectorAll('[data-alt-mline]');
      for (var l = 0; l < ls.length; l++) ls[l].checked = on;
    }

    function resetModelControls(mrow) {
      var sel = mrow.querySelector('[data-alt-msel]');
      if (sel) sel.value = '';
      var all = mrow.querySelector('[data-alt-mscope][value=all]');
      if (all) all.checked = true;
      setLines(mrow, true);
    }

    /** Reflect the item rows back onto one model row: its select, the
     *  where controls, the copy count and the mounting-hardware check. */
    function paintModel(mrow) {
      var mid = mrow.getAttribute('data-alt-model');
      var sel = mrow.querySelector('[data-alt-msel]');
      var rs = rowsOfModel(mid);
      var targets = Object.create(null), nTargets = 0, copied = 0, copiedOn = 0, lastTarget = '';
      for (var i = 0; i < rs.length; i++) {
        var st = readRow(rs[i]);
        if (!st.changed) continue;
        copied++;
        if (st.on) copiedOn++;
        if (!targets[st.toId]) { targets[st.toId] = 1; nTargets++; lastTarget = st.toId; }
      }
      var pickEl = mrow.querySelector('[data-alt-mscope][value=pick]');
      var pick = !!(pickEl && pickEl.checked);
      var derived;
      if (!copied) {
        derived = (pick && sel.value && sel.value !== '__mixed') ? sel.value : '';
      } else if (nTargets === 1) {
        // One target: the model row's own swap, whether it covers every line
        // or some. Some lines (picked here or set row by row below) is the
        // picker's state, so show it there.
        derived = lastTarget;
        if (copied < rs.length && pickEl && !pick) { pickEl.checked = true; pick = true; }
      } else {
        derived = '__mixed';   // two or more new models: only the rows can say it
      }
      // The rows are the truth once a model is chosen; the picker mirrors
      // them. Before that, the ticks are the user's pick and stay as set.
      if (pick && derived && derived !== '__mixed') {
        var byId = Object.create(null);
        for (var r = 0; r < rs.length; r++) byId[rs[r].getAttribute('data-alt-row')] = rs[r];
        var ls = mrow.querySelectorAll('[data-alt-mline]');
        for (var x = 0; x < ls.length; x++) {
          var lr = byId[ls[x].getAttribute('data-alt-mline')];
          var lst = lr ? readRow(lr) : null;
          ls[x].checked = !!(lst && lst.changed);
          var lw = ls[x].closest('[data-alt-mline-wrap]');
          if (lw) {
            lw.classList.toggle('is-on', ls[x].checked);
            lw.classList.toggle('is-off', !!(lst && !lst.on));
            lw.title = lst && !lst.on ? 'Left off the alternate (ticked in the list below)' : '';
          }
        }
      }
      var picked = 0;
      if (pick && derived !== '__mixed') {
        var lsAll = mrow.querySelectorAll('[data-alt-mline]');
        for (var la = 0; la < lsAll.length; la++) {
          var lwa = lsAll[la].closest('[data-alt-mline-wrap]');
          if (lwa) lwa.classList.toggle('is-on', lsAll[la].checked);
        }
        var locsW = mrow.querySelectorAll('.' + P + '-mloc');
        for (var w2 = 0; w2 < locsW.length; w2++) {
          var lls = locsW[w2].querySelectorAll('[data-alt-mline]'), on = 0;
          for (var y = 0; y < lls.length; y++) if (lls[y].checked) on++;
          picked += on;
          var lcb = locsW[w2].querySelector('[data-alt-mloc]');
          if (lcb) { lcb.checked = on > 0 && on === lls.length; lcb.indeterminate = on > 0 && on < lls.length; }
          var ln = locsW[w2].querySelector('[data-alt-mloc-n]');
          if (ln) {
            ln.textContent = on + ' of ' + lls.length;
            ln.classList.toggle('is-some', on > 0);
          }
        }
        var pn = mrow.querySelector('[data-alt-mpick-n]');
        if (pn) pn.textContent = picked + ' of ' + plural(rs.length, 'line') + ' picked';
      }
      if (derived && derived !== '__mixed') {
        var lbl = '';
        var rsel0 = rs.length ? rs[0].querySelector('select') : null;
        if (rsel0) for (var o = 0; o < rsel0.options.length; o++) if (rsel0.options[o].value === derived) lbl = rsel0.options[o].textContent;
        ensureOption(sel, derived, lbl);
      }
      sel.value = derived;

      var swapped = !!derived;
      mrow.classList.toggle('is-swapped', swapped);
      var more = mrow.querySelector('[data-alt-mmore]');
      if (more) more.style.display = (swapped || rs.length > 1) ? '' : 'none';
      var scopes = mrow.querySelectorAll('[data-alt-mscope-wrap]');
      for (var s = 0; s < scopes.length; s++) scopes[s].style.display = derived === '__mixed' ? 'none' : '';
      var keepBtn = mrow.querySelector('[data-alt-mkeep]');
      if (keepBtn) keepBtn.style.display = swapped ? '' : 'none';
      var locsEl = mrow.querySelector('[data-alt-mlocs]');
      if (locsEl) locsEl.style.display = (pick && derived !== '__mixed') ? '' : 'none';
      var cEl = mrow.querySelector('[data-alt-mcopies]');
      if (cEl) {
        cEl.textContent = copiedOn ? (plural(copiedOn, 'line') + ' become ' + (copiedOn === 1 ? 'a copy' : 'copies'))
          : (pick && !derived) ? (picked ? 'Now choose the new model for these ' + plural(picked, 'line') : 'Tick the lines, then choose the new model')
          : '';
      }

      // Mounting hardware the catalog says does not fit the new model.
      var warn = mrow.querySelector('[data-alt-mwarn]');
      var bad = 0;
      var cat = window.SCW && SCW.catalog;
      if (swapped && derived !== '__mixed' && cat && typeof cat.fits === 'function') {
        for (var w = 0; w < rs.length; w++) {
          var wst = readRow(rs[w]);
          if (!wst.on || !wst.changed) continue;
          var accs = accIdx[wst.id] || [];
          for (var a = 0; a < accs.length; a++) {
            if (cat.fits(accs[a], derived) === false) { bad++; break; }
          }
        }
      }
      if (warn) {
        if (bad) {
          warn.style.display = '';
          warn.innerHTML = WARN_SVG + '<span>On ' + bad + ' of these lines' +
            ' the attached mounting hardware isn’t listed as fitting the new model. ' +
            'Check it on the alternate.</span>';
        } else {
          warn.style.display = 'none';
          warn.innerHTML = '';
        }
      }
    }

    function repaint() {
      var rs = rows(), counts = { shared: 0, copy: 0, off: 0 }, anyChanged = false, visible = 0;
      for (var i = 0; i < rs.length; i++) {
        var st = readRow(rs[i]);
        var state = stateOf(st);
        counts[state]++;
        if (st.changed) anyChanged = true;
        rs[i].classList.toggle(P + '-row--off', !st.on);
        rs[i].classList.toggle('is-copy', state === 'copy');
        var show = (filter === 'all' || filter === state) && !(step === 2 && !st.on);
        rs[i].classList.toggle('is-hidden', !show);
        if (show) visible++;
        var sel = rs[i].querySelector('select');
        if (sel) {
          sel.disabled = !st.on;
          sel.classList.toggle(P + '-sel--changed', st.on && st.changed);
        }
        var chip = rs[i].querySelector('[data-alt-chip]');
        if (chip) {
          chip.className = P + '-chip ' + P + '-chip--' + state;
          chip.innerHTML = state === 'copy' ? COPY_SM_SVG + 'Copy'
            : state === 'shared' ? LINK_SVG + 'Shared' : 'Left off';
          chip.title = state === 'copy' ? 'The alternate gets its own copy with this model; ' + sow.num + ' keeps its original.'
            : state === 'shared' ? 'One record on both SOWs: a change on either SOW changes both.'
            : 'Not on the alternate.';
        }
        var was = rs[i].querySelector('[data-alt-was]');
        if (was) {
          if (st.on && st.changed && st.fromName) {
            was.style.display = '';
            was.textContent = sow.num + ' keeps: ' + st.fromName;
            was.title = was.textContent;
          } else {
            was.style.display = 'none';
          }
        }
      }

      modal.querySelector('[data-alt-n-shared]').textContent = counts.shared;
      modal.querySelector('[data-alt-n-copy]').textContent = counts.copy;
      modal.querySelector('[data-alt-n-off]').textContent = counts.off;
      modal.querySelector('[data-alt-c-copy]').classList.toggle('is-on', counts.copy > 0);
      band.classList.toggle('is-compact', counts.copy > 0);

      var pills = modal.querySelectorAll('[data-alt-filter]');
      var pillN = { all: rs.length, shared: counts.shared, copy: counts.copy, off: counts.off };
      var pillL = { all: 'All', shared: 'Shared', copy: 'Copies', off: 'Left off' };
      for (var p = 0; p < pills.length; p++) {
        var k = pills[p].getAttribute('data-alt-filter');
        pills[p].textContent = pillL[k] + ' ' + pillN[k];
        pills[p].classList.toggle('is-on', k === filter);
        pills[p].setAttribute('aria-pressed', k === filter ? 'true' : 'false');
      }
      var noshow = modal.querySelector('[data-alt-noshow]');
      if (noshow) noshow.style.display = visible ? 'none' : '';
      if (resetBtn) resetBtn.style.display = anyChanged ? '' : 'none';

      // Group tallies — a collapsed section still has to report what's ticked
      // inside it, or collapsing hides decisions instead of just rows.
      var heads = body.querySelectorAll('.' + P + '-grp');
      for (var gi = 0; gi < heads.length; gi++) {
        var wrap = heads[gi].nextElementSibling;
        if (!wrap) continue;
        var grs = wrap.querySelectorAll('[data-alt-row]');
        var gOn = 0, gCopy = 0, gVis = 0;
        for (var gr = 0; gr < grs.length; gr++) {
          var gst = readRow(grs[gr]);
          if (gst.on) { gOn++; if (gst.changed) gCopy++; }
          if (!grs[gr].classList.contains('is-hidden')) gVis++;
        }
        var n = heads[gi].querySelector('[data-alt-grp-n]');
        if (n) n.textContent = gOn + ' of ' + grs.length + ' carried' + (gCopy ? (' · ' + plural(gCopy, 'copy', 'copies')) : '');
        heads[gi].classList.toggle('is-hidden', !gVis);
        wrap.classList.toggle('is-hidden', !gVis);
        // Reflect the rows back onto the group box, including the partial case.
        var gcbEl = heads[gi].querySelector('[data-alt-grp-cb]');
        if (gcbEl) {
          gcbEl.checked = (gOn > 0 && gOn === grs.length);
          gcbEl.indeterminate = (gOn > 0 && gOn < grs.length);
        }
      }

      var mrows = modal.querySelectorAll('[data-alt-model]');
      for (var m = 0; m < mrows.length; m++) paintModel(mrows[m]);

      var carried = counts.shared + counts.copy;
      goBtn.disabled = carried === 0;
      goBtn.textContent = step === 1 ? 'Next: new models'
        : step === 2 ? 'Next: review'
        : carried ? 'Create alternate · ' + [counts.shared ? counts.shared + ' shared' : '',
            counts.copy ? plural(counts.copy, 'copy', 'copies') : ''].filter(Boolean).join(' · ')
        : 'Create alternate SOW';
      var cancelBtn = modal.querySelector('[data-alt-cancel]');
      if (cancelBtn) cancelBtn.textContent = step === 1 ? 'Cancel' : 'Back';
      var fn = modal.querySelector('[data-alt-footnote]');
      if (fn) {
        fn.textContent = step === 1 ? plural(carried, 'line') + ' of ' + total + ' go on the alternate. Accessories travel with their device; assumptions aren’t listed.'
          : step === 2 ? counts.shared + ' shared · ' + plural(counts.copy, 'copy', 'copies') + '. Nothing is created until step 3.'
          : 'Nothing is created until you click Create.';
      }
      var it = modal.querySelector('[data-alt-items-title]');
      if (it) it.textContent = step === 1 ? 'What goes on the alternate?' : 'Lines on the alternate';
      var ih = modal.querySelector('[data-alt-items-hint]');
      if (ih) ih.textContent = step === 1 ? 'Untick anything the alternate should leave out.' : '';
      var navs = modal.querySelectorAll('[data-alt-stepnav]');
      for (var sn = 0; sn < navs.length; sn++) {
        var k = +navs[sn].getAttribute('data-alt-stepnav');
        navs[sn].classList.toggle('is-on', k === step);
        navs[sn].classList.toggle('is-done', k < step);
        navs[sn].disabled = k > 1 && carried === 0;
        if (k === step) navs[sn].setAttribute('aria-current', 'step'); else navs[sn].removeAttribute('aria-current');
      }
    }

    back.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var mrow = t.closest('[data-alt-model]');
      if (mrow && t.hasAttribute('data-alt-mscope')) {
        // "Pick…" opens empty: nothing is a copy until a line is ticked.
        if (t.value === 'pick' && t.checked) setLines(mrow, false);
        applyModel(mrow);
        repaint();
        return;
      }
      if (mrow && t.hasAttribute('data-alt-mloc')) {
        setLines(mrow, t.checked, t.closest('.' + P + '-mloc'));
        applyModel(mrow);
        repaint();
        return;
      }
      if (mrow && (t.hasAttribute('data-alt-msel') || t.hasAttribute('data-alt-mline'))) {
        applyModel(mrow, t.hasAttribute('data-alt-msel'));
        repaint();
        return;
      }
      // A group checkbox drives its whole section, then the normal repaint
      // recomputes every tally from the rows.
      var gcb = t.closest('[data-alt-grp-cb]');
      if (gcb) {
        var wrapEl = gcb.closest('.' + P + '-grp');
        var rowsWrap = wrapEl && wrapEl.nextElementSibling;
        if (rowsWrap) {
          var grs = rowsWrap.querySelectorAll('[data-alt-row]');
          for (var i = 0; i < grs.length; i++) {
            var cb = grs[i].querySelector('input[type=checkbox]');
            if (cb) cb.checked = gcb.checked;
          }
        }
      }
      repaint();
    });
    back.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-alt-cancel]')) { if (step === 1) closeModal(); else setStep(step - 1); return; }
      var nav = t.closest('[data-alt-stepnav]');
      if (nav) { if (!nav.disabled) setStep(+nav.getAttribute('data-alt-stepnav')); return; }
      if (t.closest('[data-alt-all]') || t.closest('[data-alt-none]')) {
        var on = !!t.closest('[data-alt-all]');
        var rs = rows();
        for (var i = 0; i < rs.length; i++) {
          var cb = rs[i].querySelector('input[type=checkbox]');
          if (cb) cb.checked = on;
        }
        repaint(); return;
      }
      var fp = t.closest('[data-alt-filter]');
      if (fp) { filter = fp.getAttribute('data-alt-filter') || 'all'; repaint(); return; }
      var mall = t.closest('[data-alt-mall]');
      if (mall) {
        var list = modal.querySelector('[data-alt-mlist]');
        var openAll = list && !list.classList.contains('is-all');
        if (list) list.classList.toggle('is-all', openAll);
        mall.textContent = openAll ? 'Show fewer models'
          : 'Show ' + plural(Math.max(0, models.length - MODELS_SHOWN), 'more model');
        return;
      }
      // Shift-click a line: tick (or untick) every OPEN line between it and
      // the last line clicked in this model's picker.
      var ml = t.hasAttribute && t.hasAttribute('data-alt-mline') ? t : null;
      if (ml) {
        var mrowL = ml.closest('[data-alt-model]');
        var open = [];
        var all = mrowL.querySelectorAll('[data-alt-mline]');
        for (var a = 0; a < all.length; a++) {
          var lw = all[a].closest('.' + P + '-mloc');
          if (lw && lw.classList.contains('is-open')) open.push(all[a]);
        }
        var at = open.indexOf(ml);
        var prev = mrowL._scwLastLine;
        var pi = prev ? open.indexOf(prev) : -1;
        if (e.shiftKey && at >= 0 && pi >= 0) {
          var lo = Math.min(at, pi), hi = Math.max(at, pi);
          for (var z = lo; z <= hi; z++) open[z].checked = ml.checked;
        }
        mrowL._scwLastLine = ml;
        return;   // its change event applies the pick
      }
      var mx = t.closest('[data-alt-mloc-x]');
      if (mx) {
        var locW = mx.closest('.' + P + '-mloc');
        if (locW) {
          var isOpen = !locW.classList.contains('is-open');
          locW.classList.toggle('is-open', isOpen);
          mx.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
        return;
      }
      var mset = t.closest('[data-alt-mpick-set]');
      if (mset) {
        var mrowS = mset.closest('[data-alt-model]');
        setLines(mrowS, mset.getAttribute('data-alt-mpick-set') === '1');
        applyModel(mrowS); repaint(); return;
      }
      var mk = t.closest('[data-alt-mkeep]');
      if (mk) {
        var mrowK = mk.closest('[data-alt-model]');
        if (mrowK) { resetModelControls(mrowK); applyModel(mrowK, true); }
        repaint(); return;
      }
      var gh = t.closest('[data-alt-grp]');
      if (gh) {
        var wrapEl = gh.closest('.' + P + '-grp');
        if (wrapEl) wrapEl.classList.toggle(P + '-grp--closed');
        return;
      }
      var rb = t.closest('[data-alt-reset]');
      if (rb) {
        var rr = rows();
        for (var k = 0; k < rr.length; k++) {
          var rsel = rr[k].querySelector('select');
          if (rsel) rsel.value = rr[k].getAttribute('data-from-id') || '';
        }
        var mrs = modal.querySelectorAll('[data-alt-model]');
        for (var q = 0; q < mrs.length; q++) resetModelControls(mrs[q]);
        repaint(); return;
      }
      if (t.closest('[data-alt-go]') && !goBtn.disabled) { if (step < 3) setStep(step + 1); else submit(); }
    });

    function submit() {
      var linkIds = [], cloneItems = [];
      var rs = rows();
      for (var i = 0; i < rs.length; i++) {
        var st = readRow(rs[i]);
        if (!st.on) continue;
        if (st.changed) {
          cloneItems.push({
            sourceItemId:    st.id,
            productId:       st.toId,
            productName:     st.toName,
            fromProductId:   st.fromId,
            fromProductName: st.fromName
          });
        } else {
          linkIds.push(st.id);
        }
      }
      var ctrls = modal.querySelectorAll('button, input, select');
      for (var c = 0; c < ctrls.length; c++) ctrls[c].disabled = true;
      goBtn.textContent = 'Creating…';
      fireWebhook(btn, linkIds, cloneItems);
    }

    setStep(1);
  }

  function buildRow(rec, allRecs, sowNum) {
    var pc = conn(rec, F.product);
    var fromId = pc && pc.id ? pc.id : '';
    var fromName = pc ? String(pc.identifier || '').replace(/<[^>]*>/g, '').trim() : '';
    var bucket = conn(rec, F.bucket);
    var opts = productsForBucket(bucket && bucket.id, allRecs);

    // The current product must always be offered even when the catalog
    // filter wouldn't have produced it — otherwise the select silently
    // lands on a DIFFERENT model and a share turns into a copy nobody asked
    // for. This is the one option that must never be missing.
    var haveCurrent = false;
    for (var o = 0; o < opts.length; o++) if (opts[o].id === fromId) { haveCurrent = true; break; }
    if (fromId && !haveCurrent) opts.unshift({ id: fromId, label: fromName || '(current model)' });

    var row = document.createElement('div');
    row.className = P + '-row';
    row.setAttribute('data-alt-row', rec.id);
    row.setAttribute('data-from-id', fromId);
    row.setAttribute('data-from-name', fromName);

    var label = plain(rec, F.label);
    var optHtml = '';
    for (var q = 0; q < opts.length; q++) {
      optHtml += '<option value="' + esc(opts[q].id) + '"' +
        (opts[q].id === fromId ? ' selected' : '') + '>' + esc(opts[q].label) + '</option>';
    }
    if (!opts.length) optHtml = '<option value="">(no models available)</option>';

    // Every row says what it will be on the alternate (Shared / Copy / Left
    // off) — the default used to be silent, and "silence means shared" was
    // exactly what nobody read. A copy also names what this SOW keeps.
    row.innerHTML =
      '<input type="checkbox" checked aria-label="Carry ' + esc(label || 'this item') + ' on the alternate SOW">' +
      '<span class="' + P + '-name">' +
        '<span class="' + P + '-name-l" title="' + esc(label) + '">' + esc(label || '(unlabelled)') + '</span>' +
        '<span class="' + P + '-was" data-alt-was style="display:none"></span>' +
      '</span>' +
      '<select class="' + P + '-sel" aria-label="Model on the alternate SOW">' + optHtml + '</select>' +
      '<span class="' + P + '-chip ' + P + '-chip--shared" data-alt-chip></span>';
    return row;
  }

  // Test seam: open the picker without the button / Knack mount.
  SCW.createAltSow = { open: openModal, close: closeModal };

  // ── Fire the duplicate-SOW webhook ───────────────────────

  function fireWebhook(btn, linkIds, cloneItems) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_DUPLICATE_SOW_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert('Duplicate-SOW webhook URL is not configured.');
      closeModal(); return;
    }
    var sourceRecordId = getSourceSowId();
    if (!sourceRecordId) {
      alert('Could not determine current SOW record ID.');
      closeModal(); return;
    }

    setBtnLoading(btn, true);

    refreshView(LICENSE_VIEW).then(function () {
      // Licenses now flow through the SOW Line Items grid too (the License
      // bucket is no longer filtered out of view_3586, 2026-10-13), so a
      // license the user ticked in the checklist is already in linkIds /
      // cloneItems. The standalone Licenses grid (view_3471) still feeds
      // licenseRecurringIds while Builder keeps it — minus anything the
      // checklist already carries, so no record rides the payload twice.
      var carried = Object.create(null);
      for (var li = 0; li < linkIds.length; li++) carried[linkIds[li]] = true;
      for (var ci = 0; ci < cloneItems.length; ci++) {
        if (cloneItems[ci] && cloneItems[ci].sourceItemId) carried[cloneItems[ci].sourceItemId] = true;
      }
      var licenseIds = collectRecordIdsFromView(LICENSE_VIEW).filter(function (id) {
        return !carried[id];
      });
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRecordId:      sourceRecordId,
          // Link-mode ONLY — see the header note. A clone-mode row must not
          // ride this list, or the scenario attaches the original product.
          sowLineItemIds:      linkIds,
          linkIds:             linkIds,
          cloneItems:          cloneItems,
          licenseRecurringIds: licenseIds,
          triggeredBy:         getTriggeredBy()
        })
      });
    }).then(function (resp) {
      return resp.text().then(function (body) {
        var data = null;
        try { data = body ? JSON.parse(body) : null; } catch (e) { /* not JSON */ }
        SCW.debug('[SCW clone-sow] status=' + resp.status + ' body=' + body);
        return { status: resp.status, body: body, data: data, ok: resp.ok };
      });
    }).then(function (resp) {
      if (resp.data && resp.data.success && resp.data.newSowUrl) {
        // Tear the modal down BEFORE navigating. Knack is a hash-router SPA
        // and newSowUrl is a #… route on this same document, so assigning it
        // is a SAME-DOCUMENT navigation: nothing unloads, no teardown fires,
        // and the modal just sits there over the new scene still saying
        // "Creating…" with every control disabled. Only a full cross-document
        // load would have cleaned it up on its own, and this never is one.
        setBtnLoading(btn, false);
        closeModal();
        window.location.href = resp.data.newSowUrl;
        return;
      }
      setBtnLoading(btn, false);
      closeModal();

      var msg;
      if (!resp.ok) {
        msg = 'Webhook returned HTTP ' + resp.status + '. Response:\n\n' + (resp.body || '(empty)');
      } else if (!resp.data) {
        msg = 'Webhook returned non-JSON response. Add a "Webhook Response" module in Make ' +
              'that returns JSON like {"success": true, "newSowUrl": "..."}.\n\n' +
              'Actual body:\n' + (resp.body || '(empty)');
      } else if (resp.data.error || resp.data.message) {
        msg = resp.data.error || resp.data.message;
      } else if (resp.data.success && !resp.data.newSowUrl) {
        msg = 'Webhook returned success but no newSowUrl. Add newSowUrl to the ' +
              'Webhook Response body so the client knows where to redirect.';
      } else {
        msg = 'Failed to create SOW option. Body:\n\n' + (resp.body || '(empty)');
      }
      alert(msg);
    }).catch(function (err) {
      setBtnLoading(btn, false);
      closeModal();
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    var iconSpan = btn.querySelector('.scw-create-sow-icon');
    if (loading) {
      btn.classList.add('is-loading');
      if (iconSpan) iconSpan.innerHTML = SPINNER_SVG;
    } else {
      btn.classList.remove('is-loading');
      if (iconSpan) iconSpan.innerHTML = COPY_SVG;
    }
  }

  /** Open the picker. Refresh the items grid first — it may sit in a
   *  collapsed accordion, and the whole modal is built from its model. */
  function startPicker(btn) {
    setBtnLoading(btn, true);
    var ready = (window.SCW && SCW.productMapReady &&
                 typeof SCW.productMapReady.then === 'function')
      ? SCW.productMapReady : Promise.resolve();
    Promise.all([refreshView(ITEMS_VIEW), ready])
      .then(function () { openModal(btn); })
      .catch(function () { openModal(btn); });
  }

  // ── Inject / remove the button based on gate + presence ──
  function syncButton() {
    var targetEl = document.getElementById(TARGET_VIEW);
    if (!targetEl) return;
    var accordion = targetEl.closest('.scw-ktl-accordion');
    if (!accordion) return;
    var body = accordion.querySelector('.scw-ktl-accordion__body');
    if (!body) return;

    var existing = body.querySelector('.' + BTN_MARKER);
    var shouldShow = !!getGateFieldValue();

    if (!shouldShow) {
      if (existing) {
        var oldHost = existing.parentElement;
        existing.remove();
        if (oldHost && oldHost.classList.contains('scw-acc-actions') &&
            !oldHost.children.length) {
          oldHost.remove();
        }
      }
      return;
    }
    if (existing) return;

    var actions = body.querySelector(':scope > .scw-acc-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'scw-acc-actions';
      if (targetEl.parentNode === body) body.insertBefore(actions, targetEl);
      else body.insertBefore(actions, body.firstChild);
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-acc-action-btn ' + BTN_MARKER;
    btn.title = 'Choose which items and models go on a second SOW option';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'scw-create-sow-icon';
    iconSpan.innerHTML = COPY_SVG;
    btn.appendChild(iconSpan);
    btn.appendChild(document.createTextNode(BTN_LABEL));

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (btn.classList.contains('is-loading')) return;
      startPicker(btn);
    });

    actions.appendChild(btn);
  }

  // Escape closes the picker (never mid-submit — controls are disabled then).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var back = document.querySelector('.' + P + '-back');
    if (!back) return;
    var go = back.querySelector('[data-alt-go]');
    if (go && go.disabled && /Creating/.test(go.textContent || '')) return;
    closeModal();
  });

  // ── Mounting: retry, don't hope ──────────────────────────
  // The button "sometimes doesn't load" because syncButton was called ONCE
  // per render on a fixed delay and bails silently on any prerequisite that
  // isn't ready yet — the KTL accordion not having wrapped view_3869, or the
  // gate view not having its value. Whichever of those loses the race, the
  // button never appears, because nothing tried again.
  //
  // So: every trigger starts a bounded poll instead of a single shot, and it
  // stops the moment the button is up (or the gate says it isn't wanted).

  var POLL_MS = 300, POLL_FOR = 12000;
  var _pollTimer = null, _pollUntil = 0;

  /** true once the outcome is settled — mounted, or definitively not wanted. */
  function trySync() {
    try { syncButton(); } catch (e) {
      console.warn('[scw-create-alt-sow] syncButton threw', e);
      return true;   // don't spin on a real error
    }
    var targetEl = document.getElementById(TARGET_VIEW);
    if (!targetEl) return false;                       // view not here yet
    var accordion = targetEl.closest('.scw-ktl-accordion');
    if (!accordion) return false;                      // accordion not built yet
    // An empty gate is ambiguous — the SOW genuinely has no install project,
    // OR view_3827 just hasn't loaded. We can't tell them apart, so keep
    // polling and let the window expire. Costs a few idle ticks on a SOW that
    // will never show the button; the alternative is giving up on a gate that
    // was simply late, which is the bug being fixed.
    if (!getGateFieldValue()) return false;
    return !!accordion.querySelector('.' + BTN_MARKER);
  }

  function scheduleSync() {
    _pollUntil = Date.now() + POLL_FOR;
    if (_pollTimer) return;                            // already polling
    _pollTimer = setInterval(function () {
      if (trySync() || Date.now() > _pollUntil) {
        clearInterval(_pollTimer);
        _pollTimer = null;
      }
    }, POLL_MS);
    trySync();                                         // and take the first shot now
  }

  /** Re-inject if something rebuilds the accordion body out from under us —
   *  a render that replaces it would otherwise take the button with it and
   *  leave nothing to notice. Debounced; our own insert is idempotent, so a
   *  self-triggered pass is a no-op rather than a loop. */
  var _obs = null, _obsT = null;
  function observeHost() {
    if (_obs) return;
    var host = document.getElementById('kn-scene') || document.body;
    if (!host) return;
    _obs = new MutationObserver(function () {
      if (_obsT) clearTimeout(_obsT);
      _obsT = setTimeout(function () { trySync(); }, 250);
    });
    _obs.observe(host, { childList: true, subtree: true });
  }

  // ── Bindings ─────────────────────────────────────────────
  function bind() {
    $(document)
      .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
      .on('knack-view-render.' + TARGET_VIEW + EVENT_NS, function () {
        scheduleSync(); observeHost();
      });

    $(document)
      .off('knack-view-render.' + GATE_VIEW + EVENT_NS)
      .on('knack-view-render.' + GATE_VIEW + EVENT_NS, function () {
        scheduleSync(); observeHost();
      });

    $(document)
      .off('knack-scene-render.any' + EVENT_NS)
      .on('knack-scene-render.any' + EVENT_NS, function () {
        scheduleSync(); observeHost();
      });
  }

  bind();
})();
