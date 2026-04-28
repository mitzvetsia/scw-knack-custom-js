// src/config.js
window.SCW = window.SCW || {};
window.SCW.CONFIG = window.SCW.CONFIG || {
  VERSION: "dev",
  MAKE_PHOTO_MOVE_WEBHOOK: "https://hook.us1.make.com/7oetygbj2g2hu5fspgtt5kcydjojid81",
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
  // Fires on per-row "Import Unique Items" click in view_3869. Expects:
  //   Request body:  { receivingRecordId: <current SOW id>, sourceRecordId: <row SOW id>, triggeredBy: {...} }
  //   Response body: { success: true,  imported: <count>, message?: "..." }
  //             or:  { success: false, error: "<message>" }
  MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK: "https://hook.us1.make.com/PLACEHOLDER_IMPORT_UNIQUE_ITEMS",
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
  // Three publish variants. Each fires the same publish payload as the
  // legacy MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK; Make differentiates by the
  // step.id field on the body so the scenario can format the published
  // quote with TBD labor / GFE labor / final labor figures.
  MAKE_OPS_PUBLISH_SOW_TBD_WEBHOOK:      "https://hook.us1.make.com/PLACEHOLDER_PUBLISH_SOW_TBD",
  MAKE_OPS_PUBLISH_GFE_WEBHOOK:          "https://hook.us1.make.com/PLACEHOLDER_PUBLISH_GFE",
  MAKE_OPS_PUBLISH_FINAL_WEBHOOK:        "https://hook.us1.make.com/PLACEHOLDER_PUBLISH_FINAL",
  // Legacy single-publish webhook — kept so any external integrations
  // linking to this URL keep working until they're migrated to one of
  // the three variants above. Not referenced by ops-stepper after the
  // three-button split.
  MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK:     "https://hook.us1.make.com/c9ha12glmbnxponzny6ka7s7orr1226b"
};
