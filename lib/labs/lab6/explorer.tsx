"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { Cable } from "@/lib/cables/store";
import type { EmonaControls } from "@/lib/controls/store";
import { buildCircuit, runCircuit, type ModuleModel } from "@/lib/sim/engine";
import { MODULE_MODELS, tlpfCutoff } from "@/lib/sim/modules";

/**
 * Sampling and reconstruction on one time axis.
 *
 * The rows are produced by the simulator's own models of the DUAL ANALOG
 * SWITCH (natural sampling, and the sample-and-hold clocked by CONTROL 1) and
 * of the TUNEABLE LPF, run through the signal engine. Only the source differs
 * from the bench: MASTER SIGNALS is replaced by a message and a sampling clock
 * whose frequency, phase and duty cycle can be changed. Every number shown is
 * read off those simulated waveforms.
 */

type RowKey = "message" | "clock" | "natural" | "hold" | "recon";
type Ctrl = "fs" | "fm" | "phase" | "duty" | "cutoff";
export type Method = "natural" | "hold";

export interface SamplingValues {
  /** Sampling frequency, kHz. */
  fs: number;
  /** Message frequency, kHz. */
  fm: number;
  /** Clock phase relative to the message, degrees. 0: the clock rises at the sine's upward zero crossing. */
  phase: number;
  /** Fraction of each clock period the clock is high (the switch is closed). */
  duty: number;
  /** Tuneable LPF cutoff, kHz. */
  cutoff: number;
  /** Which sampled signal the filter reconstructs. */
  method: Method;
}

const DEFAULTS: SamplingValues = {
  fs: 8,
  fm: 2,
  phase: 0,
  duty: 0.5,
  cutoff: 3.6,
  method: "natural",
};
const PEAK = 2; // V: the trainer's 4 Vp-p sine
const SHOW = 1e-3; // s drawn
const RECORD = 8e-3; // s simulated after warm-up (for the frequency and spectrum measurements)
const DT = 0.25e-6;
const W = 348;
const LABEL_W = 74;
const SPEC_MAX = 25_000;
const SPEC_DF = 125;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fmt = (v: number, d = 2) => {
  const s = v.toFixed(d);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};
const kHz = (hz: number) => `${fmt(hz / 1000, hz < 10_000 ? 2 : 1)} kHz`;
const time = (s: number) =>
  s >= 1e-3 ? `${fmt(s * 1e3, 2)} ms` : `${fmt(s * 1e6, 1)} µs`;

// ------------------------------------------------------------- simulation
const TLPF = MODULE_MODELS.find((m) => m.id === "tlpf")!;
/** A second, identical Tuneable LPF, so both sampled signals can be filtered side by side. */
const TLPF_HOLD: ModuleModel = {
  ...TLPF,
  id: "tlpf.hold",
  inputs: ["tlpfh.in"],
  outputs: ["tlpfh.out", "tlpfh.clk"],
};

function source(v: SamplingValues): ModuleModel {
  const fm = v.fm * 1000;
  const fs = v.fs * 1000;
  const shift = v.phase / 360;
  return {
    id: "master",
    inputs: [],
    outputs: ["master.sine2k", "master.dig8k"],
    create: () => (_inp, out, t) => {
      out[0] = PEAK * Math.sin(2 * Math.PI * fm * t);
      const p = fs * t - shift;
      out[1] = p - Math.floor(p) < v.duty ? 5 : 0;
    },
  };
}

const lead = (a: string, b: string, i: number): Cable => ({
  id: `s${i}`,
  a,
  b,
  color: "red",
});
const CABLES: Cable[] = [
  ["master.sine2k", "switch.in2"],
  ["master.dig8k", "switch.ctrl2"],
  ["master.sine2k", "switch.shIn"],
  ["master.dig8k", "switch.ctrl1"],
  ["switch.out", "tlpf.in"],
  ["switch.shOut", "tlpfh.in"],
].map(([a, b], i) => lead(a, b, i));
const PROBES = {
  message: "master.sine2k",
  clock: "master.dig8k",
  natural: "switch.out",
  hold: "switch.shOut",
  reconNatural: "tlpf.out",
  reconHold: "tlpfh.out",
} as const;
type ProbeKey = keyof typeof PROBES;

function knobsFor(v: SamplingValues): EmonaControls {
  return {
    knobs: {
      "tlpf.fc": clamp(Math.log(v.cutoff / 0.6) / Math.log(20), 0, 1),
      "tlpf.gain": 0.5,
    },
    switches: {},
  };
}

function simulate(v: SamplingValues) {
  const controls = knobsFor(v);
  const models = [
    ...MODULE_MODELS.filter((m) => m.id !== "master"),
    source(v),
    TLPF_HOLD,
  ];
  const keys = Object.keys(PROBES) as ProbeKey[];
  const ids = keys.map((k) => `probe.${k}`);
  const circuit = buildCircuit(
    [...CABLES, ...keys.map((k, i) => lead(PROBES[k], ids[i], 50 + i))],
    models,
    ids,
  );
  const warm = Math.round((circuit.settle(controls) + 1e-3) / DT);
  const data = runCircuit(circuit, {
    dt: DT,
    warmup: warm * DT,
    samples: Math.round(RECORD / DT),
    t0: -warm * DT, // recording starts at t = 0, where the clock phase is defined
    controls,
  });
  return Object.fromEntries(keys.map((k, i) => [k, data[i]])) as Record<
    ProbeKey,
    Float32Array
  >;
}

/** Frequency from rising crossings of the mean, with hysteresis; 0 when the signal is flat. */
function measureFrequency(v: Float32Array) {
  let mean = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < v.length; i++) {
    mean += v[i];
    lo = Math.min(lo, v[i]);
    hi = Math.max(hi, v[i]);
  }
  mean /= v.length;
  if (hi - lo < 0.05) return 0;
  const hyst = (hi - lo) * 0.1;
  let armed = false;
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = 1; i < v.length; i++) {
    const a = v[i - 1] - mean;
    const b = v[i] - mean;
    if (b < -hyst) armed = true;
    if (armed && a < 0 && b >= 0) {
      const t = (i - 1 + -a / (b - a)) * DT;
      if (first < 0) first = t;
      last = t;
      count++;
      armed = false;
    }
  }
  return count >= 2 ? (count - 1) / (last - first) : 0;
}

/** Amplitude spectrum (peak volts) from 0 to 25 kHz, Hann window, by Goertzel. */
function spectrum(x: Float32Array) {
  const n = x.length;
  const win = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++)
    sum += win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  const bins = Math.floor(SPEC_MAX / SPEC_DF) + 1;
  const out = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    const w = 2 * Math.PI * k * SPEC_DF * DT;
    const coeff = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const s = x[i] * win[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s;
    }
    const mag = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2));
    out[k] = ((k === 0 ? 1 : 2) * mag) / sum;
  }
  return out;
}

/** What the samples alone say: the lowest frequency that fits them. */
export function aliasOf(fm: number, fs: number) {
  return Math.abs(fm - Math.round(fm / fs) * fs);
}

// ----------------------------------------------------------------- display
const ROWS: Record<
  RowKey,
  {
    name: string;
    sub: string;
    cls: string;
    range: [number, number];
    ghost?: boolean;
  }
> = {
  message: {
    name: "Message",
    sub: "the analog input",
    cls: "f-message",
    range: [-2.5, 2.5],
  },
  clock: {
    name: "Clock",
    sub: "sampling, 0/5 V",
    cls: "f-am",
    range: [-0.5, 5.5],
  },
  natural: {
    name: "Natural",
    sub: "switch OUT",
    cls: "f-am",
    range: [-2.5, 2.5],
    ghost: true,
  },
  hold: {
    name: "Held",
    sub: "S&H OUT",
    cls: "f-am",
    range: [-2.5, 2.5],
    ghost: true,
  },
  recon: {
    name: "LPF out",
    sub: "reconstructed",
    cls: "f-message",
    range: [-2.5, 2.5],
    ghost: true,
  },
};

const SLIDERS: Record<Ctrl, { label: string; unit: string }> = {
  fs: { label: "Sampling frequency fs", unit: "kHz" },
  fm: { label: "Message frequency fm", unit: "kHz" },
  phase: { label: "Clock phase", unit: "°" },
  duty: { label: "Pulse width (duty cycle)", unit: "%" },
  cutoff: { label: "LPF cutoff", unit: "kHz" },
};

/** Log scales for the frequency sliders: position 0–1000. */
const FS_RANGE = [1, 100];
const CUT_RANGE = [0.6, 12];
const toPos = (v: number, [a, b]: number[]) =>
  Math.round((1000 * Math.log(v / a)) / Math.log(b / a));
const fromPos = (p: number, [a, b]: number[]) => a * Math.pow(b / a, p / 1000);

function pathOf(v: Float32Array, n: number, yOf: (x: number) => number) {
  const step = Math.max(1, Math.floor(n / 1400));
  let d = "";
  let prev = v[0];
  for (let i = 0; i < n; i += step) {
    // keep narrow pulses: from each bucket, take the sample furthest from the previous point
    let pick = v[i];
    for (let j = i; j < Math.min(n, i + step); j++)
      if (Math.abs(v[j] - prev) > Math.abs(pick - prev)) pick = v[j];
    prev = pick;
    d += `${i ? "L" : "M"}${(LABEL_W + ((W - LABEL_W - 2) * i) / (n - 1)).toFixed(1)} ${yOf(pick).toFixed(1)}`;
  }
  return d;
}

export function SamplingExplorer({
  rows = ["message", "clock", "natural", "hold", "recon"],
  controls = [],
  presets,
  initial,
  methodToggle = false,
  spectrumView = false,
  samples = true,
  analysis = false,
  caption,
}: {
  rows?: RowKey[];
  controls?: Ctrl[];
  /** Sampling-frequency buttons, in kHz. */
  presets?: number[];
  initial?: Partial<SamplingValues>;
  /** Let the student choose which sampled signal the LPF reconstructs. */
  methodToggle?: boolean;
  spectrumView?: boolean;
  /** Mark the sampling instants and allow stepping through them. */
  samples?: boolean;
  /** Show the Nyquist analysis (rate, nearest image, verdict), once it has been taught. */
  analysis?: boolean;
  caption?: string;
}) {
  const [v, setV] = useState<SamplingValues>({ ...DEFAULTS, ...initial });
  const live = useDeferredValue(v);
  const [cursor, setCursor] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const sim = useMemo(() => simulate(live), [live]);
  const recon = live.method === "hold" ? sim.reconHold : sim.reconNatural;
  const spec = useMemo(
    () =>
      spectrumView
        ? {
            input: spectrum(live.method === "hold" ? sim.hold : sim.natural),
            output: spectrum(recon),
          }
        : null,
    [spectrumView, sim, recon, live.method],
  );

  const fs = live.fs * 1000;
  const fm = live.fm * 1000;
  const n = Math.round(SHOW / DT);
  const rowData: Record<RowKey, Float32Array> = {
    message: sim.message,
    clock: sim.clock,
    natural: sim.natural,
    hold: sim.hold,
    recon,
  };
  const xOf = (t: number) => LABEL_W + ((W - LABEL_W - 2) * t) / SHOW;

  // Sampling instants: the clock's rising edges inside the window (the S&H captures there).
  const instants: number[] = [];
  for (let k = Math.ceil(-live.phase / 360); ; k++) {
    const t = (k + live.phase / 360) / fs;
    if (t > SHOW) break;
    if (t >= 0) instants.push(t);
  }
  const heldAfter = (t: number) =>
    sim.hold[Math.min(sim.hold.length - 1, Math.round(t / DT) + 2)];

  // Measurements over the whole 8 ms record, after the window.
  const recF = measureFrequency(recon);
  let rlo = Infinity;
  let rhi = -Infinity;
  for (let i = 0; i < recon.length; i++) {
    rlo = Math.min(rlo, recon[i]);
    rhi = Math.max(rhi, recon[i]);
  }
  const recVpp = rhi - rlo;
  const alias = aliasOf(fm, fs);
  const ratio = fs / fm;
  const nyquist =
    Math.abs(fs - 2 * fm) / (2 * fm) < 0.01
      ? "at"
      : fs > 2 * fm
        ? "above"
        : "below";

  const rowH = 46;
  const top = (i: number) => 4 + i * rowH;
  const move = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((clientX - r.left) / r.width) * W;
    setCursor(clamp(((x - LABEL_W) / (W - LABEL_W - 2)) * SHOW, 0, SHOW));
  };
  const stepTo = (dir: 1 | -1) => {
    const now = cursor ?? -1;
    const next =
      dir > 0
        ? instants.find((t) => t > now + 1e-9)
        : [...instants].reverse().find((t) => t < now - 1e-9);
    if (next !== undefined) setCursor(next);
  };
  // read just after the cursor, so a cursor on a sampling instant shows the sample just taken
  const ci = cursor === null ? -1 : clamp(Math.round(cursor / DT) + 2, 0, n - 1);
  const lastInstant =
    cursor === null
      ? undefined
      : [...instants].reverse().find((t) => t <= cursor + 1e-9);
  const set = (patch: Partial<SamplingValues>) => setV({ ...v, ...patch });

  return (
    <figure className="fmx smx">
      {presets && (
        <div className="fmx-slope smx-row">
          <span>Sampling clock</span>
          <div role="group" aria-label="Sampling frequency">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className={Math.abs(v.fs - p) < 1e-6 ? "is-on" : ""}
                aria-pressed={Math.abs(v.fs - p) < 1e-6}
                onClick={() => set({ fs: p })}
              >
                {p} kHz
              </button>
            ))}
          </div>
        </div>
      )}
      {methodToggle && (
        <div className="fmx-slope smx-row">
          <span>Filter the</span>
          <div role="group" aria-label="Signal sent to the LPF">
            {(["natural", "hold"] as Method[]).map((m) => (
              <button
                key={m}
                type="button"
                className={v.method === m ? "is-on" : ""}
                aria-pressed={v.method === m}
                onClick={() => set({ method: m })}
              >
                {m === "natural" ? "Natural samples" : "Sample-and-hold"}
              </button>
            ))}
          </div>
        </div>
      )}
      <svg
        ref={svg}
        className="g-svg fmx-plot"
        viewBox={`0 0 ${W} ${rows.length * rowH + 20}`}
        role="img"
        aria-label={`Sampling signals over 1 ms: ${rows.map((r) => ROWS[r].name).join(", ")}. Message ${kHz(fm)}, sampling ${kHz(fs)}.`}
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
          const [lo, hi] = spec.range;
          const yOf = (x: number) =>
            top(i) + 3 + (rowH - 8) * (1 - (x - lo) / (hi - lo));
          const sub =
            key === "recon"
              ? live.method === "hold"
                ? "from S&H"
                : "from natural"
              : spec.sub;
          return (
            <g key={key}>
              <text x={2} y={top(i) + rowH / 2 - 2} className="f-label">
                {spec.name}
              </text>
              <text x={2} y={top(i) + rowH / 2 + 10} className="f-sub">
                {sub}
              </text>
              <line
                x1={LABEL_W}
                x2={W - 2}
                y1={yOf(0)}
                y2={yOf(0)}
                className="f-axis"
              />
              {spec.ghost && (
                <path d={pathOf(sim.message, n, yOf)} className="f-ghost" />
              )}
              <path d={pathOf(rowData[key], n, yOf)} className={spec.cls} />
              {samples &&
                key === "message" &&
                instants.map((t) => (
                  <circle
                    key={t}
                    cx={xOf(t)}
                    cy={yOf(heldAfter(t))}
                    r={2.6}
                    className="fmx-dot"
                  />
                ))}
              {samples &&
                key === "clock" &&
                instants.map((t) => (
                  <line
                    key={t}
                    x1={xOf(t)}
                    x2={xOf(t)}
                    y1={top(i) + 2}
                    y2={top(i) + rowH - 4}
                    className="f-guide"
                  />
                ))}
            </g>
          );
        })}
        {cursor !== null && (
          <line
            x1={xOf(cursor)}
            x2={xOf(cursor)}
            y1={2}
            y2={rows.length * rowH + 2}
            className="fmx-cursor"
          />
        )}
        <text x={LABEL_W} y={rows.length * rowH + 16} className="f-sub">
          0
        </text>
        <text
          x={W - 2}
          y={rows.length * rowH + 16}
          textAnchor="end"
          className="f-sub"
        >
          1 ms · drag across to read values
        </text>
      </svg>

      {samples && (
        <div className="smx-step">
          <button
            type="button"
            className="quiz-again"
            onClick={() => stepTo(-1)}
            aria-label="Previous sampling instant"
          >
            ◀ Previous sample
          </button>
          <button
            type="button"
            className="quiz-again"
            onClick={() => stepTo(1)}
            aria-label="Next sampling instant"
          >
            Next sample ▶
          </button>
        </div>
      )}
      <div className="fmx-readout" aria-live="polite">
        <span>
          {cursor === null ? "Sampling instants" : `At t = ${time(cursor)}`}
        </span>
        {cursor === null ? (
          <strong>
            One every T<sub>s</sub> = 1/{kHz(fs)} = {time(1 / fs)}: the dots.
            Press Next sample, or drag across the plot.
          </strong>
        ) : (
          <>
            <strong>
              message {fmt(sim.message[ci])} V · clock{" "}
              {sim.clock[ci] > 2.5 ? "high: switch closed" : "low: switch open"}
            </strong>
            <em>
              natural output {fmt(sim.natural[ci])} V
              {sim.clock[ci] > 2.5
                ? " (follows the message)"
                : " (0 V while open)"}{" "}
              · held {fmt(sim.hold[ci])} V
              {lastInstant !== undefined
                ? ` (captured at ${time(lastInstant)})`
                : " (captured before the window)"}
              {rows.includes("recon") ? ` · LPF out ${fmt(recon[ci])} V` : ""}
            </em>
          </>
        )}
      </div>
      <dl className="fmx-stats">
        <div>
          <dt>Samples per cycle</dt>
          <dd>
            f<sub>s</sub>/f<sub>m</sub> = {fmt(ratio, 1)}
          </dd>
        </div>
        {analysis ? (
          <>
            <div>
              <dt>
                Nyquist rate 2f<sub>m</sub>
              </dt>
              <dd>{kHz(2 * fm)}</dd>
            </div>
            <div>
              <dt>Nearest image</dt>
              <dd>
                f<sub>s</sub> − f<sub>m</sub> = {kHz(Math.abs(fs - fm))}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>
                Sampling f<sub>s</sub>
              </dt>
              <dd>{kHz(fs)}</dd>
            </div>
            <div>
              <dt>
                Period T<sub>s</sub>
              </dt>
              <dd>{time(1 / fs)}</dd>
            </div>
          </>
        )}
        {rows.includes("recon") && (
          <>
            <div>
              <dt>LPF out, measured</dt>
              <dd>{recVpp < 0.05 ? "flat" : kHz(recF)}</dd>
            </div>
            <div>
              <dt>LPF out size</dt>
              <dd>{fmt(recVpp, 2)} Vp-p</dd>
            </div>
            <div>
              <dt>Message in</dt>
              <dd>{kHz(fm)}, 4 Vp-p</dd>
            </div>
          </>
        )}
      </dl>
      {analysis && (
        <p className={nyquist === "above" ? "smx-ok" : "fmx-warn"}>
          {nyquist === "above" &&
            `fs = ${kHz(fs)} is above the Nyquist rate (${kHz(2 * fm)}): the samples fit only the ${kHz(fm)} message below fs/2 = ${kHz(fs / 2)}.`}
          {nyquist === "at" &&
            `fs is exactly 2fm: the boundary. Two samples per cycle; what they show depends on where in the cycle they land.`}
          {nyquist === "below" &&
            `Below the Nyquist rate: the samples also fit a ${alias < 1 ? "0 Hz (constant)" : kHz(alias)} wave, and below fs/2 that is the one a filter rebuilds. Aliasing.`}
        </p>
      )}

      {spec && (
        <SpectrumPlot
          input={spec.input}
          output={spec.output}
          fm={fm}
          fs={fs}
          cutoff={tlpfCutoff(knobsFor(live))}
          method={live.method}
        />
      )}

      {controls.length > 0 && (
        <div className="fmx-controls">
          {controls.map((key) => {
            const s = SLIDERS[key];
            const shown =
              key === "duty"
                ? `${Math.round(v.duty * 100)} %`
                : key === "phase"
                  ? `${Math.round(v.phase)}°`
                  : `${fmt(v[key], key === "fs" && v.fs >= 20 ? 0 : 1)} ${s.unit}`;
            const props =
              key === "fs"
                ? {
                    min: 0,
                    max: 1000,
                    step: 1,
                    value: toPos(v.fs, FS_RANGE),
                    on: (p: number) =>
                      set({ fs: +fmt(fromPos(p, FS_RANGE), 1) }),
                  }
                : key === "cutoff"
                  ? {
                      min: 0,
                      max: 1000,
                      step: 1,
                      value: toPos(v.cutoff, CUT_RANGE),
                      on: (p: number) =>
                        set({ cutoff: +fmt(fromPos(p, CUT_RANGE), 2) }),
                    }
                  : key === "fm"
                    ? {
                        min: 0.5,
                        max: 6,
                        step: 0.1,
                        value: v.fm,
                        on: (x: number) => set({ fm: x }),
                      }
                    : key === "phase"
                      ? {
                          min: 0,
                          max: 355,
                          step: 5,
                          value: v.phase,
                          on: (x: number) => set({ phase: x }),
                        }
                      : {
                          min: 0.1,
                          max: 0.9,
                          step: 0.05,
                          value: v.duty,
                          on: (x: number) => set({ duty: x }),
                        };
            return (
              <label key={key} className="fmx-control">
                <span>
                  {s.label}
                  <output>{shown}</output>
                </span>
                <input
                  type="range"
                  min={props.min}
                  max={props.max}
                  step={props.step}
                  value={props.value}
                  aria-label={s.label}
                  onChange={(e) => props.on(Number(e.target.value))}
                />
              </label>
            );
          })}
        </div>
      )}
      <figcaption>
        {caption ??
          "Every row comes from the trainer's own models of the Dual Analog Switch, its sample-and-hold and the Tuneable LPF, on one time axis. Dashed grey: the message, for comparison."}
      </figcaption>
    </figure>
  );
}

function SpectrumPlot({
  input,
  output,
  fm,
  fs,
  cutoff,
  method,
}: {
  input: Float32Array;
  output: Float32Array;
  fm: number;
  fs: number;
  cutoff: number;
  method: Method;
}) {
  const h = 118;
  const x0 = 8;
  const x1 = W - 8;
  const y0 = 10;
  const y1 = 84;
  let peak = 0;
  for (let i = 1; i < input.length; i++) peak = Math.max(peak, input[i]);
  const xOf = (f: number) => x0 + ((x1 - x0) * f) / SPEC_MAX;
  const yOf = (a: number) =>
    y1 - ((y1 - y0) * Math.min(a, peak * 1.05)) / (peak * 1.05 || 1);
  const line = (a: Float32Array) => {
    let d = "";
    for (let k = 1; k < a.length; k++)
      d += `${k > 1 ? "L" : "M"}${xOf(k * SPEC_DF).toFixed(1)} ${yOf(a[k]).toFixed(1)}`;
    return d;
  };
  const marks: { f: number; text: string }[] = [{ f: fm, text: "fm" }];
  for (let n = 1; n <= 3; n++) {
    for (const [f, text] of [
      [n * fs - fm, n === 1 ? "fs−fm" : `${n}fs−fm`],
      [n * fs + fm, n === 1 ? "fs+fm" : `${n}fs+fm`],
    ] as [number, string][]) {
      if (
        f > 150 &&
        f < SPEC_MAX &&
        marks.every((m) => Math.abs(m.f - f) > 1600)
      )
        marks.push({ f, text });
    }
  }
  return (
    <figure className="smx-spec">
      <svg
        className="g-svg"
        viewBox={`0 0 ${W} ${h}`}
        role="img"
        aria-label={`Spectrum of the ${method === "hold" ? "sample-and-hold" : "naturally sampled"} signal before and after the low-pass filter, 0 to 25 kHz`}
      >
        <rect
          x={x0}
          y={y0 - 4}
          width={Math.max(0, xOf(Math.min(cutoff, SPEC_MAX)) - x0)}
          height={y1 - y0 + 4}
          className="smx-pass"
        />
        <line x1={x0} x2={x1} y1={y1} y2={y1} className="f-axis" />
        <path d={line(input)} className="smx-spec-in" />
        <path d={line(output)} className="smx-spec-out" />
        {marks.map((m) => (
          <text
            key={m.text}
            x={xOf(m.f)}
            y={y1 + 12}
            textAnchor="middle"
            className="f-sub"
          >
            {m.text}
          </text>
        ))}
        {[0, 5, 10, 15, 20, 25].map((k) => (
          <text
            key={k}
            x={xOf(k * 1000)}
            y={y1 + 25}
            textAnchor={k === 0 ? "start" : k === 25 ? "end" : "middle"}
            className="f-sub"
          >
            {k}
          </text>
        ))}
        <text x={x1} y={y0 + 4} textAnchor="end" className="f-sub">
          kHz →
        </text>
      </svg>
      <figcaption>
        Spectrum measured from the simulated waveforms. Grey: the{" "}
        {method === "hold" ? "sample-and-hold" : "naturally sampled"} signal
        going into the LPF. Blue: what comes out. Shaded: the LPF&rsquo;s pass
        band (0 to {kHz(cutoff)}).
        {fs > SPEC_MAX
          ? ` The images sit at ${kHz(fs - fm)} and ${kHz(fs + fm)}, off this axis.`
          : ""}
      </figcaption>
    </figure>
  );
}
