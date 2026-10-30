// Hold and Sleep: the player's way to tell a unit to stand still (no rules effect, but the phase only ends
// in the interface once every unit that can act has acted or been told to hold or sleep).
import { describe, expect, it } from 'vitest';
import { act, place, quiet } from './rules/harness';

describe('hold and sleep orders', () => {
  it('hold lasts for the phase; sleep lasts until woken, ordered, or an enemy is next to it at the start of movement', () => {
    const s = quiet({ side: 'Allied', phase: 'movement', turn: 3 });
    place(s, 'US-179', '2715');
    place(s, 'US-180', '2617');
    act(s, { type: 'hold', unitId: 'US-179' });
    act(s, { type: 'sleep', unitId: 'US-180' });
    expect(s.units['US-179'].holding).toBe(true);
    expect([s.units['US-180'].sleeping, s.units['US-180'].holding]).toEqual([true, true]);
    // A move wakes a unit and clears its hold.
    act(s, { type: 'move', unitId: 'US-179', to: '2714', mode: 'tactical' });
    expect(s.units['US-179'].holding).toBe(false);
    act(s, { type: 'wake', unitId: 'US-180' });
    expect(s.units['US-180'].sleeping).toBe(false);
    act(s, { type: 'sleep', unitId: 'US-180' });
    // Enemy units are not the player's to order.
    place(s, 'GE-I15', '2817');
    expect(() => act(s, { type: 'hold', unitId: 'GE-I15' })).toThrow();
  });

  it('a sleeping unit wakes at the start of its movement phase when an enemy is next to it', () => {
    const s = quiet({ side: 'Allied', phase: 'initial', turn: 3 });
    place(s, 'US-180', '2617', { sleeping: true });
    place(s, 'US-179', '2719', { sleeping: true });
    place(s, 'GE-I15', '2618');
    act(s, { type: 'endPhase' }); // into the Allied movement phase
    expect(s.phase).toBe('movement');
    expect(s.units['US-180'].sleeping).toBe(false);
    expect(s.units['US-179'].sleeping).toBe(true);
  });
});
