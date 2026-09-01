# Change Orders — Design & Implementation Reference

Design locked 2026-07-03 (planning session). First implementation phase shipped
2026-07-07 (branch `claude/change-order-line-items-mt7w8f`, PR #98). This doc is
the durable record of every decision, the current build state, and what's next.
The compact version lives in CLAUDE.md ("Change Orders" section) — this is the
full reference.

## What this is

Install-phase change orders: SCW ops (or the subcontractor) proposes **adds and
removes** against the install scope ("What we're installing", view_4056). The CO
is priced by the sub, sent to the client through **esignatures.com**, and on
signature Make creates the **Xero invoice** and applies the changes to the
install line items.

## Locked decisions

1. **Adds + removes only. No field-level MODIFY.** Modifications decompose:
   - qty change → add/remove records (install items are ~one record per device;
     each carries its own photos/QA/connections)
   - config change (e.g. existing → with cabling) → a **swap**: linked remove +
     add pair. On acceptance, Make copies carry-over state (photos connection,
     MDF/IDF, connected-to, QA) from the removed record to its replacement via a
     `replaces` link on the add line.
   - price-only change → a money-only **adjustment** line (also needed for
     invoice credits), not a record mutation.
   Rationale: invoice math becomes trivial (adds = charges, removes = credits —
   how Xero represents changes anyway); no client-side mutation of live install
   records (avoids adding writers near the field_1957/field_2197 cascade,
   Known Issue #12); adds reuse the entire existing line-item machinery; clean
   audit trail. If true MODIFY is ever needed, the bid-revision pattern
   (`action` + `current`/`requested` JSON + Make-applies-on-accept) bolts on
   later without redesign.

2. **A Change Order is a SOW subtype, not a new object.**
   - CO header = a SOW record with `field_2952` Type (`base scope` /
     `change order` — the first option was created as "proposal" and renamed
     2026-07-03 because it collided with the Proposal snapshot object) plus CO
     fields (CO Status, sub connection; Origin deferred — commercial fields
     live on the Proposal/Acceptance chain, see decision 5).
   - CO line items = the existing **SOW Line Item object**, connected via the
     existing multi-SOW connection `field_2154`. ADDs are plain line items with
     everything that implies (bucket rules, cabling, pickers, pricing,
     accessories, the mirror cascade).
   - Drafting a CO **is the build-SOW worksheet-v2 experience** on the CO's own
     child page — NOT change-request badges/strips on view_4056. A new view of
     the same object is nearly free in worksheet-v2; a new object would be
     another Hybrid card fork (Known Issue #15).
   - Cost accepted: every SOW-consuming surface (steppers, totals, SOW grids,
     publish flows) needs a `Type ≠ Change Order` filter. Builder audit, one
     time, mechanical. Write filters as **"is not change order"** so blank
     Type fails safe; default `base scope`, backfill blanks.

3. **The sub interacts directly with the CO's SOW line items.** No shadow
   bid-item object for COs. The separate bid-item object existed for
   competitive multi-sub bidding; a CO has one counterparty (the sub already on
   the job) and merging their numbers back IS the job. Guardrails replacing the
   shadow object:
   - **Status machine gates edit windows** (see lifecycle) instead of separate
     records handling concurrency.
   - **Field exposure = write permission.** The sub-facing CO worksheet view
     exposes only sub-editable fields (`subBid` field_2150, labor/notes).
     Knack view-based PUTs only accept fields present on the view, so this is
     enforcement, not cosmetics. Client money columns hidden via the existing
     per-view `moneyMode`/`hideMoneyColumns` config.
   - Accepted tradeoff: no immutable snapshot of the sub's quote. The signed CO
     PDF is the durable artifact. If it matters later: lock `subBid` after a
     "sub submitted" status flip.

4. **One sub per CO.** A change spanning two subs = two COs. Per-line sub
   assignment is rejected (infects visibility, pricing windows, the signed doc).

5. **A CO rides the FULL existing acceptance chain: SOW → Proposal snapshot →
   Acceptance record → apply.** (The real model: SOW → Proposal record
   preserving scope + commercial terms → Acceptance record (accepted by/date,
   agreement signed?, invoice paid?) → criteria met → install line items
   created; all connected up to a Project.)
   - Each CO send creates a **Proposal record** (the freeze — the client signs
     a specific version; also buys the decline→revise→re-send loop, since the
     working CO lines stay editable while sent snapshots are immutable).
   - Each CO send creates an **Acceptance record** — the CO apply rides the
     same criteria-met trigger as the original conversion. The apply is a
     BRANCH of that scenario, not a clone: convert Add lines (+ swap
     carry-over), stamp Removed-by-CO on Remove targets, invoice with credits.
   - **The verb is "Issue", the record is still an Acceptance.** Sales Ops
     "Issue Change Order" (from Ops Review, or Draft when no sub pricing is
     needed) creates the Proposal snapshot (type=CO) + the Acceptance
     (type=CO) in one gesture (the client deliberates AFTER send, so
     publish/accept collapse), then the acceptance-created automation branches
     on Type to send the CO agreement via esignatures.
   - **Amendment (2026-08-20): an optional pre-issue "Publish CO Preview"
     verb exists alongside Issue.** The original design collapsed
     publish/accept into Issue; in practice clients want to REVIEW the CO
     as a web quote before anything goes out for signature. The preview
     ships the same full publish payload to the SAME `MAKE_CO_ISSUE_WEBHOOK`
     as Issue — the scenario routes on `stepId` ('publish-co-preview' vs
     'issue-change-order'), sharing the record-creation modules. The
     preview branch only creates the published-proposal record (Type =
     change order, field_2658 Published) — no esignatures contract, no
     acceptance, no CO Status change. While CO Status is pre-issue, the published page (both
     scene_1279 and the public token page) swaps the e-sign banner for
     preview copy plus a "request the signature copy" nudge CTA
     (`MAKE_CO_SIGNATURE_REQUEST_WEBHOOK` — a notify-ops ping, NOT a
     client-initiated Issue, preserving the one-writer rule on Issued).
     Issue afterwards creates its own frozen snapshot and should mark the
     preview record Superseded (field_2658).
   - **Invoice timing: the CO branch defers Xero invoice creation to the
     SIGNED webhook.** (Proposal flow invoices at acceptance-creation because
     the client already committed; a CO at issue time is not yet agreed —
     Declined is a live path.)
   - **Apply gate: signature ALONE.** Original conversion keeps signed + paid;
     the CO apply fires at signature so field work never stalls on payment
     terms. The Acceptance **Type field is the SWITCH** the criteria automation
     branches on (base scope → signed+paid → convert all; change order →
     signed → apply branch + invoice). For a CO, "applied" and "complete" are
     two milestones: signature → Applied + invoice created; payment-received
     then closes the record as pure AR bookkeeping, gating nothing.
   - **Type-stamp all three objects** (SOW field_2952 + a Type field on
     Proposal and on Acceptance, stamped at creation): Knack view filters
     can't see connected-record fields, so the "is not change order" audit
     extends to Proposal- and Acceptance-listing surfaces.
   - **No new commercial fields on the SOW.** Contract id / signed agreement /
     Xero link already live on the acceptance surface (field_2766 agreement
     signed, field_2765 payment received, field_2767 signed file, field_1847
     Xero link).
   - **CO Status on the SOW = operational rollup only.** Authoritative through
     Ops Review (no Proposal exists yet); from Issued onward the
     Proposal/Acceptance records are truth and Make advances the rollup.
   - Install items created by a CO connect to the CO's Acceptance; with
     Removed-by-CO on the flip side, every install-scope mutation traces to a
     signed acceptance. The Project's Acceptance list thereby becomes the
     complete commercial history: original + every CO.

6. **Nothing mutates install scope until signature.** The CO lives entirely as
   draft records on the side. The esignatures "contract signed" webhook → Make
   does all state changes: convert adds → install line items (existing
   proposal→install path, scoped to the CO; carry-over copy for swaps), flip
   removed install records to `Removed by CO-###` (never delete), create the
   Xero invoice from CO lines, mark CO Accepted, attach signed PDF.

7. **A removal is a Remove CO-line that TARGETS THE INSTALL RECORD; install
   items never connect to a SOW.** (Decided 2026-07-07.) The concern "install
   line items don't connect to a SOW, so how does a CO say it removes one?" is
   answered by the join record, not a new install→SOW link:
   - The removal is a **new SOW Line Item** (an ordinary CO line, `CO Action =
     Remove`) carrying THREE links that together answer everything: → CO header
     via `field_2154` ("which CO"); → the install record via `Target install
     item` ("what gets un-installed"); and its own carried-over money ("the
     credit"). The install object stays deployment-connected; the SOW↔install
     relationship lives entirely on this CO-line + one back-stamp.
   - **`Target install item` points at the INSTALL record, never the original
     SOW line.** Removal is physically about un-installing a real thing, and the
     install record is the on-site source of truth (it can have drifted from
     what was quoted). Lineage to the original quote is **free**: the install
     record already stores its originating SOW-line id in **`field_2819`** (used
     by `install-as-quoted-panel.js`), so Make walks `Target install item →
     field_2819 → original SOW line` for the quoted price. No second connection.
   - **Model the install's SOW-side relationships as SEPARATE single-purpose
     one-to-one fields — NEVER one multi-connection field.** From the install's
     side: (a) `field_2819` → original SOW line (provenance, already exists);
     (b) `Removed by Change Order` → CO header (scope flag, NEW). The
     install→remove-LINE link needs **no new field** — it's the automatic
     reciprocal of the CO-line's `Target install item`. Reasons not to merge:
     the roles differ (provenance vs removal), the "blank = active" scope filter
     REQUIRES the removal link to be its own field (a shared multi-field is
     never blank), and removal is terminal/single (one CO removes an item — the
     single-connection also guards against two COs claiming the same item).
   - **Credit is flexible; default = original price, editable per line.**
     (Resolves open question 1.) Because a Remove line IS a SOW Line Item on the
     CO worksheet (view_4079), it already has editable money + inline editing.
     Make seeds the default credit from `field_2819`'s original price (negated);
     **sales ops adjusts the amount right on the CO worksheet** and records why
     in `CO adjustment reason`. No special adjustment surface — it's just
     editing the line.
   - **Timing subtlety.** `Removed by Change Order` (header) flips at signature,
     so it does NOT drive the draft panel's "already flagged" state — that reads
     the reciprocal of `Target install item` from the CO side (a Remove line
     already exists targeting this install on this CO). Post-signature, the
     header flag drives the active-scope filter. (co-remove.js's
     `remove.targetField` config hook is the seam for the draft-side read once
     the field exists.)

10. **Invoice anchor: the PROJECT carries its accepted base proposal — stamped
    at acceptance, never searched (decided 2026-07-17).** Xero invoices tie to
    a proposal number; a CO's invoice must reference the BASE SOW's accepted
    proposal so the project tells one story. Do NOT resolve this at CO-signed
    time with a filtered search (accepted ∧ same project ∧ type = base scope) —
    that re-runs on every CO and silently mis-links the day a project has two
    accepted base proposals (phase 2, re-accepted revision). Instead:
    - **Builder**: on the Installation Project object, add `REL_accepted base
      proposal` (connection → SOW_published proposals, single) and optionally a
      text copy of the proposal number for zero-hop reads.
    - **Make (base acceptance scenario)**: when the base proposal's SIGNED
      webhook fires, it already holds the exact accepted proposal record —
      add one Update Record stamping it onto the project. One-time backfill
      for in-flight projects.
    - **Make (CO signed scenario)**: read the anchor off the already-fetched
      project record → Xero reference. No search modules.
    - Same stamp-at-the-source pattern as the sub chain (bid basis
      `field_2942` → Proposal → Acceptance → CO auto-assign), applied to the
      customer-side chain. Optional follow-up: copy the anchor onto each CO at
      creation ("Invoice anchor" text) so the signed webhook payload is fully
      self-contained and a wrong link is visible during ops review instead of
      at invoicing.

## Lifecycle

```
[ops]  Draft ─ Send to Sub → Pending Sub Pricing ─ sub submits pricing ─┐
[ops]  Draft ─ (no sub pricing needed, e.g. pure removals) ─ Issue ─────┼─┐
[sub]  Draft (origin: sub, priced while drafting) ─ sub submits CO ─────┘ │
                                                                          ▼
        Ops Review ─ Issue ─→ Issued ─ e-signed ─→ Accepted ─→ Applied
        (or send back to        │
         Pending Sub Pricing)   └─→ Declined (revise → re-issue) / Void
```

- Ops-originated COs that need no sub pricing (e.g. pure removals) are Issued
  straight from Draft.
- Both paths converge at **Ops Review — the UNIVERSAL pre-issue stage**
  (replacing the dropped "Ready to Issue" hold state): ops vets the
  fully-priced CO, may set client pricing / strike lines (safe — the client
  freeze is the Proposal snapshot at Issue), exit = Issue or send back to
  Pending Sub Pricing.
- Edit windows: `Draft` = originator edits; `Pending Sub Pricing` = sub edits
  sub fields only; `Ops Review` = ops edits, sub locked; `Issued` onward =
  locked for both.
- The two sub-facing buttons stay distinct: "Submit Pricing" (path A) vs
  "Submit Change Order" (path B) — both write Ops Review.

### Status discipline

- **CO Status is a NEW, SEPARATE field — do NOT add options to the existing
  SOW status field.** The two lifecycles are disjoint; merging creates options
  whose validity depends on Type (unenforceable). A blank extra field on
  base-scope SOWs costs nothing.
- **`Sub Proposed` was dropped from the enum**: a sub-originated CO in
  drafting is just `Draft` + `Origin = Subcontractor` — status = stage,
  Origin = who started it. 8 options, each with exactly ONE writer:

| Status | One writer | Means |
|---|---|---|
| Draft | record creation (either origin) | originator editing |
| Pending Sub Pricing | ops "Send to Sub" | sub's window — subBid fields only |
| Ops Review | the sub's submit (either path) | ops vets the priced CO; sub locked; exit = Issue or send back |
| Issued | the Issue action | snapshot + acceptance created, e-sign sent |
| Accepted | signed webhook (apply START) | signed; apply in flight — stuck here = apply failed |
| Applied | apply branch END | install scope updated, invoice created |
| Declined | esignatures decline webhook | revise working lines → re-issue |
| Void | ops manual action | cancelled |

- **Flags vs enum**: milestone-event facts stay FLAGS (agreement signed /
  payment received — already on the Acceptance, already what automations
  trigger on). The enum exists because drafting stages are mutually exclusive
  AND the decline loop moves state backward, which flag combinations handle
  badly. The enum is the display / stage rollup; the flags remain the triggers.

## Where it lives (navigation / IA)

- **No new main page.** The main-page trio (Build SOW → Reconcile Bids →
  Manage Deployment) is phase-shaped; a CO is a side-loop hanging off Manage
  Deployment, not a phase.
- **The CO build surface is a drill-in child page** under Manage Deployment
  (and later under the sub portal's deployment page for the sub-facing
  variant).
- **Manage Deployment gets a lightweight footprint only:** compact CO list
  (number, status pill, origin, net amount, click-through), "New Change Order"
  button, and later "Pending CO-###" chips on view_4056 cards.
- **Cross-project CO queue**: NOT in v1. Day-one substitute is a Make
  notification on sub-proposed submission.

## Sub assignment chain

**Rule: the sub travels with the money, not the project.** The project's sub
connection is a routing default (survey requests); the commercial sub is
decided when the team selects the BID BASIS at final quote, and flows forward:

```
Bid (a sub's priced offer)
  └─ selected as bid basis at final quote      ← the award moment
     └─ Proposal carries the sub
        └─ Acceptance carries the sub          ← replaces today's project lookup
           └─ apply stamps the awarded sub for the deployment
              └─ COs auto-assign from the awarded sub (overridable in Draft)
                 └─ CO's Proposal + Acceptance inherit the CO's sub
```

- SOW.sub = operative sub, **blank until known**: COs fill it at Draft;
  base-scope SOWs stay blank during bidding (multiple bidders).
- CO sub stays **editable in Draft** (specialty-work override); one sub per CO.
- Auto-assign mechanic still to DECIDE: an **Awarded Subcontractor** connection
  on the Project stamped by the original apply scenario, vs. v1 fallback of
  filtering the add-CO form's sub dropdown to the project's subs.

### Supporting bid-basis machinery (built during this work, 2026-07)

The chain above is fed by the bid pipeline, which was hardened alongside the CO
design:

- **`field_2942`** (SOW → bid package) = the bid-basis connection, written by
  `sub-bid-diff` on the Bid Review page (scene_1155) via view_3918.
  **`field_2941`** = the SOW's review-snapshot JSON blob (basisBidId, diff data,
  note, savedAt). Both are written in ONE PUT (atomicity — they previously
  drifted via independent PUTs) and the publish gate blocks on blob-vs-field
  mismatch.
- **"Submitted is a ceremony" invariant**: bid-record artifact fields
  (html/PDF/version counter) are only written by the sub's Finalize & Submit —
  so anything stamped FROM the bid record was officially submitted, never a
  draft-state comparison-grid read.
- **`field_2954`** (tech group) lives on the BID record, stamped at bid
  create; the publish payload reads it through the field_2942 basis connection
  (view_3861). **`field_2955`** = DATE first bid submitted.
- **"K1 Bid" sentinel**: every basis dropdown offers "K1 Bid" for SOWs with
  genuinely no sub bid; selecting it ungates Publish Final and rides the
  webhook so Make can branch on it.
- Publish payload carries `subBidBasisId` (read from the saved field_2942
  connection), sub identity, tech group, and the diff artifacts
  (`subBidDiffDocHtml` etc. — internal-only; never spliced into client-facing
  html/htmlPdf because it exposes subcontractor cost data).

## Knack Builder state

**Done (2026-07-03 → 07):**
- SOW `field_2952` Type (`base scope` / `change order`) — created, option
  renamed from "proposal", defaults/backfill/filter guidance issued.
- The CO child page exists with: **view_4079** (CO line items), **view_4084**
  (MDF/IDF locations), **view_4086** (project install line items), **view_4088**
  (other project SOW/proposal line items). See "Implementation state".

**Remaining Builder work:**
- SOW: `CO Status` field (8 options per the table), connection → subcontractor.
- SOW `Origin` (SCW / Subcontractor) — **DEFERRED to the sub-portal phase**
  (no consumer in ops-only v1; blank never matches "Origin is Subcontractor",
  so no backfill trap).
- **No new Project connection** (SOW already connects to Project) and **no
  "Original SOW" self-connection** (lineage is derivable per-line; a single
  original is ill-defined on multi-SOW projects — field_2154 is multi).
- Proposal object: `Type` (base scope / change order), stamped at creation.
- Acceptance object: `Type` (same treatment); verify existing agreement /
  payment / invoice fields cover the CO (expected: yes).
- SOW Line Item object: `CO Action` (Add / Remove / Adjustment; **default
  Add** — existing records are Adds with no backfill) + `Target install item`
  connection (single) → install line item object (**created: `field_2966`**).
  One field, action-dependent meaning: on Remove = **the install RECORD** that
  gets removed (NOT the original SOW line — see decision 7); on Add = what this
  replaces (swap link driving Make's carry-over copy). Blank on ordinary adds.
- SOW Line Item object: `CO adjustment reason` (text) — why the removal credit
  (or adjustment amount) was overridden away from the default. Blank on
  unadjusted lines; filled by ops when they change the seeded credit. Rides
  into the client doc + invoice. (See decision 7 / resolved open question 1.)
- Install line item object: `Removed by Change Order` connection (single) →
  **SOW object (the CO header)** (**created: `field_2967`**); blank = active.
  Flips at **signature**, not at draft. Filter view_4056/view_4093 (+ install
  reports) AND the removal source view_4086 to "Removed by CO is blank". (The
  draft-time "already flagged" state is read from the CO side — the reciprocal
  of `Target install item` — NOT this field; see decision 7.) co-remove.js
  reads `field_2967` as its `remove.removedByField` for the flagged/exclusion
  signal.
- App-wide `Type ≠ Change Order` filter audit on every SOW-consuming surface.
- Confirm how Proposal + Acceptance records get created today (Make vs record
  rules) — that's where the type stamp and the CO apply branch live.

## Make scenarios (not started)

1. **Send to sub** — notify sub, flip status. The webhook payload
   (co-stage-strip.js, 2026-07-14) now carries everything this scenario
   needs: `snapshot` (pricing baseline JSON → store verbatim in
   `field_2972`), `coNumber`/`coName` (ClickUp task lookup), and
   `requestHtml`/`requestText` — the fixed record of exactly what was
   requested (self-contained HTML card + plaintext twin). Scenario
   responsibilities: store snapshot, flip status, notify sub, AND update
   both ClickUp tasks (subcontractor's + internal) — status change plus
   the request record posted as a comment on each.
2. **Send to client (Issue)** — build the CO agreement (adds table +
   removes/credits table + net change) via the existing esignatures
   `document_elements` builder in `proposal-pdf-export.js` (~line 3645);
   create the contract; flip status; store contract id.
3. **Contract signed webhook** — the apply step (decision 6). Also handles
   Declined.
4. Confirm the existing proposal→install conversion can take "only items
   connected to CO-###" as input — it's the acceptance hook.
5. **Publish CO Preview** (bundle shipped 2026-08-20) — a BRANCH of the
   Issue scenario, not its own webhook: both stepper actions fire
   `MAKE_CO_ISSUE_WEBHOOK` with identical full publish payloads, and the
   scenario's FIRST router splits on `stepId`. ⚠️ Add that router before
   using the preview button — without it a preview click runs the full
   Issue flow (contract sent). Preview branch: create the
   published-proposal record from the payload (html → field_2680, token →
   field_2904, tokenized URL → field_2908, expiration → field_2659, Type
   = change order, field_2658 = Published) and STOP — no contract, no
   acceptance, no status flip. Respond `{ success: true }`. Issue branch:
   also flip any prior preview record to Superseded (field_2658).
6. **CO signature-request nudge** (optional) —
   `MAKE_CO_SIGNATURE_REQUEST_WEBHOOK`: ping ops when a client clicks
   "Request the signature copy" on a preview. Payload
   `{ source, publishedProposalId, proposalName, coStatus, pageUrl }`.
   The CTA on both published pages hides until this is configured.

   Builder prerequisites for the preview banner state: **field_2953 (CO
   Status) added to view_3874** (scene_1279) and **exposed through the
   SOW connection on view_3952** (public lookup view — arrives as a
   dotted key). Until then every CO shows the issued-style e-sign banner
   (fails safe, nothing regresses).

## Implementation state (bundle, as of 2026-07-07)

Shipped in commit `2150b90a` (branch `claude/change-order-line-items-mt7w8f`,
PR #98) — **the CO drafting worksheet renders; CO-specific flows are not
built yet:**

- **`worksheet-v2/config.js`** — deployment entry for `view_4079` (SAME SOW
  Line Items object as view_3962/view_3586 → inherits `DEFAULT_FIELDS`
  verbatim, build-SOW money model). `mdfSourceViewKey: 'view_4084'`
  (label field_1642), `hideSow: true` (CO items group by MDF/IDF; SOW pills
  are noise), `hideSourceAccordion: true` (full cutover), `noAddItem: true`
  (add CTA suppressed until the CO add flow exists).
- **`mirror-connection-sync.js`** — MODEL_ONLY `createMirror` instance for
  view_4079 so Connected Devices edits through the CO worksheet fire the
  mandatory field_1957 ↔ field_2197 cascade. No ACCESSORIES_* wired — the CO
  scene has no hidden accessories grid yet (add a view_3888 analogue + config
  if accessory regroups are needed there).
- **`change-record-limit.js`** — view_4079/4084/4086/4088 forced to 1000
  rows/page + pagination hidden (all read whole via the Backbone model).
- **`worksheet-v2/styles.js`** — hides the native view_4079 grid/accordion and
  the three data grids; all keep loading for their models.

### The CO scene's view contract

| View | Object | Role |
|---|---|---|
| view_4079 | SOW Line Items (same as view_3962/3586) | the CO worksheet — the ONLY write surface; needs every card column + inline editing, mirroring view_3962's column setup |
| view_4084 | MDF/IDF locations | L1 group seeding (label field_1642) |
| view_4086 | Install line items (project-connected) | read-only; **removal source** + "already installed" exclusion set |
| view_4088 | Other SOW/proposal line items (project-connected) | read-only; **adopt-from-proposed-scope picker source** — items previously created/surveyed but never part of a greenlit SOW |

The **adoption** concept (view_4088) was added 2026-07-07: besides brand-new
adds, ops can pull in proposal line items that already exist on the project
but never got installed (not part of a greenlit SOW).

## Next build phases (in order)

1. **CO add flows** — "add new line item" (native Knack add link the v2
   toolbar clicks — see worksheet-v2/toolbar.js `handleAction 'add-sow'`) +
   **adopt-from-proposal picker** sourcing view_4088 (canonical
   `ns.picker.open`, default MDF/IDF grouping applies) + **remove picker**
   sourcing view_4086 (creates Remove lines pointing at their Target install
   item). Remove/adjustment lines need a small render branch: red-tinted
   read-only card sourcing display data from the target install record.
2. Make: send-to-client (Issue) + signed-webhook apply. First signable CO,
   ops-only, skipping sub pricing.
3. **Restore-via-CO (re-add a removed install item)** — once a removal CO is
   signed, the install record's `Removed by Change Order` (`field_2967`) is
   permanent; you must NEVER un-set it (that silently reverses a signed,
   invoiced CO). Bringing the item back is a NEW **ADD** change order, not an
   undo. Mechanics reuse existing wiring, no new concept:
   - **Entry point**: on the CO worksheet, list ALREADY-REMOVED install items
     (`field_2967` **is not** blank — the inverse of view_4086's active filter)
     with a **"Restore via CO"** action. Guard against double-restore: don't
     offer it for an install item some add-line's `Target install item`
     (`field_2966`) already targets.
   - **What it creates**: a normal `CO Action = Add` SOW Line Item on the CO,
     with **`field_2966` (Target install item) → the removed install item** —
     i.e. the existing `replaces` link (decision 1's swap carry-over). At
     signature Make creates a FRESH install item; the old one stays
     `Removed by CO-1`. Audit trail: removed by CO-1, restored by CO-2.
   - **Seed from the removed INSTALL item, not the original proposal item** (it
     reflects actual on-site config/QA/photo state; the original base SOW line
     is already consumed and adopting it in place would multi-parent it). If the
     install object doesn't physically carry every SOW-line spec field, fall
     back to seeding from `field_2819` → original SOW line and just attach
     `field_2966` for the removed-item link. **Open: audit which spec fields
     live on the install object vs. the SOW-line object to confirm which seed
     source is sufficient.**
   - **Money self-balances**: CO-1 credited (default original price via
     `field_2966 → field_2819 → original SOW line`); CO-2 re-charges the same
     way → net zero unless adjusted with notes (flexible credit policy).
4. **Known Issue #17 migration on sub-reachable scenes** — ⚠️ PREREQUISITE
   before any worksheet-v2 surface is served to subcontractor logins: the
   `window.SCW.productBucketMap` Builder snippet ships the full-access REST
   key to the browser. Same check for `dropPrefixOptions` (also carries the
   role-filter TODO #11).
5. Sub-originated entry point (deferred). **The sub-facing CO page +
   status-window locking shipped 2026-07-14**: scene_1374 ("Manage Change
   Order" under the sub portal's deployment dashboard) — view_4121 CO
   header form, view_4112 CO line items grid, view_4114 MDF/IDF cards,
   view_4116 install grid, view_4118 v2 source grid, view_4122 status
   details. `worksheet-v2/co-sub-lock.js` locks the ENTIRE scene (cell
   edits, delete/edit/add link columns, header form, MDF cards, photo
   affordances, capture-phase click/submit belt) with a lock banner
   whenever CO Status (field_2953, read off view_4122) doesn't match
   /sub pricing/i — blank/unknown fails safe to locked. Applies to
   everyone on the scene; ops manage from the internal drafting scene.
   **Full drafting deployment shipped 2026-07-14 (same day)**: scene_1374's
   views are 1:1 analogues of the internal CO scene and now run the SAME
   code — worksheet-v2 CO worksheet on view_4112 (config clone of the
   view_4079 entry, incl. its own `createMirror` field_1957↔2197 cascade
   instance), adopt panel on view_4118, remove panel on view_4116
   (`coViewKey: 'view_4112'` steers their post-webhook refetch), MDF L1
   seeding from view_4114, co-header-card + co-value strip on view_4121,
   and the co-scene-header add/adopt/remove strips block. co-sub-lock now
   also flips the v2 worksheet to `.scw-ws-v2--readonly` and hides the
   strips block + adopt/remove panels while locked. Deliberately NOT
   deployed to the sub scene: co-stage-strip (its verbs — Send to Sub /
   Send back / Preview & Issue — are ops actions). Still missing: the
   sub's own hand-back verb ("Submit pricing to SCW" → flips status to
   Ops Review) — the sub currently has no button to end their window.
6. view_4056 chips ("Pending CO-###") + toolbar/card entry points ("New
   Change Order" in the suppressed toolbar slot — worksheet-v2/toolbar.js:151
   `noAddItem` comment anticipates this; "Remove via CO" on the card menu).
7. Invoice wiring + adjustment lines + credit policy.

## Open questions

1. ~~**Removal credit policy** — credit at original price, other amount, or $0 +
   demob fee?~~ **RESOLVED 2026-07-07 (decision 7): flexible, default = original
   price.** Make seeds the Remove line's credit from `field_2819`'s original
   price (negated); ops can override the amount right on the CO worksheet
   (view_4079) and records the why in `CO adjustment reason`. No fixed policy —
   the Remove line is an editable SOW Line Item, so any of original / override /
   $0-plus-demob is just what ops types.
2. **One open Draft CO per deployment?** Needed as the target for the
   "Remove via CO" gesture from view_4056. Recommended: yes.
3. **Remove-flow accessory cascade (flagged 2026-07-14).** Removing a parent
   install item (camera/NVR with mounting hardware) creates ONLY that item's
   Remove line — its accessory/child install items are silently left active,
   so the CO under-credits and the install scope keeps orphaned mounts.
   Direction:
   - **UI**: the Remove gesture (single + bulk — both funnel through
     `co-remove.js fireRemove`) detects the target's accessory children and
     prompts "Also remove N child/accessory items?" Accepted ids join the SAME
     `installItemIds` array in the webhook payload — no payload shape change;
     Make already loops it, creating one Remove line per id with its own
     `field_2966` target + seeded credit.
   - **Detection source (audit needed)**: does the install object carry its own
     accessory back-pointer (a `field_2464` analogue)? If not, derive children
     via `field_2819` → original SOW line → its accessory children
     (`field_2464` reciprocals) → THEIR install records' `field_2819` matches.
   - **Sync on the created Remove lines — recommend NOT mirroring.** Do NOT
     recreate parent/child (`field_2464`) or connected-device
     (`field_1957`/`field_2197`) links between the new Remove lines. They're
     credit lines, not buildable scope — mirroring re-imports the cascade
     fragility of CLAUDE.md Known Issue #12 for zero benefit. Group them
     visually via `field_2966` → install lineage instead. (If a later surface
     genuinely needs the structure, add it then.)
   - Same gap applies to **connected devices**: removing an NVR leaves its
     cameras' install items active but headless — the prompt should probably
     ALSO offer connected children, or at minimum warn.
4. **Proposal→install conversion trigger** — confirm what invokes it today and
   that it can scope to a CO's items.
5. **CO numbering** (CO-001 per deployment vs global) — display label on
   documents, statuses, and chips.
6. **Awarded-sub auto-assign mechanic** (Project connection stamped at apply
   vs filtered dropdown) — see Sub assignment chain.

## Swap pairs — product changes apply IN PLACE (locked 2026-09-01)

The adds+removes ledger stays, but a **product change on an existing install
item is a linked PAIR, not two independent lines** — a swap's physical
install (drop, photos, QA, the install record itself) continues, and a
naive remove+create severed that history (the problem that triggered this
decision).

**Scope (locked same day): a swap is a PRODUCT swap only at this stage.**
Every other field carries over verbatim from the original install item, the
gesture is offered only on rows that carry a product (services/assumptions
have nothing to swap), and the apply writes the product and nothing else. A
broader field-level swap is a future decision, not an extension of this one.

- **Drafting**: ONE gesture — "⇄ Swap Product" on the removal panel
  (`co-remove.js fireSwap` → `MAKE_CO_SWAP_ITEMS_WEBHOOK`, contract
  documented in `src/config.js`). Make creates the Remove line AND an Add
  line cloned from the install item's config, BOTH with `field_2966` → the
  install record (an Add carrying a target IS the pair marker — no new CO
  Action values). The user then changes the Add line's product to the
  replacement on the CO worksheet — the one field a swap may change.
- **Accessories**: each accessory child (install back-pointer `field_2853`,
  the `field_2464` analogue — this answers the detection-source audit in the
  open questions above) gets its own Remove + cloned Add pair, the Add
  parented (`field_2464`) to the new device Add — so the accessory-mismatch
  warning evaluates the mount against the replacement model and the sub sees
  the real price line.
- **Apply (signature)**: an Add with a `field_2966` target is an IN-PLACE
  UPDATE of that install record's PRODUCT — and nothing else (product-only
  at this stage) — never remove + create. `Removed by CO` (`field_2967`) is
  NOT flipped for paired removes. Photos / QA / acceptance / topology keep
  their identity because the record persists. Unpaired adds and removes keep
  today's behavior exactly.
- **Document**: the signed CO still prices the pair as credit + charge lines
  (pricing transparency unchanged); rendering a pair as one "Changed: X → Y"
  block is a later cosmetic option, not a data-model change.
- **Why not a MODIFY action type**: it reopens the adds+removes ledger and
  drags delta-pricing + e-sign presentation questions with it. The pair
  keeps every locked property — nothing mutates until signature, Make is the
  single writer, the CO lines stay an immutable audit trail.
