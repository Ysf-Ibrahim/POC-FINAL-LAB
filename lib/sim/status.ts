import { createStore } from "../state/createStore";

/** What the oscilloscope is currently doing, for the readout strip. */
export interface ScopeStatus {
  triggered: boolean;
  live: boolean;
  traces: number;
  /** An input is connected but the scope shares no ground with the trainer. */
  floating: boolean;
  /** Names of inputs whose signal node is wired to trainer ground, e.g. "CH1". */
  onGround: string;
}

const base = createStore<ScopeStatus>({ triggered: false, live: false, traces: 0, floating: false, onGround: "" });

export const scopeStatus = {
  ...base,
  set(next: ScopeStatus) {
    const cur = base.get();
    if (cur.triggered === next.triggered && cur.live === next.live && cur.traces === next.traces && cur.floating === next.floating && cur.onGround === next.onGround) return;
    base.set(next);
  },
};
