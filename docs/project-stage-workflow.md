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
survey after validation via the same form, exactly as today.

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
   through the normal view_3853 form path, and Make's branch sets it
   pending when the SOW isn't validated. Every surface that lists REQ
   records gets a "status is not pending" filter (blank fails safe — same
   pattern as the CO Type filter).
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

So "Validate SOW & Request Survey" = capture details before validation (REQ
pending, fires on validation); "Request Survey" = capture after validation
(REQ live, fires now). ONE form (view_3853), one object, one activation
rule — the two labels differ only in WHEN the REQ is created relative to
`field_2723`, and Make applies the rule at submission time.

### Sales stepper (scene_1116, workflow-stepper.js) — TWO BUTTONS, dynamic label

**Final construct (2026-08-02, supersedes the custom-modal / three-action
drafts):** reuse BOTH existing Knack forms; no custom modal, no form
chaining. Sales conceptually has three actions, implemented as two
buttons — the survey button's label is computed from SOW state, and Make
branches on validation state at submission time.

1. **Project Playbook** — unchanged.
2. **"Request SOW Validation Only (request survey later)"** — the current
   "Initiate Installation Project" step RENAMED, mechanics untouched: same
   Knack form (menu view_3828), same Make scenario (now ALSO sending the
   Ops validation ping), same `pollAfterClick` on `field_1199`, same
   view_3491 refresh. Under the new SOP, `field_1199` populated ≡
   "validation requested" — no new field needed. Once fired, renders
   completed/locked ("Validation requested — waiting on Ops" until
   `field_2723` = Yes, then plain completed).
3. **The survey button** — the view_3853 accordion, ungated except for the
   Playbook, with a state-computed label. Both labels lead to the SAME
   form; Make decides what submission means:

   | SOW state | Label | On submit, Make… |
   |---|---|---|
   | Playbook incomplete | (locked, "Complete the Project Playbook first") | — |
   | `field_2723` ≠ Yes (not validated — whether or not initiated, whether or not validation-only was already fired) | **"Validate SOW & Request Survey"** | creates the REQ as **Pending Validation**, pings Ops to validate ("survey armed"), and — when `field_1199` is empty — ALSO runs project setup (so path A is one gesture with no prior initiate click) |
   | `field_2723` = Yes | **"Request Survey"** | today's behavior — REQ fires immediately (`field_2706` = Yes, sub notified) |

   Additional accordion states: pending REQ exists → info/armed state
   ("Survey request armed — sends when Ops validates" + link to
   review/edit); completed stays keyed on `field_2706` = Yes / CR path
   (`field_2728` > 0) exactly as today.
4. **Removed**: the standalone "Request SOW validated" button + its
   `requestedState` localStorage machinery (subsumed — both remaining
   buttons ARE validation requests).
5. Downstream steps — untouched.

Notes on the construct:
- **Change-of-mind (arm late) is free**: after "Validation Only" while
  waiting on Ops, the survey button still reads "Validate SOW & Request
  Survey"; submitting it arms the survey mid-wait. No special affordance.
- **Both buttons stay visible post-playbook** until their state resolves
  them (validation-only → completed once `field_1199` lands; survey →
  armed/completed per above). If Sales goes straight to "Validate SOW &
  Request Survey", the validation-only button flips to its
  completed/requested state too (`field_1199` lands via that path's
  setup).
- **The label swap is client-side trivia** (`conditionMet` on
  `field_2723` in the accordion header) — the real branch lives in Make.

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
- **view_3853 form**: STAYS — it's the single survey-capture surface for
  both labels. The pending-vs-live decision lives in the Make branch, not
  form record rules. (⚠️ Discovery required: what view_3853's submit does
  today — its record rules and whatever flips `field_2706` — the branch
  has to be inserted upstream of the sub-notification and the
  `field_2706` flip.)
- **REQ-listing views** (sub portal, survey grids, ops views): add
  "status is not Pending Validation" filters. Blank status must fail safe
  (treated as not-pending, i.e. visible) so legacy records are unaffected.

### Make work

- **Initiate scenario** (unchanged trigger — the view_3828 form path):
  after project setup, ALSO send the Ops validation ask (the Slack/CU ping
  that `MAKE_REQUEST_SOW_VALIDATION_WEBHOOK` sends today), since this
  button now MEANS "Request SOW Validation Only".
- **Survey-request scenario — THE BRANCH** (whichever scenario/rules react
  to view_3853's submit today; ⚠️ discovery): read the SOW's `field_2723`
  at run time and fork —
  - **Validated** → today's behavior: REQ live/Requested, stamp requested
    date (`field_2351`), flip `field_2706` = Yes, notify sub.
  - **Not validated** → set REQ status = Pending Validation, ping Ops to
    validate ("survey armed" phrasing), do NOT notify the sub or stamp the
    requested date, and — when `field_1199` is empty — ALSO run project
    setup (call/duplicate the initiate scenario's setup steps) so
    "Validate SOW & Request Survey" is a complete single gesture on a
    fresh SOW.
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
- **Sales changes mind (arm late)**: supported for free — while waiting on
  Ops the survey button reads "Validate SOW & Request Survey"; submitting
  arms the survey mid-wait (Make's not-validated branch, project setup
  no-oped since `field_1199` is populated).
- **Submission ↔ validation race**: a REQ submitted moments before Ops
  clicks Mark Ready could be seen by both scenarios. Both sides must be
  idempotent: activation = a status flip FROM Pending Validation only
  (skip if already Requested), and the fire-now branch must not re-fire a
  REQ that mark-ready already activated. Same guard covers Make retries.
- **Stale pending REQs** (SOW never validated): visible on the SOW's armed
  state and the ops pill badge; no TTL — they ride the SOW.
- **Legacy SOWs mid-flow at cutover**: no pending REQs exist, rollup = 0,
  and view_3853's new gate (playbook-only, instead of `field_2723`) only
  ever *loosens*; a validated legacy SOW shows "Request Survey" and
  behaves exactly as today — nothing regresses.

### Open discovery items (before implementation)

1. Which Make scenario the initiate form (via menu view_3828) triggers —
   so the Ops validation ping can be added to it, and so its project-setup
   steps can be reused/called from the survey scenario's not-validated
   branch (the `field_1199`-empty case).
2. What view_3853's submit does today (form record rules vs Make; what
   flips `field_2706`; where the sub notification fires). The
   validated/not-validated branch must be inserted UPSTREAM of the
   notification and the `field_2706` flip.
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

1. Discovery: items above — chiefly the two scenarios behind the initiate
   form and the view_3853 submit.
2. Builder: REQ "Pending Validation" status + SOW pending-REQ rollup +
   "status is not pending" filters on REQ-listing views.
3. Make: the survey-request branch (validated → fire as today;
   not-validated → pending + Ops ping + conditional project setup). Safe
   to ship before the bundle change — pre-cutover, the form is only
   reachable on validated SOWs, so the new branch is a no-op.
4. Make: initiate scenario adds the Ops validation ping.
5. Bundle (workflow-stepper.js, mostly config): rename the initiate step;
   ungate view_3853 to playbook-only with the state-computed label
   ("Validate SOW & Request Survey" / "Request Survey") + armed info
   state; remove the request-sow-validation step + `requestedState`
   machinery; waiting-on-Ops status rows driven by
   `field_1199`/`field_2723`/rollup.
6. Make: mark-ready activation branch (idempotent — flip FROM pending
   only, skip when CR path active).
7. Ops surfaces: stepper modal context line + pill badge.
8. Cleanup: retire the `MAKE_REQUEST_SOW_VALIDATION_WEBHOOK` step config
   and the standalone validation-notify Make scenario.
