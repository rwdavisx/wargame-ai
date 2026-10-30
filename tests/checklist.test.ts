// The threat map and the checks offered before a phase ends.
import { describe, expect, it } from 'vitest';
import { RULES } from '../src/engine/data';
import { neighbors } from '../src/engine/hex';
import { def, stackPoints } from '../src/engine/units';
import { modeLayer, unitReachLayer } from '../src/ui/mapModes';
import { endChecklist } from '../src/ui/qol';
import { openGround, place, quiet } from './rules/harness';

const texts = (items: { text: string }[]) => items.map((i) => i.text).join('\n');

describe('before the phase ends', () => {
  it('lists an overstacked hex', () => {
    const s = quiet({ side: 'Allied', phase: 'movement' });
    const h = openGround();
    const ids = Object.keys(s.units).filter((id) => def(id).side === 'Allied' && def(id).sp >= 2 && !def(id).silhouette);
    const placed: string[] = [];
    for (const id of ids) {
      place(s, id, h);
      placed.push(id);
      if (stackPoints(placed, s) > RULES.stackingLimit) break;
    }
    expect(texts(endChecklist(s, 'Allied'))).toMatch(new RegExp(`Overstacked at .*${h}`));
  });

  it('lists units that cannot trace supply', () => {
    const s = quiet({ side: 'Allied', phase: 'movement' });
    place(s, 'US-141', openGround());
    expect(texts(endChecklist(s, 'Allied'))).toMatch(/141 RCT \(-\) is out of supply/);
  });

  it('lists an objective left empty within the enemy\'s reach', () => {
    const s = quiet({ side: 'German', phase: 'movement' });
    place(s, 'US-141', neighbors('2811')[0]);
    expect(texts(endChecklist(s, 'German'))).toMatch(/2811.*VP\) is empty and the enemy can reach it/);
    // Not once a German unit stands in it.
    place(s, 'GE-I64', '2811');
    expect(texts(endChecklist(s, 'German'))).not.toMatch(/2811.*is empty/);
  });

  it('lists a good attack not taken in the combat phase', () => {
    const s = quiet({ side: 'German', phase: 'combat' });
    const h = openGround();
    place(s, 'US-2-141', h);
    const [a, b, c] = neighbors(h);
    place(s, 'GE-I64', a);
    place(s, 'GE-II64', b);
    place(s, 'GE-KGDor', c);
    expect(texts(endChecklist(s, 'German'))).toMatch(new RegExp(`An attack at .* on .*${h}.* is not taken`));
  });
});

describe('enemy threat', () => {
  it('shades where the enemy can strike and weighs it against each of your stacks', () => {
    const s = quiet({ side: 'Allied', phase: 'movement' });
    const h = openGround();
    place(s, 'US-141', h);
    place(s, 'GE-KGDor', neighbors(neighbors(h)[0])[0] === h ? neighbors(neighbors(h)[0])[1] : neighbors(neighbors(h)[0])[0]);
    const L = modeLayer(s, 'threat', 'Allied')!;
    expect(L.fills.some((f) => f.d)).toBe(true);
    expect(L.labels.find((l) => /^\d+ vs \d+$/.test(l.text))).toBeTruthy();
    const reach = unitReachLayer(s, s.units['GE-KGDor'])!;
    expect(reach.fills[0].d.length).toBeGreaterThan(0);
  });
});
