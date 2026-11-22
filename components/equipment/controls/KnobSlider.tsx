"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { on } from "@/lib/workspace/scene";

/** Slider travel in screen px. A sideways drag on the knob itself uses the same scale. */
export const TRACK = 184;
/** Arrow-key step of a continuous control, as a fraction of its travel. */
export const KEY_STEP = 0.01;
export const KEY_STEP_COARSE = 0.1;

const GAP = 10;
const MARGIN = 8;
const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** Arrow / Home / End handling shared by the knob and its slider. Returns the new raw value, or null. */
export function keyTarget(e: { key: string; shiftKey: boolean }, value: number, max: number, stepped: boolean) {
  const step = stepped ? 1 : (e.shiftKey ? KEY_STEP_COARSE : KEY_STEP) * max;
  switch (e.key) {
    case "ArrowRight":
    case "ArrowUp":
      return value + step;
    case "ArrowLeft":
    case "ArrowDown":
      return value - step;
    case "PageUp":
      return value + (stepped ? 1 : KEY_STEP_COARSE * max);
    case "PageDown":
      return value - (stepped ? 1 : KEY_STEP_COARSE * max);
    case "Home":
      return 0;
    case "End":
      return max;
    default:
      return null;
  }
}

interface KnobSliderProps {
  /** The knob this slider belongs to; the slider stays beside it. */
  anchor: RefObject<HTMLElement | null>;
  label: string;
  value: number;
  /** Top of the range: 1 for a continuous control, last index for a stepped one. */
  max: number;
  stepped: boolean;
  format: (value: number) => string;
  /** Receives a raw (unrounded, unclamped) value; the knob applies its own limits. */
  onInput: (raw: number) => void;
  resetTo?: number;
  /** Value the fill grows from, for controls with a centre zero. */
  origin?: number;
  onClose: () => void;
}

/**
 * The slider that opens beside a knob. It is drawn in screen space (outside the
 * zoomed bench) so it keeps one size at any zoom, and follows its knob when the
 * bench is panned, zoomed or the instrument is moved.
 */
export function KnobSlider({ anchor, label, value, max, stepped, format, onInput, resetTo, origin, onClose }: KnobSliderProps) {
  const root = useRef<HTMLDivElement>(null);
  const live = useRef({ value, onInput, onClose });
  live.current = { value, onInput, onClose };

  // ---- position: beside the knob, on the side that hides least ----
  useLayoutEffect(() => {
    const el = root.current;
    const knob = anchor.current;
    if (!el || !knob) return;
    /** Chosen placement: a side of the knob and one of that side's alignments. */
    let spot: { side: Side; align: number } | null = null;

    const place = () => {
      const a = boxOf(knob);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (a.x + a.w < 0 || a.y + a.h < 0 || a.x > vw || a.y > vh) {
        live.current.onClose(); // the knob has left the screen
        return;
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const cx = a.x + a.w / 2;
      const cy = a.y + a.h / 2;
      // Along the knob's side the slider may sit centred, flush with either end, or
      // (beside the knob) step up or down past it, whichever hides least.
      const aligns = (s: Side) =>
        s === "left" || s === "right"
          ? [cy - h / 2, a.y + a.h - h, a.y, a.y - h + 8, a.y + a.h - 8]
          : [cx - w / 2, a.x, a.x + a.w - w];
      const at = (s: Side, align: number): Box => {
        const across = aligns(s)[align];
        const x = s === "left" ? a.x - GAP - w : s === "right" ? a.x + a.w + GAP : across;
        const y = s === "top" ? a.y - GAP - h : s === "bottom" ? a.y + a.h + GAP : across;
        return {
          x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, vw - w - MARGIN)),
          y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, vh - h - MARGIN)),
          w,
          h,
        };
      };
      const keepClear: Box = { x: a.x - 3, y: a.y - 3, w: a.w + 6, h: a.h + 6 };
      let box = spot ? at(spot.side, spot.align) : null;
      // Choose a place when opening, and again only if the current one would cover the knob.
      if (!box || overlap(box, keepClear) > 0) {
        const screen = document.querySelector(".scope-screen");
        const devices = [...document.querySelectorAll(".equipment")].map(boxOf);
        const chrome = [...document.querySelectorAll(".toolbar, .viewbar, .menu-button, .readout, .lab-note, .guide, .guide-pill")].map(boxOf);
        const parts = [...document.querySelectorAll(".control, .input-nodes")].filter((c) => c !== knob).map(boxOf);
        let best = Infinity;
        for (const s of SIDES) {
          for (let align = 0; align < aligns(s).length; align++) {
            const b = at(s, align);
            let cost = overlap(b, keepClear) * 1000;
            if (screen) cost += overlap(b, boxOf(screen)) * 30; // never hide the trace being adjusted
            for (const c of chrome) cost += overlap(b, c) * 30;
            for (const p of parts) cost += overlap(b, p) * 6; // other controls and the input nodes stay reachable
            for (const d of devices) cost += overlap(b, d);
            cost += Math.hypot(b.x + w / 2 - cx, b.y + h / 2 - cy) * 6; // all else equal, stay close and centred
            if (cost < best - 1) {
              best = cost;
              spot = { side: s, align };
              box = b;
            }
          }
        }
      }
      if (box) el.style.transform = `translate3d(${Math.round(box.x)}px, ${Math.round(box.y)}px, 0)`;
    };

    place();
    el.style.visibility = "visible";
    const offs = [on("view", place), on("device", place), on("layout", place)];
    window.addEventListener("resize", place);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  // ---- close on outside press and Escape; scroll over the slider to adjust ----
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (el.contains(t) || anchor.current?.contains(t))) return;
      live.current.onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (el.contains(document.activeElement)) anchor.current?.focus({ preventScroll: true });
      live.current.onClose();
    };
    let carry = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : -e.deltaY;
      if (!raw) return;
      const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY ?? 0;
      const notch = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(legacy) >= 120 && legacy % 120 === 0);
      const cur = live.current.value;
      if (stepped) {
        carry += notch ? Math.sign(raw) * 40 : raw;
        const n = Math.trunc(carry / 40);
        if (n) {
          carry -= n * 40;
          live.current.onInput(cur + n);
        }
      } else {
        live.current.onInput(cur + (notch ? Math.sign(raw) * KEY_STEP : raw / 900) * max);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      el.removeEventListener("wheel", onWheel);
    };
  }, [anchor, max, stepped]);

  const onTrackDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const node = e.currentTarget;
    const left = node.getBoundingClientRect().left;
    const thumbX = left + (live.current.value / max) * TRACK;
    // Grabbing the thumb keeps it under the pointer; pressing the rail brings it to the pointer.
    const grab = Math.abs(e.clientX - thumbX) <= 11 ? e.clientX - thumbX : 0;
    const apply = (ev: { clientX: number }) => live.current.onInput(((ev.clientX - grab - left) / TRACK) * max);
    node.setPointerCapture(e.pointerId);
    node.focus({ preventScroll: true });
    if (!grab) apply(e);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId === e.pointerId) apply(ev);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      if (node.hasPointerCapture(ev.pointerId)) node.releasePointerCapture(ev.pointerId);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  };

  const onTrackKey = (e: React.KeyboardEvent) => {
    const next = keyTarget(e, value, max, stepped);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onInput(next);
  };

  const x = (value / max) * TRACK;
  const from = origin === undefined ? 0 : (origin / max) * TRACK;
  const canReset = resetTo !== undefined;

  return createPortal(
    <div
      ref={root}
      className="knob-slider"
      role="group"
      aria-label={`${label} slider`}
      style={{ visibility: "hidden" }}
      // The portal still bubbles React events to the instrument: keep presses here from dragging it.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="ks-head">
        <span className="ks-label">{label}</span>
        <output className="ks-value">{format(value)}</output>
        {canReset && (
          <button
            type="button"
            className="ks-reset"
            aria-label={`Reset ${label}`}
            title="Back to the starting position"
            disabled={value === resetTo}
            onClick={() => onInput(resetTo)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2.2 6a3.8 3.8 0 1 0 1.2-2.8" />
              <path d="M2 1.6v2h2" />
            </svg>
          </button>
        )}
      </div>
      <div
        className="ks-track"
        style={{ width: TRACK }}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onPointerDown={onTrackDown}
        onKeyDown={onTrackKey}
      >
        <span className="ks-rail" />
        {!stepped && <span className="ks-fill" style={{ left: Math.min(from, x), width: Math.abs(x - from) }} />}
        {stepped &&
          Array.from({ length: max + 1 }, (_, i) => (
            <span key={i} className={`ks-tick ${i === value ? "is-on" : ""}`} style={{ left: (i / max) * TRACK }} />
          ))}
        {!stepped && canReset && <span className="ks-mark" style={{ left: (resetTo / max) * TRACK }} />}
        <span className="ks-thumb" style={{ transform: `translate3d(${x.toFixed(2)}px, 0, 0)` }} />
      </div>
    </div>,
    document.body,
  );
}
