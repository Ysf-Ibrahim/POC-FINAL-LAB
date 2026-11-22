import { SCOPE_CHASSIS } from "../ports/promax";
import { PORTS } from "../ports/registry";
import type { Cable } from "../cables/store";
import type { EmonaControls } from "../controls/store";

/**
 * Time-domain signal engine.
 *
 * The patch leads define nets; every trainer module is a small model that is
 * stepped once per sample in dependency order. The engine knows nothing about
 * rendering or about any particular experiment: it only answers "what voltage
 * is on this socket over this stretch of time".
 */

export interface SimEnv {
  /** Sample period in seconds. */
  dt: number;
  controls: EmonaControls;
  /** Uniform random number in [0, 1). */
  random: () => number;
}

/** Called once per sample: read `inp`, write `out`. */
export type StepFn = (inp: Float64Array, out: Float64Array, t: number) => void;

export interface ModuleModel {
  id: string;
  /** Input socket ids, in the order `inp` is filled. */
  inputs: string[];
  /** Output socket ids, in the order `out` is written. */
  outputs: string[];
  /** True for sources that are not phase-locked to the master clock. */
  freeRunning?: boolean;
  /** Time (s) the model needs after reset before its output is meaningful. */
  settle?: (controls: EmonaControls) => number;
  create(env: SimEnv): StepFn;
}

interface Reader {
  /** Indices into the output slot array that drive this net. */
  drivers: number[];
  grounded: boolean;
}

interface ActiveModule {
  model: ModuleModel;
  base: number;
  readers: Reader[];
}

export interface Circuit {
  modules: ActiveModule[];
  slotCount: number;
  /** One reader per probed socket, in the order requested. */
  probes: Reader[];
  /** Whether a lead is plugged into each probed socket. */
  connected: boolean[];
  /** Whether each probed socket actually has something driving it. */
  driven: boolean[];
  /** Every socket on the same net as each probed socket (including itself). */
  members: string[][];
  freeRunning: boolean;
  settle: (controls: EmonaControls) => number;
}

/** Resolve the leads into nets and collect the modules that feed the probes. */
export function buildCircuit(
  cables: readonly Cable[],
  models: readonly ModuleModel[],
  probePorts: readonly string[],
): Circuit {
  // --- nets (union-find over socket ids) ---
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== undefined && parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const touch = (id: string) => {
    if (!parent.has(id)) parent.set(id, id);
  };
  // Every ground node of the oscilloscope is the same point: its chassis.
  const node = (id: string) => (PORTS.get(id)?.role === "chassis" ? SCOPE_CHASSIS : id);
  for (const c of cables) {
    const a = node(c.a);
    const b = node(c.b);
    touch(a);
    touch(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const outputOwner = new Map<string, { model: ModuleModel; index: number }>();
  for (const model of models) {
    model.outputs.forEach((port, index) => outputOwner.set(port, { model, index }));
  }

  const netMembers = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    let list = netMembers.get(root);
    if (!list) netMembers.set(root, (list = []));
    list.push(id);
  }

  // --- collect the modules reachable (backwards) from the probes ---
  const active: ActiveModule[] = [];
  const state = new Map<string, "visiting" | "done">();
  const baseOf = new Map<string, number>();
  let slotCount = 0;
  const pending: { reader: Reader; members: string[] }[] = [];

  const readerFor = (port: string): Reader => {
    const reader: Reader = { drivers: [], grounded: false };
    if (!parent.has(port)) return reader;
    const members = netMembers.get(find(port)) ?? [];
    for (const member of members) {
      if (PORTS.get(member)?.role === "ground") reader.grounded = true;
    }
    if (!reader.grounded) {
      for (const member of members) {
        const owner = outputOwner.get(member);
        if (owner && member !== port) visit(owner.model);
      }
      pending.push({ reader, members: members.filter((m) => m !== port) });
    }
    return reader;
  };

  function visit(model: ModuleModel) {
    if (state.has(model.id)) return; // done, or a feedback loop (resolved with a one-sample delay)
    state.set(model.id, "visiting");
    baseOf.set(model.id, slotCount);
    const base = slotCount;
    slotCount += model.outputs.length;
    const readers = model.inputs.map(readerFor);
    active.push({ model, base, readers });
    state.set(model.id, "done");
  }

  const probes = probePorts.map(readerFor);

  // Driver slots can only be resolved once every module has a base index.
  for (const { reader, members } of pending) {
    for (const member of members) {
      const owner = outputOwner.get(member);
      if (owner) reader.drivers.push(baseOf.get(owner.model.id)! + owner.index);
    }
  }

  const connected = probePorts.map((p) => parent.has(p));
  const driven = probes.map((r) => r.grounded || r.drivers.length > 0);

  return {
    modules: active,
    slotCount,
    probes,
    connected,
    driven,
    members: probePorts.map((p) => (parent.has(p) ? (netMembers.get(find(p)) ?? [p]) : [p])),
    freeRunning: active.some((m) => m.model.freeRunning),
    settle: (controls) => active.reduce((max, m) => Math.max(max, m.model.settle?.(controls) ?? 0), 0),
  };
}

export interface RunOptions {
  dt: number;
  /** Simulated time before recording starts, so filters can settle. */
  warmup: number;
  /** Number of recorded samples. */
  samples: number;
  /** Absolute time of the first warm-up sample. */
  t0: number;
  controls: EmonaControls;
  random?: () => number;
}

/** Step the circuit and record the voltage at each probe. */
export function runCircuit(circuit: Circuit, opts: RunOptions, into?: Float32Array[]): Float32Array[] {
  const { dt, samples, t0, controls } = opts;
  const random = opts.random ?? Math.random;
  const env: SimEnv = { dt, controls, random };
  const slots = new Float64Array(circuit.slotCount);
  const mods = circuit.modules.map((m) => ({
    step: m.model.create(env),
    inp: new Float64Array(m.model.inputs.length),
    out: slots.subarray(m.base, m.base + m.model.outputs.length),
    readers: m.readers,
  }));
  const nProbe = circuit.probes.length;
  const out: Float32Array[] = [];
  for (let p = 0; p < nProbe; p++) {
    const reuse = into?.[p];
    out.push(reuse && reuse.length === samples ? reuse : new Float32Array(samples));
  }

  const read = (r: Reader): number => {
    const d = r.drivers;
    if (r.grounded || d.length === 0) return 0;
    if (d.length === 1) return slots[d[0]];
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += slots[d[i]];
    return sum / d.length; // shorted outputs settle near their average
  };

  const warm = Math.max(0, Math.round(opts.warmup / dt));
  const total = warm + samples;
  const nMods = mods.length;
  for (let n = 0; n < total; n++) {
    const t = t0 + n * dt;
    for (let m = 0; m < nMods; m++) {
      const mod = mods[m];
      const { inp, readers } = mod;
      for (let i = 0; i < inp.length; i++) inp[i] = read(readers[i]);
      mod.step(inp, mod.out, t);
    }
    if (n >= warm) {
      const k = n - warm;
      for (let p = 0; p < nProbe; p++) out[p][k] = read(circuit.probes[p]);
    }
  }
  return out;
}
