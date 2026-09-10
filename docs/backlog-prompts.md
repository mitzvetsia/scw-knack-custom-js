# Backlog Prompts

Self-contained, pick-up-later work items. Each entry is written so it can be
handed to an agent (or future-you) as a standalone prompt without re-deriving
the context. Newest at the bottom unless priority dictates otherwise.

---

## 1. V2 deletion — converge every delete path onto the bulk-delete pattern

**Status:** audited 2026-06-11. **Finding #1 (per-row trash accessory cascade) fixed
2026-06-12** — see below; remaining findings still open.

**Context / why:** Deletion in the V2 views (`worksheet-v2` on `view_3962`
build-SOW + `view_3586` sales; `bid-review-v2` "Reconcile Bids" on `view_3921`)
grew one surface at a time, so each path invented its own webhook/cascade/
refresh logic. **Bulk delete is the only one done correctly** — it has the
concurrency-capped + retry queue the repo mandates (Knack rate-limits ~10 req/s
and silently 429s). The per-row trash and the detail-panel accessory `×` predate
it and never adopted it. The task is to make them converge on the bulk pattern.

**The 5 pathways:**

| # | Pathway | Mechanism | Concurrency + retry | UI refresh | Views | Verdict |
|---|---------|-----------|---------------------|-----------|-------|---------|
| 1 | Per-row trash (`.scw-ws-v2-trash` / `data-scw-ws-v2-kebab`) | accessory cascade → webhook per child; parent → native `kn-link-delete` or REST `DELETE` fallback | ✅ now via `ns.bulk.queuedDelete` (cap 4 + retry/backoff), accessories-first then parent | fixed 1500 ms refetch | 3962/3586/3921 | **fixed** (was leaky) |
| 2 | Accessory chip `×` (`.scw-ws-v2-mh-del`) | native link or webhook fallback | ❌ single shot, no retry | poll-until-gone ~30 s + optimistic spinner | 3962/3586/3921 | partial |
| 3 | Bulk delete (toolbar + checkboxes) | webhook per record, accessories-first | ✅ cap 4 + 4 retries + backoff + settle (`worksheet-v2/bulk.js:502-602`) | `refetchAndNotify` + progress UI | 3962/3586 | **gold standard** |
| 4 | bid-review-v2 (Reconcile) | reuses the bulk module on `view_3921` (`bid-review-v2/init.js:76-82`) | ✅ inherits #3 | inherits #3 | 3921 | OK — no per-row delete on the grid |
| 5 | `delete-intercept.js` (legacy) | patches `window.confirm`, scrapes v1 DOM | ❌ | refetch parent | v1 only | dead on V2 (still bundled) |

**Findings, prioritized:**

1. **✅ DONE (2026-06-12) — 🔴 Per-row trash accessory cascade loses writes** (`worksheet-v2/init.js`).
   A device with N accessories fired N un-queued `fetch()`es; any 429 was silently
   dropped → orphaned accessory records. It was a bare `fetch` (no `keepalive`), so
   navigating right after the parent delete cancelled in-flight child deletes too.
   **Fixed:** accessories now cascade through `bulk.js`'s queue via the new
   `ns.bulk.queuedDelete` (concurrency cap 4 + retry/backoff + settle), and the
   parent delete is sequenced to fire only AFTER the child queue resolves — so a
   parent-delete re-render can no longer cancel in-flight child deletes.
2. **🟠 Inconsistent connection cleanup before delete.** v1 `connected-records.js`
   clears the child's `field_2464` (parent back-pointer) *before* deleting; the v2
   chip handler doesn't — it trusts Make. Dangling-pointer risk if the webhook lags/fails.
3. **🟠 Reciprocal `field_1957`↔`field_2197` cleanup on delete is unguarded.** Deleting
   a device doesn't clear the mirror client-side at all. **Same root as CLAUDE.md
   TODO #12** — the canonical-side + reconcile-sweep work would also heal
   delete-orphaned reciprocals. Fold the two together.
4. **🟡 Three different refresh patterns** (1500 ms fixed / poll-until-gone /
   `refetchAndNotify`), and a **silent no-op** if `ns.data` is undefined on the
   `view_3921` REST-fallback path (`worksheet-v2/init.js:745-770`) → row can linger
   in the DOM after a successful server delete.
5. **🟡 `delete-intercept.js` is dead code on V2** — still loaded, never fires (v2
   bypasses `window.confirm`). Confirm-and-remove, or document why it stays for any
   lingering v1 surface.

**Suggested order:** (1) ✅ converge per-row accessory cascade onto the bulk queue (done 2026-06-12) →
(2) add the pre-delete `field_2464` clear to the chip + per-row handlers →
(3) unify the post-delete refresh on `refetchAndNotify` with a poll fallback →
(4) tackle reciprocal cleanup as part of TODO #12 → (5) retire `delete-intercept.js`.

**Sibling to copy from:** `worksheet-v2/bulk.js` (`doDeleteWithRetry`,
`runJobQueue`, `collectAccessoryIds`, `partitionDeletable`) — it already does
everything the other paths are missing.

---

## 2. Product retirement — disable cascade + "where is this product quoted?" (ops Priority #2)

**Status:** bundle scaffold shipped 2026-09-10 (`src/features/product-lifecycle.js`,
commit `69222b9`) but **INERT** — every Builder-dependent key in its `CONFIG` is
blank and the module fails open with one console warning. Nothing runs in
production until the Builder work below lands and the keys are filled. Full
design + rationale: `docs/product-retirement.md`; tracked as CLAUDE.md Known
Issue #22.

**The ask (ops, 2026-09-10):** whenever a product is moved to **Disabled**,
(a) find every SOW line item carrying that product on a SOW with an associated
quote **less than 12 months old** and flip its "is disabled" flag, and (b) do
the same for line items on SOWs with **no** proposal whose SOW is itself
**less than 12 months old**. Separately, ops wants to pick a product that is
**running low** and see every SOW carrying it where a proposal is **less than
6 months old** (impact check).

**What already exists (do not rebuild):**

- Rules, pure and unit-testable on `SCW.productLifecycle._rules`:
  `cascade` = item qualifies if ANY connected SOW (`field_2154`, multi) has
  `latestProposal >= today − 12 mo` OR (`latestProposal` blank AND
  `created >= today − 12 mo`); `impact` = SOW qualifies if
  `latestProposal >= today − 6 mo` (window selectable 6 / 12 / 24 / All).
  Already-flagged items are skipped (idempotent re-runs); items on no SOW are
  counted separately as orphans.
- Data path: paginated view-based GETs (session token, no REST key — Known
  Issue #17) of the product's line items + all SOW headers, joined by SOW id
  in memory; SOW headers cached 5 min.
- Writes: concurrency-capped (4) retry-with-backoff, settle-don't-reject
  queue (`flagItems`), full / partial / total-failure reporting, per-record
  failures in the console.
- UX: auto-trigger on `knack-form-submit` / `knack-cell-update` /
  `knack-record-update` for `productStatusViews` → impact modal pre-filtered to
  the 12-month rule ("Product X is now Disabled — N line items on M SOWs …
  [Skip] [Flag N line items]"; `autoApply:true` skips the modal); on-demand
  "Where is this product quoted?" button on the product details view.

**Builder work (the actual TODO — all on the Products page scene):**

| # | Object | What | `CONFIG` key |
|---|--------|------|--------------|
| 1 | SOW Line Item | new **`FLAG_is disabled`** Yes/No, default No. **Do NOT reuse `field_2912`** — it is derived from the product with inverted polarity (Yes = still active) and flips for every line item ever created, which is exactly the noise the 12-month rule exists to avoid. | `lineItem.disabled` |
| 2 | SOW header | new **`SYS_latest proposal date`** — Max formula over the SOW's proposals' create date filtered to Status = Published. Blank = never quoted. | `sow.latestProposal` |
| 3 | SOW header | existing `SYS_create date` key (auto-stamped at creation; Known Issue #18) | `sow.created` |
| 4 | SOW header | SOW → Project connection key (optional; panel omits the link without it) | `sow.project` |
| 5 | Products page | hidden **all-records grid of SOW Line Items** (no page connection): product `field_1949`, SOW `field_2154`, qty `field_1964`, flag #1 **inline-editable** (the cascade PUTs through this view). 1000 rows/page; the module pages. | `lineItemsView` |
| 6 | Products page | hidden **all-records grid of SOW headers**: `field_2122`, `field_2126`, #2, #3, #4 | `sowsView` |
| 7 | Products page | scene key, the product **details** view (panel mounts under it), the view(s) where `field_956` is edited (edit form and/or products grid with inline edit) | `sceneKey`, `productDetailView`, `productStatusViews` |

Then: add #5 and #6 to `hide-data-source-views.js`, fill the keys, `bash
build.sh`, push, pin the SHA, and verify on the live Products page:
(a) disable a test product → modal lists only SOWs quoted/created in the last
12 months, older SOWs listed separately as skipped; confirm → flags land and a
re-run reports 0 to flag; (b) "Where is this product quoted?" on a stocked
product → SOW list matches a manual filter of proposals in the last 6 months.

**Open questions for ops (decide before flipping on):**

1. Which `field_956` values count as disabled? Module matches Disabled /
   Discontinued / Inactive / Retired case-insensitively — trim
   `disabledStatusValues` if the picklist differs.
2. Should re-enabling a product clear the flags? Not implemented (one-way
   "this SOW needs attention" mark today).
3. Do survey line items (`field_2627` product) need the same treatment?
   Out of scope for the first cut.
4. Follow-up once the flag exists: OR it into the worksheet "Product
   discontinued" badge (`field_2912 == No || FLAG_is disabled == Yes`) so a
   flagged item is loud on recent SOWs even if `field_2912` lags.

**Sibling to copy from:** `mirror-connection-sync.js` (`knackPutKeepalive`
queue) / `bid-review/init.js` `handleReopenBid` for the capped-retry PUT
pattern the module already mirrors; `product-lifecycle.js` `CONFIG` is the
only thing that should need editing for the first live run.
