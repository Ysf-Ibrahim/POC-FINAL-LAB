import type { Cable } from "../cables/store";
import type { ControlsState } from "../controls/store";
import { SCOPE_CHASSIS } from "../ports/promax";
import { PORTS } from "../ports/registry";
import { buildCircuit, runCircuit } from "../sim/engine";
import { F_MESSAGE, MODULE_MODELS } from "../sim/modules";
import type { ScopeStatus } from "../sim/status";

/**
 * Read-only view of the bench for the lab guides: what is wired to what, and
 * what voltage a socket actually carries. Everything is derived from the same
 * leads, controls and module models the oscilloscope uses, so a guide can only
 * ever confirm what the simulated circuit really does.
 */

/** Every oscilloscope ground node is one point: the chassis. */
const node = (id: string) => (PORTS.get(id)?.role === "chassis" ? SCOPE_CHASSIS : id);

export interface Nets {
  /** True when a chain of leads joins the two sockets. */
  linked(a: string, b: string): boolean;
  /** True when the socket is joined to a trainer GND socket. */
  grounded(id: string): boolean;
  /** True when at least one lead is plugged into the socket. */
  used(id: string): boolean;
}

export function resolveNets(cables: readonly Cable[]): Nets {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const c of cables) {
    const a = find(node(c.a));
    const b = find(node(c.b));
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    if (a !== b) parent.set(a, b);
  }
  const groundRoots = new Set<string>();
  for (const id of parent.keys()) if (PORTS.get(id)?.role === "ground") groundRoots.add(find(id));
  const plugged = new Set<string>();
  for (const c of cables) {
    plugged.add(c.a);
    plugged.add(c.b);
  }
  return {
    linked: (a, b) => {
      const na = node(a);
      const nb = node(b);
      return na === nb || (parent.has(na) && parent.has(nb) && find(na) === find(nb));
    },
    grounded: (id) => PORTS.get(id)?.role === "ground" || groundRoots.has(find(node(id))),
    used: (id) => plugged.has(id),
  };
}

export interface Reading {
  min: number;
  max: number;
  /** Average over the window: the DC level for a periodic signal. */
  mean: number;
  /** Peak-to-peak. */
  vpp: number;
}

export interface RecordOptions {
  /** Length of the recording in seconds. Default: two cycles of the trainer's 2 kHz message. */
  duration?: number;
  /** Sample period in seconds. Default 0.1 µs (100 samples per 100 kHz cycle). */
  dt?: number;
}

export class Bench {
  private netsCache: Nets | null = null;
  private readonly recordings = new Map<string, Float32Array[]>();

  constructor(
    readonly cables: readonly Cable[],
    readonly controls: ControlsState,
    readonly status: ScopeStatus,
  ) {}

  private get nets(): Nets {
    return (this.netsCache ??= resolveNets(this.cables));
  }
  linked(a: string, b: string) {
    return this.nets.linked(a, b);
  }
  grounded(id: string) {
    return this.nets.grounded(id);
  }
  used(id: string) {
    return this.nets.used(id);
  }
  /** The oscilloscope shares a ground with the trainer. */
  get scopeGrounded() {
    return this.nets.grounded(SCOPE_CHASSIS);
  }

  /**
   * Voltage on each socket over time, as a high-impedance probe would see it.
   * All sockets of one call are recorded together, sample for sample.
   */
  record(ports: readonly string[], opts: RecordOptions = {}): Float32Array[] {
    const duration = opts.duration ?? 2 / F_MESSAGE;
    const dt = opts.dt ?? 1e-7;
    const key = `${ports.join("|")}@${duration}/${dt}`;
    const cached = this.recordings.get(key);
    if (cached) return cached;
    // A probe is a lead to nowhere: it joins the socket's net without loading it.
    const probes = ports.map((_, i) => `guide.probe.${i}`);
    const leads: Cable[] = ports.map((port, i) => ({ id: probes[i], a: port, b: probes[i], color: "red" }));
    const circuit = buildCircuit([...this.cables, ...leads], MODULE_MODELS, probes);
    const data = runCircuit(circuit, {
      dt,
      warmup: circuit.settle(this.controls.emona),
      samples: Math.max(1, Math.round(duration / dt)),
      t0: 0,
      controls: this.controls.emona,
    });
    this.recordings.set(key, data);
    return data;
  }

  reading(port: string, opts?: RecordOptions): Reading {
    const [v] = this.record([port], opts);
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
      const x = v[i];
      if (x < min) min = x;
      if (x > max) max = x;
      sum += x;
    }
    return { min, max, mean: sum / v.length, vpp: max - min };
  }
}
