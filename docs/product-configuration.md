# Product Configuration — Training Guide

This document explains how the fields on a **Product** record shape the behavior of every bid, SOW, and worksheet downstream. If you're configuring a new product in the Knack catalog, start here.

---

## Mental model: three layers

Product-based behavior works in three layers. **Understand this before anything else** — it explains most of the surprises configurators run into.

```
┌──────────────────────────────────────────────────────────────┐
│ 1. PRODUCT RECORD                                            │
│    Master definition — flags & defaults live here.           │
│    (You configure this.)                                     │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        │ stamped / copied at creation time
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. LINE ITEM (Bid Item or SOW Line Item)                     │
│    The flag value is COPIED DOWN when a line item is         │
│    created or a product is assigned to it.                   │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        │ read at render time
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. WORKSHEET / FORM / PDF                                    │
│    The UI reads the flag from the LINE ITEM — not the        │
│    product. This is what the user sees.                      │
└──────────────────────────────────────────────────────────────┘
```

### What this means in practice

- Changing a flag on a product **only affects future line items.** Existing line items keep whatever value was stamped when they were created.
- To fix an existing line item after changing a product flag, you must either update the line-item field directly or recreate the line item.
- The worksheet UI never looks "up" at the product record at render time. It reads the mirrored field on the line item. So if a line item's behavior looks wrong, check the **line-item** field first.

---

## Section 1 — Start here: Equipment Bucket (`field_133`)

The first field you set on any product is the **Equipment Bucket**. Every other field's visibility and meaning is gated off this choice.

| Bucket | Typical products |
|---|---|
| Cameras or Readers | IP cameras, card readers, door sensors |
| Networking or Headend | NVRs, switches, access-control controllers, servers |
| Other Equipment | Intercoms, keypads, monitors, misc. hardware |
| Mounting Hardware | Brackets, poles, housings |
| Services | Programming, project management, commissioning |
| Assumptions | Line items representing assumed scope (not billed goods) |
| Licenses | Software licenses, subscriptions |

**Rule:** pick the bucket first, then fill in the rest of the form. The form will hide/show fields based on your choice (logic in `bucket-field-visibility_add-product.js`).

---

## Section 2 — The two behavior flags that change the worksheet

These are the **only two product-level boolean flags** that visibly change how the worksheet renders. Both are **stamped onto the line item at creation / product assignment** and read from the line item at render time.

### 2.1 `field_2232` — *FLAG_map incoming camera or reader connections*

**Set to "Yes" for:** distribution devices that cameras or readers connect *into* — NVRs, network switches, access-control panels, servers.

**Set to "No" for:** the cameras/readers themselves, plus anything that isn't an aggregation point.

#### What happens when it's "Yes"

| Layer | Effect |
|---|---|
| Line item (bid) | `field_2374` is stamped to "Yes" |
| Line item (SOW) | `field_2231` is stamped to "Yes" |
| Worksheet | A **"Connected Devices"** picker (`field_2380`) appears on the line, letting the user attach cameras/readers as children of this device |
| PDF export | This product appears as a **column** in the connection-map pivot table in the survey-worksheet PDF |
| Bid review | The comparison grid shows a connection-column for this row |

#### What happens when it's "No"

- No connection picker on the line
- Does not appear as a column in the connection-map pivot
- If this product is a camera/reader, it will appear as a **row** in the pivot (and can be connected *to* a distribution device)

#### Common mistake
Forgetting to set this to "Yes" on a new NVR or switch product. Symptom: operators can't attach cameras to it on the worksheet, and it's missing from the connection-map PDF.

#### Files that implement this
- `src/features/device-worksheet.js` (reads the flag to show/hide the picker)
- `src/features/survey-worksheet-pdf-export.js` (pivot column construction)
- `src/features/bid-review/render.js` (connection column in comparison)
- `src/features/mirror-connection-sync.js` (keeps parent/child in sync)

---

### 2.2 `field_2373` — *FLAG_limit to quantity 1*

**Set to "Yes" for:** products that only make sense in quantity 1 per line (e.g., a single NVR at a headend, a site license, a project-management line).

**Set to "No" for:** everything that can be ordered in multiples (cameras, readers, cables, most equipment).

#### What happens when it's "Yes"

- The worksheet **hides the editable quantity field** on the line
- Quantity is effectively locked at 1
- Users can't increment or change it from the worksheet

#### What happens when it's "No"

- The quantity field (`field_2399` on bid, `field_1964` on SOW) is editable on the worksheet
- Fee recalculations respond to quantity changes

#### Common mistake
Leaving this as "No" on a product that doesn't make sense in plural (e.g., a single project-management fee). Symptom: operators can accidentally bump the quantity and inflate the bid.

#### Files that implement this
- `src/features/device-worksheet.js` — the `orShowWhenFieldIsNo: 'field_2373'` gate on the quantity field

---

## Section 3 — Defaults seeded onto line items

These product fields **do not gate UI.** They populate the initial value of fields on the line item when a product is assigned. The user can still override them per-line.

| Field | Name | Seeds onto line item |
|---|---|---|
| `field_1517` | Default installation hours | Labor hours on bid/SOW lines |
| `field_2021` | Default labor description | `field_2409` (bid) / `field_2020` (SOW) |
| `field_2166` | Default sub bid | `field_2400` (bid rate) / `field_2150` (SOW sub bid) |
| `field_74` | Default quantity | `field_2399` / `field_1964` (starting qty) |
| `field_146` | Retail price | Cost / margin baseline |

**Rule of thumb:** if a field name starts with "default," it's a seed, not a gate. Editing it later only affects new line items.

---

## Section 4 — Catalog metadata

Pure reference data. Doesn't change behavior, but used throughout the system.

| Field | Name | Notes |
|---|---|---|
| `field_35` | Product name | Drives the stored product name (`field_2379`) on bid items |
| `field_56` | SKU | Catalog identifier |
| `field_57` | Description | Long-form description |
| `field_1926` | Source | Supplier / sourcing info |

---

## Section 5 — Internal categorization flags

These are flags that exist on the product but mostly drive internal behavior, reporting, or gating outside the worksheet.

| Field | Name | What it controls |
|---|---|---|
| `field_956` | FLAG_product status | Active/inactive — controls whether the product is selectable |
| `field_1562` | FLAG_eligible for discount | Gates whether lines using this product can be discounted |
| `field_1563` | FLAG_type of system | System-type categorization used in reporting and rules |
| `field_2220` | FLAG_deliverables schema | Schema identifier that gates which fields render for this product type |

---

## Section 6 — Line-item fields worth knowing (downstream)

You won't edit these on the product, but they show up on the bid / SOW worksheet and trace back to product configuration. Including them here because operators often ask "why is this field showing/hiding?"

### 6.1 The "require sub bid" gate (`field_2478`)

This is the **single biggest UI gate on the bid worksheet.** When `field_2478` is "Yes" on a bid item, the worksheet shows the labor description, labor rate, quantity, and extended price. When "No," only a plain quantity field appears.

**How it gets set:** `field_2478` is **not stamped by the JS bundle** — it's set either by a Knack form/submit rule, a Make webhook, or manually per line. If you copy it from the product at line-item creation (per your current workflow), it behaves like the other stamped flags: changing it on the product later won't affect existing lines.

**What it controls:**
- Shows/hides `field_2409` (labor description)
- Shows/hides `field_2400` (labor rate)
- Shows/hides `field_2399` (quantity, unless `field_2373` is "No")
- Shows/hides `field_2401` (extended price)
- Gates change-request submission in bid review (no sub bid → no CRs)

### 6.2 Chips / toggles on line items

| Field | Record | What it does |
|---|---|---|
| `field_2370` / `field_2461` | Bid / SOW | Existing vs. new cabling toggle |
| `field_2371` / `field_1983` | Bid / SOW | Plenum (stacked with Exterior) |
| `field_2372` / `field_1984` | Bid / SOW | Exterior vs. Interior |
| `field_2455` | Bid / SOW | Mounting height: Under 16' / 16'–24' / Over 24' |
| `field_1972` | SOW | Labor variables multi-chip (Exterior / High Traffic / Plenum) |

### 6.3 Mirror fields (where the product flag ends up)

| Product flag | Bid item mirror | SOW line item mirror |
|---|---|---|
| `field_2232` (map connections) | `field_2374` | `field_2231` |
| `field_2373` (qty-1 lock) | *(read directly)* | *(read directly)* |

### 6.4 Grouping fields on line items

| Field | Purpose |
|---|---|
| `field_2366` / `field_2219` | Proposal bucket (bid / SOW) — drives bucketRules in the worksheet |
| `field_2223` | Equipment bucket on survey bid items — routes which product selector appears |
| `field_2246` | Unified product (consolidates the bucket-specific product selectors) |
| `field_2218` | Sort order within L2 groups |

---

## Section 7 — Survey forms: bucket-based product selectors

On the **survey bid item add form**, the product selector you see depends on the bucket you chose (`field_2223`):

| Bucket | Product selector shown |
|---|---|
| Cameras or Readers | `field_2193` |
| Networking or Headend | `field_2194` |
| Other Equipment | `field_2195` |
| Licenses | `field_2224` |

Whichever one you pick, the value is consolidated into **`field_2246`** (unified product) — that's what downstream code actually reads. Changing the bucket clears all four selectors and the unified field.

Logic lives in `src/features/set_unified_product_field.js` and `src/features/bucket-field-visibility_add-survey-bid-item.js`.

---

## Section 8 — Configuration checklist for a new product

Use this as a quick reference when setting up a new product.

- [ ] **`field_133`** Equipment Bucket — pick first
- [ ] **`field_35`** Product name
- [ ] **`field_56`** SKU (if applicable to bucket)
- [ ] **`field_57`** Description
- [ ] **`field_146`** Retail price
- [ ] **`field_1926`** Source
- [ ] **`field_956`** Product status (active)
- [ ] **`field_1562`** Eligible for discount — Yes/No
- [ ] **`field_1563`** Type of system
- [ ] **`field_2232`** Map incoming connections — **Yes** for distribution devices (NVRs, switches, controllers), **No** for endpoints (cameras, readers)
- [ ] **`field_2373`** Limit to qty 1 — **Yes** for singleton products, **No** for everything else
- [ ] **`field_2220`** Deliverables schema (if applicable)
- [ ] **`field_1517`** Default installation hours
- [ ] **`field_2021`** Default labor description
- [ ] **`field_2166`** Default sub bid
- [ ] **`field_74`** Default quantity

---

## Section 9 — Troubleshooting

### "Why doesn't the connection picker show on this NVR?"
Check `field_2374` on the bid item (or `field_2231` on the SOW item). If it's "No" but the product's `field_2232` is "Yes," the line was created before the flag was set — update the line item directly or recreate it.

### "Why can the user change the quantity on this project-management line?"
`field_2373` on the product is "No." Set it to "Yes" on the product, then update existing lines.

### "Why isn't the labor description prefilled?"
`field_2021` on the product is empty. Set it, and any new line items using this product will seed correctly.

### "Why is the line item showing labor fields but no quantity (or vice versa)?"
That's the `field_2478` "require sub bid" gate interacting with `field_2373` "qty 1." See Section 6.1. Quantity appears when `field_2478=Yes` OR `field_2373=No`.

---

## Appendix: file map

Where each behavior is implemented in the JS bundle.

| Behavior | File |
|---|---|
| Product form field visibility | `src/features/bucket-field-visibility_add-product.js` |
| Survey bid item form visibility | `src/features/bucket-field-visibility_add-survey-bid-item.js` |
| Unified product consolidation | `src/features/set_unified_product_field.js` |
| Worksheet rendering + field gates | `src/features/device-worksheet.js` |
| Connection parent/child sync | `src/features/mirror-connection-sync.js` |
| Lock fields when flags are No | `src/features/lock-fields.js`, `src/features/SOW_lineitem_conditional-field-grayout.js` |
| PDF connection-map pivot | `src/features/survey-worksheet-pdf-export.js` |
| Bid review comparison | `src/features/bid-review/` (config.js, render.js, init.js) |
| Grid L2/L3 grouping | `src/features/bid-items-grid.js`, `src/features/proposal-grid.js` |
