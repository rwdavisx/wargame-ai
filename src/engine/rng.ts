// Seeded random numbers (mulberry32). The seed lives in GameState so that
// games are reproducible and saved games replay identically.

export function nextRandom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: next };
}

/** Rolls one six-sided die, advancing the seed stored on `holder`. */
export function rollD6(holder: { rng: number }): number {
  const { value, seed } = nextRandom(holder.rng);
  holder.rng = seed;
  return 1 + Math.floor(value * 6);
}
