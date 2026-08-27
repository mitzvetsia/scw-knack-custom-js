# Contract Payment Milestones — base install agreements

Status: **structure agreed 2026-08-27** (Ben LaRue + Micah, Slack). This doc
records the agreed milestone schedule and drafts the contract language for it,
ready to drop into the esignatures.com installation-agreement template. Not yet
wired into any template, Make scenario, or bundle code — and it needs a legal
read before it goes client-facing.

## The agreed structure

| # | Milestone | Amount invoiced |
|---|-----------|-----------------|
| 1 | Contract execution | 100% of Equipment |
| 2 | Equipment shipped to site | 40% of Installation (labor) |
| 3 | Substantial completion | 40% of Installation (labor) |
| 4 | Project completion sign-off | 20% of Installation (labor) |

The 40/40/20 split applies to the **Installation (labor) total only** —
equipment is invoiced in full up front. Labor is deliberately front-weighted
(Ben: "we can weigh the first two labor payments heavier"); 40/40/20 confirmed
by both.

"Equipment" and "Installation" map to the proposal's Equipment Total and
Installation Total — the same L1 footer subtotals the published agreement
already renders (and that `buildInvoiceItems` reconciles against, Known
Issue #21).

## Contract language (paste-ready)

> **Payment Schedule.** Client will pay Contractor the total contract price in
> milestone payments as follows:
>
> **(a) Contract Execution — Equipment.** Upon execution of this Agreement,
> Contractor will invoice Client for one hundred percent (100%) of the
> Equipment total set forth in this Agreement.
>
> **(b) Equipment Shipment — 40% of Installation.** When the Equipment (or the
> substantial majority of the Equipment by value) has been shipped to the
> project site, or to Contractor's facility for staging and configuration,
> Contractor will invoice Client for forty percent (40%) of the Installation
> total set forth in this Agreement. Backordered or long-lead items do not
> delay this milestone so long as the substantial majority of the Equipment by
> value has shipped.
>
> **(c) Substantial Completion — 40% of Installation.** Upon Substantial
> Completion of the installation, Contractor will invoice Client for forty
> percent (40%) of the Installation total. "Substantial Completion" means the
> installation is sufficiently complete that the system can be used for its
> intended purpose, and in any event is deemed to have occurred once (i) the
> head-end equipment (servers, recorders, panels, and network hardware, as
> applicable) is installed and powered, and (ii) at least [75%] of the devices
> in the scope of work have been physically installed. Minor punch-list items,
> pending programming adjustments, and items awaiting Client action or
> Client-furnished materials do not delay Substantial Completion. Contractor
> will give Client written notice (email is sufficient) when Contractor
> determines Substantial Completion has occurred; unless Client identifies in
> writing, within [5] business days of that notice, specific material work
> that prevents use of the system for its intended purpose, Substantial
> Completion is deemed to have occurred on the date of Contractor's notice.
>
> **(d) Project Completion — remaining 20% of Installation.** Upon completion
> of the installation and Client's sign-off, Contractor will invoice Client
> for the remaining twenty percent (20%) of the Installation total. Client's
> sign-off will not be unreasonably withheld, conditioned, or delayed, and may
> not be withheld on account of minor punch-list items that do not prevent use
> of the system for its intended purpose (which Contractor will complete
> promptly). If Client does not either sign off or provide written notice of
> the specific items preventing sign-off within [10] business days after
> Contractor's written notice that the work is complete, the project is deemed
> complete and the final invoice becomes payable.
>
> **(e) General.** Each invoice is due [net 30] days from the invoice date.
> Milestones may occur, and be invoiced, concurrently. If a milestone is
> delayed by Client's request, by site unavailability, or by any other cause
> within Client's control, Contractor may invoice the affected milestone when
> Contractor is ready to perform the associated work. Change orders are priced
> and invoiced under their own terms and are not part of the percentages
> above. Contractor may suspend work if any undisputed invoice remains unpaid
> more than [15] days past its due date.

## Drafting decisions & rationale

1. **The "substantial amount of work completed" anchor problem** (Micah's
   objection — no natural project-to-project anchor). The draft attacks it
   three ways so the awkwardness never becomes a payment dispute:
   - Uses the construction-standard term **"Substantial Completion"** with its
     standard functional test ("usable for its intended purpose") instead of a
     bespoke phrase — courts and clients both know what it means.
   - Adds an **objective floor**: head-end powered + [75%] of devices
     installed = substantially complete, whatever anyone argues about
     "purpose."
   - Adds a **notice + short dispute window**, so the milestone anchors to a
     *date* (Contractor's notice) even when the physical anchor is debatable.
     Silence can't stall the invoice.
2. **"Shipped," not "delivered."** Ben's wording — and the earlier cash
   trigger. "Substantial majority by value" plus the staging-facility option
   because partial shipments and warehouse staging are the norm; one
   backordered camera shouldn't hold 40% of labor. If ops prefers a strict
   arrived-on-site trigger, delete the staging clause in (b).
3. **Deemed sign-off in (d).** The 20% holdback is effectively labor
   retainage; without a deemed-completion clause a non-responsive client
   controls the final payment indefinitely.
4. **Change orders stay outside the split.** The locked CO design
   (docs/change-orders.md) invoices a CO at its own signature via the SIGNED
   webhook — (e) says so explicitly so nobody nets CO amounts into the
   40/40/20.
5. **Client-delay protection in (e).** If the client stalls shipment or site
   access, the milestone converts to "when Contractor is ready to perform" —
   standard protection so the schedule can't be weaponized.

## Knobs to settle before this goes in the template

- **[75%]** device-installed threshold for the Substantial Completion floor.
- **[5]** / **[10]** business-day response windows in (c) and (d).
- **[net 30]** payment terms and the **[15]**-day suspension trigger in (e) —
  match whatever the current agreement/Xero terms say.
- Whether (b) keeps the staging-facility shipment option or requires
  site delivery.
- Legal review of the whole section.

## Implementation notes (when this gets wired up)

- The language lives in the **esignatures.com agreement template / Make**, not
  this bundle — no `src/` or `dist/` change is part of shipping it.
- **The acceptance-time Xero invoice changes shape**: today the proposal flow
  invoices at acceptance-creation; under this schedule that invoice becomes
  **equipment-only**, with labor invoiced later in three tranches (40/40/20).
  The Make invoice scenario needs that split; milestones 2–4 have no system
  trigger today and would be raised manually in Xero until automated.
- Reconcile **Known Issue #21** (`buildInvoiceItems` qty>1 undercount on the
  base path) before automating milestone amounts off the payload — the labor
  tranche math inherits any undercount.
- **Known Issue #18** (SOW `FLAG_accepted` / `SYS_accepted date` never
  written) is the "contract execution" timestamp this schedule keys off —
  landing that write-back gives milestone 1 a real anchor date in Knack.
