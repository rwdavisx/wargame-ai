// Background music: a shuffled playlist of the tracks bundled in /music and the player's own files.
// Tracks are decoded with Web Audio from their bytes (no <audio> element, no blob: URLs), so they also
// play inside the sandboxed single-file build. Only the playing track is kept in memory.

export interface Track {
  id: string;
  title: string;
  /** Who made it and under what licence (bundled tracks). */
  credit?: string;
  mine: boolean;
}

interface Source extends Track {
  load: () => Promise<ArrayBuffer>;
}

// ---------------------------------------------------------------- bundled tracks (music/*.ogg|mp3 + music/credits.json)

const files = import.meta.glob('../../music/*.{ogg,oga,mp3,m4a,opus,wav}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const creditFiles = import.meta.glob('../../music/credits.json', { import: 'default', eager: true }) as Record<string, Record<string, { title?: string; credit?: string }>>;
const credits = Object.values(creditFiles)[0] ?? {};

function bytesOf(url: string): Promise<ArrayBuffer> {
  // The single-file build inlines the tracks as data: URLs, which the sandbox will not fetch: decode them here.
  if (url.startsWith('data:')) {
    const b64 = url.slice(url.indexOf(',') + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return Promise.resolve(out.buffer);
  }
  return fetch(url).then((r) => r.arrayBuffer());
}

const titleOf = (file: string) => file.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();

const bundled: Source[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url]) => {
    const file = path.split('/').pop()!;
    const c = credits[file] ?? {};
    return { id: `b:${file}`, title: c.title ?? titleOf(file), credit: c.credit, mine: false, load: () => bytesOf(url) };
  });

// ---------------------------------------------------------------- the player's own tracks (IndexedDB)

const DB = 's43-music';
const STORE = 'tracks';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = run(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

interface Stored { id: string; title: string; data: ArrayBuffer }

let mine: Source[] = [];

async function loadMine(): Promise<void> {
  try {
    const all = await tx<{ id: string; title: string }[]>('readonly', (s) => s.getAll() as IDBRequest<{ id: string; title: string }[]>);
    mine = all.map((t) => ({
      id: t.id, title: t.title, mine: true,
      load: () => tx<Stored>('readonly', (s) => s.get(t.id) as IDBRequest<Stored>).then((r) => r.data),
    }));
  } catch {
    mine = [];
  }
  changed();
}

/** Keep music files the player picks (stored in this browser only). */
export async function addMusicFiles(list: FileList | File[]): Promise<number> {
  let n = 0;
  for (const f of Array.from(list)) {
    if (!f.type.startsWith('audio/') && !/\.(ogg|oga|mp3|m4a|opus|wav|flac)$/i.test(f.name)) continue;
    const data = await f.arrayBuffer();
    const id = `m:${Date.now()}:${n}:${f.name}`;
    try {
      await tx('readwrite', (s) => s.put({ id, title: titleOf(f.name), data } satisfies Stored));
      n++;
    } catch {
      // Out of storage: skip it.
    }
  }
  await loadMine();
  if (n && !playing && on) void next();
  return n;
}

export async function removeMusicTrack(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    // ignore
  }
  if (current?.id === id) stopCurrent(0.4);
  await loadMine();
}

// ---------------------------------------------------------------- playback

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let on = true;
let volume = 0.35;
let started = false;
let playing: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let current: Source | null = null;
let order: string[] = [];
let timer: number | undefined;
let loading = false;

const listeners = new Set<() => void>();
let snapshot = { tracks: [] as Track[], current: null as Track | null, loading: false };
function changed() {
  snapshot = {
    tracks: [...bundled, ...mine].map(({ id, title, credit, mine: m }) => ({ id, title, credit, mine: m })),
    current: current ? { id: current.id, title: current.title, credit: current.credit, mine: current.mine } : null,
    loading,
  };
  for (const l of listeners) l();
}
export function subscribeMusic(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const musicState = () => snapshot;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      out = ctx.createGain();
      out.gain.value = on ? volume : 0;
      out.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function stopCurrent(fade: number) {
  const p = playing;
  playing = null;
  window.clearTimeout(timer);
  if (!p || !ctx) return;
  const t = ctx.currentTime;
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + fade);
  p.src.onended = null;
  p.src.stop(t + fade + 0.05);
}

/** Play the next track of the shuffled playlist (fading out the one playing). */
export async function next(): Promise<void> {
  const all = [...bundled, ...mine];
  if (!all.length || loading) return;
  const a = audio();
  if (!a || !out) return;
  if (!order.length) {
    order = all.map((t) => t.id).sort(() => Math.random() - 0.5);
    if (current && order.length > 1 && order[0] === current.id) order.push(order.shift()!);
  }
  const pick = all.find((t) => t.id === order.shift()) ?? all[0];
  stopCurrent(2);
  loading = true;
  current = pick;
  changed();
  try {
    const buf = await a.decodeAudioData(await pick.load());
    if (current !== pick || !on) return;
    const src = a.createBufferSource();
    src.buffer = buf;
    const gain = a.createGain();
    const t = a.currentTime + 0.1;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 3);
    src.connect(gain).connect(out);
    src.start(t);
    playing = { src, gain };
    // Fade out near the end, then a short silence before the next track.
    const fadeAt = Math.max(0, buf.duration - 4);
    gain.gain.setValueAtTime(1, t + fadeAt);
    gain.gain.linearRampToValueAtTime(0, t + buf.duration);
    src.onended = () => {
      if (playing?.src !== src) return;
      playing = null;
      timer = window.setTimeout(() => void next(), 4000);
    };
  } catch {
    // A file that will not decode: skip it.
    if (current === pick) timer = window.setTimeout(() => void next(), 500);
  } finally {
    loading = false;
    changed();
  }
}

/** Music on or off and its volume (0..1), from the settings. */
export function setMusic(enabled: boolean, vol: number): void {
  on = enabled;
  volume = vol;
  if (out && ctx) out.gain.setTargetAtTime(enabled ? vol : 0, ctx.currentTime, 0.15);
  if (!enabled && playing) {
    stopCurrent(1);
    current = null;
    changed();
  } else if (enabled && started && !playing && !loading) void next();
}

/** Start the music on the first tap or key press (browsers only allow sound after one). */
export function initMusic(): void {
  if (typeof window === 'undefined' || started) return;
  void loadMine();
  changed();
  const go = () => {
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    started = true;
    if (on && !playing) void next();
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
  // Quiet while the game is in the background (a phone's other app, another tab).
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
}
