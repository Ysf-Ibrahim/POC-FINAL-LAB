export type DeviceId = "scope" | "emona";

/**
 * Physical connector style.
 * - analog:  round 2 mm socket (ETT-101 analog signal)
 * - digital: square 2 mm socket (ETT-101 TTL-level signal)
 * - ground:  2 mm socket tied to trainer ground
 * - terminal: signal or ground node of an oscilloscope input
 * - post:    oscilloscope ground binding post / calibrator terminal
 */
export type PortKind = "analog" | "digital" | "ground" | "terminal" | "post";

/**
 * Electrical role, used by the signal engine to build nets.
 * "ground" is the trainer's 0 V rail. "chassis" is the oscilloscope's own
 * ground (the ground node of every input and the binding post, all one point):
 * it is NOT the trainer's ground until a lead joins the two.
 */
export type PortRole = "in" | "out" | "ground" | "chassis";

export interface PortDef {
  /** Stable identifier, e.g. "master.sine2k". Lab configurations refer to ports by this id. */
  id: string;
  device: DeviceId;
  /** Module the socket belongs to, e.g. "master". */
  module: string;
  /** Text printed next to the socket on the real panel. */
  label: string;
  /** Centre of the socket, normalised to the equipment image (0–1). */
  x: number;
  y: number;
  kind: PortKind;
  role: PortRole;
  /** Pick radius in world units, when the connector is larger than usual for its kind. */
  r?: number;
}
