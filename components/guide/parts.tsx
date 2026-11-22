import type { ReactNode } from "react";

/** Building blocks for guide content. Plain markup; all styling lives in globals.css. */

/** A displayed equation. Write variables with <V>. */
export function Eq({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="g-eq" role="math" aria-label={label}>
      {children}
    </div>
  );
}

/** A variable name inside text or an equation. */
export function V({ children }: { children: ReactNode }) {
  return <var className="g-var">{children}</var>;
}

export function Frac({ n, d }: { n: ReactNode; d: ReactNode }) {
  return (
    <span className="g-frac">
      <span className="g-frac-n">{n}</span>
      <span className="g-frac-d">{d}</span>
    </span>
  );
}

const NOTE_TITLES = {
  key: "Key idea",
  hardware: "On this trainer",
  scope: "Reading the scope",
  exam: "For the oral",
  caution: "Careful",
} as const;

/** A short call-out. `hardware` marks where the real equipment differs from the simple theory. */
export function Note({ tone = "key", title, children }: { tone?: keyof typeof NOTE_TITLES; title?: string; children: ReactNode }) {
  return (
    <aside className={`g-note g-note-${tone}`}>
      <strong>{title ?? NOTE_TITLES[tone]}</strong>
      <div>{children}</div>
    </aside>
  );
}

export function Figure({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className="g-fig">
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** Term / meaning pairs, e.g. the parts of an equation. */
export function Terms({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="g-terms">
      {items.map(([term, meaning], i) => (
        <div key={i}>
          <dt>{term}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A value to set on the equipment, shown as a compact table. */
export function Settings({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="g-settings">
      <tbody>
        {rows.map(([name, value]) => (
          <tr key={name}>
            <th scope="row">{name}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One concept, taught in a fixed order: the question, the idea in plain words
 * (children, usually with a figure), the numbers, where it lives on the bench,
 * the answer to give in the oral, and a check of understanding.
 */
export function Lesson({
  ask,
  children,
  numbers,
  bench,
  oral,
  check,
}: {
  ask: ReactNode;
  children: ReactNode;
  numbers?: ReactNode;
  bench?: ReactNode;
  oral?: ReactNode;
  check?: ReactNode;
}) {
  return (
    <div className="lesson">
      <p className="lesson-ask">{ask}</p>
      {children}
      {numbers && (
        <aside className="g-note g-note-numbers">
          <strong>In numbers</strong>
          <div>{numbers}</div>
        </aside>
      )}
      {bench && (
        <aside className="g-note g-note-hardware">
          <strong>On the trainer</strong>
          <div>{bench}</div>
        </aside>
      )}
      {oral && (
        <aside className="g-note g-note-exam">
          <strong>Say it in the oral</strong>
          <div>{oral}</div>
        </aside>
      )}
      {check}
    </div>
  );
}
