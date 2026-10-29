// Shows an in-memory canvas or bitmap on the page by copying its pixels, with no image URL involved.
import { useEffect, useRef } from 'react';

export function CanvasImage({ src, className, style }: { src: HTMLCanvasElement | ImageBitmap; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d')?.drawImage(src, 0, 0);
  }, [src]);
  return <canvas ref={ref} className={className} style={style} aria-hidden />;
}
