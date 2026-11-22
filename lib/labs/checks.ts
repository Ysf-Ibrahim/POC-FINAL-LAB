import { portTitle } from "../cables/feedback";
import type { Bench } from "../guide/bench";
import type { Check } from "../guide/types";
import { PORTS } from "../ports/registry";

/** Checks shared by the lab guides. Each reads the live bench; none depends on the step. */

/** Name of a socket as the bench's labels show it. */
export const portName = (id: string) => {
  const port = PORTS.get(id);
  return port ? portTitle(port) : id;
};

/** `input` is driven by `from` and by no other output. */
export const fedBy =
  (input: string, from: string): Check["test"] =>
  (b: Bench) => {
    if (!b.linked(input, from)) return { ok: false };
    const others = b.drivers(input).filter((d) => d !== from);
    return others.length
      ? { ok: false, detail: `${portName(others[0])} is also connected here. Two outputs must never be joined: remove that lead.` }
      : { ok: true };
  };

/** An oscilloscope channel shows `node`, and only `node`. */
export const probeOn =
  (channel: string) =>
  (node: string): Check["test"] =>
  (b: Bench) => {
    const name = channel === "scope.ch1" ? "CH1" : channel === "scope.ch2" ? "CH2" : "The input";
    const others = b.drivers(channel).filter((d) => d !== node);
    if (others.length && b.linked(channel, node))
      return { ok: false, detail: `${name} is still connected to ${portName(others[0])} as well. Remove that lead, so ${name} sees one signal only.` };
    if (others.length) return { ok: false, detail: `${name} still shows ${portName(others[0])}.` };
    return { ok: b.linked(channel, node) };
  };
