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
Sales touch. If Sales doesn't capture details up front, they request the
survey after validation via the same survey-details modal.

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

1. **Up-front survey details = a real Survey Request record in "Pending
   Validation" status.** No survey-detail fields duplicated onto the SOW
   header, no Make-side datastore. The REQ record is created immediately
   (by Make, from the modal payload) but pending. Every surface that lists
   REQ records gets a "status is not pending" filter (blank fails safe —
   same pattern as the CO Type filter).
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

> A REQ created while the SOW is **not yet validated** is created **Pending
> Validation** and fires when Ops marks ready. A REQ created while the SOW
> **is validated** fires immediately (today's behavior).

So "Request SOW Validation & Survey" = capture details at initiation (REQ
pending, fires on validation); "Request Survey" = capture after validation
(REQ live, fires now). One shared survey-details modal component, one
object, one activation rule — the actions differ only in WHEN the REQ is
created relative to `field_2723`.

### Sales stepper (scene_1116, workflow-stepper.js) — the THREE-ACTION model

**Hard UX requirements (2026-08-02):**
- NO form → return → second-form round-trip. Every action is a single
  custom modal + single webhook — the replace-the-native-form pattern the
  codebase already uses (`co-add-item-form.js` → MAKE_CO_ADD_ITEMS_WEBHOOK,
  `qa-popover.js`, bulk-upload modal).
- Sales sees exactly THREE possible actions, surfaced by SOW state —
  "Initiate" is no longer a visible verb (project setup rides invisibly on
  the validation actions):

  1. **"Request SOW Validation & Survey"** — the everything-at-once path.
  2. **"Request SOW Validation Only (request survey later)"**.
  3. **"Request Survey"** — only on an already-validated SOW.

**State → what renders** (after Project Playbook, which is unchanged):

| SOW state | Stepper shows |
|---|---|
| Playbook incomplete | Actions 1 + 2 visible but locked ("Complete the Project Playbook first") |
| Playbook done, no validation requested | Actions 1 + 2 active, side by side |
| Validation requested, waiting on Ops | Locked status row — "Validation requested — survey armed, sends when Ops validates" (action 1) or "Validation requested — waiting on Ops" (action 2) |
| Validated (`field_2723` = Yes), no REQ | Action 3 active |
| Survey requested (`field_2706` = Yes) / CR path (`field_2728` > 0) | Completed states + downstream steps as today |

**Action behaviors:**

- **Action 1 — Request SOW Validation & Survey**: modal = initiate-form
  fields (⚠️ discovery) + the survey-details section (view_3853's field
  set: instructions, other notes, POC, scheduling prefs, …; POC/connection
  inputs reuse the ops-stepper `recipient` picker pattern or `ns.picker`).
  Footer: Cancel | Request Validation & Survey. One webhook → Make does
  project setup + Ops validation ping + creates the **Pending Validation
  REQ**. Payload: `{ sourceRecordId, surveyMode: 'now', survey: {…},
  notes, triggeredBy }`.
- **Action 2 — Request SOW Validation Only**: modal = initiate-form fields
  + notes. Same webhook, `surveyMode: 'later'`, `survey: null` → project
  setup + validation ping only.
- **Action 3 — Request Survey**: THE SAME survey-details modal component as
  action 1's survey section — one shared form component, one field set.
  Fires the same webhook shape (`surveyMode: 'now'`, no initiate section —
  project setup already done, Make no-ops it) → creates a REQ that fires
  immediately (SOW already validated). **This replaces the native
  view_3853 form entirely** — survey capture looks identical at every
  entry point. Retire/hide view_3853's form once cut over (its accordion
  shell may remain as the host for the status/completed states, or the
  action row replaces it — implementer's choice, prefer whichever keeps
  the completed/CR-path messaging that exists today).
- After actions 1/2: the fired step locks into "Initializing project…" and
  the existing `pollAfterClick` machinery polls until `field_1199` lands
  (completion refreshes view_3491 as today), then the waiting-on-Ops
  status row takes over (driven by server state — the pending REQ rollup /
  a validation-requested field — NOT localStorage).
- **Removed**: the standalone "Request SOW validated" button + its
  `requestedState` localStorage machinery, and the initiate menu step
  (view_3828).

**Decision (per 2026-08-02 session): action 3 is HIDDEN until validated.**
There is no pre-validation "arm the survey late" affordance — a Sales user
who picked action 2 and changes their mind before Ops validates simply
waits for validation, then uses action 3. (The pending-REQ activation rule
in Make still supports arming pre-validation if we ever want to add a
change-of-mind affordance later; it's a UI decision, not a data-model one.)

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
- **view_3853 form**: RETIRED once the shared survey-details modal ships —
  all REQ creation goes through Make from the modal payload, and the
  pending-vs-live status rule lives in the Make scenario (create pending
  when the SOW's `field_2723` ≠ Yes, live otherwise). (⚠️ Discovery still
  required: what view_3853's submit does today — its record rules and
  whatever flips `field_2706` must be ported into the scenario.)
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
- **Sales changes mind (arm late)**: intentionally NOT offered — action 3
  is hidden until validated (locked decision above). If Sales picked
  "Validation Only" and wants the survey sooner, they wait for validation;
  the data model supports adding a pre-validation arm affordance later
  without schema changes.
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
6. Whether `field_1199` (install project link) is per-SOW or effectively
   project-level (shared across duplicate SOW options via the project
   connection). If shared, the validation actions on a second SOW option
   must have Make no-op the project-setup portion (idempotent create), and
   the stepper's "not initiated" state may never appear on siblings —
   confirm how the duplicate-SOW flow (`create-sow-option-btn.js`,
   `field_2917`, the sibling-survey `completedMessage` link) interacts.

### Implementation order

1. Discovery: initiate form + view_3853 form field lists / record rules /
   watching scenarios (items above) — the modal's field set and the Make
   port both depend on them.
2. Builder: REQ pending status + SOW pending-REQ rollup + view filters.
3. Make: gate the REQ-creation scenario on status ≠ pending (safe no-op
   until pending records exist).
4. Make: extend the initiate scenario to webhook-driven (project setup +
   validation ping + optional pending-REQ create from payload).
5. Bundle: the shared survey-details modal component + the three action
   steps (validation&survey / validation-only / request-survey), state-
   driven rendering, keep `pollAfterClick`; remove the
   request-sow-validation step and the initiate menu step.
6. Make: mark-ready activation branch.
7. Ops surfaces: stepper modal context line + pill badge.
8. Cleanup: retire `MAKE_REQUEST_SOW_VALIDATION_WEBHOOK` step config,
   localStorage `requestedState` code, the standalone Make scenario, the
   old initiate form page / view_3828 menu, and the native view_3853 form.
