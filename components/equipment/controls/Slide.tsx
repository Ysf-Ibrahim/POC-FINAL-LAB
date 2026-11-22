"use client";

import { hint } from "@/lib/ui/hint";

interface SlideProps {
  /** Centre of the slot, in the instrument's image pixels. */
  x: number;
  y: number;
  /** Slot length along its travel and its thickness. */
  length: number;
  thickness: number;
  vertical?: boolean;
  label: string;
  /** Position names in travel order (left→right or top→bottom). */
  positions: string[];
  value: number;
  onChange: (value: number) => void;
  /** Positions that exist on the panel but have no modelled behaviour. */
  disabled?: number[];
  /** Panel colour around the switch, used to cover the photographed handle. */
  panel: string;
  slot: string;
  /** "round": oscilloscope slide switch. "square": miniature PCB slide switch. */
  variant?: "round" | "square";
}

/**
 * Slide switch redrawn over the photograph so its handle can move.
 * Click a position to select it, or click the handle to advance.
 */
export function Slide({
  x,
  y,
  length,
  thickness,
  vertical,
  label,
  positions,
  value,
  onChange,
  disabled = [],
  panel,
  slot,
  variant = "round",
}: SlideProps) {
  const n = positions.length;
  const handle = thickness * 0.78;
  const travel = length - handle - thickness * 0.2;
  const offsetAt = (i: number) => (n > 1 ? (i / (n - 1) - 0.5) * travel : 0);
  const pad = 7;
  const w = (vertical ? thickness : length) + pad * 2;
  const h = (vertical ? length : thickness) + pad * 2 + (vertical ? 0 : 5);

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const t = vertical ? (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width;
    const along = (t - 0.5) * (vertical ? h : w); // image px from the slot centre
    let next = Math.min(n - 1, Math.max(0, Math.round((along / travel + 0.5) * (n - 1))));
    if (next === value) next = (value + 1) % n; // clicking the handle advances it
    let guard = 0;
    while (disabled.includes(next) && guard++ < n) next = (next + 1) % n;
    if (disabled.includes(next)) return;
    onChange(next);
    hint.show(`${label}  ${positions[next]}`, rect.left + rect.width / 2, rect.top, 900);
  };

  const off = offsetAt(value);
  return (
    <div
      className={`control control-slide slide-${variant}`}
      style={{ left: x - w / 2, top: y - (vertical ? h / 2 : thickness / 2 + pad), width: w, height: h }}
      role="radiogroup"
      aria-label={`${label}: ${positions[value]}`}
      tabIndex={0}
      onPointerDown={pick}
      onPointerEnter={(e) => {
        if (e.buttons !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        hint.show(`${label}  ${positions[value]}`, rect.left + rect.width / 2, rect.top);
      }}
      onPointerLeave={(e) => {
        if (e.buttons === 0) hint.hide();
      }}
      onKeyDown={(e) => {
        const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        let next = value + dir;
        while (disabled.includes(next)) next += dir;
        if (next >= 0 && next < n) onChange(next);
      }}
    >
      <span className="slide-cover" style={{ background: panel, boxShadow: `0 0 4px 3px ${panel}` }} />
      <span
        className="slide-slot"
        style={{
          left: pad,
          top: pad,
          width: vertical ? thickness : length,
          height: vertical ? length : thickness,
          background: slot,
        }}
      />
      <span
        className="slide-handle"
        style={{
          width: handle,
          height: handle,
          left: pad + (vertical ? thickness / 2 : length / 2 + off) - handle / 2,
          top: pad + (vertical ? length / 2 + off : thickness / 2) - handle / 2,
        }}
      />
    </div>
  );
}
