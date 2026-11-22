import { Measure } from "@/components/guide/Measure";
import { Eq, Figure, Frac, Lesson, Note, Terms, V } from "@/components/guide/parts";
import { Choice, NumberAnswer } from "@/components/guide/Quiz";
import { knobValue, switchValue } from "@/lib/controls/emonaControls";
import type { Bench } from "@/lib/guide/bench";
import type { Check, CheckResult, Guide, Section } from "@/lib/guide/types";
import { twinWidth } from "@/lib/sim/modules";
import { CH1, CH2, MESSAGE, steady, volts } from "../am";
import { fedBy, portName, probeOn } from "../checks";
import { frequencyWorking, gainOf, restOf, timeBase, vcoSwing } from "../lab4/bench-tools";
import { PeriodFigure } from "../lab4/figures";
import { DemodExplorer } from "./explorer";
import { CalibrationFigure, DutyCompareFigure, OverlapFigure, PulseAnatomyFigure } from "./figures";
import { BANK, QUESTIONS } from "./questions";

/**
 * Lab 5 — Frequency Demodulation (zero-crossing detector).
 *
 * Procedure follows the Experiment 5 lab sheet: FM from the VCO (10 kHz rest,
 * 2 kHz sine), a comparator with a 0 V reference, the Twin Pulse Generator as
 * the ZCD with DELAY fully left and its width set to 12 µs on the 8 kHz DIGITAL
 * clock, then the baseband LPF. The buffer stage, and the Tuneable LPF route,
 * come from the instructor's advice and the lab report. Every check traces the
 * real signal path and measures what it produces.
 */

// ---------------------------------------------------------------- sockets
const VCO_IN = "vco.in";
const VCO_OUT = "vco.sine";
const COMP_IN = "comparator.in";
const COMP_REF = "comparator.ref";
const COMP_OUT = "comparator.out";
const CLK = "twin.clk";
const Q1 = "twin.q1";
const Q2 = "twin.q2";
const DIG8 = "master.dig8k";
const BB_IN = "channel.lpfIn";
const BB_OUT = "channel.lpfOut";
const TLPF_IN = "tlpf.in";
const TLPF_OUT = "tlpf.out";
const BUF_IN = "buffer.in";
const BUF_OUT = "buffer.out";

const khz = (hz: number, d = 2) => `${(hz / 1000).toFixed(d)} kHz`;
const mv = (v: number) => (v < 1 ? `${Math.round(v * 1000)} mV` : `${v.toFixed(2)} V`);

// ------------------------------------------------------------ the signal path
/** The ZCD output in use: Q1, or Q2 if only that one goes on. */
const zcdFeeds = (b: Bench, port: string) => b.linked(port, Q1) || b.linked(port, Q2);

/** The low-pass filter output that carries the averaged pulses, if any. */
function filterOut(b: Bench): string | null {
  if (zcdFeeds(b, BB_IN)) return BB_OUT;
  if (zcdFeeds(b, TLPF_IN)) return TLPF_OUT;
  return null;
}

/** Each link of the receiver, from message to filter: the first broken one, or null. */
function brokenLink(b: Bench): string | null {
  if (!b.linked(VCO_IN, MESSAGE)) return "the 2 kHz message is not on the VCO input";
  if (!b.linked(COMP_IN, VCO_OUT)) return "the VCO output is not on the comparator input";
  if (!b.grounded(COMP_REF)) return "the comparator's REF is not at 0 V";
  if (!b.linked(CLK, COMP_OUT)) return "the comparator output is not on the Twin Pulse Generator's CLK";
  if (b.drivers(CLK).length > 1) return "something else is also driving CLK (the 8 kHz clock?)";
  if (!filterOut(b)) return "no low-pass filter takes the ZCD pulses";
  return null;
}

const chainIntact: Check = {
  label: "Receiver chain intact: message → VCO → comparator → ZCD → filter",
  test: (b) => {
    const broken = brokenLink(b);
    return broken ? { ok: false, detail: `Broken: ${broken}.` } : { ok: true };
  },
};

/** The recovered message at a socket: its size, its frequency, how clean it is. */
function recovered(b: Bench, port: string, minVpp: number): CheckResult {
  const t = b.tone(port);
  const f = t.messageVpp > 0.01 ? b.frequency(port, 4e-3, 0.5e-6) : 0;
  const ok = t.messageVpp >= minVpp && Math.abs(f - 2083) < 120 && t.thd < 15;
  return {
    ok,
    detail:
      t.messageVpp < 0.01
        ? "No 2 kHz signal here."
        : `${mv(t.messageVpp)} p-p at ${khz(f)}, distortion ${t.thd.toFixed(1)}%, on a DC level of ${volts(t.mean)}`,
  };
}

const vcoAtRest = (b: Bench): CheckResult => {
  const f = restOf(b);
  const ok = switchValue(b.controls.emona, "vco.range") === 0 && Math.abs(f - 10_000) <= 250;
  return { ok, detail: ok ? `${khz(f)} on LO` : `Not 10 kHz on LO yet: ${switchValue(b.controls.emona, "vco.range") ? "the switch is on HI" : `cycles too ${f > 10_000 ? "close together" : "far apart"}`}.` };
};

const inputGrounded = (b: Bench): CheckResult =>
  b.drivers(VCO_IN).length ? { ok: false, detail: "Something is driving the VCO input." } : { ok: b.grounded(VCO_IN) };

const pulseOnCh2: Check = {
  label: "CH2 shows the Twin Pulse Generator's output",
  test: (b) => {
    const r1 = probeOn(CH2)(Q1)(b);
    return r1.ok ? r1 : probeOn(CH2)(Q2)(b).ok ? { ok: true, detail: "Q2: with DELAY fully left it lags Q1 by the minimum delay." } : r1;
  },
};

// ----------------------------------------------------------------- theory
const theory: Section = {
  id: "theory",
  title: "Understand FM demodulation",
  steps: [
    {
      id: "l1-goal",
      kind: "theory",
      title: "1 · What are we trying to recover?",
      body: (
        <Lesson
          ask="The message is hidden in the FM signal's frequency. How do we get it back as a voltage?"
          numbers={
            <>
              Message 2 kHz. VCO rest frequency 10 kHz. With the message applied the FM frequency moves continuously around
              10 kHz, for example between 8 and 12 kHz. The receiver must deliver the <strong>2 kHz</strong> message again.
            </>
          }
          bench={
            <>
              In Lab 4 the <strong>VCO</strong> turned voltage into frequency. Here a chain of trainer modules does the
              reverse: the <strong>COMPARATOR</strong> (UTILITIES), the <strong>TWIN PULSE GENERATOR</strong> as a
              zero-crossing detector, a <strong>low-pass filter</strong> and the <strong>BUFFER</strong>.
            </>
          }
          oral="FM demodulation converts the frequency variations of the received FM signal back into voltage variations that represent the original message."
          check={
            <Choice
              q="Why can't we simply put the FM signal into a low-pass filter?"
              options={[
                {
                  text: "Its average is zero whatever its frequency",
                  correct: true,
                  why: "The FM sine is symmetrical about 0 V, so a filter that keeps only slow changes finds nothing to keep. The message is in the timing, which a filter cannot see directly.",
                },
                { text: "The filter would remove the message's amplitude", why: "The FM amplitude carries no message at all: there is nothing there to lose." },
                { text: "It would work, but the output would be small", why: "It would not work: the filter's output would be essentially zero." },
              ]}
            />
          }
        >
          <p>
            Lab 4 went one way: <strong>message voltage → VCO → changing frequency</strong>. A receiver must go back:{" "}
            <strong>changing frequency → ? → message voltage</strong>.
          </p>
          <p>
            In AM (Lab 3) the message was the <strong>envelope</strong>, so following the peaks recovered it. FM has a flat
            envelope: following its peaks gives a constant. We need a circuit that turns <strong>faster</strong> into{" "}
            <strong>higher voltage</strong>.
          </p>
          <DemodExplorer
            stages
            caption="The whole receiver on one time axis. Select a stage to see its input and output and what it changes. Every row comes from the trainer's own module models."
          />
          <p>The next lessons take these stages one at a time.</p>
        </Lesson>
      ),
      why: (
        <p>
          The lab sheet lists other FM detectors: the slope detector, the Foster–Seeley discriminator, the ratio detector,
          the phase-locked loop and the quadrature detector. The zero-crossing detector is used here because it shows the
          principle most directly.
        </p>
      ),
      questions: ["e-what", "i-property", "p-am-vs-fm", "p-envelope", "p-lpf-direct", "i-methods"],
    },
    {
      id: "l2-comparator",
      kind: "theory",
      title: "2 · The comparator",
      body: (
        <Lesson
          ask="Why turn the smooth FM sine into a square wave first?"
          numbers={
            <>
              Input: a 4 Vp-p sine around 0 V at about 10 kHz. Output: 0 V or 5 V, switching every time the input crosses 0
              V, about every 50 µs. One full square cycle per FM cycle, at the same frequency.
            </>
          }
          bench={
            <>
              The <strong>COMPARATOR</strong> on the UTILITIES module has an <strong>IN</strong>, a <strong>REF</strong>{" "}
              (the threshold) and an <strong>OUT</strong>. Connect REF to GND for a 0 V threshold.
            </>
          }
          oral="The comparator squares up the FM signal: it switches at each zero crossing, so it keeps the timing and the frequency, removes the amplitude variations, and gives sharp edges to trigger the pulse generator."
          check={
            <Choice
              q="Does the comparator's output already contain the message as a slow 2 kHz wave?"
              options={[
                {
                  text: "No: it is still a fast square wave whose frequency changes",
                  correct: true,
                  why: "The comparator only squares the FM signal up. Its edges follow the FM timing; the message is still hidden in the spacing.",
                },
                { text: "Yes: the square wave is the message", why: "The square wave repeats at the FM rate, around 10 kHz, not at 2 kHz." },
              ]}
            />
          }
        >
          <p>
            A <strong>comparator</strong> answers one question, continuously: is the input above the reference? Yes: its
            output goes high (5 V). No: it goes low (0 V).
          </p>
          <p>
            With a 0 V reference it switches exactly where the sine crosses zero: a <strong>zero crossing</strong>. The
            result is a <strong>square wave</strong> with the same frequency, and the same changes in frequency, as the FM
            signal.
          </p>
          <DemodExplorer rows={["fm", "comparator"]} caption="Each edge of the square wave is a zero crossing of the FM sine. Where the FM cycles crowd, the square wave's cycles crowd too." />
        </Lesson>
      ),
      why: (
        <>
          <p>
            <strong>Why it helps.</strong> Whatever the input&rsquo;s height, the output is always 0 V or 5 V: amplitude
            changes from fading or noise are thrown away. And the steep edges trigger the next stage cleanly.
          </p>
          <p>
            <strong>Its limit.</strong> Noise close to 0 V can shift a crossing, or make the signal cross more than once,
            producing a false edge. Reliable demodulation depends on clean timing.
          </p>
        </>
      ),
      questions: ["m-q2", "i-comparator", "i-zero-ref", "p-comp-still-fm", "i-noise"],
    },
    {
      id: "l3-zcd",
      kind: "theory",
      title: "3 · The zero-crossing detector",
      body: (
        <Lesson
          ask="How do we turn “how often” into something we can measure as a voltage?"
          numbers={
            <>
              One 12 µs pulse per FM cycle. At 12 kHz the pulses come every 83 µs; at 8 kHz every 125 µs. The pulse itself is 12
              µs in both cases.
            </>
          }
          bench={
            <>
              The <strong>TWIN PULSE GENERATOR</strong> is the zero-crossing detector: each rising edge at its{" "}
              <strong>CLK</strong> input starts one pulse at <strong>Q1</strong>. Its <strong>WIDTH</strong> trimmer sets the
              pulse width; <strong>DELAY</strong> delays the copy at Q2.
            </>
          }
          oral="The zero-crossing detector produces one fixed-width pulse at each chosen zero crossing, so the pulse rate equals the FM frequency and only the gap between pulses changes."
          check={
            <Choice
              q="The FM frequency rises. What happens to the ZCD's pulses?"
              options={[
                { text: "They get wider", why: "The width is fixed by the WIDTH trimmer. That is the whole point." },
                { text: "They come closer together", correct: true, why: "More crossings per second means more pulses per second, so shorter gaps." },
                { text: "They get taller", why: "The height is fixed too: every pulse is 0 to 5 V." },
              ]}
            />
          }
        >
          <p>
            A <strong>pulse</strong> is a short burst: the output goes high, stays high for a fixed time, then drops back. A{" "}
            <strong>zero-crossing detector</strong> makes one such pulse every time its input crosses zero in one
            direction: here, every rising edge of the comparator.
          </p>
          <p>
            Every pulse is the <strong>same width</strong> and <strong>same height</strong>. What changes is{" "}
            <strong>how far apart</strong> they are: higher FM frequency, pulses closer together; lower, further apart.
          </p>
          <DemodExplorer
            rows={["comparator", "pulses"]}
            controls={["fc"]}
            caption="Experiments A and B: raise the VCO rest frequency and the pulses crowd together; lower it and they spread out. Their width never changes."
          />
        </Lesson>
      ),
      why: (
        <p>
          <strong>Why only one direction?</strong> To get exactly one pulse per FM cycle. Counting rising and falling
          crossings would give two per cycle: it changes the arithmetic and halves the room before pulses overlap.
        </p>
      ),
      questions: ["i-zcd", "i-what-changes", "i-one-edge", "i-comp-vs-zcd", "p-pulses-info"],
    },
    {
      id: "l4-duty",
      kind: "theory",
      title: "4 · Pulse width, period, space, duty cycle",
      body: (
        <Lesson
          ask="How much of the time is the pulse train high?"
          numbers={
            <Terms
              items={[
                ["8 kHz", "T = 125 µs, space 113 µs, duty 12/125 = 9.6%"],
                ["10 kHz", "T = 100 µs, space 88 µs, duty 12%"],
                ["12 kHz", "T ≈ 83.3 µs, space 71.3 µs, duty 14.4%"],
              ]}
            />
          }
          bench={<>The 12 µs width is set on the Twin Pulse Generator&rsquo;s WIDTH trimmer in Part C of the practical.</>}
          oral="The duty cycle is the pulse width divided by the period, τ/T, which equals τ times f; with a fixed width it rises in proportion to the frequency."
          check={
            <NumberAnswer
              q="12 µs pulses arrive at 12.5 kHz. What is the duty cycle, in %?"
              answer={15}
              unit="%"
              explain={
                <>
                  D = τ × f = 12 µs × 12.5 kHz = 0.15, so <strong>15%</strong>. (T = 80 µs, and 12/80 = 0.15.)
                </>
              }
            />
          }
        >
          <Terms
            items={[
              ["Pulse width τ", "How long one pulse stays high: 12 µs, fixed."],
              ["Period T", "From one pulse to the next: T = 1/f."],
              ["Space", "The low time between pulses: T − τ."],
              ["Duty cycle", "The fraction of each period spent high."],
            ]}
          />
          <Figure>
            <PulseAnatomyFigure />
          </Figure>
          <Eq>
            <V>D</V> = <Frac n={<V>τ</V>} d={<V>T</V>} /> = <V>τ</V> · <V>f</V>
          </Eq>
          <Figure caption="Same 12 µs pulse, three frequencies: the space shrinks, the duty cycle grows.">
            <DutyCompareFigure />
          </Figure>
          <Note tone="key">Higher frequency → more pulses per second → higher duty cycle. Lower frequency → lower duty cycle.</Note>
        </Lesson>
      ),
      why: (
        <p>
          The 8–12 kHz values are the instructor&rsquo;s teaching example (2 kHz deviation around 10 kHz), not a deviation
          measured in the lab. The mark-to-space ratio, τ/(T − τ), is another way to describe the same timing.
        </p>
      ),
      questions: ["i-duty", "i-numbers", "p-why-up"],
    },
    {
      id: "l5-width",
      kind: "theory",
      title: "5 · Why a 12 µs pulse?",
      body: (
        <Lesson
          ask="Why exactly 12 µs, and why does it have to be fixed?"
          numbers={
            <>
              Rest 10 kHz: period 100 µs. But the FM frequency rises above rest: at 12 kHz the period is 83 µs, at 12.7 kHz
              (GAIN half-way on the bench) 79 µs. 12 µs is far below every one of them. Check against the{" "}
              <strong>highest</strong> instantaneous frequency, not the rest frequency.
            </>
          }
          bench={
            <>
              You set the width with the FM disconnected, triggering the pulse generator from the steady{" "}
              <strong>8 kHz DIGITAL</strong> clock of MASTER SIGNALS: identical pulses every 120 µs, easy to measure. At 5
              µs/div, 12 µs is 2.4 divisions.
            </>
          }
          oral="12 µs is fixed and much shorter than the shortest FM period, so the pulses never overlap and only their spacing changes; then the average rises in proportion to the frequency."
          check={
            <Choice
              q="Which period must the pulse width stay below?"
              options={[
                { text: "The period at the rest frequency, 100 µs", why: "The frequency goes above rest. The shortest period comes at the highest frequency." },
                { text: "The shortest period, at the highest FM frequency", correct: true, why: "That is where the pulses come closest together; if they fit there, they fit everywhere." },
                { text: "The message period, 500 µs", why: "The pulses come once per FM cycle, around every 100 µs, not once per message cycle." },
              ]}
            />
          }
        >
          <p>
            <strong>Fixed</strong>, because the method relies on every pulse being identical: then the only thing that
            changes is how many arrive per second.
          </p>
          <p>
            <strong>Short</strong>, because a pulse must end before the next one starts. If pulses are wider than the
            period, they run into each other and the output sticks high: the frequency information is lost.
          </p>
          <Figure caption="Overlap, drawn with fast input edges every 30 µs.">
            <OverlapFigure />
          </Figure>
          <p>
            <strong>Not too short</strong> either: the average is proportional to the width, so very narrow pulses give a
            tiny output.
          </p>
          <Figure caption="Calibration on the 8 kHz clock.">
            <CalibrationFigure />
          </Figure>
          <DemodExplorer
            rows={["pulses", "lpf"]}
            controls={["tau"]}
            caption="Experiment C: widen the pulses and the average (and the recovered wave) grows; the duty cycle rises with τ."
          />
        </Lesson>
      ),
      why: (
        <p>
          The instructor compared 12 µs with the 50 µs half-period at 10 kHz to show it is short; the strict condition is the
          interval between triggers of the same polarity, 1/f<sub>max</sub>. On the trainer&rsquo;s LO range (up to about 22
          kHz with full deviation) the WIDTH trimmer&rsquo;s 40 µs maximum never overlaps; the VCO&rsquo;s HI range would.
        </p>
      ),
      questions: ["m-q3", "i-why-12", "e-calibrate", "p-overlap", "p-narrow", "i-width"],
    },
    {
      id: "l6-average",
      kind: "theory",
      title: "6 · How the filter recovers the message",
      body: (
        <Lesson
          ask="We have pulses instead of a sine. How can a low-pass filter possibly give back the message?"
          numbers={
            <>
              5 V pulses, 12 µs wide. At 8 kHz the average is 5 × 0.096 = <strong>0.48 V</strong>; at 10 kHz{" "}
              <strong>0.60 V</strong>; at 12 kHz <strong>0.72 V</strong>. As the frequency swings 8–12 kHz, the average swings
              0.48–0.72 V: a 0.24 Vp-p copy of the message on a 0.60 V level.
            </>
          }
          bench={
            <>
              The lab sheet uses the <strong>BASEBAND LPF</strong> of the CHANNEL MODULE; the lab report used the{" "}
              <strong>TUNEABLE LPF</strong>. Both do this job.
            </>
          }
          oral="The low-pass filter keeps the average of the pulse train; closer pulses give a higher average, so the average rises and falls with the FM frequency, which followed the message."
          check={
            <Choice
              q="Put it in order: the message voltage rises, so…"
              options={[
                {
                  text: "frequency rises → pulses closer → duty cycle up → average up",
                  correct: true,
                  why: "That is the whole receiver: each step is a direct consequence of the one before.",
                },
                { text: "pulses get wider → average up", why: "The pulses are fixed at 12 µs; their width never changes." },
                { text: "FM amplitude rises → average up", why: "FM amplitude never changes, and the comparator would remove it anyway." },
              ]}
            />
          }
        >
          <p>
            Think of the filter as <strong>averaging</strong>: it reports how much of the recent time the signal was high.
          </p>
          <ul>
            <li>
              Pulses <strong>close together</strong>: more high time in each instant → the average goes <strong>up</strong>.
            </li>
            <li>
              Pulses <strong>far apart</strong>: less high time → the average goes <strong>down</strong>.
            </li>
          </ul>
          <p>
            The pulse spacing followed the FM frequency, and the FM frequency followed the message. So the average follows
            the message.
          </p>
          <DemodExplorer
            rows={["message", "pulses", "lpf"]}
            controls={["cutoff"]}
            caption="Dashed: the pulses' average over each 100 µs, in step with the message. Solid: the filter's output, the same wave delayed by the filter. Experiment D: raise the cutoff and pulses leak through as ripple; lower it below 2 kHz and the message fades."
          />
          <Eq>
            <V>V</V>
            <sub>avg</sub> = <V>V</V>
            <sub>p</sub> · <V>τ</V> · <V>f</V>
            <sub>inst</sub>
          </Eq>
          <Terms
            items={[
              [<>V<sub>p</sub></>, "Pulse height, 5 V: fixed."],
              ["τ", "Pulse width, 12 µs: fixed."],
              [<>f<sub>inst</sub></>, "The instantaneous FM frequency: the only thing that changes, so the only thing the output follows."],
            ]}
          />
        </Lesson>
      ),
      why: (
        <>
          <p>
            Write f<sub>inst</sub> = f<sub>c</sub> + k·m(t): the average splits into a <strong>steady level</strong> V
            <sub>p</sub>τf<sub>c</sub> (0.6 V at rest) and a <strong>message part</strong> V<sub>p</sub>τk·m(t). The steady
            part is a DC offset; AC coupling or a DC-blocking stage removes it.
          </p>
          <p>The formula assumes one fixed pulse per cycle and no overlap.</p>
          <p>
            <strong>Why the output lags.</strong> A filter needs time to respond, so the recovered wave arrives later than the
            message: on the scope it can look shifted by a good part of a cycle. Its frequency and shape are what matter.
          </p>
          <Note tone="caution" title="Do not mix them up">
            AM demodulation follows the <strong>envelope</strong>. FM demodulation turns <strong>frequency</strong> into an
            average voltage. The FM receiver deliberately throws the amplitude away.
          </Note>
        </>
      ),
      questions: ["i-average", "i-formula", "m-q4", "p-what-sets-avg", "p-chain-of-cause", "i-offset", "p-why-2k", "i-baseband"],
    },
    {
      id: "l7-buffer",
      kind: "theory",
      title: "7 · The buffer amplifier",
      body: (
        <Lesson
          ask="The recovered message is tiny. What do we do about it?"
          numbers={
            <>
              The filter&rsquo;s message part is a few tenths of a volt at most, less after filtering. The lab report&rsquo;s
              buffer brought it to about 4 Vp-p: an observation from that bench, not a fixed result.
            </>
          }
          bench={
            <>
              The <strong>BUFFER</strong> module amplifies with its <strong>GAIN</strong> trimmer, from ×0 to ×10.
            </>
          }
          oral="The buffer amplifies the small recovered message without changing its frequency or shape, and isolates the filter from whatever it drives; it cannot remove distortion that is already there."
          check={
            <Choice
              q="Doubling the buffer gain does what to the recovered 2 kHz message?"
              options={[
                { text: "Doubles its size; frequency unchanged", correct: true, why: "Amplification scales the voltage only. 2 kHz stays 2 kHz." },
                { text: "Doubles its frequency", why: "Gain has nothing to do with frequency." },
                { text: "Removes the ripple", why: "Any ripple is amplified along with the message." },
              ]}
            />
          }
        >
          <p>
            A <strong>buffer amplifier</strong> makes the signal larger, and its high input impedance means it does not load
            (pull down) the filter in front of it.
          </p>
          <p>
            It changes the <strong>size</strong> only. The frequency, the shape, and any distortion or ripple stay exactly as
            they were: just bigger.
          </p>
          <DemodExplorer rows={["lpf", "out"]} controls={["gain"]} caption="Experiment E: the buffer output is the filter output, scaled. Same frequency, same shape." />
        </Lesson>
      ),
      questions: ["p-buffer", "p-buffer-limits", "e-amplitude", "i-small"],
    },
    {
      id: "l8-whole",
      kind: "theory",
      title: "8 · The complete receiver",
      body: (
        <Lesson
          ask="Can you now explain every stage, end to end?"
          oral="The VCO's FM goes to a comparator that squares it up at its zero crossings; the zero-crossing detector makes a fixed 12 µs pulse per cycle, so its duty cycle follows the frequency; the low-pass filter keeps the average, which follows the message; the buffer amplifies it to give back the 2 kHz message."
          check={
            <Choice
              q="Why does the receiver give back about 2 kHz and not 10 kHz?"
              options={[
                {
                  text: "10 kHz is the pulse rate the filter removes; the average changes at 2 kHz",
                  correct: true,
                  why: "The filter keeps how the average changes, and the average is swung up and down at the message rate.",
                },
                { text: "The comparator divides the frequency by 5", why: "The comparator keeps the frequency exactly." },
              ]}
            />
          }
        >
          <ol>
            <li>VCO: message → FM.</li>
            <li>Comparator: FM sine → FM square wave (timing kept, amplitude removed).</li>
            <li>ZCD: one 12 µs pulse per cycle (rate = FM frequency).</li>
            <li>Duty cycle = τ × f: follows the frequency.</li>
            <li>LPF: keeps the changing average.</li>
            <li>Buffer: makes it larger.</li>
            <li>Output: the 2 kHz message.</li>
          </ol>
          <DemodExplorer
            stages
            controls={["fc", "dev", "tau", "cutoff", "gain"]}
            caption="Everything together. Change any setting and every stage after it responds."
          />
        </Lesson>
      ),
      questions: ["i-say", "e-chain", "i-deviation", "i-rest", "i-cutoff"],
    },
  ],
};

// ---------------------------------------------------------------- Part A
const partA: Section = {
  id: "fm",
  title: "A · Generate the FM signal",
  steps: [
    {
      id: "a-rest",
      kind: "connect",
      title: "Set the VCO to 10 kHz",
      highlight: {
        links: [
          [VCO_IN, "gnd.left"],
          [VCO_OUT, CH2],
          ["scope.ch2.gnd", "gnd.right"],
        ],
        controls: ["VCO range", "VCO FREQ", "TIME/DIV", "INT TRIGGER"],
      },
      body: (
        <>
          <p>
            <strong>Why:</strong> a receiver can only be tested with an FM signal, and the FM must be centred where the lab
            sheet says: 10 kHz.
          </p>
          <ol>
            <li>VCO INPUT → GND (0 V: the rest frequency alone).</li>
            <li>VCO SINE → CH2. CH2 black node → GND.</li>
            <li>VCO on LO. Trigger INT, source CH2. TIME/DIV 20 µs.</li>
            <li>Turn FREQ until one cycle spans 5 divisions, as in Lab 4.</li>
          </ol>
          <Figure>
            <PeriodFigure f={10} tdiv={20} />
          </Figure>
          <p>If your Lab 4 settings are still on the bench, this is already done.</p>
        </>
      ),
      checks: [
        { label: "VCO input at 0 V", test: inputGrounded },
        { label: "VCO output on CH2", test: (b) => ({ ok: b.linked(VCO_OUT, CH2) }) },
        { label: "Oscilloscope grounded to the trainer", test: (b) => ({ ok: b.scopeGrounded }) },
        { label: "Rest frequency 10 kHz on LO", test: vcoAtRest },
      ],
    },
    {
      id: "a-message",
      kind: "connect",
      title: "Apply the 2 kHz message",
      highlight: {
        links: [
          [MESSAGE, VCO_IN],
          [MESSAGE, CH1],
        ],
        unlink: [[VCO_IN, "gnd.left"]],
        controls: ["VCO GAIN", "INT TRIGGER", "MODE"],
      },
      body: (
        <>
          <ol>
            <li>Remove the ground lead from VCO INPUT.</li>
            <li>2kHz SINE → VCO INPUT, and 2kHz SINE → CH1.</li>
            <li>
              VCO GAIN about <strong>half-way</strong>. Trigger INT, source <strong>CH1</strong>. MODE DUAL.
            </li>
          </ol>
          <p>
            CH1 keeps the message for the rest of the lab: it is the reference, and the trigger. CH2 is the probe you move
            along the receiver.
          </p>
        </>
      ),
      why: <p>GAIN half-way gives a deviation of about 2.7 kHz, the same as in Lab 4: the FM frequency swings between about 7.3 and 12.7 kHz.</p>,
      checks: [
        {
          label: "VCO input fed by the 2 kHz SINE",
          test: (b) => (b.grounded(VCO_IN) ? { ok: false, detail: "Still grounded: remove that lead first." } : fedBy(VCO_IN, MESSAGE)(b)),
        },
        { label: "Message on CH1", test: probeOn(CH1)(MESSAGE) },
        {
          label: "FM swing",
          test: (b) => {
            const s = vcoSwing(b);
            return { ok: gainOf(b) > 0.05 && s.deviation > 800, detail: `${khz(s.fmin, 1)} – ${khz(s.fmax, 1)} (Δf ${khz(s.deviation)})` };
          },
        },
        {
          label: "Trigger on the message (CH1)",
          test: (b) => ({ ok: b.controls.scope.trigSource === "int" && b.controls.scope.intTrig === "ch1" }),
        },
      ],
      questions: ["i-example"],
    },
  ],
};

// ---------------------------------------------------------------- Part B
const partB: Section = {
  id: "comparator",
  title: "B · The comparator",
  steps: [
    {
      id: "b-wire",
      kind: "connect",
      title: "Square up the FM signal",
      highlight: {
        links: [
          [VCO_OUT, COMP_IN],
          [COMP_REF, "gnd.left"],
          [COMP_OUT, CH2],
        ],
        unlink: [[VCO_OUT, CH2]],
      },
      body: (
        <>
          <ol>
            <li>
              VCO SINE → COMPARATOR <strong>IN</strong>.
            </li>
            <li>
              COMPARATOR <strong>REF</strong> → GND: the reference is 0 V.
            </li>
            <li>Move CH2: remove VCO SINE → CH2, then COMPARATOR OUT → CH2 (2 V/div, DC coupling).</li>
          </ol>
          <h3 className="g-sub">What you see</h3>
          <DemodExplorer rows={["fm", "comparator"]} bench caption="Press “Load my settings” for one sweep of your own bench." />
          <ul>
            <li>
              A <strong>square wave between 0 V and 5 V</strong>.
            </li>
            <li>Its edges sit at the FM signal&rsquo;s zero crossings, so its cycles crowd and spread exactly like the FM.</li>
            <li>It is still fast (around 10 kHz): the message is not visible as a slow wave yet.</li>
          </ul>
        </>
      ),
      why: (
        <p>
          REF goes to GND so the threshold is a defined 0 V. Left open, a real input floats and the threshold would wander.
          On the scope the square wave looks blurred for the same reason the FM did in Lab 4: the VCO is not locked to the
          message.
        </p>
      ),
      checks: [
        { label: "VCO output on the comparator input", test: (b) => ({ ok: b.linked(COMP_IN, VCO_OUT) }) },
        {
          label: "Comparator reference at 0 V (REF to GND)",
          test: (b) =>
            b.drivers(COMP_REF).length
              ? { ok: false, detail: `REF is connected to ${portName(b.drivers(COMP_REF)[0])}, not to GND.` }
              : { ok: b.grounded(COMP_REF) },
        },
        { label: "CH2 shows the comparator output", test: probeOn(CH2)(COMP_OUT) },
        {
          label: "A square wave at the FM rate",
          test: (b) => {
            const r = b.reading(COMP_OUT);
            const f = b.frequency(COMP_OUT);
            return { ok: r.vpp > 4 && f > 5000, detail: `${r.min.toFixed(1)} V to ${r.max.toFixed(1)} V, about ${khz(f, 1)} on average` };
          },
        },
      ],
      questions: ["m-q2", "p-ref-open", "p-ref-wrong", "i-threshold"],
    },
  ],
};

// ---------------------------------------------------------------- Part C
const partC: Section = {
  id: "calibrate",
  title: "C · Calibrate the ZCD",
  steps: [
    {
      id: "c-setup",
      kind: "connect",
      title: "Trigger the pulse generator from the 8 kHz clock",
      highlight: {
        links: [
          [DIG8, CLK],
          [Q1, CH2],
        ],
        unlink: [[COMP_OUT, CH2]],
        controls: ["DELAY", "MODE", "INT TRIGGER"],
      },
      body: (
        <>
          <p>
            <strong>Why:</strong> the pulse width must be set before it can be trusted. A steady clock gives identical pulses
            that are easy to measure; the FM signal, whose spacing keeps changing, would not.
          </p>
          <ol>
            <li>
              MASTER SIGNALS <strong>8kHz DIGITAL</strong> → TWIN PULSE GENERATOR <strong>CLK</strong>. (Temporary.)
            </li>
            <li>
              Move CH2: remove COMPARATOR OUT → CH2, then <strong>Q1</strong> → CH2.
            </li>
            <li>
              <strong>DELAY</strong> fully to the left: the lab sheet&rsquo;s &ldquo;completely synchronised&rdquo;.
            </li>
            <li>MODE CH2, trigger INT source CH2.</li>
          </ol>
        </>
      ),
      why: (
        <>
          <p>
            The lab sheet&rsquo;s figure takes the pulses from Q1, the pulse at the clock edge. Q2 is the same pulse after
            the DELAY; with DELAY fully left that lag is the smallest. The notes from the class recording say the instructor
            used Q2 on the board in class: either output works for this experiment.
          </p>
          <p>
            The trainer&rsquo;s 8 kHz signal is derived from its 100 kHz clock (100/12 = 8.33 kHz), so the pulses repeat every
            120 µs.
          </p>
        </>
      ),
      checks: [
        {
          label: "CLK fed by the 8 kHz DIGITAL clock only",
          test: (b) => (b.linked(CLK, COMP_OUT) ? { ok: false, detail: "The comparator is still on CLK: calibrate first, with the clock alone." } : fedBy(CLK, DIG8)(b)),
        },
        pulseOnCh2,
        {
          label: "DELAY fully to the left",
          test: (b) => ({ ok: knobValue(b.controls.emona, "twin.delay") <= 0.02, detail: `DELAY ${Math.round(knobValue(b.controls.emona, "twin.delay") * 100)} %` }),
        },
      ],
      questions: ["e-calibrate", "e-delay", "p-q-output"],
    },
    {
      id: "c-width",
      kind: "adjust",
      title: "Set the pulse width to 12 µs",
      highlight: { controls: ["WIDTH", "TIME/DIV", "CH2 VOLTS/DIV"] },
      body: (
        <>
          <ol>
            <li>
              TIME/DIV <strong>5 µs</strong>, CH2 2 V/div.
            </li>
            <li>
              Turn <strong>WIDTH</strong> until the pulse spans <strong>2.4 divisions</strong>: 2.4 × 5 µs = 12 µs.
            </li>
          </ol>
          <p>
            The scope triggers on the pulse&rsquo;s rising edge, so the pulse starts at the left edge of the screen: measure
            from there to where it falls.
          </p>
          <Figure>
            <CalibrationFigure />
          </Figure>
          <Measure
            label="pulse width"
            unit="µs"
            precondition={(b) => (b.reading(Q1).vpp < 1 && b.reading(Q2).vpp < 1 ? "No pulses yet: the clock is not on CLK." : null)}
            truth={(b) => Math.round(twinWidth(b.controls.emona) * 1e7) / 10}
            working={(b, w) => {
              const tb = timeBase(b);
              return (
                <>
                  The pulse is <strong>{w} µs</strong> wide: at {tb.text} that is <strong>{((w * 1e-6) / tb.seconds).toFixed(1)} divisions</strong>.
                </>
              );
            }}
            hint="Measure the high part only, from the rising edge to the falling edge, then multiply the divisions by TIME/DIV."
          />
        </>
      ),
      why: (
        <p>
          A real trimmer is not marked in microseconds: the oscilloscope is the measuring instrument. The pulse height (0 to
          5 V) is fixed; only its length changes as you turn WIDTH.
        </p>
      ),
      checks: [
        {
          label: "Pulse width 12 µs",
          test: (b) => {
            const w = twinWidth(b.controls.emona) * 1e6;
            if (Math.abs(w - 12) <= 0.7) return { ok: true, detail: `${w.toFixed(1)} µs: ${(w / 5).toFixed(1)} divisions at 5 µs/div` };
            return { ok: false, detail: `Not 12 µs yet: the pulse is ${w > 12 ? "too wide" : "too narrow"}. At 5 µs/div it should span 2.4 divisions.` };
          },
        },
      ],
      questions: ["m-q3", "i-why-12"],
    },
  ],
};

// ---------------------------------------------------------------- Part D
const partD: Section = {
  id: "zcd",
  title: "D · The ZCD on the FM signal",
  steps: [
    {
      id: "d-wire",
      kind: "connect",
      title: "Replace the clock with the comparator",
      highlight: {
        links: [[COMP_OUT, CLK]],
        unlink: [[DIG8, CLK]],
        controls: ["TIME/DIV", "MODE"],
      },
      body: (
        <>
          <ol>
            <li>Remove 8kHz DIGITAL → CLK. Do not touch WIDTH.</li>
            <li>COMPARATOR OUT → CLK.</li>
            <li>MODE DUAL, trigger CH1, TIME/DIV 0.1 ms.</li>
          </ol>
          <h3 className="g-sub">What you see</h3>
          <DemodExplorer rows={["message", "comparator", "pulses"]} bench caption="One sweep of your bench: where the message is high the pulses crowd together; where it is low they spread out. Every pulse is 12 µs." />
          <ul>
            <li>
              A train of <strong>narrow 12 µs pulses</strong>, one per FM cycle.
            </li>
            <li>
              The <strong>gaps change</strong>: shorter where the FM frequency is high, longer where it is low.
            </li>
          </ul>
        </>
      ),
      why: <p>The check below gives the pulse rate and duty cycle implied by your VCO&rsquo;s swing and your 12 µs width: D = τ × f.</p>,
      checks: [
        {
          label: "CLK fed by the comparator only",
          test: (b) => (b.linked(CLK, DIG8) ? { ok: false, detail: "The 8 kHz clock is still on CLK: remove it." } : fedBy(CLK, COMP_OUT)(b)),
        },
        pulseOnCh2,
        {
          label: "Pulse rate and duty cycle follow the FM",
          test: (b) => {
            if (!b.linked(CLK, COMP_OUT) || !b.linked(COMP_IN, VCO_OUT)) return { ok: false };
            const s = vcoSwing(b);
            const tau = twinWidth(b.controls.emona);
            return {
              ok: b.reading(Q1).vpp > 4,
              detail: `${khz(s.fmin, 1)} – ${khz(s.fmax, 1)} pulses per second; duty cycle ${(100 * tau * s.fmin).toFixed(1)} – ${(100 * tau * s.fmax).toFixed(1)} %`,
            };
          },
        },
      ],
      questions: ["i-what-changes", "i-comp-vs-zcd", "p-pulses-info", "p-comp-alone"],
    },
  ],
};

// ---------------------------------------------------------------- Part E
const partE: Section = {
  id: "lpf",
  title: "E · The low-pass filter",
  steps: [
    {
      id: "e-wire",
      kind: "connect",
      title: "Average the pulses: the baseband LPF",
      highlight: {
        links: [
          [Q1, BB_IN],
          [BB_OUT, CH2],
        ],
        unlink: [[Q1, CH2]],
        controls: ["CH2 coupling", "CH2 VOLTS/DIV", "TIME/DIV"],
      },
      body: (
        <>
          <ol>
            <li>
              Q1 → CHANNEL MODULE <strong>BASEBAND LPF</strong> input (the lab sheet&rsquo;s base-band low-pass filter).
            </li>
            <li>Move CH2 to the BASEBAND LPF output.</li>
            <li>
              CH2 on <strong>AC coupling</strong>, about <strong>20 mV/div</strong>. TIME/DIV 0.2 ms, trigger CH1.
            </li>
          </ol>
          <h3 className="g-sub">What you see</h3>
          <ul>
            <li>
              A <strong>small sine at 2 kHz</strong>, in step with the message on CH1: the recovered message.
            </li>
            <li>On DC coupling it sits on a positive DC level: the average at the rest frequency.</li>
          </ul>
          <Note tone="hardware" title="Lab sheet and lab report">
            The lab sheet says base-band LPF; the lab report used the Tuneable LPF at maximum gain. Both are low-pass filters
            and both recover the message; the checks accept either. With the Tuneable LPF, set fc a little above 2 kHz.
          </Note>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Why so small?</strong> The average only swings a few tenths of a volt (lesson 6), and the baseband LPF&rsquo;s
            cutoff, about 1.6 kHz on the trainer&rsquo;s specification, is just below the 2 kHz message, so it passes the
            message at only about a third.
          </p>
          <p>
            <strong>Why it is needed.</strong> The pulse train is fast: its components at the FM rate (around 10 kHz) and
            above must go, and the slow change of its average must stay.
          </p>
        </>
      ),
      checks: [
        chainIntact,
        {
          label: "CH2 shows the filter output",
          test: (b) => {
            const out = filterOut(b);
            return out ? probeOn(CH2)(out)(b) : { ok: false };
          },
        },
        {
          label: "A recovered 2 kHz message",
          test: (b) => {
            if (brokenLink(b)) return { ok: false, detail: "No valid message without the whole chain." };
            return recovered(b, filterOut(b)!, 0.03);
          },
        },
      ],
      questions: ["m-q4", "p-baseband-small", "i-offset", "i-zero-msg", "p-cutoff-low", "p-cutoff-high"],
    },
  ],
};

// ---------------------------------------------------------------- Part F
const partF: Section = {
  id: "buffer",
  title: "F · Amplify and measure",
  steps: [
    {
      id: "f-wire",
      kind: "connect",
      title: "Amplify the recovered message",
      highlight: {
        links: [
          [BB_OUT, BUF_IN],
          [BUF_OUT, CH2],
        ],
        unlink: [[BB_OUT, CH2]],
        controls: ["BUFFER GAIN", "CH2 VOLTS/DIV"],
      },
      body: (
        <>
          <ol>
            <li>BASEBAND LPF output → BUFFER IN.</li>
            <li>Move CH2 to BUFFER OUT.</li>
            <li>
              Turn <strong>BUFFER GAIN</strong> up and watch the message grow. Adjust CH2 VOLTS/DIV to keep it on screen.
            </li>
          </ol>
          <Note tone="hardware" title="Getting to the lab report's 4 Vp-p">
            With the baseband LPF the buffer&rsquo;s ×10 gives about 1 Vp-p on this bench. The instructor suggested adding
            the Tuneable LPF&rsquo;s gain (GAIN at maximum) before the buffer; the lab report used the Tuneable LPF in place of
            the baseband filter and reached about 4 Vp-p. Both are accepted.
          </Note>
        </>
      ),
      why: <p>The buffer changes the size only. Look for the same 2 kHz, the same shape, a little ripple at most: just bigger.</p>,
      checks: [
        chainIntact,
        {
          label: "BUFFER fed by the recovered message",
          test: (b) => {
            const d = b.drivers(BUF_IN)[0];
            if (!d) return { ok: false };
            if (d === BB_OUT && zcdFeeds(b, BB_IN)) return { ok: true };
            if (d === TLPF_OUT && (zcdFeeds(b, TLPF_IN) || b.linked(TLPF_IN, BB_OUT))) return { ok: true, detail: "Through the Tuneable LPF." };
            return { ok: false, detail: `The BUFFER is fed by ${portName(d)}, not by the filter.` };
          },
        },
        { label: "CH2 shows the BUFFER output", test: probeOn(CH2)(BUF_OUT) },
        {
          label: "Amplified 2 kHz message",
          test: (b) => {
            const out = filterOut(b);
            if (brokenLink(b) || !out) return { ok: false, detail: "No valid message without the whole chain." };
            const before = b.tone(out).messageVpp;
            const r = recovered(b, BUF_OUT, 0.4);
            const t = b.tone(BUF_OUT);
            return { ok: r.ok && t.messageVpp > 2 * before, detail: `${r.detail} · ×${(t.messageVpp / Math.max(1e-6, before)).toFixed(1)} the filter output` };
          },
        },
      ],
      questions: ["p-buffer", "i-gain-advice", "p-buffer-limits"],
    },
    {
      id: "f-measure",
      kind: "observe",
      title: "Measure the recovered frequency",
      highlight: { controls: ["TIME/DIV", "MODE"] },
      body: (
        <>
          <p>
            TIME/DIV <strong>0.2 ms</strong>. Count the divisions of one cycle of the recovered message on CH2.
          </p>
          <NumberAnswer
            q="In the lab report one cycle spanned about 2.4 divisions at 0.2 ms/div. What frequency is that?"
            answer={2.083}
            unit="kHz"
            tolerance={0.02}
            explain={
              <>
                T = 2.4 × 0.2 ms = 0.48 ms, f = 1 / 0.48 ms ≈ <strong>2.08 kHz</strong>.
              </>
            }
          />
          <Measure
            label="recovered message on your bench"
            unit="kHz"
            precondition={(b) => (b.tone(BUF_OUT).messageVpp < 0.05 ? "No recovered message at the BUFFER output yet." : null)}
            truth={(b) => b.frequency(BUF_OUT, 4e-3, 0.5e-6) / 1000}
            working={(b, v) => frequencyWorking(b, v * 1000)}
          />
          <p>
            Compare with CH1: <strong>same frequency</strong>, the same sine shape, slightly delayed by the filter, and a
            different size.
          </p>
        </>
      ),
      why: (
        <p>
          2.08 kHz is not an error: the trainer makes its &ldquo;2 kHz&rdquo; by dividing its 100 kHz clock by 48, so the
          message is 2.083 kHz. Recovering it proves the receiver turned the FM signal&rsquo;s frequency changes back into the
          message.
        </p>
      ),
      checks: [
        {
          label: "Recovered message at the message frequency",
          test: (b) => (brokenLink(b) ? { ok: false, detail: "The receiver chain is incomplete." } : recovered(b, BUF_OUT, 0.4)),
        },
        { label: "Steady picture", test: steady },
      ],
      questions: ["e-measure", "e-proves", "p-why-2k", "i-small"],
    },
  ],
};

// ---------------------------------------------------------------- Part G
const partG: Section = {
  id: "conclusions",
  title: "G · Conclusions",
  steps: [
    {
      id: "g-summary",
      kind: "summary",
      title: "What the experiment showed",
      body: (
        <>
          <Terms
            items={[
              ["VCO", "Produced FM: 2 kHz message, 10 kHz rest frequency."],
              ["Comparator", "Squared it up at 0 V: same timing, amplitude removed."],
              ["ZCD", "One 12 µs pulse per cycle; only the gaps changed, so the duty cycle followed the frequency."],
              ["Calibration", "Width set to 12 µs on the steady 8 kHz clock, then the clock removed."],
              ["Low-pass filter", "Kept the changing average: a small 2 kHz sine on a DC level."],
              ["Buffer", "Amplified it: same frequency, about 2.08 kHz measured."],
            ]}
          />
          <Note tone="exam" title="A 30-second answer">
            We generated FM with the VCO at 10 kHz and a 2 kHz message. The comparator, with a 0 V reference, turned it into a
            square wave with the same zero crossings. The Twin Pulse Generator, set to 12 µs on the 8 kHz clock, made one
            fixed-width pulse per cycle, so the pulse density and duty cycle followed the frequency. The low-pass filter
            extracted the average, which rose and fell with the frequency, recovering the 2 kHz message, and the buffer
            amplified it; we measured about 2.08 kHz.
          </Note>
        </>
      ),
      questions: ["m-q1", "e-chain", "i-square-msg"],
    },
    {
      id: "g-sheet",
      kind: "summary",
      title: "The lab sheet's questions",
      body: (
        <p>
          The lab sheet&rsquo;s four questions and its MATLAB part. MATLAB uses its own numbers (200 Hz carrier, 30 + 60 Hz
          message, 1 kHz sampling) and its own demodulator, fmdemod.
        </p>
      ),
      questions: ["m-q1", "m-q2", "m-q3", "m-q4", "m-matlab"],
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
      title: "Lab 5: Final Oral Exam Preparation",
      body: (
        <p>
          Every question for this lab, by source. <strong>Practice oral exam</strong> asks one at a time, hardest first, and
          brings back the ones you did not know. The next step is a one-page revision sheet.
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
              ["FM demodulation", "Turning frequency changes back into the message voltage."],
              ["Comparator", "Two-level output: high when the input is above the reference, low below."],
              ["Zero crossing", "The instant the signal passes through 0 V."],
              ["ZCD", "Makes one fixed-width pulse per zero crossing in one direction."],
              ["Pulse width τ", "How long each pulse is high: 12 µs."],
              ["Period T", "Time from one pulse to the next: 1/f."],
              ["Duty cycle", "Fraction of the period spent high: τ/T."],
              ["LPF", "Passes the slow message, removes the fast pulse components."],
              ["Buffer", "Amplifies without changing frequency or shape; does not load the filter."],
            ]}
          />
          <h3 className="g-sub">Equations</h3>
          <Eq>
            <V>f</V> = 1/<V>T</V> &nbsp;·&nbsp; <V>D</V> = <V>τ</V>/<V>T</V> = <V>τ</V>·<V>f</V> &nbsp;·&nbsp; <V>V</V>
            <sub>avg</sub> = <V>V</V>
            <sub>p</sub>·<V>τ</V>·<V>f</V>
            <sub>inst</sub>
          </Eq>
          <h3 className="g-sub">Settings</h3>
          <ul>
            <li>Message 2 kHz (2.083 kHz exactly). VCO rest 10 kHz on LO.</li>
            <li>Comparator REF to GND (0 V).</li>
            <li>Twin Pulse Generator: DELAY fully left, WIDTH 12 µs set on the 8 kHz DIGITAL clock (2.4 div at 5 µs/div).</li>
            <li>Baseband LPF (lab sheet) or Tuneable LPF (lab report), then BUFFER. About 4 Vp-p after amplification in the lab report.</li>
          </ul>
          <h3 className="g-sub">Signal chain</h3>
          <p>
            <strong>FM → Comparator → ZCD → LPF → Buffer → recovered message</strong>
          </p>
          <h3 className="g-sub">Mistakes to avoid</h3>
          <ul>
            <li>Saying the pulses get wider at higher frequency: they get closer together.</li>
            <li>Checking the pulse width against the rest-frequency period instead of the shortest one.</li>
            <li>Confusing envelope detection (AM) with frequency-to-voltage conversion (FM).</li>
            <li>Leaving the 8 kHz clock on CLK when the comparator is connected.</li>
            <li>Thinking amplification can repair distortion.</li>
          </ul>
          <h3 className="g-sub">Answers to know by heart</h3>
          <ol className="must-know">
            <li>FM demodulation converts frequency variations back into the message voltage.</li>
            <li>An envelope detector cannot demodulate FM: its envelope is flat.</li>
            <li>The comparator squares up the FM at 0 V: timing kept, amplitude removed, sharp edges for triggering.</li>
            <li>The ZCD makes one fixed 12 µs pulse per cycle; only the gaps change.</li>
            <li>Duty cycle = τ × f, so it rises with the frequency.</li>
            <li>The filter keeps the average, V = Vp·τ·f, which follows the frequency and so the message.</li>
            <li>12 µs is far below the shortest FM period, so pulses never overlap.</li>
            <li>The 8 kHz clock gives steady pulses to set the width; it is removed afterwards.</li>
            <li>The output has a DC level from the rest frequency; AC coupling removes it.</li>
            <li>The buffer amplifies the small output; it cannot remove distortion.</li>
            <li>We recover about 2 kHz, not 10 kHz, because the filter removes the pulse rate and keeps how the average changes.</li>
            <li>A straight LPF on FM gives nothing: the FM sine averages to zero.</li>
          </ol>
        </>
      ),
    },
  ],
};

const guide: Guide = {
  labId: 5,
  title: "Frequency Demodulation",
  sections: [theory, partA, partB, partC, partD, partE, partF, partG, exam],
  questions: QUESTIONS,
  bank: BANK,
};

export default guide;

