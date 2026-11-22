import type { DeviceId, PortKind } from "../ports/types";

export interface DeviceSpec {
  id: DeviceId;
  name: string;
  image: string;
  /** Pixel size of the image asset. */
  px: { w: number; h: number };
  /** Size on the bench in world units (CSS px at 100 % zoom). */
  width: number;
  height: number;
  /** Corner radius of the instrument body, world units. */
  corner: number;
  /** Connector radius by type, world units. Used for hit-testing and plug size. */
  portRadius: Partial<Record<PortKind, number>>;
}

const sized = (width: number, px: { w: number; h: number }) => ({ px, width, height: (width * px.h) / px.w });

export const DEVICES: Record<DeviceId, DeviceSpec> = {
  scope: {
    id: "scope",
    name: "PROMAX OD-402B",
    image: "/equipment/promax-od402b.webp",
    ...sized(1000, { w: 1762, h: 722 }),
    corner: 17,
    portRadius: { terminal: 10.5, post: 11 },
  },
  emona: {
    id: "emona",
    name: "EMONA Telecoms-Trainer 101",
    image: "/equipment/emona-ett101.webp",
    ...sized(920, { w: 1635, h: 1353 }),
    corner: 9,
    portRadius: { analog: 10, digital: 10, ground: 10 },
  },
};

export const DEVICE_IDS: DeviceId[] = ["scope", "emona"];

/** Starting layout: oscilloscope above the trainer, centred on each other. */
export const HOME_POSITIONS: Record<DeviceId, { x: number; y: number }> = {
  scope: { x: 0, y: 0 },
  emona: { x: (DEVICES.scope.width - DEVICES.emona.width) / 2, y: DEVICES.scope.height + 34 },
};
