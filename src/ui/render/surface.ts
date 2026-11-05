// Drawing surfaces for the map painter, which runs on the page or in a worker (paint.worker.ts): an ordinary canvas
// where there is a document, an OffscreenCanvas where there is not.

export type Surface = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeSurface(w: number, h: number): Surface {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

export function ctx2d(c: Surface, opts?: CanvasRenderingContext2DSettings): Ctx2D {
  return c.getContext('2d', opts) as Ctx2D;
}

let lastYield = 0;

/** Give the page a moment between pieces of painting work once it has been busy for `ms`: painting on the page, the
 * menus stay responsive; in a worker it costs next to nothing. */
export async function breathe(ms = 30): Promise<void> {
  const now = performance.now();
  if (now - lastYield < ms) return;
  await new Promise<void>((r) => setTimeout(r, 0));
  lastYield = performance.now();
}
