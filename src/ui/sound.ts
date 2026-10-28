// Small synthesized sound effects (no audio files): UI clicks, marching,
// engines, artillery, dice and fanfares.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.6;
let enabled = true;

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setSound(on: boolean, vol: number): void {
  enabled = on;
  volume = vol;
  if (master) master.gain.value = on ? vol : 0;
}

let noiseBuf: AudioBuffer | null = null;
function noise(a: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function burst(a: AudioContext, at: number, dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass') {
  const src = a.createBufferSource();
  src.buffer = noise(a);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at, Math.random());
  src.stop(at + dur + 0.05);
}

function tone(a: AudioContext, at: number, dur: number, freq: number, gain: number, type: OscillatorType = 'sine', slide?: number) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, at + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.05);
}

export const sfx = {
  click() {
    const a = audio();
    if (!a) return;
    burst(a, a.currentTime, 0.035, 3500, 0.25, 'bandpass');
  },
  select() {
    const a = audio();
    if (!a) return;
    tone(a, a.currentTime, 0.09, 520, 0.12, 'triangle', 780);
  },
  error() {
    const a = audio();
    if (!a) return;
    tone(a, a.currentTime, 0.18, 180, 0.15, 'square', 120);
  },
  march() {
    const a = audio();
    if (!a) return;
    for (let i = 0; i < 4; i++) burst(a, a.currentTime + i * 0.11, 0.07, 500, 0.35);
  },
  engine() {
    const a = audio();
    if (!a) return;
    burst(a, a.currentTime, 0.55, 220, 0.5);
    tone(a, a.currentTime, 0.5, 55, 0.18, 'sawtooth', 70);
  },
  boom(big = false) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    burst(a, t, big ? 1.4 : 0.8, big ? 600 : 900, big ? 1.1 : 0.8);
    tone(a, t, big ? 0.9 : 0.5, big ? 70 : 90, big ? 0.6 : 0.4, 'sine', 30);
    if (!big) for (let i = 1; i < 3; i++) burst(a, t + 0.12 * i + Math.random() * 0.08, 0.35, 1200, 0.35);
  },
  dice() {
    const a = audio();
    if (!a) return;
    for (let i = 0; i < 7; i++) burst(a, a.currentTime + i * 0.06 + Math.random() * 0.03, 0.03, 2600, 0.3, 'bandpass');
  },
  radio() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    burst(a, t, 0.18, 2400, 0.12, 'bandpass');
    tone(a, t + 0.05, 0.08, 1200, 0.06, 'square');
    tone(a, t + 0.16, 0.08, 1500, 0.06, 'square');
  },
  fanfare(win: boolean) {
    const a = audio();
    if (!a) return;
    const notes = win ? [392, 523, 659, 784] : [392, 370, 311, 262];
    notes.forEach((f, i) => tone(a, a.currentTime + i * 0.22, 0.5, f, 0.16, 'triangle'));
  },
};
