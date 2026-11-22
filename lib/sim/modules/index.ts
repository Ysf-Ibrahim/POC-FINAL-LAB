import type { EmonaControls } from "../../controls/store";
import { knobValue, switchValue } from "../../controls/emonaControls";
import {
  BUTTERWORTH_4,
  CHEBYSHEV_BPF_100K,
  ELLIPTIC_8,
  HIGH,
  TTL,
  cascade,
  gaussian,
  onePole,
  toBiquad,
} from "../dsp";
import type { ModuleModel } from "../engine";

/**
 * Behavioural models of the ETT-101 modules and of the oscilloscope calibrator.
 *
 * Every figure below comes from Emona's published material (ETT-101 User
 * Manual, specification sheet, lab manual) or from the legends printed on the
 * panel. Where the documents leave something open, the choice is marked
 * "assumption" and repeated in the README. Modules that could not be modelled
 * faithfully are listed in UNSIMULATED_MODULES and simply output nothing.
 */

const TWO_PI = 2 * Math.PI;

// Master clock: every MASTER SIGNALS output is derived from the 100 kHz
// oscillator, so they are all phase-locked. "8 kHz" is 100 kHz / 12 = 8.333 kHz
// and "2 kHz" is 100 kHz / 48 = 2.083 kHz (Emona lab manual).
export const F_CARRIER = 100_000;
export const F_SAMPLE = F_CARRIER / 12;
export const F_MESSAGE = F_CARRIER / 48;
/** ETT-101 standard analogue level: 4 V peak-to-peak. */
const ANALOG_PEAK = 2;

const square = (f: number, t: number) => (f * t - Math.floor(f * t) < 0.5 ? TTL : 0);

const k = (c: EmonaControls, id: string) => knobValue(c, id);

// ---------------------------------------------------------------- sources

const master: ModuleModel = {
  id: "master",
  inputs: [],
  outputs: [
    "master.sine100k",
    "master.cos100k",
    "master.dig100k",
    "master.dig8k",
    "master.dig2k",
    "master.sine2k",
  ],
  create: () => (_inp, out, t) => {
    const w = TWO_PI * F_CARRIER * t;
    out[0] = ANALOG_PEAK * Math.sin(w);
    out[1] = ANALOG_PEAK * Math.cos(w);
    out[2] = square(F_CARRIER, t);
    out[3] = square(F_SAMPLE, t);
    out[4] = square(F_MESSAGE, t);
    out[5] = ANALOG_PEAK * Math.sin(TWO_PI * F_MESSAGE * t);
  },
};

/** VARIABLE DCV: VDC is adjustable over ±2.5 V; +5V is a fixed rail. */
export const vdcVolts = (c: EmonaControls) => (k(c, "dcv.vdc") - 0.5) * 5;
const dcv: ModuleModel = {
  id: "dcv",
  inputs: [],
  outputs: ["dcv.5v", "dcv.vdc"],
  create: ({ controls }) => {
    const v = vdcVolts(controls);
    return (_inp, out) => {
      out[0] = 5;
      out[1] = v;
    };
  },
};

/**
 * NOISE GENERATOR: white noise to roughly 240 kHz with -6 dB and -20 dB taps.
 * Assumption: 1 V rms at the 0 dB output (the published level is ambiguous).
 */
const noise: ModuleModel = {
  id: "noise",
  inputs: [],
  outputs: ["noise.0db", "noise.m6db", "noise.m20db"],
  freeRunning: true,
  create: ({ dt, random }) => {
    const a = onePole(240_000, dt);
    const drive = Math.sqrt((2 - a) / a);
    let y = 0;
    return (_inp, out) => {
      y += a * (gaussian(random) * drive - y);
      out[0] = y;
      out[1] = y * 0.5012;
      out[2] = y * 0.1;
    };
  },
};

/**
 * VCO. Ranges from the specification sheet: LO 1–17 kHz, HI 60–140 kHz,
 * input ±3 V. Assumption: with GAIN at maximum, ±3 V sweeps the whole range.
 */
export function vcoRest(c: EmonaControls) {
  const hi = switchValue(c, "vco.range") === 1;
  const [lo, top] = hi ? [60_000, 140_000] : [1_000, 17_000];
  return { lo, top, rest: lo + k(c, "vco.freq") * (top - lo) };
}
const vco: ModuleModel = {
  id: "vco",
  inputs: ["vco.in"],
  outputs: ["vco.sine", "vco.digital"],
  freeRunning: true,
  create: ({ dt, controls, random }) => {
    const { lo, top, rest } = vcoRest(controls);
    const perVolt = (k(controls, "vco.gain") * (top - lo)) / 6;
    let phase = random();
    return (inp, out) => {
      const vin = Math.max(-3, Math.min(3, inp[0]));
      const f = Math.max(lo * 0.5, Math.min(top * 1.2, rest + perVolt * vin));
      phase += f * dt;
      phase -= Math.floor(phase);
      out[0] = ANALOG_PEAK * Math.sin(TWO_PI * phase);
      out[1] = phase < 0.5 ? TTL : 0;
    };
  },
};

/**
 * Oscilloscope PROBE ADJ terminal: 0.5 Vp-p square wave (printed on the panel).
 * Assumption: about 1 kHz, the usual calibrator frequency for this instrument family.
 */
const calibrator: ModuleModel = {
  id: "calibrator",
  inputs: [],
  outputs: ["scope.probeAdj"],
  freeRunning: true,
  create: ({ random }) => {
    const offset = random() / 1000;
    return (_inp, out, t) => {
      out[0] = square(1000, t + offset) > 0 ? 0.5 : 0;
    };
  },
};

// ------------------------------------------------------------- arithmetic

/** ADDER: both gains are adjustable from 0 to 2 and are inverting (User Manual). */
export const adderGain = (c: EmonaControls, id: "adder.G" | "adder.g") => 2 * k(c, id);
const adder: ModuleModel = {
  id: "adder",
  inputs: ["adder.a", "adder.b"],
  outputs: ["adder.out"],
  create: ({ controls }) => {
    const G = adderGain(controls, "adder.G");
    const g = adderGain(controls, "adder.g");
    return (inp, out) => {
      out[0] = -(G * inp[0] + g * inp[1]);
    };
  },
};

/** MULTIPLIER: k·X·Y with k ≈ 1. */
const dcMultiplier = (id: string): ModuleModel => ({
  id,
  inputs: [`${id}.x`, `${id}.y`],
  outputs: [`${id}.out`],
  create: () => (inp, out) => {
    out[0] = inp[0] * inp[1];
  },
});

/**
 * Upper MULTIPLIER with AC- and DC-coupled inputs.
 * Assumption: the AC inputs block DC with a corner near 200 Hz.
 */
const mult1: ModuleModel = {
  id: "mult1",
  inputs: ["mult1.xdc", "mult1.xac", "mult1.ydc", "mult1.yac"],
  outputs: ["mult1.out"],
  settle: () => 4e-3,
  create: ({ dt }) => {
    const a = onePole(200, dt);
    let xLow = 0;
    let yLow = 0;
    return (inp, out) => {
      xLow += a * (inp[1] - xLow);
      yLow += a * (inp[3] - yLow);
      out[0] = (inp[0] + inp[1] - xLow) * (inp[2] + inp[3] - yLow);
    };
  },
};

/** BUFFER: gain adjustable from 0 to 10 (User Manual). */
export const bufferGain = (c: EmonaControls) => 10 * k(c, "buffer.gain");
const buffer: ModuleModel = {
  id: "buffer",
  inputs: ["buffer.in"],
  outputs: ["buffer.out"],
  create: ({ controls }) => {
    const gain = bufferGain(controls);
    return (inp, out) => {
      out[0] = gain * inp[0];
    };
  },
};

const exor: ModuleModel = {
  id: "exor",
  inputs: ["exor.a", "exor.b"],
  outputs: ["exor.out"],
  create: () => (inp, out) => {
    out[0] = inp[0] > HIGH !== inp[1] > HIGH ? TTL : 0;
  },
};

// -------------------------------------------------------------- utilities

/** COMPARATOR: TTL high while IN is above REF. */
const comparator: ModuleModel = {
  id: "comparator",
  inputs: ["comparator.ref", "comparator.in"],
  outputs: ["comparator.out"],
  create: () => (inp, out) => {
    out[0] = inp[1] > inp[0] ? TTL : 0;
  },
};

/** RECTIFIER: half-wave, passes the positive half of the input. */
const rectifier: ModuleModel = {
  id: "rectifier",
  inputs: ["rectifier.in"],
  outputs: ["rectifier.out"],
  create: () => (inp, out) => {
    out[0] = inp[0] > 0 ? inp[0] : 0;
  },
};

const RC_CORNER = 2_600; // RC LPF -3 dB point from the specification sheet

const rcLpf: ModuleModel = {
  id: "rclpf",
  inputs: ["rclpf.in"],
  outputs: ["rclpf.out"],
  settle: () => 0.5e-3,
  create: ({ dt }) => {
    const a = onePole(RC_CORNER, dt);
    let y = 0;
    return (inp, out) => {
      y += a * (inp[0] - y);
      out[0] = y;
    };
  },
};

/**
 * DIODE & RC LPF: the capacitor charges quickly through the diode and
 * discharges through the resistor.
 * Assumptions: ideal diode, and the same RC as the stand-alone RC LPF.
 */
const diodeLpf: ModuleModel = {
  id: "diode",
  inputs: ["diode.in"],
  outputs: ["diode.out"],
  settle: () => 0.6e-3,
  create: ({ dt }) => {
    const charge = onePole(60_000, dt);
    const discharge = Math.exp(-TWO_PI * RC_CORNER * dt);
    let y = 0;
    return (inp, out) => {
      y *= discharge;
      if (inp[0] > y) y += charge * (inp[0] - y);
      out[0] = y;
    };
  },
};

// ---------------------------------------------------------------- filters

/**
 * TUNEABLE LPF: 8th-order elliptic, cut-off 600 Hz – 12 kHz, gain 0 – 2,
 * with a clock output at 100 × fc (User Manual).
 * Assumption: the fc trimmer is logarithmic across its travel.
 */
export const tlpfCutoff = (c: EmonaControls) => 600 * Math.pow(20, k(c, "tlpf.fc"));
export const tlpfGain = (c: EmonaControls) => 2 * k(c, "tlpf.gain");
const tlpf: ModuleModel = {
  id: "tlpf",
  inputs: ["tlpf.in"],
  outputs: ["tlpf.out", "tlpf.clk"],
  settle: (c) => 14 / tlpfCutoff(c),
  create: ({ dt, controls }) => {
    const fc = tlpfCutoff(controls);
    const gain = tlpfGain(controls);
    const c = 1 / Math.tan(Math.min(1.4, Math.PI * fc * dt));
    const sections = ELLIPTIC_8.map((s) => toBiquad(s, c));
    return (inp, out, t) => {
      out[0] = gain * cascade(sections, inp[0]);
      out[1] = square(fc * 100, t);
    };
  },
};

/**
 * CHANNEL MODULE. From the specification sheet: band-pass centred on 100 kHz
 * with a 24 kHz pass-band (6th-order Chebyshev, unity gain); base-band low-pass
 * at 1.6 kHz (4th-order Butterworth, gain 0.9); unity-gain adder.
 */
const channelBpf: ModuleModel = {
  id: "channelBpf",
  inputs: ["channel.bpfIn"],
  outputs: ["channel.bpfOut"],
  settle: () => 0.4e-3,
  create: ({ dt }) => {
    const w0 = TWO_PI * F_CARRIER;
    const sections = CHEBYSHEV_BPF_100K.map((s) => toBiquad(s, w0 / Math.tan(Math.min(1.4, (w0 * dt) / 2))));
    return (inp, out) => {
      out[0] = cascade(sections, inp[0]);
    };
  },
};

const channelLpf: ModuleModel = {
  id: "channelLpf",
  inputs: ["channel.lpfIn"],
  outputs: ["channel.lpfOut"],
  settle: () => 3e-3,
  create: ({ dt }) => {
    const c = 1 / Math.tan(Math.min(1.4, Math.PI * 1_600 * dt));
    const sections = BUTTERWORTH_4.map((s) => toBiquad(s, c));
    return (inp, out) => {
      out[0] = 0.9 * cascade(sections, inp[0]);
    };
  },
};

const channelAdder: ModuleModel = {
  id: "channelAdder",
  inputs: ["channel.noise", "channel.signal"],
  outputs: ["channel.out"],
  create: () => (inp, out) => {
    out[0] = inp[0] + inp[1];
  },
};

// ------------------------------------------------------ sampling & pulses

/**
 * TWIN PULSE GENERATOR: each rising CLK edge starts a pulse on Q1; Q2 is the
 * same pulse delayed. Width 5–40 µs, delay 50–300 µs (specification sheet).
 */
export const twinWidth = (c: EmonaControls) => (5 + 35 * k(c, "twin.width")) * 1e-6;
export const twinDelay = (c: EmonaControls) => (50 + 250 * k(c, "twin.delay")) * 1e-6;
const twin: ModuleModel = {
  id: "twin",
  inputs: ["twin.clk"],
  outputs: ["twin.q1", "twin.q2"],
  settle: () => 0.8e-3,
  create: ({ dt, controls }) => {
    const width = twinWidth(controls);
    const delay = twinDelay(controls);
    let last = false;
    let since = Infinity;
    return (inp, out) => {
      const high = inp[0] > HIGH;
      if (high && !last) since = 0;
      else since += dt;
      last = high;
      out[0] = since < width ? TTL : 0;
      out[1] = since >= delay && since < delay + width ? TTL : 0;
    };
  },
};

/**
 * DUAL ANALOG SWITCH. Each switch passes its input while its control is high,
 * and OUT is the sum of both switches (as drawn on the panel).
 * The sample-and-hold is clocked from CONTROL 1.
 * Assumption: it samples on the rising edge and holds until the next one.
 */
const analogSwitch: ModuleModel = {
  id: "switch",
  inputs: ["switch.shIn", "switch.in1", "switch.ctrl1", "switch.ctrl2", "switch.in2"],
  outputs: ["switch.shOut", "switch.out"],
  settle: () => 0.6e-3,
  create: () => {
    let held = 0;
    let last = false;
    return (inp, out) => {
      const c1 = inp[2] > HIGH;
      if (c1 && !last) held = inp[0];
      last = c1;
      out[0] = held;
      out[1] = (c1 ? inp[1] : 0) + (inp[3] > HIGH ? inp[4] : 0);
    };
  },
};

/**
 * PCM ENCODER (PCM mode): INPUT 1 is sampled once per frame and sent as an
 * 8-bit offset-binary word, MSB first, one bit per clock. -2 V → 00000000,
 * +2 V → 11111111. FS is high while bit 0 is on the line.
 */
const pcmEncoder: ModuleModel = {
  id: "pcmenc",
  inputs: ["pcmenc.in1", "pcmenc.in2", "pcmenc.clk"],
  outputs: ["pcmenc.fs", "pcmenc.data"],
  settle: () => 2.5e-3,
  create: () => {
    let last = false;
    let bit = 7;
    let word = 128;
    let started = false;
    return (inp, out) => {
      const clk = inp[2] > HIGH;
      if (clk && !last) {
        if (!started || bit === 0) {
          const v = Math.max(-2, Math.min(2, inp[0]));
          word = Math.round(((v + 2) / 4) * 255);
          bit = 7;
          started = true;
        } else bit -= 1;
      }
      last = clk;
      out[0] = started && bit === 0 ? TTL : 0;
      out[1] = started && (word >> bit) & 1 ? TTL : 0;
    };
  },
};

/**
 * PCM DECODER: shifts PCM DATA in on its clock, and when FS marks bit 0 it
 * converts the completed word to a voltage (00000000 → -2 V, 11111111 → +2 V)
 * and holds it until the next frame.
 * Assumption: data is read on the falling clock edge (mid-bit).
 */
const pcmDecoder: ModuleModel = {
  id: "pcmdec",
  inputs: ["pcmdec.fs", "pcmdec.data", "pcmdec.clk"],
  outputs: ["pcmdec.out", "pcmdec.out2"],
  settle: () => 3.5e-3,
  create: () => {
    let last = false;
    let shift = 0;
    let held = 0;
    return (inp, out) => {
      const clk = inp[2] > HIGH;
      if (!clk && last) {
        shift = ((shift << 1) | (inp[1] > HIGH ? 1 : 0)) & 0xff;
        if (inp[0] > HIGH) held = (shift / 255) * 4 - 2;
      }
      last = clk;
      out[0] = held;
      out[1] = 0;
    };
  },
};

export const MODULE_MODELS: readonly ModuleModel[] = [
  master,
  dcv,
  noise,
  vco,
  calibrator,
  adder,
  mult1,
  dcMultiplier("mult2"),
  dcMultiplier("mult3"),
  buffer,
  exor,
  comparator,
  rectifier,
  rcLpf,
  diodeLpf,
  tlpf,
  channelBpf,
  channelLpf,
  channelAdder,
  twin,
  analogSwitch,
  pcmEncoder,
  pcmDecoder,
];

/** Modules whose sockets can be patched but which produce no signal yet, and why. */
export const UNSIMULATED_MODULES: Record<string, string> = {
  phase: "How the board selects its 2 kHz / 100 kHz range is not documented in the material available.",
  seq: "The generator polynomials of the X and Y sequences are not published.",
  divider: "The DIP-switch position for each division ratio is not documented.",
  s2p: "Output levels and bit ordering are not documented.",
  speech: "Needs a live microphone.",
};
