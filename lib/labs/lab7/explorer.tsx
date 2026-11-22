"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { Cable } from "@/lib/cables/store";
import type { EmonaControls } from "@/lib/controls/store";
import { buildCircuit, runCircuit, type ModuleModel } from "@/lib/sim/engine";
import { MODULE_MODELS, pcmCode, pcmLevel } from "@/lib/sim/modules";

/**
 * PCM from end to end, on one time axis.
 *
 * The rows are produced by the simulator's own PCM ENCODER, PCM DECODER and
 * TUNEABLE LPF models run through the signal engine, wired as in the lab
 * sheet's Figure 5 (decoder clock and FS "stolen" from the encoder). Only
 * MASTER SIGNALS is replaced, so the clock and the message's size can change.
 * Every number shown (sample voltage, code, the bits on the line, the decoded
 * level) is read off those simulated waveforms.
 */

type RowKey = "message" | "ch2" | "clock" | "data" | "fs" | "pam" | "pam2" | "recon";
type Ctrl = "clock" | "amp" | "cutoff";

export interface PcmValues {
  /** Encoder clock, kHz: one bit per period. */
  clock: number;
  /** Message peak, V. */
  amp: number;
  /** Tuneable LPF cutoff, kHz. */
  cutoff: number;
  tdm: boolean;
}

const DEFAULTS: PcmValues = { clock: 100, amp: 2, cutoff: 3.6, tdm: false };
const FM = 100_000 / 48; // the trainer's "2 kHz"
const DT = 0.5e-6;
const RECORD = 8e-3;
const W = 348;
const LABEL_W = 70;
const TRAINER = [
  { kHz: 100_000 / 12 / 1000, name: "8kHz DIGITAL" },
  { kHz: 100, name: "100kHz DIGITAL" },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fmt = (v: number, d = 2) => {
  const s = v.toFixed(d);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};
const kHz = (hz: number) => `${fmt(hz / 1000, hz < 10_000 ? 2 : 1)} kHz`;
const us = (s: number) => (s >= 1e-3 ? `${fmt(s * 1e3, 2)} ms` : `${fmt(s * 1e6, 1)} µs`);
const mv = (v: number) => `${fmt(v * 1000, 1)} mV`;
export const bin8 = (code: number) => code.toString(2).padStart(8, "0");

// ------------------------------------------------------------- simulation

function source(v: PcmValues): ModuleModel {
  const fc = v.clock * 1000;
  return {
    id: "master",
    inputs: [],
    outputs: ["master.sine2k", "master.dig100k", "master.dig2k"],
    create: () => (_inp, out, t) => {
      out[0] = v.amp * Math.sin(2 * Math.PI * FM * t);
      out[1] = fc * t - Math.floor(fc * t) < 0.5 ? 5 : 0;
      out[2] = FM * t - Math.floor(FM * t) < 0.5 ? 5 : 0;
    },
  };
}

const lead = (a: string, b: string, i: number): Cable => ({ id: `p${i}`, a, b, color: "red" });
const CABLES: Cable[] = [
  ["master.sine2k", "pcmenc.in1"],
  ["master.dig2k", "pcmenc.in2"],
  ["master.dig100k", "pcmenc.clk"],
  ["master.dig100k", "pcmdec.clk"],
  ["pcmenc.data", "pcmdec.data"],
  ["pcmenc.fs", "pcmdec.fs"],
  ["pcmdec.out", "tlpf.in"],
].map(([a, b], i) => lead(a, b, i));
const PROBES: Record<RowKey, string> = {
  message: "master.sine2k",
  ch2: "master.dig2k",
  clock: "master.dig100k",
  data: "pcmenc.data",
  fs: "pcmenc.fs",
  pam: "pcmdec.out",
  pam2: "pcmdec.out2",
  recon: "tlpf.out",
};

function controlsFor(v: PcmValues): EmonaControls {
  return {
    knobs: { "tlpf.fc": clamp(Math.log(v.cutoff / 0.6) / Math.log(20), 0, 1), "tlpf.gain": 0.5 },
    switches: { "pcmenc.mode": v.tdm ? 1 : 0 },
  };
}

interface Frame {
  /** Index of the first bit (the encoder samples INPUT 1 here). */
  start: number;
  /** Index where slot 2 starts (TDM: INPUT 2 is sampled here). */
  slot2: number;
  /** Bits as they were on the PCM DATA line, MSB first. */
  bits: number[];
  /** Index just after the decoder updated its output for this frame. */
  decoded: number;
}

function simulate(v: PcmValues) {
  const controls = controlsFor(v);
  const models = [...MODULE_MODELS.filter((m) => m.id !== "master"), source(v)];
  const keys = Object.keys(PROBES) as RowKey[];
  const ids = keys.map((k) => `probe.${k}`);
  const circuit = buildCircuit([...CABLES, ...keys.map((k, i) => lead(PROBES[k], ids[i], 40 + i))], models, ids);
  const warm = Math.round((circuit.settle(controls) + 2e-3) / DT);
  const data = runCircuit(circuit, { dt: DT, warmup: warm * DT, samples: Math.round(RECORD / DT), t0: -warm * DT, controls });
  const rows = Object.fromEntries(keys.map((k, i) => [k, data[i]])) as Record<RowKey, Float32Array>;

  // Frames, found from the waveforms: a frame starts where FS falls (the clock edge after bit 0).
  const bitT = 1 / (v.clock * 1000);
  const nBits = v.tdm ? 16 : 8;
  const per = bitT / DT;
  const frames: Frame[] = [];
  const fs = rows.fs;
  for (let i = 1; i < fs.length; i++) {
    if (fs[i - 1] > 2.5 && fs[i] <= 2.5) {
      const bits: number[] = [];
      for (let j = 0; j < nBits; j++) {
        const k = Math.round(i + (j + 0.5) * per);
        if (k >= fs.length) break;
        bits.push(rows.data[k] > 2.5 ? 1 : 0);
      }
      if (bits.length < nBits) break;
      const decoded = Math.round(i + nBits * per) + 1;
      if (decoded >= fs.length) break;
      frames.push({ start: i, slot2: Math.round(i + 8 * per), bits, decoded });
    }
  }
  return { rows, frames, per, nBits };
}

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
  if (hi - lo < 0.05) return { f: 0, vpp: hi - lo };
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
  return { f: count >= 2 ? (count - 1) / (last - first) : 0, vpp: hi - lo };
}

const toWord = (bits: number[]) => bits.reduce((a, b) => a * 2 + b, 0);

// ----------------------------------------------------------------- display
const ROWS: Record<RowKey, { name: string; sub: string; cls: string; range: [number, number]; ghost?: boolean }> = {
  message: { name: "Message", sub: "INPUT 1", cls: "f-message", range: [-3, 3] },
  ch2: { name: "Input 2", sub: "2 kHz digital", cls: "f-am", range: [-0.6, 5.6] },
  clock: { name: "CLK", sub: "one bit each", cls: "f-am", range: [-0.6, 5.6] },
  data: { name: "PCM DATA", sub: "serial bits", cls: "f-am", range: [-0.6, 5.6] },
  fs: { name: "FS", sub: "high on bit 0", cls: "f-am", range: [-0.6, 5.6] },
  pam: { name: "Decoded", sub: "OUTPUT (PAM)", cls: "f-am", range: [-3, 3], ghost: true },
  pam2: { name: "Decoded 2", sub: "OUTPUT2", cls: "f-am", range: [-0.6, 2.6] },
  recon: { name: "LPF out", sub: "reconstructed", cls: "f-message", range: [-3, 3], ghost: true },
};

function pathOf(v: Float32Array, n: number, yOf: (x: number) => number, x0: number, x1: number, from = 0) {
  const step = Math.max(1, Math.floor(n / 1400));
  let d = "";
  let prev = v[from];
  for (let i = 0; i < n; i += step) {
    let pick = v[from + i];
    for (let j = i; j < Math.min(n, i + step); j++) if (Math.abs(v[from + j] - prev) > Math.abs(pick - prev)) pick = v[from + j];
    prev = pick;
    d += `${i ? "L" : "M"}${(x0 + ((x1 - x0) * i) / (n - 1)).toFixed(1)} ${yOf(pick).toFixed(1)}`;
  }
  return d;
}

export function PcmExplorer({
  rows,
  controls = [],
  initial,
  tdmToggle = false,
  presets = false,
  caption,
}: {
  rows?: RowKey[];
  controls?: Ctrl[];
  initial?: Partial<PcmValues>;
  tdmToggle?: boolean;
  /** Buttons for the trainer's two clocks. */
  presets?: boolean;
  caption?: string;
}) {
  const [v, setV] = useState<PcmValues>({ ...DEFAULTS, ...initial });
  const live = useDeferredValue(v);
  const sim = useMemo(() => simulate(live), [live]);
  const [sel, setSel] = useState(1);
  const svg = useRef<SVGSVGElement>(null);
  const shown = rows ?? (live.tdm ? (["message", "ch2", "data", "fs", "pam", "pam2", "recon"] as RowKey[]) : (["message", "clock", "data", "fs", "pam", "recon"] as RowKey[]));

  const frameT = sim.nBits / (live.clock * 1000);
  const span = frameT > 0.3e-3 ? 4e-3 : 1e-3;
  const n = Math.round(span / DT);
  const visible = sim.frames.filter((f) => f.start < n);
  const k = clamp(sel, 0, Math.max(0, visible.length - 1));
  const frame = visible[k];
  const xOf = (i: number) => LABEL_W + ((W - LABEL_W - 2) * i) / (n - 1);

  const rec = useMemo(() => measureFrequency(sim.rows.recon), [sim]);
  const fsHz = live.clock * 1000 / sim.nBits;

  const rowH = 40;
  const top = (i: number) => 4 + i * rowH;
  const set = (patch: Partial<PcmValues>) => setV({ ...v, ...patch });

  const pick = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const i = (((clientX - r.left) / r.width) * W - LABEL_W) / (W - LABEL_W - 2) * (n - 1);
    let best = 0;
    visible.forEach((f, j) => {
      if (Math.abs(f.start - i) < Math.abs(visible[best].start - i)) best = j;
    });
    setSel(best);
  };

  // The selected sample, everything read from the simulated waveforms.
  const vIn = frame ? sim.rows.message[frame.start] : 0;
  const word = frame ? toWord(frame.bits.slice(0, 8)) : 0;
  const decoded = frame ? sim.rows.pam[frame.decoded] : 0;
  const v2 = frame && live.tdm ? sim.rows.ch2[frame.slot2] : 0;
  const word2 = frame && live.tdm ? toWord(frame.bits.slice(8)) : 0;
  const decoded2 = frame && live.tdm ? sim.rows.pam2[frame.decoded] : 0;
  const clipped = Math.abs(vIn) > 2;

  return (
    <figure className="fmx pcx">
      {(presets || tdmToggle) && (
        <div className="fmx-slope smx-row">
          {presets && (
            <>
              <span>Encoder clock</span>
              <div role="group" aria-label="Encoder clock">
                {TRAINER.map((c) => (
                  <button key={c.name} type="button" className={Math.abs(v.clock - c.kHz) < 0.01 ? "is-on" : ""} aria-pressed={Math.abs(v.clock - c.kHz) < 0.01} onClick={() => set({ clock: c.kHz })}>
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {tdmToggle && (
            <>
              <span>Mode</span>
              <div role="group" aria-label="Encoder mode">
                {[false, true].map((t) => (
                  <button key={String(t)} type="button" className={v.tdm === t ? "is-on" : ""} aria-pressed={v.tdm === t} onClick={() => set({ tdm: t })}>
                    {t ? "TDM" : "PCM"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <svg
        ref={svg}
        className="g-svg fmx-plot"
        viewBox={`0 0 ${W} ${shown.length * rowH + 20}`}
        role="img"
        aria-label={`PCM signals over ${span * 1000} ms: ${shown.map((r) => ROWS[r].name).join(", ")}`}
        onPointerDown={(e) => pick(e.clientX)}
      >
        {frame && (
          <rect x={xOf(frame.start)} y={2} width={Math.max(1, xOf(frame.start + sim.nBits * sim.per) - xOf(frame.start))} height={shown.length * rowH} className="pcx-frame" />
        )}
        {shown.map((key, i) => {
          const spec = ROWS[key];
          const [lo, hi] = spec.range;
          const yOf = (x: number) => top(i) + 3 + (rowH - 7) * (1 - (x - lo) / (hi - lo));
          return (
            <g key={key}>
              <text x={2} y={top(i) + rowH / 2 - 1} className="f-label">
                {spec.name}
              </text>
              <text x={2} y={top(i) + rowH / 2 + 10} className="f-sub">
                {spec.sub}
              </text>
              {spec.range[0] < 0 && spec.range[1] < 5 && <line x1={LABEL_W} x2={W - 2} y1={yOf(0)} y2={yOf(0)} className="f-axis" />}
              {spec.ghost && <path d={pathOf(sim.rows.message, n, yOf, LABEL_W, W - 2)} className="f-ghost" />}
              {live.tdm && key === "data" &&
                visible.map((f) => (
                  <rect key={f.start} x={xOf(f.slot2)} y={top(i) + 1} width={Math.max(0.5, xOf(f.slot2 + 8 * sim.per) - xOf(f.slot2))} height={rowH - 4} className="pcx-slot2" />
                ))}
              <path d={pathOf(sim.rows[key], n, yOf, LABEL_W, W - 2)} className={spec.cls} />
              {key === "message" &&
                visible.map((f, j) => <circle key={f.start} cx={xOf(f.start)} cy={yOf(sim.rows.message[f.start])} r={j === k ? 3.4 : 2.2} className="fmx-dot" />)}
            </g>
          );
        })}
        <text x={LABEL_W} y={shown.length * rowH + 16} className="f-sub">
          0
        </text>
        <text x={W - 2} y={shown.length * rowH + 16} textAnchor="end" className="f-sub">
          {span * 1000} ms · click a sample to inspect it
        </text>
      </svg>

      <div className="smx-step">
        <button type="button" className="quiz-again" aria-label="Previous sample" onClick={() => setSel(Math.max(0, k - 1))}>
          ◀ Previous sample
        </button>
        <button type="button" className="quiz-again" aria-label="Next sample" onClick={() => setSel(Math.min(visible.length - 1, k + 1))}>
          Next sample ▶
        </button>
      </div>

      {frame && (
        <div className="fmx-readout pcx-readout" aria-live="polite">
          <span>
            Sample {k + 1} · taken at <b className="nc">t = {us(frame.start * DT)}</b>
          </span>
          <strong>
            {fmt(vIn, 3)} V → code {word} → {bin8(word)} → decoded {fmt(decoded, 3)} V
          </strong>
          <em>
            quantization error {mv(decoded - vIn)}
            {clipped ? " (input beyond ±2 V: clipped)" : ""} · sent MSB first, bit 7 … bit 0 · FS high on bit 0
          </em>
          {live.tdm && (
            <em>
              slot 2 (INPUT 2): {fmt(v2, 2)} V → {bin8(word2)} → OUTPUT2 {fmt(decoded2, 2)} V
            </em>
          )}
          <FrameView sim={sim} frame={frame} tdm={live.tdm} />
        </div>
      )}

      <dl className="fmx-stats">
        <div>
          <dt>Clock (bit rate)</dt>
          <dd>{kHz(live.clock * 1000)}</dd>
        </div>
        <div>
          <dt>Bits per frame</dt>
          <dd>{sim.nBits}</dd>
        </div>
        <div>
          <dt>Frame (sample) rate</dt>
          <dd>{kHz(fsHz)}</dd>
        </div>
        <div>
          <dt>Samples per cycle</dt>
          <dd>{fmt(fsHz / FM, 2)}</dd>
        </div>
        <div>
          <dt>LPF out, measured</dt>
          <dd>{rec.vpp < 0.05 ? "flat" : kHz(rec.f)}</dd>
        </div>
        <div>
          <dt>LPF out size</dt>
          <dd>{fmt(rec.vpp, 2)} Vp-p</dd>
        </div>
      </dl>
      {fsHz < 2 * FM && (
        <p className="fmx-warn">
          {kHz(fsHz)} frames per second is below the Nyquist rate for the {kHz(FM)} message ({kHz(2 * FM)}): the decoded output cannot follow it.
        </p>
      )}

      {controls.length > 0 && (
        <div className="fmx-controls">
          {controls.includes("clock") && (
            <label className="fmx-control">
              <span>
                Encoder clock
                <output>{kHz(v.clock * 1000)}</output>
              </span>
              <input type="range" min={5} max={200} step={0.5} value={v.clock} aria-label="Encoder clock" onChange={(e) => set({ clock: Number(e.target.value) })} />
            </label>
          )}
          {controls.includes("amp") && (
            <label className="fmx-control">
              <span>
                Message peak
                <output>{fmt(v.amp, 2)} V</output>
              </span>
              <input type="range" min={0.1} max={3} step={0.05} value={v.amp} aria-label="Message peak" onChange={(e) => set({ amp: Number(e.target.value) })} />
            </label>
          )}
          {controls.includes("cutoff") && (
            <label className="fmx-control">
              <span>
                LPF cutoff
                <output>{fmt(v.cutoff, 2)} kHz</output>
              </span>
              <input type="range" min={0.6} max={12} step={0.1} value={v.cutoff} aria-label="LPF cutoff" onChange={(e) => set({ cutoff: Number(e.target.value) })} />
            </label>
          )}
        </div>
      )}
      <figcaption>
        {caption ??
          "Every row comes from the trainer's own PCM Encoder, PCM Decoder and Tuneable LPF models, wired as in the lab sheet's Figure 5. Shaded: the selected sample's frame. Dashed grey: the message."}
      </figcaption>
    </figure>
  );
}

/** One frame, bit by bit: CLK, PCM DATA and FS, read from the simulated waveforms. */
function FrameView({ sim, frame, tdm }: { sim: ReturnType<typeof simulate>; frame: Frame; tdm: boolean }) {
  const nb = sim.nBits;
  const x0 = 26;
  const x1 = W - 4;
  const cell = (x1 - x0) / nb;
  const from = Math.max(0, Math.round(frame.start - 0.25 * sim.per));
  const len = Math.round((nb + 0.5) * sim.per);
  const xOf = (i: number) => x0 + ((x1 - x0) * (i - frame.start)) / (nb * sim.per);
  const row = (key: RowKey, y: number) => {
    let d = "";
    for (let i = from; i < Math.min(sim.rows[key].length, from + len); i++) d += `${i === from ? "M" : "L"}${xOf(i).toFixed(1)} ${(y + 12 - (sim.rows[key][i] > 2.5 ? 12 : 0)).toFixed(1)}`;
    return d;
  };
  return (
    <svg className="g-svg pcx-bits" viewBox={`0 0 ${W} 94`} role="img" aria-label={`The selected frame bit by bit: ${frame.bits.join("")}`}>
      {frame.bits.map((b, j) => (
        <g key={j}>
          <rect x={x0 + j * cell} y={2} width={cell} height={74} className={tdm && j >= 8 ? "pcx-slot2" : j % 2 ? "pcx-cell" : "pcx-cell-alt"} />
          <text x={x0 + (j + 0.5) * cell} y={88} textAnchor="middle" className="f-sub">
            {7 - (j % 8)}
          </text>
          <text x={x0 + (j + 0.5) * cell} y={52} textAnchor="middle" className="f-label pcx-bit">
            {b}
          </text>
        </g>
      ))}
      <text x={0} y={14} className="f-sub">
        CLK
      </text>
      <path d={row("clock", 4)} className="f-am" />
      <text x={0} y={36} className="f-sub">
        DATA
      </text>
      <path d={row("data", 26)} className="f-message" />
      <text x={0} y={70} className="f-sub">
        FS
      </text>
      <path d={row("fs", 60)} className="f-measure" />
      <text x={0} y={88} className="f-sub">
        bit
      </text>
    </svg>
  );
}

// -------------------------------------------------------- quantization demo
/** Educational N-bit quantizer over ±2 V, the same convention as the trainer model (endpoints exact). */
export const quantize = (v: number, bits: number) => {
  const top = 2 ** bits - 1;
  const code = Math.round(((clamp(v, -2, 2) + 2) / 4) * top);
  return { code, level: (code / top) * 4 - 2, step: 4 / top };
};

/** Move a voltage; see the nearest 8-bit level, the error and the code. */
export function QuantizerDemo({ initial = 1.13 }: { initial?: number }) {
  const [v, setV] = useState(initial);
  const code = pcmCode(v);
  const level = pcmLevel(code);
  const step = 4 / 255;
  const err = level - v;
  // a magnified number line: three levels either side of the chosen one
  const x0 = 20;
  const x1 = W - 20;
  const span = 7 * step;
  const lo = level - 3.5 * step;
  const xOf = (x: number) => x0 + ((x1 - x0) * (x - lo)) / span;
  const ticks = [-3, -2, -1, 0, 1, 2, 3].map((d) => code + d).filter((c) => c >= 0 && c <= 255);
  return (
    <figure className="fmx pcx-q">
      <svg className="g-svg" viewBox={`0 0 ${W} 74`} role="img" aria-label={`${fmt(v, 3)} volts is quantized to level ${code}, ${fmt(level, 4)} volts`}>
        <line x1={x0} x2={x1} y1={34} y2={34} className="f-axis" />
        {ticks.map((c) => (
          <g key={c}>
            <line x1={xOf(pcmLevel(c))} x2={xOf(pcmLevel(c))} y1={26} y2={42} className={c === code ? "f-measure" : "f-wire"} />
            <text x={xOf(pcmLevel(c))} y={56} textAnchor="middle" className={c === code ? "f-label" : "f-sub"}>
              {c}
            </text>
            <text x={xOf(pcmLevel(c))} y={68} textAnchor="middle" className="f-sub">
              {fmt(pcmLevel(c), 3)}
            </text>
          </g>
        ))}
        {Math.abs(v) <= 2 && (
          <>
            <circle cx={xOf(v)} cy={34} r={4} className="fmx-dot" />
            <text x={xOf(v)} y={16} textAnchor="middle" className="f-label">
              {fmt(v, 3)} V
            </text>
          </>
        )}
      </svg>
      <dl className="fmx-stats">
        <div>
          <dt>Sample</dt>
          <dd>{fmt(v, 3)} V</dd>
        </div>
        <div>
          <dt>Nearest level</dt>
          <dd>{fmt(level, 4)} V</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd>{mv(err)}</dd>
        </div>
        <div>
          <dt>Code</dt>
          <dd>{code}</dd>
        </div>
        <div className="pcx-wide">
          <dt>8-bit word (bit 7 … bit 0)</dt>
          <dd className="pcx-word">{bin8(code)}</dd>
        </div>
      </dl>
      {Math.abs(v) > 2 && <p className="fmx-warn">Beyond ±2 V: the encoder clips to its end level ({code === 255 ? "11111111, +2 V" : "00000000, −2 V"}). The error is now much larger than half a step.</p>}
      <div className="fmx-controls">
        <label className="fmx-control">
          <span>
            Sample voltage
            <output>{fmt(v, 3)} V</output>
          </span>
          <input type="range" min={-2.5} max={2.5} step={0.001} value={v} aria-label="Sample voltage" onChange={(e) => setV(Number(e.target.value))} />
        </label>
      </div>
      <figcaption>
        Magnified: levels {fmt(step * 1000, 2)} mV apart. The trainer model&rsquo;s quantizer: 256 levels from −2 V (00000000) to +2 V (11111111), equally spaced. It is the same function the
        simulated PCM Encoder uses.
      </figcaption>
    </figure>
  );
}

/** The same sine quantized with 2, 4 or 8 bits: an educational comparison, not a trainer setting. */
export function BitDepthDemo() {
  const [bits, setBits] = useState(2);
  const x0 = 8;
  const x1 = W - 8;
  const h = 120;
  const yOf = (v: number) => 60 - v * 24;
  const T = 480e-6;
  let sine = "";
  let q = "";
  let worst = 0;
  for (let i = 0; i <= 480; i++) {
    const t = (T * i) / 480;
    const v = 2 * Math.sin((2 * Math.PI * t) / T);
    const lv = quantize(v, bits).level;
    worst = Math.max(worst, Math.abs(lv - v));
    const x = (x0 + ((x1 - x0) * i) / 480).toFixed(1);
    sine += `${i ? "L" : "M"}${x} ${yOf(v).toFixed(1)}`;
    q += `${i ? "L" : "M"}${x} ${yOf(lv).toFixed(1)}`;
  }
  const { step } = quantize(0, bits);
  return (
    <figure className="fmx pcx-q">
      <div className="fmx-slope smx-row">
        <span>Bits per sample (educational)</span>
        <div role="group" aria-label="Bits per sample">
          {[2, 4, 8].map((b) => (
            <button key={b} type="button" className={bits === b ? "is-on" : ""} aria-pressed={bits === b} onClick={() => setBits(b)}>
              {b} bits
            </button>
          ))}
        </div>
      </div>
      <svg className="g-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={`A 2 volt sine quantized with ${bits} bits: ${2 ** bits} levels`}>
        <line x1={x0} x2={x1} y1={60} y2={60} className="f-axis" />
        <path d={sine} className="f-ghost" />
        <path d={q} className="f-message" />
      </svg>
      <dl className="fmx-stats">
        <div>
          <dt>Levels 2^N</dt>
          <dd>{2 ** bits}</dd>
        </div>
        <div>
          <dt>Step</dt>
          <dd>{step > 0.1 ? `${fmt(step, 3)} V` : mv(step)}</dd>
        </div>
        <div>
          <dt>Largest error</dt>
          <dd>{worst > 0.1 ? `${fmt(worst, 3)} V` : mv(worst)}</dd>
        </div>
      </dl>
      <figcaption>Dashed: the sine. Solid: the nearest allowed level at every instant. The trainer always uses 8 bits.</figcaption>
    </figure>
  );
}

/** The lab sheet's Figure 1 made concrete, and what a receiver reads if it starts in the wrong place. */
export function BoundaryDemo() {
  const [shift, setShift] = useState(0);
  const sim = useMemo(() => simulate({ ...DEFAULTS }), []);
  const f0 = sim.frames[1];
  const f1 = sim.frames[2];
  const stream = [...f0.bits, ...f1.bits];
  const read = stream.slice(shift, shift + 8);
  const word = toWord(read);
  const right = toWord(f0.bits);
  const x0 = 8;
  const cell = (W - 16) / 16;
  return (
    <figure className="fmx pcx-q">
      <svg className="g-svg" viewBox={`0 0 ${W} 74`} role="img" aria-label={`Two frames of PCM data. The receiver reads bits ${shift + 1} to ${shift + 8}.`}>
        {stream.map((b, j) => (
          <g key={j}>
            <rect x={x0 + j * cell} y={18} width={cell - 1} height={22} rx={2} className={j >= shift && j < shift + 8 ? "pcx-read" : "pcx-cell"} />
            <text x={x0 + (j + 0.5) * cell} y={33} textAnchor="middle" className="f-label">
              {b}
            </text>
            <text x={x0 + (j + 0.5) * cell} y={52} textAnchor="middle" className="f-sub">
              {7 - (j % 8)}
            </text>
          </g>
        ))}
        <line x1={x0 + 8 * cell} x2={x0 + 8 * cell} y1={10} y2={58} className="f-guide" />
        <text x={x0} y={11} className="f-sub">
          frame A
        </text>
        <text x={x0 + 8 * cell + 3} y={11} className="f-sub">
          frame B
        </text>
        <text x={x0} y={70} className="f-sub">
          FS is high on the last cell of each frame (bit 0)
        </text>
      </svg>
      <div className="fmx-readout">
        <span>The receiver reads</span>
        <strong>
          {read.join("")} = {word} → {fmt(pcmLevel(word), 3)} V
        </strong>
        <em>{shift === 0 ? "Aligned with FS: the right word." : `One frame boundary off by ${shift} bit${shift > 1 ? "s" : ""}: the right word was ${bin8(right)} = ${fmt(pcmLevel(right), 3)} V.`}</em>
      </div>
      <div className="fmx-controls">
        <label className="fmx-control">
          <span>
            Receiver starts late by
            <output>
              {shift} bit{shift === 1 ? "" : "s"}
            </output>
          </span>
          <input type="range" min={0} max={7} step={1} value={shift} aria-label="Receiver starts late by" onChange={(e) => setShift(Number(e.target.value))} />
        </label>
      </div>
      <figcaption>Two real consecutive words from the simulated encoder (2 kHz sine, 100 kHz clock). The clock alone gives the bit times, not where a word starts.</figcaption>
    </figure>
  );
}
