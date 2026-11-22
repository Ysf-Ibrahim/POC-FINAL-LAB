"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * "Check my understanding" interactions. They never block: the student can
 * answer, try again, or simply move on with Next. A wrong answer is explained,
 * not marked down.
 */

export interface Option {
  text: string;
  correct?: boolean;
  /** Why this option is right, or the misconception behind it if it is wrong. */
  why: string;
}

function Shell({ children, label = "Check my understanding" }: { children: ReactNode; label?: string }) {
  return (
    <section className="quiz" aria-label={label}>
      <div className="quiz-label">{label}</div>
      {children}
    </section>
  );
}

/** One question, several answers; feedback for whichever answer is picked. */
export function Choice({ q, options }: { q: ReactNode; options: Option[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = options.findIndex((o) => o.correct);
  const chosen = picked === null ? null : options[picked];
  return (
    <Shell>
      <p className="quiz-q">{q}</p>
      <div className="quiz-options" role="group">
        {options.map((o, i) => {
          const state = picked === null ? "" : i === picked ? (o.correct ? "is-right" : "is-wrong") : o.correct && picked !== null && !options[picked].correct ? "is-answer" : "";
          return (
            <button key={o.text} type="button" className={`quiz-option ${state}`} aria-pressed={picked === i} onClick={() => setPicked(i)}>
              {o.text}
            </button>
          );
        })}
      </div>
      {chosen && (
        <div className={`quiz-feedback ${chosen.correct ? "is-right" : "is-wrong"}`} role="status">
          <strong>{chosen.correct ? "Right." : "Not quite."}</strong> {chosen.why}
          {!chosen.correct && right >= 0 && (
            <p>
              <strong>The answer:</strong> {options[right].text}. {options[right].why}
            </p>
          )}
          {!chosen.correct && (
            <button type="button" className="quiz-again" onClick={() => setPicked(null)}>
              Try again
            </button>
          )}
        </div>
      )}
    </Shell>
  );
}

/** A numerical question: type a value, compare within a tolerance. */
export function NumberAnswer({
  q,
  answer,
  unit,
  tolerance = 0.03,
  explain,
}: {
  q: ReactNode;
  answer: number;
  unit: string;
  /** Relative tolerance. */
  tolerance?: number;
  /** The worked solution. */
  explain: ReactNode;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [result, setResult] = useState<"right" | "wrong" | "shown" | null>(null);
  const check = () => {
    const v = Number(text.replace(",", "."));
    if (!Number.isFinite(v) || text.trim() === "") return;
    setResult(Math.abs(v - answer) <= Math.abs(answer) * tolerance ? "right" : "wrong");
  };
  return (
    <Shell>
      <label className="quiz-q" htmlFor={id}>
        {q}
      </label>
      <div className="quiz-row">
        <input
          id={id}
          className="quiz-input"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (result === "wrong") setResult(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") check();
          }}
          placeholder="Your answer"
        />
        <span className="quiz-unit">{unit}</span>
        <button type="button" className="g-button" onClick={check}>
          Check
        </button>
        <button type="button" className="quiz-again" onClick={() => setResult("shown")}>
          Show the working
        </button>
      </div>
      {result && (
        <div className={`quiz-feedback ${result === "right" ? "is-right" : result === "wrong" ? "is-wrong" : ""}`} role="status">
          {result === "right" && <strong>Right. </strong>}
          {result === "wrong" && <strong>Not quite. </strong>}
          {explain}
        </div>
      )}
    </Shell>
  );
}
