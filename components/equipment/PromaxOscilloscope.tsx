"use client";

import { memo } from "react";
import {
  TIME_DIV,
  VOLTS_DIV,
  controlActions,
  controlsStore,
  type Coupling,
  type IntTrigger,
  type TriggerMode,
  type TriggerSource,
  type VerticalMode,
} from "@/lib/controls/store";
import { NODE_OFFSET, SCOPE_INPUTS } from "@/lib/ports/promax";
import { useStore } from "@/lib/state/createStore";
import { hint } from "@/lib/ui/hint";
import { DEVICES } from "@/lib/workspace/devices";
import { Rotary } from "./controls/Rotary";
import { Slide } from "./controls/Slide";
import { ScopeScreen } from "./ScopeScreen";

/**
 * PROMAX OD-402B. The photograph is the instrument; this component lays the
 * live CRT and the moving parts of the controls over it. All coordinates are
 * in pixels of the photograph (see lib/ports/promax.ts for its size).
 */

// Angles (degrees clockwise from 12 o'clock) of the printed scale marks, read from the photograph.
const VOLT_ANGLES = [-127, -93, -64.5, -40, -13.5, 10.5, 36.5, 62, 92.5, 127];
const TIME_ANGLES = [-153, -138, -124, -109, -93, -77, -63, -45, -29, -12, 2, 18, 34, 52, 65, 80, 95, 110, 125];

const COUPLINGS: Coupling[] = ["ac", "gnd", "dc"];
const V_MODES: VerticalMode[] = ["ch1", "ch2", "dual", "add"];
const TRIG_MODES: TriggerMode[] = ["auto", "norm", "tv-v", "tv-h"];
const TRIG_SOURCES: TriggerSource[] = ["int", "line", "ext"];
const INT_SOURCES: IntTrigger[] = ["ch1", "ch2", "vert"];

export const formatVolts = (v: number) => (v >= 1 ? `${v} V/div` : `${Math.round(v * 1000)} mV/div`);
export function formatTime(t: number) {
  const trim = (n: number) => String(+n.toPrecision(3));
  if (t >= 1) return `${trim(t)} s/div`;
  if (t >= 1e-3) return `${trim(t * 1e3)} ms/div`;
  if (t >= 1e-6) return `${trim(t * 1e6)} µs/div`;
  return `${trim(t * 1e9)} ns/div`;
}
const signed = (v: number, unit: string) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} ${unit}`;
const percent = (v: number) => `${Math.round(v * 100)} %`;

/** Index line on a knob cap. `value` is 0..1 across 270° of travel. */
function CapMark({ dx, dy, r, value }: { dx: number; dy: number; r: number; value: number }) {
  return (
    <span className="cap-mark" style={{ left: dx, top: dy, transform: `rotate(${-135 + value * 270}deg)` }}>
      <i style={{ height: r * 0.62, top: -r * 0.95 }} />
    </span>
  );
}

/** Pointer on the skirt of a stepped range switch. */
function SkirtPointer({ size, angle, inner, outer }: { size: number; angle: number; inner: number; outer: number }) {
  const c = size / 2;
  return (
    <svg className="skirt-pointer" width={size} height={size} aria-hidden>
      <g transform={`rotate(${angle} ${c} ${c})`}>
        <path
          d={`M${c} ${c - outer}L${c + 4.6} ${c - inner}L${c - 4.6} ${c - inner}Z`}
          fill="#f6f4ee"
          stroke="rgba(20,20,24,0.7)"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

function PushButton({
  x,
  y,
  w,
  h,
  label,
  pressed,
  text,
  onToggle,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  pressed: boolean;
  text: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`control control-push ${pressed ? "is-pressed" : ""}`}
      style={{ left: x - w / 2, top: y - h / 2, width: w, height: h }}
      aria-label={label}
      aria-pressed={pressed}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        onToggle();
        const rect = e.currentTarget.getBoundingClientRect();
        // the store has not re-rendered yet, so describe the state being entered
        hint.show(`${label}  ${e.currentTarget.dataset.next}`, rect.left + rect.width / 2, rect.top, 900);
      }}
      data-next={text}
    />
  );
}

/**
 * The two nodes of one input, seated on its BNC: red = signal (the BNC's centre
 * pin), black = ground (its shell). Leads are plugged into them like any socket;
 * the sockets themselves are defined in lib/ports/promax.ts.
 */
function InputNodes({ x, y, name }: { x: number; y: number; name: string }) {
  const w = 138;
  const h = 66;
  const post = (cx: number, body: string, edge: string) => (
    <g transform={`translate(${cx} ${h / 2})`}>
      <circle r={19.5} cy={1.5} fill="rgba(0,0,0,0.35)" />
      <circle r={19} fill={body} stroke={edge} strokeWidth={1.7} />
      <circle r={11} fill="#d5d6db" stroke="#85868d" strokeWidth={1.2} />
      <circle r={6} fill="#17171a" />
      <path d="M-13.2 -9.8A16.2 16.2 0 0 1 3.4 -15.9" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth={1.7} strokeLinecap="round" />
    </g>
  );
  return (
    <svg
      className="input-nodes"
      style={{ left: x - w / 2, top: y - h / 2 }}
      width={w}
      height={h}
      role="img"
      aria-label={`${name}: red signal node and black ground node`}
    >
      <rect x={1} y={3} width={w - 2} height={h - 3} rx={17} fill="rgba(0,0,0,0.3)" />
      <rect x={1} y={1} width={w - 2} height={h - 4} rx={17} fill="#303136" stroke="#131316" strokeWidth={1.6} />
      <rect x={4} y={3.5} width={w - 8} height={12} rx={8} fill="rgba(255,255,255,0.07)" />
      {post(w / 2 - NODE_OFFSET, "#c5372d", "#6f1812")}
      {post(w / 2 + NODE_OFFSET, "#232327", "#08080a")}
    </svg>
  );
}

export const PromaxOscilloscope = memo(function PromaxOscilloscope() {
  const s = useStore(controlsStore, (st) => st.scope);
  const spec = DEVICES.scope;
  const set = controlActions.scope;

  const knob = (
    label: string,
    x: number,
    y: number,
    capX: number,
    capY: number,
    value: number,
    onChange: (v: number) => void,
    format: (v: number) => string,
    resetTo: number,
  ) => (
    <Rotary x={x} y={y} r={31} label={label} value={value} onChange={onChange} format={format} resetTo={resetTo}>
      <CapMark dx={capX - (x - 31)} dy={capY - (y - 31)} r={17} value={value} />
    </Rotary>
  );
  const bipolar = (v: number) => (v + 1) / 2;
  const toBipolar = (v: number) => Math.round((v * 2 - 1) * 200) / 200;

  return (
    <>
      <img
        className="equipment-photo"
        src={spec.image}
        width={spec.width}
        height={spec.height}
        alt="PROMAX OD-402B 20 MHz oscilloscope, front panel"
        draggable={false}
        decoding="async"
      />
      <div className="panel" style={{ width: spec.px.w, height: spec.px.h, transform: `scale(${spec.width / spec.px.w})` }}>
        <ScopeScreen />
        {SCOPE_INPUTS.map((input) => (
          <InputNodes key={input.id} x={input.x} y={input.y} name={input.name} />
        ))}

        {knob("INTEN", 788, 119, 785, 127, s.inten, (v) => set({ inten: v }), percent, 0.72)}
        {knob("FOCUS", 788, 254, 785, 262, s.focus, (v) => set({ focus: v }), percent, 0.8)}

        <PushButton
          x={789.5}
          y={405}
          w={40}
          h={48}
          label="POWER"
          pressed={s.power}
          text={s.power ? "off" : "on"}
          onToggle={() => set({ power: !s.power })}
        />
        <span className={`scope-led ${s.power ? "is-on" : ""}`} style={{ left: 790 - 12, top: 495 - 12 }} />

        {knob(
          "CH1 POSITION",
          946,
          119,
          951,
          127,
          bipolar(s.ch1.pos),
          (v) => controlActions.channel("ch1", { pos: toBipolar(v) }),
          (v) => signed((v * 2 - 1) * 5, "div"),
          0.5,
        )}
        {knob(
          "CH2 POSITION",
          1154.5,
          118,
          1160,
          125,
          bipolar(s.ch2.pos),
          (v) => controlActions.channel("ch2", { pos: toBipolar(v) }),
          (v) => signed((v * 2 - 1) * 5, "div"),
          0.5,
        )}

        <Slide
          x={944.5}
          y={248.6}
          length={51}
          thickness={34}
          label="CH1"
          positions={["X1", "X5 MAG"]}
          value={s.mag5 ? 1 : 0}
          onChange={(v) => set({ mag5: v === 1 })}
          panel="#d5cfcc"
          slot="#22293a"
        />
        <Slide
          x={1029}
          y={207}
          length={84}
          thickness={34}
          vertical
          label="MODE"
          positions={["CH1", "CH2", "DUAL", "ADD"]}
          value={V_MODES.indexOf(s.mode)}
          onChange={(v) => set({ mode: V_MODES[v] })}
          panel="#ccc6c3"
          slot="#2b2d3e"
        />
        <Slide
          x={1150}
          y={248}
          length={51}
          thickness={34}
          label="CH2"
          positions={["NORM", "INV"]}
          value={s.invert ? 1 : 0}
          onChange={(v) => set({ invert: v === 1 })}
          panel="#cec9c1"
          slot="#272b3d"
        />

        {(["ch1", "ch2"] as const).map((ch, i) => (
          <Rotary
            key={ch}
            x={i === 0 ? 946.4 : 1151.4}
            y={441}
            r={56}
            label={`${ch.toUpperCase()} VOLTS/DIV`}
            value={s[ch].vdiv}
            steps={VOLTS_DIV.length}
            sweep={254}
            onChange={(v) => controlActions.channel(ch, { vdiv: v })}
            format={(v) => formatVolts(VOLTS_DIV[v] / (ch === "ch1" && s.mag5 ? 5 : 1))}
          >
            <SkirtPointer size={112} angle={VOLT_ANGLES[s[ch].vdiv]} inner={40} outer={52} />
          </Rotary>
        ))}
        {(["ch1", "ch2"] as const).map((ch, i) => (
          <Slide
            key={ch}
            x={i === 0 ? 944.5 : 1149.5}
            y={556}
            length={67}
            thickness={34}
            label={`${ch.toUpperCase()} coupling`}
            positions={["AC", "GND", "DC"]}
            value={COUPLINGS.indexOf(s[ch].coupling)}
            onChange={(v) => controlActions.channel(ch, { coupling: COUPLINGS[v] })}
            panel={i === 0 ? "#d0c9c0" : "#c8c2b6"}
            slot="#282c3e"
          />
        ))}

        {knob(
          "TRIGGER LEVEL",
          1363.6,
          116.4,
          1376,
          121,
          bipolar(s.level),
          (v) => set({ level: toBipolar(v) }),
          (v) => signed((v * 2 - 1) * 4, "div"),
          0.5,
        )}
        <Slide
          x={1355.5}
          y={247.3}
          length={84}
          thickness={34}
          label="TRIGGER MODE"
          positions={["AUTO", "NORM", "TV-V", "TV-H"]}
          disabled={[2, 3]}
          value={TRIG_MODES.indexOf(s.trigMode)}
          onChange={(v) => set({ trigMode: TRIG_MODES[v] })}
          panel="#b9b6ae"
          slot="#2d2f3e"
        />
        <PushButton
          x={1356}
          y={366}
          w={30}
          h={30}
          label="SLOPE"
          pressed={!s.slopeRising}
          text={s.slopeRising ? "falling ( − )" : "rising ( + )"}
          onToggle={() => set({ slopeRising: !s.slopeRising })}
        />
        <Slide
          x={1355}
          y={468.6}
          length={67}
          thickness={34}
          label="TRIGGER SOURCE"
          positions={["INT", "LINE", "EXT"]}
          value={TRIG_SOURCES.indexOf(s.trigSource)}
          onChange={(v) => set({ trigSource: TRIG_SOURCES[v] })}
          panel="#bfbbad"
          slot="#1f2134"
        />
        <Slide
          x={1355}
          y={556}
          length={67}
          thickness={34}
          label="INT TRIGGER"
          positions={["CH1", "CH2", "VERT"]}
          value={INT_SOURCES.indexOf(s.intTrig)}
          onChange={(v) => set({ intTrig: INT_SOURCES[v] })}
          panel="#a9a7a2"
          slot="#2b2d3b"
        />

        {knob(
          "HORIZONTAL POSITION",
          1526,
          116,
          1539.5,
          122,
          bipolar(s.hpos),
          (v) => set({ hpos: toBipolar(v) }),
          (v) => signed((v * 2 - 1) * 5.5, "div"),
          0.5,
        )}
        {knob(
          "SWEEP VARIABLE",
          1682,
          118,
          1696,
          122,
          s.sweepVar,
          (v) => set({ sweepVar: v }),
          (v) => (s.sweepCal ? "inactive (CAL)" : `÷ ${(1 + (1 - v) * 1.5).toFixed(2)}`),
          1,
        )}
        <Slide
          x={1516.4}
          y={248.6}
          length={51}
          thickness={34}
          label="SWEEP"
          positions={["X1", "X10 MAG"]}
          value={s.mag10 ? 1 : 0}
          onChange={(v) => set({ mag10: v === 1 })}
          panel="#b6b3ab"
          slot="#2b2c38"
        />
        <Slide
          x={1675}
          y={248.6}
          length={59}
          thickness={34}
          label="SWEEP"
          positions={["CAL", "VAR"]}
          value={s.sweepCal ? 0 : 1}
          onChange={(v) => set({ sweepCal: v === 0 })}
          panel="#a9a49d"
          slot="#1c1b22"
        />
        <Rotary
          x={1595}
          y={390}
          r={84}
          label="TIME/DIV"
          value={s.tdiv}
          steps={TIME_DIV.length}
          sweep={278}
          onChange={(v) => set({ tdiv: v })}
          format={(v) => formatTime(TIME_DIV[v] / (s.mag10 ? 10 : 1))}
        >
          <SkirtPointer size={168} angle={TIME_ANGLES[s.tdiv]} inner={51} outer={64} />
        </Rotary>
      </div>
    </>
  );
});
