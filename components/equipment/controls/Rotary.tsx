"use client";

import { useId, useRef, type CSSProperties, type ReactNode } from "react";
import { useStore } from "@/lib/state/createStore";
import { activeControl } from "@/lib/ui/activeControl";
import { hint } from "@/lib/ui/hint";
import { KnobSlider, TRACK, keyTarget } from "./KnobSlider";

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
  onChange: (value: number) => void;
  format: (value: number) => string;
  /** Starting position: double-click the knob, or the slider's reset button. */
  resetTo?: number;
  /** Value at which the control reads zero, when that is not its lower end stop. */
  origin?: number;
  children?: ReactNode;
}

/** Pointer travel before a press on the knob counts as a drag rather than a click. */
const DRAG_START = 4;

/**
 * A knob. Click it to open a slider beside it; or press and drag sideways (or
 * up/down) to turn it directly, at the slider's scale. Arrow keys nudge it and
 * double-click returns it to `resetTo`. Stepped knobs only ever land on a detent.
 */
export function Rotary({ x, y, r, label, value, steps, onChange, format, resetTo, origin, children }: RotaryProps) {
  const id = useId();
  const el = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  latest.current = value;
  /** How the last press on the knob went, for the click that follows it. */
  const press = useRef({ wasOpen: false, dragged: false });
  const open = useStore(activeControl, (active) => active === id);

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
  const isOpen = () => activeControl.get() === id;
  const close = () => {
    if (isOpen()) activeControl.set(null);
  };
  /** Name and value in a bubble, for when the slider is not there to show them. */
  const showHint = (v: number, hold = 0) => {
    if (isOpen()) return;
    const rect = el.current?.getBoundingClientRect();
    if (rect) hint.show(`${label}  ${format(v)}`, rect.left + rect.width / 2, rect.top, hold);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // never starts an instrument drag
    e.preventDefault();
    const node = e.currentTarget;
    const wasOpen = isOpen();
    hint.hide();
    activeControl.set(id);
    node.setPointerCapture(e.pointerId);
    node.focus({ preventScroll: true });

    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let last = 0; // travel already applied: right and up both turn the knob clockwise
    let position = latest.current; // unrounded, so a stepped knob needs a full step of travel

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const travel = dx - dy;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_START) return;
        dragging = true;
        last = travel; // start from here, so the knob does not jump when the drag is recognised
        node.classList.add("is-turning");
      }
      position = clamp(position + ((travel - last) / TRACK) * max * (ev.shiftKey ? 0.25 : 1));
      last = travel;
      emit(position);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      node.classList.remove("is-turning");
      if (node.hasPointerCapture(ev.pointerId)) node.releasePointerCapture(ev.pointerId);
      press.current = { wasOpen, dragged: dragging };
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      hint.hide();
      activeControl.set(isOpen() ? null : id);
      return;
    }
    const next = keyTarget(e, latest.current, max, !!steps);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    showHint(emit(next), 900);
  };

  const style: CSSProperties = { left: x - r, top: y - r, width: 2 * r, height: 2 * r };

  return (
    <>
      <div
        ref={el}
        className={`control control-rotary ${open ? "is-active" : ""}`}
        style={style}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          // A single plain click on the open knob puts the slider away (not the second click of a double-click).
          if (e.detail === 1 && press.current.wasOpen && !press.current.dragged) close();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (resetTo === undefined) return;
          emit(resetTo);
          activeControl.set(id);
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
      {open && (
        <KnobSlider
          anchor={el}
          label={label}
          value={value}
          max={max}
          stepped={!!steps}
          format={format}
          onInput={emit}
          resetTo={resetTo}
          origin={origin}
          onClose={close}
        />
      )}
    </>
  );
}
