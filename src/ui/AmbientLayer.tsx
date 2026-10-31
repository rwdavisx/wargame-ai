// The map's living layer (render/ambient.ts), kept in step with the camera and the weather. It runs at up to 30
// frames a second, pauses while the page is hidden, and with animations turned off (or the device asking for
// reduced motion) holds still: the weather's light and cloud stay, nothing moves.
import { useEffect, useRef, type RefObject } from 'react';
import { createAmbient, skyOf, type Sky } from './render/ambient';
import type { TerrainImage } from './render/terrain';
import { reducedMotion } from './combat/Die';

export function AmbientLayer({ terrain, svgRef, weather, animate, view }: {
  terrain: TerrainImage;
  svgRef: RefObject<SVGSVGElement | null>;
  weather: Parameters<typeof skyOf>[0];
  animate: boolean;
  /** The camera: a still layer is redrawn when it changes. */
  view: unknown;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef<Sky>(skyOf(weather));
  target.current = skyOf(weather);
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const effects = terrain.effects;
    if (!canvas || !effects) return;
    const amb = createAmbient(canvas, effects, terrain.bounds);
    if (!amb) return;
    const still = !animate || reducedMotion();
    let sky: Sky = { ...target.current };
    const t0 = performance.now();
    let last = 0;
    let raf = 0;
    const draw = (now: number) => {
      const svg = svgRef.current;
      const m = svg?.getScreenCTM();
      const r = canvas.getBoundingClientRect();
      if (!m || !r.width || !r.height) return;
      // A soft layer: no need for every device pixel (and far fewer without a graphics card).
      const k = amb.software ? 0.5 : Math.min(window.devicePixelRatio || 1, 1.25);
      const W = Math.round(r.width * k);
      const H = Math.round(r.height * k);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      // The weather changes over a few seconds rather than at a stroke.
      const f = still || !last ? 1 : Math.min(1, ((now - last) / 1000) * 0.5);
      const to = target.current;
      sky = { cloud: sky.cloud + (to.cloud - sky.cloud) * f, rain: sky.rain + (to.rain - sky.rain) * f, mud: sky.mud + (to.mud - sky.mud) * f, sun: sky.sun + (to.sun - sky.sun) * f };
      last = now;
      amb.render(still ? 0 : (now - t0) / 1000, { scale: k * m.a, offsetX: k * (m.e - r.left), offsetY: k * (m.f - r.top), css: k }, sky, !still);
    };
    if (still) {
      redraw.current = () => draw(performance.now());
      draw(performance.now());
    } else {
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (document.hidden || now - last < (amb.software ? 80 : 32)) return;
        draw(now);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      redraw.current = null;
      amb.dispose();
    };
  }, [terrain, animate, svgRef]);

  // A still layer follows the camera and the weather by redrawing.
  useEffect(() => {
    redraw.current?.();
  }, [view, weather]);

  return <canvas ref={ref} className="map-canvas" aria-hidden />;
}
