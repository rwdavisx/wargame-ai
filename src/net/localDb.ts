// A stand-in for the shared document store, kept in memory (tests) or in this browser's storage (two tabs in
// development). It follows the parts of the real store's contract the game relies on: whole-document writes,
// merge updates, short leases and live snapshots delivered asynchronously.
import type { CollRef, Db, DocRef, DocSnap, Json, Query, QuerySnap, Unsub } from './caps';

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  keys(): string[];
  onChange(fn: (key: string) => void): Unsub;
}

/** One in-memory store; every LocalDb made on it sees the others' writes. */
export function memoryStore(): Store {
  const m = new Map<string, string>();
  const fns = new Set<(k: string) => void>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      if (v === null) m.delete(k);
      else m.set(k, v);
      for (const f of [...fns]) queueMicrotask(() => f(k));
    },
    keys: () => [...m.keys()],
    onChange: (f) => {
      fns.add(f);
      return () => fns.delete(f);
    },
  };
}

/** The browser's local storage, shared by every tab of this origin (storage events carry other tabs' writes;
 *  a window event carries this tab's to every store made in it). */
export function browserStore(prefix = 'fakedb:'): Store {
  const fns = new Set<(k: string) => void>();
  const hear = (k: string) => fns.forEach((f) => setTimeout(() => f(k), 0));
  window.addEventListener('storage', (e) => e.key?.startsWith(prefix) && hear(e.key.slice(prefix.length)));
  window.addEventListener('fakedb', (e) => {
    const d = (e as CustomEvent<{ prefix: string; key: string }>).detail;
    if (d.prefix === prefix) hear(d.key);
  });
  const tell = (key: string) => window.dispatchEvent(new CustomEvent('fakedb', { detail: { prefix, key } }));
  return {
    get: (k) => localStorage.getItem(prefix + k),
    set: (k, v) => {
      if (v === null) localStorage.removeItem(prefix + k);
      else localStorage.setItem(prefix + k, v);
      tell(k);
    },
    keys: () => Object.keys(localStorage).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)),
    onChange: (f) => {
      fns.add(f);
      return () => fns.delete(f);
    },
  };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const LEASE = 'lease:';

export class LocalDb implements Db {
  /** `latency` delays every call, to let tests interleave two players' writes. */
  constructor(private store: Store, private latency = 0) {}

  private async tick() {
    if (this.latency) await wait(this.latency);
  }

  private snap(path: string): DocSnap {
    const raw = this.store.get(path);
    const id = path.split('/').pop()!;
    const body = raw ? (JSON.parse(raw) as Json) : undefined;
    return { id, exists: !!body, data: () => (body ? (JSON.parse(raw!) as Json) : undefined) };
  }

  doc(path: string): DocRef {
    const segs = path.split('/');
    if (segs.length % 2) throw new TypeError(`A document path needs an even number of segments: ${path}`);
    const self = this;
    return {
      id: segs[segs.length - 1],
      path,
      async get() {
        await self.tick();
        return self.snap(path);
      },
      async set(data) {
        await self.tick();
        self.store.set(path, JSON.stringify(data));
      },
      async update(data) {
        await self.tick();
        const cur = self.snap(path).data();
        if (!cur) throw { code: 'invalid_argument', message: 'update needs an existing document' };
        self.store.set(path, JSON.stringify(merge(cur, data)));
      },
      async delete() {
        await self.tick();
        self.store.set(path, null);
      },
      async acquire({ holder, ttlMs = 30000 }) {
        await self.tick();
        const raw = self.store.get(LEASE + path);
        const now = Date.now();
        const cur = raw ? (JSON.parse(raw) as { holder: string; exp: number }) : null;
        if (cur && cur.exp > now && cur.holder !== holder) return { acquired: false, expiresAt: new Date(cur.exp).toISOString() };
        const exp = now + Math.min(600000, Math.max(1000, ttlMs));
        self.store.set(LEASE + path, JSON.stringify({ holder, exp }));
        return { acquired: true, expiresAt: new Date(exp).toISOString() };
      },
      onSnapshot(next) {
        let last: string | null | undefined;
        const deliver = () => {
          const raw = self.store.get(path);
          if (raw === last) return;
          last = raw;
          next(self.snap(path));
        };
        setTimeout(deliver, 0);
        return self.store.onChange((k) => k === path && deliver());
      },
    };
  }

  collection(path: string): CollRef {
    if (!(path.split('/').length % 2)) throw new TypeError(`A collection path needs an odd number of segments: ${path}`);
    const q = this.query(path, null, 'asc', 1000);
    return { ...q, path, doc: (id) => this.doc(`${path}/${id ?? Math.random().toString(36).slice(2, 12)}`) };
  }

  private query(path: string, field: string | null, dir: 'asc' | 'desc', n: number): Query {
    const depth = path.split('/').length + 1;
    const inside = (k: string) => k.startsWith(path + '/') && k.split('/').length === depth;
    const read = (): QuerySnap => {
      let docs = this.store.keys().filter(inside).map((k) => this.snap(k));
      const key = (d: DocSnap) => (field ? (d.data()?.[field] as number | string | undefined) : d.id);
      docs.sort((a, b) => {
        const x = key(a);
        const y = key(b);
        const c = x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1;
        return dir === 'asc' ? c : -c;
      });
      docs = docs.slice(0, n);
      return { docs };
    };
    return {
      orderBy: (f, d = 'asc') => this.query(path, f, d, n),
      limit: (m) => this.query(path, field, dir, m),
      get: async () => {
        await this.tick();
        return read();
      },
      onSnapshot: (next) => {
        let pending = false;
        const deliver = () => {
          if (pending) return;
          pending = true;
          setTimeout(() => {
            pending = false;
            next(read());
          }, 0);
        };
        deliver();
        return this.store.onChange((k) => inside(k) && deliver());
      },
    };
  }
}

function merge(a: Json, b: Json): Json {
  const out: Json = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur) ? merge(cur as Json, v as Json) : v;
  }
  return out;
}
