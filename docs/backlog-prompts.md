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
