"use client";

import { useId, useState, type ReactNode } from "react";
import type { Bench } from "@/lib/guide/bench";
import { useBench } from "./useBench";

/**
 * "Measure it yourself": the student types the value read off the
 * oscilloscope; the tool compares it with the real signal on the bench and
 * shows the working. It reads the bench; it never changes it.
 */
export function Measure({
  label,
  unit,
  truth,
  working,
  precondition,
  tolerance = 0.08,
  hint,
}: {
  label: string;
  unit: string;
  /** The true value, in `unit`, or null when there is nothing to measure. */
  truth: (b: Bench) => number | null;
  /** The worked measurement for the current bench and scope settings. */
  working: (b: Bench, value: number) => ReactNode;
  /** A reason the measurement cannot be taken yet, or null. */
  precondition?: (b: Bench) => string | null;
  /** Relative tolerance. */
  tolerance?: number;
  /** Shown after a wrong answer. */
  hint?: ReactNode;
}) {
  const id = useId();
  const bench = useBench();
  const [text, setText] = useState("");
  const [shown, setShown] = useState<"check" | "answer" | null>(null);
  const wait = precondition?.(bench) ?? null;
  const value = wait ? null : truth(bench);
  const entered = Number(text.replace(",", "."));
  const close = value !== null && Number.isFinite(entered) && Math.abs(entered - value) <= Math.abs(value) * tolerance;

  return (
    <section className="measure" aria-label={label}>
      <div className="quiz-label">Your measurement · {label}</div>
      {wait ? (
        <p className="measure-wait">{wait}</p>
      ) : (
        <>
          <div className="quiz-row">
            <label htmlFor={id} className="sr-only">
              {label} in {unit}
            </label>
            <input
              id={id}
              className="quiz-input"
              inputMode="decimal"
              placeholder="Measured"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setShown(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim()) setShown("check");
              }}
            />
            <span className="quiz-unit">{unit}</span>
            <button type="button" className="g-button" disabled={!text.trim()} onClick={() => setShown("check")}>
              Check
            </button>
            <button type="button" className="quiz-again" onClick={() => setShown("answer")}>
              Show me
            </button>
          </div>
          {shown && (
            <div className={`quiz-feedback ${shown === "check" ? (close ? "is-right" : "is-wrong") : ""}`} role="status">
              {shown === "check" && (close ? <strong>Good measurement. </strong> : <strong>Not quite. </strong>)}
              {value === null ? "There is nothing to measure on that socket." : working(bench, value)}
              {shown === "check" && !close && value !== null && hint && <p>{hint}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
