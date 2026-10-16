# Handoff: surface every basis-bid line that is NOT on this SOW (reconcile grid)

**Branch**: `claude/loving-bardeen-mvvtoi`. Rebuild (`bash build.sh`), commit `dist/`, push.
Every push is live at `https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@<sha>/dist/knack-bundle.js`.

## The bug (verified on SOW 1105 / Bid 8, 2026-10-16)

Bid 8 is the basis bid for SOW 1105. Bid record `6a4d4456fd3e6d24c1c9e48c` (label `RA-I-002`,
Informant Dual Vision, $750) is on Bid 8 and points (`field_2404`) at SOW line item
`6a46a9f150aff3cc5911e806`, whose own `field_2154` lists SOW **1684** only. The 1105 grid
renders **no row** for it. It only appears in the sub-bid diff panel ("Bid only · on 1684",
one of the "15 gaps") and in the "Items not on this SOW" tray under "On SOW 1684 · on this bid".
Thirteen Bid 8 lines are in this state (RA-I-002..008, RA-I-010, I-008, two Cat6 uplinks,
Imperial 64ch, Admiral Pro 32ch). The two `E-003` lines (line item on NO SOW) DO render a row,
which is the behavior wanted for all fifteen.

**Cause**: `src/features/bid-review-v2/transform.js` ~L1395-1420 splits unmatched bid lines
into `otherKind:'bid-only'` (line item on no SOW / not loaded → rendered in the grid with an
empty SOW cell + "+ Add to SOW") and `otherKind:'other-sow'` (line item on a different SOW →
kept in `otherRows` for column totals but **never rendered**; the NOTE at ~L1562-1580 explains
the old "belong to another SOW" block was removed in favor of the tray).

## The rule to implement

With a basis bid chosen, **every** basis-bid line whose line item is not on this SOW gets a
grid row, regardless of whether that line item lives on another SOW. The row offers exactly
two actions: **Remove from bid** and **+ Add to this SOW**. No "wrong SOW" / "errant"
judgment anywhere in the UI copy. Nothing is gated on the bid package's `field_2387`.

## Changes

### 1. `bid-review-v2/transform.js` — render other-sow rows like bid-only rows
- Keep the `other-sow` / `bid-only` classification (the copy differs), but feed BOTH lists
  into the grid: at ~L1558 `groupRows(displayRows.concat(bidOnlyRows), …)` becomes
  `displayRows.concat(bidOnlyRows, otherSowRows)` (after the basis-filter husk routing).
- Run `otherSowRows` through the same basis-filter husk block (~L1434-1473) as `bidOnlyRows`
  so a row whose only cell is on a hidden column collapses into the Removed subgroup too.
  Simplest: build one `notOnSowRows = otherSowRows.concat(bidOnlyRows)` before that block and
  route it instead of `bidOnlyRows` alone.
- Set `needsSow = true` on other-sow rows as well (the SOW cell keys off it), and add
  `addMode: 'union'` on other-sow rows vs `addMode: 'create'` on bid-only rows so card.js can
  pick the write path (§3).
- Delete / rewrite the NOTE block at ~L1562-1580 so it no longer claims these rows are
  deliberately not rendered. Totals need no change (`otherRows` already feeds them).
- Keep `dedupeRowsBySowItem` as is; other-sow rows have `sowItem` set but by construction
  the same item never also appears as a matched row on this grid.

### 2. `bid-review-v2/card.js` — SOW cell + badge
- `buildSowCell` (~L510-560): other-sow rows reach the `sowItemData` branch today (the item
  record IS loaded) and would show the 1684 line's details in the blue cut-out. Don't. For any
  row with `needsSow`, render the **empty** shape: `--empty` + `--off-sow` classes, the dash,
  one context line, then the action bar. Context line copy:
  - other-sow: `Not on this SOW. On 1684.` (join `row.otherSowNames` with ", ")
  - bid-only: `Not on any SOW.`
- Action bar in the SOW cell, repo order (destructive first, primary last):
  `Remove from bid | + Add to this SOW` — for other-sow rows the add button reads
  `+ Add to this SOW (also)`. Reuse `crAttrs('cell_remove_from_bid', row.id, basisPkgId,
  sowId, bidRecordId)` for Remove (the handler exists; see the bid-cell button at ~L736).
- Bid cell: add a small rose badge `Not on this SOW` on these rows (same badge for both kinds)
  so all fifteen read as one class of problem. Existing `__row--off-sow` class (L1194) stays.
- Remove the now-redundant `__sow-elsewhere` "on 1684" line at ~L637 (the SOW cell carries it).

### 3. The two write paths for "+ Add to this SOW"
- **bid-only** (`addMode:'create'`): keep the existing `row_add_to_sow` CR action
  (`bid-review/init.js` ~L3754) — it creates a NEW SOW line item and re-points the bid record.
- **other-sow** (`addMode:'union'`): the line item already exists; do NOT create a new one.
  Reuse the tray's write — `sow-item-tray.js` `addToSow(recordId, sowId, btn)` (~L263) PUTs
  `field_2154` through view_3921 as a **union** (never replace). Export it on
  `SCW.sowItemTray.addToSow` if it isn't already, and call it from the new card action with
  `recordId = row.sowItem`. One PUT per click — no queue needed. On success the existing
  refetch (`scw-ws-v2-record-saved` / `knack-view-render`) rebuilds; if it doesn't fire from
  that path, call `SCW.bidReviewV2.data.refetchAll()`.

### 4. `sub-bid-diff/config.js` + `render.js` + `pdf-html.js` — diff panel
- `TIERS.orphan.label` `'Bid only'` → `'Not on this SOW'` (config.js ~L129). Same rename in
  the tally (`render.js` ~L1103) and the PDF stat (`pdf-html.js` ~L175).
- Row note (`render.js` ~L759): keep `'on ' + otherSowNames` for other-sow; change the
  bid-only fallback `'not on this SOW'` → `'on no SOW'` (the tier name now says the first part).
  Mirror in `pdf-html.js` ~L247.
- Do NOT apply the `$0 → treated as covered` suppression (`render.js` ~L751
  `if (moneyEq(ol, 0)) continue;`) when `row.otherKind === 'other-sow'`. A $0 placeholder is
  noise; a $0 line that is scoped on another SOW is still a gap.
- Coverage-gap count and labor subtraction stay as they are.
- The panel's jump (`jumpId = row.id`, `jumpAttr:'bid'`) currently has no target for these
  rows because they aren't rendered; after §1 it lands. Verify it scrolls to the new row.

### 5. `sow-item-tray.js` — stop duplicating
- Items with `_onBid` are now grid rows. Filter them OUT of the tray groups in `buildGroups`
  (~L184-245) and drop the `on this bid` item badge (~L406) and group count (~L448). The tray
  keeps only lines on other SOWs / no SOW that are NOT on this section's bid, with "+ add".

### 6. Copy sheet (final)
| Surface | Text |
|---|---|
| SOW cell, other-sow | `Not on this SOW. On 1684.` |
| SOW cell, bid-only | `Not on any SOW.` |
| SOW cell actions | `Remove from bid` · `+ Add to this SOW` / `+ Add to this SOW (also)` |
| Bid cell badge | `Not on this SOW` |
| Diff tier / tally / PDF | `Not on this SOW` |
| Diff row note | `on 1684` / `on no SOW` |

## Verify
- `cd tests && npm test` (there is a `tests/bid-review-v2/` dir — add a transform smoke test:
  a bid record whose `field_2404` item is on SOW B only, viewed on SOW A, must appear in the
  grid groups with `otherKind:'other-sow'` and `needsSow:true`).
- Live: project with SOW 1105 (basis Bid 8). Expect 15 new/kept rows in the 1105 grid
  (13 `Not on this SOW. On 1684.` / `On 1463, 1684.`, 2 E-003 `Not on any SOW.`), Bid 8
  column total unchanged, "15 gaps" unchanged with the tier renamed, each panel row jumps
  to its grid row, the tray's 1684 group shrinks from 23 to 13 and loses the "on this bid"
  badge. Click `+ Add to this SOW (also)` on one RA-I line → that line item's `field_2154`
  gains 1105 AND keeps 1684; the row becomes a normal matched row on rebuild.
- Accepted consequence: a bid assigned to two SOWs shows each of its lines on both grids,
  matched on the owner and `Not on this SOW` on the other. That is intended.
