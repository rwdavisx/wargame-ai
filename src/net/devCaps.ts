// Development only: `?fakenet=<name>` plays online against other tabs of this browser, with a store kept in
// local storage and presence over a broadcast channel. Production builds drop all of this.
import type { Caps, NamedRoom, Peer, Room, UserCap } from './caps';
import { browserStore, LocalDb } from './localDb';

export function devCaps(): Caps | null {
  if (!import.meta.env.DEV) return null;
  const name = new URLSearchParams(location.search).get('fakenet');
  if (!name) return null;
  const me = `dev-${name}`;
  const user: UserCap = {
    id: async () => me,
    can: async () => true,
    me: async () => ({ id: me, name }),
    profiles: async (ids) => Object.fromEntries(ids.map((id) => [id, { name: id.startsWith('dev-') ? id.slice(4) : '' }])),
  };
  const room: Room = {
    async join(roomName) {
      const ch = new BroadcastChannel(`fakeroom:${roomName}`);
      const peerId = Math.random().toString(36).slice(2, 10);
      let mine: Record<string, unknown> = {};
      const others = new Map<string, { presence: Record<string, unknown>; at: number }>();
      const fns = new Set<(c: { peers: readonly Peer[] }) => void>();
      const list = (): Peer[] => [
        { peer: peerId, by: me, isMe: true, presence: mine },
        ...[...others].map(([peer, o]) => ({ peer, by: (o.presence.pid as string) ?? null, isMe: false, presence: o.presence })),
      ];
      const tell = () => fns.forEach((f) => f({ peers: list() }));
      const beat = () => ch.postMessage({ peer: peerId, presence: mine });
      ch.onmessage = (e) => {
        const { peer, presence, gone } = e.data as { peer: string; presence: Record<string, unknown>; gone?: boolean };
        if (gone) others.delete(peer);
        else others.set(peer, { presence, at: Date.now() });
        tell();
      };
      const timer = setInterval(() => {
        beat();
        for (const [p, o] of others) if (Date.now() - o.at > 6000) others.delete(p);
        tell();
      }, 2000);
      const named: NamedRoom = {
        async presence(patch) {
          mine = { ...mine, ...patch };
          beat();
          tell();
        },
        peers: list,
        onPeers(fn) {
          fns.add(fn);
          setTimeout(() => fn({ peers: list() }), 0);
          return () => fns.delete(fn);
        },
        async leave() {
          clearInterval(timer);
          ch.postMessage({ peer: peerId, gone: true });
          ch.close();
        },
      };
      return named;
    },
  };
  return { db: new LocalDb(browserStore(), 60), user, room };
}
