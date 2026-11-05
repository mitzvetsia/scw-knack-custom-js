#!/usr/bin/env python3
"""Generate the 06.08 "request expiration date extension" blueprint.

Every Knack / ClickUp / Slack / util / response module is CLONED from the user's own exports
(ref/picked.json, pulled from 00.00 / 06.02 / 06.03 / 06.04) so the connection ids, the
object field metadata and the module versions are the live ones. Only id, mapper, filter and
the designer label change. The webhook module is the one from the user's 06.08 export.

Contract: src/config.js MAKE_QUOTE_EXTENSION_WEBHOOK; spec: docs/quote-extension-make.md.

Inputs (NOT in the repo — they are the user's Make exports, which carry connection ids; put them
next to this script in a scratch copy):
  in/0608.json       the 06.08 scenario export (webhook module only, hook 2866644)
  ref/picked.json    {'<scenario>#<module id>': <module json>} — the template modules below, picked
                     out of the 00.00 / 06.02 / 06.03 / 06.04 exports (flow + every router route):
                       06.04: 2 (WebhookRespond) 9 18 23 (SearchForRecords, proposals) 24 26 27 33
                              84 85 88 91 94 111 112 113 114 (SetVariable2) 115 116 119 (slack:CreateMessage) 121
                       00.00: 7 9 347 440 445 446 447 448   (ClickUp get task / comment / status, Knack gets)
                       06.03: 61                             06.02: 42 135 138 (slack:SearchUser + Resume) 140 151 152
Output: out/<scenario name>.blueprint.json — import INTO the 06.08 scenario so the hook stays.
Delivered 2026-11-05 (76 modules + 7 error-handler directives).
"""
import copy, json, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
T = json.load(open(os.path.join(HERE, 'ref/picked.json')))
HOOK_BP = json.load(open(os.path.join(HERE, 'in/0608.json')))

# ── constants ────────────────────────────────────────────────────────────
CH = 'C01FU6A2W4S'                     # project Slack channel (06.04 uses it)
SCW_LIST, SVS_LIST = '48524051', '901400816107'
ST_WAIT, ST_PREP, ST_FINAL = 'waiting on bid', 'prepare bid', 'final bid submitted'
def bidname(n):   # "<bid id> | <friendly name>", the separator only when the name is set
    return '{{%d.field_2414_raw}}{{if(%d.field_2636_raw; " | " + %d.field_2636_raw; "")}}' % (n, n, n)
PORTAL = 'https://scwinstallation.knack.com/installationservices#subcontractor-portal/site-survey-request-details/'

_id = [1]
def nid():
    _id[0] += 1
    return _id[0]

def clone(key, mapper, name='', x=0, y=0, filt=None, keep_mapper=False):
    m = copy.deepcopy(T[key])
    m['id'] = nid()
    if keep_mapper:
        base = m.get('mapper') or {}
        base.update(mapper)
        m['mapper'] = base
    else:
        m['mapper'] = mapper
    m.setdefault('metadata', {})
    m['metadata']['designer'] = {'x': x, 'y': y, 'name': name}
    if filt is not None:
        m['filter'] = filt
    elif 'filter' in m:
        del m['filter']
    m.pop('onerror', None)
    return m

def router(x, y, routes):
    return {'id': nid(), 'module': 'builtin:BasicRouter', 'version': 1, 'mapper': None,
            'metadata': {'designer': {'x': x, 'y': y}}, 'routes': [{'flow': r} for r in routes]}

def F(name, *conds):
    return {'name': name, 'conditions': [list(conds)]}
def eq(a, b): return {'a': a, 'b': b, 'o': 'text:equal:ci'}
def neq(a, b): return {'a': a, 'b': b, 'o': 'text:notequal:ci'}
def exist(a): return {'a': a, 'o': 'exist'}
def notexist(a): return {'a': a, 'o': 'notexist'}

# ── Knack module builders (mapper shapes copied from the exports) ────────
SOW_DT = {k: 'simple' for k in ['field_2120_datetype', 'field_2135_datetype', 'field_2136_datetype',
                                 'field_2138_datetype', 'field_2139_datetype', 'field_2293_datetype',
                                 'field_2295_datetype', 'field_3315_datetype']}
BID_DT = {'field_2635_datetype': 'simple', 'field_3317_datetype': 'simple'}
PROP_DT = {'field_2659_datetype': 'simple', 'field_2660_datetype': 'simple'}

def get_sow(rec, name, x, y, filt=None):
    return clone('00.00#7', {'object_id': 'object_106', 'record_id': rec, 'field_2132': True, 'field_2140': True, 'metadataExists': True}, name, x, y, filt)
def get_project(rec, name, x, y):
    return clone('00.00#9', {'field_45': True, 'field_208': True, 'field_323': True, 'field_324': True, 'field_888': True,
                             'object_id': 'object_3', 'record_id': rec, 'field_1753': True, 'field_1756': True, 'field_2159': True, 'metadataExists': True}, name, x, y)
def get_bid(rec, name, x, y, filt=None):
    return clone('06.03#61', {'object_id': 'object_115', 'record_id': rec, 'field_2550': True, 'metadataExists': True}, name, x, y, filt)
def upd_sow(rec, fields, name, x, y, filt=None):
    mp = {'object_id': 'object_106', 'record_id': rec}; mp.update(fields); mp.update(SOW_DT)
    return clone('00.00#347', mp, name, x, y, filt)
def upd_bid(rec, fields, name, x, y, filt=None):
    mp = {'object_id': 'object_115', 'record_id': rec}; mp.update(fields); mp.update(BID_DT)
    return clone('06.04#121', mp, name, x, y, filt)
def upd_proposal(rec, fields, name, x, y, filt=None):
    mp = {'object_id': 'object_125', 'record_id': rec}; mp.update(fields); mp.update(PROP_DT)
    return clone('06.04#24', mp, name, x, y, filt)
def search_items_on_bid(bid, name, x, y):
    return clone('06.04#88', {'limit': '1000', 'match': 'and',
                              'filters': [[{'a': 'field_2415', 'b': bid, 'o': 'text:contains'}]],
                              'object_id': 'object_114', 'metadataExists': True}, name, x, y)
def unlock_item(rec, name, x, y):
    # a survey line item (object_114) — clone the 00.00 object_114 update shape
    return clone('00.00#347', {'object_id': 'object_114', 'record_id': rec, 'field_2551': False}, name, x, y)

# ── ClickUp / Slack / util / response builders ───────────────────────────
def cu_get_task(task, name, x, y):
    return clone('06.04#112', {'task_id': task, 'map_or_select': 'map'}, name, x, y)
def cu_status(task, status, name, x, y, filt=None):
    return clone('06.04#115', {'status': status, 'task_id': task, 'archived': False, 'assignees': {},
                               'notify_all': False, 'due_date_time': False, 'start_date_time': False}, name, x, y, filt)
def cu_comment(task, text, name, x, y, notify=False, filt=None):
    return clone('06.04#116', {'task_id': task, 'notify_all': notify, 'comment_text': text, 'map_or_select': 'map'}, name, x, y, filt)
def slack_user(email, name, x, y, filt=None):
    # keep the source's Resume handler: an unknown / blank AE email falls back to the org's sales Slack id
    # instead of killing the run before a single Knack write
    m = clone('06.02#138', {'email': email}, name, x, y, filt)
    oe = copy.deepcopy(T['06.02#138']['onerror'])
    for d in oe:
        d['id'] = nid()
        d.setdefault('metadata', {})['designer'] = {'x': x, 'y': y + 150}
    m['onerror'] = oe
    return m
def ignore_errors(m, x, y):
    m['onerror'] = [{'id': nid(), 'module': 'builtin:Ignore', 'version': 1, 'metadata': {'designer': {'x': x, 'y': y + 150}}}]
    return m
def slack_msg(text, thread, name, x, y, filt=None):
    # a Slack hiccup (bad thread ts, channel) must never block the Knack writes or the webhook response
    return ignore_errors(clone('06.04#119', {'text': text, 'parse': False, 'mrkdwn': True, 'channel': CH, 'username': 'SCW Autobots',
                               'thread_ts': thread, 'icon_emoji': ':autobots:', 'channelWType': 'manualy'}, name, x, y, filt), x, y)
def set_var(name_, value, label, x, y, filt=None):
    return clone('06.04#114', {'name': name_, 'scope': 'roundtrip', 'value': value}, label, x, y, filt)
def respond(body_obj, name, x, y, filt=None):
    return clone('06.04#2', {'body': json.dumps(body_obj), 'status': '200', 'headers': []}, name, x, y, filt)

# ── the flow ─────────────────────────────────────────────────────────────
hook = copy.deepcopy(HOOK_BP['flow'][0]); hook['id'] = 1
hook['metadata']['designer'] = {'x': 0, 'y': 0, 'name': 'expiration date extension request'}

sow  = get_sow('{{1.sowId}}', 'get SOW', 300, 0)                                   # 2
proj = get_project('{{%d.field_2119_raw[].id}}' % sow['id'], 'get Project', 600, 0)  # 3
scw  = cu_get_task('{{%d.field_1199_raw}}' % proj['id'], 'get SCW task', 900, 0)     # 4
S, P, C = sow['id'], proj['id'], scw['id']
ts = set_var('Slack Thread TS',
             '{{if(contains(get(split(%d.custom_fields.`Slack Thread`; "/p"); 2); "."); get(split(%d.custom_fields.`Slack Thread`; "/p"); 2); substring(get(split(%d.custom_fields.`Slack Thread`; "/p"); 2); 0; 10))}}.{{substring(get(split(%d.custom_fields.`Slack Thread`; "/p"); 2); 10; 18)}}' % (C, C, C, C),
             'Set Slack Thread TS Variable', 1200, 0)                                 # 5
owner = slack_user('{{%d.field_1087_raw}}' % P, 'get Deal Owner', 1500, 0)             # 6
TS, OWN = ts['id'], owner['id']

SUB_TASK = '{{%d.custom_fields.`Subcontractor Task ID`}}' % C   # the sub's OWN task on the SVS list (a separate task the deal task points at — never a ClickUp subtask)
SCW_TASK = '{{%d.field_1199_raw}}' % P
THREAD = '{{%d.`Slack Thread TS`}}' % TS
SCW_STATUS = '{{lower(%d.status.status)}}' % C
BASIS = '{{%d.field_2942_raw[].id}}' % S
HEAD = 'Project {{%d.field_1622_raw}} · {{%d.field_4_raw}} · SOW {{%d.field_2126_raw}}' % (P, P, S)
at_final = eq(SCW_STATUS, ST_FINAL)

# ── route 1: request-extension ───────────────────────────────────────────
X = 1800
r_req = []
bid_r = get_bid(BASIS, 'get basis bid', X + 300, -600, F('basis bid on the SOW', exist(BASIS)))
B = bid_r['id']
sub_link = PORTAL + '{{%d.field_2386_raw[].id}}/edit-bid-package/{{%d.id}}/' % (B, B)
within = set_var('withinBid',
                 '{{if(ifempty(%d.field_2635_raw.date; emptystring) = emptystring; false; formatDate(parseDate(1.requestedDate; "M/D/YYYY"); "X") <= formatDate(parseDate(%d.field_2635_raw.date; "M/D/YYYY"); "X"))}}' % (B, B),
                 'withinBid = requested <= bid expiration', X + 600, -600)
W = '{{%d.withinBid}}' % within['id']

# 1a — within the bid: extend at once
auto = [
    upd_proposal('{{1.proposalRecordId}}', {'field_2659': '{{1.requestedDate}}'}, 'proposal expiration = requested', X + 900, -900, F('within the bid: extend at once', eq(W, 'true'))),
    upd_sow('{{1.sowId}}', {'field_2135': '{{1.requestedDate}}'}, 'SOW expiration = requested', X + 1200, -900),
    respond({'success': True, 'routedTo': 'auto', 'message': 'Extended to the requested date (within the bid).'}, 'respond: auto', X + 1350, -900),
    cu_comment(SUB_TASK, 'Quote extended to {{1.requestedDate}} — within bid ' + bidname(B) + '\'s validity (it expires {{%d.field_2635_raw.date}}); nothing needed from you.\n\n{{1.requestText}}' % B, 'comment SVS task: extended within the bid', X + 1500, -900),
    slack_msg('Quote on *{{%d.field_2126_raw}}* extended to *{{1.requestedDate}}* (within the bid\'s validity) — requested by {{1.triggeredBy.name}}: "{{1.reason}}"\n\n<@{{%d.id}}>' % (S, OWN), THREAD, 'Slack: extended', X + 1800, -900),
]
# 1b — past the bid: ask the sub
FLAG = '{{%d.field_3316_raw}}' % B          # the bid's flag BEFORE this run's write ([bid_r] read it)
REPEAT = eq(FLAG, 'true')
FIRST = neq(FLAG, 'true')
STATUS_LINE = ('{{if(lower(%d.status.status) = "final bid submitted"; "Deal tasks moved to Waiting on Bid."; '
               '"Deal tasks not moved: SCW\'s task is in " + %d.status.status + ", not Final Bid Submitted.")}}' % (C, C))
WARN = '{{if(1.riskAcknowledged; " WARNING: requested over discontinued products on the SOW (" + join(map(1.discontinuedProducts; "name"); ", ") + ") — risk acknowledged by the requester."; "")}}'
ask = [
    upd_sow('{{1.sowId}}', {'field_3314': ['Requested'], 'field_3315': '{{1.requestedDate}}'}, 'SOW status = Requested', X + 900, -600, F('past the bid (or bid date blank): ask the sub', neq(W, 'true'))),
    upd_bid('{{%d.id}}' % B, {'field_3316': True, 'field_3317': '{{1.requestedDate}}'}, 'bid flag = Yes', X + 1200, -600),
    respond({'success': True, 'routedTo': 'svs', 'message': 'The sub has been asked to hold their bid.'}, 'respond: svs', X + 1350, -600),
    slack_msg('{{if(%s; "Repeat quote-extension request"; "Quote extension")}} to *{{1.requestedDate}}* requested on *{{%d.field_2126_raw}}* by {{1.triggeredBy.name}} ({{1.requestedBy}}): "{{1.reason}}"\n{{if(%s; "An ask was already pending on this bid — the sub was nudged."; "Past the bid\'s expiration (" + %d.field_2635_raw.date + ") — the sub has been asked to hold their bid.")}}{{if(1.riskAcknowledged; "\n:warning: requested over discontinued products — see the task comment."; "")}}\n\n<@{{%d.id}}>' % (FLAG, S, FLAG, B, OWN), THREAD, 'Slack: asked the sub', X + 1500, -600),
    router(X + 1800, -600, [
        # first ask: the full record on the SCW task (with the status outcome), a short hold request on the SVS task
        [cu_comment(SUB_TASK, '{{1.requestText}}\n\nSCW asks you to hold bid %s (currently expires {{%d.field_2635_raw.date}}) until {{1.requestedDate}}. Answer on your bid page (extend, re-price, or can\'t extend): %s\n\n%s' % (bidname(B), B, sub_link, STATUS_LINE), 'comment SVS task: the request (notify)', X + 2100, -900, notify=True, filt=F('first ask on this bid', FIRST))],
        # repeat ask while one is pending: one line each, nothing moves
        [cu_comment(SUB_TASK, 'Reminder from {{1.triggeredBy.name}} ({{1.requestedBy}}): SCW is still waiting on your answer on bid %s — hold it until {{1.requestedDate}}? Answer on your bid page: %s' % (bidname(B), sub_link), 'comment SVS task: reminder (notify)', X + 2100, -600, notify=True, filt=F('repeat ask while one is pending', REPEAT))],
        # the status moves (first ask, from Final Bid Submitted only)
        [cu_status(SCW_TASK, ST_WAIT, 'SCW task → waiting on bid', X + 2100, -300, F('task is in final bid submitted and this is the first ask', at_final, FIRST)),
         cu_status(SUB_TASK, ST_WAIT, 'SVS task → waiting on bid', X + 2400, -300)],
    ]),
]
r_req = [bid_r, within, router(X + 750, -600, [auto, ask])]

no_basis = [
    respond({'success': True, 'routedTo': 'ops', 'message': 'No basis bid on this SOW — sent to Ops.'}, 'respond: ops', X + 150, -300, F('no basis bid on the SOW', notexist(BASIS))),
    slack_msg('Quote extension to *{{1.requestedDate}}* requested on *{{%d.field_2126_raw}}* by {{1.triggeredBy.name}}: "{{1.reason}}" — *no basis bid on this SOW*, Ops extends by hand.\n\n<@{{%d.id}}>' % (S, OWN), THREAD, 'Slack: no basis bid', X + 600, -300),
]
route_request = [router(X, -450, [r_req, no_basis])]
route_request[0]['filter'] = None
# the route filter sits on the first module of the route: wrap with a passthrough variable
gate_req = set_var('stepId', '{{1.stepId}}', 'request-extension', X - 300, -450, F('request-extension', eq('{{1.stepId}}', 'request-extension')))
route_request = [gate_req] + route_request
del route_request[1]['filter']

# ── route 2: confirm-extension ───────────────────────────────────────────
Y2 = 300
gate_cfm = set_var('stepId', '{{1.stepId}}', 'confirm-extension', X - 300, Y2, F('confirm-extension', eq('{{1.stepId}}', 'confirm-extension')))
bid_c = get_bid('{{1.bidPackageId}}', 'get bid', X, Y2)
B2 = bid_c['id']
quote = set_var('quoteDate',
                '{{if(ifempty(%d.field_3315_raw.date; emptystring) = emptystring; 1.bidExpiration; if(formatDate(parseDate(1.bidExpiration; "M/D/YYYY"); "X") < formatDate(parseDate(%d.field_3315_raw.date; "M/D/YYYY"); "X"); 1.bidExpiration; %d.field_3315_raw.date))}}' % (S, S, S),
                'quoteDate = earlier of requested and bid date', X + 300, Y2)
Q = '{{%d.quoteDate}}' % quote['id']
extend = [
    upd_bid('{{1.bidPackageId}}', {'field_2635': '{{1.bidExpiration}}', 'field_3316': False}, 'bid: expiration = sub\'s date, flag = No', X + 600, Y2 - 300, F('extend', eq('{{1.outcome}}', 'extend'))),
    upd_sow('{{1.sowId}}', {'field_2135': Q, 'field_3314': '{{emptyarray}}'}, 'SOW: expiration = quoteDate, status = blank', X + 900, Y2 - 300),
    respond({'success': True, 'message': 'Bid and quote extended.'}, 'respond', X + 1050, Y2 - 300),
    cu_comment(SUB_TASK, 'Bid %s extended to {{1.bidExpiration}} by {{1.triggeredBy.name}}. The quote now runs to %s.{{if(1.note; "\nNote: " + 1.note; "")}}' % (bidname(B2), Q), 'comment SVS task: extended', X + 1200, Y2 - 300),
    slack_msg('Sub extended their bid on *{{%d.field_2126_raw}}* to *{{1.bidExpiration}}* — quote extended to *%s*.{{if(1.note; "\nNote: " + 1.note; "")}}\n\n<@{{%d.id}}>' % (S, Q, OWN), THREAD, 'Slack: extended', X + 1800, Y2 - 300),
]
extend_props = [clone('06.04#23', {'limit': '100', 'match': 'and', 'filters': [[{'a': 'field_2666', 'b': '{{1.sowId}}', 'o': 'text:contains'}, {'a': 'field_2658', 'b': 'Published', 'o': 'text:contains'}]],
                       'object_id': 'object_125', 'field_2658': True, 'metadataExists': True}, 'search published proposals of the SOW', X + 2400, Y2 - 150)]
extend_props.append(upd_proposal('{{%d.id}}' % extend_props[-1]['id'], {'field_2659': Q}, 'proposal expiration = quoteDate', X + 2700, Y2 - 150))
extend.append(router(X + 2100, Y2 - 300, [
    [cu_status(SCW_TASK, ST_FINAL, 'SCW task → final bid submitted', X + 2400, Y2 - 450, F('task was parked in waiting on bid', eq(SCW_STATUS, ST_WAIT))),
     cu_status(SUB_TASK, ST_FINAL, 'SVS task → final bid submitted', X + 2700, Y2 - 450)],
    extend_props,
]))
# EVERY ClickUp comment goes on the SVS task ONLY (2026-11-05: "the automations copy any comment from the Sub bid
# task to the SCW task — only drop the messages on the sub bid task"); the mirror carries it to the deal task.
# The re-price sequence is used twice: the sub's answer when the quote has ALREADY expired, and Ops's
# "Reopen bid for re-pricing" on a held request. Make has no subroutines, so the generator writes it out.
def do_reprice(bid_id, BR, x, y, head, svs_text, slack_text, respond_msg):
    status_line = ('{{if(lower(%d.status.status) = "final bid submitted"; " Deal tasks moved to Waiting on Bid."; '
                   'if(lower(%d.status.status) = "waiting on bid"; " Deal tasks stay in Waiting on Bid."; '
                   '" Deal tasks not moved: SCW\'s task is in " + %d.status.status + "."))}}' % (C, C, C))
    seq = [
        upd_bid(bid_id, {'field_2550': ['Draft'], 'field_3316': False}, 'bid: status = Draft, flag = No', x, y, head),
        upd_sow('{{1.sowId}}', {'field_3314': ['Re-Pricing']}, 'SOW status = Re-Pricing', x + 300, y),
        respond({'success': True, 'message': respond_msg}, 'respond', x + 450, y),
        cu_comment(SUB_TASK, svs_text + status_line, 'comment SVS task: reopened for re-pricing (notify)', x + 600, y, notify=True),
        slack_msg(slack_text, THREAD, 'Slack: re-pricing', x + 1200, y),
    ]
    # Re-pricing is the SUB's work → both tasks in Waiting on Bid (they are there already when the request
    # moved them; moved only from Final Bid Submitted, as the request does). A Make filter that fails stops
    # the rest of its flow line, so the status moves, the "not moved" note and the search → unlock tail
    # are parallel ROUTES of a closing router, never modules in one line.
    unlock = [search_items_on_bid(bid_id, 'search the bid\'s line items', x + 1800, y + 150)]
    unlock.append(unlock_item('{{%d.id}}' % unlock[-1]['id'], 'unlock line item (FLAG_locked = No)', x + 2100, y + 150))
    seq.append(router(x + 1500, y, [
        [cu_status(SCW_TASK, ST_WAIT, 'SCW task → waiting on bid', x + 1800, y - 150, F('task is in final bid submitted', eq(SCW_STATUS, ST_FINAL))),
         cu_status(SUB_TASK, ST_WAIT, 'SVS task → waiting on bid', x + 2100, y - 150)],
        unlock,
    ]))
    return seq

# quote expired = the SOW's expiration (field_2135, mirrored from the proposal's field_2659 by every writer)
# is before today. Blank → NOT expired (never unlock a bid on a date nobody set).
expired_var = set_var('proposalExpired',
    '{{if(ifempty(%d.field_2135_raw.date; emptystring) = emptystring; false; formatDate(addDays(parseDate(%d.field_2135_raw.date; "M/D/YYYY"); 1); "X") <= formatDate(now; "X"))}}' % (S, S),
    'proposalExpired = quote expiration < today', X + 600, Y2, F('reprice', eq('{{1.outcome}}', 'reprice')))
XP = '{{%d.proposalExpired}}' % expired_var['id']
reprice_now = do_reprice('{{1.bidPackageId}}', B2, X + 900, Y2 - 150, F('quote already expired: reopen the bid now', eq(XP, 'true')),
    'Bid %s is reopened for re-pricing — the quote it was priced into expired {{%d.field_2135_raw.date}}: back in Draft, lines unlocked. Resubmit the bid when the new pricing is in; SCW reconciles and re-publishes.{{if(1.note; "\nNote: " + 1.note; "")}}' % (bidname(B2), S),
    'Sub is *re-pricing* their bid on *{{%d.field_2126_raw}}* instead of extending — the quote had expired, so the bid is reopened (Draft; tasks stay in Waiting on Bid while the sub re-prices). Ops reconciles and re-publishes when it comes back.{{if(1.note; "\nNote: " + 1.note; "")}}\n\n<@{{%d.id}}>' % (S, OWN),
    'Bid reopened for re-pricing (the quote had expired).')
reprice_held = [
    upd_bid('{{1.bidPackageId}}', {'field_3316': False}, 'bid flag = No (answered); bid stays locked', X + 900, Y2 + 150, F('quote still runs: ask Ops first, keep the bid locked', neq(XP, 'true'))),
    upd_sow('{{1.sowId}}', {'field_3314': ['Re-Price Requested']}, 'SOW status = Re-Price Requested', X + 1200, Y2 + 150),
    respond({'success': True, 'message': 'SCW has been told you want to re-price. The quote it was priced into runs to {{%d.field_2135_raw.date}}, so the bid stays locked until SCW either reopens it for re-pricing or closes the deal first — you will get a comment on your task.' % S}, 'respond: held', X + 1350, Y2 + 150),
    cu_comment(SUB_TASK, '{{1.triggeredBy.name}} asked to re-price bid %s instead of extending it. The quote it was priced into runs to {{%d.field_2135_raw.date}}, so the bid stays locked for now: SCW decides whether to reopen it for re-pricing or keep the quote and close before then — you will get a comment here either way.{{if(1.note; "\nNote: " + 1.note; "")}}' % (bidname(B2), S), 'comment SVS task: re-price held (notify)', X + 1500, Y2 + 150, notify=True),
    slack_msg('<@{{%d.id}}> Sub wants to *re-price* their bid on *{{%d.field_2126_raw}}* instead of extending it — but the quote runs to *{{%d.field_2135_raw.date}}*, so the bid stays locked. Decide on the Reconcile Bids page: *Reopen bid for re-pricing*, or *Keep quote as is* and push the client to close before it expires.{{if(1.note; "\nNote: " + 1.note; "")}}' % (OWN, S, S), THREAD, 'Slack: re-price held for Ops', X + 2100, Y2 + 150),
]
reprice = [expired_var, router(X + 750, Y2, [reprice_now, reprice_held])]
decline = [
    upd_bid('{{1.bidPackageId}}', {'field_3316': False}, 'bid flag = No', X + 600, Y2 + 300, F('decline', eq('{{1.outcome}}', 'decline'))),
    upd_sow('{{1.sowId}}', {'field_3314': '{{emptyarray}}'}, 'SOW status = blank', X + 900, Y2 + 300),
    respond({'success': True, 'message': 'Declined — the quote keeps its expiration.'}, 'respond', X + 1050, Y2 + 300),
    cu_comment(SUB_TASK, 'Bid %s will not be extended ({{1.triggeredBy.name}}: can\'t extend). The quote keeps its current expiration.{{if(1.note; "\nNote: " + 1.note; "")}}' % bidname(B2), 'comment SVS task: declined', X + 1200, Y2 + 300),
    slack_msg('Sub *can\'t extend* their bid on *{{%d.field_2126_raw}}* — the quote keeps its current expiration.{{if(1.note; "\nNote: " + 1.note; "")}}\n\n<@{{%d.id}}>' % (S, OWN), THREAD, 'Slack: declined', X + 1800, Y2 + 300),
    cu_status(SCW_TASK, ST_FINAL, 'SCW task → final bid submitted', X + 2100, Y2 + 300, F('task was parked in waiting on bid', eq(SCW_STATUS, ST_WAIT))),
    cu_status(SUB_TASK, ST_FINAL, 'SVS task → final bid submitted', X + 2400, Y2 + 300),
]
route_confirm = [gate_cfm, bid_c, quote, router(X + 450, Y2, [extend, reprice, decline])]

# ── route 3: nudge-extension ─────────────────────────────────────────────
Y3 = 900
gate_nudge = set_var('stepId', '{{1.stepId}}', 'nudge-extension', X - 300, Y3, F('nudge-extension', eq('{{1.stepId}}', 'nudge-extension')))
bid_n = get_bid(BASIS, 'get basis bid', X, Y3)
BN = bid_n['id']
bid_n['filter'] = F('basis bid on the SOW', exist(BASIS))
route_nudge = [gate_nudge, router(X, Y3, [[bid_n,
    cu_comment(SUB_TASK, 'Reminder: SCW is waiting on your answer on bid ' + bidname(BN) + ' — hold it until {{%d.field_3317_raw.date}}? Answer on your bid page: %s{{%d.field_2386_raw[].id}}/edit-bid-package/{{%d.id}}/' % (BN, PORTAL, BN, BN), 'nudge SVS task (notify)', X + 300, Y3, notify=True),
    respond({'success': True, 'message': 'Reminder sent.'}, 'respond', X + 900, Y3)],
    [respond({'success': False, 'error': 'No basis bid on this SOW — there is no sub to nudge.'}, 'respond: no basis bid', X + 300, Y3 + 150, F('no basis bid on the SOW', notexist(BASIS)))]])]

# ── route 4: cancel-extension ────────────────────────────────────────────
Y4 = 1200
gate_cancel = set_var('stepId', '{{1.stepId}}', 'cancel-extension', X - 300, Y4, F('cancel-extension', eq('{{1.stepId}}', 'cancel-extension')))
route_cancel = [gate_cancel,
    upd_sow('{{1.sowId}}', {'field_3314': '{{emptyarray}}'}, 'SOW status = blank', X, Y4),
    respond({'success': True, 'message': 'Extension request cancelled.'}, 'respond', X + 300, Y4),
    cu_comment(SUB_TASK, 'SCW ({{1.triggeredBy.name}}) withdrew the extension request on this bid — no action needed; the quote keeps its current expiration.', 'comment SVS task: cancelled', X + 600, Y4),
    router(X + 1200, Y4, [
        [upd_bid(BASIS, {'field_3316': False}, 'bid flag = No', X + 1500, Y4 - 150, F('basis bid on the SOW', exist(BASIS)))],
        [cu_status(SCW_TASK, ST_FINAL, 'SCW task → final bid submitted', X + 1500, Y4 + 150, F('task was parked in waiting on bid', eq(SCW_STATUS, ST_WAIT))),
         cu_status(SUB_TASK, ST_FINAL, 'SVS task → final bid submitted', X + 1800, Y4 + 150)],
    ])]

# ── route 5: reopen-reprice (Ops: the held re-price goes ahead) ──────────
Y5 = 1500
gate_reopen = set_var('stepId', '{{1.stepId}}', 'reopen-reprice', X - 300, Y5, F('reopen-reprice', eq('{{1.stepId}}', 'reopen-reprice')))
bid_ro = get_bid(BASIS, 'get basis bid', X, Y5)
BR = bid_ro['id']
route_reopen = [gate_reopen, bid_ro] + do_reprice('{{%d.id}}' % BR, BR, X + 300, Y5, None,
    'SCW ({{1.triggeredBy.name}}) reopened bid %s for re-pricing: back in Draft, lines unlocked. Resubmit the bid when the new pricing is in.' % bidname(BR),
    'Ops ({{1.triggeredBy.name}}) reopened the bid on *{{%d.field_2126_raw}}* for the sub\'s re-price — Draft; tasks stay in Waiting on Bid while the sub re-prices. Ops reconciles and re-publishes when it comes back.\n\n<@{{%d.id}}>' % (S, OWN),
    'Bid reopened for re-pricing.')

# ── route 6: keep-quote (Ops: no re-price, the bid stays submitted) ──────
Y6 = 1800
gate_keep = set_var('stepId', '{{1.stepId}}', 'keep-quote', X - 300, Y6, F('keep-quote', eq('{{1.stepId}}', 'keep-quote')))
route_keep = [gate_keep,
    upd_sow('{{1.sowId}}', {'field_3314': '{{emptyarray}}'}, 'SOW status = blank', X, Y6),
    respond({'success': True, 'message': 'Quote kept as is — the sub has been told.'}, 'respond', X + 300, Y6),
    cu_comment(SUB_TASK, 'SCW ({{1.triggeredBy.name}}) is keeping the quote as it is — no re-price; your bid stays as submitted. Nothing to do.', 'comment SVS task: quote kept (notify)', X + 600, Y6, notify=True),
    slack_msg('Ops ({{1.triggeredBy.name}}) kept the quote on *{{%d.field_2126_raw}}* as is — no re-price; the bid stays submitted. Close before *{{%d.field_2135_raw.date}}*.\n\n<@{{%d.id}}>' % (S, S, OWN), THREAD, 'Slack: quote kept', X + 1200, Y6),
    router(X + 1500, Y6, [
        [upd_bid(BASIS, {'field_3316': False}, 'bid flag = No', X + 1800, Y6 - 150, F('basis bid on the SOW', exist(BASIS)))],
        [cu_status(SCW_TASK, ST_FINAL, 'SCW task → final bid submitted', X + 1800, Y6 + 150, F('task was parked in waiting on bid', eq(SCW_STATUS, ST_WAIT))),
         cu_status(SUB_TASK, ST_FINAL, 'SVS task → final bid submitted', X + 2100, Y6 + 150)],
    ])]

# ── route 7: anything else ───────────────────────────────────────────────
STEPS = ['request-extension', 'confirm-extension', 'nudge-extension', 'cancel-extension', 'reopen-reprice', 'keep-quote']
route_other = [respond({'success': False, 'error': 'Unknown stepId: {{1.stepId}}'}, 'respond: unknown stepId', X - 300, 2100,
                       F('unknown stepId', *[neq('{{1.stepId}}', st) for st in STEPS]))]

main_router = router(X - 600, 0, [route_request, route_confirm, route_nudge, route_cancel, route_reopen, route_keep, route_other])

flow = [hook, sow, proj, scw, ts, owner, main_router]

bp = {
    'name': HOOK_BP['name'],
    'flow': flow,
    'metadata': copy.deepcopy(HOOK_BP['metadata']),
}
bp['metadata']['scenario']['sequential'] = False  # Make: "Responder is not supported when scenario is configured for sequential processing"
bp['metadata']['notes'] = [{
    'moduleIds': [1], 'content': 'Contract: scw-knack-custom-js src/config.js MAKE_QUOTE_EXTENSION_WEBHOOK; spec docs/quote-extension-make.md. '
                                 'Generated 2026-11-05 from the 00.00 / 06.02 / 06.03 / 06.04 exports (bp0608/gen.py).',
    'isFilterNote': False}]

# ── sanity ───────────────────────────────────────────────────────────────
ids = []
def walk(fl):
    for m in fl:
        ids.append(m['id'])
        for r in (m.get('routes') or []): walk(r['flow'])
walk(flow)
assert len(ids) == len(set(ids)), 'duplicate module ids'
out = os.path.join(HERE, 'out', HOOK_BP['name'].replace('|', '-').replace('/', '-') + '.blueprint.json')
json.dump(bp, open(out, 'w'), indent=4, ensure_ascii=False)
print('wrote', out, '| modules:', len(ids), '| max id', max(ids))
