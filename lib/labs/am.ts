import type { Bench } from "../guide/bench";
import type { CheckResult } from "../guide/types";
import { F_CARRIER } from "../sim/modules";

/**
 * The AM transmitter of Labs 2 and 3, as the guides see it: its sockets, and
 * checks that measure what the simulated circuit actually produces (message
 * level and DC at the Adder output, P, Q and μ at the Multiplier output).
 */

// ---------------------------------------------------------------- sockets
export const MESSAGE = "master.sine2k";
export const CARRIER = "master.sine100k";
export const ADDER_A = "adder.a";
export const ADDER_B = "adder.b";
export const ADDER_OUT = "adder.out";
export const VDC = "dcv.vdc";
export const CH1 = "scope.ch1";
export const CH2 = "scope.ch2";

/** DC-coupled inputs and output of the three multipliers. The manual's figure uses the second one. */
export const MULTIPLIERS = [
  { x: "mult2.x", y: "mult2.y", out: "mult2.out" },
  { x: "mult1.xdc", y: "mult1.ydc", out: "mult1.out" },
  { x: "mult3.x", y: "mult3.y", out: "mult3.out" },
];

// --------------------------------------------------------- bench readings
export const volts = (v: number, digits = 2) => `${(Math.abs(v) < 0.005 ? 0 : v).toFixed(digits).replace("-", "−")} V`;
export const near = (value: number, target: number, tolerance: number) => Math.abs(value - target) <= tolerance;

/** The multiplier that has the Adder output on one DC input and the 100 kHz sine on the other. */
export function modulator(b: Bench) {
  return (
    MULTIPLIERS.find(
      (m) =>
        (b.linked(m.x, ADDER_OUT) && b.linked(m.y, CARRIER)) || (b.linked(m.y, ADDER_OUT) && b.linked(m.x, CARRIER)),
    ) ?? null
  );
}

/** Message amplitude and DC level actually present at the Adder output. */
export function shifted(b: Bench) {
  const r = b.reading(ADDER_OUT);
  return { vpp: r.vpp, peak: r.vpp / 2, dc: Math.abs(r.mean), signedDc: r.mean };
}

/**
 * P and Q of the signal at the modulator's output, measured from the waveform.
 * Q is negative when the envelope has crossed zero (over-modulation).
 */
export function envelope(b: Bench) {
  const mod = modulator(b);
  if (!mod) return null;
  const dt = 1e-7;
  const [x, s] = b.record([ADDER_OUT, mod.out], { dt });
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < s.length; i++) {
    const a = Math.abs(s[i]);
    if (x[i] >= 0) pos = Math.max(pos, a);
    else neg = Math.max(neg, a);
  }
  const big = Math.max(pos, neg);
  const small = Math.min(pos, neg);
  const P = 2 * big;
  if (P < 0.05) return { P: 0, Q: 0, mu: NaN };
  let Q: number;
  if (small > 0.012 * big) {
    Q = -2 * small; // the lobe on the far side of zero
  } else {
    // Smallest carrier peak: the lowest point of the envelope. |s| peaks once per half cycle.
    const half = Math.round(0.5 / (F_CARRIER * dt));
    let lowest = Infinity;
    for (let start = 0; start + half <= s.length; start += half) {
      let peak = 0;
      for (let i = start; i < start + half; i++) peak = Math.max(peak, Math.abs(s[i]));
      lowest = Math.min(lowest, peak);
    }
    Q = 2 * lowest;
  }
  return { P, Q, mu: (P - Q) / (P + Q) };
}

export const describeEnvelope = (e: { P: number; Q: number; mu: number }) =>
  `From the Multiplier output: P = ${volts(e.P, 1)}, Q = ${volts(e.Q, 1)}, so μ = ${Number.isFinite(e.mu) ? e.mu.toFixed(2) : "∞"}`;

// ----------------------------------------------------------------- checks
export const messageWired = (b: Bench): CheckResult => ({ ok: b.linked(MESSAGE, ADDER_A) });

export const messageLevel = (b: Bench): CheckResult => {
  if (!b.linked(MESSAGE, ADDER_A)) return { ok: false, detail: "The 2 kHz SINE is not on input A yet." };
  const s = shifted(b);
  return { ok: near(s.vpp, 4, 0.12), detail: `Measured at the Adder output: ${s.vpp.toFixed(2)} Vp-p` };
};

export const dcLevel =
  (target: number, tolerance: number) =>
  (b: Bench): CheckResult => {
    if (!b.linked(VDC, ADDER_B)) return { ok: false, detail: "VDC is not connected to input B." };
    const s = shifted(b);
    return {
      ok: near(s.dc, target, tolerance) && near(s.vpp, 4, 0.15),
      detail: `Measured at the Adder output: DC ${volts(s.signedDc)}, message ${s.vpp.toFixed(2)} Vp-p`,
    };
  };

export const depth =
  (target: number, tolerance: number) =>
  (b: Bench): CheckResult => {
    const e = envelope(b);
    if (!e) return { ok: false, detail: "The AM signal is not being generated: check the Multiplier connections." };
    return { ok: near(e.mu, target, tolerance), detail: describeEnvelope(e) };
  };

export const scopeShows = (channel: "ch1" | "ch2") => (b: Bench): CheckResult => {
  const mode = b.controls.scope.mode;
  return { ok: b.controls.scope.power && (mode === channel || mode === "dual"), detail: `MODE is ${mode.toUpperCase()}` };
};

export const steady = (b: Bench): CheckResult => ({
  ok: b.status.triggered && !b.status.floating,
  detail: b.status.floating ? "The scope has no ground reference." : b.status.triggered ? undefined : "The sweep is not triggered.",
});

export const triggerOnMessage = (b: Bench): CheckResult => {
  const s = b.controls.scope;
  return {
    ok: s.trigSource === "int" && s.intTrig === "ch1",
    detail: `Trigger source: ${s.trigSource === "int" ? s.intTrig.toUpperCase() : s.trigSource.toUpperCase()}`,
  };
};

