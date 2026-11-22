import type { Point } from "../workspace/scene";

/**
 * The lead currently being routed (one plug in a socket, the other in the
 * user's hand). Kept outside React: it changes on every pointer move.
 */
export interface PendingWire {
  from: string;
  /** Free end in world coordinates. */
  end: Point;
  /** Socket the free end is hovering over, if any. */
  snap: string | null;
  /** True while the pointer is held down (drag-to-connect). */
  dragging: boolean;
}

let pending: PendingWire | null = null;
let hover: string | null = null;
const listeners = new Set<() => void>();

export const wiring = {
  get pending() {
    return pending;
  },
  /** Socket under the pointer (for the hover ring). */
  get hover() {
    return hover;
  },
  setPending(next: PendingWire | null) {
    pending = next;
    listeners.forEach((l) => l());
  },
  setHover(next: string | null) {
    if (hover === next) return;
    hover = next;
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
