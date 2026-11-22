import type { ReactNode } from "react";

/**
 * Static illustrations for the Lab 5 guide. Timings are drawn to scale from
 * the numbers in the captions: 12 µs pulses, one per cycle, at the stated
 * frequencies; averages are 5 V × τ × f.
 */

const W = 348;

function Svg({ h, label, children }: { h: number; label: string; children: ReactNode }) {
  return (
    <svg className="g-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** Pulse-train anatomy: width τ, period T, space T − τ. */
export function PulseAnatomyFigure() {
  const h = 104;
  const x0 = 12;
  const pxPerUs = 1.25; // 100 µs period = 125 px
  const tau = 12;
  const T = 100;
  const yHi = 22;
  const yLo = 62;
  const starts = [10, 110, 210];
  let d = `M${x0} ${yLo}`;
  for (const s of starts) {
    const a = x0 + s * pxPerUs;
    const b = a + tau * pxPerUs;
    d += `H${a}V${yHi}H${b}V${yLo}`;
  }
  d += `H${W - 6}`;
  const a0 = x0 + starts[0] * pxPerUs;
  const a1 = x0 + starts[1] * pxPerUs;
  return (
    <Svg h={h} label="A pulse train: each pulse is 12 microseconds wide, pulses repeat every 100 microseconds, so the space between them is 88 microseconds">
      <path d={d} className="f-message" />
      <path d={`M${a0} ${yHi - 6}h${tau * pxPerUs}`} className="f-measure" />
      <text x={a0 + (tau * pxPerUs) / 2} y={yHi - 9} textAnchor="middle" className="f-label">
        τ = 12 µs
      </text>
      <path d={`M${a0 + tau * pxPerUs} ${yLo + 8}H${a1}`} className="f-wire" />
      <text x={(a0 + tau * pxPerUs + a1) / 2} y={yLo + 20} textAnchor="middle" className="f-label">
        space = 88 µs
      </text>
      <path d={`M${a0} ${yLo + 32}H${a1}`} className="f-measure" />
      <text x={(a0 + a1) / 2} y={yLo + 42} textAnchor="middle" className="f-sub">
        period T = 100 µs (10 kHz)
      </text>
      <text x={W - 6} y={yHi + 4} textAnchor="end" className="f-sub">
        5 V
      </text>
      <text x={W - 6} y={yLo - 4} textAnchor="end" className="f-sub">
        0 V
      </text>
    </Svg>
  );
}

/** The same 12 µs pulse at 8, 10 and 12 kHz: the space shrinks, the duty cycle and the average grow. */
export function DutyCompareFigure() {
  const rows = [
    { f: 8, T: 125 },
    { f: 10, T: 100 },
    { f: 12, T: 83.3 },
  ];
  const rowH = 38;
  const x0 = 62;
  const x1 = 262;
  const span = 400; // µs shown
  const px = (x1 - x0) / span;
  return (
    <Svg h={rows.length * rowH + 18} label="The same 12 microsecond pulses at 8, 10 and 12 kilohertz: the higher the frequency, the closer the pulses, the higher the duty cycle and the average voltage">
      {rows.map((r, i) => {
        const yHi = i * rowH + 8;
        const yLo = yHi + 22;
        let d = `M${x0} ${yLo}`;
        for (let t = 8; t + 12 < span; t += r.T) d += `H${x0 + t * px}V${yHi}H${x0 + (t + 12) * px}V${yLo}`;
        d += `H${x1}`;
        const duty = (12 / r.T) * 100;
        const avg = 5 * (12 / r.T);
        const avgY = yLo - (avg / 5) * 22;
        return (
          <g key={r.f}>
            <text x={0} y={yLo - 6} className="f-label">
              {r.f} kHz
            </text>
            <text x={0} y={yLo + 5} className="f-sub">
              T = {r.T} µs
            </text>
            <path d={d} className="f-am" />
            <line x1={x0} x2={x1} y1={avgY} y2={avgY} className="f-env" />
            <text x={x1 + 8} y={yLo - 9} className="f-label">
              {duty.toFixed(1)} %
            </text>
            <text x={x1 + 8} y={yLo + 2} className="f-sub">
              avg {avg.toFixed(2)} V
            </text>
          </g>
        );
      })}
      <text x={W / 2} y={rows.length * rowH + 12} textAnchor="middle" className="f-sub">
        dashed: the average · 400 µs shown · pulses 0 to 5 V
      </text>
    </Svg>
  );
}

/** Calibration: the 8 kHz clock, and the 12 µs pulse read on the scope at 5 µs/div. */
export function CalibrationFigure() {
  const gx = 34;
  const gw = W - 2 * gx;
  const div = gw / 10;
  const gy = 6;
  const gh = div * 5;
  const lines = [];
  for (let i = 0; i <= 10; i++) lines.push(<line key={`v${i}`} x1={gx + i * div} x2={gx + i * div} y1={gy} y2={gy + gh} className="f-grid" />);
  for (let j = 0; j <= 5; j++) lines.push(<line key={`h${j}`} x1={gx} x2={gx + gw} y1={gy + j * div} y2={gy + j * div} className="f-grid" />);
  const start = gx + 2 * div;
  const end = start + 2.4 * div;
  const hi = gy + div * 1;
  const lo = gy + div * 4;
  return (
    <Svg h={gh + 40} label="On the oscilloscope at 5 microseconds per division, a 12 microsecond pulse spans 2.4 divisions">
      <rect x={gx} y={gy} width={gw} height={gh} rx={4} className="f-screen" />
      {lines}
      <path d={`M${gx} ${lo}H${start}V${hi}H${end}V${lo}H${gx + gw}`} className="f-trace" />
      <path d={`M${start} ${gy + gh + 8}v-4H${end}v4`} className="f-wire" />
      <text x={(start + end) / 2} y={gy + gh + 20} textAnchor="middle" className="f-label">
        2.4 div × 5 µs = 12 µs
      </text>
      <text x={W / 2} y={gy + gh + 33} textAnchor="middle" className="f-sub">
        the next pulse comes 120 µs later (8.33 kHz clock): off this screen
      </text>
    </Svg>
  );
}

/** Pulses wider than the input period run into each other: the output sticks high. */
export function OverlapFigure() {
  const h = 110;
  const x0 = 70;
  const x1 = W - 4;
  const px = (x1 - x0) / 200;
  const edges = [10, 40, 70, 100, 130, 160];
  const row = (y: number, tau: number) => {
    const yHi = y;
    const yLo = y + 22;
    let d = `M${x0} ${yLo}`;
    let highUntil = -1;
    for (let t = 0; t <= 200; t += 0.5) {
      if (edges.some((e) => Math.abs(e - t) < 0.25)) highUntil = t + tau; // retriggered: the pulse restarts
      const hi = t < highUntil;
      d += `L${(x0 + t * px).toFixed(1)} ${hi ? yHi : yLo}`;
    }
    return d;
  };
  return (
    <Svg h={h} label="Input cycles every 30 microseconds. With 12 microsecond pulses they stay separate; with 40 microsecond pulses each new edge arrives before the pulse ends and the output stays high">
      <text x={0} y={22} className="f-label">
        τ = 12 µs
      </text>
      <text x={0} y={34} className="f-sub">
        separate
      </text>
      <path d={row(12, 12)} className="f-message" />
      <text x={0} y={74} className="f-label">
        τ = 40 µs
      </text>
      <text x={0} y={86} className="f-sub">
        overlap: stuck high
      </text>
      <path d={row(64, 40)} className="f-measure" />
      {edges.map((e) => (
        <line key={e} x1={x0 + e * px} x2={x0 + e * px} y1={4} y2={98} className="f-guide" />
      ))}
      <text x={W - 4} y={h - 2} textAnchor="end" className="f-sub">
        dotted: input edges every 30 µs (33 kHz)
      </text>
    </Svg>
  );
}
