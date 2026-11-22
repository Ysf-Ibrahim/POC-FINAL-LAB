import type { ReactNode } from "react";

/**
 * Illustrations for the Lab 3 guide. Each waveform comes from a small
 * simulation of the circuit it shows (half-wave rectifier, RC low-pass, peak
 * detector), driven by the AM equation of Lab 2. The carrier is drawn at only
 * 14 cycles per message cycle instead of 48, and the RC time constants are
 * scaled with it, so that individual carrier cycles and the ripple are visible.
 */

const W = 348;
const TWO_PI = 2 * Math.PI;
/** Carrier cycles per message cycle, as drawn. */
const RATIO = 14;
/** Message cycles across a figure. */
const CYCLES = 2;
/** Points per figure. */
const N = 2800;

type Series = Float64Array;

function Svg({ h, label, children }: { h: number; label: string; children: ReactNode }) {
  return (
    <svg className="g-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

function pathOf(v: Series, x0: number, x1: number, yOf: (v: number) => number) {
  let d = "";
  const n = v.length;
  for (let i = 0; i < n; i++) d += `${i ? "L" : "M"}${(x0 + ((x1 - x0) * i) / (n - 1)).toFixed(1)} ${yOf(v[i]).toFixed(1)}`;
  return d;
}

interface Run {
  message: Series;
  am: Series;
  rectified: Series;
  /** Rectifier followed by an RC low-pass: the average of the half-wave pulses. */
  rc: Series;
  /** Diode & RC LPF: the capacitor holds the peaks. */
  peak: Series;
  /** One more RC stage after `rc` / after `peak`. */
  rc2: Series;
  peak2: Series;
  /** Final smoothing, standing in for the Tunable LPF. */
  smoothRc: Series;
  smoothPeak: Series;
}

/**
 * Simulate the receiver for a message of peak 1 on a DC level `dc`.
 * `tau` is the RC time constant in carrier periods; `drop` the diode drop
 * relative to a message peak of 1.
 */
function simulate({ dc = 1.25, tau = 2.2, drop = 0.12, suppressed = false } = {}): Run {
  const warm = N / CYCLES; // one message cycle of warm-up
  const total = N + warm;
  const dt = (CYCLES / N) * RATIO; // in carrier periods
  const a = 1 - Math.exp(-dt / tau);
  const fall = Math.exp(-dt / tau);
  const charge = 1 - Math.exp(-dt / 0.06);
  const s = (n: number) => new Float64Array(n);
  const out = { message: s(N), am: s(N), rectified: s(N), rc: s(N), peak: s(N), rc2: s(N), peak2: s(N), smoothRc: s(N), smoothPeak: s(N) };
  let yRc = 0;
  let yPeak = 0;
  let yRc2 = 0;
  let yPeak2 = 0;
  // Final smoothing: average over one carrier period, then a gentle one-pole.
  const window = Math.round(1 / dt);
  const histRc: number[] = [];
  const histPeak: number[] = [];
  let sumRc = 0;
  let sumPeak = 0;
  let fRc = 0;
  let fPeak = 0;
  const b = 1 - Math.exp(-dt / 1.2);
  for (let i = 0; i < total; i++) {
    const t = i * dt; // carrier periods
    const m = Math.sin((TWO_PI * t) / RATIO);
    const env = suppressed ? m : dc + m;
    const am = env * Math.sin(TWO_PI * t);
    const rect = Math.max(0, am - drop);
    yRc += a * (rect - yRc);
    yPeak *= fall;
    if (rect > yPeak) yPeak += charge * (rect - yPeak);
    yRc2 += a * (yRc - yRc2);
    yPeak2 += a * (yPeak - yPeak2);
    histRc.push(yRc);
    histPeak.push(yPeak2);
    sumRc += yRc;
    sumPeak += yPeak2;
    if (histRc.length > window) {
      sumRc -= histRc.shift()!;
      sumPeak -= histPeak.shift()!;
    }
    fRc += b * (sumRc / histRc.length - fRc);
    fPeak += b * (sumPeak / histPeak.length - fPeak);
    if (i >= warm) {
      const k = i - warm;
      out.message[k] = m;
      out.am[k] = am;
      out.rectified[k] = rect;
      out.rc[k] = yRc;
      out.peak[k] = yPeak;
      out.rc2[k] = yRc2;
      out.peak2[k] = yPeak2;
      out.smoothRc[k] = fRc;
      out.smoothPeak[k] = fPeak;
    }
  }
  return out;
}

const range = (v: Series) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of v) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return { lo, hi };
};

interface Row {
  name: string;
  sub?: string;
  data: Series;
  cls?: string;
  /** Show the 0 V line. */
  zero?: boolean;
  /** Dashed reference drawn behind, on the same scale. */
  ghost?: Series;
}

/** Waveforms stacked one under the other, each scaled to its own row. */
function Rows({ rows, label, rowH = 50, labelW = 74 }: { rows: Row[]; label: string; rowH?: number; labelW?: number }) {
  return (
    <Svg h={rows.length * rowH + 2} label={label}>
      {rows.map((row, i) => {
        const top = i * rowH + 4;
        const { lo: l0, hi: h0 } = range(row.data);
        const lo = row.zero ? Math.min(0, l0) : l0;
        const hi = row.zero ? Math.max(0, h0) : h0;
        const span = hi - lo || 1;
        const yOf = (v: number) => top + (rowH - 10) * (1 - (v - lo) / span);
        return (
          <g key={row.name}>
            <text x={0} y={top + rowH / 2 - 4} className="f-label">
              {row.name}
            </text>
            {row.sub && (
              <text x={0} y={top + rowH / 2 + 8} className="f-sub">
                {row.sub}
              </text>
            )}
            {row.zero && <line x1={labelW} x2={W - 2} y1={yOf(0)} y2={yOf(0)} className="f-axis" />}
            {row.ghost && <path d={pathOf(row.ghost, labelW, W - 2, yOf)} className="f-ghost" />}
            <path d={pathOf(row.data, labelW, W - 2, yOf)} className={row.cls ?? "f-am"} />
          </g>
        );
      })}
    </Svg>
  );
}

const base = simulate();

/** Manual Figure 1, computed: AM → rectifier → RC LPF → recovered message. */
export function DetectorFigure() {
  return (
    <Rows
      label="The AM signal, the rectified AM signal, and the recovered message after the RC low-pass filter"
      rows={[
        { name: "AM signal", sub: "node 1", data: base.am, zero: true },
        { name: "Rectified", sub: "one half only", data: base.rectified, zero: true },
        { name: "After RC LPF", sub: "follows envelope", data: base.peak, cls: "f-message" },
      ]}
    />
  );
}

/** What a half-wave rectifier keeps, with the diode drop marked. */
export function RectifierFigure() {
  const h = 128;
  const x0 = 6;
  const x1 = W - 6;
  const zero = 70;
  const k = 22; // px per unit
  const yOf = (v: number) => zero - v * k;
  // three carrier cycles at a fixed amplitude, so the drop is easy to see
  const n = 600;
  const inp = new Float64Array(n);
  const out = new Float64Array(n);
  const drop = 0.55;
  for (let i = 0; i < n; i++) {
    const v = 2.2 * Math.sin((TWO_PI * 3 * i) / (n - 1));
    inp[i] = v;
    out[i] = Math.max(0, v - drop);
  }
  const peakX = x0 + (x1 - x0) * (0.25 / 3);
  return (
    <Svg h={h} label="Half-wave rectification: the negative half-cycles are removed and the positive peaks are lowered by the diode drop">
      <line x1={x0} x2={x1} y1={zero} y2={zero} className="f-axis" />
      <path d={pathOf(inp, x0, x1, yOf)} className="f-ghost" />
      <path d={pathOf(out, x0, x1, yOf)} className="f-message" />
      <line x1={peakX + 16} x2={peakX + 16} y1={yOf(2.2)} y2={yOf(2.2 - drop)} className="f-measure" />
      <text x={peakX + 22} y={yOf(2.2 - drop / 2) + 3} className="f-label f-on-wave">
        ≈ 0.7 V diode drop
      </text>
      <text x={x1} y={yOf(-2.2) + 14} textAnchor="end" className="f-sub">
        dashed: input · solid: rectifier output
      </text>
      <text x={x0} y={yOf(-1.3)} className="f-sub">
        removed
      </text>
    </Svg>
  );
}

/** A few carrier cycles close up: the capacitor charges at each peak and discharges in between. */
export function ChargeFigure() {
  const h = 132;
  const x0 = 4;
  const x1 = W - 4;
  const n = 900;
  const cycles = 5;
  const rect = new Float64Array(n);
  const cap = new Float64Array(n);
  let y = 0.8;
  const dt = cycles / n;
  const fall = Math.exp(-dt / 7);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const env = 1.45 + 0.35 * Math.sin((TWO_PI * t) / 9);
    const v = Math.max(0, env * Math.sin(TWO_PI * t));
    rect[i] = v;
    y *= fall;
    if (v > y) y += 0.5 * (v - y);
    cap[i] = y;
  }
  const yOf = (v: number) => h - 22 - v * 52;
  const at = (t: number) => x0 + ((x1 - x0) * t) / cycles;
  return (
    <Svg h={h} label="The capacitor voltage rises to each carrier peak and decays slowly until the next one: a small sawtooth that follows the envelope">
      <line x1={x0} x2={x1} y1={yOf(0)} y2={yOf(0)} className="f-axis" />
      <path d={pathOf(rect, x0, x1, yOf)} className="f-ghost" />
      <path d={pathOf(cap, x0, x1, yOf)} className="f-message" />
      <text x={at(1.25)} y={yOf(1.82) - 6} textAnchor="middle" className="f-label f-on-wave">
        charges at the peak
      </text>
      <text x={at(2.45)} y={yOf(0.55)} textAnchor="middle" className="f-label f-on-wave">
        discharges slowly through R
      </text>
      <text x={x1} y={h - 4} textAnchor="end" className="f-sub">
        dashed: rectified AM · solid: capacitor voltage · 5 carrier cycles
      </text>
    </Svg>
  );
}

/** Three RC time constants: too short, about right, too long. */
export function TimeConstantFigure() {
  const panels = [
    { tau: 0.35, title: "RC too small", note: "large ripple" },
    { tau: 2.2, title: "RC about right", note: "follows the envelope" },
    { tau: 14, title: "RC too large", note: "misses the falls" },
  ];
  const gap = 8;
  const w = (W - gap * 2) / 3;
  const h = 92;
  return (
    <Svg h={h + 30} label="Envelope detector output for a time constant that is too small, about right and too large">
      {panels.map((p, i) => {
        const run = simulate({ tau: p.tau, dc: 1.15 });
        const x0 = i * (w + gap);
        const top = 2;
        const hi = Math.max(...run.rectified);
        const yOf = (v: number) => top + h - 4 - (v / hi) * (h - 8);
        const env = new Float64Array(N);
        for (let k = 0; k < N; k++) env[k] = Math.max(0, 1.15 + run.message[k] - 0.12);
        return (
          <g key={p.title}>
            <rect x={x0} y={top} width={w} height={h} rx={5} className="f-panel" />
            <path d={pathOf(env, x0 + 3, x0 + w - 3, yOf)} className="f-env" />
            <path d={pathOf(run.peak, x0 + 3, x0 + w - 3, yOf)} className="f-message" />
            <text x={x0 + w / 2} y={h + 15} textAnchor="middle" className="f-label">
              {p.title}
            </text>
            <text x={x0 + w / 2} y={h + 27} textAnchor="middle" className="f-sub">
              {p.note}
            </text>
          </g>
        );
      })}
    </Svg>
  );
}

/**
 * Magnitude response of the RC LPF (first order, 2.6 kHz) and of a steep
 * filter, against a logarithmic frequency axis, with the message and carrier marked.
 */
export function ResponseFigure() {
  const h = 150;
  const x0 = 34;
  const x1 = W - 8;
  const y0 = 12;
  const y1 = 108;
  const fMin = 100;
  const fMax = 1e6;
  const xOf = (f: number) => x0 + ((x1 - x0) * Math.log10(f / fMin)) / Math.log10(fMax / fMin);
  const dbMin = -60;
  const yOf = (db: number) => y0 + ((y1 - y0) * Math.min(0, Math.max(dbMin, db))) / dbMin;
  const rc = (f: number) => -10 * Math.log10(1 + (f / 2600) ** 2);
  const steep = (f: number) => (f < 6000 ? 0 : Math.max(dbMin, -120 * Math.log10(f / 6000)));
  const curve = (fn: (f: number) => number) => {
    let d = "";
    for (let i = 0; i <= 160; i++) {
      const f = fMin * Math.pow(fMax / fMin, i / 160);
      d += `${i ? "L" : "M"}${xOf(f).toFixed(1)} ${yOf(fn(f)).toFixed(1)}`;
    }
    return d;
  };
  const mark = (f: number, name: string, sub: string) => (
    <g>
      <line x1={xOf(f)} x2={xOf(f)} y1={y0} y2={y1} className="f-guide" />
      <text x={xOf(f)} y={y1 + 13} textAnchor="middle" className="f-label">
        {name}
      </text>
      <text x={xOf(f)} y={y1 + 25} textAnchor="middle" className="f-sub">
        {sub}
      </text>
    </g>
  );
  return (
    <Svg h={h} label="Frequency response: the RC low-pass passes the 2 kHz message and reduces the 100 kHz carrier about 38 times; a steep filter removes it completely">
      <line x1={x0} x2={x1} y1={y1} y2={y1} className="f-axis" />
      <line x1={x0} x2={x0} y1={y0} y2={y1} className="f-axis" />
      <text x={x0 - 4} y={yOf(0) + 3} textAnchor="end" className="f-sub">
        ×1
      </text>
      <text x={x0 - 4} y={yOf(-32) + 3} textAnchor="end" className="f-sub">
        ÷38
      </text>
      <line x1={x0} x2={x1} y1={yOf(-32)} y2={yOf(-32)} className="f-guide" />
      {mark(2083, "2 kHz", "message")}
      {mark(100_000, "100 kHz", "carrier")}
      <path d={curve(steep)} className="f-env" />
      <path d={curve(rc)} className="f-message" />
      <text x={xOf(9000)} y={yOf(-6) - 2} className="f-label f-on-wave">
        RC LPF
      </text>
      <text x={xOf(13000)} y={yOf(-50)} className="f-sub f-on-wave">
        steep (Tunable) LPF
      </text>
      <text x={x1} y={h - 2} textAnchor="end" className="f-sub">
        frequency, logarithmic →
      </text>
    </Svg>
  );
}

/** Three spectra: the AM signal, after the rectifier, after the low-pass filter. */
export function SpectrumStagesFigure() {
  const rowH = 46;
  const x0 = 78;
  const x1 = W - 6;
  // compressed axis: 0–6 kHz, then the 100 kHz and 200 kHz groups
  const xOf = (kHz: number) => (kHz < 20 ? x0 + 6 + kHz * 9 : kHz < 150 ? x0 + 128 + (kHz - 100) * 6 : x0 + 214 + (kHz - 200) * 6);
  const rows: { name: string; sub: string; lines: [number, number][] }[] = [
    { name: "AM signal", sub: "node 1", lines: [[98, 0.5], [100, 1], [102, 0.5]] },
    { name: "Rectified", sub: "node 2", lines: [[0, 0.75], [2, 0.42], [98, 0.25], [100, 0.5], [102, 0.25], [198, 0.12], [200, 0.22], [202, 0.12]] },
    { name: "After LPF", sub: "recovered", lines: [[0, 0.75], [2, 0.42]] },
  ];
  return (
    <Svg h={rows.length * rowH + 18} label="Spectra: the AM signal has nothing near 0 Hz; the rectifier creates a copy of the message at 2 kHz; the low-pass filter keeps only that">
      {rows.map((row, i) => {
        const base = i * rowH + rowH - 6;
        return (
          <g key={row.name}>
            <text x={0} y={base - 16} className="f-label">
              {row.name}
            </text>
            <text x={0} y={base - 4} className="f-sub">
              {row.sub}
            </text>
            <line x1={x0} x2={x1} y1={base} y2={base} className="f-axis" />
            {row.lines.map(([f, a]) => (
              <line key={f} x1={xOf(f)} x2={xOf(f)} y1={base} y2={base - a * 34} className={f < 20 ? "f-line-side" : "f-line-carrier"} />
            ))}
            {i === 0 && (
              <text x={xOf(1)} y={base - 6} className="f-sub">
                nothing at 2 kHz
              </text>
            )}
          </g>
        );
      })}
      <text x={xOf(0)} y={rows.length * rowH + 8} textAnchor="middle" className="f-sub">
        DC
      </text>
      <text x={xOf(2)} y={rows.length * rowH + 8} textAnchor="middle" className="f-sub">
        2k
      </text>
      <text x={xOf(100)} y={rows.length * rowH + 8} textAnchor="middle" className="f-sub">
        100k
      </text>
      <text x={xOf(200)} y={rows.length * rowH + 8} textAnchor="middle" className="f-sub">
        200k Hz
      </text>
    </Svg>
  );
}

/** One RC stage against two: less ripple, slightly smaller, slightly later. */
export function OrderFigure() {
  const run = base;
  const h = 132;
  const x0 = 74;
  const x1 = W - 2;
  const { hi } = range(run.peak);
  const yOf = (v: number) => 6 + (h - 30) * (1 - v / hi);
  return (
    <Svg h={h} label="Output after one RC stage, with ripple, and after a second RC stage: smoother, slightly smaller and slightly delayed">
      <text x={0} y={30} className="f-label">
        One stage
      </text>
      <text x={0} y={42} className="f-sub">
        ripple visible
      </text>
      <text x={0} y={70} className="f-label">
        Two stages
      </text>
      <text x={0} y={82} className="f-sub">
        smoother, smaller
      </text>
      <path d={pathOf(run.peak, x0, x1, yOf)} className="f-am" />
      <path d={pathOf(run.peak2, x0, x1, yOf)} className="f-message" />
      <text x={x1} y={h - 6} textAnchor="end" className="f-sub">
        grey: after one RC stage · blue: after a second RC stage (same scale)
      </text>
    </Svg>
  );
}

/** Message and detector output when the AM signal is over-modulated. */
export function OverModFigure() {
  const run = simulate({ dc: 0.5 });
  return (
    <Rows
      label="Over-modulation: the AM envelope folds where message plus DC goes negative, and the detector output follows the fold"
      rows={[
        { name: "AM signal", sub: "μ = 2", data: run.am, zero: true },
        { name: "Envelope", sub: "folded", data: run.peak, cls: "f-message" },
        { name: "Recovered", sub: "vs message", data: run.smoothPeak, cls: "f-message", ghost: scaledLike(run.message, run.smoothPeak) },
      ]}
    />
  );
}

/** DSB-SC through an envelope detector: the output is the rectified message, at twice its frequency. */
export function DsbscDetectFigure() {
  const run = simulate({ suppressed: true });
  return (
    <Rows
      label="DSB-SC through an envelope detector: the output follows the magnitude of the message and repeats at twice the message frequency"
      rows={[
        { name: "DSB-SC", sub: "no DC", data: run.am, zero: true },
        { name: "Detector", sub: "vs message", data: run.smoothPeak, cls: "f-message", ghost: scaledLike(run.message, run.smoothPeak) },
      ]}
    />
  );
}

/** A copy of `ref` stretched to the range of `like`, so the two can be compared by shape. */
function scaledLike(ref: Series, like: Series): Series {
  const a = range(ref);
  const b = range(like);
  const out = new Float64Array(ref.length);
  for (let i = 0; i < ref.length; i++) out[i] = b.lo + ((ref[i] - a.lo) / (a.hi - a.lo || 1)) * (b.hi - b.lo);
  return out;
}

/** What a node looks like on the scope, computed, for the node steps. */
export function NodeFigure({ node }: { node: 1 | 2 | 3 | 4 | 5 | 6 | 7 }) {
  const map: Record<number, { data: Series; name: string; zero?: boolean; cls?: string }> = {
    1: { data: base.am, name: "AM signal", zero: true },
    2: { data: base.rectified, name: "After the rectifier", zero: true },
    3: { data: base.rc, name: "After the RC LPF", cls: "f-message" },
    4: { data: base.smoothRc, name: "After the Tunable LPF", cls: "f-message" },
    5: { data: base.peak, name: "After the Diode & RC LPF", cls: "f-message" },
    6: { data: base.peak2, name: "After the second RC LPF", cls: "f-message" },
    7: { data: base.smoothPeak, name: "After the Tunable LPF", cls: "f-message" },
  };
  const item = map[node];
  return (
    <Rows
      rowH={64}
      labelW={6}
      label={`Expected waveform at node ${node}: ${item.name}`}
      rows={[{ name: "", data: item.data, zero: item.zero, cls: item.cls }]}
    />
  );
}

/**
 * A receiver chain as drawn in the lab sheet (Figures 1, 4 and 5): blocks in a
 * row, with the node numbers on the arrows between them.
 */
export function ChainFigure({
  blocks,
  nodes,
  input = "AM signal",
  output = "Recovered",
  dim = [],
}: {
  blocks: string[];
  /** Labels for the arrows: before the first block, between blocks, after the last. */
  nodes: (string | number)[];
  input?: string;
  output?: string;
  /** Indices of blocks not built yet. */
  dim?: number[];
}) {
  const h = 74;
  const n = blocks.length;
  const left = 52;
  const right = 70;
  const arrow = 20;
  const bw = (W - left - right - arrow * (n - 1)) / n;
  const y = 18;
  const bh = 40;
  const xs = blocks.map((_, i) => left + i * (bw + arrow));
  const ah = (x1: number, x2: number) => <path d={`M${x1} ${y + bh / 2}H${x2 - 1}`} className="f-wire" markerEnd="url(#g3-arrow)" />;
  return (
    <Svg h={h} label={`${input}, then ${blocks.join(", then ")}, giving the ${output.toLowerCase()} message`}>
      <defs>
        <marker id="g3-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0L8 4L0 8Z" className="f-arrowhead" />
        </marker>
      </defs>
      <text x={0} y={y + bh / 2 - 3} className="f-label">
        {input.split(" ")[0]}
      </text>
      <text x={0} y={y + bh / 2 + 9} className="f-sub">
        {input.split(" ").slice(1).join(" ")}
      </text>
      {ah(left - 14, xs[0])}
      {blocks.map((b, i) => {
        const words = b.split("\n");
        return (
          <g key={b} className={dim.includes(i) ? "f-dim" : ""}>
            <rect x={xs[i]} y={y} width={bw} height={bh} rx={6} className="f-box" />
            {words.map((wd, j) => (
              <text key={wd} x={xs[i] + bw / 2} y={y + bh / 2 + 4 + (j - (words.length - 1) / 2) * 11} textAnchor="middle" className="f-label">
                {wd}
              </text>
            ))}
            {i < n - 1 && ah(xs[i] + bw, xs[i + 1])}
          </g>
        );
      })}
      {ah(xs[n - 1] + bw, W - right + 4)}
      <text x={W} y={y + bh / 2 - 3} textAnchor="end" className="f-label">
        {output}
      </text>
      <text x={W} y={y + bh / 2 + 9} textAnchor="end" className="f-sub">
        message
      </text>
      {nodes.map((label, i) => {
        const x = i === 0 ? left - 8 : i === n ? xs[n - 1] + bw + 10 : xs[i] - arrow / 2;
        return (
          <g key={i}>
            <circle cx={x} cy={y - 7} r={6.5} className="f-node" />
            <text x={x} y={y - 4} textAnchor="middle" className="f-node-text">
              {label}
            </text>
          </g>
        );
      })}
    </Svg>
  );
}
