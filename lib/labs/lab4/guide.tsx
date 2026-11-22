import { Eq, Figure, Frac, Lesson, Note, Settings, Terms, V } from "@/components/guide/parts";
import { Choice, NumberAnswer } from "@/components/guide/Quiz";
import { switchValue } from "@/lib/controls/emonaControls";
import type { Bench } from "@/lib/guide/bench";
import type { Check, CheckResult, Guide, Section } from "@/lib/guide/types";
import { F_MESSAGE } from "@/lib/sim/modules";
import { CH1, CH2, MESSAGE, steady } from "../am";
import { fedBy, probeOn } from "../checks";
import { MeasureFrequency, ReadingsTable, gainOf, restOf, vcoSwing } from "./bench-tools";
import { FmExplorer } from "./explorer";
import {
  AmFmFigure,
  FmChainFigure,
  FmSpectrumFigure,
  NoiseFigure,
  PeriodFigure,
  RangeFigure,
  VcoLawFigure,
  VcoModuleFigure,
} from "./figures";
import { BANK, QUESTIONS } from "./questions";

/**
 * Lab 4 — Frequency Modulation.
 *
 * Procedure follows the Experiment 4 lab sheet: map the VCO's rest-frequency
 * range with its input grounded (Part A), set a 10 kHz carrier (Part B), apply
 * the 2 kHz sine message (Part C). Part D, the effect of message amplitude, is
 * the lab sheet's stated aim carried out with a sine instead of speech, and is
 * marked optional. Every check reads the simulated circuit; frequencies come
 * from the same VCO law the simulator uses.
 */

const VCO_IN = "vco.in";
const VCO_OUT = "vco.sine";
const BUF_IN = "buffer.in";
const BUF_OUT = "buffer.out";

const khz = (hz: number, d = 2) => `${(hz / 1000).toFixed(d)} kHz`;

// ----------------------------------------------------------------- checks
const inputGrounded = (b: Bench): CheckResult => {
  const drivers = b.drivers(VCO_IN);
  if (drivers.length) return { ok: false, detail: "Something is still driving the VCO input: it must be at 0 V." };
  return { ok: b.grounded(VCO_IN) };
};
const outputOnCh1: Check = { label: "VCO SINE output on CH1", test: probeOn(CH1)(VCO_OUT) };
const range =
  (r: 0 | 1): Check =>
  ({
    label: `Range switch on ${r ? "HI" : "LO"}`,
    test: (b) => ({ ok: switchValue(b.controls.emona, "vco.range") === r }),
  });
const rest10: Check = {
  label: "Rest frequency is 10 kHz",
  test: (b) => {
    if (!b.linked(VCO_OUT, CH1)) return { ok: false, detail: "Connect the VCO's SINE output to CH1 to see it." };
    const f = restOf(b);
    if (Math.abs(f - 10_000) <= 250) return { ok: true, detail: `${khz(f)}: period ${(1e6 / f).toFixed(0)} µs, ${(1e6 / f / 20).toFixed(1)} divisions at 20 µs/div` };
    return {
      ok: false,
      detail: `Not 10 kHz yet: at 20 µs/div one cycle should span exactly 5 divisions. Right now the cycles are ${f > 10_000 ? "too close together (frequency too high)" : "too far apart (frequency too low)"}.`,
    };
  },
};
const swing = (b: Bench): CheckResult => {
  const s = vcoSwing(b);
  const beta = s.deviation / F_MESSAGE;
  return {
    ok: s.deviation > 1000,
    detail: `The frequency swings ${khz(s.fmin, 1)} – ${khz(s.fmax, 1)}: Δf = ${khz(s.deviation)}, β = Δf / fm = ${beta.toFixed(2)}`,
  };
};

// ----------------------------------------------------------------- theory
const theory: Section = {
  id: "theory",
  title: "Understand FM",
  steps: [
    {
      id: "l1-am-fm",
      kind: "theory",
      title: "1 · From AM to FM",
      body: (
        <Lesson
          ask="What is actually changing in FM?"
          numbers={
            <>
              Message 2 kHz, carrier 10 kHz. In AM every carrier cycle lasts 100 µs and only the height changes. In FM the
              height stays at 4 Vp-p and the cycles last anywhere from about 80 to 140 µs as the message rises and falls.
            </>
          }
          bench={
            <>
              In Lab 2 the <strong>Multiplier</strong> made AM by scaling the carrier. Here the <strong>VCO</strong> makes
              FM by changing its own speed: no multiplier at all.
            </>
          }
          oral="AM varies the carrier's amplitude with the message and keeps its frequency constant; FM varies the carrier's frequency with the message and keeps its amplitude constant."
          check={
            <Choice
              q="If the message becomes stronger, what does the FM carrier do?"
              options={[
                { text: "It becomes taller", why: "That is AM. In FM the carrier's height never depends on the message." },
                {
                  text: "Its frequency swings further from the rest frequency",
                  correct: true,
                  why: "A bigger message voltage pushes the frequency further up and further down. The height stays the same.",
                },
                { text: "Its rest frequency goes up", why: "The rest frequency is set by the VCO's dial, not by the message. The message moves the frequency around it." },
                { text: "Nothing changes", why: "The message is what modulates the carrier; a stronger message changes the FM signal." },
              ]}
            />
          }
        >
          <p>
            A <strong>message</strong> is the information, here a slow 2 kHz sine. A <strong>carrier</strong> is a
            faster sine that does the travelling. <strong>Modulation</strong> means letting the message change the
            carrier.
          </p>
          <p>
            In Lab 2 the message changed the carrier&rsquo;s <strong>height</strong> (AM). In FM the message changes how{" "}
            <strong>fast</strong> the carrier oscillates; its height stays the same.
          </p>
          <Figure caption="Same message, two ways of carrying it.">
            <AmFmFigure />
          </Figure>
          <Note tone="key">AM: amplitude changes. FM: frequency changes, amplitude constant.</Note>
        </Lesson>
      ),
      why: (
        <p>
          The lab sheet&rsquo;s reason for FM: noise in the channel mostly changes a signal&rsquo;s <em>amplitude</em>. An
          AM receiver reads amplitude, so the noise lands in the message. An FM receiver reads frequency instead, so it
          is far less affected. You will see why in lesson 7.
        </p>
      ),
      questions: ["r-am-fm", "p-what-changes"],
    },
    {
      id: "l2-frequency",
      kind: "theory",
      title: "2 · Frequency and period",
      body: (
        <Lesson
          ask="What does “10 kHz” actually mean?"
          numbers={
            <Terms
              items={[
                ["1 kHz", "1000 cycles per second, so each lasts 1 ms."],
                ["10 kHz", "10,000 per second, each 100 µs."],
                ["100 kHz", "each cycle 10 µs."],
              ]}
            />
          }
          bench={
            <>
              The oscilloscope has no frequency readout. <strong>TIME/DIV</strong> says how much time one horizontal
              division represents. Count the divisions of one cycle, multiply by TIME/DIV: that is the period.
            </>
          }
          oral="I measure the period on the screen as divisions times TIME/DIV; the frequency is one over the period."
          check={
            <NumberAnswer
              q="TIME/DIV is 50 µs and one cycle spans 4 divisions. What is the frequency?"
              answer={5}
              unit="kHz"
              explain={
                <>
                  T = 4 div × 50 µs = 200 µs, so f = 1 / 200 µs = <strong>5 kHz</strong>.
                </>
              }
            />
          }
        >
          <p>
            One <strong>cycle</strong> is one complete wave: up, down, and back to the start. The <strong>period</strong>{" "}
            T is how long one cycle takes. The <strong>frequency</strong> f is how many cycles happen in one second.
          </p>
          <Eq>
            <V>f</V> = <Frac n="1" d={<V>T</V>} />
          </Eq>
          <p>Shorter cycles, more of them each second: higher frequency.</p>
          <Figure caption="A 10 kHz sine at 20 µs/div: one cycle covers 5 divisions.">
            <PeriodFigure f={10} tdiv={20} />
          </Figure>
        </Lesson>
      ),
      why: (
        <p>
          Read from one rising zero crossing to the next, and pick a TIME/DIV that spreads one or a few cycles over the
          screen. Measuring several cycles and dividing by their number reduces the reading error. Changing TIME/DIV
          changes only the scale on the screen, never the signal.
        </p>
      ),
      questions: ["e-measure", "i-period", "p-timediv"],
    },
    {
      id: "l3-vco",
      kind: "theory",
      title: "3 · The VCO",
      highlight: { ports: [VCO_IN, VCO_OUT], controls: ["VCO FREQ", "VCO GAIN", "VCO range"] },
      body: (
        <Lesson
          ask="What does a voltage-controlled oscillator do?"
          numbers={
            <>
              On this trainer, with the GAIN half-way and the range on LO, each extra volt at the input raises the
              frequency by about 1.33 kHz: 0 V gives the rest frequency, +2 V gives 2.7 kHz more, −2 V gives 2.7 kHz less.
            </>
          }
          bench={
            <>
              The VCO is marked on the trainer. <strong>VCO INPUT</strong> is where the control voltage goes in.{" "}
              <strong>SINE</strong> is where the carrier comes out. Do not mix them up: one is a voltage you apply, the
              other is the wave the VCO makes.
            </>
          }
          oral="A VCO is an oscillator whose output frequency is set by its input voltage; feed it the message and its frequency follows the message, which is FM."
          check={
            <Choice
              q="Which socket does the message go into to make FM?"
              options={[
                { text: "VCO INPUT", correct: true, why: "The input is the control: its voltage sets the frequency of the output." },
                { text: "SINE", why: "SINE is an output: the carrier the VCO produces. Never drive an output." },
                { text: "DIGITAL", why: "DIGITAL is also an output: a square-wave version of the same oscillation." },
              ]}
            />
          }
        >
          <p>
            An <strong>oscillator</strong> produces a wave all by itself, continuously. A <strong>VCO</strong> is an
            oscillator whose frequency depends on the <strong>voltage at its input</strong>.
          </p>
          <p>
            Change the input voltage and the output frequency changes. So if the input voltage is the message, the
            output frequency follows the message: that is FM, made directly.
          </p>
          <Figure caption="The trainer's VCO module.">
            <VcoModuleFigure />
          </Figure>
          <Figure caption="The VCO's law: a straight line through the rest frequency at 0 V.">
            <VcoLawFigure rest={10} k={1.33} />
          </Figure>
        </Lesson>
      ),
      why: (
        <>
          <p>The VCO obeys, within its range:</p>
          <Eq>
            <V>f</V>(<V>t</V>) = <V>f</V>
            <sub>rest</sub> + <V>k</V> · <V>v</V>(<V>t</V>)
          </Eq>
          <p>
            <V>k</V> is the <strong>sensitivity</strong> in Hz per volt; on the trainer the <strong>GAIN</strong> knob
            sets it. The <strong>FREQ</strong> dial sets <V>f</V>
            <sub>rest</sub>, and the <strong>HI/LO</strong> switch selects the range the dial covers.
          </p>
        </>
      ),
      questions: ["i-vco", "i-how", "i-sensitivity", "p-no-multiplier"],
    },
    {
      id: "l4-rest",
      kind: "theory",
      title: "4 · The rest frequency",
      body: (
        <Lesson
          ask="If the VCO input is connected to GND, why does it still produce a sine wave?"
          numbers={<>Dial set for 10 kHz: with 0 V at the input, a steady 10 kHz, period 100 µs, 5 divisions at 20 µs/div.</>}
          bench={
            <>
              In Part A you connect VCO INPUT to a GND socket and look at the output. The <strong>FREQ dial</strong> moves
              the rest frequency; nothing else does.
            </>
          }
          oral="Grounding sets the control voltage to 0 V, so the VCO runs at its rest frequency; it does not switch it off."
          check={
            <Choice
              q="The VCO input is grounded. What does the oscilloscope show at the SINE output?"
              options={[
                { text: "A flat line: 0 V in, nothing out", why: "Ground is a control value, not an off switch. The oscillator keeps oscillating." },
                { text: "A steady sine at the rest frequency", correct: true, why: "0 V at the input means no shift: the VCO runs at the frequency its dial is set to." },
                { text: "A 0 Hz signal", why: "0 V does not mean 0 Hz. The frequency is the rest frequency plus k × 0 V = the rest frequency." },
                { text: "A wave whose frequency keeps changing", why: "With a constant input voltage there is nothing to change the frequency." },
              ]}
            />
          }
        >
          <p>
            Ground means the control voltage is <strong>0 V</strong>. It does not switch the VCO off: an oscillator
            oscillates by itself.
          </p>
          <p>
            With 0 V at its input the VCO runs at its <strong>rest frequency</strong>, also called the{" "}
            <strong>free-running</strong>, <strong>centre</strong> or <strong>carrier</strong> frequency. The message
            later moves the frequency above and below it.
          </p>
          <FmExplorer
            initial={{ am: 0 }}
            controls={["am", "fc"]}
            caption="Message amplitude 0: the FM row is exactly the carrier. Raise the amplitude and the frequency starts moving around the rest frequency; change the rest frequency and the whole pattern moves."
          />
        </Lesson>
      ),
      questions: ["e-rest", "i-zero", "e-why-ground", "p-constant", "i-rest-first"],
    },
    {
      id: "l5-deviation",
      kind: "theory",
      title: "5 · Frequency deviation",
      body: (
        <Lesson
          ask="How far does the frequency move?"
          numbers={
            <>
              Rest 10 kHz, deviation 2 kHz: the frequency swings between <strong>12 kHz</strong> and{" "}
              <strong>8 kHz</strong>. These are illustrative values; you will measure the bench&rsquo;s own in Part C.
            </>
          }
          bench={
            <>
              The trainer&rsquo;s message is a fixed 4 Vp-p (2 V peak). Its deviation is set by the VCO&rsquo;s{" "}
              <strong>GAIN</strong>, the sensitivity. To change the message amplitude itself, Part D puts the BUFFER
              amplifier in front of the VCO.
            </>
          }
          oral="Frequency deviation is how far the instantaneous frequency moves from the rest frequency; it is proportional to the message amplitude, Δf = k × Am."
          check={
            <Choice
              q="With k = 1 kHz/V, the message amplitude goes from 1 V to 2 V peak. What happens to Δf?"
              options={[
                { text: "It doubles, from 1 kHz to 2 kHz", correct: true, why: "Δf = k × Am: twice the voltage, twice the frequency swing." },
                { text: "It stays at 2 kHz, the message frequency", why: "The message frequency is not the deviation. Δf comes from the amplitude and the sensitivity." },
                { text: "It halves", why: "A larger voltage pushes the VCO further, not less far." },
                { text: "The FM signal becomes twice as tall", why: "The amplitude of FM never changes: only the frequency swing grows." },
              ]}
            />
          }
        >
          <p>
            <strong>Frequency deviation</strong> Δf is how far the instantaneous frequency moves away from the rest
            frequency, at most.
          </p>
          <p>
            A stronger message pushes the VCO harder, so the frequency swings further: <strong>bigger amplitude,
            bigger Δf</strong>. The message&rsquo;s own frequency (2 kHz) does not set Δf.
          </p>
          <FmExplorer
            initial={{ am: 2, k: 1 }}
            controls={["am", "k"]}
            caption="Drag across the plot: where the message is at its peak, the cycle under the cursor is shortest. Raise the amplitude and the shortest cycle gets shorter still."
          />
        </Lesson>
      ),
      why: (
        <>
          <Eq>
            Δ<V>f</V> = <V>k</V> · <V>A</V>
            <sub>m</sub> &nbsp;&nbsp; <V>f</V>
            <sub>max</sub> = <V>f</V>
            <sub>rest</sub> + Δ<V>f</V> &nbsp;&nbsp; <V>f</V>
            <sub>min</sub> = <V>f</V>
            <sub>rest</sub> − Δ<V>f</V>
          </Eq>
          <p>
            From measured extremes: Δf = (f<sub>max</sub> − f<sub>min</sub>) / 2. The full swing, f<sub>max</sub> −
            f<sub>min</sub>, is 2Δf.
          </p>
          <Note tone="caution" title="Examiner trap">
            &ldquo;The message is 2 kHz, so the carrier moves by 2 kHz.&rdquo; Wrong: 2 kHz is how <em>often</em> the
            frequency swings, not how <em>far</em>.
          </Note>
        </>
      ),
      questions: ["i-law", "p-fm-vs-dev", "i-extremes", "i-example", "i-double-amp"],
    },
    {
      id: "l6-beta",
      kind: "theory",
      title: "6 · The FM modulation index",
      body: (
        <Lesson
          ask="How do we say how strongly a carrier is frequency-modulated?"
          numbers={
            <>
              Δf = 4 kHz, f<sub>m</sub> = 2 kHz: β = 4 / 2 = <strong>2</strong>. Keep Δf at 4 kHz and raise the message
              to 4 kHz: β drops to 1.
            </>
          }
          oral="The FM modulation index is the peak frequency deviation divided by the message frequency, β = Δf / fm; unlike the AM index it can be larger than one."
          check={
            <Choice
              q="Δf stays at 3 kHz while the message frequency rises from 1.5 kHz to 3 kHz. What happens to β?"
              options={[
                { text: "It halves, from 2 to 1", correct: true, why: "β = Δf / fm: the same deviation divided by twice the frequency." },
                { text: "It doubles", why: "fm is in the denominator: a higher message frequency gives a smaller β." },
                { text: "It stays the same, because Δf did not change", why: "β depends on both Δf and fm." },
              ]}
            />
          }
        >
          <p>
            The <strong>FM index</strong> compares how <em>far</em> the frequency swings with how <em>fast</em> it
            swings:
          </p>
          <Eq>
            β = <Frac n={<>Δ<V>f</V></>} d={<><V>f</V><sub>m</sub></>} />
          </Eq>
          <p>
            Do not confuse it with the AM index μ, which compares <em>amplitudes</em> and must stay at or below 1. β
            compares <em>frequencies</em> and can be 2, 5, or more without any distortion.
          </p>
          <FmExplorer initial={{ am: 2, k: 2, fm: 2 }} controls={["am", "fm", "k"]} caption="Watch β in the readout as you change the message frequency or the deviation." />
        </Lesson>
      ),
      why: (
        <>
          <p>
            For a sine message the FM signal is s(t) = A cos[2πf<sub>c</sub>t + β sin(2πf<sub>m</sub>t)]. β is the peak
            phase swing, in radians. It is dimensionless.
          </p>
          <Note tone="caution" title="Examiner trap">
            &ldquo;β = 2, so it is over-modulated.&rdquo; No: FM has no over-modulation at β = 1. Its amplitude never
            changes, so nothing folds.
          </Note>
        </>
      ),
      questions: ["i-beta", "p-indices", "p-beta-big", "i-double-fm"],
    },
    {
      id: "l7-bandwidth-noise",
      kind: "theory",
      title: "7 · Bandwidth and noise",
      body: (
        <Lesson
          ask="Why does FM usually take more bandwidth, and why is it quieter?"
          numbers={
            <>
              With Δf = 2.7 kHz and f<sub>m</sub> = 2 kHz: B ≈ 2(2.7 + 2) ≈ <strong>9.4 kHz</strong>. AM with the same
              message takes 2 × 2 = 4 kHz. You cannot compute an FM bandwidth from f<sub>m</sub> alone: you need Δf.
            </>
          }
          oral="FM bandwidth is roughly 2(Δf + fm) by Carson's rule, usually more than AM; FM resists amplitude noise because the information is in the frequency, and a limiter can remove amplitude changes."
          check={
            <Choice
              q="Can you work out an FM signal's bandwidth if you only know that the message is 2 kHz?"
              options={[
                { text: "Yes: 4 kHz, like AM", why: "That is AM's rule. FM's bandwidth also depends on how far the frequency swings." },
                { text: "No: you also need the deviation", correct: true, why: "Carson's rule, 2(Δf + fm), needs Δf as well as fm." },
              ]}
            />
          }
        >
          <p>
            <strong>Bandwidth.</strong> A frequency that keeps changing cannot be described by one sine wave. Even a pure
            2 kHz message gives FM many spectral lines, spaced 2 kHz apart around the carrier.
          </p>
          <Figure caption="FM spectrum for β ≈ 1.3, from Bessel functions.">
            <FmSpectrumFigure beta={1.3} />
          </Figure>
          <p>
            <strong>Noise.</strong> Noise mostly changes amplitude. In AM, amplitude <em>is</em> the message. In FM, a
            receiver can clip the amplitude flat (a <strong>limiter</strong>) and keep the cycle timing, which carries the
            message.
          </p>
          <Figure caption="The same amplitude noise on AM and on FM.">
            <NoiseFigure />
          </Figure>
        </Lesson>
      ),
      why: (
        <>
          <p>
            <strong>Carson&rsquo;s rule</strong> B ≈ 2(Δf + f<sub>m</sub>) is an estimate: it captures about 98% of the
            power. With a small deviation (β ≪ 1, narrowband FM) it reduces to about 2f<sub>m</sub>, the same as AM; FM
            does not <em>always</em> need more bandwidth.
          </p>
          <p>
            <strong>Not immune.</strong> Strong interference, a very weak signal, or anything that shifts the zero
            crossings still causes errors, and FM degrades sharply once the signal is too weak.
          </p>
        </>
      ),
      questions: ["i-carson", "i-spectrum", "p-bw-always", "i-noise", "i-noise-limit", "i-dev-bw"],
    },
    {
      id: "l8-chain",
      kind: "theory",
      title: "8 · The whole transmitter",
      body: (
        <Lesson
          ask="So what happens, end to end?"
          oral="We applied the 2 kHz message to the VCO input; the VCO's frequency followed the message around its 10 kHz rest frequency, producing an FM signal of constant amplitude."
          check={
            <Choice
              q="In the practical, why do we set the rest frequency before connecting the message?"
              options={[
                {
                  text: "To know the centre the message will swing around",
                  correct: true,
                  why: "The rest frequency is the reference: the deviations are measured from it.",
                },
                { text: "Because the VCO cannot oscillate without a message", why: "It can: with 0 V at its input it runs at the rest frequency." },
                { text: "Because the message sets the rest frequency", why: "The dial sets the rest frequency; the message only moves the frequency around it." },
              ]}
            />
          }
        >
          <Figure caption="Lab sheet Part C.">
            <FmChainFigure />
          </Figure>
          <p>
            <strong>2 kHz message</strong> → the VCO&rsquo;s <strong>control voltage</strong> → a{" "}
            <strong>changing instantaneous frequency</strong> around 10 kHz → an <strong>FM signal</strong> of constant
            height.
          </p>
          <p>The practical does exactly this, in four parts:</p>
          <ol>
            <li>
              <strong>A</strong> · Ground the input and map the VCO&rsquo;s range, LO and HI.
            </li>
            <li>
              <strong>B</strong> · Set the rest frequency to 10 kHz, measuring on the scope.
            </li>
            <li>
              <strong>C</strong> · Replace ground with the 2 kHz message: FM.
            </li>
            <li>
              <strong>D</strong> · Optional: vary the message amplitude and watch the deviation.
            </li>
          </ol>
        </Lesson>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Part A
const partA: Section = {
  id: "range",
  title: "A · The VCO's range",
  steps: [
    {
      id: "a-wire",
      kind: "connect",
      title: "Ground the VCO input and watch its output",
      highlight: {
        links: [
          [VCO_IN, "gnd.left"],
          [VCO_OUT, CH1],
          ["scope.ch1.gnd", "gnd.right"],
        ],
      },
      body: (
        <>
          <p>
            <strong>Why:</strong> with 0 V at its input the VCO outputs its rest frequency alone. Turning the dial from
            one end to the other then shows every carrier frequency the VCO can make (lab sheet Figure 2).
          </p>
          <Figure>
            <FmChainFigure ground />
          </Figure>
          <ol>
            <li>
              <strong>VCO INPUT</strong> → a <strong>GND</strong> socket.
            </li>
            <li>
              VCO <strong>SINE</strong> → oscilloscope <strong>CH1</strong> red node.
            </li>
            <li>
              CH1 <strong>black</strong> node → a trainer <strong>GND</strong> socket.
            </li>
          </ol>
          <Settings
            rows={[
              ["MODE", "CH1"],
              ["CH1 VOLTS/DIV", "1 V"],
              ["Trigger", "INT, source CH1"],
            ]}
          />
        </>
      ),
      why: (
        <p>
          The input socket is the control; the SINE socket is the output. Grounding the input gives a defined 0 V. Leaving
          it unconnected would not: on a real board a floating input picks up noise and the frequency wanders.
        </p>
      ),
      checks: [
        { label: "VCO input at 0 V (grounded)", test: inputGrounded },
        outputOnCh1,
        { label: "Oscilloscope grounded to the trainer", test: (b) => ({ ok: b.scopeGrounded }) },
      ],
      questions: ["e-why-ground", "p-ground-vs-open"],
    },
    {
      id: "a-low",
      kind: "adjust",
      title: "LO range: lowest and highest rest frequency",
      highlight: { controls: ["VCO range", "VCO FREQ", "TIME/DIV"] },
      body: (
        <>
          <ol>
            <li>
              Set the VCO switch to <strong>LO</strong>.
            </li>
            <li>
              Turn <strong>FREQ</strong> fully counter-clockwise. Set TIME/DIV to <strong>0.5 ms</strong>, count the
              divisions of one cycle, and enter your result.
            </li>
            <li>
              Turn FREQ fully clockwise. Set TIME/DIV to <strong>20 µs</strong> and measure again.
            </li>
          </ol>
          <MeasureFrequency port={VCO_OUT} label="LO, dial at minimum" range={0} dial="min" />
          <MeasureFrequency port={VCO_OUT} label="LO, dial at maximum" range={0} dial="max" />
          <Note tone="scope">f = 1 / (divisions × TIME/DIV). Change TIME/DIV whenever a cycle is too small or too wide to count.</Note>
        </>
      ),
      why: (
        <p>
          A lab group measured 1.9 divisions at 0.5 ms/div (period 0.95 ms, so 1.05 kHz) and 1.2 divisions at 50 µs/div
          (60 µs, so 16.7 kHz). Careful with the working: it is f = 1 / (1.9 × 0.5 ms), not (1 / 0.5 ms) × 1.9. Boards
          differ a little; this bench follows the trainer&rsquo;s specification, 1 to 17 kHz.
        </p>
      ),
      checks: [range(0), { label: "VCO input still at 0 V", test: inputGrounded }],
    },
    {
      id: "a-high",
      kind: "adjust",
      title: "HI range: lowest and highest rest frequency",
      highlight: { controls: ["VCO range", "VCO FREQ", "TIME/DIV"] },
      body: (
        <>
          <ol>
            <li>
              Set the switch to <strong>HI</strong>.
            </li>
            <li>
              FREQ fully counter-clockwise, TIME/DIV <strong>5 µs</strong>: measure.
            </li>
            <li>
              FREQ fully clockwise, TIME/DIV <strong>2 µs</strong>: measure.
            </li>
          </ol>
          <MeasureFrequency port={VCO_OUT} label="HI, dial at minimum" range={1} dial="min" />
          <MeasureFrequency port={VCO_OUT} label="HI, dial at maximum" range={1} dial="max" />
        </>
      ),
      why: (
        <p>
          The lab group measured 1.6 divisions at 10 µs/div (62.5 kHz) and 3.2 divisions at 2 µs/div (156 kHz). The
          trainer&rsquo;s specification, which this bench follows, gives 60 to 140 kHz.
        </p>
      ),
      checks: [range(1), { label: "VCO input still at 0 V", test: inputGrounded }],
    },
    {
      id: "a-results",
      kind: "observe",
      title: "What the ranges tell you",
      body: (
        <Lesson
          ask="Which range can make a 10 kHz carrier?"
          numbers={
            <Terms
              items={[
                ["LO", "1 – 17 kHz (lab group: 1.05 – 16.7 kHz)"],
                ["HI", "60 – 140 kHz (lab group: 62.5 – 156 kHz)"],
              ]}
            />
          }
          oral="With the input grounded the VCO outputs its rest frequency; the dial moves it over 1–17 kHz on LO and 60–140 kHz on HI, so a 10 kHz carrier needs the LO range."
          check={
            <Choice
              q="You need a 10 kHz carrier. Which range?"
              options={[
                { text: "LO", correct: true, why: "10 kHz lies inside 1–17 kHz." },
                { text: "HI", why: "HI starts at about 60 kHz: 10 kHz is out of its reach." },
                { text: "Either", why: "The ranges do not overlap: only LO contains 10 kHz." },
              ]}
            />
          }
        >
          <Figure>
            <RangeFigure />
          </Figure>
          <p>
            The <strong>dial</strong> moves the rest frequency within a range; the <strong>switch</strong> chooses the
            range. The two ranges do not overlap.
          </p>
        </Lesson>
      ),
      questions: ["e-ranges", "e-why-lo", "i-switch"],
    },
  ],
};

// ---------------------------------------------------------------- Part B
const partB: Section = {
  id: "carrier",
  title: "B · Set the carrier to 10 kHz",
  steps: [
    {
      id: "b-tune",
      kind: "adjust",
      title: "Tune the rest frequency to 10 kHz",
      highlight: { controls: ["VCO range", "VCO FREQ", "TIME/DIV"] },
      body: (
        <>
          <p>
            <strong>Why:</strong> 10 kHz is the carrier the lab sheet asks for: five times the 2 kHz message.
          </p>
          <ol>
            <li>
              Switch back to <strong>LO</strong>. Keep the input grounded.
            </li>
            <li>
              Set TIME/DIV to <strong>20 µs</strong>.
            </li>
            <li>
              Turn <strong>FREQ</strong> slowly until one cycle spans exactly <strong>5 divisions</strong>.
            </li>
          </ol>
          <Figure caption="The target picture.">
            <PeriodFigure f={10} tdiv={20} />
          </Figure>
          <NumberAnswer
            q="Check the arithmetic: at 20 µs/div one cycle spans 5 divisions. What frequency is that?"
            answer={10}
            unit="kHz"
            explain={
              <>
                T = 5 × 20 µs = 100 µs, and f = 1 / 100 µs = <strong>10 kHz</strong>.
              </>
            }
          />
        </>
      ),
      why: (
        <p>
          Cycles too close together means the frequency is too high: turn the dial down. Too far apart, turn it up. The
          dial carries no frequency marks; the oscilloscope is the measuring instrument.
        </p>
      ),
      checks: [{ label: "VCO input still at 0 V", test: inputGrounded }, range(0), rest10],
    },
    {
      id: "b-observe",
      kind: "observe",
      title: "Observe: the unmodulated carrier",
      body: (
        <>
          <ul>
            <li>
              Every cycle is <strong>the same length</strong>, 100 µs.
            </li>
            <li>
              Every cycle is <strong>the same height</strong>, 4 Vp-p.
            </li>
            <li>Nothing changes with time: this is a pure carrier, no message yet.</li>
          </ul>
          <p>Record this plot: the lab sheet asks for it.</p>
          <Note tone="exam">
            The free-running frequency is the VCO&rsquo;s output frequency with 0 V at its input. You have just set it to
            10 kHz.
          </Note>
        </>
      ),
      checks: [rest10, { label: "Output amplitude", test: (b) => ({ ok: b.reading(VCO_OUT).vpp > 3.5, detail: `${b.reading(VCO_OUT).vpp.toFixed(2)} Vp-p` }) }],
      questions: ["e-rest", "i-five", "m-q3"],
    },
  ],
};

// ---------------------------------------------------------------- Part C
const partC: Section = {
  id: "fm",
  title: "C · Apply the 2 kHz message",
  steps: [
    {
      id: "c-predict",
      kind: "theory",
      title: "Predict before you connect",
      body: (
        <Lesson
          ask="What will change when the input goes from ground to the 2 kHz sine?"
          check={
            <Choice
              q="The VCO input changes from 0 V to the 2 kHz, 4 Vp-p sine. What will the output do?"
              options={[
                { text: "Grow and shrink in height", why: "That would be AM. The VCO's input controls its frequency, not its height." },
                {
                  text: "Speed up and slow down around 10 kHz, 2000 times a second",
                  correct: true,
                  why: "The control voltage now rises and falls, so the frequency rises and falls with it.",
                },
                { text: "Stay at 10 kHz", why: "Only a constant input gives a constant frequency. This input changes." },
                { text: "Become a 2 kHz sine", why: "The output is still the VCO's own oscillation around 10 kHz; the 2 kHz only moves its frequency." },
              ]}
            />
          }
        >
          <p>
            Until now the control voltage was fixed at 0 V, so the frequency was fixed. Now the input voltage will rise
            and fall, from +2 V to −2 V and back, 2000 times a second. The VCO&rsquo;s frequency follows it continuously.
          </p>
        </Lesson>
      ),
    },
    {
      id: "c-wire",
      kind: "connect",
      title: "Replace ground with the message",
      highlight: {
        links: [
          [MESSAGE, VCO_IN],
          [MESSAGE, CH2],
        ],
        unlink: [[VCO_IN, "gnd.left"]],
      },
      body: (
        <>
          <ol>
            <li>
              Remove the lead from <strong>VCO INPUT</strong> to GND.
            </li>
            <li>
              MASTER SIGNALS <strong>2kHz SINE</strong> → <strong>VCO INPUT</strong>.
            </li>
            <li>
              Also 2kHz SINE → <strong>CH2</strong>, so you can compare the message with the FM signal.
            </li>
          </ol>
          <p>Do not touch the FREQ dial: the rest frequency stays 10 kHz.</p>
        </>
      ),
      why: (
        <p>
          Remove the ground first. Connecting the message while the input is still grounded would short the 2 kHz output
          to ground: the VCO would still see 0 V.
        </p>
      ),
      checks: [
        {
          label: "VCO input fed by the 2 kHz SINE",
          test: (b) => {
            if (b.grounded(VCO_IN)) return { ok: false, detail: "The VCO input is still grounded: remove that lead first." };
            return fedBy(VCO_IN, MESSAGE)(b);
          },
        },
        { label: "Message on CH2", test: probeOn(CH2)(MESSAGE) },
        { ...rest10, label: "Rest frequency still 10 kHz" },
      ],
      questions: ["e-applied"],
    },
    {
      id: "c-view",
      kind: "adjust",
      title: "Look at the FM signal",
      highlight: { controls: ["VCO GAIN", "MODE", "INT TRIGGER", "TIME/DIV", "CH2 VOLTS/DIV"] },
      body: (
        <>
          <Settings
            rows={[
              ["VCO GAIN", "about half-way"],
              ["MODE", "DUAL"],
              ["Trigger", "INT, source CH2 (the message)"],
              ["TIME/DIV", "50 µs: one message cycle across the screen"],
            ]}
          />
          <p>
            Compare CH1 (FM) with CH2 (message): where the message is <strong>positive</strong>, the FM cycles are{" "}
            <strong>closer together</strong>; where it is <strong>negative</strong>, they are{" "}
            <strong>further apart</strong>. Their <strong>height never changes</strong>.
          </p>
          <Note tone="scope" title="Why it looks blurred">
            The VCO is not locked to the message. Each sweep starts at the same point of the message, but finds the carrier
            at a different phase, so several sweeps overlap. A real oscilloscope does the same: the lab group&rsquo;s photo
            shows exactly this. The explorer on the next step shows one sweep frozen.
          </Note>
        </>
      ),
      why: (
        <p>
          <strong>GAIN</strong> sets how many Hz each volt moves the frequency. At zero the message has no effect at all;
          half-way gives a clearly visible swing. <strong>Trigger on the message</strong> so every sweep starts at the same
          point of the message cycle.
        </p>
      ),
      checks: [
        { label: "VCO GAIN above zero", test: (b) => ({ ok: gainOf(b) > 0.05, detail: `GAIN ${Math.round(gainOf(b) * 100)} %` }) },
        {
          label: "Trigger on the message (CH2)",
          test: (b) => ({ ok: b.controls.scope.trigSource === "int" && b.controls.scope.intTrig === "ch2" }),
        },
        { label: "The FM signal's frequency swing", test: swing },
        { label: "Steady trigger", test: steady },
      ],
      questions: ["i-gain", "e-blur", "i-polarity"],
    },
    {
      id: "c-understand",
      kind: "observe",
      title: "Read the FM waveform",
      body: (
        <Lesson
          ask="Looking at an FM signal, how do you see the message?"
          oral="These cycles are closer together because the instantaneous frequency is higher there; these are further apart because it is lower; the amplitude stays the same."
          check={
            <Choice
              q="At the moment the message crosses zero, what is the FM frequency?"
              options={[
                { text: "The rest frequency, 10 kHz", correct: true, why: "0 V at the input gives the rest frequency, on the way up or down." },
                { text: "0 Hz", why: "The VCO never stops: 0 V means no shift from the rest frequency." },
                { text: "The highest frequency", why: "The highest frequency comes at the message's positive peak." },
              ]}
            />
          }
        >
          <FmExplorer
            bench
            initial={{ am: 2, k: 1.33, fm: 2.08, fc: 10 }}
            controls={["am", "k", "fm", "slope"]}
            caption="Press “Load my VCO settings” to show one frozen sweep of your own bench. Drag across: at the message peak the cycle is shortest; at the trough, longest; at the zero crossings, 100 µs."
          />
          <ul>
            <li>
              <strong>Cycles close together</strong>: high instantaneous frequency, so the message is positive (on this
              VCO).
            </li>
            <li>
              <strong>Cycles far apart</strong>: low frequency, so the message is negative.
            </li>
            <li>
              <strong>Flat envelope</strong>: the amplitude carries nothing. No AM-style envelope appears, because the VCO
              never changes its height.
            </li>
          </ul>
          <p>Try the tuning-slope switch: with a negative slope the crowding moves to the negative half. Still FM.</p>
        </Lesson>
      ),
      questions: ["i-read", "i-sketch", "p-closer", "p-negative", "p-zero", "p-amplitude-info", "p-slope", "p-output-amp", "p-identify"],
    },
  ],
};

// ---------------------------------------------------------------- Part D
const partD: Section = {
  id: "amplitude",
  title: "D · Optional: message amplitude",
  steps: [
    {
      id: "d-wire",
      kind: "connect",
      title: "Optional: put the BUFFER in front of the VCO",
      highlight: {
        links: [
          [MESSAGE, BUF_IN],
          [BUF_OUT, VCO_IN],
          [BUF_OUT, CH2],
        ],
        unlink: [
          [MESSAGE, VCO_IN],
          [MESSAGE, CH2],
        ],
      },
      body: (
        <>
          <Note tone="hardware" title="Optional demonstration">
            The lab sheet&rsquo;s aim includes showing how the message&rsquo;s amplitude affects the FM signal (it uses
            speech for that). The 2 kHz sine is a fixed 4 Vp-p, so here the <strong>BUFFER</strong> amplifier (gain 0 to
            10) makes it adjustable. Skip this part if you only need the required procedure.
          </Note>
          <ol>
            <li>Remove the leads from 2kHz SINE to VCO INPUT and to CH2.</li>
            <li>
              2kHz SINE → BUFFER <strong>IN</strong>.
            </li>
            <li>
              BUFFER <strong>OUT</strong> → VCO INPUT, and BUFFER OUT → CH2.
            </li>
          </ol>
          <p>CH2 now shows the message exactly as the VCO receives it.</p>
        </>
      ),
      checks: [
        { label: "BUFFER fed by the 2 kHz SINE", test: fedBy(BUF_IN, MESSAGE) },
        { label: "VCO input fed by the BUFFER", test: fedBy(VCO_IN, BUF_OUT) },
        { label: "CH2 shows the VCO's input", test: probeOn(CH2)(BUF_OUT) },
      ],
    },
    {
      id: "d-amplitude",
      kind: "adjust",
      title: "Optional: smaller and larger message",
      highlight: { controls: ["BUFFER GAIN", "CH2 VOLTS/DIV"] },
      body: (
        <>
          <ol>
            <li>
              BUFFER GAIN <strong>×0.5</strong>: record a reading.
            </li>
            <li>
              BUFFER GAIN <strong>×1</strong>: record.
            </li>
            <li>
              BUFFER GAIN <strong>×1.5</strong>: record. Then try ×2.
            </li>
          </ol>
          <ReadingsTable />
          <p>
            On the scope: a bigger message on CH2, more crowding and stretching on CH1, and the FM signal{" "}
            <strong>no taller</strong>.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            Δf = k × A<sub>m</sub>: double the message amplitude, double the deviation. The FM signal&rsquo;s amplitude is
            set by the oscillator, not by the message.
          </p>
          <p>
            Past about ×1.5 the message exceeds ±3 V, the largest input this VCO responds to (an assumption of this
            simulator). Beyond that the deviation stops growing: the VCO&rsquo;s limits are reached and the FM would
            distort the message.
          </p>
          <p>
            Turning the VCO&rsquo;s <strong>GAIN</strong> also changes Δf, but by changing the sensitivity k, not the
            message. The FREQ dial changes neither: it only moves the centre.
          </p>
        </>
      ),
      checks: [
        {
          label: "Live: message size and frequency swing",
          test: (b) => {
            if (!b.linked(VCO_IN, BUF_OUT)) return { ok: false };
            const s = vcoSwing(b);
            return {
              ok: true,
              detail: `Message ${s.vin.vpp.toFixed(2)} Vp-p → Δf ${khz(s.deviation)}${s.limited ? " (VCO input limit reached)" : ""} · FM output ${b.reading(VCO_OUT).vpp.toFixed(2)} Vp-p`,
            };
          },
        },
      ],
      questions: ["i-double-amp", "p-knob-vs-amp", "p-limits", "i-dc", "i-dial", "i-flat"],
    },
  ],
};

// ---------------------------------------------------------------- Part E
const partE: Section = {
  id: "conclusions",
  title: "E · Conclusions",
  steps: [
    {
      id: "e-conclusions",
      kind: "summary",
      title: "What the experiment showed",
      body: (
        <>
          <Terms
            items={[
              ["VCO", "Produces a periodic signal by itself; its input voltage sets its frequency."],
              ["Grounded input", "0 V gives the rest (free-running) frequency, steady, at constant amplitude."],
              ["FREQ dial", "Moves the rest frequency. LO covers 1–17 kHz, HI 60–140 kHz."],
              ["Carrier", "Set to 10 kHz in LO: 5 divisions at 20 µs/div."],
              ["Message applied", "The 2 kHz sine moves the instantaneous frequency above and below 10 kHz: the VCO produces FM."],
              ["Amplitude", "The FM signal's height stays constant; a larger message gives a larger deviation."],
            ]}
          />
          <Note tone="exam" title="A 30-second answer">
            We set the VCO&rsquo;s input to 0 V and found its rest-frequency range: about 1–17 kHz on LO and 60–140 kHz on
            HI. In LO we tuned the rest frequency to 10 kHz, measuring a 100 µs period. Applying the 2 kHz sine to the
            input made the frequency swing above and below 10 kHz in step with the message, with the cycles crowding at
            the positive peaks and spreading at the negative ones, while the amplitude stayed constant. That is
            frequency modulation, and its deviation grows with the message amplitude.
          </Note>
        </>
      ),
      questions: ["m-q1", "m-q2", "i-tradeoffs"],
    },
    {
      id: "e-sheet",
      kind: "summary",
      title: "The lab sheet's questions",
      body: (
        <p>
          The lab sheet asks three questions and for the MATLAB output. The MATLAB listing uses its own values (carrier
          200 Hz, message 30 Hz + 60 Hz, sampled at 1 kHz); do not mix them with the trainer&rsquo;s.
        </p>
      ),
      questions: ["m-q1", "m-q2", "m-q3", "m-matlab"],
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
      title: "Lab 4: Final Oral Exam Preparation",
      body: (
        <p>
          Every question for this lab, by source. <strong>Practice oral exam</strong> asks one at a time, hardest first, and
          brings back the ones you did not know. The last step is a one-page revision sheet.
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
              ["FM", "The message changes the carrier's frequency; the amplitude stays constant."],
              ["VCO", "An oscillator whose output frequency is set by its input voltage."],
              ["Rest frequency", "The VCO's frequency at 0 V input. Also free-running, centre or carrier frequency."],
              ["Sensitivity k", "Hz per volt. Set by the VCO's GAIN."],
              ["Deviation Δf", "The largest distance of the frequency from rest."],
              ["Index β", "Δf divided by the message frequency."],
            ]}
          />
          <h3 className="g-sub">Formulas</h3>
          <Eq>
            <V>f</V> = 1/<V>T</V> &nbsp;·&nbsp; <V>f</V>
            <sub>i</sub> = <V>f</V>
            <sub>c</sub> + <V>k</V>·<V>m</V>(<V>t</V>) &nbsp;·&nbsp; Δ<V>f</V> = <V>k</V>·<V>A</V>
            <sub>m</sub>
          </Eq>
          <Eq>
            β = Δ<V>f</V>/<V>f</V>
            <sub>m</sub> &nbsp;·&nbsp; <V>B</V> ≈ 2(Δ<V>f</V> + <V>f</V>
            <sub>m</sub>)
          </Eq>
          <h3 className="g-sub">Relationships</h3>
          <ul>
            <li>Bigger message amplitude or GAIN: bigger Δf and β, wider band, same output amplitude.</li>
            <li>Higher message frequency: same Δf, smaller β, wider band.</li>
            <li>FREQ dial or a DC offset: moves the centre only.</li>
          </ul>
          <h3 className="g-sub">This experiment</h3>
          <ul>
            <li>Message 2 kHz, 4 Vp-p (period 500 µs). Carrier 10 kHz, LO range (period 100 µs = 5 div at 20 µs/div).</li>
            <li>LO 1–17 kHz, HI 60–140 kHz (specification; lab group: 1.05–16.7 and 62.5–156 kHz).</li>
            <li>Five carrier cycles per message cycle on average.</li>
          </ul>
          <h3 className="g-sub">The practical in four lines</h3>
          <ol>
            <li>VCO INPUT to GND, SINE to CH1, scope ground to GND.</li>
            <li>LO then HI: dial to both ends, measure each frequency.</li>
            <li>LO, 20 µs/div, tune FREQ until one cycle is 5 divisions.</li>
            <li>Remove ground, 2 kHz SINE to VCO INPUT (and CH2), trigger on CH2, observe.</li>
          </ol>
          <h3 className="g-sub">Mistakes to avoid</h3>
          <ul>
            <li>Saying the deviation equals the message frequency.</li>
            <li>Saying 0 V input means 0 Hz or no output.</li>
            <li>Calling β &gt; 1 over-modulation.</li>
            <li>Computing f as (1/TIME/DIV) × divisions instead of 1 / (divisions × TIME/DIV).</li>
            <li>Putting the message into the SINE output instead of VCO INPUT.</li>
            <li>Claiming FM is immune to noise, or always needs more bandwidth.</li>
          </ul>
          <h3 className="g-sub">Ten answers to know by heart</h3>
          <ol className="must-know">
            <li>FM varies the carrier&rsquo;s frequency with the message and keeps its amplitude constant; AM varies its amplitude.</li>
            <li>A VCO is an oscillator whose output frequency is set by its input voltage.</li>
            <li>With the input grounded the VCO runs at its rest frequency; it is not switched off.</li>
            <li>The rest frequency is the output frequency at 0 V input, set by the FREQ dial.</li>
            <li>Δf is how far the frequency moves from rest; Δf = k × Am, so it grows with the message amplitude.</li>
            <li>The message frequency is how often the frequency swings; the deviation is how far.</li>
            <li>Cycles close together mean a higher instantaneous frequency; far apart, lower.</li>
            <li>Frequency is measured as 1 / (divisions × TIME/DIV); 5 div at 20 µs/div is 10 kHz.</li>
            <li>β = Δf / fm; it can exceed 1 without distortion, unlike the AM index.</li>
            <li>FM resists amplitude noise because the message is in the frequency; it usually needs about 2(Δf + fm) of bandwidth.</li>
          </ol>
        </>
      ),
    },
  ],
};

const guide: Guide = {
  labId: 4,
  title: "Frequency Modulation",
  sections: [theory, partA, partB, partC, partD, partE, exam],
  questions: QUESTIONS,
  bank: BANK,
};

export default guide;
