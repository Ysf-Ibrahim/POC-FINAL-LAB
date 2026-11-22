import { PORTS } from "../ports/registry";
import type { PortDef } from "../ports/types";
import type { ConnectResult } from "./store";

/** Module names as printed on the trainer, for socket labels. */
const MODULE_TITLES: Record<string, string> = {
  adder: "ADDER",
  mult1: "MULTIPLIER",
  mult2: "MULTIPLIER",
  mult3: "MULTIPLIER",
  twin: "TWIN PULSE GENERATOR",
  switch: "DUAL ANALOG SWITCH",
  noise: "NOISE GENERATOR",
  buffer: "BUFFER",
  channel: "CHANNEL MODULE",
  phase: "PHASE SHIFTER",
  utilities: "UTILITIES",
  tlpf: "TUNEABLE LPF",
  dcv: "VARIABLE DCV",
  speech: "SPEECH",
  exor: "EXOR",
  vco: "VCO",
  seq: "SEQUENCE GENERATOR",
  divider: "DIVIDER",
  pcmenc: "PCM ENCODER",
  master: "MASTER SIGNALS",
  s2p: "SERIAL TO PARALLEL",
  pcmdec: "PCM DECODER",
};

/** Name of a connector for the hover label, e.g. "MASTER SIGNALS · 2kHz SINE". */
export function portTitle(port: PortDef): string {
  if (port.device === "scope") return port.label;
  if (port.role === "ground") return port.module === "dcv" ? "VARIABLE DCV · GND (trainer ground)" : "GND (trainer ground)";
  const title = MODULE_TITLES[port.module];
  return title ? `${title} · ${port.label}` : port.label;
}

const isScopeSignal = (p: PortDef) => p.device === "scope" && p.role === "in";

/**
 * Something the user should know about the lead they just made, or null.
 * Nothing here blocks a connection: every lead is electrically legal, but a few
 * are almost certainly not what was meant.
 */
export function connectionNote(a: string, b: string, result: ConnectResult): string | null {
  if (result === "duplicate") return "These two are already connected";
  const pa = PORTS.get(a);
  const pb = PORTS.get(b);
  if (!pa || !pb) return null;
  const signal = isScopeSignal(pa) ? pa : isScopeSignal(pb) ? pb : null;
  const other = signal === pa ? pb : pa;
  if (signal && other.role === "ground") {
    const input = signal.label.split(" signal")[0];
    return `${input}'s red node is its signal input: on GND it reads 0 V. For the ground lead use the black node.`;
  }
  if (pa.role === "chassis" && pb.role === "chassis") {
    return "Both of these are the oscilloscope's own ground. Wire one of them to a GND socket on the trainer.";
  }
  return null;
}
