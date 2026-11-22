"use client";

import { formatTime, formatVolts } from "@/components/equipment/PromaxOscilloscope";
import { controlsStore } from "@/lib/controls/store";
import { effectiveTimeDiv, effectiveVoltsDiv } from "@/lib/sim/scope";
import { scopeStatus } from "@/lib/sim/status";
import { useStore } from "@/lib/state/createStore";

/**
 * One quiet line with the oscilloscope's current settings. The real instrument
 * has no on-screen readout; this saves zooming in to read the dials.
 */
export function ScopeReadout() {
  const s = useStore(controlsStore, (st) => st.scope);
  const status = useStore(scopeStatus, (st) => st);
  if (!s.power) return <div className="readout">Oscilloscope off</div>;

  const show1 = s.mode !== "ch2";
  const show2 = s.mode !== "ch1";
  const tdiv = effectiveTimeDiv(s) / (s.mag10 ? 10 : 1);
  const source =
    s.trigSource === "int" ? (s.intTrig === "vert" ? "VERT" : s.intTrig.toUpperCase()) : s.trigSource.toUpperCase();
  const channel = (ch: "ch1" | "ch2") =>
    `${ch.toUpperCase()} ${formatVolts(effectiveVoltsDiv(s, ch))} ${s[ch].coupling.toUpperCase()}${
      s[ch].variable < 1 ? " (uncal)" : ""
    }`;

  return (
    <div className="readout" aria-live="off">
      {show1 && <span>{channel("ch1")}</span>}
      {show2 && <span>{channel("ch2")}{s.invert ? " INV" : ""}</span>}
      {s.mode === "add" && <span>ADD</span>}
      <span>
        {formatTime(tdiv)}
        {s.sweepCal ? "" : " (uncal)"}
      </span>
      <span>
        Trig {source} {s.slopeRising ? "↑" : "↓"} {s.trigMode.toUpperCase()}
      </span>
      {status.onGround && (
        <span className="readout-warn">{status.onGround} red node is on GND (reads 0 V) — ground belongs on a black node</span>
      )}
      {status.floating ? (
        <span className="readout-warn">
          no ground reference — floating input, trace is approximate. Wire a black node to a trainer GND socket
        </span>
      ) : (
        status.traces > 0 && status.live && !status.triggered && <span className="readout-warn">not triggered</span>
      )}
    </div>
  );
}
