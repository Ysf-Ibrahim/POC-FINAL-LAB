"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { DEVICES } from "@/lib/workspace/devices";
import type { DeviceId } from "@/lib/ports/types";
import { commitLayout, on, scene, setDevicePos } from "@/lib/workspace/scene";

/**
 * An instrument on the bench. Dragging writes a CSS transform straight to the
 * element (one write per animation frame); React is not involved until the
 * instrument is put down.
 */
export function MovableEquipment({ id, children }: { id: DeviceId; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const spec = DEVICES[id];

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const apply = () => {
      const p = scene.pos[id];
      node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    };
    apply();
    const offDevice = on("device", (moved) => {
      if (moved === id) apply();
    });
    const offLayout = on("layout", apply);
    return () => {
      offDevice();
      offLayout();
    };
  }, [id]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const node = el.current;
    if (!node) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...scene.pos[id] };
    let lastX = startX;
    let lastY = startY;
    let frame = 0;
    let moved = false;

    const flush = () => {
      frame = 0;
      const k = scene.view.k;
      setDevicePos(id, origin.x + (lastX - startX) / k, origin.y + (lastY - startY) / k);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId || scene.pinching) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!moved && Math.hypot(lastX - startX, lastY - startY) > 2) {
        moved = true;
        node.classList.add("is-dragging");
      }
      if (moved && !frame) frame = requestAnimationFrame(flush);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      if (frame) {
        cancelAnimationFrame(frame);
        flush();
      }
      node.classList.remove("is-dragging");
      if (node.hasPointerCapture(ev.pointerId)) node.releasePointerCapture(ev.pointerId);
      if (moved) commitLayout();
    };

    node.setPointerCapture(e.pointerId);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  };

  return (
    <div
      ref={el}
      className="equipment"
      data-device={id}
      style={{ width: spec.width, height: spec.height, borderRadius: spec.corner }}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}
