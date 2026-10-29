// Map modes, as in grand-strategy games: one at a time, each shading the hexes to answer one question
// (where is supply, who holds what, where are the zones of control...). Pure: state in, shapes out.
import { MAP, RULES } from '../engine/data';
import { inNavalRange } from '../engine/combat';
import { distance, neighbors, type HexId } from '../engine/hex';
import { supplyChecker, supplySources } from '../engine/supply';
import type { GameState, Side } from '../engine/types';
import { def, other, sideOf, stackPoints } from '../engine/units';
import { bondsOf, zocOf } from '../engine/zoc';
import { center, corners, edge } from './render/geom';

export type MapMode = 'normal' | 'supply' | 'control' | 'zoc' | 'support' | 'terrain' | 'stacking';

export const MAP_MODES: { key: MapMode; label: string; note: string }[] = [
  { key: 'normal', label: 'Normal', note: 'The painted map' },
  { key: 'supply', label: 'Supply', note: 'Where your units are in or out of supply' },
  { key: 'control', label: 'Control', note: 'Ground held, the front line and VP hexes' },
  { key: 'zoc', label: 'Zones of control', note: 'Enemy ZOC and ZOC Bonds' },
  { key: 'support', label: 'Support range', note: 'Naval gunfire and artillery reach' },
  { key: 'terrain', label: 'Terrain', note: 'Movement costs and hexsides' },
  { key: 'stacking', label: 'Stacking', note: 'Stacking points used per hex' },
];

/** A legend swatch: a hex filled and outlined, a line, or a ring. */
export interface Swatch {
  kind: 'hex' | 'line' | 'ring';
  fill?: string;
  stroke?: string;
  dash?: string;
}

export interface ModeLayer {
  /** Hex groups, each one SVG path. */
  fills: { d: string; fill: string; stroke?: string; width?: number }[];
  /** Hexside lines (front line, boundaries, bonds), drawn with a dark halo. */
  lines: { d: string; stroke: string; width: number; dash?: string }[];
  /** Small rings (supply sources). */
  rings: { x: number; y: number; stroke: string }[];
  /** Chips drawn above the counters (stacking points). */
  labels: { x: number; y: number; text: string; fill: string; ink: string }[];
  legend: { swatch: Swatch; label: string }[];
  note?: string;
}

const land = () => Object.keys(MAP.hexes).filter((h) => MAP.hexes[h].terrain !== 'sea');
let landCache: HexId[] | null = null;
const landHexes = () => (landCache ??= land());

function hexPath(hexes: Iterable<HexId>, inset = 0.6): string {
  let d = '';
  for (const h of hexes) {
    const [cx, cy] = center(h);
    const c = corners(h).map(([x, y]) => [cx + (x - cx) * (1 - inset / 30), cy + (y - cy) * (1 - inset / 30)]);
    d += `M${c.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
  }
  return d;
}

/** The outer edge of a set of hexes. */
function outline(set: Set<HexId>): string {
  let d = '';
  for (const h of set) {
    for (const n of neighbors(h)) {
      if (set.has(n)) continue;
      const e = edge(h, n);
      if (e) d += `M${e[0][0].toFixed(1)},${e[0][1].toFixed(1)}L${e[1][0].toFixed(1)},${e[1][1].toFixed(1)}`;
    }
  }
  return d;
}

/** The hexsides between two sets of hexes. */
function between(a: Set<HexId>, b: Set<HexId>): string {
  let d = '';
  for (const h of a) {
    for (const n of neighbors(h)) {
      if (!b.has(n)) continue;
      const e = edge(h, n);
      if (e) d += `M${e[0][0].toFixed(1)},${e[0][1].toFixed(1)}L${e[1][0].toFixed(1)},${e[1][1].toFixed(1)}`;
    }
  }
  return d;
}

function unitHexes(s: GameState, side?: Side): Set<HexId> {
  const out = new Set<HexId>();
  for (const u of Object.values(s.units)) if (u.where.kind === 'map' && (!side || sideOf(u) === side)) out.add(u.where.hex);
  return out;
}

/** Land hexes within `r` of a set of hexes. */
function around(hexes: Iterable<HexId>, r: number): Set<HexId> {
  const out = new Set<HexId>();
  let ring = [...hexes];
  for (const h of ring) out.add(h);
  for (let i = 0; i < r; i++) {
    const next: HexId[] = [];
    for (const h of ring) for (const n of neighbors(h)) if (!out.has(n) && MAP.hexes[n] && MAP.hexes[n].terrain !== 'sea') { out.add(n); next.push(n); }
    ring = next;
  }
  return out;
}

const empty = (): ModeLayer => ({ fills: [], lines: [], rings: [], labels: [], legend: [] });

// ------------------------------------------------------------------ supply

function supplyLayer(s: GameState, side: Side): ModeLayer {
  const limited = side === 'Allied' && !!s.options?.limitedPortSupply;
  const sc = supplyChecker(s, side, { ports: !limited });
  const own = unitHexes(s, side);
  // Only the ground around your units: a full-map trace is too slow to redo after every move.
  const near = around(own, 3);
  const ok = new Set<HexId>();
  const out = new Set<HexId>();
  const iso = new Set<HexId>();
  for (const h of near) (sc.inSupply(h) ? ok : out).add(h);
  for (const h of own) if (out.has(h) && !sc.hasLoc(h)) iso.add(h);
  for (const h of iso) out.delete(h);
  const L = empty();
  L.fills.push({ d: hexPath(ok), fill: 'rgba(120,214,100,0.36)' });
  L.fills.push({ d: hexPath(out), fill: 'url(#mode-hatch-amber)', stroke: 'rgba(242,198,58,0.75)', width: 0.8 });
  L.fills.push({ d: hexPath(iso), fill: 'url(#mode-hatch-red)', stroke: 'rgba(214,58,40,0.9)', width: 1.2 });
  L.lines.push({ d: outline(ok), stroke: '#8fe07a', width: 1.8 });
  L.lines.push({ d: between(ok, new Set([...out, ...iso])), stroke: '#f2c63a', width: 2.4 });
  for (const h of supplySources(s, side, { ports: !limited })) {
    if (!MAP.hexes[h]) continue;
    // At the top of the hex, clear of any counter standing on it.
    const [x, y] = center(h);
    L.rings.push({ x, y: y - 22, stroke: '#f2d78f' });
  }
  L.legend = [
    { swatch: { kind: 'hex', fill: 'rgba(120,214,100,0.55)', stroke: '#8fe07a' }, label: 'In supply' },
    { swatch: { kind: 'hex', fill: 'url(#mode-hatch-amber)', stroke: '#f2c63a' }, label: 'Out of supply' },
    { swatch: { kind: 'hex', fill: 'url(#mode-hatch-red)', stroke: '#d63a28' }, label: 'Isolated unit' },
    { swatch: { kind: 'ring', stroke: '#f2d78f' }, label: 'Supply source' },
  ];
  L.note = `${side} supply as traced now, within 3 hexes of your units.`;
  return L;
}

// ------------------------------------------------------------------ control

function controlLayer(s: GameState): ModeLayer {
  // Ground held: each land hex goes to the side whose units are nearer (up to 6 hexes away); ties are no man's land.
  const dist = { Allied: new Map<HexId, number>(), German: new Map<HexId, number>() };
  for (const side of ['Allied', 'German'] as const) {
    const m = dist[side];
    let ring = [...unitHexes(s, side)];
    for (const h of ring) m.set(h, 0);
    for (let i = 1; i <= 6; i++) {
      const next: HexId[] = [];
      for (const h of ring) {
        for (const n of neighbors(h)) {
          if (m.has(n) || !MAP.hexes[n] || MAP.hexes[n].terrain === 'sea') continue;
          // Ground does not spread through the other side's units.
          if (dist[other(side)].get(n) === 0) continue;
          m.set(n, i);
          next.push(n);
        }
      }
      ring = next;
    }
  }
  const allied = new Set<HexId>();
  const german = new Set<HexId>();
  const noMansLand = new Set<HexId>();
  for (const h of landHexes()) {
    const a = dist.Allied.get(h) ?? 99;
    const g = dist.German.get(h) ?? 99;
    if (a < g) allied.add(h);
    else if (g < a) german.add(h);
    else if (a < 99) noMansLand.add(h);
  }
  const L = empty();
  L.fills.push({ d: hexPath(allied), fill: 'rgba(150,205,70,0.4)' });
  L.fills.push({ d: hexPath(german), fill: 'rgba(170,190,205,0.42)' });
  const vpA = new Set<HexId>();
  const vpG = new Set<HexId>();
  for (const [h, d] of Object.entries(MAP.hexes)) if (d.vp || d.city || d.port) ((s.control[h] ?? 'German') === 'Allied' ? vpA : vpG).add(h);
  L.fills.push({ d: hexPath(vpA, 1.6), fill: 'rgba(143,176,74,0.35)', stroke: '#b7d36b', width: 2.6 });
  L.fills.push({ d: hexPath(vpG, 1.6), fill: 'rgba(150,170,185,0.35)', stroke: '#e3eaee', width: 2.6 });
  const sector = new Set(landHexes().filter((h) => MAP.hexes[h].sector8));
  const fifth = new Set(landHexes().filter((h) => !MAP.hexes[h].sector8));
  L.lines.push({ d: between(sector, fifth), stroke: '#f3cf4a', width: 3, dash: '8 4' });
  // The front runs along the Allied edge, through no man's land where the two sides are equally near.
  L.lines.push({ d: between(allied, new Set([...german, ...noMansLand])), stroke: '#ef5a3c', width: 3.2 });
  L.legend = [
    { swatch: { kind: 'hex', fill: 'rgba(143,176,74,0.6)' }, label: 'Allied ground' },
    { swatch: { kind: 'hex', fill: 'rgba(150,170,185,0.6)' }, label: 'German ground' },
    { swatch: { kind: 'line', stroke: '#ef5a3c' }, label: 'Front line' },
    { swatch: { kind: 'hex', fill: 'rgba(0,0,0,0)', stroke: '#e3eaee' }, label: 'City, port or VP hex (holder)' },
    { swatch: { kind: 'line', stroke: '#f3cf4a', dash: '4 2' }, label: '5th / 8th Army boundary' },
  ];
  return L;
}

// ------------------------------------------------------------------ zones of control

function zocLayer(s: GameState, side: Side): ModeLayer {
  const enemy = other(side);
  const ez = zocOf(s, enemy);
  const fz = zocOf(s, side);
  const bonds = bondsOf(s, enemy);
  const L = empty();
  L.fills.push({ d: hexPath([...fz].filter((h) => !ez.has(h))), fill: 'rgba(123,224,160,0.3)' });
  L.fills.push({ d: hexPath(ez), fill: 'url(#mode-hatch-red)', stroke: 'rgba(239,90,60,0.6)', width: 0.8 });
  L.fills.push({ d: hexPath(bonds.hexes, 2), fill: 'rgba(214,58,40,0.35)', stroke: '#ff8a6a', width: 2.4 });
  let sides = '';
  for (const k of bonds.sides) {
    const [a, b] = k.split('-');
    const e = edge(a, b);
    if (e) sides += `M${e[0][0].toFixed(1)},${e[0][1].toFixed(1)}L${e[1][0].toFixed(1)},${e[1][1].toFixed(1)}`;
  }
  L.lines.push({ d: sides, stroke: '#ff8a6a', width: 4 });
  L.legend = [
    { swatch: { kind: 'hex', fill: 'url(#mode-hatch-red)', stroke: '#ef5a3c' }, label: 'Enemy ZOC: stop on entering' },
    { swatch: { kind: 'hex', fill: 'rgba(214,58,40,0.6)', stroke: '#ff8a6a' }, label: 'Enemy ZOC Bond hex: no entry' },
    { swatch: { kind: 'line', stroke: '#ff8a6a' }, label: 'Bond hexside: no crossing' },
    { swatch: { kind: 'hex', fill: 'rgba(123,224,160,0.4)' }, label: 'Your ZOC' },
  ];
  return L;
}

// ------------------------------------------------------------------ support

function supportLayer(s: GameState, side: Side): ModeLayer {
  const naval = new Set(landHexes().filter(inNavalRange));
  const art = new Set<HexId>();
  let ready = 0;
  for (const u of Object.values(s.units)) {
    const d = def(u.id);
    if (u.where.kind !== 'map' || sideOf(u) !== side || !d.asu || !d.asuRange || u.fired || u.status !== 'good') continue;
    ready++;
    const from = u.where.hex;
    for (const h of landHexes()) if (distance(from, h) <= d.asuRange) art.add(h);
  }
  const L = empty();
  L.fills.push({ d: hexPath(naval), fill: 'rgba(79,159,208,0.24)' });
  L.lines.push({ d: outline(naval), stroke: '#7fc4ef', width: 2.2 });
  L.fills.push({ d: hexPath(art), fill: 'url(#mode-hatch-amber)' });
  L.lines.push({ d: outline(art), stroke: '#f2b544', width: 2.4, dash: '6 3' });
  L.legend = [
    { swatch: { kind: 'hex', fill: 'rgba(79,159,208,0.5)', stroke: '#7fc4ef' }, label: side === 'Allied' ? 'Naval gunfire range' : 'Allied naval gunfire range' },
    { swatch: { kind: 'hex', fill: 'url(#mode-hatch-amber)', stroke: '#f2b544', dash: '3 2' }, label: `Your ready artillery (${ready} ASU${ready === 1 ? '' : 's'})` },
  ];
  L.note = 'Artillery must also be supplied and in Good Order to support.';
  return L;
}

// ------------------------------------------------------------------ terrain

let terrainCache: ModeLayer | null = null;
function terrainLayer(): ModeLayer {
  if (terrainCache) return terrainCache;
  const by: Record<string, HexId[]> = { hill: [], marsh: [], city: [], town: [] };
  for (const h of landHexes()) {
    const d = MAP.hexes[h];
    if (d.city) by.city.push(h);
    else if (d.terrain === 'hill') by.hill.push(h);
    else if (d.terrain === 'marsh') by.marsh.push(h);
    if (!d.city && d.town) by.town.push(h);
  }
  let mountains = '';
  let rivers = '';
  for (const [k, hs] of Object.entries(MAP.hexsides)) {
    if (!hs.mountain && !hs.river) continue;
    const [a, b] = k.split('-');
    const e = edge(a, b);
    if (!e) continue;
    const seg = `M${e[0][0].toFixed(1)},${e[0][1].toFixed(1)}L${e[1][0].toFixed(1)},${e[1][1].toFixed(1)}`;
    if (hs.mountain) mountains += seg;
    else rivers += seg;
  }
  const t = RULES.movement.terrain;
  const cost = (k: string) => `${t[k]?.inf ?? 1} inf / ${t[k]?.mech ?? 1} mech MP`;
  const L = empty();
  L.fills.push({ d: hexPath(by.hill), fill: 'rgba(186,124,58,0.5)' });
  L.fills.push({ d: hexPath(by.marsh), fill: 'rgba(58,165,154,0.4)' });
  L.fills.push({ d: hexPath(by.city, 1.2), fill: 'rgba(228,194,90,0.42)', stroke: '#f2d78f', width: 1.6 });
  L.fills.push({ d: hexPath(by.town, 6), fill: 'rgba(228,194,90,0.22)' });
  L.lines.push({ d: rivers, stroke: '#7fc4ef', width: 3 });
  L.lines.push({ d: mountains, stroke: '#c98a4a', width: 4 });
  L.legend = [
    { swatch: { kind: 'hex', fill: 'rgba(0,0,0,0)', stroke: '#8d8a78' }, label: `Clear: ${cost('clear')}` },
    { swatch: { kind: 'hex', fill: 'rgba(176,122,60,0.7)' }, label: `Hill: ${cost('hill')}, defense ×2` },
    { swatch: { kind: 'hex', fill: 'rgba(58,165,154,0.75)' }, label: `Marsh: ${cost('marsh')}, defense ×2` },
    { swatch: { kind: 'hex', fill: 'rgba(228,194,90,0.7)', stroke: '#f2d78f' }, label: 'City: defense ×2 (towns lighter)' },
    { swatch: { kind: 'line', stroke: '#7fc4ef' }, label: 'River: vehicles attack at ½' },
    { swatch: { kind: 'line', stroke: '#c98a4a' }, label: 'Mountain hexside: attack at ½, vehicles by road or pass' },
  ];
  terrainCache = L;
  return L;
}

// ------------------------------------------------------------------ stacking

function stackingLayer(s: GameState): ModeLayer {
  const lim = RULES.stackingLimit;
  const by = new Map<HexId, string[]>();
  for (const u of Object.values(s.units)) if (u.where.kind === 'map') by.set(u.where.hex, [...(by.get(u.where.hex) ?? []), u.id]);
  const groups = { low: [] as HexId[], mid: [] as HexId[], full: [] as HexId[] };
  const L = empty();
  for (const [h, ids] of by) {
    const sp = stackPoints(ids, s);
    const g = sp > lim - 1 ? 'full' : sp > lim / 2 ? 'mid' : 'low';
    groups[g].push(h);
    const [x, y] = center(h);
    const colour = g === 'full' ? { fill: '#d6322b', ink: '#fff4ee' } : g === 'mid' ? { fill: '#f2b544', ink: '#2a1d06' } : { fill: '#7be0a0', ink: '#0d2617' };
    L.labels.push({ x, y: y + 23.5, text: `${sp}/${lim}`, ...colour });
  }
  L.fills.push({ d: hexPath(groups.low), fill: 'rgba(123,224,160,0.22)' });
  L.fills.push({ d: hexPath(groups.mid), fill: 'rgba(242,181,68,0.28)' });
  L.fills.push({ d: hexPath(groups.full), fill: 'rgba(214,50,43,0.3)', stroke: '#ff7a5c', width: 1.4 });
  L.legend = [
    { swatch: { kind: 'hex', fill: 'rgba(123,224,160,0.5)' }, label: `Room to spare (up to ${lim / 2} SP)` },
    { swatch: { kind: 'hex', fill: 'rgba(242,181,68,0.6)' }, label: 'Filling up' },
    { swatch: { kind: 'hex', fill: 'rgba(214,50,43,0.6)', stroke: '#ff7a5c' }, label: `Full (${lim - 1}+ of ${lim} SP)` },
  ];
  L.note = 'One silhouetted tank per hex stacks free.';
  return L;
}

/** The shapes for a map mode, seen from `side`. */
export function modeLayer(s: GameState, mode: MapMode, side: Side): ModeLayer | null {
  switch (mode) {
    case 'supply': return supplyLayer(s, side);
    case 'control': return controlLayer(s);
    case 'zoc': return zocLayer(s, side);
    case 'support': return supportLayer(s, side);
    case 'terrain': return terrainLayer();
    case 'stacking': return stackingLayer(s);
    default: return null;
  }
}

