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
  // Fires on the "Request Alternative Proposal" stepper action. Expects:
  //   Request body:  { sourceRecordId: <current SOW id>, notes: "<user input>", triggeredBy: {...} }
  //   Response body: { success: true, message?: "..." }
  //             or:  { success: false, error: "<message>" }
  MAKE_REQUEST_ALT_PROPOSAL_WEBHOOK: "https://hook.us1.make.com/r84mgo96cdsq3kox3y6lj0im6b7ovme2",
  // Ops-side stepper actions (view_3345 on the proposal page). Each fires on
  // button click with a notes modal. Payload shape:
  //   Request body:  { sourceRecordId, notes, sowFields, sowLineItemIds,
  //                    licenseIds, triggeredBy }
  //   Response body: { success: true } or { success: false, error: "..." }
  MAKE_OPS_MARK_READY_WEBHOOK:           "https://hook.us1.make.com/0olufw2i0pf8iu653zf6ag8hwai1eoix",
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
  // Legacy single-publish webhook — kept so any external integrations
  // linking to this URL keep working until they're migrated to one of
  // the three variants above. Not referenced by ops-stepper after the
  // three-button split.
  MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK:     "https://hook.us1.make.com/c9ha12glmbnxponzny6ka7s7orr1226b",
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
