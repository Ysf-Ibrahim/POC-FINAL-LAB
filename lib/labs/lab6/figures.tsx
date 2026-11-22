import type { ReactNode } from "react";

/**
 * Static illustrations for the Lab 6 guide. Every curve and dot is computed
 * from the numbers in its caption (a 2 kHz sine of 2 V peak, sampled at the
 * stated rate, the first sample at t = 0 unless a phase is given).
 */

const W = 348;
const TAU = 2 * Math.PI;

function Svg({
  h,
  label,
  children,
}: {
  h: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <svg
      className="g-svg"
      viewBox={`0 0 ${W} ${h}`}
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

const curve = (
  f: (t: number) => number,
  t0: number,
  t1: number,
  xOf: (t: number) => number,
  yOf: (v: number) => number,
  steps = 240,
) => {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    d += `${i ? "L" : "M"}${xOf(t).toFixed(1)} ${yOf(f(t)).toFixed(1)}`;
  }
  return d;
};

/** One cycle of the 2 kHz message with the four 8 kHz sampling instants marked. */
export function SampleDotsFigure() {
  const h = 132;
  const x0 = 26;
  const x1 = W - 14;
  const T = 500e-6;
  const xOf = (t: number) => x0 + ((x1 - x0) * t) / T;
  const mid = 58;
  const yOf = (v: number) => mid - v * 22;
  const msg = (t: number) => 2 * Math.sin(TAU * 2000 * t);
  const instants = [0, 125e-6, 250e-6, 375e-6, 500e-6];
  return (
    <Svg
      h={h}
      label="One 500 microsecond cycle of the 2 kilohertz message. Sampling at 8 kilohertz takes a value every 125 microseconds: 0, plus 2, 0, minus 2 volts, then 0 again at the start of the next cycle."
    >
      <line x1={x0} x2={x1} y1={mid} y2={mid} className="f-axis" />
      <path d={curve(msg, 0, T, xOf, yOf)} className="f-message" />
      {instants.map((t, i) => (
        <g key={t}>
          <line x1={xOf(t)} x2={xOf(t)} y1={10} y2={104} className="f-guide" />
          <circle cx={xOf(t)} cy={yOf(msg(t))} r={3.4} className="fmx-dot" />
          <text
            x={xOf(t) + (i === 0 ? 4 : i === 4 ? -4 : 0)}
            y={yOf(msg(t)) + (msg(t) > 0.5 ? -7 : 14)}
            textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
            className="f-label f-on-wave"
          >
            {Math.abs(msg(t)) < 0.01 ? "0 V" : `${msg(t) > 0 ? "+" : "−"}2 V`}
          </text>
          <text x={xOf(t)} y={116} textAnchor="middle" className="f-sub">
            {Math.round(t * 1e6)} µs
          </text>
        </g>
      ))}
      <path d={`M${xOf(0)} 124H${xOf(125e-6)}`} className="f-measure" />
      <text x={xOf(62.5e-6)} y={131} textAnchor="middle" className="f-sub">
        Ts = 125 µs
      </text>
      <text x={xOf(312e-6)} y={131} textAnchor="middle" className="f-sub">
        one message cycle T = 500 µs = 4 × Ts
      </text>
    </Svg>
  );
}

/**
 * The same 2 kHz sine (grey) sampled at several rates. The dots are the
 * samples; the blue curve is the slowest wave that passes through all of them,
 * which is what an ideal reconstruction filter rebuilds.
 */
export function RatesFigure({
  rates,
  phase = 0,
}: {
  rates: number[];
  phase?: number;
}) {
  const rowH = 50;
  const x0 = 64;
  const x1 = W - 6;
  const span = 1e-3;
  const fm = 2000;
  const xOf = (t: number) => x0 + ((x1 - x0) * t) / span;
  const phi = (phase * Math.PI) / 180;
  return (
    <Svg
      h={rates.length * rowH + 26}
      label={`A 2 kilohertz sine sampled at ${rates.join(", ")} kilohertz. Dots are the samples; the solid line is the slowest wave through them.`}
    >
      {rates.map((r, i) => {
        const fs = r * 1000;
        const mid = i * rowH + 26;
        const yOf = (v: number) => mid - v * 9.5;
        const msg = (t: number) => 2 * Math.sin(TAU * fm * t + phi);
        // samples of sin(2π fm t + φ) at t = n/fs equal those of sin(2π r' fs t + φ), r' = fm/fs − round(fm/fs)
        const rr = fm / fs - Math.round(fm / fs);
        // exactly two samples per cycle: they alternate ±2 sin φ, so the slowest fit is a cosine at fs/2 of that size
        const boundary = Math.abs(Math.abs(rr) - 0.5) < 1e-9;
        const slow = boundary
          ? (t: number) => 2 * Math.sin(phi) * Math.cos(Math.PI * fs * t)
          : (t: number) => 2 * Math.sin(TAU * rr * fs * t + phi);
        const dots = [];
        for (let k = 0; k / fs <= span + 1e-12; k++) dots.push(k / fs);
        const fa = Math.abs(rr * fs);
        const verdict = boundary
          ? Math.abs(Math.sin(phi)) < 1e-6
            ? "flat ✗"
            : "ambiguous ✗"
          : fa < 1
            ? "flat ✗"
            : Math.abs(fa - fm) < 1
              ? "2 kHz ✓"
              : `${+(fa / 1000).toFixed(2)} kHz ✗`;
        return (
          <g key={r}>
            <text x={0} y={mid - 4} className="f-label">
              fs = {r} kHz
            </text>
            <text x={0} y={mid + 8} className="f-sub">
              {+(fs / fm).toFixed(2)} per cycle
            </text>
            <text
              x={0}
              y={mid + 19}
              className={`f-sub ${verdict.includes("✗") ? "f-bad" : "f-good"}`}
            >
              looks like {verdict}
            </text>
            <line x1={x0} x2={x1} y1={mid} y2={mid} className="f-axis" />
            <path d={curve(msg, 0, span, xOf, yOf, 300)} className="f-ghost" />
            <path
              d={curve(slow, 0, span, xOf, yOf, 300)}
              className="f-message"
            />
            {dots.map((t) => (
              <circle
                key={t}
                cx={xOf(t)}
                cy={yOf(msg(t))}
                r={2.6}
                className="fmx-dot"
              />
            ))}
          </g>
        );
      })}
      <text x={0} y={rates.length * rowH + 10} className="f-sub">
        1 ms shown. Red dots: the samples. Dashed: the real 2 kHz message.
      </text>
      <text x={0} y={rates.length * rowH + 22} className="f-sub">
        Solid: the slowest wave through the dots, what a filter rebuilds.
      </text>
    </Svg>
  );
}

/** A 2 kHz sine and a 1 kHz sine pass through exactly the same samples taken at 3 kHz. */
export function TwoWavesFigure() {
  const h = 128;
  const x0 = 10;
  const x1 = W - 8;
  const span = 2e-3;
  const fs = 3000;
  const xOf = (t: number) => x0 + ((x1 - x0) * t) / span;
  const mid = 54;
  const yOf = (v: number) => mid - v * 20;
  const a = (t: number) => 2 * Math.sin(TAU * 2000 * t);
  const b = (t: number) => -2 * Math.sin(TAU * 1000 * t);
  const dots = [];
  for (let k = 0; k / fs <= span + 1e-12; k++) dots.push(k / fs);
  return (
    <Svg
      h={h}
      label="A 2 kilohertz sine and an upside-down 1 kilohertz sine drawn together. Samples taken every 333 microseconds, at 3 kilohertz, land on both curves: the samples cannot tell them apart."
    >
      <line x1={x0} x2={x1} y1={mid} y2={mid} className="f-axis" />
      <path d={curve(a, 0, span, xOf, yOf, 400)} className="f-am" />
      <path d={curve(b, 0, span, xOf, yOf, 400)} className="f-message" />
      {dots.map((t) => (
        <g key={t}>
          <line x1={xOf(t)} x2={xOf(t)} y1={12} y2={98} className="f-guide" />
          <circle cx={xOf(t)} cy={yOf(a(t))} r={3.4} className="fmx-dot" />
        </g>
      ))}
      <line x1={x0} x2={x0 + 16} y1={110} y2={110} className="f-am" />
      <text x={x0 + 20} y={113} className="f-sub">
        the real 2 kHz message
      </text>
      <line
        x1={x0 + 140}
        x2={x0 + 156}
        y1={110}
        y2={110}
        className="f-message"
      />
      <text x={x0 + 160} y={113} className="f-sub">
        a 1 kHz wave (inverted)
      </text>
      <text x={x0} y={125} className="f-sub">
        red dots: samples every 333 µs (fs = 3 kHz). Both waves pass through
        every one.
      </text>
    </Svg>
  );
}

/**
 * Spectrum of the naturally sampled 2 kHz message with the trainer's 8 kHz,
 * 50 % duty clock: message × (D + Σ (2 sin(nπD)/(nπ)) cos nωs t). With D = 0.5
 * the even harmonics of the clock are zero, so 14 and 18 kHz are missing.
 */
export function ImagesFigure() {
  const h = 146;
  const x0 = 14;
  const x1 = W - 10;
  const fMax = 24;
  const xOf = (f: number) => x0 + ((x1 - x0) * f) / fMax;
  const base = 100;
  const scale = 120; // px per volt of peak amplitude
  const D = 0.5;
  const A = 2;
  const lines: { f: number; a: number; label: string }[] = [
    { f: 2, a: A * D, label: "2" },
  ];
  for (let n = 1; n <= 3; n++) {
    const c = (A * Math.sin(n * Math.PI * D)) / (n * Math.PI);
    lines.push(
      { f: n * 8 - 2, a: Math.abs(c), label: `${n * 8 - 2}` },
      { f: n * 8 + 2, a: Math.abs(c), label: `${n * 8 + 2}` },
    );
  }
  const cut = 4;
  return (
    <Svg
      h={h}
      label="Spectrum of the naturally sampled message: 1 volt at 2 kilohertz, 0.64 volts at 6 and 10 kilohertz, nothing at 14 and 18 kilohertz for a 50 percent clock, 0.21 volts at 22 kilohertz. A low-pass filter with its cut-off near 4 kilohertz keeps only the 2 kilohertz line."
    >
      <path
        d={`M${x0} ${base}V22H${xOf(cut - 0.6)}L${xOf(cut + 1.4)} ${base}Z`}
        className="smx-pass"
      />
      <text x={x0 + 2} y={14} className="f-sub">
        LPF pass band
      </text>
      <line x1={x0} x2={x1} y1={base} y2={base} className="f-axis" />
      {lines.map((l) =>
        l.a < 0.01 ? (
          <g key={l.f}>
            <circle cx={xOf(l.f)} cy={base} r={3} className="smx-hollow" />
            <text
              x={xOf(l.f)}
              y={base + 13}
              textAnchor="middle"
              className="f-sub"
            >
              {l.label}
            </text>
          </g>
        ) : (
          <g key={l.f}>
            <line
              x1={xOf(l.f)}
              x2={xOf(l.f)}
              y1={base}
              y2={base - l.a * scale * 0.55}
              className={l.f === 2 ? "f-line-side" : "f-line-carrier"}
            />
            <text
              x={xOf(l.f)}
              y={base - l.a * scale * 0.55 - 4}
              textAnchor="middle"
              className="f-sub"
            >
              {l.a.toFixed(2)} V
            </text>
            <text
              x={xOf(l.f)}
              y={base + 13}
              textAnchor="middle"
              className="f-label"
            >
              {l.label}
            </text>
          </g>
        ),
      )}
      <text x={x1} y={base + 13} textAnchor="end" className="f-sub">
        kHz
      </text>
      <text x={x0} y={base + 28} className="f-sub">
        blue: the message copy (kept) · dark: images at n·fs ± fm (removed)
      </text>
      <text x={x0} y={base + 40} className="f-sub">
        hollow: 14 and 18 kHz are zero for a 50 % clock (even harmonics vanish)
      </text>
    </Svg>
  );
}
