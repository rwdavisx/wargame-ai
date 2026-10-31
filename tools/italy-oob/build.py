"""Builds data/italy43/oob.json from the set-up card and counter transcriptions in source/.

source/oob-german.json and source/oob-allied.json hold what the two Italy '43 set-up cards of each side show
(Campaign Game and Bernhard Line), counter by counter. source/counters-fronts.json and counters-backs.json hold
what the photos of the counters themselves show, front and back; where they say more than the cards, they win.
This script turns them into the engine's order of battle: one entry per counter with its values, and a set-up
per card under `setup`. Rerun it after correcting a transcription:

    python3 tools/italy-oob/build.py
"""

import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent.parent / 'data' / 'italy43' / 'oob.json'

# Card unit types onto engine categories. `kind` keeps the card's own type when it says more.
CATEGORY = {
    'infantry': 'infantry', 'motorized': 'motorized', 'pg': 'pg', 'mechanized': 'pg', 'recon': 'recon',
    'tank': 'tank', 'td': 'tank', 'armor': 'tank', 'airborne': 'airborne', 'glider': 'glider',
    'ranger': 'ranger', 'commando': 'ranger', 'ssf': 'ranger', 'mountain': 'mountain',
    'heavyHowitzer': 'heavyHowitzer', 'nebelwerfer': 'nebelwerfer', 'divAsu': 'divAsu', 'corpsAsu': 'corpsAsu',
}

# Entry areas as the cards print them, onto the areas a unit may choose from.
ENTRY = {'N1-3': 'N1/N2/N3', 'S1 or S2': 'S1/S2', '1706 (Formia)': 'hex:1706'}

# Remnant pools (10.4): a 3-step unit takes a remnant of its own type and nation. Mountain infantry use the
# infantry remnants and the US glider regiment the airborne one.
POOLS = {
    'GE-INF': ['GE-REM-A', 'GE-REM-B', 'GE-REM-C', 'GE-REM-D'],
    'GE-MOT': ['GE-REM-E', 'GE-REM-A-M', 'GE-REM-B-M', 'GE-REM-C-M', 'GE-REM-D-M'],
    'US': ['US-REM-A', 'US-REM-B', 'US-REM-C'],
    'BR': ['BR-REM-A', 'BR-REM-B', 'BR-REM-C'],
    'BR-MOT': ['BR-REM-A-M', 'BR-REM-B-M', 'BR-REM-C-M'],
    'FR': ['FR-REM-A', 'FR-REM-B'],
}

# The other side of a two-sided remnant counter (counters-backs.json): German remnants A-D are infantry on one
# side and motorized on the other; the British ones have a 7th Armoured motorized side.
TWIN_SIDES = [
    *[{'id': f'GE-REM-{x}-M', 'twin': f'GE-REM-{x}', 'name': f'REM {x} (motorized)', 'side': 'German', 'nation': 'GE',
       'formation': 'Independent', 'cat': 'motorized', 'a': 1, 'd': 3, 'm': 5, 'sp': 2} for x in 'ABCD'],
    *[{'id': f'BR-REM-{x}-M', 'twin': f'BR-REM-{x}', 'name': f'REM (British) {x}, 7th Armoured', 'side': 'Allied',
       'nation': 'BR', 'formation': '7 Arm Div', 'cat': 'motorized', 'a': 1, 'd': 3, 'm': 5, 'sp': 2,
       'lowQuality': True} for x in 'ABC'],
    # Printed on the back of one of the US remnants; which one is not known yet.
    {'id': 'US-REM-6-1A', 'name': '6/1A REM', 'side': 'Allied', 'nation': 'US', 'formation': '1 Arm Div', 'cat': 'pg',
     'kind': 'mechanized', 'a': 1, 'd': 3, 'm': 5, 'sp': 2, 'lowQuality': True},
]


def pool_for(u, cat, nation):
    if u['id'] == 'BR-22-7A':
        return 'BR-REM-22-7A'
    if nation == 'US' and u['formation'].startswith('82'):
        return 'US-REM-82'
    if u['id'] == 'US-6-1A':
        return 'US-REM-6-1A'
    if nation == 'BR' and cat in ('motorized', 'pg'):
        return 'BR-MOT'
    if nation == 'GE':
        return 'GE-MOT' if cat in ('motorized', 'pg') else 'GE-INF'
    # A nation with no remnants of its own (the Italians) goes straight to the Eliminated Box (10.4.2).
    return nation if nation in POOLS else None


def values(printed):
    """'4³-3-5' / '2[3]-2-5' -> (a, d, m, tr)."""
    m = re.match(r'^(\d+)(?:([⁰¹²³⁴⁵⁶⁷⁸⁹])|\[(\d)\])?-(\d+)-(\d+)$', printed)
    if not m:
        raise ValueError(printed)
    sup = '⁰¹²³⁴⁵⁶⁷⁸⁹'
    tr = sup.index(m.group(2)) if m.group(2) else (int(m.group(3)) if m.group(3) else None)
    return int(m.group(1)), int(m.group(4)), int(m.group(5)), tr


def estimate_front(a, d, m, sp):
    """Only the reduced side of a few counters has been seen; until the fronts are photographed, use the
    pattern of the counters seen on both sides (1-2-5 battalions are 2-3-5 at full strength, a 3-step
    regiment's second step is two-thirds of its first)."""
    if sp >= 3:
        return round(a * 1.5), round(d * 1.5), m
    return a + 1, d + 1, m


def side_setup(card, nation, side):
    """One card's placing of one counter."""
    if not card:
        return None
    out = {}
    if card.get('start'):
        out['start'] = {'hex': card['start']}
    elif card.get('startBox') == 'remnantDisplay' or card.get('remnantDisplay'):
        out['start'] = {'remnant': True}
    elif card.get('startBox') in ('eliminated', 'permanentlyRemoved'):
        out['start'] = {'box': card['startBox']}
    elif card.get('removedAtStart'):
        out['start'] = {'box': 'permanentlyRemoved'}
    if card.get('arrive'):
        via = card['arrive'].get('via')
        out['arrive'] = {'turn': card['arrive']['turn'], 'at': ENTRY.get(via, via)}
        if card.get('reduced'):
            out['arrive']['reduced'] = True
    elif card.get('reduced'):
        out['reduced'] = True
    if card.get('fired'):
        out['fired'] = True
    if card.get('frozen'):
        out['frozen'] = True
    if card.get('garrison'):
        out['garrison'] = card['garrison'] if isinstance(card['garrison'], str) else True
    if card.get('mayNotMove'):
        out['frozen'] = True
    events = []
    for e in card.get('events') or []:
        ev = {'turn': e['turn'], 'kind': e['kind']}
        if e.get('via'):
            ev['at'] = ENTRY.get(e['via'], e['via'])
        if e.get('reduced'):
            ev['reduced'] = True
        if e.get('fired'):
            ev['fired'] = True
        events.append(ev)
    # A unit the Bernhard card lists only by its return is off the map until then.
    if not out.get('start') and not out.get('arrive') and card.get('startBox') == 'withdrawn':
        back = next((e for e in events if e['kind'] == 'return'), None)
        if back:
            out['arrive'] = {'turn': back['turn'], 'at': back['at']}
            if back.get('reduced') or out.pop('reduced', False):
                out['arrive']['reduced'] = True
            events.remove(back)
    if events:
        out['events'] = events
    return out


def convert(u, side):
    nation = u.get('nation') or 'GE'
    kind = u['type']
    if kind == 'remnant' or ('-REM' in u['id'] and kind == 'mountain'):
        kind = 'motorized' if u['m'] >= 5 else 'infantry'
    cat = CATEGORY[kind]
    a, d, m = u['a'], u['d'], u['m']
    tr = u.get('tr')
    sp = u.get('sp')
    silhouette = cat == 'tank' and (sp is None or (sp <= 1 and kind != 'armor'))
    if sp is None:
        sp = 1 if cat == 'tank' else 0
    entry = {
        'id': u['id'], 'name': u['name'], 'side': side, 'nation': nation, 'formation': u['formation'] or 'Independent',
        'cat': cat, 'a': a, 'd': d, 'm': m, 'sp': sp,
    }
    if '-REM' in u['id'] and u['type'] == 'mountain':
        kind = 'mountain'  # the French remnants carry the mountain symbol, but not the abilities (10.4.1)
    if kind != cat:
        entry['kind'] = kind
    if u.get('size') and u['size'] != 'REM':
        entry['size'] = u['size']
    if tr is not None:
        entry['tr'] = tr
    if u.get('range') is not None:
        entry['range'] = u['range']
    if u.get('quality') == 'elite':
        entry['elite'] = True
    if u.get('quality') == 'low':
        entry['lowQuality'] = True
    # Seven mountain units, the 1st Special Service Force among them (19.3).
    if (kind == 'mountain' and cat == 'mountain') or kind == 'ssf':
        entry['mountain'] = True
    if u.get('triangle'):
        entry['entersReduced'] = True
    if silhouette:
        entry['silhouette'] = True
    if u.get('reduced'):
        # Only the reduced side is known: it is the back, and the front is estimated for now.
        entry['back'] = f'{a}-{d}-{m}'
        entry['a'], entry['d'], entry['m'] = estimate_front(a, d, m, sp)
        entry['estimated'] = ['front']
    elif u.get('back'):
        ba, bd, bm, _ = values(u['back'])
        entry['back'] = f'{ba}-{bd}-{bm}'
        if u.get('backSp') is not None:
            entry['backSp'] = u['backSp']
    if u.get('size') in ('III', 'X') and entry['sp'] >= 3 and cat not in ('divAsu', 'corpsAsu', 'nebelwerfer'):
        pool = pool_for(u, cat, nation)
        if pool:
            entry['remnant'] = pool
    setup = {k: s for k, s in (('campaign', side_setup(u.get('campaign'), nation, side)), ('bernhard', side_setup(u.get('bernhard'), nation, side))) if s is not None}
    entry['setup'] = setup
    if u.get('confidence') and u['confidence'] != 'high':
        entry['confidence'] = u['confidence']
    return entry


def remnant_copies(u, side):
    """The Allied file has one entry per remnant type with a count; the engine needs one per counter."""
    base = convert(u, side)
    n = (u.get('bernhard') or {}).get('count') or 1
    stem = {'BR-REM': 'BR-REM', 'US-REM': 'US-REM', 'FR-REM': 'FR-REM'}.get(u['id'])
    if not stem:
        return [base]
    out = []
    for i in range(n):
        letter = 'ABCDE'[i]
        c = json.loads(json.dumps(base))
        c['id'] = f'{stem}-{letter}'
        c['name'] = f"{u['name']} {letter}"
        out.append(c)
    return out


def strength(v):
    return f"{v['a']}-{v['d']}-{v['m']}"


def quality_of(q):
    """'elite' / 'low' / None from a photo reading ('normal (defense not boxed)' and the like count as normal)."""
    q = (q or '').lower()
    return 'elite' if q.startswith('elite') else 'low' if q.startswith('low') else None


ASU_CATS = ('divAsu', 'corpsAsu', 'nebelwerfer', 'heavyHowitzer')


def apply_photos(units, fronts, backs):
    """What the counters themselves show: full-strength values, ranges and quality from the fronts; the reduced
    side, or none, from the backs."""
    by_id = {u['id']: u for u in units}
    for uid, f in fronts['fronts'].items():
        u = by_id[uid]
        if u['cat'] not in ASU_CATS:
            u['a'], u['d'], u['m'] = f['a'], f['d'], f['m']
            if f.get('sp') is not None:
                u['sp'] = f['sp']
        if f.get('tr') is not None:
            u['tr'] = f['tr']
        if f.get('range') is not None:
            u['range'] = f['range']
        q = quality_of(f.get('quality'))
        u.pop('elite', None)
        u.pop('lowQuality', None)
        if q == 'elite':
            u['elite'] = True
        elif q == 'low':
            u['lowQuality'] = True
        if u.get('estimated') == ['front']:
            del u['estimated']
    for uid, b in backs['backs'].items():
        u = by_id[uid]
        if u['cat'] in ASU_CATS:
            u['back'] = 'none'  # the back is the Fired side
            continue
        u['back'] = strength(b)
        if b.get('sp') is not None and b['sp'] != u['sp']:
            u['backSp'] = b['sp']
        else:
            u.pop('backSp', None)
        front_q = 'elite' if u.get('elite') else 'low' if u.get('lowQuality') else 'normal'
        back_q = quality_of(b.get('quality')) or 'normal'
        if back_q != front_q:
            u['backQuality'] = back_q
    for m in backs['missingBacks']:
        u = by_id.get(m['id'])
        if u and '-REM' not in u['id'] and 'one-step' in m['likely']:
            u['back'] = 'none'
    # 142/36 was photographed face up; its sister regiments' backs are 4-4-3.
    if 'back' not in by_id['US-142-36']:
        by_id['US-142-36']['back'] = '4-4-3'
        by_id['US-142-36']['estimated'] = ['back']
    for u in units:
        # A regiment whose back stacks at 2 has two steps and no remnant: the 94th and 305th Divisions'.
        if u.get('remnant') and u.get('backSp') is not None and u['backSp'] < 3:
            del u['remnant']
    for t in TWIN_SIDES:
        twin = dict(t)
        twin['setup'] = {'campaign': {'start': {'remnant': True}}, 'bernhard': {'start': {'remnant': True}}}
        units.append(twin)
        if 'twin' in t:
            by_id[t['twin']]['twin'] = t['id']
    for u in units:
        if '-REM' in u['id']:
            u['back'] = 'none'


def main():
    ger = json.loads((HERE / 'source' / 'oob-german.json').read_text())
    all_ = json.loads((HERE / 'source' / 'oob-allied.json').read_text())
    units = [convert(u, 'German') for u in ger['units']]
    for u in all_['units']:
        units.extend(remnant_copies(u, 'Allied') if '-REM' in u['id'] else [convert(u, 'Allied')])
    apply_photos(units, json.loads((HERE / 'source' / 'counters-fronts.json').read_text()),
                 json.loads((HERE / 'source' / 'counters-backs.json').read_text()))
    ids = [u['id'] for u in units]
    assert len(ids) == len(set(ids)), 'duplicate ids'
    for pool in POOLS.values():
        for rid in pool:
            assert rid in ids, rid
    for u in units:
        r = u.get('remnant')
        if r and r not in POOLS:
            assert r in ids, (u['id'], r)

    gm = {m['kind']: m for m in ger['markers']['bernhard'] if 'kind' in m}
    forts = [{'hex': m['hex'], 'level': m.get('level', 1), **({'building': True} if m['kind'] == 'fortificationUnderConstruction' else {})}
             for m in ger['markers']['bernhard'] if m.get('kind', '').startswith('fortification') and 'hex' in m]
    oob = {
        '_note': (
            "Italy '43 counters, built by tools/italy-oob/build.py from the set-up card transcriptions. "
            'a-d-m are the full-strength side; back is the reduced side ("none" for a one-step counter). '
            "Each counter's place in each scenario is under setup.campaign (Campaign Game and Across the Volturno) "
            'and setup.bernhard (The Bernhard Line). Values and backs are checked against photos of the counters; '
            'backQuality is the troop quality on the reduced side when it differs, and twin links the two sides of a '
            'two-sided remnant counter. `estimated` marks a value not seen on a counter.'
        ),
        'categories': {
            'infantry': {'mech': False, 'maxAdv': 2, 'repl': 'inf'},
            'mountain': {'mech': False, 'maxAdv': 2, 'repl': 'inf'},
            'motorized': {'mech': True, 'maxAdv': 4, 'repl': 'inf'},
            'pg': {'mech': True, 'maxAdv': 4, 'repl': 'inf'},
            'airborne': {'mech': False, 'maxAdv': 2, 'repl': 'special'},
            'glider': {'mech': False, 'maxAdv': 2, 'repl': 'special'},
            'ranger': {'mech': False, 'maxAdv': 2, 'repl': 'special'},
            'recon': {'mech': True, 'maxAdv': 4, 'repl': 'special'},
            'tank': {'mech': True, 'maxAdv': 4, 'repl': 'armor'},
            'divAsu': {'mech': True, 'maxAdv': 0, 'repl': 'special', 'asu': 'division'},
            'corpsAsu': {'mech': True, 'maxAdv': 0, 'repl': 'special', 'asu': 'corps'},
            'nebelwerfer': {'mech': True, 'maxAdv': 0, 'repl': 'special', 'asu': 'corps'},
            'heavyHowitzer': {'mech': True, 'maxAdv': 0, 'repl': None, 'asu': 'corps'},
        },
        'remnantPools': POOLS,
        'units': units,
        'scenarios': {
            'volturno': {'name': 'Across the Volturno', 'firstTurn': 1, 'lastTurn': 7, 'setup': 'campaign',
                         'description': 'The Fifth Army forces the Volturno, 1 to 16 October 1943.'},
            'bernhard': {'name': 'The Bernhard Line', 'firstTurn': 13, 'lastTurn': 32, 'setup': 'bernhard',
                         'description': 'The winter battles for the Bernhard Line, 1 November to 31 December 1943.'},
            'campaign': {'name': 'Campaign Game', 'firstTurn': 1, 'lastTurn': 32, 'setup': 'campaign',
                         'description': 'From the Volturno to the Gustav Line, 1 October to 31 December 1943.'},
        },
        'setups': {
            'campaign': {
                'supplyPoints': {'German': 1, 'Allied': 0}, 'weather': 'E', 'trucks': 2,
                'support': {'place': 'holding', 'used': True},
            },
            'bernhard': {
                'supplyPoints': {'German': 1, 'Allied': 3}, 'weather': 'B', 'vp': 10, 'trucks': 2,
                'support': {'place': 'holding'},
                'fortifications': forts,
                'fortificationPool': {'2': gm['fortificationPool']['available']},
            },
        },
        'uncertain': {'German': ger['uncertain'], 'Allied': all_['uncertain']},
    }
    OUT.write_text(json.dumps(oob, indent=1, ensure_ascii=False) + '\n')
    print(f'{OUT}: {len(units)} counters')


if __name__ == '__main__':
    main()
