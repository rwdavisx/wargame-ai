import { beforeEach, describe, expect, it } from 'vitest';
import { playOut } from '../src/ai/selfplay';
import { createClaudeAi } from '../src/ai/claude';
import { applyAction, newGame } from '../src/engine/game';

// These tests play whole games without pausing, which can hold up vitest's messages to its worker past their
// timeout; letting the event loop run before each one keeps them flowing.
beforeEach(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('heuristic AI', () => {
  it('plays a whole short scenario without illegal actions', () => {
    for (const seed of [1, 2, 3]) {
      const { state, illegal } = playOut('short', seed);
      expect(illegal).toEqual([]);
      expect(state.phase).toBe('gameOver');
      expect(state.turn).toBeLessThanOrEqual(8);
      expect(state.combats.length).toBeGreaterThan(5);
    }
  }, 60000);

  it('plays at every difficulty without illegal actions', () => {
    for (const level of ['recruit', 'regular', 'veteran', 'elite'] as const) {
      const { state, illegal } = playOut('short', 7, 30000, {}, { Allied: level, German: level });
      expect(illegal).toEqual([]);
      expect(state.phase).toBe('gameOver');
    }
  }, 90000);

  it('plays better at Elite than as a Recruit', () => {
    // The same seeds (the games replay identically): an Elite German beats a Recruit Allied commander nearly every
    // time (about 15 games in 16 over a longer run).
    let wins = 0;
    for (const seed of [21, 22, 23, 24, 25, 26]) {
      const { state } = playOut('short', seed, 30000, {}, { Allied: 'recruit', German: 'elite' });
      if (state.winner === 'German') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  }, 120000);

  it('rolls each beach itself when the landings are played one by one', () => {
    const { state, illegal } = playOut('short', 3, 30000, { rollLandings: true });
    expect(illegal).toEqual([]);
    expect(state.log.filter((l) => l.text.includes('Landing roll')).length).toBe(7);
  }, 60000);

  it('plays the campaign to a result', () => {
    const { state, illegal } = playOut('campaign', 11);
    expect(illegal).toEqual([]);
    expect(state.phase).toBe('gameOver');
    expect(state.turn).toBeLessThanOrEqual(22);
    expect(['Allied', 'German', 'draw']).toContain(state.winner);
  }, 60000);
});

describe('Claude AI', () => {
  it('falls back to the built-in AI when no API key is set', async () => {
    const statuses: string[] = [];
    const ai = createClaudeAi({ apiKey: '', model: 'claude-opus-5-5', onStatus: (t) => statuses.push(t) });
    const s = newGame('short', 5);
    for (let i = 0; i < 5; i++) applyAction(s, { type: 'endPhase' }); // invasion, German turn, Allied initial
    expect(s.phase).toBe('movement');
    expect(s.activeSide).toBe('Allied');
    const a = await ai.nextAction(s);
    expect(() => applyAction(s, a)).not.toThrow();
    expect(statuses.some((t) => t.includes('built-in AI'))).toBe(true);
  });
});
