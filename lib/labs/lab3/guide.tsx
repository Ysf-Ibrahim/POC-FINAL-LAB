import { Eq, Figure, Frac, Note, Settings, Terms, V } from "@/components/guide/parts";
import { portTitle } from "@/lib/cables/feedback";
import type { Bench, Tone } from "@/lib/guide/bench";
import type { Check, CheckResult, Guide, Section } from "@/lib/guide/types";
import { PORTS } from "@/lib/ports/registry";
import { tlpfCutoff, tlpfGain } from "@/lib/sim/modules";
import {
  ADDER_A,
  ADDER_B,
  ADDER_OUT,
  CARRIER,
  CH1,
  CH2,
  MESSAGE,
  VDC,
  dcLevel,
  describeEnvelope,
  envelope,
  messageLevel,
  modulator,
  triggerOnMessage,
  steady,
  volts,
} from "../am";
import { AmFigure, BlockDiagram } from "../lab2/figures";
import {
  ChainFigure,
  ChargeFigure,
  DetectorFigure,
  DsbscDetectFigure,
  NodeFigure,
  OrderFigure,
  OverModFigure,
  RectifierFigure,
  ResponseFigure,
  SpectrumStagesFigure,
  TimeConstantFigure,
} from "./figures";
import { BANK, QUESTIONS } from "./questions";

/**
 * Lab 3 — Amplitude Modulation and Demodulation.
 *
 * Procedure, block diagrams (Figures 2, 4, 5) and node numbers follow the
 * Experiment 3 lab sheet. The transmitter is the one of Lab 2. Every check
 * measures the simulated circuit: which sockets are joined, what the
 * oscilloscope's CH2 is connected to, and the size, ripple and distortion of
 * the signal at each node.
 */

// ---------------------------------------------------------------- sockets
/** The Multiplier the lab sheet's wiring figure uses; any DC multiplier is accepted by the checks. */
const AM = "mult2.out";
const RECT_IN = "rectifier.in";
const RECT_OUT = "rectifier.out";
const DIODE_IN = "diode.in";
const DIODE_OUT = "diode.out";
const RC_IN = "rclpf.in";
const RC_OUT = "rclpf.out";
const TLPF_IN = "tlpf.in";
const TLPF_OUT = "tlpf.out";

// ------------------------------------------------------------- readings
const fixed = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);
const vpp = (v: number) => `${fixed(v)} Vp-p`;
const title = (id: string) => {
  const port = PORTS.get(id);
  return port ? portTitle(port) : id;
};
const hz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`);

/** The AM signal's socket, wherever the student built the modulator. */
const amOut = (b: Bench) => modulator(b)?.out ?? null;

/** `input` receives the AM signal. */
const fedAm =
  (input: string): Check["test"] =>
  (b) => {
    const am = amOut(b);
    if (!am) return { ok: false, detail: "There is no AM signal yet: the modulator of Part A is not complete." };
    return { ok: b.linked(input, am) };
  };

/** `input` is driven by `from` and by no other output. */
const fedBy =
  (input: string, from: string): Check["test"] =>
  (b) => {
    if (!b.linked(input, from)) return { ok: false };
    const others = b.drivers(input).filter((d) => d !== from);
    return others.length
      ? { ok: false, detail: `${title(others[0])} is also connected here. Two outputs must never be joined: remove that lead.` }
      : { ok: true };
  };

/** The oscilloscope's CH2 shows `node`, and only `node`. */
const probe =
  (node: string): Check["test"] =>
  (b) => {
    const drivers = b.drivers(CH2);
    const others = drivers.filter((d) => d !== node);
    if (others.length && b.linked(CH2, node))
      return { ok: false, detail: `CH2 is still connected to ${title(others[0])} as well. Remove that lead, so CH2 sees one node only.` };
    if (others.length) return { ok: false, detail: `CH2 still shows ${title(others[0])}.` };
    return { ok: b.linked(CH2, node) };
  };

const describe = (t: Tone) =>
  `2 kHz message ${vpp(t.messageVpp)} · carrier ripple ${fixed(t.ripple, t.ripple < 0.1 ? 3 : 2)} V${
    Number.isFinite(t.thd) ? ` · distortion ${t.thd.toFixed(1)}%` : ""
  } · DC level ${volts(t.mean)}`;

/** Under-modulated, ready for envelope detection. */
const depthBelowOne = (b: Bench): CheckResult => {
  const e = envelope(b);
  if (!e) return { ok: false, detail: "The AM signal is not being generated: check the Multiplier connections." };
  return { ok: e.mu >= 0.55 && e.mu <= 0.92, detail: describeEnvelope(e) };
};

const smoothMessage =
  (node: string, label = "Recovered 2 kHz message, smooth"): Check =>
  ({
    label,
    test: (b) => {
      const t = b.tone(node);
      return {
        ok: t.messageVpp > 0.5 && t.ripple < 0.03 * t.messageVpp + 0.005 && t.thd < 5,
        detail: describe(t),
      };
    },
  });

// ------------------------------------------------------------------ steps
const theory: Section = {
  id: "theory",
  title: "Understand the experiment",
  steps: [
    {
      id: "demodulation",
      kind: "theory",
      title: "A · What is demodulation?",
      body: (
        <>
          <p>
            In Lab 2 you built a <strong>transmitter</strong>. It added a DC level to a 2 kHz message and multiplied the
            result by a 100 kHz carrier:
          </p>
          <Eq>AM = ( Message + DC ) × Carrier</Eq>
          <p>
            The result is a 100 kHz wave whose height rises and falls with the message. Its outline, the{" "}
            <strong>envelope</strong>, has exactly the shape of the message.
          </p>
          <Figure caption="The AM signal from Lab 2. Dashed: its envelopes.">
            <AmFigure dc={2.5} />
          </Figure>
          <p>
            A receiver has the opposite job: take that AM signal and get the <strong>2 kHz message</strong> back. That
            is <strong>demodulation</strong>, and the receiver in this lab is the simplest one there is, the{" "}
            <strong>envelope detector</strong>.
          </p>
          <Note tone="key">
            The AM signal contains only 98, 100 and 102 kHz. There is no 2 kHz component in it to pick out. But its
            envelope has the shape of the message, so a circuit that traces the envelope recovers the message.
          </Note>
          <p>In this lab you will:</p>
          <ol>
            <li>Rebuild the Lab 2 transmitter.</li>
            <li>
              Build a receiver with the <strong>Rectifier</strong> and an <strong>RC LPF</strong>, then a{" "}
              <strong>Tuneable LPF</strong>, and look at the signal after each block (nodes 2, 3, 4).
            </li>
            <li>
              Build a second receiver with the <strong>Diode &amp; RC LPF</strong> and one more filter stage (nodes 5,
              6, 7), and compare the two.
            </li>
            <li>Over-modulate the transmitter and see what the receiver makes of it.</li>
          </ol>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Why the envelope is useful.</strong> At every instant the carrier is multiplied by (Message + DC),
            so the height of each carrier peak is (Message + DC) at that moment. Joining the peaks redraws (Message +
            DC). Following the peaks therefore gives back the message plus a constant, and the constant is easy to
            remove.
          </p>
          <p>
            <strong>Why no carrier is needed at the receiver.</strong> The envelope detector never multiplies by a
            carrier; it only measures how big each peak is. The transmitted carrier itself provides the reference.
            That is what makes this receiver so cheap: a diode, a resistor and a capacitor.
          </p>
        </>
      ),
      questions: ["i-what-demod", "i-type", "p-no-carrier-needed"],
    },
    {
      id: "detector",
      kind: "theory",
      title: "B · The envelope detector",
      body: (
        <>
          <p>The lab sheet&rsquo;s Figure 1 is the whole idea in three blocks:</p>
          <Figure>
            <ChainFigure blocks={["Rectifier", "RC LPF"]} nodes={[]} />
          </Figure>
          <Figure caption="Computed: the AM signal, what the rectifier lets through, and the RC low-pass output.">
            <DetectorFigure />
          </Figure>
          <Terms
            items={[
              [
                "Rectifier",
                "Chops the AM signal in half. Only the positive half-cycles get through, so only the upper envelope is left.",
              ],
              [
                "RC LPF",
                "Its capacitor charges up to each carrier peak and slowly discharges between peaks. The capacitor voltage traces the peaks: the envelope.",
              ],
              ["Output", "The envelope, which has the shape of the message: the message is recovered."],
            ]}
          />
          <p>
            On this trainer both blocks are on the <strong>UTILITIES</strong> module. There is also a{" "}
            <strong>DIODE &amp; RC LPF</strong> block that contains both in one, which you will use for the second
            receiver.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Why not filter the AM signal directly?</strong> A low-pass filter on the AM signal would output
            almost nothing. The AM signal goes up and down symmetrically, so over every carrier cycle it averages to
            zero, and its spectrum has nothing near 2 kHz (Lab 2).
          </p>
          <p>
            The rectifier is a <strong>non-linear</strong> circuit: it removes one half, so the average no longer
            cancels. In the spectrum, rectifying creates a copy of the message at 2 kHz (plus a DC level) next to the
            carrier components. The low-pass filter then keeps the low part and throws away the rest.
          </p>
          <Figure caption="What each stage does to the spectrum.">
            <SpectrumStagesFigure />
          </Figure>
        </>
      ),
      questions: ["r-how", "i-why-works", "i-two-parts", "r-components", "p-lpf-directly", "p-two-envelopes"],
    },
    {
      id: "rectifier",
      kind: "theory",
      title: "C · The rectifier",
      body: (
        <>
          <p>
            A <strong>diode</strong> is a one-way valve for current. It conducts when its input is more positive than
            its output by about <strong>0.7 V</strong> (a silicon diode, in the simple model used in the lab), and blocks
            current the other way.
          </p>
          <Figure caption="Half-wave rectification of three carrier cycles.">
            <RectifierFigure />
          </Figure>
          <ul>
            <li>
              <strong>Rectification</strong> means letting only one polarity through. A half-wave rectifier keeps the
              positive half-cycles and replaces the negative ones with 0 V.
            </li>
            <li>
              Applied to the AM signal, it removes the <strong>lower half</strong>, the mirror image. What is left is a
              row of positive pulses whose heights follow the <strong>upper envelope</strong>.
            </li>
            <li>
              Every pulse comes out about <strong>0.7 V lower</strong> than it went in. That is one reason the
              recovered message is smaller than the original.
            </li>
          </ul>
          <Note tone="caution" title="One diode, not two">
            The DIODE &amp; RC LPF block already contains a diode. Feeding it from the RECTIFIER puts two diodes in
            series: the second does nothing useful (the signal is already rectified) and costs another 0.7 V, about 1.4
            V in total. With the small signals of the lab that can leave too little to work with.
          </Note>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Why remove one half?</strong> The two halves of an AM signal are mirror images. Averaged together
            they cancel at every instant, so any smoothing would give zero. Keeping one half breaks that symmetry: the
            average of the remaining pulses rises and falls with the envelope.
          </p>
          <p>
            <strong>Which half?</strong> The lab sheet keeps the upper envelope and notes the lower one is just as
            good. Reverse the diode and you follow the lower envelope, which is the message upside-down: the same
            information.
          </p>
          <p>
            <strong>What the drop does near zero.</strong> The diode only conducts once the input exceeds about 0.7
            V. If the envelope comes close to zero, the smallest carrier peaks fall below that and are lost entirely.
            Another reason not to let μ reach 1.
          </p>
        </>
      ),
      questions: ["i-rectifier", "i-diode-drop", "i-two-diodes", "p-reverse", "p-full-wave"],
    },
    {
      id: "rc-lpf",
      kind: "theory",
      title: "D · The RC low-pass filter",
      body: (
        <>
          <p>
            A <strong>low-pass filter</strong> passes low frequencies and reduces high ones. After the rectifier, the
            signal holds the message (2 kHz, low) mixed with the carrier (100 kHz, high). The filter must let the
            first through and stop the second.
          </p>
          <Figure caption="Close-up of five carrier cycles: the capacitor follows the peaks.">
            <ChargeFigure />
          </Figure>
          <ol>
            <li>
              At each carrier <strong>peak</strong> the capacitor <strong>charges</strong> up to that peak.
            </li>
            <li>
              Between peaks it <strong>discharges</strong> slowly through the resistor.
            </li>
            <li>The next peak tops it up again, a little higher or lower, depending on where the envelope has gone.</li>
          </ol>
          <p>
            So the capacitor voltage tracks the peaks, which is the envelope. The small sawtooth left on it is{" "}
            <strong>ripple</strong>: carrier that the filter did not remove.
          </p>
          <Figure caption="The trainer's RC LPF (first order, corner 2.6 kHz) against a steep filter.">
            <ResponseFigure />
          </Figure>
          <p>
            A simple RC filter is <strong>not ideal</strong>. It does not stop everything above one frequency; it rolls
            off gradually. At 100 kHz it reduces the carrier only about 38 times, so some ripple always remains. And
            since its corner (2.6 kHz) is close to the message, it trims the 2 kHz message to about 0.78 of its size.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            <strong>The trade-off is the time constant RC.</strong> The capacitor must hold its charge across one
            carrier period, yet be able to drop as fast as the envelope falls:
          </p>
          <Eq>
            <Frac n="1" d={<><V>f</V><sub>c</sub></>} /> ≪ <V>RC</V> ≪ <Frac n="1" d={<><V>f</V><sub>m</sub></>} />
          </Eq>
          <p>
            Here: one carrier period is 10 µs and one message period 480 µs; the RC LPF&rsquo;s time constant, about 61
            µs, sits between them.
          </p>
          <Figure caption="Dashed: the envelope. Too small an RC leaves large ripple; too large an RC cannot follow the envelope down.">
            <TimeConstantFigure />
          </Figure>
          <ul>
            <li>
              <strong>RC too small</strong> (cutoff too high): the capacitor empties between peaks, giving large
              ripple.
            </li>
            <li>
              <strong>RC too large</strong> (cutoff too low): smoother, but the output decays along a slow exponential
              instead of following the envelope down, and cuts off the bottom of each cycle. This is called diagonal
              clipping. More smoothing is not automatically better.
            </li>
          </ul>
          <p>61 µs is the time constant of a 2.6 kHz corner: RC = 1 / (2π × 2600).</p>
        </>
      ),
      questions: [
        "r-lpf-role",
        "i-capacitor",
        "i-ripple",
        "i-why-ripple",
        "p-lpf-separates",
        "p-time-constant",
        "p-discharge",
        "p-rc-too-small",
        "p-rc-too-large",
      ],
    },
    {
      id: "orders",
      kind: "theory",
      title: "E · Second-order and third-order receivers",
      body: (
        <>
          <p>
            &ldquo;Order&rdquo; here counts the <strong>filtering stages</strong> after the rectifying diode. The lab
            compares two receivers:
          </p>
          <Figure caption="Second order (Figure 4): two filter stages.">
            <ChainFigure blocks={["Rectifier", "RC LPF", "Tuneable\nLPF"]} nodes={[1, 2, 3, 4]} />
          </Figure>
          <Figure caption="Third order (Figure 5): the Diode & RC LPF brings its own RC stage, then two more.">
            <ChainFigure blocks={["Diode &\nRC LPF", "RC LPF", "Tuneable\nLPF"]} nodes={[1, 5, 6, 7]} />
          </Figure>
          <Figure caption="After one RC stage and after a second one, on the same scale.">
            <OrderFigure />
          </Figure>
          <ul>
            <li>
              <strong>Each extra stage removes more carrier</strong>, so ripple drops: an RC stage at 2.6 kHz divides
              the 100 kHz ripple by roughly another 38.
            </li>
            <li>
              <strong>Each extra stage also attenuates the message</strong> a little (to about 0.78 at 2 kHz) and
              delays it.
            </li>
            <li>
              <strong>Gain fixes the size.</strong> The Tuneable LPF has a GAIN control. Amplifying is easy; repairing
              a distorted shape is not.
            </li>
          </ul>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Higher order is not automatically better.</strong> Every stage costs amplitude and adds delay. If a
            stage&rsquo;s cutoff were too low it would start eating the message itself. The right amount of filtering
            removes the carrier and leaves the message band alone.
          </p>
          <p>
            <strong>The two first stages differ, too.</strong> The Diode &amp; RC LPF charges its capacitor through the
            diode to the carrier <strong>peaks</strong>. The RECTIFIER feeding the separate RC LPF responds more to the{" "}
            <strong>average</strong> of the half-wave pulses, which is smaller. Keep this in mind when you compare the
            sizes of the two outputs in Part D.
          </p>
        </>
      ),
      questions: ["i-third-smoother", "i-order-cost", "i-fix-gain", "p-third-smaller", "i-shape"],
    },
    {
      id: "limits",
      kind: "theory",
      title: "F · Where envelope detection fails",
      body: (
        <>
          <p>
            The envelope detector recovers <strong>the envelope</strong>. It works only when the envelope{" "}
            <strong>is</strong> the message, which depends on the modulation index μ = message peak ÷ DC.
          </p>
          <Terms
            items={[
              ["μ < 1", "The envelope stays above zero and is a true copy of the message. This is the region to use in practice."],
              [
                "μ = 1",
                "The envelope just touches zero. Fine in theory, but near zero the diode stops conducting and the capacitor cannot follow quickly enough: the troughs flatten. Not used in practice.",
              ],
              [
                "μ > 1",
                "Over-modulation. (Message + DC) goes negative, the carrier flips phase, and the outline folds over. The detector faithfully follows the folded outline: the output is distorted.",
              ],
            ]}
          />
          <Figure caption="μ = 2: the envelope folds where message + DC goes negative, and the recovered message (solid) no longer matches the original (dashed).">
            <OverModFigure />
          </Figure>
          <p>
            Filtering cannot fix this. The detector did its job correctly; the envelope it was given is wrong.
          </p>
          <p>
            <strong>DSB-SC</strong> (no DC, no carrier) is the extreme case. Its outline is |message|, and the sign of
            the message is hidden in the carrier&rsquo;s phase reversals, which a diode cannot see. An envelope detector
            outputs the message folded up, at twice its frequency.
          </p>
          <Figure caption="DSB-SC into an envelope detector: the output (solid) is the folded message, not the message (dashed).">
            <DsbscDetectFigure />
          </Figure>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Coherent detection</strong> is what DSB-SC needs: multiply the received signal by a local carrier
            of exactly the same frequency and phase, then low-pass filter.
          </p>
          <Eq>
            <V>m</V>(<V>t</V>) cos²(ω<V>t</V>) = ½ <V>m</V>(<V>t</V>) + ½ <V>m</V>(<V>t</V>) cos(2ω<V>t</V>)
          </Eq>
          <p>
            The filter keeps ½<V>m</V>(<V>t</V>), sign included. A phase error φ scales the output by cos φ (zero at
            90°), and a frequency error makes it beat. This synchronisation is what makes DSB-SC receivers complex,
            and the carrier of DSB-FC is what makes the envelope detector possible.
          </p>
        </>
      ),
      questions: ["i-mu-practical", "i-mu-one", "i-mu-over", "m-q4", "r-am-vs-sc", "p-coherent-why", "r-sync"],
    },
  ],
};

const transmitter: Section = {
  id: "transmitter",
  title: "A · Rebuild the AM transmitter",
  steps: [
    {
      id: "a-intro",
      kind: "theory",
      title: "Part A: the transmitter first",
      body: (
        <>
          <p>
            A receiver can only be tested with an AM signal at its input, so the first job is to rebuild the Lab 2
            transmitter (the lab sheet&rsquo;s Figures 2 and 3).
          </p>
          <Figure caption="Lab sheet Figure 2. The message goes to CH1, the AM signal to CH2.">
            <BlockDiagram />
          </Figure>
          <p>
            The message stays on <strong>CH1</strong> for the whole lab: it is the reference to compare the recovered
            message with, and the signal the scope triggers on. <strong>CH2</strong> is the probe you move from node to
            node.
          </p>
          <Note tone="hardware" title="Coming from Lab 2?">
            If your Lab 2 circuit is still on the bench, the checks in the next steps will already be ticked. They test
            what is connected, not what you clicked.
          </Note>
        </>
      ),
      questions: ["i-why-tx-first"],
    },
    {
      id: "a-message",
      kind: "connect",
      title: "Wire the message and the DC offset",
      highlight: {
        links: [
          [MESSAGE, ADDER_A],
          [VDC, ADDER_B],
          [ADDER_OUT, CH1],
          ["scope.ch1.gnd", "gnd.right"],
        ],
      },
      body: (
        <>
          <p>Make these four connections, as in Lab 2:</p>
          <ol>
            <li>
              MASTER SIGNALS <strong>2kHz SINE</strong> → ADDER <strong>A</strong>
            </li>
            <li>
              VARIABLE DCV <strong>VDC</strong> → ADDER <strong>B</strong>
            </li>
            <li>
              ADDER <strong>GA+gB</strong> → oscilloscope <strong>CH1</strong> red node
            </li>
            <li>
              CH1 <strong>black</strong> node → a trainer <strong>GND</strong> socket
            </li>
          </ol>
        </>
      ),
      why: (
        <p>
          The Adder builds (Message + DC): input A carries the message, input B the DC from VDC. The black node joins
          the oscilloscope&rsquo;s ground to the trainer&rsquo;s, without which no reading means anything. One ground lead
          serves both channels.
        </p>
      ),
      checks: [
        { label: "2 kHz SINE → Adder A", test: (b) => ({ ok: b.linked(MESSAGE, ADDER_A) }) },
        {
          label: "VDC → Adder B",
          test: (b) => ({
            ok: b.linked(VDC, ADDER_B) && !b.grounded(ADDER_B),
            detail: b.grounded(ADDER_B) ? "Adder B is still grounded from the first part of Lab 2: remove that lead." : undefined,
          }),
        },
        { label: "Adder output → CH1", test: (b) => ({ ok: b.linked(ADDER_OUT, CH1) }) },
        { label: "Oscilloscope grounded to the trainer", test: (b) => ({ ok: b.scopeGrounded }) },
      ],
    },
    {
      id: "a-modulator",
      kind: "connect",
      title: "Wire the modulator",
      highlight: {
        links: [
          [ADDER_OUT, "mult2.x"],
          [CARRIER, "mult2.y"],
          [AM, CH2],
        ],
      },
      body: (
        <>
          <ol>
            <li>
              ADDER <strong>GA+gB</strong> → MULTIPLIER <strong>X DC</strong>
            </li>
            <li>
              MASTER SIGNALS <strong>100kHz SINE</strong> → MULTIPLIER <strong>Y DC</strong>
            </li>
            <li>
              MULTIPLIER <strong>kXY</strong> → oscilloscope <strong>CH2</strong> red node
            </li>
          </ol>
          <p>
            The Multiplier output is <strong>node 1</strong> of the lab sheet: the AM signal that the receivers will
            demodulate.
          </p>
        </>
      ),
      why: (
        <p>
          Use the DC inputs. An AC input passes the signal through a capacitor, which would block the DC you added and
          turn the output into DSB-SC, which an envelope detector cannot demodulate.
        </p>
      ),
      checks: [
        { label: "Shifted message and 100 kHz carrier are on one Multiplier", test: (b) => ({ ok: modulator(b) !== null }) },
        {
          label: "AM signal on CH2",
          test: (b) => {
            const am = amOut(b);
            return { ok: !!am && b.linked(am, CH2) };
          },
        },
      ],
    },
    {
      id: "a-levels",
      kind: "adjust",
      title: "Set μ = 0.8 for the receiver",
      highlight: { controls: ["ADDER G", "VDC", "MODE", "CH2 VOLTS/DIV", "CH2 POSITION", "TRIGGER SOURCE", "INT TRIGGER"] },
      body: (
        <>
          <ol>
            <li>
              Message: <strong>4 Vp-p</strong> at the Adder output (ADDER <strong>G</strong>, as in Lab 2).
            </li>
            <li>
              DC: turn <strong>VDC</strong> fully to one end. That gives <strong>2.5 V</strong> at the Adder output
              with g at ×1.
            </li>
          </ol>
          <Eq>
            μ = <Frac n="2 V" d="2.5 V" /> = 0.8
          </Eq>
          <Settings
            rows={[
              ["MODE", "DUAL"],
              ["CH1 VOLTS/DIV", "1 V"],
              ["CH2 VOLTS/DIV", "5 V"],
              ["TIME/DIV", "0.2 ms"],
              ["Trigger", "INT, source CH1"],
            ]}
          />
          <p>
            Put CH2&rsquo;s 0 V on the centre line: switch CH2 coupling to <strong>GND</strong>, bring the flat line to
            the centre with <strong>CH2 POSITION</strong>, then switch back to <strong>DC</strong>. You will read the
            receiver&rsquo;s nodes against that line.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Why 0.8 and not 1?</strong> The detector needs μ below 1 in practice. μ = 0.8 keeps the envelope
            well clear of zero: its lowest point is (2.5 − 2) × 2 = 1 V, still above the diode&rsquo;s 0.7 V.
          </p>
          <p>
            <strong>Why trigger on CH1?</strong> The message crosses the trigger level once per cycle, so every sweep
            starts at the same point of the envelope. All the nodes you will look at follow the message, so they stand
            still on the screen too.
          </p>
          <p>Either end of VDC works: the sign of the DC changes which way the trace moves, not the depth.</p>
        </>
      ),
      checks: [
        { label: "Message is 4 Vp-p", test: messageLevel },
        { label: "DC at the Adder output is 2.5 V", test: dcLevel(2.5, 0.15) },
        { label: "AM is under-modulated, μ ≈ 0.8", test: depthBelowOne },
        { label: "Scope triggers on the message (CH1)", test: triggerOnMessage },
        { label: "The picture is steady", test: steady },
      ],
    },
    {
      id: "a-check",
      kind: "observe",
      title: "Observe: an AM signal fit for envelope detection",
      body: (
        <>
          <Figure caption="μ = 0.8: the envelope never comes near zero.">
            <AmFigure dc={2.5} />
          </Figure>
          <ul>
            <li>The upper edge of CH2 has the shape of the message on CH1.</li>
            <li>
              The narrowest part of the envelope stays open: the envelope <strong>never reaches zero</strong>. That is
              what the receiver needs.
            </li>
            <li>Record this picture: the lab sheet asks for the AM signal plot.</li>
          </ul>
          <Note tone="exam">
            The modulation index for an envelope detector: <strong>μ &lt; 1</strong>. That is the lab sheet&rsquo;s
            question 3, and the reason for this setting.
          </Note>
        </>
      ),
      checks: [{ label: "The envelope stays clear of zero (μ < 1)", test: depthBelowOne }],
      questions: ["m-q3", "i-why-dc"],
    },
  ],
};

const second: Section = {
  id: "second",
  title: "B · Second-order receiver",
  steps: [
    {
      id: "b-intro",
      kind: "theory",
      title: "Part B: Rectifier → RC LPF → Tuneable LPF",
      body: (
        <>
          <Figure caption="Lab sheet Figure 4. You will look at nodes 2, 3 and 4 in turn.">
            <ChainFigure blocks={["Rectifier", "RC LPF", "Tuneable\nLPF"]} nodes={[1, 2, 3, 4]} output="Demodulated" />
          </Figure>
          <p>
            You will build the receiver one block at a time and look at the signal after each block on{" "}
            <strong>CH2</strong>, keeping the message on <strong>CH1</strong> to compare.
          </p>
          <Note tone="caution" title="Moving the CH2 probe">
            To look at a new node, <strong>first remove the lead going to CH2</strong>, then run a new lead from the
            node to CH2. Adding a second lead to CH2 without removing the first would join two outputs together, and
            the bench would show neither of them correctly. The lead to remove is marked in red.
          </Note>
          <p>
            Set CH1 to <strong>AC coupling</strong> as well, so that the message is centred and easy to compare with
            CH2.
          </p>
        </>
      ),
    },
    {
      id: "b-node2",
      kind: "connect",
      title: "Node 2: after the rectifier",
      highlight: {
        links: [
          [AM, RECT_IN],
          [RECT_OUT, CH2],
        ],
        unlink: [[AM, CH2]],
      },
      body: (
        <>
          <ol>
            <li>
              MULTIPLIER <strong>kXY</strong> (the AM signal) → UTILITIES <strong>RECTIFIER</strong> input.
            </li>
            <li>Remove the lead from the Multiplier to CH2.</li>
            <li>
              RECTIFIER output → <strong>CH2</strong>. Keep CH2 on <strong>DC coupling</strong> and 5 V/div.
            </li>
          </ol>
          <h3 className="g-sub">What you see</h3>
          <Figure>
            <NodeFigure node={2} />
          </Figure>
          <ul>
            <li>
              <strong>Nothing below 0 V.</strong> The lower half of the AM signal is gone.
            </li>
            <li>
              The carrier is <strong>still there</strong>: the trace is still a dense band of 100 kHz pulses. Only its
              lower half has been removed.
            </li>
            <li>
              The tops of the pulses trace the <strong>upper envelope</strong>, about 0.7 V lower than in the AM
              signal.
            </li>
          </ul>
        </>
      ),
      why: (
        <p>
          It looks different from the AM signal because it is no longer symmetrical. That asymmetry is the point: the
          average of this signal now rises and falls with the envelope, which is what the filter will extract. Use DC
          coupling here, since AC coupling would shift the trace down and hide the fact that nothing is below zero.
        </p>
      ),
      checks: [
        { label: "AM signal reaches the RECTIFIER input", test: fedAm(RECT_IN) },
        { label: "CH2 shows node 2 only", test: probe(RECT_OUT) },
        {
          label: "Node 2 is rectified: nothing below 0 V",
          test: (b) => {
            const am = amOut(b);
            const r = b.reading(RECT_OUT);
            const peak = am ? b.reading(am).max : NaN;
            return {
              ok: r.min > -0.01 && r.max > 1,
              detail: `Lowest ${volts(r.min)}, highest ${volts(r.max)}${Number.isFinite(peak) ? ` (AM peak ${volts(peak)}: the diode takes about 0.7 V)` : ""}`,
            };
          },
        },
      ],
      questions: ["i-three-things"],
    },
    {
      id: "b-node3",
      kind: "connect",
      title: "Node 3: after the RC LPF",
      highlight: {
        links: [
          [RECT_OUT, RC_IN],
          [RC_OUT, CH2],
        ],
        unlink: [[RECT_OUT, CH2]],
        controls: ["CH2 coupling"],
      },
      body: (
        <>
          <ol>
            <li>
              RECTIFIER output → <strong>RC LPF</strong> input.
            </li>
            <li>Move CH2: remove the lead from the rectifier output to CH2, then RC LPF output → CH2.</li>
            <li>
              Look first on <strong>DC coupling</strong> (0.5 V/div), then switch CH2 to <strong>AC</strong>.
            </li>
          </ol>
          <h3 className="g-sub">What you see</h3>
          <Figure>
            <NodeFigure node={3} />
          </Figure>
          <ul>
            <li>
              The 100 kHz band has gone: what is left is a <strong>2 kHz wave</strong> with the shape of the message.
              The envelope has appeared.
            </li>
            <li>
              It is not perfectly clean: a fine <strong>ripple</strong> rides on it. That is carrier the RC filter
              did not remove.
            </li>
            <li>
              On DC coupling it sits <strong>above zero</strong>: the detector recovered the DC added at the transmitter
              along with the message. AC coupling removes it.
            </li>
          </ul>
        </>
      ),
      why: (
        <>
          <p>
            The resistor and capacitor form a first-order low-pass with its corner at 2.6 kHz. The 100 kHz pulses are
            far above it and are reduced about 38 times; the 2 kHz message is below it and gets through (at about 0.78
            of its size). What is reduced but not removed is the ripple.
          </p>
          <p>
            The DC level comes from the envelope itself: the envelope is DC + message. The instructor&rsquo;s point:
            a receiver must remove the mirror half (rectifier), the carrier (filter) and the DC shift (series capacitor or
            AC coupling).
          </p>
        </>
      ),
      checks: [
        { label: "RC LPF is fed by the RECTIFIER", test: fedBy(RC_IN, RECT_OUT) },
        { label: "CH2 shows node 3 only", test: probe(RC_OUT) },
        {
          label: "The envelope is recovered, with some ripple",
          test: (b) => {
            const t = b.tone(RC_OUT);
            return { ok: t.messageVpp > 0.5, detail: describe(t) };
          },
        },
        {
          label: "CH2 on AC coupling: the DC is removed",
          test: (b) => ({ ok: b.controls.scope.ch2.coupling === "ac", detail: `Coupling is ${b.controls.scope.ch2.coupling.toUpperCase()}` }),
        },
      ],
      questions: ["i-ripple", "i-dc-remove", "p-shifted"],
    },
    {
      id: "b-node4",
      kind: "connect",
      title: "Node 4: after the Tuneable LPF",
      highlight: {
        links: [
          [RC_OUT, TLPF_IN],
          [TLPF_OUT, CH2],
        ],
        unlink: [[RC_OUT, CH2]],
        controls: ["TUNEABLE LPF fc", "TUNEABLE LPF GAIN"],
      },
      body: (
        <>
          <ol>
            <li>
              RC LPF output → <strong>TUNEABLE LPF IN</strong>.
            </li>
            <li>Move CH2 to the TUNEABLE LPF <strong>OUT</strong>.</li>
            <li>
              Set the Tuneable LPF: <strong>fc ≈ 10 kHz</strong>, <strong>GAIN ×1</strong>.
            </li>
          </ol>
          <h3 className="g-sub">What you see</h3>
          <Figure>
            <NodeFigure node={4} />
          </Figure>
          <ul>
            <li>
              A <strong>smooth 2 kHz sine</strong>: the ripple has gone. This is the demodulated message.
            </li>
            <li>
              Compare it with CH1: <strong>same frequency, same shape</strong>, slightly delayed and{" "}
              <strong>about half the size</strong>.
            </li>
          </ul>
          <p>
            Try it: turn fc below 2 kHz and the message itself fades away. Then set it back to about 10 kHz.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            The Tuneable LPF is a steep filter (8th order on this trainer). With fc at 10 kHz the 2 kHz message is well
            inside its passband and the 100 kHz carrier deep in its stopband, so the ripple left by the RC filter is
            removed almost completely.
          </p>
          <p>
            <strong>Where the size went.</strong> The diode drop, the averaging of half-wave pulses by the rectifier
            and RC LPF, and the RC filter&rsquo;s own 0.78 at 2 kHz add up: about 1.9 Vp-p from a 4 Vp-p message.
            The shape and the frequency are right, which is what matters.
          </p>
          <p>
            <strong>Cutoff choice.</strong> Too low and the filter removes the message; too high and carrier and noise
            get through. It belongs above the message and well below the carrier.
          </p>
        </>
      ),
      checks: [
        { label: "Tuneable LPF is fed by the RC LPF", test: fedBy(TLPF_IN, RC_OUT) },
        { label: "CH2 shows node 4 only", test: probe(TLPF_OUT) },
        {
          label: "fc passes the message and blocks the carrier",
          test: (b) => {
            const fc = tlpfCutoff(b.controls.emona);
            return { ok: fc >= 4000 && fc <= 12_500, detail: `fc = ${hz(fc)}, GAIN ×${tlpfGain(b.controls.emona).toFixed(2)}` };
          },
        },
        smoothMessage(TLPF_OUT),
      ],
      questions: ["p-cutoff-low", "p-cutoff-high", "p-delay", "p-lpf-separates", "p-carrier-close", "p-message-too-fast"],
    },
    {
      id: "b-gain",
      kind: "adjust",
      title: "Fix the attenuation",
      highlight: { controls: ["TUNEABLE LPF GAIN", "CH2 VOLTS/DIV"] },
      body: (
        <>
          <p>
            The recovered message is the right shape but too small. Turn the Tuneable LPF <strong>GAIN</strong> up
            until node 4 is about the size of the message: <strong>4 divisions at 1 V/div</strong> on CH2, like CH1.
          </p>
          <Note tone="hardware">
            You need almost the whole range of the GAIN knob (it stops at ×2). If a receiver needs more, a separate
            amplifier such as the BUFFER (up to ×10) is added after the filter.
          </Note>
          <p>This is the lab sheet&rsquo;s question 2, answered on the bench.</p>
        </>
      ),
      why: (
        <p>
          Amplifying works here because the message was recovered with the right shape and frequency; gain only
          changes its size. Gain cannot help a message whose shape is wrong: it amplifies the distortion just as much.
        </p>
      ),
      checks: [
        {
          label: "Recovered message about the size of the original (4 Vp-p)",
          test: (b) => {
            const t = b.tone(TLPF_OUT);
            return {
              ok: t.messageVpp >= 3.5 && t.messageVpp <= 4.5,
              detail: `Node 4: ${vpp(t.messageVpp)} at GAIN ×${tlpfGain(b.controls.emona).toFixed(2)}`,
            };
          },
        },
      ],
      questions: ["m-q2", "i-shape", "p-gain-no-fix"],
    },
  ],
};

const third: Section = {
  id: "third",
  title: "C · Third-order receiver",
  steps: [
    {
      id: "c-intro",
      kind: "adjust",
      title: "Part C: Diode & RC LPF → RC LPF → Tuneable LPF",
      highlight: { controls: ["TUNEABLE LPF GAIN"] },
      body: (
        <>
          <Figure caption="Lab sheet Figure 5. You will look at nodes 5, 6 and 7.">
            <ChainFigure blocks={["Diode &\nRC LPF", "RC LPF", "Tuneable\nLPF"]} nodes={[1, 5, 6, 7]} output="Demodulated" />
          </Figure>
          <p>
            The <strong>DIODE &amp; RC LPF</strong> block replaces the RECTIFIER: it is a diode and an RC filter in
            one, so it rectifies <strong>and</strong> follows the peaks. After it come the same RC LPF and Tuneable LPF
            as before, which you will rewire.
          </p>
          <Note tone="caution" title="Feed it the AM signal directly">
            Connect the DIODE &amp; RC LPF input to the <strong>Multiplier output</strong>, not to the RECTIFIER output.
            Rectifier then Diode puts two diodes in series: no benefit and about 1.4 V lost.
          </Note>
          <p>
            First put the Tuneable LPF <strong>GAIN back to ×1</strong> (mid-travel; double-click the knob), so the two
            receivers are compared on equal terms.
          </p>
        </>
      ),
      checks: [
        {
          label: "Tuneable LPF GAIN back to ×1",
          test: (b) => {
            const g = tlpfGain(b.controls.emona);
            return { ok: Math.abs(g - 1) <= 0.05, detail: `GAIN ×${g.toFixed(2)}` };
          },
        },
      ],
      questions: ["i-two-diodes"],
    },
    {
      id: "c-node5",
      kind: "connect",
      title: "Node 5: after the Diode & RC LPF",
      highlight: {
        links: [
          [AM, DIODE_IN],
          [DIODE_OUT, CH2],
        ],
        unlink: [[TLPF_OUT, CH2]],
        controls: ["TIME/DIV"],
      },
      body: (
        <>
          <ol>
            <li>
              MULTIPLIER <strong>kXY</strong> → <strong>DIODE &amp; RC LPF</strong> input.
            </li>
            <li>Move CH2 to the DIODE &amp; RC LPF output (1 V/div).</li>
            <li>
              Look at 0.2 ms/div, then turn <strong>TIME/DIV to 50 µs</strong> and back.
            </li>
          </ol>
          <h3 className="g-sub">What you see</h3>
          <Figure>
            <NodeFigure node={5} />
          </Figure>
          <ul>
            <li>
              Already the <strong>envelope</strong>: one block has rectified and filtered.
            </li>
            <li>
              At 50 µs/div, a clear <strong>sawtooth</strong> rides on it: the capacitor charging quickly at each carrier
              peak and discharging slowly between them. That is the ripple, close up.
            </li>
            <li>
              Larger than node 3: this block charges its capacitor to the <strong>peaks</strong>.
            </li>
          </ul>
        </>
      ),
      why: (
        <p>
          In the Diode &amp; RC LPF the diode charges the capacitor directly. It can only charge it up (the diode
          blocks current back), so the capacitor holds each peak and only loses charge through the resistor. That is
          the classic envelope detector of the lab sheet&rsquo;s Figure 1, in one block.
        </p>
      ),
      checks: [
        {
          label: "The AM signal goes straight into the Diode & RC LPF",
          test: (b) => {
            if (b.linked(DIODE_IN, RECT_OUT)) return { ok: false, detail: "It is fed from the RECTIFIER: that is two diodes in series. Feed it from the Multiplier output." };
            return fedAm(DIODE_IN)(b);
          },
        },
        { label: "CH2 shows node 5 only", test: probe(DIODE_OUT) },
        {
          label: "The envelope, with a sawtooth ripple",
          test: (b) => {
            const t = b.tone(DIODE_OUT);
            return { ok: t.messageVpp > 0.5 && t.ripple > 0.02, detail: describe(t) };
          },
        },
      ],
      questions: ["p-node5-sawtooth", "i-capacitor"],
    },
    {
      id: "c-node6",
      kind: "connect",
      title: "Node 6: after the second RC LPF",
      highlight: {
        links: [
          [DIODE_OUT, RC_IN],
          [RC_OUT, CH2],
        ],
        unlink: [
          [RECT_OUT, RC_IN],
          [DIODE_OUT, CH2],
        ],
        controls: ["TIME/DIV"],
      },
      body: (
        <>
          <ol>
            <li>
              Remove the lead from the RECTIFIER output to the RC LPF input. (The RC LPF can only have one input.)
            </li>
            <li>
              DIODE &amp; RC LPF output → <strong>RC LPF</strong> input.
            </li>
            <li>Move CH2 to the RC LPF output. TIME/DIV back to 0.2 ms.</li>
          </ol>
          <h3 className="g-sub">What you see</h3>
          <Figure>
            <NodeFigure node={6} />
          </Figure>
          <ul>
            <li>
              <strong>Much smoother</strong>: the sawtooth has almost gone.
            </li>
            <li>
              <strong>A little smaller</strong> than node 5. The check below shows both nodes side by side.
            </li>
          </ul>
        </>
      ),
      why: (
        <p>
          This is the instructor&rsquo;s trade-off, measured on one stage. The RC LPF divides the 100 kHz ripple by
          roughly 38, but it also passes the 2 kHz message at only about 0.78. Less ripple, less amplitude, a little more
          delay.
        </p>
      ),
      checks: [
        { label: "RC LPF is fed by the Diode & RC LPF only", test: fedBy(RC_IN, DIODE_OUT) },
        { label: "CH2 shows node 6 only", test: probe(RC_OUT) },
        {
          label: "The extra stage: far less ripple, a little smaller",
          test: (b) => {
            if (!b.linked(RC_IN, DIODE_OUT)) return { ok: false };
            const n5 = b.tone(DIODE_OUT);
            const n6 = b.tone(RC_OUT);
            return {
              ok: n6.ripple < n5.ripple / 5 && n6.messageVpp < n5.messageVpp,
              detail: `Node 5 → node 6: message ${fixed(n5.messageVpp)} → ${vpp(n6.messageVpp)}, ripple ${fixed(n5.ripple)} → ${fixed(n6.ripple, 3)} V`,
            };
          },
        },
      ],
      questions: ["i-third-smoother", "i-order-cost"],
    },
    {
      id: "c-node7",
      kind: "connect",
      title: "Node 7: after the Tuneable LPF",
      highlight: {
        links: [
          [RC_OUT, TLPF_IN],
          [TLPF_OUT, CH2],
        ],
        unlink: [[RC_OUT, CH2]],
      },
      body: (
        <>
          <p>
            The RC LPF output is still connected to the Tuneable LPF from Part B. Move CH2 to the{" "}
            <strong>TUNEABLE LPF OUT</strong>.
          </p>
          <h3 className="g-sub">What you see</h3>
          <Figure>
            <NodeFigure node={7} />
          </Figure>
          <ul>
            <li>
              A <strong>smooth 2 kHz sine</strong>, the same shape and frequency as the message on CH1: demodulated
              again, by the third-order receiver.
            </li>
            <li>Record nodes 5, 6 and 7 for your report.</li>
          </ul>
        </>
      ),
      checks: [{ label: "Tuneable LPF is fed by the RC LPF", test: fedBy(TLPF_IN, RC_OUT) }, { label: "CH2 shows node 7 only", test: probe(TLPF_OUT) }, smoothMessage(TLPF_OUT)],
    },
  ],
};

const compare: Section = {
  id: "compare",
  title: "D · Compare the receivers",
  steps: [
    {
      id: "d-compare",
      kind: "observe",
      title: "Second order against third order",
      body: (
        <>
          <p>What this bench gives with μ = 0.8, fc = 10 kHz and GAIN ×1:</p>
          <table className="g-settings g-compare">
            <thead>
              <tr>
                <th scope="col">Node</th>
                <th scope="col">2 kHz message</th>
                <th scope="col">Carrier ripple</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">3 · Rectifier + RC</th>
                <td>1.95 Vp-p</td>
                <td>0.24 V</td>
              </tr>
              <tr>
                <th scope="row">4 · second-order output</th>
                <td>1.9 Vp-p</td>
                <td>≈ 0</td>
              </tr>
              <tr>
                <th scope="row">5 · Diode &amp; RC</th>
                <td>5.9 Vp-p</td>
                <td>0.91 V</td>
              </tr>
              <tr>
                <th scope="row">6 · + one RC stage</th>
                <td>4.6 Vp-p</td>
                <td>0.02 V</td>
              </tr>
              <tr>
                <th scope="row">7 · third-order output</th>
                <td>4.5 Vp-p</td>
                <td>≈ 0</td>
              </tr>
            </tbody>
          </table>
          <Terms
            items={[
              [
                "Smoothness",
                "More filter stages, less ripple. The extra RC stage cuts the ripple from 0.91 V at node 5 to 0.02 V at node 6.",
              ],
              [
                "Attenuation",
                "Each stage also costs amplitude: node 5 → node 6 loses about a fifth of the message. Gain restores it.",
              ],
              ["Shape", "Both outputs have the shape and frequency of the message. That is what demodulation must preserve."],
            ]}
          />
          <Note tone="hardware" title="Why node 7 came out larger than node 4">
            The usual statement is that the third-order output is smoother but smaller, and stage for stage that holds
            (nodes 5 and 6). Here node 7 is still larger than node 4 because the <strong>first stages differ</strong>:
            the Diode &amp; RC LPF holds the carrier peaks, while the Rectifier followed by the separate RC LPF responds
            more to the average of the half-wave pulses. In this simulator that path is a pure average; on the real
            board the difference may be smaller.
          </Note>
        </>
      ),
      why: (
        <>
          <p>
            <strong>At the outputs, both look smooth.</strong> The Tuneable LPF is a steep 8th-order filter, and here
            it removes the remaining 100 kHz almost completely in both receivers. The difference in ripple is clearest
            before it, at nodes 3 and 6. The instructor notes that on the real bench some ripple can remain at the
            second-order output; this simulator models the Tuneable LPF as an ideal filter.
          </p>
          <p>
            <strong>For the oral:</strong> the third-order receiver gives a smoother output with less ripple; the extra
            filtering stage attenuates the signal, which is corrected with gain. If you are asked about your
            measurement, explain the peak-holding first stage.
          </p>
        </>
      ),
      questions: ["m-q1", "p-third-smaller", "i-fix-gain"],
    },
  ],
};

const overmod: Section = {
  id: "overmod",
  title: "E · Over-modulation",
  steps: [
    {
      id: "e-over",
      kind: "adjust",
      title: "Over-modulate the transmitter",
      highlight: { controls: ["TUNEABLE LPF fc", "VDC"] },
      body: (
        <>
          <ol>
            <li>
              Make sure the Tuneable LPF <strong>fc is at least 8 kHz</strong> (10 kHz is fine). You will see why
              below.
            </li>
            <li>
              Turn <strong>VDC</strong> back towards the middle until the DC at the Adder output is about{" "}
              <strong>1 V</strong>.
            </li>
          </ol>
          <Eq>
            μ = <Frac n="2 V" d="1 V" /> = 2
          </Eq>
          <p>Keep CH2 on node 7 and compare it with the message on CH1.</p>
          <h3 className="g-sub">What you see</h3>
          <Figure>
            <OverModFigure />
          </Figure>
          <ul>
            <li>
              The output is still 2 kHz, but it is <strong>not a sine any more</strong>: one half of each cycle is
              folded, with a kink where the envelope went through zero.
            </li>
            <li>The check below measures the distortion: from about 2% to over 20%.</li>
          </ul>
          <p>
            Optional: move CH2 back to the Multiplier output to see the folded AM envelope itself, then back to node 7.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            The DC is now smaller than the message peak, so (Message + DC) goes negative for part of each cycle. The
            carrier is multiplied by a negative number and reverses phase; the outline of the AM signal is |Message +
            DC|, folded. The detector follows that outline exactly, so its output is the folded shape.
          </p>
          <p>
            <strong>This is not a gain problem.</strong> Amplifying makes the folded output bigger, still folded.{" "}
            <strong>It is not a filter problem either</strong>: the detector did its job, but the envelope was wrong.
          </p>
          <p>
            <strong>Why fc had to be high.</strong> Folding creates harmonics at 4, 6, 8 kHz. Turn fc down to about 3
            kHz and the output looks like a sine again, because the filter removes those harmonics. That only works
            because this test message is a single tone: a real message (speech, music) has its own frequencies across
            the whole band, mixed with the distortion, and no filter can separate them.
          </p>
        </>
      ),
      checks: [
        {
          label: "fc high enough to show the distortion",
          test: (b) => {
            const fc = tlpfCutoff(b.controls.emona);
            return { ok: fc >= 8000, detail: `fc = ${hz(fc)}` };
          },
        },
        {
          label: "AM is over-modulated (μ > 1)",
          test: (b) => {
            const e = envelope(b);
            if (!e) return { ok: false, detail: "The AM signal is not being generated." };
            return { ok: e.mu > 1.3, detail: describeEnvelope(e) };
          },
        },
        {
          label: "The recovered message is distorted",
          test: (b) => {
            const t = b.tone(TLPF_OUT);
            return { ok: t.thd > 10, detail: describe(t) };
          },
        },
      ],
      questions: ["i-mu-over", "p-filter-no-fix", "p-gain-no-fix", "p-mu-one-diode"],
    },
    {
      id: "e-dsbsc",
      kind: "observe",
      title: "No DC at all: DSB-SC",
      highlight: { controls: ["VDC"] },
      body: (
        <>
          <p>
            Turn <strong>VDC</strong> to the middle, so the DC is <strong>0 V</strong>. The transmitter now sends
            DSB-SC: message × carrier, no carrier component.
          </p>
          <Figure>
            <DsbscDetectFigure />
          </Figure>
          <ul>
            <li>
              The output repeats at <strong>4 kHz</strong>, twice the message frequency: it is the message with every
              negative half folded up.
            </li>
            <li>
              The 2 kHz message itself has <strong>disappeared</strong> from the output: the check below measures it.
            </li>
          </ul>
          <p>
            Finally, turn <strong>VDC</strong> back to its end stop (μ = 0.8): node 7 is a clean sine again.
          </p>
          <Note tone="exam">
            This is the lab sheet&rsquo;s question 4, demonstrated: an envelope detector cannot demodulate DSB-SC. It
            needs coherent detection with a synchronised carrier.
          </Note>
        </>
      ),
      checks: [
        {
          label: "With DC at 0 V, no 2 kHz message comes out",
          test: (b) => {
            const t = b.tone(TLPF_OUT);
            const dc = Math.abs(b.reading(ADDER_OUT).mean);
            return { ok: dc < 0.15 && t.messageVpp < 0.15, detail: `DC at the Adder output ${volts(dc)} · 2 kHz at node 7: ${vpp(t.messageVpp)}` };
          },
        },
      ],
      questions: ["m-q4", "p-dsbsc-output", "p-coherent-why", "r-am-vs-sc", "r-sync"],
    },
  ],
};

const wrapUp: Section = {
  id: "summary",
  title: "F · Conclusions",
  steps: [
    {
      id: "f-summary",
      kind: "summary",
      title: "What the experiment demonstrated",
      body: (
        <>
          <Terms
            items={[
              ["AM generation", "(Message + DC) × Carrier gives an AM signal whose envelope is the message, for μ ≤ 1."],
              ["Envelope detector", "A diode followed by an RC low-pass filter traces the envelope, so it recovers the message without any carrier at the receiver."],
              ["Rectification", "Removes the mirror half. Without it the AM signal averages to zero; with it, a copy of the message appears at low frequency."],
              ["Filtering", "Keeps the 2 kHz message and removes the 100 kHz carrier. What it cannot remove completely is ripple."],
              ["Filter order", "More stages: less ripple, but more attenuation and delay. Gain restores the size."],
              ["DC", "The recovered envelope includes the transmitter's DC; AC coupling or a series capacitor removes it."],
              ["Limits", "μ must stay below 1. Over-modulation folds the envelope and the output is distorted; DSB-SC cannot be envelope-detected at all."],
            ]}
          />
          <Note tone="exam" title="A 30-second answer">
            We generated a DSB-FC AM signal with μ = 0.8 and demodulated it with an envelope detector. The rectifier
            removed one half of the AM signal and the RC low-pass filter followed the peaks, recovering the envelope,
            with some carrier ripple. The Tuneable LPF removed the remaining ripple and its gain restored the amplitude.
            A third filter stage gave a smoother signal at the cost of some attenuation. When we over-modulated, the
            envelope folded and the recovered message was distorted, so the envelope detector needs μ &lt; 1, and it
            cannot demodulate DSB-SC.
          </Note>
        </>
      ),
      questions: ["r-how", "r-components", "p-noise", "i-cheap", "i-power"],
    },
    {
      id: "f-sheet",
      kind: "summary",
      title: "The lab sheet's questions",
      body: (
        <>
          <p>
            The four questions of the lab sheet and the MATLAB part, with the answers you demonstrated on the bench.
          </p>
          <Note tone="hardware" title="MATLAB values">
            The MATLAB listing uses its own numbers: carrier 600 Hz, message 20 Hz, Ec = 20, Em = 5 (so μ = 0.25),
            sampled at 4096 Hz. Do not mix them with the trainer&rsquo;s 100 kHz and 2 kHz.
          </Note>
        </>
      ),
      questions: ["m-q1", "m-q2", "m-q3", "m-q4", "m-matlab"],
    },
  ],
};

const exam: Section = {
  id: "exam",
  title: "Final oral exam preparation",
  steps: [
    {
      id: "exam-bank",
      kind: "exam",
      title: "Lab 3: Final Oral Exam Preparation",
      body: (
        <p>
          Every question for this lab in one place, grouped by where it comes from. Read the short answer aloud until
          you can give it without looking; open the explanation when you want the reasoning behind it.
        </p>
      ),
    },
  ],
};

const guide: Guide = {
  labId: 3,
  title: "Amplitude Demodulation",
  sections: [theory, transmitter, second, third, compare, overmod, wrapUp, exam],
  questions: QUESTIONS,
  bank: BANK,
};

export default guide;
