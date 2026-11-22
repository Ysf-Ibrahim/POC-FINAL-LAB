import { Measure } from "@/components/guide/Measure";
import { Eq, Figure, Lesson, Note, Terms, V } from "@/components/guide/parts";
import { Choice, NumberAnswer } from "@/components/guide/Quiz";
import type { Bench } from "@/lib/guide/bench";
import type { Check, CheckResult, Guide, Section } from "@/lib/guide/types";
import { F_MESSAGE, tlpfCutoff } from "@/lib/sim/modules";
import { CH1, CH2, MESSAGE, steady, triggerOnMessage, volts } from "../am";
import { fedBy, portName, probeOn } from "../checks";
import { timeBase } from "../lab4/bench-tools";
import { SamplingExplorer } from "./explorer";
import {
  ImagesFigure,
  RatesFigure,
  SampleDotsFigure,
  TwoWavesFigure,
} from "./figures";
import { BANK, QUESTIONS } from "./questions";

/**
 * Lab 6 — Sampling and Reconstruction.
 *
 * Procedure follows the Experiment 6 lab sheet: natural sampling with the
 * Dual Analog Switch (Figure 2: 2 kHz SINE → IN 2, 8 kHz DIGITAL → CONTROL 2,
 * OUT → CH2), sample-and-hold (Figure 4: 2 kHz SINE → S&H IN, 8 kHz DIGITAL →
 * CONTROL 1, S&H OUT → CH2), then both through the Tuneable LPF. The 2 kHz and
 * 100 kHz clocks are the instructor's suggested comparison and the lab
 * report's under/over-sampling; the VCO clock is an optional extension.
 * Every check traces the real wiring and measures what the circuit produces.
 */

// ---------------------------------------------------------------- sockets
const DIG8 = "master.dig8k";
const DIG2 = "master.dig2k";
const DIG100 = "master.dig100k";
const IN1 = "switch.in1";
const IN2 = "switch.in2";
const CTRL1 = "switch.ctrl1";
const CTRL2 = "switch.ctrl2";
const OUT = "switch.out";
const SH_IN = "switch.shIn";
const SH_OUT = "switch.shOut";
const TLPF_IN = "tlpf.in";
const TLPF_OUT = "tlpf.out";
const VCO_IN = "vco.in";
const VCO_DIG = "vco.digital";

const khz = (hz: number, d = 2) => `${(hz / 1000).toFixed(d)} kHz`;
const us = (s: number) => `${Math.round(s * 1e6)} µs`;

// ------------------------------------------------------------ the circuit
/** The switch that carries the message: IN 2 with CONTROL 2 (the lab sheet's), or IN 1 with CONTROL 1. */
function naturalPair(b: Bench) {
  if (b.linked(IN2, MESSAGE))
    return { input: IN2, ctrl: CTRL2, name: "CONTROL 2" };
  if (b.linked(IN1, MESSAGE))
    return { input: IN1, ctrl: CTRL1, name: "CONTROL 1" };
  return null;
}

/** The clock driving a control input, if exactly one output drives it. */
function clockOn(b: Bench, ctrl: string): string | null {
  const d = b.drivers(ctrl);
  return d.length === 1 ? d[0] : null;
}

const clockName = (port: string | null) => (port ? portName(port) : "nothing");

/** What a clock does to the 2 kHz message, in words. */
function rateVerdict(port: string | null, b: Bench) {
  if (!port) return "No clock.";
  const f = b.frequency(port);
  if (f <= 0) return `${clockName(port)}: no clock signal.`;
  const ratio = f / F_MESSAGE;
  const tag =
    ratio > 2.05
      ? ratio > 10
        ? "oversampling"
        : "above the Nyquist rate"
      : ratio > 1.95
        ? "exactly the Nyquist rate"
        : "undersampling";
  return `${clockName(port)}: ${khz(f)}, ${ratio.toFixed(ratio < 10 ? 2 : 0)} samples per message cycle (${tag}).`;
}

/** First broken link of the natural sampler, or null. */
function naturalBroken(b: Bench, clock: string | null = DIG8): string | null {
  const pair = naturalPair(b);
  if (!pair) return "the 2 kHz SINE is not on the switch's IN 2";
  if (b.drivers(pair.input).length > 1)
    return `something else is also connected to ${portName(pair.input)}`;
  const c = clockOn(b, pair.ctrl);
  if (!c)
    return b.drivers(pair.ctrl).length > 1
      ? `two outputs are joined on ${pair.name}`
      : `no clock on ${pair.name}`;
  if (clock && c !== clock)
    return `${pair.name} has ${clockName(c)}, not ${clockName(clock)}`;
  return null;
}

/**
 * Natural sampling, measured: while the clock is high the output equals the
 * message; while it is low the output is 0 V.
 */
function gating(b: Bench, out: string, ctrl: string) {
  const [o, m, c] = b.record([out, MESSAGE, ctrl]);
  let on = 0;
  let follow = 0;
  let zero = 0;
  for (let i = 0; i < o.length; i++) {
    if (c[i] > 2.5) {
      on++;
      if (Math.abs(o[i] - m[i]) < 0.05) follow++;
    } else if (Math.abs(o[i]) < 0.05) zero++;
  }
  const off = o.length - on;
  return {
    duty: on / o.length,
    follow: on ? follow / on : 0,
    zero: off ? zero / off : 0,
  };
}

function naturalResult(b: Bench, clock: string | null = DIG8): CheckResult {
  const broken = naturalBroken(b, clock);
  if (broken) return { ok: false, detail: `Not yet: ${broken}.` };
  const pair = naturalPair(b)!;
  const g = gating(b, OUT, pair.ctrl);
  const ok = g.follow > 0.95 && g.zero > 0.95 && g.duty > 0.05 && g.duty < 0.95;
  return {
    ok,
    detail: ok
      ? `Measured at OUT: equal to the message while the clock is high, 0 V while it is low. Switch closed ${Math.round(g.duty * 100)} % of the time.`
      : `OUT follows the message ${Math.round(g.follow * 100)} % of the clock-high time and is 0 V ${Math.round(g.zero * 100)} % of the clock-low time.`,
  };
}

/** The held levels at S&H OUT, one per clock period, and whether each step is flat. */
function staircase(b: Bench) {
  const [s, c] = b.record([SH_OUT, CTRL1]);
  const edges: number[] = [];
  for (let i = 1; i < c.length; i++)
    if (c[i] > 2.5 && c[i - 1] <= 2.5) edges.push(i);
  const levels: number[] = [];
  let flat = true;
  for (let k = 0; k + 1 < edges.length; k++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = edges[k] + 2; i < edges[k + 1]; i++) {
      lo = Math.min(lo, s[i]);
      hi = Math.max(hi, s[i]);
    }
    if (hi - lo > 0.02) flat = false;
    levels.push((lo + hi) / 2);
  }
  return { levels, flat };
}

function holdBroken(b: Bench, clock: string | null = DIG8): string | null {
  if (!b.linked(SH_IN, MESSAGE)) return "the 2 kHz SINE is not on S&H IN";
  if (b.drivers(SH_IN).length > 1)
    return "something else is also connected to S&H IN";
  const c = clockOn(b, CTRL1);
  if (!c)
    return b.drivers(CTRL1).length > 1
      ? "two outputs are joined on CONTROL 1"
      : "no clock on CONTROL 1 (the sample-and-hold's clock)";
  if (clock && c !== clock)
    return `CONTROL 1 has ${clockName(c)}, not ${clockName(clock)}`;
  return null;
}

function holdResult(b: Bench, clock: string | null = DIG8): CheckResult {
  const broken = holdBroken(b, clock);
  if (broken) return { ok: false, detail: `Not yet: ${broken}.` };
  const st = staircase(b);
  const f = b.frequency(clockOn(b, CTRL1)!);
  const per = f / F_MESSAGE;
  const shown = st.levels
    .slice(0, Math.min(4, Math.round(per)))
    .map((v) => volts(v));
  return {
    ok: st.flat && st.levels.length > 0,
    detail: st.flat
      ? `Measured at S&H OUT: flat steps held ${us(1 / f)} each, ${per.toFixed(per < 10 ? 0 : 0)} per message cycle${shown.length ? `; levels ${shown.join(", ")}` : ""}.`
      : "The output is not holding flat steps.",
  };
}

/** The recovered message at the filter output. */
function recovered(b: Bench, minVpp: number): CheckResult {
  const t = b.tone(TLPF_OUT);
  const f = t.messageVpp > 0.05 ? b.frequency(TLPF_OUT, 4e-3, 0.5e-6) : 0;
  const fc = tlpfCutoff(b.controls.emona);
  const ok =
    t.messageVpp >= minVpp && Math.abs(f - F_MESSAGE) < 120 && t.thd < 5;
  let verdict: string;
  if (t.messageVpp < 0.1)
    verdict = `fc = ${khz(fc)} is below the message: the 2 kHz sine itself is cut. Raise fc.`;
  else if (t.thd >= 5)
    verdict = `fc = ${khz(fc)} lets images through (distortion ${t.thd.toFixed(0)} %). Lower fc.`;
  else verdict = `fc = ${khz(fc)}: between the message and the first image.`;
  return {
    ok,
    detail:
      t.messageVpp < 0.05
        ? `No 2 kHz signal. ${verdict}`
        : `${t.messageVpp.toFixed(2)} Vp-p at ${khz(f)}, distortion ${t.thd.toFixed(1)} %. ${verdict}`,
  };
}

/** Working for a time measured on the scope. */
function periodWorking(b: Bench, seconds: number, what: string) {
  const tb = timeBase(b);
  const divs = seconds / tb.seconds;
  return (
    <>
      {what} is <strong>{us(seconds)}</strong> ({khz(1 / seconds)}). At{" "}
      {tb.text} that is <strong>{divs.toFixed(1)} divisions</strong>
      {divs > 10
        ? ": more than the screen, so choose a faster TIME/DIV"
        : divs < 0.8
          ? ": too small to read, so choose a faster TIME/DIV"
          : ""}
      .
    </>
  );
}

const scopeGrounded: Check = {
  label: "Oscilloscope grounded to the trainer",
  test: (b) => ({ ok: b.scopeGrounded }),
};

// ----------------------------------------------------------------- theory
const theory: Section = {
  id: "theory",
  title: "Understand sampling",
  steps: [
    {
      id: "l1-what",
      kind: "theory",
      title: "1 · What is sampling?",
      body: (
        <Lesson
          ask="A message is a voltage that changes all the time. Do we really need its value at every instant?"
          numbers={
            <>
              Our message is the trainer&rsquo;s <strong>2 kHz sine</strong>, 4
              Vp-p (−2 V to +2 V). Sampling it 8,000 times a second means one
              measurement every <strong>125 µs</strong>.
            </>
          }
          bench={
            <>
              The message is the <strong>2kHz SINE</strong> on MASTER SIGNALS.
              The circuits that take the samples are on the{" "}
              <strong>DUAL ANALOG SWITCH</strong> module.
            </>
          }
          oral="Sampling means measuring the instantaneous voltage of a signal at regular time intervals; it is the first step in converting an analog message to digital."
          check={
            <Choice
              q="After sampling, before anything else is done, is the signal digital?"
              options={[
                {
                  text: "No: the samples are still analog voltages",
                  correct: true,
                  why: "Sampling only chooses when to measure. Each sample can still be any voltage, like 1.41 V. It becomes digital only after quantization and encoding.",
                },
                {
                  text: "Yes: sampling turns it into bits",
                  why: "No bits exist yet. Turning a voltage into bits needs two more steps: quantization and encoding.",
                },
              ]}
            />
          }
        >
          <p>
            An <strong>analog</strong> signal is <strong>continuous</strong>: it
            has a voltage at every instant, and that voltage can take any value.
            A microphone&rsquo;s output is like that.
          </p>
          <p>
            <strong>Sampling</strong> means measuring that voltage only at
            chosen, regularly spaced instants. One <strong>sample</strong>{" "}
            answers one question: <em>what was the voltage at this moment?</em>{" "}
            If the samples come often enough, they still describe the whole
            waveform: the curve between them can be rebuilt.
          </p>
          <SamplingExplorer
            rows={["message", "clock"]}
            caption="Red dots: the message's voltage at each sampling instant (the clock's rising edges), every 125 µs. Press Next sample to step through them."
          />
          <h3 className="g-sub">Three steps to a digital signal</h3>
          <Terms
            items={[
              [
                "Sampling",
                "Measure the voltage at chosen instants: makes time discrete. Example: 1.41 V at t = 62.5 µs.",
              ],
              [
                "Quantization",
                "Round each sample to one of a fixed set of levels. Example: 1.41 V → 1.25 V.",
              ],
              [
                "Encoding",
                "Give each level a binary code word. Example: 1.25 V → 110.",
              ],
            ]}
          />
          <p className="g-small">
            The examples use an illustrative 3-bit scheme (8 levels, 0.5 V
            apart). Quantization and encoding are Lab 7; this lab is only the
            first step.
          </p>
        </Lesson>
      ),
      why: (
        <p>
          <strong>Why go digital at all?</strong> The lab sheet&rsquo;s reason:
          digital signals resist interference from electrical noise much better
          than analog ones. Whatever digital system is used, an analog message
          must be sampled first.
        </p>
      ),
      questions: [
        "i-what",
        "m-why-digital",
        "i-discrete",
        "i-three-steps",
        "i-why-steps",
        "p-why-necessary",
      ],
    },
    {
      id: "l2-fs",
      kind: "theory",
      title: "2 · Sampling frequency",
      body: (
        <Lesson
          ask="How often do we sample, and how many samples land on one cycle of the message?"
          numbers={
            <>
              <Eq>
                <V>T</V> = 1 / 2 kHz = 500 µs &nbsp;·&nbsp; <V>T</V>
                <sub>s</sub> = 1 / 8 kHz = 125 µs &nbsp;·&nbsp; 500 / 125 ={" "}
                <strong>4</strong>
              </Eq>
              Starting at the sine&rsquo;s upward zero crossing, the four
              samples are <strong>0 V, +2 V, 0 V, −2 V</strong>.
            </>
          }
          bench={
            <>
              The sampling clock is the <strong>8kHz DIGITAL</strong> output: a
              0–5 V square wave. The trainer&rsquo;s exact values are 8.333 kHz
              and 2.083 kHz, both divided from its 100 kHz master clock, so the
              ratio is exactly 4 and the picture on the scope stands still.
            </>
          }
          oral="The sampling frequency is the number of samples per second; at 8 kHz a sample is taken every 125 µs, so a 2 kHz message, whose period is 500 µs, gets four samples per cycle."
          check={
            <NumberAnswer
              q="Keep the 2 kHz message but sample at 16 kHz. How many samples per message cycle?"
              answer={8}
              unit="samples"
              explain={
                <>
                  T<sub>s</sub> = 1/16 kHz = 62.5 µs, and 500 µs / 62.5 µs ={" "}
                  <strong>8</strong>. Equivalently f<sub>s</sub>/f
                  <sub>m</sub> = 16/2 = 8. The message is still 2 kHz.
                </>
              }
            />
          }
        >
          <Terms
            items={[
              [
                <>
                  Message frequency f<sub>m</sub>
                </>,
                "How fast the message repeats: 2 kHz, so one cycle lasts 500 µs.",
              ],
              [
                <>
                  Sampling frequency f<sub>s</sub>
                </>,
                "How many samples are taken per second: 8 kHz means 8,000 sampling events every second.",
              ],
              [
                <>
                  Sampling period T<sub>s</sub>
                </>,
                <>
                  The time between two samples: T<sub>s</sub> = 1/f<sub>s</sub>{" "}
                  = 125 µs.
                </>,
              ],
            ]}
          />
          <Figure>
            <SampleDotsFigure />
          </Figure>
          <p>
            Four sampling periods fit in one message period. That is the meaning
            of f<sub>s</sub>/f<sub>m</sub> = 4.
          </p>
          <SamplingExplorer
            rows={["message", "clock"]}
            controls={["fs"]}
            caption="Change fs and count the dots per cycle: it is always fs/fm. The message does not change."
          />
        </Lesson>
      ),
      questions: ["i-four", "i-sketch", "e-four-steps", "p-fs-fm-up"],
    },
    {
      id: "l3-natural",
      kind: "theory",
      title: "3 · Natural sampling",
      body: (
        <Lesson
          ask="How does a circuit take a sample? The simplest way: a switch."
          numbers={
            <>
              8 kHz clock, 50 % high: the switch is closed for 60 µs, open for
              60 µs, every 120 µs. During each closed window the message keeps
              changing, so each pulse top is a short piece of the sine.
            </>
          }
          bench={
            <>
              The <strong>DUAL ANALOG SWITCH</strong> has two electronic
              switches. The lab sheet uses the second: message into{" "}
              <strong>IN 2</strong>, clock into <strong>CONTROL 2</strong>,
              result at <strong>OUT</strong>. CONTROL high = switch closed.
            </>
          }
          oral="In natural sampling an analog switch, driven by the sampling clock, passes the message while the clock is high and blocks it while it is low, so the output is the message times a 1/0 gate: curved tops that follow the message, and zero in between."
          check={
            <Choice
              q="The switch is closed and the message is rising. What does the output do?"
              options={[
                {
                  text: "Rises with the message",
                  correct: true,
                  why: "While closed, the switch is a plain connection: the output is the message, moment by moment. That is why the top is curved.",
                },
                {
                  text: "Stays at the value it had when the switch closed",
                  why: "That is sample-and-hold, the next lesson. A plain switch does not remember anything.",
                },
                {
                  text: "Goes to 0 V",
                  why: "0 V is what you get while the switch is open.",
                },
              ]}
            />
          }
        >
          <p>
            Picture a switch between the message and the output, opened and
            closed by the <strong>sampling clock</strong>:
          </p>
          <ul>
            <li>
              Clock <strong>high</strong>: switch <strong>closed</strong>, the
              output <em>is</em> the message.
            </li>
            <li>
              Clock <strong>low</strong>: switch <strong>open</strong>, the
              output is <strong>0 V</strong>.
            </li>
          </ul>
          <p>
            The clock decides <strong>when</strong> the message gets through;
            the message decides <strong>how high</strong> each pulse is. This is
            called <strong>natural</strong> sampling because each sample keeps
            the message&rsquo;s natural shape while the switch is closed.
          </p>
          <Eq>
            <V>y</V>(<V>t</V>) = <V>x</V>(<V>t</V>) × <V>p</V>(<V>t</V>)
            &nbsp;&nbsp;{" "}
            <span className="g-small">p = 1 when closed, 0 when open</span>
          </Eq>
          <SamplingExplorer
            rows={["message", "clock", "natural"]}
            controls={["duty", "fs"]}
            caption="The natural row is the trainer's switch model. Dashed grey: the message. Narrow the pulse width and the samples get thinner, but they still follow the message's curve."
          />
        </Lesson>
      ),
      why: (
        <p>
          The lab sheet writes it as{" "}
          <em>sampled message = sampling signal × message</em>. Multiplying by 1
          passes the message, multiplying by 0 blocks it: an ideal switch does
          exactly that.
        </p>
      ),
      questions: [
        "i-natural",
        "i-timing-height",
        "m-q1",
        "m-q2",
        "p-clock",
        "p-zero-gaps",
      ],
    },
    {
      id: "l4-hold",
      kind: "theory",
      title: "4 · Sample-and-hold",
      body: (
        <Lesson
          ask="What if the next circuit needs each sample to stay still?"
          numbers={
            <>
              With the clock rising at the sine&rsquo;s zero crossing, the held
              levels are 0, +2, 0, −2 V, each held for 125 µs (120 µs on the
              trainer): a staircase of four steps per cycle.
            </>
          }
          bench={
            <>
              The sample-and-hold is on the same DUAL ANALOG SWITCH module:{" "}
              <strong>S&amp;H IN</strong> and <strong>S&amp;H OUT</strong>,
              clocked by <strong>CONTROL 1</strong> (the dashed line on the
              panel). Here it samples on each rising edge of the clock.
            </>
          }
          oral="A sample-and-hold measures the message at each sampling instant and holds that voltage constant until the next one, so its output is a staircase of flat steps; the held value is still an analog voltage."
          check={
            <Choice
              q="Is the held voltage a digital value?"
              options={[
                {
                  text: "No: it is an analog voltage that happens to be constant",
                  correct: true,
                  why: "It can be any value, 1.41 V or 0.73 V. Rounding it to levels and writing it in bits are later steps.",
                },
                {
                  text: "Yes: a flat level is a digital level",
                  why: "Flat is not the same as digital. Digital means one of a fixed set of levels, written as a code.",
                },
              ]}
            />
          }
        >
          <p>A sample-and-hold does two things, over and over:</p>
          <ol>
            <li>
              <strong>Sample</strong>: at the sampling instant, measure the
              message.
            </li>
            <li>
              <strong>Hold</strong>: keep exactly that voltage at the output
              until the next sampling instant.
            </li>
          </ol>
          <p>
            Each step is flat because nothing changes the held value in between.
            The output jumps only when a new sample differs from the last.
          </p>
          <SamplingExplorer
            rows={["message", "clock", "hold"]}
            caption="Press Next sample: the red dot on the message is the voltage captured; the staircase holds it until the next dot. This is the trainer's sample-and-hold model."
          />
        </Lesson>
      ),
      why: (
        <>
          <p>
            <strong>Why hold?</strong> An analog-to-digital converter needs time
            to work out its code. If its input kept moving during the conversion
            the result would be uncertain. Holding gives it one steady voltage
            to convert.
          </p>
          <p>
            The lab sheet also calls this flat-top scheme{" "}
            <strong>pulse amplitude modulation</strong> (PAM): the size of each
            pulse carries the sample.
          </p>
        </>
      ),
      questions: [
        "i-hold",
        "i-adc",
        "i-analog",
        "m-pam",
        "p-quantize",
        "p-photo-heights",
      ],
    },
    {
      id: "l5-compare",
      kind: "theory",
      title: "5 · Natural or sample-and-hold?",
      body: (
        <Lesson
          ask="Shown only a waveform, can you tell which sampling method made it?"
          bench={
            <>
              Natural: switch <strong>IN 2 → OUT</strong> with CONTROL 2.
              Sample-and-hold: <strong>S&amp;H IN → S&amp;H OUT</strong> with
              CONTROL 1. Same message, same 8 kHz clock.
            </>
          }
          oral="Natural sampling has curved tops and returns to zero between samples; sample-and-hold has flat tops and no gaps, holding each value until the next sample."
          check={
            <Choice
              q="A waveform has flat steps with no gaps between them. Which sampling method is it?"
              options={[
                {
                  text: "Sample-and-hold",
                  correct: true,
                  why: "Flat: each value is frozen. No gaps: it is held until the next sample replaces it.",
                },
                {
                  text: "Natural sampling",
                  why: "Natural samples follow the message, so their tops are curved, and they drop to 0 V between pulses.",
                },
              ]}
            />
          }
        >
          <table className="g-settings smx-table">
            <thead>
              <tr>
                <th />
                <th scope="col">Natural</th>
                <th scope="col">Sample-and-hold</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">During a sample</th>
                <td>Follows the message</td>
                <td>Holds the captured value</td>
              </tr>
              <tr>
                <th scope="row">Pulse tops</th>
                <td>Curved</td>
                <td>Flat</td>
              </tr>
              <tr>
                <th scope="row">Between samples</th>
                <td>0 V (switch open)</td>
                <td>The last value</td>
              </tr>
              <tr>
                <th scope="row">On the trainer</th>
                <td>IN 2 → OUT, CONTROL 2</td>
                <td>S&amp;H IN → S&amp;H OUT, CONTROL 1</td>
              </tr>
            </tbody>
          </table>
          <SamplingExplorer
            rows={["message", "natural", "hold"]}
            caption="The same message and the same sampling instants. Only what the circuit does with each sample differs."
          />
        </Lesson>
      ),
      questions: ["e-identify", "i-same-instants", "p-modules", "m-q2"],
    },
    {
      id: "l6-few",
      kind: "theory",
      title: "6 · Can we sample at any rate?",
      body: (
        <Lesson
          ask="What happens if we take too few samples of a changing waveform?"
          numbers={
            <>
              2 kHz sampled at 16 kHz: 8 per cycle. At 8 kHz: 4 per cycle. At 3
              kHz: 1.5 per cycle, fewer than two, and the dots fit a{" "}
              <strong>1 kHz</strong> wave better than the real 2 kHz one.
            </>
          }
          oral="If the samples are too sparse, they no longer describe the message uniquely: a slower wave fits the same points, and that is the one we would rebuild."
          check={
            <Choice
              q="At fs = 3 kHz, what does the slowest wave through the dots look like?"
              options={[
                {
                  text: "A 1 kHz wave",
                  correct: true,
                  why: "The dots of the 2 kHz sine taken every 333 µs lie exactly on a 1 kHz sine (upside down). The next lesson says why.",
                },
                {
                  text: "The 2 kHz message",
                  why: "The 2 kHz sine passes through them too, but so does a slower one. Given only the dots, the slower fit wins.",
                },
                {
                  text: "A flat line",
                  why: "A flat line needs all samples equal. That happens at 2 kHz with the samples on the same point of each cycle, not at 3 kHz.",
                },
              ]}
            />
          }
        >
          <p>
            A filter that rebuilds a waveform from samples does the simplest
            thing possible: it draws the <strong>smoothest, slowest</strong>{" "}
            curve through the dots. That works only if the dots leave no doubt.
          </p>
          <Figure>
            <RatesFigure rates={[16, 8, 3]} />
          </Figure>
          <p>
            At 16 and 8 kHz the slowest curve through the dots <em>is</em> the
            message. At 3 kHz it is not: a 1 kHz wave fits every dot.
          </p>
        </Lesson>
      ),
      questions: ["p-why-necessary", "i-alias"],
    },
    {
      id: "l7-nyquist",
      kind: "theory",
      title: "7 · The Nyquist criterion",
      body: (
        <Lesson
          ask="How fast is fast enough?"
          numbers={
            <>
              Message 2 kHz → Nyquist rate <strong>4 kHz</strong>. Lab clock{" "}
              <strong>8 kHz</strong>: twice the Nyquist rate, four samples per
              cycle. Its Nyquist frequency is 8/2 = 4 kHz, comfortably above the
              2 kHz message.
            </>
          }
          bench={
            <>
              The 8kHz DIGITAL clock satisfies the criterion. The 2kHz DIGITAL
              clock (fs = fm) does not; the lab uses it as the undersampling
              example.
            </>
          }
          oral="To rebuild a signal from its samples, the sampling frequency must be more than twice its highest frequency, fs > 2fm; for our 2 kHz message that means above 4 kHz, and our 8 kHz clock satisfies it."
          check={
            <NumberAnswer
              q="Telephone speech is limited to about 3.4 kHz. What is its Nyquist rate, in kHz?"
              answer={6.8}
              unit="kHz"
              explain={
                <>
                  2 × 3.4 kHz = <strong>6.8 kHz</strong>. Telephone systems
                  sample at 8 kHz: above 6.8 kHz, with a margin for the filters.
                </>
              }
            />
          }
        >
          <Eq>
            <V>f</V>
            <sub>s</sub> &gt; 2<V>f</V>
            <sub>max</sub>
          </Eq>
          <Terms
            items={[
              [
                "Nyquist rate",
                "Belongs to the signal: twice its highest frequency. 2 × 2 kHz = 4 kHz.",
              ],
              [
                "Nyquist frequency",
                "Belongs to the sampler: half its sampling rate, fs/2. 8 kHz / 2 = 4 kHz.",
              ],
            ]}
          />
          <p>
            <strong>Why twice?</strong> A sine must be caught at least once near
            each peak and once near each trough, or a slower wave fits the dots.
            More than two samples per cycle rules that out: below fs/2 only one
            wave fits them.
          </p>
          <p>
            <strong>Exactly twice is a boundary, not a target.</strong> At two
            samples per cycle what you get depends on where they land:
          </p>
          <Figure>
            <RatesFigure rates={[4]} />
          </Figure>
          <p>
            Here both samples of every cycle land on zero crossings: all zeros,
            and the message is lost. Real filters also need room for their
            transition band, so practical systems sample well above 2f
            <sub>max</sub>.
          </p>
        </Lesson>
      ),
      questions: [
        "i-nyquist",
        "i-rate-freq",
        "i-minimum",
        "p-exactly-twice",
        "i-100hz",
        "p-multi",
      ],
    },
    {
      id: "l8-alias",
      kind: "theory",
      title: "8 · Undersampling and aliasing",
      body: (
        <Lesson
          ask="Sample 2 kHz at 3 kHz. Why does a 1 kHz wave come out?"
          numbers={
            <>
              Between samples (333 µs) the 2 kHz sine advances 2/3 of a cycle:
              the same as going <em>back</em> 1/3 of a cycle. A 1 kHz sine run
              backwards gives the same values: |f<sub>m</sub> − f<sub>s</sub>| =
              |2 − 3| = <strong>1 kHz</strong>.
            </>
          }
          bench={
            <>
              The trainer&rsquo;s 2kHz DIGITAL clock samples the 2 kHz message
              at the <em>same</em> point of every cycle: the held output is
              flat. The lab report saw exactly that: &ldquo;no clear
              output&rdquo;. An optional step at the end of the practical makes
              a 3 kHz clock with the VCO.
            </>
          }
          oral="Aliasing happens when the sampling rate is below twice the message frequency: the samples then also fit a lower frequency, such as 1 kHz for 2 kHz sampled at 3 kHz, and the filter rebuilds that wrong frequency; it cannot be undone afterwards."
          check={
            <Choice
              q="After aliasing, can a better reconstruction filter recover the 2 kHz message?"
              options={[
                {
                  text: "No: the samples fit both waves equally, so nothing says which was there",
                  correct: true,
                  why: "The alias sits inside the band where the message belongs. Aliasing must be prevented before sampling: an anti-alias filter, and a fast enough clock.",
                },
                {
                  text: "Yes: a steeper filter removes the 1 kHz alias",
                  why: "A filter separates by frequency. The 1 kHz alias is below the 2 kHz message: removing it would not bring the 2 kHz back.",
                },
              ]}
            />
          }
        >
          <p>
            <strong>Aliasing</strong>: different original frequencies give{" "}
            <strong>indistinguishable samples</strong>. Here are a 2 kHz sine
            and an inverted 1 kHz sine, sampled at 3 kHz:
          </p>
          <Figure>
            <TwoWavesFigure />
          </Figure>
          <p>
            The samples are identical, so after sampling the two cases cannot be
            told apart. A reconstruction filter for 3 kHz sampling passes up to
            f<sub>s</sub>/2 = 1.5 kHz: it rebuilds the 1 kHz wave.
          </p>
          <SamplingExplorer
            rows={["message", "clock", "hold", "recon"]}
            presets={[2, 3, 8]}
            controls={["phase"]}
            initial={{ fs: 3, cutoff: 1.4, method: "hold" }}
            analysis
            caption="The filter is set to 1.4 kHz, just under fs/2 for 3 kHz sampling. At 3 kHz the output is a 1 kHz sine: the alias. At 2 kHz the held output is flat; move the clock phase and it stays flat, at another level. At 8 kHz the same filter is too low for the message: a real system picks its filter for its own fs."
          />
          <Note tone="caution" title="Flat is a special case">
            A flat output appears only when f<sub>s</sub> = f<sub>m</sub> (or a
            whole fraction of it) and the clock is locked to the message. Most
            undersampling gives a <em>wrong</em> waveform, not a flat one;
            whether it looks flat, at zero, or at some level depends on the
            phase.
          </Note>
        </Lesson>
      ),
      why: (
        <p>
          <strong>In the spectrum.</strong> Sampling copies the message to f
          <sub>s</sub> ± f<sub>m</sub>, 2f<sub>s</sub> ± f<sub>m</sub> and so
          on. At f<sub>s</sub> = 3 kHz the lower copy f<sub>s</sub> − f
          <sub>m</sub> lands at 1 kHz, below the message itself. The copies
          overlap the baseband and no filter can separate them.
        </p>
      ),
      questions: [
        "i-alias",
        "i-3k",
        "p-3k-why",
        "i-fs-fm",
        "p-2k-flat",
        "i-lpf-cant",
        "p-after-alias",
        "i-two-filters",
        "e-under",
      ],
    },
    {
      id: "l9-over",
      kind: "theory",
      title: "9 · Oversampling",
      body: (
        <Lesson
          ask="What do we gain, and what do we pay, by sampling faster?"
          numbers={
            <Terms
              items={[
                ["3 kHz", "1.5 per cycle: below Nyquist, aliasing."],
                ["8 kHz", "4 per cycle, steps of 125 µs; nearest image 6 kHz."],
                [
                  "16 kHz",
                  "8 per cycle, steps of 62.5 µs; nearest image 14 kHz.",
                ],
                [
                  "100 kHz",
                  "50 per cycle (48 on the trainer), steps of 10 µs; nearest image 98 kHz.",
                ],
              ]}
            />
          }
          bench={
            <>
              The trainer&rsquo;s <strong>100kHz DIGITAL</strong> output is a
              real oversampling clock. The lab report used it: the staircase
              became so fine it almost looked like the sine.
            </>
          }
          oral="Oversampling means sampling well above the Nyquist rate: the steps get smaller and the images move further from the message, so reconstruction is easier, at the cost of more samples to convert, store and send."
          check={
            <NumberAnswer
              q="With the 100 kHz clock and the 2 kHz message, how many samples per message cycle?"
              answer={50}
              unit="samples"
              tolerance={0.05}
              explain={
                <>
                  100 / 2 = <strong>50</strong>, one every 10 µs. On the
                  trainer, 100 / 2.083 = 48.
                </>
              }
            />
          }
        >
          <ul>
            <li>More samples per cycle; smaller time gaps; narrower steps.</li>
            <li>
              The first image, f<sub>s</sub> − f<sub>m</sub>, moves away from
              the message: the filter has an easy job.
            </li>
            <li>
              <strong>The cost:</strong> more samples per second for the ADC to
              convert, and in a digital link more bits per second to send.
              Faster is not automatically better; it is worth it only when the
              system has the capacity.
            </li>
          </ul>
          <SamplingExplorer
            rows={["message", "hold", "recon"]}
            presets={[3, 8, 16, 100]}
            initial={{ fs: 8, method: "hold" }}
            analysis
            caption="Sample-and-hold, then the LPF at 3.6 kHz. Step from 3 to 100 kHz: the staircase approaches the sine. At 3 kHz the output is wrong; from 8 kHz up it is the 2 kHz message."
          />
        </Lesson>
      ),
      questions: [
        "i-over",
        "i-over-cost",
        "i-clocks",
        "e-over",
        "p-images-apart",
        "p-fs-fm-up",
      ],
    },
    {
      id: "l10-recon",
      kind: "theory",
      title: "10 · Reconstruction with a low-pass filter",
      body: (
        <Lesson
          ask="We have pulses or a staircase instead of the sine. How can a low-pass filter give the sine back?"
          numbers={
            <>
              Message 2 kHz; images at 8 − 2 = <strong>6 kHz</strong> and 8 + 2
              = <strong>10 kHz</strong>, then 22 and 26 kHz (14 and 18 kHz are
              zero for the trainer&rsquo;s 50 % clock). Cutoff: above 2 kHz,
              below 6 kHz, with room for the transition.
            </>
          }
          bench={
            <>
              The <strong>TUNEABLE LPF</strong>: 600 Hz to 12 kHz, set with its{" "}
              <strong>fc</strong> knob; GAIN in the middle is ×1. Its default
              fc, about 3.6 kHz, already sits between 2 and 6 kHz.
            </>
          }
          oral="The sampled signal contains the message at its own frequency plus images at multiples of fs plus and minus fm; a low-pass filter with its cutoff between 2 kHz and the first image at 6 kHz keeps the message and removes the images."
          check={
            <Choice
              q="You set the cutoff to 1 kHz. What comes out?"
              options={[
                {
                  text: "Almost nothing: the 2 kHz message is above the cutoff",
                  correct: true,
                  why: "The filter cannot tell the message from the images; it only passes what is below fc. At 1 kHz that is neither.",
                },
                {
                  text: "A cleaner sine",
                  why: "Too low a cutoff removes the message itself. Clean means: message in, images out.",
                },
                {
                  text: "The staircase, unchanged",
                  why: "That is what a cutoff far too high would give.",
                },
              ]}
            />
          }
        >
          <p>
            <strong>In time:</strong> the filter smooths. It cannot follow fast
            changes (the edges of each pulse or step) but it follows the slow 2
            kHz rise and fall: it &ldquo;connects the dots&rdquo;.
          </p>
          <p>
            <strong>In frequency:</strong> the clock is a DC level plus a
            fundamental and harmonics, so multiplying by it leaves a copy of the
            message at 2 kHz and adds copies around f<sub>s</sub>, 2f
            <sub>s</sub> … The filter keeps the 2 kHz copy.
          </p>
          <Figure>
            <ImagesFigure />
          </Figure>
          <SamplingExplorer
            rows={["natural", "hold", "recon"]}
            methodToggle
            controls={["cutoff"]}
            spectrumView
            analysis
            caption="Move the cutoff. Below 2 kHz: the output vanishes. 2 to 6 kHz: a clean sine. Above 6 kHz: images get through as ripple and steps. Switch between natural samples and sample-and-hold: both give the sine; the held one is larger and a little later."
          />
          <Note tone="key" title="Size and timing">
            A natural gate that is closed half the time passes about half the
            message (2 of 4 Vp-p). A full-period hold passes about 0.9 of it at
            fs/fm = 4, and delays it by half a sampling period. Every filter
            adds its own delay.
          </Note>
        </Lesson>
      ),
      why: (
        <>
          <p>
            <strong>Where 6 and 10 kHz come from.</strong> Multiplying two sines
            gives their sum and difference: sin(2 kHz) × cos(8 kHz) contains 8 −
            2 = 6 kHz and 8 + 2 = 10 kHz. Each clock harmonic n·f<sub>s</sub>{" "}
            does the same.
          </p>
          <p>
            <strong>Real filters.</strong> A filter has a transition band
            between what it passes and what it blocks. The gap from 2 to 6 kHz
            gives the Tuneable LPF room for it; with a slower clock the gap
            shrinks and the filter&rsquo;s job gets harder.
          </p>
        </>
      ),
      questions: [
        "m-model",
        "m-recon",
        "i-why-lpf",
        "i-images",
        "i-cutoff",
        "i-cutoff-wrong",
        "i-amp-phase",
        "p-distinguish",
        "p-duty-zero",
        "p-sh-droop",
        "p-phase",
      ],
    },
    {
      id: "l11-play",
      kind: "theory",
      title: "11 · Experiment with everything",
      body: (
        <>
          <p>
            Every setting together, on one time axis. Try these before the
            practical:
          </p>
          <Terms
            items={[
              ["A", "Change fs: the number of samples per cycle is fs/fm."],
              [
                "B",
                "Compare the natural and S&H rows: curved tops with gaps, or flat steps.",
              ],
              [
                "C",
                "Take fs below 4 kHz: the LPF output takes the wrong frequency (aliasing).",
              ],
              [
                "D",
                "Take fs up to 16 or 100 kHz: finer steps, images far away.",
              ],
              [
                "E",
                "Move the cutoff: too low, the message fades; too high, images leak through.",
              ],
              [
                "F",
                "Press Next sample: the exact voltage captured at each instant.",
              ],
            ]}
          />
          <SamplingExplorer
            presets={[2, 3, 8, 16, 100]}
            controls={["fs", "fm", "phase", "duty", "cutoff"]}
            methodToggle
            spectrumView
            analysis
            caption="All rows from the trainer's switch, sample-and-hold and Tuneable LPF models. The pulse width changes the natural samples only: the sample-and-hold captures at the rising edge whatever the width."
          />
        </>
      ),
      questions: ["i-width", "p-unsync", "p-lpf-always"],
    },
  ],
};

// ---------------------------------------------------------------- Part 1
const part1: Section = {
  id: "natural",
  title: "Part 1 · Natural sampling",
  steps: [
    {
      id: "p0-scope",
      kind: "connect",
      title: "Find the modules; put the message on CH1",
      highlight: {
        links: [
          [MESSAGE, CH1],
          ["scope.ch1.gnd", "gnd.left"],
        ],
        ports: [DIG8, IN2, CTRL2, OUT, SH_IN, SH_OUT, CTRL1],
        controls: ["CH1 VOLTS/DIV", "TIME/DIV", "INT TRIGGER", "MODE"],
      },
      body: (
        <>
          <p>
            <strong>Find them first.</strong> On MASTER SIGNALS:{" "}
            <strong>2kHz SINE</strong> (the message) and{" "}
            <strong>8kHz DIGITAL</strong> (the sampling clock, a square socket
            because it is digital). On the DUAL ANALOG SWITCH: IN 1, IN 2,
            CONTROL 1, CONTROL 2, OUT, and at the top S&amp;H IN and S&amp;H
            OUT. They are ringed.
          </p>
          <ol>
            <li>2kHz SINE → CH1. CH1 black node → GND.</li>
            <li>
              CH1 <strong>1 V/div</strong>, DC coupling. TIME/DIV{" "}
              <strong>0.1 ms</strong>. Trigger INT, source <strong>CH1</strong>.
              MODE DUAL.
            </li>
          </ol>
          <p>
            You should see about two cycles of a 4 Vp-p sine: 4 divisions tall,
            about 4.8 divisions per cycle. CH1 keeps the message for the whole
            lab: it is the reference, and the trigger.
          </p>
        </>
      ),
      why: (
        <p>
          Triggering on the message makes every other trace stand still relative
          to it, so you can compare them cycle by cycle.
        </p>
      ),
      checks: [
        { label: "Message on CH1", test: probeOn(CH1)(MESSAGE) },
        scopeGrounded,
        { label: "Trigger on the message (CH1)", test: triggerOnMessage },
        { label: "Steady picture", test: steady },
      ],
    },
    {
      id: "p1-wire",
      kind: "connect",
      title: "Wire the natural sampler (Figure 2)",
      highlight: {
        links: [
          [MESSAGE, IN2],
          [DIG8, CTRL2],
          [OUT, CH2],
        ],
        controls: ["CH2 VOLTS/DIV", "CH2 POSITION", "MODE"],
      },
      body: (
        <>
          <ol>
            <li>
              2kHz SINE → <strong>IN 2</strong>: the message goes into the
              switch.
            </li>
            <li>
              8kHz DIGITAL → <strong>CONTROL 2</strong>: the clock opens and
              closes switch 2.
            </li>
            <li>
              <strong>OUT</strong> → CH2, 1 V/div, DC coupling.
            </li>
            <li>
              Use <strong>CH2 POSITION</strong> to bring the whole sampled trace on screen, below the message.
            </li>
          </ol>
          <p>
            <strong>Do not swap them.</strong> CONTROL is a logic input: it
            decides when the switch is closed. IN is the analog path. Message on
            CONTROL and clock on IN gives bursts of the clock, not samples.
          </p>
        </>
      ),
      why: (
        <p>
          The lab sheet&rsquo;s Figure 2 uses switch 2. Switch 1 (IN 1 with
          CONTROL 1) works the same way and is accepted, but CONTROL 1 also
          clocks the sample-and-hold you use next, so switch 2 keeps the two
          parts independent.
        </p>
      ),
      checks: [
        {
          label: "2 kHz SINE on the switch input",
          test: (b) => {
            const pair = naturalPair(b);
            if (!pair) return { ok: false };
            const r = fedBy(pair.input, MESSAGE)(b);
            return r.ok && pair.input === IN1
              ? {
                  ok: true,
                  detail: "On IN 1: fine, with the clock on CONTROL 1.",
                }
              : r;
          },
        },
        {
          label: "8 kHz DIGITAL on the matching CONTROL",
          test: (b) => {
            const pair = naturalPair(b) ?? { ctrl: CTRL2, name: "CONTROL 2" };
            if (b.linked(DIG8, pair.ctrl)) return fedBy(pair.ctrl, DIG8)(b);
            const other = pair.ctrl === CTRL2 ? CTRL1 : CTRL2;
            if (b.linked(DIG8, other))
              return {
                ok: false,
                detail: `The clock is on ${portName(other)}, which controls the other switch. Use ${pair.name}.`,
              };
            return { ok: false };
          },
        },
        { label: "Switch OUT on CH2", test: probeOn(CH2)(OUT) },
        {
          label: "Naturally sampled message at OUT",
          test: (b) => naturalResult(b),
        },
      ],
      questions: ["p-control-vs-in", "p-modules"],
    },
    {
      id: "p1-look",
      kind: "observe",
      title: "Observe and identify",
      highlight: { controls: ["TIME/DIV"] },
      body: (
        <>
          <h3 className="g-sub">What you see on CH2</h3>
          <ul>
            <li>
              Pulses whose tops follow the sine on CH1: curved, rising and
              falling with it.
            </li>
            <li>0 V between the pulses.</li>
            <li>Four pulses per message cycle: two above zero, two below.</li>
          </ul>
          <Choice
            q="Lab sheet, Question 1: what type of sampling is this?"
            options={[
              {
                text: "Natural",
                correct: true,
                why: "The switch passes the message itself while it is closed.",
              },
              {
                text: "Sample-and-hold",
                why: "A hold would show flat steps with no gaps.",
              },
            ]}
          />
          <Note tone="exam" title="Question 2: the two features">
            The tops are curved, following the message during each pulse; and
            the output returns to zero between pulses, because the switch is
            open.
          </Note>
          <Measure
            label="time between samples on your bench"
            unit="µs"
            precondition={(b) =>
              naturalBroken(b, null) ? "Wire the natural sampler first." : null
            }
            truth={(b) => {
              const f = b.frequency(clockOn(b, naturalPair(b)!.ctrl)!);
              return f > 0 ? 1e6 / f : null;
            }}
            working={(b, v) =>
              periodWorking(
                b,
                v * 1e-6,
                "The sampling period, from the start of one pulse to the start of the next,",
              )
            }
            hint="Measure from the rising edge of one pulse to the rising edge of the next, in divisions, and multiply by TIME/DIV."
          />
          <p className="g-small">
            120 µs, not 125: the trainer&rsquo;s &ldquo;8 kHz&rdquo; is 100 kHz
            ÷ 12 = 8.33 kHz. At 50 µs/div that is 2.4 divisions.
          </p>
        </>
      ),
      checks: [
        {
          label: "Naturally sampled message at OUT",
          test: (b) => naturalResult(b),
        },
        { label: "Steady picture", test: steady },
      ],
      questions: ["m-q1", "m-q2", "e-identify", "i-natural"],
    },
    {
      id: "p1-rates",
      kind: "observe",
      title: "Change the sampling rate (optional)",
      highlight: {
        links: [[DIG2, CTRL2]],
        unlink: [[DIG8, CTRL2]],
        ports: [DIG100],
      },
      body: (
        <>
          <p>
            The lab report, and the instructor&rsquo;s suggestion: try the
            trainer&rsquo;s other two clocks on CONTROL 2.
          </p>
          <ol>
            <li>
              Move the CONTROL 2 lead from 8kHz DIGITAL to{" "}
              <strong>2kHz DIGITAL</strong>. <em>Undersampling</em>: one window
              per message cycle, always the same half of the sine. Nothing
              between, so the shape of the message is lost.
            </li>
            <li>
              Then to <strong>100kHz DIGITAL</strong>. <em>Oversampling</em>: 48
              thin pulses per cycle, packed so closely that their tops trace out
              the whole sine.
            </li>
          </ol>
          <p>The next part puts the 8 kHz clock back.</p>
        </>
      ),
      why: (
        <p>
          With the 2 kHz clock, f<sub>s</sub> = f<sub>m</sub> and both come from
          the same master clock: the switch opens on the same point of every
          cycle. On a real board the phase between the clock and the sine
          decides which part you see; the lab report&rsquo;s photo shows a
          different part from this model.
        </p>
      ),
      checks: [
        {
          label: "A different clock on CONTROL 2",
          test: (b) => {
            const pair = naturalPair(b);
            const c = pair ? clockOn(b, pair.ctrl) : null;
            return {
              ok: c === DIG2 || c === DIG100,
              detail: rateVerdict(c, b),
            };
          },
        },
        { label: "Sampled output", test: (b) => naturalResult(b, null) },
      ],
      questions: ["i-clocks", "e-under", "e-over"],
    },
  ],
};

// ---------------------------------------------------------------- Part 2
const part2: Section = {
  id: "hold",
  title: "Part 2 · Sample-and-hold",
  steps: [
    {
      id: "p2-wire",
      kind: "connect",
      title: "Wire the sample-and-hold (Figure 4)",
      highlight: {
        links: [
          [MESSAGE, SH_IN],
          [DIG8, CTRL1],
          [SH_OUT, CH2],
        ],
        unlink: [[OUT, CH2]],
      },
      body: (
        <>
          <ol>
            <li>
              2kHz SINE → <strong>S&amp;H IN</strong>.
            </li>
            <li>
              8kHz DIGITAL → <strong>CONTROL 1</strong>: the
              sample-and-hold&rsquo;s clock.
            </li>
            <li>
              Move CH2: remove OUT → CH2, then <strong>S&amp;H OUT</strong> →
              CH2.
            </li>
          </ol>
          <p>
            Same message, same 8 kHz clock: only the circuit changes. CONTROL is
            the clock input; S&amp;H IN is the analog input. Do not swap them.
          </p>
        </>
      ),
      checks: [
        { label: "2 kHz SINE on S&H IN", test: fedBy(SH_IN, MESSAGE) },
        {
          label: "8 kHz DIGITAL on CONTROL 1",
          test: (b) =>
            b.linked(DIG8, CTRL1)
              ? fedBy(CTRL1, DIG8)(b)
              : b.linked(DIG8, CTRL2) && !b.linked(DIG8, CTRL1)
                ? {
                    ok: false,
                    detail:
                      "Only on CONTROL 2, which drives the switch, not the hold.",
                  }
                : { ok: false },
        },
        { label: "S&H OUT on CH2", test: probeOn(CH2)(SH_OUT) },
        { label: "Held samples at S&H OUT", test: (b) => holdResult(b) },
      ],
      questions: ["p-modules", "i-hold"],
    },
    {
      id: "p2-look",
      kind: "observe",
      title: "Observe the staircase",
      highlight: { controls: ["TIME/DIV"] },
      body: (
        <>
          <ul>
            <li>A staircase: flat steps, no gaps.</li>
            <li>
              The level changes only at a sampling instant, then stays put.
            </li>
            <li>
              The steps outline the sine on CH1, one sampling period late at
              most.
            </li>
          </ul>
          <NumberAnswer
            q="How many steps per message cycle?"
            answer={4}
            unit="steps"
            explain={
              <>
                f<sub>s</sub>/f<sub>m</sub> = 8/2 = <strong>4</strong>: one
                message cycle (480 µs on the trainer) holds four sampling
                periods of 120 µs.
              </>
            }
          />
          <Measure
            label="length of one step on your bench"
            unit="µs"
            precondition={(b) =>
              holdBroken(b, null) ? "Wire the sample-and-hold first." : null
            }
            truth={(b) => {
              const f = b.frequency(clockOn(b, CTRL1)!);
              return f > 0 ? 1e6 / f : null;
            }}
            working={(b, v) =>
              periodWorking(
                b,
                v * 1e-6,
                "Each step lasts one sampling period, which",
              )
            }
            hint="Measure one flat step from the jump that starts it to the jump that ends it."
          />
          <Note tone="hardware" title="The levels in the lab report's photo">
            In this model the clock rises exactly at the sine&rsquo;s zero
            crossing, so the four levels are 0, +2, 0 and −2 V. The
            report&rsquo;s photo shows four steps at other heights: on the real
            board the clock and the sine have some phase offset. Still four
            steps, still a staircase.
          </Note>
        </>
      ),
      checks: [
        { label: "Held samples at S&H OUT", test: (b) => holdResult(b) },
        { label: "Steady picture", test: steady },
      ],
      questions: [
        "e-four-steps",
        "i-analog",
        "i-adc",
        "p-photo-heights",
        "e-identify",
      ],
    },
    {
      id: "p2-rates",
      kind: "observe",
      title: "Change the sampling rate (optional)",
      highlight: {
        links: [[DIG2, CTRL1]],
        unlink: [[DIG8, CTRL1]],
        ports: [DIG100],
      },
      body: (
        <>
          <ol>
            <li>
              CONTROL 1 to <strong>2kHz DIGITAL</strong>: the output is a{" "}
              <strong>flat line</strong>. Every sample is taken at the same
              point of the cycle, here a zero crossing, so every held value is
              the same: 0 V.
            </li>
            <li>
              Then <strong>100kHz DIGITAL</strong>: 48 tiny steps per cycle; the
              staircase looks almost like the sine.
            </li>
          </ol>
          <Note tone="caution" title="Why flat here">
            This is the special case f<sub>s</sub> = f<sub>m</sub> with the
            clock locked to the message. It is not what undersampling always
            does. The lab report&rsquo;s &ldquo;no clear output&rdquo; is this
            flat line.
          </Note>
        </>
      ),
      checks: [
        {
          label: "A different clock on CONTROL 1",
          test: (b) => {
            const c = clockOn(b, CTRL1);
            return {
              ok: c === DIG2 || c === DIG100,
              detail: rateVerdict(c, b),
            };
          },
        },
        { label: "Held output", test: (b) => holdResult(b, null) },
      ],
      questions: ["i-fs-fm", "p-2k-flat", "e-under", "e-over"],
    },
  ],
};

// ---------------------------------------------------------------- Part 3
const part3: Section = {
  id: "reconstruct",
  title: "Part 3 · Reconstruction",
  steps: [
    {
      id: "p3-natural",
      kind: "connect",
      title: "Filter the natural samples",
      highlight: {
        links: [
          [OUT, TLPF_IN],
          [TLPF_OUT, CH2],
          [DIG8, CTRL2],
        ],
        unlink: [
          [SH_OUT, CH2],
          [DIG2, CTRL2],
          [DIG100, CTRL2],
        ],
        controls: ["TUNEABLE LPF fc", "TUNEABLE LPF GAIN"],
      },
      body: (
        <>
          <ol>
            <li>Make sure 8kHz DIGITAL is back on CONTROL 2.</li>
            <li>
              Switch <strong>OUT</strong> → TUNEABLE LPF <strong>IN</strong>.
            </li>
            <li>
              Move CH2 to the TUNEABLE LPF <strong>OUT</strong>. GAIN in the
              middle (×1).
            </li>
            <li>
              Turn <strong>fc</strong> fully clockwise (12 kHz): images pass,
              the sine is rough. Turn it down until the sine is smooth, about 3
              kHz. Turn it fully anticlockwise (600 Hz): the sine disappears.
              Then set it back to about 3 kHz.
            </li>
          </ol>
        </>
      ),
      why: (
        <p>
          Between 2 kHz and 6 kHz the filter keeps the message and rejects the
          first image. Too high and the 6 and 10 kHz images get through; too low
          and the message itself is cut.
        </p>
      ),
      checks: [
        {
          label: "Natural sampler on the 8 kHz clock",
          test: (b) => {
            const broken = naturalBroken(b);
            return broken
              ? { ok: false, detail: `Not yet: ${broken}.` }
              : { ok: true };
          },
        },
        { label: "Switch OUT into the LPF", test: fedBy(TLPF_IN, OUT) },
        { label: "LPF output on CH2", test: probeOn(CH2)(TLPF_OUT) },
        {
          label: "Recovered 2 kHz sine",
          test: (b) =>
            naturalBroken(b) || !b.linked(TLPF_IN, OUT)
              ? {
                  ok: false,
                  detail: "The sampler or the filter is not connected yet.",
                }
              : recovered(b, 1),
        },
      ],
      questions: [
        "m-recon",
        "i-why-lpf",
        "i-cutoff",
        "i-cutoff-wrong",
        "p-distinguish",
      ],
    },
    {
      id: "p3-measure",
      kind: "observe",
      title: "Measure the recovered message",
      highlight: { controls: ["TIME/DIV", "CH2 VOLTS/DIV"] },
      body: (
        <>
          <p>
            TIME/DIV <strong>0.1 ms</strong>. Measure one cycle of the sine on
            CH2 and compare with CH1.
          </p>
          <NumberAnswer
            q="A recovered sine's period is 500 µs. What is its frequency?"
            answer={2}
            unit="kHz"
            explain={
              <>
                f = 1/T = 1/500 µs = <strong>2 kHz</strong>: the message
                frequency. On the trainer you will read about 480 µs (4.8 div at
                0.1 ms/div): 2.08 kHz.
              </>
            }
          />
          <Measure
            label="period of the recovered message"
            unit="µs"
            precondition={(b) =>
              b.tone(TLPF_OUT).messageVpp < 0.2
                ? "No recovered sine at the LPF output yet."
                : null
            }
            truth={(b) => {
              const f = b.frequency(TLPF_OUT, 4e-3, 0.5e-6);
              return f > 0 ? 1e6 / f : null;
            }}
            working={(b, v) => periodWorking(b, v * 1e-6, "The period")}
            hint="From one upward zero crossing to the next, in divisions, times TIME/DIV."
          />
          <ul>
            <li>
              <strong>Same frequency</strong> as CH1, smooth, no steps.
            </li>
            <li>
              <strong>Smaller</strong>: about 2 Vp-p against 4. The switch
              passes the message only half of the time.
            </li>
            <li>
              <strong>A little later</strong> than CH1: every filter delays.
            </li>
          </ul>
        </>
      ),
      checks: [
        {
          label: "Recovered 2 kHz sine",
          test: (b) =>
            b.linked(TLPF_IN, OUT) && !naturalBroken(b)
              ? recovered(b, 1)
              : { ok: false, detail: "Filter the natural samples first." },
        },
        { label: "Steady picture", test: steady },
      ],
      questions: ["i-verify", "e-recovered", "i-amp-phase"],
    },
    {
      id: "p3-hold",
      kind: "connect",
      title: "Filter the sample-and-hold output",
      highlight: {
        links: [
          [SH_OUT, TLPF_IN],
          [DIG8, CTRL1],
        ],
        unlink: [
          [OUT, TLPF_IN],
          [DIG2, CTRL1],
          [DIG100, CTRL1],
        ],
        controls: ["TUNEABLE LPF fc", "CH2 VOLTS/DIV"],
      },
      body: (
        <>
          <ol>
            <li>Make sure 8kHz DIGITAL is on CONTROL 1.</li>
            <li>
              Move the LPF input: remove OUT → LPF IN, then{" "}
              <strong>S&amp;H OUT</strong> → LPF IN.
            </li>
            <li>Keep CH2 on the LPF output and fc about 3 kHz.</li>
          </ol>
          <h3 className="g-sub">What you see</h3>
          <ul>
            <li>The same smooth 2 kHz sine, a little later than before.</li>
            <li>
              <strong>Larger</strong> than from natural sampling, as in the lab
              report: about 3.4 Vp-p against 1.9 here.
            </li>
          </ul>
        </>
      ),
      why: (
        <p>
          The natural gate passes the message half of the time; the hold keeps
          every sample for the whole period. So the 2 kHz component of the
          staircase is about 0.9 × 4 Vp-p, against 0.5 × 4 Vp-p for the gated
          pulses. The 0.9 is the hold&rsquo;s droop at f<sub>s</sub>/f
          <sub>m</sub> = 4, and the hold adds about half a sampling period of
          delay.
        </p>
      ),
      checks: [
        {
          label: "Sample-and-hold on the 8 kHz clock",
          test: (b) => {
            const broken = holdBroken(b);
            return broken
              ? { ok: false, detail: `Not yet: ${broken}.` }
              : { ok: true };
          },
        },
        { label: "S&H OUT into the LPF", test: fedBy(TLPF_IN, SH_OUT) },
        { label: "LPF output on CH2", test: probeOn(CH2)(TLPF_OUT) },
        {
          label: "Recovered 2 kHz sine",
          test: (b) =>
            holdBroken(b) || !b.linked(TLPF_IN, SH_OUT)
              ? {
                  ok: false,
                  detail:
                    "The sample-and-hold or the filter is not connected yet.",
                }
              : recovered(b, 2),
        },
      ],
      questions: ["e-recon-amp", "e-same-recovery", "p-sh-droop", "p-phase"],
    },
    {
      id: "p3-alias",
      kind: "adjust",
      title: "See aliasing on the bench (optional)",
      highlight: {
        links: [
          [VCO_DIG, CTRL1],
          [VCO_IN, "gnd.left"],
        ],
        unlink: [[DIG8, CTRL1]],
        controls: ["VCO range", "VCO FREQ", "TUNEABLE LPF fc", "INT TRIGGER"],
      },
      body: (
        <>
          <Note tone="hardware" title="Not in the lab sheet">
            An extension: the trainer&rsquo;s fixed clocks cannot make 3 kHz,
            but the VCO can. Its DIGITAL output is a 0–5 V square wave at its
            own frequency.
          </Note>
          <ol>
            <li>VCO INPUT → GND. VCO on LO.</li>
            <li>
              Move CONTROL 1 from 8kHz DIGITAL to <strong>VCO DIGITAL</strong>.
            </li>
            <li>
              Turn VCO FREQ down to about <strong>3 kHz</strong>. The check
              reads the clock for you; to measure it yourself, put CH2 on VCO
              DIGITAL: 3 kHz is 333 µs, 3.3 div at 0.1 ms/div.
            </li>
            <li>
              LPF fc down to about <strong>1.5 kHz</strong>: half the new
              sampling rate. CH2 on the LPF output, trigger on{" "}
              <strong>CH2</strong> (the VCO is not locked to the message).
            </li>
          </ol>
          <p>
            The output is a sine of about <strong>0.9 kHz</strong>: f
            <sub>s</sub> − f<sub>m</sub> = 3.0 − 2.08 kHz. A frequency that was
            never in the message. That is aliasing, measured.
          </p>
          <Measure
            label="frequency of the aliased output"
            unit="kHz"
            precondition={(b) =>
              !b.linked(VCO_DIG, CTRL1)
                ? "Put VCO DIGITAL on CONTROL 1 first."
                : b.reading(TLPF_OUT, { duration: 4e-3, dt: 0.5e-6 }).vpp < 0.2
                  ? "No signal at the LPF output yet."
                  : null
            }
            truth={(b) => {
              const f = b.frequency(TLPF_OUT, 8e-3, 0.5e-6);
              return f > 0 ? f / 1000 : null;
            }}
            working={(b, v) => periodWorking(b, 1 / (v * 1000), "The period")}
            hint="Trigger on CH2, choose 0.2 ms/div, and measure one full cycle."
          />
        </>
      ),
      why: (
        <p>
          Afterwards, put 8kHz DIGITAL back on CONTROL 1 and fc back to about 3
          kHz: the 2 kHz message returns. Same circuit, same filter idea: only
          the sampling rate decided whether the output was right.
        </p>
      ),
      checks: [
        {
          label: "VCO input at 0 V",
          test: (b) =>
            b.drivers(VCO_IN).length
              ? { ok: false, detail: "Something is driving the VCO input." }
              : { ok: b.grounded(VCO_IN) },
        },
        { label: "VCO DIGITAL on CONTROL 1", test: fedBy(CTRL1, VCO_DIG) },
        {
          label: "Clock below the Nyquist rate (2.2–4 kHz)",
          test: (b) => {
            const f = b.frequency(VCO_DIG);
            return {
              ok: f > 2300 && f < 3900,
              detail: `VCO clock ${khz(f)}; Nyquist rate 2 × 2.08 = 4.17 kHz.`,
            };
          },
        },
        {
          label: "LPF output at the alias frequency fs − fm",
          test: (b) => {
            if (!b.linked(TLPF_IN, SH_OUT) || !b.linked(VCO_DIG, CTRL1))
              return {
                ok: false,
                detail:
                  "Filter the sample-and-hold output, clocked by the VCO.",
              };
            const fsHz = b.frequency(VCO_DIG);
            const expect = Math.abs(fsHz - F_MESSAGE);
            const fo = b.frequency(TLPF_OUT, 8e-3, 0.5e-6);
            const vpp = b.reading(TLPF_OUT, { duration: 4e-3, dt: 0.5e-6 }).vpp;
            return {
              ok:
                vpp > 0.3 &&
                expect > 150 &&
                Math.abs(fo - expect) < 0.15 * expect,
              detail: `Measured ${khz(fo)}, ${vpp.toFixed(1)} Vp-p; fs − fm = ${khz(fsHz)} − ${khz(F_MESSAGE)} = ${khz(expect)}.`,
            };
          },
        },
      ],
      questions: ["i-3k", "i-lpf-cant", "p-after-alias", "i-two-filters"],
    },
  ],
};

// ---------------------------------------------------------------- summary
const conclusions: Section = {
  id: "conclusions",
  title: "Conclusions",
  steps: [
    {
      id: "g-summary",
      kind: "summary",
      title: "What the experiment showed",
      body: (
        <>
          <Terms
            items={[
              [
                "Natural sampling",
                "Dual Analog Switch: curved tops following the message, 0 V between; four pulses per cycle at 8 kHz.",
              ],
              [
                "Sample-and-hold",
                "Flat steps held for one sampling period (120 µs); four steps per cycle; still analog.",
              ],
              [
                "2 kHz clock",
                "Undersampling at fs = fm: the same point of every cycle; the held output was flat.",
              ],
              [
                "100 kHz clock",
                "Oversampling: about 50 samples per cycle; the samples almost trace the sine.",
              ],
              [
                "Tuneable LPF",
                "With fc between 2 and 6 kHz, both sampled signals gave back the smooth 2 kHz sine (period about 480 µs).",
              ],
              [
                "Amplitude",
                "From sample-and-hold the recovered sine was larger than from natural sampling.",
              ],
            ]}
          />
          <Note tone="exam" title="A 30-second answer">
            We sampled the 2 kHz sine with the 8 kHz clock in two ways. The Dual
            Analog Switch gave natural sampling: pulses with curved tops that
            follow the message and zero between them. The sample-and-hold gave a
            staircase of flat steps, four per cycle, because 8/2 = 4. Sampling
            at 2 kHz, below the Nyquist rate of 4 kHz, lost the message; at 100
            kHz the samples traced it closely. Passing either sampled signal
            through the Tuneable LPF, with the cutoff between the 2 kHz message
            and the 6 kHz image, recovered the 2 kHz sine.
          </Note>
        </>
      ),
      questions: ["e-same-recovery", "e-identify", "i-nyquist"],
    },
    {
      id: "g-sheet",
      kind: "summary",
      title: "The lab sheet's questions",
      body: (
        <p>
          The lab sheet asks two questions about the switch output, in Part 1.
          Its background explains the model behind the reconstruction.
        </p>
      ),
      questions: [
        "m-q1",
        "m-q2",
        "m-model",
        "m-recon",
        "m-pam",
        "m-why-digital",
      ],
    },
  ],
};

// ------------------------------------------------------------------ exam
const exam: Section = {
  id: "exam",
  title: "Final oral exam preparation",
  steps: [
    {
      id: "exam-bank",
      kind: "exam",
      title: "Lab 6: Final Oral Exam Preparation",
      body: (
        <p>
          Every question for this lab, by source.{" "}
          <strong>Practice oral exam</strong> asks one at a time, hardest first,
          and brings back the ones you did not know. The next step is a one-page
          revision sheet.
        </p>
      ),
    },
    {
      id: "exam-must-know",
      kind: "summary",
      title: "Must-know revision",
      body: (
        <>
          <h3 className="g-sub">Definitions</h3>
          <Terms
            items={[
              [
                "Sampling",
                "Measuring the voltage at regular instants. Time becomes discrete; voltage does not.",
              ],
              [
                "Quantization / encoding",
                "Rounding each sample to a level / writing the level as bits (Lab 7).",
              ],
              [
                <>
                  f<sub>s</sub>, T<sub>s</sub>
                </>,
                <>
                  Samples per second; time between samples, T<sub>s</sub> = 1/f
                  <sub>s</sub>.
                </>,
              ],
              [
                "Natural sampling",
                "Switch passes the message during each pulse: curved tops, zero between.",
              ],
              [
                "Sample-and-hold",
                "Captures at the instant, holds until the next: flat steps, no gaps. Also PAM.",
              ],
              [
                "Nyquist rate",
                "2 × the highest message frequency (4 kHz here).",
              ],
              ["Nyquist frequency", "fs/2 of the sampler (4 kHz here)."],
              [
                "Aliasing",
                "Too slow a clock: the samples also fit a lower frequency, which is what gets rebuilt.",
              ],
              [
                "Oversampling",
                "Sampling well above the Nyquist rate: easier filtering, more data.",
              ],
              [
                "Reconstruction",
                "LPF keeps the message copy, removes the images at n·fs ± fm.",
              ],
            ]}
          />
          <h3 className="g-sub">Equations and values</h3>
          <Eq>
            <V>f</V>
            <sub>s</sub> &gt; 2<V>f</V>
            <sub>max</sub> &nbsp;·&nbsp; <V>T</V>
            <sub>s</sub> = 1/<V>f</V>
            <sub>s</sub> &nbsp;·&nbsp; <V>y</V> = <V>x</V> · <V>p</V>{" "}
            &nbsp;·&nbsp; images at <V>n</V>
            <V>f</V>
            <sub>s</sub> ± <V>f</V>
            <sub>m</sub>
          </Eq>
          <ul>
            <li>
              Message 2 kHz (T = 500 µs; 2.083 kHz, 480 µs on the trainer).
              Clock 8 kHz (T<sub>s</sub> = 125 µs; 8.333 kHz, 120 µs).
            </li>
            <li>
              Four samples per cycle. Nyquist rate 4 kHz. Images 6 and 10 kHz.
              Cutoff between 2 and 6 kHz.
            </li>
            <li>
              Under: 2 kHz clock (flat held output). Over: 100 kHz clock (about
              50 per cycle).
            </li>
          </ul>
          <h3 className="g-sub">Connections</h3>
          <ul>
            <li>
              Natural: 2kHz SINE → IN 2; 8kHz DIGITAL → CONTROL 2; OUT → CH2.
              Message → CH1.
            </li>
            <li>
              Sample-and-hold: 2kHz SINE → S&amp;H IN; 8kHz DIGITAL → CONTROL 1;
              S&amp;H OUT → CH2.
            </li>
            <li>
              Reconstruction: OUT or S&amp;H OUT → TUNEABLE LPF IN; LPF OUT →
              CH2; fc about 3 kHz.
            </li>
          </ul>
          <h3 className="g-sub">Mistakes to avoid</h3>
          <ul>
            <li>
              Calling the held output digital: it is analog until quantized and
              encoded.
            </li>
            <li>
              Saying undersampling always gives a flat line: flat is the special
              case fs = fm at a fixed phase.
            </li>
            <li>Thinking a better filter can undo aliasing.</li>
            <li>Swapping CONTROL (clock) and IN (message).</li>
            <li>Saying a higher fs raises the message frequency.</li>
          </ul>
          <h3 className="g-sub">Answers to know by heart</h3>
          <ol className="must-know">
            <li>
              Sampling measures the message&rsquo;s voltage at regular instants.
            </li>
            <li>
              8 kHz / 2 kHz = 4 samples per cycle: 125 µs apart in a 500 µs
              cycle.
            </li>
            <li>Natural sampling: y = x·p; curved tops, zero between.</li>
            <li>
              Sample-and-hold: captures and holds; flat steps; still analog;
              steadies the ADC input.
            </li>
            <li>
              Identify natural by curved tops and zero gaps (lab sheet Q1, Q2).
            </li>
            <li>Nyquist: fs &gt; 2fm; for 2 kHz, above 4 kHz.</li>
            <li>
              Nyquist rate is 2fm (the signal); Nyquist frequency is fs/2 (the
              sampler).
            </li>
            <li>
              Exactly twice is a boundary: zero-crossing samples give all zeros;
              filters need room.
            </li>
            <li>
              Aliasing: 2 kHz sampled at 3 kHz fits 1 kHz; the filter rebuilds 1
              kHz; it cannot be undone.
            </li>
            <li>
              fs = fm: the same point every cycle, so the held output is
              constant (zero at zero crossings).
            </li>
            <li>
              Anti-alias LPF before the sampler; reconstruction LPF after it.
            </li>
            <li>
              Oversampling: finer steps, images further away, but more data to
              process.
            </li>
            <li>
              The sampled signal contains fm plus images at n·fs ± fm: 6 and 10
              kHz here.
            </li>
            <li>
              Cutoff too low cuts the message; too high lets images through.
            </li>
            <li>
              Sample-and-hold recovers a larger sine than a 50 % natural gate,
              slightly delayed.
            </li>
          </ol>
        </>
      ),
    },
  ],
};

const guide: Guide = {
  labId: 6,
  title: "Sampling and Reconstruction",
  sections: [theory, part1, part2, part3, conclusions, exam],
  questions: QUESTIONS,
  bank: BANK,
};

export default guide;
