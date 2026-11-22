import { createStore } from "../state/createStore";
import { PORTS } from "../ports/registry";

export type CableColor = "red" | "black" | "blue";
export const CABLE_COLORS: CableColor[] = ["red", "black", "blue"];

/** A 2 mm patch lead between two connectors. */
export interface Cable {
  id: string;
  /** Port ids of the two plugs. */
  a: string;
  b: string;
  color: CableColor;
}

export type WireTool = "wire" | "remove";

export interface CableState {
  cables: Cable[];
  /** Snapshots for undo, most recent last. */
  past: Cable[][];
  color: CableColor;
  tool: WireTool;
  selected: string | null;
}

const MAX_HISTORY = 100;

export const cableStore = createStore<CableState>({
  cables: [],
  past: [],
  color: "red",
  tool: "wire",
  selected: null,
});

let counter = 0;
const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`;

function commit(cables: Cable[], extra: Partial<CableState> = {}) {
  cableStore.set((s) => ({
    ...s,
    ...extra,
    cables,
    past: [...s.past, s.cables].slice(-MAX_HISTORY),
  }));
}

const same = (c: Cable, a: string, b: string) => (c.a === a && c.b === b) || (c.a === b && c.b === a);

/** What `connect` did, so the bench can tell the user. */
export type ConnectResult = "added" | "recoloured" | "duplicate" | "invalid";

export const cableActions = {
  /**
   * Join two connectors with a lead in the current colour. Plugs stack, so a
   * connector can hold several leads. Drawing over an existing lead in another
   * colour replaces it with the chosen colour.
   */
  connect(a: string, b: string): ConnectResult {
    if (a === b || !PORTS.has(a) || !PORTS.has(b)) return "invalid";
    const s = cableStore.get();
    const existing = s.cables.find((c) => same(c, a, b));
    if (existing) {
      if (existing.color === s.color) return "duplicate";
      commit(
        s.cables.map((c) => (c.id === existing.id ? { ...c, color: s.color } : c)),
        { selected: null },
      );
      return "recoloured";
    }
    commit([...s.cables, { id: newId(), a, b, color: s.color }], { selected: null });
    return "added";
  },
  remove(id: string) {
    const s = cableStore.get();
    if (!s.cables.some((c) => c.id === id)) return;
    commit(
      s.cables.filter((c) => c.id !== id),
      { selected: s.selected === id ? null : s.selected },
    );
  },
  clear() {
    if (cableStore.get().cables.length === 0) return;
    commit([], { selected: null });
  },
  undo() {
    cableStore.set((s) => {
      if (s.past.length === 0) return s;
      const past = s.past.slice(0, -1);
      return { ...s, cables: s.past[s.past.length - 1], past, selected: null };
    });
  },
  /** Choose the colour for new leads. Existing leads keep the colour they were made with. */
  setColor(color: CableColor) {
    cableStore.set((s) => ({ ...s, color, tool: "wire" }));
  },
  setTool(tool: WireTool) {
    cableStore.set((s) => ({ ...s, tool, selected: tool === "remove" ? null : s.selected }));
  },
  select(id: string | null) {
    cableStore.set((s) => (s.selected === id ? s : { ...s, selected: id }));
  },
  /**
   * Replace all cables without touching history (restoring a saved bench).
   * `legacy` marks data written before each oscilloscope input had separate
   * signal and ground nodes. Those benches are converted:
   *  - the red/black oscilloscope cable becomes a signal lead and a ground lead;
   *  - a lead from a trainer GND socket to an input was a ground lead when the
   *    input was a single socket, so it moves to that input's ground node
   *    instead of shorting the signal node to ground.
   */
  hydrate(saved: unknown[], legacy = false) {
    const cables: Cable[] = [];
    const isTrainerGround = (p: string) => PORTS.get(p)?.role === "ground";
    const groundNode = (p: string) => (PORTS.get(p)?.device === "scope" && PORTS.get(p)?.role === "in" && PORTS.has(`${p}.gnd`) ? `${p}.gnd` : null);
    const add = (id: string, pa: unknown, pb: unknown, color: unknown) => {
      if (typeof pa !== "string" || typeof pb !== "string") return;
      let a = pa;
      let b = pb;
      if (legacy) {
        if (isTrainerGround(a) && groundNode(b)) b = groundNode(b)!;
        else if (isTrainerGround(b) && groundNode(a)) a = groundNode(a)!;
      }
      if (a === b || !PORTS.has(a) || !PORTS.has(b)) return;
      if (cables.some((c) => same(c, a, b))) return;
      cables.push({ id, a, b, color: CABLE_COLORS.includes(color as CableColor) ? (color as CableColor) : "red" });
    };
    for (const raw of saved) {
      const c = raw as Record<string, unknown> | null;
      if (!c || typeof c.id !== "string") continue;
      if (c.kind === "scope") {
        if (c.signal) add(c.id, c.bnc, c.signal, "red");
        if (c.ground) add(`${c.id}g`, `${String(c.bnc)}.gnd`, c.ground, "black");
      } else {
        add(c.id, c.a, c.b, c.color);
        if (typeof c.ground === "string") {
          const input = [c.a, c.b].find((p) => typeof p === "string" && PORTS.has(`${p}.gnd`));
          if (input) add(`${c.id}g`, `${String(input)}.gnd`, c.ground, "black");
        }
      }
    }
    cableStore.set((s) => ({ ...s, cables, past: [], selected: null }));
  },
};
