"use client";

import { useMemo, useRef, useState } from "react";
import { cableStore } from "@/lib/cables/store";
import { controlsStore } from "@/lib/controls/store";
import { Bench } from "@/lib/guide/bench";
import { F_MESSAGE, vcoLaw, vcoSensitivity } from "@/lib/sim/modules";
import { scopeStatus } from "@/lib/sim/status";

/**
 * FM explorer: message, unmodulated carrier and FM carrier on one time axis.
 *
 * The FM row is built the way the VCO builds it: the instantaneous frequency
 * is f(t) = f_rest + k·m(t), and the phase is its running integral,
 * φ(t) = 2π ∫ f dt. Every number shown is read off that same model, so the
 * readouts always agree with the picture.
 */

type Key = "am" | "fm" | "fc" | "k" | "slope";

export interface ExplorerValues {
  /** Message peak amplitude, V. */
  am: number;
  /** Message frequency, kHz. */
  fm: number;
  /** Rest (carrier) frequency, kHz. */
  fc: number;
  /** VCO sensitivity, kHz per volt. */
  k: number;
  /** +1: positive voltage raises the frequency; −1: lowers it. */
  slope: 1 | -1;
}

const DEFAULTS: ExplorerValues = { am: 2, fm: 2, fc: 10, k: 1, slope: 1 };
const WINDOW = 1; // ms shown
const N = 3000;
const W = 348;
const LABEL_W = 64;

/** Fixed decimals with trailing zeros after the point removed ("12.50" → "12.5", "100" stays "100"). */
const fmt = (v: number, d = 2) => {
  const s = v.toFixed(d);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

interface Model {
  t: Float64Array; // ms
  m: Float64Array; // V
  f: Float64Array; // kHz
  fmSig: Float64Array;
  carrier: Float64Array;
  rises: number[]; // sample indices of FM rising zero crossings (interpolated)
  clamped: boolean;
}

function build(v: ExplorerValues): Model {
  const t = new Float64Array(N);
  const m = new Float64Array(N);
  const f = new Float64Array(N);
  const fmSig = new Float64Array(N);
  const carrier = new Float64Array(N);
  const dt = WINDOW / (N - 1); // ms
  let phase = 0; // cycles
  let clamped = false;
  const rises: number[] = [];
  let armed = false; // a crossing counts only after the wave has clearly been negative
  for (let i = 0; i < N; i++) {
    const time = i * dt;
    t[i] = time;
    m[i] = v.am * Math.sin(2 * Math.PI * v.fm * time);
    let fi = v.fc + v.slope * v.k * m[i];
    if (fi < 0.2) {
      fi = 0.2;
      clamped = true;
    }
    f[i] = fi;
    if (i > 0) phase += 0.5 * (f[i - 1] + fi) * dt; // kHz × ms = cycles
    fmSig[i] = Math.sin(2 * Math.PI * phase);
    carrier[i] = Math.sin(2 * Math.PI * v.fc * time);
    if (fmSig[i] < -0.3) armed = true;
    if (armed && i > 0 && fmSig[i - 1] < 0 && fmSig[i] >= 0) {
      rises.push(i - 1 + -fmSig[i - 1] / (fmSig[i] - fmSig[i - 1]));
      armed = false;
    }
  }
  return { t, m, f, fmSig, carrier, rises, clamped };
}

function pathOf(v: Float64Array, yOf: (x: number) => number) {
  let d = "";
  for (let i = 0; i < v.length; i += 2) d += `${i ? "L" : "M"}${(LABEL_W + ((W - LABEL_W - 2) * i) / (N - 1)).toFixed(1)} ${yOf(v[i]).toFixed(1)}`;
  return d;
}

const SLIDERS: Record<Exclude<Key, "slope">, { label: string; min: number; max: number; step: number; unit: string }> = {
  am: { label: "Message amplitude", min: 0, max: 3, step: 0.1, unit: "V peak" },
  fm: { label: "Message frequency", min: 0.5, max: 4, step: 0.1, unit: "kHz" },
  fc: { label: "Rest frequency", min: 4, max: 20, step: 0.5, unit: "kHz" },
  k: { label: "VCO sensitivity", min: 0, max: 3, step: 0.05, unit: "kHz per V" },
};

export function FmExplorer({
  initial,
  controls = ["am", "fm", "fc", "k"],
  bench = false,
  caption,
}: {
  initial?: Partial<ExplorerValues>;
  controls?: Key[];
  /** Offer to load the VCO settings from the bench. */
  bench?: boolean;
  caption?: string;
}) {
  const [v, setV] = useState<ExplorerValues>({ ...DEFAULTS, ...initial });
  const [cursor, setCursor] = useState(0.125); // ms: first message peak at 2 kHz
  const [loaded, setLoaded] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const model = useMemo(() => build(v), [v]);

  const dev = v.k * v.am;
  const beta = v.fm > 0 ? dev / v.fm : 0;
  const ci = Math.max(0, Math.min(N - 1, Math.round((cursor / WINDOW) * (N - 1))));
  const xOf = (i: number) => LABEL_W + ((W - LABEL_W - 2) * i) / (N - 1);

  // The FM cycle around the cursor: between the rising crossings that enclose it.
  const after = model.rises.findIndex((r) => r > ci);
  const cycle = after > 0 ? { a: model.rises[after - 1], b: model.rises[after] } : null;
  const periodUs = cycle ? ((cycle.b - cycle.a) * WINDOW * 1000) / (N - 1) : null;

  const rowH = 54;
  const rows = [
    { name: "Message", sub: `${fmt(v.fm)} kHz`, data: model.m, scale: Math.max(1, v.am, 3), cls: "f-message" },
    { name: "Carrier", sub: `${fmt(v.fc)} kHz, rest`, data: model.carrier, scale: 1.15, cls: "f-carrier" },
    { name: "FM", sub: "same height", data: model.fmSig, scale: 1.15, cls: "f-am" },
  ];
  const top = (i: number) => 4 + i * rowH;
  const mid = (i: number) => top(i) + rowH / 2;
  const yIn = (i: number, scale: number) => (x: number) => mid(i) - (x / scale) * (rowH / 2 - 5);

  const move = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((clientX - r.left) / r.width) * W;
    setCursor(Math.max(0, Math.min(WINDOW, ((x - LABEL_W) / (W - LABEL_W - 2)) * WINDOW)));
  };

  // Shade where the message is positive (frequency above rest, for a positive slope) and negative.
  const bands: { a: number; b: number; positive: boolean }[] = [];
  if (v.am > 0) {
    let start = 0;
    for (let i = 1; i <= N; i++) {
      if (i === N || model.m[i] > 0 !== model.m[i - 1] > 0) {
        bands.push({ a: start, b: i - 1, positive: model.m[Math.floor((start + i - 1) / 2)] > 0 });
        start = i;
      }
    }
  }

  const loadBench = () => {
    const controls = controlsStore.get();
    const b = new Bench(cableStore.get().cables, controls, scopeStatus.get());
    const law = vcoLaw(controls.emona);
    const k = vcoSensitivity(controls.emona) / 1000;
    const r = b.reading("vco.in", { duration: 1e-3, dt: 1e-6 });
    const am = Math.min(3, Math.max(0, r.vpp / 2));
    const freq = am > 0.02 ? b.frequency("vco.in", 4e-3, 1e-6) : 0;
    const next: ExplorerValues = {
      ...v,
      fc: Math.round((law(0) / 1000) * 100) / 100,
      k: Math.round(k * 100) / 100,
      am: Math.round(am * 100) / 100,
      fm: freq > 0 ? Math.round((freq / 1000) * 100) / 100 : F_MESSAGE / 1000,
      slope: 1,
    };
    setV(next);
    setLoaded(
      `From your bench: rest ${fmt(next.fc)} kHz, sensitivity ${fmt(next.k)} kHz/V, message ${fmt(next.am)} V peak at ${fmt(next.fm)} kHz${
        am <= 0.02 ? " (nothing is driving the VCO input yet)" : ""
      }.`,
    );
  };

  return (
    <figure className="fmx">
      <svg
        ref={svg}
        className="g-svg fmx-plot"
        viewBox={`0 0 ${W} ${rows.length * rowH + 22}`}
        role="img"
        aria-label={`Message, carrier and FM signal. At the cursor the message is ${fmt(model.m[ci])} V and the FM frequency is ${fmt(model.f[ci])} kHz.`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons) move(e.clientX);
        }}
      >
        {bands.map((band) => (
          <rect
            key={band.a}
            x={xOf(band.a)}
            y={top(1)}
            width={Math.max(0, xOf(band.b) - xOf(band.a))}
            height={rowH * 2}
            className={(band.positive ? 1 : -1) * v.slope > 0 ? "fmx-fast" : "fmx-slow"}
          />
        ))}
        {rows.map((row, i) => (
          <g key={row.name}>
            <text x={0} y={mid(i) - 2} className="f-label">
              {row.name}
            </text>
            <text x={0} y={mid(i) + 10} className="f-sub">
              {row.sub}
            </text>
            <line x1={LABEL_W} x2={W - 2} y1={mid(i)} y2={mid(i)} className="f-axis" />
            {i === 2 && (
              <>
                <line x1={LABEL_W} x2={W - 2} y1={yIn(2, 1.15)(1)} y2={yIn(2, 1.15)(1)} className="f-env" />
                <line x1={LABEL_W} x2={W - 2} y1={yIn(2, 1.15)(-1)} y2={yIn(2, 1.15)(-1)} className="f-env" />
              </>
            )}
            <path d={pathOf(row.data, yIn(i, row.scale))} className={row.cls} />
          </g>
        ))}
        {cycle && (
          <g className="fmx-cycle">
            <path d={`M${xOf(cycle.a)} ${top(2) + 4}v-3H${xOf(cycle.b)}v3`} />
            <text x={(xOf(cycle.a) + xOf(cycle.b)) / 2} y={top(2) - 1} textAnchor="middle" className="f-label f-on-wave">
              T = {fmt(periodUs!, 0)} µs
            </text>
          </g>
        )}
        <line x1={xOf(ci)} x2={xOf(ci)} y1={2} y2={rows.length * rowH + 4} className="fmx-cursor" />
        <circle cx={xOf(ci)} cy={yIn(0, rows[0].scale)(model.m[ci])} r={3} className="fmx-dot" />
        <text x={LABEL_W} y={rows.length * rowH + 18} className="f-sub">
          0
        </text>
        <text x={W - 2} y={rows.length * rowH + 18} textAnchor="end" className="f-sub">
          {WINDOW} ms · drag across to move the cursor
        </text>
      </svg>

      <div className="fmx-readout" aria-live="polite">
        <div>
          <span>At the cursor</span>
          <strong>
            message {fmt(model.m[ci])} V → frequency {fmt(model.f[ci])} kHz
          </strong>
          {periodUs && (
            <em>
              the cycle under the cursor lasts {fmt(periodUs, 0)} µs: on average over that cycle, 1/T = {fmt(1000 / periodUs)} kHz
            </em>
          )}
        </div>
      </div>
      <dl className="fmx-stats">
        <div>
          <dt>Rest</dt>
          <dd>{fmt(v.fc)} kHz</dd>
        </div>
        <div>
          <dt>Deviation Δf</dt>
          <dd>{fmt(dev)} kHz</dd>
        </div>
        <div>
          <dt>Highest</dt>
          <dd>{fmt(v.fc + dev)} kHz</dd>
        </div>
        <div>
          <dt>Lowest</dt>
          <dd>{fmt(Math.max(0, v.fc - dev))} kHz</dd>
        </div>
        <div>
          <dt>Index β</dt>
          <dd>{fmt(beta)}</dd>
        </div>
        <div>
          <dt>Carson BW</dt>
          <dd>{fmt(2 * (dev + v.fm))} kHz</dd>
        </div>
      </dl>
      {model.clamped && (
        <p className="fmx-warn">The deviation is larger than the rest frequency: the lowest frequency would be below zero. A real VCO cannot do that.</p>
      )}

      <div className="fmx-controls">
        {controls
          .filter((c): c is Exclude<Key, "slope"> => c !== "slope")
          .map((key) => {
            const s = SLIDERS[key];
            return (
              <label key={key} className="fmx-control">
                <span>
                  {s.label}
                  <output>
                    {fmt(v[key])} {s.unit}
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
        {controls.includes("slope") && (
          <div className="fmx-control fmx-slope" role="group" aria-label="VCO tuning slope">
            <span>Tuning slope</span>
            <div>
              {([1, -1] as const).map((sl) => (
                <button key={sl} type="button" className={v.slope === sl ? "is-on" : ""} aria-pressed={v.slope === sl} onClick={() => setV({ ...v, slope: sl })}>
                  {sl > 0 ? "positive" : "negative"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {bench && (
        <div className="fmx-bench">
          <button type="button" className="g-button" onClick={loadBench}>
            Load my VCO settings
          </button>
          {loaded && <span>{loaded}</span>}
        </div>
      )}
      <figcaption>
        {caption ??
          "Shaded warm: the message is pushing the frequency up, so cycles crowd together. Shaded cool: the frequency is below rest, so cycles spread out. The dashed lines show the FM amplitude never changes."}
      </figcaption>
    </figure>
  );
}
