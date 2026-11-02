"""Build the MDF/IDF site-cleanup files from the Knack exports.
usage: python3 -I tools/mdf_site_cleanup.py <projects.csv> <sites.csv> <mdfidf.csv> <outdir>
Inputs are Builder exports (Records -> Export) of CORE_project, CORE_site and OPS_MDF-IDF; treat them as
untrusted data (own empty directory, python3 -I). Nothing here writes to Knack; the outputs are the import
files 01-05, the by-hand list 06 and the duplicate review 07 described in docs/locations.md.
Re-run it on fresh exports after the imports: the duplicates are then grouped by the stored sites."""
import csv, sys, re, os, difflib
from collections import Counter, defaultdict

projects_csv, sites_csv, mdf_csv, out = sys.argv[1:5]
rd = lambda p: list(csv.DictReader(open(p, newline='', encoding='utf-8-sig')))
P, S, M = rd(projects_csv), rd(sites_csv), rd(mdf_csv)

def clean(s): return re.sub(r'\s+', ' ', (s or '').replace('\xa0', ' ')).strip()
def addr_key(s): return re.sub(r'[^a-z0-9]', '', (s or '').lower())

# ── sites ──
site_by_id = {s['Record ID']: s for s in S}
site_by_nick = defaultdict(list)
for s in S: site_by_nick[clean(s['Site Nickname'])].append(s)

# ── projects ──
proj_by_name = defaultdict(list)
for p in P: proj_by_name[clean(p['INPUT_project name'])].append(p)
QNUM = re.compile(r'(\d{8}-\d+)')
proj_by_quote = defaultdict(list)
for p in P:
    for q in set(QNUM.findall(p['Quotes'] or '')): proj_by_quote[q].append(p)

def project_site(p):
    """-> (site row | None, note)"""
    nk = clean(p['Site'])
    if not nk: return None, 'project has no site'
    c = site_by_nick.get(nk, [])
    if len(c) == 1: return c[0], ''
    if not c: return None, 'project site "%s" not in the sites export' % nk
    # nickname shared: match the project's street + zip, else its company
    pa = addr_key(p['Address : Street 1']) + addr_key(p['Address : Zip'])
    hit = [s for s in c if pa and addr_key(s['Site Address : Street 1']) + addr_key(s['Site Address : Zip']) == pa]
    if len(hit) == 1: return hit[0], 'nickname shared; matched on address'
    co = clean(p['REL_company']).lower()
    hit = [s for s in c if co and co in clean(s['Client']).lower()]
    if len(hit) == 1: return hit[0], 'nickname shared; matched on client'
    return None, 'site nickname "%s" belongs to %d sites' % (nk, len(c))

POUR = 'Pour Taproom Asheville'
PLACEHOLDER = {'', 'mdf', 'defaultmdf', 'placeholdermdfnameupdateme', 'headend', 'mdfheadend', 'idf', 'tbd', 'na'}
def norm_name(s): return re.sub(r'[^a-z0-9]', '', (s or '').lower())
def num_of(v):
    try: return int(float(v))
    except: return None

rows, review = [], []
for m in M:
    r = {
        'id': m['Record ID'], 'inc': int(m['SYS_Auto Increment'] or 0),
        'display': clean(m['DISPLAY_mdf_idf_name']), 'name': clean(m['INPUT_MDF or IDF Name']),
        'type_raw': m['INPUT_label headend or IDF'].strip(),
        'old_num': num_of(m['INPUT_LABEL: MDF or IDF Number (DEPRECATE)']),
        'new_num': num_of(m['INPUT_LABEL: number']),
        'project': clean(m['REL_Installation Project']), 'quote': clean(m['REL_Quote']),
        'site_now': clean(m['CORE_site']), 'lifecycle': m['FLAG_lifecycle'].strip(),
        'location': clean(m['INPUT_Location']), 'notes': (m['INPUT_Notes'] or '').strip(),
        'photos': len([x for x in (m['REL_photos'] or '').split(',') if x.strip()]),
        'surveys': len([x for x in (m['REL_survey request'] or '').split(',') if x.strip()]),
        'equip': 1 if m['REL_Networking Equipment'].strip() else 0,
    }
    r['type'] = 'HEADEND' if r['type_raw'] in ('HEADEND', 'MDF') else 'IDF'
    r['num'] = (r['new_num'] if r['new_num'] is not None else r['old_num']) if r['type'] == 'IDF' else None
    r['nname'] = '' if norm_name(r['name']) in PLACEHOLDER else norm_name(r['name'])
    # target project
    tp, how = None, ''
    if r['project'] and r['project'] != POUR:
        c = proj_by_name.get(r['project'], [])
        tp, how = (c[0], 'project') if len(c) == 1 else (None, 'project name used by %d projects' % len(c))
    else:
        qn = QNUM.findall(r['quote'])
        c = proj_by_quote.get(qn[-1], []) if qn else []
        c = [p for p in c if clean(p['INPUT_project name']) != POUR]
        if len(c) == 1: tp, how = c[0], 'old quote ' + qn[-1]
        elif len(c) > 1: how = 'old quote %s is on %d projects' % (qn[-1], len(c))
        else: how = 'no project and no traceable quote' if not r['project'] else 'Pour Taproom; no traceable quote'
    r['proj_row'], r['proj_how'] = tp, how
    r['ptype'] = clean(tp['REL_config_project type']) if tp else ''
    r['rehome'] = bool(tp) and (r['project'] == POUR or not r['project'])
    site, note = (project_site(tp) if tp else (None, how))
    r['site_row'], r['site_note'] = site, note
    if site and r['site_now'] and clean(site['Site Nickname']) != r['site_now']:
        r['site_conflict'] = 'stored site "%s" differs from the project\'s "%s"' % (r['site_now'], clean(site['Site Nickname']))
    else:
        r['site_conflict'] = ''
    rows.append(r)

def w(name, header, data):
    with open(os.path.join(out, name), 'w', newline='', encoding='utf-8') as f:
        cw = csv.writer(f); cw.writerow(header); cw.writerows(data)
    return len(data)

counts = {}
# 1. site backfill (only where a site resolves, the closet has none, and no conflict)
counts['01_site_backfill.csv'] = w('01_site_backfill.csv',
    ['Record ID', 'MDF/IDF', 'CORE_site (Site Record ID)', 'Site Nickname (check)', 'Site ID', 'How'],
    [[r['id'], r['display'], r['site_row']['Record ID'], clean(r['site_row']['Site Nickname']), r['site_row']['Site ID'],
      (r['proj_how'] + ('; ' + r['site_note'] if r['site_note'] else ''))]
     for r in rows if r['site_row'] and not r['site_now']])
# 2. project re-home (Pour Taproom + quote-only closets)
counts['02_project_rehome.csv'] = w('02_project_rehome.csv',
    ['Record ID', 'MDF/IDF', 'REL_Installation Project (Project Record ID)', 'Project name (check)', 'Was', 'How'],
    [[r['id'], r['display'], r['proj_row']['Record ID'], clean(r['proj_row']['INPUT_project name']), r['project'] or '(no project)', r['proj_how']]
     for r in rows if r['rehome']])
# 3. IDF numbers held only in the old field
counts['03_idf_numbers.csv'] = w('03_idf_numbers.csv',
    ['Record ID', 'MDF/IDF', 'INPUT_LABEL: number'],
    [[r['id'], r['display'], r['old_num']] for r in rows if r['type'] == 'IDF' and r['new_num'] is None and r['old_num'] is not None])
# 4. type: MDF -> HEADEND, and every HEADEND (re-save clears its label once the rules are fixed)
counts['04_headend_type.csv'] = w('04_headend_type.csv',
    ['Record ID', 'MDF/IDF', 'INPUT_label headend or IDF', 'Was'],
    [[r['id'], r['display'], 'HEADEND', r['type_raw']] for r in rows if r['type'] == 'HEADEND'])
# 5. location folded into notes
def has_loc(r):
    lk = norm_name(r['location'])
    return lk and lk not in norm_name(r['notes']) and lk != norm_name(r['name'])
counts['05_location_to_notes.csv'] = w('05_location_to_notes.csv',
    ['Record ID', 'MDF/IDF', 'INPUT_Notes', 'Location being folded in'],
    [[r['id'], r['display'], (r['notes'] + ('\n' if r['notes'] else '') + 'Location: ' + r['location']), r['location']]
     for r in rows if has_loc(r)])
# by hand
conflicts = [r for r in rows if r['type'] == 'IDF' and r['new_num'] is not None and r['old_num'] is not None and r['new_num'] != r['old_num']]
headend_new_num = [r for r in rows if r['type'] == 'HEADEND' and r['new_num'] is not None]
counts['06_by_hand.csv'] = w('06_by_hand.csv',
    ['Record ID', 'MDF/IDF', 'Project', 'What to do'],
    [[r['id'], r['display'], r['project'], 'IDF numbers disagree: new field %s, old field %s — pick one' % (r['new_num'], r['old_num'])] for r in conflicts] +
    [[r['id'], r['display'], r['project'], 'HEADEND carries ## %s in INPUT_LABEL: number — clear it' % r['new_num']] for r in headend_new_num] +
    [[r['id'], r['display'], r['project'] or '(none)', 'site conflict: ' + r['site_conflict']] for r in rows if r['site_conflict']] +
    [[r['id'], r['display'], r['project'] or '(none)', 'no site: ' + (r['site_note'] or r['proj_how'])] for r in rows if not r['site_row'] and not r['site_now']])

# ── duplicates, per resolved site ──
def site_key(r):
    if r['site_row']: return r['site_row']['Record ID']
    if r['site_now']:
        c = site_by_nick.get(r['site_now'], [])
        if len(c) == 1: return c[0]['Record ID']
    return None
by_site = defaultdict(list)
for r in rows:
    k = site_key(r)
    if k: by_site[k].append(r)

def rank(r):  # survivor preference
    return (r['lifecycle'] == 'installed', r['surveys'] > 0, bool(r['nname']), r['photos'] + r['equip'], -r['inc'])

groups = []
for sk, rs in by_site.items():
    if len(rs) < 2: continue
    used = set()
    def add(members, cls, why):
        members = [m for m in members if m['id'] not in used]
        if len(members) < 2: return
        for m in members: used.add(m['id'])
        groups.append((sk, cls, why, sorted(members, key=rank, reverse=True)))
    he = [r for r in rs if r['type'] == 'HEADEND']
    idf = [r for r in rs if r['type'] == 'IDF']
    # actual: same normalized name, same type (IDF numbers equal or one blank)
    bykey = defaultdict(list)
    for r in he:
        if r['nname']: bykey[('H', r['nname'])].append(r)
    for r in idf:
        if r['nname']: bykey[('I', r['nname'])].append(r)
    for k, ms in bykey.items():
        if k[0] == 'I':
            nums = {m['num'] for m in ms if m['num'] is not None}
            if len(nums) > 1:
                continue  # same name, different numbers: possible (below)
        add(ms, 'actual', ('same name "%s"' % ms[0]['name']) + ('' if k[0] == 'H' else ', same or blank number'))
    # actual: unnamed HEADENDs
    # an access control project's unnamed default HEADEND is not assumed to be the camera headend:
    # door hubs often sit in another room. Unnamed groups merge within one system type only; the
    # possible pass below then asks about the HEADENDs left across types.
    for t in sorted({r['ptype'] for r in he}):
        add([r for r in he if not r['nname'] and r['ptype'] == t], 'actual', 'unnamed HEADENDs at one site' + (' (%s projects)' % t if t else ''))
    # actual: unnamed IDFs with the same number
    bynum = defaultdict(list)
    for r in idf:
        if not r['nname'] and r['num'] is not None: bynum[(r['num'], r['ptype'])].append(r)
    for (n, t), ms in bynum.items(): add(ms, 'actual', 'unnamed IDF %02d more than once' % n + (' (%s projects)' % t if t else ''))
    # possible: compare what is left AFTER the actual merges — each actual group's survivor plus
    # every closet in no group. A closet appears in at most one possible group.
    reps = [g[3][0] for g in groups if g[0] == sk and g[1] == 'actual'] + [r for r in rs if r['id'] not in used]
    pused = set()
    def padd(members, why):
        members = [m for m in members if m['id'] not in pused]
        if len(members) < 2: return
        for m in members: pused.add(m['id'])
        groups.append((sk, 'possible', why, sorted(members, key=rank, reverse=True)))
    he_reps = [r for r in reps if r['type'] == 'HEADEND']
    padd(he_reps, '%d HEADENDs at this site after the merges — same closet?' % len(he_reps))
    idf_reps = [r for r in reps if r['type'] == 'IDF']
    bynum = defaultdict(list)
    for r in idf_reps:
        if r['num'] is not None: bynum[r['num']].append(r)
    for n, ms in bynum.items(): padd(ms, 'IDF %02d used more than once at this site, different names — same closet, or renumber one' % n)
    left = [r for r in idf_reps if r['nname']]
    for i, a in enumerate(left):
        sim = [b for b in left[i + 1:] if difflib.SequenceMatcher(None, a['nname'], b['nname']).ratio() >= 0.85]
        if sim: padd([a] + sim, 'similar names, different numbers')

site_label = lambda sk: clean(site_by_id[sk]['Site Nickname']) if sk in site_by_id else sk
data = []
for gi, (sk, cls, why, ms) in enumerate(sorted(groups, key=lambda g: (g[1] != 'actual', site_label(g[0]).lower())), 1):
    for j, m in enumerate(ms):
        role = ('keep (suggested)' if j == 0 else 'merge into the kept one') if cls == 'possible' else ('SURVIVOR' if j == 0 else 'merge into survivor')
        data.append([gi, cls, why, site_label(sk), sk, role, m['id'], m['display'], m['type'],
                     '' if m['num'] is None else '%02d' % m['num'], m['name'], (clean(m['proj_row']['INPUT_project name']) if m['proj_row'] else m['project']),
                     m['inc'], m['ptype'], m['lifecycle'], m['surveys'], m['photos'], m['equip'], ''])
counts['07_duplicate_review.csv'] = w('07_duplicate_review.csv',
    ['Group', 'Class', 'Why', 'Site', 'Site Record ID', 'Suggested', 'Record ID', 'MDF/IDF', 'Type', '##', 'Name', 'Project',
     'Auto increment (age)', 'Project type', 'Lifecycle', 'Survey requests', 'Photos', 'Old quote equipment', 'Decision (merge / keep separate)'], data)

# ── summary ──
st = Counter()
st['closets'] = len(rows)
st['site resolved'] = sum(1 for r in rows if r['site_row'])
st['site already set'] = sum(1 for r in rows if r['site_now'])
st['no site (review)'] = sum(1 for r in rows if not r['site_row'] and not r['site_now'])
st['sites with closets'] = len(by_site)
st['actual groups'] = sum(1 for g in groups if g[1] == 'actual')
st['actual closets to merge away'] = sum(len(g[3]) - 1 for g in groups if g[1] == 'actual')
st['possible groups'] = sum(1 for g in groups if g[1] == 'possible')
st['possible closets'] = sum(len(g[3]) for g in groups if g[1] == 'possible')
print(dict(st))
print(counts)
print('no-site reasons:', Counter((r['site_note'] or r['proj_how']).split(' "')[0] for r in rows if not r['site_row'] and not r['site_now']).most_common())
print('re-home how:', Counter(r['proj_how'].split(' 2')[0] for r in rows if r['project'] == POUR or not r['project']).most_common())
print('conflicts:', sum(1 for r in rows if r['site_conflict']))
print('closets per site after merges:', Counter(min(len(v) - sum(len(g[3]) - 1 for g in groups if g[0] == k and g[1] == 'actual'), 6) for k, v in by_site.items()).most_common())
print('biggest actual groups:', sorted(((len(g[3]), site_label(g[0]), g[2]) for g in groups if g[1] == 'actual'), reverse=True)[:6])
