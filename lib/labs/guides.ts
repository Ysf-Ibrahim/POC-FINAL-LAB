import type { Guide } from "../guide/types";

/**
 * Guides are loaded on demand, one chunk per lab, so opening the kit or
 * another lab does not download Lab 2's content. A lab without an entry here
 * simply has no guide yet.
 */
const LOADERS: Record<number, () => Promise<{ default: Guide }>> = {
  2: () => import("./lab2/guide"),
  3: () => import("./lab3/guide"),
};

export const hasGuide = (labId: number) => labId in LOADERS;
export const loadGuide = (labId: number): Promise<Guide> => LOADERS[labId]().then((m) => m.default);
