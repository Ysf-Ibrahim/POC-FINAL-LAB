/**
 * Laboratory configurations.
 *
 * Every lab runs on the same bench (trainer, oscilloscope, patch leads). A lab
 * is therefore only data: for now its number and the title of the experiment
 * sheet. Later phases can add fields here (preset leads, steps, checks) without
 * touching the workspace.
 */
export interface LabConfig {
  /** Experiment number as printed on the lab sheet. */
  id: number;
  title: string;
}

export const LABS: LabConfig[] = [
  { id: 2, title: "Amplitude Modulation" },
  { id: 3, title: "Amplitude Demodulation" },
  { id: 4, title: "Frequency Modulation" },
  { id: 5, title: "Frequency Demodulation" },
  { id: 6, title: "Sampling and Reconstruction" },
  { id: 7, title: "PCM Encoding and Decoding" },
];

export const getLab = (id: number) => LABS.find((lab) => lab.id === id);
export const labHref = (id: number) => `/lab/${id}`;
