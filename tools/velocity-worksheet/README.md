# Velocity Worksheet — build pipeline

Purchasing worksheet for SCW: per-SKU 12 / 6 / 3-month velocity from Adam's
monthly Shipedge export, with high-volume customers ("drivers") resolved
through HubSpot and pulled out so they can be assessed separately before a PO.

The deliverable is the claude.ai artifact **Velocity Worksheet**
(https://claude.ai/artifact/W8P21sMRbRU84C4wvBJ3hA)
that Micah and Adam work from together. The page keeps its human inputs
(driver rule, horizon, driver outlooks, per-SKU decision / qty / note) in the
artifact's shared store, so a rebuild never touches them.

## Inputs

| Source | What it provides |
|---|---|
| Google Sheet "Experimenting" (Adam's velocity workbook, id `1iC5zNdIlYd1DyVeHxhP8BjJi4zgf6wzMD3naqwQnGi8`) | Tabs `Jan`…`Dec`: line-level Shipedge exports (rolling 12 months). `Full Breakdown`: SKU master (SCW SKU, description, cost, case qty, status, on hand, on order, supplier). `S.Updates`: current inventory, on order, inbound dates, type. |
| HubSpot | Each Shipedge order → deal → company. Install orders carry the deal id in `Ref#` (`59610030653-SW1137 \| …`); every other order's number (`1268879875`, `20250827-7177`, …) is the deal's `description`. Resolved with the HubSpot SQL tool: `SELECT hs_object_id, dealname, description, pipeline, closedate, COMPANY.hs_object_id, COMPANY.name FROM DEAL WHERE description IN (...)` in batches of 100. |

The Shipedge export has **no customer column** (`Company_name` is SCW itself),
which is why the HubSpot hop exists.

## Files

- `build_data.py` — xlsx + `deals.json` → `data.json` (per-SKU monthly units,
  per-customer monthly units, inventory, source stats). RMA/repair lines
  ($0 + "Repair"/"RMA" in the description) are excluded; non-catalog SKUs
  (short numeric codes, "product return") are dropped.
- `core.js` — the math (windows, driver detection, outlook adjustments,
  suggested qty) and the HTML row renderers. Used by both the node build and
  the page itself, so the baked page and the live recompute agree.
- `page.js` — browser wiring: shared store (`db` capability), rule bar,
  tabs, filters, expand/collapse, outlook and decision editors.
- `render.js` — `node render.js data.json page.html` bakes the page.
- `deals.json` — cache of resolved orders (key → deal → companies). Only
  new order keys need resolving each month; merge into this file.

## Monthly refresh (what Claude does when asked)

1. Download the sheet as xlsx (Google Drive connector, export mime
   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
2. Resolve the new month's orders: `hubspot_batch.py` prints the IN-lists
   of order keys (see `build_data.py` `key()` for how a key is derived from
   `Ref#` / `Order#`) that are not yet in `deals.json`; run each through the
   HubSpot SQL query above, append the TSV results, and `hubspot_parse.py`
   merges them into `deals.json`. Only keys with 3+ units need resolving.
3. `python3 -I build_data.py experimenting.xlsx deals.json data.json`
4. `node render.js data.json page.html`
5. Publish `page.html` to the existing artifact URL (Artifact tool, same
   `url`, `capabilities` omitted so the stored `{db: {}}` declaration carries
   forward). Do not clear the store.

## Shared store layout (artifact `db`)

- `settings/main` — `{sharePct, minUnits, horizon, baseline}`
- `outlook/<docId(sku|cid)>` — `{key, status: unknown|ongoing|ending|oneoff, rate, endMonth, note}`
- `decisions/<docId(sku)>` — `{sku, status: ''|order|hold|watch|skip, qty, note}`

`docId()` replaces anything outside `[A-Za-z0-9_-]` with `_`.
