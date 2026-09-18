# Product retirement — disable cascade + "where is this product quoted?"

Status: **designed 2026-09-10, bundle module shipped with Builder TBDs**
(`src/features/product-lifecycle.js`). Nothing runs until the keys in its
`CONFIG` are filled in — every missing key fails open with one console
warning, so the module is inert in production until the Builder work below
lands.

## What ops asked for

1. **When a product is moved to Disabled**, flip an "is disabled" flag on the
   SOW line items that still matter:
   - every line item (with that product) on a SOW that has an associated
     quote (published proposal) **less than 12 months old**, and
   - every line item on a SOW with **no** proposal whose SOW is itself
     **less than 12 months old**.
   Older SOWs are left alone — they are dead paper and flagging them is noise.
2. **Impact check for a product running low**: surface every SOW carrying the
   product where a proposal is **less than 6 months old**, so ops can see
   what is exposed before the stock runs out.

## Why it is client-side, and what that forces

The bundle has no server side and the REST API key never ships to the browser
(Known Issue #17). Everything therefore runs as the logged-in user through
**view-based** reads and writes on **one scene** — the Products page. Knack's
page-scoped endpoints only see views that live on that scene, so the two
hidden data grids below must sit on the same scene as the product edit
surface.

Two facts make the rules cheap to evaluate in the browser:

- A SOW line item can sit on several SOWs (`field_2154` is multi). The rule
  is "any connected SOW qualifies".
- The dates the rules need are SOW-level, not item-level. So the module
  fetches (a) the product's line items and (b) the SOW headers, and joins
  them by SOW id in memory. No per-item date fields are needed.

## Builder prerequisites (all TBD — fill `CONFIG` as you create them)

| # | Object | What | `CONFIG` key |
|---|--------|------|--------------|
| 1 | SOW Line Item | **`FLAG_is disabled`** — Yes/No, default No. The flag the cascade flips. Do **not** reuse `field_2912` (it is derived from the product with inverted polarity: `Yes` = still active; see below). | `lineItem.disabled` |
| 2 | SOW header | **`SYS_latest proposal date`** — a Max formula over the SOW's published proposals' create date, filtered to Status = Published. Blank = never quoted. | `sow.latestProposal` |
| 3 | SOW header | the existing **`SYS_create date`** key (auto-filled at record creation; see Known Issue #18 — it is the creation stamp, which is exactly what rule 1b wants). | `sow.created` |
| 4 | SOW header | the SOW → **Project** connection key (for the SOW link + project name in the panel). Optional — the panel just omits the link without it. | `sow.project` |
| 5 | Products page | a **hidden all-records grid of SOW Line Items** (no page connection) with columns: product `field_1949`, SOW `field_2154`, qty `field_1964`, and the new flag from #1 **with inline editing ON for the flag** (the cascade PUTs through this view). Pump it to 1000 rows/page; the module pages. | `lineItemsView` |
| 6 | Products page | a **hidden all-records grid of SOW headers** with columns: `field_2122` ID, `field_2126` NAME, #2, #3, #4. | `sowsView` |
| 7 | Products page | the scene key, the product **details** view (impact panel mounts under it) and the view(s) where `field_956` (product status) is edited — the edit form and/or the products grid with inline edit. | `sceneKey`, `productDetailView`, `productStatusViews` |

Add #5 and #6 to `hide-data-source-views.js` once they exist.

### About `field_2912`

The worksheets already show a "Product discontinued — replace before
submitting" badge when a line item's `field_2912` reads **No**. That field is
sourced from the connected product (Yes = product still active), so when a
product is disabled it flips for **every** line item ever created — including
five-year-old SOWs — which is why it cannot carry the 12-month rule. Keep it
as the "product is dead" signal; the new flag is the "this SOW is exposed"
signal. Follow-up once the flag exists: have the worksheet badge OR the two
(`field_2912 == No || FLAG_is disabled == Yes`) so a flagged item is loud on
recent SOWs even if `field_2912` lags.

## Rules (implemented in `SCW.productLifecycle._rules`)

```
cascade (12 mo):  item qualifies if ANY connected SOW has
                    latestProposal >= today − 12 months
                 OR (latestProposal is blank AND created >= today − 12 months)
impact  (6 mo):   SOW qualifies if latestProposal >= today − 6 months
```

Items already flagged are skipped (re-running is idempotent). Items on no SOW
at all are ignored and counted separately.

## Trigger + UX

- **Automatic**: the module binds `knack-form-submit` and `knack-cell-update`
  on `productStatusViews`. When the saved record's status is a disabled value
  it opens the impact modal for that product pre-filtered to the 12-month
  rule: "Product X is now Disabled — 14 line items on 6 SOWs quoted in the
  last 12 months. [Skip] [Flag 14 line items]". `autoApply: true` skips the
  modal and flags immediately.
- **On demand**: the product details view gets a **"Where is this product
  quoted?"** button. The panel lists every SOW carrying the product (window
  selector 6 / 12 months / all) with project, last quoted date, item count
  and quantity, plus the same "Flag line items on recent SOWs" action.
- **Writes** go through a concurrency-capped (4) retry-with-backoff queue
  (Knack's ~10 req/s 429 limit — CLAUDE.md "Pushing many PUTs at once"),
  settle-don't-reject, and the result reports full / partial / total failure
  with the per-record failures in the console.

## Open questions for ops

1. Which product status values count as disabled? The module matches
   Disabled / Discontinued / Inactive / Retired case-insensitively — trim
   `disabledStatusValues` if the picklist differs.
2. Should re-enabling a product clear the flags? Not implemented (the flag is
   a one-way "this SOW needs attention" mark today).
3. Does a *survey* line item (`field_2627` product on the survey object) need
   the same treatment? Out of scope for the first cut.
