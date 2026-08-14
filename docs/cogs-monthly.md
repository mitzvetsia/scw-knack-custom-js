# Monthly COGS Workbench (`tools/cogs-monthly.html`)

Standalone browser tool that replaces the manual "cost shipped / item" tab in the
monthly COGS spreadsheet. It is **not** part of the Knack bundle — do not add it
to `build.sh`. Open the file locally in any browser; nothing leaves the machine.

## Monthly workflow

1. Export the two files from ShipEdge for the closed month:
   - **Shipped-items report** (columns `Company_name, Channel, Ship#, Order#,
     Ref#, Sku, Upc, Description, Qty, Sold_price, Processed_at`)
   - **Products / item-data export** (columns incl. `Sku, Description, Cost,
     Available, In Warehouse`). Pull this **right after month close** — the tool
     costs every shipped unit at this file's cost, so the closer the export is
     to close, the tighter the "latest cost" approximation.
2. Open `tools/cogs-monthly.html`, drop both files in (order doesn't matter —
   they're detected by their headers).
3. Read the MJ numbers off the tiles / Journal summary:
   - **Ecommerce COGs** = every channel mapped to the Ecommerce bucket (the
     "[DATE] COGs" journal line). Blank-channel rows (exchanges, employee,
     internal) default to Ecommerce, matching the historical calc.
   - **Install COGs** = the `Installation Services` channel.
   - Channel→bucket mapping is editable in the UI and remembered per browser.
4. Type the tariff total from the FIFO tracker → **Total journal**.
5. **Download cost shipped / item CSV** (or "Copy for Google Sheets") and feed
   it to the herr cheetoh FIFO tracker, exactly like the old tab. The
   **shipment detail CSV** carries per-shipment dates if FIFO at day grain is
   ever wanted.
6. Inventory: the tool computes ShipEdge inventory value two ways
   (`In Warehouse × cost` and `Available × cost`), takes Xero's balance as an
   input for the delta, and exports a per-SKU value file for chasing mismatches.

## Export quirks the tool fixes automatically

Each fix is surfaced in the "Data quality & fix-ups" panel — nothing is silent.

- **Broken shipped rows.** The ShipEdge report writer emits descriptions
  containing `\"` (inch marks) or line breaks *raw*, splitting the row into
  extra columns and/or extra physical lines, padded back to 13 columns. The old
  spreadsheet flow dropped or mis-read these rows. The tool reassembles them by
  anchoring on the `Processed_at` datetime (columns 0–6 fixed, Qty/Sold just
  left of the date, everything between is description overflow).
- **Leading zeros stripped from SKUs.** Numeric SKUs like `00405614` arrive as
  `405614` and miss the item-data join. The tool re-pads zeros (and flags an
  ambiguity if more than one candidate exists — those stay unmatched).
- **MySQL-style escaping in the products export** (`\"` for quotes, `\N` for
  null). A naive CSV parse silently shifts columns on ~a dozen rows.
- Zero-cost items, unmatched SKUs, zero-qty rows, duplicate master SKUs and
  rows dated outside the dominant month are all listed for review.

## Validation against the 2026-05 close

Run against the May 2026 exports (products export pulled 2026-06-17):

| Line | Tool | COGs Summary sheet | Δ |
|---|---|---|---|
| Ecommerce ("[DATE]") COGs | $202,534.86 | $202,534.86 | **$0.00** |
| Install COGs | $85,586.50 | $85,373.03 | +$213.47 |
| All COGs | $288,121.36 | $287,907.89 | +$213.47 |

The install delta is the three broken export rows (`BW-215`, `B01KBEOL5E`,
`EXT-HD60M`, $382.30 at June-17 costs) that the tool recovers, net of whatever
partial value the spreadsheet flow captured for them at close-time costs. The
four zero-stripped SKUs ($2,369.20) were already reflected in the sheet's
number.

## Known limitations

- **Price changes**: merchandise COGS uses the item cost as of the products
  export, not the cost when each unit was received — same approximation as the
  old tab. FIFO layer costing (tariffs) stays in the herr cheetoh tracker; the
  in-tool FIFO against import records is the natural next extension.
- The Xero side of the inventory reconciliation is a manual paste (one number).
  Item-level Xero import would allow a per-SKU diff.
