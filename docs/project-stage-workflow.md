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
| `field_2728` | "FLAG_SOWs with Survey Requested = yes" — PROJECT-level count of SOWs with `field_2706` = Yes, INCLUDING this one (confirmed from live DOM 2026-08-02; the old "change-request count" comments were wrong). `>0` with this SOW's `2706` ≠ Yes ⇒ sibling has the survey | System |
| `field_2917` | "FLAG_SOWs with Survey Validated" — project-level count (confirmed 2026-08-02) | System |

**Confirmed 2026-08-02 (live DOM):** `field_2706` flips at SUBMIT via the
view_3853 form's record rule, regardless of validation state — so
**armed = `field_2706` = Yes AND `field_2723` ≠ Yes**, derivable on every
view that carries both flags with NO Builder rollup. The rollup remains a
nice-to-have for counting multiples; the derived signal is live in
ops-stepper (`armedSurveyCount` fallback), the survey accordion's armed
completed-message, and survey-request-cards. Also confirmed: view_3876's
object is **SOW_OPS_site survey request** (the sales capture record — POC
/ badging / PPE, request date `field_1195`), NOT the sub-facing SR-#/REQ
object; the "Pending Validation" status field belongs on the SOW_OPS
object, and Make creates the sub-facing REQ downstream.

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

So "Validate SOW & Request Survey" = capture details before validation
(REQ stays pending, fires on validation); "Request Survey" = capture after
validation (Make promotes the pending REQ within seconds). ONE form
(view_3853), one object, one creation path — EVERY submit creates the REQ
Pending Validation, and Make's scenario decides whether to promote it
immediately based on `field_2723` (see the Make section for the locked
branch matrix).

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
5. Downstream steps — untouched EXCEPT the sibling-survey / this-survey
   states below.

### The FOUR-STATE gating model (locked 2026-08-02, second session)

The per-SOW gating must account for the PROJECT: a survey may already
exist on a sibling SOW. Signals: V = `field_2723` (this SOW validated),
S_this = `field_2706` (survey on this SOW), S_sib = `field_2728` > 0 with
S_this ≠ Yes (survey on a sibling — the change-request path; caveat
below), Playbook gate (`field_2724`) over everything.

| # | State | Sales actions |
|---|---|---|
| 1 | Not validated, no survey anywhere (V≠Yes, S_this≠Yes, `2728`=0) | **Validate SOW & Request Survey** (accordion) + **Request SOW Validation Only** |
| 2 | Validated, no survey on project (V=Yes, S_this≠Yes, `2728`=0) | **Request Survey** (accordion — fires immediately) |
| 3 | Survey on a SIBLING SOW (`2728`>0, S_this≠Yes) | ONLY **Request Validation & Add as Alternative Bid to Survey** — the relabeled `request-alternative-proposal` step (dynamic label drops the "Validation &" part when V=Yes; payload now carries stepId/actionLabel so Make also treats it as a validation ask). The validation-only step LOCKS with "Use the alternative-bid action below"; the survey accordion is completed with the sibling "Survey Requested on {link}" message and reverts to the neutral "Request Site Survey" label |
| 4 | Survey on THIS SOW (S_this=Yes) | **Request Survey Bid Updated to Match SOW** — new `request-bid-update-to-match` step, shown when changes have queued (`2728`>0); the sales-side mirror of Ops's Update Subcontractor Bid Request. New `MAKE_REQUEST_BID_UPDATE_WEBHOOK` (PLACEHOLDER until the Make scenario exists — the button alerts "not configured") |

**Completion proxy for "Request SOW Validation Only":** `field_1199` (CU
project link) means "project submitted to Ops" — correct for the FIRST
SOW, wrong for alternatives (a clone may or may not copy it; neither means
validation was asked for THIS SOW). Locked direction: add a per-SOW
**"DATE_validation requested"** stamp, written by EVERY Make scenario that
carries a validation ask (validation-only, validate+survey,
validate+add-as-alternative); completion = stamp present OR V=Yes. Interim
(until the Builder field exists): completed = `field_1199` hasValue OR
V=Yes — least-wrong proxy, caveat documented in the step config.

**DOM constraint:** `#scw-step-initiate-install` is a scene-reveal marker
(`scene-tweaks.js` `transformsReady`) — the step must ALWAYS exist in the
DOM. Post-choice removal is therefore a CSS soft-hide (`softHideWhen` →
`.scw-step-soft-hidden`, `display:none`), never a `showWhen` removal.

**Signal caveats (verify in Builder):**
- Does `field_2728` reliably read > 0 whenever a sibling survey exists? An
  identical clone with zero line-item diffs might read 0 and wrongly land
  in state 1/2. If so, a project-level "survey exists" rollup is needed as
  the S_sib signal instead.
- Is `field_1199` copied on SOW clone? Copied → validation-only shows
  completed prematurely on alternatives; not copied → shows active but
  the state-3 lock covers the sibling-survey case (the validated-sibling-
  no-survey case remains exposed until the stamp field lands).

Notes on the construct:
- **Post-choice display collapses to ONE narrative (revised 2026-08-02,
  third session).** The two-button construct exists only inside the
  pre-decision "Choose one" window. The moment either path is taken (or
  the choice is moot — validated, sibling survey), the "Validate SOW
  Only" step soft-hides and the survey step carries the whole story:
  - **Straight-to-survey path (ARMED)**: survey step ✓ with "Request
    pending — sends to the subcontractor once Ops validates the SOW",
    with the submitted request's details rendered beneath it
    (survey-request-cards.js). No separate "validation requested" step.
  - **Validate-first path**: survey step LOCKED with "Waiting on Ops to
    validate the SOW — this unlocks automatically" (neutral "Request
    Site Survey" label), flipping live to "Request Survey" when
    `field_2723` lands. The lock IS the validation-state indicator.
- **Change-of-mind (arm late) is CLOSED post-choice**: once "Validate
  SOW Only" fires (`field_1199` set) the survey step locks until Ops
  validates — Sales can no longer arm a survey mid-wait. Deliberate
  trade (clarity over flexibility); the pre-decision straight-to-survey
  submit remains the way to arm.
- **The label swap is client-side trivia** (`conditionMet` on
  `field_2723` in the accordion header) — the real branch lives in Make.

### Ops surfaces

- **ops-stepper.js (view_3345) — IMPLEMENTED 2026-08-02.** Mark Ready
  must answer "am I just validating, or also sending a survey?":
  - **Button label**: "Mark Ready for Survey" → "Mark Ready — Send Pending
    Survey Request" when a request is pending (dynamic label, resolved at
    render). ("Pending" is the locked user-facing vocabulary, 2026-08-03 —
    "armed" survives only as internal jargon in code/docs.)
  - **Modal banner**: pending → amber callout "A survey request is PENDING
    on this SOW — marking ready validates the SOW and immediately sends the
    survey request to the branch(es)/tech group(s) you pick below." Not
    pending → quiet info line "Validation only — no survey request is
    pending. Sales will request the survey separately."
  - **Branch / tech-group picker**: MULTI-select checkbox list (Ops may
    send the survey request to more than one subcontracting group),
    required when pending and options exist. Options come from the
    Builder catalog snippet `window.SCW.techGroupOptions`
    (knack-snippets/tech-group-options.snippet.js) — decided 2026-08-03
    after an all-records grid proved un-addable on scene_1096; same
    pattern as the prefix / bucket / photo-type catalogs.
  - **Pending-request editor (added 2026-08-03)**: when a request is
    pending, the modal ALSO serves the request's details prefilled +
    editable (POC-can-change-scope, badging flag + details, PPE,
    anything-else notes; POC + request date shown read-only) so Ops can
    correct them before the send. Edits PUT to the request record via a
    hidden connected grid on scene_1096 (`PENDING_REQ_VIEW`, inline edit
    ON — Builder TBD; fail open: unconfigured → no editor renders) and
    ride the payload as `surveyRequest`.
  - **Payload**: `pendingSurveyCount` + `surveyBranches: [{id,label},…]` —
    ALWAYS an array (one or many) so Make's activation branch parses one
    way — + `surveyRequest` (the reviewed/edited details, so Make never
    re-reads mid-flight). Make fans the activation out per selected branch.
  - **Config seams (fail open — plain-validation behavior until set)**:
    `ARMED_REQ_COUNT_FIELD` (SOW rollup of Pending Validation REQs,
    projected onto view_3861), and the tech-group snippet's object /
    label-field keys (knack-snippets/tech-group-options.snippet.js —
    fill the TODOs + key, paste into Builder). `BRANCH_PICKER_VIEW` +
    `BRANCH_LABEL_FIELD` remain as the future hidden-view migration
    path (Known Issue #17) and win only when the snippet global is
    absent.
- **ops-review-pill.js (view_3325)** — still to do: insert a state between
  "Mark Ready" and "Ready for Survey": same pill badged "(survey armed)"
  when the pending-REQ rollup > 0, so Ops can prioritize SOWs where
  validation unblocks the whole chain. Needs the same rollup field added
  as a (hidden) column on view_3325.

**RESOLVED (2026-08-02, third session) — branch selection on the
immediate path**: on a validated SOW, Make submits the request to the
partner from the EXISTING assignment mechanism and flips the REQ back out
of pending. Ops branch selection therefore applies only to the armed path
(Mark Ready), where `surveyBranches` overrides/populates the assignment
before Make submits.

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
  both labels. Its record rule sets status = Pending Validation on EVERY
  submit (unconditional — one creation path); promotion is Make's job.
  (⚠️ Discovery still required: what else view_3853's submit does today —
  existing record rules and whatever flips `field_2706` — since the
  sub-notification and `field_2706` flip must move behind Make's
  promote.)
- **REQ-listing views** (sub portal, survey grids, ops views): add
  "status is not Pending Validation" filters. Blank status must fail safe
  (treated as not-pending, i.e. visible) so legacy records are unaffected.

### Make work

- **Initiate scenario** (unchanged trigger — the view_3828 form path):
  after project setup, ALSO send the Ops validation ask (the Slack/CU ping
  that `MAKE_REQUEST_SOW_VALIDATION_WEBHOOK` sends today), since this
  button now MEANS "Request SOW Validation Only".
- **Survey-request scenario — THE BRANCH (mechanics locked 2026-08-02,
  third session)**: every REQ is created in **Pending Validation status
  unconditionally at submission** (form record rule) — one creation path;
  Make's scenario then decides whether to PROMOTE it. ⚠️ The
  fire-vs-pending fork keys on **validated (`field_2723`)** — NOT on
  "ClickUp task exists". The two usually coincide but the mid-wait arm
  path breaks the correlation (Validation Only fired → CU task exists →
  Sales arms the survey before Ops validates); testing CU-existence
  would fire that survey early. The two checks are orthogonal:

  | SOW validated? | Setup/CU exists? | Make does |
  |---|---|---|
  | Yes | Yes | Assign the partner (existing assignment mechanism) → submit the request to the partner → flip REQ pending → complete/Requested (stamp `field_2351`, flip `field_2706` = Yes) |
  | No | No | Create project setup + CU task + the Ops validation ping → **leave the REQ pending** |
  | No | Yes | Mid-wait arm: setup already exists — **leave pending**; optionally re-ping Ops that a survey is now armed |
  | Yes | No | Shouldn't occur under the new SOP; if it does: create setup, then fire |

  Consequences: (a) the validated path has a TRANSIENT pending window
  (seconds until Make's flip) — harmless for the armed signal, but the
  sales stepper adds late post-submit refetches so the accordion catches
  the async flip; (b) the immediate path's partner question is RESOLVED —
  the existing assignment mechanism supplies it, so Ops branch selection
  applies only to the armed path (Mark Ready), where `surveyBranches`
  overrides/populates the assignment before Make submits.
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
