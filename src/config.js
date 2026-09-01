// src/config.js
window.SCW = window.SCW || {};
// Knack's loader (main.js) logs a warning if window.SCW.init is missing.
// We don't actually use it — each feature initializes itself via IIFE —
// so expose a no-op stub purely to silence the console noise.
if (typeof window.SCW.init !== 'function') {
  window.SCW.init = function () { /* no-op */ };
}
window.SCW.CONFIG = window.SCW.CONFIG || {
  VERSION: "dev",
  MAKE_PHOTO_MOVE_WEBHOOK: "https://hook.us1.make.com/7oetygbj2g2hu5fspgtt5kcydjojid81",
  // Fires when a user clicks an empty *required* photo card and picks a
  // file. The browser reads the file as base64 and POSTs to this hook.
  // Make's scenario should:
  //   1. Decode payload.dataBase64 into a binary file
  //   2. Upload it to Knack via REST API on the photo record
  //      (PUT /v1/objects/<photoObject>/records/<photoRecordId> with
  //       field_771 as a base64-encoded file upload)
  //   3. Return { success: true } when done (the browser doesn't wait —
  //      it polls the view until field_771 is populated, then re-renders)
  //   Request body (application/json):
  //   {
  //     photoRecordId: <24-char hex of the photo record being filled>,
  //     lineItemId:    <24-char hex of the line item the photo belongs to>,
  //     viewId:        <Knack view id where the upload was triggered>,
  //     filename:      <original file name from the browser>,
  //     mimeType:      <e.g. "image/jpeg">,
  //     sizeBytes:     <pre-base64 byte count, sanity check>,
  //     dataBase64:    <pure base64 string, no "data:..." prefix>,
  //     triggeredBy:   { id, name, email }
  //   }
  //   Response body — fire the "Webhook response" module AT THE END of
  //   the Make scenario (after the Knack upload module), so the browser
  //   waits for completion rather than polling:
  //     { "success": true }                           → stops polling,
  //                                                     one fetch to refresh
  //     { "success": false, "error": "human msg" }    → shows the error
  //                                                     verbatim on the card
  //   If Make 408s out (40s timeout) or no JSON body is returned, the
  //   client falls back to polling so a slow background upload still
  //   surfaces eventually.
  MAKE_PHOTO_UPLOAD_WEBHOOK: "https://hook.us1.make.com/6n07ovcxexg4ygckwh8scydh22n71s3o",
  // Closeout-deliverables doc upload (view_3940 .scw-cd-doc cards).
  // Fires when the user drags a file onto, or clicks, a missing doc
  // square.  Browser reads the file as base64 and posts:
  //   {
  //     kind:         'document',
  //     docRecordId:  <DOC record id, 24-char hex>,
  //     closeoutId:   <parent closeout record id>,
  //     viewId:       'view_3940',
  //     filename, mimeType, sizeBytes, dataBase64,
  //     triggeredBy:  { id, name, email }
  //   }
  // Make decodes base64 and uploads to Knack on field_68 of the DOC
  // record.  Response shape mirrors photo upload.  Same TODO note —
  // empty URL falls back to Knack's edit-form click navigation.
  MAKE_DOC_UPLOAD_WEBHOOK: "https://hook.us1.make.com/6n07ovcxexg4ygckwh8scydh22n71s3o",
  // Note: QA updates on doc cards go direct via the view-based PUT
  // endpoint (Knack's view_3941 — DOC_files inline-editable grid).
  // No webhook needed — see closeout-deliverables.js / saveQA().
  MAKE_DELETE_RECORD_WEBHOOK: "https://hook.us1.make.com/uyxdq04zudssvoatvnwywxcjxxil15q7",
  // Fires on "Clone SOW / Create Alternative SOW" button click. Expects:
  //   Request body:  {
  //     sourceRecordId:      <current SOW id from view_3827>,
  //     sowLineItemIds:      [ <record ids from view_3586> ],
  //     licenseRecurringIds: [ <record ids from view_3471> ],
  //     triggeredBy:         { id, name, email }
  //   }
  //   Response body: { success: true,  newSowId: "<hex>", newSowUrl: "<full URL>" }
  //             or:  { success: false, error: "<message>" }
  MAKE_DUPLICATE_SOW_WEBHOOK: "https://hook.us1.make.com/ysbsl1qw19vdhc6f3hpk8barcfk79puu",
  // Fires on "Import Unique Items" click in view_3869 (per-row OR the
  // bulk bar above the grid). Expects:
  //   Request body:  {
  //     receivingRecordId:       <current SOW id>,
  //     sourceRecordId:          <row SOW id> | null  (null in bulk mode),
  //     sourceRecordIds:         [ <contributing SOW ids> ],
  //     uniqueItemIds:           [ <line item record ids being imported —
  //                                 already deduped, all NOT on receiving> ],
  //     deleteSourceIds:         [ <SOW ids the user opted to delete after
  //                                 import; subset of sourceRecordIds; only
  //                                 SOWs WITHOUT field_2706 = Yes are ever
  //                                 included> ],
  //     deleteSourceAfterImport: <bool — true iff deleteSourceIds non-empty>,
  //     bulk:                    <bool — true for the bulk bar>,
  //     triggeredBy:             { id, name, email }
  //   }
  //   Response body: { success: true,  imported: <count>, message?: "..." }
  //             or:  { success: false, error: "<message>" }
  MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK: "https://hook.us1.make.com/zqqc0kg10fsxmrwmr78hb9g4qqs9dutw",
  // Change-order adoption (worksheet-v2/co-adopt.js) — RETIRED 2026-07-23.
  // Adoption no longer goes through Make: it's a plain field_2154 union
  // (add the CO's SOW id to the line item's multi-SOW connection), done
  // client-side via view-scoped PUTs — the exact inverse of the CO
  // worksheet's unlink. The old MAKE_CO_ADOPT_ITEMS_WEBHOOK pointed at the
  // import-unique-items scenario, which never matched the adopt payload
  // and ACKed 200 without writing anything ("adds but doesn't add").
  // Change-order removal (worksheet-v2/co-remove.js): flag active project
  // install line items for removal on a CO. Unlike adoption, removal CREATES
  // records — one Remove line per install item (a SOW Line Item with
  // CO Action = Remove, Target install item → the install record, connected
  // to the CO via field_2154). The install record's own `Removed by CO` flip
  // defers to signature. Expected:
  //   Request body:  {
  //     changeOrderId:           <CO SOW id>,
  //     installItemIds:          [<DEVICE install rec ids — acted-on rows ONLY>],
  //     accessoryInstallItemIds: [<accessory install rec ids approved to ride>],
  //     items: [ { id: <device id>, accessoryIds: [<its approved accessories>] } ],
  //     removal: true, swap?: true, triggeredBy: {...}
  //   }
  //   Response body: { success: true, created?: <count>, message?: "..." }
  //             or:  { success: false, error: "<message>" }
  // ⚠ Shape change 2026-09-01: accessories are NO LONGER mixed into
  // installItemIds — the flat array lost which parent each accessory
  // belonged to, so their Remove lines couldn't carry the parent
  // connection. The scenario should now use ONE of:
  //   A (recommended, no searches): iterate `items[]` → create the device's
  //     Remove line → iterate that bundle's `accessoryIds` → create each
  //     accessory Remove line parented to the device's (field_2464 on the
  //     created line → the device Remove line, same as the old per-camera
  //     loop produced).
  //   B (matches the old loop): iterate `installItemIds` (devices) → search
  //     each device's accessories from Knack (install field_2853 = device)
  //     → FILTER to ids present in `accessoryInstallItemIds` → create their
  //     Remove lines inside the device's loop pass (parent preserved).
  // Either way accessories NOT in the approved set are left alone (the
  // remove confirm's checkbox unchecked = empty arrays). Single, bulk and
  // swap removes all fire this SAME shape (swap: true is informational —
  // the swap pairing lives on the created lines' field_2966 targets).
  // ⚠ The scenario must NOT also create Remove lines from the ADD webhook's
  // swap branch — the client always follows a swap's Add call with this
  // remove call; an add-scenario remove doubles every credit line.
  MAKE_CO_REMOVE_ITEMS_WEBHOOK: "https://hook.us1.make.com/yw3x0othv8k4guke6qx91iyo3q5hgnyy",
  // Change-order PRODUCT SWAP (worksheet-v2/co-remove.js fireSwapBatch) — NO
  // dedicated webhook: the gesture (single row or bulk) opens the bucket-
  // filtered product picker for the REPLACEMENT first, then drafts a linked
  // Remove + Add pair PER ITEM through the two EXISTING hooks, in this order:
  //   1. MAKE_CO_ADD_ITEMS_WEBHOOK — one call per item (sequential): the
  //      normal add payload with the install item's config cloned in and
  //      productIds = the REPLACEMENT product the user picked (the Add line
  //      is created with it directly — no post-edit step). The credited
  //      current product rides along as swapFromProductId /
  //      swapFromProductName (informational — the credit itself is the
  //      Remove line). PLUS the swap extras. The ADD scenario must, when
  //      swap=true:
  //        (a) map targetInstallItemId → field_2966 on the created device
  //            line — an Add carrying a target IS the pair marker;
  //        (b) iterate `swapAccessories` [{productId, productName,
  //            targetInstallItemId, qty}] creating one child Add line per
  //            entry — same creation steps as the normal accessory path
  //            (parented via field_2464 to the device Add) plus field_2966 =
  //            that entry's targetInstallItemId — so the CO shows the
  //            mounting being credited/re-added and the sub can price it;
  //        (c) skip any default-accessory auto-adds (accessoryIds arrives []
  //            — swap accessories come ONLY through swapAccessories; an
  //            untargeted accessory Add would double the mount at apply).
  //   2. MAKE_CO_REMOVE_ITEMS_WEBHOOK — ONE call for the whole batch,
  //      identical STRUCTURED payload to a plain removal (see the removal
  //      contract above): installItemIds = the successfully-added devices,
  //      each device's accessories under it in `items[]` /
  //      accessoryInstallItemIds, plus an informational swap:true. Add
  //      fires first because a lone target-linked Add is apply-safe, while
  //      a lone Remove would actually remove the item; an item whose Add
  //      failed is left OUT of the remove call so it stays live and
  //      untouched.
  // At SIGNATURE the apply scenario routes on "CO Action = Add AND
  // field_2966 populated" → IN-PLACE UPDATE of the targeted install
  // record's PRODUCT (nothing else — product-only at this stage; never
  // remove + create), and SKIPS any Remove whose target matches a swap-Add
  // (no field_2967 flip). That identity preservation is what keeps
  // photos/QA/history attached. See docs/change-orders.md.
  // Change-order ADD item (worksheet-v2/co-add-item-form.js): the custom
  // "Add line item(s)" modal fires this INSTEAD of the native DTO form. Make
  // creates SOW Line Item records DIRECTLY from the payload (no DTO staging
  // object) and connects them to the CO's SOW (field_2154 = coSowId). One
  // item per (product × MDF/IDF); qty/prefix/startNumber drive label
  // numbering the same way the old DTO scenario did. Expected:
  //   Request body: {
  //     coSowId, bucketId, bucketName,
  //     productIds: [...], accessoryIds: [...],
  //     mdfIds: [...],                 // [] when the bucket has no MDF field
  //     qty, prefix, startNumber,      // startNumber/prefix: cameras only
  //     existingCabling, exterior, plenum,   // cameras only (bool)
  //     serviceCost, description, notes,
  //     triggeredBy: { id, name, email },
  //     origin: 'sub'|'ops',           // STRUCTURAL initiator: which page fired
  //                                    // the add — 'sub' = sub portal Manage CO
  //                                    // page (scene_1374/view_4112), 'ops' =
  //                                    // internal build-CO (scene_1362/view_4079).
  //                                    // Derived from the hosting deployment,
  //                                    // never from the user's email. Make
  //                                    // stamps authorship (Added-by-sub flag)
  //                                    // from this.
  //     originPage, originView, originScene   // human/debug context for origin
  //   }
  //   Response: 2xx = accepted (body optional; only {success:false}|{error} fails)
  MAKE_CO_ADD_ITEMS_WEBHOOK: "https://hook.us1.make.com/ae51ped3yu5m671mx3yvxqyk5r14wp9o",
  // Change-order sub-pricing loop (co-stage-strip.js). One scenario, the
  // payload's `mode` branches it:
  //   mode:'send'     → store payload.snapshot verbatim in the CO header's
  //                     `CO Sub Pricing Snapshot` field, set CO Status =
  //                     "Pending Sub Pricing", notify the sub (resolve off
  //                     the CO's bid-basis connection).
  //   mode:'nudge'    → re-send the notification only. No writes.
  //   mode:'sendback' → same writes as 'send' (fresh snapshot = the new
  //                     baseline ops just reviewed) + payload.note in the
  //                     notification.
  //   mode:'sub-submit' → the SUB hands their priced CO back: set CO Status
  //                     = "Ops Review", notify SCW ops (not the sub),
  //                     update both ClickUp task statuses, and post
  //                     payload.requestText (or requestHtml) as the "what
  //                     the sub submitted" comment on each task — that CU
  //                     comment IS the submittal record / tamper defense.
  //                     ⚠️ Do NOT write payload.snapshot to field_2972
  //                     (decided 2026-07-15): the field stays the SCW→sub
  //                     SEND baseline so the Ops-Review "what changed" diff
  //                     has something to compare the live lines against.
  //                     (The payload still carries snapshot = the submitted
  //                     values, in case a dedicated submittal field is
  //                     added later.)
  //   mode:'recall'   → NOTIFY-ONLY: tell the sub their pricing window
  //                     closed + update both ClickUp task statuses. The
  //                     status write (CO Status = "Draft") happens
  //                     CLIENT-SIDE before this fires — co-stage-strip.js
  //                     PUTs field_2953 through view_4092 (the field is on
  //                     that form, hidden). ⚠️ The Make recall branch must
  //                     NOT touch CO Status — a branch that wrote it back
  //                     overwrote the client PUT and made recall look
  //                     broken (2026-07-15). No snapshot write — any
  //                     pricing the sub already entered stays on the lines.
  //   ClickUp (send + sendback): update BOTH tasks' statuses — the
  //   subcontractor's task and our internal one — and post
  //   payload.requestText (or requestHtml where the surface renders HTML)
  //   as a comment on each, so the fixed record of exactly what was
  //   requested rides the tasks, not just Knack.
  //   Request body:  { changeOrderId, mode, snapshot?, note?, triggeredBy,
  //                    coNumber, coName,         // CU task lookup / naming
  //                    requestHtml, requestText  // fixed what-was-sent record:
  //                  }                           // self-contained HTML card
  //                                              // (inline styles — store as the
  //                                              // durable artifact) + plaintext
  //                                              // twin (for CU comments)
  //     snapshot = { sentAt, sentBy, lines: { <lineId>: { label, prefixId,
  //                  prefix, number, action, subBid, hrs, mat, fee, equip } } }
  //     (prefixId = Drop Prefix connection record id (field_2240);
  //      prefix/number = display text + drop # (field_1951);
  //      label = the computed drop label, e.g. "E-010")
  //   Response body: { success: true } or { success: false, error: "..." }
  MAKE_CO_SEND_TO_SUB_WEBHOOK: "https://hook.us1.make.com/vj5dai5w3k84m9xrd9f296wlqnr8oo4q",
  // Issue Change Order — fired by ops-stepper.js's CO-mode step
  // ('issue-change-order') on the proposal PREVIEW page (scene_1096), which
  // renders instead of the base publish steps when SOW Type (field_2952) =
  // "change order". ONE gesture, three Make-side writes (docs/change-orders.md
  // "Issue" verb): create the published proposal (type=CO), create the
  // esignatures contract + acceptance record (type=CO), set CO Status =
  // Issued. Payload = the SAME full publish shape as publish-final
  // (sourceRecordId, stepId:'issue-change-order', notes, sowFields,
  // sowLineItemIds, html/htmlPdf/json/totals/proposalAccessToken/Url, …)
  // plus changeOrderId (alias of sourceRecordId, matching the other CO
  // webhooks). ⚠️ Requires field_2952 on view_3861 for CO mode to activate.
  //   Response body: { success: true } or { success: false, error: "..." }
  // ⚠️ SHARED by TWO stepper actions — the scenario must route on
  // payload.stepId as its first step:
  //   'issue-change-order'  → full Issue: published record + esignatures
  //                           contract + acceptance + CO Status = Issued,
  //                           and flip any prior preview record to
  //                           Superseded (field_2658).
  //   'publish-co-preview'  → create the SOW_published proposals record
  //                           only (field_2680 html, field_2904 token,
  //                           field_2908 tokenized URL, field_2659
  //                           expiration, Type = change order, field_2658
  //                           = Published) and STOP — no contract, no
  //                           acceptance, no CO Status change.
  // Both ship the identical full publish payload (changeOrderId alias
  // included), so the record-creation modules are common and the branch
  // point is after them.
  MAKE_CO_ISSUE_WEBHOOK: "https://hook.us1.make.com/fwpbnldo3fkrywggxwu18qsh6ghgrg7w",
  // Fires from the published CO page (scene_1279 AND the public token
  // page snippet) when a client clicks "Request the signature copy" on
  // a PRE-ISSUE CO preview. Minimal notify payload:
  //   { source, publishedProposalId, proposalName, coStatus, pageUrl }
  // The scenario just pings ops (Slack/email) to run Issue from the
  // preview page. The CTA hides while this is blank, so the preview
  // banner ships safely before the scenario exists.
  MAKE_CO_SIGNATURE_REQUEST_WEBHOOK: "",
  // Fires on the "Request Validation & Add as Alternative Bid to Survey"
  // stepper action (state 3 of the gating model — sibling SOW has the
  // survey; docs/project-stage-workflow.md). Payload now carries stepId
  // ('request-alternative-proposal') + actionLabel so the scenario can also
  // treat it as a validation request for this SOW. Expects:
  //   Request body:  { sourceRecordId, stepId, actionLabel, notes, account,
  //                    project, projectName, triggeredBy }
  //   Response body: { success: true, message?: "..." }
  //             or:  { success: false, error: "<message>" }
  MAKE_REQUEST_ALT_PROPOSAL_WEBHOOK: "https://hook.us1.make.com/r84mgo96cdsq3kox3y6lj0im6b7ovme2",
  // Fires on the "Request Survey Bid Updated to Match SOW" stepper action
  // (state 4 — survey on THIS SOW, changes queued since; the sales-side
  // mirror of Ops's Update Subcontractor Bid Request). Same payload shape
  // as the alt-proposal action (stepId = 'request-bid-update-to-match').
  // ⚠️ PLACEHOLDER — point at the real Make scenario before enabling in
  // production; the button alerts "not configured" until then.
  MAKE_REQUEST_BID_UPDATE_WEBHOOK: "PLACEHOLDER",
  // Fires from the Agreements & Invoices panel (acceptance-card.js) to ask
  // Make whether the deal is ready to greenlight for install. Two entry
  // points, both OPTIONAL — nothing fires unless the user asks for it:
  //   1. a checkbox in the signed-agreement uploader — ticked by default,
  //      shown BEFORE anything runs, fires as part of the same Upload
  //      click (source: 'agreement-upload'), and
  //   2. the row's standalone "Check greenlight" button
  //      (source: 'manual'), shown once an agreement is on file.
  // Payload:
  //   Request body:  { acceptanceRecordId, proposalId, proposalLabel,
  //                    agreementSigned, paymentReceived, approvedForTerms,
  //                    source, pageUrl, triggeredBy }
  //   Response body: { success: true, greenlit?: bool, message?: "..." }
  //             or:  { success: false, error: "<message>" }
  // A bare HTTP 200 (Make's "Accepted" ack when the scenario runs past the
  // 40s webhook-response window) counts as "check started" — the panel
  // refetches so any flags the scenario flips show up on their own.
  // Blank/PLACEHOLDER hides the row button and drops the uploader's
  // checkbox, so the panel degrades to a plain file upload.
  MAKE_GREENLIGHT_CHECK_WEBHOOK: "https://hook.us1.make.com/zlxkei9ro9iaxjri5e5yf2f4fqzi89xl",
  // ⚠️ RETIRED FROM CODE 2026-08-02 (docs/project-stage-workflow.md): the
  // standalone "Request SOW validated as ready for Survey" stepper button
  // was removed — both remaining sales actions (the renamed initiate form
  // and the survey request form) ARE validation requests, and the Ops ping
  // moves into their Make scenarios. Key kept only so the Make scenario
  // behind it can be re-used/merged during the transition; delete both once
  // the initiate + survey scenarios carry the ping (cleanup step 8 in the
  // design doc).
  MAKE_REQUEST_SOW_VALIDATION_WEBHOOK: "https://hook.us1.make.com/os586ruwyb1p2o3j31xoju3v7togumfy",
  // Custom survey-request form (survey-request-form.js, DORMANT until wired
  // in). Replaces the view_3853 Knack form: the record is created by MAKE,
  // not a Knack form insert — the copied form's page connection never
  // executed on create, so the scenario receives everything and writes the
  // SOW_OPS_site survey request itself: connect REL_scope of work
  // (field_2329) + project, set the correct status (Pending Validation vs
  // fire-now per the validated flag — docs/project-stage-workflow.md branch
  // table), resolve/create the contacts, notify per the existing flow.
  //   Request body: { action: 'survey-request-create', sowId, sowName,
  //     projectId, companyId, validated, surveyRequested,
  //     installContact:  { mode: 'existing', id, name, email, phone } |
  //                      { mode: 'new', first, last, email, phone },
  //     billingContact:  same shape or null,
  //     pocAuthorized, badging, badgingDetails, ppe, notes,
  //     requestedBy: { id, name, email }, submittedAt }
  //   Response: { success: true } (or bare Make "Accepted")
  MAKE_SURVEY_REQUEST_FORM_WEBHOOK: "https://hook.us1.make.com/PLACEHOLDER_SURVEY_REQUEST_FORM",
  // Ops-side stepper actions (view_3345 on the proposal page). Each fires on
  // button click with a notes modal. Payload shape:
  //   Request body:  { sourceRecordId, notes, sowFields, sowLineItemIds,
  //                    licenseIds, triggeredBy }
  //   Response body: { success: true } or { success: false, error: "..." }
  //
  // Mark Ready repointed (was …0olufw2i…) to the SAME shared publish
  // scenario as the three publish variants + the sales publish-proposal
  // step below. mark-ready is already in buildPayload's full-publish merge
  // list (ops-stepper.js), so its body carries the identical publish shape
  // (html / json / totals / proposalAccessToken+Url / publishAsTbd) plus the
  // common sowFields / sowLineItemIds / licenseIds. The scenario branches on
  // payload.stepId === 'mark-ready'. submission / clickupStatus are absent
  // (mark-ready surfaces no such radio) — same as a publish step where the
  // user picks "just publish", so the shape stays compatible.
  MAKE_OPS_MARK_READY_WEBHOOK:           "https://hook.us1.make.com/mezrtqmf6gh7yxlkx5fkit6fqrma213l",
  // Second fire on Mark Ready when a survey request is PENDING: after the
  // mark-ready webhook is accepted, ops-stepper POSTs the survey
  // activation scenario a minimal payload — { surveyRequestId, branchIds:
  // [id,…], sowId } — so the send can be built/retried independently of
  // the validate/publish scenario. branchIds is ALWAYS an array.
  MAKE_SEND_PENDING_SURVEY_WEBHOOK:      "https://hook.us1.make.com/yao4qdea7hupuhjimwgi1nvpugbc6lfc",
  MAKE_OPS_REQUEST_ALT_BID_WEBHOOK:      "https://hook.us1.make.com/r08nmy4ellspsjo9f2s0kdkhxucvf78u",
  // Update Subcontractor Bid Request: same payload shape as Request Alt
  // Bid (incl. selectedSurveyIds[]) AND the same Make webhook URL.
  // Make branches on payload.stepId — 'request-alt-bid' creates a new
  // alt-bid package, 'update-matching-bid' updates the existing bid
  // record(s) for the chosen survey(s). Kept as a separate key so it
  // can be split off to its own scenario later without touching code.
  // Shown only when field_2706 = "Yes" (survey already requested).
  MAKE_OPS_UPDATE_MATCHING_BID_WEBHOOK:  "https://hook.us1.make.com/r08nmy4ellspsjo9f2s0kdkhxucvf78u",
  // Three publish variants — all hit the same Make scenario, which
  // branches on payload.stepId. The client pre-formats the html field
  // per variant before sending:
  //   publish-sow-tbd → labor surfaces stamped "TBD"
  //   publish-gfe     → big "Good Faith Estimate" callout prepended;
  //                     labor figures shown
  //   publish-final   → unchanged html; labor figures shown
  // Kept as three distinct keys so any one can be split off to its
  // own scenario later without touching the JS.
  MAKE_OPS_PUBLISH_SOW_TBD_WEBHOOK:      "https://hook.us1.make.com/mezrtqmf6gh7yxlkx5fkit6fqrma213l",
  MAKE_OPS_PUBLISH_GFE_WEBHOOK:          "https://hook.us1.make.com/mezrtqmf6gh7yxlkx5fkit6fqrma213l",
  MAKE_OPS_PUBLISH_FINAL_WEBHOOK:        "https://hook.us1.make.com/mezrtqmf6gh7yxlkx5fkit6fqrma213l",
  // Sales stepper "Publish Proposal" (sales-stepper.js, stepId
  // 'publish-proposal'). Points at the SAME shared publish scenario as
  // the three ops publish variants above — Make branches on
  // payload.stepId, and the payload shape matches those steps. Repointed
  // here from the legacy single-publish hook (…c9ha12…) so every publish
  // path lands in one scenario; that legacy URL is no longer referenced
  // in code (external integrations hitting it directly are unaffected).
  MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK:     "https://hook.us1.make.com/mezrtqmf6gh7yxlkx5fkit6fqrma213l",
  // Fires after a successful submit on the SOW Header update form when
  // field_2753 (target Project to clone into) is non-empty. Make handles
  // the deep clone (SOW + MDFs + photos) into the target Project. Payload:
  //   Request body:  {
  //     sourceRecordId: <SOW Header record id>,
  //     targetProjectId: <field_2753 value — Project record id>,
  //     triggeredBy:    { id, name, email }
  //   }
  //   Response body: ignored (fire-and-forget).
  MAKE_CLONE_SOW_TO_PROJECT_WEBHOOK: "https://hook.us1.make.com/1lvnsaugc5eqpxpsngbpatit35ki1s0u",
  // Fires on stepper actions on scene_833 (the SOW detail page).
  // The same webhook URL is reused across step variants — Make
  // branches on `payload.stepId` to decide which downstream PDF
  // template to render and where to deposit the file.
  //
  // Current stepIds:
  //   • 'generate-sow-pdf'                — the dense landscape SOW PDF.
  //                                         payload.html is the live
  //                                         scene wrapped in a complete
  //                                         standalone document plus
  //                                         the print stylesheet.
  //   • 'generate-location-approval-pdf'  — the customer-facing
  //                                         camera-mounting approval
  //                                         form. payload.html is a
  //                                         purpose-built portrait
  //                                         document with sign-off
  //                                         gutter per camera, equipment
  //                                         table, and project
  //                                         assumptions panel. Same
  //                                         source data as the SOW.
  //
  // Sent as application/json — identical wire format to the
  // publish-proposals webhook in ops-stepper.js. Make's webhook
  // auto-parses the JSON body and exposes each top-level key
  // (`html`, `sourceRecordId`, etc.) as a first-class field
  // ({{1.html}}, {{1.sourceRecordId}}, …) with real quotes and real
  // newlines. Pipe `{{1.html}}` directly into your HTML→PDF module
  // — no JSON Parse / Unescape step needed.
  //
  // ⚠️  After changing the payload shape, click "Redetermine data
  // structure" on the webhook module in Make so {{1.html}} reappears
  // as a parsed field instead of an opaque body blob.
  //
  // The `html` field is a COMPLETE STANDALONE HTML DOCUMENT —
  // <!DOCTYPE html><html><head>…</head><body>…</body></html> — with
  // every `<link rel="stylesheet">` from the live page re-emitted
  // (Knack core CSS, Font Awesome, Google Fonts) plus every inline
  // `<style>` block (where every SCW feature injects its rules), plus
  // a `<base href>` so relative asset URLs resolve back to Knack.
  //
  //   Request body (application/json):
  //   {
  //     stepId:         'generate-sow-pdf',
  //     sourceRecordId: <SOW record id from URL hash>,
  //     html:           <full standalone HTML document, see above>,
  //     htmlBytes:      <length of html string, sanity check>,
  //     bodyBytes:      <length of just the scraped scene>,
  //     viewCount:      <# of .kn-view elements in the scrape>,
  //     tableCount:     <# of <table> elements>,
  //     rowCount:       <# of <tr> elements>,
  //     imgCount:       <# of <img> elements>,
  //     styleTagCount:  <# of <style> tags in the html>,
  //     linkTagCount:   <# of <link> tags in the html>,
  //     pageTitle:      <document.title>,
  //     pageUrl:        <window.location.href>,
  //     triggeredBy:    { id, name, email }
  //   }
  //
  //   Response body: { success: true, message?: "..." }
  //             or:  { success: false, error: "<message>" }
  //
  // ⚠️  Image auth caveat: <img src> tags point at Knack's S3 with
  // presigned URLs that require the browser's Knack session. A
  // headless renderer in Make WILL get 403s on those images. Either
  // strip images, swap to a public mirror, or proxy through a module
  // that re-uploads them server-side before rendering.
  MAKE_GENERATE_SOW_PDF_WEBHOOK: "https://hook.us1.make.com/tyrrisxjgai5hufsl722lcdsewiw9ryz",
  // Bulk file uploader (src/features/bulk-upload.js) — one POST per file.
  // Replaces the JotForm "Bulk Add Photos" flow for views configured in
  // bulk-upload.js → CONFIG.VIEWS. Payload shape per file:
  //   {
  //     recordId:    <24-hex of the linked SOW / survey / etc.>,
  //     linkField:   <e.g. 'sowID' / 'surveyID' — configured per view>,
  //     filename:    <original filename>,
  //     mimeType:    <e.g. 'image/jpeg', 'application/pdf'>,
  //     extension:   <e.g. 'jpg', 'pdf'>,
  //     sizeBytes:   <pre-base64 size>,
  //     dataBase64:  <base64 string, no data:... prefix>,
  //     uploadId:    <UUID — stable across retries for Make idempotency>,
  //     batchId:     <UUID — shared by all files in a batch>,
  //     triggeredBy: { id, name, email }
  //   }
  //
  // Expected Make response:
  //   { success: true }                   → file marked done, blob deleted from IDB
  //   { success: false, error: "..." }    → file marked failed, retry available
  //   HTTP 4xx/5xx OR no JSON body        → treated as failure
  //
  // Hard caps enforced client-side:
  //   - 50 files per batch
  //   - 5 MB raw per file (Make webhook body limit)
  MAKE_BULK_UPLOAD_WEBHOOK: "https://hook.us1.make.com/vspokcrqp41hqqoi9ywxh5sc6qo26xnb",

  // ─────────────────────────────────────────────────────────────
  // Photo-strip "Add photo" → identity-aware bulk-upload modal
  // ─────────────────────────────────────────────────────────────
  // When true, clicking the "Add photo" button on an inline photo strip
  // (inline-photo-row.js) opens the bulk-upload modal (bulk-upload.js)
  // seeded with THAT line item's record id + a line-item-scoped linkField,
  // instead of deep-linking to Knack's add-photo edit page. Every uploaded
  // photo then POSTs { recordId: <lineItemId>, linkField: <type> } to
  // MAKE_BULK_UPLOAD_WEBHOOK.
  //
  // ⚠️ Make dependency: the bulk-upload scenario MUST branch on the NEW
  // line-item linkField values and connect the photo to the correct object:
  //     surveyLineItemID   → Survey Line Item  (field_771 photo connection)
  //     sowLineItemID      → SOW Line Item     (field_771 photo connection)
  //     installLineItemID  → Install Line Item (field_771 photo connection)
  // Until those branches exist, photos upload but don't connect. Flip this
  // OFF to fall back to the Knack edit-page navigation in the meantime.
  // (MDF/IDF photo views are intentionally NOT routed here — they keep the
  // edit-page nav until an mdfIdf linkField is added.)
  PHOTO_ADD_BULK_MODAL: true,

  // ─────────────────────────────────────────────────────────────
  // Bulk Add Mounting Box (device-worksheet → Add Mount Box button)
  // ─────────────────────────────────────────────────────────────
  // Fires when the user checks N rows on a device worksheet, clicks
  // "+ Add Mounting Box to Selected", picks a mounting-box product,
  // and submits. Make creates one SOW line item per selected parent
  // camera/reader (field_1958 = product, field_2464 = parent record
  // id, field_1946 = parent's MDF/IDF, field_2154 = sowId).
  // Payload shape: { sowId, productId, productName, parentRecordIds, parentLabels, sourceViewId, triggeredBy }
  MAKE_BULK_ADD_MOUNTING_BOX_WEBHOOK: "https://hook.us1.make.com/g43gvnp10lyo4xrcjkrdsv7fvmwmdb2b"
};

// ─────────────────────────────────────────────────────────────
// Build stamp + boot log
// ─────────────────────────────────────────────────────────────
// Printed once per page load so the LOADED bundle self-identifies —
// including the exact CDN URL (with the pinned git SHA) it was loaded
// from. When "is the page running the build I just pushed?" comes up,
// open the console and read this line instead of fingerprinting the
// DOM. Bump the stamp when shipping something you need to verify live.
(function () {
  'use strict';
  window.SCW.BUILD = '2026-09-01 co-product-swap';
  try {
    var src = (document.currentScript && document.currentScript.src) || '';
    if (!src) {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && scripts[i].src.indexOf('knack-bundle') !== -1) {
          src = scripts[i].src; break;
        }
      }
    }
    console.info('[SCW] bundle build:', window.SCW.BUILD, src ? '· ' + src : '');
  } catch (e) { /* logging is a nicety — never block boot */ }
})();
