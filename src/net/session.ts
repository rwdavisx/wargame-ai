// Online play. A game is its setup (scenario, seed, options) plus the list of every action taken; the dice come
// from the seed, so every device that replays the list reaches the same position. The list lives in the shared
// store in chunks; each device appends its own player's actions under a short lease and watches for the others'.
import type { Difficulty } from '../ai/heuristic';
import { actingSide, newGame, withAction } from '../engine/game';
import type { Action, GameOptions, GameState, Side } from '../engine/types';
import type { Controller } from '../ui/storage';
import type { Db, DocRef, NamedRoom, Room, Unsub, UserCap } from './caps';

export const CHUNK = 200;
const CHECKPOINT = 40;
const LEASE_MS = 3000;

export type NetMode = 'versus' | 'coop';

/** The game's header document: who sits where, and a summary for the lobby. */
export interface NetHead {
  v: 1;
  title: string;
  mode: NetMode;
  scenario: string;
  seed: number;
  options: GameOptions;
  /** Player id of whoever opened the game. */
  host: string;
  /** Player id → the side they command. Versus: one player a side. Co-op: two players on one side. */
  seats: Record<string, Side>;
  /** Call signs typed by players the platform cannot name. */
  names?: Record<string, string>;
  /** Co-op: the side the computer plays, and how well. */
  aiSide: Side | null;
  aiLevel: Difficulty;
  created: number;
  updated: number;
  turn: number;
  phase: string;
  active: Side;
  /** Actions taken so far (as of the last phase end). */
  n: number;
  over?: boolean;
}

interface Chunk {
  a: Action[];
  by: string[];
}
type Op = { kind: 'push'; a: Action; by: string } | { kind: 'pop' };

export const seatLimit = (h: NetHead) => (h.mode === 'versus' ? 1 : 2);
export const humanSides = (h: NetHead): Side[] => (h.mode === 'versus' ? ['Allied', 'German'] : (['Allied', 'German'] as Side[]).filter((s) => s !== h.aiSide));
export const seatedOn = (h: NetHead, side: Side) => Object.keys(h.seats).filter((id) => h.seats[id] === side).sort();
export const freeSides = (h: NetHead) => humanSides(h).filter((s) => seatedOn(h, s).length < seatLimit(h));
export const chunkId = (k: number) => String(k).padStart(4, '0');

/** Who runs the computer side of a co-op game: the host while it is here, else the first seated player who is. */
export function aiDriver(h: NetHead, online: ReadonlySet<string>): string {
  if (online.has(h.host)) return h.host;
  return Object.keys(h.seats).sort().find((id) => online.has(id)) ?? h.host;
}

/** How this device treats each side: its own player's ('human'), the computer it runs ('heuristic'), or someone else's ('remote'). */
export function controllersFor(h: NetHead, me: string, online: ReadonlySet<string>): Record<Side, Controller> {
  const one = (side: Side): Controller =>
    h.aiSide === side ? (aiDriver(h, online) === me ? 'heuristic' : 'remote') : h.seats[me] === side ? 'human' : 'remote';
  return { Allied: one('Allied'), German: one('German') };
}

/** The game options every device must share: human players pick their own retreats. */
export function sharedOptions(o: GameOptions, mode: NetMode, aiSide: Side | null): GameOptions {
  const sides: Side[] = mode === 'versus' ? ['Allied', 'German'] : (['Allied', 'German'] as Side[]).filter((s) => s !== aiSide);
  return { ...o, chooseRetreats: sides, defensiveAir: { Allied: 'auto', German: 'auto' } };
}

/** Plain JSON, as the store keeps it (undefined fields dropped). */
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const key = (a: unknown) => JSON.stringify(a, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1))) : v));
const same = (a: Action, b: Action) => a === b || key(a) === key(b);
function common(a: readonly Action[], b: readonly Action[]): number {
  let i = 0;
  while (i < a.length && i < b.length && same(a[i], b[i])) i++;
  return i;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Actions that roll no dice and touch only their own units: safe to replay on top of a partner's moves. */
const REBASE = new Set(['move', 'enter', 'land', 'naval', 'changeArea', 'hold', 'sleep', 'wake', 'readyAsu', 'replace']);
const UNDO = new Set(['move', 'enter', 'land', 'naval', 'changeArea', 'fullRetreat', 'replace', 'readyAsu', 'btMove', 'btDrop', 'hold', 'sleep', 'wake']);

export interface Notice {
  id: number;
  text: string;
}

export class NetSession {
  head: NetHead | null = null;
  /** Every action as this device has it: the shared list plus its own not yet written. */
  local: Action[] = [];
  by: string[] = [];
  /** How many of `local` the screen shows; the rest are the other players' actions still to play out. */
  shown = 0;
  /** The position the screen shows (after the first `shown` actions). Kept here so it and `shown` move together. */
  game: GameState | null = null;
  ready = false;
  status: 'ok' | 'saving' | 'offline' = 'ok';
  notice: Notice | null = null;
  online = new Set<string>();
  controllers: Record<Side, Controller> = { Allied: 'remote', German: 'remote' };
  version = 0;
  /** To put names to the players' ids. */
  user: UserCap | null = null;

  private server: Chunk = { a: [], by: [] };
  private queue: Op[] = [];
  private writing = false;
  private stopped = false;
  private unsubs: Unsub[] = [];
  private room: NamedRoom | null = null;
  private checkpoints = new Map<number, GameState>();
  private fns = new Set<() => void>();
  private readonly holder = Math.random().toString(36).slice(2, 12);
  private headRef: DocRef;

  constructor(private db: Db, readonly gid: string, readonly me: string, private roomCap: Room | null = null) {
    this.headRef = db.doc(`games/${gid}`);
    this.online.add(me);
  }

  subscribe = (fn: () => void) => {
    this.fns.add(fn);
    return () => {
      this.fns.delete(fn);
    };
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    if (this.head) {
      const c = controllersFor(this.head, this.me, this.online);
      if (c.Allied !== this.controllers.Allied || c.German !== this.controllers.German) this.controllers = c;
    }
    for (const f of [...this.fns]) f();
  }
  private say(text: string) {
    this.notice = { id: (this.notice?.id ?? 0) + 1, text };
  }

  /** Watch the game; resolves once its header and actions have arrived. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let gotHead = false;
      let gotLog = false;
      const check = () => {
        if (gotHead && gotLog && !this.ready) {
          this.ready = true;
          this.adopt(this.server.a, this.server.by, true);
          resolve();
        }
      };
      this.unsubs.push(this.headRef.onSnapshot((s) => {
        if (!s.exists) {
          if (!gotHead) reject(new Error('This game no longer exists.'));
          return;
        }
        this.head = s.data() as unknown as NetHead;
        gotHead = true;
        check();
        this.emit();
      }, (e) => reject(new Error(e.message))));
      this.unsubs.push(this.db.collection(`games/${this.gid}/log`).onSnapshot((q) => {
        const chunks = q.docs.filter((d) => d.exists).sort((x, y) => (x.id < y.id ? -1 : 1)).map((d) => d.data() as unknown as Chunk);
        const a = chunks.flatMap((c) => c.a ?? []);
        const by = chunks.flatMap((c) => c.by ?? []);
        gotLog = true;
        if (!this.ready) {
          this.server = { a, by };
          check();
          return;
        }
        this.fromServer(a, by);
      }, (e) => reject(new Error(e.message))));
      this.joinRoom();
    });
  }

  private async joinRoom() {
    if (!this.roomCap) return;
    try {
      const r = await this.roomCap.join(`g-${this.gid}`);
      if (this.stopped) return void r.leave();
      this.room = r;
      await r.presence({ pid: this.me });
      this.unsubs.push(r.onPeers(({ peers }) => {
        const ids = new Set<string>([this.me]);
        for (const p of peers) {
          const pid = typeof p.presence.pid === 'string' ? p.presence.pid : p.by;
          if (pid) ids.add(pid);
        }
        if ([...ids].join() !== [...this.online].join()) {
          this.online = ids;
          this.emit();
        }
      }));
    } catch {
      /* no presence: the host runs the computer */
    }
  }

  stop() {
    this.stopped = true;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.room?.leave().catch(() => {});
    this.fns.clear();
  }

  // ------------------------------------------------------------------ positions

  /** The position after the first `n` actions of `local`. */
  stateAt(n: number): GameState {
    const h = this.head!;
    let at = 0;
    let s: GameState | null = null;
    for (const [k, st] of this.checkpoints) if (k <= n && k >= at) {
      at = k;
      s = st;
    }
    s = s ? structuredClone(s) : newGame(h.scenario, h.seed, h.options);
    for (let i = at; i < n; i++) {
      s = withAction(s, this.local[i]);
      if ((i + 1) % CHECKPOINT === 0) this.checkpoints.set(i + 1, structuredClone(s));
    }
    return s;
  }
  private forgetAfter(n: number) {
    for (const k of [...this.checkpoints.keys()]) if (k > n) this.checkpoints.delete(k);
  }

  /** Take the shared list as it is; the screen jumps back if it showed something the list no longer has. */
  private adopt(a: Action[], by: string[], first = false) {
    const keep = common(this.local, a);
    this.forgetAfter(keep);
    this.local = [...a];
    this.by = [...by];
    this.server = { a: [...a], by: [...by] };
    if (first) {
      this.shown = a.length;
      this.game = this.stateAt(a.length);
    } else if (this.shown > keep) {
      // The screen showed something the shared game no longer has: it jumps back and plays on from there.
      this.shown = keep;
      this.game = this.stateAt(keep);
    }
    this.emit();
  }

  private fromServer(a: Action[], by: string[]) {
    if (this.writing || this.queue.length) return; // the writer reconciles when it finishes
    if (a.length === this.server.a.length && common(a, this.server.a) === a.length) return;
    this.adopt(a, by);
  }

  // ------------------------------------------------------------------ the screen's side

  /** The other players' actions the screen has still to play out. */
  incoming(): Action[] {
    return this.local.slice(this.shown);
  }
  /** The screen has played out the first incoming action, from `base` (the position it showed) to `next`. */
  consumed(base: GameState, next: GameState): boolean {
    if (base !== this.game || this.shown >= this.local.length) return false;
    this.shown++;
    this.game = next;
    this.emit();
    return true;
  }
  /** This player's action, taken on `base` (the position the screen showed) and leading to `next`. Refused when the
   *  screen was behind the shared game. */
  push(a: Action, base: GameState, next: GameState): boolean {
    if (base !== this.game || this.shown !== this.local.length) return false;
    const clean = plain(a);
    this.game = next;
    this.local.push(clean);
    this.by.push(this.me);
    this.shown = this.local.length;
    this.queue.push({ kind: 'push', a: clean, by: this.me });
    this.emit();
    void this.flush();
    return true;
  }
  canUndo(): boolean {
    const i = this.local.length - 1;
    return i >= 0 && this.shown === this.local.length && this.by[i] === this.me && UNDO.has(this.local[i].type);
  }
  /** Take back this player's last action; the screen goes back to `prev`. */
  undo(prev: GameState): boolean {
    if (!this.canUndo()) return false;
    this.game = prev;
    this.local.pop();
    this.by.pop();
    this.forgetAfter(this.local.length);
    this.shown = this.local.length;
    this.queue.push({ kind: 'pop' });
    this.emit();
    void this.flush();
    return true;
  }

  // ------------------------------------------------------------------ writing

  private chunkRef(k: number) {
    return this.db.doc(`games/${this.gid}/log/${chunkId(k)}`);
  }

  private async flush() {
    if (this.writing || this.stopped) return;
    this.writing = true;
    this.status = 'saving';
    this.emit();
    let failures = 0;
    try {
      while (this.queue.length && !this.stopped) {
        try {
          const lease = await this.headRef.acquire({ holder: this.holder, ttlMs: LEASE_MS });
          if (!lease.acquired) {
            const until = lease.expiresAt ? Date.parse(lease.expiresAt) - Date.now() : 500;
            await sleep(Math.min(LEASE_MS, Math.max(150, until)));
            continue;
          }
          const base = this.server.a.length;
          const op = this.queue[0];
          const k = op.kind === 'push' ? Math.floor(base / CHUNK) : Math.floor((base - 1) / CHUNK);
          const snap = await this.chunkRef(k).get();
          const cur = (snap.exists ? snap.data() : { a: [], by: [] }) as unknown as Chunk;
          const mine = this.server.a.slice(k * CHUNK, base);
          if (cur.a.length !== mine.length || common(cur.a, mine) !== mine.length) {
            await this.clash();
            continue;
          }
          const a = [...cur.a];
          const by = [...cur.by];
          let n = 0;
          let phaseEnd = false;
          for (const o of this.queue) {
            if (o.kind === 'push') {
              if (a.length >= CHUNK) break;
              a.push(o.a);
              by.push(o.by);
              if (o.a.type === 'endPhase') phaseEnd = true;
            } else {
              if (!a.length) break;
              a.pop();
              by.pop();
            }
            n++;
          }
          await this.chunkRef(k).set({ a, by });
          this.server = { a: [...this.server.a.slice(0, k * CHUNK), ...a], by: [...this.server.by.slice(0, k * CHUNK), ...by] };
          this.queue.splice(0, n);
          failures = 0;
          if (phaseEnd || !this.queue.length) await this.summarize(phaseEnd);
        } catch (e) {
          failures++;
          this.status = 'offline';
          this.emit();
          await sleep(Math.min(15000, 1000 * 2 ** Math.min(failures, 4)));
        }
      }
    } finally {
      this.writing = false;
      this.status = this.queue.length ? 'offline' : 'ok';
      this.emit();
    }
    // Anything the other players wrote meanwhile.
    if (!this.stopped && !this.queue.length) {
      try {
        const q = await this.db.collection(`games/${this.gid}/log`).get();
        const chunks = q.docs.filter((d) => d.exists).sort((x, y) => (x.id < y.id ? -1 : 1)).map((d) => d.data() as unknown as Chunk);
        if (!this.writing && !this.queue.length) this.fromServer(chunks.flatMap((c) => c.a ?? []), chunks.flatMap((c) => c.by ?? []));
      } catch {
        /* the live snapshot will bring it */
      }
    }
  }

  /** Lobby summary, written at phase ends (and when the game ends). */
  private async summarize(phaseEnd: boolean) {
    const n = this.server.a.length;
    if (!phaseEnd && n % 25) return;
    const s = this.stateAt(Math.min(n, this.local.length));
    await this.headRef.update({ n, turn: s.turn, phase: s.phase, active: actingSide(s), over: s.phase === 'gameOver', updated: Date.now() });
  }

  /** Someone else wrote first: take their actions, then replay this player's on top if that is still sound. */
  private async clash() {
    const q = await this.db.collection(`games/${this.gid}/log`).get();
    const chunks = q.docs.filter((d) => d.exists).sort((x, y) => (x.id < y.id ? -1 : 1)).map((d) => d.data() as unknown as Chunk);
    const a = chunks.flatMap((c) => c.a ?? []);
    const by = chunks.flatMap((c) => c.by ?? []);
    const ops = this.queue;
    this.queue = [];
    let replay: Action[] | null = ops.every((o) => o.kind === 'push' && REBASE.has(o.a.type)) ? ops.map((o) => (o as { a: Action }).a) : null;
    this.adopt(a, by);
    if (replay) {
      try {
        let s = this.stateAt(a.length);
        for (const x of replay) s = withAction(s, x);
      } catch {
        replay = null;
      }
    }
    if (replay?.length) {
      // Same moves, on top of the other player's: the screen plays theirs, then these again.
      for (const x of replay) {
        this.local.push(x);
        this.by.push(this.me);
        this.queue.push({ kind: 'push', a: x, by: this.me });
      }
    } else if (ops.length) {
      this.say('The other player acted at the same moment: your last order was taken back. Please give it again.');
    }
    this.emit();
  }
}

// ------------------------------------------------------------------ the lobby's side

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function createGame(db: Db, me: string, setup: {
  title: string; mode: NetMode; side: Side; scenario: string; options: GameOptions; aiLevel: Difficulty; name?: string;
}): Promise<string> {
  const gid = newId();
  const aiSide = setup.mode === 'coop' ? (setup.side === 'Allied' ? 'German' : 'Allied') : null;
  const options = sharedOptions(setup.options, setup.mode, aiSide);
  const seed = Math.floor(Math.random() * 2147483646) + 1;
  const g = newGame(setup.scenario, seed, options);
  const now = Date.now();
  const head: NetHead = {
    v: 1, title: setup.title, mode: setup.mode, scenario: setup.scenario, seed, options, host: me, seats: { [me]: setup.side },
    ...(setup.name ? { names: { [me]: setup.name } } : {}),
    aiSide, aiLevel: setup.aiLevel, created: now, updated: now, turn: g.turn, phase: g.phase, active: actingSide(g), n: 0,
  };
  await db.doc(`games/${gid}`).set(plain(head) as unknown as Record<string, unknown>);
  return gid;
}

/** Take a free seat on `side` (under the header's lease, so two friends cannot both take the last one). */
export async function claimSeat(db: Db, gid: string, me: string, side: Side, name?: string): Promise<void> {
  const ref = db.doc(`games/${gid}`);
  const holder = `seat-${me}`;
  for (let tries = 0; tries < 8; tries++) {
    const lease = await ref.acquire({ holder, ttlMs: 2000 });
    if (!lease.acquired) {
      await sleep(400);
      continue;
    }
    const snap = await ref.get();
    if (!snap.exists) throw new Error('This game no longer exists.');
    const h = snap.data() as unknown as NetHead;
    if (h.seats[me] === side) return;
    if (h.seats[me]) throw new Error('You already have a seat in this game.');
    if (!humanSides(h).includes(side) || seatedOn(h, side).length >= seatLimit(h)) throw new Error('That seat has just been taken.');
    await ref.update({ seats: { [me]: side }, ...(name ? { names: { [me]: name } } : {}), updated: Date.now() });
    return;
  }
  throw new Error('The game is busy; try again in a moment.');
}

export async function deleteGame(db: Db, gid: string): Promise<void> {
  const q = await db.collection(`games/${gid}/log`).get();
  for (const d of q.docs) await db.doc(`games/${gid}/log/${d.id}`).delete();
  await db.doc(`games/${gid}`).delete();
}

/** What the battle screen needs from an online game. */
export interface NetLink {
  /** The other players' actions still to play out on this screen, oldest first. */
  incoming: readonly Action[];
  /** This player's action, taken on `base` and leading to `next`; false when the screen was behind. */
  push(a: Action, base: GameState, next: GameState): boolean;
  /** The first incoming action has been played out, from `base` to `next`; false when the screen was behind. */
  consumed(base: GameState, next: GameState): boolean;
  canUndo: boolean;
  undo(prev: GameState): void;
  status: 'ok' | 'saving' | 'offline';
  notice: Notice | null;
  /** Who commands `side`, in words ("Ann", "the computer"). */
  who(side: Side): string;
  /** The other players and whether they are here, for the badge. */
  others: { name: string; side: Side; here: boolean }[];
}
