"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Guide, Question, QuestionSource } from "@/lib/guide/types";

const SOURCE_LABEL: Record<QuestionSource, string> = {
  reported: "Reported in past orals",
  instructor: "Instructor notes",
  manual: "Lab sheet",
  predicted: "Predicted",
};

/** Question text is plain; turn A_m, V_DC, f_c and the like into set subscripts. */
function rich(text: string): ReactNode {
  return text.split(/([A-Za-z]_(?:DC|[a-z]))/g).map((part, i) => {
    const m = /^([A-Za-z])_(.+)$/.exec(part);
    return m ? (
      <span key={i}>
        <var className="g-var">{m[1]}</var>
        <sub>{m[2]}</sub>
      </span>
    ) : (
      part
    );
  });
}

function SourceTag({ source }: { source: QuestionSource }) {
  return <span className={`q-tag q-tag-${source}`}>{SOURCE_LABEL[source]}</span>;
}

/** One question with its short answer; the reasoning stays folded until asked for. */
export function QuestionCard({ question }: { question: Question }) {
  return (
    <article className="q-card">
      <SourceTag source={question.source} />
      <h4>{rich(question.q)}</h4>
      <p className="q-answer">{rich(question.a)}</p>
      {question.more && (
        <details className="q-more">
          <summary>Explanation</summary>
          <p>{rich(question.more)}</p>
        </details>
      )}
    </article>
  );
}

/** The oral questions that belong to one step of a guide. */
export function StepQuestions({ guide, ids }: { guide: Guide; ids: string[] }) {
  const questions = ids.map((id) => guide.questions.find((q) => q.id === id)).filter((q): q is Question => !!q);
  if (!questions.length) return null;
  return (
    <section className="q-group" aria-label="Oral exam questions on this part">
      <h3>
        Oral exam: questions on this part <span>{questions.length}</span>
      </h3>
      {questions.map((q) => (
        <QuestionCard key={q.id} question={q} />
      ))}
    </section>
  );
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One question at a time: think, reveal, move on. */
function SelfTest({ guide }: { guide: Guide }) {
  const [category, setCategory] = useState("all");
  const [order, setOrder] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const ids = useMemo(() => {
    const pool = guide.bank.filter((c) => category === "all" || c.id === category).flatMap((c) => c.questions);
    return order ? order.filter((id) => pool.includes(id)) : pool;
  }, [guide, category, order]);
  const at = Math.min(index, ids.length - 1);
  const question = guide.questions.find((q) => q.id === ids[at]);
  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(ids.length - 1, next)));
    setRevealed(false);
  };

  return (
    <div className="q-test">
      <div className="q-filter" role="group" aria-label="Questions to practise">
        {[{ id: "all", title: "All" }, ...guide.bank.map((c) => ({ id: c.id, title: c.title.replace(/^\d+ · /, "").split(" ")[0] }))].map((c) => (
          <button
            key={c.id}
            type="button"
            className={category === c.id ? "is-on" : ""}
            aria-pressed={category === c.id}
            onClick={() => {
              setCategory(c.id);
              setIndex(0);
              setRevealed(false);
            }}
          >
            {c.title}
          </button>
        ))}
        <button
          type="button"
          className="q-shuffle"
          onClick={() => {
            setOrder(shuffled(guide.bank.flatMap((c) => c.questions)));
            setIndex(0);
            setRevealed(false);
          }}
        >
          Shuffle
        </button>
      </div>
      {question && (
        <article className="q-card q-card-test">
          <div className="q-count">
            Question {at + 1} of {ids.length}
          </div>
          <SourceTag source={question.source} />
          <h4>{rich(question.q)}</h4>
          {revealed ? (
            <>
              <p className="q-answer">{rich(question.a)}</p>
              {question.more && <p className="q-explain">{rich(question.more)}</p>}
            </>
          ) : (
            <>
              <p className="q-think">Say your answer aloud first.</p>
              <button type="button" className="g-button g-button-primary" onClick={() => setRevealed(true)}>
                Reveal answer
              </button>
            </>
          )}
        </article>
      )}
      <div className="q-nav">
        <button type="button" className="g-button" disabled={at === 0} onClick={() => go(at - 1)}>
          Previous question
        </button>
        <button type="button" className="g-button" disabled={at >= ids.length - 1} onClick={() => go(at + 1)}>
          Next question
        </button>
      </div>
    </div>
  );
}

/** The final question bank of a lab: everything to revise, by source, plus a self-test. */
export function ExamBank({ guide }: { guide: Guide }) {
  const [mode, setMode] = useState<"read" | "test">("read");
  const total = guide.bank.reduce((n, c) => n + c.questions.length, 0);
  return (
    <div className="q-bank">
      <div className="q-modes" role="tablist" aria-label="Question bank view">
        <button type="button" role="tab" aria-selected={mode === "read"} className={mode === "read" ? "is-on" : ""} onClick={() => setMode("read")}>
          All {total} questions
        </button>
        <button type="button" role="tab" aria-selected={mode === "test"} className={mode === "test" ? "is-on" : ""} onClick={() => setMode("test")}>
          Test yourself
        </button>
      </div>
      {mode === "test" ? (
        <SelfTest guide={guide} />
      ) : (
        guide.bank.map((category) => (
          <section key={category.id} className="q-category">
            <h3>
              {category.title} <span>{category.questions.length}</span>
            </h3>
            <p className="q-note">{category.note}</p>
            {category.questions.map((id) => {
              const q = guide.questions.find((x) => x.id === id);
              return q ? <QuestionCard key={id} question={q} /> : null;
            })}
          </section>
        ))
      )}
    </div>
  );
}
