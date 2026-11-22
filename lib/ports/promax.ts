import type { PortDef } from "./types";

/** Pixel size of public/equipment/promax-od402b.webp; coordinates below are measured on it. */
export const SCOPE_IMAGE = { w: 1762, h: 722 };

const at = (x: number, y: number) => ({ x: x / SCOPE_IMAGE.w, y: y / SCOPE_IMAGE.h });

/** The oscilloscope's ground: the binding post, and the ground node of every input. */
export const SCOPE_CHASSIS = "scope.gnd";

/**
 * The three BNC inputs, by their centre on the photograph. A BNC carries two
 * conductors (centre pin = signal, shell = ground), so each input is presented
 * as two nodes side by side: red for the signal, black for ground.
 */
export const SCOPE_INPUTS = [
  { id: "scope.ch1", name: "CH1", module: "vertical", x: 947.3, y: 655.5 },
  { id: "scope.ch2", name: "CH2", module: "vertical", x: 1154.5, y: 655.5 },
  { id: "scope.ext", name: "EXT TRIG", module: "trigger", x: 1365.5, y: 657.5 },
] as const;
/** Half the distance between the two nodes of an input, image px. */
export const NODE_OFFSET = 31;

/**
 * PROMAX OD-402B connectors. For each input, `<id>` is its signal node and
 * `<id>.gnd` its ground node. All ground nodes and the binding post are the
 * same electrical point (the chassis). PROBE ADJ is the 0.5 Vp-p calibrator.
 */
export const PROMAX_PORTS: PortDef[] = [
  { id: "scope.ch1", device: "scope", module: "vertical", label: "CH1 signal (red node)", ...at(916.3, 655.5), kind: "terminal", role: "in" },
  { id: "scope.ch1.gnd", device: "scope", module: "vertical", label: "CH1 ground (black node)", ...at(978.3, 655.5), kind: "terminal", role: "chassis" },
  { id: "scope.ch2", device: "scope", module: "vertical", label: "CH2 signal (red node)", ...at(1123.5, 655.5), kind: "terminal", role: "in" },
  { id: "scope.ch2.gnd", device: "scope", module: "vertical", label: "CH2 ground (black node)", ...at(1185.5, 655.5), kind: "terminal", role: "chassis" },
  { id: "scope.ext", device: "scope", module: "trigger", label: "EXT TRIG signal (red node)", ...at(1334.5, 657.5), kind: "terminal", role: "in" },
  { id: "scope.ext.gnd", device: "scope", module: "trigger", label: "EXT TRIG ground (black node)", ...at(1396.5, 657.5), kind: "terminal", role: "chassis" },
  { id: "scope.probeAdj", device: "scope", module: "calibrator", label: "PROBE ADJ 0.5 Vp-p", ...at(1515.5, 641), kind: "post", role: "out" },
  // the whole brass binding post is the target, not only its hole
  { id: "scope.gnd", device: "scope", module: "chassis", label: "Oscilloscope ground post", ...at(1686, 662), kind: "post", role: "chassis", r: 20 },
];

/** For a signal node, the ground node of the same input. */
export const groundNodeOf = (id: string) => (PROMAX_PORTS.some((p) => p.id === `${id}.gnd`) ? `${id}.gnd` : null);
