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
  MAKE_CLONE_SOW_TO_PROJECT_WEBHOOK: "https://hook.us1.make.com/1lvnsaugc5eqpxpsngbpatit35ki1s0u"
};
