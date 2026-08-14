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

## Inventory movement reconciliation (optional inputs 3 & 4)

Two more drops turn the tool into a three-way month-close reconciliation:

- **Input 3 — ShipEdge "Total Inventory by SKU" report** (daily snapshots:
  `company_name, sku, description, available, pending, processing, total, date`).
  A snapshot dated D is the position at the **start of day D**, so a month runs
  1st → 1st-of-next-month; the report must include both boundary dates (the tool
  falls back to the nearest covered date with a warning). `total` matches the
  products export's "In Warehouse" (verified 2399/2427 SKUs on the pull date).
- **Input 4 — Xero Account Transactions for the Inventory account (1141)**.
  The native `.xlsx` parses directly in-browser (minimal ZIP/OOXML reader via
  `DecompressionStream`); a CSV export of the same report also works. The tool
  reads Opening/Closing Balance rows, dated transactions, debits/credits, and
  classifies credits into COGS journals (description matches /cog/i) vs other
  credits (vendor refunds, write-downs).

What it computes for the shipped-report month:

- **Physical side**: inventory value at both boundaries (qty × current cost),
  the month's change, and per-SKU `implied = Δqty + shipped` — positive is
  implied receipts, negative is unexplained loss (shrank more than shipments
  explain). Per-SKU movement CSV export included.
- **Books side**: opening balance rolled to the month start, purchases in,
  COGS journals out (itemized), implied month-end balance.
- **Cross-checks** (gap = Xero − ShipEdge; green ≤1%, amber ≤5%):
  month-start value, month-end value, month change, implied receipts vs
  booked purchases, this tool's COGS vs the booked COGS journals.

May 2026 actuals: month-end gap **+$22,467.68 (2.3%)** (books over physical),
receipts gap +$2,403.49 (1.1%), booked COGS journals $283,092.53 vs computed
$288,121.36 (−$5,028.83). Expected noise sources: current-cost valuation (not
layer cost), capitalized freight/tax in Xero bills, dropships that never touch
ShipEdge stock, bill dates lagging receipt dates, and $0-cost SKUs (RMA grades)
that the physical side values at zero.

## Xero adjustments ("moved/changed in Xero")

The movement card lists every transaction from the Xero report with a per-row
status: **in Xero as-is** (default), **changed in Xero…** (edit its
date/debit/credit inline), or **moved out / recoded** (excluded — it no longer
belongs to the inventory account). Every change recomputes all balances,
cross-checks and the month-by-month table instantly, with "(was $X)"
annotations showing the impact against the dropped report. A note field per
adjustment feeds the audit record; originals are always retained. Adjustments
persist in the browser (localStorage) across sessions and can be reset in one
click.

## Audit record

**Download audit record** (Journal summary card) produces a single
self-contained HTML file (`cogs-audit_YYYY-MM.html`): input files with SHA-256
fingerprints, the journal numbers and channel mapping, the month-by-month
table, every data fix-up applied, the full cost-shipped-per-item table, the
movement reconciliation with raw-vs-adjusted Xero figures, every Xero
adjustment (original → adjusted + note), a plain-language method note, and an
embedded machine-readable JSON block containing the complete computed state
(including per-shipment detail and the full per-SKU movement list).

## Multi-month / year-to-date mode

Drop shipped reports covering multiple months (several monthly files, or one
spanning export — identical duplicate lines across files are deduped) and the
tool computes **every month**: a month picker drives the detail views, and the
"Month by month — what COGS should have been" table shows per month the
computed Ecom/Install/All COGS vs the **COGS journals actually booked** in
Xero (over/under per month + YTD total), booked purchases, physical value
change and the month-end book-vs-physical gap where the snapshot report covers
the boundaries. Caveat: all months are costed at the single products export's
current costs, so restatements for older months inherit more cost drift.

## Herr Cheetoh tracker input (optional input 5)

Drop the tracker's **COGs line items export** (the file with a `COG REPORT`
column) and the month-by-month table gains tracker columns: the tracker's
ShipEdge-cost total, its **replen/FIFO total — the basis the COGS journals are
actually booked from** (confirmed: April and May 2026 journals match the replen
total to the penny), and a per-month **Booked − replen** gap. This makes the
three-way "computed vs tracker vs booked" forensics a standing feature instead
of a manual exercise.

## Preloaded builds (`tools/make-preloaded.py`)

`python3 tools/make-preloaded.py OUT.html file1.csv file2.csv … [--note "…"]`
embeds the given exports (text or `.xlsx`) into a copy of the workbench as a
`<script id="scw-preload">` JSON block. The output is a single HTML file that
opens with everything already loaded — same parsers, same UI — for sharing a
month-close snapshot or iterating on a fixed dataset. Audit records from v4
also embed the full Xero transaction list and tracker month totals in their
JSON block, so booked-journal forensics can be done from the audit alone.

## Known limitations

- **Price changes**: merchandise COGS uses the item cost as of the products
  export, not the cost when each unit was received — same approximation as the
  old tab. FIFO layer costing (tariffs) stays in the herr cheetoh tracker; the
  in-tool FIFO against import records is the natural next extension.
- The Xero side of the inventory reconciliation is a manual paste (one number).
  Item-level Xero import would allow a per-SKU diff.
