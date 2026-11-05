# Quote extension — the Make scenario (spec, 2026-11-05)

ClickUp 86ba5wg3f. The bundle half is built and gated on `MAKE_QUOTE_EXTENSION_WEBHOOK`
(`src/config.js`); the Builder fields and view columns are in. This is the module-by-module
plan for ONE new scenario plus one added module on the shared publish scenario. Field keys are
checked against the public app schema (2026-11-05).

## What Make owns

Every write. The pages only POST and read the four Builder fields:

| Record | Field | Meaning |
|---|---|---|
| SOW header (object_106) | `field_3314` STATUS_expiration extension | blank / `Requested` / `Re-Pricing` / `Re-Price Requested` (**Builder: add this 3rd option**, 2026-11-05) |
| SOW header | `field_3315` INPUT_requested quote expiration date | the date asked for |
| Bid package (object_115) | `field_3316` FLAG_expiration extension requested | Yes while the sub owes an answer |
| Bid package | `field_3317` INPUT_requested expiration date | the quote date being asked for |

Dates travel as `M/D/YYYY` strings (what Knack shows and accepts). The three real expiration
dates: bid `field_2635`, SOW `field_2135`, proposal `field_2659` (object_125).

## Lookups every route shares

1. **SOW** — Get a record, object_106, `sowId`. Read `field_2942` (REL_proposal basis → the bid
   package), `field_2135`, `field_2119` (REL_project → object_3), `field_2122` (SOW id,
   "60486704913-SW1589") and `field_2126` (name). The SOW carries NO tech-group link — the sub is
   reached through the basis bid (below).
2. **Project** — Get a record, object_3, from the SOW's `field_2119`. Read `field_1199`
   (DOC_associated SCW CU task ID = the Install Work task, list `48524051`), `field_1622`
   (project number), the client name.
3. **SVS task** — the sub's twin task on list `901400816107`. Copy the exact lookup from the
   QA-fail scenario (it already walks project → `field_1199` → subcontractor task → comment).
4. **Bid package** — Get a record, object_115, from the SOW's `field_2942` (or the payload's
   `bidPackageId` on `confirm-extension`). Read `field_2635`, `field_2550` (status), `field_2638`
   (label), `field_2414` (bid id), `field_2636` (friendly name), `field_2387` (SOW), `field_2386`
   (REL_site survey request → object_113, the dashboard the link lands on) and **`field_2954`
   (REL_tech group → object_51, the sub)**.
5. **Proposal** — Get a record, object_125, `proposalRecordId`. Read / write `field_2659`.
6. **The sub's people** — Get a record, object_51 (CORE_tech group), from the bid's `field_2954`.
   `field_2679` INPUT_survey notification emails is the address list the survey sends already use;
   the survey request (object_113) also carries `field_2347` REL_tech group and `field_2411`
   CORE_contacts. Copy the exact recipient resolution and the send module from 04.04 / the QA-fail
   scenario rather than re-deriving it.

## Router on `stepId`

### `request-extension` (sales SOW page, reconcile page, Preview Proposal page)

Payload: `sowId, proposalRecordId, requestedDate, reason, currentQuoteExpiration, triggeredBy
{name,email}, requestedBy ('sales' | 'ops'), requestText, requestHtml`, and when Ops requested
over discontinued products also `discontinuedProducts [{id,name,count}]` + `riskAcknowledged`.
`requestText` / `requestHtml` are the fixed record for the comments (they already carry the
WARNING line when present) — post them verbatim, do not rebuild them.

Decide, in this order:

| Case | Condition | Writes | Reply |
|---|---|---|---|
| No basis bid | SOW `field_2942` empty | none. Comment on the Install Work task; notify Ops. | `routedTo: 'ops'` |
| Within the bid | `requestedDate` ≤ bid `field_2635` | proposal `field_2659` = requestedDate; SOW `field_2135` = requestedDate. Comment on the Install Work task; notify the requester. | `routedTo: 'auto'` |
| Past the bid, or bid date blank | otherwise | SOW `field_3314` = `Requested`, `field_3315` = requestedDate; bid `field_3316` = Yes, `field_3317` = requestedDate. ClickUp: BOTH tasks → **Waiting on Bid**, only if the Install Work task is in **Final Bid Submitted** (any other status: comment, move nothing). Comment `requestHtml` on both tasks. Notify the sub with ONE link to the bid page (see below). | `routedTo: 'svs'` |

Date compare: `parseDate(requestedDate; "M/D/YYYY") <= parseDate(bid.field_2635; "M/D/YYYY")`.
A second request while `field_3316` is already Yes = treat as a nudge (re-notify, comment), do
not move tasks again.

The sub's link: the Preview Bid page under the SURVEYS DASHBOARD, with the portal's parent slugs (scene_1149 sits under
scene_1140 under scene_1138 `subcontractor-portal`) —
`https://scwinstallation.knack.com/installationservices#subcontractor-portal/site-survey-request-details/<surveyRequestId>/edit-bid-package/<bidPackageId>/`
(`surveyRequestId` = the bid's `field_2386`; the dashboard alone,
`…#subcontractor-portal/site-survey-request-details/<surveyRequestId>/`, also works: the banner there links to the bid).
Notification content, project number FIRST: project number, client, SOW number, bid id + friendly
name, current bid expiration, requested quote date, the requester's reason, the WARNING line when
present, the one link.

### `confirm-extension` (sub bid page)

Payload: `bidPackageId, sowId, outcome ('extend' | 'reprice' | 'decline'), bidExpiration
(extend only), note, triggeredBy`.

| Outcome | Writes | ClickUp (both tasks) | Notify |
|---|---|---|---|
| `extend` | bid `field_2635` = bidExpiration. Quote = the EARLIER of SOW `field_3315` and bidExpiration → proposal `field_2659` AND SOW `field_2135` in the same run. SOW `field_3314` = blank, `field_3315` = blank; bid `field_3316` = No, `field_3317` = blank. | → Final Bid Submitted. Comment: "Bid extended to …, quote extended to …" + the note. | the requester (the AE or Ops) |
| `reprice` | **Gated on the quote's expiration** (SOW `field_2135`, the proposal's mirror — decided 2026-11-05). Quote already expired → bid `field_2550` → Draft + the Reopen Bid unlock (object_114 `field_2551` = No on the bid's items); SOW `field_3314` = `Re-Pricing`; bid `field_3316` = No. Quote still runs (or blank) → the bid stays LOCKED: bid `field_3316` = No, SOW `field_3314` = **`Re-Price Requested`** (new Builder option). | expired → both tasks **Waiting on Bid** (they are there already from the request; moved only from Final Bid Submitted — re-pricing is the sub's work, decided 2026-11-05), comment with the note. Held → nothing moves; comment (notify all) on the SCW task naming the choice: "Reopen bid for re-pricing" or "Keep quote as is" (close before the quote expires). | AE (Slack mention) + SCW (task comment, notify all) either way; the sub is told which |
| `decline` | nothing on the dates. SOW `field_3314` = blank, `field_3315` = blank; bid `field_3316` = No, `field_3317` = blank. | → Final Bid Submitted. Comment with the note. | the requester + Ops |

The proposal to write on `extend`: the SOW's published proposal(s) with status Published —
search object_125 by SOW (`field_2666` = sowId) and status `field_2658` = Published; write
`field_2659` on each (one is the norm).

### `reopen-reprice` / `keep-quote` (Ops rows on the reconcile / preview pages, the held re-price)

Payload: `sowId, triggeredBy`. The bid = the SOW's basis bid (`field_2942`).

- `reopen-reprice`: the expired-quote re-price sequence on that bid (Draft + unlock, SOW `Re-Pricing`, both tasks →
  Waiting on Bid, comments, Slack). The reconcile page's native **Reopen Bid** fires it too when the SOW reads
  `Re-Price Requested` (`quote-extension.js` `afterReopenBid`, called by `bid-review/init.js handleReopenBid` after its
  PUTs land — Make's bid writes repeat them, idempotently).
- `keep-quote`: SOW `field_3314` = blank, bid `field_3316` = No, both tasks → Final Bid Submitted (when parked in
  Waiting on Bid); the sub is told the bid stays as submitted; the SCW comment says "close before <quote expiration>".

### `nudge-extension` / `cancel-extension` (sales card, Ops rows)

Payload: `sowId, triggeredBy`.

- `nudge`: re-send the sub's notification; comment "Reminder sent" on both tasks. No writes.
- `cancel`: SOW `field_3314` = blank, `field_3315` = blank; bid (via `field_2942`) `field_3316` =
  No, `field_3317` = blank; both tasks → Final Bid Submitted; comment on both.

### Response (every route)

Webhook Response, JSON: `{ "success": true, "routedTo": "svs" | "ops" | "auto", "message": "…" }`
or `{ "success": false, "error": "…" }`. The Response module sits right AFTER the route's Knack writes
and BEFORE the ClickUp / Slack modules: the pages read `routedTo` off the reply to decide the pending
state, so a 200 before the writes would show "pending" on a request that then failed, while a ClickUp
or Slack failure after the writes must not turn a landed request into a page error. The Slack modules
carry an Ignore error handler and the deal-owner lookup the source scenarios' Resume (fallback
`var.organization.sales_fallback_slackID`); a ClickUp failure still shows in the run history. The
search-and-iterate tails (published proposals on `extend`, the bid's line items on `reprice`) stay
last. `nudge` has no writes, so its Response stays last. (Runs are short — no PDF — so the 40 s
limit is not a concern.) **Make rule the generator follows**: a filter that fails STOPS the rest of its flow
line, so a filtered module (the bid write that needs a basis bid, a status move that needs Waiting on Bid) is
never followed by a module that must run — the filtered tails and the search → iterate tails are parallel
routes of a closing router.

## The shared publish scenario (hook `…mezrtqmf…`) — one added module

After the published-proposal record is created on `publish-final` / `publish-proposal`: Update
the SOW `field_3314` = blank and `field_3315` = blank when `field_3314` reads `Re-Pricing`. That is
how the re-price cycle closes — the sales card stops saying "re-pricing" the moment the new
proposal is out. (Unconditional clearing is also fine: nothing else holds the field.)

## ClickUp specifics

- Lists: Install Work `48524051` (the project's `field_1199` task), SVS `901400816107`.
- Statuses used (both lists have them): `waiting on bid`, `final bid submitted`.
- Guard: move only when the Install Work task is in `final bid submitted`; otherwise comment only.
  No status is stashed — every close returns to Final Bid Submitted (only from Waiting on Bid); a re-price keeps
  the tasks in Waiting on Bid (the sub is working) and the sub's resubmission moves them on as any bid submission does.

## Build plan — blueprint delivered 2026-11-05

`tools/bp_gen_0608.py` generated "06.08 BID RECONCILLIATION - request expiration date extension.blueprint.json"
(76 modules, 7 error-handler directives) from the user's webhook-only 06.08 export (hook 2866644 kept) and
modules cloned out of the 00.00 / 06.02 / 06.03 / 06.04 exports, so every Knack / ClickUp / Slack module
carries the live connection ids and the proven lookups (project `field_1199` → `clickup:getATask` →
`custom_fields.Subcontractor Task ID` = the SVS task; `Slack Thread` custom field → thread ts; deal owner by
`field_1087`). **Import it INTO the 06.08 scenario** (Scenario → Import blueprint) so the hook stays. The
sub is notified through a ClickUp comment on the SVS task with Notify all ON and the portal link (no email
module — the tech-group recipient resolution from 04.04 was not needed). What is NOT in the blueprint: the
publish scenario's status-clear module (below) — it needs that scenario's export.

Verify on the first runs (Make answers nothing of this at import time):

- SOW `field_3314` cleared by `{{emptyarray}}` on extend / decline / cancel (modules "SOW status = blank").
  If Knack ignores it (the record still reads Requested), replace that mapping with a Knack "Make an API
  Call" PUT of `{"field_3314": ""}`, or add a third option "None" and have the bundle read it as blank.
- The ClickUp status names `waiting on bid` / `final bid submitted` typed into
  `editATaskAdvanced` (both lists carry them; the module takes the literal name).
- Scenario settings → **Sequential processing OFF** — Make refuses a Webhook Response module in a sequential
  scenario ("Responder is not supported when scenario is configured for sequential processing", seen on the
  first import 2026-11-05). Two requests on one SOW seconds apart could race the status writes; the routes are
  idempotent, the last one wins, accepted.
- The dates: the request route compares `requestedDate` with the bid's `field_2635` as epoch seconds
  (`formatDate(parseDate(…; "M/D/YYYY"); "X")`); a blank bid date routes to the sub. Knack date fields
  are written as `M/D/YYYY` strings with `_datetype: simple`.
- The requested-date fields (`field_3315` / `field_3317`) are NOT blanked on extend / decline / cancel — an
  empty mapped value is not sent by the Knack module and the readers key off the status / flag, so the
  stale date is harmless; the next request overwrites it.

Then: QA as the preview login (`quote-extension.js` `CONFIG.previewEmails`, shipped as micah.shearer@getscw.com —
every surface renders for that login only; in that browser `localStorage.scwQuoteExtHook = '<the 06.08 hook URL>'`
points the POSTs at the scenario before the URL is committed; sub-page testing under a sub login needs
`localStorage.scwQuoteExtPreview = '1'` in that browser) on a test SOW (sales card → Make → sub card → extend /
re-price / decline). The URL is in `MAKE_QUOTE_EXTENSION_WEBHOOK` (`src/config.js`) since 2026-11-05; launch =
`previewEmails: []`, rebuild, push.

## QA checklist (preview flag on, test SOW with a basis bid)

- Sales: request within the bid → `auto`, dates on the proposal and SOW move, no pending state.
- Sales: request past the bid → `svs`; SOW `field_3314` Requested; bid flag Yes; both tasks Waiting
  on Bid; the sub's dashboard banner and bid card appear.
- Sub: extend to an earlier date than asked → quote lands at the sub's date; flags clear; tasks
  back to Final Bid Submitted; the sales card returns to the button.
- Sub: re-price on an EXPIRED quote → bid Draft, SOW Re-Pricing (the sales card says so), tasks stay Waiting on Bid; a
  publish-final clears it.
- Sub: re-price while the quote still runs → bid stays locked, SOW Re-Price Requested (sales card read-only, the Ops
  rows offer Keep quote as is | Reopen bid for re-pricing), AE Slack ping + SCW task comment; Reopen → the expired
  path; Keep → status blank, tasks back, the sub told; the native Reopen Bid also closes the held state.
- Sub: decline → dates untouched, flags clear, tasks back.
- Sales: cancel and nudge from the pending card.
- Ops: request over discontinued products → the WARNING line reaches both comments and the sub.
- A request on a SOW whose task is not in Final Bid Submitted → comment only, no move.
