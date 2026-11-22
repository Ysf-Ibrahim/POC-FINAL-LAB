import type { ReactNode } from "react";

/**
 * Illustrations for the Lab 2 guide. Every waveform is computed from the same
 * equation the experiment uses, AM = (message + DC) × carrier, with the lab's
 * amplitudes (message 2 V peak, carrier 2 V peak). Only the carrier frequency
 * is drawn lower than the real 100 kHz, so that single cycles can be seen.
 */

const W = 348;
const TWO_PI = 2 * Math.PI;
/** Message cycles across a figure, and carrier cycles per message cycle as drawn. */
const CYCLES = 2;
const RATIO = 13;

const message = (t: number) => 2 * Math.sin(TWO_PI * CYCLES * t);
const carrier = (t: number) => 2 * Math.sin(TWO_PI * CYCLES * RATIO * t);

function path(fn: (t: number) => number, x0: number, x1: number, yOf: (v: number) => number, n = 520) {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    d += `${i ? "L" : "M"}${(x0 + (x1 - x0) * t).toFixed(1)} ${yOf(fn(t)).toFixed(1)}`;
  }
  return d;
}

function Svg({ h, label, children }: { h: number; label: string; children: ReactNode }) {
  return (
    <svg className="g-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** Message, carrier and the AM signal they produce. */
export function SignalsFigure() {
  const rows = [
    { name: "Message", sub: "2 kHz", fn: message, cls: "f-message", range: 2.4 },
    { name: "Carrier", sub: "100 kHz", fn: carrier, cls: "f-carrier", range: 2.4 },
    { name: "AM signal", sub: "", fn: (t: number) => (message(t) + 2.6) * carrier(t), cls: "f-am", range: 10.4 },
  ];
  const rowH = 52;
  return (
    <Svg h={rows.length * rowH + 4} label="The message, the carrier and the resulting AM signal">
      {rows.map((row, i) => {
        const mid = i * rowH + rowH / 2 + 2;
        const yOf = (v: number) => mid - (v / row.range) * (rowH / 2 - 5);
        return (
          <g key={row.name}>
            <text x={0} y={mid - 2} className="f-label">
              {row.name}
            </text>
            <text x={0} y={mid + 10} className="f-sub">
              {row.sub}
            </text>
            <path d={path(row.fn, 62, W - 2, yOf)} className={row.cls} />
          </g>
        );
      })}
    </Svg>
  );
}

/** The message before and after the DC is added. */
export function ShiftFigure({ dc = 2 }: { dc?: number }) {
  const h = 146;
  const zero = 96;
  const unit = 17;
  const yOf = (v: number) => zero - v * unit;
  return (
    <Svg h={h} label={`The message shifted up by ${dc} volts of DC`}>
      <line x1={40} x2={W - 2} y1={zero} y2={zero} className="f-axis" />
      <text x={0} y={zero + 4} className="f-sub">
        0 V
      </text>
      <line x1={40} x2={W - 2} y1={yOf(dc)} y2={yOf(dc)} className="f-guide" />
      <text x={0} y={yOf(dc) + 4} className="f-sub">
        {dc} V
      </text>
      <path d={path(message, 40, W - 2, yOf)} className="f-ghost" />
      <path d={path((t) => message(t) + dc, 40, W - 2, yOf)} className="f-message" />
      <text x={W - 4} y={yOf(dc + 2) - 5} textAnchor="end" className="f-label">
        message + DC
      </text>
      <text x={W - 4} y={yOf(-2) + 13} textAnchor="end" className="f-sub">
        message alone
      </text>
    </Svg>
  );
}

interface AmProps {
  /** DC level in volts; the message is 2 V peak, so μ = 2 / dc. */
  dc: number;
  h?: number;
  x0?: number;
  x1?: number;
  top?: number;
  /** Largest voltage the figure must show. */
  full?: number;
  showPQ?: boolean;
  showEnvelope?: boolean;
}

function AmTrace({ dc, h = 120, x0 = 2, x1 = W - 2, top = 0, full, showPQ, showEnvelope = true }: AmProps) {
  const peak = full ?? 2 * (dc + 2);
  const mid = top + h / 2;
  const yOf = (v: number) => mid - (v / peak) * (h / 2 - 6);
  const env = (t: number) => 2 * (message(t) + dc);
  const tMax = 0.25 / CYCLES; // first message peak
  const tMin = 0.75 / CYCLES; // first message trough
  const xAt = (t: number) => x0 + (x1 - x0) * t;
  const P = 2 * 2 * (dc + 2);
  const Q = 2 * 2 * (dc - 2);
  return (
    <g>
      <line x1={x0} x2={x1} y1={mid} y2={mid} className="f-axis" />
      <path d={path((t) => (message(t) + dc) * carrier(t), x0, x1, yOf, 900)} className="f-am" />
      {showEnvelope && (
        <>
          <path d={path(env, x0, x1, yOf)} className="f-env" />
          <path d={path((t) => -env(t), x0, x1, yOf)} className="f-env" />
        </>
      )}
      {showPQ && (
        <>
          <line x1={xAt(tMax + 0.5)} x2={xAt(tMax + 0.5)} y1={yOf(P / 2)} y2={yOf(-P / 2)} className="f-measure" />
          <text x={xAt(tMax + 0.5) + 6} y={mid - (h / 2 - 6) * 0.5} className="f-label f-on-wave">
            P
          </text>
          <line x1={xAt(tMin)} x2={xAt(tMin)} y1={yOf(Q / 2)} y2={yOf(-Q / 2)} className="f-measure" />
          <text x={xAt(tMin) + 6} y={Q < 0 ? yOf(-Q / 2) - 5 : mid + 4} className="f-label f-on-wave">
            Q{Q < 0 ? " (negative)" : ""}
          </text>
        </>
      )}
    </g>
  );
}

/** One AM waveform with its envelopes, optionally with the P and Q measurements marked. */
export function AmFigure({ dc, showPQ, h = 124 }: { dc: number; showPQ?: boolean; h?: number }) {
  return (
    <Svg h={h} label={`AM signal with modulation index ${(2 / dc).toFixed(2)}`}>
      <AmTrace dc={dc} h={h} showPQ={showPQ} />
    </Svg>
  );
}

/** The three modulation cases next to each other, drawn to the same voltage scale. */
export function DepthFigure() {
  const cases = [
    { dc: 4, title: "μ = 0.5", note: "DC 4 V · under" },
    { dc: 2, title: "μ = 1", note: "DC 2 V · 100%" },
    { dc: 1, title: "μ = 2", note: "DC 1 V · over" },
  ];
  const gap = 8;
  const w = (W - gap * 2) / 3;
  const h = 104;
  return (
    <Svg h={h + 30} label="AM signals for modulation index 0.5, 1 and 2">
      {cases.map((c, i) => {
        const x0 = i * (w + gap);
        return (
          <g key={c.dc}>
            <AmTrace dc={c.dc} h={h} x0={x0} x1={x0 + w} full={12} />
            <text x={x0 + w / 2} y={h + 12} textAnchor="middle" className="f-label">
              {c.title}
            </text>
            <text x={x0 + w / 2} y={h + 25} textAnchor="middle" className="f-sub">
              {c.note}
            </text>
          </g>
        );
      })}
    </Svg>
  );
}

/** DSB-SC: the same product with no DC. The outline is |message|, and the carrier flips at each zero. */
export function DsbscFigure() {
  const h = 116;
  const mid = h / 2;
  const yOf = (v: number) => mid - (v / 4) * (h / 2 - 6);
  return (
    <Svg h={h} label="DSB-SC signal: the carrier reverses phase each time the message crosses zero">
      <line x1={2} x2={W - 2} y1={mid} y2={mid} className="f-axis" />
      <path d={path((t) => message(t) * carrier(t), 2, W - 2, yOf, 900)} className="f-am" />
      <path d={path((t) => 2 * message(t), 2, W - 2, yOf)} className="f-env" />
      <path d={path((t) => -2 * message(t), 2, W - 2, yOf)} className="f-env" />
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={2 + (W - 4) * t} x2={2 + (W - 4) * t} y1={mid - 9} y2={mid + 9} className="f-measure" />
      ))}
    </Svg>
  );
}

/** Line spectrum of the transmitted signal for the lab's 2 kHz message and 100 kHz carrier. */
export function SpectrumFigure({ carrier: withCarrier = true, dc = 2 }: { carrier?: boolean; dc?: number }) {
  const h = 138;
  const base = 96;
  const xOf = (kHz: number) => (kHz < 50 ? 34 + kHz * 9 : 178 + (kHz - 98) * 36);
  const unit = 15; // px per volt
  const lines = [
    { f: 98, v: 2, sub: "lower" },
    ...(withCarrier ? [{ f: 100, v: 2 * dc, sub: "carrier" }] : []),
    { f: 102, v: 2, sub: "upper" },
  ];
  return (
    <Svg h={h} label={withCarrier ? "Spectrum of the AM signal: carrier at 100 kHz and sidebands at 98 and 102 kHz" : "Spectrum of DSB-SC: sidebands at 98 and 102 kHz, no carrier"}>
      <line x1={10} x2={W - 4} y1={base} y2={base} className="f-axis" />
      <text x={10} y={base + 31} className="f-sub">
        frequency →
      </text>
      {/* the message frequency: nothing is transmitted here */}
      <line x1={xOf(2)} x2={xOf(2)} y1={base} y2={base - 2 * unit} className="f-absent" />
      <text x={xOf(2)} y={base + 13} textAnchor="middle" className="f-sub">
        2 kHz
      </text>
      <text x={xOf(2) + 8} y={base - 2 * unit + 4} className="f-sub">
        nothing here
      </text>
      <text x={130} y={base + 13} textAnchor="middle" className="f-sub">
        ⋯
      </text>
      {!withCarrier && (
        <>
          <line x1={xOf(100)} x2={xOf(100)} y1={base} y2={base - 4 * unit} className="f-absent" />
          <text x={xOf(100)} y={base - 4 * unit - 5} textAnchor="middle" className="f-sub">
            no carrier
          </text>
        </>
      )}
      {lines.map((l) => (
        <g key={l.f}>
          <line x1={xOf(l.f)} x2={xOf(l.f)} y1={base} y2={base - l.v * unit} className={l.f === 100 ? "f-line-carrier" : "f-line-side"} />
          <circle cx={xOf(l.f)} cy={base - l.v * unit} r={2.6} className={l.f === 100 ? "f-dot-carrier" : "f-dot-side"} />
          <text x={xOf(l.f)} y={base - l.v * unit - 7} textAnchor="middle" className="f-sub">
            {l.sub}
          </text>
        </g>
      ))}
      {[98, 100, 102].map((f) => (
        <text key={f} x={xOf(f)} y={base + 13} textAnchor="middle" className="f-label">
          {f} kHz
        </text>
      ))}
      <path d={`M${xOf(98)} ${base + 19}v4H${xOf(102)}v-4`} className="f-wire" />
      <text x={xOf(100)} y={base + 35} textAnchor="middle" className="f-sub">
        bandwidth 4 kHz
      </text>
    </Svg>
  );
}

/** The block diagram of the experiment (manual Figures 3 and 5). `stage` dims what is not built yet. */
export function BlockDiagram({ stage = 3 }: { stage?: 1 | 2 | 3 }) {
  const dim = (on: boolean) => (on ? "" : "f-dim");
  const box = (x: number, y: number, w: number, title: string, sub: string, on: boolean) => (
    <g className={dim(on)}>
      <rect x={x} y={y} width={w} height={38} rx={6} className="f-box" />
      <text x={x + w / 2} y={y + 16} textAnchor="middle" className="f-label">
        {title}
      </text>
      <text x={x + w / 2} y={y + 29} textAnchor="middle" className="f-sub">
        {sub}
      </text>
    </g>
  );
  const arrow = (d: string, on: boolean) => <path d={d} className={`f-wire ${dim(on)}`} markerEnd="url(#g-arrow)" />;
  const tag = (x: number, y: number, text: string, on: boolean, anchor: "start" | "middle" | "end" = "middle") => (
    <text x={x} y={y} textAnchor={anchor} className={`f-sub ${dim(on)}`}>
      {text}
    </text>
  );
  return (
    <Svg h={148} label="Block diagram: the 2 kHz message and a DC voltage are added, then multiplied by the 100 kHz carrier">
      <defs>
        <marker id="g-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0L8 4L0 8Z" className="f-arrowhead" />
        </marker>
      </defs>
      {box(1, 8, 86, "Master Signals", "2 kHz sine", true)}
      {box(1, 106, 86, "Variable DCV", "DC voltage", stage >= 2)}
      {box(118, 8, 62, "Adder", "A + B", true)}
      {box(226, 8, 70, "Multiplier", "X × Y", stage >= 3)}
      {box(218, 106, 86, "Master Signals", "100 kHz sine", stage >= 3)}
      {arrow("M88 27H116", true)}
      {tag(102, 21, "A", true)}
      {arrow("M88 125H149V48", stage >= 2)}
      {tag(155, 62, "B", stage >= 2, "start")}
      {arrow("M181 27H224", stage >= 3)}
      {tag(217, 21, "X", stage >= 3)}
      {arrow("M261 105V48", stage >= 3)}
      {tag(267, 62, "Y", stage >= 3, "start")}
      {arrow("M200 27V70", true)}
      {tag(200, 83, "message", true)}
      {tag(200, 94, "to CH1", true)}
      {arrow("M297 27H345", stage >= 3)}
      {tag(346, 44, "AM", stage >= 3, "end")}
      {tag(346, 55, "to CH2", stage >= 3, "end")}
    </Svg>
  );
}
