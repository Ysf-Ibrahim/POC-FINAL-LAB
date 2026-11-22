/** Transient value bubble shown while a front-panel control is being adjusted. */
export interface Hint {
  text: string;
  /** Viewport position the bubble points at. */
  x: number;
  y: number;
}

let current: Hint | null = null;
const listeners = new Set<() => void>();
let timer = 0;

const notify = () => listeners.forEach((l) => l());

export const hint = {
  get: () => current,
  show(text: string, x: number, y: number, holdMs = 0) {
    current = { text, x, y };
    window.clearTimeout(timer);
    if (holdMs > 0) timer = window.setTimeout(hint.hide, holdMs);
    notify();
  },
  hide() {
    window.clearTimeout(timer);
    if (!current) return;
    current = null;
    notify();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
