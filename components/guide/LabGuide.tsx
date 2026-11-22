"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Bench } from "@/lib/guide/bench";
import { guideActions, guideStore, highlightStore } from "@/lib/guide/store";
import type { Check, CheckResult, Guide, Highlight, StepKind } from "@/lib/guide/types";
import { hasGuide, loadGuide } from "@/lib/labs/guides";
import { PORTS } from "@/lib/ports/registry";
import { useStore } from "@/lib/state/createStore";
import { animateTo, fitToScreen } from "@/lib/workspace/motion";
import { frameView, portRadius, portWorld, screenToWorld, setReservedSpace } from "@/lib/workspace/scene";
import { ExamBank, StepQuestions } from "./Questions";
import { useBench } from "./useBench";

const KIND_LABEL: Record<StepKind, string> = {
  theory: "Understand",
  connect: "Connect",
  adjust: "Adjust",
  observe: "Observe",
  summary: "Summary",
  exam: "Oral exam",
};

const controlSelector = (name: string) => `.control[aria-label="${name}"], .control[aria-label^="${name}:"]`;

/** Bring everything a step points at into view, beside the panel. */
function showOnBench(h: Highlight) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number, r: number) => {
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  };
  for (const id of [...(h.link ?? []), ...(h.links ?? []).flat(), ...(h.unlink ?? []).flat(), ...(h.ports ?? [])]) {
    const port = PORTS.get(id);
    if (!port) continue;
    const w = portWorld(port);
    add(w.x, w.y, portRadius(port));
  }
  for (const name of h.controls ?? []) {
    document.querySelectorAll(controlSelector(name)).forEach((el) => {
      const r = el.getBoundingClientRect();
      const a = screenToWorld(r.left, r.top);
      const b = screenToWorld(r.right, r.bottom);
      add((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(b.x - a.x, b.y - a.y) / 2);
    });
  }
  if (!Number.isFinite(minX)) return;
  // Keep some surroundings in view so the place is recognisable.
  const padX = Math.max(90, (460 - (maxX - minX)) / 2);
  const padY = Math.max(90, (340 - (maxY - minY)) / 2);
  animateTo({ view: frameView({ minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY }, 1.5) }, 320);
}

function evaluate(check: Check, bench: Bench): CheckResult {
  try {
    return check.test(bench);
  } catch {
    return { ok: false, detail: "This could not be checked." };
  }
}

function CheckList({ checks, bench }: { checks: Check[]; bench: Bench }) {
  return (
    <ul className="guide-checks" aria-label="Status of this step">
      {checks.map((check) => {
        const result = evaluate(check, bench);
        return (
          <li key={check.label} className={result.ok ? "is-ok" : ""} data-ok={result.ok}>
            <span className="guide-check-mark" aria-hidden>
              {result.ok && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 5.2l2.1 2.1L8 3" />
                </svg>
              )}
            </span>
            <span>
              <span className="guide-check-label">
                {check.label}
                <span className="sr-only">{result.ok ? " (done)" : " (not done yet)"}</span>
              </span>
              {result.detail && <span className="guide-check-detail">{result.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Panel({ guide }: { guide: Guide }) {
  const labId = guide.labId;
  const collapsed = useStore(guideStore, (s) => s.collapsed);
  const saved = useStore(guideStore, (s) => s.position[labId] ?? 0);
  const [contents, setContents] = useState(false);
  const bench = useBench();
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);

  const steps = useMemo(
    () => guide.sections.flatMap((section, sectionIndex) => section.steps.map((step) => ({ step, section, sectionIndex }))),
    [guide],
  );
  const index = Math.min(saved, steps.length - 1);
  const { step, section } = steps[index];
  const goTo = (next: number) => {
    setContents(false);
    guideActions.goTo(labId, Math.max(0, Math.min(steps.length - 1, next)));
  };

  // Point at this step's sockets and controls for as long as it is the current step.
  useEffect(() => {
    highlightStore.set(step.highlight ?? {});
  }, [step]);

  // Each step starts at its top.
  useLayoutEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [index, contents]);

  // Keep the equipment clear of the panel: reserve its space, and frame the bench once on opening.
  useLayoutEffect(() => {
    const reserve = () => {
      const el = panel.current;
      if (!el || collapsed) return setReservedSpace({});
      const r = el.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.7) setReservedSpace({ bottom: window.innerHeight - r.top });
      else setReservedSpace({ right: window.innerWidth - r.left });
    };
    reserve();
    window.addEventListener("resize", reserve);
    return () => {
      window.removeEventListener("resize", reserve);
      setReservedSpace({});
    };
  }, [collapsed]);
  useEffect(() => {
    fitToScreen();
  }, []);

  if (collapsed) {
    return (
      <button type="button" className="guide-pill" onClick={() => guideActions.setCollapsed(false)} aria-label="Expand the guideline">
        <span className="guide-pill-count">
          {index + 1}/{steps.length}
        </span>
        <span className="guide-pill-title">{step.title}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3.5 8.5L7 5l3.5 3.5" />
        </svg>
      </button>
    );
  }

  const h = step.highlight;
  const hasTargets = !!h && (!!h.link || !!h.links?.length || !!h.unlink?.length || !!h.ports?.length || !!h.controls?.length);
  let firstOfSection = 0;

  return (
    <aside ref={panel} className="guide" aria-label={`Lab ${labId} guideline`}>
      <header className="guide-head">
        <div className="guide-head-text">
          <span className="guide-lab">
            Lab {labId} · {guide.title}
          </span>
          <span className="guide-section">{section.title}</span>
        </div>
        <button type="button" className="tool" aria-label="Contents" aria-pressed={contents} title="Contents" onClick={() => setContents((v) => !v)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01" />
          </svg>
        </button>
        <button type="button" className="tool" aria-label="Collapse the guideline" title="Collapse" onClick={() => guideActions.setCollapsed(true)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M4 8h8" />
          </svg>
        </button>
        <button type="button" className="tool" aria-label="Close the guideline" title="Close" onClick={() => guideActions.close()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      </header>

      <div className="guide-progress" aria-hidden>
        {guide.sections.map((s) => {
          const start = firstOfSection;
          firstOfSection += s.steps.length;
          const done = Math.max(0, Math.min(s.steps.length, index + 1 - start));
          return (
            <span key={s.id} style={{ flexGrow: s.steps.length }}>
              <i style={{ width: `${(done / s.steps.length) * 100}%` }} />
            </span>
          );
        })}
      </div>

      <div ref={body} className="guide-body">
        {contents ? (
          <nav className="guide-contents" aria-label="Guideline contents">
            {guide.sections.map((s) => (
              <div key={s.id}>
                <h3>{s.title}</h3>
                <ol>
                  {s.steps.map((st) => {
                    const i = steps.findIndex((x) => x.step === st);
                    return (
                      <li key={st.id}>
                        <button type="button" className={i === index ? "is-current" : ""} aria-current={i === index ? "step" : undefined} onClick={() => goTo(i)}>
                          <span>{i + 1}</span>
                          {st.title}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </nav>
        ) : (
          <div key={step.id} className="guide-step" data-step={step.id}>
            <div className={`guide-kind guide-kind-${step.kind}`}>{KIND_LABEL[step.kind]}</div>
            <h2>{step.title}</h2>
            <div className="g-content">{step.body}</div>
            {step.checks && <CheckList checks={step.checks} bench={bench} />}
            {hasTargets && (
              <button type="button" className="g-button guide-locate" onClick={() => showOnBench(step.highlight!)}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <circle cx="7" cy="7" r="3.2" />
                  <path d="M7 1v2M7 11v2M1 7h2M11 7h2" />
                </svg>
                Show on the bench
              </button>
            )}
            {step.why && (
              <details className="guide-why">
                <summary>Why?</summary>
                <div className="g-content">{step.why}</div>
              </details>
            )}
            {step.kind === "exam" && <ExamBank guide={guide} />}
            {step.questions && <StepQuestions guide={guide} ids={step.questions} />}
          </div>
        )}
      </div>

      <footer className="guide-foot">
        <button type="button" className="g-button" disabled={index === 0} onClick={() => goTo(index - 1)}>
          Previous
        </button>
        <span className="guide-count" aria-live="polite">
          Step {index + 1} of {steps.length}
        </span>
        <button type="button" className="g-button g-button-primary" disabled={index === steps.length - 1} onClick={() => goTo(index + 1)}>
          Next
        </button>
      </footer>
    </aside>
  );
}

/**
 * What a lab adds to the bench: a quiet card with a Start button and, once
 * started, the guideline panel. Nothing opens by itself.
 */
export function LabGuide({ labId, title }: { labId: number; title: string }) {
  const open = useStore(guideStore, (s) => s.open === labId);
  const position = useStore(guideStore, (s) => s.position[labId] ?? 0);
  const [guide, setGuide] = useState<Guide | null>(null);
  const available = hasGuide(labId);

  useEffect(() => {
    guideActions.load();
    if (!available) return;
    let alive = true;
    loadGuide(labId).then((g) => alive && setGuide(g));
    return () => {
      alive = false;
      guideActions.close(); // leaving the lab puts the guide and its marks away
    };
  }, [labId, available]);

  if (open && guide) return <Panel guide={guide} />;

  const total = guide ? guide.sections.reduce((n, s) => n + s.steps.length, 0) : 0;
  const resumable = guide && position > 0 && position < total;
  return (
    <aside className="lab-note" aria-label={`Lab ${labId}`}>
      <strong>
        Lab {labId} · {title}
      </strong>
      {available ? (
        <>
          <span>A guided run of the experiment: the theory, each connection, and the oral questions.</span>
          <div className="lab-note-actions">
            <button type="button" className="g-button g-button-primary" disabled={!guide} onClick={() => guideActions.open(labId)}>
              {resumable ? `Continue guideline (step ${position + 1} of ${total})` : "Start guideline"}
            </button>
            {resumable && (
              <button
                type="button"
                className="g-button"
                onClick={() => {
                  guideActions.goTo(labId, 0);
                  guideActions.open(labId);
                }}
              >
                Start over
              </button>
            )}
          </div>
        </>
      ) : (
        "The guideline for this lab is not implemented yet. The bench works as usual."
      )}
    </aside>
  );
}
