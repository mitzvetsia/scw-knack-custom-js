# Contract Payment Milestones — base install agreements

Status: **structure agreed 2026-08-27** (Ben LaRue + Micah, Slack). Drafted
language for the esignatures.com installation-agreement template. Not yet in
any template, Make scenario, or bundle code; needs a legal read before it goes
client-facing.

## The agreed structure

| # | Milestone | Amount invoiced |
|---|-----------|-----------------|
| 1 | Contract execution | 100% of Equipment |
| 2 | Equipment shipped to site | 40% of Installation (labor) |
| 3 | Substantial completion | 40% of Installation (labor) |
| 4 | Project completion sign-off | 20% of Installation (labor) |

The 40/40/20 split applies to the **Installation (labor) total only** —
equipment is invoiced in full up front, and labor is deliberately
front-weighted. "Equipment" and "Installation" are the proposal's Equipment
Total and Installation Total (the L1 footer subtotals the published agreement
already renders).

## Contract language (paste-ready)

> **Payment Schedule.** Client will pay the total contract price in four
> milestone payments:
>
> **1. Contract execution.** 100% of the Equipment total, invoiced when this
> Agreement is signed.
>
> **2. Equipment shipped — 40% of Installation.** Invoiced when the Equipment
> (or the substantial majority of it) has shipped to the project site or to
> Contractor's staging facility. Backordered items do not delay this
> milestone.
>
> **3. Substantial completion — 40% of Installation.** Invoiced when the
> installed system can be used for its intended purpose — at the latest, once
> the head-end equipment is installed and powered and at least [75%] of the
> devices in the scope of work are installed. Minor punch-list items do not
> delay this milestone. Contractor will notify Client in writing (email is
> fine); unless Client identifies specific blocking work within [5] business
> days, this milestone is deemed reached on the date of that notice.
>
> **4. Completion sign-off — remaining 20% of Installation.** Invoiced at
> Client sign-off, which may not be unreasonably withheld, and may not be
> withheld over minor punch-list items (which Contractor will complete
> promptly). If Client neither signs off nor provides a written list of
> specific deficiencies within [5] business days of Contractor's completion
> notice, the project is deemed complete and the final invoice is payable.
>
> Invoices are due [net 30]. If a milestone is delayed by Client or by site
> unavailability, Contractor may invoice it once Contractor is ready to
> perform the work. Change orders are invoiced separately under their own
> terms.

## Why it's written this way

- **The "substantial completion" anchor problem** (Micah's objection: no
  natural anchor project to project) is handled three ways: the standard term
  with its standard "usable for its intended purpose" test; an objective floor
  (head-end powered + [75%] of devices installed); and a notice + [5]-day
  window so the milestone anchors to a *date* even when the physical state is
  debatable — silence can't stall the invoice.
- **"Shipped," not "delivered"** — Ben's trigger, and the earlier cash.
  Partial shipments and warehouse staging count, so one backordered camera
  doesn't hold 40% of labor.
- **Deemed sign-off** protects the 20% holdback from a non-responsive client.
- **Change orders stay outside the split** — the locked CO design
  (docs/change-orders.md) invoices a CO at its own signature.

## Knobs to settle

- [75%] device threshold; [5] business-day response windows; [net 30] terms.
- Whether milestone 2 keeps the staging-facility option or requires site
  delivery.
- Legal review.

## Implementation notes (when this gets wired up)

- The language lives in the esignatures.com template / Make — no bundle code.
- The acceptance-time Xero invoice becomes **equipment-only**; labor is
  invoiced in three later tranches. Milestones 2–4 have no system trigger
  today (manual in Xero until automated).
- Before automating tranche amounts off the payload, fix Known Issue #21
  (`buildInvoiceItems` qty>1 undercount); Known Issue #18's acceptance
  write-back is what gives milestone 1 a real date in Knack.
