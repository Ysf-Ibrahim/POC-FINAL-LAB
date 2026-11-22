import type { EmonaControls } from "./store";

/** Pixel size of public/equipment/emona-ett101.webp; positions below are measured on it. */
export const EMONA_IMAGE = { w: 1635, h: 1353 };

export interface KnobDef {
  id: string;
  label: string;
  /** Centre of the trimmer rotor, image px. */
  x: number;
  y: number;
  /** Position at power-up, 0 (fully counter-clockwise) .. 1 (fully clockwise). */
  initial: number;
  /** Human-readable value for the hint bubble. */
  format: (value: number) => string;
}

export interface SlideDef {
  id: string;
  label: string;
  /** Centre of the switch body, image px. */
  x: number;
  y: number;
  /** Labels in position order (top first). */
  positions: string[];
  initial: number;
}

const fixed = (v: number, digits = 2) => v.toFixed(digits).replace(/\.?0+$/, "");
const hz = (f: number) => (f >= 1000 ? `${fixed(f / 1000, f >= 10_000 ? 1 : 2)} kHz` : `${Math.round(f)} Hz`);

/**
 * The trimmers on the ETT-101 carry no calibration marks, so the hint shows the
 * value implied by the documented range of each control.
 */
export const EMONA_KNOBS: KnobDef[] = [
  { id: "adder.G", label: "ADDER G", x: 136, y: 322, initial: 0.5, format: (v) => `G = −${fixed(2 * v)}` },
  { id: "adder.g", label: "ADDER g", x: 135, y: 515.5, initial: 0.5, format: (v) => `g = −${fixed(2 * v)}` },
  { id: "twin.width", label: "WIDTH", x: 480.5, y: 324, initial: 0.2, format: (v) => `${fixed(5 + 35 * v, 1)} µs` },
  { id: "twin.delay", label: "DELAY", x: 481, y: 517.5, initial: 0, format: (v) => `${Math.round(50 + 250 * v)} µs` },
  { id: "buffer.gain", label: "BUFFER GAIN", x: 820.5, y: 468.5, initial: 0.1, format: (v) => `× ${fixed(10 * v)}` },
  { id: "tlpf.fc", label: "TUNEABLE LPF fc", x: 1505.5, y: 370.5, initial: 0.6, format: (v) => hz(600 * Math.pow(20, v)) },
  { id: "tlpf.gain", label: "TUNEABLE LPF GAIN", x: 1505.5, y: 514.5, initial: 0.5, format: (v) => `× ${fixed(2 * v)}` },
  { id: "dcv.vdc", label: "VDC", x: 138.5, y: 1016.5, initial: 0.5, format: (v) => `${fixed((v - 0.5) * 5)} V` },
  { id: "vco.gain", label: "VCO GAIN", x: 306, y: 920, initial: 0.25, format: (v) => `${Math.round(v * 100)} %` },
  { id: "vco.freq", label: "VCO FREQ", x: 307, y: 1015.5, initial: 0.5625, format: (v) => `${Math.round(v * 100)} %` },
];

export const EMONA_SLIDES: SlideDef[] = [
  { id: "vco.range", label: "VCO range", x: 307.5, y: 1162.5, positions: ["HI", "LO"], initial: 1 },
];

const KNOB_DEFAULTS: Record<string, number> = Object.fromEntries(EMONA_KNOBS.map((k) => [k.id, k.initial]));
const SWITCH_DEFAULTS: Record<string, number> = Object.fromEntries(EMONA_SLIDES.map((s) => [s.id, s.initial]));

export function knobValue(c: EmonaControls, id: string): number {
  return c.knobs[id] ?? KNOB_DEFAULTS[id] ?? 0.5;
}

/** Logical switch value. For "vco.range": 1 = HI, 0 = LO. */
export function switchValue(c: EmonaControls, id: string): number {
  const pos = c.switches[id] ?? SWITCH_DEFAULTS[id] ?? 0;
  if (id === "vco.range") return pos === 0 ? 1 : 0;
  return pos;
}

export function switchPosition(c: EmonaControls, id: string): number {
  return c.switches[id] ?? SWITCH_DEFAULTS[id] ?? 0;
}
