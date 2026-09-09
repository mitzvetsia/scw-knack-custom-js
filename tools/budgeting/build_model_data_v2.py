#!/usr/bin/env python3
"""Stage 1 (v2): TTM accrual model data for the dashboard.

Sources:
  - Xero "Account Transactions" export (Accrual Basis, Aug 1 2025 - Jul 31 2026):
    authoritative for expenses / COGS / payroll, 12 full months of trend history,
    clean Contact names. Verified identical to the GL Detail on every overlapping
    month+bucket (delta $0.00), so this substitutes cleanly.
  - Xero "General Ledger Detail" export (Jan-Aug 2026): revenue + other income
    (the Account Transactions report filter excluded Revenue accounts) and the
    Departments tracking category per vendor (no dept column in the new report).
  - contractsexpenses.csv + allocations.csv + legacy BUDGET workbook: unchanged.

Output: model_data_v2.json (dashboard input). The v1 model_data.json (workbook) stays.
"""
import sys, json, csv, re, collections, statistics, os
from datetime import datetime
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
A = dict(
    at="/root/.claude/uploads/77ac7e98-f266-57ce-b2c5-93304bdfc682/c384c446-Security_Camera_Warehouse__INC__Account_Transactions_13.xlsx",
    at2="/root/.claude/uploads/77ac7e98-f266-57ce-b2c5-93304bdfc682/bcc7e877-Security_Camera_Warehouse__INC__Account_Transactions_14.xlsx",
    at3="/root/.claude/uploads/77ac7e98-f266-57ce-b2c5-93304bdfc682/1cc63c99-Security_Camera_Warehouse__INC__Account_Transactions_15.xlsx",
    # AT#19 (pulled 2026-09-16): Aug 2025 – Sep 2026, every expense and revenue account, in Xero's
    # newer layout with Source / Departments / Related account columns. Covers the whole window on
    # its own and supersedes the three older exports wherever it is present.
    at4="/root/.claude/uploads/77ac7e98-f266-57ce-b2c5-93304bdfc682/ad6b6af7-Security_Camera_Warehouse__INC__Account_Transactions_19.xlsx",
    contracts="/root/.claude/uploads/77ac7e98-f266-57ce-b2c5-93304bdfc682/ccd2bd72-contractsexpenses.csv",
    allocations="/root/.claude/uploads/77ac7e98-f266-57ce-b2c5-93304bdfc682/47bec46b-allocations.csv",
    legacy="/root/.claude/uploads/77ac7e98-f266-57ce-b2c5-93304bdfc682/25b0d1bd-BUDGET_TEST_1774983468__Q2Q3_2026_JULY_REWORK.xlsx",
    gl="/root/.claude/uploads/77ac7e98-f266-57ce-b2c5-93304bdfc682/7cf4d3fa-Security_Camera_Warehouse__INC__General_Ledger_Detail_2.xlsx",
    v1=os.path.join(HERE, "model_data.json"),
)
for arg in sys.argv[1:]:
    k, _, v = arg.partition("="); A[k] = v

# TTM month index: 0 = Sep 2025 ... 11 = Aug 2026. The window ends on the last CLOSED month —
# AT#15 (Jan-Aug 2026, pulled Sep) shows August fully posted, so it rolls forward one.
TTM_LABELS = ["Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26","Jun 26","Jul 26","Aug 26"]
Y26_FROM = 4          # index of Jan 2026 in the TTM window
ACTUAL_MONTHS = 8     # Jan..Aug 2026 are booked
def ttm_idx(y, m):
    i = (y - 2025) * 12 + m - 9
    return i if 0 <= i <= 11 else None

def money(s):
    if s is None: return 0.0
    s = str(s).replace("$","").replace(",","").strip()
    if not s: return 0.0
    neg = s.startswith("-") or (s.startswith("(") and s.endswith(")"))
    s = s.strip("()-")
    try: v = float(s)
    except ValueError: return 0.0
    return -v if neg else v

# ---------------- Account Transactions (TTM accrual) ----------------
# Two exports are merged. AT#13 (Aug 2025-Jul 2026) is the only source for the 2025 half of
# the TTM window; AT#14 (calendar 2026, pulled 2026-08-24) supersedes it for every 2026 month.
# They disagree on May-Jul 2026 because Xero books DAILY payroll-liability accruals
# ("Payroll Liabilities - Monday/Tuesday/...") that are later reversed in a lump
# ("Reversal of Payroll Liabilities"). AT#13 caught those pairs mid-cycle, understating
# Jun ($233K) and Jul ($286K); the fully-posted figures are $313K and $321K, in line with
# every other month. Always prefer the newest export for a month it covers.
SKIP = ("Total","Opening Balance","Closing Balance","Net movement","No transactions","Date","Account Transactions","Security Camera","For the period","Accrual Basis","Account Type")
class Posting(tuple):
    """(account, ttm_idx, name, debit, credit, iso_date) plus .contact / .desc / .source / .dept /
    .rel — the older exports had no Source column, so those come back empty for them."""
    __slots__ = ()
    contact = property(lambda s: s[6]); desc = property(lambda s: s[7]); source = property(lambda s: s[8])
    dept = property(lambda s: s[9]); rel = property(lambda s: s[10])
def read_at(path, keep):
    """keep(year, month) -> bool. Columns are found by the header row (Xero added Source / Tax /
    Account / Departments / Related account in late 2026), falling back to the old positions."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    out, section, H = [], None, None
    def col(row, name, pos):
        if H is not None and name in H: return row[H[name]] if H[name] < len(row) else None
        return row[pos] if pos < len(row) else None
    for row in ws.iter_rows(values_only=True):
        a = row[0]
        rest = [v for v in row[1:] if v not in (None, "")]
        if a == "Date":
            H = {str(n).strip(): i for i, n in enumerate(row) if n}
            continue
        if isinstance(a, str) and not rest:
            s = a.strip()
            if not any(s.startswith(k) for k in SKIP):
                section = s.lstrip("- ").strip()
            continue
        if isinstance(a, datetime):
            i = ttm_idx(a.year, a.month)
            if i is None or not keep(a.year, a.month): continue
            contact = str(col(row, "Contact", 1) or "").strip()
            desc = str(col(row, "Description", 2) or "").strip()
            out.append(Posting((section, i, contact or desc,
                        float(col(row, "Debit", 5) or 0), float(col(row, "Credit", 6) or 0), a.date().isoformat(),
                        contact, desc, str(col(row, "Source", -1) or "").strip(), str(col(row, "Departments", -1) or "").strip(),
                        str(col(row, "Related account", -1) or "").strip())))
    wb.close()
    return out

# AT#13 is still the only source for the 2025 tail; AT#15 (Jan-Aug 2026, Expense AND Revenue)
# supersedes both earlier exports for every 2026 month and makes the GL Detail redundant for
# revenue — it disagrees with the older GL parse by up to $46K in a month, and the fresher,
# accrual-basis figures win.
if A.get("at4") and os.path.exists(A["at4"]):
    records = read_at(A["at4"], lambda y, m: True)      # one export covers the whole window
else:
    records = read_at(A["at"], lambda y, m: y == 2025)
    newest = A.get("at3") or A.get("at2") or A["at"]
    records += read_at(newest, lambda y, m: y == 2026)
HAS_SOURCE = any(r.source for r in records)

def code(acct): return acct.split(" - ")[0].strip() if acct else ""
VARCOMP_RE = re.compile(r"variable comp|commission|bonus|spiff", re.I)
ACCRUAL_RE = re.compile(r"payroll liabilit", re.I)
REVERSAL_RE = re.compile(r"reversal", re.I)
OTHER_INC = {"4050", "4051", "4057"}   # interest earned, rental income, late fees
# NOTE: 8311 UniView Rebate is typed Other Income in Xero, so the AT#15 export ("Expense,
# Revenue") does not carry it — booked other income here is interest + rent + late fees only.
# The rebate ran roughly $6-9K/mo against a $117K January credit being drawn down; the forward
# assumption lives in the dashboard's Other-income lever rather than being inferred from here.
PAYROLL_PL = {"66000","6529","6727","6189"}
# Lines in a payroll account that are really a vendor's bill: 6189 carries Rippling's own
# subscription (an annual contract reclassed from prepaid month by month, plus seat top-ups).
# They are opex on the Rippling vendor, so the Licenses card compares the bill against them.
OPEX_OVERRIDES = [("6189", r"rippling")]
def opex_override(c, text):
    return any(c == code_ and re.search(pat, text, re.I) for code_, pat in OPEX_OVERRIDES)
COGS = {"5257","5258","5259","5260","5566","5567","5568","5569","5570","5571","6734","6737","6730"}
def is_opex(c):
    return (c.startswith(("6","8")) or c == "208") and c not in PAYROLL_PL and c not in COGS and c != "8311"

# ---------------- contracts + allocations (as v1) ----------------
contracts = {}
with open(A["contracts"]) as f:
    for row in csv.DictReader(f):
        name = row["Name"].strip()
        if not name: continue
        monthly = money(row["Monthly Cost"]) or money(row["Annual Cost"]) / 12.0
        contracts[name] = dict(monthly=round(monthly,2), unalloc=money(row["Unallocated Amount (monthly)"]),
            unalloc_dept=row["Bill Unallocated Licenses To What Department?"].strip(),
            cost_type=row["Cost Type (drop down)"].strip(), purpose=row["Purpose (short text)"].strip(),
            seats=money(row["Number of Seats"]), per_seat=money(row["Per Seat Cost"]),
            cadence=("monthly" if money(row["Monthly Cost"]) else "annual" if money(row["Annual Cost"]) else "quarterly" if money(row["Quarterly Cost"]) else "monthly"),
            per_bill=(money(row["Monthly Cost"]) or money(row["Annual Cost"]) or money(row["Quarterly Cost"])))
fixed_alloc = collections.defaultdict(lambda: collections.defaultdict(float))
seat_alloc = collections.defaultdict(float)
# Per-position licensing, one tier per (vendor, price per seat): the roles it covers and how
# many licenses the Knack app had assigned. The dashboard turns these into license rules.
lic_tiers = collections.defaultdict(list)
with open(A["allocations"], encoding="utf-8-sig") as f:   # the export carries a BOM on its first column
    for row in csv.DictReader(f):
        vend = row["Contracts & Expense"].strip()
        if not vend: continue
        amt = money(row["Allocation Amount"])
        dept, poss = row["Department"].strip(), row["Position(s)"].strip()
        if poss and not dept:
            seat_alloc[vend] += amt
            lic_tiers[vend].append(dict(pepm=round(money(row["PEPM"]), 2),
                positions=[p.strip() for p in poss.split(",") if p.strip()],
                licenses=int(money(row["Licenses Allocated"]) or money(row["Allocated to Headcount"]) or 0),
                name=row["Allocation Name"].strip()))
        elif dept: fixed_alloc[vend][dept] += amt
licenses = []
for name, c in contracts.items():
    tiers = lic_tiers.get(name)
    if tiers:
        # unallocated seat dollars become a live minimum-seat shortfall on the license rule,
        # not a static budget line — so they follow headcount and cannot be counted twice
        main = max(tiers, key=lambda t: t["licenses"])
        assigned = sum(t["licenses"] for t in tiers)
        min_seats = int(c["seats"]) if c["seats"] else (assigned + (round(c["unalloc"] / main["pepm"]) if main["pepm"] else 0))
        licenses.append(dict(vendor=name, tiers=tiers, min_seats=min_seats, contract_seats=int(c["seats"] or 0), per_seat=c["per_seat"],
            unalloc=round(c["unalloc"], 2), unalloc_dept=c["unalloc_dept"], cadence=c["cadence"],
            per_bill=round(c["per_bill"], 2), monthly=c["monthly"]))
    elif c["unalloc"] and c["unalloc_dept"]:
        fixed_alloc[name][c["unalloc_dept"]] += c["unalloc"]

# One contact, several bills: Rippling's contact also carries Google Workspace (billed through
# Rippling) and employee expense reimbursements it pays out. Each is its own vendor.
SPLITS = [(r"^rippling$", r"gsuite|g suite|google", "Google (Rippling)"),
          (r"^rippling$", r"reimburse|per diem", "Employee reimbursements (via Rippling)")]
# A manual journal has no contact: the vendor is somewhere inside its description ("Feb 2026 -
# Jan 2027 Commercial Auto", "Annual Taxjar Dec 25/Nov 26"). Checked only when the exact and
# prefix rules below find nothing, and only on contact-less lines.
CONTAINS = [("auto owners","Auto Owners Insurance"),("commercial auto","Auto Owners Insurance"),("amtrust","Amtrust"),
            ("taxjar","TaxJar"),("amazon","Amazon (supplies)"),("buncombe","Buncombe County Property Tax"),("gong","Gong.io Inc"),
            ("zoom","Zoom"),("clickup","ClickUp"),("hubspot","Hubspot"),("atlassian","Atlassian"),("slack","Slack"),("bonusly","Bonusly"),
            ("rippling","Rippling"),("birdeye","BirdEye Inc"),("dun & bradstreet","Dun & Bradstreet"),("knack","Knack"),("adobe","Adobe"),
            ("verizon","Verizon Wireless"),("linkedin","LinkedIn"),("docker","Docker, Inc"),("make.com","Make.com"),("digitalocean","DigitalOcean.com")]
def vendor_name(contact, desc):
    """The vendor a posting belongs to, from its contact and description."""
    contact = re.sub(r"\s+", " ", (contact or "").split("\n")[0]).strip()
    desc = re.sub(r"\s+", " ", (desc or "").split("\n")[0]).strip()
    if contact.startswith("Payment: "): contact = contact[9:]
    for crx, drx, name in SPLITS:
        if re.search(crx, contact, re.I) and re.search(drx, desc, re.I): return name
    if contact: return contact
    v = desc
    if canon(v) == ((v[:57].rstrip() + "…") if len(v) > 60 else v):   # nothing exact or prefixed matched
        low = v.lower()
        for kw, name in CONTAINS:
            if kw in low: return name
    return v
EXACT = {"hubspot":"Hubspot","shipedge":"ShipEdge","adjust ppc spend to match month":"Google Advertising",
 "google":"Google Advertising","feb 2026":"Auto Owners Insurance","11 richland llc":"Rent",
 "secure vision solutions":"Install Services Site Surveys","sitetech solutions":"Install Services Site Surveys",
 "truist":"Bank & Credit Card Fees","truist bank":"Bank & Credit Card Fees","amex":"Bank & Credit Card Fees",
 "ipayment":"Bank & Credit Card Fees","chatgpt":"ChatGPT (OpenAI subscriptions)",
 "openai":"OPENAI (Survail LLM)","amazon":"Amazon (supplies)","sales":"Fraud / Disputed Charges",
 "apple":"Fraud / Disputed Charges","capital one":"Capital One Rewards & Credits",
 "sba":"Small Business Administration","aws":"Amazon Web Services",
 "mountain valley spring water":"Mountain Valley Spring Water","american express":"Bank & Credit Card Fees"}
PREFIX = [("adjust ppc","Google Advertising"),("gong","Gong.io Inc"),("zoom","Zoom"),("clickup","ClickUp"),("taxjar","TaxJar"),
 ("dun & bradstreet","Dun & Bradstreet"),("docker","Docker, Inc"),("corporate filings","Corporate Filings LLC"),
 ("adobe","Adobe"),("verizon","Verizon Wireless"),("knack","Knack"),("rippling","Rippling"),
 ("# 015493633","Auto Owners Insurance"),("atlassian","Atlassian"),("dkl investments","DKL Investments, LLC"),
 ("2025-2026 buncombe","Buncombe County Property Tax"),("buncombe county","Buncombe County Property Tax"),
 ("make.com","Make.com"),("digitalocean","DigitalOcean.com"),("logmein","Logmein (Go To Meeting)"),
 ("name-cheap","Name-Cheap.com"),("authorize.net","Authorize.net"),("esignatures","ESignatures.io"),
 ("birdeye","BirdEye Inc"),("linkedin","LinkedIn")]
def canon(v):
    k = v.lower().strip()
    if k in EXACT: return EXACT[k]
    for p, c in PREFIX:
        if k.startswith(p): return c
    for c in contracts:
        if c.lower() == k: return c
    return (v[:57].rstrip() + "…") if len(v) > 60 else v


opex_vm = collections.defaultdict(lambda: [0.0]*12)   # vendor -> ttm months
opex_va = collections.defaultdict(collections.Counter)
opex_vam = collections.defaultdict(lambda: collections.defaultdict(lambda: [0.0]*12))   # raw vendor -> account -> ttm months
acct_ttm = collections.defaultdict(lambda: [0.0]*12)                                   # every opex account -> ttm months
totals_ttm = collections.defaultdict(lambda: [0.0]*12)
cogs_accounts = collections.defaultdict(lambda: [0.0]*12)
cogs_vendors = collections.defaultdict(lambda: collections.defaultdict(lambda: [0.0]*12))
cogs_big = []          # individual postings large enough to explain a month on their own
opex_last = {}          # raw vendor name -> most recent posting date (ISO) — "last billed"
mj_by_vendor = collections.defaultdict(float)   # raw name -> $ that arrived as manual journals (prepaid reclasses)
xdept_at = collections.defaultdict(collections.Counter)   # raw name -> Departments tag counts (newer exports)
for rec in records:
    acct, i, contact, debit, credit, day = rec[:6]
    c = code(acct)
    if not c or not c[0].isdigit(): continue
    net = debit - credit
    if c in PAYROLL_PL and opex_override(c, rec.contact + " " + rec.desc):
        c = "OPEX-OVERRIDE"   # falls through to the opex branch below
    if c.startswith("4"):
        # Split operating sales from the incidental lines. Interest, rent and late fees are not
        # sales and must not inflate the revenue the whole model paces against.
        (totals_ttm["rebate"] if c in OTHER_INC else totals_ttm["revenue"])[i] -= net
        continue
    if c in COGS:
        totals_ttm["cogs"][i] += net
        cogs_accounts[acct][i] += net
        # Vendor detail for COGS. The opex vendor master deliberately excludes COGS accounts,
        # so without this a spike like Jul-26's single $26.5K Avigilon line in 5257 is invisible
        # from the dashboard — the COGS history shows the jump but never says who caused it.
        v = re.sub(r"\s+", " ", contact.split("\n")[0]).strip()
        if v.startswith("Payment: "): v = v[9:]
        if not v: v = "(unlabelled)"
        if len(v) > 60: v = v[:57].rstrip() + "\u2026"
        cogs_vendors[c][v][i] += net
    elif c in PAYROLL_PL:
        totals_ttm["payroll"][i] += net
        if c == "66000": totals_ttm["wages"][i] += net
        elif c == "6529": totals_ttm["ptax"][i] += net
        # Variable comp (AE/AM/BDR commissions) is booked INSIDE payroll, so booked months are
        # already total comp cost. Split it out so the dashboard can compare its base-salary
        # model against a like-for-like base figure.
        if VARCOMP_RE.search(contact): totals_ttm["varcomp"][i] += net
        # Payroll-liability accruals post daily and are reversed on the PAY DATE (biweekly),
        # not at month-end, so each calendar month closes with a stub of accrued-but-unreversed
        # days. The residual below is that stub's month-over-month change: it is real accrual
        # accounting, but it makes any SINGLE month a noisy benchmark (Jan -$106K, Jul +$37K,
        # summing to only +$10K over Jan-Jul). Track it so the dashboard can show why.
        if c == "66000":
            if REVERSAL_RE.search(contact): totals_ttm["accrual_rev"][i] += net
            elif ACCRUAL_RE.search(contact): totals_ttm["accrual_acc"][i] += net
    elif c == "OPEX-OVERRIDE" or is_opex(c):
        totals_ttm["opex"][i] += net
        v = vendor_name(rec.contact, rec.desc) if HAS_SOURCE or rec.contact or rec.desc else re.sub(r"\s+"," ", contact.split("\n")[0]).strip()
        if v.startswith("Payment: "): v = v[9:]
        opex_vm[v][i] += net
        opex_va[v][acct] += abs(net)
        opex_vam[v][acct][i] += net
        acct_ttm[acct][i] += net
        if rec.source == "Manual Journal": mj_by_vendor[v] += net
        if rec.dept: xdept_at[v][rec.dept] += 1
        if day > opex_last.get(v, ""): opex_last[v] = day

# Single COGS postings that make a month look unlike its neighbours. Ranking by raw size is
# useless here: the list fills with the routine month-end 5258 COG-adjustment journals (the
# normal mechanism) and with install-subcontractor draws that are simply lumpy by nature. What
# matters is a line that DOMINATES its account-month AND lands in a month running well above
# that account's own median — which is how Jul-26's $26.5K Avigilon charge in 5257 (5x a normal
# month for that account) surfaces while a $106K Secure Vision draw in a typical 6734 month does
# not. Routine adjustment journals are excluded outright.
ROUTINE_RE = re.compile(r"cog[s]? adjustment", re.I)
BIG_ABS = 5000.0
def _median(xs):
    xs = sorted(x for x in xs if x > 0)
    return xs[len(xs) // 2] if xs else 0.0
acct_median = {a: _median(v) for a, v in cogs_accounts.items()}
for rec in records:
    acct, i, contact, debit, credit, _day = rec[:6]
    c = code(acct)
    if c not in COGS: continue
    net = debit - credit
    if net < BIG_ABS: continue
    v = re.sub(r"\s+", " ", contact.split("\n")[0]).strip() or "(unlabelled)"
    if ROUTINE_RE.search(v): continue
    month_tot = cogs_accounts[acct][i]
    med = acct_median.get(acct, 0.0)
    if not month_tot or not med: continue
    share = net / month_tot
    lift = month_tot / med                       # how far this month runs above a normal one
    if share < 0.4 or lift < 1.4: continue       # must dominate its month AND inflate it
    if len(v) > 60: v = v[:57].rstrip() + "\u2026"
    cogs_big.append(dict(code=c, account=acct, month=i, vendor=v, amount=round(net, 2),
                         share=round(share, 3), lift=round(lift, 2),
                         month_total=round(month_tot, 2), typical=round(med, 2)))
cogs_big.sort(key=lambda r: -(r["amount"] * r["share"]))

merged = collections.defaultdict(lambda: {"months":[0.0]*12, "accounts":collections.Counter(), "last":"", "mj": 0.0, "depts": collections.Counter(),
                                          "by_acct": collections.defaultdict(lambda: [0.0]*12)})
for v, months in opex_vm.items():
    cv = canon(v); m = merged[cv]
    for i in range(12): m["months"][i] += months[i]
    m["mj"] += mj_by_vendor.get(v, 0.0)
    m["depts"].update(xdept_at.get(v, {}))
    m["accounts"][opex_va[v].most_common(1)[0][0]] += abs(sum(months))
    if opex_last.get(v, "") > m["last"]: m["last"] = opex_last[v]
    # every account the vendor was booked to, by month — the dashboard shows "booked to" per
    # vendor against the account it SHOULD go to, and budgets one-off spend per account
    for acct, mo in opex_vam[v].items():
        for i in range(12): m["by_acct"][acct][i] += mo[i]

# xero dept per canonical vendor: reuse v1 (parsed from GL Detail's Departments column); the
# newer export tags departments on every line, which fills in vendors the GL parse never saw
GLD2BD = {"Facilities":"Facillities","Administration":"03 - HR & Business Administration Manager",
 "Fulfillment / Warehouse":"Purchasing & Fulfillment","Support":"Technical Support",
 "Installation Services - National":"Installation Services","Installation Services - Asheville":"Installation Services",
 "Installation Services - Triad":"Installation Services"}
v1 = json.load(open(A["v1"]))
xdept_map = {r["vendor"]: r["xero_dept"] for r in v1["vend_master"]}

def classify(months):
    act = [i for i in range(12) if abs(months[i]) > 0.005]
    if not act: return ("INACTIVE", 0.0)
    first, last, n = act[0], act[-1], len(act)
    tot = sum(months); per_mo = tot / 12.0
    last3 = statistics.mean(months[9:12]); prior3 = statistics.mean(months[6:9])
    gaps = [b - a for a, b in zip(act, act[1:])]
    if n <= 2 and (last - first) < 4 and first < 9: status = "ONE-TIME"
    elif 2 <= n <= 5 and gaps and max(gaps) >= 2 and (last - first) >= 6: status = "PERIODIC"
    elif first >= 9: status = "NEW"
    elif last <= 9: status = "DROPPED"
    elif prior3 > 100 and last3 < 0.6 * prior3: status = "DROPPING"
    elif prior3 > 100 and last3 > 1.4 * prior3: status = "GROWING"
    else: status = "STEADY"
    if status == "DROPPED": base = 0.0
    elif status in ("ONE-TIME","PERIODIC"): base = per_mo
    elif status == "NEW": base = statistics.mean(months[first:12])
    else: base = last3
    return (status, round(base, 2))

vend_master = []
for cv, m in sorted(merged.items(), key=lambda kv: -abs(sum(kv[1]["months"]))):
    tot = sum(m["months"]); t26 = sum(m["months"][5:12])
    if abs(tot) < 150: continue
    status, base = classify(m["months"])
    xdept = xdept_map.get(cv, "")
    if not xdept and m["depts"]:
        top = m["depts"].most_common(1)[0][0]
        xdept = GLD2BD.get(top, top)
    fixed = {k: round(v, 2) for k, v in fixed_alloc.get(cv, {}).items()}
    seats = round(seat_alloc.get(cv, 0.0), 2)
    bdept = max(fixed, key=fixed.get) if fixed else ""
    final = bdept or contracts.get(cv, {}).get("unalloc_dept", "") or xdept or "Unassigned"
    vend_master.append(dict(vendor=cv, ttm=[round(x, 2) for x in m["months"]], ttm_total=round(tot, 2),
        y26=[round(x, 2) for x in m["months"][Y26_FROM:12]],
        account=m["accounts"].most_common(1)[0][0], xero_dept=xdept, budget_dept=bdept,
        status=status, base=base, in_contracts=cv in contracts,
        budget_monthly=contracts.get(cv, {}).get("monthly", 0.0),
        purpose=contracts.get(cv, {}).get("purpose", ""),
        fixed_alloc=fixed, seat_monthly=seats, final_dept=final,
        last_billed=m["last"], cadence=contracts.get(cv, {}).get("cadence", ""), per_bill=contracts.get(cv, {}).get("per_bill", 0.0),
        accounts={a: [round(x, 2) for x in mo] for a, mo in m["by_acct"].items() if abs(sum(mo)) > 1},
        mj=round(m["mj"], 2),
        contradiction=bool(bdept) and bool(xdept) and bdept != xdept))

xnames = {r["vendor"] for r in vend_master}
missing = []
for c, info in contracts.items():
    if c in xnames: continue
    fixed = {k: round(v, 2) for k, v in fixed_alloc.get(c, {}).items()}
    seats = round(seat_alloc.get(c, 0.0), 2)
    if not fixed and seats > 0: continue
    bdept = max(fixed, key=fixed.get) if fixed else (info["unalloc_dept"] or "Unassigned")
    missing.append(dict(vendor=c, budget_monthly=info["monthly"], fixed_alloc=fixed, seat_monthly=seats,
        final_dept=bdept, purpose=info["purpose"]))

# actual payroll by department (GL Detail carries the Departments tracking on payroll postings)
glwb = openpyxl.load_workbook(A["gl"], read_only=True, data_only=True)
glws = glwb.worksheets[0]
GLSKIP = ("Total","Opening","Closing","Net movement","No transactions","Date","General Ledger","For the period")
GLD2BD = {"Facilities":"Facillities","Administration":"03 - HR & Business Administration Manager",
 "Fulfillment / Warehouse":"Purchasing & Fulfillment","Support":"Technical Support",
 "Installation Services - National":"Installation Services","Installation Services - Asheville":"Installation Services",
 "Installation Services - Triad":"Installation Services"}
dept_payroll = collections.defaultdict(lambda: [0.0]*ACTUAL_MONTHS)
sec = None
for row in glws.iter_rows(values_only=True):
    a = row[0]
    rest = [v for v in row[1:] if v not in (None, "")]
    if isinstance(a, str) and not rest and not a.startswith(GLSKIP) and "period" not in a:
        sec = a.strip(); continue
    if isinstance(a, datetime) and a.year == 2026 and a.month <= ACTUAL_MONTHS:
        c = code(sec)
        if c not in PAYROLL_PL: continue
        _, source, desc, ref, debit, credit, runbal, dept, proj, relacct = row[:10]
        d = GLD2BD.get((dept or "").strip(), (dept or "").strip()) or "Unassigned"
        dept_payroll[d][a.month - 1] += float(debit or 0) - float(credit or 0)
glwb.close()
# The GL Detail export predates AT#14, so its month totals carry the same mid-cycle
# payroll-accrual understatement. Keep its DEPARTMENT MIX (the only source of dept tags on
# payroll) but scale each month to the authoritative AT#14 total, so the department rollup
# ties to the P&L payroll row. The deltas are company-wide accrual/reversal lumps, so a
# proportional spread is the right allocation.
pay26 = totals_ttm["payroll"][Y26_FROM:12]
pay_scale = []
for i in range(ACTUAL_MONTHS):
    gl_tot = sum(v[i] for v in dept_payroll.values())
    s = (pay26[i] / gl_tot) if abs(gl_tot) > 1 else 1.0
    pay_scale.append(round(s, 4))
    if abs(gl_tot) > 1:
        for v in dept_payroll.values(): v[i] *= s
dept_payroll = {k: [round(x, 2) for x in v] for k, v in dept_payroll.items()}

# dept x month actuals for Jan-Jul 2026 (modeling year), residual -> Unassigned
dept_actual = collections.defaultdict(lambda: [0.0]*ACTUAL_MONTHS)
for r in vend_master:
    for i in range(ACTUAL_MONTHS): dept_actual[r["final_dept"]][i] += r["y26"][i]
opex26 = totals_ttm["opex"][Y26_FROM:12]
for i in range(ACTUAL_MONTHS):
    dept_actual["Unassigned"][i] += opex26[i] - sum(v[i] for v in dept_actual.values())
dept_actual = {k: [round(x, 2) for x in v] for k, v in dept_actual.items()}

model = dict(
    ttm_labels=TTM_LABELS,
    vend_master=vend_master, missing=missing, dept_actual=dept_actual, licenses=licenses,
    # the same vendor-name normalisation the dashboard's own import applies, so a browser-side
    # export lands on the same canonical names this builder produced
    vendor_aliases=dict(exact=EXACT, prefix=[list(x) for x in PREFIX], contracts=sorted(contracts.keys()),
                        splits=[list(x) for x in SPLITS], contains=[list(x) for x in CONTAINS], opex_overrides=[list(x) for x in OPEX_OVERRIDES]),
    account_buckets=dict(payroll=sorted(PAYROLL_PL), cogs=sorted(COGS), other_income=sorted(OTHER_INC), varcomp_re=VARCOMP_RE.pattern),
    # every operating-expense account with postings in the window, by month — the account picker
    # on Expenses, and the history behind a department's budget for an account (one-off spend)
    accounts=[dict(name=a, ttm=[round(x, 2) for x in mo]) for a, mo in sorted(acct_ttm.items(), key=lambda kv: code(kv[0]))],
    totals=dict(
        revenue=[round(x,2) for x in totals_ttm["revenue"][Y26_FROM:12]],
        other_income=[round(x,2) for x in totals_ttm["rebate"][Y26_FROM:12]],
        cogs=[round(x,2) for x in totals_ttm["cogs"][Y26_FROM:12]],
        payroll=[round(x,2) for x in totals_ttm["payroll"][Y26_FROM:12]],
        opex=[round(x,2) for x in opex26],
        ttm_opex=[round(x,2) for x in totals_ttm["opex"]],
        ttm_cogs=[round(x,2) for x in totals_ttm["cogs"]],
        ttm_payroll=[round(x,2) for x in totals_ttm["payroll"]],
        varcomp=[round(x,2) for x in totals_ttm["varcomp"][Y26_FROM:12]],
        wages=[round(x,2) for x in totals_ttm["wages"][Y26_FROM:12]],
        accrual_drift=[round(totals_ttm["accrual_acc"][i] + totals_ttm["accrual_rev"][i], 2)
                       for i in range(Y26_FROM, 12)]),
    staff=v1["staff"], sales=v1["sales"], ramps=v1["ramps"],
    employer_tax_rate=round(sum(totals_ttm["ptax"]) / sum(totals_ttm["wages"]), 4),
    cogs_accounts={k: [round(x, 2) for x in v] for k, v in cogs_accounts.items() if abs(sum(v)) > 500},
    cogs_vendors={c: {v: [round(x, 2) for x in mo] for v, mo in vs.items() if abs(sum(mo)) > 250}
                  for c, vs in cogs_vendors.items()},
    cogs_big=cogs_big[:40],
    provisional_cogs_months=[7, 8],   # 5258 reads $0 for BOTH Jul and Aug — entries still pending
    # Daily payroll accruals stop on Aug 14: August carries 10 accrual days (Aug 3-14) against
    # July's 23, with no postings for the 11 business days from Aug 17. The month's cash pay is
    # all there ($359K, three pay runs) but the back half is not accrued, so August payroll runs
    # light — $10.6K per business day against $12.1K in July.
    payroll_partial_months=[8],
    dept_payroll_actual=dept_payroll,
    # August is now CLOSED and included: AT#15 shows it fully posted (payroll $296K, opex $197K,
    # revenue $1.07M, all in line with prior months). Only its COGS entry is still outstanding.
    built="2026-09-09", actual_months=ACTUAL_MONTHS)
json.dump(model, open(os.path.join(HERE, "model_data_v2.json"), "w"))
print("vendors:", len(vend_master), "missing:", len(missing))
print("statuses:", dict(collections.Counter(r["status"] for r in vend_master)))
print("conflicts:", sum(1 for r in vend_master if r["contradiction"]))
print("jan-aug opex ties:", [round(sum(v[i] for v in dept_actual.values()) - opex26[i], 2) for i in range(ACTUAL_MONTHS)])
print("TTM opex by month:", [round(x/1000,1) for x in totals_ttm["opex"]])
print("size KB:", os.path.getsize(os.path.join(HERE, "model_data_v2.json"))//1024)
