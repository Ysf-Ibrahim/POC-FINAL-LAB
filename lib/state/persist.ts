import { cableActions, cableStore } from "../cables/store";
import { controlActions, controlsStore } from "../controls/store";
import { on, restoreLayout, scene } from "../workspace/scene";

/**
 * Remembers the bench (instrument positions, leads, front-panel settings) in
 * the browser so a reload does not undo a student's work. Nothing leaves the
 * device.
 */
const KEY = "virtual-comm-lab:bench:v1";
/**
 * Format of the saved wiring. 3 = every oscilloscope input has a signal node
 * and a ground node. Anything older is converted on load (see cableActions.hydrate).
 */
const WIRING_VERSION = 3;

export function loadBench() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved?.pos) restoreLayout(saved.pos);
    if (Array.isArray(saved?.cables)) cableActions.hydrate(saved.cables, saved.v !== WIRING_VERSION);
    if (saved?.controls) controlActions.hydrate(saved.controls);
  } catch {
    // Unavailable or corrupt storage: start from a clean bench.
  }
}

export function startAutosave(): () => void {
  let timer = 0;
  const save = () => {
    timer = 0;
    try {
      window.localStorage.setItem(
        KEY,
        JSON.stringify({ v: WIRING_VERSION, pos: scene.pos, cables: cableStore.get().cables, controls: controlsStore.get() }),
      );
    } catch {
      // Storage full or blocked: the bench still works for this session.
    }
  };
  const schedule = () => {
    if (!timer) timer = window.setTimeout(save, 400);
  };
  const offs = [on("layout", schedule), cableStore.subscribe(schedule), controlsStore.subscribe(schedule)];
  return () => {
    offs.forEach((off) => off());
    if (timer) {
      window.clearTimeout(timer);
      save();
    }
  };
}
