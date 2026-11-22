import type { Cable } from "../cables/store";
import { TIME_DIV, VOLTS_DIV, type ControlsState, type ScopeControls } from "../controls/store";
import { SCOPE_CHASSIS } from "../ports/promax";
import { PORTS } from "../ports/registry";
import { buildCircuit, runCircuit, type Circuit, type ModuleModel } from "./engine";

/**
 * Oscilloscope acquisition: turns socket voltages into what the CRT would draw.
 * It models the parts of an analogue scope that decide what you see — input
 * coupling, vertical gain and position, the triggered sweep and its magnifier —
 * and leaves all drawing to the screen component.
 */

/** Inputs, then the chassis: every input is measured against the chassis. */
export const SCOPE_PROBES = ["scope.ch1", "scope.ch2", "scope.ext", SCOPE_CHASSIS] as const;

/**
 * Mains pickup on an input whose source shares no ground with the scope.
 * The trainer runs from an isolated supply, so without a ground lead the loop
 * closes only through stray capacitance and the trace rides on mains hum.
 * Assumption: about 2 V peak at 50 Hz; the real figure depends on the bench.
 */
const HUM_PEAK = 2.2;
const MAINS_HZ = 50;

/** Horizontal graticule divisions / vertical graticule divisions. */
export const H_DIVS = 10;
export const V_DIVS = 8;

/** The sweep overscans the graticule slightly, as on the real instrument. */
const SWEEP_DIVS = 10.4;
/** Full travel of the POSITION knobs, in divisions either side of centre. */
const V_POS_RANGE = 5;
const H_POS_RANGE = 5.5;

export interface ScopeTrace {
  channel: "ch1" | "ch2" | "add";
  /** Recorded volts. */
  data: Float32Array;
  /** Fractional sample index where the sweep starts. */
  start: number;
  /** Samples per horizontal division. */
  perDiv: number;
  /** Divisions per volt (negative when inverted). */
  gain: number;
  /** Volts removed before gain (AC coupling). */
  dc: number;
  /** Vertical position in divisions, positive up. */
  offset: number;
  /** True when the input is switched to GND: a flat line at `offset`. */
  flat: boolean;
}

export interface ScopeFrame {
  traces: ScopeTrace[];
  /** Horizontal shift in divisions applied to every trace. */
  xShift: number;
  /** Sweep magnification about the screen centre (1 or 10). */
  mag: number;
  triggered: boolean;
  /** The picture changes from sweep to sweep and must be re-acquired. */
  live: boolean;
  /** Effective seconds per division. */
  tdiv: number;
  /** An input is connected to the trainer but the scope has no ground connection to it. */
  floating: boolean;
  /** Inputs (CH1, CH2, EXT) whose signal node is wired straight to trainer ground. */
  onGround: boolean[];
}

export interface Acquirer {
  acquire(controls: ControlsState, animated: boolean): ScopeFrame;
}

const mean = (a: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i];
  return to > from ? s / (to - from) : 0;
};

const onTrainer = (members: readonly string[]) => members.some((id) => PORTS.get(id)?.device === "emona");

/**
 * Refer every input to the scope chassis, as the instrument does.
 * With the chassis tied to the trainer (ground plug in a socket, or a lead on
 * the binding post) an input reads v(socket) − v(chassis). With no tie it picks
 * up hum. Returns true if any input was left floating.
 */
function referToChassis(circuit: Circuit, buf: Float32Array[], dt: number, lineLocked: boolean): boolean {
  const chassis = buf[3];
  const tied = onTrainer(circuit.members[3]);
  let hum: Float32Array | null = null;
  for (let ch = 0; ch < 3; ch++) {
    if (!onTrainer(circuit.members[ch])) continue; // open input, or the scope's own calibrator
    const data = buf[ch];
    const n = data.length;
    if (tied) {
      for (let i = 0; i < n; i++) data[i] -= chassis[i];
      continue;
    }
    if (!hum) {
      hum = new Float32Array(n);
      // fundamental plus a little 3rd and 5th harmonic, each a rotating phasor
      const phase = lineLocked ? 0 : Math.random() * 2 * Math.PI;
      const parts = [
        { k: 1, a: 1 },
        { k: 3, a: 0.18 },
        { k: 5, a: 0.07 },
      ].map(({ k, a }) => {
        const d = 2 * Math.PI * MAINS_HZ * k * dt;
        return { a: a * HUM_PEAK, s: Math.sin(phase * k), c: Math.cos(phase * k), sd: Math.sin(d), cd: Math.cos(d) };
      });
      for (let i = 0; i < n; i++) {
        let v = (Math.random() - 0.5) * 0.05;
        for (const p of parts) {
          v += p.a * p.s;
          const s2 = p.s * p.cd + p.c * p.sd;
          p.c = p.c * p.cd - p.s * p.sd;
          p.s = s2;
        }
        hum[i] = v;
      }
    }
    for (let i = 0; i < n; i++) data[i] += hum[i];
  }
  return hum !== null;
}

function isConstant(a: Float32Array, from: number, to: number, tol: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = from; i < to; i++) {
    const v = a[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi - lo <= tol;
}

/**
 * First crossing of `level` in the given direction, with hysteresis.
 * Returns a fractional sample index, or -1 if the signal never triggers.
 */
function findTrigger(a: Float32Array, limit: number, level: number, rising: boolean, hyst: number): number {
  let armed = false;
  const sign = rising ? 1 : -1;
  const lv = level * sign;
  for (let i = 0; i < limit; i++) {
    const v = a[i] * sign;
    if (!armed) {
      if (v < lv - hyst) armed = true;
    } else if (v >= lv) {
      const prev = a[i - 1] * sign;
      const span = v - prev;
      return span > 0 ? i - 1 + (lv - prev) / span : i;
    }
  }
  return -1;
}

export function effectiveTimeDiv(s: ScopeControls): number {
  const base = TIME_DIV[s.tdiv] ?? TIME_DIV[0];
  // Uncalibrated sweep: the VARIABLE knob slows the sweep by up to 2.5x.
  return s.sweepCal ? base : base * (1 + (1 - s.sweepVar) * 1.5);
}

export function effectiveVoltsDiv(s: ScopeControls, ch: "ch1" | "ch2"): number {
  const c = s[ch];
  const base = VOLTS_DIV[c.vdiv] ?? VOLTS_DIV[0];
  const mag = ch === "ch1" && s.mag5 ? 5 : 1;
  // Out of the CAL detent the VARIABLE control reduces sensitivity by up to 2.5x.
  return (base / mag) * (1 + (1 - c.variable) * 1.5);
}

/** Create an acquirer for the current patching. Rebuild it whenever the leads change. */
export function createAcquirer(cables: readonly Cable[], models: readonly ModuleModel[]): Acquirer {
  const circuit: Circuit = buildCircuit(cables, models, SCOPE_PROBES);
  let buffers: Float32Array[] | undefined;

  return {
    acquire(controls, animated) {
      const s = controls.scope;
      const tdiv = effectiveTimeDiv(s);
      const mag = s.mag10 ? 10 : 1;
      const sweepTime = SWEEP_DIVS * tdiv;
      const visibleTime = (H_DIVS * tdiv) / mag;

      // Sample period: fine enough for the visible window and for 100 kHz content,
      // but never finer than a 20 MHz instrument could resolve.
      let dt = Math.min(0.2e-6, Math.max(20e-9, visibleTime / 2500));
      const settle = circuit.settle(controls.emona);
      const warmup = settle > 0 ? settle : 8 * dt;
      const cap = animated ? 220_000 : 700_000;

      const usesSignal = s.trigSource !== "line";
      let search = usesSignal ? 1.2e-3 : 0;
      let frame: ScopeFrame | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const needed = (warmup + search + sweepTime) / dt;
        if (needed > cap) dt = (warmup + search + sweepTime) / cap;
        const samples = Math.ceil((search + sweepTime) / dt) + 4;
        // Free-running circuits and untriggered sweeps start at an arbitrary instant.
        const t0 = animated ? Math.random() * 0.25 : 0;
        buffers = runCircuit(circuit, { dt, warmup, samples, t0, controls: controls.emona }, buffers);
        const floating = referToChassis(circuit, buffers, dt, !usesSignal);
        frame = buildFrame(circuit, buffers, s, dt, search, tdiv, mag, floating);
        if (frame.triggered || !usesSignal || attempt === 2) break;
        // No trigger yet: the source may simply be slow. Look further before giving up.
        const next = search * 8;
        if ((warmup + next + sweepTime) / dt > cap * 1.5) break;
        search = next;
      }
      return frame!;
    },
  };
}

function buildFrame(
  circuit: Circuit,
  buf: Float32Array[],
  s: ScopeControls,
  dt: number,
  search: number,
  tdiv: number,
  mag: number,
  floating: boolean,
): ScopeFrame {
  const n = buf[0].length;
  const perDiv = tdiv / dt / 1; // samples per unmagnified division
  const sweepSamples = Math.ceil(SWEEP_DIVS * perDiv);
  const limit = Math.max(2, Math.min(n - sweepSamples, Math.ceil(search / dt)));

  const [b1, b2, bExt] = buf;
  const vd1 = effectiveVoltsDiv(s, "ch1");
  const vd2 = effectiveVoltsDiv(s, "ch2");

  const show1 = s.mode === "ch1" || s.mode === "dual";
  const show2 = s.mode === "ch2" || s.mode === "dual";

  // --- trigger ---
  const trigOn = (src: "ch1" | "ch2" | "ext"): number => {
    if (src === "ext") {
      // EXT input: level knob spans roughly ±2 V around the signal's mean.
      const m = mean(bExt, 0, n);
      return findTrigger(bExt, limit, m + s.level * 2, s.slopeRising, 0.02);
    }
    const data = src === "ch1" ? b1 : b2;
    const vd = src === "ch1" ? vd1 : vd2;
    if (s[src].coupling === "gnd") return -1;
    // The trigger path is AC coupled: the level is measured from the signal's mean,
    // and the knob covers about ±4 divisions of deflection.
    const m = mean(data, 0, n);
    return findTrigger(data, limit, m + s.level * 4 * vd, s.slopeRising, 0.08 * vd);
  };

  let start1 = -1;
  let start2 = -1;
  if (s.trigSource === "ext") {
    start1 = start2 = trigOn("ext");
  } else if (s.trigSource === "int") {
    if (s.intTrig === "vert" && s.mode === "dual") {
      // Alternate triggering: each channel is triggered from itself.
      start1 = trigOn("ch1");
      start2 = trigOn("ch2");
    } else {
      const src = s.intTrig === "vert" ? (s.mode === "ch2" ? "ch2" : "ch1") : s.intTrig;
      start1 = start2 = trigOn(src);
    }
  }

  const lineSync = s.trigSource === "line";
  const triggered = lineSync ? true : start1 >= 0 && start2 >= 0;
  const freeStart = lineSync ? 0 : Math.random() * Math.max(1, limit - 1);
  if (start1 < 0) start1 = s.trigMode === "auto" || lineSync ? freeStart : -1;
  if (start2 < 0) start2 = s.trigMode === "auto" || lineSync ? freeStart : -1;

  // --- vertical ---
  const traces: ScopeTrace[] = [];
  const channel = (ch: "ch1" | "ch2", data: Float32Array, vd: number, start: number): ScopeTrace => {
    const c = s[ch];
    const flat = c.coupling === "gnd";
    const sign = ch === "ch2" && s.invert ? -1 : 1;
    return {
      channel: ch,
      data,
      start,
      perDiv,
      gain: sign / vd,
      dc: c.coupling === "ac" ? mean(data, 0, n) : 0,
      offset: c.pos * V_POS_RANGE,
      flat,
    };
  };

  if (s.mode === "add") {
    if (start1 >= 0) {
      const t1 = channel("ch1", b1, vd1, start1);
      const t2 = channel("ch2", b2, vd2, start1);
      const sum = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        sum[i] = (t1.flat ? 0 : (b1[i] - t1.dc) * t1.gain) + (t2.flat ? 0 : (b2[i] - t2.dc) * t2.gain);
      }
      traces.push({
        channel: "add",
        data: sum,
        start: start1,
        perDiv,
        gain: 1,
        dc: 0,
        offset: t1.offset + t2.offset,
        flat: false,
      });
    }
  } else {
    if (show1 && start1 >= 0) traces.push(channel("ch1", b1, vd1, start1));
    if (show2 && start2 >= 0) traces.push(channel("ch2", b2, vd2, start2));
  }

  // An unsynchronised sweep only looks different from frame to frame if something moves.
  const moving = traces.some((t) => !t.flat && !isConstant(t.data, 0, n, 1e-4 / Math.abs(t.gain || 1)));
  const live = moving && (!triggered || lineSync || circuit.freeRunning || floating);

  return {
    traces,
    xShift: s.hpos * H_POS_RANGE * (mag > 1 ? mag : 1),
    mag,
    triggered: triggered && moving,
    live,
    tdiv: tdiv / mag,
    floating,
    onGround: [0, 1, 2].map((ch) => circuit.probes[ch].grounded),
  };
}
