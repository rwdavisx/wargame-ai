// The countryside's field pattern, shared by the watercolour washes (terrain.ts) and the ink work that sits on
// them (ink.ts), so an olive grove's rows of trees stand inside the field painted for it.
//
// The plain is divided into estates, each with its own orientation; an estate is ploughed in strips, and each strip
// is cut into fields. Positions are in "field space": the map plane bent by the organic warp, so the pattern does
// not line up with the hexes either.
import { hash } from './noise';

export const ESTATE = 170;

/** What a field grows. */
export type FieldKind = 'crop' | 'pasture' | 'olive' | 'vine';

export interface Patch {
  /** A stable random number for the field, 0-1 (its tint, its wash's strength). */
  id: number;
  kind: FieldKind;
  /** Distance (map units) from the point to the field's nearest edge. */
  edge: number;
  /** The estate's orientation: the strips run along this angle. */
  ang: number;
}

interface Estate {
  ex: number;
  ey: number;
  ang: number;
  ca: number;
  sa: number;
  rowH: number;
}

function estate(ex: number, ey: number): Estate {
  const ang = (hash(ex, ey, 21) - 0.5) * 1.6;
  return { ex, ey, ang, ca: Math.cos(ang), sa: Math.sin(ang), rowH: 9 + hash(ex, ey, 22) * 7 };
}

const cache = new Map<number, Estate>();
function estateAt(ex: number, ey: number): Estate {
  const k = ex * 4096 + ey;
  let e = cache.get(k);
  if (!e) cache.set(k, (e = estate(ex, ey)));
  return e;
}

function kindOf(r: number): FieldKind {
  return r < 0.11 ? 'olive' : r < 0.19 ? 'vine' : r < 0.36 ? 'pasture' : 'crop';
}

/** The field at field-space point (qx, qy). The object returned is reused by the next call: copy what you keep. */
export function patchAt(qx: number, qy: number): Patch {
  const ex = Math.floor(qx / ESTATE);
  const ey = Math.floor(qy / ESTATE);
  const e = estateAt(ex, ey);
  const ox = qx - ex * ESTATE;
  const oy = qy - ey * ESTATE;
  const u = ox * e.ca + oy * e.sa + ex * 37;
  const v = -ox * e.sa + oy * e.ca + ey * 53;
  const row = Math.floor(v / e.rowH);
  const uu = u + hash(row, ey, 31) * 40;
  const width = 16 + hash(row, ex, 32) * 24;
  const col = Math.floor(uu / width);
  const fu = uu / width - col;
  const fv = v / e.rowH - row;
  const id = hash(col, row, 13 + ex * 7 + ey * 131);
  // The estate's own edge is a field edge too.
  const estEdge = Math.min(ox, oy, ESTATE - ox, ESTATE - oy);
  const edge = Math.min(Math.min(fu, 1 - fu) * width, Math.min(fv, 1 - fv) * e.rowH, estEdge);
  // One result object, reused: the painter asks for millions of these.
  out.id = id;
  out.kind = kindOf(hash(col, row, 77 + ex * 3 + ey * 5));
  out.edge = edge;
  out.ang = e.ang;
  return out;
}
const out: Patch = { id: 0, kind: 'crop', edge: 0, ang: 0 };

/** Every point of a lattice laid along the strips of each estate in a field-space box, with the field it falls
 * in: rows `across` apart, points `along` apart within a row. */
export function forEachRowPoint(x0: number, y0: number, x1: number, y1: number, along: number, across: number,
  fn: (qx: number, qy: number, p: Patch) => void): void {
  for (let ex = Math.floor(x0 / ESTATE); ex <= Math.floor(x1 / ESTATE); ex++) {
    for (let ey = Math.floor(y0 / ESTATE); ey <= Math.floor(y1 / ESTATE); ey++) {
      const e = estateAt(ex, ey);
      // The estate's square in (u, v): its four corners, rotated.
      const us: number[] = [];
      const vs: number[] = [];
      for (const [ox, oy] of [[0, 0], [ESTATE, 0], [0, ESTATE], [ESTATE, ESTATE]]) {
        us.push(ox * e.ca + oy * e.sa);
        vs.push(-ox * e.sa + oy * e.ca);
      }
      const v0 = Math.ceil(Math.min(...vs) / across) * across;
      const u0 = Math.ceil(Math.min(...us) / along) * along;
      for (let v = v0; v <= Math.max(...vs); v += across) {
        for (let u = u0; u <= Math.max(...us); u += along) {
          const ox = u * e.ca - v * e.sa;
          const oy = u * e.sa + v * e.ca;
          if (ox < 0 || oy < 0 || ox >= ESTATE || oy >= ESTATE) continue;
          const qx = ex * ESTATE + ox;
          const qy = ey * ESTATE + oy;
          if (qx < x0 || qy < y0 || qx > x1 || qy > y1) continue;
          fn(qx, qy, patchAt(qx, qy));
        }
      }
    }
  }
}
