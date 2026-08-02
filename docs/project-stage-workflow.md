# Project Stage Workflow — Initiation → Survey Requested (redesign)

Status: **design locked 2026-08-02** (planning session). Implementation not started.
Owner surfaces: scene_1116 sales build stepper, ops-stepper (scene_1096),
ops-review-pill (view_3325), survey request form (view_3853), Make scenarios
(initiate, mark-ready, survey-request).

## The change in one paragraph

Today the funnel is three serialized gestures with two dead-air handoffs:
Sales initiates the install project → waits → Ops validates the SOW
(`field_2723` = Yes) → waits → Sales submits the survey request form
(`field_2706` = Yes). The redesign makes **initiation subsume the validation
ask** (initiating = "set up the project AND ask Ops to validate"), and lets
Sales **optionally capture the survey-request details at initiation time** so
the survey request fires automatically the moment Ops validates — no second
Sales touch. If Sales doesn't capture details up front, they fill the same
form later exactly as today.

## Current state (as-is reference)

SOW-header flags driving `workflow-stepper.js` (source view_3827):

| Flag | Meaning | Writer |
|---|---|---|
| `field_2724` | Project Playbook complete | Sales form view_2924 |
| `field_1199` | Install project link — populated = initiated | Make (initiate scenario) |
| `field_2723` | FLAG_ready for survey (validated) | Make (mark-ready, fired by Ops) |
| `field_2706` | FLAG_survey requested | Survey request form view_3853 path |
| `field_2728` | Pending change-request count | System (CR path supersedes survey path) |
| `field_2917` | Count gate on the validation-request button (⚠️ confirm meaning in Builder — likely SOW line-item count) | System |

Current sequence:
1. Playbook form (view_2924) → `field_2724`.
2. "Initiate Installation Project" stepper action → Knack form (menu
   view_3828) → Make creates ClickUp project etc. → `field_1199`; stepper
   polls (`pollAfterClick`) until it lands.
3. Optional side-channel: "Request SOW validated as ready for Survey" button →
   `MAKE_REQUEST_SOW_VALIDATION_WEBHOOK` (notify-only Slack/CU ping; state
   remembered only in localStorage with a 24h TTL — invisible to Ops/Make).
4. Ops: pill on view_3325 → proposal preview page → ops-stepper "Mark Ready
   for Survey" → `MAKE_OPS_MARK_READY_WEBHOOK` (stepId `mark-ready`) → Make
   flips `field_2723`, updates CU, Slack, publishes TBD draft quote.
5. Sales: view_3853 accordion (disabled until `field_2723` = Yes) → REQ record
   created, `field_2706` = Yes. Downstream (survey report, sub portal, alt
   proposals) keys off that.

## Locked decisions (2026-08-02)

1. **Path-A details = a real Survey Request record in "Pending Validation"
   status.** No survey-detail fields duplicated onto the SOW header, no
   Make-side datastore. Sales fills the SAME form (view_3853); the REQ record
   is created immediately but pending. Every surface that lists REQ records
   gets a "status is not pending" filter (blank fails safe — same pattern as
   the CO Type filter).
2. **Initiation subsumes the validation ask.** There is no separate "request
   validation" button anymore. Initiating the install project ALWAYS asks Ops
   to validate. The old notify-only webhook's job moves into the initiate
   flow; the localStorage `requestedState` hack is retired in favor of
   server-visible state.
3. **Validation fires the armed survey immediately — zero further review.**
   Ops's Mark Ready modal states plainly that confirming will send the
   survey request; validation is an informed single gesture.

## Target design

### The unifying insight

The fork ("survey now" vs "survey later") is NOT two branches of logic — it's
**one rule applied at REQ-creation time**:

> The survey request form is fillable any time after initiation. A REQ
> created while the SOW is **not yet validated** is created **Pending
> Validation** and fires when Ops marks ready. A REQ created while the SOW
> **is validated** fires immediately (today's behavior).

So "everything at once" = fill the form right at initiation; "same basic
flow" = fill it after validation. One form, one object, one activation rule.

### Sales stepper (scene_1116, workflow-stepper.js)

**Hard UX requirement (2026-08-02): NO form → return → second-form
round-trip.** Sales does ONE gesture. The initiate step therefore stops
navigating to the Knack form entirely and becomes a single custom modal +
single webhook — the same replace-the-native-form pattern the codebase
already uses (`co-add-item-form.js` → MAKE_CO_ADD_ITEMS_WEBHOOK,
`qa-popover.js`, bulk-upload modal).

1. **Project Playbook** — unchanged.
2. **Initiate Installation Project** — becomes a `webhookAction` step
   opening ONE custom modal:
   - **Top section**: whatever the current initiate Knack form collects
     (⚠️ discovery — it may be little more than a confirm; see below).
   - **Choice radio**:
     - "Request the site survey now" → reveals the survey-details section
       inline (same fields as view_3853's form: instructions, other notes,
       POC, scheduling prefs, …). For the POC/connection inputs, reuse the
       ops-stepper `recipient` picker pattern (issue-change-order reads
       contacts from a view + editable name/email/phone) or `ns.picker`.
     - "I'll request the survey when I'm ready" → survey section stays
       hidden.
   - **Footer**: Cancel | Initiate Project.
   - Submit fires ONE webhook (the extended initiate scenario). Payload:
     `{ sourceRecordId, surveyMode: 'now'|'later', survey: {…details}|null,
     notes, triggeredBy }`. Make does everything server-side: project setup
     (as today) + the Ops validation ping + (when `survey` present) creates
     the Pending Validation REQ record.
   - The existing `pollAfterClick` machinery is kept as-is — the step locks
     into "Initializing project…" and polls until `field_1199` lands.
     Completion refreshes view_3491 as today.
3. **"Request SOW validated" button** — REMOVED (subsumed by initiation).
   Keep the webhook key temporarily for the Make transition; delete the step
   config + `requestedState` machinery.
4. **Request Site Survey accordion (view_3853)** — no longer part of the
   initiation gesture; it remains the "later" path and the change-of-mind
   path. Gate loosens from "validated" to **"initiated"** (`field_1199` has
   value), preserving the unifying rule:
   - Not initiated → locked, "Initiate the installation project first".
   - Initiated, no REQ, not validated → open; submitting creates a Pending
     Validation REQ (helper text: "sends automatically when Ops
     validates"). This is how a "later" Sales changes their mind early.
   - Pending REQ exists (from either path) → info state: "Survey request
     armed — sends when Ops validates" + link to review/edit the pending
     REQ. Completed check stays keyed on `field_2706` = Yes / CR path
     (`field_2728` > 0) as today.
   - Validated, no REQ → open, submits fire immediately (today's behavior).
5. Downstream steps — untouched.

### Ops surfaces

- **ops-stepper.js (view_3345)** — Mark Ready step: when a pending REQ
  exists for this SOW, add a context line in the modal: "A survey request is
  armed for this SOW — marking ready will send it to the subcontractor
  immediately." Read via a hidden/existing view carrying the pending-REQ
  rollup (see Builder section).
- **ops-review-pill.js (view_3325)** — insert a state between "Mark Ready"
  and "Ready for Survey": same "Mark Ready for Survey" action pill but badged
  "(survey armed)" when the pending-REQ rollup > 0, so Ops can prioritize
  SOWs where validation unblocks the whole chain.

### Builder work

- **Survey Request object**: add a status option (or new Yes/No flag)
  `Pending Validation`. Confirm whether the existing status field
  (`field_2349`) can take a new option vs. needing a dedicated flag —
  prefer extending status so the sub-portal timeline logic stays single-field.
- **SOW header**: add a rollup/count of connected REQ records in Pending
  Validation status (the `field_2728` pattern) so steppers/pills/Make can
  read "armed" without fetching REQ records. Expose it on view_3827,
  view_3325, and view_3861.
- **view_3853 form**: record rule sets status = Pending Validation **when
  the SOW's `field_2723` ≠ Yes** at submit time; otherwise today's rules run
  unchanged. (⚠️ Discovery required first: confirm exactly what view_3853's
  submit does today — does the form create the REQ directly with record
  rules flipping `field_2706`, or does Make create the REQ? The activation
  design plugs into whichever it is.)
- **REQ-listing views** (sub portal, survey grids, ops views): add
  "status is not Pending Validation" filters. Blank status must fail safe
  (treated as not-pending, i.e. visible) so legacy records are unaffected.

### Make work

- **Initiate scenario**: becomes webhook-driven from the custom modal (the
  Knack initiate form is retired from this flow — hide/retire view_3828 and
  its form page once cut over). One run does: project setup (as today,
  including whatever the old form's record rules/fields did — port them
  into the scenario), the Ops validation ask (the notify that
  `MAKE_REQUEST_SOW_VALIDATION_WEBHOOK` sends today — Slack/CU ping, now
  stating whether a survey is armed since both facts arrive in one
  payload), and — when `payload.survey` is present — creation of the
  Pending Validation REQ record from the payload fields.
- **Mark-ready scenario** (`MAKE_OPS_MARK_READY_WEBHOOK`, stepId
  `mark-ready`): new branch after flipping `field_2723` — find Pending
  Validation REQ(s) for this SOW; if found AND `field_2728` = 0 (CR path not
  active), activate: status → Requested, stamp requested date
  (`field_2351`), flip `field_2706` = Yes on the SOW, notify sub + Sales.
- **Survey-request scenario** (whichever reacts to REQ creation): must NOT
  fire sub notifications / requested-date stamping for Pending Validation
  creates — gate the existing scenario on status ≠ pending.
- **Retire** the standalone validation-request scenario once the initiate
  scenario carries the ping (keep the webhook live during transition).

### Edge cases (answered)

- **Ops validates before Sales finishes capturing details**: the REQ submit
  then happens against a validated SOW → fires immediately. Correct outcome,
  no special handling.
- **CR path supersedes** (`field_2728` > 0): mark-ready's activation branch
  checks CR count and skips activation; the pending REQ stays parked (the CR
  flow reroutes to alt-bids on both steppers already).
- **Sales changes mind (disarm)**: the pending REQ is a real record — give
  the armed info-state a "cancel request" affordance (status → Void/Draft or
  delete). v1 can punt to editing/deleting via the REQ's own page.
- **Stale pending REQs** (SOW never validated): visible on the SOW's armed
  state and the ops pill badge; no TTL — they ride the SOW.
- **Legacy SOWs mid-flow at cutover**: no pending REQs exist, rollup = 0,
  view_3853's new gate (`field_1199` instead of `field_2723`) only ever
  *loosens* — nothing regresses.

### Open discovery items (before implementation)

1. What the CURRENT initiate form (reached via menu view_3828) collects —
   its full field list + record rules. Everything it does must be either
   ported into the custom modal (user-entered fields) or into the Make
   scenario (record rules / connections). Also: does anything else link to
   that form page besides the stepper?
2. What view_3853's submit does today (form record rules vs Make creates the
   REQ; what flips `field_2706`). Determines where the pending-status rule
   lives for the "later"/change-of-mind path. Also confirm the form's full
   field list — it defines the survey-details section of the initiate
   modal — and whether it includes any FILE upload inputs (a custom modal
   needs the base64→Make pattern from bulk-upload.js for those).
3. Whether REQ status `field_2349` can take a new option cleanly (check
   sub-portal `survey-request-header.js` statusMod mapping — 'pending' bucket
   already renders amber, so "Pending Validation" maps fine).
4. What `field_2917` counts (existing >0 gate) — preserve the same guard on
   the new flow (don't let an empty SOW enter validation).
5. Which Make scenario watches REQ creation today, and whether the
   sub-notification lives there or in Knack record rules/emails.

### Implementation order

1. Discovery: initiate form + view_3853 form field lists / record rules /
   watching scenarios (items above) — the modal's field set and the Make
   port both depend on them.
2. Builder: REQ pending status + SOW pending-REQ rollup + view filters.
3. Make: gate the REQ-creation scenario on status ≠ pending (safe no-op
   until pending records exist).
4. Make: extend the initiate scenario to webhook-driven (project setup +
   validation ping + optional pending-REQ create from payload).
5. Bundle: the new initiate modal (choice radio + survey-details section,
   one webhook, keep `pollAfterClick`); view_3853 gate change +
   armed/capture header states; remove request-sow-validation step.
6. Make: mark-ready activation branch.
7. Ops surfaces: stepper modal context line + pill badge.
8. Cleanup: retire `MAKE_REQUEST_SOW_VALIDATION_WEBHOOK` step config,
   localStorage `requestedState` code, the standalone Make scenario, and
   the old initiate form page / view_3828 menu.
