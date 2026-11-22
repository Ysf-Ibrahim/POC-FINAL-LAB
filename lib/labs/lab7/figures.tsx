import type { ReactNode } from "react";

/** Static illustrations for the Lab 7 guide. */

const W = 348;

function Svg({ h, label, children }: { h: number; label: string; children: ReactNode }) {
  return (
    <svg className="g-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** The PCM chain as blocks: analog in, three encoding steps, serial bits out, and back. */
export function ChainFigure({ decode = false }: { decode?: boolean }) {
  const enc = ["Sample", "Quantize", "Encode"];
  const dec = ["Read word (CLK, FS)", "Word → voltage", "Hold (PAM)", "LPF"];
  const steps = decode ? dec : enc;
  const bw = decode ? 72 : 76;
  const gap = decode ? 10 : 18;
  const x0 = decode ? 6 : 52;
  const h = 70;
  return (
    <Svg
      h={h}
      label={
        decode
          ? "Decoding: read each word using the clock and frame sync, turn the word into a voltage, hold it to form a PAM staircase, then low-pass filter it."
          : "Encoding: the analog message is sampled, each sample is quantized to the nearest level, and the level is encoded as an 8-bit binary word sent one bit at a time."
      }
    >
      {!decode && (
        <>
          <text x={0} y={30} className="f-label">
            Analog
          </text>
          <text x={0} y={42} className="f-sub">
            2 kHz sine
          </text>
        </>
      )}
      {steps.map((s, i) => {
        const x = x0 + i * (bw + gap);
        return (
          <g key={s}>
            <rect x={x} y={16} width={bw} height={30} rx={5} className="f-box" />
            <text x={x + bw / 2} y={35} textAnchor="middle" className="f-label" style={{ fontSize: decode ? 8.5 : 10.5 }}>
              {s}
            </text>
            {i < steps.length - 1 && <path d={`M${x + bw + 2} 31h${gap - 5}`} className="f-wire" markerEnd="url(#pcm-arrow)" />}
          </g>
        );
      })}
      {!decode && (
        <>
          <path d={`M${x0 - 10} 31h7`} className="f-wire" />
          <text x={W - 2} y={30} textAnchor="end" className="f-label">
            01101…
          </text>
          <text x={W - 2} y={42} textAnchor="end" className="f-sub">
            serial bits
          </text>
        </>
      )}
      <text x={decode ? 6 : x0} y={62} className="f-sub">
        {decode ? "out: the 2 kHz message again (approximately)" : "sampling: when · quantization: which level · encoding: which bits"}
      </text>
      <defs>
        <marker id="pcm-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0L6 3L0 6Z" className="f-arrowhead" />
        </marker>
      </defs>
    </Svg>
  );
}

/** Two channels taking turns on one line: A1 B1 A2 B2 … */
export function SlotsFigure() {
  const slots = ["A1", "B1", "A2", "B2", "A3", "B3"];
  const x0 = 10;
  const cw = (W - 20) / slots.length;
  const h = 112;
  return (
    <Svg h={h} label="Time division multiplexing: channel A and channel B take turns on one line. Slots A1, B1, A2, B2, A3, B3; the receiver sends the A slots to output 1 and the B slots to output 2.">
      <text x={x0} y={12} className="f-sub">
        one shared line, time →
      </text>
      {slots.map((s, i) => (
        <g key={s}>
          <rect x={x0 + i * cw} y={20} width={cw - 2} height={26} rx={3} className={s.startsWith("A") ? "pcx-slotA" : "pcx-slotB"} />
          <text x={x0 + (i + 0.5) * cw} y={37} textAnchor="middle" className="f-label">
            {s}
          </text>
        </g>
      ))}
      {[0, 2].map((i) => (
        <path key={i} d={`M${x0 + i * 2 * cw - 1} 52v6h${2 * cw - 2}v-6`} className="f-wire" />
      ))}
      <text x={x0 + cw} y={70} textAnchor="middle" className="f-sub">
        frame 1
      </text>
      <text x={x0 + 3 * cw} y={70} textAnchor="middle" className="f-sub">
        frame 2
      </text>
      <text x={x0} y={92} className="f-sub">
        Receiver: A slots → OUTPUT (channel 1), B slots → OUTPUT2 (channel 2).
      </text>
      <text x={x0} y={106} className="f-sub">
        Frame sync tells it where each frame, and so slot A, begins.
      </text>
    </Svg>
  );
}
