"use client";

import { memo } from "react";
import { EMONA_KNOBS, EMONA_SLIDES, knobValue, switchPosition } from "@/lib/controls/emonaControls";
import { controlActions, controlsStore } from "@/lib/controls/store";
import { useStore } from "@/lib/state/createStore";
import { DEVICES } from "@/lib/workspace/devices";
import { Rotary } from "./controls/Rotary";
import { Slide } from "./controls/Slide";

const ROTOR = 18.5;
const GRAB = 25;

/** Top of a trimmer: a slotted rotor with an arrow, redrawn so it can turn. */
function TrimmerRotor({ value }: { value: number }) {
  const c = GRAB;
  const angle = -135 + value * 270;
  return (
    <svg className="trimmer" width={GRAB * 2} height={GRAB * 2} aria-hidden>
      <circle cx={c} cy={c + 1.2} r={ROTOR + 0.6} fill="rgba(70,60,20,0.35)" />
      <circle cx={c} cy={c} r={ROTOR} fill="url(#trimmer-face)" stroke="#b3a463" strokeWidth={1} />
      <g transform={`rotate(${angle} ${c} ${c})`}>
        <path
          d={`M${c} ${c + ROTOR * 0.68}L${c} ${c - ROTOR * 0.5}`}
          stroke="#9c8d52"
          strokeWidth={4.4}
          strokeLinecap="round"
        />
        <path
          d={`M${c} ${c - ROTOR * 0.86}L${c + 5.4} ${c - ROTOR * 0.38}L${c - 5.4} ${c - ROTOR * 0.38}Z`}
          fill="#9c8d52"
          stroke="#9c8d52"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/**
 * EMONA Telecoms-Trainer 101. The photograph is the board; the trimmers and
 * switches that have a modelled function are overlaid so they can be operated.
 * Sockets are handled by the workspace (see lib/ports/emona.ts).
 */
export const EmonaTrainer = memo(function EmonaTrainer() {
  const emona = useStore(controlsStore, (s) => s.emona);
  const spec = DEVICES.emona;

  return (
    <>
      <img
        className="equipment-photo"
        src={spec.image}
        width={spec.width}
        height={spec.height}
        alt="EMONA Telecoms-Trainer 101 (BiSKIT), top view"
        draggable={false}
        decoding="async"
      />
      <div className="panel" style={{ width: spec.px.w, height: spec.px.h, transform: `scale(${spec.width / spec.px.w})` }}>
        <svg width={0} height={0} aria-hidden style={{ position: "absolute" }}>
          <defs>
            <radialGradient id="trimmer-face" cx="42%" cy="36%" r="75%">
              <stop offset="0" stopColor="#f6edbd" />
              <stop offset="0.7" stopColor="#e6d896" />
              <stop offset="1" stopColor="#cdbd78" />
            </radialGradient>
          </defs>
        </svg>
        {EMONA_KNOBS.map((k) => {
          const value = knobValue(emona, k.id);
          return (
            <Rotary
              key={k.id}
              x={k.x}
              y={k.y}
              r={GRAB}
              label={k.label}
              value={value}
              onChange={(v) => controlActions.knob(k.id, v)}
              format={k.format}
              resetTo={k.initial}
            >
              <TrimmerRotor value={value} />
            </Rotary>
          );
        })}
        {EMONA_SLIDES.map((sw) => (
          <Slide
            key={sw.id}
            x={sw.x}
            y={sw.y}
            length={58}
            thickness={26}
            vertical
            variant="square"
            label={sw.label}
            positions={sw.positions}
            value={switchPosition(emona, sw.id)}
            onChange={(v) => controlActions.switch(sw.id, v)}
            panel="#b9b3ac"
            slot="#242426"
          />
        ))}
      </div>
    </>
  );
});
