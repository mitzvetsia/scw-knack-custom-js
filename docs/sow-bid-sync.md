# SOW ⇄ Bid Sync — one derive-at-apply scenario, two triggers

**Decision (2026-08-08):** the `package_copy_to_sow` Make scenario is reworked to
**derive the full sync from `{packageId, sowId}` at apply time** instead of
consuming the rich payload built client-side by
`src/features/bid-review/actions.js` → `buildCopyToSowPayload()`. This gives
full-parity sync from ANY trigger — the compare-page button (scene_1155) and
the subcontractor bid-submit flow — with exactly **one** field mapping to
maintain, and it reads current Knack truth instead of a client snapshot.

The client button keeps sending its rich payload (it's useful in Make run
history for debugging), but the scenario only reads `packageId` + `sowId` from
it. Any future change to sync semantics happens in the scenario's derivation —
not in `buildCopyToSowPayload`.

Webhook: `CFG.actionWebhook` (`hook.us1.make.com/68ctc26m...`),
`actionType: 'package_copy_to_sow'`.

## Trigger contract

Minimum body — everything else is optional/advisory:

```json
{
  "actionType": "package_copy_to_sow",
  "packageId":  "<bid package record id>",
  "sowId":      "<target SOW record id>",
  "source":     "compare_button" | "sub_submit"
}
```

Resolving `sowId` in the sub-submit trigger:
1. The package's own `field_2387` (REL_SOW) — preferred; a submitted bid that
   is explicitly tied to a SOW.
2. Else: the distinct SOW ids found in the bid items' `field_2404` →
   SOW item `field_2154`. If exactly one, use it.
3. Else (zero or 2+): **abort the auto-sync** and notify — don't guess.
   The ops button remains the arbiter for ambiguous cases.

Rule 1-first doubles as the guardrail: auto-sync on submit applies removals
with no human confirm, and with several packages bidding one SOW it would be
last-sub-to-submit-wins. Requiring the designated-bid connection (or a unique
derivation) keeps the auto path to bids that unambiguously own the SOW.

## Derivation algorithm (parity with buildCopyToSowPayload)

Two Knack searches:

- **A — bid line items** (object behind view_3680):
  `field_2415` (REL_bid) **is** `packageId`.
- **B — SOW line items** (object behind view_3610/view_3921):
  `field_2154` (REL_SOW) **contains** `sowId`.

Classify:

1. **updates** — every A-record with `field_2404` set: write its values onto
   the connected SOW item (`field_2404_raw[0].id`). This deliberately includes
   bid items whose line item lives on a *different* SOW — the grid does the
   same (its "other items on this bid" rows are walked by the payload builder).
2. **disconnectBids** — when 2+ A-records share one `field_2404` target, keep
   one and clear `field_2404` on the rest (always applied, never user-chosen).
   The client keeps the first in view_3680 render order; headless, keep the
   **oldest record id** — deterministic, and the divergence only exists in an
   already-anomalous double-connected state. The kept record's values drive
   the update.
3. **creates** — every A-record with `field_2404` blank: new SOW line item
   from the bid values.
4. **removals** — every B-record whose id is NOT a `field_2404` target from
   step 1, **except the accessory exemption**: skip when the B-record's
   `field_2464` (accessory-parent back-pointer) is set AND that parent id IS
   covered in step 1. Bids price the parent device, never each accessory — an
   accessory only goes when its parent goes (`actions.js` removal pass).

Known (harmless) divergences from the client build:
- The grid can flag a removal for a line item already disconnected from the
  SOW (its bid record's stale `field_2154` still lists it). Derivation from
  search B skips those — a strict improvement; removing an already-removed
  item was a no-op anyway.
- The dupe "keep" pick (step 2) can differ from the client's view-order pick.

Nothing else in the payload is user-shaped: the confirm modal only *displays*
what will happen (removals list, counts) — it can't deselect anything — so
derivation at apply time is semantically identical to the button's payload.

## Field map — payload key → bid record field

What each rich-payload key was built from; remap the scenario's apply modules
from `updates[].<key>` to these on the search-A record. Booleans arrive as
real booleans in `_raw`; connection ids come from `_raw[].id`.

| payload key    | bid field              | notes |
|----------------|------------------------|-------|
| sowItemId      | `field_2404_raw[0].id` | update target |
| label          | `field_2365`           | cosmetic (modal display only) |
| qty            | `field_2399_raw`       | number |
| rate           | `field_2400_raw`       | numeric string ("725.00") |
| labor          | `field_2401_raw`       | number |
| laborDesc      | `field_2409`           | HTML preserved |
| productName    | `field_2379_raw`       | |
| existCabling   | `field_2370_raw`       | boolean |
| connDevice     | `field_2380_raw[].id`  | **bid** record ids — translate to SOW item ids via each connected bid's own `field_2404` (existing scenario step, keep it) |
| mapConn        | `field_2374_raw`       | boolean |
| notes          | `field_2412_raw`       | |
| product        | `field_2627_raw[0].id` | product connection |
| sku            | `field_2328_raw`       | not projected by view_3680 → was always "" |
| price          | —                      | ⚠ was `num(field_2382)` = leading digits of the SKU text ("26DF8M-180" → 26). Junk — do not port. |
| productDesc    | `field_2629_raw`       | client stripped HTML tags |
| dropLength     | `field_2367_raw`       | |
| conduit        | `field_2368_raw`       | numeric feet, NOT yes/no |
| plenum         | `field_2371_raw`       | boolean |
| dropPrefix     | `field_2361_raw[0].id` | |
| dropNumber     | `field_2362_raw`       | number |
| exterior       | `field_2372_raw`       | boolean |
| limitQtyOne    | `field_2373_raw`       | boolean |
| proposalBucket | `field_2366_raw[0].id` | same bucket object as SOW-side `field_2219` — id is portable |
| mdfIdf         | `field_2375_raw[0].id` | same location object as SOW-side `field_1946` — id is portable |
| bidRecord      | whole record           | see caveat below |

Removals entry label: SOW item `field_1950`, falling back to product name.

**Dotted-key caveat:** the client's `bidRecord` blob came from a *view*, so it
carried projections like `field_2404.field_2154_raw`. Object-API records
don't have dotted keys. If any apply module read a dotted key off
`bidRecord`, remap it to the search-B (SOW item) record's own field.

## Connection writes — SCOPED MERGE (multi-SOW / multi-bid)

The device-graph write (`field_1957` Connected Devices / `field_2197`
Connected To) is the one place a wholesale "set it to what the bid says"
is WRONG. SOW line items are shared across SOWs (`field_2154` is multi),
so a switch on SOW-A and SOW-B carries children from BOTH SOWs' graphs —
and bid P_A only knows about SOW-A's. Overwriting `field_1957` from P_A's
view wipes the B-side connections. The rule:

> **A sync of (packageId, sowId) may only add/remove connections whose
> CHILD item is on `sowId` (`field_2154` contains it). Everything else on
> a parent's list is another SOW's graph — carried through untouched.**

Per matched parent P (bid item with `mapConn` true and `field_2380` set):

1. `desired` = translate P's bid-side `field_2380` ids → SOW item ids via
   the bidId→sowItemId map (`field_2404` of each connected bid record,
   **plus the ids of records created earlier in this same run** — see
   ordering below).
2. `current` = P's `field_1957_raw`.
3. **Steal guard** (child side, evaluated FIRST): a `desired` child whose
   `field_2197` currently points at a parent NOT on `sowId` is owned by a
   different SOW's graph — DROP it from `desired` + warn, never re-point.
   (Within-SOW re-pointing — the child's old parent is on `sowId` — is
   normal reassignment and proceeds.)
4. `new field_1957` = (`current` where child `field_2154` does NOT contain
   `sowId`) ∪ `desired`. PUT only if changed.
5. `field_2197` writes, mirroring step 4 exactly:
   - each `desired` child not already pointing at P → set to P (and if its
     old parent is an in-scope parent NOT matched on this bid, also remove
     the child from THAT parent's `field_1957` so the canonical side stays
     clean);
   - each `current` in-scope child dropped from the graph → clear its
     `field_2197` **only if** it still points at P AND the child is
     EXCLUSIVELY on this SOW (`field_2154` == [`sowId`]). A child shared
     with another SOW is add/keep only — a bid implying its removal logs a
     warning instead of writing (removing it would tear the other SOW's
     graph; with a single physical field there is no both-ways answer).

Every guard decision applies to BOTH sides — whatever is dropped from
`desired` in step 3 must not appear in step 4's union, or the pair drifts.
Make writes both fields itself (no client cascade runs server-side), so
steps 4–5 ARE the cascade here.

**Ordering within a run** (violating this silently narrows graphs):

1. `creates` land first → their new record ids join the bidId→sowItemId
   map (a bid's `field_2380` routinely references bid items whose SOW
   record didn't exist until this run — translating before creating drops
   those connections).
2. Scalar `updates` (qty/rate/labor/etc. — no cross-record hazards).
3. The connection pass above.
4. `removals` / `disconnectBids` last.

Warnings accumulated in steps 3/5 (cross-SOW steal blocked, shared-child
removal skipped) should surface in the run output — they are the cases
where two SOWs' bids genuinely disagree about one physical record, and a
human has to pick.

## Make implementation sketch (module flow)

0. **Webhook → Webhook Response 200 immediately** (processing exceeds the
   40s response window) → filter `actionType = package_copy_to_sow` →
   resolve `sowId` (body → package `field_2387` → abort branch).
1. **Searches → Array Aggregators**: bid items (`field_2415` is package,
   1000/page) → `BIDS`; SOW items (`field_2154` contains sowId) → `ITEMS`.
   Collect ids referenced by connections but absent from `ITEMS` (current
   `field_1957` children AND their `field_2197` parents can live on other
   SOWs) → iterate → Get a Record → `EXTRA`; `ALL` = merge(ITEMS, EXTRA).
2. **Creates first**: iterate no-`field_2404` bids → Create SOW item
   (incl. `field_2154=[sowId]`) → write the new id back to the bid's
   `field_2404` → aggregate. Then build `XLAT` (bidId→sowItemId) from
   matched bids ∪ creates — the translation map MUST include creates.
3. **Scalar updates**: iterate matched bids (skip dupes beyond the kept
   one) → Update the `field_2404` target.
4. **Connection pass** (scoped merge): outer iterator = matched bids with
   `mapConn` + `field_2380`; inner iterator per parent over
   deduplicate(current `field_1957` ∪ translated desired); per child,
   router on (inScope / inDesired / currentParent scope / exclusivity)
   implements the steal guard + shared-child keep; child `field_2197`
   writes fire here; inner Array Aggregator collapses survivors →
   Update parent `field_1957` (filter: only when changed). Aggregate
   {oldParent, child} moves → post-loop cleanup pass on in-scope old
   parents not matched on this bid.
5. **Removals**: iterate `ITEMS` not covered (minus accessory exemption)
   → Update `field_2154` = current MINUS sowId (**subtract, never clear**
   — the item may live on other SOWs). Then disconnectBids
   (`field_2404` = [] on dupes).
6. **Warnings**: text-aggregate steal-blocked / shared-removal-skipped →
   notify. A `dryRun` flag in the body + a filter on every write module
   gives a plan-only run for testing.

Make runs modules sequentially per execution, so Knack's ~10 req/s limit
is not a concern the way it is client-side.

## Migration order

1. Rework the existing scenario to derive from `packageId` + `sowId`,
   ignoring `updates`/`creates`/`removals` in the body.
2. Verify with the existing compare-page button (its payload already carries
   both ids; nothing client-side changes). Compare a run against the rich
   payload in Make history — they should match per the rules above.
3. Add the sub-submit trigger: one HTTP module posting the minimal body with
   `source: "sub_submit"` (plus the sowId resolution/gate above).
4. Leave `buildCopyToSowPayload` in place — the modal needs it for its
   preview counts/removals list, and the rich body documents each run.
