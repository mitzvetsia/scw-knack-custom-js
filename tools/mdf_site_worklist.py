"""MDF/IDF site worklists from fresh Knack exports (after the 2026-11 imports + the first in-app merges).
usage: python3 -I tools/mdf_site_worklist.py <projects.csv> <sites.csv> <mdfidf.csv> <outdir> [<older mdfidf.csv>]
Inputs are Builder exports (Records -> Export) of CORE_project, CORE_site and OPS_MDF-IDF; treat them as
untrusted data (own empty directory, python3 -I). Nothing here writes to Knack. Outputs:
  1_site_backfill.csv          closets with no site whose project HAS one -> import (match on Record ID)
  2_projects_without_site.csv  projects whose closets cannot get a site until the project has one
  3_closets_no_project.csv     closets on no project / on Pour Taproom Asheville (the old default) -> by hand
  4_merge_worklist.csv         per site: the groups of likely / possible duplicates, a suggested keeper first
  5_sites_to_merge.csv         the sites ranked by how many closets a merge would take away
Merged closets (FLAG_lifecycle = merged) are left out of everything. The keeper is only a suggestion
(installed -> has survey requests -> named -> most photos -> oldest); merging is done in the app
(the closet's pencil -> Merge...), one person's decision per group. docs/locations.md has the rules."""
import csv, sys, re, os, difflib
from collections import Counter, defaultdict

projects_csv, sites_csv, mdf_csv, out = sys.argv[1:5]
older_csv = sys.argv[5] if len(sys.argv) > 5 else ''
rd = lambda p: list(csv.DictReader(open(p, newline='', encoding='utf-8-sig')))
P, S, M = rd(projects_csv), rd(sites_csv), rd(mdf_csv)
OLD = {r['Record ID'] for r in rd(older_csv)} if older_csv else None

def clean(s): return re.sub(r'\s+', ' ', (s or '').replace('\xa0', ' ')).strip()
def addr_key(s): return re.sub(r'[^a-z0-9]', '', (s or '').lower())
def norm_name(s): return re.sub(r'[^a-z0-9]', '', (s or '').lower())
def num_of(v):
    try: return int(float(v))
    except Exception: return None
def count(v): return len([x for x in (v or '').split(',') if x.strip()])

POUR = 'Pour Taproom Asheville'
PLACEHOLDER = {'', 'mdf', 'defaultmdf', 'placeholdermdfnameupdateme', 'headend', 'mdfheadend', 'idf', 'tbd', 'na',
               'mainmdf', 'mainheadend', 'mainheadendrenameme'}

site_by_id = {s['Record ID']: s for s in S}
site_by_nick = defaultdict(list)
for s in S: site_by_nick[clean(s['Site Nickname'])].append(s)
proj_by_name = defaultdict(list)
for p in P: proj_by_name[clean(p['INPUT_project name'])].append(p)

def project_site(p):
    """-> (site row | None, note)"""
    nk = clean(p['Site'])
    if not nk: return None, 'project has no site'
    c = site_by_nick.get(nk, [])
    if len(c) == 1: return c[0], ''
    if not c: return None, 'project site "%s" is not in the sites export' % nk
    pa = addr_key(p.get('Address : Street 1')) + addr_key(p.get('Address : Zip'))
    hit = [s for s in c if pa and addr_key(s['Site Address : Street 1']) + addr_key(s['Site Address : Zip']) == pa]
    if len(hit) == 1: return hit[0], 'nickname shared; matched on address'
    co = clean(p.get('REL_company')).lower()
    hit = [s for s in c if co and co in clean(s['Client']).lower()]
    if len(hit) == 1: return hit[0], 'nickname shared; matched on client'
    return None, 'site nickname "%s" belongs to %d sites' % (nk, len(c))

rows, merged = [], 0
for m in M:
    lc = clean(m['FLAG_lifecycle']).lower()
    if lc == 'merged':
        merged += 1
        continue
    r = {
        'id': m['Record ID'], 'inc': int(m['SYS_Auto Increment'] or 0),
        'display': clean(m['DISPLAY_mdf_idf_name']), 'name': clean(m['INPUT_MDF or IDF Name']),
        'type_raw': clean(m['INPUT_label headend or IDF']),
        'num_new': num_of(m['INPUT_LABEL: number']), 'num_old': num_of(m['INPUT_LABEL: MDF or IDF Number (DEPRECATE)']),
        'project': clean(m['REL_Installation Project']), 'quote': clean(m['REL_Quote']),
        'site_now': clean(m['CORE_site']), 'lifecycle': lc,
        'photos': count(m['REL_photos']), 'surveys': count(m['REL_survey request']),
        'survey_ids': clean(m['REL_survey request']),
        'created_by': clean(m.get('Created By')), 'new': (OLD is not None and m['Record ID'] not in OLD),
    }
    r['type'] = 'HEADEND' if r['type_raw'] in ('HEADEND', 'MDF') else 'IDF'
    r['num'] = (r['num_new'] if r['num_new'] is not None else r['num_old']) if r['type'] == 'IDF' else None
    r['nname'] = '' if norm_name(r['name']) in PLACEHOLDER else norm_name(r['name'])
    c = proj_by_name.get(r['project'], []) if r['project'] else []
    r['proj_row'] = c[0] if len(c) == 1 else None
    r['proj_note'] = ('' if len(c) == 1 else 'no project' if not r['project'] else
                      'project name used by %d projects' % len(c) if c else 'project not in the projects export')
    # the closet's site: its stored one (a unique nickname), else through its project
    site, note = None, ''
    if r['site_now']:
        c2 = site_by_nick.get(r['site_now'], [])
        if len(c2) == 1: site = c2[0]
        elif r['proj_row']:
            ps, _ = project_site(r['proj_row'])
            if ps and clean(ps['Site Nickname']) == r['site_now']: site = ps
        if not site: note = 'stored site "%s" matches %d sites' % (r['site_now'], len(c2))
    r['site_row'], r['site_note'] = site, note
    r['psite_row'], r['psite_note'] = (project_site(r['proj_row']) if r['proj_row'] else (None, r['proj_note']))
    rows.append(r)

def w(name, header, data):
    with open(os.path.join(out, name), 'w', newline='', encoding='utf-8') as f:
        cw = csv.writer(f); cw.writerow(header); cw.writerows(data)
    return len(data)
counts = {}
nosite = [r for r in rows if not r['site_now']]
is_pour = lambda r: r['project'] == POUR

# 1. backfill: no site, the project has one
fill = [r for r in nosite if r['psite_row'] and not is_pour(r)]
counts['1_site_backfill.csv'] = w('1_site_backfill.csv',
    ['Record ID', 'MDF/IDF', 'CORE_site (Site Record ID)', 'Site Nickname (check)', 'Project', 'Created by', 'New since last export', 'How'],
    [[r['id'], r['display'], r['psite_row']['Record ID'], clean(r['psite_row']['Site Nickname']), r['project'], r['created_by'],
      'yes' if r['new'] else '', r['psite_note'] or "the project's site"]
     for r in sorted(fill, key=lambda r: (r['project'].lower(), r['inc']))])

# 2. projects that need a site first
need = defaultdict(list)
for r in nosite:
    if r['proj_row'] and not r['psite_row'] and not is_pour(r): need[r['proj_row']['Record ID']].append(r)
data = []
for pid, rs in sorted(need.items(), key=lambda kv: -len(kv[1])):
    p = rs[0]['proj_row']
    data.append([clean(p['INPUT_project name']), pid, len(rs), rs[0]['psite_note'], clean(p.get('REL_company')),
                 clean(p.get('Address')) or ' '.join(clean(p.get(k)) for k in ('Address : Street 1', 'Address : City', 'Address : State', 'Address : Zip')).strip(),
                 clean(p.get('Project Status')), clean(p.get('Hubspot Deal ID')), '; '.join(r['display'] for r in rs)[:300]])
counts['2_projects_without_site.csv'] = w('2_projects_without_site.csv',
    ['Project', 'Project Record ID', 'Closets waiting', 'Why', 'Company', 'Project address', 'Project status', 'HubSpot deal', 'Closets'], data)

# 3. no project / Pour Taproom
orphan = [r for r in nosite if not r['proj_row'] or is_pour(r)]
counts['3_closets_no_project.csv'] = w('3_closets_no_project.csv',
    ['Record ID', 'MDF/IDF', 'Project now', 'Why', 'Old quote', 'Survey requests', 'Photos', 'Auto increment (age)', 'Created by'],
    [[r['id'], r['display'], r['project'] or '(none)', 'on Pour Taproom Asheville (the old form default)' if is_pour(r) else r['proj_note'],
      r['quote'], r['survey_ids'], r['photos'], r['inc'], r['created_by']] for r in sorted(orphan, key=lambda r: (r['project'], r['inc']))])

# ── duplicates per site ──
by_site = defaultdict(list)
for r in rows:
    if r['site_row']: by_site[r['site_row']['Record ID']].append(r)
def rank(r):  # keeper preference
    return (r['lifecycle'] == 'installed', r['surveys'] > 0, bool(r['nname']), r['photos'], -r['inc'])
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
    bykey = defaultdict(list)
    for r in he:
        if r['nname']: bykey[('H', r['nname'])].append(r)
    for r in idf:
        if r['nname']: bykey[('I', r['nname'])].append(r)
    for k, ms in bykey.items():
        if k[0] == 'I' and len({m['num'] for m in ms if m['num'] is not None}) > 1: continue
        add(ms, 'likely', ('same name "%s"' % ms[0]['name']) + ('' if k[0] == 'H' else ', same or blank number'))
    add([r for r in he if not r['nname']], 'likely', 'unnamed HEADENDs at one site')
    bynum = defaultdict(list)
    for r in idf:
        if not r['nname'] and r['num'] is not None: bynum[r['num']].append(r)
    for n, ms in bynum.items(): add(ms, 'likely', 'unnamed IDF %02d more than once' % n)
    reps = [g[3][0] for g in groups if g[0] == sk and g[1] == 'likely'] + [r for r in rs if r['id'] not in used]
    pused = set()
    def padd(members, why):
        members = [m for m in members if m['id'] not in pused]
        if len(members) < 2: return
        for m in members: pused.add(m['id'])
        groups.append((sk, 'possible', why, sorted(members, key=rank, reverse=True)))
    he_reps = [r for r in reps if r['type'] == 'HEADEND']
    padd(he_reps, '%d HEADENDs at this site after the likely merges: same closet?' % len(he_reps))
    idf_reps = [r for r in reps if r['type'] == 'IDF']
    bynum = defaultdict(list)
    for r in idf_reps:
        if r['num'] is not None: bynum[r['num']].append(r)
    for n, ms in bynum.items(): padd(ms, 'IDF %02d used more than once at this site, different names: same closet, or renumber one' % n)
    left = [r for r in idf_reps if r['nname']]
    for i, a in enumerate(left):
        sim = [b for b in left[i + 1:] if difflib.SequenceMatcher(None, a['nname'], b['nname']).ratio() >= 0.85]
        if sim: padd([a] + sim, 'similar names, different numbers')

site_label = lambda sk: clean(site_by_id[sk]['Site Nickname']) if sk in site_by_id else sk
order = sorted(groups, key=lambda g: (g[1] != 'likely', site_label(g[0]).lower(), g[2]))
data = []
for gi, (sk, cls, why, ms) in enumerate(order, 1):
    for j, m in enumerate(ms):
        data.append([gi, cls, why, site_label(sk), 'suggested keeper' if j == 0 else 'merge into it', m['display'], m['type'],
                     '' if m['num'] is None else '%02d' % m['num'], m['name'], m['project'], m['lifecycle'] or '(blank)',
                     m['surveys'], m['photos'], m['inc'], m['id'], sk])
counts['4_merge_worklist.csv'] = w('4_merge_worklist.csv',
    ['Group', 'Class', 'Why', 'Site', 'Suggested', 'MDF/IDF', 'Type', '##', 'Name', 'Created on project', 'Lifecycle',
     'Survey requests', 'Photos', 'Auto increment (age)', 'Record ID', 'Site Record ID'], data)

per = defaultdict(lambda: {'likely': 0, 'possible': 0, 'away': 0, 'projects': set(), 'closets': 0})
for sk, cls, why, ms in groups:
    d = per[sk]; d[cls] += 1
    if cls == 'likely': d['away'] += len(ms) - 1
    for m in ms: d['projects'].add(m['project'])
for sk, d in per.items(): d['closets'] = len(by_site[sk])
counts['5_sites_to_merge.csv'] = w('5_sites_to_merge.csv',
    ['Site', 'Closets at the site', 'Likely groups', 'Closets a likely merge takes away', 'Possible groups', 'Projects involved', 'Site Record ID'],
    [[site_label(sk), d['closets'], d['likely'], d['away'], d['possible'], '; '.join(sorted(p for p in d['projects'] if p))[:400], sk]
     for sk, d in sorted(per.items(), key=lambda kv: (-kv[1]['away'], -kv[1]['possible'], site_label(kv[0]).lower()))])

# ── summary ──
print('closets: %d live + %d merged' % (len(rows), merged))
print('with a site: %d   without: %d' % (len(rows) - len(nosite), len(nosite)))
print('  no site -> backfill (project has a site): %d' % len(fill))
print('  no site -> project needs a site first: %d closets on %d projects' % (sum(len(v) for v in need.values()), len(need)))
print('  no site -> no project %d, Pour Taproom %d, other %d' % (
    sum(1 for r in orphan if not r['project']), sum(1 for r in orphan if is_pour(r)),
    sum(1 for r in orphan if r['project'] and not is_pour(r))))
if OLD is not None:
    nw = [r for r in rows if r['new']]
    print('new since the older export: %d (%d with no site)' % (len(nw), sum(1 for r in nw if not r['site_now'])))
    print('  no-site creators:', Counter(r['created_by'] or '(blank)' for r in nw if not r['site_now']).most_common())
print('stored site not resolvable:', sum(1 for r in rows if r['site_now'] and not r['site_row']))
print('sites with closets: %d ; with 2+: %d' % (len(by_site), sum(1 for v in by_site.values() if len(v) > 1)))
lk = [g for g in groups if g[1] == 'likely']; ps = [g for g in groups if g[1] == 'possible']
print('likely groups: %d on %d sites (%d closets would merge away) ; possible groups: %d on %d sites' % (
    len(lk), len({g[0] for g in lk}), sum(len(g[3]) - 1 for g in lk), len(ps), len({g[0] for g in ps})))
print('likely by reason:', Counter(re.sub(r'"[^"]*"', '"…"', re.sub(r'\d+', 'N', g[2])) for g in lk).most_common())
print('biggest likely groups:', sorted(((len(g[3]), site_label(g[0]), g[2]) for g in lk), reverse=True)[:6])
print(counts)
