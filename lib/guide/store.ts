import { createStore } from "../state/createStore";
import type { Highlight } from "./types";

/**
 * State of the lab guide panel. The step a student reached is remembered per
 * lab in the browser, so closing the guide or reloading the page resumes there.
 */
export interface GuideState {
  /** Lab whose guide is open, or null. */
  open: number | null;
  collapsed: boolean;
  /** Index of the current step in the lab's flat step list, per lab. */
  position: Record<number, number>;
}

const KEY = "virtual-comm-lab:guide:v1";

export const guideStore = createStore<GuideState>({ open: null, collapsed: false, position: {} });

/** What the bench should point at right now. Empty when no guide is open. */
export const highlightStore = createStore<Highlight>({});

let loaded = false;
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved.position === "object") {
      const position: Record<number, number> = {};
      for (const [lab, step] of Object.entries(saved.position)) {
        if (Number.isInteger(step) && (step as number) >= 0) position[Number(lab)] = step as number;
      }
      guideStore.set((s) => ({ ...s, position }));
    }
  } catch {
    // Unavailable or corrupt storage: start from the first step.
  }
}
function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ position: guideStore.get().position }));
  } catch {
    // The guide still works for this session.
  }
}

export const guideActions = {
  load,
  open(labId: number) {
    load();
    guideStore.set((s) => ({ ...s, open: labId, collapsed: false }));
  },
  close() {
    guideStore.set((s) => ({ ...s, open: null }));
    highlightStore.set({});
  },
  setCollapsed(collapsed: boolean) {
    guideStore.set((s) => ({ ...s, collapsed }));
  },
  goTo(labId: number, step: number) {
    guideStore.set((s) => ({ ...s, position: { ...s.position, [labId]: Math.max(0, step) } }));
    save();
  },
};
