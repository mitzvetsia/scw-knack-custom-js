import json, sys, re
W = '/tmp/claude-0/-home-user-scw-knack-custom-js/bd55fbba-82cd-533c-a1c8-a1747e141bd9/scratchpad/work/'
keys = json.load(open(W + 'keys.json'))
desc_keys = set(keys['desc']); dealid_keys = set(keys['dealid'])
raw = open(W + 'deals_raw.tsv', encoding='utf-8').read().split('\n')

deals = {}   # dealId -> obj
batch = None; cols = None
for line in raw:
    if not line.strip(): continue
    if line.startswith('## batch'):
        batch = line.split('## batch',1)[1].strip(); cols = None; continue
    if cols is None and '[dealname]' in line:
        hdr = line.split('\t')
        cols = {}
        for i, h in enumerate(hdr):
            m = re.search(r'\[([^\]]+)\]', h)
            name = m.group(1) if m else h
            if name == 'hs_object_id':
                name = 'company_id' if h.strip().lower().startswith('company') else 'deal_id'
            if name == 'name': name = 'company_name'
            cols[name] = i
        continue
    f = line.split('\t')
    if len(f) < len(cols):
        f += [''] * (len(cols) - len(f))
    g = lambda k: f[cols[k]].strip() if k in cols else ''
    deal_id = g('deal_id'); desc = g('description')
    pipeline = g('pipeline'); pipeline = pipeline.split(' (')[0].strip() if ' (' in pipeline else pipeline
    is_dealid_batch = batch.startswith('dealid')
    key = deal_id if is_dealid_batch else desc
    if deal_id not in deals:
        deals[deal_id] = {'key': key, 'dealId': deal_id, 'dealName': g('dealname'), 'pipeline': pipeline,
                          'closeDate': g('closedate'), 'companies': [], '_desc': desc}
    d = deals[deal_id]
    if is_dealid_batch: d['key'] = deal_id
    cid = g('company_id'); cname = g('company_name')
    if cid and cid != 'Unassigned' and cid not in [c['id'] for c in d['companies']]:
        d['companies'].append({'id': cid, 'name': cname})

out = []
for d in deals.values():
    o = {k: v for k, v in d.items() if not k.startswith('_')}
    out.append(o)
json.dump(out, open(W + 'deals.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

resolved_desc = {d['_desc'] for d in deals.values() if d['_desc'] in desc_keys}
resolved_dealid = {d['dealId'] for d in deals.values() if d['dealId'] in dealid_keys}
n0 = sum(1 for d in out if len(d['companies']) == 0)
n1 = sum(1 for d in out if len(d['companies']) == 1)
n2 = sum(1 for d in out if len(d['companies']) >= 2)
print('deals:', len(out))
print('desc keys total/resolved/unresolved:', len(desc_keys), len(resolved_desc), len(desc_keys - resolved_desc))
print('dealid keys total/resolved:', len(dealid_keys), len(resolved_dealid))
print('companies 0/1/2+:', n0, n1, n2)
# key sanity: any deal whose key is not in either set
odd = [d['key'] for d in out if d['key'] not in desc_keys and d['key'] not in dealid_keys]
print('odd keys:', len(odd), odd[:10])
