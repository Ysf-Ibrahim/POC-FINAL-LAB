"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { hint } from "@/lib/ui/hint";

interface RotaryProps {
  /** Centre and radius of the grab area, in the instrument's image pixels. */
  x: number;
  y: number;
  r: number;
  label: string;
  /** Continuous controls: 0..1. Stepped controls: the step index. */
  value: number;
  /** Number of detents; omit for a continuous control. */
  steps?: number;
  /** Degrees of rotation between the end stops. */
  sweep?: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  /** Double-click target, e.g. the centre detent. */
  resetTo?: number;
  children?: ReactNode;
}

/**
 * A knob you turn by dragging around its centre, the way the real control is
 * turned. Arrow keys nudge it; double-click returns it to `resetTo`.
 */
export function Rotary({ x, y, r, label, value, steps, sweep = 270, onChange, format, resetTo, children }: RotaryProps) {
  const el = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  latest.current = value;

  const max = steps ? steps - 1 : 1;
  const clamp = (v: number) => Math.min(max, Math.max(0, v));
  const emit = (raw: number) => {
    const next = steps ? Math.round(clamp(raw)) : clamp(raw);
    if (next !== latest.current) {
      latest.current = next;
      onChange(next);
    }
    return next;
  };
  const showHint = (v: number, hold = 0) => {
    const rect = el.current?.getBoundingClientRect();
    if (rect) hint.show(`${label}  ${format(v)}`, rect.left + rect.width / 2, rect.top, hold);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const node = e.currentTarget;
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angleAt = (ev: { clientX: number; clientY: number }) => Math.atan2(ev.clientY - cy, ev.clientX - cx);
    let lastAngle = angleAt(e);
    let position = latest.current; // unrounded position while dragging
    node.setPointerCapture(e.pointerId);
    node.focus({ preventScroll: true });
    showHint(latest.current);

    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - cx, ev.clientY - cy) < 5) return; // too close to the axis to read an angle
      const a = angleAt(ev);
      let d = a - lastAngle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      lastAngle = a;
      position = clamp(position + ((d * 180) / Math.PI / sweep) * max);
      showHint(emit(position));
    };
    const end = (ev: PointerEvent) => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      if (node.hasPointerCapture(ev.pointerId)) node.releasePointerCapture(ev.pointerId);
      hint.hide();
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    showHint(emit(latest.current + dir * (steps ? 1 : e.shiftKey ? 0.1 : 0.02)), 900);
  };

  const style: CSSProperties = { left: x - r, top: y - r, width: 2 * r, height: 2 * r };

  return (
    <div
      ref={el}
      className="control control-rotary"
      style={style}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (resetTo !== undefined) showHint(emit(resetTo), 900);
      }}
      onPointerEnter={(e) => {
        if (e.buttons === 0) showHint(latest.current);
      }}
      onPointerLeave={(e) => {
        if (e.buttons === 0) hint.hide();
      }}
    >
      {children}
    </div>
  );
}
