"use client";

import { useState } from "react";
import { Measure } from "@/components/guide/Measure";
import { useBench } from "@/components/guide/useBench";
import { TIME_DIV } from "@/lib/controls/store";
import { knobValue, switchValue } from "@/lib/controls/emonaControls";
import type { Bench } from "@/lib/guide/bench";
import { VCO_INPUT_LIMIT, vcoLaw } from "@/lib/sim/modules";

/** Interactive tools for the Lab 4 practical. They read the live bench; they never change it. */

const khz = (hz: number, d = 2) => `${(hz / 1000).toFixed(d).replace(/\.?0+$/, "")} kHz`;
const us = (s: number) => `${(s * 1e6).toFixed(s < 20e-6 ? 1 : 0)} µs`;

/** The TIME/DIV in use, including the ×10 magnifier. */
function timePerDiv(b: Bench) {
  const s = b.controls.scope;
  return TIME_DIV[s.tdiv] / (s.mag10 ? 10 : 1);
}
const fmtTime = (t: number) => (t >= 1e-3 ? `${+(t * 1e3).toPrecision(3)} ms` : `${+(t * 1e6).toPrecision(3)} µs`);

export type DialEnd = "min" | "max";

/** The TIME/DIV in use, as text, with a value in seconds. */
export const timeBase = (b: Bench) => {
  const t = timePerDiv(b);
  return { seconds: t, text: `${fmtTime(t)}/div` };
};

/** Working for a frequency measurement: period, and divisions at the current TIME/DIV. */
export function frequencyWorking(b: Bench, hz: number) {
  const tdiv = timePerDiv(b);
  const period = 1 / hz;
  const divs = period / tdiv;
  return (
    <>
      The signal is <strong>{khz(hz)}</strong>. Its period is 1 / {khz(hz)} = <strong>{us(period)}</strong>, which at{" "}
      {fmtTime(tdiv)}/div is <strong>{divs.toFixed(1)} divisions</strong>
      {divs > 10 ? ": more than the screen, so choose a slower TIME/DIV" : divs < 1 ? ": less than one division, so choose a faster TIME/DIV" : ""}.
    </>
  );
}

/**
 * "Measure it yourself" for the VCO's rest frequency at one end of its dial:
 * the student enters the frequency read off the scope and gets the working back.
 */
export function MeasureFrequency({
  port,
  label,
  range,
  dial,
}: {
  port: string;
  label: string;
  /** Range switch the measurement is for: 1 = HI, 0 = LO. */
  range: 0 | 1;
  /** Dial position the measurement is for. */
  dial: DialEnd;
}) {
  return (
    <Measure
      label={label}
      unit="kHz"
      precondition={(b) => {
        const r = switchValue(b.controls.emona, "vco.range");
        const pos = knobValue(b.controls.emona, "vco.freq");
        if (r !== range) return `Set the range switch to ${range ? "HI" : "LO"} first.`;
        if (dial === "min" ? pos > 0.015 : pos < 0.985)
          return `Turn the FREQ dial fully ${dial === "min" ? "counter-clockwise (minimum)" : "clockwise (maximum)"} first.`;
        return null;
      }}
      truth={(b) => {
        const f = b.frequency(port);
        return f > 0 ? f / 1000 : null;
      }}
      working={(b, v) => frequencyWorking(b, v * 1000)}
      hint="Count the divisions of one full cycle (rising crossing to the next rising crossing), multiply by TIME/DIV to get the period, then take 1 / period."
    />
  );
}

interface Row {
  messageVpp: number;
  fmin: number;
  fmax: number;
  outputVpp: number;
  limited: boolean;
}

/** The VCO's frequency swing as the model sets it from the voltage actually at its input. */
export function vcoSwing(b: Bench) {
  const law = vcoLaw(b.controls.emona);
  const vin = b.reading("vco.in", { duration: 1e-3, dt: 1e-6 });
  const fmin = Math.min(law(vin.min), law(vin.max));
  const fmax = Math.max(law(vin.min), law(vin.max));
  return {
    vin,
    fmin,
    fmax,
    rest: law(0),
    deviation: (fmax - fmin) / 2,
    limited: Math.max(Math.abs(vin.min), Math.abs(vin.max)) > VCO_INPUT_LIMIT + 1e-6,
  };
}

/**
 * A lab notebook for Part D: record the message amplitude, the frequency
 * swing and the output amplitude at different settings, then compare.
 */
export function ReadingsTable() {
  const bench = useBench();
  const [rows, setRows] = useState<Row[]>([]);
  const record = () => {
    const s = vcoSwing(bench);
    const out = bench.reading("vco.sine", { duration: 1e-3, dt: 0.25e-6 });
    setRows((r) => [...r, { messageVpp: s.vin.vpp, fmin: s.fmin, fmax: s.fmax, outputVpp: out.vpp, limited: s.limited }].slice(-6));
  };
  const dev = (r: Row) => (r.fmax - r.fmin) / 2;
  // Compare readings inside the VCO's linear range; a limited reading is reported separately.
  const linear = rows.filter((r) => !r.limited && r.messageVpp > 0.05);
  const first = linear[0] ?? rows[0];
  const last = linear.length >= 2 ? linear[linear.length - 1] : rows[rows.length - 1];
  const comparable = !!first && !!last && first !== last && Math.abs(last.messageVpp - first.messageVpp) > 0.2;

  return (
    <section className="measure readings" aria-label="Readings">
      <div className="quiz-label">Your readings</div>
      <p className="measure-wait">
        Set a BUFFER GAIN, then record. Take at least two readings with clearly different message sizes.
      </p>
      <button type="button" className="g-button" onClick={record}>
        Record this setting
      </button>
      {rows.length > 0 && (
        <table className="g-settings g-compare readings-table">
          <thead>
            <tr>
              <th scope="col">Message</th>
              <th scope="col">Frequency swing</th>
              <th scope="col">Δf</th>
              <th scope="col">Output</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.messageVpp.toFixed(2)} Vp-p</td>
                <td>
                  {khz(r.fmin, 1)} – {khz(r.fmax, 1)}
                </td>
                <td>
                  {khz(dev(r))}
                  {r.limited ? " (limit)" : ""}
                </td>
                <td>{r.outputVpp.toFixed(2)} Vp-p</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {comparable && (
        <div className="quiz-feedback" role="status">
          Message ×{(last.messageVpp / first.messageVpp).toFixed(2)} → deviation ×{(dev(last) / Math.max(1e-9, dev(first))).toFixed(2)}, while the
          output stayed at {last.outputVpp.toFixed(1)} Vp-p.{" "}
          {rows.some((r) => r.limited)
            ? "Readings marked (limit) drove the VCO input beyond ±3 V: there the deviation stops growing with the message."
            : "The deviation grows in proportion to the message amplitude; the FM signal's own amplitude does not change."}
        </div>
      )}
    </section>
  );
}

/** Current VCO rest frequency from the dial and range, for checks. */
export const restOf = (b: Bench) => vcoLaw(b.controls.emona)(0);
export const gainOf = (b: Bench) => knobValue(b.controls.emona, "vco.gain");
