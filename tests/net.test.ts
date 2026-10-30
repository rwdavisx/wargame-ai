// Online play: two devices on one shared store stay in step through turns, clashes and undos.
import { describe, expect, it } from 'vitest';
import { actingSide, withAction } from '../src/engine/game';
import type { Action, GameState, Side } from '../src/engine/types';
import { createHeuristicAi } from '../src/ai/heuristic';
import { legalDestinations } from '../src/engine/movement';
import { effectiveMode } from '../src/ui/play';
import { LocalDb, memoryStore } from '../src/net/localDb';
import { CHUNK, claimSeat, controllersFor, createGame, NetSession, type NetHead } from '../src/net/session';

const until = async (f: () => boolean, ms = 8000) => {
  const t = Date.now();
  while (!f()) {
    if (Date.now() - t > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** One device: its session and the position its screen shows, playing out the others' actions as they arrive. */
class Device {
  session: NetSession;
  constructor(db: LocalDb, gid: string, readonly me: string) {
    this.session = new NetSession(db, gid, me);
  }
  get game(): GameState {
    return this.session.game!;
  }
  async start() {
    await this.session.start();
  }
  catchUp() {
    for (const a of this.session.incoming()) this.session.consumed(this.game, withAction(this.game, a));
  }
  act(a: Action) {
    this.catchUp();
    expect(this.session.push(a, this.game, withAction(this.game, a))).toBe(true);
  }
  idle() {
    return this.session.status === 'ok' && !this.session.incoming().length;
  }
}

const setup = { title: 'Test', scenario: 'short', options: { rollLandings: true, disengagement: true }, aiLevel: 'regular' as const };

describe('online play', () => {
  it('two players in a versus game reach the same position', async () => {
    const store = memoryStore();
    const gid = await createGame(new LocalDb(store), 'ann', { ...setup, mode: 'versus', side: 'Allied' });
    await claimSeat(new LocalDb(store, 2), gid, 'bob', 'German');
    const ann = new Device(new LocalDb(store, 1), gid, 'ann');
    const bob = new Device(new LocalDb(store, 3), gid, 'bob');
    await ann.start();
    await bob.start();
    expect(ann.session.controllers).toEqual({ Allied: 'human', German: 'remote' });
    expect(bob.session.controllers).toEqual({ Allied: 'remote', German: 'human' });
    const ai = { Allied: createHeuristicAi('regular'), German: createHeuristicAi('regular') };
    const dev: Record<Side, Device> = { Allied: ann, German: bob };
    // Play a few phases, each device acting only for its own side once it has caught up.
    for (let i = 0; i < 120; i++) {
      for (const d of [ann, bob]) d.catchUp();
      const side = actingSide(ann.game);
      const d = dev[side];
      await until(() => d.session.incoming().length === 0 || (d.catchUp(), true));
      if (actingSide(d.game) !== side) continue;
      d.act(ai[side].nextAction(d.game) as Action);
      if (i % 10 === 9) await until(() => ann.idle() || (ann.catchUp(), false) || ann.idle());
    }
    await until(() => ann.session.status === 'ok' && bob.session.status === 'ok');
    await until(() => (ann.catchUp(), bob.catchUp(), ann.session.local.length === bob.session.local.length));
    ann.catchUp();
    bob.catchUp();
    expect(JSON.stringify(ann.game.units)).toBe(JSON.stringify(bob.game.units));
    expect(ann.game.rng).toBe(bob.game.rng);
    expect(ann.game.turn).toBeGreaterThanOrEqual(1);
    for (const d of [ann, bob]) d.session.stop();
  }, 60000);

  it('co-op partners moving at the same moment both keep their moves', async () => {
    const store = memoryStore();
    const gid = await createGame(new LocalDb(store), 'ann', { ...setup, mode: 'coop', side: 'Allied', options: { ...setup.options, optionalStart: true } });
    await claimSeat(new LocalDb(store), gid, 'bob', 'Allied');
    const ann = new Device(new LocalDb(store, 4), gid, 'ann');
    const bob = new Device(new LocalDb(store, 4), gid, 'bob');
    await ann.start();
    await bob.start();
    const head = ann.session.head as NetHead;
    expect(head.aiSide).toBe('German');
    // The host runs the computer side; the partner watches it.
    expect(controllersFor(head, 'ann', new Set(['ann', 'bob']))).toEqual({ Allied: 'human', German: 'heuristic' });
    expect(controllersFor(head, 'bob', new Set(['ann', 'bob']))).toEqual({ Allied: 'human', German: 'remote' });
    // ...or the partner, when the host has gone.
    expect(controllersFor(head, 'bob', new Set(['bob'])).German).toBe('heuristic');
    // The tournament start opens with the German turn: let the host's computer play it.
    const ger = createHeuristicAi('regular');
    while (ann.game.activeSide === 'German' && ann.game.phase !== 'gameOver') ann.act(ger.nextAction(ann.game) as Action);
    await until(() => ann.session.status === 'ok');
    await until(() => (bob.catchUp(), bob.game.activeSide === 'Allied' && bob.session.local.length === ann.session.local.length));
    // Into the Allied movement phase, then each partner moves a different unit, at once.
    const al = createHeuristicAi('regular');
    while (ann.game.phase !== 'movement') {
      const a = al.nextAction(ann.game) as Action;
      ann.act(a.type === 'move' ? { type: 'endPhase' } : a);
    }
    await until(() => ann.session.status === 'ok');
    await until(() => (bob.catchUp(), bob.game.phase === 'movement' && bob.session.local.length === ann.session.local.length));
    const moveOf = (d: Device, skip: string): Action => {
      for (const u of Object.values(d.game.units)) {
        if (u.where.kind !== 'map' || u.id === skip || !d.game.units[u.id] || (u.id.startsWith('GE') || u.id.startsWith('IT'))) continue;
        try {
          const mode = effectiveMode(d.game, u.id, 'normal');
          if (!mode) continue;
          const dest = [...legalDestinations(d.game, u.id, mode).keys()].find((h) => h !== (u.where as { hex: string }).hex);
          if (dest) return { type: 'move', unitId: u.id, to: dest, mode } as Action;
        } catch {
          /* try the next */
        }
      }
      throw new Error(`no move ${d.game.activeSide} ${d.game.phase} T${d.game.turn}`);
    };
    const a1 = moveOf(ann, '');
    const b1 = moveOf(bob, (a1 as { unitId: string }).unitId);
    ann.act(a1);
    bob.act(b1);
    await until(() => ann.session.status === 'ok' && bob.session.status === 'ok');
    await until(() => (ann.catchUp(), bob.catchUp(), ann.session.local.length === bob.session.local.length && ann.idle() && bob.idle()));
    expect(ann.session.local.map((a) => JSON.stringify(a))).toEqual(bob.session.local.map((a) => JSON.stringify(a)));
    expect(JSON.stringify(ann.game.units)).toBe(JSON.stringify(bob.game.units));
    const at = (d: Device, id: string) => d.game.units[id].where;
    expect(at(ann, (a1 as { unitId: string }).unitId)).toEqual({ kind: 'map', hex: (a1 as { to: string }).to });
    expect(at(ann, (b1 as { unitId: string }).unitId)).toEqual({ kind: 'map', hex: (b1 as { to: string }).to });
    for (const d of [ann, bob]) d.session.stop();
  }, 60000);

  it('an undo reaches the other device, and the log spills over into new chunks', async () => {
    const store = memoryStore();
    const gid = await createGame(new LocalDb(store), 'ann', { ...setup, mode: 'versus', side: 'Allied', options: { ...setup.options, optionalStart: true } });
    const ann = new Device(new LocalDb(store), gid, 'ann');
    const eve = new Device(new LocalDb(store), gid, 'eve'); // a spectator
    await ann.start();
    await eve.start();
    expect(eve.session.controllers).toEqual({ Allied: 'remote', German: 'remote' });
    // Ann has no opponent yet; play both sides from her device to fill more than one chunk.
    const ai = { Allied: createHeuristicAi('recruit'), German: createHeuristicAi('recruit') };
    let last: Action | null = null;
    while (ann.session.local.length < CHUNK + 30 && ann.game.phase !== 'gameOver') {
      last = ai[actingSide(ann.game)].nextAction(ann.game) as Action;
      ann.act(last);
    }
    await until(() => ann.session.status === 'ok', 20000);
    await until(() => (eve.catchUp(), eve.session.local.length === ann.session.local.length), 20000);
    expect(JSON.stringify(eve.game.units)).toBe(JSON.stringify(ann.game.units));
    // A hold order can be taken back; the spectator's screen jumps back with it.
    const unit = Object.values(ann.game.units).find((u) => u.where.kind === 'map' && u.id.startsWith(ann.game.activeSide === 'Allied' ? 'US' : 'GE'));
    if (unit && ['movement', 'combat'].includes(ann.game.phase)) {
      const before = ann.game;
      ann.act({ type: 'hold', unitId: unit.id });
      await until(() => ann.session.status === 'ok');
      await until(() => (eve.catchUp(), eve.game.units[unit.id].holding === true));
      expect(ann.session.canUndo()).toBe(true);
      expect(ann.session.undo(before)).toBe(true);
      expect(ann.game).toBe(before);
      await until(() => ann.session.status === 'ok');
      await until(() => (eve.catchUp(), eve.session.local.length === ann.session.local.length && !eve.game.units[unit.id].holding));
    }
    // The list spills into a second chunk (unless the game ended first).
    const chunks = store.keys().filter((k) => k.startsWith(`games/${gid}/log/`)).length;
    expect(chunks).toBe(Math.ceil(ann.session.local.length / CHUNK));
    // An order taken on a position the screen has since left is refused, as is a replay step from one.
    const stale = ann.game;
    ann.act({ type: 'endPhase' });
    expect(ann.session.push({ type: 'endPhase' }, stale, withAction(stale, { type: 'endPhase' }))).toBe(false);
    await until(() => ann.session.status === 'ok');
    await until(() => eve.session.incoming().length > 0);
    const eveAt = eve.game;
    eve.catchUp();
    expect(eve.session.consumed(eveAt, eveAt)).toBe(false);
    for (const d of [ann, eve]) d.session.stop();
  }, 60000);
});
