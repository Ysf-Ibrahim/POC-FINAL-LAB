/** Small DSP helpers shared by the module models. */

/** Analogue second-order section: (b0·s² + b1·s + b2) / (a0·s² + a1·s + a2). */
export type AnalogSection = readonly [number, number, number, number, number, number];

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  z1: number;
  z2: number;
}

/**
 * Bilinear transform of one analogue section.
 * `c` is the bilinear constant: 2/dt for sections given in rad/s, or
 * 1/tan(wc·dt/2) for prototypes normalised to wc = 1 (which also pre-warps).
 */
export function toBiquad(sec: AnalogSection, c: number): Biquad {
  const [b0, b1, b2, a0, a1, a2] = sec;
  const c2 = c * c;
  const A0 = a0 * c2 + a1 * c + a2;
  return {
    b0: (b0 * c2 + b1 * c + b2) / A0,
    b1: (2 * (b2 - b0 * c2)) / A0,
    b2: (b0 * c2 - b1 * c + b2) / A0,
    a1: (2 * (a2 - a0 * c2)) / A0,
    a2: (a0 * c2 - a1 * c + a2) / A0,
    z1: 0,
    z2: 0,
  };
}

/** Run a sample through a cascade (transposed direct form II). */
export function cascade(sections: Biquad[], x: number): number {
  let v = x;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const y = s.b0 * v + s.z1;
    s.z1 = s.b1 * v - s.a1 * y + s.z2;
    s.z2 = s.b2 * v - s.a2 * y;
    v = y;
  }
  return v;
}

/** Normalised (wc = 1 rad/s) 8th-order elliptic low-pass: 0.5 dB ripple, 50 dB stop-band. */
export const ELLIPTIC_8: AnalogSection[] = [
  [0.0031622776601683694, 0, 0.0036428572993765294, 1, 0.6611537751388861, 0.22223702512573468],
  [1, 0, 1.3062226317925407, 1, 0.33176713031450866, 0.6411538318358495],
  [1, 0, 2.073344850713701, 1, 0.11515864384705217, 0.9116409111009698],
  [1, 0, 12.492319150321164, 1, 0.026076820876969185, 1.0050126148553025],
];

/** Normalised 4th-order Butterworth low-pass. */
export const BUTTERWORTH_4: AnalogSection[] = [
  [0, 0, 1, 1, 0.7653668647301797, 1],
  [0, 0, 1, 1, 1.8477590650225735, 1],
];

/** 6th-order Chebyshev band-pass, 88–112 kHz (0.5 dB ripple), in rad/s. */
export const CHEBYSHEV_BPF_100K: AnalogSection[] = [
  [2454147036693401, 0, 0, 1, 41439.19315667425, 304063771334.32367],
  [0, 1, 0, 1, 94467.41257345349, 389099283908.54694],
  [0, 0, 1, 1, 53028.219416779255, 497916118299.00934],
];

/** Coefficient of a one-pole low-pass with the given corner frequency. */
export const onePole = (fc: number, dt: number) => 1 - Math.exp(-2 * Math.PI * fc * dt);

/** TTL input threshold used for every digital input. */
export const HIGH = 1.5;
export const TTL = 5;

/** Standard normal sample (Box–Muller). */
export function gaussian(random: () => number): number {
  let u = 0;
  while (u === 0) u = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}
