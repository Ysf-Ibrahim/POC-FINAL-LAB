import { createStore } from "../state/createStore";

/** Front-panel state of both instruments. Pure data: no rendering, no signal logic. */

export type Coupling = "ac" | "gnd" | "dc";
export type VerticalMode = "ch1" | "ch2" | "dual" | "add";
export type TriggerMode = "auto" | "norm" | "tv-v" | "tv-h";
export type TriggerSource = "int" | "line" | "ext";
export type IntTrigger = "ch1" | "ch2" | "vert";

export interface ScopeChannel {
  /** POSITION knob, -1..1 (centre = trace on the centre line). */
  pos: number;
  /** Index into VOLTS_DIV. */
  vdiv: number;
  /** VARIABLE knob, 1 = CAL detent, lower values reduce sensitivity. */
  variable: number;
  coupling: Coupling;
}

export interface ScopeControls {
  power: boolean;
  inten: number;
  focus: number;
  ch1: ScopeChannel;
  ch2: ScopeChannel;
  /** CH1 X5 MAG. */
  mag5: boolean;
  /** CH2 NORM / INV. */
  invert: boolean;
  mode: VerticalMode;
  /** Horizontal POSITION knob, -1..1. */
  hpos: number;
  /** Index into TIME_DIV. */
  tdiv: number;
  mag10: boolean;
  /** Sweep CAL (true) or VAR (false). */
  sweepCal: boolean;
  /** Sweep VARIABLE knob, 0..1; 1 = calibrated speed. */
  sweepVar: number;
  /** Trigger LEVEL knob, -1..1. */
  level: number;
  /** true = rising edge. */
  slopeRising: boolean;
  trigMode: TriggerMode;
  trigSource: TriggerSource;
  intTrig: IntTrigger;
}

/** VOLTS/DIV steps printed on the OD-402B, in volts, in dial order (CCW → CW). */
export const VOLTS_DIV = [5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005];
/** TIME/DIV steps in seconds, in dial order (CCW → CW). */
export const TIME_DIV = [
  0.2, 0.1, 50e-3, 20e-3, 10e-3, 5e-3, 2e-3, 1e-3, 0.5e-3, 0.2e-3, 0.1e-3, 50e-6, 20e-6, 10e-6, 5e-6, 2e-6, 1e-6,
  0.5e-6, 0.2e-6,
];

export interface EmonaControls {
  /** Trimmer positions, 0 (fully CCW) .. 1 (fully CW), keyed by control id. */
  knobs: Record<string, number>;
  /** Slide / DIP switch positions keyed by control id. */
  switches: Record<string, number>;
}

export interface ControlsState {
  scope: ScopeControls;
  emona: EmonaControls;
}

export const DEFAULT_SCOPE: ScopeControls = {
  power: true,
  inten: 0.72,
  focus: 0.8,
  ch1: { pos: 0.3, vdiv: 2, variable: 1, coupling: "dc" },
  ch2: { pos: -0.5, vdiv: 2, variable: 1, coupling: "dc" },
  mag5: false,
  invert: false,
  mode: "dual",
  hpos: 0,
  tdiv: 9,
  mag10: false,
  sweepCal: true,
  sweepVar: 1,
  level: 0,
  slopeRising: true,
  trigMode: "auto",
  trigSource: "int",
  intTrig: "ch1",
};

export const DEFAULT_EMONA: EmonaControls = {
  knobs: {},
  switches: {},
};

export const controlsStore = createStore<ControlsState>({
  scope: DEFAULT_SCOPE,
  emona: DEFAULT_EMONA,
});

export const controlActions = {
  scope(patch: Partial<ScopeControls>) {
    controlsStore.set((s) => ({ ...s, scope: { ...s.scope, ...patch } }));
  },
  channel(ch: "ch1" | "ch2", patch: Partial<ScopeChannel>) {
    controlsStore.set((s) => ({ ...s, scope: { ...s.scope, [ch]: { ...s.scope[ch], ...patch } } }));
  },
  knob(id: string, value: number) {
    const v = Math.min(1, Math.max(0, value));
    controlsStore.set((s) =>
      s.emona.knobs[id] === v ? s : { ...s, emona: { ...s.emona, knobs: { ...s.emona.knobs, [id]: v } } },
    );
  },
  switch(id: string, value: number) {
    controlsStore.set((s) =>
      s.emona.switches[id] === value
        ? s
        : { ...s, emona: { ...s.emona, switches: { ...s.emona.switches, [id]: value } } },
    );
  },
  reset() {
    controlsStore.set({ scope: DEFAULT_SCOPE, emona: DEFAULT_EMONA });
  },
  hydrate(state: Partial<ControlsState>) {
    controlsStore.set((s) => ({
      scope: { ...s.scope, ...(state.scope ?? {}) },
      emona: {
        knobs: { ...s.emona.knobs, ...(state.emona?.knobs ?? {}) },
        switches: { ...s.emona.switches, ...(state.emona?.switches ?? {}) },
      },
    }));
  },
};
