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

1. **Project Playbook** — unchanged.
2. **Initiate Installation Project** — same mechanics (form via view_3828,
   poll `field_1199`), but the click first opens a small choice modal:
   - **"Initiate — I'll request the survey when I'm ready"** → proceed to the
     initiate form as today. The validation ask rides the initiate scenario
     (see Make section).
   - **"Initiate + request the survey now"** → proceed to the initiate form;
     on return, once `field_1199` lands, the stepper auto-expands the
     Request Site Survey accordion so Sales flows straight into capturing
     the survey details. (Intent flag stored per-SOW so the auto-expand
     survives the round-trip; this flag is UX-only — the server-visible
     state is the pending REQ record itself.)
3. **"Request SOW validated" button** — REMOVED (subsumed by initiation).
   Keep the webhook key temporarily for the Make transition; delete the step
   config + `requestedState` machinery.
4. **Request Site Survey accordion (view_3853)** — gate changes from
   "disabled until `field_2723` = Yes" to **"disabled until `field_1199` has
   value"** (initiated). New header states:
   - Not initiated → locked, "Initiate the installation project first".
   - Initiated, no REQ, not validated → open for capture; helper text
     "Details captured now will send automatically when Ops validates".
   - Pending REQ exists → info state: "Survey request armed — sends when Ops
     validates" + link to review/edit the pending REQ. Completed check stays
     keyed on `field_2706` = Yes / CR path (`field_2728` > 0) as today.
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

- **Initiate scenario**: after project setup, ALSO send the Ops validation
  ask (the notify that `MAKE_REQUEST_SOW_VALIDATION_WEBHOOK` sends today —
  Slack/CU ping), so initiation = validation request. Message should state
  whether a survey is armed (armed-ness may land seconds later if Sales is
  mid-form — acceptable; the mark-ready path is the enforcement point, the
  ping is informational).
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

1. What view_3853's submit does today (form record rules vs Make creates the
   REQ; what flips `field_2706`). Determines where the pending-status rule
   lives.
2. Whether REQ status `field_2349` can take a new option cleanly (check
   sub-portal `survey-request-header.js` statusMod mapping — 'pending' bucket
   already renders amber, so "Pending Validation" maps fine).
3. What `field_2917` counts (existing >0 gate) — preserve the same guard on
   the new flow (don't let an empty SOW enter validation).
4. Which Make scenario watches REQ creation today, and whether the
   sub-notification lives there or in Knack record rules/emails.

### Implementation order

1. Builder: REQ pending status + SOW pending-REQ rollup + view filters.
2. Make: gate the REQ-creation scenario on status ≠ pending (safe no-op
   until pending records exist).
3. Bundle: view_3853 gate change + armed/capture header states; initiate
   choice modal + auto-expand; remove request-sow-validation step.
4. Make: mark-ready activation branch; initiate scenario carries the
   validation ping.
5. Ops surfaces: stepper modal context line + pill badge.
6. Cleanup: retire `MAKE_REQUEST_SOW_VALIDATION_WEBHOOK` step config,
   localStorage `requestedState` code, and the standalone Make scenario.
