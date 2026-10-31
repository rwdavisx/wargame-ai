// Hex grid helpers. The map uses flat-topped hexes in vertical columns, every other column shifted half a hex
// down: the odd columns on Salerno '43's map ("odd-q" offset layout), the even ones on Italy '43's ("even-q").
// Hex ids are four digits: CCRR (column, row), e.g. "2707" = Salerno.

export type HexId = string;

/** 1 when the odd columns sit half a hex lower, 0 when the even ones do. Set from the map (`setShiftedColumns`). */
let DOWN = 1;

export function setShiftedColumns(odd: boolean): void {
  DOWN = odd ? 1 : 0;
}

/** Whether column `c` sits half a hex lower than its neighbours. */
export const shiftedDown = (c: number): boolean => (c & 1) === DOWN;

/** The row offset that turns an offset (column, row) into axial coordinates for column `c`. */
export const axialShift = (c: number): number => (DOWN ? c - (c & 1) : c + (c & 1)) / 2;

export function parseHex(id: HexId): { c: number; r: number } {
  return { c: parseInt(id.slice(0, 2), 10), r: parseInt(id.slice(2, 4), 10) };
}

export function hexId(c: number, r: number): HexId {
  return String(c).padStart(2, '0') + String(r).padStart(2, '0');
}

const ODD_DIRS: [number, number][] = [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const EVEN_DIRS: [number, number][] = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];

/** The six neighbouring hex ids, clockwise from north. Ids may be off-map. */
export function neighbors(id: HexId): HexId[] {
  const { c, r } = parseHex(id);
  const dirs = shiftedDown(c) ? ODD_DIRS : EVEN_DIRS;
  const out: HexId[] = [];
  for (const [dc, dr] of dirs) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc > 99 || nr > 99) continue;
    out.push(hexId(nc, nr));
  }
  return out;
}

export function isAdjacent(a: HexId, b: HexId): boolean {
  return neighbors(a).includes(b);
}

function toCube(id: HexId): [number, number, number] {
  const { c, r } = parseHex(id);
  const x = c;
  const z = r - axialShift(c);
  return [x, -x - z, z];
}

export function distance(a: HexId, b: HexId): number {
  const [ax, ay, az] = toCube(a);
  const [bx, by, bz] = toCube(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

/** Canonical key for the hexside between two adjacent hexes. */
export function sideKey(a: HexId, b: HexId): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Pixel centre of a hex for rendering, given the hex circumradius. */
export function hexToPixel(id: HexId, size: number): { x: number; y: number } {
  const { c, r } = parseHex(id);
  return {
    x: size * 1.5 * c,
    y: size * Math.sqrt(3) * (r + (shiftedDown(c) ? 0.5 : 0)),
  };
}

export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * 60 * k;
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}

/** Endpoints of the shared edge between two adjacent hexes (pixel space). */
export function sharedEdge(a: HexId, b: HexId, size: number): [[number, number], [number, number]] | null {
  const pa = hexToPixel(a, size);
  const pb = hexToPixel(b, size);
  const ca = hexCorners(pa.x, pa.y, size);
  const cb = hexCorners(pb.x, pb.y, size);
  const shared = ca.filter(([x, y]) => cb.some(([u, v]) => Math.hypot(x - u, y - v) < size * 0.05));
  return shared.length === 2 ? [shared[0], shared[1]] : null;
}
