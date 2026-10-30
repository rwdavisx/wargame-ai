// The shared-page capabilities online play runs on: a shared document store (`db`), who is viewing (`user`)
// and who is here right now (`room`). Only the parts the game uses are typed here.
import { devCaps } from './devCaps';

export type Json = Record<string, unknown>;

export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Json | undefined;
}
export interface QuerySnap {
  docs: DocSnap[];
}
export type Unsub = () => void;
export interface DbError {
  code: string;
  message: string;
}
export interface DocRef {
  id: string;
  path: string;
  get(): Promise<DocSnap>;
  set(data: Json): Promise<void>;
  update(data: Json): Promise<void>;
  delete(): Promise<void>;
  acquire(o: { holder: string; ttlMs?: number }): Promise<{ acquired: boolean; expiresAt?: string }>;
  onSnapshot(next: (s: DocSnap) => void, error?: (e: DbError) => void): Unsub;
}
export interface Query {
  orderBy(field: string, dir?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
  onSnapshot(next: (s: QuerySnap) => void, error?: (e: DbError) => void): Unsub;
}
export interface CollRef extends Query {
  path: string;
  doc(id?: string): DocRef;
}
export interface Db {
  doc(path: string): DocRef;
  collection(path: string): CollRef;
}

export interface Peer {
  peer: string;
  by: string | null;
  isMe: boolean;
  presence: Readonly<Record<string, unknown>>;
}
export interface NamedRoom {
  presence(patch: Json): Promise<void>;
  peers(): readonly Peer[];
  onPeers(fn: (c: { peers: readonly Peer[] }) => void, onError?: (e: DbError) => void): Unsub;
  leave(): Promise<void>;
}
export interface Room {
  join(name: string): Promise<NamedRoom>;
}

export interface UserCap {
  id(): Promise<string | null>;
  can(name: string): Promise<boolean | null>;
  me(): Promise<{ id: string | null; name: string }>;
  profiles(ids: readonly string[]): Promise<Record<string, { name: string }>>;
}

export interface Caps {
  db: Db | null;
  user: UserCap | null;
  room: Room | null;
}

interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

/**
 * The capabilities this page was given, or null when it is not running as a shared claude.ai page at all.
 * In development `?fakenet` stands in for them with a store kept in this browser (two tabs can play each other).
 */
export async function loadCaps(): Promise<Caps | null> {
  const dev = devCaps();
  if (dev) return dev;
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!host?.use) return null;
  const take = <T,>(name: string) => host.use(name).then((x) => (x ?? null) as T | null, () => null);
  const [db, user, room] = await Promise.all([take<Db>('db'), take<UserCap>('user'), take<Room>('room')]);
  return { db, user, room };
}
