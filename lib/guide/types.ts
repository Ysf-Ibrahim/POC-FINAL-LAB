import type { ReactNode } from "react";
import type { Bench } from "./bench";

/** Where a question comes from. Shown on every question so sources are never blurred. */
export type QuestionSource = "reported" | "instructor" | "manual" | "predicted";

export interface Question {
  id: string;
  source: QuestionSource;
  /** The question as an examiner would ask it. */
  q: string;
  /** A direct answer short enough to say aloud. */
  a: string;
  /** Optional reasoning behind the answer. */
  more?: string;
}

export interface CheckResult {
  ok: boolean;
  /** What the guide found on the bench, e.g. a measured value. */
  detail?: string;
}

/** A requirement of a step, evaluated against the live bench. It informs; it never blocks. */
export interface Check {
  label: string;
  test: (bench: Bench) => CheckResult;
}

/** What to point at on the equipment while a step is open. */
export interface Highlight {
  /** Two sockets to join with a lead. */
  link?: [string, string];
  /** Several pairs of sockets to join, for a step that makes more than one connection. */
  links?: [string, string][];
  /** Pairs of sockets that must stop being connected: marked in red while they still are. */
  unlink?: [string, string][];
  /** Other sockets to draw attention to. */
  ports?: string[];
  /** Knobs and switches, by their accessible name (e.g. "ADDER G", "MODE"). */
  controls?: string[];
}

export type StepKind = "theory" | "connect" | "adjust" | "observe" | "summary" | "exam";

export interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: ReactNode;
  /** Deeper explanation, behind a "Why?" disclosure. */
  why?: ReactNode;
  highlight?: Highlight;
  checks?: Check[];
  /** Ids of the oral questions that belong to this step. */
  questions?: string[];
}

export interface Section {
  id: string;
  title: string;
  steps: Step[];
}

export interface BankCategory {
  id: string;
  title: string;
  note: string;
  questions: string[];
}

export interface Guide {
  labId: number;
  title: string;
  sections: Section[];
  questions: Question[];
  /** The final question bank, in the order it is revised. */
  bank: BankCategory[];
}
