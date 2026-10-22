#!/usr/bin/env python3
"""Build data.json for the Velocity Worksheet from Adam's sheet export + HubSpot deal map.

usage: python3 -I build_data.py <experimenting.xlsx> <deals.json|-> <out data.json>
"""
import sys, re, json, math, datetime as dt
import pandas as pd

XLSX, DEALS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
MONTH_TABS = ['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep']

# ---------- shipments ----------
frames = []
for m in MONTH_TABS:
    df = pd.read_excel(XLSX, sheet_name=m, dtype=str)
    df.columns = [str(c).strip() for c in df.columns]
    frames.append(df)
d = pd.concat(frames, ignore_index=True)
for c in ['Channel','Ref#','Order#','Sku','Description','Upc']:
    d[c] = d[c].fillna('').astype(str).str.strip()
d['Qty'] = pd.to_numeric(d['Qty'], errors='coerce')
d['price'] = pd.to_numeric(d['Sold_price'], errors='coerce').fillna(0)
d['ts'] = pd.to_datetime(d['Processed_at'], errors='coerce')
bad = d['Qty'].isna() | d['ts'].isna()
dropped_malformed = int(bad.sum())
d = d[~bad].copy()
d['month'] = d['ts'].dt.strftime('%Y-%m')
months = sorted(d['month'].unique())[-12:]
d = d[d['month'].isin(months)].copy()
MI = {m:i for i,m in enumerate(months)}

# RMA / repair exclusion
rma_mask = (d['price'] == 0) & d['Description'].str.contains(r'repair|rma', case=False, regex=True)
rma_rows, rma_units = int(rma_mask.sum()), float(d.loc[rma_mask,'Qty'].sum())
d = d[~rma_mask].copy()

# channel
def chan(c):
    c = c.lower()
    if c.startswith('magento'): return 'web'
    if 'install' in c: return 'install'
    return 'other'
d['chan'] = d['Channel'].map(chan)

# resolution key
d['root'] = d['Order#'].str.replace(r'_.*$', '', regex=True)
def key(r):
    ref, o = r['Ref#'], r['root']
    m = re.match(r'^(\d{11})-S', ref)
    if m: return m.group(1)
    if re.match(r'^\d{7,8}-\d{3,5}$', ref): return ref
    if re.match(r'^\d{10}$', o): return o
    return 'order:' + o
d['key'] = d.apply(key, axis=1)

# ---------- deals ----------
deals = {}
if DEALS != '-':
    for rec in json.load(open(DEALS)):
        deals[str(rec['key'])] = rec
def pick_company(rec):
    cs = rec.get('companies') or []
    if not cs: return None
    name = (rec.get('dealName') or '').lower()
    for c in cs:
        if c['name'] and c['name'].lower() in name: return c
    return cs[0]

customers = {}   # cid -> {name, hsCompanyId, kind}
def cust_for(k):
    rec = deals.get(k)
    if rec:
        c = pick_company(rec)
        if c:
            cid = 'co:' + str(c['id'])
            customers.setdefault(cid, {'name': c['name'], 'hs': str(c['id']), 'kind': 'company', 'deals': set()})
            customers[cid]['deals'].add(str(rec['dealId']))
            return cid
        cid = 'deal:' + str(rec['dealId'])
        customers.setdefault(cid, {'name': rec.get('dealName') or ('Deal ' + str(rec['dealId'])), 'hs': None, 'kind': 'deal', 'deals': {str(rec['dealId'])}, 'dealId': str(rec['dealId'])})
        return cid
    cid = 'order:' + k.replace('order:', '')
    customers.setdefault(cid, {'name': 'Unmatched order ' + k.replace('order:', ''), 'hs': None, 'kind': 'order', 'deals': set()})
    return cid
d['cid'] = d['key'].map(cust_for)
d['pipeline'] = d['key'].map(lambda k: (deals.get(k) or {}).get('pipeline') or '')

# ---------- product master ----------
fb = pd.read_excel(XLSX, sheet_name='Full Breakdown', header=None, dtype=str).fillna('')
master = {}
for _, r in fb.iloc[2:].iterrows():
    sku = r[0].strip()
    if not sku: continue
    def num(v):
        try: return float(str(v).replace('$','').replace(',',''))
        except: return None
    master[sku] = {'sku': sku, 'scwSku': r[3].strip(), 'name': r[2].strip(), 'model': r[4].strip(),
                   'cost': num(r[5]), 'caseQty': num(r[6]), 'status': r[7].strip() or 'LIVE',
                   'onHand': num(r[8]), 'onOrder': num(r[9]), 'supplier': r[10].strip(), 'invSource': 'Full Breakdown'}
su = pd.read_excel(XLSX, sheet_name='S.Updates', header=None, dtype=str).fillna('')
for _, r in su.iloc[2:].iterrows():
    bom = r[3].strip()
    if not bom: continue
    def num(v):
        try: return float(str(v).replace('$','').replace(',',''))
        except: return None
    rec = master.setdefault(bom, {'sku': bom, 'scwSku': r[2].strip(), 'name': r[0].strip(), 'model': '', 'cost': None,
                                   'caseQty': None, 'status': 'LIVE', 'onHand': None, 'onOrder': None, 'supplier': '', 'invSource': ''})
    rec['type'] = r[1].strip()
    if not rec['name']: rec['name'] = r[0].strip()
    if not rec['scwSku']: rec['scwSku'] = r[2].strip()
    inst, oo = num(r[6]), num(r[5])
    if inst is not None:
        rec['onHand'] = inst; rec['onOrder'] = oo if oo is not None else rec['onOrder']; rec['invSource'] = 'S.Updates'
    rec['inbound'] = {'Early Nov': num(r[10]) or 0, 'Mid Nov': num(r[11]) or 0, 'Early Dec': num(r[12]) or 0,
                      'In production': num(r[15]) or 0}
    rec['sheetVelocity'] = num(r[7])

# ---------- aggregate ----------
def zeros(): return [0.0]*len(months)
sku_rows = {}
noncatalog = re.compile(r'^(\d{1,6}|product.*)$', re.I)
for sku, g in d.groupby('Sku'):
    units = zeros(); ch = {'web': zeros(), 'install': zeros(), 'other': zeros()}
    for _, r in g.iterrows():
        i = MI[r['month']]; units[i] += r['Qty']; ch[r['chan']][i] += r['Qty']
    custs = []
    for cid, cg in g.groupby('cid'):
        cu = zeros(); orders = set(); pipes = set()
        for _, r in cg.iterrows():
            cu[MI[r['month']]] += r['Qty']; orders.add(r['root'])
            if r['pipeline']: pipes.add(r['pipeline'])
        tot = sum(cu)
        custs.append({'cid': cid, 'units': cu, 'total': tot, 'orders': len(orders), 'pipeline': sorted(pipes)[0] if pipes else ''})
    # lump: unmatched orders under 3 units and companies under 2 units -> retail
    retail = zeros(); kept = []
    for c in custs:
        kind = customers[c['cid']]['kind']
        if (kind == 'order' and c['total'] < 3) or (kind != 'order' and c['total'] < 2):
            for i in range(len(months)): retail[i] += c['units'][i]
        else: kept.append(c)
    kept.sort(key=lambda c: -c['total'])
    desc = g['Description'].mode().iat[0] if len(g) else ''
    upc = g['Upc'].mode().iat[0] if len(g) else ''
    sku_rows[sku] = {'units': units, 'channels': ch, 'customers': kept, 'retail': retail, 'desc': desc, 'upc': upc,
                     'lines': int(len(g)), 'total': float(sum(units))}

skus = []; unmapped = []
for sku, m in master.items():
    s = sku_rows.pop(sku, None)
    row = dict(m)
    row.update({'units': s['units'] if s else zeros(), 'channels': s['channels'] if s else {'web': zeros(), 'install': zeros(), 'other': zeros()},
                'customers': s['customers'] if s else [], 'retail': s['retail'] if s else zeros(),
                'total': s['total'] if s else 0.0})
    if not row['name'] and s: row['name'] = s['desc']
    if not row['scwSku'] and s: row['scwSku'] = s['upc']
    skus.append(row)
for sku, s in sku_rows.items():
    if noncatalog.match(sku): continue
    row = {'sku': sku, 'scwSku': s['upc'], 'name': s['desc'], 'model': '', 'cost': None, 'caseQty': None, 'status': 'NOT IN MASTER',
           'onHand': None, 'onOrder': None, 'supplier': '', 'invSource': '', 'units': s['units'], 'channels': s['channels'],
           'customers': s['customers'], 'retail': s['retail'], 'total': s['total']}
    skus.append(row)
noncat_units = float(sum(s['total'] for k, s in sku_rows.items() if noncatalog.match(k)))

used = set()
for row in skus:
    for c in row['customers']: used.add(c['cid'])
cust_out = {cid: {'name': v['name'], 'hs': v['hs'], 'kind': v['kind'], 'dealId': v.get('dealId'), 'deals': len(v['deals'])}
            for cid, v in customers.items() if cid in used}

resolved_rows = int((d['key'].map(lambda k: k in deals)).sum())
out = {
    'asOf': months[-1], 'months': months, 'built': dt.date.today().isoformat(),
    'source': {'rows': int(len(d)), 'droppedMalformed': dropped_malformed, 'rmaRows': rma_rows, 'rmaUnits': rma_units,
               'resolvedRows': resolved_rows, 'unresolvedRows': int(len(d)) - resolved_rows,
               'nonCatalogUnits': noncat_units, 'skusShipped': int(len(sku_rows)) + len([s for s in skus if s['total']>0])},
    'skus': skus, 'customers': cust_out,
}
def rnd(o):
    if isinstance(o, float): return int(o) if o == int(o) else round(o, 2)
    if isinstance(o, list): return [rnd(x) for x in o]
    if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
    return o
json.dump(rnd(out), open(OUT, 'w'), separators=(',', ':'))
print('skus', len(skus), 'customers', len(cust_out), 'rows', len(d), 'resolved', resolved_rows, 'months', months[0], months[-1])
