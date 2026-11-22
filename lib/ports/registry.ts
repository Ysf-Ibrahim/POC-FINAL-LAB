import { EMONA_PORTS } from "./emona";
import { PROMAX_PORTS } from "./promax";
import type { PortDef } from "./types";

/** Every connector on the bench. Labs, cables and the signal engine refer to ports by id. */
export const PORT_LIST: readonly PortDef[] = [...PROMAX_PORTS, ...EMONA_PORTS];

export const PORTS: ReadonlyMap<string, PortDef> = new Map(PORT_LIST.map((p) => [p.id, p]));

export function getPort(id: string): PortDef {
  const port = PORTS.get(id);
  if (!port) throw new Error(`Unknown port "${id}"`);
  return port;
}
