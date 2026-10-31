// The game's icon set: one engraved-line style on a 24-unit grid (1.7 stroke, round ends, solid where a shape
// reads better filled), drawn in currentColor so a button or label colours it. <Ico name="laurel" /> draws one.
import type { CSSProperties, ReactNode } from 'react';

const F = { fill: 'currentColor', stroke: 'none' } as const;
const SOFT = { fill: 'currentColor', fillOpacity: 0.22 } as const;
const f = (n: number) => +n.toFixed(2);

/** A laurel branch up one side (s = -1 left, 1 right): a curved stem with leaves on both sides of it. */
function branch(s: 1 | -1): ReactNode {
  const P0 = [12 + s * 1.4, 20.4];
  const P1 = [12 + s * 11.6, 15.5];
  const P2 = [12 + s * 5.6, 3.4];
  const at = (t: number) => [
    (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0],
    (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1],
  ];
  const tan = (t: number) => [2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1])];
  const leaves: ReactNode[] = [];
  [0.16, 0.34, 0.52, 0.7, 0.86].forEach((t, i) => {
    const [x, y] = at(t);
    const [tx, ty] = tan(t);
    const a = (Math.atan2(ty, tx) * 180) / Math.PI;
    for (const side of [1, -1]) {
      // Each leaf leans forward along the stem, out to one side.
      const lean = a + side * 38;
      const r = (lean * Math.PI) / 180;
      const cx = x + Math.cos(r) * 1.9;
      const cy = y + Math.sin(r) * 1.9;
      leaves.push(<ellipse key={`${i}${side}`} cx={f(cx)} cy={f(cy)} rx={2.15 - i * 0.14} ry={0.95} transform={`rotate(${f(lean)} ${f(cx)} ${f(cy)})`} {...F} />);
    }
  });
  const [ex, ey] = P2;
  return (
    <g>
      <path d={`M${P0[0]} ${P0[1]}Q${P1[0]} ${P1[1]} ${ex} ${ey}`} strokeWidth={1.2} />
      {leaves}
      <ellipse cx={ex} cy={ey - 0.9} rx={0.75} ry={1.5} transform={`rotate(${s * 18} ${ex} ${ey - 0.9})`} {...F} />
    </g>
  );
}

/** A gear: eight teeth round a ring. */
function gear(): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const w = 0.21;
    for (const [da, r] of [[-0.39, 6.7], [-w, 9.3], [w, 9.3], [0.39, 6.7]] as const) {
      pts.push(`${f(12 + Math.cos(a + da) * r)},${f(12 + Math.sin(a + da) * r)}`);
    }
  }
  return `M${pts.join('L')}Z`;
}

/** A five-pointed star. */
function star(r = 9, r2 = 3.9, cy = 12.6): string {
  return `M${Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const q = i % 2 ? r2 : r;
    return `${f(12 + Math.cos(a) * q)},${f(cy + Math.sin(a) * q)}`;
  }).join('L')}Z`;
}

/** A burst: the flash of a gun. */
function burst(): string {
  return `M${Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    const q = i % 2 ? 4.2 : i % 4 ? 7.4 : 9.4;
    return `${f(12 + Math.cos(a) * q)},${f(12 + Math.sin(a) * q)}`;
  }).join('L')}Z`;
}

const CLOUD = 'M7 18.5h10.2a3.8 3.8 0 0 0 .6-7.55A5.6 5.6 0 0 0 7.1 9.6 4.5 4.5 0 0 0 7 18.5z';
const CLOUD_HI = 'M7 14h10.2a3.8 3.8 0 0 0 .6-7.55A5.6 5.6 0 0 0 7.1 5.1 4.5 4.5 0 0 0 7 14z';
const PERSON = 'M12 4.5a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM5 20.5c.7-4 3.5-6.4 7-6.4s6.3 2.4 7 6.4';

const ICONS: Record<string, ReactNode> = {
  // ---------------------------------------------------------------- score and time
  laurel: <>{branch(-1)}{branch(1)}<path d="M9.6 21.3 12 19.8l2.4 1.5" strokeWidth={1.3} /></>,
  calendar: <><rect x={4} y={5.5} width={16} height={14.5} rx={1.6} /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /><path d="M8 12.8h3v3H8z" {...F} /></>,
  hourglass: <><path d="M6.5 3.5h11M6.5 20.5h11" /><path d="M8 3.5c0 4.5 4 6 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 6-4 8.5s4 4 4 8.5" /><path d="M9.4 19.6c.6-2.1 2.6-3.1 2.6-4.3 0 1.2 2 2.2 2.6 4.3z" {...F} /></>,
  turn: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.8 3.8v4.6h-4.6" /><path d="M12 8v4.3l2.8 1.8" /></>,

  // ---------------------------------------------------------------- weather
  sun: <><circle cx={12} cy={12} r={4.3} {...F} />{Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return <path key={i} d={`M${f(12 + Math.cos(a) * 6.8)} ${f(12 + Math.sin(a) * 6.8)}L${f(12 + Math.cos(a) * 9.3)} ${f(12 + Math.sin(a) * 9.3)}`} />;
  })}</>,
  cloud: <path d={CLOUD} {...SOFT} />,
  sunCloud: <><circle cx={8.5} cy={8.5} r={3.4} {...F} /><path d="M8.5 2.5v1.3M3 8.5h1.3M4.6 4.6l.9.9M12.4 4.6l-.9.9" /><path d="M9 19.5h9a3.3 3.3 0 0 0 .5-6.55A4.9 4.9 0 0 0 9.2 11.8 3.9 3.9 0 0 0 9 19.5z" fill="var(--ico-bg, #1d1610)" /></>,
  rain: <><path d={CLOUD_HI} {...SOFT} /><path d="M8.6 17l-1.2 3M12.6 17l-1.2 3M16.6 17l-1.2 3" /></>,
  mud: <><path d={CLOUD_HI} {...SOFT} /><path d="M9 16.2l-.9 2.2M13.5 16.2l-.9 2.2" /><path d="M3 21c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" /></>,

  // ---------------------------------------------------------------- support and supply
  plane: <path d="M12 2.5c.9 0 1.3 1.1 1.3 2.6v3.7l7.9 2.3v1.8l-7.9-1.2v5.4l2.6 1.7v1.5L12 19.4l-3.9.9v-1.5l2.6-1.7v-5.4l-7.9 1.2v-1.8l7.9-2.3V5.1c0-1.5.4-2.6 1.3-2.6z" {...F} />,
  ship: <><path d="M2 15.5h20l-2.6 3.8H4.8z" {...F} /><path d="M6 15.5v-2.4h3.2v-2.5h3.6v2.5H15v2.4z" {...F} /><path d="M10.9 10.6V6.6M9.3 8.1h3.2M15 13.4l4.6-1.7" /><path d="M20.8 10.9l1.3-.6M20.4 9.6l.8-1.1" strokeWidth={1.2} /></>,
  battleship: <><path d="M1.5 15h21l-2.8 4H4.3z" {...F} /><path d="M8.2 15v-2.6h2.4V9.6h2.8v2.8h2.4V15z" {...F} /><path d="M4.4 15v-1.7h2.6V15zM17 15v-1.7h2.6V15z" {...F} /><path d="M12 9.6V5.4M4.6 13.9l-2.6-.5M19.4 13.9l2.6-.5" /></>,
  supply: <><path d="M6.5 6.8 9.3 4h8.2v16.5h-11z" {...SOFT} /><path d="M15.2 4V2.6h-2.6M9.3 9.5l5.8 7.8M15.1 9.5l-5.8 7.8" /></>,
  replacement: <><path d="M3.6 16.2h16.8a8.4 7.6 0 0 0-16.8 0z" {...SOFT} /><path d="M2 16.2h20" /><path d="M18.6 2.8v5.4M15.9 5.5h5.4" strokeWidth={1.9} /></>,
  artillery: <><circle cx={9} cy={15.5} r={4.4} /><path d="M9 11.1v8.8M4.6 15.5h8.8" strokeWidth={1.1} /><path d="M8 13.7l12.2-7.3 1 1.7L9 15.4z" {...F} /><path d="M9 15.5 2.5 19.8" /></>,
  fort: <><path d="M3.5 20.5V11h2.6V8.4h2.6V11h2V8.4h2.6V11h2V8.4h2.6V11h2.6v9.5z" {...SOFT} /><path d="M10 20.5v-3.6a2 2 0 0 1 4 0v3.6" /></>,
  garrison: <><path d="M4 20.5V9.2l8-5.6 8 5.6v11.3z" {...SOFT} /><path d="M9.5 20.5v-4.8a2.5 2.5 0 0 1 5 0v4.8" /></>,

  // ---------------------------------------------------------------- combat
  swords: <><path d="M3.6 3.6 15 15M20.4 3.6 9 15" /><path d="M12.8 17.2l4.4-4.4M6.8 12.8l4.4 4.4" /><path d="M16 16l3.6 3.6M8 16l-3.6 3.6" strokeWidth={2.3} /><circle cx={20.3} cy={20.3} r={1.1} {...F} /><circle cx={3.7} cy={20.3} r={1.1} {...F} /></>,
  shield: <><path d="M12 3l7.5 2.7v5.6c0 5-3.3 8.3-7.5 9.9-4.2-1.6-7.5-4.9-7.5-9.9V5.7z" {...SOFT} /><path d="M12 6.4v11.8" /></>,
  boot: <><path d="M8.5 3.5H14v7.2l4.6 2.2c1.5.7 2.4 1.9 2.4 3.4v1.2H4.5v-3l4-2.7z" {...SOFT} /><path d="M4.5 20h16.5M10.6 6.6h3.4M10.6 9.2h3.4" /></>,
  burst: <path d={burst()} {...F} />,
  shattered: <><path d="M12 3l7.5 2.7v5.6c0 5-3.3 8.3-7.5 9.9-4.2-1.6-7.5-4.9-7.5-9.9V5.7z" /><path d="M12.6 3.4 10.8 9l2.8 2.6-2.4 4.6 1 4.4" /></>,
  disrupted: <path d="M3 12.5 6.2 8l3.2 8.5L12.6 7l3.2 9.5L19 9l2 3.5" />,
  retreat: <path d="M20 12H5.5M10.5 6.5 5 12l5.5 5.5" />,
  advance: <path d="M4 12h14.5M13.5 6.5 19 12l-5.5 5.5" />,
  breakthrough: <path d="M5 6l6 6-6 6M12.5 6l6 6-6 6" />,
  dice: <><rect x={3.8} y={3.8} width={16.4} height={16.4} rx={3.2} />{[[8.4, 8.4], [15.6, 8.4], [12, 12], [8.4, 15.6], [15.6, 15.6]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.45} {...F} />)}</>,
  target: <><circle cx={12} cy={12} r={7} /><circle cx={12} cy={12} r={2.4} {...F} /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></>,
  landing: <><circle cx={12} cy={5} r={2} /><path d="M12 7v13.5M8.2 10.5h7.6M5 14.2a7 7 0 0 0 14 0M5 14.2H3.4M19 14.2h1.6" /></>,
  truck: <><path d="M2.5 6.5h11v9.5h-11z" {...SOFT} /><path d="M13.5 9.5h4l3 3.6v2.9h-7" /><circle cx={6.4} cy={17.6} r={1.9} {...F} /><circle cx={17} cy={17.6} r={1.9} {...F} /></>,
  tank: <><rect x={3} y={14.2} width={16.5} height={5.4} rx={2.7} /><path d="M5.6 16.9h11.3" strokeDasharray="0.1 2.8" strokeWidth={2.2} /><path d="M4.6 14.2 6.6 11h10.2l1.8 3.2z" {...F} /><path d="M8.6 11V8.6h6.2V11z" {...F} /><path d="M14.8 9.6h7" strokeWidth={1.9} /></>,
  zoc: <><path d="M7.5 6.5h9l4.5 5.5-4.5 5.5h-9L3 12z" strokeDasharray="2.2 2" /><circle cx={12} cy={12} r={2.4} {...F} /></>,

  // ---------------------------------------------------------------- orders
  pin: <><path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z" {...SOFT} /><circle cx={12} cy={10} r={2.1} {...F} /></>,
  sleep: <><path d="M14.5 4.5A8 8 0 1 0 19.5 16a6.5 6.5 0 0 1-5-11.5z" {...SOFT} /><path d="M16.5 3h3.5l-3.5 3.6H20" strokeWidth={1.4} /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z" {...SOFT} /><path d="M10 20.5a2 2 0 0 0 4 0M12 3.4V5" /></>,
  next: <><path d="M5 5.5 13.5 12 5 18.5z" {...F} /><path d="M17.5 5.5v13" strokeWidth={2.4} /></>,
  play: <path d="M7.5 5v14l11-7z" {...F} />,
  pause: <path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" {...F} />,
  undo: <><path d="M9 6.5 4.5 11 9 15.5" /><path d="M4.5 11H14a5 5 0 0 1 0 10h-3" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  chevronRight: <path d="M9 5.5 15.5 12 9 18.5" />,
  chevronLeft: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  chevronDown: <path d="M5.5 9 12 15.5 18.5 9" />,
  chevronUp: <path d="M5.5 15 12 8.5l6.5 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,

  // ---------------------------------------------------------------- panels and menus
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  gear: <><path d={gear()} {...SOFT} /><circle cx={12} cy={12} r={3} /></>,
  soundOn: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...F} /><path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.4a7.6 7.6 0 0 1 0 11.2" /></>,
  soundOff: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...F} /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>,
  quill: <><path d="M20.5 3.5c-6.2.4-11.2 4.6-13.2 11l-1.3 4.6 2.9-2.5c6.3-1 10.6-6 11.6-13.1z" {...SOFT} /><path d="M5.8 20.5 14 11.5" /></>,
  log: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx={4.8} cy={6.5} r={1.25} {...F} /><circle cx={4.8} cy={12} r={1.25} {...F} /><circle cx={4.8} cy={17.5} r={1.25} {...F} /></>,
  book: <><path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V19c-3-1-6-1-9 1-3-2-6-2-9-1z" {...SOFT} /><path d="M12 6.5V20" /></>,
  army: <><path d="M5 8v12.5h12.5" /><path d="M8 4.5h12.5V17H8z" {...SOFT} /><path d="M10.6 8.2h7.3v5.2h-7.3zM10.6 8.2l7.3 5.2M17.9 8.2l-7.3 5.2" strokeWidth={1.3} /></>,
  compass: <><circle cx={12} cy={12} r={8.8} /><path d="M12 5.4 14.2 12 12 18.6 9.8 12z" /><path d="M12 5.4 14.2 12H9.8z" {...F} /></>,
  map: <><path d="M3 6l6-2.5 6 2.5 6-2.5v14L15 20l-6-2.5L3 20z" {...SOFT} /><path d="M9 3.5v14M15 6v14" /></>,
  layers: <><path d="M12 3.5 20.5 8 12 12.5 3.5 8z" {...SOFT} /><path d="M3.5 12.2 12 16.7l8.5-4.5M3.5 16.2 12 20.7l8.5-4.5" /></>,
  flag: <><path d="M6 21V3.5" /><path d="M6 4.5h11.5L15 8l2.5 3.5H6" {...SOFT} /></>,
  mountain: <><path d="M2.5 19.5 9 8.5l3.6 5.6 2.4-3.4 6.5 8.8z" {...SOFT} /><path d="M7.1 12.3 9 11l1.6 1.4" strokeWidth={1.3} /></>,
  river: <path d="M3 8c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 13c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />,
  hex: <path d="M7.5 4h9l4.5 8-4.5 8h-9L3 12z" />,
  hash: <path d="M9.5 4 8 20M16.5 4 15 20M4.5 9h16M3.5 15h16" />,
  labels: <><path d="M4 19.5 9.5 5h1L16 19.5M6.3 14.5h7.4" /><path d="M17.5 13.5h3M19 11v8.5" strokeWidth={1.3} /></>,
  tag: <><path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z" {...SOFT} /><circle cx={8} cy={8.5} r={1.4} {...F} /></>,
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx={12} cy={12} r={3} {...F} /></>,
  zoomIn: <><circle cx={10.5} cy={10.5} r={6.3} /><path d="M15.2 15.2l5 5M8 10.5h5M10.5 8v5" /></>,
  zoomOut: <><circle cx={10.5} cy={10.5} r={6.3} /><path d="M15.2 15.2l5 5M8 10.5h5" /></>,
  fit: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  info: <><circle cx={12} cy={12} r={9} /><path d="M12 10.8v6" /><circle cx={12} cy={7.6} r={1.2} {...F} /></>,
  warning: <><path d="M12 3.5 21.5 20h-19z" {...SOFT} /><path d="M12 9.5v5" /><circle cx={12} cy={17.3} r={1.1} {...F} /></>,
  question: <><circle cx={12} cy={12} r={9} /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7v.6" /><circle cx={12} cy={17} r={1.1} {...F} /></>,
  star: <path d={star()} {...F} />,
  starOutline: <path d={star()} />,
  person: <path d={PERSON} />,
  twoPlayers: <><path d="M8 5.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM2.5 20c.6-3.5 2.8-5.6 5.5-5.6s4.9 2.1 5.5 5.6" /><path d="M16 5.5a3 3 0 1 1 0 6M15.6 14.4c2.6.1 4.6 2.2 5.2 5.6" /></>,
  radio: <><path d="M4 9.5h16v11H4z" {...SOFT} /><path d="M7 9.5 15.5 4" /><circle cx={9} cy={15} r={2.5} /><path d="M14 12.8h3.5M14 15h3.5M14 17.2h3.5" /></>,
  save: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 15.5V20h15v-4.5" />,
  load: <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 15.5V20h15v-4.5" />,
  exit: <><path d="M14 4.5H5.5v15H14" /><path d="M10 12h10.5M16.5 8l4 4-4 4" /></>,
  globe: <><circle cx={12} cy={12} r={8.8} /><path d="M3.2 12h17.6M12 3.2c2.6 2.4 3.8 5.4 3.8 8.8s-1.2 6.4-3.8 8.8c-2.6-2.4-3.8-5.4-3.8-8.8S9.4 5.6 12 3.2z" /></>,
  seal: <><circle cx={12} cy={10} r={6.5} {...SOFT} /><circle cx={12} cy={10} r={4} /><path d="M8.2 15.2 6.5 21l3.2-1.6L12 21.5M15.8 15.2l1.7 5.8-3.2-1.6" /></>,
  /** An umbrella pine: the Italian landscape's own tree. */
  pine: <><path d="M2.6 10.4c.4-1.6 1.9-2.3 3.4-2.2.6-1.9 2.6-3 4.6-2.6 1.1-1 3.1-1.2 4.4-.2 1.6-.6 3.6.2 4.1 1.9 1.7.3 2.7 1.6 2.4 3.1-2.8.9-6 1.3-9.5 1.3s-6.7-.4-9.4-1.3z" {...F} /><path d="M12.2 11.6c-.4 3.2-.2 6.2.4 9M12.3 14.6l-3.6-3.1M12.4 13.4l3.4-1.9" /></>,
};

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS);

/** One icon, `size` pixels square, drawn in the current text colour. */
export function Ico({ name, size = 18, className, title, style, stroke = 1.7 }: {
  name: string; size?: number; className?: string; title?: string; style?: CSSProperties; stroke?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className ? `ico ${className}` : 'ico'} style={style} aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {title && <title>{title}</title>}
      {ICONS[name] ?? ICONS.question}
    </svg>
  );
}

/** The icon for a weather box's name. */
export function weatherIcon(w: { name: string; rain?: boolean; mud?: boolean; clear?: boolean }): string {
  if (w.mud) return 'mud';
  if (w.rain) return 'rain';
  if (/cloud/i.test(w.name)) return 'sunCloud';
  if (/air/i.test(w.name)) return 'plane';
  return 'sun';
}
