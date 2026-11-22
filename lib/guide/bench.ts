import type { Cable } from "../cables/store";
import type { ControlsState } from "../controls/store";
import { SCOPE_CHASSIS } from "../ports/promax";
import { PORTS } from "../ports/registry";
import { buildCircuit, runCircuit } from "../sim/engine";
import { F_CARRIER, F_MESSAGE, MODULE_MODELS } from "../sim/modules";
import type { ScopeStatus } from "../sim/status";

/**
 * Read-only view of the bench for the lab guides: what is wired to what, and
 * what voltage a socket actually carries. Everything is derived from the same
 * leads, controls and module models the oscilloscope uses, so a guide can only
 * ever confirm what the simulated circuit really does.
 */

/** Every trainer GND socket is one point. */
const TRAINER_GROUND = "emona.gnd";
/** Every oscilloscope ground node is one point (the chassis), and so is every trainer GND socket. */
const node = (id: string) => {
  const role = PORTS.get(id)?.role;
  return role === "chassis" ? SCOPE_CHASSIS : role === "ground" ? TRAINER_GROUND : id;
};

export interface Nets {
  /** True when a chain of leads joins the two sockets. */
  linked(a: string, b: string): boolean;
  /** True when the socket is joined to a trainer GND socket. */
  grounded(id: string): boolean;
  /** True when at least one lead is plugged into the socket. */
  used(id: string): boolean;
  /** Every socket on the same net as `id`, including itself. */
  members(id: string): string[];
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
  if (parent.has(TRAINER_GROUND)) groundRoots.add(find(TRAINER_GROUND));
  const plugged = new Set<string>();
  for (const c of cables) {
    plugged.add(c.a);
    plugged.add(c.b);
  }
  const byRoot = new Map<string, string[]>();
  for (const id of plugged) {
    const root = find(node(id));
    const list = byRoot.get(root);
    if (list) list.push(id);
    else byRoot.set(root, [id]);
  }
  return {
    linked: (a, b) => {
      const na = node(a);
      const nb = node(b);
      return na === nb || (parent.has(na) && parent.has(nb) && find(na) === find(nb));
    },
    grounded: (id) => PORTS.get(id)?.role === "ground" || groundRoots.has(find(node(id))),
    used: (id) => plugged.has(id),
    members: (id) => (parent.has(node(id)) ? (byRoot.get(find(node(id))) ?? [id]) : [id]),
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

/** A periodic signal described the way a lab report would: level, message tone, distortion and ripple. */
export interface Tone extends Reading {
  /** Peak-to-peak size of the component at the message frequency (2 kHz). */
  messageVpp: number;
  /** Harmonic distortion of the message component, 2nd to 8th harmonic, in %. NaN when there is no message. */
  thd: number;
  /** Peak-to-peak of what remains at the carrier frequency and above (the "ripple"). */
  ripple: number;
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
  /** Output sockets that drive the net of `id` (more than one means outputs are shorted together). */
  drivers(id: string): string[] {
    return this.nets.members(id).filter((m) => PORTS.get(m)?.role === "out");
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

  /**
   * Analyse the signal on a socket over two cycles of the message: the size of
   * its 2 kHz component, its harmonic distortion, and the ripple left at the
   * carrier frequency (what remains after averaging over one carrier cycle).
   */
  tone(port: string): Tone {
    const dt = 1e-7;
    const [v] = this.record([port], { dt });
    const r = this.reading(port, { dt });
    const n = v.length;
    const cycles = 2; // the default recording holds exactly two message cycles
    const harmonic = (k: number) => {
      let re = 0;
      let im = 0;
      const w = (2 * Math.PI * cycles * k) / n;
      for (let i = 0; i < n; i++) {
        re += v[i] * Math.cos(w * i);
        im += v[i] * Math.sin(w * i);
      }
      return (2 * Math.hypot(re, im)) / n; // peak amplitude
    };
    const h1 = harmonic(1);
    let hs = 0;
    for (let k = 2; k <= 8; k++) hs += harmonic(k) ** 2;
    const w = Math.max(1, Math.round(1 / (F_CARRIER * dt)));
    let acc = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      acc += v[i];
      if (i >= w) acc -= v[i - w];
      if (i >= w) {
        const residue = v[i - Math.floor(w / 2)] - acc / w;
        if (residue < lo) lo = residue;
        if (residue > hi) hi = residue;
      }
    }
    return {
      ...r,
      messageVpp: 2 * h1,
      thd: h1 > 0.025 ? (100 * Math.sqrt(hs)) / h1 : NaN,
      ripple: Number.isFinite(hi) ? hi - lo : 0,
    };
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
