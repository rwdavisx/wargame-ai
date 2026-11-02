"""The grand campaign's counters, set-ups, turn track and tables (data/grand43/oob.json and rules.json).

Counters: Italy '43's wherever a unit is in both games (its 2-3 day scale is the grand campaign's; where Salerno '43
splits a brigade or regiment into two counters for the landings, Italy '43's single counter stands for both), Salerno
'43's for the units only it has (16th Panzer Division, the 1st Parachute Division's battalions, the Commandos, the
beach groups, the Eighth Army's 5th British and 1st Canadian Divisions), and new counters, by analogy with the two
games' own, for the units neither game has (research/*.json, 'suggestedValues').

Set-ups: 'campaign' is 9 September 1943, from Salerno '43's cards with the German formations that its north edge
brings in placed where they stood that day (research/german.json); 'winter' is 1 November 1943, from Italy '43's
Bernhard Line cards in the west and the Eighth Army and LXXVI Panzer Corps' positions on the Trigno (research
positions nearest that date).

Turn track: a turn a day from 9 to 30 September (Salerno '43's scale: its day d is turn d), then Italy '43's own track
(turn = Italy turn + 22): 54 turns to 31 December.

Victory: one VP total for both fronts; the benchmarks follow the pace of 1943 (vp_dates.json, written by merge.py)."""
import json
import math
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from geo import ll_to_hex  # noqa: E402
import mtn  # noqa: E402

HERE = os.path.dirname(__file__)
ROOT = __file__.rsplit('/tools/', 1)[0]
IDS = json.load(open(f'{HERE}/ids.json'))
SAL = json.load(open(f'{ROOT}/data/salerno43/oob.json'))
ITA = json.load(open(f'{ROOT}/data/italy43/oob.json'))
SAL_R = json.load(open(f'{ROOT}/data/salerno43/rules.json'))
ITA_R = json.load(open(f'{ROOT}/data/italy43/rules.json'))
GER = json.load(open(f'{HERE}/research/german.json'))
EIGHTH = json.load(open(f'{HERE}/research/eighth-army.json'))
MAP = json.load(open(f'{ROOT}/data/grand43/map.json'))


def it2g(h):
    return IDS['italy43'][h]


def sa2g(h):
    return IDS['salerno43'][h]


def nbr_ids(h):
    return [f'{c:02d}{r:02d}' for c, r in mtn.nbrs(int(h[:2]), int(h[2:]))]


# ------------------------------------------------------------------ the turn track

def turn_dates():
    out = {}
    d0 = date(1943, 9, 9)
    for t in range(1, 23):
        out[t] = (d0 + timedelta(days=t - 1),) * 2
    for it, txt in ITA_R['turns']['dates'].items():
        it = int(it)
        mon, days = txt.split(' ')
        m = {'Oct': 10, 'Nov': 11, 'Dec': 12}[mon]
        a, b = [int(x) for x in days.split('-')]
        out[it + 22] = (date(1943, m, a), date(1943, m, b))
    return out


DATES = turn_dates()
LAST = max(DATES)


def gt(d):
    """The grand turn containing a date (ISO string or date)."""
    if isinstance(d, str):
        d = date.fromisoformat(d)
    for t, (a, b) in DATES.items():
        if a <= d <= b:
            return t
    return 1 if d < DATES[1][0] else LAST + 1


def label(t):
    a, b = DATES[t]
    mon = lambda x: x.strftime('%b')
    if a == b:
        return f'{mon(a)} {a.day}'
    return f'{mon(a)} {a.day}-{b.day}' if a.month == b.month else f'{mon(a)} {a.day}-{mon(b)} {b.day}'


sal_gt = lambda day: day
ita_gt = lambda t: t + 22

# ------------------------------------------------------------------ counters

UNITS = {}
SETUP = {'campaign': {}, 'winter': {}}


def add(u, campaign=None, winter=None):
    u = {k: v for k, v in u.items() if k not in ('setup', 'start', 'arrive', 'frozenUntil', 'events')}
    if u['id'] in UNITS:
        raise SystemExit(f'duplicate {u["id"]}')
    UNITS[u['id']] = u
    SETUP['campaign'][u['id']] = campaign or {}
    SETUP['winter'][u['id']] = winter or {}


def ita_unit(i):
    return next(u for u in ITA['units'] if u['id'] == i)


def sal_unit(i):
    return next(u for u in SAL['units'] if u['id'] == i)


def counter(spec, **kw):
    """A new counter from "a-d-m" and the usual fields."""
    a, d, m = [int(x) for x in spec.split('-')]
    return {'a': a, 'd': d, 'm': m, **kw}


# Salerno counter -> grand counter (Italy's id where the unit continues; None where it folds into another counter).
SAL2G = {
    'US-1Rgr': 'US-1Rgr', 'US-3Rgr': 'US-3Rgr', 'US-4Rgr': 'US-4Rgr', 'BR-128': 'BR-128-46', 'BR-5H': None, 'BR-138': 'BR-138-46',
    'BR-139': 'BR-139-46', 'BR-46Art': 'BR-46DivASU', 'BR-167': 'BR-167-56', 'BR-7OB': None, 'BR-169': 'BR-169-56', 'BR-2-5Q': None,
    'BR-201G': 'BR-201G-56', 'BR-56Art': 'BR-56DivASU', 'BR-40RTR': 'BR-40RTR', 'BR-Greys': 'BR-RSG', 'BR-KDG': 'BR-1KDG',
    'BR-XArt': 'BR-10CorpsASU', 'BR-131': 'BR-131-7A', 'BR-22': 'BR-22-7A', 'BR-5RTR': None, 'BR-11H': 'BR-11H-7A',
    'BR-7AArt': 'BR-7ADivASU', 'US-141': 'US-141-36', 'US-2-141': None, 'US-142': 'US-142-36', 'US-1-142': None, 'US-143': 'US-143-36',
    'US-36Art': 'US-36DivASU', 'US-179': 'US-179-45', 'US-157': 'US-157-45', 'US-2-157': None, 'US-180': 'US-180-45',
    'US-45Art': 'US-45DivASU', 'US-30': 'US-30-3', 'US-7': 'US-7-3', 'US-15': 'US-15-3', 'US-3Art': 'US-3DivASU', 'US-133': 'US-133-34',
    'US-100': 'US-100-34', 'US-135': 'US-135-34', 'US-168': 'US-168-34', 'US-34Art': 'US-34DivASU', 'US-504': 'US-504-82',
    'US-3-504': None, 'US-505': 'US-505-82', 'US-325': 'US-325G-82', 'US-2-509': 'US-2-509', 'US-191': 'US-191', 'US-645': 'US-645',
    'US-601': 'US-601', 'US-751': 'US-751', 'US-753': 'US-753', 'US-636': 'US-636', 'US-756': 'US-756', 'US-VIArt': 'US-VICorpsASU',
    'US-REM-A': 'US-REM-A', 'US-REM-B': 'US-REM-B', 'US-REM-C': 'US-REM-C', 'US-REM-82': 'US-REM-82', 'BR-REM-A': 'BR-REM-A',
    'BR-REM-B': 'BR-REM-B', 'BR-REM-C': 'BR-REM-C', 'BR-REM-22': 'BR-REM-22-7A',
    # German
    'GE-III1FJ': 'GE-III-1FJ', 'GE-II64': 'GE-II-64', 'GE-REM129': None, 'GE-HGAA': 'GE-HG', 'GE-III115': 'GE-III-115',
    'GE-HGIII': 'GE-HG-III', 'GE-I1HG': 'GE-II-1HG', 'GE-HGArt': 'GE-HG-ASU', 'GE-I15': 'GE-15', 'GE-III15': None, 'GE-II15': None,
    'GE-29Art': 'GE-29PG-ASU', 'GE-129': None, 'GE-215': 'GE-215', 'GE-71NW': 'GE-71NW', 'GE-14Pz': 'GE-14Pz', 'GE-71': 'GE-71',
    'GE-I71': None, 'GE-26AA': 'GE-26', 'GE-HGI': 'GE-HG-I-II', 'GE-129Pz': 'GE-129Pz', 'GE-29AA': 'GE-129', 'GE-II9': 'GE-II-9',
    'GE-I9': 'GE-I-9', 'GE-II29': 'GE-I-29', 'GE-103': 'GE-103Pz', 'GE-I67': 'GE-I-67', 'GE-26Art': 'GE-26Pz-ASU', 'GE-II67': 'GE-II-67',
    'GE-I2HG': 'GE-I-2HG',
}
# Salerno's off-map codes on the grand map.
SAL_AREA = {'N': 'G1/G2/G3', 'S': 'A1/A2/A3', 'S1': 'A1', 'S2': 'A2', 'S3': 'A3', 'E': 'A4/A5', 'E1': 'A4/A5', 'E2': 'A4/A5', 'E3': 'A4/A5',
            'E4': 'A4/A5', 'E5': 'A4/A5'}
ITA_AREA = {'N1/N2/N3': 'G1/G2/G3', 'N1': 'G1', 'N2': 'G2', 'N3': 'G3', 'N4': 'G3', 'Naples': 'Naples', 'S1': 'Naples', 'S2': 'Naples',
            'S1/S2': 'Naples'}

# German formations Salerno '43 brings in from its north edge, placed where they stood on 9 September (around Naples
# and Caserta, and along the Gulf of Gaeta), or brought in from Rome (3rd PG).
GERMAN_START = {
    'GE-HG': '2438', 'GE-II-1HG': '2438', 'GE-HG-III': '2634', 'GE-HG-ASU': '2634', 'GE-14Pz': '2634', 'GE-71NW': '2531',
    'GE-I-115': it2g('1822'), 'GE-III-115': it2g('2116'), 'GE-I-129': it2g('1815'), 'GE-II-129': it2g('2015'), 'GE-III-129': it2g('2116'),
    'GE-104': it2g('2210'), 'GE-215': it2g('2212'), 'GE-15PG-ASU': it2g('2311'), 'GE-Reggio': it2g('2018'),
}
# They are held where they stand until the day Salerno '43 brings them onto its map (its north edge is the road from
# Naples to Salerno), so they reach the beachhead when they did; the 15th Panzergrenadier's units Salerno '43 never
# brings in watch the Gulf of Gaeta until the division went to Salerno.
GERMAN_HELD = {'GE-HG': 1, 'GE-II-1HG': 2, 'GE-HG-III': 2, 'GE-HG-ASU': 2, 'GE-14Pz': 3, 'GE-71NW': 3, 'GE-III-115': 2, 'GE-I-129': 3,
               'GE-II-129': 3, 'GE-III-129': 3, 'GE-215': 3}
GERMAN_WATCH = {'GE-I-115': 6, 'GE-104': 6, 'GE-15PG-ASU': 6, 'GE-Reggio': 12}
GERMAN_ARRIVE = {  # id: (turn, where[, reduced]): Salerno '43's days
    'GE-HG-I-II': (4, 'hex:2634', True), 'GE-I-2HG': (5, 'G2'), 'GE-I-29': (6, 'G2'), 'GE-103Pz': (6, 'G2'), 'GE-103': (6, 'G2'),
    'GE-15': (2, 'A1/A2/A3'), 'GE-29PG-ASU': (2, 'A1/A2/A3'), 'GE-71': (3, 'A1/A2/A3'), 'GE-129Pz': (4, 'A1/A2/A3'), 'GE-129': (5, 'A1/A2/A3'),
    'GE-26': (3, 'A1/A2/A3'), 'GE-I-9': (5, 'A1/A2/A3'), 'GE-II-9': (5, 'A1/A2/A3'), 'GE-II-67': (6, 'A3/A4'), 'GE-26Pz-ASU': (6, 'A1/A2/A3'),
    'GE-I-67': (10, 'A1/A2/A3'),
}
# Italy '43 removals that mean a move to the Adriatic front (on the grand map already), not leaving Italy.
KEEP_ITALY_EVENTS = {'GE-HG', 'GE-103Pz', 'GE-103', 'GE-I-29', 'GE-29', 'GE-I-8', 'GE-II-8', 'GE-III-8', 'GE-3PG-ASU', 'GE-129',
                     'GE-III-6FJ', 'GE-56NW', 'GE-33'}


def italy_events(i, setup='campaign'):
    return [dict(e, turn=ita_gt(e['turn']), **({'at': ITA_AREA.get(e['at'], e['at'])} if 'at' in e else {}))
            for e in ita_unit(i).get('setup', {}).get(setup, {}).get('events', [])]


def fifth_army_events(gid):
    """The grand turn track's withdrawals, returns and removals for a Fifth Army counter that both games have."""
    ev = []
    if gid in ('US-1Rgr', 'US-3Rgr', 'US-4Rgr', 'US-2-509'):
        st = ita_unit(gid)['setup']['campaign']
        back = ita_gt(st['arrive']['turn']) if 'arrive' in st else None
        ev = [{'turn': ita_gt(1), 'kind': 'withdraw'}]
        if back:
            ev.append({'turn': back, 'kind': 'return', 'at': 'Naples'})
        ev += [e for e in italy_events(gid) if e['kind'] == 'remove']
    elif gid in ('US-141-36', 'US-142-36', 'US-143-36', 'US-36DivASU', 'US-753', 'US-636'):
        # The 36th Division went into army reserve from 20 September and came back in mid-November (Italy '43's turns).
        back = ita_gt(ita_unit(gid)['setup']['campaign']['arrive']['turn'])
        ev = [{'turn': gt('1943-09-20'), 'kind': 'withdraw'}, {'turn': back, 'kind': 'return', 'at': 'Naples'}]
    else:
        ev = [e for e in italy_events(gid) if e['kind'] == 'remove']
    return ev


def sal_setup(su):
    """A Salerno counter's 9 September set-up on the grand map."""
    out = {}
    if 'start' in su:
        st = dict(su['start'])
        if 'hex' in st:
            st['hex'] = sa2g(st['hex'])
        out['start'] = st
    if 'arrive' in su:
        a = dict(su['arrive'])
        a['turn'] = sal_gt(a['turn'])
        a['at'] = SAL_AREA.get(a['at'], a['at'])
        out['arrive'] = a
    if 'frozenUntil' in su:
        out['frozenUntil'] = sal_gt(su['frozenUntil'])
    return out


ITALY_WINTER = set()
# ---- Counters both games have, and Italy '43's own.
for iu in ITA['units']:
    gid = iu['id']
    u = dict(iu)
    if u.get('remnant') == 'CW':
        u['remnant'] = 'BR'
    sal_ids = [s for s, g in SAL2G.items() if g == gid]
    camp = {}
    if gid.startswith('GE-'):
        if gid in GERMAN_START:
            camp = {'start': {'hex': GERMAN_START[gid]}}
            if GERMAN_HELD.get(gid, 1) > 1:
                camp['frozenUntil'] = GERMAN_HELD[gid]
            if gid in GERMAN_WATCH:
                # Watching the Gulf of Gaeta until they went to Salerno (the division was at Castellammare by the 18th).
                camp['frozenUntil'] = GERMAN_WATCH[gid]
        elif gid in GERMAN_ARRIVE:
            t, at, *red = GERMAN_ARRIVE[gid]
            camp = {'arrive': {'turn': t, 'at': at, **({'reduced': True} if red else {})}}
        elif sal_ids:
            camp = sal_setup(sal_unit(sal_ids[0]))
        else:
            st = iu['setup']['campaign']
            if 'arrive' in st:
                a = dict(st['arrive'])
                a['turn'] = ita_gt(a['turn'])
                a['at'] = 'hex:' + it2g(a['at'][4:]) if a['at'].startswith('hex:') else ITA_AREA.get(a['at'], a['at'])
                camp = {'arrive': a}
                for k in ('frozen', 'garrison'):
                    if k in st:
                        camp[k] = st[k]
            elif 'start' in st and 'hex' in st['start']:
                camp = {'start': {'hex': it2g(st['start']['hex'])}}
            elif 'start' in st:
                camp = {'start': st['start']}
        if gid == 'GE-33':
            # Formia's garrison (a unit must hold the town) from the start.
            camp = {'start': {'hex': it2g('1706')}, 'garrison': True, 'events': [{'turn': ita_gt(14), 'kind': 'release'}]}
        elif gid in KEEP_ITALY_EVENTS or not sal_ids and gid not in GERMAN_START and gid not in GERMAN_ARRIVE:
            ev = [e for e in italy_events(gid) if e['kind'] in ('remove', 'release')]
            # The 305th Division's removal is its move to the Adriatic sector, on the grand map.
            if gid.startswith('GE-305') or gid in ('GE-577', 'GE-578'):
                ev = []
            if ev:
                camp['events'] = ev
    else:
        if sal_ids:
            camp = sal_setup(sal_unit(sal_ids[0]))
            # A brigade landing as two Salerno counters lands as one.
            ev = fifth_army_events(gid)
            if ev:
                camp['events'] = ev
        else:
            st = iu['setup']['campaign']
            if 'start' in st and st['start'].get('remnant'):
                camp = {'start': {'remnant': True}}
            elif 'arrive' in st:
                a = dict(st['arrive'])
                a['turn'] = ita_gt(a['turn'])
                a['at'] = ITA_AREA.get(a['at'], a['at'])
                a.pop('reduced', None)
                camp = {'arrive': a}
                ev = [e for e in italy_events(gid) if e['kind'] == 'remove']
                if ev:
                    camp['events'] = ev
            else:
                raise SystemExit(f'no grand set-up for {gid}')
    # Italy '43's 1 November set-up for the west.
    wst = json.loads(json.dumps(iu['setup'].get('bernhard', {})))
    if 'start' in wst and 'hex' in wst['start']:
        wst['start']['hex'] = it2g(wst['start']['hex'])
    if 'arrive' in wst:
        wst['arrive']['turn'] = ita_gt(wst['arrive']['turn'])
        a = wst['arrive']['at']
        wst['arrive']['at'] = 'hex:' + it2g(a[4:]) if a.startswith('hex:') else ITA_AREA.get(a, a)
    for e in wst.get('events', []):
        e['turn'] = ita_gt(e['turn'])
        if 'at' in e:
            e['at'] = ITA_AREA.get(e['at'], e['at'])
    if gid.startswith('GE-305') or gid in ('GE-577', 'GE-578'):
        wst['events'] = [e for e in wst.get('events', []) if e['kind'] != 'remove']
    if wst.get('start', {}).get('hex'):
        ITALY_WINTER.add(gid)
    add(u, camp, wst)

# ---- Salerno '43's own counters.
NO_REMNANT_8TH = {'BR-13', 'BR-15', 'BR-17', 'CN-1', 'CN-2', 'CN-3'}
EIGHTH_ARRIVE = {'BR-13': (12, 'A1/A2'), 'BR-15': (12, 'A1/A2'), 'BR-17': (11, 'A1/A2'), 'CN-1': (12, 'A4'), 'CN-2': (12, 'A4'),
                 'CN-3': (12, 'A4'), 'CN-14': (12, 'A4'), 'CN-11': (13, 'A4')}
for su in SAL['units']:
    sid = su['id']
    if sid in SAL2G:
        continue
    u = dict(su)
    if u.get('remnant') == 'CW':
        u['remnant'] = 'BR'
    camp = sal_setup(su)
    if sid in EIGHTH_ARRIVE:
        t, at = EIGHTH_ARRIVE[sid]
        camp = {'arrive': {'turn': t, 'at': at}}
        u['formation'] = {'BR': '5 Div', 'CN': u['formation']}.get(u['nation'], u['formation'])
    if sid == 'GE-826':
        # The 26th Panzer's tanks came up from Calabria with the division.
        camp = {'arrive': {'turn': 7, 'at': 'A3/A4'}}
    if sid in ('BR-2Cdo', 'BR-41Cdo'):
        camp['events'] = [{'turn': gt('1943-09-18'), 'kind': 'remove'}]
    if su['cat'] == 'bh' or sid == 'US-3-531':
        camp['events'] = [{'turn': gt('1943-10-14'), 'kind': 'remove'}]
    if su['formation'] == '16 Pz':
        camp['events'] = [{'turn': gt('1943-11-17'), 'kind': 'remove'}]
    add(u, camp, {})

# ---- New counters (research/*.json, 'suggestedValues', by analogy with the two games' counters).
# When and where each new counter comes and goes, in grand turns (a day each to 30 September: day d of the month is
# turn d - 8; from 1 October Italy '43's turn + 22). Sources: research/*.json ('enters', 'leaves', 'positions').
ARR = {
    # German: the 1st Parachute Division in Apulia and Basilicata, the reinforcements from the north
    'GE-I-1FJ': {'arrive': {'turn': 3, 'at': 'A5/A6'}}, 'GE-II-4FJ': {'arrive': {'turn': 3, 'at': 'A5/A6'}},
    'GE-II-3FJ': {'arrive': {'turn': 5, 'at': 'A4/A5'}}, 'GE-III-3FJ': {'arrive': {'turn': ita_gt(9), 'at': 'G5'}},
    'GE-1FJ-ASU': {'arrive': {'turn': 4, 'at': 'A5/A6'}}, 'GE-KGRau': {'arrive': {'turn': 10, 'at': 'A6/A7'}},
    'GE-576': {'arrive': {'turn': ita_gt(9), 'at': 'G3'}},
    'GE-145': {'arrive': {'turn': ita_gt(7), 'at': 'G5'}}, 'GE-146': {'arrive': {'turn': ita_gt(7), 'at': 'G5'}},
    'GE-65-ASU': {'arrive': {'turn': ita_gt(7), 'at': 'G5'}},
    'GE-361': {'arrive': {'turn': ita_gt(20), 'at': 'G5'}}, 'GE-200': {'arrive': {'turn': ita_gt(23), 'at': 'G5'}},
    'GE-190Pz': {'arrive': {'turn': ita_gt(23), 'at': 'G5'}}, 'GE-90-ASU': {'arrive': {'turn': ita_gt(23), 'at': 'G5'}},
    'GE-754': {'arrive': {'turn': ita_gt(28), 'at': 'G4/G5'}}, 'GE-755': {'arrive': {'turn': ita_gt(28), 'at': 'G4/G5'}},
    'GE-756': {'arrive': {'turn': ita_gt(28), 'at': 'G4/G5'}}, 'GE-334-ASU': {'arrive': {'turn': ita_gt(28), 'at': 'G4/G5'}},
    'GE-REM-F': {'start': {'remnant': True}}, 'GE-REM-G': {'start': {'remnant': True}}, 'GE-REM-H': {'start': {'remnant': True}},
    # XIII Corps up from Calabria: the 5th Division by the coast roads, the Canadians by the Basento valley to Potenza
    'BR-13CorpsASU': {'arrive': {'turn': 12, 'at': 'A4'}}, 'BR-5Recce': {'arrive': {'turn': 11, 'at': 'A1/A2'}},
    'BR-5DivASU': {'arrive': {'turn': 11, 'at': 'A1/A2'}}, 'CN-4PLDG': {'arrive': {'turn': 12, 'at': 'A4'}},
    'CN-1DivASU': {'arrive': {'turn': 13, 'at': 'A4'}}, 'CN-12': {'arrive': {'turn': ita_gt(3), 'at': 'A7'}},
    # V Corps up from Taranto and Bari
    'BR-5CorpsASU': {'arrive': {'turn': 17, 'at': 'A7'}},
    'BR-1Para': {'arrive': {'turn': 13, 'at': 'A5/A6'}, 'events': [{'turn': ita_gt(23), 'kind': 'remove'}]},
    'BR-4Para': {'arrive': {'turn': 13, 'at': 'A5/A6'}, 'events': [{'turn': ita_gt(23), 'kind': 'remove'}]},
    'BR-1AL': {'arrive': {'turn': 14, 'at': 'A5/A6'}, 'events': [{'turn': ita_gt(23), 'kind': 'remove'}]},
    'BR-2Para': {'arrive': {'turn': 14, 'at': 'A5/A6'}},
    'BR-11-78': {'arrive': {'turn': 15, 'at': 'A7'}}, 'BR-36-78': {'arrive': {'turn': 16, 'at': 'A7'}},
    'BR-38-78': {'arrive': {'turn': 17, 'at': 'A7'}}, 'BR-56Recce': {'arrive': {'turn': 15, 'at': 'A7'}},
    'BR-78DivASU': {'arrive': {'turn': 17, 'at': 'A7'}},
    'BR-3CLY': {'arrive': {'turn': 16, 'at': 'A7'}}, 'BR-44RTR': {'arrive': {'turn': 16, 'at': 'A7'}}, 'BR-50RTR': {'arrive': {'turn': 16, 'at': 'A7'}},
    'BR-3Cdo': {'arrive': {'turn': 21, 'at': 'A7'}, 'events': [{'turn': ita_gt(4), 'kind': 'remove'}]},
    'BR-40Cdo': {'arrive': {'turn': 21, 'at': 'A7'}, 'events': [{'turn': ita_gt(4), 'kind': 'remove'}]},
    'BR-1SRS': {'arrive': {'turn': 21, 'at': 'A7'}, 'events': [{'turn': ita_gt(4), 'kind': 'remove'}]},
    'IN-17': {'arrive': {'turn': ita_gt(6), 'at': 'A7'}}, 'IN-19': {'arrive': {'turn': ita_gt(6), 'at': 'A7'}},
    'IN-21': {'arrive': {'turn': ita_gt(7), 'at': 'A7'}}, 'IN-6L': {'arrive': {'turn': ita_gt(6), 'at': 'A7'}},
    'IN-8DivASU': {'arrive': {'turn': ita_gt(7), 'at': 'A7'}},
    'NZ-5': {'arrive': {'turn': ita_gt(11), 'at': 'A7'}}, 'NZ-6': {'arrive': {'turn': ita_gt(11), 'at': 'A7'}},
    'NZ-Cav': {'arrive': {'turn': ita_gt(12), 'at': 'A7'}}, 'NZ-DivASU': {'arrive': {'turn': ita_gt(12), 'at': 'A7'}},
    'NZ-18': {'arrive': {'turn': ita_gt(12), 'at': 'A7'}}, 'NZ-19': {'arrive': {'turn': ita_gt(12), 'at': 'A7'}},
    'NZ-20': {'arrive': {'turn': ita_gt(12), 'at': 'A7'}}, 'NZ-22': {'arrive': {'turn': ita_gt(12), 'at': 'A7'}},
    'BR-46RTR': {'arrive': {'turn': ita_gt(13), 'at': 'A7'}},
    'BR-REM-D': {'start': {'remnant': True}}, 'BR-REM-E': {'start': {'remnant': True}}, 'BR-REM-F': {'start': {'remnant': True}},
}
NEW = [
    # German
    dict(id='GE-I-1FJ', name='I/1 FJ', side='German', nation='GE', formation='1 FJ', cat='airborne', sp=1, back='none', elite=True,
         **counter('2-2-3'), _c=ARR['GE-I-1FJ']),
    dict(id='GE-II-4FJ', name='II/4 FJ', side='German', nation='GE', formation='1 FJ', cat='airborne', sp=1, back='none', elite=True,
         **counter('2-2-3'), _c=ARR['GE-II-4FJ']),
    dict(id='GE-II-3FJ', name='II/3 FJ', side='German', nation='GE', formation='1 FJ', cat='airborne', sp=1, back='none', elite=True,
         **counter('2-2-3'), _c=ARR['GE-II-3FJ']),
    dict(id='GE-III-3FJ', name='III/3 FJ', side='German', nation='GE', formation='1 FJ', cat='airborne', sp=1, back='none', elite=True,
         **counter('2-2-3'), _c=ARR['GE-III-3FJ']),
    dict(id='GE-1FJ-ASU', name='1 FJ Div ASU', side='German', nation='GE', formation='1 FJ', cat='divAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['GE-1FJ-ASU']),
    dict(id='GE-KGRau', name='KG Rau', side='German', nation='GE', formation='1 FJ', cat='airborne', sp=1, back='none', elite=True,
         **counter('1-1-3'), _c=ARR['GE-KGRau']),
    dict(id='GE-576', name='576/305', side='German', nation='GE', formation='305', cat='infantry', sp=3, back='1-3-3', **counter('3-5-3'),
         _c=ARR['GE-576']),
    dict(id='GE-145', name='145/65', side='German', nation='GE', formation='65', cat='infantry', sp=3, back='1-3-3', lowQuality=True,
         **counter('3-5-3'), _c=ARR['GE-145']),
    dict(id='GE-146', name='146/65', side='German', nation='GE', formation='65', cat='infantry', sp=3, back='1-3-3', lowQuality=True,
         **counter('3-5-3'), _c=ARR['GE-146']),
    dict(id='GE-65-ASU', name='65 Div', side='German', nation='GE', formation='65', cat='divAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['GE-65-ASU']),
    dict(id='GE-361', name='361/90PG', side='German', nation='GE', formation='90 PG', cat='motorized', sp=2, back='2-3-5', elite=True,
         **counter('4-6-5'), _c=ARR['GE-361']),
    dict(id='GE-200', name='200/90PG', side='German', nation='GE', formation='90 PG', cat='motorized', sp=3, back='4-6-5', remnant='GE-MOT',
         **counter('6-9-5'), _c=ARR['GE-200']),
    dict(id='GE-190Pz', name='90 PG 190', side='German', nation='GE', formation='90 PG', cat='tank', sp=1, back='none', tr=3,
         **counter('3-2-5'), _c=ARR['GE-190Pz']),
    dict(id='GE-90-ASU', name='90 PG Div', side='German', nation='GE', formation='90 PG', cat='divAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['GE-90-ASU']),
    dict(id='GE-754', name='754/334', side='German', nation='GE', formation='334', cat='infantry', sp=2, back='none', lowQuality=True,
         **counter('2-4-3'), _c=ARR['GE-754']),
    dict(id='GE-755', name='755/334', side='German', nation='GE', formation='334', cat='infantry', sp=2, back='none', lowQuality=True,
         **counter('2-4-3'), _c=ARR['GE-755']),
    dict(id='GE-756', name='756/334', side='German', nation='GE', formation='334', cat='infantry', sp=3, back='1-3-3', lowQuality=True,
         **counter('3-5-3'), _c=ARR['GE-756']),
    dict(id='GE-334-ASU', name='334 Div', side='German', nation='GE', formation='334', cat='divAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['GE-334-ASU']),
    dict(id='GE-REM-F', name='REM F', side='German', nation='GE', formation='independent', cat='infantry', sp=2, back='none', lowQuality=True,
         **counter('1-3-3'), _c=ARR['GE-REM-F']),
    dict(id='GE-REM-G', name='REM G', side='German', nation='GE', formation='independent', cat='infantry', sp=2, back='none', lowQuality=True,
         **counter('1-3-3'), _c=ARR['GE-REM-G']),
    dict(id='GE-REM-H', name='REM H (motorized)', side='German', nation='GE', formation='Independent', cat='motorized', sp=2, back='none',
         **counter('1-3-5'), _c=ARR['GE-REM-H']),
    # Eighth Army: XIII Corps (from Calabria, up the Salerno map's south and east edges)
    dict(id='BR-13CorpsASU', name='13 Corps', side='Allied', nation='BR', formation='13 Corps', cat='corpsAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['BR-13CorpsASU']),
    dict(id='BR-5Recce', name='5 Recce', side='Allied', nation='BR', formation='5 Div', cat='recon', sp=1, back='none', **counter('2-2-6'),
         _c=ARR['BR-5Recce']),
    dict(id='BR-5DivASU', name='5 Div', side='Allied', nation='BR', formation='5 Div', cat='divAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['BR-5DivASU']),
    dict(id='CN-4PLDG', name='4 PLDG', side='Allied', nation='CN', formation='1 CN Div', cat='recon', sp=1, back='none', **counter('2-2-6'),
         _c=ARR['CN-4PLDG']),
    dict(id='CN-1DivASU', name='1 Cdn Div', side='Allied', nation='CN', formation='1 CN Div', cat='divAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['CN-1DivASU']),
    dict(id='CN-12', name='12 CN Tank Rgt', side='Allied', nation='CN', formation='1 CN Armd Bde', cat='tank', sp=1, back='none', tr=3,
         **counter('3-2-5'), _c=ARR['CN-12']),
    # V Corps (from Taranto and Bari, up the Via Adriatica and the Candela road)
    dict(id='BR-5CorpsASU', name='5 Corps', side='Allied', nation='BR', formation='5 Corps', cat='corpsAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['BR-5CorpsASU']),
    dict(id='BR-1Para', name='1 Para Bde', side='Allied', nation='BR', formation='1 Abn Div', cat='airborne', sp=3, back='3-4-3', elite=True,
         remnant='BR', **counter('5-6-3'), _c=ARR['BR-1Para']),
    dict(id='BR-4Para', name='4 Para Bde (-)', side='Allied', nation='BR', formation='1 Abn Div', cat='airborne', sp=2, back='none', elite=True,
         **counter('3-4-3'), _c=ARR['BR-4Para']),
    dict(id='BR-1AL', name='1 Airlanding Bde (-)', side='Allied', nation='BR', formation='1 Abn Div', cat='glider', sp=2, back='none', elite=True,
         **counter('3-4-3'), _c=ARR['BR-1AL']),
    dict(id='BR-2Para', name='2 Para Bde', side='Allied', nation='BR', formation='Independent', cat='airborne', sp=3, back='3-4-3', elite=True,
         remnant='BR', **counter('5-6-3'), _c=ARR['BR-2Para']),
    dict(id='BR-11-78', name='11/78', side='Allied', nation='BR', formation='78 Div', cat='infantry', sp=3, back='3-5-3', remnant='BR',
         **counter('5-7-3'), _c=ARR['BR-11-78']),
    dict(id='BR-36-78', name='36/78', side='Allied', nation='BR', formation='78 Div', cat='infantry', sp=3, back='3-5-3', remnant='BR',
         **counter('5-7-3'), _c=ARR['BR-36-78']),
    dict(id='BR-38-78', name='38 (Irish)/78', side='Allied', nation='BR', formation='78 Div', cat='infantry', sp=3, back='3-5-3', remnant='BR',
         **counter('5-7-3'), _c=ARR['BR-38-78']),
    dict(id='BR-56Recce', name='56 Recce', side='Allied', nation='BR', formation='78 Div', cat='recon', sp=1, back='none', **counter('2-2-6'),
         _c=ARR['BR-56Recce']),
    dict(id='BR-78DivASU', name='78 Div', side='Allied', nation='BR', formation='78 Div', cat='divAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['BR-78DivASU']),
    dict(id='BR-3CLY', name='3 CLY', side='Allied', nation='BR', formation='4 Armd Bde', cat='tank', sp=1, back='none', tr=3, **counter('3-2-5'),
         _c=ARR['BR-3CLY']),
    dict(id='BR-44RTR', name='44 RTR', side='Allied', nation='BR', formation='4 Armd Bde', cat='tank', sp=1, back='none', tr=3, **counter('3-2-5'),
         _c=ARR['BR-44RTR']),
    dict(id='BR-50RTR', name='50 RTR', side='Allied', nation='BR', formation='4 Armd Bde', cat='tank', sp=1, back='none', tr=3, **counter('3-2-5'),
         _c=ARR['BR-50RTR']),
    dict(id='BR-3Cdo', name='3 Commando', side='Allied', nation='BR', formation='Special Service Bde', cat='ranger', sp=1, back='none', elite=True,
         **counter('2-2-3'), _c=ARR['BR-3Cdo']),
    dict(id='BR-40Cdo', name='40 RM Commando', side='Allied', nation='BR', formation='Special Service Bde', cat='ranger', sp=1, back='none',
         elite=True, **counter('2-2-3'), _c=ARR['BR-40Cdo']),
    dict(id='BR-1SRS', name='1 SRS', side='Allied', nation='BR', formation='Special Service Bde', cat='ranger', sp=1, back='none', elite=True,
         **counter('1-1-3'), _c=ARR['BR-1SRS']),
    dict(id='IN-17', name='17 Ind Bde', side='Allied', nation='BR', formation='8 Ind Div', cat='infantry', sp=3, back='3-5-3', remnant='BR',
         **counter('5-7-3'), _c=ARR['IN-17']),
    dict(id='IN-19', name='19 Ind Bde', side='Allied', nation='BR', formation='8 Ind Div', cat='infantry', sp=3, back='3-5-3', remnant='BR',
         **counter('5-7-3'), _c=ARR['IN-19']),
    dict(id='IN-21', name='21 Ind Bde', side='Allied', nation='BR', formation='8 Ind Div', cat='infantry', sp=3, back='3-5-3', remnant='BR',
         **counter('5-7-3'), _c=ARR['IN-21']),
    dict(id='IN-6L', name='6 Lancers', side='Allied', nation='BR', formation='8 Ind Div', cat='recon', sp=1, back='none', **counter('2-2-6'),
         _c=ARR['IN-6L']),
    dict(id='IN-8DivASU', name='8 Ind Div', side='Allied', nation='BR', formation='8 Ind Div', cat='divAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['IN-8DivASU']),
    dict(id='NZ-5', name='5 NZ Bde', side='Allied', nation='BR', formation='2 NZ Div', cat='infantry', sp=3, back='4-5-3', remnant='BR',
         **counter('6-7-3'), _c=ARR['NZ-5']),
    dict(id='NZ-6', name='6 NZ Bde', side='Allied', nation='BR', formation='2 NZ Div', cat='infantry', sp=3, back='4-5-3', remnant='BR',
         **counter('6-7-3'), _c=ARR['NZ-6']),
    dict(id='NZ-Cav', name='NZ Div Cav', side='Allied', nation='BR', formation='2 NZ Div', cat='recon', sp=1, back='none', **counter('2-2-6'),
         _c=ARR['NZ-Cav']),
    dict(id='NZ-DivASU', name='2 NZ Div', side='Allied', nation='BR', formation='2 NZ Div', cat='divAsu', sp=0, back='none', range=4,
         **counter('0-1-5'), _c=ARR['NZ-DivASU']),
    dict(id='NZ-18', name='18 NZ Armd', side='Allied', nation='BR', formation='4 NZ Armd Bde', cat='tank', sp=1, back='none', tr=3,
         **counter('3-2-5'), _c=ARR['NZ-18']),
    dict(id='NZ-19', name='19 NZ Armd', side='Allied', nation='BR', formation='4 NZ Armd Bde', cat='tank', sp=1, back='none', tr=3,
         **counter('3-2-5'), _c=ARR['NZ-19']),
    dict(id='NZ-20', name='20 NZ Armd', side='Allied', nation='BR', formation='4 NZ Armd Bde', cat='tank', sp=1, back='none', tr=3,
         **counter('3-2-5'), _c=ARR['NZ-20']),
    dict(id='NZ-22', name='22 NZ Motor', side='Allied', nation='BR', formation='4 NZ Armd Bde', cat='motorized', sp=1, back='none',
         **counter('2-2-5'), _c=ARR['NZ-22']),
    dict(id='BR-46RTR', name='46 RTR', side='Allied', nation='BR', formation='Independent', cat='tank', sp=1, back='none', tr=3,
         **counter('3-2-5'), _c=ARR['BR-46RTR']),
    dict(id='BR-REM-D', name='REM (British) D', side='Allied', nation='BR', formation='Independent', cat='infantry', sp=2, back='none',
         lowQuality=True, **counter('1-3-3'), _c=ARR['BR-REM-D']),
    dict(id='BR-REM-E', name='REM (British) E', side='Allied', nation='BR', formation='Independent', cat='infantry', sp=2, back='none',
         lowQuality=True, **counter('1-3-3'), _c=ARR['BR-REM-E']),
    dict(id='BR-REM-F', name='REM (British) F', side='Allied', nation='BR', formation='Independent', cat='infantry', sp=2, back='none',
         lowQuality=True, **counter('1-3-3'), _c=ARR['BR-REM-F']),
]
for n in NEW:
    c = n.pop('_c')
    add(n, c, {})

# ------------------------------------------------------------------ 1 November: the Adriatic front and the Eighth Army

RESEARCH_ID = {  # research id -> grand counters
    'GE-16-AA': ['GE-KGDor'], 'GE-I-64': ['GE-I64'], 'GE-II-64': ['GE-II-64'], 'GE-I-79': ['GE-I79'], 'GE-II-79': ['GE-II79'],
    'GE-II-2Pz': ['GE-IIa2', 'GE-IIb2'], 'GE-III-2Pz': ['GE-III2'], 'GE-16Art': ['GE-16Art'], 'GE-76Pz': ['GE-76Pz'],
    'GE-I-1FJ': ['GE-I-1FJ'], 'GE-II-1FJ': ['GE-II1FJ'], 'GE-I-3FJ': ['GE-I3FJ'], 'GE-II-3FJ': ['GE-II-3FJ'], 'GE-III-3FJ': ['GE-III-3FJ'],
    'GE-I-4FJ': ['GE-I4FJ'], 'GE-II-4FJ': ['GE-II-4FJ'], 'GE-III-4FJ': ['GE-III4FJ'], 'GE-1FJ-Div': ['GE-1FJ-ASU'],
    'GE-26Pz-Tk': ['GE-826'], 'GE-145': ['GE-145'], 'GE-146': ['GE-146'], 'GE-65-ASU': ['GE-65-ASU'],
    'GE-9-26': ['GE-I-9', 'GE-II-9'], 'GE-67-26': ['GE-I-67', 'GE-II-67'], 'GE-26-Recce': ['GE-26'], 'GE-26Pz-Div': ['GE-26Pz-ASU'],
}
for u in EIGHTH['units']:
    RESEARCH_ID.setdefault(u['id'], [{'BR-1ParaBde': 'BR-1Para', 'BR-4ParaBde': 'BR-4Para', 'BR-1ALBde': 'BR-1AL', 'BR-2ParaBde': 'BR-2Para',
                                      'IN-6Lancers': 'IN-6L', 'NZ-DivCav': 'NZ-Cav', 'NZ-18AR': 'NZ-18', 'NZ-19AR': 'NZ-19', 'NZ-20AR': 'NZ-20',
                                      'NZ-22Mot': 'NZ-22'}.get(u['id'], u['id'])])
WINTER_DAY = date(1943, 11, 2)
WINTER = ita_gt(13)  # 1 November


def position_near(r, lo=date(1943, 10, 20), hi=date(1943, 11, 5)):
    """The research position nearest 2 November within [lo, hi], else None."""
    best = None
    for p in r.get('positions', []):
        if not p.get('lat') or not p.get('date', '').startswith('1943'):
            continue
        d = date.fromisoformat(p['date'])
        if lo <= d <= hi and (best is None or abs((d - WINTER_DAY).days) < abs((best[0] - WINTER_DAY).days)):
            best = (d, p)
    return best[1] if best else None


# Where each formation was about 1 November when its own units have no position near that date (Eighth Army front
# 28 Oct - 5 Nov, research/eighth-army.json frontLines; LXXVI Panzer Corps on the Trigno).
FALLBACK = {
    '16 Pz': (42.03, 14.70), '1 FJ': (41.95, 14.45), '26 Pz': (41.62, 14.25), '65': (42.10, 14.48), 'LXXVI Pz': (42.10, 14.40),
    '78 Div': (42.02, 14.80), '8 Ind Div': (41.95, 14.62), '1 CN Div': (41.70, 14.50), '1 CN Armd Bde': (41.68, 14.55), '5 Div': (41.60, 14.30),
    '13 Corps': (41.55, 14.45), '5 Corps': (41.90, 14.85), '4 Armd Bde': (42.00, 14.83), '2 NZ Div': (41.52, 15.30), '4 NZ Armd Bde': (41.52, 15.30),
    'Independent': (41.90, 14.90), '1 Abn Div': (41.46, 15.54),
}
# Arrivals still to come on 1 November keep their turn; earlier units with no place take their formation's.
for gid, u in UNITS.items():
    w = SETUP['winter'][gid]
    if w:
        continue
    c = SETUP['campaign'][gid]
    if c.get('start', {}).get('remnant'):
        SETUP['winter'][gid] = {'start': {'remnant': True}}
        continue
    if 'arrive' in c and c['arrive']['turn'] > WINTER:
        SETUP['winter'][gid] = {k: v for k, v in c.items()}
        continue
    gone = [e for e in c.get('events', []) if e['kind'] == 'remove' and e['turn'] <= WINTER]
    if gone or u['cat'] in ('bh', 'garrison') or gid in ('US-3-531',):
        SETUP['winter'][gid] = {'start': {'box': 'permanentlyRemoved'}}
        continue
    p = None
    for rid, gids in RESEARCH_ID.items():
        if gid in gids:
            r = next((x for x in GER['units'] + EIGHTH['units'] if x['id'] == rid), None)
            p = r and position_near(r)
    if p:
        ll = (p['lat'], p['lon'])
    else:
        ll = FALLBACK.get(u['formation'])
        mate = next((SETUP['winter'][g]['start']['hex'] for g, v in UNITS.items() if g != gid and v['formation'] == u['formation']
                     and SETUP['winter'][g].get('start', {}).get('hex')), None)
        if not ll and mate:
            SETUP['winter'][gid] = {'start': {'hex': mate}}
            continue
        if not ll:
            raise SystemExit(f'no 1 November place for {gid} ({u["formation"]})')
    w = {'start': {'hex': ll_to_hex(*ll)}}
    w['events'] = [e for e in c.get('events', []) if e['turn'] > WINTER]
    if not w['events']:
        del w['events']
    SETUP['winter'][gid] = w


def spread(table, limit=6):
    """Keep every set-up hex on land, within stacking and clear of the enemy: crowded units move to the nearest hex
    with room on their own side of the line (Germans north, the Allies south)."""
    land = lambda h: h in MAP['hexes'] and MAP['hexes'][h]['terrain'] != 'sea'
    stack, side_at = {}, {}
    order = sorted(table, key=lambda g: (UNITS[g]['side'] != 'German', g))
    for gid in order:
        st = table[gid].get('start', {})
        h = st.get('hex')
        if not h:
            continue
        side = UNITS[gid]['side']
        sp = UNITS[gid]['sp']
        ok = lambda x: land(x) and stack.get(x, 0) + sp <= limit and side_at.get(x, side) == side and not any(
            side_at.get(n, side) != side for n in nbr_ids(x)) if side == 'Allied' else land(x) and stack.get(x, 0) + sp <= limit and side_at.get(x, side) == side
        if not ok(h):
            ring, seen = [h], {h}
            found = None
            while ring and not found:
                nxt = []
                for x in ring:
                    for n in nbr_ids(x):
                        if n in seen or n not in MAP['hexes']:
                            continue
                        seen.add(n)
                        nxt.append(n)
                cands = [x for x in nxt if ok(x)]
                if cands:
                    # The Allies give way to the south (higher rows), the Germans to the north.
                    found = max(cands, key=lambda x: int(x[2:])) if side == 'Allied' else min(cands, key=lambda x: int(x[2:]))
                ring = nxt
            h = found
            st['hex'] = h
        stack[h] = stack.get(h, 0) + sp
        side_at[h] = side


def keep_sides_of_front(table, points):
    """The Trigno front about 1 November (research/eighth-army.json, the 28 October line, run on to Isernia): east of
    the Italy '43 map's Bernhard cards, Germans stand at least two rows north of it and the Allies on or south of it."""
    front = {}
    for (la1, lo1), (la2, lo2) in zip(points, points[1:]):
        for i in range(41):
            h = ll_to_hex(la1 + (la2 - la1) * i / 40, lo1 + (lo2 - lo1) * i / 40)
            c, r = int(h[:2]), int(h[2:])
            front[c] = min(front.get(c, 99), r)
    for gid, st in table.items():
        h = st.get('start', {}).get('hex')
        if not h or gid in ITALY_WINTER:
            continue
        c, r = int(h[:2]), int(h[2:])
        if c not in front:
            continue
        r2 = max(r, front[c]) if UNITS[gid]['side'] == 'Allied' else min(r, front[c] - 2)
        st['start']['hex'] = f'{c:02d}{r2:02d}'


TRIGNO = next(f for f in EIGHTH['frontLines'] if f['date'] == '1943-10-28')['points'] + [[41.593, 14.233]]
keep_sides_of_front(SETUP['winter'], TRIGNO)
spread(SETUP['winter'])
spread(SETUP['campaign'])

# ------------------------------------------------------------------ oob.json

pools = dict(ITA['remnantPools'])
pools['GE-INF'] = pools['GE-INF'] + ['GE-REM-F', 'GE-REM-G']
pools['GE-MOT'] = pools['GE-MOT'] + ['GE-REM-H']
pools['BR'] = pools['BR'] + ['BR-REM-D', 'BR-REM-E', 'BR-REM-F']
cats = dict(ITA['categories'])
for k in ('garrison', 'engineer', 'bh'):
    cats[k] = SAL['categories'][k]

units = []
for gid, u in UNITS.items():
    u = dict(u)
    setup = {k: SETUP[k][gid] for k in ('campaign', 'winter')}
    u['setup'] = setup
    units.append(u)

for a in ('campaign', 'winter'):
    for gid in UNITS:
        st = SETUP[a][gid]
        if not st:
            raise SystemExit(f'{gid} has no {a} set-up')

# Italy '43's 1 November fortifications, on the grand map.
winter_marks = json.loads(json.dumps(ITA['setups']['bernhard']))
for f in winter_marks.get('fortifications', []):
    f['hex'] = it2g(f['hex'])
winter_marks.pop('vp', None)

oob = {
    '_note': 'The grand campaign\'s counters, built by tools/grand/build_oob.py from Salerno \'43\'s and Italy \'43\'s counters and the '
             'research in tools/grand/research. Values of counters neither game has are by analogy with the two games\' own.',
    'categories': cats,
    'remnantPools': pools,
    'units': units,
    'support': {**SAL['support'], 'battleshipsTurn': sal_gt(SAL['support']['battleshipsTurn'])},
    'startingSupplyPoints': SAL['startingSupplyPoints'],
    'optionalStart': {'hexes': {}, 'eliminated': [], 'alliedControl': []},
    'scenarios': {
        'campaign': {'name': 'Grand Campaign', 'firstTurn': 1, 'lastTurn': LAST, 'setup': 'campaign',
                     'description': 'From the Salerno landings to the Winter Line on both coasts, 9 September to 31 December 1943.'},
        'race': {'name': 'Race for Naples and Foggia', 'firstTurn': 1, 'lastTurn': ita_gt(5), 'setup': 'campaign',
                 'description': 'The landings, the battle for the beachhead and the drive on Naples and the Foggia airfields, 9 September to 10 October 1943.'},
        'winter': {'name': 'The Winter Line', 'firstTurn': WINTER, 'lastTurn': LAST, 'setup': 'winter',
                   'description': 'Both armies against the Bernhard and Gustav positions, from the Garigliano to the Sangro and Ortona, 1 November to 31 December 1943.'},
    },
    'setups': {
        'campaign': {'supplyPoints': {'German': 3, 'Allied': 0}, 'weather': 'A', 'trucks': 2},
        'winter': winter_marks,
    },
}
json.dump(oob, open(f'{ROOT}/data/grand43/oob.json', 'w'), indent=1, ensure_ascii=False)

# ------------------------------------------------------------------ rules.json

vp_dates = json.load(open(f'{HERE}/vp_dates.json'))
held_by = {}
for h, d in vp_dates.items():
    if d:
        held_by[h] = gt(d)


def pace(t):
    return sum(MAP['hexes'][h]['vp'] for h, g in held_by.items() if g <= t)


# The benchmark is the VP the Allies held at the end of each turn in 1943, a little behind it early on (the landing
# turns' fighting decided in a day or two what the counters take a turn to do).
bench = {}
for t in range(2, LAST + 1):
    bench[str(t)] = max(0, pace(t) - (1 if t <= 12 else 0))
# From 1 October the benchmark is also held to the game's own pace: the median VP of AI-against-AI games (elite
# against elite, pace_ai.json, written by pace.py from scripts/grand.ts runs), taken as the least it reaches from each
# turn on so the benchmark never falls, less one. The game's Allies move faster than 1943's through the empty south and
# score for the German guns they catch; this keeps the counters' own campaign even.
if os.path.exists(f'{HERE}/pace_ai.json'):
    ai = {int(k): v for k, v in json.load(open(f'{HERE}/pace_ai.json'))['median'].items()}
    for t in range(ita_gt(1), LAST + 1):
        later = [ai[x] for x in range(t, LAST + 1) if x in ai]
        if later:
            bench[str(t)] = max(bench[str(t)], round(min(later)) - 1)
rules = json.loads(json.dumps(ITA_R))
rules['system'] = 'italy43'
rules['landingPoints'] = None
rules['_note'] = ('The grand campaign plays Italy \'43\'s rules and tables throughout, with Salerno \'43\'s landing rules (the '
                  'invasion phase, beachheads, the Floating Reserve, landing points and airdrops) for the September landings. '
                  'Built by tools/grand/build_oob.py; the rulebooks govern.')
for k in ('invasion', 'airdrop', 'landingPoints', 'variableStrength'):
    rules[k] = SAL_R[k]
rules['landingPoints'] = SAL_R['landingPoints']
# September at Salerno '43's scale: its daily weather track and landing-day rules; Italy '43's track from 1 October.
rules['weatherSeasons'] = [{'fromTurn': 1, 'track': SAL_R['weather']['track']}, {'fromTurn': ita_gt(1), 'track': ITA_R['weather']['track']}]
rules['movement']['turn1GermanHalfMaRoundUp'] = True
rules['movement']['turn1AlliedTacticalOnly'] = True
rules['landingBattleTurns'] = 22
rules['turns'] = {'campaign': LAST, 'dates': {str(t): label(t) for t in DATES}}
rules['victory'] = {
    'benchmarks': bench,
    'automatic': {'fromTurn': ita_gt(6), 'alliedMargin': 6, 'alliedVp': 999, 'germanMargin': 6},
    'scenarioWin': {'campaign': bench[str(LAST)], 'race': bench[str(ita_gt(5))], 'winter': bench[str(LAST)]},
    'pace': {h: g for h, g in sorted(held_by.items())},
}
rules['naplesSupplyBonus'] = {str(ita_gt(int(k))): v for k, v in ITA_R['naplesSupplyBonus'].items()}
rules['eighthArmyZone'] = {}
# Entry areas that pass to the Allies as the Eighth Army comes up: Salerno '43's day 11 on the south edge, the roads
# from Taranto and Bari as the front reached Potenza (20 Sept) and the Ofanto (21-23 Sept).
rules['entryOpens'] = {'A1': 11, 'A2': 11, 'A3': 11, 'A4': 12, 'A5': 13, 'A6': 14, 'A7': 15}
# Replacements: Salerno '43's daily schedule for September, Italy '43's from October; the
# Eighth Army adds a British infantry step every third turn.
sched = {}
for d, v in SAL_R['replacements']['schedule'].items():
    t = sal_gt(int(d))
    for pool, kinds in v.items():
        for k, n in kinds.items():
            sched.setdefault(t, {}).setdefault(pool, {})
            sched[t][pool][k] = sched[t][pool].get(k, 0) + n
for d, v in ITA_R['replacements']['schedule'].items():
    t = ita_gt(int(d))
    for pool, kinds in v.items():
        for k, n in kinds.items():
            sched.setdefault(t, {}).setdefault(pool, {})
            sched[t][pool][k] = sched[t][pool].get(k, 0) + n
for t in list(range(13, 23, 4)) + list(range(ita_gt(1), LAST + 1, 3)):
    sched.setdefault(t, {}).setdefault('BR', {})
    sched[t]['BR']['inf'] = sched[t]['BR'].get('inf', 0) + 1
rules['replacements'] = {'schedule': {str(k): sched[k] for k in sorted(sched)}}
notes = {
    1: 'D-Day, 9 September: the Fifth Army lands in the Gulf of Salerno. Roll the Invasion table for each beach.',
    5: 'Historically: the 82nd Airborne drops into the beachhead overnight (13-14 Sept).',
    6: 'Historically: the main German counterattack on the beachhead (14 Sept).',
    8: 'Historically: the battleships Valiant and Warspite arrive; the Germans begin to draw off (16 Sept).',
    11: 'The Eighth Army arrives from Calabria at the south edge.',
    12: 'Historically: the Fifth and Eighth Armies join near Auletta; Potenza falls (20 Sept). The 36th Division goes into army reserve.',
    19: 'Historically: Foggia falls to the Eighth Army (27 Sept).',
    23: 'Historically: Naples falls on 1 October.',
    25: 'Historically: the commandos land at Termoli (3 October).',
    ita_gt(5): 'The Race for Naples and Foggia ends.',
    WINTER: 'The Winter Line begins.',
    LAST: 'The campaign ends.',
}
for k, v in ITA_R['turnNotes'].items():
    t = ita_gt(int(k))
    if 'Entry area' in v or 'Scenario' in v:
        continue
    notes[t] = (notes.get(t, '') + ' ' + v).strip()
for k, v in rules['naplesSupplyBonus'].items():
    notes[int(k)] = (notes.get(int(k), '') + f' Naples: +{v} Allied supply while the Allies hold it.').strip()
rules['turnNotes'] = {str(k): notes[k] for k in sorted(notes)}
rules['supply'] = {**ITA_R['supply'], 'salernoPortOpenRadius': SAL_R['supply']['salernoPortOpenRadius']}
json.dump(rules, open(f'{ROOT}/data/grand43/rules.json', 'w'), indent=1, ensure_ascii=False)

n = {s: sum(1 for u in UNITS.values() if u['side'] == s) for s in ('Allied', 'German')}
print(f'{len(UNITS)} counters ({n}); {LAST} turns; benchmarks {bench}')
