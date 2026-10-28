// Hex grid helpers. The map uses flat-topped hexes in vertical columns.
// Odd columns are shifted half a hex down ("odd-q" offset layout).
// Hex ids are four digits: CCRR (column, row), e.g. "2707" = Salerno.

export type HexId = string;

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
  const dirs = c % 2 === 1 ? ODD_DIRS : EVEN_DIRS;
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
  const z = r - (c - (c & 1)) / 2;
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
    y: size * Math.sqrt(3) * (r + (c % 2 === 1 ? 0.5 : 0)),
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
