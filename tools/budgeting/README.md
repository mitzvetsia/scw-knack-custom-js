# SCW Budgeting & Projections Tool

`SCW_Budget_Projections_2026.xlsx` — a formula-driven budgeting/projection workbook that
mirrors the legacy budget tool (STAFFING / ramps / per-rep revenue / summary) but is grounded
in **Xero actuals as booked** (accrual — bills at bill date), with trend & drop-off detection
per vendor, and the legacy tool's **department allocations winning wherever they contradict
Xero's department tracking**.

## Tabs
| Tab | Purpose |
|---|---|
| README | legend + rules baked into the model |
| PROJECTIONS | leadership view: actual months from Xero, projected months from the control tabs; modest + stretch side by side |
| SALES TEAM | per-rep ramps, modest%/stretch% attainment (e.g. Zach 80% / Stu 100%), commission + SM/Director overrides → comp liability |
| STAFFING | headcount × fully-loaded cost per role; add roles, $/% raises per role or department-wide |
| EXPENSES | every expense: ON/OFF, Xero-vs-budget source pick, $ override, % adjust, from/to months; add rows |
| XERO ACTUALS | vendor × month as booked + status (STEADY/GROWING/DROPPING/DROPPED/NEW/ONE-TIME/PERIODIC) + suggested $/mo + budget-tool cross-ref |
| RAMP SCHEDULES | editable revenue ramp curves |

## Refreshing with new data
1. Export from Xero: **Accounting → General Ledger Detail** for the full year, all accounts, as xlsx.
2. Export the budget-tool tables to `contractsexpenses.csv` / `allocations.csv` (same columns as before).
3. `python3 build_model_data.py gl=<GL.xlsx> contracts=<contracts.csv> allocations=<allocations.csv> legacy=<old budget.xlsx> cutoff=YYYY-MM-DD`
4. `python3 build_budget_workbook.py` → writes a fresh `SCW_Budget_Projections_2026.xlsx`.
5. Re-apply any blue-cell edits you'd made (or diff the two files).

Requires `python3 + openpyxl`. `model_data.json` is the staged intermediate (checked in for
reproducibility of the current build; contains aggregated 2026 financials).
