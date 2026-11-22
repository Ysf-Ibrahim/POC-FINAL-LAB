"use client";

import { useMemo, useRef, useState } from "react";
import type { Cable } from "@/lib/cables/store";
import { controlsStore, type EmonaControls } from "@/lib/controls/store";
import { buildCircuit, runCircuit } from "@/lib/sim/engine";
import { MODULE_MODELS, tlpfCutoff, twinWidth, vcoLaw, vcoSensitivity } from "@/lib/sim/modules";

/**
 * The zero-crossing receiver, stage by stage.
 *
 * Every row is produced by the simulator's own module models (VCO, comparator,
 * twin pulse generator, Tuneable LPF, buffer) run through the signal engine on
 * a virtual copy of the circuit, so the explorer and the bench always agree.
 */

type RowKey = "message" | "fm" | "comparator" | "pulses" | "lpf" | "out";
type Ctrl = "fc" | "dev" | "tau" | "cutoff" | "gain";
type Stage = "comparator" | "zcd" | "lpf" | "buffer";

export interface DemodValues {
  /** VCO rest frequency, kHz (LO range). */
  fc: number;
  /** Peak deviation for the 2 V-peak message, kHz. */
  dev: number;
  /** Pulse width, µs. */
  tau: number;
  /** Low-pass cutoff, kHz. */
  cutoff: number;
  /** Buffer gain. */
  gain: number;
}

const DEFAULTS: DemodValues = { fc: 10, dev: 2, tau: 12, cutoff: 3, gain: 4 };
const MESSAGE_PEAK = 2; // V, the trainer's 2 kHz sine
const LO = { lo: 1000, top: 17000 };
const WINDOW = 1e-3; // s shown
const DT = 0.25e-6;
const W = 348;
const LABEL_W = 70;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fmt = (v: number, d = 2) => {
  const s = v.toFixed(d);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

/** Knob positions that make the trainer's models produce these values. */
function toControls(v: DemodValues): EmonaControls {
  return {
    knobs: {
      "vco.freq": clamp((v.fc * 1000 - LO.lo) / (LO.top - LO.lo), 0, 1),
      "vco.gain": clamp(v.dev / (MESSAGE_PEAK * ((LO.top - LO.lo) / 6000)), 0, 1),
      "twin.width": clamp((v.tau - 5) / 35, 0, 1),
      "twin.delay": 0,
      "tlpf.fc": clamp(Math.log(v.cutoff / 0.6) / Math.log(20), 0, 1),
      "tlpf.gain": 0.5,
      "buffer.gain": clamp(v.gain / 10, 0, 1),
    },
    switches: { "vco.range": 1 },
  };
}

const lead = (a: string, b: string, i: number): Cable => ({ id: `x${i}`, a, b, color: "red" });
const CABLES: Cable[] = [
  ["master.sine2k", "vco.in"],
  ["vco.sine", "comparator.in"],
  ["comparator.ref", "gnd.left"],
  ["comparator.out", "twin.clk"],
  ["twin.q1", "tlpf.in"],
  ["tlpf.out", "buffer.in"],
].map(([a, b], i) => lead(a, b, i));
const PROBES: Record<RowKey, string> = {
  message: "master.sine2k",
  fm: "vco.sine",
  comparator: "comparator.out",
  pulses: "twin.q1",
  lpf: "tlpf.out",
  out: "buffer.out",
};

function simulate(v: DemodValues) {
  const controls = toControls(v);
  const keys = Object.keys(PROBES) as RowKey[];
  const probeIds = keys.map((k) => `probe.${k}`);
  const circuit = buildCircuit([...CABLES, ...keys.map((k, i) => lead(PROBES[k], probeIds[i], 100 + i))], MODULE_MODELS, probeIds);
  const data = runCircuit(circuit, {
    dt: DT,
    warmup: Math.min(8e-3, circuit.settle(controls) + 1e-3),
    samples: Math.round(WINDOW / DT),
    t0: 0,
    controls,
    random: () => 0.37, // the VCO's starting phase, fixed so the picture does not jump
  });
  const rows = Object.fromEntries(keys.map((k, i) => [k, data[i]])) as Record<RowKey, Float32Array>;
  const law = vcoLaw(controls);
  return {
    rows,
    law,
    k: vcoSensitivity(controls),
    tau: twinWidth(controls),
    cutoff: tlpfCutoff(controls),
  };
}

const ROWS: Record<RowKey, { name: string; sub: string; cls: string; zero?: boolean; range?: [number, number] }> = {
  message: { name: "Message", sub: "2 kHz in", cls: "f-message", range: [-2.4, 2.4] },
  fm: { name: "FM", sub: "VCO output", cls: "f-am", range: [-2.4, 2.4] },
  comparator: { name: "Comparator", sub: "0 / 5 V", cls: "f-am", range: [-0.4, 5.4] },
  pulses: { name: "ZCD pulses", sub: "fixed width", cls: "f-am", range: [-0.4, 5.4] },
  lpf: { name: "LPF out", sub: "the average", cls: "f-message" },
  out: { name: "Buffer out", sub: "amplified", cls: "f-message" },
};

interface StageInfo {
  title: string;
  input: RowKey;
  output: RowKey;
  changed: string;
  why: string;
  kept: string;
}
const STAGES: Record<Stage, StageInfo> = {
  comparator: {
    title: "Comparator",
    input: "fm",
    output: "comparator",
    changed: "The sine becomes a square wave: 5 V while the input is above 0 V, 0 V while it is below.",
    why: "The pulse generator needs one sharp, clean edge per cycle to trigger on.",
    kept: "The timing of every zero crossing, so the frequency and its changes. The height of the sine is thrown away.",
  },
  zcd: {
    title: "Zero-crossing detector",
    input: "comparator",
    output: "pulses",
    changed: "Each rising edge starts one pulse of a fixed width. The high time is now the same in every cycle; only the gaps change.",
    why: "With a fixed high time, more pulses per second means more time spent high: the duty cycle now follows the frequency.",
    kept: "One pulse per FM cycle, so the pulse rate is the FM frequency.",
  },
  lpf: {
    title: "Low-pass filter",
    input: "pulses",
    output: "lpf",
    changed: "The fast pulses are smoothed away. What is left is their running average: a slow wave plus a DC level.",
    why: "The average of the pulses rises where they crowd together and falls where they spread out, exactly as the message did.",
    kept: "The changes at message rate (2 kHz). The 10 kHz pulse rate and its harmonics are removed.",
  },
  buffer: {
    title: "Buffer amplifier",
    input: "lpf",
    output: "out",
    changed: "The recovered wave is made larger. Its shape and frequency are not changed.",
    why: "The filter's output is small; the buffer brings it to a useful level and drives the next stage without loading the filter.",
    kept: "Everything about the waveform except its size.",
  },
};

const SLIDERS: Record<Ctrl, { label: string; min: number; max: number; step: number; unit: string }> = {
  fc: { label: "VCO rest frequency", min: 4, max: 16, step: 0.5, unit: "kHz" },
  dev: { label: "Frequency deviation", min: 0, max: 5, step: 0.1, unit: "kHz" },
  tau: { label: "Pulse width", min: 5, max: 40, step: 0.5, unit: "µs" },
  cutoff: { label: "LPF cutoff", min: 0.6, max: 12, step: 0.1, unit: "kHz" },
  gain: { label: "Buffer gain", min: 0, max: 10, step: 0.1, unit: "×" },
};

/** Samples at each end of a centred running average that see only part of their window. */
const half = (a: Float32Array) => Math.floor(a.length / 40);

function pathOf(v: Float32Array, yOf: (x: number) => number) {
  const n = v.length;
  const step = Math.max(1, Math.floor(n / 1400));
  let d = "";
  for (let i = 0; i < n; i += step) {
    // keep the narrow pulses: use the max or min of each bucket, whichever is further from the last point
    let pick = v[i];
    for (let j = i; j < Math.min(n, i + step); j++) if (Math.abs(v[j] - (i ? v[i - 1] : v[0])) > Math.abs(pick - (i ? v[i - 1] : v[0]))) pick = v[j];
    d += `${i ? "L" : "M"}${(LABEL_W + ((W - LABEL_W - 2) * i) / (n - 1)).toFixed(1)} ${yOf(pick).toFixed(1)}`;
  }
  return d;
}

export function DemodExplorer({
  rows = ["message", "fm", "comparator", "pulses", "lpf", "out"],
  controls = [],
  stages = false,
  initial,
  bench = false,
  caption,
}: {
  rows?: RowKey[];
  controls?: Ctrl[];
  /** Show the receiver chain as selectable stages. */
  stages?: boolean;
  initial?: Partial<DemodValues>;
  bench?: boolean;
  caption?: string;
}) {
  const [v, setV] = useState<DemodValues>({ ...DEFAULTS, ...initial });
  const [stage, setStage] = useState<Stage | null>(stages ? "zcd" : null);
  const [cursor, setCursor] = useState(0.125e-3);
  const [loaded, setLoaded] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const sim = useMemo(() => simulate(v), [v]);

  const n = sim.rows.message.length;
  const ci = clamp(Math.round((cursor / WINDOW) * (n - 1)), 0, n - 1);
  const m = sim.rows.message[ci];
  const fInst = sim.law(m);
  const tau = sim.tau;
  const fMax = sim.law(MESSAGE_PEAK);
  const fMin = sim.law(-MESSAGE_PEAK);
  const overlap = tau >= 1 / fMax;
  const stat = (key: RowKey) => {
    const a = sim.rows[key];
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      lo = Math.min(lo, a[i]);
      hi = Math.max(hi, a[i]);
      sum += a[i];
    }
    return { lo, hi, mean: sum / a.length, pp: hi - lo };
  };
  const lpf = stat("lpf");
  const out = stat("out");

  // The pulses' own running average over one rest period, centred: what the filter is after, without its delay.
  const avgLine = useMemo(() => {
    const p = sim.rows.pulses;
    const w = Math.max(1, Math.round(1 / (sim.law(0) * DT)));
    const half = Math.floor(w / 2);
    const prefix = new Float64Array(p.length + 1);
    for (let i = 0; i < p.length; i++) prefix[i + 1] = prefix[i] + p[i];
    const a = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) {
      const lo = Math.max(0, i - half);
      const hi = Math.min(p.length, i + half + 1);
      a[i] = (prefix[hi] - prefix[lo]) / (hi - lo);
    }
    return a;
  }, [sim]);

  const active = stage ? STAGES[stage] : null;
  const rowH = 46;
  const top = (i: number) => 4 + i * rowH;

  const move = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((clientX - r.left) / r.width) * W;
    setCursor(clamp(((x - LABEL_W) / (W - LABEL_W - 2)) * WINDOW, 0, WINDOW));
  };

  const loadBench = () => {
    const c = controlsStore.get().emona;
    const law = vcoLaw(c);
    const next: DemodValues = {
      ...v,
      fc: Math.round(law(0) / 100) / 10,
      dev: Math.round((vcoSensitivity(c) * MESSAGE_PEAK) / 100) / 10,
      tau: Math.round(twinWidth(c) * 1e7) / 10,
    };
    setV(next);
    setLoaded(`From your bench: rest ${fmt(next.fc, 1)} kHz, deviation ${fmt(next.dev, 1)} kHz, pulse width ${fmt(next.tau, 1)} µs.`);
  };

  return (
    <figure className="fmx dmx">
      {stages && (
        <div className="dmx-chain" role="group" aria-label="Receiver stages">
          <span className="dmx-node">FM in</span>
          {(Object.keys(STAGES) as Stage[]).map((s) => (
            <button key={s} type="button" className={stage === s ? "is-on" : ""} aria-pressed={stage === s} onClick={() => setStage(stage === s ? null : s)}>
              {STAGES[s].title.replace("Zero-crossing detector", "ZCD").replace("Low-pass filter", "LPF").replace("Buffer amplifier", "Buffer")}
            </button>
          ))}
          <span className="dmx-node">Message out</span>
        </div>
      )}
      <svg
        ref={svg}
        className="g-svg fmx-plot"
        viewBox={`0 0 ${W} ${rows.length * rowH + 20}`}
        role="img"
        aria-label={`Receiver signals over ${WINDOW * 1000} ms: ${rows.map((r) => ROWS[r].name).join(", ")}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons) move(e.clientX);
        }}
      >
        {rows.map((key, i) => {
          const spec = ROWS[key];
          const s = stat(key);
          const [lo, hi] = spec.range ?? [s.lo - 0.08 * (s.pp || 1), s.hi + 0.08 * (s.pp || 1)];
          const yOf = (x: number) => top(i) + 3 + (rowH - 8) * (1 - (x - lo) / (hi - lo || 1));
          const dim = active && key !== active.input && key !== active.output;
          return (
            <g key={key} className={dim ? "f-dim" : ""}>
              {active && (key === active.input || key === active.output) && (
                <rect x={0} y={top(i)} width={W} height={rowH - 1} rx={4} className={key === active.input ? "dmx-in" : "dmx-out"} />
              )}
              <text x={2} y={top(i) + rowH / 2 - 2} className="f-label">
                {spec.name}
              </text>
              <text x={2} y={top(i) + rowH / 2 + 10} className="f-sub">
                {active && key === active.input ? "input" : active && key === active.output ? "output" : spec.sub}
              </text>
              {spec.range && <line x1={LABEL_W} x2={W - 2} y1={yOf(0)} y2={yOf(0)} className="f-axis" />}
              {key === "lpf" && (() => {
                // the undelayed average, on its own scale over the same row
                let a0 = Infinity;
                let a1 = -Infinity;
                for (let i = half(avgLine); i < avgLine.length - half(avgLine); i++) {
                  a0 = Math.min(a0, avgLine[i]);
                  a1 = Math.max(a1, avgLine[i]);
                }
                const yA = (x: number) => top(i) + 3 + (rowH - 8) * (1 - (x - a0) / (a1 - a0 || 1));
                return <path d={pathOf(avgLine, yA)} className="f-env" />;
              })()}
              <path d={pathOf(sim.rows[key], yOf)} className={spec.cls} />
            </g>
          );
        })}
        <line x1={LABEL_W + ((W - LABEL_W - 2) * ci) / (n - 1)} x2={LABEL_W + ((W - LABEL_W - 2) * ci) / (n - 1)} y1={2} y2={rows.length * rowH + 2} className="fmx-cursor" />
        <text x={LABEL_W} y={rows.length * rowH + 16} className="f-sub">
          0
        </text>
        <text x={W - 2} y={rows.length * rowH + 16} textAnchor="end" className="f-sub">
          1 ms · drag across to move the cursor
        </text>
      </svg>

      {active && (
        <dl className="dmx-stage">
          <div>
            <dt>What changed</dt>
            <dd>{active.changed}</dd>
          </div>
          <div>
            <dt>Why</dt>
            <dd>{active.why}</dd>
          </div>
          <div>
            <dt>What is kept</dt>
            <dd>{active.kept}</dd>
          </div>
        </dl>
      )}

      <div className="fmx-readout" aria-live="polite">
        <span>At the cursor</span>
        <strong>
          message {fmt(m)} V → FM {fmt(fInst / 1000)} kHz → period {fmt(1e6 / fInst, 0)} µs
        </strong>
        <em>
          duty cycle τ·f = {fmt(tau * 1e6, 1)} µs × {fmt(fInst / 1000)} kHz = {fmt(100 * tau * fInst, 1)} % → pulse average 5 V ×{" "}
          {fmt(tau * fInst, 3)} = {fmt(5 * tau * fInst, 2)} V
        </em>
      </div>
      <dl className="fmx-stats">
        <div>
          <dt>FM swings</dt>
          <dd>
            {fmt(fMin / 1000, 1)}–{fmt(fMax / 1000, 1)} kHz
          </dd>
        </div>
        <div>
          <dt>Duty cycle</dt>
          <dd>
            {fmt(100 * tau * fMin, 1)}–{fmt(100 * tau * fMax, 1)} %
          </dd>
        </div>
        <div>
          <dt>Shortest period</dt>
          <dd>{fmt(1e6 / fMax, 0)} µs</dd>
        </div>
        <div>
          <dt>LPF out</dt>
          <dd>
            {fmt(lpf.pp, 2)} Vp-p
          </dd>
        </div>
        <div>
          <dt>LPF DC level</dt>
          <dd>{fmt(lpf.mean, 2)} V</dd>
        </div>
        <div>
          <dt>Buffer out</dt>
          <dd>{fmt(out.pp, 2)} Vp-p</dd>
        </div>
      </dl>
      {overlap && (
        <p className="fmx-warn">
          The pulse width ({fmt(tau * 1e6, 1)} µs) is longer than the shortest FM period ({fmt(1e6 / fMax, 0)} µs): pulses run into each
          other and the average stops following the frequency.
        </p>
      )}

      {controls.length > 0 && (
        <div className="fmx-controls">
          {controls.map((key) => {
            const s = SLIDERS[key];
            return (
              <label key={key} className="fmx-control">
                <span>
                  {s.label}
                  <output>
                    {key === "gain" ? `× ${fmt(v[key], 1)}` : `${fmt(v[key], 1)} ${s.unit}`}
                  </output>
                </span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={v[key]}
                  aria-label={s.label}
                  onChange={(e) => {
                    setLoaded(null);
                    setV({ ...v, [key]: Number(e.target.value) });
                  }}
                />
              </label>
            );
          })}
        </div>
      )}
      {bench && (
        <div className="fmx-bench">
          <button type="button" className="g-button" onClick={loadBench}>
            Load my settings
          </button>
          {loaded && <span>{loaded}</span>}
        </div>
      )}
      <figcaption>
        {caption ??
          "All rows come from the trainer's own module models run over the same 1 ms. The LPF row uses the Tuneable LPF's model so its cutoff can be changed. On it, dashed: the pulses' average over each 100 µs, which rises and falls exactly with the message; solid: the filter's output, the same thing a little later, because every filter delays."}
      </figcaption>
    </figure>
  );
}
