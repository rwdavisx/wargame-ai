// The map's living layer (render/ambient.ts), drawn for the map's drawn view (which the camera slides and scales
// between redraws) and in step with the weather. It runs at up to 30 frames a second and pauses while the page is
// hidden. With animations turned off (or the device asking for reduced motion, or no graphics card) it holds still:
// the weather's light and cloud stay, nothing moves, and it is drawn again only when the map is. It never asks the
// page for layout while it runs: where it stands comes from the view.
import { useEffect, useRef } from 'react';
import { createAmbient, skyOf, type Sky } from './render/ambient';
import type { TerrainImage } from './render/terrain';
import { reducedMotion } from './combat/Die';

export function AmbientLayer({ terrain, weather, animate, frame, cssPerUnit, sizeTick }: {
  terrain: TerrainImage;
  weather: Parameters<typeof skyOf>[0];
  animate: boolean;
  /** The map area the canvas covers (map units), and CSS pixels per map unit. */
  frame: { x: number; y: number; w: number; h: number };
  cssPerUnit: number;
  /** Changes when the map's element is resized. */
  sizeTick: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef<Sky>(skyOf(weather));
  target.current = skyOf(weather);
  const place = useRef({ frame, cssPerUnit });
  place.current = { frame, cssPerUnit };
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const effects = terrain.effects;
    if (!canvas || !effects) return;
    const amb = createAmbient(canvas, effects, terrain.bounds);
    if (!amb) return;
    // Without a graphics card (WebGL done in software) every animated frame would stall the page: hold still.
    const still = !animate || reducedMotion() || amb.software;
    let sky: Sky = { ...target.current };
    const t0 = performance.now();
    let last = 0;
    let raf = 0;
    const draw = (now: number) => {
      const { frame: f, cssPerUnit: css } = place.current;
      // A soft layer: well under a pixel per CSS pixel is plenty (and less still without a graphics card).
      const k = amb.software ? 0.5 : Math.min(window.devicePixelRatio || 1, 1) * 0.75;
      const W = Math.max(1, Math.round(f.w * css * k));
      const H = Math.max(1, Math.round(f.h * css * k));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      // The weather changes over a few seconds rather than at a stroke.
      const g = still || !last ? 1 : Math.min(1, ((now - last) / 1000) * 0.5);
      const to = target.current;
      sky = { cloud: sky.cloud + (to.cloud - sky.cloud) * g, rain: sky.rain + (to.rain - sky.rain) * g, mud: sky.mud + (to.mud - sky.mud) * g, sun: sky.sun + (to.sun - sky.sun) * g };
      last = now;
      amb.render(still ? 0 : (now - t0) / 1000, { scale: k * css, offsetX: -f.x * css * k, offsetY: -f.y * css * k, css: k }, sky, !still);
    };
    if (still) {
      redraw.current = () => draw(performance.now());
      draw(performance.now());
    } else {
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (document.hidden || now - last < 32) return;
        draw(now);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      redraw.current = null;
      amb.dispose();
    };
  }, [terrain, animate]);

  // A still layer is drawn again when the map is (the view settled, or the element was resized) and as the weather turns.
  useEffect(() => {
    redraw.current?.();
  }, [frame, cssPerUnit, sizeTick, weather]);

  return <canvas ref={ref} className="map-canvas" aria-hidden />;
}
