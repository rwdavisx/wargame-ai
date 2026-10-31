// Italy '43 played by the engine: the scenarios' set-up, the turn's scheduled events, the 8th Army zone, Italy's
// movement rules and fortifications, and a whole scenario played by the computer.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/engine/data';
import { fortOptions } from '../../src/engine/forts';
import { advancePhase, alliedVp, applyAction, FROZEN_UNTIL_RELEASED, newGame } from '../../src/engine/game';
import { cannotMove, stepCost, zoneClosed } from '../../src/engine/movement';
import { weatherBox } from '../../src/engine/movement';
import type { GameState } from '../../src/engine/types';
import { playOut } from '../../src/ai/selfplay';
import { ITALY_DATA } from '../../src/games/italy43/data';
import { SALERNO_DATA } from '../../src/games/salerno43/data';

beforeAll(() => loadGameData('italy43', ITALY_DATA));
afterAll(() => loadGameData('salerno43', SALERNO_DATA));

/** Jump to the German Initial Phase of `turn` (the phase's events run as play reaches it). */
function toGermanInitial(s: GameState, turn: number): GameState {
  s.turn = turn;
  s.phase = 'weather';
  advancePhase(s);
  return s;
}

describe("Italy '43 scenarios", () => {
  it('start from their set-up cards on the German player turn', () => {
    const c = newGame('campaign', 1);
    expect([c.turn, c.phase, c.activeSide, weatherBox(c).box]).toEqual([1, 'initial', 'German', 'E']);
    expect(c.supplyPoints).toEqual({ German: 1, Allied: 0 });
    const b = newGame('bernhard', 1);
    expect([b.turn, b.lastTurn, weatherBox(b).box]).toEqual([13, 32, 'B']);
    expect(b.supplyPoints).toEqual({ German: 1, Allied: 3 });
    // The scenario rules print the Allies' starting VPs: the set-up's positions earn exactly that (S2.1).
    expect(alliedVp(b)).toBe(10);
    expect(newGame('volturno', 1).lastTurn).toBe(7);
  });

  it('freezes units on coastal duty and in garrison, and starts units reduced or fired as the cards show', () => {
    const c = newGame('campaign', 1);
    expect(c.units['GE-104'].frozenUntil).toBe(FROZEN_UNTIL_RELEASED); // 15 PG on coastal duty (S3.3)
    expect(c.units['GE-103Pz'].frozenUntil).toBe(2); // 3 PG in 2706, released on Turn 2
    expect(c.units['GE-33']).toMatchObject({ frozenUntil: 14, garrison: 'Formia' });
    expect(c.units['US-504-82']).toMatchObject({ frozenUntil: 11, garrison: 'Naples' });
    expect(cannotMove(c, c.units['US-504-82'])).toContain('garrison');
    expect(c.units['GE-HG-ASU'].fired).toBe(true);
    expect(c.units['GE-HG'].stepsLost).toBe(1);
  });

  it('starts the Bernhard Line with its forts, and Across the Volturno with none to build', () => {
    const b = newGame('bernhard', 1);
    expect(Object.keys(b.forts!)).toHaveLength(8);
    expect(b.forts!['2504']).toEqual({ level: 1, building: true }); // Cassino, under construction
    // All eight Level 1s are started, so the Germans may now complete them, but start no more.
    const ops = new Set(fortOptions(b).map((o) => o.op));
    expect(ops.has('complete')).toBe(true);
    expect(ops.has('start')).toBe(false);
    expect(fortOptions(newGame('volturno', 1))).toEqual([]);
  });
});

describe("Italy '43 turn by turn", () => {
  it('withdraws a unit on its turn and brings it back later', () => {
    const c = toGermanInitial(newGame('campaign', 1), 7);
    expect(c.units['GE-I-9'].where).toEqual({ kind: 'pending', turn: 14, at: 'N3' });
  });

  it('hands each 8th Army zone section to the Allies on its turn', () => {
    const c = newGame('campaign', 1);
    c.units['GE-I-9'].where = { kind: 'map', hex: '4114' };
    toGermanInitial(c, 8);
    expect(c.control.E1).toBe('Allied');
    const w = c.units['GE-I-9'].where as { hex: string };
    expect(w.hex).not.toBe('4114');
    expect(c.units['GE-I-9'].status).toBe('disrupted');
    expect(zoneClosed(c, 'German', '4114')).toBe(true);
    expect(zoneClosed(c, 'German', '3910')).toBe(false); // E2 holds out until Turn 11
    expect(zoneClosed(c, 'Allied', '3910')).toBe(true); // the Allies never enter the zone (5.8.2)
  });

  it('builds one fortification step a turn', () => {
    const c = newGame('campaign', 1);
    const start = fortOptions(c).find((o) => o.op === 'start' && o.hex === '2504');
    expect(start).toBeTruthy();
    applyAction(c, { type: 'buildFort', hex: '2504', op: 'start' });
    expect(c.forts!['2504']).toEqual({ level: 1, building: true });
    expect(fortOptions(c)).toEqual([]);
  });
});

describe("Italy '43 movement", () => {
  it('charges mechanized units the full road rate near the enemy (Operational Movement)', () => {
    const c = newGame('campaign', 1);
    const u = c.units['GE-104'];
    // The Appian Way near Fondi, far behind the German lines.
    u.where = { kind: 'map', hex: '1502' };
    expect(stepCost(c, u, '1502', '1503', 'normal')?.cost).toBeCloseTo(1 / 3, 2);
    c.units['US-6-1A'].where = { kind: 'map', hex: '1505' };
    c.seq += 1;
    expect(stepCost(c, u, '1502', '1503', 'normal')?.cost).toBe(1);
  });
});

describe("Italy '43 played by the computer", () => {
  it('plays Across the Volturno to a result without an illegal move', () => {
    const { state, illegal } = playOut('volturno', 3, 6000);
    expect(illegal).toEqual([]);
    expect(state.phase).toBe('gameOver');
    expect(state.winner).toBeTruthy();
  }, 120000);
});
