"use client";

import { useEffect, useRef } from "react";
import { EmonaTrainer } from "@/components/equipment/EmonaTrainer";
import { PromaxOscilloscope } from "@/components/equipment/PromaxOscilloscope";
import { CableLayer } from "@/components/wiring/CableLayer";
import { WireToolbar } from "@/components/wiring/WireToolbar";
import { connectionNote, portTitle } from "@/lib/cables/feedback";
import { cableActions, cableStore } from "@/lib/cables/store";
import { wiring } from "@/lib/cables/wiring";
import type { PortDef } from "@/lib/ports/types";
import { loadBench, startAutosave } from "@/lib/state/persist";
import { hint } from "@/lib/ui/hint";
import { fitToScreen, stopMotion, zoomByStep, zoomToward } from "@/lib/workspace/motion";
import {
  findPortAt,
  fitView,
  on,
  portRadius,
  portWorld,
  scene,
  screenToWorld,
  setView,
  setViewport,
  zoomAt,
} from "@/lib/workspace/scene";
import { MovableEquipment } from "./MovableEquipment";
import { ScopeReadout } from "./ScopeReadout";
import { ViewControls } from "./ViewControls";

/**
 * The bench: a pannable, zoomable surface holding both instruments and the
 * patch leads. All continuous gestures (pan, zoom, drag, routing a lead) are
 * handled with pointer events and written to the DOM directly.
 */
export function LabWorkspace() {
  const stage = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stageEl = stage.current!;
    const worldEl = world.current!;
    let settleTimer = 0;

    // ---- view → DOM ----
    const applyView = () => {
      const { x, y, k } = scene.view;
      worldEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
      // Bench texture follows the view. Keep the dot pitch readable at any zoom.
      let pitch = 28 * k;
      while (pitch < 18) pitch *= 2;
      while (pitch > 72) pitch /= 2;
      stageEl.style.backgroundSize = `${pitch}px ${pitch}px`;
      stageEl.style.backgroundPosition = `${x}px ${y}px`;
      // Promote the layer only while it is moving; when it settles the browser
      // re-rasterises at the new scale so photographs and leads stay sharp.
      if (!settleTimer) worldEl.style.willChange = "transform";
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = 0;
        worldEl.style.willChange = "";
        stageEl.style.setProperty("--zoom", String(k));
        window.dispatchEvent(new CustomEvent("bench:settled"));
      }, 140);
    };
    const offView = on("view", applyView);

    // ---- size ----
    let fitted = false;
    const measure = () => {
      const r = stageEl.getBoundingClientRect();
      setViewport(r.width, r.height);
      if (!fitted && r.width > 0) {
        fitted = true;
        loadBench();
        setView(fitView());
        applyView();
        stageEl.dataset.ready = "true";
      } else {
        setView({ ...scene.view });
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(stageEl);
    const stopAutosave = startAutosave();

    const local = (e: { clientX: number; clientY: number }) => {
      const r = stageEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const worldAt = (e: { clientX: number; clientY: number }) => {
      const p = local(e);
      return screenToWorld(p.x, p.y);
    };

    // ---- wheel: pinch / ctrl = zoom, mouse wheel = zoom, two-finger scroll = pan ----
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY ?? 0;
      const mouseWheel =
        e.deltaMode === 1 || (e.deltaX === 0 && legacy !== 0 && Math.abs(legacy) >= 120 && legacy % 120 === 0);
      if (e.ctrlKey || e.metaKey) {
        stopMotion();
        setView(zoomAt(p.x, p.y, scene.view.k * Math.exp(-e.deltaY * 0.012)));
      } else if (mouseWheel) {
        zoomToward(p.x, p.y, Math.exp(-Math.sign(e.deltaY) * 0.22));
      } else {
        stopMotion();
        setView({ ...scene.view, x: scene.view.x - e.deltaX, y: scene.view.y - e.deltaY });
      }
    };
    stageEl.addEventListener("wheel", onWheel, { passive: false });

    // Safari trackpad pinch
    let gestureBase = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureBase = scene.view.k;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      const p = local(g);
      setView(zoomAt(p.x, p.y, gestureBase * g.scale));
    };
    stageEl.addEventListener("gesturestart", onGestureStart);
    stageEl.addEventListener("gesturechange", onGestureChange);

    // ---- touch pinch ----
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; k: number } | null = null;

    // ---- routing a lead ----
    let downAt: { x: number; y: number } | null = null;
    let wirePointer = -1;

    const cancelWire = () => {
      wirePointer = -1;
      downAt = null;
      if (wiring.pending) wiring.setPending(null);
    };

    // ---- labels: name the connector under the pointer, and explain doubtful leads ----
    let labelled: string | null = null;
    let labelTimer = 0;
    let labelShown = false;
    const above = (port: PortDef) => {
      const r = stageEl.getBoundingClientRect();
      const w = portWorld(port);
      const v = scene.view;
      return { x: r.left + v.x + w.x * v.k, y: r.top + v.y + (w.y - portRadius(port)) * v.k - 2 };
    };
    const labelPort = (port: PortDef | null, immediate = false) => {
      const id = port?.id ?? null;
      if (id === labelled) return;
      labelled = id;
      window.clearTimeout(labelTimer);
      if (labelShown) {
        hint.hide();
        labelShown = false;
      }
      if (!port) return;
      const show = () => {
        const p = above(port);
        hint.show(portTitle(port), p.x, p.y);
        labelShown = true;
      };
      if (immediate) show();
      else labelTimer = window.setTimeout(show, 240);
    };
    /** Make the lead and, if it needs saying, say what it did. */
    const join = (from: string, to: PortDef) => {
      const result = cableActions.connect(from, to.id);
      const note = connectionNote(from, to.id, result);
      window.clearTimeout(labelTimer);
      labelled = to.id; // keep the note up while the pointer rests on this connector
      labelShown = false;
      if (note) {
        const p = above(to);
        hint.show(note, p.x, p.y, 5200);
      } else hint.hide();
    };

    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        touches.set(e.pointerId, local(e));
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: scene.view.k };
          scene.pinching = true;
          cancelWire();
          e.stopPropagation();
          return;
        }
      }
      if (e.button !== 0) return;
      const w = worldAt(e);
      const port = findPortAt(w.x, w.y);
      const pending = wiring.pending;

      // second click of click-to-click routing
      if (pending && !pending.dragging) {
        e.stopPropagation();
        e.preventDefault();
        if (port && port.id !== pending.from) join(pending.from, port);
        cancelWire();
        return;
      }
      if (!port) return;
      e.stopPropagation();
      e.preventDefault();
      stopMotion();
      if (cableStore.get().tool === "remove") {
        const attached = cableStore.get().cables.filter((c) => c.a === port.id || c.b === port.id);
        if (attached.length) cableActions.remove(attached[attached.length - 1].id);
        return;
      }
      cableActions.select(null);
      downAt = { x: e.clientX, y: e.clientY };
      wirePointer = e.pointerId;
      stageEl.setPointerCapture(e.pointerId);
      wiring.setPending({ from: port.id, end: w, snap: null, dragging: true });
    };
    stageEl.addEventListener("pointerdown", onPointerDownCapture, { capture: true });

    // ---- pan (pointerdown that nothing else claimed) ----
    let pan: { id: number; sx: number; sy: number; vx: number; vy: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (pinch) return;
      // Instruments and leads handle their own presses (middle button always pans).
      if (e.button === 0 && (e.target as Element).closest(".equipment, .cable")) return;
      stopMotion();
      labelPort(null);
      cableActions.select(null);
      pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: scene.view.x, vy: scene.view.y };
      stageEl.setPointerCapture(e.pointerId);
      stageEl.classList.add("is-panning");
    };
    stageEl.addEventListener("pointerdown", onPointerDown);

    let hoverFrame = 0;
    let lastMove: PointerEvent | null = null;
    const updateHover = () => {
      hoverFrame = 0;
      const e = lastMove;
      if (!e) return;
      const w = worldAt(e);
      const port = findPortAt(w.x, w.y);
      const pending = wiring.pending;
      if (pending) {
        const snap = port && port.id !== pending.from ? port : null;
        wiring.setPending({ ...pending, end: w, snap: snap?.id ?? null });
        labelPort(snap, true);
      } else {
        const overBench = e.buttons === 0 && (e.target as Element | null)?.closest?.(".stage") === stageEl;
        wiring.setHover(overBench && port ? port.id : null);
        labelPort(overBench ? port : null);
      }
      stageEl.classList.toggle("over-port", !!port);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" && touches.has(e.pointerId)) {
        touches.set(e.pointerId, local(e));
        if (pinch && touches.size >= 2) {
          const [a, b] = [...touches.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          setView(zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.k * (dist / pinch.dist)));
          return;
        }
      }
      if (pan && e.pointerId === pan.id) {
        setView({ ...scene.view, x: pan.vx + (e.clientX - pan.sx), y: pan.vy + (e.clientY - pan.sy) });
        return;
      }
      lastMove = e;
      if (!hoverFrame) hoverFrame = requestAnimationFrame(updateHover);
    };
    stageEl.addEventListener("pointermove", onPointerMove);

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        touches.delete(e.pointerId);
        if (touches.size < 2) {
          pinch = null;
          scene.pinching = false;
        }
      }
      if (pan && e.pointerId === pan.id) {
        pan = null;
        stageEl.classList.remove("is-panning");
        if (stageEl.hasPointerCapture(e.pointerId)) stageEl.releasePointerCapture(e.pointerId);
        return;
      }
      const pending = wiring.pending;
      if (pending?.dragging && e.pointerId === wirePointer) {
        if (stageEl.hasPointerCapture(e.pointerId)) stageEl.releasePointerCapture(e.pointerId);
        const w = worldAt(e);
        const port = findPortAt(w.x, w.y);
        const travelled = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 99;
        if (port && port.id !== pending.from) {
          join(pending.from, port);
          cancelWire();
        } else if (travelled < 6 && e.type === "pointerup") {
          // a click: keep the lead in hand until the next click
          wiring.setPending({ ...pending, dragging: false });
        } else {
          cancelWire();
        }
      }
    };
    stageEl.addEventListener("pointerup", onPointerUp);
    stageEl.addEventListener("pointercancel", onPointerUp);

    const onPointerLeave = () => {
      labelPort(null);
      if (!wiring.pending) wiring.setHover(null);
      stageEl.classList.remove("over-port");
    };
    stageEl.addEventListener("pointerleave", onPointerLeave);

    // ---- keyboard ----
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        if (wiring.pending) cancelWire();
        else if (cableStore.get().selected) cableActions.select(null);
        else if (cableStore.get().tool === "remove") cableActions.setTool("wire");
      } else if ((e.key === "Delete" || e.key === "Backspace") && cableStore.get().selected) {
        e.preventDefault();
        cableActions.remove(cableStore.get().selected!);
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        cableActions.undo();
      } else if (!mod && (e.key === "+" || e.key === "=")) {
        zoomByStep(1);
      } else if (!mod && (e.key === "-" || e.key === "_")) {
        zoomByStep(-1);
      } else if (!mod && e.key === "0") {
        fitToScreen();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      offView();
      ro.disconnect();
      stopAutosave();
      stopMotion();
      window.clearTimeout(settleTimer);
      window.clearTimeout(labelTimer);
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      stageEl.removeEventListener("wheel", onWheel);
      stageEl.removeEventListener("gesturestart", onGestureStart);
      stageEl.removeEventListener("gesturechange", onGestureChange);
      stageEl.removeEventListener("pointerdown", onPointerDownCapture, { capture: true });
      stageEl.removeEventListener("pointerdown", onPointerDown);
      stageEl.removeEventListener("pointermove", onPointerMove);
      stageEl.removeEventListener("pointerup", onPointerUp);
      stageEl.removeEventListener("pointercancel", onPointerUp);
      stageEl.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="bench">
      <div ref={stage} className="stage" role="application" aria-label="Laboratory bench">
        <div ref={world} className="world">
          <MovableEquipment id="scope">
            <PromaxOscilloscope />
          </MovableEquipment>
          <MovableEquipment id="emona">
            <EmonaTrainer />
          </MovableEquipment>
          <CableLayer />
        </div>
      </div>
      <WireToolbar />
      <ViewControls />
      <ScopeReadout />
    </div>
  );
}
