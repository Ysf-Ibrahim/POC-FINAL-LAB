import { createStore } from "../state/createStore";

/**
 * Id of the knob whose slider is open, or null. One value for the whole bench,
 * so opening a slider closes any other.
 */
export const activeControl = createStore<string | null>(null);
