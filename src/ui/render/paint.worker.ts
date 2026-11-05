// Paints a map's sheet off the page (terrain.ts sends the map; the sheet comes back as bitmaps, with compressed
// copies for the browser cache). Where the browser cannot run it, terrain.ts paints on the page instead.
import { setMapForPainting } from '../../engine/data';
import type { MapData } from '../../engine/types';
import { paintSheet, setSheetScale, type WorkerPainted } from './terrain';

interface Job {
  game: string;
  map: MapData;
  scale: number;
  font?: string;
}

// The worker's global scope, typed by hand (the project compiles against the page's library only).
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Job>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  fonts?: FontFaceSet;
};

scope.onmessage = async (e: MessageEvent<Job>) => {
  const { game, map, scale, font } = e.data;
  try {
    setMapForPainting(game, map);
    setSheetScale(scale);
    // The compass is lettered in the map's face; without it, the fallback face will do.
    if (font && scope.fonts && typeof FontFace === 'function') {
      try {
        const face = new FontFace('IM Fell English', `url(${font})`, { style: 'italic' });
        await face.load();
        scope.fonts.add(face);
      } catch {
        /* the fallback face */
      }
    }
    const painted = await paintSheet((progress, label) => scope.postMessage({ progress, label }));
    const sheet = painted.canvas as OffscreenCanvas;
    const fx = painted.effects as OffscreenCanvas;
    const [blob, effectsBlob] = await Promise.all([
      sheet.convertToBlob({ type: 'image/jpeg', quality: 0.9 }).catch(() => undefined),
      fx.convertToBlob({ type: 'image/png' }).catch(() => undefined),
    ]);
    const done: WorkerPainted = { image: sheet.transferToImageBitmap(), effects: fx.transferToImageBitmap(), bounds: painted.bounds, blob, effectsBlob };
    scope.postMessage({ done }, [done.image, done.effects]);
  } catch (err) {
    scope.postMessage({ error: String(err) });
  }
};

scope.postMessage({ ready: true });
