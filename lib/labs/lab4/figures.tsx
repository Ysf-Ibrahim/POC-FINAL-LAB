import type { ReactNode } from "react";
import { EMONA_KNOBS, EMONA_SLIDES } from "@/lib/controls/emonaControls";
import { PORTS } from "@/lib/ports/registry";
import { DEVICES } from "@/lib/workspace/devices";

/**
 * Illustrations for the Lab 4 guide. Waveforms are computed: FM by
 * accumulating phase from f(t) = f_rest + k·m(t), AM from (DC + m)·carrier,
 * spectra from Bessel functions. Carrier frequencies are drawn as in the lab
 * (10 kHz carrier, 2 kHz message) unless a caption says otherwise.
 */

const W = 348;
const TWO_PI = 2 * Math.PI;

function Svg({ h, label, children }: { h: number; label: string; children: ReactNode }) {
  return (
    <svg className="g-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

function pathOf(fn: (t: number) => number, x0: number, x1: number, yOf: (v: number) => number, n = 900) {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    d += `${i ? "L" : "M"}${(x0 + (x1 - x0) * t).toFixed(1)} ${yOf(fn(t)).toFixed(1)}`;
  }
  return d;
}

/** FM over a window of `ms` milliseconds, phase accumulated. Returns a sampler on 0..1. */
function fmSampler({ fc = 10, fm = 2, dev = 3, ms = 1, n = 3000, message = (x: number) => Math.sin(TWO_PI * x) }) {
  const v = new Float64Array(n + 1);
  let phase = 0;
  const dt = ms / n;
  let prev = fc + dev * message(0);
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    const f = fc + dev * message(fm * t);
    if (i > 0) phase += 0.5 * (prev + f) * dt;
    prev = f;
    v[i] = Math.sin(TWO_PI * phase);
  }
  return (x: number) => v[Math.min(n, Math.max(0, Math.round(x * n)))];
}

/** Message, AM and FM on one time axis. */
export function AmFmFigure() {
  const rowH = 52;
  const x0 = 62;
  const x1 = W - 2;
  const msg = (x: number) => Math.sin(TWO_PI * 2 * x); // two message cycles across 1 ms
  const fm = fmSampler({ dev: 3.5 });
  const rows = [
    { name: "Message", sub: "2 kHz", fn: msg, cls: "f-message", s: 1.15 },
    { name: "AM", sub: "height changes", fn: (x: number) => (1.6 + msg(x)) * Math.sin(TWO_PI * 10 * x), cls: "f-am", s: 2.8 },
    { name: "FM", sub: "spacing changes", fn: fm, cls: "f-am", s: 1.15 },
  ];
  return (
    <Svg h={rows.length * rowH + 4} label="A 2 kHz message; the AM signal, whose height follows the message; and the FM signal, whose cycle spacing follows the message at constant height">
      {rows.map((r, i) => {
        const mid = i * rowH + rowH / 2 + 2;
        const yOf = (v: number) => mid - (v / r.s) * (rowH / 2 - 4);
        return (
          <g key={r.name}>
            <text x={0} y={mid - 2} className="f-label">
              {r.name}
            </text>
            <text x={0} y={mid + 10} className="f-sub">
              {r.sub}
            </text>
            <path d={pathOf(r.fn, x0, x1, yOf, 1200)} className={r.cls} />
          </g>
        );
      })}
    </Svg>
  );
}

/**
 * A sine on an oscilloscope graticule: 10 × 8 divisions, with one period
 * marked. `f` in kHz, `tdiv` in µs per division.
 */
export function PeriodFigure({ f = 10, tdiv = 20 }: { f?: number; tdiv?: number }) {
  const gx = 34;
  const gw = W - 2 * gx;
  const div = gw / 10;
  const gh = div * 6;
  const gy = 6;
  const periodDiv = 1000 / f / tdiv;
  const yOf = (v: number) => gy + gh / 2 - v * div * 2;
  const xOf = (d: number) => gx + d * div;
  const lines = [];
  for (let i = 0; i <= 10; i++) lines.push(<line key={`v${i}`} x1={xOf(i)} x2={xOf(i)} y1={gy} y2={gy + gh} className="f-grid" />);
  for (let j = 0; j <= 6; j++) lines.push(<line key={`h${j}`} x1={gx} x2={gx + gw} y1={gy + j * div} y2={gy + j * div} className="f-grid" />);
  const start = 1;
  return (
    <Svg h={gh + 40} label={`A ${f} kHz sine on a ${tdiv} µs per division time base: one cycle spans ${periodDiv.toFixed(1)} divisions`}>
      <rect x={gx} y={gy} width={gw} height={gh} rx={4} className="f-screen" />
      {lines}
      <path d={pathOf((x) => Math.sin(TWO_PI * ((x * 10 - start) / periodDiv)), gx, gx + gw, yOf, 800)} className="f-trace" />
      <path d={`M${xOf(start)} ${gy + gh + 8}v-4H${xOf(start + periodDiv)}v4`} className="f-wire" />
      <text x={(xOf(start) + xOf(start + periodDiv)) / 2} y={gy + gh + 20} textAnchor="middle" className="f-label">
        one cycle = {+periodDiv.toFixed(2)} div × {tdiv} µs = {+(periodDiv * tdiv).toFixed(1)} µs
      </text>
      <text x={W / 2} y={gy + gh + 33} textAnchor="middle" className="f-sub">
        f = 1 / {+(periodDiv * tdiv).toFixed(1)} µs = {f} kHz
      </text>
    </Svg>
  );
}

/** The trainer's VCO module, cropped from the photograph, with its parts named. */
export function VcoModuleFigure() {
  const spec = DEVICES.emona;
  const px = (id: string) => {
    const p = PORTS.get(id)!;
    return { x: p.x * spec.px.w, y: p.y * spec.px.h };
  };
  const knob = (id: string) => EMONA_KNOBS.find((k) => k.id === id)!;
  const slide = EMONA_SLIDES.find((s) => s.id === "vco.range")!;
  // crop of the photograph, in image pixels
  const crop = { x: 236, y: 790, w: 150, h: 440 };
  const scale = 0.56;
  const ox = 8;
  const oy = 4;
  const at = (p: { x: number; y: number }) => ({ x: ox + (p.x - crop.x) * scale, y: oy + (p.y - crop.y) * scale });
  const parts = [
    { p: at(px("vco.digital")), name: "DIGITAL output", sub: "square-wave version (not used)" },
    { p: at(knob("vco.gain")), name: "GAIN", sub: "how far the input moves f" },
    { p: at(knob("vco.freq")), name: "FREQ dial", sub: "sets the rest frequency" },
    { p: at(slide), name: "HI / LO switch", sub: "60–140 kHz or 1–17 kHz" },
    { p: at(px("vco.in")), name: "VCO INPUT", sub: "control voltage goes IN" },
    { p: at(px("vco.sine")), name: "SINE output", sub: "the carrier comes OUT" },
  ];
  const h = crop.h * scale + 2 * oy;
  const labelX = ox + crop.w * scale + 30;
  return (
    <Svg h={h} label="The VCO module of the trainer: DIGITAL output, GAIN and FREQ controls, HI/LO switch, VCO INPUT and SINE output">
      <defs>
        <clipPath id="vco-crop">
          <rect x={ox} y={oy} width={crop.w * scale} height={crop.h * scale} rx={6} />
        </clipPath>
      </defs>
      <image
        href={spec.image}
        x={ox - crop.x * scale}
        y={oy - crop.y * scale}
        width={spec.px.w * scale}
        height={spec.px.h * scale}
        clipPath="url(#vco-crop)"
        preserveAspectRatio="none"
      />
      {parts.map((part, i) => {
        const ly = oy + 16 + i * ((h - 34) / (parts.length - 1));
        return (
          <g key={part.name}>
            <circle cx={part.p.x} cy={part.p.y} r={7} className="f-callout-ring" />
            <path d={`M${part.p.x + 7} ${part.p.y}L${labelX - 6} ${ly - 3}`} className="f-callout" />
            <text x={labelX} y={ly - 2} className="f-label">
              {part.name}
            </text>
            <text x={labelX} y={ly + 9} className="f-sub">
              {part.sub}
            </text>
          </g>
        );
      })}
    </Svg>
  );
}

/** The VCO law: frequency against input voltage, a straight line through the rest frequency at 0 V. */
export function VcoLawFigure({ rest = 10, k = 1.33 }: { rest?: number; k?: number }) {
  const h = 150;
  const x0 = 40;
  const x1 = W - 12;
  const y0 = 10;
  const y1 = 112;
  const vMax = 3;
  const fTop = rest + k * vMax + 1;
  const fBot = Math.max(0, rest - k * vMax - 1);
  const xOf = (v: number) => x0 + ((v + vMax) / (2 * vMax)) * (x1 - x0);
  const yOf = (f: number) => y1 - ((f - fBot) / (fTop - fBot)) * (y1 - y0);
  return (
    <Svg h={h} label={`VCO frequency against input voltage: a straight line through ${rest} kHz at 0 volts, rising ${k} kilohertz per volt`}>
      <line x1={x0} x2={x1} y1={y1} y2={y1} className="f-axis" />
      <line x1={xOf(0)} x2={xOf(0)} y1={y0} y2={y1} className="f-axis" />
      <path d={`M${xOf(-vMax)} ${yOf(rest - k * vMax)}L${xOf(vMax)} ${yOf(rest + k * vMax)}`} className="f-message" />
      <circle cx={xOf(0)} cy={yOf(rest)} r={3.5} className="f-dot-carrier" />
      <text x={xOf(0) + 7} y={yOf(rest) + 13} className="f-label f-on-wave">
        0 V → {rest} kHz (rest)
      </text>
      {[-2, 2].map((v) => (
        <g key={v}>
          <line x1={xOf(v)} x2={xOf(v)} y1={y1} y2={yOf(rest + k * v)} className="f-guide" />
          <line x1={x0} x2={xOf(v)} y1={yOf(rest + k * v)} y2={yOf(rest + k * v)} className="f-guide" />
          <text x={x0 - 4} y={yOf(rest + k * v) + 3} textAnchor="end" className="f-sub">
            {+(rest + k * v).toFixed(1)}
          </text>
          <text x={xOf(v)} y={y1 + 12} textAnchor="middle" className="f-sub">
            {v > 0 ? "+" : "−"}2 V
          </text>
        </g>
      ))}
      <text x={x1} y={y1 + 26} textAnchor="end" className="f-sub">
        input voltage →
      </text>
      <text x={x0 - 4} y={y0 + 2} textAnchor="end" className="f-sub">
        kHz
      </text>
    </Svg>
  );
}

/** Bessel function of the first kind, J_n(x), by numerical integration. */
function besselJ(n: number, x: number) {
  const steps = 400;
  let s = 0;
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * i) / steps;
    s += (i === 0 || i === steps ? 0.5 : 1) * Math.cos(n * t - x * Math.sin(t));
  }
  return s / steps;
}

/** Line spectrum of single-tone FM for a given β, with the Carson bandwidth marked. */
export function FmSpectrumFigure({ beta = 1.3, fc = 10, fm = 2 }: { beta?: number; fc?: number; fm?: number }) {
  const h = 128;
  const base = 92;
  const x0 = 14;
  const x1 = W - 14;
  const span = 6;
  const xOf = (n: number) => x0 + ((n + span) / (2 * span)) * (x1 - x0);
  const lines = [];
  for (let n = -span; n <= span; n++) {
    const a = Math.abs(besselJ(Math.abs(n), beta));
    if (a < 0.01) continue;
    lines.push({ n, a });
  }
  const carson = beta * fm + fm; // one side
  const half = carson / fm;
  return (
    <Svg h={h} label={`Spectrum of FM with modulation index ${beta}: lines at the carrier and at multiples of the message frequency on both sides`}>
      <line x1={x0} x2={x1} y1={base} y2={base} className="f-axis" />
      {lines.map(({ n, a }) => (
        <g key={n}>
          <line x1={xOf(n)} x2={xOf(n)} y1={base} y2={base - a * 70} className={n === 0 ? "f-line-carrier" : "f-line-side"} />
          {Math.abs(n) <= 3 && (
            <text x={xOf(n)} y={base + 12} textAnchor="middle" className="f-sub">
              {fc + n * fm}
            </text>
          )}
        </g>
      ))}
      <path d={`M${xOf(-half)} ${base + 18}v4H${xOf(half)}v-4`} className="f-wire" />
      <text x={W / 2} y={base + 33} textAnchor="middle" className="f-sub">
        kHz · Carson bandwidth ≈ 2(Δf + fm) = {+(2 * carson).toFixed(1)} kHz
      </text>
    </Svg>
  );
}

/** Amplitude noise on AM and on FM, and what a limiter leaves of the FM. */
export function NoiseFigure() {
  const rowH = 46;
  const x0 = 70;
  const x1 = W - 2;
  // repeatable "noise": a few incommensurate tones
  const noise = (x: number) => 0.22 * Math.sin(TWO_PI * 13.7 * x) + 0.16 * Math.sin(TWO_PI * 31.1 * x + 1) + 0.1 * Math.sin(TWO_PI * 57.3 * x + 2);
  const fm = fmSampler({ dev: 3 });
  const msg = (x: number) => Math.sin(TWO_PI * 2 * x);
  const rows = [
    { name: "AM + noise", sub: "envelope corrupted", fn: (x: number) => (1.6 + msg(x) + noise(x)) * Math.sin(TWO_PI * 10 * x), s: 3 },
    { name: "FM + noise", sub: "height wobbles", fn: (x: number) => (1 + noise(x)) * fm(x), s: 1.5 },
    { name: "After limiter", sub: "spacing intact", fn: (x: number) => Math.max(-0.7, Math.min(0.7, 3 * fm(x))), s: 1 },
  ];
  return (
    <Svg h={rows.length * rowH + 4} label="Amplitude noise changes the AM envelope, which is the message; on FM it only changes the height, and a limiter removes it while the cycle spacing, which carries the message, is unchanged">
      {rows.map((r, i) => {
        const mid = i * rowH + rowH / 2 + 2;
        const yOf = (v: number) => mid - (v / r.s) * (rowH / 2 - 4);
        return (
          <g key={r.name}>
            <text x={0} y={mid - 2} className="f-label">
              {r.name}
            </text>
            <text x={0} y={mid + 10} className="f-sub">
              {r.sub}
            </text>
            <path d={pathOf(r.fn, x0, x1, yOf, 1200)} className="f-am" />
          </g>
        );
      })}
    </Svg>
  );
}

/** The two VCO ranges on one logarithmic frequency axis. */
export function RangeFigure() {
  const h = 84;
  const x0 = 16;
  const x1 = W - 16;
  const fMin = 0.5;
  const fMax = 300;
  const xOf = (f: number) => x0 + ((x1 - x0) * Math.log10(f / fMin)) / Math.log10(fMax / fMin);
  const bar = (a: number, b: number, y: number, name: string) => (
    <g>
      <rect x={xOf(a)} y={y} width={xOf(b) - xOf(a)} height={14} rx={4} className="f-range" />
      <text x={(xOf(a) + xOf(b)) / 2} y={y + 10.5} textAnchor="middle" className="f-range-text">
        {name}
      </text>
    </g>
  );
  return (
    <Svg h={h} label="The LO range covers 1 to 17 kilohertz and the HI range 60 to 140 kilohertz; 10 kilohertz is inside LO only">
      <line x1={x0} x2={x1} y1={48} y2={48} className="f-axis" />
      {bar(1, 17, 26, "LO 1–17 kHz")}
      {bar(60, 140, 26, "HI 60–140 kHz")}
      <line x1={xOf(10)} x2={xOf(10)} y1={16} y2={48} className="f-measure" />
      <text x={xOf(10)} y={12} textAnchor="middle" className="f-label">
        10 kHz
      </text>
      {[1, 10, 100].map((f) => (
        <text key={f} x={xOf(f)} y={62} textAnchor="middle" className="f-sub">
          {f} kHz
        </text>
      ))}
      <text x={W / 2} y={78} textAnchor="middle" className="f-sub">
        logarithmic scale · ranges from the trainer&rsquo;s specification
      </text>
    </Svg>
  );
}

/** Message → VCO → FM, the whole transmitter in one line. */
export function FmChainFigure({ ground = false }: { ground?: boolean }) {
  const h = 70;
  return (
    <Svg h={h} label={ground ? "Ground, 0 volts, into the VCO input; the VCO output to the oscilloscope" : "The 2 kHz message into the VCO input; the FM output to the oscilloscope"}>
      <defs>
        <marker id="g4-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0L8 4L0 8Z" className="f-arrowhead" />
        </marker>
      </defs>
      <rect x={2} y={18} width={86} height={36} rx={6} className="f-box" />
      <text x={45} y={34} textAnchor="middle" className="f-label">
        {ground ? "GND" : "Master Signals"}
      </text>
      <text x={45} y={46} textAnchor="middle" className="f-sub">
        {ground ? "0 V" : "2 kHz sine"}
      </text>
      <path d="M88 36H128" className="f-wire" markerEnd="url(#g4-arrow)" />
      <text x={108} y={30} textAnchor="middle" className="f-sub">
        control
      </text>
      <rect x={130} y={18} width={76} height={36} rx={6} className="f-box" />
      <text x={168} y={34} textAnchor="middle" className="f-label">
        VCO
      </text>
      <text x={168} y={46} textAnchor="middle" className="f-sub">
        rest 10 kHz
      </text>
      <path d="M206 36H246" className="f-wire" markerEnd="url(#g4-arrow)" />
      <rect x={248} y={18} width={98} height={36} rx={6} className="f-box" />
      <text x={297} y={34} textAnchor="middle" className="f-label">
        Oscilloscope
      </text>
      <text x={297} y={46} textAnchor="middle" className="f-sub">
        {ground ? "steady 10 kHz" : "FM signal"}
      </text>
    </Svg>
  );
}
