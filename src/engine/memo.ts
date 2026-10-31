// A short-lived cache for facts about one game state (who stands where, zones of control, bonds), for callers that
// ask the same questions of an unchanging state many times over: the AI weighing hundreds of moves before it picks
// one. Outside `withMemo` nothing is cached. Anyone who moves units of that state while inside must call `forgetMemo`, or
// do it inside a nested `withMemo` (its own cache, dropped on return, leaving the outer one as it was).
import type { GameState } from './types';

let scope: { s: GameState; data: Map<string, unknown> } | null = null;

/** Runs `fn` with facts about `s` cached until it returns. */
export function withMemo<T>(s: GameState, fn: () => T): T {
  const prev = scope;
  scope = { s, data: new Map() };
  try {
    return fn();
  } finally {
    scope = prev;
  }
}

/** Runs `fn` with nothing cached (for a quick question of a trial position, not worth building a cache for). */
export function withoutMemo<T>(fn: () => T): T {
  const prev = scope;
  scope = null;
  try {
    return fn();
  } finally {
    scope = prev;
  }
}

/** The cached value for `key` of state `s`, made by `make` the first time (or every time, outside a memo scope). */
export function memo<T>(s: GameState, key: string, make: () => T): T {
  if (!scope || scope.s !== s) return make();
  const hit = scope.data.get(key);
  if (hit !== undefined) return hit as T;
  const v = make();
  scope.data.set(key, v);
  return v;
}

/** Whether facts about `s` are being cached (callers with a cheaper uncached path can take it otherwise). */
export function memoActive(s: GameState): boolean {
  return !!scope && scope.s === s;
}

/** Drops what was cached for `s`: its units have moved. */
export function forgetMemo(s: GameState): void {
  if (scope && scope.s === s) scope.data.clear();
}
