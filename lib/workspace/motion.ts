import { DEVICE_IDS, HOME_POSITIONS } from "./devices";
import type { DeviceId } from "../ports/types";
import { commitLayout, fitView, scene, setDevicePos, setView, zoomAt, type Point, type View } from "./scene";

/** Short eased transitions for discrete actions (buttons, wheel notches, reset). */

let raf = 0;
let wheelTarget: View | null = null;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function stopMotion() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  wheelTarget = null;
}

export function animateTo(target: { view?: View; pos?: Record<DeviceId, Point> }, ms = 260) {
  stopMotion();
  const fromView = { ...scene.view };
  const fromPos = structuredClone(scene.pos);
  const finish = () => {
    if (target.pos) {
      for (const id of DEVICE_IDS) setDevicePos(id, target.pos[id].x, target.pos[id].y);
      commitLayout();
    }
    if (target.view) setView(target.view);
  };
  if (reducedMotion() || ms <= 0) {
    finish();
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const e = easeOut(t);
    if (target.pos) {
      for (const id of DEVICE_IDS) {
        setDevicePos(
          id,
          fromPos[id].x + (target.pos[id].x - fromPos[id].x) * e,
          fromPos[id].y + (target.pos[id].y - fromPos[id].y) * e,
        );
      }
    }
    if (target.view) {
      // interpolate zoom geometrically so the motion feels uniform
      const k = fromView.k * Math.pow(target.view.k / fromView.k, e);
      setView({
        k,
        x: fromView.x + (target.view.x - fromView.x) * e,
        y: fromView.y + (target.view.y - fromView.y) * e,
      });
    }
    if (t < 1) raf = requestAnimationFrame(tick);
    else {
      raf = 0;
      finish();
    }
  };
  raf = requestAnimationFrame(tick);
}

/** Smoothly approach a zoom level about a screen point; repeated calls retarget. */
export function zoomToward(sx: number, sy: number, factor: number) {
  const base = wheelTarget ?? scene.view;
  const target = zoomAt(sx, sy, base.k * factor, base);
  if (reducedMotion()) {
    stopMotion();
    setView(target);
    return;
  }
  if (raf && !wheelTarget) cancelAnimationFrame(raf);
  const running = wheelTarget !== null;
  wheelTarget = target;
  if (running) return;
  let last = performance.now();
  const tick = (now: number) => {
    const goal = wheelTarget;
    if (!goal) return;
    const dt = Math.min(48, now - last);
    last = now;
    const a = 1 - Math.exp(-dt / 55);
    const v = scene.view;
    const k = v.k * Math.pow(goal.k / v.k, a);
    const next = { k, x: v.x + (goal.x - v.x) * a, y: v.y + (goal.y - v.y) * a };
    const done = Math.abs(Math.log(goal.k / k)) < 0.002 && Math.abs(goal.x - next.x) < 0.4 && Math.abs(goal.y - next.y) < 0.4;
    setView(done ? goal : next);
    if (done) {
      raf = 0;
      wheelTarget = null;
    } else raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

export function zoomByStep(direction: 1 | -1) {
  const { w, h } = scene.viewport;
  animateTo({ view: zoomAt(w / 2, h / 2, scene.view.k * (direction > 0 ? 1.3 : 1 / 1.3)) }, 180);
}

export function fitToScreen() {
  animateTo({ view: fitView() });
}

/** Put both instruments back where they started and frame them. */
export function resetLayout() {
  const pos = structuredClone(HOME_POSITIONS);
  const keep = structuredClone(scene.pos);
  // compute the fitted view for the home layout without disturbing the live scene
  for (const id of DEVICE_IDS) scene.pos[id] = pos[id];
  const view = fitView();
  for (const id of DEVICE_IDS) scene.pos[id] = keep[id];
  animateTo({ view, pos }, 320);
}
