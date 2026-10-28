import { describe, expect, it } from 'vitest';
import { playOut } from '../src/ai/selfplay';
import { createClaudeAi } from '../src/ai/claude';
import { applyAction, newGame } from '../src/engine/game';

describe('heuristic AI', () => {
  it('plays a whole short scenario without illegal actions', () => {
    for (const seed of [1, 2, 3]) {
      const { state, illegal } = playOut('short', seed);
      expect(illegal).toEqual([]);
      expect(state.phase).toBe('gameOver');
      expect(state.turn).toBe(8);
      expect(state.combats.length).toBeGreaterThan(5);
    }
  });

  it('plays the campaign to the last turn', () => {
    const { state, illegal } = playOut('campaign', 11);
    expect(illegal).toEqual([]);
    expect(state.phase).toBe('gameOver');
    expect(state.turn).toBe(22);
    expect(['Allied', 'German', 'draw']).toContain(state.winner);
  }, 60000);
});

describe('Claude AI', () => {
  it('falls back to the built-in AI when no API key is set', async () => {
    const statuses: string[] = [];
    const ai = createClaudeAi({ apiKey: '', model: 'claude-opus-5-5', onStatus: (t) => statuses.push(t) });
    const s = newGame('short', 5);
    applyAction(s, { type: 'endPhase' }); // Allied initial -> movement
    const a = await ai.nextAction(s);
    expect(() => applyAction(s, a)).not.toThrow();
    expect(statuses.some((t) => t.includes('built-in AI'))).toBe(true);
  });
});
